import { IslemType } from '@/types/database';
import { TransactionType, OdemeHedefType, TahsilatHedefType } from '../types';

/**
 * Result of mapping API type to form state
 */
export interface ReverseTypeMappingResult {
  type: TransactionType;
  odemeHedefType: OdemeHedefType;
  tahsilatHedefType: TahsilatHedefType;
  isCariMode: boolean;
  isPersonelMode: boolean;
}

/**
 * Maps API transaction type back to UI form state.
 * This is the reverse of mapTransactionTypeToApi.
 *
 * @param apiType - The transaction type from the API (IslemType)
 * @param cariId - The cari_id from the transaction (to determine cari mode)
 * @param personelId - The personel_id from the transaction (to determine personel mode)
 * @param hedefHesapId - The hedef_hesap_id (for transfer vs kredi_karti odeme distinction)
 */
export function mapApiTypeToFormState(
  apiType: IslemType,
  cariId?: string | null,
  personelId?: string | null,
  hedefHesapId?: string | null
): ReverseTypeMappingResult {
  // Default result
  const result: ReverseTypeMappingResult = {
    type: 'gelir',
    odemeHedefType: null,
    tahsilatHedefType: null,
    isCariMode: !!cariId,
    isPersonelMode: !!personelId,
  };

  switch (apiType) {
    // Basic types
    case 'gelir':
      result.type = 'gelir';
      break;

    case 'gider':
      result.type = 'gider';
      break;

    case 'transfer':
      // Transfer could be a normal transfer or kredi_karti odeme
      // If it's from cariler/personel page, it might be a kredi_karti payment
      // For now, we treat all transfers as 'transfer' type
      result.type = 'transfer';
      break;

    // Cari types
    case 'cari_odeme':
      if (cariId) {
        // In cari mode - use 'odeme' tab
        result.type = 'odeme';
        result.odemeHedefType = 'tedarikci';
      } else {
        // Standalone - shouldn't happen but handle gracefully
        result.type = 'odeme';
        result.odemeHedefType = 'tedarikci';
      }
      break;

    case 'cari_tahsilat':
      if (cariId) {
        result.type = 'tahsilat';
        result.tahsilatHedefType = 'musteri';
      } else {
        result.type = 'tahsilat';
        result.tahsilatHedefType = 'musteri';
      }
      break;

    case 'cari_alis':
      result.type = 'alis';
      break;

    case 'cari_satis':
      result.type = 'satis';
      break;

    case 'cari_alis_iade':
      result.type = 'alis_iade';
      break;

    case 'cari_satis_iade':
      result.type = 'satis_iade';
      break;

    // Personel types
    case 'personel_odeme':
      if (personelId) {
        // In personel mode - use personel_odeme_tab
        result.type = 'personel_odeme_tab';
      } else {
        // In normal mode with odeme targeting staff
        result.type = 'odeme';
        result.odemeHedefType = 'staff';
      }
      break;

    case 'personel_gider':
      result.type = 'personel_gider_tab';
      break;

    case 'personel_tahsilat':
      if (personelId) {
        result.type = 'personel_tahsilat_tab';
      } else {
        result.type = 'tahsilat';
        result.tahsilatHedefType = 'personel';
      }
      break;

    case 'personel_satis':
      result.type = 'personel_satis_tab';
      break;

    case 'personel_izin_hakki':
      result.type = 'personel_izin_hakki_tab';
      break;

    case 'personel_izin_kullanimi':
      result.type = 'personel_izin_kullanimi_tab';
      break;

    default:
      // Unknown type - default to gelir
      console.warn(`Unknown API type: ${apiType}, defaulting to gelir`);
      result.type = 'gelir';
  }

  return result;
}

/**
 * Determines the tab mode based on the transaction data
 */
export function determineTabMode(
  cariId?: string | null,
  personelId?: string | null
): 'default' | 'cari' | 'personel' {
  if (cariId) return 'cari';
  if (personelId) return 'personel';
  return 'default';
}
