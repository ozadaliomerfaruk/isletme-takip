import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { supabase } from '@/lib/supabase';
import { useProductReport } from '../useProductReport';

let mockIsOwner = false;
let mockCanSeeAllUsersData = false;
let mockConversionIncomplete = false;
let mockModules: Record<string, boolean> = {};

const mockCanAccessModule = jest.fn(
  (module: string) => mockIsOwner || mockModules[module] === true,
);

jest.mock('@/contexts/AuthContext', () => ({
  useAuthContext: () => ({
    user: { id: '10000000-0000-4000-8000-000000000001' },
    isletme: { id: '20000000-0000-4000-8000-000000000001' },
    isletmeLoading: false,
  }),
}));

jest.mock('../usePermissions', () => ({
  usePermissions: () => ({
    isOwner: mockIsOwner,
    canAccessModule: mockCanAccessModule,
    canSeeAllUsersData: mockIsOwner || mockCanSeeAllUsersData,
  }),
}));

jest.mock('../useSettings', () => ({
  useSettings: () => ({ currency: 'TRY' }),
}));

jest.mock('../useExchangeRates', () => ({
  useExchangeRates: () => ({ data: { rates: {} }, isLoading: false }),
  createRpcTotalConverter: () => ({
    conv: (amount: number) => amount,
    conversionIncomplete: mockConversionIncomplete,
  }),
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
    },
  });

  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );

  return { queryClient, Wrapper };
}

const options = {
  startDate: '2026-07-01',
  endDate: '2026-07-31',
};

const productRow = {
  urun_id: '30000000-0000-4000-8000-000000000001',
  urun_adi: 'Ürün 1',
  urun_birim: 'adet',
  kategori_id: '40000000-0000-4000-8000-000000000001',
  kategori_adi: 'Kategori 1',
  toplam_miktar: '2',
  toplam_tutar: '100',
  toplam_tutar_kdvsiz: '90',
  islem_sayisi: 1,
};

const returnRow = {
  ...productRow,
  toplam_miktar: 1,
  toplam_tutar: 10,
  toplam_tutar_kdvsiz: 9,
};

