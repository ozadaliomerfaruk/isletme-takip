/**
 * Excel Import Utility
 * DefterApp formatındaki Excel dosyalarını parse eder ve import için hazırlar
 */

import * as XLSX from 'xlsx';
import * as Crypto from 'expo-crypto';
import { encode as base64Encode } from 'base64-arraybuffer';
import { formatDateForDB, formatDateTimeForDB } from './date';

// ============================================================================
// TYPES
// ============================================================================

export interface ParsedTransaction {
  date: string; // YYYY-MM-DDTHH:MM:SS format (timestamp column compatible)
  type: string; // DefterApp type (GELİR, GİDER, etc.)
  mappedType: string; // Our app type (gelir, gider, etc.)
  description: string | null;
  category: string | null;
  account: string; // HESAP kolonu
  personel: string | null; // PERSONEL kolonu
  tedarikci: string | null; // TEDARİKÇİ kolonu
  musteri: string | null; // MÜŞTERİ kolonu
  karsiHesap: string | null; // KARŞI HESAP kolonu - parse edilmiş hesap adı
  karsiHesapRaw: string | null; // KARŞI HESAP orijinal değer (örn: "Nakit [-58750 TRY]")
  karsiHesapAmount: number | null; // KARŞI HESAP'taki tutar değeri (transfer için)
  karsiHesapCurrency: string | null; // KARŞI HESAP'taki para birimi
  entityBracketAmount: number | null; // Entity (personel/tedarikci/musteri) bracket tutarı
  entityBracketCurrency: string | null; // Entity bracket para birimi
  amount: number; // Mutlak değer (her zaman pozitif)
  signedAmount: number; // Orijinal işaretli değer (başlangıç bakiyesi için)
  currency: string | null; // BIRIM/CURRENCY kolonundan - ana hesabın para birimi
  isExpense: boolean;
  dateValid: boolean; // Tarih geçerli mi?
  dateError?: string; // Tarih hatası varsa açıklama
  amountValid: boolean; // Tutar geçerli mi?
  amountError?: string; // Tutar hatası varsa açıklama
  entityValid: boolean; // Hesap/cari/personel bilgisi var mı?
  entityError?: string; // Entity hatası varsa açıklama
  rowNumber: number; // Excel satır numarası
}

/**
 * Parse aşamasında sessizce atlanan satır bilgisi
 * Bu satırlar hiçbir listeye eklenmeden atlanır, kullanıcı göremez
 */
export interface SilentlySkippedRow {
  rowNumber: number;
  reason: 'empty' | 'no_date_or_type' | 'no_entity';
  rawData?: string[]; // Satırın ham verisi (debug için)
}

export interface ImportPreview {
  transactions: ParsedTransaction[];
  uniqueAccounts: string[]; // HESAP kolonundaki unique değerler
  uniquePersonel: string[]; // PERSONEL kolonundaki unique değerler
  uniqueTedarikci: string[]; // TEDARİKÇİ kolonundaki unique değerler
  uniqueMusteri: string[]; // MÜŞTERİ kolonundaki unique değerler
  uniqueKarsiHesap: string[]; // KARŞI HESAP kolonundaki unique değerler
  uniqueCategories: string[];
  transactionTypes: Record<string, number>;
  // KARŞI HESAP context: hangi işlem tipleri bu değeri kullanıyor
  karsiHesapContext: Record<string, { types: string[]; suggestedType: 'hesap' | 'cari' | 'personel'; cariType?: 'musteri' | 'tedarikci' }>;
  dateRange: { min: string; max: string };
  totalRows: number;
  validRows: number; // Geçerli tarihli satır sayısı
  invalidDateCount: number; // Geçersiz tarihli satır sayısı
  invalidAmountCount: number; // Geçersiz tutarlı satır sayısı
  // Atlanan satır sayaçları (debug/tracking)
  skippedEmptyRows: number; // Tamamen boş satırlar
  skippedNoDateOrType: number; // Tarih veya tip eksik satırlar
  skippedNoEntity: number; // Hesap/cari/personel olmayan satırlar
  // Sessizce atlanan satırların detayları (kullanıcıya gösterilecek)
  silentlySkipped: SilentlySkippedRow[];
  errors: string[];
}

export interface AccountMapping {
  name: string;
  type: 'hesap' | 'cari' | 'personel';
  hesapType?: 'nakit' | 'banka' | 'kredi_karti' | 'birikim' | 'diger';
  cariType?: 'musteri' | 'tedarikci';
  currency?: string; // Tespit edilen veya kullanıcı tarafından seçilen para birimi
  currencyStats?: Record<string, number>; // Her para biriminin kullanım sayısı (örn: { USD: 45, TRY: 5 })
}

/**
 * Bracket içindeki birim/para birimi kısaltmasını standart Currency koduna çevirir.
 * Belirsiz birimler (g, gr, gram) hesap adından altın/gümüş olarak çözümlenir.
 */
function resolveUnitAlias(unit: string, accountName: string): string {
  const lower = unit.toLowerCase();

  // Doğrudan para birimi kodları (case-insensitive)
  const DIRECT: Record<string, string> = {
    'try': 'TRY', 'tl': 'TRY',
    'usd': 'USD',
    'eur': 'EUR',
    'gbp': 'GBP',
    'xau': 'XAU',
    'xag': 'XAG',
  };
  if (DIRECT[lower]) return DIRECT[lower];

  // Gram birimleri — hesap adından altın/gümüş ayırt et
  const GRAM_UNITS = ['g', 'gr', 'gram'];
  if (GRAM_UNITS.includes(lower)) {
    const nameLower = accountName.toLowerCase();
    if (nameLower.includes('gümüş') || nameLower.includes('gumus') || nameLower.includes('silver')) {
      return 'XAG';
    }
    return 'XAU'; // Varsayılan: altın
  }

  // Ons birimleri
  if (lower === 'oz' || lower === 'ons') {
    const nameLower = accountName.toLowerCase();
    if (nameLower.includes('gümüş') || nameLower.includes('gumus') || nameLower.includes('silver')) {
      return 'XAG';
    }
    return 'XAU';
  }

  // Bilinmeyen — büyük harfe çevirip döndür (belki geçerli bir koddur)
  return unit.toUpperCase();
}

/**
 * KARŞI HESAP kolonundaki değeri parse et
 * Örnek: "Nakit (Kasa) [-58750 TRY]" → { name: "Nakit (Kasa)", amount: 58750, currency: "TRY" }
 * Örnek: "Altın [10 g]" → { name: "Altın", amount: 10, currency: "XAU" }
 * Transfer işlemlerinde hedef hesap ve TRY değeri bu formatta gelir
 */
export interface ParsedKarsiHesap {
  name: string;          // Hesap adı
  amount?: number;       // Tutar (parantez içindeki değer)
  currency?: string;     // Para birimi (TRY, USD, EUR, XAU, XAG vs.)
}

export function parseKarsiHesap(value: string): ParsedKarsiHesap {
  if (!value) return { name: '' };

  const trimmed = value.trim();

  // Köşeli parantez içinde değer var mı kontrol et
  // Format: "Hesap Adı [-123,45 TRY]" veya "Hesap Adı [10 g]" veya "Hesap Adı [123.45]"
  const bracketRegex = /^(.+?)\s*\[([+-]?\d+(?:[.,]\d+)?)\s*([A-Za-z]{1,5})?\]$/;
  const match = trimmed.match(bracketRegex);

  if (match) {
    const name = match[1].trim();
    // Sayı formatı tespiti:
    // - Virgül varsa Türkçe format: 58.750,00 → nokta binlik ayracı, virgül ondalık
    // - Sadece nokta varsa İngilizce format: 1234.56 → nokta ondalık
    const raw = match[2];
    let amountStr: string;
    if (raw.includes(',')) {
      // Türkçe: noktaları sil (binlik ayracı), virgülü noktaya çevir
      amountStr = raw.replace(/\./g, '').replace(',', '.');
    } else {
      // İngilizce veya tam sayı: nokta ondalık ayracı, olduğu gibi bırak
      amountStr = raw;
    }
    const amount = Math.abs(parseFloat(amountStr));
    const rawUnit = match[3] || null;
    const currency = rawUnit ? resolveUnitAlias(rawUnit, name) : 'TRY';

    return { name, amount, currency };
  }

  // Parantez yoksa sadece hesap adı döndür
  return { name: trimmed };
}

