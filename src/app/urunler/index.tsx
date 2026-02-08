import { useState, useRef, useEffect, useCallback } from 'react';
import { View, StyleSheet, ScrollView, Alert, TouchableOpacity, TouchableWithoutFeedback, Animated, Modal, Pressable, Platform, RefreshControl } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Plus, Package, Search, ArrowRightLeft, History, X, TrendingUp, TrendingDown, ChevronLeft, ChevronRight, Calendar, MoreVertical, Edit3, Archive, Trash2 } from 'lucide-react-native';
import { Text, Button, Input, EmptyState, ExpandableCard, TabFilter, ActionSheet, type ActionSheetOption } from '@/components/ui';
import { QuickStockBar } from '@/components/stock/QuickStockBar';
import { useHaptics } from '@/hooks/useHaptics';
import { useDateFormat } from '@/hooks/useDateFormat';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { useUrunler, useDeleteUrun, useArchiveUrun } from '@/hooks/useUrunler';
import { useToast } from '@/contexts/ToastContext';
import { useDonemStokOzet } from '@/hooks/useStokHareketler';
import { useKategoriler } from '@/hooks/useKategoriler';
import { Urun, BirimType } from '@/types/database';
import { formatCurrency } from '@/lib/currency';
import { formatDateForDB } from '@/lib/date';

type PeriodType = 'yearly' | 'monthly' | 'weekly' | 'daily' | 'custom';

