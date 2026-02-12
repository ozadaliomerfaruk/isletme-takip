import { createContext, useContext, useState, useCallback, useRef, useMemo } from 'react';
import { Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTakePhoto, usePickMultipleImages } from '@/hooks/useIslemPhoto';
import { useOcrImport } from '@/hooks/useOcrImport';
import { useUrunler } from '@/hooks/useUrunler';
import { useCariler } from '@/hooks/useCariler';
import { useKategoriler } from '@/hooks/useKategoriler';
import { formatCurrency } from '@/lib/currency';
import {
  OcrImportStep,
  OcrParsedItem,
  OcrSaveMode,
  MultiInvoiceEntry,
  OcrProcessingProgress,
  OcrSaveProgress,
} from '@/types/ocrImport';
import { Urun, Cari, Kategori, UrunHareketTipi } from '@/types/database';

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
  enteredTotal: number;
  totalMismatch: boolean;
  getUrunById: (id: string | null) => Urun | undefined;
  getMatchedKategoriName: (item: OcrParsedItem) => string | null;

  // Save state
  isSaving: boolean;
  saveProgress: OcrSaveProgress | null;

  // Data
  kategoriler: Kategori[] | undefined;
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
  const [saveMode, setSaveMode] = useState<OcrSaveMode>('products_and_movements');
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

  const sessionId = useRef(`ocr_${Date.now()}`).current;

  const takePhoto = useTakePhoto();
  const pickMultipleImages = usePickMultipleImages();
  const { data: urunler } = useUrunler();
  const { data: cariler } = useCariler();
  const { data: kategoriler } = useKategoriler('urun');

  const {
    processImages,
    saveImport,
    saveAll,
    isProcessing,
    processingProgress,
    isSaving,
    saveProgress,
  } = useOcrImport(sessionId);

  // Current selected invoice for review
  const selectedInvoice = selectedIndex !== null ? entries[selectedIndex]?.invoice ?? null : null;

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

  // Get product by ID
  const getUrunById = useCallback((id: string | null): Urun | undefined => {
    return urunler?.find(u => u.id === id);
  }, [urunler]);

  // Get cari by ID
  const getCariById = useCallback((id: string | null): Cari | undefined => {
    if (!id) return undefined;
    return cariler?.find(c => c.id === id);
  }, [cariler]);

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

  // ====== CAPTURE: Process collected URIs ======
  const startProcessing = useCallback(async (uris: string[]) => {
    if (uris.length === 0) return;

    setStep('processing');

    try {
      const results = await processImages(uris);
      const newEntries: MultiInvoiceEntry[] = results.map((invoice, i) => ({
        id: `inv_${Date.now()}_${i}`,
        imageUri: uris[i],
        invoice,
        invoiceDate: invoice.invoiceDate
          ? (() => {
              const parts = invoice.invoiceDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
              return parts
                ? new Date(parseInt(parts[1]), parseInt(parts[2]) - 1, parseInt(parts[3]))
                : new Date();
            })()
          : new Date(),
        saveMode: 'products_and_movements',
        isSaved: false,
      }));

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

      // Single invoice → go directly to review
      if (entries.length === 0 && newEntries.length === 1) {
        setSelectedIndex(0);
        setInvoiceDateFromEntry(newEntries[0]);
        setSaveMode(newEntries[0].saveMode);
        setStep('review');
        router.push('/foto-import/review');
      } else {
        setStep('invoice-list');
      }
    } catch {
      Alert.alert(t('common:status.error'), t('ocrImport:messages.ocrFailed'));
      setStep('capture');
    }
  }, [processImages, t, entries.length, router, setInvoiceDateFromEntry]);

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

    // Skip new product confirmation for only_cari_transaction mode
    if (entry.saveMode !== 'only_cari_transaction') {
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
      const result = await saveImport(entry.invoice, entry.saveMode, hareketTipi);

      setEntries(prev => {
        const newEntries = [...prev];
        newEntries[selectedIndex] = { ...newEntries[selectedIndex], isSaved: true };
        return newEntries;
      });

      let message: string;
      if (entry.saveMode === 'only_cari_transaction') {
        const totalAmount = entry.invoice.grandTotal
          || entry.invoice.items.reduce((sum, item) => sum + item.totalPrice, 0);
        message = t('ocrImport:messages.successOnlyCari', { amount: formatCurrency(totalAmount) });
      } else if (entry.saveMode === 'only_products') {
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
    if (!selectedInvoice?.grandTotal) return false;
    const diff = Math.abs(selectedInvoice.grandTotal - enteredTotal);
    return diff / Math.max(selectedInvoice.grandTotal, 1) > 0.01;
  }, [selectedInvoice, enteredTotal]);

  const matchedCari = getCariById(selectedInvoice?.supplierMatchCariId || null);
  const currentEntry = selectedIndex !== null ? entries[selectedIndex] : null;

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
    enteredTotal,
    totalMismatch,
    getUrunById,
    getMatchedKategoriName,
    isSaving,
    saveProgress,
    kategoriler,
  }), [
    step, entries, selectedIndex, saveMode, invoiceDate, pendingUris,
    handleTakePhoto, handlePickImages, takePhoto.isPending, pickMultipleImages.isPending,
    isProcessing, processingProgress,
    handleSelectInvoice, handleRemoveEntry, handleAddMore, handleSaveAllWithDirection,
    handleItemUpdate, handleItemRemove, handleChangeProduct, handleSelectProduct,
    handleSelectCari, handleInvoiceDateChange, handleBuy, handleSell, handleSaveWithDirection,
    newProductModalVisible, handleConfirmNewProducts, handleSkipNewProducts,
    productPickerVisible, productPickerIndex, productSearch, filteredUrunler,
    cariPickerVisible, cariSearch, filteredCariler,
    selectedInvoice, currentEntry, matchedCari, enteredTotal, totalMismatch,
    getUrunById, getMatchedKategoriName,
    isSaving, saveProgress, kategoriler,
  ]);

  return (
    <FotoImportContext.Provider value={value}>
      {children}
    </FotoImportContext.Provider>
  );
}
