import { View, TouchableOpacity, TouchableWithoutFeedback } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X, Check, Building2, UserCheck } from 'lucide-react-native';

import { Text, Modal } from '@/components/ui';
import { colors } from '@/constants/colors';
import { styles } from './styles';

type OdemeHedefType = 'tedarikci' | 'staff';

interface OdemeHedefTypePickerProps {
  visible: boolean;
  onDismiss: () => void;
  odemeHedefType: OdemeHedefType;
  onSelect: (type: OdemeHedefType) => void;
  allowedTypes?: readonly OdemeHedefType[];
  t: (key: string) => string;
}

/**
 * Kredi kartı ödeme türü seçimi bu akışa özgüdür. Hesap, cari ve personel
 * seçimleri ise QuickTransactionBar'ın ortak picker bileşenlerini kullanır;
 * bu dosyada onların eski görsel kopyalarını yeniden oluşturma.
 */
export function OdemeHedefTypePicker({
  visible,
  onDismiss,
  odemeHedefType,
  onSelect,
  allowedTypes = ['tedarikci', 'staff'],
  t,
}: OdemeHedefTypePickerProps) {
  const insets = useSafeAreaInsets();

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onDismiss}>
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
                {allowedTypes.includes('tedarikci') && (
                  <TouchableOpacity
                    style={[
                      styles.odemeTypeItem,
                      odemeHedefType === 'tedarikci' && styles.odemeTypeItemSelected,
                    ]}
                    onPress={() => onSelect('tedarikci')}
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
                          odemeHedefType === 'tedarikci' && { color: colors.orange },
                        ]}
                      >
                        {t('clients:transactionTitles.supplierPayment')}
                      </Text>
                      <Text style={styles.odemeTypeSubtext}>
                        {t('clients:transactionDescriptions.supplierPayment')}
                      </Text>
                    </View>
                    {odemeHedefType === 'tedarikci' && (
                      <View style={[styles.checkIcon, { backgroundColor: colors.orange }]}>
                        <Check size={14} color="#FFFFFF" />
                      </View>
                    )}
                  </TouchableOpacity>
                )}

                {allowedTypes.includes('staff') && (
                  <TouchableOpacity
                    style={[
                      styles.odemeTypeItem,
                      odemeHedefType === 'staff' && styles.odemeTypeItemSelected,
                    ]}
                    onPress={() => onSelect('staff')}
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
                          odemeHedefType === 'staff' && { color: colors.orange },
                        ]}
                      >
                        {t('staff:transactionTitles.payment')}
                      </Text>
                      <Text style={styles.odemeTypeSubtext}>
                        {t('staff:transactionDescriptions.personnelPayment')}
                      </Text>
                    </View>
                    {odemeHedefType === 'staff' && (
                      <View style={[styles.checkIcon, { backgroundColor: colors.orange }]}>
                        <Check size={14} color="#FFFFFF" />
                      </View>
                    )}
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}
