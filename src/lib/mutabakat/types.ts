/**
 * Mutabakat — Tipler
 *
 * Bu modül (types/helpers/parseEkstre/engine) SAF TypeScript'tir: React Native,
 * Expo veya uygulama-state importu YOKTUR; node ile cihazsız test edilebilir.
 * Uygulamaya bağlanan tek dosya defter.ts adaptörüdür.
 *
 * Tüm tutarlar KURUŞ cinsinden tamsayıdır (float karşılaştırma tuzağı yok).
 */

export type CariType = 'musteri' | 'tedarikci';

export type CariIslemTipi =
  | 'cari_alis'
  | 'cari_satis'
  | 'cari_odeme'
  | 'cari_tahsilat'
  | 'cari_alis_iade'
  | 'cari_satis_iade';

/** i18n'e çevrilebilir yapılandırılmış uyarı (motor metin üretmez) */
export interface MutabakatUyari {
  code:
    | 'atlanan_satirlar'          // {count}
    | 'karma_satir_netlendi'      // {row} hem borç hem alacak dolu → nete indirildi
    | 'negatif_tutar_cevrildi'    // {row}
    | 'tip_uyumsuz_islemler'      // {count} cari tipine aykırı işlem
    | 'devir_satiri_yok'
    | 'bakiye_isareti_cozulemedi'
    | 'aynasiz_yon'               // ekstre bizim perspektifimizden düzenlenmiş görünüyor
    | 'dusuk_eslesme'             // yön/para birimi uyumsuz olabilir
    | 'ekstre_ici_tutarsiz'       // dip toplam veya zincir kendi içinde tutmuyor
    | 'fark_aciklanamiyor'        // motor öz-doğrulaması tutmadı
    | 'donem_sonrasi_islemler';   // {count} — ekstre döneminden sonra işlem var
  params?: Record<string, string | number>;
}

/** Karşı taraf ekstresinden parse edilmiş veri satırı (ONLARIN perspektifi) */
export interface EkstreSatiri {
  /** Dosyadaki 1-bazlı satır numarası (hata/rapor gösterimi için) */
  rowIndex: number;
  /** YYYY-MM-DD */
  date: string;
  epochDay: number;
  description: string;
  belgeNo: string | null;
  /** Pozitif kuruş; boş hücre null */
  debitKurus: number | null;
  creditKurus: number | null;
  /** Ham bakiye kolonu değeri (kuruş, işaretli). İşaret konvansiyonu belirsiz olabilir. */
  balanceKurus: number | null;
  /** B/A eki ya da ayrı B/A kolonuyla işaret çözüldüyse true (B=+, A=− normalize edilmiş) */
  balanceSignResolved: boolean;
}

export interface ParsedEkstre {
  rows: EkstreSatiri[];
  headerRowIndex: number;
  hasBelgeNo: boolean;
  hasBalance: boolean;
  /** DEVİR/AÇILIŞ satırı — onların perspektifinde ham borç/alacak */
  devir: { debitKurus: number; creditKurus: number } | null;
  /** Son TOPLAM/YEKÛN satırı */
  dipToplam: { debitKurus: number; creditKurus: number } | null;
  uyarilar: MutabakatUyari[];
  /** Tutarı olduğu halde tarihi/sayısı okunamayıp ATLANAN veri satırı sayısı.
   *  > 0 ise verdikt asla 'mutabik' olamaz. */
  skippedDataRows: number;
}

export type MutabakatParseHataKodu = 'HEADER_NOT_FOUND' | 'EMPTY_FILE' | 'READ_ERROR';

export class MutabakatParseError extends Error {
  code: MutabakatParseHataKodu;
  detail?: string;
  constructor(code: MutabakatParseHataKodu, detail?: string) {
    super(code + (detail ? `: ${detail}` : ''));
    this.code = code;
    this.detail = detail;
    this.name = 'MutabakatParseError';
  }
}

