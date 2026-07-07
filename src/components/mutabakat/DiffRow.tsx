import { memo } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, PlusCircle } from 'lucide-react-native';
import { Text } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing, borderRadius, fontSize } from '@/constants/spacing';
import { formatCurrency } from '@/lib/currency';
import type {
  BizdeEksikSatir,
  CariType,
  Eslesme,
  OnlardaEksikKalem,
  Rozet,
  TutarFarki,
} from '@/lib/mutabakat';

/** Ayna işaretli tutar (rapor yönüne göre) — pozitif = bizim borç sütunumuz */
export function mirrorOf(satir: BizdeEksikSatir['satir'], yon: 'ayna' | 'aynasiz'): number {
  const debit = satir.debitKurus ?? 0;
  const credit = satir.creditKurus ?? 0;
  return yon === 'ayna' ? credit - debit : debit - credit;
}

const CARI_TIP_LABEL_KEY: Record<string, string> = {
  cari_alis: 'clients:transactionLabels.alis',
  cari_odeme: 'clients:transactionLabels.odeme',
  cari_satis: 'clients:transactionLabels.satis',
  cari_tahsilat: 'clients:transactionLabels.tahsilat',
  cari_alis_iade: 'clients:transactionLabels.alisIade',
  cari_satis_iade: 'clients:transactionLabels.satisIade',
};

function Badges({ rozetler }: { rozetler: Rozet[] }) {
  const { t } = useTranslation('mutabakat');
  if (rozetler.length === 0) return null;
  return (
    <View style={styles.badgeRow}>
      {rozetler.map((r, i) => (
        <View
          key={i}
          style={[
            styles.badge,
            r.tur === 'olasi_mukerrer' && styles.badgeError,
          ]}
        >
          <Text style={styles.badgeText}>
            {r.tur === 'olasi_kdv'
              ? t('badges.olasi_kdv', { rate: r.detay })
              : t(`badges.${r.tur}`)}
          </Text>
        </View>
      ))}
    </View>
  );
}

// ============================================================================
// GRUP (a): bizde işlenmemiş — satıra dokununca deftere ekleme akışı açılır
// ============================================================================

interface MissingInOursRowProps {
  item: BizdeEksikSatir;
  yon: 'ayna' | 'aynasiz';
  cariType: CariType;
  currency?: string;
  formatDate: (dateStr: string) => string;
  /** Kuyruktan/dokunuştan eklendi mi (eklendiyse satır pasifleşir) */
  added: boolean;
  skipped: boolean;
  onPress: () => void;
}

export const MissingInOursRow = memo(function MissingInOursRow({
  item, yon, cariType, currency, formatDate, added, skipped, onPress,
}: MissingInOursRowProps) {
  const { t } = useTranslation('mutabakat');
  const mirror = mirrorOf(item.satir, yon);
  const hintKey =
    cariType === 'musteri'
      ? mirror > 0 ? 'rowHint.musteri.credit' : 'rowHint.musteri.debit'
      : mirror < 0 ? 'rowHint.tedarikci.debit' : 'rowHint.tedarikci.credit';
  const title = item.satir.description || item.satir.belgeNo || '—';

  return (
    <TouchableOpacity
      style={[styles.row, styles.rowTappable, added && styles.rowAdded]}
      onPress={onPress}
      disabled={added}
      activeOpacity={0.6}
      accessibilityRole="button"
      accessibilityState={{ disabled: added }}
    >
      <View style={styles.rowMain}>
        <View style={styles.rowLeft}>
          <Text variant="body" numberOfLines={2}>
            {item.satir.belgeNo && item.satir.description ? `${title} (${item.satir.belgeNo})` : title}
          </Text>
          <Text variant="bodySmall" color="muted">
            {formatDate(item.satir.date)} · {t(hintKey)}
          </Text>
        </View>
        <View style={styles.rowRight}>
          <Text variant="body" bold style={{ color: mirror > 0 ? colors.success : colors.error }}>
            {formatCurrency(Math.abs(mirror) / 100, currency)}
          </Text>
          {added ? (
            <View style={styles.addHint}>
              <CheckCircle2 size={14} color={colors.success} />
              <Text variant="bodySmall" color="success">
                {t('queue.added')}
              </Text>
            </View>
          ) : (
            <View style={styles.addHint}>
              <PlusCircle size={14} color={colors.primary} />
              <Text variant="bodySmall" style={{ color: colors.primary }}>
                {skipped ? t('queue.skipped') : t('rowTap.add')}
              </Text>
            </View>
          )}
        </View>
      </View>
      <Badges rozetler={item.rozetler} />
    </TouchableOpacity>
  );
});

// ============================================================================
// GRUP (b): onlarda görünmeyen (bizim kaydımız)
// ============================================================================

