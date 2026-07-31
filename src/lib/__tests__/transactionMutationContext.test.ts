import {
  buildSharedTransactionMutationPatch,
  parseTransactionMutationContext,
} from '@/lib/transactionMutationContext';

const ROW = {
  id: '11111111-1111-4111-8111-111111111111',
  type: 'cari_satis',
  amount: '125.50',
  description: 'Test',
  date: '2026-07-30T10:15:30',
  hesap_id: null,
  hedef_hesap_id: null,
  kategori_id: '22222222-2222-4222-8222-222222222222',
  cari_id: '33333333-3333-4333-8333-333333333333',
  personel_id: null,
  source_currency: 'TRY',
  target_currency: 'TRY',
  exchange_rate: null,
  date_end: null,
  vade_tarihi: '2026-08-15',
  created_by: '44444444-4444-4444-8444-444444444444',
};

describe('parseTransactionMutationContext', () => {
  it('parses the exact one-row mutation projection', () => {
    expect(parseTransactionMutationContext([ROW])).toEqual({
      ...ROW,
      amount: 125.5,
    });
  });

  it.each([
    null,
    {},
    [],
    [ROW, ROW],
  ])('rejects a non-single-row response: %p', (value) => {
    expect(() => parseTransactionMutationContext(value)).toThrow(
      'Invalid transaction mutation context response',
    );
  });

  it.each([
    ['type', 'unknown_type'],
    ['amount', 'NaN'],
    ['id', 'not-a-uuid'],
    ['date', '2026-02-30T10:00:00'],
    ['source_currency', 'BTC'],
    ['vade_tarihi', '2026-02-30'],
  ])('rejects malformed %s', (field, value) => {
    expect(() =>
      parseTransactionMutationContext([{
        ...ROW,
        [field]: value,
      }]),
    ).toThrow(`Invalid transaction mutation context field: ${field}`);
  });
});

describe('buildSharedTransactionMutationPatch', () => {
  const context = parseTransactionMutationContext([ROW]);

  it('keeps the complete shared V2/V3 mutable context allowlist', () => {
    expect(
      buildSharedTransactionMutationPatch(context, {
        type: 'cari_satis',
        amount: 150.25,
        description: 'DÃ¼zeltilmiÅŸ',
        date: '2026-07-31T11:30:00',
        hesap_id: null,
        kategori_id: ROW.kategori_id,
        cari_id: ROW.cari_id,
        personel_id: null,
        source_currency: 'TRY',
        target_currency: 'TRY',
        exchange_rate: 1,
        vade_tarihi: null,
      }),
    ).toEqual({
      type: 'cari_satis',
      amount: 150.25,
      description: 'DÃ¼zeltilmiÅŸ',
      date: '2026-07-31T11:30:00',
      hesap_id: null,
      kategori_id: ROW.kategori_id,
      cari_id: ROW.cari_id,
      personel_id: null,
      source_currency: 'TRY',
      target_currency: 'TRY',
      exchange_rate: 1,
      vade_tarihi: null,
    });
  });

  it.each([
    [{ photo_path: null }],
    [{ source_ileri_id: null }],
    [{ hedef_islem_id: ROW.id }],
  ])('rejects an immutable or unsupported field change: %p', (updates) => {
    expect(() =>
      buildSharedTransactionMutationPatch(
        context,
        updates as Parameters<typeof buildSharedTransactionMutationPatch>[1],
      ),
    ).toThrow('ISLEM_MUTATION_V2_FEATURE_UNSUPPORTED');
  });

  it('allows tab, account and entity context changes for server-side revalidation', () => {
    expect(
      buildSharedTransactionMutationPatch(context, {
        type: 'cari_alis',
        hesap_id: '55555555-5555-4555-8555-555555555555',
        hedef_hesap_id: null,
        cari_id: ROW.cari_id,
        personel_id: null,
        source_currency: 'USD',
        target_currency: 'TRY',
      }),
    ).toEqual({
      type: 'cari_alis',
      hesap_id: '55555555-5555-4555-8555-555555555555',
      hedef_hesap_id: null,
      cari_id: ROW.cari_id,
      personel_id: null,
      source_currency: 'USD',
      target_currency: 'TRY',
    });
  });

  it('ignores undefined optional context fields', () => {
    expect(
      buildSharedTransactionMutationPatch(context, {
        amount: 99,
        photo_path: undefined,
        source_ileri_id: undefined,
      }),
    ).toEqual({ amount: 99 });
  });
});
