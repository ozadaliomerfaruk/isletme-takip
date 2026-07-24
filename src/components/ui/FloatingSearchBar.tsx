import { useEffect, useRef, useState } from 'react';
import {
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  type KeyboardEvent,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  FadeIn,
  FadeOut,
} from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { Search, X } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '@/constants/colors';
import { spacing, fontSize, shadows, HIT_SLOP } from '@/constants/spacing';
import {
  GlassSurface,
  GlassContainer,
  GLASS_MERGE_SPACING,
  FALLBACK_SURFACE,
  FLOATING_CONTROL_SIZE,
} from './GlassSurface';

/** FAB ile ORTAK yükseklik — alt bölgedeki yüzen kontroller aynı hizada durur. */
const BAR_HEIGHT = FLOATING_CONTROL_SIZE;

/** Listelerin contentContainer paddingBottom'una eklenecek boşluk —
 *  son satır yüzen arama çubuğunun altında kalmasın. */
export const FLOATING_SEARCH_CLEARANCE = BAR_HEIGHT + spacing.lg;

interface FloatingSearchBarProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  /** Sağ altta FAB varsa pill'i daraltmak için ek sağ boşluk (ör. 56 + spacing.md). */
  rightOffset?: number;
  /** Alt kenardan uzaklık. Varsayılan spacing.lg; modal/sheet içinde (home indicator
   *  için) daha büyük bir değer geçilebilir. */
  bottomOffset?: number;
  /** Verilirse mount'ta bu gecikmeyle (ms) input'a odaklanır — sheet açılış
   *  animasyonu bitince klavyeyi açmak için. */
  autoFocusDelay?: number;
  /** Arama "aktif" (odak VEYA metin var) durumu değişince tetiklenir.
   *  Sağ altta FAB olan ekranlar bunu dinleyip FAB'ı gizler: aktifken pill tam
   *  genişliğe açılıp FAB'ın altına girer ve kapatma X'ini tamamen örter
   *  (X ve FAB aynı boyutta, ikisi de sağda ve aynı taban çizgisinde). */
  onActiveChange?: (active: boolean) => void;
}

/**
 * Apple Notes tarzı, ekranın altında yüzen arama çubuğu.
 * Android'de pencere adjustResize ile küçüldüğünden çubuk kendiliğinden
 * klavyenin üstünde kalır; iOS'ta klavye çerçevesi dinlenip çubuk yukarı taşınır.
 */
