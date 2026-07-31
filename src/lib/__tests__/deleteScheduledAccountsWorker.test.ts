import fs from 'fs';
import path from 'path';

import {
  type AccountDeletionDependencies,
  type CleanupPage,
  type PendingDeletionJob,
  processAccountDeletionJob,
} from '../../../supabase/functions/delete-scheduled-accounts/accountDeletionWorker';

const ROOT = path.resolve(__dirname, '../../..');
const read = (relativePath: string) =>
  fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

const migration = read(
  'supabase/migrations/20260731051043_scheduled_account_deletion_storage_handoff.sql'
);
const edgeFunction = read(
  'supabase/functions/delete-scheduled-accounts/index.ts'
);

const job: PendingDeletionJob = {
  isletme_id: '11111111-1111-4111-8111-111111111111',
  user_id: '22222222-2222-4222-8222-222222222222',
  business_name: 'Test',
  scheduled_deletion_at: '2026-07-31T00:00:00.000Z',
};

function page(
  overrides: Partial<CleanupPage> = {}
): CleanupPage {
  return {
    job_state: 'pending',
    business_exists: true,
    auth_user_exists: true,
    user_id: job.user_id,
    scheduled_deletion_at: job.scheduled_deletion_at,
    paths: [],
    remaining_count: 0,
    transferred_count: 0,
    ...overrides,
  };
}

function dependencies(
  overrides: Partial<AccountDeletionDependencies> = {}
): AccountDeletionDependencies {
  return {
    prepareCleanupPage: jest.fn(async () =>
      page({
        business_exists: false,
        auth_user_exists: false,
      })
    ),
    removeStorageObjects: jest.fn(async () => undefined),
    revokeAppleCredential: jest.fn(async () => undefined),
    deleteAuthUser: jest.fn(async () => undefined),
    completeJob: jest.fn(async () => true),
    ...overrides,
  };
}

