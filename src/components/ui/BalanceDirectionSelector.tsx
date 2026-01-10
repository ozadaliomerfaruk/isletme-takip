import { useCallback } from 'react';
import { View, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';

import { Text } from '@/components/ui';
import { colors } from '@/constants/colors';

export type BalanceDirection = 'debt' | 'credit';

interface BalanceDirectionSelectorProps {
  value: BalanceDirection;
  onChange: (direction: BalanceDirection) => void;
  variant: 'supplier' | 'customer' | 'staff' | 'account';
}

export function BalanceDirectionSelector({
  value,
  onChange,
  variant
}: BalanceDirectionSelectorProps) {
  const { t } = useTranslation();

  const handlePress = useCallback(
    (direction: BalanceDirection) => {
      if (direction !== value) {
        if (Platform.OS !== 'web') {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
        onChange(direction);
      }
    },
    [value, onChange]
  );

  // Variant'a göre çeviri namespace'ini belirle
  const getTranslationKey = (key: string) => {
    if (variant === 'staff') {
      return t(`staff:form.balanceDirection.${key}`);
    }
    if (variant === 'account') {
      return t(`accounts:balanceDirection.${key}`);
    }
    return t(`clients:balanceDirection.${key}`);
  };

  const isDebtSelected = value === 'debt';
  const isCreditSelected = value === 'credit';

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[
          styles.option,
          styles.leftOption,
          isDebtSelected && styles.debtSelected,
        ]}
        onPress={() => handlePress('debt')}
        activeOpacity={0.7}
      >
        <Text
          style={[
            styles.optionText,
            isDebtSelected && styles.debtTextSelected,
          ]}
        >
          {getTranslationKey('debt')}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[
          styles.option,
          styles.rightOption,
          isCreditSelected && styles.creditSelected,
        ]}
        onPress={() => handlePress('credit')}
        activeOpacity={0.7}
      >
        <Text
          style={[
            styles.optionText,
            isCreditSelected && styles.creditTextSelected,
          ]}
        >
          {getTranslationKey('credit')}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceLighter,
    borderRadius: 10,
    padding: 4,
  },
  option: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  leftOption: {
    marginRight: 2,
  },
  rightOption: {
    marginLeft: 2,
  },
  optionText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textMuted,
  },
  debtSelected: {
    backgroundColor: colors.successLight,
  },
  debtTextSelected: {
    fontWeight: '600',
    color: colors.success,
  },
  creditSelected: {
    backgroundColor: colors.errorLight,
  },
  creditTextSelected: {
    fontWeight: '600',
    color: colors.error,
  },
});
