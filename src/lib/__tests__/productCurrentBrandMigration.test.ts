import fs from 'fs';
import path from 'path';

const migrationPath = path.resolve(
  process.cwd(),
  'supabase/migrations/20260808162231_sync_product_current_brand.sql',
);
const typeChangeMigrationPath = path.resolve(
  process.cwd(),
  'supabase/migrations/20260808163141_recompute_brand_after_linked_type_change.sql',
);
const directSyncScopeMigrationPath = path.resolve(
  process.cwd(),
  'supabase/migrations/20260808163436_limit_direct_brand_sync_to_purchases.sql',
);

describe('product current brand migration', () => {
  const sql = fs.readFileSync(migrationPath, 'utf8');

  it('is additive and preserves all released RPC signatures', () => {
    expect(sql).not.toMatch(/\b(?:DROP|TRUNCATE|DELETE\s+FROM\s+public\.)\b/i);
    expect(sql).not.toMatch(/ALTER\s+TABLE/i);
    expect(sql).toContain('create_urun_hareket_atomik_v2(uuid,jsonb)');
    expect(sql).toContain('update_urun_hareket_atomik_v2(uuid,uuid,jsonb)');
    expect(sql).toContain('delete_urun_hareket_atomik_v2(uuid,uuid)');
    expect(sql).toContain('reapply_cari_urun_items_v3(uuid,uuid,jsonb,text,text)');
    expect(sql).toContain("pg_catalog.replace(v_def, E'\\r\\n', E'\\n')");
  });

  it('uses effective purchase dates and ignores sale returns as current-brand sources', () => {
    expect(sql).toContain("transaction_row.type::text IN ('gider', 'cari_alis')");
    expect(sql).toMatch(/COALESCE\(transaction_row\.date, movement\.created_at\) DESC/);
    expect(sql).not.toMatch(/transaction_row\.type::text IN \([^)]*cari_satis_iade/);
  });

  it('keeps the helper private and preserves omitted-brand fallback', () => {
    expect(sql).toContain('SECURITY DEFINER');
    expect(sql).toContain("SET search_path = ''");
    expect(sql).toMatch(/sync_product_current_brand_v1\(uuid, uuid\[\]\)[\s\S]*FROM PUBLIC, anon, authenticated, service_role/);
    expect(sql).toContain("IF NOT (p_new_row ? 'marka') THEN");
    expect(sql).toContain('v_marka := v_default_marka;');
  });

  it('recomputes after a linked purchase is changed to another type', () => {
    const typeChangeSql = fs.readFileSync(typeChangeMigrationPath, 'utf8');

    expect(typeChangeSql).not.toMatch(/ALTER\s+TABLE|\b(?:DROP|TRUNCATE)\b/i);
    expect(typeChangeSql).toContain('v_existing_had_ingress boolean;');
    expect(typeChangeSql).toContain("pg_catalog.bool_or(movement.hareket_tipi = 'giris')");
    expect(typeChangeSql).toMatch(
      /p_type IN \('gider', 'cari_alis'\)\s+OR v_existing_had_ingress/,
    );
  });

  it('does not overwrite the current brand when only an outgoing row changes', () => {
    const directSyncSql = fs.readFileSync(directSyncScopeMigrationPath, 'utf8');

    expect(directSyncSql).not.toMatch(/ALTER\s+TABLE|\b(?:DROP|TRUNCATE)\b/i);
    expect(directSyncSql).toContain('v_brand_sync_required boolean;');
    expect(directSyncSql).toMatch(
      /v_hareket\.hareket_tipi = 'giris'\s+OR v_hareket_tipi = 'giris'/,
    );
    expect(directSyncSql).toMatch(
      /IF v_brand_sync_required THEN[\s\S]*sync_product_current_brand_v1/,
    );
  });
});
