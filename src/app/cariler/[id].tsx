import { useState } from 'react';
import { View, StyleSheet, ScrollView, Alert, TouchableOpacity, Modal, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, Stack, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  ShoppingCart,
  Banknote,
  Receipt,
  Building2,
  User,
  Phone,
  CircleDollarSign,
  Pencil,
  Trash2,
  Zap,
  RotateCcw,
  MoreVertical,
  FileCheck,
  X,
  Share2,
} from 'lucide-react-native';
import { Text, Card, ExpandableCard, Button, EmptyState, IleriTarihliIslemlerSection, ArchivedBanner } from '@/components/ui';
import { BekleyenCeklerSection, CekKesSheet } from '@/components/cek';
import { QuickTransactionBar } from '@/components/transaction/QuickTransactionBar';
import { ExportSheet } from '@/components/export';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { formatCurrency, toNumber } from '@/lib/currency';
import { formatDateShort } from '@/lib/date';
import { useDateFormat } from '@/hooks/useDateFormat';
import { useSettings } from '@/hooks/useSettings';
import { useExchangeRates, convertCurrency } from '@/hooks/useExchangeRates';
import { useCari, useDeleteCari, useUpdateCari } from '@/hooks/useCariler';
import { useUnarchiveCari } from '@/hooks/useArchive';
import { useIslemlerByCari, useDeleteIslem } from '@/hooks/useIslemler';
import { useIleriTarihliIslemlerByCari } from '@/hooks/useIleriTarihliIslemler';
import { useCeklerByCari } from '@/hooks/useCekler';
import { IslemWithRelations } from '@/types/database';

