import { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, TouchableOpacity, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react-native';

import { Text } from './Text';
import { GlassSurface, withAlpha } from './GlassSurface';
import { colors } from '@/constants/colors';
import { spacing, borderRadius, HIT_SLOP } from '@/constants/spacing';
import { useToast, Toast as ToastType, ToastType as ToastVariant } from '@/contexts/ToastContext';

const iconMap: Record<ToastVariant, React.ReactNode> = {
  success: <CheckCircle size={20} color={colors.success} />,
  error: <XCircle size={20} color={colors.error} />,
  warning: <AlertTriangle size={20} color={colors.warning} />,
  info: <Info size={20} color={colors.info} />,
};

const bgColorMap: Record<ToastVariant, string> = {
  success: colors.successLight,
  error: colors.errorLight,
  warning: colors.warningLight,
  info: colors.infoLight,
};

const borderColorMap: Record<ToastVariant, string> = {
  success: colors.success,
  error: colors.error,
  warning: colors.warning,
  info: colors.info,
};

interface ToastItemProps {
  toast: ToastType;
  onDismiss: () => void;
}

/** Ekran dışına kayma mesafesi — üstten girip üstten çıkar. */
const OFFSCREEN_Y = -120;

function ToastItem({ toast, onDismiss }: ToastItemProps) {
  const translateY = useRef(new Animated.Value(OFFSCREEN_Y)).current;

  // OPACITY YOK — gövde cam ve cam yüzeyin atasında alpha<1 malzemeyi
  // çökertiyor (GlassSurface'taki ALTIN KURAL). Burada UndoSnackbar'dan da
  // kritikti: çıkış animasyonu onDismiss callback'ine bağlı olduğu için
  // gerçekten oynuyor, yani hata hem girişte hem çıkışta görünürdü.
  // Geçiş yalnız transform ile.
  useEffect(() => {
    Animated.timing(translateY, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [translateY]);

  const handleDismiss = () => {
    Animated.timing(translateY, {
      toValue: OFFSCREEN_Y,
      duration: 200,
      useNativeDriver: true,
    }).start(() => onDismiss());
  };

  const accent = borderColorMap[toast.type];

  return (
    <Animated.View style={{ transform: [{ translateY }] }}>
      <GlassSurface
        style={styles.toast}
        fallbackStyle={[styles.toastFallback, { backgroundColor: bgColorMap[toast.type] }]}
        // Tint semantik renkten türüyor: hata kırmızıya, başarı yeşile çalar.
        // Nötr bırakılsa dört toast türü yalnız 4px şeritle ayrılırdı.
        tintColor={withAlpha(accent, 0.2)}
      >
        {/* Sol aksan OPAK kalıyor: renk bilgi taşıyor, camın içinde erimemeli.
            Kenarlık (borderLeftWidth) yerine ayrı katman — border camın rim
            lighting'iyle çakışır. */}
        <View style={[styles.accent, { backgroundColor: accent }]} />
        <View style={styles.inner}>
          <View style={styles.iconContainer}>{iconMap[toast.type]}</View>
          <Text variant="body" style={styles.message} numberOfLines={2}>
            {toast.message}
          </Text>
          <TouchableOpacity
            onPress={handleDismiss}
            hitSlop={HIT_SLOP.md}
            style={styles.closeButton}
          >
            <X size={16} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
      </GlassSurface>
    </Animated.View>
  );
}

export function ToastContainer() {
  const { toasts, hideToast } = useToast();
  const insets = useSafeAreaInsets();

  if (toasts.length === 0) return null;

  return (
    <View style={[styles.container, { top: insets.top + spacing.sm }]}>
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={() => hideToast(toast.id)} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    zIndex: 9999,
    gap: spacing.sm,
  },
  // Geometri (iki yolda da). Gölge cam yolunda EKLENMİYOR — rim lighting'i
  // perdeler; fallback'te ayrıca veriliyor.
  toast: {
    borderRadius: borderRadius.lg,
  },
  /** Yalnız cam yokken: bugünkü renkli dolgu (inline) + gölge. */
  toastFallback: {
    ...Platform.select({
      ios: {
        shadowColor: colors.black,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
      },
      android: {
        elevation: 4,
      },
      default: {},
    }),
  },
  /** Sol semantik aksan — opak, camın içinde bir bilgi katmanı. */
  accent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    borderTopLeftRadius: borderRadius.lg,
    borderBottomLeftRadius: borderRadius.lg,
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    paddingLeft: spacing.md + 4, // aksan şeridi kadar içeri
  },
  iconContainer: {
    marginRight: spacing.sm,
  },
  message: {
    flex: 1,
    color: colors.text,
  },
  closeButton: {
    marginLeft: spacing.sm,
    padding: spacing.xs,
  },
});
