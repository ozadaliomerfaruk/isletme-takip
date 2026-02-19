import { useCallback } from 'react';
import {
  View,
  Modal,
  TouchableOpacity,
  TouchableWithoutFeedback,
  ScrollView,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X, CreditCard, Check } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { Text } from '@/components/ui';
import { colors } from '@/constants/colors';
import { formatCurrency } from '@/lib/currency';
import { styles } from '../styles';

interface KrediKartiHesap {
  id: string;
  name: string;
  balance: number;
  currency?: string;
}

export interface KrediKartiPickerSheetProps {
  visible: boolean;
  onDismiss: () => void;
  onSelect: (hesapId: string) => void;
  krediKartiHesaplari: KrediKartiHesap[];
  selectedId: string | null;
}

export function KrediKartiPickerSheet({
  visible,
  onDismiss,
  onSelect,
  krediKartiHesaplari,
  selectedId,
}: KrediKartiPickerSheetProps) {
  const { t } = useTranslation(['accounts']);
  const insets = useSafeAreaInsets();
  const windowHeight = Dimensions.get('window').height;

  const handleSelect = useCallback(
    (hesapId: string) => {
      onSelect(hesapId);
    },
    [onSelect]
  );

  if (!visible) return null;

  return (
    <Modal
      visible
      transparent
      animationType="slide"
      onRequestClose={onDismiss}
    >
      <TouchableWithoutFeedback onPress={onDismiss}>
        <View style={styles.bottomSheetOverlay}>
          <TouchableWithoutFeedback onPress={() => {}}>
            <View
              style={[
                styles.bottomSheetContent,
                { height: windowHeight * 0.5, paddingBottom: insets.bottom },
              ]}
            >
              <View style={styles.bottomSheetHeader}>
                <Text style={styles.bottomSheetTitle}>
                  {t('accounts:titles.selectCreditCard')}
                </Text>
                <TouchableOpacity onPress={onDismiss} style={styles.bottomSheetCloseBtn}>
                  <X size={24} color={colors.text} />
                </TouchableOpacity>
              </View>

              <ScrollView
                style={styles.bottomSheetList}
                contentContainerStyle={styles.bottomSheetListContent}
                keyboardShouldPersistTaps="handled"
              >
                {krediKartiHesaplari.map((hesap) => {
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
                          { backgroundColor: colors.orangeLight },
                        ]}
                      >
                        <CreditCard size={20} color={colors.orange} />
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
                        <View style={[styles.checkIcon, { backgroundColor: colors.orange }]}>
                          <Check size={14} color="#FFFFFF" />
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
                {krediKartiHesaplari.length === 0 && (
                  <View style={styles.emptySearchState}>
                    <CreditCard size={48} color={colors.textMuted} />
                    <Text style={styles.emptySearchText}>
                      {t('accounts:messages.noCreditCards')}
                    </Text>
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
