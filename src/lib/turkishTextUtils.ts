import { BirimType, KdvOrani } from '@/types/database';

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
 * Parse a Turkish-format number string to a JS number.
 * Handles: "1.234,56" | "1234,56" | "1,234.56" | "1234.56" | "₺1.234,56"
 * Strips: currency symbols, whitespace, "TL"
 * Returns null if unparseable.
 */
export function parseTrNumber(input: string): number | null {
  if (!input || typeof input !== 'string') return null;

  // Strip currency symbols, "TL", whitespace, asterisks
  let cleaned = input
    .replace(/[₺$€]/g, '')
    .replace(/\bTL\b/gi, '')
    .replace(/[*\s]/g, '')
    .trim();

  if (!cleaned) return null;

  // Handle negative
  const isNegative = cleaned.startsWith('-');
  if (isNegative) cleaned = cleaned.slice(1);

  if (cleaned.includes('.') && cleaned.includes(',')) {
    // Determine which is the decimal separator (last one wins)
    const lastDot = cleaned.lastIndexOf('.');
    const lastComma = cleaned.lastIndexOf(',');

    if (lastComma > lastDot) {
      // Turkish: "1.234,56" -> dots are thousands, comma is decimal
      cleaned = cleaned.replace(/\./g, '').replace(',', '.');
    } else {
      // International: "1,234.56" -> commas are thousands, dot is decimal
      cleaned = cleaned.replace(/,/g, '');
    }
  } else if (cleaned.includes(',')) {
    // "1234,56" or "1,234" — check if it's a thousands separator
    const commaIndex = cleaned.indexOf(',');
    const afterComma = cleaned.length - commaIndex - 1;
    if (afterComma === 3 && !cleaned.includes(',', commaIndex + 1)) {
      // Likely thousands separator: "1,234"
      cleaned = cleaned.replace(',', '');
    } else {
      // Decimal separator: "1234,56"
      cleaned = cleaned.replace(',', '.');
    }
  } else if (cleaned.includes('.')) {
    // "5.000" or "5.50" — check context
    const dotIndex = cleaned.lastIndexOf('.');
    const afterDot = cleaned.length - dotIndex - 1;
    if (afterDot === 3 && /^\d+\.\d{3}$/.test(cleaned)) {
      // Turkish thousands separator: "5.000"
      cleaned = cleaned.replace(/\./g, '');
    }
    // Otherwise decimal: "5.50"
  }

  const result = parseFloat(cleaned);
  if (isNaN(result)) return null;
  return isNegative ? -result : result;
}

/**
 * Extract all number-like tokens from a string.
 * "3 AD x 125,50" -> [3, 125.50]
 */
export function extractNumbers(text: string): number[] {
  // Match Turkish/international number patterns
  const pattern = /[₺$€]?\s*-?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?|\d+(?:[.,]\d+)?/g;
  const matches = text.match(pattern);
  if (!matches) return [];

  const results: number[] = [];
  for (const m of matches) {
    const num = parseTrNumber(m);
    if (num !== null && num >= 0) {
      results.push(num);
    }
  }
  return results;
}

/**
 * Detect Turkish unit strings and map to BirimType.
 * Returns null if no recognized unit.
 */
export function detectUnit(token: string): BirimType | null {
  const upper = token.toUpperCase().trim();
  return UNIT_MAP[upper] || null;
}

/** KDV rate patterns */
const KDV_PATTERNS = [
  /[%]\s*(\d{1,2})/,        // %1, %10, %20
  /KDV\s*[%]?\s*(\d{1,2})/i, // KDV %10, KDV 10
  /[%](\d{1,2})\s*KDV/i,     // %10 KDV
];

const VALID_KDV_RATES: KdvOrani[] = [0, 1, 10, 20];

/**
 * Detect KDV rate from text.
 * "%1", "%10", "%20" -> 1, 10, 20
 */
export function detectKdvRate(text: string): KdvOrani | null {
  for (const pattern of KDV_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      const rate = parseInt(match[1], 10);
      if (VALID_KDV_RATES.includes(rate as KdvOrani)) {
        return rate as KdvOrani;
      }
    }
  }
  return null;
}

/**
 * Merge OCR lines that were split across physical lines.
 * Heuristic: if a line has no numbers and the next line starts with numbers, merge them.
 */
export function mergeFragmentedLines(lines: string[]): string[] {
  if (lines.length <= 1) return [...lines];

  const result: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const current = lines[i].trim();
    if (!current) {
      i++;
      continue;
    }

    // Check if current line has no numbers and next line has numbers
    const currentHasNumbers = /\d/.test(current);
    const nextLine = i + 1 < lines.length ? lines[i + 1].trim() : null;

    if (!currentHasNumbers && nextLine && /\d/.test(nextLine)) {
      // Current line is likely a product name, next line has the numbers
      result.push(`${current} ${nextLine}`);
      i += 2;
    } else {
      result.push(current);
      i++;
    }
  }

  return result;
}
