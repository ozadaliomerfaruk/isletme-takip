import fs from 'node:fs';
import path from 'node:path';
import { canMutateEntityHistory } from '../archivedEntityHistory';

const root = path.resolve(__dirname, '../../..');

function compactSource(relativePath: string): string {
  return fs
    .readFileSync(path.join(root, relativePath), 'utf8')
    .replace(/\s+/g, ' ');
}

describe('archived entity detail history contract', () => {
  it('restores mutation access as soon as the entity is unarchived', () => {
    expect(canMutateEntityHistory(true)).toBe(false);
    expect(canMutateEntityHistory(false)).toBe(true);
    expect(canMutateEntityHistory(null)).toBe(true);
    expect(canMutateEntityHistory(undefined)).toBe(true);
  });

  it('keeps account transaction rows and scheduled transactions read-only', () => {
    const screen = compactSource('src/app/hesaplar/[id].tsx');

    expect(screen).toContain(
      'const canMutateDetailHistory = canMutateEntityHistory(hesap?.is_archived);',
    );
    expect(screen).toContain(
      'if (!canMutateDetailHistory) { setPendingTransactionOpenId(null); return; }',
    );
    expect(screen).toContain(
      'canMutateDetailHistory && canDeleteTransaction(islem.id)',
    );
    expect(screen).toContain('readOnly={!canMutateDetailHistory}');
    expect(screen).toContain(
      'canMutateDetailHistory && viewPhotoIslemId && canUpdateTransaction(viewPhotoIslemId)',
    );
    expect(screen).toContain(
      '{canMutateDetailHistory && canCreateAccountTransactions && (',
    );
  });

  it('keeps cari and personnel detail transaction surfaces read-only', () => {
    const cari = compactSource('src/app/cariler/[id].tsx');
    const personel = compactSource('src/app/personel/[id].tsx');
    const leave = compactSource('src/app/personel/izin-gecmisi/[id].tsx');

    expect(cari).toContain(
      'const canMutateDetailHistory = canMutateEntityHistory(cari?.is_archived);',
    );
    expect(cari).toContain('if (!canMutateDetailHistory) return true;');
    expect(cari).toContain(
      'readOnly={!canMutateDetailHistory || !canMutateCariTransactions}',
    );

    expect(personel).toContain(
      'const canMutateDetailHistory = canMutateEntityHistory(personel?.is_archived);',
    );
    expect(personel).toContain('if (!canMutateDetailHistory) return true;');
    expect(personel).toContain('readOnly={!canMutateDetailHistory}');

    expect(leave).toContain(
      'const canCreateLeaveTransactions = canMutateDetailHistory && canCreateTransactions;',
    );
    expect(leave).toContain('if (!canMutateDetailHistory) return;');
    expect(leave).toContain('{canCreateLeaveTransactions && (');
  });

  it('keeps archived product movement rows expandable but removes mutation actions', () => {
    const screen = compactSource('src/app/urunler/[id].tsx');

    expect(screen).toContain(
      'const canAddStock = canMutateDetailHistory && canCreate(\'urunler\');',
    );
    expect(screen).toContain(
      'const canEditHareket = canMutateDetailHistory && (',
    );
    expect(screen).toContain(
      'const canDeleteHareket = canMutateDetailHistory && canDelete(',
    );
    expect(screen).toContain('<ExpandableCard');
  });
});
