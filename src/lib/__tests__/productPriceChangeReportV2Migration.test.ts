import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../../..');
const MIGRATION_FILENAME = '20260807151236_product_price_change_report_v2.sql';
const migrationPath = path.join(ROOT, 'supabase/migrations', MIGRATION_FILENAME);
const sql = fs.readFileSync(migrationPath, 'utf8');

describe('product purchase price change report v2 migration', () => {
  it('is additive and leaves the V1 API and existing data untouched', () => {
    expect(path.basename(migrationPath)).toBe(MIGRATION_FILENAME);
    expect(sql).toContain('CREATE FUNCTION public.get_product_price_change_report_v2');
    expect(sql).toContain('public.get_product_price_change_report_v1(');
    expect(sql).not.toContain('CREATE OR REPLACE FUNCTION');
    expect(sql).not.toMatch(/\bALTER\s+TABLE\b/i);
    expect(sql).not.toMatch(/\bDROP\s+(TABLE|COLUMN|FUNCTION)\b/i);
    expect(sql).not.toMatch(/\b(DELETE\s+FROM|TRUNCATE|UPDATE\s+public\.)\b/i);
  });

  it('adds symmetric lower-price quantity and savings calculations', () => {
    expect(sql).toContain('indirimli_alim_miktari numeric');
    expect(sql).toContain('tahmini_tasarruf numeric');
    expect(sql).toMatch(
      /movement\.birim_fiyat\s*<\s*report\.referans_fiyat/,
    );
    expect(sql).toMatch(
      /pg_catalog\.abs\(movement\.miktar\)[\s\S]*?report\.referans_fiyat - movement\.birim_fiyat/,
    );
  });

  it('keeps the V1 purchase scope, currency split and active-entity guards', () => {
    expect(sql).toContain("transaction_row.type = 'cari_alis'");
    expect(sql).toContain("movement.hareket_tipi = 'giris'");
    expect(sql).toContain('transaction_row.date::timestamp with time zone >= p_start_date');
    expect(sql).toContain('report.fiyat_para_birimi = COALESCE(');
    expect(sql).toContain('product.is_active IS TRUE');
    expect(sql).toContain('supplier.is_active IS TRUE');
  });

  it('has a hardened definer posture and authenticated-only grant', () => {
    expect(sql).toMatch(
      /LANGUAGE sql\s+STABLE\s+SECURITY DEFINER\s+SET search_path TO 'pg_catalog'/,
    );
    expect(sql).toMatch(
      /REVOKE ALL[\s\S]*?FROM PUBLIC, anon, authenticated, service_role;/,
    );
    expect(sql).toMatch(/GRANT EXECUTE[\s\S]*?TO authenticated;/);
  });
});
