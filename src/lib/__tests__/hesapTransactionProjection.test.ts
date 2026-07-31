import {
  dedupeHesapIslemRowsById,
  HESAP_ISLEM_TYPES,
  isHesapIslemListRow,
  isHesapProjectionTargetLeg,
  parseHesapIslemListRows,
} from '@/lib/hesapTransactionProjection';
import { getValidatedIslemPhotoPath } from '@/lib/islemPhotoLifecycle';

const ISLETME_ID = '22222222-2222-4222-8222-222222222222';
const ISLEM_ID = '11111111-1111-4111-8111-111111111111';
const CANONICAL_PHOTO_PATH =
  `${ISLETME_ID}/${ISLEM_ID}_1722250000000.webp`;
const baseRow = {
  id: ISLEM_ID,
  type: 'transfer',
  amount: '1250.45',
  description: 'Kasadan bankaya',
  date: '2026-07-29T10:30:00',
  source_currency: 'TRY',
  target_currency: 'USD',
  exchange_rate: '38.25',
  vade_tarihi: null,
  photo_path: CANONICAL_PHOTO_PATH,
  created_by: '33333333-3333-4333-8333-333333333333',
  created_at: '2026-07-29T10:30:01+00:00',
  updated_at: '2026-07-29T10:30:02+00:00',
  kategori_name: 'Transfer',
  source_account_name: 'Kasa',
  target_account_name: 'Dolar',
  counterparty_kind: 'source_account',
  counterparty_name: 'Kasa',
};

describe('hesap islem satiri projection parser', () => {
  it('numeric alanlari cevirir, dar DTOyu kurar ve beklenmeyen alanlari atar', () => {
    const [row] = parseHesapIslemListRows([
      {
        ...baseRow,
        isletme_id: 'tenant-leak',
        hesap_id: 'account-leak',
        hedef_hesap_id: 'target-leak',
        kategori_id: 'category-leak',
        cari_id: 'cari-leak',
        personel_id: 'personel-leak',
        updated_by: 'updater-leak',
      },
    ]);

    expect(row).toEqual({
      projection_source: 'hesap-v1',
      id: baseRow.id,
      type: 'transfer',
      amount: 1250.45,
      description: 'Kasadan bankaya',
      date: '2026-07-29T10:30:00',
      source_currency: 'TRY',
      target_currency: 'USD',
      exchange_rate: 38.25,
      vade_tarihi: null,
      photo_path: CANONICAL_PHOTO_PATH,
      created_by: baseRow.created_by,
      created_at: '2026-07-29T10:30:01+00:00',
      updated_at: '2026-07-29T10:30:02+00:00',
      kategori: { name: 'Transfer' },
      source_account_name: 'Kasa',
      target_account_name: 'Dolar',
      counterparty_kind: 'source_account',
      counterparty_name: 'Kasa',
    });
    for (const forbidden of [
      'isletme_id',
      'hesap_id',
      'hedef_hesap_id',
      'kategori_id',
      'cari_id',
      'personel_id',
      'updated_by',
    ]) {
      expect(row).not.toHaveProperty(forbidden);
    }
  });

  it.each(HESAP_ISLEM_TYPES)('%s tipini kabul eder', (type) => {
    expect(parseHesapIslemListRows([{ ...baseRow, type }])[0].type)
      .toBe(type);
  });

  it('nullable alanlari ve nullable created_at fallbackini korur', () => {
    const [row] = parseHesapIslemListRows([
      {
        ...baseRow,
        description: null,
        exchange_rate: null,
        photo_path: null,
        created_by: null,
        created_at: null,
        updated_at: null,
        kategori_name: null,
        source_account_name: null,
        target_account_name: null,
        counterparty_kind: null,
        counterparty_name: null,
      },
    ]);

    expect(row.created_at).toBe(baseRow.date);
    expect(row.kategori).toBeNull();
    expect(row.counterparty_kind).toBeNull();
    expect(row.counterparty_name).toBeNull();
  });

  it('projection discriminantini ve transfer yonunu fail-closed cozer', () => {
    const [incoming] = parseHesapIslemListRows([baseRow]);
    const [outgoing] = parseHesapIslemListRows([
      { ...baseRow, counterparty_kind: 'target_account' },
    ]);

    expect(isHesapIslemListRow(incoming)).toBe(true);
    expect(isHesapProjectionTargetLeg(incoming)).toBe(true);
    expect(isHesapProjectionTargetLeg(outgoing)).toBe(false);
    expect(isHesapIslemListRow({ id: incoming.id })).toBe(false);
  });

  it('kanonik foto pointerini korur; goruntuleme guardi bozuk pointeri kapatir', () => {
    const [canonical] = parseHesapIslemListRows([baseRow]);
    const [malformed] = parseHesapIslemListRows([
      { ...baseRow, photo_path: 'receipts/example.jpg' },
    ]);

    expect(
      getValidatedIslemPhotoPath(canonical.photo_path, ISLETME_ID, ISLEM_ID),
    ).toBe(CANONICAL_PHOTO_PATH);
    expect(
      getValidatedIslemPhotoPath(malformed.photo_path, ISLETME_ID, ISLEM_ID),
    ).toBeNull();
  });

  it('sayfa birlesiminde ayni IDyi ilk sirayi koruyarak tekillestirir', () => {
    const first = { id: ISLEM_ID, label: 'ilk' };
    const second = {
      id: '44444444-4444-4444-8444-444444444444',
      label: 'ikinci',
    };

    expect(
      dedupeHesapIslemRowsById([first, second, { ...first, label: 'tekrar' }]),
    ).toEqual([first, second]);
  });

  it.each([
    ['dizi olmayan cevap', null],
    ['bilinmeyen tip', [{ ...baseRow, type: 'unknown_type' }]],
    ['bilinmeyen karsi taraf', [{
      ...baseRow,
      counterparty_kind: 'unknown_kind',
    }]],
    ['bos numeric string', [{ ...baseRow, amount: '  ' }]],
    ['sonlu olmayan numeric', [{ ...baseRow, amount: 'Infinity' }]],
    ['sifir tutar', [{ ...baseRow, amount: 0 }]],
    ['negatif tutar', [{ ...baseRow, amount: -1 }]],
    ['gecersiz islem UUIDsi', [{ ...baseRow, id: 'not-a-uuid' }]],
    ['gecersiz creator UUIDsi', [{ ...baseRow, created_by: 'not-a-uuid' }]],
    ['gecersiz tarih', [{
      ...baseRow,
      date: '2026-02-30T10:30:00',
    }]],
    ['gecersiz created_at', [{
      ...baseRow,
      created_at: '2026-07-29T25:30:00+00:00',
    }]],
    ['gecersiz vade tarihi', [{
      ...baseRow,
      vade_tarihi: '2026-02-30',
    }]],
    ['desteklenmeyen para birimi', [{
      ...baseRow,
      source_currency: 'BTC',
    }]],
    ['sifir kur', [{ ...baseRow, exchange_rate: 0 }]],
    ['negatif kur', [{ ...baseRow, exchange_rate: -1 }]],
  ])('%s icin fail-closed hata verir', (_label, value) => {
    expect(() => parseHesapIslemListRows(value)).toThrow(
      /Invalid account transaction projection/,
    );
  });
});
