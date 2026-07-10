import { useMemo } from 'react';
import { roundCurrency } from '@/lib/currency';
import { useNetWorthTrend, NetWorthTrendPoint } from './useNetWorthTrend';
import { useEconomicIndicators } from './useEconomicIndicators';
import { useSettings } from './useSettings';

/**
 * NET-VARLIK LENSLERİ: nominal TRY seriyi (useNetWorthTrend) farklı "gerçek değer"
 * merceklerine çevirir (repricing):
 *   reel  = nominal × TÜFE_bugün / TÜFE_ay           (bugünün lirasıyla — enflasyona göre)
 *   usd   = nominal / usd_try_ay,  eur = /eur_try_ay (o ayki kurla sert para)
 *   altın = nominal / gram_altin_ay
 * Amaç: paranın zaman değerini göstermek (nominal sabit ≈ reel kayıp/kazanç).
 * Repricing CLIENT'ta (RPC değil) — "son ay = generalStatus" invariantı korunur.
 */
export type LensMode = 'nominal' | 'reel' | 'usd' | 'eur' | 'altin';
export type LensUnit = 'try' | 'usd' | 'eur' | 'gram';

const UNIT: Record<LensMode, LensUnit> = { nominal: 'try', reel: 'try', usd: 'usd', eur: 'eur', altin: 'gram' };

export interface LensPoint {
  month: string;
  label: string;
  labelFull: string;
  isCurrent: boolean;
  value: number | null; // lens biriminde (eksik göstergede null)
  rate: number | null;  // o ay kullanılan kur/fiyat (TRY): usd/eur → kur, altın → gram fiyatı; nominal/reel → null
  empty: boolean;       // o ay hiç hareket yok (lensten bağımsız — nominal aktivite sıfır)
  sparse: boolean;      // baştaki seyrek-kayıtlı aylardan biri (değer türetilmiş)
}

export interface LensInsight {
  tone: 'up' | 'down';        // reel yön: up=yeşil (iyileşme), down=kırmızı (erime)
  kind: 'realUp' | 'realDown' | 'debtLighter';
  lensPct: number;            // reel değişim %
  nominalPct: number;         // nominal değişim %
}

export interface LensResult {
  mode: LensMode;
  unit: LensUnit;
  available: boolean;         // bu lens için yeterli veri var mı
  points: LensPoint[];
  current: number | null;     // son (bugünkü) değer
  first: number | null;       // penceredeki ilk geçerli değer
  lensPct: number | null;     // ilk→son değişim %
  nominalPct: number | null;  // aynı pencerede nominal değişim %
  insight: LensInsight | null;
}

