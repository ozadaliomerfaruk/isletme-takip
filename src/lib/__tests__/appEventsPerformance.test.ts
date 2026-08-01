jest.mock('../supabase', () => {
  const insert = jest.fn(async (_rows: unknown) => ({ error: null }));
  return {
    supabase: {
      from: jest.fn(() => ({ insert })),
    },
    __mockInsert: insert,
  };
});

jest.mock('expo-network', () => ({
  __esModule: true,
  getNetworkStateAsync: jest.fn(async () => ({ type: 'WIFI' })),
}));

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: { version: '1.2.3' },
    platform: { ios: { buildNumber: '42' } },
  },
}));

jest.mock('react-native', () => ({
  AppState: {
    currentState: 'active',
    addEventListener: jest.fn(),
  },
  Platform: { OS: 'ios' },
}));

jest.mock('../networkStatus', () => ({
  networkStatusStore: {
    getSnapshot: () => ({ device: 'connected', backend: 'reachable' }),
  },
}));

import {
  __appEventInternals,
  logPerformanceEvent,
  setEventContext,
} from '../appEvents';

const { __mockInsert: mockInsert } = jest.requireMock('../supabase') as {
  __mockInsert: jest.Mock<Promise<{ error: null }>, [unknown]>;
};
const { getNetworkStateAsync: mockGetNetworkStateAsync } = jest.requireMock(
  'expo-network',
) as {
  getNetworkStateAsync: jest.Mock<Promise<{ type: string }>, []>;
};

async function settleNetworkLookup(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('performance app events', () => {
  beforeEach(() => {
    mockInsert.mockClear();
    mockGetNetworkStateAsync.mockClear();
    __appEventInternals.resetForTests();
  });

  afterEach(() => {
    __appEventInternals.resetForTests();
  });

  it('defers the network write and flushes a PII-free timing row as a batch', async () => {
    setEventContext('user-1', 'tenant-1');

    logPerformanceEvent('save_submit_trace', {
      trace_id: 'save-trace',
      total_ms: 1_250,
      write_path: 'regular_create_v2',
    });
    await settleNetworkLookup();

    expect(mockInsert).not.toHaveBeenCalled();
    expect(__appEventInternals.getPerformanceBufferSize()).toBe(1);

    await __appEventInternals.flushPerformanceEvents();

    const rows = mockInsert.mock.calls[0]?.[0] as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      user_id: 'user-1',
      isletme_id: 'tenant-1',
      event_name: 'save_submit_trace',
      platform: 'ios',
      app_version: '1.2.3',
      meta: {
        perf_schema: 2,
        native_build: '42',
        app_state: 'active',
        network_type: 'WIFI',
        device_network: 'connected',
        backend_reachability: 'reachable',
        trace_id: 'save-trace',
        total_ms: 1_250,
        write_path: 'regular_create_v2',
      },
    });
    expect(rows[0].meta).not.toHaveProperty('amount');
    expect(rows[0].meta).not.toHaveProperty('personel_id');
    expect(rows[0].meta).not.toHaveProperty('description');
  });

  it('drops queued rows when the authenticated user changes', async () => {
    setEventContext('user-1', 'tenant-1');
    logPerformanceEvent('save_submit_trace', { total_ms: 900 });
    await settleNetworkLookup();
    expect(__appEventInternals.getPerformanceBufferSize()).toBe(1);

    setEventContext('user-2', 'tenant-2');
    expect(__appEventInternals.getPerformanceBufferSize()).toBe(0);

    logPerformanceEvent('personel_detail_trace', { total_ms: 500 });
    await settleNetworkLookup();
    await __appEventInternals.flushPerformanceEvents();

    const rows = mockInsert.mock.calls[0]?.[0] as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      user_id: 'user-2',
      isletme_id: 'tenant-2',
      event_name: 'personel_detail_trace',
    });
  });
});
