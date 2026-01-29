import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Modal,
  Animated,
  TouchableOpacity,
  TouchableWithoutFeedback,
  TextInput,
  Keyboard,
  Alert,
  ActivityIndicator,
  Text as RNText,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import * as Haptics from 'expo-haptics';
import DateTimePickerRN from '@react-native-community/datetimepicker';
import { X, Package, Calendar } from 'lucide-react-native';
import { colors } from '@/constants/colors';
import { useCreateStokHareket } from '@/hooks/useStokHareketler';
import { useDateFormat } from '@/hooks/useDateFormat';
import { Urun, BirimType } from '@/types/database';
import { styles } from './styles';

type StokType = 'giris' | 'cikis';

interface QuickStockBarProps {
  visible: boolean;
  onDismiss: () => void;
  urun: Urun | null;
  defaultType?: StokType;
}

export function QuickStockBar({
  visible,
  onDismiss,
  urun,
  defaultType = 'giris',
}: QuickStockBarProps) {
  const { t } = useTranslation(['products', 'common', 'errors']);
  const createStokHareket = useCreateStokHareket();
  const { formatDateMedium, locale } = useDateFormat();

  // Refs
  const amountInputRef = useRef<TextInput>(null);

  // Animation values
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(50)).current;

  // Form state
  const [stokType, setStokType] = useState<StokType>(defaultType);
  const [miktar, setMiktar] = useState('');
  const [birimFiyat, setBirimFiyat] = useState('');
  const [tarih, setTarih] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  // Keyboard visibility tracking
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSubscription = Keyboard.addListener(showEvent, () => {
      setIsKeyboardVisible(true);
    });
    const hideSubscription = Keyboard.addListener(hideEvent, () => {
      setIsKeyboardVisible(false);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  // Animate in/out
  useEffect(() => {
    if (visible) {
      // Reset form
      setStokType(defaultType);
      setMiktar('');
      setBirimFiyat('');
      setTarih(new Date());
      setShowDatePicker(false);

      // Animate in
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
          toValue: 50,
          duration: 150,
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
    } catch (error: any) {
      Alert.alert(t('common:status.error'), error.message || t('errors:general.tryAgain'));
    }
  };

  if (!urun) return null;

  const miktarNum = parseFloat(miktar.replace(',', '.'));
  const isValidAmount = !isNaN(miktarNum) && miktarNum > 0;

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent>
      {/* Backdrop - tap to dismiss keyboard */}
      <TouchableWithoutFeedback onPress={handleBackdropPress}>
        <View style={styles.backdrop} />
      </TouchableWithoutFeedback>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardAvoid}
        pointerEvents="box-none"
      >
        {/* Centered Floating Card */}
        <Animated.View
          style={[
            styles.card,
            {
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
              (!isValidAmount || createStokHareket.isPending) && styles.saveButtonDisabled,
            ]}
            onPress={handleSave}
            disabled={!isValidAmount || createStokHareket.isPending}
          >
            {createStokHareket.isPending ? (
              <ActivityIndicator size="small" color={colors.white} />
            ) : (
              <RNText style={styles.saveButtonText}>
                {t('common:buttons.save')}
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
              onPress={() => setStokType('giris')}
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
              onPress={() => setStokType('cikis')}
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
      </KeyboardAvoidingView>

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
