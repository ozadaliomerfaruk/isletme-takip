import { useState, useMemo } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Modal, Pressable, Platform } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  Wallet,
  Plus,
  History,
  AlertTriangle,
  X,
  ChevronLeft,
  ChevronRight,
  Banknote,
  Building2,
  CreditCard,
  PiggyBank,
  EyeOff,
  Archive,
  Edit3,
  MoreVertical,
  Trash2,
} from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Text, Card, TabFilter, ExpandableCard, Button, EmptyState, NotificationBell, ActionSheet, type ActionSheetOption } from '@/components/ui';
import { QuickTransactionBar } from '@/components/transaction/QuickTransactionBar';
import { CreditCardTransactionBar } from '@/components/transaction/CreditCardTransactionBar';
import { DailyCashModal } from '@/components/transaction/DailyCashModal';
import type { Hesap } from '@/types/database';
import { TransactionType } from '@/components/transaction/TransactionTypeTabs';
import { SummaryCarousel } from '@/components/dashboard';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { formatCurrency, toNumber } from '@/lib/currency';
import { formatDateForDB } from '@/lib/date';
import { getHesapIcon } from '@/lib/icons';
import { useHesaplar, useTotalBalance, useDeleteHesap } from '@/hooks/useHesaplar';
import { useArchiveHesap } from '@/hooks/useArchive';
import { useFinancialSummary } from '@/hooks/useFinancialSummary';
import { useMonthSummary, PeriodType } from '@/hooks/useIslemler';
import { useCashFlowByCategory } from '@/hooks/useCashFlowByCategory';
import { useDateFormat } from '@/hooks/useDateFormat';
import { useSettings } from '@/hooks/useSettings';
import { useAuthContext } from '@/contexts/AuthContext';