describe('useProductReport V2 permission projection', () => {
  const rpcMock = supabase.rpc as jest.Mock;
  let failReturnQuery = false;

  beforeEach(() => {
    jest.clearAllMocks();
    mockIsOwner = false;
    mockCanSeeAllUsersData = false;
    mockConversionIncomplete = false;
    mockModules = {
      raporlar: true,
      urunler: true,
    };
    failReturnQuery = false;

    rpcMock.mockImplementation(
      async (
        name: string,
        params: { p_islem_types?: string[] },
      ) => {
        if (name !== 'get_product_report_v2') {
          throw new Error(`unexpected RPC: ${name}`);
        }
        const isReturn = params.p_islem_types?.some(
          (type) => type.endsWith('_iade'),
        );
        if (isReturn && failReturnQuery) {
          return {
            data: null,
            error: { code: 'XX000', message: 'return query failed' },
          };
        }
        return {
          data: isReturn ? [returnRow] : [productRow],
          error: null,
        };
      },
    );
  });

  it('uses V2 for main and return totals with the Raporlar-only role', async () => {
    mockModules = { raporlar: true };
    const { queryClient, Wrapper } = createWrapper();
    const hook = renderHook(
      () => useProductReport('alis', options),
      { wrapper: Wrapper },
    );

    await waitFor(() => {
      expect(hook.result.current.items).toHaveLength(1);
      expect(hook.result.current.netAmount).toBe(90);
    });

    expect(hook.result.current.totalAmount).toBe(100);
    expect(hook.result.current.totalAmountKdvsiz).toBe(90);
    expect(hook.result.current.returnTotal).toBe(10);
    expect(rpcMock).toHaveBeenCalledTimes(2);
    expect(rpcMock).toHaveBeenNthCalledWith(
      1,
      'get_product_report_v2',
      {
        p_isletme_id: '20000000-0000-4000-8000-000000000001',
        p_islem_types: ['cari_alis'],
        p_start_date: '2026-07-01T00:00:00',
        p_end_date: '2026-07-31T23:59:59',
      },
    );

    hook.unmount();
    queryClient.clear();
  });

  it('uses the same report from the contextual Urunler module', async () => {
    mockModules = { urunler: true };
    const { queryClient, Wrapper } = createWrapper();
    const hook = renderHook(
      () => useProductReport('satis', options),
      { wrapper: Wrapper },
    );

    await waitFor(() => {
      expect(hook.result.current.items).toHaveLength(1);
    });
    expect(rpcMock).toHaveBeenCalledTimes(2);

    hook.unmount();
    queryClient.clear();
  });

  it('does not start either RPC when Raporlar and Urunler are both closed', async () => {
    mockModules = {};
    const { queryClient, Wrapper } = createWrapper();
    const hook = renderHook(
      () => useProductReport('satis', options),
      { wrapper: Wrapper },
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(rpcMock).not.toHaveBeenCalled();
    expect(hook.result.current.items).toEqual([]);
    expect(hook.result.current.netAmount).toBe(0);
    expect(hook.result.current.error).toBeNull();

    hook.unmount();
    queryClient.clear();
  });

  it('masks successful totals immediately when a permission is narrowed', async () => {
    const { queryClient, Wrapper } = createWrapper();
    const hook = renderHook(
      () => useProductReport('alis', options),
      { wrapper: Wrapper },
    );

    await waitFor(() => {
      expect(hook.result.current.totalAmount).toBe(100);
    });

    mockModules = {};
    hook.rerender({});

    expect(hook.result.current.items).toEqual([]);
    expect(hook.result.current.totalAmount).toBe(0);
    expect(hook.result.current.returnTotal).toBe(0);
    expect(hook.result.current.error).toBeNull();
    expect(rpcMock).toHaveBeenCalledTimes(2);

    hook.unmount();
    queryClient.clear();
  });

  it('does not show a gross total with a stale zero return after return refetch fails', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { queryClient, Wrapper } = createWrapper();
    const hook = renderHook(
      () => useProductReport('alis', options),
      { wrapper: Wrapper },
    );

    await waitFor(() => {
      expect(hook.result.current.netAmount).toBe(90);
    });

    failReturnQuery = true;
    await act(async () => {
      await hook.result.current.refetch();
    });

    await waitFor(() => {
      expect(hook.result.current.items).toEqual([]);
      expect(hook.result.current.totalAmount).toBe(0);
      expect(hook.result.current.returnTotal).toBe(0);
      expect(hook.result.current.error).not.toBeNull();
    });
    expect(rpcMock).toHaveBeenCalledTimes(4);
    expect(consoleError).toHaveBeenCalledWith(
      '[useProductReport] returns RPC error:',
      'return query failed',
    );

    hook.unmount();
    queryClient.clear();
    consoleError.mockRestore();
  });

  it('drops malformed rows before they reach totals or product navigation', async () => {
    rpcMock.mockResolvedValue({
      data: [
        productRow,
        { ...productRow, urun_id: 'not-a-uuid', toplam_tutar: 999999 },
      ],
      error: null,
    });
    const { queryClient, Wrapper } = createWrapper();
    const hook = renderHook(
      () => useProductReport('alis', options),
      { wrapper: Wrapper },
    );

    await waitFor(() => {
      expect(hook.result.current.items).toHaveLength(1);
    });
    expect(hook.result.current.totalAmount).toBe(100);

    hook.unmount();
    queryClient.clear();
  });

  it('keeps the conversion warning on a return-only period', async () => {
    mockConversionIncomplete = true;
    rpcMock.mockImplementation(
      async (
        _name: string,
        params: { p_islem_types?: string[] },
      ) => ({
        data: params.p_islem_types?.some((type) => type.endsWith('_iade'))
          ? [returnRow]
          : [],
        error: null,
      }),
    );
    const { queryClient, Wrapper } = createWrapper();
    const hook = renderHook(
      () => useProductReport('alis', options),
      { wrapper: Wrapper },
    );

    await waitFor(() => {
      expect(hook.result.current.returnTotal).toBe(10);
    });
    expect(hook.result.current.items).toEqual([]);
    expect(hook.result.current.netAmount).toBe(-10);
    expect(hook.result.current.conversionIncomplete).toBe(true);

    hook.unmount();
    queryClient.clear();
  });
});
