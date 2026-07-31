import fs from 'fs';
import path from 'path';

const read = (relativePath: string) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');

describe('standalone transaction edit route owner-only contract', () => {
  const source = read('src/app/islemler/duzenle/[id].tsx');

  it('uses the owner-only navigation guard instead of record-level shared permission', () => {
    expect(source).toContain(
      "import { useRequireOwner } from '@/hooks/usePagePermission';",
    );
    expect(source).toContain('useRequireOwner();');
    expect(source).not.toContain('usePagePermission({');
  });

  it('verifies ownership against the active tenant before fetching raw data', () => {
    expect(source).toContain(
      'isOwner && !!user?.id && isletme?.user_id === user.id',
    );
    expect(source).toContain('ownerVerified ? id : undefined');
    expect(source).toContain(
      'useHesaplar(false, false, ownerVerified)',
    );
    expect(source).toMatch(
      /useCariler\(\s*undefined,\s*false,\s*false,\s*ownerVerified,\s*\)/,
    );
    expect(source).toMatch(
      /usePersonelList\(\s*false,\s*false,\s*ownerVerified,\s*\)/,
    );
  });

  it('renders nothing for an unverified owner context', () => {
    expect(source).toMatch(
      /if \(!ownerVerified\) \{\s*return null;\s*\}/,
    );
  });
});
