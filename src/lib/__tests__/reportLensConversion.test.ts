import {
  createHistoricalReportLensConverter,
  getReportTransactionCurrency,
  turkeyIsoDay,
  type DailyReportIndicatorRow,
  type MonthlyReportIndicatorRow,
} from '@/lib/reportLens';

const dailyRows: DailyReportIndicatorRow[] = [
  {
    gun: '2024-05-31',
    usd_try: 32.1918,
    eur_try: 34.891,
    gbp_try: 40.95,
    gram_altin_try: 2426.48,
    gram_gumus_try: 34.75,
  },
];

const monthlyRows: MonthlyReportIndicatorRow[] = [
  { ay: '2024-06-01', tufe: 2319.29 },
  { ay: '2026-07-01', tufe: 4211.58 },
];

describe('historical income/expense report lens conversion', () => {
  it('uses the Turkey calendar day independently from the device timezone', () => {
    expect(turkeyIsoDay(new Date('2026-08-05T21:30:00.000Z'))).toBe('2026-08-06');
    expect(turkeyIsoDay(new Date('2026-08-05T20:30:00.000Z'))).toBe('2026-08-05');
  });

  it('uses the previous official business-day observation for a Sunday', () => {
    const convert = createHistoricalReportLensConverter(
      'usd',
      dailyRows,
      [],
      '2026-08-06',
    );

    const result = convert(1000, { date: '2024-06-02T10:30:00' });

    expect(result.complete).toBe(true);
    expect(result.referenceDate).toBe('2024-05-31');
    expect(result.value).toBeCloseTo(1000 / 32.1918, 6);
  });

  it('converts native foreign-currency amount through transaction-day TRY rates', () => {
    const convert = createHistoricalReportLensConverter(
      'eur',
      dailyRows,
      [],
      '2026-08-06',
    );

    const result = convert(100, {
      date: '2024-06-02T10:30:00',
      _reportAmountCurrency: 'USD',
    });

    expect(result.value).toBeCloseTo(100 * 32.1918 / 34.891, 6);
    expect(result.sourceReferenceDate).toBe('2024-05-31');
  });

  it('uses transaction-month CPI and the latest published CPI for real TRY', () => {
    const convert = createHistoricalReportLensConverter(
      'reel',
      dailyRows,
      monthlyRows,
      '2026-08-06',
    );

    const result = convert(1000, { date: '2024-06-02T10:30:00' });

    expect(result.referenceDate).toBe('2024-06-01');
    expect(result.currentCpiDate).toBe('2026-07-01');
    expect(result.value).toBeCloseTo(1000 * 4211.58 / 2319.29, 6);
  });

  it('caps a future-dated transaction at today for daily FX references', () => {
    const todayRows: DailyReportIndicatorRow[] = [
      {
        gun: '2026-08-06',
        usd_try: 40,
        eur_try: 46,
        gbp_try: 53,
        gram_altin_try: 4400,
      },
    ];
    const convert = createHistoricalReportLensConverter(
      'usd',
      todayRows,
      [],
      '2026-08-06',
    );

    const result = convert(1000, { date: '2026-08-31T12:00:00' });

    expect(result.complete).toBe(true);
    expect(result.referenceDate).toBe('2026-08-06');
    expect(result.value).toBeCloseTo(25, 6);
  });

  it('uses the current published CPI for a future-dated real TRY transaction', () => {
    const convert = createHistoricalReportLensConverter(
      'reel',
      [],
      [{ ay: '2026-07-01', tufe: 4211.58 }],
      '2026-08-06',
    );

    const result = convert(1000, { date: '2026-08-31T12:00:00' });

    expect(result.complete).toBe(true);
    expect(result.referenceDate).toBe('2026-07-01');
    expect(result.currentCpiDate).toBe('2026-07-01');
    expect(result.value).toBeCloseTo(1000, 6);
  });

  it('matches the report RPC currency precedence and converts historical XAG sources', () => {
    expect(getReportTransactionCurrency({
      date: '2024-06-02',
      hesap: { currency: 'USD' },
      cari: { currency: 'EUR' },
    })).toBe('USD');

    const convert = createHistoricalReportLensConverter(
      'altin',
      dailyRows,
      [],
      '2026-08-06',
    );
    const result = convert(10, {
      date: '2024-06-02',
      _reportAmountCurrency: 'XAG',
    });

    expect(result.complete).toBe(true);
    expect(result.sourceRate).toBe(34.75);
    expect(result.value).toBeCloseTo(10 * 34.75 / 2426.48, 6);
  });
});
