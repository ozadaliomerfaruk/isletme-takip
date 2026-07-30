import fs from 'node:fs';
import path from 'node:path';
import { buildCustomTrendPeriods } from '@/lib/reportTrendPeriods';

const ROOT = path.resolve(__dirname, '../../..');

describe('özel rapor dönemi sözleşmesi', () => {
  it('tek günlük aralığı tek grafik noktasına dönüştürür', () => {
    expect(buildCustomTrendPeriods({
      startDate: '2026-07-15',
      endDate: '2026-07-15',
    })).toEqual([
      {
        offset: 0,
        startDate: '2026-07-15',
        endDate: '2026-07-15',
        label: '15/7',
      },
    ]);
  });

  it('uzun aralığı kesintisiz, çakışmayan ve en fazla altı dilime böler', () => {
    const periods = buildCustomTrendPeriods({
      startDate: '2026-01-29',
      endDate: '2026-02-07',
    });

    expect(periods).toHaveLength(6);
    expect(periods[0].startDate).toBe('2026-01-29');
    expect(periods.at(-1)?.endDate).toBe('2026-02-07');
    expect(periods.some((period) => period.label.includes('-'))).toBe(true);

    for (let index = 1; index < periods.length; index++) {
      const previousEnd = new Date(`${periods[index - 1].endDate}T00:00:00Z`);
      previousEnd.setUTCDate(previousEnd.getUTCDate() + 1);
      expect(previousEnd.toISOString().slice(0, 10)).toBe(
        periods[index].startDate,
      );
    }
  });

  it('geçersiz veya ters aralığı sorguya dönüştürmez', () => {
    expect(buildCustomTrendPeriods({
      startDate: '2026-02-31',
      endDate: '2026-03-01',
    })).toEqual([]);
    expect(buildCustomTrendPeriods({
      startDate: '2026-03-02',
      endDate: '2026-03-01',
    })).toEqual([]);
  });

  it('ana rapordan detaya custom kimliğini ve tarihlerini birlikte taşır', () => {
    const reportPage = fs.readFileSync(
      path.join(ROOT, 'src/app/raporlar/index.tsx'),
      'utf8',
    );
    const periodHook = fs.readFileSync(
      path.join(ROOT, 'src/hooks/useReportPeriod.ts'),
      'utf8',
    );
    const trendHook = fs.readFileSync(
      path.join(ROOT, 'src/hooks/useAnalyticsTrend.ts'),
      'utf8',
    );

    expect(reportPage.match(/period,\s*\n\s*periodOffset:/g)).toHaveLength(2);
    expect(reportPage).toContain("isCustomRange={period === 'custom'}");
    expect(periodHook).toMatch(
      /getDateRangeLabel\(\s*period,\s*period === 'custom' \? 0 : periodOffset,\s*customRange/,
    );
    expect(trendHook).toContain('buildCustomTrendPeriods(dateRange)');
    expect(trendHook).toContain(
      "isCustomRange ? 'custom-range' : 'standard-range'",
    );
  });
});
