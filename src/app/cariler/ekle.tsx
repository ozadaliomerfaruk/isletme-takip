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
import { useTranslation } from 'react-i18next';
import { Building2, User } from 'lucide-react-native';
import { Text, Input, Button, Card } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing } from '@/constants/spacing';
import { useCreateCari } from '@/hooks/useCariler';
import { CariType } from '@/types/database';

export default function CariEklePage() {
  const router = useRouter();
  const { t } = useTranslation(['clients', 'common', 'errors']);
  const createCari = useCreateCari();

  const cariTypes: { type: CariType; label: string; icon: React.ReactNode }[] = [
    { type: 'tedarikci', label: t('clients:types.tedarikci'), icon: <Building2 size={24} color={colors.warning} /> },
    { type: 'musteri', label: t('clients:types.musteri'), icon: <User size={24} color={colors.info} /> },
  ];

  const [name, setName] = useState('');
  const [type, setType] = useState<CariType>('tedarikci');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [balance, setBalance] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<{ name?: string }>({});

  const validate = () => {
    const newErrors: { name?: string } = {};

    if (!name.trim()) {
      newErrors.name = t('clients:validation.nameRequired');
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;

    try {
      // Bakiye mantığı:
      // Tedarikçi için negatif bakiye = borcumuz var
      // Müşteri için pozitif bakiye = alacağımız var
      let finalBalance = balance ? parseFloat(balance.replace(',', '.')) : 0;
      if (type === 'tedarikci' && finalBalance > 0) {
        finalBalance = -finalBalance; // Tedarikçiye borç negatif
      }

      await createCari.mutateAsync({
        name: name.trim(),
        type,
        phone: phone.trim() || null,
        email: email.trim() || null,
        address: address.trim() || null,
        balance: finalBalance,
        notes: notes.trim() || null,
      });

      Alert.alert(t('common:status.success'), t('clients:messages.createSuccess'), [
        { text: t('common:buttons.ok'), onPress: () => router.back() },
      ]);
    } catch (error: any) {
      Alert.alert(t('common:status.error'), error.message || t('errors:cari.createFailed'));
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
            <Text variant="h2">{t('clients:titles.addClient')}</Text>
          </View>

          {/* Cari Tipi Seçimi */}
          <View style={styles.section}>
            <Text variant="label" color="secondary" style={styles.sectionTitle}>
              {t('clients:form.type')}
            </Text>
            <View style={styles.typeGrid}>
              {cariTypes.map((item) => (
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
              label={t('clients:form.name')}
              placeholder={type === 'tedarikci' ? t('clients:form.nameSupplierPlaceholder') : t('clients:form.nameCustomerPlaceholder')}
              value={name}
              onChangeText={setName}
              error={errors.name}
            />

            <Input
              label={t('clients:form.phoneOptional')}
              placeholder={t('clients:form.phoneExample')}
              keyboardType="phone-pad"
              value={phone}
              onChangeText={setPhone}
            />

            <Input
              label={t('clients:form.emailOptional')}
              placeholder={t('clients:form.emailExample')}
              keyboardType="email-address"
              autoCapitalize="none"
              value={email}
              onChangeText={setEmail}
            />

            <Input
              label={t('clients:form.addressOptional')}
              placeholder={t('clients:form.addressDetailPlaceholder')}
              multiline
              numberOfLines={2}
              value={address}
              onChangeText={setAddress}
            />

            <Input
              label={type === 'tedarikci' ? t('clients:form.openingDebtOptional') : t('clients:form.openingReceivableOptional')}
              placeholder="0"
              keyboardType="decimal-pad"
              value={balance}
              onChangeText={setBalance}
            />

            <Input
              label={t('clients:form.noteOptional')}
              placeholder={t('clients:form.noteDetailPlaceholder')}
              multiline
              numberOfLines={3}
              value={notes}
              onChangeText={setNotes}
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
              {t('common:buttons.cancel')}
            </Button>
            <Button
              variant="primary"
              size="lg"
              loading={createCari.isPending}
              onPress={handleSubmit}
              style={styles.button}
            >
              {t('common:buttons.save')}
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
  sectionTitle: {
    marginBottom: spacing.md,
  },
  typeGrid: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  typeCard: {
    flex: 1,
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
