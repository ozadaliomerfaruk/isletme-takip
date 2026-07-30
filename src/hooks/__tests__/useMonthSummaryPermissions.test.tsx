import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { supabase } from '@/lib/supabase';
import { useMonthSummary } from '../useIslemler';

let mockReportsAllowed = true;
const mockCanAccessModule = jest.fn((module: string) =>
  module === 'raporlar' ? mockReportsAllowed : false
);

jest.mock('@/contexts/AuthContext', () => ({
  useAuthContext: () => ({
    isletme: { id: 'business-1' },
    isletmeLoading: false,
  }),
}));

jest.mock('../usePermissions', () => ({
  usePermissions: () => ({
    canAccessModule: mockCanAccessModule,
  }),
}));

jest.mock('../useSettings', () => ({
  useSettings: () => ({ currency: 'TRY' }),
}));

jest.mock('../useExchangeRates', () => ({
  useExchangeRates: () => ({ data: { rates: {} }, isLoading: false }),
  convertCurrency: (amount: number) => amount,
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

describe('useMonthSummary report permission gate', () => {
  const rpcMock = supabase.rpc as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockReportsAllowed = true;
    rpcMock.mockResolvedValue({
      data: [
        { type: 'gelir', total: 120 },
        { type: 'gider', total: 20 },
      ],
      error: null,
    });
  });

  it('does not call the financial RPC when reports are disabled', async () => {
    mockReportsAllowed = false;
    const { queryClient, Wrapper } = createWrapper();
    const hook = renderHook(() => useMonthSummary(), { wrapper: Wrapper });

    await act(async () => {
      await Promise.resolve();
    });

    expect(rpcMock).not.toHaveBeenCalled();
    expect(hook.result.current.data).toBeUndefined();

    hook.unmount();
    queryClient.clear();
  });

  it('fetches the summary when reports are enabled', async () => {
    const { queryClient, Wrapper } = createWrapper();
    const hook = renderHook(() => useMonthSummary(), { wrapper: Wrapper });

    await waitFor(() => {
      expect(hook.result.current.data).toEqual({ income: 120, expense: 20 });
    });
    expect(rpcMock).toHaveBeenCalledTimes(1);

    hook.unmount();
    queryClient.clear();
  });

  it('hides cached financial data immediately when permission is narrowed', async () => {
    const { queryClient, Wrapper } = createWrapper();
    const hook = renderHook(() => useMonthSummary(), { wrapper: Wrapper });

    await waitFor(() => {
      expect(hook.result.current.data).toEqual({ income: 120, expense: 20 });
    });

    mockReportsAllowed = false;
    hook.rerender({});

    expect(hook.result.current.data).toBeUndefined();
    expect(rpcMock).toHaveBeenCalledTimes(1);

    hook.unmount();
    queryClient.clear();
  });
});
