import { useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  Pressable,
  Platform,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  Users,
  Building2,
  ChevronLeft,
  ChevronRight,
  PieChart,
  X,
} from 'lucide-react-native';
import { Text, Card, TabFilter, CategoryReportCard, Button } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing } from '@/constants/spacing';
import { calculateIncomeSummary } from '@/constants/islemTypes';
import { formatCurrency } from '@/lib/currency';
import { formatDateForDB } from '@/lib/date';
import { toNumber } from '@/lib/currency';
import { useHesaplar, useTotalBalance } from '@/hooks/useHesaplar';
import { useCariler, useCariSummary } from '@/hooks/useCariler';
import { usePersonelList, usePersonelSummary } from '@/hooks/usePersonel';
import { useIslemler, PeriodType, getPeriodDateRange } from '@/hooks/useIslemler';
import { useCategoryReport } from '@/hooks/useCategoryReport';

type TabType = 'genel' | 'gider' | 'gelir';

const TAB_OPTIONS = [
  { label: 'Genel', value: 'genel' },
  { label: 'Gider Analizi', value: 'gider' },
  { label: 'Gelir Analizi', value: 'gelir' },
];

const PERIOD_OPTIONS = [
  { label: 'Yıllık', value: 'yearly' },
  { label: 'Aylık', value: 'monthly' },
  { label: 'Haftalık', value: 'weekly' },
  { label: 'Günlük', value: 'daily' },
  { label: 'Özel', value: 'custom' },
];

