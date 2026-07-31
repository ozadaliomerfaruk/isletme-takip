import React from 'react';
import { act, renderHook } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { IleriTarihliIslem, Islem } from '@/types/database';
import { CrossCurrencyRateRequiredError } from '@/lib/crossCurrency';
import { useCompleteIleriTarihliIslem } from '../useIleriTarihliIslemler';

const BUSINESS_ID = '11111111-1111-4111-8111-111111111111';
const SCHEDULED_ID = '22222222-2222-4222-8222-222222222222';
const LEGACY_ISLEM_ID = '33333333-3333-4333-8333-333333333333';
const ACCOUNT_ID = '44444444-4444-4444-8444-444444444444';
const CARI_ID = '55555555-5555-4555-8555-555555555555';

type DbResult<T> = {
  data: T;
  error: unknown;
};

interface MockScenario {
  rpc: DbResult<Islem | null>;
  sourceProbe: DbResult<Islem | null>;
  scheduledProbe: DbResult<IleriTarihliIslem | null>;
}

interface FilterCall {
  table: string;
  column: string;
  value: unknown;
}

interface MockQuery {
  select: jest.Mock<MockQuery, []>;
  eq: jest.Mock<MockQuery, [string, unknown]>;
  maybeSingle: jest.Mock<
    Promise<DbResult<Islem | IleriTarihliIslem | null>>,
    []
  >;
  insert: jest.Mock<never, [unknown]>;
  update: jest.Mock<never, [unknown]>;
  delete: jest.Mock<never, []>;
}

let mockScenario: MockScenario;
let mockOrder: string[];
let mockFilterCalls: FilterCall[];
let mockWriteCalls: Array<{
  table: string;
  operation: string;
  payload: unknown;
}>;
let activeCleanups: Array<() => void>;

const mockUseAuthContext = jest.fn();
const mockRpc = jest.fn(
  async (
    _name: string,
    _args: unknown
  ): Promise<DbResult<Islem | null>> => {
    mockOrder.push('rpc');
    return mockScenario.rpc;
  }
);
const mockCancelTransactionReminder = jest.fn(async (_id: string) => {
  mockOrder.push('reminder');
});
const mockInvalidateRelatedQueries = jest.fn();
const mockFormatDateTimeForDB = jest.fn(
  (_date: Date) => '2026-07-29T14:35:12+03:00'
);

function createMockQuery(table: string): MockQuery {
  const query = {} as MockQuery;

  query.select = jest.fn((): MockQuery => query);
  query.eq = jest.fn((column: string, value: unknown): MockQuery => {
    mockFilterCalls.push({ table, column, value });
    return query;
  });
  query.maybeSingle = jest.fn(async () => {
    if (table === 'islemler') {
      mockOrder.push('sourceProbe');
      return mockScenario.sourceProbe;
    }
    if (table === 'ileri_tarihli_islemler') {
      mockOrder.push('scheduledProbe');
      return mockScenario.scheduledProbe;
    }
    throw new Error(`Beklenmeyen probe tablosu: ${table}`);
  });
  query.insert = jest.fn((payload: unknown): never => {
    mockWriteCalls.push({ table, operation: 'insert', payload });
    throw new Error('Tamamlama hooku istemciden insert yapmamalı');
  });
  query.update = jest.fn((payload: unknown): never => {
    mockWriteCalls.push({ table, operation: 'update', payload });
    throw new Error('Tamamlama hooku istemciden status update yapmamalı');
  });
  query.delete = jest.fn((): never => {
    mockWriteCalls.push({ table, operation: 'delete', payload: null });
    throw new Error('Tamamlama hooku istemciden delete yapmamalı');
  });

  return query;
}

const mockFrom = jest.fn((table: string) => createMockQuery(table));

jest.mock('@/contexts/AuthContext', () => ({
  useAuthContext: () => mockUseAuthContext(),
}));

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => mockFrom(table),
    rpc: (name: string, args: unknown) => mockRpc(name, args),
  },
}));

jest.mock('@/lib/notifications', () => ({
  cancelTransactionReminder: (id: string) =>
    mockCancelTransactionReminder(id),
}));

