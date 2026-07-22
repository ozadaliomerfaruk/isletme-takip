import { useState, useCallback, useMemo, memo } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import {
  Archive,
  Wallet,
  Users,
  Truck,
  Package,
  MoreVertical,
  RotateCcw,
  Trash2,
  EyeOff,
} from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Text, Card, FloatingSearchBar, FLOATING_SEARCH_CLEARANCE, EmptyState, ActionSheet, type ActionSheetOption } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { formatCurrency, toNumber, formatQuantity } from '@/lib/currency';
import { searchMatchesTr } from '@/lib/turkishTextUtils';
import { getInitials } from '@/lib/utils';
import {
  useArchivedHesaplar,
  useArchivedCariler,
  useArchivedPersonel,
  useArchivedUrunler,
  useUnarchiveHesap,
  useUnarchiveCari,
  useUnarchivePersonel,
  useUnarchiveUrun,
} from '@/hooks/useArchive';
import { useDeleteHesap } from '@/hooks/useHesaplar';
import { useDeleteCari } from '@/hooks/useCariler';
import { useDeletePersonel } from '@/hooks/usePersonel';
import { usePermanentDeleteUrun } from '@/hooks/useUrunler';
import type { Hesap, Cari, Personel, Urun } from '@/types/database';
import { usePermissions } from '@/hooks/usePermissions';
import { toErrorMessage, isLinkedRecordsError } from '@/lib/errors';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';

type TabType = 'hepsi' | 'hesaplar' | 'tedarikci' | 'musteri' | 'personel' | 'urunler';
type ArchiveKind = 'hesap' | 'cari' | 'personel' | 'urun';

// Tek FlashList için normalize edilmiş satır tipi (tür başına ayrı liste yerine tek virtualize liste).
type ArchiveRow =
  | { kind: 'hesap'; data: Hesap }
  | { kind: 'cari'; data: Cari; cariType: 'tedarikci' | 'musteri' }
  | { kind: 'personel'; data: Personel }
  | { kind: 'urun'; data: Urun };

type RowCallbacks = {
  onOpen: (kind: ArchiveKind, id: string) => void;
  onMore: (id: string, type: TabType, name: string, created_by?: string | null) => void;
};

// ============================================================================
// Satır bileşenleri — React.memo + stabil callback'ler (onOpen/onMore useCallback'li).
// FlashList yalnız görünen ~10 satırı mount eder; memo, arama tuşuna basışta görünen
// satırların gereksiz yeniden render'ını da keser (data referansı RQ cache'inden stabil).
// ============================================================================

const HesapRow = memo(function HesapRow({ data, onOpen, onMore }: { data: Hesap } & RowCallbacks) {
  const { t } = useTranslation(['accounts']);
  const isPassive = data.is_active === false;
  return (
    <Card style={[styles.itemCard, isPassive && styles.itemCardPassive]}>
      <TouchableOpacity style={styles.itemContent} onPress={() => onOpen('hesap', data.id)} activeOpacity={0.7}>
        <View style={[styles.itemIcon, isPassive && styles.itemIconPassive]}>
          <Wallet size={20} color={isPassive ? colors.textMuted : colors.primary} />
        </View>
        <View style={styles.itemInfo}>
          <View style={styles.itemNameRow}>
            <Text variant="body" style={isPassive && styles.textPassive}>{data.name}</Text>
            {isPassive && <EyeOff size={14} color={colors.textMuted} style={styles.passiveIcon} />}
          </View>
          <Text variant="caption" color="secondary">
            {t(`accounts:typeLabels.${data.type}`)}
          </Text>
        </View>
        <View style={styles.itemBalance}>
          <Text variant="body" color={toNumber(data.balance) >= 0 ? 'success' : 'error'} style={isPassive && styles.textPassive}>
            {formatCurrency(toNumber(data.balance), data.currency)}
          </Text>
        </View>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.moreButton}
        onPress={() => onMore(data.id, 'hesaplar', data.name, data.created_by)}
      >
        <MoreVertical size={20} color={colors.textMuted} />
      </TouchableOpacity>
    </Card>
  );
});

