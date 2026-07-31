import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../../..');
const MIGRATIONS_DIR = path.join(ROOT, 'supabase/migrations');
const migrationNames = fs
  .readdirSync(MIGRATIONS_DIR)
  .filter((name) =>
    name.endsWith('_create_isletme_invite_v2_atomic_label.sql'),
  );

if (migrationNames.length !== 1) {
  throw new Error(
    `Expected one create_isletme_invite_v2 migration, found ${migrationNames.length}`,
  );
}

const sql = fs.readFileSync(
  path.join(MIGRATIONS_DIR, migrationNames[0]),
  'utf8',
);
const executableSql = sql
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n');
const functionEnd = executableSql.indexOf('$function$;');
const functionSql = executableSql.slice(0, functionEnd + '$function$;'.length);

describe('S-12c atomic invite member label migration contract', () => {
  it('adds a separately named v2 RPC without replacing the legacy signature', () => {
    expect(executableSql).toMatch(
      /CREATE FUNCTION public\.create_isletme_invite_v2\(\s*p_isletme_id uuid,\s*p_role text,\s*p_role_label text DEFAULT NULL,\s*p_permissions jsonb DEFAULT NULL,\s*p_invited_email text DEFAULT NULL,\s*p_member_label text DEFAULT NULL\s*\)/,
    );
    expect(executableSql).not.toMatch(
      /CREATE OR REPLACE FUNCTION public\.create_isletme_invite\(/,
    );
    expect(executableSql).not.toMatch(
      /\bALTER FUNCTION public\.create_isletme_invite\(/,
    );
  });

  it('preserves the legacy owner, rate-limit and default-permission behavior', () => {
    expect(executableSql).toContain('FROM public.isletmeler AS i');
    expect(executableSql).toContain('i.id = p_isletme_id');
    expect(executableSql).toContain('i.user_id = auth.uid()');
    expect(executableSql).toContain(
      "RAISE EXCEPTION 'Sadece işletme sahibi davet oluşturabilir'",
    );
    expect(executableSql).toMatch(
      /FROM public\.isletme_invites AS invite[\s\S]*?invite\.isletme_id = p_isletme_id[\s\S]*?invite\.created_at > pg_catalog\.now\(\) - INTERVAL '1 hour'[\s\S]*?invite\.status = 'pending'/,
    );
    expect(executableSql).toContain(') >= 10 THEN');
    expect(executableSql).toContain(
      "RAISE EXCEPTION 'Çok fazla davet oluşturdunuz. Lütfen 1 saat sonra tekrar deneyin.'",
    );
    expect(executableSql).toMatch(
      /IF p_permissions IS NULL AND p_role != 'custom' THEN[\s\S]*?FROM public\.role_templates AS template[\s\S]*?template\.name = p_role/,
    );
  });

  it('preserves code generation, pending uniqueness and text return contract', () => {
    expect(executableSql).toMatch(
      /RETURNS text\s+LANGUAGE plpgsql\s+SECURITY DEFINER\s+SET search_path TO ''/,
    );
    expect(executableSql).toMatch(
      /pg_catalog\.md5\(\s*pg_catalog\.random\(\)::text\s*\|\|\s*pg_catalog\.clock_timestamp\(\)::text\s*\)/,
    );
    expect(executableSql).toContain("'0O1IL', 'XYZAB'");
    expect(executableSql).toMatch(
      /EXIT WHEN NOT EXISTS \([\s\S]*?FROM public\.isletme_invites AS invite[\s\S]*?invite\.invite_code = v_code[\s\S]*?invite\.status = 'pending'/,
    );
    expect(executableSql).toContain('RETURN v_code;');
  });

  it('normalizes and bounds the member label before the single invite insert', () => {
    expect(executableSql).toContain(
      "v_member_label text := NULLIF(pg_catalog.btrim(p_member_label), '');",
    );
    expect(executableSql).toMatch(
      /IF pg_catalog\.char_length\(v_member_label\) > 100 THEN[\s\S]*?USING ERRCODE = '22001'/,
    );
    expect(executableSql).toMatch(
      /INSERT INTO public\.isletme_invites \(\s*isletme_id, invited_by, invite_code, invited_email,\s*role, role_label, permissions, member_label\s*\) VALUES \(\s*p_isletme_id, auth\.uid\(\), v_code, p_invited_email,\s*p_role, p_role_label, COALESCE\(p_permissions, '\{\}'::jsonb\), v_member_label\s*\);/,
    );
    expect(executableSql.match(/INSERT INTO public\.isletme_invites/g)).toHaveLength(
      1,
    );
    expect(executableSql).not.toMatch(
      /UPDATE public\.isletme_invites[\s\S]*member_label/,
    );
  });

  it('uses schema-qualified relations, a fixed empty search path and narrow ACL', () => {
    expect(executableSql).toContain("SET search_path TO ''");
    expect(functionSql).not.toMatch(/\bFROM\s+(?!public\.)\w+/i);
    expect(functionSql).not.toMatch(/\bINSERT\s+INTO\s+(?!public\.)\w+/i);
    expect(executableSql).toMatch(
      /REVOKE EXECUTE ON FUNCTION public\.create_isletme_invite_v2\(\s*uuid, text, text, jsonb, text, text\s*\)\s+FROM PUBLIC, anon;/,
    );
    expect(executableSql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.create_isletme_invite_v2\(\s*uuid, text, text, jsonb, text, text\s*\)\s+TO authenticated;/,
    );
  });

  it('contains no migration-time backfill, destructive schema operation or data rewrite', () => {
    const migrationTail = executableSql.slice(
      functionEnd + '$function$;'.length,
    );

    expect(functionEnd).toBeGreaterThan(0);
    expect(migrationTail).not.toMatch(
      /\b(INSERT|UPDATE|DELETE|TRUNCATE|ALTER TABLE|DROP TABLE|DROP COLUMN)\b/i,
    );
    expect(executableSql).not.toMatch(/\bALTER\s+TABLE\b/i);
    expect(executableSql).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(executableSql).not.toMatch(/\bTRUNCATE\b/i);
    expect(executableSql).not.toMatch(/\bDROP\s+(TABLE|COLUMN)\b/i);
  });
});
