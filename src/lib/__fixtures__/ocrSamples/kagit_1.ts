import { OcrResult } from '@/types/ocrImport';

const text = `YILDIZ TOPTAN GIDA
Ataturk Cad. No:45 Ankara
Tel: 0312 456 78 90
VKN: 9876543210
V.D. CANKAYA

FATURA
Tarih: 05.02.2024
Fatura No: A-2024-0089

SUNFLOWER YAG 5LT
2 AD x 189,50               379,00
PIRINC BALDO 5KG
3 AD x 145,00               435,00
KIRMIZI MERCIMEK 5KG
2 AD x 125,00               250,00
NOHUT 5KG
1 AD x 110,00               110,00
BULGUR 5KG
2 AD x 85,00                170,00

ARA TOPLAM                 1.344,00
KDV %10                      134,40
GENEL TOPLAM               1.478,40`;

const lines = text.split('\n').filter(l => l.trim());

export const kagit1OcrResult: OcrResult = {
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

export const kagit1Expected = {
  documentType: 'fatura' as const,
  supplierName: 'YILDIZ TOPTAN GIDA',
  supplierTaxNumber: '9876543210',
  grandTotal: 1478.40,
  itemCount: 5,
  items: [
    { name: 'SUNFLOWER YAG 5LT', quantity: 2, totalPrice: 379.00 },
    { name: 'PIRINC BALDO 5KG', quantity: 3, totalPrice: 435.00 },
    { name: 'KIRMIZI MERCIMEK 5KG', quantity: 2, totalPrice: 250.00 },
    { name: 'NOHUT 5KG', quantity: 1, totalPrice: 110.00 },
    { name: 'BULGUR 5KG', quantity: 2, totalPrice: 170.00 },
  ],
};