const CariRow = memo(function CariRow({
  data,
  cariType,
  onOpen,
  onMore,
}: { data: Cari; cariType: 'tedarikci' | 'musteri' } & RowCallbacks) {
  const isPassive = data.is_active === false;
  const iconColor = cariType === 'tedarikci' ? colors.warning : colors.success;
  const iconBgColor = cariType === 'tedarikci' ? colors.warningLight : colors.successLight;
  return (
    <Card style={[styles.itemCard, isPassive && styles.itemCardPassive]}>
      <TouchableOpacity style={styles.itemContent} onPress={() => onOpen('cari', data.id)} activeOpacity={0.7}>
        <View style={[styles.itemIcon, { backgroundColor: isPassive ? colors.surfaceLight : iconBgColor }, isPassive && styles.itemIconPassive]}>
          {cariType === 'tedarikci' ? (
            <Truck size={20} color={isPassive ? colors.textMuted : iconColor} />
          ) : (
            <Users size={20} color={isPassive ? colors.textMuted : iconColor} />
          )}
        </View>
        <View style={styles.itemInfo}>
          <View style={styles.itemNameRow}>
            <Text variant="body" style={isPassive && styles.textPassive}>{data.name}</Text>
            {isPassive && <EyeOff size={14} color={colors.textMuted} style={styles.passiveIcon} />}
          </View>
          {data.phone && (
            <Text variant="caption" color="secondary">
              {data.phone}
            </Text>
          )}
        </View>
        <View style={styles.itemBalance}>
          <Text variant="body" color={toNumber(data.balance) >= 0 ? 'success' : 'error'} style={isPassive && styles.textPassive}>
            {formatCurrency(Math.abs(toNumber(data.balance)), data.currency)}
          </Text>
        </View>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.moreButton}
        onPress={() => onMore(data.id, cariType, data.name, data.created_by)}
      >
        <MoreVertical size={20} color={colors.textMuted} />
      </TouchableOpacity>
    </Card>
  );
});

const PersonelRow = memo(function PersonelRow({ data, onOpen, onMore }: { data: Personel } & RowCallbacks) {
  const isPassive = data.is_active === false;
  const fullName = `${data.first_name} ${data.last_name ?? ''}`;
  return (
    <Card style={[styles.itemCard, isPassive && styles.itemCardPassive]}>
      <TouchableOpacity style={styles.itemContent} onPress={() => onOpen('personel', data.id)} activeOpacity={0.7}>
        <View style={[styles.avatar, isPassive && styles.avatarPassive]}>
          <Text variant="caption" style={{ color: isPassive ? colors.textMuted : colors.primary }}>
            {getInitials(fullName)}
          </Text>
        </View>
        <View style={styles.itemInfo}>
          <View style={styles.itemNameRow}>
            <Text variant="body" style={isPassive && styles.textPassive}>
              {data.first_name} {data.last_name ?? ''}
            </Text>
            {isPassive && <EyeOff size={14} color={colors.textMuted} style={styles.passiveIcon} />}
          </View>
          {data.position && (
            <Text variant="caption" color="secondary">
              {data.position}
            </Text>
          )}
        </View>
        <View style={styles.itemBalance}>
          <Text variant="body" color={toNumber(data.balance) >= 0 ? 'success' : 'error'} style={isPassive && styles.textPassive}>
            {formatCurrency(Math.abs(toNumber(data.balance)), data.currency)}
          </Text>
        </View>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.moreButton}
        onPress={() => onMore(data.id, 'personel', fullName, data.created_by)}
      >
        <MoreVertical size={20} color={colors.textMuted} />
      </TouchableOpacity>
    </Card>
  );
});

