import { useState, useEffect, useMemo } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Modal,
  Dimensions,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import DateTimePickerRN from '@react-native-community/datetimepicker';
import { Check, Calendar } from 'lucide-react-native';
import { Text, Button, Card, CategoryPicker, CurrencyInput } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { usePersonelList } from '@/hooks/usePersonel';
import { useCreateIslem } from '@/hooks/useIslemler';
import { useDateFormat } from '@/hooks/useDateFormat';
import { formatDateTimeForDB, isToday, ensureValidDate } from '@/lib/date';
import { formatCurrency, parseCurrency, toNumber } from '@/lib/currency';
import { getInitials } from '@/lib/utils';
import { toErrorMessage } from '@/lib/errors';
import { usePagePermission } from '@/hooks/usePagePermission';

export default function TopluGiderPage() {
  const router = useRouter();
  const { t } = useTranslation(['staff', 'common', 'transactions']);
  usePagePermission({ module: 'personel', action: 'create' });
  const createIslem = useCreateIslem();
  const { locale, formatDateMedium } = useDateFormat();
  const windowHeight = Dimensions.get('window').height;

  // Varsayılan tarih: Bu ayın son günü 23:59
  const getDefaultDate = () => {
    const now = new Date();
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    lastDay.setHours(23, 59, 0, 0);
    return lastDay;
  };

  const [date, setDate] = useState(getDefaultDate());
  const safeDate = useMemo(() => ensureValidDate(date), [date]);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [kategoriId, setKategoriId] = useState<string | null>(null);
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);
  const [categorySkipped, setCategorySkipped] = useState(false);
  const [selectedPersonel, setSelectedPersonel] = useState<Set<string>>(new Set());
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [description, setDescription] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const { data: personelList, isLoading } = usePersonelList();

  // Aktif personel listesi
  const activePersonel = useMemo(() => {
    return personelList?.filter(p => p.is_active) || [];
  }, [personelList]);

  // Başlangıçta tüm personeli seç ve maaşlarını doldur
  useEffect(() => {
    if (activePersonel.length > 0) {
      const allIds = new Set(activePersonel.map(p => p.id));
      setSelectedPersonel(allIds);

      // Personellerin maaşlarını otomatik doldur (maaşı yoksa 0)
      const initialAmounts: Record<string, string> = {};
      activePersonel.forEach(personel => {
        const salary = personel.salary ? toNumber(personel.salary) : 0;
        initialAmounts[personel.id] = String(salary).replace('.', ',');
      });
      setAmounts(initialAmounts);
    }
  }, [activePersonel]);

  const handleSelectAll = () => {
    const allIds = new Set(activePersonel.map(p => p.id));
    setSelectedPersonel(allIds);
  };

  const handleSelectNone = () => {
    setSelectedPersonel(new Set());
  };

  const handleToggle = (id: string) => {
    const newSet = new Set(selectedPersonel);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedPersonel(newSet);
  };

  const handleAmountChange = (personelId: string, value: string) => {
    setAmounts(prev => ({ ...prev, [personelId]: value }));
  };

  // Toplam tutar hesapla
  const totalAmount = useMemo(() => {
    let total = 0;
    selectedPersonel.forEach(id => {
      const amount = parseCurrency(amounts[id] || '0');
      if (amount > 0) {
        total += amount;
      }
    });
    return total;
  }, [selectedPersonel, amounts]);

  // Seçili personel sayısı
  const selectedCount = useMemo(() => {
    let count = 0;
    selectedPersonel.forEach(id => {
      const amount = parseCurrency(amounts[id] || '0');
      if (amount > 0) {
        count++;
      }
    });
    return count;
  }, [selectedPersonel, amounts]);

  const handleSave = async () => {
    if (selectedCount === 0) {
      Alert.alert(t('common:status.error'), t('transactions:dailyCash.noEntries'));
      return;
    }

    // Kategori seçilmediyse modal aç
    if (!kategoriId && !categorySkipped) {
      setCategoryPickerOpen(true);
      return;
    }

    setIsSaving(true);

    try {
      // Her seçili personel için işlem oluştur
      const promises: Promise<any>[] = [];

      selectedPersonel.forEach(personelId => {
        const amount = parseCurrency(amounts[personelId] || '0');
        if (amount > 0) {
          promises.push(
            createIslem.mutateAsync({
              type: 'personel_gider',
              amount,
              personel_id: personelId,
              kategori_id: kategoriId,
              date: formatDateTimeForDB(safeDate),
              description: description.trim() || (kategoriId ? null : t('staff:bulkSalary.description')),
            })
          );
        }
      });

      await Promise.all(promises);

      Alert.alert(
        t('common:status.success'),
        t('staff:bulkSalary.success', { count: selectedCount }),
        [{ text: t('common:buttons.ok'), onPress: () => router.back() }]
      );
    } catch (error) {
      if (__DEV__) {
        console.error('Toplu gider hatası:', error);
      }
      Alert.alert(t('common:status.error'), toErrorMessage(error) || t('transactions:messages.saveFailed'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <Stack.Screen
        options={{
          headerTitle: t('staff:bulkSalary.title'),
        }}
      />
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}
        >
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Tarih/Saat Seçici */}
            <View style={styles.section}>
              <Text variant="label" color="secondary" style={styles.label}>
                {t('transactions:form.dateTime')}
              </Text>
              <TouchableOpacity
                style={styles.dateButton}
                onPress={() => setShowDatePicker(true)}
              >
                <Calendar size={20} color={colors.textMuted} />
                <Text variant="body" style={styles.dateText}>
                  {isToday(safeDate) ? t('common:date.today') : formatDateMedium(safeDate)}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Kategori Seçici */}
            <View style={styles.section}>
              <CategoryPicker
                value={kategoriId}
                onChange={setKategoriId}
                type="gider"
                label={t('transactions:form.category')}
                open={categoryPickerOpen}
                onOpenChange={(open) => {
                  setCategoryPickerOpen(open);
                  if (!open && !kategoriId) {
                    setCategorySkipped(true);
                  }
                }}
              />
            </View>

            {/* Açıklama */}
            <View style={styles.section}>
              <Text variant="label" color="secondary" style={styles.label}>
                {t('transactions:form.description')}
              </Text>
              <TextInput
                style={styles.descriptionInput}
                value={description}
                onChangeText={setDescription}
                placeholder={t('transactions:form.descriptionPlaceholder')}
                placeholderTextColor={colors.textMuted}
                multiline
                numberOfLines={2}
              />
            </View>

            {/* Seçim Butonları */}
            <View style={styles.selectionButtons}>
              <Button variant="outline" size="sm" onPress={handleSelectAll}>
                {t('staff:bulkSalary.selectAll')}
              </Button>
              <Button variant="outline" size="sm" onPress={handleSelectNone}>
                {t('staff:bulkSalary.selectNone')}
              </Button>
            </View>

            {/* Personel Listesi */}
            <View style={styles.listContainer}>
              {activePersonel.map(personel => (
                <Card key={personel.id} style={styles.personelCard}>
                  <TouchableOpacity
                    style={styles.personelRow}
                    onPress={() => handleToggle(personel.id)}
                    activeOpacity={0.7}
                  >
                    {/* Checkbox */}
                    <View
                      style={[
                        styles.checkbox,
                        selectedPersonel.has(personel.id) && styles.checkboxSelected,
                      ]}
                    >
                      {selectedPersonel.has(personel.id) && (
                        <Check size={16} color={colors.surface} />
                      )}
                    </View>

                    {/* Avatar */}
                    <View style={styles.avatar}>
                      <Text variant="caption" bold style={{ color: colors.primary }}>
                        {getInitials(`${personel.first_name} ${personel.last_name}`)}
                      </Text>
                    </View>

                    {/* Personel Bilgisi */}
                    <View style={styles.personelInfo}>
                      <Text variant="body">
                        {personel.first_name} {personel.last_name}
                      </Text>
                      {personel.position && (
                        <Text variant="caption" color="secondary">
                          {personel.position}
                        </Text>
                      )}
                    </View>

                    {/* Tutar */}
                    <View style={styles.amountContainer}>
                      <CurrencyInput
                        value={amounts[personel.id] || ''}
                        onChangeText={(val) => handleAmountChange(personel.id, val)}
                        style={styles.amountInput}
                        placeholder="0"
                      />
                    </View>
                  </TouchableOpacity>
                </Card>
              ))}
            </View>
          </ScrollView>

          {/* Footer - Özet ve Kaydet */}
          <View style={styles.footer}>
            <View style={styles.summary}>
              <Text variant="caption" color="secondary">
                {selectedCount} {t('staff:titles.personnel')}
              </Text>
              <Text variant="h3" color="error">
                {formatCurrency(totalAmount)}
              </Text>
            </View>
            <Button
              variant="primary"
              size="lg"
              loading={isSaving}
              onPress={handleSave}
              disabled={selectedCount === 0}
              style={styles.saveButton}
            >
              {t('common:buttons.save')}
            </Button>
          </View>
        </KeyboardAvoidingView>

        {/* Date Picker Modal */}
        {showDatePicker && (
          <Modal visible transparent animationType="fade">
            <TouchableWithoutFeedback onPress={() => setShowDatePicker(false)}>
              <View style={styles.pickerBackdrop}>
                <TouchableWithoutFeedback onPress={() => {}}>
                  <View style={styles.pickerContainer}>
                    <Text style={styles.pickerTitle}>{t('transactions:form.dateTime')}</Text>

                    {/* Date Picker */}
                    <View style={styles.pickerSection}>
                      <Text style={styles.pickerSectionTitle}>{t('common:date.date')}</Text>
                      <DateTimePickerRN
                        value={safeDate}
                        mode="date"
                        display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                        onChange={(event, selectedDate) => {
                          if (Platform.OS === 'android') {
                            if (event.type === 'set' && selectedDate) {
                              const newDate = new Date(safeDate);
                              newDate.setFullYear(selectedDate.getFullYear());
                              newDate.setMonth(selectedDate.getMonth());
                              newDate.setDate(selectedDate.getDate());
                              setDate(newDate);
                            }
                          } else if (selectedDate) {
                            const newDate = new Date(safeDate);
                            newDate.setFullYear(selectedDate.getFullYear());
                            newDate.setMonth(selectedDate.getMonth());
                            newDate.setDate(selectedDate.getDate());
                            setDate(newDate);
                          }
                        }}
                        locale={locale}
                        textColor={colors.text}
                        themeVariant="light"
                        style={styles.datePickerStyle}
                      />
                    </View>

                    {/* Time Picker */}
                    <View style={styles.pickerSection}>
                      <Text style={styles.pickerSectionTitle}>{t('common:date.time')}</Text>
                      <DateTimePickerRN
                        value={safeDate}
                        mode="time"
                        display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                        is24Hour={true}
                        onChange={(event, selectedDate) => {
                          if (Platform.OS === 'android') {
                            if (event.type === 'set' && selectedDate) {
                              const newDate = new Date(safeDate);
                              newDate.setHours(selectedDate.getHours());
                              newDate.setMinutes(selectedDate.getMinutes());
                              setDate(newDate);
                            }
                          } else if (selectedDate) {
                            const newDate = new Date(safeDate);
                            newDate.setHours(selectedDate.getHours());
                            newDate.setMinutes(selectedDate.getMinutes());
                            setDate(newDate);
                          }
                        }}
                        locale={locale}
                        textColor={colors.text}
                        themeVariant="light"
                        style={styles.timePickerStyle}
                      />
                    </View>

                    <TouchableOpacity
                      style={styles.pickerDoneButton}
                      onPress={() => setShowDatePicker(false)}
                    >
                      <Text style={styles.pickerDoneText}>{t('common:buttons.done')}</Text>
                    </TouchableOpacity>
                  </View>
                </TouchableWithoutFeedback>
              </View>
            </TouchableWithoutFeedback>
          </Modal>
        )}
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  keyboardView: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: spacing.lg,
  },
  section: {
    paddingHorizontal: spacing.lg,
  },
  selectionButtons: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  listContainer: {
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  personelCard: {
    padding: spacing.md,
  },
  personelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: borderRadius.sm,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: borderRadius['2xl'],
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  personelInfo: {
    flex: 1,
  },
  amountContainer: {
    width: 120,
  },
  amountInput: {
    textAlign: 'right',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
    gap: spacing.lg,
  },
  summary: {
    flex: 1,
  },
  saveButton: {
    minWidth: 120,
  },
  label: {
    marginBottom: spacing.sm,
  },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  dateText: {
    flex: 1,
  },
  descriptionInput: {
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    fontSize: 16,
    color: colors.text,
    minHeight: 60,
    textAlignVertical: 'top',
  },
  // Date Picker Modal Styles
  pickerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pickerContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    marginHorizontal: 20,
  },
  pickerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
    marginBottom: 16,
  },
  pickerSection: {
    marginBottom: 8,
  },
  pickerSectionTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textMuted,
    marginBottom: 4,
    textAlign: 'center',
  },
  datePickerStyle: {
    height: 150,
  },
  timePickerStyle: {
    height: 120,
  },
  pickerDoneButton: {
    marginTop: 16,
    backgroundColor: colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 10,
    alignItems: 'center',
  },
  pickerDoneText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
