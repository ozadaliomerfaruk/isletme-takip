import { useState, useMemo, useRef } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Modal,
  TextInput,
  LayoutAnimation,
  UIManager,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import DateTimePickerRN from '@react-native-community/datetimepicker';
import { Plus, Trash2, Calendar, ChevronDown, Package, Search, X, Check } from 'lucide-react-native';
import { Text, Button } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing } from '@/constants/spacing';
import { useUrunler } from '@/hooks/useUrunler';
import { useCreateUrunHareket, useCreateBulkUrunHareketWithCari } from '@/hooks/useUrunHareketler';
import { useDateFormat } from '@/hooks/useDateFormat';
import { isToday, formatDateTimeForDB } from '@/lib/date';
import { formatCurrency, parseCurrency } from '@/lib/currency';
import { getCurrencySymbol } from '@/constants/currencies';
import { useSettings } from '@/hooks/useSettings';
import { Urun, BirimType, KdvOrani } from '@/types/database';
import { toErrorMessage } from '@/lib/errors';
import { usePagePermission } from '@/hooks/usePagePermission';
import { CariLinkSection } from '@/components/urun/QuickUrunBar/CariLinkSection';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const KDV_ORANLARI: KdvOrani[] = [0, 1, 10, 20];

interface StockRow {
  id: string;
  urunId: string | null;
  miktar: string;
  birimFiyat: string;
  kdvOrani: KdvOrani;
}

