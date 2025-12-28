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
import { usePersonelList } from '@/hooks/usePersonel';
import { useKategoriler } from '@/hooks/useKategoriler';
import { useCreateIslem } from '@/hooks/useIslemler';
import { formatCurrency, parseCurrency, isValidAmount, formatDateForDB } from '@/lib/utils';

export default function PersonelGiderPage() {
  const router = useRouter();
  const params = useLocalSearchParams<{ personel_id?: string }>();
  const createIslem = useCreateIslem();

  const { data: personelList } = usePersonelList();
  const { data: kategoriler } = useKategoriler('gider');

  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [personelId, setPersonelId] = useState<string | null>(params.personel_id || null);
  const [kategoriId, setKategoriId] = useState<string | null>(null);
  const [showPersonelPicker, setShowPersonelPicker] = useState(false);
  const [showKategoriPicker, setShowKategoriPicker] = useState(false);
  const [errors, setErrors] = useState<{ amount?: string; personel?: string }>({});

  useEffect(() => {
    if (!personelId && personelList && personelList.length > 0 && !params.personel_id) {
      setPersonelId(personelList[0].id);
    }
  }, [personelList, personelId, params.personel_id]);

  const selectedPersonel = personelList?.find((p) => p.id === personelId);
  const selectedKategori = kategoriler?.find((k) => k.id === kategoriId);

  const validate = () => {
    const newErrors: { amount?: string; personel?: string } = {};

    if (!isValidAmount(amount)) {
      newErrors.amount = 'Gecerli bir tutar girin';
    }

    if (!personelId) {
      newErrors.personel = 'Personel secin';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;

    try {
      await createIslem.mutateAsync({
        type: 'personel_gider',
        amount: parseCurrency(amount),
        description: description.trim() || `${selectedPersonel?.first_name} ${selectedPersonel?.last_name} - Gider`,
        personel_id: personelId,
        kategori_id: kategoriId,
        date: formatDateForDB(selectedDate),
      });

      Alert.alert('Basarili', 'Gider kaydedildi', [
        { text: 'Tamam', onPress: () => router.back() },
      ]);
    } catch (error: any) {
      Alert.alert('Hata', error.message || 'Islem eklenemedi');
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
            <Text variant="h2">Personel Gideri</Text>
            <Text variant="body" color="secondary">
              Bu islem personele olan borcunuzu artirir (maas tahakkuku vb.)
            </Text>
          </View>

          <View style={styles.section}>
            <View style={[styles.pickerContainer, { zIndex: 20 }]}>
              <Text variant="label" color="secondary" style={styles.pickerLabel}>
                Personel
              </Text>
              <TouchableOpacity
                style={[styles.picker, errors.personel && styles.pickerError]}
                onPress={() => {
                  setShowPersonelPicker(!showPersonelPicker);
                  setShowKategoriPicker(false);
                }}
              >
                <View>
                  <Text variant="body">
                    {selectedPersonel
                      ? `${selectedPersonel.first_name} ${selectedPersonel.last_name}`
                      : 'Personel secin'}
                  </Text>
                  {selectedPersonel && (
                    <Text variant="caption" color={Number(selectedPersonel.balance) < 0 ? 'error' : 'secondary'}>
                      Borc: {formatCurrency(Math.abs(Number(selectedPersonel.balance)))}
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

            {/* Kategori Seçici */}
            <View style={[styles.pickerContainer, { zIndex: 10 }]}>
              <Text variant="label" color="secondary" style={styles.pickerLabel}>
                Kategori (Opsiyonel)
              </Text>
              <TouchableOpacity
                style={styles.picker}
                onPress={() => {
                  setShowKategoriPicker(!showKategoriPicker);
                  setShowPersonelPicker(false);
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
              label="Aciklama (Opsiyonel)"
              placeholder="Gider notu..."
              multiline
              numberOfLines={3}
              value={description}
              onChangeText={setDescription}
            />
          </View>

          <View style={styles.buttons}>
            <Button variant="outline" size="lg" onPress={() => router.back()} style={styles.button}>
              Iptal
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
