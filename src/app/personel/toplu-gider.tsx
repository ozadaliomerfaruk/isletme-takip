import { useState, useEffect, useMemo, useRef } from 'react';
import { View, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, Alert, TouchableOpacity, TouchableWithoutFeedback, TextInput, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import DateTimePickerRN from '@react-native-community/datetimepicker';
import { Check, Calendar } from 'lucide-react-native';
import { Text, Button, Card, CategoryPicker, CurrencyInput, Screen, Modal } from '@/components/ui';
import { useFooterBottomPadding } from '@/hooks/useFooterBottomPadding';
import { colors } from '@/constants/colors';
import { spacing, borderRadius, fontSize, shadows } from '@/constants/spacing';
import { usePersonelList } from '@/hooks/usePersonel';
import { useCreateIslem } from '@/hooks/useIslemler';
import { useDateFormat } from '@/hooks/useDateFormat';
import { formatDateTimeForDB, isToday, ensureValidDate } from '@/lib/date';
import { formatCurrency, parseCurrency, toNumber, formatAmountForInput } from '@/lib/currency';
import { getInitials } from '@/lib/utils';
import { toErrorMessage } from '@/lib/errors';
import { useSaveSuccessFeedback } from '@/hooks/useSaveSuccessFeedback';
import { usePagePermission } from '@/hooks/usePagePermission';
import { invalidateRelatedQueries } from '@/lib/queryKeys';
import { logEvent } from '@/lib/appEvents';
import { runSettledWithConcurrency } from '@/lib/runSettledWithConcurrency';

const BULK_SALARY_CONCURRENCY = 4;

export default function TopluGiderPage() {
  const router = useRouter();
  const notifySaved = useSaveSuccessFeedback();
  const { t } = useTranslation(['staff', 'common', 'transactions']);
  const footerInset = useFooterBottomPadding();
  usePagePermission({ module: 'personel', action: 'create' });
  const queryClient = useQueryClient();
  const createIslem = useCreateIslem({ deferSuccessEffects: true });
  const { locale, formatDateMedium } = useDateFormat();
  const insets = useSafeAreaInsets();

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
  const [saveProgress, setSaveProgress] = useState({ completed: 0, total: 0 });
  const savingRef = useRef(false);
  const mutationIdsRef = useRef<Record<string, string>>({});

  const { data: personelList } = usePersonelList();

  // Aktif personel listesi (A-Z sıralı)
  const activePersonel = useMemo(() => {
    return personelList
      ?.filter(p => p.is_active)
      .sort((a, b) => a.first_name.localeCompare(b.first_name, 'tr')) || [];
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
        initialAmounts[personel.id] = formatAmountForInput(salary);
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

  // Toplam tutar — PARA BİRİMİ BAŞINA. personel_gider tutarı personelin KENDİ para
  // biriminde okunuyor; düz toplama "100 USD + 100 TRY"yi "₺200" diye yazıyordu.
  // Kur burada satır satır sorulamadığı için çevirmek de yalan olur → ayrı satırlar.
  const totalsByCurrency = useMemo(() => {
    const map = new Map<string, number>();
    selectedPersonel.forEach(id => {
      const amount = parseCurrency(amounts[id] || '0');
      if (amount > 0) {
        const cur = activePersonel.find(p => p.id === id)?.currency || 'TRY';
        map.set(cur, (map.get(cur) ?? 0) + amount);
      }
    });
    return Array.from(map.entries());
  }, [selectedPersonel, amounts, activePersonel]);

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
    // React state'i bir sonraki render'da güncellenir; ref hızlı çift dokunuşu aynı
    // tick içinde de keser ve aynı maaş grubunun iki kez başlamasını önler.
    if (savingRef.current) return;

    if (selectedCount === 0) {
      Alert.alert(t('common:status.error'), t('transactions:dailyCash.noEntries'));
      return;
    }

    // Kategori seçilmediyse modal aç
    if (!kategoriId && !categorySkipped) {
      setCategoryPickerOpen(true);
      return;
    }

    const targets = Array.from(selectedPersonel).filter(
      (id) => parseCurrency(amounts[id] || '0') > 0
    );

    savingRef.current = true;
    setIsSaving(true);
    setSaveProgress({ completed: 0, total: targets.length });

    try {
      // Mobil bağlantıyı onlarca eşzamanlı istekle doldurma. Dört işlik havuz
      // Promise.allSettled kısmi-başarı semantiğini korur; sonuçlar hedef sırasındadır.
      // Her personelin UUID'si aynı ekran içindeki belirsiz yanıt/tekrar denemesinde
      // sabit kalır: server idempotency yolu bakiyeyi ve gideri ikinci kez yazmaz.
      const results = await runSettledWithConcurrency(
        targets,
        BULK_SALARY_CONCURRENCY,
        async (personelId) => {
          const mutationId =
            mutationIdsRef.current[personelId] ?? Crypto.randomUUID();
          mutationIdsRef.current[personelId] = mutationId;

          await createIslem.mutateAsync({
            id: mutationId,
            type: 'personel_gider',
            amount: parseCurrency(amounts[personelId] || '0'),
            personel_id: personelId,
            kategori_id: kategoriId,
            date: formatDateTimeForDB(safeDate),
            description: description.trim() || (kategoriId ? null : t('staff:bulkSalary.description')),
          });
          return personelId;
        },
        ({ completed, total }) => setSaveProgress({ completed, total }),
      );

      const succeededIds = new Set<string>();
      let failedCount = 0;
      results.forEach((r, i) => {
        if (r.status === 'fulfilled') {
          succeededIds.add(targets[i]);
        } else {
          failedCount++;
          if (__DEV__) console.error('Toplu gider — başarısız:', targets[i], r.reason);
        }
      });

      // Başarılı kaydedilenleri seçimden çıkar (çift gideri önler) ve tutarlarını temizle
      if (succeededIds.size > 0) {
        // Tekil mutation'ların geniş invalidation/telemetri yan etkileri ertelendi.
        // Bütün seri için yalnız bir kez çalıştırarak refetch fırtınasını önle.
        invalidateRelatedQueries(queryClient, 'islem');
        setSelectedPersonel((prev) => {
          const next = new Set(prev);
          succeededIds.forEach((id) => next.delete(id));
          return next;
        });
        setAmounts((prev) => {
          const next = { ...prev };
          succeededIds.forEach((id) => { delete next[id]; });
          return next;
        });
        succeededIds.forEach((id) => {
          delete mutationIdsRef.current[id];
        });
      }

      logEvent('bulk_salary_save_completed', {
        requested_count: targets.length,
        success_count: succeededIds.size,
        failed_count: failedCount,
      });

      if (failedCount === 0) {
        notifySaved(t('staff:bulkSalary.success', { count: succeededIds.size }));
        router.back();
      } else {
        // Kısmi başarı: başarısızlar seçili kaldı, ekranda kal — kullanıcı tekrar deneyebilir
        Alert.alert(
          t('common:status.warning'),
          t('staff:bulkSalary.partialError', { success: succeededIds.size, failed: failedCount })
        );
      }
    } catch (error) {
      if (__DEV__) {
        console.error('Toplu gider hatası:', error);
      }
      Alert.alert(t('common:status.error'), toErrorMessage(error) || t('transactions:messages.saveFailed'));
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  };

  const saveProgressPercent = saveProgress.total > 0
    ? Math.round((saveProgress.completed / saveProgress.total) * 100)
    : 0;
  const saveProgressWidth = `${saveProgressPercent}%` as `${number}%`;

  return (
    <>
      <Stack.Screen
        options={{
          headerTitle: t('staff:bulkSalary.title'),
        }}
      />
      <Screen>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}
          // KAV frame'i EBEVEYNE göre ölçülüyor; native header'lı ekranda offset
          // verilmezse padding header+durum çubuğu kadar eksik kalıyor ve sabit
          // footer (Kaydet) klavyenin arkasında kalıyor. Diğer formlarla aynı satır.
          keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + 44 : 0}
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
                        {getInitials(`${personel.first_name} ${personel.last_name ?? ''}`)}
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
                        // Tutar personelin para biriminde girilir; alanın öneki de öyle olmalı
                        currency={personel.currency}
                      />
                    </View>
                  </TouchableOpacity>
                </Card>
              ))}
            </View>
          </ScrollView>

          {/* Footer - Özet ve Kaydet */}
          <View style={[styles.footer, { paddingBottom: spacing.md + footerInset }]}>
            <View style={styles.summary}>
              <Text variant="caption" color="secondary">
                {selectedCount} {t('staff:titles.personnel')}
              </Text>
              {/* Para birimi başına ayrı satır — karışık para birimi düz toplanmaz */}
              {totalsByCurrency.length === 0 ? (
                <Text variant="h3" color="error">{formatCurrency(0)}</Text>
              ) : (
                totalsByCurrency.map(([cur, total]) => (
                  <Text key={cur} variant="h3" color="error">
                    {formatCurrency(total, cur)}
                  </Text>
                ))
              )}
            </View>
            <Button
              variant="primary"
              size="lg"
              loading={isSaving}
              onPress={handleSave}
              disabled={selectedCount === 0 || isSaving}
              style={styles.saveButton}
            >
              {t('common:buttons.save')}
            </Button>
          </View>
        </KeyboardAvoidingView>

        <Modal
          visible={isSaving}
          transparent
          animationType="fade"
          statusBarTranslucent
          onRequestClose={() => undefined}
        >
          <View style={styles.savingBackdrop}>
            <View
              style={styles.savingCard}
              accessibilityRole="progressbar"
              accessibilityLabel={t('staff:bulkSalary.savingTitle')}
              accessibilityValue={{
                min: 0,
                max: saveProgress.total,
                now: saveProgress.completed,
              }}
            >
              <View style={styles.savingHeader}>
                <View style={styles.savingIcon}>
                  <ActivityIndicator size="small" color={colors.primary} />
                </View>
                <View style={styles.savingCopy}>
                  <Text variant="h3">{t('staff:bulkSalary.savingTitle')}</Text>
                  <Text variant="caption" color="secondary">
                    {t('staff:bulkSalary.savingHint')}
                  </Text>
                </View>
                <View style={styles.savingCountBadge}>
                  <Text variant="caption" bold style={styles.savingCountText}>
                    {saveProgress.completed}/{saveProgress.total}
                  </Text>
                </View>
              </View>

              <View style={styles.savingProgressTrack}>
                <View
                  style={[
                    styles.savingProgressFill,
                    { width: saveProgressWidth },
                  ]}
                />
              </View>
              <Text variant="caption" color="secondary" style={styles.savingProgressText}>
                {t('staff:bulkSalary.savingProgress', {
                  completed: saveProgress.completed,
                  total: saveProgress.total,
                })}
              </Text>
            </View>
          </View>
        </Modal>

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
      </Screen>
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
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
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
  savingBackdrop: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing['2xl'],
    backgroundColor: 'rgba(9, 35, 30, 0.38)',
  },
  savingCard: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    padding: spacing.xl,
    borderRadius: borderRadius['2xl'],
    backgroundColor: colors.surface,
    ...shadows.lg,
  },
  savingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  savingIcon: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: borderRadius.full,
    backgroundColor: colors.primaryLight,
  },
  savingCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  savingCountBadge: {
    minWidth: 54,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primaryLight,
  },
  savingCountText: {
    color: colors.primary,
  },
  savingProgressTrack: {
    height: 8,
    marginTop: spacing.xl,
    overflow: 'hidden',
    borderRadius: borderRadius.full,
    backgroundColor: colors.borderLight,
  },
  savingProgressFill: {
    height: '100%',
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary,
  },
  savingProgressText: {
    marginTop: spacing.sm,
    textAlign: 'right',
  },
  // Date Picker Modal Styles
  pickerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pickerContainer: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    marginHorizontal: spacing.xl,
  },
  pickerTitle: {
    fontSize: fontSize.xl,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  pickerSection: {
    marginBottom: spacing.sm,
  },
  pickerSectionTitle: {
    fontSize: fontSize.md,
    fontWeight: '500',
    color: colors.textMuted,
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  datePickerStyle: {
    height: 150,
  },
  timePickerStyle: {
    height: 120,
  },
  pickerDoneButton: {
    marginTop: spacing.lg,
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing['2xl'],
    borderRadius: borderRadius.lg,
    alignItems: 'center',
  },
  pickerDoneText: {
    color: colors.white,
    fontSize: fontSize.lg,
    fontWeight: '600',
  },
});
