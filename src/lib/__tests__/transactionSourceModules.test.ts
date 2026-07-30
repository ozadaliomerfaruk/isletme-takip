import {
  canAccessTransactionSources,
  getTransactionSourceModules,
  isProductTransactionType,
  mergeTransactionSourceModules,
} from '@/lib/transactionSourceModules';

describe('transaction source module allowlist', () => {
  it.each([
    ['gelir', ['hesaplar']],
    ['gider', ['hesaplar']],
    ['transfer', ['hesaplar']],
    ['cari_alis', ['cariler']],
    ['cari_satis', ['cariler']],
    ['cari_odeme', ['cariler']],
    ['cari_tahsilat', ['cariler']],
    ['cari_alis_iade', ['cariler']],
    ['cari_satis_iade', ['cariler']],
    ['personel_gider', ['personel']],
    ['personel_satis', ['personel']],
    ['personel_izin_hakki', ['personel']],
    ['personel_izin_kullanimi', ['personel']],
    ['personel_odeme', ['personel']],
    ['personel_tahsilat', ['personel']],
  ] as const)('%s requires %p', (type, expected) => {
    expect(getTransactionSourceModules(type)).toEqual(expected);
  });

  it.each([undefined, null, '', 'nakit_avans_taksit', 'future_type'])(
    'fails closed for %p',
    (type) => {
      expect(getTransactionSourceModules(type)).toBeNull();
    },
  );

  it('unions old and new type modules and deduplicates them', () => {
    expect(
      mergeTransactionSourceModules(
        ['cari_satis', 'personel_odeme'],
        ['urunler'],
      ),
    ).toEqual(['urunler', 'cariler', 'personel']);
  });

  it('fails closed when either side of an update is unknown', () => {
    expect(
      mergeTransactionSourceModules(['cari_satis', 'future_type']),
    ).toBeNull();
  });

  it.each([
    'gelir',
    'gider',
    'cari_alis',
    'cari_satis',
    'cari_alis_iade',
    'cari_satis_iade',
  ])('allows product payload for %s', (type) => {
    expect(isProductTransactionType(type)).toBe(true);
  });

  it.each([
    'transfer',
    'cari_odeme',
    'cari_tahsilat',
    'personel_satis',
    'personel_gider',
    'future_type',
    null,
  ])('rejects product payload for %p', (type) => {
    expect(isProductTransactionType(type)).toBe(false);
  });

  it('keeps source visibility separate from the islemler action capability', () => {
    const visible = new Set(['cariler', 'hesaplar']);
    const canAccess = (module: string) => visible.has(module);

    expect(
      canAccessTransactionSources(['cari_satis'], canAccess),
    ).toBe(true);
    expect(
      canAccessTransactionSources(['personel_odeme'], canAccess),
    ).toBe(false);
    expect(
      canAccessTransactionSources(['cari_satis'], canAccess, ['urunler']),
    ).toBe(false);
  });

  it('Personel ödeme/tahsilatında hesabı bakiye-siz destek referansı sayar', () => {
    const visible = new Set(['personel']);
    const canAccess = (module: string) => visible.has(module);

    expect(canAccessTransactionSources(['personel_odeme'], canAccess)).toBe(true);
    expect(canAccessTransactionSources(['personel_tahsilat'], canAccess)).toBe(true);
  });

  it('keeps unknown source types fail-closed before invoking permissions', () => {
    const canAccess = jest.fn(() => true);

    expect(
      canAccessTransactionSources(['future_type'], canAccess),
    ).toBe(false);
    expect(canAccess).not.toHaveBeenCalled();
  });
});
