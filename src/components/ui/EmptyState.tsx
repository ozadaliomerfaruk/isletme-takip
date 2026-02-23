import { View, StyleSheet } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { Text } from './Text';
import { Button } from './Button';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  return (
    <View style={styles.container}>
      <Animated.View
        entering={FadeInDown.duration(400).springify().damping(18).stiffness(140)}
        style={styles.content}
      >
        {icon && (
          <View style={styles.iconContainer}>
            {icon}
          </View>
        )}
        <Text variant="h3" center style={styles.title}>
          {title}
        </Text>
        {description && (
          <Text variant="bodySmall" color="secondary" center style={styles.description}>
            {description}
          </Text>
        )}
        {actionLabel && onAction && (
          <Button variant="primary" onPress={onAction} style={styles.button}>
            {actionLabel}
          </Button>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing['3xl'],
  },
  content: {
    alignItems: 'center',
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: borderRadius['2xl'],
    backgroundColor: colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xl,
  },
  title: {
    marginBottom: spacing.sm,
  },
  description: {
    marginBottom: spacing.xl,
    lineHeight: 20,
  },
  button: {
    minWidth: 150,
  },
});
