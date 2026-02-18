import { createContext, useContext, useState, useCallback, useRef, useMemo } from 'react';
import { Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTakePhoto, usePickMultipleImages } from '@/hooks/useIslemPhoto';
import { useOcrImport } from '@/hooks/useOcrImport';
import { useUrunler } from '@/hooks/useUrunler';
import { useCariler } from '@/hooks/useCariler';
import { useKategoriler } from '@/hooks/useKategoriler';
import { useHesaplar } from '@/hooks/useHesaplar';
import { useCreateUrunAlias } from '@/hooks/useUrunAliases';
import { useCreateCariAlias } from '@/hooks/useCariAliases';
import { formatCurrency } from '@/lib/currency';
import { normalizeTurkish } from '@/lib/turkishTextUtils';
import {
  OcrImportStep,
  OcrParsedItem,
  OcrParsedInvoice,
  OcrSaveMode,
  MultiInvoiceEntry,
  OcrProcessingProgress,
  OcrSaveProgress,
  DOCUMENT_TYPE_DEFAULTS,
} from '@/types/ocrImport';
import { Urun, Cari, Kategori, Hesap, UrunHareketTipi } from '@/types/database';

interface FotoImportContextValue {
  // State
  step: OcrImportStep;
  setStep: (step: OcrImportStep) => void;
  entries: MultiInvoiceEntry[];
  setEntries: React.Dispatch<React.SetStateAction<MultiInvoiceEntry[]>>;
  selectedIndex: number | null;
  setSelectedIndex: (index: number | null) => void;
  saveMode: OcrSaveMode;
  setSaveMode: (mode: OcrSaveMode) => void;
  invoiceDate: Date;
  setInvoiceDate: (date: Date) => void;

  // Camera
  pendingUris: string[];
  handleTakePhoto: () => void;
  handlePickImages: () => void;
  isCameraLoading: boolean;

  // Processing
  isProcessing: boolean;
  processingProgress: OcrProcessingProgress | null;

  // Invoice list actions
  handleSelectInvoice: (index: number) => void;
  handleRemoveEntry: (index: number) => void;
  handleAddMore: () => void;
  handleSaveAllWithDirection: (hareketTipi: UrunHareketTipi) => void;

  // Review actions
  handleItemUpdate: (itemIndex: number, updatedItem: OcrParsedItem) => void;
  handleItemRemove: (itemIndex: number) => void;
  handleChangeProduct: (index: number) => void;
  handleSelectProduct: (urunId: string) => void;
  handleSelectCari: (cariId: string) => void;
  handleInvoiceDateChange: (date: Date) => void;
  handleBuy: () => void;
  handleSell: () => void;
  handleSaveWithDirection: (hareketTipi: UrunHareketTipi) => void;

  // Hesap picker
  handleSelectHesap: (hesapId: string) => void;
  hesapPickerVisible: boolean;
  setHesapPickerVisible: (v: boolean) => void;
  hesapSearch: string;
  setHesapSearch: (s: string) => void;
  filteredHesaplar: Hesap[] | undefined;

  // Gider kategori
  giderKategoriler: Kategori[] | undefined;
  handleSelectGiderKategori: (kategoriId: string | null) => void;

  // Edited grand total (for direct_gider)
  handleEditGrandTotal: (amount: number | null) => void;

  // New product modal
  newProductModalVisible: boolean;
  setNewProductModalVisible: (v: boolean) => void;
  handleConfirmNewProducts: () => void;
  handleSkipNewProducts: () => void;

  // Product picker
  productPickerVisible: boolean;
  setProductPickerVisible: (v: boolean) => void;
  productPickerIndex: number | null;
  productSearch: string;
  setProductSearch: (s: string) => void;
  filteredUrunler: Urun[] | undefined;

  // Cari picker
  cariPickerVisible: boolean;
  setCariPickerVisible: (v: boolean) => void;
  cariSearch: string;
  setCariSearch: (s: string) => void;
  filteredCariler: Cari[] | undefined;

  // Computed
  selectedInvoice: import('@/types/ocrImport').OcrParsedInvoice | null;
  currentEntry: MultiInvoiceEntry | null;
  matchedCari: Cari | undefined;
  selectedHesap: Hesap | undefined;
  enteredTotal: number;
  totalMismatch: boolean;
  getUrunById: (id: string | null) => Urun | undefined;
  getMatchedKategoriName: (item: OcrParsedItem) => string | null;

  // Alias learning
  saveUrunAlias: (urunId: string, ocrName: string, supplierCariId?: string | null) => void;
  saveCariAlias: (cariId: string, ocrName: string) => void;

