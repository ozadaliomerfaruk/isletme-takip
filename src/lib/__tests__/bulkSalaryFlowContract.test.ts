import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../../..');
const read = (relativePath: string) =>
  fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

describe('toplu maaş istemci akışı sözleşmesi', () => {
  const screen = read('src/app/personel/toplu-gider.tsx');
  const hooks = read('src/hooks/useIslemler.ts');

  it('ağ kuyruğunu sınırlayıp tekil başarı yan etkilerini erteler', () => {
    expect(screen).toContain('const BULK_SALARY_CONCURRENCY = 4;');
    expect(screen).toContain(
      'useCreateIslem({ deferSuccessEffects: true })',
    );
    expect(screen).toContain('runSettledWithConcurrency(');
    expect(screen.match(/invalidateRelatedQueries\(queryClient, 'islem'\)/g))
      .toHaveLength(1);
    expect(screen.match(/logEvent\('bulk_salary_save_completed'/g))
      .toHaveLength(1);
  });

  it('her personel için tekrar denemede korunan istemci UUID’si taşır', () => {
    expect(screen).toContain('mutationIdsRef.current[personelId]');
    expect(screen).toContain('Crypto.randomUUID()');
    expect(screen).toContain('id: mutationId');
    expect(screen).toContain('if (savingRef.current) return;');
  });

  it('bloklayıcı ilerleme görünümünü tamamlanan/toplam sayısıyla gösterir', () => {
    expect(screen).toContain('visible={isSaving}');
    expect(screen).toContain('accessibilityRole="progressbar"');
    expect(screen).toContain('staff:bulkSalary.savingProgress');
    expect(screen).toContain('saveProgress.completed');
    expect(screen).toContain('saveProgress.total');
  });

  it('varsayılan tekil create davranışını koruyup yalnız açıkça ertelenince atlar', () => {
    const start = hooks.indexOf('export function useCreateIslem(');
    const end = hooks.indexOf('export function useCreateIslemV2()', start);
    const body = hooks.slice(start, end);

    expect(body).toContain('options: UseCreateIslemOptions = {}');
    expect(body).toContain('if (options.deferSuccessEffects) return;');
    expect(body).toContain("invalidateRelatedQueries(queryClient, 'islem')");
    expect(body).toContain("logEvent('transaction_created'");
  });
});
