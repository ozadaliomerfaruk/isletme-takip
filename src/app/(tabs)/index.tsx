import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { View, StyleSheet, TouchableOpacity, Alert, Pressable, Animated, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  Wallet,
  Plus,
  AlertTriangle,
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
  MoreVertical,
  Zap,
  History,
} from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Text, Button, EmptyState, NotificationBell, ActionSheet, type ActionSheetOption, SkeletonAccountList, ExpandableCard, FinishSetupCard } from '@/components/ui';
import { useToast } from '@/contexts/ToastContext';
import { useHaptics } from '@/hooks/useHaptics';
import { QuickTransactionBar } from '@/components/transaction/QuickTransactionBar';
import { CreditCardTransactionBar } from '@/components/transaction/CreditCardTransactionBar';
import { DailyCashModal } from '@/components/transaction/DailyCashModal';
import { CariPickerSheet } from '@/components/transaction/QuickTransactionBar/components';
import type { Hesap, CariType } from '@/types/database';
import { DashboardCarousel, FinancialDetailModal } from '@/components/dashboard';
import { colors } from '@/constants/colors';
import { spacing, borderRadius, fontSize } from '@/constants/spacing';
import { formatCurrency, toNumber } from '@/lib/currency';
import { getHesapIcon } from '@/lib/icons';
import { useHesaplar, useDeleteHesap } from '@/hooks/useHesaplar';
import { useCariler } from '@/hooks/useCariler';
import { useArchiveHesap } from '@/hooks/useArchive';
import { useFinancialSummary } from '@/hooks/useFinancialSummary';
import { useMonthSummary } from '@/hooks/useIslemler';
import { useCashFlowByCategory } from '@/hooks/useCashFlowByCategory';
import { useDateFormat } from '@/hooks/useDateFormat';
import { useSettings } from '@/hooks/useSettings';
import { useExchangeRates, convertCurrency } from '@/hooks/useExchangeRates';
import { useAuthContext } from '@/contexts/AuthContext';
import { useSetupProgress, type SetupStepKey } from '@/hooks/useSetupProgress';
import { SharedIsletmeBanner } from '@/components/ui/SharedIsletmeBanner';
import { PermissionGate } from '@/components/PermissionGate';
import { usePermissions } from '@/hooks/usePermissions';

