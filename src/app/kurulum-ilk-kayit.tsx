/**
 * Kurulum 2/3 — Rehberli oluşturma (Onboarding sade akış)
 *
 * Soru sormadan, kullanıcıyı uygulamayı TANIMASI için temel kayıtları oluşturmaya
 * yönlendirir: Hesap · Cari · Personel. Her kart ilgili ekleme ekranını açar;
 * kayıt eklenince ✓ olur (react-query cache create mutasyonunda invalidate edilir).
 * Hepsi opsiyonel — "Devam" ile kutlama ekranına geçilir.
 */
import { View, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Wallet, Users, UserCircle, Check, ChevronRight, type LucideIcon } from 'lucide-react-native';

import { Text, Button } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { useHesaplar } from '@/hooks/useHesaplar';
import { useCariler } from '@/hooks/useCariler';
import { usePersonelList } from '@/hooks/usePersonel';
import { logEvent } from '@/lib/appEvents';

export default function KurulumOlustur() {
  const router = useRouter();
  const { t } = useTranslation(['auth']);

  const { data: hesaplar } = useHesaplar();
  const { data: cariler } = useCariler();
  const { data: personeller } = usePersonelList();

  const items: { key: string; route: Href; Icon: LucideIcon; color: string; done: boolean }[] = [
    { key: 'hesap', route: '/hesaplar/ekle' as Href, Icon: Wallet, color: colors.primary, done: (hesaplar?.length ?? 0) > 0 },
    { key: 'cari', route: '/cariler/ekle' as Href, Icon: Users, color: colors.info, done: (cariler?.length ?? 0) > 0 },
    { key: 'personel', route: '/personel/ekle' as Href, Icon: UserCircle, color: colors.warning, done: (personeller?.length ?? 0) > 0 },
  ];

  const handleFinish = () => {
    logEvent('setup_create_done', {
      hesap: (hesaplar?.length ?? 0) > 0,
      cari: (cariler?.length ?? 0) > 0,
      personel: (personeller?.length ?? 0) > 0,
    });
    router.replace('/kurulum-tamam');
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text variant="caption" style={styles.stepLabel}>
            {t('auth:setup.step', { current: 3, total: 3 })}
          </Text>
          <Text variant="h2" center style={styles.title}>
            {t('auth:setup.create.title')}
          </Text>
          <Text variant="body" color="secondary" center style={styles.subtitle}>
            {t('auth:setup.create.subtitle')}
          </Text>
        </View>

        <View style={styles.list}>
          {items.map((item) => (
            <TouchableOpacity
              key={item.key}
              style={styles.card}
              activeOpacity={0.7}
              onPress={() => router.push(item.route)}
            >
              <View style={[styles.iconCircle, { backgroundColor: item.color + '18' }]}>
                <item.Icon size={24} color={item.color} />
              </View>
              <View style={styles.cardText}>
                <Text variant="body" style={styles.cardLabel}>
                  {t(`auth:setup.create.${item.key}.label`)}
                </Text>
                <Text variant="caption" color="secondary">
                  {t(`auth:setup.create.${item.key}.desc`)}
                </Text>
              </View>
              {item.done ? (
                <View style={styles.doneBadge}>
                  <Check size={16} color={colors.white} />
                </View>
              ) : (
                <ChevronRight size={20} color={colors.textMuted} />
              )}
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Button variant="primary" size="lg" fullWidth onPress={handleFinish}>
          {t('auth:setup.create.continue')}
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
    marginBottom: spacing['2xl'],
  },
  stepLabel: {
    textAlign: 'center',
    color: colors.primary,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: spacing.md,
  },
  title: {
    marginBottom: spacing.sm,
  },
  subtitle: {
    paddingHorizontal: spacing.lg,
  },
  list: {
    gap: spacing.md,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.md,
  },
  iconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardText: {
    flex: 1,
    gap: 2,
  },
  cardLabel: {
    fontWeight: '700',
    fontSize: 16,
  },
  doneBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.lg,
    paddingTop: spacing.md,
  },
});
