import {
  subscribeToNetworkState,
  type DeviceNetworkStateLike,
  type NetworkStateSource,
} from '@/lib/networkMonitor';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('subscribeToNetworkState', () => {
  it('listener sonucu önce geldiyse geç kalan başlangıç sonucunun onu ezmesine izin vermez', async () => {
    const initial = deferred<DeviceNetworkStateLike>();
    let listener: (state: DeviceNetworkStateLike) => void = () => undefined;
    const remove = jest.fn();
    const source: NetworkStateSource = {
      getNetworkStateAsync: () => initial.promise,
      addNetworkStateListener: (nextListener) => {
        listener = nextListener;
        return { remove };
      },
    };
    const onState = jest.fn();

    const stop = subscribeToNetworkState(source, onState);
    listener({ isConnected: true, isInternetReachable: true });
    initial.resolve({ isConnected: false, isInternetReachable: false });
    await flushPromises();

    expect(onState).toHaveBeenCalledTimes(1);
    expect(onState).toHaveBeenLastCalledWith({
      isConnected: true,
      isInternetReachable: true,
    });

    stop();
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('listener henüz çalışmadıysa başlangıç sonucunu uygular', async () => {
    const source: NetworkStateSource = {
      getNetworkStateAsync: async () => ({ isConnected: true }),
      addNetworkStateListener: () => ({ remove: jest.fn() }),
    };
    const onState = jest.fn();

    const stop = subscribeToNetworkState(source, onState);
    await flushPromises();

    expect(onState).toHaveBeenCalledWith({ isConnected: true });
    stop();
  });

  it('başlangıç okuması reddedilirse offline ilan etmez', async () => {
    const source: NetworkStateSource = {
      getNetworkStateAsync: async () => {
        throw new Error('native read failed');
      },
      addNetworkStateListener: () => ({ remove: jest.fn() }),
    };
    const onState = jest.fn();

    const stop = subscribeToNetworkState(source, onState);
    await flushPromises();

    expect(onState).not.toHaveBeenCalled();
    stop();
  });

  it('cleanup sonrasında listener veya başlangıç sonucu state yazamaz', async () => {
    const initial = deferred<DeviceNetworkStateLike>();
    let listener: (state: DeviceNetworkStateLike) => void = () => undefined;
    const remove = jest.fn();
    const source: NetworkStateSource = {
      getNetworkStateAsync: () => initial.promise,
      addNetworkStateListener: (nextListener) => {
        listener = nextListener;
        return { remove };
      },
    };
    const onState = jest.fn();

    const stop = subscribeToNetworkState(source, onState);
    stop();
    listener({ isConnected: false });
    initial.resolve({ isConnected: false });
    await flushPromises();

    expect(remove).toHaveBeenCalledTimes(1);
    expect(onState).not.toHaveBeenCalled();
  });
});
