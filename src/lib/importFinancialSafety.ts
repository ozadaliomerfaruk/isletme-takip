import { supabase } from '@/lib/supabase';
import { classifyMutationError } from '@/lib/errors';
import type { Islem, IslemInsert } from '@/types/database';

export type ImportOpeningBalanceEntity = 'hesap' | 'cari' | 'personel';

export interface ImportOpeningBalanceResult {
  applied: boolean;
  changed: boolean;
  existing_initial_balance: number;
}

const IDEMPOTENT_RPC_ATTEMPTS = 2;

async function callIdempotentImportRpc<T>(
  name: string,
  args: Record<string, unknown>,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < IDEMPOTENT_RPC_ATTEMPTS; attempt += 1) {
    const { data, error } = await supabase.rpc(name, args);
    if (!error) return data as T;

    lastError = error;
    if (
      classifyMutationError(error) !== 'network_unknown'
      || attempt === IDEMPOTENT_RPC_ATTEMPTS - 1
    ) {
      throw error;
    }
  }

  throw lastError;
}

/**
 * Import satirini canli canonical finansal motora yazar.
 * `input.id` istemcide bir kez uretilmelidir: ayni UUID ile kayip HTTP cevabi
 * sonrasi tekrar, create_islem_atomik_v2 tarafinda exact-payload no-op'tur.
 */
export async function createImportedIslemAtomically(
  isletmeId: string,
  input: IslemInsert,
): Promise<Islem> {
  if (!input.id) {
    throw new Error('IMPORT_TRANSACTION_ID_REQUIRED');
  }

  return callIdempotentImportRpc<Islem>('create_islem_atomik', {
    p_isletme_id: isletmeId,
    p_new_row: input,
    // Guncel V1 compatibility wrapper bu alani bilerek yok sayip canonical V2
    // motorunda entity/kur/bakiye ops'larini server-side turetiyor.
    p_balance_ops: [],
  });
}

/** Kur-dogru, row-lock'lu ve ayni payload tekrarinda idempotent acilis bakiyesi. */
export async function applyImportOpeningBalance(params: {
  isletmeId: string;
  entityType: ImportOpeningBalanceEntity;
  entityId: string;
  amount: number;
  replaceExisting: boolean;
}): Promise<ImportOpeningBalanceResult> {
  const data = await callIdempotentImportRpc<ImportOpeningBalanceResult>(
    'apply_import_opening_balance_v1',
    {
      p_isletme_id: params.isletmeId,
      p_entity_type: params.entityType,
      p_entity_id: params.entityId,
      p_amount: params.amount,
      p_replace_existing: params.replaceExisting,
    },
  );

  if (
    !data
    || typeof data.applied !== 'boolean'
    || typeof data.changed !== 'boolean'
    || !Number.isFinite(Number(data.existing_initial_balance))
  ) {
    throw new Error('IMPORT_OPENING_BALANCE_INVALID_RESPONSE');
  }

  return {
    ...data,
    existing_initial_balance: Number(data.existing_initial_balance),
  };
}
