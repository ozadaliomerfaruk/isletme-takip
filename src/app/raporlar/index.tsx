import { useState } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  Users,
  Building2,
  ChevronLeft,
  ChevronRight,
  PieChart,
} from 'lucide-react-native';
import { Text, Card } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing } from '@/constants/spacing';
import { formatCurrency } from '@/lib/utils';
import { useHesaplar, useTotalBalance } from '@/hooks/useHesaplar';
import { useCariler, useCariSummary } from '@/hooks/useCariler';
import { usePersonelList, usePersonelSummary } from '@/hooks/usePersonel';
import { useIslemler } from '@/hooks/useIslemler';

export default function RaporlarPage() {
  const [selectedMonth, setSelectedMonth] = useState(new Date());

  // Verileri cek
  const { data: hesaplar } = useHesaplar();
  const totalBalance = useTotalBalance();
  const { data: cariler } = useCariler();
  const { totalReceivables, totalPayables } = useCariSummary();
  const { data: personelList } = usePersonelList();
  const { totalDebt: personelDebt } = usePersonelSummary();

  // Secili ay icin islemleri filtrele
  const startOfMonth = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth(), 1)
    .toISOString()
    .split('T')[0];
  const endOfMonth = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + 1, 0)
    .toISOString()
    .split('T')[0];

  const { data: islemler } = useIslemler({
    startDate: startOfMonth,
    endDate: endOfMonth,
  });

  // Aylik ozet hesapla
  const monthlyStats = islemler?.reduce(
    (acc, islem) => {
      const amount = Number(islem.amount);
      if (islem.type === 'gelir' || islem.type === 'cari_tahsilat' || islem.type === 'cari_satis') {
        acc.income += amount;
      } else if (
        islem.type === 'gider' ||
        islem.type === 'cari_odeme' ||
        islem.type === 'cari_alis' ||
        islem.type === 'personel_gider' ||
        islem.type === 'personel_odeme'
      ) {
        acc.expense += amount;
      }
      return acc;
    },
    { income: 0, expense: 0 }
  ) ?? { income: 0, expense: 0 };

  const netProfit = monthlyStats.income - monthlyStats.expense;

  // Islem sayilari
  const transactionCounts = islemler?.reduce(
    (acc, islem) => {
      if (islem.type === 'gelir') acc.gelir++;
      else if (islem.type === 'gider') acc.gider++;
      else if (islem.type === 'transfer') acc.transfer++;
      else if (islem.type.startsWith('cari_')) acc.cari++;
      else if (islem.type.startsWith('personel_')) acc.personel++;
      return acc;
    },
    { gelir: 0, gider: 0, transfer: 0, cari: 0, personel: 0 }
  ) ?? { gelir: 0, gider: 0, transfer: 0, cari: 0, personel: 0 };

  // Ay navigasyonu
  const goToPreviousMonth = () => {
    setSelectedMonth(new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() - 1, 1));
  };

  const goToNextMonth = () => {
    const nextMonth = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + 1, 1);
    if (nextMonth <= new Date()) {
      setSelectedMonth(nextMonth);
    }
  };

  const formatMonthYear = (date: Date) => {
    const months = [
      'Ocak', 'Subat', 'Mart', 'Nisan', 'Mayis', 'Haziran',
      'Temmuz', 'Agustos', 'Eylul', 'Ekim', 'Kasim', 'Aralik'
    ];
    return `${months[date.getMonth()]} ${date.getFullYear()}`;
  };

  const isCurrentMonth = selectedMonth.getMonth() === new Date().getMonth() &&
    selectedMonth.getFullYear() === new Date().getFullYear();

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
          {/* Ay Secici */}
          <View style={styles.monthSelector}>
            <TouchableOpacity onPress={goToPreviousMonth} style={styles.monthButton}>
              <ChevronLeft size={24} color={colors.primary} />
            </TouchableOpacity>
            <Text variant="h3">{formatMonthYear(selectedMonth)}</Text>
            <TouchableOpacity
              onPress={goToNextMonth}
              style={styles.monthButton}
              disabled={isCurrentMonth}
            >
              <ChevronRight size={24} color={isCurrentMonth ? colors.textMuted : colors.primary} />
            </TouchableOpacity>
          </View>

          {/* Aylik Ozet */}
          <View style={styles.section}>
            <Text variant="label" color="secondary" style={styles.sectionTitle}>
              AYLIK OZET
            </Text>
            <Card style={styles.summaryCard}>
              <View style={styles.summaryRow}>
                <View style={styles.summaryItem}>
                  <View style={[styles.iconContainer, { backgroundColor: colors.successLight }]}>
                    <TrendingUp size={20} color={colors.success} />
                  </View>
                  <Text variant="caption" color="secondary">Gelir</Text>
                  <Text variant="h3" color="success">{formatCurrency(monthlyStats.income)}</Text>
                </View>
                <View style={styles.summaryItem}>
                  <View style={[styles.iconContainer, { backgroundColor: colors.errorLight }]}>
                    <TrendingDown size={20} color={colors.error} />
                  </View>
                  <Text variant="caption" color="secondary">Gider</Text>
                  <Text variant="h3" color="error">{formatCurrency(monthlyStats.expense)}</Text>
                </View>
              </View>
              <View style={styles.divider} />
              <View style={styles.netProfitRow}>
                <Text variant="body" color="secondary">Net Kar/Zarar</Text>
                <Text variant="h2" color={netProfit >= 0 ? 'success' : 'error'}>
                  {formatCurrency(netProfit)}
                </Text>
              </View>
            </Card>
          </View>

          {/* Islem Dagilimi */}
          <View style={styles.section}>
            <Text variant="label" color="secondary" style={styles.sectionTitle}>
              ISLEM DAGILIMI
            </Text>
            <Card>
              <View style={styles.distributionHeader}>
                <PieChart size={20} color={colors.primary} />
                <Text variant="body" style={{ marginLeft: spacing.sm }}>
                  Toplam {islemler?.length ?? 0} islem
                </Text>
              </View>
              <View style={styles.distributionGrid}>
                <View style={styles.distributionItem}>
                  <View style={[styles.distributionDot, { backgroundColor: colors.success }]} />
                  <Text variant="caption" color="secondary">Gelir</Text>
                  <Text variant="label">{transactionCounts.gelir}</Text>
                </View>
                <View style={styles.distributionItem}>
                  <View style={[styles.distributionDot, { backgroundColor: colors.error }]} />
                  <Text variant="caption" color="secondary">Gider</Text>
                  <Text variant="label">{transactionCounts.gider}</Text>
                </View>
                <View style={styles.distributionItem}>
                  <View style={[styles.distributionDot, { backgroundColor: colors.info }]} />
                  <Text variant="caption" color="secondary">Transfer</Text>
                  <Text variant="label">{transactionCounts.transfer}</Text>
                </View>
                <View style={styles.distributionItem}>
                  <View style={[styles.distributionDot, { backgroundColor: colors.warning }]} />
                  <Text variant="caption" color="secondary">Cari</Text>
                  <Text variant="label">{transactionCounts.cari}</Text>
                </View>
                <View style={styles.distributionItem}>
                  <View style={[styles.distributionDot, { backgroundColor: colors.primary }]} />
                  <Text variant="caption" color="secondary">Personel</Text>
                  <Text variant="label">{transactionCounts.personel}</Text>
                </View>
              </View>
            </Card>
          </View>

          {/* Hesap Bakiyeleri */}
          <View style={styles.section}>
            <Text variant="label" color="secondary" style={styles.sectionTitle}>
              HESAP BAKIYELERI
            </Text>
            <Card>
              <View style={styles.accountHeader}>
                <Wallet size={20} color={colors.primary} />
                <Text variant="body" style={{ marginLeft: spacing.sm }}>
                  {hesaplar?.length ?? 0} Hesap
                </Text>
                <View style={{ flex: 1 }} />
                <Text variant="h3" color={totalBalance >= 0 ? 'primary' : 'error'}>
                  {formatCurrency(totalBalance)}
                </Text>
              </View>
              {hesaplar?.map((hesap) => (
                <View key={hesap.id} style={styles.accountItem}>
                  <Text variant="body">{hesap.name}</Text>
                  <Text
                    variant="label"
                    color={Number(hesap.balance) >= 0 ? 'primary' : 'error'}
                  >
                    {formatCurrency(Number(hesap.balance))}
                  </Text>
                </View>
              ))}
            </Card>
          </View>

          {/* Cari Durum */}
          <View style={styles.section}>
            <Text variant="label" color="secondary" style={styles.sectionTitle}>
              CARI DURUM
            </Text>
            <Card>
              <View style={styles.accountHeader}>
                <Building2 size={20} color={colors.warning} />
                <Text variant="body" style={{ marginLeft: spacing.sm }}>
                  {cariler?.length ?? 0} Cari
                </Text>
              </View>
              <View style={styles.cariSummaryRow}>
                <View style={styles.cariSummaryItem}>
                  <Text variant="caption" color="secondary">Alacaklar</Text>
                  <Text variant="h3" color="success">{formatCurrency(totalReceivables)}</Text>
                </View>
                <View style={styles.cariSummaryItem}>
                  <Text variant="caption" color="secondary">Borclar</Text>
                  <Text variant="h3" color="error">{formatCurrency(totalPayables)}</Text>
                </View>
              </View>
              <View style={styles.divider} />
              <View style={styles.netRow}>
                <Text variant="body" color="secondary">Net Durum</Text>
                <Text
                  variant="h3"
                  color={totalReceivables - totalPayables >= 0 ? 'success' : 'error'}
                >
                  {formatCurrency(totalReceivables - totalPayables)}
                </Text>
              </View>
            </Card>
          </View>

          {/* Personel Durum */}
          <View style={styles.section}>
            <Text variant="label" color="secondary" style={styles.sectionTitle}>
              PERSONEL DURUM
            </Text>
            <Card>
              <View style={styles.accountHeader}>
                <Users size={20} color={colors.info} />
                <Text variant="body" style={{ marginLeft: spacing.sm }}>
                  {personelList?.length ?? 0} Personel
                </Text>
                <View style={{ flex: 1 }} />
                <Text variant="h3" color="error">
                  {formatCurrency(personelDebt)}
                </Text>
              </View>
              <Text variant="caption" color="secondary" style={{ marginTop: spacing.xs }}>
                Toplam personel borcu
              </Text>
            </Card>
          </View>

          {/* Genel Bakis */}
          <View style={[styles.section, { marginBottom: spacing['3xl'] }]}>
            <Text variant="label" color="secondary" style={styles.sectionTitle}>
              GENEL BAKIS
            </Text>
            <Card style={styles.overviewCard}>
              <View style={styles.overviewRow}>
                <Text variant="body">Toplam Varliklar</Text>
                <Text variant="h3" color="success">
                  {formatCurrency(totalBalance + totalReceivables)}
                </Text>
              </View>
              <View style={styles.overviewRow}>
                <Text variant="body">Toplam Yukslumlulukler</Text>
                <Text variant="h3" color="error">
                  {formatCurrency(totalPayables + personelDebt)}
                </Text>
              </View>
              <View style={styles.divider} />
              <View style={styles.overviewRow}>
                <Text variant="h3">Net Deger</Text>
                <Text
                  variant="h2"
                  color={
                    totalBalance + totalReceivables - totalPayables - personelDebt >= 0
                      ? 'primary'
                      : 'error'
                  }
                >
                  {formatCurrency(totalBalance + totalReceivables - totalPayables - personelDebt)}
                </Text>
              </View>
            </Card>
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
  monthSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  monthButton: {
    padding: spacing.sm,
  },
  section: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    marginBottom: spacing.sm,
    marginLeft: spacing.xs,
  },
  summaryCard: {
    padding: spacing.lg,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  summaryItem: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.lg,
  },
  netProfitRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  distributionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  distributionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  distributionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minWidth: '30%',
  },
  distributionDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  accountHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  accountItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  cariSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: spacing.md,
  },
  cariSummaryItem: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  netRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  overviewCard: {
    padding: spacing.lg,
  },
  overviewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
});
