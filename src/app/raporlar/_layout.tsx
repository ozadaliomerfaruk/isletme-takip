import { Stack, useSegments } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { AnyModuleRouteStack } from '@/components/navigation/GuardedRouteStack';
import { getReportRouteAccessModules } from '@/lib/permissionNavigation';

export default function RaporlarLayout() {
  const { t } = useTranslation('reports');
  const segments = useSegments();
  const accessModules = getReportRouteAccessModules(segments as string[]);

  return (
    <AnyModuleRouteStack modules={accessModules}>
      <Stack.Screen
        name="index"
        options={{ headerTitle: t('titles.reports') }}
      />
      <Stack.Screen
        name="kategori/[id]"
        options={{ headerTitle: t('titles.categoryDetail') }}
      />
      <Stack.Screen name="hesap/[id]" />
      <Stack.Screen
        name="genel"
        options={{ headerTitle: t('titles.overview') }}
      />
      <Stack.Screen
        name="gelir-gider"
        options={{ headerTitle: t('titles.categoryDistribution') }}
      />
      <Stack.Screen
        name="cari"
        options={{ headerTitle: t('titles.clientReport') }}
      />
      <Stack.Screen
        name="personel"
        options={{ headerTitle: t('titles.personnelReport') }}
      />
      <Stack.Screen
        name="karsilastirma"
        options={{ headerTitle: t('titles.comparison') }}
      />
      <Stack.Screen
        name="alis-satis"
        options={{ headerTitle: t('titles.purchaseSales') }}
      />
      <Stack.Screen
        name="net-varlik-trend"
        options={{ headerTitle: t('netWorthTrend.title') }}
      />
    </AnyModuleRouteStack>
  );
}
