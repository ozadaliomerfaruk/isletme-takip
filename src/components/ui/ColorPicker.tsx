import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Check } from 'lucide-react-native';
import { Text } from './Text';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { CATEGORY_COLORS } from '@/constants/categoryIcons';

interface ColorPickerProps {
  value: string | null;
  onChange: (color: string) => void;
  label?: string;
}

export function ColorPicker({ value, onChange, label }: ColorPickerProps) {
  return (
    <View style={styles.container}>
      {label && (
        <Text variant="label" style={styles.label}>
          {label}
        </Text>
      )}
      <View style={styles.colorGrid}>
        {CATEGORY_COLORS.map((color) => {
          const isSelected = value === color.value;

          return (
            <TouchableOpacity
              key={color.value}
              style={[
                styles.colorItem,
                { backgroundColor: color.value },
                isSelected && styles.colorItemSelected,
              ]}
              onPress={() => onChange(color.value)}
              activeOpacity={0.7}
            >
              {isSelected && (
                <Check size={20} color={colors.white} strokeWidth={3} />
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  label: {
    marginBottom: spacing.xs,
  },
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  colorItem: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: 'transparent',
  },
  colorItemSelected: {
    borderColor: colors.text,
  },
});
