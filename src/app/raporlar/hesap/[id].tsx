import { useState, useCallback, useEffect, useMemo } from 'react';
import { useContentBottomPadding } from '@/hooks/useContentBottomPadding';
import { Alert, View, StyleSheet, FlatList, TouchableOpacity, RefreshControl } from 'react-native';
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
import { Text, Button, Card, Screen } from '@/components/ui';
import { QuickTransactionBar } from '@/components/transaction/QuickTransactionBar';
import { ProductDetailModal } from '@/components/transaction/ProductDetailModal';
import { SkeletonListItem } from '@/components/ui/Skeleton';
import {
  IncomeExpenseLensPicker,
  INCOME_EXPENSE_LENS_STICKY_SPACE,
} from '@/components/reports/IncomeExpenseLensPicker';
import { colors } from '@/constants/colors';
import { spacing, borderRadius, fontSize } from '@/constants/spacing';
import { formatCurrency, signedCurrencyText } from '@/lib/currency';
import { getDateRange } from '@/lib/date';
import { useDateFormat } from '@/hooks/useDateFormat';
import {
  isIncomeSourceKind,
  useIncomeSourceTransactions,
} from '@/hooks/useAccountReport';
import { useSettings } from '@/hooks/useSettings';
import { useExchangeRates, convertCurrency } from '@/hooks/useExchangeRates';
import { IslemWithRelations, KategoriType } from '@/types/database';
import { isIncomeReturnType } from '@/constants/islemTypes';
import { usePermissions } from '@/hooks/usePermissions';
import { useAuthContext } from '@/contexts/AuthContext';
import { getTransactionActionDeniedMessageKey } from '@/lib/errors';
import { canAccessTransactionSources } from '@/lib/transactionSourceModules';
import { useUrunKalemlerByIslemIds } from '@/hooks/useUrunHareketler';
import { getTransactionProductMutationDecision } from '@/lib/transactionProductMutationGate';
import { getQuickTransactionScopeForApiType } from '@/lib/quickTransactionCreateScope';
import { useHistoricalReportLens } from '@/hooks/useHistoricalReportLens';
import {
  formatReportLensValue,
  isIncomeExpenseLens,
  reportLensCurrency,
  type IncomeExpenseLens,
} from '@/lib/reportLens';

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

