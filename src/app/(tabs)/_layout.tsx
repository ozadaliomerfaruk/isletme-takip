import { Redirect, Tabs, useSegments } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAuthContext } from '@/contexts/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import {
  canAccessHome,
  getFirstAccessibleMainTabHref,
  isTabsHomeRoute,
} from '@/lib/permissionNavigation';

export default function TabsLayout() {
  const { t } = useTranslation('navigation');
  const { canAccessModule } = usePermissions();
  const {
    initialized,
    loading,
    isletmeLoading,
  } = useAuthContext();
  const segments = useSegments();
  const permissionsReady = initialized && !loading && !isletmeLoading;
  const canSeeHome = canAccessHome(canAccessModule);

  if (
    permissionsReady
    && !canSeeHome
    && isTabsHomeRoute(segments as string[])
  ) {
    return (
      <Redirect href={getFirstAccessibleMainTabHref(canAccessModule)} />
    );
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        /**
         * Bunu açıkça false bırak. Kök layout'ta enableFreeze(true) çağrıldığı için
         * prop'u tamamen kaldırmak react-native-screens'in varsayılanını yeniden
         * true yapar. Hızlı sekme değişimlerinde route state ilerlerken native içerik
         * (özellikle Daha ekranı) donuk kalabiliyor. Kök ve modül-içi Stack ekranları
         * kendi freezeOnBlur ayarlarını korur; yalnız eş düzey ana sekmeler canlıdır.
         */
        freezeOnBlur: false,
        /**
         * Native bar tamamen gizli: sekme çubuğu kök _layout'ta ayrı çizilen
         * PersistentTabBar. Buraya tabBarIcon/label/tint gibi görsel ayar EKLEME —
         * hiçbiri render edilmez, yalnız "sekme görünümü burada" yanılgısı yaratır.
         */
        tabBarStyle: {
          display: 'none' as const,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        redirect={permissionsReady && !canSeeHome}
        options={{
          href: !permissionsReady || canSeeHome ? undefined : null,
          title: t('tabs.home'),
        }}
      />
      <Tabs.Screen
        name="cariler"
        redirect={!canAccessModule('cariler')}
        options={{
          href: canAccessModule('cariler') ? undefined : null,
          title: t('tabs.clients'),
        }}
      />
      <Tabs.Screen
        name="personel"
        redirect={!canAccessModule('personel')}
        options={{
          href: canAccessModule('personel') ? undefined : null,
          title: t('tabs.personnel'),
        }}
      />
      <Tabs.Screen
        name="urunler"
        redirect={!canAccessModule('urunler')}
        options={{
          href: canAccessModule('urunler') ? undefined : null,
          title: t('tabs.stock'),
        }}
      />
      <Tabs.Screen
        name="daha"
        options={{
          title: t('tabs.more'),
        }}
      />
    </Tabs>
  );
}
