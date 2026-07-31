import fs from 'fs';
import path from 'path';

describe('trend filtre modalı klavye ve safe-area sözleşmesi', () => {
  it('klavye açıldığında footer görünür kalır ve cihaz alt boşluğu korunur', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../../components/reports/TrendFilterModal.tsx'),
      'utf8',
    );

    expect(source).toContain('<KeyboardAvoidingView');
    expect(source).toContain('useModalSafeAreaInsets()');
    expect(source).toContain('Math.max(insets.bottom, spacing.lg)');
    expect(source).toContain('keyboardDismissMode="on-drag"');
  });
});
