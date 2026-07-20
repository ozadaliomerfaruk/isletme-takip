import { useMemo, useState } from 'react';
import { View, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, CalendarClock } from 'lucide-react-native';
import { Text, Button } from '@/components/ui';
import { QuickTransactionBar } from '@/components/transaction/QuickTransactionBar';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { formatCurrency } from '@/lib/currency';
import { formatDateShort } from '@/lib/date';
import { useTaksitPlanDetay, useTaksitPlanListesi, type TaksitSatirDetay } from '@/hooks/useTaksit';

/**
 * Taksit detayı (Faz 3): taksit satırları + tahsis-bazlı ödendi/kalan durumu.
 * "Tahsil Et/Öde" → en eski açık taksitin kalanı ön-dolu QTB (FIFO sunucuda —
 * ödeme zaten en eski vadeye gider, hedef seçtirmeye gerek yok).
 */
export default function TaksitDetayPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation(['transactions', 'common']);
  const { data: detay } = useTaksitPlanDetay(id);
  const { data: planlar } = useTaksitPlanListesi();
  const meta = useMemo(() => (planlar ?? []).find((p) => p.plan_id === id) ?? null, [planlar, id]);

  const [tahsilVisible, setTahsilVisible] = useState(false);

  const bugunStr = useMemo(() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
  }, []);

  const ilkAcik = useMemo(
    () => detay?.taksitler.find((tk) => tk.kalan > 0) ?? null,
    [detay],
  );

  const renderItem = ({ item }: { item: TaksitSatirDetay }) => {
    const odendi = item.kalan <= 0;
    const gecikmis = !odendi && item.vade_tarihi <= bugunStr;
    return (
      <View style={styles.row}>
        <View style={styles.rowLeft}>
          <Text variant="body" style={styles.siraText}>
            {t('transactions:taksit.siraLabel', { sira: item.sira })}
          </Text>
          <Text variant="caption" color="secondary">
            {t('transactions:vade.label')}: {formatDateShort(item.vade_tarihi)}
          </Text>
        </View>
        <View style={styles.rowRight}>
          <Text variant="body" style={styles.tutarText}>
            {formatCurrency(item.tutar, meta?.currency || 'TRY')}
          </Text>
          {odendi ? (
            <View style={styles.durumRow}>
              <CheckCircle2 size={14} color={colors.success} />
              <Text variant="caption" color="success">{t('transactions:taksit.tamamlandi')}</Text>
            </View>
          ) : (
            <Text variant="caption" style={gecikmis ? styles.gecikmis : styles.kalanText}>
              {t('transactions:vade.kalan')}: {formatCurrency(item.kalan, meta?.currency || 'TRY')}
            </Text>
          )}
        </View>
      </View>
    );
  };

  return (
    <>
      <Stack.Screen options={{ headerTitle: meta?.cari_name ?? t('transactions:taksit.detayTitle') }} />
      <SafeAreaView style={styles.container} edges={['bottom']}>
        {/* Özet başlık */}
        {meta && (
          <View style={styles.summary}>
            <CalendarClock size={18} color={colors.textMuted} />
            <Text variant="body" style={styles.summaryText}>
              {formatCurrency(meta.odenen, meta.currency)} / {formatCurrency(meta.toplam, meta.currency)}
              {'  ·  '}
              {t('transactions:taksit.odenenOran', { odenen: meta.odenen_taksit_adedi, toplam: meta.taksit_adedi })}
            </Text>
          </View>
        )}

        <FlatList
          data={detay?.taksitler ?? []}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />

        {/* Tahsil Et / Öde — açık taksit varsa */}
        {meta && ilkAcik && (
          <View style={styles.footer}>
            <Button onPress={() => setTahsilVisible(true)} fullWidth>
              {`${meta.type === 'cari_satis' ? t('transactions:vade.tahsilEt') : t('transactions:vade.ode')} · ${formatCurrency(ilkAcik.kalan, meta.currency)}`}
            </Button>
          </View>
        )}

        {meta && (
          <QuickTransactionBar
            visible={tahsilVisible}
            onDismiss={() => setTahsilVisible(false)}
            defaultCariId={meta.cari_id}
            defaultCariType={meta.type === 'cari_satis' ? 'musteri' : 'tedarikci'}
            defaultType={meta.type === 'cari_satis' ? 'tahsilat' : 'odeme'}
            defaultAmount={ilkAcik?.kalan}
            onSuccess={() => setTahsilVisible(false)}
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
  },
  siraText: {
    fontWeight: '600',
    marginBottom: 2,
  },
  rowRight: {
    alignItems: 'flex-end',
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
