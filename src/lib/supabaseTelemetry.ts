// Client telemetry layer — passive observation around supabase-js.
//
// Hard rules (plan §5.1):
//  1. MUST NEVER throw (every call site wrapped in try/catch that swallows).
//  2. MUST NEVER alter the response — return the original resolved value by identity.
//  3. MUST NEVER block the UI thread (flushing is batched/scheduled).
//  4. MUST fall back to raw supabase-js on any anomaly; 3 consecutive observer throws → self-disable.
//
// Strategy: wrap ONLY `.then` on query builders (passive observation). Every other
// builder method (`.select`, `.eq`, `.single`, `.throwOnError`, etc.) is untouched —
// we return the SAME builder instance so chaining and identity semantics are preserved.

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getRemoteConfig,
  isInCohort,
  type RemoteConfig,
} from "./remoteConfig";

export type TelemetryOp =
  | "select"
  | "insert"
  | "update"
  | "upsert"
  | "delete"
  | "rpc"
  | "function";

export type TelemetryTriggerType =
  | "mount"
  | "observer_added"
  | "refetch_mount"
  | "refetch_focus"
  | "refetch_reconnect"
  | "invalidation"
  | "manual"
  | "unknown";

export type TelemetryResultSizeCategory = "small" | "medium" | "large";

export interface ClientSample {
  source: "client";
  kind: "sb";
  t: number;
  t_client: number;
  t_server?: number;
  table: string;
  op: TelemetryOp;
  ms: number;
  rows: number;
  ok: boolean;
  status?: number;
  query_purpose: string;
  query_key?: string;
  trigger_type?: TelemetryTriggerType;
  result_size_category: TelemetryResultSizeCategory;
}

export interface ClientRQSample {
  source: "client";
  kind: "rq";
  t: number;
  query_key: string;
  query_purpose: string;
  trigger_type: TelemetryTriggerType;
  observers: number;
  ms?: number;
  result?: "success" | "error";
  result_size_category?: TelemetryResultSizeCategory;
}

type AnySample = ClientSample | ClientRQSample | { kind: string; [k: string]: unknown };

// ---------- query_purpose context (AsyncLocalStorage-style ref) ----------

interface PurposeContext {
  purpose: string;
  triggerType?: TelemetryTriggerType;
  queryKey?: string;
}

let currentContext: PurposeContext | null = null;

export function runWithPurpose<T>(ctx: PurposeContext, fn: () => T): T {
  const prev = currentContext;
  currentContext = ctx;
  try {
    return fn();
  } finally {
    currentContext = prev;
  }
}

export function setPurpose(ctx: PurposeContext): void {
  currentContext = ctx;
}

export function clearPurpose(): void {
  currentContext = null;
}

// ---------- sink + sampling ----------

const MAX_OBSERVER_CONSECUTIVE_THROWS = 3;
let observerThrowStreak = 0;
let selfDisabled = false;

let cachedConfig: RemoteConfig | null = null;
let cohortDecision: boolean | null = null;
let currentUserId: string | null = null;

export function setTelemetryUserId(userId: string | null): void {
  if (userId !== currentUserId) {
    currentUserId = userId;
    cohortDecision = null;
  }
}

async function shouldSample(): Promise<boolean> {
  if (selfDisabled) return false;
  try {
    if (!cachedConfig) cachedConfig = await getRemoteConfig();
    if (!cachedConfig?.telemetry_enabled) return false;
    if (cohortDecision === null) {
      cohortDecision = isInCohort(currentUserId, cachedConfig);
    }
    return cohortDecision;
  } catch {
    return false;
  }
}

let buffer: AnySample[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleFlush(): void {
  if (flushTimer) return;
  const interval = cachedConfig?.telemetry_flush_interval_ms ?? 60_000;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flush();
  }, interval);
}

export function enqueueSample(sample: AnySample): void {
  try {
    if (selfDisabled) return;
    const max = cachedConfig?.telemetry_max_buffer ?? 500;
    if (buffer.length >= max) {
      const dropped = buffer.length;
      buffer = buffer.slice(Math.floor(max / 2));
      buffer.push({ kind: "tele-drop", count: dropped });
    }
    buffer.push(sample);
    const batchSize = cachedConfig?.telemetry_flush_batch_size ?? 30;
    if (buffer.length >= batchSize) {
      setTimeout(() => void flush(), 0);
    } else {
      scheduleFlush();
    }
  } catch {
    /* swallow */
  }
}

async function flush(): Promise<void> {
  if (buffer.length === 0) return;
  const batch = buffer;
  buffer = [];
  try {
    const sink = cachedConfig?.telemetry_sink ?? "edge";
    if (sink === "console") {
      for (const s of batch) {
        try {
          console.log(JSON.stringify(s));
        } catch {
          /* swallow */
        }
      }
      return;
    }
    const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anonKey) return;
    await fetch(`${url}/functions/v1/telemetry-ingest`, {
      method: "POST",
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ samples: batch }),
      keepalive: true,
    }).catch(() => {
      /* swallow network errors */
    });
  } catch {
    /* swallow */
  }
}

// ---------- result size heuristic ----------

