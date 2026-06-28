import { useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  Alert,
  TouchableOpacity,
  Modal,
  RefreshControl,
  FlatList,
  Platform,
  ListRenderItemInfo,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, Stack, Href } from 'expo-router';
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
  FileSpreadsheet,
  CreditCard,
  Wallet,
} from 'lucide-react-native';
import { BackButton } from '@/components/ui/BackButton';
import { Text, Card, Button, ExpandableCard, EmptyState } from '@/components/ui';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { QuickUrunBar } from '@/components/urun/QuickUrunBar';
import { QuickTransactionBar } from '@/components/transaction/QuickTransactionBar';
import { UrunExportSheet } from '@/components/export/UrunExportSheet';
import { AddNoteButton } from '@/components/notes/AddNoteButton';
import { NoteRow } from '@/components/notes/NoteRow';
import { NoteInputModal } from '@/components/notes/NoteInputModal';
import { SwipeableRow } from '@/components/ui/SwipeableRow';
import { useNotlarByEntity } from '@/hooks/useNotlar';
import { useDetailNoteHandlers } from '@/hooks/useDetailNoteHandlers';
import { useAuthContext } from '@/contexts/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { useToast } from '@/contexts/ToastContext';
import { useHaptics } from '@/hooks/useHaptics';
import { useUndoDelete } from '@/hooks/useUndoDelete';
import { UndoSnackbar } from '@/components/ui/UndoSnackbar';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { useUrun, usePermanentDeleteUrun, useArchiveUrun, useUnarchiveUrun } from '@/hooks/useUrunler';
import { useUrunHareketler, useAylikUrunOzet, useDeleteUrunHareket, UrunHareketWithSource } from '@/hooks/useUrunHareketler';
import { BirimType } from '@/types/database';
import { formatCurrency, formatQuantity } from '@/lib/currency';
import { toErrorMessage } from '@/lib/errors';
import { usePagePermission } from '@/hooks/usePagePermission';

