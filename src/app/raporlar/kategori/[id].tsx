import { useState, useMemo, useCallback, useEffect } from 'react';
import { logEvent } from '@/lib/appEvents';
import { View, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, ScrollView, Alert, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import {
  ChevronRight,
  TrendingUp,
  TrendingDown,
  Tag,
  Check,
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
  Share2,
} from 'lucide-react-native';
import { Text, Card } from '@/components/ui';
import { QuickTransactionBar } from '@/components/transaction/QuickTransactionBar';
import { colors } from '@/constants/colors';
import { spacing, borderRadius, fontSize } from '@/constants/spacing';
import { formatCurrency } from '@/lib/currency';
import { useDateFormat } from '@/hooks/useDateFormat';
import { useSubCategoryReport, useMultiCategoryTransactions, useCategoryTransactions } from '@/hooks/useCategoryReport';
import { IslemWithRelations, KategoriType } from '@/types/database';
import { isReturnType } from '@/constants/islemTypes';
import { useTranslation } from 'react-i18next';
import { usePagePermission } from '@/hooks/usePagePermission';
import { useAuthContext } from '@/contexts/AuthContext';
import { exportCategoryDetail } from '@/lib/pageExports';
import { useSettings } from '@/hooks/useSettings';
import { useExchangeRates, convertCurrency } from '@/hooks/useExchangeRates';
import { useQueryClient } from '@tanstack/react-query';

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

export default function KategoriDetayPage() {
  usePagePermission({ module: 'raporlar' });
  useEffect(() => { logEvent('report_viewed', { report_type: 'category_detail' }); }, []);
  const router = useRouter();
  const { id, type, startDate, endDate, source } = useLocalSearchParams<{
    id: string;
    type: KategoriType;
    startDate: string;
    endDate: string;
    source?: string; // 'cash-flow' ise nakit akışı kaynaklı
  }>();
  const { t } = useTranslation(['reports', 'common', 'errors', 'transactions']);
  const { formatDateMedium } = useDateFormat();
  const { isletme } = useAuthContext();
  const { currency: baseCurrency } = useSettings();
  const { data: ratesData } = useExchangeRates();
  const rates = ratesData?.rates;

  const isUncategorized = id === 'uncategorized';
  const kategoriId = isUncategorized ? null : id;

  // Kategorisiz işlemleri çek (sadece uncategorized için)
  const {
    data: uncategorizedIslemler,
    isLoading: uncategorizedLoading
  } = useCategoryTransactions(
    null, // null = kategorisiz
    type!,
    { startDate: startDate!, endDate: endDate!, source, includeReturns: true }
  );

  // Alt kategori raporunu çek (sadece normal kategoriler için).
  // Kategorisizde alt-kategori yok → null geç (hook devre dışı). (Eskiden 'skip'
  // geçiliyordu; hook onu UUID sanıp `.eq('id','skip')` ile 22P02 hatası veriyordu.)
  const subCategoryReport = useSubCategoryReport(
    isUncategorized ? null : kategoriId,
    type!,
    { startDate: startDate!, endDate: endDate!, source, includeReturns: true }
  );

  // Seçili alt kategoriler (checkbox için) - başlangıçta tümü seçili
  const [selectedSubCategories, setSelectedSubCategories] = useState<Set<string> | null>(null);
  // Ana kategori dahil mi (checkbox için)
  const [includeParentCategory, setIncludeParentCategory] = useState(true);
  // Edit transaction state
  const [editTransactionId, setEditTransactionId] = useState<string | null>(null);
  const [showEditBar, setShowEditBar] = useState(false);
  // Pull-to-refresh
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await queryClient.invalidateQueries();
    } finally {
      setRefreshing(false);
    }
  }, [queryClient]);

  // Handle edit transaction
  const handleEditTransaction = useCallback((transactionId: string) => {
    setEditTransactionId(transactionId);
    setShowEditBar(true);
  }, []);

  const handleEditDismiss = useCallback(() => {
    setShowEditBar(false);
    setEditTransactionId(null);
  }, []);

  // Alt kategoriler yüklendiğinde tümünü seç
  const effectiveSelectedSubCategories = useMemo(() => {
    if (selectedSubCategories !== null) {
      return selectedSubCategories;
    }
    // Başlangıçta tüm alt kategorileri seç
    return new Set(subCategoryReport.subCategories.map((sub) => sub.kategori.id));
  }, [selectedSubCategories, subCategoryReport.subCategories]);

  // Seçili kategorilerin ID'lerini oluştur
  const selectedKategoriIds = useMemo(() => {
    const ids: string[] = [];
    if (includeParentCategory && kategoriId) {
      ids.push(kategoriId);
    }
    effectiveSelectedSubCategories.forEach((subId) => ids.push(subId));
    return ids;
  }, [kategoriId, includeParentCategory, effectiveSelectedSubCategories]);

  // Seçili kategorilerin işlemlerini çek (sadece normal kategoriler için)
  const { data: filteredIslemler, isLoading: islemlerLoading } = useMultiCategoryTransactions(
    isUncategorized ? [] : selectedKategoriIds,
    type!,
    { startDate: startDate!, endDate: endDate!, source, includeReturns: true }
  );

  // Alt kategori seçimini toggle et
  const toggleSubCategory = (subKategoriId: string) => {
    const currentSet = new Set(effectiveSelectedSubCategories);
    if (currentSet.has(subKategoriId)) {
      currentSet.delete(subKategoriId);
    } else {
      currentSet.add(subKategoriId);
    }
    setSelectedSubCategories(currentSet);
  };

  // Tümünü seç / kaldır
  const toggleAllSubCategories = () => {
    const allSelected = effectiveSelectedSubCategories.size === subCategoryReport.subCategories.length;
    if (allSelected) {
      // Tümü seçili ise hepsini kaldır
      setSelectedSubCategories(new Set());
    } else {
      // Hepsini seç
      const allIds = new Set(subCategoryReport.subCategories.map((sub) => sub.kategori.id));
      setSelectedSubCategories(allIds);
    }
  };

  // Tümü seçili mi kontrolü
  const allSubCategoriesSelected = effectiveSelectedSubCategories.size === subCategoryReport.subCategories.length;

  const [isExporting, setIsExporting] = useState(false);

  // Filtrelenmiş toplam (kategori-spesifik tutarları kullan)
  // Her kalem kendi hesap para birimindedir; ana para birimine çevirip topla.
  // (convertCurrency aynı para biriminde no-op olduğundan tek-para-birimli kullanıcıda değişmez.)
  const filteredTotal = filteredIslemler?.reduce((acc, islem) => {
    const amount = (islem as { _categoryAmount?: number })._categoryAmount !== undefined
      ? (islem as { _categoryAmount: number })._categoryAmount
      : Number(islem.amount);
    const cur = islem.hesap?.currency ?? baseCurrency;
    const converted = convertCurrency(amount, cur, baseCurrency, rates) ?? amount;
    // İade tutarı yönü AZALTIR → net'ten düş.
    return acc + (isReturnType(islem.type) ? -converted : converted);
  }, 0) ?? 0;
  const filteredCount = filteredIslemler?.length ?? 0;

  // Sayfa başlığı
  const pageTitle = isUncategorized ? t('reports:titles.uncategorized') : (subCategoryReport.parentKategori?.name || t('reports:titles.categoryDetail'));

  const handleExport = useCallback(async () => {
    if (!isletme || !startDate || !endDate) return;
    setIsExporting(true);
    try {
      const subCats = subCategoryReport.subCategories.map(sc => ({
        name: sc.kategori.name,
        amount: sc.total,
        percentage: sc.percentage,
        transactionCount: sc.count,
      }));
      await exportCategoryDetail({
        categoryName: pageTitle,
        categoryType: type!,
        isletmeName: isletme.name,
        startDate: startDate!,
        endDate: endDate!,
        subCategories: subCats,
        totalAmount: subCategoryReport.totalAmount,
        currency: baseCurrency,
        t: {
          title: `${pageTitle} - ${type === 'gelir' ? t('reports:titles.incomeAnalysis') : t('reports:titles.expenseAnalysis')}`,
          business: t('common:export.excel.business'),
          category: t('common:export.excel.category'),
          period: t('common:export.excel.period'),
          createdAt: t('common:export.excel.createdAt'),
          subCategory: t('reports:category.title'),
          amount: t('reports:category.amount'),
          percentage: t('reports:category.percentage'),
          transactionCount: t('reports:category.transactionCount'),
          total: t('common:export.reportExcel.total'),
          sheetName: pageTitle,
          fileName: pageTitle,
          dialogTitle: pageTitle,
        },
      });
    } catch {
      Alert.alert(t('common:status.error'), t('common:errors.genericError'));
    } finally {
      setIsExporting(false);
    }
  }, [isletme, startDate, endDate, subCategoryReport, pageTitle, type, baseCurrency, t]);

  // Tarih aralığını formatla
  const formatDateRange = () => {
    if (!startDate || !endDate) return '';
    const start = new Date(startDate + 'T00:00:00');
    const end = new Date(endDate + 'T00:00:00');

    const months = t('reports:months', { returnObjects: true }) as string[];
    if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
      return `${months[start.getMonth()]} ${start.getFullYear()}`;
    }
    return `${start.getDate()} ${months[start.getMonth()]} - ${end.getDate()} ${months[end.getMonth()]} ${end.getFullYear()}`;
  };

  // İşlem kartı render
  const renderIslemItem = ({ item }: { item: IslemWithRelations & { _categoryAmount?: number } }) => {
    const isGelir = type === 'gelir';
    // İade, yönü AZALTIR → kartta yönün TERSİ gösterilir: gelir iadesi kırmızı/eksi,
    // gider iadesi (para geri) yeşil/artı. (isGelir XOR iade)
    const isRet = isReturnType(item.type);
    const showsPositive = isGelir !== isRet;
    // If _categoryAmount exists, show it as the main amount and full invoice as sub-text
    const hasCategoryAmount = item._categoryAmount !== undefined && item._categoryAmount !== Number(item.amount);
    const displayAmount = hasCategoryAmount ? item._categoryAmount! : Number(item.amount);

    return (
      <TouchableOpacity
        style={styles.islemCard}
        onPress={() => handleEditTransaction(item.id)}
        activeOpacity={0.7}
      >
        <View style={styles.islemHeader}>
          <View style={styles.islemLeft}>
            <View style={[
              styles.islemIconContainer,
              { backgroundColor: showsPositive ? colors.successLight : colors.errorLight }
            ]}>
              {showsPositive ? (
                <TrendingUp size={16} color={colors.success} />
              ) : (
                <TrendingDown size={16} color={colors.error} />
              )}
            </View>
            <View style={styles.islemInfo}>
              <Text variant="body" numberOfLines={1} style={styles.islemTitle}>
                {item.cari?.name
                  || (item.personel ? `${item.personel.first_name} ${item.personel.last_name ?? ''}`.trim() : null)
                  || item.description
                  || t(`transactions:types.${item.type}`)}
              </Text>
              <Text variant="caption" color="secondary">
                {t(`transactions:types.${item.type}`)} • {formatDateMedium(item.date)}
              </Text>
              {item.description && (item.cari || item.personel) && (
                <Text variant="caption" color="secondary" numberOfLines={2}>
                  {item.description}
                </Text>
              )}
              {item.hesap && (
                <Text variant="caption" color="secondary">
                  {item.hesap.name}
                </Text>
              )}
            </View>
          </View>
          <View style={styles.islemRight}>
            <View style={styles.islemAmountContainer}>
              <Text
                variant="label"
                color={showsPositive ? 'success' : 'error'}
                style={styles.islemAmount}
              >
                {showsPositive ? '+' : '-'}{formatCurrency(displayAmount, item.hesap?.currency)}
              </Text>
              {hasCategoryAmount && (
                <Text variant="caption" color="secondary" style={styles.islemSubAmount}>
                  {t('reports:labels.invoiceTotal')}: {formatCurrency(Number(item.amount), item.hesap?.currency)}
                </Text>
              )}
            </View>
            <ChevronRight size={16} color={colors.textMuted} />
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  // Kategori ikonu için helper
  const getCategoryIcon = () => {
    const kategori = subCategoryReport.parentKategori;
    const categoryColor = kategori?.color || colors.primary;

    if (isUncategorized) {
      return (
        <View style={[styles.categoryIconContainer, { backgroundColor: colors.surfaceLighter }]}>
          <Tag size={28} color={colors.textMuted} />
        </View>
      );
    }

    const iconName = kategori?.icon;
    if (iconName && ICON_MAP[iconName]) {
      const IconComponent = ICON_MAP[iconName];
      return (
        <View style={[styles.categoryIconContainer, { backgroundColor: categoryColor + '20' }]}>
          <IconComponent size={28} color={categoryColor} />
        </View>
      );
    }

    // Varsayılan icon (tip'e göre)
    const DefaultIcon = type === 'gelir' ? TrendingUp : TrendingDown;
    const defaultColor = type === 'gelir' ? colors.success : colors.error;
    const defaultBgColor = type === 'gelir' ? colors.successLight : colors.errorLight;

    return (
      <View style={[styles.categoryIconContainer, { backgroundColor: defaultBgColor }]}>
        <DefaultIcon size={28} color={defaultColor} />
      </View>
    );
  };

  // Checkbox component
  const Checkbox = ({ checked, onPress, label, amount, count }: {
    checked: boolean;
    onPress: () => void;
    label: string;
    amount: number;
    count: number;
  }) => (
    <TouchableOpacity
      style={styles.checkboxRow}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.checkboxLeft}>
        <View style={[
          styles.checkbox,
          checked && styles.checkboxChecked
        ]}>
          {checked && <Check size={14} color={colors.white} />}
        </View>
        <Text variant="body" style={styles.checkboxLabel}>{label}</Text>
      </View>
      <View style={styles.checkboxRight}>
        <Text variant="caption" color="secondary">{t('reports:counts.transaction', { count })}</Text>
        <Text variant="label" color={type === 'gelir' ? 'success' : 'error'}>
          {formatCurrency(amount)}
        </Text>
      </View>
    </TouchableOpacity>
  );

  // Header component - artık FlatList içinde değil
  const renderHeader = () => (
    <View style={styles.headerContainer}>
      {/* Özet Kartı */}
      <Card style={styles.summaryCard}>
        <View style={styles.summaryHeader}>
          {getCategoryIcon()}
          <View style={styles.summaryInfo}>
            <Text variant="h3">{pageTitle}</Text>
            <Text variant="caption" color="secondary">
              {formatDateRange()}
            </Text>
          </View>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryStats}>
          <View style={styles.statItem}>
            <Text variant="caption" color="secondary">{t('reports:summary.totalAmount')}</Text>
            <Text
              variant="h2"
              color={type === 'gelir' ? 'success' : 'error'}
            >
              {formatCurrency(subCategoryReport.totalAmount)}
            </Text>
          </View>
          <View style={styles.statItem}>
            <Text variant="caption" color="secondary">{t('reports:summary.transactionCount')}</Text>
            <Text variant="h2">{subCategoryReport.totalCount}</Text>
          </View>
        </View>
      </Card>

      {/* Alt Kategoriler (Checkbox ile) - sadece alt kategori varsa göster */}
      {subCategoryReport.subCategories.length > 0 && (
        <Card style={styles.filterCard}>
          <View style={styles.filterHeader}>
            <Text variant="label" color="secondary">{t('reports:sections.categoryFilter')}</Text>
            <TouchableOpacity onPress={toggleAllSubCategories}>
              <Text variant="caption" color="primary">
                {allSubCategoriesSelected ? t('reports:categoryDetail.selectNone') : t('reports:categoryDetail.selectAll')}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Ana kategori checkbox'ı (doğrudan işlemleri varsa) */}
          {subCategoryReport.parentCount > 0 && (
            <Checkbox
              checked={includeParentCategory}
              onPress={() => setIncludeParentCategory(!includeParentCategory)}
              label={`${pageTitle} ${t('reports:categoryDetail.direct')}`}
              amount={subCategoryReport.parentTotal}
              count={subCategoryReport.parentCount}
            />
          )}

          {/* Alt kategori checkbox'ları */}
          {subCategoryReport.subCategories.map((sub) => (
            <Checkbox
              key={sub.kategori.id}
              checked={effectiveSelectedSubCategories.has(sub.kategori.id)}
              onPress={() => toggleSubCategory(sub.kategori.id)}
              label={sub.kategori.name}
              amount={sub.total}
              count={sub.count}
            />
          ))}
        </Card>
      )}

      {/* Seçilen İşlemler Başlığı */}
      {selectedKategoriIds.length > 0 && (
        <View style={styles.selectedHeader}>
          <Text variant="label" color="secondary">
            {t('reports:sections.selectedTransactions')} ({filteredCount})
          </Text>
          <Text variant="label" color={type === 'gelir' ? 'success' : 'error'}>
            {formatCurrency(filteredTotal)}
          </Text>
        </View>
      )}
    </View>
  );

  // Empty state
  const EmptyState = () => (
    <Card style={styles.emptyCard}>
      <Text variant="body" color="secondary" style={{ textAlign: 'center' }}>
        {selectedKategoriIds.length === 0
          ? t('reports:empty.selectCategories')
          : t('reports:empty.noSelectedCategoryTransactions')}
      </Text>
    </Card>
  );

  // Kategorisiz için özel hesaplamalar
  const uncategorizedTotal = uncategorizedIslemler?.reduce((acc, islem) => {
    const amount = Number(islem.amount);
    const cur = islem.hesap?.currency ?? baseCurrency;
    const converted = convertCurrency(amount, cur, baseCurrency, rates) ?? amount;
    // İade tutarı yönü AZALTIR → net'ten düş.
    return acc + (isReturnType(islem.type) ? -converted : converted);
  }, 0) ?? 0;
  const uncategorizedCount = uncategorizedIslemler?.length ?? 0;

  // Kategorisiz sayfası
  if (isUncategorized) {
    if (uncategorizedLoading) {
      return (
        <SafeAreaView style={styles.container} edges={['bottom']}>
          <Stack.Screen options={{ title: t('reports:titles.uncategorized'), headerBackVisible: true, gestureEnabled: true }} />
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        </SafeAreaView>
      );
    }

    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <Stack.Screen
          options={{
            title: t('reports:titles.uncategorized'),
            headerBackTitle: t('reports:titles.reports'),
            headerBackVisible: true,
            gestureEnabled: true,
          }}
        />

        <FlatList
          data={uncategorizedIslemler}
          keyExtractor={(item) => item.id}
          renderItem={renderIslemItem}
          ListHeaderComponent={() => (
            <View style={styles.headerContainer}>
              <Card style={styles.summaryCard}>
                <View style={styles.summaryHeader}>
                  {getCategoryIcon()}
                  <View style={styles.summaryInfo}>
                    <Text variant="h3">{t('reports:titles.uncategorized')}</Text>
                    <Text variant="caption" color="secondary">
                      {formatDateRange()}
                    </Text>
                  </View>
                </View>
                <View style={styles.summaryDivider} />
                <View style={styles.summaryStats}>
                  <View style={styles.statItem}>
                    <Text variant="caption" color="secondary">{t('reports:summary.totalAmount')}</Text>
                    <Text
                      variant="h2"
                      color={type === 'gelir' ? 'success' : 'error'}
                    >
                      {formatCurrency(uncategorizedTotal)}
                    </Text>
                  </View>
                  <View style={styles.statItem}>
                    <Text variant="caption" color="secondary">{t('reports:summary.transactionCount')}</Text>
                    <Text variant="h2">{uncategorizedCount}</Text>
                  </View>
                </View>
              </Card>

              <Text variant="label" color="secondary" style={styles.sectionTitle}>
                {t('reports:sections.transactions')}
              </Text>
            </View>
          )}
          ListEmptyComponent={() => (
            <Card style={styles.emptyCard}>
              <Text variant="body" color="secondary" style={{ textAlign: 'center' }}>
                {t('reports:empty.noUncategorizedTransactions')}
              </Text>
            </Card>
          )}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />

        {/* Quick Transaction Bar - Edit Mode */}
        <QuickTransactionBar
          visible={showEditBar}
          onDismiss={handleEditDismiss}
          mode="edit"
          transactionId={editTransactionId ?? undefined}
          isScheduledTransaction={false}
          onSuccess={handleEditDismiss}
        />
      </SafeAreaView>
    );
  }

  // Loading state (normal kategoriler için)
  if (subCategoryReport.isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <Stack.Screen options={{ title: pageTitle, headerBackVisible: true, gestureEnabled: true }} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  // Error state
  if (subCategoryReport.error) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <Stack.Screen options={{ title: pageTitle, headerBackVisible: true, gestureEnabled: true }} />
        <View style={styles.errorContainer}>
          <Text variant="body" color="error">
            {t('reports:empty.dataLoadError')}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // Alt kategorisi yoksa doğrudan tüm işlemleri göster
  if (subCategoryReport.subCategories.length === 0) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <Stack.Screen
          options={{
            title: pageTitle,
            headerBackTitle: t('reports:titles.reports'),
            headerBackVisible: true,
            gestureEnabled: true,
          }}
        />

        <FlatList
          data={filteredIslemler}
          keyExtractor={(item) => item.id}
          renderItem={renderIslemItem}
          ListHeaderComponent={() => (
            <View style={styles.headerContainer}>
              <Card style={styles.summaryCard}>
                <View style={styles.summaryHeader}>
                  {getCategoryIcon()}
                  <View style={styles.summaryInfo}>
                    <Text variant="h3">{pageTitle}</Text>
                    <Text variant="caption" color="secondary">
                      {formatDateRange()}
                    </Text>
                  </View>
                </View>
                <View style={styles.summaryDivider} />
                <View style={styles.summaryStats}>
                  <View style={styles.statItem}>
                    <Text variant="caption" color="secondary">{t('reports:summary.totalAmount')}</Text>
                    <Text
                      variant="h2"
                      color={type === 'gelir' ? 'success' : 'error'}
                    >
                      {formatCurrency(subCategoryReport.totalAmount)}
                    </Text>
                  </View>
                  <View style={styles.statItem}>
                    <Text variant="caption" color="secondary">{t('reports:summary.transactionCount')}</Text>
                    <Text variant="h2">{subCategoryReport.totalCount}</Text>
                  </View>
                </View>
              </Card>

              <Text variant="label" color="secondary" style={styles.sectionTitle}>
                {t('reports:sections.transactions')}
              </Text>
            </View>
          )}
          ListEmptyComponent={() => (
            <Card style={styles.emptyCard}>
              <Text variant="body" color="secondary" style={{ textAlign: 'center' }}>
                {t('reports:empty.noCategoryTransactions')}
              </Text>
            </Card>
          )}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />

        {/* Quick Transaction Bar - Edit Mode */}
        <QuickTransactionBar
          visible={showEditBar}
          onDismiss={handleEditDismiss}
          mode="edit"
          transactionId={editTransactionId ?? undefined}
          isScheduledTransaction={false}
          onSuccess={handleEditDismiss}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen
        options={{
          title: pageTitle,
          headerBackTitle: t('reports:titles.reports'),
          headerBackVisible: true,
          gestureEnabled: true,
          headerRight: () =>
            !isUncategorized && subCategoryReport.subCategories.length > 0 ? (
              <TouchableOpacity onPress={handleExport} disabled={isExporting} style={{ padding: 6 }}>
                {isExporting ? (
                  <ActivityIndicator size="small" color={colors.text} />
                ) : (
                  <Share2 size={22} color={colors.text} />
                )}
              </TouchableOpacity>
            ) : null,
        }}
      />

      <FlatList
        data={selectedKategoriIds.length > 0 ? filteredIslemler : []}
        keyExtractor={(item) => item.id}
        renderItem={renderIslemItem}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={EmptyState}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[colors.primary]} tintColor={colors.primary} />}
        ListFooterComponent={islemlerLoading ? (
          <ActivityIndicator size="small" color={colors.primary} style={{ marginTop: spacing.md }} />
        ) : null}
      />

      {/* Quick Transaction Bar - Edit Mode */}
      <QuickTransactionBar
        visible={showEditBar}
        onDismiss={handleEditDismiss}
        mode="edit"
        transactionId={editTransactionId ?? undefined}
        isScheduledTransaction={false}
        onSuccess={handleEditDismiss}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  listContent: {
    padding: spacing.lg,
    paddingBottom: spacing['3xl'],
  },
  headerContainer: {
    marginBottom: spacing.md,
  },
  summaryCard: {
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  categoryIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  summaryInfo: {
    flex: 1,
  },
  summaryDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.lg,
  },
  summaryStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  statItem: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  filterCard: {
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  filterHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  checkboxLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  checkboxChecked: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  checkboxLabel: {
    flex: 1,
  },
  checkboxRight: {
    alignItems: 'flex-end',
    gap: 2,
  },
  selectedHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
    marginLeft: spacing.xs,
  },
  sectionTitle: {
    marginBottom: spacing.sm,
    marginLeft: spacing.xs,
  },
  islemCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  islemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  islemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  islemIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  islemInfo: {
    flex: 1,
  },
  islemTitle: {
    fontWeight: '500',
    marginBottom: 2,
  },
  islemRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  islemAmountContainer: {
    alignItems: 'flex-end',
  },
  islemAmount: {
    fontWeight: '700',
    fontSize: fontSize.lg,
  },
  islemSubAmount: {
    fontSize: 10,
    marginTop: 1,
  },
  emptyCard: {
    padding: spacing.xl,
  },
});
