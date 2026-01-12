import { useState } from 'react';
import { View, StyleSheet, ScrollView, Alert, TouchableOpacity, Modal, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, Stack, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  MinusCircle,
  Banknote,
  UserCircle,
  Phone,
  Briefcase,
  Zap,
  CircleDollarSign,
  Pencil,
  Trash2,
  ArrowDownCircle,
  MoreVertical,
  X,
  Share2,
} from 'lucide-react-native';
import { Text, Card, ExpandableCard, Button, EmptyState, IleriTarihliIslemlerSection } from '@/components/ui';
import { QuickTransactionBar } from '@/components/transaction/QuickTransactionBar';
import { ExportSheet } from '@/components/export';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { formatCurrency } from '@/lib/currency';
import { formatDateShort } from '@/lib/date';
import { useDateFormat } from '@/hooks/useDateFormat';
import { getInitials } from '@/lib/utils';
import { usePersonelById, useDeletePersonel, useUpdatePersonel } from '@/hooks/usePersonel';
import { useIslemlerByPersonel, useDeleteIslem } from '@/hooks/useIslemler';
import { useIleriTarihliIslemlerByPersonel } from '@/hooks/useIleriTarihliIslemler';
import { IslemWithRelations } from '@/types/database';

export default function PersonelHareketleriPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { t } = useTranslation(['staff', 'common', 'errors']);
  const { formatDateSmart } = useDateFormat();

  const { data: personel, isLoading: personelLoading, refetch: refetchPersonel } = usePersonelById(id!);
  const { data: islemler, isLoading: islemlerLoading } = useIslemlerByPersonel(id!);
  const { data: ileriTarihliIslemler, isLoading: ileriTarihliLoading } = useIleriTarihliIslemlerByPersonel(id!);
  const deleteIslem = useDeleteIslem();
  const deletePersonel = useDeletePersonel();
  const updatePersonel = useUpdatePersonel();

  const [expandedIslemId, setExpandedIslemId] = useState<string | null>(null);
  const [quickBarVisible, setQuickBarVisible] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showExportSheet, setShowExportSheet] = useState(false);
  const [editBalanceModalVisible, setEditBalanceModalVisible] = useState(false);
  const [newInitialBalance, setNewInitialBalance] = useState('');

  const fullName = personel ? `${personel.first_name} ${personel.last_name}` : t('common:status.loading');

  // Başlangıç bakiyesini hesapla
  const calculateInitialBalance = () => {
    if (!personel || !islemler) return 0;

    let totalEffect = 0;
    islemler.forEach((islem) => {
      const amount = Number(islem.amount);
      if (islem.type === 'personel_gider') {
        totalEffect -= amount; // Borç artar
      } else if (islem.type === 'personel_odeme') {
        totalEffect += amount; // Borç azalır
      } else if (islem.type === 'personel_tahsilat') {
        totalEffect -= amount; // Tahsilat: Alacak azalır
      }
    });

    return Number(personel.balance) - totalEffect;
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
      t('staff:balance.confirmTitle'),
      t('staff:balance.confirmMessage'),
      [
        { text: t('common:buttons.cancel'), style: 'cancel' },
        {
          text: t('common:buttons.confirm'),
          onPress: async () => {
            try {
              // Yeni personel balance = newInitialBalance + işlem etkileri
              const transactionEffect = Number(personel!.balance) - initialBalance;
              const newPersonelBalance = newInitial + transactionEffect;

              await updatePersonel.mutateAsync({
                id: personel!.id,
                balance: newPersonelBalance,
              });

              setEditBalanceModalVisible(false);
              refetchPersonel();
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
      case 'personel_gider':
        return <MinusCircle size={20} color={colors.error} />;
      case 'personel_odeme':
        return <Banknote size={20} color={colors.success} />;
      case 'personel_tahsilat':
        return <ArrowDownCircle size={20} color={colors.info} />;
      default:
        return <UserCircle size={20} color={colors.textMuted} />;
    }
  };

  const getHareketLabel = (type: string) => {
    switch (type) {
      case 'personel_gider':
        return t('staff:transactionLabels.gider');
      case 'personel_odeme':
        return t('staff:transactionLabels.odeme');
      case 'personel_tahsilat':
        return t('staff:transactionLabels.tahsilat');
      default:
        return type;
    }
  };

  const handleDelete = (islemId: string) => {
    Alert.alert(
      t('staff:deleteConfirm.transactionTitle'),
      t('staff:deleteConfirm.transactionMessage'),
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

  const handleDeletePersonel = () => {
    setShowMenu(false);
    Alert.alert(
      t('staff:deleteConfirm.staffTitle'),
      t('staff:deleteConfirm.staffMessage'),
      [
        { text: t('common:buttons.cancel'), style: 'cancel' },
        {
          text: t('common:buttons.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await deletePersonel.mutateAsync(id!);
              router.replace('/(tabs)/personel');
            } catch (error: any) {
              Alert.alert(t('common:status.error'), error.message || t('errors:personel.deleteFailed'));
            }
          },
        },
      ]
    );
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

  if (personelLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.loadingContainer}>
          <Text>{t('common:status.loading')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!personel) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <EmptyState
          icon={<UserCircle size={48} color={colors.textMuted} />}
          title={t('errors:personel.notFound')}
          description={t('staff:details.notFoundDescription')}
        />
      </SafeAreaView>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerTitle: fullName,
          headerRight: () => <HeaderRightButtons />,
        }}
      />
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
          {/* Personel Özeti */}
          <Card style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <View style={styles.avatar}>
                <Text variant="h2" style={{ color: colors.primary }}>
                  {getInitials(fullName)}
                </Text>
              </View>
              <View style={styles.summaryInfo}>
                {personel.position && (
                  <View style={styles.infoRow}>
                    <Briefcase size={14} color={colors.textMuted} />
                    <Text variant="body" color="secondary">
                      {personel.position}
                    </Text>
                  </View>
                )}
                {personel.phone && (
                  <View style={styles.infoRow}>
                    <Phone size={14} color={colors.textMuted} />
                    <Text variant="caption" color="secondary">
                      {personel.phone}
                    </Text>
                  </View>
                )}
              </View>
              <View style={styles.balanceInfo}>
                <Text variant="caption" color="secondary">
                  {Number(personel.balance) < 0 ? t('staff:balance.weOwe') : t('staff:balance.theyOwe')}
                </Text>
                <Text variant="h2" color={Number(personel.balance) < 0 ? 'error' : 'success'}>
                  {formatCurrency(Math.abs(Number(personel.balance)))}
                </Text>
              </View>
            </View>
          </Card>

          {/* Aksiyon Butonları */}
          <View style={styles.actionButtons}>
            <Button
              variant="primary"
              size="md"
              icon={<Zap size={18} color={colors.surface} />}
              onPress={() => setQuickBarVisible(true)}
              style={styles.actionBtn}
            >
              {t('staff:details.newTransaction')}
            </Button>
          </View>

          {/* İleri Tarihli İşlemler ve Hareketler */}
          <View style={styles.section}>
            <IleriTarihliIslemlerSection
              ileriTarihliIslemler={ileriTarihliIslemler}
              isLoading={ileriTarihliLoading}
            />

            <Text variant="h3" style={styles.sectionTitle}>
              {t('staff:details.transactions')}
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
                          { backgroundColor: islem.type === 'personel_odeme' ? colors.successLight : islem.type === 'personel_tahsilat' ? colors.infoLight : colors.errorLight }
                        ]}>
                          {getHareketIcon(islem.type)}
                        </View>
                        <View style={styles.hareketInfo}>
                          <Text variant="body">{formatDateSmart(islem.date)}</Text>
                          <Text variant="caption" color="secondary">
                            {getHareketLabel(islem.type)}
                          </Text>
                          {(islem as IslemWithRelations).kategori?.name && (
                            <Text variant="caption" color="secondary">
                              {(islem as IslemWithRelations).kategori?.name}
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
                          color={islem.type === 'personel_odeme' ? 'success' : islem.type === 'personel_tahsilat' ? 'info' : 'error'}
                        >
                          {islem.type === 'personel_odeme' ? '+' : islem.type === 'personel_tahsilat' ? '↓ ' : '-'}
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
                        onPress={() => router.push({ pathname: '/islemler/duzenle/[id]', params: { id: islem.id } })}
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
                      <Text variant="body">{t('staff:details.initialBalance')}</Text>
                      <Text variant="caption" color="secondary">
                        {t('staff:details.personelRecord')} • {formatDateShort(personel.created_at)}
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
                  router.push({ pathname: '/personel/duzenle/[id]', params: { id: id } });
                }}
              >
                <Pencil size={20} color={colors.text} />
                <Text variant="body">{t('common:buttons.edit')}</Text>
              </TouchableOpacity>

              {/* Sil */}
              <TouchableOpacity
                style={[styles.menuItem, styles.menuItemDanger]}
                onPress={handleDeletePersonel}
              >
                <Trash2 size={20} color={colors.error} />
                <Text variant="body" color="error">{t('common:buttons.delete')}</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>

        {/* Quick Transaction Bar */}
        <QuickTransactionBar
          visible={quickBarVisible}
          onDismiss={() => setQuickBarVisible(false)}
          defaultPersonelId={personel?.id}
          onSuccess={() => setQuickBarVisible(false)}
        />

        {/* Export Sheet */}
        <ExportSheet
          visible={showExportSheet}
          onDismiss={() => setShowExportSheet(false)}
          entityType="personel"
          entityId={id!}
          entityName={fullName}
          currentBalance={Number(personel.balance)}
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
                <Text variant="h3">{t('staff:balance.editTitle')}</Text>
                <TouchableOpacity onPress={() => setEditBalanceModalVisible(false)}>
                  <X size={24} color={colors.textMuted} />
                </TouchableOpacity>
              </View>
              <Text variant="caption" color="secondary" style={styles.balanceWarning}>
                {t('staff:balance.editWarning')}
              </Text>
              <View style={styles.balanceInputContainer}>
                <Text variant="label">{t('staff:balance.newInitialBalance')}</Text>
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
                  loading={updatePersonel.isPending}
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
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primaryLight + '30',
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryInfo: {
    flex: 1,
    gap: spacing.xs,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
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
