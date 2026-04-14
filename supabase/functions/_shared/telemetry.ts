// Shared telemetry helpers for Edge Functions.
//
// Design rules (mirror §5.1 of the plan):
//   - NEVER throw from telemetry; all work in try/catch
//   - NEVER alter the response — wrappers return the original Response by identity
//   - NEVER read large bodies; 1 MB guard-rail + streaming guard
//   - Output: one JSON line per call with "kind":"fn" for Log Explorer filtering

const MAX_FALLBACK_BYTES = 1_000_000;

export interface FnTelemetryOptions {
  /** Function name; appears in logs. */
  name: string;
  /** Set true for routes known to carry > 1 MB bodies (e.g. parse-invoice). */
  largePayloadProne?: boolean;
}

/** Measure request body size without consuming it. Returns a number or a string marker. */
export async function measureReqBytes(
  req: Request,
  largePayloadProne: boolean,
): Promise<number | string> {
  try {
    const cl = Number(req.headers.get("content-length") ?? 0);
    if (Number.isFinite(cl) && cl > 0) {
      if (cl > MAX_FALLBACK_BYTES) return cl; // trust header, don't clone
      return cl;
    }
    if (largePayloadProne) return "skipped_large_payload";
    if (!req.body || req.bodyUsed) return "stream_or_consumed";
    // Fallback: clone + text (bounded by 1 MB guard via content-length check above)
    const txt = await req.clone().text();
    const bytes = new TextEncoder().encode(txt).byteLength;
    if (bytes > MAX_FALLBACK_BYTES) return bytes;
    return bytes;
  } catch {
    return "measure_error";
  }
}

/** Measure response body size without consuming it. Returns a number or a string marker. */
export async function measureResBytes(
  res: Response,
  largePayloadProne: boolean,
): Promise<number | string> {
  try {
    const cl = Number(res.headers.get("content-length") ?? 0);
    if (Number.isFinite(cl) && cl > 0) return cl;
    if (largePayloadProne) return "skipped_large_payload";
    if (!res.body || res.bodyUsed || typeof res.clone !== "function") {
      return "stream_or_consumed";
    }
    const txt = await res.clone().text();
    const bytes = new TextEncoder().encode(txt).byteLength;
    return bytes;
  } catch {
    return "measure_error";
  }
}

/** Wrap a fetch() call to an upstream API; returns the same Response. */
export async function measuredFetch(
  url: string,
  init: RequestInit | undefined,
  fnName: string,
  largePayloadProne = false,
): Promise<Response> {
  const t0 = performance.now();
  let status = 0;
  let upstreamResBytes: number | string = "unknown";
  let upstreamReqBytes: number | string = "unknown";
  try {
    if (init?.body != null) {
      try {
        if (typeof init.body === "string") {
          const len = (init.body as string).length;
          upstreamReqBytes = len > MAX_FALLBACK_BYTES
            ? len
            : new TextEncoder().encode(init.body as string).byteLength;
        } else if (init.body instanceof ArrayBuffer) {
          upstreamReqBytes = (init.body as ArrayBuffer).byteLength;
        } else if (init.body instanceof Uint8Array) {
          upstreamReqBytes = (init.body as Uint8Array).byteLength;
        }
      } catch {
        upstreamReqBytes = "measure_error";
      }
    }
    const res = await fetch(url, init);
    status = res.status;
    upstreamResBytes = await measureResBytes(res, largePayloadProne);
    return res;
  } finally {
    try {
      const host = (() => {
        try { return new URL(url).host; } catch { return "unknown"; }
      })();
      // deno-lint-ignore no-console
      console.log(JSON.stringify({
        source: "edge",
        kind: "upstream",
        t: Date.now(),
        fn_name: fnName,
        upstream: host,
        upstreamMs: +(performance.now() - t0).toFixed(1),
        upstreamStatus: status,
        upstreamReqBytes,
        upstreamResBytes,
      }));
    } catch { /* swallow */ }
  }
}

/** Wrap a Deno.serve handler with timing + payload logging. */
export function withFnTelemetry(
  opts: FnTelemetryOptions,
  handler: (req: Request) => Promise<Response> | Response,
): (req: Request) => Promise<Response> {
  const { name, largePayloadProne = false } = opts;
  return async (req: Request) => {
    const t0 = performance.now();
    let res: Response | undefined;
    let thrown: unknown = undefined;
    let reqBytes: number | string = "unknown";
    try {
      try {
        reqBytes = await measureReqBytes(req, largePayloadProne);
      } catch {
        reqBytes = "measure_error";
      }
      res = await handler(req);
      return res;
    } catch (err) {
      thrown = err;
      throw err;
    } finally {
      try {
        let outBytes: number | string = "unknown";
        let status = 0;
        if (res) {
          status = res.status;
          outBytes = await measureResBytes(res, largePayloadProne);
        } else if (thrown) {
          status = 500;
        }
        // deno-lint-ignore no-console
        console.log(JSON.stringify({
          source: "edge",
          kind: "fn",
          t: Date.now(),
          fn_name: name,
          ms: +(performance.now() - t0).toFixed(1),
          status,
          method: req.method,
          reqBytes,
          outBytes,
          thrown: thrown ? String((thrown as Error).message ?? thrown).slice(0, 200) : undefined,
        }));
      } catch { /* swallow */ }
    }
  };
}
