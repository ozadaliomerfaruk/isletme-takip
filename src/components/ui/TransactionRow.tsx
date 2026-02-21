import React, { memo, useCallback } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Image as ImageIcon } from 'lucide-react-native';
import { Text } from './Text';
import { colors } from '@/constants/colors';
import { spacing, borderRadius, fontSize, fontWeight } from '@/constants/spacing';
import { formatCurrency, toNumber } from '@/lib/currency';
import { getIslemIconConfig, getIslemAmountColor, getIslemAmountPrefix } from '@/lib/icons';
import type { IslemType } from '@/types/database';

export interface TransactionRowProps {
  id: string;
  type: IslemType;
  amount: number | string;
  date: string;
  typeLabel: string;
  secondaryText?: string | null;
  accountName?: string | null;
  hasPhoto?: boolean;
  onPress?: (id: string) => void;
  onLongPress?: (id: string) => void;
}

export const TransactionRow = memo(function TransactionRow({
  id,
  type,
  amount,
  date,
  typeLabel,
  secondaryText,
  accountName,
  hasPhoto,
  onPress,
  onLongPress,
}: TransactionRowProps) {
  const handlePress = useCallback(() => onPress?.(id), [onPress, id]);
  const handleLongPress = useCallback(() => onLongPress?.(id), [onLongPress, id]);

  const iconConfig = getIslemIconConfig(type, 22);
  const amountColor = getIslemAmountColor(type);
  const prefix = getIslemAmountPrefix(type);
  const numAmount = typeof amount === 'string' ? toNumber(amount) : amount;

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={handlePress}
      onLongPress={handleLongPress}
      activeOpacity={0.7}
      delayLongPress={400}
    >
      {/* Icon */}
      <View style={[styles.iconContainer, { backgroundColor: iconConfig.backgroundColor }]}>
        {iconConfig.icon}
      </View>

      {/* Content */}
      <View style={styles.content}>
        {/* Line 1: Type + Date */}
        <View style={styles.line1}>
          <Text style={styles.typeText} numberOfLines={1}>
            {typeLabel}
          </Text>
          <Text style={styles.dateText}>{date}</Text>
        </View>

        {/* Line 2: Description/Category + Account (only if there is secondary text or account) */}
        {(secondaryText || accountName) && (
          <View style={styles.line2}>
            {secondaryText ? (
              <Text style={styles.secondaryText} numberOfLines={1}>
                {secondaryText}
              </Text>
            ) : (
              <View style={styles.flex1} />
            )}
            {accountName && (
              <Text style={styles.accountText} numberOfLines={1}>
                {accountName}
              </Text>
            )}
          </View>
        )}
      </View>

      {/* Amount */}
      <View style={styles.amountContainer}>
        {hasPhoto && (
          <ImageIcon size={14} color={colors.primary} style={styles.photoIcon} />
        )}
        <Text
          style={[
            styles.amountText,
            { color: amountColor === 'success' ? '#059669'
              : amountColor === 'error' ? '#DC2626'
              : amountColor === 'warning' ? colors.warning
              : amountColor === 'info' ? colors.info
              : colors.text },
          ]}
        >
          {prefix}{formatCurrency(numAmount)}
        </Text>
      </View>
    </TouchableOpacity>
  );
}, (prev, next) => {
  return prev.id === next.id
    && prev.amount === next.amount
    && prev.type === next.type
    && prev.date === next.date
    && prev.hasPhoto === next.hasPhoto
    && prev.secondaryText === next.secondaryText;
});

// ============================================================================
// DATE SECTION HEADER
// ============================================================================

export interface DateSectionHeaderProps {
  title: string;
}

export function DateSectionHeader({ title }: DateSectionHeaderProps) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionLine} />
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionLine} />
    </View>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.sm,
    gap: spacing.md,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    gap: 2,
  },
  line1: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  typeText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    color: colors.text,
    flex: 1,
  },
  dateText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.normal,
    color: colors.textMuted,
  },
  line2: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  flex1: {
    flex: 1,
  },
  secondaryText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.normal,
    color: colors.textSecondary,
    flex: 1,
  },
  accountText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.normal,
    color: colors.textMuted,
  },
  amountContainer: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  photoIcon: {
    marginTop: 2,
  },
  amountText: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
  },
  // Section header styles
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xs,
    gap: spacing.sm,
  },
  sectionLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  sectionTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: colors.textMuted,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
});
