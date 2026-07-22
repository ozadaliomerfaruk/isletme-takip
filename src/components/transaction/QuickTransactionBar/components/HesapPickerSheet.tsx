import { useState, useMemo, useCallback } from 'react';
import {
  View,
  Modal,
  TouchableOpacity,
  TouchableWithoutFeedback,
  ScrollView,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X, Search, Wallet, Check } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { Text, FloatingSearchBar } from '@/components/ui';
import { colors } from '@/constants/colors';
import { formatCurrency } from '@/lib/currency';
import { searchMatchesTr } from '@/lib/turkishTextUtils';
import { styles } from '../styles';
import type { HesapPickerTarget, PendingModal } from '../types';

interface Hesap {
  id: string;
  name: string;
  balance: number;
  currency?: string;
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

  // Filter and sort hesaplar alphabetically (A-Z)
  const filteredHesaplar = useMemo(() => {
    const list = excludeId ? hesaplar.filter((h) => h.id !== excludeId) : [...hesaplar];
    const sorted = list.sort((a, b) => a.name.localeCompare(b.name, 'tr'));
    if (!searchQuery.trim()) return sorted;
    return sorted.filter((h) => searchMatchesTr(h.name, searchQuery));
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
                { height: windowHeight * 0.85, paddingBottom: insets.bottom },
              ]}
            >
              <View style={styles.bottomSheetHeader}>
                <Text style={styles.bottomSheetTitle}>{title}</Text>
                <TouchableOpacity onPress={handleClose} style={styles.bottomSheetCloseBtn}>
                  <X size={24} color={colors.text} />
                </TouchableOpacity>
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
                        {formatCurrency(hesap.balance, hesap.currency)}
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

              {/* Sheet altında yüzen arama çubuğu */}
              <FloatingSearchBar
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder={t('common:search.searchPlaceholder')}
                bottomOffset={16 + insets.bottom + 12}
              />
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}
