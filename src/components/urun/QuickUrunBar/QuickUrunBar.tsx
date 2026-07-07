import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Modal,
  Animated,
  TouchableOpacity,
  TouchableWithoutFeedback,
  TextInput,
  Keyboard,
  KeyboardEvent,
  Alert,
  ActivityIndicator,
  Text as RNText,
  Platform,
  StyleSheet,
  ScrollView,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import * as Haptics from 'expo-haptics';
import DateTimePickerRN from '@react-native-community/datetimepicker';
import { X, Package, Calendar } from 'lucide-react-native';
import { colors } from '@/constants/colors';
import { TAB_BAR_HEIGHT } from '@/constants/spacing';
import { useCreateUrunHareket, useUpdateUrunHareket, useCreateUrunHareketWithCari, useSetUrunMiktarHedef } from '@/hooks/useUrunHareketler';
import { useDateFormat } from '@/hooks/useDateFormat';
import { Urun, BirimType, KdvOrani } from '@/types/database';
import { styles } from './styles';
import { CariLinkSection } from './CariLinkSection';
import { toErrorMessage } from '@/lib/errors';
import { formatDateTimeForDB, ensureValidDate, parseDateFromDB } from '@/lib/date';
import { useSettings } from '@/hooks/useSettings';
import { getCurrencySymbol } from '@/constants/currencies';

import { formatCurrency, formatQuantity, formatAmountForInput, parseQuantity, parseCurrency } from '@/lib/currency';

const KDV_ORANLARI: KdvOrani[] = [0, 1, 10, 20];

type UrunType = 'giris' | 'cikis' | 'duzeltme';

interface QuickUrunBarProps {
  visible: boolean;
  onDismiss: () => void;
  urun: Urun | null;
  defaultType?: UrunType;
  // Edit mode props
  mode?: 'create' | 'edit';
  editHareketId?: string;
  editInitialValues?: {
    miktar: number;
    birimFiyat: number | null;
    urunType: UrunType;
    date?: string; // Hareketin mevcut iş tarihi (created_at) — edit formuna yüklenir
  };
}

