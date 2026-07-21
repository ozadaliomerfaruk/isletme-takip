import { useMemo, useState } from 'react';
import { View, StyleSheet, FlatList, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, CalendarClock } from 'lucide-react-native';
import { Text, Button, EmptyState } from '@/components/ui';
import { QuickTransactionBar } from '@/components/transaction/QuickTransactionBar';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { formatCurrency } from '@/lib/currency';
import { formatDateShort } from '@/lib/date';
import { useTaksitPlanDetay, type TaksitSatirDetay } from '@/hooks/useTaksit';
import { useRetahsisOdeme } from '@/hooks/useIslemTahsis';

/**
 * Taksit detayı (Faz 3): taksit satırları + tahsis-bazlı ödendi/kalan durumu.
 * "Tahsil Et/Öde" → en eski açık taksitin kalanı ön-dolu QTB (FIFO sunucuda —
 * ödeme zaten en eski vadeye gider, hedef seçtirmeye gerek yok).
 * Tüm meta (para birimi, cari, tip) detay sorgusunun KENDİSİNDEN gelir —
 * deep-link/soğuk açılışta liste sorgusu beklenmez.
 */
export default function TaksitDetayPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation(['transactions', 'common']);
  const { data: detay, isLoading, refetch, isRefetching } = useTaksitPlanDetay(id);
  const retahsis = useRetahsisOdeme();

  const [tahsilVisible, setTahsilVisible] = useState(false);

  const bugunStr = useMemo(() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
  }, []);

  const ilkAcik = useMemo(
    () => detay?.taksitler.find((tk) => tk.kalan > 0) ?? null,
    [detay],
  );

  const odenenAdet = useMemo(
    () => (detay?.taksitler ?? []).filter((tk) => tk.kalan <= 0).length,
    [detay],
  );

  const currency = detay?.currency ?? 'TRY';

  const renderItem = ({ item }: { item: TaksitSatirDetay }) => {
    const odendi = item.kalan <= 0;
    const gecikmis = !odendi && item.vade_tarihi <= bugunStr;
    return (
      <View style={styles.row}>
        <View style={styles.rowLeft}>
          <Text variant="body" style={styles.siraText} numberOfLines={1}>
            {t('transactions:taksit.siraLabel', { sira: item.sira })}
          </Text>
          <Text variant="caption" color="secondary" numberOfLines={1}>
            {t('transactions:vade.label')}: {formatDateShort(item.vade_tarihi)}
          </Text>
        </View>
        <View style={styles.rowRight}>
          <Text variant="body" style={styles.tutarText} numberOfLines={1}>
            {formatCurrency(item.tutar, currency)}
          </Text>
          {odendi ? (
            <View style={styles.durumRow}>
              <CheckCircle2 size={14} color={colors.success} />
              <Text variant="caption" color="success">{t('transactions:taksit.tamamlandi')}</Text>
            </View>
          ) : (
            <Text variant="caption" style={gecikmis ? styles.gecikmis : styles.kalanText} numberOfLines={1}>
              {t('transactions:vade.kalan')}: {formatCurrency(item.kalan, currency)}
            </Text>
          )}
        </View>
      </View>
    );
  };

  return (
    <>
      <Stack.Screen options={{ headerTitle: detay?.cariName ?? t('transactions:taksit.detayTitle') }} />
      <SafeAreaView style={styles.container} edges={['bottom']}>
        {/* Özet başlık */}
        {detay && (
          <View style={styles.summary}>
            <CalendarClock size={18} color={colors.textMuted} />
            <Text variant="body" style={styles.summaryText}>
              {formatCurrency(detay.odenen, currency)} / {formatCurrency(detay.toplam, currency)}
              {'  ·  '}
              {t('transactions:taksit.odenenOran', { odenen: odenenAdet, toplam: detay.taksitler.length })}
            </Text>
          </View>
        )}

        <FlatList
          data={detay?.taksitler ?? []}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
          ListEmptyComponent={
            isLoading ? (
              <ActivityIndicator size="large" color={colors.primary} style={styles.loader} />
            ) : (
              <EmptyState
                icon={<CalendarClock size={44} color={colors.textMuted} />}
                title={t('transactions:taksit.bos')}
              />
            )
          }
        />

        {/* Tahsil Et / Öde — açık taksit varsa */}
        {detay?.type && ilkAcik && (
          <View style={styles.footer}>
            <Button onPress={() => setTahsilVisible(true)} fullWidth>
              {`${detay.type === 'cari_satis' ? t('transactions:vade.tahsilEt') : t('transactions:vade.ode')} · ${formatCurrency(ilkAcik.kalan, currency)}`}
            </Button>
          </View>
        )}

        {detay?.type && detay.cariId && (
          <QuickTransactionBar
            visible={tahsilVisible}
            onDismiss={() => setTahsilVisible(false)}
            defaultCariId={detay.cariId}
            defaultCariType={detay.type === 'cari_satis' ? 'musteri' : 'tedarikci'}
            defaultType={detay.type === 'cari_satis' ? 'tahsilat' : 'odeme'}
            defaultAmount={ilkAcik?.kalan}
            onSuccess={(islemId) => {
              setTahsilVisible(false);
              // Bağlam-hedefli tahsis: bu ekrandan yapılan tahsilat BU planın en eski
              // açık taksitine gitsin. Genel FIFO carinin BAŞKA borcunun daha eski
              // vadesine kaydırabiliyor (kullanıcı bulgusu) — retahsis hedefe çevirir.
              if (islemId && detay?.islemId) {
                retahsis.mutate({ odemeIslemId: islemId, hedefBorcId: detay.islemId });
              }
            }}
          />
        )}
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    margin: spacing.lg,
    marginBottom: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
  },
  summaryText: {
    fontWeight: '600',
    flex: 1,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing['3xl'],
    flexGrow: 1,
  },
  loader: {
    marginTop: spacing['3xl'],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
  },
  rowLeft: {
    flex: 1,
    marginRight: spacing.sm,
  },
  siraText: {
    fontWeight: '600',
    marginBottom: 2,
  },
  rowRight: {
    alignItems: 'flex-end',
    flexShrink: 1,
    maxWidth: '60%',
  },
  tutarText: {
    fontWeight: '700',
    marginBottom: 2,
  },
  durumRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  kalanText: {
    color: colors.warning,
    fontWeight: '600',
  },
  gecikmis: {
    color: colors.error,
    fontWeight: '700',
  },
  separator: {
    height: spacing.sm,
  },
  footer: {
    padding: spacing.lg,
    paddingTop: spacing.sm,
  },
});
