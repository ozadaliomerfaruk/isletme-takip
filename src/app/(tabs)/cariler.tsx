import { useState } from 'react';
import { View, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  Users,
  Plus,
  History,
  Zap,
  EyeOff,
} from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Text, TabFilter, SearchInput, ExpandableCard, Button, EmptyState, Card } from '@/components/ui';
import { QuickTransactionBar } from '@/components/transaction/QuickTransactionBar';
import { colors } from '@/constants/colors';
import { spacing } from '@/constants/spacing';
import { formatCurrency, toNumber } from '@/lib/currency';
import { getCariIcon } from '@/lib/icons';
import { useCariler } from '@/hooks/useCariler';
import { useFinancialSummary } from '@/hooks/useFinancialSummary';
import { Cari, CariType } from '@/types/database';

export default function CarilerPage() {
  const router = useRouter();
  const { t } = useTranslation(['clients', 'common', 'navigation']);
  const [filter, setFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedCariId, setExpandedCariId] = useState<string | null>(null);

  const filterOptions = [
    { label: t('clients:filters.all'), value: 'all' },
    { label: t('clients:titles.suppliers'), value: 'tedarikci' },
    { label: t('clients:titles.customers'), value: 'musteri' },
  ];

  // QuickTransactionBar için state
  const [quickBarVisible, setQuickBarVisible] = useState(false);
  const [selectedCari, setSelectedCari] = useState<Cari | null>(null);

  // Gerçek veriler - pasif carileri de dahil et
  const { data: cariler, isLoading } = useCariler(
    filter === 'all' ? undefined : (filter as CariType),
    true // includePassive
  );
  const { payables, receivables } = useFinancialSummary();

  // Arama filtresi ve sıralama (aktif önce)
  const filteredCariler = cariler
    ?.filter((cari) => cari.name.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => {
      // Aktif olanlar önce
      if (a.is_active !== b.is_active) {
        return a.is_active ? -1 : 1;
      }
      // Aynı durumda olanları alfabetik sırala
      return a.name.localeCompare(b.name, 'tr');
    });


  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <Text variant="h2">{t('clients:titles.clients')}</Text>
          <Button
            variant="primary"
            size="sm"
            icon={<Plus size={18} color={colors.white} />}
            onPress={() => router.push('/cariler/ekle')}
          >
            {t('common:buttons.add')}
          </Button>
        </View>

        {/* Özet Kartları */}
        <View style={styles.summaryContainer}>
          <Card style={styles.summaryCard}>
            <Text variant="caption" color="secondary">{t('clients:balance.weOwe')}</Text>
            <Text variant="h3" color="error">{formatCurrency(payables.cari)}</Text>
          </Card>
          <Card style={styles.summaryCard}>
            <Text variant="caption" color="secondary">{t('clients:balance.theyOwe')}</Text>
            <Text variant="h3" color="success">{formatCurrency(receivables.cari)}</Text>
          </Card>
        </View>

        {/* Arama */}
        <View style={styles.searchContainer}>
          <SearchInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder={t('clients:search.searchClients')}
          />
        </View>

        {/* Filtre */}
        <View style={styles.filterContainer}>
          <TabFilter options={filterOptions} value={filter} onChange={setFilter} />
        </View>

        {/* Cari Listesi */}
        <View style={styles.listContainer}>
          {isLoading ? (
            <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: spacing.xl }} />
          ) : !filteredCariler || filteredCariler.length === 0 ? (
            <EmptyState
              icon={<Users size={48} color={colors.textMuted} />}
              title={searchQuery ? t('clients:search.noResults') : t('clients:messages.noClients')}
              description={
                searchQuery
                  ? t('common:search.tryDifferent')
                  : t('clients:messages.addFirstClient')
              }
              actionLabel={searchQuery ? undefined : t('clients:titles.addClient')}
              onAction={searchQuery ? undefined : () => router.push('/cariler/ekle')}
            />
          ) : (
            filteredCariler.map((cari) => (
              <View key={cari.id} style={!cari.is_active && styles.passiveItem}>
                <ExpandableCard
                  expanded={expandedCariId === cari.id}
                  onToggle={() => setExpandedCariId(expandedCariId === cari.id ? null : cari.id)}
                  header={
                    <View style={styles.cariHeader}>
                      {getCariIcon(cari.type, 24)}
                      <View style={styles.cariInfo}>
                        <View style={styles.cariNameRow}>
                          <Text variant="body">{cari.name}</Text>
                          {!cari.is_active && (
                            <EyeOff size={14} color={colors.textMuted} />
                          )}
                        </View>
                        <Text variant="caption" color="secondary">
                          {cari.type === 'tedarikci' ? t('clients:types.tedarikci') : t('clients:types.musteri')}
                          {cari.phone ? ` • ${cari.phone}` : ''}
                        </Text>
                      </View>
                    <View style={styles.cariBalance}>
                      <Text variant="caption" color="secondary">
                        {toNumber(cari.balance) === 0
                          ? t('clients:balance.noBalance')
                          : cari.type === 'tedarikci'
                          ? toNumber(cari.balance) < 0
                            ? t('clients:balance.weOwe')
                            : t('clients:balance.theyOwe')
                          : toNumber(cari.balance) > 0
                          ? t('clients:balance.theyOwe')
                          : t('clients:balance.weOwe')}
                      </Text>
                      <Text
                        variant="h3"
                        color={
                          toNumber(cari.balance) === 0
                            ? 'secondary'
                            : toNumber(cari.balance) > 0
                            ? 'success'
                            : 'error'
                        }
                      >
                        {formatCurrency(Math.abs(toNumber(cari.balance)))}
                      </Text>
                    </View>
                  </View>
                }
              >
                <View style={styles.cariActions}>
                  <Button
                    variant="primary"
                    size="sm"
                    icon={<Zap size={16} color={colors.white} />}
                    onPress={() => {
                      setSelectedCari(cari);
                      setQuickBarVisible(true);
                    }}
                    style={styles.actionButton}
                  >
                    {t('clients:details.newTransaction')}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    icon={<History size={16} color={colors.text} />}
                    onPress={() => router.push(`/cariler/${cari.id}`)}
                    style={styles.actionButton}
                  >
                    {t('clients:details.transactions')}
                  </Button>
                </View>
                </ExpandableCard>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      {/* Quick Transaction Bar */}
      <QuickTransactionBar
        visible={quickBarVisible}
        onDismiss={() => {
          setQuickBarVisible(false);
          setSelectedCari(null);
        }}
        defaultCariId={selectedCari?.id}
        defaultCariType={selectedCari?.type}
        onSuccess={() => {
          setQuickBarVisible(false);
          setSelectedCari(null);
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
    marginBottom: spacing.md,
  },
  filterContainer: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  listContainer: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing['3xl'],
  },
  cariHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  cariInfo: {
    flex: 1,
  },
  cariNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  passiveItem: {
    opacity: 0.5,
  },
  cariBalance: {
    alignItems: 'flex-end',
  },
  cariActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionButton: {
    flex: 1,
  },
});
