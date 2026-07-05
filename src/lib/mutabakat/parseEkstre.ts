/**
 * Ekstre parser — Excel/CSV ArrayBuffer → ParsedEkstre. SAF (RN importu yok).
 *
 * Deterministik kurallar:
 * - parseCurrency KULLANILMAZ (uygulama locale'ine bağlı; dosyanın locale'i
 *   bilinmiyor). Sayı hücreleri: son görülen ayraç ondalıktır kuralının
 *   locale'siz kopyası + binlik kalıbı testi.
 * - DEVIR/YEKÛN/TOPLAM regex'ini tutan satır ASLA veri satırı olamaz
 *   (nakli yekûn'u hareket saymak klasik çift-sayım hatasıdır).
 * - Bakiye hücresindeki B/A eki işarete çevrilir (B=+, A=−, onların perspektifi).
 */

import * as XLSX from 'xlsx';
import {
  epochDayOf,
  excelSerialToDate,
  normalizeHeader,
  parseDateCell,
  toDateKey,
  toKurus,
} from './helpers';
import { EkstreSatiri, MutabakatParseError, MutabakatUyari, ParsedEkstre } from './types';

type CellValue = string | number | boolean | Date | null | undefined;

// ============================================================================
// KOLON EŞANLAMLILARI (normalizeHeader'dan geçmiş halleriyle)
// ============================================================================

const COLUMN_SYNONYMS: Record<string, string[]> = {
  // Mojibake varyantları (TARH, AIKLAMA, BOR) Windows-1254 CSV bozulması içindir
  tarih: ['TARIH', 'DATE', 'ISLEMTARIHI', 'FISTARIHI', 'EVRAKTARIHI', 'BELGETARIHI', 'TARH'],
  aciklama: ['ACIKLAMA', 'IZAHAT', 'DESCRIPTION', 'DETAY', 'ACIKLAMAUNVAN', 'AIKLAMA'],
  belgeNo: [
    'BELGENO', 'EVRAKNO', 'FISNO', 'FATURANO', 'BELGENUMARASI', 'EVRAKNUMARASI',
    'SERINO', 'DOCNO', 'DOCUMENTNO', 'FISNUMARASI',
  ],
  borc: ['BORC', 'BORCTUTARI', 'BORCTL', 'DEBIT', 'BOR'],
  alacak: ['ALACAK', 'ALACAKTUTARI', 'ALACAKTL', 'CREDIT'],
  bakiye: ['BAKIYE', 'KALAN', 'BALANCE', 'KUMULATIFBAKIYE', 'YURUYENBAKIYE'],
  // Ayrı borç/alacak gösterge kolonu ("B/A")
  baGosterge: ['B/A', 'BA', 'BORCALACAK'],
};

const SUMMARY_RE = /(DEVIR|DEVREDEN|ACILIS|ONCEKIDONEM|NAKLIYEKUN|TASINAN|YEKUN|TOPLAM)/;
const DEVIR_RE = /(DEVIR|DEVREDEN|ACILIS|ONCEKIDONEM)/;
const DIP_TOPLAM_RE = /(TOPLAM|YEKUN)/;

interface ColumnIndices {
  tarih: number;
  aciklama: number;
  belgeNo: number;
  borc: number;
  alacak: number;
  bakiye: number;
  baGosterge: number;
}

function findColumns(row: CellValue[]): ColumnIndices | null {
  const indices: ColumnIndices = {
    tarih: -1, aciklama: -1, belgeNo: -1, borc: -1, alacak: -1, bakiye: -1, baGosterge: -1,
  };
  for (let i = 0; i < row.length; i++) {
    const cell = row[i];
    if (cell === null || cell === undefined || typeof cell === 'number') continue;
    const normalized = normalizeHeader(String(cell));
    if (!normalized) continue;
    // En uzun sinonim kazanır: "BORCALACAK" (B/A kolonu) "BORC"a kapılmasın
    let bestKey: keyof ColumnIndices | null = null;
    let bestLen = 0;
    for (const key of Object.keys(COLUMN_SYNONYMS) as (keyof ColumnIndices)[]) {
      for (const syn of COLUMN_SYNONYMS[key]) {
        if (normalized === syn && syn.length > bestLen) {
          bestKey = key;
          bestLen = syn.length;
        }
      }
    }
    if (bestKey && indices[bestKey] === -1) indices[bestKey] = i;
  }
  if (indices.tarih !== -1 && indices.borc !== -1 && indices.alacak !== -1) return indices;
  return null;
}

