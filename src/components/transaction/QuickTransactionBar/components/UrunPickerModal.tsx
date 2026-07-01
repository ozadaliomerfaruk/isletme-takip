import { useState, useMemo, useCallback, useEffect } from 'react';
import {
  View,
  Modal,
  TouchableOpacity,
  TouchableWithoutFeedback,
  TextInput,
  ScrollView,
  Dimensions,
  StyleSheet,
  ActivityIndicator,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X, Search, Package, Plus, Trash2, Check, Pencil } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { Text, Button, ExpandableCard } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing, borderRadius, shadows } from '@/constants/spacing';
import { formatCurrency, parseCurrency, parseQuantity, formatQuantity, formatAmountForInput, roundCurrency } from '@/lib/currency';
import { useKategoriler } from '@/hooks/useKategoriler';
import { useHaptics } from '@/hooks/useHaptics';
import { textIncludes } from '@/lib/turkishTextUtils';
import { styles as sharedStyles } from '../styles';
import type { UrunItem } from '../types';
import { KDV_ORANLARI, calculateUrunLineTotal, calculateUrunGrandTotal } from '../types';
import type { Urun, BirimType } from '@/types/database';

// LayoutAnimation Android'de varsayılan kapalı; buton etiket/durum geçişlerini
// yumuşatmak için bir kez etkinleştir (ev-tarzı: LeaveQuotaCard/NoteRow deseni).
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export interface UrunPickerModalProps {
  visible: boolean;
  onDismiss: () => void;
  urunler: Urun[];
  urunItems: UrunItem[];
  onUrunItemsChange: (items: UrunItem[]) => void;
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  onTotalChange?: (total: number) => void;
  currency?: string;
  /** İşlem yönü: alış → alış_fiyatı, satış → satış_fiyatı varsayılan olarak gelir. */
  islemYonu?: 'alis' | 'satis';
  /** Aranan ürün yoksa inline oluşturma; oluşturulan ürünü döndürürse otomatik seçilir. */
  onCreateNew?: (name: string) => Promise<Urun | undefined>;
  creating?: boolean;
  /** Boş aramada / tam ekran ürün ekleme sayfasına yönlendirme (modal kapanır). */
  onAddFullProduct?: () => void;
}

// Ürün ekleme formu için state
interface AddingProduct {
  urun: Urun;
  miktar: string;
  birimFiyat: string;
  kdvOrani: number;
}

