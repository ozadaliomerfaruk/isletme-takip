import fs from 'fs';
import path from 'path';

const read = (relativePath: string) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');

const FORM_FILES = [
  'src/components/urun/UrunForm.tsx',
  'src/app/kategoriler/ekle.tsx',
  'src/app/kategoriler/duzenle/[id].tsx',
  'src/app/islemler/gelir.tsx',
  'src/app/islemler/duzenle/[id].tsx',
  'src/app/foto-import/review.tsx',
  'src/app/ayarlar/isletme.tsx',
  'src/app/ayarlar/davet-olustur.tsx',
];

describe('klavyeye duyarlı form footer sözleşmesi', () => {
  it.each(FORM_FILES)('%s butonları kaydırma alanının dışında ve KAV içinde tutar', (file) => {
    const source = read(file);
    const scrollEnd = source.indexOf('</ScrollView>');
    const footer = source.indexOf('<View style={[styles.footer');
    const keyboardAvoidingEnd = source.indexOf('</KeyboardAvoidingView>');

    expect(source).toContain('useFooterBottomPadding');
    expect(scrollEnd).toBeGreaterThan(-1);
    expect(footer).toBeGreaterThan(scrollEnd);
    expect(keyboardAvoidingEnd).toBeGreaterThan(footer);
    expect(source).toContain('paddingBottom: spacing.md + footerInset');
  });

  it.each(FORM_FILES)('%s iOS native header yüksekliğini klavye ofsetine katar', (file) => {
    const source = read(file);

    expect(source).toContain('useSafeAreaInsets');
    expect(source).toContain("behavior={Platform.OS === 'ios' ? 'padding' : 'height'}");
    expect(source).toContain(
      "keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + 44 : 0}",
    );
  });

  it.each([
    'src/app/urunler/toplu-giris.tsx',
    'src/app/urunler/toplu-cikis.tsx',
  ])('%s mevcut sabit footer için native header klavye ofsetini kullanır', (file) => {
    const source = read(file);

    expect(source).toContain('useFooterBottomPadding');
    expect(source).toContain(
      "keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + 44 : 0}",
    );
  });

  it('işlem düzenleme picker listesi modal içinde gerçek alt inset değerini okur', () => {
    const source = read('src/app/islemler/duzenle/[id].tsx');

    expect(source).toContain('function PickerModalList');
    expect(source.match(/<PickerModalList>/g)).toHaveLength(3);
    expect(source.match(/const contentPaddingBottom = useContentBottomPadding\(\);/g)).toHaveLength(1);
  });

  it('hesap silme aksiyonunu scroll içinde tutarken klavye alt payını sıfırlar', () => {
    const source = read('src/app/ayarlar/hesap-sil.tsx');

    expect(source).toContain('useFooterBottomPadding');
    expect(source).not.toContain('useContentBottomPadding');
    expect(source).toContain('paddingBottom: spacing.lg + footerInset');
    expect(source).toContain(
      "keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + 44 : 0}",
    );
  });

  it('modal inset değerlerini hook sağlayıcısının alt ağacında okur', () => {
    const passwordSource = read('src/components/auth/ChangePasswordModal.tsx');
    const noteSource = read('src/components/notes/NoteInputModal.tsx');

    expect(passwordSource).toContain('function PasswordModalLayout');
    expect(passwordSource.match(/const contentPaddingBottom = useContentBottomPadding\(\);/g))
      .toHaveLength(1);
    expect(noteSource).toContain('function NoteModalSheet');
    expect(noteSource.match(/const insets = useSafeAreaInsets\(\);/g)).toHaveLength(1);
  });

  it('bakiye düzenleme modalını klavye yükselmesine bağlar', () => {
    const source = read('src/components/detail/BalanceEditorModal.tsx');

    expect(source).toContain('<KeyboardAvoidingView');
    expect(source).toContain("behavior={Platform.OS === 'ios' ? 'padding' : 'height'}");
  });
});
