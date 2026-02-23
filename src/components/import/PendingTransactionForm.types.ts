/**
 * PendingTransactionForm Types & Constants
 */

import { colors } from '@/constants/colors';
import type { IslemType } from '@/types/database';

// Baslangic bakiyesi dahil genisletilmis islem tipi
export type ExtendedIslemType = IslemType | 'baslangic_bakiyesi';

export type IslemTypeOption = {
  value: IslemType | 'baslangic_bakiyesi';
  labelKey: string;
  color: string;
  group: string;
  isCustomerVariant?: boolean;
  isSpecial?: boolean;
};

export const ISLEM_TYPES: IslemTypeOption[] = [
  // Temel islemler
  { value: 'gelir', labelKey: 'transactions:tabs.gelir', color: colors.success, group: 'basic' },
  { value: 'gider', labelKey: 'transactions:tabs.gider', color: colors.error, group: 'basic' },
  { value: 'transfer', labelKey: 'transactions:tabs.transfer', color: colors.info, group: 'basic' },
  { value: 'baslangic_bakiyesi', labelKey: 'transactions:types.baslangic_bakiyesi', color: colors.warning, group: 'basic', isSpecial: true },
  // Cari islemleri (Tedarikci)
  { value: 'cari_alis', labelKey: 'transactions:types.cari_alis', color: colors.error, group: 'supplier' },
  { value: 'cari_alis_iade', labelKey: 'transactions:types.cari_alis_iade', color: colors.success, group: 'supplier' },
  { value: 'cari_odeme', labelKey: 'transactions:types.cari_odeme', color: colors.orange, group: 'supplier' },
  // Cari islemleri (Musteri)
  { value: 'cari_alis', labelKey: 'transactions:types.musteri_alis', color: colors.error, group: 'customer', isCustomerVariant: true },
  { value: 'cari_satis', labelKey: 'transactions:types.cari_satis', color: colors.success, group: 'customer' },
  { value: 'cari_satis_iade', labelKey: 'transactions:types.cari_satis_iade', color: colors.error, group: 'customer' },
  { value: 'cari_tahsilat', labelKey: 'transactions:types.cari_tahsilat', color: colors.primary, group: 'customer' },
  // Personel islemleri
  { value: 'personel_gider', labelKey: 'transactions:types.personel_gider', color: colors.error, group: 'staff' },
  { value: 'personel_odeme', labelKey: 'transactions:types.personel_odeme', color: colors.orange, group: 'staff' },
  { value: 'personel_tahsilat', labelKey: 'transactions:types.personel_tahsilat', color: colors.primary, group: 'staff' },
  { value: 'personel_satis', labelKey: 'transactions:types.personel_satis', color: colors.success, group: 'staff' },
];

/**
 * Get the color for a given transaction type
 */
export function getTypeColor(typeValue: ExtendedIslemType, isCustomerVar: boolean = false): string {
  if (typeValue === 'cari_alis') {
    const matchingType = ISLEM_TYPES.find((t) =>
      t.value === typeValue && t.isCustomerVariant === isCustomerVar
    );
    return matchingType?.color || colors.primary;
  }
  return ISLEM_TYPES.find((t) => t.value === typeValue)?.color || colors.primary;
}

/**
 * Get the translation label for a type
 */
export function getTypeLabel(
  typeValue: ExtendedIslemType,
  isCustomerVariantSelected: boolean,
  t: (key: string) => string
): string {
  if (typeValue === 'cari_alis') {
    const matchingType = ISLEM_TYPES.find((item) =>
      item.value === typeValue && item.isCustomerVariant === isCustomerVariantSelected
    );
    return matchingType?.labelKey ? t(matchingType.labelKey) : typeValue;
  }
  const matchingType = ISLEM_TYPES.find((item) => item.value === typeValue);
  return matchingType?.labelKey ? t(matchingType.labelKey) : typeValue;
}
