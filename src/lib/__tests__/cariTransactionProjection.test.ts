import {
  CARI_ISLEM_TYPES,
  parseCariIslemListRows,
} from '@/lib/cariTransactionProjection';

const baseRow = {
  id: '11111111-1111-4111-8111-111111111111',
  isletme_id: '22222222-2222-4222-8222-222222222222',
  type: 'cari_satis',
  amount: '1250.45',
  description: 'Temmuz satisi',
  date: '2026-07-29T10:30:00',
  source_currency: 'TRY',
  target_currency: null,
  exchange_rate: '1.25',
  vade_tarihi: '2026-08-29',
  photo_path: 'receipts/example.jpg',
  created_by: '33333333-3333-4333-8333-333333333333',
  created_at: '2026-07-29T10:30:01+00:00',
  updated_at: '2026-07-29T10:30:02+00:00',
  kategori_name: 'Satis',
  hesap_name: 'Kasa',
};

describe('cari islem satiri projection parser', () => {
  it('numeric string alanlarini sonlu sayiya cevirir ve yalniz dar DTO alanlarini tutar', () => {
    const raw = {
      ...baseRow,
      balance: 999999,
      hesap_id: '44444444-4444-4444-8444-444444444444',
      creator: { display_name: 'Bu relation gelmemeli' },
    };

    const [row] = parseCariIslemListRows([raw]);

    expect(row).toEqual({
      id: baseRow.id,
      isletme_id: baseRow.isletme_id,
      type: 'cari_satis',
      amount: 1250.45,
      description: 'Temmuz satisi',
      date: '2026-07-29T10:30:00',
      source_currency: 'TRY',
      target_currency: null,
      exchange_rate: 1.25,
      vade_tarihi: '2026-08-29',
      photo_path: 'receipts/example.jpg',
      created_by: baseRow.created_by,
      created_at: '2026-07-29T10:30:01+00:00',
      updated_at: '2026-07-29T10:30:02+00:00',
      kategori: { name: 'Satis' },
      hesap: { name: 'Kasa' },
    });
    expect(row).not.toHaveProperty('balance');
    expect(row).not.toHaveProperty('hesap_id');
    expect(row).not.toHaveProperty('creator');
  });

  it.each(CARI_ISLEM_TYPES)('%s tipini kabul eder', (type) => {
    expect(parseCariIslemListRows([{ ...baseRow, type }])[0].type).toBe(
      type,
    );
  });

  it('null relation ve nullable numeric alanlarini korur', () => {
    const [row] = parseCariIslemListRows([
      {
        ...baseRow,
        description: null,
        exchange_rate: null,
        kategori_name: null,
        hesap_name: null,
        vade_tarihi: null,
        photo_path: null,
        created_by: null,
      },
    ]);

    expect(row.description).toBeNull();
    expect(row.exchange_rate).toBeNull();
    expect(row.kategori).toBeNull();
    expect(row.hesap).toBeNull();
    expect(row.created_by).toBeNull();
  });

  it('nullable zaman kolonlarinda listeyi dusurmez', () => {
    const [row] = parseCariIslemListRows([
      {
        ...baseRow,
        created_at: null,
        updated_at: null,
      },
    ]);

    expect(row.created_at).toBe(baseRow.date);
    expect(row.updated_at).toBeNull();
  });

  it('owner/viewer base SELECT yolundaki nested relationlari da dar ada indirger', () => {
    const legacyRow: Record<string, unknown> = { ...baseRow };
    delete legacyRow.kategori_name;
    delete legacyRow.hesap_name;
    const [row] = parseCariIslemListRows([
      {
        ...legacyRow,
        kategori: { id: 'kategori-id', name: 'Nested kategori', color: 'red' },
        hesap: {
          id: 'hesap-id',
          name: 'Nested hesap',
          currency: 'TRY',
          balance: 12345,
        },
        creator: { display_name: 'Nested creator' },
      },
    ]);

    expect(row.kategori).toEqual({ name: 'Nested kategori' });
    expect(row.hesap).toEqual({ name: 'Nested hesap' });
    expect(row).not.toHaveProperty('creator');
  });

  it.each([
    ['dizi olmayan cevap', null],
    ['izin verilmeyen islem tipi', [{ ...baseRow, type: 'gelir' }]],
    ['bos numeric string', [{ ...baseRow, amount: '   ' }]],
    ['sonlu olmayan numeric deger', [{ ...baseRow, amount: 'Infinity' }]],
  ])('%s icin fail-closed hata verir', (_label, value) => {
    expect(() => parseCariIslemListRows(value)).toThrow(
      /Invalid cari transaction projection/,
    );
  });
});
