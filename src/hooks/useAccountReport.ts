import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthContext } from '@/contexts/AuthContext';
import { queryKeys } from '@/lib/queryKeys';
import { KategoriType, HesapType, IslemWithRelations } from '@/types/database';
import { INCOME_TYPES, EXPENSE_TYPES } from '@/constants/islemTypes';
import { useSettings } from '@/hooks/useSettings';
import { useExchangeRates, createRpcTotalConverter } from '@/hooks/useExchangeRates';
import { fetchAllPages } from '@/lib/supabaseHelpers';
import { usePermissions } from '@/hooks/usePermissions';
import type {
  HistoricalIncomeExpenseLens,
  IncomeExpenseLens,
} from '@/lib/reportLens';

type ReportSourceModule = 'hesaplar' | 'cariler' | 'urunler' | 'personel';

const INCOME_SOURCE_REPORT_QUERY_META = {
  persist: false,
  query_purpose: 'reports:income-source-v2',
} as const;

const INCOME_SOURCE_DRILLDOWN_QUERY_META = {
  persist: false,
  query_purpose: 'reports:income-source-transactions-scoped-v3',
} as const;

const INCOME_SOURCE_DRILLDOWN_PAGE_SIZE = 100;

function useReportsEnabled(
  requiredModules: readonly ReportSourceModule[] = [],
): boolean {
  const { canAccessModule } = usePermissions();
  if (canAccessModule('raporlar')) return true;
  return (
    requiredModules.length > 0
    && requiredModules.every((module) => canAccessModule(module))
  );
}

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
  /** Kur bulunamadığı için bazı tutarlar ham TRY kaldı → uyarı gösterilmeli. */
  conversionIncomplete?: boolean;
  isLoading: boolean;
  isFetching: boolean;
  refetch: () => Promise<unknown>;
  error: Error | null;
}

