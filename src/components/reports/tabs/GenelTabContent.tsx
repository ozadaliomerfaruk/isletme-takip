import { View, StyleSheet, TouchableOpacity } from 'react-native';
import {
  TrendingDown,
  Wallet,
  Users,
  Building2,
  CreditCard,
  AlertTriangle,
} from 'lucide-react-native';
import { useRouter, useSegments } from 'expo-router';
import { goToTab } from '@/lib/tabNav';
import { useTranslation } from 'react-i18next';

import { Text, Card } from '@/components/ui';
import { SkeletonSummaryCard, SkeletonAccountList } from '@/components/ui/Skeleton';
import { colors } from '@/constants/colors';
import { spacing } from '@/constants/spacing';
import { formatCurrency } from '@/lib/currency';
import { toNumber } from '@/lib/currency';
import { useHesaplar } from '@/hooks/useHesaplar';
import { useCariler } from '@/hooks/useCariler';
import { usePersonelList } from '@/hooks/usePersonel';
import { useFinancialSummary } from '@/hooks/useFinancialSummary';
import { useSettings } from '@/hooks/useSettings';
import { useExchangeRates, convertCurrency } from '@/hooks/useExchangeRates';
import type { TabContentProps } from './types';

export function GenelTabContent(_props: TabContentProps) {
  const router = useRouter();
  const segments = useSegments();
  const { t } = useTranslation(['reports', 'common']);
  const { currency: baseCurrency } = useSettings();

  const { data: hesaplar } = useHesaplar();
  const { data: cariler } = useCariler();
  const { data: personelList } = usePersonelList();
  const { data: exchangeRatesData } = useExchangeRates();
  const exchangeRates = exchangeRatesData?.rates;
  const financialSummary = useFinancialSummary();

  // İlk yüklemede sıfır-değerli kartların flash etmesini önle (diğer rapor tab'larıyla tutarlı).
  if (financialSummary.isLoading) {
    return (
      <>
        <View style={styles.section}><SkeletonSummaryCard /></View>
        <View style={styles.section}><SkeletonAccountList count={3} /></View>
      </>
    );
  }

  const totalReceivables = financialSummary.receivables.cari;
  const totalPayables = financialSummary.payables.cari;
  const personelReceivables = financialSummary.receivables.personel;
  const personelDebt = financialSummary.payables.personel;

  const totalAccounts = financialSummary.accounts;
  const totalReceivablesAll = financialSummary.receivables.total;
  const totalPayablesAll = financialSummary.payables.total;
  const netValue = financialSummary.generalStatus;
  const totalPositive = totalAccounts + totalReceivablesAll;
  const totalAll = totalPositive + totalPayablesAll;
  const positivePercent = totalAll > 0 ? (totalPositive / totalAll) * 100 : 50;

  const normalHesaplar = hesaplar?.filter(h => h.type !== 'kredi_karti') || [];
  const krediKartiHesaplar = hesaplar?.filter(h => h.type === 'kredi_karti') || [];

  const convertBalance = (h: typeof normalHesaplar[0]) => {
    const balance = toNumber(h.balance);
    const currency = h.currency || baseCurrency;
    if (currency === baseCurrency) return balance;
    return convertCurrency(balance, currency, baseCurrency, exchangeRates) ?? balance;
  };

  const normalHesaplarToplam = normalHesaplar.reduce((acc, h) => acc + convertBalance(h), 0);
  const krediKartiToplam = krediKartiHesaplar.reduce((acc, h) => acc + convertBalance(h), 0);

  return (
    <>
      {/* Genel Durum Ozet Karti */}
      <View style={styles.section}>
        <Card style={styles.heroCard}>
          <View style={styles.heroHeader}>
            <Text variant="label" color="secondary">
              {t('reports:summary.generalStatus')}
            </Text>
            <View style={styles.heroBadge}>
              <Text style={styles.heroBadgeText}>{t('reports:period.instant')}</Text>
            </View>
          </View>

          <View style={styles.heroMainValue}>
            <Text
              style={[
                styles.heroBigNumber,
                { color: netValue >= 0 ? colors.success : colors.error },
              ]}
            >
              {netValue >= 0 ? '+' : ''}{formatCurrency(netValue, baseCurrency)}
            </Text>
            <Text variant="caption" color="secondary">
              {t('reports:summary.netValue')}
            </Text>
          </View>

          <View style={styles.heroProgressContainer}>
            <View style={styles.heroProgressBar}>
              <View
                style={[
                  styles.heroProgressFill,
                  styles.heroProgressGreen,
                  { width: `${positivePercent}%` },
                ]}
              />
              <View
                style={[
                  styles.heroProgressFill,
                  styles.heroProgressRed,
                  { width: `${100 - positivePercent}%` },
                ]}
              />
            </View>
          </View>

          <View style={styles.heroDetailsRowThree}>
            <View style={styles.heroDetailItemThree}>
              <View style={styles.heroDetailHeader}>
                <View style={[styles.heroDotIndicator, { backgroundColor: colors.success }]} />
                <Text variant="caption" color="secondary">
                  {t('common:dashboard.accounts')}
                </Text>
              </View>
              <Text style={[styles.heroDetailValue, { color: colors.success }]}>
                {formatCurrency(totalAccounts, baseCurrency)}
              </Text>
            </View>

            <View style={styles.heroDetailDivider} />

            <View style={styles.heroDetailItemThree}>
              <View style={styles.heroDetailHeader}>
                <View style={[styles.heroDotIndicator, { backgroundColor: colors.info }]} />
                <Text variant="caption" color="secondary">
                  {t('common:dashboard.receivables')}
                </Text>
              </View>
              <Text style={[styles.heroDetailValue, { color: colors.info }]}>
                {formatCurrency(totalReceivablesAll, baseCurrency)}
              </Text>
            </View>

            <View style={styles.heroDetailDivider} />

            <View style={[styles.heroDetailItemThree, { alignItems: 'flex-end' }]}>
              <View style={styles.heroDetailHeader}>
                <Text variant="caption" color="secondary">
                  {t('common:dashboard.payables')}
                </Text>
                <View style={[styles.heroDotIndicator, { backgroundColor: colors.error }]} />
              </View>
              <Text style={[styles.heroDetailValue, { color: colors.error }]}>
                {formatCurrency(totalPayablesAll, baseCurrency)}
              </Text>
            </View>
          </View>
        </Card>
        {financialSummary.conversionIncomplete && (
          <View style={styles.conversionWarning}>
            <AlertTriangle size={14} color={colors.error} />
            <Text variant="caption" color="error" style={styles.conversionWarningText}>
              {t('reports:summary.conversionIncomplete')}
            </Text>
          </View>
        )}
      </View>

      {/* Hesap Bakiyeleri */}
      <View style={styles.section}>
        <Text variant="label" color="secondary" style={styles.sectionTitle}>
          {t('reports:sections.accountBalances')}
        </Text>
        <Card>
          <View style={styles.accountHeader}>
            <Wallet size={20} color={colors.primary} />
            <Text variant="body" style={{ marginLeft: spacing.sm }}>
              {t('reports:counts.account', { count: normalHesaplar.length })}
            </Text>
            <View style={{ flex: 1 }} />
            <Text variant="h3" color={normalHesaplarToplam >= 0 ? 'primary' : 'error'}>
              {formatCurrency(normalHesaplarToplam, baseCurrency)}
            </Text>
          </View>
          {normalHesaplar.map((hesap) => {
            const hesapCurrency = hesap.currency || baseCurrency;
            const balance = toNumber(hesap.balance);
            return (
              <View key={hesap.id} style={styles.accountItem}>
                <Text variant="body">{hesap.name}</Text>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text variant="label" color={balance >= 0 ? 'primary' : 'error'}>
                    {formatCurrency(balance, hesapCurrency)}
                  </Text>
                  {hesapCurrency !== baseCurrency && exchangeRates && balance !== 0 && (
                    <Text variant="caption" color="secondary">
                      ~{formatCurrency(convertBalance(hesap), baseCurrency)}
                    </Text>
                  )}
                </View>
              </View>
            );
          })}
        </Card>
      </View>

      {/* Kredi Karti Borclari */}
      {krediKartiHesaplar.length > 0 && (
        <View style={styles.section}>
          <Text variant="label" color="secondary" style={styles.sectionTitle}>
            {t('reports:sections.creditCardBalances')}
          </Text>
          <Card>
            <View style={styles.accountHeader}>
              <CreditCard size={20} color={colors.error} />
              <Text variant="body" style={{ marginLeft: spacing.sm }}>
                {t('reports:counts.creditCard', { count: krediKartiHesaplar.length })}
              </Text>
              <View style={{ flex: 1 }} />
              <Text variant="h3" color="error">
                {formatCurrency(Math.abs(krediKartiToplam), baseCurrency)}
              </Text>
            </View>
            {krediKartiHesaplar.map((hesap) => {
              const hesapCurrency = hesap.currency || baseCurrency;
              const balance = toNumber(hesap.balance);
              return (
                <View key={hesap.id} style={styles.accountItem}>
                  <Text variant="body">{hesap.name}</Text>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text variant="label" color="error">
                      {formatCurrency(Math.abs(balance), hesapCurrency)}
                    </Text>
                    {hesapCurrency !== baseCurrency && exchangeRates && balance !== 0 && (
                      <Text variant="caption" color="secondary">
                        ~{formatCurrency(Math.abs(convertBalance(hesap)), baseCurrency)}
                      </Text>
                    )}
                  </View>
                </View>
              );
            })}
          </Card>
        </View>
      )}

      {/* Cari Durum */}
      <View style={styles.section}>
        <Text variant="label" color="secondary" style={styles.sectionTitle}>
          {t('reports:sections.clientStatus')}
        </Text>
        <TouchableOpacity activeOpacity={0.8} onPress={() => goToTab(router, segments, '/(tabs)/cariler')}>
          <Card>
            <View style={styles.accountHeader}>
              <Building2 size={20} color={colors.warning} />
              <Text variant="body" style={{ marginLeft: spacing.sm }}>
                {t('reports:counts.client', { count: cariler?.length ?? 0 })}
              </Text>
            </View>
            <View style={styles.cariSummaryRow}>
              <View style={styles.cariSummaryItem}>
                <Text variant="caption" color="secondary">
                  {t('reports:summary.receivables')}
                </Text>
                <Text variant="h3" color="success">
                  {formatCurrency(totalReceivables, baseCurrency)}
                </Text>
              </View>
              <View style={styles.cariSummaryItem}>
                <Text variant="caption" color="secondary">
                  {t('reports:summary.payables')}
                </Text>
                <Text variant="h3" color="error">
                  {formatCurrency(totalPayables, baseCurrency)}
                </Text>
              </View>
            </View>
            <View style={styles.divider} />
            <View style={styles.netRow}>
              <Text variant="body" color="secondary">
                {t('reports:summary.netStatus')}
              </Text>
              <Text variant="h3" color={totalReceivables - totalPayables >= 0 ? 'success' : 'error'}>
                {formatCurrency(totalReceivables - totalPayables, baseCurrency)}
              </Text>
            </View>
          </Card>
        </TouchableOpacity>
      </View>

      {/* Personel Durum */}
      <View style={[styles.section, { marginBottom: spacing['3xl'] }]}>
        <Text variant="label" color="secondary" style={styles.sectionTitle}>
          {t('reports:sections.personnelStatus')}
        </Text>
        <TouchableOpacity activeOpacity={0.8} onPress={() => goToTab(router, segments, '/(tabs)/personel')}>
          <Card>
            <View style={styles.accountHeader}>
              <Users size={20} color={colors.info} />
              <Text variant="body" style={{ marginLeft: spacing.sm }}>
                {t('reports:counts.personnel', { count: personelList?.length ?? 0 })}
              </Text>
            </View>
            <View style={styles.cariSummaryRow}>
              <View style={styles.cariSummaryItem}>
                <Text variant="caption" color="secondary">
                  {t('reports:summary.personnelReceivables')}
                </Text>
                <Text variant="h3" color="success">
                  {formatCurrency(personelReceivables, baseCurrency)}
                </Text>
              </View>
              <View style={styles.cariSummaryItem}>
                <Text variant="caption" color="secondary">
                  {t('reports:summary.totalPersonnelDebt')}
                </Text>
                <Text variant="h3" color="error">
                  {formatCurrency(personelDebt, baseCurrency)}
                </Text>
              </View>
            </View>
            <View style={styles.divider} />
            <View style={styles.netRow}>
              <Text variant="body" color="secondary">
                {t('reports:summary.netStatus')}
              </Text>
              <Text variant="h3" color={personelReceivables - personelDebt >= 0 ? 'success' : 'error'}>
                {formatCurrency(personelReceivables - personelDebt, baseCurrency)}
              </Text>
            </View>
          </Card>
        </TouchableOpacity>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  section: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  sectionTitle: {
    marginBottom: spacing.xs,
    marginLeft: spacing.xs,
  },
  conversionWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  conversionWarningText: {
    flex: 1,
    lineHeight: 16,
  },
  heroCard: {
    padding: spacing.lg,
  },
  heroHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  heroBadge: {
    backgroundColor: colors.primaryLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 12,
  },
  heroBadgeText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.primary,
  },
  heroMainValue: {
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  heroBigNumber: {
    fontSize: 36,
    fontWeight: '700',
    letterSpacing: -1,
    marginBottom: 4,
  },
  heroProgressContainer: {
    marginBottom: spacing.lg,
  },
  heroProgressBar: {
    flexDirection: 'row',
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: colors.border,
  },
  heroProgressFill: {
    height: '100%',
  },
  heroProgressGreen: {
    backgroundColor: colors.success,
    borderTopLeftRadius: 4,
    borderBottomLeftRadius: 4,
  },
  heroProgressRed: {
    backgroundColor: colors.error,
    borderTopRightRadius: 4,
    borderBottomRightRadius: 4,
  },
  heroDetailsRowThree: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heroDetailItemThree: {
    flex: 1,
    alignItems: 'center',
  },
  heroDetailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: spacing.xs,
  },
  heroDotIndicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  heroDetailDivider: {
    width: 1,
    height: 50,
    backgroundColor: colors.border,
    marginHorizontal: spacing.md,
  },
  heroDetailValue: {
    fontSize: 17,
    fontWeight: '600',
  },
  accountHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  accountItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  cariSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: spacing.md,
  },
  cariSummaryItem: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.sm,
  },
  netRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});
