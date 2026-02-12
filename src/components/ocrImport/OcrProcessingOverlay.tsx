import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing } from '@/constants/spacing';

export function OcrProcessingOverlay() {
  const { t } = useTranslation('ocrImport');

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text variant="h3" style={styles.title}>{t('processing.title')}</Text>
      <Text variant="body" color="secondary">{t('processing.analyzing')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.md,
  },
  title: {
    marginTop: spacing.lg,
  },
});
