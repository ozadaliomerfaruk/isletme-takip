/**
 * Kurulum 1/3 — Sektör seçimi (sade onboarding)
 *
 * "Ne iş yapıyorsun?" Seçim isletmeler.sector'a yazılır; DB trigger'ı bilinen
 * sektörlere özel kategorileri ekler. "Diğer"e basınca metin kutusu açılır ve
 * serbest metin onboarding_prefs.sector_other'a kaydedilir (ne iş yaptığını görmek için).
 * Sektör sonrası → tabela adı ekranı.
 */
import { useState, useRef } from 'react';
import { View, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
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
  Pill,
  Building2,
  Camera,
  Laptop,
  Store,
  type LucideIcon,
} from 'lucide-react-native';

import { Text, Input, Button } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { supabase } from '@/lib/supabase';
import { useAuthContext } from '@/contexts/AuthContext';
import { logEvent } from '@/lib/appEvents';
import type { IsletmeSector, OnboardingPrefs } from '@/types/database';

const SECTORS: { id: IsletmeSector; icon: LucideIcon; color: string }[] = [
  { id: 'market_bakkal', icon: ShoppingBasket, color: '#10B981' },
  { id: 'kafe_restoran', icon: Coffee, color: '#F59E0B' },
  { id: 'berber_kuafor', icon: Scissors, color: '#8B5CF6' },
  { id: 'giyim_tekstil', icon: Shirt, color: '#EC4899' },
  { id: 'oto', icon: Car, color: '#3B82F6' },
  { id: 'nalbur_insaat', icon: Hammer, color: '#EF4444' },
  { id: 'toptan_dagitim', icon: Truck, color: '#14B8A6' },
  { id: 'eczane', icon: Pill, color: '#06B6D4' },
  { id: 'emlak', icon: Building2, color: '#0EA5E9' },
  { id: 'fotografci', icon: Camera, color: '#D946EF' },
  { id: 'serbest_meslek', icon: Laptop, color: '#6366F1' },
  { id: 'diger', icon: Store, color: '#6B7280' },
];

export default function KurulumSektor() {
  const router = useRouter();
  const { t } = useTranslation(['auth']);
  const { isletme, refreshIsletme } = useAuthContext();
  const [savingId, setSavingId] = useState<IsletmeSector | null>(null);
  const [showOther, setShowOther] = useState(false);
  const [otherText, setOtherText] = useState('');
  const scrollRef = useRef<ScrollView>(null);

  const goNext = () => router.replace('/kurulum-tabela');

  const writeAndGo = async (sector: IsletmeSector, prefs?: OnboardingPrefs) => {
    setSavingId(sector);
    try {
      if (isletme) {
        const payload = prefs ? { sector, onboarding_prefs: prefs } : { sector };
        const { error } = await supabase.from('isletmeler').update(payload).eq('id', isletme.id);
        if (error) throw error;
        logEvent('sector_selected', { sector });
        refreshIsletme().catch(() => {});
      }
    } catch (error) {
      if (__DEV__) console.warn('Sektör kaydedilemedi:', error);
      // Sektör kaydı kritik değil — akışı bloklamadan devam et
    } finally {
      goNext();
    }
  };

  const handleSelect = (sector: IsletmeSector) => {
    if (savingId) return;
    if (sector === 'diger') {
      setShowOther(true);
      // Metin kutusu klavyenin altında kalmasın: görünür olunca en alta kaydır
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 350);
      return;
    }
    setShowOther(false);
    writeAndGo(sector);
  };

  const handleDigerContinue = () => {
    if (savingId) return;
    const txt = otherText.trim();
    writeAndGo('diger', txt ? { sector_other: txt } : undefined);
  };

  const handleSkip = () => {
    if (savingId) return;
    logEvent('sector_skipped');
    goNext();
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView ref={scrollRef} contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
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
            const isActive = sector.id === 'diger' && showOther;
            return (
              <TouchableOpacity
                key={sector.id}
                style={[styles.card, isActive && styles.cardActive]}
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

        {showOther && (
          <View style={styles.otherBox}>
            <Input
              value={otherText}
              onChangeText={setOtherText}
              placeholder={t('auth:setup.sector.otherPlaceholder')}
              autoFocus
            />
            <Button
              variant="primary"
              size="lg"
              fullWidth
              onPress={handleDigerContinue}
              loading={savingId === 'diger'}
              style={styles.otherButton}
            >
              {t('auth:setup.tabela.continue')}
            </Button>
          </View>
        )}

        <TouchableOpacity style={styles.skipButton} onPress={handleSkip} disabled={!!savingId}>
          <Text variant="body" color="secondary" style={styles.skipText}>
            {t('auth:setup.skipForNow')}
          </Text>
        </TouchableOpacity>
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
  flex: {
    flex: 1,
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
  cardActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
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
  otherBox: {
    marginTop: spacing.lg,
    gap: spacing.md,
  },
  otherButton: {
    marginTop: spacing.xs,
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