export function QuickUrunBar({
  visible,
  onDismiss,
  urun,
  defaultType = 'giris',
  mode = 'create',
  editHareketId,
  editInitialValues,
}: QuickUrunBarProps) {
  const { t } = useTranslation(['products', 'common', 'errors']);
  const { currency } = useSettings();
  const createUrunHareket = useCreateUrunHareket();
  const updateUrunHareket = useUpdateUrunHareket();
  const createUrunHareketWithCari = useCreateUrunHareketWithCari();
  const setUrunMiktarHedef = useSetUrunMiktarHedef();
  const isEditMode = mode === 'edit' && editHareketId;
  const { formatDateMedium, locale } = useDateFormat();
  const insets = useSafeAreaInsets();

  // Refs
  const amountInputRef = useRef<TextInput>(null);

  // Animation values
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(100)).current;

  // Form state
  const [urunType, setUrunType] = useState<UrunType>(defaultType);
  const [miktar, setMiktar] = useState('');
  const [birimFiyat, setBirimFiyat] = useState('');
  const [tarih, setTarih] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);

  // Cari link state
  const [cariLinkEnabled, setCariLinkEnabled] = useState(false);
  const [selectedCariId, setSelectedCariId] = useState<string | null>(null);
  const [kdvOrani, setKdvOrani] = useState<KdvOrani>((urun?.kdv_orani ?? 0) as KdvOrani);

  // Calculated totals for cari link display
  const cariTotals = useMemo(() => {
    const miktarNum = parseQuantity(miktar || '0');
    const fiyatNum = parseCurrency(birimFiyat || '0');
    if (isNaN(miktarNum) || isNaN(fiyatNum) || miktarNum <= 0 || fiyatNum <= 0) {
      return null;
    }
    const subtotal = miktarNum * fiyatNum;
    const kdvAmount = subtotal * (kdvOrani / 100);
    const total = subtotal + kdvAmount;
    return {
      subtotal: formatCurrency(subtotal, currency),
      total: formatCurrency(total, currency),
      kdv: kdvAmount > 0 ? formatCurrency(kdvAmount, currency) : null,
    };
  }, [miktar, birimFiyat, kdvOrani, currency]);

  // Keyboard state
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  // Keyboard tracking (like QuickTransactionBar)
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const handleShow = (e: KeyboardEvent) => {
      const height = e.endCoordinates.height;
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

  // Helper to get price based on urun type
  const getPriceForType = useCallback((type: UrunType) => {
    if (!urun) return '';
    const price = type === 'giris' ? urun.alis_fiyati : urun.satis_fiyati;
    return price > 0 ? formatAmountForInput(price) : '';
  }, [urun]);

  // Animate in/out
  useEffect(() => {
    if (visible) {
      // Reset form - use edit values if in edit mode
      if (isEditMode && editInitialValues) {
        setUrunType(editInitialValues.urunType);
        setMiktar(formatAmountForInput(editInitialValues.miktar));
        setBirimFiyat(editInitialValues.birimFiyat != null ? formatAmountForInput(editInitialValues.birimFiyat) : '');
      } else {
        setUrunType(defaultType);
        setMiktar('');
        // Auto-fill price based on urun type
        setBirimFiyat(getPriceForType(defaultType));
      }
      // Edit modunda hareketin mevcut tarihini yükle (yoksa bugün); böylece "düzelt"te
      // tarih görünür ve değiştirilebilir.
      setTarih(isEditMode && editInitialValues?.date ? parseDateFromDB(editInitialValues.date) : new Date());
      setShowDatePicker(false);
      setCariLinkEnabled(false);
      setSelectedCariId(null);
      setKdvOrani((urun?.kdv_orani ?? 0) as KdvOrani);

      // Animate in
      opacity.setValue(0);
      translateY.setValue(100);

      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start(() => {
        // Focus input after animation
        setTimeout(() => amountInputRef.current?.focus(), 100);
      });
    }
    // visible=false: kapanış animasyonu handleDismiss içinde oynatılır (burada no-op).
    // Modal visible={visible} olduğundan, çıkış animasyonu BİTMEDEN parent visible=false
    // yapmaz (handleDismiss .start callback'inde onDismiss çağırır) → animasyon görünür.
  }, [visible, defaultType, opacity, translateY]);

  const getBirimLabel = (birim: BirimType) => {
    return t(`products:units.${birim}`);
  };

  const handleDismiss = useCallback(() => {
    Keyboard.dismiss();
    setShowDatePicker(false);
    // Kapanış animasyonunu oynat; BİTİNCE onDismiss → parent visible=false → unmount.
    // (Kardeş QuickTransactionBar ile aynı desen; sert anlık kapanış yerine akıcı çıkış.)
    Animated.parallel([
      Animated.timing(opacity, { toValue: 0, duration: 150, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 100, duration: 200, useNativeDriver: true }),
    ]).start(() => {
      onDismiss();
    });
  }, [onDismiss, opacity, translateY]);

  const handleBackdropPress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    // If date picker is open, close it first
    if (showDatePicker) {
      setShowDatePicker(false);
      return;
    }

    // If keyboard is open, close keyboard first
    if (isKeyboardVisible) {
      Keyboard.dismiss();
      return;
    }

    // Otherwise close the bar (animasyonlu)
    handleDismiss();
  }, [isKeyboardVisible, showDatePicker, handleDismiss]);

  const handleDateChange = useCallback(
    (event: { type: string }, selectedDate?: Date) => {
      if (Platform.OS === 'android') {
        setShowDatePicker(false);
        if (event.type === 'set' && selectedDate) {
          setTarih(selectedDate);
        }
      } else if (selectedDate) {
        setTarih(selectedDate);
      }
    },
    []
  );

  const handleSave = async () => {
    if (!urun) return;

    const miktarNum = parseQuantity(miktar);

    if (urunType === 'duzeltme') {
      // Düzeltmede miktar = yeni MUTLAK hedef stok (0 veya pozitif olabilir)
      if (!miktar || isNaN(miktarNum) || miktarNum < 0) {
        Alert.alert(t('common:status.error'), t('products:validation.quantityRequired'));
        return;
      }
      try {
        // Delta'yı BAYAT cache'ten (hedef − urun.miktar) hesaplamak yerine DB'de
        // FOR UPDATE ile hesapla → çok-cihaz senaryosunda stok yanlışa kaymasın.
        // Hedef zaten güncelse RPC hareket yazmadan mevcut değeri döner.
        await setUrunMiktarHedef.mutateAsync({
          urun_id: urun.id,
          hedef: miktarNum,
          created_at: formatDateTimeForDB(tarih),
          aciklama: null,
        });
        handleDismiss();
        Alert.alert(t('common:status.success'), t('products:messages.stockAdjustmentSuccess'));
      } catch (error) {
        Alert.alert(t('common:status.error'), toErrorMessage(error) || t('errors:general.tryAgain'));
      }
      return;
    }

    if (!miktar || isNaN(miktarNum) || miktarNum <= 0) {
      Alert.alert(t('common:status.error'), t('products:validation.quantityPositive'));
      return;
    }

    const fiyatNum = birimFiyat ? parseCurrency(birimFiyat) : null;

    try {
      if (isEditMode && editHareketId) {
        // Update existing movement
        await updateUrunHareket.mutateAsync({
          id: editHareketId,
          miktar: miktarNum,
          birim_fiyat: fiyatNum,
          hareket_tipi: urunType,
          created_at: formatDateTimeForDB(tarih),
        });

        handleDismiss();
        Alert.alert(
          t('common:status.success'),
          t('products:messages.stockUpdated')
        );
      } else if (cariLinkEnabled && selectedCariId && fiyatNum && fiyatNum > 0) {
        // Create with cari linkage
        await createUrunHareketWithCari.mutateAsync({
          urun_id: urun.id,
          urun_ad: urun.ad,
          hareket_tipi: urunType as 'giris' | 'cikis',
          miktar: miktarNum,
          birim_fiyat: fiyatNum,
          kdv_orani: kdvOrani,
          cari_id: selectedCariId,
          date: formatDateTimeForDB(tarih),
        });

        handleDismiss();
        Alert.alert(
          t('common:status.success'),
          t('products:cariLink.successSingle')
        );
      } else {
        // Create new movement (without cari)
        await createUrunHareket.mutateAsync({
          urun_id: urun.id,
          hareket_tipi: urunType,
          miktar: miktarNum,
          birim_fiyat: fiyatNum,
          aciklama: null,
          created_at: formatDateTimeForDB(tarih),
        });

        handleDismiss();
        Alert.alert(
          t('common:status.success'),
          urunType === 'giris'
            ? t('products:messages.stockInSuccess')
            : t('products:messages.stockOutSuccess')
        );
      }
    } catch (error) {
      Alert.alert(t('common:status.error'), toErrorMessage(error) || t('errors:general.tryAgain'));
    }
  };

  if (!urun) return null;

  const miktarNum = parseQuantity(miktar);
  const isValidAmount = urunType === 'duzeltme'
    ? !isNaN(miktarNum) && miktarNum >= 0
    : !isNaN(miktarNum) && miktarNum > 0;
  const isPending = createUrunHareket.isPending || updateUrunHareket.isPending || createUrunHareketWithCari.isPending;

  // Position card above keyboard (like QuickTransactionBar)
  const cardBottom = keyboardHeight > 0
    ? keyboardHeight
    : insets.bottom + TAB_BAR_HEIGHT + 10;

  // Constrain card height so it never overflows above the screen
  const screenHeight = Dimensions.get('window').height;
  const cardMaxHeight = screenHeight - cardBottom - insets.top - 20;

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent>
      {/* Backdrop - tap to dismiss keyboard */}
      <TouchableWithoutFeedback onPress={handleBackdropPress}>
        <View style={styles.backdrop} />
      </TouchableWithoutFeedback>

      {/* Card - absolutely positioned above keyboard */}
      <Animated.View
        style={[
          styles.card,
          {
            bottom: cardBottom,
            maxHeight: cardMaxHeight,
            opacity: opacity,
            transform: [{ translateY: translateY }],
          },
        ]}
      >
        {/* Header: Urun Info + Close (pinned top) */}
        <View style={styles.header}>
          <View style={styles.urunInfo}>
            <View style={styles.urunIcon}>
              <Package size={20} color={colors.primary} />
            </View>
            <View style={styles.urunDetails}>
              <RNText style={styles.urunName} numberOfLines={1}>
                {urun.ad}
              </RNText>
              <RNText style={styles.urunStock}>
                {t('products:stock.currentStock')}: {formatQuantity(urun.miktar)} {getBirimLabel(urun.birim)}
              </RNText>
            </View>
          </View>
          <TouchableOpacity onPress={handleDismiss} style={styles.closeButton}>
            <X size={22} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        {/* Scrollable content area */}
        <ScrollView
          bounces={false}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Date Picker Button */}
          <TouchableOpacity
            style={styles.dateButton}
            onPress={() => {
              Keyboard.dismiss();
              setShowDatePicker(true);
            }}
          >
            <Calendar size={18} color={colors.textSecondary} />
            <RNText style={styles.dateText}>{formatDateMedium(tarih)}</RNText>
          </TouchableOpacity>

          {/* Amount Input Row */}
          <View style={styles.inputRow}>
            <View style={styles.amountInputContainer}>
              <TextInput
                ref={amountInputRef}
                style={styles.amountInput}
                value={miktar}
                onChangeText={setMiktar}
                placeholder={urunType === 'duzeltme'
                  ? `${t('products:stock.currentStock')}: ${formatQuantity(urun.miktar)}`
                  : t('products:stock.quantity')}
                placeholderTextColor={colors.textMuted}
                keyboardType="decimal-pad"
                returnKeyType={urunType === 'duzeltme' ? 'done' : 'next'}
                onSubmitEditing={urunType === 'duzeltme' ? handleSave : undefined}
              />
            </View>
            <RNText style={styles.unitLabel}>{getBirimLabel(urun.birim)}</RNText>
          </View>

          {/* Price Input Row (hidden for adjustment) */}
          {urunType !== 'duzeltme' && (
            <View style={styles.inputRow}>
              <View style={styles.amountInputContainer}>
                <TextInput
                  style={styles.priceInput}
                  value={birimFiyat}
                  onChangeText={setBirimFiyat}
                  placeholder={`${t('products:stock.unitPrice')} (${t('common:labels.optional')})`}
                  placeholderTextColor={colors.textMuted}
                  keyboardType="decimal-pad"
                  returnKeyType="done"
                  onSubmitEditing={handleSave}
                />
              </View>
              <RNText style={styles.unitLabel}>{getCurrencySymbol(currency)}</RNText>
            </View>
          )}

          {/* Cari Link Section (hidden for adjustment and edit mode) */}
          {urunType !== 'duzeltme' && !isEditMode && (
            <>
              <CariLinkSection
                enabled={cariLinkEnabled}
                onToggle={(val) => {
                  setCariLinkEnabled(val);
                  if (!val) setSelectedCariId(null);
                }}
                selectedCariId={selectedCariId}
                onSelectCari={setSelectedCariId}
                hareketTipi={urunType as 'giris' | 'cikis'}
                subtotalDisplay={cariTotals?.subtotal}
                totalDisplay={cariTotals?.total}
                kdvDisplay={cariTotals?.kdv ?? undefined}
              />
              {cariLinkEnabled && (
                <View style={kdvStyles.row}>
                  <RNText style={kdvStyles.label}>{t('common:currency.vat')}:</RNText>
                  {KDV_ORANLARI.map((rate) => {
                    const isActive = kdvOrani === rate;
                    const accentColor = urunType === 'giris' ? colors.primary : colors.error;
                    const lightColor = urunType === 'giris' ? colors.primaryLight : colors.errorLight;
                    return (
                      <TouchableOpacity
                        key={rate}
                        style={[
                          kdvStyles.chip,
                          isActive && { backgroundColor: lightColor },
                        ]}
                        onPress={() => setKdvOrani(rate)}
                      >
                        <RNText
                          style={[
                            kdvStyles.chipText,
                            isActive && { color: accentColor, fontWeight: '700' },
                          ]}
                        >
                          %{rate}
                        </RNText>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </>
          )}

          {/* Save Button */}
          <TouchableOpacity
            style={[
              styles.saveButton,
              urunType === 'giris' ? styles.saveButtonGiris : urunType === 'cikis' ? styles.saveButtonCikis : styles.saveButtonDuzeltme,
              (!isValidAmount || isPending) && styles.saveButtonDisabled,
            ]}
            onPress={handleSave}
            disabled={!isValidAmount || isPending}
          >
            {isPending ? (
              <ActivityIndicator size="small" color={colors.white} />
            ) : (
              <RNText style={styles.saveButtonText}>
                {isEditMode ? t('common:buttons.update') : t('common:buttons.save')}
              </RNText>
            )}
          </TouchableOpacity>
        </ScrollView>

        {/* Tabs: Ürün Giriş / Ürün Çıkış / Düzeltme (pinned bottom) */}
        <View style={styles.tabs}>
          <TouchableOpacity
            style={[
              styles.tab,
              urunType === 'giris' && styles.tabGiris,
            ]}
            onPress={() => {
              setUrunType('giris');
              if (!isEditMode) {
                setBirimFiyat(getPriceForType('giris'));
                setKdvOrani((urun?.kdv_orani ?? 0) as KdvOrani);
              }
              setCariLinkEnabled(false);
              setSelectedCariId(null);
            }}
            activeOpacity={0.7}
          >
            <RNText
              style={[
                styles.tabText,
                urunType === 'giris' && styles.tabTextGiris,
              ]}
            >
              {t('products:stock.stockIn')}
            </RNText>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.tab,
              urunType === 'cikis' && styles.tabCikis,
            ]}
            onPress={() => {
              setUrunType('cikis');
              if (!isEditMode) {
                setBirimFiyat(getPriceForType('cikis'));
                setKdvOrani((urun?.kdv_orani ?? 0) as KdvOrani);
              }
              setCariLinkEnabled(false);
              setSelectedCariId(null);
            }}
            activeOpacity={0.7}
          >
            <RNText
              style={[
                styles.tabText,
                urunType === 'cikis' && styles.tabTextCikis,
              ]}
            >
              {t('products:stock.stockOut')}
            </RNText>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.tab,
              urunType === 'duzeltme' && styles.tabDuzeltme,
            ]}
            onPress={() => {
              setUrunType('duzeltme');
              setBirimFiyat('');
              setCariLinkEnabled(false);
              setSelectedCariId(null);
            }}
            activeOpacity={0.7}
          >
            <RNText
              style={[
                styles.tabText,
                urunType === 'duzeltme' && styles.tabTextDuzeltme,
              ]}
            >
              {t('products:stock.adjustment')}
            </RNText>
          </TouchableOpacity>
        </View>
      </Animated.View>

      {/* Date Picker Modal (iOS) / Inline (Android) */}
      {showDatePicker && Platform.OS === 'ios' && (
        <Modal visible transparent animationType="fade">
          <TouchableWithoutFeedback onPress={() => setShowDatePicker(false)}>
            <View style={styles.datePickerBackdrop}>
              <TouchableWithoutFeedback onPress={() => {}}>
                <View style={styles.datePickerContainer}>
                  <RNText style={styles.datePickerTitle}>{t('common:date.date')}</RNText>
                  <DateTimePickerRN
                    value={ensureValidDate(tarih)}
                    mode="date"
                    display="spinner"
                    onChange={handleDateChange}
                    locale={locale}
                    textColor={colors.text}
                    themeVariant="light"
                    style={styles.datePicker}
                  />
                  <TouchableOpacity
                    style={styles.datePickerDoneButton}
                    onPress={() => setShowDatePicker(false)}
                  >
                    <RNText style={styles.datePickerDoneText}>{t('common:buttons.done')}</RNText>
                  </TouchableOpacity>
                </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </Modal>
      )}

      {showDatePicker && Platform.OS === 'android' && (
        <DateTimePickerRN
          value={ensureValidDate(tarih)}
          mode="date"
          display="default"
          onChange={handleDateChange}
        />
      )}
    </Modal>
  );
}

const kdvStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  label: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: '600',
    marginRight: 2,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: colors.background,
  },
  chipText: {
    fontSize: 11,
    fontWeight: '500',
    color: colors.textMuted,
  },
});
