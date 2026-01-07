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
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ChevronDown, Bell } from 'lucide-react-native';
import { Text, Input, Button, Card, DateTimePicker, CategoryPicker, CurrencyInput } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { useHesaplar } from '@/hooks/useHesaplar';
import { useCreateIslem } from '@/hooks/useIslemler';
import { useCreateIleriTarihliIslem } from '@/hooks/useIleriTarihliIslemler';
import { parseCurrency, isValidAmount } from '@/lib/currency';
import { formatDateForDB } from '@/lib/date';

export default function GiderEklePage() {
  const router = useRouter();
  const params = useLocalSearchParams<{ hesap_id?: string }>();
  const createIslem = useCreateIslem();
  const createIleriTarihliIslem = useCreateIleriTarihliIslem();

  const { data: hesaplar } = useHesaplar();

  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [hesapId, setHesapId] = useState<string | null>(params.hesap_id || null);
  const [kategoriId, setKategoriId] = useState<string | null>(null);
  const [showHesapPicker, setShowHesapPicker] = useState(false);
  const [isIleriTarihli, setIsIleriTarihli] = useState(false);
  const [errors, setErrors] = useState<{ amount?: string; hesap?: string; date?: string }>({});

  useEffect(() => {
    if (!hesapId && hesaplar && hesaplar.length > 0) {
      setHesapId(hesaplar[0].id);
    }
  }, [hesaplar, hesapId]);

  const selectedHesap = hesaplar?.find((h) => h.id === hesapId);

  const validate = () => {
    const newErrors: { amount?: string; hesap?: string; date?: string } = {};

    if (!isValidAmount(amount)) {
      newErrors.amount = 'Geçerli bir tutar girin';
    }

    if (!hesapId) {
      newErrors.hesap = 'Hesap seçin';
    }

    // İleri tarihli işlemlerde tarih kontrolü
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
        // İleri tarihli işlem olarak kaydet
        await createIleriTarihliIslem.mutateAsync({
          type: 'gider',
          amount: parseCurrency(amount),
          description: description.trim() || null,
          hesap_id: hesapId,
          kategori_id: kategoriId,
          scheduled_date: formatDateForDB(selectedDate),
        });

        Alert.alert('Başarılı', 'İleri tarihli gider oluşturuldu', [
          { text: 'Tamam', onPress: () => router.back() },
        ]);
      } else {
        // Normal işlem olarak kaydet
        await createIslem.mutateAsync({
          type: 'gider',
          amount: parseCurrency(amount),
          description: description.trim() || null,
          hesap_id: hesapId,
          kategori_id: kategoriId,
          date: formatDateForDB(selectedDate),
        });

        Alert.alert('Başarılı', 'Gider eklendi', [
          { text: 'Tamam', onPress: () => router.back() },
        ]);
      }
    } catch (error: any) {
      Alert.alert('Hata', error.message || 'İşlem eklenemedi');
    }
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
              <Text variant="h2" style={styles.headerTitle}>Gider Ekle</Text>
              <TouchableOpacity
                style={[styles.bellButton, isIleriTarihli && styles.bellButtonActive]}
                onPress={() => {
                  setIsIleriTarihli(!isIleriTarihli);
                  // İleri tarihli aktifleştiğinde yarını seç
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

            <View style={[styles.pickerContainer, { zIndex: 20 }]}>
              <Text variant="label" color="secondary" style={styles.pickerLabel}>
                Hesap
              </Text>
              <TouchableOpacity
                style={[styles.picker, errors.hesap && styles.pickerError]}
                onPress={() => {
                  setShowHesapPicker(!showHesapPicker);
                }}
              >
                <Text variant="body">
                  {selectedHesap?.name || 'Hesap seçin'}
                </Text>
                <ChevronDown size={20} color={colors.textMuted} />
              </TouchableOpacity>
              {errors.hesap && (
                <Text variant="caption" color="error" style={styles.errorText}>
                  {errors.hesap}
                </Text>
              )}
              {showHesapPicker && (
                <Card style={styles.pickerDropdown}>
                  {hesaplar?.map((hesap) => (
                    <TouchableOpacity
                      key={hesap.id}
                      style={styles.pickerOption}
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
                    </TouchableOpacity>
                  ))}
                </Card>
              )}
            </View>

            {/* Kategori Seçici */}
            <CategoryPicker
              value={kategoriId}
              onChange={setKategoriId}
              type="gider"
              label="Kategori"
            />

            <DateTimePicker
              label={isIleriTarihli ? "İşlem Tarihi" : "Tarih ve Saat"}
              value={selectedDate}
              onChange={setSelectedDate}
              mode={isIleriTarihli ? "date" : "datetime"}
              error={errors.date}
            />

            <Input
              label="Açıklama (Opsiyonel)"
              placeholder="İşlem hakkında not..."
              multiline
              numberOfLines={3}
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
              {isIleriTarihli ? 'Planla' : 'Kaydet'}
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
    marginBottom: spacing.lg,
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
