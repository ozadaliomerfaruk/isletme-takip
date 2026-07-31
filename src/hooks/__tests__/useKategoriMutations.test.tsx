import React, { PropsWithChildren } from 'react';
import { act, renderHook } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import {
  useCreateKategori,
  useDeleteKategori,
  useUpdateKategori,
} from '@/hooks/useKategoriler';

let mockIsOwner = true;
const mockIsletme = { id: 'business-1' };
let queryClient: QueryClient;

jest.mock('@/contexts/AuthContext', () => ({
  useAuthContext: () => ({
    isletme: mockIsletme,
    isletmeLoading: false,
    isOwner: mockIsOwner,
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

describe('kategori mutation owner-only guards', () => {
  const fromMock = supabase.from as jest.Mock;
  const rpcMock = supabase.rpc as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockIsOwner = true;
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('shared kullanici create istegini Supabase cagrisi yapmadan reddeder', async () => {
    mockIsOwner = false;
    const hook = renderHook(() => useCreateKategori(), { wrapper: createWrapper() });

    await act(async () => {
      await expect(
        hook.result.current.mutateAsync({ name: 'Test', type: 'gelir' })
      ).rejects.toThrow('common:errors.permissionDenied');
      await flushQueryNotifications();
    });

    expect(fromMock).not.toHaveBeenCalled();
  });

  it('shared kullanici update istegini Supabase cagrisi yapmadan reddeder', async () => {
    mockIsOwner = false;
    const hook = renderHook(() => useUpdateKategori(), { wrapper: createWrapper() });

    await act(async () => {
      await expect(
        hook.result.current.mutateAsync({ id: 'category-1', name: 'Yeni ad' })
      ).rejects.toThrow('common:errors.permissionDenied');
      await flushQueryNotifications();
    });

    expect(fromMock).not.toHaveBeenCalled();
  });

  it('shared kullanici archive RPC istegini Supabase cagrisi yapmadan reddeder', async () => {
    mockIsOwner = false;
    const hook = renderHook(() => useDeleteKategori(), { wrapper: createWrapper() });

    await act(async () => {
      await expect(
        hook.result.current.mutateAsync('category-1')
      ).rejects.toThrow('common:errors.permissionDenied');
      await flushQueryNotifications();
    });

    expect(rpcMock).not.toHaveBeenCalled();
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('owner silmede coklu tablo istegi yerine tek atomik RPC cagirir', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: null });
    const hook = renderHook(() => useDeleteKategori(), { wrapper: createWrapper() });

    await act(async () => {
      await hook.result.current.mutateAsync('category-1');
      await flushQueryNotifications();
    });

    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock).toHaveBeenCalledWith('archive_kategori_atomik', {
      p_isletme_id: 'business-1',
      p_kategori_id: 'category-1',
    });
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('bagli islem server kodunu kullanici dostu mesaja cevirir', async () => {
    rpcMock.mockResolvedValueOnce({
      data: null,
      error: { code: '23503', message: 'CATEGORY_HAS_TRANSACTIONS' },
    });
    const hook = renderHook(() => useDeleteKategori(), { wrapper: createWrapper() });

    await act(async () => {
      await expect(
        hook.result.current.mutateAsync('category-1')
      ).rejects.toThrow('errors:category.hasTransactions');
      await flushQueryNotifications();
    });
  });
});
