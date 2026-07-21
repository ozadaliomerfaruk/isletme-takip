import { View, StyleSheet, TouchableOpacity, TouchableWithoutFeedback, ScrollView, Modal, Dimensions } from 'react-native';
import { useState, useMemo, useCallback, useEffect } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import {
  X,
  Check,
  ChevronDown,
  Search,
  Package,
  Scale,
  Droplet,
  Ruler,
  Box,
  Utensils,
} from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Text } from './Text';
import { FloatingSearchBar, FLOATING_SEARCH_CLEARANCE } from './FloatingSearchBar';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { BirimType } from '@/types/database';
import { searchMatchesTr } from '@/lib/turkishTextUtils';

// Unit category definitions
type UnitCategory = 'piece' | 'weight' | 'volume' | 'length' | 'package' | 'consumption';

interface UnitDefinition {
  id: BirimType;
  category: UnitCategory;
}

// All units organized by category
const UNIT_DEFINITIONS: UnitDefinition[] = [
  // Adet/Parça
  { id: 'adet', category: 'piece' },
  { id: 'parca', category: 'piece' },
  { id: 'cift', category: 'piece' },
  { id: 'takim', category: 'piece' },
  // Ağırlık
  { id: 'gram', category: 'weight' },
  { id: 'kg', category: 'weight' },
  { id: 'ton', category: 'weight' },
  // Hacim
  { id: 'ml', category: 'volume' },
  { id: 'lt', category: 'volume' },
  // Uzunluk/Alan
  { id: 'cm', category: 'length' },
  { id: 'm', category: 'length' },
  { id: 'm2', category: 'length' },
  { id: 'm3', category: 'length' },
  // Ambalaj
  { id: 'paket', category: 'package' },
  { id: 'kutu', category: 'package' },
  { id: 'koli', category: 'package' },
  // Tüketim
  { id: 'porsiyon', category: 'consumption' },
];

// Category order for display
const CATEGORY_ORDER: UnitCategory[] = ['piece', 'weight', 'volume', 'length', 'package', 'consumption'];

// Icons for each category
const CATEGORY_ICONS: Record<UnitCategory, typeof Package> = {
  piece: Package,
  weight: Scale,
  volume: Droplet,
  length: Ruler,
  package: Box,
  consumption: Utensils,
};

// Colors for each category
const CATEGORY_COLORS: Record<UnitCategory, string> = {
  piece: colors.primary,
  weight: colors.warning,
  volume: colors.info,
  length: colors.success,
  package: colors.orange,
  consumption: colors.error,
};

interface UnitPickerProps {
  value: BirimType;
  onChange: (unit: BirimType) => void;
  label?: string;
  error?: string;
}

