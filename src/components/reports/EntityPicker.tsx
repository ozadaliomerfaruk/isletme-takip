import React from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Modal,
  FlatList,
  Pressable,
  TextInput,
} from 'react-native';
import { Text } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing } from '@/constants/spacing';
import { ChevronDown, X, Building2, Users, Check, Search } from 'lucide-react-native';
import { Cari, Personel } from '@/types/database';
import { formatCurrency, toNumber } from '@/lib/currency';
import { useTranslation } from 'react-i18next';

type EntityType = 'cari' | 'personel';

interface EntityPickerProps {
  type: EntityType;
  entities: Cari[] | Personel[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  isLoading?: boolean;
}

export function EntityPicker({
  type,
  entities,
  selectedId,
  onSelect,
  isLoading,
}: EntityPickerProps) {
  const { t } = useTranslation(['reports', 'common']);
  const [modalVisible, setModalVisible] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState('');

  const selectedEntity = entities.find((e) => e.id === selectedId);

  const getEntityName = (entity: Cari | Personel): string => {
    if (type === 'cari') {
      return (entity as Cari).name;
    }
    const personel = entity as Personel;
    return `${personel.first_name} ${personel.last_name}`;
  };

  const getEntityBalance = (entity: Cari | Personel): number => {
    return toNumber(entity.balance);
  };

  const Icon = type === 'cari' ? Building2 : Users;

  const filteredEntities = React.useMemo(() => {
    if (!searchQuery.trim()) return entities;
    const q = searchQuery.toLowerCase().trim();
    return entities.filter((e) => getEntityName(e).toLowerCase().includes(q));
  }, [entities, searchQuery]);

  const handleSelect = (id: string | null) => {
    onSelect(id);
    setSearchQuery('');
    setModalVisible(false);
  };

  const handleClose = () => {
    setSearchQuery('');
    setModalVisible(false);
  };

  const renderItem = ({ item }: { item: Cari | Personel }) => {
    const balance = getEntityBalance(item);
    const isSelected = item.id === selectedId;

    return (
      <TouchableOpacity
        style={[styles.listItem, isSelected && styles.listItemSelected]}
        onPress={() => handleSelect(item.id)}
        activeOpacity={0.7}
      >
        <View style={styles.listItemIcon}>
          <Icon size={20} color={isSelected ? colors.primary : colors.textMuted} />
        </View>
        <View style={styles.listItemContent}>
          <Text variant="body" style={isSelected ? styles.selectedText : undefined}>
            {getEntityName(item)}
          </Text>
          <Text
            variant="caption"
            color={balance >= 0 ? 'success' : 'error'}
          >
            {formatCurrency(balance, item.currency)}
          </Text>
        </View>
        {isSelected && (
          <Check size={20} color={colors.primary} />
        )}
      </TouchableOpacity>
    );
  };

  return (
    <>
      <TouchableOpacity
        style={styles.picker}
        onPress={() => setModalVisible(true)}
        activeOpacity={0.7}
      >
        <View style={styles.pickerIcon}>
          <Icon size={20} color={colors.primary} />
        </View>
        <View style={styles.pickerContent}>
          {selectedEntity ? (
            <>
              <Text variant="body">{getEntityName(selectedEntity)}</Text>
              <Text variant="caption" color="secondary">
                {t('reports:entityPicker.selected')}
              </Text>
            </>
          ) : (
            <>
              <Text variant="body" color="secondary">
                {type === 'cari'
                  ? t('reports:entityPicker.selectClient')
                  : t('reports:entityPicker.selectStaff')}
              </Text>
              <Text variant="caption" color="secondary">
                {t('reports:entityPicker.viewAll')}
              </Text>
            </>
          )}
        </View>
        <ChevronDown size={20} color={colors.textMuted} />
      </TouchableOpacity>

      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent
        onRequestClose={handleClose}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={handleClose}
        >
          <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <Text variant="h3">
                {type === 'cari'
                  ? t('reports:entityPicker.selectClient')
                  : t('reports:entityPicker.selectStaff')}
              </Text>
              <TouchableOpacity onPress={handleClose}>
                <X size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            {/* Search Bar */}
            <View style={styles.searchContainer}>
              <Search size={18} color={colors.textMuted} />
              <TextInput
                style={styles.searchInput}
                placeholder={t('common:actions.search', { defaultValue: 'Ara...' })}
                placeholderTextColor={colors.textMuted}
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoCorrect={false}
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')}>
                  <X size={18} color={colors.textMuted} />
                </TouchableOpacity>
              )}
            </View>

            {/* Tümü seçeneği */}
            {!searchQuery && <TouchableOpacity
              style={[styles.listItem, !selectedId && styles.listItemSelected]}
              onPress={() => handleSelect(null)}
              activeOpacity={0.7}
            >
              <View style={styles.listItemIcon}>
                <Icon size={20} color={!selectedId ? colors.primary : colors.textMuted} />
              </View>
              <View style={styles.listItemContent}>
                <Text variant="body" style={!selectedId ? styles.selectedText : undefined}>
                  {t('reports:entityPicker.all')}
                </Text>
                <Text variant="caption" color="secondary">
                  {type === 'cari'
                    ? t('reports:counts.client', { count: entities.length })
                    : t('reports:counts.personnel', { count: entities.length })}
                </Text>
              </View>
              {!selectedId && <Check size={20} color={colors.primary} />}
            </TouchableOpacity>}

            <View style={styles.listDivider} />

            <FlatList
              data={filteredEntities as (Cari | Personel)[]}
              keyExtractor={(item) => item.id}
              renderItem={renderItem}
              contentContainerStyle={styles.listContainer}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Text variant="body" color="secondary">
                    {type === 'cari'
                      ? t('reports:entityPicker.noClients')
                      : t('reports:entityPicker.noStaff')}
                  </Text>
                </View>
              }
            />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  picker: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pickerIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  pickerContent: {
    flex: 1,
    gap: 2,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    height: '70%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
    gap: spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: colors.text,
    padding: 0,
  },
  listContainer: {
    paddingBottom: spacing['2xl'],
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
  listDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.sm,
  },
  emptyContainer: {
    padding: spacing.xl,
    alignItems: 'center',
  },
});

export default EntityPicker;
