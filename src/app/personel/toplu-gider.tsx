import { useState, useEffect, useMemo } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react-native';
import { Text, Button, Card, CategoryPicker, DateTimePicker, CurrencyInput } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { usePersonelList } from '@/hooks/usePersonel';
import { useCreateIslem } from '@/hooks/useIslemler';
import { formatDateTimeForDB } from '@/lib/date';
import { formatCurrency, parseCurrency, toNumber } from '@/lib/currency';
import { getInitials } from '@/lib/utils';

export default function TopluGiderPage() {
  const router = useRouter();
  const { t } = useTranslation(['staff', 'common', 'transactions']);
  const createIslem = useCreateIslem();

  // Varsayılan tarih: Bu ayın son günü 23:59
  const getDefaultDate = () => {
    const now = new Date();
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    lastDay.setHours(23, 59, 0, 0);
    return lastDay;
  };

  const [date, setDate] = useState(getDefaultDate());
  const [kategoriId, setKategoriId] = useState<string | null>(null);
  const [selectedPersonel, setSelectedPersonel] = useState<Set<string>>(new Set());
  const [amounts, setAmounts] = useState<Record<string, string>>({});
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
        initialAmounts[personel.id] = String(salary);
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
              date: formatDateTimeForDB(date),
              description: t('staff:bulkSalary.description'),
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
    } catch (error: any) {
      console.error('Toplu gider hatası:', error);
      Alert.alert(t('common:status.error'), error.message || t('transactions:messages.saveFailed'));
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
              <DateTimePicker
                label={t('transactions:form.dateTime')}
                value={date}
                onChange={setDate}
              />
            </View>

            {/* Kategori Seçici */}
            <View style={styles.section}>
              <CategoryPicker
                value={kategoriId}
                onChange={setKategoriId}
                type="gider"
                label={t('transactions:form.category')}
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
});
