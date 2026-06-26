import { useState } from 'react';
import { View, StyleSheet, ScrollView, Alert, TouchableOpacity, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  Plus,
  TrendingUp,
  TrendingDown,
  Tag,
  Pencil,
  Trash2,
  ChevronRight,
  type LucideIcon,
  Star, Heart, Gift, Briefcase, Folder, Archive, Bookmark, Flag, Layers,
  Wallet, CreditCard, DollarSign, Landmark, Banknote, Coins, PiggyBank, Receipt,
  Percent, HandCoins, CircleDollarSign, ChartPie, Calculator, CircleAlert,
  Users, User, UserCheck, UsersRound, Badge, Clock, Award, Calendar,
  Car, Truck, Plane, TrainFront, Bus, Ship, MapPin, Navigation, Luggage, Bed, Compass,
  Utensils, Coffee, Pizza, Salad, Beef, Egg, Milk, Wheat, IceCreamCone, Cake, Wine, Apple,
  ShoppingBasket, ChefHat, Croissant,
  ShoppingCart, Package, Box, Store, Handshake, Contact, Barcode,
  Zap, Flame, Droplet, Wifi, Phone, Home, FileText, ScrollText, FileCheck,
  Building, Building2, Settings, Megaphone, Presentation, Clipboard, Globe, Target,
  ChartBar, Sparkles, Ribbon, CircleHelp, CirclePlus, CircleMinus, HandHelping,
  FileSignature, Scale, ChartLine,
  Monitor, Smartphone, Laptop, Printer, HardDrive, Camera, Tv, Headphones, Cog,
  Wrench, Hammer, Scissors, Paintbrush, SprayCan, Construction,
} from 'lucide-react-native';
import { Text, Card, TabFilter, EmptyState, Button } from '@/components/ui';
import { UndoSnackbar } from '@/components/ui/UndoSnackbar';
import { useUndoDelete } from '@/hooks/useUndoDelete';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { useKategoriler, useKategorilerHierarchical, useDeleteKategori, FlattenedCategory } from '@/hooks/useKategoriler';
import { KategoriType, Kategori } from '@/types/database';
import { toErrorMessage } from '@/lib/errors';

// Lucide icon haritası
const ICON_MAP: Record<string, LucideIcon> = {
  'tag': Tag, 'star': Star, 'heart': Heart, 'gift': Gift, 'briefcase': Briefcase,
  'folder': Folder, 'archive': Archive, 'bookmark': Bookmark, 'flag': Flag, 'layers': Layers,
  'wallet': Wallet, 'credit-card': CreditCard, 'dollar-sign': DollarSign,
  'trending-up': TrendingUp, 'trending-down': TrendingDown, 'landmark': Landmark,
  'banknote': Banknote, 'coins': Coins, 'piggy-bank': PiggyBank, 'receipt': Receipt,
  'percent': Percent, 'hand-coins': HandCoins, 'circle-dollar-sign': CircleDollarSign,
  'chart-pie': ChartPie, 'calculator': Calculator, 'circle-alert': CircleAlert,
  'users': Users, 'user': User, 'user-check': UserCheck, 'users-round': UsersRound,
  'badge': Badge, 'clock': Clock, 'award': Award, 'calendar': Calendar,
  'car': Car, 'truck': Truck, 'plane': Plane, 'train-front': TrainFront, 'bus': Bus,
  'ship': Ship, 'map-pin': MapPin, 'navigation': Navigation, 'luggage': Luggage,
  'bed': Bed, 'compass': Compass,
  'utensils': Utensils, 'coffee': Coffee, 'pizza': Pizza, 'salad': Salad, 'beef': Beef,
  'egg': Egg, 'milk': Milk, 'wheat': Wheat, 'ice-cream-cone': IceCreamCone, 'cake': Cake,
  'wine': Wine, 'apple': Apple, 'shopping-basket': ShoppingBasket, 'chef-hat': ChefHat,
  'croissant': Croissant,
  'shopping-cart': ShoppingCart, 'package': Package, 'box': Box, 'store': Store,
  'handshake': Handshake, 'contact': Contact, 'barcode': Barcode,
  'zap': Zap, 'flame': Flame, 'droplet': Droplet, 'wifi': Wifi, 'phone': Phone,
  'home': Home, 'file-text': FileText, 'scroll-text': ScrollText, 'file-check': FileCheck,
  'building': Building, 'building-2': Building2, 'settings': Settings, 'megaphone': Megaphone,
  'presentation': Presentation, 'clipboard': Clipboard, 'globe': Globe, 'target': Target,
  'chart-bar': ChartBar, 'sparkles': Sparkles, 'ribbon': Ribbon, 'circle-help': CircleHelp,
  'circle-plus': CirclePlus, 'circle-minus': CircleMinus,
  // Eski varsayılan kategoriler 'plus-circle'/'minus-circle' adıyla kaydedilmiş olabilir → alias
  'plus-circle': CirclePlus, 'minus-circle': CircleMinus,
  'hand-helping': HandHelping,
  'file-signature': FileSignature, 'scale': Scale, 'chart-line': ChartLine,
  'monitor': Monitor, 'smartphone': Smartphone, 'laptop': Laptop, 'printer': Printer,
  'hard-drive': HardDrive, 'camera': Camera, 'tv': Tv, 'headphones': Headphones, 'cog': Cog,
  'wrench': Wrench, 'hammer': Hammer, 'scissors': Scissors, 'paintbrush': Paintbrush,
  'spray-can': SprayCan, 'construction': Construction,
};

