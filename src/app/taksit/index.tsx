import { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { View, StyleSheet, FlatList, TouchableOpacity, RefreshControl, Animated, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { CalendarClock, ChevronRight, Plus, TrendingUp, TrendingDown } from 'lucide-react-native';
import { Text, EmptyState } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { formatCurrency, roundCurrency } from '@/lib/currency';
import { formatDateShort } from '@/lib/date';
import { useTaksitPlanListesi, type TaksitPlanOzet } from '@/hooks/useTaksit';
import { QuickTransactionBar } from '@/components/transaction/QuickTransactionBar';
import { CariPickerSheet, type CariPickerMode } from '@/components/transaction/QuickTransactionBar/components';
import { useCariler } from '@/hooks/useCariler';
import type { CariType } from '@/types/database';

/**
 * Taksit Takip (Faz 3) — işletmedeki tüm taksit planları.
 * Ödenen/kalan değerleri tahsis defterinden türer (get_taksit_plan_listesi RPC).
 */
// Satırlar yapışık; ayrım 1px gri çizgi (cariler listesi dili)
const TaksitSeparator = () => <View style={styles.separator} />;

export default function TaksitTakipPage() {
  const { t } = useTranslation(['transactions', 'common', 'clients']);
  const router = useRouter();
  const { data: planlar, isLoading, refetch, isRefetching } = useTaksitPlanListesi();
  const [tab, setTab] = useState<'satis' | 'alis'>('satis');

  // FAB → taksitli satış/alış: ANA SAYFA FAB'ıyla BİREBİR desen — inline menü (MODAL DEĞİL)
  // → CariPicker (non-modal bağlamdan açıldığı için modal-üstü-modal DONMASI YOK) → QTB
  // cari-modunda. Eski ActionSheet(modal) → CariPicker(modal) zinciri iOS'ta donuyordu.
  const { data: musteriler } = useCariler('musteri');
  const { data: tedarikciler } = useCariler('tedarikci');
  const [showFabMenu, setShowFabMenu] = useState(false);
  const [showCariPicker, setShowCariPicker] = useState(false);
  const [cariPickerMode, setCariPickerMode] = useState<CariPickerMode>('customer');
  const [qtbCari, setQtbCari] = useState<{ id: string; type: CariType } | null>(null);
  const fabAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(fabAnim, {
      toValue: showFabMenu ? 1 : 0,
      damping: 15,
      stiffness: 200,
      useNativeDriver: true,
    }).start();
  }, [showFabMenu, fabAnim]);

  const handleFabMenuOption = useCallback((action: () => void) => {
    setShowFabMenu(false);
    setTimeout(action, 250); // menü kapanış animasyonu bitince aç
  }, []);

  const handleCariSelect = useCallback((cariId: string) => {
    const cariType: CariType = cariPickerMode === 'customer' ? 'musteri' : 'tedarikci';
    setShowCariPicker(false);
    setTimeout(() => setQtbCari({ id: cariId, type: cariType }), 300);
  }, [cariPickerMode]);

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
          ItemSeparatorComponent={TaksitSeparator}
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

        {/* FAB Menü - Backdrop (MODAL DEĞİL — non-modal overlay; ana FAB deseni) */}
        {showFabMenu && (
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowFabMenu(false)}>
            <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.3)', opacity: fabAnim }]} />
          </Pressable>
        )}

        {/* FAB Menü - Taksitli Satış / Alış (inline, yukarı açılır) */}
        {showFabMenu && (
          <View style={[styles.fabMenuContainer, { bottom: spacing['2xl'] + 56 + spacing.md }]}>
            {[
              {
                label: t('transactions:taksit.fabSatis'),
                icon: <TrendingUp size={18} color={colors.success} />,
                onPress: () => handleFabMenuOption(() => { setCariPickerMode('customer'); setShowCariPicker(true); }),
                index: 1,
              },
              {
                label: t('transactions:taksit.fabAlis'),
                icon: <TrendingDown size={18} color={colors.error} />,
                onPress: () => handleFabMenuOption(() => { setCariPickerMode('supplier'); setShowCariPicker(true); }),
                index: 0,
              },
            ].map((item) => (
              <Animated.View
                key={item.label}
                style={{
                  opacity: fabAnim,
                  transform: [
                    { translateY: fabAnim.interpolate({ inputRange: [0, 1], outputRange: [20 + item.index * 10, 0] }) },
                    { scale: fabAnim.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) },
                  ],
                }}
              >
                <TouchableOpacity style={styles.fabMenuItem} onPress={item.onPress} activeOpacity={0.7}>
                  <View style={styles.fabMenuIcon}>{item.icon}</View>
                  <Text style={styles.fabMenuLabel}>{item.label}</Text>
                </TouchableOpacity>
              </Animated.View>
            ))}
          </View>
        )}

        {/* FAB Button (+ → 45° döner) */}
        <TouchableOpacity
          style={styles.fab}
          activeOpacity={0.85}
          onPress={() => setShowFabMenu((prev) => !prev)}
        >
          <Animated.View style={{ transform: [{ rotate: fabAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '45deg'] }) }] }}>
            <Plus size={26} color={colors.white} />
          </Animated.View>
        </TouchableOpacity>

        {/* Cari Picker (FAB menüsünden — NON-MODAL bağlamdan açılır → donmaz) */}
        <CariPickerSheet
          visible={showCariPicker}
          onDismiss={() => setShowCariPicker(false)}
          onSelect={handleCariSelect}
          cariler={cariPickerMode === 'customer' ? (musteriler || []) : (tedarikciler || [])}
          selectedId={null}
          mode={cariPickerMode}
        />

        {/* Cari seçilince QTB (cari-modu; taksit Vade → Taksit menüsünden kurulur) */}
        <QuickTransactionBar
          visible={!!qtbCari}
          onDismiss={() => setQtbCari(null)}
          defaultCariId={qtbCari?.id}
          defaultCariType={qtbCari?.type}
          defaultType={qtbCari?.type === 'tedarikci' ? 'alis' : 'satis'}
          onSuccess={() => setQtbCari(null)}
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
  // Yapışık düz-liste görünümü (cariler dili): kart boşluğu/köşesi yok, 1px ayraç
  listContent: {
    padding: spacing.lg,
    paddingTop: spacing.sm,
  },
  separator: {
    height: 1,
    backgroundColor: colors.border,
  },
  fab: {
    position: 'absolute',
    right: spacing.lg,
    bottom: spacing['2xl'],
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 6,
    zIndex: 10,
  },
  fabMenuContainer: {
    position: 'absolute',
    right: spacing.lg,
    alignItems: 'flex-end',
    gap: spacing.sm,
    zIndex: 9,
  },
  fabMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.full,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
    gap: spacing.sm,
  },
  fabMenuIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabMenuLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  card: {
    backgroundColor: colors.surface,
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
