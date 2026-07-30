import React, { type PropsWithChildren } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Islem, IslemInsert } from '@/types/database';
import {
  useCreateIslem,
  useCreateIslemV2,
  useDeleteIslem,
  useUpdateIslem,
} from '@/hooks/useIslemler';
import type { CreateIslemV2Input } from '@/lib/createIslemV2Client';

type DbResult<T> = { data: T; error: unknown };
type PermissionAction = Record<string, boolean | undefined>;

const BUSINESS_A = 'business-a';
const BUSINESS_B = 'business-b';
const USER_ID = 'viewer';
const SHARED_TRANSACTION_ID = '11111111-1111-4111-8111-111111111111';
const SHARED_CARI_ID = '22222222-2222-4222-8222-222222222222';
const SHARED_CREATOR_ID = '33333333-3333-4333-8333-333333333333';

let mockBusinessId: string;
let mockUserId: string;
let mockIsOwner: boolean;
let mockAccess: PermissionAction;
let mockCreate: PermissionAction;
let mockUpdate: PermissionAction;
let mockDelete: PermissionAction;
let mockCanCreateCalls: string[];
let mockCanUpdateCalls: string[];
let mockCanDeleteCalls: string[];
let mockCanAccessCalls: string[];
let mockSingleQueues: Record<string, Array<Promise<DbResult<unknown>>>>;
let mockSingleCalls: string[];
let queryClient: QueryClient;

const mockRpc = jest.fn();

function mockCreateQuery(table: string) {
  const query = {
    select: jest.fn(),
    eq: jest.fn(),
    single: jest.fn(),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.single.mockImplementation(() => {
    mockSingleCalls.push(table);
    const next = mockSingleQueues[table]?.shift();
    if (!next) {
      return Promise.reject(new Error(`Beklenmeyen single çağrısı: ${table}`));
    }
    return next;
  });
  return query;
}

const mockFrom = jest.fn((table: string) => mockCreateQuery(table));

jest.mock('@/contexts/AuthContext', () => ({
  useAuthContext: () => ({
    isletme: mockBusinessId ? { id: mockBusinessId } : null,
    user: mockUserId ? { id: mockUserId } : null,
  }),
}));

jest.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({
    isOwner: mockIsOwner,
    canAccessModule: (module: string) => {
      mockCanAccessCalls.push(module);
      return mockAccess[module] === true;
    },
    canCreate: (module: string) => {
      mockCanCreateCalls.push(module);
      return mockCreate[module] === true;
    },
    canUpdate: (module: string) => {
      mockCanUpdateCalls.push(module);
      return mockUpdate[module] === true;
    },
    canDelete: (module: string) => {
      mockCanDeleteCalls.push(module);
      return mockDelete[module] === true;
    },
  }),
}));

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => mockFrom(table),
    rpc: (name: string, args: unknown) => mockRpc(name, args),
  },
}));

jest.mock('@/lib/appEvents', () => ({
  logEvent: jest.fn(),
}));

function enqueueSingle<T>(table: string, result: DbResult<T> | Promise<DbResult<T>>) {
  mockSingleQueues[table] ??= [];
  mockSingleQueues[table].push(Promise.resolve(result) as Promise<DbResult<unknown>>);
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function createWrapper() {
  queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false, gcTime: Infinity },
    },
  });
  return function Wrapper({ children }: PropsWithChildren) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );
  };
}

