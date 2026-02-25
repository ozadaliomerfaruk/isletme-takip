import React, { memo, useCallback } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Image as ImageIcon } from 'lucide-react-native';
import { Text } from './Text';
import { TransactionIcon } from './TransactionIcon';
import { colors } from '@/constants/colors';
import { spacing, fontSize, fontWeight, borderRadius } from '@/constants/spacing';
import { useTranslation } from 'react-i18next';
import { formatCurrency, toNumber } from '@/lib/currency';
import { getTransactionColor, getTransactionPrefix } from '@/lib/transactionColors';
import { isLeaveType } from '@/constants/islemTypes';
import type { IslemType } from '@/types/database';

// ============================================================================
// TRANSACTION ROW — Presentational Component (Modernized)
// ============================================================================

export interface TransactionRowProps {
  id: string;
  type: IslemType;
  amount: number | string;
  date: string;
  typeLabel: string;
  /** Counterparty / entity name — rendered prominently */
  entityText?: string | null;
  secondaryText?: string | null;
  tertiaryText?: string | null;
  subAmount?: string | null;
  hasPhoto?: boolean;
  currency?: string;
  /** Override the default color derived from type */
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

  const { t } = useTranslation(['staff']);
  const txColor = overrideColor ?? getTransactionColor(type);
  const prefix = overridePrefix ?? getTransactionPrefix(type);
  const numAmount = typeof amount === 'string' ? toNumber(amount) : amount;
  const isLeave = isLeaveType(type);
  const formattedAmount = isLeave
    ? `${Math.abs(numAmount)} ${t('staff:leave.days')}`
    : formatCurrency(Math.abs(numAmount), currency);

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={handlePress}
      onLongPress={handleLongPress}
      activeOpacity={0.7}
      delayLongPress={400}
    >
      {/* Transaction Icon Circle */}
      <TransactionIcon type={type} size={40} />

      {/* Content */}
      <View style={styles.content}>
        {/* Line 1: Entity name (most prominent) */}
        {entityText ? (
          <Text style={styles.entityText} numberOfLines={1}>
            {entityText}
          </Text>
        ) : (
          <Text style={[styles.typeTextPrimary, { color: txColor }]} numberOfLines={1}>
            {typeLabel}
          </Text>
        )}

        {/* Line 2: Type label + date */}
        <View style={styles.line2}>
          {entityText ? (
            <Text style={[styles.typeTextSmall, { color: txColor }]} numberOfLines={1}>
              {typeLabel}
            </Text>
          ) : null}
          {entityText && <Text style={styles.dot}> · </Text>}
          <Text style={styles.dateText}>{date}</Text>
        </View>

        {/* Line 3: Secondary + Tertiary info */}
        {(secondaryText || tertiaryText) && (
          <View style={styles.line3}>
            {secondaryText ? (
              <Text style={styles.secondaryText} numberOfLines={1}>
                {secondaryText}
              </Text>
            ) : null}
            {tertiaryText && (
              <Text style={styles.tertiaryText} numberOfLines={1}>
                {secondaryText ? ` · ${tertiaryText}` : tertiaryText}
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
            {prefix}{formattedAmount}
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
// DATE SECTION HEADER — Pill style (WhatsApp inspired)
// ============================================================================

export interface DateSectionHeaderProps {
  title: string;
}

export function DateSectionHeader({ title }: DateSectionHeaderProps) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.pill}>
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
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
    borderBottomColor: colors.borderLight,
    gap: spacing.md,
  },
  content: {
    flex: 1,
    gap: 2,
  },
  entityText: {
    fontSize: 15,
    fontWeight: fontWeight.semibold,
    color: colors.text,
  },
  typeTextPrimary: {
    fontSize: 15,
    fontWeight: fontWeight.semibold,
  },
  line2: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  typeTextSmall: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.3,
  },
  dot: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  dateText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.normal,
    color: colors.textMuted,
  },
  line3: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  secondaryText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.normal,
    color: colors.textMuted,
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
    fontSize: 18,
    fontWeight: fontWeight.bold,
  },
  subAmountText: {
    fontSize: 11,
    fontWeight: fontWeight.normal,
    color: colors.textMuted,
    marginTop: 1,
  },
  // Pill-style section header (WhatsApp inspired)
  sectionHeader: {
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  pill: {
    backgroundColor: colors.surfaceLighter,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: fontWeight.semibold,
    color: colors.textMuted,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
});
