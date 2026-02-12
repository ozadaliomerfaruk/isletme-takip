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