export interface ImportConfig {
  accountMappings: Record<string, AccountMapping>;
  skipErrors: boolean;
}

// ============================================================================
// VALIDATION TYPES (UX İyileştirmeleri)
// ============================================================================

/**
 * Hata kategorileri - Kullanıcıya anlaşılır gruplamalar sunmak için
 */
export type ErrorCategory =
  | 'date_invalid'      // Tarih formatı hatası
  | 'amount_invalid'    // Tutar hatası (0, negatif, çok küçük)
  | 'entity_not_found'  // Hesap/Cari/Personel bulunamadı
  | 'type_unknown'      // Bilinmeyen işlem tipi
  | 'duplicate'         // Duplicate işlem
  | 'starting_balance'  // Başlangıç bakiyesi (atlanacak ama hata değil)
  | 'other';            // Diğer hatalar

/**
 * Kategorize edilmiş hata bilgisi
 */
export interface CategorizedError {
  category: ErrorCategory;
  count: number;
  example?: string;      // İlk örnek
  examples?: string[];   // Tüm örnekler (max 3)
  rows?: number[];       // Etkilenen satır numaraları
}

/**
 * Validasyon sonucu - Import öncesi veri kalitesi özeti
 */
export interface ValidationResult {
  score: number;           // 0-100 arası kalite skoru
  validCount: number;      // Geçerli işlem sayısı
  warningCount: number;    // Uyarı sayısı (düzeltilebilir)
  errorCount: number;      // Hata sayısı (atlanacak)
  issues: ValidationIssue[];
  categorizedErrors: CategorizedError[];
}

/**
 * Validasyon sorunu
 */
export interface ValidationIssue {
  type: 'error' | 'warning' | 'info';
  category: ErrorCategory;
  messageKey: string;      // i18n key
  message: string;         // Fallback mesaj
  count: number;
  rows?: number[];
  suggestion?: string;     // Çözüm önerisi
}

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * DefterApp işlem tipi -> Defteri işlem tipi mapping
 */
export const TRANSACTION_TYPE_MAP: Record<string, string> = {
  // Cari işlemleri (TR)
  'ÖDEME': 'cari_odeme',
  'ODEME': 'cari_odeme',
  'TAHSILAT': 'cari_tahsilat',
  'TAHSİLAT': 'cari_tahsilat',

  // Cari işlemleri (EN)
  'PAYMENT': 'cari_odeme',
  'COLLECTION': 'cari_tahsilat',

  // Gelir/Gider (TR)
  'SATIŞ': 'gelir',
  'SATIS': 'gelir',
  'GİDER': 'gider',
  'GIDER': 'gider',
  'GELİR': 'gelir',
  'GELIR': 'gelir',

  // Gelir/Gider (EN)
  'INCOME': 'gelir',
  'EXPENSE': 'gider',

  // Transfer
  'TRANSFER': 'transfer',

  // Personel işlemleri - Türkçe varyasyonları
  'PERSONEL GİDERİ': 'personel_gider',
  'PERSONEL GIDERI': 'personel_gider',
  'PERSONEL GİDERI': 'personel_gider',
  'PERSONEL GIDERİ': 'personel_gider',

  'PERSONEL ÖDEMESİ': 'personel_odeme',
  'PERSONEL ÖDEMESI': 'personel_odeme',
  'PERSONEL ODEMESİ': 'personel_odeme',
  'PERSONEL ODEMESI': 'personel_odeme',

  'PERSONEL TAHSİLATI': 'personel_tahsilat',
  'PERSONEL TAHSILATI': 'personel_tahsilat',
  'PERSONEL TAHSİLAT': 'personel_tahsilat',
  'PERSONEL TAHSILAT': 'personel_tahsilat',

  // Personel işlemleri (EN)
  'STAFF EXPENSE': 'personel_gider',
  'STAFF PAYMENT': 'personel_odeme',
  'STAFF COLLECTION': 'personel_tahsilat',

  // Cari alış/satış (TR)
  'CARİ ALIŞ': 'cari_alis',
  'CARI ALIS': 'cari_alis',
  'CARİ SATIŞ': 'cari_satis',
  'CARI SATIS': 'cari_satis',

  // Cari alış/satış (EN)
  'PURCHASE': 'cari_alis',
  'SALE': 'cari_satis',

  // Cari iade işlemleri (TR)
  'CARİ ALIŞ İADE': 'cari_alis_iade',
  'CARI ALIS IADE': 'cari_alis_iade',
  'CARİ ALIŞ IADE': 'cari_alis_iade',
  'CARI ALIŞ İADE': 'cari_alis_iade',
  'ALIŞ İADE': 'cari_alis_iade',
  'ALIS IADE': 'cari_alis_iade',

  'CARİ SATIŞ İADE': 'cari_satis_iade',
  'CARI SATIS IADE': 'cari_satis_iade',
  'CARİ SATIŞ IADE': 'cari_satis_iade',
  'CARI SATIŞ İADE': 'cari_satis_iade',
  'SATIŞ İADE': 'cari_satis_iade',
  'SATIS IADE': 'cari_satis_iade',

  // Cari iade işlemleri (EN)
  'PURCHASE RETURN': 'cari_alis_iade',
  'SALE RETURN': 'cari_satis_iade',

  // Başlangıç bakiyesi (TR)
  // normalizeTurkishChars() ile lookup yapıldığı için sadece temel varyasyonlar gerekli
  'BAŞLANGIÇ BAKİYESİ': 'baslangic_bakiyesi', // Tam Türkçe
  'BASLANGIC BAKIYESI': 'baslangic_bakiyesi', // ASCII (normalizeTurkishChars sonucu)
  'BAŞLANGIÇ': 'baslangic_bakiyesi',          // Kısa versiyon

  // Başlangıç bakiyesi (EN)
  'OPENING BALANCE': 'baslangic_bakiyesi',
  'INITIAL BALANCE': 'baslangic_bakiyesi',
  'STARTING BALANCE': 'baslangic_bakiyesi',
};

/**
 * İşlem tipine göre tutarın yönünü belirle
 * true = gider (para çıkışı), false = gelir (para girişi)
 */
export const getIsExpenseByType = (mappedType: string): boolean => {
  const expenseTypes = [
    'gider',
    'cari_alis',
    'cari_odeme',
    'cari_satis_iade',
    'personel_gider',
    'personel_odeme',
    'transfer', // kaynak hesap için
  ];
  return expenseTypes.includes(mappedType);
};

/**
 * Bilinen banka/hesap isimleri (otomatik tanıma için)
 */
export const KNOWN_BANK_KEYWORDS = [
  'banka', 'bank', 'türkiye finans', 'albaraka', 'garanti', 'ziraat',
  'iş bankası', 'yapı kredi', 'akbank', 'halkbank', 'vakıfbank', 'denizbank',
  'qnb', 'ing', 'hsbc', 'teb', 'şekerbank', 'fibabanka', 'odeabank',
];

export const KNOWN_CASH_KEYWORDS = ['nakit', 'kasa', 'cash', 'elden'];

export const KNOWN_CREDIT_CARD_KEYWORDS = ['kredi kartı', 'kredi karti', 'credit card', 'kk'];

export const KNOWN_BIRIKIM_KEYWORDS = [
  'altın', 'altin', 'gold', 'xau',
  'döviz', 'doviz', 'usd', 'eur', 'gbp', 'euro', 'dolar',
  'yatırım', 'yatirim', 'investment',
  'birikim', 'tasarruf', 'savings',
  'gümüş', 'gumus', 'silver', 'xag',
];

/**
 * Türkçe karakterleri ASCII karşılıklarına dönüştür
 * Bu, Excel başlıklarını karşılaştırırken tutarlılık sağlar
 */
function normalizeTurkishChars(str: string): string {
  return str
    .replace(/İ/g, 'I')
    .replace(/ı/g, 'i')
    .replace(/Ğ/g, 'G')
    .replace(/ğ/g, 'g')
    .replace(/Ü/g, 'U')
    .replace(/ü/g, 'u')
    .replace(/Ş/g, 'S')
    .replace(/ş/g, 's')
    .replace(/Ö/g, 'O')
    .replace(/ö/g, 'o')
    .replace(/Ç/g, 'C')
    .replace(/ç/g, 'c');
}

