/**
 * TrendFilterModal
 *
 * Modal for filtering trend chart by hesap, cari, kategori, or personel
 */

import React, { useState, useMemo } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Modal,
  FlatList,
  Pressable,
} from 'react-native';
import {
  X,
  Check,
  Wallet,
  Building2,
  Users,
  Tag,
} from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Text, Button, TabFilter, FloatingSearchBar, FLOATING_SEARCH_CLEARANCE } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { formatCurrency, toNumber } from '@/lib/currency';
import { getHesapIcon } from '@/lib/icons';
import { searchMatchesTr } from '@/lib/turkishTextUtils';
import { useHesaplar } from '@/hooks/useHesaplar';
import { useCariler } from '@/hooks/useCariler';
import { usePersonelList } from '@/hooks/usePersonel';
import { useKategoriler } from '@/hooks/useKategoriler';
import type { TrendFilter, TrendFilterType } from '@/types/analytics';
import type { Hesap, Cari, Personel, Kategori } from '@/types/database';

interface TrendFilterModalProps {
  visible: boolean;
  onClose: () => void;
  currentFilter: TrendFilter | null;
  onApply: (filter: TrendFilter | null) => void;
}

type FilterableEntity = Hesap | Cari | Personel | Kategori;

type FilterTypeOption = {
  value: TrendFilterType;
  label: string;
};

