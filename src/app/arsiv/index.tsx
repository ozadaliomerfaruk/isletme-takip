import { useState, useCallback } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  Archive,
  Wallet,
  Users,
  UserCircle,
  Truck,
  Package,
  MoreVertical,
  RotateCcw,
  Trash2,
  EyeOff,
} from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Text, Card, SearchInput, EmptyState, TabFilter, ActionSheet, type ActionSheetOption } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { formatCurrency, toNumber } from '@/lib/currency';
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
  useArchiveCounts,
} from '@/hooks/useArchive';
import { useDeleteHesap } from '@/hooks/useHesaplar';
import { useDeleteCari } from '@/hooks/useCariler';
import { useDeletePersonel } from '@/hooks/usePersonel';
import { usePermanentDeleteUrun } from '@/hooks/useUrunler';
import type { Hesap, Cari, Personel, Urun, BirimType } from '@/types/database';

type TabType = 'hesaplar' | 'tedarikci' | 'musteri' | 'personel' | 'urunler';

export default function ArsivPage() {
  const router = useRouter();
  const { t } = useTranslation(['common', 'accounts', 'clients', 'staff', 'products']);
  const [activeTab, setActiveTab] = useState<TabType>('hesaplar');
  const [searchQuery, setSearchQuery] = useState('');
  const [actionSheetVisible, setActionSheetVisible] = useState(false);
  const [selectedItem, setSelectedItem] = useState<{ id: string; type: TabType; name: string } | null>(null);

  // Archive counts
  const { data: counts } = useArchiveCounts();

  // Data queries
  const { data: hesaplar, isLoading: hesaplarLoading } = useArchivedHesaplar();
  const { data: tedarikciler, isLoading: tedarikciLoading } = useArchivedCariler('tedarikci');
  const { data: musteriler, isLoading: musteriLoading } = useArchivedCariler('musteri');
  const { data: personelList, isLoading: personelLoading } = useArchivedPersonel();
  const { data: urunler, isLoading: urunlerLoading } = useArchivedUrunler();

  // Mutations
  const unarchiveHesap = useUnarchiveHesap();
  const unarchiveCari = useUnarchiveCari();
  const unarchivePersonel = useUnarchivePersonel();
  const unarchiveUrun = useUnarchiveUrun();
  const deleteHesap = useDeleteHesap();
  const deleteCari = useDeleteCari();
  const deletePersonel = useDeletePersonel();
  const permanentDeleteUrun = usePermanentDeleteUrun();

  const tabs = [
    { key: 'hesaplar' as TabType, label: t('common:archive.tabs.accounts'), count: counts?.hesaplar || 0 },
    { key: 'tedarikci' as TabType, label: t('common:archive.tabs.suppliers'), count: counts?.tedarikci || 0 },
    { key: 'musteri' as TabType, label: t('common:archive.tabs.customers'), count: counts?.musteri || 0 },
    { key: 'personel' as TabType, label: t('common:archive.tabs.staff'), count: counts?.personel || 0 },
    { key: 'urunler' as TabType, label: t('common:archive.tabs.products'), count: counts?.urunler || 0 },
  ];

  const isLoading =
    (activeTab === 'hesaplar' && hesaplarLoading) ||
    (activeTab === 'tedarikci' && tedarikciLoading) ||
    (activeTab === 'musteri' && musteriLoading) ||
    (activeTab === 'personel' && personelLoading) ||
    (activeTab === 'urunler' && urunlerLoading);

  // Filtered data based on search
  const filteredHesaplar = hesaplar?.filter((h) =>
    h.name.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const filteredTedarikciler = tedarikciler?.filter((c) =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const filteredMusteriler = musteriler?.filter((c) =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const filteredPersonel = personelList?.filter((p) =>
    `${p.first_name} ${p.last_name}`.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const filteredUrunler = urunler?.filter((u) =>
    u.ad.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (u.kod && u.kod.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const handleItemPress = useCallback((id: string, type: TabType, name: string) => {
    setSelectedItem({ id, type, name });
    setActionSheetVisible(true);
  }, []);

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
              Alert.alert(t('common:status.error'), t('common:messages.operationFailed'));
            }
          },
        },
      ]
    );
  }, [selectedItem, deleteHesap, deleteCari, deletePersonel, permanentDeleteUrun, t]);

  const actionSheetOptions: ActionSheetOption[] = [
    {
      label: t('common:archive.actions.unarchive'),
      icon: <RotateCcw size={20} color={colors.primary} />,
      onPress: handleUnarchive,
    },
    {
      label: t('common:archive.actions.permanentDelete'),
      icon: <Trash2 size={20} color={colors.error} />,
      onPress: handlePermanentDelete,
      destructive: true,
    },
  ];

  const renderHesapItem = (hesap: Hesap) => {
    const isPassive = hesap.is_active === false;
    return (
      <Card key={hesap.id} style={[styles.itemCard, isPassive && styles.itemCardPassive]}>
        <TouchableOpacity
          style={styles.itemContent}
          onPress={() => router.push(`/hesaplar/${hesap.id}`)}
          activeOpacity={0.7}
        >
          <View style={[styles.itemIcon, isPassive && styles.itemIconPassive]}>
            <Wallet size={20} color={isPassive ? colors.textMuted : colors.primary} />
          </View>
          <View style={styles.itemInfo}>
            <View style={styles.itemNameRow}>
              <Text variant="body" style={isPassive && styles.textPassive}>{hesap.name}</Text>
              {isPassive && <EyeOff size={14} color={colors.textMuted} style={styles.passiveIcon} />}
            </View>
            <Text variant="caption" color="secondary">
              {t(`accounts:typeLabels.${hesap.type}`)}
            </Text>
          </View>
          <View style={styles.itemBalance}>
            <Text variant="body" color={toNumber(hesap.balance) >= 0 ? 'success' : 'error'} style={isPassive && styles.textPassive}>
              {formatCurrency(toNumber(hesap.balance), hesap.currency)}
            </Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.moreButton}
          onPress={() => handleItemPress(hesap.id, 'hesaplar', hesap.name)}
        >
          <MoreVertical size={20} color={colors.textMuted} />
        </TouchableOpacity>
      </Card>
    );
  };

  const renderCariItem = (cari: Cari, type: 'tedarikci' | 'musteri') => {
    const isPassive = cari.is_active === false;
    const iconColor = type === 'tedarikci' ? colors.warning : colors.success;
    const iconBgColor = type === 'tedarikci' ? colors.warningLight : colors.successLight;
    return (
      <Card key={cari.id} style={[styles.itemCard, isPassive && styles.itemCardPassive]}>
        <TouchableOpacity
          style={styles.itemContent}
          onPress={() => router.push(`/cariler/${cari.id}`)}
          activeOpacity={0.7}
        >
          <View style={[styles.itemIcon, { backgroundColor: isPassive ? colors.surfaceLight : iconBgColor }, isPassive && styles.itemIconPassive]}>
            {type === 'tedarikci' ? (
              <Truck size={20} color={isPassive ? colors.textMuted : iconColor} />
            ) : (
              <Users size={20} color={isPassive ? colors.textMuted : iconColor} />
            )}
          </View>
          <View style={styles.itemInfo}>
            <View style={styles.itemNameRow}>
              <Text variant="body" style={isPassive && styles.textPassive}>{cari.name}</Text>
              {isPassive && <EyeOff size={14} color={colors.textMuted} style={styles.passiveIcon} />}
            </View>
            {cari.phone && (
              <Text variant="caption" color="secondary">
                {cari.phone}
              </Text>
            )}
          </View>
          <View style={styles.itemBalance}>
            <Text variant="body" color={toNumber(cari.balance) >= 0 ? 'success' : 'error'} style={isPassive && styles.textPassive}>
              {formatCurrency(Math.abs(toNumber(cari.balance)), cari.currency)}
            </Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.moreButton}
          onPress={() => handleItemPress(cari.id, type, cari.name)}
        >
          <MoreVertical size={20} color={colors.textMuted} />
        </TouchableOpacity>
      </Card>
    );
  };

  const renderPersonelItem = (personel: Personel) => {
    const isPassive = personel.is_active === false;
    return (
      <Card key={personel.id} style={[styles.itemCard, isPassive && styles.itemCardPassive]}>
        <TouchableOpacity
          style={styles.itemContent}
          onPress={() => router.push(`/personel/${personel.id}`)}
          activeOpacity={0.7}
        >
          <View style={[styles.avatar, isPassive && styles.avatarPassive]}>
            <Text variant="caption" style={{ color: isPassive ? colors.textMuted : colors.primary }}>
              {getInitials(`${personel.first_name} ${personel.last_name}`)}
            </Text>
          </View>
          <View style={styles.itemInfo}>
            <View style={styles.itemNameRow}>
              <Text variant="body" style={isPassive && styles.textPassive}>
                {personel.first_name} {personel.last_name}
              </Text>
              {isPassive && <EyeOff size={14} color={colors.textMuted} style={styles.passiveIcon} />}
            </View>
            {personel.position && (
              <Text variant="caption" color="secondary">
                {personel.position}
              </Text>
            )}
          </View>
          <View style={styles.itemBalance}>
            <Text variant="body" color={toNumber(personel.balance) >= 0 ? 'success' : 'error'} style={isPassive && styles.textPassive}>
              {formatCurrency(Math.abs(toNumber(personel.balance)), personel.currency)}
            </Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.moreButton}
          onPress={() => handleItemPress(personel.id, 'personel', `${personel.first_name} ${personel.last_name}`)}
        >
          <MoreVertical size={20} color={colors.textMuted} />
        </TouchableOpacity>
      </Card>
    );
  };

  const getBirimLabel = (birim: BirimType) => {
    return t(`products:units.${birim}`);
  };

  const renderUrunItem = (urun: Urun) => {
    const isPassive = urun.is_active === false;
    return (
      <Card key={urun.id} style={[styles.itemCard, isPassive && styles.itemCardPassive]}>
        <TouchableOpacity
          style={styles.itemContent}
          onPress={() => router.push(`/urunler/${urun.id}`)}
          activeOpacity={0.7}
        >
          <View style={[styles.itemIcon, { backgroundColor: isPassive ? colors.surfaceLight : colors.primaryLight }, isPassive && styles.itemIconPassive]}>
            <Package size={20} color={isPassive ? colors.textMuted : colors.primary} />
          </View>
          <View style={styles.itemInfo}>
            <View style={styles.itemNameRow}>
              <Text variant="body" style={isPassive && styles.textPassive}>{urun.ad}</Text>
              {isPassive && <EyeOff size={14} color={colors.textMuted} style={styles.passiveIcon} />}
            </View>
            <Text variant="caption" color="secondary">
              {urun.miktar} {getBirimLabel(urun.birim)}
              {urun.kod && ` • ${urun.kod}`}
            </Text>
          </View>
          <View style={styles.itemBalance}>
            {urun.satis_fiyati > 0 && (
              <Text variant="body" color="primary" style={isPassive && styles.textPassive}>
                {formatCurrency(urun.satis_fiyati, urun.currency)}
              </Text>
            )}
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.moreButton}
          onPress={() => handleItemPress(urun.id, 'urunler', urun.ad)}
        >
          <MoreVertical size={20} color={colors.textMuted} />
        </TouchableOpacity>
      </Card>
    );
  };

  const renderContent = () => {
    if (isLoading) {
      return <ActivityIndicator size="large" color={colors.primary} style={styles.loader} />;
    }

    let items: React.ReactNode[] = [];
    let isEmpty = false;

    switch (activeTab) {
      case 'hesaplar':
        items = filteredHesaplar?.map(renderHesapItem) || [];
        isEmpty = !filteredHesaplar || filteredHesaplar.length === 0;
        break;
      case 'tedarikci':
        items = filteredTedarikciler?.map((c) => renderCariItem(c, 'tedarikci')) || [];
        isEmpty = !filteredTedarikciler || filteredTedarikciler.length === 0;
        break;
      case 'musteri':
        items = filteredMusteriler?.map((c) => renderCariItem(c, 'musteri')) || [];
        isEmpty = !filteredMusteriler || filteredMusteriler.length === 0;
        break;
      case 'personel':
        items = filteredPersonel?.map(renderPersonelItem) || [];
        isEmpty = !filteredPersonel || filteredPersonel.length === 0;
        break;
      case 'urunler':
        items = filteredUrunler?.map(renderUrunItem) || [];
        isEmpty = !filteredUrunler || filteredUrunler.length === 0;
        break;
    }

    if (isEmpty) {
      return (
        <EmptyState
          icon={<Archive size={48} color={colors.textMuted} />}
          title={t('common:archive.messages.emptyArchive')}
        />
      );
    }

    return <View style={styles.listContainer}>{items}</View>;
  };

  const totalArchived = (counts?.hesaplar || 0) + (counts?.tedarikci || 0) + (counts?.musteri || 0) + (counts?.personel || 0) + (counts?.urunler || 0);

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Search */}
        <View style={styles.searchContainer}>
          <SearchInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder={t('common:archive.search.placeholder')}
          />
        </View>

        {/* Tabs */}
        <View style={styles.tabsContainer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {tabs.map((tab) => (
              <TouchableOpacity
                key={tab.key}
                style={[styles.tab, activeTab === tab.key && styles.tabActive]}
                onPress={() => setActiveTab(tab.key)}
              >
                <Text
                  variant="label"
                  style={activeTab === tab.key ? styles.tabTextActive : styles.tabText}
                >
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

        {/* Content */}
        {renderContent()}

        {/* Footer */}
        {totalArchived > 0 && (
          <View style={styles.footer}>
            <Text variant="caption" color="secondary">
              {t('common:archive.messages.itemCount', { count: totalArchived })}
            </Text>
          </View>
        )}
      </ScrollView>

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
  scrollView: {
    flex: 1,
  },
  searchContainer: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  tabsContainer: {
    paddingHorizontal: spacing.lg,
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
  listContainer: {
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
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
