import { useMemo, useState, useCallback } from 'react';
import { View, StyleSheet, FlatList, TouchableOpacity, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { CalendarClock, ChevronRight } from 'lucide-react-native';
import { Text, EmptyState } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { formatCurrency } from '@/lib/currency';
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
            <Text variant="h3" color={tamamlandi ? 'success' : undefined}>
              {formatCurrency(item.odenen, item.currency)}
            </Text>
            <Text variant="caption" color="secondary">
              {' / '}{formatCurrency(item.toplam, item.currency)}
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
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 6,
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