export default function HomePage() {
  const router = useRouter();
  const { t } = useTranslation(['navigation', 'common', 'accounts', 'transactions', 'reports', 'settings', 'clients', 'staff']);
  const { getDateRangeLabel, locale, formatDateNative } = useDateFormat();

  const periodOptions = [
    { label: t('reports:period.yearly'), value: 'yearly' },
    { label: t('reports:period.monthly'), value: 'monthly' },
    { label: t('reports:period.weekly'), value: 'weekly' },
    { label: t('reports:period.daily'), value: 'daily' },
    { label: t('reports:period.custom'), value: 'custom' },
  ];
  const [period, setPeriod] = useState<PeriodType>('monthly');
  const [periodOffset, setPeriodOffset] = useState(0);
  const [isCancelling, setIsCancelling] = useState(false);
  const [dailyCashModalVisible, setDailyCashModalVisible] = useState(false);
  const [expandedHesapId, setExpandedHesapId] = useState<string | null>(null);

  // QuickTransactionBar state
  const [quickBarVisible, setQuickBarVisible] = useState(false);
  const [quickBarType, setQuickBarType] = useState<TransactionType>('gelir');
  const [quickBarHesapId, setQuickBarHesapId] = useState<string | undefined>(undefined);

  // CreditCardTransactionBar state
  const [creditCardForTransaction, setCreditCardForTransaction] = useState<Hesap | null>(null);

  // Özel tarih aralığı için state'ler
  const [customStartDate, setCustomStartDate] = useState<Date>(new Date());
  const [customEndDate, setCustomEndDate] = useState<Date>(new Date());
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);

  // ActionSheet için state
  const [actionSheetVisible, setActionSheetVisible] = useState(false);
  const [actionSheetHesap, setActionSheetHesap] = useState<Hesap | null>(null);

  // Mutations
  const archiveHesap = useArchiveHesap();
  const deleteHesap = useDeleteHesap();

  const { isletme, cancelAccountDeletion } = useAuthContext();
  const { currency: baseCurrency } = useSettings();

  // Gerçek veriler - pasif hesapları da dahil et
  const { data: hesaplar, isLoading: hesaplarLoading } = useHesaplar(true);

  // Hesapları tipe göre grupla
  const groupedHesaplar = useMemo(() => {
    if (!hesaplar) return {};

    const groups: Record<string, Hesap[]> = {
      nakit: [],
      banka: [],
      kredi_karti: [],
      diger: [],
    };

    hesaplar.forEach((h) => {
      const type = h.type as string;
      if (groups[type]) {
        groups[type].push(h);
      } else {
        groups.diger.push(h);
      }
    });

    // Önce aktif, sonra pasif - her grup içinde alfabetik sırala
    Object.keys(groups).forEach((key) => {
      groups[key].sort((a, b) => {
        // Aktif olanlar önce
        if (a.is_active !== b.is_active) {
          return a.is_active ? -1 : 1;
        }
        // Aynı durumda olanları alfabetik sırala
        return a.name.localeCompare(b.name, 'tr');
      });
    });

    return groups;
  }, [hesaplar]);

  // Kategori toplamlarını hesapla (sadece aktif ve ana para birimi hesapları)
  const categoryTotals = useMemo(() => {
    const totals: Record<string, number> = {
      nakit: 0,
      banka: 0,
      kredi_karti: 0,
      diger: 0,
    };

    Object.entries(groupedHesaplar).forEach(([key, accounts]) => {
      // Sadece ana para birimi hesaplarını topla - farklı para birimleri karıştırılamaz
      totals[key] = accounts
        .filter(h => h.is_active && ((h.currency || baseCurrency) === baseCurrency))
        .reduce((acc, h) => acc + toNumber(h.balance), 0);
    });

    return totals;
  }, [groupedHesaplar, baseCurrency]);

  // Grup başlık ve ikon tanımları
  const groupConfig: Record<string, { label: string; icon: React.ReactNode }> = {
    nakit: { label: t('accounts:typeLabels.nakit'), icon: <Banknote size={20} color={colors.success} /> },
    banka: { label: t('accounts:typeLabels.banka'), icon: <Building2 size={20} color={colors.primary} /> },
    kredi_karti: { label: t('accounts:typeLabels.kredi_karti'), icon: <CreditCard size={20} color={colors.error} /> },
    birikim: { label: t('accounts:typeLabels.birikim'), icon: <PiggyBank size={20} color={colors.warning} /> },
    diger: { label: t('accounts:typeLabels.diger'), icon: <PiggyBank size={20} color={colors.warning} /> },
  };

  const openQuickBar = (type: TransactionType, hesap: Hesap) => {
    // Kredi kartı için CreditCardTransactionBar kullan
    if (hesap.type === 'kredi_karti') {
      setCreditCardForTransaction(hesap);
    } else {
      setQuickBarType(type);
      setQuickBarHesapId(hesap.id);
      setQuickBarVisible(true);
    }
  };
  const totalBalance = useTotalBalance();
  const { accounts, payables, receivables, generalStatus } = useFinancialSummary();
  const customRange = period === 'custom' ? {
    startDate: formatDateForDB(customStartDate),
    endDate: formatDateForDB(customEndDate),
  } : undefined;
  const { data: monthSummary } = useMonthSummary(period, periodOffset, customRange);

  // Nakit akışı için tarih aralığını hesapla (i18n periodLabel buradan gelir)
  const { startDate: periodStartDate, endDate: periodEndDate, label: periodLabel } = getDateRangeLabel(period, periodOffset, customRange);

  // Nakit akışı hook'u
  const {
    totalInflow,
    totalOutflow,
    netCashFlow,
  } = useCashFlowByCategory({
    startDate: periodStartDate,
    endDate: periodEndDate,
  });

  const totalIncome = monthSummary?.income ?? 0;
  const totalExpense = monthSummary?.expense ?? 0;

  // Silme planlanmış mı kontrol et
  const scheduledDeletion = isletme?.scheduled_deletion_at;
  const deletionDate = scheduledDeletion ? new Date(scheduledDeletion) : null;
  const daysRemaining = deletionDate
    ? Math.ceil((deletionDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : 0;

  const handleCancelDeletion = () => {
    Alert.alert(
      t('settings:account.cancelDeletion'),
      t('common:confirm.areYouSure'),
      [
        { text: t('common:buttons.cancel'), style: 'cancel' },
        {
          text: t('common:buttons.yes'),
          onPress: async () => {
            setIsCancelling(true);
            try {
              await cancelAccountDeletion();
              Alert.alert(t('common:status.success'), t('settings:account.deleteRequestCreatedMessage'));
            } catch (error) {
              Alert.alert(t('common:status.error'), t('common:messages.operationFailed'));
            } finally {
              setIsCancelling(false);
            }
          },
        },
      ]
    );
  };

  // Action sheet handlers for hesaplar
  const handleOpenHesapActionSheet = (hesap: Hesap) => {
    setActionSheetHesap(hesap);
    setActionSheetVisible(true);
  };

  const handleArchiveHesap = async () => {
    if (!actionSheetHesap) return;
    try {
      await archiveHesap.mutateAsync(actionSheetHesap.id);
      Alert.alert(t('common:status.success'), t('common:archive.messages.archiveSuccess'));
    } catch (error) {
      Alert.alert(t('common:status.error'), t('common:messages.operationFailed'));
    }
  };

  const handleDeleteHesap = () => {
    if (!actionSheetHesap) return;
    Alert.alert(
      t('common:confirm.deleteTitle'),
      t('common:confirm.deleteMessage', { item: actionSheetHesap.name }),
      [
        { text: t('common:buttons.cancel'), style: 'cancel' },
        {
          text: t('common:buttons.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteHesap.mutateAsync(actionSheetHesap.id);
              Alert.alert(t('common:status.success'), t('common:messages.deletedSuccessfully'));
            } catch (error) {
              Alert.alert(t('common:status.error'), t('common:messages.operationFailed'));
            }
          },
        },
      ]
    );
  };

  const hesapActionSheetOptions: ActionSheetOption[] = [
    {
      label: t('common:buttons.edit'),
      icon: <Edit3 size={20} color={colors.primary} />,
      onPress: () => {
        if (actionSheetHesap) {
          router.push(`/hesaplar/duzenle/${actionSheetHesap.id}`);
        }
      },
    },
    {
      label: t('common:archive.actions.archive'),
      icon: <Archive size={20} color={colors.warning} />,
      onPress: handleArchiveHesap,
    },
    {
      label: t('common:buttons.delete'),
      icon: <Trash2 size={20} color={colors.error} />,
      onPress: handleDeleteHesap,
      destructive: true,
    },
  ];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <Text variant="h2">{t('navigation:tabs.home')}</Text>
          <NotificationBell />
        </View>

        {/* Hesap Silme Uyarısı */}
        {scheduledDeletion && daysRemaining > 0 && (
          <View style={styles.deletionWarning}>
            <View style={styles.deletionWarningContent}>
              <AlertTriangle size={20} color={colors.surface} />
              <View style={styles.deletionWarningText}>
                <Text variant="body" style={{ color: colors.surface, fontWeight: '600' }}>
                  {t('transactions:future.daysRemaining', { days: daysRemaining })}
                </Text>
                <Text variant="caption" style={{ color: colors.surface, opacity: 0.9 }}>
                  {t('settings:account.cancelDeletion')}
                </Text>
              </View>
            </View>
            <Button
              variant="secondary"
              size="sm"
              onPress={handleCancelDeletion}
              loading={isCancelling}
              style={styles.cancelDeletionBtn}
            >
              {t('common:buttons.cancel')}
            </Button>
          </View>
        )}

        {/* Dönem Seçici */}
        <View style={styles.periodFilter}>
          <TabFilter
            options={periodOptions}
            value={period}
            onChange={(v) => {
              setPeriod(v as PeriodType);
              setPeriodOffset(0); // Dönem değiştiğinde offset'i sıfırla
            }}
          />
          {/* Dönem Navigasyonu - Özel hariç diğer dönemler için */}
          {period !== 'custom' ? (
            <View style={styles.periodNavigator}>
              <TouchableOpacity
                style={styles.periodNavButton}
                onPress={() => setPeriodOffset(periodOffset - 1)}
              >
                <ChevronLeft size={20} color={colors.text} />
              </TouchableOpacity>
              <Text variant="body" style={styles.periodLabel}>
                {periodLabel}
              </Text>
              <TouchableOpacity
                style={styles.periodNavButton}
                onPress={() => setPeriodOffset(periodOffset + 1)}
              >
                <ChevronRight size={20} color={colors.text} />
              </TouchableOpacity>
            </View>
          ) : (
            /* Özel tarih aralığı seçici */
            <View style={styles.customDateContainer}>
              <TouchableOpacity
                style={styles.datePickerButton}
                onPress={() => setShowStartPicker(true)}
              >
                <Text variant="caption" color="secondary">{t('reports:period.startDate')}</Text>
                <Text variant="body">{formatDateNative(customStartDate)}</Text>
              </TouchableOpacity>
              <Text variant="body" color="secondary">-</Text>
              <TouchableOpacity
                style={styles.datePickerButton}
                onPress={() => setShowEndPicker(true)}
              >
                <Text variant="caption" color="secondary">{t('reports:period.endDate')}</Text>
                <Text variant="body">{formatDateNative(customEndDate)}</Text>
              </TouchableOpacity>
            </View>
          )}
          {/* iOS için DateTimePicker Modal */}
          {Platform.OS === 'ios' && (showStartPicker || showEndPicker) && (
            <Modal
              visible={showStartPicker || showEndPicker}
              transparent
              animationType="slide"
            >
              <Pressable
                style={styles.datePickerModalOverlay}
                onPress={() => {
                  setShowStartPicker(false);
                  setShowEndPicker(false);
                }}
              >
                <Pressable style={styles.datePickerModalContent} onPress={(e) => e.stopPropagation()}>
                  <View style={styles.datePickerModalHeader}>
                    <Text variant="h3">
                      {showStartPicker ? t('reports:period.startDateTitle') : t('reports:period.endDateTitle')}
                    </Text>
                    <TouchableOpacity
                      onPress={() => {
                        setShowStartPicker(false);
                        setShowEndPicker(false);
                      }}
                    >
                      <X size={24} color={colors.text} />
                    </TouchableOpacity>
                  </View>
                  <View style={styles.datePickerWrapper}>
                    <DateTimePicker
                      value={showStartPicker ? customStartDate : customEndDate}
                      mode="date"
                      display="inline"
                      onChange={(event, date) => {
                        if (date) {
                          if (showStartPicker) {
                            setCustomStartDate(date);
                            if (date > customEndDate) {
                              setCustomEndDate(date);
                            }
                          } else {
                            setCustomEndDate(date);
                          }
                        }
                      }}
                      minimumDate={showEndPicker ? customStartDate : undefined}
                      maximumDate={new Date()}
                      locale={locale}
                      themeVariant="light"
                      accentColor={colors.primary}
                      style={{ height: 350 }}
                    />
                  </View>
                  <Button
                    variant="primary"
                    onPress={() => {
                      setShowStartPicker(false);
                      setShowEndPicker(false);
                    }}
                    style={{ marginTop: spacing.md }}
                  >
                    {t('common:buttons.ok')}
                  </Button>
                </Pressable>
              </Pressable>
            </Modal>
          )}
          {/* Android için DateTimePicker */}
          {Platform.OS === 'android' && showStartPicker && (
            <DateTimePicker
              value={customStartDate}
              mode="date"
              display="default"
              onChange={(event, date) => {
                setShowStartPicker(false);
                if (event.type === 'set' && date) {
                  setCustomStartDate(date);
                  if (date > customEndDate) {
                    setCustomEndDate(date);
                  }
                }
              }}
              maximumDate={new Date()}
            />
          )}
          {Platform.OS === 'android' && showEndPicker && (
            <DateTimePicker
              value={customEndDate}
              mode="date"
              display="default"
              onChange={(event, date) => {
                setShowEndPicker(false);
                if (event.type === 'set' && date) {
                  setCustomEndDate(date);
                }
              }}
              minimumDate={customStartDate}
              maximumDate={new Date()}
            />
          )}
        </View>

        {/* Özet Carousel */}
        <SummaryCarousel
          assets={accounts}
          receivables={receivables.total}
          payables={payables.total}
          generalStatus={generalStatus}
          income={totalIncome}
          expense={totalExpense}
          periodLabel={periodLabel}
          totalInflow={totalInflow}
          totalOutflow={totalOutflow}
          netCashFlow={netCashFlow}
          startDate={periodStartDate}
          endDate={periodEndDate}
        />

        {/* Hesaplar Bölümü */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text variant="h3">{t('accounts:titles.accounts')}</Text>
            <TouchableOpacity
              style={styles.addButton}
              onPress={() => router.push('/hesaplar/ekle')}
            >
              <Plus size={20} color={colors.primary} />
              <Text variant="label" style={{ color: colors.primary }}>
                {t('common:buttons.add')}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Günlük Ciro Gir Butonu */}
          <Button
            variant="primary"
            size="lg"
            icon={<Plus size={20} color={colors.surface} />}
            onPress={() => setDailyCashModalVisible(true)}
            style={styles.dailyCashButton}
          >
            {t('transactions:dailyCash.enterButton')}
          </Button>

          {/* Hesap Listesi - Gruplandırılmış */}
          {hesaplarLoading ? (
            <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: spacing.xl }} />
          ) : !hesaplar || hesaplar.length === 0 ? (
            <EmptyState
              icon={<Wallet size={48} color={colors.textMuted} />}
              title={t('accounts:messages.noAccounts')}
              description={t('accounts:messages.addFirstAccount')}
              actionLabel={t('accounts:titles.addAccount')}
              onAction={() => router.push('/hesaplar/ekle')}
            />
          ) : (
            ['nakit', 'banka', 'kredi_karti', 'birikim', 'diger'].map((groupKey) => {
              const groupHesaplar = groupedHesaplar[groupKey] || [];
              if (groupHesaplar.length === 0) return null;

              const config = groupConfig[groupKey];

              return (
                <View key={groupKey} style={styles.hesapGroup}>
                  {/* Grup Başlığı */}
                  <View style={styles.groupHeader}>
                    {config.icon}
                    <Text variant="label" color="secondary" style={styles.groupLabel}>
                      {config.label}
                    </Text>
                    <View style={{ flex: 1 }} />
                    <Text
                      variant="label"
                      color={categoryTotals[groupKey] >= 0 ? 'primary' : 'error'}
                      style={styles.groupTotal}
                    >
                      {formatCurrency(categoryTotals[groupKey])}
                    </Text>
                  </View>

                  {/* Grup İçindeki Hesaplar */}
                  {groupHesaplar.map((hesap) => (
                    <View key={hesap.id} style={!hesap.is_active && styles.passiveItem}>
                      <ExpandableCard
                        expanded={expandedHesapId === hesap.id}
                        onToggle={() => setExpandedHesapId(expandedHesapId === hesap.id ? null : hesap.id)}
                        header={
                          <View style={styles.hesapHeader}>
                            {getHesapIcon(hesap.type, 24)}
                            <View style={styles.hesapInfo}>
                              <View style={styles.hesapNameRow}>
                                <Text variant="body">{hesap.name}</Text>
                                {!hesap.is_active && (
                                  <EyeOff size={14} color={colors.textMuted} />
                                )}
                              </View>
                              <Text
                                variant="h3"
                                color={toNumber(hesap.balance) >= 0 ? 'primary' : 'error'}
                              >
                                {formatCurrency(toNumber(hesap.balance), hesap.currency)}
                              </Text>
                            </View>
                            <TouchableOpacity
                              style={styles.moreButton}
                              onPress={(e) => {
                                e.stopPropagation();
                                handleOpenHesapActionSheet(hesap);
                              }}
                              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                            >
                              <MoreVertical size={20} color={colors.textMuted} />
                            </TouchableOpacity>
                          </View>
                        }
                      >
                      <View style={styles.hesapActions}>
                        <Button
                          variant="primary"
                          size="sm"
                          icon={<Plus size={16} color={colors.surface} />}
                          onPress={() => openQuickBar('gelir', hesap)}
                          style={styles.actionButton}
                        >
                          {t('clients:details.newTransaction')}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          icon={<History size={16} color={colors.text} />}
                          onPress={() => router.push(`/hesaplar/${hesap.id}`)}
                          style={styles.actionButton}
                        >
                          {t('accounts:details.transactions')}
                        </Button>
                      </View>
                      </ExpandableCard>
                    </View>
                  ))}
                </View>
              );
            })
          )}
        </View>
      </ScrollView>

      {/* DailyCashModal */}
      <DailyCashModal
        visible={dailyCashModalVisible}
        onDismiss={() => setDailyCashModalVisible(false)}
      />

      {/* QuickTransactionBar */}
      <QuickTransactionBar
        visible={quickBarVisible}
        onDismiss={() => setQuickBarVisible(false)}
        defaultType={quickBarType}
        defaultHesapId={quickBarHesapId}
      />

      {/* CreditCardTransactionBar */}
      {creditCardForTransaction && (
        <CreditCardTransactionBar
          visible={!!creditCardForTransaction}
          onDismiss={() => setCreditCardForTransaction(null)}
          creditCard={creditCardForTransaction}
        />
      )}

      {/* Action Sheet */}
      <ActionSheet
        visible={actionSheetVisible}
        onClose={() => {
          setActionSheetVisible(false);
          setActionSheetHesap(null);
        }}
        title={actionSheetHesap?.name}
        options={hesapActionSheetOptions}
        cancelLabel={t('common:buttons.cancel')}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollView: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  deletionWarning: {
    backgroundColor: colors.error,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    gap: spacing.md,
  },
  deletionWarningContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  deletionWarningText: {
    flex: 1,
  },
  cancelDeletionBtn: {
    alignSelf: 'flex-start',
  },
  periodFilter: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  periodNavigator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
    gap: spacing.md,
  },
  periodNavButton: {
    padding: spacing.xs,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surfaceLight,
  },
  periodLabel: {
    minWidth: 120,
    textAlign: 'center',
  },
  customDateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
    gap: spacing.md,
  },
  datePickerButton: {
    backgroundColor: colors.surfaceLight,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  datePickerModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  datePickerModalContent: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius['2xl'],
    borderTopRightRadius: borderRadius['2xl'],
    padding: spacing.lg,
    paddingBottom: spacing['2xl'],
  },
  datePickerModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  datePickerWrapper: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
  },
  section: {
    paddingHorizontal: spacing.lg,
    marginTop: spacing.xl,
    marginBottom: spacing['3xl'],
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  dailyCashButton: {
    marginBottom: spacing.lg,
  },
  hesapGroup: {
    marginBottom: spacing.lg,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
    paddingVertical: spacing.xs,
  },
  groupLabel: {
    textTransform: 'uppercase',
    fontSize: 12,
    letterSpacing: 0.5,
  },
  groupTotal: {
    fontWeight: '600',
  },
  hesapHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  hesapInfo: {
    flex: 1,
  },
  hesapNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  passiveItem: {
    opacity: 0.5,
  },
  hesapActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionButton: {
    flex: 1,
  },
  moreButton: {
    padding: spacing.xs,
    marginLeft: spacing.sm,
  },
});
