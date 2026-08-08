import {
  normalizeProductMutationItem,
  normalizeProductMutationItems,
} from '../productMutation';

describe('product mutation RPC boundary', () => {
  it('normalizes quantity and unit price without changing other fields', () => {
    expect(normalizeProductMutationItem({
      urun_id: 'urun-1',
      miktar: 1.23456,
      birim_fiyat: 989.1090000000002,
      kdv_orani: 20,
      marka: 'Marka A',
    })).toEqual({
      urun_id: 'urun-1',
      miktar: 1.235,
      birim_fiyat: 989.109,
      kdv_orani: 20,
      marka: 'Marka A',
    });
  });

  it('preserves nullable legacy prices', () => {
    expect(normalizeProductMutationItems([{
      miktar: 2,
      birim_fiyat: null,
    }])).toEqual([{
      miktar: 2,
      birim_fiyat: null,
    }]);
  });
});
