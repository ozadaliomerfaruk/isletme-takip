import { ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { Tags } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { colors } from '@/constants/colors';
import { borderRadius, spacing } from '@/constants/spacing';

interface BrandSuggestionChipsProps {
  suggestions: readonly string[];
  onSelect: (brand: string) => void;
}

export function BrandSuggestionChips({
  suggestions,
  onSelect,
}: BrandSuggestionChipsProps) {
  if (suggestions.length === 0) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="always"
      contentContainerStyle={styles.container}
      accessibilityRole="list"
    >
      {suggestions.map((brand) => (
        <TouchableOpacity
          key={brand.toLocaleLowerCase('tr-TR')}
          style={styles.chip}
          onPress={() => onSelect(brand)}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel={brand}
        >
          <Tags size={13} color={colors.primary} />
          <Text variant="caption" style={styles.text} numberOfLines={1}>
            {brand}
          </Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.xs,
    paddingTop: spacing.xs,
    paddingRight: spacing.sm,
  },
  chip: {
    minHeight: 30,
    maxWidth: 160,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  text: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '600',
  },
});
