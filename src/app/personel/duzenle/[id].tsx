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
import { Text, Input, Button } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing } from '@/constants/spacing';
import { usePersonelById, useUpdatePersonel } from '@/hooks/usePersonel';

export default function PersonelDuzenlePage() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: personel, isLoading } = usePersonelById(id);
  const updatePersonel = useUpdatePersonel();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [position, setPosition] = useState('');
  const [salary, setSalary] = useState('');
  const [errors, setErrors] = useState<{ firstName?: string; lastName?: string }>({});

  useEffect(() => {
    if (personel) {
      setFirstName(personel.first_name);
      setLastName(personel.last_name);
      setPhone(personel.phone || '');
      setPosition(personel.position || '');
      setSalary(personel.salary ? String(personel.salary) : '');
    }
  }, [personel]);

  const validate = () => {
    const newErrors: { firstName?: string; lastName?: string } = {};

    if (!firstName.trim()) {
      newErrors.firstName = 'Ad gerekli';
    }

    if (!lastName.trim()) {
      newErrors.lastName = 'Soyad gerekli';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate() || !id) return;

    try {
      await updatePersonel.mutateAsync({
        id,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        phone: phone.trim() || null,
        position: position.trim() || null,
        salary: salary ? parseFloat(salary.replace(',', '.')) : null,
      });

      Alert.alert('Başarılı', 'Personel guncellendi', [
        { text: 'Tamam', onPress: () => router.back() },
      ]);
    } catch (error: any) {
      Alert.alert('Hata', error.message || 'Personel guncellenemedi');
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

  if (!personel) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.loadingContainer}>
          <Text>Personel bulunamadi</Text>
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
            {/* Form */}
            <View style={styles.section}>
              <Input
                label="Ad"
                placeholder="Personelin adi"
                value={firstName}
                onChangeText={setFirstName}
                error={errors.firstName}
              />

              <Input
                label="Soyad"
                placeholder="Personelin soyadi"
                value={lastName}
                onChangeText={setLastName}
                error={errors.lastName}
              />

              <Input
                label="Telefon (Opsiyonel)"
                placeholder="0532 123 4567"
                keyboardType="phone-pad"
                value={phone}
                onChangeText={setPhone}
              />

              <Input
                label="Pozisyon (Opsiyonel)"
                placeholder="Orn: Sef, Garson, Kasiyer"
                value={position}
                onChangeText={setPosition}
              />

              <Input
                label="Maas (Opsiyonel)"
                placeholder="Aylik maas tutari"
                keyboardType="decimal-pad"
                value={salary}
                onChangeText={setSalary}
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
                loading={updatePersonel.isPending}
                onPress={handleSubmit}
                style={styles.button}
              >
                Guncelle
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
