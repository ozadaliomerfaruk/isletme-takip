import fs from 'fs';
import path from 'path';

const read = (relativePath: string) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');

describe('sekme freeze ve modal-dismiss sözleşmesi', () => {
  const tabsLayout = read('src/app/(tabs)/_layout.tsx');
  const rootLayout = read('src/app/_layout.tsx');
  const guardedRouteStack = read('src/components/navigation/GuardedRouteStack.tsx');
  const actionSheet = read('src/components/ui/ActionSheet.tsx');
  const bottomSheet = read('src/components/ui/BottomSheet.tsx');
  const financialDetailModal = read('src/components/dashboard/FinancialDetailModal.tsx');
  const shareOptionsSheet = read('src/components/export/ShareOptionsSheet.tsx');
  const detailExportSection = read('src/components/detail/DetailExportSection.tsx');

  it('eş düzey ana sekmeleri dondurmaz; kök ve modül-içi stack optimizasyonlarını korur', () => {
    // Root layout calls enableFreeze(true), so omitting the option would make
    // react-native-screens freeze tab scenes again. The false must be explicit.
    expect(tabsLayout).toMatch(/freezeOnBlur\s*:\s*false/);
    expect(rootLayout).toMatch(/freezeOnBlur\s*:\s*true/);
    expect(guardedRouteStack).toMatch(/freezeOnBlur\s*:\s*true/);
  });

  it('ekstre süresi seçimini iOS native modal dismiss tamamlanana kadar çalıştırmaz', () => {
    expect(actionSheet).toContain('deferOptionPressUntilModalDismiss?: boolean');
    expect(actionSheet).toMatch(
      /Platform\.OS === 'ios' && deferOptionPressUntilModalDismiss[\s\S]*?pendingOptionPressRef\.current = option\.onPress[\s\S]*?animateClose\(onClose\)/,
    );
    expect(actionSheet).toContain('onDismiss={handleModalDismiss}');
    expect(actionSheet).toContain("if (!visible && Platform.OS !== 'ios') return null");
    expect(detailExportSection).toContain('deferOptionPressUntilModalDismiss');
  });

  it('paylaşım seçeneklerini iOS modalı kapandıktan sonra açar', () => {
    expect(bottomSheet).toContain('onModalDismiss?: () => void');
    expect(bottomSheet).toContain('onDismiss={onModalDismiss}');
    expect(bottomSheet).toContain("if (!visible && Platform.OS !== 'ios') return null");
    expect(shareOptionsSheet).toContain('pendingActionRef');
    expect(shareOptionsSheet).toContain('onModalDismiss={runPendingAction}');
    expect(shareOptionsSheet).toMatch(
      /if \(Platform\.OS !== 'ios'\) \{[\s\S]*?setTimeout\(runPendingAction, 300\)/,
    );
    expect(shareOptionsSheet).not.toMatch(
      /setTimeout\(\(\) => on(?:EkstreLink|Share)Press/,
    );
  });

  it('dashboard gelir-gider detayını CategoryPicker ile aynı native slide ailesinde açar', () => {
    expect(bottomSheet).toContain("openAnimation?: 'custom' | 'native-slide'");
    expect(bottomSheet).toContain("animationType={openAnimation === 'native-slide' ? 'slide' : 'none'}");
    expect(financialDetailModal).toContain('openAnimation="native-slide"');
  });
});
