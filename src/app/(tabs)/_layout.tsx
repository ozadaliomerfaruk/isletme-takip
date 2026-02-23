import { Tabs } from 'expo-router';
import { View, TouchableOpacity, Platform, StyleSheet } from 'react-native';
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

function TabIcon({ Icon, color, focused }: { Icon: any; color: string; focused: boolean }) {
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
          borderTopColor: colors.borderLight,
          borderTopWidth: StyleSheet.hairlineWidth,
          height: tabBarHeight,
          paddingBottom: tabBarPaddingBottom,
          paddingTop: 0,
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
      {/* Analytics tab hidden from navbar but page still accessible via URL */}
      <Tabs.Screen
        name="analitik"
        options={{
          href: null, // Hide from tab bar
          title: t('tabs.analytics'),
          tabBarIcon: ({ color, focused }) => <TabIcon Icon={BarChart3} color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="cariler"
        options={{
          title: t('tabs.clients'),
          tabBarIcon: ({ color, focused }) => <TabIcon Icon={Users} color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="personel"
        options={{
          title: t('tabs.personnel'),
          tabBarIcon: ({ color, focused }) => <TabIcon Icon={UserCircle} color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="urunler"
        options={{
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