interface UseAccountReportOptions {
  startDate: string;
  endDate: string;
  lens?: IncomeExpenseLens;
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
  const reportsEnabled = useReportsEnabled(['hesaplar']);
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
      if (!reportsEnabled || !isletme) return [];

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
    enabled: reportsEnabled && !!isletme && !!startDate && !!endDate,
    meta: { query_purpose: 'reports:account' },
  });

  const result = useMemo(() => {
    // RPC tutarları TRY cinsindendir; ana para birimine çevir (TR için no-op).
    // TEK politika: çevrilemezse ham TRY korunur ama conversionIncomplete kalkar (bkz.
    // createRpcTotalConverter) — eskiden sessizce ham TRY, baz para birimi etiketiyle basılıyordu.
    const converter = createRpcTotalConverter(baseCurrency, rates);
    const conv = converter.conv;

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

    // Kur bulunamadıysa ham TRY korunuyor → ekran uyarıyı göstersin (bkz. ConversionIncompleteWarning)
    return { items, totalAmount, conversionIncomplete: converter.conversionIncomplete };
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
  const reportsEnabled = useReportsEnabled(['hesaplar']);
  const { startDate, endDate } = options;
  const { startDateTime, endDateTime } = normalizeDateRange(startDate, endDate);
  const islemTypes = type === 'gider' ? EXPENSE_TYPES : INCOME_TYPES;

  return useQuery({
    queryKey: queryKeys.reports.accountTransactions(isletme?.id ?? '', hesapId, type, startDateTime, endDateTime),
    queryFn: async () => {
      if (!reportsEnabled || !isletme || !hesapId) return [] as IslemWithRelations[];
      // NOT: bu hook şu an hiçbir ekrandan çağrılmıyor (ölü). Yine de kardeşiyle aynı
      // sayfalama düzeltmesi uygulandı ki ileride bağlanırsa tuzak hazır olmasın.
      return (await fetchAllPages<IslemWithRelations>(() =>
        supabase
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
          .order('date', { ascending: false })
          // id İKİNCİL anahtar: sayfalama range tabanlı; aynı tarihli satırların
          // sırası sayfalar arasında değişirse satır tekrarı/kaybı olur.
          .order('id', { ascending: false })
      )) as unknown as IslemWithRelations[];
    },
    enabled: reportsEnabled && !!isletme && !!hesapId && !!startDate && !!endDate,
    meta: { query_purpose: 'reports:account-transactions' },
  });
}

// ============================================================================
// GELİR KAYNAK RAPORU — hesap + cari (kredili satış) + personel satışları
// ============================================================================

export type IncomeSourceKind = 'hesap' | 'cari' | 'personel';

function parseIncomeSourceTransactionRows(
  value: unknown,
): IslemWithRelations[] {
  if (!Array.isArray(value)) return [];

  return value.map((candidate) => {
    if (
      !candidate
      || typeof candidate !== 'object'
      || typeof (candidate as { id?: unknown }).id !== 'string'
      || typeof (candidate as { type?: unknown }).type !== 'string'
      || typeof (candidate as { date?: unknown }).date !== 'string'
      || !Number.isFinite(Number((candidate as { amount?: unknown }).amount))
    ) {
      throw new Error('Invalid income source transaction projection row');
    }

    return {
      ...candidate,
      amount: Number((candidate as { amount: unknown }).amount),
    } as IslemWithRelations;
  });
}

async function fetchSharedIncomeSourceTransactions(params: {
  isletmeId: string;
  kind: IncomeSourceKind;
  sourceId: string;
  startDateTime: string;
  endDateTime: string;
}): Promise<IslemWithRelations[]> {
  const rows: IslemWithRelations[] = [];
  let beforeDate: string | null = null;
  let beforeId: string | null = null;
  const seenCursors = new Set<string>();

  while (true) {
    const { data, error } = await supabase.rpc(
      'get_gelir_kaynagi_islem_satirlari_v1',
      {
        p_isletme_id: params.isletmeId,
        p_kind: params.kind,
        p_source_id: params.sourceId,
        p_start_date: params.startDateTime,
        p_end_date: params.endDateTime,
        p_limit: INCOME_SOURCE_DRILLDOWN_PAGE_SIZE,
        p_before_date: beforeDate,
        p_before_id: beforeId,
      },
    );

    if (error) throw error;

    const page = parseIncomeSourceTransactionRows(data);
    rows.push(...page);

    if (page.length < INCOME_SOURCE_DRILLDOWN_PAGE_SIZE) {
      break;
    }

    const last = page[page.length - 1];
    const nextCursor = `${last.date}:${last.id}`;
    if (seenCursors.has(nextCursor)) {
      throw new Error('Income source transaction cursor did not advance');
    }
    seenCursors.add(nextCursor);
    beforeDate = last.date;
    beforeId = last.id;
  }

  return rows;
}

export function isIncomeSourceKind(value: unknown): value is IncomeSourceKind {
  return value === 'hesap' || value === 'cari' || value === 'personel';
}

function useIncomeSourceReportAccess(kind?: IncomeSourceKind | null) {
  const { user, isletmeLoading } = useAuthContext();
  const {
    isOwner,
    canAccessModule,
    canSeeAllUsersData,
    canUseBirikim,
  } = usePermissions();
  const canViewReports = canAccessModule('raporlar');
  const canViewAccounts = canAccessModule('hesaplar');
  const canViewCariler = canAccessModule('cariler');
  const canViewPersonnel = canAccessModule('personel');
  const canViewAccountsInReport = canViewReports || canViewAccounts;
  const canViewCarilerInReport = canViewReports || canViewCariler;
  const canViewPersonnelInReport = canViewReports || canViewPersonnel;
  const canViewSavingsInReport = canViewReports || canUseBirikim;
  const hasAnySource =
    canViewAccountsInReport
    || canViewCarilerInReport
    || canViewPersonnelInReport;
  const canViewRequestedSource =
    kind === undefined
      ? hasAnySource
      : kind === 'hesap'
        ? canViewAccountsInReport
        : kind === 'cari'
          ? canViewCarilerInReport
          : kind === 'personel'
            ? canViewPersonnelInReport
            : false;
  const enabled =
    !isletmeLoading
    && !!user?.id
    && canViewRequestedSource;
  const permissionFingerprint = [
    `o${Number(isOwner)}`,
    `r${Number(canViewReports)}`,
    `h${Number(canViewAccounts)}`,
    `b${Number(canViewSavingsInReport)}`,
    `c${Number(canViewCariler)}`,
    `p${Number(canViewPersonnel)}`,
    `a${Number(canSeeAllUsersData)}`,
  ].join('');

  return {
    enabled,
    isOwner,
    userId: user?.id ?? '',
    permissionFingerprint,
    canUseBirikim: canViewSavingsInReport,
    allowedKinds: {
      hesap: canViewAccountsInReport,
      cari: canViewCarilerInReport,
      personel: canViewPersonnelInReport,
    } satisfies Record<IncomeSourceKind, boolean>,
  };
}

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
  /** Kur bulunamadığı için bazı TRY-canonical tutarlar çevrilemedi. */
  conversionIncomplete?: boolean;
  /** Tarihsel mercekte referansi bulunamadigi icin toplama girmeyen islem sayisi. */
  missingRateCount?: number;
  /** Dar satır projeksiyonu gelene kadar geniş doğrudan sorgu yalnız owner'dadır. */
  canOpenDetails: boolean;
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
interface IncomeSourceAggregateRow {
  source_kind: string;
  source_type: string;
  source_id: string;
  source_name: string | null;
  source_currency: string | null;
  islem_count: number;
  total_amount: number;
  total_native: number;
}

interface IncomeSourceAggregatePayload {
  rows: IncomeSourceAggregateRow[];
  conversionIncomplete: boolean;
  missingRateCount: number;
}

const EMPTY_INCOME_SOURCE_AGGREGATE: IncomeSourceAggregatePayload = {
  rows: [],
  conversionIncomplete: false,
  missingRateCount: 0,
};

function parseIncomeSourceLensPayload(data: unknown): IncomeSourceAggregatePayload {
  const payload = data && typeof data === 'object'
    ? data as Record<string, unknown>
    : {};
  return {
    rows: Array.isArray(payload.rows)
      ? payload.rows as IncomeSourceAggregateRow[]
      : [],
    conversionIncomplete: payload.conversion_incomplete === true,
    missingRateCount: Number(payload.missing_rate_count) || 0,
  };
}

export function useIncomeSourceReport(options: UseAccountReportOptions): IncomeSourceResult {
  const { isletme } = useAuthContext();
  const reportAccess = useIncomeSourceReportAccess();
  const reportsEnabled = reportAccess.enabled;
  const { currency: baseCurrency } = useSettings();
  const { data: ratesData } = useExchangeRates();
  const rates = ratesData?.rates;
  const { startDate, endDate, lens = 'nominal' } = options;
  const { startDateTime, endDateTime } = normalizeDateRange(startDate, endDate);

  const query = useQuery({
    queryKey: queryKeys.reports.incomeBySource(
      isletme?.id ?? '',
      reportAccess.userId,
      reportAccess.permissionFingerprint,
      startDateTime,
      endDateTime,
      lens,
    ),
    queryFn: async () => {
      if (!reportsEnabled || !isletme) return EMPTY_INCOME_SOURCE_AGGREGATE;
      const { data, error } = lens === 'nominal'
        ? await supabase.rpc('get_income_by_source_v2', {
            p_isletme_id: isletme.id,
            p_start_date: startDateTime,
            p_end_date: endDateTime,
          })
        : await supabase.rpc('get_income_by_source_lens_v1', {
            p_isletme_id: isletme.id,
            p_start_date: startDateTime,
            p_end_date: endDateTime,
            p_lens: lens as HistoricalIncomeExpenseLens,
          });
      if (error) {
        if (__DEV__) console.error('[useIncomeSourceReport] RPC error:', error.message, error.code);
        throw error;
      }
      const aggregate = lens === 'nominal'
        ? {
            ...EMPTY_INCOME_SOURCE_AGGREGATE,
            rows: Array.isArray(data) ? data as IncomeSourceAggregateRow[] : [],
          }
        : parseIncomeSourceLensPayload(data);
      return {
        ...aggregate,
        rows: aggregate.rows.filter((row) => {
        if (!row || typeof row !== 'object') return false;
        const candidate = row as {
          source_kind?: unknown;
          source_type?: unknown;
        };
        const kind = candidate.source_kind;
        if (!isIncomeSourceKind(kind) || !reportAccess.allowedKinds[kind]) {
          return false;
        }
        return !(
          kind === 'hesap'
          && candidate.source_type === 'birikim'
          && !reportAccess.canUseBirikim
        );
        }),
      };
    },
    enabled: reportsEnabled && !!isletme && !!startDate && !!endDate,
    meta: INCOME_SOURCE_REPORT_QUERY_META,
  });
  const data =
    reportsEnabled
    && !query.isError
    && !query.isRefetchError
      ? query.data
      : undefined;

  const result = useMemo(() => {
    // TEK politika: çevrilemezse ham TRY korunur ama conversionIncomplete kalkar (bkz.
    // createRpcTotalConverter) — eskiden sessizce ham TRY, baz para birimi etiketiyle basılıyordu.
    const converter = lens === 'nominal'
      ? createRpcTotalConverter(baseCurrency, rates)
      : { conv: (value: number) => value, conversionIncomplete: false };
    const conv = converter.conv;
    const rows = data?.rows ?? [];

    if (rows.length === 0) {
      return {
        groups: [] as IncomeSourceGroup[],
        totalAmount: 0,
        totalCount: 0,
        conversionIncomplete:
          converter.conversionIncomplete || data?.conversionIncomplete === true,
        missingRateCount: data?.missingRateCount ?? 0,
      };
    }

    let totalAmount = 0;
    let totalCount = 0;
    const items: IncomeSourceItem[] = rows
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

    return {
      groups,
      totalAmount,
      totalCount,
      conversionIncomplete:
        converter.conversionIncomplete || data?.conversionIncomplete === true,
      missingRateCount: data?.missingRateCount ?? 0,
    };
  }, [data, baseCurrency, lens, rates]);

  return {
    ...result,
    canOpenDetails: reportAccess.enabled,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    refetch: query.refetch,
    error: reportsEnabled ? query.error as Error | null : null,
  };
}

/**
 * Bir gelir KAYNAĞININ (hesap/cari/personel) dönem içi gelir işlemleri — drill-down.
 * hesap→'gelir'/hesap_id, cari→'cari_satis'/cari_id, personel→'personel_satis'/personel_id.
 */
export function useIncomeSourceTransactions(
  kind: IncomeSourceKind | null,
  sourceId: string,
  options: UseAccountReportOptions
) {
  const { isletme } = useAuthContext();
  const reportAccess = useIncomeSourceReportAccess(kind);
  // Bu sorgu geniş `islemler.*` ve ilişki kolonları indirir. K1'e uygun dar
  // projeksiyon RPC'si eklenene kadar shared kullanıcıya açılmaz.
  const reportsEnabled = reportAccess.enabled && kind !== null;
  const { startDate, endDate } = options;
  const { startDateTime, endDateTime } = normalizeDateRange(startDate, endDate);

  // cari: satış + satış İADESİ (iade net'e dahil → drill-down toplamı kartla tutar).
  const config =
    kind === 'cari'
      ? { islemTypes: ['cari_satis', 'cari_satis_iade'], field: 'cari_id' }
      : kind === 'personel'
      ? { islemTypes: ['personel_satis'], field: 'personel_id' }
      : kind === 'hesap'
      ? { islemTypes: ['gelir'], field: 'hesap_id' }
      : null;

  const query = useQuery({
    queryKey: queryKeys.reports.incomeSourceTransactions(
      isletme?.id ?? '',
      reportAccess.userId,
      reportAccess.permissionFingerprint,
      kind ?? '',
      sourceId,
      startDateTime,
      endDateTime,
    ),
    queryFn: async () => {
      if (!reportsEnabled || !isletme || !sourceId || !config || kind === null) {
        return [] as IslemWithRelations[];
      }
      if (!reportAccess.isOwner) {
        return fetchSharedIncomeSourceTransactions({
          isletmeId: isletme.id,
          kind,
          sourceId,
          startDateTime,
          endDateTime,
        });
      }
      // SAYFALAMA ŞART: PostgREST varsayılan tavanı 1000. Sayfalanmadığı için
      // 1000. satırdan sonrası SESSİZCE kırpılıyordu; üstelik bu ekranda toplam
      // ekrandan değil İNEN SATIRLARDAN hesaplandığı için kullanıcının az önce
      // tıkladığı karttan küçük bir rakam çıkıyordu. Yıllık dönem seçilebildiği
      // için tetiklenmesi kolaydı.
      return (await fetchAllPages<IslemWithRelations>(() =>
        supabase
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
          .in('type', config.islemTypes)
          .gte('date', startDateTime)
          .lte('date', endDateTime)
          .order('date', { ascending: false })
          // id İKİNCİL anahtar: aynı tarihli satırların sırası sayfalar arasında
          // değişirse range tabanlı sayfalamada satır tekrarı/kaybı olur.
          .order('id', { ascending: false })
      )) as unknown as IslemWithRelations[];
    },
    enabled:
      reportsEnabled
      && !!isletme
      && !!sourceId
      && !!config
      && !!startDate
      && !!endDate,
    meta: INCOME_SOURCE_DRILLDOWN_QUERY_META,
  });
  const data =
    reportsEnabled
    && !query.isError
    && !query.isRefetchError
      ? query.data ?? []
      : [];

  return {
    ...query,
    data,
    error: reportsEnabled ? query.error : null,
  };
}
