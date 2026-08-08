import React from 'react';
import { render, screen } from '@testing-library/react-native';

import { ProductDetailModal } from '../ProductDetailModal';

const mockUseUrunHareketlerByIslemId = jest.fn();

jest.mock('@/hooks/useUrunHareketler', () => ({
  useUrunHareketlerByIslemId: (...args: unknown[]) =>
    mockUseUrunHareketlerByIslemId(...args),
  useUrunKalemlerByIslemIds: () => ({
    getUrunItems: () => [],
    isProductItemsResolved: true,
    isError: false,
  }),
}));

jest.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({
    canAccessModule: () => true,
  }),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key.startsWith('products:units.') ? 'Adet' : key,
  }),
}));

jest.mock('lucide-react-native', () => ({
  Package: () => null,
  Tags: () => null,
  X: () => null,
}));

jest.mock('@/components/ui', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { Text, View } =
    jest.requireActual<typeof import('react-native')>('react-native');

  return {
    Modal: ({ visible, children }: { visible: boolean; children: React.ReactNode }) =>
      visible ? React.createElement(View, null, children) : null,
    Text: ({ children }: { children: React.ReactNode }) =>
      React.createElement(Text, null, children),
    Button: ({ children }: { children: React.ReactNode }) =>
      React.createElement(Text, null, children),
  };
});

describe('ProductDetailModal', () => {
  beforeEach(() => {
    mockUseUrunHareketlerByIslemId.mockReturnValue({
      data: [{
        id: 'hareket-1',
        miktar: 25,
        birim_fiyat: 150,
        kdv_orani: 1,
        marka: 'Marka A',
        urunler: { ad: 'Deneme ürün', birim: 'adet' },
      }],
      isLoading: false,
      isError: false,
    });
  });

  it('işlemde kaydedilen markayı ürün adının altında gösterir', () => {
    render(
      <ProductDetailModal
        islemId="islem-1"
        onDismiss={jest.fn()}
        currency="TRY"
      />,
    );

    expect(screen.getByText('Deneme ürün')).toBeTruthy();
    expect(screen.getByText('Marka A')).toBeTruthy();
  });

  it('markasız eski hareketlerde boş marka alanı göstermez', () => {
    mockUseUrunHareketlerByIslemId.mockReturnValue({
      data: [{
        id: 'hareket-1',
        miktar: 25,
        birim_fiyat: 150,
        kdv_orani: 1,
        marka: null,
        urunler: { ad: 'Deneme ürün', birim: 'adet' },
      }],
      isLoading: false,
      isError: false,
    });

    render(
      <ProductDetailModal
        islemId="islem-1"
        onDismiss={jest.fn()}
        currency="TRY"
      />,
    );

    expect(screen.queryByText('Marka A')).toBeNull();
  });
});
