import {
  canUseCariMinimalAccountRefs,
  canUseMinimalAccountRefs,
  getCariTypeForApiTransactionType,
  getAllowedScopedQuickTransactionTypes,
  getQuickTransactionScopeForApiType,
  getScopedQuickTransactionApiType,
  resolveScopedQuickTransactionDefaultType,
} from '@/lib/quickTransactionCreateScope';
import type { IslemType } from '@/types/database';

describe('scoped QuickTransactionBar create types', () => {
  it('derives cari kind from the canonical API transaction type', () => {
    expect(getCariTypeForApiTransactionType('cari_odeme')).toBe('tedarikci');
    expect(getCariTypeForApiTransactionType('cari_alis_iade')).toBe('tedarikci');
    expect(getCariTypeForApiTransactionType('cari_tahsilat')).toBe('musteri');
    expect(getCariTypeForApiTransactionType('cari_satis_iade')).toBe('musteri');
    // Alis ve satis her iki cari tipinde de kullanilabilir. Iliski tipi
    // projeksiyondan gelmiyorsa ters-yon akisini tahmin ederek yetki
    // genisletmek yerine belirsiz kalir.
    expect(getCariTypeForApiTransactionType('cari_alis')).toBeNull();
    expect(getCariTypeForApiTransactionType('cari_satis')).toBeNull();
    expect(getCariTypeForApiTransactionType('personel_odeme')).toBeNull();
    expect(getCariTypeForApiTransactionType('unknown')).toBeNull();
  });

  it.each([
    [
      'create',
      { requested: true, mode: 'create', defaultCariId: 'cari-1' },
      true,
    ],
    [
      'regular edit',
      {
        requested: true,
        mode: 'edit',
        defaultCariId: 'cari-1',
        transactionId: 'islem-1',
      },
      true,
    ],
    [
      'scheduled edit',
      {
        requested: true,
        mode: 'edit',
        defaultCariId: 'cari-1',
        transactionId: 'islem-1',
        isScheduledTransaction: true,
      },
      false,
    ],
    [
      'copy',
      {
        requested: true,
        mode: 'create',
        defaultCariId: 'cari-1',
        copySourceId: 'islem-1',
      },
      false,
    ],
    [
      'viewer',
      {
        requested: true,
        mode: 'create',
        defaultCariId: 'cari-1',
        isViewer: true,
      },
      false,
    ],
  ] as const)('allows minimal account refs for %s = %s', (_label, input, expected) => {
    expect(canUseCariMinimalAccountRefs(input)).toBe(expected);
  });

  it('requires the fixed entity that matches the common Cari/Personel scope', () => {
    expect(
      canUseMinimalAccountRefs({
        requestedScope: 'personel',
        mode: 'create',
        defaultPersonelId: 'personel-1',
      }),
    ).toBe(true);
    expect(
      canUseMinimalAccountRefs({
        requestedScope: 'personel',
        mode: 'create',
        defaultCariId: 'cari-1',
      }),
    ).toBe(false);
    expect(
      canUseMinimalAccountRefs({
        requestedScope: 'cari',
        mode: 'create',
        defaultPersonelId: 'personel-1',
      }),
    ).toBe(false);
  });

  it('keeps the existing supplier/customer order while filtering exact capabilities', () => {
    const cariOnly = (type: IslemType) => type.startsWith('cari_');

    expect(
      getAllowedScopedQuickTransactionTypes({
        scope: 'cari',
        cariType: 'tedarikci',
        canCreateTransactionType: cariOnly,
      }),
    ).toEqual(['alis', 'satis', 'odeme', 'alis_iade']);
    expect(
      getAllowedScopedQuickTransactionTypes({
        scope: 'cari',
        cariType: 'musteri',
        canCreateTransactionType: cariOnly,
      }),
    ).toEqual(['satis', 'alis', 'tahsilat', 'satis_iade']);
  });

  it('keeps Personel payment/collection without Hesaplar capability', () => {
    const personelWithoutAccounts = (type: IslemType) =>
      type.startsWith('personel_');

    expect(
      getAllowedScopedQuickTransactionTypes({
        scope: 'personel',
        canCreateTransactionType: personelWithoutAccounts,
      }),
    ).toEqual([
      'personel_gider_tab',
      'personel_satis_tab',
      'personel_odeme_tab',
      'personel_tahsilat_tab',
      'personel_izin_hakki_tab',
      'personel_izin_kullanimi_tab',
    ]);
  });

  it('keeps Hesap scope limited to direct account transaction types', () => {
    const accountsOnly = (type: IslemType) =>
      type === 'gelir' || type === 'gider' || type === 'transfer';

    expect(
      getAllowedScopedQuickTransactionTypes({
        scope: 'hesap',
        canCreateTransactionType: accountsOnly,
      }),
    ).toEqual(['gelir', 'gider', 'transfer']);
    expect(
      resolveScopedQuickTransactionDefaultType({
        scope: 'hesap',
        requestedType: 'odeme',
      }),
    ).toBe('gelir');
  });

  it('derives the canonical edit scope from the persisted API type', () => {
    expect(getQuickTransactionScopeForApiType('gelir')).toBe('hesap');
    expect(getQuickTransactionScopeForApiType('transfer')).toBe('hesap');
    expect(getQuickTransactionScopeForApiType('cari_alis')).toBe('cari');
    expect(getQuickTransactionScopeForApiType('personel_odeme')).toBe(
      'personel',
    );
    expect(getQuickTransactionScopeForApiType('unknown_future_type')).toBeNull();
  });

  it('adds Personel payment/collection when their exact capability opens', () => {
    expect(
      getAllowedScopedQuickTransactionTypes({
        scope: 'personel',
        canCreateTransactionType: () => true,
      }),
    ).toEqual([
      'personel_gider_tab',
      'personel_satis_tab',
      'personel_odeme_tab',
      'personel_tahsilat_tab',
      'personel_izin_hakki_tab',
      'personel_izin_kullanimi_tab',
    ]);
  });

  it('maps only known scoped UI types and fails closed for unrelated tabs', () => {
    expect(getScopedQuickTransactionApiType('alis')).toBe('cari_alis');
    expect(getScopedQuickTransactionApiType('personel_odeme_tab')).toBe(
      'personel_odeme',
    );
    expect(getScopedQuickTransactionApiType('gelir')).toBe('gelir');
    expect(getScopedQuickTransactionApiType('gider')).toBe('gider');
    expect(getScopedQuickTransactionApiType('transfer')).toBe('transfer');
    expect(getScopedQuickTransactionApiType('odeme')).toBe('cari_odeme');
    expect(getScopedQuickTransactionApiType('kredi_karti_gider')).toBeNull();
  });

  it('preserves contextual defaults such as leave and reverse-direction cari rows', () => {
    expect(
      resolveScopedQuickTransactionDefaultType({
        scope: 'personel',
        requestedType: 'personel_izin_hakki_tab',
      }),
    ).toBe('personel_izin_hakki_tab');
    expect(
      resolveScopedQuickTransactionDefaultType({
        scope: 'cari',
        cariType: 'tedarikci',
        requestedType: 'satis',
      }),
    ).toBe('satis');
    expect(
      resolveScopedQuickTransactionDefaultType({
        scope: 'cari',
        cariType: 'musteri',
        requestedType: 'alis',
      }),
    ).toBe('alis');
    expect(
      resolveScopedQuickTransactionDefaultType({
        scope: 'personel',
        requestedType: 'gelir',
      }),
    ).toBe('personel_gider_tab');
  });
});
