import fs from 'node:fs';
import path from 'node:path';

const migrationPath = path.resolve(
  process.cwd(),
  'supabase/migrations/20260728224922_gate_income_expense_summary_reports.sql',
);
const sql = fs.readFileSync(migrationPath, 'utf8');

describe('S-08 income/expense report permission RPC contract', () => {
  it('preserves the existing RPC signature and result shape', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.get_income_expense_summary(');
    expect(sql).toContain('p_isletme_id uuid');
    expect(sql).toContain('p_start_date timestamp with time zone');
    expect(sql).toContain('p_end_date timestamp with time zone');
    expect(sql).toContain('RETURNS TABLE(type text, total numeric)');
  });

  it('keeps the definer function scoped and unavailable to anon', () => {
    expect(sql).toContain('SECURITY DEFINER');
    expect(sql).toContain("SET search_path TO 'public'");
    expect(sql).toContain('public.user_has_isletme_access(p_isletme_id)');
    expect(sql).toContain("public.user_has_module_access(p_isletme_id, 'raporlar')");
    expect(sql).toMatch(/FROM PUBLIC, anon;/);
    expect(sql).toMatch(/TO authenticated, service_role;/);
  });

  it('filters report rows by source module and creator visibility', () => {
    expect(sql).toContain("v_permissions->'modules'->>'hesaplar'");
    expect(sql).toContain("v_permissions->'modules'->>'cariler'");
    expect(sql).toContain("v_permissions->'modules'->>'personel'");
    expect(sql).toContain("v_permissions->'visibility'->>'can_see_all_users_data'");
    expect(sql).toContain("v_level NOT IN ('view', 'add', 'edit_own', 'edit_all')");
    expect(sql).toContain('OR i.created_by = v_user_id');
  });

  it('does not contain table or row destructive statements', () => {
    expect(sql).not.toMatch(/\bDROP\s+(TABLE|COLUMN)\b/i);
    expect(sql).not.toMatch(/\bALTER\s+TABLE\b/i);
    expect(sql).not.toMatch(/\b(INSERT|UPDATE|DELETE|TRUNCATE)\s+(INTO|FROM|TABLE|public\.)/i);
  });
});
