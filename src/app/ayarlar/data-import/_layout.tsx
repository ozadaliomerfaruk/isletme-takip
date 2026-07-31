import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { OwnerRouteStack } from '@/components/navigation/GuardedRouteStack';

export default function DataImportLayout() {
  const { t } = useTranslation('settings');

  return (
    <OwnerRouteStack>
      <Stack.Screen
        name="index"
        options={{ headerTitle: t('dataImport.title') }}
      />
    </OwnerRouteStack>
  );
}