export default function UrunlerPage() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const haptics = useHaptics();
  const { t } = useTranslation(['products', 'common', 'errors']);
  const { getDateRangeLabel, locale } = useDateFormat();
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [quickStockVisible, setQuickStockVisible] = useState(false);
  const [selectedUrun, setSelectedUrun] = useState<Urun | null>(null);
  const [fabMenuVisible, setFabMenuVisible] = useState(false);

  // ActionSheet için state
  const [actionSheetVisible, setActionSheetVisible] = useState(false);
  const [actionSheetUrun, setActionSheetUrun] = useState<Urun | null>(null);

  // Dönem seçici state'leri
  const [period, setPeriod] = useState<PeriodType>('monthly');
  const [periodOffset, setPeriodOffset] = useState(0);

  // Özel tarih aralığı state'leri
  const [customStartDate, setCustomStartDate] = useState<Date>(new Date());
  const [customEndDate, setCustomEndDate] = useState<Date>(new Date());
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);

  // Dönem seçici seçenekleri
  const PERIOD_OPTIONS = [
    { label: t('products:period.yearly'), value: 'yearly' },
    { label: t('products:period.monthly'), value: 'monthly' },
    { label: t('products:period.weekly'), value: 'weekly' },
    { label: t('products:period.daily'), value: 'daily' },
    { label: t('products:period.custom'), value: 'custom' },
  ];

  // Dönem tarih aralığını hesapla
  const customRange = period === 'custom' ? {
    startDate: formatDateForDB(customStartDate),
    endDate: formatDateForDB(customEndDate),
  } : undefined;
  const { startDate, endDate, label: periodLabel } = getDateRangeLabel(period, periodOffset, customRange);

  // FAB animation
  const fabRotation = useRef(new Animated.Value(0)).current;
  const menuOpacity = useRef(new Animated.Value(0)).current;
  const menuTranslateY = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    if (fabMenuVisible) {
      Animated.parallel([
        Animated.timing(fabRotation, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(menuOpacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(menuTranslateY, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(fabRotation, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(menuOpacity, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(menuTranslateY, {
          toValue: 20,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [fabMenuVisible]);

  const { data: urunler, isLoading, refetch } = useUrunler();

  // Pull-to-refresh
  const [isRefreshing, setIsRefreshing] = useState(false);
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try { await refetch(); } finally { setIsRefreshing(false); }
  }, [refetch]);
  const deleteUrun = useDeleteUrun();
  const archiveUrun = useArchiveUrun();
  const { data: kategoriler } = useKategoriler();
  const { showToast } = useToast();

  // Dönem bazlı stok hareketleri özeti
  const { data: donemStokOzet } = useDonemStokOzet({ startDate, endDate });

  // Kategori id -> ad map'i
  const kategoriMap = new Map(kategoriler?.map(k => [k.id, k.name]) || []);

  // Arama filtresi (ürün adı, kodu ve kategori adı)
  const filteredUrunler = urunler?.filter((urun) => {
    const query = searchQuery.toLowerCase();
    const kategoriAdi = urun.kategori_id ? kategoriMap.get(urun.kategori_id)?.toLowerCase() : '';
    return (
      urun.ad.toLowerCase().includes(query) ||
      (urun.kod && urun.kod.toLowerCase().includes(query)) ||
      (kategoriAdi && kategoriAdi.includes(query))
    );
  }) || [];

  // ActionSheet handlers
  const handleOpenActionSheet = (urun: Urun) => {
    setActionSheetUrun(urun);
    setActionSheetVisible(true);
  };

  const handleArchive = async () => {
    if (!actionSheetUrun) return;
    try {
      await archiveUrun.mutateAsync(actionSheetUrun.id);
      haptics.success();
      showToast(t('common:archive.messages.archiveSuccess'), 'success');
    } catch (error) {
      haptics.error();
      showToast(t('common:messages.operationFailed'), 'error');
    }
  };

  const handleDelete = () => {
    if (!actionSheetUrun) return;
    Alert.alert(
      t('common:confirm.deleteTitle'),
      t('common:confirm.deleteMessage', { item: actionSheetUrun.ad }),
      [
        { text: t('common:buttons.cancel'), style: 'cancel' },
        {
          text: t('common:buttons.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteUrun.mutateAsync(actionSheetUrun.id);
              haptics.success();
              showToast(t('common:messages.deletedSuccessfully'), 'success');
            } catch (error: any) {
              haptics.error();
              showToast(t('common:messages.operationFailed'), 'error');
            }
          },
        },
      ]
    );
  };

  const actionSheetOptions: ActionSheetOption[] = [
    {
      label: t('common:buttons.edit'),
      icon: <Edit3 size={20} color={colors.primary} />,
      onPress: () => {
        if (actionSheetUrun) {
          router.push(`/urunler/duzenle/${actionSheetUrun.id}` as any);
        }
      },
    },
    {
      label: t('common:archive.actions.archive'),
      icon: <Archive size={20} color={colors.warning} />,
      onPress: handleArchive,
    },
    {
      label: t('common:buttons.delete'),
      icon: <Trash2 size={20} color={colors.error} />,
      onPress: handleDelete,
      destructive: true,
    },
  ];

  const getBirimLabel = (birim: BirimType) => {
    return t(`products:units.${birim}`);
  };

  const handleToggle = (urunId: string) => {
    setExpandedId(expandedId === urunId ? null : urunId);
  };

  const handleNewTransaction = (urun: Urun) => {
    setSelectedUrun(urun);
    setQuickStockVisible(true);
  };

  const handleViewMovements = (urunId: string) => {
    router.push(`/urunler/${urunId}` as any);
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.loadingContainer}>
          <Text color="secondary">{t('common:status.loading')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} colors={[colors.primary]} tintColor={colors.primary} />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <Text variant="h2">{t('products:title')}</Text>
          <Button
            variant="primary"
            size="sm"
            icon={<Plus size={18} color={colors.white} />}
            iconPosition="left"
            onPress={() => router.push('/urunler/ekle' as any)}
          >
            {t('common:buttons.add')}
          </Button>
        </View>

        {/* Arama */}
        {(urunler && urunler.length > 0) && (
          <View style={styles.searchSection}>
            <Input
              placeholder={t('products:search.placeholder')}
              value={searchQuery}
              onChangeText={setSearchQuery}
              leftIcon={<Search size={20} color={colors.textMuted} />}
            />
          </View>
        )}

        {/* Dönem Seçici */}
        {(urunler && urunler.length > 0) && (
          <View style={styles.periodSection}>
            <TabFilter
              options={PERIOD_OPTIONS}
              value={period}
              onChange={(value) => {
                setPeriod(value as PeriodType);
                setPeriodOffset(0);
              }}
            />
            {period === 'custom' ? (
              <View style={styles.customDateRow}>
                <TouchableOpacity
                  style={styles.datePickerButton}
                  onPress={() => setShowStartPicker(true)}
                >
                  <Calendar size={16} color={colors.primary} />
                  <Text variant="caption">{t('products:period.startDate')}: {formatDateForDB(customStartDate)}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.datePickerButton}
                  onPress={() => setShowEndPicker(true)}
                >
                  <Calendar size={16} color={colors.primary} />
                  <Text variant="caption">{t('products:period.endDate')}: {formatDateForDB(customEndDate)}</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.periodNav}>
                <TouchableOpacity
                  onPress={() => {
                    haptics.light();
                    setPeriodOffset(periodOffset - 1);
                  }}
                  style={styles.periodNavButton}
                >
                  <ChevronLeft size={20} color={colors.primary} />
                </TouchableOpacity>
                <Text variant="body" style={styles.periodLabel}>{periodLabel}</Text>
                <TouchableOpacity
                  onPress={() => {
                    haptics.light();
                    setPeriodOffset(periodOffset + 1);
                  }}
                  style={styles.periodNavButton}
                  disabled={periodOffset >= 0}
                >
                  <ChevronRight size={20} color={periodOffset >= 0 ? colors.textMuted : colors.primary} />
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {/* Liste */}
        <View style={styles.listSection}>
          {filteredUrunler.length === 0 ? (
            <EmptyState
              icon={<Package size={48} color={colors.textMuted} />}
              title={t('products:empty.title')}
              description={t('products:empty.description')}
              actionLabel={t('products:addProduct')}
              onAction={() => router.push('/urunler/ekle' as any)}
            />
          ) : (
            filteredUrunler.map((urun) => {
              const urunOzet = donemStokOzet?.[urun.id];
              const hasMovements = urunOzet && (urunOzet.giris > 0 || urunOzet.cikis > 0);

              return (
              <ExpandableCard
                key={urun.id}
                expanded={expandedId === urun.id}
                onToggle={() => handleToggle(urun.id)}
                header={
                  <View style={styles.urunHeader}>
                    <Package size={24} color={colors.primary} />
                    <View style={styles.urunInfo}>
                      <Text variant="body">{urun.ad}</Text>
                      <Text variant="caption" color="secondary">
                        {urun.miktar} {getBirimLabel(urun.birim)}
                        {urun.satis_fiyati > 0 && ` • ${formatCurrency(urun.satis_fiyati, urun.currency)}/${getBirimLabel(urun.birim)}`}
                      </Text>
                    </View>
                    {/* Dönem özeti */}
                    <View style={styles.periodSummary}>
                      {hasMovements ? (
                        <>
                          {urunOzet.giris > 0 && (
                            <View style={styles.periodSummaryItem}>
                              <TrendingUp size={12} color={colors.success} />
                              <Text variant="caption" color="success">
                                +{urunOzet.giris}
                              </Text>
                            </View>
                          )}
                          {urunOzet.cikis > 0 && (
                            <View style={styles.periodSummaryItem}>
                              <TrendingDown size={12} color={colors.error} />
                              <Text variant="caption" color="error">
                                -{urunOzet.cikis}
                              </Text>
                            </View>
                          )}
                        </>
                      ) : null}
                    </View>
                    <TouchableOpacity
                      style={styles.moreButton}
                      onPress={(e) => {
                        e.stopPropagation();
                        handleOpenActionSheet(urun);
                      }}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <MoreVertical size={20} color={colors.textMuted} />
                    </TouchableOpacity>
                  </View>
                }
              >
                {/* Expanded Content - Action Buttons */}
                <View style={styles.actionButtons}>
                  <Button
                    variant="primary"
                    size="sm"
                    icon={<ArrowRightLeft size={16} color={colors.white} />}
                    iconPosition="left"
                    onPress={() => handleNewTransaction(urun)}
                    style={styles.actionButton}
                  >
                    {t('products:actions.newTransaction')}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    icon={<History size={16} color={colors.primary} />}
                    iconPosition="left"
                    onPress={() => handleViewMovements(urun.id)}
                    style={styles.actionButton}
                  >
                    {t('products:actions.viewMovements')}
                  </Button>
                </View>
              </ExpandableCard>
              );
            })
          )}
        </View>
      </ScrollView>

      {/* QuickStockBar */}
      <QuickStockBar
        visible={quickStockVisible}
        onDismiss={() => {
          setQuickStockVisible(false);
          setSelectedUrun(null);
        }}
        urun={selectedUrun}
      />

      {/* ActionSheet */}
      <ActionSheet
        visible={actionSheetVisible}
        onClose={() => {
          setActionSheetVisible(false);
          setActionSheetUrun(null);
        }}
        title={actionSheetUrun?.ad}
        options={actionSheetOptions}
        cancelLabel={t('common:buttons.cancel')}
      />

      {/* Date Pickers for Custom Period - iOS */}
      {Platform.OS === 'ios' && (showStartPicker || showEndPicker) && (
        <Modal visible={showStartPicker || showEndPicker} transparent animationType="slide">
          <Pressable
            style={styles.datePickerOverlay}
            onPress={() => {
              setShowStartPicker(false);
              setShowEndPicker(false);
            }}
          >
            <Pressable style={styles.datePickerModal} onPress={(e) => e.stopPropagation()}>
              <View style={styles.datePickerHeader}>
                <Text variant="h3">
                  {showStartPicker ? t('products:period.startDate') : t('products:period.endDate')}
                </Text>
                <TouchableOpacity onPress={() => {
                  setShowStartPicker(false);
                  setShowEndPicker(false);
                }}>
                  <X size={24} color={colors.text} />
                </TouchableOpacity>
              </View>
              <View style={styles.datePickerWrapper}>
                <DateTimePicker
                  value={showStartPicker ? customStartDate : customEndDate}
                  mode="date"
                  display="inline"
                  themeVariant="light"
                  accentColor={colors.primary}
                  locale={locale}
                  style={{ height: 350 }}
                  onChange={(_, date) => {
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
                />
              </View>
              <Button variant="primary" onPress={() => {
                setShowStartPicker(false);
                setShowEndPicker(false);
              }}>
                {t('common:buttons.ok')}
              </Button>
            </Pressable>
          </Pressable>
        </Modal>
      )}

      {/* Date Pickers for Custom Period - Android */}
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

      {/* FAB Backdrop */}
      {fabMenuVisible && (
        <TouchableWithoutFeedback onPress={() => {
          haptics.light();
          setFabMenuVisible(false);
        }}>
          <View style={styles.fabBackdrop} />
        </TouchableWithoutFeedback>
      )}

      {/* FAB Menu */}
      <View style={[styles.fabContainer, { bottom: spacing.lg + insets.bottom }]}>
        {fabMenuVisible && (
          <Animated.View
            style={[
              styles.fabMenu,
              {
                opacity: menuOpacity,
                transform: [{ translateY: menuTranslateY }],
              },
            ]}
          >
            <TouchableOpacity
              style={styles.fabMenuItem}
              onPress={() => {
                haptics.light();
                setFabMenuVisible(false);
                router.push('/urunler/toplu-giris' as any);
              }}
            >
              <View style={[styles.fabMenuIcon, { backgroundColor: colors.successLight }]}>
                <TrendingUp size={20} color={colors.success} />
              </View>
              <Text variant="body">{t('products:bulk.stockIn')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.fabMenuItem}
              onPress={() => {
                haptics.light();
                setFabMenuVisible(false);
                router.push('/urunler/toplu-cikis' as any);
              }}
            >
              <View style={[styles.fabMenuIcon, { backgroundColor: colors.errorLight }]}>
                <TrendingDown size={20} color={colors.error} />
              </View>
              <Text variant="body">{t('products:bulk.stockOut')}</Text>
            </TouchableOpacity>
          </Animated.View>
        )}
        <TouchableOpacity
          style={styles.fab}
          onPress={() => {
            haptics.light();
            setFabMenuVisible(!fabMenuVisible);
          }}
          activeOpacity={0.8}
        >
          <Animated.View
            style={{
              transform: [
                {
                  rotate: fabRotation.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['0deg', '45deg'],
                  }),
                },
              ],
            }}
          >
            {fabMenuVisible ? (
              <X size={24} color={colors.surface} />
            ) : (
              <Plus size={24} color={colors.surface} />
            )}
          </Animated.View>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
  searchSection: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  periodSection: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  periodNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  periodNavButton: {
    padding: spacing.sm,
  },
  periodLabel: {
    fontWeight: '600',
    minWidth: 120,
    textAlign: 'center',
  },
  customDateRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.md,
  },
  datePickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.surface,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  datePickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  datePickerModal: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: spacing.lg,
    gap: spacing.md,
  },
  datePickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  datePickerWrapper: {
    alignItems: 'center',
  },
  listSection: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing['3xl'],
  },
  urunHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  urunInfo: {
    flex: 1,
  },
  moreButton: {
    padding: spacing.xs,
    marginLeft: spacing.sm,
  },
  periodSummary: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
  },
  periodSummaryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  actionButton: {
    flex: 1,
  },
  // FAB Styles
  fabContainer: {
    position: 'absolute',
    right: spacing.lg,
    alignItems: 'flex-end',
  },
  fab: {
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
  },
  fabMenu: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.sm,
    marginBottom: spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
    minWidth: 200,
  },
  fabMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  fabMenuIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
  },
});
