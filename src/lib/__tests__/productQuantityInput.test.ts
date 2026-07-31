import { resolveProductQuantityInput } from '../productQuantityInput';
import fs from 'fs';
import path from 'path';

describe('product quantity input', () => {
  it('keeps the empty-input convenience default at one', () => {
    expect(resolveProductQuantityInput('')).toBe(1);
    expect(resolveProductQuantityInput('   ')).toBe(1);
  });

  it('never converts an explicitly entered zero into one', () => {
    expect(resolveProductQuantityInput('0')).toBeNull();
    expect(resolveProductQuantityInput('0,000')).toBeNull();
  });

  it('keeps the smallest supported positive quantity', () => {
    expect(resolveProductQuantityInput('0,001')).toBe(0.001);
  });

  it('rejects values that round to zero or cannot be parsed', () => {
    expect(resolveProductQuantityInput('0,0004')).toBeNull();
    expect(resolveProductQuantityInput('abc')).toBeNull();
  });

  it('is used by both product preview and confirm paths', () => {
    const source = fs.readFileSync(
      path.join(
        process.cwd(),
        'src/components/transaction/QuickTransactionBar/components/UrunPickerModal.tsx',
      ),
      'utf8',
    );

    expect(
      source.match(/resolveProductQuantityInput\(addingProduct\.miktar\)/g),
    ).toHaveLength(2);
    expect(source).not.toMatch(/parseQuantity\([^)]*\)\s*\|\|\s*1/);
  });
});
