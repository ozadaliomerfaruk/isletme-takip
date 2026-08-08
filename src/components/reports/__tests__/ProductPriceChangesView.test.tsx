import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type {
  ProductPriceChangeItem,
  ProductPriceChangeReportResult,
} from '@/hooks/useProductPriceChangeReport';
import { ProductPriceChangesView } from '../ProductPriceChangesView';

const translations: Record<string, string> = {
  'reports:purchaseSales.priceChanges.increased': 'Zam gören',
  'reports:purchaseSales.priceChanges.decreased': 'Fiyatı düşen',
  'reports:purchaseSales.priceChanges.allChanges': 'Fiyatı değişen',
  'reports:purchaseSales.priceChanges.estimatedExtraCost': 'Fazladan ödenen',
  'reports:purchaseSales.priceChanges.estimatedSavings': 'İndirimden kazanç',
  'reports:purchaseSales.priceChanges.viewProducts': 'Ürünler',
  'reports:purchaseSales.priceChanges.viewCategories': 'Kategoriler',
  'reports:purchaseSales.priceChanges.sortLabel': 'Sırala',
  'reports:purchaseSales.priceChanges.sortByCost': 'En çok fark',
  'reports:purchaseSales.priceChanges.sortByPercent': 'Yüzde farkı',
  'reports:purchaseSales.priceChanges.sortByRecent': 'Son değişen',
  'reports:purchaseSales.priceChanges.calculationNote': 'Hesaplama açıklaması',
  'reports:purchaseSales.priceChanges.referencePrice': 'Eski alış',
  'reports:purchaseSales.priceChanges.currentPrice': 'Son alış',
  'reports:purchaseSales.priceChanges.periodChange': 'Fiyat farkı',
  'reports:purchaseSales.priceChanges.extraCost': 'Fazladan ödenen',
  'reports:purchaseSales.priceChanges.supplierChanged': 'Tedarikçi değişti',
  'reports:purchaseSales.priceChanges.brandChanged': 'Marka değişti',
  'reports:purchaseSales.priceChanges.showHistory': 'Geçmişi göster',
  'reports:purchaseSales.priceChanges.hideHistory': 'Geçmişi gizle',
  'reports:purchaseSales.uncategorized': 'Kategorisiz',
};

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      if (key === 'reports:purchaseSales.priceChanges.changeCount') {
        return `${options?.count} kez değişti`;
      }
      if (key === 'reports:purchaseSales.priceChanges.higherPriceQuantityValue') {
        return `${options?.quantity} ${options?.unit} zamdan sonra alındı`;
      }
      if (key === 'reports:purchaseSales.priceChanges.lowerPriceQuantityValue') {
        return `${options?.quantity} ${options?.unit} indirimli fiyattan alındı`;
      }
      if (key === 'reports:purchaseSales.priceChanges.productCount') {
        return `${options?.count} ürün`;
      }
      if (key === 'reports:purchaseSales.priceChanges.extraPaidShort') {
        return `${options?.amount} fazla`;
      }
      if (key === 'reports:purchaseSales.priceChanges.savingsShort') {
        return `${options?.amount} kazanç`;
      }
      if (key === 'reports:purchaseSales.priceChanges.categoryExtraCost') {
        return `${options?.amount} fazla`;
      }
      if (key.startsWith('products:units.')) return 'kg';
      return translations[key] ?? key;
    },
  }),
}));

