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
import { useRouter } from 'expo-router';
import { Building2 } from 'lucide-react-native';
import { Text, Input, Button, Card } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing } from '@/constants/spacing';
import { useAuthContext } from '@/contexts/AuthContext';
import { useUpdateIsletme } from '@/hooks/useIsletme';

export default function IsletmeBilgileriPage() {
  const router = useRouter();
  const { isletme, user } = useAuthContext();
  const updateIsletme = useUpdateIsletme();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [taxNumber, setTaxNumber] = useState('');
  const [errors, setErrors] = useState<{ name?: string }>({});

  useEffect(() => {
    if (isletme) {
      setName(isletme.name);
      setPhone(isletme.phone || '');
      setAddress(isletme.address || '');
      setTaxNumber(isletme.tax_number || '');
    }
  }, [isletme]);

  const validate = () => {
    const newErrors: { name?: string } = {};

    if (!name.trim()) {
      newErrors.name = 'Isletme adi gerekli';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;

    try {
      await updateIsletme.mutateAsync({
        name: name.trim(),
        phone: phone.trim() || null,
        address: address.trim() || null,
        tax_number: taxNumber.trim() || null,
      });

      Alert.alert('Basarili', 'Isletme bilgileri guncellendi', [
        { text: 'Tamam', onPress: () => router.back() },
      ]);
    } catch (error: any) {
      Alert.alert('Hata', error.message || 'Isletme bilgileri guncellenemedi');
    }
  };

  if (!isletme) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.loadingContainer}>
          <Text>Yukleniyor...</Text>
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
            {/* Isletme Icon */}
            <View style={styles.iconContainer}>
              <View style={styles.iconCircle}>
                <Building2 size={48} color={colors.primary} />
              </View>
            </View>

            {/* Hesap Bilgisi */}
            <Card style={styles.infoCard}>
              <Text variant="label" color="secondary">Hesap E-posta</Text>
              <Text variant="body">{user?.email}</Text>
              <Text variant="caption" color="muted" style={{ marginTop: spacing.xs }}>
                E-posta adresi degistirilemez
              </Text>
            </Card>

            {/* Form */}
            <View style={styles.section}>
              <Text variant="h3" style={styles.sectionTitle}>
                Isletme Bilgileri
              </Text>

              <Input
                label="Isletme Adi"
                placeholder="Isletmenizin adi"
                value={name}
                onChangeText={setName}
                error={errors.name}
              />

              <Input
                label="Telefon (Opsiyonel)"
                placeholder="0532 123 4567"
                keyboardType="phone-pad"
                value={phone}
                onChangeText={setPhone}
              />

              <Input
                label="Adres (Opsiyonel)"
                placeholder="Isletme adresi"
                value={address}
                onChangeText={setAddress}
                multiline
                numberOfLines={3}
              />

              <Input
                label="Vergi Numarasi (Opsiyonel)"
                placeholder="Vergi numarasi"
                keyboardType="number-pad"
                value={taxNumber}
                onChangeText={setTaxNumber}
              />
            </View>

            {/* Kayit Bilgisi */}
            <Card style={styles.infoCard}>
              <Text variant="label" color="secondary">Kayit Tarihi</Text>
              <Text variant="body">
                {new Date(isletme.created_at).toLocaleDateString('tr-TR', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </Text>
            </Card>

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
                loading={updateIsletme.isPending}
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
    paddingTop: spacing.xl,
    paddingBottom: spacing['3xl'],
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.primaryLight + '30',
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoCard: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  section: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    marginBottom: spacing.md,
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
