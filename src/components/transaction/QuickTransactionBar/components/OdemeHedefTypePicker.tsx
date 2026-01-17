import {
  View,
  Modal,
  TouchableOpacity,
  TouchableWithoutFeedback,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X, Building2, UserCheck, CreditCard, Check } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { Text } from '@/components/ui';
import { colors } from '@/constants/colors';
import { styles } from '../styles';
import type { OdemeHedefType } from '../types';

export interface OdemeHedefTypePickerProps {
  visible: boolean;
  onDismiss: () => void;
  onSelect: (type: OdemeHedefType, nextModal: 'cari' | 'personel' | 'hesap') => void;
  selectedType: OdemeHedefType;
}

export function OdemeHedefTypePicker({
  visible,
  onDismiss,
  onSelect,
  selectedType,
}: OdemeHedefTypePickerProps) {
  const { t } = useTranslation(['transactions', 'clients', 'staff', 'accounts']);
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
                  {t('transactions:form.selectPaymentType')}
                </Text>
                <TouchableOpacity onPress={onDismiss} style={styles.bottomSheetCloseBtn}>
                  <X size={24} color={colors.text} />
                </TouchableOpacity>
              </View>

              <View style={styles.bottomSheetListContent}>
                {/* Tedarikci Odemesi */}
                <TouchableOpacity
                  style={[
                    styles.odemeTypeItem,
                    selectedType === 'tedarikci' && styles.odemeTypeItemSelected,
                  ]}
                  onPress={() => onSelect('tedarikci', 'cari')}
                >
                  <View
                    style={[
                      styles.bottomSheetItemIcon,
                      { backgroundColor: colors.orangeLight },
                    ]}
                  >
                    <Building2 size={24} color={colors.orange} />
                  </View>
                  <View style={styles.odemeTypeContent}>
                    <Text
                      style={[
                        styles.odemeTypeTitle,
                        selectedType === 'tedarikci' && { color: colors.orange },
                      ]}
                    >
                      {t('clients:transactionTitles.supplierPayment')}
                    </Text>
                    <Text style={styles.odemeTypeSubtext}>
                      {t('clients:transactionDescriptions.supplierPayment')}
                    </Text>
                  </View>
                  {selectedType === 'tedarikci' && (
                    <View style={[styles.checkIcon, { backgroundColor: colors.orange }]}>
                      <Check size={14} color="#FFFFFF" />
                    </View>
                  )}
                </TouchableOpacity>

                {/* Personel Odemesi */}
                <TouchableOpacity
                  style={[
                    styles.odemeTypeItem,
                    selectedType === 'staff' && styles.odemeTypeItemSelected,
                  ]}
                  onPress={() => onSelect('staff', 'personel')}
                >
                  <View
                    style={[
                      styles.bottomSheetItemIcon,
                      { backgroundColor: colors.orangeLight },
                    ]}
                  >
                    <UserCheck size={24} color={colors.orange} />
                  </View>
                  <View style={styles.odemeTypeContent}>
                    <Text
                      style={[
                        styles.odemeTypeTitle,
                        selectedType === 'staff' && { color: colors.orange },
                      ]}
                    >
                      {t('staff:transactionTitles.payment')}
                    </Text>
                    <Text style={styles.odemeTypeSubtext}>
                      {t('staff:transactionDescriptions.personnelPayment')}
                    </Text>
                  </View>
                  {selectedType === 'staff' && (
                    <View style={[styles.checkIcon, { backgroundColor: colors.orange }]}>
                      <Check size={14} color="#FFFFFF" />
                    </View>
                  )}
                </TouchableOpacity>

                {/* Kredi Karti Odemesi */}
                <TouchableOpacity
                  style={[
                    styles.odemeTypeItem,
                    selectedType === 'kredi_karti' && styles.odemeTypeItemSelected,
                  ]}
                  onPress={() => onSelect('kredi_karti', 'hesap')}
                >
                  <View
                    style={[
                      styles.bottomSheetItemIcon,
                      { backgroundColor: colors.orangeLight },
                    ]}
                  >
                    <CreditCard size={24} color={colors.orange} />
                  </View>
                  <View style={styles.odemeTypeContent}>
                    <Text
                      style={[
                        styles.odemeTypeTitle,
                        selectedType === 'kredi_karti' && { color: colors.orange },
                      ]}
                    >
                      {t('accounts:transactionTitles.creditCardPayment')}
                    </Text>
                    <Text style={styles.odemeTypeSubtext}>
                      {t('accounts:transactionDescriptions.creditCardPayment')}
                    </Text>
                  </View>
                  {selectedType === 'kredi_karti' && (
                    <View style={[styles.checkIcon, { backgroundColor: colors.orange }]}>
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
