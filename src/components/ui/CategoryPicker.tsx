import { View, StyleSheet, TouchableOpacity, TouchableWithoutFeedback, ScrollView, Modal, Dimensions, Keyboard, Platform, type StyleProp, type ViewStyle } from 'react-native';
import { useState, useMemo, useCallback, useEffect } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import {
  Check,
  ChevronDown,
  Search,
  Tag,
  Folder,
  Plus,
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
  CornerDownRight,
} from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Text } from './Text';
import { FloatingSearchBar, FLOATING_SEARCH_CLEARANCE } from './FloatingSearchBar';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { useKategorilerHierarchical, FlattenedCategory } from '@/hooks/useKategoriler';
import { usePermissions } from '@/hooks/usePermissions';
import { KategoriType } from '@/types/database';
import { searchMatchesTr, upperTr } from '@/lib/turkishTextUtils';

/**
 * Kategori adını EKRAN için büyütür (display-only; stored isim değişmez).
 * Ürün kategorilerine (type==='urun') DOKUNMAZ — bilinçli kapsam dışı.
 */
const catDisplay = (name: string, type?: KategoriType) =>
  type === 'urun' ? name : upperTr(name);

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

interface CategoryPickerProps {
  value: string | null;
  onChange: (categoryId: string | null) => void;
  type?: KategoriType;
  label?: string;
  placeholder?: string;
  optional?: boolean;
  error?: string;
  disabled?: boolean;
  disabledMessage?: string;
  onNavigateAway?: () => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  containerStyle?: StyleProp<ViewStyle>;
  /** Kapalı-durum satırının stil override'ı (ör. QTB düz-liste görünümü:
   *  kutu yerine çizgili satır). Verilmezse varsayılan kutu görünümü değişmez. */
  triggerStyle?: StyleProp<ViewStyle>;
}

