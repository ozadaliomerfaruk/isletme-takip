import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ModuleRouteStack } from '@/components/navigation/GuardedRouteStack';

export default function UrunlerLayout() {
  const { t } = useTranslation('products');

  return (
    <ModuleRouteStack module="urunler">
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen
        name="[id]"
        options={{ headerTitle: t('stock.movements') }}
      />
      <Stack.Screen
        name="ekle"
        options={{ headerTitle: t('addProduct') }}
      />
      <Stack.Screen
        name="duzenle/[id]"
        options={{ headerTitle: t('editProduct') }}
      />
      <Stack.Screen
        name="toplu-giris"
        options={{ headerTitle: t('bulk.stockIn') }}
      />
      <Stack.Screen
        name="toplu-cikis"
        options={{ headerTitle: t('bulk.stockOut') }}
      />
    </ModuleRouteStack>
  );
}
