import { useCallback, useMemo, useState } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronRight, ListPlus, Sparkles } from 'lucide-react-native';
import { Text } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { formatCurrency } from '@/lib/currency';
import type {
  AsistanOzeti,
  BizdeEksikSatir,
  CariType,
  Eslesme,
  Insight,
  MutabakatSonucu,
  OnlardaEksikKalem,
  TutarFarki,
} from '@/lib/mutabakat';
import { VerdictCard } from './VerdictCard';
import { MatchedRow, MismatchRow, MissingInOursRow, MissingInTheirsRow, mirrorOf } from './DiffRow';

type ReportItem =
  | { kind: 'verdict' }
  | { kind: 'insights' }
  | { kind: 'openingDiff' }
  | { kind: 'summary' }
  | { kind: 'warnings' }
  | { kind: 'queueButton' }
  | { kind: 'header'; group: 'a' | 'b' | 'c' | 'matched'; count: number; totalKurus: number }
  | { kind: 'rowA'; item: BizdeEksikSatir }
  | { kind: 'rowB'; item: OnlardaEksikKalem }
  | { kind: 'rowC'; item: TutarFarki }
  | { kind: 'rowMatched'; item: Eslesme };

export interface ReportStepProps {
  sonuc: MutabakatSonucu;
  ozet: AsistanOzeti;
  cariType: CariType;
  currency?: string;
  guncelBakiyeKurus: number;
  formatDate: (dateStr: string) => string;
  onShare: () => void;
  /** Satıra dokununca tek kalem ekleme akışı */
  onAddRow: (item: BizdeEksikSatir) => void;
  addedRows: ReadonlySet<number>;
  skippedRows: ReadonlySet<number>;
  queueTotal: number;
  onStartQueue: () => void;
}

const GROUP_TITLE_KEY = {
  a: 'groups.missingInOurs',
  b: 'groups.missingInTheirs',
  c: 'groups.amountMismatch',
  matched: 'groups.matchedItems',
} as const;

const TONE_DOT: Record<Insight['tone'], string> = {
  ok: colors.success,
  info: colors.info,
  warn: colors.warning,
};

