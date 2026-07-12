import { View, StyleSheet, TouchableOpacity, TouchableWithoutFeedback, ScrollView, Modal, Dimensions } from 'react-native';
import { useState, useMemo } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X, Check, ChevronDown } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Text } from './Text';
import { colors } from '@/constants/colors';
import { spacing, borderRadius, HIT_SLOP } from '@/constants/spacing';
import { Currency } from '@/types/database';
import { getLocalizedCurrencies, getLocalizedCurrencyName, CurrencyInfo } from '@/constants/currencies';

interface CurrencyPickerProps {
  value: Currency;
  onChange: (currency: Currency) => void;
  label?: string;
  placeholder?: string;
  error?: string;
}

export function CurrencyPicker({
  value,
  onChange,
  label,
  placeholder,
  error,
}: CurrencyPickerProps) {
  const { t, i18n } = useTranslation(['common', 'accounts']);
  const [modalVisible, setModalVisible] = useState(false);
  const insets = useSafeAreaInsets();
  const windowHeight = Dimensions.get('window').height;

  const locale = i18n.language;

  // Lokalize edilmiş para birimi listesi
  const currencies = useMemo(() => getLocalizedCurrencies(locale), [locale]);

  // Seçili para birimini bul
  const selectedCurrency = currencies.find(c => c.code === value);

  const handleSelect = (currency: Currency) => {
    onChange(currency);
    setModalVisible(false);
  };

  const handleCloseModal = () => {
    setModalVisible(false);
  };

  const displayLabel = label || t('accounts:currency.title');
  const displayPlaceholder = placeholder || t('accounts:currency.selectCurrency');

  const renderCurrencyItem = (currency: CurrencyInfo) => {
    const isSelected = value === currency.code;
    const currencyName = getLocalizedCurrencyName(currency.code, locale);

    return (
      <TouchableOpacity
        key={currency.code}
        style={[
          styles.optionItem,
          isSelected && styles.optionItemSelected,
        ]}
        onPress={() => handleSelect(currency.code)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`${currency.code} - ${currencyName}`}
        accessibilityState={{ selected: isSelected }}
      >
        <View style={styles.optionContent}>
          <View style={styles.symbolContainer}>
            <Text style={[styles.symbol, isSelected && styles.symbolSelected]}>
              {currency.symbol}
            </Text>
          </View>
          <View style={styles.currencyInfo}>
            <Text
              variant="body"
              style={[styles.optionText, isSelected && styles.optionTextSelected]}
            >
              {currency.code}
            </Text>
            <Text
              variant="caption"
              style={[styles.currencyName, isSelected && styles.currencyNameSelected]}
            >
              {currencyName}
            </Text>
          </View>
        </View>
        {isSelected && (
          <Check size={20} color={colors.primary} />
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* Label */}
      {displayLabel && (
        <Text variant="label" style={styles.label}>
          {displayLabel}
        </Text>
      )}

      {/* Trigger Button */}
      <TouchableOpacity
        style={[
          styles.triggerButton,
          error && styles.triggerButtonError,
        ]}
        onPress={() => setModalVisible(true)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={selectedCurrency
          ? `${displayLabel}: ${selectedCurrency.code} - ${getLocalizedCurrencyName(selectedCurrency.code, locale)}`
          : displayPlaceholder
        }
        accessibilityHint={t('common:accessibility.tapToSelect')}
      >
        <View style={styles.triggerContent}>
          {selectedCurrency ? (
            <>
              <Text style={styles.triggerSymbol}>{selectedCurrency.symbol}</Text>
              <Text variant="body" style={styles.triggerText}>
                {selectedCurrency.code}
              </Text>
              <Text variant="caption" color="secondary" style={styles.triggerName}>
                ({getLocalizedCurrencyName(selectedCurrency.code, locale)})
              </Text>
            </>
          ) : (
            <Text variant="body" color="secondary">
              {displayPlaceholder}
            </Text>
          )}
        </View>
        <ChevronDown size={20} color={colors.textMuted} />
      </TouchableOpacity>

      {/* Error */}
      {error && (
        <Text variant="caption" color="error" style={styles.errorText}>
          {error}
        </Text>
      )}

      {/* Modal */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={handleCloseModal}
      >
        <TouchableWithoutFeedback onPress={handleCloseModal}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View
                style={[
                  styles.modalContent,
                  {
                    maxHeight: windowHeight * 0.7,
                    paddingBottom: insets.bottom + spacing.lg,
                  },
                ]}
              >
                {/* Header */}
                <View style={styles.modalHeader}>
                  <Text variant="h3">{displayLabel}</Text>
                  <TouchableOpacity
                    onPress={handleCloseModal}
                    hitSlop={HIT_SLOP.md}
                  >
                    <X size={24} color={colors.text} />
                  </TouchableOpacity>
                </View>

                {/* Currency List */}
                <ScrollView
                  style={styles.optionsList}
                  showsVerticalScrollIndicator={false}
                >
                  {currencies.map(renderCurrencyItem)}
                </ScrollView>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.md,
  },
  label: {
    marginBottom: spacing.xs,
    color: colors.text,
  },
  triggerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  triggerButtonError: {
    borderColor: colors.error,
  },
  triggerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: spacing.sm,
  },
  triggerSymbol: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.primary,
  },
  triggerText: {
    color: colors.text,
  },
  triggerName: {
    flex: 1,
  },
  errorText: {
    marginTop: spacing.xs,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius['2xl'],
    borderTopRightRadius: borderRadius['2xl'],
    paddingTop: spacing.lg,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  optionsList: {
    paddingHorizontal: spacing.lg,
  },
  optionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.xs,
    borderRadius: borderRadius.md,
    backgroundColor: colors.background,
  },
  optionItemSelected: {
    backgroundColor: colors.primaryLight,
  },
  optionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: spacing.md,
  },
  symbolContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  symbol: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  symbolSelected: {
    color: colors.primary,
  },
  currencyInfo: {
    flex: 1,
  },
  optionText: {
    color: colors.text,
    fontWeight: '500',
  },
  optionTextSelected: {
    color: colors.primary,
  },
  currencyName: {
    color: colors.textSecondary,
    marginTop: 2,
  },
  currencyNameSelected: {
    color: colors.primary,
  },
});
