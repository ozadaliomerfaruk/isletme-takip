import { useState, useRef, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  TextInput,
  Switch,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { CheckCircle, AlertTriangle, Search, Package, Building2, Truck, Users, Plus, Wallet, Tag, Edit3, Info } from 'lucide-react-native';
import { Text, Button, Card, DateTimePicker } from '@/components/ui';
import {
  OcrReviewItem,
  OcrNewProductModal,
} from '@/components/ocrImport';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { useFotoImportContext } from '@/contexts/FotoImportContext';
import { usePendingIrsaliyeByCari } from '@/hooks/useIrsaliyeRecords';
import { Kategori } from '@/types/database';
import { DOCUMENT_TYPE_DEFAULTS, OcrDocumentType, OcrSaveMode } from '@/types/ocrImport';
import { formatCurrency } from '@/lib/currency';

export default function FotoImportReviewPage() {
  const { t } = useTranslation(['ocrImport', 'common', 'products', 'clients']);
  const router = useRouter();
  const ctx = useFotoImportContext();

  const {
    selectedInvoice,
    currentEntry,
    matchedCari,
    selectedHesap,
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
    handleSaveWithDirection,
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
    // New Phase 1 values
    handleSelectHesap,
    hesapPickerVisible,
    setHesapPickerVisible,
    hesapSearch,
    setHesapSearch,
    filteredHesaplar,
    giderKategoriler,
    handleSelectGiderKategori,
    handleEditGrandTotal,
    saveUrunAlias,
    saveCariAlias,
  } = ctx;

  // Which sections to show based on save mode
  const showCariPicker = ['stock_and_cari', 'cari_borc_only', 'cari_odeme_tahsilat', 'irsaliye_pending'].includes(saveMode);
  const showItemsList = ['stock_and_cari', 'stock_only', 'irsaliye_pending'].includes(saveMode);
  const showTotalCheck = saveMode !== 'stock_only';
  const showHesapPicker = ['direct_gider', 'stock_and_cari', 'cari_odeme_tahsilat', 'cari_borc_only'].includes(saveMode);
  const isHesapRequired = saveMode === 'direct_gider';
  const showGiderKategori = saveMode === 'direct_gider';
  const showEditableTotal = saveMode === 'direct_gider' || saveMode === 'cari_odeme_tahsilat';

  // Document type config
  const docType = selectedInvoice?.documentType as OcrDocumentType | undefined;
  const docConfig = docType ? DOCUMENT_TYPE_DEFAULTS[docType] : null;

  // Editable total state
  const displayTotal = currentEntry?.editedGrandTotal
    ?? selectedInvoice?.grandTotal
    ?? enteredTotal;
  const [editingTotal, setEditingTotal] = useState(false);
  const [totalInput, setTotalInput] = useState('');

  // "Remember" toggle states for alias learning
  const [rememberProduct, setRememberProduct] = useState(true);
  const [rememberCari, setRememberCari] = useState(true);

  // Track the last product picker selection for alias saving
  const lastProductPickerOcrName = useRef<string>('');

  // Pending irsaliye query for double-stock protection
  const cariIdForIrsaliye = selectedInvoice?.supplierMatchCariId || null;
  const { data: pendingIrsaliyeler } = usePendingIrsaliyeByCari(cariIdForIrsaliye);
  const hasPendingIrsaliye = (pendingIrsaliyeler?.length ?? 0) > 0;
  const [irsaliyeBannerDismissed, setIrsaliyeBannerDismissed] = useState(false);

  // Auto-switch to cari_borc_only when pending irsaliye detected for fatura
  const autoSwitchedRef = useRef(false);
  useEffect(() => {
    if (hasPendingIrsaliye && docType === 'fatura' && saveMode === 'stock_and_cari' && !autoSwitchedRef.current) {
      autoSwitchedRef.current = true;
      setSaveMode('cari_borc_only');
      if (selectedIndex !== null) {
        setEntries(prev => {
          const ne = [...prev];
          ne[selectedIndex] = { ...ne[selectedIndex], saveMode: 'cari_borc_only' };
          return ne;
        });
      }
    }
  }, [hasPendingIrsaliye, docType, saveMode, selectedIndex, setSaveMode, setEntries]);

  // Wrapped handleSelectProduct to also save alias
  const handleSelectProductWithAlias = (urunId: string) => {
    if (ctx.productPickerIndex !== null && selectedInvoice) {
      const ocrItem = selectedInvoice.items[ctx.productPickerIndex];
      if (ocrItem && rememberProduct) {
        const product = ctx.getUrunById(urunId);
        // Only save alias if OCR name differs from product name
        if (product && ocrItem.name.toLowerCase() !== product.ad.toLowerCase()) {
          saveUrunAlias(urunId, ocrItem.name, selectedInvoice.supplierMatchCariId);
        }
      }
    }
    handleSelectProduct(urunId);
    setRememberProduct(true); // Reset for next time
  };

  // Wrapped handleSelectCari to also save alias
  const handleSelectCariWithAlias = (cariId: string) => {
    if (selectedInvoice?.supplierName && rememberCari) {
      // Use full cariler list (not filteredCariler) to avoid search filter issues
      const cari = ctx.cariler?.find(c => c.id === cariId);
      // Only save alias if OCR name differs from cari name
      if (cari && selectedInvoice.supplierName.toLowerCase() !== cari.name.toLowerCase()) {
        saveCariAlias(cariId, selectedInvoice.supplierName);
      }
    }
    handleSelectCari(cariId);
    setRememberCari(true); // Reset for next time
  };

  if (!selectedInvoice) return null;

  return (
    <>
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <ScrollView
          style={styles.reviewScroll}
          contentContainerStyle={styles.reviewContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Document type badge */}
          {docConfig && docType && (
            <View style={[styles.docTypeBanner, { backgroundColor: docConfig.color + '12', borderColor: docConfig.color + '40' }]}>
              <View style={[styles.docTypeDot, { backgroundColor: docConfig.color }]} />
              <Text variant="body" style={{ color: docConfig.color, fontWeight: '600' }}>
                {t(`ocrImport:docType.${docType}`)}
              </Text>
              <Text variant="caption" color="secondary" style={{ marginLeft: 'auto' }}>
                {t(`ocrImport:saveMode.${saveMode}`)}
              </Text>
            </View>
          )}

          {/* 'not' document type warning */}
          {docType === 'not' && (
            <View style={styles.notWarningBanner}>
              <Info size={16} color={colors.warning} />
              <Text variant="body" style={styles.notWarningText}>
                {t('ocrImport:review.notTypeWarning')}
              </Text>
            </View>
          )}

          {/* Cari + Date info */}
          <Card style={styles.supplierCard}>
            {/* Cari - shown for modes that need it */}
            {showCariPicker && (
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
                  {matchedCari ? (
                    <View style={styles.cariStatusBadge}>
                      <CheckCircle size={12} color={colors.success} />
                      <Text variant="caption" color="success">{t('ocrImport:review.cariMatched')}</Text>
                    </View>
                  ) : selectedInvoice.supplierName ? (
                    <View style={styles.cariStatusBadge}>
                      <AlertTriangle size={12} color={colors.warning} />
                      <Text variant="caption" color="warning">{t('ocrImport:review.cariNotMatched')}</Text>
                    </View>
                  ) : null}
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
            )}

            {/* Date */}
            <View style={showCariPicker ? styles.dateRow : undefined}>
              <DateTimePicker
                label={t('ocrImport:review.invoiceDate')}
                value={invoiceDate}
                onChange={handleInvoiceDateChange}
                mode="date"
              />
            </View>
          </Card>

          {/* Cari required warning - only for modes where cari is mandatory */}
          {['cari_borc_only', 'cari_odeme_tahsilat'].includes(saveMode) && !selectedInvoice.supplierMatchCariId && (
            <View style={styles.cariWarningBanner}>
              <AlertTriangle size={16} color={colors.error} />
              <Text variant="body" color="error" style={styles.cariWarningText}>
                {t('ocrImport:review.cariRequired')}
              </Text>
            </View>
          )}

          {/* Pending irsaliye banner - double-stock protection */}
          {hasPendingIrsaliye && !irsaliyeBannerDismissed && docType === 'fatura' && saveMode !== 'irsaliye_pending' && (
            <View style={styles.irsaliyeBanner}>
              <AlertTriangle size={16} color={colors.warning} />
              <View style={styles.irsaliyeBannerContent}>
                <Text variant="body" style={styles.irsaliyeBannerText}>
                  {t('ocrImport:review.pendingIrsaliyeBanner', { count: pendingIrsaliyeler?.length ?? 0 })}
                </Text>
                <Text variant="caption" color="secondary">
                  {t('ocrImport:review.pendingIrsaliyeAutoMode')}
                </Text>
                <View style={styles.irsaliyeBannerButtons}>
                  <TouchableOpacity
                    style={styles.irsaliyeLinkButton}
                    onPress={() => {
                      // Auto-switch to cari_borc_only since stock was already entered via irsaliye
                      setSaveMode('cari_borc_only');
                      if (selectedIndex !== null) {
                        setEntries(prev => {
                          const ne = [...prev];
                          ne[selectedIndex] = { ...ne[selectedIndex], saveMode: 'cari_borc_only' };
                          return ne;
                        });
                      }
                    }}
                  >
                    <Text variant="body" color="primary" style={{ fontWeight: '600' }}>
                      {t('ocrImport:review.pendingIrsaliyeLink')}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.irsaliyeIgnoreButton}
                    onPress={() => {
                      Alert.alert(
                        t('ocrImport:review.pendingIrsaliyeDoubleWarning'),
                        undefined,
                        [
                          { text: t('common:buttons.cancel'), style: 'cancel' },
                          {
                            text: t('ocrImport:review.pendingIrsaliyeIgnore'),
                            style: 'destructive',
                            onPress: () => setIrsaliyeBannerDismissed(true),
                          },
                        ]
                      );
                    }}
                  >
                    <Text variant="caption" color="secondary">
                      {t('ocrImport:review.pendingIrsaliyeIgnore')}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}

          {/* irsaliye_pending mode description */}
          {saveMode === 'irsaliye_pending' && (
            <View style={styles.irsaliyeInfoBanner}>
              <Info size={16} color="#8b5cf6" />
              <Text variant="body" style={{ flex: 1, color: '#8b5cf6' }}>
                {t('ocrImport:review.irsaliyePendingDesc')}
              </Text>
            </View>
          )}

          {/* Hesap picker */}
          {showHesapPicker && (
            <Card style={styles.hesapCard}>
              <View style={styles.hesapRow}>
                <Wallet size={18} color={colors.textSecondary} />
                <View style={styles.hesapInfo}>
                  <Text variant="label" style={styles.cariLabel}>
                    {t('ocrImport:review.hesap')}
                    {isHesapRequired && <Text variant="caption" color="error"> *</Text>}
                  </Text>
                  {selectedHesap ? (
                    <Text variant="body" style={styles.cariName}>{selectedHesap.name}</Text>
                  ) : (
                    <Text variant="body" color="muted">{t('ocrImport:review.noHesap')}</Text>
                  )}
                </View>
                <TouchableOpacity
                  style={styles.selectCariButton}
                  onPress={() => { setHesapSearch(''); setHesapPickerVisible(true); }}
                >
                  <Text variant="body" color="primary" style={styles.selectCariButtonText}>
                    {selectedHesap ? t('ocrImport:review.changeCari') : t('ocrImport:review.selectHesap')}
                  </Text>
                </TouchableOpacity>
              </View>
              {isHesapRequired && !selectedHesap && (
                <Text variant="caption" color="error" style={{ marginTop: spacing.xs }}>
                  {t('ocrImport:review.hesapRequired')}
                </Text>
              )}
            </Card>
          )}

          {/* Gider kategori picker */}
          {showGiderKategori && giderKategoriler && giderKategoriler.length > 0 && (
            <Card style={styles.hesapCard}>
              <View style={styles.hesapRow}>
                <Tag size={18} color={colors.textSecondary} />
                <View style={styles.hesapInfo}>
                  <Text variant="label" style={styles.cariLabel}>
                    {t('ocrImport:review.giderKategori')}
                  </Text>
                  {currentEntry?.selectedKategoriId ? (
                    <Text variant="body" style={styles.cariName}>
                      {giderKategoriler.find(k => k.id === currentEntry.selectedKategoriId)?.name || '-'}
                    </Text>
                  ) : selectedInvoice.suggestedGiderCategory ? (
                    <Text variant="body" color="muted">
                      {t('ocrImport:review.suggestedCategory', { category: selectedInvoice.suggestedGiderCategory })}
                    </Text>
                  ) : (
                    <Text variant="body" color="muted">{t('ocrImport:review.noCategory')}</Text>
                  )}
                </View>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.kategoriScroll}>
                <TouchableOpacity
                  style={[
                    styles.kategoriChip,
                    !currentEntry?.selectedKategoriId && styles.kategoriChipActive,
                  ]}
                  onPress={() => handleSelectGiderKategori(null)}
                >
                  <Text variant="caption" color={!currentEntry?.selectedKategoriId ? 'primary' : 'secondary'}>
                    {t('ocrImport:review.noCategory')}
                  </Text>
                </TouchableOpacity>
                {giderKategoriler.map(kat => (
                  <TouchableOpacity
                    key={kat.id}
                    style={[
                      styles.kategoriChip,
                      currentEntry?.selectedKategoriId === kat.id && styles.kategoriChipActive,
                    ]}
                    onPress={() => handleSelectGiderKategori(kat.id)}
                  >
                    <Text variant="caption" color={currentEntry?.selectedKategoriId === kat.id ? 'primary' : 'secondary'}>
                      {kat.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </Card>
          )}

          {/* Items - only for stock modes */}
          {showItemsList && (
            <>
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
            </>
          )}

          {/* Total check / editable total */}
          {showTotalCheck && (
            <Card style={[styles.totalCard, showEditableTotal ? styles.totalCardOk : (totalMismatch ? styles.totalCardWarning : styles.totalCardOk)]}>
              <Text variant="label" color="secondary">
                {showEditableTotal ? t('ocrImport:review.cariTotal') : t('ocrImport:review.totalCheck')}
              </Text>
              {showEditableTotal ? (
                /* Editable total for direct_gider and cari_odeme_tahsilat */
                <View>
                  <View style={styles.totalRow}>
                    <View style={{ flex: 1 }}>
                      <Text variant="caption" color="secondary">{t('ocrImport:review.ocrTotal')}</Text>
                      {editingTotal ? (
                        <View style={styles.editableTotalRow}>
                          <TextInput
                            style={styles.editableTotalInput}
                            value={totalInput}
                            onChangeText={setTotalInput}
                            keyboardType="numeric"
                            autoFocus
                            placeholder="0.00"
                            placeholderTextColor={colors.textMuted}
                            onBlur={() => {
                              const val = parseFloat(totalInput.replace(',', '.'));
                              handleEditGrandTotal(isNaN(val) || val <= 0 ? null : val);
                              setEditingTotal(false);
                            }}
                            onSubmitEditing={() => {
                              const val = parseFloat(totalInput.replace(',', '.'));
                              handleEditGrandTotal(isNaN(val) || val <= 0 ? null : val);
                              setEditingTotal(false);
                            }}
                          />
                        </View>
                      ) : (
                        <TouchableOpacity
                          style={styles.editableTotalRow}
                          onPress={() => {
                            setTotalInput(displayTotal ? String(displayTotal) : '');
                            setEditingTotal(true);
                          }}
                        >
                          <Text variant="h3" style={styles.totalAmount}>
                            {displayTotal ? formatCurrency(displayTotal) : '\u2014'}
                          </Text>
                          <Edit3 size={16} color={colors.primary} />
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                  {!displayTotal && (
                    <Text variant="caption" color="warning" style={{ marginTop: spacing.xs }}>
                      {t('ocrImport:review.totalRequired')}
                    </Text>
                  )}
                </View>
              ) : (
                <>
                  <View style={styles.totalRow}>
                    <View>
                      <Text variant="caption" color="secondary">{t('ocrImport:review.ocrTotal')}</Text>
                      <Text variant="body" style={styles.totalAmount}>
                        {(() => {
                          const sub = selectedInvoice.subtotal
                            ?? (selectedInvoice.grandTotal && selectedInvoice.vatTotal
                              ? selectedInvoice.grandTotal - selectedInvoice.vatTotal
                              : selectedInvoice.grandTotal);
                          return sub ? formatCurrency(sub) : '\u2014';
                        })()}
                      </Text>
                      {selectedInvoice.grandTotal && selectedInvoice.vatTotal ? (
                        <Text variant="caption" color="secondary">
                          KDV: {formatCurrency(selectedInvoice.vatTotal)}  |  Toplam: {formatCurrency(selectedInvoice.grandTotal)}
                        </Text>
                      ) : null}
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
                </>
              )}
            </Card>
          )}

          {/* Payment info display */}
          {selectedInvoice.paymentInfo?.paymentMethod && (
            <Card style={styles.paymentInfoCard}>
              <Text variant="label" color="secondary">{t('ocrImport:review.paymentInfo')}</Text>
              <Text variant="body">
                {t(`ocrImport:review.paymentMethod.${selectedInvoice.paymentInfo.paymentMethod}`)}
                {selectedInvoice.paymentInfo.cardLastFour ? ` (****${selectedInvoice.paymentInfo.cardLastFour})` : ''}
              </Text>
              {selectedInvoice.paymentInfo.bankName && (
                <Text variant="caption" color="secondary">{selectedInvoice.paymentInfo.bankName}</Text>
              )}
            </Card>
          )}

          {/* Save mode */}
          <Card style={styles.saveModeCard}>
            <Text variant="label" color="secondary">{t('ocrImport:review.saveMode')}</Text>
            <View style={styles.saveModeOptionsVertical}>
              {([
                { key: 'stock_and_cari' as OcrSaveMode, labelKey: 'saveMode.stock_and_cari', descKey: 'saveModeDesc.stock_and_cari' },
                { key: 'stock_only' as OcrSaveMode, labelKey: 'saveMode.stock_only', descKey: 'saveModeDesc.stock_only' },
                { key: 'cari_borc_only' as OcrSaveMode, labelKey: 'saveMode.cari_borc_only', descKey: 'saveModeDesc.cari_borc_only' },
                { key: 'direct_gider' as OcrSaveMode, labelKey: 'saveMode.direct_gider', descKey: 'saveModeDesc.direct_gider' },
                { key: 'cari_odeme_tahsilat' as OcrSaveMode, labelKey: 'saveMode.cari_odeme_tahsilat', descKey: 'saveModeDesc.cari_odeme_tahsilat' },
                { key: 'irsaliye_pending' as OcrSaveMode, labelKey: 'saveMode.irsaliye_pending', descKey: 'saveModeDesc.irsaliye_pending' },
              ]).map(option => (
                <TouchableOpacity
                  key={option.key}
                  style={[
                    styles.saveModeOptionV,
                    saveMode === option.key && styles.saveModeOptionActive,
                  ]}
                  onPress={() => {
                    setSaveMode(option.key);
                    if (selectedIndex !== null) {
                      setEntries(prev => {
                        const ne = [...prev];
                        ne[selectedIndex] = { ...ne[selectedIndex], saveMode: option.key };
                        return ne;
                      });
                    }
                  }}
                >
                  <Text
                    variant="body"
                    color={saveMode === option.key ? 'primary' : 'secondary'}
                    style={styles.saveModeLabel}
                  >
                    {t(`ocrImport:${option.labelKey}`)}
                  </Text>
                  <Text variant="caption" color="muted" style={styles.saveModeDesc}>
                    {t(`ocrImport:${option.descKey}`)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </Card>
        </ScrollView>

        {/* Footer with dynamic buttons */}
        <View style={styles.footer}>
          <View style={styles.footerInfo}>
            <Text variant="caption" color="secondary">
              {t(`ocrImport:saveMode.${saveMode}`)}
            </Text>
            <Text variant="h3" color="success">
              {formatCurrency(showEditableTotal ? (displayTotal || 0) : (showItemsList ? enteredTotal : (selectedInvoice.grandTotal || enteredTotal)))}
            </Text>
          </View>
          <View style={styles.footerButtons}>
            {saveMode === 'irsaliye_pending' ? (
              /* Single STOK GİRİŞ button for irsaliye */
              <Button
                variant="primary"
                size="lg"
                loading={isSaving}
                onPress={() => handleSaveWithDirection('giris')}
                disabled={selectedInvoice.items.length === 0 || (currentEntry?.isSaved ?? false)}
                style={[styles.buyButton, { minWidth: 120, backgroundColor: '#8b5cf6' }]}
              >
                {t('ocrImport:review.irsaliyeStockButton')}
              </Button>
            ) : saveMode === 'stock_only' || saveMode === 'direct_gider' ? (
              /* Single KAYDET button */
              <Button
                variant="primary"
                size="lg"
                loading={isSaving}
                onPress={handleBuy}
                disabled={
                  (saveMode === 'direct_gider'
                    ? (!currentEntry?.selectedHesapId || !displayTotal)
                    : selectedInvoice.items.length === 0)
                  || (currentEntry?.isSaved ?? false)
                }
                style={[styles.buyButton, { minWidth: 120 }]}
              >
                {t('ocrImport:review.saveButton')}
              </Button>
            ) : saveMode === 'cari_odeme_tahsilat' ? (
              /* TAHSILAT / ODEME buttons */
              <>
                <Button
                  variant="primary"
                  size="lg"
                  loading={isSaving}
                  onPress={handleBuy}
                  disabled={!selectedInvoice.supplierMatchCariId || !displayTotal || (currentEntry?.isSaved ?? false)}
                  style={styles.buyButton}
                >
                  {t('ocrImport:review.tahsilatButton')}
                </Button>
                <Button
                  variant="danger"
                  size="lg"
                  loading={isSaving}
                  onPress={handleSell}
                  disabled={!selectedInvoice.supplierMatchCariId || !displayTotal || (currentEntry?.isSaved ?? false)}
                  style={styles.sellButton}
                >
                  {t('ocrImport:review.odemeButton')}
                </Button>
              </>
            ) : (
              /* AL / SAT buttons (stock_and_cari, cari_borc_only) */
              <>
                <Button
                  variant="primary"
                  size="lg"
                  loading={isSaving}
                  onPress={handleBuy}
                  disabled={
                    (saveMode === 'cari_borc_only'
                      ? !selectedInvoice.supplierMatchCariId
                      : selectedInvoice.items.length === 0)
                    || (currentEntry?.isSaved ?? false)
                  }
                  style={styles.buyButton}
                >
                  {t('ocrImport:review.buyButton')}
                </Button>
                <Button
                  variant="danger"
                  size="lg"
                  loading={isSaving}
                  onPress={handleSell}
                  disabled={
                    (saveMode === 'cari_borc_only'
                      ? !selectedInvoice.supplierMatchCariId
                      : selectedInvoice.items.length === 0)
                    || (currentEntry?.isSaved ?? false)
                  }
                  style={styles.sellButton}
                >
                  {t('ocrImport:review.sellButton')}
                </Button>
              </>
            )}
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
            {/* "Remember" toggle */}
            <View style={styles.rememberRow}>
              <Switch
                value={rememberProduct}
                onValueChange={setRememberProduct}
                trackColor={{ false: colors.border, true: colors.primary + '60' }}
                thumbColor={rememberProduct ? colors.primary : colors.textMuted}
              />
              <Text variant="caption" color="secondary">{t('ocrImport:review.rememberAlias')}</Text>
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
                  onPress={() => handleSelectProductWithAlias(urun.id)}
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
            {/* "Remember" toggle */}
            <View style={styles.rememberRow}>
              <Switch
                value={rememberCari}
                onValueChange={setRememberCari}
                trackColor={{ false: colors.border, true: colors.primary + '60' }}
                thumbColor={rememberCari ? colors.primary : colors.textMuted}
              />
              <Text variant="caption" color="secondary">{t('ocrImport:review.rememberAlias')}</Text>
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
              {/* Add new cari button */}
              <TouchableOpacity
                style={styles.addNewCariButton}
                onPress={() => {
                  setCariPickerVisible(false);
                  router.push('/cariler/ekle');
                }}
              >
                <View style={[styles.pickerIcon, { backgroundColor: colors.successLight }]}>
                  <Plus size={20} color={colors.success} />
                </View>
                <Text variant="body" color="success" style={{ fontWeight: '600' }}>
                  {t('ocrImport:review.addNewCari')}
                </Text>
              </TouchableOpacity>
              {filteredCariler?.map(cari => (
                <TouchableOpacity
                  key={cari.id}
                  style={styles.pickerItem}
                  onPress={() => handleSelectCariWithAlias(cari.id)}
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
      {/* Hesap picker modal */}
      {hesapPickerVisible && (
        <Modal visible transparent animationType="slide">
          <View style={styles.pickerContainer}>
            <View style={styles.pickerHeader}>
              <Text variant="h3">{t('ocrImport:review.selectHesap')}</Text>
              <TouchableOpacity onPress={() => setHesapPickerVisible(false)}>
                <Text variant="body" color="primary">{t('common:buttons.close')}</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.pickerSearchContainer}>
              <Search size={20} color={colors.textMuted} />
              <TextInput
                style={styles.pickerSearchInput}
                value={hesapSearch}
                onChangeText={setHesapSearch}
                placeholder={t('common:search.searchPlaceholder')}
                placeholderTextColor={colors.textMuted}
                autoFocus
              />
            </View>
            <ScrollView style={styles.pickerList} keyboardShouldPersistTaps="handled">
              {filteredHesaplar?.map(hesap => (
                <TouchableOpacity
                  key={hesap.id}
                  style={styles.pickerItem}
                  onPress={() => handleSelectHesap(hesap.id)}
                >
                  <View style={[styles.pickerIcon, { backgroundColor: colors.infoLight }]}>
                    <Wallet size={20} color={colors.info} />
                  </View>
                  <View style={styles.pickerItemInfo}>
                    <Text variant="body">{hesap.name}</Text>
                    <Text variant="caption" color="secondary">
                      {formatCurrency(hesap.balance)}
                    </Text>
                  </View>
                  {currentEntry?.selectedHesapId === hesap.id && (
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
  saveModeOptionsVertical: {
    gap: spacing.xs,
  },
  saveModeOptionV: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  saveModeOptionActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  saveModeLabel: {
    fontWeight: '500',
  },
  saveModeDesc: {
    marginTop: 2,
    lineHeight: 16,
  },
  cariWarningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.errorLight,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.error,
  },
  cariWarningText: {
    flex: 1,
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
  addNewCariButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.successLight + '30',
  },
  cariStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  docTypeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
  },
  docTypeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  notWarningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.warningLight,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.warning,
  },
  notWarningText: {
    flex: 1,
    color: colors.warning,
  },
  hesapCard: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  hesapRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  hesapInfo: {
    flex: 1,
    gap: 2,
  },
  kategoriScroll: {
    marginTop: spacing.xs,
  },
  kategoriChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: spacing.xs,
  },
  kategoriChipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  editableTotalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: 2,
  },
  editableTotalInput: {
    flex: 1,
    fontSize: 22,
    fontWeight: '600',
    color: colors.text,
    borderBottomWidth: 2,
    borderBottomColor: colors.primary,
    paddingVertical: spacing.xs,
  },
  paymentInfoCard: {
    padding: spacing.md,
    gap: spacing.xs,
  },
  rememberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
    backgroundColor: colors.surfaceLight,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  autoMatchedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  irsaliyeBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.warningLight,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.warning,
  },
  irsaliyeBannerContent: {
    flex: 1,
    gap: spacing.xs,
  },
  irsaliyeBannerText: {
    fontWeight: '600',
    color: colors.warning,
  },
  irsaliyeBannerButtons: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  irsaliyeLinkButton: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  irsaliyeIgnoreButton: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
  },
  irsaliyeInfoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: '#8b5cf612',
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: '#8b5cf640',
  },
});