export default function UrunDetayPage() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, i18n } = useTranslation(['products', 'common', 'errors', 'navigation']);

  usePagePermission({ module: 'urunler' });
  const { data: urun, isLoading: urunLoading, refetch: refetchUrun } = useUrun(id);
  const { data: hareketler, isLoading: hareketlerLoading, refetch: refetchHareketler } = useUrunHareketler(id);
  const { data: aylikOzet, refetch: refetchOzet } = useAylikUrunOzet(id);
  const { isletme } = useAuthContext();
  // Bu ürüne ait notlar (ürün detayında oluşturulanlar burada da görünür)
  const { data: entityNotes } = useNotlarByEntity('urun', id!);
  const {
    editingNote,
    setEditingNoteId,
    handleNoteUpdate,
    handleNoteDelete,
    handleToggleNoteCompletion,
    handleMarkAsTask,
    isUpdatingNote,
  } = useDetailNoteHandlers({ entityType: 'urun', entityId: id!, entityNotes, isletmeId: isletme?.id });
  const deleteUrun = usePermanentDeleteUrun();
  const archiveUrun = useArchiveUrun();
  const unarchiveUrun = useUnarchiveUrun();
  const deleteUrunHareket = useDeleteUrunHareket();
  const { showToast } = useToast();
  const haptics = useHaptics();
  const insets = useSafeAreaInsets();

  // Yetki gizleme (diğer detay/liste sayfalarıyla aynı desen; owner'da hepsi true)
  const { canCreate, canUpdate, canDelete } = usePermissions();
  const canEdit = canUpdate('urunler', urun?.created_by ?? null);
  const canRemove = canDelete('urunler', urun?.created_by ?? null);
  const canAddStock = canCreate('urunler');

  const [menuVisible, setMenuVisible] = useState(false);
  const [quickUrunVisible, setQuickUrunVisible] = useState(false);
  const [quickUrunType, setQuickUrunType] = useState<'giris' | 'cikis'>('giris');
  const [exportSheetVisible, setExportSheetVisible] = useState(false);

  // Expanded hareket state
  const [expandedHareketId, setExpandedHareketId] = useState<string | null>(null);
  const { refreshing, onRefresh } = usePullToRefresh(refetchUrun, refetchHareketler, refetchOzet);

  const { pendingDeleteIds, requestDelete: requestDeleteHareket, undoDelete, dismissDelete, snackbar: undoSnackbar } = useUndoDelete<UrunHareketWithSource>({
    onCommitDelete: async (hareketId) => { await deleteUrunHareket.mutateAsync(hareketId); },
  });

  // Edit mode state
  const [editMode, setEditMode] = useState(false);
  const [editHareketId, setEditHareketId] = useState<string | undefined>(undefined);
  const [editInitialValues, setEditInitialValues] = useState<{
    miktar: number;
    birimFiyat: number | null;
    urunType: 'giris' | 'cikis';
    date?: string;
  } | undefined>(undefined);

  // İşleme bağlı (cari/hesap/kart/personel) hareketi düzenlemek için QuickTransactionBar edit modu
  const [editTransactionId, setEditTransactionId] = useState<string | null>(null);
  const [showEditBar, setShowEditBar] = useState(false);

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
  const handleEditDirectHareket = (hareket: UrunHareketWithSource) => {
    setEditMode(true);
    setEditHareketId(hareket.id);
    setEditInitialValues({
      miktar: hareket.miktar,
      birimFiyat: hareket.birim_fiyat,
      urunType: hareket.hareket_tipi === 'giris' ? 'giris' : 'cikis',
      date: hareket.created_at,
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
            } catch (error) {
              Alert.alert(t('common:status.error'), toErrorMessage(error) || t('errors:general.tryAgain'));
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
    } catch (error) {
      Alert.alert(t('common:status.error'), toErrorMessage(error) || t('errors:general.tryAgain'));
    }
  };

  const handleUnarchive = async () => {
    setMenuVisible(false);
    try {
      await unarchiveUrun.mutateAsync(id!);
      Alert.alert(t('common:status.success'), t('products:messages.unarchiveSuccess'));
    } catch (error) {
      Alert.alert(t('common:status.error'), toErrorMessage(error) || t('errors:general.tryAgain'));
    }
  };

  // İşleme bağlı (cari/hesap/kart/personel) ürün hareketini düzenle:
  // ilgili işlemin QuickTransactionBar'ını edit modunda aç. Kaynak fark etmez —
  // QTB transactionId'den tipi (cari_alis/gider/personel_satis...) ve ürün kalemlerini kendi yükler.
  // Cari ile aynı standart: satıra tıkla → sadece düzenle → QTB.
  const handleEditIslemHareket = (hareket: UrunHareketWithSource) => {
    setExpandedHareketId(null);
    if (!hareket.islem_id) return;
    setEditTransactionId(hareket.islem_id);
    setShowEditBar(true);
  };

  // Urun hareketi silme (doğrudan girişler için)
  const handleDeleteHareket = (hareket: UrunHareketWithSource) => {
    setExpandedHareketId(null);
    const desc = `${hareket.hareket_tipi === 'giris' ? '↑' : '↓'} ${formatQuantity(hareket.miktar)}`;
    requestDeleteHareket(hareket.id, hareket, desc);
  };

  // Hareket satırı (FlatList renderItem) — .map'teki ExpandableCard JSX birebir korunuyor.
  // Yatay padding orijinaldeki styles.section ile aynı (paddingHorizontal: spacing.lg).
  const renderHareket = useCallback(({ item: hareket }: ListRenderItemInfo<UrunHareketWithSource>) => (
    <View style={{ paddingHorizontal: spacing.lg }}>
      <ExpandableCard
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
                <TrendingUp size={14} color={colors.success} />
              ) : hareket.hareket_tipi === 'cikis' ? (
                <TrendingDown size={14} color={colors.error} />
              ) : (
                <Package size={14} color={colors.warning} />
              )}
            </View>
            <View style={styles.hareketInfo}>
              <View style={styles.hareketTitleRow}>
                <Text variant="body">
                  {/* İş tarihi (islem.date) — created_at değil; created_at düzenlemede NOW()'a kayıyor */}
                  {new Date((hareket.islemDate ?? hareket.created_at).replace(' ', 'T')).toLocaleDateString(i18n.language === 'tr' ? 'tr-TR' : 'en-US', {
                    day: 'numeric',
                    month: 'short',
                  })}
                </Text>
                {hareket.cari ? (
                  <View style={styles.cariBadge}>
                    {hareket.cari.type === 'tedarikci' ? (
                      <Building2 size={12} color={colors.warning} />
                    ) : (
                      <User size={12} color={colors.info} />
                    )}
                    <Text style={styles.cariName} numberOfLines={1}>
                      {hareket.cari.name}
                    </Text>
                  </View>
                ) : hareket.personel ? (
                  <View style={styles.cariBadge}>
                    <User size={12} color={colors.info} />
                    <Text style={styles.cariName} numberOfLines={1}>
                      {hareket.personel.name}
                    </Text>
                  </View>
                ) : hareket.hesap ? (
                  <View style={styles.cariBadge}>
                    {hareket.hesap.type === 'kredi_karti' ? (
                      <CreditCard size={12} color={colors.primary} />
                    ) : (
                      <Wallet size={12} color={colors.primary} />
                    )}
                    <Text style={styles.cariName} numberOfLines={1}>
                      {hareket.hesap.name}
                    </Text>
                  </View>
                ) : null}
              </View>
              <Text variant="body" color="secondary" style={{ fontSize: 14 }}>
                {hareket.hareket_tipi === 'giris'
                  ? t('products:stock.stockIn')
                  : hareket.hareket_tipi === 'cikis'
                  ? t('products:stock.stockOut')
                  : t('products:stock.adjustment')}
              </Text>
              {hareket.birim_fiyat != null && hareket.birim_fiyat > 0 && (
                <Text variant="body" color="secondary" style={{ fontSize: 13 }}>
                  {formatCurrency(hareket.birim_fiyat, urun!.currency)}/{getBirimLabel(urun!.birim)} × {formatQuantity(Math.abs(hareket.miktar))}
                </Text>
              )}
            </View>
            <View style={{ alignItems: 'flex-end' }}>
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
                {hareket.hareket_tipi === 'giris'
                  ? '+'
                  : hareket.hareket_tipi === 'cikis'
                  ? '-'
                  : hareket.miktar >= 0 ? '+' : '-'}
                {formatQuantity(Math.abs(hareket.miktar))}
              </Text>
              {hareket.birim_fiyat != null && hareket.birim_fiyat > 0 && (() => {
                const subtotal = Math.abs(hareket.miktar) * hareket.birim_fiyat;
                const kdv = hareket.kdv_orani ? subtotal * (hareket.kdv_orani / 100) : 0;
                const total = subtotal + kdv;
                return (
                  <Text variant="body" color="secondary" style={{ fontSize: 12, marginTop: 2 }}>
                    {formatCurrency(total, urun!.currency)}{kdv > 0 ? ` (${formatCurrency(kdv, urun!.currency)} ${t('common:tax.vat')})` : ''}
                  </Text>
                );
              })()}
            </View>
          </View>
        }
      >
        <View style={styles.hareketActions}>
          {hareket.islem_id ? (
            // İşleme bağlı (cari/hesap/kart/personel) - sadece düzenle → QuickTransactionBar edit
            canEdit && (
              <Button
                variant="secondary"
                size="sm"
                icon={<Pencil size={16} color={colors.text} />}
                onPress={() => handleEditIslemHareket(hareket)}
                style={styles.actionButton}
              >
                {t('common:buttons.edit')}
              </Button>
            )
          ) : (
            // Doğrudan stok girişi/çıkışı/düzeltme (işlem yok)
            // NOT: 'duzeltme' hareketinin Düzenle yolu stoğu bozar (giriş/çıkış'a map ediliyor),
            // bu yüzden düzeltme satırında yalnızca Sil gösterilir (yanlışsa sil + yeniden oluştur).
            <>
              {canEdit && hareket.hareket_tipi !== 'duzeltme' && (
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<Pencil size={16} color={colors.text} />}
                  onPress={() => handleEditDirectHareket(hareket)}
                  style={styles.actionButton}
                >
                  {t('common:buttons.edit')}
                </Button>
              )}
              {canRemove && (
                <Button
                  variant="outline"
                  size="sm"
                  icon={<Trash2 size={16} color={colors.error} />}
                  onPress={() => handleDeleteHareket(hareket)}
                  style={styles.actionButton}
                >
                  {t('common:buttons.delete')}
                </Button>
              )}
            </>
          )}
        </View>
      </ExpandableCard>
    </View>
    // handler'lar (handleDelete/Edit*) ve getBirimLabel stabil setter + hareket arg + t üzerinden çalışır;
    // eksik dep'ler fonksiyonel olarak güvenli (renderHareket her render yeniden üretilse de FlatList sanallaştırması korunur).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [expandedHareketId, urun, canEdit, canRemove, t, i18n]);

  if (urunLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text color="secondary">{t('common:status.loading')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!urun) {
    return (
      <SafeAreaView style={styles.container}>
        <EmptyState
          icon={<Package size={48} color={colors.textMuted} />}
          title={t('errors:product.notFound')}
          description={t('products:notFoundDescription')}
        />
      </SafeAreaView>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerTitle: () => (
            <Text numberOfLines={1} style={{ fontSize: 17, fontWeight: '600', maxWidth: 200 }}>
              {urun.ad}
            </Text>
          ),
          headerBackVisible: false,
          headerLeft: () => <BackButton size={28} />,
          headerRight: () => (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <TouchableOpacity onPress={() => setExportSheetVisible(true)}>
                <FileSpreadsheet size={22} color={colors.success} />
              </TouchableOpacity>
              {(canEdit || canRemove) && (
                <TouchableOpacity onPress={() => setMenuVisible(true)}>
                  <MoreVertical size={24} color={colors.text} />
                </TouchableOpacity>
              )}
            </View>
          ),
        }}
      />
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <FlatList
          style={styles.scrollView}
          data={hareketlerLoading ? [] : (hareketler?.filter(h => !pendingDeleteIds.has(h.id)) ?? [])}
          keyExtractor={(h) => h.id}
          renderItem={renderHareket}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} tintColor={colors.primary} />}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={7}
          removeClippedSubviews={Platform.OS === 'android'}
          ListHeaderComponent={
            <>
              {/* Urun Karti */}
              <View style={styles.section}>
                <Card>
                  <View style={styles.urunCard}>
                    <View style={styles.urunLeft}>
                      <View style={styles.urunIcon}>
                        <Package size={20} color={colors.primary} />
                      </View>
                      <View style={styles.urunInfo}>
                        <Text variant="body" style={styles.urunName} numberOfLines={1}>
                          {urun.ad}
                        </Text>
                        <View style={styles.urunMeta}>
                          {urun.kod ? (
                            <View style={styles.urunCodeBadge}>
                              <Text style={styles.urunCodeText}>{urun.kod}</Text>
                            </View>
                          ) : null}
                          {urun.satis_fiyati > 0 && (
                            <Text variant="caption" color="muted">
                              {formatCurrency(urun.satis_fiyati, urun.currency)}/{getBirimLabel(urun.birim)}
                            </Text>
                          )}
                        </View>
                      </View>
                    </View>
                    <View style={styles.urunRight}>
                      <Text variant="caption" color="secondary">
                        {t('products:stock.currentStock')}
                      </Text>
                      <Text variant="h3" color="primary">
                        {formatQuantity(urun.miktar)} {getBirimLabel(urun.birim)}
                      </Text>
                    </View>
                  </View>
                </Card>
              </View>

              {/* Quick Actions */}
              {canAddStock && (
                <View style={styles.section}>
                  <View style={styles.actionButtons}>
                    <Button
                      variant="primary"
                      size="md"
                      icon={<Plus size={18} color={colors.white} />}
                      iconPosition="left"
                      onPress={() => openQuickUrun('giris')}
                      style={styles.actionButton}
                    >
                      {t('products:stock.stockIn')}
                    </Button>
                    <Button
                      variant="outline"
                      size="md"
                      icon={<Minus size={18} color={colors.primary} />}
                      iconPosition="left"
                      onPress={() => openQuickUrun('cikis')}
                      style={styles.actionButton}
                    >
                      {t('products:stock.stockOut')}
                    </Button>
                  </View>
                </View>
              )}

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
                          <Text variant="body" style={{ fontSize: 14 }}>{getMonthLabel(ozet.ay)}</Text>
                          <View style={styles.aylikValues}>
                            <View style={styles.aylikPillIn}>
                              <Text style={styles.aylikPillInText}>+{formatQuantity(ozet.giris)}</Text>
                            </View>
                            <View style={styles.aylikPillOut}>
                              <Text style={styles.aylikPillOutText}>-{formatQuantity(ozet.cikis)}</Text>
                            </View>
                            {ozet.duzeltme !== 0 && (
                              <View style={styles.aylikPillDuzeltme}>
                                <Text style={styles.aylikPillDuzeltmeText}>
                                  {ozet.duzeltme > 0 ? '+' : ''}{formatQuantity(ozet.duzeltme)}
                                </Text>
                              </View>
                            )}
                          </View>
                        </View>
                        {index < Math.min(aylikOzet.length, 6) - 1 && <View style={styles.divider} />}
                      </View>
                    ))}
                  </Card>
                </View>
              )}

              {/* Notlar - bu ürüne ait notlar */}
              {entityNotes && entityNotes.length > 0 && (
                <View style={styles.section}>
                  <Text variant="label" style={styles.sectionTitle}>
                    {t('common:notes.title')}
                  </Text>
                  {entityNotes.map((note) => (
                    <SwipeableRow
                      key={note.id}
                      onDelete={() => handleNoteDelete(note.id)}
                      deleteLabel={t('common:buttons.delete')}
                    >
                      <NoteRow
                        note={note}
                        onEdit={() => setEditingNoteId(note.id)}
                        onToggleComplete={handleToggleNoteCompletion}
                        onMarkAsTask={handleMarkAsTask}
                      />
                    </SwipeableRow>
                  ))}
                </View>
              )}

              {/* Son Hareketler başlığı — liste hemen altında geldiği için
                  styles.section marginBottom'u olmadan, sadece yatay padding ile */}
              <View style={{ paddingHorizontal: spacing.lg }}>
                <Text variant="label" style={styles.sectionTitle}>
                  {t('products:stock.movements')}
                </Text>
              </View>
            </>
          }
          ListEmptyComponent={
            <View style={styles.section}>
              {hareketlerLoading ? (
                <Text color="secondary">{t('common:status.loading')}</Text>
              ) : (
                <Card>
                  <Text variant="body" color="secondary" style={styles.emptyText}>
                    {t('products:stock.noMovements')}
                  </Text>
                </Card>
              )}
            </View>
          }
        />

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
              {canEdit && (
                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={() => {
                    setMenuVisible(false);
                    router.push(`/urunler/duzenle/${id}` as Href);
                  }}
                >
                  <Pencil size={20} color={colors.text} />
                  <Text variant="body">{t('products:editProduct')}</Text>
                </TouchableOpacity>
              )}
              {canEdit && <View style={styles.menuDivider} />}
              {canEdit && (urun.is_archived ? (
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
              ))}
              {canEdit && canRemove && <View style={styles.menuDivider} />}
              {canRemove && (
                <TouchableOpacity style={styles.menuItem} onPress={handleDelete}>
                  <Trash2 size={20} color={colors.error} />
                  <Text variant="body" style={{ color: colors.error }}>
                    {t('common:buttons.delete')}
                  </Text>
                </TouchableOpacity>
              )}
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

        {/* İşleme bağlı (cari/hesap/kart/personel) ürünlü hareket düzenleme — cari sayfasıyla aynı standart */}
        <QuickTransactionBar
          visible={showEditBar}
          onDismiss={() => { setShowEditBar(false); setEditTransactionId(null); }}
          mode="edit"
          transactionId={editTransactionId ?? undefined}
          isScheduledTransaction={false}
          onSuccess={() => { setShowEditBar(false); setEditTransactionId(null); }}
        />

        {/* Not Ekle FAB */}
        {!urun.is_archived && (
          <AddNoteButton
            entityType="urun"
            entityId={id!}
            style={{ position: 'absolute', right: spacing.lg, bottom: spacing.lg + insets.bottom }}
          />
        )}

        {/* Not düzenleme modalı */}
        <NoteInputModal
          visible={!!editingNote}
          onClose={() => setEditingNoteId(null)}
          onSave={handleNoteUpdate}
          initialData={editingNote ? {
            content: editingNote.content,
            is_completed: editingNote.is_completed,
            reminder_date: editingNote.reminder_date,
            photo_uri: editingNote.photo_path,
            assigned_to_user: editingNote.assigned_to_user,
            assigned_to_cari: editingNote.assigned_to_cari,
            assigned_to_personel: editingNote.assigned_to_personel,
          } : undefined}
          isEditing
          loading={isUpdatingNote}
          entityType="urun"
          entityId={id!}
        />

        {/* Export Sheet */}
        <UrunExportSheet
          visible={exportSheetVisible}
          onDismiss={() => setExportSheetVisible(false)}
          productName={urun.ad}
          productCode={urun.kod || undefined}
          productUnit={getBirimLabel(urun.birim)}
          productCurrency={urun.currency}
          urunId={urun.id}
        />
        <UndoSnackbar
          visible={undoSnackbar.visible}
          message={undoSnackbar.message}
          onUndo={undoDelete}
          onDismiss={dismissDelete}
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
    marginBottom: spacing.md,
  },
  sectionTitle: {
    marginBottom: spacing.sm,
  },
  urunCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  urunLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  urunIcon: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.md,
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
    fontSize: 15,
  },
  urunMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  urunCodeBadge: {
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: borderRadius.sm,
  },
  urunCodeText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.primary,
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
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  aylikValues: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  aylikPillIn: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: borderRadius.full,
  },
  aylikPillInText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.success,
  },
  aylikPillOut: {
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: borderRadius.full,
  },
  aylikPillOutText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.error,
  },
  aylikPillDuzeltme: {
    backgroundColor: '#FEF9C3',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: borderRadius.full,
  },
  aylikPillDuzeltmeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#A16207',
  },
  hareketHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  hareketIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
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
    backgroundColor: colors.primaryLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.primary + '30',
  },
  cariName: {
    fontSize: 13,
    color: colors.text,
    fontWeight: '500',
    maxWidth: 120,
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
