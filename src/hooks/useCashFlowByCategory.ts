import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthContext } from '@/contexts/AuthContext';
import { Kategori, IslemType, HesapType } from '@/types/database';

/**
 * Nakit akışına dahil hesap tipleri (kredi kartı HARİÇ)
 */
const CASH_ACCOUNT_TYPES: HesapType[] = ['nakit', 'banka', 'birikim', 'diger']; // kredi_karti hariç

/**
 * Nakit girişi yapan işlem tipleri (hesaba para GİREN)
 */
const CASH_INFLOW_TYPES: IslemType[] = ['gelir', 'cari_tahsilat'];

/**
 * Nakit çıkışı yapan işlem tipleri (hesaptan para ÇIKAN)
 */
const CASH_OUTFLOW_TYPES: IslemType[] = ['gider', 'cari_odeme', 'personel_gider', 'personel_odeme'];

/**
 * Nakit akışı kategori item'ı
 */
export interface CashFlowItem {
  kategori: Kategori | null;
  total: number;
  count: number;
  percentage: number;
  color: string;
}

/**
 * Nakit akışı hook sonucu
 */
export interface CashFlowByCategoryResult {
  outflowItems: CashFlowItem[];        // Top N + Diğer (çıkışlar)
  allOutflowItems: CashFlowItem[];     // Tüm çıkış kategorileri
  inflowItems: CashFlowItem[];         // Top N + Diğer (girişler)
  allInflowItems: CashFlowItem[];      // Tüm giriş kategorileri
  totalInflow: number;                 // Toplam nakit girişi
  totalOutflow: number;                // Toplam nakit çıkışı
  netCashFlow: number;                 // Net nakit akışı (giriş - çıkış)
  creditCardSpendingItems: CashFlowItem[];    // Kredi kartı harcamaları (kategorilere göre)
  allCreditCardSpendingItems: CashFlowItem[]; // Tüm kredi kartı harcama kategorileri
  totalCreditCardSpending: number;            // Toplam kredi kartı harcaması
  isLoading: boolean;
  error: Error | null;
}

interface UseCashFlowByCategoryOptions {
  startDate: string;
  endDate: string;
  limit?: number;  // Varsayılan 10
}

/**
 * Tarih string'ini tam gün formatına normalize eder
 * YYYY-MM-DD -> YYYY-MM-DDTHH:MM:SS formatına çevirir
 */
function normalizeDateRange(start: string, end: string): { startDateTime: string; endDateTime: string } {
  const startDateTime = start.includes('T') ? start : `${start}T00:00:00`;
  const endDateTime = end.includes('T') ? end : `${end}T23:59:59`;
  return { startDateTime, endDateTime };
}

// Varsayılan renk paleti
const COLORS = [
  '#EF4444', '#F97316', '#EAB308', '#22C55E', '#10B981',
  '#14B8A6', '#06B6D4', '#3B82F6', '#6366F1', '#8B5CF6',
  '#A855F7', '#D946EF', '#EC4899', '#F43F5E',
];

/**
 * Kategorilere göre nakit akışını hesaplayan hook.
 *
 * Önemli: Nakit akışı hesap tipine göre belirlenir.
 * - Kredi kartı HARİÇ tüm hesaplara yapılan girişler = Nakit Girişi
 * - Kredi kartı HARİÇ tüm hesaplardan yapılan çıkışlar = Nakit Çıkışı
 */
