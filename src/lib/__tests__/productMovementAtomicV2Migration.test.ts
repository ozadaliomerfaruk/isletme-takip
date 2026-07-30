import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../../..');
const MIGRATION = '20260730030523_add_atomic_product_movement_v2.sql';
const migrationPath = path.join(ROOT, 'supabase/migrations', MIGRATION);
const sql = fs.readFileSync(migrationPath, 'utf8');
const hookSource = fs.readFileSync(
  path.join(ROOT, 'src/hooks/useUrunHareketler.ts'),
  'utf8',
);
const productHookSource = fs.readFileSync(
  path.join(ROOT, 'src/hooks/useUrunler.ts'),
  'utf8',
);
const productListSource = fs.readFileSync(
  path.join(ROOT, 'src/app/urunler/index.tsx'),
  'utf8',
);
const accountHookSource = fs.readFileSync(
  path.join(ROOT, 'src/hooks/useHesaplar.ts'),
  'utf8',
);
const customerHookSource = fs.readFileSync(
  path.join(ROOT, 'src/hooks/useCariler.ts'),
  'utf8',
);
const personnelHookSource = fs.readFileSync(
  path.join(ROOT, 'src/hooks/usePersonel.ts'),
  'utf8',
);

function extractFunction(source: string, functionName: string): string {
  const start = source.indexOf(`CREATE FUNCTION public.${functionName}`);
  const end = source.indexOf('$function$;', start);
  if (start < 0 || end < 0) {
    throw new Error(`${functionName} migration içinde bulunamadı`);
  }
  return source.slice(start, end + '$function$;'.length);
}

function extractHook(source: string, hookName: string, nextHookName: string): string {
  const start = source.indexOf(`export function ${hookName}`);
  const end = source.indexOf(`export function ${nextHookName}`, start);
  if (start < 0 || end < 0) {
    throw new Error(`${hookName} hook bloğu bulunamadı`);
  }
  return source.slice(start, end);
}

function extractBlock(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  if (start < 0 || end < 0) {
    throw new Error(`${startMarker} source block not found`);
  }
  return source.slice(start, end);
}

const createFn = extractFunction(sql, 'create_urun_hareket_atomik_v2');
const updateFn = extractFunction(sql, 'update_urun_hareket_atomik_v2');
const deleteFn = extractFunction(sql, 'delete_urun_hareket_atomik_v2');

const createHook = extractHook(
  hookSource,
  'useCreateUrunHareket',
  'useSetUrunMiktarHedef',
);
const updateHook = extractHook(
  hookSource,
  'useUpdateUrunHareket',
  'useDeleteUrunHareket',
);
const deleteHook = extractHook(
  hookSource,
  'useDeleteUrunHareket',
  'useReapplyUrunHareketlerForIslem',
);
const reverseLinkedHook = extractHook(
  hookSource,
  'useReverseAndDeleteUrunHareketlerForIslem',
  'useCreateUrunHareketWithCari',
);
const permanentDeleteHook = productHookSource.slice(
  productHookSource.indexOf('export function usePermanentDeleteUrun'),
);
const linkedMovementCountHelper = productHookSource.slice(
  productHookSource.indexOf('export async function countUrunLinkedMovements'),
  productHookSource.indexOf('export function usePermanentDeleteUrun'),
);
const undoDeleteSetup = productListSource.slice(
  productListSource.indexOf('useUndoDelete<Urun>({'),
  productListSource.indexOf('// Kategori id -> ad map'),
);
const productDeletePreflight = productListSource.slice(
  productListSource.indexOf('const handleDelete = useCallback'),
  productListSource.indexOf('const handleUnarchive = useCallback'),
);
const accountDeleteHook = extractBlock(
  accountHookSource,
  'export function useDeleteHesap',
  '// useTotalBalance',
);
const customerDeleteHook = extractBlock(
  customerHookSource,
  'export function useDeleteCari',
  '// === Cari detay dashboard',
);
const personnelDeleteHook = extractBlock(
  personnelHookSource,
  'export function useDeletePersonel',
  '// Toplam personel borcu',
);