describe('delete-scheduled-accounts durable worker', () => {
  it('removes bounded Storage pages, deletes Auth, rechecks residue, then reports deleted', async () => {
    const prepareCleanupPage = jest
      .fn<Promise<CleanupPage>, [string]>()
      .mockResolvedValueOnce(
        page({
          paths: ['business/one.webp', 'business/two.webp'],
          remaining_count: 2,
        })
      )
      .mockResolvedValueOnce(page())
      .mockResolvedValueOnce(
        page({
          business_exists: false,
          auth_user_exists: false,
          paths: ['business/race.webp'],
          remaining_count: 1,
        })
      )
      .mockResolvedValueOnce(
        page({
          business_exists: false,
          auth_user_exists: false,
        })
      );
    const removeStorageObjects = jest.fn(async () => undefined);
    const revokeAppleCredential = jest.fn(async () => undefined);
    const deleteAuthUser = jest.fn(async () => undefined);
    const completeJob = jest.fn(async () => true);

    const result = await processAccountDeletionJob(
      job,
      dependencies({
        prepareCleanupPage,
        removeStorageObjects,
        revokeAppleCredential,
        deleteAuthUser,
        completeJob,
      })
    );

    expect(result.status).toBe('deleted');
    expect(removeStorageObjects.mock.calls).toEqual([
      [['business/one.webp', 'business/two.webp']],
      [['business/race.webp']],
    ]);
    expect(deleteAuthUser).toHaveBeenCalledTimes(1);
    expect(revokeAppleCredential).toHaveBeenCalledTimes(1);
    expect(
      revokeAppleCredential.mock.invocationCallOrder[0]
    ).toBeLessThan(deleteAuthUser.mock.invocationCallOrder[0]);
    expect(completeJob).toHaveBeenCalledTimes(1);
    expect(prepareCleanupPage).toHaveBeenCalledTimes(4);
  });

  it('never calls Auth deletion or completion when Storage API cleanup fails', async () => {
    const deleteAuthUser = jest.fn(async () => undefined);
    const completeJob = jest.fn(async () => true);

    await expect(
      processAccountDeletionJob(
        job,
        dependencies({
          prepareCleanupPage: jest.fn(async () =>
            page({
              paths: ['business/photo.webp'],
              remaining_count: 1,
            })
          ),
          removeStorageObjects: jest.fn(async () => {
            throw new Error('storage unavailable');
          }),
          deleteAuthUser,
          completeJob,
        })
      )
    ).rejects.toThrow('storage unavailable');

    expect(deleteAuthUser).not.toHaveBeenCalled();
    expect(completeJob).not.toHaveBeenCalled();
  });

  it('never reports deleted when Auth deletion fails', async () => {
    const completeJob = jest.fn(async () => true);

    await expect(
      processAccountDeletionJob(
        job,
        dependencies({
          prepareCleanupPage: jest.fn(async () => page()),
          deleteAuthUser: jest.fn(async () => {
            throw new Error('auth unavailable');
          }),
          completeJob,
        })
      )
    ).rejects.toThrow('auth unavailable');

    expect(completeJob).not.toHaveBeenCalled();
  });

  it('never deletes Auth when a stored Apple credential cannot be revoked', async () => {
    const deleteAuthUser = jest.fn(async () => undefined);
    const completeJob = jest.fn(async () => true);

    await expect(
      processAccountDeletionJob(
        job,
        dependencies({
          prepareCleanupPage: jest.fn(async () => page()),
          revokeAppleCredential: jest.fn(async () => {
            throw new Error('apple unavailable');
          }),
          deleteAuthUser,
          completeJob,
        })
      )
    ).rejects.toThrow('apple unavailable');

    expect(deleteAuthUser).not.toHaveBeenCalled();
    expect(completeJob).not.toHaveBeenCalled();
  });

  it('deletes a shared-only/no-owned Auth account without requiring a business row', async () => {
    const sharedOnlyJob: PendingDeletionJob = {
      ...job,
      isletme_id: null,
      business_name: 'Account',
    };
    const prepareCleanupPage = jest
      .fn<Promise<CleanupPage>, [string]>()
      .mockResolvedValueOnce(
        page({
          business_exists: false,
          auth_user_exists: true,
        })
      )
      .mockResolvedValueOnce(
        page({
          business_exists: false,
          auth_user_exists: false,
        })
      );
    const deleteAuthUser = jest.fn(async () => undefined);
    const completeJob = jest.fn(async () => true);

    const result = await processAccountDeletionJob(
      sharedOnlyJob,
      dependencies({
        prepareCleanupPage,
        deleteAuthUser,
        completeJob,
      })
    );

    expect(result).toEqual({
      id: sharedOnlyJob.user_id,
      name: 'Account',
      status: 'deleted',
    });
    expect(prepareCleanupPage).toHaveBeenCalledWith(sharedOnlyJob.user_id);
    expect(deleteAuthUser).toHaveBeenCalledWith(sharedOnlyJob.user_id);
    expect(completeJob).toHaveBeenCalledWith(sharedOnlyJob.user_id);
  });

  it('requires the database postcondition instead of trusting deleteUser', async () => {
    const prepareCleanupPage = jest
      .fn<Promise<CleanupPage>, [string]>()
      .mockResolvedValueOnce(page())
      .mockResolvedValueOnce(
        page({
          business_exists: false,
          auth_user_exists: false,
        })
      );

    await expect(
      processAccountDeletionJob(
        job,
        dependencies({
          prepareCleanupPage,
          completeJob: jest.fn(async () => false),
        })
      )
    ).rejects.toThrow('ACCOUNT_DELETE_POSTCONDITION_NOT_CONFIRMED');
  });

  it('stops safely when the due schedule or activity guard cancels the job', async () => {
    const removeStorageObjects = jest.fn(async () => undefined);
    const deleteAuthUser = jest.fn(async () => undefined);

    const result = await processAccountDeletionJob(
      job,
      dependencies({
        prepareCleanupPage: jest.fn(async () =>
          page({ job_state: 'cancelled' })
        ),
        removeStorageObjects,
        deleteAuthUser,
      })
    );

    expect(result.status).toBe('skipped_active');
    expect(removeStorageObjects).not.toHaveBeenCalled();
    expect(deleteAuthUser).not.toHaveBeenCalled();
  });

  it('treats a concurrently completed durable job idempotently', async () => {
    const completeJob = jest.fn(async () => true);
    const result = await processAccountDeletionJob(
      job,
      dependencies({
        prepareCleanupPage: jest.fn(async () =>
          page({
            job_state: 'completed',
            business_exists: false,
            auth_user_exists: false,
          })
        ),
        completeJob,
      })
    );

    expect(result.status).toBe('deleted');
    expect(completeJob).not.toHaveBeenCalled();
  });

  it('fails closed on database identity drift or malformed cleanup pages', async () => {
    await expect(
      processAccountDeletionJob(
        job,
        dependencies({
          prepareCleanupPage: jest.fn(async () =>
            page({ user_id: '33333333-3333-4333-8333-333333333333' })
          ),
        })
      )
    ).rejects.toThrow('ACCOUNT_DELETE_JOB_IDENTITY_MISMATCH');

    await expect(
      processAccountDeletionJob(
        job,
        dependencies({
          prepareCleanupPage: jest.fn(async () =>
            page({ paths: [], remaining_count: 1 })
          ),
        })
      )
    ).rejects.toThrow(
      'ACCOUNT_DELETE_STORAGE_PAGE_EMPTY_WITH_REMAINDER'
    );
  });
});

