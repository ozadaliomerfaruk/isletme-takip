import { useMemo, useState, useCallback } from 'react';
import { View, StyleSheet, FlatList, TouchableOpacity, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { CalendarClock, ChevronRight } from 'lucide-react-native';
import { Text, EmptyState } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { formatCurrency, roundCurrency } from '@/lib/currency';
import { formatDateShort } from '@/lib/date';
import { useTaksitPlanListesi, type TaksitPlanOzet } from '@/hooks/useTaksit';

/**
 * Taksit Takip (Faz 3) — işletmedeki tüm taksit planları.
 * Ödenen/kalan değerleri tahsis defterinden türer (get_taksit_plan_listesi RPC).
 */
export default function TaksitTakipPage() {
  const { t } = useTranslation(['transactions', 'common', 'clients']);
  const router = useRouter();
  const { data: planlar, isLoading, refetch, isRefetching } = useTaksitPlanListesi();
  const [tab, setTab] = useState<'satis' | 'alis'>('satis');

  const filtreli = useMemo(
    () => (planlar ?? []).filter((p) => (tab === 'satis' ? p.type === 'cari_satis' : p.type === 'cari_alis')),
    [planlar, tab],
  );

  // Üst özet: açık planların kalan toplamları (yön bazlı). Çapraz-para toplanmaz —
  // TRY varsa TRY, yoksa ilk görülen para birimi baz alınır (mini-dashboard kuralı).
  const ozet = useMemo(() => {
    const acik = (planlar ?? []).filter((p) => Math.max(0, roundCurrency(p.toplam - p.odenen)) > 0.009);
    if (acik.length === 0) return null;
    const cur = acik.some((p) => p.currency === 'TRY') ? 'TRY' : acik[0].currency;
    const sum = (type: 'cari_satis' | 'cari_alis') =>
      roundCurrency(
        acik
          .filter((p) => p.currency === cur && p.type === type)
          .reduce((s, p) => s + Math.max(0, p.toplam - p.odenen), 0)
      );
    return {
      cur,
      tahsil: sum('cari_satis'),
      ode: sum('cari_alis'),
      tahsilAdet: acik.filter((p) => p.type === 'cari_satis').length,
      odeAdet: acik.filter((p) => p.type === 'cari_alis').length,
    };
  }, [planlar]);

  const renderItem = useCallback(
    ({ item }: { item: TaksitPlanOzet }) => {
      const tamamlandi = item.odenen_taksit_adedi >= item.taksit_adedi;
      const oran = item.toplam > 0 ? Math.min(1, item.odenen / item.toplam) : 0;
      return (
        <TouchableOpacity
          style={styles.card}
          activeOpacity={0.7}
          onPress={() => router.push(`/taksit/${item.plan_id}` as Href)}
        >
          <View style={styles.cardHeader}>
            <Text variant="body" style={styles.cariName} numberOfLines={1}>
              {item.cari_name}
            </Text>
            <ChevronRight size={18} color={colors.textMuted} />
          </View>

          <View style={styles.amountRow}>
            {/* Büyük rakam = KALAN (kullanıcının asıl merak ettiği); ödenen/toplam ikincil */}
            <Text variant="h3" color={tamamlandi ? 'success' : undefined} numberOfLines={1} style={styles.kalanAmount}>
              {t('transactions:vade.kalan')}: {formatCurrency(Math.max(0, item.toplam - item.odenen), item.currency)}
            </Text>
            <Text variant="caption" color="secondary" numberOfLines={1} style={styles.odenenText}>
              {t('transactions:taksit.odenenLabel')}: {formatCurrency(item.odenen, item.currency)} / {formatCurrency(item.toplam, item.currency)}
            </Text>
          </View>

          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${oran * 100}%` }, tamamlandi && { backgroundColor: colors.success }]} />
          </View>

          <View style={styles.metaRow}>
            <Text variant="caption" color="secondary">
              {t('transactions:taksit.odenenOran', { odenen: item.odenen_taksit_adedi, toplam: item.taksit_adedi })}
            </Text>
            {tamamlandi ? (
              <Text variant="caption" color="success">{t('transactions:taksit.tamamlandi')}</Text>
            ) : item.gecikmis_adet > 0 ? (
              <Text variant="caption" style={styles.gecikmisText}>
                {t('transactions:taksit.gecikmisAdet', { adet: item.gecikmis_adet })}
              </Text>
            ) : item.sonraki_vade ? (
              <Text variant="caption" color="secondary">
                {t('transactions:taksit.sonrakiVade')}: {formatDateShort(item.sonraki_vade)}
              </Text>
            ) : null}
          </View>
        </TouchableOpacity>
      );
    },
    [router, t],
  );

  return (
    <>
      <Stack.Screen options={{ headerTitle: t('transactions:taksit.title') }} />
      <SafeAreaView style={styles.container} edges={['bottom']}>
        {/* Üst özet — açık planların yön bazlı kalan toplamları */}
        {ozet && (
          <View style={styles.ozetRow}>
            <View style={[styles.ozetBox, styles.ozetBoxTahsil]}>
              <Text style={styles.ozetDeger} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
                {formatCurrency(ozet.tahsil, ozet.cur)}
              </Text>
              <Text style={styles.ozetLabel} numberOfLines={1}>
                {t('transactions:taksit.ozetTahsil')}
                {ozet.tahsilAdet > 0 ? ` · ${t('transactions:taksit.planAdet', { adet: ozet.tahsilAdet })}` : ''}
              </Text>
            </View>
            <View style={[styles.ozetBox, styles.ozetBoxOde]}>
              <Text style={styles.ozetDeger} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
                {formatCurrency(ozet.ode, ozet.cur)}
              </Text>
              <Text style={styles.ozetLabel} numberOfLines={1}>
                {t('transactions:taksit.ozetOde')}
                {ozet.odeAdet > 0 ? ` · ${t('transactions:taksit.planAdet', { adet: ozet.odeAdet })}` : ''}
              </Text>
            </View>
          </View>
        )}

        {/* Satış / Alış sekmeleri */}
        <View style={styles.tabs}>
          {(['satis', 'alis'] as const).map((tabKey) => (
            <TouchableOpacity
              key={tabKey}
              style={[styles.tabButton, tab === tabKey && styles.tabButtonActive]}
              onPress={() => setTab(tabKey)}
            >
              <Text style={[styles.tabText, tab === tabKey && styles.tabTextActive]}>
                {tabKey === 'satis' ? t('transactions:taksit.satis') : t('transactions:taksit.alis')}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <FlatList
          data={filtreli}
          keyExtractor={(item) => item.plan_id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={5}
          removeClippedSubviews={true}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
          ListEmptyComponent={
            isLoading ? null : (
              <EmptyState
                icon={<CalendarClock size={44} color={colors.textMuted} />}
                title={t('transactions:taksit.bos')}
                description={t('transactions:taksit.bosAciklama')}
              />
            )
          }
        />
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  // Üst özet kutuları — sol kenar şeritli, yön renkleriyle
  ozetRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
  },
  ozetBox: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    gap: 2,
    borderLeftWidth: 4,
  },
  ozetBoxTahsil: {
    borderLeftColor: colors.success,
  },
  ozetBoxOde: {
    borderLeftColor: colors.error,
  },
  ozetDeger: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.text,
  },
  ozetLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  tabs: {
    flexDirection: 'row',
    margin: spacing.lg,
    marginBottom: spacing.sm,
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.lg,
    padding: 3,
    gap: 3,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  tabButtonActive: {
    backgroundColor: colors.surface,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textMuted,
  },
  tabTextActive: {
    color: colors.text,
  },
  listContent: {
    padding: spacing.lg,
    paddingTop: spacing.sm,
    gap: spacing.sm,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  cariName: {
    fontWeight: '600',
    flex: 1,
  },
  amountRow: {
    marginBottom: 6,
    gap: 2,
  },
  kalanAmount: {
    flexShrink: 1,
  },
  odenenText: {
    flexShrink: 1,
  },
  progressBar: {
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.border,
    overflow: 'hidden',
    marginBottom: 6,
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 3,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  gecikmisText: {
    color: colors.error,
    fontWeight: '700',
  },
});
