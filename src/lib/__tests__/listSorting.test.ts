import {
  compareBalanceListItems,
  compareEntityIdentity,
  compareMetricListItems,
  type StableBalanceListItem,
  type StableMetricListItem,
} from '@/lib/listSorting';

const permutations = <T>(items: T[]): T[][] => [
  items,
  [...items].reverse(),
  [items[1], items[2], items[0]],
];

describe('deterministik ana liste sıralaması', () => {
  it('aynı görünen adda id ile kararlı sıra üretir', () => {
    const rows = [
      { id: 'c', label: 'Mehmet Özadalı' },
      { id: 'a', label: 'Mehmet Özadalı' },
      { id: 'b', label: 'Mehmet Özadalı' },
    ];

    for (const input of permutations(rows)) {
      expect([...input].sort(compareEntityIdentity).map((row) => row.id))
        .toEqual(['a', 'b', 'c']);
    }
  });

  it.each<['balanceHigh' | 'balanceLow']>([
    ['balanceHigh'],
    ['balanceLow'],
  ])('%s eşit bakiyelerde refetch sırasından etkilenmez', (sort) => {
    const rows: StableBalanceListItem[] = [
      { id: 'c', label: 'Aynı', balance: -100 },
      { id: 'a', label: 'Aynı', balance: -100 },
      { id: 'b', label: 'Aynı', balance: -100 },
    ];

    for (const input of permutations(rows)) {
      expect([...input].sort((a, b) => compareBalanceListItems(a, b, sort)).map((row) => row.id))
        .toEqual(['a', 'b', 'c']);
    }
  });

  it('bakiye grup ve tutar önceliğini korur', () => {
    const rows: StableBalanceListItem[] = [
      { id: 'zero', label: 'Sıfır', balance: 0 },
      { id: 'positive', label: 'Alacak', balance: 50 },
      { id: 'negative-small', label: 'Borç 1', balance: -10 },
      { id: 'negative-large', label: 'Borç 2', balance: -100 },
    ];

    expect([...rows]
      .sort((a, b) => compareBalanceListItems(a, b, 'balanceHigh'))
      .map((row) => row.id))
      .toEqual(['negative-large', 'negative-small', 'positive', 'zero']);
  });

  it.each<['asc' | 'desc']>([['asc'], ['desc']])(
    'eşit ürün metriğinde %s yönünde id fallback kullanır',
    (direction) => {
      const rows: StableMetricListItem[] = [
        { id: 'c', label: 'Aynı Ürün', metric: 250 },
        { id: 'a', label: 'Aynı Ürün', metric: 250 },
        { id: 'b', label: 'Aynı Ürün', metric: 250 },
      ];

      for (const input of permutations(rows)) {
        expect([...input]
          .sort((a, b) => compareMetricListItems(a, b, direction))
          .map((row) => row.id))
          .toEqual(['a', 'b', 'c']);
      }
    },
  );
});
