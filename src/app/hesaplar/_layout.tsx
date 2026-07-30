import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ModuleRouteStack } from '@/components/navigation/GuardedRouteStack';

export default function HesaplarLayout() {
  const { t } = useTranslation('accounts');

  return (
    <ModuleRouteStack module="hesaplar">
      <Stack.Screen
        name="[id]"
        options={{ headerTitle: t('titles.accountTransactions') }}
      />
      <Stack.Screen
        name="ekle"
        options={{ headerTitle: t('titles.addAccount') }}
      />
      <Stack.Screen
        name="duzenle/[id]"
        options={{ headerTitle: t('titles.editAccount') }}
      />
    </ModuleRouteStack>
  );
}
