import { Currency, BirimType, KdvOrani } from './database';

/** Step state for the multi-step import wizard */
export type OcrImportStep = 'capture' | 'processing' | 'invoice-list' | 'review' | 'saving' | 'done';

/** What kind of document the OCR detected */
export type OcrDocumentType =
  | 'fatura' | 'irsaliye' | 'fis' | 'pos_fisi'
  | 'siparis_fisi' | 'tahsilat_makbuzu' | 'odeme_dekontu'
  | 'not' | 'unknown';

/** Match quality tiers */
export type MatchTier = 'exact' | 'suggestion' | 'new';

/** Save mode choice */
export type OcrSaveMode =
  | 'stock_and_cari'          // Urun + Stok + Cari Borc (fatura/siparis fisi)
  | 'stock_only'              // Sadece Urun + Stok (tutar olmadan not vb.)
  | 'cari_borc_only'          // Sadece Cari Borc (toplam var urun yok)
  | 'direct_gider'            // Direkt Gider -> hesap zorunlu (POS fisi vb.)
  | 'cari_odeme_tahsilat'     // Cari Odeme/Tahsilat (mevcut borcu kapat)
  | 'irsaliye_pending';       // Faz 3: Stok giris + cari beklemede

/** Payment info extracted from document */
export interface OcrPaymentInfo {
  paymentMethod: 'nakit' | 'kredi_karti' | 'banka' | null;
  cardLastFour: string | null;
  bankName: string | null; // Display-only info, not used for matching
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
  matchedAliasId?: string;
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
  paymentInfo: OcrPaymentInfo | null;
  paidStatus: 'paid' | 'veresiye' | null;
  suggestedGiderCategory: string | null;
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
  selectedHesapId: string | null;
  selectedKategoriId: string | null;
  editedGrandTotal: number | null;
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

/** Default configuration for each document type */
export interface DocumentTypeConfig {
  saveMode: OcrSaveMode;
  color: string;
  labelKey: string;
  icon: string;
}

/** Document type defaults map */
export const DOCUMENT_TYPE_DEFAULTS: Record<OcrDocumentType, DocumentTypeConfig> = {
  fatura:            { saveMode: 'stock_and_cari',      color: '#3b82f6', labelKey: 'docType.fatura',            icon: 'FileText' },
  irsaliye:          { saveMode: 'irsaliye_pending',     color: '#8b5cf6', labelKey: 'docType.irsaliye',          icon: 'Truck' },
  siparis_fisi:      { saveMode: 'stock_and_cari',      color: '#06b6d4', labelKey: 'docType.siparis_fisi',      icon: 'ClipboardList' },
  pos_fisi:          { saveMode: 'direct_gider',        color: '#ef4444', labelKey: 'docType.pos_fisi',          icon: 'CreditCard' },
  fis:               { saveMode: 'direct_gider',        color: '#f59e0b', labelKey: 'docType.fis',               icon: 'Receipt' },
  tahsilat_makbuzu:  { saveMode: 'cari_odeme_tahsilat', color: '#10b981', labelKey: 'docType.tahsilat_makbuzu',  icon: 'ArrowDownCircle' },
  odeme_dekontu:     { saveMode: 'cari_odeme_tahsilat', color: '#f97316', labelKey: 'docType.odeme_dekontu',     icon: 'ArrowUpCircle' },
  not:               { saveMode: 'stock_only',          color: '#6b7280', labelKey: 'docType.not',               icon: 'StickyNote' },
  unknown:           { saveMode: 'stock_and_cari',      color: '#9ca3af', labelKey: 'docType.unknown',           icon: 'HelpCircle' },
};

/** All valid document types for validation */
export const VALID_DOCUMENT_TYPES: OcrDocumentType[] = [
  'fatura', 'irsaliye', 'fis', 'pos_fisi', 'siparis_fisi',
  'tahsilat_makbuzu', 'odeme_dekontu', 'not', 'unknown',
];
