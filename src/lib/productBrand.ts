export interface ProductWithBrand {
  marka?: string | null;
}

/**
 * Marka alaninin tum yazma yollarinda ayni bicimde saklanmasini saglar.
 * Bosluklari tekler; bos degeri DB'de NULL olarak birakir.
 */
export function normalizeProductBrand(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().replace(/\s+/g, ' ');
  return normalized || null;
}

export function productBrandKey(value: unknown): string | null {
  return normalizeProductBrand(value)?.toLocaleLowerCase('tr-TR') ?? null;
}

export function getProductBrandSuggestions(
  products: readonly ProductWithBrand[] | undefined,
  query = '',
  limit = 5,
): string[] {
  if (!products?.length || limit <= 0) return [];

  const queryKey = productBrandKey(query);
  const unique = new Map<string, string>();

  products.forEach((product) => {
    const brand = normalizeProductBrand(product.marka);
    const key = productBrandKey(brand);
    if (!brand || !key || key === queryKey || unique.has(key)) return;
    if (queryKey && !key.includes(queryKey)) return;
    unique.set(key, brand);
  });

  return Array.from(unique.values())
    .sort((left, right) => left.localeCompare(right, 'tr-TR'))
    .slice(0, limit);
}
