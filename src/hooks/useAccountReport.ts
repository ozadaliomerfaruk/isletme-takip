import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthContext } from '@/contexts/AuthContext';
import { queryKeys } from '@/lib/queryKeys';
import { KategoriType, HesapType, IslemWithRelations } from '@/types/database';
import { INCOME_TYPES, EXPENSE_TYPES } from '@/constants/islemTypes';
import { useSettings } from '@/hooks/useSettings';
import { useExchangeRates, convertCurrency } from '@/hooks/useExchangeRates';

/**
 * HESAP BAZLI gelir/gider raporu — "hangi hesap ne kadar gelir/gider gördü".
 * Kategori raporunun (useCategoryReport) hesaba göre kardeşi. Sunucu-taraflı
 * toplama (get_account_report RPC) kullanır; binlerce satır inmez.
 *
 * NOT: Yalnız BİR HESABA DÜŞEN işlemler gruplanır (RPC hesaba INNER JOIN yapar).
 * Kredili satış (cari_satis, hesabı yok) burada görünmez — semantik olarak doğru,
 * çünkü hangi hesaba düştüğü söylenemez. Bu yüzden hesap toplamı, kategori
 * raporundaki genel gelir toplamından KÜÇÜK olabilir (fark = hesaba düşmeyen gelir).
 */
export interface AccountReportItem {
  hesap: { id: string; name: string; type: HesapType };
  /** Hesabın kendi para birimi (ör. USD). */
  currency: string;
  /** Ana para birimine çevrilmiş toplam — yüzde/sıralama/kıyaslama için. */
  total: number;
  /** Hesabın KENDİ para biriminde toplam (dönüşümsuz) — birincil gösterim. */
  totalNative: number;
  count: number;
  percentage: number;
}

export interface AccountReportResult {
  items: AccountReportItem[];
  totalAmount: number;
  isLoading: boolean;
  isFetching: boolean;
  refetch: () => Promise<unknown>;
  error: Error | null;
}

interface UseAccountReportOptions {
  startDate: string;
  endDate: string;
}

function normalizeDateRange(startDate?: string, endDate?: string): { startDateTime: string; endDateTime: string } {
  const start = startDate || '';
  const end = endDate || '';
  const startDateTime = start.includes('T') ? start : `${start}T00:00:00`;
  const endDateTime = end.includes('T') ? end : `${end}T23:59:59`;
  return { startDateTime, endDateTime };
}

