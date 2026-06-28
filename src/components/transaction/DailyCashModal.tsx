import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  View,
  StyleSheet,
  Modal,
  Animated,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Platform,
  Keyboard,
  KeyboardEvent,
  Easing,
  Alert,
  ScrollView,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Calendar, X, Wallet, Eye, EyeOff, SlidersHorizontal } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import DateTimePickerRN, { DateTimePickerEvent } from '@react-native-community/datetimepicker';

import { Text, Button, CategoryPicker } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { parseCurrency, isValidAmount, formatCurrency } from '@/lib/currency';
import { formatDateTimeForDB, ensureValidDate } from '@/lib/date';
import { useDateFormat } from '@/hooks/useDateFormat';
import { useHesaplar } from '@/hooks/useHesaplar';
import { useCreateIslem } from '@/hooks/useIslemler';
import { getHesapIconConfig } from '@/lib/icons';
import { Hesap } from '@/types/database';
import { supabase } from '@/lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';

const HIDDEN_ACCOUNTS_KEY = '@defter_daily_cash_hidden_accounts';

interface DailyCashEntry {
  hesapId: string;
  amount: string;
  kategoriId: string | null;
  description: string;
}

export interface DailyCashModalProps {
  visible: boolean;
  onDismiss: () => void;
  onSuccess?: () => void;
}

