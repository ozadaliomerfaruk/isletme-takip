import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../../..');
const MIGRATION_PATH =
  'supabase/migrations/20260729092919_add_category_report_v2_permission_projection.sql';
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

const exactResult =
  'kategori_id uuid, kategori_adi text, kategori_renk text, kategori_icon text, parent_id uuid, islem_count bigint, total_amount numeric';

function normalizeSql(value: string): string {
  return value
    .replace(/\s+/g, ' ')
    .replace(/\s*,\s*/g, ', ')
    .trim();
}

describe('P0-S8 category report v2 permission projection migration', () => {
  it('P-B resolverindan sonra siralanir ve V2yi additive olusturur', () => {
    expect(MIGRATION_PATH.localeCompare(PB_PATH)).toBeGreaterThan(0);
    expect(executableSql).toMatch(
      /CREATE FUNCTION public\.get_category_report_v2\(/,
    );
    expect(executableSql).not.toMatch(
      /CREATE OR REPLACE FUNCTION public\.get_category_report_v2\(/,
    );
  });

  it('canli V1 drift snapshotini imza, sonuc, owner, ACL ve md5 ile kilitler', () => {
    expect(executableSql).toContain(
      "'public.get_category_report(uuid,text[],timestamp with time zone,timestamp with time zone)'",
    );
    expect(executableSql).toContain(
      '92536d5b251422599d8d7f270e4f2240',
    );
    expect(executableSql).toContain(
      "'{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}'",
    );
    expect(executableSql).toContain(
      "v_owner IS DISTINCT FROM 'postgres'",
    );
    expect(executableSql).toContain(
      "v_volatility IS DISTINCT FROM 'v'",
    );
    expect(executableSql).toContain(
      "ARRAY['search_path=public']::text[]",
    );
    expect(executableSql).toContain(
      'md5(pg_get_functiondef(proc.oid))',
    );
  });

  it('V2 exact parametre imzasini ve yedi kolonlu sonucu korur', () => {
    expect(executableSql).toMatch(
      /CREATE FUNCTION public\.get_category_report_v2\(\s*p_isletme_id uuid,\s*p_types text\[\],\s*p_start_date timestamp with time zone,\s*p_end_date timestamp with time zone\s*\)/s,
    );

    const returnColumns =
      executableSql.match(
        /CREATE FUNCTION public\.get_category_report_v2[\s\S]*?RETURNS TABLE\(([\s\S]*?)\)\s*LANGUAGE/,
      )?.[1] ?? '';
    expect(normalizeSql(returnColumns)).toBe(exactResult);
  });

  it('V1i ayni imza ve exact outputla V2 compatibility wrapper yapar', () => {
    expect(executableSql).toMatch(
      /CREATE OR REPLACE FUNCTION public\.get_category_report\(\s*p_isletme_id uuid,\s*p_types text\[\],\s*p_start_date timestamp with time zone,\s*p_end_date timestamp with time zone\s*\)\s*RETURNS TABLE\(([\s\S]*?)\)\s*LANGUAGE sql/s,
    );

    const wrapperReturnColumns =
      executableSql.match(
        /CREATE OR REPLACE FUNCTION public\.get_category_report[\s\S]*?RETURNS TABLE\(([\s\S]*?)\)\s*LANGUAGE sql/,
      )?.[1] ?? '';
    expect(normalizeSql(wrapperReturnColumns)).toBe(exactResult);
    expect(executableSql).toMatch(
      /FROM public\.get_category_report_v2\(\s*p_isletme_id,\s*p_types,\s*p_start_date,\s*p_end_date\s*\) AS report_row/s,
    );
  });

  it('Raporlar ve dort kaynak modulu kanonik resolverdan fail-closed cozer', () => {
    for (const moduleName of [
      'raporlar',
      'hesaplar',
      'cariler',
      'urunler',
      'personel',
    ]) {
      expect(executableSql).toMatch(
        new RegExp(
          `FROM internal\\.etkin_yetki\\(p_isletme_id, '${moduleName}'\\) AS permission\\s+LIMIT 1;`,
        ),
      );
    }

    expect(executableSql).toContain(
      'v_user_id IS NULL OR v_reports_can_view IS NOT TRUE',
    );
    expect(executableSql).not.toMatch(/permissions\s*->/);
    expect(executableSql).not.toContain('public.isletme_users');
  });

  it('null, bos, asiri, gecersiz tarih ve tek bilinmeyen tipi tum cagri icin eler', () => {
    expect(executableSql).toMatch(
      /p_isletme_id IS NULL\s+OR p_types IS NULL\s+OR pg_catalog\.cardinality\(p_types\) < 1\s+OR pg_catalog\.cardinality\(p_types\) > 16\s+OR p_start_date IS NULL\s+OR p_end_date IS NULL\s+OR p_start_date > p_end_date/s,
    );
    expect(executableSql).toMatch(
      /FROM pg_catalog\.unnest\(p_types\) AS requested_type\(type_name\)\s+WHERE requested_type\.type_name IS NULL\s+OR internal\.islem_tipi_modulu\(requested_type\.type_name\) IS NULL/s,
    );
  });

  it('tip kaynak modullerinin tamamini MATERIALIZED izinli islem setinde ister', () => {
    expect(
      executableSql.match(
        /internal\.islem_tipi_modulu\(transaction_row\.type\) AS required_modules/g,
      ),
    ).toHaveLength(1);
    expect(
      executableSql.match(
        /source_mapping\.required_modules IS NOT NULL/g,
      ),
    ).toHaveLength(1);
    expect(
      executableSql.match(
        /source_mapping\.required_modules <@ v_allowed_source_modules/g,
      ),
    ).toHaveLength(1);
    expect(executableSql).toContain(
      'eligible_islemler AS MATERIALIZED',
    );
  });

  it('once izinli islemleri suzer, sonra yalniz hedef urun hareketlerini tarar', () => {
    expect(executableSql).toMatch(
      /eligible_islemler AS MATERIALIZED \([\s\S]*?transaction_row\.date >= p_start_date[\s\S]*?transaction_row\.date <= p_end_date[\s\S]*?OR transaction_row\.created_by = v_user_id[\s\S]*?\),\s*urun_islem_tutar AS/s,
    );
    expect(executableSql).toMatch(
      /FROM eligible_islemler AS eligible_transaction\s+INNER JOIN public\.urun_hareketler AS movement\s+ON movement\.islem_id = eligible_transaction\.id\s+AND movement\.isletme_id = p_isletme_id/s,
    );
    expect(executableSql).toMatch(
      /urun_islem_tutar AS \([\s\S]*?WHERE v_has_urunler IS TRUE\s+AND product\.is_active IS NOT FALSE/s,
    );
    expect(executableSql).toContain(
      'product.is_active IS NOT FALSE',
    );
  });

  it('creator filtresini tum SUM ve COUNT islemlerinden once bir kez uygular', () => {
    expect(
      executableSql.match(
        /v_can_see_all_users_data IS TRUE\s+OR transaction_row\.created_by = v_user_id/g,
      ),
    ).toHaveLength(1);

    const firstAggregate = executableSql.indexOf(
      'pg_catalog.sum(movement_amount.hareket_tutar)',
    );
    const firstCreatorFilter = executableSql.indexOf(
      'OR transaction_row.created_by = v_user_id',
    );
    expect(firstCreatorFilter).toBeGreaterThan(-1);
    expect(firstCreatorFilter).toBeLessThan(firstAggregate);
  });

  it('bilesen joinlerini tenant-scope eder ve V1 resolved kategori id davranisini korur', () => {
    for (const tableAlias of [
      ['product', 'public\\.urunler'],
      ['product_category', 'public\\.kategoriler'],
      ['account', 'public\\.hesaplar'],
      ['target_account', 'public\\.hesaplar'],
      ['cari', 'public\\.cariler'],
      ['employee', 'public\\.personel'],
      ['category', 'public\\.kategoriler'],
    ] as const) {
      expect(executableSql).toMatch(
        new RegExp(
          `${tableAlias[1]} AS ${tableAlias[0]}[\\s\\S]{0,180}${tableAlias[0]}\\.isletme_id = p_isletme_id`,
        ),
      );
    }
    expect(executableSql).toMatch(
      /SELECT\s+distributed\.resolved_kategori_id AS kategori_id,[\s\S]*?FROM dagitim AS distributed/s,
    );
  });

  it('mevcut pasif filtrelerini korur ve arsiv filtresi eklemez', () => {
    expect(executableSql).toContain(
      'product.is_active IS NOT FALSE',
    );
    expect(
      executableSql.match(
        /\(account\.id IS NULL OR account\.is_active = true\)/g,
      ),
    ).toHaveLength(1);
    expect(
      executableSql.match(
        /\(target_account\.id IS NULL OR target_account\.is_active = true\)/g,
      ),
    ).toHaveLength(1);
    expect(
      executableSql.match(
        /\(cari\.id IS NULL OR cari\.is_active IS NOT FALSE\)/g,
      ),
    ).toHaveLength(1);
    expect(
      executableSql.match(
        /\(employee\.id IS NULL OR employee\.is_active IS NOT FALSE\)/g,
      ),
    ).toHaveLength(1);
    expect(executableSql).not.toMatch(/\.[iI]s_archived\b/);
  });

  it('iki ucu pg_catalog search_path, SECDEF STABLE ve authenticated-only ACL ile kapatir', () => {
    expect(
      executableSql.match(
        /STABLE\s+SECURITY DEFINER\s+SET search_path TO 'pg_catalog'/g,
      ),
    ).toHaveLength(2);

    for (const functionName of [
      'get_category_report_v2',
      'get_category_report',
    ]) {
      const signature =
        `public\\.${functionName}\\(\\s*uuid,\\s*text\\[\\],\\s*timestamp with time zone,\\s*timestamp with time zone\\s*\\)`;
      expect(executableSql).toMatch(
        new RegExp(
          `REVOKE ALL ON FUNCTION ${signature}\\s+FROM PUBLIC, anon, authenticated, service_role;`,
        ),
      );
      expect(executableSql).toMatch(
        new RegExp(
          `GRANT EXECUTE ON FUNCTION ${signature}\\s+TO authenticated;`,
        ),
      );
      expect(executableSql).not.toMatch(
        new RegExp(
          `GRANT EXECUTE ON FUNCTION ${signature}\\s+TO[^;]*service_role;`,
        ),
      );
    }

    expect(executableSql).toContain(
      "has_function_privilege('service_role', proc.oid, 'EXECUTE')",
    );
    expect(executableSql).toContain(
      'v_service_role_execute IS DISTINCT FROM false',
    );
  });

  it('tablo, kolon, policy, index veya kullanici verisine dokunmaz', () => {
    expect(executableSql).not.toMatch(/\bDROP\b/i);
    expect(executableSql).not.toMatch(/\bALTER\b/i);
    expect(executableSql).not.toMatch(
      /\bCREATE\s+(?:UNIQUE\s+)?INDEX\b/i,
    );
    expect(executableSql).not.toMatch(/\bCREATE\s+POLICY\b/i);
    expect(executableSql).not.toMatch(/\bINSERT\s+INTO\b/i);
    expect(executableSql).not.toMatch(
      /\bUPDATE\s+(?:public\.)?[a-z_"][a-z0-9_"]*/i,
    );
    expect(executableSql).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(executableSql).not.toMatch(/\bTRUNCATE\b/i);
  });

  it('eski-client, exact shape ve veri koruma etkisini migration notunda aciklar', () => {
    expect(migration).toContain('1.5.x / ESKI CLIENT');
    expect(migration).toContain(
      'ayni yedi kolonu ayni sirada',
    );
    expect(migration).toContain(
      'response shape degismedigi icin',
    );
    expect(migration).toContain(
      'tablo veya kullanici satirlarina yazmaz',
    );
    expect(migration).toContain(
      'is_archived filtresi eklenmez',
    );
  });
});
