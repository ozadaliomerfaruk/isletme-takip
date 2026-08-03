import { supabase } from '@/lib/supabase';
import {
  applyImportOpeningBalance,
  createImportedIslemAtomically,
} from '../importFinancialSafety';
import type { IslemInsert } from '@/types/database';

const rpc = supabase.rpc as jest.Mock;

const transaction = {
  id: '11111111-1111-4111-8111-111111111111',
  isletme_id: 'business-1',
  type: 'gelir',
  amount: 125,
  date: '2026-08-03 12:00:00',
  hesap_id: 'account-1',
} as IslemInsert;

describe('import financial safety RPC client', () => {
  beforeEach(() => {
    rpc.mockReset();
  });

  it('requires a stable client UUID before the idempotent transaction RPC', async () => {
    await expect(
      createImportedIslemAtomically('business-1', {
        ...transaction,
        id: undefined,
      } as IslemInsert),
    ).rejects.toThrow('IMPORT_TRANSACTION_ID_REQUIRED');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('retries an unknown network result with the exact same UUID and payload', async () => {
    rpc
      .mockResolvedValueOnce({
        data: null,
        error: { code: 'ETIMEDOUT', message: 'request timed out' },
      })
      .mockResolvedValueOnce({ data: transaction, error: null });

    await expect(
      createImportedIslemAtomically('business-1', transaction),
    ).resolves.toEqual(transaction);

    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls[0]).toEqual(rpc.mock.calls[1]);
    expect(rpc).toHaveBeenCalledWith('create_islem_atomik', {
      p_isletme_id: 'business-1',
      p_new_row: transaction,
      p_balance_ops: [],
    });
  });

  it('does not retry validation or permission failures', async () => {
    const error = { code: '42501', message: 'not authorized' };
    rpc.mockResolvedValueOnce({ data: null, error });

    await expect(
      createImportedIslemAtomically('business-1', transaction),
    ).rejects.toBe(error);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('validates and normalizes opening-balance RPC responses', async () => {
    rpc.mockResolvedValueOnce({
      data: {
        applied: true,
        changed: false,
        existing_initial_balance: '42.50',
      },
      error: null,
    });

    await expect(applyImportOpeningBalance({
      isletmeId: 'business-1',
      entityType: 'cari',
      entityId: 'customer-1',
      amount: 42.5,
      replaceExisting: true,
    })).resolves.toEqual({
      applied: true,
      changed: false,
      existing_initial_balance: 42.5,
    });
  });
});
