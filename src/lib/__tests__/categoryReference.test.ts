import { parseKategoriSecimReferanslari } from '@/lib/categoryReference';

describe('dar kategori secim referansi parser', () => {
  it('yalniz dort izinli alani cache DTOsuna alir', () => {
    const [row] = parseKategoriSecimReferanslari([
      {
        id: '11111111-1111-4111-8111-111111111111',
        name: 'Ekipman',
        type: 'gider',
        color: '#FF0000',
        parent_id: 'gizli-parent',
        created_by: 'gizli-kullanici',
        mapped_gelir_kategori_id: 'gizli-esleme',
      },
    ]);

    expect(row).toEqual({
      id: '11111111-1111-4111-8111-111111111111',
      name: 'Ekipman',
      type: 'gider',
      color: '#FF0000',
    });
    expect(row).not.toHaveProperty('parent_id');
    expect(row).not.toHaveProperty('created_by');
    expect(row).not.toHaveProperty('mapped_gelir_kategori_id');
  });

  it.each(['gelir', 'gider', 'urun'] as const)(
    '%s kategori tipini kabul eder',
    (type) => {
      expect(
        parseKategoriSecimReferanslari([
          { id: 'id', name: 'Ad', type, color: null },
        ])[0],
      ).toEqual({ id: 'id', name: 'Ad', type, color: null });
    },
  );

  it.each([
    ['dizi olmayan cevap', null],
    ['bos id', [{ id: '', name: 'Ad', type: 'gelir', color: null }]],
    ['bos ad', [{ id: 'id', name: '', type: 'gelir', color: null }]],
    ['bilinmeyen tip', [{ id: 'id', name: 'Ad', type: 'diger', color: null }]],
    ['gecersiz renk', [{ id: 'id', name: 'Ad', type: 'gelir', color: 123 }]],
  ])('%s icin fail-closed hata verir', (_label, value) => {
    expect(() => parseKategoriSecimReferanslari(value)).toThrow(
      /Invalid category picker reference/,
    );
  });
});
