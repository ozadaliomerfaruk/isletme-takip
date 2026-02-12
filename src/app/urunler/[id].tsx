import { useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Alert,
  TouchableOpacity,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  Package,
  Plus,
  Minus,
  TrendingUp,
  TrendingDown,
  MoreVertical,
  Pencil,
  Trash2,
  Archive,
  ArchiveRestore,
  Building2,
  User,
} from 'lucide-react-native';
import { Text, Card, Button, ExpandableCard } from '@/components/ui';
import { QuickUrunBar } from '@/components/urun/QuickUrunBar';
import { useToast } from '@/contexts/ToastContext';
import { useHaptics } from '@/hooks/useHaptics';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { useUrun, useDeleteUrun, useArchiveUrun, useUnarchiveUrun } from '@/hooks/useUrunler';
import { useUrunHareketler, useAylikUrunOzet, useDeleteUrunHareket, UrunHareketWithCari } from '@/hooks/useUrunHareketler';
import { BirimType } from '@/types/database';
import { formatCurrency } from '@/lib/currency';

export default function UrunDetayPage() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation(['products', 'common', 'errors', 'navigation']);

  const { data: urun, isLoading: urunLoading } = useUrun(id);
  const { data: hareketler, isLoading: hareketlerLoading } = useUrunHareketler(id);
  const { data: aylikOzet } = useAylikUrunOzet(id);
  const deleteUrun = useDeleteUrun();
  const archiveUrun = useArchiveUrun();
  const unarchiveUrun = useUnarchiveUrun();
  const deleteUrunHareket = useDeleteUrunHareket();
  const { showToast } = useToast();
  const haptics = useHaptics();

  const [menuVisible, setMenuVisible] = useState(false);
  const [quickUrunVisible, setQuickUrunVisible] = useState(false);
  const [quickUrunType, setQuickUrunType] = useState<'giris' | 'cikis'>('giris');

  // Expanded hareket state
  const [expandedHareketId, setExpandedHareketId] = useState<string | null>(null);

  // Edit mode state
  const [editMode, setEditMode] = useState(false);
  const [editHareketId, setEditHareketId] = useState<string | undefined>(undefined);
  const [editInitialValues, setEditInitialValues] = useState<{
    miktar: number;
    birimFiyat: number | null;
    urunType: 'giris' | 'cikis';
  } | undefined>(undefined);

  const getBirimLabel = (birim: BirimType) => {
    return t(`products:units.${birim}`);
  };

  const getMonthLabel = (ayStr: string) => {
    const [year, month] = ayStr.split('-');
    return `${t(`products:months.${month}`)} ${year}`;
  };

  const openQuickUrun = (type: 'giris' | 'cikis') => {
    setEditMode(false);
    setEditHareketId(undefined);
    setEditInitialValues(undefined);
    setQuickUrunType(type);
    setQuickUrunVisible(true);
  };

  // Doğrudan urun hareketi düzenleme
  const handleEditDirectHareket = (hareket: UrunHareketWithCari) => {
    setEditMode(true);
    setEditHareketId(hareket.id);
    setEditInitialValues({
      miktar: hareket.miktar,
      birimFiyat: hareket.birim_fiyat,
      urunType: hareket.hareket_tipi === 'giris' ? 'giris' : 'cikis',
    });
    setQuickUrunType(hareket.hareket_tipi === 'giris' ? 'giris' : 'cikis');
    setQuickUrunVisible(true);
    setExpandedHareketId(null);
  };

  const handleDelete = () => {
    setMenuVisible(false);
    Alert.alert(
      t('products:deleteConfirm.title'),
      t('products:deleteConfirm.message', { name: urun?.ad }),
      [
        { text: t('common:buttons.cancel'), style: 'cancel' },
        {
          text: t('common:buttons.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteUrun.mutateAsync(id!);
              router.back();
            } catch (error: any) {
              Alert.alert(t('common:status.error'), error.message || t('errors:general.tryAgain'));
            }
          },
        },
      ]
    );
  };

  const handleArchive = async () => {
    setMenuVisible(false);
    try {
      await archiveUrun.mutateAsync(id!);
      Alert.alert(t('common:status.success'), t('products:messages.archiveSuccess'));
      router.back();
    } catch (error: any) {
      Alert.alert(t('common:status.error'), error.message || t('errors:general.tryAgain'));
    }
  };

  const handleUnarchive = async () => {
    setMenuVisible(false);
    try {
      await unarchiveUrun.mutateAsync(id!);
      Alert.alert(t('common:status.success'), t('products:messages.unarchiveSuccess'));
    } catch (error: any) {
      Alert.alert(t('common:status.error'), error.message || t('errors:general.tryAgain'));
    }
  };

  // Urun hareketi düzenleme (cari işlem üzerinden)
  const handleEditHareket = (hareket: UrunHareketWithCari) => {
    if (hareket.islem_id && hareket.cari) {
      // Cari hareketler sayfasına git, ilgili işlem açık olsun
      router.push({
        pathname: '/cariler/[id]',
        params: { id: hareket.cari.id, expandIslemId: hareket.islem_id },
      });
    }
    setExpandedHareketId(null);
  };

  // Urun hareketi silme (doğrudan girişler için)
  const handleDeleteHareket = (hareket: UrunHareketWithCari) => {
    Alert.alert(
      t('common:confirm.deleteTitle'),
      t('products:stock.deleteMovementConfirm'),
      [
        { text: t('common:buttons.cancel'), style: 'cancel' },
        {
          text: t('common:buttons.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteUrunHareket.mutateAsync(hareket.id);
              haptics.success();
              showToast(t('common:messages.deletedSuccessfully'), 'success');
              setExpandedHareketId(null);
            } catch (error: any) {
              haptics.error();
              showToast(error.message || t('common:messages.operationFailed'), 'error');
            }
          },
        },
      ]
    );
  };

  if (urunLoading || !urun) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text color="secondary">{t('common:status.loading')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: urun.ad,
          headerBackTitle: t('navigation:back.back'),
          headerRight: () => (
            <TouchableOpacity onPress={() => setMenuVisible(true)}>
              <MoreVertical size={24} color={colors.text} />
            </TouchableOpacity>
          ),
        }}
      />
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
          {/* Urun Karti */}
          <View style={styles.section}>
            <Card>
              <View style={styles.urunCard}>
                <View style={styles.urunLeft}>
                  <View style={styles.urunIcon}>
                    <Package size={24} color={colors.primary} />
                  </View>
                  <View style={styles.urunInfo}>
                    <Text variant="body" style={styles.urunName} numberOfLines={1}>
                      {urun.ad}
                    </Text>
                    {urun.satis_fiyati > 0 && (
                      <Text variant="caption" color="muted">
                        {formatCurrency(urun.satis_fiyati, urun.currency)}/{getBirimLabel(urun.birim)}
                      </Text>
                    )}
                  </View>
                </View>
                <View style={styles.urunRight}>
                  <Text variant="caption" color="secondary">
                    {t('products:stock.currentStock')}
                  </Text>
                  <Text variant="h2" color="primary">
                    {urun.miktar} {getBirimLabel(urun.birim)}
                  </Text>
                </View>
              </View>
            </Card>
          </View>

          {/* Quick Actions */}
          <View style={styles.section}>
            <View style={styles.actionButtons}>
              <Button
                variant="primary"
                size="lg"
                icon={<Plus size={20} color={colors.white} />}
                iconPosition="left"
                onPress={() => openQuickUrun('giris')}
                style={styles.actionButton}
              >
                {t('products:stock.stockIn')}
              </Button>
              <Button
                variant="outline"
                size="lg"
                icon={<Minus size={20} color={colors.primary} />}
                iconPosition="left"
                onPress={() => openQuickUrun('cikis')}
                style={styles.actionButton}
              >
                {t('products:stock.stockOut')}
              </Button>
            </View>
          </View>

          {/* Aylik Ozet */}
          {aylikOzet && aylikOzet.length > 0 && (
            <View style={styles.section}>
              <Text variant="label" style={styles.sectionTitle}>
                {t('products:stock.monthlyReport')}
              </Text>
              <Card padding="none">
                {aylikOzet.slice(0, 6).map((ozet, index) => (
                  <View key={ozet.ay}>
                    <View style={styles.aylikItem}>
                      <Text variant="body">{getMonthLabel(ozet.ay)}</Text>
                      <View style={styles.aylikValues}>
                        <View style={styles.aylikValue}>
                          <TrendingUp size={14} color={colors.success} />
                          <Text variant="caption" color="success">
                            +{ozet.giris}
                          </Text>
                        </View>
                        <View style={styles.aylikValue}>
                          <TrendingDown size={14} color={colors.error} />
                          <Text variant="caption" color="error">
                            -{ozet.cikis}
                          </Text>
                        </View>
                      </View>
                    </View>
                    {index < Math.min(aylikOzet.length, 6) - 1 && <View style={styles.divider} />}
                  </View>
                ))}
              </Card>
            </View>
          )}

          {/* Son Hareketler */}
          <View style={styles.section}>
            <Text variant="label" style={styles.sectionTitle}>
              {t('products:stock.movements')}
            </Text>
            {hareketlerLoading ? (
              <Text color="secondary">{t('common:status.loading')}</Text>
            ) : hareketler && hareketler.length > 0 ? (
              <>
                {hareketler.slice(0, 20).map((hareket) => (
                  <ExpandableCard
                    key={hareket.id}
                    expanded={expandedHareketId === hareket.id}
                    onToggle={() => setExpandedHareketId(expandedHareketId === hareket.id ? null : hareket.id)}
                    header={
                      <View style={styles.hareketHeader}>
                        <View
                          style={[
                            styles.hareketIcon,
                            {
                              backgroundColor:
                                hareket.hareket_tipi === 'giris'
                                  ? colors.successLight
                                  : hareket.hareket_tipi === 'cikis'
                                  ? colors.errorLight
                                  : colors.warningLight,
                            },
                          ]}
                        >
                          {hareket.hareket_tipi === 'giris' ? (
                            <TrendingUp size={16} color={colors.success} />
                          ) : hareket.hareket_tipi === 'cikis' ? (
                            <TrendingDown size={16} color={colors.error} />
                          ) : (
                            <Package size={16} color={colors.warning} />
                          )}
                        </View>
                        <View style={styles.hareketInfo}>
                          <View style={styles.hareketTitleRow}>
                            <Text variant="body">
                              {new Date(hareket.created_at).toLocaleDateString('tr-TR', {
                                day: 'numeric',
                                month: 'short',
                              })}
                            </Text>
                            {hareket.cari && (
                              <View style={styles.cariBadge}>
                                {hareket.cari.type === 'tedarikci' ? (
                                  <Building2 size={10} color={colors.warning} />
                                ) : (
                                  <User size={10} color={colors.info} />
                                )}
                                <Text variant="caption" style={styles.cariName} numberOfLines={1}>
                                  {hareket.cari.name}
                                </Text>
                              </View>
                            )}
                          </View>
                          <Text variant="caption" color="secondary">
                            {hareket.hareket_tipi === 'giris'
                              ? t('products:stock.stockIn')
                              : hareket.hareket_tipi === 'cikis'
                              ? t('products:stock.stockOut')
                              : t('products:stock.adjustment')}
                          </Text>
                          {hareket.birim_fiyat != null && hareket.birim_fiyat > 0 && (
                            <Text variant="caption" color="secondary">
                              {formatCurrency(hareket.birim_fiyat)}/{getBirimLabel(urun.birim)}
                            </Text>
                          )}
                        </View>
                        <Text
                          variant="h3"
                          style={{
                            color:
                              hareket.hareket_tipi === 'giris'
                                ? colors.success
                                : hareket.hareket_tipi === 'cikis'
                                ? colors.error
                                : colors.warning,
                          }}
                        >
                          {hareket.hareket_tipi === 'giris' ? '+' : '-'}
                          {Math.abs(hareket.miktar)}
                        </Text>
                      </View>
                    }
                  >
                    <View style={styles.hareketActions}>
                      {hareket.islem_id && hareket.cari ? (
                        // Cari işlem üzerinden yapılmış - sadece düzenle
                        <Button
                          variant="secondary"
                          size="sm"
                          icon={<Pencil size={16} color={colors.text} />}
                          onPress={() => handleEditHareket(hareket)}
                          style={styles.actionButton}
                        >
                          {t('common:buttons.edit')}
                        </Button>
                      ) : (
                        // Doğrudan ürün girişi - düzenle ve sil
                        <>
                          <Button
                            variant="secondary"
                            size="sm"
                            icon={<Pencil size={16} color={colors.text} />}
                            onPress={() => handleEditDirectHareket(hareket)}
                            style={styles.actionButton}
                          >
                            {t('common:buttons.edit')}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            icon={<Trash2 size={16} color={colors.error} />}
                            onPress={() => handleDeleteHareket(hareket)}
                            style={styles.actionButton}
                          >
                            {t('common:buttons.delete')}
                          </Button>
                        </>
                      )}
                    </View>
                  </ExpandableCard>
                ))}
              </>
            ) : (
              <Card>
                <Text variant="body" color="secondary" style={styles.emptyText}>
                  {t('products:stock.noMovements')}
                </Text>
              </Card>
            )}
          </View>
        </ScrollView>

        {/* Menu Modal */}
        <Modal
          visible={menuVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setMenuVisible(false)}
        >
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => setMenuVisible(false)}
          >
            <View style={styles.menuContent}>
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => {
                  setMenuVisible(false);
                  router.push(`/urunler/duzenle/${id}` as any);
                }}
              >
                <Pencil size={20} color={colors.text} />
                <Text variant="body">{t('products:editProduct')}</Text>
              </TouchableOpacity>
              <View style={styles.menuDivider} />
              {urun.is_archived ? (
                <TouchableOpacity style={styles.menuItem} onPress={handleUnarchive}>
                  <ArchiveRestore size={20} color={colors.success} />
                  <Text variant="body" style={{ color: colors.success }}>
                    {t('products:actions.unarchive')}
                  </Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={styles.menuItem} onPress={handleArchive}>
                  <Archive size={20} color={colors.warning} />
                  <Text variant="body" style={{ color: colors.warning }}>
                    {t('products:actions.archive')}
                  </Text>
                </TouchableOpacity>
              )}
              <View style={styles.menuDivider} />
              <TouchableOpacity style={styles.menuItem} onPress={handleDelete}>
                <Trash2 size={20} color={colors.error} />
                <Text variant="body" style={{ color: colors.error }}>
                  {t('common:buttons.delete')}
                </Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>

        {/* QuickUrunBar */}
        <QuickUrunBar
          visible={quickUrunVisible}
          onDismiss={() => {
            setQuickUrunVisible(false);
            setEditMode(false);
            setEditHareketId(undefined);
            setEditInitialValues(undefined);
          }}
          urun={urun}
          defaultType={quickUrunType}
          mode={editMode ? 'edit' : 'create'}
          editHareketId={editHareketId}
          editInitialValues={editInitialValues}
        />
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollView: {
    flex: 1,
  },
  section: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    marginBottom: spacing.md,
  },
  urunCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  urunLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flex: 1,
  },
  urunIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  urunInfo: {
    flex: 1,
    gap: 2,
  },
  urunName: {
    fontWeight: '600',
  },
  urunRight: {
    alignItems: 'flex-end',
  },
  actionButtons: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  actionButton: {
    flex: 1,
  },
  aylikItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.lg,
  },
  aylikValues: {
    flexDirection: 'row',
    gap: spacing.lg,
  },
  aylikValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
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
  hareketTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  hareketActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  cariBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  cariName: {
    fontSize: 11,
    color: colors.textSecondary,
    maxWidth: 100,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginLeft: spacing.lg,
  },
  emptyText: {
    textAlign: 'center',
    paddingVertical: spacing.lg,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  menuContent: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    padding: spacing.lg,
    paddingBottom: spacing['3xl'],
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
  },
  menuDivider: {
    height: 1,
    backgroundColor: colors.border,
  },
});
