import fs from 'fs';
import path from 'path';

const read = (relativePath: string) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');

describe('ürün listesi dönem özeti snapshot sözleşmesi', () => {
  const screen = read('src/app/urunler/index.tsx');
  const movementHook = read('src/hooks/useUrunHareketler.ts');

  it('özet, header ve scroll yaşam döngüsünü top-anchored snapshot ile birleştirir', () => {
    expect(screen).toContain('useTopAnchoredListSnapshot({');
    expect(screen).toContain('scopeKey: periodSnapshotScope');
    expect(screen).toContain(
      'permissionAccessSignature(currentPermissions)',
    );
    expect(screen).toMatch(
      /const handleProductListScroll = useCallback\([\s\S]{0,260}handleTabScroll\(event\);[\s\S]{0,100}handleSnapshotScroll\(event\);/,
    );
    expect(screen).toContain('onScroll={handleProductListScroll}');
    expect(screen).toContain('onScrollBeginDrag={handleScrollBeginDrag}');
    expect(screen).toContain('onScrollEndDrag={handleScrollEndDrag}');
    expect(screen).toContain(
      'onMomentumScrollBegin={handleMomentumScrollBegin}',
    );
    expect(screen).toContain(
      'onMomentumScrollEnd={handleMomentumScrollEnd}',
    );
    expect(screen).toContain('onHeightChange={onHeaderHeightChange}');
    expect(screen).not.toContain('maintainVisibleContentPosition');
  });

  it('pill ve metrik sıralamayı aynı stabil snapshot üzerinden besler', () => {
    expect(screen).toContain(
      'const stableDonemUrunOzet = stablePeriodSnapshot.summary',
    );
    expect(screen).toContain(
      'const ozetA = stableDonemUrunOzet[a.id]',
    );
    expect(screen).toContain(
      'urunOzet={stableDonemUrunOzet[urun.id]}',
    );
    expect(screen).toContain(
      '() => ({ expandedId, stableDonemUrunOzet, activeTab, ozetMode })',
    );
    expect(screen).not.toContain('urunOzet={donemUrunOzet?.[urun.id]}');
  });

  it('hazır olmayan metrik sıralamayı ikinci alfabetik sıçrama yerine bekletir', () => {
    expect(screen).toContain('areMetricSortOptionsDisabled');
    expect(screen).toMatch(
      /disabled:\s*isMetricSortType\(opt\.key\)\s*&& areMetricSortOptionsDisabled/,
    );
    expect(screen).toContain(
      'data={isLoading || isMetricSortPending ? [] : listData}',
    );
    expect(screen).toContain(
      'scrollToOffset({ offset: 0, animated: false })',
    );
  });

  it('dönem özet cache anahtarını kullanıcı ve izin imzasıyla ayırır', () => {
    expect(movementHook).toContain(
      'permissionAccessSignature(currentPermissions)',
    );
    expect(movementHook).toContain("user?.id ?? 'no-user'");
    expect(movementHook).toContain('accessSignature');
    expect(movementHook).toContain('meta: { persist: false }');
  });

  it('pull-to-refresh ürünlerle birlikte dönem özetini de yeniler', () => {
    expect(screen).toContain('refetch: refetchDonemUrunOzet');
    expect(screen).toMatch(
      /Promise\.all\(\[[\s\S]{0,220}refetchUrunler\(\),[\s\S]{0,120}refetchArchived\(\),[\s\S]{0,120}refetchDonemUrunOzet\(\),/,
    );
  });
});
