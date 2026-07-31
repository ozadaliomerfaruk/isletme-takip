import { useMemo } from 'react';
import { useHesaplar } from '@/hooks/useHesaplar';
import { useCariler } from '@/hooks/useCariler';
import { usePersonelList } from '@/hooks/usePersonel';
import { useUrunler } from '@/hooks/useUrunler';
import { useTransactionAccountRefs } from '@/hooks/useCariPaymentAccountRefs';
import { usePermissions } from '@/hooks/usePermissions';
import { supportsQuickTransactionProducts } from '@/lib/productSelectionGuard';
import { searchMatchesTr } from '@/lib/turkishTextUtils';
import type {
  QuickTransactionCreateScope,
  QuickTransactionMinimalAccountScope,
} from '@/lib/quickTransactionCreateScope';
import type { TransactionType, TahsilatHedefType, HesapPickerTarget } from '../types';
import type { CariType, Urun } from '@/types/database';

interface UseQuickTransactionEntitiesOptions {
  // Mode flags
  isCariMode: boolean;
  minimalAccountReferenceMode?: QuickTransactionMinimalAccountScope;
  /** @deprecated minimalAccountReferenceMode kullanın. */
  cariMinimalAccountMode?: boolean;
  createScope?: QuickTransactionCreateScope;
  defaultCariType?: CariType;
  // Type
  type: TransactionType;
  tahsilatHedefType: TahsilatHedefType;
  // IDs
  hesapId: string | undefined;
  sourceHesapId: string | null;
  hedefHesapId: string | null;
  cariId: string | null;
  personelId: string | null;
  // Picker target
  hesapPickerTarget: HesapPickerTarget;
  // Search queries
  hesapSearchQuery: string;
  cariSearchQuery: string;
  personelSearchQuery: string;
  urunSearchQuery: string;
}

interface Hesap {
  id: string;
  name: string;
  balance?: number;
  currency?: string;
  type?: string;
}

interface Cari {
  id: string;
  name: string;
  balance: number;
  currency: string;
}

interface Personel {
  id: string;
  first_name: string;
  last_name: string | null;
  balance: number;
  currency: string;
}

interface UseQuickTransactionEntitiesReturn {
  // Raw data
  hesaplar: Hesap[] | undefined;
  tedarikciCariler: Cari[] | undefined;
  musteriCariler: Cari[] | undefined;
  personelList: Personel[] | undefined;
  urunler: Urun[] | undefined;

  // Selected entities
  selectedHesap: Hesap | undefined;
  selectedSourceHesap: Hesap | undefined;
  selectedHedefHesap: Hesap | undefined;
  selectedCari: Cari | undefined;
  selectedPersonel: Personel | undefined;
  selectedKrediKarti: Hesap | undefined;

  // Computed lists
  carilerForType: Cari[] | undefined;
  krediKartiHesaplari: Hesap[];

  // Filtered lists for search
  filteredHesaplar: Hesap[];
  filteredCariler: Cari[];
  filteredPersonel: Personel[];
  filteredUrunler: Urun[];

  // Ürün flags
  hasUrunler: boolean;
}