// ============================================================================
// EXCEL PARSING
// ============================================================================

/**
 * Excel serial date'i JavaScript Date'e çevir
 * Timezone sorunlarını önlemek için LOCAL saat diliminde oluşturur
 */
export function excelDateToJS(excelDate: number): Date {
  // Excel'in epoch'u 1900-01-01 (25569 gün fark var Unix epoch'a)
  const excelEpochDiff = 25569;

  // Tam gün kısmı
  const days = Math.floor(excelDate);
  // Gün içi saat kısmı (kesirli kısım)
  const timeFraction = excelDate - days;

  // Gün sayısını tarihe çevir (1970-01-01'den itibaren)
  const daysSince1970 = days - excelEpochDiff;

  // Yıl, ay, gün hesapla (UTC'de)
  const tempDate = new Date(Date.UTC(1970, 0, 1 + daysSince1970));
  const year = tempDate.getUTCFullYear();
  const month = tempDate.getUTCMonth();
  const day = tempDate.getUTCDate();

  // Saat hesapla (kesirli kısımdan)
  const totalMinutes = Math.round(timeFraction * 24 * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  // LOCAL saat diliminde Date oluştur (timezone kaymasını önler)
  return new Date(year, month, day, hours, minutes, 0, 0);
}

/**
 * String tarih parse sonucu
 */
interface DateParseResult {
  date: Date | null;
  error?: string;
}

/**
 * String tarih formatını parse et
 * Desteklenen formatlar:
 * - YYYY-MM-DD HH:mm
 * - DD/MM/YYYY HH:mm
 * - DD.MM.YYYY HH:mm
 * - D/M/YYYY, D.M.YYYY (tek haneli gün/ay)
 */
function parseStringDate(dateStr: string): DateParseResult {
  const cleaned = dateStr.trim();

  // Format 1: YYYY-MM-DD veya YYYY-MM-DD HH:mm
  const format1 = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:\s+(\d{1,2}):(\d{1,2}))?$/;
  let match = cleaned.match(format1);
  if (match) {
    const year = parseInt(match[1], 10);
    const month = parseInt(match[2], 10);
    const day = parseInt(match[3], 10);
    const hour = match[4] ? parseInt(match[4], 10) : 0;
    const minute = match[5] ? parseInt(match[5], 10) : 0;

    if (month < 1 || month > 12) {
      return { date: null, error: `Geçersiz ay: ${month}` };
    }
    if (day < 1 || day > 31) {
      return { date: null, error: `Geçersiz gün: ${day}` };
    }

    const date = new Date(year, month - 1, day, hour, minute);
    if (isNaN(date.getTime())) {
      return { date: null, error: `Geçersiz tarih: "${dateStr}"` };
    }
    return { date };
  }

  // Format 2: DD/MM/YYYY veya DD/MM/YYYY HH:mm
  const format2 = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{1,2}))?$/;
  match = cleaned.match(format2);
  if (match) {
    const day = parseInt(match[1], 10);
    const month = parseInt(match[2], 10);
    const year = parseInt(match[3], 10);
    const hour = match[4] ? parseInt(match[4], 10) : 0;
    const minute = match[5] ? parseInt(match[5], 10) : 0;

    if (month < 1 || month > 12) {
      return { date: null, error: `Geçersiz ay: ${month}` };
    }
    if (day < 1 || day > 31) {
      return { date: null, error: `Geçersiz gün: ${day}` };
    }

    const date = new Date(year, month - 1, day, hour, minute);
    if (isNaN(date.getTime())) {
      return { date: null, error: `Geçersiz tarih: "${dateStr}"` };
    }
    return { date };
  }

  // Format 3: DD.MM.YYYY veya DD.MM.YYYY HH:mm
  const format3 = /^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}):(\d{1,2}))?$/;
  match = cleaned.match(format3);
  if (match) {
    const day = parseInt(match[1], 10);
    const month = parseInt(match[2], 10);
    const year = parseInt(match[3], 10);
    const hour = match[4] ? parseInt(match[4], 10) : 0;
    const minute = match[5] ? parseInt(match[5], 10) : 0;

    if (month < 1 || month > 12) {
      return { date: null, error: `Geçersiz ay: ${month}` };
    }
    if (day < 1 || day > 31) {
      return { date: null, error: `Geçersiz gün: ${day}` };
    }

    const date = new Date(year, month - 1, day, hour, minute);
    if (isNaN(date.getTime())) {
      return { date: null, error: `Geçersiz tarih: "${dateStr}"` };
    }
    return { date };
  }

  return { date: null, error: `Tanınmayan tarih formatı: "${dateStr}"` };
}

/**
 * Kolon indekslerini bul
 */
interface ColumnIndices {
  tarih: number;
  islemTipi: number;
  aciklama: number;
  kategori: number;
  hesap: number;
  personel: number;
  tedarikci: number;
  musteri: number;
  karsiHesap: number;
  miktar: number;
  birim: number;
}

function findColumnIndices(headerRow: any[]): ColumnIndices | null {
  const indices: Partial<ColumnIndices> = {};

  // Debug: Header satırını logla
  if (__DEV__) {
    console.log('Excel header row:', headerRow.map((cell, i) => `[${i}]="${cell}"`).join(', '));
  }

  headerRow.forEach((cell, index) => {
    const rawHeader = cell?.toString().toUpperCase().trim();
    // Türkçe karakterleri normalize et: İ→I, Ş→S, Ğ→G, Ü→U, Ö→O, Ç→C
    const header = normalizeTurkishChars(rawHeader || '');

    // Debug: Her header'ı logla
    if (__DEV__) {
      console.log(`Column ${index}: raw="${cell}" -> upper="${rawHeader}" -> normalized="${header}"`);
    }

    // Normalize edilmiş ASCII değerleri ile karşılaştır (TR ve EN)
    switch (header) {
      case 'TARIH':
      case 'DATE':
        indices.tarih = index;
        break;
      case 'ISLEM TIPI':
      case 'TYPE':
        indices.islemTipi = index;
        break;
      case 'ACIKLAMA':
      case 'DESCRIPTION':
        indices.aciklama = index;
        break;
      case 'KATEGORI':
      case 'ALT KATEGORI':
      case 'CATEGORY':
        indices.kategori = index;
        break;
      case 'HESAP':
      case 'ACCOUNT':
        indices.hesap = index;
        break;
      case 'PERSONEL':
      case 'STAFF':
        indices.personel = index;
        break;
      case 'TEDARIKCI':
      case 'SUPPLIER':
        indices.tedarikci = index;
        break;
      case 'MUSTERI':
      case 'CUSTOMER':
        indices.musteri = index;
        break;
      case 'KARSI HESAP':
      case 'TARGET ACCOUNT':
        indices.karsiHesap = index;
        break;
      case 'MIKTAR':
      case 'AMOUNT':
        indices.miktar = index;
        break;
      case 'BIRIM':
      case 'CURRENCY':
        indices.birim = index;
        break;
    }
  });

  // Debug: Bulunan kolonları logla
  if (__DEV__) {
    console.log('Detected column indices:', JSON.stringify(indices, null, 2));
  }

  // Zorunlu kolonları kontrol et
  if (indices.tarih === undefined || indices.islemTipi === undefined ||
      indices.hesap === undefined || indices.miktar === undefined) {
    if (__DEV__) {
      console.log('Missing required columns! tarih:', indices.tarih, 'islemTipi:', indices.islemTipi, 'hesap:', indices.hesap, 'miktar:', indices.miktar);
    }
    return null;
  }

  const result = {
    tarih: indices.tarih,
    islemTipi: indices.islemTipi,
    aciklama: indices.aciklama ?? -1,
    kategori: indices.kategori ?? -1,
    hesap: indices.hesap,
    personel: indices.personel ?? -1,
    tedarikci: indices.tedarikci ?? -1,
    musteri: indices.musteri ?? -1,
    karsiHesap: indices.karsiHesap ?? -1,
    miktar: indices.miktar,
    birim: indices.birim ?? -1,
  };

  // Debug: Final sonuç
  if (__DEV__) {
    console.log('Final column indices:', JSON.stringify(result, null, 2));
    console.log('KATEGORİ column index:', result.kategori, '(expected >= 0 if found)');
  }

  return result;
}