const UrunRow = memo(function UrunRow({ data, onOpen, onMore }: { data: Urun } & RowCallbacks) {
  const { t } = useTranslation(['products']);
  const isPassive = data.is_active === false;
  return (
    <Card style={[styles.itemCard, isPassive && styles.itemCardPassive]}>
      <TouchableOpacity style={styles.itemContent} onPress={() => onOpen('urun', data.id)} activeOpacity={0.7}>
        <View style={[styles.itemIcon, { backgroundColor: isPassive ? colors.surfaceLight : colors.primaryLight }, isPassive && styles.itemIconPassive]}>
          <Package size={20} color={isPassive ? colors.textMuted : colors.primary} />
        </View>
        <View style={styles.itemInfo}>
          <View style={styles.itemNameRow}>
            <Text variant="body" style={isPassive && styles.textPassive}>{data.ad}</Text>
            {isPassive && <EyeOff size={14} color={colors.textMuted} style={styles.passiveIcon} />}
          </View>
          <Text variant="caption" color="secondary">
            {formatQuantity(data.miktar)} {t(`products:units.${data.birim}`)}
            {data.kod && ` • ${data.kod}`}
          </Text>
        </View>
        <View style={styles.itemBalance}>
          {data.satis_fiyati > 0 && (
            <Text variant="body" color="primary" style={isPassive && styles.textPassive}>
              {formatCurrency(data.satis_fiyati, data.currency)}
            </Text>
          )}
        </View>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.moreButton}
        onPress={() => onMore(data.id, 'urunler', data.ad, data.created_by)}
      >
        <MoreVertical size={20} color={colors.textMuted} />
      </TouchableOpacity>
    </Card>
  );
});