export default function RaporlarPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabType>('genel');
  const [period, setPeriod] = useState<PeriodType>('monthly');
  const [periodOffset, setPeriodOffset] = useState(0);

  // Özel tarih aralığı için state'ler
  const [customStartDate, setCustomStartDate] = useState<Date>(new Date());
  const [customEndDate, setCustomEndDate] = useState<Date>(new Date());
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);

  // Verileri cek
  const { data: hesaplar } = useHesaplar();
  const totalBalance = useTotalBalance();
  const { data: cariler } = useCariler();
  const { totalReceivables, totalPayables } = useCariSummary();
  const { data: personelList } = usePersonelList();
  const { totalDebt: personelDebt } = usePersonelSummary();

  // Dönem tarih aralığını hesapla
  const customRange =
    period === 'custom'
      ? {
          startDate: formatDateForDB(customStartDate),
          endDate: formatDateForDB(customEndDate),
        }
      : undefined;
  const {
    startDate,
    endDate,
    label: periodLabel,
  } = getPeriodDateRange(period, periodOffset, customRange);

  const { data: islemler } = useIslemler({
    startDate,
    endDate,
  });

  // Kategori raporları
  const giderRaporu = useCategoryReport('gider', {
    startDate,
    endDate,
  });

  const gelirRaporu = useCategoryReport('gelir', {
    startDate,
    endDate,
  });

  // Aylik ozet hesapla - merkezi fonksiyon kullan
  const monthlyStats = islemler ? calculateIncomeSummary(islemler) : { income: 0, expense: 0 };

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

  // Kategori detay sayfasına git
  const handleCategoryPress = (kategoriId: string | null, type: 'gelir' | 'gider') => {
    const id = kategoriId || 'uncategorized';
    router.push({
      pathname: '/raporlar/kategori/[id]',
      params: {
        id,
        type,
        startDate,
        endDate,
      },
    });
  };

  // Genel Sekme İçeriği
  const renderGenelTab = () => (
    <>
      {/* Dönem Özeti */}
      <View style={styles.section}>
        <Text variant="label" color="secondary" style={styles.sectionTitle}>
          DÖNEM ÖZETİ
        </Text>
        <Card style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <View style={[styles.iconContainer, { backgroundColor: colors.successLight }]}>
                <TrendingUp size={20} color={colors.success} />
              </View>
              <Text variant="caption" color="secondary">
                Gelir
              </Text>
              <Text variant="h3" color="success">
                {formatCurrency(monthlyStats.income)}
              </Text>
            </View>
            <View style={styles.summaryItem}>
              <View style={[styles.iconContainer, { backgroundColor: colors.errorLight }]}>
                <TrendingDown size={20} color={colors.error} />
              </View>
              <Text variant="caption" color="secondary">
                Gider
              </Text>
              <Text variant="h3" color="error">
                {formatCurrency(monthlyStats.expense)}
              </Text>
            </View>
          </View>
          <View style={styles.divider} />
          <View style={styles.netProfitRow}>
            <Text variant="body" color="secondary">
              Net Kar/Zarar
            </Text>
            <Text variant="h2" color={netProfit >= 0 ? 'success' : 'error'}>
              {formatCurrency(netProfit)}
            </Text>
          </View>
        </Card>
      </View>

      {/* İşlem Dağılımı */}
      <View style={styles.section}>
        <Text variant="label" color="secondary" style={styles.sectionTitle}>
          İŞLEM DAĞILIMI
        </Text>
        <Card>
          <View style={styles.distributionHeader}>
            <PieChart size={20} color={colors.primary} />
            <Text variant="body" style={{ marginLeft: spacing.sm }}>
              Toplam {islemler?.length ?? 0} işlem
            </Text>
          </View>
          <View style={styles.distributionGrid}>
            <View style={styles.distributionItem}>
              <View style={[styles.distributionDot, { backgroundColor: colors.success }]} />
              <Text variant="caption" color="secondary">
                Gelir
              </Text>
              <Text variant="label">{transactionCounts.gelir}</Text>
            </View>
            <View style={styles.distributionItem}>
              <View style={[styles.distributionDot, { backgroundColor: colors.error }]} />
              <Text variant="caption" color="secondary">
                Gider
              </Text>
              <Text variant="label">{transactionCounts.gider}</Text>
            </View>
            <View style={styles.distributionItem}>
              <View style={[styles.distributionDot, { backgroundColor: colors.info }]} />
              <Text variant="caption" color="secondary">
                Transfer
              </Text>
              <Text variant="label">{transactionCounts.transfer}</Text>
            </View>
            <View style={styles.distributionItem}>
              <View style={[styles.distributionDot, { backgroundColor: colors.warning }]} />
              <Text variant="caption" color="secondary">
                Cari
              </Text>
              <Text variant="label">{transactionCounts.cari}</Text>
            </View>
            <View style={styles.distributionItem}>
              <View style={[styles.distributionDot, { backgroundColor: colors.primary }]} />
              <Text variant="caption" color="secondary">
                Personel
              </Text>
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
              <Text variant="label" color={toNumber(hesap.balance) >= 0 ? 'primary' : 'error'}>
                {formatCurrency(toNumber(hesap.balance))}
              </Text>
            </View>
          ))}
        </Card>
      </View>

      {/* Cari Durum */}
      <View style={styles.section}>
        <Text variant="label" color="secondary" style={styles.sectionTitle}>
          CARİ DURUM
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
              <Text variant="caption" color="secondary">
                Alacaklar
              </Text>
              <Text variant="h3" color="success">
                {formatCurrency(totalReceivables)}
              </Text>
            </View>
            <View style={styles.cariSummaryItem}>
              <Text variant="caption" color="secondary">
                Borçlar
              </Text>
              <Text variant="h3" color="error">
                {formatCurrency(totalPayables)}
              </Text>
            </View>
          </View>
          <View style={styles.divider} />
          <View style={styles.netRow}>
            <Text variant="body" color="secondary">
              Net Durum
            </Text>
            <Text variant="h3" color={totalReceivables - totalPayables >= 0 ? 'success' : 'error'}>
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
          GENEL BAKIŞ
        </Text>
        <Card style={styles.overviewCard}>
          <View style={styles.overviewRow}>
            <Text variant="body">Toplam Varlıklar</Text>
            <Text variant="h3" color="success">
              {formatCurrency(totalBalance + totalReceivables)}
            </Text>
          </View>
          <View style={styles.overviewRow}>
            <Text variant="body">Toplam Yükümlülükler</Text>
            <Text variant="h3" color="error">
              {formatCurrency(totalPayables + personelDebt)}
            </Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.overviewRow}>
            <Text variant="h3">Net Değer</Text>
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
    </>
  );

  // Gider Analizi Sekmesi
  const renderGiderTab = () => (
    <>
      {/* Toplam Gider */}
      <View style={styles.section}>
        <Card style={styles.totalCard}>
          <View
            style={[
              styles.iconContainer,
              { backgroundColor: colors.errorLight, alignSelf: 'center' },
            ]}
          >
            <TrendingDown size={24} color={colors.error} />
          </View>
          <Text variant="caption" color="secondary" style={styles.totalLabel}>
            Toplam Gider
          </Text>
          <Text variant="h1" color="error" style={styles.totalAmount}>
            {formatCurrency(giderRaporu.totalAmount)}
          </Text>
          <Text variant="caption" color="secondary">
            {giderRaporu.items.reduce((acc, item) => acc + item.count, 0)} işlem
          </Text>
        </Card>
      </View>

      {/* Kategori Dağılımı */}
      <View style={styles.section}>
        <Text variant="label" color="secondary" style={styles.sectionTitle}>
          KATEGORİ DAĞILIMI
        </Text>

        {giderRaporu.isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : giderRaporu.items.length === 0 ? (
          <Card style={styles.emptyCard}>
            <Text variant="body" color="secondary" style={{ textAlign: 'center' }}>
              Bu dönemde gider işlemi bulunmuyor
            </Text>
          </Card>
        ) : (
          giderRaporu.items.map((item, index) => (
            <CategoryReportCard
              key={item.kategori?.id || 'uncategorized'}
              item={item}
              index={index}
              type="gider"
              onPress={() => handleCategoryPress(item.kategori?.id || null, 'gider')}
            />
          ))
        )}
      </View>
    </>
  );

  // Gelir Analizi Sekmesi
  const renderGelirTab = () => (
    <>
      {/* Toplam Gelir */}
      <View style={styles.section}>
        <Card style={styles.totalCard}>
          <View
            style={[
              styles.iconContainer,
              { backgroundColor: colors.successLight, alignSelf: 'center' },
            ]}
          >
            <TrendingUp size={24} color={colors.success} />
          </View>
          <Text variant="caption" color="secondary" style={styles.totalLabel}>
            Toplam Gelir
          </Text>
          <Text variant="h1" color="success" style={styles.totalAmount}>
            {formatCurrency(gelirRaporu.totalAmount)}
          </Text>
          <Text variant="caption" color="secondary">
            {gelirRaporu.items.reduce((acc, item) => acc + item.count, 0)} işlem
          </Text>
        </Card>
      </View>

      {/* Kategori Dağılımı */}
      <View style={styles.section}>
        <Text variant="label" color="secondary" style={styles.sectionTitle}>
          KATEGORİ DAĞILIMI
        </Text>

        {gelirRaporu.isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : gelirRaporu.items.length === 0 ? (
          <Card style={styles.emptyCard}>
            <Text variant="body" color="secondary" style={{ textAlign: 'center' }}>
              Bu dönemde gelir işlemi bulunmuyor
            </Text>
          </Card>
        ) : (
          gelirRaporu.items.map((item, index) => (
            <CategoryReportCard
              key={item.kategori?.id || 'uncategorized'}
              item={item}
              index={index}
              type="gelir"
              onPress={() => handleCategoryPress(item.kategori?.id || null, 'gelir')}
            />
          ))
        )}
      </View>
    </>
  );

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Tab Filter */}
        <View style={styles.tabContainer}>
          <TabFilter
            options={TAB_OPTIONS}
            value={activeTab}
            onChange={(value) => setActiveTab(value as TabType)}
          />
        </View>

        {/* Dönem Seçici */}
        <View style={styles.periodFilter}>
          <TabFilter
            options={PERIOD_OPTIONS}
            value={period}
            onChange={(v) => {
              setPeriod(v as PeriodType);
              setPeriodOffset(0);
            }}
          />
          {/* Dönem Navigasyonu - Özel hariç diğer dönemler için */}
          {period !== 'custom' ? (
            <View style={styles.periodNavigator}>
              <TouchableOpacity
                style={styles.periodNavButton}
                onPress={() => setPeriodOffset(periodOffset - 1)}
              >
                <ChevronLeft size={20} color={colors.text} />
              </TouchableOpacity>
              <Text variant="body" style={styles.periodLabel}>
                {periodLabel}
              </Text>
              <TouchableOpacity
                style={styles.periodNavButton}
                onPress={() => setPeriodOffset(periodOffset + 1)}
              >
                <ChevronRight size={20} color={colors.text} />
              </TouchableOpacity>
            </View>
          ) : (
            /* Özel tarih aralığı seçici */
            <View style={styles.customDateContainer}>
              <TouchableOpacity
                style={styles.datePickerButton}
                onPress={() => setShowStartPicker(true)}
              >
                <Text variant="caption" color="secondary">
                  Başlangıç
                </Text>
                <Text variant="body">{customStartDate.toLocaleDateString('tr-TR')}</Text>
              </TouchableOpacity>
              <Text variant="body" color="secondary">
                -
              </Text>
              <TouchableOpacity
                style={styles.datePickerButton}
                onPress={() => setShowEndPicker(true)}
              >
                <Text variant="caption" color="secondary">
                  Bitiş
                </Text>
                <Text variant="body">{customEndDate.toLocaleDateString('tr-TR')}</Text>
              </TouchableOpacity>
            </View>
          )}
          {/* iOS için DateTimePicker Modal */}
          {Platform.OS === 'ios' && (showStartPicker || showEndPicker) && (
            <Modal visible={showStartPicker || showEndPicker} transparent animationType="slide">
              <Pressable
                style={styles.datePickerModalOverlay}
                onPress={() => {
                  setShowStartPicker(false);
                  setShowEndPicker(false);
                }}
              >
                <Pressable
                  style={styles.datePickerModalContent}
                  onPress={(e) => e.stopPropagation()}
                >
                  <View style={styles.datePickerModalHeader}>
                    <Text variant="h3">
                      {showStartPicker ? 'Başlangıç Tarihi' : 'Bitiş Tarihi'}
                    </Text>
                    <TouchableOpacity
                      onPress={() => {
                        setShowStartPicker(false);
                        setShowEndPicker(false);
                      }}
                    >
                      <X size={24} color={colors.text} />
                    </TouchableOpacity>
                  </View>
                  <View style={styles.datePickerWrapper}>
                    <DateTimePicker
                      value={showStartPicker ? customStartDate : customEndDate}
                      mode="date"
                      display="inline"
                      onChange={(event, date) => {
                        if (date) {
                          if (showStartPicker) {
                            setCustomStartDate(date);
                            if (date > customEndDate) {
                              setCustomEndDate(date);
                            }
                          } else {
                            setCustomEndDate(date);
                          }
                        }
                      }}
                      minimumDate={showEndPicker ? customStartDate : undefined}
                      maximumDate={new Date()}
                      locale="tr-TR"
                      themeVariant="light"
                      accentColor={colors.primary}
                      style={{ height: 350 }}
                    />
                  </View>
                  <Button
                    variant="primary"
                    onPress={() => {
                      setShowStartPicker(false);
                      setShowEndPicker(false);
                    }}
                    style={{ marginTop: spacing.md }}
                  >
                    Tamam
                  </Button>
                </Pressable>
              </Pressable>
            </Modal>
          )}
          {/* Android için DateTimePicker */}
          {Platform.OS === 'android' && showStartPicker && (
            <DateTimePicker
              value={customStartDate}
              mode="date"
              display="default"
              onChange={(event, date) => {
                setShowStartPicker(false);
                if (event.type === 'set' && date) {
                  setCustomStartDate(date);
                  if (date > customEndDate) {
                    setCustomEndDate(date);
                  }
                }
              }}
              maximumDate={new Date()}
            />
          )}
          {Platform.OS === 'android' && showEndPicker && (
            <DateTimePicker
              value={customEndDate}
              mode="date"
              display="default"
              onChange={(event, date) => {
                setShowEndPicker(false);
                if (event.type === 'set' && date) {
                  setCustomEndDate(date);
                }
              }}
              minimumDate={customStartDate}
              maximumDate={new Date()}
            />
          )}
        </View>

        {/* Aktif Sekme İçeriği */}
        {activeTab === 'genel' && renderGenelTab()}
        {activeTab === 'gider' && renderGiderTab()}
        {activeTab === 'gelir' && renderGelirTab()}
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
  tabContainer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  periodFilter: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  periodNavigator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  periodNavButton: {
    padding: spacing.sm,
  },
  periodLabel: {
    minWidth: 150,
    textAlign: 'center',
  },
  customDateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  datePickerButton: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  datePickerModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  datePickerModalContent: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: spacing.lg,
  },
  datePickerModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  datePickerWrapper: {
    alignItems: 'center',
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
  // Yeni stiller
  totalCard: {
    padding: spacing.xl,
    alignItems: 'center',
  },
  totalLabel: {
    marginTop: spacing.sm,
  },
  totalAmount: {
    marginVertical: spacing.xs,
  },
  loadingContainer: {
    padding: spacing['2xl'],
    alignItems: 'center',
  },
  emptyCard: {
    padding: spacing.xl,
  },
});