jest.mock('@/lib/date', () => ({
  formatDateForDB: jest.fn(),
  formatDateTimeForDB: (date: Date) => mockFormatDateTimeForDB(date),
}));

jest.mock('@/lib/queryKeys', () => ({
  queryKeys: {},
  invalidateRelatedQueries: (...args: unknown[]) =>
    mockInvalidateRelatedQueries(...args),
}));

function makeCompleted(
  overrides: Partial<Islem> & { hedef_islem_id?: string | null } = {}
): Islem {
  return {
    id: SCHEDULED_ID,
    isletme_id: BUSINESS_ID,
    type: 'cari_tahsilat',
    amount: 100,
    description: 'Planlı tahsilat',
    date: '2026-07-28T12:00:00.000+03:00',
    hesap_id: ACCOUNT_ID,
    hedef_hesap_id: null,
    kategori_id: null,
    cari_id: CARI_ID,
    personel_id: null,
    source_currency: 'TRY',
    target_currency: 'TRY',
    exchange_rate: null,
    photo_path: null,
    date_end: null,
    source_ileri_id: SCHEDULED_ID,
    vade_tarihi: null,
    hedef_islem_id: null,
    created_by: null,
    updated_by: null,
    created_at: '2026-07-28T12:00:00.000Z',
    updated_at: '2026-07-28T12:00:00.000Z',
    ...overrides,
  } as Islem;
}

function makeScheduled(
  overrides: Partial<IleriTarihliIslem> = {}
): IleriTarihliIslem {
  return {
    id: SCHEDULED_ID,
    isletme_id: BUSINESS_ID,
    type: 'cari_tahsilat',
    amount: 100,
    description: 'Planlı tahsilat',
    scheduled_date: '2026-07-28',
    hesap_id: ACCOUNT_ID,
    hedef_hesap_id: null,
    kategori_id: null,
    cari_id: CARI_ID,
    personel_id: null,
    status: 'completed',
    notified_at: '2026-07-28T07:00:00.000Z',
    created_by: null,
    updated_by: null,
    created_at: '2026-07-01T10:00:00.000Z',
    updated_at: '2026-07-28T12:00:00.000Z',
    ...overrides,
  } as IleriTarihliIslem;
}

function makeScenario(): MockScenario {
  return {
    rpc: { data: makeCompleted(), error: null },
    sourceProbe: { data: null, error: null },
    scheduledProbe: { data: makeScheduled(), error: null },
  };
}

function renderCompletionHook(globalMutationRetry = 4) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: {
        retry: globalMutationRetry,
        retryDelay: 0,
        gcTime: Infinity,
      },
    },
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
  const hook = renderHook(() => useCompleteIleriTarihliIslem(), { wrapper });

  activeCleanups.push(() => {
    hook.unmount();
    queryClient.clear();
  });

  return hook;
}

async function runMutation(
  hook: ReturnType<typeof renderCompletionHook>,
  exchangeRate?: number,
  expectedToken?: string | null
): Promise<{ value?: Islem; error?: unknown }> {
  let value: Islem | undefined;
  let error: unknown;

  await act(async () => {
    try {
      value = await hook.result.current.mutateAsync({
        id: SCHEDULED_ID,
        exchangeRate,
        expectedToken,
      });
    } catch (caught) {
      error = caught;
    }
  });

  return { value, error };
}

