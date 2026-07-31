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

  const screens = (
    <>
      <Stack.Screen
        name="index"
        options={{ headerTitle: t('titles.allTransactions') }}
      />
      <Stack.Screen
        name="gelir"
        options={{ headerTitle: t('titles.addIncome') }}
      />
      <Stack.Screen
        name="duzenle/[id]"
        options={{ headerTitle: t('titles.editTransaction') }}
      />
    </>
  );

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
