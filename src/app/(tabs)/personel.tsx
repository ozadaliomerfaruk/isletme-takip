import { useState, useRef, useEffect } from 'react';
import { View, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  UserCircle,
  Plus,
  Zap,
  History,
  Phone,
  Briefcase,
  EyeOff,
  MinusCircle,
  Banknote,
  X,
} from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Text, SearchInput, ExpandableCard, Button, EmptyState, Card } from '@/components/ui';
import { QuickTransactionBar } from '@/components/transaction/QuickTransactionBar';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
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
  const [fabMenuVisible, setFabMenuVisible] = useState(false);

  // FAB animation
  const fabRotation = useRef(new Animated.Value(0)).current;
  const menuOpacity = useRef(new Animated.Value(0)).current;
  const menuTranslateY = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    if (fabMenuVisible) {
      Animated.parallel([
        Animated.timing(fabRotation, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(menuOpacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(menuTranslateY, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(fabRotation, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(menuOpacity, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(menuTranslateY, {
          toValue: 20,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [fabMenuVisible]);

  // Gerçek veriler - pasif personeli de dahil et
  const { data: personelList, isLoading } = usePersonelList(true);
  const { payables, receivables } = useFinancialSummary();

  // Arama ve sıralama (aktif önce)
  const filteredPersonel = personelList
    ?.filter((p) =>
      `${p.first_name} ${p.last_name}`.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .sort((a, b) => {
      // Aktif olanlar önce
      if (a.is_active !== b.is_active) {
        return a.is_active ? -1 : 1;
      }
      // Aynı durumda olanları alfabetik sırala
      return a.first_name.localeCompare(b.first_name, 'tr');
    });

  // Helper fonksiyonlar - nested ternary yerine daha okunabilir
  function getBalanceLabel(balance: number): string {
    if (balance === 0) return t('staff:balance.noBalance');
    if (balance < 0) return t('staff:balance.weOwe');
    return t('staff:balance.theyOwe');
  }

  function getBalanceColor(balance: number): 'secondary' | 'error' | 'success' {
    if (balance === 0) return 'secondary';
    if (balance < 0) return 'error';
    return 'success';
  }


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
              <View key={personel.id} style={!personel.is_active && styles.passiveItem}>
                <ExpandableCard
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
                        <View style={styles.personelNameRow}>
                          <Text variant="body">
                            {personel.first_name} {personel.last_name}
                          </Text>
                          {!personel.is_active && (
                            <EyeOff size={14} color={colors.textMuted} />
                          )}
                        </View>
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
                        {getBalanceLabel(toNumber(personel.balance))}
                      </Text>
                      <Text
                        variant="h3"
                        color={getBalanceColor(toNumber(personel.balance))}
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
              </View>
            ))
          )}
        </View>
      </ScrollView>

      {/* FAB Menu */}
      <View style={styles.fabContainer}>
        {fabMenuVisible && (
          <Animated.View
            style={[
              styles.fabMenu,
              {
                opacity: menuOpacity,
                transform: [{ translateY: menuTranslateY }],
              },
            ]}
          >
            <TouchableOpacity
              style={styles.fabMenuItem}
              onPress={() => {
                setFabMenuVisible(false);
                router.push('/personel/toplu-gider');
              }}
            >
              <View style={[styles.fabMenuIcon, { backgroundColor: colors.errorLight }]}>
                <MinusCircle size={20} color={colors.error} />
              </View>
              <Text variant="body">{t('staff:bulkActions.addExpense')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.fabMenuItem}
              onPress={() => {
                setFabMenuVisible(false);
                router.push('/personel/toplu-odeme');
              }}
            >
              <View style={[styles.fabMenuIcon, { backgroundColor: colors.successLight }]}>
                <Banknote size={20} color={colors.success} />
              </View>
              <Text variant="body">{t('staff:bulkActions.addPayment')}</Text>
            </TouchableOpacity>
          </Animated.View>
        )}
        <TouchableOpacity
          style={styles.fab}
          onPress={() => setFabMenuVisible(!fabMenuVisible)}
          activeOpacity={0.8}
        >
          <Animated.View
            style={{
              transform: [
                {
                  rotate: fabRotation.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['0deg', '45deg'],
                  }),
                },
              ],
            }}
          >
            {fabMenuVisible ? (
              <X size={24} color={colors.surface} />
            ) : (
              <Plus size={24} color={colors.surface} />
            )}
          </Animated.View>
        </TouchableOpacity>
      </View>

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
  personelNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  passiveItem: {
    opacity: 0.5,
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
  // FAB Styles
  fabContainer: {
    position: 'absolute',
    right: spacing.lg,
    bottom: spacing.lg,
    alignItems: 'flex-end',
  },
  fab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  fabMenu: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.sm,
    marginBottom: spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
    minWidth: 200,
  },
  fabMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  fabMenuIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
