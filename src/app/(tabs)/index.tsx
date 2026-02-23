import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Modal, Pressable, Platform, RefreshControl, Animated } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  Wallet,
  Plus,
  AlertTriangle,
  X,
  Banknote,
  Building2,
  CreditCard,
  PiggyBank,
  EyeOff,
  Archive,
  Edit3,
  Trash2,
  UserCheck,
  Truck,
  Search,
} from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Text, Button, EmptyState, NotificationBell, ActionSheet, type ActionSheetOption, SkeletonAccountList, SwipeableRow, SwipeableProvider } from '@/components/ui';
import { useToast } from '@/contexts/ToastContext';
import { useHaptics } from '@/hooks/useHaptics';
import { QuickTransactionBar } from '@/components/transaction/QuickTransactionBar';
import { CreditCardTransactionBar } from '@/components/transaction/CreditCardTransactionBar';
import { DailyCashModal } from '@/components/transaction/DailyCashModal';
import { CariPickerSheet } from '@/components/transaction/QuickTransactionBar/components';
import type { Hesap, CariType } from '@/types/database';
import { DashboardCarousel, InlinePeriodSelector } from '@/components/dashboard';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { formatCurrency, toNumber } from '@/lib/currency';
import { formatDateForDB } from '@/lib/date';
import { getHesapIcon } from '@/lib/icons';
import { useHesaplar, useTotalBalance, useDeleteHesap } from '@/hooks/useHesaplar';
import { useCariler } from '@/hooks/useCariler';
import { useArchiveHesap } from '@/hooks/useArchive';
import { useFinancialSummary } from '@/hooks/useFinancialSummary';
import { useMonthSummary, PeriodType } from '@/hooks/useIslemler';
import { useCashFlowByCategory } from '@/hooks/useCashFlowByCategory';
import { useDateFormat } from '@/hooks/useDateFormat';
import { useSettings } from '@/hooks/useSettings';
import { useExchangeRates, convertCurrency } from '@/hooks/useExchangeRates';
import { useAuthContext } from '@/contexts/AuthContext';

