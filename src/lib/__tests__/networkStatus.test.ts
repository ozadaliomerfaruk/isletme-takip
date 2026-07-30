import {
  NetworkStatusStore,
  deriveNetworkStatus,
  toDeviceConnectionState,
} from '@/lib/networkStatus';

describe('networkStatus', () => {
  it('optional başlangıç alanlarını offline saymaz', () => {
    expect(toDeviceConnectionState({})).toBe('unknown');
    expect(deriveNetworkStatus('unknown', 'unreachable')).toBe('unknown');
  });

  it('aktif ağ sinyali varsa UNKNOWN taşıma tipini yanlış offline saymaz', () => {
    expect(
      toDeviceConnectionState({
        isConnected: false,
        isInternetReachable: true,
      })
    ).toBe('connected');
  });

  it('cihaz durumunu React Query online durumuna bağlar', () => {
    const setQueryOnline = jest.fn();
    const store = new NetworkStatusStore(setQueryOnline);

    store.applyDeviceState({});
    expect(store.getSnapshot().status).toBe('unknown');
    expect(setQueryOnline).not.toHaveBeenCalled();

    store.applyDeviceState({ isConnected: true });
    expect(store.getSnapshot().status).toBe('connected');
    expect(setQueryOnline).toHaveBeenLastCalledWith(true);

    store.applyDeviceState({ isConnected: false });
    expect(store.getSnapshot().status).toBe('disconnected');
    expect(setQueryOnline).toHaveBeenLastCalledWith(false);
  });

  it('tek backend hatasında banner açmaz, ardışık iki hatada ayrı server durumu üretir', () => {
    const store = new NetworkStatusStore(jest.fn());
    store.applyDeviceState({ isConnected: true });

    store.reportBackendFailure(store.beginBackendRequest());
    expect(store.getSnapshot().status).toBe('connected');

    store.reportBackendFailure(store.beginBackendRequest());
    expect(store.getSnapshot()).toMatchObject({
      device: 'connected',
      backend: 'unreachable',
      status: 'backend_unreachable',
    });
  });

  it('gerçek bir backend başarısı server bannerını hemen temizler', () => {
    const store = new NetworkStatusStore(jest.fn());
    store.applyDeviceState({ isConnected: true });
    store.reportBackendFailure(store.beginBackendRequest());
    store.reportBackendFailure(store.beginBackendRequest());
    expect(store.getSnapshot().status).toBe('backend_unreachable');

    store.reportBackendSuccess(store.beginBackendRequest());
    expect(store.getSnapshot()).toMatchObject({
      backend: 'reachable',
      status: 'connected',
    });
  });

  it('daha yeni başarının ardından tamamlanan eski hata sonucu statei ezemez', () => {
    const store = new NetworkStatusStore(jest.fn());
    store.applyDeviceState({ isConnected: true });
    const oldRequest = store.beginBackendRequest();
    const newRequest = store.beginBackendRequest();

    store.reportBackendSuccess(newRequest);
    store.reportBackendFailure(oldRequest);

    expect(store.getSnapshot()).toMatchObject({
      backend: 'reachable',
      status: 'connected',
    });
  });

  it('cihaz offline iken backend sonucu ayrı bir server bannerı açamaz', () => {
    const store = new NetworkStatusStore(jest.fn());
    store.applyDeviceState({ isConnected: true });
    const oldRequest = store.beginBackendRequest();

    store.applyDeviceState({ isConnected: false });
    store.reportBackendFailure(oldRequest);
    store.reportBackendFailure(oldRequest);

    expect(store.getSnapshot()).toMatchObject({
      backend: 'unknown',
      status: 'disconnected',
    });
  });

  it('snapshot abonelerini yalnız görünür state değiştiğinde çağırır', () => {
    const store = new NetworkStatusStore(jest.fn());
    const listener = jest.fn();
    const unsubscribe = store.subscribe(listener);

    store.applyDeviceState({});
    store.applyDeviceState({ isConnected: true });
    store.applyDeviceState({ isConnected: true });

    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    store.applyDeviceState({ isConnected: false });
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
