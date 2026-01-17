import {
  View,
  Modal,
  TouchableOpacity,
  TouchableWithoutFeedback,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X, Users, Building2, UserCheck, Check } from 'lucide-react-native';
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

export function TahsilatHedefTypePicker({
  visible,
  onDismiss,
  onSelect,
  selectedType,
}: TahsilatHedefTypePickerProps) {
  const { t } = useTranslation(['transactions', 'clients', 'staff']);
  const insets = useSafeAreaInsets();

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
            <View style={[styles.bottomSheetContent, { paddingBottom: insets.bottom + 16 }]}>
              <View style={styles.bottomSheetHeader}>
                <Text style={styles.bottomSheetTitle}>
                  {t('transactions:form.selectCollectionType')}
                </Text>
                <TouchableOpacity onPress={onDismiss} style={styles.bottomSheetCloseBtn}>
                  <X size={24} color={colors.text} />
                </TouchableOpacity>
              </View>

              <View style={styles.bottomSheetListContent}>
                {/* Musteri Tahsilati */}
                <TouchableOpacity
                  style={[
                    styles.tahsilatTypeItem,
                    selectedType === 'musteri' && styles.tahsilatTypeItemSelected,
                  ]}
                  onPress={() => onSelect('musteri', 'cari')}
                >
                  <View
                    style={[
                      styles.bottomSheetItemIcon,
                      { backgroundColor: colors.successLight },
                    ]}
                  >
                    <Users size={24} color={colors.success} />
                  </View>
                  <View style={styles.odemeTypeContent}>
                    <Text
                      style={[
                        styles.odemeTypeTitle,
                        selectedType === 'musteri' && { color: colors.success },
                      ]}
                    >
                      {t('clients:transactionTitles.customerCollection')}
                    </Text>
                    <Text style={styles.odemeTypeSubtext}>
                      {t('clients:transactionDescriptions.customerCollection')}
                    </Text>
                  </View>
                  {selectedType === 'musteri' && (
                    <View style={[styles.checkIcon, { backgroundColor: colors.success }]}>
                      <Check size={14} color="#FFFFFF" />
                    </View>
                  )}
                </TouchableOpacity>

                {/* Tedarikci Tahsilati */}
                <TouchableOpacity
                  style={[
                    styles.tahsilatTypeItem,
                    selectedType === 'tedarikci' && styles.tahsilatTypeItemSelected,
                  ]}
                  onPress={() => onSelect('tedarikci', 'cari')}
                >
                  <View
                    style={[
                      styles.bottomSheetItemIcon,
                      { backgroundColor: colors.successLight },
                    ]}
                  >
                    <Building2 size={24} color={colors.success} />
                  </View>
                  <View style={styles.odemeTypeContent}>
                    <Text
                      style={[
                        styles.odemeTypeTitle,
                        selectedType === 'tedarikci' && { color: colors.success },
                      ]}
                    >
                      {t('clients:transactionTitles.supplierCollection')}
                    </Text>
                    <Text style={styles.odemeTypeSubtext}>
                      {t('clients:transactionDescriptions.supplierCollection')}
                    </Text>
                  </View>
                  {selectedType === 'tedarikci' && (
                    <View style={[styles.checkIcon, { backgroundColor: colors.success }]}>
                      <Check size={14} color="#FFFFFF" />
                    </View>
                  )}
                </TouchableOpacity>

                {/* Personel Tahsilati */}
                <TouchableOpacity
                  style={[
                    styles.tahsilatTypeItem,
                    selectedType === 'personel' && styles.tahsilatTypeItemSelected,
                  ]}
                  onPress={() => onSelect('personel', 'personel')}
                >
                  <View
                    style={[
                      styles.bottomSheetItemIcon,
                      { backgroundColor: colors.successLight },
                    ]}
                  >
                    <UserCheck size={24} color={colors.success} />
                  </View>
                  <View style={styles.odemeTypeContent}>
                    <Text
                      style={[
                        styles.odemeTypeTitle,
                        selectedType === 'personel' && { color: colors.success },
                      ]}
                    >
                      {t('staff:transactionTitles.collection')}
                    </Text>
                    <Text style={styles.odemeTypeSubtext}>
                      {t('staff:transactionDescriptions.personnelCollection')}
                    </Text>
                  </View>
                  {selectedType === 'personel' && (
                    <View style={[styles.checkIcon, { backgroundColor: colors.success }]}>
                      <Check size={14} color="#FFFFFF" />
                    </View>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}
