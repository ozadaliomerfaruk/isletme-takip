import { View, StyleSheet, TouchableOpacity, ScrollView, Modal, Dimensions } from 'react-native';
import { useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import {
  X,
  Check,
  ChevronRight,
  Folder,
  FolderOpen,
  Tag,
  type LucideIcon,
  Star, Heart, Gift, Briefcase, Archive, Bookmark, Flag, Layers,
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
  TrendingUp,
  TrendingDown,
} from 'lucide-react-native';
import { Text } from './Text';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { useParentKategoriler } from '@/hooks/useKategoriler';
import { KategoriType, Kategori } from '@/types/database';

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
  'circle-plus': CirclePlus, 'circle-minus': CircleMinus, 'hand-helping': HandHelping,
  'file-signature': FileSignature, 'scale': Scale, 'chart-line': ChartLine,
  'monitor': Monitor, 'smartphone': Smartphone, 'laptop': Laptop, 'printer': Printer,
  'hard-drive': HardDrive, 'camera': Camera, 'tv': Tv, 'headphones': Headphones, 'cog': Cog,
  'wrench': Wrench, 'hammer': Hammer, 'scissors': Scissors, 'paintbrush': Paintbrush,
  'spray-can': SprayCan, 'construction': Construction,
};

interface ParentCategoryPickerProps {
  value: string | null;
  onChange: (parentId: string | null) => void;
  type: KategoriType;
  excludeId?: string; // Düzenleme sırasında kendisini ve alt kategorilerini hariç tut
}

export function ParentCategoryPicker({
  value,
  onChange,
  type,
  excludeId,
}: ParentCategoryPickerProps) {
  const { t } = useTranslation(['categories', 'common']);
  const [modalVisible, setModalVisible] = useState(false);
  const insets = useSafeAreaInsets();
  const windowHeight = Dimensions.get('window').height;

  const { data: parentCategories, isLoading } = useParentKategoriler(type);

  // Mevcut kategoriyi bul
  const selectedCategory = parentCategories?.find(c => c.id === value);

  // Düzenlenen kategoriyi ve potansiyel döngüleri hariç tut
  const availableCategories = parentCategories?.filter(c => c.id !== excludeId) || [];

  const handleSelect = (categoryId: string | null) => {
    onChange(categoryId);
    setModalVisible(false);
  };

  const getCategoryIcon = (category: Kategori) => {
    const iconName = category.icon;
    const categoryColor = category.color || colors.primary;

    if (iconName && ICON_MAP[iconName]) {
      const IconComponent = ICON_MAP[iconName];
      return <IconComponent size={24} color={categoryColor} />;
    }

    return <Folder size={24} color={categoryColor} />;
  };

  return (
    <>
      <TouchableOpacity
        style={styles.trigger}
        onPress={() => setModalVisible(true)}
        activeOpacity={0.7}
      >
        {selectedCategory ? (
          <>
            <View style={[styles.iconPreview, { backgroundColor: (selectedCategory.color || colors.primary) + '20' }]}>
              {getCategoryIcon(selectedCategory)}
            </View>
            <Text variant="body" numberOfLines={1} style={styles.triggerText}>
              {selectedCategory.name}
            </Text>
          </>
        ) : (
          <>
            <View style={[styles.iconPreview, { backgroundColor: colors.surfaceLighter }]}>
              <FolderOpen size={24} color={colors.textMuted} />
            </View>
            <Text variant="body" color="secondary" style={styles.triggerText}>
              {t('categories:form.parentCategoryPlaceholder')}
            </Text>
          </>
        )}
      </TouchableOpacity>

      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { height: windowHeight * 0.7, paddingBottom: insets.bottom }]}>
            <View style={styles.modalHeader}>
              <Text variant="h3">{t('categories:form.parentCategory')}</Text>
              <TouchableOpacity
                onPress={() => setModalVisible(false)}
                style={styles.closeButton}
              >
                <X size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.categoryGrid}
              contentContainerStyle={styles.categoryGridContent}
              showsVerticalScrollIndicator={false}
            >
              {/* Ana Kategori (Yok) seçeneği */}
              <TouchableOpacity
                style={[
                  styles.categoryItem,
                  value === null && styles.categoryItemSelected,
                ]}
                onPress={() => handleSelect(null)}
                activeOpacity={0.7}
              >
                <View style={[
                  styles.categoryItemInner,
                  { backgroundColor: value === null ? colors.primary + '20' : colors.surfaceLighter }
                ]}>
                  <FolderOpen size={24} color={value === null ? colors.primary : colors.textMuted} />
                </View>
                <Text
                  variant="caption"
                  color={value === null ? 'primary' : 'secondary'}
                  numberOfLines={2}
                  style={styles.categoryLabel}
                >
                  {t('categories:form.noParent')}
                </Text>
                {value === null && (
                  <View style={[styles.checkBadge, { backgroundColor: colors.primary }]}>
                    <Check size={12} color={colors.white} />
                  </View>
                )}
              </TouchableOpacity>

              {/* Mevcut kategoriler */}
              {availableCategories.map((category) => {
                const isSelected = value === category.id;
                const categoryColor = category.color || colors.primary;

                return (
                  <TouchableOpacity
                    key={category.id}
                    style={[
                      styles.categoryItem,
                      isSelected && styles.categoryItemSelected,
                      isSelected && { borderColor: categoryColor },
                    ]}
                    onPress={() => handleSelect(category.id)}
                    activeOpacity={0.7}
                  >
                    <View style={[
                      styles.categoryItemInner,
                      { backgroundColor: isSelected ? categoryColor + '20' : colors.surfaceLighter }
                    ]}>
                      {getCategoryIcon(category)}
                    </View>
                    <Text
                      variant="caption"
                      color={isSelected ? 'primary' : 'secondary'}
                      numberOfLines={2}
                      style={styles.categoryLabel}
                    >
                      {category.name}
                    </Text>
                    {isSelected && (
                      <View style={[styles.checkBadge, { backgroundColor: categoryColor }]}>
                        <Check size={12} color={colors.white} />
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}

              {availableCategories.length === 0 && !isLoading && (
                <View style={styles.emptyState}>
                  <Folder size={48} color={colors.textMuted} />
                  <Text variant="body" color="secondary" style={styles.emptyText}>
                    {t('categories:messages.noParentCategories')}
                  </Text>
                  <Text variant="caption" color="secondary" style={styles.emptySubtext}>
                    {t('categories:messages.createParentFirst')}
                  </Text>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.md,
  },
  iconPreview: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  triggerText: {
    flex: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  closeButton: {
    padding: spacing.xs,
  },
  categoryGrid: {
    flex: 1,
  },
  categoryGridContent: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: spacing.md,
    paddingBottom: spacing['3xl'],
    gap: spacing.sm,
  },
  categoryItem: {
    width: '23%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xs,
    borderRadius: borderRadius.lg,
    borderWidth: 2,
    borderColor: 'transparent',
    position: 'relative',
  },
  categoryItemSelected: {
    borderWidth: 2,
  },
  categoryItemInner: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  categoryLabel: {
    textAlign: 'center',
    fontSize: 10,
  },
  checkBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyState: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing['3xl'],
  },
  emptyText: {
    marginTop: spacing.md,
    textAlign: 'center',
  },
  emptySubtext: {
    marginTop: spacing.xs,
    textAlign: 'center',
  },
});
