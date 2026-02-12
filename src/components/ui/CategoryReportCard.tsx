import { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, LayoutAnimation, Platform, UIManager } from 'react-native';
import {
  ChevronRight,
  ChevronDown,
  Tag,
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
import { formatCurrency } from '@/lib/currency';
import { CategoryReportItem, HierarchicalCategoryReportItem } from '@/hooks/useCategoryReport';
import { useTranslation } from 'react-i18next';

// Android için LayoutAnimation'ı aktifleştir
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// Lucide icon haritası - veritabanındaki icon adlarını component'lere eşle
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

// Varsayılan kategori renkleri (kategori rengi yoksa kullanılır)
const DEFAULT_COLORS = [
  '#10B981', // Yeşil
  '#3B82F6', // Mavi
  '#F59E0B', // Amber
  '#EF4444', // Kırmızı
  '#8B5CF6', // Mor
  '#EC4899', // Pembe
  '#06B6D4', // Cyan
  '#F97316', // Turuncu
];

// Icon component helper
function getIconComponent(
  item: CategoryReportItem,
  categoryColor: string,
  type: 'gelir' | 'gider',
  isSubCategory: boolean = false
) {
  const iconSize = isSubCategory ? 16 : 20;
  const containerSize = isSubCategory ? 32 : 40;

  // Kategorisiz
  if (item.kategori === null) {
    return (
      <View style={[styles.iconContainer, {
        backgroundColor: colors.surfaceLighter,
        width: containerSize,
        height: containerSize,
        borderRadius: containerSize / 2,
      }]}>
        <Tag size={iconSize} color={colors.textMuted} />
      </View>
    );
  }

  // Kategori icon'u varsa
  const iconName = item.kategori?.icon;
  if (iconName && ICON_MAP[iconName]) {
    const IconComponent = ICON_MAP[iconName];
    return (
      <View style={[styles.iconContainer, {
        backgroundColor: categoryColor + '20',
        width: containerSize,
        height: containerSize,
        borderRadius: containerSize / 2,
      }]}>
        <IconComponent size={iconSize} color={categoryColor} />
      </View>
    );
  }

  // Varsayılan icon (tip'e göre)
  const DefaultIcon = type === 'gelir' ? TrendingUp : TrendingDown;
  const defaultIconColor = type === 'gelir' ? colors.success : colors.error;
  const defaultBgColor = type === 'gelir' ? colors.successLight : colors.errorLight;

  return (
    <View style={[styles.iconContainer, {
      backgroundColor: defaultBgColor,
      width: containerSize,
      height: containerSize,
      borderRadius: containerSize / 2,
    }]}>
      <DefaultIcon size={iconSize} color={defaultIconColor} />
    </View>
  );
}

// Eski CategoryReportCard - geriye uyumluluk için
interface CategoryReportCardProps {
  item: CategoryReportItem;
  index: number;
  onPress: () => void;
  type: 'gelir' | 'gider';
}

export function CategoryReportCard({ item, index, onPress, type }: CategoryReportCardProps) {
  const { t } = useTranslation(['reports']);

  // Kategori rengi veya varsayılan renk
  const categoryColor = item.kategori?.color || DEFAULT_COLORS[index % DEFAULT_COLORS.length];

  // Kategorisiz için gri renk
  const barColor = item.kategori === null ? colors.textMuted : categoryColor;

  // Kategori adı
  const categoryName = item.kategori?.name || 'Kategorisiz';

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.header}>
        <View style={styles.leftSection}>
          {getIconComponent(item, categoryColor, type)}
          <View style={styles.textContainer}>
            <Text variant="body" numberOfLines={1} style={styles.categoryName}>
              {categoryName}
            </Text>
            <Text variant="caption" color="secondary">
              {t('reports:counts.transaction', { count: item.count })}
            </Text>
          </View>
        </View>

        <View style={styles.rightSection}>
          <View style={styles.amountContainer}>
            <Text
              variant="label"
              color={type === 'gelir' ? 'success' : 'error'}
              style={styles.amount}
            >
              {formatCurrency(item.total)}
            </Text>
            <Text variant="caption" color="secondary">
              %{(item.percentage ?? 0).toFixed(1)}
            </Text>
          </View>
          <ChevronRight size={20} color={colors.textMuted} />
        </View>
      </View>

      {/* Progress Bar */}
      <View style={styles.progressBarContainer}>
        <View
          style={[
            styles.progressBar,
            {
              width: `${Math.min(item.percentage ?? 0, 100)}%`,
              backgroundColor: barColor,
            }
          ]}
        />
      </View>
    </TouchableOpacity>
  );
}

