import { useState, useEffect } from 'react';
import {
  View,
  TextInput,
  StyleSheet,
  StyleProp,
  TextStyle,
} from 'react-native';
import { colors } from '@/constants/colors';
import { spacing, borderRadius, fontSize } from '@/constants/spacing';
import { Text } from './Text';
import { formatCurrencyInput, parseCurrency } from '@/lib/currency';
import { CURRENCY_SYMBOL } from '@/constants';

interface CurrencyInputProps {
  label?: string;
  value: string;
  onChangeText: (value: string) => void;
  error?: string;
  placeholder?: string;
  style?: StyleProp<TextStyle>;
}

export function CurrencyInput({
  label,
  value,
  onChangeText,
  error,
  placeholder = '0,00',
  style,
}: CurrencyInputProps) {
  const [displayValue, setDisplayValue] = useState('');

  // Dışarıdan gelen value değiştiğinde displayValue'yu güncelle
  useEffect(() => {
    if (value) {
      // Eğer value zaten formatlanmışsa olduğu gibi kullan
      // Değilse formatla
      const formatted = formatCurrencyInput(value);
      setDisplayValue(formatted);
    } else {
      setDisplayValue('');
    }
  }, [value]);

  const handleChangeText = (text: string) => {
    // Formatla ve göster
    const formatted = formatCurrencyInput(text);
    setDisplayValue(formatted);

    // Parent'a formatlanmış değeri gönder (parseCurrency ile parse edilebilir)
    onChangeText(formatted);
  };

  return (
    <View style={styles.container}>
      {label && (
        <Text variant="label" color="secondary" style={styles.label}>
          {label}
        </Text>
      )}
      <View style={[styles.inputContainer, error && styles.inputError]}>
        <Text style={styles.currencySymbol}>{CURRENCY_SYMBOL}</Text>
        <TextInput
          style={[styles.input, style]}
          value={displayValue}
          onChangeText={handleChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          keyboardType="decimal-pad"
        />
      </View>
      {error && (
        <Text variant="caption" color="error" style={styles.error}>
          {error}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.lg,
  },
  label: {
    marginBottom: spacing.sm,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  inputError: {
    borderColor: colors.error,
  },
  currencySymbol: {
    paddingLeft: spacing.lg,
    fontSize: fontSize.lg,
    color: colors.textMuted,
  },
  input: {
    flex: 1,
    color: colors.text,
    fontSize: fontSize.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    paddingRight: spacing.lg,
  },
  error: {
    marginTop: spacing.xs,
  },
});