export function TrendFilterModal({
  visible,
  onClose,
  currentFilter,
  onApply,
}: TrendFilterModalProps) {
  const { t } = useTranslation(['analytics', 'common', 'accounts', 'clients', 'staff']);

  // Local state for filter selection
  const [filterType, setFilterType] = useState<TrendFilterType>(
    currentFilter?.type || 'cari'
  );
  const [selectedId, setSelectedId] = useState<string | null>(
    currentFilter?.id || null
  );
  const [selectedLabel, setSelectedLabel] = useState<string>(
    currentFilter?.label || ''
  );
  const [searchQuery, setSearchQuery] = useState('');

  // Data hooks
  const { data: hesaplar = [], isLoading: hesaplarLoading } = useHesaplar();
  const { data: cariler = [], isLoading: carilerLoading } = useCariler();
  const { data: personelList = [], isLoading: personelLoading } = usePersonelList();
  const { data: kategoriler = [], isLoading: kategorilerLoading } = useKategoriler();

  // Filter type options
  const filterTypeOptions: FilterTypeOption[] = [
    { value: 'cari', label: t('analytics:filter.types.cari') },
    { value: 'hesap', label: t('analytics:filter.types.hesap') },
    { value: 'kategori', label: t('analytics:filter.types.kategori') },
    { value: 'personel', label: t('analytics:filter.types.personel') },
  ];

  // Reset selection when filter type changes
  const handleFilterTypeChange = (type: string) => {
    setFilterType(type as TrendFilterType);
    setSelectedId(null);
    setSelectedLabel('');
    setSearchQuery('');
  };

  // Get current list based on filter type
  const { items, isLoading } = useMemo(() => {
    switch (filterType) {
      case 'hesap':
        return { items: hesaplar, isLoading: hesaplarLoading };
      case 'cari':
        return { items: cariler, isLoading: carilerLoading };
      case 'kategori':
        return { items: kategoriler, isLoading: kategorilerLoading };
      case 'personel':
        return { items: personelList, isLoading: personelLoading };
      default:
        return { items: [], isLoading: false };
    }
  }, [filterType, hesaplar, cariler, kategoriler, personelList, hesaplarLoading, carilerLoading, kategorilerLoading, personelLoading]);

  // Filter items by search query
  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return items;

    return items.filter((item: FilterableEntity) => {
      const name = getItemName(item, filterType);
      return searchMatchesTr(name, searchQuery);
    });
  }, [items, searchQuery, filterType]);

  // Get item name based on type
  function getItemName(item: FilterableEntity, type: TrendFilterType): string {
    switch (type) {
      case 'hesap':
        return (item as Hesap).name;
      case 'cari':
        return (item as Cari).name;
      case 'kategori':
        return (item as Kategori).name;
      case 'personel': {
        const p = item as Personel;
        return `${p.first_name} ${p.last_name}`;
      }
      default:
        return '';
    }
  }

  // Get item balance (if applicable)
  function getItemBalance(item: FilterableEntity, type: TrendFilterType): number | null {
    if (type === 'hesap' || type === 'cari' || type === 'personel') {
      return toNumber((item as Hesap | Cari | Personel).balance);
    }
    return null;
  }

  // Bakiye entity'nin KENDİ para biriminde — ana sembolle basmak yanlış (döviz denetimi)
  function getItemCurrency(item: FilterableEntity, type: TrendFilterType): string | undefined {
    if (type === 'hesap' || type === 'cari' || type === 'personel') {
      return (item as Hesap | Cari | Personel).currency;
    }
    return undefined;
  }

  // Get icon for filter type
  function getFilterIcon(type: TrendFilterType) {
    switch (type) {
      case 'hesap':
        return Wallet;
      case 'cari':
        return Building2;
      case 'kategori':
        return Tag;
      case 'personel':
        return Users;
    }
  }

  // Handle item selection
  const handleSelect = (item: FilterableEntity) => {
    const name = getItemName(item, filterType);
    setSelectedId(item.id);
    setSelectedLabel(name);
  };

  // Handle apply
  const handleApply = () => {
    if (selectedId && selectedLabel) {
      onApply({
        type: filterType,
        id: selectedId,
        label: selectedLabel,
      });
    } else {
      onApply(null);
    }
    onClose();
  };

  // Handle clear
  const handleClear = () => {
    setSelectedId(null);
    setSelectedLabel('');
    onApply(null);
    onClose();
  };

  // Reset state when modal opens
  React.useEffect(() => {
    if (visible) {
      setFilterType(currentFilter?.type || 'cari');
      setSelectedId(currentFilter?.id || null);
      setSelectedLabel(currentFilter?.label || '');
      setSearchQuery('');
    }
  }, [visible, currentFilter]);

  const Icon = getFilterIcon(filterType);

  const renderItem = ({ item }: { item: FilterableEntity }) => {
    const name = getItemName(item, filterType);
    const balance = getItemBalance(item, filterType);
    const itemCurrency = getItemCurrency(item, filterType);
    const isSelected = item.id === selectedId;

    return (
      <TouchableOpacity
        style={[styles.listItem, isSelected && styles.listItemSelected]}
        onPress={() => handleSelect(item)}
        activeOpacity={0.7}
      >
        <View style={styles.listItemIcon}>
          {filterType === 'hesap' ? (
            getHesapIcon((item as Hesap).type, 20)
          ) : filterType === 'kategori' ? (
            <View
              style={[
                styles.categoryDot,
                { backgroundColor: (item as Kategori).color || colors.primary },
              ]}
            />
          ) : (
            <Icon size={20} color={isSelected ? colors.primary : colors.textMuted} />
          )}
        </View>
        <View style={styles.listItemContent}>
          <Text variant="body" style={isSelected ? styles.selectedText : undefined}>
            {name}
          </Text>
          {balance !== null && (
            <Text variant="caption" color={balance >= 0 ? 'success' : 'error'}>
              {formatCurrency(balance, itemCurrency)}
            </Text>
          )}
        </View>
        {isSelected && <Check size={20} color={colors.primary} />}
      </TouchableOpacity>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
          {/* Header */}
          <View style={styles.modalHeader}>
            <Text variant="h3">{t('analytics:filter.title')}</Text>
            <TouchableOpacity onPress={onClose}>
              <X size={24} color={colors.text} />
            </TouchableOpacity>
          </View>

          {/* Filter Type Tabs */}
          <View style={styles.tabContainer}>
            <TabFilter
              options={filterTypeOptions.map((o) => ({
                label: o.label,
                value: o.value,
              }))}
              value={filterType}
              onChange={handleFilterTypeChange}
            />
          </View>

          {/* List + üzerinde yüzen arama çubuğu (footer'ın üstünde kalır) */}
          <View style={styles.listWrap}>
            <FlatList
              data={filteredItems}
              keyExtractor={(item) => item.id}
              renderItem={renderItem}
              contentContainerStyle={styles.listContainer}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Text variant="body" color="secondary">
                    {isLoading
                      ? t('common:status.loading')
                      : t('analytics:filter.noResults')}
                  </Text>
                </View>
              }
            />
            <FloatingSearchBar
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder={t('common:search.searchPlaceholder')}
              bottomOffset={spacing.md}
            />
          </View>

          {/* Footer Buttons */}
          <View style={styles.footer}>
            <Button
              variant="outline"
              onPress={handleClear}
              style={styles.footerButton}
            >
              {t('analytics:filter.clear')}
            </Button>
            <Button
              variant="primary"
              onPress={handleApply}
              style={styles.footerButton}
              disabled={!selectedId}
            >
              {t('analytics:filter.apply')}
            </Button>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tabContainer: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  listWrap: {
    flexShrink: 1,
  },
  listContainer: {
    paddingBottom: spacing.md + FLOATING_SEARCH_CLEARANCE,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  listItemSelected: {
    backgroundColor: colors.primaryLight,
  },
  listItemIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  listItemContent: {
    flex: 1,
    gap: 2,
  },
  selectedText: {
    color: colors.primary,
    fontWeight: '600',
  },
  categoryDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  emptyContainer: {
    padding: spacing.xl,
    alignItems: 'center',
  },
  footer: {
    flexDirection: 'row',
    padding: spacing.lg,
    gap: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  footerButton: {
    flex: 1,
  },
});

export default TrendFilterModal;