export function UrunPickerModal({
  visible,
  onDismiss,
  urunler,
  urunItems,
  onUrunItemsChange,
  searchQuery,
  onSearchQueryChange,
  onTotalChange,
  currency = 'TRY',
  islemYonu = 'alis',
  onCreateNew,
  creating = false,
  onAddFullProduct,
}: UrunPickerModalProps) {
  const { t } = useTranslation(['transactions', 'products', 'common']);
  const insets = useSafeAreaInsets();
  const haptics = useHaptics();
  const windowHeight = Dimensions.get('window').height;
  const { data: kategoriler } = useKategoriler();
  const kategoriNameMap = useMemo(
    () => new Map(kategoriler?.map(k => [k.id, k.name]) || []),
    [kategoriler]
  );

  // Ekleme/düzenleme modunda olan ürün
  const [addingProduct, setAddingProduct] = useState<AddingProduct | null>(null);
  // Düzenleme modunda olan ürün ID'si (null ise yeni ekleme)
  const [editingUrunId, setEditingUrunId] = useState<string | null>(null);
  // Eklenen ürünler akordeonu: arama yapınca kapanır (sonuçlar önde kalsın), boşalınca açılır
  const [addedExpanded, setAddedExpanded] = useState(true);
  // Fatura mutabakatı: kullanıcının girdiği fatura toplamı (KDV dahil) — canlı fark için
  const [faturaToplami, setFaturaToplami] = useState('');

  // Arama moduna göre eklenen-ürünler akordeonunu otomatik aç/kapat
  useEffect(() => {
    setAddedExpanded(!searchQuery.trim());
  }, [searchQuery]);

  // Filter urunler based on search query
  const filteredUrunler = useMemo(() => {
    if (!searchQuery.trim()) return urunler;
    return urunler.filter(
      (u) =>
        textIncludes(u.ad, searchQuery) ||
        (u.kod && textIncludes(u.kod, searchQuery)) ||
        (u.kategori_id && textIncludes(kategoriNameMap.get(u.kategori_id) ?? '', searchQuery))
    );
  }, [urunler, searchQuery, kategoriNameMap]);

  // Calculate totals and notify parent
  const totals = useMemo(() => calculateUrunGrandTotal(urunItems), [urunItems]);

  // Notify parent when total changes
  useEffect(() => {
    if (onTotalChange && urunItems.length > 0) {
      onTotalChange(totals.grandTotal);
    }
  }, [totals.grandTotal, onTotalChange, urunItems.length]);

  const handleClose = useCallback(() => {
    onSearchQueryChange('');
    setAddingProduct(null);
    setEditingUrunId(null);
    setFaturaToplami('');
    onDismiss();
  }, [onDismiss, onSearchQueryChange]);

  // Ürün seçildiğinde ekleme moduna geç
  const handleSelectUrun = useCallback((urun: Urun) => {
    // Zaten eklenmişse seçme
    if (urunItems.some((item) => item.urunId === urun.id)) return;

    setEditingUrunId(null); // Yeni ekleme
    setAddingProduct({
      urun,
      miktar: '',
      // formatAmountForInput: locale-doğru ondalık ayraç (tr'de virgül) üretir; ham
      // .toString() 3-ondalıklı fiyatı ("10.987") parseCurrency'de binlik ayraç sanılıp
      // ~1000x şişiriyordu (10987). Düzenle yolu (handleEditItem) ile aynı.
      // Yön-bazlı varsayılan: satışta satış fiyatı, alışta alış fiyatı öncelikli.
      birimFiyat: formatAmountForInput(
        islemYonu === 'satis'
          ? (urun.satis_fiyati || urun.alis_fiyati || 0)
          : (urun.alis_fiyati || urun.satis_fiyati || 0)
      ),
      kdvOrani: urun.kdv_orani || 0,
    });
  }, [urunItems, islemYonu]);

  // Inline ürün oluşturma (CariPickerSheet inline-cari deseninin ürün karşılığı):
  // arama eşleşmiyorsa "+ yeni ekle" satırı çıkar, oluşturulan ürün otomatik seçilir.
  const trimmedQuery = searchQuery.trim();
  const showCreateRow =
    !!onCreateNew &&
    trimmedQuery.length > 0 &&
    !urunler.some((u) => u.ad.toLowerCase() === trimmedQuery.toLowerCase());
  const handleCreateNew = useCallback(async () => {
    if (!onCreateNew || !trimmedQuery || creating) return;
    haptics.light();
    const yeni = await onCreateNew(trimmedQuery);
    if (yeni) {
      onSearchQueryChange('');
      handleSelectUrun(yeni);
    }
  }, [onCreateNew, trimmedQuery, creating, haptics, onSearchQueryChange, handleSelectUrun]);

  // Kalıcı "ürün ekle" butonunun akıllı davranışı:
  // - Yeni bir isim yazıldıysa (showCreateRow) → hızlı inline oluştur + otomatik seç.
  // - Boş arama veya mevcut isim → tam ürün ekleme sayfasına yönlendir (modal kapanır).
  const canAddProduct = showCreateRow || !!onAddFullProduct;
  const handleAddProductPress = useCallback(() => {
    if (showCreateRow) {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      handleCreateNew();
    } else if (onAddFullProduct) {
      haptics.light();
      onAddFullProduct();
    }
  }, [showCreateRow, handleCreateNew, onAddFullProduct, haptics]);

  // Mevcut ürünü düzenleme moduna al
  const handleEditItem = useCallback((item: UrunItem) => {
    const urun = urunler.find(u => u.id === item.urunId);
    if (!urun) return;

    setEditingUrunId(item.urunId);
    setAddingProduct({
      urun,
      miktar: formatAmountForInput(item.miktar),
      birimFiyat: formatAmountForInput(item.birimFiyat),
      kdvOrani: item.kdvOrani,
    });
  }, [urunler]);

  // Ürünü listeye ekle veya güncelle
  const handleConfirmAdd = useCallback(() => {
    if (!addingProduct) return;

    // Default to 1 if miktar is empty
    const miktarStr = addingProduct.miktar.trim() || '1';
    const miktar = parseQuantity(miktarStr) || 1;
    const birimFiyat = parseCurrency(addingProduct.birimFiyat) || 0;

    if (miktar <= 0) return;

    const newItem: UrunItem = {
      urunId: addingProduct.urun.id,
      urunAd: addingProduct.urun.ad,
      miktar,
      birimFiyat,
      kdvOrani: addingProduct.kdvOrani,
      birim: addingProduct.urun.birim,
    };

    if (editingUrunId) {
      // Düzenleme modu - mevcut ürünü güncelle
      const updatedItems = urunItems.map(item =>
        item.urunId === editingUrunId ? newItem : item
      );
      onUrunItemsChange(updatedItems);
    } else {
      // Ekleme modu - yeni ürün ekle
      onUrunItemsChange([...urunItems, newItem]);
    }

    setAddedExpanded(true); // yeni/güncellenen kalem görünür olsun
    setAddingProduct(null);
    setEditingUrunId(null);
  }, [addingProduct, urunItems, onUrunItemsChange, editingUrunId]);

  // Ekleme/düzenleme modunu iptal et
  const handleCancelAdd = useCallback(() => {
    setAddingProduct(null);
    setEditingUrunId(null);
  }, []);

  const handleRemoveItem = useCallback(
    (urunId: string) => {
      const newItems = urunItems.filter((item) => item.urunId !== urunId);
      onUrunItemsChange(newItems);
      // Eğer tüm ürünler silindiyse parent'a 0 gönder
      if (newItems.length === 0 && onTotalChange) {
        onTotalChange(0);
      }
    },
    [urunItems, onUrunItemsChange, onTotalChange]
  );

  const getBirimLabel = (birim: BirimType) => {
    return t(`products:units.${birim}`);
  };

  // Check if urun is already added
  const isUrunAdded = useCallback(
    (urunId: string) => urunItems.some((item) => item.urunId === urunId),
    [urunItems]
  );

  // Ekleme modundaki ürünün satır toplamı
  const addingLineTotal = useMemo(() => {
    if (!addingProduct) return { subtotal: 0, kdvAmount: 0, total: 0 };
    // Default to 1 if miktar is empty
    const miktarStr = addingProduct.miktar.trim() || '1';
    const miktar = parseQuantity(miktarStr) || 1;
    const birimFiyat = parseCurrency(addingProduct.birimFiyat) || 0;
    const subtotal = miktar * birimFiyat;
    const kdvAmount = subtotal * (addingProduct.kdvOrani / 100);
    return { subtotal, kdvAmount, total: subtotal + kdvAmount };
  }, [addingProduct]);

  if (!visible) return null;

  return (
    <Modal
      visible
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <View style={sharedStyles.bottomSheetOverlay}>
        <TouchableWithoutFeedback onPress={handleClose}>
          <View style={{ flex: 1 }} />
        </TouchableWithoutFeedback>
        <View
          style={[
            sharedStyles.bottomSheetContent,
            { height: windowHeight * 0.92, paddingBottom: insets.bottom },
          ]}
        >
              {/* Grabber — bottom-sheet kaydırılabilirlik ipucu */}
              <View style={styles.grabber} />

              {/* Header */}
              <View style={sharedStyles.bottomSheetHeader}>
                <Text style={sharedStyles.bottomSheetTitle}>
                  {t('transactions:stock.addStock')}
                </Text>
                <TouchableOpacity
                  onPress={handleClose}
                  style={sharedStyles.bottomSheetCloseBtn}
                >
                  <X size={24} color={colors.text} />
                </TouchableOpacity>
              </View>

              {/* Search Bar */}
              <View style={sharedStyles.searchContainer}>
                <Search size={20} color={colors.textMuted} />
                <TextInput
                  style={sharedStyles.searchInput}
                  placeholder={t('transactions:stock.searchProduct')}
                  placeholderTextColor={colors.textMuted}
                  value={searchQuery}
                  onChangeText={onSearchQueryChange}
                  autoCorrect={false}
                />
                {searchQuery.length > 0 && (
                  <TouchableOpacity onPress={() => onSearchQueryChange('')}>
                    <X size={18} color={colors.textMuted} />
                  </TouchableOpacity>
                )}
              </View>

              {/* === Kalıcı "Yeni Ürün Ekle" butonu — arama barının hemen altında, ScrollView DIŞINDA.
                  Yeni isim yazılınca '"x" olarak yeni ekle' (hızlı inline), boş/mevcut isimde
                  "Yeni Ürün Ekle" (tam ekran sayfa). Eski liste-içi dashed satır kaldırıldı. */}
              {!addingProduct && canAddProduct && (
                <TouchableOpacity
                  style={[styles.createNewButton, creating && styles.createNewButtonDisabled]}
                  onPress={handleAddProductPress}
                  disabled={creating}
                  activeOpacity={0.85}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: creating }}
                  accessibilityLabel={
                    showCreateRow
                      ? t('products:picker.addNew', { name: trimmedQuery })
                      : t('products:picker.addNewStatic')
                  }
                >
                  <View style={styles.createNewIcon}>
                    {creating ? (
                      <ActivityIndicator size="small" color={colors.white} />
                    ) : (
                      <Plus size={20} color={colors.white} />
                    )}
                  </View>
                  <Text style={styles.createNewText} numberOfLines={1}>
                    {showCreateRow
                      ? t('products:picker.addNew', { name: trimmedQuery })
                      : t('products:picker.addNewStatic')}
                  </Text>
                </TouchableOpacity>
              )}

              <ScrollView
                style={styles.content}
                contentContainerStyle={styles.contentContainer}
                keyboardShouldPersistTaps="handled"
                nestedScrollEnabled
                showsVerticalScrollIndicator
                automaticallyAdjustKeyboardInsets
              >
                {/* Ürün Ekleme Formu */}
                {addingProduct && (
                  <View style={styles.addingSection}>
                    <View style={styles.addingHeader}>
                      <View style={styles.addingUrunInfo}>
                        <Package size={20} color={colors.primary} />
                        <Text style={styles.addingUrunName}>
                          {addingProduct.urun.ad}
                        </Text>
                      </View>
                      <TouchableOpacity onPress={handleCancelAdd}>
                        <X size={20} color={colors.textMuted} />
                      </TouchableOpacity>
                    </View>

                    {/* Miktar */}
                    <View style={styles.inputRow}>
                      <Text style={styles.inputLabel}>
                        {t('transactions:stock.quantity')}
                      </Text>
                      <View style={styles.inputWrapper}>
                        <TextInput
                          style={styles.numberInput}
                          value={addingProduct.miktar}
                          onChangeText={(text) =>
                            setAddingProduct({ ...addingProduct, miktar: text })
                          }
                          keyboardType="decimal-pad"
                          placeholder="1"
                          placeholderTextColor={colors.textMuted}
                          autoFocus
                          selectTextOnFocus
                        />
                        <Text style={styles.inputUnit}>
                          {getBirimLabel(addingProduct.urun.birim)}
                        </Text>
                      </View>
                    </View>

                    {/* Birim Fiyat */}
                    <View style={styles.inputRow}>
                      <Text style={styles.inputLabel}>
                        {t('transactions:stock.unitPrice')}
                      </Text>
                      <View style={styles.inputWrapper}>
                        <TextInput
                          style={styles.numberInput}
                          value={addingProduct.birimFiyat}
                          onChangeText={(text) =>
                            setAddingProduct({ ...addingProduct, birimFiyat: text })
                          }
                          keyboardType="decimal-pad"
                          placeholder="0"
                          placeholderTextColor={colors.textMuted}
                          selectTextOnFocus
                        />
                        <Text style={styles.inputUnit}>{currency}</Text>
                      </View>
                    </View>

                    {/* Referans fiyat rozeti — ürünün alış/satış fiyatı; dokununca doldurur */}
                    {(() => {
                      const refFiyat = islemYonu === 'satis'
                        ? addingProduct.urun.satis_fiyati
                        : addingProduct.urun.alis_fiyati;
                      if (!refFiyat || refFiyat <= 0) return null;
                      return (
                        <TouchableOpacity
                          style={styles.priceHintRow}
                          onPress={() => setAddingProduct({ ...addingProduct, birimFiyat: formatAmountForInput(refFiyat) })}
                          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.priceHintText}>
                            {islemYonu === 'satis' ? t('transactions:stock.refSale') : t('transactions:stock.refPurchase')}: {formatCurrency(refFiyat, currency)}
                          </Text>
                        </TouchableOpacity>
                      );
                    })()}

                    {/* KDV */}
                    <View style={styles.inputRow}>
                      <Text style={styles.inputLabel}>
                        {t('transactions:stock.vatRate')}
                      </Text>
                      <View style={styles.kdvButtons}>
                        {KDV_ORANLARI.map((oran) => (
                          <TouchableOpacity
                            key={oran}
                            style={[
                              styles.kdvButton,
                              addingProduct.kdvOrani === oran && styles.kdvButtonActive,
                            ]}
                            onPress={() =>
                              setAddingProduct({ ...addingProduct, kdvOrani: oran })
                            }
                          >
                            <Text
                              style={[
                                styles.kdvButtonText,
                                addingProduct.kdvOrani === oran && styles.kdvButtonTextActive,
                              ]}
                            >
                              %{oran}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>

                    {/* Satır toplamı dökümü — faturayla karşılaştırma için KDV hariç + KDV + KDV dahil.
                        KDV %0 ise tek satır (net=brüt). Kaydedilen işlem tutarı KDV DAHİL kalır. */}
                    {addingLineTotal.kdvAmount > 0 ? (
                      <View style={styles.addingBreakdown}>
                        <View style={styles.addingBreakdownRow}>
                          <Text style={styles.addingTotalLabel}>{t('transactions:stock.vatExcluded')}</Text>
                          <Text style={styles.addingBreakdownNet}>{formatCurrency(addingLineTotal.subtotal, currency)}</Text>
                        </View>
                        <View style={styles.addingBreakdownRow}>
                          <Text style={styles.addingTotalLabel}>{t('common:tax.vat')} (%{addingProduct.kdvOrani})</Text>
                          <Text style={styles.addingBreakdownKdv}>{formatCurrency(addingLineTotal.kdvAmount, currency)}</Text>
                        </View>
                        <View style={styles.addingBreakdownRow}>
                          <Text style={styles.addingBreakdownGrandLabel}>{t('transactions:stock.vatIncluded')}</Text>
                          <Text style={styles.addingTotalValue}>{formatCurrency(addingLineTotal.total, currency)}</Text>
                        </View>
                      </View>
                    ) : (
                      <View style={styles.addingTotalRow}>
                        <Text style={styles.addingTotalLabel}>{t('transactions:stock.lineTotal')}</Text>
                        <Text style={styles.addingTotalValue}>{formatCurrency(addingLineTotal.total, currency)}</Text>
                      </View>
                    )}

                    {/* Ekle/Güncelle Butonu */}
                    <TouchableOpacity
                      style={styles.addButton}
                      onPress={handleConfirmAdd}
                    >
                      <Check size={20} color={colors.white} />
                      <Text style={styles.addButtonText}>
                        {editingUrunId ? t('common:buttons.update') : t('common:buttons.add')}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* Ürün Listesi (ÜRÜN SEÇ) — arama sonuçları burada; eklenen listenin ÜSTÜNDE olacak şekilde öne alındı */}
                {!addingProduct && (
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>
                      {t('transactions:stock.selectProduct')}
                    </Text>
                    {filteredUrunler.length === 0 ? (
                      <View style={styles.emptyState}>
                        <Package size={40} color={colors.textMuted} />
                        <Text style={styles.emptyStateText}>
                          {t('transactions:stock.noProducts')}
                        </Text>
                      </View>
                    ) : (
                      filteredUrunler.map((urun) => {
                        const added = isUrunAdded(urun.id);
                        return (
                          <TouchableOpacity
                            key={urun.id}
                            style={[styles.urunItem, added && styles.urunItemAdded]}
                            onPress={() => !added && handleSelectUrun(urun)}
                            disabled={added}
                          >
                            <View style={styles.urunIcon}>
                              <Package size={20} color={added ? colors.success : colors.primary} />
                            </View>
                            <View style={styles.urunInfo}>
                              <Text style={styles.urunName}>{urun.ad}</Text>
                              <View style={styles.urunDetailRow}>
                                <Text style={styles.urunDetail}>
                                  {formatQuantity(urun.miktar)} {getBirimLabel(urun.birim)}
                                  {urun.satis_fiyati > 0 &&
                                    ` • ${formatCurrency(urun.satis_fiyati, urun.currency)}`}
                                </Text>
                                {urun.kategori_id && kategoriNameMap.get(urun.kategori_id) && (
                                  <View style={styles.urunCategoryBadge}>
                                    <Text style={styles.urunCategoryText}>
                                      {kategoriNameMap.get(urun.kategori_id)}
                                    </Text>
                                  </View>
                                )}
                              </View>
                            </View>
                            {added ? (
                              <View style={styles.addedBadge}>
                                <Check size={14} color={colors.white} />
                              </View>
                            ) : (
                              <View style={styles.selectButton}>
                                <Plus size={20} color={colors.primary} />
                              </View>
                            )}
                          </TouchableOpacity>
                        );
                      })
                    )}
                  </View>
                )}

                {/* Eklenen Ürünler — akordeon (özet: N kalem + KDV Dahil toplam). ÜRÜN SEÇ'in
                    altında, daraltılabilir; arama modunda otomatik kapanır ki sonuçları bloke etmesin. */}
                {urunItems.length > 0 && (
                  <ExpandableCard
                    expanded={addedExpanded}
                    onToggle={() => setAddedExpanded((v) => !v)}
                    header={
                      <View style={styles.addedHeaderRow}>
                        <Text style={[styles.sectionTitle, styles.addedHeaderTitle]}>
                          {t('transactions:stock.addedProducts')} ({urunItems.length})
                        </Text>
                        <Text style={styles.addedHeaderTotal}>
                          {t('transactions:stock.vatIncluded')}: {formatCurrency(totals.grandTotal, currency)}
                        </Text>
                      </View>
                    }
                  >
                    {urunItems.map((item) => {
                      const lineTotal = calculateUrunLineTotal(item);
                      const isBeingEdited = editingUrunId === item.urunId;
                      return (
                        <View key={item.urunId} style={[styles.addedItem, isBeingEdited && styles.addedItemEditing]}>
                          <View style={styles.addedItemLeft}>
                            <Text style={styles.addedItemName}>{item.urunAd}</Text>
                            <Text style={styles.addedItemDetail}>
                              {formatQuantity(item.miktar)} {getBirimLabel(item.birim)} × {formatCurrency(item.birimFiyat, currency)}
                              {item.kdvOrani > 0 && ` (+%${item.kdvOrani} ${t('common:tax.vat')})`}
                            </Text>
                          </View>
                          <Text style={styles.addedItemTotal}>
                            {formatCurrency(lineTotal.subtotal, currency)}
                          </Text>
                          <TouchableOpacity
                            onPress={() => handleEditItem(item)}
                            style={styles.editButton}
                          >
                            <Pencil size={16} color={colors.primary} />
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => handleRemoveItem(item.urunId)}
                            style={styles.removeButton}
                          >
                            <Trash2 size={18} color={colors.error} />
                          </TouchableOpacity>
                        </View>
                      );
                    })}
                  </ExpandableCard>
                )}

                {/* Fatura mutabakatı — faturadaki KDV dahil toplamı gir, hesaplananla farkı
                    canlı gör. ScrollView içinde (klavye-güvenli); tarama modunda gösterilir. */}
                {!addingProduct && urunItems.length > 0 && (
                  <View style={styles.reconcileCard}>
                    <View style={styles.reconcileRow}>
                      <Text style={styles.reconcileLabel}>
                        {t('transactions:stock.invoiceTotal')}
                      </Text>
                      <TextInput
                        style={styles.reconcileInput}
                        value={faturaToplami}
                        onChangeText={setFaturaToplami}
                        keyboardType="decimal-pad"
                        placeholder={formatCurrency(totals.grandTotal, currency)}
                        placeholderTextColor={colors.textMuted}
                        selectTextOnFocus
                        returnKeyType="done"
                      />
                    </View>
                    {(() => {
                      const girilen = parseCurrency(faturaToplami);
                      if (!faturaToplami.trim() || girilen <= 0) return null;
                      const fark = roundCurrency(girilen - totals.grandTotal);
                      const esit = Math.abs(fark) < 0.01;
                      return (
                        <View style={styles.reconcileDiffRow}>
                          <Text style={esit ? styles.reconcileMatchText : styles.reconcileMismatchText}>
                            {esit
                              ? `✓ ${t('transactions:stock.invoiceMatch')}`
                              : `${t('transactions:stock.invoiceDiff')}: ${fark > 0 ? '+' : ''}${formatCurrency(fark, currency)}`}
                          </Text>
                        </View>
                      );
                    })()}
                  </View>
                )}
              </ScrollView>

              {/* Footer with Totals */}
              {urunItems.length > 0 && (
                <View style={styles.footer}>
                  <View style={styles.totalsSection}>
                    <View style={styles.totalRow}>
                      <Text style={styles.totalLabel}>
                        {t('transactions:stock.vatExcluded')}
                      </Text>
                      <Text style={styles.totalValue}>
                        {formatCurrency(totals.subtotal, currency)}
                      </Text>
                    </View>
                    {totals.kdvTotal > 0 && (
                      <View style={styles.totalRow}>
                        <Text style={styles.totalLabel}>
                          {t('transactions:stock.vatTotal')}
                        </Text>
                        <Text style={styles.totalValue}>
                          {formatCurrency(totals.kdvTotal, currency)}
                        </Text>
                      </View>
                    )}
                    <View style={[styles.totalRow, styles.grandTotalRow]}>
                      <Text style={styles.grandTotalLabel}>
                        {t('transactions:stock.vatIncluded')}
                      </Text>
                      <Text style={styles.grandTotalValue}>
                        {formatCurrency(totals.grandTotal, currency)}
                      </Text>
                    </View>
                  </View>
                  <Button variant="primary" onPress={handleClose}>
                    {t('common:buttons.ok')}
                  </Button>
                </View>
              )}

              {/* Simple close button when no items */}
              {urunItems.length === 0 && !addingProduct && (
                <View style={styles.footerSimple}>
                  <Button variant="outline" onPress={handleClose}>
                    {t('common:buttons.close')}
                  </Button>
                </View>
              )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
  },
  grabber: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  addedHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flex: 1,
    gap: spacing.sm,
  },
  addedHeaderTitle: {
    marginBottom: 0,
    flexShrink: 1,
  },
  addedHeaderTotal: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.primary,
  },
  priceHintRow: {
    alignSelf: 'flex-start',
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
    paddingVertical: 3,
    paddingHorizontal: spacing.sm,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  priceHintText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.primary,
  },
  reconcileCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  reconcileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  reconcileLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
    flexShrink: 1,
  },
  reconcileInput: {
    minWidth: 120,
    textAlign: 'right',
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingVertical: 4,
    paddingHorizontal: spacing.xs,
  },
  reconcileDiffRow: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    alignItems: 'flex-end',
  },
  reconcileMatchText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.success,
  },
  reconcileMismatchText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.error,
  },
  // Ürün Ekleme Formu
  addingSection: {
    backgroundColor: colors.primaryLight,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.lg,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  addingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.primary + '30',
  },
  addingUrunInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  addingUrunName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    flex: 1,
  },
  addingTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.primary + '30',
  },
  addingTotalLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  addingTotalValue: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.primary,
  },
  addingTotalKdv: {
    fontSize: 12,
    fontWeight: '400',
    color: colors.textMuted,
  },
  addingBreakdown: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.primary + '30',
    gap: 4,
  },
  addingBreakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  addingBreakdownNet: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  addingBreakdownKdv: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textMuted,
  },
  addingBreakdownGrandLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    marginTop: spacing.md,
  },
  addButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.white,
  },
  // Kalıcı "Yeni Ürün Ekle" butonu (arama barı altı)
  createNewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    borderRadius: borderRadius.lg,
    ...shadows.md,
  },
  createNewButtonDisabled: {
    opacity: 0.5,
  },
  createNewIcon: {
    width: 28,
    height: 28,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primaryDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createNewText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: colors.white,
  },
  // Ürün Listesi
  urunItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  urunItemAdded: {
    opacity: 0.6,
    borderColor: colors.success,
  },
  urunIcon: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  urunInfo: {
    flex: 1,
  },
  urunName: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.text,
    marginBottom: 2,
  },
  urunDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 4,
  },
  urunDetail: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  urunCategoryBadge: {
    backgroundColor: colors.background,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  urunCategoryText: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  selectButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addedBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Eklenen Ürünler
  addedItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  addedItemLeft: {
    flex: 1,
  },
  addedItemName: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.text,
  },
  addedItemDetail: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  addedItemTotal: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.primary,
    marginRight: spacing.sm,
  },
  removeButton: {
    padding: spacing.xs,
  },
  editButton: {
    padding: spacing.xs,
    marginRight: spacing.xs,
  },
  addedItemEditing: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  // Input Rows
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  inputLabel: {
    fontSize: 14,
    color: colors.textSecondary,
    width: 90,
  },
  inputWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.sm,
  },
  numberInput: {
    flex: 1,
    height: 40,
    fontSize: 15,
    color: colors.text,
    textAlign: 'right',
  },
  inputUnit: {
    fontSize: 14,
    color: colors.textSecondary,
    marginLeft: spacing.xs,
    minWidth: 40,
  },
  kdvButtons: {
    flex: 1,
    flexDirection: 'row',
    gap: spacing.xs,
  },
  kdvButton: {
    flex: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  kdvButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  kdvButtonText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  kdvButtonTextActive: {
    color: colors.white,
  },
  // Empty State
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl,
  },
  emptyStateText: {
    fontSize: 15,
    color: colors.textMuted,
    marginTop: spacing.sm,
  },
  // Footer
  footer: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  footerSimple: {
    padding: spacing.lg,
  },
  totalsSection: {
    gap: spacing.xs,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  totalValue: {
    fontSize: 14,
    color: colors.text,
  },
  grandTotalRow: {
    marginTop: spacing.xs,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  grandTotalLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  grandTotalValue: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.primary,
  },
});
