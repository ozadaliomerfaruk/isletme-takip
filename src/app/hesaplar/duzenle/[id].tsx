import { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Wallet, Building2, CreditCard, Banknote } from 'lucide-react-native';
import { Text, Input, Button, Card } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing } from '@/constants/spacing';
import { useHesap, useUpdateHesap } from '@/hooks/useHesaplar';
import { HesapType } from '@/types/database';

const hesapTypes: { type: HesapType; label: string; icon: React.ReactNode }[] = [
  { type: 'nakit', label: 'Nakit', icon: <Wallet size={24} color={colors.primary} /> },
  { type: 'banka', label: 'Banka', icon: <Building2 size={24} color={colors.info} /> },
  { type: 'kredi_karti', label: 'Kredi Kartı', icon: <CreditCard size={24} color={colors.warning} /> },
  { type: 'diger', label: 'Diğer', icon: <Banknote size={24} color={colors.textSecondary} /> },
];

export default function HesapDuzenlePage() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: hesap, isLoading } = useHesap(id);
  const updateHesap = useUpdateHesap();

  const [name, setName] = useState('');
  const [type, setType] = useState<HesapType>('nakit');
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState<{ name?: string }>({});

  useEffect(() => {
    if (hesap) {
      setName(hesap.name);
      setType(hesap.type);
      setDescription(hesap.description || '');
    }
  }, [hesap]);

  const validate = () => {
    const newErrors: { name?: string } = {};

    if (!name.trim()) {
      newErrors.name = 'Hesap adı gerekli';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate() || !id) return;

    try {
      await updateHesap.mutateAsync({
        id,
        name: name.trim(),
        type,
        description: description.trim() || null,
      });

      Alert.alert('Başarılı', 'Hesap güncellendi', [
        { text: 'Tamam', onPress: () => router.back() },
      ]);
    } catch (error: any) {
      Alert.alert('Hata', error.message || 'Hesap güncellenemedi');
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.loadingContainer}>
          <Text>Yükleniyor...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!hesap) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.loadingContainer}>
          <Text>Hesap bulunamadı</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
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
            {/* Hesap Tipi Seçimi */}
            <View style={styles.section}>
              <Text variant="label" color="secondary" style={styles.sectionTitle}>
                Hesap Tipi
              </Text>
              <View style={styles.typeGrid}>
                {hesapTypes.map((item) => (
                  <Card
                    key={item.type}
                    variant={type === item.type ? 'elevated' : 'outlined'}
                    padding="md"
                    onPress={() => setType(item.type)}
                    style={[
                      styles.typeCard,
                      type === item.type && styles.typeCardActive,
                    ]}
                  >
                    {item.icon}
                    <Text
                      variant="label"
                      style={{
                        color: type === item.type ? colors.primary : colors.text,
                        marginTop: spacing.sm,
                      }}
                    >
                      {item.label}
                    </Text>
                  </Card>
                ))}
              </View>
            </View>

            {/* Form */}
            <View style={styles.section}>
              <Input
                label="Hesap Adı"
                placeholder="Örn: Nakit Kasa, Ziraat Bankası"
                value={name}
                onChangeText={setName}
                error={errors.name}
              />

              <Input
                label="Açıklama (Opsiyonel)"
                placeholder="Hesap hakkında not..."
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
                İptal
              </Button>
              <Button
                variant="primary"
                size="lg"
                loading={updateHesap.isPending}
                onPress={handleSubmit}
                style={styles.button}
              >
                Güncelle
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
    paddingTop: spacing['3xl'],
    paddingBottom: spacing['3xl'],
  },
  section: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    marginBottom: spacing.md,
  },
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  typeCard: {
    width: '47%',
    alignItems: 'center',
    paddingVertical: spacing.lg,
  },
  typeCardActive: {
    borderColor: colors.primary,
    borderWidth: 2,
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
