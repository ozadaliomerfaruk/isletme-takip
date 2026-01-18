import { useState } from 'react';
import { View, StyleSheet, ScrollView, ActivityIndicator, Alert, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  Users,
  Plus,
  History,
  Zap,
  EyeOff,
  Archive,
  Edit3,
  MoreVertical,
  Trash2,
} from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Text, TabFilter, SearchInput, ExpandableCard, Button, EmptyState, Card, ActionSheet, type ActionSheetOption, SkeletonAccountList, SkeletonSummaryPair } from '@/components/ui';
import { useToast } from '@/contexts/ToastContext';
import { useHaptics } from '@/hooks/useHaptics';
import { QuickTransactionBar } from '@/components/transaction/QuickTransactionBar';
import { colors } from '@/constants/colors';
import { spacing } from '@/constants/spacing';
import { formatCurrency, toNumber } from '@/lib/currency';
import { useSettings } from '@/hooks/useSettings';
import { useExchangeRates, convertCurrency } from '@/hooks/useExchangeRates';
import { getCariIcon } from '@/lib/icons';
import { useCariler, useDeleteCari } from '@/hooks/useCariler';
import { useArchiveCari } from '@/hooks/useArchive';
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

  // ActionSheet için state
  const [actionSheetVisible, setActionSheetVisible] = useState(false);
  const [actionSheetCari, setActionSheetCari] = useState<Cari | null>(null);

  // Mutations
  const archiveCari = useArchiveCari();
  const deleteCari = useDeleteCari();

  // Toast ve Haptics
  const { showToast } = useToast();
  const haptics = useHaptics();

  // Settings ve döviz kurları
  const { currency: baseCurrency } = useSettings();
  const { data: exchangeRatesData } = useExchangeRates();
  const exchangeRates = exchangeRatesData?.rates;

  // Gerçek veriler - pasif carileri de dahil et
  const { data: cariler, isLoading } = useCariler(
    filter === 'all' ? undefined : (filter as CariType),
    true // includePassive
  );
  const { payables, receivables } = useFinancialSummary();

  // Action sheet handlers
  const handleOpenActionSheet = (cari: Cari) => {
    setActionSheetCari(cari);
    setActionSheetVisible(true);
  };

  const handleArchive = async () => {
    if (!actionSheetCari) return;
    try {
      await archiveCari.mutateAsync(actionSheetCari.id);
      haptics.success();
      showToast(t('common:archive.messages.archiveSuccess'), 'success');
    } catch (error) {
      haptics.error();
      showToast(t('common:messages.operationFailed'), 'error');
    }
  };

  const handleDelete = () => {
    if (!actionSheetCari) return;
    Alert.alert(
      t('common:confirm.deleteTitle'),
      t('common:confirm.deleteMessage', { item: actionSheetCari.name }),
      [
        { text: t('common:buttons.cancel'), style: 'cancel' },
        {
          text: t('common:buttons.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteCari.mutateAsync(actionSheetCari.id);
              haptics.success();
              showToast(t('common:messages.deletedSuccessfully'), 'success');
            } catch (error) {
              haptics.error();
              showToast(t('common:messages.operationFailed'), 'error');
            }
          },
        },
      ]
    );
  };

  const actionSheetOptions: ActionSheetOption[] = [
    {
      label: t('common:buttons.edit'),
      icon: <Edit3 size={20} color={colors.primary} />,
      onPress: () => {
        if (actionSheetCari) {
          router.push(`/cariler/duzenle/${actionSheetCari.id}`);
        }
      },
    },
    {
      label: t('common:archive.actions.archive'),
      icon: <Archive size={20} color={colors.warning} />,
      onPress: handleArchive,
    },
    {
      label: t('common:buttons.delete'),
      icon: <Trash2 size={20} color={colors.error} />,
      onPress: handleDelete,
      destructive: true,
    },
  ];

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
            <SkeletonAccountList count={5} />
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
                  onToggle={() => {
                    haptics.selection();
                    setExpandedCariId(expandedCariId === cari.id ? null : cari.id);
                  }}
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
                        {formatCurrency(Math.abs(toNumber(cari.balance)), cari.currency)}
                      </Text>
                      {cari.currency !== baseCurrency && exchangeRates && toNumber(cari.balance) !== 0 && (
                        <Text variant="caption" color="secondary">
                          ~{formatCurrency(convertCurrency(Math.abs(toNumber(cari.balance)), cari.currency, baseCurrency, exchangeRates) ?? 0, baseCurrency)}
                        </Text>
                      )}
                    </View>
                    <TouchableOpacity
                      style={styles.moreButton}
                      onPress={(e) => {
                        e.stopPropagation();
                        handleOpenActionSheet(cari);
                      }}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <MoreVertical size={20} color={colors.textMuted} />
                    </TouchableOpacity>
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

      {/* Action Sheet */}
      <ActionSheet
        visible={actionSheetVisible}
        onClose={() => {
          setActionSheetVisible(false);
          setActionSheetCari(null);
        }}
        title={actionSheetCari?.name}
        options={actionSheetOptions}
        cancelLabel={t('common:buttons.cancel')}
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
    paddingVertical: spacing.md,
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
  moreButton: {
    padding: spacing.xs,
    marginLeft: spacing.sm,
  },
});
