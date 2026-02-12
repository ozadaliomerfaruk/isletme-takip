import { OcrResult } from '@/types/ocrImport';

/**
 * Real-world e-Fatura format based on KIRMIZI ET style invoices.
 * Format: [name]    [quantity] [unit]    [unitPrice] TL    [total] TL
 * Some lines have KDV info: %1,00 or similar
 */
const text = `KIRMIZI ET GIDA SAN. VE TIC. A.S.
V.D. USKUDAR VKN: 9876543210
E-FATURA
FATURA NO: KET-2024-005678
TARIH: 20.01.2024

KUZU KOL    9,5 KG    720,00 TL    6.840,00 TL
KUZU BUT    12 KG    680,00 TL    8.160,00 TL
KUZU PIRZOLA    5 KG    950,00 TL    4.750,00 TL
DANA ANTRIKOT    8 KG    850,00 TL    6.800,00 TL
DANA KUSBASI    15 KG    620,00 TL    9.300,00 TL

ARA TOPLAM                              35.850,00 TL
KDV %1                                     358,50 TL
GENEL TOPLAM                            36.208,50 TL`;

const lines = text.split('\n').filter(l => l.trim());

export const efatura2OcrResult: OcrResult = {
  text,
  blocks: [
    {
      text,
      lines: lines.map(line => ({
        text: line,
        elements: line.split(/\s+/).map(word => ({ text: word })),
      })),
    },
  ],
};

export const efatura2Expected = {
  documentType: 'fatura' as const,
  supplierName: 'KIRMIZI ET GIDA SAN. VE TIC. A.S.',
  supplierTaxNumber: '9876543210',
  invoiceNumber: 'KET-2024-005678',
  grandTotal: 36208.50,
  itemCount: 5,
  items: [
    { name: 'KUZU KOL', quantity: 9.5, unitPrice: 720, totalPrice: 6840 },
    { name: 'KUZU BUT', quantity: 12, unitPrice: 680, totalPrice: 8160 },
    { name: 'KUZU PIRZOLA', quantity: 5, unitPrice: 950, totalPrice: 4750 },
    { name: 'DANA ANTRIKOT', quantity: 8, unitPrice: 850, totalPrice: 6800 },
    { name: 'DANA KUSBASI', quantity: 15, unitPrice: 620, totalPrice: 9300 },
  ],
};
