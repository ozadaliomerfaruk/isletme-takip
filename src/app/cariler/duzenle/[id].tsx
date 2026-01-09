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
import { useTranslation } from 'react-i18next';
import { Building2, User } from 'lucide-react-native';
import { Text, Input, Button, Card } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing } from '@/constants/spacing';
import { useCari, useUpdateCari } from '@/hooks/useCariler';
import { CariType } from '@/types/database';

export default function CariDuzenlePage() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation(['cariler', 'common', 'errors']);

  const cariTypes: { type: CariType; label: string; icon: React.ReactNode }[] = [
    { type: 'tedarikci', label: t('cariler:types.tedarikci'), icon: <Building2 size={24} color={colors.warning} /> },
    { type: 'musteri', label: t('cariler:types.musteri'), icon: <User size={24} color={colors.info} /> },
  ];
  const { data: cari, isLoading } = useCari(id);
  const updateCari = useUpdateCari();

  const [name, setName] = useState('');
  const [type, setType] = useState<CariType>('tedarikci');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<{ name?: string }>({});

  useEffect(() => {
    if (cari) {
      setName(cari.name);
      setType(cari.type);
      setPhone(cari.phone || '');
      setEmail(cari.email || '');
      setAddress(cari.address || '');
      setNotes(cari.notes || '');
    }
  }, [cari]);

  const validate = () => {
    const newErrors: { name?: string } = {};

    if (!name.trim()) {
      newErrors.name = t('cariler:validation.nameRequired');
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate() || !id) return;

    try {
      await updateCari.mutateAsync({
        id,
        name: name.trim(),
        type,
        phone: phone.trim() || null,
        email: email.trim() || null,
        address: address.trim() || null,
        notes: notes.trim() || null,
      });

      Alert.alert(t('common:status.success'), t('cariler:messages.updateSuccess'), [
        { text: t('common:buttons.ok'), onPress: () => router.back() },
      ]);
    } catch (error: any) {
      Alert.alert(t('common:status.error'), error.message || t('errors:cari.updateFailed'));
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.loadingContainer}>
          <Text>{t('common:status.loading')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!cari) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.loadingContainer}>
          <Text>{t('errors:cari.notFound')}</Text>
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
            {/* Cari Tipi Seçimi */}
            <View style={styles.section}>
              <Text variant="label" color="secondary" style={styles.sectionTitle}>
                {t('cariler:form.type')}
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
                label={t('cariler:form.name')}
                placeholder={type === 'tedarikci' ? t('cariler:form.nameSupplierPlaceholder') : t('cariler:form.nameCustomerPlaceholder')}
                value={name}
                onChangeText={setName}
                error={errors.name}
              />

              <Input
                label={t('cariler:form.phoneOptional')}
                placeholder={t('cariler:form.phoneExample')}
                keyboardType="phone-pad"
                value={phone}
                onChangeText={setPhone}
              />

              <Input
                label={t('cariler:form.emailOptional')}
                placeholder={t('cariler:form.emailExample')}
                keyboardType="email-address"
                autoCapitalize="none"
                value={email}
                onChangeText={setEmail}
              />

              <Input
                label={t('cariler:form.addressOptional')}
                placeholder={t('cariler:form.addressDetailPlaceholder')}
                multiline
                numberOfLines={2}
                value={address}
                onChangeText={setAddress}
              />

              <Input
                label={t('cariler:form.noteOptional')}
                placeholder={t('cariler:form.noteDetailPlaceholder')}
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
                loading={updateCari.isPending}
                onPress={handleSubmit}
                style={styles.button}
              >
                {t('common:buttons.update')}
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
