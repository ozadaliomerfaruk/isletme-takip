import { useState, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthContext } from '@/contexts/AuthContext';
import { useCreateUrun, useUrunler } from '@/hooks/useUrunler';
import { useCreateUrunHareket } from '@/hooks/useUrunHareketler';
import { useCreateIslem } from '@/hooks/useIslemler';
import { useCariler } from '@/hooks/useCariler';
import { invalidateRelatedQueries } from '@/lib/queryKeys';
import { recognizeText } from '@/lib/ocrEngine';
import { parseInvoice } from '@/lib/invoiceParser';
import { matchItemsToProducts, matchSupplier } from '@/lib/fuzzyMatch';
import { formatDateTimeForDB } from '@/lib/date';
import {
  OcrParsedInvoice,
  OcrSaveMode,
  OcrSaveProgress,
  OcrProcessingProgress,
  MultiInvoiceEntry,
} from '@/types/ocrImport';
import { UrunHareketTipi, IslemType } from '@/types/database';

export function useOcrImport(sessionId: string) {
  const queryClient = useQueryClient();
  const { isletme } = useAuthContext();
  const createUrun = useCreateUrun();
  const createUrunHareket = useCreateUrunHareket();
  const createIslem = useCreateIslem();

  const { data: existingProducts } = useUrunler();
  const { data: cariler } = useCariler();

  const [isProcessing, setIsProcessing] = useState(false);
  const [processingProgress, setProcessingProgress] = useState<OcrProcessingProgress | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveProgress, setSaveProgress] = useState<OcrSaveProgress | null>(null);

  const createdIds = useRef<{ urunIds: string[]; hareketIds: string[] }>({
    urunIds: [],
    hareketIds: [],
  });

  // Process a single image
  const processImage = useCallback(async (imageUri: string): Promise<OcrParsedInvoice> => {
    const ocrResult = await recognizeText(imageUri);
    const parsed = parseInvoice(ocrResult);

    if (existingProducts && existingProducts.length > 0) {
      parsed.items = matchItemsToProducts(parsed.items, existingProducts);
    }

    if (cariler && cariler.length > 0) {
      const matchedCariId = matchSupplier(
        parsed.supplierName,
        parsed.supplierTaxNumber,
        cariler,
      );
      if (matchedCariId) {
        parsed.supplierMatchCariId = matchedCariId;
      }
    }

    return parsed;
  }, [existingProducts, cariler]);

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

  // Helper: build cari transaction from invoice
  const createCariTransaction = useCallback(async (
    invoice: OcrParsedInvoice,
    hareketTipi: UrunHareketTipi,
    totalAmount: number,
    invoiceRef: string,
    dateInfo: string,
  ) => {
    const islemType: IslemType = hareketTipi === 'giris' ? 'cari_alis' : 'cari_satis';
    const aciklama = dateInfo
      ? `OCR import - ${invoiceRef} - Tarih: ${dateInfo}`
      : `OCR import - ${invoiceRef}`;

    let islemDate: string | undefined;
    if (dateInfo) {
      const parts = dateInfo.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (parts) {
        const d = new Date(parseInt(parts[1]), parseInt(parts[2]) - 1, parseInt(parts[3]), 12, 0, 0);
        islemDate = formatDateTimeForDB(d);
      }
    }

    await createIslem.mutateAsync({
      type: islemType,
      amount: totalAmount,
      cari_id: invoice.supplierMatchCariId!,
      description: aciklama,
      ...(islemDate ? { date: islemDate } : {}),
    });

    invalidateRelatedQueries(queryClient, 'islem');
    invalidateRelatedQueries(queryClient, 'cari');
  }, [createIslem, queryClient]);

  // Save a single invoice
  const saveImport = useCallback(async (
    invoice: OcrParsedInvoice,
    saveMode: OcrSaveMode,
    hareketTipi: UrunHareketTipi,
  ): Promise<{ productCount: number; movementCount: number }> => {
    if (!isletme) throw new Error('No business context');

    setIsSaving(true);

    try {
      const invoiceRef = invoice.invoiceNumber || sessionId;
      const dateInfo = invoice.invoiceDate || '';

      // Only cari transaction mode: skip products/movements entirely
      if (saveMode === 'only_cari_transaction') {
        if (!invoice.supplierMatchCariId) {
          throw new Error('Cari seçimi zorunludur');
        }

        setSaveProgress({ total: 1, current: 0, currentItemName: '', phase: 'creating_movements' });

        const totalAmount = invoice.grandTotal
          || invoice.items.reduce((sum, item) => sum + item.totalPrice, 0);

        await createCariTransaction(invoice, hareketTipi, totalAmount, invoiceRef, dateInfo);

        setSaveProgress({ total: 1, current: 1, currentItemName: '', phase: 'done' });
        return { productCount: 0, movementCount: 0 };
      }

      const itemsToSave = invoice.items.filter(item =>
        item.matchedUrunId || item.isNewConfirmed,
      );

      const total = itemsToSave.length;
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

      // Phase 2: Create urun movements (if requested)
      if (saveMode === 'products_and_movements') {
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
          await createCariTransaction(invoice, hareketTipi, totalAmount, invoiceRef, dateInfo);
        }
      }

      setSaveProgress({ total, current: total, currentItemName: '', phase: 'done' });
      invalidateRelatedQueries(queryClient, 'urun');

      return { productCount, movementCount };
    } finally {
      setIsSaving(false);
    }
  }, [isletme, createUrun, createUrunHareket, createCariTransaction, queryClient, sessionId]);

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

      const result = await saveImport(entries[i].invoice, entries[i].saveMode, hareketTipi);
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
    isProcessing,
    processingProgress,
    isSaving,
    saveProgress,
  };
}
