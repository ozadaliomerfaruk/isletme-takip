import React, { memo, useCallback } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Image as ImageIcon } from 'lucide-react-native';
import { Text } from './Text';
import { colors } from '@/constants/colors';
import { spacing, fontSize, fontWeight } from '@/constants/spacing';
import { formatCurrency, toNumber } from '@/lib/currency';
import { getTransactionColor, getTransactionPrefix, showAccentBar } from '@/lib/transactionColors';
import type { IslemType } from '@/types/database';

// ============================================================================
// TRANSACTION ROW — Presentational Component
// ============================================================================

export interface TransactionRowProps {
  id: string;
  type: IslemType;
  amount: number | string;
  date: string;
  typeLabel: string;
  /** Counterparty / entity name — rendered prominently (e.g. "→ Cari Adı") */
  entityText?: string | null;
  secondaryText?: string | null;
  tertiaryText?: string | null;
  subAmount?: string | null;
  hasPhoto?: boolean;
  currency?: string;
  /** Override the default color derived from type (e.g. for hesap-perspective transfers) */
  overrideColor?: string;
  /** Override the default prefix derived from type */
  overridePrefix?: string;
  onPress?: (id: string) => void;
  onLongPress?: (id: string) => void;
}

export const TransactionRow = memo(function TransactionRow({
  id,
  type,
  amount,
  date,
  typeLabel,
  entityText,
  secondaryText,
  tertiaryText,
  subAmount,
  hasPhoto,
  currency,
  overrideColor,
  overridePrefix,
  onPress,
  onLongPress,
}: TransactionRowProps) {
  const handlePress = useCallback(() => onPress?.(id), [onPress, id]);
  const handleLongPress = useCallback(() => onLongPress?.(id), [onLongPress, id]);

  const txColor = overrideColor ?? getTransactionColor(type);
  const prefix = overridePrefix ?? getTransactionPrefix(type);
  const hasBar = overrideColor ? true : showAccentBar(type);
  const numAmount = typeof amount === 'string' ? toNumber(amount) : amount;

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={handlePress}
      onLongPress={handleLongPress}
      activeOpacity={0.7}
      delayLongPress={400}
    >
      {/* Accent Bar */}
      {hasBar ? (
        <View style={[styles.accentBar, { backgroundColor: txColor }]} />
      ) : (
        <View style={styles.accentBarSpacer} />
      )}

      {/* Content */}
      <View style={styles.content}>
        {/* Line 1: Type Label + Date */}
        <View style={styles.line1}>
          <Text style={[styles.typeText, { color: txColor }]} numberOfLines={1}>
            {typeLabel}
          </Text>
          <Text style={styles.dateText}>{date}</Text>
        </View>

        {/* Entity line: counterparty name — prominent */}
        {entityText && (
          <Text style={styles.entityText} numberOfLines={1}>
            {entityText}
          </Text>
        )}

        {/* Line 2: Secondary + Tertiary — small muted info */}
        {(secondaryText || tertiaryText) && (
          <View style={styles.line2}>
            {secondaryText ? (
              <Text style={styles.secondaryText} numberOfLines={1}>
                {secondaryText}
              </Text>
            ) : (
              <View style={styles.flex1} />
            )}
            {tertiaryText && (
              <Text style={styles.tertiaryText} numberOfLines={1}>
                {tertiaryText}
              </Text>
            )}
          </View>
        )}
      </View>

      {/* Amount */}
      <View style={styles.amountContainer}>
        <View style={styles.amountRow}>
          {hasPhoto && (
            <ImageIcon size={14} color={colors.primary} style={styles.photoIcon} />
          )}
          <Text style={[styles.amountText, { color: txColor }]}>
            {prefix}{formatCurrency(Math.abs(numAmount), currency)}
          </Text>
        </View>
        {subAmount && (
          <Text style={styles.subAmountText}>{subAmount}</Text>
        )}
      </View>
    </TouchableOpacity>
  );
}, (prev, next) => {
  return prev.id === next.id
    && prev.amount === next.amount
    && prev.type === next.type
    && prev.date === next.date
    && prev.hasPhoto === next.hasPhoto
    && prev.entityText === next.entityText
    && prev.secondaryText === next.secondaryText
    && prev.tertiaryText === next.tertiaryText
    && prev.subAmount === next.subAmount
    && prev.overrideColor === next.overrideColor
    && prev.overridePrefix === next.overridePrefix;
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
    paddingVertical: 14,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    gap: spacing.md,
  },
  accentBar: {
    width: 3,
    alignSelf: 'stretch',
    borderRadius: 1.5,
  },
  accentBarSpacer: {
    width: 3,
  },
  content: {
    flex: 1,
    gap: 3,
  },
  line1: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  typeText: {
    fontSize: 13,
    fontWeight: fontWeight.bold,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.3,
    flex: 1,
  },
  dateText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
    color: colors.textMuted,
  },
  entityText: {
    fontSize: 15,
    fontWeight: fontWeight.semibold,
    color: colors.text,
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
    color: colors.textMuted,
    flex: 1,
  },
  tertiaryText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.normal,
    color: colors.textMuted,
  },
  amountContainer: {
    alignItems: 'flex-end',
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  photoIcon: {
    marginTop: 1,
  },
  amountText: {
    fontSize: 20,
    fontWeight: fontWeight.bold,
  },
  subAmountText: {
    fontSize: 11,
    fontWeight: fontWeight.normal,
    color: colors.textMuted,
    marginTop: 1,
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
    fontSize: 11,
    fontWeight: fontWeight.semibold,
    color: colors.textMuted,
    textTransform: 'uppercase' as const,
    letterSpacing: 1,
  },
});
