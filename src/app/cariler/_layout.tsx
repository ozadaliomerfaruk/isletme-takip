import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ModuleRouteStack } from '@/components/navigation/GuardedRouteStack';

export default function CarilerLayout() {
  const { t } = useTranslation('clients');

  return (
    <ModuleRouteStack module="cariler">
      <Stack.Screen
        name="[id]"
        options={{ headerTitle: t('titles.clientTransactions') }}
      />
      <Stack.Screen
        name="ekle"
        options={{ headerTitle: t('titles.addClient') }}
      />
      <Stack.Screen
        name="duzenle/[id]"
        options={{ headerTitle: t('titles.editClient') }}
      />
    </ModuleRouteStack>
  );
}