export function ReportStep({
  sonuc, ozet, cariType, currency, guncelBakiyeKurus, formatDate, onShare,
  onAddRow, addedRows, skippedRows, queueTotal, onStartQueue,
}: ReportStepProps) {
  const { t } = useTranslation('mutabakat');
  const [matchedOpen, setMatchedOpen] = useState(false);

  const fmt = useCallback(
    (kurus: number) => formatCurrency(Math.abs(kurus) / 100, currency),
    [currency],
  );

  const mukerrerIds = useMemo(() => new Set(ozet.mukerrerIslemIds), [ozet.mukerrerIslemIds]);

  // Tam uyumlu mutabakatta köprünün tüm satırları sıfırdır → boş kart basılmasın
  const kopruGorunur = useMemo(() => {
    const k = ozet.koprusu;
    if (!k) return false;
    return (
      k.bizdeEksikKurus !== 0 || k.onlardaEksikKurus !== 0 || k.tutarFarkKurus !== 0 ||
      k.devirFarkKurus !== 0 || k.yuvarlamaKurus !== 0 || k.devirBilinmiyor
    );
  }, [ozet.koprusu]);

  const items = useMemo<ReportItem[]>(() => {
    const list: ReportItem[] = [{ kind: 'verdict' }];
    if (ozet.insights.length > 0 || kopruGorunur) list.push({ kind: 'insights' });
    if (sonuc.devir.uyumlu === false) list.push({ kind: 'openingDiff' });
    list.push({ kind: 'summary' });
    if (sonuc.uyarilar.length > 0) list.push({ kind: 'warnings' });

    if (sonuc.bizdeEksik.length > 0) {
      list.push({ kind: 'queueButton' });
      list.push({
        kind: 'header',
        group: 'a',
        count: sonuc.bizdeEksik.length,
        totalKurus: sonuc.bizdeEksik.reduce((s, i) => s + mirrorOf(i.satir, sonuc.yon), 0),
      });
      for (const item of sonuc.bizdeEksik) list.push({ kind: 'rowA', item });
    }
    if (sonuc.onlardaEksik.length > 0) {
      list.push({
        kind: 'header',
        group: 'b',
        count: sonuc.onlardaEksik.length,
        totalKurus: sonuc.onlardaEksik.reduce((s, i) => s + i.kalem.signedKurus, 0),
      });
      for (const item of sonuc.onlardaEksik) list.push({ kind: 'rowB', item });
    }
    if (sonuc.tutarFarkli.length > 0) {
      list.push({
        kind: 'header',
        group: 'c',
        count: sonuc.tutarFarkli.length,
        totalKurus: sonuc.tutarFarkli.reduce((s, i) => s + i.farkKurus, 0),
      });
      for (const item of sonuc.tutarFarkli) list.push({ kind: 'rowC', item });
    }
    if (sonuc.eslesmeler.length > 0) {
      list.push({ kind: 'header', group: 'matched', count: sonuc.eslesmeler.length, totalKurus: 0 });
      if (matchedOpen) {
        for (const item of sonuc.eslesmeler) list.push({ kind: 'rowMatched', item });
      }
    }
    return list;
  }, [sonuc, ozet, kopruGorunur, matchedOpen]);

  const insightText = useCallback(
    (ins: Insight) =>
      t(`insights.${ins.code}`, {
        amount: ins.amountKurus !== undefined ? fmt(ins.amountKurus) : undefined,
        count: ins.count,
        date: ins.date ? formatDate(ins.date) : undefined,
      }),
    [t, fmt, formatDate],
  );

  const renderInsights = () => {
    const k = ozet.koprusu;
    const kopruRows = k
      ? ([
          ['bizdeEksik', k.bizdeEksikKurus, 1],
          ['onlardaEksik', k.onlardaEksikKurus, -1],
          ['tutarFark', k.tutarFarkKurus, 1],
          ['devirFark', k.devirFarkKurus, 1],
          ['yuvarlama', k.yuvarlamaKurus, 1],
        ] as const).filter(([, v]) => v !== 0)
      : [];
    return (
      <View style={styles.insightsCard}>
        <View style={styles.insightsHeader}>
          <Sparkles size={18} color={colors.primary} />
          <Text variant="h3">{t('insights.title')}</Text>
        </View>
        {ozet.insights.map((ins, i) => (
          <View key={i} style={styles.insightRow}>
            <View style={[styles.insightDot, { backgroundColor: TONE_DOT[ins.tone] }]} />
            <Text variant="body" style={styles.insightText}>
              {insightText(ins)}
            </Text>
          </View>
        ))}
        {k && kopruGorunur && (
          <View style={styles.kopru}>
            <Text variant="label" color="secondary">
              {t('koprusu.title')}
            </Text>
            {kopruRows.map(([code, value, dir]) => (
              <View key={code} style={styles.kopruRow}>
                <Text variant="body" color="secondary">
                  {t(`koprusu.${code}`)}
                </Text>
                <Text variant="body">
                  {(dir * value >= 0 ? '+' : '−') + fmt(value)}
                </Text>
              </View>
            ))}
            {k.devirBilinmiyor && (
              <Text variant="bodySmall" color="warning">
                {t('koprusu.devirBilinmiyor')}
              </Text>
            )}
            <View style={[styles.kopruRow, styles.kopruTotal]}>
              <Text variant="body" bold>
                {t('koprusu.toplam')}
              </Text>
              <Text variant="body" bold>
                {(k.toplamKurus >= 0 ? '+' : '−') + fmt(k.toplamKurus)}
              </Text>
            </View>
            <Text variant="caption" color="muted">
              {t('koprusu.isaretNotu')}
            </Text>
            <Text variant="bodySmall" color={k.dogrulandi ? 'success' : 'warning'}>
              {t(k.dogrulandi ? 'koprusu.dogrulandi' : 'koprusu.dogrulanamadi')}
            </Text>
          </View>
        )}
      </View>
    );
  };

  const renderSummary = () => (
    <View style={styles.summaryCard}>
      <SummaryRow label={t('summary.period')} value={`${formatDate(sonuc.donem.start)} – ${formatDate(sonuc.donem.end)}`} />
      <SummaryRow
        label={t('summary.opening')}
        value={
          `${t('summary.ours')}: ${fmtSigned(sonuc.devir.bizimKurus, fmt)}` +
          (sonuc.devir.onlarinAynaKurus !== null
            ? ` · ${t('summary.theirs')}: ${fmtSigned(sonuc.devir.onlarinAynaKurus, fmt)}`
            : ` · ${t('summary.theirs')}: ${t('summary.notCompared')}`)
        }
        status={sonuc.devir.uyumlu}
      />
      <SummaryRow
        label={t('summary.closing')}
        value={
          `${t('summary.ours')}: ${fmtSigned(sonuc.kapanis.bizimKurus, fmt)}` +
          (sonuc.kapanis.onlarinAynaKurus !== null
            ? ` · ${t('summary.theirs')}: ${fmtSigned(sonuc.kapanis.onlarinAynaKurus, fmt)}`
            : ` · ${t('summary.theirs')}: ${t('summary.notCompared')}`)
        }
        status={sonuc.kapanis.farkKurus === null ? null : Math.abs(sonuc.kapanis.farkKurus) <= 100}
      />
      <SummaryRow
        label={t('summary.matched', { count: sonuc.eslesmeler.length })}
        value={t('summary.matchedDetail', {
          exact: sonuc.asamaKirilimi.exact,
          close: sonuc.asamaKirilimi.yakinTarih,
        })}
      />
      {sonuc.yuvarlamaFarkiKurus !== 0 && (
        <SummaryRow label={t('summary.roundingDiff', { amount: fmt(sonuc.yuvarlamaFarkiKurus) })} value="" />
      )}
      <SummaryRow label={t('summary.checksumTotals')} value="" status={sonuc.checksum.dipToplamUyumlu} />
      <SummaryRow label={t('summary.checksumChain')} value="" status={sonuc.checksum.bakiyeZinciriUyumlu} />
      <SummaryRow label={t('summary.checksumSelf')} value="" status={sonuc.checksum.farkAciklanabilir} />
      {sonuc.donemSonrasiKalemSayisi > 0 && (
        <Text variant="bodySmall" color="secondary" style={styles.postPeriodNote}>
          {t('summary.postPeriodInfo', {
            count: sonuc.donemSonrasiKalemSayisi,
            amount: fmtSigned(guncelBakiyeKurus, fmt),
          })}
        </Text>
      )}
    </View>
  );

  const renderItem = ({ item }: { item: ReportItem }) => {
    switch (item.kind) {
      case 'verdict':
        return (
          <VerdictCard
            durum={sonuc.durum}
            kapanisFarkKurus={sonuc.kapanis.farkKurus}
            currency={currency}
            onShare={onShare}
          />
        );
      case 'insights':
        return renderInsights();
      case 'openingDiff':
        return (
          <View style={styles.openingDiffCard}>
            <Text variant="body" bold color="error">
              {t('openingDiff.title', { amount: fmt(sonuc.devir.farkKurus ?? 0) })}
            </Text>
            <Text variant="bodySmall" color="secondary">
              {t('openingDiff.desc')}
            </Text>
          </View>
        );
      case 'summary':
        return renderSummary();
      case 'warnings':
        return (
          <View style={styles.warningsCard}>
            <Text variant="label" color="warning">
              {t('warnings.title')}
            </Text>
            {sonuc.uyarilar.map((u, i) => (
              <Text key={i} variant="bodySmall" color="secondary">
                • {t(`warnings.${u.code}`, u.params)}
              </Text>
            ))}
          </View>
        );
      case 'queueButton': {
        const done = addedRows.size + skippedRows.size;
        return (
          <TouchableOpacity style={styles.queueButton} onPress={onStartQueue} accessibilityRole="button">
            <ListPlus size={18} color={colors.white} />
            <Text variant="body" bold style={{ color: colors.white }}>
              {done > 0 && queueTotal > 0
                ? t('queue.progress', { done, total: queueTotal })
                : t('queue.addMissing', { count: sonuc.bizdeEksik.length })}
            </Text>
          </TouchableOpacity>
        );
      }
      case 'header': {
        const isMatched = item.group === 'matched';
        return (
          <TouchableOpacity
            style={styles.sectionHeader}
            disabled={!isMatched}
            onPress={() => setMatchedOpen((o) => !o)}
          >
            {isMatched ? (
              matchedOpen ? (
                <ChevronDown size={16} color={colors.textSecondary} />
              ) : (
                <ChevronRight size={16} color={colors.textSecondary} />
              )
            ) : null}
            <Text variant="body" bold color="secondary">
              {t(GROUP_TITLE_KEY[item.group])}
            </Text>
            <Text variant="bodySmall" color="muted">
              {isMatched
                ? String(item.count)
                : t('groups.sectionCount', { count: item.count, amount: fmt(item.totalKurus) })}
            </Text>
          </TouchableOpacity>
        );
      }
      case 'rowA':
        return (
          <MissingInOursRow
            item={item.item}
            yon={sonuc.yon}
            cariType={cariType}
            currency={currency}
            formatDate={formatDate}
            added={addedRows.has(item.item.satir.rowIndex)}
            skipped={skippedRows.has(item.item.satir.rowIndex)}
            onPress={() => onAddRow(item.item)}
          />
        );
      case 'rowB':
        return (
          <MissingInTheirsRow
            item={item.item}
            currency={currency}
            formatDate={formatDate}
            mukerrer={mukerrerIds.has(item.item.kalem.islemId)}
          />
        );
      case 'rowC':
        return <MismatchRow item={item.item} yon={sonuc.yon} currency={currency} formatDate={formatDate} />;
      case 'rowMatched':
        return <MatchedRow item={item.item} currency={currency} formatDate={formatDate} />;
    }
  };

  return (
    <FlashList
      data={items}
      renderItem={renderItem}
      getItemType={(item) => item.kind}
      // Savunmacı: renderItem ileride useCallback'lenirse satır durumları donmasın
      extraData={{ addedRows, skippedRows, matchedOpen }}
      contentContainerStyle={styles.listContent}
    />
  );
}

