import { Currency, BirimType, KdvOrani } from './database';

/** Step state for the multi-step import wizard */
export type OcrImportStep = 'capture' | 'processing' | 'invoice-list' | 'review' | 'saving' | 'done';

/** What kind of document the OCR detected */
export type OcrDocumentType = 'fatura' | 'irsaliye' | 'fis' | 'unknown';

/** Match quality tiers */
export type MatchTier = 'exact' | 'suggestion' | 'new';

/** Save mode choice */
export type OcrSaveMode = 'only_products' | 'products_and_movements';

/** Raw OCR result from the engine (abstraction over rn-mlkit-ocr) */
export interface OcrResult {
  text: string;
  blocks: OcrBlock[];
}

export interface OcrBlock {
  text: string;
  lines: OcrLine[];
}

export interface OcrLine {
  text: string;
  elements: OcrElement[];
}

export interface OcrElement {
  text: string;
}

/** A single product line extracted by the parser */
export interface OcrParsedItem {
  id: string;
  name: string;
  quantity: number;
  unitRaw: string;
  unit: BirimType | null;
  unitPrice: number;
  vatRate: KdvOrani | null;
  totalPrice: number;
  confidence: number;
  matchedUrunId: string | null;
  matchScore: number;
  matchTier: MatchTier;
  isNewConfirmed: boolean;
  kategoriId: string | null;
  rawLine: string;
  userEdited: boolean;
}

/** The full parsed invoice structure */
export interface OcrParsedInvoice {
  documentType: OcrDocumentType;
  supplierName: string | null;
  supplierTaxNumber: string | null;
  supplierMatchCariId: string | null;
  invoiceDate: string | null;
  invoiceNumber: string | null;
  currency: Currency | null;
  items: OcrParsedItem[];
  subtotal: number | null;
  vatTotal: number | null;
  grandTotal: number | null;
  rawText: string;
}

/** Import session for idempotency */
export interface OcrImportSession {
  sessionId: string;
  createdAt: string;
  imageUri: string;
  parsedInvoice: OcrParsedInvoice | null;
  saveMode: OcrSaveMode;
  isSaved: boolean;
  savedUrunIds: string[];
  savedHareketIds: string[];
}

/** A single invoice entry in the multi-invoice batch */
export interface MultiInvoiceEntry {
  id: string;
  imageUri: string;
  invoice: OcrParsedInvoice;
  invoiceDate: Date;
  saveMode: OcrSaveMode;
  isSaved: boolean;
}

/** Progress during batch OCR processing */
export interface OcrProcessingProgress {
  current: number;
  total: number;
}

/** Progress state during save */
export interface OcrSaveProgress {
  total: number;
  current: number;
  currentItemName: string;
  phase: 'creating_products' | 'creating_movements' | 'done';
}
