import { useRef, useState, useCallback } from 'react';
import { View, TextInput, StyleSheet, TouchableOpacity } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolateColor,
  FadeIn,
  FadeOut,
} from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { Search, X } from 'lucide-react-native';
import { colors } from '@/constants/colors';
import { spacing, borderRadius, fontSize, HIT_SLOP } from '@/constants/spacing';
import { Text } from './Text';

interface SearchInputProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
}

const ANIM_DURATION = 200;

export function SearchInput({
  value,
  onChangeText,
  placeholder,
}: SearchInputProps) {
  const { t } = useTranslation('common');
  const displayPlaceholder = placeholder ?? t('common:search.searchPlaceholder');
  const inputRef = useRef<TextInput>(null);
  const [isFocused, setIsFocused] = useState(false);
  const focusProgress = useSharedValue(0);

  const showCancel = isFocused || value.length > 0;

  const handleFocus = useCallback(() => {
    setIsFocused(true);
    focusProgress.value = withTiming(1, { duration: ANIM_DURATION });
  }, [focusProgress]);

  const handleBlur = useCallback(() => {
    setIsFocused(false);
    focusProgress.value = withTiming(0, { duration: ANIM_DURATION });
  }, [focusProgress]);

  const handleClear = useCallback(() => {
    onChangeText('');
    inputRef.current?.focus();
  }, [onChangeText]);

  const handleCancel = useCallback(() => {
    onChangeText('');
    inputRef.current?.blur();
  }, [onChangeText]);

  const borderAnimStyle = useAnimatedStyle(() => {
    const borderColor = interpolateColor(
      focusProgress.value,
      [0, 1],
      ['transparent', colors.primary],
    );
    return { borderColor };
  });

  return (
    <View style={styles.wrapper}>
      <Animated.View style={[styles.container, borderAnimStyle]}>
        <Search size={20} color={isFocused ? colors.primary : colors.textMuted} />
        <TextInput
          ref={inputRef}
          style={styles.input}
          value={value}
          onChangeText={onChangeText}
          placeholder={displayPlaceholder}
          placeholderTextColor={colors.textMuted}
          onFocus={handleFocus}
          onBlur={handleBlur}
          returnKeyType="search"
        />
        {value.length > 0 && (
          <Animated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(150)}>
            <TouchableOpacity
              onPress={handleClear}
              hitSlop={HIT_SLOP.sm}
              style={styles.clearButton}
            >
              <X size={16} color={colors.textMuted} />
            </TouchableOpacity>
          </Animated.View>
        )}
      </Animated.View>
      {showCancel && (
        <Animated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(150)}>
          <TouchableOpacity onPress={handleCancel} style={styles.cancelButton}>
            <Text style={styles.cancelText}>{t('common:buttons.cancel')}</Text>
          </TouchableOpacity>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  container: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  input: {
    flex: 1,
    color: colors.text,
    fontSize: fontSize.lg,
  },
  clearButton: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: {
    paddingVertical: spacing.sm,
  },
  cancelText: {
    color: colors.primary,
    fontSize: fontSize.md,
    fontWeight: '500',
  },
});
