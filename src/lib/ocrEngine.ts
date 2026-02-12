import * as FileSystem from 'expo-file-system/legacy';
import i18n from 'i18next';
import { supabase } from './supabase';
import { OcrParsedInvoice, OcrParsedItem } from '@/types/ocrImport';
import { BirimType, KdvOrani } from '@/types/database';

/** Response shape from the parse-invoice Edge Function */
interface EdgeFunctionResponse {
  success: boolean;
  data?: {
    documentType: 'fatura' | 'irsaliye' | 'fis' | 'unknown';
    supplierName: string | null;
    supplierTaxNumber: string | null;
    invoiceDate: string | null;
    invoiceNumber: string | null;
    currency: string | null;
    items: Array<{
      name: string;
      quantity: number;
      unit: string | null;
      unitPrice: number;
      vatRate: number | null;
      totalPrice: number;
    }>;
    subtotal: number | null;
    vatTotal: number | null;
    grandTotal: number | null;
  };
  error?: string;
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

/**
 * Recognize and parse an invoice image using Gemini Flash 2.0 via Supabase Edge Function.
 * Replaces the old ML Kit OCR + regex parser pipeline with a single AI call.
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
    const result = await supabase.functions.invoke('parse-invoice', {
      body: { image: base64, mimeType },
    });

    if (result.error) {
      throw result.error;
    }

    data = result.data as EdgeFunctionResponse;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    // Network errors
    if (message.includes('fetch') || message.includes('network') || message.includes('Failed')) {
      throw new Error(i18n.t('ocrImport:messages.networkError'));
    }
    throw new Error(i18n.t('ocrImport:messages.analysisError', { message }));
  }

  if (!data.success || !data.data) {
    throw new Error(data.error || i18n.t('ocrImport:messages.analysisFailed'));
  }

  const parsed = data.data;

  // Map Edge Function response to OcrParsedInvoice
  const items: OcrParsedItem[] = parsed.items.map(item => ({
    id: generateId(),
    name: item.name,
    quantity: item.quantity,
    unitRaw: item.unit || '',
    unit: (VALID_UNITS.includes(item.unit as BirimType) ? item.unit : null) as BirimType | null,
    unitPrice: item.unitPrice,
    vatRate: (VALID_KDV_RATES.includes(item.vatRate as KdvOrani) ? item.vatRate : null) as KdvOrani | null,
    totalPrice: item.totalPrice,
    confidence: 0.95, // AI-based parsing has high confidence
    matchedUrunId: null,
    matchScore: 0,
    matchTier: 'new' as const,
    isNewConfirmed: false,
    kategoriId: null,
    rawLine: `${item.name} ${item.quantity} ${item.unit || ''} ${item.unitPrice} ${item.totalPrice}`,
    userEdited: false,
  }));

  return {
    documentType: parsed.documentType,
    supplierName: parsed.supplierName,
    supplierTaxNumber: parsed.supplierTaxNumber,
    supplierMatchCariId: null,
    invoiceDate: parsed.invoiceDate,
    invoiceNumber: parsed.invoiceNumber,
    currency: (['TRY', 'USD', 'EUR', 'GBP'].includes(parsed.currency || '') ? parsed.currency : null) as OcrParsedInvoice['currency'],
    items,
    subtotal: parsed.subtotal,
    vatTotal: parsed.vatTotal,
    grandTotal: parsed.grandTotal,
    rawText: `AI parsed: ${items.length} items`,
  };
}