export function useAccountReport(
  type: KategoriType,
  options: UseAccountReportOptions
): AccountReportResult {
  const { isletme } = useAuthContext();
  const { currency: baseCurrency } = useSettings();
  const { data: ratesData } = useExchangeRates();
  const rates = ratesData?.rates;
  const { startDate, endDate } = options;
  const { startDateTime, endDateTime } = normalizeDateRange(startDate, endDate);

  const islemTypes = type === 'gider' ? EXPENSE_TYPES : INCOME_TYPES;

  const {
    data,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useQuery({
    queryKey: queryKeys.reports.accountReport(isletme?.id ?? '', type, startDateTime, endDateTime),
    queryFn: async () => {
      if (!isletme) return [];

      const { data, error } = await supabase.rpc('get_account_report', {
        p_isletme_id: isletme.id,
        p_types: islemTypes as string[],
        p_start_date: startDateTime,
        p_end_date: endDateTime,
      });

      if (error) {
        if (__DEV__) console.error('[useAccountReport] RPC error:', error.message, error.code);
        throw error;
      }

      return (data || []) as Array<{
        hesap_id: string;
        hesap_adi: string | null;
        hesap_type: string | null;
        hesap_currency: string | null;
        islem_count: number;
        total_amount: number;
        total_native: number;
      }>;
    },
    enabled: !!isletme && !!startDate && !!endDate,
    meta: { query_purpose: 'reports:account' },
  });

  const result = useMemo(() => {
    // RPC tutarları TRY cinsindendir; ana para birimine çevir (TR için no-op).
    const conv = (v: number) =>
      baseCurrency === 'TRY' ? v : (convertCurrency(v, 'TRY', baseCurrency, rates) ?? v);

    if (!data || data.length === 0) {
      return { items: [] as AccountReportItem[], totalAmount: 0 };
    }

    let totalAmount = 0;
    const rows = data
      .filter((r) => r.hesap_id)
      .map((r) => {
        const total = conv(Number(r.total_amount) || 0);
        totalAmount += total;
        return {
          hesap: {
            id: r.hesap_id,
            name: r.hesap_adi || '—',
            type: (r.hesap_type || 'diger') as HesapType,
          },
          currency: r.hesap_currency || 'TRY',
          total,
          totalNative: Number(r.total_native) || 0,
          count: Number(r.islem_count) || 0,
        };
      });

    const items: AccountReportItem[] = rows
      .map((r) => ({
        ...r,
        percentage: totalAmount > 0 ? (r.total / totalAmount) * 100 : 0,
      }))
      .sort((a, b) => b.total - a.total);

    return { items, totalAmount };
  }, [data, baseCurrency, rates]);

  return {
    ...result,
    isLoading,
    isFetching,
    refetch,
    error: error as Error | null,
  };
}

/**
 * Bir hesabın dönem içi GELİR (ya da gider) işlemleri — hesap kartı drill-down'ı için.
 * useAccountReport ile AYNI tip kümesi (INCOME_TYPES) + hesap filtresi → get_account_report'un
 * saydığı satırlarla tutarlı. İşlemler doğrudan islemler'den (ilişkilerle) çekilir.
 */
export function useAccountTransactions(
  hesapId: string,
  type: KategoriType,
  options: UseAccountReportOptions
) {
  const { isletme } = useAuthContext();
  const { startDate, endDate } = options;
  const { startDateTime, endDateTime } = normalizeDateRange(startDate, endDate);
  const islemTypes = type === 'gider' ? EXPENSE_TYPES : INCOME_TYPES;

  return useQuery({
    queryKey: queryKeys.reports.accountTransactions(isletme?.id ?? '', hesapId, type, startDateTime, endDateTime),
    queryFn: async () => {
      if (!isletme || !hesapId) return [] as IslemWithRelations[];
      const { data, error } = await supabase
        .from('islemler')
        .select(`
          *,
          hesap:hesaplar!hesap_id(id,name,currency,type,is_active),
          kategori:kategoriler(id,name),
          cari:cariler(id,name,type),
          personel:personel(id,first_name,last_name)
        `)
        .eq('isletme_id', isletme.id)
        .eq('hesap_id', hesapId)
        .in('type', islemTypes as string[])
        .gte('date', startDateTime)
        .lte('date', endDateTime)
        .order('date', { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as IslemWithRelations[];
    },
    enabled: !!isletme && !!hesapId && !!startDate && !!endDate,
    meta: { query_purpose: 'reports:account-transactions' },
  });
}

// ============================================================================
// GELİR KAYNAK RAPORU — hesap + cari (kredili satış) + personel satışları
// ============================================================================

export type IncomeSourceKind = 'hesap' | 'cari' | 'personel';

export interface IncomeSourceItem {
  kind: IncomeSourceKind;
  type: string; // hesap.type (banka/nakit/...) ya da 'cari' / 'personel'
  id: string;
  name: string;
  currency: string;
  total: number; // ana para birimine çevrilmiş (yüzde/sıralama)
  totalNative: number; // kaynağın kendi para biriminde
  count: number;
  percentage: number;
}

export interface IncomeSourceGroup {
  key: string; // grup anahtarı: hesap tipi ('banka'/'nakit'/...) ya da 'cari' / 'personel'
  kind: IncomeSourceKind;
  total: number;
  count: number;
  items: IncomeSourceItem[];
}

export interface IncomeSourceResult {
  groups: IncomeSourceGroup[];
  totalAmount: number;
  totalCount: number;
  isLoading: boolean;
  isFetching: boolean;
  refetch: () => Promise<unknown>;
  error: Error | null;
}

/**
 * Gelir KAYNAĞINA göre kırılım: hesaba düşen gelir (gelir) + müşteri kredili
 * satışları (cari_satis) + personel satışları (personel_satis). Kaynak türüne
 * göre gruplu döner. get_account_report'un aksine cari/personel'i DIŞLAMAZ →
 * gelir eksik gösterilmez. Bkz. get_income_by_source RPC.
 */
export function useIncomeSourceReport(options: UseAccountReportOptions): IncomeSourceResult {
  const { isletme } = useAuthContext();
  const { currency: baseCurrency } = useSettings();
  const { data: ratesData } = useExchangeRates();
  const rates = ratesData?.rates;
  const { startDate, endDate } = options;
  const { startDateTime, endDateTime } = normalizeDateRange(startDate, endDate);

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: queryKeys.reports.incomeBySource(isletme?.id ?? '', startDateTime, endDateTime),
    queryFn: async () => {
      if (!isletme) return [];
      const { data, error } = await supabase.rpc('get_income_by_source', {
        p_isletme_id: isletme.id,
        p_start_date: startDateTime,
        p_end_date: endDateTime,
      });
      if (error) {
        if (__DEV__) console.error('[useIncomeSourceReport] RPC error:', error.message, error.code);
        throw error;
      }
      return (data || []) as Array<{
        source_kind: string;
        source_type: string;
        source_id: string;
        source_name: string | null;
        source_currency: string | null;
        islem_count: number;
        total_amount: number;
        total_native: number;
      }>;
    },
    enabled: !!isletme && !!startDate && !!endDate,
    meta: { query_purpose: 'reports:income-source' },
  });

  const result = useMemo(() => {
    const conv = (v: number) =>
      baseCurrency === 'TRY' ? v : (convertCurrency(v, 'TRY', baseCurrency, rates) ?? v);

    if (!data || data.length === 0) {
      return { groups: [] as IncomeSourceGroup[], totalAmount: 0, totalCount: 0 };
    }

    let totalAmount = 0;
    let totalCount = 0;
    const items: IncomeSourceItem[] = data
      .filter((r) => r.source_id)
      .map((r) => {
        const total = conv(Number(r.total_amount) || 0);
        totalAmount += total;
        const count = Number(r.islem_count) || 0;
        totalCount += count;
        return {
          kind: r.source_kind as IncomeSourceKind,
          type: r.source_type,
          id: r.source_id,
          name: r.source_name || '—',
          currency: r.source_currency || 'TRY',
          total,
          totalNative: Number(r.total_native) || 0,
          count,
          percentage: 0,
        };
      });

    items.forEach((it) => {
      it.percentage = totalAmount > 0 ? (it.total / totalAmount) * 100 : 0;
    });

    // Grupla: hesap → tipine göre (banka/nakit/...); cari → 'cari'; personel → 'personel'
    const groupMap = new Map<string, IncomeSourceGroup>();
    for (const it of items) {
      const key = it.kind === 'hesap' ? it.type : it.kind;
      let g = groupMap.get(key);
      if (!g) {
        g = { key, kind: it.kind, total: 0, count: 0, items: [] };
        groupMap.set(key, g);
      }
      g.items.push(it);
      g.total += it.total;
      g.count += it.count;
    }

    const groups = Array.from(groupMap.values())
      .map((g) => ({ ...g, items: g.items.slice().sort((a, b) => b.total - a.total) }))
      .sort((a, b) => b.total - a.total);

    return { groups, totalAmount, totalCount };
  }, [data, baseCurrency, rates]);

  return { ...result, isLoading, isFetching, refetch, error: error as Error | null };
}

/**
 * Bir gelir KAYNAĞININ (hesap/cari/personel) dönem içi gelir işlemleri — drill-down.
 * hesap→'gelir'/hesap_id, cari→'cari_satis'/cari_id, personel→'personel_satis'/personel_id.
 */
export function useIncomeSourceTransactions(
  kind: IncomeSourceKind,
  sourceId: string,
  options: UseAccountReportOptions
) {
  const { isletme } = useAuthContext();
  const { startDate, endDate } = options;
  const { startDateTime, endDateTime } = normalizeDateRange(startDate, endDate);

  const config =
    kind === 'cari'
      ? { islemType: 'cari_satis', field: 'cari_id' }
      : kind === 'personel'
      ? { islemType: 'personel_satis', field: 'personel_id' }
      : { islemType: 'gelir', field: 'hesap_id' };

  return useQuery({
    queryKey: queryKeys.reports.incomeSourceTransactions(isletme?.id ?? '', kind, sourceId, startDateTime, endDateTime),
    queryFn: async () => {
      if (!isletme || !sourceId) return [] as IslemWithRelations[];
      const { data, error } = await supabase
        .from('islemler')
        .select(`
          *,
          hesap:hesaplar!hesap_id(id,name,currency,type,is_active),
          kategori:kategoriler(id,name),
          cari:cariler(id,name,type),
          personel:personel(id,first_name,last_name)
        `)
        .eq('isletme_id', isletme.id)
        .eq(config.field, sourceId)
        .eq('type', config.islemType)
        .gte('date', startDateTime)
        .lte('date', endDateTime)
        .order('date', { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as IslemWithRelations[];
    },
    enabled: !!isletme && !!sourceId && !!startDate && !!endDate,
    meta: { query_purpose: 'reports:income-source-transactions' },
  });
}
