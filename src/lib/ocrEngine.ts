import { OcrResult } from '@/types/ocrImport';

/**
 * OCR engine abstraction.
 * Currently returns mock data for build-free development.
 * Will be replaced with rn-mlkit-ocr in Phase D.
 */

const USE_MOCK = __DEV__;

/**
 * Recognize text from an image URI.
 */
export async function recognizeText(_imageUri: string): Promise<OcrResult> {
  if (USE_MOCK) {
    // Simulate processing delay
    await new Promise(resolve => setTimeout(resolve, 1500));
    return getMockOcrResult();
  }

  // Phase D: real OCR implementation
  // const MlkitOcr = require('rn-mlkit-ocr').default;
  // const result = await MlkitOcr.detectFromUri(imageUri);
  // return mapMlkitResult(result);
  throw new Error('Real OCR not yet implemented. Run EAS build with rn-mlkit-ocr.');
}

function getMockOcrResult(): OcrResult {
  const lines = MOCK_OCR_TEXT.split('\n').filter(l => l.trim());

  return {
    text: MOCK_OCR_TEXT,
    blocks: [
      {
        text: MOCK_OCR_TEXT,
        lines: lines.map(line => ({
          text: line,
          elements: line.split(/\s+/).map(word => ({ text: word })),
        })),
      },
    ],
  };
}

const MOCK_OCR_TEXT = `KIRMIZI ET GIDA SAN. VE TIC. A.S.
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
