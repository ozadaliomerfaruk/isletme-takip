import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Modal,
  TouchableOpacity,
  TouchableWithoutFeedback,
  TextInput,
  ScrollView,
  Dimensions,
  Keyboard,
  StyleSheet,
  ActivityIndicator,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X, Package, Plus, Trash2, Check, Pencil, ChevronUp, ChevronDown } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { Text, Button, UndoSnackbar, ModalSearchBar } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing, borderRadius, shadows, HIT_SLOP } from '@/constants/spacing';
import { formatCurrency, parseCurrency, parseQuantity, formatQuantity, formatAmountForInput } from '@/lib/currency';
import { useKategoriler } from '@/hooks/useKategoriler';
import { useSonUrunFiyati } from '@/hooks/useUrunHareketler';
import { useDateFormat } from '@/hooks/useDateFormat';
import { useHaptics } from '@/hooks/useHaptics';
import { searchMatchesTr } from '@/lib/turkishTextUtils';
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
  // Kullanıcı fiyat alanına dokunduysa son-fiyat otomatik doldurması devre dışı kalır
  const priceTouchedRef = useRef(false);
  const { formatDateShort } = useDateFormat();
  // Son işlem fiyatı (yalnız YENİ eklemede; düzenlemede kullanıcının fiyatı korunur)
  const addingUrunId = addingProduct && editingUrunId === null ? addingProduct.urun.id : undefined;
  const { data: sonFiyat } = useSonUrunFiyati(addingUrunId, islemYonu);

  // Son fiyat yüklendiğinde, kullanıcı fiyata dokunmadıysa alanı onunla doldur.
  // Ürün kartındaki sabit fiyat işlemlerle güncellenmediğinden bayat kalabiliyor;
  // güncel piyasa fiyatı son işlemdir (kullanıcı isteği, 4 Tem).
  useEffect(() => {
    if (!sonFiyat || !addingUrunId || priceTouchedRef.current) return;
    const yeni = formatAmountForInput(sonFiyat.fiyat);
    setAddingProduct((prev) =>
      prev && prev.urun.id === addingUrunId && prev.birimFiyat !== yeni
        ? { ...prev, birimFiyat: yeni }
        : prev,
    );
  }, [sonFiyat, addingUrunId]);
  // Eklenen ürünler paneli (footer'da, YUKARI açılır): varsayılan KAPALI. 300 kalemlik
  // listeye scroll etmeden, alttaki toplam satırına dokunup eklenenler açılıp görülür.
  const [addedExpanded, setAddedExpanded] = useState(false);
  // Silme geri-al: son silinen kalem + orijinal index; süreli otomatik kapanır
  const [lastRemoved, setLastRemoved] = useState<{ item: UrunItem; index: number } | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Bileşen kaldırılırken geri-al zamanlayıcısını temizle (bellek sızıntısı önleme)
  useEffect(() => {
    return () => {
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    };
  }, []);

  // Filter urunler based on search query
  const filteredUrunler = useMemo(() => {
    if (!searchQuery.trim()) return urunler;
    return urunler.filter(
      (u) =>
        searchMatchesTr(u.ad, searchQuery) ||
        (u.kod && searchMatchesTr(u.kod, searchQuery)) ||
        (u.kategori_id && searchMatchesTr(kategoriNameMap.get(u.kategori_id) ?? '', searchQuery))
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
    setLastRemoved(null);
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    onDismiss();
  }, [onDismiss, onSearchQueryChange]);

  // Ürün seçildiğinde ekleme moduna geç
  const handleSelectUrun = useCallback((urun: Urun) => {
    // Zaten eklenmişse seçme
    if (urunItems.some((item) => item.urunId === urun.id)) return;

    priceTouchedRef.current = false; // yeni üründe son-fiyat otomatik doldurması aktif
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

    priceTouchedRef.current = true; // düzenlemede kullanıcının fiyatı asla ezilmez
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
      const index = urunItems.findIndex((item) => item.urunId === urunId);
      if (index === -1) return;
      const removed = urunItems[index];
      const newItems = urunItems.filter((item) => item.urunId !== urunId);
      onUrunItemsChange(newItems);
      // Eğer tüm ürünler silindiyse parent'a 0 gönder
      if (newItems.length === 0 && onTotalChange) {
        onTotalChange(0);
      }
      // Geri-al için sakla + 5 sn sonra otomatik kapat (yanlışlıkla silmeye emniyet)
      setLastRemoved({ item: removed, index });
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
      undoTimerRef.current = setTimeout(() => setLastRemoved(null), 5000);
    },
    [urunItems, onUrunItemsChange, onTotalChange]
  );

  const handleUndoRemove = useCallback(() => {
    if (!lastRemoved) return;
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    const insertAt = Math.min(lastRemoved.index, urunItems.length);
    const restored = [...urunItems];
    restored.splice(insertAt, 0, lastRemoved.item);
    onUrunItemsChange(restored);
    setLastRemoved(null);
  }, [lastRemoved, urunItems, onUrunItemsChange]);

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

              {/* Başlık altında sabit arama çubuğu — ürün ekleme formu açıkken gizli (klavye formda) */}
              {!addingProduct && (
                <ModalSearchBar
                  value={searchQuery}
                  onChangeText={onSearchQueryChange}
                  placeholder={t('transactions:stock.searchProduct')}
                />
              )}

              {/* === Kalıcı "Yeni Ürün Ekle" butonu — arama barının hemen altında, ScrollView DIŞINDA.
                  Yeni isim yazılınca '"x" olarak yeni ekle' (hızlı inline), boş/mevcut isimde
                  "Yeni Ürün Ekle" (tam ekran sayfa). Eski liste-içi dashed satır kaldırıldı. */}
              {!addingProduct && canAddProduct && (
                <TouchableOpacity
                  style={[styles.createNewButton, creating && styles.createNewButtonDisabled]}
                  onPress={handleAddProductPress}
                  disabled={creating}
                  activeOpacity={0.85}
                  hitSlop={HIT_SLOP.sm}
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

              {/* Liste alanı sarmalayıcısı: yüzen arama çubuğu footer'ın ÜSTÜNDE,
                  bu flex-1 alanın altında konumlanır */}
              <View style={styles.content}>
              <ScrollView
                style={styles.content}
                contentContainerStyle={styles.contentContainer}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                alwaysBounceVertical
                onScrollBeginDrag={() => Keyboard.dismiss()}
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
                      <TouchableOpacity onPress={handleCancelAdd} hitSlop={HIT_SLOP.sm}>
                        <X size={20} color={colors.textMuted} />
                      </TouchableOpacity>
                    </View>

                    {/* Para birimi uyarısı — ürün para birimi işlem para biriminden farklıysa
                        tutarlar çevrilmeden eklenir; kullanıcıyı uyar. */}
                    {addingProduct.urun.currency && addingProduct.urun.currency !== currency && (
                      <View style={styles.currencyWarnRow}>
                        <Text style={styles.currencyWarnText}>
                          {t('transactions:stock.currencyMismatch', {
                            productCurrency: addingProduct.urun.currency,
                            txnCurrency: currency,
                          })}
                        </Text>
                      </View>
                    )}

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
                          onChangeText={(text) => {
                            priceTouchedRef.current = true;
                            setAddingProduct({ ...addingProduct, birimFiyat: text });
                          }}
                          keyboardType="decimal-pad"
                          placeholder="0"
                          placeholderTextColor={colors.textMuted}
                          selectTextOnFocus
                        />
                        <Text style={styles.inputUnit}>{currency}</Text>
                      </View>
                    </View>

                    {/* Referans fiyat rozetleri — dokununca doldurur.
                        1) Son işlem fiyatı (yön bazlı, urun_hareketleri'nden — güncel piyasa)
                        2) Ürün kartındaki sabit alış/satış fiyatı */}
                    {(() => {
                      const refFiyat = islemYonu === 'satis'
                        ? addingProduct.urun.satis_fiyati
                        : addingProduct.urun.alis_fiyati;
                      const sonVar = editingUrunId === null && sonFiyat && sonFiyat.fiyat > 0;
                      if (!sonVar && (!refFiyat || refFiyat <= 0)) return null;
                      return (
                        <View style={styles.priceHintsContainer}>
                          {sonVar ? (
                            <TouchableOpacity
                              style={styles.priceHintRow}
                              onPress={() => {
                                priceTouchedRef.current = true;
                                setAddingProduct({ ...addingProduct, birimFiyat: formatAmountForInput(sonFiyat.fiyat) });
                              }}
                              hitSlop={HIT_SLOP.sm}
                              activeOpacity={0.7}
                            >
                              <Text style={styles.priceHintText}>
                                {t('transactions:stock.lastPrice')}: {formatCurrency(sonFiyat.fiyat, currency)} · {formatDateShort(sonFiyat.tarih)}
                              </Text>
                            </TouchableOpacity>
                          ) : null}
                          {refFiyat && refFiyat > 0 ? (
                            <TouchableOpacity
                              style={styles.priceHintRow}
                              onPress={() => {
                                priceTouchedRef.current = true;
                                setAddingProduct({ ...addingProduct, birimFiyat: formatAmountForInput(refFiyat) });
                              }}
                              hitSlop={HIT_SLOP.sm}
                              activeOpacity={0.7}
                            >
                              <Text style={styles.priceHintText}>
                                {islemYonu === 'satis' ? t('transactions:stock.refSale') : t('transactions:stock.refPurchase')}: {formatCurrency(refFiyat, currency)}
                              </Text>
                            </TouchableOpacity>
                          ) : null}
                        </View>
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
              </ScrollView>
              </View>

              {/* Footer: YUKARI açılan "Eklenen Ürünler" paneli + KDV Dahil özet satırı (tıkla-aç)
                  + KDV Hariç/KDV dökümü + OK. 300 kalemlik listeye scroll etmeden, alttaki toplam
                  satırından eklenenler görülür ve panel yukarı doğru açılır. */}
              {urunItems.length > 0 && (
                <View style={styles.footer}>
                  {/* Açılır panel — toggle'ın ÜSTÜNDE render edildiği için görsel olarak YUKARI büyür.
                      maxHeight + kendi ScrollView'u: çok kalemde OK butonunu taşırmaz. */}
                  {addedExpanded && (
                    <View style={[styles.addedPanel, { maxHeight: windowHeight * 0.4 }]}>
                      <ScrollView
                        style={styles.addedPanelScroll}
                        nestedScrollEnabled
                        keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
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
                                hitSlop={HIT_SLOP.sm}
                              >
                                <Pencil size={16} color={colors.primary} />
                              </TouchableOpacity>
                              <TouchableOpacity
                                onPress={() => handleRemoveItem(item.urunId)}
                                style={styles.removeButton}
                                hitSlop={HIT_SLOP.sm}
                              >
                                <Trash2 size={18} color={colors.error} />
                              </TouchableOpacity>
                            </View>
                          );
                        })}
                      </ScrollView>
                    </View>
                  )}

                  {/* Tıkla-aç özet satırı: solda chevron + "Eklenen (N)", sağda KDV Dahil toplam */}
                  <TouchableOpacity
                    style={styles.toggleRow}
                    onPress={() => {
                      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                      haptics.light();
                      setAddedExpanded((v) => !v);
                    }}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                  >
                    <View style={styles.toggleLabelWrap}>
                      {addedExpanded ? (
                        <ChevronDown size={20} color={colors.textSecondary} />
                      ) : (
                        <ChevronUp size={20} color={colors.textSecondary} />
                      )}
                      <Text style={styles.toggleLabel}>
                        {t('transactions:stock.addedProducts')} ({urunItems.length})
                      </Text>
                    </View>
                    <Text style={styles.toggleTotal}>
                      {formatCurrency(totals.grandTotal, currency)}
                    </Text>
                  </TouchableOpacity>

                  {/* KDV Hariç + KDV dökümü (KDV Dahil toplam artık üstteki toggle satırında) */}
                  <View style={styles.totalsSection}>
                    <View style={styles.totalRow}>
                      <Text style={styles.totalLabel}>{t('transactions:stock.vatExcluded')}</Text>
                      <Text style={styles.totalValue}>{formatCurrency(totals.subtotal, currency)}</Text>
                    </View>
                    {totals.kdvTotal > 0 && (
                      <View style={styles.totalRow}>
                        <Text style={styles.totalLabel}>{t('transactions:stock.vatTotal')}</Text>
                        <Text style={styles.totalValue}>{formatCurrency(totals.kdvTotal, currency)}</Text>
                      </View>
                    )}
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

              {/* Silinen kalem için standart geri-al snackbar'ı (uygulama geneliyle AYNI görsel:
                  koyu-gri yüzen bant, Undo2 ikonu + X). Kendi 5 sn'lik undoTimerRef'imiz sürüyor. */}
              <UndoSnackbar
                visible={!!lastRemoved}
                message={lastRemoved ? t('transactions:stock.itemRemoved', { name: lastRemoved.item.urunAd }) : ''}
                onUndo={handleUndoRemove}
                onDismiss={() => {
                  if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
                  setLastRemoved(null);
                }}
                undoLabel={t('transactions:stock.undo')}
              />
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
  priceHintsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
  },
  priceHintRow: {
    alignSelf: 'flex-start',
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
  currencyWarnRow: {
    marginBottom: spacing.sm,
    padding: spacing.sm,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.error,
  },
  currencyWarnText: {
    fontSize: 12,
    fontWeight: '600',
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
  // Footer: yukarı açılan eklenen-ürünler paneli + tıkla-aç özet satırı
  addedPanel: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
  },
  addedPanelScroll: {
    flexGrow: 0,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.sm,
  },
  toggleLabelWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flexShrink: 1,
  },
  toggleLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  toggleTotal: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.primary,
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
});
