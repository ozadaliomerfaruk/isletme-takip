// Edge Function: Telemetry ingest sink
//
// Receives batched client telemetry samples and prints them to the function
// log (Supabase Log Explorer). Does NOT write to the database — keeps the
// schema untouched and keeps this function cheap + reversible.
//
// verify_jwt = true: only authenticated clients can send. This prevents
// random internet from spamming telemetry logs.
//
// Safety:
//   - hard payload cap (256 KB / request)
//   - each sample is clamped to whitelisted fields before logging
//   - never throws back to the client; returns 204 on bad input

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_PAYLOAD_BYTES = 256 * 1024;
const MAX_SAMPLES_PER_BATCH = 200;

// Per-user rate limiting (in-memory, resets on cold start)
const MAX_BATCHES_PER_MINUTE = 10;
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(userId: string): boolean {
  const now = Date.now();
  const bucket = rateBuckets.get(userId);
  if (!bucket || now >= bucket.resetAt) {
    rateBuckets.set(userId, { count: 1, resetAt: now + 60_000 });
    return false;
  }
  bucket.count++;
  return bucket.count > MAX_BATCHES_PER_MINUTE;
}

// Prevent unbounded memory growth — prune stale entries periodically
let lastPrune = Date.now();
function pruneIfNeeded() {
  const now = Date.now();
  if (now - lastPrune < 120_000) return; // every 2 min max
  lastPrune = now;
  for (const [key, bucket] of rateBuckets) {
    if (now >= bucket.resetAt) rateBuckets.delete(key);
  }
}

const ALLOWED_FIELDS = new Set<string>([
  "source", "kind", "t", "t_client", "t_server",
  "table", "op", "ms", "rows", "ok", "status",
  "query_key", "query_purpose", "trigger_type",
  "result_size_category", "observers", "result",
  "fn_name", "batch_id",
]);

function sanitize(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object") return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!ALLOWED_FIELDS.has(k)) continue;
    const t = typeof v;
    if (v === null || t === "string" || t === "number" || t === "boolean") {
      if (t === "string" && (v as string).length > 200) {
        out[k] = (v as string).slice(0, 200);
      } else {
        out[k] = v;
      }
    }
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response("method not allowed", { status: 405, headers: corsHeaders });
  }

  try {
    // Extract user ID from JWT for rate limiting (best-effort, no verification — JWT is already verified by Supabase)
    let userId = "anon";
    try {
      const auth = req.headers.get("authorization") ?? "";
      const token = auth.replace("Bearer ", "");
      const payload = token.split(".")[1];
      if (payload) {
        const decoded = JSON.parse(atob(payload));
        if (decoded.sub) userId = decoded.sub;
      }
    } catch { /* use "anon" */ }

    pruneIfNeeded();
    if (isRateLimited(userId)) {
      return new Response("too many requests", { status: 429, headers: corsHeaders });
    }

    const contentLength = Number(req.headers.get("content-length") ?? 0);
    if (contentLength > MAX_PAYLOAD_BYTES) {
      return new Response("payload too large", { status: 413, headers: corsHeaders });
    }

    const body = await req.json().catch(() => null);
    if (!body || !Array.isArray((body as { samples?: unknown[] }).samples)) {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const samples = (body as { samples: unknown[] }).samples.slice(0, MAX_SAMPLES_PER_BATCH);
    const batchId = (body as { batch_id?: string }).batch_id ?? "";
    const receivedAt = Date.now();

    for (const raw of samples) {
      const s = sanitize(raw);
      if (!s) continue;
      s.batch_id = batchId;
      s.t_server = receivedAt;
      // one JSON line per sample — easy to filter in Log Explorer
      // deno-lint-ignore no-console
      console.log(JSON.stringify(s));
    }

    return new Response(null, { status: 204, headers: corsHeaders });
  } catch {
    // NEVER propagate errors — telemetry must not break anything
    return new Response(null, { status: 204, headers: corsHeaders });
  }
});
