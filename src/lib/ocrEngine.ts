import * as FileSystem from 'expo-file-system/legacy';
import i18n from 'i18next';
import { supabase } from './supabase';
import { OcrParsedInvoice, OcrParsedItem, OcrDocumentType, VALID_DOCUMENT_TYPES, OcrPaymentInfo } from '@/types/ocrImport';
import { BirimType, KdvOrani } from '@/types/database';

/** Single invoice data shape from the Edge Function */
interface ParsedInvoiceData {
  documentType: string;
  supplierName: string | null;
  supplierTaxNumber: string | null;
  invoiceDate: string | null;
  invoiceNumber: string | null;
  ettn: string | null;
  currency: string | null;
  items: Array<{
    name: string;
    quantity: number;
    unit: string | null;
    unitPrice: number;
    vatRate: number | null;
    totalPrice: number;
    needsReview?: boolean;
  }>;
  subtotal: number | null;
  vatTotal: number | null;
  grandTotal: number | null;
  supplierBalance: number | null;
  paymentInfo: {
    paymentMethod: string | null;
    cardLastFour: string | null;
    bankName: string | null;
  } | null;
  paidStatus: 'paid' | 'veresiye' | null;
  suggestedGiderCategory: string | null;
}

/** Response shape from the parse-invoice Edge Function (single image) */
interface EdgeFunctionResponse {
  success: boolean;
  data?: ParsedInvoiceData;
  error?: string;
}

/** Response shape from the parse-invoice Edge Function (batch mode) */
interface EdgeFunctionBatchResponse {
  success: boolean;
  data?: ParsedInvoiceData[];
  batch: true;
  error?: string;
  debug?: Array<{
    index: number;
    ettn: string | null;
    invoiceNumber: string | null;
    supplierName: string | null;
    date: string | null;
    itemCount: number;
    grandTotal: number | null;
    missingRowWarning?: Record<string, unknown>;
  }>;
}

const VALID_UNITS: BirimType[] = [
  'adet', 'parca', 'cift', 'takim', 'kg', 'gram', 'ton',
  'lt', 'ml', 'm', 'm2', 'm3', 'cm', 'paket', 'kutu', 'koli', 'porsiyon',
];

const VALID_KDV_RATES: KdvOrani[] = [0, 1, 10, 20];

let idCounter = 0;
function generateId(): string {
  return `ocr_item_${Date.now()}_${++idCounter}`;
}

/** Map parsed data from edge function to OcrParsedInvoice */
function mapParsedDataToInvoice(parsed: ParsedInvoiceData): OcrParsedInvoice {
  const items: OcrParsedItem[] = parsed.items.map(item => ({
    id: generateId(),
    name: item.name,
    quantity: item.quantity,
    unitRaw: item.unit || '',
    unit: (VALID_UNITS.includes(item.unit as BirimType) ? item.unit : null) as BirimType | null,
    unitPrice: item.unitPrice,
    vatRate: (VALID_KDV_RATES.includes(item.vatRate as KdvOrani) ? item.vatRate : null) as KdvOrani | null,
    totalPrice: item.totalPrice,
    confidence: item.needsReview ? 0.3 : 0.95,
    matchedUrunId: null,
    matchScore: 0,
    matchTier: 'new' as const,
    isNewConfirmed: false,
    kategoriId: null,
    rawLine: `${item.name} ${item.quantity} ${item.unit || ''} ${item.unitPrice} ${item.totalPrice}`,
    userEdited: false,
    needsReview: item.needsReview || false,
  }));

  const documentType: OcrDocumentType = VALID_DOCUMENT_TYPES.includes(parsed.documentType as OcrDocumentType)
    ? parsed.documentType as OcrDocumentType
    : 'unknown';

  const paymentInfo: OcrPaymentInfo | null = parsed.paymentInfo
    ? {
        paymentMethod: (['nakit', 'kredi_karti', 'banka'] as const).includes(
          parsed.paymentInfo.paymentMethod as 'nakit' | 'kredi_karti' | 'banka'
        )
          ? parsed.paymentInfo.paymentMethod as OcrPaymentInfo['paymentMethod']
          : null,
        cardLastFour: parsed.paymentInfo.cardLastFour || null,
        bankName: parsed.paymentInfo.bankName || null,
      }
    : null;

  const paidStatus = (['paid', 'veresiye'] as const).includes(parsed.paidStatus as 'paid' | 'veresiye')
    ? parsed.paidStatus as 'paid' | 'veresiye'
    : null;

  return {
    documentType,
    supplierName: parsed.supplierName,
    supplierTaxNumber: parsed.supplierTaxNumber,
    supplierMatchCariId: null,
    invoiceDate: parsed.invoiceDate,
    invoiceNumber: parsed.invoiceNumber,
    ettn: parsed.ettn || null,
    currency: (['TRY', 'USD', 'EUR', 'GBP'].includes(parsed.currency || '') ? parsed.currency : null) as OcrParsedInvoice['currency'],
    items,
    subtotal: parsed.subtotal,
    vatTotal: parsed.vatTotal,
    grandTotal: parsed.grandTotal,
    supplierBalance: parsed.supplierBalance ?? null,
    rawText: `AI parsed: ${items.length} items`,
    paymentInfo,
    paidStatus,
    suggestedGiderCategory: parsed.suggestedGiderCategory || null,
  };
}

