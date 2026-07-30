import {
  dedupePersonelIslemRowsById,
  isPersonelIslemListRow,
  parsePersonelIslemListRows,
  PERSONEL_ISLEM_TYPES,
  toPersonelTransactionCreatorSource,
} from '@/lib/personelTransactionProjection';

const ISLEM_ID = '11111111-1111-4111-8111-111111111111';
const ISLETME_ID = '22222222-2222-4222-8222-222222222222';
const CREATOR_ID = '33333333-3333-4333-8333-333333333333';
const baseRow = {
  id: ISLEM_ID,
  type: 'personel_odeme',
  amount: '1250.45',
  description: 'Temmuz odemesi',
  date: '2026-07-29T10:30:00',
  date_end: null,
  source_currency: 'TRY',
  target_currency: 'USD',
  exchange_rate: '38.25',
  created_by: CREATOR_ID,
  created_at: '2026-07-29T10:30:01+00:00',
  updated_at: '2026-07-29T10:30:02+00:00',
  kategori_name: 'Personel',
  hesap_name: 'Kasa',
};

describe('personel islem satiri projection parser', () => {
  it('numeric alanlari cevirir, dar DTOyu kurar ve hassas alanlari atar', () => {
    const [row] = parsePersonelIslemListRows([
      {
        ...baseRow,
        isletme_id: 'tenant-leak',
        personel_id: 'personel-leak',
        hesap_id: 'account-leak',
        kategori_id: 'category-leak',
        updated_by: 'updater-leak',
        source_ileri_id: 'scheduled-leak',
        hedef_islem_id: 'allocation-leak',
        balance: 999999,
        salary: 888888,
        creator: { display_name: 'Nested creator' },
      },
    ]);

    expect(row).toEqual({
      projection_source: 'personel-v1',
      id: ISLEM_ID,
      type: 'personel_odeme',
      amount: 1250.45,
      description: 'Temmuz odemesi',
      date: '2026-07-29T10:30:00',
      date_end: null,
      source_currency: 'TRY',
      target_currency: 'USD',
      exchange_rate: 38.25,
      created_by: CREATOR_ID,
      created_at: '2026-07-29T10:30:01+00:00',
      updated_at: '2026-07-29T10:30:02+00:00',
      kategori: { name: 'Personel' },
      hesap: { name: 'Kasa' },
    });
    for (const forbidden of [
      'isletme_id',
      'personel_id',
      'hesap_id',
      'kategori_id',
      'updated_by',
      'source_ileri_id',
      'hedef_islem_id',
      'balance',
      'salary',
      'creator',
    ]) {
      expect(row).not.toHaveProperty(forbidden);
    }
  });

  it.each(PERSONEL_ISLEM_TYPES)('%s tipini kabul eder', (type) => {
    expect(parsePersonelIslemListRows([{ ...baseRow, type }])[0].type)
      .toBe(type);
  });

  it('nullable alanlari ve created_at fallbackini korur', () => {
    const [row] = parsePersonelIslemListRows([
      {
        ...baseRow,
        description: null,
        date_end: '2026-07-31',
        source_currency: null,
        target_currency: null,
        exchange_rate: null,
        created_by: null,
        created_at: null,
        updated_at: null,
        kategori_name: null,
        hesap_name: null,
      },
    ]);

    expect(row.date_end).toBe('2026-07-31');
    expect(row.created_at).toBe(baseRow.date);
    expect(row.kategori).toBeNull();
    expect(row.hesap).toBeNull();
  });

  it('creator kaynagina tenant kimligini yalniz trusted local baglamdan ekler', () => {
    const [row] = parsePersonelIslemListRows([
      { ...baseRow, isletme_id: 'server-controlled-tenant' },
    ]);

    expect(toPersonelTransactionCreatorSource(row, ISLETME_ID)).toEqual({
      created_by: CREATOR_ID,
      isletme_id: ISLETME_ID,
    });
    expect(toPersonelTransactionCreatorSource(row, null)).toEqual({
      created_by: CREATOR_ID,
      isletme_id: null,
    });
    expect(() =>
      toPersonelTransactionCreatorSource(row, 'not-a-uuid'),
    ).toThrow(
      /Invalid personnel transaction projection field: trusted_isletme_id/,
    );
    expect(row).not.toHaveProperty('isletme_id');
  });

  it('projection discriminantini fail-closed cozer', () => {
    const [row] = parsePersonelIslemListRows([baseRow]);

    expect(isPersonelIslemListRow(row)).toBe(true);
    expect(isPersonelIslemListRow({ ...row, projection_source: 'hesap-v1' }))
      .toBe(false);
    expect(isPersonelIslemListRow({ id: row.id })).toBe(false);
  });

  it('sayfa birlesiminde ayni IDyi ilk sirayi koruyarak tekillestirir', () => {
    const first = { id: ISLEM_ID, label: 'ilk' };
    const second = {
      id: '44444444-4444-4444-8444-444444444444',
      label: 'ikinci',
    };

    expect(
      dedupePersonelIslemRowsById([
        first,
        second,
        { ...first, label: 'tekrar' },
      ]),
    ).toEqual([first, second]);
  });

  it.each([
    ['dizi olmayan cevap', null],
    ['bilinmeyen tip', [{ ...baseRow, type: 'gelir' }]],
    ['bos numeric string', [{ ...baseRow, amount: '  ' }]],
    ['sonlu olmayan numeric', [{ ...baseRow, amount: 'Infinity' }]],
    ['sifir tutar', [{ ...baseRow, amount: 0 }]],
    ['negatif tutar', [{ ...baseRow, amount: -1 }]],
    ['gecersiz islem UUIDsi', [{ ...baseRow, id: 'not-a-uuid' }]],
    ['gecersiz creator UUIDsi', [{
      ...baseRow,
      created_by: 'not-a-uuid',
    }]],
    ['gecersiz islem tarihi', [{
      ...baseRow,
      date: '2026-02-30T10:30:00',
    }]],
    ['gecersiz izin bitis tarihi', [{
      ...baseRow,
      date_end: '2026-02-30',
    }]],
    ['gecersiz created_at', [{
      ...baseRow,
      created_at: '2026-07-29T25:30:00+00:00',
    }]],
    ['gecersiz updated_at', [{
      ...baseRow,
      updated_at: '2026-07-29T10:30:61+00:00',
    }]],
    ['desteklenmeyen para birimi', [{
      ...baseRow,
      source_currency: 'BTC',
    }]],
    ['sifir kur', [{ ...baseRow, exchange_rate: 0 }]],
    ['negatif kur', [{ ...baseRow, exchange_rate: -1 }]],
    ['gecersiz kategori adi', [{ ...baseRow, kategori_name: 123 }]],
    ['gecersiz hesap adi', [{ ...baseRow, hesap_name: {} }]],
  ])('%s icin fail-closed hata verir', (_label, value) => {
    expect(() => parsePersonelIslemListRows(value)).toThrow(
      /Invalid personnel transaction projection/,
    );
  });
});