export function useQuickTransactionEntities({
  isCariMode,
  minimalAccountReferenceMode,
  cariMinimalAccountMode = false,
  createScope,
  defaultCariType,
  type,
  tahsilatHedefType,
  hesapId,
  sourceHesapId,
  hedefHesapId,
  cariId,
  personelId,
  hesapPickerTarget,
  hesapSearchQuery,
  cariSearchQuery,
  personelSearchQuery,
  urunSearchQuery,
}: UseQuickTransactionEntitiesOptions): UseQuickTransactionEntitiesReturn {
  const { canAccessModule } = usePermissions();
  const accountReferenceScope =
    minimalAccountReferenceMode
    ?? (cariMinimalAccountMode ? 'cari' : undefined);
  const isScopedCariCreate = createScope === 'cari';
  const isScopedPersonelCreate = createScope === 'personel';
  const isScopedHesapCreate = createScope === 'hesap';
  const isCariCashType = type === 'odeme' || type === 'tahsilat';
  const isPersonelCashType =
    type === 'personel_odeme_tab' || type === 'personel_tahsilat_tab';
  const isProductType = supportsQuickTransactionProducts(type);

  const shouldLoadMinimalHesaplar =
    !!accountReferenceScope
    && canAccessModule(
      accountReferenceScope === 'cari' ? 'cariler' : 'personel',
    )
    && !canAccessModule('hesaplar')
    && (
      (accountReferenceScope === 'cari' && isScopedCariCreate && isCariCashType)
      || (
        accountReferenceScope === 'personel'
        && isScopedPersonelCreate
        && isPersonelCashType
      )
    );
  const shouldLoadFullHesaplar =
    canAccessModule('hesaplar')
    && (
      !createScope
      || isScopedHesapCreate
      || (isScopedCariCreate && isCariCashType)
      || (isScopedPersonelCreate && isPersonelCashType)
    );
  const shouldLoadTedarikciCariler =
    canAccessModule('cariler')
    && (
      !createScope
      || (isScopedCariCreate && defaultCariType === 'tedarikci')
    );
  const shouldLoadMusteriCariler =
    canAccessModule('cariler')
    && (
      !createScope
      || (isScopedCariCreate && defaultCariType !== 'tedarikci')
    );
  const shouldLoadPersonel =
    canAccessModule('personel')
    && (!createScope || isScopedPersonelCreate);
  const shouldLoadUrunler =
    canAccessModule('urunler')
    && (
      !createScope
      || ((isScopedCariCreate || isScopedHesapCreate) && isProductType)
    );

  // Keep hook order stable, but enable only the entity families required by the
  // active scoped create type. Disabled React Query results are masked below.
  const { data: fullHesaplar } = useHesaplar(
    false,
    false,
    shouldLoadFullHesaplar,
  );
  const { data: minimalHesaplar } = useTransactionAccountRefs(
    accountReferenceScope ?? 'cari',
    shouldLoadMinimalHesaplar,
  );
  const { data: fullTedarikciCariler } = useCariler(
    'tedarikci',
    false,
    false,
    shouldLoadTedarikciCariler,
  );
  const { data: fullMusteriCariler } = useCariler(
    'musteri',
    false,
    false,
    shouldLoadMusteriCariler,
  );
  const { data: fullPersonelList } = usePersonelList(
    false,
    false,
    shouldLoadPersonel,
  );
  const { data: fullUrunler } = useUrunler(false, shouldLoadUrunler);

  // `enabled: false` React Query cache'ini bosaltmaz. A live permission/scope
  // downgrade must therefore cut cached values explicitly as well.
  const hesaplar = shouldLoadMinimalHesaplar
    ? minimalHesaplar
    : shouldLoadFullHesaplar
      ? fullHesaplar
      : undefined;
  const tedarikciCariler = shouldLoadTedarikciCariler
    ? fullTedarikciCariler
    : undefined;
  const musteriCariler = shouldLoadMusteriCariler
    ? fullMusteriCariler
    : undefined;
  const personelList = shouldLoadPersonel ? fullPersonelList : undefined;
  const urunler = shouldLoadUrunler ? fullUrunler : undefined;

  // Check if user has any products (for showing stock button)
  const hasUrunler = useMemo(() => {
    return (urunler?.length || 0) > 0;
  }, [urunler]);

  // Selected entities - memoized to prevent unnecessary re-renders
  const selectedHesap = useMemo(
    () => hesaplar?.find((h) => h.id === hesapId),
    [hesaplar, hesapId]
  );

  const selectedSourceHesap = useMemo(
    () => hesaplar?.find((h) => h.id === sourceHesapId),
    [hesaplar, sourceHesapId]
  );

  const selectedHedefHesap = useMemo(
    () => hesaplar?.find((h) => h.id === hedefHesapId),
    [hesaplar, hedefHesapId]
  );

  // Cari list based on mode and type
  const carilerForType = useMemo(() => {
    if (isCariMode) {
      return defaultCariType === 'tedarikci' ? tedarikciCariler : musteriCariler;
    }
    // Normal mode: based on type and selected target type
    if (type === 'odeme') {
      return tedarikciCariler;
    }
    if (type === 'tahsilat') {
      return tahsilatHedefType === 'tedarikci' ? tedarikciCariler : musteriCariler;
    }
    if (type === 'alis') {
      return tedarikciCariler;   // (direkt QTB) taksitli/normal alış → tedarikçi
    }
    return musteriCariler;       // satış (+ varsayılan) → müşteri
  }, [isCariMode, defaultCariType, type, tahsilatHedefType, tedarikciCariler, musteriCariler]);

  const selectedCari = useMemo(
    () => carilerForType?.find((c) => c.id === cariId),
    [carilerForType, cariId]
  );

  const selectedPersonel = useMemo(
    () => personelList?.find((p) => p.id === personelId),
    [personelList, personelId]
  );

  // Credit card accounts
  const krediKartiHesaplari = useMemo(() => {
    return hesaplar?.filter((h) => h.type === 'kredi_karti') || [];
  }, [hesaplar]);

  // Selected credit card
  const selectedKrediKarti = useMemo(
    () => hesaplar?.find((h) => h.id === hedefHesapId && h.type === 'kredi_karti'),
    [hesaplar, hedefHesapId]
  );

  // Filtered lists for search
  const filteredHesaplar = useMemo(() => {
    // Source picker shows all accounts, target picker excludes source
    const list =
      hesapPickerTarget === 'source'
        ? hesaplar || []
        : hesaplar?.filter((h) => h.id !== hesapId) || [];
    if (!hesapSearchQuery.trim()) return list;
    return list.filter((h) => searchMatchesTr(h.name, hesapSearchQuery));
  }, [hesaplar, hesapId, hesapSearchQuery, hesapPickerTarget]);

  const filteredCariler = useMemo(() => {
    if (!carilerForType) return [];
    if (!cariSearchQuery.trim()) return carilerForType;
    return carilerForType.filter((c) => searchMatchesTr(c.name, cariSearchQuery));
  }, [carilerForType, cariSearchQuery]);

  const filteredPersonel = useMemo(() => {
    if (!personelList) return [];
    if (!personelSearchQuery.trim()) return personelList;
    return personelList.filter((p) =>
      searchMatchesTr(`${p.first_name} ${p.last_name}`, personelSearchQuery)
    );
  }, [personelList, personelSearchQuery]);

  const filteredUrunler = useMemo(() => {
    if (!urunler) return [];
    if (!urunSearchQuery.trim()) return urunler;
    return urunler.filter((u) =>
      searchMatchesTr(u.ad, urunSearchQuery) ||
      (u.kod && searchMatchesTr(u.kod, urunSearchQuery))
    );
  }, [urunler, urunSearchQuery]);

  return {
    // Raw data
    hesaplar,
    tedarikciCariler,
    musteriCariler,
    personelList,
    urunler,

    // Selected entities
    selectedHesap,
    selectedSourceHesap,
    selectedHedefHesap,
    selectedCari,
    selectedPersonel,
    selectedKrediKarti,

    // Computed lists
    carilerForType,
    krediKartiHesaplari,

    // Filtered lists
    filteredHesaplar,
    filteredCariler,
    filteredPersonel,
    filteredUrunler,

    // Ürün flags
    hasUrunler,
  };
}
