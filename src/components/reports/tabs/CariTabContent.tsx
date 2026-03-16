import { useMemo, useState, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { Building2 } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { Text, Card } from '@/components/ui';
import {
  EntityPicker,
  EntitySummaryCard,
  EntityTransactionList,
} from '@/components/reports';
import { QuickTransactionBar } from '@/components/transaction/QuickTransactionBar';
import { SkeletonAccountList } from '@/components/ui/Skeleton';
import { colors } from '@/constants/colors';
import { spacing } from '@/constants/spacing';
import { useCariler } from '@/hooks/useCariler';
import { useAllIslemlerByCari } from '@/hooks/useIslemler';
import type { IslemWithRelations } from '@/types/database';
import type { TabContentProps } from './types';

interface CariTabContentProps extends TabContentProps {
  initialCariId?: string;
}

export function CariTabContent({ dateRange, periodLabel, initialCariId }: CariTabContentProps) {
  const { t } = useTranslation(['reports']);
  const { data: cariler } = useCariler();
  const [selectedCariId, setSelectedCariId] = useState<string | null>(initialCariId ?? null);
  const [editTransactionId, setEditTransactionId] = useState<string | null>(null);
  const [showEditBar, setShowEditBar] = useState(false);

  const { data: cariIslemler = [], isLoading: cariIslemlerLoading } = useAllIslemlerByCari(selectedCariId || '');

  const selectedCari = cariler?.find((c) => c.id === selectedCariId) || null;

  const handleTransactionPress = useCallback((transaction: IslemWithRelations) => {
    setEditTransactionId(transaction.id);
    setShowEditBar(true);
  }, []);

  const filteredCariIslemler = useMemo(() => {
    if (!cariIslemler) return [];
    return cariIslemler.filter((islem) => {
      const islemDate = islem.date.substring(0, 10);
      return islemDate >= dateRange.startDate && islemDate <= dateRange.endDate;
    });
  }, [cariIslemler, dateRange.startDate, dateRange.endDate]);

  return (
    <>
      <View style={styles.section}>
        <EntityPicker
          type="cari"
          entities={cariler || []}
          selectedId={selectedCariId}
          onSelect={setSelectedCariId}
        />
      </View>

      {selectedCariId && selectedCari ? (
        <>
          <View style={styles.section}>
            <EntitySummaryCard
              type="cari"
              entity={selectedCari}
              transactions={filteredCariIslemler}
              periodLabel={periodLabel}
            />
          </View>

          <View style={styles.section}>
            <Text variant="label" color="secondary" style={styles.sectionTitle}>
              {t('reports:sections.transactions')}
            </Text>
            {cariIslemlerLoading ? (
              <View style={styles.loadingContainer}>
                <SkeletonAccountList count={3} />
              </View>
            ) : (
              <EntityTransactionList
                transactions={filteredCariIslemler}
                maxItems={20}
                onTransactionPress={handleTransactionPress}
              />
            )}
          </View>
        </>
      ) : (
        <View style={styles.section}>
          <Card style={styles.emptyCard}>
            <Building2 size={48} color={colors.textMuted} style={{ alignSelf: 'center', marginBottom: spacing.md }} />
            <Text variant="body" color="secondary" style={{ textAlign: 'center' }}>
              {t('reports:entityPicker.selectClientPrompt')}
            </Text>
          </Card>
        </View>
      )}

      <QuickTransactionBar
        visible={showEditBar}
        onDismiss={() => {
          setShowEditBar(false);
          setEditTransactionId(null);
        }}
        mode="edit"
        transactionId={editTransactionId ?? undefined}
        isScheduledTransaction={false}
        defaultCariId={selectedCariId ?? undefined}
        defaultCariType={selectedCari?.type}
        onSuccess={() => {
          setShowEditBar(false);
          setEditTransactionId(null);
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  section: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  sectionTitle: {
    marginBottom: spacing.xs,
    marginLeft: spacing.xs,
  },
  loadingContainer: {
    padding: spacing['2xl'],
    alignItems: 'center',
  },
  emptyCard: {
    padding: spacing.xl,
  },
});