  // Save state
  isSaving: boolean;
  saveProgress: OcrSaveProgress | null;

  // Data
  kategoriler: Kategori[] | undefined;
  cariler: Cari[] | undefined;
}

const FotoImportContext = createContext<FotoImportContextValue | null>(null);

export function useFotoImportContext() {
  const ctx = useContext(FotoImportContext);
  if (!ctx) throw new Error('useFotoImportContext must be used within FotoImportProvider');
  return ctx;
}

export function FotoImportProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { t } = useTranslation(['ocrImport', 'common', 'products']);

  const [step, setStep] = useState<OcrImportStep>('capture');
  const [entries, setEntries] = useState<MultiInvoiceEntry[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [saveMode, setSaveMode] = useState<OcrSaveMode>('stock_and_cari');
  const [newProductModalVisible, setNewProductModalVisible] = useState(false);
  const [invoiceDate, setInvoiceDate] = useState<Date>(new Date());
  const [pendingUris, setPendingUris] = useState<string[]>([]);

  // Product picker
  const [productPickerVisible, setProductPickerVisible] = useState(false);
  const [productPickerIndex, setProductPickerIndex] = useState<number | null>(null);
  const [productSearch, setProductSearch] = useState('');

  // Cari picker
  const [cariPickerVisible, setCariPickerVisible] = useState(false);
  const [cariSearch, setCariSearch] = useState('');

  // Hesap picker
  const [hesapPickerVisible, setHesapPickerVisible] = useState(false);
  const [hesapSearch, setHesapSearch] = useState('');

  const sessionId = useRef(`ocr_${Date.now()}`).current;

  const takePhoto = useTakePhoto();
  const pickMultipleImages = usePickMultipleImages();
  const { data: urunler } = useUrunler();
  const { data: cariler } = useCariler();
  const { data: kategoriler } = useKategoriler('urun');
  const { data: giderKategoriler } = useKategoriler('gider');
  const { data: hesaplar } = useHesaplar();

  const createUrunAlias = useCreateUrunAlias();
  const createCariAlias = useCreateCariAlias();

  const {
    processImages,
    saveImport,
    saveAll,
    matchCardToHesap,
    isProcessing,
    processingProgress,
    isSaving,
    saveProgress,
  } = useOcrImport(sessionId);

  // Current selected invoice for review
  const selectedInvoice = selectedIndex !== null ? entries[selectedIndex]?.invoice ?? null : null;
  const currentEntry = selectedIndex !== null ? entries[selectedIndex] ?? null : null;

  // Filtered products for picker
  const filteredUrunler = useMemo(() => {
    if (!productSearch.trim()) return urunler;
    return urunler?.filter(u =>
      u.ad.toLowerCase().includes(productSearch.toLowerCase()) ||
      (u.kod && u.kod.toLowerCase().includes(productSearch.toLowerCase()))
    );
  }, [urunler, productSearch]);

  // Filtered cariler for picker
  const filteredCariler = useMemo(() => {
    if (!cariSearch.trim()) return cariler;
    return cariler?.filter(c =>
      c.name.toLowerCase().includes(cariSearch.toLowerCase()) ||
      (c.tax_number && c.tax_number.includes(cariSearch))
    );
  }, [cariler, cariSearch]);

  // Filtered hesaplar for picker
  const filteredHesaplar = useMemo(() => {
    if (!hesapSearch.trim()) return hesaplar;
    return hesaplar?.filter(h =>
      h.name.toLowerCase().includes(hesapSearch.toLowerCase())
    );
  }, [hesaplar, hesapSearch]);

  // Get product by ID
  const getUrunById = useCallback((id: string | null): Urun | undefined => {
    return urunler?.find(u => u.id === id);
  }, [urunler]);

  // Get cari by ID
  const getCariById = useCallback((id: string | null): Cari | undefined => {
    if (!id) return undefined;
    return cariler?.find(c => c.id === id);
  }, [cariler]);

  // Get hesap by ID
  const getHesapById = useCallback((id: string | null): Hesap | undefined => {
    if (!id) return undefined;
    return hesaplar?.find(h => h.id === id);
  }, [hesaplar]);

  // Get kategori name by ID
  const getKategoriName = useCallback((kategoriId: string | null): string | null => {
    if (!kategoriId || !kategoriler) return null;
    const kat = kategoriler.find((k: Kategori) => k.id === kategoriId);
    return kat?.name || null;
  }, [kategoriler]);

  // Get matched kategori name for a product item
  const getMatchedKategoriName = useCallback((item: OcrParsedItem): string | null => {
    if (item.matchedUrunId) {
      const product = getUrunById(item.matchedUrunId);
      if (product?.kategori_id) {
        return getKategoriName(product.kategori_id);
      }
    }
    return null;
  }, [getUrunById, getKategoriName]);

  // Set invoice date from entry
  const setInvoiceDateFromEntry = useCallback((entry: MultiInvoiceEntry) => {
    setInvoiceDate(entry.invoiceDate);
  }, []);

  // Alias save helpers
  const saveUrunAlias = useCallback((urunId: string, ocrName: string, supplierCariId?: string | null) => {
    const normalized = normalizeTurkish(ocrName);
    if (!normalized) return;
    createUrunAlias.mutate({
      urun_id: urunId,
      alias_name: ocrName,
      alias_normalized: normalized,
      supplier_cari_id: supplierCariId || null,
    });
  }, [createUrunAlias]);

  const saveCariAlias = useCallback((cariId: string, ocrName: string) => {
    const normalized = normalizeTurkish(ocrName);
    if (!normalized) return;
    createCariAlias.mutate({
      cari_id: cariId,
      alias_name: ocrName,
      alias_normalized: normalized,
    });
  }, [createCariAlias]);

  // ====== MERGE HELPERS ======

  /**
   * Merge multi-page invoices: same supplier + same invoiceNumber/ettn + same date
   * Combines items arrays, takes non-null totals from whichever page has them.
   */
  const mergeMultiPageInvoices = useCallback((invoices: OcrParsedInvoice[], uris: string[]): { invoices: OcrParsedInvoice[]; uris: string[] } => {
    if (invoices.length <= 1) return { invoices, uris };

    const merged: OcrParsedInvoice[] = [];
    const mergedUris: string[] = [];
    const consumed = new Set<number>();

    for (let i = 0; i < invoices.length; i++) {
      if (consumed.has(i)) continue;

      const base = invoices[i];
      // Only merge documents that have identifiable supplier info
      const hasMergeKey = base.supplierTaxNumber || base.ettn || base.invoiceNumber;
      if (!hasMergeKey) {
        merged.push(base);
        mergedUris.push(uris[i]);
        continue;
      }

      // Find matching pages
      const group: number[] = [i];
      for (let j = i + 1; j < invoices.length; j++) {
        if (consumed.has(j)) continue;
        const candidate = invoices[j];

        // Must share at least one identifier
        const sameSupplier = base.supplierTaxNumber && candidate.supplierTaxNumber
          && base.supplierTaxNumber === candidate.supplierTaxNumber;
        const sameEttn = base.ettn && candidate.ettn && base.ettn === candidate.ettn;
        const sameInvoiceNo = base.invoiceNumber && candidate.invoiceNumber
          && base.invoiceNumber === candidate.invoiceNumber;
        const sameDate = base.invoiceDate && candidate.invoiceDate
          && base.invoiceDate === candidate.invoiceDate;

        // Merge if: (same ETTN) OR (same supplier + same invoice no) OR (same supplier + same date + same invoice no)
        if (sameEttn || (sameSupplier && sameInvoiceNo) || (sameSupplier && sameDate && sameInvoiceNo)) {
          group.push(j);
        }
      }

      if (group.length === 1) {
        merged.push(base);
        mergedUris.push(uris[i]);
        continue;
      }

      // Merge all pages in group
      console.log(`[FotoImport] Merging ${group.length} pages for invoice ${base.invoiceNumber || base.ettn}`);
      let mergedInvoice: OcrParsedInvoice = { ...base, items: [...base.items] };
      for (let k = 1; k < group.length; k++) {
        const page = invoices[group[k]];
        consumed.add(group[k]);
        // Append items
        mergedInvoice.items = [...mergedInvoice.items, ...page.items];
        // Take non-null values for totals
        mergedInvoice.grandTotal = mergedInvoice.grandTotal ?? page.grandTotal;
        mergedInvoice.subtotal = mergedInvoice.subtotal ?? page.subtotal;
        mergedInvoice.vatTotal = mergedInvoice.vatTotal ?? page.vatTotal;
        mergedInvoice.supplierBalance = mergedInvoice.supplierBalance ?? page.supplierBalance;
        // Take supplier info from whichever page has it
        mergedInvoice.supplierName = mergedInvoice.supplierName ?? page.supplierName;
        mergedInvoice.supplierTaxNumber = mergedInvoice.supplierTaxNumber ?? page.supplierTaxNumber;
        mergedInvoice.ettn = mergedInvoice.ettn ?? page.ettn;
        mergedInvoice.invoiceNumber = mergedInvoice.invoiceNumber ?? page.invoiceNumber;
        mergedInvoice.invoiceDate = mergedInvoice.invoiceDate ?? page.invoiceDate;
        mergedInvoice.paymentInfo = mergedInvoice.paymentInfo ?? page.paymentInfo;
        mergedInvoice.paidStatus = mergedInvoice.paidStatus ?? page.paidStatus;
      }
      merged.push(mergedInvoice);
      mergedUris.push(uris[i]); // Use the first page's image URI
    }

    return { invoices: merged, uris: mergedUris };
  }, []);

  /**
   * Merge tahsilat/odeme + POS receipt pairs: same date + amount within 5%
   * The POS receipt is absorbed into the tahsilat's paymentInfo.
   */
  const mergeTahsilatPosEntries = useCallback((invoices: OcrParsedInvoice[], uris: string[]): { invoices: OcrParsedInvoice[]; uris: string[] } => {
    if (invoices.length <= 1) return { invoices, uris };

    const merged: OcrParsedInvoice[] = [];
    const mergedUris: string[] = [];
    const consumed = new Set<number>();

    for (let i = 0; i < invoices.length; i++) {
      if (consumed.has(i)) continue;

      const inv = invoices[i];
      const isTahsilat = inv.documentType === 'tahsilat_makbuzu' || inv.documentType === 'odeme_dekontu';
      const isPos = inv.documentType === 'pos_fisi';

      if (!isTahsilat && !isPos) {
        merged.push(inv);
        mergedUris.push(uris[i]);
        continue;
      }

      // Look for a matching counterpart
      let matchIdx = -1;
      const invTotal = inv.grandTotal ?? inv.items.reduce((s, it) => s + it.totalPrice, 0);

      for (let j = i + 1; j < invoices.length; j++) {
        if (consumed.has(j)) continue;
        const other = invoices[j];

        const otherIsTahsilat = other.documentType === 'tahsilat_makbuzu' || other.documentType === 'odeme_dekontu';
        const otherIsPos = other.documentType === 'pos_fisi';

        // Need one tahsilat + one POS
        if (!((isTahsilat && otherIsPos) || (isPos && otherIsTahsilat))) continue;

        // Same date check
        if (inv.invoiceDate && other.invoiceDate && inv.invoiceDate !== other.invoiceDate) continue;

        // Amount within 5%
        const otherTotal = other.grandTotal ?? other.items.reduce((s, it) => s + it.totalPrice, 0);
        if (invTotal > 0 && otherTotal > 0) {
          const diff = Math.abs(invTotal - otherTotal);
          const maxVal = Math.max(invTotal, otherTotal);
          if (diff / maxVal > 0.05) continue;
        }

        // Optional: card last four match
        matchIdx = j;
        break;
      }

      if (matchIdx === -1) {
        merged.push(inv);
        mergedUris.push(uris[i]);
        continue;
      }

      consumed.add(matchIdx);
      const other = invoices[matchIdx];

      // Keep tahsilat, absorb POS payment info
      const tahsilat = isTahsilat ? inv : other;
      const pos = isPos ? inv : other;
      const tahsilatUri = isTahsilat ? uris[i] : uris[matchIdx];

      console.log(`[FotoImport] Merging tahsilat + POS: ${tahsilat.grandTotal} / ${pos.grandTotal}`);

      const mergedInvoice: OcrParsedInvoice = {
        ...tahsilat,
        paymentInfo: pos.paymentInfo ?? tahsilat.paymentInfo,
        grandTotal: tahsilat.grandTotal ?? pos.grandTotal,
      };

      merged.push(mergedInvoice);
      mergedUris.push(tahsilatUri);
    }

    return { invoices: merged, uris: mergedUris };
  }, []);

  // ====== CAPTURE: Process collected URIs ======
  const startProcessing = useCallback(async (uris: string[]) => {
    if (uris.length === 0) return;

    setStep('processing');

    try {
      const results = await processImages(uris);

      // === Post-processing merges ===
      // 1) Merge multi-page invoices (same ETTN / invoice number)
      const afterPageMerge = mergeMultiPageInvoices(results, uris);
      // 2) Merge tahsilat + POS receipt pairs
      const afterPosMerge = mergeTahsilatPosEntries(afterPageMerge.invoices, afterPageMerge.uris);
      const finalInvoices = afterPosMerge.invoices;
      const finalUris = afterPosMerge.uris;

      const newEntries: MultiInvoiceEntry[] = finalInvoices.map((invoice, i) => {
        const defaultMode = DOCUMENT_TYPE_DEFAULTS[invoice.documentType]?.saveMode || 'stock_and_cari';

        // Auto-match card to hesap
        let autoHesapId: string | null = null;
        if (invoice.paymentInfo?.cardLastFour) {
          autoHesapId = matchCardToHesap(invoice.paymentInfo.cardLastFour);
        }

        // Auto-match suggested gider category
        let autoKategoriId: string | null = null;
        if (defaultMode === 'direct_gider' && invoice.suggestedGiderCategory && giderKategoriler?.length) {
          const suggested = invoice.suggestedGiderCategory.toLowerCase();
          const match = giderKategoriler.find(k => k.name.toLowerCase() === suggested)
            || giderKategoriler.find(k => suggested.includes(k.name.toLowerCase()) || k.name.toLowerCase().includes(suggested));
          if (match) autoKategoriId = match.id;
        }

        return {
          id: `inv_${Date.now()}_${i}`,
          imageUri: finalUris[i],
          invoice,
          invoiceDate: invoice.invoiceDate
            ? (() => {
                const parts = invoice.invoiceDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
                return parts
                  ? new Date(parseInt(parts[1]), parseInt(parts[2]) - 1, parseInt(parts[3]))
                  : new Date();
              })()
            : new Date(),
          saveMode: defaultMode,
          isSaved: false,
          selectedHesapId: autoHesapId,
          selectedKategoriId: autoKategoriId,
          editedGrandTotal: null,
        };
      });

      if (newEntries.length === 0) {
        Alert.alert(
          t('common:status.warning'),
          t('ocrImport:messages.ocrFailed'),
          [{ text: t('common:buttons.back'), onPress: () => setStep('capture') }]
        );
        return;
      }

      setEntries(prev => [...prev, ...newEntries]);
      setPendingUris([]);

      // Always go to invoice list first
      setStep('invoice-list');
    } catch (error: any) {
      console.error('[FotoImport] Processing error:', error?.message || error);
      Alert.alert(t('common:status.error'), error?.message || t('ocrImport:messages.ocrFailed'));
      setStep('capture');
    }
  }, [processImages, matchCardToHesap, giderKategoriler, mergeMultiPageInvoices, mergeTahsilatPosEntries, t]);

  // ====== CAPTURE: Camera loop ======
  const handleTakePhoto = useCallback(async () => {
    try {
      const uri = await takePhoto.mutateAsync();
      if (!uri) {
        if (pendingUris.length > 0) {
          startProcessing(pendingUris);
        }
        return;
      }
      const newUris = [...pendingUris, uri];
      setPendingUris(newUris);
      setTimeout(async () => {
        try {
          const nextUri = await takePhoto.mutateAsync();
          if (!nextUri) {
            startProcessing(newUris);
            return;
          }
          const moreUris = [...newUris, nextUri];
          setPendingUris(moreUris);
          startProcessing(moreUris);
        } catch {
          startProcessing(newUris);
        }
      }, 300);
    } catch {
      if (pendingUris.length > 0) {
        startProcessing(pendingUris);
      }
    }
  }, [takePhoto, pendingUris, startProcessing]);

  // ====== CAPTURE: Gallery multi-select ======
  const handlePickImages = useCallback(async () => {
    try {
      const uris = await pickMultipleImages.mutateAsync();
      if (uris.length === 0) return;
      startProcessing(uris);
    } catch {
      // User cancelled or permission denied
    }
  }, [pickMultipleImages, startProcessing]);

  // ====== CAPTURE: Add more from invoice-list ======
  const handleAddMore = useCallback(() => {
    setStep('capture');
  }, []);

  // ====== INVOICE LIST: Select invoice to review ======
  const handleSelectInvoice = useCallback((index: number) => {
    setSelectedIndex(index);
    setInvoiceDateFromEntry(entries[index]);
    setSaveMode(entries[index].saveMode);
    setStep('review');
    router.push('/foto-import/review');
  }, [entries, setInvoiceDateFromEntry, router]);

  // ====== INVOICE LIST: Remove entry ======
  const handleRemoveEntry = useCallback((index: number) => {
    setEntries(prev => {
      const newEntries = prev.filter((_, i) => i !== index);
      if (newEntries.length === 0) {
        setStep('capture');
      }
      return newEntries;
    });
  }, []);

  // ====== REVIEW: Update item ======
  const handleItemUpdate = useCallback((itemIndex: number, updatedItem: OcrParsedItem) => {
    if (selectedIndex === null) return;
    setEntries(prev => {
      const newEntries = [...prev];
      const entry = { ...newEntries[selectedIndex] };
      const newItems = [...entry.invoice.items];
      newItems[itemIndex] = { ...updatedItem, userEdited: true };
      entry.invoice = { ...entry.invoice, items: newItems };
      newEntries[selectedIndex] = entry;
      return newEntries;
    });
  }, [selectedIndex]);

  const handleItemRemove = useCallback((itemIndex: number) => {
    if (selectedIndex === null) return;
    setEntries(prev => {
      const newEntries = [...prev];
      const entry = { ...newEntries[selectedIndex] };
      entry.invoice = { ...entry.invoice, items: entry.invoice.items.filter((_, i) => i !== itemIndex) };
      newEntries[selectedIndex] = entry;
      return newEntries;
    });
  }, [selectedIndex]);

  // Product picker
  const handleChangeProduct = useCallback((index: number) => {
    setProductPickerIndex(index);
    setProductSearch('');
    setProductPickerVisible(true);
  }, []);

  const handleSelectProduct = useCallback((urunId: string) => {
    if (productPickerIndex === null || selectedIndex === null) return;
    const product = urunler?.find(u => u.id === urunId);
    if (!product) return;

    setEntries(prev => {
      const newEntries = [...prev];
      const entry = { ...newEntries[selectedIndex] };
      const newItems = [...entry.invoice.items];
      newItems[productPickerIndex] = {
        ...newItems[productPickerIndex],
        matchedUrunId: urunId,
        matchScore: 1,
        matchTier: 'exact',
        kategoriId: product.kategori_id || null,
        userEdited: true,
      };
      entry.invoice = { ...entry.invoice, items: newItems };
      newEntries[selectedIndex] = entry;
      return newEntries;
    });
    setProductPickerVisible(false);
    setProductPickerIndex(null);
  }, [productPickerIndex, selectedIndex, urunler]);

  // Cari picker
  const handleSelectCari = useCallback((cariId: string) => {
    if (selectedIndex === null) return;
    setEntries(prev => {
      const newEntries = [...prev];
      const entry = { ...newEntries[selectedIndex] };
      entry.invoice = { ...entry.invoice, supplierMatchCariId: cariId };
      newEntries[selectedIndex] = entry;
      return newEntries;
    });
    setCariPickerVisible(false);
  }, [selectedIndex]);

  // Hesap picker
  const handleSelectHesap = useCallback((hesapId: string) => {
    if (selectedIndex === null) return;
    setEntries(prev => {
      const newEntries = [...prev];
      newEntries[selectedIndex] = { ...newEntries[selectedIndex], selectedHesapId: hesapId };
      return newEntries;
    });
    setHesapPickerVisible(false);
  }, [selectedIndex]);

  // Gider kategori selection
  const handleSelectGiderKategori = useCallback((kategoriId: string | null) => {
    if (selectedIndex === null) return;
    setEntries(prev => {
      const newEntries = [...prev];
      newEntries[selectedIndex] = { ...newEntries[selectedIndex], selectedKategoriId: kategoriId };
      return newEntries;
    });
  }, [selectedIndex]);

  // Edited grand total
  const handleEditGrandTotal = useCallback((amount: number | null) => {
    if (selectedIndex === null) return;
    setEntries(prev => {
      const newEntries = [...prev];
      newEntries[selectedIndex] = { ...newEntries[selectedIndex], editedGrandTotal: amount };
      return newEntries;
    });
  }, [selectedIndex]);

  // Invoice date change
  const handleInvoiceDateChange = useCallback((date: Date) => {
    setInvoiceDate(date);
    if (selectedIndex === null) return;
    setEntries(prev => {
      const newEntries = [...prev];
      const entry = { ...newEntries[selectedIndex] };
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      entry.invoice = { ...entry.invoice, invoiceDate: `${y}-${m}-${d}` };
      entry.invoiceDate = date;
      newEntries[selectedIndex] = entry;
      return newEntries;
    });
  }, [selectedIndex]);

  // ====== REVIEW: Save single invoice ======
  const pendingDirection = useRef<UrunHareketTipi | null>(null);

  const handleSaveWithDirection = useCallback(async (hareketTipi: UrunHareketTipi) => {
    if (selectedIndex === null) return;
    const entry = entries[selectedIndex];
    if (!entry || entry.isSaved) return;

    // Skip new product confirmation for modes that don't create products
    const needsProductConfirmation = entry.saveMode === 'stock_and_cari' || entry.saveMode === 'stock_only' || entry.saveMode === 'irsaliye_pending';
    if (needsProductConfirmation) {
      const newUnconfirmed = entry.invoice.items.filter(
        item => item.matchTier === 'new' && !item.isNewConfirmed
      );

      if (newUnconfirmed.length > 0) {
        pendingDirection.current = hareketTipi;
        setNewProductModalVisible(true);
        return;
      }
    }

    setStep('saving');
    try {
      const result = await saveImport(entry.invoice, entry.saveMode, hareketTipi, {
        hesapId: entry.selectedHesapId || undefined,
        kategoriId: entry.selectedKategoriId || undefined,
        editedGrandTotal: entry.editedGrandTotal,
      });

      setEntries(prev => {
        const newEntries = [...prev];
        newEntries[selectedIndex] = { ...newEntries[selectedIndex], isSaved: true };
        return newEntries;
      });

      let message: string;
      if (entry.saveMode === 'cari_odeme_tahsilat') {
        const totalAmount = entry.editedGrandTotal ?? entry.invoice.grandTotal
          ?? entry.invoice.items.reduce((sum, item) => sum + item.totalPrice, 0);
        message = hareketTipi === 'giris'
          ? t('ocrImport:messages.successCariTahsilat', { amount: formatCurrency(totalAmount) })
          : t('ocrImport:messages.successCariOdeme', { amount: formatCurrency(totalAmount) });
      } else if (entry.saveMode === 'cari_borc_only') {
        const totalAmount = entry.editedGrandTotal ?? entry.invoice.grandTotal
          ?? entry.invoice.items.reduce((sum, item) => sum + item.totalPrice, 0);
        message = t('ocrImport:messages.successOnlyCari', { amount: formatCurrency(totalAmount) });
      } else if (entry.saveMode === 'direct_gider') {
        const totalAmount = entry.editedGrandTotal ?? entry.invoice.grandTotal
          ?? entry.invoice.items.reduce((sum, item) => sum + item.totalPrice, 0);
        message = t('ocrImport:messages.successDirectGider', { amount: formatCurrency(totalAmount) });
      } else if (entry.saveMode === 'irsaliye_pending') {
        message = t('ocrImport:messages.successIrsaliyePending', { productCount: result.productCount });
      } else if (entry.saveMode === 'stock_only') {
        message = t('ocrImport:messages.successOnlyProducts', { count: result.productCount });
      } else {
        message = t('ocrImport:messages.success', { productCount: result.productCount, movementCount: result.movementCount });
      }

      if (entries.length > 1) {
        Alert.alert(t('common:status.success'), message);
        setStep('invoice-list');
        router.back(); // Go back to index (invoice list)
      } else {
        Alert.alert(
          t('common:status.success'),
          message,
          [{ text: t('common:buttons.ok'), onPress: () => {
            // Go back from review to index, then from index to products
            router.back();
            setTimeout(() => router.back(), 100);
          }}]
        );
        setStep('done');
      }
    } catch (error: any) {
      Alert.alert(t('common:status.error'), error.message);
      setStep('review');
    }
  }, [selectedIndex, entries, saveImport, t, router]);

  const handleBuy = useCallback(() => {
    pendingDirection.current = 'giris';
    handleSaveWithDirection('giris');
  }, [handleSaveWithDirection]);

  const handleSell = useCallback(() => {
    pendingDirection.current = 'cikis';
    handleSaveWithDirection('cikis');
  }, [handleSaveWithDirection]);

  // New product modal handlers
  const handleConfirmNewProducts = useCallback(() => {
    if (selectedIndex === null) return;
    setEntries(prev => {
      const newEntries = [...prev];
      const entry = { ...newEntries[selectedIndex] };
      entry.invoice = {
        ...entry.invoice,
        items: entry.invoice.items.map(item =>
          item.matchTier === 'new' ? { ...item, isNewConfirmed: true } : item
        ),
      };
      newEntries[selectedIndex] = entry;
      return newEntries;
    });
    setNewProductModalVisible(false);

    if (pendingDirection.current) {
      setTimeout(() => {
        handleSaveWithDirection(pendingDirection.current!);
      }, 100);
    }
  }, [selectedIndex, handleSaveWithDirection]);

  const handleSkipNewProducts = useCallback(() => {
    if (selectedIndex === null) return;
    setEntries(prev => {
      const newEntries = [...prev];
      const entry = { ...newEntries[selectedIndex] };
      entry.invoice = {
        ...entry.invoice,
        items: entry.invoice.items.filter(item => item.matchTier !== 'new' || item.isNewConfirmed),
      };
      newEntries[selectedIndex] = entry;
      return newEntries;
    });
    setNewProductModalVisible(false);
  }, [selectedIndex]);

  // ====== BATCH SAVE ======
  const handleSaveAllWithDirection = useCallback(async (hareketTipi: UrunHareketTipi) => {
    setStep('saving');
    try {
      const result = await saveAll(entries, hareketTipi, (index) => {
        setEntries(prev => {
          const newEntries = [...prev];
          newEntries[index] = { ...newEntries[index], isSaved: true };
          return newEntries;
        });
      });

      const message = t('ocrImport:messages.success', {
        productCount: result.totalProducts,
        movementCount: result.totalMovements,
      });

      Alert.alert(
        t('common:status.success'),
        message,
        [{ text: t('common:buttons.ok'), onPress: () => router.back() }]
      );
      setStep('done');
    } catch (error: any) {
      Alert.alert(t('common:status.error'), error.message);
      setStep('invoice-list');
    }
  }, [entries, saveAll, t, router]);

  // Totals for selected invoice
  const enteredTotal = useMemo(() => {
    if (!selectedInvoice) return 0;
    return selectedInvoice.items.reduce((sum, item) => sum + item.totalPrice, 0);
  }, [selectedInvoice]);

  const totalMismatch = useMemo(() => {
    if (!selectedInvoice) return false;
    const compareTotal = selectedInvoice.subtotal
      ?? (selectedInvoice.grandTotal && selectedInvoice.vatTotal
        ? selectedInvoice.grandTotal - selectedInvoice.vatTotal
        : selectedInvoice.grandTotal);
    if (!compareTotal) return false;
    const diff = Math.abs(compareTotal - enteredTotal);
    return diff / Math.max(compareTotal, 1) > 0.01;
  }, [selectedInvoice, enteredTotal]);

  const matchedCari = getCariById(selectedInvoice?.supplierMatchCariId || null);
  const selectedHesap = getHesapById(currentEntry?.selectedHesapId || null);

  const value = useMemo<FotoImportContextValue>(() => ({
    step,
    setStep,
    entries,
    setEntries,
    selectedIndex,
    setSelectedIndex,
    saveMode,
    setSaveMode,
    invoiceDate,
    setInvoiceDate,
    pendingUris,
    handleTakePhoto,
    handlePickImages,
    isCameraLoading: takePhoto.isPending || pickMultipleImages.isPending,
    isProcessing,
    processingProgress,
    handleSelectInvoice,
    handleRemoveEntry,
    handleAddMore,
    handleSaveAllWithDirection,
    handleItemUpdate,
    handleItemRemove,
    handleChangeProduct,
    handleSelectProduct,
    handleSelectCari,
    handleInvoiceDateChange,
    handleBuy,
    handleSell,
    handleSaveWithDirection,
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
    newProductModalVisible,
    setNewProductModalVisible,
    handleConfirmNewProducts,
    handleSkipNewProducts,
    productPickerVisible,
    setProductPickerVisible,
    productPickerIndex,
    productSearch,
    setProductSearch,
    filteredUrunler,
    cariPickerVisible,
    setCariPickerVisible,
    cariSearch,
    setCariSearch,
    filteredCariler,
    selectedInvoice,
    currentEntry,
    matchedCari,
    selectedHesap,
    enteredTotal,
    totalMismatch,
    getUrunById,
    getMatchedKategoriName,
    isSaving,
    saveProgress,
    kategoriler,
    cariler,
  }), [
    step, entries, selectedIndex, saveMode, invoiceDate, pendingUris,
    handleTakePhoto, handlePickImages, takePhoto.isPending, pickMultipleImages.isPending,
    isProcessing, processingProgress,
    handleSelectInvoice, handleRemoveEntry, handleAddMore, handleSaveAllWithDirection,
    handleItemUpdate, handleItemRemove, handleChangeProduct, handleSelectProduct,
    handleSelectCari, handleInvoiceDateChange, handleBuy, handleSell, handleSaveWithDirection,
    handleSelectHesap, hesapPickerVisible, hesapSearch, filteredHesaplar,
    giderKategoriler, handleSelectGiderKategori, handleEditGrandTotal,
    saveUrunAlias, saveCariAlias,
    newProductModalVisible, handleConfirmNewProducts, handleSkipNewProducts,
    productPickerVisible, productPickerIndex, productSearch, filteredUrunler,
    cariPickerVisible, cariSearch, filteredCariler,
    selectedInvoice, currentEntry, matchedCari, selectedHesap, enteredTotal, totalMismatch,
    getUrunById, getMatchedKategoriName,
    isSaving, saveProgress, kategoriler, cariler,
  ]);

  return (
    <FotoImportContext.Provider value={value}>
      {children}
    </FotoImportContext.Provider>
  );
}
