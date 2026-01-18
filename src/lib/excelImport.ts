/**
 * Excel Import Utility
 * DefterApp formatındaki Excel dosyalarını parse eder ve import için hazırlar
 */

import * as XLSX from 'xlsx';
import { formatDateTimeForDB, formatDateForDB } from './date';

// ============================================================================
// TYPES
// ============================================================================

export interface ParsedTransaction {
  date: string; // ISO format with timezone
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
  amount: number;
  isExpense: boolean;
  dateValid: boolean; // Tarih geçerli mi?
  dateError?: string; // Tarih hatası varsa açıklama
  amountValid: boolean; // Tutar geçerli mi?
  amountError?: string; // Tutar hatası varsa açıklama
  rowNumber: number; // Excel satır numarası
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
  errors: string[];
}

export interface AccountMapping {
  name: string;
  type: 'hesap' | 'cari' | 'personel';
  hesapType?: 'nakit' | 'banka' | 'kredi_karti' | 'birikim' | 'diger';
  cariType?: 'musteri' | 'tedarikci';
}

/**
 * KARŞI HESAP kolonundaki değeri parse et
 * Örnek: "Nakit (Kasa) [-58750 TRY]" → { name: "Nakit (Kasa)", amount: 58750, currency: "TRY" }
 * Transfer işlemlerinde hedef hesap ve TRY değeri bu formatta gelir
 */
export interface ParsedKarsiHesap {
  name: string;          // Hesap adı
  amount?: number;       // Tutar (parantez içindeki değer)
  currency?: string;     // Para birimi (TRY, USD, EUR, vs.)
}

