import { OcrResult } from '@/types/ocrImport';
import MlkitOcr from 'rn-mlkit-ocr';

/**
 * Recognize text from an image URI using Google ML Kit on-device OCR.
 */
export async function recognizeText(imageUri: string): Promise<OcrResult> {
  const result = await MlkitOcr.recognizeText(imageUri, 'latin');

  return {
    text: result.text,
    blocks: result.blocks.map(block => ({
      text: block.text,
      lines: block.lines.map(line => ({
        text: line.text,
        elements: line.elements.map(el => ({ text: el.text })),
      })),
    })),
  };
}