export function UnitPicker({
  value,
  onChange,
  label,
  error,
}: UnitPickerProps) {
  const { t } = useTranslation(['products', 'common']);
  const [modalVisible, setModalVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const insets = useSafeAreaInsets();
  const windowHeight = Dimensions.get('window').height;

  // Get translated unit name
  const getUnitLabel = useCallback((unitId: BirimType) => {
    return t(`products:units.${unitId}`);
  }, [t]);

  // Get translated category name
  const getCategoryLabel = useCallback((category: UnitCategory) => {
    return t(`products:unitCategories.${category}`);
  }, [t]);

  // Get unit definition by ID
  const getUnitDefinition = useCallback((unitId: BirimType) => {
    return UNIT_DEFINITIONS.find(u => u.id === unitId);
  }, []);

  // Filter units by search query
  const filteredUnits = useMemo(() => {
    if (!searchQuery.trim()) return UNIT_DEFINITIONS;
    return UNIT_DEFINITIONS.filter(unit => {
      const label = getUnitLabel(unit.id);
      return searchMatchesTr(label, searchQuery) || searchMatchesTr(unit.id, searchQuery);
    });
  }, [searchQuery, getUnitLabel]);

  // Group filtered units by category
  const groupedUnits = useMemo(() => {
    const groups: Record<UnitCategory, UnitDefinition[]> = {
      piece: [],
      weight: [],
      volume: [],
      length: [],
      package: [],
      consumption: [],
    };

    filteredUnits.forEach(unit => {
      groups[unit.category].push(unit);
    });

    return groups;
  }, [filteredUnits]);

  const handleSelect = useCallback((unitId: BirimType) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onChange(unitId);
    setModalVisible(false);
    setSearchQuery('');
  }, [onChange]);

  const handleCloseModal = useCallback(() => {
    setModalVisible(false);
    setSearchQuery('');
  }, []);

  const handleOpenModal = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setModalVisible(true);
  }, []);

  const selectedUnit = getUnitDefinition(value);
  const selectedCategory = selectedUnit?.category || 'piece';
  const CategoryIcon = CATEGORY_ICONS[selectedCategory];
  const categoryColor = CATEGORY_COLORS[selectedCategory];

  return (
    <>
      <View style={styles.container}>
        {label && (
          <Text variant="label" color="secondary" style={styles.label}>
            {label}
          </Text>
        )}
        <TouchableOpacity
          style={[styles.trigger, error && styles.triggerError]}
          onPress={handleOpenModal}
          activeOpacity={0.7}
        >
          <View style={styles.selectedContent}>
            <View style={[styles.selectedIcon, { backgroundColor: categoryColor + '20' }]}>
              <CategoryIcon size={16} color={categoryColor} />
            </View>
            <Text variant="body" numberOfLines={1} style={styles.selectedText}>
              {getUnitLabel(value)}
            </Text>
          </View>
          <ChevronDown size={20} color={colors.textMuted} />
        </TouchableOpacity>
        {error && (
          <Text variant="caption" color="error" style={styles.errorText}>
            {error}
          </Text>
        )}
      </View>

      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={handleCloseModal}
      >
        <TouchableWithoutFeedback onPress={handleCloseModal}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback onPress={() => {}}>
              <View style={[styles.modalContent, { height: windowHeight * 0.7, paddingBottom: insets.bottom }]}>
                <View style={styles.modalHeader}>
                  <Text variant="h3">{t('products:unitPicker.title')}</Text>
                  <TouchableOpacity
                    onPress={handleCloseModal}
                    style={styles.closeButton}
                  >
                    <X size={24} color={colors.text} />
                  </TouchableOpacity>
                </View>

                <ScrollView
                  style={styles.unitList}
                  contentContainerStyle={styles.unitListContent}
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                >
                  {CATEGORY_ORDER.map((category) => {
                    const units = groupedUnits[category];
                    if (units.length === 0) return null;

                    const Icon = CATEGORY_ICONS[category];
                    const color = CATEGORY_COLORS[category];

                    return (
                      <View key={category} style={styles.categorySection}>
                        {/* Category Header */}
                        <View style={styles.categoryHeader}>
                          <View style={[styles.categoryIcon, { backgroundColor: color + '20' }]}>
                            <Icon size={14} color={color} />
                          </View>
                          <Text variant="label" color="secondary">
                            {getCategoryLabel(category)}
                          </Text>
                        </View>

                        {/* Units in Category */}
                        {units.map((unit) => {
                          const isSelected = value === unit.id;

                          return (
                            <TouchableOpacity
                              key={unit.id}
                              style={[
                                styles.unitItem,
                                isSelected && styles.unitItemSelected,
                              ]}
                              onPress={() => handleSelect(unit.id)}
                              activeOpacity={0.7}
                            >
                              <View style={styles.unitItemLeft}>
                                <View style={[styles.unitIcon, { backgroundColor: color + '20' }]}>
                                  <Icon size={18} color={color} />
                                </View>
                                <Text
                                  variant="body"
                                  style={isSelected ? { color: colors.primary } : undefined}
                                >
                                  {getUnitLabel(unit.id)}
                                </Text>
                              </View>
                              {isSelected && (
                                <View style={[styles.checkIcon, { backgroundColor: color }]}>
                                  <Check size={14} color={colors.white} />
                                </View>
                              )}
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    );
                  })}

                  {/* No search results */}
                  {searchQuery.trim() && filteredUnits.length === 0 && (
                    <View style={styles.emptyState}>
                      <Search size={48} color={colors.textMuted} />
                      <Text variant="body" color="secondary" style={styles.emptyText}>
                        {t('common:search.noResultsFor', { query: searchQuery })}
                      </Text>
                    </View>
                  )}
                </ScrollView>

                {/* Sheet altında yüzen arama çubuğu */}
                <FloatingSearchBar
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder={t('products:unitPicker.search')}
                  bottomOffset={spacing.lg + insets.bottom + spacing.md}
                />
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.lg,
  },
  label: {
    marginBottom: spacing.sm,
  },
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  triggerError: {
    borderColor: colors.error,
  },
  selectedContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  selectedIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  selectedText: {
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
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  closeButton: {
    padding: spacing.xs,
  },
  unitList: {
    flex: 1,
  },
  unitListContent: {
    padding: spacing.md,
    paddingBottom: spacing['3xl'] + FLOATING_SEARCH_CLEARANCE,
  },
  categorySection: {
    marginBottom: spacing.lg,
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  categoryIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unitItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    backgroundColor: colors.surfaceLighter,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.xs,
  },
  unitItemSelected: {
    backgroundColor: colors.primaryLight + '30',
    borderWidth: 1,
    borderColor: colors.primary,
  },
  unitItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  unitIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  checkIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing['3xl'],
  },
  emptyText: {
    marginTop: spacing.md,
    textAlign: 'center',
  },
});