/**
 * Excel dosyasını parse et
 */
export function parseExcelFile(fileBuffer: ArrayBuffer): ImportPreview {
  const workbook = XLSX.read(fileBuffer, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];

  const errors: string[] = [];
  const transactions: ParsedTransaction[] = [];
  const uniqueAccounts = new Set<string>();
  const uniquePersonel = new Set<string>();
  const uniqueTedarikci = new Set<string>();
  const uniqueMusteri = new Set<string>();
  const uniqueKarsiHesap = new Set<string>();
  const uniqueCategories = new Set<string>();
  const transactionTypes: Record<string, number> = {};
  // KARŞI HESAP'ın hangi işlem tipleriyle kullanıldığını takip et
  const karsiHesapTransactionTypes = new Map<string, Set<string>>();

  // Header row'u bul
  let headerRowIndex = -1;
  let columnIndices: ColumnIndices | null = null;

  for (let i = 0; i < Math.min(20, rawData.length); i++) {
    const row = rawData[i];
    if (row) {
      columnIndices = findColumnIndices(row);
      if (columnIndices) {
        headerRowIndex = i;
        break;
      }
    }
  }

  if (headerRowIndex === -1 || !columnIndices) {
    errors.push('HEADER_NOT_FOUND');
    return {
      transactions: [],
      uniqueAccounts: [],
      uniquePersonel: [],
      uniqueTedarikci: [],
      uniqueMusteri: [],
      uniqueKarsiHesap: [],
      uniqueCategories: [],
      transactionTypes: {},
      karsiHesapContext: {},
      dateRange: { min: '', max: '' },
      totalRows: 0,
      validRows: 0,
      invalidDateCount: 0,
      invalidAmountCount: 0,
      skippedEmptyRows: 0,
      skippedNoDateOrType: 0,
      skippedNoEntity: 0,
      silentlySkipped: [],
      errors,
    };
  }

  const cols = columnIndices;

  // Data rows'ları parse et
  let minDate: Date | null = null;
  let maxDate: Date | null = null;

  // Atlanan satır sayaçları
  let skippedEmptyRows = 0;
  let skippedNoDateOrType = 0;
  let skippedNoEntity = 0;
  // Sessizce atlanan satırların detayları (kullanıcıya gösterilecek)
  const silentlySkipped: SilentlySkippedRow[] = [];

  for (let i = headerRowIndex + 1; i < rawData.length; i++) {
    const row = rawData[i];
    const rowNumber = i + 1; // Excel satır numarası (1-based, header dahil)

    // Boş satırları atla
    if (!row || row.length < 3) {
      skippedEmptyRows++;
      silentlySkipped.push({ rowNumber, reason: 'empty', rawData: row ? row.map(c => String(c || '')) : [] });
      continue;
    }

    try {
      const rawDate = row[cols.tarih];
      const type = row[cols.islemTipi]?.toString().trim().toUpperCase();
      const description = cols.aciklama >= 0 ? row[cols.aciklama]?.toString().trim() || null : null;
      const category = cols.kategori >= 0 ? row[cols.kategori]?.toString().trim() || null : null;
      const account = row[cols.hesap]?.toString().trim();
      // PERSONEL/TEDARİKÇİ/MÜŞTERİ kolonlarını bracket notation ile parse et
      // Örn: "Said Özadalı [28350 TRY]" → name: "Said Özadalı", amount: 28350, currency: "TRY"
      const personelRaw = cols.personel >= 0 ? row[cols.personel]?.toString().trim() || null : null;
      const parsedPersonel = personelRaw ? parseKarsiHesap(personelRaw) : null;
      const personel = parsedPersonel?.name || null;

      // Debug: İlk 5 satır için kategori değerini logla
      if (__DEV__ && i <= headerRowIndex + 5) {
        console.log(`Row ${rowNumber}: kategori column index=${cols.kategori}, raw value="${row[cols.kategori]}", extracted="${category}"`);
      }
      const tedarikciRaw = cols.tedarikci >= 0 ? row[cols.tedarikci]?.toString().trim() || null : null;
      const parsedTedarikci = tedarikciRaw ? parseKarsiHesap(tedarikciRaw) : null;
      const tedarikci = parsedTedarikci?.name || null;

      const musteriRaw = cols.musteri >= 0 ? row[cols.musteri]?.toString().trim() || null : null;
      const parsedMusteri = musteriRaw ? parseKarsiHesap(musteriRaw) : null;
      const musteri = parsedMusteri?.name || null;

      // Aktif entity'nin cross-currency bracket bilgisi (satır başına en fazla 1 entity)
      // Sadece bracket amount'u olan entity'yi seç (bracket'siz entity'yi atla)
      const entityWithBracket =
        (parsedPersonel?.amount ? parsedPersonel : null) ||
        (parsedTedarikci?.amount ? parsedTedarikci : null) ||
        (parsedMusteri?.amount ? parsedMusteri : null);
      const entityBracketAmount = entityWithBracket?.amount ?? null;
      const entityBracketCurrency = entityWithBracket?.currency ?? null;

      // DEBUG: GİDER işlemleri için TEDARİKÇİ kolonunu kontrol et
      const isGiderType = type === 'GİDER' || type === 'GIDER';
      if (__DEV__ && isGiderType && i <= headerRowIndex + 10) {
        console.log(`[DEBUG Row ${rowNumber}] GİDER işlem:`, {
          'type': type,
          'cols.tedarikci index': cols.tedarikci,
          'raw tedarikci cell': cols.tedarikci >= 0 ? row[cols.tedarikci] : 'COLUMN_NOT_FOUND',
          'parsed tedarikci': tedarikci,
          'description': description,
          'amount': Number(row[cols.miktar]),
          'row data': row.slice(0, 10), // İlk 10 hücreyi göster
        });
      }
      const karsiHesapRaw = cols.karsiHesap >= 0 ? row[cols.karsiHesap]?.toString().trim() || null : null;

      // KARŞI HESAP'ı parse et: "Nakit (Kasa) [-58750 TRY]" → { name, amount, currency }
      const parsedKarsiHesap = karsiHesapRaw ? parseKarsiHesap(karsiHesapRaw) : null;
      const karsiHesap = parsedKarsiHesap?.name || null;
      const karsiHesapAmount = parsedKarsiHesap?.amount ?? null;
      const karsiHesapCurrency = parsedKarsiHesap?.currency ?? null;

      // BIRIM/CURRENCY kolonu - ana hesabın para birimi
      // resolveUnitAlias ile normalize et: "tl" → "TRY", "g" → "XAU", "gram" → "XAU" vb.
      const rawBirim = cols.birim >= 0 ? row[cols.birim]?.toString().trim() || null : null;
      const currency = rawBirim ? resolveUnitAlias(rawBirim, account || '') : null;

      // Tutar dönüşümü ve validasyonu
      // NOT: Veritabanı DECIMAL(15,2) kullanıyor, bu yüzden 2 ondalık basamağa yuvarlamalıyız
      let amount = 0;
      let signedAmount = 0; // Orijinal işaretli değer (başlangıç bakiyesi için)
      let amountValid = true;
      let amountError: string | undefined;
      const rawAmount = row[cols.miktar];

      if (rawAmount === undefined || rawAmount === null || rawAmount === '') {
        amountValid = false;
        amountError = 'Tutar boş veya bulunamadı';
      } else {
        const parsedAmount = Number(rawAmount);
        if (isNaN(parsedAmount)) {
          amountValid = false;
          amountError = `Geçersiz tutar değeri: "${rawAmount}"`;
        } else {
          // Mutlak değer al ve 2 ondalık basamağa yuvarla (DECIMAL(15,2) ile uyumlu)
          const roundedAmount = Math.round(Math.abs(parsedAmount) * 100) / 100;
          // Orijinal işaretli değeri de sakla (başlangıç bakiyesi için)
          signedAmount = Math.round(parsedAmount * 100) / 100;

          if (roundedAmount <= 0) {
            // Sıfır veya çok küçük tutarlar geçersiz (veritabanı constraint: amount > 0)
            amountValid = false;
            amountError = 'Tutar sıfır veya çok küçük olamaz';
          } else {
            amount = roundedAmount;
          }
        }
      }

      // Gerekli alanları kontrol et
      // NOT: TEDARİKÇİ, MÜŞTERİ veya PERSONEL varsa HESAP zorunlu DEĞİL
      const hasCariEntity = tedarikci || musteri;
      const hasPersonelEntity = !!personel;

      // Entity validation - hesap/cari/personel kontrolü
      let entityValid = true;
      let entityError: string | undefined;

      // Tarih veya tip eksikse hata flag'i set et (artık skip etmiyoruz)
      let hasDateOrTypeError = false;
      if (!rawDate || !type) {
        hasDateOrTypeError = true;
        skippedNoDateOrType++;
        // silentlySkipped yerine hata flag'i ile devam et
      }

      // HESAP kontrolü: Sadece hiçbir entity yoksa zorunlu
      // Cari işlemler (tedarikci/musteri) ve personel işlemleri hesapsız olabilir
      if (!account && !hasCariEntity && !hasPersonelEntity) {
        entityValid = false;
        entityError = 'Hesap, cari veya personel bilgisi eksik';
        skippedNoEntity++;
        // silentlySkipped yerine hata flag'i ile devam et
      }

      // Tarih dönüşümü (Excel serial veya string olabilir)
      let jsDate: Date | null = null;
      let dateValid = true;
      let dateError: string | undefined;

      // Tarih eksikse (hasDateOrTypeError durumunda rawDate boş olabilir)
      if (!rawDate) {
        dateValid = false;
        dateError = 'Tarih bilgisi eksik';
      } else if (typeof rawDate === 'number') {
        jsDate = excelDateToJS(rawDate);
        if (isNaN(jsDate.getTime())) {
          dateValid = false;
          dateError = `Geçersiz Excel tarih değeri: ${rawDate}`;
          jsDate = null;
        }
      } else if (typeof rawDate === 'string') {
        const parseResult = parseStringDate(rawDate);
        if (parseResult.date) {
          jsDate = parseResult.date;
        } else {
          dateValid = false;
          dateError = parseResult.error || `Tanınmayan tarih: "${rawDate}"`;
        }
      } else {
        dateValid = false;
        dateError = `Beklenmeyen tarih tipi: ${typeof rawDate}`;
      }

      // İşlem tipi mapping - context-aware
      // Turkish character normalization for better matching (İ→I, Ş→S, Ğ→G, etc.)
      const normalizedType = normalizeTurkishChars(type || '').toUpperCase();
      let mappedType = TRANSACTION_TYPE_MAP[normalizedType] || TRANSACTION_TYPE_MAP[type || ''] || 'gider';
      const originalMappedType = mappedType;

      // İşlem tipi eksikse dateError'a ekle
      if (!type) {
        if (dateError) {
          dateError += ', İşlem tipi eksik';
        } else {
          dateValid = false;
          dateError = 'İşlem tipi eksik';
        }
      }

      // Context-aware type correction:
      // Öncelik: TRANSFER kontrolü > Entity kolonları (TEDARİKÇİ/MÜŞTERİ/PERSONEL) > Varsayılan
      // NOT: KARŞI HESAP dolu olması artık otomatik transfer YAPMAZ.
      //       Sadece orijinal tip TRANSFER ise transfer olur.
      //       Diğer tiplerde KARŞI HESAP = paranın gittiği/geldiği hesap (hesap_id olarak kullanılır).

      // 1. TRANSFER: Sadece orijinal tip TRANSFER ve KARŞI HESAP doluysa
      if (normalizedType === 'TRANSFER' && karsiHesap) {
        mappedType = 'transfer';
      }
      // 2. TEDARİKÇİ kolonu doluysa → cari işlemi
      else if (tedarikci && !musteri) {
        if (mappedType === 'gider' || mappedType === 'cari_alis') {
          mappedType = 'cari_alis'; // GIDER+TEDARIKCI = tedarikçiden alış (gider)
        }
        // cari_odeme zaten TRANSACTION_TYPE_MAP'ten geliyor (ÖDEME→cari_odeme)
      }
      // 3. MÜŞTERİ kolonu doluysa → cari işlemi
      else if (musteri && !tedarikci) {
        if (mappedType === 'gelir') {
          mappedType = 'cari_satis'; // GELIR+MUSTERI = müşteriye satış (gelir)
        }
        // cari_tahsilat zaten TRANSACTION_TYPE_MAP'ten geliyor (TAHSİLAT→cari_tahsilat)
      }
      // 4. PERSONEL kolonu doluysa → personel işlemi
      else if (personel && !tedarikci && !musteri) {
        if (mappedType === 'gider') {
          mappedType = 'personel_gider'; // GIDER+PERSONEL = personel gideri (gider)
        } else if (mappedType === 'cari_odeme') {
          mappedType = 'personel_odeme'; // ÖDEME+PERSONEL = personele ödeme (nakit akışı)
        } else if (mappedType === 'cari_tahsilat') {
          mappedType = 'personel_tahsilat'; // TAHSİLAT+PERSONEL = personelden tahsilat (nakit akışı)
        }
      }
      // 5. ÖDEME + HESAP + KARŞI HESAP (entity yok) → kredi kartı ödemesi = transfer
      //    Örnek: ÖDEME, Garanti Bankası → Garanti Kredi Kartı
      else if (normalizedType === 'ODEME' && account && karsiHesap && !tedarikci && !musteri && !personel) {
        mappedType = 'transfer';
      }
      // 6. Hiçbir entity yok ama KARŞI HESAP var → tip olduğu gibi kalır
      //    KARŞI HESAP bilgisi import sırasında hesap_id olarak kullanılacak
      // 7. Hiçbir entity yok, KARŞI HESAP yok → salt gelir/gider (hesap işlemi)
      // mappedType olduğu gibi kalır (gelir veya gider)

      // Debug: Context-aware mapping'i logla (sadece değişenler için)
      if (__DEV__ && originalMappedType !== mappedType) {
        console.log(`Context-aware mapping: ${type} (${originalMappedType}) → ${mappedType}`, {
          tedarikci,
          musteri,
          personel,
          karsiHesap,
        });
      }

      // Geçerli tarih varsa min/max güncelle
      if (jsDate) {
        if (!minDate || jsDate < minDate) minDate = jsDate;
        if (!maxDate || jsDate > maxDate) maxDate = jsDate;
      }

      // Unique değerleri topla (boş değerleri ekleme)
      if (account) uniqueAccounts.add(account);
      if (personel) uniquePersonel.add(personel);
      if (tedarikci) uniqueTedarikci.add(tedarikci);
      if (musteri) uniqueMusteri.add(musteri);
      if (karsiHesap) {
        uniqueKarsiHesap.add(karsiHesap);
        // KARŞI HESAP'ın hangi işlem tipleriyle kullanıldığını kaydet
        if (!karsiHesapTransactionTypes.has(karsiHesap)) {
          karsiHesapTransactionTypes.set(karsiHesap, new Set());
        }
        karsiHesapTransactionTypes.get(karsiHesap)!.add(type);
      }
      if (category) uniqueCategories.add(category);
      transactionTypes[type] = (transactionTypes[type] || 0) + 1;

      // Tarih geçersizse de işlemi ekle (önizlemede gösterilecek, import'ta atlanacak)
      // timestamp kolonu için YYYY-MM-DDTHH:MM:SS formatı kullan (saat bilgisi korunur)
      const isoDate = jsDate ? formatDateTimeForDB(jsDate) : '';

      // İşlem tipine göre tutarın yönünü belirle (negatif/pozitif yazmaya gerek yok)
      const isExpense = getIsExpenseByType(mappedType);

      transactions.push({
        date: isoDate,
        type: type || '',
        mappedType,
        description,
        category,
        account: account || '',
        personel,
        tedarikci,
        musteri,
        karsiHesap,
        karsiHesapRaw,
        karsiHesapAmount,
        karsiHesapCurrency,
        entityBracketAmount,
        entityBracketCurrency,
        amount: Math.abs(amount),
        signedAmount, // Orijinal işaretli değer (başlangıç bakiyesi için)
        currency,
        isExpense,
        dateValid,
        dateError,
        amountValid,
        amountError,
        entityValid,
        entityError,
        rowNumber,
      });
    } catch (err) {
      errors.push(`Satır ${i + 1}: Parse hatası - ${err}`);
    }
  }

  // Geçerli/geçersiz tarih, tutar ve entity sayıları
  const validRows = transactions.filter(t => t.dateValid && t.amountValid && t.entityValid).length;
  const invalidDateCount = transactions.filter(t => !t.dateValid).length;
  const invalidAmountCount = transactions.filter(t => !t.amountValid).length;

  // KARŞI HESAP context'i oluştur: işlem tipine göre akıllı sınıflandırma
  const karsiHesapContext: ImportPreview['karsiHesapContext'] = {};
  karsiHesapTransactionTypes.forEach((typeSet, name) => {
    const types = Array.from(typeSet);
    const lowerName = name.toLowerCase();

    // Önce isim bazlı kontrol (banka/nakit isimleri hesap olmalı)
    const isBankOrCash = KNOWN_BANK_KEYWORDS.some(kw => lowerName.includes(kw)) ||
                         KNOWN_CASH_KEYWORDS.some(kw => lowerName.includes(kw));

    let suggestedType: 'hesap' | 'cari' | 'personel' = 'hesap';
    let cariType: 'musteri' | 'tedarikci' | undefined;

    if (isBankOrCash) {
      // Banka veya nakit ismi → hesap
      suggestedType = 'hesap';
    } else {
      // İşlem tipi bazlı akıllı tahmin
      // Öncelik sırası: ÖDEME/TAHSİLAT > PERSONEL > TRANSFER
      const hasOdeme = types.some(t => t.includes('ÖDEME') || t.includes('ODEME'));
      const hasTahsilat = types.some(t => t.includes('TAHSİLAT') || t.includes('TAHSILAT'));
      const hasPersonel = types.some(t => t.includes('PERSONEL'));
      const hasTransfer = types.includes('TRANSFER');
      const hasSatis = types.some(t => t.includes('SATIŞ') || t.includes('SATIS'));
      const hasAlis = types.some(t => t.includes('ALIŞ') || t.includes('ALIS'));

      if (hasPersonel) {
        // PERSONEL işlemi → personel
        suggestedType = 'personel';
      } else if (hasOdeme && !hasTransfer) {
        // ÖDEME (transfer değilse) → cari tedarikçi
        suggestedType = 'cari';
        cariType = 'tedarikci';
      } else if (hasTahsilat && !hasTransfer) {
        // TAHSİLAT (transfer değilse) → cari müşteri
        suggestedType = 'cari';
        cariType = 'musteri';
      } else if (hasSatis) {
        // SATIŞ → cari müşteri
        suggestedType = 'cari';
        cariType = 'musteri';
      } else if (hasAlis) {
        // ALIŞ → cari tedarikçi
        suggestedType = 'cari';
        cariType = 'tedarikci';
      } else if (hasTransfer) {
        // Sadece TRANSFER → hesap
        suggestedType = 'hesap';
      } else {
        // Varsayılan: cari (tedarikçi) - çünkü genelde ödeme yapılan taraf
        suggestedType = 'cari';
        cariType = 'tedarikci';
      }
    }

    karsiHesapContext[name] = { types, suggestedType, cariType };
  });

  // Debug: Final unique kategorileri logla
  if (__DEV__) {
    console.log('=== IMPORT SUMMARY ===');
    console.log('uniqueCategories:', Array.from(uniqueCategories));
    console.log('Total transactions:', transactions.length);
    console.log('Transactions with category:', transactions.filter(t => t.category).length);
    console.log('karsiHesapContext:', karsiHesapContext);

    // Mapped type dağılımı
    const mappedTypeDistribution: Record<string, number> = {};
    transactions.forEach(t => {
      mappedTypeDistribution[t.mappedType] = (mappedTypeDistribution[t.mappedType] || 0) + 1;
    });
    console.log('=== MAPPED TYPE DISTRIBUTION ===');
    console.log(mappedTypeDistribution);

    // TEDARİKÇİ bilgisi
    console.log('=== TEDARİKÇİ ANALIZ ===');
    console.log('uniqueTedarikci count:', uniqueTedarikci.size);
    console.log('uniqueTedarikci values:', Array.from(uniqueTedarikci));

    // GİDER işlemleri analizi
    const giderTransactions = transactions.filter(t => t.type === 'GİDER' || t.type === 'GIDER');
    const giderWithTedarikci = giderTransactions.filter(t => t.tedarikci);
    const giderMappedToCariAlis = transactions.filter(t => t.mappedType === 'cari_alis');
    console.log('=== GİDER ANALIZ ===');
    console.log('GİDER transaction count:', giderTransactions.length);
    console.log('GİDER with tedarikci:', giderWithTedarikci.length);
    console.log('Mapped to cari_alis:', giderMappedToCariAlis.length);

    // İlk 3 GİDER+TEDARİKÇİ örneği
    if (giderWithTedarikci.length > 0) {
      console.log('=== GİDER+TEDARİKÇİ ÖRNEKLER ===');
      giderWithTedarikci.slice(0, 3).forEach((t, idx) => {
        console.log(`Örnek ${idx + 1}:`, {
          type: t.type,
          mappedType: t.mappedType,
          tedarikci: t.tedarikci,
          description: t.description,
          amount: t.amount,
        });
      });
    }
  }

  return {
    transactions,
    uniqueAccounts: Array.from(uniqueAccounts).sort(),
    uniquePersonel: Array.from(uniquePersonel).sort(),
    uniqueTedarikci: Array.from(uniqueTedarikci).sort(),
    uniqueMusteri: Array.from(uniqueMusteri).sort(),
    uniqueKarsiHesap: Array.from(uniqueKarsiHesap).sort(),
    uniqueCategories: Array.from(uniqueCategories).sort(),
    transactionTypes,
    karsiHesapContext,
    dateRange: {
      min: minDate ? formatDateForDB(minDate) : '',
      max: maxDate ? formatDateForDB(maxDate) : '',
    },
    totalRows: transactions.length,
    validRows,
    invalidDateCount,
    invalidAmountCount,
    skippedEmptyRows,
    skippedNoDateOrType,
    skippedNoEntity,
    silentlySkipped,
    errors,
  };
}

