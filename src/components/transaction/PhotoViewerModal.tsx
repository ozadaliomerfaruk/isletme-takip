/**
 * PhotoViewerModal - Full screen modal to view transaction photos
 * Displays photo in full screen with zoom capability, share, delete and change options
 * Supports swipe down to dismiss and pinch to zoom
 */

import { useState, useEffect } from 'react';
import { View, Image, TouchableOpacity, StyleSheet, ActivityIndicator, useWindowDimensions, Alert, StatusBar, Share } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X, Trash2, RefreshCw, Share as ShareIcon } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import {
  GestureHandlerRootView,
  GestureDetector,
  Gesture,
} from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Text, GlassSurface, Modal } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing, borderRadius, HIT_SLOP } from '@/constants/spacing';

/** Sil butonunun cam tint'i — kırmızı kalsın ama malzeme cam olsun. */
const DELETE_TINT = 'rgba(239,68,68,0.55)'; // colors.error #EF4444
import { useGetPhotoUrl } from '@/hooks/useIslemPhoto';

const DISMISS_THRESHOLD = 150;

/** Sürüklemede header'ın yukarı, alt çubuğun aşağı kayacağı mesafe (kendi yüksekliklerinden fazla). */
const UI_HIDE_OFFSET = 160;

interface PhotoViewerModalProps {
  /** Render inside an already-open native modal without opening another window. */
  inline?: boolean;
  /** Whether modal is visible */
  visible: boolean;
  /** Storage path of the photo */
  photoPath: string | null;
  /** Callback when modal is closed */
  onClose: () => void;
  /** Optional callback when delete is pressed */
  onDelete?: () => void;
  /** Optional callback when change photo is pressed */
  onChange?: () => void;
  /** Whether an action is in progress */
  isLoading?: boolean;
}

