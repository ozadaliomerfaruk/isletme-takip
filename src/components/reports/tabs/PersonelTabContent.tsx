import { useMemo, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Users } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { Text, Card } from '@/components/ui';
import {
  EntityPicker,
  EntitySummaryCard,
  EntityTransactionList,
} from '@/components/reports';
import { SkeletonAccountList } from '@/components/ui/Skeleton';
import { colors } from '@/constants/colors';
import { spacing } from '@/constants/spacing';
import { usePersonelList } from '@/hooks/usePersonel';
import { useIslemlerByPersonel } from '@/hooks/useIslemler';
import type { TabContentProps } from './types';

export function PersonelTabContent({ dateRange, periodLabel }: TabContentProps) {
  const { t } = useTranslation(['reports']);
  const { data: personelList } = usePersonelList();
  const [selectedPersonelId, setSelectedPersonelId] = useState<string | null>(null);

  const { data: personelIslemler = [], isLoading: personelIslemlerLoading } = useIslemlerByPersonel(selectedPersonelId || '');

  const selectedPersonel = personelList?.find((p) => p.id === selectedPersonelId) || null;

  const filteredPersonelIslemler = useMemo(() => {
    if (!personelIslemler) return [];
    return personelIslemler.filter((islem) => {
      const islemDate = islem.date;
      return islemDate >= dateRange.startDate && islemDate <= dateRange.endDate;
    });
  }, [personelIslemler, dateRange.startDate, dateRange.endDate]);

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
                maxItems={20}
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