// ============================================================================
// AUTO-DETECTION
// ============================================================================

/**
 * Hesap adından tipini otomatik tahmin et
 */
export function guessAccountType(name: string): AccountMapping {
  // Defensive check: boş veya undefined isim
  if (!name) {
    return { name: '', type: 'hesap', hesapType: 'banka' };
  }
  const lowerName = name.toLowerCase();

  // Kredi kartı kontrolü
  if (KNOWN_CREDIT_CARD_KEYWORDS.some(kw => lowerName.includes(kw))) {
    return { name, type: 'hesap', hesapType: 'kredi_karti' };
  }

  // Banka kontrolü
  if (KNOWN_BANK_KEYWORDS.some(kw => lowerName.includes(kw))) {
    return { name, type: 'hesap', hesapType: 'banka' };
  }

  // Nakit kontrolü
  if (KNOWN_CASH_KEYWORDS.some(kw => lowerName.includes(kw))) {
    return { name, type: 'hesap', hesapType: 'nakit' };
  }

  // Birikim kontrolü (altın, döviz, yatırım vb.)
  if (KNOWN_BIRIKIM_KEYWORDS.some(kw => lowerName.includes(kw))) {
    return { name, type: 'hesap', hesapType: 'birikim' };
  }

  // Varsayılan: Hesap (banka - bilinmeyen hesaplar için en güvenli varsayılan)
  return { name, type: 'hesap', hesapType: 'banka' };
}

