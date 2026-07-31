export const ACCOUNT_DELETION_STORAGE_BUCKET = "islem-photos";
export const ACCOUNT_DELETION_STORAGE_BATCH_SIZE = 100;
export const ACCOUNT_DELETION_MAX_STEPS = 2_000;

export type PendingDeletionJob = {
  user_id: string;
  isletme_id: string | null;
  business_name: string;
  scheduled_deletion_at: string;
};

export type CleanupPage = {
  job_state: "pending" | "cancelled" | "completed";
  business_exists: boolean;
  auth_user_exists: boolean;
  user_id: string;
  scheduled_deletion_at: string;
  paths: string[];
  remaining_count: number;
  transferred_count: number;
};

export type DeletionJobResult = {
  id: string;
  name: string;
  status: "deleted" | "skipped_active";
};

export type AccountDeletionDependencies = {
  prepareCleanupPage: (userId: string) => Promise<CleanupPage>;
  removeStorageObjects: (paths: string[]) => Promise<void>;
  revokeAppleCredential: (userId: string) => Promise<void>;
  deleteAuthUser: (userId: string) => Promise<void>;
  completeJob: (userId: string) => Promise<boolean>;
};

function assertCanonicalPage(
  job: PendingDeletionJob,
  page: CleanupPage
): void {
  if (
    page.user_id !== job.user_id ||
    page.scheduled_deletion_at !== job.scheduled_deletion_at
  ) {
    throw new Error("ACCOUNT_DELETE_JOB_IDENTITY_MISMATCH");
  }

  if (!Array.isArray(page.paths)) {
    throw new Error("ACCOUNT_DELETE_INVALID_STORAGE_PAGE");
  }

  if (
    !Number.isSafeInteger(page.remaining_count) ||
    page.remaining_count < page.paths.length ||
    !Number.isSafeInteger(page.transferred_count) ||
    page.transferred_count < 0
  ) {
    throw new Error("ACCOUNT_DELETE_INVALID_STORAGE_COUNTS");
  }

  if (
    page.paths.length > ACCOUNT_DELETION_STORAGE_BATCH_SIZE ||
    page.paths.some((path) => typeof path !== "string" || path.length === 0)
  ) {
    throw new Error("ACCOUNT_DELETE_INVALID_STORAGE_PATHS");
  }
}

/**
 * Processes one durable deletion job.
 *
 * The database owns all authorization/invariant checks and returns a bounded
 * Storage cleanup page. Object bytes are removed only through the Storage API.
 * The durable job survives an Auth cascade, so a crash after deleteUser can be
 * retried and can never be reported as deleted without postconditions.
 */
export async function processAccountDeletionJob(
  job: PendingDeletionJob,
  dependencies: AccountDeletionDependencies
): Promise<DeletionJobResult> {
  let authDeleteRequested = false;
  let appleRevocationChecked = false;

  for (let step = 0; step < ACCOUNT_DELETION_MAX_STEPS; step += 1) {
    const page = await dependencies.prepareCleanupPage(job.user_id);
    assertCanonicalPage(job, page);

    if (page.job_state === "cancelled") {
      return {
        id: job.user_id,
        name: job.business_name,
        status: "skipped_active",
      };
    }

    // Another concurrent cron invocation may have completed the same durable
    // job after this invocation listed it. "completed" is itself a verified
    // database postcondition, so treating it idempotently is safe.
    if (page.job_state === "completed") {
      return {
        id: job.user_id,
        name: job.business_name,
        status: "deleted",
      };
    }

    if (page.paths.length > 0) {
      await dependencies.removeStorageObjects(page.paths);
      continue;
    }

    if (page.remaining_count !== 0) {
      throw new Error("ACCOUNT_DELETE_STORAGE_PAGE_EMPTY_WITH_REMAINDER");
    }

    if (page.auth_user_exists) {
      if (job.isletme_id !== null && !page.business_exists) {
        throw new Error("ACCOUNT_DELETE_BUSINESS_MISSING_BEFORE_AUTH_USER");
      }
      if (authDeleteRequested) {
        throw new Error("ACCOUNT_DELETE_AUTH_CASCADE_NOT_OBSERVED");
      }

      if (!appleRevocationChecked) {
        await dependencies.revokeAppleCredential(job.user_id);
        appleRevocationChecked = true;
      }

      authDeleteRequested = true;
      await dependencies.deleteAuthUser(job.user_id);
      // Re-enter the canonical database preflight. It verifies the Auth user
      // and business cascade, and catches any Storage object created in the
      // small interval around deleteUser before completion is allowed.
      continue;
    }

    if (page.business_exists) {
      throw new Error("ACCOUNT_DELETE_AUTH_MISSING_BEFORE_CASCADE");
    }

    const completed = await dependencies.completeJob(job.user_id);
    if (completed !== true) {
      throw new Error("ACCOUNT_DELETE_POSTCONDITION_NOT_CONFIRMED");
    }

    return {
      id: job.user_id,
      name: job.business_name,
      status: "deleted",
    };
  }

  throw new Error("ACCOUNT_DELETE_MAX_STEPS_EXCEEDED");
}
