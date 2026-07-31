import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ModuleRouteStack } from '@/components/navigation/GuardedRouteStack';

export default function PersonelLayout() {
  const { t } = useTranslation('staff');

  return (
    <ModuleRouteStack module="personel">
      <Stack.Screen
        name="[id]"
        options={{ headerTitle: t('titles.personnelTransactions') }}
      />
      <Stack.Screen
        name="ekle"
        options={{ headerTitle: t('titles.addPersonnel') }}
      />
      <Stack.Screen
        name="duzenle/[id]"
        options={{ headerTitle: t('titles.editPersonnel') }}
      />
      <Stack.Screen
        name="toplu-gider"
        options={{ headerTitle: t('bulkSalary.title') }}
      />
      <Stack.Screen
        name="toplu-odeme"
        options={{ headerTitle: t('bulkPayment.title') }}
      />
      <Stack.Screen
        name="izin-gecmisi/[id]"
        options={{ headerTitle: t('leave.leaveHistory') }}
      />
    </ModuleRouteStack>
  );
}
