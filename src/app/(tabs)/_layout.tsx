import { Tabs } from 'expo-router';
import { View, TouchableOpacity, Platform, StyleSheet } from 'react-native';
import { Home, Users, UserCircle, Package, MoreHorizontal, type LucideIcon } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import * as Haptics from 'expo-haptics';
import { type BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
import { colors } from '@/constants/colors';
import { usePermissions } from '@/hooks/usePermissions';

function HapticTabButton({ style, onPress, children, ...rest }: BottomTabBarButtonProps) {
  return (
    <TouchableOpacity
      style={style}
      accessibilityRole={rest.accessibilityRole}
      accessibilityState={rest.accessibilityState}
      testID={rest.testID}
      activeOpacity={0.7}
      onPress={(e) => {
        if (Platform.OS !== 'web') {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
        onPress?.(e);
      }}
    >
      {typeof children === 'function' ? null : children}
    </TouchableOpacity>
  );
}

function TabIcon({ Icon, color, focused }: { Icon: LucideIcon; color: string; focused: boolean }) {
  return (
    <View style={tabIconStyles.container}>
      <Icon size={26} color={color} />
      {focused && <View style={tabIconStyles.dot} />}
    </View>
  );
}

const tabIconStyles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: 3,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.primary,
  },
});

export default function TabsLayout() {
  const { t } = useTranslation('navigation');
  const { canAccessModule } = usePermissions();

  return (
    <Tabs
      screenOptions={{
        tabBarButton: HapticTabButton,
        headerShown: false,
        tabBarStyle: {
          display: 'none' as const,
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '500',
          marginTop: 4,
          marginBottom: 4,
        },
        tabBarIconStyle: {
          marginBottom: 0,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('tabs.home'),
          tabBarIcon: ({ color, focused }) => <TabIcon Icon={Home} color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="cariler"
        options={{
          href: canAccessModule('cariler') ? undefined : null,
          title: t('tabs.clients'),
          tabBarIcon: ({ color, focused }) => <TabIcon Icon={Users} color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="personel"
        options={{
          href: canAccessModule('personel') ? undefined : null,
          title: t('tabs.personnel'),
          tabBarIcon: ({ color, focused }) => <TabIcon Icon={UserCircle} color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="urunler"
        options={{
          href: canAccessModule('urunler') ? undefined : null,
          title: t('tabs.stock'),
          tabBarIcon: ({ color, focused }) => <TabIcon Icon={Package} color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="daha"
        options={{
          title: t('tabs.more'),
          tabBarIcon: ({ color, focused }) => <TabIcon Icon={MoreHorizontal} color={color} focused={focused} />,
        }}
      />
    </Tabs>
  );
}
