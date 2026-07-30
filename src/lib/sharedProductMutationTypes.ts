const SHARED_PRODUCT_V3_TYPES = new Set([
  'cari_alis',
  'cari_satis',
  'cari_alis_iade',
  'cari_satis_iade',
  'gelir',
  'gider',
]);

/**
 * Shared-user atomik ürünlü işlem V3'ünün bilinçli dar kaynak ailesi.
 *
 * `personel_satis` ürün hareketi üretebilse de Personel QTB'sinde ürün kalemi
 * düzenleme sözleşmesi yoktur. Bu yüzden genel `isProductTransactionType`
 * yardımcısı burada kullanılamaz.
 */
export function supportsSharedProductMutationV3(
  type: unknown,
): boolean {
  if (typeof type !== 'string') return false;
  return SHARED_PRODUCT_V3_TYPES.has(type);
}
