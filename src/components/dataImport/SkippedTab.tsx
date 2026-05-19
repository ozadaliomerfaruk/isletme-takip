import { View, ScrollView, RefreshControl, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Trash2, FileCheck } from 'lucide-react-native';
import { Text, EmptyState } from '@/components/ui';
import { colors } from '@/constants/colors';
import { SkippedTransactionCard } from '@/components/import/SkippedTransactionCard';
import type { PendingIslem } from '@/types/database';
import { styles } from './styles';

interface SkippedTabProps {
  refreshing: boolean;
  onRefresh: () => void;
  pendingIslemler: PendingIslem[] | undefined;
  loadingPending: boolean;
  pendingCount: number;
  onFixItem: (item: PendingIslem) => void;
  onSkipItem: (item: PendingIslem) => void;
  onDeleteAll: () => void;
  formatDateMedium: (date: string | Date) => string;
  t: (key: string) => string;
}

export function SkippedTab({
  refreshing,
  onRefresh,
  pendingIslemler,
  loadingPending,
  onFixItem,
  onSkipItem,
  onDeleteAll,
  formatDateMedium,
  t,
}: SkippedTabProps) {
  return (
    <ScrollView
      style={styles.scrollView}
      contentContainerStyle={styles.skippedContent}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          colors={[colors.primary]}
          tintColor={colors.primary}
        />
      }
    >
      <View style={styles.descriptionContainer}>
        <Text variant="body" color="secondary">
          {t('dataImport.skippedTransactions.description')}
        </Text>
      </View>

      {pendingIslemler && pendingIslemler.length > 0 && (
        <TouchableOpacity
          style={styles.deleteAllRow}
          onPress={onDeleteAll}
        >
          <Trash2 size={18} color={colors.error} />
          <Text variant="body" style={{ color: colors.error }}>
            {t('dataImport.skippedTransactions.deleteAllButton')}
          </Text>
        </TouchableOpacity>
      )}

      {loadingPending ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : pendingIslemler && pendingIslemler.length > 0 ? (
        pendingIslemler.map((item) => (
          <SkippedTransactionCard
            key={item.id}
            item={item}
            onFix={() => onFixItem(item)}
            onSkip={() => onSkipItem(item)}
            formatDateMedium={formatDateMedium}
          />
        ))
      ) : (
        <EmptyState
          icon={<FileCheck size={64} color={colors.textMuted} />}
          title={t('dataImport.skippedTransactions.empty')}
          description={t('dataImport.skippedTransactions.emptyDescription')}
        />
      )}
    </ScrollView>
  );
}