function fmtSigned(kurus: number, fmt: (k: number) => string): string {
  return `${kurus < 0 ? '−' : ''}${fmt(kurus)}`;
}

function SummaryRow({ label, value, status }: { label: string; value: string; status?: boolean | null }) {
  return (
    <View style={styles.summaryRow}>
      <View style={styles.summaryLeft}>
        <Text variant="bodySmall" color="secondary">
          {label}
        </Text>
        {value ? <Text variant="body">{value}</Text> : null}
      </View>
      {status !== undefined && (
        <Text
          variant="body"
          bold
          color={status === null ? 'muted' : status ? 'success' : 'error'}
        >
          {status === null ? '—' : status ? '✓' : '✗'}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  listContent: {
    paddingBottom: spacing['3xl'],
  },
  insightsCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    gap: spacing.md,
  },
  insightsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  insightRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  insightDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 7,
  },
  insightText: {
    flex: 1,
  },
  kopru: {
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  kopruRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  kopruTotal: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.xs,
    marginTop: spacing.xs,
  },
  summaryCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
  },
  summaryLeft: {
    flex: 1,
    gap: 2,
  },
  postPeriodNote: {
    marginTop: spacing.xs,
  },
  openingDiffCard: {
    backgroundColor: colors.errorLight,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    gap: spacing.xs,
  },
  warningsCard: {
    backgroundColor: colors.warningLight,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    gap: spacing.xs,
  },
  queueButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.md,
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
});
