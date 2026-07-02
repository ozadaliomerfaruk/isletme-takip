import { memo } from 'react';
import { View, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
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
        <View key={i} style={[styles.badge, r.tur === 'bekleyen_cek' && styles.badgeInfo]}>
          <Text style={styles.badgeText}>
            {r.tur === 'bekleyen_cek'
              ? t('badges.bekleyen_cek', { no: r.detay })
              : r.tur === 'olasi_kdv'
                ? t('badges.olasi_kdv', { rate: r.detay })
                : t(`badges.${r.tur}`)}
          </Text>
        </View>
      ))}
    </View>
  );
}

interface RowShellProps {
  date: string;
  title: string;
  hint?: string;
  amountKurus: number;
  amountColor: string;
  currency?: string;
  rozetler?: Rozet[];
  stateLabel?: string | null;
}

function RowShell({ date, title, hint, amountKurus, amountColor, currency, rozetler, stateLabel }: RowShellProps) {
  return (
    <View style={styles.row}>
      <View style={styles.rowMain}>
        <View style={styles.rowLeft}>
          <Text variant="bodySmall" numberOfLines={2}>
            {title}
          </Text>
          <Text variant="caption" color="muted">
            {date}
            {hint ? ` · ${hint}` : ''}
          </Text>
        </View>
        <View style={styles.rowRight}>
          <Text variant="bodySmall" bold style={{ color: amountColor }}>
            {formatCurrency(Math.abs(amountKurus) / 100, currency)}
          </Text>
          {stateLabel ? (
            <Text variant="caption" color="success">
              {stateLabel}
            </Text>
          ) : null}
        </View>
      </View>
      {rozetler ? <Badges rozetler={rozetler} /> : null}
    </View>
  );
}

// ============================================================================
// GRUP (a): bizde işlenmemiş (onların ekstresinde var)
// ============================================================================

interface MissingInOursRowProps {
  item: BizdeEksikSatir;
  yon: 'ayna' | 'aynasiz';
  cariType: CariType;
  currency?: string;
  formatDate: (dateStr: string) => string;
  /** Kuyruktan eklendi/atlandı durumu */
  stateLabel?: string | null;
}

export const MissingInOursRow = memo(function MissingInOursRow({
  item, yon, cariType, currency, formatDate, stateLabel,
}: MissingInOursRowProps) {
  const { t } = useTranslation('mutabakat');
  const mirror = mirrorOf(item.satir, yon);
  const hintKey =
    cariType === 'musteri'
      ? mirror > 0 ? 'rowHint.musteri.credit' : 'rowHint.musteri.debit'
      : mirror < 0 ? 'rowHint.tedarikci.debit' : 'rowHint.tedarikci.credit';
  const title = item.satir.description || item.satir.belgeNo || '—';
  return (
    <RowShell
      date={formatDate(item.satir.date)}
      title={item.satir.belgeNo && item.satir.description ? `${title} (${item.satir.belgeNo})` : title}
      hint={t(hintKey)}
      amountKurus={mirror}
      amountColor={mirror > 0 ? colors.success : colors.error}
      currency={currency}
      rozetler={item.rozetler}
      stateLabel={stateLabel}
    />
  );
});

// ============================================================================
// GRUP (b): onlarda görünmeyen (bizim kaydımız)
// ============================================================================

interface MissingInTheirsRowProps {
  item: OnlardaEksikKalem;
  currency?: string;
  formatDate: (dateStr: string) => string;
}

export const MissingInTheirsRow = memo(function MissingInTheirsRow({
  item, currency, formatDate,
}: MissingInTheirsRowProps) {
  const { t } = useTranslation(['mutabakat', 'clients']);
  const tipLabel = t(CARI_TIP_LABEL_KEY[item.kalem.type] ?? '');
  const title = item.kalem.description || tipLabel;
  return (
    <RowShell
      date={formatDate(item.kalem.date)}
      title={item.kalem.description ? `${tipLabel} · ${item.kalem.description}` : title}
      hint={t('mutabakat:rowHint.missingInTheirs')}
      amountKurus={item.kalem.signedKurus}
      amountColor={item.kalem.signedKurus > 0 ? colors.success : colors.error}
      currency={currency}
      rozetler={item.rozetler}
    />
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
          <Text variant="bodySmall" numberOfLines={2}>
            {title}
          </Text>
          <Text variant="caption" color="muted">
            {formatDate(item.ekstre.date)}
          </Text>
        </View>
        <View style={styles.rowRight}>
          <Text variant="caption" color="muted">
            {t('mismatchRow.theirs')}: {formatCurrency(Math.abs(theirs) / 100, currency)}
          </Text>
          <Text variant="caption" color="muted">
            {t('mismatchRow.ours')}: {formatCurrency(Math.abs(item.defter.signedKurus) / 100, currency)}
          </Text>
          <Text variant="caption" bold color="error">
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
          <Text variant="caption" numberOfLines={1} color="secondary">
            {title}
          </Text>
          <Text variant="caption" color="muted">
            {formatDate(item.defter.date)}
            {item.gunFarki !== 0 ? ` (±${Math.abs(item.gunFarki)}g)` : ''}
          </Text>
        </View>
        <Text variant="caption" color="secondary">
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
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginHorizontal: spacing.md,
    marginBottom: spacing.xs,
    gap: spacing.xs,
  },
  rowMuted: {
    backgroundColor: colors.surfaceLight,
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
  badgeInfo: {
    backgroundColor: colors.infoLight,
  },
  badgeText: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
  },
});
