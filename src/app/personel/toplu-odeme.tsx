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
import { Check, Wallet, ChevronDown } from 'lucide-react-native';
import { Text, Button, Card, CategoryPicker, DateTimePicker, CurrencyInput } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { usePersonelList } from '@/hooks/usePersonel';
import { useHesaplar } from '@/hooks/useHesaplar';
import { useCreateIslem } from '@/hooks/useIslemler';
import { formatDateTimeForDB } from '@/lib/date';
import { formatCurrency, parseCurrency, toNumber } from '@/lib/currency';
import { getInitials } from '@/lib/utils';

export default function TopluOdemePage() {
  const router = useRouter();
  const { t } = useTranslation(['staff', 'common', 'transactions', 'accounts']);
  const createIslem = useCreateIslem();

  // Varsayılan tarih: Bu ayın son günü 23:59
  const getDefaultDate = () => {
    const now = new Date();
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    lastDay.setHours(23, 59, 0, 0);
    return lastDay;
  };

  const [date, setDate] = useState(getDefaultDate());
  const [hesapId, setHesapId] = useState<string | null>(null);
  const [kategoriId, setKategoriId] = useState<string | null>(null);
  const [selectedPersonel, setSelectedPersonel] = useState<Set<string>>(new Set());
  const [amounts, setAmounts] = useState<Record<string, string>>({});
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
              description: t('staff:bulkPayment.description'),
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
    } catch (error: any) {
      console.error('Toplu ödeme hatası:', error);
      Alert.alert(t('common:status.error'), error.message || t('transactions:messages.saveFailed'));
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
                onPress={() => setShowHesapPicker(!showHesapPicker)}
              >
                <Wallet size={20} color={colors.textMuted} />
                <Text variant="body" style={styles.hesapText}>
                  {selectedHesap?.name || t('accounts:titles.selectAccount')}
                </Text>
                <ChevronDown size={20} color={colors.textMuted} />
              </TouchableOpacity>
              {showHesapPicker && (
                <Card style={styles.hesapDropdown}>
                  {availableHesaplar.map(hesap => (
                    <TouchableOpacity
                      key={hesap.id}
                      style={[
                        styles.hesapOption,
                        hesap.id === hesapId && styles.hesapOptionSelected,
                      ]}
                      onPress={() => {
                        setHesapId(hesap.id);
                        setShowHesapPicker(false);
                      }}
                    >
                      <Text
                        variant="body"
                        style={hesap.id === hesapId && { color: colors.primary }}
                      >
                        {hesap.name}
                      </Text>
                      <Text variant="caption" color="secondary">
                        {formatCurrency(toNumber(hesap.balance))}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </Card>
              )}
            </View>

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
  hesapDropdown: {
    position: 'absolute',
    top: '100%',
    left: spacing.lg,
    right: spacing.lg,
    marginTop: spacing.xs,
    zIndex: 100,
    maxHeight: 200,
  },
  hesapOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  hesapOptionSelected: {
    backgroundColor: colors.primaryLight,
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
});
