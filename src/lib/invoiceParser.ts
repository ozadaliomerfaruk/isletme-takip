import {
  OcrParsedInvoice,
  OcrParsedItem,
  OcrResult,
  OcrDocumentType,
} from '@/types/ocrImport';
import {
  normalizeTurkish,
  parseTrNumber,
  extractNumbers,
  detectUnit,
  detectKdvRate,
  mergeFragmentedLines,
  UNIT_MAP,
} from './turkishTextUtils';
import { BirimType } from '@/types/database';

let idCounter = 0;
function generateId(): string {
  return `ocr_item_${Date.now()}_${++idCounter}`;
}

// --- Scoring constants ---

const HEADER_KEYWORDS = [
  'FATURA', 'E-FATURA', 'E FATURA', 'VKN', 'TCKN', 'V.D.', 'VERGI DAIRESI',
  'TARIH', 'SAAT', 'FIS NO', 'FATURA NO', 'IRSALIYE', 'BELGE NO',
  'TEL', 'TELEFON', 'ADRES', 'MAIL', 'WEB', 'MERSIS',
];

const FOOTER_KEYWORDS = [
  'TOPLAM', 'ARA TOPLAM', 'GENEL TOPLAM', 'KDV TOPLAM',
  'NAKIT', 'KREDI KARTI', 'YEKUN', 'INDIRIM', 'ISKONTO',
  'PARA USTU', 'ALINAN', 'ODENEN', 'NET TUTAR', 'TAHSILAT',
  'KDV %',
];

const PRODUCT_LINE_THRESHOLD = 2;

/**
 * Score a single line for how likely it is to be a product line.
 * Higher = more likely product line.
 */
export function scoreLine(line: string): number {
  const upper = normalizeTurkish(line).toUpperCase();
  const originalUpper = line.toUpperCase().trim();
  let score = 0;

  // Negative signals: header/footer
  for (const kw of HEADER_KEYWORDS) {
    if (originalUpper.includes(kw)) {
      score -= 5;
      break;
    }
  }
  for (const kw of FOOTER_KEYWORDS) {
    if (originalUpper.includes(kw)) {
      score -= 5;
      break;
    }
  }

  const tokens = originalUpper.split(/\s+/);

  // +3: Contains a recognized unit
  const hasUnit = tokens.some(t => UNIT_MAP[t] !== undefined);
  if (hasUnit) score += 3;

  // +2: Contains a number
  const numbers = extractNumbers(line);
  if (numbers.length > 0) score += 2;

  // +2: Contains KDV reference
  if (detectKdvRate(originalUpper) !== null) score += 2;

  // +1: Multiple numeric values (quantity + price pattern)
  if (numbers.length >= 2) score += 1;

  // +1: Contains multiplication sign
  if (/\bx\b/i.test(originalUpper) || originalUpper.includes('*')) score += 1;

  // -5: Line starts with "KDV" (standalone tax line, not a product)
  if (/^\s*KDV\b/i.test(originalUpper)) score -= 5;

  // -3: Very short line (< 5 non-digit characters)
  const nonDigitChars = line.replace(/[\d\s.,]/g, '');
  if (nonDigitChars.length < 5 && numbers.length <= 1) score -= 3;

  return score;
}

/**
 * Try to find a unit token in the line and extract it.
 */
function findUnitInLine(tokens: string[]): { unit: BirimType | null; unitRaw: string; unitIndex: number } {
  for (let i = 0; i < tokens.length; i++) {
    const unit = detectUnit(tokens[i]);
    if (unit) {
      return { unit, unitRaw: tokens[i], unitIndex: i };
    }
  }
  // Check for number+unit combo like "5KG", "500GR"
  for (let i = 0; i < tokens.length; i++) {
    const match = tokens[i].match(/^(\d+(?:[.,]\d+)?)\s*([A-Za-zÇçĞğİıÖöŞşÜü]+)$/);
    if (match) {
      const unit = detectUnit(match[2]);
      if (unit) {
        return { unit, unitRaw: match[2], unitIndex: i };
      }
    }
  }
  return { unit: null, unitRaw: '', unitIndex: -1 };
}

