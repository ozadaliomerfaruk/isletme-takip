import { useEffect, useSyncExternalStore } from 'react';
import * as Network from 'expo-network';
import { subscribeToNetworkState } from '@/lib/networkMonitor';
import {
  networkStatusStore,
  type NetworkStatusSnapshot,
} from '@/lib/networkStatus';

let monitoringConsumers = 0;
let stopMonitoring: (() => void) | null = null;

function retainNetworkMonitoring(): () => void {
  monitoringConsumers += 1;

  if (monitoringConsumers === 1) {
    stopMonitoring = subscribeToNetworkState(
      Network,
      (state) => networkStatusStore.applyDeviceState(state)
    );
  }

  return () => {
    monitoringConsumers = Math.max(0, monitoringConsumers - 1);
    if (monitoringConsumers === 0) {
      stopMonitoring?.();
      stopMonitoring = null;
    }
  };
}

export function useNetworkStatus(): NetworkStatusSnapshot {
  const snapshot = useSyncExternalStore(
    networkStatusStore.subscribe,
    networkStatusStore.getSnapshot,
    networkStatusStore.getSnapshot
  );

  useEffect(() => retainNetworkMonitoring(), []);

  return snapshot;
}
