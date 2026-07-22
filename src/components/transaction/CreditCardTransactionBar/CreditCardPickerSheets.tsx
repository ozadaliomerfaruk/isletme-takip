import { View, Modal, TouchableOpacity, TouchableWithoutFeedback, ScrollView, Dimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X, Search, Check, Wallet, Building2, UserCheck } from 'lucide-react-native';
import { Text, ModalSearchBar } from '@/components/ui';
import { colors } from '@/constants/colors';
import type { Hesap, Cari, Personel } from '@/types/database';
import { styles } from './styles';

type OdemeHedefType = 'tedarikci' | 'staff';

interface HesapPickerSheetProps {
  visible: boolean;
  onDismiss: () => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  filteredHesaplar: Hesap[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  t: (key: string) => string;
}

export function HesapPickerSheet({
  visible,
  onDismiss,
  searchQuery,
  onSearchChange,
  filteredHesaplar,
  selectedId,
  onSelect,
  t,
}: HesapPickerSheetProps) {
  const insets = useSafeAreaInsets();
  const windowHeight = Dimensions.get('window').height;

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onDismiss}>
      <TouchableWithoutFeedback onPress={onDismiss}>
        <View style={styles.bottomSheetOverlay}>
          <TouchableWithoutFeedback onPress={() => {}}>
            <View style={[styles.bottomSheetContent, { height: windowHeight * 0.7, paddingBottom: insets.bottom }]}>
              <View style={styles.bottomSheetHeader}>
                <Text style={styles.bottomSheetTitle}>{t('accounts:titles.selectAccount')}</Text>
                <TouchableOpacity onPress={onDismiss} style={styles.bottomSheetCloseBtn}>
                  <X size={24} color={colors.text} />
                </TouchableOpacity>
              </View>

              {/* Başlık altında sabit arama çubuğu */}
              <ModalSearchBar
                value={searchQuery}
                onChangeText={onSearchChange}
                placeholder={t('common:search.searchPlaceholder')}
              />

