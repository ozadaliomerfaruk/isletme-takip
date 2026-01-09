import { View, StyleSheet, TouchableOpacity, ScrollView, Modal, Dimensions, TextInput } from 'react-native';
import { useState, useMemo } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import {
  Tag,
  Search,
  Package,
  FileText,
  ShoppingCart,
  Truck,
  Home,
  Zap,
  Phone,
  Wifi,
  Car,
  Utensils,
  Coffee,
  Gift,
  Heart,
  Star,
  Briefcase,
  Building,
  Building2,
  DollarSign,
  CreditCard,
  Wallet,
  TrendingUp,
  TrendingDown,
  Users,
  User,
  UserCheck,
  UsersRound,
  Settings,
  Wrench,
  Hammer,
  Scissors,
  Paintbrush,
  Camera,
  Monitor,
  Smartphone,
  Laptop,
  Printer,
  HardDrive,
  X,
  Check,
  Folder,
  Archive,
  Bookmark,
  Flag,
  Layers,
  Landmark,
  Banknote,
  Coins,
  PiggyBank,
  Receipt,
  Percent,
  HandCoins,
  CircleDollarSign,
  ChartPie,
  Calculator,
  Badge,
  Clock,
  Award,
  Calendar,
  Plane,
  TrainFront,
  Bus,
  Ship,
  MapPin,
  Navigation,
  Luggage,
  Bed,
  Compass,
  Pizza,
  Salad,
  Beef,
  Egg,
  Milk,
  Wheat,
  IceCreamCone,
  Cake,
  Wine,
  Apple,
  ShoppingBasket,
  ChefHat,
  Croissant,
  Box,
  Store,
  Handshake,
  Contact,
  Barcode,
  Flame,
  Droplet,
  ScrollText,
  FileCheck,
  Megaphone,
  Presentation,
  Clipboard,
  Globe,
  Target,
  ChartBar,
  Sparkles,
  Ribbon,
  CircleHelp,
  CirclePlus,
  CircleMinus,
  HandHelping,
  FileSignature,
  Scale,
  ChartLine,
  Tv,
  Headphones,
  Cog,
  SprayCan,
  Construction,
  CircleAlert,
  type LucideIcon,
} from 'lucide-react-native';
import { Text } from './Text';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { CATEGORY_ICONS } from '@/constants/categoryIcons';

// Lucide icon haritası
const ICON_MAP: Record<string, LucideIcon> = {
  // Genel
  'tag': Tag,
  'star': Star,
  'heart': Heart,
  'gift': Gift,
  'briefcase': Briefcase,
  'folder': Folder,
  'archive': Archive,
  'bookmark': Bookmark,
  'flag': Flag,
  'layers': Layers,

  // Finans
  'wallet': Wallet,
  'credit-card': CreditCard,
  'dollar-sign': DollarSign,
  'trending-up': TrendingUp,
  'trending-down': TrendingDown,
  'landmark': Landmark,
  'banknote': Banknote,
  'coins': Coins,
  'piggy-bank': PiggyBank,
  'receipt': Receipt,
  'percent': Percent,
  'hand-coins': HandCoins,
  'circle-dollar-sign': CircleDollarSign,
  'chart-pie': ChartPie,
  'calculator': Calculator,
  'circle-alert': CircleAlert,

  // Personel
  'users': Users,
  'user': User,
  'user-check': UserCheck,
  'users-round': UsersRound,
  'badge': Badge,
  'clock': Clock,
  'award': Award,
  'calendar': Calendar,

  // Ulaşım & Seyahat
  'car': Car,
  'truck': Truck,
  'plane': Plane,
  'train-front': TrainFront,
  'bus': Bus,
  'ship': Ship,
  'map-pin': MapPin,
  'navigation': Navigation,
  'luggage': Luggage,
  'bed': Bed,
  'compass': Compass,

  // Yiyecek & İçecek
  'utensils': Utensils,
  'coffee': Coffee,
  'pizza': Pizza,
  'salad': Salad,
  'beef': Beef,
  'egg': Egg,
  'milk': Milk,
  'wheat': Wheat,
  'ice-cream-cone': IceCreamCone,
  'cake': Cake,
  'wine': Wine,
  'apple': Apple,
  'shopping-basket': ShoppingBasket,
  'chef-hat': ChefHat,
  'croissant': Croissant,

  // Alışveriş & Tedarik
  'shopping-cart': ShoppingCart,
  'package': Package,
  'box': Box,
  'store': Store,
  'handshake': Handshake,
  'contact': Contact,
  'barcode': Barcode,

  // Faturalar
  'zap': Zap,
  'flame': Flame,
  'droplet': Droplet,
  'wifi': Wifi,
  'phone': Phone,
  'home': Home,
  'file-text': FileText,
  'scroll-text': ScrollText,
  'file-check': FileCheck,

  // İş & Hizmet
  'building': Building,
  'building-2': Building2,
  'settings': Settings,
  'megaphone': Megaphone,
  'presentation': Presentation,
  'clipboard': Clipboard,
  'globe': Globe,
  'target': Target,
  'chart-bar': ChartBar,
  'sparkles': Sparkles,
  'ribbon': Ribbon,
  'circle-help': CircleHelp,
  'circle-plus': CirclePlus,
  'circle-minus': CircleMinus,
  'hand-helping': HandHelping,
  'file-signature': FileSignature,
  'scale': Scale,
  'chart-line': ChartLine,

  // Teknoloji & Ekipman
  'monitor': Monitor,
  'smartphone': Smartphone,
  'laptop': Laptop,
  'printer': Printer,
  'hard-drive': HardDrive,
  'camera': Camera,
  'tv': Tv,
  'headphones': Headphones,
  'cog': Cog,

  // Tamir & Bakım & Temizlik
  'wrench': Wrench,
  'hammer': Hammer,
  'scissors': Scissors,
  'paintbrush': Paintbrush,
  'spray-can': SprayCan,
  'construction': Construction,
};

