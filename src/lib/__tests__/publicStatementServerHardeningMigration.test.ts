import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../../..');
const MIGRATION_PATH =
  'supabase/migrations/20260729112753_harden_public_statement_lifecycle.sql';
const PHASE2_PATH =
  'supabase/migrations/20260729113246_finalize_public_statement_service_role_acl.sql';
const PB_PATH =
  'supabase/migrations/20260729064915_pb_internal_yetki_altyapisi.sql';
const EDGE_PATH = 'supabase/functions/cari-ekstre/index.ts';

const migration = fs.readFileSync(
  path.join(ROOT, MIGRATION_PATH),
  'utf8',
);
const phase2 = fs.readFileSync(path.join(ROOT, PHASE2_PATH), 'utf8');
const edge = fs.readFileSync(path.join(ROOT, EDGE_PATH), 'utf8');
const executableSql = migration
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n');
const phase2ExecutableSql = phase2
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n');

function between(
  source: string,
  start: string,
  end: string,
): string {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);

  if (startIndex < 0 || endIndex < 0) {
    throw new Error(`Block not found: ${start} -> ${end}`);
  }

  return source.slice(startIndex, endIndex);
}

function sha256(value: string): string {
  return crypto
    .createHash('sha256')
    .update(value.replace(/\r\n/g, '\n'))
    .digest('hex');
}

const createRpc = between(
  executableSql,
  'CREATE OR REPLACE FUNCTION public.ekstre_link_olustur(',
  'CREATE OR REPLACE FUNCTION public.ekstre_link_iptal(',
);
const profileHelper = between(
  executableSql,
  'CREATE FUNCTION internal.public_ekstre_cariler_uyeligi_izinli(',
  'ALTER FUNCTION internal.public_ekstre_cariler_uyeligi_izinli(text, jsonb)',
);
const cancelRpc = between(
  executableSql,
  'CREATE OR REPLACE FUNCTION public.ekstre_link_iptal(',
  'CREATE FUNCTION public.cari_ekstre_token_dogrula_v1(',
);
const validateRpc = between(
  executableSql,
  'CREATE FUNCTION public.cari_ekstre_token_dogrula_v1(',
  'ALTER FUNCTION public.cari_ekstre_token_dogrula_v1(text)',
);
const selectPolicy = between(
  executableSql,
  'ALTER POLICY "cari_ekstre_links_select"',
  'REVOKE ALL ON TABLE public.cari_ekstre_links',
);