export default function HomePage() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation(['navigation', 'common', 'accounts', 'transactions', 'reports', 'settings', 'clients', 'staff', 'multiUser']);
  const { getDateRangeLabel } = useDateFormat();

  const [isCancelling, setIsCancelling] = useState(false);
  const [dailyCashModalVisible, setDailyCashModalVisible] = useState(false);
  const [financialModalVisible, setFinancialModalVisible] = useState(false);

  // CreditCardTransactionBar state
  const [creditCardForTransaction, setCreditCardForTransaction] = useState<Hesap | null>(null);

  // Hesap QuickTransactionBar state
  const [hesapQuickBarVisible, setHesapQuickBarVisible] = useState(false);
  const [selectedHesapId, setSelectedHesapId] = useState<string | null>(null);

  // ExpandableCard için state
  const [expandedHesapId, setExpandedHesapId] = useState<string | null>(null);

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

  // Permissions
  const { canUpdate, canDelete, canAccessModule } = usePermissions();

  const { isletme, cancelAccountDeletion } = useAuthContext();
  const { currency: baseCurrency } = useSettings();
  const { showToast } = useToast();
  const haptics = useHaptics();

  // Gerçek veriler - pasif hesapları da dahil et
  const { data: hesaplar, isLoading: hesaplarLoading, refetch: refetchHesaplar } = useHesaplar(true);

  // Cariler (FAB cari işlem için) — TEK sorgu (aktif tüm cariler) çekilip tipe göre
  // bellekte ayrılır. Önceden musteri + tedarikci ayrı çekiliyordu; useFinancialSummary
  // de aktif tüm carileri ayrı bir key'le çekiyordu → 3 cari sorgusu. Bu çağrı
  // useFinancialSummary ile AYNI query-key'i (undefined,false,false) paylaştığından
  // React Query otomatik dedup eder → 3 sorgu 1'e iner. (Sonuç birebir aynı: client
  // tip filtresi = sunucu .eq('type',...) aktif set üzerinde.)
  const { data: tumCariler } = useCariler();
  const musteriCariler = useMemo(
    () => (tumCariler ?? []).filter((c) => c.type === 'musteri'),
    [tumCariler],
  );
  const tedarikciCariler = useMemo(
    () => (tumCariler ?? []).filter((c) => c.type === 'tedarikci'),
    [tumCariler],
  );

  // Kurulumu bitir kartı (yarım-kurulum işletmeler)
  const setup = useSetupProgress();
  const handleSetupStepPress = useCallback((key: SetupStepKey) => {
    switch (key) {
      case 'sector':
        router.push('/kurulum');
        break;
      case 'banka':
        router.push('/hesaplar/ekle');
        break;
      case 'cari':
        router.push('/cariler/ekle');
        break;
      case 'islem':
        router.push('/islemler/gelir');
        break;
    }
  }, [router]);

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
      birikim: [],
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

  // Kategori toplamlarını hesapla (aktif hesaplar, dövizler ana birime çevrilir)
  const categoryTotals = useMemo(() => {
    const totals: Record<string, number> = {
      nakit: 0,
      banka: 0,
      kredi_karti: 0,
      birikim: 0,
      diger: 0,
    };

    Object.entries(groupedHesaplar).forEach(([key, accounts]) => {
      totals[key] = accounts
        .filter(h => h.is_active)
        .reduce((acc, h) => {
          const balance = toNumber(h.balance);
          const cur = h.currency || baseCurrency;
          if (cur === baseCurrency) return acc + balance;
          if (exchangeRates) {
            return acc + (convertCurrency(balance, cur, baseCurrency, exchangeRates) ?? 0);
          }
          return acc + balance;
        }, 0);
    });

    return totals;
  }, [groupedHesaplar, baseCurrency, exchangeRates]);

  // Grup başlık ve ikon tanımları
  const groupConfig: Record<string, { label: string; icon: React.ReactNode }> = {
    nakit: { label: t('accounts:typeLabels.nakit'), icon: <Banknote size={20} color={colors.success} /> },
    banka: { label: t('accounts:typeLabels.banka'), icon: <Building2 size={20} color={colors.primary} /> },
    kredi_karti: { label: t('accounts:typeLabels.kredi_karti'), icon: <CreditCard size={20} color={colors.error} /> },
    birikim: { label: t('accounts:typeLabels.birikim'), icon: <PiggyBank size={20} color={colors.warning} /> },
    diger: { label: t('accounts:typeLabels.diger'), icon: <PiggyBank size={20} color={colors.warning} /> },
  };

  const { accounts, payables, receivables, generalStatus } = useFinancialSummary();

  // Sabit olarak bulunduğumuz ay (monthly, offset=0)
  const { startDate: currentMonthStart, endDate: currentMonthEnd, label: currentMonthLabel } = getDateRangeLabel('monthly', 0);
  const { data: monthSummary, refetch: refetchSummary } = useMonthSummary('monthly', 0);

  // Nakit akışı hook'u
  const {
    totalInflow,
    totalOutflow,
    netCashFlow,
    refetch: refetchCashFlow,
  } = useCashFlowByCategory({
    startDate: currentMonthStart,
    endDate: currentMonthEnd,
  });

  // Pull-to-refresh (manuel state — arka plan refetch'te spinner gösterme)
  const [isRefreshing, setIsRefreshing] = useState(false);
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([refetchHesaplar(), refetchSummary(), refetchCashFlow()]);
      haptics.success();
    } finally {
      setIsRefreshing(false);
    }
  }, [refetchHesaplar, refetchSummary, refetchCashFlow, haptics]);

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

  const handleArchiveHesap = useCallback(async () => {
    if (!actionSheetHesap) return;
    try {
      await archiveHesap.mutateAsync(actionSheetHesap.id);
      haptics.success();
      showToast(t('common:archive.messages.archiveSuccess'), 'success');
    } catch (error) {
      haptics.error();
      showToast(t('common:messages.operationFailed'), 'error');
    }
  }, [actionSheetHesap, archiveHesap, haptics, showToast, t]);

  const handleDeleteHesap = useCallback(() => {
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
  }, [actionSheetHesap, deleteHesap, haptics, showToast, t]);

  const hesapActionSheetOptions: ActionSheetOption[] = useMemo(() => {
    const options: ActionSheetOption[] = [];

    if (actionSheetHesap && canUpdate('hesaplar', actionSheetHesap.created_by ?? null)) {
      options.push({
        label: t('common:buttons.edit'),
        icon: <Edit3 size={20} color={colors.primary} />,
        onPress: () => {
          if (actionSheetHesap) {
            router.push(`/hesaplar/duzenle/${actionSheetHesap.id}`);
          }
        },
      });
      options.push({
        label: t('common:archive.actions.archive'),
        icon: <Archive size={20} color={colors.warning} />,
        onPress: handleArchiveHesap,
      });
    }

    if (actionSheetHesap && canDelete('hesaplar', actionSheetHesap.created_by ?? null)) {
      options.push({
        label: t('common:buttons.delete'),
        icon: <Trash2 size={20} color={colors.error} />,
        onPress: handleDeleteHesap,
        destructive: true,
      });
    }

    return options;
  }, [actionSheetHesap, t, router, canUpdate, canDelete, handleArchiveHesap, handleDeleteHesap]);

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
        <Animated.View style={[styles.header, { height: headerHeight, opacity: headerOpacity }]} pointerEvents="box-none">
          <Text variant="h2">{t('navigation:tabs.home')}</Text>
          <View style={styles.headerRight}>
            <TouchableOpacity onPress={() => router.push('/arama')} style={styles.headerIconBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Search size={22} color={colors.text} />
            </TouchableOpacity>
            <NotificationBell />
          </View>
        </Animated.View>

        {/* Shared İşletme Banner */}
        <SharedIsletmeBanner />

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
          onHeroPress={() => {
            if (!canAccessModule('raporlar')) {
              Alert.alert(t('multiUser:permissions.denied'), t('multiUser:permissions.noModuleAccess'));
              return;
            }
            router.push('/raporlar');
          }}
          income={totalIncome}
          expense={totalExpense}
          onIncomeExpensePress={() => {
            if (!canAccessModule('raporlar')) {
              Alert.alert(t('multiUser:permissions.denied'), t('multiUser:permissions.noModuleAccess'));
              return;
            }
            setFinancialModalVisible(true);
          }}
          totalInflow={totalInflow}
          totalOutflow={totalOutflow}
          netCashFlow={netCashFlow}
          onCashFlowPress={() => {
            if (!canAccessModule('raporlar')) {
              Alert.alert(t('multiUser:permissions.denied'), t('multiUser:permissions.noModuleAccess'));
              return;
            }
            setFinancialModalVisible(true);
          }}
          periodBadge={currentMonthLabel}
        />

        {/* Kurulumu Bitir Kartı */}
        {setup.shouldShow && (
          <FinishSetupCard
            steps={setup.steps}
            completedCount={setup.completedCount}
            totalCount={setup.totalCount}
            onStepPress={handleSetupStepPress}
            onDismiss={setup.dismiss}
          />
        )}

        {/* Hesaplar Bölümü */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text variant="h3" style={styles.sectionTitle}>{t('accounts:titles.accounts')}</Text>
            <PermissionGate module="hesaplar" action="create">
              <TouchableOpacity
                style={styles.addButton}
                onPress={() => router.push('/hesaplar/ekle')}
              >
                <Plus size={20} color={colors.primary} />
                <Text variant="label" style={{ color: colors.primary }}>
                  {t('common:buttons.add')}
                </Text>
              </TouchableOpacity>
            </PermissionGate>
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
            <View>
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
                      color={(categoryTotals[groupKey] || 0) >= 0 ? 'primary' : 'error'}
                      style={styles.groupTotal}
                    >
                      {formatCurrency(categoryTotals[groupKey] || 0)}
                    </Text>
                  </View>

                  {/* Grup İçindeki Hesaplar */}
                  {groupHesaplar.map((hesap) => (
                    <View key={hesap.id} style={!hesap.is_active ? styles.passiveItem : undefined}>
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
                              {hesap.type === 'kredi_karti' && hesap.payment_due_day && (
                                <Text variant="caption" color="muted">
                                  {t('accounts:creditCard.paymentDueDayLabel', { day: hesap.payment_due_day })}
                                </Text>
                              )}
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
                            <TouchableOpacity
                              onPress={(e) => {
                                e.stopPropagation();
                                haptics.selection();
                                handleOpenHesapActionSheet(hesap);
                              }}
                              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                              style={styles.moreButton}
                            >
                              <MoreVertical size={20} color={colors.textMuted} />
                            </TouchableOpacity>
                          </View>
                        }
                      >
                        <View style={styles.actionButtons}>
                          <Button
                            variant="primary"
                            size="sm"
                            icon={<Zap size={16} color={colors.surface} />}
                            onPress={() => {
                              if (hesap.type === 'kredi_karti') {
                                setCreditCardForTransaction(hesap);
                              } else {
                                setSelectedHesapId(hesap.id);
                                setHesapQuickBarVisible(true);
                              }
                            }}
                            style={styles.actionButton}
                          >
                            {t('common:archive.actions.makeTransaction')}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            icon={<History size={16} color={colors.text} />}
                            onPress={() => router.push(`/hesaplar/${hesap.id}`)}
                            style={styles.actionButton}
                          >
                            {t('clients:actions.viewTransactions')}
                          </Button>
                        </View>
                      </ExpandableCard>
                    </View>
                  ))}
                </View>
              );
            })}
            </View>
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
              label: t('clients:types.tedarikci'),
              icon: <Truck size={18} color={colors.warning} />,
              onPress: () => handleFabMenuOption(() => {
                setCariPickerMode('supplier');
                setShowCariPicker(true);
              }),
              index: 2,
            },
            {
              label: t('clients:types.musteri'),
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

      {/* Hesap QuickTransactionBar */}
      <QuickTransactionBar
        visible={hesapQuickBarVisible}
        onDismiss={() => {
          setHesapQuickBarVisible(false);
          setSelectedHesapId(null);
        }}
        defaultHesapId={selectedHesapId || undefined}
        onSuccess={() => {
          setHesapQuickBarVisible(false);
          setSelectedHesapId(null);
        }}
      />

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

      {/* Financial Detail Modal */}
      <FinancialDetailModal
        visible={financialModalVisible}
        onDismiss={() => setFinancialModalVisible(false)}
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
  sectionTitle: {
    textTransform: 'uppercase',
    letterSpacing: 0.5,
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
    fontSize: fontSize.md,
    letterSpacing: 0.5,
  },
  groupTotal: {
    fontWeight: '700',
    fontSize: fontSize.lg,
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
  actionButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionButton: {
    flex: 1,
  },
  moreButton: {
    padding: spacing.xs,
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
