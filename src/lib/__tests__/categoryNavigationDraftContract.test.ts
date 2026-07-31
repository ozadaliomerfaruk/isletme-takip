import fs from 'node:fs';
import path from 'node:path';

function read(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

describe('category creation navigation keeps transaction drafts', () => {
  it('keeps the credit-card form mounted and consumes the new expense category on focus', () => {
    const source = read(
      'src/components/transaction/CreditCardTransactionBar/index.tsx',
    );

    expect(source).toContain('useFocusEffect(');
    expect(source).toContain('categoryNavigationPendingRef.current = true');
    expect(source).toContain('setCategoryNavigatedAway(true)');
    expect(source).toContain(
      'visible={visible && !categoryNavigatedAway}',
    );
    expect(source).toContain('consumePendingCategorySelection()');
    expect(source).toContain("pending?.type === 'gider'");
    expect(source).not.toContain('onNavigateAway={onDismiss}');
  });

  it('keeps every daily-cash row and assigns the new category only to its origin row', () => {
    const source = read('src/components/transaction/DailyCashModal.tsx');

    expect(source).toContain('useFocusEffect(');
    expect(source).toContain(
      'categoryNavigationEntryIdRef.current = entry.hesapId',
    );
    expect(source).toContain(
      'const hesapId = categoryNavigationEntryIdRef.current',
    );
    expect(source).toContain(
      "updateEntry(hesapId, 'kategoriId', pending.id)",
    );
    expect(source).toContain(
      'visible={visible && !categoryNavigatedAway}',
    );
    expect(source).not.toContain('onNavigateAway={handleDismiss}');
  });

  it('reconciles daily-cash accounts by id without wiping a refetched draft', () => {
    const source = read('src/components/transaction/DailyCashModal.tsx');

    expect(source).toContain(
      'const previousById = new Map(',
    );
    expect(source).toContain('previousById.get(hesap.id) ??');
    expect(source).toContain(
      'return unchanged ? previousEntries : nextEntries',
    );
    expect(source).not.toContain(
      'setEntries(\n        visibleHesaplar.map((h) => ({',
    );
  });
});
