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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X, ArrowRight, RefreshCw } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';

import { Text } from '@/components/ui';
import { colors } from '@/constants/colors';
import { HIT_SLOP } from '@/constants/spacing';
import { Currency } from '@/types/database';
import { getCurrencySymbol, getExchangeRateDisplay } from '@/constants/currencies';
import { parseCurrency, formatCurrency, formatAmountForInput } from '@/lib/currency';
import { useExchangeRates } from '@/hooks/useExchangeRates';

export interface ExchangeRateBarProps {
  visible: boolean;
  onDismiss: () => void;
  sourceAmount: number;
  sourceCurrency: Currency;
  targetCurrency: Currency;
  onConfirm: (exchangeRate: number, targetAmount: number) => void;
}

export function ExchangeRateBar({
  visible,
  onDismiss,
  sourceAmount,
  sourceCurrency,
  targetCurrency,
  onConfirm,
}: ExchangeRateBarProps) {
  const { t } = useTranslation(['transactions', 'common']);
  const insets = useSafeAreaInsets();
  const { data: exchangeRatesData } = useExchangeRates();

  // State - bidirectional inputs
  const [rateInput, setRateInput] = useState('');
  const [targetAmountInput, setTargetAmountInput] = useState('');
  const [activeInput, setActiveInput] = useState<'rate' | 'amount'>('rate');
  const [isConfirming, setIsConfirming] = useState(false);

  // Animation
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(100)).current;
  const isAnimatingRef = useRef(false);

  // Keyboard
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  // Refs
  const rateInputRef = useRef<TextInput>(null);
  const targetAmountInputRef = useRef<TextInput>(null);

  // Determine exchange rate display format
  // Format: "1 [base] = ? [quote]" - foreign currency as base when TRY is involved
  const { baseCurrency, quoteCurrency } = useMemo(() => {
    return getExchangeRateDisplay(sourceCurrency, targetCurrency);
  }, [sourceCurrency, targetCurrency]);

  // Get current valid values
  const currentRate = useMemo(() => {
    const rate = parseCurrency(rateInput);
    return isNaN(rate) || !isFinite(rate) || rate <= 0 ? null : rate;
  }, [rateInput]);

  const currentTargetAmount = useMemo(() => {
    const amount = parseCurrency(targetAmountInput);
    return isNaN(amount) || amount <= 0 ? null : amount;
  }, [targetAmountInput]);

  // Reset state when modal closes, pre-fill rate when modal opens
  useEffect(() => {
    if (!visible) {
      const timer = setTimeout(() => {
        setRateInput('');
        setTargetAmountInput('');
        setActiveInput('rate');
        setIsConfirming(false);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [visible]);

  // Pre-fill exchange rate from API when modal opens
  const prefillAppliedRef = useRef(false);
  useEffect(() => {
    if (!visible) {
      prefillAppliedRef.current = false;
      return;
    }
    if (prefillAppliedRef.current) return;

    const rates = exchangeRatesData?.rates;
    if (!rates) return;

    // Determine the display rate: "1 baseCurrency = ? quoteCurrency"
    // API rates format: { "USD": 43.27 } meaning "1 USD = 43.27 TRY"
    let displayRate: number | null = null;

    if (quoteCurrency === 'TRY') {
      // e.g., 1 USD = 43.27 TRY → directly from API
      displayRate = rates[baseCurrency] ?? null;
    } else if (baseCurrency === 'TRY') {
      // e.g., 1 TRY = ? USD → invert
      const quoteRate = rates[quoteCurrency];
      displayRate = quoteRate && quoteRate > 0 ? 1 / quoteRate : null;
    } else {
      // Both foreign: e.g., 1 USD = ? EUR → cross rate
      const baseRate = rates[baseCurrency]; // 1 USD = X TRY
      const quoteRate = rates[quoteCurrency]; // 1 EUR = Y TRY
      displayRate = baseRate && quoteRate && quoteRate > 0 ? baseRate / quoteRate : null;
    }

    if (!displayRate || displayRate <= 0) return;

    prefillAppliedRef.current = true;
    const formatted = formatAmountForInput(displayRate, displayRate < 1 ? 6 : 2);
    setRateInput(formatted);

    // Calculate target amount using the same logic as calculateTargetFromRate
    let targetAmount: number;
    if (sourceCurrency === baseCurrency) {
      targetAmount = sourceAmount * displayRate;
    } else {
      targetAmount = sourceAmount / displayRate;
    }
    const targetFormatted = formatAmountForInput(targetAmount, targetAmount < 1 ? 4 : 2);
    setTargetAmountInput(targetFormatted);
  }, [visible, exchangeRatesData, baseCurrency, quoteCurrency, sourceCurrency, sourceAmount]);

  // Keyboard listeners
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const handleShow = (e: KeyboardEvent) => {
      setKeyboardHeight(e.endCoordinates.height);
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
        rateInputRef.current?.focus();
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

  // Handle backdrop press
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

  // Calculate target amount from rate
  const calculateTargetFromRate = useCallback((rate: number): number => {
    if (sourceCurrency === baseCurrency) {
      // Source is base (e.g., transferring EUR to TRY, rate is "1 EUR = X TRY")
      // We want target in target currency
      // If source=EUR, target=TRY, rate=35 → targetAmount = sourceAmount * rate
      return sourceAmount * rate;
    } else {
      // Source is quote (e.g., transferring TRY to EUR, rate is "1 EUR = X TRY")
      // targetAmount = sourceAmount / rate
      return sourceAmount / rate;
    }
  }, [sourceAmount, sourceCurrency, baseCurrency]);

  // Calculate rate from target amount
  const calculateRateFromTarget = useCallback((targetAmount: number): number => {
    if (sourceCurrency === baseCurrency) {
      // rate = targetAmount / sourceAmount
      return targetAmount / sourceAmount;
    } else {
      // rate = sourceAmount / targetAmount
      return sourceAmount / targetAmount;
    }
  }, [sourceAmount, sourceCurrency, baseCurrency]);

  // Handle rate input change - update target amount
  const handleRateChange = useCallback((text: string) => {
    const cleaned = text.replace(/[^0-9,.]/g, '');
    setRateInput(cleaned);
    setActiveInput('rate');

    const rate = parseCurrency(cleaned);
    if (!isNaN(rate) && rate > 0) {
      const targetAmount = calculateTargetFromRate(rate);
      // Format with 2-4 decimal places for precision
      const formatted = formatAmountForInput(targetAmount, targetAmount < 1 ? 4 : 2);
      setTargetAmountInput(formatted);
    } else {
      setTargetAmountInput('');
    }
  }, [calculateTargetFromRate]);

  // Handle target amount input change - update rate
  const handleTargetAmountChange = useCallback((text: string) => {
    const cleaned = text.replace(/[^0-9,.]/g, '');
    setTargetAmountInput(cleaned);
    setActiveInput('amount');

    const targetAmount = parseCurrency(cleaned);
    if (!isNaN(targetAmount) && targetAmount > 0) {
      const rate = calculateRateFromTarget(targetAmount);
      // Format rate with appropriate precision
      const formatted = formatAmountForInput(rate, rate < 1 ? 6 : 2);
      setRateInput(formatted);
    } else {
      setRateInput('');
    }
  }, [calculateRateFromTarget]);

  // Handle confirm
  const handleConfirm = useCallback(() => {
    if (currentRate === null || currentTargetAmount === null) {
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
      return;
    }

    setIsConfirming(true);

    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }

    // Pass the actual exchange rate used in the calculation
    // The rate is always stored as "base to quote" ratio
    onConfirm(currentRate, currentTargetAmount);
  }, [currentRate, currentTargetAmount, onConfirm]);

  if (!visible) return null;

  const cardBottom = keyboardHeight > 0 ? keyboardHeight : insets.bottom + 10;
  const isValid = currentRate !== null && currentTargetAmount !== null;

  const baseSymbol = getCurrencySymbol(baseCurrency);
  const quoteSymbol = getCurrencySymbol(quoteCurrency);
  const targetSymbol = getCurrencySymbol(targetCurrency);

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
            opacity,
            transform: [{ translateY }],
          },
        ]}
      >
        {/* Header */}
        <View style={styles.headerRow}>
          <View style={styles.headerTitleContainer}>
            <RefreshCw size={20} color={colors.primary} />
            <Text style={styles.headerTitle}>{t('transactions:exchangeRate.title')}</Text>
          </View>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={handleDismiss}
            hitSlop={HIT_SLOP.md}
          >
            <X size={20} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        {/* Exchange Rate Input */}
        <View style={[styles.rateInputContainer, activeInput === 'rate' && styles.activeInputContainer]}>
          <Text style={styles.rateLabel}>1 {baseSymbol}</Text>
          <Text style={styles.rateEquals}>=</Text>
          <TextInput
            ref={rateInputRef}
            style={styles.rateInput}
            placeholder="0"
            placeholderTextColor={colors.textMuted}
            value={rateInput}
            onChangeText={handleRateChange}
            onFocus={() => setActiveInput('rate')}
            keyboardType="decimal-pad"
            maxLength={15}
          />
          <Text style={styles.rateCurrency}>{quoteSymbol}</Text>
        </View>

        {/* Conversion with Editable Target */}
        <View style={styles.conversionContainer}>
          <Text style={styles.conversionLabel}>{t('transactions:exchangeRate.conversion')}:</Text>
          <View style={styles.conversionRow}>
            {/* Source Amount (read-only) */}
            <Text style={styles.conversionSourceAmount}>
              {formatCurrency(sourceAmount, sourceCurrency)}
            </Text>
            <ArrowRight size={18} color={colors.textMuted} />
            {/* Target Amount (editable) */}
            <View style={[styles.targetInputWrapper, activeInput === 'amount' && styles.activeInputContainer]}>
              <TextInput
                ref={targetAmountInputRef}
                style={styles.targetInput}
                placeholder="0"
                placeholderTextColor={colors.textMuted}
                value={targetAmountInput}
                onChangeText={handleTargetAmountChange}
                onFocus={() => setActiveInput('amount')}
                keyboardType="decimal-pad"
                maxLength={15}
              />
              <Text style={styles.targetCurrency}>{targetSymbol}</Text>
            </View>
          </View>
        </View>

        {/* Confirm Button */}
        <TouchableOpacity
          style={[
            styles.confirmButton,
            !isValid && styles.confirmButtonDisabled,
            isConfirming && styles.confirmButtonDisabled,
          ]}
          onPress={handleConfirm}
          disabled={!isValid || isConfirming}
        >
          <Text style={styles.confirmButtonText}>
            {isConfirming ? '...' : t('transactions:exchangeRate.confirm')}
          </Text>
        </TouchableOpacity>
      </Animated.View>
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
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  headerTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  closeButton: {
    padding: 6,
  },
  rateInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  activeInputContainer: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  rateLabel: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  rateEquals: {
    fontSize: 18,
    fontWeight: '500',
    color: colors.textMuted,
    marginHorizontal: 12,
  },
  rateInput: {
    flex: 1,
    fontSize: 24,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
    paddingVertical: 4,
  },
  rateCurrency: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginLeft: 8,
  },
  conversionContainer: {
    backgroundColor: colors.infoLight,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  conversionLabel: {
    fontSize: 13,
    color: colors.textMuted,
    marginBottom: 8,
  },
  conversionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  conversionSourceAmount: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  targetInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  targetInput: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.success,
    minWidth: 60,
    textAlign: 'center',
    paddingVertical: 0,
  },
  targetCurrency: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.success,
    marginLeft: 4,
  },
  confirmButton: {
    backgroundColor: colors.primary,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  confirmButtonDisabled: {
    backgroundColor: colors.primaryLight,
    opacity: 0.6,
  },
  confirmButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
