import { View, TouchableOpacity, Platform, StyleSheet, Text } from 'react-native';
import { useSegments, useRouter, Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Home, Users, UserCircle, Package, MoreHorizontal, type LucideIcon } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { colors } from '@/constants/colors';
import { usePermissions } from '@/hooks/usePermissions';
import { goToTab } from '@/lib/tabNav';
import type { ModuleName } from '@/types/multiUser';

type TabConfig = {
  key: string;
  route: Href;
  icon: LucideIcon;
  labelKey: string;
  module?: ModuleName;
};

const TABS: TabConfig[] = [
  { key: 'home', route: '/(tabs)' as Href, icon: Home, labelKey: 'tabs.home' },
  { key: 'cariler', route: '/(tabs)/cariler' as Href, icon: Users, labelKey: 'tabs.clients', module: 'cariler' },
  { key: 'personel', route: '/(tabs)/personel' as Href, icon: UserCircle, labelKey: 'tabs.personnel', module: 'personel' },
  { key: 'urunler', route: '/(tabs)/urunler' as Href, icon: Package, labelKey: 'tabs.stock', module: 'urunler' },
  { key: 'daha', route: '/(tabs)/daha' as Href, icon: MoreHorizontal, labelKey: 'tabs.more' },
];

function getActiveTab(segments: string[]): string | null {
  const first = segments[0];
  const second = segments[1];

  // Auth/onboarding/verify screens - hide tab bar
  if (first === '(auth)' || first === 'onboarding' || first === 'verify') {
    return null;
  }

  // Inside (tabs) group
  if (first === '(tabs)') {
    if (!second || second === 'index') return 'home';
    if (second === 'cariler') return 'cariler';
    if (second === 'personel') return 'personel';
    if (second === 'urunler') return 'urunler';
    if (second === 'daha') return 'daha';
    return 'home';
  }

  // Root-level detail screens mapped to parent tab
  if (first === 'cariler') return 'cariler';
  if (first === 'personel') return 'personel';
  if (first === 'urunler') return 'urunler';
  if (first === 'hesaplar') return 'home';
  if (first === 'islemler') return 'home';
  if (first === 'nakit-akisi') return 'home';
  if (first === 'arama') return 'home';
  if (first === 'foto-import') return 'home';

  // "More" related screens
  if (first === 'raporlar') return 'daha';
  if (first === 'ayarlar') return 'daha';
  if (first === 'kategoriler') return 'daha';
  if (first === 'notlar') return 'daha';
  if (first === 'arsiv') return 'daha';
  if (first === 'taksit') return 'daha';
  if (first === 'yasal') return 'daha';

  return 'home';
}

function TabIcon({ Icon, color, focused }: { Icon: LucideIcon; color: string; focused: boolean }) {
  return (
    <View style={iconStyles.container}>
      <Icon size={26} color={color} />
      {focused && <View style={iconStyles.dot} />}
    </View>
  );
}

const iconStyles = StyleSheet.create({
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

export function PersistentTabBar() {
  const segments = useSegments();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation('navigation');
  const { canAccessModule } = usePermissions();

  const activeTab = getActiveTab(segments as string[]);

  // Hide on auth/onboarding/verify
  if (activeTab === null) return null;

  const tabBarHeight = 52 + insets.bottom;
  const tabBarPaddingBottom = 8 + insets.bottom;

  const handlePress = (tab: TabConfig) => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    // (tabs) DIŞINDAKİ bir ekrandan (detay/rapor/form) sekmeye basınca kök Stack'i mevcut (tabs)'a
    // COLLAPSE et (dismissTo/POP_TO); İÇİNDEYKEN sekme geçişi (navigate/JUMP_TO). Detay: src/lib/tabNav.ts.
    // ⚠️ Eski kod düz `router.navigate` kullanıyordu — RN7'de navigate var-olan (tabs)'a POP'lamadığı
    // için her basışta YENİ (tabs) kopyası yığıyordu (sonsuz swipe-back + gezindikçe yavaşlama).
    goToTab(router, segments as string[], tab.route);
  };

  return (
    <View
      style={[
        styles.container,
        {
          height: tabBarHeight,
          paddingBottom: tabBarPaddingBottom,
        },
      ]}
    >
      {TABS.map((tab) => {
        // Permission check
        if (tab.module && !canAccessModule(tab.module)) return null;

        const focused = activeTab === tab.key;
        const color = focused ? colors.primary : colors.textMuted;

        return (
          <TouchableOpacity
            key={tab.key}
            style={styles.tabButton}
            activeOpacity={0.7}
            onPress={() => handlePress(tab)}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
          >
            <TabIcon Icon={tab.icon} color={color} focused={focused} />
            <Text
              style={[
                styles.label,
                { color },
              ]}
              numberOfLines={1}
            >
              {t(tab.labelKey)}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderTopColor: colors.borderLight,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 0,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 8,
  },
  label: {
    fontSize: 10,
    fontWeight: '500',
    marginTop: 4,
    marginBottom: 4,
  },
});
