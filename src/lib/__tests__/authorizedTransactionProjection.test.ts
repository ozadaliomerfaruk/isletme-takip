import {
  dedupeAuthorizedTransactionRowsById,
  parseAuthorizedTransactionRows,
} from '@/lib/authorizedTransactionProjection';

const BUSINESS_ID = '11111111-1111-4111-8111-111111111111';
const TRANSACTION_ID = '22222222-2222-4222-8222-222222222222';
const ACCOUNT_ID = '33333333-3333-4333-8333-333333333333';
const CREATOR_ID = '44444444-4444-4444-8444-444444444444';

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: TRANSACTION_ID,
    isletme_id: BUSINESS_ID,
    type: 'gelir',
    amount: '125.50',
    description: 'Test',
    date: '2026-07-30T12:00:00',
    hesap_id: ACCOUNT_ID,
    hedef_hesap_id: null,
    kategori_id: null,
    cari_id: null,
    personel_id: null,
    source_currency: 'TRY',
    target_currency: null,
    exchange_rate: null,
    photo_path: null,
    date_end: null,
    source_ileri_id: null,
    vade_tarihi: null,
    created_by: CREATOR_ID,
    updated_by: null,
    created_at: '2026-07-30T12:00:01',
    updated_at: '2026-07-30T12:00:01',
    hesap: {
      id: ACCOUNT_ID,
      name: 'Kasa',
      currency: 'TRY',
      type: 'nakit',
    },
    hedef_hesap: null,
    kategori: null,
    cari: null,
    personel: null,
    creator: { display_name: 'Kasiyer' },
    counterparty_kind: null,
    counterparty_name: null,
    ...overrides,
  };
}

describe('authorized transaction projection', () => {
  it('numeric alanları normalize eder ve yalnız minimal relation alanlarını taşır', () => {
    const [parsed] = parseAuthorizedTransactionRows(
      [row()],
      BUSINESS_ID,
    );

    expect(parsed.amount).toBe(125.5);
    expect(parsed.hesap).toMatchObject({
      id: ACCOUNT_ID,
      name: 'Kasa',
      currency: 'TRY',
      type: 'nakit',
    });
    expect(parsed.creator).toEqual({ display_name: 'Kasiyer' });
    expect(parsed).not.toHaveProperty('balance');
    expect(parsed.hesap).not.toHaveProperty('balance');
  });

  it('kapalı bağlı modülün adını kimlik/relation üretmeden salt-okunur taşır', () => {
    const [parsed] = parseAuthorizedTransactionRows(
      [row({
        type: 'cari_odeme',
        cari_id: null,
        cari: null,
        counterparty_kind: 'cari',
        counterparty_name: 'Kapalı Cari Etiketi',
      })],
      BUSINESS_ID,
    );

    expect(parsed.counterparty_kind).toBe('cari');
    expect(parsed.counterparty_name).toBe('Kapalı Cari Etiketi');
    expect(parsed.cari_id).toBeNull();
    expect(parsed.cari).toBeNull();
  });

  it('eski sunucu yanıtında ek kolonlar yoksa geriye uyumlu olarak null üretir', () => {
    const legacyRow = row();
    Reflect.deleteProperty(legacyRow, 'counterparty_kind');
    Reflect.deleteProperty(legacyRow, 'counterparty_name');

    const [parsed] = parseAuthorizedTransactionRows(
      [legacyRow],
      BUSINESS_ID,
    );

    expect(parsed.counterparty_kind).toBeNull();
    expect(parsed.counterparty_name).toBeNull();
  });

  it('bilinmeyen karşı-taraf türünü veya tip dışı etiketi fail-closed reddeder', () => {
    expect(() =>
      parseAuthorizedTransactionRows(
        [row({
          counterparty_kind: 'future_entity',
          counterparty_name: 'Gizli',
        })],
        BUSINESS_ID,
      )).toThrow('counterparty_kind');

    expect(() =>
      parseAuthorizedTransactionRows(
        [row({
          counterparty_kind: 'cari',
          counterparty_name: { name: 'Gizli' },
        })],
        BUSINESS_ID,
      )).toThrow('counterparty_name');
  });

  it('tenant veya bilinmeyen işlem tipinde fail-closed davranır', () => {
    expect(() =>
      parseAuthorizedTransactionRows(
        [row({ isletme_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' })],
        BUSINESS_ID,
      )).toThrow('isletme_id');

    expect(() =>
      parseAuthorizedTransactionRows(
        [row({ type: 'future_financial_type' })],
        BUSINESS_ID,
      )).toThrow('type');
  });

  it('sayfa yarışında aynı id tekrar gelirse ilk satırı korur', () => {
    expect(
      dedupeAuthorizedTransactionRowsById([
        { id: TRANSACTION_ID, value: 'first' },
        { id: TRANSACTION_ID, value: 'second' },
      ]),
    ).toEqual([{ id: TRANSACTION_ID, value: 'first' }]);
  });
});
