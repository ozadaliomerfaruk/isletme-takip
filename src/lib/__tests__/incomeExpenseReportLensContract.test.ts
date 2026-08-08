import fs from 'fs';
import path from 'path';

import {
  formatReportLensValue,
  isIncomeExpenseLens,
  reportLensCurrency,
} from '@/lib/reportLens';

const ROOT = path.resolve(__dirname, '../../..');
const migrationPath = path.join(
  ROOT,
  'supabase/migrations/20260806124340_add_daily_economic_indicators_and_report_lens.sql',
);
const futureAndComparisonMigrationPath = path.join(
  ROOT,
  'supabase/migrations/20260806174821_fix_future_report_lens_and_add_comparison_lens.sql',
);
const xagMigrationPath = path.join(
  ROOT,
  'supabase/migrations/20260806184140_add_historical_xag_source_rates.sql',
);
const syncPath = path.join(
  ROOT,
  'supabase/functions/sync-ekonomik-gostergeler-evds/index.ts',
);
const backfillPath = path.join(ROOT, 'scripts/backfill-economic-indicators.mjs');
const pagePath = path.join(ROOT, 'src/app/raporlar/gelir-gider.tsx');
const detailPagePath = path.join(ROOT, 'src/app/raporlar/kategori/[id].tsx');
const comparisonPagePath = path.join(ROOT, 'src/app/raporlar/karsilastirma.tsx');
const comparisonHookPath = path.join(ROOT, 'src/hooks/useComparisonReport.ts');
const lensPickerPath = path.join(
  ROOT,
  'src/components/reports/IncomeExpenseLensPicker.tsx',
);
const netWorthLensPath = path.join(ROOT, 'src/hooks/useNetWorthLenses.ts');

