import { useState, useCallback, useRef } from 'react';
import { Alert } from 'react-native';
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
import { supabase } from '@/lib/supabase';
import { recognizeInvoice, recognizeInvoicesBatch } from '@/lib/ocrEngine';
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
import i18n from '@/i18n';

export interface SaveImportOptions {
  hesapId?: string;
  kategoriId?: string;
  editedGrandTotal?: number | null;
  description?: string;
  imageUri?: string;
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

  // Process multiple images — use batch mode for 2+ images (single Gemini call)
  const processImages = useCallback(async (imageUris: string[]): Promise<OcrParsedInvoice[]> => {
    setIsProcessing(true);
    setProcessingProgress({ current: 0, total: imageUris.length });

    try {
      let results: OcrParsedInvoice[];

      if (imageUris.length <= 1) {
        // Single image — use direct call
        const parsed = await processImage(imageUris[0]);
        results = [parsed];
      } else {
        // Multiple images — use batch mode (single API call, avoids 429)
        setProcessingProgress({ current: 1, total: imageUris.length });
        const batchResults = await recognizeInvoicesBatch(imageUris);
        results = batchResults;

        // Apply supplier matching and product matching to each result
        for (const parsed of results) {
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

          if (existingProducts && existingProducts.length > 0) {
            parsed.items = matchItemsToProducts(
              parsed.items,
              existingProducts,
              urunAliases || undefined,
              parsed.supplierMatchCariId,
            );
          }
        }
      }

      setProcessingProgress({ current: imageUris.length, total: imageUris.length });

      for (let i = 0; i < results.length; i++) {
        const parsed = results[i];
        console.log(`[useOcrImport] Invoice ${i + 1}/${results.length}: ettn="${parsed.ettn}" invNo="${parsed.invoiceNumber}" supplier="${parsed.supplierName}" items=${parsed.items.length}`);
      }

      return results;
    } finally {
      setIsProcessing(false);
      setProcessingProgress(null);
    }
  }, [processImage, existingProducts, cariler, urunAliases, cariAliases]);

  // Helper: parse invoice date to DB format (fallback to today if parse fails)
  const parseDateForDB = useCallback((dateInfo: string): string => {
    if (dateInfo) {
      const parts = dateInfo.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (parts) {
        const d = new Date(parseInt(parts[1]), parseInt(parts[2]) - 1, parseInt(parts[3]), 12, 0, 0);
        return formatDateTimeForDB(d);
      }
    }
    // Fallback: bugunun tarihi (islemler.date NOT NULL constraint icin)
    return formatDateTimeForDB(new Date());
  }, []);

  // Helper: build description from invoice
  const buildOcrDescription = useCallback((invoiceNumber: string | null, dateInfo: string): string => {
    if (invoiceNumber) return `Fatura: ${invoiceNumber}`;
    if (dateInfo) return `Fatura: ${dateInfo}`;
    return '';
  }, []);

  // Helper: build cari transaction from invoice (returns islem ID)
  const createCariTransaction = useCallback(async (
    invoice: OcrParsedInvoice,
    hareketTipi: UrunHareketTipi,
    totalAmount: number,
    invoiceRef: string,
    dateInfo: string,
    hesapId?: string,
    kategoriId?: string | null,
  ): Promise<string> => {
    const islemType: IslemType = hareketTipi === 'giris' ? 'cari_alis' : 'cari_satis';
    const aciklama = buildOcrDescription(invoice.invoiceNumber, dateInfo);

    const newIslem = await createIslem.mutateAsync({
      type: islemType,
      amount: totalAmount,
      cari_id: invoice.supplierMatchCariId!,
      description: aciklama,
      ...(hesapId ? { hesap_id: hesapId } : {}),
      ...(kategoriId ? { kategori_id: kategoriId } : {}),
      date: parseDateForDB(dateInfo),
    });

    invalidateRelatedQueries(queryClient, 'islem');
    invalidateRelatedQueries(queryClient, 'cari');
    if (hesapId) invalidateRelatedQueries(queryClient, 'hesap');

    return newIslem.id;
  }, [createIslem, queryClient, parseDateForDB, buildOcrDescription]);

  // Helper: check for duplicate invoice
  const checkDuplicateInvoice = useCallback(async (
    invoiceNumber: string | null,
    cariId: string | null,
  ): Promise<boolean> => {
    if (!invoiceNumber || !isletme) return false;

    const query = supabase
      .from('islemler')
      .select('id')
      .eq('isletme_id', isletme.id)
      .ilike('description', `%${invoiceNumber}%`)
      .limit(1);

    if (cariId) {
      query.eq('cari_id', cariId);
    }

    const { data } = await query;
    return (data && data.length > 0) || false;
  }, [isletme]);

