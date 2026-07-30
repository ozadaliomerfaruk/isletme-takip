import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../../..');
const MIGRATION =
  '20260729121123_create_islem_atomik_v2.sql';
const migrationPath = path.join(ROOT, 'supabase/migrations', MIGRATION);
const sql = fs.readFileSync(migrationPath, 'utf8');
const executableSql = sql
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n');

function extractFunction(): string {
  const start = sql.indexOf(
    'CREATE FUNCTION public.create_islem_atomik_v2',
  );
  const end = sql.indexOf('$function$;', start);
  if (start < 0 || end < 0) {
    throw new Error('create_islem_atomik_v2 migration içinde bulunamadı');
  }
  return sql.slice(start, end + '$function$;'.length);
}

const fn = extractFunction();

describe('P0-S2A create_islem_atomik_v2 migration contract', () => {
  it('is create-only and leaves every legacy write surface untouched', () => {
    expect(path.basename(migrationPath)).toBe(MIGRATION);
    expect(executableSql).toMatch(
      /CREATE FUNCTION public\.create_islem_atomik_v2\(/,
    );
    expect(executableSql).not.toContain('CREATE OR REPLACE FUNCTION');
    expect(executableSql).not.toMatch(/\bALTER\s+TABLE\b/i);
    expect(executableSql).not.toMatch(/\bDROP\s+(TABLE|COLUMN|FUNCTION)\b/i);
    expect(executableSql).not.toMatch(/\bCREATE\s+POLICY\b/i);
    expect(executableSql).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(executableSql).not.toMatch(/\bTRUNCATE\b/i);
    expect(executableSql).not.toMatch(
      /(?:CREATE|REPLACE|ALTER)\s+FUNCTION\s+public\.(?:create_islem_atomik|increment_balance|complete_ileri_tarihli_islem_atomik)\b/i,
    );
  });

  it('takes no client balance ops and exposes a balance-free fixed projection', () => {
    expect(fn).toMatch(
      /create_islem_atomik_v2\(\s*p_isletme_id uuid,\s*p_new_row jsonb\s*\)/,
    );
    expect(fn).not.toContain('p_balance_ops');
    expect(fn).not.toMatch(
      /(?:PERFORM|SELECT)\s+public\.increment_balance\s*\(/,
    );
    const returns = fn.match(/RETURNS TABLE \(([\s\S]*?)\)\s*LANGUAGE/)?.[1];
    expect(returns).toBeDefined();
    expect(returns).not.toMatch(
      /\bbalance\b|initial_balance|credit_limit|permissions|isletme_id/i,
    );
    expect(returns).toContain('created_by uuid');
  });

  it('uses auth, active tenant and the canonical exact capability resolver', () => {
    expect(fn).toContain('v_uid uuid := auth.uid()');
    expect(fn).toMatch(
      /FROM public\.isletmeler AS isl[\s\S]*?FOR SHARE;/,
    );
    expect(fn).toMatch(
      /FROM public\.isletme_users AS iu[\s\S]*?iu\.status = 'active'[\s\S]*?FOR SHARE;/,
    );
    expect(fn).toMatch(
      /SELECT permission\.can_create[\s\S]*?internal\.etkin_yetki\(p_isletme_id, 'islemler'\)/,
    );
    expect(fn).toContain(
      'v_modules := internal.islem_tipi_modulu(v_type);',
    );
    expect(fn).toMatch(
      /FOREACH v_module IN ARRAY v_modules[\s\S]*?SELECT permission\.can_view[\s\S]*?internal\.etkin_yetki\(p_isletme_id, v_module\)/,
    );
  });

  it('proves K13 cariler-only cash semantics and savings fail-closed gate', () => {
    const resolverMigration = fs.readFileSync(
      path.join(
        ROOT,
        'supabase/migrations/20260729064915_pb_internal_yetki_altyapisi.sql',
      ),
      'utf8',
    );
    expect(resolverMigration).toMatch(
      /WHEN 'cari_odeme'\s+THEN ARRAY\['cariler'\]/,
    );
    expect(resolverMigration).toMatch(
      /WHEN 'cari_tahsilat'\s+THEN ARRAY\['cariler'\]/,
    );
    expect(fn).toContain("v_account.account_type = 'birikim'");
    expect(fn).toContain(
      "internal.etkin_yetki(p_isletme_id, 'birikim')",
    );
    expect(sql).toContain('Hesaplar modulu zorunlu degildir');
  });

  it('rejects spoofed fields and validates exact entity shapes', () => {
    expect(fn).toContain('pg_catalog.jsonb_object_keys(p_new_row)');
    for (const serverOwned of [
      'isletme_id',
      'created_by',
      'updated_by',
      'created_at',
      'updated_at',
    ]) {
      const allowlist = fn.slice(
        fn.indexOf("WHERE payload_key.key_name NOT IN ("),
        fn.indexOf("OR pg_catalog.jsonb_typeof", fn.indexOf("WHERE payload_key.key_name NOT IN (")),
      );
      expect(allowlist).not.toContain(`'${serverOwned}'`);
    }
    expect(fn).toContain("WHEN 'transfer' THEN");
    expect(fn).toContain(
      'v_hesap_id IS DISTINCT FROM v_hedef_hesap_id',
    );
    expect(fn).toContain("WHEN 'cari_odeme' THEN");
    expect(fn).toContain("WHEN 'personel_odeme' THEN");
  });

  it('locks validated entities in deterministic order and derives currencies from them', () => {
    const cari = fn.indexOf('FROM public.cariler AS c');
    const personel = fn.indexOf('FROM public.personel AS p');
    const hesap = fn.indexOf('FROM public.hesaplar AS h');
    const kategori = fn.indexOf('FROM public.kategoriler AS k');
    const invoice = fn.indexOf('FROM public.islemler AS invoice');
    expect(cari).toBeGreaterThan(-1);
    expect(personel).toBeGreaterThan(cari);
    expect(hesap).toBeGreaterThan(personel);
    expect(kategori).toBeGreaterThan(hesap);
    expect(invoice).toBeGreaterThan(kategori);
    expect(fn).toMatch(
      /FROM public\.hesaplar AS h[\s\S]*?ORDER BY h\.id[\s\S]*?FOR NO KEY UPDATE/,
    );
    expect(fn).toContain(
      'Para birimleri yalniz kilitli DB entity satirlarindan turetilir',
    );
  });

  it('derives and applies balance effects only on the server', () => {
    expect(fn).toContain('FROM internal.bakiye_ops(v_canonical)');
    expect(fn).toMatch(
      /UPDATE public\.cariler AS c[\s\S]*?c\.isletme_id = p_isletme_id/,
    );
    expect(fn).toMatch(
      /UPDATE public\.personel AS p[\s\S]*?p\.isletme_id = p_isletme_id/,
    );
    expect(fn).toMatch(
      /UPDATE public\.hesaplar AS h[\s\S]*?h\.isletme_id = p_isletme_id/,
    );
    expect(fn).toContain('ISLEM_V2_BALANCE_CONTRACT_DRIFT');
    expect(fn).toContain('ISLEM_V2_BALANCE_OUT_OF_RANGE');
  });

  it('has creator-bound canonical UUID idempotency before any balance write', () => {
    const preProbe = fn.indexOf('Idempotency pre-probe');
    const insert = fn.indexOf('INSERT INTO public.islemler');
    const balanceWrite = fn.indexOf('UPDATE public.cariler AS c');
    expect(preProbe).toBeGreaterThan(-1);
    expect(preProbe).toBeLessThan(insert);
    expect(insert).toBeLessThan(balanceWrite);
    expect(fn).toContain(
      'ON CONFLICT ON CONSTRAINT islemler_pkey DO NOTHING',
    );
    expect(fn).toContain('v_existing.created_by IS DISTINCT FROM v_uid');
    expect(fn).toContain('ISLEM_V2_IDEMPOTENCY_CONFLICT');
    expect(fn).toContain("USING ERRCODE = '23505'");
    expect(fn).toContain('ISLEM_V2_IDEMPOTENCY_PAYLOAD_MISMATCH');
    expect(fn).toContain("USING ERRCODE = '22023'");
  });

  it('keeps linked-viewer, Storage, scheduled and product subwrites outside this slice', () => {
    expect(fn).toContain('ISLEM_V2_LINKED_CARI_UNSUPPORTED');
    expect(fn).toContain('FROM public.cari_links AS link');
    expect(fn).toContain('v_photo_path IS NOT NULL');
    expect(fn).toContain('v_source_ileri_id IS NOT NULL');
    expect(fn).toContain("USING ERRCODE = '0A000'");
    expect(fn).not.toContain('urun_hareket');
    expect(sql).toContain('Ileri tarihli tamamlama bilerek V1 motorunda kalir');
  });

  it('uses the one FIFO engine and hardened auth-only ACL', () => {
    expect(fn).toContain('PERFORM public.tahsis_odeme_esitle');
    expect(fn).toContain('PERFORM public.tahsis_avans_supur');
    expect(fn).toMatch(
      /LANGUAGE plpgsql\s+SECURITY DEFINER\s+SET search_path TO ''/,
    );
    expect(sql).toMatch(
      /REVOKE ALL\s+ON FUNCTION public\.create_islem_atomik_v2\(uuid, jsonb\)\s+FROM PUBLIC, anon, authenticated, service_role;/,
    );
    expect(sql).toMatch(
      /GRANT EXECUTE\s+ON FUNCTION public\.create_islem_atomik_v2\(uuid, jsonb\)\s+TO authenticated;/,
    );
    expect(sql).toContain('1.5.x / ESKI CLIENT ETKISI');
  });
});
