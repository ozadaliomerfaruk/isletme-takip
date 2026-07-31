import { useMemo, useState, useCallback } from 'react';
import { Alert, View, StyleSheet } from 'react-native';
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
import { useReportCariler } from '@/hooks/useCariler';
import { useLinkedCariler } from '@/hooks/useCariSharing';
import {
  useAllIslemlerByCari,
  type CariTransactionRow,
} from '@/hooks/useIslemler';
import { toNumber } from '@/lib/currency';
import type { Cari } from '@/types/database';
import type { TabContentProps } from './types';
import { usePermissions } from '@/hooks/usePermissions';
import { useAuthContext } from '@/contexts/AuthContext';
import { getTransactionActionDeniedMessageKey } from '@/lib/errors';
import { canAccessTransactionSources } from '@/lib/transactionSourceModules';

interface CariTabContentProps extends TabContentProps {
  initialCariId?: string;
}

export function CariTabContent({ dateRange, periodLabel, initialCariId }: CariTabContentProps) {
  const { t } = useTranslation(['reports']);
  const { user, isletme } = useAuthContext();
  const { canUpdate, canAccessModule } = usePermissions();
  const { data: cariler } = useReportCariler();
  const { data: linkedCarilerData } = useLinkedCariler();
  const [selectedCariId, setSelectedCariId] = useState<string | null>(initialCariId ?? null);
  const [editTransactionId, setEditTransactionId] = useState<string | null>(null);
  const [showEditBar, setShowEditBar] = useState(false);

  // Linked carileri Cari formatına dönüştür ve kendi carilerle birleştir
  const mergedCariler = useMemo(() => {
    const own = cariler || [];
    const linked = (linkedCarilerData || [])
      .filter(link => link.cari)
      .map(link => {
        const invertBalance = link.cari!.type !== link.viewer_type;
        return {
          ...link.cari!,
          type: link.viewer_type,
          balance: invertBalance ? -toNumber(link.cari!.balance) : toNumber(link.cari!.balance),
          isLinked: true,
          ownerIsletmeName: link.owner_isletme?.name,
        } as Cari & { isLinked: boolean; ownerIsletmeName?: string };
      });
    return [...own, ...linked];
  }, [cariler, linkedCarilerData]);

  const { data: cariIslemler = [], isLoading: cariIslemlerLoading } =
    useAllIslemlerByCari(selectedCariId || '', true, true);

  const selectedCari = mergedCariler.find((c) => c.id === selectedCariId) || null;

  const canOpenTransactionEditor = useCallback(
    (transaction: CariTransactionRow) =>
      transaction.isletme_id === isletme?.id
      && canUpdate('islemler', transaction.created_by ?? null)
      && canAccessTransactionSources(
        [transaction.type],
        canAccessModule,
      ),
    [canAccessModule, canUpdate, isletme?.id],
  );

  const handleTransactionPress = useCallback((transaction: CariTransactionRow) => {
    const createdBy = transaction.created_by ?? null;
    const canOpenEditor = canOpenTransactionEditor(transaction);
    if (!canOpenEditor) {
      const messageKey = getTransactionActionDeniedMessageKey('update', {
        createdBy,
        currentUserId: user?.id,
        canActOnOwnRecord:
          !!user?.id && canUpdate('islemler', user.id),
        canActOnRecord: canOpenEditor,
      });
      Alert.alert(t('common:status.error'), t(messageKey));
      return;
    }
    setEditTransactionId(transaction.id);
    setShowEditBar(true);
  }, [canOpenTransactionEditor, canUpdate, t, user?.id]);

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
          entities={mergedCariler}
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
                maxItems={0}
                onTransactionPress={handleTransactionPress}
                canEditTransaction={canOpenTransactionEditor}
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

      {!!editTransactionId && (
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
          createScope="cari"
          minimalAccountReferenceMode={
            !canAccessModule('hesaplar') ? 'cari' : undefined
          }
          onSuccess={() => {
            setShowEditBar(false);
            setEditTransactionId(null);
          }}
        />
      )}
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
