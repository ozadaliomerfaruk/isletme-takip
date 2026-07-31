import {
  getBearerToken,
  guardPostRequest,
  guardServiceRoleWorkerRequest,
  isServiceRoleBearer,
} from "./workerAuth.ts";

const corsHeaders = { "Access-Control-Allow-Origin": "*" };
const serviceRoleKey = "service-role-test-token";
const projectRef = "test-project";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test("service-role worker guard accepts only POST with exact Bearer token", () => {
  const accepted = new Request("https://example.test/worker", {
    method: "POST",
    headers: { Authorization: `Bearer ${serviceRoleKey}` },
  });
  assert(
    guardServiceRoleWorkerRequest(accepted, corsHeaders, serviceRoleKey) ===
      null,
    "exact service-role Bearer request should pass",
  );
  assert(
    isServiceRoleBearer(accepted, serviceRoleKey),
    "exact service-role token should be recognized",
  );

  const userJwt = new Request("https://example.test/worker", {
    method: "POST",
    headers: { Authorization: "Bearer ordinary-user-jwt" },
  });
  const userJwtResponse = guardServiceRoleWorkerRequest(
    userJwt,
    corsHeaders,
    serviceRoleKey,
  );
  assert(userJwtResponse?.status === 401, "ordinary user JWT must be rejected");

  const malformed = new Request("https://example.test/worker", {
    method: "POST",
    headers: { Authorization: `Bearer  ${serviceRoleKey}` },
  });
  assert(
    getBearerToken(malformed) === null,
    "malformed Bearer header must fail",
  );
});

Deno.test("gateway-verified legacy service_role JWT is narrowed by project claims", () => {
  const encode = (value: Record<string, unknown>) =>
    btoa(JSON.stringify(value))
      .replaceAll("+", "-")
      .replaceAll("/", "_")
      .replaceAll("=", "");
  const legacyToken = `${encode({ alg: "HS256", typ: "JWT" })}.${
    encode({ role: "service_role", ref: projectRef, iss: "supabase" })
  }.gateway-validated-signature`;
  const accepted = new Request("https://example.test/worker", {
    method: "POST",
    headers: { Authorization: `Bearer ${legacyToken}` },
  });
  assert(
    isServiceRoleBearer(accepted, serviceRoleKey, projectRef),
    "same-project gateway-verified legacy service role should pass",
  );
  assert(
    !isServiceRoleBearer(accepted, serviceRoleKey, "other-project"),
    "cross-project legacy service role must fail",
  );

  for (const role of ["authenticated", "anon"]) {
    const userToken = `${encode({ alg: "HS256", typ: "JWT" })}.${
      encode({ role, ref: projectRef, iss: "supabase" })
    }.gateway-validated-signature`;
    const userRequest = new Request("https://example.test/worker", {
      method: "POST",
      headers: { Authorization: `Bearer ${userToken}` },
    });
    assert(
      !isServiceRoleBearer(userRequest, serviceRoleKey, projectRef),
      `${role} JWT must not pass the service-role claim guard`,
    );
  }
});

Deno.test("worker method guard rejects non-POST without reading a body", () => {
  const getRequest = new Request("https://example.test/worker", {
    method: "GET",
    headers: { Authorization: `Bearer ${serviceRoleKey}` },
  });
  const response = guardPostRequest(getRequest, corsHeaders);
  assert(response?.status === 405, "GET must return 405");
  assert(
    response?.headers.get("allow") === "OPTIONS, POST",
    "Allow header missing",
  );
});

Deno.test("worker guard fails closed when service-role secret is unavailable", () => {
  const request = new Request("https://example.test/worker", {
    method: "POST",
    headers: { Authorization: `Bearer ${serviceRoleKey}` },
  });
  const response = guardServiceRoleWorkerRequest(request, corsHeaders, "");
  assert(response?.status === 503, "missing worker secret must return 503");
});
