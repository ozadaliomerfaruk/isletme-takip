import { useState } from 'react';
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
import { Text, Input, Button } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing } from '@/constants/spacing';
import { useCreatePersonel } from '@/hooks/usePersonel';

export default function PersonelEklePage() {
  const router = useRouter();
  const createPersonel = useCreatePersonel();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [position, setPosition] = useState('');
  const [salary, setSalary] = useState('');
  const [errors, setErrors] = useState<{ firstName?: string; lastName?: string }>({});

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
    if (!validate()) return;

    try {
      await createPersonel.mutateAsync({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        phone: phone.trim() || null,
        position: position.trim() || null,
        salary: salary ? parseFloat(salary.replace(',', '.')) : null,
      });

      Alert.alert('Başarılı', 'Personel oluşturuldu', [
        { text: 'Tamam', onPress: () => router.back() },
      ]);
    } catch (error: any) {
      Alert.alert('Hata', error.message || 'Personel oluşturulamadı');
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
          {/* Header */}
          <View style={styles.header}>
            <Text variant="h2">Personel Ekle</Text>
          </View>

          {/* Form */}
          <View style={styles.section}>
            <Input
              label="Ad"
              placeholder="Personelin adı"
              value={firstName}
              onChangeText={setFirstName}
              error={errors.firstName}
            />

            <Input
              label="Soyad"
              placeholder="Personelin soyadı"
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
              placeholder="Örn: Şef, Garson, Kasiyer"
              value={position}
              onChangeText={setPosition}
            />

            <Input
              label="Maaş (Opsiyonel)"
              placeholder="Aylık maaş tutarı"
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
              İptal
            </Button>
            <Button
              variant="primary"
              size="lg"
              loading={createPersonel.isPending}
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
