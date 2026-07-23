import {
  View,
  Modal,
  TouchableOpacity,
  TouchableWithoutFeedback,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X, Check, ChevronRight } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { Text } from '@/components/ui';
import { colors } from '@/constants/colors';
import { styles } from '../styles';
import type { TahsilatHedefType } from '../types';

export interface TahsilatHedefTypePickerProps {
  visible: boolean;
  onDismiss: () => void;
  onSelect: (type: TahsilatHedefType, nextModal: 'cari' | 'personel') => void;
  selectedType: TahsilatHedefType;
}

const OPTIONS: {
  type: TahsilatHedefType;
  nextModal: 'cari' | 'personel';
  titleKey: string;
  subtextKey: string;
}[] = [
  {
    type: 'musteri',
    nextModal: 'cari',
    titleKey: 'clients:transactionTitles.customerCollection',
    subtextKey: 'clients:transactionDescriptions.customerCollection',
  },
  {
    type: 'tedarikci',
    nextModal: 'cari',
    titleKey: 'clients:transactionTitles.supplierCollection',
    subtextKey: 'clients:transactionDescriptions.supplierCollection',
  },
  {
    type: 'personel',
    nextModal: 'personel',
    titleKey: 'staff:transactionTitles.collection',
    subtextKey: 'staff:transactionDescriptions.personnelCollection',
  },
];

export function TahsilatHedefTypePicker({
  visible,
  onDismiss,
  onSelect,
  selectedType,
}: TahsilatHedefTypePickerProps) {
  const { t } = useTranslation(['transactions', 'clients', 'staff']);
  const insets = useSafeAreaInsets();

  if (!visible) return null;

  // Aksan rengi: tahsilat = para girişi → yeşil (standart işlem satırı dili)
  const accent = colors.success;

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
            <View style={[styles.bottomSheetContent, { paddingBottom: insets.bottom + 8 }]}>
              <View style={styles.bottomSheetHeader}>
                <Text style={styles.bottomSheetTitle}>
                  {t('transactions:form.selectCollectionType')}
                </Text>
                <TouchableOpacity onPress={onDismiss} style={styles.bottomSheetCloseBtn}>
                  <X size={24} color={colors.text} />
                </TouchableOpacity>
              </View>

              <View style={styles.hedefList}>
                {OPTIONS.map((opt) => {
                  const selected = selectedType === opt.type;
                  return (
                    <TouchableOpacity
                      key={opt.type}
                      style={[styles.hedefRow, selected && styles.hedefRowSelected]}
                      onPress={() => onSelect(opt.type, opt.nextModal)}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.hedefBar, { backgroundColor: accent }]} />
                      <View style={styles.hedefContent}>
                        <Text
                          style={[styles.hedefTitle, selected && { color: accent }]}
                          numberOfLines={1}
                        >
                          {t(opt.titleKey)}
                        </Text>
                        <Text style={styles.hedefSubtext} numberOfLines={1}>
                          {t(opt.subtextKey)}
                        </Text>
                      </View>
                      {selected ? (
                        <View style={[styles.hedefCheck, { backgroundColor: accent }]}>
                          <Check size={13} color="#FFFFFF" />
                        </View>
                      ) : (
                        <ChevronRight size={18} color={colors.textMuted} />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}
