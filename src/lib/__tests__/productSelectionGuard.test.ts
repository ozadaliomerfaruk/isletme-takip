import {
  getQuickTransactionProductMovementType,
  hasUnsupportedQuickTransactionProducts,
  supportsQuickTransactionProducts,
} from '../productSelectionGuard';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../../..');
const read = (relativePath: string) =>
  fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

describe('quick transaction product selection guard', () => {
  it.each([
    ['alis', 'giris'],
    ['satis', 'cikis'],
    ['alis_iade', 'cikis'],
    ['satis_iade', 'giris'],
    ['gelir', 'cikis'],
    ['gider', 'giris'],
    ['kredi_karti_gider', 'giris'],
  ] as const)('maps %s to the stock movement %s', (type, movement) => {
    expect(getQuickTransactionProductMovementType(type)).toBe(movement);
    expect(supportsQuickTransactionProducts(type)).toBe(true);
    expect(hasUnsupportedQuickTransactionProducts(type, 2)).toBe(false);
  });

  it.each([
    'transfer',
    'odeme',
    'tahsilat',
    'kredi_karti_odeme',
    'kredi_karti_ekstre',
    'personel_odeme_tab',
    null,
    undefined,
  ])('fails closed for selected products on %p', (type) => {
    expect(getQuickTransactionProductMovementType(type)).toBeNull();
    expect(supportsQuickTransactionProducts(type)).toBe(false);
    expect(hasUnsupportedQuickTransactionProducts(type, 1)).toBe(true);
    expect(hasUnsupportedQuickTransactionProducts(type, 0)).toBe(false);
  });

  it('is enforced by both quick-entry save paths while keeping removal reachable', () => {
    const mainSubmit = read(
      'src/components/transaction/QuickTransactionBar/hooks/useTransactionSubmit.ts',
    );
    const mainBar = read(
      'src/components/transaction/QuickTransactionBar/QuickTransactionBar.tsx',
    );
    const creditCardBar = read(
      'src/components/transaction/CreditCardTransactionBar/index.tsx',
    );

    expect(mainSubmit).toContain(
      'hasUnsupportedQuickTransactionProducts(type, urunItems.length)',
    );
    expect(mainSubmit).toContain(
      'validation.productsUnsupportedTypeMessage',
    );
    expect(mainBar).toContain(
      'supportsQuickTransactionProducts(form.type)',
    );
    expect(mainBar).toContain('form.urunItems.length > 0');
    expect(mainBar).toContain(
      'entities.selectedCari?.currency ?? userCurrency',
    );
    expect(mainBar).toContain(
      'entities.selectedHesap?.currency ?? userCurrency',
    );
    expect(mainBar).toContain('currency: productTransactionCurrency');
    expect(mainBar).toContain('currency={productTransactionCurrency}');
    expect(mainBar).not.toContain('currency={userCurrency}');

    expect(creditCardBar).toContain(
      'hasUnsupportedQuickTransactionProducts(type, urunItems.length)',
    );
    expect(creditCardBar).toContain(
      'if (hasUnsupportedProductSelection)',
    );
    expect(creditCardBar).toContain(
      "type === 'kredi_karti_gider' || urunItems.length > 0",
    );
  });
});
