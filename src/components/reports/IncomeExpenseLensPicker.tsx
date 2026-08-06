import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { Check, ChevronDown, Scale, X } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { Modal, Text } from '@/components/ui';
import {
  FALLBACK_SURFACE,
  GLASS_TINT_CONTROL,
  GlassSurface,
} from '@/components/ui/GlassSurface';
import { colors } from '@/constants/colors';
import { borderRadius, shadows, spacing } from '@/constants/spacing';
import type { IncomeExpenseLens } from '@/lib/reportLens';

interface IncomeExpenseLensPickerProps {
  value: IncomeExpenseLens;
  onChange: (value: IncomeExpenseLens) => void;
  visible?: boolean;
}

/**
 * Rapor kayarken ekranda kalan kompakt değerleme kontrolü. Seçenekler ayrı bir
 * üst panelde açılır; uzun açıklamalar ana rapor akışını itmez.
 */
export function IncomeExpenseLensPicker({
  value,
  onChange,
  visible = true,
}: IncomeExpenseLensPickerProps) {
  const { t } = useTranslation('reports');
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const [panelVisible, setPanelVisible] = useState(false);
  const panelY = useRef(new Animated.Value(-windowHeight)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const panelHeightRef = useRef(0);
  const openingFrameRef = useRef<number | null>(null);
  const closingRef = useRef(false);

  const options: Array<{ label: string; value: IncomeExpenseLens }> = [
    { label: t('incomeExpenseLens.nominal'), value: 'nominal' },
    { label: t('incomeExpenseLens.real'), value: 'reel' },
    { label: t('incomeExpenseLens.usd'), value: 'usd' },
    { label: t('incomeExpenseLens.eur'), value: 'eur' },
    { label: t('incomeExpenseLens.gold'), value: 'altin' },
  ];
  const selectedLabel = options.find((option) => option.value === value)?.label
    ?? options[0].label;

  const getHiddenPanelY = useCallback(
    () => -Math.max(panelHeightRef.current, windowHeight * 0.7),
    [windowHeight],
  );

  const openPanel = useCallback(() => {
    closingRef.current = false;
    panelY.stopAnimation();
    backdropOpacity.stopAnimation();
    panelY.setValue(getHiddenPanelY());
    backdropOpacity.setValue(0);
    setPanelVisible(true);
  }, [backdropOpacity, getHiddenPanelY, panelY]);

  const handlePanelShow = useCallback(() => {
    if (openingFrameRef.current !== null) {
      cancelAnimationFrame(openingFrameRef.current);
    }

    openingFrameRef.current = requestAnimationFrame(() => {
      openingFrameRef.current = null;
      panelY.setValue(getHiddenPanelY());
      Animated.parallel([
        Animated.timing(panelY, {
          toValue: 0,
          duration: 240,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 180,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start();
    });
  }, [backdropOpacity, getHiddenPanelY, panelY]);

  const closePanel = useCallback(() => {
    if (!panelVisible || closingRef.current) return;
    closingRef.current = true;

    if (openingFrameRef.current !== null) {
      cancelAnimationFrame(openingFrameRef.current);
      openingFrameRef.current = null;
    }

    panelY.stopAnimation();
    backdropOpacity.stopAnimation();
    Animated.parallel([
      Animated.timing(panelY, {
        toValue: getHiddenPanelY(),
        duration: 200,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: 160,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      closingRef.current = false;
      if (finished) setPanelVisible(false);
    });
  }, [backdropOpacity, getHiddenPanelY, panelVisible, panelY]);

  const handlePanelLayout = useCallback((event: LayoutChangeEvent) => {
    panelHeightRef.current = event.nativeEvent.layout.height;
  }, []);

  useEffect(() => () => {
    if (openingFrameRef.current !== null) {
      cancelAnimationFrame(openingFrameRef.current);
    }
    panelY.stopAnimation();
    backdropOpacity.stopAnimation();
  }, [backdropOpacity, panelY]);

  if (!visible) return null;

  return (
    <>
      <GlassSurface
        style={styles.stickyButton}
        fallbackStyle={styles.stickyButtonFallback}
        tintColor={GLASS_TINT_CONTROL}
        interactive
      >
        <Pressable
          style={({ pressed }) => [
            styles.stickyButtonInner,
            pressed && styles.stickyButtonPressed,
          ]}
          onPress={openPanel}
          accessibilityRole="button"
          accessibilityLabel={t('incomeExpenseLens.select')}
          accessibilityState={{ expanded: panelVisible }}
        >
          <View style={styles.iconWell}>
            <Scale size={16} color={colors.primary} />
          </View>
          <View style={styles.buttonCopy}>
            <Text variant="caption" color="secondary" style={styles.eyebrow}>
              {t('incomeExpenseLens.title')}
            </Text>
            <Text variant="caption" numberOfLines={1} style={styles.selectedLabel}>
              {selectedLabel}
            </Text>
          </View>
          <ChevronDown size={16} color={colors.textSecondary} />
        </Pressable>
      </GlassSurface>

      <Modal
        visible={panelVisible}
        transparent
        statusBarTranslucent
        animationType="none"
        onShow={handlePanelShow}
        onRequestClose={closePanel}
      >
        <View style={styles.modalRoot}>
          <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={closePanel}
              accessibilityRole="button"
              accessibilityLabel={t('incomeExpenseLens.close')}
            />
          </Animated.View>

          <Animated.View
            onLayout={handlePanelLayout}
            style={[
              styles.panel,
              {
                paddingTop: Math.max(insets.top, spacing.md) + spacing.sm,
                transform: [{ translateY: panelY }],
              },
            ]}
          >
            <View style={styles.panelHeader}>
              <View style={styles.panelTitleRow}>
                <View style={styles.panelIcon}>
                  <Scale size={20} color={colors.primary} />
                </View>
                <View style={styles.panelTitleCopy}>
                  <Text variant="h3">{t('incomeExpenseLens.panelTitle')}</Text>
                  <Text variant="caption" color="secondary">
                    {t('incomeExpenseLens.panelSubtitle')}
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={closePanel}
                accessibilityRole="button"
                accessibilityLabel={t('incomeExpenseLens.close')}
              >
                <X size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <View style={styles.options}>
              {options.map((option) => {
                const active = option.value === value;
                return (
                  <TouchableOpacity
                    key={option.value}
                    style={[styles.option, active && styles.optionActive]}
                    onPress={() => {
                      onChange(option.value);
                      closePanel();
                    }}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: active }}
                  >
                    <View style={styles.optionCopy}>
                      <Text
                        variant="body"
                        style={[styles.optionLabel, active && styles.optionLabelActive]}
                      >
                        {option.label}
                      </Text>
                      <Text variant="caption" color="secondary">
                        {t(`incomeExpenseLens.description.${option.value}`)}
                      </Text>
                    </View>
                    <View style={[styles.checkWell, active && styles.checkWellActive]}>
                      {active ? <Check size={16} color={colors.white} /> : null}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>

            {value !== 'nominal' ? (
              <View style={styles.referenceNote}>
                <Text variant="caption" color="secondary">
                  {t(`incomeExpenseLens.note.${value}`)}
                </Text>
                <Text variant="caption" color="secondary" style={styles.futureNote}>
                  {t('incomeExpenseLens.futureReferenceNote')}
                </Text>
              </View>
            ) : null}
          </Animated.View>
        </View>
      </Modal>
    </>
  );
}

export const INCOME_EXPENSE_LENS_STICKY_SPACE = 64;

const styles = StyleSheet.create({
  stickyButton: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.lg,
    zIndex: 20,
    minHeight: 48,
    maxWidth: 214,
    borderRadius: borderRadius.full,
  },
  stickyButtonFallback: {
    backgroundColor: FALLBACK_SURFACE,
    borderWidth: 1,
    borderColor: colors.primary + '35',
    ...shadows.md,
  },
  stickyButtonInner: {
    minHeight: 48,
    maxWidth: 214,
    paddingLeft: spacing.xs,
    paddingRight: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  stickyButtonPressed: {
    backgroundColor: colors.primary + '14',
  },
  iconWell: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonCopy: {
    flexShrink: 1,
  },
  eyebrow: {
    fontSize: 9,
    lineHeight: 11,
    letterSpacing: 0.45,
    fontWeight: '700',
  },
  selectedLabel: {
    color: colors.text,
    fontWeight: '700',
    lineHeight: 16,
  },
  modalRoot: {
    flex: 1,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.black + '55',
  },
  panel: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    borderBottomLeftRadius: borderRadius['2xl'],
    borderBottomRightRadius: borderRadius['2xl'],
    backgroundColor: colors.surface,
    ...shadows.lg,
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  panelTitleRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  panelIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  panelTitleCopy: {
    flex: 1,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceLighter,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.sm,
  },
  options: {
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  option: {
    minHeight: 60,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  optionActive: {
    backgroundColor: colors.primaryLight,
  },
  optionCopy: {
    flex: 1,
    paddingRight: spacing.md,
  },
  optionLabel: {
    fontWeight: '600',
  },
  optionLabelActive: {
    color: colors.primary,
    fontWeight: '700',
  },
  checkWell: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkWellActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  referenceNote: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.xs,
  },
  futureNote: {
    marginTop: spacing.xs,
  },
});
