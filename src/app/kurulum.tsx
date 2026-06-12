/**
 * Kurulum 1/3 — Sektör seçimi (Onboarding v1.5)
 *
 * Kayıt sonrası TEK soru: "Ne iş yapıyorsun?" Seçim isletmeler.sector'a yazılır;
 * DB trigger'ı (add_sector_kategoriler) sektöre özel kategorileri ekler.
 * Tek dokunuş = ilerle (ayrı "devam" butonu yok). "Şimdilik geç" her zaman görünür.
 */
import { useState } from 'react';
import { View, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  ShoppingBasket,
  Coffee,
  Scissors,
  Shirt,
  Car,
  Hammer,
  Truck,
  Store,
} from 'lucide-react-native';

import { Text } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { supabase } from '@/lib/supabase';
import { useAuthContext } from '@/contexts/AuthContext';
import { logEvent } from '@/lib/appEvents';
import type { IsletmeSector } from '@/types/database';

const SECTORS: { id: IsletmeSector; icon: typeof Store; color: string }[] = [
  { id: 'market_bakkal', icon: ShoppingBasket, color: '#10B981' },
  { id: 'kafe_restoran', icon: Coffee, color: '#F59E0B' },
  { id: 'berber_kuafor', icon: Scissors, color: '#8B5CF6' },
  { id: 'giyim_tekstil', icon: Shirt, color: '#EC4899' },
  { id: 'oto', icon: Car, color: '#3B82F6' },
  { id: 'nalbur_insaat', icon: Hammer, color: '#EF4444' },
  { id: 'toptan_dagitim', icon: Truck, color: '#14B8A6' },
  { id: 'diger', icon: Store, color: '#6B7280' },
];

export default function KurulumSektor() {
  const router = useRouter();
  const { t } = useTranslation(['auth']);
  const { isletme, refreshIsletme } = useAuthContext();
  const [savingId, setSavingId] = useState<IsletmeSector | null>(null);

  const handleSelect = async (sector: IsletmeSector) => {
    if (savingId) return;
    setSavingId(sector);
    try {
      if (isletme) {
        const { error } = await supabase
          .from('isletmeler')
          .update({ sector })
          .eq('id', isletme.id);
        if (error) throw error;
        logEvent('sector_selected', { sector });
        refreshIsletme().catch(() => {});
      }
    } catch (error) {
      if (__DEV__) console.warn('Sektör kaydedilemedi:', error);
      // Sektör kaydı kritik değil — akışı bloklamadan devam et
    } finally {
      router.replace('/kurulum-ilk-kayit');
    }
  };

  const handleSkip = () => {
    if (savingId) return;
    logEvent('sector_skipped');
    router.replace('/kurulum-ilk-kayit');
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text variant="caption" style={styles.stepLabel}>
            {t('auth:setup.step', { current: 1, total: 3 })}
          </Text>
          <Text variant="h2" center style={styles.title}>
            {t('auth:setup.sector.title')}
          </Text>
          <Text variant="body" color="secondary" center style={styles.subtitle}>
            {t('auth:setup.sector.subtitle')}
          </Text>
        </View>

        <View style={styles.grid}>
          {SECTORS.map((sector) => {
            const Icon = sector.icon;
            const isSaving = savingId === sector.id;
            return (
              <TouchableOpacity
                key={sector.id}
                style={styles.card}
                onPress={() => handleSelect(sector.id)}
                activeOpacity={0.7}
                disabled={!!savingId}
              >
                <View style={[styles.iconContainer, { backgroundColor: sector.color + '18' }]}>
                  {isSaving ? (
                    <ActivityIndicator size="small" color={sector.color} />
                  ) : (
                    <Icon size={30} color={sector.color} />
                  )}
                </View>
                <Text variant="body" style={styles.cardLabel} numberOfLines={2}>
                  {t(`auth:setup.sector.options.${sector.id}`)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <TouchableOpacity style={styles.skipButton} onPress={handleSkip} disabled={!!savingId}>
          <Text variant="body" color="secondary" style={styles.skipText}>
            {t('auth:setup.skipForNow')}
          </Text>
        </TouchableOpacity>
      </ScrollView>
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
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    justifyContent: 'space-between',
  },
  card: {
    width: '47.5%',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  iconContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  cardLabel: {
    textAlign: 'center',
    fontWeight: '600',
  },
  skipButton: {
    marginTop: spacing['2xl'],
    alignSelf: 'center',
    padding: spacing.md,
  },
  skipText: {
    textDecorationLine: 'underline',
  },
});
