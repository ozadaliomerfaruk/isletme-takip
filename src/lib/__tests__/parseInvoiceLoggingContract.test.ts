import fs from 'fs';
import path from 'path';

const source = fs.readFileSync(
  path.join(process.cwd(), 'supabase/functions/parse-invoice/index.ts'),
  'utf8',
);
const clientSource = fs.readFileSync(
  path.join(process.cwd(), 'src/lib/ocrEngine.ts'),
  'utf8',
);
const importHookSource = fs.readFileSync(
  path.join(process.cwd(), 'src/hooks/useOcrImport.ts'),
  'utf8',
);

const consoleCalls = source.match(
  /console\.(?:log|warn|error)\((?:[^;]|\n)*?\);/g,
) ?? [];
const loggedSource = consoleCalls.join('\n');

describe('parse-invoice production logging contract', () => {
  it('does not write invoice, user, product, financial, or upstream payload values to logs', () => {
    expect(loggedSource).not.toMatch(
      /\b(?:textContent|errorText|user\.id|item\.(?:name|quantity|unitPrice|totalPrice)|supplierName|invoiceNumber|grandTotal|ettn)\b/,
    );
    expect(loggedSource).not.toMatch(
      /\b(?:raw|tableRowNames|tableNames|missingNames)\.join\b/,
    );
    expect(loggedSource).not.toMatch(
      /\$\{\s*(?:oldQty|oldPrice|oldTotal|expected|itemsSum|missingAmount|darali)\b/,
    );
    expect(source).not.toContain('RAW Gemini');
    expect(source).not.toContain('textContent.substring');
  });

  it('keeps non-sensitive operational diagnostics', () => {
    expect(source).toContain('Product row filter summary');
    expect(source).toContain('Hal raw-column resolution summary');
    expect(source).toContain('Item math validation summary');
    expect(source).toContain('Gemini upstream rate limit');
    expect(source).toContain('Request failed: category=');
  });

  it('does not return or print redundant invoice debug payloads', () => {
    expect(source).not.toContain('preCleanupItems');
    expect(source).not.toMatch(/JSON\.stringify\(\{[^}]*\b_debug\b/s);
    expect(source).not.toMatch(/JSON\.stringify\(\{[^}]*\bdebug\s*:/s);
    expect(clientSource).not.toContain('EDGE DEBUG');
    expect(clientSource).not.toContain('BATCH DEBUG');
    expect(clientSource).not.toContain('debugInfo');
    expect(importHookSource).not.toMatch(
      /console\.(?:log|warn|error)\([^)]*(?:ettn|invoiceNumber|supplierName)/s,
    );
  });
});
