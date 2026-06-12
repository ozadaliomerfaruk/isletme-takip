/**
 * Kurulum 2/3 — İlk kayıt (Onboarding v1.5)
 *
 * "Bugün dükkânda ne oldu?" — üç büyük seçenek:
 *   Para girdi  → gelir      | Para çıktı → gider
 *   Veresiye yazdım → ÖNCE "Kime?" (cari seç/oluştur — inline) → cari modunda satış
 * İlk işlem kaydedilince kutlama ekranına geçilir. "Şimdilik geç" her zaman var;
 * geçeni ana ekrandaki "kurulumu bitir" kartı sonra yakalar.
 */
import { useEffect, useRef, useState } from 'react';
import { View, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { TrendingUp, TrendingDown, NotebookPen, ChevronRight } from 'lucide-react-native';

import { Text } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { QuickTransactionBar } from '@/components/transaction/QuickTransactionBar';
import { CariPickerSheet } from '@/components/transaction/QuickTransactionBar/components';
import { useHesaplar, useCreateHesap } from '@/hooks/useHesaplar';
import { useCariler, useCreateCari } from '@/hooks/useCariler';
import { logEvent } from '@/lib/appEvents';
import { clearNeedsSetup } from '@/lib/setupFlow';

type EntryOption = 'gelir' | 'gider' | 'veresiye';

export default function KurulumIlkKayit() {
  const router = useRouter();
  const { t } = useTranslation(['auth']);

  const { data: hesaplar, isLoading: hesaplarLoading } = useHesaplar();
  const createHesap = useCreateHesap();
  const { data: musteriler } = useCariler('musteri');
  const createCari = useCreateCari();

  const [activeEntry, setActiveEntry] = useState<EntryOption | null>(null);
  const [showCariPicker, setShowCariPicker] = useState(false);
  const [veresiyeCariId, setVeresiyeCariId] = useState<string | null>(null);

  // Hesabı olmayan işletmede (eski kullanıcı / migration öncesi) Kasa'yı sessizce aç.
  // Yeni kayıtlarda DB trigger'ı zaten açıyor; bu istemci tarafı güvenlik ağı.
  const kasaEnsuredRef = useRef(false);
  useEffect(() => {
    if (kasaEnsuredRef.current || hesaplarLoading || !hesaplar) return;
    if (hesaplar.length > 0) {
      kasaEnsuredRef.current = true;
      return;
    }
    kasaEnsuredRef.current = true;
    const kasa = { name: t('auth:setup.defaultCashAccount'), type: 'nakit' as const, currency: 'TRY' as const };
    createHesap
      .mutateAsync({ ...kasa, is_auto_created: true })
      .catch(() =>
        // is_auto_created kolonu henüz yoksa (migration uygulanmadıysa) kolonsuz dene
        createHesap.mutateAsync(kasa).catch(() => {})
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hesaplarLoading, hesaplar]);

  const handleEntryPress = (entry: EntryOption) => {
    if (entry === 'veresiye') {
      // Veresiye = cari satış → önce "kime yazdın?" (cari seç ya da inline oluştur)
      setShowCariPicker(true);
    } else {
      setActiveEntry(entry);
    }
  };

  const handleVeresiyeCariSelect = (cariId: string) => {
    setShowCariPicker(false);
    setVeresiyeCariId(cariId);
    setActiveEntry('veresiye');
  };

  const handleVeresiyeCariCreate = (name: string) => {
    createCari.mutate(
      { name, type: 'musteri' },
      {
        onSuccess: (yeniCari) => handleVeresiyeCariSelect(yeniCari.id),
      }
    );
  };

  const handleTransactionSuccess = () => {
    logEvent('setup_first_tx_saved', { entry: activeEntry });
    setActiveEntry(null);
    setVeresiyeCariId(null);
    router.replace('/kurulum-tamam');
  };

  const handleSkip = () => {
    logEvent('setup_skipped', { step: 'first_tx' });
    clearNeedsSetup();
    router.replace('/(tabs)');
  };

  const OPTIONS: { id: EntryOption; icon: typeof TrendingUp; color: string; bg: string }[] = [
    { id: 'gelir', icon: TrendingUp, color: colors.success, bg: colors.success + '18' },
    { id: 'gider', icon: TrendingDown, color: colors.error, bg: colors.error + '18' },
    { id: 'veresiye', icon: NotebookPen, color: colors.info, bg: colors.info + '18' },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text variant="caption" style={styles.stepLabel}>
            {t('auth:setup.step', { current: 2, total: 3 })}
          </Text>
          <Text variant="h2" center style={styles.title}>
            {t('auth:setup.firstEntry.title')}
          </Text>
          <Text variant="body" color="secondary" center style={styles.subtitle}>
            {t('auth:setup.firstEntry.subtitle')}
          </Text>
        </View>

        <View style={styles.options}>
          {OPTIONS.map((option) => {
            const Icon = option.icon;
            return (
              <TouchableOpacity
                key={option.id}
                style={styles.optionCard}
                onPress={() => handleEntryPress(option.id)}
                activeOpacity={0.7}
              >
                <View style={[styles.optionIcon, { backgroundColor: option.bg }]}>
                  <Icon size={28} color={option.color} />
                </View>
                <View style={styles.optionTextContainer}>
                  <Text variant="body" style={styles.optionLabel}>
                    {t(`auth:setup.firstEntry.options.${option.id}.label`)}
                  </Text>
                  <Text variant="caption" color="secondary">
                    {t(`auth:setup.firstEntry.options.${option.id}.description`)}
                  </Text>
                </View>
                <ChevronRight size={20} color={colors.textMuted} />
              </TouchableOpacity>
            );
          })}
        </View>

        <TouchableOpacity style={styles.skipButton} onPress={handleSkip}>
          <Text variant="body" color="secondary" style={styles.skipText}>
            {t('auth:setup.skipForNow')}
          </Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Veresiye: önce müşteri seç / inline oluştur */}
      <CariPickerSheet
        visible={showCariPicker}
        onDismiss={() => setShowCariPicker(false)}
        onSelect={handleVeresiyeCariSelect}
        cariler={musteriler || []}
        selectedId={veresiyeCariId}
        mode="customer"
        onCreateNew={handleVeresiyeCariCreate}
        creating={createCari.isPending}
      />

      {/* Mini işlem formu */}
      {activeEntry && (
        <QuickTransactionBar
          visible
          onDismiss={() => {
            setActiveEntry(null);
            setVeresiyeCariId(null);
          }}
          defaultType={activeEntry === 'veresiye' ? 'satis' : activeEntry}
          defaultCariId={activeEntry === 'veresiye' ? veresiyeCariId || undefined : undefined}
          defaultCariType={activeEntry === 'veresiye' ? 'musteri' : undefined}
          onSuccess={handleTransactionSuccess}
        />
      )}
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
  options: {
    gap: spacing.md,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.md,
  },
  optionIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionTextContainer: {
    flex: 1,
    gap: 2,
  },
  optionLabel: {
    fontWeight: '700',
    fontSize: 16,
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
