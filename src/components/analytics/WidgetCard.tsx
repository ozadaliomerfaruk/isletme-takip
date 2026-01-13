/**
 * WidgetCard Component
 *
 * Container for analytics widgets with header, loading state, and error handling
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { ChevronRight, AlertCircle } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import type { WidgetSize } from '@/types/analytics';

interface WidgetCardProps {
  title?: string;
  size?: WidgetSize;
  onPress?: () => void;
  isLoading?: boolean;
  error?: Error | null;
  showHeader?: boolean;
  children: React.ReactNode;
}

export function WidgetCard({
  title,
  size = 'full',
  onPress,
  isLoading = false,
  error = null,
  showHeader = true,
  children,
}: WidgetCardProps) {
  const { t } = useTranslation('analytics');

  // Error state
  if (error) {
    return (
      <View style={[styles.container, size === 'half' && styles.halfWidth]}>
        <View style={styles.errorContainer}>
          <AlertCircle size={24} color={colors.error} />
          <Text style={styles.errorText}>{t('errors.loadFailed')}</Text>
        </View>
      </View>
    );
  }

  const content = (
    <View style={[styles.container, size === 'half' && styles.halfWidth]}>
      {showHeader && title && (
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
          {onPress && <ChevronRight size={20} color={colors.textMuted} />}
        </View>
      )}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      ) : (
        <View style={styles.content}>{children}</View>
      )}
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
        {content}
      </TouchableOpacity>
    );
  }

  return content;
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  halfWidth: {
    width: '48%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  content: {
    flex: 1,
  },
  loadingContainer: {
    minHeight: 60,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    minHeight: 80,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
  },
  errorText: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