export function useNetWorthLenses(monthsBack: number) {
  const trend = useNetWorthTrend(monthsBack);
  const points = trend.points;
  // Repricing (reel/usd/eur/altın) ekonomik_gostergeler'in TRY-referanslı olmasına + points'in
  // TRY nominal olmasına dayanır. Ana para birimi TRY DEĞİLSE (useNetWorthTrend base'e çevirir)
  // bu lensler yanlış olur (+ TÜFE Türk enflasyonu, dövizde anlamsız) → yalnız TRY-base'de sun.
  const { currency: baseCurrency } = useSettings();
  const repricingSupported = baseCurrency === 'TRY';

  const startMonth = points.length ? `${points[0].month}-01` : '';
  const endMonth = points.length ? `${points[points.length - 1].month}-01` : '';
  const { data: indicators, isLoading: indLoading } = useEconomicIndicators(startMonth, endMonth);

  const byMode = useMemo<Record<LensMode, LensResult>>(() => {
    const latestTufe = indicators?.latestTufe ?? null;

    // Forward-fill TÜFE (son yayımlanmayan aylar için son bilineni kullan → reel kesintisiz).
    const effTufe = new Map<string, number>();
    let lastT: number | null = null;
    for (const p of points) {
      const raw = indicators?.byMonth.get(p.month)?.tufe ?? null;
      if (raw != null) lastT = raw;
      if (lastT != null) effTufe.set(p.month, lastT);
    }

    // Forward-fill gram altın (EVDS Kapalıçarşı, aylık ay-sonu). Altın merceği CARİ AY dahil
    // TÜM aylarda bu tabloyu kullanır (canlı spot XAU DEĞİL) → kaynak-kopukluğu olmaz
    // (geçmiş Kapalıçarşı ~%3.4 primli; canlı spot ile karışırsa son noktada kırık oluşurdu).
    // Cari ay tablo satırı boşsa (EVDS henüz o ayı yayımlamadıysa) son bilinen değeri taşır.
    const effGold = new Map<string, number>();
    let lastG: number | null = null;
    for (const p of points) {
      const raw = indicators?.byMonth.get(p.month)?.gram_altin_try ?? null;
      if (raw != null) lastG = raw;
      if (lastG != null) effGold.set(p.month, lastG);
    }

    // Forward-fill USD/EUR (EVDS döviz satış). Altın gibi CARİ AY dahil TÜM aylarda tablodan alınır
    // (canlı kur DEĞİL) → 4 gösterge de tek kaynak (EVDS/TCMB), kaynak-kopukluğu olmaz.
    const effUsd = new Map<string, number>();
    const effEur = new Map<string, number>();
    let lastU: number | null = null;
    let lastE: number | null = null;
    for (const p of points) {
      const ru = indicators?.byMonth.get(p.month)?.usd_try ?? null;
      const re = indicators?.byMonth.get(p.month)?.eur_try ?? null;
      if (ru != null) lastU = ru;
      if (re != null) lastE = re;
      if (lastU != null) effUsd.set(p.month, lastU);
      if (lastE != null) effEur.set(p.month, lastE);
    }

    const value = (p: NetWorthTrendPoint, mode: LensMode): number | null => {
      const N = p.netWorth; // nominal (ana para birimi; TRY-base'de TRY)
      if (mode === 'nominal') return N;
      if (!repricingSupported) return null; // TRY-base değilse repricing lensleri kapalı
      if (mode === 'reel') {
        const eff = effTufe.get(p.month);
        return eff && latestTufe ? roundCurrency((N * latestTufe) / eff) : null;
      }
      if (mode === 'altin') {
        const g = effGold.get(p.month);
        return g ? Math.round((N / g) * 100) / 100 : null;
      }
      if (mode === 'usd') { const r = effUsd.get(p.month); return r ? roundCurrency(N / r) : null; }
      if (mode === 'eur') { const r = effEur.get(p.month); return r ? roundCurrency(N / r) : null; }
      return null;
    };

    // O ay kullanılan kur/fiyat (baloncukta gösterim için): usd/eur → o ayki kur, altın → o ayki
    // gram fiyatı (forward-fill'li tablo). nominal/reel → null (kur satırı gösterilmez).
    const rateFor = (p: NetWorthTrendPoint, m: LensMode): number | null => {
      if (m === 'altin') return effGold.get(p.month) ?? null;
      if (m === 'usd') return effUsd.get(p.month) ?? null;
      if (m === 'eur') return effEur.get(p.month) ?? null;
      return null;
    };

    const build = (mode: LensMode): LensResult => {
      const lensPoints: LensPoint[] = points.map((p) => ({
        month: p.month,
        label: p.label,
        labelFull: p.labelFull,
        isCurrent: p.isCurrent,
        value: value(p, mode),
        rate: rateFor(p, mode),
        empty: p.empty,
        sparse: p.sparse,
      }));
      const valid = lensPoints.filter((lp) => lp.value != null);
      const available = valid.length >= 2;
      const first = valid.length ? valid[0].value : null;
      const current = lensPoints.length ? lensPoints[lensPoints.length - 1].value : null;
      const lensLast = valid.length ? valid[valid.length - 1].value : null;
      const lensPct = available && first && first !== 0 ? ((lensLast! - first) / Math.abs(first)) * 100 : null;

      // Aynı geçerli pencerede nominal değişim (adil kıyas için).
      const validMonths = new Set(valid.map((v) => v.month));
      const nomValid = points.filter((p) => validMonths.has(p.month));
      const nomFirst = nomValid.length ? nomValid[0].netWorth : null;
      const nomLast = nomValid.length ? nomValid[nomValid.length - 1].netWorth : null;
      const nominalPct = nomValid.length >= 2 && nomFirst && nomFirst !== 0 ? ((nomLast! - nomFirst) / Math.abs(nomFirst)) * 100 : null;

      let insight: LensInsight | null = null;
      if (mode !== 'nominal' && available && lensPct != null && nominalPct != null) {
        const netDebtor = (nomLast ?? 0) < 0; // son ay net borçlu mu
        const tone: 'up' | 'down' = lensPct >= 0 ? 'up' : 'down';
        const kind = netDebtor && lensPct > 0 ? 'debtLighter' : lensPct >= 0 ? 'realUp' : 'realDown';
        insight = { tone, kind, lensPct: Math.round(lensPct * 10) / 10, nominalPct: Math.round(nominalPct * 10) / 10 };
      }

      return {
        mode, unit: UNIT[mode], available, points: lensPoints,
        current, first,
        lensPct: lensPct != null ? Math.round(lensPct * 10) / 10 : null,
        nominalPct: nominalPct != null ? Math.round(nominalPct * 10) / 10 : null,
        insight,
      };
    };

    return {
      nominal: build('nominal'),
      reel: build('reel'),
      usd: build('usd'),
      eur: build('eur'),
      altin: build('altin'),
    };
  }, [points, indicators, repricingSupported]);

  return {
    byMode,
    baseCurrency,
    repricingSupported,
    isLoading: trend.isLoading || indLoading,
    isFetching: trend.isFetching,
    refetch: trend.refetch,
    generalStatus: trend.generalStatus,
    conversionIncomplete: trend.conversionIncomplete, // kur yoksa bazı bakiyeler hariç → ekranda uyar
  };
}
