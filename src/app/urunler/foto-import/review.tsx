import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { CheckCircle, AlertTriangle, Search, Package, Building2, Truck, Users } from 'lucide-react-native';
import { Text, Button, Card, DateTimePicker } from '@/components/ui';
import {
  OcrReviewItem,
  OcrNewProductModal,
} from '@/components/ocrImport';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { useFotoImportContext } from '@/contexts/FotoImportContext';
import { Kategori } from '@/types/database';
import { formatCurrency } from '@/lib/currency';

export default function FotoImportReviewPage() {
  const { t } = useTranslation(['ocrImport', 'common', 'products']);
  const ctx = useFotoImportContext();

  const {
    selectedInvoice,
    currentEntry,
    matchedCari,
    enteredTotal,
    totalMismatch,
    entries,
    saveMode,
    setSaveMode,
    selectedIndex,
    setEntries,
    invoiceDate,
    handleInvoiceDateChange,
    handleItemUpdate,
    handleItemRemove,
    handleChangeProduct,
    handleBuy,
    handleSell,
    isSaving,
    getUrunById,
    getMatchedKategoriName,
    newProductModalVisible,
    setNewProductModalVisible,
    handleConfirmNewProducts,
    handleSkipNewProducts,
    productPickerVisible,
    setProductPickerVisible,
    productSearch,
    setProductSearch,
    filteredUrunler,
    handleSelectProduct,
    cariPickerVisible,
    setCariPickerVisible,
    cariSearch,
    setCariSearch,
    filteredCariler,
    handleSelectCari,
    kategoriler,
  } = ctx;

  if (!selectedInvoice) return null;

  return (
    <>
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <ScrollView
          style={styles.reviewScroll}
          contentContainerStyle={styles.reviewContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Cari + Date info */}
          <Card style={styles.supplierCard}>
            {/* Cari */}
            <View style={styles.supplierRow}>
              <Building2 size={18} color={colors.textSecondary} />
              <View style={styles.supplierInfo}>
                <Text variant="label" style={styles.cariLabel}>{t('ocrImport:review.cari')}</Text>
                {matchedCari ? (
                  <Text variant="body" style={styles.cariName}>{matchedCari.name}</Text>
                ) : selectedInvoice.supplierName ? (
                  <Text variant="body" style={styles.cariName}>{selectedInvoice.supplierName}</Text>
                ) : (
                  <Text variant="body" color="muted">{t('ocrImport:review.noCari')}</Text>
                )}
                {selectedInvoice.supplierTaxNumber && (
                  <Text variant="caption" color="secondary">VKN: {selectedInvoice.supplierTaxNumber}</Text>
                )}
                {matchedCari && (
                  <Text variant="caption" color="success">{t('ocrImport:review.matchedCari')}</Text>
                )}
              </View>
              <TouchableOpacity
                style={styles.selectCariButton}
                onPress={() => { setCariSearch(''); setCariPickerVisible(true); }}
              >
                <Text variant="body" color="primary" style={styles.selectCariButtonText}>
                  {matchedCari ? t('ocrImport:review.changeCari') : t('ocrImport:review.selectCari')}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Date */}
            <View style={styles.dateRow}>
              <DateTimePicker
                label={t('ocrImport:review.invoiceDate')}
                value={invoiceDate}
                onChange={handleInvoiceDateChange}
                mode="date"
              />
            </View>
          </Card>

          {/* Items */}
          <Text variant="label" color="secondary" style={styles.sectionLabel}>
            {t('ocrImport:review.items')} ({selectedInvoice.items.length})
          </Text>
          <View style={styles.itemsList}>
            {selectedInvoice.items.map((item, index) => (
              <OcrReviewItem
                key={item.id}
                item={item}
                index={index}
                onUpdate={handleItemUpdate}
                onRemove={handleItemRemove}
                onChangeProduct={handleChangeProduct}
                matchedProduct={getUrunById(item.matchedUrunId)}
                matchedKategoriName={getMatchedKategoriName(item)}
              />
            ))}
          </View>

          {/* Total check */}
          <Card style={[styles.totalCard, totalMismatch ? styles.totalCardWarning : styles.totalCardOk]}>
            <Text variant="label" color="secondary">{t('ocrImport:review.totalCheck')}</Text>
            <View style={styles.totalRow}>
              <View>
                <Text variant="caption" color="secondary">{t('ocrImport:review.ocrTotal')}</Text>
                <Text variant="body" style={styles.totalAmount}>
                  {selectedInvoice.grandTotal ? formatCurrency(selectedInvoice.grandTotal) : '\u2014'}
                </Text>
              </View>
              <View>
                <Text variant="caption" color="secondary">{t('ocrImport:review.enteredTotal')}</Text>
                <Text variant="body" style={styles.totalAmount}>
                  {formatCurrency(enteredTotal)}
                </Text>
              </View>
              {totalMismatch ? (
                <AlertTriangle size={20} color={colors.warning} />
              ) : (
                <CheckCircle size={20} color={colors.success} />
              )}
            </View>
            {totalMismatch && (
              <Text variant="caption" color="warning">{t('ocrImport:review.totalMismatch')}</Text>
            )}
          </Card>

          {/* Save mode */}
          <Card style={styles.saveModeCard}>
            <Text variant="label" color="secondary">{t('ocrImport:review.saveMode')}</Text>
            <View style={styles.saveModeOptions}>
              <TouchableOpacity
                style={[
                  styles.saveModeOption,
                  saveMode === 'products_and_movements' && styles.saveModeOptionActive,
                ]}
                onPress={() => {
                  setSaveMode('products_and_movements');
                  if (selectedIndex !== null) {
                    setEntries(prev => {
                      const ne = [...prev];
                      ne[selectedIndex] = { ...ne[selectedIndex], saveMode: 'products_and_movements' };
                      return ne;
                    });
                  }
                }}
              >
                <Text
                  variant="body"
                  color={saveMode === 'products_and_movements' ? 'primary' : 'secondary'}
                >
                  {t('ocrImport:review.productsAndMovements')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.saveModeOption,
                  saveMode === 'only_products' && styles.saveModeOptionActive,
                ]}
                onPress={() => {
                  setSaveMode('only_products');
                  if (selectedIndex !== null) {
                    setEntries(prev => {
                      const ne = [...prev];
                      ne[selectedIndex] = { ...ne[selectedIndex], saveMode: 'only_products' };
                      return ne;
                    });
                  }
                }}
              >
                <Text
                  variant="body"
                  color={saveMode === 'only_products' ? 'primary' : 'secondary'}
                >
                  {t('ocrImport:review.onlyProducts')}
                </Text>
              </TouchableOpacity>
            </View>
          </Card>
        </ScrollView>

        {/* Footer with AL / SAT buttons */}
        <View style={styles.footer}>
          <View style={styles.footerInfo}>
            <Text variant="caption" color="secondary">
              {selectedInvoice.items.length} {t('ocrImport:review.items').toLowerCase()}
            </Text>
            <Text variant="h3" color="success">
              {formatCurrency(enteredTotal)}
            </Text>
          </View>
          <View style={styles.footerButtons}>
            <Button
              variant="primary"
              size="lg"
              loading={isSaving}
              onPress={handleBuy}
              disabled={selectedInvoice.items.length === 0 || (currentEntry?.isSaved ?? false)}
              style={styles.buyButton}
            >
              {t('ocrImport:review.buyButton')}
            </Button>
            <Button
              variant="danger"
              size="lg"
              loading={isSaving}
              onPress={handleSell}
              disabled={selectedInvoice.items.length === 0 || (currentEntry?.isSaved ?? false)}
              style={styles.sellButton}
            >
              {t('ocrImport:review.sellButton')}
            </Button>
          </View>
        </View>
      </SafeAreaView>

      {/* New product modal */}
      <OcrNewProductModal
        visible={newProductModalVisible}
        items={selectedInvoice?.items.filter(i => i.matchTier === 'new' && !i.isNewConfirmed) || []}
        onConfirmAll={handleConfirmNewProducts}
        onSkipAll={handleSkipNewProducts}
        onClose={() => setNewProductModalVisible(false)}
      />

      {/* Product picker modal */}
      {productPickerVisible && (
        <Modal visible transparent animationType="slide">
          <View style={styles.pickerContainer}>
            <View style={styles.pickerHeader}>
              <Text variant="h3">{t('ocrImport:review.changeProduct')}</Text>
              <TouchableOpacity onPress={() => setProductPickerVisible(false)}>
                <Text variant="body" color="primary">{t('common:buttons.close')}</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.pickerSearchContainer}>
              <Search size={20} color={colors.textMuted} />
              <TextInput
                style={styles.pickerSearchInput}
                value={productSearch}
                onChangeText={setProductSearch}
                placeholder={t('common:search.searchPlaceholder')}
                placeholderTextColor={colors.textMuted}
                autoFocus
              />
            </View>
            <ScrollView style={styles.pickerList} keyboardShouldPersistTaps="handled">
              {filteredUrunler?.map(urun => (
                <TouchableOpacity
                  key={urun.id}
                  style={styles.pickerItem}
                  onPress={() => handleSelectProduct(urun.id)}
                >
                  <View style={styles.pickerIcon}>
                    <Package size={20} color={colors.primary} />
                  </View>
                  <View style={styles.pickerItemInfo}>
                    <Text variant="body">{urun.ad}</Text>
                    <Text variant="caption" color="secondary">
                      {urun.miktar} {t(`products:units.${urun.birim}`)}
                      {urun.kategori_id && kategoriler ? (() => {
                        const kat = kategoriler.find((k: Kategori) => k.id === urun.kategori_id);
                        return kat ? ` \u00B7 ${kat.name}` : '';
                      })() : ''}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </Modal>
      )}

      {/* Cari picker modal */}
      {cariPickerVisible && (
        <Modal visible transparent animationType="slide">
          <View style={styles.pickerContainer}>
            <View style={styles.pickerHeader}>
              <Text variant="h3">{t('ocrImport:review.selectCari')}</Text>
              <TouchableOpacity onPress={() => setCariPickerVisible(false)}>
                <Text variant="body" color="primary">{t('common:buttons.close')}</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.pickerSearchContainer}>
              <Search size={20} color={colors.textMuted} />
              <TextInput
                style={styles.pickerSearchInput}
                value={cariSearch}
                onChangeText={setCariSearch}
                placeholder={t('common:search.searchPlaceholder')}
                placeholderTextColor={colors.textMuted}
                autoFocus
              />
            </View>
            <ScrollView style={styles.pickerList} keyboardShouldPersistTaps="handled">
              {filteredCariler?.map(cari => (
                <TouchableOpacity
                  key={cari.id}
                  style={styles.pickerItem}
                  onPress={() => handleSelectCari(cari.id)}
                >
                  <View style={[styles.pickerIcon, { backgroundColor: cari.type === 'tedarikci' ? colors.warningLight : colors.infoLight }]}>
                    {cari.type === 'tedarikci' ? (
                      <Truck size={20} color={colors.warning} />
                    ) : (
                      <Users size={20} color={colors.info} />
                    )}
                  </View>
                  <View style={styles.pickerItemInfo}>
                    <Text variant="body">{cari.name}</Text>
                    <Text variant="caption" color="secondary">
                      {cari.tax_number ? `VKN: ${cari.tax_number}` : cari.phone || ''}
                    </Text>
                  </View>
                  {selectedInvoice?.supplierMatchCariId === cari.id && (
                    <CheckCircle size={20} color={colors.success} />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </Modal>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  reviewScroll: {
    flex: 1,
  },
  reviewContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.md,
  },
  supplierCard: {
    padding: spacing.md,
    gap: spacing.md,
  },
  supplierRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  supplierInfo: {
    flex: 1,
    gap: 2,
  },
  cariLabel: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  cariName: {
    fontSize: 16,
    fontWeight: '500',
  },
  selectCariButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  selectCariButtonText: {
    fontWeight: '600',
    fontSize: 14,
  },
  dateRow: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
  },
  sectionLabel: {
    marginTop: spacing.sm,
  },
  itemsList: {
    gap: spacing.md,
  },
  totalCard: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  totalCardOk: {
    borderLeftWidth: 3,
    borderLeftColor: colors.success,
  },
  totalCardWarning: {
    borderLeftWidth: 3,
    borderLeftColor: colors.warning,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalAmount: {
    fontWeight: '600',
    marginTop: 2,
  },
  saveModeCard: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  saveModeOptions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  saveModeOption: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  saveModeOptionActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
    gap: spacing.md,
  },
  footerInfo: {
    flex: 1,
  },
  footerButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  buyButton: {
    minWidth: 80,
  },
  sellButton: {
    minWidth: 80,
  },
  pickerContainer: {
    flex: 1,
    backgroundColor: colors.background,
    marginTop: 50,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  pickerSearchContainer: {
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
  pickerSearchInput: {
    flex: 1,
    fontSize: 16,
    color: colors.text,
    paddingVertical: spacing.sm,
  },
  pickerList: {
    flex: 1,
  },
  pickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  pickerIcon: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerItemInfo: {
    flex: 1,
  },
});