interface MissingInTheirsRowProps {
  item: OnlardaEksikKalem;
  currency?: string;
  formatDate: (dateStr: string) => string;
  /** insights.ts mükerrer tespiti — ekstra rozet olarak eklenir */
  mukerrer?: boolean;
}

export const MissingInTheirsRow = memo(function MissingInTheirsRow({
  item, currency, formatDate, mukerrer,
}: MissingInTheirsRowProps) {
  const { t } = useTranslation(['mutabakat', 'clients']);
  const tipLabel = t(CARI_TIP_LABEL_KEY[item.kalem.type] ?? '');
  const title = item.kalem.description || tipLabel;
  const rozetler: Rozet[] = mukerrer
    ? [...item.rozetler, { tur: 'olasi_mukerrer' as const }]
    : item.rozetler;
  return (
    <View style={styles.row}>
      <View style={styles.rowMain}>
        <View style={styles.rowLeft}>
          <Text variant="body" numberOfLines={2}>
            {item.kalem.description ? `${tipLabel} · ${item.kalem.description}` : title}
          </Text>
          <Text variant="bodySmall" color="muted">
            {formatDate(item.kalem.date)} · {t('mutabakat:rowHint.missingInTheirs')}
          </Text>
        </View>
        <Text variant="body" bold style={{ color: item.kalem.signedKurus > 0 ? colors.success : colors.error }}>
          {formatCurrency(Math.abs(item.kalem.signedKurus) / 100, currency)}
        </Text>
      </View>
      <Badges rozetler={rozetler} />
    </View>
  );
});

// ============================================================================
// GRUP (c): tutar farklı (belge no eşleşti)
// ============================================================================

interface MismatchRowProps {
  item: TutarFarki;
  yon: 'ayna' | 'aynasiz';
  currency?: string;
  formatDate: (dateStr: string) => string;
}

export const MismatchRow = memo(function MismatchRow({ item, yon, currency, formatDate }: MismatchRowProps) {
  const { t } = useTranslation('mutabakat');
  const theirs = mirrorOf(item.ekstre, yon);
  const title = item.ekstre.belgeNo
    ? `${item.ekstre.description || '—'} (${item.ekstre.belgeNo})`
    : item.ekstre.description || '—';
  return (
    <View style={styles.row}>
      <View style={styles.rowMain}>
        <View style={styles.rowLeft}>
          <Text variant="body" numberOfLines={2}>
            {title}
          </Text>
          <Text variant="bodySmall" color="muted">
            {formatDate(item.ekstre.date)}
          </Text>
        </View>
        <View style={styles.rowRight}>
          <Text variant="bodySmall" color="secondary">
            {t('mismatchRow.theirs')}: {formatCurrency(Math.abs(theirs) / 100, currency)}
          </Text>
          <Text variant="bodySmall" color="secondary">
            {t('mismatchRow.ours')}: {formatCurrency(Math.abs(item.defter.signedKurus) / 100, currency)}
          </Text>
          <Text variant="bodySmall" bold color="error">
            {t('mismatchRow.diff')}: {formatCurrency(Math.abs(item.farkKurus) / 100, currency)}
          </Text>
        </View>
      </View>
    </View>
  );
});

// ============================================================================
// Eşleşen kalem (varsayılan kapalı bölüm)
// ============================================================================

interface MatchedRowProps {
  item: Eslesme;
  currency?: string;
  formatDate: (dateStr: string) => string;
}

export const MatchedRow = memo(function MatchedRow({ item, currency, formatDate }: MatchedRowProps) {
  const title = item.defter.description || item.ekstre.description || '—';
  return (
    <View style={[styles.row, styles.rowMuted]}>
      <View style={styles.rowMain}>
        <View style={styles.rowLeft}>
          <Text variant="bodySmall" numberOfLines={1} color="secondary">
            {title}
          </Text>
          <Text variant="caption" color="muted">
            {formatDate(item.defter.date)}
            {item.gunFarki !== 0 ? ` (±${Math.abs(item.gunFarki)}g)` : ''}
          </Text>
        </View>
        <Text variant="bodySmall" color="secondary">
          {formatCurrency(Math.abs(item.defter.signedKurus) / 100, currency)}
        </Text>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    marginHorizontal: spacing.md,
    marginBottom: spacing.xs,
    gap: spacing.xs,
  },
  rowTappable: {
    borderWidth: 1,
    borderColor: colors.primaryLight,
  },
  rowAdded: {
    opacity: 0.55,
  },
  rowMuted: {
    backgroundColor: colors.surfaceLight,
    paddingVertical: spacing.sm,
  },
  rowMain: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  rowLeft: {
    flex: 1,
    gap: 2,
  },
  rowRight: {
    alignItems: 'flex-end',
    gap: 2,
  },
  addHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  badge: {
    backgroundColor: colors.warningLight,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  badgeError: {
    backgroundColor: colors.errorLight,
  },
  badgeText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
});
