import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { supabase } from '@/lib/supabase';
import {
  useIncomeSourceReport,
  useIncomeSourceTransactions,
} from '../useAccountReport';

let mockIsOwner = false;
let mockCanSeeAllUsersData = false;
let mockModules: Record<string, boolean> = {};

const mockCanAccessModule = jest.fn(
  (module: string) => mockIsOwner || mockModules[module] === true,
);

jest.mock('@/contexts/AuthContext', () => ({
  useAuthContext: () => ({
    user: { id: 'user-1' },
    isletme: { id: 'business-1' },
    isletmeLoading: false,
  }),
}));

jest.mock('../usePermissions', () => ({
  usePermissions: () => ({
    isOwner: mockIsOwner,
    canAccessModule: mockCanAccessModule,
    canSeeAllUsersData: mockIsOwner || mockCanSeeAllUsersData,
    canUseBirikim: mockIsOwner || mockModules.birikim === true,
  }),
}));

jest.mock('../useSettings', () => ({
  useSettings: () => ({ currency: 'TRY' }),
}));

jest.mock('../useExchangeRates', () => ({
  useExchangeRates: () => ({ data: { rates: {} }, isLoading: false }),
  createRpcTotalConverter: () => ({
    conv: (amount: number) => amount,
    conversionIncomplete: false,
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

const cariRow = {
  source_kind: 'cari',
  source_type: 'cari',
  source_id: 'cari-1',
  source_name: 'Cari 1',
  source_currency: 'TRY',
  islem_count: 2,
  total_amount: 120,
  total_native: 120,
};

const hesapRow = {
  source_kind: 'hesap',
  source_type: 'banka',
  source_id: 'account-1',
  source_name: 'Banka',
  source_currency: 'TRY',
  islem_count: 1,
  total_amount: 80,
  total_native: 80,
};

const birikimRow = {
  ...hesapRow,
  source_type: 'birikim',
  source_id: 'savings-1',
  source_name: 'Birikim',
};

describe('useIncomeSourceReport permission projection', () => {
  const rpcMock = supabase.rpc as jest.Mock;
  const fromMock = supabase.from as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockIsOwner = false;
    mockCanSeeAllUsersData = false;
    mockModules = {
      raporlar: true,
      cariler: true,
    };
    fromMock.mockImplementation(() => {
      throw new Error('unexpected direct table query');
    });
    rpcMock.mockResolvedValue({
      data: [cariRow, hesapRow],
      error: null,
    });
  });

  it('shows every report source with the Raporlar-only role', async () => {
    mockModules = { raporlar: true };
    const { queryClient, Wrapper } = createWrapper();
    const hook = renderHook(
      () => useIncomeSourceReport(options),
      { wrapper: Wrapper },
    );

    await waitFor(() => {
      expect(hook.result.current.groups).toHaveLength(2);
    });

    expect(
      hook.result.current.groups.map((group) => group.kind),
    ).toEqual(expect.arrayContaining(['cari', 'hesap']));
    expect(hook.result.current.totalAmount).toBe(200);
    expect(hook.result.current.canOpenDetails).toBe(true);
    expect(rpcMock).toHaveBeenCalledWith(
      'get_income_by_source_v2',
      {
        p_isletme_id: 'business-1',
        p_start_date: '2026-07-01T00:00:00',
        p_end_date: '2026-07-31T23:59:59',
      },
    );

    hook.unmount();
    queryClient.clear();
  });

  it('supports a contextual source module without Raporlar', async () => {
    mockModules = { cariler: true };
    const { queryClient, Wrapper } = createWrapper();
    const hook = renderHook(
      () => useIncomeSourceReport(options),
      { wrapper: Wrapper },
    );

    await waitFor(() => {
      expect(hook.result.current.groups).toHaveLength(1);
    });
    expect(hook.result.current.groups[0].kind).toBe('cari');
    expect(hook.result.current.totalAmount).toBe(120);

    hook.unmount();
    queryClient.clear();
  });

  it('does not call the RPC when reports and every source module are closed', async () => {
    mockModules = {};
    const { queryClient, Wrapper } = createWrapper();
    const hook = renderHook(
      () => useIncomeSourceReport(options),
      { wrapper: Wrapper },
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(rpcMock).not.toHaveBeenCalled();
    expect(hook.result.current.groups).toEqual([]);
    expect(hook.result.current.totalAmount).toBe(0);

    hook.unmount();
    queryClient.clear();
  });

  it('drops savings sources when the savings sub-permission is closed', async () => {
    mockModules = { hesaplar: true, birikim: false };
    rpcMock.mockResolvedValue({
      data: [hesapRow, birikimRow],
      error: null,
    });
    const { queryClient, Wrapper } = createWrapper();
    const hook = renderHook(
      () => useIncomeSourceReport(options),
      { wrapper: Wrapper },
    );

    await waitFor(() => {
      expect(hook.result.current.groups).toHaveLength(1);
    });

    expect(hook.result.current.groups[0].items).toHaveLength(1);
    expect(hook.result.current.groups[0].items[0].id).toBe('account-1');

    hook.unmount();
    queryClient.clear();
  });

  it('masks the previous aggregate immediately when permission is narrowed', async () => {
    const { queryClient, Wrapper } = createWrapper();
    const hook = renderHook(
      () => useIncomeSourceReport(options),
      { wrapper: Wrapper },
    );

    await waitFor(() => {
      expect(hook.result.current.totalAmount).toBe(200);
    });

    mockModules = {};
    hook.rerender({});

    expect(hook.result.current.groups).toEqual([]);
    expect(hook.result.current.totalAmount).toBe(0);
    expect(hook.result.current.error).toBeNull();
    expect(rpcMock).toHaveBeenCalledTimes(1);

    hook.unmount();
    queryClient.clear();
  });

  it('does not keep successful stale totals visible after a refetch error', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    rpcMock
      .mockResolvedValueOnce({ data: [cariRow], error: null })
      .mockResolvedValueOnce({
        data: null,
        error: { code: 'XX000', message: 'refetch failed' },
      });
    const { queryClient, Wrapper } = createWrapper();
    const hook = renderHook(
      () => useIncomeSourceReport(options),
      { wrapper: Wrapper },
    );

    await waitFor(() => {
      expect(hook.result.current.totalAmount).toBe(120);
    });

    await act(async () => {
      await hook.result.current.refetch();
    });

    await waitFor(() => {
      expect(hook.result.current.groups).toEqual([]);
      expect(hook.result.current.totalAmount).toBe(0);
      expect(hook.result.current.error).not.toBeNull();
    });
    expect(consoleError).toHaveBeenCalledWith(
      '[useIncomeSourceReport] RPC error:',
      'refetch failed',
      'XX000',
    );

    hook.unmount();
    queryClient.clear();
    consoleError.mockRestore();
  });

  it('uses the narrow cursor RPC for shared drill-down and rejects invalid sources', async () => {
    mockModules = { cariler: true };
    const row = {
      id: 'transaction-1',
      type: 'cari_satis',
      amount: 120,
      description: null,
      date: '2026-07-15T12:00:00',
      cari: {
        id: 'cari-1',
        name: 'Cari 1',
        type: 'musteri',
      },
    };
    rpcMock.mockImplementation((rpcName: string) => {
      if (rpcName === 'get_gelir_kaynagi_islem_satirlari_v1') {
        return Promise.resolve({ data: [row], error: null });
      }
      return Promise.resolve({ data: [cariRow, hesapRow], error: null });
    });
    const { queryClient, Wrapper } = createWrapper();
    const sharedHook = renderHook(
      () => useIncomeSourceTransactions('cari', 'cari-1', options),
      { wrapper: Wrapper },
    );
    const invalidHook = renderHook(
      () => useIncomeSourceTransactions(null, 'account-1', options),
      { wrapper: Wrapper },
    );

    await waitFor(() => {
      expect(sharedHook.result.current.data).toHaveLength(1);
    });

    expect(fromMock).not.toHaveBeenCalled();
    expect(rpcMock).toHaveBeenCalledWith(
      'get_gelir_kaynagi_islem_satirlari_v1',
      {
        p_isletme_id: 'business-1',
        p_kind: 'cari',
        p_source_id: 'cari-1',
        p_start_date: '2026-07-01T00:00:00',
        p_end_date: '2026-07-31T23:59:59',
        p_limit: 100,
        p_before_date: null,
        p_before_id: null,
      },
    );
    expect(invalidHook.result.current.data).toEqual([]);

    sharedHook.unmount();
    invalidHook.unmount();
    queryClient.clear();
  });

  it('keeps the existing paginated direct drill-down available to the owner', async () => {
    mockIsOwner = true;
    const row = {
      id: 'transaction-1',
      type: 'gelir',
      amount: 80,
      date: '2026-07-15T12:00:00',
      hesap_id: 'account-1',
      hesap: {
        id: 'account-1',
        name: 'Banka',
        currency: 'TRY',
        type: 'banka',
        is_active: true,
      },
    };
    const builder: Record<string, jest.Mock> = {};
    for (const method of [
      'select',
      'eq',
      'in',
      'gte',
      'lte',
      'order',
    ]) {
      builder[method] = jest.fn(() => builder);
    }
    builder.range = jest.fn().mockResolvedValue({
      data: [row],
      error: null,
    });
    fromMock.mockReturnValue(builder);

    const { queryClient, Wrapper } = createWrapper();
    const hook = renderHook(
      () => useIncomeSourceTransactions('hesap', 'account-1', options),
      { wrapper: Wrapper },
    );

    await waitFor(() => {
      expect(hook.result.current.data).toHaveLength(1);
    });

    expect(fromMock).toHaveBeenCalledWith('islemler');
    expect(builder.range).toHaveBeenCalledWith(0, 499);

    hook.unmount();
    queryClient.clear();
  });
});
