import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../../..');
const read = (relativePath: string) =>
  fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

describe('urun view seviyesi yazma yuzeyleri', () => {
  const list = read('src/app/urunler/index.tsx');
  const row = read('src/components/urunlerPage/ProductRow.tsx');
  const detail = read('src/app/urunler/[id].tsx');

  it('liste create yetenegini tek kapidan turetir ve eski acik state-i kapatir', () => {
    expect(list).toContain(
      "const canCreateProduct = canCreate('urunler');",
    );
    expect(list).toContain('if (canCreateProduct) return;');
    expect(list).toContain('setQuickUrunVisible(false);');
    expect(list).toContain('setFabMenuVisible(false);');
    expect(list).toContain('if (!canCreateProduct) return;');
  });

  it('satir yeni hareket aksiyonunu view seviyesinde render etmez', () => {
    expect(list).toContain('canCreateTransaction={canCreateProduct}');
    expect(row).toContain('canCreateTransaction: boolean;');
    expect(row).toContain('{canCreateTransaction && (');
    expect(row).toContain('canManage: boolean;');
    expect(row).toContain('{canManage && (');
  });

  it('bos durum, hizli bar ve FAB ailesi create kapisina baglidir', () => {
    expect(list).toContain(
      "actionLabel={canCreateProduct ? t('products:addProduct') : undefined}",
    );
    expect(list).toContain(
      "description={canCreateProduct ? t('products:empty.description') : undefined}",
    );
    expect(list).toContain(
      'visible={canCreateProduct && quickUrunVisible}',
    );
    expect(list).toContain(
      "{canCreateProduct && activeTab === 'active' && fabMenuVisible && (",
    );
    expect(list).toContain(
      "{canCreateProduct && activeTab === 'active' && !searchActive && (",
    );
  });

  it('detay create/edit modalini izin daralmasinda fail-closed kapatir', () => {
    expect(detail).toContain('if (!canAddStock) return;');
    expect(detail).toContain('if (!canEdit) return;');
    expect(detail).toContain(
      'visible={quickUrunVisible && (editMode ? canEdit : canAddStock)}',
    );
    expect(detail).toContain(
      'if (!quickUrunVisible || (editMode ? canEdit : canAddStock)) return;',
    );
  });

  it('dogrudan create ve toplu hareket rotalari da create guard tasir', () => {
    for (const route of [
      'src/app/urunler/ekle.tsx',
      'src/app/urunler/toplu-giris.tsx',
      'src/app/urunler/toplu-cikis.tsx',
    ]) {
      expect(read(route)).toContain(
        "usePagePermission({ module: 'urunler', action: 'create' });",
      );
    }
  });
});
