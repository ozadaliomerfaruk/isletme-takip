import fs from 'fs';
import path from 'path';

const read = (relativePath: string) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');

describe('ExchangeRateBar native modal sözleşmesi', () => {
  const exchangeRateBar = read(
    'src/components/transaction/ExchangeRateBar.tsx',
  );
  const quickTransactionBar = read(
    'src/components/transaction/QuickTransactionBar/QuickTransactionBar.tsx',
  );
  const creditCardTransactionBar = read(
    'src/components/transaction/CreditCardTransactionBar/index.tsx',
  );
  const scheduledSection = read(
    'src/components/ui/IleriTarihliIslemlerSection.tsx',
  );

  it('inline sunumu opt-in tutar ve bağımsız kullanımlarda native modalı korur', () => {
    expect(exchangeRateBar).toContain(
      "presentation?: 'modal' | 'inline';",
    );
    expect(exchangeRateBar).toContain("presentation = 'modal'");
    expect(exchangeRateBar).toContain(
      "if (presentation === 'inline') return overlay;",
    );
    expect(exchangeRateBar.match(/<Modal\b/g)).toHaveLength(1);
    expect(exchangeRateBar).toContain('onRequestClose={handleDismiss}');
  });

  it('inline overlay erişilebilirliği, backdrop ve klavye konumlandırmasını korur', () => {
    expect(exchangeRateBar).toContain('accessibilityViewIsModal');
    expect(exchangeRateBar).toContain('importantForAccessibility="yes"');
    expect(exchangeRateBar).toContain(
      'onAccessibilityEscape={handleDismiss}',
    );
    expect(exchangeRateBar).toContain('onPress={handleBackdropPress}');
    expect(exchangeRateBar).toContain(
      'const cardBottom = keyboardHeight > 0 ? keyboardHeight : insets.bottom + 10;',
    );
    expect(exchangeRateBar).toContain('opacity,');
    expect(exchangeRateBar).toContain('transform: [{ translateY }]');
    expect(exchangeRateBar).toMatch(
      /overlay:\s*\{[\s\S]*?\.\.\.StyleSheet\.absoluteFillObject,[\s\S]*?zIndex:\s*1000,[\s\S]*?elevation:\s*1000/,
    );
  });

  it('zaten modal olan iki işlem barında ikinci native modalı açmaz', () => {
    expect(quickTransactionBar).toMatch(
      /<ExchangeRateBar[\s\S]*?visible=\{modals\.showExchangeRateBar\}[\s\S]*?presentation="inline"/,
    );
    expect(creditCardTransactionBar).toMatch(
      /<ExchangeRateBar[\s\S]*?visible=\{showExchangeRateBar\}[\s\S]*?presentation="inline"/,
    );
  });

  it('ekran üzerindeki ileri-tarihli tamamlama kullanımını native modalda bırakır', () => {
    const scheduledExchangeRateBar =
      scheduledSection.match(/<ExchangeRateBar[\s\S]*?\/>/)?.[0] ?? '';

    expect(scheduledExchangeRateBar).not.toContain('presentation="inline"');
  });
});
