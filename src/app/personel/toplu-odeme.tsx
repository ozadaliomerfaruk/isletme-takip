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
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import DateTimePickerRN from '@react-native-community/datetimepicker';
import { Check, Wallet, ChevronDown, X, Calendar } from 'lucide-react-native';
import { Text, Button, Card, CategoryPicker, CurrencyInput } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { usePersonelList } from '@/hooks/usePersonel';
import { useHesaplar } from '@/hooks/useHesaplar';
import { useCreateIslem } from '@/hooks/useIslemler';
import { useDateFormat } from '@/hooks/useDateFormat';
import { formatDateTimeForDB, isToday } from '@/lib/date';
import { formatCurrency, parseCurrency, toNumber } from '@/lib/currency';
import { getInitials } from '@/lib/utils';
import { toErrorMessage } from '@/lib/errors';

export default function TopluOdemePage() {
  const router = useRouter();
  const { t } = useTranslation(['staff', 'common', 'transactions', 'accounts']);
  const createIslem = useCreateIslem();
  const insets = useSafeAreaInsets();
  const windowHeight = Dimensions.get('window').height;
  const { locale, formatDateMedium } = useDateFormat();

  // Varsayılan tarih: Bu ayın son günü 23:59
  const getDefaultDate = () => {
    const now = new Date();
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    lastDay.setHours(23, 59, 0, 0);
    return lastDay;
  };

  const [date, setDate] = useState(getDefaultDate());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [hesapId, setHesapId] = useState<string | null>(null);
  const [kategoriId, setKategoriId] = useState<string | null>(null);
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);
  const [categorySkipped, setCategorySkipped] = useState(false);
  const [selectedPersonel, setSelectedPersonel] = useState<Set<string>>(new Set());
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [description, setDescription] = useState('');
  const [showHesapPicker, setShowHesapPicker] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const { data: personelList, isLoading } = usePersonelList();
  const { data: hesaplar } = useHesaplar();

  // Kredi kartı hariç hesaplar (ödeme için)
  const availableHesaplar = useMemo(() => {
    return hesaplar?.filter(h => h.type !== 'kredi_karti') || [];
  }, [hesaplar]);

  // Seçili hesap
  const selectedHesap = hesaplar?.find(h => h.id === hesapId);

  // Aktif personel listesi (borcu olanlar önce)
  const activePersonel = useMemo(() => {
    return personelList
      ?.filter(p => p.is_active)
      .sort((a, b) => {
        // Borcu olanlar (balance < 0) önce
        const aDebt = toNumber(a.balance) < 0 ? Math.abs(toNumber(a.balance)) : 0;
        const bDebt = toNumber(b.balance) < 0 ? Math.abs(toNumber(b.balance)) : 0;
        return bDebt - aDebt;
      }) || [];
  }, [personelList]);

  // Varsayılan hesabı ayarla
  useEffect(() => {
    if (availableHesaplar.length > 0 && !hesapId) {
      setHesapId(availableHesaplar[0].id);
    }
  }, [availableHesaplar, hesapId]);

  // Başlangıçta borcu olan personeli seç (tutarlar boş)
  useEffect(() => {
    if (activePersonel.length > 0) {
      // Borcu olan personeli seç
      const debtPersonelIds = new Set(
        activePersonel
          .filter(p => toNumber(p.balance) < 0)
          .map(p => p.id)
      );
      setSelectedPersonel(debtPersonelIds);
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

  // Maaş Doldur butonu - personellerin borçlarını doldur
  const handleFillSalaries = () => {
    const newAmounts: Record<string, string> = {};
    activePersonel.forEach(personel => {
      const balance = toNumber(personel.balance);
      // Personelin borcu varsa (balance < 0) bu miktarı doldur
      if (balance < 0) {
        const debt = Math.abs(balance);
        newAmounts[personel.id] = String(debt);
      }
    });
    setAmounts(newAmounts);
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

  // Seçili personel sayısı (tutar girilmiş olanlar)
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
    if (!hesapId) {
      Alert.alert(t('common:status.error'), t('staff:bulkPayment.selectAccount'));
      return;
    }

    // Kategori seçilmediyse ve henüz atlanmadıysa, picker'ı aç
    if (!kategoriId && !categorySkipped) {
      setCategoryPickerOpen(true);
      return;
    }

    if (selectedCount === 0) {
      Alert.alert(t('common:status.error'), t('transactions:dailyCash.noEntries'));
      return;
    }

    setIsSaving(true);

    try {
      // Her seçili personel için ödeme işlemi oluştur
      const promises: Promise<any>[] = [];

      selectedPersonel.forEach(personelId => {
        const amount = parseCurrency(amounts[personelId] || '0');
        if (amount > 0) {
          promises.push(
            createIslem.mutateAsync({
              type: 'personel_odeme',
              amount,
              personel_id: personelId,
              hesap_id: hesapId,
              kategori_id: kategoriId,
              date: formatDateTimeForDB(date),
              description: description.trim() || (kategoriId ? null : t('staff:bulkPayment.description')),
            })
          );
        }
      });

      await Promise.all(promises);

      Alert.alert(
        t('common:status.success'),
        t('staff:bulkPayment.success', { count: selectedCount }),
        [{ text: t('common:buttons.ok'), onPress: () => router.back() }]
      );
    } catch (error) {
      if (__DEV__) {
        console.error('Toplu ödeme hatası:', error);
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
          headerTitle: t('staff:bulkPayment.title'),
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
            {/* Hesap Seçici */}
            <View style={styles.section}>
              <Text variant="label" color="secondary" style={styles.label}>
                {t('transactions:form.account')}
              </Text>
              <TouchableOpacity
                style={styles.hesapPicker}
                onPress={() => setShowHesapPicker(true)}
              >
                <Wallet size={20} color={colors.textMuted} />
                <Text variant="body" style={styles.hesapText}>
                  {selectedHesap?.name || t('accounts:titles.selectAccount')}
                </Text>
                <ChevronDown size={20} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

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
                  {isToday(date) ? t('common:date.today') : formatDateMedium(date)}
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

            {/* Maaş Doldur + Seçim Butonları */}
            <View style={styles.actionButtons}>
              <Button variant="primary" size="sm" onPress={handleFillSalaries}>
                {t('staff:bulkPayment.fillSalaries')}
              </Button>
              <Button variant="outline" size="sm" onPress={handleSelectAll}>
                {t('staff:bulkSalary.selectAll')}
              </Button>
              <Button variant="outline" size="sm" onPress={handleSelectNone}>
                {t('staff:bulkSalary.selectNone')}
              </Button>
            </View>

            {/* Personel Listesi */}
            <View style={styles.listContainer}>
              {activePersonel.map(personel => {
                const balance = toNumber(personel.balance);
                const hasDebt = balance < 0;
                const debtAmount = hasDebt ? Math.abs(balance) : 0;

                return (
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
                        <Text variant="caption" color={hasDebt ? 'error' : 'secondary'}>
                          {hasDebt
                            ? `${t('staff:balance.weOwe')}: ${formatCurrency(debtAmount)}`
                            : t('staff:balance.noBalance')}
                        </Text>
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
                );
              })}
            </View>
          </ScrollView>

          {/* Footer - Özet ve Kaydet */}
          <View style={styles.footer}>
            <View style={styles.summary}>
              <Text variant="caption" color="secondary">
                {selectedCount} {t('staff:titles.personnel')}
              </Text>
              <Text variant="h3" color="success">
                {formatCurrency(totalAmount)}
              </Text>
            </View>
            <Button
              variant="primary"
              size="lg"
              loading={isSaving}
              onPress={handleSave}
              disabled={!hesapId || selectedCount === 0}
              style={styles.saveButton}
            >
              {t('common:buttons.save')}
            </Button>
          </View>
        </KeyboardAvoidingView>

        {/* Hesap Picker Modal - Bottom Sheet */}
        {showHesapPicker && (
          <Modal
            visible
            transparent
            animationType="slide"
            onRequestClose={() => setShowHesapPicker(false)}
          >
            <TouchableWithoutFeedback onPress={() => setShowHesapPicker(false)}>
              <View style={styles.bottomSheetOverlay}>
                <TouchableWithoutFeedback onPress={() => {}}>
                  <View style={[styles.bottomSheetContent, { height: windowHeight * 0.5, paddingBottom: insets.bottom }]}>
                    <View style={styles.bottomSheetHeader}>
                      <Text style={styles.bottomSheetTitle}>{t('accounts:titles.selectAccount')}</Text>
                      <TouchableOpacity onPress={() => setShowHesapPicker(false)} style={styles.bottomSheetCloseBtn}>
                        <X size={24} color={colors.text} />
                      </TouchableOpacity>
                    </View>
                    <ScrollView style={styles.bottomSheetList}>
                      {availableHesaplar.map((hesap) => (
                        <TouchableOpacity
                          key={hesap.id}
                          style={[styles.bottomSheetItem, hesap.id === hesapId && styles.bottomSheetItemSelected]}
                          onPress={() => {
                            setHesapId(hesap.id);
                            setShowHesapPicker(false);
                          }}
                        >
                          <Wallet size={20} color={colors.primary} />
                          <View style={styles.bottomSheetItemContent}>
                            <Text style={styles.bottomSheetItemText}>{hesap.name}</Text>
                            <Text style={styles.bottomSheetItemBalance}>{formatCurrency(toNumber(hesap.balance))}</Text>
                          </View>
                          {hesap.id === hesapId && <Check size={20} color={colors.primary} />}
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                </TouchableWithoutFeedback>
              </View>
            </TouchableWithoutFeedback>
          </Modal>
        )}

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
                        value={date}
                        mode="date"
                        display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                        onChange={(event, selectedDate) => {
                          if (Platform.OS === 'android') {
                            if (event.type === 'set' && selectedDate) {
                              const newDate = new Date(date);
                              newDate.setFullYear(selectedDate.getFullYear());
                              newDate.setMonth(selectedDate.getMonth());
                              newDate.setDate(selectedDate.getDate());
                              setDate(newDate);
                            }
                          } else if (selectedDate) {
                            const newDate = new Date(date);
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
                        value={date}
                        mode="time"
                        display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                        is24Hour={true}
                        onChange={(event, selectedDate) => {
                          if (Platform.OS === 'android') {
                            if (event.type === 'set' && selectedDate) {
                              const newDate = new Date(date);
                              newDate.setHours(selectedDate.getHours());
                              newDate.setMinutes(selectedDate.getMinutes());
                              setDate(newDate);
                            }
                          } else if (selectedDate) {
                            const newDate = new Date(date);
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
    marginBottom: spacing.md,
    zIndex: 10,
  },
  label: {
    marginBottom: spacing.sm,
  },
  hesapPicker: {
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
  hesapText: {
    flex: 1,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
    flexWrap: 'wrap',
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
  // Bottom Sheet Modal Styles
  bottomSheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  bottomSheetContent: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius['2xl'],
    borderTopRightRadius: borderRadius['2xl'],
  },
  bottomSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  bottomSheetTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  bottomSheetCloseBtn: {
    padding: spacing.xs,
  },
  bottomSheetList: {
    flex: 1,
  },
  bottomSheetItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  bottomSheetItemSelected: {
    backgroundColor: colors.primaryLight,
  },
  bottomSheetItemContent: {
    flex: 1,
  },
  bottomSheetItemText: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.text,
  },
  bottomSheetItemBalance: {
    fontSize: 14,
    color: colors.textMuted,
  },
  // Date Button Styles
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