interface IconPickerProps {
  value: string | null;
  onChange: (iconName: string) => void;
  color?: string;
}

export function IconPicker({ value, onChange, color = colors.primary }: IconPickerProps) {
  const { t } = useTranslation(['common']);
  const [modalVisible, setModalVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const insets = useSafeAreaInsets();
  const windowHeight = Dimensions.get('window').height;

  const selectedIcon = value && ICON_MAP[value] ? ICON_MAP[value] : Tag;
  const SelectedIconComponent = selectedIcon;

  // Arama sonuçlarını filtrele
  const filteredIcons = useMemo(() => {
    if (!searchQuery.trim()) return CATEGORY_ICONS;

    const query = searchQuery.toLowerCase().trim();
    return CATEGORY_ICONS.filter(icon =>
      icon.label.toLowerCase().includes(query) ||
      icon.name.toLowerCase().includes(query)
    );
  }, [searchQuery]);

  const handleSelect = (iconName: string) => {
    onChange(iconName);
    setModalVisible(false);
    setSearchQuery('');
  };

  const handleClose = () => {
    setModalVisible(false);
    setSearchQuery('');
  };

  return (
    <>
      <TouchableOpacity
        style={[styles.trigger, { borderColor: color + '40' }]}
        onPress={() => setModalVisible(true)}
        activeOpacity={0.7}
      >
        <View style={[styles.iconPreview, { backgroundColor: color + '20' }]}>
          <SelectedIconComponent size={24} color={color} />
        </View>
        <Text variant="body" style={styles.triggerText}>
          {value ? CATEGORY_ICONS.find(i => i.name === value)?.label || t('common:select.selectIcon') : t('common:select.selectIcon')}
        </Text>
      </TouchableOpacity>

      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={handleClose}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { height: windowHeight * 0.7, paddingBottom: insets.bottom }]}>
            <View style={styles.modalHeader}>
              <Text variant="h3">{t('common:select.selectIcon')}</Text>
              <TouchableOpacity
                onPress={handleClose}
                style={styles.closeButton}
              >
                <X size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            {/* Arama Barı */}
            <View style={styles.searchContainer}>
              <Search size={20} color={colors.textMuted} style={styles.searchIcon} />
              <TextInput
                style={styles.searchInput}
                placeholder={t('common:search.searchIcons')}
                placeholderTextColor={colors.textMuted}
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearButton}>
                  <X size={18} color={colors.textMuted} />
                </TouchableOpacity>
              )}
            </View>

            <ScrollView
              style={styles.iconGrid}
              contentContainerStyle={styles.iconGridContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {filteredIcons.length === 0 ? (
                <View style={styles.emptyState}>
                  <Search size={48} color={colors.textMuted} />
                  <Text variant="body" color="secondary" style={styles.emptyText}>
                    {t('common:search.noResultsFor', { query: searchQuery })}
                  </Text>
                </View>
              ) : (
                filteredIcons.map((icon) => {
                  const IconComponent = ICON_MAP[icon.name];
                  if (!IconComponent) return null;

                  const isSelected = value === icon.name;

                  return (
                    <TouchableOpacity
                      key={icon.name}
                      style={[
                        styles.iconItem,
                        isSelected && styles.iconItemSelected,
                        isSelected && { borderColor: color },
                      ]}
                      onPress={() => handleSelect(icon.name)}
                      activeOpacity={0.7}
                    >
                      <View style={[
                        styles.iconItemInner,
                        { backgroundColor: isSelected ? color + '20' : colors.surfaceLighter }
                      ]}>
                        <IconComponent size={24} color={isSelected ? color : colors.textSecondary} />
                      </View>
                      <Text
                        variant="caption"
                        color={isSelected ? 'primary' : 'secondary'}
                        numberOfLines={1}
                        style={styles.iconLabel}
                      >
                        {icon.label}
                      </Text>
                      {isSelected && (
                        <View style={[styles.checkBadge, { backgroundColor: color }]}>
                          <Check size={12} color={colors.white} />
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })
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
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceLighter,
    borderRadius: borderRadius.lg,
    marginHorizontal: spacing.lg,
    marginVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  searchIcon: {
    marginRight: spacing.sm,
  },
  searchInput: {
    flex: 1,
    height: 44,
    fontSize: 16,
    color: colors.text,
  },
  clearButton: {
    padding: spacing.xs,
  },
  iconGrid: {
    flex: 1,
  },
  iconGridContent: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: spacing.md,
    paddingBottom: spacing['3xl'],
    gap: spacing.sm,
  },
  iconItem: {
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
  iconItemSelected: {
    borderWidth: 2,
  },
  iconItemInner: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  iconLabel: {
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
});
