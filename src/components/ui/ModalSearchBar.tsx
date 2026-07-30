import { useEffect, useRef } from 'react';
import { View, TextInput, TouchableOpacity, Pressable, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Search, X } from 'lucide-react-native';
import { GlassSurface, GLASS_TINT_CONTROL } from './GlassSurface';
import { colors } from '@/constants/colors';
import { spacing, borderRadius, HIT_SLOP } from '@/constants/spacing';

interface ModalSearchBarProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  /** Verilirse mount'ta bu gecikmeyle (ms) input'a odaklanır (sheet açılış animasyonu bitince). */
  autoFocusDelay?: number;
}

/**
 * Modal / bottom-sheet içinde ÜSTE SABİT (statik) arama çubuğu.
 *
 * Neden ayrı bileşen: FloatingSearchBar ekranın altında yüzer ve klavye üstüne
 * measureInWindow + klavye olaylarıyla taşınır. Bu mantık MODAL sınırlarında kırılgan
 * (modal ardındaki/önündeki ölçüm, klavye olay karışması) ve "çubuk havada asılı kalma"
 * gibi bug'lara yol açıyor. Modallarda bunun yerine BU statik çubuğu başlığın hemen
 * altına koy — klavye dinlemez, taşınmaz, hiç bug çıkmaz. Görünüm pill'e benzer (yuvarlak).
 */
export function ModalSearchBar({ value, onChangeText, placeholder, autoFocusDelay }: ModalSearchBarProps) {
  const { t } = useTranslation('common');
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (autoFocusDelay === undefined) return;
    const timer = setTimeout(() => inputRef.current?.focus(), autoFocusDelay);
    return () => clearTimeout(timer);
  }, [autoFocusDelay]);

  return (
    <View style={styles.container}>
      {/**
        * Cam — yüzen arama çubuğuyla aynı dilde olsun diye. BEKLENTİ: burada
        * etki sınırlı kalır, çünkü bu çubuk OPAK bir sheet'in üstünde duruyor;
        * cam arkasında hareketli içerik değil düz bir yüzey örnekliyor. Yani
        * kazanç malzeme tutarlılığı, görsel "vay be" değil.
        * Tint şart: küçük yüzey + açık zemin (bkz. GlassSurface kuralı).
        */}
      <GlassSurface
        style={styles.pill}
        fallbackStyle={styles.pillFallback}
        tintColor={GLASS_TINT_CONTROL}
      >
        <Pressable
          style={styles.pillInner}
          onPress={() => inputRef.current?.focus()}
        >
          <Search size={20} color={colors.textMuted} />
          <TextInput
            ref={inputRef}
            style={styles.input}
            value={value}
            onChangeText={onChangeText}
            placeholder={placeholder ?? t('common:search.searchPlaceholder')}
            placeholderTextColor={colors.textMuted}
            returnKeyType="search"
          />
          {value.length > 0 && (
            <TouchableOpacity
              onPress={(event) => {
                event.stopPropagation();
                onChangeText('');
                inputRef.current?.focus();
              }}
              hitSlop={HIT_SLOP.sm}
              style={styles.clearButton}
            >
              <X size={16} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </Pressable>
      </GlassSurface>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  // Geometri (iki yolda da).
  pill: {
    height: 48,
    borderRadius: borderRadius.full,
  },
  // Yalnız cam yokken: bugünkü dolgu + çerçeve.
  pillFallback: {
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.border,
  },
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
    // Yüzen arama çubuğuyla AYNI punto (17 = iOS gövde metni) — iki arama
    // yüzeyi aynı boyutta okunsun.
    fontSize: 17,
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
});
