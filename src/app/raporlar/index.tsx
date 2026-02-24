import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  Pressable,
  Platform,
  RefreshControl,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  Users,
  Building2,
  ChevronLeft,
  ChevronRight,
  X,
  CreditCard,
  BarChart3,
} from 'lucide-react-native';
import { Text, Card, TabFilter, CategoryReportCard, Button } from '@/components/ui';
import {
  EntityPicker,
  EntitySummaryCard,
  EntityTransactionList,
  PeriodComparisonChart,
  TrendIndicator,
} from '@/components/reports';
import { colors } from '@/constants/colors';
import { spacing } from '@/constants/spacing';
import { formatCurrency } from '@/lib/currency';
import { formatDateForDB, parseDateFromDB } from '@/lib/date';
import { toNumber } from '@/lib/currency';
import { useHesaplar, useTotalBalance } from '@/hooks/useHesaplar';
import { useCariler } from '@/hooks/useCariler';
import { usePersonelList } from '@/hooks/usePersonel';
import { useFinancialSummary } from '@/hooks/useFinancialSummary';
import { useSettings } from '@/hooks/useSettings';
import { useExchangeRates, convertCurrency } from '@/hooks/useExchangeRates';
import { PeriodType, useIslemlerByCari, useIslemlerByPersonel, useMonthSummary } from '@/hooks/useIslemler';
import { useDateFormat } from '@/hooks/useDateFormat';
import { useCategoryReport } from '@/hooks/useCategoryReport';
import { useTranslation } from 'react-i18next';

type TabType = 'genel' | 'gider' | 'gelir' | 'cari' | 'personel' | 'karsilastirma';

