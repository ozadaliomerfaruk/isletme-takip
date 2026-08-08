import {
  getProductBrandSuggestions,
  normalizeProductBrand,
  productBrandKey,
} from '@/lib/productBrand';

describe('productBrand', () => {
  it('normalizes whitespace and keeps an empty brand nullable', () => {
    expect(normalizeProductBrand('  Marka   A  ')).toBe('Marka A');
    expect(normalizeProductBrand('   ')).toBeNull();
    expect(normalizeProductBrand(null)).toBeNull();
  });

  it('deduplicates Turkish-case variants and filters suggestions', () => {
    const products = [
      { marka: 'İnci' },
      { marka: 'inci' },
      { marka: '  Marka   A ' },
      { marka: 'Marka B' },
      { marka: null },
    ];

    expect(productBrandKey('İNCİ')).toBe('inci');
    expect(getProductBrandSuggestions(products, 'marka')).toEqual([
      'Marka A',
      'Marka B',
    ]);
    expect(getProductBrandSuggestions(products, 'İnci')).toEqual([]);
  });
});
