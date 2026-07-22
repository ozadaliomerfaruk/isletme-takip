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
import { X, Search, UserCheck, Check } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { Text, FloatingSearchBar } from '@/components/ui';
import { colors } from '@/constants/colors';
import { formatCurrency } from '@/lib/currency';
import { searchMatchesTr } from '@/lib/turkishTextUtils';
import { styles } from '../styles';
import type { PendingModal } from '../types';

interface Personel {
  id: string;
  first_name: string;
  last_name: string | null;
  balance: number;
  currency: string;
}

export interface PersonelPickerSheetProps {
  visible: boolean;
  onDismiss: () => void;
  onSelect: (personelId: string) => void;
  personelList: Personel[];
  selectedId: string | null;
  // Sequential modal handling
  pendingModal?: PendingModal;
  onPendingModalHandled?: (modal: PendingModal) => void;
}

export function PersonelPickerSheet({
  visible,
  onDismiss,
  onSelect,
  personelList,
  selectedId,
  pendingModal,
  onPendingModalHandled,
}: PersonelPickerSheetProps) {
  const { t } = useTranslation(['staff', 'common']);
  const insets = useSafeAreaInsets();
  const windowHeight = Dimensions.get('window').height;

  const [searchQuery, setSearchQuery] = useState('');

  // Filter personel
  const filteredPersonel = useMemo(() => {
    if (!searchQuery.trim()) return personelList;
    return personelList.filter((p) =>
      searchMatchesTr(`${p.first_name} ${p.last_name}`, searchQuery)
    );
  }, [personelList, searchQuery]);

  const handleClose = useCallback(() => {
    setSearchQuery('');
    onDismiss();
  }, [onDismiss]);

  const handleSelect = useCallback(
    (personelId: string) => {
      onSelect(personelId);
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
                { height: windowHeight * 0.78, paddingBottom: insets.bottom },
              ]}
            >
              <View style={styles.bottomSheetHeader}>
                <Text style={styles.bottomSheetTitle}>
                  {t('staff:transactionForm.selectPersonel')}
                </Text>
                <TouchableOpacity onPress={handleClose} style={styles.bottomSheetCloseBtn}>
                  <X size={24} color={colors.text} />
                </TouchableOpacity>
              </View>

              <ScrollView
                style={styles.bottomSheetList}
                contentContainerStyle={styles.bottomSheetListContent}
                keyboardShouldPersistTaps="handled"
              >
                {filteredPersonel.map((personel) => {
                  const isSelected = selectedId === personel.id;
                  return (
                    <TouchableOpacity
                      key={personel.id}
                      style={[
                        styles.bottomSheetItem,
                        isSelected && styles.bottomSheetItemSelected,
                      ]}
                      onPress={() => handleSelect(personel.id)}
                    >
                      <View
                        style={[
                          styles.bottomSheetItemIcon,
                          { backgroundColor: colors.orangeLight },
                        ]}
                      >
                        <UserCheck size={20} color={colors.orange} />
                      </View>
                      <Text
                        style={[
                          styles.bottomSheetItemText,
                          isSelected && { color: colors.primary },
                        ]}
                      >
                        {personel.first_name} {personel.last_name}
                      </Text>
                      <Text
                        style={[
                          styles.bottomSheetItemBalance,
                          isSelected && { color: colors.primary },
                        ]}
                      >
                        {formatCurrency(personel.balance, personel.currency)}
                      </Text>
                      {isSelected && (
                        <View style={[styles.checkIcon, { backgroundColor: colors.orange }]}>
                          <Check size={14} color="#FFFFFF" />
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
                {filteredPersonel.length === 0 && searchQuery.trim() && (
                  <View style={styles.emptySearchState}>
                    <Search size={48} color={colors.textMuted} />
                    <Text style={styles.emptySearchText}>{t('common:search.noResults')}</Text>
                  </View>
                )}
                {filteredPersonel.length === 0 && !searchQuery.trim() && (
                  <View style={styles.emptySearchState}>
                    <UserCheck size={48} color={colors.textMuted} />
                    <Text style={styles.emptySearchText}>
                      {t('staff:messages.noPersonnel')}
                    </Text>
                  </View>
                )}
              </ScrollView>

              {/* Sheet altında yüzen arama çubuğu */}
              <FloatingSearchBar
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder={t('staff:search.searchPersonnel')}
                bottomOffset={16 + insets.bottom + 12}
              />
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}
