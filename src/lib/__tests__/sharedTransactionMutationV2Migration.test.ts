import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../../..');
const MIGRATION = '20260729212713_shared_transaction_mutation_v2.sql';
const migrationPath = path.join(ROOT, 'supabase/migrations', MIGRATION);
const sql = fs.readFileSync(migrationPath, 'utf8');
const executableSql = sql
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n');

function extractFunction(qualifiedName: string): string {
  const start = sql.indexOf(`CREATE FUNCTION ${qualifiedName}`);
  const end = sql.indexOf('$function$;', start);
  if (start < 0 || end < 0) {
    throw new Error(`${qualifiedName} migration içinde bulunamadı`);
  }
  return sql.slice(start, end + '$function$;'.length);
}

function extractReturnsTable(fn: string): string {
  const returns = fn.match(/RETURNS TABLE \(([\s\S]*?)\)\s*LANGUAGE/)?.[1];
  if (!returns) throw new Error('RETURNS TABLE sözleşmesi bulunamadı');
  return returns;
}

const guardFn = extractFunction('internal.get_islem_mutation_row_v1');
const contextFn = extractFunction('public.get_islem_mutation_context_v1');
const updateFn = extractFunction('public.update_islem_atomik_v2');
const deleteFn = extractFunction('public.delete_islem_atomik_v2');

const expectedProjection = [
  'id uuid',
  'type text',
  'amount numeric',
  'description text',
  'date timestamp without time zone',
  'hesap_id uuid',
  'hedef_hesap_id uuid',
  'kategori_id uuid',
  'cari_id uuid',
  'personel_id uuid',
  'source_currency text',
  'target_currency text',
  'exchange_rate numeric',
  'date_end text',
  'vade_tarihi date',
  'created_by uuid',
];

