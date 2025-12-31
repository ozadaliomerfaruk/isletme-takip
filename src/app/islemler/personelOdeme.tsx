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
import { Text, Input, Button, Card, DateTimePicker, CategoryPicker } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { usePersonelList } from '@/hooks/usePersonel';
import { useHesaplar } from '@/hooks/useHesaplar';
import { useCreateIslem } from '@/hooks/useIslemler';
import { formatCurrency, parseCurrency, isValidAmount } from '@/lib/currency';
import { formatDateForDB } from '@/lib/date';

export default function PersonelOdemePage() {
  const router = useRouter();
  const params = useLocalSearchParams<{ personel_id?: string; hesap_id?: string }>();
  const createIslem = useCreateIslem();

  const { data: personelList } = usePersonelList();
  const { data: hesaplar } = useHesaplar();

  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [personelId, setPersonelId] = useState<string | null>(params.personel_id || null);
  const [hesapId, setHesapId] = useState<string | null>(params.hesap_id || null);
  const [kategoriId, setKategoriId] = useState<string | null>(null);
  const [showPersonelPicker, setShowPersonelPicker] = useState(false);
  const [showHesapPicker, setShowHesapPicker] = useState(false);
  const [errors, setErrors] = useState<{ amount?: string; personel?: string; hesap?: string }>({});

  useEffect(() => {
    if (!personelId && personelList && personelList.length > 0 && !params.personel_id) {
      setPersonelId(personelList[0].id);
    }
    if (!hesapId && hesaplar && hesaplar.length > 0 && !params.hesap_id) {
      setHesapId(hesaplar[0].id);
    }
  }, [personelList, hesaplar, personelId, hesapId, params.personel_id, params.hesap_id]);

  const selectedPersonel = personelList?.find((p) => p.id === personelId);
  const selectedHesap = hesaplar?.find((h) => h.id === hesapId);

  const validate = () => {
    const newErrors: { amount?: string; personel?: string; hesap?: string } = {};

    if (!isValidAmount(amount)) {
      newErrors.amount = 'Geçerli bir tutar girin';
    }

    if (!personelId) {
      newErrors.personel = 'Personel seçin';
    }

    if (!hesapId) {
      newErrors.hesap = 'Ödeme yapılacak hesabı seçin';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;

    try {
      await createIslem.mutateAsync({
        type: 'personel_odeme',
        amount: parseCurrency(amount),
        description: description.trim() || null,
        personel_id: personelId,
        hesap_id: hesapId,
        kategori_id: kategoriId,
        date: formatDateForDB(selectedDate),
      });

      Alert.alert('Başarılı', 'Ödeme kaydedildi', [
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
            <Text variant="h2">Personel Ödemesi</Text>
            <Text variant="body" color="secondary">
              Bu işlem personele olan borcunuzu azaltır (maaş ödemesi vb.)
            </Text>
          </View>

          <View style={styles.section}>
            <View style={[styles.pickerContainer, { zIndex: 30 }]}>
              <Text variant="label" color="secondary" style={styles.pickerLabel}>
                Personel
              </Text>
              <TouchableOpacity
                style={[styles.picker, errors.personel && styles.pickerError]}
                onPress={() => {
                  setShowPersonelPicker(!showPersonelPicker);
                  setShowHesapPicker(false);
                }}
              >
                <View>
                  <Text variant="body">
                    {selectedPersonel
                      ? `${selectedPersonel.first_name} ${selectedPersonel.last_name}`
                      : 'Personel seçin'}
                  </Text>
                  {selectedPersonel && (
                    <Text variant="caption" color={Number(selectedPersonel.balance) < 0 ? 'error' : 'success'}>
                      Borç: {formatCurrency(Math.abs(Number(selectedPersonel.balance)))}
                    </Text>
                  )}
                </View>
                <ChevronDown size={20} color={colors.textMuted} />
              </TouchableOpacity>
              {errors.personel && (
                <Text variant="caption" color="error" style={styles.errorText}>
                  {errors.personel}
                </Text>
              )}
              {showPersonelPicker && (
                <Card style={styles.pickerDropdown}>
                  {personelList?.map((p) => (
                    <TouchableOpacity
                      key={p.id}
                      style={styles.pickerOption}
                      onPress={() => {
                        setPersonelId(p.id);
                        setShowPersonelPicker(false);
                      }}
                    >
                      <Text variant="body" style={p.id === personelId && { color: colors.primary }}>
                        {p.first_name} {p.last_name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </Card>
              )}
            </View>

            <View style={[styles.pickerContainer, { zIndex: 20 }]}>
              <Text variant="label" color="secondary" style={styles.pickerLabel}>
                Ödeme Yapılacak Hesap
              </Text>
              <TouchableOpacity
                style={[styles.picker, errors.hesap && styles.pickerError]}
                onPress={() => {
                  setShowHesapPicker(!showHesapPicker);
                  setShowPersonelPicker(false);
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

            {/* Kategori Seçici */}
            <CategoryPicker
              value={kategoriId}
              onChange={setKategoriId}
              type="gider"
              label="Kategori"
            />

            <Input
              label="Tutar"
              placeholder="0,00"
              keyboardType="decimal-pad"
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
              placeholder="Ödeme notu..."
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
              Ödeme Yap
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