// Yeni Hiyerarşik CategoryReportCard - accordion ile
interface HierarchicalCategoryReportCardProps {
  item: HierarchicalCategoryReportItem;
  index: number;
  onPress: (kategoriId: string | null) => void;
  type: 'gelir' | 'gider';
}

export function HierarchicalCategoryReportCard({
  item,
  index,
  onPress,
  type
}: HierarchicalCategoryReportCardProps) {
  const { t } = useTranslation(['reports']);
  const [expanded, setExpanded] = useState(false);

  const hasChildren = item.children && item.children.length > 0;

  // Kategori rengi veya varsayılan renk
  const categoryColor = item.kategori?.color || DEFAULT_COLORS[index % DEFAULT_COLORS.length];

  // Kategorisiz için gri renk
  const barColor = item.kategori === null ? colors.textMuted : categoryColor;

  // Kategori adı
  const categoryName = item.kategori?.name || 'Kategorisiz';

  const handleToggle = () => {
    if (hasChildren) {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setExpanded(!expanded);
    }
  };

  const handlePress = () => {
    if (!hasChildren) {
      onPress(item.kategori?.id || null);
    } else {
      handleToggle();
    }
  };

  const handleChildPress = (kategoriId: string | null) => {
    onPress(kategoriId);
  };

  return (
    <View style={styles.hierarchicalContainer}>
      {/* Ana Kategori */}
      <TouchableOpacity
        style={[styles.container, hasChildren && styles.parentContainer]}
        onPress={handlePress}
        activeOpacity={0.7}
      >
        <View style={styles.header}>
          <View style={styles.leftSection}>
            {hasChildren && (
              <TouchableOpacity onPress={handleToggle} style={styles.expandButton}>
                {expanded ? (
                  <ChevronDown size={20} color={colors.primary} />
                ) : (
                  <ChevronRight size={20} color={colors.primary} />
                )}
              </TouchableOpacity>
            )}
            {getIconComponent(item, categoryColor, type)}
            <View style={styles.textContainer}>
              <Text variant="body" numberOfLines={1} style={styles.categoryName}>
                {categoryName}
              </Text>
              <Text variant="caption" color="secondary">
                {hasChildren
                  ? t('reports:categoryDetail.transactionWithSubcategories', { count: item.countWithChildren, subcategories: item.children.length })
                  : t('reports:counts.transaction', { count: item.count })
                }
              </Text>
            </View>
          </View>

          <View style={styles.rightSection}>
            <View style={styles.amountContainer}>
              <Text
                variant="label"
                color={type === 'gelir' ? 'success' : 'error'}
                style={styles.amount}
              >
                {formatCurrency(hasChildren ? item.totalWithChildren : item.total)}
              </Text>
              <Text variant="caption" color="secondary">
                %{((hasChildren ? item.percentageWithChildren : item.percentage) ?? 0).toFixed(1)}
              </Text>
            </View>
            {!hasChildren && <ChevronRight size={20} color={colors.textMuted} />}
          </View>
        </View>

        {/* Progress Bar */}
        <View style={styles.progressBarContainer}>
          <View
            style={[
              styles.progressBar,
              {
                width: `${Math.min((hasChildren ? item.percentageWithChildren : item.percentage) ?? 0, 100)}%`,
                backgroundColor: barColor,
              }
            ]}
          />
        </View>
      </TouchableOpacity>

      {/* Alt Kategoriler */}
      {expanded && hasChildren && (
        <View style={styles.childrenContainer}>
          {/* Ana kategorinin kendi işlemleri varsa göster */}
          {item.total > 0 && (
            <TouchableOpacity
              style={styles.childContainer}
              onPress={() => handleChildPress(item.kategori?.id || null)}
              activeOpacity={0.7}
            >
              <View style={styles.childHeader}>
                <View style={styles.childLeftSection}>
                  <View style={styles.childConnector} />
                  {getIconComponent(item, categoryColor, type, true)}
                  <View style={styles.textContainer}>
                    <Text variant="caption" numberOfLines={1} style={styles.childCategoryName}>
                      {categoryName} {t('reports:categoryDetail.direct')}
                    </Text>
                    <Text variant="caption" color="secondary">
                      {t('reports:counts.transaction', { count: item.count })}
                    </Text>
                  </View>
                </View>
                <View style={styles.rightSection}>
                  <View style={styles.amountContainer}>
                    <Text
                      variant="caption"
                      color={type === 'gelir' ? 'success' : 'error'}
                      style={styles.childAmount}
                    >
                      {formatCurrency(item.total)}
                    </Text>
                  </View>
                  <ChevronRight size={16} color={colors.textMuted} />
                </View>
              </View>
            </TouchableOpacity>
          )}

          {/* Alt kategoriler */}
          {item.children.map((child, childIndex) => {
            const childColor = child.kategori?.color || DEFAULT_COLORS[(index + childIndex + 1) % DEFAULT_COLORS.length];
            const childBarColor = child.kategori === null ? colors.textMuted : childColor;
            const childName = child.kategori?.name || 'Kategorisiz';
            const isLast = childIndex === item.children.length - 1 && item.total === 0;

            return (
              <TouchableOpacity
                key={child.kategori?.id || `child-${childIndex}`}
                style={[styles.childContainer, isLast && styles.lastChild]}
                onPress={() => handleChildPress(child.kategori?.id || null)}
                activeOpacity={0.7}
              >
                <View style={styles.childHeader}>
                  <View style={styles.childLeftSection}>
                    <View style={[styles.childConnector, isLast && styles.lastChildConnector]} />
                    {getIconComponent(child, childColor, type, true)}
                    <View style={styles.textContainer}>
                      <Text variant="caption" numberOfLines={1} style={styles.childCategoryName}>
                        {childName}
                      </Text>
                      <Text variant="caption" color="secondary">
                        {child.count} işlem
                      </Text>
                    </View>
                  </View>
                  <View style={styles.rightSection}>
                    <View style={styles.amountContainer}>
                      <Text
                        variant="caption"
                        color={type === 'gelir' ? 'success' : 'error'}
                        style={styles.childAmount}
                      >
                        {formatCurrency(child.total)}
                      </Text>
                      <Text variant="caption" color="secondary" style={styles.childPercentage}>
                        %{(child.percentage ?? 0).toFixed(1)}
                      </Text>
                    </View>
                    <ChevronRight size={16} color={colors.textMuted} />
                  </View>
                </View>

                {/* Alt kategori Progress Bar */}
                <View style={styles.childProgressBarContainer}>
                  <View
                    style={[
                      styles.progressBar,
                      {
                        width: `${Math.min(child.percentage, 100)}%`,
                        backgroundColor: childBarColor,
                      }
                    ]}
                  />
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  parentContainer: {
    marginBottom: 0,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  hierarchicalContainer: {
    marginBottom: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  leftSection: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  expandButton: {
    marginRight: spacing.xs,
    padding: spacing.xs,
  },
  iconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  textContainer: {
    flex: 1,
  },
  categoryName: {
    fontWeight: '600',
  },
  rightSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  amountContainer: {
    alignItems: 'flex-end',
  },
  amount: {
    fontWeight: '600',
  },
  progressBarContainer: {
    height: 8,
    backgroundColor: colors.surfaceLighter,
    borderRadius: borderRadius.full,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    borderRadius: borderRadius.full,
  },
  // Alt kategoriler için stiller
  childrenContainer: {
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: colors.border,
    borderBottomLeftRadius: borderRadius.lg,
    borderBottomRightRadius: borderRadius.lg,
    paddingVertical: spacing.xs,
  },
  childContainer: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginLeft: spacing.lg,
  },
  lastChild: {
    paddingBottom: spacing.sm,
  },
  childHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  childLeftSection: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  childConnector: {
    width: 2,
    height: 40,
    backgroundColor: colors.border,
    marginRight: spacing.sm,
    position: 'absolute',
    left: -spacing.md,
    top: -spacing.sm,
  },
  lastChildConnector: {
    height: 20,
  },
  childCategoryName: {
    fontWeight: '500',
  },
  childAmount: {
    fontWeight: '600',
  },
  childPercentage: {
    fontSize: 10,
  },
  childProgressBarContainer: {
    height: 4,
    backgroundColor: colors.surfaceLighter,
    borderRadius: borderRadius.full,
    overflow: 'hidden',
    marginLeft: spacing.lg + spacing.sm,
  },
});
