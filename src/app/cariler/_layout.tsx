import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ModuleRouteStack } from '@/components/navigation/GuardedRouteStack';

export default function CarilerLayout() {
  const { t } = useTranslation('clients');

  return (
    <ModuleRouteStack module="cariler">
      <Stack.Screen
        name="[id]"
        options={{
          headerTitle: t('titles.clientTransactions'),
          // PİLOT (yalnız bu ekran): RouteStack'in opak `headerStyle` dolgusu bilinçli
          // olarak eziliyor — anahtar undefined verilince spread mirası geçersiz kılar
          // ve bar'ı iOS 26'nın kendi cam malzemesiyle sistem çizer. Kökteki eski pilot
          // (1543743) kök-varsayılan `headerStyle` mirası yüzünden hiç etkili olamamıştı;
          // gerçek aktivasyon bu satır. Cihaz turu sonrası ya diğer ekranlara yayılır
          // ya bu override kaldırılır.
          headerStyle: undefined,
        }}
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