export default function CariHareketleriPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { t } = useTranslation(['clients', 'common', 'errors', 'checks']);
  const { formatDateSmart } = useDateFormat();
  const { currency: baseCurrency } = useSettings();
  const { data: exchangeRatesData } = useExchangeRates();
  const exchangeRates = exchangeRatesData?.rates;

  const { data: cari, isLoading: cariLoading, refetch: refetchCari } = useCari(id!);
  const { data: islemler, isLoading: islemlerLoading } = useIslemlerByCari(id!);
  const { data: ileriTarihliIslemler, isLoading: ileriTarihliLoading } = useIleriTarihliIslemlerByCari(id!);
  const { data: bekleyenCekler, isLoading: ceklerLoading } = useCeklerByCari(id!);
  const deleteIslem = useDeleteIslem();
  const deleteCari = useDeleteCari();
  const updateCari = useUpdateCari();
  const unarchiveCari = useUnarchiveCari();

  const [expandedIslemId, setExpandedIslemId] = useState<string | null>(null);
  const [quickBarVisible, setQuickBarVisible] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showCekKesSheet, setShowCekKesSheet] = useState(false);
  const [showExportSheet, setShowExportSheet] = useState(false);
  const [editBalanceModalVisible, setEditBalanceModalVisible] = useState(false);
  const [newInitialBalance, setNewInitialBalance] = useState('');
  // Edit transaction state
  const [editTransactionId, setEditTransactionId] = useState<string | null>(null);
  const [showEditBar, setShowEditBar] = useState(false);

  // Başlangıç bakiyesini hesapla
  const calculateInitialBalance = () => {
    if (!cari || !islemler) return 0;

    let totalEffect = 0;
    islemler.forEach((islem) => {
      const amount = toNumber(islem.amount); // Güvenli NaN koruması
      if (islem.type === 'cari_alis') {
        totalEffect -= amount; // Borç artar
      } else if (islem.type === 'cari_odeme') {
        totalEffect += amount; // Borç azalır
      } else if (islem.type === 'cari_satis') {
        totalEffect += amount; // Alacak artar
      } else if (islem.type === 'cari_tahsilat') {
        totalEffect -= amount; // Alacak azalır
      } else if (islem.type === 'cari_alis_iade') {
        totalEffect += amount; // Alış iadesi borcu azaltır
      } else if (islem.type === 'cari_satis_iade') {
        totalEffect -= amount; // Satış iadesi alacağı azaltır
      }
    });

    return toNumber(cari.balance) - totalEffect;
  };

  const initialBalance = calculateInitialBalance();

  // Başlangıç bakiyesi düzenleme
  const handleOpenEditBalance = () => {
    setNewInitialBalance(initialBalance.toString());
    setEditBalanceModalVisible(true);
  };

  const handleSaveInitialBalance = () => {
    const newInitial = parseFloat(newInitialBalance) || 0;

    Alert.alert(
      t('clients:balance.confirmTitle'),
      t('clients:balance.confirmMessage'),
      [
        { text: t('common:buttons.cancel'), style: 'cancel' },
        {
          text: t('common:buttons.confirm'),
          onPress: async () => {
            try {
              // Yeni cari balance = newInitialBalance + işlem etkileri
              // işlem etkileri = mevcut balance - mevcut initialBalance
              const transactionEffect = Number(cari!.balance) - initialBalance;
              const newCariBalance = newInitial + transactionEffect;

              await updateCari.mutateAsync({
                id: cari!.id,
                balance: newCariBalance,
              });

              setEditBalanceModalVisible(false);
              refetchCari();
            } catch (error: any) {
              Alert.alert(t('common:status.error'), error.message || t('errors:general.tryAgain'));
            }
          },
        },
      ]
    );
  };

  const getHareketIcon = (type: string) => {
    switch (type) {
      case 'cari_alis':
        return <ShoppingCart size={20} color={colors.error} />;
      case 'cari_odeme':
        return <Banknote size={20} color={colors.success} />;
      case 'cari_satis':
        return <Receipt size={20} color={colors.success} />;
      case 'cari_tahsilat':
        return <Banknote size={20} color={colors.info} />;
      case 'cari_alis_iade':
        return <RotateCcw size={20} color={colors.warning} />;
      case 'cari_satis_iade':
        return <RotateCcw size={20} color={colors.warning} />;
      default:
        return <Receipt size={20} color={colors.textMuted} />;
    }
  };

  const getHareketLabel = (type: string) => {
    switch (type) {
      case 'cari_alis':
        return t('clients:transactionLabels.alis');
      case 'cari_odeme':
        return t('clients:transactionLabels.odeme');
      case 'cari_satis':
        return t('clients:transactionLabels.satis');
      case 'cari_tahsilat':
        return t('clients:transactionLabels.tahsilat');
      case 'cari_alis_iade':
        return t('clients:transactionLabels.alisIade');
      case 'cari_satis_iade':
        return t('clients:transactionLabels.satisIade');
      default:
        return type;
    }
  };


  const handleDelete = (islemId: string) => {
    Alert.alert(
      t('clients:deleteConfirm.transactionTitle'),
      t('clients:deleteConfirm.transactionMessage'),
      [
        { text: t('common:buttons.cancel'), style: 'cancel' },
        {
          text: t('common:buttons.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteIslem.mutateAsync(islemId);
            } catch (error: any) {
              Alert.alert(t('common:status.error'), error.message || t('errors:transaction.deleteFailed'));
            }
          },
        },
      ]
    );
  };

  const handleDeleteCari = () => {
    setShowMenu(false);
    Alert.alert(
      t('clients:deleteConfirm.clientTitle'),
      t('clients:deleteConfirm.clientMessage'),
      [
        { text: t('common:buttons.cancel'), style: 'cancel' },
        {
          text: t('common:buttons.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteCari.mutateAsync(id!);
              router.replace('/(tabs)/cariler');
            } catch (error: any) {
              Alert.alert(t('common:status.error'), error.message || t('errors:cari.deleteFailed'));
            }
          },
        },
      ]
    );
  };

  const handleUnarchive = async () => {
    try {
      await unarchiveCari.mutateAsync(id!);
      Alert.alert(t('common:status.success'), t('common:archive.messages.unarchiveSuccess'));
    } catch (error) {
      Alert.alert(t('common:status.error'), t('common:messages.operationFailed'));
    }
  };

  // Header right buttons (share + menu)
  const HeaderRightButtons = () => (
    <View style={styles.headerRightContainer}>
      <TouchableOpacity
        onPress={() => setShowExportSheet(true)}
        style={styles.headerBtn}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Share2 size={22} color={colors.text} />
      </TouchableOpacity>
      <TouchableOpacity
        onPress={() => setShowMenu(true)}
        style={styles.headerBtn}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <MoreVertical size={24} color={colors.text} />
      </TouchableOpacity>
    </View>
  );

  if (cariLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.loadingContainer}>
          <Text>{t('common:status.loading')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!cari) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <EmptyState
          icon={<Building2 size={48} color={colors.textMuted} />}
          title={t('errors:cari.notFound')}
          description={t('clients:details.notFoundDescription')}
        />
      </SafeAreaView>
    );
  }

  const isTedarikci = cari.type === 'tedarikci';

  return (
    <>
      <Stack.Screen
        options={{
          headerTitle: cari.name,
          headerRight: () => <HeaderRightButtons />,
        }}
      />
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
          {/* Cari Özeti */}
          <Card style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <View style={[styles.summaryIcon, { backgroundColor: isTedarikci ? colors.warningLight : colors.infoLight }]}>
                {isTedarikci ? (
                  <Building2 size={32} color={colors.warning} />
                ) : (
                  <User size={32} color={colors.info} />
                )}
              </View>
              <View style={styles.summaryInfo}>
                <Text variant="body" color="secondary">
                  {isTedarikci ? t('clients:types.tedarikci') : t('clients:types.musteri')}
                </Text>
                {cari.phone && (
                  <View style={styles.phoneRow}>
                    <Phone size={14} color={colors.textMuted} />
                    <Text variant="caption" color="secondary">
                      {cari.phone}
                    </Text>
                  </View>
                )}
              </View>
              <View style={styles.balanceInfo}>
                <Text variant="caption" color="secondary">
                  {Number(cari.balance) < 0 ? t('clients:balance.weOwe') : t('clients:balance.theyOwe')}
                </Text>
                <Text variant="h2" color={Number(cari.balance) < 0 ? 'error' : 'success'}>
                  {formatCurrency(Math.abs(Number(cari.balance)), cari.currency)}
                </Text>
                {cari.currency !== baseCurrency && exchangeRates && toNumber(cari.balance) !== 0 && (
                  <Text variant="caption" color="secondary">
                    ~{formatCurrency(convertCurrency(Math.abs(toNumber(cari.balance)), cari.currency, baseCurrency, exchangeRates) ?? 0, baseCurrency)}
                  </Text>
                )}
              </View>
            </View>
          </Card>

          {/* Arşiv Banner */}
          {cari.is_archived && (
            <View style={styles.bannerContainer}>
              <ArchivedBanner
                onUnarchive={handleUnarchive}
                loading={unarchiveCari.isPending}
              />
            </View>
          )}

          {/* Aksiyon Butonlari */}
          {!cari.is_archived && (
            <View style={styles.actionButtons}>
              <Button
                variant="primary"
                size="md"
                icon={<Zap size={18} color={colors.surface} />}
                onPress={() => setQuickBarVisible(true)}
                style={styles.actionBtn}
              >
                {t('clients:details.newTransaction')}
              </Button>
              {/* Çek Kes - Sadece tedarikçiler için */}
              {cari.type === 'tedarikci' && (
                <Button
                  variant="outline"
                  size="md"
                  icon={<FileCheck size={18} color={colors.info} />}
                  onPress={() => setShowCekKesSheet(true)}
                  style={[styles.actionBtn, { borderColor: colors.info }]}
                >
                  {t('checks:create')}
                </Button>
              )}
            </View>
          )}

          {/* İleri Tarihli İşlemler ve Hareketler */}
          <View style={styles.section}>
            <IleriTarihliIslemlerSection
              ileriTarihliIslemler={ileriTarihliIslemler}
              isLoading={ileriTarihliLoading}
            />

            {/* Bekleyen Çekler - Sadece tedarikçiler için */}
            {cari?.type === 'tedarikci' && (
              <BekleyenCeklerSection
                cekler={bekleyenCekler}
                isLoading={ceklerLoading}
              />
            )}

            <Text variant="h3" style={styles.sectionTitle}>
              {t('clients:details.transactions')}
            </Text>

            {islemlerLoading ? (
              <Text color="secondary">{t('common:status.loading')}</Text>
            ) : (
              <>
                {islemler && islemler.length > 0 && islemler.map((islem) => (
                  <ExpandableCard
                    key={islem.id}
                    expanded={expandedIslemId === islem.id}
                    onToggle={() => setExpandedIslemId(expandedIslemId === islem.id ? null : islem.id)}
                    header={
                      <View style={styles.hareketHeader}>
                        <View style={[
                          styles.hareketIcon,
                          {
                            backgroundColor:
                              islem.type === 'cari_alis' || islem.type === 'cari_satis'
                                ? colors.errorLight
                                : islem.type === 'cari_alis_iade' || islem.type === 'cari_satis_iade'
                                ? colors.warningLight
                                : colors.successLight
                          }
                        ]}>
                          {getHareketIcon(islem.type)}
                        </View>
                        <View style={styles.hareketInfo}>
                          <Text variant="body">{formatDateSmart(islem.date)}</Text>
                          <Text variant="caption" color="secondary">
                            {getHareketLabel(islem.type)}
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
                          color={
                            islem.type === 'cari_alis' || islem.type === 'cari_satis'
                              ? 'error'
                              : islem.type === 'cari_alis_iade' || islem.type === 'cari_satis_iade'
                              ? 'warning'
                              : 'success'
                          }
                        >
                          {islem.type === 'cari_alis' || islem.type === 'cari_satis' ? '-' : ''}
                          {islem.type === 'cari_alis_iade' || islem.type === 'cari_satis_iade' ? '↩ ' : ''}
                          {islem.type === 'cari_odeme' || islem.type === 'cari_tahsilat' ? '+' : ''}
                          {formatCurrency(Number(islem.amount))}
                        </Text>
                      </View>
                    }
                  >
                    <View style={styles.hareketActions}>
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
                        onPress={() => handleDelete(islem.id)}
                        style={styles.actionButton}
                      >
                        {t('common:buttons.delete')}
                      </Button>
                    </View>
                  </ExpandableCard>
                ))}

                {/* Başlangıç Bakiyesi - düzenleme mümkün */}
                <Card style={styles.hareketCard}>
                  <View style={styles.hareketHeader}>
                    <View style={[styles.hareketIcon, { backgroundColor: colors.primaryLight + '30' }]}>
                      <CircleDollarSign size={20} color={colors.primary} />
                    </View>
                    <View style={styles.hareketInfo}>
                      <Text variant="body">{t('clients:details.initialBalance')}</Text>
                      <Text variant="caption" color="secondary">
                        {t('clients:details.cariOpening')} • {formatDateShort(cari.created_at)}
                      </Text>
                    </View>
                    <View style={styles.initialBalanceRow}>
                      <Text variant="h3" color={initialBalance >= 0 ? 'success' : 'error'}>
                        {formatCurrency(initialBalance)}
                      </Text>
                      <TouchableOpacity
                        onPress={handleOpenEditBalance}
                        style={styles.editBalanceBtn}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Pencil size={16} color={colors.primary} />
                      </TouchableOpacity>
                    </View>
                  </View>
                </Card>
              </>
            )}
          </View>
        </ScrollView>

        {/* 3 Nokta Menüsü */}
        <Modal visible={showMenu} transparent animationType="fade">
          <TouchableOpacity
            style={styles.menuBackdrop}
            activeOpacity={1}
            onPress={() => setShowMenu(false)}
          >
            <View style={styles.menuContainer}>
              {/* Düzenle */}
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => {
                  setShowMenu(false);
                  router.push({ pathname: '/cariler/duzenle/[id]', params: { id: id } });
                }}
              >
                <Pencil size={20} color={colors.text} />
                <Text variant="body">{t('common:buttons.edit')}</Text>
              </TouchableOpacity>

              {/* Sil */}
              <TouchableOpacity
                style={[styles.menuItem, styles.menuItemDanger]}
                onPress={handleDeleteCari}
              >
                <Trash2 size={20} color={colors.error} />
                <Text variant="body" color="error">{t('common:buttons.delete')}</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>

        {/* Quick Transaction Bar - Create Mode */}
        <QuickTransactionBar
          visible={quickBarVisible}
          onDismiss={() => setQuickBarVisible(false)}
          defaultCariId={cari?.id}
          defaultCariType={cari?.type}
          onSuccess={() => setQuickBarVisible(false)}
        />

        {/* Quick Transaction Bar - Edit Mode */}
        <QuickTransactionBar
          visible={showEditBar}
          onDismiss={() => {
            setShowEditBar(false);
            setEditTransactionId(null);
          }}
          mode="edit"
          transactionId={editTransactionId ?? undefined}
          isScheduledTransaction={false}
          defaultCariId={cari?.id}
          defaultCariType={cari?.type}
          onSuccess={() => {
            setShowEditBar(false);
            setEditTransactionId(null);
          }}
        />

        {/* Çek Kes Sheet */}
        <CekKesSheet
          visible={showCekKesSheet}
          onDismiss={() => setShowCekKesSheet(false)}
          defaultCariId={cari?.id}
        />

        {/* Export Sheet */}
        <ExportSheet
          visible={showExportSheet}
          onDismiss={() => setShowExportSheet(false)}
          entityType="cari"
          entityId={id!}
          entityName={cari.name}
          currentBalance={Number(cari.balance)}
          cariType={cari.type as 'musteri' | 'tedarikci'}
        />

        {/* Başlangıç Bakiyesi Düzenleme Modal */}
        <Modal
          visible={editBalanceModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setEditBalanceModalVisible(false)}
        >
          <TouchableOpacity
            style={styles.balanceModalOverlay}
            activeOpacity={1}
            onPress={() => setEditBalanceModalVisible(false)}
          >
            <View style={styles.balanceModalContent} onStartShouldSetResponder={() => true}>
              <View style={styles.balanceModalHeader}>
                <Text variant="h3">{t('clients:balance.editTitle')}</Text>
                <TouchableOpacity onPress={() => setEditBalanceModalVisible(false)}>
                  <X size={24} color={colors.textMuted} />
                </TouchableOpacity>
              </View>
              <Text variant="caption" color="secondary" style={styles.balanceWarning}>
                {t('clients:balance.editWarning')}
              </Text>
              <View style={styles.balanceInputContainer}>
                <Text variant="label">{t('clients:balance.newInitialBalance')}</Text>
                <TextInput
                  style={styles.balanceInput}
                  value={newInitialBalance}
                  onChangeText={setNewInitialBalance}
                  keyboardType="numeric"
                  placeholder="0"
                  placeholderTextColor={colors.textMuted}
                />
              </View>
              <View style={styles.balanceModalButtons}>
                <Button
                  variant="secondary"
                  onPress={() => setEditBalanceModalVisible(false)}
                  style={{ flex: 1 }}
                >
                  {t('common:buttons.cancel')}
                </Button>
                <Button
                  variant="primary"
                  onPress={handleSaveInitialBalance}
                  loading={updateCari.isPending}
                  style={{ flex: 1 }}
                >
                  {t('common:buttons.save')}
                </Button>
              </View>
            </View>
          </TouchableOpacity>
        </Modal>
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
  },
  summaryCard: {
    margin: spacing.lg,
  },
  bannerContainer: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  summaryIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryInfo: {
    flex: 1,
  },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  balanceInfo: {
    alignItems: 'flex-end',
  },
  actionButtons: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  actionBtn: {
    flex: 1,
  },
  section: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing['3xl'],
  },
  sectionTitle: {
    marginBottom: spacing.lg,
  },
  hareketHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  hareketIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hareketInfo: {
    flex: 1,
  },
  hareketCard: {
    marginBottom: spacing.sm,
  },
  hareketActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionButton: {
    flex: 1,
  },
  // Header right buttons
  headerRightContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginRight: spacing.sm,
  },
  headerBtn: {
    padding: spacing.xs,
  },
  // Menu styles
  menuBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
    paddingTop: 60,
    paddingRight: spacing.md,
  },
  menuContainer: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.xs,
    minWidth: 180,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
  },
  menuItemDanger: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: spacing.xs,
    paddingTop: spacing.md + spacing.xs,
  },
  // Initial balance edit styles
  initialBalanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  editBalanceBtn: {
    padding: spacing.xs,
  },
  balanceModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  balanceModalContent: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    width: '100%',
    maxWidth: 320,
  },
  balanceModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  balanceWarning: {
    marginBottom: spacing.lg,
  },
  balanceInputContainer: {
    marginBottom: spacing.lg,
    gap: spacing.xs,
  },
  balanceInput: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    fontSize: 16,
    color: colors.text,
  },
  balanceModalButtons: {
    flexDirection: 'row',
    gap: spacing.md,
  },
});
