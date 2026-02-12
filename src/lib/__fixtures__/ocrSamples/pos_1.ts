import { OcrResult } from '@/types/ocrImport';

const text = `MARKET XYZ
ISTANBUL
FIS NO: 00045678
20.01.2024 14:35

EKMEK            *2,50
SUT 1LT          *15,75
YUMURTA 15LI     *52,00
PEYNIR 500GR     *89,90
DOMATES 1KG      *34,50
SALATALIK        *12,00
PATATES 2KG      *28,00
MAKARNA 500GR    *18,50

TOPLAM            253,15
NAKIT             300,00
PARA USTU          46,85`;

const lines = text.split('\n').filter(l => l.trim());

export const pos1OcrResult: OcrResult = {
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

export const pos1Expected = {
  documentType: 'fis' as const,
  grandTotal: 253.15,
  itemCount: 8,
  items: [
    { name: 'EKMEK', quantity: 1, totalPrice: 2.50 },
    { name: 'SUT 1LT', quantity: 1, totalPrice: 15.75 },
    { name: 'YUMURTA 15LI', quantity: 1, totalPrice: 52.00 },
    { name: 'PEYNIR 500GR', quantity: 1, totalPrice: 89.90 },
    { name: 'DOMATES 1KG', quantity: 1, totalPrice: 34.50 },
    { name: 'SALATALIK', quantity: 1, totalPrice: 12.00 },
    { name: 'PATATES 2KG', quantity: 1, totalPrice: 28.00 },
    { name: 'MAKARNA 500GR', quantity: 1, totalPrice: 18.50 },
  ],
};
