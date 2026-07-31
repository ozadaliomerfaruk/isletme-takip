import fs from 'fs';
import path from 'path';

const read = (relativePath: string) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');

describe('ActionSheet küçük ekran ve büyük yazı sözleşmesi', () => {
  const source = read('src/components/ui/ActionSheet.tsx');
  const modalInsetsSource = read('src/components/ui/ModalInsets.tsx');

  it('sabit ekran ölçüsü yerine canlı pencere yüksekliğiyle üst-safe-area sınırı hesaplar', () => {
    expect(source).toContain('useWindowDimensions');
    expect(source).toContain(
      'windowHeight - Math.max(0, insets.top) - spacing.lg',
    );
    expect(source).toContain('maxHeight: sheetMaxHeight');
    expect(source).not.toContain("Dimensions.get('window')");
  });

  it('yalnız seçenekleri kaydırır; üst tutma alanı ile iptal düğmesini sabit tutar', () => {
    const gestureEnd = source.indexOf('</GestureDetector>');
    const scrollStart = source.indexOf('<ScrollView');
    const scrollEnd = source.indexOf('</ScrollView>');
    const cancelStart = source.indexOf('{/* Cancel */}');

    expect(gestureEnd).toBeGreaterThan(-1);
    expect(scrollStart).toBeGreaterThan(gestureEnd);
    expect(scrollEnd).toBeGreaterThan(scrollStart);
    expect(cancelStart).toBeGreaterThan(scrollEnd);
    expect(source).toContain('contentContainerStyle={styles.optionsContainer}');
    expect(source).toMatch(/optionsViewport:\s*\{[\s\S]*?flexShrink:\s*1/);
  });

  it('erişilebilirlik yazı ölçeğinde etiket ve açıklamaya ek satır alanı verir', () => {
    expect(source).toMatch(/styles\.optionLabel[\s\S]*?numberOfLines=\{2\}/);
    expect(source).toMatch(/styles\.optionDescription[\s\S]*?numberOfLines=\{3\}/);
  });

  it('modal safe-area düzeltmesini ve modal-üstü-modal yasağını korur', () => {
    expect(source).toContain("import { Modal } from './Modal'");
    expect(source).toContain('statusBarTranslucent');
    expect(source).toContain('paddingBottom: Math.max(insets.bottom, spacing.lg)');
    expect(source.match(/<Modal\b/g)).toHaveLength(1);
  });

  it('sheet hesabında ana tab bar eklenmiş inset yerine gerçek cihaz insetini okur', () => {
    expect(source).toContain(
      "import { useModalSafeAreaInsets } from './ModalInsets'",
    );
    expect(source).toContain('const insets = useModalSafeAreaInsets()');
    expect(modalInsetsSource).toContain(
      'export function useModalSafeAreaInsets(): EdgeInsets',
    );
    expect(modalInsetsSource).toContain(
      'return useContext(RealInsetsContext) ?? inherited',
    );
  });
});
