// Edge Function: Remote config for client telemetry
//
// Returns a static JSON config that controls client-side telemetry behavior.
// Changing a value here requires `supabase functions deploy app-config` —
// takes seconds, reversible in seconds, no App Store review.
//
// verify_jwt is OFF for this function so logged-out clients can read config
// on app boot. The payload contains no secrets — only feature flags.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

// ── CONFIG (edit and redeploy to change client behavior) ────────────────────
const CONFIG = {
  telemetry_enabled: false,   // master switch — flip to true when ready to measure
  telemetry_rate: 0,          // 0..1 — deterministic cohort by hash(userId) < rate
  telemetry_sink: "edge",     // "edge" (POST to telemetry-ingest) | "console" (dev only)
  telemetry_allowlist: [] as string[], // optional userId hashes for internal testing
  telemetry_flush_interval_ms: 60_000,
  telemetry_flush_batch_size: 30,
  telemetry_max_buffer: 500,
  config_version: 1,
};
// ────────────────────────────────────────────────────────────────────────────

Deno.serve((req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  return new Response(JSON.stringify(CONFIG), {
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=300", // 5 min CDN cache
    },
    status: 200,
  });
});