describe('scheduled account deletion SQL/source contract', () => {
  it('keeps a user-keyed durable no-FK job and accepts zero or one owned business', () => {
    expect(migration).toContain(
      'CREATE TABLE internal.account_deletion_jobs_v1'
    );
    expect(migration).toMatch(
      /user_id uuid PRIMARY KEY,[\s\S]{0,100}isletme_id uuid UNIQUE/
    );
    expect(migration).not.toMatch(
      /account_deletion_jobs_v1[\s\S]{0,500}REFERENCES\s+(?:auth\.users|public\.isletmeler)/i
    );
    expect(migration).toContain(
      'internal.account_deletion_has_post_due_business_activity_v1'
    );
    expect(migration).toContain(
      'internal.account_deletion_has_post_due_user_activity_v1'
    );
    expect(migration).toContain(
      'ACCOUNT_DELETE_OWNED_BUSINESS_INVARIANT'
    );
    expect(migration).toContain('v_owned_business_count > 1');
    expect(migration).toContain('v_owned_business_count <> 0');
    expect(migration).toContain('FOR UPDATE;');
    expect(migration).toContain(
      "current_setting('request.jwt.claim.role', true)"
    );
    expect(migration).toContain(
      'internal.account_deletion_lock_user_v1'
    );
  });

  it('hands shared-business ownership to its owner but deletes no Storage rows with SQL', () => {
    expect(migration).toMatch(
      /UPDATE storage\.objects AS object_row[\s\S]*?owner = destination_business\.user_id,[\s\S]*?owner_id = destination_business\.user_id::text/
    );
    expect(migration).toContain(
      "pg_catalog.split_part(object_row.name, '/', 1)"
    );
    expect(migration).not.toMatch(
      /DELETE\s+FROM\s+storage\.objects/i
    );
    expect(edgeFunction).toContain(
      '.from(ACCOUNT_DELETION_STORAGE_BUCKET)'
    );
    expect(edgeFunction).toContain('.remove(paths)');
  });

  it('preserves cross-business rows while clearing Auth RESTRICT references', () => {
    expect(migration).toMatch(
      /UPDATE public\.notlar AS note_row[\s\S]*?SET created_by = NULL[\s\S]*?v_job\.isletme_id IS NULL/
    );
    expect(migration).toMatch(
      /UPDATE public\.isletme_invites AS invite_row[\s\S]*?SET accepted_by = NULL[\s\S]*?v_job\.isletme_id IS NULL/
    );
    expect(migration).toMatch(
      /SET invited_by = destination_business\.user_id[\s\S]*?v_job\.isletme_id IS NULL/
    );
  });

  it('limits cleanup pages and verifies Storage, membership, Auth and optional business before completion', () => {
    expect(migration).toMatch(
      /ORDER BY object_row\.name\s+LIMIT 100/
    );
    expect(migration).toMatch(
      /FROM auth\.users AS auth_user[\s\S]*?FROM storage\.objects AS object_row/
    );
    expect(migration).toMatch(
      /FROM public\.isletme_users AS membership_row[\s\S]*?membership_row\.user_id = v_job\.user_id/
    );
    expect(migration).toContain(
      "state = 'completed'"
    );
    expect(edgeFunction.indexOf('completeJob:')).toBeGreaterThan(
      edgeFunction.indexOf('deleteAuthUser:')
    );
    expect(edgeFunction).not.toContain(
      'status: "deleted",\n        });\n\n        console.log'
    );
  });

  it('exposes worker RPCs only to service_role', () => {
    for (const signature of [
      'public.claim_scheduled_account_deletion_v1(uuid)',
      'public.claim_due_account_deletion_requests_v1()',
      'public.list_pending_account_deletion_jobs_v1()',
      'public.prepare_account_deletion_storage_v1(uuid)',
      'public.complete_account_deletion_job_v1(uuid)',
    ]) {
      expect(migration).toContain(`ON FUNCTION ${signature}`);
    }
    expect(migration).toContain(
      'FROM PUBLIC, anon, authenticated;'
    );
    expect(migration).toContain('TO service_role;');
  });

  it('exposes authenticated self-service schedule/cancel/status without exposing worker RPCs', () => {
    for (const signature of [
      'public.schedule_own_account_deletion_v1()',
      'public.cancel_own_account_deletion_v1()',
      'public.get_own_account_deletion_status_v1()',
    ]) {
      expect(migration).toContain(`ON FUNCTION ${signature}`);
    }
    expect(migration).toContain(
      'GRANT EXECUTE\nON FUNCTION public.schedule_own_account_deletion_v1()\nTO authenticated;'
    );
    expect(migration).toContain(
      'GRANT EXECUTE\nON FUNCTION public.cancel_own_account_deletion_v1()\nTO authenticated;'
    );
    expect(migration).toContain(
      'FROM PUBLIC, anon, authenticated;'
    );
  });

  it('atomically removes the requesting user push token only inside the explicit schedule RPC', () => {
    const scheduleStart = migration.indexOf(
      'CREATE FUNCTION public.schedule_own_account_deletion_v1()'
    );
    const scheduleEnd = migration.indexOf(
      'ON FUNCTION public.schedule_own_account_deletion_v1()',
      scheduleStart
    );
    const scheduleBody = migration.slice(scheduleStart, scheduleEnd);

    expect(scheduleBody).toMatch(
      /INSERT INTO internal\.account_deletion_jobs_v1[\s\S]*?DELETE FROM public\.push_tokens AS token_row[\s\S]*?token_row\.user_id = v_user_id/
    );
    expect(migration.slice(0, scheduleStart)).not.toMatch(
      /DELETE FROM public\.push_tokens/
    );
  });

  it('stores Apple revocation credentials encrypted outside Auth FKs and deletes them only after completion', () => {
    expect(migration).toContain(
      'CREATE TABLE internal.apple_revocation_credentials_v1'
    );
    expect(migration).not.toMatch(
      /apple_revocation_credentials_v1[\s\S]{0,500}REFERENCES\s+auth\.users/i
    );
    expect(migration).toContain(
      'public.store_apple_revocation_credential_v1(uuid,text,text)'
    );
    expect(migration).toContain(
      'public.get_apple_revocation_credential_v1(uuid)'
    );
    expect(migration).toMatch(
      /state = 'completed'[\s\S]*?DELETE FROM internal\.apple_revocation_credentials_v1/
    );
    expect(edgeFunction.indexOf('revokeAppleCredential:')).toBeLessThan(
      edgeFunction.indexOf('deleteAuthUser:')
    );
  });
});
