import fs from 'fs';
import path from 'path';

const read = (relativePath: string) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');

describe('search bar tap target contract', () => {
  it('makes the full shared modal search pill focus the input', () => {
    const source = read('src/components/ui/ModalSearchBar.tsx');

    expect(source).toContain('<Pressable');
    expect(source).toContain('style={styles.pillInner}');
    expect(source).toContain('onPress={() => inputRef.current?.focus()}');
    expect(source).not.toContain('<View style={styles.pillInner}>');
  });

  it('keeps the full floating search pill focusable', () => {
    const source = read('src/components/ui/FloatingSearchBar.tsx');

    expect(source).toContain('<Pressable');
    expect(source).toContain('style={styles.pillInner}');
    expect(source).toContain('onPress={() => inputRef.current?.focus()}');
  });

  it('makes the global search capsule focus the input', () => {
    const source = read('src/app/arama.tsx');

    expect(source).toContain('style={styles.searchInputContainer}');
    expect(source).toContain(
      'onPress={() => searchInputRef.current?.focus()}',
    );
    expect(source).not.toContain(
      '<View style={styles.searchInputContainer}>',
    );
  });

  it('makes every legacy transaction picker search capsule focusable', () => {
    const source = read('src/app/islemler/duzenle/[id].tsx');
    const refs = [
      'hesapSearchInputRef',
      'cariSearchInputRef',
      'personelSearchInputRef',
    ];

    expect(source.match(/style=\{styles\.searchContainer\}/g)).toHaveLength(3);
    expect(source).not.toContain('<View style={styles.searchContainer}>');

    for (const ref of refs) {
      expect(source).toContain(`const ${ref} = useRef<TextInput>(null)`);
      expect(source).toContain(`ref={${ref}}`);
      expect(source).toContain(`onPress={() => ${ref}.current?.focus()}`);
    }
  });

  it('clear actions do not turn the full-pill press into a second action', () => {
    const sources = [
      read('src/components/ui/ModalSearchBar.tsx'),
      read('src/components/ui/FloatingSearchBar.tsx'),
      read('src/app/arama.tsx'),
      read('src/app/islemler/duzenle/[id].tsx'),
    ];

    for (const source of sources) {
      expect(source).toContain('event.stopPropagation()');
    }
  });
});
