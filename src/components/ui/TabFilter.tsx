import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { Text } from './Text';

interface TabFilterOption {
  label: string;
  value: string;
}

interface TabFilterProps {
  options: TabFilterOption[];
  value: string;
  onChange: (value: string) => void;
}

export function TabFilter({ options, value, onChange }: TabFilterProps) {
  return (
    <View style={styles.container}>
      {options.map((option) => {
        const isActive = option.value === value;
        return (
          <TouchableOpacity
            key={option.value}
            style={[styles.tab, isActive && styles.tabActive]}
            onPress={() => onChange(option.value)}
            activeOpacity={0.7}
          >
            <Text
              variant="label"
              style={{ color: isActive ? colors.white : colors.textSecondary }}
            >
              {option.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceLighter,
    borderRadius: borderRadius.lg,
    padding: spacing.xs,
  },
  tab: {
    flex: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: colors.primary,
  },
});
