import { type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '@/constants/colors';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * ALT BOŞLUK ÜÇ YERDEN BİRİNE AİTTİR — CONTAINER'A ASLA:
 *   1. Kaydırma İÇERİĞİ      → useContentBottomPadding()
 *   2. Sabit alt aksiyon çubuğu → <Screen footer={...}>
 *   3. Yüzen kontrolün kendisi  → kendi insets.bottom'ı (FAB, arama, snackbar)
 *
 * Container'a konursa görünür alan kısalır ve içerik cam tab bar'ın ALTINDAN
 * akamaz — camın örnekleyecek bir şeyi kalmaz, bar düz bir yüzeye döner.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Bu bileşen `react-native-safe-area-context`'in SafeAreaView'ünün yerini alır.
 * NEDEN: SafeAreaView NATIVE bir bileşendir ve insets'i native taraftan okur;
 * _layout'un SafeAreaInsetsContext ile yaptığı override'ı (gerçek safe-area +
 * overlay tab bar yüksekliği) GÖRMEZ. Dolayısıyla `edges={['bottom']}` ile alt
 * boşluk alan ekranlar bar yüksekliğini hiç almıyor, son satır bar'ın altında
 * kalıyordu. Buradaki useSafeAreaInsets() hook'u override'ı görür.
 *
 * `edges` prop'u BİLİNÇLİ OLARAK DIŞA AÇILMADI: alt kenarı container'a
 * uygulamak tip düzeyinde imkânsız olsun.
 */
interface ScreenProps {
  children: ReactNode;
  /**
   * Sabit alt aksiyon çubuğu (kaydet/iptal gibi). Verilirse alt boşluk BUNA
   * uygulanır — footer bar'ı temizler, içerik onun altından akmaya devam eder.
   */
  footer?: ReactNode;
  /** Footer'ın görsel stili (arka plan, üst çizgi…). Alt boşluğu Screen ekler. */
  footerStyle?: StyleProp<ViewStyle>;
  /**
   * Üst safe-area boşluğu uygulanır. Native Stack header'ı OLAN ekranlarda
   * gerekmez (header zaten çentiği yönetir) — yalnız kendi başlığını çizen
   * sekme ekranlarında true geçilir.
   */
  top?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Screen({ children, footer, footerStyle, top = false, style }: ScreenProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, top && { paddingTop: insets.top }, style]}>
      {children}
      {footer ? (
        <View style={[{ paddingBottom: insets.bottom }, footerStyle]}>{footer}</View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
});
