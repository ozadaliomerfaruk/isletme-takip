import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ModuleRouteStack } from '@/components/navigation/GuardedRouteStack';

export default function NakitAkisiLayout() {
  const { t } = useTranslation('common');

  return (
    <ModuleRouteStack module="raporlar">
      <Stack.Screen
        name="index"
        options={{ headerTitle: t('dashboard.cashFlow') }}
      />
    </ModuleRouteStack>
  );
}
