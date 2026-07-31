import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthContext } from '@/contexts/AuthContext';
import { Kategori, IslemType, HesapType } from '@/types/database';
import { CASH_INFLOW_TYPES, CASH_OUTFLOW_TYPES } from '@/constants/islemTypes';
import { queryKeys } from '@/lib/queryKeys';
import { fetchAllPages } from '@/lib/supabaseHelpers';
import { useSettings } from './useSettings';
import { useExchangeRates, convertCurrency } from './useExchangeRates';
import { usePermissions } from './usePermissions';
import { parseCashFlowReportProjectionRows } from '@/lib/reportPermissionProjection';

/**
 * Supabase query sonucu için tip tanımı
 * Join'lerden dönen nested objeler array veya tekil olabilir
 */
interface CashFlowQueryItem {
  id: string;
  type: string;
  amount: number;
  kategori_id: string | null;
  hesap_id: string | null;
  hedef_hesap_id: string | null;
  kategori:
    | { id: string; name: string }
    | { id: string; name: string }[]
    | null;
  hesap: { id: string; type: HesapType; is_active: boolean; currency: string | null } | { id: string; type: HesapType; is_active: boolean; currency: string | null }[] | null;
  hedef_hesap: { id: string; type: HesapType; is_active: boolean; currency: string | null } | { id: string; type: HesapType; is_active: boolean; currency: string | null }[] | null;
  cari: { is_active: boolean | null } | { is_active: boolean | null }[] | null;
  personel: { is_active: boolean | null } | { is_active: boolean | null }[] | null;
}

/**
 * Normalize edilmiş işlem tipi
 */
interface NormalizedCashFlowItem {
  id: string;
  type: string;
  amount: number;
  kategori_id: string | null;
  hesap_id: string | null;
  hedef_hesap_id: string | null;
  kategori: Kategori | null;
  hesap: { id: string; type: HesapType; is_active: boolean; currency: string | null } | null;
  hedef_hesap: { id: string; type: HesapType; is_active: boolean; currency: string | null } | null;
  cari: { is_active: boolean | null } | null;
  personel: { is_active: boolean | null } | null;
}

interface CashFlowContribution {
  id: string;
  flowKind: 'inflow' | 'outflow' | 'credit_card';
  amount: number;
  count: number;
  currency: string;
  kategori: Kategori | null;
}

/**
 * Nakit akışına dahil hesap tipleri (kredi kartı HARİÇ)
 */
const CASH_ACCOUNT_TYPES: HesapType[] = ['nakit', 'banka', 'birikim', 'diger']; // kredi_karti hariç

// CASH_INFLOW_TYPES ve CASH_OUTFLOW_TYPES: @/constants/islemTypes'dan import edilir

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
  conversionIncomplete: boolean;              // En az bir döviz işlemi kur olmadığı için dışarıda kaldı
  isLoading: boolean;
  isFetching: boolean;
  refetch: () => Promise<unknown>;
  error: Error | null;
}

interface UseCashFlowByCategoryOptions {
  startDate: string;
  endDate: string;
  limit?: number;  // Varsayılan 10
  enabled?: boolean;
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
  const { canAccessModule, isOwner } = usePermissions();
  // Nakit akışı genel rapordur. Hesaplar-only kullanıcı yalnız hesap bağlamsal
  // raporuna girebilir; bu işletme-geneli kırılım Raporlar izni gerektirir.
  const canSeeCashFlow = canAccessModule('raporlar');
  const { startDate, endDate, limit = 10, enabled = true } = options;
  const { currency: baseCurrency } = useSettings();
  const { data: exchangeRatesData } = useExchangeRates();
  const rates = exchangeRatesData?.rates;

  // Tarih aralığını normalize et (gün sonuna kadar dahil etmek için)
  const { startDateTime, endDateTime } = normalizeDateRange(startDate, endDate);

