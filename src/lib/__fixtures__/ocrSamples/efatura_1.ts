import { OcrResult } from '@/types/ocrImport';

const text = `ABC GIDA SAN. VE TIC. LTD. STI.
V.D. KADIKOY VKN: 1234567890
E-FATURA
FATURA NO: FTR-2024-001234
TARIH: 15.01.2024

DOMATES SALCASI 5KG    3 AD    125,50    376,50
ZEYTINYAGI 5LT         2 AD    289,00    578,00
UN 25KG                1 AD    450,00    450,00
SEKER 50KG             1 AD    875,00    875,00
TUZLU TEREYAG 5KG      2 KG     95,50    191,00

ARA TOPLAM                              2.470,50
KDV %10                                   247,05
GENEL TOPLAM                            2.717,55`;

const lines = text.split('\n').filter(l => l.trim());

export const efatura1OcrResult: OcrResult = {
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

export const efatura1Expected = {
  documentType: 'fatura' as const,
  supplierName: 'ABC GIDA SAN. VE TIC. LTD. STI.',
  supplierTaxNumber: '1234567890',
  invoiceNumber: 'FTR-2024-001234',
  grandTotal: 2717.55,
  itemCount: 5,
  items: [
    { name: 'DOMATES SALCASI 5KG', quantity: 3, totalPrice: 376.50 },
    { name: 'ZEYTINYAGI 5LT', quantity: 2, totalPrice: 578.00 },
    { name: 'UN 25KG', quantity: 1, totalPrice: 450.00 },
    { name: 'SEKER 50KG', quantity: 1, totalPrice: 875.00 },
    { name: 'TUZLU TEREYAG 5KG', quantity: 2, totalPrice: 191.00 },
  ],
};