/**
 * Recognize and parse an invoice image using Gemini Flash 2.0 via Supabase Edge Function.
 */
export async function recognizeInvoice(imageUri: string): Promise<OcrParsedInvoice> {
  // Read image as base64
  const base64 = await FileSystem.readAsStringAsync(imageUri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  // Detect mime type from URI
  const extension = imageUri.split('.').pop()?.toLowerCase();
  const mimeType = extension === 'png' ? 'image/png' : 'image/jpeg';

  // Call the Edge Function
  let data: EdgeFunctionResponse;
  try {
    console.log(`[ocrEngine] Calling parse-invoice edge function (image size: ${Math.round(base64.length / 1024)}KB)`);

    const result = await supabase.functions.invoke('parse-invoice', {
      body: { image: base64, mimeType },
    });

    console.log('[ocrEngine] Edge function response:', JSON.stringify(result.error || 'no error'), typeof result.data);

    if (result.error) {
      throw result.error;
    }

    data = result.data as EdgeFunctionResponse;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[ocrEngine] Edge function error:', message);
    if (message.includes('fetch') || message.includes('network') || message.includes('Failed')) {
      throw new Error(i18n.t('ocrImport:messages.networkError'));
    }
    throw new Error(i18n.t('ocrImport:messages.analysisError', { message }));
  }

  console.log('[ocrEngine] Parsed response:', data?.success, data?.data?.items?.length, 'items');

  // Log debug info from edge function (rawColumns, tableRowNames, etc.)
  const debugInfo = (data as Record<string, unknown>)?._debug;
  if (debugInfo) {
    console.log('[ocrEngine] EDGE DEBUG:', JSON.stringify(debugInfo));
  }

  if (!data.success || !data.data) {
    console.error('[ocrEngine] Parse failed:', data.error);
    throw new Error(data.error || i18n.t('ocrImport:messages.analysisFailed'));
  }

  return mapParsedDataToInvoice(data.data);
}

/**
 * Recognize and parse MULTIPLE invoice images in a single Gemini call.
 * Gemini sees all images at once and can properly merge multi-page invoices.
 * Returns an array of unique invoices (pages already merged by Gemini).
 */
export async function recognizeInvoicesBatch(imageUris: string[]): Promise<OcrParsedInvoice[]> {
  if (imageUris.length === 0) return [];
  if (imageUris.length === 1) return [await recognizeInvoice(imageUris[0])];

  // Read all images as base64
  const images: Array<{ image: string; mimeType: string }> = [];
  for (const uri of imageUris) {
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const extension = uri.split('.').pop()?.toLowerCase();
    const mimeType = extension === 'png' ? 'image/png' : 'image/jpeg';
    images.push({ image: base64, mimeType });
  }

  console.log(`[ocrEngine] BATCH: Sending ${images.length} images to parse-invoice in single call`);

  let responseData: EdgeFunctionBatchResponse;
  try {
    const result = await supabase.functions.invoke('parse-invoice', {
      body: { images },
    });

    if (result.error) {
      throw result.error;
    }

    responseData = result.data as EdgeFunctionBatchResponse;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[ocrEngine] Batch edge function error:', message);
    if (message.includes('fetch') || message.includes('network') || message.includes('Failed')) {
      throw new Error(i18n.t('ocrImport:messages.networkError'));
    }
    throw new Error(i18n.t('ocrImport:messages.analysisError', { message }));
  }

  if (!responseData.success || !responseData.data) {
    console.error('[ocrEngine] Batch parse failed:', responseData.error);
    throw new Error(responseData.error || i18n.t('ocrImport:messages.analysisFailed'));
  }

  // Log debug info from edge function
  if (responseData.debug) {
    console.log(`[ocrEngine] BATCH DEBUG: Gemini returned ${responseData.debug.length} invoice(s):`);
    for (const d of responseData.debug) {
      console.log(`[ocrEngine]   invoice[${d.index}]: ettn="${d.ettn}" invNo="${d.invoiceNumber}" supplier="${d.supplierName}" date="${d.date}" items=${d.itemCount} total=${d.grandTotal}${d.missingRowWarning ? ' ⚠️ MISSING ROWS' : ''}`);
    }
  }

  const invoices = responseData.data.map(d => mapParsedDataToInvoice(d));
  console.log(`[ocrEngine] BATCH RESULT: ${imageUris.length} images → ${invoices.length} invoices`);

  return invoices;
}
