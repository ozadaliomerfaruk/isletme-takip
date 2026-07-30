import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../../..');
const read = (relativePath: string) =>
  fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

describe('product minimal personel/account label client contract', () => {
  const hook = read('src/hooks/useUrunHareketler.ts');
  const detail = read('src/app/urunler/[id].tsx');

  it('uses a narrow non-persisted RPC instead of widening source relations', () => {
    expect(hook).toContain('useUrunHareketKaynakEtiketleri');
    expect(hook).toContain(
      "'get_urun_hareket_kaynak_etiketleri_v1'",
    );
    expect(hook).toContain(
      "query_purpose: 'urunler:minimal-source-labels-v1'",
    );
    expect(hook).toContain('movement_id: string;');
    expect(hook).toContain('cari_name: string | null;');
    expect(hook).toContain(
      'const needsMinimalLabels =\n    !canSeeCariler || !canSeePersonel || !canSeeHesaplar',
    );
    expect(hook).toContain('persist: false');
    expect(hook).toContain(
      "canSeeHesaplar ? 'hesap:hesaplar!hesap_id(id, name, type)' : null",
    );
    expect(hook).toContain(
      "canSeePersonel ? 'personel:personel(id, first_name, last_name)' : null",
    );
  });

  it('renders closed-module names as plain labels without a navigation target', () => {
    expect(detail).toContain(
      'minimalSourceLabelByHareketId.get(hareket.id)',
    );
    expect(detail).toContain('minimalSourceLabel?.cari_name');
    expect(detail).toContain(') : minimalCariName ? (');
    expect(detail).toContain(') : minimalPersonelName ? (');
    expect(detail).toContain('{minimalPersonelName}');
    expect(detail).toContain(') : minimalHesapName ? (');
    expect(detail).toContain('{minimalHesapName}');

    const minimalPersonelBranch =
      detail.match(/\) : minimalPersonelName \? \(([\s\S]*?)\) : hareket\.hesap/)?.[1]
      ?? '';
    const minimalHesapBranch =
      detail.match(/\) : minimalHesapName \? \(([\s\S]*?)\) : null/)?.[1]
      ?? '';
    const minimalCariBranch =
      detail.match(/\) : minimalCariName \? \(([\s\S]*?)\) : hareket\.personel/)?.[1]
      ?? '';
    expect(minimalCariBranch).not.toContain('TouchableOpacity');
    expect(minimalCariBranch).not.toContain('router.push');
    expect(minimalPersonelBranch).not.toContain('TouchableOpacity');
    expect(minimalPersonelBranch).not.toContain('router.push');
    expect(minimalHesapBranch).not.toContain('TouchableOpacity');
    expect(minimalHesapBranch).not.toContain('router.push');
  });
});
