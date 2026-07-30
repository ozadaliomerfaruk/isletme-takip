import { roundQuantity, roundUnitPrice } from '@/lib/currency';

export type ProductMutationNumericFields = {
  miktar: number;
  birim_fiyat: number | null;
};

/**
 * JS kayan nokta gürültüsünü RPC sınırında DB'nin gerçek hassasiyetine indirir.
 * Para toplamı bundan ayrı olarak 2 ondalıklı roundCurrency ile yazılır.
 */
export function normalizeProductMutationItem<
  T extends ProductMutationNumericFields,
>(item: T): T {
  return {
    ...item,
    miktar: roundQuantity(item.miktar),
    birim_fiyat:
      item.birim_fiyat == null ? null : roundUnitPrice(item.birim_fiyat),
  };
}

export function normalizeProductMutationItems<
  T extends ProductMutationNumericFields,
>(items: readonly T[]): T[] {
  return items.map(normalizeProductMutationItem);
}
