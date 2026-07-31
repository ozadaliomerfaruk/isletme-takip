import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../../..');
const MIGRATION_PATH =
  'supabase/migrations/20260729071904_add_kategori_secim_referanslari_rpc.sql';
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

describe('dar kategori secim referansi migration sozlesmesi', () => {
  it('P-B resolver migrationindan sonra siralanir', () => {
    expect(MIGRATION_PATH.localeCompare(PB_PATH)).toBeGreaterThan(0);
  });

  it('yalniz id, name, type ve color kolonlarini dondurur', () => {
    expect(executableSql).toMatch(
      /RETURNS TABLE \(\s*id uuid,\s*name text,\s*type text,\s*color text\s*\)/s,
    );

    const returnColumns =
      executableSql.match(/RETURNS TABLE \(([\s\S]*?)\)\s*LANGUAGE/)?.[1] ??
      '';
    expect(returnColumns).not.toMatch(
      /\b(?:isletme_id|icon|parent_id|mapped_|created_by|updated_by|created_at|is_active)\b/,
    );
    expect(executableSql).not.toMatch(/SELECT\s+[^;]*\*/i);
  });

  it('ham permissions JSON yerine kanonik P-B resolverini kullanir', () => {
    expect(executableSql).toContain(
      "FROM internal.etkin_yetki(p_isletme_id, 'islemler') AS permission",
    );
    expect(executableSql).toContain('SELECT permission.can_view');
    expect(executableSql).not.toContain('public.isletme_users');
    expect(executableSql).not.toMatch(/permissions\s*->/);
  });

  it('tenant, aktiflik ve kategori tipi allowlisti disinda fail-closed kalir', () => {
    expect(executableSql).toContain('p_isletme_id IS NULL');
    expect(executableSql).toMatch(
      /p_type NOT IN \('gelir', 'gider', 'urun'\)/,
    );
    expect(executableSql).toContain(
      "RAISE EXCEPTION 'CATEGORY_REFERENCE_NOT_AUTHORIZED'",
    );
    expect(executableSql).toContain("ERRCODE = '42501'");
    expect(executableSql).toContain(
      'kategori.isletme_id = p_isletme_id',
    );
    expect(executableSql).toContain('kategori.is_active IS TRUE');
    expect(executableSql).toContain(
      '(p_type IS NULL OR kategori.type = p_type)',
    );
  });

  it('SECURITY DEFINER yuzeyini sabit search_path ve dar ACL ile kapatir', () => {
    expect(executableSql).toContain('SECURITY DEFINER');
    expect(executableSql).toContain("SET search_path TO 'pg_catalog'");
    expect(executableSql).toMatch(
      /REVOKE ALL\s+ON FUNCTION public\.get_kategori_secim_referanslari\(uuid, text\)\s+FROM PUBLIC, anon, authenticated, service_role;/,
    );
    expect(executableSql).toMatch(
      /GRANT EXECUTE\s+ON FUNCTION public\.get_kategori_secim_referanslari\(uuid, text\)\s+TO authenticated;/,
    );
  });

  it('yalniz additive DDL icerir; tablo, policy veya mevcut veriye dokunmaz', () => {
    expect(executableSql).toMatch(
      /CREATE FUNCTION public\.get_kategori_secim_referanslari/,
    );
    expect(executableSql).not.toMatch(/CREATE OR REPLACE FUNCTION/i);
    expect(executableSql).not.toMatch(/\bDROP\b/i);
    expect(executableSql).not.toMatch(/\bALTER\s+TABLE\b/i);
    expect(executableSql).not.toMatch(/\bCREATE\s+POLICY\b/i);
    expect(executableSql).not.toMatch(/\bINSERT\s+INTO\b/i);
    expect(executableSql).not.toMatch(/\bUPDATE\s+public\./i);
    expect(executableSql).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(executableSql).not.toMatch(/\bTRUNCATE\b/i);
  });

  it('eski client etkisini ve temel SELECT sinirini migration notunda aciklar', () => {
    expect(migration).toContain('1.5.x');
    expect(migration).toContain('Temel tablo SELECT');
    expect(migration).toContain('DARALTILMAZ');
  });
});
