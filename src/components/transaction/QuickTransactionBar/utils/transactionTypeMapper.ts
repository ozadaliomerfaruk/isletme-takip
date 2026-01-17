import { TransactionType, OdemeHedefType } from '../types';

/**
 * Maps UI transaction type to API transaction type.
 * Handles special cases like odeme (payment) which has sub-types.
 */
export function mapTransactionTypeToApi(
  type: TransactionType,
  odemeHedefType?: OdemeHedefType
): string {
  // Special handling for odeme (payment) based on target type
  if (type === 'odeme') {
    if (odemeHedefType === 'staff') {
      return 'personel_odeme';
    }
    if (odemeHedefType === 'kredi_karti') {
      return 'transfer'; // Credit card payment is saved as transfer
    }
    return 'cari_odeme';
  }

  // Direct mappings for other types
  const TYPE_MAP: Partial<Record<TransactionType, string>> = {
    tahsilat: 'cari_tahsilat',
    alis: 'cari_alis',
    satis: 'cari_satis',
    alis_iade: 'cari_alis_iade',
    satis_iade: 'cari_satis_iade',
    personel_odeme_tab: 'personel_odeme',
    personel_gider_tab: 'personel_gider',
    personel_tahsilat_tab: 'personel_tahsilat',
    personel_satis_tab: 'personel_satis',
  };

  return TYPE_MAP[type] || type;
}

/**
 * Transaction types that don't require a hesap_id (no cash flow).
 * Used for alis/satis/iade operations that only affect cari/personel balance.
 */
export const NO_HESAP_TYPES: TransactionType[] = [
  'alis',
  'satis',
  'alis_iade',
  'satis_iade',
  'personel_gider_tab',
  'personel_satis_tab',
];

/**
 * Check if transaction type requires hesap_id.
 */
export function requiresHesap(type: TransactionType): boolean {
  // Odeme is special - depends on odemeHedefType
  if (type === 'odeme') {
    return false; // Handled separately in validation
  }
  return !NO_HESAP_TYPES.includes(type);
}
