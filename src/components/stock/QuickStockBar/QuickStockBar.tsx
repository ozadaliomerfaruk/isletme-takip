import { useState, useEffect, useRef, useCallback } from 'react';
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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import * as Haptics from 'expo-haptics';
import DateTimePickerRN from '@react-native-community/datetimepicker';
import { X, Package, Calendar } from 'lucide-react-native';
import { colors } from '@/constants/colors';
import { TAB_BAR_HEIGHT } from '@/constants/spacing';
import { useCreateStokHareket, useUpdateStokHareket } from '@/hooks/useStokHareketler';
import { useDateFormat } from '@/hooks/useDateFormat';
import { Urun, BirimType, StokHareketTipi } from '@/types/database';
import { styles } from './styles';

type StokType = 'giris' | 'cikis';

interface QuickStockBarProps {
  visible: boolean;
  onDismiss: () => void;
  urun: Urun | null;
  defaultType?: StokType;
  // Edit mode props
  mode?: 'create' | 'edit';
  editHareketId?: string;
  editInitialValues?: {
    miktar: number;
    birimFiyat: number | null;
    stokType: StokType;
  };
}

export function QuickStockBar({
  visible,
  onDismiss,
  urun,
  defaultType = 'giris',
  mode = 'create',
  editHareketId,
  editInitialValues,
}: QuickStockBarProps) {
  const { t } = useTranslation(['products', 'common', 'errors']);
  const createStokHareket = useCreateStokHareket();
  const updateStokHareket = useUpdateStokHareket();
  const isEditMode = mode === 'edit' && editHareketId;
  const { formatDateMedium, locale } = useDateFormat();
  const insets = useSafeAreaInsets();

  // Refs
  const amountInputRef = useRef<TextInput>(null);

  // Animation values
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(100)).current;

  // Form state
  const [stokType, setStokType] = useState<StokType>(defaultType);
  const [miktar, setMiktar] = useState('');
  const [birimFiyat, setBirimFiyat] = useState('');
  const [tarih, setTarih] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);

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

  // Helper to get price based on stock type
  const getPriceForType = useCallback((type: StokType) => {
    if (!urun) return '';
    const price = type === 'giris' ? urun.alis_fiyati : urun.satis_fiyati;
    return price > 0 ? price.toString() : '';
  }, [urun]);

  // Animate in/out
  useEffect(() => {
    if (visible) {
      // Reset form - use edit values if in edit mode
      if (isEditMode && editInitialValues) {
        setStokType(editInitialValues.stokType);
        setMiktar(editInitialValues.miktar.toString());
        setBirimFiyat(editInitialValues.birimFiyat?.toString() || '');
      } else {
        setStokType(defaultType);
        setMiktar('');
        // Auto-fill price based on stock type
        setBirimFiyat(getPriceForType(defaultType));
      }
      setTarih(new Date());
      setShowDatePicker(false);

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
    } else {
      // Animate out
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
      ]).start();
    }
  }, [visible, defaultType, opacity, translateY]);

  const getBirimLabel = (birim: BirimType) => {
    return t(`products:units.${birim}`);
  };

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

    // Otherwise close the bar
    onDismiss();
  }, [isKeyboardVisible, showDatePicker, onDismiss]);

  const handleDismiss = useCallback(() => {
    Keyboard.dismiss();
    setShowDatePicker(false);
    onDismiss();
  }, [onDismiss]);

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

    const miktarNum = parseFloat(miktar.replace(',', '.'));
    if (!miktar || isNaN(miktarNum) || miktarNum <= 0) {
      Alert.alert(t('common:status.error'), t('products:validation.quantityPositive'));
      return;
    }

    const fiyatNum = birimFiyat ? parseFloat(birimFiyat.replace(',', '.')) : null;

    try {
      if (isEditMode && editHareketId) {
        // Update existing movement
        await updateStokHareket.mutateAsync({
          id: editHareketId,
          miktar: miktarNum,
          birim_fiyat: fiyatNum,
          hareket_tipi: stokType,
        });

        handleDismiss();
        Alert.alert(
          t('common:status.success'),
          t('products:messages.stockUpdated')
        );
      } else {
        // Create new movement
        await createStokHareket.mutateAsync({
          urun_id: urun.id,
          hareket_tipi: stokType,
          miktar: miktarNum,
          birim_fiyat: fiyatNum,
          aciklama: null,
        });

        handleDismiss();
        Alert.alert(
          t('common:status.success'),
          stokType === 'giris'
            ? t('products:messages.stockInSuccess')
            : t('products:messages.stockOutSuccess')
        );
      }
    } catch (error: any) {
      Alert.alert(t('common:status.error'), error.message || t('errors:general.tryAgain'));
    }
  };

  if (!urun) return null;

  const miktarNum = parseFloat(miktar.replace(',', '.'));
  const isValidAmount = !isNaN(miktarNum) && miktarNum > 0;
  const isPending = createStokHareket.isPending || updateStokHareket.isPending;

  // Position card above keyboard (like QuickTransactionBar)
  const cardBottom = keyboardHeight > 0
    ? keyboardHeight
    : insets.bottom + TAB_BAR_HEIGHT + 10;

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
            opacity: opacity,
            transform: [{ translateY: translateY }],
          },
        ]}
      >
        {/* Header: Urun Info + Close */}
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
                {t('products:stock.currentStock')}: {urun.miktar} {getBirimLabel(urun.birim)}
              </RNText>
            </View>
          </View>
          <TouchableOpacity onPress={handleDismiss} style={styles.closeButton}>
            <X size={22} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

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
              placeholder={t('products:stock.quantity')}
              placeholderTextColor={colors.textMuted}
              keyboardType="decimal-pad"
              returnKeyType="next"
            />
          </View>
          <RNText style={styles.unitLabel}>{getBirimLabel(urun.birim)}</RNText>
        </View>

        {/* Price Input Row */}
        <View style={styles.inputRow}>
          <View style={styles.amountInputContainer}>
            <TextInput
              style={styles.priceInput}
              value={birimFiyat}
              onChangeText={setBirimFiyat}
              placeholder={`${t('products:stock.unitPrice')} (${t('common:optional')})`}
              placeholderTextColor={colors.textMuted}
              keyboardType="decimal-pad"
              returnKeyType="done"
              onSubmitEditing={handleSave}
            />
          </View>
          <RNText style={styles.unitLabel}>₺</RNText>
        </View>

        {/* Save Button */}
        <TouchableOpacity
          style={[
            styles.saveButton,
            stokType === 'giris' ? styles.saveButtonGiris : styles.saveButtonCikis,
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

        {/* Tabs: Stok Giriş / Stok Çıkış */}
        <View style={styles.tabs}>
          <TouchableOpacity
            style={[
              styles.tab,
              stokType === 'giris' && styles.tabGiris,
            ]}
            onPress={() => {
              setStokType('giris');
              if (!isEditMode) setBirimFiyat(getPriceForType('giris'));
            }}
            activeOpacity={0.7}
          >
            <RNText
              style={[
                styles.tabText,
                stokType === 'giris' && styles.tabTextGiris,
              ]}
            >
              {t('products:stock.stockIn')}
            </RNText>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.tab,
              stokType === 'cikis' && styles.tabCikis,
            ]}
            onPress={() => {
              setStokType('cikis');
              if (!isEditMode) setBirimFiyat(getPriceForType('cikis'));
            }}
            activeOpacity={0.7}
          >
            <RNText
              style={[
                styles.tabText,
                stokType === 'cikis' && styles.tabTextCikis,
              ]}
            >
              {t('products:stock.stockOut')}
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
                    value={tarih}
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
          value={tarih}
          mode="date"
          display="default"
          onChange={handleDateChange}
        />
      )}
    </Modal>
  );
}
