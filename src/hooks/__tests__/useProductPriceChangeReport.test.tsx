import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { supabase } from '@/lib/supabase';
import { useProductPriceChangeReport } from '../useProductPriceChangeReport';

let mockModules: Record<string, boolean> = { raporlar: true };
let mockBaseCurrency = 'TRY';
const mockCanAccessModule = jest.fn((module: string) => mockModules[module] === true);

jest.mock('@/contexts/AuthContext', () => ({
  useAuthContext: () => ({
    user: { id: '10000000-0000-4000-8000-000000000001' },
    isletme: { id: '20000000-0000-4000-8000-000000000001' },
    isletmeLoading: false,
  }),
}));

jest.mock('../usePermissions', () => ({
  usePermissions: () => ({
    isOwner: false,
    canAccessModule: mockCanAccessModule,
    canSeeAllUsersData: false,
  }),
}));

jest.mock('../useSettings', () => ({
  useSettings: () => ({ currency: mockBaseCurrency }),
}));

jest.mock('../useExchangeRates', () => ({
  useExchangeRates: () => ({ data: { rates: { USD: 40 } }, isLoading: false }),
  convertCurrency: (
    amount: number,
    fromCurrency: string,
    toCurrency: string,
  ) => {
    if (fromCurrency === toCurrency) return amount;
    if (fromCurrency === 'USD' && toCurrency === 'TRY') return amount * 40;
    return null;
  },
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, Wrapper };
}

const baseRow = {
  urun_id: '30000000-0000-4000-8000-000000000001',
  urun_adi: 'Un',
  urun_birim: 'kg',
  kategori_id: null,
  kategori_adi: null,
  fiyat_para_birimi: 'TRY',
  referans_fiyat: '100',
  guncel_fiyat: '130',
  onceki_fiyat: '120',
  son_degisim_tutari: '10',
  son_degisim_yuzdesi: '8.333333',
  donem_degisim_tutari: '30',
  donem_degisim_yuzdesi: '30',
  degisim_sayisi: '2',
  zam_var: true,
  indirim_var: false,
  donem_toplam_miktar: '60',
  zamli_alim_miktari: '50',
  tahmini_ek_maliyet: '1300',
  indirimli_alim_miktari: '0',
  tahmini_tasarruf: '0',
  ilk_alim_tarihi: '2026-07-01T07:00:00.000Z',
  son_alim_tarihi: '2026-07-20T07:00:00.000Z',
  son_degisim_tarihi: '2026-07-20T07:00:00.000Z',
  son_tedarikci_id: '40000000-0000-4000-8000-000000000001',
  son_tedarikci_adi: 'Tedarikçi',
  tedarikci_degisti: true,
  fiyat_gecmisi: [
    {
      date: '2026-06-30T07:00:00.000Z',
      price: 100,
      quantity: 5,
      supplierId: '40000000-0000-4000-8000-000000000002',
      supplierName: 'Eski Tedarikçi',
      brandName: 'Marka A',
      kind: 'baseline',
      changeAmount: null,
      changePercent: null,
    },
    {
      date: '2026-07-20T07:00:00.000Z',
      price: 130,
      quantity: 30,
      supplierId: '40000000-0000-4000-8000-000000000001',
      supplierName: 'Tedarikçi',
      brandName: 'Marka B',
      kind: 'change',
      changeAmount: 10,
      changePercent: 8.333333,
    },
  ],
};

const options = { startDate: '2026-07-01', endDate: '2026-07-31' };

describe('useProductPriceChangeReport', () => {
  const rpcMock = supabase.rpc as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockModules = { raporlar: true };
    mockBaseCurrency = 'TRY';
    rpcMock.mockResolvedValue({ data: [baseRow], error: null });
  });

  it('normalizes the RPC row and calculates base-currency KPI totals', async () => {
    const { queryClient, Wrapper } = createWrapper();
    const hook = renderHook(() => useProductPriceChangeReport(options), {
      wrapper: Wrapper,
    });

    await waitFor(() => expect(hook.result.current.items).toHaveLength(1));

    expect(rpcMock).toHaveBeenCalledWith('get_product_price_change_report_v2', {
      p_isletme_id: '20000000-0000-4000-8000-000000000001',
      p_start_date: '2026-07-01T00:00:00',
      p_end_date: '2026-07-31T23:59:59',
    });
    expect(hook.result.current.changedCount).toBe(1);
    expect(hook.result.current.increasedCount).toBe(1);
    expect(hook.result.current.decreasedCount).toBe(0);
    expect(hook.result.current.totalExtraCost).toBe(1300);
    expect(hook.result.current.totalSavings).toBe(0);
    expect(hook.result.current.items[0].priceHistory).toHaveLength(2);
    expect(hook.result.current.items[0].latestBrandName).toBe('Marka B');
    expect(hook.result.current.items[0].brandChanged).toBe(true);
    expect(hook.result.current.conversionIncomplete).toBe(false);

    hook.unmount();
    queryClient.clear();
  });

  it('does not calculate the report while its tab is deferred', async () => {
    const { queryClient, Wrapper } = createWrapper();
    const hook = renderHook(
      () => useProductPriceChangeReport({ ...options, enabled: false }),
      { wrapper: Wrapper },
    );

    await act(async () => Promise.resolve());

    expect(rpcMock).not.toHaveBeenCalled();
    expect(hook.result.current.isReady).toBe(false);
    expect(hook.result.current.isLoading).toBe(false);
    expect(hook.result.current.items).toEqual([]);

    hook.unmount();
    queryClient.clear();
  });

  it('accepts legacy history JSON without brand metadata', async () => {
    rpcMock.mockResolvedValue({
      data: [{
        ...baseRow,
        fiyat_gecmisi: baseRow.fiyat_gecmisi.map(({ brandName: _brandName, ...point }) => point),
      }],
      error: null,
    });
    const { queryClient, Wrapper } = createWrapper();
    const hook = renderHook(() => useProductPriceChangeReport(options), {
      wrapper: Wrapper,
    });

    await waitFor(() => expect(hook.result.current.items).toHaveLength(1));
    expect(hook.result.current.items[0].latestBrandName).toBeNull();
    expect(hook.result.current.items[0].brandChanged).toBe(false);

    hook.unmount();
    queryClient.clear();
  });

  it('keeps native prices separate while converting only the cross-currency KPI', async () => {
    rpcMock.mockResolvedValue({
      data: [{ ...baseRow, fiyat_para_birimi: 'USD', tahmini_ek_maliyet: 25 }],
      error: null,
    });
    const { queryClient, Wrapper } = createWrapper();
    const hook = renderHook(() => useProductPriceChangeReport(options), {
      wrapper: Wrapper,
    });

    await waitFor(() => expect(hook.result.current.items).toHaveLength(1));
    expect(hook.result.current.items[0].currentPrice).toBe(130);
    expect(hook.result.current.items[0].priceCurrency).toBe('USD');
    expect(hook.result.current.items[0].extraCostBase).toBe(1000);
    expect(hook.result.current.totalExtraCost).toBe(1000);

    hook.unmount();
    queryClient.clear();
  });

  it('counts an in-period increase even when the product closes below its reference price', async () => {
    rpcMock.mockResolvedValue({
      data: [{
        ...baseRow,
        guncel_fiyat: '90',
        donem_degisim_tutari: '-10',
        donem_degisim_yuzdesi: '-10',
        zam_var: true,
        indirim_var: true,
        indirimli_alim_miktari: '3',
        tahmini_tasarruf: '300',
      }],
      error: null,
    });
    const { queryClient, Wrapper } = createWrapper();
    const hook = renderHook(() => useProductPriceChangeReport(options), {
      wrapper: Wrapper,
    });

    await waitFor(() => expect(hook.result.current.items).toHaveLength(1));
    expect(hook.result.current.increasedCount).toBe(1);
    expect(hook.result.current.decreasedCount).toBe(1);
    expect(hook.result.current.items[0].periodChangeAmount).toBe(-10);
    expect(hook.result.current.items[0].lowerPriceQuantity).toBe(3);
    expect(hook.result.current.totalSavings).toBe(300);

    hook.unmount();
    queryClient.clear();
  });

  it('excludes an unconvertible extra cost from the total and raises a warning', async () => {
    rpcMock.mockResolvedValue({
      data: [{ ...baseRow, fiyat_para_birimi: 'CHF', tahmini_ek_maliyet: 50 }],
      error: null,
    });
    const { queryClient, Wrapper } = createWrapper();
    const hook = renderHook(() => useProductPriceChangeReport(options), {
      wrapper: Wrapper,
    });

    await waitFor(() => expect(hook.result.current.items).toHaveLength(1));
    expect(hook.result.current.items[0].extraCostBase).toBeNull();
    expect(hook.result.current.totalExtraCost).toBe(0);
    expect(hook.result.current.conversionIncomplete).toBe(true);

    hook.unmount();
    queryClient.clear();
  });

  it('drops malformed rows and does not query without either allowed module', async () => {
    rpcMock.mockResolvedValue({
      data: [baseRow, { ...baseRow, urun_id: 'not-a-uuid' }],
      error: null,
    });
    const first = createWrapper();
    const validHook = renderHook(() => useProductPriceChangeReport(options), {
      wrapper: first.Wrapper,
    });
    await waitFor(() => expect(validHook.result.current.items).toHaveLength(1));
    validHook.unmount();
    first.queryClient.clear();

    jest.clearAllMocks();
    mockModules = {};
    const second = createWrapper();
    const blockedHook = renderHook(() => useProductPriceChangeReport(options), {
      wrapper: second.Wrapper,
    });
    await act(async () => Promise.resolve());
    expect(rpcMock).not.toHaveBeenCalled();
    expect(blockedHook.result.current.items).toEqual([]);

    blockedHook.unmount();
    second.queryClient.clear();
  });
});
