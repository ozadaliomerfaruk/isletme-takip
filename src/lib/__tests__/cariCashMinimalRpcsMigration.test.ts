import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../../..');
const MIGRATION_FILENAME =
  '20260729035945_add_cari_cash_minimal_rpcs.sql';
const migrationPath = path.join(
  ROOT,
  'supabase/migrations',
  MIGRATION_FILENAME,
);
const sql = fs.readFileSync(migrationPath, 'utf8');

function extractFunction(signature: string): string {
  const start = sql.indexOf(signature);
  const end = sql.indexOf('$function$;', start);

  if (start < 0 || end < 0) {
    throw new Error(`${signature} migration içinde ayrıştırılamadı`);
  }

  return sql.slice(start, end + '$function$;'.length);
}

const referencesFunction = extractFunction(
  'CREATE FUNCTION public.get_cari_hesap_referanslari',
);
const createFunction = extractFunction(
  'CREATE FUNCTION public.create_cari_nakit_islem_atomik',
);

describe('S-11 cariler-only minimal server RPC contract', () => {
  it('is a new additive migration created under the expected name', () => {
    expect(path.basename(migrationPath)).toBe(MIGRATION_FILENAME);
    expect(sql).not.toMatch(/\bALTER\s+TABLE\b/i);
    expect(sql).not.toMatch(/\bDROP\s+(TABLE|COLUMN|FUNCTION)\b/i);
    expect(sql).not.toMatch(/\bTRUNCATE\b/i);
    expect(sql).not.toMatch(/\bCREATE\s+POLICY\b/i);
    expect(sql).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(sql).not.toContain('CREATE OR REPLACE FUNCTION');
  });

  it('exposes an exact balance-free account reference projection', () => {
    expect(referencesFunction).toMatch(
      /RETURNS TABLE \(\s*id uuid,\s*name text,\s*currency text,\s*type text\s*\)/,
    );
    expect(referencesFunction).toContain('FROM public.hesaplar AS h');
    expect(referencesFunction).toContain('h.isletme_id = p_isletme_id');
    expect(referencesFunction).toContain('h.is_active IS TRUE');
    expect(referencesFunction).toContain('h.is_archived IS FALSE');
    expect(referencesFunction).toContain("h.type <> 'birikim'");
    expect(referencesFunction).toMatch(
      /ORDER BY\s+pg_catalog\.lower\(h\.name::text\),\s+h\.name::text,\s+h\.id;/,
    );

    for (const forbidden of [
      'balance',
      'initial_balance',
      'credit_limit',
      'card_number',
      'payment_due_day',
      'description',
      'created_by',
      'updated_by',
    ]) {
      expect(referencesFunction).not.toContain(forbidden);
    }
  });

  it('gates account references by active cariler create capability', () => {
    expect(referencesFunction).toMatch(
      /FROM public\.isletmeler AS isl[\s\S]*?isl\.id = p_isletme_id[\s\S]*?isl\.user_id = v_uid/,
    );
    expect(referencesFunction).toMatch(
      /FROM public\.isletme_users AS iu[\s\S]*?iu\.isletme_id = p_isletme_id[\s\S]*?iu\.user_id = v_uid[\s\S]*?iu\.status = 'active'/,
    );
    expect(referencesFunction).toContain(
      "v_permissions->'modules'->'cariler'",
    );
    expect(referencesFunction).toContain(
      "v_level IN ('add', 'edit_own', 'edit_all')",
    );
    expect(referencesFunction).toContain(
      "v_permissions->'actions'->'cariler'->'can_create'",
    );
    expect(referencesFunction).toContain(
      'IF NOT COALESCE(v_can_view, false)',
    );
    expect(referencesFunction).toContain(
      'OR NOT COALESCE(v_can_create, false)',
    );
    expect(referencesFunction).toContain(
      "RAISE EXCEPTION 'CARI_CASH_OPERATION_NOT_AUTHORIZED'",
    );
    expect(referencesFunction).toContain("USING ERRCODE = '42501'");
  });

  it('uses hardened SECURITY DEFINER posture and exact grants for both functions', () => {
    expect(referencesFunction).toMatch(
      /LANGUAGE plpgsql\s+STABLE\s+SECURITY DEFINER\s+SET search_path TO ''/,
    );
    expect(createFunction).toMatch(
      /LANGUAGE plpgsql\s+SECURITY DEFINER\s+SET search_path TO ''/,
    );
    expect(sql).toMatch(
      /REVOKE ALL\s+ON FUNCTION public\.get_cari_hesap_referanslari\(uuid\)\s+FROM PUBLIC, anon;/,
    );
    expect(sql).toMatch(
      /GRANT EXECUTE\s+ON FUNCTION public\.get_cari_hesap_referanslari\(uuid\)\s+TO authenticated;/,
    );
    expect(sql).toMatch(
      /REVOKE ALL\s+ON FUNCTION public\.create_cari_nakit_islem_atomik\(\s*uuid, uuid, text, numeric, timestamp without time zone,\s*uuid, uuid, text, uuid, numeric, uuid\s*\)\s+FROM PUBLIC, anon;/,
    );
    expect(sql).toMatch(
      /GRANT EXECUTE\s+ON FUNCTION public\.create_cari_nakit_islem_atomik\(\s*uuid, uuid, text, numeric, timestamp without time zone,\s*uuid, uuid, text, uuid, numeric, uuid\s*\)\s+TO authenticated;/,
    );
  });

  it('keeps the create API narrow and returns only a minimal transaction projection', () => {
    expect(createFunction).toMatch(
      /create_cari_nakit_islem_atomik\(\s*p_isletme_id uuid,\s*p_islem_id uuid,\s*p_type text,\s*p_amount numeric,\s*p_date timestamp without time zone,\s*p_hesap_id uuid,\s*p_cari_id uuid,\s*p_description text,\s*p_kategori_id uuid,\s*p_exchange_rate numeric,\s*p_hedef_islem_id uuid\s*\)/,
    );
    expect(createFunction).toMatch(
      /RETURNS TABLE \(\s*id uuid,\s*type text,\s*amount numeric,\s*description text,\s*"date" timestamp without time zone,\s*hesap_id uuid,\s*kategori_id uuid,\s*cari_id uuid,\s*source_currency text,\s*target_currency text,\s*exchange_rate numeric,\s*hedef_islem_id uuid,\s*created_at timestamp with time zone,\s*created_by uuid\s*\)/,
    );
    expect(createFunction).not.toContain('p_balance_ops');
    expect(createFunction).not.toContain('p_source_currency');
    expect(createFunction).not.toContain('p_target_currency');
    expect(createFunction).not.toContain('credit_limit');
    expect(createFunction).not.toContain('initial_balance');
  });

  it('accepts only finite positive two-decimal cari cash operations', () => {
    expect(createFunction).toContain(
      "p_type NOT IN ('cari_odeme', 'cari_tahsilat')",
    );
    expect(createFunction).toContain(
      "p_amount = 'NaN'::pg_catalog.numeric",
    );
    expect(createFunction).toContain(
      "p_amount = 'Infinity'::pg_catalog.numeric",
    );
    expect(createFunction).toContain('p_amount <= 0');
    expect(createFunction).toContain(
      'p_amount <> pg_catalog.round(p_amount, 2)',
    );
    expect(createFunction).toContain('p_amount > 9999999999999.99');
    expect(createFunction).toContain(
      "RAISE EXCEPTION 'CARI_CASH_OPERATION_INVALID_INPUT'",
    );
    expect(createFunction).toContain("USING ERRCODE = '22023'");
  });

  it('locks same-tenant active entities and rejects archived or savings accounts', () => {
    expect(createFunction).toMatch(
      /FROM public\.hesaplar AS h[\s\S]*?h\.id = p_hesap_id[\s\S]*?h\.isletme_id = p_isletme_id[\s\S]*?h\.is_active IS TRUE[\s\S]*?h\.is_archived IS FALSE[\s\S]*?h\.type <> 'birikim'[\s\S]*?FOR NO KEY UPDATE;/,
    );
    expect(createFunction).toMatch(
      /FROM public\.cariler AS c[\s\S]*?c\.id = p_cari_id[\s\S]*?c\.isletme_id = p_isletme_id[\s\S]*?c\.is_active IS TRUE[\s\S]*?c\.is_archived IS FALSE[\s\S]*?FOR NO KEY UPDATE;/,
    );
    expect(createFunction.match(/FOR NO KEY UPDATE;/g)).toHaveLength(2);
  });

  it('derives currencies from DB rows and enforces current conversion semantics', () => {
    expect(createFunction).toContain(
      'INTO v_locked_id, v_source_currency',
    );
    expect(createFunction).toContain(
      'INTO v_locked_id, v_target_currency',
    );
    expect(createFunction).toContain(
      'IF v_source_currency = v_target_currency THEN',
    );
    expect(createFunction).toContain(
      'v_rate public.islemler.exchange_rate%TYPE',
    );
    expect(createFunction).toMatch(
      /v_cari_delta := CASE[\s\S]*?WHEN v_source_currency = v_target_currency THEN v_amount[\s\S]*?WHEN v_source_currency = 'TRY'[\s\S]*?pg_catalog\.round\(v_amount \/ v_rate, 2\)[\s\S]*?pg_catalog\.round\(v_amount \* v_rate, 2\)/,
    );
    expect(createFunction).toContain(
      "WHEN p_type = 'cari_odeme' THEN -v_amount",
    );
    expect(createFunction).toContain(
      "IF p_type = 'cari_tahsilat' THEN",
    );
  });

  it('rejects categories in the narrow flow and validates target invoice scope', () => {
    expect(createFunction).toContain('OR p_kategori_id IS NOT NULL');
    expect(createFunction).not.toContain('FROM public.kategoriler');
    expect(createFunction).toMatch(
      /FROM public\.islemler AS i[\s\S]*?i\.id = p_hedef_islem_id[\s\S]*?i\.isletme_id = p_isletme_id[\s\S]*?i\.cari_id = p_cari_id[\s\S]*?i\.type = v_expected_invoice_type[\s\S]*?FOR KEY SHARE;/,
    );
    expect(createFunction).toContain(
      "WHEN p_type = 'cari_tahsilat' THEN 'cari_satis'",
    );
    expect(createFunction).toContain(
      "ELSE 'cari_alis'",
    );
  });

  it('is idempotent and applies no balance/tahsis delta on duplicate UUID', () => {
    const preProbe = createFunction.indexOf(
      'Idempotency on-probe',
    );
    const insert = createFunction.indexOf(
      'INSERT INTO public.islemler',
    );
    const accountUpdate = createFunction.indexOf(
      'UPDATE public.hesaplar AS h',
    );
    const allocation = createFunction.indexOf(
      'PERFORM public.tahsis_odeme_esitle',
    );

    expect(preProbe).toBeGreaterThan(-1);
    expect(preProbe).toBeLessThan(insert);
    expect(createFunction).toContain(
      'ON CONFLICT ON CONSTRAINT islemler_pkey DO NOTHING',
    );
    expect(createFunction).not.toContain('ON CONFLICT (id) DO NOTHING');
    expect(createFunction).toContain(
      'GET DIAGNOSTICS v_inserted_rows = ROW_COUNT;',
    );
    expect(createFunction).toMatch(
      /INSERT INTO public\.islemler \([\s\S]*?created_by\s*\)[\s\S]*?p_hedef_islem_id,\s*v_uid\s*\)/,
    );
    expect(createFunction).toContain(
      'IF v_inserted_rows = 0 THEN',
    );
    expect(createFunction.match(/v_existing\.created_by IS DISTINCT FROM v_uid/g))
      .toHaveLength(2);
    expect(accountUpdate).toBeGreaterThan(insert);
    expect(allocation).toBeGreaterThan(accountUpdate);
  });

  it('never calls increment_balance and scopes direct updates by row plus tenant', () => {
    expect(createFunction).not.toContain('increment_balance');
    expect(createFunction).toMatch(
      /UPDATE public\.cariler AS c[\s\S]*?balance = c\.balance \+ v_cari_delta[\s\S]*?WHERE c\.id = p_cari_id\s+AND c\.isletme_id = p_isletme_id[\s\S]*?AND c\.is_archived IS FALSE;/,
    );
    expect(createFunction).toMatch(
      /UPDATE public\.hesaplar AS h[\s\S]*?balance = h\.balance \+ v_hesap_delta[\s\S]*?WHERE h\.id = p_hesap_id\s+AND h\.isletme_id = p_isletme_id[\s\S]*?AND h\.type <> 'birikim';/,
    );
    expect(createFunction.match(
      /GET DIAGNOSTICS v_updated_rows = ROW_COUNT;/g,
    )).toHaveLength(2);
  });

  it('calls the existing single FIFO engine only after both balance legs', () => {
    const cariUpdate = createFunction.indexOf(
      'UPDATE public.cariler AS c',
    );
    const accountUpdate = createFunction.indexOf(
      'UPDATE public.hesaplar AS h',
    );
    const allocation = createFunction.indexOf(
      'PERFORM public.tahsis_odeme_esitle',
    );

    expect(cariUpdate).toBeGreaterThan(-1);
    expect(accountUpdate).toBeGreaterThan(cariUpdate);
    expect(allocation).toBeGreaterThan(accountUpdate);
    expect(createFunction).toMatch(
      /PERFORM public\.tahsis_odeme_esitle\(\s*p_isletme_id,\s*p_islem_id,\s*p_hedef_islem_id\s*\);/,
    );
  });

  it('uses generic authorization messages and documents compatibility tests', () => {
    const authorizationMessages = Array.from(
      sql.matchAll(
        /RAISE EXCEPTION\s+'(CARI_CASH_OPERATION_NOT_AUTHORIZED)'/g,
      ),
    );

    expect(authorizationMessages.length).toBeGreaterThan(5);
    expect(sql).not.toMatch(
      /RAISE EXCEPTION\s+'CARI_CASH_OPERATION_NOT_AUTHORIZED[^']*%/i,
    );
    expect(sql).toContain('OLD CLIENT (1.5.x) IMPACT');
    expect(sql).toContain('MANUAL TEST MATRIX');
    expect(sql).toContain('Ayni p_islem_id ve ayni payload ikinci kez');
    expect(sql).toContain('TRY->USD, USD->TRY ve USD->EUR');
    expect(sql).not.toContain('internal.');
  });
});
