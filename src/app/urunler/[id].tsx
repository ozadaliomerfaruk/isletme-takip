import { useState, useCallback, useEffect, useMemo } from 'react';
import { useContentBottomPadding } from '@/hooks/useContentBottomPadding';
import { View, StyleSheet, Alert, TouchableOpacity, RefreshControl, FlatList, Platform, ListRenderItemInfo } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
  Share as ShareIcon,
  CreditCard,
  Wallet,
  RotateCcw,
  Tags,
} from 'lucide-react-native';
import { BackButton } from '@/components/ui/BackButton';
import { Text, Card, Button, ExpandableCard, EmptyState, Screen } from '@/components/ui';
import { OzetModeToggle } from '@/components/urunlerPage/OzetModeToggle';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { QuickUrunBar } from '@/components/urun/QuickUrunBar';
import { QuickTransactionBar } from '@/components/transaction/QuickTransactionBar';
import { UrunExportSheet } from '@/components/export/UrunExportSheet';
import { AddNoteButton } from '@/components/notes/AddNoteButton';
import { NoteListRow } from '@/components/notes/NoteListRow';
import { NoteInputModal } from '@/components/notes/NoteInputModal';
import { useNotlarByEntity } from '@/hooks/useNotlar';
import { useDetailNoteHandlers } from '@/hooks/useDetailNoteHandlers';
import { useAuthContext } from '@/contexts/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import {
  getTransactionProductMutationDecision,
} from '@/lib/transactionProductMutationGate';
import { useToast } from '@/contexts/ToastContext';
import { useHaptics } from '@/hooks/useHaptics';
import { useUndoDelete } from '@/hooks/useUndoDelete';
import { UndoSnackbar } from '@/components/ui/UndoSnackbar';
import { colors } from '@/constants/colors';
import { parseDateFromDB, getLocale } from '@/lib/date';
import { spacing, borderRadius, HIT_SLOP } from '@/constants/spacing';
import { useUrun, usePermanentDeleteUrun, useArchiveUrun, useUnarchiveUrun } from '@/hooks/useUrunler';
import {
  useUrunHareketler,
  useUrunHareketKaynakEtiketleri,
  useAylikUrunOzet,
  useDeleteUrunHareket,
  useUrunOzet,
  UrunHareketWithSource,
} from '@/hooks/useUrunHareketler';
import { DetailSummaryCard, type DetailSummaryRow } from '@/components/detail/DetailSummaryCard';
import { DetailActionMenu } from '@/components/detail/DetailActionMenu';
import { upperTr } from '@/lib/turkishTextUtils';
import { urunHareketYon, isAlisAilesi, isIadeYon } from '@/lib/urunHareket';
import { BirimType } from '@/types/database';
import { formatCurrency, formatQuantity } from '@/lib/currency';
import { toErrorMessage } from '@/lib/errors';
import { usePagePermission } from '@/hooks/usePagePermission';
import { getQuickTransactionScopeForApiType } from '@/lib/quickTransactionCreateScope';
import { getListEdgePosition, getListEdgeStyle } from '@/components/ui/listEdgeStyles';
import { canMutateEntityHistory } from '@/lib/archivedEntityHistory';

// Hareket satırları yapışık; ayrım 1px gri çizgi (cariler listesi dili)
const HareketSeparator = () => (
  <View style={{ height: 1, backgroundColor: colors.border, marginHorizontal: spacing.lg }} />
);