describe('income/expense historical lens contract', () => {
  it('keeps the schema change additive and leaves the v2 RPC untouched', () => {
    const sql = fs.readFileSync(migrationPath, 'utf8');

    expect(sql).toContain('CREATE TABLE public.ekonomik_gostergeler_gunluk');
    expect(sql).toContain('CREATE FUNCTION public.get_category_report_lens_v1');
    expect(sql).not.toMatch(/CREATE OR REPLACE FUNCTION public\.get_category_report_v2/i);
    expect(sql).not.toMatch(/^\s*(?:DROP|TRUNCATE|DELETE\s+FROM|UPDATE\s+public\.)\b/im);
  });

  it('uses transaction-day source and lens rates without silently falling back to one', () => {
    const sql = fs.readFileSync(migrationPath, 'utf8');

    expect(sql).toContain('transaction_row.date::date AS islem_gunu');
    expect(sql).toContain("WHEN 'XAU' THEN daily.gram_altin_try");
    expect(sql).toContain('rate.source_rate / rate.lens_rate');
    expect(sql).toContain('rate.source_rate * rate.current_cpi / rate.transaction_cpi');
    expect(sql).toContain('rated.rate_complete IS NOT TRUE');
    expect(sql).toContain("'missing_rate_count'");
    expect(sql).toContain('daily.gun >= rate_key.islem_gunu - 7');
    expect(sql).not.toContain('COALESCE(source_observation.source_rate, 1)');
  });

  it('adds historical XAG as a source rate without changing the available lenses', () => {
    const sql = fs.readFileSync(xagMigrationPath, 'utf8');
    const sync = fs.readFileSync(syncPath, 'utf8');

    expect(sql).toContain('ADD COLUMN IF NOT EXISTS gram_gumus_try numeric(18, 8)');
    expect(sql.match(/WHEN 'XAG' THEN daily\.gram_gumus_try/g)).toHaveLength(4);
    expect(sql).not.toMatch(/^\s*(?:DROP|TRUNCATE|DELETE\s+FROM|UPDATE\s+public\.)\b/im);
    expect(sync).toContain('metalpriceapi-historical');
    expect(sync).toContain('.select("gun,usd_try")');
    expect(sync).toContain('const warnings: string[] = []');
    expect(sync).toContain('kind: "degraded"');
    expect(sync).not.toContain('currencies=XAU,XAG');
  });

  it('preserves v2 permission, passive/archive and product-distribution rules', () => {
    const sql = fs.readFileSync(migrationPath, 'utf8');

    expect(sql).toContain("internal.etkin_yetki_v2(p_isletme_id, 'raporlar')");
    expect(sql).toContain('transaction_row.created_by = v_user_id');
    expect(sql).toContain('(account.id IS NULL OR account.is_active = true)');
    expect(sql).toContain('(cari.id IS NULL OR cari.is_active IS TRUE)');
    expect(sql).toContain('product_category.mapped_gider_kategori_id');
    expect(sql).toContain('product_category.mapped_gelir_kategori_id');
    expect(sql).toContain('movement_amount.hareket_tutar');
  });

  it('syncs official daily sources, retries seven days and exposes partial failures', () => {
    const source = fs.readFileSync(syncPath, 'utf8');

    expect(source).toContain('/kurlar/${parts.yearMonth}/${parts.dayMonthYear}.xml');
    expect(source).toContain('/reeskontkur/${parts.yearMonth}/${parts.dayMonthYear}-1100.xml');
    expect(source).toContain('addDays(today, -6)');
    expect(source).toContain('MAX_DAILY_RANGE_DAYS = 40');
    expect(source).toContain('DAILY_FETCH_CONCURRENCY = 5');
    expect(source).toContain('GOLD_ARCHIVE_START_DAY = "2021-12-29"');
    expect(source).toContain('expected business-day archive is missing');
    expect(source).toContain('status: success ? 200 : 502');
    expect(source).not.toContain('"TP.MK.KUL.YTL"');
  });

  it('ships a bounded, resumable and opt-in five-year backfill runner', () => {
    const source = fs.readFileSync(backfillPath, 'utf8');

    expect(source).toContain('BATCH_DAYS = 40');
    expect(source).toContain("process.argv.includes('--execute')");
    expect(source).toContain('skipMonthly: index < batches.length - 1');
    expect(source).toContain('{ monthlyFrom: startDay }');
    expect(source).toContain('rerun is idempotent');
  });

  it('maps every UI lens to an explicit output unit', () => {
    expect(isIncomeExpenseLens('altin')).toBe(true);
    expect(isIncomeExpenseLens('xag')).toBe(false);
    expect(reportLensCurrency('nominal')).toBeUndefined();
    expect(reportLensCurrency('reel')).toBe('TRY');
    expect(reportLensCurrency('usd')).toBe('USD');
    expect(reportLensCurrency('eur')).toBe('EUR');
    expect(reportLensCurrency('altin')).toBe('XAU');
    expect(formatReportLensValue(-2, 'altin')).toContain('-');
  });

  it('shows historical lenses only for TRY and carries the lens into category details', () => {
    const page = fs.readFileSync(pagePath, 'utf8');
    const detailPage = fs.readFileSync(detailPagePath, 'utf8');

    expect(page).toContain("baseCurrency === 'TRY'");
    // İki kategori aggregate sorgusu + kaynak aggregate + detay rotası + Excel özeti.
    expect(page.match(/lens: selectedLens/g)?.length ?? 0).toBeGreaterThanOrEqual(5);
    expect(page).toContain('exportLensSummary({');
    expect(page).toContain("currency: reportLensCurrency(selectedLens) ?? 'TRY'");
    expect(page).not.toContain("canExport && selectedLens === 'nominal'");
    expect(page).not.toContain("onPress={selectedLens === 'nominal'");
    expect(page).toContain('historicalMissingRateCount');
    expect(detailPage).toContain('useHistoricalReportLens');
    expect(detailPage).toContain('formatReportLensValue');
    expect(detailPage).toContain('getReportTransactionCurrency');
    expect(detailPage).toContain('lens: selectedLens');
    expect(detailPage).toContain('incomeExpenseLens.cpiRateCompact');
    expect(detailPage).toContain('incomeExpenseLens.dailyRateCompact');
    expect(detailPage).not.toContain('detailParts.join');
    expect(detailPage).not.toContain('incomeExpenseLens.originalAmount');
    expect(detailPage).toContain('incomeExpenseLens.exportBlockedIncomplete');
    expect(page).not.toContain('incomeExpenseLens.nominalOnlyDetails');
  });

  it('caps future references at today in both aggregate and detail calculations', () => {
    const sql = fs.readFileSync(futureAndComparisonMigrationPath, 'utf8');
    const detailHook = fs.readFileSync(
      path.join(ROOT, 'src/hooks/useHistoricalReportLens.ts'),
      'utf8',
    );

    expect(sql).toContain("CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Istanbul'");
    expect(sql).toContain('LEAST(');
    expect(sql).toContain('AS referans_gunu');
    expect(sql).toContain('daily.gun <= rate_key.referans_gunu');
    expect(detailHook).toContain('capAtDay(startDate, currentDay)');
    expect(detailHook).toContain('capAtDay(endDate, currentDay)');
    expect(detailHook).toContain('const currentDay = turkeyIsoDay()');
    expect(detailHook).not.toContain('localIsoDay');
    expect(sql).not.toMatch(/^\s*(?:DROP|TRUNCATE|DELETE\s+FROM|UPDATE\s+public\.)\b/im);
  });

  it('uses one batch RPC for comparison lenses and exposes the sticky picker on all report surfaces', () => {
    const sql = fs.readFileSync(futureAndComparisonMigrationPath, 'utf8');
    const page = fs.readFileSync(pagePath, 'utf8');
    const detailPage = fs.readFileSync(detailPagePath, 'utf8');
    const comparisonPage = fs.readFileSync(comparisonPagePath, 'utf8');
    const comparisonHook = fs.readFileSync(comparisonHookPath, 'utf8');
    const picker = fs.readFileSync(lensPickerPath, 'utf8');

    expect(sql).toContain('CREATE FUNCTION public.get_income_expense_comparison_lens_v1');
    expect(sql).toContain('pg_catalog.cardinality(p_start_dates) > 40');
    expect(sql).toContain('product.is_active IS TRUE');
    expect(sql).toContain('transaction_row.created_by = v_user_id');
    expect(comparisonHook).toContain("'get_income_expense_comparison_lens_v1'");
    expect(comparisonHook).toContain('bucketRanges.map');
    expect(comparisonHook).toContain('canExportCompleteHistoricalResult');
    expect(comparisonHook).toContain('incomeExpenseLens.exportBlockedIncomplete');
    expect(page).toContain('<IncomeExpenseLensPicker');
    expect(detailPage.match(/<IncomeExpenseLensPicker/g)).toHaveLength(3);
    expect(comparisonPage).toContain('<IncomeExpenseLensPicker');
    expect(picker).toContain('animationType="none"');
    expect(picker).toContain('onShow={handlePanelShow}');
    expect(picker).toContain('transform: [{ translateY: panelY }]');
    expect(picker).toContain('Easing.out(Easing.cubic)');
    expect(picker).toContain('useNativeDriver: true');
    expect(picker).not.toContain('PANEL_HIDDEN_Y');
    expect(picker).toContain('<GlassSurface');
    expect(picker).toContain('tintColor={GLASS_TINT_CONTROL}');
    expect(picker).toContain('pressed && styles.stickyButtonPressed');
  });

  it('does not present months-old net-worth rates as current values', () => {
    const source = fs.readFileSync(netWorthLensPath, 'utf8');

    expect(source).toContain('monthDistance(lastGoldMonth, p.month) <= 1');
    expect(source).toContain('monthDistance(lastUsdMonth, p.month) <= 1');
    expect(source).toContain('monthDistance(lastEurMonth, p.month) <= 1');
  });
});
