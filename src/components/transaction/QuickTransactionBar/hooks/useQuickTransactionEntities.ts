import { useMemo } from 'react';
import { useHesaplar } from '@/hooks/useHesaplar';
import { useCariler } from '@/hooks/useCariler';
import { usePersonelList } from '@/hooks/usePersonel';
import { useUrunler } from '@/hooks/useUrunler';
import type { TransactionType, TahsilatHedefType, HesapPickerTarget } from '../types';
import type { CariType, Urun } from '@/types/database';

interface UseQuickTransactionEntitiesOptions {
  // Mode flags
  isCariMode: boolean;
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
  balance: number;
  currency?: string;
  type?: string;
}

interface Cari {
  id: string;
  name: string;
  balance: number;
}

interface Personel {
  id: string;
  first_name: string;
  last_name: string | null;
  balance: number;
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

  // Stok flags
  hasUrunler: boolean;
}

export function useQuickTransactionEntities({
  isCariMode,
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
  // Data hooks
  const { data: hesaplar } = useHesaplar();
  const { data: tedarikciCariler } = useCariler('tedarikci');
  const { data: musteriCariler } = useCariler('musteri');
  const { data: personelList } = usePersonelList();
  const { data: urunler } = useUrunler();

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
    return musteriCariler;
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
    const query = hesapSearchQuery.toLowerCase().trim();
    return list.filter((h) => h.name.toLowerCase().includes(query));
  }, [hesaplar, hesapId, hesapSearchQuery, hesapPickerTarget]);

  const filteredCariler = useMemo(() => {
    if (!carilerForType) return [];
    if (!cariSearchQuery.trim()) return carilerForType;
    const query = cariSearchQuery.toLowerCase().trim();
    return carilerForType.filter((c) => c.name.toLowerCase().includes(query));
  }, [carilerForType, cariSearchQuery]);

  const filteredPersonel = useMemo(() => {
    if (!personelList) return [];
    if (!personelSearchQuery.trim()) return personelList;
    const query = personelSearchQuery.toLowerCase().trim();
    return personelList.filter((p) =>
      `${p.first_name} ${p.last_name}`.toLowerCase().includes(query)
    );
  }, [personelList, personelSearchQuery]);

  const filteredUrunler = useMemo(() => {
    if (!urunler) return [];
    if (!urunSearchQuery.trim()) return urunler;
    const query = urunSearchQuery.toLowerCase().trim();
    return urunler.filter((u) =>
      u.ad.toLowerCase().includes(query) ||
      (u.kod && u.kod.toLowerCase().includes(query))
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

    // Stok flags
    hasUrunler,
  };
}
