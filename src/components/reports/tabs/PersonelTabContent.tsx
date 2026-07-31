import { useMemo, useState, useCallback } from 'react';
import { Alert, View, StyleSheet } from 'react-native';
import { Users } from 'lucide-react-native';
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
import { useReportPersonelList } from '@/hooks/usePersonel';
import {
  useAllIslemlerByPersonel,
  type PersonelTransactionRow,
} from '@/hooks/useIslemler';
import type { TabContentProps } from './types';
import { usePermissions } from '@/hooks/usePermissions';
import { useAuthContext } from '@/contexts/AuthContext';
import { getTransactionActionDeniedMessageKey } from '@/lib/errors';
import { canAccessTransactionSources } from '@/lib/transactionSourceModules';

interface PersonelTabContentProps extends TabContentProps {
  initialPersonelId?: string;
}

export function PersonelTabContent({ dateRange, periodLabel, initialPersonelId }: PersonelTabContentProps) {
  const { t } = useTranslation(['reports']);
  const { user, isletme } = useAuthContext();
  const { canUpdate, canAccessModule } = usePermissions();
  const { data: personelList } = useReportPersonelList();
  const [selectedPersonelId, setSelectedPersonelId] = useState<string | null>(initialPersonelId ?? null);
  const [editTransactionId, setEditTransactionId] = useState<string | null>(null);
  const [showEditBar, setShowEditBar] = useState(false);

  const {
    data: personelIslemler = [],
    isLoading: personelIslemlerLoading,
  } = useAllIslemlerByPersonel(selectedPersonelId || '', true);

  const selectedPersonel = personelList?.find((p) => p.id === selectedPersonelId) || null;

  const canOpenTransactionEditor = useCallback(
    (transaction: PersonelTransactionRow) => {
      // Shared personel projection rows intentionally omit tenant ids. Those
      // rows are already scoped by the active-tenant RPC/query key; owner rows
      // still carry an id that must match the current tenant.
      const belongsToActiveTenant =
        'isletme_id' in transaction
          ? transaction.isletme_id === isletme?.id
          : !!isletme?.id;

      return belongsToActiveTenant
        && canUpdate('islemler', transaction.created_by ?? null)
        && canAccessTransactionSources(
          [transaction.type],
          canAccessModule,
        );
    },
    [canAccessModule, canUpdate, isletme?.id],
  );

  const handleTransactionPress = useCallback((transaction: PersonelTransactionRow) => {
    const createdBy = transaction.created_by ?? null;
    const canUpdateRecord = canUpdate('islemler', createdBy);
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

  const filteredPersonelIslemler = useMemo(() => {
    if (!personelIslemler) return [];
    return personelIslemler.filter((islem) => {
      const islemDate = islem.date.substring(0, 10);
      return islemDate >= dateRange.startDate && islemDate <= dateRange.endDate;
    });
  }, [personelIslemler, dateRange.startDate, dateRange.endDate]);

  // Dönem öncesi izin devri hesapla
  const leaveCarryOver = useMemo(() => {
    if (!personelIslemler) return 0;
    return personelIslemler
      .filter((islem) => islem.date.substring(0, 10) < dateRange.startDate)
      .reduce((acc, islem) => {
        if (islem.type === 'personel_izin_hakki') return acc + Number(islem.amount);
        if (islem.type === 'personel_izin_kullanimi') return acc - Number(islem.amount);
        return acc;
      }, 0);
  }, [personelIslemler, dateRange.startDate]);

  return (
    <>
      <View style={styles.section}>
        <EntityPicker
          type="personel"
          entities={personelList || []}
          selectedId={selectedPersonelId}
          onSelect={setSelectedPersonelId}
        />
      </View>

      {selectedPersonelId && selectedPersonel ? (
        <>
          <View style={styles.section}>
            <EntitySummaryCard
              type="personel"
              entity={selectedPersonel}
              transactions={filteredPersonelIslemler}
              periodLabel={periodLabel}
              leaveCarryOver={leaveCarryOver}
            />
          </View>

          <View style={styles.section}>
            <Text variant="label" color="secondary" style={styles.sectionTitle}>
              {t('reports:sections.transactions')}
            </Text>
            {personelIslemlerLoading ? (
              <View style={styles.loadingContainer}>
                <SkeletonAccountList count={3} />
              </View>
            ) : (
              <EntityTransactionList
                transactions={filteredPersonelIslemler}
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
            <Users size={48} color={colors.textMuted} style={{ alignSelf: 'center', marginBottom: spacing.md }} />
            <Text variant="body" color="secondary" style={{ textAlign: 'center' }}>
              {t('reports:entityPicker.selectStaffPrompt')}
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
          defaultPersonelId={selectedPersonelId ?? undefined}
          createScope="personel"
          minimalAccountReferenceMode={
            !canAccessModule('hesaplar') ? 'personel' : undefined
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
