import { useEffect, useRef, useState } from 'react';
import {
  Keyboard,
  Platform,
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
  // measureInWindow çeviri SONRASI konumu verir; dinlenme konumunu bulmak için
  // uygulanan ofset ayrıca izlenir.
  const appliedOffset = useRef(0);

  useEffect(() => {
    if (autoFocusDelay === undefined) return;
    const timer = setTimeout(() => inputRef.current?.focus(), autoFocusDelay);
    return () => clearTimeout(timer);
  }, [autoFocusDelay]);

  useEffect(() => {
    // Klavyeyle çakışma ölçüme dayalı: pencere adjustResize ile zaten küçüldüyse
    // çakışma 0 çıkar ve çeviri yapılmaz (Android liste ekranları); pencere
    // küçülmediyse (iOS her zaman, Android Modal içi) çubuk klavye üstüne taşınır.
    const applyFrame = (kbTop: number, duration: number) => {
      pillRef.current?.measureInWindow((_x, y, _w, h) => {
        const restingBottom = y + h - appliedOffset.current;
        const overlap = restingBottom + spacing.md - kbTop;
        const next = overlap > 0 ? -overlap : 0;
        appliedOffset.current = next;
        translateY.value = withTiming(next, { duration });
      });
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
      appliedOffset.current = 0;
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
        <View
          ref={pillRef}
          style={[styles.pill, isFocused && styles.pillFocused]}
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
        </View>
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
