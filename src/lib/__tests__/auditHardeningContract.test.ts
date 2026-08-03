import fs from 'fs';
import path from 'path';

const read = (relativePath: string) => fs.readFileSync(
  path.join(process.cwd(), relativePath),
  'utf8',
);

describe('audit hardening client contracts', () => {
  it('never persists authenticated query or mutation data unencrypted', () => {
    const queryClient = read('src/lib/queryClient.ts');
    const layout = read('src/app/_layout.tsx');

    expect(queryClient).toContain('export const neverDehydrateQuery = (): false => false');
    expect(queryClient).toContain("-s7`");
    expect(layout).toContain('shouldDehydrateQuery: neverDehydrateQuery');
    expect(layout).toContain('shouldDehydrateMutation: neverDehydrateMutation');
  });

  it('renders QTB child pickers inline instead of opening nested native modals', () => {
    const modal = read('src/components/ui/Modal.tsx');
    const qtb = read('src/components/transaction/QuickTransactionBar/QuickTransactionBar.tsx');
    const creditQtb = read('src/components/transaction/CreditCardTransactionBar/index.tsx');

    expect(modal).toContain('inline?: boolean');
    expect(modal).toContain('StyleSheet.absoluteFillObject');
    expect(qtb).toMatch(/<HesapPickerSheet\s+inline/);
    expect(qtb).toMatch(/<CariPickerSheet\s+inline/);
    expect(qtb).toMatch(/<PhotoViewerModal\s+inline/);
    expect(creditQtb).toMatch(/<HesapPickerSheet\s+inline/);
    expect(creditQtb).toMatch(/<CariPickerSheet\s+inline/);
    expect(creditQtb).toMatch(/<PhotoViewerModal\s+inline/);
  });

  it('does not serialize audited local calendar days through UTC', () => {
    const files = [
      'src/hooks/useAnalyticsTrend.ts',
      'src/hooks/useIrsaliyeRecords.ts',
      'src/hooks/useOcrImport.ts',
      'src/app/(tabs)/personel.tsx',
      'src/app/(tabs)/cariler.tsx',
    ];

    for (const file of files) {
      expect(read(file)).not.toMatch(/toISOString\(\)\.(?:split|slice)/);
    }
  });

  it('keeps cold-start auth transient errors in recovery instead of routing to login', () => {
    const auth = read('src/hooks/useAuth.ts');

    expect(auth).toContain('let authRecoveryPending = true');
    expect(auth).toContain("event === 'INITIAL_SESSION' && authRecoveryPending");
    expect(auth).toContain('if (!isPermanentAuthSessionError(error))');
    expect(auth).toContain("if (event === 'TOKEN_REFRESHED')");
  });
});
