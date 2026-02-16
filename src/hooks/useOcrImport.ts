import { useState, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthContext } from '@/contexts/AuthContext';
import { useCreateUrun, useUrunler } from '@/hooks/useUrunler';
import { useCreateUrunHareket } from '@/hooks/useUrunHareketler';
import { useCreateIslem } from '@/hooks/useIslemler';
import { useCariler } from '@/hooks/useCariler';
import { useHesaplar } from '@/hooks/useHesaplar';
import { useUrunAliases } from '@/hooks/useUrunAliases';
import { useCariAliases } from '@/hooks/useCariAliases';
import { useCreateIrsaliyeRecord } from '@/hooks/useIrsaliyeRecords';
import { invalidateRelatedQueries } from '@/lib/queryKeys';
import { recognizeInvoice } from '@/lib/ocrEngine';
import { matchItemsToProducts, matchSupplier } from '@/lib/fuzzyMatch';
import { formatDateTimeForDB } from '@/lib/date';
import {
  OcrParsedInvoice,
  OcrSaveMode,
  OcrSaveProgress,
  OcrProcessingProgress,
  MultiInvoiceEntry,
} from '@/types/ocrImport';
import { UrunHareketTipi, IslemType, Hesap } from '@/types/database';

export interface SaveImportOptions {
  hesapId?: string;
  kategoriId?: string;
  editedGrandTotal?: number | null;
}