/**
 * Extract "data numbers" from a line — numbers that represent quantity, price, total.
 * Skips numbers that are embedded in product name tokens (e.g., "5" from "5KG", "25" from "25KG").
 * Returns { dataNumbers, nameEndIndex } where nameEndIndex is the position where
 * the product name ends and data columns begin.
 */
function extractDataNumbers(trimmed: string, tokens: string[]): {
  dataNumbers: number[];
  nameEndIndex: number;
} {
  // Find where the "data columns" start by identifying the first standalone number token
  // (not part of a number+unit combo like "5KG", "5LT", "25KG", "50KG")
  let dataStartTokenIndex = -1;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];

    // Check if this token is a number+unit combo (part of product name)
    const comboMatch = token.match(/^(\d+(?:[.,]\d+)?)\s*([A-Za-zÇçĞğİıÖöŞşÜü]+)$/);
    if (comboMatch && detectUnit(comboMatch[2])) {
      // This is a name token like "5KG" — skip it
      continue;
    }

    // Check if this is a standalone number (possibly followed by a unit token)
    const isNumber = /^\d+(?:[.,]\d+)?$/.test(token);
    if (isNumber) {
      // Check if next token is a unit — that makes this a [quantity] [unit] pattern (data column)
      const nextToken = i + 1 < tokens.length ? tokens[i + 1] : null;
      const nextIsUnit = nextToken ? detectUnit(nextToken) !== null : false;

      // Check if this number is part of the product name or a data column
      // A data number is: followed by a unit, or is in the latter half of the line,
      // or there are more numbers after it (price columns)
      if (nextIsUnit || i >= tokens.length / 2 || hasMoreNumbersAfter(tokens, i)) {
        dataStartTokenIndex = i;
        break;
      }
    }
  }

  if (dataStartTokenIndex === -1) {
    // No clear data columns found — fall back to extractNumbers on entire line
    return { dataNumbers: extractNumbers(trimmed), nameEndIndex: trimmed.search(/\d/) };
  }

  // Calculate nameEndIndex as the character position where data columns start
  const nameTokens = tokens.slice(0, dataStartTokenIndex);
  const namePart = nameTokens.join(' ');
  const nameEndIndex = namePart.length > 0
    ? trimmed.indexOf(tokens[dataStartTokenIndex])
    : 0;

  // Extract numbers only from the data portion
  const dataPortion = trimmed.substring(nameEndIndex);
  const dataNumbers = extractNumbers(dataPortion);

  return { dataNumbers, nameEndIndex };
}

/** Check if there are more numeric tokens after position i */
function hasMoreNumbersAfter(tokens: string[], i: number): boolean {
  for (let j = i + 1; j < tokens.length; j++) {
    if (/^\d+(?:[.,]\d+)?$/.test(tokens[j]) || /^\d{1,3}(?:\.\d{3})+(?:,\d{2})?$/.test(tokens[j])) {
      return true;
    }
  }
  return false;
}

/**
 * Parse a single product line into an OcrParsedItem.
 * Returns null if the line cannot be parsed as a product.
 */
