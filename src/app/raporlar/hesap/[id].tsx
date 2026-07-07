import { useState, useCallback, useMemo } from 'react';
import { View, StyleSheet, FlatList, TouchableOpacity, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, Stack } from 'expo-router';
import {
  TrendingUp,
  TrendingDown,
  ChevronRight,
  Banknote,
  Landmark,
  CreditCard,
  PiggyBank,
  Wallet,
  User,
  type LucideIcon,
} from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Text, Button, Card } from '@/components/ui';
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
import { isIncomeReturnType } from '@/constants/islemTypes';

/**
 * Kaynak ikonu: IncomeSourceCard META haritasıyla birebir. Arama anahtarı
 * kind='hesap' ise hesabın alt-tipi (banka/nakit/...), değilse kind (cari/personel).
 * Renk sonundaki '20' = 8-bit alfa (~%12 opaklık) arka plan.
 */
const SOURCE_META: Record<string, { icon: LucideIcon; color: string }> = {
  nakit: { icon: Banknote, color: '#10B981' },
  banka: { icon: Landmark, color: '#3B82F6' },
  kredi_karti: { icon: CreditCard, color: '#8B5CF6' },
  birikim: { icon: PiggyBank, color: '#F59E0B' },
  diger: { icon: Wallet, color: '#6B7280' },
  cari: { icon: User, color: '#06B6D4' },
  personel: { icon: User, color: '#EC4899' },
};

