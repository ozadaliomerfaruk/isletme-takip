import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, InteractionManager, Share, StyleSheet, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { Scale } from 'lucide-react-native';
import { EmptyState, Text } from '@/components/ui';
import { ReportStep, SelectStep } from '@/components/mutabakat';
import { QuickTransactionBar } from '@/components/transaction/QuickTransactionBar';
import type { TransactionType } from '@/components/transaction/QuickTransactionBar/types';
import { colors } from '@/constants/colors';
import { spacing } from '@/constants/spacing';
import { formatCurrency, toNumber } from '@/lib/currency';
import { parseDateFromDB } from '@/lib/date';
import {
  buildBekleyenCekler,
  buildDefterKalemleri,
  parseEkstreFile,
  reconcile,
  toKurus,
  MutabakatParseError,
  type BizdeEksikSatir,
  type MutabakatSonucu,
  type ParsedEkstre,
} from '@/lib/mutabakat';
import { mirrorOf } from '@/components/mutabakat';
import { useCari } from '@/hooks/useCariler';
import { useCariLinkStatus } from '@/hooks/useCariSharing';
import { useAllIslemlerByCari } from '@/hooks/useIslemler';
import { useCeklerByCari } from '@/hooks/useCekler';
import { useDateFormat } from '@/hooks/useDateFormat';
import { useToast } from '@/contexts/ToastContext';

type Step = 'select' | 'processing' | 'report';

const ACCEPTED_EXTENSIONS = ['.xlsx', '.xls', '.csv'];
// Android SAF sağlayıcıları CSV'yi text/plain hatta octet-stream raporlayabilir
// (WhatsApp'tan kaydedilen dosyalar tipik octet-stream) — seçim sonrası uzantı doğrulanır.
const ACCEPTED_MIME_TYPES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/csv',
  'text/comma-separated-values',
  'text/plain',
  'application/csv',
  'application/octet-stream',
];