  // Save a single invoice
  const saveImport = useCallback(async (
    invoice: OcrParsedInvoice,
    saveMode: OcrSaveMode,
    hareketTipi: UrunHareketTipi,
    options?: SaveImportOptions,
  ): Promise<{ productCount: number; movementCount: number }> => {
    if (!isletme) throw new Error(i18n.t('common:errors.businessNotFound'));

    setIsSaving(true);

    // Her save öncesi createdIds'i temizle - önceki faturaların hareketlerinin karışmasını önler
    createdIds.current = { urunIds: [], hareketIds: [] };

    try {
      const invoiceRef = invoice.invoiceNumber || sessionId;
      const dateInfo = invoice.invoiceDate || '';

      // Mükerrer fatura kontrolü
      if (invoice.invoiceNumber) {
        const isDuplicate = await checkDuplicateInvoice(
          invoice.invoiceNumber,
          invoice.supplierMatchCariId || null,
        );
        if (isDuplicate) {
          const confirmed = await new Promise<boolean>((resolve) => {
            Alert.alert(
              'Mükerrer Fatura',
              `"${invoice.invoiceNumber}" numaralı fatura daha önce kaydedilmiş olabilir. Yine de kaydetmek istiyor musunuz?`,
              [
                { text: 'İptal', style: 'cancel', onPress: () => resolve(false) },
                { text: 'Kaydet', onPress: () => resolve(true) },
              ],
            );
          });
          if (!confirmed) {
            setIsSaving(false);
            return { productCount: 0, movementCount: 0 };
          }
        }
      }

      // ===== direct_gider: Create expense transaction =====
      if (saveMode === 'direct_gider') {
        if (!options?.hesapId) {
          throw new Error(i18n.t('common:errors.accountSelectionRequired'));
        }

        const totalAmount = options.editedGrandTotal
          ?? invoice.grandTotal
          ?? invoice.items.reduce((sum, item) => sum + item.totalPrice, 0);

        if (totalAmount <= 0) {
          throw new Error(i18n.t('common:errors.amountRequired'));
        }

        setSaveProgress({ total: 1, current: 0, currentItemName: '', phase: 'creating_movements' });

        const aciklama = options?.description || buildOcrDescription(invoice.invoiceNumber, dateInfo);

        const giderIslem = await createIslem.mutateAsync({
          type: 'gider',
          amount: totalAmount,
          hesap_id: options.hesapId,
          kategori_id: options.kategoriId || null,
          description: aciklama,
          date: parseDateForDB(dateInfo),
        });

        invalidateRelatedQueries(queryClient, 'islem');
        invalidateRelatedQueries(queryClient, 'hesap');

        setSaveProgress({ total: 1, current: 1, currentItemName: '', phase: 'done' });
        return { productCount: 0, movementCount: 0 };
      }

      // ===== cari_odeme_tahsilat: Create cari payment/collection =====
      if (saveMode === 'cari_odeme_tahsilat') {
        if (!invoice.supplierMatchCariId) {
          throw new Error(i18n.t('common:errors.clientSelectionRequired'));
        }

        setSaveProgress({ total: 1, current: 0, currentItemName: '', phase: 'creating_movements' });

        const totalAmount = options?.editedGrandTotal
          ?? invoice.grandTotal
          ?? invoice.items.reduce((sum, item) => sum + item.totalPrice, 0);

        if (totalAmount <= 0) {
          throw new Error(i18n.t('common:errors.amountRequired'));
        }

        const islemType: IslemType = hareketTipi === 'giris' ? 'cari_tahsilat' : 'cari_odeme';
        const aciklama = buildOcrDescription(invoice.invoiceNumber, dateInfo);

        const tahsilatIslem = await createIslem.mutateAsync({
          type: islemType,
          amount: totalAmount,
          cari_id: invoice.supplierMatchCariId,
          description: aciklama,
          ...(options?.hesapId ? { hesap_id: options.hesapId } : {}),
          date: parseDateForDB(dateInfo),
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
          throw new Error(i18n.t('common:errors.clientSelectionRequired'));
        }

        setSaveProgress({ total: 1, current: 0, currentItemName: '', phase: 'creating_movements' });

        const totalAmount = options?.editedGrandTotal
          ?? invoice.grandTotal
          ?? invoice.items.reduce((sum, item) => sum + item.totalPrice, 0);

        if (totalAmount <= 0) {
          throw new Error(i18n.t('common:errors.amountRequired'));
        }

        const borcIslemId = await createCariTransaction(invoice, hareketTipi, totalAmount, invoiceRef, dateInfo, options?.hesapId, options?.kategoriId || null);

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

          const aciklama = invoice.invoiceNumber
            ? `İrsaliye: ${invoice.invoiceNumber}`
            : (dateInfo ? `İrsaliye: ${dateInfo}` : '');

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

          const aciklama = buildOcrDescription(invoice.invoiceNumber, dateInfo);

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

        // Phase 3: Create cari transaction (KDV dahil grandTotal kullan)
        if (invoice.supplierMatchCariId && movementCount > 0) {
          const totalAmount = options?.editedGrandTotal
            ?? invoice.grandTotal
            ?? itemsToSave.reduce((sum, item) => sum + item.totalPrice, 0);

          // Sıfır tutarlı işlemlerde (irsaliye/sipariş fişi gibi) cari hareketi oluşturma
          // ama ürün hareketlerini kaydet - amount 0 olunca DB constraint hata verir
          // Kategori artık ürün bazlı raporlanıyor, islem'e kategori atamaya gerek yok
          if (totalAmount > 0) {
            const islemId = await createCariTransaction(invoice, hareketTipi, totalAmount, invoiceRef, dateInfo, options?.hesapId, null);

            // Link urun_hareketler to the created islem
            if (islemId && createdIds.current.hareketIds.length > 0) {
              await supabase
                .from('urun_hareketler')
                .update({ islem_id: islemId })
                .in('id', createdIds.current.hareketIds);
            }
          }
        }
      }

      setSaveProgress({ total, current: total, currentItemName: '', phase: 'done' });
      invalidateRelatedQueries(queryClient, 'urun');

      return { productCount, movementCount };
    } finally {
      setIsSaving(false);
    }
  }, [isletme, createUrun, createUrunHareket, createIslem, createIrsaliyeRecord, createCariTransaction, queryClient, sessionId, parseDateForDB, checkDuplicateInvoice, buildOcrDescription]);

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
        imageUri: entry.imageUri || undefined,
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
