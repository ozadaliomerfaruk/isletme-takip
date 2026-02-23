/**
 * EntityPickerModal
 *
 * Reusable bottom-sheet style picker modal for selecting entities
 * (hesap, hedef hesap, cari, personel) with search support.
 */

import React from 'react';
import {
  View,
  StyleSheet,
  Modal,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  ScrollView,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X, Search, Check } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { Text } from '@/components/ui';
import { colors } from '@/constants/colors';

export interface EntityPickerItem {
  id: string;
  label: string;
  balance?: string;
}

export interface EntityPickerModalProps {
  visible: boolean;
  title: string;
  items: EntityPickerItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onClose: () => void;
  searchValue: string;
  onSearchChange: (text: string) => void;
  renderIcon: (item: EntityPickerItem, isSelected: boolean) => React.ReactNode;
  selectedColor?: string;
}

export function EntityPickerModal({
  visible,
  title,
  items,
  selectedId,
  onSelect,
  onClose,
  searchValue,
  onSearchChange,
  renderIcon,
  selectedColor = colors.info,
}: EntityPickerModalProps) {
  const { t } = useTranslation(['common']);
  const insets = useSafeAreaInsets();
  const windowHeight = Dimensions.get('window').height;

  if (!visible) return null;

  return (
    <Modal
      visible
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback onPress={() => {}}>
            <View style={[styles.content, { height: windowHeight * 0.7, paddingBottom: insets.bottom }]}>
              <View style={styles.header}>
                <Text style={styles.title}>{title}</Text>
                <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                  <X size={24} color={colors.text} />
                </TouchableOpacity>
              </View>
              <View style={styles.searchContainer}>
                <Search size={20} color={colors.textMuted} />
                <TextInput
                  style={styles.searchInput}
                  placeholder={t('common:search.searchPlaceholder')}
                  placeholderTextColor={colors.textMuted}
                  value={searchValue}
                  onChangeText={onSearchChange}
                  autoCorrect={false}
                />
                {searchValue.length > 0 && (
                  <TouchableOpacity onPress={() => onSearchChange('')}>
                    <X size={18} color={colors.textMuted} />
                  </TouchableOpacity>
                )}
              </View>
              <ScrollView
                style={styles.list}
                contentContainerStyle={styles.listContent}
                keyboardShouldPersistTaps="handled"
              >
                {items.map((item) => {
                  const isSelected = selectedId === item.id;
                  return (
                    <TouchableOpacity
                      key={item.id}
                      style={[styles.item, isSelected && styles.itemSelected]}
                      onPress={() => onSelect(item.id)}
                    >
                      {renderIcon(item, isSelected)}
                      <Text style={[styles.itemText, isSelected && { color: colors.primary }]}>
                        {item.label}
                      </Text>
                      {item.balance !== undefined && (
                        <Text style={[styles.itemBalance, isSelected && { color: colors.primary }]}>
                          {item.balance}
                        </Text>
                      )}
                      {isSelected && (
                        <View style={[styles.checkIcon, { backgroundColor: selectedColor }]}>
                          <Check size={14} color="#FFFFFF" />
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  content: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  closeBtn: {
    padding: 4,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceLight,
    borderRadius: 12,
    marginHorizontal: 16,
    marginVertical: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: colors.text,
    paddingVertical: 4,
  },
  list: {
    flex: 1,
  },
  listContent: {
    padding: 12,
    paddingBottom: 24,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: colors.surfaceLighter,
    borderRadius: 12,
    marginBottom: 8,
  },
  itemSelected: {
    backgroundColor: colors.primaryLight + '30',
    borderWidth: 1,
    borderColor: colors.primary,
  },
  itemText: {
    flex: 1,
    fontSize: 16,
    color: colors.text,
  },
  itemBalance: {
    fontSize: 16,
    color: colors.textSecondary,
    marginRight: 8,
  },
  checkIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
