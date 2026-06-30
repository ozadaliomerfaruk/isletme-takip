import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Modal,
  TouchableOpacity,
  TouchableWithoutFeedback,
  TextInput,
  ScrollView,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X, Search, Users, Building2, Check, Plus } from 'lucide-react-native';
import { ActivityIndicator } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Text } from '@/components/ui';
import { colors } from '@/constants/colors';
import { formatCurrency } from '@/lib/currency';
import { textIncludes } from '@/lib/turkishTextUtils';
import { styles } from '../styles';
import type { PendingModal } from '../types';

interface Cari {
  id: string;
  name: string;
  balance: number;
  currency: string;
}

export type CariPickerMode = 'customer' | 'supplier';

export interface CariPickerSheetProps {
  visible: boolean;
  onDismiss: () => void;
  onSelect: (cariId: string) => void;
  cariler: Cari[];
  selectedId: string | null;
  mode: CariPickerMode;
  // Inline cari oluşturma (v1.5): verilirse, aranan isim listede yoksa
  // "+ ... olarak ekle" satırı gösterilir. Oluşturma üst bileşende yapılır
  // (useCreateCari) ve başarıda onSelect çağrılması beklenir.
  onCreateNew?: (name: string) => void;
  creating?: boolean;
  // Sequential modal handling
  pendingModal?: PendingModal;
  onPendingModalHandled?: (modal: PendingModal) => void;
}

