import { Urun, Cari, UrunAlias, CariAlias } from '@/types/database';
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
 * Strip common Turkish business suffixes for better cari name matching.
 * "SAVAS ET VE ET URUNLERI TIC. LTD. STI." -> "savas et"
 */
const BUSINESS_SUFFIXES = new Set([
  'ltd', 'sti', 'a.s.', 'a.s', 'as', 'tic', 'san', 'org',
  'ltd.sti', 'ltd.sti.', 've', 'urunleri', 'gida', 'sanayi',
  'ticaret', 'turizm', 'insaat', 'nakliyat', 'pazarlama',
  'dis', 'ic', 'tic.ltd.sti', 'san.tic.ltd.sti', 'san.tic',
  'tic.ltd', 'limited', 'sirketi', 'sirket',
]);

export function stripBusinessSuffixes(name: string): string {
  const normalized = normalizeTurkish(name);
  const tokens = normalized.split(/\s+/).filter(Boolean);

  // Only strip from end: keep removing while last token is a suffix
  // Don't strip from middle - "ve" and other words in the middle are meaningful
  // (e.g., "Savaş Et ve Et Ürünleri" -> "savas et ve et" not "savas et")
  while (tokens.length > 1) {
    const last = tokens[tokens.length - 1]
      .replace(/[.,]+$/, ''); // strip trailing dots/commas
    if (BUSINESS_SUFFIXES.has(last)) {
      tokens.pop();
    } else {
      break;
    }
  }

  return tokens.join(' ');
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
 * Uses alias-first matching for better accuracy.
 *
 * Matching order:
 * 1. Supplier-specific alias exact match
 * 2. Global alias exact match
 * 3. Fuzzy matching (Jaccard + Levenshtein)
 */
export function matchItemsToProducts(
  items: OcrParsedItem[],
  existingProducts: Urun[],
  urunAliases?: UrunAlias[],
  supplierCariId?: string | null,
): OcrParsedItem[] {
  return items.map(item => {
    // Don't re-match user-edited items that already have a match
    if (item.userEdited && item.matchedUrunId) return item;

    const normalizedItemName = normalizeTurkish(item.name);

    // Step 1: Supplier-specific alias exact match
    if (urunAliases && supplierCariId) {
      const supplierAlias = urunAliases.find(
        a => a.alias_normalized === normalizedItemName && a.supplier_cari_id === supplierCariId
      );
      if (supplierAlias) {
        return {
          ...item,
          matchedUrunId: supplierAlias.urun_id,
          matchScore: 1.0,
          matchTier: 'exact' as MatchTier,
          matchedAliasId: supplierAlias.id,
        };
      }
    }

    // Step 2: Global alias exact match
    if (urunAliases) {
      const globalAlias = urunAliases.find(
        a => a.alias_normalized === normalizedItemName && !a.supplier_cari_id
      );
      if (globalAlias) {
        return {
          ...item,
          matchedUrunId: globalAlias.urun_id,
          matchScore: 1.0,
          matchTier: 'exact' as MatchTier,
          matchedAliasId: globalAlias.id,
        };
      }
    }

    // Step 3: Fuzzy matching
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
 * Uses alias-first matching with improved suffix stripping.
 *
 * Matching order:
 * 1. VKN/TCKN exact match
 * 2. Cari alias exact match
 * 3. Fuzzy name matching with suffix stripping
 */
export function matchSupplier(
  supplierName: string | null,
  supplierTaxNumber: string | null,
  cariler: Cari[],
  cariAliases?: CariAlias[],
): string | null {
  // Step 1: Exact tax number match
  if (supplierTaxNumber) {
    const taxMatch = cariler.find(c => c.tax_number === supplierTaxNumber);
    if (taxMatch) return taxMatch.id;
  }

  if (!supplierName) return null;

  const normalizedSupplierName = normalizeTurkish(supplierName);

  // Step 2: Cari alias exact match
  if (cariAliases) {
    const aliasMatch = cariAliases.find(
      a => a.alias_normalized === normalizedSupplierName
    );
    if (aliasMatch) return aliasMatch.cari_id;
  }

  // Step 3: Fuzzy name matching with suffix stripping
  const strippedSupplier = stripBusinessSuffixes(supplierName);

  let bestScore = 0;
  let bestId: string | null = null;

  for (const cari of cariler) {
    // Try both full name and stripped name comparison
    const fullScore = combinedSimilarity(supplierName, cari.name);
    const strippedScore = combinedSimilarity(strippedSupplier, stripBusinessSuffixes(cari.name));

    // Use the higher score
    const score = Math.max(fullScore, strippedScore);

    if (score > bestScore) {
      bestScore = score;
      bestId = cari.id;
    }
  }

  // Higher threshold for supplier match
  if (bestScore >= 0.70) return bestId;

  return null;
}
