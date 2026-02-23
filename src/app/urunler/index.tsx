import { useState, useRef, useEffect, useCallback } from 'react';
import { View, StyleSheet, ScrollView, Alert, TouchableOpacity, Animated, Modal, Pressable, Platform, RefreshControl } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Plus, Package, Search, ArrowRightLeft, History, X, TrendingUp, TrendingDown, ChevronLeft, ChevronRight, Calendar, MoreVertical, Edit3, Archive, Trash2 } from 'lucide-react-native';
import { Text, Button, Input, EmptyState, ExpandableCard, TabFilter, ActionSheet, type ActionSheetOption } from '@/components/ui';
import { QuickUrunBar } from '@/components/urun/QuickUrunBar';
import { useHaptics } from '@/hooks/useHaptics';
import { useDateFormat } from '@/hooks/useDateFormat';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { useUrunler, useDeleteUrun, useArchiveUrun } from '@/hooks/useUrunler';
import { useToast } from '@/contexts/ToastContext';
import { useDonemUrunOzet } from '@/hooks/useUrunHareketler';
import { useKategoriler } from '@/hooks/useKategoriler';
import { Urun, BirimType } from '@/types/database';
import { formatCurrency } from '@/lib/currency';
import { formatDateForDB } from '@/lib/date';
import { toErrorMessage } from '@/lib/errors';

type PeriodType = 'yearly' | 'monthly' | 'weekly' | 'daily' | 'custom';

export default function UrunlerPage() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const haptics = useHaptics();
  const { t } = useTranslation(['products', 'common', 'errors', 'reports']);
  const { getDateRangeLabel, locale } = useDateFormat();
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [quickUrunVisible, setQuickUrunVisible] = useState(false);
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

  // Hızlı dönem seçimi için state'ler
  const [showYearPicker, setShowYearPicker] = useState(false);
  const [showMonthYearPicker, setShowMonthYearPicker] = useState(false);
  const [showDayPicker, setShowDayPicker] = useState(false);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

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
  const fabAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(fabAnim, {
      toValue: fabMenuVisible ? 1 : 0,
      damping: 15,
      stiffness: 200,
      useNativeDriver: true,
    }).start();
  }, [fabMenuVisible, fabAnim]);

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

  // Dönem bazlı urun hareketleri özeti
  const { data: donemUrunOzet } = useDonemUrunOzet({ startDate, endDate });

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
            } catch (error) {
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

  // Hızlı dönem seçimi fonksiyonları
  const handlePeriodLabelPress = () => {
    switch (period) {
      case 'yearly':
        setShowYearPicker(true);
        break;
      case 'monthly':
      case 'weekly': {
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth();
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

  const goToYear = (year: number) => {
    const currentYear = new Date().getFullYear();
    setPeriodOffset(year - currentYear);
    setShowYearPicker(false);
  };

  const goToMonth = (year: number, month: number) => {
    const now = new Date();
    const monthsDiff = (year - now.getFullYear()) * 12 + (month - now.getMonth());
    setPeriodOffset(monthsDiff);
    setShowMonthYearPicker(false);
  };

  const goToDay = (date: Date) => {
    const now = new Date();
    const nowMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dateMidnight = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const daysDiff = Math.round((dateMidnight.getTime() - nowMidnight.getTime()) / (1000 * 60 * 60 * 24));
    setPeriodOffset(daysDiff);
    setShowDayPicker(false);
  };

  const goToWeekOfMonth = (year: number, month: number) => {
    const now = new Date();
    const nowMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const firstDayOfMonth = new Date(year, month, 1);
    const daysDiff = Math.round((firstDayOfMonth.getTime() - nowMidnight.getTime()) / (1000 * 60 * 60 * 24));
    const weeksDiff = Math.round(daysDiff / 7);
    setPeriodOffset(weeksDiff);
    setShowMonthYearPicker(false);
  };

  const getBirimLabel = (birim: BirimType) => {
    return t(`products:units.${birim}`);
  };

  const handleToggle = (urunId: string) => {
    setExpandedId(expandedId === urunId ? null : urunId);
  };

  const handleNewTransaction = (urun: Urun) => {
    setSelectedUrun(urun);
    setQuickUrunVisible(true);
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
                <TouchableOpacity onPress={() => { haptics.light(); handlePeriodLabelPress(); }}>
                  <Text variant="body" style={styles.periodLabel}>{periodLabel}</Text>
                </TouchableOpacity>
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
              const urunOzet = donemUrunOzet?.[urun.id];
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

      {/* QuickUrunBar */}
      <QuickUrunBar
        visible={quickUrunVisible}
        onDismiss={() => {
          setQuickUrunVisible(false);
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
            style={styles.pickerModalOverlay}
            onPress={() => setShowDayPicker(false)}
          >
            <Pressable style={styles.pickerModalContent} onPress={(e) => e.stopPropagation()}>
              <View style={styles.pickerModalHeader}>
                <Text variant="h3">{t('products:period.daily')}</Text>
                <TouchableOpacity onPress={() => setShowDayPicker(false)}>
                  <X size={24} color={colors.text} />
                </TouchableOpacity>
              </View>
              <View style={{ alignItems: 'center' }}>
                <DateTimePicker
                  value={(() => {
                    const now = new Date();
                    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + periodOffset);
                    return d;
                  })()}
                  mode="date"
                  display="inline"
                  themeVariant="light"
                  accentColor={colors.primary}
                  locale={locale}
                  style={{ height: 350 }}
                  onChange={(_, date) => { if (date) goToDay(date); }}
                  maximumDate={new Date()}
                />
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      )}

      {/* Günlük DatePicker (Android) */}
      {Platform.OS === 'android' && showDayPicker && (
        <DateTimePicker
          value={(() => {
            const now = new Date();
            return new Date(now.getFullYear(), now.getMonth(), now.getDate() + periodOffset);
          })()}
          mode="date"
          display="default"
          onChange={(event, date) => {
            setShowDayPicker(false);
            if (event.type === 'set' && date) goToDay(date);
          }}
          maximumDate={new Date()}
        />
      )}

      {/* FAB Backdrop */}
      {fabMenuVisible && (
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setFabMenuVisible(false)}>
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: 'rgba(0,0,0,0.3)', opacity: fabAnim },
            ]}
          />
        </Pressable>
      )}

      {/* FAB Menu Items */}
      {fabMenuVisible && (
        <View style={[styles.fabMenuContainer, { bottom: spacing.lg + insets.bottom + 56 + spacing.md }]}>
          {[
            {
              label: t('products:bulk.stockIn'),
              icon: <TrendingUp size={18} color={colors.success} />,
              onPress: () => {
                haptics.light();
                setFabMenuVisible(false);
                router.push('/urunler/toplu-giris' as any);
              },
              index: 1,
            },
            {
              label: t('products:bulk.stockOut'),
              icon: <TrendingDown size={18} color={colors.error} />,
              onPress: () => {
                haptics.light();
                setFabMenuVisible(false);
                router.push('/urunler/toplu-cikis' as any);
              },
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
          setFabMenuVisible(!fabMenuVisible);
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
  // Picker Modal Styles
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
  // FAB Styles
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
