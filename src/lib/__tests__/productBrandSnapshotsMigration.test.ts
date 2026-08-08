import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../../..');
const MIGRATION_FILENAME = '20260807225210_add_product_brand_snapshots.sql';
const migrationPath = path.join(ROOT, 'supabase/migrations', MIGRATION_FILENAME);
const sql = fs.readFileSync(migrationPath, 'utf8');

describe('product brand snapshots migration', () => {
  it('adds nullable fields without rewriting or deleting historical user data', () => {
    expect(path.basename(migrationPath)).toBe(MIGRATION_FILENAME);
    expect(sql.match(/ADD COLUMN IF NOT EXISTS marka text;/g)).toHaveLength(2);
    expect(sql).not.toMatch(/ADD COLUMN[^;]+NOT NULL/i);
    expect(sql).not.toMatch(/ADD COLUMN[^;]+DEFAULT/i);
    expect(sql).not.toMatch(/\b(DELETE\s+FROM\s+public\.|TRUNCATE|DROP\s+(TABLE|COLUMN))\b/i);
    expect(sql).not.toMatch(/\bUPDATE\s+public\.(urunler|urun_hareketler)\b/i);
  });

  it('keeps the V3 signature and treats brand as an optional strict-boundary field', () => {
    expect(sql).toContain(
      "'internal.reapply_cari_urun_items_v3(uuid,uuid,jsonb,text,text)'::regprocedure",
    );
    expect(sql).toMatch(/'kdv_orani',[\s\S]*?'marka',[\s\S]*?'aciklama'/);
    expect(sql).toContain("v_item ? 'marka'");
    expect(sql).toContain("NOT IN ('string', 'null')");
    expect(sql).toContain('ELSE v_default_marka');
    expect(sql).toMatch(/kdv_orani,[\s\S]*?marka,[\s\S]*?onceki_miktar/);
  });

  it('enriches history JSON without changing the price report return columns', () => {
    expect(sql).toContain("'brandName', row_data.brand_name");
    expect(sql).toContain("THEN 'brand_change'");
    expect(sql).toContain('row_data.previous_brand_name');
    expect(sql).toContain('cannot make a product enter the report');
    expect(sql).not.toMatch(/RETURNS\s+TABLE/i);
  });

  it('retains hardened function ownership and ACL posture', () => {
    expect(sql).toMatch(/REVOKE ALL[\s\S]*?internal\.reapply_cari_urun_items_v3/);
    expect(sql).toMatch(/REVOKE ALL[\s\S]*?public\.get_product_price_change_report_v1/);
    expect(sql).toMatch(/GRANT EXECUTE[\s\S]*?TO authenticated, service_role;/);
  });
});
