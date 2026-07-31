import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { withFnTelemetry } from "../_shared/telemetry.ts";
import { guardServiceRoleWorkerRequest } from "../_shared/workerAuth.ts";
import {
  ACCOUNT_DELETION_STORAGE_BUCKET,
  type CleanupPage,
  type PendingDeletionJob,
  processAccountDeletionJob,
} from "./accountDeletionWorker.ts";
import {
  decryptAppleRefreshToken,
  loadAppleServerConfig,
  revokeAppleRefreshToken,
} from "../_shared/appleRevocation.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type WorkerResult = {
  id: string;
  name: string;
  status: "deleted" | "skipped_active" | "error";
  error?: string;
};

type RpcError = {
  code?: string;
  message?: string;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Bilinmeyen hata";
}

function isPostDueActivity(error: RpcError | null): boolean {
  return Boolean(
    error?.message?.includes("ACCOUNT_DELETE_POST_DUE_ACTIVITY") ||
      error?.message?.includes("ACCOUNT_DELETE_STATE_CHANGED")
  );
}

Deno.serve(
  withFnTelemetry({
    name: "delete-scheduled-accounts",
    // Telemetry must not read an untrusted chunked body before authorization.
    largePayloadProne: true,
  }, async (req) => {
      if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
      }

      const authError = guardServiceRoleWorkerRequest(req, corsHeaders);
      if (authError) return authError;

      try {
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

        const now = new Date().toISOString();
        const resultsByUser = new Map<string, WorkerResult>();

        // First claim every currently due business. The RPC rechecks the due
        // timestamp, post-due activity and exact-one-owned-business invariant
        // under a row lock before it creates a durable job.
        const { data: dueBusinesses, error: dueError } = await supabaseAdmin
          .from("isletmeler")
          .select("id, user_id, name")
          .lte("scheduled_deletion_at", now)
          .not("scheduled_deletion_at", "is", null);

        if (dueError) {
          throw new Error(`Due business fetch failed: ${dueError.message}`);
        }

        for (const business of dueBusinesses ?? []) {
          const { error: claimError } = await supabaseAdmin.rpc(
            "claim_scheduled_account_deletion_v1",
            { p_isletme_id: business.id }
          );

          if (!claimError) continue;

          if (isPostDueActivity(claimError)) {
            resultsByUser.set(business.user_id, {
              id: business.user_id,
              name: business.name,
              status: "skipped_active",
            });
            continue;
          }

          resultsByUser.set(business.user_id, {
            id: business.user_id,
            name: business.name,
            status: "error",
            error: `claim-failed: ${claimError.message}`,
          });
        }

        // RPC-created requests are already durable before they are due. This
        // claim step covers both owned-business requests and shared-only
        // accounts whose isletme_id is intentionally null.
        const { error: dueRequestsError } = await supabaseAdmin.rpc(
          "claim_due_account_deletion_requests_v1"
        );
        if (dueRequestsError) {
          throw new Error(
            `Due deletion request claim failed: ${dueRequestsError.message}`
          );
        }

        // Jobs remain available after auth.users cascades the business row.
        // This makes a crash or lost HTTP response after deleteUser retry-safe.
        const { data: pendingJobsData, error: pendingJobsError } =
          await supabaseAdmin.rpc("list_pending_account_deletion_jobs_v1");

        if (pendingJobsError) {
          throw new Error(
            `Pending deletion jobs fetch failed: ${pendingJobsError.message}`
          );
        }

        const pendingJobs = (pendingJobsData ?? []) as PendingDeletionJob[];

        for (const job of pendingJobs) {
          try {
            const result = await processAccountDeletionJob(job, {
              prepareCleanupPage: async (userId) => {
                const { data, error } = await supabaseAdmin.rpc(
                  "prepare_account_deletion_storage_v1",
                  { p_user_id: userId }
                );
                if (error) {
                  throw new Error(`storage-preflight-failed: ${error.message}`);
                }

                const page = Array.isArray(data) ? data[0] : data;
                if (!page) {
                  throw new Error("ACCOUNT_DELETE_STORAGE_PREFLIGHT_EMPTY");
                }
                return page as CleanupPage;
              },

              removeStorageObjects: async (paths) => {
                const { error } = await supabaseAdmin.storage
                  .from(ACCOUNT_DELETION_STORAGE_BUCKET)
                  .remove(paths);
                if (error) {
                  throw new Error(`storage-remove-failed: ${error.message}`);
                }
              },

              revokeAppleCredential: async (userId) => {
                const { data, error } = await supabaseAdmin.rpc(
                  "get_apple_revocation_credential_v1",
                  { p_user_id: userId }
                );
                if (error) {
                  throw new Error(
                    `apple-credential-fetch-failed: ${error.message}`
                  );
                }

                const credential = Array.isArray(data) ? data[0] : data;
                if (!credential || credential.revoked_at) {
                  // No stored credential is the documented TN3194 legacy
                  // fallback. The new client shows manual revoke guidance
                  // before it acknowledges/schedules this path.
                  return;
                }

                try {
                  const config = loadAppleServerConfig();
                  const refreshToken = await decryptAppleRefreshToken(
                    credential.encrypted_refresh_token,
                    credential.encryption_iv,
                    config
                  );
                  await revokeAppleRefreshToken(refreshToken, config);

                  const { data: marked, error: markError } =
                    await supabaseAdmin.rpc(
                      "mark_apple_revocation_attempt_v1",
                      {
                        p_user_id: userId,
                        p_revoked: true,
                        p_error: null,
                      }
                    );
                  if (markError || marked !== true) {
                    throw new Error(
                      `APPLE_REVOCATION_MARK_FAILED:${
                        markError?.message ?? "unknown"
                      }`
                    );
                  }
                } catch (revokeError) {
                  const message = errorMessage(revokeError);
                  await supabaseAdmin.rpc(
                    "mark_apple_revocation_attempt_v1",
                    {
                      p_user_id: userId,
                      p_revoked: false,
                      p_error: message,
                    }
                  );
                  // A stored credential is never silently discarded. Network,
                  // key rotation or Apple failures remain retryable and block
                  // Auth deletion until revocation succeeds.
                  throw new Error(`apple-revoke-failed: ${message}`);
                }
              },

              deleteAuthUser: async (userId) => {
                const { error } =
                  await supabaseAdmin.auth.admin.deleteUser(userId);
                if (
                  error &&
                  error.code !== "user_not_found" &&
                  error.status !== 404
                ) {
                  throw new Error(`auth-delete-failed: ${error.message}`);
                }
              },

              completeJob: async (userId) => {
                const { data, error } = await supabaseAdmin.rpc(
                  "complete_account_deletion_job_v1",
                  { p_user_id: userId }
                );
                if (error) {
                  throw new Error(`completion-check-failed: ${error.message}`);
                }
                return data === true;
              },
            });

            resultsByUser.set(job.user_id, result);
          } catch (error) {
            const message = errorMessage(error);
            console.error(
              `Hesap silme hatası (${job.business_name}/${job.isletme_id}):`,
              message
            );
            resultsByUser.set(job.user_id, {
              id: job.user_id,
              name: job.business_name,
              status: "error",
              error: message,
            });
          }
        }

        const results = [...resultsByUser.values()];
        const successCount = results.filter(
          (result) => result.status === "deleted"
        ).length;
        const errorCount = results.filter(
          (result) => result.status === "error"
        ).length;
        const skippedCount = results.filter(
          (result) => result.status === "skipped_active"
        ).length;

        return new Response(
          JSON.stringify({
            message: `${successCount} hesap silindi, ${skippedCount} aktif atlandı, ${errorCount} hata`,
            deleted: successCount,
            skipped_active: skippedCount,
            errors: errorCount,
            results,
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      } catch (error) {
        const message = errorMessage(error);
        console.error("Function hatası:", message);
        return new Response(JSON.stringify({ error: message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }
  )
);
