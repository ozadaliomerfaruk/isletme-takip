import fs from 'fs';
import path from 'path';

const read = (relativePath: string) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');

describe('top-anchored ana liste snapshot sözleşmesi', () => {
  const mainLists = [
    'src/app/(tabs)/cariler.tsx',
    'src/app/(tabs)/personel.tsx',
  ];

  it.each(mainLists)(
    '%s async geometriyi ortak lifecycle kapısına bağlar',
    (screenPath) => {
      const source = read(screenPath);

      expect(source).toContain('useTopAnchoredListSnapshot({');
      expect(source).toContain('scopeKey: listGeometryScopeKey');
      expect(source).toContain(
        'permissionAccessSignature(currentPermissions)',
      );
      expect(source).toMatch(
        /const handleListScroll = useCallback\([\s\S]{0,260}handleTabScroll\(event\);[\s\S]{0,100}handleGeometryScroll\(event\);/,
      );
      expect(source).toContain('onScroll={handleListScroll}');
      expect(source).toContain(
        'onScrollBeginDrag={handleListScrollBeginDrag}',
      );
      expect(source).toContain(
        'onScrollEndDrag={handleListScrollEndDrag}',
      );
      expect(source).toContain(
        'onMomentumScrollBegin={handleListMomentumScrollBegin}',
      );
      expect(source).toContain(
        'onMomentumScrollEnd={handleListMomentumScrollEnd}',
      );
      expect(source).toContain(
        'onHeightChange={handleHeaderHeightChange}',
      );
      expect(source).not.toContain('maintainVisibleContentPosition');
    },
  );

  it('cari vade rozetlerini doğrudan değil stabil snapshot üzerinden çizer', () => {
    const source = read('src/app/(tabs)/cariler.tsx');

    expect(source).toContain('const vadeRozetQuery = useCariVadeRozet()');
    expect(source).toContain('stableAsyncMeta: vadeRozetMap');
    expect(source).toContain('asyncMeta: vadeRozetQuery.data');
    expect(source).toContain('emptyAsyncMeta: EMPTY_VADE_ROZET_MAP');
  });

  it('personel izin metasını snapshotlar ve header subtitle satırını ilk kareden rezerve eder', () => {
    const source = read('src/app/(tabs)/personel.tsx');

    expect(source).toContain('stableAsyncMeta: leaveQuotas');
    expect(source).toContain('asyncMeta: readyLeaveQuotas');
    expect(source).toContain('emptyAsyncMeta: EMPTY_LEAVE_QUOTA_MAP');
    expect(source).toContain(": '\\u00A0'");
  });
});
