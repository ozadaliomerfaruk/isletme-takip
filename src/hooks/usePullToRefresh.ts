import { useState, useCallback } from 'react';

type RefetchFn = () => Promise<unknown>;

export function usePullToRefresh(...refetchFns: RefetchFn[]) {
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all(refetchFns.map(fn => fn()));
    } finally {
      setRefreshing(false);
    }
  }, refetchFns);

  return { refreshing, onRefresh };
}