async function flushNotifications() {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

function baseIslem(type: Islem['type'] = 'cari_satis'): Islem {
  return {
    id: 'transaction-a',
    isletme_id: BUSINESS_A,
    type,
    amount: 100,
    description: null,
    date: '2026-07-29',
    hesap_id: null,
    hedef_hesap_id: null,
    kategori_id: null,
    cari_id: type.startsWith('cari_') ? 'cari-a' : null,
    personel_id: type.startsWith('personel_') ? 'person-a' : null,
    source_currency: 'TRY',
    target_currency: 'TRY',
    exchange_rate: 1,
    photo_path: null,
    date_end: null,
    source_ileri_id: null,
    vade_tarihi: null,
    created_by: USER_ID,
    updated_by: USER_ID,
    created_at: '2026-07-29T12:00:00Z',
    updated_at: '2026-07-29T12:00:00Z',
  };
}

const createInput: Omit<IslemInsert, 'isletme_id'> = {
  type: 'cari_satis',
  amount: 100,
  cari_id: 'cari-a',
};

const v2CreateInput: CreateIslemV2Input = {
  id: '11111111-1111-4111-8111-111111111111',
  type: 'gelir',
  amount: 100,
  hesap_id: 'account-a',
  date: '2026-07-29T12:00:00+03:00',
};

function v2Row() {
  return {
    id: v2CreateInput.id,
    type: 'gelir',
    amount: 100,
    description: null,
    date: v2CreateInput.date,
    hesap_id: 'account-a',
    hedef_hesap_id: null,
    kategori_id: null,
    cari_id: null,
    personel_id: null,
    source_currency: 'TRY',
    target_currency: 'TRY',
    exchange_rate: null,
    date_end: null,
    vade_tarihi: null,
    hedef_islem_id: null,
    created_at: '2026-07-29T09:00:00Z',
    created_by: USER_ID,
  };
}

function sharedMutationContext(amount = 100) {
  return {
    id: SHARED_TRANSACTION_ID,
    type: 'cari_satis',
    amount,
    description: 'Eski aÃ§Ä±klama',
    date: '2026-07-29T12:00:00',
    hesap_id: null,
    hedef_hesap_id: null,
    kategori_id: null,
    cari_id: SHARED_CARI_ID,
    personel_id: null,
    source_currency: 'TRY',
    target_currency: 'TRY',
    exchange_rate: null,
    date_end: null,
    vade_tarihi: null,
    created_by: SHARED_CREATOR_ID,
  };
}

describe('işlem mutation permission race', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRpc.mockReset();
    mockBusinessId = BUSINESS_A;
    mockUserId = USER_ID;
    mockIsOwner = true;
    mockAccess = {
      hesaplar: true,
      cariler: true,
      personel: true,
      urunler: true,
    };
    mockCreate = { islemler: true };
    mockUpdate = { islemler: true };
    mockDelete = { islemler: true };
    mockCanCreateCalls = [];
    mockCanUpdateCalls = [];
    mockCanDeleteCalls = [];
    mockCanAccessCalls = [];
    mockSingleQueues = {};
    mockSingleCalls = [];
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('client UUID-backed normal create uses V2 and unwraps its table response', async () => {
    mockRpc.mockResolvedValueOnce({ data: [v2Row()], error: null });
    const hook = renderHook(() => useCreateIslemV2(), {
      wrapper: createWrapper(),
    });

    let result: unknown;
    await act(async () => {
      result = await hook.result.current.mutateAsync(v2CreateInput);
      await flushNotifications();
    });

    expect(result).toMatchObject({
      id: v2CreateInput.id,
      isletme_id: BUSINESS_A,
      source_currency: 'TRY',
    });
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith('create_islem_atomik_v2', {
      p_isletme_id: BUSINESS_A,
      p_new_row: v2CreateInput,
    });
    expect(mockRpc.mock.calls[0][1]).not.toHaveProperty('p_balance_ops');
  });

  it('never falls back to V1 after a V2 error', async () => {
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'network request failed' },
    });
    const hook = renderHook(() => useCreateIslemV2(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await expect(
        hook.result.current.mutateAsync(v2CreateInput),
      ).rejects.toMatchObject({ message: 'network request failed' });
      await flushNotifications();
    });

    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc.mock.calls[0][0]).toBe('create_islem_atomik_v2');
  });

  it('shared update uses narrow context and V2 without client balance operations', async () => {
    mockIsOwner = false;
    const updatedContext = {
      ...sharedMutationContext(125),
      description: 'Yeni aÃ§Ä±klama',
      date: '2026-07-30T13:15:00',
    };
    mockRpc
      .mockResolvedValueOnce({
        data: [sharedMutationContext()],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [updatedContext],
        error: null,
      });

    const hook = renderHook(() => useUpdateIslem(), {
      wrapper: createWrapper(),
    });

    let result: unknown;
    await act(async () => {
      result = await hook.result.current.mutateAsync({
        id: SHARED_TRANSACTION_ID,
        updates: {
          type: 'cari_satis',
          amount: 125,
          description: 'Yeni aÃ§Ä±klama',
          date: '2026-07-30T13:15:00',
          hesap_id: null,
          hedef_hesap_id: null,
          kategori_id: null,
          cari_id: SHARED_CARI_ID,
          personel_id: null,
          source_currency: 'TRY',
          target_currency: 'TRY',
          exchange_rate: null,
          date_end: null,
          vade_tarihi: null,
        },
      });
      await flushNotifications();
    });

    expect(result).toMatchObject({
      id: SHARED_TRANSACTION_ID,
      isletme_id: BUSINESS_A,
      amount: 125,
    });
    expect(mockFrom).not.toHaveBeenCalledWith('islemler');
    expect(mockRpc).toHaveBeenNthCalledWith(
      1,
      'get_islem_mutation_context_v1',
      {
        p_isletme_id: BUSINESS_A,
        p_islem_id: SHARED_TRANSACTION_ID,
        p_action: 'update',
      },
    );
    expect(mockRpc).toHaveBeenNthCalledWith(
      2,
      'update_islem_atomik_v2',
      {
        p_isletme_id: BUSINESS_A,
        p_islem_id: SHARED_TRANSACTION_ID,
        p_patch: {
          type: 'cari_satis',
          amount: 125,
          description: 'Yeni aÃ§Ä±klama',
          date: '2026-07-30T13:15:00',
          hesap_id: null,
          hedef_hesap_id: null,
          kategori_id: null,
          cari_id: SHARED_CARI_ID,
          personel_id: null,
          source_currency: 'TRY',
          target_currency: 'TRY',
          exchange_rate: null,
          date_end: null,
          vade_tarihi: null,
        },
      },
    );
    expect(mockRpc.mock.calls.flat()).not.toContain('update_islem_atomik');
    expect(mockRpc.mock.calls[1][1]).not.toHaveProperty('p_balance_ops');
  });

  it.each(['permission', 'tenant'] as const)(
    'shared update context await sÄ±rasÄ±nda %s daralÄ±rsa V2 write RPC yok',
    async (kind) => {
      mockIsOwner = false;
      const contextFetch = deferred<DbResult<unknown>>();
      mockRpc.mockReturnValueOnce(contextFetch.promise);
      const hook = renderHook(() => useUpdateIslem(), {
        wrapper: createWrapper(),
      });

      let mutation!: Promise<unknown>;
      act(() => {
        mutation = hook.result.current.mutateAsync({
          id: SHARED_TRANSACTION_ID,
          updates: { amount: 125 },
        });
      });
      await waitFor(() =>
        expect(mockRpc).toHaveBeenCalledWith(
          'get_islem_mutation_context_v1',
          expect.any(Object),
        ),
      );

      if (kind === 'permission') mockUpdate.islemler = false;
      else mockBusinessId = BUSINESS_B;
      hook.rerender({});

      await act(async () => {
        contextFetch.resolve({
          data: [sharedMutationContext()],
          error: null,
        });
        await expect(mutation).rejects.toMatchObject({
          name: 'TransactionPermissionError',
          code: '42501',
          action: 'update',
          reason: 'permission',
        });
        await flushNotifications();
      });

      expect(
        mockRpc.mock.calls.some(([name]) => name === 'update_islem_atomik_v2'),
      ).toBe(false);
    },
  );

  it('shared delete uses context plus V2 and never sends reverse balance ops', async () => {
    mockIsOwner = false;
    mockRpc
      .mockResolvedValueOnce({
        data: [sharedMutationContext()],
        error: null,
      })
      .mockResolvedValueOnce({
        data: SHARED_TRANSACTION_ID,
        error: null,
      });
    const hook = renderHook(() => useDeleteIslem(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await hook.result.current.mutateAsync(SHARED_TRANSACTION_ID);
      await flushNotifications();
    });

    expect(mockFrom).not.toHaveBeenCalledWith('islemler');
    expect(mockRpc).toHaveBeenNthCalledWith(
      2,
      'delete_islem_atomik_v2',
      {
        p_isletme_id: BUSINESS_A,
        p_islem_id: SHARED_TRANSACTION_ID,
      },
    );
    expect(mockRpc.mock.calls.flat()).not.toContain('delete_islem_atomik');
    expect(mockRpc.mock.calls[1][1]).not.toHaveProperty('p_balance_ops');
  });

  it('shared malformed context fails closed before a write RPC', async () => {
    mockIsOwner = false;
    mockRpc.mockResolvedValueOnce({
      data: [{ ...sharedMutationContext(), id: 'not-a-uuid' }],
      error: null,
    });
    const hook = renderHook(() => useUpdateIslem(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await expect(
        hook.result.current.mutateAsync({
          id: SHARED_TRANSACTION_ID,
          updates: { amount: 125 },
        }),
      ).rejects.toThrow('Invalid transaction mutation context field: id');
      await flushNotifications();
    });

    expect(mockRpc).toHaveBeenCalledTimes(1);
  });

  it('rejects linked-cari V2 locally without calling either write endpoint', async () => {
    enqueueSingle('cariler', {
      data: { isletme_id: 'linked-owner-business', type: 'musteri' },
      error: null,
    });
    enqueueSingle('cari_links', {
      data: { viewer_type: 'tedarikci' },
      error: null,
    });
    const hook = renderHook(() => useCreateIslemV2(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await expect(
        hook.result.current.mutateAsync({
          ...v2CreateInput,
          type: 'cari_satis',
          hesap_id: null,
          cari_id: 'linked-cari-a',
        }),
      ).rejects.toMatchObject({
        code: '0A000',
        message: 'ISLEM_V2_CLIENT_UNSUPPORTED',
      });
      await flushNotifications();
    });

    expect(mockRpc).not.toHaveBeenCalled();
  });

  it.each(['source', 'tenant'] as const)(
    'linked-cari create await sırasında %s daralırsa typed 42501 ve RPC yok',
    async (kind) => {
      const linkFetch = deferred<DbResult<{ isletme_id: string; type: string }>>();
      enqueueSingle('cariler', linkFetch.promise);
      const hook = renderHook(() => useCreateIslem(), { wrapper: createWrapper() });
      let mutation!: Promise<unknown>;
      act(() => {
        mutation = hook.result.current.mutateAsync(createInput);
      });
      await waitFor(() => expect(mockSingleCalls).toContain('cariler'));

      if (kind === 'source') mockAccess.cariler = false;
      else mockBusinessId = BUSINESS_B;
      hook.rerender({});

      await act(async () => {
        linkFetch.resolve({
          data: { isletme_id: BUSINESS_A, type: 'musteri' },
          error: null,
        });
        await expect(mutation).rejects.toMatchObject({
          name: 'TransactionPermissionError',
          code: '42501',
          action: 'create',
          reason: 'permission',
        });
        await flushNotifications();
      });
      expect(mockRpc).not.toHaveBeenCalled();
    },
  );

  it.each(['action', 'new-source'] as const)(
    'update old-row fetch sonrası %s daralırsa update RPC yok',
    async (kind) => {
      enqueueSingle('islemler', { data: baseIslem(), error: null });
      const inversion = deferred<DbResult<{ isletme_id: string; type: string }>>();
      enqueueSingle('cariler', inversion.promise);
      const hook = renderHook(() => useUpdateIslem(), { wrapper: createWrapper() });
      let mutation!: Promise<unknown>;
      act(() => {
        mutation = hook.result.current.mutateAsync({
          id: 'transaction-a',
          updates: {
            type: 'personel_satis',
            cari_id: null,
            personel_id: 'person-a',
          },
        });
      });
      await waitFor(() => expect(mockSingleCalls).toContain('cariler'));

      if (kind === 'action') mockUpdate.islemler = false;
      else mockAccess.personel = false;
      hook.rerender({});

      await act(async () => {
        inversion.resolve({
          data: { isletme_id: BUSINESS_A, type: 'musteri' },
          error: null,
        });
        await expect(mutation).rejects.toMatchObject({
          name: 'TransactionPermissionError',
          code: '42501',
          action: 'update',
          reason: 'permission',
        });
        await flushNotifications();
      });
      expect(mockRpc).not.toHaveBeenCalled();
    },
  );

  it.each(['permission', 'tenant'] as const)(
    'delete fetch/inversion arasında %s daralırsa delete RPC yok',
    async (kind) => {
      enqueueSingle('islemler', { data: baseIslem(), error: null });
      const inversion = deferred<DbResult<{ isletme_id: string; type: string }>>();
      enqueueSingle('cariler', inversion.promise);
      const hook = renderHook(() => useDeleteIslem(), { wrapper: createWrapper() });
      let mutation!: Promise<unknown>;
      act(() => {
        mutation = hook.result.current.mutateAsync('transaction-a');
      });
      await waitFor(() => expect(mockSingleCalls).toContain('cariler'));

      if (kind === 'permission') mockDelete.islemler = false;
      else mockBusinessId = BUSINESS_B;
      hook.rerender({});

      await act(async () => {
        inversion.resolve({
          data: { isletme_id: BUSINESS_A, type: 'musteri' },
          error: null,
        });
        await expect(mutation).rejects.toMatchObject({
          name: 'TransactionPermissionError',
          code: '42501',
          action: 'delete',
          reason: 'permission',
        });
        await flushNotifications();
      });
      expect(mockRpc).not.toHaveBeenCalled();
    },
  );

  it('legacy kaynak action=false iken görünürlük+islemler action ile create/update çalışır', async () => {
    mockCreate.cariler = false;
    mockUpdate.cariler = false;
    mockUpdate.personel = false;
    enqueueSingle('cariler', {
      data: { isletme_id: BUSINESS_A, type: 'musteri' },
      error: null,
    });
    mockRpc.mockResolvedValueOnce({ data: baseIslem(), error: null });
    const createHook = renderHook(() => useCreateIslem(), { wrapper: createWrapper() });
    await act(async () => {
      await createHook.result.current.mutateAsync(createInput);
      await flushNotifications();
    });

    enqueueSingle('islemler', { data: baseIslem(), error: null });
    enqueueSingle('cariler', {
      data: { isletme_id: BUSINESS_A, type: 'musteri' },
      error: null,
    });
    mockRpc.mockResolvedValueOnce({
      data: baseIslem('personel_satis'),
      error: null,
    });
    const updateHook = renderHook(() => useUpdateIslem(), { wrapper: createWrapper() });
    await act(async () => {
      await updateHook.result.current.mutateAsync({
        id: 'transaction-a',
        updates: {
          type: 'personel_satis',
          cari_id: null,
          personel_id: 'person-a',
        },
      });
      await flushNotifications();
    });

    expect(mockRpc).toHaveBeenNthCalledWith(
      1,
      'create_islem_atomik',
      expect.any(Object),
    );
    expect(mockRpc).toHaveBeenNthCalledWith(
      2,
      'update_islem_atomik',
      expect.any(Object),
    );
    expect(mockCanCreateCalls).toEqual(['islemler', 'islemler']);
    expect(mockCanUpdateCalls.every((module) => module === 'islemler')).toBe(true);
    expect(mockCanAccessCalls).toEqual(
      expect.arrayContaining(['cariler', 'personel']),
    );
  });
});
