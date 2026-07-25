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
import { formatCurrencyInput, formatAmountForInput } from '@/lib/currency';
import { getCurrencySymbol } from '@/constants/currencies';
import type { Currency } from '@/types/database';

interface CurrencyInputProps {
  label?: string;
  value: string;
  onChangeText: (value: string) => void;
  error?: string;
  placeholder?: string;
  style?: StyleProp<TextStyle>;
  /** Para birimi — verilmezse ANA para biriminin sembolü basılır (sabit ₺ değil). */
  currency?: Currency;
  /** Özel prefix - belirtilirse para birimi sembolü yerine bu gösterilir */
  prefix?: string;
}

export function CurrencyInput({
  label,
  value,
  onChangeText,
  error,
  placeholder,
  style,
  currency,
  prefix,
}: CurrencyInputProps) {
  const currencySymbol = prefix ?? getCurrencySymbol(currency);
  // Placeholder locale'den üretilir: sabit '0,00' ana para birimi USD/GBP olan
  // kullanıcıda alan içi biçimlendirme nokta ondalıkla çalışırken virgül gösteriyordu.
  const resolvedPlaceholder = placeholder ?? formatAmountForInput(0, 2);
  // Doğrudan value'dan hesapla - gereksiz useState kaldırıldı
  const displayValue = formatCurrencyInput(value) || '';

  const handleChangeText = (text: string) => {
    // Formatla ve parent'a gönder
    const formatted = formatCurrencyInput(text);
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
        <Text style={styles.currencySymbol}>{currencySymbol}</Text>
        <TextInput
          style={[styles.input, style]}
          value={displayValue}
          onChangeText={handleChangeText}
          placeholder={resolvedPlaceholder}
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