              <ScrollView style={styles.bottomSheetList} contentContainerStyle={styles.bottomSheetListContent} keyboardShouldPersistTaps="handled">
                {filteredHesaplar.map((hesap) => {
                  const isSelected = selectedId === hesap.id;
                  return (
                    <TouchableOpacity
                      key={hesap.id}
                      style={[styles.bottomSheetItem, isSelected && styles.bottomSheetItemSelected]}
                      onPress={() => onSelect(hesap.id)}
                    >
                      <View style={[styles.bottomSheetItemIcon, { backgroundColor: colors.infoLight }]}>
                        <Wallet size={20} color={colors.info} />
                      </View>
                      <Text style={[styles.bottomSheetItemText, isSelected && { color: colors.primary }]}>{hesap.name}</Text>
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

interface CariPickerSheetProps {
  visible: boolean;
  onDismiss: () => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  filteredCariler: Cari[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  t: (key: string) => string;
}

export function CariPickerSheet({
  visible,
  onDismiss,
  searchQuery,
  onSearchChange,
  filteredCariler,
  selectedId,
  onSelect,
  t,
}: CariPickerSheetProps) {
  const insets = useSafeAreaInsets();
  const windowHeight = Dimensions.get('window').height;

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onDismiss}>
      <TouchableWithoutFeedback onPress={onDismiss}>
        <View style={styles.bottomSheetOverlay}>
          <TouchableWithoutFeedback onPress={() => {}}>
            <View style={[styles.bottomSheetContent, { height: windowHeight * 0.7, paddingBottom: insets.bottom }]}>
              <View style={styles.bottomSheetHeader}>
                <Text style={styles.bottomSheetTitle}>{t('clients:transactionForm.selectSupplier')}</Text>
                <TouchableOpacity onPress={onDismiss} style={styles.bottomSheetCloseBtn}>
                  <X size={24} color={colors.text} />
                </TouchableOpacity>
              </View>

              {/* Başlık altında sabit arama çubuğu */}
              <ModalSearchBar
                value={searchQuery}
                onChangeText={onSearchChange}
                placeholder={t('clients:search.searchSuppliers')}
              />

              <ScrollView style={styles.bottomSheetList} contentContainerStyle={styles.bottomSheetListContent} keyboardShouldPersistTaps="handled">
                {filteredCariler.map((cari) => {
                  const isSelected = selectedId === cari.id;
                  return (
                    <TouchableOpacity
                      key={cari.id}
                      style={[styles.bottomSheetItem, isSelected && styles.bottomSheetItemSelected]}
                      onPress={() => onSelect(cari.id)}
                    >
                      <View style={[styles.bottomSheetItemIcon, { backgroundColor: colors.orangeLight }]}>
                        <Building2 size={20} color={colors.orange} />
                      </View>
                      <Text style={[styles.bottomSheetItemText, isSelected && { color: colors.primary }]}>{cari.name}</Text>
                      {isSelected && (
                        <View style={[styles.checkIcon, { backgroundColor: colors.orange }]}>
                          <Check size={14} color="#FFFFFF" />
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
                {filteredCariler.length === 0 && searchQuery.trim() && (
                  <View style={styles.emptySearchState}>
                    <Search size={48} color={colors.textMuted} />
                    <Text style={styles.emptySearchText}>{t('common:search.noResults')}</Text>
                  </View>
                )}
                {filteredCariler.length === 0 && !searchQuery.trim() && (
                  <View style={styles.emptySearchState}>
                    <Building2 size={48} color={colors.textMuted} />
                    <Text style={styles.emptySearchText}>{t('clients:messages.noSuppliers')}</Text>
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

interface PersonelPickerSheetProps {
  visible: boolean;
  onDismiss: () => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  filteredPersonel: Personel[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  t: (key: string) => string;
}

export function PersonelPickerSheet({
  visible,
  onDismiss,
  searchQuery,
  onSearchChange,
  filteredPersonel,
  selectedId,
  onSelect,
  t,
}: PersonelPickerSheetProps) {
  const insets = useSafeAreaInsets();
  const windowHeight = Dimensions.get('window').height;

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onDismiss}>
      <TouchableWithoutFeedback onPress={onDismiss}>
        <View style={styles.bottomSheetOverlay}>
          <TouchableWithoutFeedback onPress={() => {}}>
            <View style={[styles.bottomSheetContent, { height: windowHeight * 0.7, paddingBottom: insets.bottom }]}>
              <View style={styles.bottomSheetHeader}>
                <Text style={styles.bottomSheetTitle}>{t('staff:transactionForm.selectPersonel')}</Text>
                <TouchableOpacity onPress={onDismiss} style={styles.bottomSheetCloseBtn}>
                  <X size={24} color={colors.text} />
                </TouchableOpacity>
              </View>

              {/* Başlık altında sabit arama çubuğu */}
              <ModalSearchBar
                value={searchQuery}
                onChangeText={onSearchChange}
                placeholder={t('staff:search.searchPersonnel')}
              />

              <ScrollView style={styles.bottomSheetList} contentContainerStyle={styles.bottomSheetListContent} keyboardShouldPersistTaps="handled">
                {filteredPersonel.map((personel) => {
                  const isSelected = selectedId === personel.id;
                  return (
                    <TouchableOpacity
                      key={personel.id}
                      style={[styles.bottomSheetItem, isSelected && styles.bottomSheetItemSelected]}
                      onPress={() => onSelect(personel.id)}
                    >
                      <View style={[styles.bottomSheetItemIcon, { backgroundColor: colors.orangeLight }]}>
                        <UserCheck size={20} color={colors.orange} />
                      </View>
                      <Text style={[styles.bottomSheetItemText, isSelected && { color: colors.primary }]}>
                        {personel.first_name} {personel.last_name}
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
                    <Text style={styles.emptySearchText}>{t('staff:messages.noPersonnel')}</Text>
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

interface OdemeHedefTypePickerProps {
  visible: boolean;
  onDismiss: () => void;
  odemeHedefType: OdemeHedefType;
  onSelect: (type: OdemeHedefType) => void;
  t: (key: string) => string;
}

export function OdemeHedefTypePicker({
  visible,
  onDismiss,
  odemeHedefType,
  onSelect,
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
                <Text style={styles.bottomSheetTitle}>{t('transactions:form.selectPaymentType')}</Text>
                <TouchableOpacity onPress={onDismiss} style={styles.bottomSheetCloseBtn}>
                  <X size={24} color={colors.text} />
                </TouchableOpacity>
              </View>

              <View style={styles.bottomSheetListContent}>
                <TouchableOpacity
                  style={[styles.odemeTypeItem, odemeHedefType === 'tedarikci' && styles.odemeTypeItemSelected]}
                  onPress={() => onSelect('tedarikci')}
                >
                  <View style={[styles.bottomSheetItemIcon, { backgroundColor: colors.orangeLight }]}>
                    <Building2 size={24} color={colors.orange} />
                  </View>
                  <View style={styles.odemeTypeContent}>
                    <Text style={[styles.odemeTypeTitle, odemeHedefType === 'tedarikci' && { color: colors.orange }]}>
                      {t('clients:transactionTitles.supplierPayment')}
                    </Text>
                    <Text style={styles.odemeTypeSubtext}>{t('clients:transactionDescriptions.supplierPayment')}</Text>
                  </View>
                  {odemeHedefType === 'tedarikci' && (
                    <View style={[styles.checkIcon, { backgroundColor: colors.orange }]}>
                      <Check size={14} color="#FFFFFF" />
                    </View>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.odemeTypeItem, odemeHedefType === 'staff' && styles.odemeTypeItemSelected]}
                  onPress={() => onSelect('staff')}
                >
                  <View style={[styles.bottomSheetItemIcon, { backgroundColor: colors.orangeLight }]}>
                    <UserCheck size={24} color={colors.orange} />
                  </View>
                  <View style={styles.odemeTypeContent}>
                    <Text style={[styles.odemeTypeTitle, odemeHedefType === 'staff' && { color: colors.orange }]}>
                      {t('staff:transactionTitles.payment')}
                    </Text>
                    <Text style={styles.odemeTypeSubtext}>{t('staff:transactionDescriptions.personnelPayment')}</Text>
                  </View>
                  {odemeHedefType === 'staff' && (
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
