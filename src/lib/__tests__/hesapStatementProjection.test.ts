import { getHesapDebitCredit } from '@/lib/excelExport';
import {
  filterHesapStatementPeriod,
  toHesapStatementTransaction,
} from '@/lib/hesapStatementProjection';
import type { HesapIslemListRow } from '@/lib/hesapTransactionProjection';

const baseRow: HesapIslemListRow = {
  projection_source: 'hesap-v1',
  id: '11111111-1111-4111-8111-111111111111',
  type: 'transfer',
  amount: 125,
  description: 'Transfer',
  date: '2026-07-15T10:30:00',
  source_currency: 'TRY',
  target_currency: 'TRY',
  exchange_rate: null,
  vade_tarihi: null,
  photo_path: null,
  created_by: '22222222-2222-4222-8222-222222222222',
  created_at: '2026-07-15T10:30:00+03:00',
  updated_at: null,
  kategori: null,
  source_account_name: 'Kasa',
  target_account_name: 'Banka',
  counterparty_kind: 'target_account',
  counterparty_name: 'Banka',
};

const options = {
  isletmeId: '33333333-3333-4333-8333-333333333333',
  hesapId: '44444444-4444-4444-8444-444444444444',
  hesapName: 'Kasa',
  hesapCurrency: 'TRY',
};

describe('account statement projection adapter', () => {
  it('preserves the selected account perspective for outgoing transfers', () => {
    const transaction = toHesapStatementTransaction(baseRow, options);

    expect(transaction.hesap_id).toBe(options.hesapId);
    expect(transaction.hedef_hesap_id).toBeNull();
    expect(getHesapDebitCredit(transaction, options.hesapId)).toEqual({
      debit: 125,
      credit: null,
    });
  });

  it('preserves the selected account perspective for incoming transfers', () => {
    const transaction = toHesapStatementTransaction(
      {
        ...baseRow,
        counterparty_kind: 'source_account',
        counterparty_name: 'Kasa',
      },
      {
        ...options,
        hesapName: 'Banka',
      },
    );

    expect(transaction.hesap_id).toBeNull();
    expect(transaction.hedef_hesap_id).toBe(options.hesapId);
    expect(getHesapDebitCredit(transaction, options.hesapId)).toEqual({
      debit: null,
      credit: 125,
    });
  });

  it('filters an already-authorized projection by inclusive local report days', () => {
    const july = toHesapStatementTransaction(baseRow, options);
    const august = {
      ...july,
      id: '55555555-5555-4555-8555-555555555555',
      date: '2026-08-01T00:00:00',
    };

    expect(
      filterHesapStatementPeriod(
        [july, august],
        '2026-07-01',
        '2026-07-31',
      ).map((row) => row.id),
    ).toEqual([july.id]);
  });
});
