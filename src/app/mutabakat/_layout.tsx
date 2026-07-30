import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ModuleRouteStack } from '@/components/navigation/GuardedRouteStack';

/**
 * Cariler kapalı bir shared kullanıcı deep-link ile geldiğinde çocuk ekranı hiç
 * mount edilmez; böylece tam cari geçmişi sorgusu yönlendirmeden önce başlayamaz.
 */
export default function MutabakatLayout() {
  const { t } = useTranslation('mutabakat');

  return (
    <ModuleRouteStack module="cariler">
      <Stack.Screen
        name="[cariId]"
        options={{ headerTitle: t('title') }}
      />
    </ModuleRouteStack>
  );
}
