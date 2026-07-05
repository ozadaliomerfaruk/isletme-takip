import { useCallback, useMemo, useState } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronRight, ListPlus, Lock, Sparkles } from 'lucide-react-native';
import { Text } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { formatCurrency } from '@/lib/currency';
import type {
  AsistanOzeti,
  BizdeEksikSatir,
  CariType,
  DogrulamaSonucu,
  EkstreSatiri,
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
  | { kind: 'dogrulama' }
  | { kind: 'bant'; seviye: 'sari' | 'kirmizi' }
  | { kind: 'insights' }
  | { kind: 'actions' }
  | { kind: 'openingDiff' }
  | { kind: 'summary' }
  | { kind: 'warnings' }
  | { kind: 'queueButton' }
  | { kind: 'header'; group: 'a' | 'b' | 'c' | 'matched' | 'kilitli'; count: number; totalKurus: number }
  | { kind: 'rowA'; item: BizdeEksikSatir }
  | { kind: 'rowB'; item: OnlardaEksikKalem }
  | { kind: 'rowC'; item: TutarFarki }
  | { kind: 'kilitliNot' }
  | { kind: 'rowKilitli'; item: EkstreSatiri }
  | { kind: 'rowMatched'; item: Eslesme };

export interface ReportStepProps {
  sonuc: MutabakatSonucu;
  ozet: AsistanOzeti;
  /** Dosya doğrulama sinyalleri (oran/isim/dönem) */
  dogrulama: DogrulamaSonucu;
  /** KIRMIZI doğrulamada kullanıcı "yine de devam" dediyse true — kalıcı bant + toplu ekleme kapalı */
  kirmiziDevam: boolean;
  cariType: CariType;
  /** Kişiselleştirilmiş manşet cümleleri için ("{{cari}}, borcunuzu ... gösteriyor") */
  cariName: string;
  currency?: string;
  guncelBakiyeKurus: number;
  /** Denetim izi: kaynak dosya adı + ekstre satır sayısı */
  fileName?: string;
  ekstreSatirSayisi: number;
  /** Hiç işlem yok (yeni kullanıcı): koca rapor iskeleti yerine tek kartlık mini görünüm */
  hicIslemYok: boolean;
  /** Mini görünümde "Bakiyeyi Düzelt" — cari detayındaki başlangıç bakiyesi editörüne yönlendirir */
  onFixBalance: () => void;
  formatDate: (dateStr: string) => string;
  onShare: () => void;
  /** "Önceki dönem ekstresini iste" hazır mesajını paylaşır */
  onRequestPrevStatement: () => void;
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
  sonuc, ozet, dogrulama, kirmiziDevam, cariType, cariName, currency, guncelBakiyeKurus, fileName, ekstreSatirSayisi,
  hicIslemYok, onFixBalance,
  formatDate, onShare, onRequestPrevStatement,
  onAddRow, addedRows, skippedRows, queueTotal, onStartQueue,
}: ReportStepProps) {
  const { t } = useTranslation('mutabakat');
  const [matchedOpen, setMatchedOpen] = useState(false);
  const [kilitliOpen, setKilitliOpen] = useState(false);
  // Toplu ekleme kırmızı-devam durumunda KAPALI (spec 5.3 — asıl felaket senaryosu
  // yanlış ekstre + tek tuşla 90 fatura basmak)
  const topluKapali = kirmiziDevam;

  const fmt = useCallback(
    (kurus: number) => formatCurrency(Math.abs(kurus) / 100, currency),
    [currency],
  );

  // Esnaf dili: eksi işaret yerine Borç/Alacak etiketi (kendi Excel exportuyla aynı dil)
  const fmtBakiye = useCallback(
    (kurus: number) =>
      `${t(kurus < 0 ? 'summary.borc' : 'summary.alacak')} ${formatCurrency(Math.abs(kurus) / 100, currency)}`,
    [t, currency],
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

  // "Şimdi ne yapmalı" aksiyonları — bulgu/aksiyon ayrımı (SMMM geri bildirimi)
  const actionList = useMemo(() => {
    const acts: { key: 'baslangicDuzelt' | 'oncekiDonem' | 'eksikEkle' | 'yuvarlama' | 'paylas'; params?: Record<string, string | number>; onPress?: () => void; btnKey?: string }[] = [];
    if (sonuc.devir.uyumlu === false) {
      // Sınır tipi başlangıçsa sorun geçmiş ekstre değil, bizim açılış bakiyemizdir
      if (sonuc.sinirTipi === 'baslangic') {
        acts.push({ key: 'baslangicDuzelt' });
      } else {
        acts.push({ key: 'oncekiDonem', onPress: onRequestPrevStatement, btnKey: 'oncekiDonemBtn' });
      }
    }
    if (sonuc.bizdeEksik.length > 0 && !topluKapali) {
      acts.push({ key: 'eksikEkle', params: { count: sonuc.bizdeEksik.length }, onPress: onStartQueue, btnKey: 'eksikEkleBtn' });
    }
    const kurusInsight = ozet.insights.find((i) => i.code === 'kurus_farki');
    if (kurusInsight?.amountKurus) {
      acts.push({ key: 'yuvarlama', params: { amount: fmt(kurusInsight.amountKurus) } });
    }
    if (sonuc.durum !== 'mutabik') {
      acts.push({ key: 'paylas', onPress: onShare, btnKey: 'paylasBtn' });
    }
    return acts;
  }, [sonuc, ozet.insights, fmt, onRequestPrevStatement, onStartQueue, onShare, topluKapali]);

  const items = useMemo<ReportItem[]>(() => {
    const list: ReportItem[] = [{ kind: 'verdict' }];
    if (kirmiziDevam) list.push({ kind: 'bant', seviye: 'kirmizi' });
    else if (dogrulama.seviye === 'sari') list.push({ kind: 'bant', seviye: 'sari' });
    list.push({ kind: 'dogrulama' });
    if (ozet.insights.length > 0 || kopruGorunur) list.push({ kind: 'insights' });
    if (actionList.length > 0) list.push({ kind: 'actions' });
    if (sonuc.devir.uyumlu === false) list.push({ kind: 'openingDiff' });
    list.push({ kind: 'summary' });
    if (sonuc.uyarilar.length > 0) list.push({ kind: 'warnings' });

    if (sonuc.bizdeEksik.length > 0) {
      if (!topluKapali) list.push({ kind: 'queueButton' });
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
    // Bölge A: başlangıç öncesi kilitli kalemler (varsayılan kapalı grup —
    // gerçek dosyalar 300+ satır olabiliyor, listeyi boğmasın)
    if (sonuc.bolgeA.length > 0) {
      list.push({ kind: 'header', group: 'kilitli', count: sonuc.bolgeA.length, totalKurus: 0 });
      if (kilitliOpen) {
        list.push({ kind: 'kilitliNot' });
        for (const item of sonuc.bolgeA) list.push({ kind: 'rowKilitli', item });
      }
    }
    if (sonuc.eslesmeler.length > 0) {
      list.push({ kind: 'header', group: 'matched', count: sonuc.eslesmeler.length, totalKurus: 0 });
      if (matchedOpen) {
        for (const item of sonuc.eslesmeler) list.push({ kind: 'rowMatched', item });
      }
    }
    return list;
  }, [sonuc, ozet, dogrulama.seviye, kirmiziDevam, topluKapali, kopruGorunur, actionList.length, matchedOpen, kilitliOpen]);

  const insightText = useCallback(
    (ins: Insight) =>
      t(`insights.${ins.code}`, {
        amount: ins.amountKurus !== undefined ? fmt(ins.amountKurus) : undefined,
        count: ins.count,
        date: ins.date ? formatDate(ins.date) : undefined,
        cari: cariName,
        detay: ins.detay ? ` ("${ins.detay}")` : '',
      }),
    [t, fmt, formatDate, cariName],
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

  const eslesmeyenSayisi =
    sonuc.bizdeEksik.length + sonuc.onlardaEksik.length + sonuc.tutarFarkli.length;

  // Doğrulama kartı: 3 satır, her biri ✓ / ✗ / nedenli — (spec 5.4)
  const renderDogrulama = () => {
    const oranYuzde = dogrulama.oran !== null ? Math.round(dogrulama.oran * 100) : null;
    const satirlar: { text: string; status: boolean | null }[] = [
      dogrulama.isim.bulunan
        ? { text: t('dogrulama.isimOk', { bulunan: dogrulama.isim.bulunan }), status: true }
        : dogrulama.isim.antetVar
          ? { text: t('dogrulama.isimYok'), status: null }
          : { text: t('dogrulama.antetYok'), status: null },
      dogrulama.donemOrtusuyor === null
        ? { text: t('dogrulama.donemPasif'), status: null }
        : dogrulama.donemOrtusuyor
          ? { text: t('dogrulama.donemOk'), status: true }
          : { text: t('dogrulama.donemYok'), status: false },
      oranYuzde === null
        ? { text: t('dogrulama.oranPasif'), status: null }
        : {
            text: t('dogrulama.oranOk', { oran: oranYuzde, eslesen: dogrulama.eslesen, toplam: dogrulama.bolgeB }),
            status: dogrulama.seviye === 'yesil' ? true : dogrulama.seviye === 'sari' ? null : false,
          },
    ];
    return (
      <View style={styles.dogrulamaCard}>
        <Text variant="label" color="secondary">
          {t('dogrulama.kartBaslik')}
        </Text>
        {satirlar.map((s, i) => (
          <View key={i} style={styles.dogrulamaRow}>
            <Text variant="bodySmall" bold color={s.status === null ? 'muted' : s.status ? 'success' : 'error'}>
              {s.status === null ? '—' : s.status ? '✓' : '✗'}
            </Text>
            <Text variant="bodySmall" color="secondary" style={styles.dogrulamaText}>
              {s.text}
            </Text>
          </View>
        ))}
      </View>
    );
  };

  const renderSummary = () => (
    <View style={styles.summaryCard}>
      <SummaryRow label={t('summary.period')} value={`${formatDate(sonuc.donem.start)} – ${formatDate(sonuc.donem.end)}`} />
      <SummaryRow
        label={t(sonuc.sinirTipi === 'baslangic' ? 'sinir.baslangic' : 'sinir.devir')}
        value={
          `${t('summary.ours')}: ${fmtBakiye(sonuc.devir.bizimKurus)}` +
          (sonuc.devir.onlarinAynaKurus !== null
            ? ` · ${t('summary.theirs')}: ${fmtBakiye(sonuc.devir.onlarinAynaKurus)}`
            : ` · ${t('summary.theirs')}: ${t('summary.notCompared')}`) +
          (sonuc.devir.kaynak === 'zincir' ? ` (${t('sinir.zincirNot')})` : '')
        }
        status={sonuc.devir.uyumlu}
      />
      <SummaryRow
        label={t('summary.closing')}
        value={
          `${t('summary.ours')}: ${fmtBakiye(sonuc.kapanis.bizimKurus)}` +
          (sonuc.kapanis.onlarinAynaKurus !== null
            ? ` · ${t('summary.theirs')}: ${fmtBakiye(sonuc.kapanis.onlarinAynaKurus)}`
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
      {/* En güven veren rakam açıkça yazılır: eşleşmeyen 0 ise ✓ */}
      <SummaryRow
        label={t('summary.unmatched', { count: eslesmeyenSayisi })}
        value=""
        status={eslesmeyenSayisi === 0 ? true : undefined}
      />
      {sonuc.yuvarlamaFarkiKurus !== 0 && (
        <SummaryRow label={t('summary.roundingDiff', { amount: fmt(sonuc.yuvarlamaFarkiKurus) })} value="" />
      )}
      {/* '—' yerine NEDEN yapılamadığını söyle (belirsizlik güven kırar) */}
      <SummaryRow
        label={t('summary.checksumTotals')}
        value={sonuc.checksum.dipToplamUyumlu === null ? t('summary.checksumTotalsYok') : ''}
        status={sonuc.checksum.dipToplamUyumlu}
      />
      <SummaryRow
        label={t('summary.checksumChain')}
        value={sonuc.checksum.bakiyeZinciriUyumlu === null ? t('summary.checksumChainYok') : ''}
        status={sonuc.checksum.bakiyeZinciriUyumlu}
      />
      <SummaryRow label={t('summary.checksumSelf')} value="" status={sonuc.checksum.farkAciklanabilir} />
      {sonuc.donemSonrasiKalemSayisi > 0 && (
        <Text variant="bodySmall" color="secondary" style={styles.postPeriodNote}>
          {t('summary.postPeriodInfo', {
            count: sonuc.donemSonrasiKalemSayisi,
            amount: fmtBakiye(guncelBakiyeKurus),
          })}
        </Text>
      )}
      {/* Denetim izi: bir ay sonra açan muhasebeci "hangi dosyayla" sorusunun cevabını bulsun */}
      <Text variant="caption" color="muted" style={styles.postPeriodNote}>
        {t('summary.kaynak', {
          file: fileName ?? '—',
          rows: ekstreSatirSayisi,
          date: formatDate(bugunKey()),
        })}
      </Text>
    </View>
  );

  const renderActions = () => (
    <View style={styles.actionsCard}>
      <Text variant="h3">{t('actions.title')}</Text>
      {actionList.map((act, i) => (
        <View key={act.key} style={styles.actionRow}>
          <View style={styles.actionNumber}>
            <Text variant="label" style={{ color: colors.primary }}>
              {i + 1}
            </Text>
          </View>
          <View style={styles.actionBody}>
            <Text variant="body">{t(`actions.${act.key}`, act.params)}</Text>
            {act.onPress && act.btnKey ? (
              <TouchableOpacity style={styles.actionButton} onPress={act.onPress} accessibilityRole="button">
                <Text variant="label" style={{ color: colors.white }}>
                  {t(`actions.${act.btnKey}`)}
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      ))}
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
      case 'dogrulama':
        return renderDogrulama();
      case 'bant':
        return (
          <View style={[styles.bant, item.seviye === 'kirmizi' ? styles.bantKirmizi : styles.bantSari]}>
            <Text variant="bodySmall" color={item.seviye === 'kirmizi' ? 'error' : 'warning'}>
              {item.seviye === 'kirmizi'
                ? t('dogrulama.kirmiziBant')
                : t('dogrulama.sariBant', { oran: dogrulama.oran !== null ? Math.round(dogrulama.oran * 100) : '—' })}
            </Text>
          </View>
        );
      case 'insights':
        return renderInsights();
      case 'actions':
        return renderActions();
      case 'openingDiff': {
        const baslangic = sonuc.sinirTipi === 'baslangic';
        return (
          <View style={styles.openingDiffCard}>
            <Text variant="body" bold color="error">
              {t(baslangic ? 'openingDiff.baslangicTitle' : 'openingDiff.title', {
                amount: fmt(sonuc.devir.farkKurus ?? 0),
              })}
            </Text>
            <Text variant="bodySmall" color="secondary">
              {t(baslangic ? 'openingDiff.baslangicDesc' : 'openingDiff.desc')}
            </Text>
          </View>
        );
      }
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
        const isCollapsible = item.group === 'matched' || item.group === 'kilitli';
        const open = item.group === 'matched' ? matchedOpen : kilitliOpen;
        const toggle = item.group === 'matched' ? setMatchedOpen : setKilitliOpen;
        return (
          <TouchableOpacity
            style={styles.sectionHeader}
            disabled={!isCollapsible}
            onPress={() => toggle((o) => !o)}
          >
            {isCollapsible ? (
              open ? (
                <ChevronDown size={16} color={colors.textSecondary} />
              ) : (
                <ChevronRight size={16} color={colors.textSecondary} />
              )
            ) : null}
            {item.group === 'kilitli' ? <Lock size={14} color={colors.textMuted} /> : null}
            <Text variant="body" bold color="secondary">
              {item.group === 'kilitli' ? t('kilit.grupBaslik') : t(GROUP_TITLE_KEY[item.group])}
            </Text>
            <Text variant="bodySmall" color="muted">
              {item.group === 'kilitli'
                ? `${item.count} · ${t('kilit.grupNot')}`
                : isCollapsible
                  ? String(item.count)
                  : t('groups.sectionCount', { count: item.count, amount: fmt(item.totalKurus) })}
            </Text>
          </TouchableOpacity>
        );
      }
      case 'kilitliNot':
        return (
          <Text variant="caption" color="muted" style={styles.kilitliNot}>
            {t('kilit.tooltip')}
          </Text>
        );
      case 'rowKilitli':
        // Kilit açıklaması grubun BAŞINDA bir kez durur; satırlar pasiftir
        return (
          <View style={styles.kilitliRow}>
            <Lock size={14} color={colors.textMuted} />
            <View style={styles.rowLeftKilitli}>
              <Text variant="bodySmall" color="muted" numberOfLines={1}>
                {item.item.description || item.item.belgeNo || '—'}
              </Text>
              <Text variant="caption" color="muted">
                {formatDate(item.item.date)}
              </Text>
            </View>
            <Text variant="bodySmall" color="muted">
              {formatCurrency(
                Math.abs((item.item.creditKurus ?? 0) - (item.item.debitKurus ?? 0)) / 100,
                currency,
              )}
            </Text>
          </View>
        );
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

  // YENİ KULLANICI MİNİ RAPORU: hiç işlem yokken boş rapor iskeleti (sıfırlı
  // tablolar, pasif kontroller) göstermek yerine tek kartlık bakiye kontrolü.
  if (hicIslemYok) {
    const uyumlu = sonuc.devir.uyumlu === true && (sonuc.kapanis.farkKurus ?? 1) <= 100 && (sonuc.kapanis.farkKurus ?? -1) >= -100;
    const yapilamadi = sonuc.kapanis.farkKurus === null;
    const fark = sonuc.kapanis.farkKurus ?? 0;
    return (
      <View style={styles.miniContainer}>
        <View
          style={[
            styles.miniCard,
            { backgroundColor: yapilamadi ? colors.warningLight : uyumlu ? colors.successLight : colors.orangeLight },
          ]}
        >
          <Text variant="h3">{t('mini.baslik')}</Text>
          <Text
            variant="body"
            bold
            color={yapilamadi ? 'warning' : uyumlu ? 'success' : 'warning'}
          >
            {yapilamadi
              ? t('mini.yapilamadi')
              : uyumlu
                ? `${t('mini.uyumlu')} ✓`
                : t('mini.uyumsuz', { amount: fmt(fark) })}
          </Text>
          <SummaryRow label={t('summary.ours')} value={fmtBakiye(guncelBakiyeKurus)} />
          {sonuc.kapanis.onlarinAynaKurus !== null && (
            <SummaryRow label={t('summary.theirs')} value={fmtBakiye(sonuc.kapanis.onlarinAynaKurus)} />
          )}
          {!uyumlu && !yapilamadi && (
            <TouchableOpacity style={styles.miniDuzeltBtn} onPress={onFixBalance} accessibilityRole="button">
              <Text variant="body" bold style={{ color: colors.white }}>
                {t('mini.duzelt')}
              </Text>
            </TouchableOpacity>
          )}
        </View>
        <Text variant="bodySmall" color="secondary" center style={styles.miniNot}>
          {t('mini.gecmisKalem', { count: sonuc.bolgeA.length })}
        </Text>
        {dogrulama.isim.bulunan ? (
          <Text variant="caption" color="muted" center>
            ✓ {t('dogrulama.isimOk', { bulunan: dogrulama.isim.bulunan })}
          </Text>
        ) : null}
        <TouchableOpacity style={styles.miniPaylas} onPress={onShare} accessibilityRole="button">
          <Text variant="label" style={{ color: colors.primary }}>
            {t('share.button')}
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <FlashList
      data={items}
      renderItem={renderItem}
      getItemType={(item) => item.kind}
      // Savunmacı: renderItem ileride useCallback'lenirse satır durumları donmasın
      extraData={{ addedRows, skippedRows, matchedOpen, kilitliOpen }}
      contentContainerStyle={styles.listContent}
    />
  );
}

/** Bugünün YYYY-MM-DD anahtarı (denetim izi satırı için) */
function bugunKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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
  dogrulamaCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    gap: spacing.xs,
  },
  dogrulamaRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  dogrulamaText: {
    flex: 1,
  },
  bant: {
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
  },
  bantSari: {
    backgroundColor: colors.warningLight,
  },
  bantKirmizi: {
    backgroundColor: colors.errorLight,
  },
  kilitliNot: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  miniContainer: {
    flex: 1,
    padding: spacing.lg,
    gap: spacing.md,
  },
  miniCard: {
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
  miniDuzeltBtn: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  miniNot: {
    paddingHorizontal: spacing.md,
  },
  miniPaylas: {
    alignSelf: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  kilitliRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceLighter,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginHorizontal: spacing.md,
    marginBottom: spacing.xs,
    opacity: 0.75,
  },
  rowLeftKilitli: {
    flex: 1,
    gap: 2,
  },
  actionsCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    gap: spacing.md,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'flex-start',
  },
  actionNumber: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  actionBody: {
    flex: 1,
    gap: spacing.sm,
  },
  actionButton: {
    alignSelf: 'flex-start',
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
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
