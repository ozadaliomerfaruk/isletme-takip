import fs from 'node:fs';
import path from 'node:path';

function read(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

describe('category creation navigation keeps transaction drafts', () => {
  it('dismisses the native-slide picker before navigating', () => {
    const picker = read('src/components/ui/CategoryPicker.tsx');
    const amountSection = read(
      'src/components/transaction/QuickTransactionBar/sections/AmountInputSection.tsx',
    );
    const dailyCash = read('src/components/transaction/DailyCashModal.tsx');
    const modal = read('src/components/ui/Modal.tsx');
    const quickTransaction = read(
      'src/components/transaction/QuickTransactionBar/QuickTransactionBar.tsx',
    );

    expect(picker).toContain('pendingAddNavigationRef.current = true');
    expect(picker).toContain('Keyboard.dismiss();');
    expect(picker).toContain('Keyboard.dismiss();\n    setModalVisible(true);');
    expect(picker).not.toContain('pendingOpenAfterKeyboardRef');
    expect(picker).toContain('visible={modalVisible}');
    expect(picker).toContain('animationType="slide"');
    expect(picker).toContain('onDismiss={handleNativeModalDismiss}');
    expect(picker).not.toContain(
      "onNavigateAway?.();\n    router.push(`/kategoriler/ekle?type=${type}`);\n  };",
    );
    expect(amountSection).not.toMatch(/<CategoryPicker\s+inline\s+/);
    expect(amountSection).toContain(
      'onCloseComplete={onCategoryPickerCloseComplete}',
    );
    expect(dailyCash).not.toMatch(/<CategoryPicker\s+inline\s+/);
    expect(quickTransaction).toContain(
      'onCategoryPickerCloseComplete={restoreAmountKeyboardAfterCategoryPicker}',
    );
    expect(quickTransaction).toContain(
      'requestAnimationFrame(() => amountInputRef.current?.focus())',
    );
    expect(modal).toContain('InlineModalHostContext.Provider');
    expect(modal).toContain('parentInlineHost.upsert(inlineId, inlineLayer)');
    expect(modal).toContain('{Array.from(inlineEntries.values())}');
  });

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
    expect(source).toContain(
      'onCategoryPickerCloseComplete={restoreAmountKeyboardAfterCategoryPicker}',
    );
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
