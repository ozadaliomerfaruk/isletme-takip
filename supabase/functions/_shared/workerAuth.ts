// Shared authorization helpers for privileged Edge Function workers.
//
// These functions deliberately perform request-method plus service-role Bearer
// checks. With verify_jwt=true, the gateway validates legacy JWT signatures first;
// this helper then requires either the exact injected key or same-project
// service_role/ref/iss claims. Callers must run the guard before parsing a request
// body or creating a service-role client.

const encoder = new TextEncoder();

export type CorsHeaders = Record<string, string>;

function jsonResponse(
  status: number,
  body: Record<string, unknown>,
  corsHeaders: CorsHeaders,
  extraHeaders: CorsHeaders = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      ...extraHeaders,
      "Content-Type": "application/json",
    },
  });
}

function timingSafeEqual(left: string, right: string): boolean {
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  const maxLength = Math.max(leftBytes.length, rightBytes.length);
  let mismatch = leftBytes.length ^ rightBytes.length;

  for (let index = 0; index < maxLength; index += 1) {
    mismatch |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }

  return mismatch === 0;
}

function getProjectRef(
  supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "",
): string | null {
  try {
    const hostname = new URL(supabaseUrl).hostname;
    const projectRef = hostname.split(".")[0]?.trim();
    return projectRef || null;
  } catch {
    return null;
  }
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length !== 3 || !parts[1]) return null;

  try {
    const normalized = parts[1].replaceAll("-", "+").replaceAll("_", "/");
    const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
    const payload = JSON.parse(atob(padded));
    return payload && typeof payload === "object"
      ? payload as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

/**
 * Legacy JWTs are signature-validated by the Supabase gateway because every
 * caller keeps verify_jwt=true. The handler then narrows that already-verified
 * token to this project's service_role claim. The exact branch below is for the
 * injected legacy JWT; opaque `sb_secret_...` keys belong on `apikey` and need a
 * separate verify_jwt=false design if this worker is migrated in the future.
 */
function isGatewayVerifiedLegacyServiceRoleJwt(
  token: string,
  expectedProjectRef: string | null,
): boolean {
  if (!expectedProjectRef) return false;
  const payload = decodeJwtPayload(token);
  return payload?.role === "service_role" &&
    payload?.ref === expectedProjectRef &&
    payload?.iss === "supabase";
}

export function getBearerToken(req: Request): string | null {
  const authorization = req.headers.get("authorization");
  if (!authorization) return null;

  const match = /^Bearer ([^\s]+)$/i.exec(authorization);
  return match?.[1] ?? null;
}

export function methodNotAllowedResponse(
  corsHeaders: CorsHeaders,
  body: Record<string, unknown> = { success: false },
): Response {
  return jsonResponse(
    405,
    body,
    corsHeaders,
    { Allow: "OPTIONS, POST" },
  );
}

export function unauthorizedResponse(
  corsHeaders: CorsHeaders,
  body: Record<string, unknown> = { success: false },
): Response {
  return jsonResponse(
    401,
    body,
    corsHeaders,
    { "WWW-Authenticate": "Bearer" },
  );
}

export function serviceUnavailableResponse(
  corsHeaders: CorsHeaders,
  body: Record<string, unknown> = { success: false },
): Response {
  return jsonResponse(503, body, corsHeaders);
}

/** Returns a 405 response for every non-POST method; otherwise returns null. */
export function guardPostRequest(
  req: Request,
  corsHeaders: CorsHeaders,
  failureBody?: Record<string, unknown>,
): Response | null {
  return req.method === "POST"
    ? null
    : methodNotAllowedResponse(corsHeaders, failureBody);
}

/**
 * Accepts either the exact injected legacy JWT or a gateway-verified legacy
 * service_role JWT for the same project.
 */
export function isServiceRoleBearer(
  req: Request,
  serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  expectedProjectRef?: string | null,
): boolean {
  const token = getBearerToken(req);
  if (!serviceRoleKey || !token) return false;
  if (timingSafeEqual(token, serviceRoleKey)) return true;
  if (token.split(".").length !== 3) return false;
  return isGatewayVerifiedLegacyServiceRoleJwt(
    token,
    expectedProjectRef === undefined ? getProjectRef() : expectedProjectRef,
  );
}

/**
 * Fail-closed guard for privileged cron workers.
 *
 * Returns null only for POST + service-role Bearer requests accepted by the
 * exact-key or gateway-verified legacy-JWT branch.
 */
export function guardServiceRoleWorkerRequest(
  req: Request,
  corsHeaders: CorsHeaders,
  serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  failureBody?: Record<string, unknown>,
): Response | null {
  const methodError = guardPostRequest(req, corsHeaders, failureBody);
  if (methodError) return methodError;

  if (!serviceRoleKey) {
    console.error("SUPABASE_SERVICE_ROLE_KEY is not configured");
    return serviceUnavailableResponse(corsHeaders, failureBody);
  }

  return isServiceRoleBearer(req, serviceRoleKey)
    ? null
    : unauthorizedResponse(corsHeaders, failureBody);
}
