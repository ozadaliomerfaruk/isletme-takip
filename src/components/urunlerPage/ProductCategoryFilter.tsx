import { memo } from 'react';
import { View, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing, borderRadius, HIT_SLOP } from '@/constants/spacing';

export interface CategoryChipData {
  id: string;
  name: string;
  count: number;
}

/** Özel filtre değerleri (kategori id'leri dışında) */
export const CATEGORY_FILTER_ALL = 'all';
export const CATEGORY_FILTER_UNCATEGORIZED = 'uncategorized';

interface ProductCategoryFilterProps {
  /** Üründe fiilen kullanılan kategoriler (sayaçlarıyla) */
  chips: CategoryChipData[];
  /** Tüm aktif ürün sayısı ("Tümü" sayacı) */
  totalCount: number;
  /** Kategorisiz ürün sayısı (0 ise çip gösterilmez) */
  uncategorizedCount: number;
  /** Seçili değer: 'all' | 'uncategorized' | <kategoriId> */
  value: string;
  onChange: (value: string) => void;
  /** Arama veya kategori filtresi aktif mi (sonuç/temizle satırı için) */
  isFiltered: boolean;
  /** Mevcut filtreyle gösterilen ürün sayısı */
  resultCount: number;
  onClearFilters: () => void;
}

export const ProductCategoryFilter = memo(function ProductCategoryFilter({
  chips,
  totalCount,
  uncategorizedCount,
  value,
  onChange,
  isFiltered,
  resultCount,
  onClearFilters,
}: ProductCategoryFilterProps) {
  const { t } = useTranslation(['products']);

  const renderChip = (key: string, label: string, count: number) => {
    const active = value === key;
    return (
      <TouchableOpacity
        key={key}
        style={[styles.chip, active && styles.chipActive]}
        onPress={() => onChange(key)}
        activeOpacity={0.7}
      >
        <Text variant="caption" style={active ? styles.chipTextActive : styles.chipText}>
          {label} ({count})
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.wrapper}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {renderChip(CATEGORY_FILTER_ALL, t('products:filter.all'), totalCount)}
        {chips.map((c) => renderChip(c.id, c.name, c.count))}
        {uncategorizedCount > 0 &&
          renderChip(CATEGORY_FILTER_UNCATEGORIZED, t('products:filter.uncategorized'), uncategorizedCount)}
      </ScrollView>

      {isFiltered && (
        <View style={styles.resultRow}>
          <Text variant="caption" color="secondary">
            {t('products:filter.resultCount', { count: resultCount })}
          </Text>
          <TouchableOpacity
            onPress={onClearFilters}
            hitSlop={HIT_SLOP.sm}
          >
            <Text variant="caption" style={styles.clearText}>
              {t('products:filter.clear')}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  wrapper: {
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  chip: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: {
    color: colors.text,
  },
  chipTextActive: {
    color: colors.white,
    fontWeight: '600',
  },
  resultRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  clearText: {
    color: colors.primary,
    fontWeight: '600',
  },
});