/**
 * Her hesap için en çok kullanılan para birimini tespit et
 * Transactions'daki currency alanından sayım yaparak en çok kullanılanı belirler
 * @param transactions - Parse edilmiş işlemler
 * @param accountMappings - Mevcut hesap sınıflandırmaları
 * @param defaultCurrency - Varsayılan para birimi (currency kolonu yoksa)
 */
export function detectAccountCurrencies(
  transactions: ParsedTransaction[],
  accountMappings: Record<string, AccountMapping>,
  defaultCurrency: string = 'TRY'
): Record<string, AccountMapping> {
  // Her hesap için currency sayımı: hesapAdı -> { currency -> count }
  const currencyCountByAccount = new Map<string, Map<string, number>>();

  transactions.forEach(tx => {
    // Ana hesap (HESAP kolonu)
    if (tx.account && tx.currency) {
      const key = tx.account.toLowerCase();
      if (!currencyCountByAccount.has(key)) {
        currencyCountByAccount.set(key, new Map());
      }
      const counts = currencyCountByAccount.get(key)!;
      counts.set(tx.currency, (counts.get(tx.currency) || 0) + 1);
    }

    // Karşı hesap (KARŞI HESAP kolonu) - karsiHesapCurrency kullan
    if (tx.karsiHesap && tx.karsiHesapCurrency) {
      const key = tx.karsiHesap.toLowerCase();
      if (!currencyCountByAccount.has(key)) {
        currencyCountByAccount.set(key, new Map());
      }
      const counts = currencyCountByAccount.get(key)!;
      counts.set(tx.karsiHesapCurrency, (counts.get(tx.karsiHesapCurrency) || 0) + 1);
    }
  });

  // Mapping'leri güncelle - en çok kullanılan currency'yi ata
  const result = { ...accountMappings };
  Object.keys(result).forEach(name => {
    const counts = currencyCountByAccount.get(name.toLowerCase());
    if (counts && counts.size > 0) {
      // En yüksek sayılı para birimini bul
      let maxCurrency = defaultCurrency;
      let maxCount = 0;
      counts.forEach((count, currency) => {
        if (count > maxCount) {
          maxCount = count;
          maxCurrency = currency;
        }
      });
      result[name].currency = maxCurrency;
      // İstatistikleri de kaydet (UI'da göstermek için)
      result[name].currencyStats = Object.fromEntries(counts);
    } else {
      // Hiç currency bilgisi yoksa varsayılanı kullan
      result[name].currency = defaultCurrency;
    }
  });

  return result;
}

