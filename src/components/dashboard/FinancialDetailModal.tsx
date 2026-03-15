import { useState, useEffect, useMemo, useCallback } from 'react';
import { View, StyleSheet, TouchableOpacity, ScrollView, InteractionManager, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, ChevronRight as ArrowRight } from 'lucide-react-native';
import { Text, AnimatedNumber } from '@/components/ui';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { formatCurrency } from '@/lib/currency';
import { getCurrentCurrency } from '@/hooks/useSettings';
import { useMonthSummary, type PeriodType } from '@/hooks/useIslemler';
import { useCashFlowByCategory } from '@/hooks/useCashFlowByCategory';
import { useDateFormat } from '@/hooks/useDateFormat';

const PERIOD_OPTIONS: Exclude<PeriodType, 'custom'>[] = ['yearly', 'monthly', 'weekly', 'daily'];

interface FinancialDetailModalProps {
  visible: boolean;
  onDismiss: () => void;
}

export function FinancialDetailModal({ visible, onDismiss }: FinancialDetailModalProps) {
  const { t } = useTranslation(['common', 'reports']);
  const router = useRouter();
  const { getDateRangeLabel } = useDateFormat();

  const [period, setPeriod] = useState<Exclude<PeriodType, 'custom'>>('monthly');
  const [periodOffset, setPeriodOffset] = useState(0);

  // Defer data rendering until open animation completes
  const [ready, setReady] = useState(false);

  // Reset when modal opens
  useEffect(() => {
    if (visible) {
      setPeriod('monthly');
      setPeriodOffset(0);
      setReady(false);
      const handle = InteractionManager.runAfterInteractions(() => {
        setReady(true);
      });
      return () => handle.cancel();
    }
    setReady(false);
  }, [visible]);

  // Date range calculation
  const { startDate, endDate, label: periodLabel } = getDateRangeLabel(period, periodOffset);

  // Data hooks
  const { data: monthSummary } = useMonthSummary(period, periodOffset);
  const { totalInflow, totalOutflow, netCashFlow } = useCashFlowByCategory({ startDate, endDate });

  const income = monthSummary?.income ?? 0;
  const expense = monthSummary?.expense ?? 0;
  const netProfit = income - expense;
  const incomeExpenseTotal = income + expense;
  const incomePercent = incomeExpenseTotal > 0 ? (income / incomeExpenseTotal) * 100 : 50;

  const cashFlowTotal = totalInflow + totalOutflow;
  const inflowPercent = cashFlowTotal > 0 ? (totalInflow / cashFlowTotal) * 100 : 50;

  const currencyConfig = useMemo(() => {
    const config = getCurrentCurrency();
    const isEnglish = config.locale.startsWith('en') || config.locale.startsWith('de');
    return {
      prefix: config.symbol,
      decimalSeparator: isEnglish ? ('.' as const) : (',' as const),
      thousandsSeparator: isEnglish ? (',' as const) : ('.' as const),
    };
  }, []);

  const canGoForward = periodOffset < 0;

  const navigateToReport = useCallback((pathname: string) => {
    onDismiss();
    setTimeout(() => {
      router.push({
        pathname: pathname as any,
        params: { period, periodOffset: String(periodOffset), startDate, endDate },
      });
    }, 300);
  }, [onDismiss, router, period, periodOffset, startDate, endDate]);

  return (
    <BottomSheet visible={visible} onDismiss={onDismiss} snapPoints={[0.72]}>
      <ScrollView style={styles.container} showsVerticalScrollIndicator={false} bounces={false}>
        {/* Date Navigation */}
        <View style={styles.dateNav}>
          <TouchableOpacity
            onPress={() => setPeriodOffset(prev => prev - 1)}
            style={styles.navButton}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <ChevronLeft size={22} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.dateLabel}>{periodLabel}</Text>
          <TouchableOpacity
            onPress={() => canGoForward && setPeriodOffset(prev => prev + 1)}
            style={[styles.navButton, !canGoForward && styles.navButtonDisabled]}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            disabled={!canGoForward}
          >
            <ChevronRight size={22} color={canGoForward ? colors.text : colors.border} />
          </TouchableOpacity>
        </View>

        {/* Period Tabs */}
        <View style={styles.tabsContainer}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tabsContent}
            bounces={false}
          >
            {PERIOD_OPTIONS.map((p) => {
              const isActive = p === period;
              return (
                <TouchableOpacity
                  key={p}
                  style={[styles.tab, isActive && styles.tabActive]}
                  onPress={() => {
                    if (p !== period) {
                      setPeriod(p);
                      setPeriodOffset(0);
                    }
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.tabText, isActive && styles.tabTextActive]} numberOfLines={1}>
                    {t(`common:period.${p}`)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {!ready ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color={colors.primary} />
          </View>
        ) : (
          <>
            {/* Income/Expense Section */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>{t('common:dashboard.profitLoss')}</Text>
                <AnimatedNumber
                  value={netProfit}
                  showSign
                  prefix={currencyConfig.prefix}
                  decimalSeparator={currencyConfig.decimalSeparator}
                  thousandsSeparator={currencyConfig.thousandsSeparator}
                  style={[styles.sectionValue, { color: netProfit >= 0 ? colors.success : colors.error }]}
                />
              </View>

              {/* Progress Bar */}
              <View style={styles.progressBar}>
                <View style={[styles.progressFill, styles.progressGreen, { width: `${incomePercent}%` }]} />
                <View style={[styles.progressFill, styles.progressRed, { width: `${100 - incomePercent}%` }]} />
              </View>

              {/* Income & Expense Rows */}
              <View style={styles.detailRows}>
                <TouchableOpacity
                  style={styles.detailRow}
                  onPress={() => navigateToReport('/raporlar/gelir-gider')}
                  activeOpacity={0.6}
                >
                  <View style={styles.detailLeft}>
                    <View style={[styles.dot, { backgroundColor: colors.success }]} />
                    <Text style={styles.detailLabel}>{t('common:dashboard.income')}</Text>
                  </View>
                  <View style={styles.detailRight}>
                    <Text style={[styles.detailValue, { color: colors.success }]}>{formatCurrency(income)}</Text>
                    <ArrowRight size={14} color={colors.textMuted} />
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.detailRow}
                  onPress={() => navigateToReport('/raporlar/gelir-gider')}
                  activeOpacity={0.6}
                >
                  <View style={styles.detailLeft}>
                    <View style={[styles.dot, { backgroundColor: colors.error }]} />
                    <Text style={styles.detailLabel}>{t('common:dashboard.expense')}</Text>
                  </View>
                  <View style={styles.detailRight}>
                    <Text style={[styles.detailValue, { color: colors.error }]}>{formatCurrency(expense)}</Text>
                    <ArrowRight size={14} color={colors.textMuted} />
                  </View>
                </TouchableOpacity>
              </View>

              <Text style={styles.description}>{t('common:dashboard.profitDescription')}</Text>
            </View>

            {/* Cash Flow Section */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>{t('common:dashboard.cashFlow')}</Text>
                <AnimatedNumber
                  value={netCashFlow}
                  showSign
                  prefix={currencyConfig.prefix}
                  decimalSeparator={currencyConfig.decimalSeparator}
                  thousandsSeparator={currencyConfig.thousandsSeparator}
                  style={[styles.sectionValue, { color: netCashFlow >= 0 ? colors.success : colors.error }]}
                />
              </View>

              {/* Progress Bar */}
              <View style={styles.progressBar}>
                <View style={[styles.progressFill, styles.progressGreen, { width: `${inflowPercent}%` }]} />
                <View style={[styles.progressFill, styles.progressRed, { width: `${100 - inflowPercent}%` }]} />
              </View>

              {/* Inflow & Outflow Rows */}
              <View style={styles.detailRows}>
                <TouchableOpacity
                  style={styles.detailRow}
                  onPress={() => navigateToReport('/nakit-akisi')}
                  activeOpacity={0.6}
                >
                  <View style={styles.detailLeft}>
                    <View style={[styles.dot, { backgroundColor: colors.success }]} />
                    <Text style={styles.detailLabel}>{t('common:dashboard.received')}</Text>
                  </View>
                  <View style={styles.detailRight}>
                    <Text style={[styles.detailValue, { color: colors.success }]}>{formatCurrency(totalInflow)}</Text>
                    <ArrowRight size={14} color={colors.textMuted} />
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.detailRow}
                  onPress={() => navigateToReport('/nakit-akisi')}
                  activeOpacity={0.6}
                >
                  <View style={styles.detailLeft}>
                    <View style={[styles.dot, { backgroundColor: colors.error }]} />
                    <Text style={styles.detailLabel}>{t('common:dashboard.paid')}</Text>
                  </View>
                  <View style={styles.detailRight}>
                    <Text style={[styles.detailValue, { color: colors.error }]}>{formatCurrency(totalOutflow)}</Text>
                    <ArrowRight size={14} color={colors.textMuted} />
                  </View>
                </TouchableOpacity>
              </View>

              <Text style={styles.description}>{t('common:dashboard.cashFlowDescription')}</Text>
            </View>
          </>
        )}
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: spacing.lg,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  // Date Navigation
  dateNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  navButton: {
    padding: 4,
  },
  navButtonDisabled: {
    opacity: 0.3,
  },
  dateLabel: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    minWidth: 120,
    textAlign: 'center',
  },
  // Period Tabs
  tabsContainer: {
    backgroundColor: colors.surfaceLighter,
    borderRadius: borderRadius.full,
    padding: 3,
    marginBottom: spacing.lg,
  },
  tabsContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  tab: {
    flex: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: 7,
    borderRadius: borderRadius.full,
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: colors.surface,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  tabTextActive: {
    fontWeight: '700',
    color: colors.text,
  },
  // Section
  section: {
    marginBottom: spacing.lg,
    backgroundColor: colors.background,
    borderRadius: borderRadius.xl,
    padding: spacing.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textMuted,
  },
  sectionValue: {
    fontSize: 20,
    fontWeight: '700',
  },
  // Progress Bar
  progressBar: {
    flexDirection: 'row',
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    backgroundColor: colors.border,
    marginBottom: spacing.md,
  },
  progressFill: {
    height: '100%',
  },
  progressGreen: {
    backgroundColor: colors.success,
    borderTopLeftRadius: 3,
    borderBottomLeftRadius: 3,
  },
  progressRed: {
    backgroundColor: colors.error,
    borderTopRightRadius: 3,
    borderBottomRightRadius: 3,
  },
  // Detail Rows
  detailRows: {
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  detailLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  detailRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  detailLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
  },
  detailValue: {
    fontSize: 16,
    fontWeight: '700',
  },
  description: {
    fontSize: 12,
    color: colors.textMuted,
    lineHeight: 16,
  },
});