export function CariPickerSheet({
  visible,
  onDismiss,
  onSelect,
  cariler,
  selectedId,
  mode,
  onCreateNew,
  creating,
  pendingModal,
  onPendingModalHandled,
}: CariPickerSheetProps) {
  const { t } = useTranslation(['clients', 'common']);
  const insets = useSafeAreaInsets();
  const windowHeight = Dimensions.get('window').height;

  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<TextInput>(null);

  // Auto-focus search input when sheet opens
  useEffect(() => {
    if (visible) {
      const timer = setTimeout(() => searchInputRef.current?.focus(), 400);
      return () => clearTimeout(timer);
    }
  }, [visible]);

  const isCustomer = mode === 'customer';
  const iconColor = isCustomer ? colors.primary : colors.orange;
  const iconBgColor = isCustomer ? colors.primaryLight : colors.orangeLight;

  // Filter cariler
  const filteredCariler = useMemo(() => {
    if (!searchQuery.trim()) return cariler;
    return cariler.filter((c) => textIncludes(c.name, searchQuery));
  }, [cariler, searchQuery]);

  const handleClose = useCallback(() => {
    setSearchQuery('');
    onDismiss();
  }, [onDismiss]);

  const handleSelect = useCallback(
    (cariId: string) => {
      onSelect(cariId);
      setSearchQuery('');

      // Handle sequential modal opening
      if (pendingModal && onPendingModalHandled) {
        setTimeout(() => {
          onPendingModalHandled(pendingModal);
        }, 250);
      }
    },
    [onSelect, pendingModal, onPendingModalHandled]
  );

  // Inline oluşturma satırı: arama dolu, birebir isim eşleşmesi yok ve onCreateNew verili
  const trimmedQuery = searchQuery.trim();
  const showCreateRow =
    !!onCreateNew &&
    trimmedQuery.length > 0 &&
    !cariler.some((c) => c.name.toLowerCase() === trimmedQuery.toLowerCase());

  const handleCreateNew = useCallback(() => {
    if (!onCreateNew || !trimmedQuery || creating) return;
    onCreateNew(trimmedQuery);
    // Seçim, oluşturma başarısında üst bileşenin onSelect çağrısıyla yapılır;
    // arama metni orada handleSelect üzerinden temizlenir.
  }, [onCreateNew, trimmedQuery, creating]);

  if (!visible) return null;

  const title = isCustomer
    ? t('clients:transactionForm.selectCustomer')
    : t('clients:transactionForm.selectSupplier');

  const searchPlaceholder = isCustomer
    ? t('clients:search.searchCustomers')
    : t('clients:search.searchSuppliers');

  const emptyMessage = isCustomer
    ? t('clients:messages.noCustomers')
    : t('clients:messages.noSuppliers');

  return (
    <Modal
      visible
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <TouchableWithoutFeedback onPress={handleClose}>
        <View style={styles.bottomSheetOverlay}>
          <TouchableWithoutFeedback onPress={() => {}}>
            <View
              style={[
                styles.bottomSheetContent,
                { height: windowHeight * 0.7, paddingBottom: insets.bottom },
              ]}
            >
              <View style={styles.bottomSheetHeader}>
                <Text style={styles.bottomSheetTitle}>{title}</Text>
                <TouchableOpacity onPress={handleClose} style={styles.bottomSheetCloseBtn}>
                  <X size={24} color={colors.text} />
                </TouchableOpacity>
              </View>

              {/* Search Bar */}
              <View style={styles.searchContainer}>
                <Search size={20} color={colors.textMuted} />
                <TextInput
                  ref={searchInputRef}
                  style={styles.searchInput}
                  placeholder={searchPlaceholder}
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

              <ScrollView
                style={styles.bottomSheetList}
                contentContainerStyle={styles.bottomSheetListContent}
                keyboardShouldPersistTaps="handled"
              >
                {filteredCariler.map((cari) => {
                  const isSelected = selectedId === cari.id;
                  return (
                    <TouchableOpacity
                      key={cari.id}
                      style={[
                        styles.bottomSheetItem,
                        isSelected && styles.bottomSheetItemSelected,
                      ]}
                      onPress={() => handleSelect(cari.id)}
                    >
                      <View style={[styles.bottomSheetItemIcon, { backgroundColor: iconBgColor }]}>
                        {isCustomer ? (
                          <Users size={20} color={iconColor} />
                        ) : (
                          <Building2 size={20} color={iconColor} />
                        )}
                      </View>
                      <Text
                        style={[
                          styles.bottomSheetItemText,
                          isSelected && { color: colors.primary },
                        ]}
                      >
                        {cari.name}
                      </Text>
                      <Text
                        style={[
                          styles.bottomSheetItemBalance,
                          isSelected && { color: colors.primary },
                        ]}
                      >
                        {formatCurrency(cari.balance, cari.currency)}
                      </Text>
                      {isSelected && (
                        <View style={[styles.checkIcon, { backgroundColor: iconColor }]}>
                          <Check size={14} color="#FFFFFF" />
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
                {showCreateRow && (
                  <TouchableOpacity
                    style={[styles.bottomSheetItem, { borderStyle: 'dashed', borderWidth: 1, borderColor: iconColor }]}
                    onPress={handleCreateNew}
                    disabled={creating}
                  >
                    <View style={[styles.bottomSheetItemIcon, { backgroundColor: iconBgColor }]}>
                      {creating ? (
                        <ActivityIndicator size="small" color={iconColor} />
                      ) : (
                        <Plus size={20} color={iconColor} />
                      )}
                    </View>
                    <Text style={[styles.bottomSheetItemText, { color: iconColor }]}>
                      {t('clients:picker.addNew', { name: trimmedQuery })}
                    </Text>
                  </TouchableOpacity>
                )}
                {filteredCariler.length === 0 && searchQuery.trim() && !showCreateRow && (
                  <View style={styles.emptySearchState}>
                    <Search size={48} color={colors.textMuted} />
                    <Text style={styles.emptySearchText}>{t('common:search.noResults')}</Text>
                  </View>
                )}
                {filteredCariler.length === 0 && !searchQuery.trim() && (
                  <View style={styles.emptySearchState}>
                    {isCustomer ? (
                      <Users size={48} color={colors.textMuted} />
                    ) : (
                      <Building2 size={48} color={colors.textMuted} />
                    )}
                    <Text style={styles.emptySearchText}>{emptyMessage}</Text>
                  </View>
                )}
              </ScrollView>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}