export function PhotoViewerModal({
  inline = false,
  visible,
  photoPath,
  onClose,
  onDelete,
  onChange,
  isLoading: actionLoading,
}: PhotoViewerModalProps) {
  const { t } = useTranslation('common');
  const insets = useSafeAreaInsets();
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isSharing, setIsSharing] = useState(false);
  const getPhotoUrl = useGetPhotoUrl();
  // Pencereyle güncellenen boyutlar: donmuş değerler foto kırpma, yanlış
  // zoom merkezi ve bayat pan sınırı üretiyordu (gesture'lar render
  // kapsamında tanımlı olduğundan güncel değeri kapatırlar)
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  // Zoom state
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const focalX = useSharedValue(0);
  const focalY = useSharedValue(0);

  // Pan state (for zoomed image)
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  // Dismiss state
  const dismissTranslateY = useSharedValue(0);
  const backdropOpacity = useSharedValue(1);

  // Reset all states when modal opens/closes
  useEffect(() => {
    if (visible) {
      // Reset on open
      scale.value = 1;
      savedScale.value = 1;
      translateX.value = 0;
      translateY.value = 0;
      savedTranslateX.value = 0;
      savedTranslateY.value = 0;
      dismissTranslateY.value = 0;
      backdropOpacity.value = 1;
    }
  }, [visible]);

  // Fetch signed URL when modal opens (skip for local file:// URIs)
  useEffect(() => {
    if (visible && photoPath) {
      console.log('[PhotoViewer] Opening with path:', photoPath);
      setImageUrl(null);

      // Local file URIs (file://, content://, ph://) can be used directly
      if (photoPath.startsWith('file://') || photoPath.startsWith('content://') || photoPath.startsWith('ph://')) {
        console.log('[PhotoViewer] Using local URI directly');
        setImageUrl(photoPath);
        return;
      }

      getPhotoUrl.mutate(photoPath, {
        onSuccess: (url) => {
          setImageUrl(url);
        },
        onError: (error) => {
          console.error('[PhotoViewer] Error getting URL:', error);
          Alert.alert(t('status.error'), t('photo.loadError'));
          onClose();
        },
      });
    } else {
      setImageUrl(null);
    }
  }, [visible, photoPath]);

  const handleClose = () => {
    onClose();
  };

  const handleDelete = () => {
    if (!onDelete) return;

    Alert.alert(
      t('photo.deleteTitle'),
      t('photo.deleteConfirm'),
      [
        { text: t('buttons.cancel'), style: 'cancel' },
        { text: t('buttons.delete'), style: 'destructive', onPress: onDelete },
      ]
    );
  };

  const handleChange = () => {
    if (!onChange) return;
    onChange();
  };

  const handleShare = async () => {
    if (!imageUrl) return;

    let temporaryShareUri: string | null = null;
    setIsSharing(true);
    try {
      const isAvailable = await Sharing.isAvailableAsync();

      if (!isAvailable) {
        await Share.share({
          url: imageUrl,
          message: t('photo.shareMessage'),
        });
        return;
      }

      const filename = photoPath?.split('/').pop() || 'photo.webp';
      const localUri = `${FileSystem.cacheDirectory}${filename}`;

      // downloadAsync hata verse veya 200 dışı dönse bile kısmi cache dosyasını finally temizle.
      temporaryShareUri = localUri;
      const downloadResult = await FileSystem.downloadAsync(imageUrl, localUri);

      if (downloadResult.status === 200) {
        temporaryShareUri = downloadResult.uri;
        await Sharing.shareAsync(downloadResult.uri, {
          mimeType: 'image/webp',
          dialogTitle: t('photo.shareTitle'),
        });
      } else {
        throw new Error('Download failed');
      }
    } catch (error) {
      console.error('[PhotoViewer] Share error:', error);
      try {
        await Share.share({
          url: imageUrl,
          message: t('photo.shareMessage'),
        });
      } catch {
        Alert.alert(t('status.error'), t('photo.shareError'));
      }
    } finally {
      if (temporaryShareUri) {
        try {
          await FileSystem.deleteAsync(temporaryShareUri, { idempotent: true });
        } catch {
          // Paylaşım tamamlandı; cache temizliği kullanıcı akışını başarısız göstermemeli.
        }
      }
      setIsSharing(false);
    }
  };

  // Pinch to zoom gesture
  const pinchGesture = Gesture.Pinch()
    .onStart((e) => {
      focalX.value = e.focalX;
      focalY.value = e.focalY;
    })
    .onUpdate((e) => {
      // Calculate new scale based on saved scale
      const newScale = savedScale.value * e.scale;
      // Clamp between 0.5 and 5 during gesture
      scale.value = Math.min(Math.max(newScale, 0.5), 5);
    })
    .onEnd(() => {
      // Snap to bounds after gesture ends
      if (scale.value < 1) {
        scale.value = withTiming(1, { duration: 200 });
        savedScale.value = 1;
        translateX.value = withTiming(0, { duration: 200 });
        translateY.value = withTiming(0, { duration: 200 });
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      } else if (scale.value > 4) {
        scale.value = withTiming(4, { duration: 200 });
        savedScale.value = 4;
      } else {
        // Save the current scale
        savedScale.value = scale.value;
      }
    });

  // Pan gesture - handles both dismiss (when not zoomed) and move (when zoomed)
  const panGesture = Gesture.Pan()
    .onUpdate((e) => {
      if (savedScale.value > 1) {
        // Zoomed: move the image
        translateX.value = savedTranslateX.value + e.translationX;
        translateY.value = savedTranslateY.value + e.translationY;
      } else {
        // Not zoomed: dismiss gesture (only vertical)
        if (Math.abs(e.translationY) > Math.abs(e.translationX)) {
          dismissTranslateY.value = e.translationY;
          // Fade backdrop as we drag
          backdropOpacity.value = interpolate(
            Math.abs(e.translationY),
            [0, DISMISS_THRESHOLD * 2],
            [1, 0.3],
            Extrapolation.CLAMP
          );
        }
      }
    })
    .onEnd((e) => {
      if (savedScale.value > 1) {
        // Zoomed: save position
        savedTranslateX.value = translateX.value;
        savedTranslateY.value = translateY.value;

        // Bound check - prevent image from going too far
        const maxX = (screenWidth * (savedScale.value - 1)) / 2;
        const maxY = (screenHeight * (savedScale.value - 1)) / 2;

        if (Math.abs(translateX.value) > maxX) {
          const boundedX = translateX.value > 0 ? maxX : -maxX;
          translateX.value = withTiming(boundedX, { duration: 150 });
          savedTranslateX.value = boundedX;
        }
        if (Math.abs(translateY.value) > maxY) {
          const boundedY = translateY.value > 0 ? maxY : -maxY;
          translateY.value = withTiming(boundedY, { duration: 150 });
          savedTranslateY.value = boundedY;
        }
      } else {
        // Not zoomed: check if should dismiss
        const shouldDismiss =
          Math.abs(dismissTranslateY.value) > DISMISS_THRESHOLD ||
          Math.abs(e.velocityY) > 500;

        if (shouldDismiss) {
          // Close immediately
          runOnJS(handleClose)();
        } else {
          // Snap back
          dismissTranslateY.value = withTiming(0, { duration: 150 });
          backdropOpacity.value = withTiming(1, { duration: 150 });
        }
      }
    });

  // Double tap to zoom
  const doubleTapGesture = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd((e) => {
      if (savedScale.value > 1) {
        // Reset zoom
        scale.value = withTiming(1, { duration: 200 });
        savedScale.value = 1;
        translateX.value = withTiming(0, { duration: 200 });
        translateY.value = withTiming(0, { duration: 200 });
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      } else {
        // Zoom in to 2.5x at tap point
        const targetScale = 2.5;
        scale.value = withTiming(targetScale, { duration: 200 });
        savedScale.value = targetScale;

        // Calculate offset to center zoom on tap point
        const centerX = screenWidth / 2;
        const centerY = screenHeight / 2;
        const offsetX = (centerX - e.x) * (targetScale - 1);
        const offsetY = (centerY - e.y) * (targetScale - 1);

        translateX.value = withTiming(offsetX, { duration: 200 });
        translateY.value = withTiming(offsetY, { duration: 200 });
        savedTranslateX.value = offsetX;
        savedTranslateY.value = offsetY;
      }
    });

  // Combine gestures - pinch and pan are simultaneous, double tap is exclusive
  const composedGesture = Gesture.Race(
    doubleTapGesture,
    Gesture.Simultaneous(pinchGesture, panGesture)
  );

  // Image transform style
  const imageAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value + dismissTranslateY.value },
      { scale: scale.value },
    ],
  }));

  // Backdrop opacity style
  const backdropAnimatedStyle = useAnimatedStyle(() => ({
    backgroundColor: `rgba(0, 0, 0, ${backdropOpacity.value * 0.95})`,
  }));

  /**
   * OPACITY YOK — bilinçli. Header ve alt aksiyon çubuğunun ÇOCUKLARI
   * GlassSurface; bir ATADA alpha < 1 olursa sistem view'i offscreen render'a
   * alıyor, cam o anda arkasını ÖRNEKLEYEMİYOR ve malzeme çöküyor (ikon/yazı
   * havada asılı kalır, yüzey kaybolur). Sürüklemede gizlenme bu yüzden yalnız
   * TRANSFORM ile: header yukarı, alt çubuk aşağı kayar (UndoSnackbar deseni).
   */
  const headerAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateY: interpolate(
          backdropOpacity.value,
          [0.3, 1],
          [-UI_HIDE_OFFSET, 0],
          Extrapolation.CLAMP
        ),
      },
    ],
  }));

  const bottomAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateY: interpolate(
          backdropOpacity.value,
          [0.3, 1],
          [UI_HIDE_OFFSET, 0],
          Extrapolation.CLAMP
        ),
      },
    ],
  }));

  // İpucu yazısı cam DEĞİL (düz Text) — burada opacity güvenli.
  const hintAnimatedStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  const isImageLoading = getPhotoUrl.isPending || !imageUrl;
  const hasActions = onDelete || onChange;
  const isAnyLoading = actionLoading || isSharing;

  return (
    <Modal
      inline={inline}
      visible={visible}
      animationType="fade"
      transparent
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <StatusBar barStyle="light-content" />
      <GestureHandlerRootView style={styles.flex}>
        <Animated.View style={[styles.container, backdropAnimatedStyle]}>
          {/* Header with proper safe area */}
          <Animated.View style={[styles.header, { paddingTop: insets.top + 8 }, headerAnimatedStyle]}>
            {/* colorScheme="dark": fotoğrafın koyu zemininde açık cam yabancı durur. */}
            <GlassSurface style={styles.roundButton} colorScheme="dark">
              <TouchableOpacity
                style={styles.roundButtonInner}
                onPress={onClose}
                hitSlop={HIT_SLOP.lg}
              >
                <X size={24} color="#FFFFFF" />
              </TouchableOpacity>
            </GlassSurface>

            <Text style={styles.title}>{t('photo.title')}</Text>

            {/* Share button in header */}
            {!isImageLoading && (
              <GlassSurface style={styles.roundButton} colorScheme="dark">
                <TouchableOpacity
                  style={styles.roundButtonInner}
                  onPress={handleShare}
                  disabled={isSharing}
                  hitSlop={HIT_SLOP.lg}
                >
                  {isSharing ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <ShareIcon size={22} color="#FFFFFF" />
                  )}
                </TouchableOpacity>
              </GlassSurface>
            )}
            {isImageLoading && <View style={styles.placeholder} />}
          </Animated.View>

          {/* Image with zoom */}
          <View style={styles.imageContainer}>
            {isImageLoading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#FFFFFF" />
                <Text style={styles.loadingText}>{t('status.loading')}</Text>
              </View>
            ) : (
              <GestureDetector gesture={composedGesture}>
                <Animated.View style={[styles.imageWrapper, { width: screenWidth, height: screenHeight * 0.7 }, imageAnimatedStyle]}>
                  <Image
                    source={{ uri: imageUrl }}
                    style={styles.image}
                    resizeMode="contain"
                  />
                </Animated.View>
              </GestureDetector>
            )}
          </View>

          {/* Bottom actions */}
          {hasActions && !isImageLoading && (
            <Animated.View style={[styles.bottomActions, { paddingBottom: insets.bottom + 16 }, bottomAnimatedStyle]}>
              {onChange && (
                <GlassSurface
                  style={styles.actionButton}
                  fallbackStyle={styles.changeButtonFallback}
                  colorScheme="dark"
                >
                  <TouchableOpacity
                    style={styles.actionButtonInner}
                    onPress={handleChange}
                    disabled={isAnyLoading}
                  >
                    <RefreshCw size={18} color="#FFFFFF" />
                    <Text style={styles.buttonText}>{t('photo.change')}</Text>
                  </TouchableOpacity>
                </GlassSurface>
              )}
              {onDelete && (
                /* Yıkıcı aksiyon: cam ama KIRMIZI tint'li — malzeme değişse de
                   uyarı ağırlığı korunsun (nötr cam olsa "sil" sıradanlaşırdı). */
                <GlassSurface
                  style={styles.actionButton}
                  fallbackStyle={styles.deleteButtonFallback}
                  tintColor={DELETE_TINT}
                  colorScheme="dark"
                >
                  <TouchableOpacity
                    style={styles.actionButtonInner}
                    onPress={handleDelete}
                    disabled={isAnyLoading}
                  >
                    {actionLoading ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <>
                        <Trash2 size={18} color="#FFFFFF" />
                        <Text style={styles.buttonText}>{t('photo.delete')}</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </GlassSurface>
              )}
            </Animated.View>
          )}

          {/* Zoom hint */}
          {!isImageLoading && (
            <Animated.View
              style={[
                styles.hintContainer,
                { bottom: hasActions ? insets.bottom + 80 : insets.bottom + 16 },
                hintAnimatedStyle
              ]}
            >
              <Text style={styles.hintText}>{t('photo.zoomHint')}</Text>
            </Animated.View>
          )}
        </Animated.View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255, 255, 255, 0.2)',
    zIndex: 10,
  },
  /** Cam yuvarlak buton (kapat / paylaş) — geometri; dokunma yüzeyi içeride. */
  roundButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  roundButtonInner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  placeholder: {
    width: 44,
    height: 44,
  },
  imageContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  imageWrapper: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  loadingContainer: {
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    color: '#FFFFFF',
    fontSize: 14,
  },
  bottomActions: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    gap: spacing.md,
    zIndex: 10,
  },
  // Geometri camda, satır düzeni içeride (cam yolunda dolgu/gölge EKLENMEZ).
  actionButton: {
    flex: 1,
    borderRadius: borderRadius.md,
  },
  actionButtonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  changeButtonFallback: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },
  deleteButtonFallback: {
    backgroundColor: colors.error,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  hintContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 10,
  },
  hintText: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 12,
  },
});
