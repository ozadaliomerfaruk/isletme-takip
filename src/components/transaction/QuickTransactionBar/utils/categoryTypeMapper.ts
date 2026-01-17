import { TransactionType } from '../types';

/**
 * Gelir (income) category transaction types.
 */
const GELIR_TYPES: TransactionType[] = [
  'gelir',
  'tahsilat',
  'satis',
  'satis_iade',
  'personel_tahsilat_tab',
  'personel_satis_tab',
];

/**
 * Gider (expense) category transaction types.
 */
const GIDER_TYPES: TransactionType[] = [
  'gider',
  'odeme',
  'transfer',
  'alis',
  'alis_iade',
  'personel_odeme_tab',
  'personel_gider_tab',
];

/**
 * Gets the category type (gelir/gider) based on transaction type.
 * Used to filter category picker options.
 */
export function getCategoryType(type: TransactionType): 'gelir' | 'gider' | undefined {
  if (GELIR_TYPES.includes(type)) return 'gelir';
  if (GIDER_TYPES.includes(type)) return 'gider';
  return undefined;
}

/**
 * Check if transaction type is income-related.
 */
export function isGelirType(type: TransactionType): boolean {
  return GELIR_TYPES.includes(type);
}

/**
 * Check if transaction type is expense-related.
 */
export function isGiderType(type: TransactionType): boolean {
  return GIDER_TYPES.includes(type);
}
