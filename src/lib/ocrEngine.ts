import * as FileSystem from 'expo-file-system/legacy';
import i18n from 'i18next';
import { supabase } from './supabase';
import { OcrParsedInvoice, OcrParsedItem, OcrDocumentType, VALID_DOCUMENT_TYPES, OcrPaymentInfo } from '@/types/ocrImport';
import { BirimType, KdvOrani } from '@/types/database';

/** Response shape from the parse-invoice Edge Function */
interface EdgeFunctionResponse {
  success: boolean;
  data?: {
    documentType: string;
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
    paymentInfo: {
      paymentMethod: string | null;
      cardLastFour: string | null;
      bankName: string | null;
    } | null;
    paidStatus: 'paid' | 'veresiye' | null;
    suggestedGiderCategory: string | null;
  };
  error?: string;
}

const VALID_UNITS: BirimType[] = [
  'adet', 'parca', 'cift', 'takim', 'kg', 'gram', 'ton',
  'lt', 'ml', 'm', 'm2', 'm3', 'cm', 'paket', 'kutu', 'koli', 'porsiyon',
];

/** Map of common unit variations from Gemini to standard BirimType */
const UNIT_ALIAS_MAP: Record<string, BirimType> = {
  'kg': 'kg', 'KG': 'kg', 'Kg': 'kg', 'kilo': 'kg', 'KILO': 'kg', 'kilogram': 'kg',
  'gr': 'gram', 'GR': 'gram', 'Gr': 'gram', 'g': 'gram', 'G': 'gram', 'gram': 'gram', 'GRAM': 'gram',
  'ton': 'ton', 'TON': 'ton', 'Ton': 'ton',
  'lt': 'lt', 'LT': 'lt', 'Lt': 'lt', 'l': 'lt', 'L': 'lt', 'litre': 'lt', 'LITRE': 'lt',
  'ml': 'ml', 'ML': 'ml', 'Ml': 'ml',
  'm': 'm', 'M': 'm', 'mt': 'm', 'MT': 'm', 'metre': 'm', 'METRE': 'm',
  'm2': 'm2', 'M2': 'm2',
  'm3': 'm3', 'M3': 'm3',
  'cm': 'cm', 'CM': 'cm', 'Cm': 'cm',
  'ad': 'adet', 'AD': 'adet', 'Ad': 'adet', 'adet': 'adet', 'ADET': 'adet', 'ADT': 'adet', 'adt': 'adet',
  'parca': 'parca', 'PARCA': 'parca', 'PRC': 'parca', 'prc': 'parca', 'parça': 'parca',
  'cift': 'cift', 'CIFT': 'cift', 'çift': 'cift', 'ÇİFT': 'cift', 'CFT': 'cift',
  'takim': 'takim', 'TAKIM': 'takim', 'TK': 'takim', 'tk': 'takim', 'takım': 'takim',
  'paket': 'paket', 'PAKET': 'paket', 'PKT': 'paket', 'pkt': 'paket', 'PK': 'paket', 'pk': 'paket',
  'kutu': 'kutu', 'KUTU': 'kutu', 'KT': 'kutu', 'kt': 'kutu',
  'koli': 'koli', 'KOLI': 'koli', 'KL': 'koli', 'kl': 'koli',
  'porsiyon': 'porsiyon', 'PORSIYON': 'porsiyon', 'PRS': 'porsiyon', 'prs': 'porsiyon',
};

/** Resolve unit from raw string to standard BirimType */
function resolveUnit(raw: string | null): BirimType | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // Direct alias match
  const mapped = UNIT_ALIAS_MAP[trimmed];
  if (mapped) return mapped;
  // Lowercase match
  const lower = trimmed.toLowerCase();
  const lowerMapped = UNIT_ALIAS_MAP[lower];
  if (lowerMapped) return lowerMapped;
  // Direct valid unit check
  if (VALID_UNITS.includes(lower as BirimType)) return lower as BirimType;
  return null;
}

const VALID_KDV_RATES: KdvOrani[] = [0, 1, 10, 20];

let idCounter = 0;
function generateId(): string {
  return `ocr_item_${Date.now()}_${++idCounter}`;
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
    // Network errors
    if (message.includes('fetch') || message.includes('network') || message.includes('Failed')) {
      throw new Error(i18n.t('ocrImport:messages.networkError'));
    }
    throw new Error(i18n.t('ocrImport:messages.analysisError', { message }));
  }

  console.log('[ocrEngine] Parsed response:', data?.success, data?.data?.items?.length, 'items');

  if (!data.success || !data.data) {
    console.error('[ocrEngine] Parse failed:', data.error);
    throw new Error(data.error || i18n.t('ocrImport:messages.analysisFailed'));
  }

  const parsed = data.data;

  // Map Edge Function response to OcrParsedInvoice
  const items: OcrParsedItem[] = parsed.items
    .filter(item => {
      // Filter out items with empty names or zero total price
      const name = (item.name || '').trim();
      if (!name || name.length === 0) return false;
      if (item.totalPrice <= 0 && item.unitPrice <= 0) return false;
      return true;
    })
    .map(item => {
      const resolvedUnit = resolveUnit(item.unit);
      let quantity = item.quantity > 0 ? item.quantity : 1;
      let unitPrice = item.unitPrice >= 0 ? item.unitPrice : 0;
      let totalPrice = item.totalPrice >= 0 ? item.totalPrice : 0;

      // Ensure price consistency
      if (totalPrice > 0 && unitPrice === 0 && quantity > 0) {
        unitPrice = Math.round((totalPrice / quantity) * 100) / 100;
      } else if (unitPrice > 0 && totalPrice === 0 && quantity > 0) {
        totalPrice = Math.round(quantity * unitPrice * 100) / 100;
      }

      return {
        id: generateId(),
        name: item.name.trim(),
        quantity,
        unitRaw: item.unit || '',
        unit: resolvedUnit,
        unitPrice,
        vatRate: (VALID_KDV_RATES.includes(item.vatRate as KdvOrani) ? item.vatRate : null) as KdvOrani | null,
        totalPrice,
        confidence: 0.95, // AI-based parsing has high confidence
        matchedUrunId: null,
        matchScore: 0,
        matchTier: 'new' as const,
        isNewConfirmed: false,
        kategoriId: null,
        rawLine: `${item.name} ${item.quantity}${item.unit ? ' ' + item.unit : ''} x ${item.unitPrice} = ${item.totalPrice}`,
        userEdited: false,
      };
    });

  // Validate document type
  const documentType: OcrDocumentType = VALID_DOCUMENT_TYPES.includes(parsed.documentType as OcrDocumentType)
    ? parsed.documentType as OcrDocumentType
    : 'unknown';

  // Map payment info
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

  // Map paid status
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
    currency: (['TRY', 'USD', 'EUR', 'GBP'].includes(parsed.currency || '') ? parsed.currency : null) as OcrParsedInvoice['currency'],
    items,
    subtotal: parsed.subtotal,
    vatTotal: parsed.vatTotal,
    grandTotal: parsed.grandTotal,
    rawText: `AI parsed: ${items.length} items`,
    paymentInfo,
    paidStatus,
    suggestedGiderCategory: parsed.suggestedGiderCategory || null,
  };
}
