/**
 * Kurulum 2/3 — Tabela (işletme) adı (sade onboarding)
 *
 * Sektörden sonra işletmenin adını sorar; isletmeler.name'e yazar (kayıtta girilen
 * adla ön-doldurulur, değiştirilebilir). Sonra → rehberli oluşturma (ilk kayıt).
 */
import { useState } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Store } from 'lucide-react-native';

import { Text, Input, Button } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing } from '@/constants/spacing';
import { supabase } from '@/lib/supabase';
import { useAuthContext } from '@/contexts/AuthContext';
import { logEvent } from '@/lib/appEvents';

export default function KurulumTabela() {
  const router = useRouter();
  const { t } = useTranslation(['auth']);
  const { isletme, refreshIsletme } = useAuthContext();
  const [name, setName] = useState(isletme?.name ?? '');
  const [saving, setSaving] = useState(false);

  const goNext = () => router.replace('/kurulum-ilk-kayit');

  const handleContinue = async () => {
    if (saving) return;
    const trimmed = name.trim();
    setSaving(true);
    try {
      if (isletme && trimmed && trimmed !== isletme.name) {
        const { error } = await supabase.from('isletmeler').update({ name: trimmed }).eq('id', isletme.id);
        if (error) throw error;
        logEvent('setup_tabela_set');
        refreshIsletme().catch(() => {});
      }
    } catch (error) {
      if (__DEV__) console.warn('Tabela adı kaydedilemedi:', error);
    } finally {
      goNext();
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text variant="caption" style={styles.stepLabel}>
            {t('auth:setup.step', { current: 2, total: 3 })}
          </Text>
          <View style={styles.iconCircle}>
            <Store size={32} color={colors.primary} />
          </View>
          <Text variant="h2" center style={styles.title}>
            {t('auth:setup.tabela.title')}
          </Text>
          <Text variant="body" color="secondary" center style={styles.subtitle}>
            {t('auth:setup.tabela.subtitle')}
          </Text>
        </View>

        <Input
          value={name}
          onChangeText={setName}
          placeholder={t('auth:setup.tabela.placeholder')}
          autoFocus
          returnKeyType="done"
          onSubmitEditing={handleContinue}
        />
      </ScrollView>

      <View style={styles.footer}>
        <Button variant="primary" size="lg" fullWidth onPress={handleContinue} loading={saving}>
          {t('auth:setup.tabela.continue')}
        </Button>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    flexGrow: 1,
    padding: spacing.xl,
    paddingTop: spacing['3xl'],
  },
  header: {
    alignItems: 'center',
    marginBottom: spacing['2xl'],
  },
  stepLabel: {
    textAlign: 'center',
    color: colors.primary,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: spacing.lg,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  title: {
    marginBottom: spacing.sm,
  },
  subtitle: {
    paddingHorizontal: spacing.lg,
  },
  footer: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.lg,
    paddingTop: spacing.md,
  },
});
