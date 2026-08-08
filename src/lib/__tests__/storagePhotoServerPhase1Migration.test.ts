import fs from 'node:fs';
import path from 'node:path';

const read = (relativePath: string) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');

const migration = read(
  'supabase/migrations/20260729184053_harden_note_photo_storage_phase1.sql',
);
const bucketBootstrap = read(
  'supabase/migrations/20260122000000_islem_photos.sql',
);
const postgresBehaviorFixture = read(
  'docs/security/taslak/P0-S6-STORAGE-PG15-17-RLS-DAVRANIS-TESTI.sql',
);

const stripSqlComments = (sql: string) =>
  sql
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/--.*$/gm, '');

const executableSql = stripSqlComments(migration);

describe('P0-S6B Storage server phase-1 migration contract', () => {
  it('bootstraps the private WebP bucket for clean migration replays', () => {
    expect(bucketBootstrap).toMatch(
      /INSERT INTO storage\.buckets[\s\S]*?'islem-photos'[\s\S]*?false[\s\S]*?512000[\s\S]*?ARRAY\['image\/webp'\]::text\[\][\s\S]*?ON CONFLICT \(id\) DO NOTHING;/,
    );
  });

  it('is additive and never rewrites or removes user rows/columns', () => {
    expect(executableSql).not.toMatch(/\bDROP\s+(TABLE|COLUMN|POLICY|FUNCTION|INDEX)\b/i);
    expect(executableSql).not.toMatch(/\bTRUNCATE\b/i);
    expect(executableSql).not.toMatch(/^\s*DELETE\s+FROM\s+/im);
    expect(executableSql).not.toMatch(/^\s*UPDATE\s+(public|storage)\./im);
    expect(executableSql).not.toMatch(/^\s*INSERT\s+INTO\s+(public|storage)\./im);
    expect(executableSql).not.toMatch(/\bALTER\s+TABLE\b/i);
    expect(migration).toContain('41 orphan nesneye');
  });

  it('locks the reviewed live Storage, bucket and P0-S9 snapshots', () => {
    expect(migration).toContain('a61023ffdcc14266e82bbe68e7e72052');
    expect(migration).toContain('943758842eb790fab98ff1186a2a943e');
    expect(migration).toContain('8b6f814d47d54c183d42e0b85c3cce93');
    expect(migration).toContain('077a903a2d599ae99c8b11a3dc2026ea');
    expect(migration).toContain('f8aebb82851b89301f6679f92a217e96');
    expect(migration).toContain('14226a59d292a065f601dacde8baec17');
    expect(migration).toContain("v_bucket_limit IS DISTINCT FROM 512000");
    expect(migration).toContain(
      "v_bucket_mimes IS DISTINCT FROM ARRAY['image/webp']::text[]",
    );
  });

  it('guards active object/pointer data by invariant without brittle row-count locking', () => {
    expect(migration).toContain('v_bad_objects');
    expect(migration).toContain('v_null_owners');
    expect(migration).toContain('v_bad_pointers');
    expect(migration).toContain('v_missing_objects');
    expect(migration).toContain('v_duplicate_pointers');
    expect(migration).not.toMatch(
      /v_(?:object|pointer)_count\s+IS\s+DISTINCT\s+FROM\s+(?:286|245)/,
    );
  });

  it('adds exact partial lookup indexes for equality joins from Storage policies', () => {
    expect(executableSql).toMatch(
      /CREATE INDEX idx_islemler_photo_path_lookup_v1\s+ON public\.islemler \(photo_path\)\s+WHERE photo_path IS NOT NULL;/s,
    );
    expect(executableSql).toMatch(
      /CREATE INDEX idx_notlar_photo_path_lookup_v1\s+ON public\.notlar \(photo_path\)\s+WHERE photo_path IS NOT NULL;/s,
    );
    expect(executableSql).not.toContain('UNIQUE INDEX');
  });

  it('uses one strict parser for legacy transaction and note paths', () => {
    expect(executableSql).toMatch(
      /CREATE FUNCTION internal\.storage_photo_path_parse_v1\(p_name text\)[\s\S]*?IMMUTABLE[\s\S]*?STRICT[\s\S]*?SECURITY INVOKER/,
    );
    expect(migration).toContain("THEN 'not'::text");
    expect(migration).toContain("ELSE 'islem'::text");
    expect(migration).toContain('_[0-9]{10,20}[.]webp$');
    expect(migration).not.toContain('p_user_id');
  });

  it('makes INSERT canonical, caller-owned and tenant-bound; notes also require create', () => {
    expect(executableSql).toMatch(
      /CREATE FUNCTION internal\.storage_photo_insert_allowed_v1\([\s\S]*?v_user_id uuid := auth\.uid\(\)/,
    );
    expect(migration).toContain(
      'p_owner_id IS DISTINCT FROM v_user_id::text',
    );
    expect(migration).toContain("member_row.status = 'active'");
    expect(migration).toContain("v_path.kayit_turu = 'not'");
    expect(migration).toContain('permission_row.can_create IS TRUE');
    expect(executableSql).toMatch(
      /CREATE POLICY "islem_photos_canonical_insert_v1"[\s\S]*?AS RESTRICTIVE[\s\S]*?FOR INSERT[\s\S]*?bucket_id <> 'islem-photos'[\s\S]*?storage_photo_insert_allowed_v1\(name, owner_id\)/,
    );
  });

  it('denies UPDATE only in islem-photos and leaves every other bucket true', () => {
    expect(executableSql).toMatch(
      /CREATE POLICY "islem_photos_no_client_update_v1"[\s\S]*?AS RESTRICTIVE[\s\S]*?FOR UPDATE[\s\S]*?USING \(\s*bucket_id <> 'islem-photos'\s*\)[\s\S]*?WITH CHECK \(\s*bucket_id <> 'islem-photos'\s*\)/,
    );
  });

  it('delegates linked note SELECT to P0-S9 and exposes orphan rows only to the same narrow cleanup principal', () => {
    expect(executableSql).toMatch(
      /storage_note_photo_select_allowed_v1\(p_name text\)[\s\S]*?SECURITY INVOKER[\s\S]*?FROM public\.notlar/,
    );
    expect(executableSql).toMatch(
      /CREATE POLICY "islem_photos_note_select_v1"[\s\S]*?AS RESTRICTIVE[\s\S]*?path_row\.kayit_turu = 'islem'[\s\S]*?path_row\.kayit_turu = 'not'[\s\S]*?storage_note_photo_select_allowed_v1\(name\)\s+OR internal\.storage_note_photo_delete_allowed_v1\(name, owner_id\)/,
    );
  });

  it('uses the current policy row owner for INSERT RETURNING and pointer-gone cleanup', () => {
    expect(executableSql).toMatch(
      /storage_note_photo_delete_allowed_v1\(\s*p_name text,\s*p_object_owner_id text\s*\)[\s\S]*?STABLE[\s\S]*?SECURITY DEFINER/,
    );
    const helperBody = executableSql.match(
      /CREATE FUNCTION internal\.storage_note_photo_delete_allowed_v1\([\s\S]*?AS \$function\$([\s\S]*?)\$function\$;/,
    )?.[1];
    expect(helperBody).toBeDefined();
    expect(helperBody).not.toContain('FROM storage.objects');
    expect(helperBody).toContain(
      'p_object_owner_id = v_user_id::text',
    );
    expect(executableSql).toMatch(
      /IF EXISTS \(\s*SELECT 1\s*FROM public\.notlar AS note_row\s*WHERE note_row\.photo_path = p_name\s*\) THEN\s*RETURN false;/s,
    );
    expect(migration).toContain(
      'RETURN v_is_business_owner IS TRUE;',
    );
    expect(migration).not.toContain(
      'permission_row.can_update_all IS TRUE',
    );
    expect(migration).not.toContain(
      'permission_row.can_delete_all IS TRUE',
    );
    expect(migration).toContain(
      'Shared update_all/delete_all, baska uyenin orphan objesini',
    );
    expect(executableSql).toMatch(
      /CREATE POLICY "islem_photos_note_delete_v1"[\s\S]*?path_row\.kayit_turu = 'islem'[\s\S]*?storage_note_photo_delete_allowed_v1\(name, owner_id\)/,
    );
    expect(migration).toContain('INSERT ... RETURNING');
    expect(
      postgresBehaviorFixture.match(/RETURNING id INTO v_returned_id;/g),
    ).toHaveLength(5);
    expect(postgresBehaviorFixture).toContain(
      'upload-first not INSERT RETURNING satiri gorunmedi',
    );
    expect(postgresBehaviorFixture).toContain(
      'legacy NULL-pointer not INSERT RETURNING satiri gorunmedi',
    );
  });

  it('keeps helper identities internal and closes API-role ACLs explicitly', () => {
    for (const signature of [
      'internal.storage_photo_path_parse_v1(text)',
      'internal.storage_photo_insert_allowed_v1(text,text)',
      'internal.storage_note_photo_select_allowed_v1(text)',
      'internal.storage_note_photo_delete_allowed_v1(text,text)',
    ]) {
      expect(migration).toContain(`REVOKE ALL ON FUNCTION ${signature}`);
      expect(migration).toContain(
        `GRANT EXECUTE ON FUNCTION ${signature}`,
      );
    }
    expect(migration).toContain('FROM PUBLIC, anon, authenticated, service_role');
    expect(migration).toContain('TO authenticated;');
  });

  it('preserves both deployed upload clients with upsert:false', () => {
    for (const sourcePath of [
      'src/hooks/useIslemPhoto.ts',
      'src/hooks/useNotePhoto.ts',
    ]) {
      const source = read(sourcePath);
      expect(source).toContain('.upload(');
      expect(source).toContain('upsert: false');
      expect(source).not.toMatch(/\.storage[\s\S]*?\.move\(/);
      expect(source).not.toMatch(/\.storage[\s\S]*?\.copy\(/);
    }
  });

  it('does not prematurely add the P0-S1 transaction visibility or pointer trigger', () => {
    expect(migration).toContain(
      'Islem fotografi nihai modül/tip SELECT/DELETE kapisi P0-S1',
    );
    expect(executableSql).not.toContain('enforce_islem_photo_pointer');
    expect(executableSql).not.toMatch(/CREATE TRIGGER[\s\S]*?ON public\.islemler/);
  });
});
