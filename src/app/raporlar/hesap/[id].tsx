import { useState, useCallback, useMemo } from 'react';
import { View, StyleSheet, FlatList, TouchableOpacity, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, Stack } from 'expo-router';
import { TrendingUp, TrendingDown } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Text, Button } from '@/components/ui';
import { QuickTransactionBar } from '@/components/transaction/QuickTransactionBar';
import { SkeletonListItem } from '@/components/ui/Skeleton';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { formatCurrency } from '@/lib/currency';
import { useDateFormat } from '@/hooks/useDateFormat';
import { useIncomeSourceTransactions, IncomeSourceKind } from '@/hooks/useAccountReport';
import { usePagePermission } from '@/hooks/usePagePermission';
import { useSettings } from '@/hooks/useSettings';
import { useExchangeRates, convertCurrency } from '@/hooks/useExchangeRates';
import { IslemWithRelations, KategoriType } from '@/types/database';

/**
 * Hesap raporu drill-down: bir banka/nakit hesabının dönem içi GELİR işlemleri.
 * Gelir-Gider raporunda (Gelir görünümü) hesap kartına tıklanınca açılır.
 */
export default function HesapRaporDetayPage() {
  usePagePermission({ module: 'raporlar' });
  const { t } = useTranslation(['reports', 'transactions', 'common']);
  const { formatDateMedium } = useDateFormat();
  const params = useLocalSearchParams<{
    id: string;
    hesapName?: string;
    hesapCurrency?: string;
    kind?: string;
    type?: string;
    startDate?: string;
    endDate?: string;
  }>();
  const sourceId = params.id;
  const hesapName = params.hesapName || '—';
  const hesapCurrency = params.hesapCurrency || 'TRY';
  const kind = (params.kind as IncomeSourceKind) || 'hesap';
  const type = (params.type as KategoriType) || 'gelir';
  const startDate = params.startDate || '';
  const endDate = params.endDate || '';
  const isGelir = type !== 'gider';

  const { currency: baseCurrency } = useSettings();
  const { data: ratesData } = useExchangeRates();
  const rates = ratesData?.rates;

  const { data: islemler, isLoading, isFetching, error, refetch } = useIncomeSourceTransactions(
    kind,
    sourceId,
    { startDate, endDate }
  );

  const [editTransactionId, setEditTransactionId] = useState<string | null>(null);
  const [showEditBar, setShowEditBar] = useState(false);
  const handleEdit = useCallback((id: string) => {
    setEditTransactionId(id);
    setShowEditBar(true);
  }, []);
  const handleEditDismiss = useCallback(() => {
    setShowEditBar(false);
    setEditTransactionId(null);
  }, []);

  // Toplam hesabın KENDİ para biriminde (işlem tutarları o para birimindedir).
  const total = useMemo(
    () => (islemler || []).reduce((sum, i) => sum + Number(i.amount || 0), 0),
    [islemler]
  );
  // Hesap para birimi ana para biriminden farklıysa altında ana para birimi karşılığı.
  const baseTotal = useMemo(
    () => (hesapCurrency === baseCurrency ? null : convertCurrency(total, hesapCurrency, baseCurrency, rates) ?? null),
    [total, hesapCurrency, baseCurrency, rates]
  );

  const renderItem = useCallback(
    ({ item }: { item: IslemWithRelations }) => (
      <TouchableOpacity style={styles.card} onPress={() => handleEdit(item.id)} activeOpacity={0.7}>
        <View style={[styles.icon, { backgroundColor: isGelir ? colors.successLight : colors.errorLight }]}>
          {isGelir ? (
            <TrendingUp size={16} color={colors.success} />
          ) : (
            <TrendingDown size={16} color={colors.error} />
          )}
        </View>
        <View style={styles.info}>
          <Text variant="body" numberOfLines={1} style={styles.title}>
            {item.cari?.name
              || (item.personel ? `${item.personel.first_name} ${item.personel.last_name ?? ''}`.trim() : null)
              || item.description
              || t(`transactions:types.${item.type}`)}
          </Text>
          <Text variant="caption" color="secondary">
            {t(`transactions:types.${item.type}`)} • {formatDateMedium(item.date)}
          </Text>
          {item.description && (item.cari || item.personel) && (
            <Text variant="caption" color="secondary" numberOfLines={1}>
              {item.description}
            </Text>
          )}
        </View>
        <Text style={[styles.amount, { color: isGelir ? colors.success : colors.error }]} numberOfLines={1}>
          {formatCurrency(Number(item.amount), item.hesap?.currency || hesapCurrency)}
        </Text>
      </TouchableOpacity>
    ),
    [handleEdit, isGelir, t, formatDateMedium, hesapCurrency]
  );

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen options={{ title: hesapName, headerBackVisible: true, gestureEnabled: true }} />

      {/* Özet: hesabın dönem toplam geliri */}
      <View style={styles.summary}>
        <Text variant="caption" color="secondary" style={styles.summaryLabel}>
          {isGelir ? t('reports:summary.totalIncome') : t('reports:summary.totalExpense')}
        </Text>
        <Text style={styles.summaryAmount} color={isGelir ? 'success' : 'error'}>
          {formatCurrency(total, hesapCurrency)}
        </Text>
        {baseTotal !== null && (
          <Text variant="caption" color="secondary">
            ≈ {formatCurrency(baseTotal, baseCurrency)}
          </Text>
        )}
      </View>

      {isLoading ? (
        <View style={styles.stateBox}>
          <SkeletonListItem />
          <SkeletonListItem />
          <SkeletonListItem />
        </View>
      ) : error ? (
        <View style={styles.stateBox}>
          <Text color="error" style={styles.stateText}>{t('reports:empty.dataLoadError')}</Text>
          <Button variant="ghost" onPress={() => refetch()}>{t('common:buttons.retry')}</Button>
        </View>
      ) : (
        <FlatList
          data={islemler || []}
          keyExtractor={(i) => i.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={isFetching && !isLoading} onRefresh={refetch} tintColor={colors.primary} />
          }
          ListEmptyComponent={
            <View style={styles.stateBox}>
              <Text color="secondary" style={styles.stateText}>{t('reports:empty.noIncomeTransactions')}</Text>
            </View>
          }
        />
      )}

      {/* Düzenleme için QuickTransactionBar */}
      <QuickTransactionBar
        visible={showEditBar}
        onDismiss={handleEditDismiss}
        mode="edit"
        transactionId={editTransactionId ?? undefined}
        isScheduledTransaction={false}
        onSuccess={handleEditDismiss}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  summary: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  summaryLabel: { textTransform: 'uppercase', letterSpacing: 0.5 },
  summaryAmount: { fontSize: 24, fontWeight: '700', marginTop: 2 },
  listContent: { padding: spacing.md, paddingBottom: spacing['3xl'] },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
  },
  icon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  info: { flex: 1, marginRight: spacing.sm },
  title: { fontWeight: '600' },
  amount: { fontSize: 15, fontWeight: '700' },
  stateBox: { padding: spacing.xl, alignItems: 'center', gap: spacing.sm },
  stateText: { textAlign: 'center' },
});