export function DailyCashModal({
  visible,
  onDismiss,
  onSuccess,
}: DailyCashModalProps) {
  const { t } = useTranslation(['transactions', 'common', 'accounts']);
  const { formatDateMedium, locale } = useDateFormat();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const windowHeight = Dimensions.get('window').height;

  // Date state - initialized with time 23:59
  const [date, setDate] = useState(() => {
    const d = new Date();
    d.setHours(23, 59, 0, 0);
    return d;
  });
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Account visibility settings
  const [hiddenAccountIds, setHiddenAccountIds] = useState<Set<string>>(new Set());
  const [showSettings, setShowSettings] = useState(false);

  // Entries state - initialized when hesaplar loads
  const [entries, setEntries] = useState<DailyCashEntry[]>([]);

  // Animation
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(100)).current;
  const isAnimatingRef = useRef(false);

  // Keyboard
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  // Data
  const { data: hesaplar, isLoading: hesaplarLoading } = useHesaplar();
  const createIslem = useCreateIslem();

  // Kredi kartı ve birikim hesaplarını filtrele (sadece nakit, banka, diger)
  const filteredHesaplar = useMemo(() => {
    if (!hesaplar) return [];
    return hesaplar.filter((h) => !['kredi_karti', 'birikim'].includes(h.type));
  }, [hesaplar]);

  // Kullanıcının görmek istediği hesaplar (settings modunda hepsi gösterilir)
  const visibleHesaplar = useMemo(() => {
    if (showSettings) return filteredHesaplar;
    return filteredHesaplar.filter((h) => !hiddenAccountIds.has(h.id));
  }, [filteredHesaplar, hiddenAccountIds, showSettings]);

  // Load hidden accounts from AsyncStorage
  useEffect(() => {
    AsyncStorage.getItem(HIDDEN_ACCOUNTS_KEY).then((stored) => {
      if (stored) {
        try {
          const ids: string[] = JSON.parse(stored);
          setHiddenAccountIds(new Set(ids));
        } catch { /* ignore parse errors */ }
      }
    });
  }, []);

  // Toggle account visibility
  const toggleAccountVisibility = useCallback(async (hesapId: string) => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setHiddenAccountIds((prev) => {
      const next = new Set(prev);
      if (next.has(hesapId)) {
        next.delete(hesapId);
      } else {
        // En az 1 hesap görünür kalmalı
        const visibleCount = filteredHesaplar.filter((h) => !next.has(h.id)).length;
        if (visibleCount <= 1) {
          Alert.alert(t('common:status.error'), t('transactions:dailyCash.minOneAccount'));
          return prev;
        }
        next.add(hesapId);
      }
      AsyncStorage.setItem(HIDDEN_ACCOUNTS_KEY, JSON.stringify([...next]));
      return next;
    });
  }, [filteredHesaplar, t]);

  // Initialize entries when visible hesaplar changes
  useEffect(() => {
    if (visibleHesaplar.length > 0 && !showSettings) {
      setEntries(
        visibleHesaplar.map((h) => ({
          hesapId: h.id,
          amount: '',
          kategoriId: null,
          description: '',
        }))
      );
    }
  }, [visibleHesaplar, showSettings]);

  // Reset state when modal closes
  useEffect(() => {
    if (!visible) {
      const timer = setTimeout(() => {
        const d = new Date();
        d.setHours(23, 59, 0, 0);
        setDate(d);
        setIsSaving(false);
        setShowSettings(false);
        if (visibleHesaplar.length > 0) {
          setEntries(
            visibleHesaplar.map((h) => ({
              hesapId: h.id,
              amount: '',
              kategoriId: null,
              description: '',
            }))
          );
        }
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [visible, visibleHesaplar]);

  // Keyboard listeners
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const handleShow = (e: KeyboardEvent) => {
      setIsKeyboardVisible(true);
      setKeyboardHeight(e.endCoordinates.height);
    };

    const handleHide = () => {
      setIsKeyboardVisible(false);
      setKeyboardHeight(0);
    };

    const showSub = Keyboard.addListener(showEvent, handleShow);
    const hideSub = Keyboard.addListener(hideEvent, handleHide);

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // Open animation
  const animateOpen = useCallback(() => {
    if (isAnimatingRef.current) return;
    isAnimatingRef.current = true;

    opacity.setValue(0);
    translateY.setValue(100);

    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 200,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 250,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(() => {
      isAnimatingRef.current = false;
    });
  }, [opacity, translateY]);

  // Close animation
  const animateClose = useCallback((callback?: () => void) => {
    if (isAnimatingRef.current) return;
    isAnimatingRef.current = true;

    Keyboard.dismiss();

    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 100,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      isAnimatingRef.current = false;
      callback?.();
    });
  }, [opacity, translateY]);

  // Handle visibility
  useEffect(() => {
    if (visible) {
      animateOpen();
    }
  }, [visible, animateOpen]);

  // Handle dismiss
  const handleDismiss = useCallback(() => {
    animateClose(() => {
      onDismiss();
    });
  }, [animateClose, onDismiss]);

  // Handle backdrop press - two-step dismiss
  const handleBackdropPress = useCallback(() => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    if (isKeyboardVisible) {
      Keyboard.dismiss();
    } else {
      handleDismiss();
    }
  }, [handleDismiss, isKeyboardVisible]);

  // Update entry
  const updateEntry = useCallback((hesapId: string, field: keyof DailyCashEntry, value: string | null) => {
    setEntries((prev) =>
      prev.map((e) =>
        e.hesapId === hesapId ? { ...e, [field]: value } : e
      )
    );
  }, []);

  // Handle amount change
  const handleAmountChange = useCallback((hesapId: string, text: string) => {
    const cleaned = text.replace(/[^0-9,.]/g, '');
    updateEntry(hesapId, 'amount', cleaned);
  }, [updateEntry]);

  // Handle save
  const handleSave = useCallback(async () => {
    // Filter valid entries
    const validEntries = entries.filter(
      (e) => e.amount && isValidAmount(e.amount)
    );

    if (validEntries.length === 0) {
      Alert.alert(
        t('common:status.error'),
        t('transactions:dailyCash.noEntries')
      );
      return;
    }

    setIsSaving(true);

    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }

    // Track created islem IDs for rollback
    const createdIslemIds: string[] = [];

    try {
      // Create transactions for each valid entry
      for (const entry of validEntries) {
        const result = await createIslem.mutateAsync({
          type: 'gelir',
          amount: parseCurrency(entry.amount),
          hesap_id: entry.hesapId,
          kategori_id: entry.kategoriId,
          description: entry.description || null,
          date: formatDateTimeForDB(date),
        });

        // Track created islem ID for potential rollback
        if (result?.id) {
          createdIslemIds.push(result.id);
        }
      }

      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }

      Alert.alert(t('common:status.success'), t('transactions:dailyCash.success'));
      onSuccess?.();
      handleDismiss();
    } catch (error: unknown) {
      // Rollback: delete any successfully created islemler
      if (createdIslemIds.length > 0) {
        try {
          const { error: deleteError } = await supabase
            .from('islemler')
            .delete()
            .in('id', createdIslemIds);

          if (deleteError && __DEV__) {
            console.error('Rollback işlem silme başarısız:', deleteError);
          }
        } catch (rollbackError) {
          if (__DEV__) {
            console.error('Rollback tamamen başarısız:', rollbackError);
          }
        }
      }

      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
      Alert.alert(t('common:status.error'), error instanceof Error ? error.message : t('transactions:messages.saveFailed'));
    } finally {
      setIsSaving(false);
    }
  }, [entries, date, createIslem, t, onSuccess, handleDismiss]);

  // Handle date change - always set time to 23:59
  const handleDateChange = useCallback((event: DateTimePickerEvent, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setShowDatePicker(false);
    }

    if (selectedDate) {
      const newDate = new Date(selectedDate);
      newDate.setHours(23, 59, 0, 0);
      setDate(newDate);
    }
  }, []);

  // Get hesap by id
  const getHesap = useCallback((hesapId: string): Hesap | undefined => {
    return filteredHesaplar.find((h) => h.id === hesapId);
  }, [filteredHesaplar]);

  // Toggle settings mode
  const handleToggleSettings = useCallback(() => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setShowSettings((prev) => !prev);
  }, []);

  // Calculate total amount
  const totalAmount = useMemo(() => {
    return entries.reduce((sum, entry) => {
      if (entry.amount && isValidAmount(entry.amount)) {
        return sum + parseCurrency(entry.amount);
      }
      return sum;
    }, 0);
  }, [entries]);

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent>
      {/* Backdrop */}
      <TouchableWithoutFeedback onPress={handleBackdropPress}>
        <View style={styles.backdrop} />
      </TouchableWithoutFeedback>

      {/* Card */}
      <View style={[styles.cardContainer, { bottom: keyboardHeight }]}>
        <Animated.View
          style={[
            styles.card,
            {
              maxHeight: windowHeight * (isKeyboardVisible ? 0.5 : 0.7),
              minHeight: visibleHesaplar.length === 0 && !hesaplarLoading ? 350 : undefined,
              paddingBottom: isKeyboardVisible ? spacing.md : insets.bottom + spacing.md,
              opacity,
              transform: [{ translateY }],
            },
          ]}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Text variant="h3">{t('transactions:dailyCash.title')}</Text>
              <Text variant="h2" style={styles.totalAmount}>
                {formatCurrency(totalAmount)}
              </Text>
            </View>
            <View style={styles.headerRight}>
              <TouchableOpacity
                style={styles.dateButton}
                onPress={() => setShowDatePicker(true)}
              >
                <Calendar size={18} color={colors.primary} />
                <Text variant="caption" style={styles.dateText}>
                  {formatDateMedium(date)}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.settingsButton, showSettings && styles.settingsButtonActive]}
                onPress={handleToggleSettings}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <SlidersHorizontal size={18} color={showSettings ? colors.surface : colors.textMuted} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={handleDismiss}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <X size={22} color={colors.text} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Content */}
          {hesaplarLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          ) : filteredHesaplar.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Wallet size={48} color={colors.textMuted} />
              <Text variant="h3" center style={styles.emptyTitle}>
                {t('accounts:messages.noAccounts')}
              </Text>
              <Text variant="bodySmall" color="secondary" center style={styles.emptyDescription}>
                {t('accounts:messages.addFirstAccount')}
              </Text>
              <Button
                variant="primary"
                onPress={() => {
                  handleDismiss();
                  router.push('/hesaplar/ekle');
                }}
                style={styles.emptyButton}
              >
                {t('accounts:titles.addAccount')}
              </Button>
            </View>
          ) : showSettings ? (
            /* Settings Mode - Account visibility toggles */
            <ScrollView
              style={styles.scrollView}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
            >
              {filteredHesaplar.map((hesap) => {
                const iconConfig = getHesapIconConfig(hesap.type, 18);
                const isHidden = hiddenAccountIds.has(hesap.id);

                return (
                  <TouchableOpacity
                    key={hesap.id}
                    style={[styles.settingsRow, isHidden && styles.settingsRowHidden]}
                    onPress={() => toggleAccountVisibility(hesap.id)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.hesapInfo}>
                      <View style={[styles.hesapIcon, { backgroundColor: iconConfig.backgroundColor }]}>
                        {iconConfig.icon}
                      </View>
                      <Text variant="body" numberOfLines={1} style={[styles.hesapName, isHidden && styles.hiddenText]}>
                        {hesap.name}
                      </Text>
                    </View>
                    {isHidden ? (
                      <EyeOff size={20} color={colors.textMuted} />
                    ) : (
                      <Eye size={20} color={colors.success} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          ) : (
            <>
              {/* Accounts List */}
              <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                {entries.map((entry) => {
                  const hesap = getHesap(entry.hesapId);
                  if (!hesap) return null;

                  const iconConfig = getHesapIconConfig(hesap.type, 18);

                  return (
                    <View key={entry.hesapId} style={styles.entryRow}>
                      {/* Category - Compact */}
                      <View style={styles.categoryCompact}>
                        <CategoryPicker
                          value={entry.kategoriId}
                          onChange={(value) => updateEntry(entry.hesapId, 'kategoriId', value)}
                          type="gelir"
                          label=""
                          placeholder={t('transactions:dailyCash.category')}
                          onNavigateAway={handleDismiss}
                        />
                      </View>

                      {/* Hesap + Amount Row */}
                      <View style={styles.hesapAmountRow}>
                        <View style={styles.hesapInfo}>
                          <View style={[styles.hesapIcon, { backgroundColor: iconConfig.backgroundColor }]}>
                            {iconConfig.icon}
                          </View>
                          <Text variant="body" numberOfLines={1} style={styles.hesapName}>
                            {hesap.name}
                          </Text>
                        </View>
                        <TextInput
                          style={styles.amountInput}
                          placeholder="0"
                          placeholderTextColor={colors.textMuted}
                          value={entry.amount}
                          onChangeText={(text) => handleAmountChange(entry.hesapId, text)}
                          keyboardType="decimal-pad"
                          maxLength={12}
                        />
                      </View>
                    </View>
                  );
                })}
              </ScrollView>

              {/* Save Button */}
              <View style={styles.footer}>
                <Button
                  variant="primary"
                  size="md"
                  loading={isSaving}
                  onPress={handleSave}
                  style={styles.saveButton}
                >
              {isSaving ? t('transactions:dailyCash.saving') : t('transactions:dailyCash.save')}
                </Button>
              </View>
            </>
          )}
        </Animated.View>
      </View>

      {/* Date Picker Modal */}
      {showDatePicker && (
        <Modal visible transparent animationType="fade">
          <TouchableWithoutFeedback onPress={() => setShowDatePicker(false)}>
            <View style={styles.pickerBackdrop}>
              <TouchableWithoutFeedback onPress={() => {}}>
                <View style={styles.pickerContainer}>
                  <Text style={styles.pickerTitle}>{t('transactions:dailyCash.selectDate')}</Text>
                  <DateTimePickerRN
                    value={ensureValidDate(date)}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    onChange={handleDateChange}
                    locale={locale}
                    textColor={colors.text}
                    themeVariant="light"
                    style={styles.datePicker}
                  />
                  <TouchableOpacity
                    style={styles.pickerDoneButton}
                    onPress={() => setShowDatePicker(false)}
                  >
                    <Text style={styles.pickerDoneText}>{t('common:buttons.done')}</Text>
                  </TouchableOpacity>
                </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </Modal>
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  cardContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  card: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    paddingTop: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  headerLeft: {
    flex: 1,
  },
  totalAmount: {
    color: colors.success,
    marginTop: spacing.xs,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  settingsButton: {
    padding: spacing.xs,
    borderRadius: borderRadius.sm,
  },
  settingsButtonActive: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.sm,
    padding: spacing.xs,
  },
  closeButton: {
    padding: spacing.xs,
  },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.primaryLight,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.md,
  },
  dateText: {
    color: colors.primary,
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing['3xl'],
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xl,
  },
  emptyTitle: {
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  emptyDescription: {
    marginBottom: spacing.xl,
  },
  emptyButton: {
    minWidth: 150,
  },
  scrollView: {
    flexGrow: 0,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  entryRow: {
    marginBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: spacing.md,
  },
  categoryCompact: {
    marginBottom: spacing.xs,
  },
  hesapAmountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  hesapInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: spacing.sm,
  },
  hesapIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hesapName: {
    fontWeight: '500',
    flex: 1,
  },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  settingsRowHidden: {
    opacity: 0.4,
  },
  hiddenText: {
    textDecorationLine: 'line-through',
  },
  amountInput: {
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    fontSize: 16,
    fontWeight: '600',
    color: colors.success,
    width: 120,
    textAlign: 'right',
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  saveButton: {
    width: '100%',
  },
  // Date Picker Modal Styles
  pickerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pickerContainer: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    width: '90%',
    maxWidth: 400,
  },
  pickerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  datePicker: {
    height: 200,
  },
  pickerDoneButton: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  pickerDoneText: {
    color: colors.white,
    fontWeight: '600',
    fontSize: 16,
  },
});