export default function ArsivPage() {
  const router = useRouter();
  const { t } = useTranslation(['common', 'accounts', 'clients', 'staff', 'products']);
  const { canUpdate, canDelete } = usePermissions();
  const [activeTab, setActiveTab] = useState<TabType>('hepsi');
  const [searchQuery, setSearchQuery] = useState('');
  const [actionSheetVisible, setActionSheetVisible] = useState(false);
  const [selectedItem, setSelectedItem] = useState<{ id: string; type: TabType; name: string; created_by?: string | null } | null>(null);

  // Data queries (koşulsuz — sayaçlar bu dizilerin uzunluğundan türetiliyor, ayrı useArchiveCounts
  // fan-out'u YOK: eskiden her açılışta 5 ekstra HEAD count isteği atıyordu, kaldırıldı).
  const { data: hesaplar, isLoading: hesaplarLoading, refetch: refetchHesaplar } = useArchivedHesaplar();
  const { data: tedarikciler, isLoading: tedarikciLoading, refetch: refetchTedarikciler } = useArchivedCariler('tedarikci');
  const { data: musteriler, isLoading: musteriLoading, refetch: refetchMusteriler } = useArchivedCariler('musteri');
  const { data: personelList, isLoading: personelLoading, refetch: refetchPersonel } = useArchivedPersonel();
  const { data: urunler, isLoading: urunlerLoading, refetch: refetchUrunler } = useArchivedUrunler();
  const { refreshing, onRefresh } = usePullToRefresh(refetchHesaplar, refetchTedarikciler, refetchMusteriler, refetchPersonel, refetchUrunler);

  // Mutations
  const unarchiveHesap = useUnarchiveHesap();
  const unarchiveCari = useUnarchiveCari();
  const unarchivePersonel = useUnarchivePersonel();
  const unarchiveUrun = useUnarchiveUrun();
  const deleteHesap = useDeleteHesap();
  const deleteCari = useDeleteCari();
  const deletePersonel = useDeletePersonel();
  const permanentDeleteUrun = usePermanentDeleteUrun();

  // Sayaçlar zaten çekilmiş dizilerden türetiliyor (ekstra ağ isteği yok).
  const counts = useMemo(
    () => ({
      hesaplar: hesaplar?.length ?? 0,
      tedarikci: tedarikciler?.length ?? 0,
      musteri: musteriler?.length ?? 0,
      personel: personelList?.length ?? 0,
      urunler: urunler?.length ?? 0,
    }),
    [hesaplar, tedarikciler, musteriler, personelList, urunler]
  );
  const totalArchived = counts.hesaplar + counts.tedarikci + counts.musteri + counts.personel + counts.urunler;

  const tabs = useMemo(
    () => [
      { key: 'hepsi' as TabType, label: t('common:archive.tabs.all'), count: totalArchived },
      { key: 'hesaplar' as TabType, label: t('common:archive.tabs.accounts'), count: counts.hesaplar },
      { key: 'tedarikci' as TabType, label: t('common:archive.tabs.suppliers'), count: counts.tedarikci },
      { key: 'musteri' as TabType, label: t('common:archive.tabs.customers'), count: counts.musteri },
      { key: 'personel' as TabType, label: t('common:archive.tabs.staff'), count: counts.personel },
      { key: 'urunler' as TabType, label: t('common:archive.tabs.products'), count: counts.urunler },
    ],
    [t, totalArchived, counts]
  );

  const isLoading =
    (activeTab === 'hepsi' && (hesaplarLoading || tedarikciLoading || musteriLoading || personelLoading || urunlerLoading)) ||
    (activeTab === 'hesaplar' && hesaplarLoading) ||
    (activeTab === 'tedarikci' && tedarikciLoading) ||
    (activeTab === 'musteri' && musteriLoading) ||
    (activeTab === 'personel' && personelLoading) ||
    (activeTab === 'urunler' && urunlerLoading);

  // Arama filtresi — her tuşta 5 diziyi yeniden filtrelemek yerine memoize (kaydırma/yazma akıcılığı).
  const filteredHesaplar = useMemo(
    () => hesaplar?.filter((h) => searchMatchesTr(h.name, searchQuery)),
    [hesaplar, searchQuery]
  );
  const filteredTedarikciler = useMemo(
    () => tedarikciler?.filter((c) => searchMatchesTr(c.name, searchQuery)),
    [tedarikciler, searchQuery]
  );
  const filteredMusteriler = useMemo(
    () => musteriler?.filter((c) => searchMatchesTr(c.name, searchQuery)),
    [musteriler, searchQuery]
  );
  const filteredPersonel = useMemo(
    () => personelList?.filter((p) => searchMatchesTr(`${p.first_name} ${p.last_name}`, searchQuery)),
    [personelList, searchQuery]
  );
  const filteredUrunler = useMemo(
    () => urunler?.filter((u) => searchMatchesTr(u.ad, searchQuery) || (u.kod && searchMatchesTr(u.kod, searchQuery))),
    [urunler, searchQuery]
  );

  const handleItemPress = useCallback((id: string, type: TabType, name: string, created_by?: string | null) => {
    setSelectedItem({ id, type, name, created_by });
    setActionSheetVisible(true);
  }, []);

  const handleOpen = useCallback(
    (kind: ArchiveKind, id: string) => {
      switch (kind) {
        case 'hesap':
          router.push(`/hesaplar/${id}`);
          break;
        case 'cari':
          router.push(`/cariler/${id}`);
          break;
        case 'personel':
          router.push(`/personel/${id}`);
          break;
        case 'urun':
          router.push(`/urunler/${id}`);
          break;
      }
    },
    [router]
  );

  const handleUnarchive = useCallback(async () => {
    if (!selectedItem) return;

    try {
      if (selectedItem.type === 'hesaplar') {
        await unarchiveHesap.mutateAsync(selectedItem.id);
      } else if (selectedItem.type === 'tedarikci' || selectedItem.type === 'musteri') {
        await unarchiveCari.mutateAsync(selectedItem.id);
      } else if (selectedItem.type === 'personel') {
        await unarchivePersonel.mutateAsync(selectedItem.id);
      } else if (selectedItem.type === 'urunler') {
        await unarchiveUrun.mutateAsync(selectedItem.id);
      }
      setActionSheetVisible(false);
      setSelectedItem(null);
      Alert.alert(t('common:status.success'), t('common:archive.messages.unarchiveSuccess'));
    } catch (error) {
      Alert.alert(t('common:status.error'), t('common:messages.operationFailed'));
    }
  }, [selectedItem, unarchiveHesap, unarchiveCari, unarchivePersonel, unarchiveUrun, t]);

  const handlePermanentDelete = useCallback(() => {
    if (!selectedItem) return;

    Alert.alert(
      t('common:confirm.deleteTitle'),
      t('common:confirm.deleteMessage', { item: selectedItem.name }),
      [
        { text: t('common:buttons.cancel'), style: 'cancel' },
        {
          text: t('common:buttons.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              if (selectedItem.type === 'hesaplar') {
                await deleteHesap.mutateAsync(selectedItem.id);
              } else if (selectedItem.type === 'tedarikci' || selectedItem.type === 'musteri') {
                await deleteCari.mutateAsync(selectedItem.id);
              } else if (selectedItem.type === 'personel') {
                await deletePersonel.mutateAsync(selectedItem.id);
              } else if (selectedItem.type === 'urunler') {
                await permanentDeleteUrun.mutateAsync(selectedItem.id);
              }
              Alert.alert(t('common:status.success'), t('common:messages.deletedSuccessfully'));
            } catch (error) {
              Alert.alert(
                isLinkedRecordsError(error) ? t('common:errors.cannotDeleteTitle') : t('common:status.error'),
                isLinkedRecordsError(error) ? toErrorMessage(error) : t('common:messages.operationFailed'),
              );
            }
          },
        },
      ]
    );
  }, [selectedItem, deleteHesap, deleteCari, deletePersonel, permanentDeleteUrun, t]);

  // Map tab type to permission module name
  const getPermModule = (type: TabType) => {
    if (type === 'tedarikci' || type === 'musteri') return 'cariler' as const;
    return type as 'hesaplar' | 'personel' | 'urunler';
  };

  const actionSheetOptions: ActionSheetOption[] = (() => {
    const options: ActionSheetOption[] = [];
    const mod = selectedItem ? getPermModule(selectedItem.type) : null;
    const createdBy = selectedItem?.created_by ?? null;

    if (mod && canUpdate(mod, createdBy)) {
      options.push({
        label: t('common:archive.actions.unarchive'),
        icon: <RotateCcw size={20} color={colors.primary} />,
        onPress: handleUnarchive,
      });
    }

    if (mod && canDelete(mod, createdBy)) {
      options.push({
        label: t('common:archive.actions.permanentDelete'),
        icon: <Trash2 size={20} color={colors.error} />,
        onPress: handlePermanentDelete,
        destructive: true,
      });
    }

    return options;
  })();

  // Aktif sekmeye göre tek normalize diziyi kur (FlashList tek liste; tür başına ayrı ScrollView yok).
  const listData = useMemo<ArchiveRow[]>(() => {
    const rows: ArchiveRow[] = [];
    const addHesaplar = () => filteredHesaplar?.forEach((d) => rows.push({ kind: 'hesap', data: d }));
    const addTedarikci = () => filteredTedarikciler?.forEach((d) => rows.push({ kind: 'cari', data: d, cariType: 'tedarikci' }));
    const addMusteri = () => filteredMusteriler?.forEach((d) => rows.push({ kind: 'cari', data: d, cariType: 'musteri' }));
    const addPersonel = () => filteredPersonel?.forEach((d) => rows.push({ kind: 'personel', data: d }));
    const addUrun = () => filteredUrunler?.forEach((d) => rows.push({ kind: 'urun', data: d }));

    switch (activeTab) {
      case 'hepsi':
        addHesaplar();
        addTedarikci();
        addMusteri();
        addPersonel();
        addUrun();
        break;
      case 'hesaplar':
        addHesaplar();
        break;
      case 'tedarikci':
        addTedarikci();
        break;
      case 'musteri':
        addMusteri();
        break;
      case 'personel':
        addPersonel();
        break;
      case 'urunler':
        addUrun();
        break;
    }
    return rows;
  }, [activeTab, filteredHesaplar, filteredTedarikciler, filteredMusteriler, filteredPersonel, filteredUrunler]);

  const keyExtractor = useCallback((item: ArchiveRow) => `${item.kind}-${item.data.id}`, []);
  // Farklı satır tipleri karışık listede — recycling'in yanlış yükseklik/görsel bozulmasını önler.
  const getItemType = useCallback((item: ArchiveRow) => item.kind, []);

  const renderItem = useCallback(
    ({ item }: { item: ArchiveRow }) => {
      switch (item.kind) {
        case 'hesap':
          return <HesapRow data={item.data} onOpen={handleOpen} onMore={handleItemPress} />;
        case 'cari':
          return <CariRow data={item.data} cariType={item.cariType} onOpen={handleOpen} onMore={handleItemPress} />;
        case 'personel':
          return <PersonelRow data={item.data} onOpen={handleOpen} onMore={handleItemPress} />;
        case 'urun':
          return <UrunRow data={item.data} onOpen={handleOpen} onMore={handleItemPress} />;
      }
    },
    [handleOpen, handleItemPress]
  );

  // Header (arama + sekmeler) — memoize'lı ELEMENT (islemler deseni): aynı tip aynı konumda
  // reconcile edildiğinden SearchInput yazarken focus'unu KAYBETMEZ.
  const ListHeader = useMemo(
    () => (
      <View>
        <View style={styles.tabsContainer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {tabs.map((tab) => (
              <TouchableOpacity
                key={tab.key}
                style={[styles.tab, activeTab === tab.key && styles.tabActive]}
                onPress={() => setActiveTab(tab.key)}
              >
                <Text variant="label" style={activeTab === tab.key ? styles.tabTextActive : styles.tabText}>
                  {tab.label}
                </Text>
                {tab.count > 0 && (
                  <View style={[styles.badge, activeTab === tab.key && styles.badgeActive]}>
                    <Text variant="caption" style={activeTab === tab.key ? styles.badgeTextActive : styles.badgeText}>
                      {tab.count}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </View>
    ),
    [tabs, activeTab, t]
  );

  const ListEmpty = useMemo(() => {
    if (isLoading) {
      return <ActivityIndicator size="large" color={colors.primary} style={styles.loader} />;
    }
    return (
      <EmptyState
        icon={<Archive size={48} color={colors.textMuted} />}
        title={t('common:archive.messages.emptyArchive')}
      />
    );
  }, [isLoading, t]);

  const ListFooter = useMemo(
    () =>
      totalArchived > 0 ? (
        <View style={styles.footer}>
          <Text variant="caption" color="secondary">
            {t('common:archive.messages.itemCount', { count: totalArchived })}
          </Text>
        </View>
      ) : null,
    [totalArchived, t]
  );

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <FlashList
        data={listData}
        keyExtractor={keyExtractor}
        getItemType={getItemType}
        renderItem={renderItem}
        ListHeaderComponent={ListHeader}
        ListEmptyComponent={ListEmpty}
        ListFooterComponent={ListFooter}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        // Klavye açıkken kaydırma: dokunuşlar klavyeyi "yakalamasın" (handled) ve
        // sürüklerken klavye temizce kapansın (on-drag). Bunlar olmadan yüzen arama
        // çubuğu, yarım-kalan klavye kare olaylarıyla ekran dışına fırlıyordu.
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} tintColor={colors.primary} />
        }
      />

      {/* Alta sabit yüzen arama çubuğu (Apple Notes tarzı) */}
      <FloatingSearchBar
        value={searchQuery}
        onChangeText={setSearchQuery}
        placeholder={t('common:archive.search.placeholder')}
      />

      {/* Action Sheet */}
      <ActionSheet
        visible={actionSheetVisible}
        onClose={() => {
          setActionSheetVisible(false);
          setSelectedItem(null);
        }}
        title={selectedItem?.name}
        options={actionSheetOptions}
        cancelLabel={t('common:buttons.cancel')}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  listContent: {
    paddingBottom: spacing.xl + FLOATING_SEARCH_CLEARANCE,
  },
  tabsContainer: {
    paddingHorizontal: spacing.lg,
    // Arama üste alınmadan önce üst boşluğu arama kutusu veriyordu; kaldırılınca
    // sekmeler header'a yapışmıştı
    paddingTop: spacing.md,
    marginBottom: spacing.md,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginRight: spacing.sm,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.surface,
    gap: spacing.xs,
  },
  tabActive: {
    backgroundColor: colors.primary,
  },
  tabText: {
    color: colors.textSecondary,
  },
  tabTextActive: {
    color: colors.white,
  },
  badge: {
    backgroundColor: colors.surfaceLight,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
    minWidth: 20,
    alignItems: 'center',
  },
  badgeActive: {
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  badgeText: {
    color: colors.textSecondary,
    fontSize: 11,
  },
  badgeTextActive: {
    color: colors.white,
    fontSize: 11,
  },
  // Yapışık düz-liste görünümü (cariler dili): kart boşluğu yok, ayrım 1px çizgi
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    marginHorizontal: spacing.lg,
    borderRadius: 0,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  itemContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  itemIcon: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemInfo: {
    flex: 1,
    gap: 2,
  },
  itemBalance: {
    alignItems: 'flex-end',
  },
  moreButton: {
    padding: spacing.sm,
  },
  loader: {
    marginTop: spacing['2xl'],
  },
  footer: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  // Pasif öğeler için stiller
  itemCardPassive: {
    opacity: 0.6,
  },
  itemIconPassive: {
    backgroundColor: colors.surfaceLight,
  },
  avatarPassive: {
    backgroundColor: colors.surfaceLight,
  },
  itemNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  passiveIcon: {
    marginLeft: 2,
  },
  textPassive: {
    opacity: 0.7,
  },
});