export default function RaporlarPage() {
  const router = useRouter();
  const { tab, startDate: paramStartDate, endDate: paramEndDate } = useLocalSearchParams<{ tab?: string; startDate?: string; endDate?: string }>();
  const { t } = useTranslation(['reports', 'common', 'errors']);
  const { getDateRangeLabel, locale, formatDateNative } = useDateFormat();

  const TAB_OPTIONS = [
    { label: t('reports:tabs.general'), value: 'genel' },
    { label: t('reports:tabs.expenseAnalysis'), value: 'gider' },
    { label: t('reports:tabs.incomeAnalysis'), value: 'gelir' },
    { label: t('reports:tabs.client'), value: 'cari' },
    { label: t('reports:tabs.personnel'), value: 'personel' },
    { label: t('reports:tabs.comparison'), value: 'karsilastirma' },
  ];

  const PERIOD_OPTIONS = [
    { label: t('reports:period.yearly'), value: 'yearly' },
    { label: t('reports:period.monthly'), value: 'monthly' },
    { label: t('reports:period.weekly'), value: 'weekly' },
    { label: t('reports:period.daily'), value: 'daily' },
    { label: t('reports:period.custom'), value: 'custom' },
  ];

  const [activeTab, setActiveTab] = useState<TabType>('genel');
  const [period, setPeriod] = useState<PeriodType>('monthly');
  const [periodOffset, setPeriodOffset] = useState(0);

  // Cari ve Personel tab için seçim state'leri
  const [selectedCariId, setSelectedCariId] = useState<string | null>(null);
  const [selectedPersonelId, setSelectedPersonelId] = useState<string | null>(null);

  // Karşılaştırma tab için metrik seçimi
  const [comparisonMetric, setComparisonMetric] = useState<'income' | 'expense' | 'net'>('income');

  // URL parametrelerini consume-once olarak uygula (dashboard'dan gelince)
  // Uygulandıktan sonra params temizlenir, geri-ileri navigasyonda tekrar tetiklenmez
  useEffect(() => {
    let consumed = false;

    if (tab) {
      const validTabs = ['gider', 'gelir', 'cari', 'personel', 'karsilastirma'] as const;
      if (validTabs.includes(tab as any)) {
        setActiveTab(tab as typeof validTabs[number]);
        consumed = true;
      }
    }

    if (paramStartDate && paramEndDate) {
      const start = parseDateFromDB(paramStartDate);
      const end = parseDateFromDB(paramEndDate);
      if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
        setPeriod('custom');
        setPeriodOffset(0);
        setCustomStartDate(start);
        setCustomEndDate(end);
        consumed = true;
      }
    }

    // Parametreleri temizle - tekrar tetiklenmesin
    if (consumed) {
      router.setParams({ tab: undefined as any, startDate: undefined as any, endDate: undefined as any });
    }
  }, [tab, paramStartDate, paramEndDate]);

  // Özel tarih aralığı için state'ler
  const [customStartDate, setCustomStartDate] = useState<Date>(new Date());
  const [customEndDate, setCustomEndDate] = useState<Date>(new Date());
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);

  // Hızlı dönem seçimi için state'ler
  const [showYearPicker, setShowYearPicker] = useState(false);
  const [showMonthYearPicker, setShowMonthYearPicker] = useState(false);
  const [showDayPicker, setShowDayPicker] = useState(false);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  // Verileri cek
  const { data: hesaplar } = useHesaplar();
  const totalBalance = useTotalBalance();
  const { data: cariler } = useCariler();
  const { data: personelList } = usePersonelList();
  const { currency: baseCurrency } = useSettings();
  const { data: exchangeRatesData } = useExchangeRates();
  const exchangeRates = exchangeRatesData?.rates;

  // Ana sayfa ile senkronize finansal özet (birikim hesapları hariç, döviz çevrimi yapılmış)
  const financialSummary = useFinancialSummary();

  // Cari ve personel özetleri artık financialSummary'den geliyor (döviz çevrimi dahil)
  const totalReceivables = financialSummary.receivables.cari;
  const totalPayables = financialSummary.payables.cari;
  const personelReceivables = financialSummary.receivables.personel;
  const personelDebt = financialSummary.payables.personel;

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
  } = getDateRangeLabel(period, periodOffset, customRange);

  // Kategori raporları
  const giderRaporu = useCategoryReport('gider', {
    startDate,
    endDate,
  });

  const gelirRaporu = useCategoryReport('gelir', {
    startDate,
    endDate,
  });

  // Pull-to-refresh (manuel state — arka plan refetch'te spinner gösterme)
  const [isRefreshing, setIsRefreshing] = useState(false);
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([giderRaporu.refetch(), gelirRaporu.refetch()]);
    } finally {
      setIsRefreshing(false);
    }
  }, [giderRaporu.refetch, gelirRaporu.refetch]);

  // Cari ve Personel işlemleri
  const { data: cariIslemler = [], isLoading: cariIslemlerLoading } = useIslemlerByCari(selectedCariId || '');
  const { data: personelIslemler = [], isLoading: personelIslemlerLoading } = useIslemlerByPersonel(selectedPersonelId || '');

  // Dönem içi cari işlemleri
  const filteredCariIslemler = useMemo(() => {
    if (!cariIslemler) return [];
    return cariIslemler.filter((islem) => {
      const islemDate = islem.date;
      return islemDate >= startDate && islemDate <= endDate;
    });
  }, [cariIslemler, startDate, endDate]);

  // Dönem içi personel işlemleri
  const filteredPersonelIslemler = useMemo(() => {
    if (!personelIslemler) return [];
    return personelIslemler.filter((islem) => {
      const islemDate = islem.date;
      return islemDate >= startDate && islemDate <= endDate;
    });
  }, [personelIslemler, startDate, endDate]);

  // Karşılaştırma için son 3 ay verileri
  const month1Summary = useMonthSummary('monthly', -2);
  const month2Summary = useMonthSummary('monthly', -1);
  const month3Summary = useMonthSummary('monthly', 0);

  // Seçili cari ve personel
  const selectedCari = cariler?.find((c) => c.id === selectedCariId) || null;
  const selectedPersonel = personelList?.find((p) => p.id === selectedPersonelId) || null;

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

  // Hızlı dönem seçimi için fonksiyonlar
  const handlePeriodLabelPress = () => {
    switch (period) {
      case 'yearly':
        setShowYearPicker(true);
        break;
      case 'monthly':
      case 'weekly': {
        // Mevcut tarihten yılı al ve selectedYear'ı ayarla
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth();
        // periodOffset'ten mevcut seçili yılı hesapla
        const targetDate = new Date(currentYear, currentMonth + periodOffset, 1);
        setSelectedYear(targetDate.getFullYear());
        setShowMonthYearPicker(true);
        break;
      }
      case 'daily':
        setShowDayPicker(true);
        break;
    }
  };

  // Yıl seçildiğinde offset hesapla
  const goToYear = (year: number) => {
    const currentYear = new Date().getFullYear();
    setPeriodOffset(year - currentYear);
    setShowYearPicker(false);
  };

  // Ay seçildiğinde offset hesapla
  const goToMonth = (year: number, month: number) => {
    const now = new Date();
    const monthsDiff = (year - now.getFullYear()) * 12 + (month - now.getMonth());
    setPeriodOffset(monthsDiff);
    setShowMonthYearPicker(false);
  };

  // Gün seçildiğinde offset hesapla
  const goToDay = (date: Date) => {
    const now = new Date();
    // Sadece gün farkını hesapla (saat farkını yoksay)
    const nowMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dateMidnight = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const daysDiff = Math.round((dateMidnight.getTime() - nowMidnight.getTime()) / (1000 * 60 * 60 * 24));
    setPeriodOffset(daysDiff);
    setShowDayPicker(false);
  };

  // Haftalık mod için - ayın ilk haftasına git
  const goToWeekOfMonth = (year: number, month: number) => {
    const now = new Date();
    const nowMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    // Seçilen ayın ilk günü
    const firstDayOfMonth = new Date(year, month, 1);
    // Haftalık offset hesapla
    const daysDiff = Math.round((firstDayOfMonth.getTime() - nowMidnight.getTime()) / (1000 * 60 * 60 * 24));
    const weeksDiff = Math.floor(daysDiff / 7);
    setPeriodOffset(weeksDiff);
    setShowMonthYearPicker(false);
  };

  // Hesaplamalar - Genel sekmesi için (useFinancialSummary ile senkronize)
  // Hesaplar: pozitif bakiyeli hesaplar (birikim hariç)
  // Alacaklar: cari + personel alacakları
  // Borçlar: cari + personel + hesap borçları (eksi bakiyeli hesaplar dahil)
  const totalAccounts = financialSummary.accounts;
  const totalReceivablesAll = financialSummary.receivables.total;
  const totalPayablesAll = financialSummary.payables.total;
  const netValue = financialSummary.generalStatus;
  const totalPositive = totalAccounts + totalReceivablesAll;
  const totalAll = totalPositive + totalPayablesAll;
  const positivePercent = totalAll > 0 ? (totalPositive / totalAll) * 100 : 50;

  // Genel Sekme İçeriği
  const renderGenelTab = () => (
    <>
      {/* Genel Durum Özet Kartı - En Üstte */}
      <View style={styles.section}>
        <Card style={styles.heroCard}>
          {/* Header */}
          <View style={styles.heroHeader}>
            <Text variant="label" color="secondary">
              {t('reports:summary.generalStatus')}
            </Text>
            <View style={styles.heroBadge}>
              <Text style={styles.heroBadgeText}>{t('reports:period.instant')}</Text>
            </View>
          </View>

          {/* Main Value */}
          <View style={styles.heroMainValue}>
            <Text
              style={[
                styles.heroBigNumber,
                { color: netValue >= 0 ? colors.success : colors.error },
              ]}
            >
              {netValue >= 0 ? '+' : ''}{formatCurrency(netValue, baseCurrency)}
            </Text>
            <Text variant="caption" color="secondary">
              {t('reports:summary.netValue')}
            </Text>
          </View>

          {/* Progress Bar */}
          <View style={styles.heroProgressContainer}>
            <View style={styles.heroProgressBar}>
              <View
                style={[
                  styles.heroProgressFill,
                  styles.heroProgressGreen,
                  { width: `${positivePercent}%` },
                ]}
              />
              <View
                style={[
                  styles.heroProgressFill,
                  styles.heroProgressRed,
                  { width: `${100 - positivePercent}%` },
                ]}
              />
            </View>
          </View>

          {/* Details Row - 3 columns like dashboard */}
          <View style={styles.heroDetailsRowThree}>
            <View style={styles.heroDetailItemThree}>
              <View style={styles.heroDetailHeader}>
                <View style={[styles.heroDotIndicator, { backgroundColor: colors.success }]} />
                <Text variant="caption" color="secondary">
                  {t('common:dashboard.accounts')}
                </Text>
              </View>
              <Text style={[styles.heroDetailValue, { color: colors.success }]}>
                {formatCurrency(totalAccounts, baseCurrency)}
              </Text>
            </View>

            <View style={styles.heroDetailDivider} />

            <View style={styles.heroDetailItemThree}>
              <View style={styles.heroDetailHeader}>
                <View style={[styles.heroDotIndicator, { backgroundColor: colors.info }]} />
                <Text variant="caption" color="secondary">
                  {t('common:dashboard.receivables')}
                </Text>
              </View>
              <Text style={[styles.heroDetailValue, { color: colors.info }]}>
                {formatCurrency(totalReceivablesAll, baseCurrency)}
              </Text>
            </View>

            <View style={styles.heroDetailDivider} />

            <View style={[styles.heroDetailItemThree, { alignItems: 'flex-end' }]}>
              <View style={styles.heroDetailHeader}>
                <Text variant="caption" color="secondary">
                  {t('common:dashboard.payables')}
                </Text>
                <View style={[styles.heroDotIndicator, { backgroundColor: colors.error }]} />
              </View>
              <Text style={[styles.heroDetailValue, { color: colors.error }]}>
                {formatCurrency(totalPayablesAll, baseCurrency)}
              </Text>
            </View>
          </View>
        </Card>
      </View>

      {/* Hesap Bakiyeleri (Kredi kartları hariç) */}
      {(() => {
        const normalHesaplar = hesaplar?.filter(h => h.type !== 'kredi_karti') || [];
        const krediKartiHesaplar = hesaplar?.filter(h => h.type === 'kredi_karti') || [];

        // Döviz çevrimi ile toplam hesapla
        const convertBalance = (h: typeof normalHesaplar[0]) => {
          const balance = toNumber(h.balance);
          const currency = h.currency || baseCurrency;
          if (currency === baseCurrency) return balance;
          return convertCurrency(balance, currency, baseCurrency, exchangeRates) ?? balance;
        };

        const normalHesaplarToplam = normalHesaplar.reduce((acc, h) => acc + convertBalance(h), 0);
        const krediKartiToplam = krediKartiHesaplar.reduce((acc, h) => acc + convertBalance(h), 0);

        return (
          <>
            <View style={styles.section}>
              <Text variant="label" color="secondary" style={styles.sectionTitle}>
                {t('reports:sections.accountBalances')}
              </Text>
              <Card>
                <View style={styles.accountHeader}>
                  <Wallet size={20} color={colors.primary} />
                  <Text variant="body" style={{ marginLeft: spacing.sm }}>
                    {t('reports:counts.account', { count: normalHesaplar.length })}
                  </Text>
                  <View style={{ flex: 1 }} />
                  <Text variant="h3" color={normalHesaplarToplam >= 0 ? 'primary' : 'error'}>
                    {formatCurrency(normalHesaplarToplam, baseCurrency)}
                  </Text>
                </View>
                {normalHesaplar.map((hesap) => {
                  const hesapCurrency = hesap.currency || baseCurrency;
                  const balance = toNumber(hesap.balance);
                  return (
                    <View key={hesap.id} style={styles.accountItem}>
                      <Text variant="body">{hesap.name}</Text>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text variant="label" color={balance >= 0 ? 'primary' : 'error'}>
                          {formatCurrency(balance, hesapCurrency)}
                        </Text>
                        {hesapCurrency !== baseCurrency && exchangeRates && balance !== 0 && (
                          <Text variant="caption" color="secondary">
                            ~{formatCurrency(convertBalance(hesap), baseCurrency)}
                          </Text>
                        )}
                      </View>
                    </View>
                  );
                })}
              </Card>
            </View>

            {/* Kredi Kartı Borçları */}
            {krediKartiHesaplar.length > 0 && (
              <View style={styles.section}>
                <Text variant="label" color="secondary" style={styles.sectionTitle}>
                  {t('reports:sections.creditCardBalances')}
                </Text>
                <Card>
                  <View style={styles.accountHeader}>
                    <CreditCard size={20} color={colors.error} />
                    <Text variant="body" style={{ marginLeft: spacing.sm }}>
                      {t('reports:counts.creditCard', { count: krediKartiHesaplar.length })}
                    </Text>
                    <View style={{ flex: 1 }} />
                    <Text variant="h3" color="error">
                      {formatCurrency(Math.abs(krediKartiToplam), baseCurrency)}
                    </Text>
                  </View>
                  {krediKartiHesaplar.map((hesap) => {
                    const hesapCurrency = hesap.currency || baseCurrency;
                    const balance = toNumber(hesap.balance);
                    return (
                      <View key={hesap.id} style={styles.accountItem}>
                        <Text variant="body">{hesap.name}</Text>
                        <View style={{ alignItems: 'flex-end' }}>
                          <Text variant="label" color="error">
                            {formatCurrency(Math.abs(balance), hesapCurrency)}
                          </Text>
                          {hesapCurrency !== baseCurrency && exchangeRates && balance !== 0 && (
                            <Text variant="caption" color="secondary">
                              ~{formatCurrency(Math.abs(convertBalance(hesap)), baseCurrency)}
                            </Text>
                          )}
                        </View>
                      </View>
                    );
                  })}
                </Card>
              </View>
            )}
          </>
        );
      })()}

      {/* Cari Durum */}
      <View style={styles.section}>
        <Text variant="label" color="secondary" style={styles.sectionTitle}>
          {t('reports:sections.clientStatus')}
        </Text>
        <TouchableOpacity activeOpacity={0.8} onPress={() => router.push('/cariler')}>
          <Card>
            <View style={styles.accountHeader}>
              <Building2 size={20} color={colors.warning} />
              <Text variant="body" style={{ marginLeft: spacing.sm }}>
                {t('reports:counts.client', { count: cariler?.length ?? 0 })}
              </Text>
            </View>
            <View style={styles.cariSummaryRow}>
              <View style={styles.cariSummaryItem}>
                <Text variant="caption" color="secondary">
                  {t('reports:summary.receivables')}
                </Text>
                <Text variant="h3" color="success">
                  {formatCurrency(totalReceivables, baseCurrency)}
                </Text>
              </View>
              <View style={styles.cariSummaryItem}>
                <Text variant="caption" color="secondary">
                  {t('reports:summary.payables')}
                </Text>
                <Text variant="h3" color="error">
                  {formatCurrency(totalPayables, baseCurrency)}
                </Text>
              </View>
            </View>
            <View style={styles.divider} />
            <View style={styles.netRow}>
              <Text variant="body" color="secondary">
                {t('reports:summary.netStatus')}
              </Text>
              <Text variant="h3" color={totalReceivables - totalPayables >= 0 ? 'success' : 'error'}>
                {formatCurrency(totalReceivables - totalPayables, baseCurrency)}
              </Text>
            </View>
          </Card>
        </TouchableOpacity>
      </View>

      {/* Personel Durum */}
      <View style={[styles.section, { marginBottom: spacing['3xl'] }]}>
        <Text variant="label" color="secondary" style={styles.sectionTitle}>
          {t('reports:sections.personnelStatus')}
        </Text>
        <TouchableOpacity activeOpacity={0.8} onPress={() => router.push('/personel')}>
          <Card>
            <View style={styles.accountHeader}>
              <Users size={20} color={colors.info} />
              <Text variant="body" style={{ marginLeft: spacing.sm }}>
                {t('reports:counts.personnel', { count: personelList?.length ?? 0 })}
              </Text>
            </View>
            <View style={styles.cariSummaryRow}>
              <View style={styles.cariSummaryItem}>
                <Text variant="caption" color="secondary">
                  {t('reports:summary.personnelReceivables')}
                </Text>
                <Text variant="h3" color="success">
                  {formatCurrency(personelReceivables, baseCurrency)}
                </Text>
              </View>
              <View style={styles.cariSummaryItem}>
                <Text variant="caption" color="secondary">
                  {t('reports:summary.totalPersonnelDebt')}
                </Text>
                <Text variant="h3" color="error">
                  {formatCurrency(personelDebt, baseCurrency)}
                </Text>
              </View>
            </View>
            <View style={styles.divider} />
            <View style={styles.netRow}>
              <Text variant="body" color="secondary">
                {t('reports:summary.netStatus')}
              </Text>
              <Text variant="h3" color={personelReceivables - personelDebt >= 0 ? 'success' : 'error'}>
                {formatCurrency(personelReceivables - personelDebt, baseCurrency)}
              </Text>
            </View>
          </Card>
        </TouchableOpacity>
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
            {t('reports:summary.totalExpense')}
          </Text>
          <Text variant="h1" color="error" style={styles.totalAmount}>
            {formatCurrency(giderRaporu.totalAmount)}
          </Text>
          <Text variant="caption" color="secondary">
            {t('reports:counts.transaction', { count: giderRaporu.items.reduce((acc, item) => acc + item.count, 0) })}
          </Text>
        </Card>
      </View>

      {/* Kategori Dağılımı */}
      <View style={styles.section}>
        <Text variant="label" color="secondary" style={styles.sectionTitle}>
          {t('reports:sections.categoryDistribution')}
        </Text>

        {giderRaporu.isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : giderRaporu.items.length === 0 ? (
          <Card style={styles.emptyCard}>
            <Text variant="body" color="secondary" style={{ textAlign: 'center' }}>
              {t('reports:empty.noExpenseTransactions')}
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
            {t('reports:summary.totalIncome')}
          </Text>
          <Text variant="h1" color="success" style={styles.totalAmount}>
            {formatCurrency(gelirRaporu.totalAmount)}
          </Text>
          <Text variant="caption" color="secondary">
            {t('reports:counts.transaction', { count: gelirRaporu.items.reduce((acc, item) => acc + item.count, 0) })}
          </Text>
        </Card>
      </View>

      {/* Kategori Dağılımı */}
      <View style={styles.section}>
        <Text variant="label" color="secondary" style={styles.sectionTitle}>
          {t('reports:sections.categoryDistribution')}
        </Text>

        {gelirRaporu.isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : gelirRaporu.items.length === 0 ? (
          <Card style={styles.emptyCard}>
            <Text variant="body" color="secondary" style={{ textAlign: 'center' }}>
              {t('reports:empty.noIncomeTransactions')}
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

  // Cari Raporu Tab İçeriği
  const renderCariTab = () => (
    <>
      <View style={styles.section}>
        <EntityPicker
          type="cari"
          entities={cariler || []}
          selectedId={selectedCariId}
          onSelect={setSelectedCariId}
        />
      </View>

      {selectedCariId && selectedCari ? (
        <>
          <View style={styles.section}>
            <EntitySummaryCard
              type="cari"
              entity={selectedCari}
              transactions={filteredCariIslemler}
              periodLabel={periodLabel}
            />
          </View>

          <View style={styles.section}>
            <Text variant="label" color="secondary" style={styles.sectionTitle}>
              {t('reports:sections.transactions')}
            </Text>
            {cariIslemlerLoading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={colors.primary} />
              </View>
            ) : (
              <EntityTransactionList
                transactions={filteredCariIslemler}
                maxItems={20}
              />
            )}
          </View>
        </>
      ) : (
        <View style={styles.section}>
          <Card style={styles.emptyCard}>
            <Building2 size={48} color={colors.textMuted} style={{ alignSelf: 'center', marginBottom: spacing.md }} />
            <Text variant="body" color="secondary" style={{ textAlign: 'center' }}>
              {t('reports:entityPicker.selectClientPrompt')}
            </Text>
          </Card>
        </View>
      )}
    </>
  );

  // Personel Raporu Tab İçeriği
  const renderPersonelTab = () => (
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
                <ActivityIndicator size="large" color={colors.primary} />
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

  // Karşılaştırma Tab İçeriği
  const renderKarsilastirmaTab = () => {
    const COMPARISON_OPTIONS = [
      { label: t('reports:summary.income'), value: 'income' },
      { label: t('reports:summary.expense'), value: 'expense' },
      { label: t('reports:comparison.net'), value: 'net' },
    ];

    // Summary verilerini normalize et
    const getSummaryData = (summary: typeof month1Summary) => ({
      income: summary.data?.income ?? 0,
      expense: summary.data?.expense ?? 0,
      periodLabel: summary.periodLabel,
    });

    const month1Data = getSummaryData(month1Summary);
    const month2Data = getSummaryData(month2Summary);
    const month3Data = getSummaryData(month3Summary);

    // Chart için veri hazırla
    const getComparisonData = () => {
      const getData = (summary: { income: number; expense: number; periodLabel: string }, isCurrentPeriod: boolean) => {
        let value = 0;
        switch (comparisonMetric) {
          case 'income':
            value = summary.income;
            break;
          case 'expense':
            value = summary.expense;
            break;
          case 'net':
            value = summary.income - summary.expense;
            break;
        }
        return {
          label: summary.periodLabel,
          value,
          isCurrentPeriod,
        };
      };

      return [
        getData(month1Data, false),
        getData(month2Data, false),
        getData(month3Data, true),
      ];
    };

    const chartData = getComparisonData();
    const chartColor = comparisonMetric === 'expense' ? colors.error : colors.success;

    return (
      <>
        <View style={styles.section}>
          <TabFilter
            options={COMPARISON_OPTIONS}
            value={comparisonMetric}
            onChange={(v) => setComparisonMetric(v as 'income' | 'expense' | 'net')}
          />
        </View>

        <View style={styles.section}>
          <Card style={styles.comparisonCard}>
            <PeriodComparisonChart
              data={chartData}
              title={t('reports:comparison.last3Months')}
              color={chartColor}
              showTrend={true}
              height={200}
            />
          </Card>
        </View>

        {/* Detay Tablo */}
        <View style={styles.section}>
          <Text variant="label" color="secondary" style={styles.sectionTitle}>
            {t('reports:comparison.details')}
          </Text>
          <Card>
            <View style={styles.comparisonTable}>
              {/* Başlık satırı */}
              <View style={[styles.comparisonRow, styles.comparisonHeaderRow]}>
                <Text variant="caption" color="secondary" style={styles.comparisonCell}>
                  {t('reports:comparison.period')}
                </Text>
                <Text variant="caption" color="secondary" style={styles.comparisonCell}>
                  {t('reports:summary.income')}
                </Text>
                <Text variant="caption" color="secondary" style={styles.comparisonCell}>
                  {t('reports:summary.expense')}
                </Text>
                <Text variant="caption" color="secondary" style={styles.comparisonCell}>
                  {t('reports:comparison.net')}
                </Text>
              </View>
              {/* Veri satırları */}
              {[month1Data, month2Data, month3Data].map((summary, index) => {
                const net = summary.income - summary.expense;
                const isCurrentMonth = index === 2;
                return (
                  <View
                    key={index}
                    style={[
                      styles.comparisonRow,
                      isCurrentMonth && styles.comparisonCurrentRow,
                    ]}
                  >
                    <Text
                      variant="body"
                      style={[styles.comparisonCell, isCurrentMonth && styles.comparisonCurrentText]}
                    >
                      {summary.periodLabel}
                    </Text>
                    <Text variant="body" color="success" style={styles.comparisonCell}>
                      {formatCurrency(summary.income)}
                    </Text>
                    <Text variant="body" color="error" style={styles.comparisonCell}>
                      {formatCurrency(summary.expense)}
                    </Text>
                    <Text
                      variant="body"
                      color={net >= 0 ? 'success' : 'error'}
                      style={styles.comparisonCell}
                    >
                      {net >= 0 ? '+' : ''}{formatCurrency(net)}
                    </Text>
                  </View>
                );
              })}
            </View>
          </Card>
        </View>
      </>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} colors={[colors.primary]} tintColor={colors.primary} />
        }
      >
        {/* Tab Filter */}
        <View style={styles.tabContainer}>
          <TabFilter
            options={TAB_OPTIONS}
            value={activeTab}
            onChange={(value) => setActiveTab(value as TabType)}
          />
        </View>

        {/* Dönem Seçici - Genel ve Karşılaştırma hariç tüm sekmelerde göster */}
        {activeTab !== 'genel' && activeTab !== 'karsilastirma' && (
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
              <TouchableOpacity
                onPress={handlePeriodLabelPress}
                style={styles.periodLabelButton}
                activeOpacity={0.7}
              >
                <Text variant="body" style={styles.periodLabel}>
                  {periodLabel}
                </Text>
              </TouchableOpacity>
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
                  {t('reports:period.startDate')}
                </Text>
                <Text variant="body">{formatDateNative(customStartDate)}</Text>
              </TouchableOpacity>
              <Text variant="body" color="secondary">
                -
              </Text>
              <TouchableOpacity
                style={styles.datePickerButton}
                onPress={() => setShowEndPicker(true)}
              >
                <Text variant="caption" color="secondary">
                  {t('reports:period.endDate')}
                </Text>
                <Text variant="body">{formatDateNative(customEndDate)}</Text>
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
                      {showStartPicker ? t('reports:period.startDateTitle') : t('reports:period.endDateTitle')}
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
                      locale={locale}
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
                    {t('common:buttons.ok')}
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
        )}

        {/* Aktif Sekme İçeriği */}
        {activeTab === 'genel' && renderGenelTab()}
        {activeTab === 'gider' && renderGiderTab()}
        {activeTab === 'gelir' && renderGelirTab()}
        {activeTab === 'cari' && renderCariTab()}
        {activeTab === 'personel' && renderPersonelTab()}
        {activeTab === 'karsilastirma' && renderKarsilastirmaTab()}
      </ScrollView>

      {/* Yıl Seçici Modal */}
      <Modal visible={showYearPicker} transparent animationType="slide">
        <Pressable
          style={styles.pickerModalOverlay}
          onPress={() => setShowYearPicker(false)}
        >
          <Pressable
            style={styles.pickerModalContent}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.pickerModalHeader}>
              <Text variant="h3">{t('reports:period.selectYear')}</Text>
              <TouchableOpacity onPress={() => setShowYearPicker(false)}>
                <X size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.yearPickerScroll} showsVerticalScrollIndicator={false}>
              {Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - 5 + i).map((year) => (
                <TouchableOpacity
                  key={year}
                  style={[
                    styles.yearPickerItem,
                    year === new Date().getFullYear() + periodOffset && styles.yearPickerItemActive,
                  ]}
                  onPress={() => goToYear(year)}
                >
                  <Text
                    variant="body"
                    style={[
                      styles.yearPickerText,
                      year === new Date().getFullYear() + periodOffset && styles.yearPickerTextActive,
                    ]}
                  >
                    {year}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Ay + Yıl Seçici Modal */}
      <Modal visible={showMonthYearPicker} transparent animationType="slide">
        <Pressable
          style={styles.pickerModalOverlay}
          onPress={() => setShowMonthYearPicker(false)}
        >
          <Pressable
            style={styles.pickerModalContent}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.pickerModalHeader}>
              <Text variant="h3">{t('reports:period.selectMonthYear')}</Text>
              <TouchableOpacity onPress={() => setShowMonthYearPicker(false)}>
                <X size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            {/* Yıl Seçici */}
            <View style={styles.monthYearSelector}>
              <TouchableOpacity
                style={styles.yearNavButton}
                onPress={() => setSelectedYear(selectedYear - 1)}
              >
                <ChevronLeft size={24} color={colors.primary} />
              </TouchableOpacity>
              <Text variant="h3" style={styles.selectedYearText}>
                {selectedYear}
              </Text>
              <TouchableOpacity
                style={styles.yearNavButton}
                onPress={() => setSelectedYear(selectedYear + 1)}
              >
                <ChevronRight size={24} color={colors.primary} />
              </TouchableOpacity>
            </View>

            {/* Ay Grid */}
            <View style={styles.monthGrid}>
              {Array.from({ length: 12 }, (_, i) => {
                const monthDate = new Date(selectedYear, i, 1);
                const monthName = monthDate.toLocaleDateString(locale, { month: 'short' });
                const now = new Date();
                const isCurrentMonth = selectedYear === now.getFullYear() && i === now.getMonth();
                return (
                  <TouchableOpacity
                    key={i}
                    style={[styles.monthItem, isCurrentMonth && styles.monthItemActive]}
                    onPress={() => period === 'weekly' ? goToWeekOfMonth(selectedYear, i) : goToMonth(selectedYear, i)}
                  >
                    <Text
                      variant="body"
                      style={[styles.monthItemText, isCurrentMonth && styles.monthItemTextActive]}
                    >
                      {monthName}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Günlük Tarih Seçici - iOS */}
      {Platform.OS === 'ios' && showDayPicker && (
        <Modal visible={showDayPicker} transparent animationType="slide">
          <Pressable
            style={styles.pickerModalOverlay}
            onPress={() => setShowDayPicker(false)}
          >
            <Pressable
              style={styles.pickerModalContent}
              onPress={(e) => e.stopPropagation()}
            >
              <View style={styles.pickerModalHeader}>
                <Text variant="h3">{t('reports:period.selectDate')}</Text>
                <TouchableOpacity onPress={() => setShowDayPicker(false)}>
                  <X size={24} color={colors.text} />
                </TouchableOpacity>
              </View>
              <View style={styles.datePickerWrapper}>
                <DateTimePicker
                  value={(() => {
                    const now = new Date();
                    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + periodOffset);
                    return date;
                  })()}
                  mode="date"
                  display="inline"
                  onChange={(event, date) => {
                    if (date) {
                      goToDay(date);
                    }
                  }}
                  locale={locale}
                  themeVariant="light"
                  accentColor={colors.primary}
                  style={{ height: 350 }}
                />
              </View>
              <Button
                variant="primary"
                onPress={() => setShowDayPicker(false)}
                style={{ marginTop: spacing.md }}
              >
                {t('common:buttons.ok')}
              </Button>
            </Pressable>
          </Pressable>
        </Modal>
      )}

      {/* Günlük Tarih Seçici - Android */}
      {Platform.OS === 'android' && showDayPicker && (
        <DateTimePicker
          value={(() => {
            const now = new Date();
            const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + periodOffset);
            return date;
          })()}
          mode="date"
          display="default"
          onChange={(event, date) => {
            setShowDayPicker(false);
            if (event.type === 'set' && date) {
              goToDay(date);
            }
          }}
        />
      )}
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
  // Hero Card (Genel Durum Özet) stilleri
  heroCard: {
    padding: spacing.xl,
  },
  heroHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  heroBadge: {
    backgroundColor: colors.primaryLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 12,
  },
  heroBadgeText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.primary,
  },
  heroMainValue: {
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  heroBigNumber: {
    fontSize: 32,
    fontWeight: '700',
    letterSpacing: -1,
    marginBottom: 4,
  },
  heroProgressContainer: {
    marginBottom: spacing.lg,
  },
  heroProgressBar: {
    flexDirection: 'row',
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: colors.border,
  },
  heroProgressFill: {
    height: '100%',
  },
  heroProgressGreen: {
    backgroundColor: colors.success,
    borderTopLeftRadius: 4,
    borderBottomLeftRadius: 4,
  },
  heroProgressRed: {
    backgroundColor: colors.error,
    borderTopRightRadius: 4,
    borderBottomRightRadius: 4,
  },
  heroDetailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  heroDetailsRowThree: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heroDetailItem: {
    flex: 1,
  },
  heroDetailItemThree: {
    flex: 1,
    alignItems: 'center',
  },
  heroDetailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: spacing.xs,
  },
  heroDotIndicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  heroDetailDivider: {
    width: 1,
    height: 50,
    backgroundColor: colors.border,
    marginHorizontal: spacing.md,
  },
  heroDetailValue: {
    fontSize: 15,
    fontWeight: '600',
  },
  // Karşılaştırma Tab stilleri
  comparisonCard: {
    padding: spacing.lg,
  },
  comparisonTable: {
    gap: 0,
  },
  comparisonRow: {
    flexDirection: 'row',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  comparisonHeaderRow: {
    backgroundColor: colors.surfaceLight,
    borderBottomWidth: 2,
  },
  comparisonCurrentRow: {
    backgroundColor: colors.primaryLight,
  },
  comparisonCell: {
    flex: 1,
    fontSize: 12,
  },
  comparisonCurrentText: {
    fontWeight: '600',
    color: colors.primary,
  },
  // Hızlı dönem seçici stilleri
  periodLabelButton: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: 8,
    backgroundColor: colors.primaryLight,
  },
  pickerModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  pickerModalContent: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: spacing.lg,
    maxHeight: '70%',
  },
  pickerModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  yearPickerScroll: {
    maxHeight: 300,
  },
  yearPickerItem: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: 8,
    marginBottom: spacing.xs,
  },
  yearPickerItemActive: {
    backgroundColor: colors.primaryLight,
  },
  yearPickerText: {
    textAlign: 'center',
    fontSize: 18,
  },
  yearPickerTextActive: {
    color: colors.primary,
    fontWeight: '600',
  },
  monthYearSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
    gap: spacing.lg,
  },
  yearNavButton: {
    padding: spacing.sm,
  },
  selectedYearText: {
    minWidth: 80,
    textAlign: 'center',
  },
  monthGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  monthItem: {
    width: '30%',
    paddingVertical: spacing.md,
    marginBottom: spacing.sm,
    borderRadius: 8,
    alignItems: 'center',
  },
  monthItemActive: {
    backgroundColor: colors.primaryLight,
  },
  monthItemText: {
    fontSize: 14,
  },
  monthItemTextActive: {
    color: colors.primary,
    fontWeight: '600',
  },
});
