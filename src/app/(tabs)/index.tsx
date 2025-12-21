import { useState } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  CreditCard,
  Building2,
  Plus,
  ArrowUpRight,
  ArrowDownLeft,
  ArrowLeftRight,
  History,
  Banknote,
} from 'lucide-react-native';
import { Text, Card, TabFilter, ExpandableCard, Button, EmptyState } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing } from '@/constants/spacing';
import { formatCurrency } from '@/lib/utils';
import { useHesaplar, useTotalBalance } from '@/hooks/useHesaplar';
import { useCariSummary } from '@/hooks/useCariler';
import { useMonthSummary } from '@/hooks/useIslemler';
import { HesapType } from '@/types/database';

const periodOptions = [
  { label: 'Bu Ay', value: 'month' },
  { label: 'Tüm Zamanlar', value: 'all' },
];

export default function HomePage() {
  const router = useRouter();
  const [period, setPeriod] = useState('month');

  // Gerçek veriler
  const { data: hesaplar, isLoading: hesaplarLoading } = useHesaplar();
  const totalBalance = useTotalBalance();
  const { totalReceivables, totalPayables } = useCariSummary();
  const { data: monthSummary } = useMonthSummary();

  const totalIncome = monthSummary?.income ?? 0;
  const totalExpense = monthSummary?.expense ?? 0;
  const netProfit = totalIncome - totalExpense;

  const getHesapIcon = (type: HesapType) => {
    switch (type) {
      case 'nakit':
        return <Wallet size={24} color={colors.primary} />;
      case 'banka':
        return <Building2 size={24} color={colors.info} />;
      case 'kredi_karti':
        return <CreditCard size={24} color={colors.warning} />;
      default:
        return <Banknote size={24} color={colors.primary} />;
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <Text variant="h2">HesApp</Text>
        </View>

        {/* Dönem Seçici */}
        <View style={styles.periodFilter}>
          <TabFilter options={periodOptions} value={period} onChange={setPeriod} />
        </View>

        {/* Özet Kartları */}
        <View style={styles.summaryGrid}>
          <Card style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <View style={[styles.summaryIcon, { backgroundColor: colors.successLight }]}>
                <TrendingUp size={20} color={colors.success} />
              </View>
              <View>
                <Text variant="caption" color="secondary">
                  Gelir
                </Text>
                <Text variant="h3" color="success">
                  {formatCurrency(totalIncome)}
                </Text>
              </View>
            </View>
          </Card>

          <Card style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <View style={[styles.summaryIcon, { backgroundColor: colors.errorLight }]}>
                <TrendingDown size={20} color={colors.error} />
              </View>
              <View>
                <Text variant="caption" color="secondary">
                  Gider
                </Text>
                <Text variant="h3" color="error">
                  {formatCurrency(totalExpense)}
                </Text>
              </View>
            </View>
          </Card>

          <Card style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <View style={[styles.summaryIcon, { backgroundColor: colors.warningLight }]}>
                <ArrowDownLeft size={20} color={colors.warning} />
              </View>
              <View>
                <Text variant="caption" color="secondary">
                  Borçlar
                </Text>
                <Text variant="h3">
                  {formatCurrency(totalPayables)}
                </Text>
              </View>
            </View>
          </Card>

          <Card style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <View style={[styles.summaryIcon, { backgroundColor: colors.infoLight }]}>
                <ArrowUpRight size={20} color={colors.info} />
              </View>
              <View>
                <Text variant="caption" color="secondary">
                  Alacaklar
                </Text>
                <Text variant="h3">
                  {formatCurrency(totalReceivables)}
                </Text>
              </View>
            </View>
          </Card>

          <Card style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <View style={[styles.summaryIcon, { backgroundColor: colors.primaryLight }]}>
                <TrendingUp size={20} color={colors.primary} />
              </View>
              <View>
                <Text variant="caption" color="secondary">
                  Net Kar
                </Text>
                <Text variant="h3" color={netProfit >= 0 ? 'primary' : 'error'}>
                  {formatCurrency(netProfit)}
                </Text>
              </View>
            </View>
          </Card>
        </View>

        {/* Hesaplar Bölümü */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text variant="h3">Hesaplar</Text>
            <TouchableOpacity
              style={styles.addButton}
              onPress={() => router.push('/hesaplar/ekle')}
            >
              <Plus size={20} color={colors.primary} />
              <Text variant="label" style={{ color: colors.primary }}>
                Ekle
              </Text>
            </TouchableOpacity>
          </View>

          {/* Toplam Bakiye */}
          <Card style={styles.totalCard}>
            <Text variant="caption" color="secondary">
              Toplam Bakiye
            </Text>
            <Text variant="h2" color={totalBalance >= 0 ? 'primary' : 'error'}>
              {formatCurrency(totalBalance)}
            </Text>
          </Card>

          {/* Hizli Islem Butonlari */}
          <View style={styles.quickActions}>
            <Button
              variant="primary"
              size="md"
              icon={<ArrowDownLeft size={18} color={colors.surface} />}
              onPress={() => router.push('/islemler/gelir')}
              style={styles.quickActionBtn}
            >
              Gelir
            </Button>
            <Button
              variant="secondary"
              size="md"
              icon={<ArrowUpRight size={18} color={colors.text} />}
              onPress={() => router.push('/islemler/gider')}
              style={styles.quickActionBtn}
            >
              Gider
            </Button>
            <Button
              variant="outline"
              size="md"
              icon={<ArrowLeftRight size={18} color={colors.primary} />}
              onPress={() => router.push('/islemler/transfer')}
              style={styles.quickActionBtn}
            >
              Transfer
            </Button>
          </View>

          {/* Hesap Listesi */}
          {hesaplarLoading ? (
            <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: spacing.xl }} />
          ) : !hesaplar || hesaplar.length === 0 ? (
            <EmptyState
              icon={<Wallet size={48} color={colors.textMuted} />}
              title="Henüz hesap yok"
              description="İlk hesabınızı ekleyerek başlayın"
              actionLabel="Hesap Ekle"
              onAction={() => router.push('/hesaplar/ekle')}
            />
          ) : (
            hesaplar.map((hesap) => (
              <ExpandableCard
                key={hesap.id}
                header={
                  <View style={styles.hesapHeader}>
                    {getHesapIcon(hesap.type)}
                    <View style={styles.hesapInfo}>
                      <Text variant="body">{hesap.name}</Text>
                      <Text
                        variant="h3"
                        color={Number(hesap.balance) >= 0 ? 'primary' : 'error'}
                      >
                        {formatCurrency(Number(hesap.balance))}
                      </Text>
                    </View>
                  </View>
                }
              >
                <View style={styles.hesapActions}>
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={<ArrowDownLeft size={16} color={colors.success} />}
                    onPress={() => router.push(`/islemler/gelir?hesap_id=${hesap.id}`)}
                    style={styles.actionButton}
                  >
                    Gelir
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={<ArrowUpRight size={16} color={colors.error} />}
                    onPress={() => router.push(`/islemler/gider?hesap_id=${hesap.id}`)}
                    style={styles.actionButton}
                  >
                    Gider
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    icon={<History size={16} color={colors.text} />}
                    onPress={() => router.push(`/hesaplar/${hesap.id}`)}
                    style={styles.actionButton}
                  >
                    Hareketler
                  </Button>
                </View>
              </ExpandableCard>
            ))
          )}
        </View>
      </ScrollView>
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
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  periodFilter: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  summaryGrid: {
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  summaryCard: {
    width: '48%',
    flexGrow: 1,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  summaryIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  section: {
    paddingHorizontal: spacing.lg,
    marginTop: spacing.xl,
    marginBottom: spacing['3xl'],
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  totalCard: {
    marginBottom: spacing.lg,
    alignItems: 'center',
  },
  quickActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  quickActionBtn: {
    flex: 1,
  },
  hesapHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  hesapInfo: {
    flex: 1,
  },
  hesapActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionButton: {
    flex: 1,
  },
});