function createItem(
  overrides: Partial<ProductPriceChangeItem>,
): ProductPriceChangeItem {
  return {
    urunId: 'urun-1',
    urunAdi: 'Un',
    urunBirim: 'kg',
    kategoriId: 'kategori-1',
    kategoriAdi: 'Gıda',
    priceCurrency: 'TRY',
    referencePrice: 100,
    currentPrice: 130,
    previousPrice: 120,
    lastChangeAmount: 10,
    lastChangePercent: 8.33,
    periodChangeAmount: 30,
    periodChangePercent: 30,
    changeCount: 2,
    hadIncrease: true,
    hadDecrease: false,
    periodQuantity: 60,
    higherPriceQuantity: 50,
    lowerPriceQuantity: 0,
    extraCost: 1300,
    extraCostBase: 1300,
    estimatedSavings: 0,
    estimatedSavingsBase: 0,
    firstPurchaseDate: '2026-07-01T00:00:00.000Z',
    lastPurchaseDate: '2026-07-20T00:00:00.000Z',
    lastChangeDate: '2026-07-20T00:00:00.000Z',
    latestSupplierId: 'tedarikci-1',
    latestSupplierName: 'ABC Toptan',
    supplierChanged: true,
    latestBrandName: null,
    brandChanged: false,
    priceHistory: [],
    ...overrides,
  };
}

function createReport(): ProductPriceChangeReportResult {
  return {
    items: [
      createItem({}),
      createItem({
        urunId: 'urun-2',
        urunAdi: 'Deterjan',
        kategoriId: 'kategori-2',
        kategoriAdi: 'Temizlik',
        referencePrice: 80,
        currentPrice: 70,
        previousPrice: 80,
        lastChangeAmount: -10,
        lastChangePercent: -12.5,
        periodChangeAmount: -10,
        periodChangePercent: -12.5,
        hadIncrease: false,
        hadDecrease: true,
        extraCost: 0,
        extraCostBase: 0,
        lowerPriceQuantity: 10,
        estimatedSavings: 100,
        estimatedSavingsBase: 100,
        supplierChanged: false,
      }),
    ],
    changedCount: 2,
    increasedCount: 1,
    decreasedCount: 1,
    totalExtraCost: 1300,
    totalSavings: 100,
    conversionIncomplete: false,
    isReady: true,
    isLoading: false,
    isFetching: false,
    refetch: jest.fn().mockResolvedValue(undefined),
    error: null,
  };
}

describe('ProductPriceChangesView', () => {
  it('uses the increase KPI as a toggleable product filter', () => {
    render(<ProductPriceChangesView report={createReport()} baseCurrency="TRY" />);

    expect(screen.getByText('Un')).toBeTruthy();
    expect(screen.getByText('Deterjan')).toBeTruthy();

    fireEvent.press(screen.getByRole('button', { name: 'Zam gören: 1 ürün' }));
    expect(screen.getByText('Un')).toBeTruthy();
    expect(screen.queryByText('Deterjan')).toBeNull();

    fireEvent.press(screen.getByRole('button', { name: 'Zam gören: 1 ürün' }));
    expect(screen.getByText('Deterjan')).toBeTruthy();
  });

  it('shows price drops as a filterable saving instead of a zero extra cost', () => {
    render(<ProductPriceChangesView report={createReport()} baseCurrency="TRY" />);

    fireEvent.press(screen.getByRole('button', { name: 'Fiyatı düşen: 1 ürün' }));

    expect(screen.queryByText('Un')).toBeNull();
    expect(screen.getByText('Deterjan')).toBeTruthy();
    expect(screen.getByText('İndirimden kazanç')).toBeTruthy();
    expect(screen.getByText('10 kg indirimli fiyattan alındı')).toBeTruthy();
  });

  it('groups products by category and lets a category collapse', () => {
    render(<ProductPriceChangesView report={createReport()} baseCurrency="TRY" />);

    fireEvent.press(screen.getByText('Kategoriler'));
    expect(screen.getByText('Gıda')).toBeTruthy();
    expect(screen.getByText('Temizlik')).toBeTruthy();

    fireEvent.press(screen.getByText('Gıda'));
    expect(screen.queryByText('Un')).toBeNull();
    expect(screen.getByText('Deterjan')).toBeTruthy();
  });

  it('shows the latest brand and marks a brand transition', () => {
    const report = createReport();
    report.items[0] = createItem({
      latestBrandName: 'Marka B',
      brandChanged: true,
    });

    render(<ProductPriceChangesView report={report} baseCurrency="TRY" />);

    expect(screen.getByText('Marka B')).toBeTruthy();
    expect(screen.getByText('Marka değişti')).toBeTruthy();
  });
});