export default function TopluGirisPage() {
  const router = useRouter();
  const { t } = useTranslation(['products', 'common', 'transactions']);
  usePagePermission({ module: 'urunler', action: 'create' });
  const { currency } = useSettings();
  const createUrunHareket = useCreateUrunHareket();
  const createBulkWithCari = useCreateBulkUrunHareketWithCari();
  const { locale, formatDateMedium } = useDateFormat();

  const [date, setDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [rows, setRows] = useState<StockRow[]>([
    { id: '1', urunId: null, miktar: '', birimFiyat: '', kdvOrani: 0 },
  ]);
  const [isSaving, setIsSaving] = useState(false);
  const isSavingRef = useRef(false);
  const [productPickerVisible, setProductPickerVisible] = useState(false);
  const [activeRowId, setActiveRowId] = useState<string | null>(null);
  const [productSearch, setProductSearch] = useState('');

  // Cari link state
  const [cariLinkEnabled, setCariLinkEnabled] = useState(false);
  const [selectedCariId, setSelectedCariId] = useState<string | null>(null);

  const { data: urunler } = useUrunler();

  // Filter products by search
  const filteredUrunler = useMemo(() => {
    if (!productSearch.trim()) return urunler;
    return urunler?.filter(u =>
      u.ad.toLowerCase().includes(productSearch.toLowerCase()) ||
      (u.kod && u.kod.toLowerCase().includes(productSearch.toLowerCase()))
    );
  }, [urunler, productSearch]);

  const getBirimLabel = (birim: BirimType) => {
    return t(`products:units.${birim}`);
  };

  const getUrunById = (id: string | null): Urun | undefined => {
    return urunler?.find(u => u.id === id);
  };

  // Already selected product IDs (to mark in picker)
  const selectedProductIds = useMemo(() => {
    return new Set(rows.map(r => r.urunId).filter(Boolean) as string[]);
  }, [rows]);

  const addRow = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    const newId = Date.now().toString();
    setRows([...rows, { id: newId, urunId: null, miktar: '', birimFiyat: '', kdvOrani: 0 }]);
  };

  const removeRow = (id: string) => {
    if (rows.length > 1) {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setRows(rows.filter(r => r.id !== id));
    }
  };

  const updateRow = (id: string, field: keyof StockRow, value: string | KdvOrani) => {
    setRows(rows.map(r => r.id === id ? { ...r, [field]: value } : r));
  };

  const openProductPicker = (rowId: string) => {
    setActiveRowId(rowId);
    setProductSearch('');
    setProductPickerVisible(true);
  };

  const selectProduct = (urunId: string) => {
    if (activeRowId) {
      const urun = getUrunById(urunId);
      setRows(rows.map(r => {
        if (r.id !== activeRowId) return r;
        return {
          ...r,
          urunId,
          kdvOrani: urun?.kdv_orani ?? 0,
          birimFiyat: urun?.alis_fiyati ? String(urun.alis_fiyati) : r.birimFiyat,
        };
      }));
    }
    setProductPickerVisible(false);
    setActiveRowId(null);
    setProductSearch('');
  };

  // Valid rows count
  const validRows = useMemo(() => {
    return rows.filter(r => r.urunId && parseCurrency(r.miktar) > 0);
  }, [rows]);

  // Total amount (subtotal without KDV)
  const totalAmount = useMemo(() => {
    let total = 0;
    validRows.forEach(r => {
      const miktar = parseCurrency(r.miktar);
      const fiyat = parseCurrency(r.birimFiyat);
      if (fiyat > 0) {
        total += miktar * fiyat;
      }
    });
    return total;
  }, [validRows]);

  // Row line total (without KDV)
  const getRowSubtotal = (row: StockRow) => {
    const miktar = parseCurrency(row.miktar);
    const fiyat = parseCurrency(row.birimFiyat);
    if (miktar > 0 && fiyat > 0) return miktar * fiyat;
    return 0;
  };

  // Row KDV amount
  const getRowKdv = (row: StockRow) => {
    return getRowSubtotal(row) * (row.kdvOrani / 100);
  };

  // Cari totals for display
  const cariTotals = useMemo(() => {
    if (!cariLinkEnabled || totalAmount === 0) return null;
    let totalKdv = 0;
    validRows.forEach(r => {
      const subtotal = getRowSubtotal(r);
      totalKdv += subtotal * (r.kdvOrani / 100);
    });
    const grandTotal = totalAmount + totalKdv;
    return {
      subtotalDisplay: formatCurrency(totalAmount),
      kdvDisplay: totalKdv > 0 ? formatCurrency(totalKdv) : undefined,
      totalDisplay: formatCurrency(grandTotal),
    };
  }, [cariLinkEnabled, totalAmount, validRows]);

  const handleSave = async () => {
    if (validRows.length === 0) {
      Alert.alert(t('common:status.error'), t('products:bulk.noEntries'));
      return;
    }

    // Senkron çift-kaydetme kilidi: hızlı çift dokunuşta state güncellenmeden 2. kez girmesin
    if (isSavingRef.current) return;
    isSavingRef.current = true;
    setIsSaving(true);

    try {
      if (cariLinkEnabled && selectedCariId) {
        const items = validRows.map(row => {
          const urun = getUrunById(row.urunId);
          return {
            urun_id: row.urunId!,
            urun_ad: urun?.ad || '',
            miktar: parseCurrency(row.miktar),
            birim_fiyat: parseCurrency(row.birimFiyat) || 0,
            kdv_orani: row.kdvOrani,
          };
        });

        await createBulkWithCari.mutateAsync({
          hareket_tipi: 'giris',
          items,
          cari_id: selectedCariId,
          date: formatDateTimeForDB(date),
        });
      } else {
        const promises = validRows.map(row =>
          createUrunHareket.mutateAsync({
            urun_id: row.urunId!,
            hareket_tipi: 'giris',
            miktar: parseCurrency(row.miktar),
            birim_fiyat: parseCurrency(row.birimFiyat) || null,
            aciklama: null,
            created_at: formatDateTimeForDB(date),
          })
        );
        await Promise.all(promises);
      }

      Alert.alert(
        t('common:status.success'),
        t('products:bulk.success', { count: validRows.length }),
        [{ text: t('common:buttons.ok'), onPress: () => router.back() }]
      );
    } catch (error) {
      Alert.alert(t('common:status.error'), toErrorMessage(error) || t('transactions:messages.saveFailed'));
    } finally {
      setIsSaving(false);
      isSavingRef.current = false;
    }
  };

  return (
    <>
      <Stack.Screen
        options={{
          headerTitle: t('products:bulk.stockIn'),
        }}
      />
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.flex}
        >
          <ScrollView
            style={styles.flex}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Date Row */}
            <TouchableOpacity
              style={styles.dateRow}
              onPress={() => setShowDatePicker(true)}
            >
              <Calendar size={18} color={colors.primary} />
              <Text variant="body" style={styles.dateLabel}>
                {isToday(date) ? t('common:date.today') : formatDateMedium(date)}
              </Text>
              <ChevronDown size={16} color={colors.textMuted} />
            </TouchableOpacity>

            {/* Cari Link Section */}
            <View style={styles.section}>
              <CariLinkSection
                enabled={cariLinkEnabled}
                onToggle={setCariLinkEnabled}
                selectedCariId={selectedCariId}
                onSelectCari={setSelectedCariId}
                hareketTipi="giris"
                subtotalDisplay={cariTotals?.subtotalDisplay}
                kdvDisplay={cariTotals?.kdvDisplay}
                totalDisplay={cariTotals?.totalDisplay}
              />
            </View>

            {/* Product Rows */}
            <View style={styles.rowsContainer}>
              {rows.map((row, index) => {
                const urun = getUrunById(row.urunId);
                const rowSubtotal = getRowSubtotal(row);
                const rowKdv = getRowKdv(row);
                return (
                  <View
                    key={row.id}
                    style={[
                      styles.rowCard,
                      urun && styles.rowCardFilled,
                    ]}
                  >
                    {/* Row header: number + delete */}
                    <View style={styles.rowHeader}>
                      <View style={styles.rowNumberBadge}>
                        <Text style={styles.rowNumberText}>{index + 1}</Text>
                      </View>
                      {rows.length > 1 && (
                        <TouchableOpacity
                          style={styles.deleteBtn}
                          onPress={() => removeRow(row.id)}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Trash2 size={15} color={colors.error} />
                        </TouchableOpacity>
                      )}
                    </View>

                    {/* Product Selector */}
                    <TouchableOpacity
                      style={[styles.productSelector, urun && styles.productSelectorFilled]}
                      onPress={() => openProductPicker(row.id)}
                    >
                      {urun ? (
                        <View style={styles.selectedProduct}>
                          <View style={styles.productIconSmall}>
                            <Package size={14} color={colors.primary} />
                          </View>
                          <View style={styles.productNameWrap}>
                            <Text style={styles.productNameText} numberOfLines={1}>
                              {urun.ad}
                            </Text>
                            <Text style={styles.productStockText}>
                              {t('products:stock.currentStock')}: {urun.miktar} {getBirimLabel(urun.birim)}
                            </Text>
                          </View>
                        </View>
                      ) : (
                        <View style={styles.placeholderRow}>
                          <Package size={16} color={colors.textMuted} />
                          <Text style={styles.placeholderText}>
                            {t('products:bulk.selectProduct')}
                          </Text>
                        </View>
                      )}
                      <ChevronDown size={16} color={colors.textMuted} />
                    </TouchableOpacity>

                    {/* Miktar & Fiyat inputs */}
                    <View style={styles.inputsRow}>
                      <View style={styles.inputGroup}>
                        <Text style={styles.inputLabel}>{t('products:stock.quantity')}</Text>
                        <View style={styles.inputBox}>
                          <TextInput
                            style={styles.input}
                            value={row.miktar}
                            onChangeText={(val) => updateRow(row.id, 'miktar', val)}
                            placeholder="0"
                            placeholderTextColor={colors.textMuted}
                            keyboardType="decimal-pad"
                          />
                          {urun && (
                            <Text style={styles.inputUnit}>
                              {getBirimLabel(urun.birim)}
                            </Text>
                          )}
                        </View>
                      </View>
                      <View style={styles.inputGroup}>
                        <Text style={styles.inputLabel}>{t('products:stock.unitPrice')}</Text>
                        <View style={styles.inputBox}>
                          <TextInput
                            style={styles.input}
                            value={row.birimFiyat}
                            onChangeText={(val) => updateRow(row.id, 'birimFiyat', val)}
                            placeholder="0"
                            placeholderTextColor={colors.textMuted}
                            keyboardType="decimal-pad"
                          />
                          <Text style={styles.inputUnit}>
                            {getCurrencySymbol(currency)}
                          </Text>
                        </View>
                      </View>
                    </View>

                    {/* Per-row KDV chips (only when cari linked) */}
                    {cariLinkEnabled && (
                      <View style={styles.kdvRow}>
                        <Text style={styles.kdvLabel}>{t('common:currency.vat')}:</Text>
                        {KDV_ORANLARI.map((rate) => (
                          <TouchableOpacity
                            key={rate}
                            style={[
                              styles.kdvChip,
                              row.kdvOrani === rate && styles.kdvChipActive,
                            ]}
                            onPress={() => updateRow(row.id, 'kdvOrani', rate)}
                          >
                            <Text
                              style={[
                                styles.kdvChipText,
                                row.kdvOrani === rate && styles.kdvChipTextActive,
                              ]}
                            >
                              %{rate}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}

                    {/* Row total */}
                    {rowSubtotal > 0 && (
                      <View style={styles.rowTotalRow}>
                        {cariLinkEnabled && rowKdv > 0 ? (
                          <Text style={styles.rowTotalLabel}>
                            {formatCurrency(rowSubtotal)} + {formatCurrency(rowKdv)} {t('common:currency.vat')} =
                          </Text>
                        ) : (
                          <Text style={styles.rowTotalLabel}>{t('common:total')}:</Text>
                        )}
                        <Text style={styles.rowTotalAmount}>
                          {formatCurrency(rowSubtotal + rowKdv)}
                        </Text>
                      </View>
                    )}
                  </View>
                );
              })}

              {/* Add Row Button */}
              <TouchableOpacity style={styles.addRowButton} onPress={addRow}>
                <Plus size={18} color={colors.primary} />
                <Text style={styles.addRowText}>{t('products:bulk.addRow')}</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>

          {/* Footer */}
          <View style={styles.footer}>
            <View style={styles.footerLeft}>
              <Text style={styles.footerCount}>
                {validRows.length} {t('products:title').toLowerCase()}
              </Text>
              {totalAmount > 0 && (
                <Text style={styles.footerAmount}>{formatCurrency(totalAmount)}</Text>
              )}
            </View>
            <Button
              variant="primary"
              size="lg"
              loading={isSaving}
              onPress={handleSave}
              disabled={validRows.length === 0}
              style={styles.saveButton}
            >
              {t('common:buttons.save')}
            </Button>
          </View>
        </KeyboardAvoidingView>

        {/* Date Picker Modal */}
        {showDatePicker && (
          <Modal visible transparent animationType="fade">
            <TouchableWithoutFeedback onPress={() => setShowDatePicker(false)}>
              <View style={styles.backdrop}>
                <TouchableWithoutFeedback onPress={() => {}}>
                  <View style={styles.pickerSheet}>
                    <Text style={styles.pickerTitle}>{t('common:date.date')}</Text>
                    <DateTimePickerRN
                      value={date}
                      mode="date"
                      display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                      onChange={(event, selectedDate) => {
                        if (Platform.OS === 'android') {
                          setShowDatePicker(false);
                          if (event.type === 'set' && selectedDate) {
                            setDate(selectedDate);
                          }
                        } else if (selectedDate) {
                          setDate(selectedDate);
                        }
                      }}
                      locale={locale}
                      textColor={colors.text}
                      themeVariant="light"
                      style={{ height: 150 }}
                    />
                    <TouchableOpacity
                      style={styles.pickerDone}
                      onPress={() => setShowDatePicker(false)}
                    >
                      <Text style={styles.pickerDoneText}>{t('common:buttons.done')}</Text>
                    </TouchableOpacity>
                  </View>
                </TouchableWithoutFeedback>
              </View>
            </TouchableWithoutFeedback>
          </Modal>
        )}

        {/* Product Picker Modal */}
        {productPickerVisible && (
          <Modal visible transparent animationType="slide">
            <View style={styles.pickerModal}>
              {/* Header */}
              <View style={styles.pickerHeader}>
                <Text style={styles.pickerHeaderTitle}>{t('products:bulk.selectProduct')}</Text>
                <TouchableOpacity
                  onPress={() => setProductPickerVisible(false)}
                  style={styles.pickerClose}
                >
                  <X size={20} color={colors.text} />
                </TouchableOpacity>
              </View>

              {/* Search */}
              <View style={styles.searchBar}>
                <Search size={18} color={colors.textMuted} />
                <TextInput
                  style={styles.searchInput}
                  value={productSearch}
                  onChangeText={setProductSearch}
                  placeholder={t('common:search.searchPlaceholder')}
                  placeholderTextColor={colors.textMuted}
                  autoFocus
                />
                {productSearch.length > 0 && (
                  <TouchableOpacity onPress={() => setProductSearch('')}>
                    <X size={16} color={colors.textMuted} />
                  </TouchableOpacity>
                )}
              </View>

              {/* Product list */}
              <ScrollView style={styles.flex} keyboardShouldPersistTaps="handled">
                {filteredUrunler?.map(urun => {
                  const isSelected = selectedProductIds.has(urun.id);
                  return (
                    <TouchableOpacity
                      key={urun.id}
                      style={[styles.pickerItem, isSelected && styles.pickerItemSelected]}
                      onPress={() => selectProduct(urun.id)}
                    >
                      <View style={styles.pickerItemIcon}>
                        <Package size={18} color={colors.primary} />
                      </View>
                      <View style={styles.pickerItemInfo}>
                        <Text style={styles.pickerItemName}>{urun.ad}</Text>
                        <View style={styles.pickerItemMeta}>
                          {urun.kod && (
                            <View style={styles.codePill}>
                              <Text style={styles.codePillText}>{urun.kod}</Text>
                            </View>
                          )}
                          <Text style={styles.pickerItemStock}>
                            {urun.miktar} {getBirimLabel(urun.birim)}
                          </Text>
                          {urun.alis_fiyati > 0 && (
                            <Text style={styles.pickerItemPrice}>
                              {formatCurrency(urun.alis_fiyati)}
                            </Text>
                          )}
                          {urun.kdv_orani > 0 && (
                            <View style={styles.kdvPill}>
                              <Text style={styles.kdvPillText}>%{urun.kdv_orani}</Text>
                            </View>
                          )}
                        </View>
                      </View>
                      {isSelected && (
                        <View style={styles.checkBadge}>
                          <Check size={14} color={colors.white} />
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
                {filteredUrunler?.length === 0 && (
                  <View style={styles.emptyPicker}>
                    <Text style={styles.emptyPickerText}>
                      {t('common:search.noResults')}
                    </Text>
                  </View>
                )}
              </ScrollView>
            </View>
          </Modal>
        )}
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: spacing.xl,
  },
  // Date row
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  dateLabel: {
    flex: 1,
    fontWeight: '500',
  },
  section: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  // Rows
  rowsContainer: {
    paddingHorizontal: spacing.lg,
    gap: 10,
  },
  rowCard: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 14,
    borderLeftWidth: 3,
    borderLeftColor: 'transparent',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  rowCardFilled: {
    borderLeftColor: colors.primary,
  },
  rowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  rowNumberBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowNumberText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.primary,
  },
  deleteBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.errorLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Product selector
  productSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.background,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  productSelectorFilled: {
    borderColor: colors.primaryLight,
    backgroundColor: colors.primaryLight + '30',
  },
  selectedProduct: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  productIconSmall: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  productNameWrap: {
    flex: 1,
  },
  productNameText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  productStockText: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 1,
  },
  placeholderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  placeholderText: {
    fontSize: 14,
    color: colors.textMuted,
  },
  // Inputs
  inputsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  inputGroup: {
    flex: 1,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: colors.textSecondary,
    marginBottom: 4,
  },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 10,
  },
  input: {
    flex: 1,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
  },
  inputUnit: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '500',
    marginLeft: 4,
  },
  // KDV row (per-row)
  kdvRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
  },
  kdvLabel: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: '600',
    marginRight: 2,
  },
  kdvChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: colors.background,
  },
  kdvChipActive: {
    backgroundColor: colors.primaryLight,
  },
  kdvChipText: {
    fontSize: 11,
    fontWeight: '500',
    color: colors.textMuted,
  },
  kdvChipTextActive: {
    color: colors.primary,
    fontWeight: '700',
  },
  // Row total
  rowTotalRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    gap: 6,
  },
  rowTotalLabel: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  rowTotalAmount: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.primary,
  },
  // Add row button
  addRowButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderStyle: 'dashed',
    backgroundColor: colors.primaryLight + '40',
  },
  addRowText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
  },
  // Footer
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
    gap: spacing.md,
  },
  footerLeft: {
    flex: 1,
  },
  footerCount: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  footerAmount: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.income,
    marginTop: 2,
  },
  saveButton: {
    minWidth: 120,
  },
  // Backdrop / Date picker
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pickerSheet: {
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: 20,
    marginHorizontal: 20,
    width: '90%',
    maxWidth: 360,
  },
  pickerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
    marginBottom: 12,
  },
  pickerDone: {
    marginTop: 14,
    backgroundColor: colors.primary,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  pickerDoneText: {
    color: colors.white,
    fontSize: 15,
    fontWeight: '600',
  },
  // Product Picker Modal
  pickerModal: {
    flex: 1,
    backgroundColor: colors.surface,
    marginTop: Platform.OS === 'ios' ? 56 : 0,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  pickerHeaderTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.text,
  },
  pickerClose: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: spacing.lg,
    marginVertical: 10,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 10 : 6,
    backgroundColor: colors.background,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: colors.text,
  },
  // Picker items
  pickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  pickerItemSelected: {
    backgroundColor: colors.primaryLight + '40',
  },
  pickerItemIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerItemInfo: {
    flex: 1,
  },
  pickerItemName: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.text,
  },
  pickerItemMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 3,
    flexWrap: 'wrap',
  },
  codePill: {
    backgroundColor: colors.background,
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  codePillText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.textMuted,
  },
  pickerItemStock: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  pickerItemPrice: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: '600',
  },
  kdvPill: {
    backgroundColor: colors.primaryLight,
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  kdvPillText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.primary,
  },
  checkBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyPicker: {
    padding: 40,
    alignItems: 'center',
  },
  emptyPickerText: {
    fontSize: 14,
    color: colors.textMuted,
  },
});
