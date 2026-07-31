import { onlineManager } from '@tanstack/react-query';
import type { DeviceNetworkStateLike } from './networkMonitor';

export type DeviceConnectionState = 'unknown' | 'connected' | 'disconnected';
export type BackendReachabilityState = 'unknown' | 'reachable' | 'unreachable';
export type NetworkStatus = 'unknown' | 'connected' | 'disconnected' | 'backend_unreachable';

export type NetworkStatusSnapshot = {
  device: DeviceConnectionState;
  backend: BackendReachabilityState;
  status: NetworkStatus;
};

const BACKEND_FAILURE_THRESHOLD = 2;

const INITIAL_SNAPSHOT: NetworkStatusSnapshot = {
  device: 'unknown',
  backend: 'unknown',
  status: 'unknown',
};

export function toDeviceConnectionState(
  state: DeviceNetworkStateLike
): DeviceConnectionState {
  // Bazı Android taşıma türlerinde aktif ağ varken bağlantı tipi UNKNOWN kalabilir:
  // isConnected=false fakat isInternetReachable=true gelebilir. Pozitif sinyal bu
  // çelişkide daha güçlüdür; backend erişimi ayrıca izlenir.
  if (state.isConnected === true || state.isInternetReachable === true) {
    return 'connected';
  }
  if (state.isConnected === false || state.isInternetReachable === false) {
    return 'disconnected';
  }
  return 'unknown';
}

export function deriveNetworkStatus(
  device: DeviceConnectionState,
  backend: BackendReachabilityState
): NetworkStatus {
  if (device === 'disconnected') return 'disconnected';
  if (device === 'unknown') return 'unknown';
  if (backend === 'unreachable') return 'backend_unreachable';
  return 'connected';
}

export class NetworkStatusStore {
  private snapshot: NetworkStatusSnapshot = INITIAL_SNAPSHOT;
  private listeners = new Set<() => void>();
  private backendRequestSequence = 0;
  private minimumAcceptedBackendRequest = 1;
  private lastSuccessfulBackendRequest = 0;
  private consecutiveBackendFailures = 0;

  constructor(
    private readonly setQueryOnline: (online: boolean) => void = (online) =>
      onlineManager.setOnline(online)
  ) {}

  getSnapshot = (): NetworkStatusSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  applyDeviceState(state: DeviceNetworkStateLike): void {
    const device = toDeviceConnectionState(state);

    // Optional/unknown native fields are an initialization state, not evidence
    // that the user has lost internet. Do not overwrite a known state with it.
    if (device === 'unknown') return;

    const deviceChanged = device !== this.snapshot.device;
    if (deviceChanged) {
      this.setQueryOnline(device === 'connected');
    }

    let backend = this.snapshot.backend;
    if (device === 'disconnected') {
      backend = 'unknown';
      this.consecutiveBackendFailures = 0;
      this.minimumAcceptedBackendRequest = this.backendRequestSequence + 1;
    } else if (this.snapshot.device === 'disconnected') {
      backend = 'unknown';
    }

    this.updateSnapshot(device, backend);
  }

  beginBackendRequest(): number {
    this.backendRequestSequence += 1;
    return this.backendRequestSequence;
  }

  reportBackendSuccess(requestId: number): void {
    if (requestId < this.minimumAcceptedBackendRequest) return;

    this.lastSuccessfulBackendRequest = Math.max(
      this.lastSuccessfulBackendRequest,
      requestId
    );
    this.consecutiveBackendFailures = 0;
    this.updateSnapshot(this.snapshot.device, 'reachable');
  }

  reportBackendFailure(requestId: number): void {
    if (
      requestId < this.minimumAcceptedBackendRequest ||
      requestId < this.lastSuccessfulBackendRequest
    ) {
      return;
    }

    this.consecutiveBackendFailures += 1;
    if (this.consecutiveBackendFailures < BACKEND_FAILURE_THRESHOLD) return;

    this.updateSnapshot(this.snapshot.device, 'unreachable');
  }

  isDeviceDisconnected(): boolean {
    return this.snapshot.device === 'disconnected';
  }

  private updateSnapshot(
    device: DeviceConnectionState,
    backend: BackendReachabilityState
  ): void {
    const status = deriveNetworkStatus(device, backend);
    if (
      this.snapshot.device === device &&
      this.snapshot.backend === backend &&
      this.snapshot.status === status
    ) {
      return;
    }

    this.snapshot = { device, backend, status };
    this.listeners.forEach((listener) => listener());
  }
}

export const networkStatusStore = new NetworkStatusStore();

export const beginBackendRequest = (): number =>
  networkStatusStore.beginBackendRequest();

export const reportBackendSuccess = (requestId: number): void =>
  networkStatusStore.reportBackendSuccess(requestId);

export const reportBackendFailure = (requestId: number): void =>
  networkStatusStore.reportBackendFailure(requestId);

export const isDeviceDisconnected = (): boolean =>
  networkStatusStore.isDeviceDisconnected();