/** Bizim defterden normalize kalem (BİZİM perspektif, cari para biriminde) */
export interface DefterKalemi {
  islemId: string;
  /** YYYY-MM-DD (islemler.date TR duvar saati, ilk 10 karakter) */
  date: string;
  epochDay: number;
  description: string;
  type: CariIslemTipi;
  /** Pozitif kuruş, cari para biriminde */
  amountKurus: number;
  /** Kanonik bakiye formülüne göre işaretli etki:
   *  cari_satis/cari_odeme/cari_alis_iade → +, cari_alis/cari_tahsilat/cari_satis_iade → − */
  signedKurus: number;
  /** Cari tipine aykırı tür (tedarikçide cari_satis vb.) — dahil edilir ama rozetlenir */
  tipUyumsuz: boolean;
}

export interface BekleyenCek {
  cekNo: string;
  tutarKurus: number;
  kesimEpochDay: number;
  vadeEpochDay: number;
}

export type EslesmeAsamasi = 'exact' | 'yakin_tarih';

export interface Eslesme {
  ekstre: EkstreSatiri;
  defter: DefterKalemi;
  asama: EslesmeAsamasi;
  /** defter.epochDay − ekstre.epochDay */
  gunFarki: number;
  /** mirror(ekstre) − defter.signedKurus (tolerans içi yuvarlama farkı) */
  kurusFarki: number;
}

export interface TutarFarki {
  ekstre: EkstreSatiri;
  defter: DefterKalemi;
  /** mirror(ekstre) − defter.signedKurus */
  farkKurus: number;
}

export type RozetTur = 'bekleyen_cek' | 'olasi_kdv' | 'olasi_parcali' | 'aciklama_ipucu';

export interface Rozet {
  tur: RozetTur;
  /** bekleyen_cek: çek no · olasi_kdv: oran ("1.20") · aciklama_ipucu: yakalanan kalıp */
  detay?: string;
}

export interface BizdeEksikSatir {
  satir: EkstreSatiri;
  rozetler: Rozet[];
}

export interface OnlardaEksikKalem {
  kalem: DefterKalemi;
  rozetler: Rozet[];
}

export type MutabakatDurum = 'mutabik' | 'bakiye_teyitsiz' | 'mutabik_degil';

export interface MutabakatSonucu {
  durum: MutabakatDurum;
  /** 'ayna' = ekstre karşı tarafın defteri (normal); 'aynasiz' = ekstre bizim perspektifimizden düzenlenmiş */
  yon: 'ayna' | 'aynasiz';
  donem: { start: string; end: string };
  devir: {
    bizimKurus: number;
    onlarinAynaKurus: number | null;
    farkKurus: number | null;
    uyumlu: boolean | null;
  };
  kapanis: {
    bizimKurus: number;
    onlarinAynaKurus: number | null;
    farkKurus: number | null;
  };
  eslesmeler: Eslesme[];
  asamaKirilimi: { exact: number; yakinTarih: number };
  /** Tolerans içinde eşleşenlerin net kuruş farkı (yuvarlama farkları toplamı) */
  yuvarlamaFarkiKurus: number;
  bizdeEksik: BizdeEksikSatir[];
  onlardaEksik: OnlardaEksikKalem[];
  tutarFarkli: TutarFarki[];
  /** Ekstre döneminden SONRA kalan (eşleşmemiş) işlem sayısı — "güncel bakiye farklı" bilgisi için */
  donemSonrasiKalemSayisi: number;
  checksum: {
    dipToplamUyumlu: boolean | null;
    bakiyeZinciriUyumlu: boolean | null;
    farkAciklanabilir: boolean | null;
  };
  uyarilar: MutabakatUyari[];
}

export interface ReconcileOptions {
  /** Eşleşme tarihi toleransı (gün). Varsayılan 3. */
  dateToleranceDays?: number;
  /** Tutar toleransı (kuruş). Varsayılan 100 (1 TL). */
  amountToleranceKurus?: number;
}

export interface ReconcileInput {
  ekstre: ParsedEkstre;
  /** Carinin TÜM işlemleri (dönem filtresi motor içinde yapılır) */
  kalemler: DefterKalemi[];
  /** cariler.balance (kuruş) — açılış devri bundan türetilir */
  cariBalanceKurus: number;
  /** durum='beklemede' filtreli (yalnız tedarikçi carilerde dolu gelir) */
  bekleyenCekler: BekleyenCek[];
  options?: ReconcileOptions;
}
