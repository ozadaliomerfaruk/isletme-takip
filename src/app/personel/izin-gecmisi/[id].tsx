import { useState, useMemo, useCallback } from 'react';
import { View, StyleSheet, FlatList, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, CalendarDays, Copy } from 'lucide-react-native';

import { Text, EmptyState } from '@/components/ui';
import { SwipeableRow, SwipeableProvider } from '@/components/ui/SwipeableRow';
import { UndoSnackbar } from '@/components/ui/UndoSnackbar';
import { DateSectionHeader } from '@/components/ui/TransactionRow';
import { QuickTransactionBar } from '@/components/transaction/QuickTransactionBar';
import { colors } from '@/constants/colors';
import { spacing, borderRadius, fontSize, fontWeight } from '@/constants/spacing';
import { usePersonel } from '@/hooks/usePersonel';
import { useIslemlerByPersonel, useDeleteIslem } from '@/hooks/useIslemler';
import { isLeaveType } from '@/constants/islemTypes';
import { useDateFormat } from '@/hooks/useDateFormat';
import { useUndoDelete } from '@/hooks/useUndoDelete';
import { preprocessTransactionsByDate, TransactionListItem } from '@/lib/transactionGrouping';
import { getTransactionColor, getTransactionPrefix, showAccentBar } from '@/lib/transactionColors';
import { toErrorMessage } from '@/lib/errors';
import type { IslemWithRelations } from '@/types/database';

function toNumber(val: unknown): number {
  if (typeof val === 'number') return val;
  if (typeof val === 'string') return parseFloat(val) || 0;
  return 0;
}

function getLeaveLabel(type: string): string {
  switch (type) {
    case 'personel_izin_hakki':
      return 'staff:transactionLabels.izinHakki';
    case 'personel_izin_kullanimi':
      return 'staff:transactionLabels.izinKullanimi';
    default:
      return type;
  }
}