/**
 * Tüm hesapları otomatik sınıflandır
 * Yeni şablon formatında kolonlar zaten ayrı olduğu için sadece HESAP ve KARŞI HESAP kolonlarını sınıflandırır
 * @param preview - Import önizlemesi
 * @param locale - Dil kodu (varsayılan para birimi için: 'en' → USD, 'tr' → TRY)
 */
export function autoClassifyAccounts(
  preview: ImportPreview,
  locale: string = 'tr'
): Record<string, AccountMapping> {
  const mappings: Record<string, AccountMapping> = {};

  // HESAP kolonundakiler -> hesap olarak sınıflandır
  preview.uniqueAccounts.forEach(name => {
    mappings[name] = guessAccountType(name);
  });

  // KARŞI HESAP kolonundakiler -> context-aware sınıflandır
  preview.uniqueKarsiHesap.forEach(name => {
    if (!mappings[name]) {
      const context = preview.karsiHesapContext[name];
      if (context) {
        // Context bazlı akıllı sınıflandırma
        if (context.suggestedType === 'cari') {
          mappings[name] = { name, type: 'cari', cariType: context.cariType || 'tedarikci' };
        } else if (context.suggestedType === 'personel') {
          mappings[name] = { name, type: 'personel' };
        } else {
          // hesap
          mappings[name] = guessAccountType(name);
        }
      } else {
        // Context yoksa varsayılan olarak hesap tipi tahmin et
        mappings[name] = guessAccountType(name);
      }
    }
  });

  // PERSONEL kolonundakiler -> personel olarak işaretle
  preview.uniquePersonel.forEach(name => {
    mappings[name] = { name, type: 'personel' };
  });

  // TEDARİKÇİ kolonundakiler -> cari (tedarikci) olarak işaretle
  preview.uniqueTedarikci.forEach(name => {
    mappings[name] = { name, type: 'cari', cariType: 'tedarikci' };
  });

  // MÜŞTERİ kolonundakiler -> cari (musteri) olarak işaretle
  preview.uniqueMusteri.forEach(name => {
    mappings[name] = { name, type: 'cari', cariType: 'musteri' };
  });

  // Para birimi tespiti - dile göre varsayılan belirle
  const defaultCurrency = locale.startsWith('en') ? 'USD' : 'TRY';
  return detectAccountCurrencies(preview.transactions, mappings, defaultCurrency);
}

// ============================================================================
// BATCH HELPERS
// ============================================================================

/**
 * Diziyi chunk'lara böl
 */
export function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

// ============================================================================
// EXPORT HELPERS
// ============================================================================

/**
 * Atlanan işlem bilgisi
 */
export interface SkippedTransactionInfo {
  transaction: ParsedTransaction;
  reason: string;
  rowNumber: number;
}

/**
 * Atlanan işlemleri Excel formatında dışa aktar
 * @returns Excel dosyası için base64 encoded string veya ArrayBuffer
 */
