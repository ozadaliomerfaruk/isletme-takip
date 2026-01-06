import { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, Stack } from 'expo-router';
import { ChevronDown } from 'lucide-react-native';
import { Text, Input, Button, Card, CategoryPicker, CurrencyInput } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { useHesaplar } from '@/hooks/useHesaplar';
import { useCariler } from '@/hooks/useCariler';
import { usePersonelList } from '@/hooks/usePersonel';
import { useIslem, useUpdateIslem } from '@/hooks/useIslemler';
import { formatCurrency, parseCurrency, isValidAmount } from '@/lib/currency';
import { IslemType } from '@/types/database';
import { ISLEM_TYPE_LABELS } from '@/constants/islemTypes';

export default function IslemDuzenlePage() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: islem, isLoading: islemLoading } = useIslem(id);
  const updateIslem = useUpdateIslem();

  const { data: hesaplar } = useHesaplar();
  const { data: cariler } = useCariler();
  const { data: personelList } = usePersonelList();

  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [hesapId, setHesapId] = useState<string | null>(null);
  const [hedefHesapId, setHedefHesapId] = useState<string | null>(null);
  const [kategoriId, setKategoriId] = useState<string | null>(null);
  const [cariId, setCariId] = useState<string | null>(null);
  const [personelId, setPersonelId] = useState<string | null>(null);
  const [date, setDate] = useState('');

  const [showHesapPicker, setShowHesapPicker] = useState(false);
  const [showHedefHesapPicker, setShowHedefHesapPicker] = useState(false);
  const [showCariPicker, setShowCariPicker] = useState(false);
  const [showPersonelPicker, setShowPersonelPicker] = useState(false);

  const [errors, setErrors] = useState<{ amount?: string; hesap?: string }>({});

  // İşlem yüklendiğinde form alanlarını doldur
  useEffect(() => {
    if (islem) {
      setAmount(String(islem.amount));
      setDescription(islem.description || '');
      setHesapId(islem.hesap_id);
      setHedefHesapId(islem.hedef_hesap_id);
      setKategoriId(islem.kategori_id);
      setCariId(islem.cari_id);
      setPersonelId(islem.personel_id);
      setDate(islem.date);
    }
  }, [islem]);

  const islemType = islem?.type as IslemType | undefined;

  const selectedHesap = hesaplar?.find((h) => h.id === hesapId);
  const selectedHedefHesap = hesaplar?.find((h) => h.id === hedefHesapId);
  const selectedCari = cariler?.find((c) => c.id === cariId);
  const selectedPersonel = personelList?.find((p) => p.id === personelId);

  const needsHesap = ['gelir', 'gider', 'transfer', 'cari_odeme', 'cari_tahsilat', 'personel_odeme'].includes(islemType || '');
  const needsHedefHesap = islemType === 'transfer';
  // Kategori: gelir, gider, cari_alis, cari_satis, personel_gider
  const needsKategori = ['gelir', 'gider', 'cari_alis', 'cari_satis', 'personel_gider'].includes(islemType || '');
  const needsCari = ['cari_alis', 'cari_satis', 'cari_odeme', 'cari_tahsilat'].includes(islemType || '');
  const needsPersonel = ['personel_gider', 'personel_odeme'].includes(islemType || '');

  const validate = () => {
    const newErrors: { amount?: string; hesap?: string } = {};

    if (!isValidAmount(amount)) {
      newErrors.amount = 'Geçerli bir tutar girin';
    }

    if (needsHesap && !hesapId) {
      newErrors.hesap = 'Hesap seçin';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate() || !id) return;

    try {
      await updateIslem.mutateAsync({
        id,
        updates: {
          amount: parseCurrency(amount),
          description: description.trim() || null,
          hesap_id: hesapId,
          hedef_hesap_id: hedefHesapId,
          kategori_id: kategoriId,
          cari_id: cariId,
          personel_id: personelId,
          date,
        },
      });

      Alert.alert('Başarılı', 'Islem guncellendi', [
        { text: 'Tamam', onPress: () => router.back() },
      ]);
    } catch (error: any) {
      Alert.alert('Hata', error.message || 'Islem guncellenemedi');
    }
  };

  if (islemLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text color="secondary" style={{ marginTop: spacing.md }}>Yükleniyor...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!islem) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.loadingContainer}>
          <Text color="error">Islem bulunamadi</Text>
          <Button variant="outline" onPress={() => router.back()} style={{ marginTop: spacing.lg }}>
            Geri Don
          </Button>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerTitle: 'İşlemi Düzenle',
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
            {/* Header */}
            <View style={styles.header}>
              <Text variant="h2">{ISLEM_TYPE_LABELS[islemType!]} Düzenle</Text>
              <Text variant="caption" color="secondary">
                Islem tipi degistirilemez
              </Text>
            </View>

            {/* Form */}
            <View style={styles.section}>
              {/* Tutar */}
              <CurrencyInput
                label="Tutar"
                value={amount}
                onChangeText={setAmount}
                error={errors.amount}
              />

              {/* Hesap Seçici */}
              {needsHesap && (
                <View style={[styles.pickerContainer, { zIndex: 50 }]}>
                  <Text variant="label" color="secondary" style={styles.pickerLabel}>
                    Hesap
                  </Text>
                  <TouchableOpacity
                    style={[styles.picker, errors.hesap && styles.pickerError]}
                    onPress={() => {
                      setShowHesapPicker(!showHesapPicker);
                      setShowHedefHesapPicker(false);
                      setShowCariPicker(false);
                      setShowPersonelPicker(false);
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
              )}

              {/* Hedef Hesap Seçici (Transfer için) */}
              {needsHedefHesap && (
                <View style={[styles.pickerContainer, { zIndex: 45 }]}>
                  <Text variant="label" color="secondary" style={styles.pickerLabel}>
                    Hedef Hesap
                  </Text>
                  <TouchableOpacity
                    style={styles.picker}
                    onPress={() => {
                      setShowHedefHesapPicker(!showHedefHesapPicker);
                      setShowHesapPicker(false);
                      setShowCariPicker(false);
                      setShowPersonelPicker(false);
                    }}
                  >
                    <Text variant="body">
                      {selectedHedefHesap?.name || 'Hedef hesap seçin'}
                    </Text>
                    <ChevronDown size={20} color={colors.textMuted} />
                  </TouchableOpacity>
                  {showHedefHesapPicker && (
                    <Card style={styles.pickerDropdown}>
                      {hesaplar?.filter(h => h.id !== hesapId).map((hesap) => (
                        <TouchableOpacity
                          key={hesap.id}
                          style={styles.pickerOption}
                          onPress={() => {
                            setHedefHesapId(hesap.id);
                            setShowHedefHesapPicker(false);
                          }}
                        >
                          <Text
                            variant="body"
                            style={hesap.id === hedefHesapId && { color: colors.primary }}
                          >
                            {hesap.name}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </Card>
                  )}
                </View>
              )}

              {/* Kategori Seçici */}
              {needsKategori && (
                <CategoryPicker
                  value={kategoriId}
                  onChange={setKategoriId}
                  type={islemType === 'gelir' || islemType === 'cari_satis' ? 'gelir' : 'gider'}
                  label="Kategori"
                />
              )}

              {/* Cari Seçici */}
              {needsCari && (
                <View style={[styles.pickerContainer, { zIndex: 35 }]}>
                  <Text variant="label" color="secondary" style={styles.pickerLabel}>
                    Cari
                  </Text>
                  <TouchableOpacity
                    style={styles.picker}
                    onPress={() => {
                      setShowCariPicker(!showCariPicker);
                      setShowHesapPicker(false);
                      setShowHedefHesapPicker(false);
                      setShowPersonelPicker(false);
                    }}
                  >
                    <View>
                      <Text variant="body">
                        {selectedCari?.name || 'Cari seçin'}
                      </Text>
                      {selectedCari && (
                        <Text variant="caption" color={Number(selectedCari.balance) < 0 ? 'error' : 'secondary'}>
                          Bakiye: {formatCurrency(Number(selectedCari.balance))}
                        </Text>
                      )}
                    </View>
                    <ChevronDown size={20} color={colors.textMuted} />
                  </TouchableOpacity>
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
                          <Text
                            variant="body"
                            style={cari.id === cariId && { color: colors.primary }}
                          >
                            {cari.name}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </Card>
                  )}
                </View>
              )}

              {/* Personel Seçici */}
              {needsPersonel && (
                <View style={[styles.pickerContainer, { zIndex: 30 }]}>
                  <Text variant="label" color="secondary" style={styles.pickerLabel}>
                    Personel
                  </Text>
                  <TouchableOpacity
                    style={styles.picker}
                    onPress={() => {
                      setShowPersonelPicker(!showPersonelPicker);
                      setShowHesapPicker(false);
                      setShowHedefHesapPicker(false);
                      setShowCariPicker(false);
                    }}
                  >
                    <View>
                      <Text variant="body">
                        {selectedPersonel
                          ? `${selectedPersonel.first_name} ${selectedPersonel.last_name}`
                          : 'Personel seçin'}
                      </Text>
                      {selectedPersonel && (
                        <Text variant="caption" color={Number(selectedPersonel.balance) < 0 ? 'error' : 'secondary'}>
                          Borc: {formatCurrency(Math.abs(Number(selectedPersonel.balance)))}
                        </Text>
                      )}
                    </View>
                    <ChevronDown size={20} color={colors.textMuted} />
                  </TouchableOpacity>
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
                          <Text
                            variant="body"
                            style={p.id === personelId && { color: colors.primary }}
                          >
                            {p.first_name} {p.last_name}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </Card>
                  )}
                </View>
              )}

              {/* Açıklama */}
              <Input
                label="Açıklama (Opsiyonel)"
                placeholder="İşlem hakkında not..."
                multiline
                numberOfLines={3}
                value={description}
                onChangeText={setDescription}
              />
            </View>

            {/* Buttons */}
            <View style={styles.buttons}>
              <Button
                variant="outline"
                size="lg"
                onPress={() => router.back()}
                style={styles.button}
              >
                Iptal
              </Button>
              <Button
                variant="primary"
                size="lg"
                loading={updateIslem.isPending}
                onPress={handleSubmit}
                style={styles.button}
              >
                Guncelle
              </Button>
            </View>
          </ScrollView>
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
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
    zIndex: 100,
    maxHeight: 200,
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
