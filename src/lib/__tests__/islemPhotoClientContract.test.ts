import fs from 'node:fs';
import path from 'node:path';

const read = (relativePath: string) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');

describe('işlem fotoğrafı istemci sözleşmesi', () => {
  it.each([
    'src/app/islemler/index.tsx',
    'src/app/hesaplar/[id].tsx',
  ])('%s kaldır/değiştir ve işlem silmeyi güvenli sırada yürütür', (relativePath) => {
    const source = read(relativePath);

    expect(source).toContain('clearIslemPhotoCopyOnWrite({');
    expect(source).toContain('replaceIslemPhotoCopyOnWrite({');
    expect(source).toContain('getValidatedIslemPhotoPath(');
    expect(source).toMatch(
      /onCommitDelete: async \(id: string, item: (?:IslemWithRelations|HesapDetailIslem)\)[\s\S]*?verifiedPhotoPath[\s\S]*?await deleteIslem\.mutateAsync\(\{[\s\S]*?\bid,[\s\S]*?\}\);[\s\S]*?await removeIslemPhotoBestEffort\(/,
    );
  });

  it('QTB gerçek fotoğraf değişimini submit katmanına açıkça taşır', () => {
    const bar = read(
      'src/components/transaction/QuickTransactionBar/QuickTransactionBar.tsx',
    );
    const submit = read(
      'src/components/transaction/QuickTransactionBar/hooks/useTransactionSubmit.ts',
    );

    expect(bar).toContain('originalPhotoPath:');
    expect(bar).toContain('form.isEditMode');
    expect(bar).toContain('removeOriginalPhoto:');
    expect(bar).toContain('form.photoUri === null');
    expect(submit).toContain('syncTransactionPhotoBestEffort');
    expect(submit).toContain('replaceIslemPhotoCopyOnWrite({');
    expect(submit).toContain('clearIslemPhotoCopyOnWrite({');
    expect(submit).toContain('cleanupOriginalPhotoAfterDelete(transactionId)');
    expect(submit).not.toContain('[PhotoUpload] Upload success, path:');
  });

  it('PhotoViewer signed URL yazdırmaz ve geçici paylaşım dosyasını finally içinde temizler', () => {
    const source = read('src/components/transaction/PhotoViewerModal.tsx');

    expect(source).not.toContain('[PhotoViewer] Got signed URL:');
    expect(source).toMatch(
      /let temporaryShareUri: string \| null = null;[\s\S]*?finally \{[\s\S]*?FileSystem\.deleteAsync\(temporaryShareUri, \{ idempotent: true \}\)/,
    );
  });
});