describe('atomik manuel ürün hareketi V2 sözleşmesi', () => {
  it('yalnız yeni fonksiyonlar ekler; tablo, kolon ve eski RPC yüzeyini değiştirmez', () => {
    expect(sql).not.toContain('CREATE OR REPLACE FUNCTION');
    expect(sql).not.toMatch(/\bALTER\s+TABLE\b/i);
    expect(sql).not.toMatch(/\bDROP\s+(TABLE|COLUMN|FUNCTION|POLICY)\b/i);
    expect(sql).not.toMatch(/\bTRUNCATE\b/i);
    expect(sql).not.toMatch(
      /(?:CREATE|REPLACE|ALTER)\s+FUNCTION\s+public\.update_urun_miktar\s*\(/i,
    );
  });

  it('her RPC’de güvenli search_path, kanonik ürün yetkisi ve dar ACL kullanır', () => {
    for (const fn of [createFn, updateFn, deleteFn]) {
      expect(fn).toContain("SET search_path TO ''");
      expect(fn).toContain(
        "internal.etkin_yetki(p_isletme_id, 'urunler')",
      );
      expect(fn).toContain("USING ERRCODE = '42501'");
    }

    for (const functionName of [
      'create_urun_hareket_atomik_v2(uuid, jsonb)',
      'update_urun_hareket_atomik_v2(uuid, uuid, jsonb)',
      'delete_urun_hareket_atomik_v2(uuid, uuid)',
    ]) {
      expect(sql).toContain(`ON FUNCTION public.${functionName}`);
    }
    expect(sql.match(/FROM PUBLIC, anon;/g)).toHaveLength(3);
    expect(sql.match(/TO authenticated;/g)).toHaveLength(3);
  });

  it('stok ve hareket satırını aynı fonksiyon içinde, satır kilidi altında yazar', () => {
    expect(createFn).toContain('FROM public.urunler AS product');
    expect(createFn).toContain('FOR UPDATE;');
    expect(createFn).toContain('UPDATE public.urunler AS product');
    expect(createFn).toContain('INSERT INTO public.urun_hareketler');

    expect(updateFn).toContain('FROM public.urun_hareketler AS movement');
    expect(updateFn.match(/FOR UPDATE;/g)).toHaveLength(2);
    expect(updateFn).toContain('UPDATE public.urunler AS product');
    expect(updateFn).toContain('UPDATE public.urun_hareketler AS movement');

    expect(deleteFn).toContain('FROM public.urun_hareketler AS movement');
    expect(deleteFn.match(/FOR UPDATE;/g)).toHaveLength(2);
    expect(deleteFn).toContain('UPDATE public.urunler AS product');
    expect(deleteFn).toContain('DELETE FROM public.urun_hareketler AS movement');
  });

  it('işleme bağlı manuel update/delete girişimlerini sunucuda kapalı tutar', () => {
    for (const fn of [updateFn, deleteFn]) {
      expect(fn).toContain('v_hareket.islem_id IS NOT NULL');
      expect(fn).toContain('URUN_HAREKET_V2_LINKED_MOVEMENT');
      expect(fn).toContain("USING ERRCODE = '0A000'");
    }
  });

  it('istemci stok ve hareket için iki ayrı write yerine yalnız V2 RPC çağırır', () => {
    expect(createHook).toContain(
      ".rpc('create_urun_hareket_atomik_v2'",
    );
    expect(createHook).not.toContain(".rpc('update_urun_miktar'");
    expect(createHook).not.toContain(".from('urun_hareketler')\n        .insert");

    expect(updateHook).toContain(
      ".rpc('update_urun_hareket_atomik_v2'",
    );
    expect(updateHook).not.toContain(".rpc('update_urun_miktar'");
    expect(updateHook).not.toContain(".from('urun_hareketler')\n        .update");

    expect(deleteHook).toContain(
      ".rpc('delete_urun_hareket_atomik_v2'",
    );
    expect(deleteHook).not.toContain(".rpc('update_urun_miktar'");
    expect(deleteHook).not.toContain(".from('urun_hareketler')\n        .delete");
  });

  it('işleme bağlı hareketleri geri alma uyumluluk hook’u da tek atomik RPC kullanır', () => {
    expect(reverseLinkedHook).toContain(
      ".rpc('reapply_urun_hareketler_for_islem'",
    );
    expect(reverseLinkedHook).toContain('p_items: []');
    expect(reverseLinkedHook).not.toContain(".rpc('update_urun_miktar'");
    expect(reverseLinkedHook).not.toMatch(
      /\.from\('urun_hareketler'\)\s*\.delete\(\)/,
    );
  });

  it('kalıcı ürün silme manuel hareketleri istemciden önceden silmez', () => {
    expect(permanentDeleteHook).toContain(".from('urunler')");
    expect(permanentDeleteHook).toContain('.delete()');
    expect(permanentDeleteHook).toMatch(
      /\.from\('urunler'\)\s*\.delete\(\)\s*\.eq\('id', id\)\s*\.eq\('isletme_id', isletme\.id\)\s*\.select\('id'\)\s*\.single\(\)/,
    );
    expect(permanentDeleteHook).not.toMatch(
      /\.from\('urun_hareketler'\)\s*\.delete\(\)/,
    );
  });

  it('kalıcı ürün silmede notları istemciden önceden güncellemez ve iki sayım hatasını da yükseltir', () => {
    expect(permanentDeleteHook).not.toMatch(
      /\.from\('notlar'\)\s*\.update\(/,
    );
    expect(linkedMovementCountHelper).toMatch(
      /const \{ count, error \} = await supabase[\s\S]*?if \(error\) throw error;/
    );
    expect(permanentDeleteHook).toMatch(
      /const \{ count: linkedCount, error: linkedCountError \} = await supabase[\s\S]*?if \(linkedCountError\) throw linkedCountError;/
    );
  });

  it('ürün listesi preflight ve undo commit hatalarında fail-closed bildirim verir', () => {
    expect(productDeletePreflight).toMatch(
      /catch \(error\) \{[\s\S]*?showToast\([\s\S]*?'error',[\s\S]*?\);\s+return;\s+\}[\s\S]*?requestDelete\(/
    );
    expect(undoDeleteSetup).toContain('onError: (error) =>');
    expect(undoDeleteSetup).toContain(
      "toErrorMessage(error, t('common:messages.operationFailed'))",
    );
    expect(undoDeleteSetup).toContain("'error',");
  });
});

describe('entity permanent-delete client contract', () => {
  it.each([
    {
      name: 'hesap',
      hook: accountDeleteHook,
      table: 'hesaplar',
      counts: [
        ['islemCount', 'islemCountError'],
        ['ileriCount', 'ileriCountError'],
      ],
    },
    {
      name: 'cari',
      hook: customerDeleteHook,
      table: 'cariler',
      counts: [
        ['islemCount', 'islemCountError'],
        ['scheduledCount', 'scheduledCountError'],
        ['sharedCount', 'sharedCountError'],
      ],
    },
    {
      name: 'personel',
      hook: personnelDeleteHook,
      table: 'personel',
      counts: [
        ['islemCount', 'islemCountError'],
        ['scheduledCount', 'scheduledCountError'],
      ],
    },
  ])('$name delete hook is server-atomic and fail-closed', ({
    hook,
    table,
    counts,
  }) => {
    expect(hook).not.toMatch(/\.from\('notlar'\)\s*\.update\(/);
    expect(hook).toMatch(
      new RegExp(
        `\\.from\\('${table}'\\)\\s*\\.delete\\(\\)\\s*`
        + `\\.eq\\('id', id\\)\\s*\\.eq\\('isletme_id', isletme\\.id\\)\\s*`
        + `\\.select\\('id'\\)\\s*\\.single\\(\\)`,
      ),
    );

    for (const [countName, errorName] of counts) {
      expect(hook).toMatch(
        new RegExp(
          `const \\{ count: ${countName}, error: ${errorName} \\} = await supabase`
          + `[\\s\\S]*?if \\(${errorName}\\) throw ${errorName};`,
        ),
      );
    }
  });
});
