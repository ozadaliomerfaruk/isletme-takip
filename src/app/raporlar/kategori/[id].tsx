import { useState, useMemo, useCallback, useEffect } from 'react';
import { useContentBottomPadding } from '@/hooks/useContentBottomPadding';
import { logEvent } from '@/lib/appEvents';
import { View, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Alert, RefreshControl } from 'react-native';
import { useLocalSearchParams, Stack } from 'expo-router';
import {
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
} from 'lucide-react-native';
import { Text, Card, Screen } from '@/components/ui';
import { SkeletonListItem } from '@/components/ui/Skeleton';
import { ReportExportButton } from '@/components/reports/ReportExportButton';
import { TransactionRow } from '@/components/ui/TransactionRow';
import { QuickTransactionBar } from '@/components/transaction/QuickTransactionBar';
import { colors } from '@/constants/colors';
import { spacing } from '@/constants/spacing';
import { formatCurrency, getIslemCurrency } from '@/lib/currency';
import { upperTr } from '@/lib/turkishTextUtils';
import { useDateFormat } from '@/hooks/useDateFormat';
import { useSubCategoryReport, useMultiCategoryTransactions, useCategoryTransactions } from '@/hooks/useCategoryReport';
import { useUrunKalemlerByIslemIds } from '@/hooks/useUrunHareketler';
import { IslemWithRelations, KategoriType } from '@/types/database';
import { isReturnType } from '@/constants/islemTypes';
import { useTranslation } from 'react-i18next';
import { usePagePermission } from '@/hooks/usePagePermission';
import { useAuthContext } from '@/contexts/AuthContext';
import { exportCategoryDetail } from '@/lib/pageExports';
import { useSettings } from '@/hooks/useSettings';
import { useExchangeRates, createConversionSum } from '@/hooks/useExchangeRates';
import { useQueryClient } from '@tanstack/react-query';
import { usePermissions } from '@/hooks/usePermissions';
import { getTransactionActionDeniedMessageKey } from '@/lib/errors';
import {
  getTransactionProductMutationDecision,
} from '@/lib/transactionProductMutationGate';
import { getQuickTransactionScopeForApiType } from '@/lib/quickTransactionCreateScope';

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
  const contentPaddingBottom = useContentBottomPadding();
  usePagePermission({ module: 'raporlar' });
  useEffect(() => { logEvent('report_viewed', { report_type: 'category_detail' }); }, []);
  const { id, type, startDate, endDate, source } = useLocalSearchParams<{
    id: string;
    type: KategoriType;
    startDate: string;
    endDate: string;
    source?: string; // 'cash-flow' ise nakit akışı kaynaklı
  }>();
  const { t } = useTranslation(['reports', 'common', 'errors', 'transactions']);
  const { formatDateMedium } = useDateFormat();
  const { isletme, user } = useAuthContext();
  const { canAccessModule, canUpdate, isOwner } = usePermissions();
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

  // Ürün kalemleri (satırda önizleme) — tek batch sorgu (İşlemler listesiyle aynı desen, N+1 yok).
  const islemIdList = useMemo(
    () => [
      ...new Set([
        ...(filteredIslemler || []).map((item) => item.id),
        ...(uncategorizedIslemler || []).map((item) => item.id),
      ]),
    ],
    [filteredIslemler, uncategorizedIslemler],
  );
  const {
    getUrunItems,
    getProductItemCount,
    isProductItemsResolved,
    isLoading: urunKalemleriLoading,
    isFetching: urunKalemleriFetching,
    isError: urunKalemleriError,
  } = useUrunKalemlerByIslemIds(islemIdList, true);

  const canUpdateTransactionAs = useCallback(
    (
      transaction: IslemWithRelations,
      createdBy: string | null,
    ): boolean => {
      // Ürün projeksiyonu sonuçlanmadan "ürünsüz" varsaymak, ürün modülü kapalı
      // kullanıcıya kısa süreli edit penceresi açardı. Bilgi belirsizken fail-closed.
      const productItemsResolved =
        isProductItemsResolved
        && !urunKalemleriLoading
        && !urunKalemleriFetching
        && !urunKalemleriError;
      if (transaction.isletme_id !== isletme?.id) return false;

      return getTransactionProductMutationDecision({
        type: transaction.type,
        productItemsResolved,
        productItemCount: getProductItemCount(transaction.id),
        isOwner,
        canAccessModule,
        canMutateTransaction: canUpdate('islemler', createdBy),
        canMutateProduct: canUpdate('urunler', createdBy),
      }).allowed;
    },
    [
      canAccessModule,
      canUpdate,
      getProductItemCount,
      isOwner,
      isProductItemsResolved,
      isletme?.id,
      urunKalemleriError,
      urunKalemleriFetching,
      urunKalemleriLoading,
    ],
  );
  const canUpdateTransaction = useCallback(
    (transaction: IslemWithRelations): boolean =>
      canUpdateTransactionAs(
        transaction,
        transaction.created_by ?? null,
      ),
    [canUpdateTransactionAs],
  );

  const handleEditTransaction = useCallback(
    (transaction: IslemWithRelations) => {
      const createdBy = transaction.created_by ?? null;
      const canUpdateRecord = canUpdateTransaction(transaction);
      if (!canUpdateRecord) {
        const messageKey = getTransactionActionDeniedMessageKey('update', {
          createdBy,
          currentUserId: user?.id,
          canActOnOwnRecord:
            !!user?.id
            && canUpdateTransactionAs(transaction, user.id),
          canActOnRecord: canUpdateRecord,
        });
        Alert.alert(
          t('common:status.error'),
          t(messageKey),
        );
        return;
      }
      setEditTransactionId(transaction.id);
      setShowEditBar(true);
    },
    [
      canUpdateTransactionAs,
      canUpdateTransaction,
      t,
      user?.id,
    ],
  );

  const editTransaction = useMemo(
    () => [...(filteredIslemler || []), ...(uncategorizedIslemler || [])]
      .find((item) => item.id === editTransactionId),
    [editTransactionId, filteredIslemler, uncategorizedIslemler],
  );
  const canRenderEditTransactionBar =
    !!editTransaction && canUpdateTransaction(editTransaction);

  useEffect(() => {
    if (!showEditBar || canRenderEditTransactionBar) return;
    handleEditDismiss();
  }, [
    canRenderEditTransactionBar,
    handleEditDismiss,
    showEditBar,
  ]);

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
  // Her kalem KENDİ para biriminde; ana para birimine çevirip topla.
  //
  // İki düzeltme: (1) para birimi artık getIslemCurrency ile çözülüyor — hesap bacağı
  // OLMAYAN tiplerde (cari_alis/cari_satis) `hesap?.currency ?? baseCurrency` kalemi
  // baz para birimi sanıyordu, yani 1.000 USD'lik alış 1.000 TL olarak toplanıyordu.
  // (2) kur yoksa `?? amount` ile 1:1 eklenmiyor, kalem HARİÇ tutulup uyarı çıkıyor —
  // üst karttaki RPC toplamı (doğru çevirili) ile bu toplamın tutmaması bu yüzdendi.
  const filteredSum = useMemo(() => {
    const sum = createConversionSum(baseCurrency, rates);
    filteredIslemler?.forEach((islem) => {
      const amount = (islem as { _categoryAmount?: number })._categoryAmount !== undefined
        ? (islem as { _categoryAmount: number })._categoryAmount
        : Number(islem.amount);
      // İade tutarı yönü AZALTIR → net'ten düş.
      sum.add(amount, getIslemCurrency(islem), isReturnType(islem.type) ? -1 : 1);
    });
    return {
      total: sum.total,
      conversionIncomplete: sum.conversionIncomplete,
      // Çeviri gerçekten yapıldıysa "bugünkü kur" notu gösterilir (tarihsel kur
      // saklanmıyor). TRY-only kullanıcıda 0 → not çıkmaz.
      converted: sum.convertedCount > 0,
    };
  }, [filteredIslemler, baseCurrency, rates]);
  const filteredTotal = filteredSum.total;
  const filteredCount = filteredIslemler?.length ?? 0;

  // Sayfa başlığı
  const pageTitle = isUncategorized ? t('reports:titles.uncategorized') : (subCategoryReport.parentKategori?.name || t('reports:titles.categoryDetail'));
  // Ekranda gösterilen (native header) sürüm — büyük harf. pageTitle export'a HAM gider
  // (Excel dosya adı/başlığı stored isimle kalsın); yalnız görünüm büyütülür.
  const pageTitleDisplay = upperTr(pageTitle);

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
        parentAmount: subCategoryReport.parentTotal,
        parentTransactionCount: subCategoryReport.parentCount,
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

  // İşlem kartı render — İşlemler listesiyle AYNI zengin satır (TransactionRow):
  // cari/personel (başlık) · TİP·tarih · kategori · ürün kalemleri · not · hesap.
  const renderIslemItem = useCallback(({ item }: { item: IslemWithRelations & { _categoryAmount?: number } }) => {
    const isGelir = type === 'gelir';
    // İade yönü AZALTIR → kategori raporunda TERS gösterilir (gelir iadesi kırmızı/eksi,
    // gider iadesi para-geri yeşil/artı). Bu raporsal semantik TransactionRow'un tip-varsayılan
    // renginden farklı olabildiği için overrideColor/overridePrefix ile korunur.
    const isRet = isReturnType(item.type);
    const showsPositive = isGelir !== isRet;
    // _categoryAmount varsa ana tutar = kategori payı, alt tutar = tam fatura.
    const hasCategoryAmount = item._categoryAmount !== undefined && item._categoryAmount !== Number(item.amount);
    const displayAmount = hasCategoryAmount ? item._categoryAmount! : Number(item.amount);
    // Para birimi MERKEZÎ zincirle çözülür (source_currency → hesap → cari → personel).
    // Eskiden yalnız item.hesap?.currency okunuyordu; cari_alis/cari_satis/personel_*
    // tiplerinin hesap bacağı OLMADIĞI için undefined dönüyor ve formatCurrency ANA
    // para birimi sembolünü basıyordu → USD cariye kesilen 1.000 USD fatura bu listede
    // "₺1.000" görünüyordu. Aynı ekranın toplamı (:227) zaten getIslemCurrency kullanıyordu,
    // yani satır ile toplam birbirini tutmuyordu.
    const currency = getIslemCurrency(item);
    const urunItems = getUrunItems(item.id);
    const entityText = item.cari?.name
      || (item.personel ? `${item.personel.first_name} ${item.personel.last_name ?? ''}`.trim() : null)
      || null;

    return (
      <TransactionRow
        id={item.id}
        type={item.type}
        amount={displayAmount}
        date={formatDateMedium(item.date)}
        typeLabel={t(`transactions:types.${item.type}`)}
        entityText={entityText}
        secondaryText={item.kategori?.name ? upperTr(item.kategori.name) : null}
        tertiaryText={item.description || null}
        hesapText={item.hesap?.name || null}
        urunItems={urunItems}
        hasUrunler={urunItems.length > 0}
        urunCount={urunItems.length}
        currency={currency}
        overrideColor={showsPositive ? colors.success : colors.error}
        overridePrefix={showsPositive ? '+' : '-'}
        subAmount={hasCategoryAmount ? `${t('reports:labels.invoiceTotal')}: ${formatCurrency(Number(item.amount), currency)}` : null}
        hasPhoto={!!item.photo_path}
        onPress={() => handleEditTransaction(item)}
      />
    );
  }, [type, getUrunItems, formatDateMedium, handleEditTransaction, t]);

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
              label={upperTr(sub.kategori.name)}
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
            {formatCurrency(filteredTotal, baseCurrency)}
          </Text>
        </View>
      )}
      {/* Kuru bulunamayan kalemler toplama katılmadı — sessizce 1:1 eklemek yerine söyle */}
      {filteredSum.conversionIncomplete && (
        <Text variant="caption" color="error" style={styles.conversionWarningText}>
          {t('reports:summary.conversionIncomplete')}
        </Text>
      )}
      {/* Tarihsel kur saklanmıyor: geçmiş dönemin yabancı-para kalemi BUGÜNKÜ kurla
          çevriliyor. Düzeltmesi şema işi; en azından sessiz kalmıyor. */}
      {filteredSum.converted && (
        <Text variant="caption" color="secondary" style={styles.conversionWarningText}>
          {t('reports:summary.currentRateNote')}
        </Text>
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

  // Kategorisiz için özel hesaplamalar (yukarıdaki filteredSum ile AYNI politika)
  const uncategorizedSum = (() => {
    const sum = createConversionSum(baseCurrency, rates);
    uncategorizedIslemler?.forEach((islem) => {
      // İade tutarı yönü AZALTIR → net'ten düş.
      sum.add(Number(islem.amount), getIslemCurrency(islem), isReturnType(islem.type) ? -1 : 1);
    });
    return { total: sum.total, conversionIncomplete: sum.conversionIncomplete };
  })();
  const uncategorizedTotal = uncategorizedSum.total;
  const uncategorizedCount = uncategorizedIslemler?.length ?? 0;

  // Kategorisiz sayfası
  if (isUncategorized) {
    if (uncategorizedLoading) {
      return (
        <Screen>
          <Stack.Screen options={{ title: t('reports:titles.uncategorized'), headerBackVisible: true, gestureEnabled: true }} />
          <View style={styles.loadingContainer}>
            <SkeletonListItem />
            <SkeletonListItem />
            <SkeletonListItem />
          </View>
        </Screen>
      );
    }

    return (
      <Screen>
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
          ListHeaderComponent={(
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
                      {formatCurrency(uncategorizedTotal, baseCurrency)}
                    </Text>
                  </View>
                  <View style={styles.statItem}>
                    <Text variant="caption" color="secondary">{t('reports:summary.transactionCount')}</Text>
                    <Text variant="h2">{uncategorizedCount}</Text>
                  </View>
                </View>
                {uncategorizedSum.conversionIncomplete && (
                  <Text variant="caption" color="error" style={styles.conversionWarningText}>
                    {t('reports:summary.conversionIncomplete')}
                  </Text>
                )}
              </Card>

              <Text variant="label" color="secondary" style={styles.sectionTitle}>
                {t('reports:sections.transactions')}
              </Text>
            </View>
          )}
          ListEmptyComponent={(
            <Card style={styles.emptyCard}>
              <Text variant="body" color="secondary" style={{ textAlign: 'center' }}>
                {t('reports:empty.noUncategorizedTransactions')}
              </Text>
            </Card>
          )}
          contentContainerStyle={[styles.listContent, { paddingBottom: contentPaddingBottom }]}
          showsVerticalScrollIndicator={false}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={10}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[colors.primary]} tintColor={colors.primary} />}
        />

        {/* Quick Transaction Bar - Edit Mode */}
        {canRenderEditTransactionBar && (
          <QuickTransactionBar
            visible={showEditBar}
            onDismiss={handleEditDismiss}
            mode="edit"
            transactionId={editTransactionId ?? undefined}
            isScheduledTransaction={false}
            defaultHesapId={editTransaction?.hesap_id ?? undefined}
            defaultCariId={editTransaction?.cari_id ?? undefined}
            defaultCariType={editTransaction?.cari?.type}
            defaultPersonelId={editTransaction?.personel_id ?? undefined}
            createScope={
              editTransaction
                ? getQuickTransactionScopeForApiType(editTransaction.type)
                  ?? undefined
                : undefined
            }
            onSuccess={handleEditDismiss}
          />
        )}
      </Screen>
    );
  }

  // Loading state (normal kategoriler için)
  if (subCategoryReport.isLoading) {
    return (
      <Screen>
        <Stack.Screen options={{ title: pageTitleDisplay, headerBackVisible: true, gestureEnabled: true }} />
        <View style={styles.loadingContainer}>
          <SkeletonListItem />
          <SkeletonListItem />
          <SkeletonListItem />
        </View>
      </Screen>
    );
  }

  // Error state
  if (subCategoryReport.error) {
    return (
      <Screen>
        <Stack.Screen options={{ title: pageTitleDisplay, headerBackVisible: true, gestureEnabled: true }} />
        <View style={styles.errorContainer}>
          <Text variant="body" color="error">
            {t('reports:empty.dataLoadError')}
          </Text>
        </View>
      </Screen>
    );
  }

  // Alt kategorisi yoksa doğrudan tüm işlemleri göster
  if (subCategoryReport.subCategories.length === 0) {
    return (
      <Screen>
        <Stack.Screen
          options={{
            title: pageTitleDisplay,
            headerBackTitle: t('reports:titles.reports'),
            headerBackVisible: true,
            gestureEnabled: true,
          }}
        />

        <FlatList
          data={filteredIslemler}
          keyExtractor={(item) => item.id}
          renderItem={renderIslemItem}
          ListHeaderComponent={(
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
          ListEmptyComponent={(
            <Card style={styles.emptyCard}>
              <Text variant="body" color="secondary" style={{ textAlign: 'center' }}>
                {t('reports:empty.noCategoryTransactions')}
              </Text>
            </Card>
          )}
          contentContainerStyle={[styles.listContent, { paddingBottom: contentPaddingBottom }]}
          showsVerticalScrollIndicator={false}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={10}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[colors.primary]} tintColor={colors.primary} />}
        />

        {/* Quick Transaction Bar - Edit Mode */}
        {canRenderEditTransactionBar && (
          <QuickTransactionBar
            visible={showEditBar}
            onDismiss={handleEditDismiss}
            mode="edit"
            transactionId={editTransactionId ?? undefined}
            isScheduledTransaction={false}
            defaultHesapId={editTransaction?.hesap_id ?? undefined}
            defaultCariId={editTransaction?.cari_id ?? undefined}
            defaultCariType={editTransaction?.cari?.type}
            defaultPersonelId={editTransaction?.personel_id ?? undefined}
            createScope={
              editTransaction
                ? getQuickTransactionScopeForApiType(editTransaction.type)
                  ?? undefined
                : undefined
            }
            onSuccess={handleEditDismiss}
          />
        )}
      </Screen>
    );
  }

  return (
    <Screen>
      <Stack.Screen
        options={{
          title: pageTitleDisplay,
          headerBackTitle: t('reports:titles.reports'),
          headerBackVisible: true,
          gestureEnabled: true,
          headerRight: () =>
            !isUncategorized && subCategoryReport.subCategories.length > 0 ? (
              <ReportExportButton
                onPress={handleExport}
                isExporting={isExporting}
                accessibilityLabel={t('reports:export.exportExcel')}
              />
            ) : null,
        }}
      />

      <FlatList
        data={selectedKategoriIds.length > 0 ? filteredIslemler : []}
        keyExtractor={(item) => item.id}
        renderItem={renderIslemItem}
        // Element (renderHeader()) geç — fonksiyon (renderHeader) geçilirse her checkbox
        // toggle'ında başlık (özet + tüm alt-kategori checkbox'ları) TÜMDEN remount ediyordu.
        ListHeaderComponent={renderHeader()}
        ListEmptyComponent={EmptyState()}
        contentContainerStyle={[styles.listContent, { paddingBottom: contentPaddingBottom }]}
        showsVerticalScrollIndicator={false}
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        windowSize={10}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[colors.primary]} tintColor={colors.primary} />}
        ListFooterComponent={islemlerLoading ? (
          <ActivityIndicator size="small" color={colors.primary} style={{ marginTop: spacing.md }} />
        ) : null}
      />

      {/* Quick Transaction Bar - Edit Mode */}
      {canRenderEditTransactionBar && (
        <QuickTransactionBar
          visible={showEditBar}
          onDismiss={handleEditDismiss}
          mode="edit"
          transactionId={editTransactionId ?? undefined}
          isScheduledTransaction={false}
          defaultHesapId={editTransaction?.hesap_id ?? undefined}
          defaultCariId={editTransaction?.cari_id ?? undefined}
          defaultCariType={editTransaction?.cari?.type}
          defaultPersonelId={editTransaction?.personel_id ?? undefined}
          createScope={
            editTransaction
              ? getQuickTransactionScopeForApiType(editTransaction.type)
                ?? undefined
              : undefined
          }
          onSuccess={handleEditDismiss}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  // İskelet satırlar liste genişliğini taşımalı: ortalama (alignItems:center) satırları
  // içeriğe daraltırdı — hesap detayındaki stateBox ile aynı yerleşim.
  loadingContainer: {
    padding: spacing.xl,
    gap: spacing.sm,
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
  conversionWarningText: {
    marginBottom: spacing.sm,
    marginHorizontal: spacing.xs,
  },
  sectionTitle: {
    marginBottom: spacing.sm,
    marginLeft: spacing.xs,
  },
  emptyCard: {
    padding: spacing.xl,
  },
});
