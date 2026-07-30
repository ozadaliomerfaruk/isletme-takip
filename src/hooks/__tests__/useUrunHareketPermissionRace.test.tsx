import React, { type PropsWithChildren } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import {
  useCreateUrunHareket,
  useCreateUrunHareketWithCari,
  useDeleteUrunHareket,
  useUpdateUrunHareket,
} from '@/hooks/useUrunHareketler';

const BUSINESS_ID = 'business-a';
let mockCanCreateByModule: Record<string, boolean>;
let mockCanAccessByModule: Record<string, boolean>;
let mockCanUpdateOwn: boolean;
let mockCanDeleteOwn: boolean;
let queryClient: QueryClient;

jest.mock('@/contexts/AuthContext', () => ({
  useAuthContext: () => ({
    isletme: { id: BUSINESS_ID },
    user: { id: 'viewer' },
  }),
}));

jest.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({
    isOwner: false,
    canAccessModule: (module: string) =>
      mockCanAccessByModule[module] === true,
    canCreate: (module: string) =>
      mockCanCreateByModule[module] === true,
    canUpdate: (_module: string, createdBy: string | null) =>
      mockCanUpdateOwn && createdBy === 'viewer',
    canDelete: (_module: string, createdBy: string | null) =>
      mockCanDeleteOwn && createdBy === 'viewer',
  }),
}));

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

async function flushQueryNotifications() {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

describe('ürün hareketi mutation permission race', () => {
  const fromMock = supabase.from as jest.Mock;
  const rpcMock = supabase.rpc as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCanCreateByModule = {
      urunler: true,
      cariler: true,
      islemler: true,
    };
    mockCanAccessByModule = {
      urunler: true,
      cariler: true,
      islemler: true,
    };
    mockCanUpdateOwn = true;
    mockCanDeleteOwn = true;
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('ürün fetch sürerken create izni daralırsa ilk write çağrısına girmez', async () => {
    let resolveProductFetch!: (value: {
      data: { miktar: number; isletme_id: string };
      error: null;
    }) => void;
    const productFetch = new Promise<{
      data: { miktar: number; isletme_id: string };
      error: null;
    }>((resolve) => {
      resolveProductFetch = resolve;
    });
    const query = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn(() => productFetch),
    };
    fromMock.mockReturnValue(query);

    const hook = renderHook(() => useCreateUrunHareket(), {
      wrapper: createWrapper(),
    });

    let mutation!: Promise<unknown>;
    act(() => {
      mutation = hook.result.current.mutateAsync({
        urun_id: 'product-a',
        hareket_tipi: 'giris',
        miktar: 2,
      });
    });
    await waitFor(() => expect(query.single).toHaveBeenCalledTimes(1));

    mockCanCreateByModule.urunler = false;
    hook.rerender({});

    await act(async () => {
      resolveProductFetch({
        data: { miktar: 10, isletme_id: BUSINESS_ID },
        error: null,
      });
      await expect(mutation).rejects.toMatchObject({
        code: '42501',
        action: 'create',
        reason: 'permission',
        module: 'urunler',
      });
      await flushQueryNotifications();
    });

    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('hareket fetch sürerken update izni daralırsa stok write çağrısına girmez', async () => {
    let resolveMovementFetch!: (value: {
      data: {
        id: string;
        isletme_id: string;
        urun_id: string;
        islem_id: null;
        hareket_tipi: 'giris';
        miktar: number;
        created_by: string;
      };
      error: null;
    }) => void;
    const movementFetch = new Promise<{
      data: {
        id: string;
        isletme_id: string;
        urun_id: string;
        islem_id: null;
        hareket_tipi: 'giris';
        miktar: number;
        created_by: string;
      };
      error: null;
    }>((resolve) => {
      resolveMovementFetch = resolve;
    });
    const query = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn(() => movementFetch),
    };
    fromMock.mockReturnValue(query);

    const hook = renderHook(() => useUpdateUrunHareket(), {
      wrapper: createWrapper(),
    });
    let mutation!: Promise<unknown>;
    act(() => {
      mutation = hook.result.current.mutateAsync({
        id: 'movement-a',
        miktar: 3,
        birim_fiyat: null,
        hareket_tipi: 'giris',
      });
    });
    await waitFor(() => expect(query.single).toHaveBeenCalledTimes(1));

    mockCanUpdateOwn = false;
    hook.rerender({});

    await act(async () => {
      resolveMovementFetch({
        data: {
          id: 'movement-a',
          isletme_id: BUSINESS_ID,
          urun_id: 'product-a',
          islem_id: null,
          hareket_tipi: 'giris',
          miktar: 2,
          created_by: 'viewer',
        },
        error: null,
      });
      await expect(mutation).rejects.toMatchObject({
        code: '42501',
        action: 'update',
        reason: 'permission',
        module: 'urunler',
      });
      await flushQueryNotifications();
    });

    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('silme commitinden önce güncel hareket sahibi ve delete izni yeniden okunur', async () => {
    const query = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: {
          id: 'movement-a',
          isletme_id: BUSINESS_ID,
          urun_id: 'product-a',
          islem_id: null,
          hareket_tipi: 'giris',
          miktar: 2,
          created_by: 'viewer',
        },
        error: null,
      }),
    };
    fromMock.mockReturnValue(query);
    mockCanDeleteOwn = false;

    const hook = renderHook(() => useDeleteUrunHareket(), {
      wrapper: createWrapper(),
    });
    await act(async () => {
      await expect(
        hook.result.current.mutateAsync('movement-a'),
      ).rejects.toMatchObject({
        code: '42501',
        action: 'delete',
        reason: 'permission',
        module: 'urunler',
      });
      await flushQueryNotifications();
    });

    expect(query.select).toHaveBeenCalledWith('*');
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it.each([
    ['cariler erişimi', 'cariler'],
    ['işlem create', 'islemler'],
  ] as const)(
    'cari-linked create için %s kapalıyken atomik RPCye girmez',
    async (_deniedCapability, expectedModule) => {
      if (expectedModule === 'cariler') {
        mockCanAccessByModule.cariler = false;
      } else {
        mockCanCreateByModule.islemler = false;
      }
      const hook = renderHook(() => useCreateUrunHareketWithCari(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await expect(
          hook.result.current.mutateAsync({
            urun_id: 'product-a',
            urun_ad: 'Ürün',
            hareket_tipi: 'giris',
            miktar: 1,
            birim_fiyat: 100,
            kdv_orani: 20,
            cari_id: 'cari-a',
          }),
        ).rejects.toMatchObject({
          code: '42501',
          action: 'create',
          reason: 'permission',
          module: expectedModule,
        });
        await flushQueryNotifications();
      });

      expect(rpcMock).not.toHaveBeenCalled();
      expect(fromMock).not.toHaveBeenCalled();
    },
  );
});