// ============================================================================
// HÜCRE PARSE
// ============================================================================

interface AmountParse {
  kurus: number | null;
  /** Bakiye hücresindeki B/A eki: 'B' | 'A' | null */
  suffix: 'B' | 'A' | null;
}

/** Locale'siz, deterministik tutar parse. Negatif değerleri korur. */
export function parseAmountCell(cell: CellValue): AmountParse {
  if (cell === null || cell === undefined) return { kurus: null, suffix: null };
  if (typeof cell === 'number') {
    return { kurus: isFinite(cell) ? toKurus(cell) : null, suffix: null };
  }
  if (typeof cell !== 'string') return { kurus: null, suffix: null };

  let s = cell.trim();
  if (!s || s === '-' || s === '—') return { kurus: null, suffix: null };

  // B/A eki: "1.250,00 B" / "1.250,00 (A)"
  let suffix: 'B' | 'A' | null = null;
  const suffixMatch = s.match(/[\s]*\(?([BA])\)?\s*$/);
  if (suffixMatch && /\d/.test(s)) {
    suffix = suffixMatch[1] as 'B' | 'A';
    s = s.slice(0, suffixMatch.index).trim();
  }

  // Parantezli negatif: (1.234,56)
  let negative = false;
  const paren = s.match(/^\((.+)\)$/);
  if (paren) {
    negative = true;
    s = paren[1].trim();
  }
  if (s.startsWith('-')) {
    negative = true;
    s = s.slice(1).trim();
  }

  // Para birimi sembolleri/etiketleri ve boşluklar
  s = s.replace(/[₺$€£]/g, '').replace(/\b(TL|TRY|USD|EUR|GBP)\b/gi, '').replace(/\s/g, '');
  if (!s || !/\d/.test(s)) return { kurus: null, suffix: null };

  if (s.includes('.') && s.includes(',')) {
    // Son görülen ayraç ondalıktır
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (s.includes(',')) {
    // Gerçek binlik kalıbı (1,000 / 12,345,678) ise binlik, değilse ondalık
    s = /^\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.');
  } else if (s.includes('.')) {
    if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
    // aksi halde nokta ondalık — olduğu gibi bırak
  }

  const value = parseFloat(s);
  if (isNaN(value)) return { kurus: null, suffix: null };
  return { kurus: toKurus(negative ? -value : value), suffix };
}

function parseDateValue(cell: CellValue): string | null {
  if (cell === null || cell === undefined) return null;
  if (typeof cell === 'number' && isFinite(cell) && cell > 0) {
    return toDateKey(excelSerialToDate(cell));
  }
  if (cell instanceof Date) {
    return isNaN(cell.getTime()) ? null : toDateKey(cell);
  }
  if (typeof cell === 'string') return parseDateCell(cell);
  return null;
}

function cellText(cell: CellValue): string {
  if (cell === null || cell === undefined) return '';
  if (typeof cell === 'number') {
    // Excel sayısal belge no'ları ("12345.0") temiz yazılsın
    return Number.isInteger(cell) ? String(cell) : String(cell);
  }
  return String(cell).trim();
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * CSV baytlarını metne çevirir: önce UTF-8 (BOM'lu/BOM'suz) denenir; geçersiz
 * UTF-8 ise Windows-1254 (TR muhasebe programlarının tipik ANSI çıktısı) varsayılır.
 * TextDecoder KULLANILMAZ — Hermes'te güvenilir değil.
 */
function decodeCsvText(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const start = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? 3 : 0;
  let out = '';
  let valid = true;
  for (let i = start; i < bytes.length; i++) {
    const b = bytes[i];
    if (b < 0x80) {
      out += String.fromCharCode(b);
    } else if (b >= 0xc2 && b <= 0xdf && i + 1 < bytes.length && (bytes[i + 1] & 0xc0) === 0x80) {
      out += String.fromCharCode(((b & 0x1f) << 6) | (bytes[++i] & 0x3f));
    } else if (b >= 0xe0 && b <= 0xef && i + 2 < bytes.length && (bytes[i + 1] & 0xc0) === 0x80 && (bytes[i + 2] & 0xc0) === 0x80) {
      out += String.fromCharCode(((b & 0x0f) << 12) | ((bytes[i + 1] & 0x3f) << 6) | (bytes[i + 2] & 0x3f));
      i += 2;
    } else {
      valid = false;
      break;
    }
  }
  if (valid) return out;
  // Windows-1254: Latin-1'den yalnız 6 Türkçe pozisyon farklıdır (Ç/Ö/Ü zaten Latin-1'le aynı)
  const W1254: Record<number, string> = { 0xd0: 'Ğ', 0xdd: 'İ', 0xde: 'Ş', 0xf0: 'ğ', 0xfd: 'ı', 0xfe: 'ş' };
  let ansi = '';
  for (let i = start; i < bytes.length; i++) {
    const b = bytes[i];
    ansi += b < 0x80 ? String.fromCharCode(b) : (W1254[b] ?? String.fromCharCode(b));
  }
  return ansi;
}

export function parseEkstreFile(fileBuffer: ArrayBuffer): ParsedEkstre {
  let rawData: CellValue[][];
  try {
    const head = new Uint8Array(fileBuffer.slice(0, 4));
    const isZip = head[0] === 0x50 && head[1] === 0x4b; // .xlsx
    const isCfb = head[0] === 0xd0 && head[1] === 0xcf; // eski .xls
    // CSV, SheetJS'in oto-tiplemesinden KORUNARAK okunur (raw:true): aksi halde
    // "02.06.2026" ay/gün ters Date'e, "1.000,00" bozuk sayıya çevriliyor.
    const workbook = isZip || isCfb
      ? XLSX.read(fileBuffer, { type: 'array' })
      : XLSX.read(decodeCsvText(fileBuffer), { type: 'string', raw: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet) throw new MutabakatParseError('EMPTY_FILE');
    rawData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null }) as CellValue[][];
  } catch (e) {
    if (e instanceof MutabakatParseError) throw e;
    throw new MutabakatParseError('READ_ERROR', e instanceof Error ? e.message : String(e));
  }
  if (!rawData || rawData.length === 0) throw new MutabakatParseError('EMPTY_FILE');

  // Başlık satırı: ilk 20 satır taranır (excelImport.ts deseni)
  let headerRowIndex = -1;
  let cols: ColumnIndices | null = null;
  for (let i = 0; i < Math.min(20, rawData.length); i++) {
    cols = findColumns(rawData[i] ?? []);
    if (cols) {
      headerRowIndex = i;
      break;
    }
  }
  if (!cols || headerRowIndex === -1) {
    const taranan = rawData
      .slice(0, 5)
      .map((r) => (r ?? []).map((c) => cellText(c)).filter(Boolean).join(' | '))
      .filter(Boolean)
      .join(' // ');
    throw new MutabakatParseError('HEADER_NOT_FOUND', taranan);
  }

  // Başlık öncesi antet metni (unvan/işletme adı — dosya doğrulama isim sinyali).
  // İlk 10 satırla sınırlı; sayısal hücreler atlanır.
  const onBaslikMetni = rawData
    .slice(0, Math.min(headerRowIndex, 10))
    .flatMap((r) => (r ?? []).filter((c) => typeof c === 'string').map((c) => String(c).trim()))
    .filter(Boolean)
    .join(' ');

  const rows: EkstreSatiri[] = [];
  const uyarilar: MutabakatUyari[] = [];
  let skippedDataRows = 0;
  let devir: ParsedEkstre['devir'] = null;
  let dipToplam: ParsedEkstre['dipToplam'] = null;
  let karmaSatirSayisi = 0;
  let negatifSatirSayisi = 0;

  for (let i = headerRowIndex + 1; i < rawData.length; i++) {
    const raw = rawData[i] ?? [];
    if (raw.every((c) => c === null || c === undefined || cellText(c) === '')) continue;

    const rowIndex = i + 1; // 1-bazlı dosya satırı

    const borcParse = parseAmountCell(raw[cols.borc]);
    const alacakParse = parseAmountCell(raw[cols.alacak]);
    let debitKurus = borcParse.kurus;
    let creditKurus = alacakParse.kurus;

    // Özet satırı sınıflandırması: metin hücrelerinin birleşimi üzerinden.
    // Bu regex'i tutan satır ASLA veri satırı olamaz.
    const rowText = normalizeHeader(
      raw
        .filter((c) => typeof c === 'string')
        .map((c) => String(c))
        .join(' '),
    );
    if (SUMMARY_RE.test(rowText)) {
      if (DEVIR_RE.test(rowText) && devir === null && rows.length === 0) {
        // Devir iki kolonda da dolu gelebilir (kümüle taşıma) — ham değerler saklanır,
        // net'i motor alır. Yalnız bakiye kolonu doluysa B/A ekinden yön çıkar.
        let d = Math.max(debitKurus ?? 0, 0);
        let c = Math.max(creditKurus ?? 0, 0);
        if (d === 0 && c === 0 && cols.bakiye !== -1) {
          const bak = parseAmountCell(raw[cols.bakiye]);
          if (bak.kurus !== null) {
            const signed = bak.suffix === 'A' ? -Math.abs(bak.kurus) : bak.suffix === 'B' ? Math.abs(bak.kurus) : bak.kurus;
            if (signed >= 0) d = signed;
            else c = -signed;
          }
        }
        devir = { debitKurus: d, creditKurus: c };
      } else if (DIP_TOPLAM_RE.test(rowText) && (debitKurus !== null || creditKurus !== null)) {
        // Birden çok toplam/yekûn olabilir — SONUNCUSU dip toplamdır
        dipToplam = { debitKurus: debitKurus ?? 0, creditKurus: creditKurus ?? 0 };
      }
      continue;
    }

    const hasAmount = (debitKurus !== null && debitKurus !== 0) || (creditKurus !== null && creditKurus !== 0);
    const date = parseDateValue(raw[cols.tarih]);
    if (!date) {
      // Tutarı olan ama tarihi okunamayan satır: veri kaybı — verdikt kilidi
      if (hasAmount) {
        skippedDataRows++;
      }
      continue;
    }
    if (!hasAmount) continue; // tutarsız satır (not/alt açıklama) — veri değil

    // Negatif tutar: karşı sütuna normalize (iade/düzeltme ters sütun yerine
    // eksiyle yazılmış olabilir)
    if (debitKurus !== null && debitKurus < 0) {
      creditKurus = (creditKurus ?? 0) + -debitKurus;
      debitKurus = null;
      negatifSatirSayisi++;
    }
    if (creditKurus !== null && creditKurus < 0) {
      debitKurus = (debitKurus ?? 0) + -creditKurus;
      creditKurus = null;
      negatifSatirSayisi++;
    }
    // Hem borç hem alacak dolu normal satır → nete indirgenir
    if (debitKurus && creditKurus) {
      const net = debitKurus - creditKurus;
      debitKurus = net > 0 ? net : null;
      creditKurus = net < 0 ? -net : null;
      karmaSatirSayisi++;
      if (net === 0) continue;
    }

    // Bakiye: B/A eki işarete çevrilir (B=+, A=−; onların perspektifi)
    let balanceKurus: number | null = null;
    let balanceSignResolved = false;
    if (cols.bakiye !== -1) {
      const bak = parseAmountCell(raw[cols.bakiye]);
      if (bak.kurus !== null) {
        let suffix = bak.suffix;
        if (!suffix && cols.baGosterge !== -1) {
          const g = normalizeHeader(cellText(raw[cols.baGosterge]));
          if (g === 'B' || g === 'A') suffix = g;
        }
        if (suffix) {
          balanceKurus = suffix === 'B' ? Math.abs(bak.kurus) : -Math.abs(bak.kurus);
          balanceSignResolved = true;
        } else {
          balanceKurus = bak.kurus;
        }
      }
    }

    rows.push({
      rowIndex,
      date,
      epochDay: epochDayOf(date),
      description: cols.aciklama !== -1 ? cellText(raw[cols.aciklama]) : '',
      belgeNo: cols.belgeNo !== -1 ? cellText(raw[cols.belgeNo]) || null : null,
      debitKurus: debitKurus === 0 ? null : debitKurus,
      creditKurus: creditKurus === 0 ? null : creditKurus,
      balanceKurus,
      balanceSignResolved,
    });
  }

  if (rows.length === 0) throw new MutabakatParseError('EMPTY_FILE');

  if (skippedDataRows > 0) uyarilar.push({ code: 'atlanan_satirlar', params: { count: skippedDataRows } });
  if (karmaSatirSayisi > 0) uyarilar.push({ code: 'karma_satir_netlendi', params: { count: karmaSatirSayisi } });
  if (negatifSatirSayisi > 0) uyarilar.push({ code: 'negatif_tutar_cevrildi', params: { count: negatifSatirSayisi } });

  return {
    rows,
    headerRowIndex,
    onBaslikMetni,
    hasBelgeNo: cols.belgeNo !== -1 && rows.some((r) => r.belgeNo !== null),
    hasBalance: cols.bakiye !== -1 && rows.some((r) => r.balanceKurus !== null),
    devir,
    dipToplam,
    uyarilar,
    skippedDataRows,
  };
}