export function parseProductLine(
  line: string,
): Omit<OcrParsedItem, 'id' | 'matchedUrunId' | 'matchScore' | 'matchTier' | 'isNewConfirmed' | 'userEdited'> | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  const allNumbers = extractNumbers(trimmed);
  if (allNumbers.length === 0) return null;

  const tokens = trimmed.split(/\s+/);
  const { unit, unitRaw } = findUnitInLine(tokens);
  const vatRate = detectKdvRate(trimmed);

  // Use smart data number extraction that skips name-embedded numbers
  const { dataNumbers, nameEndIndex } = extractDataNumbers(trimmed, tokens);

  // Strategy 1: Structured pattern — [name] [quantity] [unit] [unitPrice] [total]
  if (dataNumbers.length >= 3) {
    // Try all number pairs (i, last) where quantity * unitPrice ≈ total
    const totalPrice = dataNumbers[dataNumbers.length - 1];

    for (let qi = 0; qi < dataNumbers.length - 1; qi++) {
      const quantity = dataNumbers[qi];
      // Try each subsequent number as unitPrice
      for (let pi = qi + 1; pi < dataNumbers.length - 1; pi++) {
        const unitPrice = dataNumbers[pi];
        const computed = quantity * unitPrice;
        const isConsistent = Math.abs(computed - totalPrice) / Math.max(totalPrice, 1) < 0.05;

        if (isConsistent) {
          const name = trimmed.substring(0, nameEndIndex).trim();
          return {
            name: name || trimmed.split(/\s+/).slice(0, -3).join(' ') || trimmed,
            quantity,
            unitRaw,
            unit,
            unitPrice,
            vatRate,
            totalPrice,
            confidence: 0.9,
            kategoriId: null,
            rawLine: trimmed,
          };
        }
      }
    }

    // Fallback: quantity = first, unitPrice = second-to-last, total = last
    const quantity = dataNumbers[0];
    const unitPrice = dataNumbers[dataNumbers.length - 2];
    const computed = quantity * unitPrice;
    const isConsistent = Math.abs(computed - totalPrice) / Math.max(totalPrice, 1) < 0.10;

    if (isConsistent) {
      const name = trimmed.substring(0, nameEndIndex).trim();
      return {
        name: name || trimmed,
        quantity,
        unitRaw,
        unit,
        unitPrice,
        vatRate,
        totalPrice,
        confidence: 0.8,
        kategoriId: null,
        rawLine: trimmed,
      };
    }
  }

  // Strategy 2: Multiplication pattern — [name] [quantity] x [unitPrice]
  const multMatch = trimmed.match(/^(.+?)\s+(\d+(?:[.,]\d+)?)\s*[xX*]\s*(\d+(?:[.,]\d+)?)/);
  if (multMatch) {
    const name = multMatch[1].trim();
    const quantity = parseTrNumber(multMatch[2]) ?? 1;
    const unitPrice = parseTrNumber(multMatch[3]) ?? 0;
    const totalPrice = quantity * unitPrice;

    return {
      name,
      quantity,
      unitRaw,
      unit,
      unitPrice,
      vatRate,
      totalPrice,
      confidence: 0.85,
      kategoriId: null,
      rawLine: trimmed,
    };
  }

  // Strategy 3: Two data numbers — [name] [quantity] [total]
  if (dataNumbers.length === 2) {
    const name = trimmed.substring(0, nameEndIndex).trim();

    if (name.length >= 2) {
      const quantity = dataNumbers[0];
      const totalPrice = dataNumbers[1];
      const unitPrice = quantity > 0 ? totalPrice / quantity : totalPrice;

      return {
        name,
        quantity,
        unitRaw,
        unit,
        unitPrice: Math.round(unitPrice * 100) / 100,
        vatRate,
        totalPrice,
        confidence: 0.7,
        kategoriId: null,
        rawLine: trimmed,
      };
    }
  }

  // Strategy 4: Single data number — [name] [total] (POS receipt style)
  if (dataNumbers.length === 1) {
    const nameEnd = nameEndIndex > 0 ? nameEndIndex : trimmed.search(/[*₺$€]?\s*\d/);
    const name = trimmed.substring(0, nameEnd).replace(/[*₺$€]\s*$/, '').trim();

    if (name.length >= 2) {
      return {
        name,
        quantity: 1,
        unitRaw: unitRaw || 'AD',
        unit: unit || 'adet',
        unitPrice: dataNumbers[0],
        vatRate,
        totalPrice: dataNumbers[0],
        confidence: 0.5,
        kategoriId: null,
        rawLine: trimmed,
      };
    }
  }

  return null;
}

// --- Invoice metadata extraction ---

const DOC_TYPE_PATTERNS: Array<{ pattern: RegExp; type: OcrDocumentType }> = [
  { pattern: /E[\s-]*FATURA/i, type: 'fatura' },
  { pattern: /FATURA/i, type: 'fatura' },
  { pattern: /IRSALIYE|İRSALİYE/i, type: 'irsaliye' },
  { pattern: /FIS|FİŞ|FISI|FİŞİ/i, type: 'fis' },
];

/**
 * Extract header/footer metadata from OCR text lines.
 */