export function FloatingSearchBar({
  value,
  onChangeText,
  placeholder,
  rightOffset = 0,
  bottomOffset = spacing.lg,
  autoFocusDelay,
  onActiveChange,
}: FloatingSearchBarProps) {
  // Overlay tab bar'ın üstünde kal: insets.bottom (modifiedInsets ile) gerçek safe-area + tab bar
  // yüksekliğini taşır → çubuk bar'ın arkasında kalmaz, üstünde yüzer.
  const insets = useSafeAreaInsets();
  const { t } = useTranslation('common');
  const inputRef = useRef<TextInput>(null);
  const [isFocused, setIsFocused] = useState(false);
  const translateY = useSharedValue(0);

  useEffect(() => {
    if (autoFocusDelay === undefined) return;
    const timer = setTimeout(() => inputRef.current?.focus(), autoFocusDelay);
    return () => clearTimeout(timer);
  }, [autoFocusDelay]);

  // Klavye açılınca çubuğu DOĞRUDAN klavyenin üstüne kaldır — ÖLÇÜMSÜZ, drift-free:
  // dinlenme konumu (bottomOffset + insets.bottom) BİLİNİYOR → kaldırma = klavye
  // yüksekliğinden saf hesap. Her açılış AYNI değeri kurar, her kapanış 0 → kümülatif
  // kayma İMKANSIZ (eski measureInWindow yaklaşımı ölçüm-zamanlamasından drift ediyordu).
  useEffect(() => {
    const restBottom = bottomOffset + insets.bottom;
    const GAP = spacing.md;
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvt, (e: KeyboardEvent) => {
      const h = e.endCoordinates?.height ?? 0;
      const dur = Platform.OS === 'ios' && e.duration > 0 ? e.duration : 220;
      // Yalnız klavye dinlenme konumundan YÜKSEKse yukarı kaldır (aksi halde 0 = yerinde kal).
      translateY.value = withTiming(Math.min(0, restBottom - h - GAP), { duration: dur });
    });
    const hideSub = Keyboard.addListener(hideEvt, (e: KeyboardEvent) => {
      const dur = Platform.OS === 'ios' && e.duration > 0 ? e.duration : 220;
      translateY.value = withTiming(0, { duration: dur });
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [translateY, bottomOffset, insets.bottom]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  // Aktifken (odak ya da metin varken) pill tam genişliğe açılır ve sağında
  // aramayı tamamen kapatan yuvarlak X belirir (Apple Notes davranışı).
  const isActive = isFocused || value.length > 0;

  // Ekranı haberdar et — FAB'lı ekranlar bu sırada FAB'ı çeker (yoksa X'in üstüne biner).
  useEffect(() => {
    onActiveChange?.(isActive);
  }, [isActive, onActiveChange]);

  const handleDismiss = () => {
    onChangeText('');
    inputRef.current?.blur();
    Keyboard.dismiss();
  };

  return (
    <Animated.View
      style={[
        styles.wrapper,
        { right: spacing.lg + (isActive ? 0 : rightOffset), bottom: bottomOffset + insets.bottom },
        animStyle,
      ]}
      pointerEvents="box-none"
    >
      {/* Pill ile kapatma X'i AYNI kontrol grubu → tek GlassContainer'da eritilir
          (Apple'ın ToolbarItemGroup dili). spacing, aradaki boşluktan (spacing.sm=8)
          büyük seçildi ki birleşsinler; FAB farklı ağaçta olduğu için etkilenmez. */}
      <GlassContainer spacing={GLASS_MERGE_SPACING} style={styles.row}>
        <GlassSurface
          style={styles.pill}
          fallbackStyle={[styles.pillFallback, isFocused && styles.pillFallbackFocused]}
          interactive
        >
          <Pressable
            style={styles.pillInner}
            // Pill'in NERESİNE basılırsa basılsın arama açılır (yalnız yazı satırı değil)
            onPress={() => inputRef.current?.focus()}
          >
            <Search size={20} color={isFocused ? colors.primary : colors.textMuted} />
            <TextInput
              ref={inputRef}
              style={styles.input}
              value={value}
              onChangeText={onChangeText}
              placeholder={placeholder ?? t('common:search.searchPlaceholder')}
              placeholderTextColor={colors.textMuted}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              returnKeyType="search"
            />
            {value.length > 0 && (
              <Animated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(150)}>
                {/* İçerideki X: yalnızca yazılanı siler, odak korunur */}
                <TouchableOpacity
                  onPress={() => {
                    onChangeText('');
                    inputRef.current?.focus();
                  }}
                  hitSlop={HIT_SLOP.sm}
                  style={styles.clearButton}
                >
                  <X size={16} color={colors.textMuted} />
                </TouchableOpacity>
              </Animated.View>
            )}
          </Pressable>
        </GlassSurface>
        {isActive && (
          <Animated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(150)}>
            {/* Dışarıdaki X: aramayı tamamen kapatır (metin + klavye) */}
            <GlassSurface style={styles.dismissButton} fallbackStyle={styles.dismissFallback} interactive>
              <TouchableOpacity
                onPress={handleDismiss}
                style={styles.dismissInner}
                hitSlop={HIT_SLOP.sm}
                accessibilityRole="button"
              >
                <X size={22} color={colors.text} />
              </TouchableOpacity>
            </GlassSurface>
          </Animated.View>
        )}
      </GlassContainer>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: spacing.lg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  // GEOMETRİ (iki yolda da): cam kendi köşesini native çizer, RN clip yok.
  pill: {
    flex: 1,
    height: BAR_HEIGHT,
    borderRadius: BAR_HEIGHT / 2,
  },
  // Cam yolunda arka plan/border/gölge YOK: native rim lighting ve lensing'i
  // perdeler, pill "yapıştırılmış sticker" gibi durur. Bunlar yalnız fallback'te.
  pillFallback: {
    // Yarı saydam (opak beyaz değil): altındaki liste hafifçe seziliyor.
    // Blur EKLENMEDİ — blur `overflow: hidden` ister, o da gölgeyi yok eder.
    backgroundColor: FALLBACK_SURFACE,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.lg,
  },
  pillFallbackFocused: {
    borderColor: colors.primary,
  },
  // Camda odak göstergesi ÇERÇEVE DEĞİL: büyüteç ikonu yeşile döner (aşağıda,
  // isFocused ile) — Apple'ın arama alanı da odakta çerçeve eklemez.
  pillInner: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  input: {
    flex: 1,
    color: colors.text,
    fontSize: fontSize.lg,
    paddingVertical: 0,
  },
  clearButton: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dismissButton: {
    width: BAR_HEIGHT,
    height: BAR_HEIGHT,
    borderRadius: BAR_HEIGHT / 2,
  },
  dismissFallback: {
    backgroundColor: FALLBACK_SURFACE,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.lg,
  },
  dismissInner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
