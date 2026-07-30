import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../../..');
const MIGRATION_PATH =
  'supabase/migrations/20260729073717_restrict_transaction_creator_labels_visibility.sql';
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

describe('creator label kayit gorunurlugu migration sozlesmesi', () => {
  it('P-B resolver migrationindan sonra siralanir', () => {
    expect(MIGRATION_PATH.localeCompare(PB_PATH)).toBeGreaterThan(0);
  });

  it('mevcut RPC imzasi ve iki kolonlu sonuc sekli korunur', () => {
    expect(executableSql).toMatch(
      /CREATE OR REPLACE FUNCTION public\.get_transaction_creator_labels\(\s*p_isletme_id uuid\s*\)/,
    );
    expect(executableSql).toMatch(
      /RETURNS TABLE \(\s*user_id uuid,\s*member_label text\s*\)/s,
    );
    expect(executableSql).not.toMatch(
      /RETURNS TABLE \([\s\S]*\b(?:email|permissions|role|status)\b[\s\S]*\)/,
    );
  });

  it('kanonik islemler gorunurlugu ve kayit sahipligi bayragini birlikte uygular', () => {
    expect(executableSql).toMatch(
      /FROM internal\.etkin_yetki\(\s*p_isletme_id,\s*'islemler'\s*\) AS transaction_permission/s,
    );
    expect(executableSql).toContain('transaction_permission.can_view');
    expect(executableSql).toContain(
      'transaction_permission.can_see_all_users_data',
    );
    expect(executableSql).toMatch(
      /viewer_permission\.can_view\s+AND \(\s*viewer_permission\.can_see_all_users_data\s+OR target\.user_id = auth\.uid\(\)\s*\)/s,
    );
    expect(executableSql).not.toMatch(/permissions\s*->/);
  });

  it('tip allowlisti ve gereken tum kaynak modullerini labeldan once uygular', () => {
    for (const moduleName of ['hesaplar', 'cariler', 'personel']) {
      expect(executableSql).toMatch(
        new RegExp(
          `internal\\.etkin_yetki\\(\\s*p_isletme_id,\\s*'${moduleName}'\\s*\\) AS module_permission\\s*LIMIT 1`,
          's',
        ),
      );
    }
    expect(executableSql).toContain('pg_catalog.array_remove(');
    expect(executableSql).toContain(
      'internal.islem_tipi_modulu(',
    );
    expect(executableSql).toContain(
      'transaction_mapping.required_modules IS NOT NULL',
    );
    expect(executableSql).toMatch(
      /viewer_permission\.visible_modules\s+@> transaction_mapping\.required_modules/,
    );
    expect(executableSql).toMatch(
      /viewer_permission\.can_see_all_users_data\s+OR transaction_row\.created_by = auth\.uid\(\)/,
    );
  });

  it('resolver RETURNS TABLE tahminini LIMIT 1 ile tek satira sinirlar', () => {
    expect(executableSql).toMatch(
      /FROM internal\.etkin_yetki\(\s*p_isletme_id,\s*'islemler'\s*\) AS transaction_permission\s*LIMIT 1/s,
    );
    expect(
      executableSql.match(/AS module_permission\s*LIMIT 1/g),
    ).toHaveLength(3);
    expect(executableSql).not.toContain('CROSS JOIN source_permissions');
  });

  it('tenant ve gercek islem ureticisi sinirlarini korur', () => {
    expect(executableSql).toContain(
      'target.isletme_id = p_isletme_id',
    );
    expect(executableSql).toContain(
      'FROM public.islemler AS transaction_row',
    );
    expect(executableSql).toContain(
      'transaction_row.isletme_id = p_isletme_id',
    );
    expect(executableSql).toContain(
      'transaction_row.created_by = target.user_id',
    );
    expect(executableSql).not.toContain('target.status');
  });

  it('SECURITY DEFINER yuzeyinde sabit search_path ve mevcut dar API ACLini korur', () => {
    expect(executableSql).toContain('SECURITY DEFINER');
    expect(executableSql).toContain("SET search_path TO 'pg_catalog'");
    expect(executableSql).toMatch(
      /REVOKE ALL\s+ON FUNCTION public\.get_transaction_creator_labels\(uuid\)\s+FROM PUBLIC, anon, authenticated;/,
    );
    expect(executableSql).toMatch(
      /GRANT EXECUTE\s+ON FUNCTION public\.get_transaction_creator_labels\(uuid\)\s+TO authenticated;/,
    );
  });

  it('mevcut service_role ACLinin CREATE OR REPLACE ile korunacagini belgeler', () => {
    expect(migration).toContain(
      'Mevcut service_role ACL',
    );
    expect(executableSql).not.toMatch(
      /FROM [^;]*service_role/,
    );
  });

  it('tablo, policy veya kullanici/islem verisini degistirmez', () => {
    expect(executableSql).not.toMatch(/\bDROP\b/i);
    expect(executableSql).not.toMatch(/\bALTER\s+TABLE\b/i);
    expect(executableSql).not.toMatch(/\bCREATE\s+POLICY\b/i);
    expect(executableSql).not.toMatch(/\bINSERT\s+INTO\b/i);
    expect(executableSql).not.toMatch(/\bUPDATE\s+[a-z"]/i);
    expect(executableSql).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(executableSql).not.toMatch(/\bTRUNCATE\b/i);
  });

  it('eski istemci ve yetkili gorunum farkini aciklar', () => {
    expect(migration).toContain('1.5.x');
    expect(migration).toContain(
      'Owner butun mevcut etiketleri aynen alir',
    );
    expect(migration).toContain(
      'false kullanici yalniz kendi',
    );
  });
});
