import { useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import { useAuthContext } from '@/contexts/AuthContext';
import { queryKeys } from '@/lib/queryKeys';
import { roundCurrency } from '@/lib/currency';
import { useFinancialSummary } from './useFinancialSummary';
import { useSettings } from './useSettings';
import { useExchangeRates, convertCurrency } from './useExchangeRates';

/**
 * AYLIK NET-VARLIK (GENEL DURUM) TREND
 *
 * Net varlık YALNIZCA gelir/giderle değişir (tahsilat/ödeme/transfer net-sıfır). Bu yüzden
 * aylık net varlık, canlı `generalStatus`'a DEMİRLENİP aylık P&L akışıyla geriye yürütülür:
 *   NW_ay_sonu(M) = generalStatus − Σ net(M'den SONRAKİ aylar)
 * Böylece son (bu) ay = generalStatus (uygulamanın anlık genel durumuyla İNŞA GEREĞİ birebir).
 *
 * SINIRLAR (dipnot): geçmiş, bugünkü kayıtlardan yeniden hesaplanır — sonradan silinen
 * işlemler ve tarihsiz açılış bakiyeleri geçmişe birebir yansımayabilir; kurlar günceldir.
 */
export interface NetWorthTrendPoint {
  month: string;     // 'YYYY-MM'
  label: string;     // X ekseni (kısa) 'Tem'26'
  labelFull: string; // imleç balonu (net) 'Temmuz 2026'
  isCurrent: boolean;// bu ay mı (değer "bugüne", geçmiş aylar "ay sonu"na kadar)
  netWorth: number; // ay-sonu net varlık (ana para birimi)
  change: number;   // önceki aya göre değişim = o ayın P&L neti (ana para birimi)
  income: number;
  expense: number;
}

interface RpcRow {
  ay: string; // 'YYYY-MM-DD' (ayın ilk günü)
  gelir: number;
  gider: number;
  net: number;
}

export function useNetWorthTrend(monthsBack: number) {
  const { isletme } = useAuthContext();
  const { t } = useTranslation('common');
  const { currency: baseCurrency } = useSettings();
  const { data: ratesData } = useExchangeRates();
  const rates = ratesData?.rates;
  const ratesVersion = ratesData?.updated_at ?? null;
  const { generalStatus, isLoading: summaryLoading, conversionIncomplete } = useFinancialSummary();

  const monthsShort = useMemo(() => {
    const m = t('date.monthsShort', { returnObjects: true });
    return Array.isArray(m) && m.every((x) => typeof x === 'string')
      ? (m as string[])
      : ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
  }, [t]);

  const monthsFull = useMemo(() => {
    const m = t('date.months', { returnObjects: true });
    return Array.isArray(m) && m.every((x) => typeof x === 'string')
      ? (m as string[])
      : ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
  }, [t]);

  // Pencere: (monthsBack-1) ay öncesinden bu ayın sonuna kadar (cihaz-yerel takvim ayları).
  const window = useMemo(() => {
    const now = new Date();
    const months: { y: number; m: number; key: string }[] = [];
    for (let i = monthsBack - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({ y: d.getFullYear(), m: d.getMonth(), key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` });
    }
    const first = months[0];
    const startDate = `${first.key}-01`;
    const lastEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0); // bu ayın son günü
    const endDate = `${lastEnd.getFullYear()}-${String(lastEnd.getMonth() + 1).padStart(2, '0')}-${String(lastEnd.getDate()).padStart(2, '0')}`;
    return { months, startDate, endDate };
  }, [monthsBack]);

  const query = useQuery({
    queryKey: [
      ...queryKeys.reports.networthTrend(isletme?.id ?? '', monthsBack),
      baseCurrency,
      ratesVersion,
      window.startDate,
      window.endDate,
    ],
    queryFn: async () => {
      if (!isletme) return [] as RpcRow[];
      const { data, error } = await supabase.rpc('get_networth_pl_trend', {
        p_isletme_id: isletme.id,
        p_start_date: `${window.startDate}T00:00:00`,
        p_end_date: `${window.endDate}T23:59:59`,
      });
      if (error) throw error;
      return (data ?? []) as RpcRow[];
    },
    enabled: !!isletme,
    staleTime: 5 * 60 * 1000,
  });

  // Açılış bakiyeleri: her entity'nin açılışı, oluşturulduğu (created_at) aya bağlı.
  // Walk-back'te "M'den SONRA oluşturulan entity'lerin açılışı" M ayından düşülür.
  const openingQuery = useQuery({
    queryKey: [
      ...queryKeys.reports.networthOpening(isletme?.id ?? '', monthsBack),
      baseCurrency,
      ratesVersion,
      window.startDate,
      window.endDate,
    ],
    queryFn: async () => {
      if (!isletme) return [] as { ay: string; opening: number }[];
      const { data, error } = await supabase.rpc('get_networth_opening_by_month', {
        p_isletme_id: isletme.id,
        p_start_date: `${window.startDate}T00:00:00`,
        p_end_date: `${window.endDate}T23:59:59`,
      });
      if (error) throw error;
      return (data ?? []) as { ay: string; opening: number }[];
    },
    enabled: !!isletme,
    staleTime: 5 * 60 * 1000,
  });

  const points = useMemo<NetWorthTrendPoint[]>(() => {
    const rows = query.data ?? [];
    // RPC tutarları TRY; ana para birimine çevir (TR için no-op).
    const toBase = (v: number) => (baseCurrency === 'TRY' ? v : convertCurrency(v, 'TRY', baseCurrency, rates) ?? v);

    const byMonth = new Map<string, { income: number; expense: number; net: number }>();
    for (const r of rows) {
      const key = String(r.ay).slice(0, 7); // 'YYYY-MM'
      const income = toBase(Number(r.gelir) || 0);
      const expense = toBase(Number(r.gider) || 0);
      byMonth.set(key, { income, expense, net: income - expense });
    }

    // Açılış bakiyeleri, oluşturulma (created_at) ayına göre (base'e çevrili).
    const openingByMonth = new Map<string, number>();
    for (const r of openingQuery.data ?? []) {
      const key = String(r.ay).slice(0, 7);
      openingByMonth.set(key, (openingByMonth.get(key) ?? 0) + toBase(Number(r.opening) || 0));
    }

    // Artan sıralı pencere; işlemi olmayan aylar 0.
    const asc = window.months.map((mo) => {
      const v = byMonth.get(mo.key) ?? { income: 0, expense: 0, net: 0 };
      return { ...mo, ...v, opening: openingByMonth.get(mo.key) ?? 0 };
    });

    // Canlı generalStatus'tan geriye yürüt:
    //   NW_end[i] = generalStatus − Σ net(j>i) − Σ acilis(created ayı j>i)
    // Böylece i ayından SONRA oluşturulan entity'lerin açılışı i'de sayılmaz.
    const nw = new Array<number>(asc.length);
    let afterNet = 0;
    let afterOpening = 0;
    for (let i = asc.length - 1; i >= 0; i--) {
      nw[i] = roundCurrency(generalStatus - afterNet - afterOpening);
      afterNet += asc[i].net;
      afterOpening += asc[i].opening;
    }

    const built = asc.map((mo, i) => ({
      month: mo.key,
      label: `${monthsShort[mo.m]}'${String(mo.y).slice(-2)}`, // 'Tem'26 (kısa, yıl apostroflu)
      labelFull: `${monthsFull[mo.m]} ${mo.y}`, // 'Temmuz 2026' (imleç için net)
      isCurrent: i === asc.length - 1, // pencerenin son ayı = bu ay
      netWorth: nw[i],
      // Aylık değişim = o ayın P&L neti + o ay eklenen açılışlar (= NW_end[i] − NW_end[i-1]).
      change: roundCurrency(mo.net + mo.opening),
      income: roundCurrency(mo.income),
      expense: roundCurrency(mo.expense),
    }));

    // İLK aktiviteden ÖNCEKİ ayları baştan kırp: hiçbir hareket olmayan (change===0) baştaki
    // ayları atla → trend ilk gerçek işlem/açılış ayından başlar. ("Tümü"=120 ay penceresinde
    // veri-öncesi yüzlerce ay olur; onları gösterme.) NOT: baseline sıfır OLMAYABİLİR (ör. pasif
    // yapılmış bir cariye yapılan ödeme, genel-durumla reconstruction arasında sabit bir kayma
    // bırakır) — bu yüzden net-varlık değerine DEĞİL, yalnız "o ay hareket var mı"ya (change) bakılır.
    // İlk aktiviteden SONRAKİ durgun (change===0) aylar KIRPILMAZ. Son ay her zaman korunur.
    let firstReal = 0;
    while (firstReal < built.length - 1 && built[firstReal].change === 0) {
      firstReal++;
    }
    return built.slice(firstReal);
  }, [query.data, openingQuery.data, window.months, generalStatus, baseCurrency, rates, monthsShort, monthsFull]);

  const refetch = useCallback(async () => {
    await Promise.all([query.refetch(), openingQuery.refetch()]);
  }, [query, openingQuery]);

  return {
    points,
    isLoading: query.isLoading || openingQuery.isLoading || summaryLoading,
    isFetching: query.isFetching || openingQuery.isFetching,
    error: (query.error || openingQuery.error) as Error | null,
    refetch,
    generalStatus,
    conversionIncomplete,
  };
}
