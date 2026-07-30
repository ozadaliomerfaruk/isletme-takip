import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ModuleRouteStack } from '@/components/navigation/GuardedRouteStack';

export default function ArsivLayout() {
  const { t } = useTranslation('common');

  return (
    <ModuleRouteStack module="arsiv">
      <Stack.Screen
        name="index"
        options={{ headerTitle: t('archive.title') }}
      />
    </ModuleRouteStack>
  );
}