export function useOcrImport(sessionId: string) {
  const queryClient = useQueryClient();
  const { isletme } = useAuthContext();
  const createUrun = useCreateUrun();
  const createUrunHareket = useCreateUrunHareket();
  const createIslem = useCreateIslem();
  const createIrsaliyeRecord = useCreateIrsaliyeRecord();

  const { data: existingProducts } = useUrunler();
  const { data: cariler } = useCariler();
  const { data: hesaplar } = useHesaplar();
  const { data: urunAliases } = useUrunAliases();
  const { data: cariAliases } = useCariAliases();

  const [isProcessing, setIsProcessing] = useState(false);
  const [processingProgress, setProcessingProgress] = useState<OcrProcessingProgress | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveProgress, setSaveProgress] = useState<OcrSaveProgress | null>(null);

  const createdIds = useRef<{ urunIds: string[]; hareketIds: string[] }>({
    urunIds: [],
    hareketIds: [],
  });

  // Match card last four digits to hesap
  const matchCardToHesap = useCallback((cardLastFour: string | null): string | null => {
    if (!cardLastFour || !hesaplar) return null;
    const match = hesaplar.find(
      (h: Hesap) => h.card_last_four === cardLastFour
    );
    return match?.id || null;
  }, [hesaplar]);

  // Process a single image via Gemini AI
  const processImage = useCallback(async (imageUri: string): Promise<OcrParsedInvoice> => {
    const parsed = await recognizeInvoice(imageUri);

    // Match supplier first (needed for supplier-specific alias matching)
    if (cariler && cariler.length > 0) {
      const matchedCariId = matchSupplier(
        parsed.supplierName,
        parsed.supplierTaxNumber,
        cariler,
        cariAliases || undefined,
      );
      if (matchedCariId) {
        parsed.supplierMatchCariId = matchedCariId;
      }
    }

    // Match items with alias-first strategy
    if (existingProducts && existingProducts.length > 0) {
      parsed.items = matchItemsToProducts(
        parsed.items,
        existingProducts,
        urunAliases || undefined,
        parsed.supplierMatchCariId,
      );
    }

    return parsed;
  }, [existingProducts, cariler, urunAliases, cariAliases]);

  // Process multiple images sequentially
  const processImages = useCallback(async (imageUris: string[]): Promise<OcrParsedInvoice[]> => {
    setIsProcessing(true);
    setProcessingProgress({ current: 0, total: imageUris.length });
    const results: OcrParsedInvoice[] = [];

    try {
      for (let i = 0; i < imageUris.length; i++) {
        setProcessingProgress({ current: i + 1, total: imageUris.length });
        const parsed = await processImage(imageUris[i]);
        results.push(parsed);
      }
      return results;
    } finally {
      setIsProcessing(false);
      setProcessingProgress(null);
    }
  }, [processImage]);

  // Helper: parse invoice date to DB format
  const parseDateForDB = useCallback((dateInfo: string): string | undefined => {
    if (!dateInfo) return undefined;
    const parts = dateInfo.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!parts) return undefined;
    const d = new Date(parseInt(parts[1]), parseInt(parts[2]) - 1, parseInt(parts[3]), 12, 0, 0);
    return formatDateTimeForDB(d);
  }, []);

  // Helper: build cari transaction from invoice
  const createCariTransaction = useCallback(async (
    invoice: OcrParsedInvoice,
    hareketTipi: UrunHareketTipi,
    totalAmount: number,
    invoiceRef: string,
    dateInfo: string,
    hesapId?: string,
  ) => {
    const islemType: IslemType = hareketTipi === 'giris' ? 'cari_alis' : 'cari_satis';
    const aciklama = dateInfo
      ? `OCR import - ${invoiceRef} - Tarih: ${dateInfo}`
      : `OCR import - ${invoiceRef}`;

    await createIslem.mutateAsync({
      type: islemType,
      amount: totalAmount,
      cari_id: invoice.supplierMatchCariId!,
      description: aciklama,
      ...(hesapId ? { hesap_id: hesapId } : {}),
      ...(parseDateForDB(dateInfo) ? { date: parseDateForDB(dateInfo) } : {}),
    });

    invalidateRelatedQueries(queryClient, 'islem');
    invalidateRelatedQueries(queryClient, 'cari');
    if (hesapId) invalidateRelatedQueries(queryClient, 'hesap');
  }, [createIslem, queryClient, parseDateForDB]);

  // Save a single invoice
  const saveImport = useCallback(async (
    invoice: OcrParsedInvoice,
    saveMode: OcrSaveMode,
    hareketTipi: UrunHareketTipi,
    options?: SaveImportOptions,
  ): Promise<{ productCount: number; movementCount: number }> => {
    if (!isletme) throw new Error('No business context');

    setIsSaving(true);

    try {
      const invoiceRef = invoice.invoiceNumber || sessionId;
      const dateInfo = invoice.invoiceDate || '';

      // ===== direct_gider: Create expense transaction =====
      if (saveMode === 'direct_gider') {
        if (!options?.hesapId) {
          throw new Error('Hesap seçimi zorunludur');
        }

        const totalAmount = options.editedGrandTotal
          ?? invoice.grandTotal
          ?? invoice.items.reduce((sum, item) => sum + item.totalPrice, 0);

        if (totalAmount <= 0) {
          throw new Error('Tutar girilmeden kaydedilemez');
        }

        setSaveProgress({ total: 1, current: 0, currentItemName: '', phase: 'creating_movements' });

        const aciklama = dateInfo
          ? `OCR import - ${invoiceRef} - Tarih: ${dateInfo}`
          : `OCR import - ${invoiceRef}`;

        await createIslem.mutateAsync({
          type: 'gider',
          amount: totalAmount,
          hesap_id: options.hesapId,
          kategori_id: options.kategoriId || null,
          description: aciklama,
          ...(parseDateForDB(dateInfo) ? { date: parseDateForDB(dateInfo) } : {}),
        });

        invalidateRelatedQueries(queryClient, 'islem');
        invalidateRelatedQueries(queryClient, 'hesap');

        setSaveProgress({ total: 1, current: 1, currentItemName: '', phase: 'done' });
        return { productCount: 0, movementCount: 0 };
      }

      // ===== cari_odeme_tahsilat: Create cari payment/collection =====
      if (saveMode === 'cari_odeme_tahsilat') {
        if (!invoice.supplierMatchCariId) {
          throw new Error('Cari seçimi zorunludur');
        }

        setSaveProgress({ total: 1, current: 0, currentItemName: '', phase: 'creating_movements' });

        const totalAmount = options?.editedGrandTotal
          ?? invoice.grandTotal
          ?? invoice.items.reduce((sum, item) => sum + item.totalPrice, 0);

        if (totalAmount <= 0) {
          throw new Error('Tutar girilmeden kaydedilemez');
        }

        const islemType: IslemType = hareketTipi === 'giris' ? 'cari_tahsilat' : 'cari_odeme';
        const aciklama = dateInfo
          ? `OCR import - ${invoiceRef} - Tarih: ${dateInfo}`
          : `OCR import - ${invoiceRef}`;

        await createIslem.mutateAsync({
          type: islemType,
          amount: totalAmount,
          cari_id: invoice.supplierMatchCariId,
          description: aciklama,
          ...(options?.hesapId ? { hesap_id: options.hesapId } : {}),
          ...(parseDateForDB(dateInfo) ? { date: parseDateForDB(dateInfo) } : {}),
        });

        invalidateRelatedQueries(queryClient, 'islem');
        invalidateRelatedQueries(queryClient, 'cari');
        if (options?.hesapId) invalidateRelatedQueries(queryClient, 'hesap');

        setSaveProgress({ total: 1, current: 1, currentItemName: '', phase: 'done' });
        return { productCount: 0, movementCount: 0 };
      }

      // ===== cari_borc_only: Only cari transaction (no products/movements) =====
      if (saveMode === 'cari_borc_only') {
        if (!invoice.supplierMatchCariId) {
          throw new Error('Cari seçimi zorunludur');
        }

        setSaveProgress({ total: 1, current: 0, currentItemName: '', phase: 'creating_movements' });

        const totalAmount = options?.editedGrandTotal
          ?? invoice.grandTotal
          ?? invoice.items.reduce((sum, item) => sum + item.totalPrice, 0);

        if (totalAmount <= 0) {
          throw new Error('Tutar girilmeden kaydedilemez');
        }

        await createCariTransaction(invoice, hareketTipi, totalAmount, invoiceRef, dateInfo, options?.hesapId);

        setSaveProgress({ total: 1, current: 1, currentItemName: '', phase: 'done' });
        return { productCount: 0, movementCount: 0 };
      }

      // ===== irsaliye_pending: Create products + stock movements, NO cari transaction =====
      if (saveMode === 'irsaliye_pending') {
        const itemsToSave = invoice.items.filter(item =>
          item.matchedUrunId || item.isNewConfirmed,
        );

        // Count new products to create (for accurate progress tracking)
        const newProductCount = itemsToSave.filter(
          item => item.matchTier === 'new' && item.isNewConfirmed && !item.matchedUrunId
        ).length;
        const total = newProductCount + itemsToSave.length; // Phase 1 (new products) + Phase 2 (all movements)
        let current = 0;
        let productCount = 0;
        let movementCount = 0;

        // Phase 1: Create new products
        setSaveProgress({ total, current, currentItemName: '', phase: 'creating_products' });

        for (const item of itemsToSave) {
          if (item.matchTier === 'new' && item.isNewConfirmed && !item.matchedUrunId) {
            current++;
            setSaveProgress({ total, current, currentItemName: item.name, phase: 'creating_products' });

            const newUrun = await createUrun.mutateAsync({
              ad: item.name,
              birim: item.unit || 'adet',
              miktar: 0,
              alis_fiyati: item.unitPrice,
              satis_fiyati: 0,
              kdv_orani: item.vatRate ?? 0,
              kategori_id: item.kategoriId,
            });

            item.matchedUrunId = newUrun.id;
            createdIds.current.urunIds.push(newUrun.id);
            productCount++;
          }
        }

        // Phase 2: Create stock movements (always giris for irsaliye)
        setSaveProgress({ total, current, currentItemName: '', phase: 'creating_movements' });

        for (const item of itemsToSave) {
          if (!item.matchedUrunId) continue;

          current++;
          setSaveProgress({ total, current, currentItemName: item.name, phase: 'creating_movements' });

          const aciklama = dateInfo
            ? `İrsaliye - ${invoiceRef} - Tarih: ${dateInfo}`
            : `İrsaliye - ${invoiceRef}`;

          const hareket = await createUrunHareket.mutateAsync({
            urun_id: item.matchedUrunId,
            hareket_tipi: 'giris', // İrsaliye always giris
            miktar: item.quantity,
            birim_fiyat: item.unitPrice,
            kdv_orani: item.vatRate,
            aciklama,
          });

          createdIds.current.hareketIds.push(hareket.id);
          movementCount++;
        }

        // Phase 3: Save irsaliye record (pending - no cari transaction)
        const totalAmount = itemsToSave.reduce((sum, item) => sum + item.totalPrice, 0);
        const itemSnapshots = itemsToSave.map(item => ({
          name: item.name,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          totalPrice: item.totalPrice,
          matchedUrunId: item.matchedUrunId,
        }));

        await createIrsaliyeRecord.mutateAsync({
          cari_id: invoice.supplierMatchCariId || null,
          tarih: dateInfo || new Date().toISOString().split('T')[0],
          toplam_tutar: totalAmount,
          belge_no: invoice.invoiceNumber || null,
          items: itemSnapshots,
          status: 'pending',
        });

        setSaveProgress({ total, current: total, currentItemName: '', phase: 'done' });
        invalidateRelatedQueries(queryClient, 'urun');

        return { productCount, movementCount };
      }

      // ===== stock_only / stock_and_cari: Create products + optionally movements =====
      const itemsToSave = invoice.items.filter(item =>
        item.matchedUrunId || item.isNewConfirmed,
      );

      // Calculate accurate total steps: new products + movements (if stock_and_cari)
      const newProductCountForTotal = itemsToSave.filter(
        item => item.matchTier === 'new' && item.isNewConfirmed && !item.matchedUrunId
      ).length;
      const total = saveMode === 'stock_and_cari'
        ? newProductCountForTotal + itemsToSave.length // Phase 1 + Phase 2
        : newProductCountForTotal || itemsToSave.length; // stock_only: just products
      let current = 0;
      let productCount = 0;
      let movementCount = 0;

      // Phase 1: Create new products
      setSaveProgress({ total, current, currentItemName: '', phase: 'creating_products' });

      for (const item of itemsToSave) {
        if (item.matchTier === 'new' && item.isNewConfirmed && !item.matchedUrunId) {
          current++;
          setSaveProgress({ total, current, currentItemName: item.name, phase: 'creating_products' });

          const newUrun = await createUrun.mutateAsync({
            ad: item.name,
            birim: item.unit || 'adet',
            miktar: 0,
            alis_fiyati: item.unitPrice,
            satis_fiyati: 0,
            kdv_orani: item.vatRate ?? 0,
            kategori_id: item.kategoriId,
          });

          item.matchedUrunId = newUrun.id;
          createdIds.current.urunIds.push(newUrun.id);
          productCount++;
        }
      }

      // Phase 2: Create urun movements (if stock_and_cari)
      if (saveMode === 'stock_and_cari') {
        setSaveProgress({ total, current, currentItemName: '', phase: 'creating_movements' });

        for (const item of itemsToSave) {
          if (!item.matchedUrunId) continue;

          current++;
          setSaveProgress({ total, current, currentItemName: item.name, phase: 'creating_movements' });

          const aciklama = dateInfo
            ? `OCR import - ${invoiceRef} - Tarih: ${dateInfo}`
            : `OCR import - ${invoiceRef}`;

          const hareket = await createUrunHareket.mutateAsync({
            urun_id: item.matchedUrunId,
            hareket_tipi: hareketTipi,
            miktar: item.quantity,
            birim_fiyat: item.unitPrice,
            kdv_orani: item.vatRate,
            aciklama,
          });

          createdIds.current.hareketIds.push(hareket.id);
          movementCount++;
        }

        // Phase 3: Create cari transaction
        if (invoice.supplierMatchCariId && movementCount > 0) {
          const totalAmount = itemsToSave.reduce((sum, item) => sum + item.totalPrice, 0);
          await createCariTransaction(invoice, hareketTipi, totalAmount, invoiceRef, dateInfo, options?.hesapId);
        }
      }

      setSaveProgress({ total, current: total, currentItemName: '', phase: 'done' });
      invalidateRelatedQueries(queryClient, 'urun');

      return { productCount, movementCount };
    } finally {
      setIsSaving(false);
    }
  }, [isletme, createUrun, createUrunHareket, createIslem, createIrsaliyeRecord, createCariTransaction, queryClient, sessionId, parseDateForDB]);

  // Save all unsaved invoices in batch
  const saveAll = useCallback(async (
    entries: MultiInvoiceEntry[],
    hareketTipi: UrunHareketTipi,
    onEntrySaved: (index: number) => void,
  ): Promise<{ totalProducts: number; totalMovements: number; savedCount: number }> => {
    let totalProducts = 0;
    let totalMovements = 0;
    let savedCount = 0;

    for (let i = 0; i < entries.length; i++) {
      if (entries[i].isSaved) continue;

      const entry = entries[i];
      const result = await saveImport(entry.invoice, entry.saveMode, hareketTipi, {
        hesapId: entry.selectedHesapId || undefined,
        kategoriId: entry.selectedKategoriId || undefined,
        editedGrandTotal: entry.editedGrandTotal,
      });
      totalProducts += result.productCount;
      totalMovements += result.movementCount;
      savedCount++;
      onEntrySaved(i);
    }

    return { totalProducts, totalMovements, savedCount };
  }, [saveImport]);

  return {
    processImage,
    processImages,
    saveImport,
    saveAll,
    matchCardToHesap,
    isProcessing,
    processingProgress,
    isSaving,
    saveProgress,
  };
}
