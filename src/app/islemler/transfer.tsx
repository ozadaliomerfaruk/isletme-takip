import { useState, useEffect } from 'react';
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
import { useRouter } from 'expo-router';
import { ChevronDown, ArrowRight, Bell } from 'lucide-react-native';
import { Text, Input, Button, Card, DateTimePicker, CurrencyInput, ReminderSettings, type ReminderConfig } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { useHesaplar } from '@/hooks/useHesaplar';
import { useCreateIslem } from '@/hooks/useIslemler';
import { useCreateIleriTarihliIslem } from '@/hooks/useIleriTarihliIslemler';
import { formatCurrency, parseCurrency, isValidAmount } from '@/lib/currency';
import { formatDateForDB } from '@/lib/date';
import { scheduleTransactionReminder, calculateReminderDate } from '@/lib/notifications';
import { ISLEM_TYPE_LABELS } from '@/constants/islemTypes';

export default function TransferPage() {
  const router = useRouter();
  const createIslem = useCreateIslem();
  const createIleriTarihliIslem = useCreateIleriTarihliIslem();

  const { data: hesaplar } = useHesaplar();

  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [kaynakHesapId, setKaynakHesapId] = useState<string | null>(null);
  const [hedefHesapId, setHedefHesapId] = useState<string | null>(null);
  const [showKaynakPicker, setShowKaynakPicker] = useState(false);
  const [showHedefPicker, setShowHedefPicker] = useState(false);
  const [isIleriTarihli, setIsIleriTarihli] = useState(false);
  const [reminderConfig, setReminderConfig] = useState<ReminderConfig>({
    enabled: false,
    daysBefore: 0,
    time: '09:00',
  });
  const [errors, setErrors] = useState<{ amount?: string; kaynak?: string; hedef?: string; date?: string }>({});

  useEffect(() => {
    if (hesaplar && hesaplar.length >= 2 && !kaynakHesapId && !hedefHesapId) {
      setKaynakHesapId(hesaplar[0].id);
      setHedefHesapId(hesaplar[1].id);
    }
  }, [hesaplar]);

  const kaynakHesap = hesaplar?.find((h) => h.id === kaynakHesapId);
  const hedefHesap = hesaplar?.find((h) => h.id === hedefHesapId);

  const validate = () => {
    const newErrors: { amount?: string; kaynak?: string; hedef?: string; date?: string } = {};

    if (!isValidAmount(amount)) {
      newErrors.amount = 'Geçerli bir tutar girin';
    }

    if (!kaynakHesapId) {
      newErrors.kaynak = 'Kaynak hesap seçin';
    }

    if (!hedefHesapId) {
      newErrors.hedef = 'Hedef hesap seçin';
    }

    if (kaynakHesapId === hedefHesapId) {
      newErrors.hedef = 'Kaynak ve hedef hesap aynı olamaz';
    }

    if (isIleriTarihli) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const selected = new Date(selectedDate);
      selected.setHours(0, 0, 0, 0);

      if (selected <= today) {
        newErrors.date = 'İleri tarihli işlem için bugünden sonraki bir tarih seçin';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;

    try {
      if (isIleriTarihli) {
        const scheduledDate = formatDateForDB(selectedDate);
        const result = await createIleriTarihliIslem.mutateAsync({
          type: 'transfer',
          amount: parseCurrency(amount),
          description: description.trim() || null,
          hesap_id: kaynakHesapId,
          hedef_hesap_id: hedefHesapId,
          scheduled_date: scheduledDate,
        });

        // Hatırlatıcı aktifse bildirim planla
        if (reminderConfig.enabled && result?.id) {
          const reminderDate = calculateReminderDate(
            scheduledDate,
            reminderConfig.daysBefore,
            reminderConfig.time
          );

          await scheduleTransactionReminder(
            result.id,
            'Yaklaşan İşlem Hatırlatması',
            `${ISLEM_TYPE_LABELS.transfer}: ${formatCurrency(parseCurrency(amount))}${description ? ` - ${description}` : ''}`,
            reminderDate,
            {
              type: 'scheduled_transaction_reminder',
              transaction_id: result.id,
              hesap_id: kaynakHesapId,
            }
          );
        }

        Alert.alert('Başarılı', 'İleri tarihli transfer oluşturuldu', [
          { text: 'Tamam', onPress: () => router.back() },
        ]);
      } else {
        await createIslem.mutateAsync({
          type: 'transfer',
          amount: parseCurrency(amount),
          description: description.trim() || null,
          hesap_id: kaynakHesapId,
          hedef_hesap_id: hedefHesapId,
          date: formatDateForDB(selectedDate),
        });

        Alert.alert('Başarılı', 'Transfer yapıldı', [
          { text: 'Tamam', onPress: () => router.back() },
        ]);
      }
    } catch (error: any) {
      Alert.alert('Hata', error.message || 'Transfer yapılamadı');
    }
  };

  const closeAllPickers = () => {
    setShowKaynakPicker(false);
    setShowHedefPicker(false);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
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
          <View style={styles.header}>
            <View style={styles.headerRow}>
              <Text variant="h2" style={styles.headerTitle}>Hesaplar Arası Transfer</Text>
              <TouchableOpacity
                style={[styles.bellButton, isIleriTarihli && styles.bellButtonActive]}
                onPress={() => {
                  setIsIleriTarihli(!isIleriTarihli);
                  if (!isIleriTarihli) {
                    const tomorrow = new Date();
                    tomorrow.setDate(tomorrow.getDate() + 1);
                    setSelectedDate(tomorrow);
                  }
                }}
              >
                <Bell size={22} color={isIleriTarihli ? colors.warning : colors.textMuted} />
              </TouchableOpacity>
            </View>
            {isIleriTarihli && (
              <View style={styles.ileriTarihliIndicator}>
                <Text variant="caption" style={styles.ileriTarihliText}>
                  İleri Tarihli İşlem
                </Text>
              </View>
            )}
          </View>

          <View style={styles.section}>
            <CurrencyInput
              label="Tutar"
              value={amount}
              onChangeText={setAmount}
              error={errors.amount}
            />

            {/* Kaynak Hesap */}
            <View style={[styles.pickerContainer, { zIndex: 20 }]}>
              <Text variant="label" color="secondary" style={styles.pickerLabel}>
                Kaynak Hesap
              </Text>
              <TouchableOpacity
                style={[styles.picker, errors.kaynak && styles.pickerError]}
                onPress={() => {
                  closeAllPickers();
                  setShowKaynakPicker(!showKaynakPicker);
                }}
              >
                <View>
                  <Text variant="body">{kaynakHesap?.name || 'Hesap seçin'}</Text>
                  {kaynakHesap && (
                    <Text variant="caption" color="secondary">
                      Bakiye: {formatCurrency(Number(kaynakHesap.balance))}
                    </Text>
                  )}
                </View>
                <ChevronDown size={20} color={colors.textMuted} />
              </TouchableOpacity>
              {errors.kaynak && (
                <Text variant="caption" color="error" style={styles.errorText}>
                  {errors.kaynak}
                </Text>
              )}
              {showKaynakPicker && (
                <Card style={styles.pickerDropdown}>
                  {hesaplar?.filter(h => h.id !== hedefHesapId).map((hesap) => (
                    <TouchableOpacity
                      key={hesap.id}
                      style={styles.pickerOption}
                      onPress={() => {
                        setKaynakHesapId(hesap.id);
                        setShowKaynakPicker(false);
                      }}
                    >
                      <Text
                        variant="body"
                        style={hesap.id === kaynakHesapId && { color: colors.primary }}
                      >
                        {hesap.name}
                      </Text>
                      <Text variant="caption" color="secondary">
                        {formatCurrency(Number(hesap.balance))}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </Card>
              )}
            </View>

            {/* Transfer Oku */}
            <View style={styles.arrowContainer}>
              <ArrowRight size={24} color={colors.primary} />
            </View>

            {/* Hedef Hesap */}
            <View style={[styles.pickerContainer, { zIndex: 10 }]}>
              <Text variant="label" color="secondary" style={styles.pickerLabel}>
                Hedef Hesap
              </Text>
              <TouchableOpacity
                style={[styles.picker, errors.hedef && styles.pickerError]}
                onPress={() => {
                  closeAllPickers();
                  setShowHedefPicker(!showHedefPicker);
                }}
              >
                <View>
                  <Text variant="body">{hedefHesap?.name || 'Hesap seçin'}</Text>
                  {hedefHesap && (
                    <Text variant="caption" color="secondary">
                      Bakiye: {formatCurrency(Number(hedefHesap.balance))}
                    </Text>
                  )}
                </View>
                <ChevronDown size={20} color={colors.textMuted} />
              </TouchableOpacity>
              {errors.hedef && (
                <Text variant="caption" color="error" style={styles.errorText}>
                  {errors.hedef}
                </Text>
              )}
              {showHedefPicker && (
                <Card style={styles.pickerDropdown}>
                  {hesaplar?.filter(h => h.id !== kaynakHesapId).map((hesap) => (
                    <TouchableOpacity
                      key={hesap.id}
                      style={styles.pickerOption}
                      onPress={() => {
                        setHedefHesapId(hesap.id);
                        setShowHedefPicker(false);
                      }}
                    >
                      <Text
                        variant="body"
                        style={hesap.id === hedefHesapId && { color: colors.primary }}
                      >
                        {hesap.name}
                      </Text>
                      <Text variant="caption" color="secondary">
                        {formatCurrency(Number(hesap.balance))}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </Card>
              )}
            </View>

            <DateTimePicker
              label={isIleriTarihli ? "İşlem Tarihi" : "Tarih ve Saat"}
              value={selectedDate}
              onChange={setSelectedDate}
              mode={isIleriTarihli ? "date" : "datetime"}
              error={errors.date}
            />

            {isIleriTarihli && (
              <ReminderSettings
                value={reminderConfig}
                onChange={setReminderConfig}
              />
            )}

            <Input
              label="Açıklama (Opsiyonel)"
              placeholder="Transfer notu..."
              multiline
              numberOfLines={2}
              value={description}
              onChangeText={setDescription}
            />
          </View>

          <View style={styles.buttons}>
            <Button
              variant="outline"
              size="lg"
              onPress={() => router.back()}
              style={styles.button}
            >
              İptal
            </Button>
            <Button
              variant="primary"
              size="lg"
              loading={createIslem.isPending || createIleriTarihliIslem.isPending}
              onPress={handleSubmit}
              style={[styles.button, isIleriTarihli && styles.buttonIleriTarihli]}
            >
              {isIleriTarihli ? 'Planla' : 'Transfer Yap'}
            </Button>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
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
    paddingBottom: spacing['3xl'],
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    flex: 1,
  },
  bellButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  bellButtonActive: {
    backgroundColor: colors.warning + '20',
    borderColor: colors.warning,
  },
  ileriTarihliIndicator: {
    marginTop: spacing.sm,
    backgroundColor: colors.warning + '20',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
    alignSelf: 'flex-start',
  },
  ileriTarihliText: {
    color: colors.warning,
    fontWeight: '600',
  },
  section: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  pickerContainer: {
    marginBottom: spacing.md,
    zIndex: 1,
  },
  pickerLabel: {
    marginBottom: spacing.sm,
  },
  picker: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  pickerError: {
    borderColor: colors.error,
  },
  pickerDropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    marginTop: spacing.xs,
    zIndex: 10,
  },
  pickerOption: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  errorText: {
    marginTop: spacing.xs,
  },
  arrowContainer: {
    alignItems: 'center',
    marginVertical: spacing.sm,
  },
  buttons: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  button: {
    flex: 1,
  },
  buttonIleriTarihli: {
    backgroundColor: colors.warning,
  },
});
