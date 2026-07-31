import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { withFnTelemetry } from "../_shared/telemetry.ts";
import {
  decodeAppleIdTokenPayload,
  encryptAppleRefreshToken,
  exchangeAppleAuthorizationCode,
  isAppleAudience,
  loadAppleServerConfig,
} from "../_shared/appleRevocation.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(
  body: Record<string, unknown>,
  status = 200
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function bearerToken(req: Request): string | null {
  const authorization = req.headers.get("authorization") ?? "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "APPLE_REVOCATION_FAILED";
}

function appleIdentitySubjects(user: {
  identities?: Array<{
    identity_id?: string;
    id?: string;
    provider?: string;
    identity_data?: Record<string, unknown>;
  }>;
}): string[] {
  const identity = user.identities?.find(
    (candidate) => candidate.provider === "apple"
  );
  if (!identity) return [];

  return [
    identity.identity_id,
    identity.id,
    typeof identity.identity_data?.sub === "string"
      ? identity.identity_data.sub
      : undefined,
    typeof identity.identity_data?.provider_id === "string"
      ? identity.identity_data.provider_id
      : undefined,
  ].filter((value): value is string => Boolean(value));
}

Deno.serve(
  withFnTelemetry(
    { name: "apple-revocation-credential" },
    async (req) => {
      if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
      }
      if (req.method !== "POST") {
        return json({ code: "METHOD_NOT_ALLOWED" }, 405);
      }

      const token = bearerToken(req);
      if (!token) {
        return json({ code: "NOT_AUTHENTICATED" }, 401);
      }

      const supabaseAdmin = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
        {
          auth: {
            autoRefreshToken: false,
            persistSession: false,
          },
        }
      );

      const { data: userData, error: userError } =
        await supabaseAdmin.auth.getUser(token);
      if (userError || !userData.user) {
        return json({ code: "NOT_AUTHENTICATED" }, 401);
      }

      let body: { authorization_code?: unknown };
      try {
        body = await req.json();
      } catch {
        return json({ code: "INVALID_BODY" }, 400);
      }

      if (
        typeof body.authorization_code !== "string"
        || body.authorization_code.length < 8
        || body.authorization_code.length > 4096
      ) {
        return json({ code: "INVALID_AUTHORIZATION_CODE" }, 400);
      }

      try {
        const config = loadAppleServerConfig();
        const subjects = appleIdentitySubjects(userData.user);
        if (subjects.length === 0) {
          return json({ code: "APPLE_IDENTITY_NOT_LINKED" }, 403);
        }

        const tokenResponse = await exchangeAppleAuthorizationCode(
          body.authorization_code,
          config
        );
        const appleClaims = decodeAppleIdTokenPayload(tokenResponse.idToken);
        if (
          typeof appleClaims.sub !== "string"
          || !subjects.includes(appleClaims.sub)
          || !isAppleAudience(appleClaims.aud, config.clientId)
        ) {
          return json({ code: "APPLE_IDENTITY_MISMATCH" }, 403);
        }

        const encrypted = await encryptAppleRefreshToken(
          tokenResponse.refreshToken,
          config
        );
        const { data, error } = await supabaseAdmin.rpc(
          "store_apple_revocation_credential_v1",
          {
            p_user_id: userData.user.id,
            p_encrypted_refresh_token: encrypted.ciphertext,
            p_encryption_iv: encrypted.iv,
          }
        );
        if (error || data !== true) {
          throw new Error(
            `APPLE_REVOCATION_STORE_FAILED:${error?.message ?? "unknown"}`
          );
        }

        return json({ status: "stored" });
      } catch (error) {
        const message = errorMessage(error);
        const configurationMissing = message.startsWith(
          "APPLE_REVOCATION_CONFIG_MISSING:"
        ) || message === "APPLE_REVOCATION_INVALID_ENCRYPTION_KEY";

        // Authorization code and token material are deliberately omitted from
        // logs and responses.
        console.error(
          configurationMissing
            ? "Apple revocation credential capture is not configured"
            : `Apple revocation credential capture failed: ${message}`
        );
        return json(
          {
            code: configurationMissing
              ? "APPLE_REVOCATION_NOT_CONFIGURED"
              : "APPLE_REVOCATION_CAPTURE_FAILED",
            manual_revoke_required: true,
          },
          configurationMissing ? 503 : 502
        );
      }
    }
  )
);
