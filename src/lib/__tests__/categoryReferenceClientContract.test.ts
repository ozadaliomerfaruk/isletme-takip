import fs from 'node:fs';
import path from 'node:path';

const read = (relativePath: string) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');

describe('dar kategori secim referansi istemci sozlesmesi', () => {
  const hook = read('src/hooks/useKategoriSecimReferanslari.ts');
  const picker = read('src/components/ui/CategoryPicker.tsx');
  const quickBar = read(
    'src/components/transaction/QuickTransactionBar/QuickTransactionBar.tsx',
  );
  const productPicker = read(
    'src/components/transaction/QuickTransactionBar/components/UrunPickerModal.tsx',
  );
  const productList = read('src/app/urunler/index.tsx');
  const trendFilter = read('src/components/reports/TrendFilterModal.tsx');

  it('owner mevcut tam hiyerarsiyi korur, shared yalniz dar RPCyi kullanir', () => {
    expect(hook).toContain('useKategorilerHierarchical(');
    expect(hook).toContain('enabled && isOwner');
    expect(hook).toContain(
      "canAccessModule('islemler')",
    );
    expect(hook).toContain(
      "'get_kategori_secim_referanslari'",
    );
    expect(hook).toContain('p_isletme_id: isletme.id');
    expect(hook).toContain('p_type: type ?? null');
    expect(hook).toContain(
      'return parseKategoriSecimReferanslari(data);',
    );
  });

  it('shared cache tenant+kullanici+tip kapsamli, disksiz ve izin daralmasinda maskeli', () => {
    const queryKeys = read('src/lib/queryKeys.ts');
    const queryClient = read('src/lib/queryClient.ts');

    expect(queryKeys).toMatch(
      /\[\s*'kategoriler',\s*'picker-references-v1',\s*isletmeId,\s*userId,\s*type \?\? null,\s*\]/,
    );
    expect(hook).toContain('user?.id ??');
    expect(hook).toContain('persist: false');
    expect(hook).toContain('retry: false');
    expect(hook).toContain(
      "query_purpose: 'kategoriler:picker-references-v1'",
    );
    expect(hook).toMatch(
      /const data =\s*isOwner\s*\?\s*ownerOptions\s*:\s*\(\s*sharedAllowed[\s\S]*?!sharedQuery\.isError[\s\S]*?!sharedQuery\.isRefetchError[\s\S]*?\)\s*\?\s*sharedOptions\s*:\s*\[\]/,
    );
    expect(hook).toContain('if (!sharedAllowed || !isletme?.id)');
    expect(queryClient).toContain(
      "export const CACHE_BUSTER = `v${Constants.expoConfig?.version ?? '0'}-s7`",
    );
  });

  it('shared UI hiyerarsi ve icon uydurmaz; tip-bazli varsayilani kullanir', () => {
    expect(hook).toContain('icon: null');
    expect(hook).toContain('level: 0');
    expect(picker).toContain('useKategoriSecimReferanslari(type)');
    expect(picker).toContain(
      'category: KategoriSecimSecenegi',
    );
    expect(picker).toContain('const iconName = category.icon;');
  });

  it('QTB dogrulamasi ve urun kategori etiketleri ayni dar hooka tasinir', () => {
    expect(quickBar).toContain(
      'useKategoriSecimReferanslari(',
    );
    expect(quickBar).not.toMatch(
      /useKategoriler\(\s*currentCategoryFamily/,
    );
    expect(productPicker).toContain(
      'useKategoriSecimReferanslari()',
    );
    expect(productList).toContain(
      'useKategoriSecimReferanslari()',
    );
    expect(trendFilter).toContain(
      'useReportKategoriSecimReferanslari()',
    );
    expect(trendFilter).not.toContain(
      "from '@/hooks/useKategoriler'",
    );
  });

  it('reports-only trend filtresi kategori listesini iki dar rapor projeksiyonundan alir', () => {
    expect(hook).toContain(
      'export function useReportKategoriSecimReferanslari(',
    );
    expect(hook).toContain(
      "'get_rapor_kategori_referanslari_v1'",
    );
    expect(hook).toContain("(['gelir', 'gider'] as const)");
    expect(hook).toContain('parseReportCategoryReferenceRows(data)');
    expect(hook).toContain(
      "query_purpose: 'reports:category-references-v1'",
    );
  });
});
