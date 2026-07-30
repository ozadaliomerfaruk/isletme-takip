import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../../..');
const MIGRATION_PATH =
  'supabase/migrations/20260729204756_add_personel_projection_rpcs.sql';
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

function functionSql(functionName: string): string {
  return (
    executableSql.match(
      new RegExp(
        String.raw`CREATE FUNCTION public\.${functionName}\([\s\S]*?\$function\$;`,
      ),
    )?.[0] ?? ''
  );
}

function normalizedReturnColumns(functionName: string): string {
  const sql = functionSql(functionName);
  const columns =
    sql.match(/RETURNS TABLE \(([\s\S]*?)\)\s*LANGUAGE/)?.[1] ?? '';

  return columns
    .replace(/\s+/g, ' ')
    .replace(/\s*,\s*/g, ', ')
    .trim();
}

const rowsSql = functionSql('get_personel_islem_satirlari_v1');
const quotasSql = functionSql('get_personel_izin_kotalari_v1');

describe('P0-S7/C3 personel projection migration sozlesmesi', () => {
  it('PB resolverindan sonra iki yeni additive endpoint olusturur', () => {
    expect(MIGRATION_PATH.localeCompare(PB_PATH)).toBeGreaterThan(0);
    expect(executableSql).toMatch(
      /CREATE FUNCTION public\.get_personel_islem_satirlari_v1/,
    );
    expect(executableSql).toMatch(
      /CREATE FUNCTION public\.get_personel_izin_kotalari_v1/,
    );
    expect(executableSql).not.toContain('CREATE OR REPLACE FUNCTION');
    expect(rowsSql).not.toBe('');
    expect(quotasSql).not.toBe('');
  });

  it('islem endpointinin exact imza, limit ve uc alanli cursorunu korur', () => {
    expect(executableSql).toMatch(
      /CREATE FUNCTION public\.get_personel_islem_satirlari_v1\(\s*p_isletme_id uuid,\s*p_personel_id uuid,\s*p_limit integer DEFAULT 50,\s*p_before_date timestamp without time zone DEFAULT NULL,\s*p_before_created_at timestamp with time zone DEFAULT NULL,\s*p_before_id uuid DEFAULT NULL\s*\)/s,
    );
    expect(rowsSql).toMatch(
      /p_limit IS NULL\s+OR p_limit < 1\s+OR p_limit > 100/s,
    );
    expect(rowsSql).toMatch(
      /\(\s*p_before_date IS NULL\s+AND p_before_created_at IS NULL\s+AND p_before_id IS NULL\s*\)\s+OR\s+\(\s*p_before_date IS NOT NULL\s+AND p_before_created_at IS NOT NULL\s+AND p_before_id IS NOT NULL\s*\)/s,
    );
    expect(
      rowsSql.match(
        /RAISE EXCEPTION 'PERSONEL_TRANSACTION_ROWS_INVALID_INPUT'\s+USING ERRCODE = '22023';/g,
      ),
    ).toHaveLength(2);
  });

  it('islem endpointi yalniz exact dar DTO kolonlarini dondurur', () => {
    expect(
      normalizedReturnColumns('get_personel_islem_satirlari_v1'),
    ).toBe(
      [
        'id uuid',
        'type text',
        'amount numeric',
        'description text',
        '"date" timestamp without time zone',
        'date_end text',
        'source_currency text',
        'target_currency text',
        'exchange_rate numeric',
        'created_by uuid',
        'created_at timestamp with time zone',
        'updated_at timestamp with time zone',
        'kategori_name text',
        'hesap_name text',
      ].join(', '),
    );

    const returnColumns =
      rowsSql.match(/RETURNS TABLE \(([\s\S]*?)\)\s*LANGUAGE/)?.[1] ??
      '';
    expect(returnColumns).not.toMatch(
      /\b(?:isletme_id|personel_id|hesap_id|kategori_id|cari_id|balance|salary|phone|notes|permissions|updated_by|source_ileri_id|hedef_islem_id)\b/,
    );
    expect(executableSql).not.toMatch(/SELECT\s+[^;]*\*/i);
  });

  it('izin kotasi endpointi yalniz uc aggregate kolonu dondurur', () => {
    expect(
      normalizedReturnColumns('get_personel_izin_kotalari_v1'),
    ).toBe(
      [
        'personel_id uuid',
        'hak_edilen numeric',
        'kullanilan numeric',
      ].join(', '),
    );
    expect(executableSql).toMatch(
      /CREATE FUNCTION public\.get_personel_izin_kotalari_v1\(\s*p_isletme_id uuid\s*\)/s,
    );
    expect(quotasSql).toMatch(
      /RAISE EXCEPTION 'PERSONEL_LEAVE_QUOTAS_INVALID_INPUT'\s+USING ERRCODE = '22023';/,
    );
  });

  it('iki endpointte Personel can_view, auth uid ve own/all kapilarini uygular', () => {
    for (const sql of [rowsSql, quotasSql]) {
      expect(sql).toContain('v_uid uuid := auth.uid();');
      expect(sql).toMatch(
        /FROM internal\.etkin_yetki\(\s*p_isletme_id,\s*'personel'\s*\) AS permission\s+LIMIT 1;/s,
      );
      expect(sql).toContain('permission.can_view');
      expect(sql).toContain('permission.can_see_all_users_data');
      expect(sql).toMatch(
        /v_uid IS NULL OR v_can_view_personel IS NOT TRUE/,
      );
      expect(sql).toMatch(
        /v_can_see_all_users_data IS TRUE\s+OR islem\.created_by = v_uid/,
      );
      expect(sql).toMatch(
        /uye\.permissions->'visibility'->'can_see_archived'\s+= 'true'::pg_catalog\.jsonb/,
      );
      expect(sql).toMatch(
        /uye\.permissions->'visibility'->'can_see_passive'\s+= 'true'::pg_catalog\.jsonb/,
      );
      expect(sql).not.toMatch(
        /uye\.permissions->(?:'actions'|'modules'|'level')/,
      );
      expect(sql).not.toMatch(
        /uye\.permissions->'visibility'->>'can_see_(?:archived|passive)'/,
      );
    }
  });

  it('parent personeli tenant, sahiplik, arsiv ve pasif kurallariyla kapatir', () => {
    expect(rowsSql).toMatch(
      /IF NOT EXISTS \(\s*SELECT 1\s+FROM public\.personel AS personel\s+WHERE personel\.id = p_personel_id\s+AND personel\.isletme_id = p_isletme_id[\s\S]*v_is_owner IS TRUE\s+OR \([\s\S]*v_can_see_all_users_data IS TRUE\s+OR personel\.created_by = v_uid[\s\S]*v_can_see_archived IS TRUE\s+OR personel\.is_archived IS FALSE[\s\S]*v_can_see_passive IS TRUE\s+OR personel\.is_active IS TRUE[\s\S]*\) THEN/s,
    );
    expect(rowsSql).toMatch(
      /FROM public\.isletmeler AS isletme\s+WHERE isletme\.id = p_isletme_id\s+AND isletme\.user_id = v_uid/s,
    );
    expect(
      rowsSql.match(
        /RAISE EXCEPTION 'PERSONEL_TRANSACTION_ROWS_NOT_AUTHORIZED'\s+USING ERRCODE = '42501';/g,
      ),
    ).toHaveLength(2);
  });

  it('kanonik P ve P+H matrisini helper uzerinden deny-by-default uygular', () => {
    expect(rowsSql).toMatch(
      /FROM internal\.etkin_yetki\(\s*p_isletme_id,\s*'hesaplar'\s*\)/s,
    );
    expect(rowsSql).toMatch(
      /mapping\.source_modules = ARRAY\['personel'\]::text\[\]\s+THEN true/s,
    );
    expect(rowsSql).toMatch(
      /mapping\.source_modules\s+= ARRAY\['personel', 'hesaplar'\]::text\[\]\s+THEN v_can_view_hesaplar IS TRUE/s,
    );
    expect(rowsSql).toMatch(/ELSE false\s+END/);
    expect(rowsSql).toContain(
      'islem.personel_id = p_personel_id',
    );
    expect(rowsSql).not.toMatch(
      /islem\.type\s+IN\s+\(\s*'personel_gider'/,
    );
  });

  it('minimal kategori/hesap referanslarini tenant ve hesap gorunurlugune baglar', () => {
    expect(rowsSql).toMatch(
      /LEFT JOIN public\.kategoriler AS kategori\s+ON kategori\.id = candidate\.kategori_id\s+AND kategori\.isletme_id = candidate\.isletme_id/s,
    );
    expect(rowsSql).toMatch(
      /LEFT JOIN public\.hesaplar AS hesap\s+ON hesap\.id = candidate\.hesap_id\s+AND hesap\.isletme_id = candidate\.isletme_id[\s\S]*candidate\.source_modules\s+= ARRAY\['personel', 'hesaplar'\]::text\[\][\s\S]*v_can_view_hesaplar IS TRUE/s,
    );
    expect(rowsSql).toMatch(
      /hesap\.type <> 'birikim'\s+OR v_can_view_birikim IS TRUE/s,
    );
    expect(rowsSql).toMatch(
      /v_can_see_archived IS TRUE\s+OR hesap\.is_archived IS FALSE/s,
    );
    expect(rowsSql).toMatch(
      /v_can_see_passive IS TRUE\s+OR hesap\.is_active IS TRUE/s,
    );
    expect(rowsSql).not.toMatch(
      /\bhesap\.(?:balance|initial_balance|credit_limit)\b/,
    );
  });

  it('nullable created_at icin ayni fallback ile deterministik keyset kullanir', () => {
    expect(rowsSql).toMatch(
      /CROSS JOIN LATERAL \(\s*SELECT COALESCE\(\s*islem\.created_at,\s*islem\.date::timestamp without time zone\s+AT TIME ZONE 'Europe\/Istanbul'\s*\) AS created_at\s*\) AS cursor_key/s,
    );
    expect(rowsSql).toMatch(
      /ROW\(\s*islem\.date::timestamp without time zone,\s*cursor_key\.created_at,\s*islem\.id\s*\) < ROW\(\s*p_before_date,\s*p_before_created_at,\s*p_before_id\s*\)/s,
    );
    expect(rowsSql).toMatch(
      /ORDER BY\s+candidate\.date DESC,\s*candidate\.created_at DESC,\s*candidate\.id DESC\s+LIMIT p_limit;/s,
    );
    expect(migration).toContain(
      'idx_islemler_personel(personel_id)',
    );
    expect(migration).toContain(
      'idx_islemler_personel_date(personel_id, date DESC)',
    );
    expect(migration).toContain('indeks eklemez.');
  });

  it('izin kotalarini exact izin tiplerinden ve sahiplik filtresinden sonra toplar', () => {
    expect(quotasSql).toMatch(
      /islem\.type IN \(\s*'personel_izin_hakki',\s*'personel_izin_kullanimi'\s*\)/s,
    );
    expect(quotasSql).toMatch(
      /internal\.islem_tipi_modulu\(islem\.type\)\s+= ARRAY\['personel'\]::text\[\]/,
    );
    expect(quotasSql).toMatch(
      /SUM\(islem\.amount\) FILTER \(\s*WHERE islem\.type = 'personel_izin_hakki'\s*\)/s,
    );
    expect(quotasSql).toMatch(
      /SUM\(islem\.amount\) FILTER \(\s*WHERE islem\.type = 'personel_izin_kullanimi'\s*\)/s,
    );
    expect(quotasSql).toMatch(
      /WHERE personel\.isletme_id = p_isletme_id[\s\S]*v_can_see_all_users_data IS TRUE\s+OR personel\.created_by = v_uid[\s\S]*personel\.is_archived IS FALSE[\s\S]*personel\.is_active IS TRUE/s,
    );
    expect(
      quotasSql.indexOf('OR islem.created_by = v_uid'),
    ).toBeLessThan(quotasSql.indexOf('GROUP BY personel.id'));
  });

  it('iki SECURITY DEFINER endpointi authenticated-only exact ACL ile kapatir', () => {
    expect(rowsSql).toMatch(
      /LANGUAGE plpgsql\s+STABLE\s+SECURITY DEFINER\s+SET search_path TO 'pg_catalog'/,
    );
    expect(quotasSql).toMatch(
      /LANGUAGE plpgsql\s+STABLE\s+SECURITY DEFINER\s+SET search_path TO 'pg_catalog'/,
    );

    const rowsSignature =
      String.raw`public\.get_personel_islem_satirlari_v1\(\s*uuid,\s*uuid,\s*integer,\s*timestamp without time zone,\s*timestamp with time zone,\s*uuid\s*\)`;
    const quotasSignature =
      String.raw`public\.get_personel_izin_kotalari_v1\(\s*uuid\s*\)`;

    for (const signature of [rowsSignature, quotasSignature]) {
      expect(executableSql).toMatch(
        new RegExp(
          String.raw`ALTER FUNCTION ${signature}\s+OWNER TO postgres;`,
        ),
      );
      expect(executableSql).toMatch(
        new RegExp(
          String.raw`REVOKE ALL\s+ON FUNCTION ${signature}\s+FROM PUBLIC, anon, authenticated, service_role;`,
        ),
      );
      expect(executableSql).toMatch(
        new RegExp(
          String.raw`GRANT EXECUTE\s+ON FUNCTION ${signature}\s+TO authenticated;`,
        ),
      );
    }
  });

  it('tablo/policy/index/veri veya mevcut RPC degistirmez', () => {
    expect(executableSql).not.toMatch(/\bDROP\b/i);
    expect(executableSql).not.toMatch(/\bALTER\s+TABLE\b/i);
    expect(executableSql).not.toMatch(
      /\bCREATE\s+(?:UNIQUE\s+)?INDEX\b/i,
    );
    expect(executableSql).not.toMatch(/\bCREATE\s+POLICY\b/i);
    expect(executableSql).not.toMatch(/\bINSERT\s+INTO\b/i);
    expect(executableSql).not.toMatch(
      /\bUPDATE\s+(?:public\.)?[a-z"]/i,
    );
    expect(executableSql).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(executableSql).not.toMatch(/\bTRUNCATE\b/i);
    expect(executableSql).not.toContain(
      'CREATE OR REPLACE FUNCTION public.get_personel_ozet',
    );
  });

  it('1.5.x ve DML/backfill sinirlarini belgeler', () => {
    expect(migration).toContain('1.5.x');
    expect(migration).toContain('Migration-time DML/backfill yoktur');
    expect(migration).toContain(
      'mevcut SELECT/RLS yolunu aynen kullanir',
    );
    expect(migration).toContain(
      'get_personel_ozet bu dilimin disindadir ve degistirilmez',
    );
  });
});
