import { View, StyleSheet, Platform } from 'react-native';
import { useTranslation } from 'react-i18next';
import { CalendarClock } from 'lucide-react-native';
import { Text } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing, borderRadius, shadows } from '@/constants/spacing';
import { formatCurrency } from '@/lib/currency';
import { upperTr } from '@/lib/turkishTextUtils';
import { useVadeOzet, type VadeOzetSatiri } from '@/hooks/useIslemTahsis';

/**
 * Dashboard 4. kart — Vade Takibi (Faz 2 tahsis defteri özeti).
 * Veriyi kendi çeker (get_vade_ozet, para birimi bazında; çapraz-para toplamı YOK —
 * Net Varlık artefakt dersi). Gecikmiş = bugün dahil; kalan = amount − Σtahsis.
 */
export function DueSummaryCard() {
  const { t } = useTranslation(['transactions', 'common']);
  const { data } = useVadeOzet();

  const rows: VadeOzetSatiri[] = data ?? [];
  // Ana satır: TRY varsa TRY, yoksa ilk para birimi (hero rakam tek para biriminde kalmalı)
  const ana = rows.find((r) => r.currency === 'TRY') ?? rows[0];
  const digerler = rows.filter((r) => r !== ana);

  const num = (v: number | null | undefined) => Number(v) || 0;
  const anaGecAlacak = num(ana?.gecikmis_alacak);
  const anaGecBorc = num(ana?.gecikmis_borc);
  const anaYaklasan = num(ana?.yaklasan_alacak) + num(ana?.yaklasan_borc);
  const bosDurum = rows.length === 0 || (anaGecAlacak <= 0 && anaGecBorc <= 0 && anaYaklasan <= 0 && digerler.length === 0);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>{upperTr(t('transactions:vade.cardTitle'))}</Text>
        <CalendarClock size={18} color={colors.textMuted} />
      </View>

      {bosDurum ? (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyEmoji}>👍</Text>
          <Text style={styles.emptyText}>{t('transactions:vade.temiz')}</Text>
        </View>
      ) : (
        <>
          {/* Hero: vadesi geçmiş alacak (esnafın tahsil etmesi gereken) */}
          <View style={styles.heroValue}>
            <Text
              style={[styles.bigNumber, { color: anaGecAlacak > 0 ? colors.error : colors.success }]}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {formatCurrency(anaGecAlacak, ana?.currency || 'TRY')}
            </Text>
            <Text style={styles.heroLabel}>
              {upperTr(t('transactions:vade.gecikmisAlacak'))}
              {num(ana?.gecikmis_alacak_adet) > 0
                ? ` (${t('transactions:vade.adetKisa', { adet: num(ana?.gecikmis_alacak_adet) })})`
                : ''}
            </Text>
          </View>

          <View style={styles.detailsRow}>
            <View style={styles.detailItem}>
              <Text style={styles.detailLabel}>{upperTr(t('transactions:vade.gecikmisBorc'))}</Text>
              <Text style={[styles.detailValue, { color: anaGecBorc > 0 ? colors.error : colors.text }]} numberOfLines={1} adjustsFontSizeToFit>
                {formatCurrency(anaGecBorc, ana?.currency || 'TRY')}
              </Text>
            </View>
            <View style={styles.divider} />
            <View style={[styles.detailItem, styles.detailItemRight]}>
              <Text style={styles.detailLabel}>{upperTr(t('transactions:vade.yaklasan7'))}</Text>
              <Text style={[styles.detailValue, { color: anaYaklasan > 0 ? colors.warning : colors.text }]} numberOfLines={1} adjustsFontSizeToFit>
                {formatCurrency(anaYaklasan, ana?.currency || 'TRY')}
              </Text>
            </View>
          </View>

          {/* Diğer para birimleri — kompakt tek satır(lar), toplamlara karıştırılmaz */}
          {digerler.map((r) => (
            <Text key={r.currency} style={styles.otherCurrency} numberOfLines={1}>
              {r.currency}: {formatCurrency(num(r.gecikmis_alacak) + num(r.gecikmis_borc), r.currency)}{' '}
              {t('transactions:vade.overdue').toLocaleLowerCase('tr')}
            </Text>
          ))}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius['2xl'],
    padding: spacing.md,
    ...shadows.md,
    ...Platform.select({
      android: { elevation: 3 },
    }),
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textMuted,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  heroValue: {
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  bigNumber: {
    fontSize: 32,
    fontWeight: '700',
    letterSpacing: -1,
    marginBottom: 2,
    textAlign: 'center',
    width: '100%',
  },
  heroLabel: {
    fontSize: 13,
    color: colors.textMuted,
    fontWeight: '500',
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  detailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  detailItem: {
    flex: 1,
    alignItems: 'center',
  },
  detailItemRight: {
    alignItems: 'center',
  },
  detailLabel: {
    fontSize: 12,
    color: colors.textMuted,
    fontWeight: '500',
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  detailValue: {
    fontSize: 17,
    fontWeight: '700',
  },
  divider: {
    width: 1,
    height: 32,
    backgroundColor: colors.border,
    marginHorizontal: 6,
  },
  emptyWrap: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
  },
  emptyEmoji: {
    fontSize: 28,
    marginBottom: 4,
  },
  emptyText: {
    fontSize: 15,
    color: colors.textMuted,
    fontWeight: '500',
  },
  otherCurrency: {
    marginTop: spacing.xs,
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
