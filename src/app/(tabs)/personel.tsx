import { useState } from 'react';
import { View, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  UserCircle,
  Plus,
  Zap,
  History,
  Phone,
  Briefcase,
} from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Text, SearchInput, ExpandableCard, Button, EmptyState, Card } from '@/components/ui';
import { QuickTransactionBar } from '@/components/transaction/QuickTransactionBar';
import { colors } from '@/constants/colors';
import { spacing } from '@/constants/spacing';
import { formatCurrency, toNumber } from '@/lib/currency';
import { getInitials } from '@/lib/utils';
import { usePersonelList } from '@/hooks/usePersonel';
import { useFinancialSummary } from '@/hooks/useFinancialSummary';

export default function PersonelPage() {
  const router = useRouter();
  const { t } = useTranslation(['staff', 'common', 'navigation']);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedPersonelId, setExpandedPersonelId] = useState<string | null>(null);
  const [quickBarVisible, setQuickBarVisible] = useState(false);
  const [selectedPersonelId, setSelectedPersonelId] = useState<string | null>(null);

  // Gerçek veriler
  const { data: personelList, isLoading } = usePersonelList();
  const { payables, receivables } = useFinancialSummary();

  // Arama ve sıralama
  const filteredPersonel = personelList
    ?.filter((p) =>
      `${p.first_name} ${p.last_name}`.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .sort((a, b) => a.first_name.localeCompare(b.first_name, 'tr'));


  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <Text variant="h2">{t('staff:titles.personnel')}</Text>
          <Button
            variant="primary"
            size="sm"
            icon={<Plus size={18} color={colors.white} />}
            onPress={() => router.push('/personel/ekle')}
          >
            {t('common:buttons.add')}
          </Button>
        </View>

        {/* Özet Kartları */}
        <View style={styles.summaryContainer}>
          <Card style={styles.summaryCard}>
            <Text variant="caption" color="secondary">{t('staff:balance.weOwe')}</Text>
            <Text variant="h3" color="error">{formatCurrency(payables.personel)}</Text>
          </Card>
          <Card style={styles.summaryCard}>
            <Text variant="caption" color="secondary">{t('staff:balance.theyOwe')}</Text>
            <Text variant="h3" color="success">{formatCurrency(receivables.personel)}</Text>
          </Card>
        </View>

        {/* Arama */}
        <View style={styles.searchContainer}>
          <SearchInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder={t('staff:search.searchPersonnel')}
          />
        </View>

        {/* Personel Listesi */}
        <View style={styles.listContainer}>
          {isLoading ? (
            <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: spacing.xl }} />
          ) : !filteredPersonel || filteredPersonel.length === 0 ? (
            <EmptyState
              icon={<UserCircle size={48} color={colors.textMuted} />}
              title={searchQuery ? t('staff:search.noResults') : t('staff:messages.noPersonnel')}
              description={
                searchQuery
                  ? t('common:search.tryDifferent')
                  : t('staff:messages.addFirstPersonnel')
              }
              actionLabel={searchQuery ? undefined : t('staff:titles.addPersonnel')}
              onAction={searchQuery ? undefined : () => router.push('/personel/ekle')}
            />
          ) : (
            filteredPersonel.map((personel) => (
              <ExpandableCard
                key={personel.id}
                expanded={expandedPersonelId === personel.id}
                onToggle={() => setExpandedPersonelId(expandedPersonelId === personel.id ? null : personel.id)}
                header={
                  <View style={styles.personelHeader}>
                    <View style={styles.avatar}>
                      <Text variant="body" bold style={{ color: colors.primary }}>
                        {getInitials(`${personel.first_name} ${personel.last_name}`)}
                      </Text>
                    </View>
                    <View style={styles.personelInfo}>
                      <Text variant="body">
                        {personel.first_name} {personel.last_name}
                      </Text>
                      <View style={styles.personelMeta}>
                        {personel.position && (
                          <>
                            <Briefcase size={12} color={colors.textMuted} />
                            <Text variant="caption" color="secondary">
                              {personel.position}
                            </Text>
                          </>
                        )}
                        {personel.phone && (
                          <>
                            <Phone size={12} color={colors.textMuted} style={{ marginLeft: spacing.sm }} />
                            <Text variant="caption" color="secondary">
                              {personel.phone}
                            </Text>
                          </>
                        )}
                      </View>
                    </View>
                    <View style={styles.personelBalance}>
                      <Text variant="caption" color="secondary">
                        {toNumber(personel.balance) === 0
                          ? t('staff:balance.noBalance')
                          : toNumber(personel.balance) < 0
                          ? t('staff:balance.weOwe')
                          : t('staff:balance.theyOwe')}
                      </Text>
                      <Text
                        variant="h3"
                        color={
                          toNumber(personel.balance) === 0
                            ? 'secondary'
                            : toNumber(personel.balance) < 0
                            ? 'error'
                            : 'success'
                        }
                      >
                        {formatCurrency(Math.abs(toNumber(personel.balance)))}
                      </Text>
                    </View>
                  </View>
                }
              >
                <View style={styles.personelActions}>
                  <Button
                    variant="primary"
                    size="sm"
                    icon={<Zap size={16} color={colors.surface} />}
                    onPress={() => {
                      setSelectedPersonelId(personel.id);
                      setQuickBarVisible(true);
                    }}
                    style={styles.actionButton}
                  >
                    {t('staff:details.newTransaction')}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    icon={<History size={16} color={colors.text} />}
                    onPress={() => router.push(`/personel/${personel.id}`)}
                    style={styles.actionButton}
                  >
                    {t('staff:details.transactions')}
                  </Button>
                </View>
              </ExpandableCard>
            ))
          )}
        </View>
      </ScrollView>

      {/* Quick Transaction Bar */}
      <QuickTransactionBar
        visible={quickBarVisible}
        onDismiss={() => {
          setQuickBarVisible(false);
          setSelectedPersonelId(null);
        }}
        defaultPersonelId={selectedPersonelId || undefined}
        onSuccess={() => {
          setQuickBarVisible(false);
          setSelectedPersonelId(null);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollView: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  summaryContainer: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  summaryCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  searchContainer: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  listContainer: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing['3xl'],
  },
  personelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  personelInfo: {
    flex: 1,
  },
  personelMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  personelBalance: {
    alignItems: 'flex-end',
  },
  personelActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionButton: {
    flex: 1,
  },
});