export function parseKarsiHesap(value: string): ParsedKarsiHesap {
  if (!value) return { name: '' };

  const trimmed = value.trim();

  // Köşeli parantez içinde değer var mı kontrol et
  // Format: "Hesap Adı [-123,45 TRY]" veya "Hesap Adı [123.45]"
  const bracketRegex = /^(.+?)\s*\[([+-]?\d+(?:[.,]\d+)?)\s*([A-Z]{3})?\]$/;
  const match = trimmed.match(bracketRegex);

  if (match) {
    const name = match[1].trim();
    // Türkçe formatı destekle: 58.750,00 → 58750.00
    const amountStr = match[2].replace(/\./g, '').replace(',', '.');
    const amount = Math.abs(parseFloat(amountStr));
    const currency = match[3] || 'TRY';

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
// CONSTANTS
// ============================================================================

/**
 * DefterApp işlem tipi -> Defteri işlem tipi mapping
 */
export const TRANSACTION_TYPE_MAP: Record<string, string> = {
  // Cari işlemleri
  'ÖDEME': 'cari_odeme',
  'ODEME': 'cari_odeme',
  'TAHSILAT': 'cari_tahsilat',
  'TAHSİLAT': 'cari_tahsilat',

  // Gelir/Gider
  'SATIŞ': 'gelir',
  'SATIS': 'gelir',
  'GİDER': 'gider',
  'GIDER': 'gider',
  'GELİR': 'gelir',
  'GELIR': 'gelir',

  // Transfer
  'TRANSFER': 'transfer',

  // Personel işlemleri - tüm Türkçe karakter varyasyonları
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

  // Cari alış/satış
  'CARİ ALIŞ': 'cari_alis',
  'CARI ALIS': 'cari_alis',
  'CARİ SATIŞ': 'cari_satis',
  'CARI SATIS': 'cari_satis',

  // Cari iade işlemleri
  'CARİ ALIŞ İADE': 'cari_alis_iade',
  'CARI ALIS IADE': 'cari_alis_iade',
  'CARİ ALIŞ IADE': 'cari_alis_iade',
  'CARI ALIŞ İADE': 'cari_alis_iade',
  'ALIŞ İADE': 'cari_alis_iade',
  'ALIS IADE': 'cari_alis_iade',
  'PURCHASE RETURN': 'cari_alis_iade',

  'CARİ SATIŞ İADE': 'cari_satis_iade',
  'CARI SATIS IADE': 'cari_satis_iade',
  'CARİ SATIŞ IADE': 'cari_satis_iade',
  'CARI SATIŞ İADE': 'cari_satis_iade',
  'SATIŞ İADE': 'cari_satis_iade',
  'SATIS IADE': 'cari_satis_iade',
  'SALE RETURN': 'cari_satis_iade',
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
 */
export function excelDateToJS(excelDate: number): Date {
  // Excel'in epoch'u 1900-01-01 (25569 gün fark var Unix epoch'a)
  const millisecondsPerDay = 86400 * 1000;
  const excelEpochDiff = 25569;

  // Tam gün kısmı
  const days = Math.floor(excelDate);
  // Gün içi saat kısmı (kesirli kısım)
  const timeFraction = excelDate - days;

  // Unix timestamp hesapla
  const unixTimestamp = (days - excelEpochDiff) * millisecondsPerDay;
  const timeOfDay = timeFraction * millisecondsPerDay;

  return new Date(unixTimestamp + timeOfDay);
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

    // Normalize edilmiş ASCII değerleri ile karşılaştır
    switch (header) {
      case 'TARIH':
        indices.tarih = index;
        break;
      case 'ISLEM TIPI':
        indices.islemTipi = index;
        break;
      case 'ACIKLAMA':
        indices.aciklama = index;
        break;
      case 'KATEGORI':
      case 'ALT KATEGORI':
      case 'CATEGORY':
        indices.kategori = index;
        break;
      case 'HESAP':
        indices.hesap = index;
        break;
      case 'PERSONEL':
        indices.personel = index;
        break;
      case 'TEDARIKCI':
        indices.tedarikci = index;
        break;
      case 'MUSTERI':
        indices.musteri = index;
        break;
      case 'KARSI HESAP':
        indices.karsiHesap = index;
        break;
      case 'MIKTAR':
        indices.miktar = index;
        break;
      case 'BIRIM':
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
    errors.push('Excel dosyasında başlık satırı bulunamadı (TARIH, İŞLEM TIPI, HESAP, MİKTAR zorunlu)');
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
      errors,
    };
  }

  const cols = columnIndices;

  // Data rows'ları parse et
  let minDate: Date | null = null;
  let maxDate: Date | null = null;

  for (let i = headerRowIndex + 1; i < rawData.length; i++) {
    const row = rawData[i];
    const rowNumber = i + 1; // Excel satır numarası (1-based, header dahil)

    // Boş satırları atla
    if (!row || row.length < 3) continue;

    try {
      const rawDate = row[cols.tarih];
      const type = row[cols.islemTipi]?.toString().trim().toUpperCase();
      const description = cols.aciklama >= 0 ? row[cols.aciklama]?.toString().trim() || null : null;
      const category = cols.kategori >= 0 ? row[cols.kategori]?.toString().trim() || null : null;
      const account = row[cols.hesap]?.toString().trim();
      const personel = cols.personel >= 0 ? row[cols.personel]?.toString().trim() || null : null;

      // Debug: İlk 5 satır için kategori değerini logla
      if (__DEV__ && i <= headerRowIndex + 5) {
        console.log(`Row ${rowNumber}: kategori column index=${cols.kategori}, raw value="${row[cols.kategori]}", extracted="${category}"`);
      }
      const tedarikci = cols.tedarikci >= 0 ? row[cols.tedarikci]?.toString().trim() || null : null;
      const musteri = cols.musteri >= 0 ? row[cols.musteri]?.toString().trim() || null : null;

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

      // Tutar dönüşümü ve validasyonu
      let amount = 0;
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
        } else if (parsedAmount < 0) {
          // Negatif tutarlar mutlak değer olarak alınır
          amount = Math.abs(parsedAmount);
        } else {
          amount = parsedAmount;
        }
      }

      // Gerekli alanları kontrol et
      // NOT: TEDARİKÇİ veya MÜŞTERİ varsa HESAP zorunlu DEĞİL (cari_alis/cari_satis için)
      const hasCariEntity = tedarikci || musteri;
      if (!rawDate || !type) {
        continue;
      }
      // HESAP kontrolü: Sadece cari entity yoksa zorunlu
      if (!account && !hasCariEntity) {
        continue;
      }

      // Tarih dönüşümü (Excel serial veya string olabilir)
      let jsDate: Date | null = null;
      let dateValid = true;
      let dateError: string | undefined;

      if (typeof rawDate === 'number') {
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
      let mappedType = TRANSACTION_TYPE_MAP[type] || 'gider';
      const originalMappedType = mappedType;

      // Context-aware type correction:
      // 1. KARŞI HESAP doluysa → transfer (hesaplar arası)
      if (karsiHesap) {
        mappedType = 'transfer';
      }
      // 2. PERSONEL kolonu doluysa → personel işlemi
      else if (personel && !tedarikci && !musteri) {
        if (mappedType === 'gider') {
          mappedType = 'personel_gider';
        } else if (mappedType === 'cari_odeme') {
          mappedType = 'personel_odeme';
        } else if (mappedType === 'cari_tahsilat') {
          mappedType = 'personel_tahsilat';
        }
      }
      // 3. TEDARİKÇİ kolonu doluysa → cari işlemi
      else if (tedarikci && !musteri) {
        if (mappedType === 'gider') {
          mappedType = 'cari_alis';
        }
        // cari_odeme zaten TRANSACTION_TYPE_MAP'ten geliyor
      }
      // 4. MÜŞTERİ kolonu doluysa → cari işlemi
      else if (musteri && !tedarikci) {
        if (mappedType === 'gelir') {
          mappedType = 'cari_satis';
        }
        // cari_tahsilat zaten TRANSACTION_TYPE_MAP'ten geliyor
      }
      // 5. Hiçbir entity kolonu dolmamışsa → salt gelir/gider (hesap işlemi)
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
      const isoDate = jsDate ? formatDateTimeForDB(jsDate) : '';

      // İşlem tipine göre tutarın yönünü belirle (negatif/pozitif yazmaya gerek yok)
      const isExpense = getIsExpenseByType(mappedType);

      transactions.push({
        date: isoDate,
        type,
        mappedType,
        description,
        category,
        account,
        personel,
        tedarikci,
        musteri,
        karsiHesap,
        karsiHesapRaw,
        karsiHesapAmount,
        karsiHesapCurrency,
        amount: Math.abs(amount),
        isExpense,
        dateValid,
        dateError,
        amountValid,
        amountError,
        rowNumber,
      });
    } catch (err) {
      errors.push(`Satır ${i + 1}: Parse hatası - ${err}`);
    }
  }

  // Geçerli/geçersiz tarih ve tutar sayıları
  const validRows = transactions.filter(t => t.dateValid && t.amountValid).length;
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
 * Tüm hesapları otomatik sınıflandır
 * Yeni şablon formatında kolonlar zaten ayrı olduğu için sadece HESAP ve KARŞI HESAP kolonlarını sınıflandırır
 */
export function autoClassifyAccounts(
  preview: ImportPreview
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

  return mappings;
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
    // Web Crypto API kullan (expo-crypto yerine daha evrensel)
    // React Native'de crypto.subtle yoksa basit hash kullan
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const hashBuffer = await crypto.subtle.digest('SHA-256', fileContent);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    // Fallback: Basit hash (expo-crypto kullanılamıyorsa)
    // Dosya boyutu + ilk ve son 1000 byte'ın toplamı
    const bytes = new Uint8Array(fileContent);
    let hash = bytes.length;

    // İlk 1000 byte
    const firstChunk = Math.min(1000, bytes.length);
    for (let i = 0; i < firstChunk; i++) {
      hash = ((hash << 5) - hash + bytes[i]) | 0;
    }

    // Son 1000 byte
    const lastStart = Math.max(0, bytes.length - 1000);
    for (let i = lastStart; i < bytes.length; i++) {
      hash = ((hash << 5) - hash + bytes[i]) | 0;
    }

    return Math.abs(hash).toString(16).padStart(16, '0');
  } catch (err) {
    if (__DEV__) {
      console.error('File hash calculation error:', err);
    }
    // Hata durumunda timestamp-based benzersiz ID döndür
    return `fallback-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
  }
}
