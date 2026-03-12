import { useState, useMemo } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import DateTimePickerRN from '@react-native-community/datetimepicker';
import { Plus, Trash2, Calendar, ChevronDown, Package, Search } from 'lucide-react-native';
import { Text, Button, Card } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { useUrunler } from '@/hooks/useUrunler';
import { useCreateUrunHareket, useCreateBulkUrunHareketWithCari } from '@/hooks/useUrunHareketler';
import { useDateFormat } from '@/hooks/useDateFormat';
import { isToday } from '@/lib/date';
import { formatCurrency, parseCurrency } from '@/lib/currency';
import { getCurrencySymbol } from '@/constants/currencies';
import { useSettings } from '@/hooks/useSettings';
import { Urun, BirimType, KdvOrani } from '@/types/database';
import { toErrorMessage } from '@/lib/errors';
import { CariLinkSection } from '@/components/urun/QuickUrunBar/CariLinkSection';

interface StockRow {
  id: string;
  urunId: string | null;
  miktar: string;
  birimFiyat: string;
}

export default function TopluGirisPage() {
  const router = useRouter();
  const { t } = useTranslation(['products', 'common', 'transactions']);
  const { currency } = useSettings();
  const createUrunHareket = useCreateUrunHareket();
  const createBulkWithCari = useCreateBulkUrunHareketWithCari();
  const { locale, formatDateMedium } = useDateFormat();

  const [date, setDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [rows, setRows] = useState<StockRow[]>([
    { id: '1', urunId: null, miktar: '', birimFiyat: '' },
  ]);
  const [isSaving, setIsSaving] = useState(false);
  const [productPickerVisible, setProductPickerVisible] = useState(false);
  const [activeRowId, setActiveRowId] = useState<string | null>(null);
  const [productSearch, setProductSearch] = useState('');

  // Cari link state
  const [cariLinkEnabled, setCariLinkEnabled] = useState(false);
  const [selectedCariId, setSelectedCariId] = useState<string | null>(null);
  const [kdvOrani, setKdvOrani] = useState<KdvOrani>(0);

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

  const addRow = () => {
    const newId = Date.now().toString();
    setRows([...rows, { id: newId, urunId: null, miktar: '', birimFiyat: '' }]);
  };

  const removeRow = (id: string) => {
    if (rows.length > 1) {
      setRows(rows.filter(r => r.id !== id));
    }
  };

  const updateRow = (id: string, field: keyof StockRow, value: string) => {
    setRows(rows.map(r => r.id === id ? { ...r, [field]: value } : r));
  };

  const openProductPicker = (rowId: string) => {
    setActiveRowId(rowId);
    setProductSearch('');
    setProductPickerVisible(true);
  };

  const selectProduct = (urunId: string) => {
    if (activeRowId) {
      updateRow(activeRowId, 'urunId', urunId);
    }
    setProductPickerVisible(false);
    setActiveRowId(null);
    setProductSearch('');
  };

  // Valid rows count
  const validRows = useMemo(() => {
    return rows.filter(r => r.urunId && parseCurrency(r.miktar) > 0);
  }, [rows]);

  // Total amount
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

  // Cari totals for display
  const cariTotals = useMemo(() => {
    if (!cariLinkEnabled || totalAmount === 0) return null;
    const kdvAmount = totalAmount * (kdvOrani / 100);
    const grandTotal = totalAmount + kdvAmount;
    return {
      totalDisplay: formatCurrency(grandTotal),
      kdvDisplay: kdvAmount > 0 ? formatCurrency(kdvAmount) : undefined,
    };
  }, [cariLinkEnabled, totalAmount, kdvOrani]);

  const handleSave = async () => {
    if (validRows.length === 0) {
      Alert.alert(t('common:status.error'), t('transactions:dailyCash.noEntries'));
      return;
    }

    setIsSaving(true);

    try {
      if (cariLinkEnabled && selectedCariId) {
        // Bulk save with cari linkage (single islem + multiple urun_hareket)
        const items = validRows.map(row => {
          const urun = getUrunById(row.urunId);
          return {
            urun_id: row.urunId!,
            urun_ad: urun?.ad || '',
            miktar: parseCurrency(row.miktar),
            birim_fiyat: parseCurrency(row.birimFiyat) || 0,
            kdv_orani: kdvOrani,
          };
        });

        await createBulkWithCari.mutateAsync({
          hareket_tipi: 'giris',
          items,
          cari_id: selectedCariId,
          date: date.toISOString().split('T')[0],
        });
      } else {
        // Standard save without cari
        const promises = validRows.map(row =>
          createUrunHareket.mutateAsync({
            urun_id: row.urunId!,
            hareket_tipi: 'giris',
            miktar: parseCurrency(row.miktar),
            birim_fiyat: parseCurrency(row.birimFiyat) || null,
            aciklama: null,
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
          style={styles.keyboardView}
        >
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Date Picker */}
            <View style={styles.section}>
              <Text variant="label" color="secondary" style={styles.label}>
                {t('transactions:form.date')}
              </Text>
              <TouchableOpacity
                style={styles.dateButton}
                onPress={() => setShowDatePicker(true)}
              >
                <Calendar size={20} color={colors.textMuted} />
                <Text variant="body" style={styles.dateText}>
                  {isToday(date) ? t('common:date.today') : formatDateMedium(date)}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Cari Link Section */}
            <View style={styles.section}>
              <CariLinkSection
                enabled={cariLinkEnabled}
                onToggle={setCariLinkEnabled}
                selectedCariId={selectedCariId}
                onSelectCari={setSelectedCariId}
                kdvOrani={kdvOrani}
                onKdvChange={setKdvOrani}
                hareketTipi="giris"
                totalDisplay={cariTotals?.totalDisplay}
                kdvDisplay={cariTotals?.kdvDisplay}
              />
            </View>

            {/* Rows */}
            <View style={styles.rowsContainer}>
              {rows.map((row, index) => {
                const urun = getUrunById(row.urunId);
                return (
                  <Card key={row.id} style={styles.rowCard}>
                    <View style={styles.rowHeader}>
                      <Text variant="caption" color="secondary">#{index + 1}</Text>
                      {rows.length > 1 && (
                        <TouchableOpacity onPress={() => removeRow(row.id)}>
                          <Trash2 size={18} color={colors.error} />
                        </TouchableOpacity>
                      )}
                    </View>

                    {/* Product Selector */}
                    <TouchableOpacity
                      style={styles.productSelector}
                      onPress={() => openProductPicker(row.id)}
                    >
                      {urun ? (
                        <View style={styles.selectedProduct}>
                          <Package size={16} color={colors.primary} />
                          <Text variant="body" numberOfLines={1} style={styles.productName}>
                            {urun.ad}
                          </Text>
                          <Text variant="caption" color="secondary">
                            {urun.miktar} {getBirimLabel(urun.birim)}
                          </Text>
                        </View>
                      ) : (
                        <Text variant="body" color="muted">
                          {t('products:bulk.selectProduct')}
                        </Text>
                      )}
                      <ChevronDown size={20} color={colors.textMuted} />
                    </TouchableOpacity>

                    {/* Miktar & Fiyat Row */}
                    <View style={styles.inputsRow}>
                      <View style={styles.inputGroup}>
                        <Text variant="caption" color="secondary">{t('products:stock.quantity')}</Text>
                        <View style={styles.inputWithUnit}>
                          <TextInput
                            style={styles.compactInput}
                            value={row.miktar}
                            onChangeText={(val) => updateRow(row.id, 'miktar', val)}
                            placeholder="0"
                            placeholderTextColor={colors.textMuted}
                            keyboardType="decimal-pad"
                          />
                          {urun && (
                            <Text variant="caption" color="secondary" style={styles.unitText}>
                              {getBirimLabel(urun.birim)}
                            </Text>
                          )}
                        </View>
                      </View>
                      <View style={styles.inputGroup}>
                        <Text variant="caption" color="secondary">{t('products:stock.unitPrice')}</Text>
                        <View style={styles.inputWithUnit}>
                          <TextInput
                            style={styles.compactInput}
                            value={row.birimFiyat}
                            onChangeText={(val) => updateRow(row.id, 'birimFiyat', val)}
                            placeholder="0"
                            placeholderTextColor={colors.textMuted}
                            keyboardType="decimal-pad"
                          />
                          <Text variant="caption" color="secondary" style={styles.unitText}>
                            {getCurrencySymbol(currency)}
                          </Text>
                        </View>
                      </View>
                    </View>
                  </Card>
                );
              })}

              {/* Add Row Button */}
              <TouchableOpacity style={styles.addRowButton} onPress={addRow}>
                <Plus size={20} color={colors.primary} />
                <Text variant="body" color="primary">{t('products:bulk.addRow')}</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>

          {/* Footer */}
          <View style={styles.footer}>
            <View style={styles.summary}>
              <Text variant="caption" color="secondary">
                {validRows.length} {t('products:title').toLowerCase()}
              </Text>
              {totalAmount > 0 && (
                <Text variant="h3" color="success">
                  {formatCurrency(totalAmount)}
                </Text>
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
              <View style={styles.pickerBackdrop}>
                <TouchableWithoutFeedback onPress={() => {}}>
                  <View style={styles.pickerContainer}>
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
                      style={styles.datePickerStyle}
                    />
                    <TouchableOpacity
                      style={styles.pickerDoneButton}
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
            <View style={styles.productPickerContainer}>
              <View style={styles.productPickerHeader}>
                <Text variant="h3">{t('products:bulk.selectProduct')}</Text>
                <TouchableOpacity onPress={() => setProductPickerVisible(false)}>
                  <Text variant="body" color="primary">{t('common:buttons.close')}</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.productSearchContainer}>
                <Search size={20} color={colors.textMuted} />
                <TextInput
                  style={styles.productSearchInput}
                  value={productSearch}
                  onChangeText={setProductSearch}
                  placeholder={t('common:search.searchPlaceholder')}
                  placeholderTextColor={colors.textMuted}
                  autoFocus
                />
              </View>
              <ScrollView style={styles.productList} keyboardShouldPersistTaps="handled">
                {filteredUrunler?.map(urun => (
                  <TouchableOpacity
                    key={urun.id}
                    style={styles.productItem}
                    onPress={() => selectProduct(urun.id)}
                  >
                    <View style={styles.productIcon}>
                      <Package size={20} color={colors.primary} />
                    </View>
                    <View style={styles.productInfo}>
                      <Text variant="body">{urun.ad}</Text>
                      <Text variant="caption" color="secondary">
                        {t('products:stock.currentStock')}: {urun.miktar} {getBirimLabel(urun.birim)}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}
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
  keyboardView: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: spacing.lg,
  },
  section: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  label: {
    marginBottom: spacing.sm,
  },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  dateText: {
    flex: 1,
  },
  rowsContainer: {
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  rowCard: {
    padding: spacing.md,
  },
  rowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  productSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  selectedProduct: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  productName: {
    flex: 1,
  },
  inputsRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  inputGroup: {
    flex: 1,
  },
  inputWithUnit: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.sm,
    marginTop: spacing.xs,
  },
  compactInput: {
    flex: 1,
    paddingVertical: spacing.sm,
    fontSize: 16,
    color: colors.text,
    textAlign: 'center',
  },
  unitText: {
    marginLeft: spacing.xs,
  },
  addRowButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.primary,
    borderStyle: 'dashed',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
    gap: spacing.lg,
  },
  summary: {
    flex: 1,
  },
  saveButton: {
    minWidth: 120,
  },
  // Date Picker Modal
  pickerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pickerContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    marginHorizontal: 20,
  },
  pickerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
    marginBottom: 16,
  },
  datePickerStyle: {
    height: 150,
  },
  pickerDoneButton: {
    marginTop: 16,
    backgroundColor: colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 10,
    alignItems: 'center',
  },
  pickerDoneText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  // Product Picker Modal
  productPickerContainer: {
    flex: 1,
    backgroundColor: colors.background,
    marginTop: 50,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  productPickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  productSearchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginVertical: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  productSearchInput: {
    flex: 1,
    fontSize: 16,
    color: colors.text,
    paddingVertical: spacing.sm,
  },
  productList: {
    flex: 1,
  },
  productItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  productIcon: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  productInfo: {
    flex: 1,
  },
});