describe('P0-S2B shared transaction mutation V2 migration contract', () => {
  it('is additive and leaves tables, policies, data and legacy functions untouched', () => {
    expect(path.basename(migrationPath)).toBe(MIGRATION);
    expect(executableSql).not.toContain('CREATE OR REPLACE FUNCTION');
    expect(executableSql).not.toMatch(/\bALTER\s+TABLE\b/i);
    expect(executableSql).not.toMatch(/\bCREATE\s+POLICY\b/i);
    expect(executableSql).not.toMatch(/\bDROP\s+(TABLE|COLUMN|FUNCTION)\b/i);
    expect(executableSql).not.toMatch(/\bTRUNCATE\b/i);
    expect(executableSql).not.toMatch(/\bINSERT\s+INTO\b/i);
    expect(executableSql).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(executableSql).not.toMatch(
      /\bUPDATE\s+public\.(?:islemler|hesaplar|cariler|personel|urunler)\b/i,
    );
    expect(executableSql).not.toMatch(
      /(?:CREATE|REPLACE|ALTER)\s+FUNCTION\s+public\.(?:update_islem_atomik|delete_islem_atomik)\s*\(/i,
    );
  });

  it('exposes the same exact 16-field, balance-free context and update projection', () => {
    const contextReturns = extractReturnsTable(contextFn);
    const updateReturns = extractReturnsTable(updateFn);

    for (const column of expectedProjection) {
      expect(contextReturns).toContain(column);
      expect(updateReturns).toContain(column);
    }

    expect(
      contextReturns
        .split(',')
        .map((column) => column.trim())
        .filter(Boolean),
    ).toEqual(expectedProjection);
    expect(
      updateReturns
        .split(',')
        .map((column) => column.trim())
        .filter(Boolean),
    ).toEqual(expectedProjection);

    for (const forbidden of [
      'isletme_id',
      'photo_path',
      'source_ileri_id',
      'hedef_islem_id',
      'created_at',
      'updated_at',
      'updated_by',
      'balance',
    ]) {
      expect(contextReturns).not.toContain(forbidden);
      expect(updateReturns).not.toContain(forbidden);
    }
  });

  it('uses an exact update/delete action parameter and own/all capability gates', () => {
    expect(contextFn).toMatch(
      /p_action text DEFAULT 'update'[\s\S]*?internal\.get_islem_mutation_row_v1\([\s\S]*?p_action,[\s\S]*?false/,
    );
    expect(guardFn).toContain("p_action NOT IN ('update', 'delete')");
    expect(guardFn).toContain('permission.can_update_own');
    expect(guardFn).toContain('permission.can_update_all');
    expect(guardFn).toContain('permission.can_delete_own');
    expect(guardFn).toContain('permission.can_delete_all');
    expect(guardFn).toMatch(
      /v_can_update_all IS TRUE[\s\S]*?v_can_update_own IS TRUE[\s\S]*?v_row\.created_by = v_uid/,
    );
    expect(guardFn).toMatch(
      /v_can_delete_all IS TRUE[\s\S]*?v_can_delete_own IS TRUE[\s\S]*?v_row\.created_by = v_uid/,
    );
  });

  it('requires every real source module and preserves K13/P+H semantics', () => {
    const resolverMigration = fs.readFileSync(
      path.join(
        ROOT,
        'supabase/migrations/20260729064915_pb_internal_yetki_altyapisi.sql',
      ),
      'utf8',
    );

    expect(guardFn).toContain(
      'v_modules := internal.islem_tipi_modulu(v_row.type::text);',
    );
    expect(guardFn).toMatch(
      /FOREACH v_module IN ARRAY v_modules[\s\S]*?internal\.etkin_yetki\(p_isletme_id, v_module\)/,
    );
    expect(resolverMigration).toMatch(
      /WHEN 'cari_odeme'\s+THEN ARRAY\['cariler'\]/,
    );
    expect(resolverMigration).toMatch(
      /WHEN 'cari_tahsilat'\s+THEN ARRAY\['cariler'\]/,
    );
    expect(resolverMigration).toMatch(
      /WHEN 'personel_odeme'\s+THEN ARRAY\['personel','hesaplar'\]/,
    );
    expect(resolverMigration).toMatch(
      /WHEN 'personel_tahsilat'\s+THEN ARRAY\['personel','hesaplar'\]/,
    );
    expect(guardFn).toContain(
      "internal.etkin_yetki(p_isletme_id, 'birikim')",
    );
  });

  it('supports all normal Cari/Personel types with exact immutable entity shapes', () => {
    for (const type of [
      'cari_alis',
      'cari_satis',
      'cari_alis_iade',
      'cari_satis_iade',
      'cari_odeme',
      'cari_tahsilat',
      'personel_gider',
      'personel_satis',
      'personel_odeme',
      'personel_tahsilat',
      'personel_izin_hakki',
      'personel_izin_kullanimi',
    ]) {
      expect(guardFn).toContain(`'${type}'`);
      expect(guardFn).toContain(`WHEN '${type}' THEN`);
    }
    expect(guardFn).toMatch(
      /WHEN 'cari_odeme' THEN[\s\S]*?v_row\.cari_id IS NOT NULL[\s\S]*?v_row\.hesap_id IS NOT NULL/,
    );
    expect(guardFn).toMatch(
      /WHEN 'personel_odeme' THEN[\s\S]*?v_row\.personel_id IS NOT NULL[\s\S]*?v_row\.hesap_id IS NOT NULL/,
    );
  });

  it('fails closed for linked, scheduled, product, installment and photo-delete flows', () => {
    expect(guardFn).toContain('ISLEM_MUTATION_V2_LINKED_CARI_UNSUPPORTED');
    expect(guardFn).toContain('FROM public.cari_links AS link');
    expect(guardFn).toContain('v_row.source_ileri_id IS NOT NULL');
    expect(guardFn).toContain('FROM public.urun_hareketler AS movement');
    expect(guardFn).toContain('FROM public.taksit_planlari AS installment_plan');
    expect(guardFn).toContain(
      "p_action = 'delete' AND v_row.photo_path IS NOT NULL",
    );
    expect(guardFn).toContain('ISLEM_MUTATION_V2_FEATURE_UNSUPPORTED');
    expect(guardFn).toContain("USING ERRCODE = '0A000'");
  });

  it('accepts only the approved patch keys and keeps photo/type/entity pointers immutable', () => {
    const allowlistStart = updateFn.indexOf(
      'WHERE patch_key.key_name NOT IN (',
    );
    const allowlistEnd = updateFn.indexOf(
      "OR (\n       p_patch ? 'amount'",
      allowlistStart,
    );
    const allowlist = updateFn.slice(allowlistStart, allowlistEnd);

    for (const allowed of [
      'amount',
      'description',
      'date',
      'kategori_id',
      'date_end',
      'vade_tarihi',
      'exchange_rate',
    ]) {
      expect(allowlist).toContain(`'${allowed}'`);
    }
    for (const forbidden of [
      'type',
      'hesap_id',
      'hedef_hesap_id',
      'cari_id',
      'personel_id',
      'source_currency',
      'target_currency',
      'photo_path',
      'source_ileri_id',
      'hedef_islem_id',
      'created_by',
      'isletme_id',
    ]) {
      expect(allowlist).not.toContain(`'${forbidden}'`);
    }
    expect(updateFn).toContain("p_patch = '{}'::jsonb");
    expect(updateFn).not.toContain('jsonb_object_length');
    expect(updateFn).toContain(
      'photo_path, source_ileri_id, hedef_islem_id, type ve entity baglari',
    );
  });

  it('takes no client balance operations and delegates only server-derived ops', () => {
    expect(updateFn).toMatch(
      /update_islem_atomik_v2\(\s*p_isletme_id uuid,\s*p_islem_id uuid,\s*p_patch jsonb\s*\)/,
    );
    expect(deleteFn).toMatch(
      /delete_islem_atomik_v2\(\s*p_isletme_id uuid,\s*p_islem_id uuid\s*\)/,
    );
    expect(updateFn).not.toContain('p_balance_ops');
    expect(deleteFn).not.toContain('p_balance_ops');
    expect(updateFn).toContain('FROM internal.bakiye_ops(v_old_canonical)');
    expect(updateFn).toContain('FROM internal.bakiye_ops(v_new_canonical)');
    expect(deleteFn).toContain('FROM internal.bakiye_ops(v_old_canonical)');
    expect(updateFn).toMatch(
      /PERFORM public\.update_islem_atomik\([\s\S]*?v_balance_ops,[\s\S]*?pg_catalog\.to_jsonb\(v_new\)/,
    );
    expect(deleteFn).toMatch(
      /PERFORM public\.delete_islem_atomik\([\s\S]*?v_balance_ops/,
    );
    expect(updateFn).not.toContain('public.increment_balance');
    expect(deleteFn).not.toContain('public.increment_balance');
  });

  it('uses hardened security-definer search paths and auth-only ACLs', () => {
    for (const fn of [guardFn, contextFn, updateFn, deleteFn]) {
      expect(fn).toMatch(
        /LANGUAGE plpgsql\s+VOLATILE\s+SECURITY DEFINER\s+SET search_path TO ''/,
      );
    }
    expect(sql).toMatch(
      /REVOKE ALL\s+ON FUNCTION internal\.get_islem_mutation_row_v1\(uuid, uuid, text, boolean\)\s+FROM PUBLIC, anon, authenticated, service_role;/,
    );
    expect(sql).not.toMatch(
      /GRANT EXECUTE\s+ON FUNCTION internal\.get_islem_mutation_row_v1/,
    );
    for (const signature of [
      'get_islem_mutation_context_v1\\(uuid, uuid, text\\)',
      'update_islem_atomik_v2\\(uuid, uuid, jsonb\\)',
      'delete_islem_atomik_v2\\(uuid, uuid\\)',
    ]) {
      expect(sql).toMatch(
        new RegExp(
          `REVOKE ALL\\s+ON FUNCTION public\\.${signature}\\s+FROM PUBLIC, anon, authenticated, service_role;`,
        ),
      );
      expect(sql).toMatch(
        new RegExp(
          `GRANT EXECUTE\\s+ON FUNCTION public\\.${signature}\\s+TO authenticated;`,
        ),
      );
    }
  });

  it('documents zero impact for 1.5.x clients and the no-DML migration boundary', () => {
    expect(sql).toContain('1.5.x / ESKI CLIENT ETKISI');
    expect(sql).toContain('SIFIR: eski istemci');
    expect(sql).toContain('migration-time DML ve backfill YOK');
    expect(deleteFn).toMatch(/RETURNS uuid/);
    expect(deleteFn).toContain('RETURN p_islem_id;');
  });
});
