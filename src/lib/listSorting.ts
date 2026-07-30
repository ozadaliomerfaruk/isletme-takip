export type BalanceListSort = 'name' | 'balanceHigh' | 'balanceLow';

export interface StableListIdentity {
  id: string;
  label: string;
}

export interface StableBalanceListItem extends StableListIdentity {
  balance: number;
}

export interface StableMetricListItem extends StableListIdentity {
  metric: number;
}

export function compareEntityIdentity(
  a: StableListIdentity,
  b: StableListIdentity,
  direction: 'asc' | 'desc' = 'asc',
): number {
  const labelComparison = a.label.localeCompare(b.label, 'tr');
  if (labelComparison !== 0) {
    return direction === 'asc' ? labelComparison : -labelComparison;
  }

  // Aynı görünen adlarda refetch'in kaynak satır sırası UI sırasını değiştirmesin.
  return a.id.localeCompare(b.id);
}

export function compareBalanceListItems(
  a: StableBalanceListItem,
  b: StableBalanceListItem,
  sort: BalanceListSort,
): number {
  if (sort === 'balanceHigh') {
    // Borçlarımız (negatif) önce, alacaklarımız (pozitif) sonra, sıfır en sonda.
    const aGroup = a.balance < 0 ? 0 : a.balance > 0 ? 1 : 2;
    const bGroup = b.balance < 0 ? 0 : b.balance > 0 ? 1 : 2;
    if (aGroup !== bGroup) return aGroup - bGroup;

    const amountComparison = Math.abs(b.balance) - Math.abs(a.balance);
    if (amountComparison !== 0) return amountComparison;
  } else if (sort === 'balanceLow') {
    // Alacaklarımız (pozitif) önce, borçlarımız (negatif) sonra, sıfır en sonda.
    const aGroup = a.balance > 0 ? 0 : a.balance < 0 ? 1 : 2;
    const bGroup = b.balance > 0 ? 0 : b.balance < 0 ? 1 : 2;
    if (aGroup !== bGroup) return aGroup - bGroup;

    const amountComparison = Math.abs(a.balance) - Math.abs(b.balance);
    if (amountComparison !== 0) return amountComparison;
  }

  return compareEntityIdentity(a, b);
}

export function compareMetricListItems(
  a: StableMetricListItem,
  b: StableMetricListItem,
  direction: 'asc' | 'desc',
): number {
  const metricComparison = direction === 'asc'
    ? a.metric - b.metric
    : b.metric - a.metric;
  return metricComparison !== 0 ? metricComparison : compareEntityIdentity(a, b);
}
