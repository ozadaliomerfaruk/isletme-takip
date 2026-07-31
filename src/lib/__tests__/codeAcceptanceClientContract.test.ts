import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '../../..');

function read(relativePath: string): string {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

describe('code acceptance client contract', () => {
  it('does not treat a NULL invite acceptance result as success', () => {
    const source = read('src/hooks/useMultiUser.ts');

    expect(source).toContain("typeof data !== 'string' || data.length === 0");
    expect(source).toContain("i18n.t('multiUser:errors.invalidCode')");
    expect(source).toContain('return data; // isletme_id');
  });

  it('does not treat a NULL cari-share acceptance result as success', () => {
    const source = read('src/hooks/useCariSharing.ts');

    expect(source).toContain("typeof data !== 'string' || data.length === 0");
    expect(source).toContain("i18n.t('clients:sharing.invalidCode')");
    expect(source).toContain('return { link_id: data };');
  });
});