describe('P0-S10 public statement server hardening', () => {
  it('P-B resolverindan sonra siralanir ve canli drift snapshotlarini kilitler', () => {
    expect(MIGRATION_PATH.localeCompare(PB_PATH)).toBeGreaterThan(0);

    for (const fingerprint of [
      '8edd3ee7ad1f4733d00b0a0f3ec321bb',
      '9836499cea373e719c7cb8c8288c8e7f',
      'a77ab3ae466ec92cb4d53402023c841a',
      '71892c1efea89373200c887b20321904',
      'cf71a1041f0bd1ef3f4f05a3b03b550c',
      '46875263bd6598c4534e2df7d1847a5e',
      'd9a2ef379260e4b5fd1d7ec795ddd7ea',
      '0296626ae94c6c3fe3894b1c0b18ff00',
      '18d792c2e4f5a65fa23aceb808320cc0',
      '1b75693d54ee84a30c98977e1c6edb66',
      '8fe983de336880545a5d758e5b7bab14',
      'f8aebb82851b89301f6679f92a217e96',
      '14226a59d292a065f601dacde8baec17',
    ]) {
      expect(migration).toContain(fingerprint);
    }

    expect(migration).toContain(
      'Bu migration hash formulu bilinmeden onu calistiriyormus gibi davranmaz.',
    );
    expect(executableSql).toContain('function_row.proacl::text IN (');
    expect(executableSql).toContain(
      "'{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}'",
    );
    expect(executableSql).toContain(
      "'{postgres=X/postgres,authenticated=X/postgres}'",
    );
  });

  it('mevcut iki RPC imzasini, DEFAULT 30u ve sonuc tiplerini korur', () => {
    expect(createRpc).toMatch(
      /ekstre_link_olustur\(\s*p_isletme_id uuid,\s*p_cari_id uuid,\s*p_gecerlilik_gun integer DEFAULT 30\s*\)\s*RETURNS jsonb/s,
    );
    expect(cancelRpc).toMatch(
      /ekstre_link_iptal\(\s*p_isletme_id uuid,\s*p_cari_id uuid\s*\)\s*RETURNS integer/s,
    );
    expect(createRpc).toContain(
      "RETURN pg_catalog.jsonb_build_object(\n    'token', v_token,\n    'expires_at', v_expires",
    );
    expect(createRpc).toContain("SET search_path TO 'pg_catalog'");
    expect(cancelRpc).toContain("SET search_path TO 'pg_catalog'");
  });

  it('olusturma ve iptali exact Cariler can_view resolverina baglar', () => {
    for (const rpc of [createRpc, cancelRpc]) {
      expect(rpc).toContain(
        "FROM internal.etkin_yetki(\n    p_isletme_id,\n    'cariler'",
      );
      expect(rpc).toContain(
        'IF v_can_view IS DISTINCT FROM true THEN',
      );
      expect(rpc).not.toContain('user_has_isletme_access');
      expect(rpc).not.toMatch(/permissions\s*(?:->|#>|#>>)/);
    }
  });

  it('owner/shared sure allowlistini exact uygular ve suresizi kapatir', () => {
    expect(createRpc).toMatch(
      /p_gecerlilik_gun IS NULL[\s\S]*?v_is_owner[\s\S]*?NOT IN \(1, 7, 30, 365\)[\s\S]*?NOT v_is_owner[\s\S]*?NOT IN \(1, 7, 30\)/s,
    );
    expect(createRpc).toContain(
      "RAISE EXCEPTION 'EKSTRE_LINK_GECERLILIK_GECERSIZ'",
    );
    expect(createRpc).toContain("ERRCODE = '22023'");
    expect(createRpc).not.toContain("interval '100 years'");
    expect(createRpc).not.toMatch(/\b(?:LEAST|GREATEST)\s*\(/);
  });

  it('isletme-bazli advisory lock ile mevcut 10/saat sinirini deterministik tutar', () => {
    const lockIndex = createRpc.indexOf(
      'pg_catalog.pg_advisory_xact_lock(',
    );
    const countIndex = createRpc.indexOf(
      'SELECT pg_catalog.count(*)::integer',
    );
    const rejectionIndex = createRpc.indexOf('IF v_rate >= 10 THEN');
    const writeIndex = createRpc.indexOf(
      'UPDATE public.cari_ekstre_links',
    );

    expect(lockIndex).toBeGreaterThan(-1);
    expect(createRpc).toContain(
      "'public.cari_ekstre_links:business:' || p_isletme_id::text",
    );
    expect(lockIndex).toBeLessThan(countIndex);
    expect(countIndex).toBeLessThan(rejectionIndex);
    expect(rejectionIndex).toBeLessThan(writeIndex);
    expect(createRpc).toContain(
      "rate_row.created_at > pg_catalog.now() - interval '1 hour'",
    );
  });

  it('aktif linki isletme+cari+uretici anahtariyla izole eder', () => {
    expect(executableSql).toMatch(
      /CREATE UNIQUE INDEX ux_cari_ekstre_links_active_creator\s+ON public\.cari_ekstre_links \(isletme_id, cari_id, created_by\)\s+WHERE revoked IS FALSE\s+AND created_by IS NOT NULL;/s,
    );
    expect(createRpc).toMatch(
      /old_link\.isletme_id = p_isletme_id[\s\S]*?old_link\.cari_id = p_cari_id[\s\S]*?old_link\.created_by = v_uid[\s\S]*?old_link\.revoked IS FALSE/s,
    );
    expect(cancelRpc).toMatch(
      /active_link\.isletme_id = p_isletme_id[\s\S]*?active_link\.cari_id = p_cari_id[\s\S]*?active_link\.revoked IS FALSE[\s\S]*?\(\s*v_is_owner\s+OR active_link\.created_by = v_uid\s*\)/s,
    );
    expect(cancelRpc).toContain(
      'pg_catalog.pg_advisory_xact_lock(',
    );
  });

  it('token dogrulamasini service_role-only ve guncel uretici yetkili yapar', () => {
    expect(validateRpc).toMatch(
      /RETURNS TABLE \(\s*id uuid,\s*isletme_id uuid,\s*cari_id uuid,\s*expires_at timestamptz,\s*revoked boolean\s*\)/s,
    );
    expect(validateRpc).toContain(
      "p_token ~ '^[0-9a-f]{48}$'",
    );
    expect(validateRpc).toContain(
      'owner_business.user_id = link_row.created_by',
    );
    expect(validateRpc).toContain(
      'internal.public_ekstre_cariler_uyeligi_izinli(',
    );
    expect(validateRpc).toContain('active_member.status');
    expect(validateRpc).toContain('active_member.permissions');
    expect(validateRpc).not.toMatch(/active_member\.role/);

    // Edge 404/410 ayrimini korur: validator revoked/expiry satirini dondurur,
    // fakat bu iki alani WHERE ile filtrelemez.
    expect(validateRpc).toContain('link_row.revoked');
    expect(validateRpc).toContain('link_row.expires_at');
    expect(validateRpc).not.toMatch(
      /WHERE[\s\S]*?link_row\.revoked\s+IS\s+FALSE/s,
    );
    expect(validateRpc).not.toMatch(
      /WHERE[\s\S]*?link_row\.expires_at\s*[><=]/s,
    );

    expect(executableSql).toContain(
      'GRANT EXECUTE ON FUNCTION public.cari_ekstre_token_dogrula_v1(text)\n  TO service_role;',
    );
    expect(executableSql).toMatch(
      /has_function_privilege\(\s*'authenticated',\s*v_validate_oid,\s*'EXECUTE'\s*\)/s,
    );
  });

  it('service-role validator profil predicateini resolver Cariler semantigiyle fail-closed kilitler', () => {
    expect(profileHelper).toContain("p_status = 'active'");
    expect(profileHelper).toContain(
      "pg_catalog.jsonb_typeof(p_permissions) = 'object'",
    );
    expect(profileHelper).toContain(
      "p_permissions->'modules'->'cariler' = 'true'::jsonb",
    );
    expect(profileHelper).toMatch(
      /p_permissions->'level' IS NULL[\s\S]*?p_permissions->'level' = 'null'::jsonb[\s\S]*?'view',\s*'add',\s*'edit_own',\s*'edit_all'/s,
    );
    expect(profileHelper).toContain(
      'pg_catalog.jsonb_typeof(p_permissions->\'level\') = \'string\'',
    );
    expect(profileHelper).toMatch(/SELECT COALESCE\([\s\S]*?,\s*false\s*\);/s);

    for (const profile of [
      'manager',
      'operator',
      'custom_view',
      'legacy_level_missing',
      'legacy_level_json_null',
      'closed_module',
      'invalid_level',
      'string_true',
      'suspended',
      'bad_permissions_container',
    ]) {
      expect(migration).toContain(`'${profile}'`);
    }

    expect(executableSql).toContain(
      'REVOKE ALL ON FUNCTION\n  internal.public_ekstre_cariler_uyeligi_izinli(text, jsonb)\n  FROM PUBLIC, anon, authenticated, service_role;',
    );
    expect(executableSql).not.toMatch(
      /GRANT EXECUTE ON FUNCTION\s+internal\.public_ekstre_cariler_uyeligi_izinli/s,
    );
  });

  it('RLS owner-all/shared-own ve Cariler can_view kesişimini uygular', () => {
    expect(selectPolicy).toContain(
      'owner_business.user_id = auth.uid()',
    );
    expect(selectPolicy).toContain(
      'cari_ekstre_links.created_by = auth.uid()',
    );
    expect(selectPolicy).toContain(
      "internal.etkin_yetki(\n        cari_ekstre_links.isletme_id,\n        'cariler'",
    );
    expect(selectPolicy).toContain(
      'permission.can_view IS TRUE',
    );
    expect(selectPolicy).not.toContain('isletme_users');
  });

  it('phase-1 tablo ve RPC ACLlerini kesintisiz gecis icin daraltir', () => {
    expect(executableSql).toContain(
      'REVOKE ALL ON TABLE public.cari_ekstre_links\n  FROM PUBLIC, anon, authenticated;',
    );
    expect(executableSql).toContain(
      'REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN\n  ON TABLE public.cari_ekstre_links\n  FROM service_role;',
    );
    expect(executableSql).toContain(
      'GRANT SELECT ON TABLE public.cari_ekstre_links\n  TO authenticated, service_role;',
    );
    expect(executableSql).toMatch(
      /has_table_privilege\(\s*'service_role',\s*v_table_oid,\s*'SELECT'\s*\)/s,
    );
    expect(executableSql).toMatch(
      /has_table_privilege\(\s*'service_role',\s*v_table_oid,\s*'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'\s*\)/s,
    );

    for (const signature of [
      'public.ekstre_link_olustur(uuid, uuid, integer)',
      'public.ekstre_link_iptal(uuid, uuid)',
    ]) {
      expect(executableSql).toContain(
        `REVOKE ALL ON FUNCTION ${signature}\n  FROM PUBLIC, anon, authenticated, service_role;`,
      );
      expect(executableSql).toContain(
        `GRANT EXECUTE ON FUNCTION ${signature}\n  TO authenticated;`,
      );
    }
  });

  it('phase-2 Edge v6 smokeundan sonra migration historyde direct SELECTi kapatir', () => {
    expect(PHASE2_PATH).toMatch(/^supabase\/migrations\//);
    expect(
      fs.readdirSync(path.join(ROOT, 'supabase/migrations')).some(
        (file) => file.includes('finalize_public_statement_service_role_acl'),
      ),
    ).toBe(true);
    expect(phase2).toContain(
      "DURUM: Edge v6 canlı smoke'u tamamlandıktan sonra canlıya uygulanmıştır.",
    );
    expect(phase2).toContain('OPERATOR GATE (PAZARLIK DISI)');
    expect(phase2).toContain(
      'cari-ekstre Edge v6 canlida, token lookup',
    );
    expect(phase2).toContain(
      "phase-1 ile ayni apply cagrisi/batch'i",
    );
    expect(phase2ExecutableSql).toContain(
      'REVOKE ALL ON TABLE public.cari_ekstre_links\n  FROM service_role;',
    );
    expect(phase2ExecutableSql).toContain(
      "'{postgres=arwdDxtm/postgres,authenticated=r/postgres}'",
    );
    expect(phase2ExecutableSql).toMatch(
      /has_function_privilege\(\s*'service_role',\s*v_validate_oid,\s*'EXECUTE'\s*\)/s,
    );
    expect(phase2ExecutableSql).not.toMatch(
      /REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.cari_ekstre_token_dogrula_v1/s,
    );
  });

  it('mevcut satirlara backfill/yikici schema islemi yapmaz', () => {
    const beforeFunctions = executableSql.slice(
      0,
      executableSql.indexOf(
        'CREATE OR REPLACE FUNCTION public.ekstre_link_olustur(',
      ),
    );

    expect(executableSql).not.toMatch(/\bDROP\b/i);
    expect(executableSql).not.toMatch(/\bALTER\s+TABLE\b/i);
    expect(executableSql).not.toMatch(/\bCREATE\s+TABLE\b/i);
    expect(executableSql).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(executableSql).not.toMatch(
      /\bTRUNCATE\s+(?:TABLE\s+)?(?:public\.)?cari_ekstre_links\b/i,
    );
    expect(beforeFunctions).not.toMatch(
      /\b(?:INSERT|UPDATE|DELETE)\s+(?:INTO\s+)?public\.cari_ekstre_links\b/i,
    );
    expect(phase2ExecutableSql).not.toMatch(/\bDROP\b/i);
    expect(phase2ExecutableSql).not.toMatch(/\bALTER\s+TABLE\b/i);
    expect(phase2ExecutableSql).not.toMatch(/\bCREATE\s+TABLE\b/i);
    expect(phase2ExecutableSql).not.toMatch(
      /\b(?:INSERT|UPDATE|DELETE|TRUNCATE)\s+(?:INTO\s+)?public\.cari_ekstre_links\b/i,
    );
    expect(migration).toContain('Mevcut satirlara DML/backfill YOK.');
    expect(migration).toContain('Mevcut 100-yillik linklere dokunulmaz');
  });

  it('1.5.x etkisini, 10/11 sinirini ve rollback preflightini kayda alir', () => {
    for (const contractText of [
      'ESKI CLIENT (1.5.x)',
      'Ayni RPC adlari, parametreleri, DEFAULT 30',
      'eski client',
      '10/saat',
      'aktif isletme+cari+uretici duplicate grubu',
      'MIGRATION-SONU POSTCONDITION',
    ]) {
      expect(migration.toLocaleLowerCase('tr-TR')).toContain(
        contractText.toLocaleLowerCase('tr-TR'),
      );
    }

    for (const fingerprint of [
      '19fd96efcf842866e922c1eb1c27f007',
      '00eab03f65c493d212f25e5266e2a663',
      '971f225e93bd10942e742b6174ca5775',
      'e7d034e4a4b23abcaaadbc08b146ada3',
      'b41c180495900f97d127cfd1a43be4c6',
      'dd7633d8d68a6a1b49a15fa041590cb8',
      '2b400f1a4c2603898096779aa5c4fb0b',
      '144483ac24228485803fce17a894713d',
      '821d2cba3aacaf8063ed1120f1af8f08',
    ]) {
      expect(phase2).toContain(fingerprint);
    }
    expect(phase2).toContain('ESKI CLIENT (1.5.x)');
  });
});

describe('cari-ekstre Edge v5 transition contract', () => {
  it('dogrudan link tablosu yerine service-role-only validator RPCyi kullanir', () => {
    expect(edge).toContain(
      '.rpc("cari_ekstre_token_dogrula_v1", { p_token: token })',
    );
    expect(edge).not.toContain('.from("cari_ekstre_links")');
    expect(edge).toContain(
      'LIVE BASELINE: Supabase cari-ekstre v5',
    );
    expect(edge).toContain(
      'ef24f5d124cc2803665f5e83fa59c895e90dcee80d95952db9c8c34c5e01b954',
    );
  });

  it('v5 bakiye matematik ve tip allowlist bloklarini birebir korur', () => {
    const deltaBlock = between(
      edge,
      'function cariDelta',
      'const TIP_ETIKET',
    );
    const typeLabels = between(
      edge,
      'const TIP_ETIKET',
      'function htmlPage',
    );

    expect(sha256(deltaBlock)).toBe(
      '5bf1828f617c36e6d4f384c17d3c25074a4b59cf63429ade779c4fe9e4f6a442',
    );
    expect(sha256(typeLabels)).toBe(
      'e87826d3fcac7bffc4d0407e86b1ea4b6462833bd710505bd645303e4baffdca',
    );
  });

  it('v5 hata, veri sorgusu, JSON ve HTML tail sozlesmesini birebir korur', () => {
    const protectedTail = edge.slice(edge.indexOf('  if (linkErr)'));

    expect(sha256(protectedTail)).toBe(
      '3cd770f7dc402e18de44e309bf48de79be6ae1a97f57838133604a0c324a8b7d',
    );
    expect(protectedTail).toContain(
      'if (!link || link.revoked) return fail("Bu bağlantı iptal edilmiş veya geçersiz.", 404);',
    );
    expect(protectedTail).toContain(
      'return fail("Bu bağlantının süresi dolmuş. İşletmeden yeni bağlantı isteyin.", 410);',
    );
    expect(protectedTail).toContain('satirlar: jsonSatirlar');
    expect(protectedTail).toContain('expires_at: link.expires_at');
    expect(protectedTail).toContain('.limit(2000)');
  });
});