export function CategoryPicker({
  value,
  onChange,
  type,
  label,
  placeholder,
  optional = true,
  error,
  disabled = false,
  disabledMessage,
  onNavigateAway,
  open: externalOpen,
  onOpenChange,
  containerStyle,
  triggerStyle,
}: CategoryPickerProps) {
  const router = useRouter();
  const { t } = useTranslation(['common', 'categories']);
  const { canCreate: canCreateCategory } = usePermissions();
  const [internalOpen, setInternalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const insets = useSafeAreaInsets();
  const windowHeight = Dimensions.get('window').height;

  // Keyboard visibility tracking
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSubscription = Keyboard.addListener(showEvent, () => {
      setIsKeyboardVisible(true);
    });
    const hideSubscription = Keyboard.addListener(hideEvent, () => {
      setIsKeyboardVisible(false);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  // Controlled/uncontrolled pattern
  const isControlled = externalOpen !== undefined;
  const modalVisible = isControlled ? externalOpen : internalOpen;

  const setModalVisible = useCallback((open: boolean) => {
    if (isControlled) {
      onOpenChange?.(open);
    } else {
      setInternalOpen(open);
    }
  }, [isControlled, onOpenChange]);

  // Use translations for defaults.
  // NOT: label === '' (boş string) BİLİNÇLİ olarak "etiket gösterme" demektir → ?? ile
  // koru (|| boş string'i sessizce default'a düşürüyordu; label="" geçen çağıranların
  // niyeti etiketi gizlemekti). undefined/atlanmış → default "Kategori".
  const displayLabel = label ?? t('common:labels.category');
  const displayPlaceholder = placeholder || t('common:select.selectCategory');

  const { flatList, isLoading } = useKategorilerHierarchical(type);

  // Seçili kategoriyi bul
  const selectedCategory = flatList?.find(c => c.id === value);

  // Filtrelenmiş kategori listesi
  const filteredList = useMemo(() => {
    if (!flatList || !searchQuery.trim()) return flatList;
    return flatList.filter(c => searchMatchesTr(c.name, searchQuery));
  }, [flatList, searchQuery]);

  const handleSelect = (categoryId: string | null) => {
    onChange(categoryId);
    setModalVisible(false);
    setSearchQuery('');
  };

  // İki adımlı kapanış (QTB backdrop'la aynı): klavye açıkken dışarı dokunuş
  // önce yalnız klavyeyi kapatır — picker'dan istemeden çıkılmaz.
  const handleCloseModal = () => {
    if (isKeyboardVisible) {
      Keyboard.dismiss();
      return;
    }
    setModalVisible(false);
    setSearchQuery('');
  };

  const handleAddCategory = () => {
    setModalVisible(false);
    setSearchQuery('');
    onNavigateAway?.();
    router.push(`/kategoriler/ekle?type=${type}`);
  };

  const getCategoryIcon = (category: FlattenedCategory, size: number = 20) => {
    const iconName = category.icon;
    const isGelir = category.type === 'gelir';
    const isUrun = category.type === 'urun';
    const defaultColor = isUrun ? colors.primary : isGelir ? colors.success : colors.error;
    const categoryColor = category.color || defaultColor;

    if (iconName && ICON_MAP[iconName]) {
      const IconComponent = ICON_MAP[iconName];
      return <IconComponent size={size} color={categoryColor} />;
    }

    // Varsayılan icon - kategorinin kendi tipine göre
    if (isUrun) {
      return <Package size={size} color={colors.primary} />;
    }
    return isGelir ? (
      <TrendingUp size={size} color={colors.success} />
    ) : (
      <TrendingDown size={size} color={colors.error} />
    );
  };

  const getCategoryBgColor = (category: FlattenedCategory) => {
    const isGelir = category.type === 'gelir';
    const isUrun = category.type === 'urun';
    const defaultColor = isUrun ? colors.primary : isGelir ? colors.success : colors.error;
    const categoryColor = category.color || defaultColor;
    return categoryColor + '20';
  };

  return (
    <>
      <View style={[styles.container, containerStyle]}>
        {displayLabel ? (
          <Text variant="label" color="secondary" style={styles.label}>
            {displayLabel}{optional ? ` ${t('common:labels.optionalSuffix')}` : ''}
          </Text>
        ) : null}
        <TouchableOpacity
          style={[styles.trigger, triggerStyle, error && styles.triggerError, disabled && styles.triggerDisabled]}
          onPress={() => !disabled && setModalVisible(true)}
          activeOpacity={disabled ? 1 : 0.7}
          disabled={disabled}
        >
          {disabled && disabledMessage ? (
            <Text variant="body" color="muted">
              {disabledMessage}
            </Text>
          ) : selectedCategory ? (
            <View style={styles.selectedContent}>
              <View style={[styles.selectedIcon, { backgroundColor: getCategoryBgColor(selectedCategory) }]}>
                {getCategoryIcon(selectedCategory, 16)}
              </View>
              <Text variant="body" numberOfLines={1} style={styles.selectedText}>
                {selectedCategory.level > 0 && '└ '}
                {catDisplay(selectedCategory.name, selectedCategory.type)}
              </Text>
            </View>
          ) : (
            <Text variant="body" color="secondary">
              {displayPlaceholder}
            </Text>
          )}
          <ChevronDown size={20} color={disabled ? colors.border : colors.textMuted} />
        </TouchableOpacity>
        {error && (
          <Text variant="caption" color="error" style={styles.errorText}>
            {error}
          </Text>
        )}
      </View>

      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={handleCloseModal}
      >
        <TouchableWithoutFeedback onPress={handleCloseModal}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback onPress={() => {}}>
              <View style={[styles.modalContent, { height: windowHeight * 0.85, paddingBottom: insets.bottom }]}>
                <View style={styles.modalHeader}>
              <Text variant="h3">{t('common:select.selectLabel', { label: displayLabel })}</Text>
              {/* Ana sayfa sticky header'larındaki AddEntityButton ile aynı görünüm.
                  Kapatma X'i yok: modal dışına dokununca zaten kapanıyor. */}
              {canCreateCategory('kategoriler') && (
                <TouchableOpacity
                  onPress={handleAddCategory}
                  style={styles.addButton}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                >
                  <Plus size={18} color={colors.white} />
                  <Text style={styles.addButtonText}>
                    {upperTr(t('categories:titles.addCategory'))}
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            <ScrollView
              style={styles.categoryList}
              contentContainerStyle={styles.categoryListContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
            >
              {/* Kategori yok seçeneği - arama yokken göster */}
              {optional && !searchQuery.trim() && (
                <TouchableOpacity
                  style={[
                    styles.categoryItem,
                    value === null && styles.categoryItemSelected,
                  ]}
                  onPress={() => handleSelect(null)}
                  activeOpacity={0.7}
                >
                  <View style={styles.categoryItemLeft}>
                    <View style={[styles.iconContainer, { backgroundColor: colors.surfaceLighter }]}>
                      <Tag size={20} color={colors.textMuted} />
                    </View>
                    <Text variant="body" style={value === null && { color: colors.primary }}>
                      {t('common:empty.noCategory')}
                    </Text>
                  </View>
                  {value === null && (
                    <View style={[styles.checkIcon, { backgroundColor: colors.primary }]}>
                      <Check size={14} color={colors.white} />
                    </View>
                  )}
                </TouchableOpacity>
              )}

              {/* Kategoriler listesi */}
              {filteredList?.map((category) => {
                const isSelected = value === category.id;
                const categoryColor = category.color || colors.primary;
                const isSubcategory = category.level > 0;

                return (
                  <TouchableOpacity
                    key={category.id}
                    style={[
                      styles.categoryItem,
                      isSelected && styles.categoryItemSelected,
                      isSubcategory && styles.subcategoryItem,
                    ]}
                    onPress={() => handleSelect(category.id)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.categoryItemLeft}>
                      {isSubcategory && (
                        <View style={styles.subcategoryIndicator}>
                          <CornerDownRight size={14} color={colors.textMuted} />
                        </View>
                      )}
                      <View style={[styles.iconContainer, { backgroundColor: getCategoryBgColor(category) }]}>
                        {getCategoryIcon(category)}
                      </View>
                      <View style={styles.categoryInfo}>
                        <Text
                          variant="body"
                          numberOfLines={1}
                          style={isSelected && { color: colors.primary }}
                        >
                          {catDisplay(category.name, category.type)}
                        </Text>
                        {isSubcategory && (
                          <Text variant="caption" color="secondary">
                            {t('common:labels.subCategory')}
                          </Text>
                        )}
                      </View>
                    </View>
                    {isSelected && (
                      <View style={[styles.checkIcon, { backgroundColor: categoryColor }]}>
                        <Check size={14} color={colors.white} />
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}

              {/* No search results */}
              {searchQuery.trim() && filteredList?.length === 0 && (
                <View style={styles.emptyState}>
                  <Search size={48} color={colors.textMuted} />
                  <Text variant="body" color="secondary" style={styles.emptyText}>
                    {t('common:search.noResultsFor', { query: searchQuery })}
                  </Text>
                </View>
              )}

              {/* No categories */}
              {!searchQuery.trim() && (!flatList || flatList.length === 0) && !isLoading && (
                <View style={styles.emptyState}>
                  <Folder size={48} color={colors.textMuted} />
                  <Text variant="body" color="secondary" style={styles.emptyText}>
                    {t('common:empty.noCategoriesYet')}
                  </Text>
                </View>
              )}
            </ScrollView>

            {/* Sheet'in altında yüzen arama çubuğu (Apple Notes tarzı).
                bottomOffset: modal pencere dibine dayandığından home indicator payı. */}
            <FloatingSearchBar
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder={t('common:search.searchCategories')}
              bottomOffset={spacing.lg + insets.bottom + spacing.md}
            />
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.lg,
  },
  label: {
    marginBottom: spacing.sm,
  },
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    height: 46,
    paddingHorizontal: spacing.lg,
  },
  triggerError: {
    borderColor: colors.error,
  },
  triggerDisabled: {
    backgroundColor: colors.surfaceLighter,
    opacity: 0.6,
  },
  selectedContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  selectedIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  selectedText: {
    flex: 1,
  },
  errorText: {
    marginTop: spacing.xs,
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
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    height: 36,
    paddingHorizontal: 12,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary,
  },
  addButtonText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '700',
  },
  categoryList: {
    flex: 1,
  },
  categoryListContent: {
    padding: spacing.md,
    paddingBottom: spacing['3xl'] + FLOATING_SEARCH_CLEARANCE,
  },
  categoryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    backgroundColor: colors.surfaceLighter,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.sm,
  },
  categoryItemSelected: {
    backgroundColor: colors.primaryLight + '30',
    borderWidth: 1,
    borderColor: colors.primary,
  },
  subcategoryItem: {
    marginLeft: spacing.lg,
  },
  subcategoryIndicator: {
    marginRight: spacing.xs,
  },
  categoryItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  categoryInfo: {
    flex: 1,
  },
  checkIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing['3xl'],
  },
  emptyText: {
    marginTop: spacing.md,
    textAlign: 'center',
  },
});
