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
import { Wallet, Building2, CreditCard, Banknote } from 'lucide-react-native';
import { Text, Input, Button, Card } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { useCreateHesap } from '@/hooks/useHesaplar';
import { HesapType } from '@/types/database';
import { useTranslation } from 'react-i18next';

export default function HesapEklePage() {
  const router = useRouter();
  const { t } = useTranslation(['accounts', 'common', 'errors']);
  const createHesap = useCreateHesap();

  const hesapTypes: { type: HesapType; label: string; icon: React.ReactNode }[] = [
    { type: 'nakit', label: t('accounts:typeLabels.nakit'), icon: <Wallet size={24} color={colors.primary} /> },
    { type: 'banka', label: t('accounts:typeLabels.banka'), icon: <Building2 size={24} color={colors.info} /> },
    { type: 'kredi_karti', label: t('accounts:typeLabels.krediKarti'), icon: <CreditCard size={24} color={colors.warning} /> },
    { type: 'diger', label: t('accounts:typeLabels.diger'), icon: <Banknote size={24} color={colors.textSecondary} /> },
  ];

  const [name, setName] = useState('');
  const [type, setType] = useState<HesapType>('nakit');
  const [balance, setBalance] = useState('');
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState<{ name?: string }>({});

  const validate = () => {
    const newErrors: { name?: string } = {};

    if (!name.trim()) {
      newErrors.name = t('accounts:validation.nameRequired');
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;

    try {
      await createHesap.mutateAsync({
        name: name.trim(),
        type,
        balance: balance ? parseFloat(balance.replace(',', '.')) : 0,
        description: description.trim() || null,
      });

      Alert.alert(t('common:status.success'), t('accounts:messages.createSuccess'), [
        { text: t('common:buttons.ok'), onPress: () => router.back() },
      ]);
    } catch (error: any) {
      Alert.alert(t('common:status.error'), error.message || t('errors:account.createFailed'));
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
            <Text variant="h2">{t('accounts:titles.addAccount')}</Text>
          </View>

          {/* Hesap Tipi Seçimi */}
          <View style={styles.section}>
            <Text variant="label" color="secondary" style={styles.sectionTitle}>
              {t('accounts:form.type')}
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
              label={t('accounts:form.name')}
              placeholder={t('accounts:form.namePlaceholder')}
              value={name}
              onChangeText={setName}
              error={errors.name}
            />

            <Input
              label={t('accounts:form.openingBalanceOptional')}
              placeholder="0"
              keyboardType="decimal-pad"
              value={balance}
              onChangeText={setBalance}
            />

            <Input
              label={t('accounts:form.descriptionOptional')}
              placeholder={t('accounts:form.descriptionPlaceholder')}
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
              {t('common:buttons.cancel')}
            </Button>
            <Button
              variant="primary"
              size="lg"
              loading={createHesap.isPending}
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
