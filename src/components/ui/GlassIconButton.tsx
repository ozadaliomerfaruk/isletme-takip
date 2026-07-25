import { type ReactNode } from 'react';
import { StyleSheet, TouchableOpacity, type StyleProp, type ViewStyle } from 'react-native';
import { colors } from '@/constants/colors';
import { HIT_SLOP } from '@/constants/spacing';
import { GlassSurface, GLASS_TINT_CONTROL } from './GlassSurface';

/** Header'daki yuvarlak yardımcı buton çapı. */
export const ICON_BUTTON_SIZE = 36;

interface GlassIconButtonProps {
  onPress: () => void;
  /** İkon — rengini çağıran belirler (renk içerikte yaşar). */
  children: ReactNode;
  disabled?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * Header'daki yuvarlak YARDIMCI aksiyon butonu (paylaş, dışa-aktar, sırala, ara…).
 *
 * NÖTR cam + hafif tint, FAB'lardaki "doygun disk + cam" tarifi DEĞİL: bu
 * butonların işi birbirine ERİMEK. Yan yana duranlar TabHeader'ın GlassContainer'ı
 * sayesinde tek kapsül olur (gap 4 < GLASS_MERGE_SPACING 10) — opak bir disk
 * olsaydı erimeye katılamazdı. Apple'ın ToolbarItemGroup dili budur.
 *
 * Renk içerikte: ikonun rengi çağırandan gelir, cam nötr kalır.
 *
 * TouchableOpacity camın İÇİNDE — dışına alınırsa activeOpacity basılıyken
 * alpha<1 yapar ve cam çöker (GlassSurface'taki ALTIN KURAL).
 */
export function GlassIconButton({
  onPress,
  children,
  disabled,
  accessibilityLabel,
  style,
}: GlassIconButtonProps) {
  return (
    <GlassSurface
      style={[styles.button, style]}
      // Cam yokken bugünkü görünüm: yeşil çerçeveli halka. Cam yolunda çerçeve
      // YOK — native rim lighting onun yerini alıyor, ikisi birlikte çakışır.
      fallbackStyle={styles.buttonFallback}
      tintColor={GLASS_TINT_CONTROL}
    >
      <TouchableOpacity
        style={styles.inner}
        onPress={onPress}
        disabled={disabled}
        activeOpacity={0.7}
        hitSlop={HIT_SLOP.sm}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
      >
        {children}
      </TouchableOpacity>
    </GlassSurface>
  );
}

const styles = StyleSheet.create({
  button: {
    width: ICON_BUTTON_SIZE,
    height: ICON_BUTTON_SIZE,
    borderRadius: ICON_BUTTON_SIZE / 2,
  },
  buttonFallback: {
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  inner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
