export type DeviceNetworkStateLike = {
  isConnected?: boolean;
  isInternetReachable?: boolean;
};

export type NetworkStateSource = {
  getNetworkStateAsync: () => Promise<DeviceNetworkStateLike>;
  addNetworkStateListener: (
    listener: (state: DeviceNetworkStateLike) => void
  ) => { remove: () => void };
};

/**
 * Subscribes before reading the initial state. If the listener produces a newer
 * value first, the slower initial read is ignored instead of overwriting it.
 */
export function subscribeToNetworkState(
  source: NetworkStateSource,
  onState: (state: DeviceNetworkStateLike) => void
): () => void {
  let active = true;
  let listenerHasEmitted = false;
  let subscription: { remove: () => void } | null = null;

  try {
    subscription = source.addNetworkStateListener((state) => {
      if (!active) return;
      listenerHasEmitted = true;
      onState(state);
    });
  } catch {
    // A missing native module must not be interpreted as "device is offline".
  }

  Promise.resolve()
    .then(() => source.getNetworkStateAsync())
    .then((state) => {
      if (!active || listenerHasEmitted) return;
      onState(state);
    })
    .catch(() => {
      // Unknown is safer than a false offline banner when the native read fails.
    });

  return () => {
    active = false;
    subscription?.remove();
  };
}