export default function UrunDetayPage() {
  const contentPaddingBottom = useContentBottomPadding();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, i18n } = useTranslation(['products', 'common', 'errors', 'navigation']);

  usePagePermission({ module: 'urunler' });
  const { data: urun, isLoading: urunLoading, refetch: refetchUrun } = useUrun(id);
  // Dashboard kartı toplamları (RPC + client aile netleştirmesi)
  const { data: urunOzet } = useUrunOzet(id);
  const { data: hareketler, isLoading: hareketlerLoading, refetch: refetchHareketler } = useUrunHareketler(id);
  const {
    data: minimalSourceLabels = [],
    refetch: refetchMinimalSourceLabels,
  } = useUrunHareketKaynakEtiketleri(id);
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
  const {
    canCreate,
    canUpdate,
    canDelete,
    canAccessModule,
    isOwner,
  } = usePermissions();
  const canMutateDetailHistory = canMutateEntityHistory(urun?.is_archived);
  const canEditProduct = canUpdate('urunler', urun?.created_by ?? null);
  const canRemove = canDelete('urunler', urun?.created_by ?? null);
  const canAddStock =
    canMutateDetailHistory && canCreate('urunler');
  const canSeeCariler = canAccessModule('cariler');
  const canSeePersonel = canAccessModule('personel');
  const canSeeHesaplar = canAccessModule('hesaplar');
  const getLinkedProductMutationDecision = useCallback(
    (hareket: UrunHareketWithSource) => {
      const creatorResolved = hareket.islemCreatedBy !== undefined;
      return getTransactionProductMutationDecision({
        type: hareket.islemType,
        productItemsResolved: !!hareket.islemType,
        productItemCount: 1,
        isOwner,
        canAccessModule,
        canMutateTransaction:
          creatorResolved
          && canUpdate('islemler', hareket.islemCreatedBy ?? null),
        canMutateProduct:
          creatorResolved
          && canUpdate('urunler', hareket.islemCreatedBy ?? null),
      });
    },
    [canAccessModule, canUpdate, isOwner],
  );
  const minimalSourceLabelByHareketId = useMemo(
    () => new Map(
      minimalSourceLabels.map((label) => [
        label.movement_id,
        label,
      ]),
    ),
    [minimalSourceLabels],
  );

  const [menuVisible, setMenuVisible] = useState(false);
  const [quickUrunVisible, setQuickUrunVisible] = useState(false);
  const [quickUrunType, setQuickUrunType] = useState<'giris' | 'cikis'>('giris');
  const [exportSheetVisible, setExportSheetVisible] = useState(false);

  // Expanded hareket state
  const [expandedHareketId, setExpandedHareketId] = useState<string | null>(null);

  // Aylık özet: miktar/tutar görünümü + akordiyon (varsayılan kapalı — sayfa kısa kalsın)
  const [ozetMode, setOzetMode] = useState<'miktar' | 'tutar'>('miktar');
  const [ozetExpanded, setOzetExpanded] = useState(false);
  const { refreshing, onRefresh } = usePullToRefresh(
    refetchUrun,
    refetchHareketler,
    refetchMinimalSourceLabels,
    refetchOzet,
  );

  const { pendingDeleteIds, requestDelete: requestDeleteHareket, undoDelete, dismissDelete, snackbar: undoSnackbar } = useUndoDelete<UrunHareketWithSource>({
    onCommitDelete: async (hareketId) => {
      if (!canMutateDetailHistory) {
        throw Object.assign(
          new Error(t('common:errors.permissionDenied')),
          { code: '42501' as const },
        );
      }
      await deleteUrunHareket.mutateAsync(hareketId);
    },
    onError: (error) => {
      showToast(
        toErrorMessage(error, t('common:errors.permissionDenied')),
        'error',
      );
    },
  });

  // Edit mode state
  const [editMode, setEditMode] = useState(false);
  const [editHareketId, setEditHareketId] = useState<string | undefined>(undefined);
  const [editInitialValues, setEditInitialValues] = useState<{
    miktar: number;
    birimFiyat: number | null;
    marka?: string | null;
    urunType: 'giris' | 'cikis';
    date?: string;
  } | undefined>(undefined);

  // İşleme bağlı (cari/hesap/kart/personel) hareketi düzenlemek için QuickTransactionBar edit modu
  const [editTransactionId, setEditTransactionId] = useState<string | null>(null);
  const [showEditBar, setShowEditBar] = useState(false);
  const selectedEditHareket = editHareketId
    ? hareketler?.find((hareket) => hareket.id === editHareketId)
    : undefined;
  // Edit modalinin izni ürün sahibinden değil, düzenlenen hareketin güncel
  // created_by değerinden gelir. Kayıt cache'ten düşerse de fail-closed kapanır.
  const canEdit = canMutateDetailHistory
    && !!selectedEditHareket
    && canUpdate('urunler', selectedEditHareket.created_by ?? null);
  const selectedLinkedEditHareket = editTransactionId
    ? hareketler?.find(
        (hareket) => hareket.islem_id === editTransactionId,
      )
    : undefined;
  const selectedLinkedEditType = selectedLinkedEditHareket?.islemType;
  const selectedLinkedEditCari = selectedLinkedEditHareket?.cari;
  const selectedLinkedEditIsCari =
    typeof selectedLinkedEditType === 'string'
    && selectedLinkedEditType.startsWith('cari_');
  const canEditSelectedLinkedTransaction =
    canMutateDetailHistory
    && !!selectedLinkedEditHareket
    && getLinkedProductMutationDecision(
      selectedLinkedEditHareket,
    ).allowed;

  useEffect(() => {
    if (!quickUrunVisible || (editMode ? canEdit : canAddStock)) return;
    setQuickUrunVisible(false);
    setEditMode(false);
    setEditHareketId(undefined);
    setEditInitialValues(undefined);
  }, [quickUrunVisible, editMode, canEdit, canAddStock]);

  useEffect(() => {
    if (!showEditBar || canEditSelectedLinkedTransaction) return;
    setShowEditBar(false);
    setEditTransactionId(null);
  }, [canEditSelectedLinkedTransaction, showEditBar]);

  const getBirimLabel = (birim: BirimType) => {
    return t(`products:units.${birim}`);
  };

  const getMonthLabel = (ayStr: string) => {
    const [year, month] = ayStr.split('-');
    return `${t(`products:months.${month}`)} ${year}`;
  };

  const openQuickUrun = (type: 'giris' | 'cikis') => {
    if (!canAddStock) return;
    setEditMode(false);
    setEditHareketId(undefined);
    setEditInitialValues(undefined);
    setQuickUrunType(type);
    setQuickUrunVisible(true);
  };

  // Doğrudan urun hareketi düzenleme
  const handleEditDirectHareket = (hareket: UrunHareketWithSource) => {
    const canEdit =
      canMutateDetailHistory
      && canUpdate('urunler', hareket.created_by ?? null);
    if (!canEdit) return;
    setEditMode(true);
    setEditHareketId(hareket.id);
    setEditInitialValues({
      miktar: hareket.miktar,
      birimFiyat: hareket.birim_fiyat,
      marka: hareket.marka ?? urun?.marka ?? null,
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
    if (
      !canMutateDetailHistory
      || !hareket.islem_id
      || !getLinkedProductMutationDecision(hareket).allowed
    ) return;
    setEditTransactionId(hareket.islem_id);
    setShowEditBar(true);
  };

  // Urun hareketi silme (doğrudan girişler için)
  const handleDeleteHareket = (hareket: UrunHareketWithSource) => {
    setExpandedHareketId(null);
    if (
      !canMutateDetailHistory
      || !canDelete('urunler', hareket.created_by ?? null)
    ) return;
    const desc = `${hareket.hareket_tipi === 'giris' ? '↑' : '↓'} ${formatQuantity(hareket.miktar)}`;
    requestDeleteHareket(hareket.id, hareket, desc);
  };

  // Hareket satırı (FlatList renderItem) — .map'teki ExpandableCard JSX birebir korunuyor.
  // Yatay padding orijinaldeki styles.section ile aynı (paddingHorizontal: spacing.lg).
  const visibleHareketler = useMemo(
    () => hareketler?.filter((hareket) => !pendingDeleteIds.has(hareket.id)) ?? [],
    [hareketler, pendingDeleteIds],
  );

  const renderHareket = useCallback(({ item: hareket, index }: ListRenderItemInfo<UrunHareketWithSource>) => {
    // Finansal yön (stok yönünden bağımsız): iadeler doğru aileye/etikete gider.
    // Alış iadesi stok ÇIKIŞIdır ama "satış" DEĞİL; satış iadesi stok GİRİŞİdir ama "alış" DEĞİL.
    const yon = urunHareketYon(hareket.hareket_tipi, hareket.islemType);
    const alisAilesi = isAlisAilesi(yon);
    const iade = isIadeYon(yon);
    const minimalSourceLabel =
      minimalSourceLabelByHareketId.get(hareket.id);
    const minimalCariName = !canSeeCariler
      ? minimalSourceLabel?.cari_name
      : undefined;
    const minimalPersonelName = !canSeePersonel
      ? minimalSourceLabel?.personel_name
      : undefined;
    const minimalHesapName = !canSeeHesaplar
      ? minimalSourceLabel?.hesap_name
      : undefined;
    const canEditHareket = canMutateDetailHistory && (
      hareket.islem_id
        ? getLinkedProductMutationDecision(hareket).allowed
        : canUpdate('urunler', hareket.created_by ?? null)
    );
    const canDeleteHareket = canMutateDetailHistory && canDelete(
      'urunler',
      hareket.created_by ?? null,
    );
    return (
    <View style={{ paddingHorizontal: spacing.lg }}>
      {/* Yapışık düz-liste görünümü (cariler dili) — ayrım FlatList ayracından */}
      <ExpandableCard
        style={[
          { borderRadius: 0, marginBottom: 0 },
          getListEdgeStyle(getListEdgePosition(index, visibleHareketler.length)),
        ]}
        showChevron={false}
        expanded={expandedHareketId === hareket.id}
        onToggle={() => setExpandedHareketId(expandedHareketId === hareket.id ? null : hareket.id)}
        header={
          <View style={styles.hareketHeader}>
            <View
              style={[
                styles.hareketIcon,
                {
                  backgroundColor:
                    yon === 'duzeltme'
                      ? colors.warningLight
                      : alisAilesi
                      ? colors.errorLight
                      : colors.successLight,
                },
              ]}
            >
              {yon === 'duzeltme' ? (
                <Package size={14} color={colors.warning} />
              ) : iade ? (
                <RotateCcw size={14} color={alisAilesi ? colors.error : colors.success} />
              ) : alisAilesi ? (
                <TrendingUp size={14} color={colors.error} />
              ) : (
                <TrendingDown size={14} color={colors.success} />
              )}
            </View>
            <View style={styles.hareketInfo}>
              <View style={styles.hareketTitleRow}>
                <Text variant="body">
                  {/* İş tarihi (islem.date) — created_at değil; created_at düzenlemede NOW()'a kayıyor.
                      parseDateFromDB: boşluklu format + Invalid guard (1970 bug ailesi) */}
                  {/* getLocale(): dil + kullanıcının DMY/MDY tercihi tek kaynak;
                      satır-içi tr/en ternary'si sayfanın geri kalanıyla çelişiyordu */}
                  {parseDateFromDB(hareket.islemDate ?? hareket.created_at).toLocaleDateString(getLocale(), {
                    day: 'numeric',
                    month: 'short',
                  })}
                </Text>
                {hareket.cari && canSeeCariler ? (
                  <TouchableOpacity
                    style={styles.cariBadge}
                    onPress={() => router.push(`/cariler/${hareket.cari!.id}`)}
                    accessibilityRole="button"
                  >
                    {hareket.cari.type === 'tedarikci' ? (
                      <Building2 size={12} color={colors.warning} />
                    ) : (
                      <User size={12} color={colors.info} />
                    )}
                    <Text style={styles.cariName} numberOfLines={1}>
                      {hareket.cari.name}
                    </Text>
                  </TouchableOpacity>
                ) : minimalCariName ? (
                  <View style={styles.cariBadge}>
                    <User size={12} color={colors.info} />
                    <Text style={styles.cariName} numberOfLines={1}>
                      {minimalCariName}
                    </Text>
                  </View>
                ) : hareket.personel && canSeePersonel ? (
                  <View style={styles.cariBadge}>
                    <User size={12} color={colors.info} />
                    <Text style={styles.cariName} numberOfLines={1}>
                      {hareket.personel.name}
                    </Text>
                  </View>
                ) : minimalPersonelName ? (
                  <View style={styles.cariBadge}>
                    <User size={12} color={colors.info} />
                    <Text style={styles.cariName} numberOfLines={1}>
                      {minimalPersonelName}
                    </Text>
                  </View>
                ) : hareket.hesap && canSeeHesaplar ? (
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
                ) : minimalHesapName ? (
                  <View style={styles.cariBadge}>
                    <Wallet size={12} color={colors.primary} />
                    <Text style={styles.cariName} numberOfLines={1}>
                      {minimalHesapName}
                    </Text>
                  </View>
                ) : null}
                {hareket.marka ? (
                  <View style={[styles.cariBadge, styles.markaBadge]}>
                    <Tags size={12} color={colors.warningDark} />
                    <Text
                      style={[styles.cariName, styles.markaName]}
                      numberOfLines={1}
                    >
                      {hareket.marka}
                    </Text>
                  </View>
                ) : null}
              </View>
              <Text variant="body" color="secondary" style={{ fontSize: 14 }}>
                {yon === 'alis'
                  ? t('products:stock.stockIn')
                  : yon === 'alis_iade'
                  ? t('products:stock.purchaseReturn')
                  : yon === 'satis'
                  ? t('products:stock.stockOut')
                  : yon === 'satis_iade'
                  ? t('products:stock.salesReturn')
                  : t('products:stock.adjustment')}
              </Text>
              {hareket.birim_fiyat != null && hareket.birim_fiyat > 0 && (
                <Text variant="body" color="secondary" style={{ fontSize: 13 }}>
                  {formatCurrency(hareket.birim_fiyat, urun!.currency)}/{getBirimLabel(urun!.birim)} × {formatQuantity(Math.abs(hareket.miktar))}
                </Text>
              )}
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              {(() => {
                // Renk FİNANSAL AİLEYE göre: alış ailesi (alış + alış iadesi) KIRMIZI,
                // satış ailesi (satış + satış iadesi) YEŞİL, düzeltme SARI. Böylece alış
                // iadesi (stok çıkışı) yanlışça satış rengi/etiketi almaz.
                const renk = yon === 'duzeltme'
                  ? colors.warning
                  : alisAilesi
                  ? colors.error
                  : colors.success;
                // İşaret STOK YÖNÜNDE (giriş +, çıkış −): alış iadesi malı çıkarır → "−".
                const isaret = hareket.hareket_tipi === 'giris'
                  ? '+'
                  : hareket.hareket_tipi === 'cikis'
                  ? '-'
                  : hareket.miktar >= 0 ? '+' : '-';
                // Tutar NET (KDV hariç). Tutar modunda fiyatı olan giriş/çıkışta tutar,
                // fiyatsızda (düzeltme vb.) miktar gösterilir.
                const netTutar = Math.abs(hareket.miktar) * (hareket.birim_fiyat || 0);
                const tutarGoster = ozetMode === 'tutar' && netTutar > 0;
                return (
                  <>
                    <Text variant="h3" style={{ color: renk }}>
                      {tutarGoster
                        ? formatCurrency(netTutar, urun!.currency)
                        : `${isaret}${formatQuantity(Math.abs(hareket.miktar))}`}
                    </Text>
                    {tutarGoster ? (
                      <Text variant="body" color="secondary" style={{ fontSize: 12, marginTop: 2 }}>
                        {formatQuantity(Math.abs(hareket.miktar))} {getBirimLabel(urun!.birim)}
                      </Text>
                    ) : (hareket.birim_fiyat != null && hareket.birim_fiyat > 0 && (
                      <Text variant="body" color="secondary" style={{ fontSize: 12, marginTop: 2 }}>
                        {formatCurrency(netTutar, urun!.currency)}
                      </Text>
                    ))}
                  </>
                );
              })()}
            </View>
          </View>
        }
      >
        <View style={styles.hareketActions}>
          {hareket.islem_id ? (
            // İşleme bağlı (cari/hesap/kart/personel) - sadece düzenle → QuickTransactionBar edit
            canEditHareket && (
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
              {canEditHareket && hareket.hareket_tipi !== 'duzeltme' && (
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
              {canDeleteHareket && (
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
    );
    // handler'lar (handleDelete/Edit*) ve getBirimLabel stabil setter + hareket arg + t üzerinden çalışır;
    // eksik dep'ler fonksiyonel olarak güvenli (renderHareket her render yeniden üretilse de FlatList sanallaştırması korunur).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    expandedHareketId,
    urun,
    canUpdate,
    canDelete,
    canMutateDetailHistory,
    getLinkedProductMutationDecision,
    canSeeCariler,
    minimalSourceLabelByHareketId,
    canSeePersonel,
    canSeeHesaplar,
    router,
    t,
    i18n,
    ozetMode,
    visibleHareketler.length,
  ]);

  if (urunLoading) {
    return (
      <Screen>
        <View style={styles.loadingContainer}>
          <Text color="secondary">{t('common:status.loading')}</Text>
        </View>
      </Screen>
    );
  }

  if (!urun) {
    return (
      <Screen>
        <EmptyState
          icon={<Package size={48} color={colors.textMuted} />}
          title={t('errors:product.notFound')}
          description={t('products:notFoundDescription')}
        />
      </Screen>
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
            // Cari/hesap/personel detayıyla aynı header sağ grubu: dolgu + hitSlop
            // olmadan dokunma hedefi ikon kutusu kadar (22/24px) kalıyordu.
            <View style={styles.headerRightContainer}>
              <TouchableOpacity
                onPress={() => setExportSheetVisible(true)}
                style={styles.headerBtn}
                hitSlop={HIT_SLOP.md}
              >
                <ShareIcon size={22} color={colors.text} />
              </TouchableOpacity>
              {(canEditProduct || canRemove) && (
                <TouchableOpacity
                  onPress={() => setMenuVisible(true)}
                  style={styles.headerBtn}
                  hitSlop={HIT_SLOP.md}
                >
                  <MoreVertical size={24} color={colors.text} />
                </TouchableOpacity>
              )}
            </View>
          ),
        }}
      />
      <Screen>
        <FlatList
          contentContainerStyle={{ paddingBottom: contentPaddingBottom }}
          style={styles.scrollView}
          data={hareketlerLoading ? [] : visibleHareketler}
          keyExtractor={(h) => h.id}
          renderItem={renderHareket}
          ItemSeparatorComponent={HareketSeparator}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} tintColor={colors.primary} />}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={7}
          removeClippedSubviews={Platform.OS === 'android'}
          ListHeaderComponent={
            <>
              {/* Ürün Kartı — cari/personel detayla aynı koyu-yeşil dashboard kartı:
                  solda ad + kod·fiyat, sağda mevcut stok, altında alış/satış
                  tutar + miktar toplamları (iadeler netleştirilmiş) */}
              {(() => {
                const birim = getBirimLabel(urun.birim);
                const meta = [
                  urun.kod || null,
                  urun.marka || null,
                  urun.satis_fiyati > 0 ? `${formatCurrency(urun.satis_fiyati, urun.currency)}/${birim}` : null,
                ].filter(Boolean);
                // Değerler tür rengine göre: alış tutarı=kırmızı (maliyet), satış
                // tutarı=yeşil (gelir); miktarlar nötr.
                const rows: DetailSummaryRow[] = [
                  { label: t('products:detayOzet.toplamAlisTutar'), value: formatCurrency(urunOzet?.alisTutar ?? 0, urun.currency), color: colors.error },
                  { label: t('products:detayOzet.toplamSatisTutar'), value: formatCurrency(urunOzet?.satisTutar ?? 0, urun.currency), color: colors.success },
                  { label: t('products:detayOzet.toplamAlisMiktar'), value: `${formatQuantity(urunOzet?.alisMiktar ?? 0)} ${birim}` },
                  { label: t('products:detayOzet.toplamSatisMiktar'), value: `${formatQuantity(urunOzet?.satisMiktar ?? 0)} ${birim}` },
                ];
                return (
                  <DetailSummaryCard
                    title={upperTr(urun.ad)}
                    subtitle={meta.join('  ·  ') || undefined}
                    balanceLabel={t('products:stock.currentStock')}
                    balanceValue={`${formatQuantity(urun.miktar)} ${birim}`}
                    rows={rows}
                  />
                );
              })()}

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

              {/* Aylik Ozet — akordiyon (acilir-kapanir) + miktar/tutar gecisi */}
              {aylikOzet && aylikOzet.length > 0 && (
                <View style={{ paddingHorizontal: spacing.lg, marginBottom: spacing.md }}>
                  <ExpandableCard
                    expanded={ozetExpanded}
                    onToggle={() => setOzetExpanded((v) => !v)}
                    header={
                      <View style={styles.ozetHeaderRow}>
                        <Text variant="label" style={{ fontSize: 16 }}>{t('products:stock.monthlyReport')}</Text>
                        {/* Miktar / Tutar gecisi — header icindeki dokunma kartı acip kapatmaz */}
                        {/* Paylaşılan bileşen: ürün LİSTESİNDEKİ geçişin AYNISI */}
                        <OzetModeToggle mode={ozetMode} onChange={setOzetMode} />
                      </View>
                    }
                  >
                    {aylikOzet.slice(0, 6).map((ozet, index) => (
                      <View key={ozet.ay}>
                        <View style={styles.aylikItem}>
                          <Text variant="body" style={{ fontSize: 14 }}>{getMonthLabel(ozet.ay)}</Text>
                          <View style={styles.aylikValues}>
                            {ozetMode === 'miktar' ? (
                              <>
                                {/* NET alış/satış (iade düşülmüş). İade fazlası varsa net
                                    negatif olabilir → işareti değerden türet (sabit +/- değil). */}
                                <View style={styles.aylikPillIn}>
                                  <Text style={styles.aylikPillInText}>{ozet.giris >= 0 ? '+' : '-'}{formatQuantity(Math.abs(ozet.giris))}</Text>
                                </View>
                                <View style={styles.aylikPillOut}>
                                  <Text style={styles.aylikPillOutText}>{ozet.cikis >= 0 ? '-' : '+'}{formatQuantity(Math.abs(ozet.cikis))}</Text>
                                </View>
                                {ozet.duzeltme !== 0 && (
                                  <View style={styles.aylikPillDuzeltme}>
                                    <Text style={styles.aylikPillDuzeltmeText}>
                                      {ozet.duzeltme > 0 ? '+' : ''}{formatQuantity(ozet.duzeltme)}
                                    </Text>
                                  </View>
                                )}
                              </>
                            ) : (
                              <>
                                {/* Tutar: sol = NET alım (alış − alış iadesi), sağ = NET satış (satış − satış iadesi) */}
                                <View style={styles.aylikPillIn}>
                                  <Text style={styles.aylikPillInText}>{formatCurrency(ozet.girisTutar, urun.currency)}</Text>
                                </View>
                                <View style={styles.aylikPillOut}>
                                  <Text style={styles.aylikPillOutText}>{formatCurrency(ozet.cikisTutar, urun.currency)}</Text>
                                </View>
                              </>
                            )}
                          </View>
                        </View>
                        {index < Math.min(aylikOzet.length, 6) - 1 && <View style={styles.divider} />}
                      </View>
                    ))}
                  </ExpandableCard>
                </View>
              )}

              {/* Notlar - bu ürüne ait notlar */}
              {entityNotes && entityNotes.length > 0 && (
                <View style={styles.section}>
                  <Text variant="label" style={styles.sectionTitle}>
                    {t('common:notes.title')}
                  </Text>
                  {entityNotes.map((note) => (
                    <NoteListRow
                      key={note.id}
                      note={note}
                      onEditId={setEditingNoteId}
                      onDeleteId={handleNoteDelete}
                      onToggleComplete={handleToggleNoteCompletion}
                      onMarkAsTask={handleMarkAsTask}
                      deleteLabel={t('common:buttons.delete')}
                      contextModule="urunler"
                    />
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

        {/* ⋮ menüsü — cari/hesap/personel detayıyla aynı sağ-üst dropdown */}
        <DetailActionMenu
          visible={menuVisible}
          onClose={() => setMenuVisible(false)}
          actions={[
            {
              icon: Pencil,
              label: t('products:editProduct'),
              visible: canEditProduct,
              onPress: () => {
                setMenuVisible(false);
                router.push(`/urunler/duzenle/${id}` as Href);
              },
            },
            urun.is_archived
              ? {
                  icon: ArchiveRestore,
                  label: t('products:actions.unarchive'),
                  visible: canEditProduct,
                  iconColor: colors.success,
                  onPress: handleUnarchive,
                }
              : {
                  icon: Archive,
                  label: t('products:actions.archive'),
                  visible: canEditProduct,
                  iconColor: colors.warning,
                  onPress: handleArchive,
                },
            {
              icon: Trash2,
              label: t('common:buttons.delete'),
              visible: canRemove,
              danger: true,
              onPress: handleDelete,
            },
          ]}
        />

        {/* QuickUrunBar */}
        <QuickUrunBar
          visible={quickUrunVisible && (editMode ? canEdit : canAddStock)}
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
          visible={
            showEditBar
            && !!editTransactionId
            && !!selectedLinkedEditType
            && canEditSelectedLinkedTransaction
          }
          onDismiss={() => { setShowEditBar(false); setEditTransactionId(null); }}
          mode="edit"
          transactionId={editTransactionId ?? undefined}
          isScheduledTransaction={false}
          defaultCariId={
            selectedLinkedEditIsCari ? selectedLinkedEditCari?.id : undefined
          }
          defaultCariType={
            selectedLinkedEditIsCari ? selectedLinkedEditCari?.type : undefined
          }
          defaultHesapId={selectedLinkedEditHareket?.hesap?.id}
          defaultPersonelId={selectedLinkedEditHareket?.personel?.id}
          createScope={
            getQuickTransactionScopeForApiType(selectedLinkedEditType)
              ?? undefined
          }
          minimalAccountReferenceMode={
            selectedLinkedEditIsCari
            && selectedLinkedEditCari
            && !canAccessModule('hesaplar')
              ? 'cari'
              : selectedLinkedEditHareket?.personel
                && !canAccessModule('hesaplar')
                ? 'personel'
              : undefined
          }
          onSuccess={() => { setShowEditBar(false); setEditTransactionId(null); }}
        />

        {/* Not Ekle FAB */}
        {urun.is_active !== false && (
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
          productBrand={urun.marka ?? null}
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
      </Screen>
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
    // ExpandableCard içeriği zaten yatay padding (lg) veriyor → satır kendi padding'i koymaz
    paddingHorizontal: 0,
  },
  aylikValues: {
    flexDirection: 'row',
    gap: spacing.sm,
    flexShrink: 1,
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
  },
  ozetHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  // Miktar/Tutar geçişinin stilleri artık paylaşılan OzetModeToggle bileşeninde.
  // Pill renkleri: giriş = ALIŞ → kırmızı, çıkış = SATIŞ → yeşil (gelir/gider mantığı)
  aylikPillIn: {
    backgroundColor: colors.errorLight,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
  },
  aylikPillInText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.error,
  },
  aylikPillOut: {
    backgroundColor: colors.successLight,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
  },
  aylikPillOutText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.success,
  },
  aylikPillDuzeltme: {
    backgroundColor: colors.warningLight,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
  },
  aylikPillDuzeltmeText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.warningDark,
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
    flexWrap: 'wrap',
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
  markaBadge: {
    backgroundColor: colors.warningLight,
    borderColor: colors.warning + '30',
  },
  markaName: {
    color: colors.warningDark,
    maxWidth: 110,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginLeft: 0,
  },
  emptyText: {
    textAlign: 'center',
    paddingVertical: spacing.lg,
  },
  // Header sağ butonları — cari/hesap/personel detayıyla birebir aynı ölçüler
  headerRightContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginRight: spacing.sm,
  },
  headerBtn: {
    padding: spacing.xs,
  },
});
