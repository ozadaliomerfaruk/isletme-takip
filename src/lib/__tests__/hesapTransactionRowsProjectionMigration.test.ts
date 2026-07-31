import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../../..');
const MIGRATION_PATH =
  'supabase/migrations/20260729182030_add_hesap_islem_satirlari_v1_rpc.sql';
const PB_PATH =
  'supabase/migrations/20260729064915_pb_internal_yetki_altyapisi.sql';

const migration = fs.readFileSync(
  path.join(ROOT, MIGRATION_PATH),
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

describe('P0-S7 hesap islem satiri projection migration sozlesmesi', () => {
  it('PB resolverindan sonra additive ve yeni endpoint olusturur', () => {
    expect(MIGRATION_PATH.localeCompare(PB_PATH)).toBeGreaterThan(0);
    expect(executableSql).toMatch(
      /CREATE FUNCTION public\.get_hesap_islem_satirlari_v1/,
    );
    expect(executableSql).not.toContain('CREATE OR REPLACE FUNCTION');
  });

  it('exact imza, default limit ve uc alanli cursor sozlesmesini korur', () => {
    expect(executableSql).toMatch(
      /CREATE FUNCTION public\.get_hesap_islem_satirlari_v1\(\s*p_isletme_id uuid,\s*p_hesap_id uuid,\s*p_limit integer DEFAULT 50,\s*p_before_date timestamp without time zone DEFAULT NULL,\s*p_before_created_at timestamp with time zone DEFAULT NULL,\s*p_before_id uuid DEFAULT NULL\s*\)/s,
    );
    expect(executableSql).toMatch(
      /p_limit IS NULL\s+OR p_limit < 1\s+OR p_limit > 100/s,
    );
    expect(executableSql).toMatch(
      /\(\s*p_before_date IS NULL\s+AND p_before_created_at IS NULL\s+AND p_before_id IS NULL\s*\)\s+OR\s+\(\s*p_before_date IS NOT NULL\s+AND p_before_created_at IS NOT NULL\s+AND p_before_id IS NOT NULL\s*\)/s,
    );
  });

  it('yalniz onayli kolonlari exact sirayla dondurur', () => {
    expect(normalizedReturnColumns).toBe(
      [
        'id uuid',
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
        'source_account_name text',
        'target_account_name text',
        'counterparty_kind text',
        'counterparty_name text',
      ].join(', '),
    );
    expect(returnColumns).not.toMatch(
      /\b(?:isletme_id|hesap_id|hedef_hesap_id|cari_id|personel_id|kategori_id|updated_by|source_ileri_id|hedef_islem_id)\b/,
    );
  });

  it('auth uid, hesap yetkisi, own/all ve arsiv-pasif-birikim kapilarini uygular', () => {
    expect(executableSql).toContain('v_uid uuid := auth.uid();');
    expect(executableSql).toMatch(
      /FROM internal\.etkin_yetki\(\s*p_isletme_id,\s*'hesaplar'\s*\)/s,
    );
    expect(executableSql).toMatch(
      /v_can_see_all_users_data IS TRUE\s+OR islem\.created_by = v_uid/g,
    );
    expect(executableSql).toMatch(
      /FROM internal\.etkin_yetki\(\s*p_isletme_id,\s*'birikim'\s*\)/s,
    );
    expect(executableSql).toMatch(
      /hesap\.type <> 'birikim'\s+OR v_can_view_birikim IS TRUE/s,
    );
    expect(executableSql).toMatch(
      /uye\.permissions->'visibility'->'can_see_archived'\s+= 'true'::pg_catalog\.jsonb/,
    );
    expect(executableSql).toMatch(
      /uye\.permissions->'visibility'->'can_see_passive'\s+= 'true'::pg_catalog\.jsonb/,
    );
    expect(executableSql).not.toMatch(
      /uye\.permissions->'visibility'->>'can_see_(?:archived|passive)'/,
    );
  });

  it('kanonik H, H+C ve H+P matrisini helper uzerinden deny-by-default uygular', () => {
    expect(executableSql).toMatch(
      /internal\.islem_tipi_modulu\(islem\.type\)\s+= ARRAY\['hesaplar'\]::text\[\]/,
    );
    expect(executableSql).toMatch(
      /internal\.islem_tipi_modulu\(islem\.type\)\s+= ARRAY\['cariler'\]::text\[\][\s\S]*v_can_view_cariler IS TRUE/,
    );
    expect(executableSql).toMatch(
      /internal\.islem_tipi_modulu\(islem\.type\)\s+= ARRAY\['personel'\]::text\[\][\s\S]*v_can_view_personel IS TRUE/,
    );
    expect(executableSql).toMatch(
      /ARRAY\['personel', 'hesaplar'\]::text\[\][\s\S]*v_can_view_personel IS TRUE/,
    );
    expect(executableSql).toMatch(/ELSE false\s+END/);
  });

  it('iki index-dostu hesap dali, transfer dedup ve deterministik keyset kullanir', () => {
    expect(executableSql).toMatch(
      /source_rows AS \([\s\S]*islem\.hesap_id = p_hesap_id/s,
    );
    expect(executableSql).toMatch(
      /target_rows AS \([\s\S]*islem\.hedef_hesap_id = p_hesap_id[\s\S]*islem\.type = 'transfer'[\s\S]*islem\.hesap_id IS DISTINCT FROM p_hesap_id/s,
    );
    expect(executableSql).toMatch(
      /FROM source_rows\s+UNION ALL[\s\S]*FROM target_rows/s,
    );
    expect(executableSql).toMatch(
      /ROW\(\s*islem\.date::timestamp without time zone,\s*cursor_key\.created_at,\s*islem\.id\s*\) < ROW\(\s*p_before_date,\s*p_before_created_at,\s*p_before_id\s*\)/s,
    );
    expect(executableSql).toMatch(
      /ORDER BY\s+candidate\.date DESC,\s*candidate\.created_at DESC,\s*candidate\.id DESC\s+LIMIT p_limit;/s,
    );
    expect(migration).toContain(
      'idx_islemler_hesap(hesap_id)',
    );
    expect(migration).toContain(
      'idx_islemler_hesap_date(hesap_id, date DESC)',
    );
    expect(migration).toContain(
      'idx_islemler_hedef_hesap_date(hedef_hesap_id, date DESC)',
    );
    expect(migration).toContain('Bu migration yeni indeks eklemez.');
    expect(executableSql).not.toMatch(
      /\bCREATE\s+(?:UNIQUE\s+)?INDEX\b/i,
    );
  });

  it('counterparty adlarini tenant ve gorunurluk kapsamli dar joinlerden uretir', () => {
    for (const relation of [
      'kategoriler AS kategori',
      'hesaplar AS source_account',
      'hesaplar AS target_account',
      'cariler AS cari',
      'personel AS personel',
    ]) {
      expect(executableSql).toContain(`public.${relation}`);
    }
    expect(executableSql).toContain("'source_account'::text");
    expect(executableSql).toContain("'target_account'::text");
    expect(executableSql).toContain("'cari'::text");
    expect(executableSql).toContain("'personel'::text");
    expect(executableSql).not.toMatch(
      /\b(?:source_account|target_account)\.(?:balance|initial_balance)\b/,
    );
  });

  it('foto pointerini serverda exact tenant ve islem anahtarina baglar', () => {
    expect(executableSql).toMatch(
      /CASE\s+WHEN candidate\.photo_path ~ \(\s*'\^'\s*\|\| p_isletme_id::text\s*\|\| '\/'\s*\|\| candidate\.id::text\s*\|\| '_\[0-9\]\{10,20\}\[\.\]webp\$'\s*\)\s+THEN candidate\.photo_path\s+ELSE NULL\s+END AS photo_path/s,
    );
    expect(executableSql.match(/END AS photo_path/g)).toHaveLength(1);
  });

  it('SECURITY DEFINER ve authenticated-only ACL ile kapatilir', () => {
    expect(executableSql).toMatch(
      /LANGUAGE plpgsql\s+STABLE\s+SECURITY DEFINER\s+SET search_path TO 'pg_catalog'/,
    );
    const signature =
      String.raw`public\.get_hesap_islem_satirlari_v1\(\s*uuid,\s*uuid,\s*integer,\s*timestamp without time zone,\s*timestamp with time zone,\s*uuid\s*\)`;
    expect(executableSql).toMatch(
      new RegExp(
        String.raw`REVOKE ALL\s+ON FUNCTION ${signature}\s+FROM PUBLIC, anon, authenticated, service_role;`,
      ),
    );
    expect(executableSql).toMatch(
      new RegExp(
        String.raw`GRANT EXECUTE\s+ON FUNCTION ${signature}\s+TO authenticated;`,
      ),
    );
  });

  it('tablo/policy/veri degistirmez ve 1.5.x etkisini yazar', () => {
    expect(executableSql).not.toMatch(/\bDROP\b/i);
    expect(executableSql).not.toMatch(/\bALTER\s+TABLE\b/i);
    expect(executableSql).not.toMatch(/\bCREATE\s+POLICY\b/i);
    expect(executableSql).not.toMatch(/\bINSERT\s+INTO\b/i);
    expect(executableSql).not.toMatch(/\bUPDATE\s+(?:public\.)?[a-z"]/i);
    expect(executableSql).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(executableSql).not.toMatch(/\bTRUNCATE\b/i);
    expect(migration).toContain('1.5.x');
    expect(migration).toContain('Migration-time DML/backfill yoktur');
    expect(migration).toContain(
      'mevcut SELECT/RLS yolunu aynen kullanir',
    );
  });
});
