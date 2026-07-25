import { Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { usePermissions } from '@/hooks/usePermissions';

export default function TabsLayout() {
  const { t } = useTranslation('navigation');
  const { canAccessModule } = usePermissions();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        freezeOnBlur: true, // PERF (P0-3): aktif olmayan sekme ekranlarını dondur
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
        options={{
          title: t('tabs.home'),
        }}
      />
      <Tabs.Screen
        name="cariler"
        options={{
          href: canAccessModule('cariler') ? undefined : null,
          title: t('tabs.clients'),
        }}
      />
      <Tabs.Screen
        name="personel"
        options={{
          href: canAccessModule('personel') ? undefined : null,
          title: t('tabs.personnel'),
        }}
      />
      <Tabs.Screen
        name="urunler"
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