export default function HomePage() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation(['navigation', 'common', 'accounts', 'transactions', 'reports', 'settings', 'clients', 'staff']);
  const { getDateRangeLabel, locale, formatDateNative } = useDateFormat();

  const [period, setPeriod] = useState<PeriodType>('monthly');
  const [periodOffset, setPeriodOffset] = useState(0);
  const [isCancelling, setIsCancelling] = useState(false);
  const [dailyCashModalVisible, setDailyCashModalVisible] = useState(false);


  // CreditCardTransactionBar state
  const [creditCardForTransaction, setCreditCardForTransaction] = useState<Hesap | null>(null);

  // Özel tarih aralığı için state'ler
  const [customStartDate, setCustomStartDate] = useState<Date>(new Date());
  const [customEndDate, setCustomEndDate] = useState<Date>(new Date());
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);

  // Hızlı dönem seçimi için state'ler
  const [showYearPicker, setShowYearPicker] = useState(false);
  const [showMonthYearPicker, setShowMonthYearPicker] = useState(false);
  const [showDayPicker, setShowDayPicker] = useState(false);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  // ActionSheet için state
  const [actionSheetVisible, setActionSheetVisible] = useState(false);
  const [actionSheetHesap, setActionSheetHesap] = useState<Hesap | null>(null);

  // FAB menü + Cari İşlem state
  const [showFabMenu, setShowFabMenu] = useState(false);
  const [showCariPicker, setShowCariPicker] = useState(false);
  const [cariPickerMode, setCariPickerMode] = useState<'customer' | 'supplier'>('customer');
  const [selectedCariForQuickBar, setSelectedCariForQuickBar] = useState<{ id: string; type: CariType } | null>(null);

  // Mutations
  const archiveHesap = useArchiveHesap();
  const deleteHesap = useDeleteHesap();

  const { isletme, cancelAccountDeletion } = useAuthContext();
  const { currency: baseCurrency } = useSettings();
  const { showToast } = useToast();
  const haptics = useHaptics();

  // Gerçek veriler - pasif hesapları da dahil et
  const { data: hesaplar, isLoading: hesaplarLoading } = useHesaplar(true);

  // Cariler (FAB cari işlem için)
  const { data: musteriCariler } = useCariler('musteri');
  const { data: tedarikciCariler } = useCariler('tedarikci');

  // Döviz kurları (TRY karşılığı göstermek için)
  const { data: exchangeRatesData } = useExchangeRates();
  const exchangeRates = exchangeRatesData?.rates;

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

  const totalBalance = useTotalBalance();
  const { accounts, payables, receivables, generalStatus } = useFinancialSummary();
  const customRange = period === 'custom' ? {
    startDate: formatDateForDB(customStartDate),
    endDate: formatDateForDB(customEndDate),
  } : undefined;
  const { data: monthSummary, refetch: refetchSummary } = useMonthSummary(period, periodOffset, customRange);

  // Nakit akışı için tarih aralığını hesapla (i18n periodLabel buradan gelir)
  const { startDate: periodStartDate, endDate: periodEndDate, label: periodLabel } = getDateRangeLabel(period, periodOffset, customRange);

  // Nakit akışı hook'u
  const {
    totalInflow,
    totalOutflow,
    netCashFlow,
    refetch: refetchCashFlow,
  } = useCashFlowByCategory({
    startDate: periodStartDate,
    endDate: periodEndDate,
  });

  // Pull-to-refresh (manuel state — arka plan refetch'te spinner gösterme)
  const [isRefreshing, setIsRefreshing] = useState(false);
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([refetchSummary(), refetchCashFlow()]);
      haptics.success();
    } finally {
      setIsRefreshing(false);
    }
  }, [refetchSummary, refetchCashFlow, haptics]);

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

  // Hızlı dönem seçimi için fonksiyonlar
  const handlePeriodLabelPress = () => {
    switch (period) {
      case 'yearly':
        setShowYearPicker(true);
        break;
      case 'monthly':
      case 'weekly': {
        // Mevcut tarihten yılı al ve selectedYear'ı ayarla
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth();
        // periodOffset'ten mevcut seçili yılı hesapla
        const targetDate = new Date(currentYear, currentMonth + periodOffset, 1);
        setSelectedYear(targetDate.getFullYear());
        setShowMonthYearPicker(true);
        break;
      }
      case 'daily':
        setShowDayPicker(true);
        break;
    }
  };

  // Yıl seçildiğinde offset hesapla
  const goToYear = (year: number) => {
    const currentYear = new Date().getFullYear();
    setPeriodOffset(year - currentYear);
    setShowYearPicker(false);
  };

  // Ay seçildiğinde offset hesapla
  const goToMonth = (year: number, month: number) => {
    const now = new Date();
    const monthsDiff = (year - now.getFullYear()) * 12 + (month - now.getMonth());
    setPeriodOffset(monthsDiff);
    setShowMonthYearPicker(false);
  };

  // Gün seçildiğinde offset hesapla
  const goToDay = (date: Date) => {
    const now = new Date();
    // Sadece gün farkını hesapla (saat farkını yoksay)
    const nowMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dateMidnight = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const daysDiff = Math.round((dateMidnight.getTime() - nowMidnight.getTime()) / (1000 * 60 * 60 * 24));
    setPeriodOffset(daysDiff);
    setShowDayPicker(false);
  };

  // Haftalık mod için - ayın ilk haftasına git
  const goToWeekOfMonth = (year: number, month: number) => {
    const now = new Date();
    const nowMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    // Seçilen ayın ilk günü
    const firstDayOfMonth = new Date(year, month, 1);
    // Haftalık offset hesapla
    const daysDiff = Math.round((firstDayOfMonth.getTime() - nowMidnight.getTime()) / (1000 * 60 * 60 * 24));
    const weeksDiff = Math.floor(daysDiff / 7);
    setPeriodOffset(weeksDiff);
    setShowMonthYearPicker(false);
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
      haptics.success();
      showToast(t('common:archive.messages.archiveSuccess'), 'success');
    } catch (error) {
      haptics.error();
      showToast(t('common:messages.operationFailed'), 'error');
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
              haptics.success();
              showToast(t('common:messages.deletedSuccessfully'), 'success');
            } catch (error) {
              haptics.error();
              showToast(t('common:messages.operationFailed'), 'error');
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

  // FAB menü animasyonu
  const fabAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(fabAnim, {
      toValue: showFabMenu ? 1 : 0,
      damping: 15,
      stiffness: 200,
      useNativeDriver: true,
    }).start();
  }, [showFabMenu, fabAnim]);

  const closeFabMenu = useCallback(() => setShowFabMenu(false), []);

  const handleFabMenuOption = useCallback((action: () => void) => {
    setShowFabMenu(false);
    // Menü kapanma animasyonu bittikten sonra aksiyonu çalıştır
    setTimeout(action, 250);
  }, []);

  const handleCariSelectForQuickBar = useCallback((cariId: string) => {
    const cariType: CariType = cariPickerMode === 'customer' ? 'musteri' : 'tedarikci';
    setShowCariPicker(false);
    setTimeout(() => {
      setSelectedCariForQuickBar({ id: cariId, type: cariType });
    }, 300);
  }, [cariPickerMode]);

  // Collapsible header animation
  const scrollY = useRef(new Animated.Value(0)).current;
  const headerHeight = scrollY.interpolate({
    inputRange: [0, 60],
    outputRange: [52, 0],
    extrapolate: 'clamp',
  });
  const headerOpacity = scrollY.interpolate({
    inputRange: [0, 40],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Animated.ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: false },
        )}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} colors={[colors.primary]} tintColor={colors.primary} />
        }
      >
        {/* Collapsible Header */}
        <Animated.View style={[styles.header, { height: headerHeight, opacity: headerOpacity }]}>
          <Text variant="h2">{t('navigation:tabs.home')}</Text>
          <View style={styles.headerRight}>
            <TouchableOpacity onPress={() => router.push('/arama')} style={styles.headerIconBtn}>
              <Search size={22} color={colors.text} />
            </TouchableOpacity>
            <NotificationBell />
          </View>
        </Animated.View>

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

        {/* Dashboard Carousel: Genel Durum → Gelir/Gider → Nakit Akışı */}
        <DashboardCarousel
          generalStatus={generalStatus}
          assets={accounts}
          receivables={receivables.total}
          payables={payables.total}
          onHeroPress={() => router.push('/raporlar')}
          income={totalIncome}
          expense={totalExpense}
          totalInflow={totalInflow}
          totalOutflow={totalOutflow}
          netCashFlow={netCashFlow}
          startDate={periodStartDate}
          endDate={periodEndDate}
          periodBadge={periodLabel}
        />

        {/* Inline Period Selector */}
        <InlinePeriodSelector
          period={period}
          periodLabel={periodLabel}
          onPeriodChange={(p) => {
            setPeriod(p);
            setPeriodOffset(0);
          }}
          onPrevious={() => setPeriodOffset(periodOffset - 1)}
          onNext={() => setPeriodOffset(periodOffset + 1)}
          onLabelPress={handlePeriodLabelPress}
          isCustom={period === 'custom'}
          customStartLabel={formatDateNative(customStartDate)}
          customEndLabel={formatDateNative(customEndDate)}
          onStartDatePress={() => setShowStartPicker(true)}
          onEndDatePress={() => setShowEndPicker(true)}
        />

        {/* iOS için DateTimePicker Modal (Özel tarih seçimi için) */}
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
                    if (showStartPicker) {
                      setShowStartPicker(false);
                      setShowEndPicker(true);
                    } else {
                      setShowEndPicker(false);
                    }
                  }}
                  style={{ marginTop: spacing.md }}
                >
                  {showStartPicker ? t('common:buttons.next') : t('common:buttons.ok')}
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
                setShowEndPicker(true);
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

          {/* Hesap Listesi - Gruplandırılmış */}
          {hesaplarLoading ? (
            <SkeletonAccountList count={4} />
          ) : !hesaplar || hesaplar.length === 0 ? (
            <EmptyState
              icon={<Wallet size={48} color={colors.textMuted} />}
              title={t('accounts:messages.noAccounts')}
              description={t('accounts:messages.addFirstAccount')}
              actionLabel={t('accounts:titles.addAccount')}
              onAction={() => router.push('/hesaplar/ekle')}
            />
          ) : (
            <SwipeableProvider>
            {['nakit', 'banka', 'kredi_karti', 'birikim', 'diger'].map((groupKey) => {
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
                    <View key={hesap.id} style={!hesap.is_active ? styles.passiveItem : undefined}>
                      <SwipeableRow
                        onLeftAction={() => router.push(`/hesaplar/${hesap.id}`)}
                        leftActionLabel={t('common:archive.actions.makeTransaction')}
                      >
                      <TouchableOpacity
                        style={styles.entityCard}
                        onPress={() => router.push(`/hesaplar/${hesap.id}`)}
                        onLongPress={() => {
                          haptics.selection();
                          handleOpenHesapActionSheet(hesap);
                        }}
                        activeOpacity={0.7}
                      >
                        <View style={styles.hesapHeader}>
                          {getHesapIcon(hesap.type, 24)}
                          <View style={styles.hesapInfo}>
                            <View style={styles.hesapNameRow}>
                              <Text variant="body">{hesap.name}</Text>
                              {!hesap.is_active && (
                                <EyeOff size={14} color={colors.textMuted} />
                              )}
                            </View>
                          </View>
                          <View style={styles.hesapBalance}>
                            <Text
                              variant="h3"
                              color={toNumber(hesap.balance) >= 0 ? 'primary' : 'error'}
                            >
                              {formatCurrency(toNumber(hesap.balance), hesap.currency)}
                            </Text>
                            {hesap.currency !== baseCurrency && exchangeRates && (
                              <Text variant="caption" color="secondary">
                                ~{formatCurrency(convertCurrency(toNumber(hesap.balance), hesap.currency, baseCurrency, exchangeRates) ?? 0, baseCurrency)}
                              </Text>
                            )}
                          </View>
                        </View>
                      </TouchableOpacity>
                      </SwipeableRow>
                    </View>
                  ))}
                </View>
              );
            })}
            </SwipeableProvider>
          )}
        </View>
      </Animated.ScrollView>

      {/* FAB Menü - Backdrop */}
      {showFabMenu && (
        <Pressable style={StyleSheet.absoluteFill} onPress={closeFabMenu}>
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: 'rgba(0,0,0,0.3)', opacity: fabAnim },
            ]}
          />
        </Pressable>
      )}

      {/* FAB Menü - Seçenekler (yukarı doğru açılır) */}
      {showFabMenu && (
        <View style={[styles.fabMenuContainer, { bottom: spacing.lg + insets.bottom + 56 + spacing.md }]}>
          {[
            {
              label: t('clients:types.tedarikci', { defaultValue: 'Tedarikçi İşlemi' }),
              icon: <Truck size={18} color={colors.warning} />,
              onPress: () => handleFabMenuOption(() => {
                setCariPickerMode('supplier');
                setShowCariPicker(true);
              }),
              index: 2,
            },
            {
              label: t('clients:types.musteri', { defaultValue: 'Müşteri İşlemi' }),
              icon: <UserCheck size={18} color={colors.success} />,
              onPress: () => handleFabMenuOption(() => {
                setCariPickerMode('customer');
                setShowCariPicker(true);
              }),
              index: 1,
            },
            {
              label: t('transactions:dailyCash.enterButton'),
              icon: <Banknote size={18} color={colors.primary} />,
              onPress: () => handleFabMenuOption(() => setDailyCashModalVisible(true)),
              index: 0,
            },
          ].map((item) => (
            <Animated.View
              key={item.label}
              style={{
                opacity: fabAnim,
                transform: [{
                  translateY: fabAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [20 + item.index * 10, 0],
                  }),
                }, {
                  scale: fabAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.8, 1],
                  }),
                }],
              }}
            >
              <TouchableOpacity
                style={styles.fabMenuItem}
                onPress={item.onPress}
                activeOpacity={0.7}
              >
                <View style={styles.fabMenuIcon}>{item.icon}</View>
                <Text style={styles.fabMenuLabel}>{item.label}</Text>
              </TouchableOpacity>
            </Animated.View>
          ))}
        </View>
      )}

      {/* FAB Button */}
      <TouchableOpacity
        style={[styles.fab, { bottom: spacing.lg + insets.bottom }]}
        onPress={() => {
          haptics.light();
          setShowFabMenu((prev) => !prev);
        }}
        activeOpacity={0.8}
      >
        <Animated.View style={{
          transform: [{
            rotate: fabAnim.interpolate({
              inputRange: [0, 1],
              outputRange: ['0deg', '45deg'],
            }),
          }],
        }}>
          <Plus size={24} color={colors.surface} />
        </Animated.View>
      </TouchableOpacity>

      {/* DailyCashModal */}
      <DailyCashModal
        visible={dailyCashModalVisible}
        onDismiss={() => setDailyCashModalVisible(false)}
      />

      {/* CreditCardTransactionBar */}
      {creditCardForTransaction && (
        <CreditCardTransactionBar
          visible={!!creditCardForTransaction}
          onDismiss={() => setCreditCardForTransaction(null)}
          creditCard={creditCardForTransaction}
        />
      )}

      {/* Hesap Action Sheet */}
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

      {/* Cari Picker (FAB'dan açılır) */}
      <CariPickerSheet
        visible={showCariPicker}
        onDismiss={() => setShowCariPicker(false)}
        onSelect={handleCariSelectForQuickBar}
        cariler={cariPickerMode === 'customer' ? (musteriCariler || []) : (tedarikciCariler || [])}
        selectedId={null}
        mode={cariPickerMode}
      />

      {/* Cari QuickTransactionBar (cari seçildikten sonra açılır) */}
      <QuickTransactionBar
        visible={!!selectedCariForQuickBar}
        onDismiss={() => setSelectedCariForQuickBar(null)}
        defaultCariId={selectedCariForQuickBar?.id}
        defaultCariType={selectedCariForQuickBar?.type}
        onSuccess={() => setSelectedCariForQuickBar(null)}
      />

      {/* Yıl Picker Modal */}
      <Modal
        visible={showYearPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowYearPicker(false)}
      >
        <Pressable
          style={styles.pickerModalOverlay}
          onPress={() => setShowYearPicker(false)}
        >
          <Pressable style={styles.pickerModalContent} onPress={(e) => e.stopPropagation()}>
            <View style={styles.pickerModalHeader}>
              <Text variant="h3">{t('reports:period.selectYear')}</Text>
              <TouchableOpacity onPress={() => setShowYearPicker(false)}>
                <X size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
            <View style={styles.yearGrid}>
              {Array.from({ length: 12 }, (_, i) => 2020 + i).map((year) => {
                const isSelected = year === new Date().getFullYear() + periodOffset;
                return (
                  <TouchableOpacity
                    key={year}
                    style={[styles.yearGridCell, isSelected && styles.yearGridCellActive]}
                    onPress={() => goToYear(year)}
                  >
                    <Text
                      variant="body"
                      style={isSelected ? styles.yearGridTextActive : undefined}
                    >
                      {year}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Ay + Yıl Picker Modal */}
      <Modal
        visible={showMonthYearPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowMonthYearPicker(false)}
      >
        <Pressable
          style={styles.pickerModalOverlay}
          onPress={() => setShowMonthYearPicker(false)}
        >
          <Pressable style={styles.pickerModalContent} onPress={(e) => e.stopPropagation()}>
            <View style={styles.pickerModalHeader}>
              <Text variant="h3">{t('reports:period.selectMonthYear')}</Text>
              <TouchableOpacity onPress={() => setShowMonthYearPicker(false)}>
                <X size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            {/* Yıl seçici */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.yearScrollView}
              contentContainerStyle={styles.yearScrollContent}
            >
              {Array.from({ length: 12 }, (_, i) => 2020 + i).map((year) => (
                <TouchableOpacity
                  key={year}
                  style={[
                    styles.yearChip,
                    selectedYear === year && styles.yearChipActive,
                  ]}
                  onPress={() => setSelectedYear(year)}
                >
                  <Text
                    variant="body"
                    style={selectedYear === year ? styles.yearChipTextActive : styles.yearChipText}
                  >
                    {year}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Ay grid */}
            <View style={styles.monthGrid}>
              {((() => { const m = t('common:date.monthsShort', { returnObjects: true }); return Array.isArray(m) ? m : ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']; })() as string[]).map((monthName, index) => (
                <TouchableOpacity
                  key={index}
                  style={styles.monthCell}
                  onPress={() => {
                    if (period === 'weekly') {
                      goToWeekOfMonth(selectedYear, index);
                    } else {
                      goToMonth(selectedYear, index);
                    }
                  }}
                >
                  <Text variant="body">{monthName}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Günlük DatePicker Modal (iOS) */}
      {Platform.OS === 'ios' && showDayPicker && (
        <Modal
          visible={showDayPicker}
          transparent
          animationType="slide"
        >
          <Pressable
            style={styles.datePickerModalOverlay}
            onPress={() => setShowDayPicker(false)}
          >
            <Pressable style={styles.datePickerModalContent} onPress={(e) => e.stopPropagation()}>
              <View style={styles.datePickerModalHeader}>
                <Text variant="h3">{t('reports:period.selectDate')}</Text>
                <TouchableOpacity onPress={() => setShowDayPicker(false)}>
                  <X size={24} color={colors.text} />
                </TouchableOpacity>
              </View>
              <View style={styles.datePickerWrapper}>
                <DateTimePicker
                  value={new Date()}
                  mode="date"
                  display="inline"
                  onChange={(event, date) => {
                    if (date) {
                      goToDay(date);
                    }
                  }}
                  maximumDate={new Date()}
                  locale={locale}
                  themeVariant="light"
                  accentColor={colors.primary}
                  style={{ height: 350 }}
                />
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      )}

      {/* Günlük DatePicker (Android) */}
      {Platform.OS === 'android' && showDayPicker && (
        <DateTimePicker
          value={new Date()}
          mode="date"
          display="default"
          onChange={(event, date) => {
            setShowDayPicker(false);
            if (event.type === 'set' && date) {
              goToDay(date);
            }
          }}
          maximumDate={new Date()}
        />
      )}
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
    overflow: 'hidden',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  headerIconBtn: {
    padding: spacing.xs,
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
  entityCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
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
  hesapBalance: {
    alignItems: 'flex-end',
  },
  passiveItem: {
    opacity: 0.5,
  },
  pickerModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  pickerModalContent: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius['2xl'],
    borderTopRightRadius: borderRadius['2xl'],
    padding: spacing.lg,
    paddingBottom: spacing['2xl'],
  },
  pickerModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  yearScrollView: {
    marginBottom: spacing.lg,
  },
  yearScrollContent: {
    gap: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  yearChip: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  yearChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  yearChipText: {
    color: colors.text,
  },
  yearChipTextActive: {
    color: colors.surface,
    fontWeight: '600',
  },
  yearGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  yearGridCell: {
    width: '23%',
    paddingVertical: spacing.md,
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  yearGridCellActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  yearGridTextActive: {
    color: colors.surface,
    fontWeight: '600',
  },
  monthGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  monthCell: {
    width: '31%',
    paddingVertical: spacing.md,
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  fab: {
    position: 'absolute',
    right: spacing.lg,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 10,
  },
  fabMenuContainer: {
    position: 'absolute',
    right: spacing.lg,
    alignItems: 'flex-end',
    gap: spacing.sm,
    zIndex: 9,
  },
  fabMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.full,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
    gap: spacing.sm,
  },
  fabMenuIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabMenuLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
});
