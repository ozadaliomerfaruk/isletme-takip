import { useEffect, useRef } from 'react';
import { View, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Search, X } from 'lucide-react-native';
import { colors } from '@/constants/colors';
import { spacing, borderRadius, fontSize, HIT_SLOP } from '@/constants/spacing';

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
      <View style={styles.pill}>
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
            onPress={() => onChangeText('')}
            hitSlop={HIT_SLOP.sm}
            style={styles.clearButton}
          >
            <X size={16} color={colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.border,
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
});
