/**
 * PhotoButton component for adding/viewing transaction photos
 * Shows camera icon when no photo, image icon when photo exists
 */

import { TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { Camera, Image as ImageIcon } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { colors } from '@/constants/colors';

interface PhotoButtonProps {
  /** Whether a photo is attached */
  hasPhoto: boolean;
  /** Callback when user wants to pick image from gallery */
  onPickImage: () => void;
  /** Callback when user wants to take a photo with camera */
  onTakePhoto: () => void;
  /** Callback when user wants to remove the photo */
  onRemovePhoto?: () => void;
  /** Callback when user wants to view the photo */
  onViewPhoto?: () => void;
  /** Whether button is disabled */
  disabled?: boolean;
  /** Whether loading (e.g., uploading) */
  loading?: boolean;
  /** Size variant */
  size?: 'small' | 'medium';
}

export function PhotoButton({
  hasPhoto,
  onPickImage,
  onTakePhoto,
  onRemovePhoto,
  onViewPhoto,
  disabled,
  loading,
  size = 'medium',
}: PhotoButtonProps) {
  const { t } = useTranslation('common');

  const handlePress = () => {
    if (loading || disabled) return;

    if (hasPhoto) {
      // Photo exists: show view/remove options
      const options: { text: string; onPress?: () => void; style?: 'cancel' | 'destructive' }[] = [];

      if (onViewPhoto) {
        options.push({ text: t('photo.view'), onPress: onViewPhoto });
      }
      if (onRemovePhoto) {
        options.push({ text: t('photo.remove'), onPress: onRemovePhoto, style: 'destructive' });
      }
      options.push({ text: t('buttons.cancel'), style: 'cancel' });

      Alert.alert(t('photo.title'), t('photo.existingPhotoOptions'), options);
    } else {
      // No photo: show add options
      Alert.alert(t('photo.addPhoto'), t('photo.selectSource'), [
        { text: t('photo.camera'), onPress: onTakePhoto },
        { text: t('photo.gallery'), onPress: onPickImage },
        { text: t('buttons.cancel'), style: 'cancel' },
      ]);
    }
  };

  const iconSize = size === 'small' ? 16 : 20;
  const buttonStyle = size === 'small' ? styles.buttonSmall : styles.button;

  if (loading) {
    return (
      <TouchableOpacity
        style={[buttonStyle, styles.buttonLoading]}
        disabled
      >
        <ActivityIndicator size="small" color={colors.primary} />
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      style={[buttonStyle, hasPhoto && styles.buttonWithPhoto, disabled && styles.buttonDisabled]}
      onPress={handlePress}
      disabled={disabled}
    >
      {hasPhoto ? (
        <ImageIcon size={iconSize} color={colors.primary} />
      ) : (
        <Camera size={iconSize} color={colors.textMuted} />
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  buttonSmall: {
    width: 36,
    height: 36,
    borderRadius: 6,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  buttonWithPhoto: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  buttonLoading: {
    backgroundColor: colors.surfaceLight,
    borderColor: colors.border,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});
