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
  rateLimited?: boolean;
  dailyLimit?: number;
  remaining?: number;
}

/** Response shape from the parse-invoice Edge Function (batch mode) */
interface EdgeFunctionBatchResponse {
  success: boolean;
  data?: ParsedInvoiceData[];
  batch: true;
  error?: string;
  rateLimited?: boolean;
  dailyLimit?: number;
  remaining?: number;
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

/** Custom error class for our own daily rate limit (should NOT be retried) */
export class DailyRateLimitError extends Error {
  constructor(message: string, public dailyLimit: number, public remaining: number) {
    super(message);
    this.name = 'DailyRateLimitError';
  }
}

/** Retry wrapper with exponential backoff for Gemini 429 rate limit errors.
 *  Does NOT retry our own daily rate limits (DailyRateLimitError). */
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
): Promise<T> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      // Our own daily limit - don't retry, throw immediately
      if (err instanceof DailyRateLimitError) {
        throw err;
      }
      const message = err instanceof Error ? err.message : String(err);
      const is429 = message.includes('429') || message.includes('rate limit') || message.includes('Rate limit');
      if (is429 && attempt < maxRetries) {
        const delayMs = Math.pow(2, attempt + 1) * 1000; // 2s, 4s, 8s
        console.log(`[ocrEngine] Rate limit hit, retrying in ${delayMs}ms (attempt ${attempt + 1}/${maxRetries})...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
        lastError = err instanceof Error ? err : new Error(message);
        continue;
      }
      throw err;
    }
  }
  throw lastError;
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

  // Call the Edge Function with retry for 429
  const data = await withRetry<EdgeFunctionResponse>(async () => {
    console.log(`[ocrEngine] Calling parse-invoice edge function (image size: ${Math.round(base64.length / 1024)}KB)`);

    const result = await supabase.functions.invoke('parse-invoice', {
      body: { image: base64, mimeType },
    });

    console.log('[ocrEngine] Edge function response:', JSON.stringify(result.error || 'no error'), typeof result.data);

    // Supabase may put non-2xx responses in result.error or result.data
    const responseData = (result.data ?? result.error) as EdgeFunctionResponse;

    // Our own daily rate limit - throw special error (won't be retried)
    if (responseData?.rateLimited) {
      throw new DailyRateLimitError(
        responseData.error || i18n.t('common:errors.ocrDailyLimit', { limit: responseData.dailyLimit ?? 20 }),
        responseData.dailyLimit ?? 20,
        responseData.remaining ?? 0,
      );
    }

    if (result.error && !responseData?.rateLimited) {
      throw result.error;
    }

    // Gemini 429 - will be retried by withRetry
    if (!responseData.success && responseData.error?.includes('429')) {
      throw new Error(responseData.error);
    }

    return responseData;
  });

  console.log('[ocrEngine] Parsed response:', data?.success, data?.data?.items?.length, 'items');

  // Log debug info from edge function (rawColumns, tableRowNames, etc.)
  const debugInfo = (data as unknown as Record<string, unknown>)?._debug;
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

  const responseData = await withRetry<EdgeFunctionBatchResponse>(async () => {
    const result = await supabase.functions.invoke('parse-invoice', {
      body: { images },
    });

    // Supabase may put non-2xx responses in result.error or result.data
    const batchData = (result.data ?? result.error) as EdgeFunctionBatchResponse;

    // Our own daily rate limit - throw special error (won't be retried)
    if (batchData?.rateLimited) {
      throw new DailyRateLimitError(
        batchData.error || i18n.t('common:errors.ocrDailyLimit', { limit: batchData.dailyLimit ?? 20 }),
        batchData.dailyLimit ?? 20,
        batchData.remaining ?? 0,
      );
    }

    if (result.error && !batchData?.rateLimited) {
      throw result.error;
    }

    // Gemini 429 - will be retried by withRetry
    if (!batchData.success && batchData.error?.includes('429')) {
      throw new Error(batchData.error);
    }

    return batchData;
  });

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
