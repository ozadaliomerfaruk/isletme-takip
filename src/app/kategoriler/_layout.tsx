import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { OwnerOrManagerRouteStack } from '@/components/navigation/GuardedRouteStack';

export default function KategorilerLayout() {
  const { t } = useTranslation('categories');

  return (
    <OwnerOrManagerRouteStack>
      <Stack.Screen
        name="index"
        options={{ headerTitle: t('titles.categories') }}
      />
      <Stack.Screen
        name="ekle"
        options={{ headerTitle: t('titles.addCategory') }}
      />
      <Stack.Screen
        name="duzenle/[id]"
        options={{ headerTitle: t('titles.editCategory') }}
      />
    </OwnerOrManagerRouteStack>
  );
}
