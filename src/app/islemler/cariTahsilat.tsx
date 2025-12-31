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
import { ChevronDown } from 'lucide-react-native';
import { Text, Input, Button, Card, DateTimePicker, CurrencyInput } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { useCariler } from '@/hooks/useCariler';
import { useHesaplar } from '@/hooks/useHesaplar';
import { useCreateIslem } from '@/hooks/useIslemler';
import { formatCurrency, parseCurrency, isValidAmount } from '@/lib/currency';
import { formatDateForDB } from '@/lib/date';

export default function CariTahsilatPage() {
  const router = useRouter();
  const params = useLocalSearchParams<{ cari_id?: string }>();
  const createIslem = useCreateIslem();

  const { data: cariler } = useCariler('musteri');
  const { data: hesaplar } = useHesaplar();

  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [cariId, setCariId] = useState<string | null>(params.cari_id || null);
  const [hesapId, setHesapId] = useState<string | null>(null);
  const [showCariPicker, setShowCariPicker] = useState(false);
  const [showHesapPicker, setShowHesapPicker] = useState(false);
  const [errors, setErrors] = useState<{ amount?: string; cari?: string; hesap?: string }>({});

  useEffect(() => {
    if (!cariId && cariler && cariler.length > 0 && !params.cari_id) {
      setCariId(cariler[0].id);
    }
    if (!hesapId && hesaplar && hesaplar.length > 0) {
      setHesapId(hesaplar[0].id);
    }
  }, [cariler, hesaplar, cariId, hesapId, params.cari_id]);

  const selectedCari = cariler?.find((c) => c.id === cariId);
  const selectedHesap = hesaplar?.find((h) => h.id === hesapId);

  const validate = () => {
    const newErrors: { amount?: string; cari?: string; hesap?: string } = {};

    if (!isValidAmount(amount)) {
      newErrors.amount = 'Geçerli bir tutar girin';
    }

    if (!cariId) {
      newErrors.cari = 'Müşteri seçin';
    }

    if (!hesapId) {
      newErrors.hesap = 'Tahsilat yapılacak hesabı seçin';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;

    try {
      await createIslem.mutateAsync({
        type: 'cari_tahsilat',
        amount: parseCurrency(amount),
        description: description.trim() || null,
        cari_id: cariId,
        hesap_id: hesapId,
        date: formatDateForDB(selectedDate),
      });

      Alert.alert('Başarılı', 'Tahsilat kaydedildi', [
        { text: 'Tamam', onPress: () => router.back() },
      ]);
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
            <Text variant="h2">Müşteriden Tahsilat</Text>
            <Text variant="body" color="secondary">
              Bu işlem müşteriden alacağınızı azaltır
            </Text>
          </View>

          <View style={styles.section}>
            <View style={[styles.pickerContainer, { zIndex: 20 }]}>
              <Text variant="label" color="secondary" style={styles.pickerLabel}>
                Müşteri
              </Text>
              <TouchableOpacity
                style={[styles.picker, errors.cari && styles.pickerError]}
                onPress={() => {
                  setShowCariPicker(!showCariPicker);
                  setShowHesapPicker(false);
                }}
              >
                <View>
                  <Text variant="body">{selectedCari?.name || 'Müşteri seçin'}</Text>
                  {selectedCari && (
                    <Text variant="caption" color={Number(selectedCari.balance) > 0 ? 'success' : 'secondary'}>
                      Alacak: {formatCurrency(Math.abs(Number(selectedCari.balance)))}
                    </Text>
                  )}
                </View>
                <ChevronDown size={20} color={colors.textMuted} />
              </TouchableOpacity>
              {errors.cari && (
                <Text variant="caption" color="error" style={styles.errorText}>
                  {errors.cari}
                </Text>
              )}
              {showCariPicker && (
                <Card style={styles.pickerDropdown}>
                  {cariler?.map((cari) => (
                    <TouchableOpacity
                      key={cari.id}
                      style={styles.pickerOption}
                      onPress={() => {
                        setCariId(cari.id);
                        setShowCariPicker(false);
                      }}
                    >
                      <Text variant="body" style={cari.id === cariId && { color: colors.primary }}>
                        {cari.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </Card>
              )}
            </View>

            <View style={[styles.pickerContainer, { zIndex: 10 }]}>
              <Text variant="label" color="secondary" style={styles.pickerLabel}>
                Tahsilat Yapılacak Hesap
              </Text>
              <TouchableOpacity
                style={[styles.picker, errors.hesap && styles.pickerError]}
                onPress={() => {
                  setShowHesapPicker(!showHesapPicker);
                  setShowCariPicker(false);
                }}
              >
                <View>
                  <Text variant="body">{selectedHesap?.name || 'Hesap seçin'}</Text>
                  {selectedHesap && (
                    <Text variant="caption" color="secondary">
                      Bakiye: {formatCurrency(Number(selectedHesap.balance))}
                    </Text>
                  )}
                </View>
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
                      <Text variant="body" style={hesap.id === hesapId && { color: colors.primary }}>
                        {hesap.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </Card>
              )}
            </View>

            <CurrencyInput
              label="Tutar"
              value={amount}
              onChangeText={setAmount}
              error={errors.amount}
            />

            <DateTimePicker
              label="Tarih ve Saat"
              value={selectedDate}
              onChange={setSelectedDate}
              mode="datetime"
            />

            <Input
              label="Açıklama (Opsiyonel)"
              placeholder="Tahsilat notu..."
              multiline
              numberOfLines={3}
              value={description}
              onChangeText={setDescription}
            />
          </View>

          <View style={styles.buttons}>
            <Button variant="outline" size="lg" onPress={() => router.back()} style={styles.button}>
              İptal
            </Button>
            <Button
              variant="primary"
              size="lg"
              loading={createIslem.isPending}
              onPress={handleSubmit}
              style={styles.button}
            >
              Tahsil Et
            </Button>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  keyboardView: { flex: 1 },
  scrollView: { flex: 1 },
  scrollContent: { paddingBottom: spacing['3xl'] },
  header: { paddingHorizontal: spacing.lg, paddingVertical: spacing.lg },
  section: { paddingHorizontal: spacing.lg, marginBottom: spacing.lg },
  pickerContainer: { marginBottom: spacing.lg, zIndex: 1 },
  pickerLabel: { marginBottom: spacing.sm },
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
  pickerError: { borderColor: colors.error },
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
  errorText: { marginTop: spacing.xs },
  buttons: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  button: { flex: 1 },
});