export default function LeaveHistoryPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation(['staff', 'common', 'errors']);
  const { formatDateMedium, formatDateSmart } = useDateFormat();

  const { data: personel } = usePersonel(id);
  const { data: islemler } = useIslemlerByPersonel(id!);
  const deleteIslem = useDeleteIslem();

  // Edit & Copy state
  const [editTransactionId, setEditTransactionId] = useState<string | null>(null);
  const [showEditBar, setShowEditBar] = useState(false);
  const [copySourceId, setCopySourceId] = useState<string | null>(null);
  const [showCopyBar, setShowCopyBar] = useState(false);

  // Undo delete
  const {
    requestDelete,
    undoDelete,
    dismissDelete,
    snackbar: undoSnackbar,
  } = useUndoDelete<IslemWithRelations>({
    onCommitDelete: async (islemId: string) => {
      await deleteIslem.mutateAsync(islemId);
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? toErrorMessage(error) : t('errors:transaction.deleteFailed');
      Alert.alert(t('common:status.error'), message);
    },
  });

  // Filter to leave transactions only
  const leaveTransactions = useMemo(() => {
    if (!islemler) return [];
    return islemler.filter(i => isLeaveType(i.type));
  }, [islemler]);

  // Calculate quota
  const quota = useMemo(() => {
    return leaveTransactions.reduce(
      (acc, islem) => {
        const amount = toNumber(islem.amount);
        if (islem.type === 'personel_izin_hakki') {
          acc.hakEdilen += amount;
        } else if (islem.type === 'personel_izin_kullanimi') {
          acc.kullanilan += amount;
        }
        return acc;
      },
      { hakEdilen: 0, kullanilan: 0 }
    );
  }, [leaveTransactions]);

  const kalanGun = quota.hakEdilen - quota.kullanilan;

  // Group by date
  const groupedData = useMemo(() => {
    return preprocessTransactionsByDate(
      leaveTransactions,
      t('common:date.today'),
      t('common:date.yesterday'),
      formatDateSmart,
    );
  }, [leaveTransactions, t, formatDateSmart]);

  const handleDeleteIslem = useCallback((islemId: string) => {
    const islem = leaveTransactions.find(i => i.id === islemId);
    if (islem) {
      const desc = islem.description || t(getLeaveLabel(islem.type));
      requestDelete(islemId, islem, desc);
    }
  }, [leaveTransactions, requestDelete, t]);

  const handleEditIslem = useCallback((islemId: string) => {
    setEditTransactionId(islemId);
    setShowEditBar(true);
  }, []);

  const handleCopyIslem = useCallback((islemId: string) => {
    setCopySourceId(islemId);
    setShowCopyBar(true);
  }, []);

  const deleteLabel = t('common:buttons.delete');
  const copyLabel = t('common:buttons.copy');

  const renderItem = useCallback(
    ({ item }: { item: TransactionListItem }) => {
      if (item.type === 'header') {
        return <DateSectionHeader title={item.title} />;
      }
      if (item.type === 'milestone' || item.type === 'note') {
        return null;
      }

      const islem = item.data;
      const amount = toNumber(islem.amount);
      const typeLabel = t(getLeaveLabel(islem.type));
      const txColor = getTransactionColor(islem.type);
      const prefix = getTransactionPrefix(islem.type);
      const hasBar = showAccentBar(islem.type);

      // Build date range text for leave usage with date_end
      const dateEnd = (islem as { date_end?: string | null }).date_end;
      let dateRangeText: string | null = null;
      if (dateEnd) {
        const startDate = new Date(islem.date);
        const endDate = new Date(dateEnd);
        dateRangeText = `${formatDateMedium(startDate)} - ${formatDateMedium(endDate)}`;
      }

      return (
        <SwipeableRow
          onDelete={() => handleDeleteIslem(islem.id)}
          onCopy={() => handleCopyIslem(islem.id)}
          deleteLabel={deleteLabel}
          copyLabel={copyLabel}
        >
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => handleEditIslem(islem.id)}
          >
            <View style={styles.txContainer}>
              {/* Accent Bar */}
              {hasBar ? (
                <View style={[styles.accentBar, { backgroundColor: txColor }]} />
              ) : (
                <View style={styles.accentBarSpacer} />
              )}

              {/* Content */}
              <View style={styles.txContent}>
                {/* Line 1: Type Label + Date */}
                <View style={styles.txLine1}>
                  <Text style={[styles.txTypeText, { color: txColor }]} numberOfLines={1}>
                    {typeLabel}
                  </Text>
                  <Text style={styles.txDateText}>{formatDateSmart(islem.date)}</Text>
                </View>

                {/* Date range for leave usage */}
                {dateRangeText && (
                  <Text style={styles.txEntityText} numberOfLines={1}>
                    {dateRangeText}
                  </Text>
                )}

                {/* Description */}
                {islem.description ? (
                  <Text style={styles.txSecondaryText} numberOfLines={1}>
                    {islem.description}
                  </Text>
                ) : null}
              </View>

              {/* Amount — days instead of currency */}
              <View style={styles.txAmountContainer}>
                <Text style={[styles.txAmountText, { color: txColor }]}>
                  {prefix}{amount} {t('staff:leave.days')}
                </Text>
              </View>
            </View>
          </TouchableOpacity>
        </SwipeableRow>
      );
    },
    [t, formatDateSmart, formatDateMedium, handleDeleteIslem, handleCopyIslem, handleEditIslem, deleteLabel, copyLabel]
  );

  const keyExtractor = useCallback((item: TransactionListItem) => item.key, []);

  const ListHeader = useMemo(
    () => (
      <View style={styles.summaryCard}>
        <View style={styles.summaryRow}>
          <View style={styles.summaryStat}>
            <Text style={styles.summaryLabel}>{t('staff:leave.entitled')}</Text>
            <Text style={styles.summaryValue}>
              {quota.hakEdilen} {t('staff:leave.days')}
            </Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryStat}>
            <Text style={styles.summaryLabel}>{t('staff:leave.used')}</Text>
            <Text style={[styles.summaryValue, { color: colors.textMuted }]}>
              {quota.kullanilan} {t('staff:leave.days')}
            </Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryStat}>
            <Text style={styles.summaryLabel}>{t('staff:leave.remaining')}</Text>
            <Text
              style={[
                styles.summaryValue,
                { color: kalanGun >= 0 ? colors.success : colors.error, fontWeight: '700' },
              ]}
            >
              {kalanGun} {t('staff:leave.days')}
            </Text>
          </View>
        </View>
      </View>
    ),
    [quota, kalanGun, t]
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <ArrowLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>{t('staff:leave.leaveHistory')}</Text>
          {personel && (
            <Text style={styles.headerSubtitle}>
              {personel.first_name} {personel.last_name || ''}
            </Text>
          )}
        </View>
      </View>

      {/* Content */}
      <SwipeableProvider>
        <FlatList
          data={groupedData}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          ListHeaderComponent={leaveTransactions.length > 0 ? ListHeader : null}
          ListEmptyComponent={
            <EmptyState
              icon={<CalendarDays size={48} color={colors.textMuted} />}
              title={t('staff:leave.noLeaveHistory')}
            />
          }
          contentContainerStyle={styles.listContent}
        />
      </SwipeableProvider>

      {/* Edit QuickTransactionBar */}
      <QuickTransactionBar
        visible={showEditBar}
        onDismiss={() => {
          setShowEditBar(false);
          setEditTransactionId(null);
        }}
        mode="edit"
        transactionId={editTransactionId ?? undefined}
        isScheduledTransaction={false}
        defaultPersonelId={id!}
        onSuccess={() => {
          setShowEditBar(false);
          setEditTransactionId(null);
        }}
      />

      {/* Copy QuickTransactionBar */}
      <QuickTransactionBar
        visible={showCopyBar}
        onDismiss={() => {
          setShowCopyBar(false);
          setCopySourceId(null);
        }}
        mode="create"
        copySourceId={copySourceId ?? undefined}
        defaultPersonelId={id!}
        onSuccess={() => {
          setShowCopyBar(false);
          setCopySourceId(null);
        }}
      />

      <UndoSnackbar
        visible={undoSnackbar.visible}
        message={undoSnackbar.message}
        onUndo={undoDelete}
        onDismiss={dismissDelete}
        undoLabel={t('common:buttons.undo')}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    backgroundColor: colors.surface,
  },
  backButton: {
    padding: spacing.xs,
    marginRight: spacing.sm,
  },
  headerTitleContainer: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  headerSubtitle: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 2,
  },
  listContent: {
    flexGrow: 1,
    paddingBottom: spacing.xl,
  },
  // Summary card
  summaryCard: {
    backgroundColor: colors.surface,
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  summaryStat: {
    flex: 1,
    alignItems: 'center',
  },
  summaryDivider: {
    width: 1,
    height: 28,
    backgroundColor: colors.borderLight,
  },
  summaryLabel: {
    fontSize: 11,
    color: colors.textMuted,
    marginBottom: 2,
  },
  summaryValue: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  // Transaction row
  txContainer: {
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
  txContent: {
    flex: 1,
    gap: 3,
  },
  txLine1: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  txTypeText: {
    fontSize: 13,
    fontWeight: fontWeight.bold,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.3,
    flex: 1,
  },
  txDateText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
    color: colors.textMuted,
  },
  txEntityText: {
    fontSize: 15,
    fontWeight: fontWeight.semibold,
    color: colors.text,
  },
  txSecondaryText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.normal,
    color: colors.textMuted,
  },
  txAmountContainer: {
    alignItems: 'flex-end',
  },
  txAmountText: {
    fontSize: 20,
    fontWeight: fontWeight.bold,
  },
});
