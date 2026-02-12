import { Urun, Cari } from '@/types/database';
import { OcrParsedItem, MatchTier } from '@/types/ocrImport';
import { normalizeTurkish, UNIT_MAP } from './turkishTextUtils';

/**
 * Remove unit/quantity tokens before comparing names.
 * "DOMATES SALCASI 5KG" -> "DOMATES SALCASI"
 */
function stripUnitTokens(text: string): string {
  return text
    .split(/\s+/)
    .filter(token => {
      const upper = token.toUpperCase();
      if (UNIT_MAP[upper]) return false;
      if (/^\d+([.,]\d+)?$/.test(token)) return false;
      if (/^\d+[A-Za-zÇçĞğİıÖöŞşÜü]+$/.test(token)) return false;
      return true;
    })
    .join(' ');
}

/**
 * Jaccard similarity on word token sets.
 */
export function jaccardSimilarity(a: string, b: string): number {
  const setA = new Set(a.split(/\s+/).filter(Boolean));
  const setB = new Set(b.split(/\s+/).filter(Boolean));

  if (setA.size === 0 && setB.size === 0) return 1;
  if (setA.size === 0 || setB.size === 0) return 0;

  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection++;
  }

  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Normalized Levenshtein similarity (1 = identical, 0 = completely different).
 */
export function levenshteinSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  const m = a.length;
  const n = b.length;
  if (m === 0 || n === 0) return 0;

  // Use two-row DP for memory efficiency
  let prev = new Array(n + 1);
  let curr = new Array(n + 1);

  for (let j = 0; j <= n; j++) prev[j] = j;

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        curr[j] = prev[j - 1];
      } else {
        curr[j] = 1 + Math.min(prev[j], curr[j - 1], prev[j - 1]);
      }
    }
    [prev, curr] = [curr, prev];
  }

  const maxLen = Math.max(m, n);
  return 1 - prev[n] / maxLen;
}

/**
 * Calculate combined similarity score between two product names.
 * Uses: 0.6 * Jaccard(tokens) + 0.4 * normalizedLevenshtein(full string)
 */
export function combinedSimilarity(a: string, b: string): number {
  const cleanA = normalizeTurkish(stripUnitTokens(a));
  const cleanB = normalizeTurkish(stripUnitTokens(b));

  if (cleanA === cleanB) return 1.0;
  if (!cleanA || !cleanB) return 0;

  const jaccard = jaccardSimilarity(cleanA, cleanB);
  const levenshtein = levenshteinSimilarity(cleanA, cleanB);

  return 0.6 * jaccard + 0.4 * levenshtein;
}

/**
 * Determine match tier from score.
 */
export function getMatchTier(score: number): MatchTier {
  if (score >= 0.85) return 'exact';
  if (score >= 0.60) return 'suggestion';
  return 'new';
}

/**
 * Match parsed OCR items against existing products.
 * Returns a new array with matchedUrunId, matchScore, matchTier set.
 */
export function matchItemsToProducts(
  items: OcrParsedItem[],
  existingProducts: Urun[],
): OcrParsedItem[] {
  // Pre-compute normalized product names
  const normalizedProducts = existingProducts.map(p => ({
    id: p.id,
    normalizedName: normalizeTurkish(p.ad),
  }));

  return items.map(item => {
    // Don't re-match user-edited items that already have a match
    if (item.userEdited && item.matchedUrunId) return item;

    let bestScore = 0;
    let bestUrunId: string | null = null;

    for (const product of existingProducts) {
      const score = combinedSimilarity(item.name, product.ad);
      if (score > bestScore) {
        bestScore = score;
        bestUrunId = product.id;
      }
    }

    return {
      ...item,
      matchedUrunId: bestScore >= 0.60 ? bestUrunId : null,
      matchScore: bestScore,
      matchTier: getMatchTier(bestScore),
    };
  });
}

/**
 * Match a supplier name against existing cariler.
 * Returns the best matching cari ID or null.
 */
export function matchSupplier(
  supplierName: string | null,
  supplierTaxNumber: string | null,
  cariler: Cari[],
): string | null {
  // First try exact tax number match
  if (supplierTaxNumber) {
    const taxMatch = cariler.find(c => c.tax_number === supplierTaxNumber);
    if (taxMatch) return taxMatch.id;
  }

  // Then try fuzzy name match
  if (supplierName) {
    let bestScore = 0;
    let bestId: string | null = null;

    for (const cari of cariler) {
      const score = combinedSimilarity(supplierName, cari.name);
      if (score > bestScore) {
        bestScore = score;
        bestId = cari.id;
      }
    }

    // Higher threshold for supplier match
    if (bestScore >= 0.70) return bestId;
  }

  return null;
}
