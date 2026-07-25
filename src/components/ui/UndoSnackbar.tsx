import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Undo2, X } from 'lucide-react-native';
import { Text } from './Text';
import { GlassSurface } from './GlassSurface';
import { colors } from '@/constants/colors';

/**
 * Siyah cam tint'i. Bu çubuk AÇIK içeriğin (listeler) üstünde yüzüyor —
 * varsayılan GLASS_TINT ('transparent') ile açık zeminde okunmaz.
 * Koyu tint hem çubuğun bilinen kimliğini korur hem yüzeyi var eder.
 */
const SNACKBAR_TINT = 'rgba(0,0,0,0.55)';
import { spacing, borderRadius, HIT_SLOP } from '@/constants/spacing';

export interface UndoSnackbarProps {
  visible: boolean;
  message: string;
  onUndo: () => void;
  onDismiss: () => void;
  undoLabel?: string;
}

export function UndoSnackbar({
  visible,
  message,
  onUndo,
  onDismiss,
  undoLabel = 'Geri Al',
}: UndoSnackbarProps) {
  // insets.bottom, _layout'taki modifiedInsets sayesinde gerçek safe-area'ya
  // EK OLARAK overlay tab bar'ın yüksekliğini de taşır → çubuk bar'ın üstünde kalır.
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(100)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
          tension: 80,
          friction: 12,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: 100,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, translateY, opacity]);

  if (!visible) return null;

  return (
    <Animated.View
      style={[
        styles.container,
        { bottom: insets.bottom + spacing.md, transform: [{ translateY }], opacity },
      ]}
      pointerEvents="box-none"
    >
      {/* colorScheme="dark": koyu yüzen bar — açık cam burada yabancı durur. */}
      <GlassSurface
        style={styles.snackbar}
        fallbackStyle={styles.snackbarFallback}
        tintColor={SNACKBAR_TINT}
        colorScheme="dark"
      >
        <View style={styles.snackbarInner}>
          <Text style={styles.message} numberOfLines={2}>
            {message}
          </Text>
          <TouchableOpacity
            onPress={onUndo}
            style={styles.undoButton}
            activeOpacity={0.7}
            hitSlop={HIT_SLOP.sm}
          >
            <Undo2 size={16} color={colors.white} />
            <Text style={styles.undoText}>{undoLabel}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onDismiss}
            style={styles.closeButton}
            activeOpacity={0.7}
            hitSlop={HIT_SLOP.sm}
          >
            <X size={16} color="rgba(255,255,255,0.6)" />
          </TouchableOpacity>
        </View>
      </GlassSurface>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    // `bottom` çalışma zamanında veriliyor — sabit 24 iken çubuk OVERLAY tab
    // bar'ın ARKASINDA kalıyordu (bar akıştan çıkıp içeriğin üstüne taşındığı
    // için ekranın alt 24px'i artık bar'ın alanı). insets.bottom modifiedInsets
    // ile bar yüksekliğini de taşıyor → çubuk bar'ın üstünde yüzer.
    left: spacing.lg,
    right: spacing.lg,
    zIndex: 999,
  },
  // Geometri (iki yolda da): cam kendi köşesini native çizer, RN clip yok.
  snackbar: {
    borderRadius: borderRadius.lg,
  },
  // Yalnız cam yokken: bugünkü koyu dolgu + gölge. Cam yolunda EKLENMEZ —
  // düz katman ve gölge native rim lighting'i perdeler.
  snackbarFallback: {
    backgroundColor: '#323232',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  // İçerik camın ÇOCUĞU — dokunma tepkisinin (interactive) çalışması için şart.
  snackbarInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  message: {
    flex: 1,
    color: colors.white,
    fontSize: 14,
    fontWeight: '400',
  },
  undoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.md,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  undoText: {
    color: colors.white,
    fontSize: 13,
    fontWeight: '700',
  },
  closeButton: {
    padding: spacing.xs,
  },
});