function formatIndicatorNumber(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

/**
 * Hesap raporu drill-down: bir kaynağın (banka/nakit hesabı, cari veya personel)
 * dönem içi GELİR işlemleri. Gelir-Gider raporunda (Gelir görünümü) kaynak kartına
 * tıklanınca açılır.
 */
export default function HesapRaporDetayPage() {
  const contentPaddingBottom = useContentBottomPadding();
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
    lens?: string;
  }>();
  const sourceId = params.id;
  const hesapName = params.hesapName || '—';
  const hesapCurrency = params.hesapCurrency || 'TRY';
  const rawKind = Array.isArray(params.kind) ? params.kind[0] : params.kind;
  // Eski dahili linklerde kind olmayabilir; yalnız o durumda hesap varsayımı
  // korunur. Bilinmeyen açık bir değer hiçbir kaynak sorgusuna düşmez.
  const kind =
    rawKind === undefined
      ? 'hesap'
      : isIncomeSourceKind(rawKind)
        ? rawKind
        : null;
  const type = (params.type as KategoriType) || 'gelir';
  const defaultDateRange = useMemo(() => getDateRange('monthly', 0), []);
  const startDate = params.startDate || defaultDateRange.startDate;
  const endDate = params.endDate || defaultDateRange.endDate;
  const isGelir = type !== 'gider';

  const { currency: baseCurrency } = useSettings();
  const { data: ratesData } = useExchangeRates();
  const rates = ratesData?.rates;
  const [selectedLens, setSelectedLens] = useState<IncomeExpenseLens>(() =>
    baseCurrency === 'TRY' && isIncomeExpenseLens(params.lens)
      ? params.lens
      : 'nominal',
  );

  useEffect(() => {
    if (baseCurrency !== 'TRY' && selectedLens !== 'nominal') {
      setSelectedLens('nominal');
    }
  }, [baseCurrency, selectedLens]);

  const {
    convert: convertHistoricalAmount,
    isLoading: historicalLensLoading,
    error: historicalLensError,
  } = useHistoricalReportLens(selectedLens, startDate, endDate);

  const { data: islemler, isLoading, isFetching, error, refetch } = useIncomeSourceTransactions(
    kind,
    sourceId,
    { startDate, endDate }
  );
  const { user, isletme } = useAuthContext();
  const {
    canAccessModule,
    canUpdate,
    isOwner,
  } = usePermissions();
  const reportTransactionIds = useMemo(
    () => (islemler || []).map((transaction) => transaction.id),
    [islemler],
  );
  const {
    getProductItemCount,
    isProductItemsResolved,
  } = useUrunKalemlerByIslemIds(reportTransactionIds, true);

  const [editTransactionId, setEditTransactionId] = useState<string | null>(null);
  const [showEditBar, setShowEditBar] = useState(false);
  const [pendingTransactionOpenId, setPendingTransactionOpenId] = useState<string | null>(null);
  const [productDetailIslemId, setProductDetailIslemId] = useState<string | null>(null);
  const canUpdateTransaction = useCallback(
    (transaction: IslemWithRelations): boolean => {
      if (transaction.isletme_id !== isletme?.id) return false;
      const createdBy = transaction.created_by ?? null;
      return getTransactionProductMutationDecision({
        type: transaction.type,
        productItemsResolved: isProductItemsResolved,
        productItemCount: getProductItemCount(transaction.id),
        isOwner,
        canAccessModule,
        canMutateTransaction: canUpdate('islemler', createdBy),
        canMutateProduct: canUpdate('urunler', createdBy),
      }).allowed;
    },
    [
      canAccessModule,
      canUpdate,
      getProductItemCount,
      isOwner,
      isProductItemsResolved,
      isletme?.id,
    ],
  );
  const openResolvedTransaction = useCallback((transaction: IslemWithRelations) => {
    if (getProductItemCount(transaction.id) > 0) {
      setProductDetailIslemId(transaction.id);
      return;
    }
    const createdBy = transaction.created_by ?? null;
    const hasSourceAccess = canAccessTransactionSources(
      [transaction.type],
      canAccessModule,
    );
    const canUpdateRecord = canUpdateTransaction(transaction);
    if (!canUpdateRecord) {
      const messageKey = getTransactionActionDeniedMessageKey('update', {
        createdBy,
        currentUserId: user?.id,
        canActOnOwnRecord:
          transaction.isletme_id === isletme?.id
          && hasSourceAccess
          && !!user?.id
          && canUpdate('islemler', user.id),
        canActOnRecord: canUpdateRecord,
      });
      Alert.alert(
        t('common:status.error'),
        t(messageKey),
      );
      return;
    }
    setEditTransactionId(transaction.id);
    setShowEditBar(true);
  }, [
    canAccessModule,
    canUpdate,
    canUpdateTransaction,
    getProductItemCount,
    isletme?.id,
    t,
    user?.id,
  ]);
  const handleEdit = useCallback((transaction: IslemWithRelations) => {
    if (!isProductItemsResolved) {
      setPendingTransactionOpenId(transaction.id);
      return;
    }
    openResolvedTransaction(transaction);
  }, [isProductItemsResolved, openResolvedTransaction]);

  useEffect(() => {
    if (!pendingTransactionOpenId || !isProductItemsResolved) return;

    const transaction = (islemler || []).find(
      (item) => item.id === pendingTransactionOpenId,
    );
    setPendingTransactionOpenId(null);
    if (transaction) openResolvedTransaction(transaction);
  }, [
    isProductItemsResolved,
    islemler,
    openResolvedTransaction,
    pendingTransactionOpenId,
  ]);
  const handleEditDismiss = useCallback(() => {
    setShowEditBar(false);
    setEditTransactionId(null);
  }, []);
  const editTransaction = editTransactionId
    ? (islemler || []).find((item) => item.id === editTransactionId)
    : undefined;
  const canRenderEditTransactionBar =
    !!editTransaction && canUpdateTransaction(editTransaction);
  const productDetailTransaction = productDetailIslemId
    ? (islemler || []).find((item) => item.id === productDetailIslemId)
    : undefined;
  const canEditProductDetailTransaction =
    !!productDetailTransaction
    && canUpdateTransaction(productDetailTransaction);

  useEffect(() => {
    if (!showEditBar || canRenderEditTransactionBar) return;
    handleEditDismiss();
  }, [
    canRenderEditTransactionBar,
    handleEditDismiss,
    showEditBar,
  ]);

  // Toplam hesabın KENDİ para biriminde; iadeler (cari_satis_iade) DÜŞÜLÜR → net.
  const total = useMemo(
    () =>
      (islemler || []).reduce(
        (sum, i) => sum + Number(i.amount || 0) * (isIncomeReturnType(i.type) ? -1 : 1),
        0
      ),
    [islemler]
  );
  const historicalSummary = useMemo(() => {
    if (selectedLens === 'nominal') {
      return { total, missingRateCount: 0 };
    }

    let historicalTotal = 0;
    let missingRateCount = 0;
    (islemler || []).forEach((transaction) => {
      const converted = convertHistoricalAmount?.(
        Number(transaction.amount || 0),
        {
          ...transaction,
          // Kaynak detayinda butun satirlar secilen hesap/cari/personelin kendi
          // para birimindedir; aggregate RPC de ayni source_currency'yi kullanir.
          _reportAmountCurrency: hesapCurrency,
        },
      );
      if (!converted?.complete || converted.value === null) {
        missingRateCount += 1;
        return;
      }
      historicalTotal += converted.value
        * (isIncomeReturnType(transaction.type) ? -1 : 1);
    });
    return { total: historicalTotal, missingRateCount };
  }, [convertHistoricalAmount, hesapCurrency, islemler, selectedLens, total]);
  // Hesap para birimi ana para biriminden farklıysa altında ana para birimi karşılığı.
  const baseTotal = useMemo(
    () => (
      selectedLens === 'nominal' && hesapCurrency !== baseCurrency
        ? convertCurrency(total, hesapCurrency, baseCurrency, rates) ?? null
        : null
    ),
    [baseCurrency, hesapCurrency, rates, selectedLens, total]
  );

  // Kaynak ikonu: hesap alt-tipi params'ta yok → ilk işlemin hesabından türet ('diger' fallback).
  const accountType = (islemler?.[0]?.hesap?.type as string) || 'diger';
  const metaKey = kind === 'hesap' ? accountType : kind ?? 'diger';
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
      const historicalConversion = selectedLens === 'nominal'
        ? null
        : convertHistoricalAmount?.(
            Number(item.amount || 0),
            { ...item, _reportAmountCurrency: hesapCurrency },
          ) ?? null;
      const amountText = selectedLens === 'nominal'
        ? formatCurrency(Number(item.amount), item.hesap?.currency || hesapCurrency)
        : historicalConversion?.complete && historicalConversion.value !== null
          ? formatReportLensValue(Math.abs(historicalConversion.value), selectedLens)
          : t('reports:incomeExpenseLens.missingReference');
      const historicalReferenceText = selectedLens === 'reel'
        && historicalConversion?.transactionCpi
        ? t('reports:incomeExpenseLens.cpiRateCompact', {
            value: formatIndicatorNumber(historicalConversion.transactionCpi),
          })
        : selectedLens !== 'nominal'
          && historicalConversion?.lensRate
          ? t('reports:incomeExpenseLens.dailyRateCompact', {
              currency: reportLensCurrency(selectedLens),
              rate: formatIndicatorNumber(historicalConversion.lensRate),
            })
          : null;
      return (
        <TouchableOpacity style={styles.islemCard} onPress={() => handleEdit(item)} activeOpacity={0.7}>
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
              <View style={styles.islemValueColumn}>
                <Text
                  variant="label"
                  color={positive ? 'success' : 'error'}
                  style={styles.islemAmount}
                  numberOfLines={1}
                >
                  {isReturn ? '−' : ''}{amountText}
                </Text>
                {historicalReferenceText ? (
                  <Text
                    variant="caption"
                    color="secondary"
                    style={styles.historicalReference}
                    numberOfLines={1}
                  >
                    {historicalReferenceText}
                  </Text>
                ) : null}
              </View>
              <ChevronRight size={16} color={colors.textMuted} />
            </View>
          </View>
        </TouchableOpacity>
      );
    },
    [
      convertHistoricalAmount,
      formatDateMedium,
      handleEdit,
      hesapCurrency,
      isGelir,
      selectedLens,
      t,
    ]
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
            {/* Toplam iade netlendiği için NEGATİF olabilir (iade > satış). Renk yalnız
                tipe bağlıyken böyle bir kaynak hem artı hem YEŞİL görünüyordu; negatifte
                işaret de renk de tersine döner. */}
            <Text
              variant="h2"
              color={historicalSummary.total < 0
                ? (isGelir ? 'error' : 'success')
                : (isGelir ? 'success' : 'error')}
            >
              {selectedLens === 'nominal'
                ? signedCurrencyText(total, hesapCurrency)
                : formatReportLensValue(historicalSummary.total, selectedLens)}
            </Text>
            {baseTotal !== null && (
              <Text variant="caption" color="secondary">
                ≈ {signedCurrencyText(baseTotal, baseCurrency)}
              </Text>
            )}
          </View>
          {/* Kolon 2: nötr işlem sayısı */}
          <View style={styles.statItem}>
            <Text variant="caption" color="secondary">{t('reports:summary.transactionCount')}</Text>
            <Text variant="h2">{(islemler || []).length}</Text>
          </View>
        </View>
        {selectedLens !== 'nominal' && historicalSummary.missingRateCount > 0 ? (
          <Text variant="caption" color="error" style={styles.conversionWarningText}>
            {t('reports:incomeExpenseLens.incomplete', {
              count: historicalSummary.missingRateCount,
            })}
          </Text>
        ) : null}
      </Card>

      <Text variant="label" color="secondary" style={styles.sectionTitle}>
        {t('reports:sections.transactions')}
      </Text>
    </>
  );

  return (
    <Screen>
      <Stack.Screen options={{ title: hesapName, headerBackVisible: true, gestureEnabled: true }} />

      {isLoading || historicalLensLoading ? (
        <View style={styles.stateBox}>
          <SkeletonListItem />
          <SkeletonListItem />
          <SkeletonListItem />
        </View>
      ) : error || historicalLensError ? (
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
          contentContainerStyle={[
            styles.listContent,
            baseCurrency === 'TRY' && styles.listContentWithLens,
            { paddingBottom: contentPaddingBottom },
          ]}
          refreshControl={
            <RefreshControl refreshing={isFetching && !isLoading} onRefresh={refetch} colors={[colors.primary]} tintColor={colors.primary} />
          }
          ListEmptyComponent={
            <View style={styles.stateBox}>
              <Text color="secondary" style={styles.stateText}>{t('reports:empty.noIncomeTransactions')}</Text>
            </View>
          }
        />
      )}

      <IncomeExpenseLensPicker
        value={selectedLens}
        onChange={setSelectedLens}
        visible={baseCurrency === 'TRY'}
      />

      {/* Düzenleme için QuickTransactionBar */}
      {canRenderEditTransactionBar && (
        <QuickTransactionBar
          visible={showEditBar && canRenderEditTransactionBar}
          onDismiss={handleEditDismiss}
          mode="edit"
          transactionId={editTransactionId ?? undefined}
          isScheduledTransaction={false}
          defaultHesapId={editTransaction?.hesap_id ?? undefined}
          defaultCariId={editTransaction?.cari_id ?? undefined}
          defaultCariType={editTransaction?.cari?.type}
          defaultPersonelId={editTransaction?.personel_id ?? undefined}
          createScope={
            editTransaction
              ? getQuickTransactionScopeForApiType(editTransaction.type)
                ?? undefined
              : undefined
          }
          onSuccess={handleEditDismiss}
        />
      )}
      <ProductDetailModal
        islemId={productDetailIslemId}
        currency={hesapCurrency}
        onDismiss={() => setProductDetailIslemId(null)}
        onEdit={canEditProductDetailTransaction ? (islemId) => {
          setProductDetailIslemId(null);
          setEditTransactionId(islemId);
          setShowEditBar(true);
        } : undefined}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({

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
  conversionWarningText: { marginTop: spacing.sm, textAlign: 'center' },

  // Bölüm başlığı
  sectionTitle: { marginBottom: spacing.sm, marginLeft: spacing.xs },

  // Liste
  listContent: { padding: spacing.lg, paddingBottom: spacing['3xl'] },
  listContentWithLens: { paddingTop: spacing.lg + INCOME_EXPENSE_LENS_STICKY_SPACE },

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
  islemRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, maxWidth: '52%' },
  islemValueColumn: { alignItems: 'flex-end', flexShrink: 1 },
  islemAmount: { fontWeight: '700', fontSize: fontSize.lg },
  historicalReference: { fontSize: 11, marginTop: 2, textAlign: 'right' },

  stateBox: { padding: spacing.xl, alignItems: 'center', gap: spacing.sm },
  stateText: { textAlign: 'center' },
});
