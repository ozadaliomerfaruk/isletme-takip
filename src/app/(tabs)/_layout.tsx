import { Tabs } from 'expo-router';
import { TouchableOpacity, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Home, BarChart3, Users, UserCircle, Package, MoreHorizontal } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import * as Haptics from 'expo-haptics';
import { colors } from '@/constants/colors';

function HapticTabButton(props: any) {
  return (
    <TouchableOpacity
      {...props}
      activeOpacity={0.7}
      onPress={(e) => {
        if (Platform.OS !== 'web') {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
        props.onPress?.(e);
      }}
    />
  );
}

export default function TabsLayout() {
  const { t } = useTranslation('navigation');
  const insets = useSafeAreaInsets();

  // Tab bar yüksekliği: base height + safe area bottom
  const tabBarHeight = 52 + insets.bottom;
  const tabBarPaddingBottom = 8 + insets.bottom;

  return (
    <Tabs
      screenOptions={{
        tabBarButton: HapticTabButton,
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: tabBarHeight,
          paddingBottom: tabBarPaddingBottom,
          paddingTop: 0,
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '500',
          marginBottom: 4,
        },
        tabBarIconStyle: {
          marginBottom: -4,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('tabs.home'),
          tabBarIcon: ({ color }) => <Home size={28} color={color} />,
        }}
      />
      {/* Analytics tab hidden from navbar but page still accessible via URL */}
      <Tabs.Screen
        name="analitik"
        options={{
          href: null, // Hide from tab bar
          title: t('tabs.analytics'),
          tabBarIcon: ({ color }) => <BarChart3 size={28} color={color} />,
        }}
      />
      <Tabs.Screen
        name="cariler"
        options={{
          title: t('tabs.clients'),
          tabBarIcon: ({ color }) => <Users size={28} color={color} />,
        }}
      />
      <Tabs.Screen
        name="personel"
        options={{
          title: t('tabs.personnel'),
          tabBarIcon: ({ color }) => <UserCircle size={28} color={color} />,
        }}
      />
      <Tabs.Screen
        name="urunler"
        options={{
          title: t('tabs.stock'),
          tabBarIcon: ({ color }) => <Package size={28} color={color} />,
        }}
      />
      <Tabs.Screen
        name="daha"
        options={{
          title: t('tabs.more'),
          tabBarIcon: ({ color }) => <MoreHorizontal size={28} color={color} />,
        }}
      />
    </Tabs>
  );
}
