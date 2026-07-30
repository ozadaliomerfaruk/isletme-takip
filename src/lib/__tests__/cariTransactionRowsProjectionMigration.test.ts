import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../../..');
const MIGRATION_PATH =
  'supabase/migrations/20260729081914_add_cari_islem_satirlari_v1_rpc.sql';
const PB_PATH =
  'supabase/migrations/20260729064915_pb_internal_yetki_altyapisi.sql';
const FALLBACK_PATH =
  'docs/security/taslak/get_cari_islem_satirlari_v1-FALLBACK.sql';

const migration = fs.readFileSync(
  path.join(ROOT, MIGRATION_PATH),
  'utf8',
);
const fallback = fs.readFileSync(
  path.join(ROOT, FALLBACK_PATH),
  'utf8',
);
const executableSql = migration
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n');

const returnColumns =
  executableSql.match(/RETURNS TABLE \(([\s\S]*?)\)\s*LANGUAGE/)?.[1] ??
  '';
const normalizedReturnColumns = returnColumns
  .replace(/\s+/g, ' ')
  .replace(/\s*,\s*/g, ', ')
  .trim();

describe('U-4 cari islem satiri projeksiyon migration sozlesmesi', () => {
  it('P-B resolverindan sonra siralanan yeni additive endpointi olusturur', () => {
    expect(MIGRATION_PATH.localeCompare(PB_PATH)).toBeGreaterThan(0);
    expect(executableSql).toMatch(
      /CREATE FUNCTION public\.get_cari_islem_satirlari_v1/,
    );
    expect(executableSql).not.toContain('CREATE OR REPLACE FUNCTION');
  });

  it('exact parametre imzasini ve keyset cursor varsayilanlarini korur', () => {
    expect(executableSql).toMatch(
      /CREATE FUNCTION public\.get_cari_islem_satirlari_v1\(\s*p_isletme_id uuid,\s*p_cari_id uuid,\s*p_limit integer DEFAULT 50,\s*p_before_date timestamp without time zone DEFAULT NULL,\s*p_before_created_at timestamp with time zone DEFAULT NULL,\s*p_before_id uuid DEFAULT NULL\s*\)/s,
    );
  });

  it('yalniz onayli dar kolonlari exact sirayla dondurur', () => {
    expect(normalizedReturnColumns).toBe(
      [
        'id uuid',
        'isletme_id uuid',
        'type text',
        'amount numeric',
        'description text',
        '"date" timestamp without time zone',
        'source_currency text',
        'target_currency text',
        'exchange_rate numeric',
        'vade_tarihi date',
        'photo_path text',
        'created_by uuid',
        'created_at timestamp with time zone',
        'updated_at timestamp with time zone',
        'kategori_name text',
        'hesap_name text',
      ].join(', '),
    );

    expect(returnColumns.match(/\b[a-z_]*photo[a-z_]*\b/gi)).toEqual([
      'photo_path',
    ]);
    expect(returnColumns).not.toMatch(
      /\b(?:hesap_id|kategori_id|cari_id|balance|initial_balance|email|phone|address|tax_number|notes|permissions|updated_by)\b/,
    );
    expect(executableSql).not.toMatch(/SELECT\s+[^;]*\*/i);
  });

  it('limit ve eksik cursor uclusunu 22023 ile reddeder', () => {
    expect(executableSql).toMatch(
      /p_limit IS NULL\s+OR p_limit < 1\s+OR p_limit > 100/s,
    );
    expect(executableSql).toMatch(
      /\(\s*p_before_date IS NULL\s+AND p_before_created_at IS NULL\s+AND p_before_id IS NULL\s*\)\s+OR\s+\(\s*p_before_date IS NOT NULL\s+AND p_before_created_at IS NOT NULL\s+AND p_before_id IS NOT NULL\s*\)/s,
    );
    expect(
      executableSql.match(
        /RAISE EXCEPTION 'CARI_TRANSACTION_ROWS_INVALID_INPUT'\s+USING ERRCODE = '22023';/g,
      ),
    ).toHaveLength(2);
  });

  it('Cariler can_view ve global sahiplik bayragini kanonik resolverdan alir', () => {
    expect(executableSql).toMatch(
      /FROM internal\.etkin_yetki\(\s*p_isletme_id,\s*'cariler'\s*\) AS permission\s+LIMIT 1;/s,
    );
    expect(executableSql).toContain('permission.can_view');
    expect(executableSql).toContain(
      'permission.can_see_all_users_data',
    );
    expect(executableSql).toContain(
      'v_uid IS NULL OR v_can_view IS NOT TRUE',
    );
    expect(executableSql).toMatch(
      /v_can_see_all_users_data IS TRUE\s+OR islem\.created_by = v_uid/,
    );
    // Resolver'in mevcut imzasi arsiv/pasif bayraklarini dondurmedigi icin
    // parent entity gorunurlugu, mevcut RLS'teki iki exact-jsonb bayrakla
    // tamamlanir. Aksiyon/level burada tekrar yorumlanamaz.
    expect(executableSql).toMatch(
      /uye\.permissions->'visibility'->'can_see_archived'\s+= 'true'::pg_catalog\.jsonb/,
    );
    expect(executableSql).toMatch(
      /uye\.permissions->'visibility'->'can_see_passive'\s+= 'true'::pg_catalog\.jsonb/,
    );
    expect(executableSql).not.toMatch(
      /uye\.permissions->(?:'actions'|'modules'|'level')/,
    );
    expect(executableSql).not.toMatch(
      /uye\.permissions->'visibility'->>'can_see_(?:archived|passive)'/,
    );
    expect(executableSql).not.toMatch(
      /\(uye\.permissions[\s\S]{0,120}\)::boolean/,
    );
  });

  it('parent cari gorunurlugunu tenant, sahiplik, arsiv ve pasif kurallariyla kapatir', () => {
    expect(executableSql).toMatch(
      /IF NOT EXISTS \(\s*SELECT 1\s+FROM public\.cariler AS cari\s+WHERE cari\.id = p_cari_id\s+AND cari\.isletme_id = p_isletme_id[\s\S]*v_is_owner IS TRUE\s+OR \([\s\S]*v_can_see_all_users_data IS TRUE\s+OR cari\.created_by = v_uid[\s\S]*v_can_see_archived IS TRUE\s+OR cari\.is_archived IS FALSE[\s\S]*v_can_see_passive IS TRUE\s+OR cari\.is_active IS TRUE[\s\S]*\) THEN/s,
    );
    expect(executableSql).toMatch(
      /FROM public\.isletmeler AS isletme\s+WHERE isletme\.id = p_isletme_id\s+AND isletme\.user_id = v_uid/s,
    );
    expect(
      executableSql.match(
        /RAISE EXCEPTION 'CARI_TRANSACTION_ROWS_NOT_AUTHORIZED'\s+USING ERRCODE = '42501';/g,
      ),
    ).toHaveLength(2);
  });

  it('yalniz exact Cariler tip eslemesini ve secilen cari satirlarini kabul eder', () => {
    expect(executableSql).toContain(
      'islem.isletme_id = p_isletme_id',
    );
    expect(executableSql).toContain('islem.cari_id = p_cari_id');
    expect(executableSql).toMatch(
      /internal\.islem_tipi_modulu\(islem\.type\)\s+= ARRAY\['cariler'\]::text\[\]/,
    );
    expect(executableSql).not.toMatch(
      /islem\.type\s+IN\s+\('cari_alis'/,
    );
  });

  it('kategori ve hesap adlarini tenant-scoped joinlerle daraltir', () => {
    expect(executableSql).toMatch(
      /LEFT JOIN public\.kategoriler AS kategori\s+ON kategori\.id = islem\.kategori_id\s+AND kategori\.isletme_id = islem\.isletme_id/s,
    );
    expect(executableSql).toMatch(
      /LEFT JOIN public\.hesaplar AS hesap\s+ON hesap\.id = islem\.hesap_id\s+AND hesap\.isletme_id = islem\.isletme_id\s+AND islem\.type IN \('cari_odeme', 'cari_tahsilat'\)/s,
    );
    expect(executableSql).toMatch(
      /CASE\s+WHEN islem\.type IN \('cari_odeme', 'cari_tahsilat'\)\s+THEN hesap\.name::text\s+ELSE NULL::text\s+END AS hesap_name/s,
    );
    expect(executableSql).not.toMatch(/\bhesap\.(?:balance|initial_balance)\b/);
  });

  it('DATE shadow ve timestamp canliyi non-null, deterministik timestamp keysetine cevirir', () => {
    expect(executableSql).toMatch(
      /CROSS JOIN LATERAL \(\s*SELECT COALESCE\(\s*islem\.created_at,\s*islem\.date::timestamp without time zone AT TIME ZONE 'Europe\/Istanbul'\s*\) AS created_at\s*\) AS cursor_key/s,
    );
    expect(executableSql).toContain('cursor_key.created_at');
    expect(executableSql).toMatch(
      /ROW\(\s*islem\.date::timestamp without time zone,\s*cursor_key\.created_at,\s*islem\.id\s*\) < ROW\(\s*p_before_date,\s*p_before_created_at,\s*p_before_id\s*\)/s,
    );
    expect(executableSql).toMatch(
      /ORDER BY\s+islem\.date::timestamp without time zone DESC,\s*cursor_key\.created_at DESC,\s*islem\.id DESC\s+LIMIT p_limit;/s,
    );
  });

  it('SECURITY DEFINER yuzeyini pg_catalog ve exact deny-by-default ACL ile kapatir', () => {
    expect(executableSql).toMatch(
      /LANGUAGE plpgsql\s+STABLE\s+SECURITY DEFINER\s+SET search_path TO 'pg_catalog'/,
    );
    const aclSignature =
      String.raw`public\.get_cari_islem_satirlari_v1\(\s*uuid,\s*uuid,\s*integer,\s*timestamp without time zone,\s*timestamp with time zone,\s*uuid\s*\)`;
    expect(executableSql).toMatch(
      new RegExp(
        String.raw`REVOKE ALL\s+ON FUNCTION ${aclSignature}\s+FROM PUBLIC, anon, authenticated, service_role;`,
      ),
    );
    expect(executableSql).toMatch(
      new RegExp(
        String.raw`GRANT EXECUTE\s+ON FUNCTION ${aclSignature}\s+TO authenticated;`,
      ),
    );
    expect(executableSql).toMatch(
      new RegExp(
        String.raw`ALTER FUNCTION ${aclSignature}\s+OWNER TO postgres;`,
      ),
    );
  });

  it('tablo, index, policy veya mevcut veriyi degistirmez', () => {
    expect(executableSql).not.toMatch(/\bDROP\b/i);
    expect(executableSql).not.toMatch(/\bALTER\s+TABLE\b/i);
    expect(executableSql).not.toMatch(/\bCREATE\s+(?:UNIQUE\s+)?INDEX\b/i);
    expect(executableSql).not.toMatch(/\bCREATE\s+POLICY\b/i);
    expect(executableSql).not.toMatch(/\bINSERT\s+INTO\b/i);
    expect(executableSql).not.toMatch(/\bUPDATE\s+(?:public\.)?[a-z"]/i);
    expect(executableSql).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(executableSql).not.toMatch(/\bTRUNCATE\b/i);
  });

  it('1.5.x etkisini, veri korumasini ve Storage sinirini belgeler', () => {
    expect(migration).toContain('1.5.x');
    expect(migration).toContain('Migration-time DML/backfill yoktur');
    expect(migration).toContain('mevcut SELECT/RLS yolunu aynen kullanir');
    expect(migration).toContain('P-F/Storage policy');
  });

  it('fallback body/ACL drift ve katalog bagimliliginda DROP etmeden durur', () => {
    expect(fallback).toContain('87624d7c96d6d3ed293759accf079a32');
    expect(fallback).toContain('pg_catalog.pg_get_functiondef(v_oid)');
    expect(fallback).toContain("p.proconfig = ARRAY['search_path=pg_catalog']::text[]");
    expect(fallback).toContain(
      "p.proacl::text = '{postgres=X/postgres,authenticated=X/postgres}'",
    );
    expect(fallback).toContain('FROM pg_catalog.pg_depend AS dependency');
    expect(fallback).toContain("dependency.deptype IN ('n', 'a', 'i', 'e')");
    expect(fallback.indexOf('DO $fallback_guard$')).toBeLessThan(
      fallback.indexOf('DROP FUNCTION public.get_cari_islem_satirlari_v1'),
    );
    expect(fallback).toContain('Kullanici verisine DML yapmaz');
    expect(fallback).toContain('yeni RPC');
  });
});