  // İşlemleri çek (hesap ve kategori bilgisi dahil)
  const {
    data: islemler,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useQuery({
    queryKey: queryKeys.reports.cashFlowByCategory(isletme?.id || '', startDate, endDate),
    queryFn: async () => {
      if (!canSeeCashFlow || !isletme) return [];

      if (!isOwner) {
        const { data, error } = await supabase.rpc(
          'get_nakit_akisi_raporu_v1',
          {
            p_isletme_id: isletme.id,
            p_start_date: startDateTime,
            p_end_date: endDateTime,
          },
        );
        if (error) throw error;

        return parseCashFlowReportProjectionRows(data).map(
          (row): CashFlowContribution => ({
            id: [
              row.flow_kind,
              row.kategori_id ?? 'uncategorized',
              row.currency,
            ].join(':'),
            flowKind: row.flow_kind,
            amount: row.total_amount,
            count: row.islem_count,
            currency: row.currency,
            kategori:
              row.kategori_id === null
                ? null
                : {
                    id: row.kategori_id,
                    isletme_id: isletme.id,
                    name: row.kategori_adi ?? '—',
                    type:
                      row.flow_kind === 'inflow' ? 'gelir' : 'gider',
                    icon: null,
                    color: row.kategori_renk,
                    parent_id: null,
                    mapped_gelir_kategori_id: null,
                    mapped_gider_kategori_id: null,
                    is_active: true,
                    created_by: null,
                    updated_by: null,
                    created_at: '',
                  },
          }),
        );
      }

      // Owner yolu mevcut doğrudan sorguyu korur. Shared reports-only kullanıcı
      // yukarıdaki aggregate RPC'den başka tablo yüzeyine düşmez.
      const allTypes = [...CASH_INFLOW_TYPES, ...CASH_OUTFLOW_TYPES, 'transfer'];

      const data = await fetchAllPages<CashFlowQueryItem>(() =>
        supabase
          .from('islemler')
          .select(`
            id,
            type,
            amount,
            kategori_id,
            hesap_id,
            hedef_hesap_id,
            kategori:kategoriler(id,name),
            hesap:hesaplar!hesap_id(id, type, is_active, currency),
            hedef_hesap:hesaplar!hedef_hesap_id(id, type, is_active, currency),
            cari:cariler(is_active),
            personel:personel(is_active)
          `)
          .eq('isletme_id', isletme.id)
          .in('type', allTypes)
          .gte('date', startDateTime)
          .lte('date', endDateTime)
          .order('date', { ascending: true })
          .order('id', { ascending: true })
      );

      // Supabase bazen array döndürüyor, normalize et
      // Pasif hesap/cari/personel'deki işlemleri filtrele (rapor RPC'leriyle tutarlı)
      const normalized = data
        .map((item): NormalizedCashFlowItem => {
          const categoryRef = Array.isArray(item.kategori)
            ? item.kategori[0] || null
            : item.kategori;
          const kategori: Kategori | null = categoryRef
            ? {
                id: categoryRef.id,
                isletme_id: isletme.id,
                name: categoryRef.name,
                type: CASH_INFLOW_TYPES.includes(item.type as IslemType)
                  ? 'gelir'
                  : 'gider',
                icon: null,
                color: null,
                parent_id: null,
                mapped_gelir_kategori_id: null,
                mapped_gider_kategori_id: null,
                is_active: true,
                created_by: null,
                updated_by: null,
                created_at: '',
              }
            : null;
          return {
            ...item,
            kategori,
            hesap: Array.isArray(item.hesap)
              ? item.hesap[0] || null
              : item.hesap,
            hedef_hesap: Array.isArray(item.hedef_hesap)
              ? item.hedef_hesap[0] || null
              : item.hedef_hesap,
            cari: Array.isArray(item.cari)
              ? item.cari[0] || null
              : item.cari,
            personel: Array.isArray(item.personel)
              ? item.personel[0] || null
              : item.personel,
          };
        })
        .filter((item) => {
          // Pasif hesaplardaki işlemleri hariç tut
          if (item.hesap && !item.hesap.is_active) return false;
          if (item.hedef_hesap && !item.hedef_hesap.is_active) return false;
          // Pasif cari/personel işlemlerini hariç tut (NULL-güvenli: yalnız açıkça is_active=false)
          if (item.cari?.is_active === false) return false;
          if (item.personel?.is_active === false) return false;
          return true;
        });

      const contributions: CashFlowContribution[] = [];
      normalized.forEach((item) => {
        const hesapType = item.hesap?.type;
        const hedefHesapType = item.hedef_hesap?.type;
        const currency = item.hesap?.currency || baseCurrency;
        const kategori = item.kategori || null;
        const amount = Number(item.amount);
        const type = item.type as IslemType;

        if (type === 'transfer') {
          if (
            hesapType
            && CASH_ACCOUNT_TYPES.includes(hesapType)
            && hedefHesapType === 'kredi_karti'
          ) {
            contributions.push({
              id: item.id,
              flowKind: 'outflow',
              amount,
              count: 1,
              currency,
              kategori,
            });
          }
          return;
        }

        if (
          CASH_INFLOW_TYPES.includes(type)
          && hesapType
          && CASH_ACCOUNT_TYPES.includes(hesapType)
        ) {
          contributions.push({
            id: item.id,
            flowKind: 'inflow',
            amount,
            count: 1,
            currency,
            kategori,
          });
        }

        if (CASH_OUTFLOW_TYPES.includes(type)) {
          if (hesapType === 'kredi_karti') {
            contributions.push({
              id: item.id,
              flowKind: 'credit_card',
              amount,
              count: 1,
              currency,
              kategori,
            });
          } else if (
            hesapType
            && CASH_ACCOUNT_TYPES.includes(hesapType)
          ) {
            contributions.push({
              id: item.id,
              flowKind: 'outflow',
              amount,
              count: 1,
              currency,
              kategori,
            });
          }
        }
      });

      return contributions;
    },
    enabled: enabled && canSeeCashFlow && !!isletme && !!startDate && !!endDate,
    meta: {
      persist: isOwner,
      query_purpose: isOwner
        ? 'islemler:cashflow'
        : 'reports:cashflow-v1',
    },
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
        conversionIncomplete: false,
      };
    }

    let conversionIncomplete = false;
    let totalInflow = 0;
    let totalOutflow = 0;
    let totalCreditCardSpending = 0;
    const outflowByCategory = new Map<string, { kategori: Kategori | null; total: number; count: number }>();
    const inflowByCategory = new Map<string, { kategori: Kategori | null; total: number; count: number }>();
    const creditCardSpendingByCategory = new Map<string, { kategori: Kategori | null; total: number; count: number }>();

    islemler.forEach((item: CashFlowContribution) => {
      // NaN-safe number parsing - geçersiz değerler atlanır
      const rawAmount = Number(item.amount);
      if (isNaN(rawAmount) || rawAmount === 0) {
        if (__DEV__) console.warn(`[CashFlow] Skipping contribution ${item.id}: invalid amount "${item.amount}"`);
        return;
      }

      // Owner yolunda her contribution tek işlem, reports-only RPC yolunda ise
      // kategori+para birimi aggregate'idir. İki yol da aynı conversion ve grup
      // motoruna girer; eksik kurda o contribution toplamdan çıkar.
      let amount = rawAmount;
      if (item.currency !== baseCurrency) {
        const converted = convertCurrency(
          rawAmount,
          item.currency,
          baseCurrency,
          rates,
        );
        if (converted === null) {
          conversionIncomplete = true;
          if (__DEV__) console.warn(`[CashFlow] Skipping ${item.id}: kur bulunamadı (${item.currency})`);
          return;
        }
        amount = converted;
      }

      const kategoriKey = item.kategori?.id || 'uncategorized';
      const targetMap =
        item.flowKind === 'inflow'
          ? inflowByCategory
          : item.flowKind === 'outflow'
            ? outflowByCategory
            : creditCardSpendingByCategory;
      const existing = targetMap.get(kategoriKey);
      if (existing) {
        existing.total += amount;
        existing.count += item.count;
      } else {
        targetMap.set(kategoriKey, {
          kategori: item.kategori,
          total: amount,
          count: item.count,
        });
      }

      if (item.flowKind === 'inflow') totalInflow += amount;
      else if (item.flowKind === 'outflow') totalOutflow += amount;
      else totalCreditCardSpending += amount;
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

    const outflowItems = [...topOutflowItems];
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

    const inflowItems = [...topInflowItems];
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

    const creditCardSpendingItems = [...topCreditCardSpendingItems];
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
      conversionIncomplete,
    };
  }, [islemler, limit, baseCurrency, rates]);

  return {
    ...result,
    isLoading,
    isFetching,
    refetch,
    error: error as Error | null,
  };
}
