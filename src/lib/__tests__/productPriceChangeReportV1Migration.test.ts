import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../../..');
const MIGRATION_FILENAME = '20260807142543_product_price_change_report_v1.sql';
const migrationPath = path.join(ROOT, 'supabase/migrations', MIGRATION_FILENAME);
const sql = fs.readFileSync(migrationPath, 'utf8');

describe('product purchase price change report v1 migration', () => {
  it('is additive and does not rewrite existing data', () => {
    expect(path.basename(migrationPath)).toBe(MIGRATION_FILENAME);
    expect(sql).toContain('CREATE FUNCTION public.get_product_price_change_report_v1');
    expect(sql).not.toContain('CREATE OR REPLACE FUNCTION');
    expect(sql).not.toMatch(/\bALTER\s+TABLE\b/i);
    expect(sql).not.toMatch(/\bDROP\s+(TABLE|COLUMN|FUNCTION)\b/i);
    expect(sql).not.toMatch(/\b(DELETE\s+FROM|TRUNCATE|UPDATE\s+public\.)\b/i);
  });

  it('uses the real purchase transaction date and excludes non-purchase stock signals', () => {
    expect(sql).toContain("transaction_row.type = 'cari_alis'");
    expect(sql).toContain("movement.hareket_tipi = 'giris'");
    expect(sql).toContain('transaction_row.date <= p_end_date');
    expect(sql).toContain('purchase.transaction_date >= p_start_date');
    expect(sql).not.toMatch(/movement\.created_at\s*(?:>=|<=|BETWEEN)/i);
    expect(sql).not.toContain("transaction_row.type = 'cari_alis_iade'");
  });

  it('keeps currencies separate and calculates positive-only reference extra cost', () => {
    expect(sql).toContain('row_data.product_id, row_data.price_currency');
    expect(sql).toContain('timeline_row.product_id, timeline_row.price_currency');
    expect(sql).toMatch(
      /row_data\.quantity[\s\S]*?greatest\([\s\S]*?row_data\.unit_price - row_data\.reference_price,[\s\S]*?0/,
    );
    expect(sql).toContain('WHERE summary.change_count > 0');
  });

  it('reuses the established report/products permission projection', () => {
    expect(sql).toContain("internal.etkin_yetki_v2(p_isletme_id, 'raporlar')");
    expect(sql).toContain("internal.etkin_yetki_v2(p_isletme_id, 'urunler')");
    expect(sql).toContain('v_user_id uuid := auth.uid()');
    expect(sql).toContain('v_reports_can_view IS NOT TRUE');
    expect(sql).toContain('v_products_can_view IS NOT TRUE');
  });

  it('has a hardened definer posture and an authenticated-only grant', () => {
    expect(sql).toMatch(
      /LANGUAGE plpgsql\s+STABLE\s+SECURITY DEFINER\s+SET search_path TO 'pg_catalog'/,
    );
    expect(sql).toMatch(
      /REVOKE ALL[\s\S]*?FROM PUBLIC, anon, authenticated, service_role;/,
    );
    expect(sql).toMatch(
      /GRANT EXECUTE[\s\S]*?TO authenticated;/,
    );
  });
});
