import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, InteractionManager, Share, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { AlertTriangle, Scale } from 'lucide-react-native';
import { EmptyState, Text } from '@/components/ui';
import { ReportStep, SelectStep } from '@/components/mutabakat';
import { QuickTransactionBar } from '@/components/transaction/QuickTransactionBar';
import type { TransactionType } from '@/components/transaction/QuickTransactionBar/types';
import { colors } from '@/constants/colors';
import { spacing } from '@/constants/spacing';
import { formatCurrency, toNumber } from '@/lib/currency';
import { parseDateFromDB } from '@/lib/date';
import {
  buildDefterKalemleri,
  dosyaDogrula,
  generateAsistanOzeti,
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
import { useAuthContext } from '@/contexts/AuthContext';
import { useAllIslemlerByCari } from '@/hooks/useIslemler';
import { useDateFormat } from '@/hooks/useDateFormat';
import { useToast } from '@/contexts/ToastContext';
import { logEvent } from '@/lib/appEvents';

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
  const router = useRouter();
  const { t } = useTranslation(['mutabakat', 'clients', 'common']);
  const { formatDateShort } = useDateFormat();
  const { showToast } = useToast();

  const [step, setStep] = useState<Step>('select');
  const [picking, setPicking] = useState(false);
  const [parsed, setParsed] = useState<ParsedEkstre | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  // Rapor SNAPSHOT'tır: kuyruktan işlem eklenince yeniden hesaplanmaz
  const [sonuc, setSonuc] = useState<MutabakatSonucu | null>(null);
  // Tek-kalem avı için kalem snapshot'ı (raporla aynı anda dondurulur)
  const [kalemSnapshot, setKalemSnapshot] = useState<ReturnType<typeof buildDefterKalemleri> | null>(null);
  // KIRMIZI dosya doğrulamasında "yine de devam" seçildi mi
  const [kirmiziDevam, setKirmiziDevam] = useState(false);

  const { data: cari } = useCari(cariId!);
  const { data: linkStatus } = useCariLinkStatus(cariId);
  const { isletme } = useAuthContext();
  // Rapor alındıktan sonra sorgu kapatılır: kuyruk mutasyonlarının invalidation'ı
  // binlerce satırlık tam geçmişi her kayıtta yeniden indirmesin.
  const islemlerQuery = useAllIslemlerByCari(cariId!, step !== 'report');

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
      setFileName(file.name);
      const fileContent = await FileSystem.readAsStringAsync(file.uri, { encoding: 'base64' });
      const binaryString = atob(fileContent);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const ekstre = parseEkstreFile(bytes.buffer);
      setParsed(ekstre);
      setSonuc(null);
      setKirmiziDevam(false);
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
        bekleyenCekler: [],
      });
      setKalemSnapshot(kalemler);
      setSonuc(result);
      setStep('report');
      // Tripwire telemetri: "devir düzeltme kaydı gerekir mi?" kararı veriyle verilecek —
      // sınır sonucu + doğrulama profili tek event (bkz. spec v1.2 kesim notu)
      logEvent('mutabakat_tamamlandi', {
        durum: result.durum,
        sinir_tipi: result.sinirTipi,
        sinir_sonuc:
          result.devir.uyumlu === null ? 'yapilamadi' : result.devir.uyumlu ? 'uyumlu' : 'farkli',
        devir_kaynak: result.devir.kaynak,
        eslesen: result.eslesmeler.length,
        bizde_eksik: result.bizdeEksik.length,
        onlarda_eksik: result.onlardaEksik.length,
        bolge_a: result.bolgeA.length,
        islem_sayisi: kalemler.length,
      });
    });
    return () => task.cancel();
  }, [step, parsed, cari, islemlerQuery.data, islemlerQuery.isLoading, islemlerQuery.isError, t]);

  // ---- Özet paylaşımı ----
  // Senaryo-özel, esnafın karşı tarafa doğrudan gönderebileceği açıklayıcı metin:
  // ham "Devir/Kapanış — Bizde/Ekstrede" satırları yerine "ne yapılmalı" dili +
  // tarih-çapalı bakiye + uygulama tanıtımı.
  const handleShare = useCallback(() => {
    if (!sonuc || !cari) return;
    const fmt = (kurus: number) =>
      `${kurus < 0 ? '-' : ''}${formatCurrency(Math.abs(kurus) / 100, cari.currency)}`;
    // Bakiyeler esnaf diliyle: eksi işaret yerine Borç/Alacak etiketi
    const bak = (kurus: number) =>
      `${t(kurus < 0 ? 'mutabakat:summary.borc' : 'mutabakat:summary.alacak')} ${formatCurrency(Math.abs(kurus) / 100, cari.currency)}`;
    const startD = formatDateShort(sonuc.donem.start);
    const endD = formatDateShort(sonuc.donem.end);

    const lines: string[] = [
      t('mutabakat:share.header', { cari: cari.name, start: startD, end: endD }),
      '',
      t(`mutabakat:share.sonuc.${sonuc.durum}`),
    ];

    // Devir/başlangıç farkı → tarih-çapalı bakiye karşılaştırması + eski ekstre isteği
    if (sonuc.devir.uyumlu === false && sonuc.devir.onlarinAynaKurus !== null) {
      lines.push(
        '',
        t('mutabakat:share.devirBaslik', { date: startD }),
        t('mutabakat:share.devirBiz', { ours: bak(sonuc.devir.bizimKurus) }),
        t('mutabakat:share.devirSiz', { theirs: bak(sonuc.devir.onlarinAynaKurus) }),
        sonuc.sinirTipi === 'baslangic'
          ? t('mutabakat:share.baslangicIste', { amount: fmt(sonuc.devir.farkKurus ?? 0) })
          : t('mutabakat:share.devirIste', { date: startD, amount: fmt(sonuc.devir.farkKurus ?? 0) }),
      );
    }

    // Bizde işlenmemiş (onların ekstresinde var, bizde yok) → biz kontrol edeceğiz
    if (sonuc.bizdeEksik.length > 0) {
      lines.push(
        '',
        t('mutabakat:share.bizdeEksikBaslik', { count: sonuc.bizdeEksik.length }),
        ...sonuc.bizdeEksik.map((i) =>
          t('mutabakat:share.itemLine', {
            date: formatDateShort(i.satir.date),
            desc: i.satir.description || i.satir.belgeNo || '—',
            amount: fmt(mirrorOf(i.satir, sonuc.yon)),
          }),
        ),
      );
    }

    // Bizde olup onların ekstresinde görünmeyen → lütfen kontrol edin
    if (sonuc.onlardaEksik.length > 0) {
      lines.push(
        '',
        t('mutabakat:share.onlardaEksikBaslik', { count: sonuc.onlardaEksik.length }),
        ...sonuc.onlardaEksik.map((i) =>
          t('mutabakat:share.itemLine', {
            date: formatDateShort(i.kalem.date),
            desc: i.kalem.description || '—',
            amount: fmt(i.kalem.signedKurus),
          }),
        ),
      );
    }

    // İki tarafta farklı tutar → belge belge
    if (sonuc.tutarFarkli.length > 0) {
      lines.push(
        '',
        t('mutabakat:share.tutarBaslik', { count: sonuc.tutarFarkli.length }),
        ...sonuc.tutarFarkli.map((i) =>
          t('mutabakat:share.tutarItem', {
            desc: i.ekstre.description || i.ekstre.belgeNo || '—',
            theirs: fmt(mirrorOf(i.ekstre, sonuc.yon)),
            ours: fmt(i.defter.signedKurus),
          }),
        ),
      );
    }

    // Fark bu ekstrede bulunamadıysa (görünmeyen eski dönem) — insights.ts ile aynı koşul
    const fark = sonuc.kapanis.farkKurus;
    const df = sonuc.devir.farkKurus;
    const devirBaskin =
      sonuc.eslesmeler.length > 0 && fark !== null && df !== null && Math.abs(fark) > 100 &&
      Math.abs(df) / Math.abs(fark) >= 0.9 && Math.abs(df) <= Math.abs(fark) * 1.1;
    const donemIciFarkYok =
      sonuc.bizdeEksik.length === 0 && sonuc.onlardaEksik.length === 0 && sonuc.tutarFarkli.length === 0;
    if (
      donemIciFarkYok && sonuc.eslesmeler.length > 0 && fark !== null && Math.abs(fark) > 100 &&
      !devirBaskin && sonuc.checksum.farkAciklanabilir !== true
    ) {
      lines.push('', t('mutabakat:share.gorunmeyenDonem', { amount: fmt(fark) }));
    }

    // Kapanış referansı (ekstrenin bittiği tarihteki bizdeki bakiye) + uygulama tanıtımı
    lines.push(
      '',
      t('mutabakat:share.bakiyeReferans', { date: endD, ours: bak(sonuc.kapanis.bizimKurus) }),
      '',
      t('mutabakat:share.footer'),
    );

    Share.share({ message: lines.join('\n') });
  }, [sonuc, cari, t, formatDateShort]);

  // ---- Kuyruk akışı ----
  // Yeni kuyruk kurulmadan önce bekleyen ilerleme timer'ı iptal edilmeli:
  // eski timer tetiklenirse queueIndex yeni kuyruğun dışına taşar,
  // currentQueueItem null olur ve bar görünürken unmount edilir
  // ("öksüz native modal" donması, bkz. 3802bac ve aşağıdaki DİKKAT notu).
  const clearAdvanceTimer = useCallback(() => {
    if (advanceTimer.current) {
      clearTimeout(advanceTimer.current);
      advanceTimer.current = null;
    }
  }, []);

  const startQueue = useCallback(() => {
    if (!sonuc || !cari) return;
    const remaining = sonuc.bizdeEksik.filter(
      (i) => !addedRows.has(i.satir.rowIndex) && !skippedRows.has(i.satir.rowIndex),
    );
    if (remaining.length === 0) return;
    // Toplu ekleme ONAY diyaloğu: kalem sayısı + toplam tutar (spec 5.3)
    const toplamKurus = remaining.reduce((s, i) => s + Math.abs(mirrorOf(i.satir, sonuc.yon)), 0);
    Alert.alert(
      t('mutabakat:topluOnay.baslik'),
      t('mutabakat:topluOnay.govde', {
        count: remaining.length,
        amount: formatCurrency(toplamKurus / 100, cari.currency),
      }),
      [
        { text: t('common:buttons.cancel'), style: 'cancel' },
        {
          text: t('mutabakat:topluOnay.ekle'),
          onPress: () => {
            clearAdvanceTimer();
            setQueue(remaining);
            setQueueIndex(0);
            setQueueBarVisible(true);
          },
        },
      ],
    );
  }, [sonuc, cari, addedRows, skippedRows, clearAdvanceTimer, t]);

  // Satıra dokunarak TEK kalem ekleme: tek elemanlı kuyruk olarak aynı akıştan geçer
  const handleAddRow = useCallback(
    (item: BizdeEksikSatir) => {
      if (addedRows.has(item.satir.rowIndex)) return;
      const ac = () => {
        clearAdvanceTimer();
        setQueue([item]);
        setQueueIndex(0);
        setQueueBarVisible(true);
      };
      // Kırmızı-devam durumunda kalem başına ek onay (spec 5.3)
      if (kirmiziDevam) {
        Alert.alert(t('mutabakat:dogrulama.kirmiziBant'), t('mutabakat:topluOnay.tekilKirmizi'), [
          { text: t('common:buttons.cancel'), style: 'cancel' },
          { text: t('mutabakat:topluOnay.ekle'), onPress: ac },
        ]);
      } else {
        ac();
      }
    },
    [addedRows, clearAdvanceTimer, kirmiziDevam, t],
  );

  const ozet = useMemo(
    () => (sonuc && cari ? generateAsistanOzeti(sonuc, cari.type, { kalemler: kalemSnapshot ?? undefined }) : null),
    [sonuc, cari, kalemSnapshot],
  );

  // Dosya doğrulama: oran (motordan) + isim (antet+dosya adı) + dönem örtüşmesi
  const dogrulama = useMemo(() => {
    if (!sonuc || !cari) return null;
    const kayitAraligi =
      kalemSnapshot && kalemSnapshot.length > 0
        ? {
            start: kalemSnapshot.reduce((min, k) => (k.date < min ? k.date : min), kalemSnapshot[0].date),
            end: kalemSnapshot.reduce((max, k) => (k.date > max ? k.date : max), kalemSnapshot[0].date),
          }
        : null;
    return dosyaDogrula({
      sonuc,
      antetMetni: `${parsed?.onBaslikMetni ?? ''} ${fileName ?? ''}`,
      adlar: [cari.name, isletme?.name ?? ''],
      kayitAraligi,
    });
  }, [sonuc, cari, kalemSnapshot, parsed?.onBaslikMetni, fileName, isletme?.name]);


  // Mini rapor "Bakiyeyi Düzelt": başlangıç bakiyesi editörü cari detayında —
  // geri dön + yol tarifi (işlemsiz caride kart zaten düzenlenebilir)
  const handleFixBalance = useCallback(() => {
    showToast(t('mutabakat:mini.duzeltYonlendirme'), 'info', 4000);
    router.back();
  }, [router, showToast, t]);

  // "Önceki dönem ekstresini iste" — hazır WhatsApp mesajı paylaş
  const handleRequestPrevStatement = useCallback(() => {
    if (!sonuc) return;
    Share.share({
      message: t('mutabakat:actions.oncekiDonemMesaj', { start: formatDateShort(sonuc.donem.start) }),
    });
  }, [sonuc, t, formatDateShort]);

  // DİKKAT: render varlığı visible'a BAĞLANMAZ — visible=false olduğu render'da
  // unmount etmek "öksüz native modal" donmasına yol açar (bkz. 3802bac).
  // Bar mount'ta kalır, yalnız visible kontrol edilir; kalem geçişi key-remount ile
  // visible=false'tan 350 ms sonra (dismiss animasyonu bittikten sonra) yapılır.
  const currentQueueItem = queueIndex < queue.length ? queue[queueIndex] : null;

  const advanceQueue = useCallback(() => {
    const item = queue[queueIndex];
    if (item) {
      setAddedRows((prev) => new Set(prev).add(item.satir.rowIndex));
      // Daha önce "atlandı" işaretlenip sonradan eklendiyse çift sayım olmasın
      setSkippedRows((prev) => {
        if (!prev.has(item.satir.rowIndex)) return prev;
        const next = new Set(prev);
        next.delete(item.satir.rowIndex);
        return next;
      });
    }
    setQueueBarVisible(false);
    if (queueIndex + 1 < queue.length) {
      // 300 ms'lik resetForm gecikmesini (useQuickTransactionForm) güvenle geçmek için
      advanceTimer.current = setTimeout(() => {
        setQueueIndex((i) => i + 1);
        setQueueBarVisible(true);
      }, 350);
    } else {
      // Tek-kalem (satıra dokunma) modunda kümülatif sayı yanıltıcı olur
      const total = queue.length === 1 ? 1 : addedRows.size + 1;
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

  // Şüpheli dosya (blok + kart) için duruma özel olası nedenler
  const supheliNedenler: string[] = dogrulama
    ? [
        ...(dogrulama.tamDisinda && dogrulama.kayitBaslangic
          ? [t('mutabakat:supheli.nedenEski', { date: formatDateShort(dogrulama.kayitBaslangic) })]
          : []),
        t('mutabakat:supheli.nedenBaskaCari'),
        t('mutabakat:supheli.nedenBaslangic'),
        ...(dogrulama.oran !== null
          ? [t('mutabakat:supheli.nedenOran', { eslesen: dogrulama.eslesen, toplam: dogrulama.toplamEkstreSatir })]
          : []),
      ]
    : [];

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
      {/* KIRMIZI dosya doğrulaması: rapor yerine tam ekran blok — yanlış ekstre +
          tek tuşla 90 fatura basmak asıl felaket senaryosudur (spec 5.3) */}
      {step === 'report' && sonuc && dogrulama?.seviye === 'kirmizi' && !kirmiziDevam && (
        <View style={styles.blokContainer}>
          <AlertTriangle size={44} color={colors.warning} />
          <Text variant="h2" bold center>
            {t('mutabakat:supheli.baslik', { cari: cari.name })}
          </Text>
          <Text variant="body" color="secondary" center>
            {dogrulama.oran !== null
              ? t('mutabakat:dogrulama.kirmiziGovde', {
                  toplam: dogrulama.bolgeB,
                  eslesen: dogrulama.eslesen,
                  oran: Math.round(dogrulama.oran * 100),
                })
              : t('mutabakat:supheli.govde', { count: dogrulama.toplamEkstreSatir })}
          </Text>
          <View style={styles.blokNedenler}>
            {supheliNedenler.map((n, i) => (
              <View key={i} style={styles.blokNedenRow}>
                <Text variant="body" color="warningDark">
                  •
                </Text>
                <Text variant="body" color="secondary" style={styles.blokNedenText}>
                  {n}
                </Text>
              </View>
            ))}
          </View>
          {/* Ara ekransız: doğrudan dosya seçici açılır */}
          <TouchableOpacity style={styles.blokBirincil} onPress={handlePickFile} accessibilityRole="button">
            <Text variant="body" bold style={{ color: colors.white }}>
              {t('mutabakat:dogrulama.dogruDosya')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setKirmiziDevam(true)} accessibilityRole="button">
            <Text variant="body" color="secondary">
              {t('mutabakat:supheli.yineDeGoster')}
            </Text>
          </TouchableOpacity>
        </View>
      )}
      {step === 'report' && sonuc && ozet && dogrulama && !(dogrulama.seviye === 'kirmizi' && !kirmiziDevam) && (
        <ReportStep
          sonuc={sonuc}
          ozet={ozet}
          dogrulama={dogrulama}
          kirmiziDevam={kirmiziDevam}
          cariType={cari.type}
          cariName={cari.name}
          currency={cari.currency}
          guncelBakiyeKurus={toKurus(balance)}
          fileName={fileName ?? undefined}
          ekstreSatirSayisi={parsed?.rows.length ?? 0}
          hicIslemYok={(kalemSnapshot?.length ?? 0) === 0}
          onFixBalance={handleFixBalance}
          formatDate={formatDateShort}
          onShare={handleShare}
          onRequestPrevStatement={handleRequestPrevStatement}
          onAddRow={handleAddRow}
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
          // rowIndex key'de ŞART: iki farklı tek-kalem ekleme arasında queueIndex hep 0
          // kalır; remount olmazsa önceki kalemin kategori/ürün state'i sızar
          key={`queue-${queueIndex}-${currentQueueItem.satir.rowIndex}`}
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
  blokContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
    padding: spacing['2xl'],
    backgroundColor: colors.background,
  },
  blokBirincil: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing['2xl'],
    marginTop: spacing.md,
  },
  blokNedenler: {
    alignSelf: 'stretch',
    gap: spacing.sm,
  },
  blokNedenRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  blokNedenText: {
    flex: 1,
  },
});
