import { Stack, useSegments } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  ModuleRouteStack,
  OwnerRouteStack,
} from '@/components/navigation/GuardedRouteStack';

/**
 * Tüm İşlemler listesi açık işlem-kaynağı olan rollere görünür. Gelir ekleme ve
 * eski geniş düzenleme route'ları ise kendi dar write sözleşmeleri tamamlanana
 * kadar owner-only kalır.
 */
export default function IslemlerLayout() {
  const { t } = useTranslation('transactions');
  const segments = useSegments();
  const islemlerIndex = (segments as string[]).indexOf('islemler');
  const child = islemlerIndex >= 0
    ? (segments as string[])[islemlerIndex + 1]
    : undefined;
  const isAllTransactionsRoute = child === undefined || child === 'index';

  // Expo Router layout filtresi Fragment'i bir Screen olarak görüp içindekileri
  // yok sayar. Screen'leri doğrudan dizi halinde ver ki route seçenekleri (özellikle
  // index başlığı) dosya adının varsayılanına düşmesin.
  const screens = [
    <Stack.Screen
      key="index"
      name="index"
      options={{ title: t('titles.allTransactions') }}
    />,
    <Stack.Screen
      key="gelir"
      name="gelir"
      options={{ title: t('titles.addIncome') }}
    />,
    <Stack.Screen
      key="duzenle/[id]"
      name="duzenle/[id]"
      options={{ title: t('titles.editTransaction') }}
    />,
  ];

  return isAllTransactionsRoute ? (
    <ModuleRouteStack module="islemler">
      {screens}
    </ModuleRouteStack>
  ) : (
    <OwnerRouteStack>
      {screens}
    </OwnerRouteStack>
  );
}