export default function MutabakatPage() {
  const { cariId } = useLocalSearchParams<{ cariId: string }>();
  const { t } = useTranslation(['mutabakat', 'clients', 'common']);
  const { formatDateShort } = useDateFormat();
  const { showToast } = useToast();

  const [step, setStep] = useState<Step>('select');
  const [picking, setPicking] = useState(false);
  const [parsed, setParsed] = useState<ParsedEkstre | null>(null);
  // Rapor SNAPSHOT'tır: kuyruktan işlem eklenince yeniden hesaplanmaz
  const [sonuc, setSonuc] = useState<MutabakatSonucu | null>(null);

  const { data: cari } = useCari(cariId!);
  const { data: linkStatus } = useCariLinkStatus(cariId);
  // Rapor alındıktan sonra sorgu kapatılır: kuyruk mutasyonlarının invalidation'ı
  // binlerce satırlık tam geçmişi her kayıtta yeniden indirmesin.
  const islemlerQuery = useAllIslemlerByCari(cariId!, step !== 'report');
  const { data: cekler } = useCeklerByCari(cariId!);

  // ---- Kuyruk (Faz 2) ----
  const [queue, setQueue] = useState<BizdeEksikSatir[]>([]);
  const [queueIndex, setQueueIndex] = useState(0);
  const [queueBarVisible, setQueueBarVisible] = useState(false);
  const [addedRows, setAddedRows] = useState<Set<number>>(new Set());
  const [skippedRows, setSkippedRows] = useState<Set<number>>(new Set());
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
  }, []);

  const isLinked = !!linkStatus?.is_linked;

  // ---- Dosya seçimi ----
  const handlePickFile = useCallback(async () => {
    try {
      setPicking(true);
      const docResult = await DocumentPicker.getDocumentAsync({
        type: ACCEPTED_MIME_TYPES,
        copyToCacheDirectory: true,
      });
      if (docResult.canceled) return;
      const file = docResult.assets[0];
      const lowerName = file.name.toLowerCase();
      if (!ACCEPTED_EXTENSIONS.some((ext) => lowerName.endsWith(ext))) {
        Alert.alert(t('mutabakat:errors.title'), t('mutabakat:select.invalidExtension'));
        return;
      }
      const fileContent = await FileSystem.readAsStringAsync(file.uri, { encoding: 'base64' });
      const binaryString = atob(fileContent);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const ekstre = parseEkstreFile(bytes.buffer);
      setParsed(ekstre);
      setSonuc(null);
      setStep('processing');
    } catch (error) {
      const code = error instanceof MutabakatParseError ? error.code : 'READ_ERROR';
      if (__DEV__) console.error('Mutabakat parse error:', error);
      Alert.alert(t('mutabakat:errors.title'), t(`mutabakat:errors.${code}`), [
        { text: t('mutabakat:errors.cancel'), style: 'cancel' },
        { text: t('mutabakat:errors.retry'), onPress: () => handlePickFile() },
      ]);
    } finally {
      setPicking(false);
    }
  }, [t]);

  // ---- Karşılaştırma (veri hazır olunca) ----
  useEffect(() => {
    if (step !== 'processing' || !parsed || !cari || islemlerQuery.isLoading) return;
    if (islemlerQuery.isError) {
      Alert.alert(t('common:status.error'), t('mutabakat:errors.READ_ERROR'));
      setStep('select');
      return;
    }
    const task = InteractionManager.runAfterInteractions(() => {
      const kalemler = buildDefterKalemleri(islemlerQuery.data ?? [], cari.type);
      const result = reconcile({
        ekstre: parsed,
        kalemler,
        cariBalanceKurus: toKurus(toNumber(cari.balance)),
        bekleyenCekler: cari.type === 'tedarikci' ? buildBekleyenCekler(cekler ?? []) : [],
      });
      setSonuc(result);
      setStep('report');
    });
    return () => task.cancel();
  }, [step, parsed, cari, cekler, islemlerQuery.data, islemlerQuery.isLoading, islemlerQuery.isError, t]);

  // ---- Özet paylaşımı ----
  const handleShare = useCallback(() => {
    if (!sonuc || !cari) return;
    const fmt = (kurus: number) =>
      `${kurus < 0 ? '-' : ''}${formatCurrency(Math.abs(kurus) / 100, cari.currency)}`;
    const lines: string[] = [
      t('mutabakat:share.header', {
        cari: cari.name,
        start: formatDateShort(sonuc.donem.start),
        end: formatDateShort(sonuc.donem.end),
      }),
      t('mutabakat:share.verdictLine', { verdict: t(`mutabakat:verdict.${sonuc.durum}`) }),
      t('mutabakat:share.openingLine', {
        ours: fmt(sonuc.devir.bizimKurus),
        theirs: sonuc.devir.onlarinAynaKurus !== null ? fmt(sonuc.devir.onlarinAynaKurus) : '—',
      }),
      t('mutabakat:share.closingLine', {
        ours: fmt(sonuc.kapanis.bizimKurus),
        theirs: sonuc.kapanis.onlarinAynaKurus !== null ? fmt(sonuc.kapanis.onlarinAynaKurus) : '—',
      }),
    ];
    if (sonuc.bizdeEksik.length > 0) {
      lines.push(
        '',
        t('mutabakat:share.missingInOursLine', {
          count: sonuc.bizdeEksik.length,
          amount: fmt(sonuc.bizdeEksik.reduce((s, i) => s + mirrorOf(i.satir, sonuc.yon), 0)),
        }),
        ...sonuc.bizdeEksik.map((i) =>
          t('mutabakat:share.itemLine', {
            date: formatDateShort(i.satir.date),
            desc: i.satir.description || i.satir.belgeNo || '—',
            amount: fmt(mirrorOf(i.satir, sonuc.yon)),
          }),
        ),
      );
    }
    if (sonuc.onlardaEksik.length > 0) {
      lines.push(
        '',
        t('mutabakat:share.missingInTheirsLine', {
          count: sonuc.onlardaEksik.length,
          amount: fmt(sonuc.onlardaEksik.reduce((s, i) => s + i.kalem.signedKurus, 0)),
        }),
        ...sonuc.onlardaEksik.map((i) =>
          t('mutabakat:share.itemLine', {
            date: formatDateShort(i.kalem.date),
            desc: i.kalem.description || '—',
            amount: fmt(i.kalem.signedKurus),
          }),
        ),
      );
    }
    if (sonuc.tutarFarkli.length > 0) {
      lines.push(
        '',
        t('mutabakat:share.mismatchLine', {
          count: sonuc.tutarFarkli.length,
          amount: fmt(sonuc.tutarFarkli.reduce((s, i) => s + i.farkKurus, 0)),
        }),
      );
    }
    Share.share({ message: lines.join('\n') });
  }, [sonuc, cari, t, formatDateShort]);

  // ---- Kuyruk akışı ----
  const startQueue = useCallback(() => {
    if (!sonuc) return;
    const remaining = sonuc.bizdeEksik.filter(
      (i) => !addedRows.has(i.satir.rowIndex) && !skippedRows.has(i.satir.rowIndex),
    );
    if (remaining.length === 0) return;
    setQueue(remaining);
    setQueueIndex(0);
    setQueueBarVisible(true);
  }, [sonuc, addedRows, skippedRows]);

  // DİKKAT: render varlığı visible'a BAĞLANMAZ — visible=false olduğu render'da
  // unmount etmek "öksüz native modal" donmasına yol açar (bkz. 3802bac).
  // Bar mount'ta kalır, yalnız visible kontrol edilir; kalem geçişi key-remount ile
  // visible=false'tan 350 ms sonra (dismiss animasyonu bittikten sonra) yapılır.
  const currentQueueItem = queueIndex < queue.length ? queue[queueIndex] : null;

  const advanceQueue = useCallback(() => {
    const item = queue[queueIndex];
    if (item) setAddedRows((prev) => new Set(prev).add(item.satir.rowIndex));
    setQueueBarVisible(false);
    if (queueIndex + 1 < queue.length) {
      // 300 ms'lik resetForm gecikmesini (useQuickTransactionForm) güvenle geçmek için
      advanceTimer.current = setTimeout(() => {
        setQueueIndex((i) => i + 1);
        setQueueBarVisible(true);
      }, 350);
    } else {
      const total = addedRows.size + 1;
      showToast(t('mutabakat:queue.doneToast', { count: total }), 'success');
    }
  }, [queue, queueIndex, addedRows.size, showToast, t]);

  const pauseQueue = useCallback(() => {
    // Kapatma = bu kalemi atla ve duraklat; buton kalanlarla devam ettirir
    const item = queue[queueIndex];
    if (item) setSkippedRows((prev) => new Set(prev).add(item.satir.rowIndex));
    setQueueBarVisible(false);
  }, [queue, queueIndex]);

  const suggestedType = useCallback(
    (item: BizdeEksikSatir): TransactionType => {
      if (!sonuc || !cari) return 'satis';
      const mirror = mirrorOf(item.satir, sonuc.yon);
      if (cari.type === 'musteri') return mirror > 0 ? 'satis' : 'tahsilat';
      return mirror < 0 ? 'alis' : 'odeme';
    },
    [sonuc, cari],
  );

  // ---- Render ----
  if (isLinked) {
    return (
      <View style={styles.center}>
        <EmptyState icon={<Scale size={40} color={colors.textMuted} />} title={t('mutabakat:select.notLinked')} />
      </View>
    );
  }
  if (!cari) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const balance = toNumber(cari.balance);
  const balanceLabel = balance < 0 ? t('clients:balance.weOwe') : t('clients:balance.theyOwe');

  return (
    <View style={styles.container}>
      {step === 'select' && (
        <SelectStep
          cariName={cari.name}
          balance={balance}
          balanceLabel={balanceLabel}
          currency={cari.currency}
          onPickFile={handlePickFile}
          picking={picking}
        />
      )}
      {step === 'processing' && (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text variant="bodySmall" color="secondary" style={styles.processingText}>
            {t('mutabakat:processing')}
          </Text>
        </View>
      )}
      {step === 'report' && sonuc && (
        <ReportStep
          sonuc={sonuc}
          cariType={cari.type}
          currency={cari.currency}
          guncelBakiyeKurus={toKurus(balance)}
          formatDate={formatDateShort}
          onShare={handleShare}
          addedRows={addedRows}
          skippedRows={skippedRows}
          queueTotal={sonuc.bizdeEksik.length}
          onStartQueue={startQueue}
        />
      )}

      {/* Eksikleri Ekle kuyruğu: cari detayındaki create/edit/copy üçlüsüyle aynı desen,
          prefill prop'lu 4. instance. key=remount → her kalem temiz formla açılır. */}
      {currentQueueItem && (
        <QuickTransactionBar
          key={`queue-${queueIndex}`}
          visible={queueBarVisible}
          onDismiss={pauseQueue}
          onSuccess={advanceQueue}
          defaultCariId={cari.id}
          defaultCariType={cari.type}
          defaultType={suggestedType(currentQueueItem)}
          defaultAmount={Math.abs(mirrorOf(currentQueueItem.satir, sonuc?.yon ?? 'ayna')) / 100}
          defaultDate={parseDateFromDB(currentQueueItem.satir.date)}
          defaultDescription={
            currentQueueItem.satir.description ||
            (currentQueueItem.satir.belgeNo ? `Belge: ${currentQueueItem.satir.belgeNo}` : '')
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    backgroundColor: colors.background,
  },
  processingText: {
    marginTop: spacing.sm,
  },
});