export function exportSkippedTransactionsToExcel(
  skippedTransactions: SkippedTransactionInfo[]
): ArrayBuffer {
  // Header satırı
  const headers = [
    'SATIR NO',
    'ATLANMA NEDENİ',
    'TARİH',
    'İŞLEM TİPİ',
    'AÇIKLAMA',
    'KATEGORİ',
    'HESAP',
    'PERSONEL',
    'TEDARİKÇİ',
    'MÜŞTERİ',
    'KARŞI HESAP',
    'MİKTAR',
  ];

  // Data satırları
  const data = skippedTransactions.map((item) => [
    item.rowNumber,
    item.reason,
    item.transaction.date,
    item.transaction.type,
    item.transaction.description || '',
    item.transaction.category || '',
    item.transaction.account,
    item.transaction.personel || '',
    item.transaction.tedarikci || '',
    item.transaction.musteri || '',
    item.transaction.karsiHesap || '',
    item.transaction.amount,
  ]);

  // Tüm veriyi birleştir
  const sheetData = [headers, ...data];

  // Excel dosyası oluştur
  const ws = XLSX.utils.aoa_to_sheet(sheetData);

  // Sütun genişliklerini ayarla
  ws['!cols'] = [
    { wch: 10 }, // SATIR NO
    { wch: 40 }, // ATLANMA NEDENİ
    { wch: 18 }, // TARİH
    { wch: 15 }, // İŞLEM TİPİ
    { wch: 25 }, // AÇIKLAMA
    { wch: 18 }, // KATEGORİ
    { wch: 18 }, // HESAP
    { wch: 18 }, // PERSONEL
    { wch: 18 }, // TEDARİKÇİ
    { wch: 18 }, // MÜŞTERİ
    { wch: 18 }, // KARŞI HESAP
    { wch: 12 }, // MİKTAR
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Atlanan İşlemler');

  // ArrayBuffer olarak döndür
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
}

/**
 * Atlanan işlemleri nedene göre grupla
 */
export function groupSkippedByReason(
  skippedTransactions: SkippedTransactionInfo[]
): Record<string, number> {
  const grouped: Record<string, number> = {};

  skippedTransactions.forEach((item) => {
    // Nedeni genelleştir (spesifik değerleri kaldır)
    let generalReason = item.reason;

    if (generalReason.startsWith('Hesap bulunamadı:')) {
      generalReason = 'Hesap bulunamadı';
    } else if (generalReason.startsWith('Transfer için karşı hesap bulunamadı:')) {
      generalReason = 'Transfer için karşı hesap bulunamadı';
    } else if (generalReason.startsWith('Personel bulunamadı:')) {
      generalReason = 'Personel bulunamadı';
    } else if (generalReason.startsWith('Veritabanı hatası:')) {
      generalReason = 'Veritabanı hatası';
    }

    grouped[generalReason] = (grouped[generalReason] || 0) + 1;
  });

  return grouped;
}

// ============================================================================
// VALIDATION (UX İyileştirmeleri)
// ============================================================================

/**
 * Hata nedenini kategorize et
 */
export function categorizeError(reason: string): ErrorCategory {
  const reasonLower = reason.toLowerCase();

  // Tarih hataları
  if (reasonLower.includes('tarih') || reasonLower.includes('date') || reasonLower.includes('geçersiz tarih')) {
    return 'date_invalid';
  }

  // Tutar hataları
  if (reasonLower.includes('tutar') || reasonLower.includes('amount') || reasonLower.includes('sıfır') || reasonLower.includes('küçük')) {
    return 'amount_invalid';
  }

  // Entity bulunamadı
  if (reasonLower.includes('bulunamadı') || reasonLower.includes('not found')) {
    return 'entity_not_found';
  }

  // Bilinmeyen tip
  if (reasonLower.includes('bilinmeyen') || reasonLower.includes('unknown') || reasonLower.includes('tanınmayan')) {
    return 'type_unknown';
  }

  // Duplicate
  if (reasonLower.includes('duplicate') || reasonLower.includes('tekrar') || reasonLower.includes('mevcut')) {
    return 'duplicate';
  }

  // Başlangıç bakiyesi
  if (reasonLower.includes('başlangıç') || reasonLower.includes('opening') || reasonLower.includes('bakiye')) {
    return 'starting_balance';
  }

  return 'other';
}

/**
 * Import preview verilerini valide et ve sonuç döndür
 * Bu fonksiyon import öncesi çağrılarak kullanıcıya veri kalitesi gösterilir
 */
export function validateImportData(preview: ImportPreview): ValidationResult {
  const issues: ValidationIssue[] = [];
  const errorsByCategory: Record<ErrorCategory, { count: number; examples: string[]; rows: number[] }> = {
    date_invalid: { count: 0, examples: [], rows: [] },
    amount_invalid: { count: 0, examples: [], rows: [] },
    entity_not_found: { count: 0, examples: [], rows: [] },
    type_unknown: { count: 0, examples: [], rows: [] },
    duplicate: { count: 0, examples: [], rows: [] },
    starting_balance: { count: 0, examples: [], rows: [] },
    other: { count: 0, examples: [], rows: [] },
  };

  let validCount = 0;
  let warningCount = 0;
  let errorCount = 0;

  // Her işlemi kontrol et
  preview.transactions.forEach((tx) => {
    const rowNum = tx.rowNumber;

    // Tarih kontrolü
    if (!tx.dateValid) {
      errorCount++;
      const cat = errorsByCategory.date_invalid;
      cat.count++;
      cat.rows.push(rowNum);
      if (cat.examples.length < 3 && tx.dateError) {
        cat.examples.push(tx.dateError);
      }
      return;
    }

    // Tutar kontrolü
    if (!tx.amountValid) {
      errorCount++;
      const cat = errorsByCategory.amount_invalid;
      cat.count++;
      cat.rows.push(rowNum);
      if (cat.examples.length < 3 && tx.amountError) {
        cat.examples.push(tx.amountError);
      }
      return;
    }

    // Başlangıç bakiyesi - otomatik olarak entity'lere uygulanacak
    // Geçerli olarak say, uyarı veya hata olarak gösterme
    if (tx.mappedType === 'baslangic_bakiyesi') {
      validCount++; // Başarıyla işlenecek
      const cat = errorsByCategory.starting_balance;
      cat.count++;
      cat.rows.push(rowNum);
      return;
    }

    // Bilinmeyen işlem tipi
    if (!tx.mappedType || tx.mappedType === 'unknown') {
      errorCount++;
      const cat = errorsByCategory.type_unknown;
      cat.count++;
      cat.rows.push(rowNum);
      if (cat.examples.length < 3) {
        cat.examples.push(`"${tx.type}" (satır ${rowNum})`);
      }
      return;
    }

    validCount++;
  });

  // Kategorize edilmiş hataları oluştur
  const categorizedErrors: CategorizedError[] = [];

  if (errorsByCategory.date_invalid.count > 0) {
    categorizedErrors.push({
      category: 'date_invalid',
      count: errorsByCategory.date_invalid.count,
      example: errorsByCategory.date_invalid.examples[0],
      examples: errorsByCategory.date_invalid.examples,
      rows: errorsByCategory.date_invalid.rows,
    });

    issues.push({
      type: 'error',
      category: 'date_invalid',
      messageKey: 'dataImport.validation.dateInvalid',
      message: `${errorsByCategory.date_invalid.count} işlemde geçersiz tarih`,
      count: errorsByCategory.date_invalid.count,
      rows: errorsByCategory.date_invalid.rows.slice(0, 10),
      suggestion: 'GG/AA/YYYY veya YYYY-MM-DD formatı kullanın',
    });
  }

  if (errorsByCategory.amount_invalid.count > 0) {
    categorizedErrors.push({
      category: 'amount_invalid',
      count: errorsByCategory.amount_invalid.count,
      example: errorsByCategory.amount_invalid.examples[0],
      examples: errorsByCategory.amount_invalid.examples,
      rows: errorsByCategory.amount_invalid.rows,
    });

    issues.push({
      type: 'error',
      category: 'amount_invalid',
      messageKey: 'dataImport.validation.amountInvalid',
      message: `${errorsByCategory.amount_invalid.count} işlemde geçersiz tutar`,
      count: errorsByCategory.amount_invalid.count,
      rows: errorsByCategory.amount_invalid.rows.slice(0, 10),
      suggestion: 'Tutar 0.01 ve üzeri olmalı',
    });
  }

  if (errorsByCategory.type_unknown.count > 0) {
    categorizedErrors.push({
      category: 'type_unknown',
      count: errorsByCategory.type_unknown.count,
      example: errorsByCategory.type_unknown.examples[0],
      examples: errorsByCategory.type_unknown.examples,
      rows: errorsByCategory.type_unknown.rows,
    });

    issues.push({
      type: 'error',
      category: 'type_unknown',
      messageKey: 'dataImport.validation.typeUnknown',
      message: `${errorsByCategory.type_unknown.count} işlemde bilinmeyen tip`,
      count: errorsByCategory.type_unknown.count,
      rows: errorsByCategory.type_unknown.rows.slice(0, 10),
      suggestion: 'GELİR, GİDER, TRANSFER vb. standart tipler kullanın',
    });
  }

  // Başlangıç bakiyelerini issues listesine EKLEMİYORUZ
  // Bunlar otomatik olarak entity bakiyelerine uygulanacak ve kullanıcıyı rahatsız etmeye gerek yok
  // Sadece istatistik için categorizedErrors'a ekliyoruz (UI'da gösterilmeyecek)
  if (errorsByCategory.starting_balance.count > 0) {
    categorizedErrors.push({
      category: 'starting_balance',
      count: errorsByCategory.starting_balance.count,
      rows: errorsByCategory.starting_balance.rows,
    });
  }

  // Kalite skorunu hesapla (0-100)
  const totalTransactions = preview.totalRows;
  const score = totalTransactions > 0
    ? Math.round((validCount / totalTransactions) * 100)
    : 0;

  return {
    score,
    validCount,
    warningCount,
    errorCount,
    issues,
    categorizedErrors,
  };
}

// ============================================================================
// FILE HASH (Tekrar Import Koruması)
// ============================================================================

/**
 * Dosya içeriğinden SHA-256 hash hesapla
 * File hash ile aynı dosyanın tekrar import edilmesini önler
 *
 * @param fileContent - Excel dosyasının ArrayBuffer içeriği
 * @returns SHA-256 hash string (hex format)
 */
export async function calculateFileHash(fileContent: ArrayBuffer): Promise<string> {
  try {
    // expo-crypto ile SHA-256 hash hesapla (React Native uyumlu)
    const base64Content = base64Encode(fileContent);
    const hash = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      base64Content
    );
    return hash;
  } catch (err) {
    if (__DEV__) {
      console.error('File hash calculation error:', err);
    }
    // Fallback: DJB2a hash (collision riski düşük, 32-bit yerine çift accumulator)
    try {
      const bytes = new Uint8Array(fileContent);
      let h1 = 5381;
      let h2 = 52711;
      for (let i = 0; i < bytes.length; i++) {
        h1 = ((h1 << 5) + h1 + bytes[i]) | 0;
        h2 = ((h2 << 5) + h2 + bytes[i]) | 0;
      }
      const hex1 = (h1 >>> 0).toString(16).padStart(8, '0');
      const hex2 = (h2 >>> 0).toString(16).padStart(8, '0');
      return `${hex1}${hex2}-${bytes.length.toString(16)}`;
    } catch {
      // Son çare: unique ID
      return `fallback-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
    }
  }
}
