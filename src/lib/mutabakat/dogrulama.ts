/**
 * Dosya doğrulama — "yanlış carinin ekstresi mi?" sinyalleri. SAF TypeScript.
 *
 * Lean tasarım (spec v1.2'den kırpılmış): birincil sinyal eşleşme oranı;
 * isim sinyali YALNIZ seçili cari + işletme adını arar (başka-cariyle-kıyas,
 * stoplist ve parmak izi bilinçli dışarıda — oran zaten yanlış dosyayı yakalar,
 * kalanı yanlış-pozitif riski taşıyan makine olurdu).
 */

import type { MutabakatSonucu } from './types';

/** Kırmızı/sarı ORAN alarmının aktifleşmesi için iki tarafta asgari kalem */
export const MIN_ITEMS_FOR_RATIO = 10;
export const RATIO_GREEN = 0.7;
export const RATIO_RED = 0.3;
/** "Ekstre penceremizin tamamen dışında" şüphesinin tetiklenmesi için asgari satır */
export const MIN_ROWS_FOR_SUSPICION = 6;

export type DogrulamaSeviye = 'yesil' | 'sari' | 'kirmizi';

export interface DogrulamaSonucu {
  seviye: DogrulamaSeviye;
  /** Eşleşme oranı (0..1); alarm için yeterli veri yoksa null (yeni kullanıcı istisnası) */
  oran: number | null;
  eslesen: number;
  /** Karşılaştırılabilir ekstre satırı (Bölge B): eşleşen + bizde eksik + tutar farklı */
  bolgeB: number;
  /** Ekstredeki TÜM satır (Bölge A dahil) — "N hareket" ifadesi için */
  toplamEkstreSatir: number;
  /** Kayıt penceremizden önceki (kilitli) ekstre satırı sayısı */
  bolgeA: number;
  /** Ekstrenin hiçbir satırı karşılaştırılamadı (hepsi Bölge A) — yanlış/çok eski sinyali */
  tamDisinda: boolean;
  /** Antette bulunan ad (cari ya da işletme); bulunamadıysa null. Antet boşsa 'antet_yok'. */
  isim: { bulunan: string | null; antetVar: boolean };
  /** Ekstre dönemi ile kayıtlarımızın kesişimi var mı; kayıt yoksa null */
  donemOrtusuyor: boolean | null;
  /** İlk kayıt tarihimiz (YYYY-MM-DD) — "kayıtlarınız X'te başlıyor" mesajı için */
  kayitBaslangic: string | null;
}

/** Türkçe-katlamalı, noktalama-bağışık kelime kümesi */
function tokenize(text: string): Set<string> {
  const folded = text
    .replace(/İ/g, 'i').replace(/I/g, 'i').replace(/ı/g, 'i')
    .replace(/Ğ/g, 'g').replace(/ğ/g, 'g')
    .replace(/Ü/g, 'u').replace(/ü/g, 'u')
    .replace(/Ş/g, 's').replace(/ş/g, 's')
    .replace(/Ö/g, 'o').replace(/ö/g, 'o')
    .replace(/Ç/g, 'c').replace(/ç/g, 'c')
    .toLowerCase();
  return new Set(folded.split(/[^a-z0-9]+/).filter((t) => t.length >= 4));
}

/**
 * Antette (başlık öncesi metin + dosya adı) verilen adlardan biri geçiyor mu?
 * Tam-kelime ve ≥4 karakter şartı (jenerik kısa adlar yanlış pozitif üretmesin).
 * Adın ≥4 karakterli token'larından EN AZ BİRİ antette tam kelime olarak
 * geçiyorsa "bulundu" sayılır; bulunan orijinal ad döner.
 */
export function isimSinyali(antetMetni: string, adlar: string[]): string | null {
  if (!antetMetni.trim()) return null;
  const antetTokens = tokenize(antetMetni);
  for (const ad of adlar) {
    if (!ad) continue;
    const adTokens = tokenize(ad);
    for (const t of adTokens) {
      if (antetTokens.has(t)) return ad;
    }
  }
  return null;
}

export interface DogrulamaInput {
  sonuc: MutabakatSonucu;
  /** parsed.onBaslikMetni + dosya adı birleşimi */
  antetMetni: string;
  /** Aranacak adlar: [cari adı, işletme adı] */
  adlar: string[];
  /** Kayıtlarımızın tarih aralığı (kalem yoksa null) */
  kayitAraligi: { start: string; end: string } | null;
}

export function dosyaDogrula(input: DogrulamaInput): DogrulamaSonucu {
  const { sonuc, antetMetni, adlar, kayitAraligi } = input;

  const eslesen = sonuc.eslesmeler.length;
  const bolgeB = sonuc.bizdeEksik.length + sonuc.tutarFarkli.length + eslesen;
  const bolgeBBiz = sonuc.onlardaEksik.length + sonuc.tutarFarkli.length + eslesen;
  const bolgeA = sonuc.bolgeA.length;
  const toplamEkstreSatir = bolgeB + bolgeA;
  // Yeni kullanıcı istisnası: iki tarafta da yeterli kalem yoksa oran alarmı PASİF —
  // yeni kullanıcıya salt orandan dolayı asla "yanlış dosya!" denmez.
  const oranAktif = Math.min(bolgeB, bolgeBBiz) >= MIN_ITEMS_FOR_RATIO;
  const oran = bolgeB > 0 ? eslesen / bolgeB : null;

  const bulunan = isimSinyali(antetMetni, adlar);
  const antetVar = antetMetni.trim().length > 0;

  let donemOrtusuyor: boolean | null = null;
  if (kayitAraligi) {
    donemOrtusuyor = !(sonuc.donem.end < kayitAraligi.start || sonuc.donem.start > kayitAraligi.end);
  }

  // Ekstre penceremizin TAMAMEN dışında: hiçbir satır karşılaştırılamadı (hepsi Bölge A).
  // Bu, oran dedektörünün kör noktasıdır (Bölge B boş → oran hesaplanamaz) ve
  // "yanlış cari / çok eski ekstre" senaryosunun asıl imzasıdır (bkz. C02 vakası).
  const tamDisinda = bolgeB === 0 && bolgeA > 0;
  const cokSatir = toplamEkstreSatir >= MIN_ROWS_FOR_SUSPICION;

  // ŞİDDETE GÖRE: kesin şüphe → tam ekran blok (kirmizi); kısmi şüphe → kart (sari).
  let seviye: DogrulamaSeviye = 'yesil';
  if (
    (oranAktif && oran !== null && oran < RATIO_RED) || // örtüşen kalem var ama neredeyse hiçbiri tutmuyor
    (tamDisinda && cokSatir && donemOrtusuyor === false) // ekstre tamamen dışarıda + çok satır + dönem örtüşmüyor
  ) {
    seviye = 'kirmizi';
  } else if (
    (oranAktif && oran !== null && oran < RATIO_GREEN) ||
    (tamDisinda && cokSatir) || // dışarıda ama dönem belirsiz olabilir → yumuşak uyarı
    (!oranAktif && antetVar && bulunan === null && donemOrtusuyor === false)
  ) {
    seviye = 'sari';
  }

  return {
    seviye,
    oran: oranAktif ? oran : null,
    eslesen,
    bolgeB,
    toplamEkstreSatir,
    bolgeA,
    tamDisinda,
    isim: { bulunan, antetVar },
    donemOrtusuyor,
    kayitBaslangic: kayitAraligi?.start ?? null,
  };
}
