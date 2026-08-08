import fs from 'fs';
import path from 'path';

const migration = fs.readFileSync(
  path.join(
    process.cwd(),
    'supabase/migrations/20260803164629_import_opening_balance_v1.sql',
  ),
  'utf8',
);

const executableSql = migration
  .replace(/--.*$/gm, '')
  .replace(/\/\*[\s\S]*?\*\//g, '');

describe('import opening balance v1 migration', () => {
  it('is additive and documents old-client compatibility', () => {
    expect(executableSql).not.toMatch(/\b(?:DROP|DELETE|TRUNCATE)\b/i);
    expect(executableSql).not.toMatch(/\bALTER\s+TABLE\b/i);
    expect(migration).toContain('1.5.x ETKISI: YOK');
  });

  it('locks the tenant and entity before applying a delta', () => {
    expect(migration).toContain('SECURITY DEFINER');
    expect(migration).toContain("SET search_path TO ''");
    expect(migration).toContain('business.user_id = auth.uid()');
    expect(migration).toContain('FOR SHARE');
    expect(migration.match(/FOR UPDATE/g)).toHaveLength(3);
    expect(migration).toContain('v_delta := p_amount - v_existing_initial');
  });

  it('derives cross-currency transaction effects on the server', () => {
    expect(migration).toContain('transaction_row.source_currency');
    expect(migration).toContain('transaction_row.target_currency');
    expect(migration).toContain('transaction_row.exchange_rate');
    expect(migration).toContain('transaction_row.amount / transaction_row.exchange_rate');
    expect(migration).toContain('transaction_row.amount * transaction_row.exchange_rate');
  });

  it('is idempotent and deny-by-default', () => {
    expect(migration).toContain('abs(v_existing_initial - p_amount) <= 0.009');
    expect(migration).toMatch(/REVOKE ALL[\s\S]*FROM PUBLIC, anon, authenticated, service_role/);
    expect(migration).toMatch(/GRANT EXECUTE[\s\S]*TO authenticated/);
  });
});
