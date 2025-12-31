import { useState } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Modal, Pressable, Platform } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  Plus,
  ArrowUpRight,
  ArrowDownLeft,
  ArrowLeftRight,
  History,
  AlertTriangle,
  Send,
  Users,
  UserCheck,
  X,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react-native';
import { Text, Card, TabFilter, ExpandableCard, Button, EmptyState } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing } from '@/constants/spacing';
import { formatCurrency, toNumber } from '@/lib/currency';
import { formatDateForDB } from '@/lib/date';
import { getHesapIcon } from '@/lib/icons';
import { useHesaplar, useTotalBalance } from '@/hooks/useHesaplar';
import { useFinancialSummary } from '@/hooks/useFinancialSummary';
import { useMonthSummary, PeriodType } from '@/hooks/useIslemler';
import { useAuthContext } from '@/contexts/AuthContext';

const periodOptions = [
  { label: 'Yıllık', value: 'yearly' },
  { label: 'Aylık', value: 'monthly' },
  { label: 'Haftalık', value: 'weekly' },
  { label: 'Günlük', value: 'daily' },
  { label: 'Özel', value: 'custom' },
];

export default function HomePage() {
  const router = useRouter();
  const [period, setPeriod] = useState<PeriodType>('monthly');
  const [periodOffset, setPeriodOffset] = useState(0);
  const [isCancelling, setIsCancelling] = useState(false);
  const [odemeModalVisible, setOdemeModalVisible] = useState(false);
  const [selectedHesapId, setSelectedHesapId] = useState<string | null>(null);
  const [expandedHesapId, setExpandedHesapId] = useState<string | null>(null);

  // Özel tarih aralığı için state'ler
  const [customStartDate, setCustomStartDate] = useState<Date>(new Date());
  const [customEndDate, setCustomEndDate] = useState<Date>(new Date());
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);

  const { isletme, cancelAccountDeletion } = useAuthContext();

  // Gerçek veriler
  const { data: hesaplar, isLoading: hesaplarLoading } = useHesaplar();

  const handleOdemePress = (hesapId: string) => {
    setSelectedHesapId(hesapId);
    setOdemeModalVisible(true);
  };

  const handleOdemeSelect = (type: 'cari' | 'personel') => {
    setOdemeModalVisible(false);
    // Eğer hesap seçili değilse ilk hesabı kullan
    const hesapIdToUse = selectedHesapId || (hesaplar && hesaplar.length > 0 ? hesaplar[0].id : null);
    const hesapParam = hesapIdToUse ? `?hesap_id=${hesapIdToUse}` : '';
    if (type === 'cari') {
      router.push(`/islemler/cariOdeme${hesapParam}` as any);
    } else {
      router.push(`/islemler/personelOdeme${hesapParam}` as any);
    }
  };
  const totalBalance = useTotalBalance();
  const { payables, receivables } = useFinancialSummary();
  const customRange = period === 'custom' ? {
    startDate: formatDateForDB(customStartDate),
    endDate: formatDateForDB(customEndDate),
  } : undefined;
  const { data: monthSummary, periodLabel } = useMonthSummary(period, periodOffset, customRange);

  const totalIncome = monthSummary?.income ?? 0;
  const totalExpense = monthSummary?.expense ?? 0;
  const netProfit = totalIncome - totalExpense;

  // Silme planlanmış mı kontrol et
  const scheduledDeletion = isletme?.scheduled_deletion_at;
  const deletionDate = scheduledDeletion ? new Date(scheduledDeletion) : null;
  const daysRemaining = deletionDate
    ? Math.ceil((deletionDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : 0;

  const handleCancelDeletion = () => {
    Alert.alert(
      'Silme Talebini Iptal Et',
      'Hesap silme talebinizi iptal etmek istediginize emin misiniz?',
      [
        { text: 'Vazgec', style: 'cancel' },
        {
          text: 'Evet, Iptal Et',
          onPress: async () => {
            setIsCancelling(true);
            try {
              await cancelAccountDeletion();
              Alert.alert('Basarili', 'Hesap silme talebi iptal edildi.');
            } catch (error) {
              Alert.alert('Hata', 'Islem sirasinda bir hata olustu.');
            } finally {
              setIsCancelling(false);
            }
          },
        },
      ]
    );
  };


  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <Text variant="h2">Ana Sayfa</Text>
        </View>

        {/* Hesap Silme Uyarısı */}
        {scheduledDeletion && daysRemaining > 0 && (
          <View style={styles.deletionWarning}>
            <View style={styles.deletionWarningContent}>
              <AlertTriangle size={20} color={colors.surface} />
              <View style={styles.deletionWarningText}>
                <Text variant="body" style={{ color: colors.surface, fontWeight: '600' }}>
                  Hesabiniz {daysRemaining} gun icinde silinecek
                </Text>
                <Text variant="caption" style={{ color: colors.surface, opacity: 0.9 }}>
                  Vazgecmek icin asagidaki butona basin
                </Text>
              </View>
            </View>
            <Button
              variant="secondary"
              size="sm"
              onPress={handleCancelDeletion}
              loading={isCancelling}
              style={styles.cancelDeletionBtn}
            >
              Iptal Et
            </Button>
          </View>
        )}

        {/* Dönem Seçici */}
        <View style={styles.periodFilter}>
          <TabFilter
            options={periodOptions}
            value={period}
            onChange={(v) => {
              setPeriod(v as PeriodType);
              setPeriodOffset(0); // Dönem değiştiğinde offset'i sıfırla
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
                <Text variant="caption" color="secondary">Başlangıç</Text>
                <Text variant="body">{customStartDate.toLocaleDateString('tr-TR')}</Text>
              </TouchableOpacity>
              <Text variant="body" color="secondary">-</Text>
              <TouchableOpacity
                style={styles.datePickerButton}
                onPress={() => setShowEndPicker(true)}
              >
                <Text variant="caption" color="secondary">Bitiş</Text>
                <Text variant="body">{customEndDate.toLocaleDateString('tr-TR')}</Text>
              </TouchableOpacity>
            </View>
          )}
          {/* iOS için DateTimePicker Modal */}
          {Platform.OS === 'ios' && (showStartPicker || showEndPicker) && (
            <Modal
              visible={showStartPicker || showEndPicker}
              transparent
              animationType="slide"
            >
              <Pressable
                style={styles.datePickerModalOverlay}
                onPress={() => {
                  setShowStartPicker(false);
                  setShowEndPicker(false);
                }}
              >
                <Pressable style={styles.datePickerModalContent} onPress={(e) => e.stopPropagation()}>
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
                  Toplam Borçlar
                </Text>
                <Text variant="h3">
                  {formatCurrency(payables.total)}
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
                  Toplam Alacaklar
                </Text>
                <Text variant="h3">
                  {formatCurrency(receivables.total)}
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
                  Net Kar/Zarar
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
          </View>
          <View style={styles.quickActionsSecondRow}>
            <Button
              variant="outline"
              size="md"
              icon={<ArrowLeftRight size={18} color={colors.warning} />}
              onPress={() => router.push('/islemler/transfer')}
              style={styles.quickActionBtn}
            >
              Transfer
            </Button>
            <Button
              variant="outline"
              size="md"
              icon={<Send size={18} color={colors.orange} />}
              onPress={() => {
                setSelectedHesapId(null);
                setOdemeModalVisible(true);
              }}
              style={styles.quickActionBtn}
            >
              Odeme
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
                expanded={expandedHesapId === hesap.id}
                onToggle={() => setExpandedHesapId(expandedHesapId === hesap.id ? null : hesap.id)}
                header={
                  <View style={styles.hesapHeader}>
                    {getHesapIcon(hesap.type, 24)}
                    <View style={styles.hesapInfo}>
                      <Text variant="body">{hesap.name}</Text>
                      <Text
                        variant="h3"
                        color={toNumber(hesap.balance) >= 0 ? 'primary' : 'error'}
                      >
                        {formatCurrency(toNumber(hesap.balance))}
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
                    variant="secondary"
                    size="sm"
                    icon={<Send size={16} color={colors.orange} />}
                    onPress={() => handleOdemePress(hesap.id)}
                    style={styles.actionButton}
                  >
                    Odeme
                  </Button>
                </View>
                <View style={styles.hesapActionsSecondRow}>
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

      {/* Ödeme Seçim Modalı */}
      <Modal
        visible={odemeModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setOdemeModalVisible(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setOdemeModalVisible(false)}
        >
          <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <Text variant="h3">Ödeme Türü Seçin</Text>
              <TouchableOpacity onPress={() => setOdemeModalVisible(false)}>
                <X size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.modalOption}
              onPress={() => handleOdemeSelect('cari')}
            >
              <View style={[styles.modalOptionIcon, { backgroundColor: colors.orangeLight }]}>
                <Users size={24} color={colors.orange} />
              </View>
              <View style={styles.modalOptionText}>
                <Text variant="body">Cari Ödeme</Text>
                <Text variant="caption" color="secondary">Tedarikçiye ödeme yapın</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.modalOption}
              onPress={() => handleOdemeSelect('personel')}
            >
              <View style={[styles.modalOptionIcon, { backgroundColor: colors.orangeLight }]}>
                <UserCheck size={24} color={colors.orange} />
              </View>
              <View style={styles.modalOptionText}>
                <Text variant="body">Personel Ödeme</Text>
                <Text variant="caption" color="secondary">Personele maaş/avans ödeyin</Text>
              </View>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
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
  deletionWarning: {
    backgroundColor: colors.error,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    padding: spacing.md,
    borderRadius: 12,
    gap: spacing.md,
  },
  deletionWarningContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  deletionWarningText: {
    flex: 1,
  },
  cancelDeletionBtn: {
    alignSelf: 'flex-start',
  },
  periodFilter: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  periodNavigator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
    gap: spacing.md,
  },
  periodNavButton: {
    padding: spacing.xs,
    borderRadius: 8,
    backgroundColor: colors.surfaceLight,
  },
  periodLabel: {
    minWidth: 120,
    textAlign: 'center',
  },
  customDateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
    gap: spacing.md,
  },
  datePickerButton: {
    backgroundColor: colors.surfaceLight,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 8,
    alignItems: 'center',
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
    paddingBottom: spacing['2xl'],
  },
  datePickerModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  datePickerWrapper: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    overflow: 'hidden',
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
  quickActionsSecondRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.xl,
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
  hesapActionsSecondRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  actionButton: {
    flex: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: spacing.lg,
    width: '100%',
    maxWidth: 400,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  modalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: 12,
    backgroundColor: colors.surfaceLight,
    marginBottom: spacing.sm,
  },
  modalOptionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalOptionText: {
    flex: 1,
  },
});