function categorizeSize(rows: number, selectStr?: string): TelemetryResultSizeCategory {
  const nested = selectStr ? (selectStr.match(/\(/g)?.length ?? 0) : 0;
  if (rows > 100 || nested >= 3) return "large";
  if (rows > 5 || nested >= 1) return "medium";
  return "small";
}

function rowCount(res: unknown): number {
  if (!res || typeof res !== "object") return 0;
  const data = (res as { data?: unknown }).data;
  if (Array.isArray(data)) return data.length;
  if (data === null || data === undefined) return 0;
  return 1;
}

// ---------- record a sample ----------

interface RecordInput {
  table: string;
  op: TelemetryOp;
  t0: number;
  res?: unknown;
  err?: unknown;
  selectStr?: string;
}

function record(input: RecordInput): void {
  try {
    const now = Date.now();
    const ms = now - input.t0;
    const rows = rowCount(input.res);
    const r = input.res as { error?: { message?: string }; status?: number } | undefined;
    const ok = !input.err && !r?.error;
    const ctx = currentContext;

    const sample: ClientSample = {
      source: "client",
      kind: "sb",
      t: now,
      t_client: now,
      table: input.table,
      op: input.op,
      ms,
      rows,
      ok,
      status: r?.status,
      query_purpose: ctx?.purpose ?? `${input.table}:unknown`,
      query_key: ctx?.queryKey,
      trigger_type: ctx?.triggerType,
      result_size_category: categorizeSize(rows, input.selectStr),
    };
    enqueueSample(sample);
    observerThrowStreak = 0;
  } catch {
    observerThrowStreak++;
    if (observerThrowStreak >= MAX_OBSERVER_CONSECUTIVE_THROWS) {
      selfDisabled = true;
      try {
        console.log(JSON.stringify({ kind: "tele-suicide", t: Date.now() }));
      } catch {
        /* swallow */
      }
    }
  }
}

// ---------- builder wrapping ----------

function attachThen<T extends object>(
  builder: T,
  info: { table: string; op: TelemetryOp }
): T {
  try {
    const qb = builder as T & { then?: (a?: unknown, b?: unknown) => unknown };
    const origThen = qb.then?.bind(qb);
    if (typeof origThen !== "function") return builder;

    // Track select() arg for size heuristic
    let selectStr: string | undefined;
    const qbAny = qb as unknown as { select?: (...a: unknown[]) => unknown };
    const origSelect = qbAny.select?.bind(qbAny);
    if (typeof origSelect === "function") {
      qbAny.select = (...args: unknown[]) => {
        if (typeof args[0] === "string") selectStr = args[0] as string;
        const r = origSelect(...args);
        // select() returns a new builder — wrap its .then too
        return attachThenWithSelect(r as object, info, () => selectStr);
      };
    }

    qb.then = ((onOk?: (v: unknown) => unknown, onErr?: (v: unknown) => unknown) => {
      const t0 = Date.now();
      return origThen(
        (res: unknown) => {
          void (async () => {
            if (await shouldSample()) record({ ...info, t0, res, selectStr });
          })();
          return onOk ? onOk(res) : res;
        },
        (err: unknown) => {
          void (async () => {
            if (await shouldSample()) record({ ...info, t0, err, selectStr });
          })();
          if (onErr) return onErr(err);
          return Promise.reject(err);
        }
      );
    }) as typeof qb.then;

    return qb;
  } catch {
    return builder;
  }
}

function attachThenWithSelect<T extends object>(
  builder: T,
  info: { table: string; op: TelemetryOp },
  getSelectStr: () => string | undefined
): T {
  try {
    const qb = builder as T & { then?: (a?: unknown, b?: unknown) => unknown };
    const origThen = qb.then?.bind(qb);
    if (typeof origThen !== "function") return builder;
    qb.then = ((onOk?: (v: unknown) => unknown, onErr?: (v: unknown) => unknown) => {
      const t0 = Date.now();
      return origThen(
        (res: unknown) => {
          void (async () => {
            if (await shouldSample())
              record({ ...info, t0, res, selectStr: getSelectStr() });
          })();
          return onOk ? onOk(res) : res;
        },
        (err: unknown) => {
          void (async () => {
            if (await shouldSample())
              record({ ...info, t0, err, selectStr: getSelectStr() });
          })();
          if (onErr) return onErr(err);
          return Promise.reject(err);
        }
      );
    }) as typeof qb.then;
    return qb;
  } catch {
    return builder;
  }
}

// ---------- public wrap ----------

export function withTelemetrySafe(client: SupabaseClient): SupabaseClient {
  try {
    const origFrom = client.from.bind(client) as SupabaseClient["from"];
    const origRpc = client.rpc.bind(client) as SupabaseClient["rpc"];

    (client as unknown as { from: SupabaseClient["from"] }).from = ((
      table: string
    ) => {
      const qb = origFrom(table);
      try {
        // Infer op from first mutating method; default 'select'
        const qbAny = qb as unknown as Record<string, unknown>;
        for (const op of ["insert", "update", "upsert", "delete"] as const) {
          const orig = qbAny[op] as ((...a: unknown[]) => unknown) | undefined;
          if (typeof orig === "function") {
            qbAny[op] = (...args: unknown[]) => {
              const next = orig.call(qb, ...args);
              return attachThen(next as object, { table, op });
            };
          }
        }
        return attachThen(qb as unknown as object, { table, op: "select" }) as ReturnType<
          SupabaseClient["from"]
        >;
      } catch {
        return qb;
      }
    }) as SupabaseClient["from"];

    (client as unknown as { rpc: SupabaseClient["rpc"] }).rpc = ((
      fn: string,
      args?: unknown,
      opts?: unknown
    ) => {
      const qb = origRpc(fn as never, args as never, opts as never);
      return attachThen(qb as unknown as object, { table: fn, op: "rpc" }) as ReturnType<
        SupabaseClient["rpc"]
      >;
    }) as SupabaseClient["rpc"];

    return client;
  } catch {
    return client;
  }
}

export const __telemetryInternals = {
  isSelfDisabled: () => selfDisabled,
  getBufferSize: () => buffer.length,
  flushNow: () => flush(),
};
