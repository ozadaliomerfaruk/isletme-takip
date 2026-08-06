import { formatQuantity, signedCurrencyText } from '@/lib/currency';

export const INCOME_EXPENSE_LENSES = [
  'nominal',
  'reel',
  'usd',
  'eur',
  'altin',
] as const;

export type IncomeExpenseLens = (typeof INCOME_EXPENSE_LENSES)[number];
export type HistoricalIncomeExpenseLens = Exclude<IncomeExpenseLens, 'nominal'>;

export function isIncomeExpenseLens(value: unknown): value is IncomeExpenseLens {
  return typeof value === 'string'
    && (INCOME_EXPENSE_LENSES as readonly string[]).includes(value);
}

export function reportLensCurrency(lens: IncomeExpenseLens): string | undefined {
  switch (lens) {
    case 'reel':
      return 'TRY';
    case 'usd':
      return 'USD';
    case 'eur':
      return 'EUR';
    case 'altin':
      return 'XAU';
    default:
      return undefined;
  }
}

export function formatReportLensValue(value: number, lens: IncomeExpenseLens): string {
  if (lens === 'altin') return `${formatQuantity(value)} gr`;
  return signedCurrencyText(value, reportLensCurrency(lens));
}

export interface DailyReportIndicatorRow {
  gun: string;
  usd_try: number | null;
  eur_try: number | null;
  gbp_try: number | null;
  gram_altin_try: number | null;
  gram_gumus_try?: number | null;
}

export interface MonthlyReportIndicatorRow {
  ay: string;
  tufe: number | null;
}

type CurrencyRelation =
  | { currency?: string | null }
  | Array<{ currency?: string | null }>
  | null
  | undefined;

export interface ReportLensTransactionLike {
  date: string;
  /** Dar-yetkili rapor projeksiyonu, SQL'in çözdüğü para birimini açıkça taşır. */
  _reportAmountCurrency?: string | null;
  hesap?: CurrencyRelation;
  cari?: CurrencyRelation;
  personel?: CurrencyRelation;
}

export interface HistoricalReportLensConversion {
  value: number | null;
  conversionFactor: number | null;
  sourceCurrency: string;
  sourceRate: number | null;
  lensRate: number | null;
  transactionCpi: number | null;
  currentCpi: number | null;
  /** Döviz/altın merceğinde hedef seri günü; reel mercekte işlem TÜFE ayı. */
  referenceDate: string | null;
  /** Yabancı para işlemde kaynak kurun alındığı gün. */
  sourceReferenceDate: string | null;
  currentCpiDate: string | null;
  complete: boolean;
}

export type HistoricalReportLensConverter = (
  amount: number,
  transaction: ReportLensTransactionLike,
) => HistoricalReportLensConversion;

function relationCurrency(relation: CurrencyRelation): string | null {
  const row = Array.isArray(relation) ? relation[0] : relation;
  return row?.currency || null;
}

/**
 * Gelir-gider lens RPC'sindeki COALESCE(account, cari, personel, TRY) zincirinin
 * istemci karşılığı. `source_currency` bilinçli olarak kullanılmaz: detay satırı,
 * ana rapor toplamıyla aynı muhasebe para birimini esas almalıdır.
 */
