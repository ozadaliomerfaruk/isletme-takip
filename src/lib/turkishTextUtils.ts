import { BirimType } from '@/types/database';

/** Turkish character map for normalization (comparison only) */
const TR_CHAR_MAP: Record<string, string> = {
  'ç': 'c', 'Ç': 'c',
  'ğ': 'g', 'Ğ': 'g',
  'ı': 'i', 'I': 'i', 'İ': 'i',
  'ö': 'o', 'Ö': 'o',
  'ş': 's', 'Ş': 's',
  'ü': 'u', 'Ü': 'u',
};

/** Map of Turkish unit abbreviations to BirimType */
export const UNIT_MAP: Record<string, BirimType> = {
  'AD': 'adet', 'ADET': 'adet', 'ADT': 'adet',
  'KG': 'kg', 'KILO': 'kg', 'KILOGRAM': 'kg',
  'GR': 'gram', 'GRAM': 'gram', 'G': 'gram',
  'TON': 'ton',
  'LT': 'lt', 'LITRE': 'lt', 'L': 'lt',
  'ML': 'ml',
  'M': 'm', 'MT': 'm', 'METRE': 'm',
  'M2': 'm2',
  'M3': 'm3',
  'CM': 'cm',
  'PKT': 'paket', 'PAKET': 'paket', 'PK': 'paket',
  'KUTU': 'kutu', 'KT': 'kutu',
  'KOLI': 'koli', 'KL': 'koli',
  'CIFT': 'cift', 'ÇİFT': 'cift',
  'TAKIM': 'takim', 'TK': 'takim',
  'PORSIYON': 'porsiyon', 'PRS': 'porsiyon',
  'PARCA': 'parca', 'PRC': 'parca',
};

/**
 * Normalize Turkish characters for comparison (lowercase + accent strip).
 * "DOMATES SALÇASI" -> "domates salcasi"
 */
export function normalizeTurkish(text: string): string {
  return text
    .split('')
    .map(ch => TR_CHAR_MAP[ch] || ch.toLowerCase())
    .join('');
}

/**
 * Türkçe-DOĞRU büyük harfe çevirir (başlık/label'lar için). RN/Hermes
 * toLocaleUpperCase('tr') güvenilmez; kritik iki dönüşümü elle yaparız:
 * küçük i → İ (noktalı), ı → I (noktasız). Gerisi standart toUpperCase
 * (ç→Ç, ş→Ş, ğ→Ğ, ö→Ö, ü→Ü doğru). "Cari"→"CARİ", "Nakit"→"NAKİT", "Gelir"→"GELİR".
 * (textTransform:'uppercase' bu ikisini I/İ olarak bozardı.)
 */
export function upperTr(text: string): string {
  return text.replace(/i/g, 'İ').replace(/ı/g, 'I').toUpperCase();
}

/**
 * Türkçe-güvenli, büyük/küçük harf bağımsız "içeriyor mu" kontrolü.
 * Hem metni hem sorguyu normalizeTurkish ile katlayarak karşılaştırır; böylece
 * "diğ" / "DİĞ" / "DIG" sorguları "DİĞER" / "Diğer" / "DIGER" adlarını bulur
 * (plain .toLowerCase() noktalı İ'yi U+0307 ile bozar ve ğ/ç/ş katlamaz).
 * Boş/whitespace sorgu her zaman eşleşir (filtre yok sayılır).
 */
export function textIncludes(
  haystack: string | null | undefined,
  needle: string | null | undefined
): boolean {
  const q = normalizeTurkish((needle ?? '').trim());
  if (!q) return true;
  return normalizeTurkish(haystack ?? '').includes(q);
}

/**
 * Çok-kelimeli, sıra-bağımsız arama eşleşmesi (searchbar filtreleri için).
 * Kurallar:
 * - Sorgu boşluklardan token'lara bölünür; HER token metinde eşleşmeli ama SIRA ÖNEMSİZ:
 *   "gıda serdar" → "Serdar Gıda" ✓.
 * - TAMAMLANMIŞ token (arkasına boşluk konmuş ya da ardından başka token gelen)
 *   TAM KELİME olarak eşleşmeli: "ser " → "Ser Gıda" ✓ ama "Serdar Gıda" ✗
 *   (boşluk "bu kelime bitti" niyetidir; serdar, "ser" kelimesi değildir).
 * - Yazımı süren SON token (sorgu boşlukla bitmiyorsa) substring eşleşir:
 *   "ser" → ikisi de ✓ (textIncludes davranışı).
 * - Boş/whitespace sorgu her zaman eşleşir. Türkçe katlama textIncludes ile aynı
 *   (normalizeTurkish): "GIDA"/"gıda"/"gida" eşdeğer.
 */
export function searchMatchesTr(
  haystack: string | null | undefined,
  query: string | null | undefined
): boolean {
  const rawQuery = query ?? '';
  const trimmed = rawQuery.trim();
  if (!trimmed) return true;

  const text = normalizeTurkish(haystack ?? '');
  const tokens = normalizeTurkish(trimmed).split(/\s+/).filter(Boolean);
  const endsWithSpace = /\s$/.test(rawQuery);
  // Kelime listesi yalnız tam-kelime kontrolü gerektiğinde lazım
  let words: string[] | null = null;

  return tokens.every((token, i) => {
    const isComplete = endsWithSpace || i < tokens.length - 1;
    if (!isComplete) return text.includes(token);
    if (!words) words = text.split(/\s+/).filter(Boolean);
    return words.includes(token);
  });
}
