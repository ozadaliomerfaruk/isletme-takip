import type { UrunHareketTipi } from '@/types/database';

const PRODUCT_MOVEMENT_BY_QUICK_TRANSACTION_TYPE = {
  alis: 'giris',
  satis: 'cikis',
  alis_iade: 'cikis',
  satis_iade: 'giris',
  gelir: 'cikis',
  gider: 'giris',
  kredi_karti_gider: 'giris',
} as const satisfies Readonly<Record<string, UrunHareketTipi>>;

export function getQuickTransactionProductMovementType(
  type: unknown,
): UrunHareketTipi | null {
  if (
    typeof type !== 'string'
    || !Object.prototype.hasOwnProperty.call(
      PRODUCT_MOVEMENT_BY_QUICK_TRANSACTION_TYPE,
      type,
    )
  ) {
    return null;
  }

  return PRODUCT_MOVEMENT_BY_QUICK_TRANSACTION_TYPE[
    type as keyof typeof PRODUCT_MOVEMENT_BY_QUICK_TRANSACTION_TYPE
  ];
}

export function supportsQuickTransactionProducts(type: unknown): boolean {
  return getQuickTransactionProductMovementType(type) !== null;
}

export function hasUnsupportedQuickTransactionProducts(
  type: unknown,
  selectedProductCount: number,
): boolean {
  return selectedProductCount > 0 && !supportsQuickTransactionProducts(type);
}