export function getReportTransactionCurrency(
  transaction: ReportLensTransactionLike,
): string {
  return transaction._reportAmountCurrency
    || relationCurrency(transaction.hesap)
    || relationCurrency(transaction.cari)
    || relationCurrency(transaction.personel)
    || 'TRY';
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Rapor RPC'lerinin kullandigi `Europe/Istanbul` gununu istemcide de ayni
 * sekilde uretir. Cihazin bulundugu saat dilimi (ornegin yurtdisi) raporun
 * ileri-tarih referansini bir gun kaydirmamalidir.
 */
export function turkeyIsoDay(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;
  return year && month && day ? `${year}-${month}-${day}` : '';
}

function isoDay(value: string): string {
  return String(value).slice(0, 10);
}

function earlierIsoDay(value: string, ceiling: string): string {
  const day = isoDay(value);
  const ceilingDay = isoDay(ceiling);
  return day && ceilingDay && day > ceilingDay ? ceilingDay : day;
}

function shiftIsoDay(value: string, days: number): string {
  const [year, month, day] = isoDay(value).split('-').map(Number);
  if (!year || !month || !day) return '';
  return new Date(Date.UTC(year, month - 1, day) + days * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

function shiftIsoMonth(value: string, months: number): string {
  const [year, month] = String(value).slice(0, 7).split('-').map(Number);
  if (!year || !month) return '';
  return new Date(Date.UTC(year, month - 1 + months, 1))
    .toISOString()
    .slice(0, 7);
}

function positiveNumber(value: number | null | undefined): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function dailyRate(
  row: DailyReportIndicatorRow,
  currency: string,
): number | null {
  switch (currency) {
    case 'USD':
      return positiveNumber(row.usd_try);
    case 'EUR':
      return positiveNumber(row.eur_try);
    case 'GBP':
      return positiveNumber(row.gbp_try);
    case 'XAU':
      return positiveNumber(row.gram_altin_try);
    case 'XAG':
      return positiveNumber(row.gram_gumus_try);
    default:
      return null;
  }
}

function lensCurrency(lens: HistoricalIncomeExpenseLens): string | null {
  switch (lens) {
    case 'usd':
      return 'USD';
    case 'eur':
      return 'EUR';
    case 'altin':
      return 'XAU';
    default:
      return null;
  }
}

/**
 * Sunucudaki `get_category_report_lens_v1` ile aynı dönüşüm sözleşmesini uygular:
 * native tutar × işlem-günü kaynak kuru ÷ işlem-günü mercek kuru. Reel görünümde
 * bölme yerine en güncel TÜFE / işlem ayı TÜFE çarpanı kullanılır. Resmî tatil ve
 * hafta sonu için her seri bağımsız olarak en fazla 7 gün geriye taşınır.
 */
export function createHistoricalReportLensConverter(
  lens: HistoricalIncomeExpenseLens,
  dailyRows: readonly DailyReportIndicatorRow[],
  monthlyRows: readonly MonthlyReportIndicatorRow[],
  currentDay = turkeyIsoDay(),
): HistoricalReportLensConverter {
  const dailyByDay = new Map<string, DailyReportIndicatorRow>();
  dailyRows.forEach((row) => dailyByDay.set(isoDay(row.gun), row));

  const cpiByMonth = new Map<string, { value: number; date: string }>();
  monthlyRows.forEach((row) => {
    const value = positiveNumber(row.tufe);
    if (value !== null) {
      cpiByMonth.set(String(row.ay).slice(0, 7), {
        value,
        date: isoDay(row.ay),
      });
    }
  });

  const findDaily = (day: string, currency: string) => {
    for (let offset = 0; offset <= 7; offset += 1) {
      const referenceDay = shiftIsoDay(day, -offset);
      const row = dailyByDay.get(referenceDay);
      if (!row) continue;
      const rate = dailyRate(row, currency);
      if (rate !== null) return { rate, date: referenceDay };
    }
    return null;
  };

  const findTransactionCpi = (day: string) => {
    const transactionMonth = String(day).slice(0, 7);
    for (let offset = 0; offset <= 2; offset += 1) {
      const observation = cpiByMonth.get(shiftIsoMonth(transactionMonth, -offset));
      if (observation) return observation;
    }
    return null;
  };

  const currentMonth = String(currentDay).slice(0, 7);
  let currentCpi: { value: number; date: string } | null = null;
  for (let offset = 0; offset <= 2; offset += 1) {
    const observation = cpiByMonth.get(shiftIsoMonth(currentMonth, -offset));
    if (observation) {
      currentCpi = observation;
      break;
    }
  }

  return (amount, transaction) => {
    const transactionDay = isoDay(transaction.date);
    // İleri tarihli kayıt rapor aralığında kalır; yalnız değerleme referansı
    // bugüne/son mevcut resmî veriye sabitlenir.
    const referenceDay = earlierIsoDay(transactionDay, currentDay);
    const sourceCurrency = getReportTransactionCurrency(transaction).toUpperCase();
    const sourceObservation = sourceCurrency === 'TRY'
      ? { rate: 1, date: referenceDay }
      : findDaily(referenceDay, sourceCurrency);

    if (!sourceObservation) {
      return {
        value: null,
        conversionFactor: null,
        sourceCurrency,
        sourceRate: null,
        lensRate: null,
        transactionCpi: null,
        currentCpi: currentCpi?.value ?? null,
        referenceDate: null,
        sourceReferenceDate: null,
        currentCpiDate: currentCpi?.date ?? null,
        complete: false,
      };
    }

    if (lens === 'reel') {
      const transactionCpi = findTransactionCpi(referenceDay);
      if (!transactionCpi || !currentCpi) {
        return {
          value: null,
          conversionFactor: null,
          sourceCurrency,
          sourceRate: sourceObservation.rate,
          lensRate: null,
          transactionCpi: transactionCpi?.value ?? null,
          currentCpi: currentCpi?.value ?? null,
          referenceDate: transactionCpi?.date ?? null,
          sourceReferenceDate: sourceCurrency === 'TRY' ? null : sourceObservation.date,
          currentCpiDate: currentCpi?.date ?? null,
          complete: false,
        };
      }
      const conversionFactor = sourceObservation.rate
        * currentCpi.value
        / transactionCpi.value;
      return {
        value: amount * conversionFactor,
        conversionFactor,
        sourceCurrency,
        sourceRate: sourceObservation.rate,
        lensRate: null,
        transactionCpi: transactionCpi.value,
        currentCpi: currentCpi.value,
        referenceDate: transactionCpi.date,
        sourceReferenceDate: sourceCurrency === 'TRY' ? null : sourceObservation.date,
        currentCpiDate: currentCpi.date,
        complete: true,
      };
    }

    const targetCurrency = lensCurrency(lens);
    const lensObservation = targetCurrency
      ? findDaily(referenceDay, targetCurrency)
      : null;
    if (!lensObservation) {
      return {
        value: null,
        conversionFactor: null,
        sourceCurrency,
        sourceRate: sourceObservation.rate,
        lensRate: null,
        transactionCpi: null,
        currentCpi: null,
        referenceDate: null,
        sourceReferenceDate: sourceCurrency === 'TRY' ? null : sourceObservation.date,
        currentCpiDate: null,
        complete: false,
      };
    }

    const conversionFactor = sourceObservation.rate / lensObservation.rate;
    return {
      value: amount * conversionFactor,
      conversionFactor,
      sourceCurrency,
      sourceRate: sourceObservation.rate,
      lensRate: lensObservation.rate,
      transactionCpi: null,
      currentCpi: null,
      referenceDate: lensObservation.date,
      sourceReferenceDate: sourceCurrency === 'TRY' ? null : sourceObservation.date,
      currentCpiDate: null,
      complete: true,
    };
  };
}
