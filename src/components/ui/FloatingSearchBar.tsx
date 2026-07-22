import { useEffect, useRef, useState } from 'react';
import {
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
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
import { colors } from '@/constants/colors';
import { spacing, borderRadius, fontSize, shadows, HIT_SLOP } from '@/constants/spacing';

const BAR_HEIGHT = 52;

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
}: FloatingSearchBarProps) {
  const { t } = useTranslation('common');
  const inputRef = useRef<TextInput>(null);
  const pillRef = useRef<View>(null);
  const [isFocused, setIsFocused] = useState(false);
  const translateY = useSharedValue(0);
  // Pill'in DİNLENME (translateY=0) konumundaki alt-kenar Y'si (window coords).
  // Yalnız dinlenmede ölçülür; kalkıkken önbellekten okunur → birikimli ofset
  // drift'i ve "çubuğun tepeye fırlayıp takılması" matematiksel olarak imkânsız.
  const restingBottomRef = useRef<number | null>(null);

  useEffect(() => {
    if (autoFocusDelay === undefined) return;
    const timer = setTimeout(() => inputRef.current?.focus(), autoFocusDelay);
    return () => clearTimeout(timer);
  }, [autoFocusDelay]);

  useEffect(() => {
    // Deterministik konumlama: restingBottom (dinlenme alt-kenarı) YALNIZ translateY
    // 0 iken ölçülüp önbelleğe alınır; kalkıkken önbellekten okunur. Birikimli ofset
    // YOK → her kare bağımsız olarak TAM gereken kaldırmayı kurar; drift olamaz,
    // klavye kapanınca daima 0'a döner. Arka plandaki (modal ardındaki) çubuk modalın
    // klavyesine tepki verse de bozulmaz — kapanışta kendini sıfırlar.
    const applyFrame = (kbTop: number, duration: number) => {
      const compute = (restingBottom: number) => {
        const overlap = restingBottom + spacing.md - kbTop;
        translateY.value = withTiming(overlap > 0 ? -overlap : 0, { duration });
      };
      if (translateY.value === 0) {
        // Dinlenmedeyiz → taze ölç (post-transform değil, temiz) ve önbelleğe al.
        pillRef.current?.measureInWindow((_x, y, _w, h) => {
          if (typeof y !== 'number' || typeof h !== 'number') return;
          restingBottomRef.current = y + h;
          compute(y + h);
        });
      } else if (restingBottomRef.current != null) {
        // Kalkıkken kararlı önbellekten hesapla (asla post-transform ölçme).
        compute(restingBottomRef.current);
      }
    };

    if (Platform.OS === 'ios') {
      const sub = Keyboard.addListener('keyboardWillChangeFrame', (e: KeyboardEvent) => {
        applyFrame(e.endCoordinates.screenY, e.duration > 0 ? e.duration : 250);
      });
      return () => sub.remove();
    }

    const show = Keyboard.addListener('keyboardDidShow', (e: KeyboardEvent) => {
      applyFrame(e.endCoordinates.screenY, 150);
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => {
      translateY.value = withTiming(0, { duration: 150 });
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, [translateY]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  // Aktifken (odak ya da metin varken) pill tam genişliğe açılır ve sağında
  // aramayı tamamen kapatan yuvarlak X belirir (Apple Notes davranışı).
  const isActive = isFocused || value.length > 0;

  const handleDismiss = () => {
    onChangeText('');
    inputRef.current?.blur();
    Keyboard.dismiss();
  };

  return (
    <Animated.View
      style={[
        styles.wrapper,
        { right: spacing.lg + (isActive ? 0 : rightOffset), bottom: bottomOffset },
        animStyle,
      ]}
      pointerEvents="box-none"
    >
      <View style={styles.row}>
        <Pressable
          ref={pillRef}
          style={[styles.pill, isFocused && styles.pillFocused]}
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
        {isActive && (
          <Animated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(150)}>
            {/* Dışarıdaki X: aramayı tamamen kapatır (metin + klavye) */}
            <TouchableOpacity
              onPress={handleDismiss}
              style={styles.dismissButton}
              hitSlop={HIT_SLOP.sm}
              accessibilityRole="button"
            >
              <X size={20} color={colors.text} />
            </TouchableOpacity>
          </Animated.View>
        )}
      </View>
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
  pill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    height: BAR_HEIGHT,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
    ...shadows.lg,
  },
  pillFocused: {
    borderColor: colors.primary,
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
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.lg,
  },
});