describe('useCompleteIleriTarihliIslem', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockScenario = makeScenario();
    mockOrder = [];
    mockFilterCalls = [];
    mockWriteCalls = [];
    activeCleanups = [];
    mockUseAuthContext.mockReturnValue({
      isletme: { id: BUSINESS_ID },
    });
  });

  afterEach(() => {
    activeCleanups.splice(0).forEach((cleanup) => cleanup());
  });

  it('tek atomik RPC ile tamamlar; client satırı veya bakiye operasyonu göndermez', async () => {
    const hook = renderCompletionHook();
    const outcome = await runMutation(hook);

    expect(outcome.error).toBeUndefined();
    expect(outcome.value).toMatchObject({
      id: SCHEDULED_ID,
      isletme_id: BUSINESS_ID,
      source_ileri_id: SCHEDULED_ID,
    });
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith(
      'complete_ileri_tarihli_islem_atomik',
      {
        p_isletme_id: BUSINESS_ID,
        p_ileri_id: SCHEDULED_ID,
        p_exchange_rate: null,
        p_expected_token: null,
        p_completion_at: '2026-07-29T14:35:12+03:00',
      }
    );
    expect(mockFormatDateTimeForDB).toHaveBeenCalledWith(expect.any(Date));
    expect(mockRpc.mock.calls[0][1]).not.toHaveProperty('p_new_row');
    expect(mockRpc.mock.calls[0][1]).not.toHaveProperty('p_balance_ops');
    expect(mockFrom).not.toHaveBeenCalled();
    expect(mockWriteCalls).toEqual([]);
    expect(mockOrder).toEqual(['rpc', 'reminder']);
    expect(mockCancelTransactionReminder).toHaveBeenCalledWith(SCHEDULED_ID);
  });

  it('kullanıcının verdiği kuru atomik RPCye geçirir', async () => {
    mockScenario.rpc = {
      data: makeCompleted({ exchange_rate: 32.456789 }),
      error: null,
    };
    const hook = renderCompletionHook();
    const outcome = await runMutation(
      hook,
      32.456789,
      '0123456789abcdef0123456789abcdef'
    );

    expect(outcome.error).toBeUndefined();
    expect(mockRpc).toHaveBeenCalledWith(
      'complete_ileri_tarihli_islem_atomik',
      {
        p_isletme_id: BUSINESS_ID,
        p_ileri_id: SCHEDULED_ID,
        p_exchange_rate: 32.456789,
        p_expected_token: '0123456789abcdef0123456789abcdef',
        p_completion_at: '2026-07-29T14:35:12+03:00',
      }
    );
  });

  it('RPC cevabı kaybolduğunda exact source probe ile dayanıklı başarıyı doğrular', async () => {
    mockScenario.rpc = {
      data: null,
      error: { code: 'NETWORK', message: 'response lost' },
    };
    mockScenario.sourceProbe = {
      data: makeCompleted(),
      error: null,
    };

    const hook = renderCompletionHook();
    const outcome = await runMutation(hook);

    expect(outcome.error).toBeUndefined();
    expect(outcome.value).toMatchObject({
      id: SCHEDULED_ID,
      isletme_id: BUSINESS_ID,
      source_ileri_id: SCHEDULED_ID,
    });
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockFrom).toHaveBeenCalledTimes(2);
    expect(mockFrom).toHaveBeenNthCalledWith(1, 'islemler');
    expect(mockFrom).toHaveBeenNthCalledWith(
      2,
      'ileri_tarihli_islemler'
    );
    expect(mockFilterCalls).toEqual([
      {
        table: 'islemler',
        column: 'isletme_id',
        value: BUSINESS_ID,
      },
      {
        table: 'islemler',
        column: 'source_ileri_id',
        value: SCHEDULED_ID,
      },
      {
        table: 'ileri_tarihli_islemler',
        column: 'id',
        value: SCHEDULED_ID,
      },
      {
        table: 'ileri_tarihli_islemler',
        column: 'isletme_id',
        value: BUSINESS_ID,
      },
    ]);
    expect(mockOrder).toEqual([
      'rpc',
      'sourceProbe',
      'scheduledProbe',
      'reminder',
    ]);
  });

  it('transport hatasında probe boşsa asıl hatayı yükseltir ve global retryyi kullanmaz', async () => {
    const rpcError = { code: 'NETWORK', message: 'offline' };
    mockScenario.rpc = { data: null, error: rpcError };
    mockScenario.sourceProbe = { data: null, error: null };

    const hook = renderCompletionHook(4);
    const outcome = await runMutation(hook);

    expect(outcome.error).toBe(rpcError);
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockOrder).toEqual(['rpc', 'sourceProbe']);
    expect(mockCancelTransactionReminder).not.toHaveBeenCalled();
    expect(mockWriteCalls).toEqual([]);
  });

  it('response-loss probe farklı legacy işlem bulursa conflict verir', async () => {
    mockScenario.rpc = {
      data: null,
      error: { code: 'NETWORK', message: 'response lost' },
    };
    mockScenario.sourceProbe = {
      data: makeCompleted({ id: LEGACY_ISLEM_ID }),
      error: null,
    };

    const hook = renderCompletionHook();
    const outcome = await runMutation(hook);

    expect(outcome.error).toEqual(
      expect.objectContaining({
        message: 'transactions:scheduled.existingRecordConflict',
      })
    );
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockOrder).toEqual([
      'rpc',
      'sourceProbe',
      'scheduledProbe',
    ]);
    expect(mockCancelTransactionReminder).not.toHaveBeenCalled();
  });

  it.each([
    {
      label: 'parent completed değil',
      scheduled: makeScheduled({ status: 'pending' }),
    },
    {
      label: 'parent tutarı farklı',
      scheduled: makeScheduled({ amount: 101 }),
    },
    {
      label: 'parent açıklaması farklı',
      scheduled: makeScheduled({ description: 'Başka açıklama' }),
    },
    {
      label: 'parent cari bacağı farklı',
      scheduled: makeScheduled({
        cari_id: '66666666-6666-4666-8666-666666666666',
      }),
    },
  ])(
    'response-loss probe $label ise dayanıklı başarı saymaz',
    async ({ scheduled }) => {
      mockScenario.rpc = {
        data: null,
        error: { code: 'NETWORK', message: 'response lost' },
      };
      mockScenario.sourceProbe = {
        data: makeCompleted(),
        error: null,
      };
      mockScenario.scheduledProbe = {
        data: scheduled,
        error: null,
      };

      const hook = renderCompletionHook();
      const outcome = await runMutation(hook);

      expect(outcome.error).toEqual(
        expect.objectContaining({
          message: 'transactions:scheduled.existingRecordConflict',
        })
      );
      expect(mockOrder).toEqual([
        'rpc',
        'sourceProbe',
        'scheduledProbe',
      ]);
      expect(mockCancelTransactionReminder).not.toHaveBeenCalled();
    }
  );

  it.each([
    {
      label: 'photo_path',
      completed: makeCompleted({ photo_path: 'receipt.jpg' }),
    },
    {
      label: 'date_end',
      completed: makeCompleted({ date_end: '2026-08-01' }),
    },
    {
      label: 'vade_tarihi',
      completed: makeCompleted({ vade_tarihi: '2026-08-01' }),
    },
    {
      label: 'hedef_islem_id',
      completed: makeCompleted({
        hedef_islem_id: '77777777-7777-4777-8777-777777777777',
      }),
    },
    {
      label: 'aynı para biriminde exchange_rate',
      completed: makeCompleted({ exchange_rate: 32.5 }),
    },
  ])(
    'RPC sonucu $label finansal null invariantını bozarsa conflict verir',
    async ({ completed }) => {
      mockScenario.rpc = { data: completed, error: null };

      const hook = renderCompletionHook();
      const outcome = await runMutation(hook);

      expect(outcome.error).toEqual(
        expect.objectContaining({
          message: 'transactions:scheduled.existingRecordConflict',
        })
      );
      expect(mockCancelTransactionReminder).not.toHaveBeenCalled();
    }
  );

  it('kur gönderilmemiş çapraz para sonucunda pozitif server kurunu idempotent kabul eder', async () => {
    mockScenario.rpc = {
      data: makeCompleted({
        source_currency: 'TRY',
        target_currency: 'USD',
        exchange_rate: 32.5,
      }),
      error: null,
    };

    const hook = renderCompletionHook();
    const outcome = await runMutation(hook);

    expect(outcome.error).toBeUndefined();
    expect(outcome.value?.exchange_rate).toBe(32.5);
    expect(mockCancelTransactionReminder).toHaveBeenCalledWith(SCHEDULED_ID);
  });

  it.each([null, 0, -1, Number.NaN])(
    'çapraz para sonucunda geçersiz server kuru %p ise conflict verir',
    async (exchangeRate) => {
      mockScenario.rpc = {
        data: makeCompleted({
          source_currency: 'TRY',
          target_currency: 'USD',
          exchange_rate: exchangeRate,
        }),
        error: null,
      };

      const hook = renderCompletionHook();
      const outcome = await runMutation(hook);

      expect(outcome.error).toEqual(
        expect.objectContaining({
          message: 'transactions:scheduled.existingRecordConflict',
        })
      );
      expect(mockCancelTransactionReminder).not.toHaveBeenCalled();
    }
  );

  it('gönderilen kur ile RPC sonucundaki kur farklıysa conflict verir', async () => {
    mockScenario.rpc = {
      data: makeCompleted({
        source_currency: 'TRY',
        target_currency: 'USD',
        exchange_rate: 32.4,
      }),
      error: null,
    };

    const hook = renderCompletionHook();
    const outcome = await runMutation(
      hook,
      32.5,
      '0123456789abcdef0123456789abcdef'
    );

    expect(outcome.error).toEqual(
      expect.objectContaining({
        message: 'transactions:scheduled.existingRecordConflict',
      })
    );
    expect(mockCancelTransactionReminder).not.toHaveBeenCalled();
  });

  it.each([
    {
      label: 'yetki',
      rpcError: { code: '42501', message: 'permission denied' },
      expected: 'common:errors.permissionDenied',
    },
    {
      label: 'source conflict',
      rpcError: { code: '23505', message: 'duplicate source' },
      expected: 'transactions:scheduled.existingRecordConflict',
    },
    {
      label: 'completed ama source yok',
      rpcError: {
        code: '55000',
        message: 'SCHEDULED_NOT_COMPLETABLE',
      },
      expected: 'transactions:scheduled.completionInProgress',
    },
    {
      label: 'linked cari',
      rpcError: {
        code: '0A000',
        message: 'SCHEDULED_LINKED_CARI_UNSUPPORTED',
      },
      expected: 'transactions:scheduled.linkedCariUnsupported',
    },
    {
      label: 'kur onayı sırasında değişen plan',
      rpcError: {
        code: '55000',
        message: 'SCHEDULED_COMPLETION_CHANGED',
      },
      expected: 'transactions:scheduled.completionChanged',
    },
  ])(
    '$label hatasını kullanıcı mesajına çevirir; probe ve reminder çalıştırmaz',
    async ({ rpcError, expected }) => {
      mockScenario.rpc = { data: null, error: rpcError };

      const hook = renderCompletionHook();
      const outcome = await runMutation(hook);

      expect(outcome.error).toEqual(
        expect.objectContaining({ message: expected })
      );
      expect(mockRpc).toHaveBeenCalledTimes(1);
      expect(mockFrom).not.toHaveBeenCalled();
      expect(mockOrder).toEqual(['rpc']);
      expect(mockCancelTransactionReminder).not.toHaveBeenCalled();
      expect(mockWriteCalls).toEqual([]);
    }
  );

  it('kur zorunluluğunu UIın tanıdığı tipli hataya çevirir', async () => {
    mockScenario.rpc = {
      data: null,
      error: {
        code: 'P0001',
        message:
          'CROSS_CURRENCY_RATE_REQUIRED:TRY->USD:100.00:0123456789abcdef0123456789abcdef',
      },
    };

    const hook = renderCompletionHook();
    const outcome = await runMutation(hook);

    expect(outcome.error).toBeInstanceOf(CrossCurrencyRateRequiredError);
    expect(outcome.error).toMatchObject({
      sourceCurrency: 'TRY',
      targetCurrency: 'USD',
      sourceAmount: 100,
      completionToken: '0123456789abcdef0123456789abcdef',
    });
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockFrom).not.toHaveBeenCalled();
    expect(mockCancelTransactionReminder).not.toHaveBeenCalled();
  });

  it('RPC sonucu exact scheduled completion değilse başarı ve reminder üretmez', async () => {
    mockScenario.rpc = {
      data: makeCompleted({ source_ileri_id: LEGACY_ISLEM_ID }),
      error: null,
    };

    const hook = renderCompletionHook();
    const outcome = await runMutation(hook);

    expect(outcome.error).toEqual(
      expect.objectContaining({
        message: 'transactions:scheduled.existingRecordConflict',
      })
    );
    expect(mockOrder).toEqual(['rpc']);
    expect(mockCancelTransactionReminder).not.toHaveBeenCalled();
  });
});
