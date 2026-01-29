import { useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Alert,
  TouchableOpacity,
  Modal,
  KeyboardAvoidingView,
  Platform,
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
  X,
} from 'lucide-react-native';
import { Text, Card, Button, Input } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { useUrun, useDeleteUrun } from '@/hooks/useUrunler';
import { useStokHareketler, useAylikStokOzet, useCreateStokHareket } from '@/hooks/useStokHareketler';
import { BirimType, StokHareketTipi } from '@/types/database';
import { formatCurrency } from '@/lib/currency';

export default function UrunDetayPage() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation(['products', 'common', 'errors', 'navigation']);

  const { data: urun, isLoading: urunLoading } = useUrun(id);
  const { data: hareketler, isLoading: hareketlerLoading } = useStokHareketler(id);
  const { data: aylikOzet } = useAylikStokOzet(id);
  const createStokHareket = useCreateStokHareket();
  const deleteUrun = useDeleteUrun();

  const [menuVisible, setMenuVisible] = useState(false);
  const [stokModalVisible, setStokModalVisible] = useState(false);
  const [stokModalType, setStokModalType] = useState<'giris' | 'cikis'>('giris');
  const [stokMiktar, setStokMiktar] = useState('');
  const [stokFiyat, setStokFiyat] = useState('');
  const [stokAciklama, setStokAciklama] = useState('');

  const getBirimLabel = (birim: BirimType) => {
    return t(`products:units.${birim}`);
  };

  const getMonthLabel = (ayStr: string) => {
    const [year, month] = ayStr.split('-');
    return `${t(`products:months.${month}`)} ${year}`;
  };

  const openStokModal = (type: 'giris' | 'cikis') => {
    setStokModalType(type);
    setStokMiktar('');
    setStokFiyat('');
    setStokAciklama('');
    setStokModalVisible(true);
  };

  const handleStokKaydet = async () => {
    if (!stokMiktar || parseFloat(stokMiktar.replace(',', '.')) <= 0) {
      Alert.alert(t('common:status.error'), t('products:validation.quantityPositive'));
      return;
    }

    try {
      await createStokHareket.mutateAsync({
        urun_id: id!,
        hareket_tipi: stokModalType,
        miktar: parseFloat(stokMiktar.replace(',', '.')),
        birim_fiyat: stokFiyat ? parseFloat(stokFiyat.replace(',', '.')) : null,
        aciklama: stokAciklama.trim() || null,
      });

      setStokModalVisible(false);
      Alert.alert(
        t('common:status.success'),
        stokModalType === 'giris'
          ? t('products:messages.stockInSuccess')
          : t('products:messages.stockOutSuccess')
      );
    } catch (error: any) {
      Alert.alert(t('common:status.error'), error.message || t('errors:general.tryAgain'));
    }
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
          {/* Stok Karti */}
          <View style={styles.section}>
            <Card>
              <View style={styles.stokCard}>
                <View style={styles.stokIcon}>
                  <Package size={32} color={colors.primary} />
                </View>
                <Text variant="caption" color="secondary">
                  {t('products:stock.currentStock')}
                </Text>
                <Text variant="h1" style={styles.stokMiktar}>
                  {urun.miktar} {getBirimLabel(urun.birim)}
                </Text>
                {urun.satis_fiyati > 0 && (
                  <Text variant="caption" color="muted">
                    {formatCurrency(urun.satis_fiyati, urun.currency)}/{getBirimLabel(urun.birim)}
                  </Text>
                )}
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
                onPress={() => openStokModal('giris')}
                style={styles.actionButton}
              >
                {t('products:stock.stockIn')}
              </Button>
              <Button
                variant="outline"
                size="lg"
                icon={<Minus size={20} color={colors.primary} />}
                iconPosition="left"
                onPress={() => openStokModal('cikis')}
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
              <Card padding="none">
                {hareketler.slice(0, 10).map((hareket, index) => (
                  <View key={hareket.id}>
                    <View style={styles.hareketItem}>
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
                        <Text variant="body">
                          {hareket.hareket_tipi === 'giris'
                            ? t('products:stock.stockIn')
                            : hareket.hareket_tipi === 'cikis'
                            ? t('products:stock.stockOut')
                            : t('products:stock.adjustment')}
                        </Text>
                        {hareket.aciklama && (
                          <Text variant="caption" color="secondary" numberOfLines={1}>
                            {hareket.aciklama}
                          </Text>
                        )}
                      </View>
                      <View style={styles.hareketRight}>
                        <Text
                          variant="body"
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
                        <Text variant="caption" color="muted">
                          {new Date(hareket.created_at).toLocaleDateString('tr-TR', {
                            day: 'numeric',
                            month: 'short',
                          })}
                        </Text>
                      </View>
                    </View>
                    {index < Math.min(hareketler.length, 10) - 1 && <View style={styles.divider} />}
                  </View>
                ))}
              </Card>
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
              <TouchableOpacity style={styles.menuItem} onPress={handleDelete}>
                <Trash2 size={20} color={colors.error} />
                <Text variant="body" style={{ color: colors.error }}>
                  {t('common:buttons.delete')}
                </Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>

        {/* Stok Giris/Cikis Modal */}
        <Modal
          visible={stokModalVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setStokModalVisible(false)}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.stokModalContainer}
          >
            <View style={styles.stokModalContent}>
              <View style={styles.stokModalHeader}>
                <Text variant="h3">
                  {stokModalType === 'giris'
                    ? t('products:stock.stockIn')
                    : t('products:stock.stockOut')}
                </Text>
                <TouchableOpacity onPress={() => setStokModalVisible(false)}>
                  <X size={24} color={colors.textMuted} />
                </TouchableOpacity>
              </View>

              <View style={styles.stokModalBody}>
                <Input
                  label={t('products:stock.quantity')}
                  placeholder="0"
                  value={stokMiktar}
                  onChangeText={setStokMiktar}
                  keyboardType="decimal-pad"
                  autoFocus
                />

                <Input
                  label={`${t('products:stock.unitPrice')} (${t('common:optional')})`}
                  placeholder="0.00"
                  value={stokFiyat}
                  onChangeText={setStokFiyat}
                  keyboardType="decimal-pad"
                />

                <Input
                  label={`${t('products:form.description')} (${t('common:optional')})`}
                  placeholder={t('products:form.description')}
                  value={stokAciklama}
                  onChangeText={setStokAciklama}
                  multiline
                  numberOfLines={2}
                />
              </View>

              <View style={styles.stokModalButtons}>
                <Button
                  variant="outline"
                  size="lg"
                  onPress={() => setStokModalVisible(false)}
                  style={styles.stokModalButton}
                >
                  {t('common:buttons.cancel')}
                </Button>
                <Button
                  variant="primary"
                  size="lg"
                  loading={createStokHareket.isPending}
                  onPress={handleStokKaydet}
                  style={styles.stokModalButton}
                >
                  {t('common:buttons.save')}
                </Button>
              </View>
            </View>
          </KeyboardAvoidingView>
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
  stokCard: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
    gap: spacing.xs,
  },
  stokIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  stokMiktar: {
    fontSize: 36,
    fontWeight: '700',
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
  hareketItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
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
    gap: 2,
  },
  hareketRight: {
    alignItems: 'flex-end',
    gap: 2,
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
  stokModalContainer: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  stokModalContent: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    padding: spacing.lg,
    paddingBottom: spacing['3xl'],
  },
  stokModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xl,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  stokModalBody: {
    gap: spacing.lg,
  },
  stokModalButtons: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.xl,
  },
  stokModalButton: {
    flex: 1,
  },
});
