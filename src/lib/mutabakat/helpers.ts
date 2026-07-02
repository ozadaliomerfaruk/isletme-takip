/**
 * Mutabakat — Saf yardımcılar
 *
 * DİKKAT: Buradaki normalize/tarih fonksiyonları excelImport.ts ve
 * turkishTextUtils.ts'deki muadillerinin BİLİNÇLİ kopyalarıdır: o dosyalar
 * expo-crypto / useSettings / i18n import ettiğinden bu modüle alınamazlar
 * (mutabakat çekirdeği node ile cihazsız test edilir). Kopyalar ekstre
 * parse'ına özel eklerle (Û/Â/Î, DD-MM-YYYY) ayrışmıştır — ortak dosyaya
 * geri birleştirmeyin.
 */

// ============================================================================
// KURUŞ ARİTMETİĞİ
// ============================================================================

/** Para tutarını kuruş tamsayısına çevir (IEEE754-güvenli) */
export function toKurus(value: number): number {
  if (isNaN(value) || !isFinite(value)) return 0;
  const sign = value < 0 ? -1 : 1;
  return sign * Math.round(parseFloat(Math.abs(value) + 'e2'));
}

/** Kuruş tamsayısını TL sayısına çevir (gösterim için) */
export function kurusToTl(kurus: number): number {
  return kurus / 100;
}

// ============================================================================
// TARİH
// ============================================================================

/** 'YYYY-MM-DD' → 1970-bazlı gün tamsayısı (gün farkı hesapları için) */
export function epochDayOf(dateStr: string): number {
  const y = parseInt(dateStr.slice(0, 4), 10);
  const m = parseInt(dateStr.slice(5, 7), 10);
  const d = parseInt(dateStr.slice(8, 10), 10);
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
}

/** Yerel Date → 'YYYY-MM-DD' (timezone-safe, date.ts formatDateForDB'nin saf kopyası) */
export function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Excel serial date → yerel Date (excelImport.ts excelDateToJS'in saf kopyası)
 */
export function excelSerialToDate(excelDate: number): Date {
  const excelEpochDiff = 25569;
  const days = Math.floor(excelDate);
  const daysSince1970 = days - excelEpochDiff;
  const tempDate = new Date(Date.UTC(1970, 0, 1 + daysSince1970));
  return new Date(tempDate.getUTCFullYear(), tempDate.getUTCMonth(), tempDate.getUTCDate());
}

/**
 * String tarihi 'YYYY-MM-DD' anahtarına çevir; tanınmazsa null.
 * Desteklenen: YYYY-MM-DD · DD/MM/YYYY · DD.MM.YYYY · DD-MM-YYYY (saat eki opsiyonel)
 */
export function parseDateCell(dateStr: string): string | null {
  const cleaned = dateStr.trim();
  // Sıra önemli: YYYY-MM-DD, DD-MM-YYYY'den önce denenmeli (ikisi de '-' kullanır)
  const patterns: Array<{ re: RegExp; y: number; m: number; d: number }> = [
    { re: /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s]+\d{1,2}:\d{1,2}(?::\d{1,2})?)?$/, y: 1, m: 2, d: 3 },
    { re: /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+\d{1,2}:\d{1,2}(?::\d{1,2})?)?$/, y: 3, m: 2, d: 1 },
    { re: /^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+\d{1,2}:\d{1,2}(?::\d{1,2})?)?$/, y: 3, m: 2, d: 1 },
    { re: /^(\d{1,2})-(\d{1,2})-(\d{4})(?:\s+\d{1,2}:\d{1,2}(?::\d{1,2})?)?$/, y: 3, m: 2, d: 1 },
  ];
  for (const p of patterns) {
    const match = cleaned.match(p.re);
    if (!match) continue;
    const year = parseInt(match[p.y], 10);
    const month = parseInt(match[p.m], 10);
    const day = parseInt(match[p.d], 10);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    if (year < 1900 || year > 2100) return null;
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  return null;
}

// ============================================================================
// METİN NORMALİZE
// ============================================================================

/**
 * Başlık/anahtar kelime karşılaştırması için agresif normalize:
 * Türkçe karakterler ASCII'ye katlanır (Û/Â/Î şapkalıları dahil — "YEKÛN"),
 * büyük harfe çevrilir, A-Z ve '/' dışındaki HER ŞEY atılır. Windows-1254
 * CSV'lerde bozulan baytlar da böylece elenir ("BORÇ (TL)" → "BORTL" değil
 * "BORCTL"; bozuksa "BORTL" → sinonim listesinde mojibake varyantı var.)
 */
export function normalizeHeader(text: string): string {
  return text
    .replace(/İ/g, 'I').replace(/ı/g, 'i')
    .replace(/Ğ/g, 'G').replace(/ğ/g, 'g')
    .replace(/Ü/g, 'U').replace(/ü/g, 'u')
    .replace(/Ş/g, 'S').replace(/ş/g, 's')
    .replace(/Ö/g, 'O').replace(/ö/g, 'o')
    .replace(/Ç/g, 'C').replace(/ç/g, 'c')
    .replace(/[ÛÜ]/g, 'U').replace(/[ûü]/g, 'u')
    .replace(/[ÂÄ]/g, 'A').replace(/[âä]/g, 'a')
    .replace(/[ÎÏ]/g, 'I').replace(/[îï]/g, 'i')
    .toUpperCase()
    .replace(/[^A-Z/]/g, '');
}

/**
 * Açıklama içinde belge-no araması için Türkçe-katlamalı includes.
 * turkishTextUtils.textIncludes'tan fark: BOŞ SORGU false DÖNER
 * (oradaki `!q → true` davranışı burada sahte eşleşme üretirdi).
 */
export function descriptionIncludes(haystack: string | null | undefined, needle: string): boolean {
  const q = foldTurkish(needle.trim());
  if (!q) return false;
  return foldTurkish(haystack ?? '').includes(q);
}

function foldTurkish(text: string): string {
  return text
    .replace(/İ/g, 'i').replace(/I/g, 'i').replace(/ı/g, 'i')
    .replace(/Ğ/g, 'g').replace(/ğ/g, 'g')
    .replace(/Ü/g, 'u').replace(/ü/g, 'u')
    .replace(/Ş/g, 's').replace(/ş/g, 's')
    .replace(/Ö/g, 'o').replace(/ö/g, 'o')
    .replace(/Ç/g, 'c').replace(/ç/g, 'c')
    .toLowerCase();
}

/** Eşleşme aşaması 3 için geçerli belge no: ≥3 karakter ve en az bir rakam */
export function isUsableBelgeNo(belgeNo: string | null): belgeNo is string {
  if (!belgeNo) return false;
  const trimmed = belgeNo.trim();
  return trimmed.length >= 3 && /\d/.test(trimmed);
}