export default function KategorilerPage() {
  const router = useRouter();
  const { t } = useTranslation(['categories', 'common', 'errors']);
  const [selectedType, setSelectedType] = useState<KategoriType>('gelir');

  const typeOptions = [
    { label: t('categories:types.gelir'), value: 'gelir' },
    { label: t('categories:types.gider'), value: 'gider' },
    { label: t('categories:types.urun'), value: 'urun' },
  ];

  const { flatList, isLoading, refetch } = useKategorilerHierarchical(selectedType);
  const { refreshing, onRefresh } = usePullToRefresh(refetch);
  const { data: allKategoriler } = useKategoriler();
  const deleteKategori = useDeleteKategori();
  const {
    pendingDeleteIds,
    requestDelete,
    undoDelete,
    dismissDelete,
    snackbar: undoSnackbar,
  } = useUndoDelete<FlattenedCategory>({
    onCommitDelete: async (id: string) => {
      await deleteKategori.mutateAsync(id);
    },
    onError: (error) => {
      Alert.alert(t('common:status.error'), toErrorMessage(error) || t('errors:category.deleteFailed'));
    },
  });

  // Kategori id -> name map (eşleme badge'leri için)
  const kategoriNameMap = new Map(allKategoriler?.map(k => [k.id, k.name]) || []);

  const handleDelete = (item: FlattenedCategory) => {
    if (item.hasChildren) {
      Alert.alert(
        t('categories:deleteConfirm.title'),
        t('categories:deleteConfirm.messageWithChildren', { name: item.name }),
        [
          { text: t('common:buttons.cancel'), style: 'cancel' },
          {
            text: t('common:buttons.delete'),
            style: 'destructive',
            onPress: () => requestDelete(item.id, item, item.name),
          },
        ]
      );
    } else {
      requestDelete(item.id, item, item.name);
    }
  };

  const getCategoryIcon = (kategori: FlattenedCategory) => {
    const categoryColor = kategori.color || colors.primary;
    const iconName = kategori.icon;

    if (iconName && ICON_MAP[iconName]) {
      const IconComponent = ICON_MAP[iconName];
      return <IconComponent size={20} color={categoryColor} />;
    }

    // Varsayılan icon
    if (kategori.type === 'urun') {
      return <Package size={20} color={colors.primary} />;
    }
    return kategori.type === 'gelir' ? (
      <TrendingUp size={20} color={colors.success} />
    ) : (
      <TrendingDown size={20} color={colors.error} />
    );
  };

  const getCategoryBgColor = (kategori: FlattenedCategory) => {
    const categoryColor = kategori.color || (kategori.type === 'urun' ? colors.primary : kategori.type === 'gelir' ? colors.success : colors.error);
    return categoryColor + '20';
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
        <ScrollView
          style={styles.scrollView}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} tintColor={colors.primary} />
          }
        >
          {/* Tip Filtresi */}
          <View style={styles.filterContainer}>
            <TabFilter
              options={typeOptions}
              value={selectedType}
              onChange={(value) => setSelectedType(value as KategoriType)}
            />
          </View>

          {/* Kategori Ekle Butonu */}
          <View style={styles.addButtonContainer}>
            <Button
              variant="primary"
              size="md"
              icon={<Plus size={18} color={colors.surface} />}
              onPress={() => router.push('/kategoriler/ekle')}
            >
              {t('categories:titles.addCategory')}
            </Button>
          </View>

          {/* Kategori Listesi */}
          <View style={styles.content}>
            {isLoading ? (
              <View style={styles.loadingContainer}>
                <Text color="secondary">{t('common:status.loading')}</Text>
              </View>
            ) : !flatList || flatList.filter(k => !pendingDeleteIds.has(k.id)).length === 0 ? (
              <EmptyState
                icon={<Tag size={48} color={colors.textMuted} />}
                title={selectedType === 'gelir' ? t('categories:messages.noIncomeCategory') : selectedType === 'gider' ? t('categories:messages.noExpenseCategory') : t('categories:messages.noProductCategory')}
                description={t('categories:messages.addFirst')}
                actionLabel={t('categories:titles.addCategory')}
                onAction={() => router.push('/kategoriler/ekle')}
              />
            ) : (
              <Card padding="none">
                {flatList.filter(k => !pendingDeleteIds.has(k.id)).map((kategori, index) => (
                  <View key={kategori.id}>
                    {index > 0 && <View style={[styles.divider, { marginLeft: spacing.lg + 40 + spacing.md + (kategori.level * 24) }]} />}
                    <View style={[styles.kategoriItem, { paddingLeft: spacing.lg + (kategori.level * 24) }]}>
                      <View
                        style={[
                          styles.kategoriIcon,
                          { backgroundColor: getCategoryBgColor(kategori) },
                        ]}
                      >
                        {getCategoryIcon(kategori)}
                      </View>
                      <View style={styles.kategoriInfo}>
                        <View style={styles.kategoriNameRow}>
                          <Text variant="body">{kategori.name}</Text>
                          {kategori.hasChildren && (
                            <View style={styles.childIndicator}>
                              <ChevronRight size={14} color={colors.textMuted} />
                            </View>
                          )}
                        </View>
                        <Text variant="caption" color="secondary">
                          {kategori.level > 0 ? t('categories:typeLabels.subCategory') : (kategori.type === 'gelir' ? t('categories:typeLabels.incomeCategory') : kategori.type === 'gider' ? t('categories:typeLabels.expenseCategory') : t('categories:typeLabels.productCategory'))}
                        </Text>
                        {kategori.type === 'urun' && (kategori.mapped_gider_kategori_id || kategori.mapped_gelir_kategori_id) && (
                          <View style={styles.mappingBadges}>
                            {kategori.mapped_gider_kategori_id && (
                              <View style={[styles.mappingBadge, { backgroundColor: colors.errorLight }]}>
                                <TrendingDown size={10} color={colors.error} />
                                <Text style={[styles.mappingBadgeText, { color: colors.error }]}>
                                  {kategoriNameMap.get(kategori.mapped_gider_kategori_id) || '?'}
                                </Text>
                              </View>
                            )}
                            {kategori.mapped_gelir_kategori_id && (
                              <View style={[styles.mappingBadge, { backgroundColor: colors.successLight }]}>
                                <TrendingUp size={10} color={colors.success} />
                                <Text style={[styles.mappingBadgeText, { color: colors.success }]}>
                                  {kategoriNameMap.get(kategori.mapped_gelir_kategori_id) || '?'}
                                </Text>
                              </View>
                            )}
                          </View>
                        )}
                      </View>
                      <View style={styles.kategoriActions}>
                        <TouchableOpacity
                          style={styles.actionButton}
                          onPress={() =>
                            router.push({
                              pathname: '/kategoriler/duzenle/[id]',
                              params: { id: kategori.id },
                            })
                          }
                        >
                          <Pencil size={18} color={colors.textMuted} />
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.actionButton}
                          onPress={() => handleDelete(kategori)}
                        >
                          <Trash2 size={18} color={colors.error} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                ))}
              </Card>
            )}
          </View>

          {/* Bilgi */}
          <View style={styles.infoContainer}>
            <Text variant="caption" color="muted" style={styles.infoText}>
              {t('categories:messages.infoText')}
            </Text>
          </View>
        </ScrollView>
      <UndoSnackbar
        visible={undoSnackbar.visible}
        message={undoSnackbar.message}
        onUndo={undoDelete}
        onDismiss={dismissDelete}
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
  filterContainer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
  },
  addButtonContainer: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  content: {
    paddingHorizontal: spacing.lg,
  },
  loadingContainer: {
    padding: spacing.xl,
    alignItems: 'center',
  },
  kategoriItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    gap: spacing.md,
  },
  kategoriIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kategoriInfo: {
    flex: 1,
  },
  kategoriNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  childIndicator: {
    opacity: 0.5,
  },
  kategoriActions: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  actionButton: {
    padding: spacing.sm,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginLeft: spacing.lg + 40 + spacing.md,
  },
  mappingBadges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 3,
  },
  mappingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  mappingBadgeText: {
    fontSize: 10,
    fontWeight: '600',
  },
  infoContainer: {
    padding: spacing.lg,
    paddingTop: spacing.xl,
  },
  infoText: {
    textAlign: 'center',
  },
});