export function useCashFlowByCategory(
  options: UseCashFlowByCategoryOptions
): CashFlowByCategoryResult {
  const { isletme } = useAuthContext();
  const { startDate, endDate, limit = 10 } = options;

  // Tarih aralığını normalize et (gün sonuna kadar dahil etmek için)
  const { startDateTime, endDateTime } = normalizeDateRange(startDate, endDate);

  // İşlemleri çek (hesap ve kategori bilgisi dahil)
  const {
    data: islemler,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['cash-flow-by-category', isletme?.id, startDate, endDate],
    queryFn: async () => {
      if (!isletme) return [];

      // Transfer işlemlerini de dahil et (kredi kartına ödeme için)
      const allTypes = [...CASH_INFLOW_TYPES, ...CASH_OUTFLOW_TYPES, 'transfer'];

      const { data, error } = await supabase
        .from('islemler')
        .select(`
          id,
          type,
          amount,
          kategori_id,
          hesap_id,
          hedef_hesap_id,
          kategori:kategoriler(*),
          hesap:hesaplar!hesap_id(id, type),
          hedef_hesap:hesaplar!hedef_hesap_id(id, type)
        `)
        .eq('isletme_id', isletme.id)
        .in('type', allTypes)
        .gte('date', startDateTime)
        .lte('date', endDateTime);

      if (error) throw error;

      // Supabase bazen array döndürüyor, normalize et
      return data.map((item: any) => ({
        ...item,
        kategori: Array.isArray(item.kategori) ? item.kategori[0] || null : item.kategori,
        hesap: Array.isArray(item.hesap) ? item.hesap[0] || null : item.hesap,
        hedef_hesap: Array.isArray(item.hedef_hesap) ? item.hedef_hesap[0] || null : item.hedef_hesap,
      }));
    },
    enabled: !!isletme && !!startDate && !!endDate,
  });

  // Gruplama ve hesaplama
  const result = useMemo(() => {
    if (!islemler || islemler.length === 0) {
      return {
        outflowItems: [],
        allOutflowItems: [],
        inflowItems: [],
        allInflowItems: [],
        totalInflow: 0,
        totalOutflow: 0,
        netCashFlow: 0,
        creditCardSpendingItems: [],
        allCreditCardSpendingItems: [],
        totalCreditCardSpending: 0,
      };
    }

    let totalInflow = 0;
    let totalOutflow = 0;
    let totalCreditCardSpending = 0;
    const outflowByCategory = new Map<string, { kategori: Kategori | null; total: number; count: number }>();
    const inflowByCategory = new Map<string, { kategori: Kategori | null; total: number; count: number }>();
    const creditCardSpendingByCategory = new Map<string, { kategori: Kategori | null; total: number; count: number }>();

    islemler.forEach((islem: any) => {
      // NaN-safe number parsing - geçersiz değerler için 0 kullan
      const rawAmount = Number(islem.amount);
      const amount = isNaN(rawAmount) ? 0 : rawAmount;

      // Geçersiz tutar varsa atla (opsiyonel: geliştirme modunda uyarı ver)
      if (isNaN(rawAmount) && __DEV__) {
        console.warn(`[CashFlow] Invalid amount for transaction ${islem.id}: ${islem.amount}`);
      }

      const hesapType = islem.hesap?.type as HesapType | undefined;
      const hedefHesapType = islem.hedef_hesap?.type as HesapType | undefined;
      const islemType = islem.type as IslemType;

      // Transfer işlemi için özel kontrol
      if (islemType === 'transfer') {
        // Kaynak hesap nakit hesabı ise (kredi kartı değil) → nakit çıkışı
        if (hesapType && CASH_ACCOUNT_TYPES.includes(hesapType)) {
          // Hedef hesap kredi kartı ise bu bir kredi kartı ödemesi
          // Hedef hesap da nakit hesabı ise net etki 0 (hesaplar arası transfer)
          if (hedefHesapType === 'kredi_karti') {
            // Nakit hesaptan kredi kartına ödeme = nakit çıkışı
            totalOutflow += amount;

            // Kategoriye ekle
            const kategoriKey = islem.kategori?.id || 'uncategorized';
            const existing = outflowByCategory.get(kategoriKey);
            if (existing) {
              existing.total += amount;
              existing.count += 1;
            } else {
              outflowByCategory.set(kategoriKey, {
                kategori: islem.kategori || null,
                total: amount,
                count: 1
              });
            }
          }
          // Else: Nakit hesaplar arası transfer, net etki 0 - dahil etme
        }
        return; // Transfer işlemini işledik, devam et
      }

      // Nakit girişi kontrolü
      if (CASH_INFLOW_TYPES.includes(islemType)) {
        // Hesap tipi kredi kartı değilse nakit girişi
        if (hesapType && CASH_ACCOUNT_TYPES.includes(hesapType)) {
          totalInflow += amount;

          // Kategoriye ekle
          const kategoriKey = islem.kategori?.id || 'uncategorized';
          const existing = inflowByCategory.get(kategoriKey);
          if (existing) {
            existing.total += amount;
            existing.count += 1;
          } else {
            inflowByCategory.set(kategoriKey, {
              kategori: islem.kategori || null,
              total: amount,
              count: 1
            });
          }
        }
      }

      // Nakit çıkışı kontrolü
      if (CASH_OUTFLOW_TYPES.includes(islemType)) {
        // Hesap tipi kredi kartı ise kredi kartı harcaması olarak kaydet
        if (hesapType === 'kredi_karti') {
          totalCreditCardSpending += amount;

          // Kategoriye ekle
          const kategoriKey = islem.kategori?.id || 'uncategorized';
          const existing = creditCardSpendingByCategory.get(kategoriKey);
          if (existing) {
            existing.total += amount;
            existing.count += 1;
          } else {
            creditCardSpendingByCategory.set(kategoriKey, {
              kategori: islem.kategori || null,
              total: amount,
              count: 1
            });
          }
        }
        // Hesap tipi kredi kartı değilse nakit çıkışı
        else if (hesapType && CASH_ACCOUNT_TYPES.includes(hesapType)) {
          totalOutflow += amount;

          // Kategoriye ekle
          const kategoriKey = islem.kategori?.id || 'uncategorized';
          const existing = outflowByCategory.get(kategoriKey);
          if (existing) {
            existing.total += amount;
            existing.count += 1;
          } else {
            outflowByCategory.set(kategoriKey, {
              kategori: islem.kategori || null,
              total: amount,
              count: 1
            });
          }
        }
      }
    });

    // Çıkışlar - Sırayla (büyükten küçüğe)
    const allOutflowItems: CashFlowItem[] = Array.from(outflowByCategory.values())
      .sort((a, b) => b.total - a.total)
      .map((value, index) => ({
        kategori: value.kategori,
        total: value.total,
        count: value.count,
        percentage: totalOutflow > 0 ? (value.total / totalOutflow) * 100 : 0,
        color: value.kategori?.color || COLORS[index % COLORS.length],
      }));

    // Çıkışlar - Top N + Diğer
    const topOutflowItems = allOutflowItems.slice(0, limit);
    const otherOutflowItems = allOutflowItems.slice(limit);
    const otherOutflowTotal = otherOutflowItems.reduce((acc, item) => acc + item.total, 0);
    const otherOutflowCount = otherOutflowItems.reduce((acc, item) => acc + item.count, 0);

    let outflowItems = [...topOutflowItems];
    if (otherOutflowTotal > 0) {
      outflowItems.push({
        kategori: null,
        total: otherOutflowTotal,
        count: otherOutflowCount,
        percentage: totalOutflow > 0 ? (otherOutflowTotal / totalOutflow) * 100 : 0,
        color: '#9CA3AF', // Gri
      });
    }

    // Girişler - Sırayla (büyükten küçüğe)
    const allInflowItems: CashFlowItem[] = Array.from(inflowByCategory.values())
      .sort((a, b) => b.total - a.total)
      .map((value, index) => ({
        kategori: value.kategori,
        total: value.total,
        count: value.count,
        percentage: totalInflow > 0 ? (value.total / totalInflow) * 100 : 0,
        color: value.kategori?.color || COLORS[index % COLORS.length],
      }));

    // Girişler - Top N + Diğer
    const topInflowItems = allInflowItems.slice(0, limit);
    const otherInflowItems = allInflowItems.slice(limit);
    const otherInflowTotal = otherInflowItems.reduce((acc, item) => acc + item.total, 0);
    const otherInflowCount = otherInflowItems.reduce((acc, item) => acc + item.count, 0);

    let inflowItems = [...topInflowItems];
    if (otherInflowTotal > 0) {
      inflowItems.push({
        kategori: null,
        total: otherInflowTotal,
        count: otherInflowCount,
        percentage: totalInflow > 0 ? (otherInflowTotal / totalInflow) * 100 : 0,
        color: '#9CA3AF', // Gri
      });
    }

    // Kredi Kartı Harcamaları - Sırayla (büyükten küçüğe)
    const allCreditCardSpendingItems: CashFlowItem[] = Array.from(creditCardSpendingByCategory.values())
      .sort((a, b) => b.total - a.total)
      .map((value, index) => ({
        kategori: value.kategori,
        total: value.total,
        count: value.count,
        percentage: totalCreditCardSpending > 0 ? (value.total / totalCreditCardSpending) * 100 : 0,
        color: value.kategori?.color || COLORS[index % COLORS.length],
      }));

    // Kredi Kartı Harcamaları - Top N + Diğer
    const topCreditCardSpendingItems = allCreditCardSpendingItems.slice(0, limit);
    const otherCreditCardSpendingItems = allCreditCardSpendingItems.slice(limit);
    const otherCreditCardSpendingTotal = otherCreditCardSpendingItems.reduce((acc, item) => acc + item.total, 0);
    const otherCreditCardSpendingCount = otherCreditCardSpendingItems.reduce((acc, item) => acc + item.count, 0);

    let creditCardSpendingItems = [...topCreditCardSpendingItems];
    if (otherCreditCardSpendingTotal > 0) {
      creditCardSpendingItems.push({
        kategori: null,
        total: otherCreditCardSpendingTotal,
        count: otherCreditCardSpendingCount,
        percentage: totalCreditCardSpending > 0 ? (otherCreditCardSpendingTotal / totalCreditCardSpending) * 100 : 0,
        color: '#9CA3AF', // Gri
      });
    }

    // Floating-point precision fix: 2 ondalık basamağa yuvarla
    const roundedTotalInflow = Math.round(totalInflow * 100) / 100;
    const roundedTotalOutflow = Math.round(totalOutflow * 100) / 100;
    const roundedTotalCreditCardSpending = Math.round(totalCreditCardSpending * 100) / 100;

    return {
      outflowItems,
      allOutflowItems,
      inflowItems,
      allInflowItems,
      totalInflow: roundedTotalInflow,
      totalOutflow: roundedTotalOutflow,
      netCashFlow: Math.round((roundedTotalInflow - roundedTotalOutflow) * 100) / 100,
      creditCardSpendingItems,
      allCreditCardSpendingItems,
      totalCreditCardSpending: roundedTotalCreditCardSpending,
    };
  }, [islemler, limit]);

  return {
    ...result,
    isLoading,
    error: error as Error | null,
  };
}
