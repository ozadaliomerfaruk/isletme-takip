import { useState, useMemo, useCallback } from 'react';
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
import { X, Search, Wallet, Check } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { Text } from '@/components/ui';
import { colors } from '@/constants/colors';
import { formatCurrency } from '@/lib/currency';
import { styles } from '../styles';
import type { HesapPickerTarget, PendingModal } from '../types';

interface Hesap {
  id: string;
  name: string;
  balance: number;
}

export interface HesapPickerSheetProps {
  visible: boolean;
  onDismiss: () => void;
  onSelect: (hesapId: string) => void;
  hesaplar: Hesap[];
  selectedId: string | null;
  target: HesapPickerTarget;
  excludeId?: string;
  // Sequential modal handling
  pendingModal?: PendingModal;
  onPendingModalHandled?: (modal: PendingModal) => void;
}

export function HesapPickerSheet({
  visible,
  onDismiss,
  onSelect,
  hesaplar,
  selectedId,
  target,
  excludeId,
  pendingModal,
  onPendingModalHandled,
}: HesapPickerSheetProps) {
  const { t } = useTranslation(['accounts', 'transactions', 'common']);
  const insets = useSafeAreaInsets();
  const windowHeight = Dimensions.get('window').height;

  const [searchQuery, setSearchQuery] = useState('');

  // Filter hesaplar
  const filteredHesaplar = useMemo(() => {
    let list = excludeId ? hesaplar.filter((h) => h.id !== excludeId) : hesaplar;
    if (!searchQuery.trim()) return list;
    const query = searchQuery.toLowerCase().trim();
    return list.filter((h) => h.name.toLowerCase().includes(query));
  }, [hesaplar, searchQuery, excludeId]);

  const handleClose = useCallback(() => {
    setSearchQuery('');
    onDismiss();
  }, [onDismiss]);

  const handleSelect = useCallback(
    (hesapId: string) => {
      onSelect(hesapId);
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

  if (!visible) return null;

  const title =
    target === 'source'
      ? t('accounts:titles.selectAccount')
      : t('transactions:form.targetAccount');

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
                  style={styles.searchInput}
                  placeholder={t('common:search.searchPlaceholder')}
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
                {filteredHesaplar.map((hesap) => {
                  const isSelected = selectedId === hesap.id;
                  return (
                    <TouchableOpacity
                      key={hesap.id}
                      style={[
                        styles.bottomSheetItem,
                        isSelected && styles.bottomSheetItemSelected,
                      ]}
                      onPress={() => handleSelect(hesap.id)}
                    >
                      <View
                        style={[
                          styles.bottomSheetItemIcon,
                          { backgroundColor: colors.infoLight },
                        ]}
                      >
                        <Wallet size={20} color={colors.info} />
                      </View>
                      <Text
                        style={[
                          styles.bottomSheetItemText,
                          isSelected && { color: colors.primary },
                        ]}
                      >
                        {hesap.name}
                      </Text>
                      <Text
                        style={[
                          styles.bottomSheetItemBalance,
                          isSelected && { color: colors.primary },
                        ]}
                      >
                        {formatCurrency(hesap.balance)}
                      </Text>
                      {isSelected && (
                        <View style={[styles.checkIcon, { backgroundColor: colors.info }]}>
                          <Check size={14} color="#FFFFFF" />
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
                {filteredHesaplar.length === 0 && searchQuery.trim() && (
                  <View style={styles.emptySearchState}>
                    <Search size={48} color={colors.textMuted} />
                    <Text style={styles.emptySearchText}>{t('common:search.noResults')}</Text>
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
