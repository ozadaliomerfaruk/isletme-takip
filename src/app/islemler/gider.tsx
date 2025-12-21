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
import { Text, Input, Button, Card, DateTimePicker } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { useHesaplar } from '@/hooks/useHesaplar';
import { useKategoriler } from '@/hooks/useKategoriler';
import { useCreateIslem } from '@/hooks/useIslemler';

export default function GiderEklePage() {
  const router = useRouter();
  const params = useLocalSearchParams<{ hesap_id?: string }>();
  const createIslem = useCreateIslem();

  const { data: hesaplar } = useHesaplar();
  const { data: kategoriler } = useKategoriler('gider');

  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [hesapId, setHesapId] = useState<string | null>(params.hesap_id || null);
  const [kategoriId, setKategoriId] = useState<string | null>(null);
  const [showHesapPicker, setShowHesapPicker] = useState(false);
  const [showKategoriPicker, setShowKategoriPicker] = useState(false);
  const [errors, setErrors] = useState<{ amount?: string; hesap?: string }>({});

  useEffect(() => {
    if (!hesapId && hesaplar && hesaplar.length > 0) {
      setHesapId(hesaplar[0].id);
    }
  }, [hesaplar, hesapId]);

  const selectedHesap = hesaplar?.find((h) => h.id === hesapId);
  const selectedKategori = kategoriler?.find((k) => k.id === kategoriId);

  const validate = () => {
    const newErrors: { amount?: string; hesap?: string } = {};

    if (!amount || parseFloat(amount.replace(',', '.')) <= 0) {
      newErrors.amount = 'Geçerli bir tutar girin';
    }

    if (!hesapId) {
      newErrors.hesap = 'Hesap seçin';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;

    try {
      await createIslem.mutateAsync({
        type: 'gider',
        amount: parseFloat(amount.replace(',', '.')),
        description: description.trim() || null,
        hesap_id: hesapId,
        kategori_id: kategoriId,
        date: selectedDate.toISOString().split('T')[0],
      });

      Alert.alert('Başarılı', 'Gider eklendi', [
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
            <Text variant="h2">Gider Ekle</Text>
          </View>

          <View style={styles.section}>
            <Input
              label="Tutar"
              placeholder="0,00"
              keyboardType="decimal-pad"
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
                  setShowKategoriPicker(false);
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

            <View style={[styles.pickerContainer, { zIndex: 10 }]}>
              <Text variant="label" color="secondary" style={styles.pickerLabel}>
                Kategori (Opsiyonel)
              </Text>
              <TouchableOpacity
                style={styles.picker}
                onPress={() => {
                  setShowKategoriPicker(!showKategoriPicker);
                  setShowHesapPicker(false);
                }}
              >
                <Text variant="body" color={selectedKategori ? 'primary' : 'secondary'}>
                  {selectedKategori?.name || 'Kategori seçin'}
                </Text>
                <ChevronDown size={20} color={colors.textMuted} />
              </TouchableOpacity>
              {showKategoriPicker && (
                <Card style={styles.pickerDropdown}>
                  <TouchableOpacity
                    style={styles.pickerOption}
                    onPress={() => {
                      setKategoriId(null);
                      setShowKategoriPicker(false);
                    }}
                  >
                    <Text variant="body" color="secondary">
                      Kategori yok
                    </Text>
                  </TouchableOpacity>
                  {kategoriler?.map((kategori) => (
                    <TouchableOpacity
                      key={kategori.id}
                      style={styles.pickerOption}
                      onPress={() => {
                        setKategoriId(kategori.id);
                        setShowKategoriPicker(false);
                      }}
                    >
                      <Text
                        variant="body"
                        style={kategori.id === kategoriId && { color: colors.primary }}
                      >
                        {kategori.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </Card>
              )}
            </View>

            <DateTimePicker
              label="Tarih ve Saat"
              value={selectedDate}
              onChange={setSelectedDate}
              mode="datetime"
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
              loading={createIslem.isPending}
              onPress={handleSubmit}
              style={styles.button}
            >
              Kaydet
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
});