export function extractInvoiceMetadata(lines: string[]): {
  documentType: OcrDocumentType;
  supplierName: string | null;
  supplierTaxNumber: string | null;
  invoiceDate: string | null;
  invoiceNumber: string | null;
  subtotal: number | null;
  vatTotal: number | null;
  grandTotal: number | null;
} {
  let documentType: OcrDocumentType = 'unknown';
  let supplierName: string | null = null;
  let supplierTaxNumber: string | null = null;
  let invoiceDate: string | null = null;
  let invoiceNumber: string | null = null;
  let subtotal: number | null = null;
  let vatTotal: number | null = null;
  let grandTotal: number | null = null;

  for (const line of lines) {
    const upper = line.toUpperCase().trim();

    // Document type
    if (documentType === 'unknown') {
      for (const { pattern, type } of DOC_TYPE_PATTERNS) {
        if (pattern.test(line)) {
          documentType = type;
          break;
        }
      }
    }

    // Tax number: VKN or TCKN
    const vknMatch = line.match(/(?:VKN|TCKN|V\.?K\.?N\.?)\s*:?\s*(\d{10,11})/i);
    if (vknMatch && !supplierTaxNumber) {
      supplierTaxNumber = vknMatch[1];
    }

    // Invoice date
    const dateMatch = line.match(/(\d{2})[./](\d{2})[./](\d{4})/);
    if (dateMatch && !invoiceDate) {
      invoiceDate = `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`;
    }

    // Invoice number
    const invNoMatch = line.match(/(?:FATURA\s*NO|FIS\s*NO|BELGE\s*NO)\s*:?\s*(.+)/i);
    if (invNoMatch && !invoiceNumber) {
      invoiceNumber = invNoMatch[1].trim();
    }

    // Totals
    if (upper.includes('GENEL TOPLAM') || (upper.includes('TOPLAM') && !upper.includes('ARA') && !upper.includes('KDV'))) {
      const nums = extractNumbers(line);
      if (nums.length > 0) {
        grandTotal = nums[nums.length - 1];
      }
    }
    if (upper.includes('ARA TOPLAM')) {
      const nums = extractNumbers(line);
      if (nums.length > 0) subtotal = nums[nums.length - 1];
    }
    if (upper.includes('KDV TOPLAM') || upper.match(/KDV\s+%/)) {
      const nums = extractNumbers(line);
      if (nums.length > 0 && !vatTotal) vatTotal = nums[nums.length - 1];
    }
  }

  // Supplier name: typically the first non-empty, non-date, non-address line
  if (!supplierName) {
    for (const line of lines.slice(0, 5)) {
      const trimmed = line.trim();
      if (
        trimmed.length >= 5 &&
        !/^\d{2}[./]\d{2}[./]\d{4}/.test(trimmed) &&
        !/^(TEL|FAX|ADRES|MAIL)/i.test(trimmed) &&
        !/^(FATURA|FIS|IRSALIYE)/i.test(trimmed) &&
        !/^\d+$/.test(trimmed)
      ) {
        supplierName = trimmed;
        break;
      }
    }
  }

  return {
    documentType,
    supplierName,
    supplierTaxNumber,
    invoiceDate,
    invoiceNumber,
    subtotal,
    vatTotal,
    grandTotal,
  };
}

/**
 * Main entry point: parse an OCR result into a structured invoice.
 */
export function parseInvoice(ocrResult: OcrResult): OcrParsedInvoice {
  // 1. Flatten OCR blocks into lines
  const rawLines = ocrResult.blocks.flatMap(b => b.lines.map(l => l.text));

  // 2. Merge fragmented lines
  const mergedLines = mergeFragmentedLines(rawLines);

  // 3. Extract metadata from all lines
  const metadata = extractInvoiceMetadata(mergedLines);

  // 4. Score each line
  const scoredLines = mergedLines.map(line => ({ line, score: scoreLine(line) }));

  // 5. Filter lines above threshold as candidate product lines
  const candidateLines = scoredLines.filter(sl => sl.score >= PRODUCT_LINE_THRESHOLD);

  // 6. Parse each candidate into an OcrParsedItem
  const items: OcrParsedItem[] = [];
  for (const { line, score } of candidateLines) {
    const parsed = parseProductLine(line);
    if (!parsed) continue;
    items.push({
      ...parsed,
      id: generateId(),
      confidence: Math.min(1, Math.max(0, score / 8)),
      matchedUrunId: null as string | null,
      matchScore: 0,
      matchTier: 'new' as const,
      isNewConfirmed: false,
      kategoriId: null as string | null,
      userEdited: false,
    });
  }

  return {
    ...metadata,
    items,
    currency: null,
    supplierMatchCariId: null,
    rawText: ocrResult.text,
  };
}
