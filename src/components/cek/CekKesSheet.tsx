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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Calendar,
  X,
  ChevronDown,
  Building2,
  Wallet,
  FileCheck,
  Search,
  Check,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';

import { Text, CategoryPicker } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { parseCurrency, formatCurrency, isValidAmount } from '@/lib/currency';
import { getCurrencySymbol } from '@/constants/currencies';
import { formatDateForDB, ensureValidDate, parseDateFromDB } from '@/lib/date';
import { useDateFormat } from '@/hooks/useDateFormat';
import { useHesaplar } from '@/hooks/useHesaplar';
import { useCariler } from '@/hooks/useCariler';
import { useCreateCek, useUpdateCek, useCek } from '@/hooks/useCekler';
import DateTimePickerRN from '@react-native-community/datetimepicker';
import { toErrorMessage } from '@/lib/errors';

export interface CekKesSheetProps {
  visible: boolean;
  onDismiss: () => void;
  defaultHesapId?: string;
  defaultCariId?: string;
  defaultCurrency?: string;
  onSuccess?: () => void;
  /** Edit mode: pass çek ID to edit an existing check */
  editCekId?: string;
}

export function CekKesSheet({
  visible,
  onDismiss,
  defaultHesapId,
  defaultCariId,
  defaultCurrency,
  onSuccess,
  editCekId,
}: CekKesSheetProps) {
  const { t } = useTranslation(['checks', 'common', 'clients', 'accounts', 'transactions']);
  const { formatDateMedium, locale } = useDateFormat();
  const insets = useSafeAreaInsets();

  // Form state
  const [cekNo, setCekNo] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [kesimTarihi, setKesimTarihi] = useState(new Date());
  const [vadeTarihi, setVadeTarihi] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d;
  });
  const [kategoriId, setKategoriId] = useState<string | null>(null);
  const [hesapId, setHesapId] = useState<string | null>(null);
  const [cariId, setCariId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Pickers
  const [showKesimDatePicker, setShowKesimDatePicker] = useState(false);
  const [showVadeDatePicker, setShowVadeDatePicker] = useState(false);
  const [showHesapPicker, setShowHesapPicker] = useState(false);
  const [showCariPicker, setShowCariPicker] = useState(false);

  // Search queries
  const [hesapSearchQuery, setHesapSearchQuery] = useState('');
  const [cariSearchQuery, setCariSearchQuery] = useState('');

  // Window dimensions
  const windowHeight = Dimensions.get('window').height;

  // Animation
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(100)).current;
  const isAnimatingRef = useRef(false);

  // Keyboard
  const keyboardHeightRef = useRef(0);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  // Data
  const { data: hesaplar } = useHesaplar();
  const { data: tedarikciCariler } = useCariler('tedarikci');
  const createCek = useCreateCek();
  const updateCek = useUpdateCek();
  const isEditMode = !!editCekId;
  const { data: editCekData } = useCek(isEditMode ? editCekId : undefined);

  // Refs
  const cekNoInputRef = useRef<TextInput>(null);

  // Determine the effective currency: selected cari's currency > defaultCurrency prop > 'TRY'
  const selectedCari = tedarikciCariler?.find(c => c.id === cariId);
  const effectiveCurrency = selectedCari?.currency || defaultCurrency || 'TRY';

  // Only bank accounts for checks, filtered by the effective currency
  const bankaHesaplari = useMemo(() => {
    return hesaplar?.filter(h => h.type === 'banka' && h.currency === effectiveCurrency) || [];
  }, [hesaplar, effectiveCurrency]);

  // Get selected entities
  const selectedHesap = bankaHesaplari.find(h => h.id === hesapId);

  // Filtered lists for search
  const filteredHesaplar = useMemo(() => {
    if (!hesapSearchQuery.trim()) return bankaHesaplari;
    const query = hesapSearchQuery.toLowerCase().trim();
    return bankaHesaplari.filter(h => h.name.toLowerCase().includes(query));
  }, [bankaHesaplari, hesapSearchQuery]);

  // Determine the selected hesap's currency for filtering cariler
  const selectedHesapCurrency = selectedHesap?.currency || defaultCurrency || null;

  const filteredCariler = useMemo(() => {
    if (!tedarikciCariler) return [];
    let filtered = tedarikciCariler;
    // Seçili hesabın döviz cinsine göre carileri filtrele
    if (selectedHesapCurrency) {
      filtered = filtered.filter(c => c.currency === selectedHesapCurrency);
    }
    if (!cariSearchQuery.trim()) return filtered;
    const query = cariSearchQuery.toLowerCase().trim();
    return filtered.filter(c => c.name.toLowerCase().includes(query));
  }, [tedarikciCariler, cariSearchQuery, selectedHesapCurrency]);

  // Keyboard listeners
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const handleShow = (e: KeyboardEvent) => {
      const height = e.endCoordinates.height;
      keyboardHeightRef.current = height;
      setKeyboardHeight(height);
      setIsKeyboardVisible(true);
    };

    const handleHide = () => {
      setIsKeyboardVisible(false);
    };

    const showSub = Keyboard.addListener(showEvent, handleShow);
    const hideSub = Keyboard.addListener(hideEvent, handleHide);

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // Reset state when modal closes
  useEffect(() => {
    if (!visible) {
      const timer = setTimeout(() => {
        setCekNo('');
        setAmount('');
        setDescription('');
        setKesimTarihi(new Date());
        const d = new Date();
        d.setDate(d.getDate() + 30);
        setVadeTarihi(d);
        setKategoriId(null);
        setHesapId(null);
        setCariId(null);
        setIsSaving(false);
        setHesapSearchQuery('');
        setCariSearchQuery('');
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [visible]);

  // Set defaults when modal opens (create mode only)
  useEffect(() => {
    if (visible && !isEditMode) {
      if (defaultHesapId) {
        setHesapId(defaultHesapId);
      } else if (bankaHesaplari.length > 0) {
        setHesapId(bankaHesaplari[0].id);
      }
      if (defaultCariId) {
        setCariId(defaultCariId);
      }
    }
  }, [visible, defaultHesapId, defaultCariId, bankaHesaplari, isEditMode]);

  // Populate form fields when editing
  const [editDataLoaded, setEditDataLoaded] = useState(false);
  useEffect(() => {
    if (visible && isEditMode && editCekData && !editDataLoaded) {
      setCekNo(editCekData.cek_no);
      setAmount(String(editCekData.tutar));
      setDescription(editCekData.aciklama || '');
      setKesimTarihi(parseDateFromDB(editCekData.kesim_tarihi));
      setVadeTarihi(parseDateFromDB(editCekData.vade_tarihi));
      setKategoriId(editCekData.kategori_id);
      setHesapId(editCekData.hesap_id);
      setCariId(editCekData.cari_id);
      setEditDataLoaded(true);
    }
  }, [visible, isEditMode, editCekData, editDataLoaded]);

  // Reset editDataLoaded when modal closes
  useEffect(() => {
    if (!visible) {
      setEditDataLoaded(false);
    }
  }, [visible]);

  // When effective currency changes (e.g. cari changed), reset hesap if it no longer matches
  useEffect(() => {
    if (!visible) return;
    // If the currently selected hesap is not in the filtered list, reset to first match
    if (hesapId && !bankaHesaplari.find(h => h.id === hesapId)) {
      setHesapId(bankaHesaplari.length > 0 ? bankaHesaplari[0].id : null);
    }
  }, [visible, effectiveCurrency, bankaHesaplari, hesapId]);

  // When hesap currency changes, reset cari if it no longer matches
  useEffect(() => {
    if (!visible || !selectedHesapCurrency || !cariId) return;
    const currentCari = tedarikciCariler?.find(c => c.id === cariId);
    if (currentCari && currentCari.currency !== selectedHesapCurrency) {
      setCariId(null);
    }
  }, [visible, selectedHesapCurrency, cariId, tedarikciCariler]);

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
      setTimeout(() => {
        cekNoInputRef.current?.focus();
      }, 100);
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

  // Handle save
  const handleSave = useCallback(async () => {
    if (!cekNo.trim()) {
      Alert.alert(t('common:status.error'), t('checks:validation.checkNoRequired'));
      return;
    }

    if (!isValidAmount(amount)) {
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
      Alert.alert(t('common:status.error'), t('checks:validation.amountRequired'));
      return;
    }

    if (!hesapId) {
      Alert.alert(t('common:status.error'), t('checks:validation.accountRequired'));
      return;
    }

    if (!cariId) {
      Alert.alert(t('common:status.error'), t('checks:validation.cariRequired'));
      return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const vade = new Date(vadeTarihi);
    vade.setHours(0, 0, 0, 0);
    if (vade < today) {
      Alert.alert(t('common:status.error'), t('checks:validation.dueDateFuture'));
      return;
    }

    setIsSaving(true);

    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }

    try {
      const parsedAmount = parseCurrency(amount);

      if (isEditMode && editCekId) {
        await updateCek.mutateAsync({
          id: editCekId,
          updates: {
            cek_no: cekNo.trim(),
            tutar: parsedAmount,
            kesim_tarihi: formatDateForDB(kesimTarihi),
            vade_tarihi: formatDateForDB(vadeTarihi),
            kategori_id: kategoriId,
            aciklama: description.trim() || null,
          },
        });
      } else {
        await createCek.mutateAsync({
          cek_no: cekNo.trim(),
          tutar: parsedAmount,
          hesap_id: hesapId,
          cari_id: cariId,
          kesim_tarihi: formatDateForDB(kesimTarihi),
          vade_tarihi: formatDateForDB(vadeTarihi),
          kategori_id: kategoriId,
          aciklama: description.trim() || null,
          scheduleReminder: true,
          reminderDaysBefore: 1,
          reminderTime: '09:00',
        });
      }

      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }

      Alert.alert(t('common:status.success'), isEditMode ? t('checks:messages.updateSuccess') : t('checks:messages.createSuccess'));
      onSuccess?.();
      handleDismiss();
    } catch (error) {
      if (__DEV__) {
        console.error('Cek create error:', error);
      }
      setIsSaving(false);
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
      Alert.alert(t('common:status.error'), toErrorMessage(error) || t('checks:messages.createFailed'));
    }
  }, [
    t,
    cekNo,
    amount,
    hesapId,
    cariId,
    kesimTarihi,
    vadeTarihi,
    kategoriId,
    description,
    createCek,
    onSuccess,
    handleDismiss,
  ]);

  const handleAmountChange = useCallback((text: string) => {
    const cleaned = text.replace(/[^0-9,.]/g, '');
    setAmount(cleaned);
  }, []);

  if (!visible) return null;

  // Position card above keyboard
  const cardBottom = keyboardHeight > 0 ? keyboardHeight : insets.bottom + 10;
  // Card max height - leave space at top
  const maxCardHeight = windowHeight - insets.top - 60 - cardBottom;

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent>
      {/* Backdrop */}
      <TouchableWithoutFeedback onPress={handleBackdropPress}>
        <View style={styles.backdrop} />
      </TouchableWithoutFeedback>

      {/* Card */}
      <Animated.View
        style={[
          styles.card,
          {
            bottom: cardBottom,
            maxHeight: maxCardHeight,
            opacity,
            transform: [{ translateY }],
          },
        ]}
      >
        {/* Header */}
        <View style={styles.headerRow}>
          <View style={styles.titleRow}>
            <FileCheck size={20} color={colors.info} />
            <Text variant="h3">{isEditMode ? t('checks:editTitle') : t('checks:createTitle')}</Text>
          </View>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={handleDismiss}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <X size={20} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        {/* Scrollable Content */}
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={true}
          keyboardShouldPersistTaps="handled"
          bounces={false}
        >
          {/* Row 1: Çek No + Tutar */}
          <View style={styles.row}>
            <View style={styles.halfColumn}>
              <Text variant="caption" color="secondary">{t('checks:labels.checkNo')}</Text>
              <TextInput
                ref={cekNoInputRef}
                style={styles.input}
                value={cekNo}
                onChangeText={setCekNo}
                placeholder="ABC 123456"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="characters"
              />
            </View>
            <View style={styles.halfColumn}>
              <Text variant="caption" color="secondary">{t('checks:labels.amount')}</Text>
              <View style={styles.amountContainer}>
                <Text style={styles.currencySymbol}>{getCurrencySymbol(effectiveCurrency)}</Text>
                <TextInput
                  style={styles.amountInput}
                  value={amount}
                  onChangeText={handleAmountChange}
                  placeholder="0,00"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="decimal-pad"
                />
              </View>
            </View>
          </View>

          {/* Row 2: Hesap + Cari */}
          <View style={styles.row}>
            <View style={styles.halfColumn}>
              <Text variant="caption" color="secondary">{t('checks:labels.account')}</Text>
              <TouchableOpacity style={styles.pickerBtn} onPress={() => setShowHesapPicker(true)}>
                <Wallet size={14} color={colors.textMuted} />
                <Text style={styles.pickerText} numberOfLines={1}>
                  {selectedHesap?.name || t('accounts:titles.selectAccount')}
                </Text>
                <ChevronDown size={14} color={colors.info} />
              </TouchableOpacity>
            </View>
            <View style={styles.halfColumn}>
              <Text variant="caption" color="secondary">{t('checks:labels.cari')}</Text>
              <TouchableOpacity style={styles.pickerBtn} onPress={() => setShowCariPicker(true)}>
                <Building2 size={14} color={colors.orange} />
                <Text style={styles.pickerText} numberOfLines={1}>
                  {selectedCari?.name || t('clients:transactionForm.selectSupplier')}
                </Text>
                <ChevronDown size={14} color={colors.info} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Row 3: Tarihler */}
          <View style={styles.row}>
            <View style={styles.halfColumn}>
              <Text variant="caption" color="secondary">{t('checks:labels.issueDate')}</Text>
              <TouchableOpacity style={styles.dateBtn} onPress={() => setShowKesimDatePicker(true)}>
                <Calendar size={14} color={colors.textMuted} />
                <Text style={styles.dateText}>{formatDateMedium(kesimTarihi)}</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.halfColumn}>
              <Text variant="caption" color="secondary">{t('checks:labels.dueDate')}</Text>
              <TouchableOpacity style={[styles.dateBtn, styles.vadeDateBtn]} onPress={() => setShowVadeDatePicker(true)}>
                <Calendar size={14} color={colors.warning} />
                <Text style={[styles.dateText, styles.vadeDateText]}>{formatDateMedium(vadeTarihi)}</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Kategori */}
          <View style={styles.inputGroup}>
            <CategoryPicker
              value={kategoriId}
              onChange={(id: string | null) => setKategoriId(id)}
              type="gider"
              placeholder={t('checks:labels.categoryPlaceholder')}
              optional
              onNavigateAway={handleDismiss}
            />
          </View>

          {/* Açıklama */}
          <View style={styles.inputGroup}>
            <Text variant="caption" color="secondary">{t('checks:labels.description')}</Text>
            <TextInput
              style={[styles.input, styles.descInput]}
              value={description}
              onChangeText={setDescription}
              placeholder={t('checks:labels.descriptionPlaceholder')}
              placeholderTextColor={colors.textMuted}
              multiline
              numberOfLines={2}
            />
          </View>
        </ScrollView>

        {/* Save Button - Fixed at bottom */}
        <View style={styles.saveContainer}>
          <TouchableOpacity
            style={[styles.saveBtn, isSaving && styles.saveBtnDisabled]}
            onPress={handleSave}
            disabled={isSaving}
            activeOpacity={0.8}
          >
            <FileCheck size={18} color={colors.surface} />
            <Text style={styles.saveBtnText}>
              {isSaving ? t('common:status.loading') : isEditMode ? t('common:buttons.save') : t('checks:actions.create')}
            </Text>
          </TouchableOpacity>
        </View>
      </Animated.View>

      {/* Kesim Tarihi Picker Modal */}
      {showKesimDatePicker && (
        <Modal visible transparent animationType="fade">
          <TouchableWithoutFeedback onPress={() => setShowKesimDatePicker(false)}>
            <View style={styles.datePickerBackdrop}>
              <TouchableWithoutFeedback onPress={() => {}}>
                <View style={styles.datePickerContainer}>
                  <Text style={styles.datePickerTitle}>{t('checks:labels.issueDate')}</Text>

                  <View style={styles.datePickerSection}>
                    <DateTimePickerRN
                      value={ensureValidDate(kesimTarihi)}
                      mode="date"
                      display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                      onChange={(event, selectedDate) => {
                        if (Platform.OS === 'android') {
                          setShowKesimDatePicker(false);
                          if (event.type === 'set' && selectedDate) {
                            setKesimTarihi(selectedDate);
                          }
                        } else if (selectedDate) {
                          setKesimTarihi(selectedDate);
                        }
                      }}
                      locale={locale}
                      textColor={colors.text}
                      themeVariant="light"
                      style={styles.datePickerStyle}
                    />
                  </View>

                  <TouchableOpacity
                    style={styles.datePickerDoneBtn}
                    onPress={() => setShowKesimDatePicker(false)}
                  >
                    <Text style={styles.datePickerDoneText}>{t('common:buttons.done')}</Text>
                  </TouchableOpacity>
                </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </Modal>
      )}

      {/* Vade Tarihi Picker Modal */}
      {showVadeDatePicker && (
        <Modal visible transparent animationType="fade">
          <TouchableWithoutFeedback onPress={() => setShowVadeDatePicker(false)}>
            <View style={styles.datePickerBackdrop}>
              <TouchableWithoutFeedback onPress={() => {}}>
                <View style={styles.datePickerContainer}>
                  <Text style={[styles.datePickerTitle, { color: colors.warning }]}>{t('checks:labels.dueDate')}</Text>

                  <View style={styles.datePickerSection}>
                    <DateTimePickerRN
                      value={ensureValidDate(vadeTarihi)}
                      mode="date"
                      display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                      minimumDate={new Date()}
                      onChange={(event, selectedDate) => {
                        if (Platform.OS === 'android') {
                          setShowVadeDatePicker(false);
                          if (event.type === 'set' && selectedDate) {
                            setVadeTarihi(selectedDate);
                          }
                        } else if (selectedDate) {
                          setVadeTarihi(selectedDate);
                        }
                      }}
                      locale={locale}
                      textColor={colors.text}
                      themeVariant="light"
                      style={styles.datePickerStyle}
                    />
                  </View>

                  <TouchableOpacity
                    style={[styles.datePickerDoneBtn, { backgroundColor: colors.warning }]}
                    onPress={() => setShowVadeDatePicker(false)}
                  >
                    <Text style={styles.datePickerDoneText}>{t('common:buttons.done')}</Text>
                  </TouchableOpacity>
                </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </Modal>
      )}

      {/* Hesap Picker Modal */}
      {showHesapPicker && (
        <Modal visible transparent animationType="slide" onRequestClose={() => { setShowHesapPicker(false); setHesapSearchQuery(''); }}>
          <TouchableWithoutFeedback onPress={() => { setShowHesapPicker(false); setHesapSearchQuery(''); }}>
            <View style={styles.bottomSheetOverlay}>
              <TouchableWithoutFeedback onPress={() => {}}>
                <View style={[styles.bottomSheetContent, { height: windowHeight * 0.5, paddingBottom: insets.bottom }]}>
                  <View style={styles.bottomSheetHeader}>
                    <Text style={styles.bottomSheetTitle}>{t('checks:form.selectAccount')}</Text>
                    <TouchableOpacity onPress={() => { setShowHesapPicker(false); setHesapSearchQuery(''); }} style={styles.bottomSheetCloseBtn}>
                      <X size={24} color={colors.text} />
                    </TouchableOpacity>
                  </View>
                  <View style={styles.searchContainer}>
                    <Search size={20} color={colors.textMuted} />
                    <TextInput
                      style={styles.searchInput}
                      value={hesapSearchQuery}
                      onChangeText={setHesapSearchQuery}
                      placeholder={t('common:search.searchPlaceholder')}
                      placeholderTextColor={colors.textMuted}
                      autoCorrect={false}
                    />
                    {hesapSearchQuery.length > 0 && (
                      <TouchableOpacity onPress={() => setHesapSearchQuery('')}>
                        <X size={18} color={colors.textMuted} />
                      </TouchableOpacity>
                    )}
                  </View>
                  <ScrollView style={styles.bottomSheetList} contentContainerStyle={styles.bottomSheetListContent} keyboardShouldPersistTaps="handled">
                    {filteredHesaplar.length === 0 ? (
                      <View style={styles.emptyState}>
                        <Wallet size={48} color={colors.textMuted} />
                        <Text style={styles.emptyText}>{t('accounts:messages.noAccounts')}</Text>
                      </View>
                    ) : (
                      filteredHesaplar.map((hesap) => {
                        const isSelected = hesap.id === hesapId;
                        return (
                          <TouchableOpacity
                            key={hesap.id}
                            style={[styles.bottomSheetItem, isSelected && styles.bottomSheetItemSelected]}
                            onPress={() => {
                              setHesapId(hesap.id);
                              setShowHesapPicker(false);
                              setHesapSearchQuery('');
                            }}
                          >
                            <View style={[styles.bottomSheetItemIcon, { backgroundColor: colors.infoLight }]}>
                              <Wallet size={20} color={colors.info} />
                            </View>
                            <Text style={[styles.bottomSheetItemText, isSelected && { color: colors.primary }]}>{hesap.name}</Text>
                            <Text style={[styles.bottomSheetItemBalance, isSelected && { color: colors.primary }]}>{formatCurrency(hesap.balance, hesap.currency)}</Text>
                            {isSelected && (
                              <View style={[styles.checkIcon, { backgroundColor: colors.info }]}>
                                <Check size={14} color="#FFFFFF" />
                              </View>
                            )}
                          </TouchableOpacity>
                        );
                      })
                    )}
                  </ScrollView>
                </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </Modal>
      )}

      {/* Cari Picker Modal - Bottom Sheet (same as QuickTransactionBar) */}
      {showCariPicker && (
        <Modal visible transparent animationType="slide" onRequestClose={() => { setShowCariPicker(false); setCariSearchQuery(''); }}>
          <TouchableWithoutFeedback onPress={() => { setShowCariPicker(false); setCariSearchQuery(''); }}>
            <View style={styles.bottomSheetOverlay}>
              <TouchableWithoutFeedback onPress={() => {}}>
                <View style={[styles.bottomSheetContent, { height: windowHeight * 0.7, paddingBottom: insets.bottom }]}>
                  <View style={styles.bottomSheetHeader}>
                    <Text style={styles.bottomSheetTitle}>{t('clients:transactionForm.selectSupplier')}</Text>
                    <TouchableOpacity onPress={() => { setShowCariPicker(false); setCariSearchQuery(''); }} style={styles.bottomSheetCloseBtn}>
                      <X size={24} color={colors.text} />
                    </TouchableOpacity>
                  </View>

                  {/* Search Bar */}
                  <View style={styles.searchContainer}>
                    <Search size={20} color={colors.textMuted} />
                    <TextInput
                      style={styles.searchInput}
                      placeholder={t('clients:search.searchSuppliers')}
                      placeholderTextColor={colors.textMuted}
                      value={cariSearchQuery}
                      onChangeText={setCariSearchQuery}
                      autoCorrect={false}
                    />
                    {cariSearchQuery.length > 0 && (
                      <TouchableOpacity onPress={() => setCariSearchQuery('')}>
                        <X size={18} color={colors.textMuted} />
                      </TouchableOpacity>
                    )}
                  </View>

                  <ScrollView style={styles.bottomSheetList} contentContainerStyle={styles.bottomSheetListContent} keyboardShouldPersistTaps="handled">
                    {filteredCariler.map((cari) => {
                      const isSelected = cariId === cari.id;
                      return (
                        <TouchableOpacity
                          key={cari.id}
                          style={[styles.bottomSheetItem, isSelected && styles.bottomSheetItemSelected]}
                          onPress={() => {
                            setCariId(cari.id);
                            setShowCariPicker(false);
                            setCariSearchQuery('');
                          }}
                        >
                          <View style={[styles.bottomSheetItemIcon, { backgroundColor: colors.orangeLight }]}>
                            <Building2 size={20} color={colors.orange} />
                          </View>
                          <Text style={[styles.bottomSheetItemText, isSelected && { color: colors.primary }]}>{cari.name}</Text>
                          <Text style={[styles.bottomSheetItemBalance, isSelected && { color: colors.primary }]}>{formatCurrency(cari.balance, cari.currency)}</Text>
                          {isSelected && (
                            <View style={[styles.checkIcon, { backgroundColor: colors.orange }]}>
                              <Check size={14} color="#FFFFFF" />
                            </View>
                          )}
                        </TouchableOpacity>
                      );
                    })}
                    {filteredCariler.length === 0 && cariSearchQuery.trim() && (
                      <View style={styles.emptySearchState}>
                        <Search size={48} color={colors.textMuted} />
                        <Text style={styles.emptySearchText}>{t('common:search.noResults')}</Text>
                      </View>
                    )}
                    {filteredCariler.length === 0 && !cariSearchQuery.trim() && (
                      <View style={styles.emptySearchState}>
                        <Building2 size={48} color={colors.textMuted} />
                        <Text style={styles.emptySearchText}>{t('clients:messages.noSuppliers')}</Text>
                      </View>
                    )}
                  </ScrollView>
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
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  card: {
    position: 'absolute',
    left: 12,
    right: 12,
    backgroundColor: colors.surface,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 16,
    overflow: 'hidden',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  closeButton: {
    padding: 4,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 8,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  halfColumn: {
    flex: 1,
  },
  inputGroup: {
    marginBottom: 12,
  },
  input: {
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.text,
    marginTop: 4,
  },
  descInput: {
    minHeight: 50,
    textAlignVertical: 'top',
  },
  amountContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.md,
    paddingHorizontal: 12,
    marginTop: 4,
  },
  currencySymbol: {
    fontSize: 16,
    color: colors.textSecondary,
    marginRight: 4,
  },
  amountInput: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    paddingVertical: 10,
  },
  pickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 4,
    gap: 6,
  },
  pickerText: {
    flex: 1,
    fontSize: 14,
    color: colors.text,
  },
  dateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 4,
    gap: 6,
  },
  vadeDateBtn: {
    backgroundColor: colors.warningLight,
  },
  dateText: {
    fontSize: 14,
    color: colors.text,
  },
  vadeDateText: {
    color: colors.warning,
    fontWeight: '600',
  },
  saveContainer: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.info,
    borderRadius: borderRadius.lg,
    paddingVertical: 14,
    gap: spacing.sm,
  },
  saveBtnDisabled: {
    opacity: 0.6,
  },
  saveBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.surface,
  },
  // Date Picker Modal Styles
  datePickerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  datePickerContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    marginHorizontal: 20,
    minWidth: 300,
  },
  datePickerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
    marginBottom: 16,
  },
  datePickerSection: {
    marginBottom: 8,
  },
  datePickerStyle: {
    height: 150,
  },
  datePickerDoneBtn: {
    marginTop: 16,
    backgroundColor: colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 10,
    alignItems: 'center',
  },
  datePickerDoneText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  // Bottom Sheet Styles
  bottomSheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  bottomSheetContent: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  bottomSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  bottomSheetTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  bottomSheetCloseBtn: {
    padding: 4,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceLight,
    borderRadius: 12,
    marginHorizontal: 16,
    marginVertical: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: colors.text,
    paddingVertical: 4,
  },
  bottomSheetList: {
    flex: 1,
  },
  bottomSheetListContent: {
    padding: 12,
    paddingBottom: 24,
  },
  bottomSheetItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: colors.surfaceLighter,
    borderRadius: 12,
    marginBottom: 8,
  },
  bottomSheetItemSelected: {
    backgroundColor: colors.primaryLight + '30',
    borderWidth: 1,
    borderColor: colors.primary,
  },
  bottomSheetItemSelectedOrange: {
    backgroundColor: colors.orangeLight + '30',
    borderWidth: 1,
    borderColor: colors.orange,
  },
  bottomSheetItemIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  bottomSheetItemContent: {
    flex: 1,
  },
  bottomSheetItemText: {
    flex: 1,
    fontSize: 16,
    color: colors.text,
  },
  bottomSheetItemBalance: {
    fontSize: 16,
    color: colors.textSecondary,
    marginRight: 8,
  },
  bottomSheetItemSubtext: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 2,
  },
  checkIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
  },
  emptyText: {
    fontSize: 15,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 12,
  },
  emptySearchState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
  },
  emptySearchText: {
    fontSize: 15,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 12,
  },
});
