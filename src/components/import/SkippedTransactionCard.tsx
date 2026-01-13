/**
 * SkippedTransactionCard
 *
 * Card component for displaying skipped transactions from import.
 * Shows transaction details with Fix/Skip action buttons.
 */

import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { AlertTriangle } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { Text, Card } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import type { PendingIslem } from '@/types/database';
import i18n from '@/i18n';

export interface SkippedTransactionCardProps {
  item: PendingIslem;
  onFix: () => void;
  onSkip: () => void;
  formatDateMedium: (date: Date) => string;
}

export function SkippedTransactionCard({
  item,
  onFix,
  onSkip,
  formatDateMedium,
}: SkippedTransactionCardProps) {
  const { t } = useTranslation(['settings', 'common']);
  const raw = item.raw_data;

  // Format date
  const dateStr = raw.date;
  const formattedDate = dateStr ? formatDateMedium(new Date(dateStr)) : '-';

  return (
    <Card style={styles.card}>
      {/* Header row */}
      <View style={styles.cardHeader}>
        <View style={styles.rowBadge}>
          <Text variant="caption" style={styles.rowBadgeText}>
            {t('settings:dataImport.labels.row')} {item.row_number}
          </Text>
        </View>
        <Text variant="caption" color="muted">
          {formattedDate}
        </Text>
      </View>

      {/* Description */}
      <Text variant="body" numberOfLines={2} style={styles.description}>
        {raw.description || '-'}
      </Text>

      {/* Transaction info */}
      <Text variant="caption" color="secondary" style={styles.info}>
        {raw.type}
        {raw.account ? ` • ${raw.account}` : ''}
        {raw.personel ? ` • ${raw.personel}` : ''}
        {raw.tedarikci ? ` • ${raw.tedarikci}` : ''}
        {raw.musteri ? ` • ${raw.musteri}` : ''}
      </Text>

      {/* Amount */}
      <Text
        variant="body"
        style={[
          styles.amount,
          { color: raw.isExpense ? colors.expense : colors.income },
        ]}
      >
        {raw.isExpense ? '-' : '+'}
        {raw.amount.toLocaleString(i18n.language === 'tr' ? 'tr-TR' : 'en-US')}
      </Text>

      {/* Skip reason */}
      <View style={styles.skipReason}>
        <AlertTriangle size={14} color={colors.warning} />
        <Text variant="caption" style={styles.skipReasonText}>
          {item.skip_reason}
        </Text>
      </View>

      {/* Actions */}
      <View style={styles.actions}>
        <TouchableOpacity style={styles.skipButton} onPress={onSkip}>
          <Text variant="caption" color="secondary">
            {t('settings:dataImport.pendingForm.skipButton')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.fixButton} onPress={onFix}>
          <Text variant="caption" style={styles.fixButtonText}>
            {t('settings:dataImport.pendingForm.fixButton')}
          </Text>
        </TouchableOpacity>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: spacing.md,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  rowBadge: {
    backgroundColor: colors.warningLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  rowBadgeText: {
    color: colors.warning,
    fontWeight: '600',
  },
  description: {
    marginBottom: spacing.xs,
  },
  info: {
    marginBottom: spacing.xs,
  },
  amount: {
    fontWeight: '600',
    marginBottom: spacing.sm,
  },
  skipReason: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.warningLight + '30',
    padding: spacing.sm,
    borderRadius: borderRadius.md,
    gap: spacing.xs,
  },
  skipReasonText: {
    flex: 1,
    color: colors.warning,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.md,
  },
  skipButton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  fixButton: {
    backgroundColor: colors.primaryLight,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
  },
  fixButtonText: {
    color: colors.primary,
    fontWeight: '600',
  },
});
