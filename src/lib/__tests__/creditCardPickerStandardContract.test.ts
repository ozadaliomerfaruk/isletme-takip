import fs from 'node:fs';
import path from 'node:path';

const read = (relativePath: string) =>
  fs.readFileSync(path.resolve(process.cwd(), relativePath), 'utf8');

describe('credit-card entity picker standard contract', () => {
  const creditCardBar = read('src/components/transaction/CreditCardTransactionBar/index.tsx');
  const accountPicker = read(
    'src/components/transaction/QuickTransactionBar/components/HesapPickerSheet.tsx'
  );
  const supplierPicker = read(
    'src/components/transaction/QuickTransactionBar/components/CariPickerSheet.tsx'
  );

  it('reuses the shared account, supplier and personnel picker components', () => {
    expect(creditCardBar).toMatch(
      /import \{[\s\S]*?CariPickerSheet,[\s\S]*?HesapPickerSheet,[\s\S]*?PersonelPickerSheet,[\s\S]*?UrunPickerModal,?\s*\} from '\.\.\/QuickTransactionBar\/components';/
    );
    expect(creditCardBar).toContain('hesaplar={nakitHesaplar}');
    expect(creditCardBar).toContain('target="source"');
    expect(creditCardBar).toContain('cariler={tedarikciCariler || []}');
    expect(creditCardBar).toContain('mode="supplier"');
    expect(creditCardBar).toContain('personelList={personelList || []}');
    expect(creditCardBar).not.toContain('filteredHesaplar={filteredHesaplar}');
    expect(creditCardBar).not.toContain('filteredCariler={filteredCariler}');
  });

  it('shows full-list balances in their own currency when account access exists', () => {
    expect(creditCardBar).toContain("showBalances={canAccessModule('hesaplar')}");
    expect(accountPicker).toContain('formatCurrency(Number(hesap.balance ?? 0), hesap.currency)');
    expect(supplierPicker).toContain('formatCurrency(cari.balance, cari.currency)');
  });

  it('reuses the current QTB shell and form sections instead of the legacy card layout', () => {
    expect(creditCardBar).toContain(
      "import { styles as qtbStyles } from '../QuickTransactionBar/styles';"
    );
    expect(creditCardBar).toMatch(
      /import \{[\s\S]*?HeaderSection,[\s\S]*?OdemeSection,[\s\S]*?AmountInputSection,?\s*\} from '\.\.\/QuickTransactionBar\/sections';/
    );
    expect(creditCardBar).toContain('style={qtbStyles.floatingClose}');
    expect(creditCardBar).toContain('style={[qtbStyles.card, { maxHeight: cardMaxHeight }]}');
    expect(creditCardBar).toContain('<HeaderSection');
    expect(creditCardBar).toContain('<OdemeSection');
    expect(creditCardBar).toContain('sourceKind="kredi_karti"');
    expect(creditCardBar).toContain('<AmountInputSection');
    expect(creditCardBar).not.toContain('<CategoryPicker');
    expect(creditCardBar).not.toContain('<PhotoButton');
    expect(creditCardBar).not.toContain('<TransactionTypeTabs');
  });
});