/**
 * Hesap raporu drill-down: bir kaynağın (banka/nakit hesabı, cari veya personel)
 * dönem içi GELİR işlemleri. Gelir-Gider raporunda (Gelir görünümü) kaynak kartına
 * tıklanınca açılır.
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

  // Toplam hesabın KENDİ para biriminde; iadeler (cari_satis_iade) DÜŞÜLÜR → net.
  const total = useMemo(
    () =>
      (islemler || []).reduce(
        (sum, i) => sum + Number(i.amount || 0) * (isIncomeReturnType(i.type) ? -1 : 1),
        0
      ),
    [islemler]
  );
  // Hesap para birimi ana para biriminden farklıysa altında ana para birimi karşılığı.
  const baseTotal = useMemo(
    () => (hesapCurrency === baseCurrency ? null : convertCurrency(total, hesapCurrency, baseCurrency, rates) ?? null),
    [total, hesapCurrency, baseCurrency, rates]
  );

  // Kaynak ikonu: hesap alt-tipi params'ta yok → ilk işlemin hesabından türet ('diger' fallback).
  const accountType = (islemler?.[0]?.hesap?.type as string) || 'diger';
  const metaKey = kind === 'hesap' ? accountType : kind;
  const sourceMeta = SOURCE_META[metaKey] ?? SOURCE_META.diger;
  const SourceIcon = sourceMeta.icon;

  // Dönem etiketi (kategori detay sayfasındaki formatDateRange ile aynı mantık):
  // aynı ay+yıl ise "Temmuz 2026", değilse "8 Tem - 12 Ağu 2026".
  const periodLabel = useMemo(() => {
    if (!startDate || !endDate) return '';
    const s = new Date(startDate + 'T00:00:00');
    const e = new Date(endDate + 'T00:00:00');
    const months = t('reports:months', { returnObjects: true }) as string[];
    if (s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear()) {
      return `${months[s.getMonth()]} ${s.getFullYear()}`;
    }
    return `${s.getDate()} ${months[s.getMonth()]} - ${e.getDate()} ${months[e.getMonth()]} ${e.getFullYear()}`;
  }, [startDate, endDate, t]);

  const renderItem = useCallback(
    ({ item }: { item: IslemWithRelations }) => {
      // İade (cari_satis_iade): geliri AZALTIR → kırmızı + eksi işaret.
      const isReturn = isIncomeReturnType(item.type);
      const positive = isGelir && !isReturn;
      return (
        <TouchableOpacity style={styles.islemCard} onPress={() => handleEdit(item.id)} activeOpacity={0.7}>
          <View style={styles.islemHeader}>
            <View style={styles.islemLeft}>
              <View style={[styles.islemIconContainer, { backgroundColor: positive ? colors.successLight : colors.errorLight }]}>
                {positive ? (
                  <TrendingUp size={16} color={colors.success} />
                ) : (
                  <TrendingDown size={16} color={colors.error} />
                )}
              </View>
              <View style={styles.islemInfo}>
                <Text variant="body" numberOfLines={1} style={styles.islemTitle}>
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
            </View>
            <View style={styles.islemRight}>
              <Text
                variant="label"
                color={positive ? 'success' : 'error'}
                style={styles.islemAmount}
                numberOfLines={1}
              >
                {isReturn ? '−' : ''}{formatCurrency(Number(item.amount), item.hesap?.currency || hesapCurrency)}
              </Text>
              <ChevronRight size={16} color={colors.textMuted} />
            </View>
          </View>
        </TouchableOpacity>
      );
    },
    [handleEdit, isGelir, t, formatDateMedium, hesapCurrency]
  );

  // Özet Card + "İŞLEMLER" başlığı — listeyle birlikte kayar (standart FlatList deseni).
  const renderHeader = () => (
    <>
      <Card style={styles.summaryCard}>
        <View style={styles.summaryHeader}>
          <View style={[styles.sourceIconContainer, { backgroundColor: sourceMeta.color + '20' }]}>
            <SourceIcon size={28} color={sourceMeta.color} />
          </View>
          <View style={styles.summaryInfo}>
            <Text variant="h3" numberOfLines={1}>{hesapName}</Text>
            {!!periodLabel && (
              <Text variant="caption" color="secondary">{periodLabel}</Text>
            )}
          </View>
        </View>

        <View style={styles.summaryDivider} />

        <View style={styles.summaryStats}>
          {/* Kolon 1: renkli NATIVE toplam (+ farklı para biriminde ana karşılığı) */}
          <View style={styles.statItem}>
            <Text variant="caption" color="secondary">{t('reports:summary.totalAmount')}</Text>
            <Text variant="h2" color={isGelir ? 'success' : 'error'}>
              {formatCurrency(total, hesapCurrency)}
            </Text>
            {baseTotal !== null && (
              <Text variant="caption" color="secondary">
                ≈ {formatCurrency(baseTotal, baseCurrency)}
              </Text>
            )}
          </View>
          {/* Kolon 2: nötr işlem sayısı */}
          <View style={styles.statItem}>
            <Text variant="caption" color="secondary">{t('reports:summary.transactionCount')}</Text>
            <Text variant="h2">{(islemler || []).length}</Text>
          </View>
        </View>
      </Card>

      <Text variant="label" color="secondary" style={styles.sectionTitle}>
        {t('reports:sections.transactions')}
      </Text>
    </>
  );

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen options={{ title: hesapName, headerBackVisible: true, gestureEnabled: true }} />

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
          ListHeaderComponent={renderHeader}
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

  // Özet Card
  summaryCard: { padding: spacing.lg, marginBottom: spacing.lg },
  summaryHeader: { flexDirection: 'row', alignItems: 'center' },
  sourceIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  summaryInfo: { flex: 1 },
  summaryDivider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.lg },
  summaryStats: { flexDirection: 'row', justifyContent: 'space-around' },
  statItem: { alignItems: 'center', gap: spacing.xs },

  // Bölüm başlığı
  sectionTitle: { marginBottom: spacing.sm, marginLeft: spacing.xs },

  // Liste
  listContent: { padding: spacing.lg, paddingBottom: spacing['3xl'] },

  // İşlem kartı (standart islemCard)
  islemCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  islemHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  islemLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  islemIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  islemInfo: { flex: 1 },
  islemTitle: { fontWeight: '500', marginBottom: 2 },
  islemRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  islemAmount: { fontWeight: '600' },

  stateBox: { padding: spacing.xl, alignItems: 'center', gap: spacing.sm },
  stateText: { textAlign: 'center' },
});
