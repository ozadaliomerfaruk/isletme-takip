import { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  ArrowDownLeft,
  ArrowUpRight,
  ArrowLeftRight,
  Receipt,
  Pencil,
  Trash2,
  Users,
  UserCheck,
  Clock,
} from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Text, TabFilter, SearchInput, ExpandableCard, Button, EmptyState } from '@/components/ui';
import { QuickTransactionBar } from '@/components/transaction/QuickTransactionBar';
import { colors } from '@/constants/colors';
import { spacing } from '@/constants/spacing';
import { formatCurrency, toNumber } from '@/lib/currency';
import { useDateFormat } from '@/hooks/useDateFormat';
import { getIslemIcon, getIslemIconBg, getIslemAmountColor, getIslemAmountPrefix } from '@/lib/icons';
import { useIslemler, useDeleteIslem } from '@/hooks/useIslemler';
import { IslemType, IslemWithRelations } from '@/types/database';

export default function IslemlerPage() {
  const router = useRouter();
  const { t } = useTranslation(['transactions', 'common', 'errors']);
  const { formatDateMedium } = useDateFormat();
  const [filter, setFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedIslemId, setExpandedIslemId] = useState<string | null>(null);
  const [showLongLoadingMessage, setShowLongLoadingMessage] = useState(false);
  // Edit mode state
  const [editTransactionId, setEditTransactionId] = useState<string | null>(null);
  const [showEditBar, setShowEditBar] = useState(false);

  const { data: islemler, isLoading, isFetching } = useIslemler();
  const deleteIslem = useDeleteIslem();

  // Uzun süren yükleme için mesaj göster
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    if (isLoading || isFetching) {
      timer = setTimeout(() => {
        setShowLongLoadingMessage(true);
      }, 3000); // 3 saniye sonra mesaj göster
    } else {
      setShowLongLoadingMessage(false);
    }
    return () => clearTimeout(timer);
  }, [isLoading, isFetching]);

  const filterOptions = [
    { label: t('transactions:filters.all'), value: 'all' },
    { label: t('transactions:filters.income'), value: 'gelir' },
    { label: t('transactions:filters.expense'), value: 'gider' },
    { label: t('transactions:filters.transfer'), value: 'transfer' },
    { label: t('transactions:filters.client'), value: 'cari' },
    { label: t('transactions:filters.personnel'), value: 'personel' },
  ];

  const filteredIslemler = (islemler || []).filter((islem) => {
    let matchesFilter = filter === 'all';
    // Gelir sekmesi: gelirimizi artıran işlemler (tahsilat hariç - o nakit akışı)
    if (filter === 'gelir') {
      matchesFilter = ['gelir', 'cari_satis'].includes(islem.type);
    }
    // Gider sekmesi: giderimizi artıran işlemler (ödeme hariç - o nakit akışı)
    if (filter === 'gider') {
      matchesFilter = ['gider', 'cari_alis', 'personel_gider'].includes(islem.type);
    }
    if (filter === 'transfer') matchesFilter = islem.type === 'transfer';
    if (filter === 'cari') matchesFilter = islem.type.startsWith('cari_');
    if (filter === 'personel') matchesFilter = islem.type.startsWith('personel_');

    const searchLower = searchQuery.toLowerCase();
    const personelName = islem.personel
      ? `${islem.personel.first_name || ''} ${islem.personel.last_name || ''}`.trim().toLowerCase()
      : '';
    const matchesSearch =
      (islem.description?.toLowerCase().includes(searchLower) || false) ||
      (islem.hesap?.name?.toLowerCase().includes(searchLower) || false) ||
      (islem.cari?.name?.toLowerCase().includes(searchLower) || false) ||
      (islem.kategori?.name?.toLowerCase().includes(searchLower) || false) ||
      (personelName.includes(searchLower));

    return matchesFilter && matchesSearch;
  });

  const handleDelete = (id: string, description: string) => {
    Alert.alert(
      t('common:confirm.deleteTitle'),
      t('common:confirm.deleteMessage', { item: description }),
      [
        { text: t('common:buttons.cancel'), style: 'cancel' },
        {
          text: t('common:buttons.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteIslem.mutateAsync(id);
              Alert.alert(t('common:status.success'), t('transactions:messages.deleteSuccess'));
            } catch (error: any) {
              Alert.alert(t('common:status.error'), error.message || t('transactions:messages.deleteFailed'));
            }
          },
        },
      ]
    );
  };

  // İşlem tipi + ilgili kişi/hesap bilgisi
  const getIslemSecondLine = (islem: IslemWithRelations) => {
    const parts = [t(`transactions:types.${islem.type}`)];

    // Transfer için hesaplar
    if (islem.type === 'transfer') {
      if (islem.hesap?.name && islem.hedef_hesap?.name) {
        parts.push(`${islem.hesap.name} → ${islem.hedef_hesap.name}`);
      }
    } else if (islem.cari?.name) {
      parts.push(islem.cari.name);
    } else if (islem.personel) {
      parts.push(`${islem.personel.first_name} ${islem.personel.last_name}`);
    } else if (islem.hesap?.name) {
      parts.push(islem.hesap.name);
    }

    return parts.join(' • ');
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
          {/* Arama */}
          <View style={styles.searchContainer}>
            <SearchInput
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
          </View>

          {/* Filtre */}
          <View style={styles.filterContainer}>
            <TabFilter options={filterOptions} value={filter} onChange={setFilter} />
          </View>

          {/* İşlem Listesi */}
          <View style={styles.listContainer}>
            {isLoading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text variant="body" color="secondary" style={styles.loadingText}>
                  {t('transactions:messages.loading')}
                </Text>
                {showLongLoadingMessage && (
                  <View style={styles.longLoadingMessage}>
                    <Clock size={20} color={colors.warning} />
                    <Text variant="caption" color="secondary" style={styles.longLoadingText}>
                      {t('transactions:messages.longLoading')}
                    </Text>
                  </View>
                )}
              </View>
            ) : filteredIslemler.length === 0 ? (
              <EmptyState
                icon={<Receipt size={48} color={colors.textMuted} />}
                title={t('common:search.noResults')}
                description={searchQuery || filter !== 'all'
                  ? t('transactions:messages.noTransactionsInPeriod')
                  : t('transactions:messages.noTransactions')}
              />
            ) : (
              filteredIslemler.map((islem) => (
                <ExpandableCard
                  key={islem.id}
                  expanded={expandedIslemId === islem.id}
                  onToggle={() => setExpandedIslemId(expandedIslemId === islem.id ? null : islem.id)}
                  header={
                    <View style={styles.islemHeader}>
                      <View style={[
                        styles.islemIconContainer,
                        { backgroundColor: getIslemIconBg(islem.type) }
                      ]}>
                        {getIslemIcon(islem.type, 24)}
                      </View>
                      <View style={styles.islemInfo}>
                        <Text variant="body">{formatDateMedium(islem.date)}</Text>
                        <Text variant="caption" color="secondary">
                          {getIslemSecondLine(islem)}
                        </Text>
                        {islem.kategori?.name && (
                          <Text variant="caption" color="secondary">
                            {islem.kategori.name}
                          </Text>
                        )}
                        {islem.description && (
                          <Text variant="caption" color="secondary" numberOfLines={1}>
                            {islem.description}
                          </Text>
                        )}
                      </View>
                      <Text
                        variant="h3"
                        color={getIslemAmountColor(islem.type)}
                      >
                        {getIslemAmountPrefix(islem.type)}
                        {formatCurrency(toNumber(islem.amount))}
                      </Text>
                    </View>
                  }
                >
                  <View style={styles.islemActions}>
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={<Pencil size={16} color={colors.text} />}
                      onPress={() => {
                        setEditTransactionId(islem.id);
                        setShowEditBar(true);
                        setExpandedIslemId(null);
                      }}
                      style={styles.actionButton}
                    >
                      {t('common:buttons.edit')}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      icon={<Trash2 size={16} color={colors.error} />}
                      onPress={() => handleDelete(islem.id, islem.description || t(`transactions:types.${islem.type}`))}
                      style={styles.actionButton}
                    >
                      {t('common:buttons.delete')}
                    </Button>
                  </View>
                </ExpandableCard>
              ))
            )}
          </View>
        </ScrollView>

      {/* Edit Transaction Bar */}
      <QuickTransactionBar
        visible={showEditBar}
        onDismiss={() => {
          setShowEditBar(false);
          setEditTransactionId(null);
        }}
        mode="edit"
        transactionId={editTransactionId ?? undefined}
        isScheduledTransaction={false}
        onSuccess={() => {
          setShowEditBar(false);
          setEditTransactionId(null);
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
  searchContainer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
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
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing['2xl'],
    gap: spacing.md,
  },
  loadingText: {
    marginTop: spacing.sm,
  },
  longLoadingMessage: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.warningLight,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: 8,
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  longLoadingText: {
    flex: 1,
    color: colors.warning,
  },
  islemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  islemIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  islemInfo: {
    flex: 1,
  },
  islemActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionButton: {
    flex: 1,
  },
});
