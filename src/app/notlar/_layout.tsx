import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ModuleRouteStack } from '@/components/navigation/GuardedRouteStack';

export default function NotlarLayout() {
  const { t } = useTranslation('navigation');

  return (
    <ModuleRouteStack module="notlar">
      <Stack.Screen
        name="index"
        options={{ headerTitle: t('screens.notes') }}
      />
    </ModuleRouteStack>
  );
}
