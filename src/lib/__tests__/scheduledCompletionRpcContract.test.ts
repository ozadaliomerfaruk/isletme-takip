/**
 * İleri tarihli işlem tamamlama RPC'sinin güvenlik ve atomiklik sözleşmesini kilitler.
 *
 * Bu test SQL'i çalıştırmaz. Migration metnindeki transaction sınırlarını statik
 * olarak doğrular; gerçek yarış davranışı ayrıca staging Postgres kabul testi ister.
 */

import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../../..');
const MIGRATIONS_DIR = path.join(ROOT, 'supabase/migrations');
const MIGRATION_FILENAME =
  '20260728220238_complete_ileri_tarihli_islem_atomik.sql';
const migrationPath = path.join(MIGRATIONS_DIR, MIGRATION_FILENAME);

function stripLineComments(sql: string): string {
  return sql
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n');
}

function extractFunction(sql: string, signature: string): string {
  const start = sql.indexOf(signature);
  const end = sql.indexOf('$function$;', start);

  if (start < 0 || end < 0) {
    throw new Error(`${signature} gövdesi migration içinde ayrıştırılamadı`);
  }

  return sql.slice(start, end + '$function$;'.length);
}

const rawMigration = fs.readFileSync(migrationPath, 'utf8');
const migrationSql = stripLineComments(rawMigration);
const completionSignature =
  'CREATE OR REPLACE FUNCTION public.complete_ileri_tarihli_islem_atomik';
const triggerSignature =
  'CREATE OR REPLACE FUNCTION public.guard_completed_ileri_tarihli_status';
const completionBody = extractFunction(migrationSql, completionSignature);
const triggerBody = extractFunction(migrationSql, triggerSignature);

describe('complete_ileri_tarihli_islem_atomik — RPC sözleşmesi', () => {
  it('additive yeni imzayı, varsayılan kuru ve güvenli SECURITY DEFINER ayarını korur', () => {
    expect(path.basename(migrationPath)).toBe(MIGRATION_FILENAME);
    expect(completionBody).toMatch(
      /complete_ileri_tarihli_islem_atomik\(\s*p_isletme_id uuid,\s*p_ileri_id uuid,\s*p_exchange_rate numeric DEFAULT NULL,\s*p_expected_token text DEFAULT NULL,\s*p_completion_at timestamp without time zone DEFAULT NULL\s*\)/
    );
    expect(completionBody).toMatch(
      /RETURNS jsonb\s+LANGUAGE plpgsql\s+SECURITY DEFINER\s+SET search_path TO ''/
    );
  });

  it('scheduled kaynağı diğer tamamlamalardan önce FOR UPDATE ile kilitler', () => {
    const sourceSelect = completionBody.indexOf(
      'FROM public.ileri_tarihli_islemler it'
    );
    const sourceLock = completionBody.indexOf('FOR UPDATE;', sourceSelect);
    const existingProbe = completionBody.indexOf(
      'WHERE i.source_ileri_id = p_ileri_id'
    );
    const createCall = completionBody.indexOf(
      'v_result := public.create_islem_atomik'
    );

    expect(sourceSelect).toBeGreaterThan(-1);
    expect(sourceLock).toBeGreaterThan(sourceSelect);
    expect(sourceLock).toBeLessThan(existingProbe);
    expect(sourceLock).toBeLessThan(createCall);
  });

  it('yalnız pending/notified kaynaktan insert üretir; completed+source-yok durumda durur', () => {
    const statusGuard = completionBody.indexOf(
      "AND v_scheduled.status NOT IN ('pending', 'notified') THEN"
    );
    const notCompletable = completionBody.indexOf(
      "RAISE EXCEPTION 'SCHEDULED_NOT_COMPLETABLE'",
      statusGuard
    );
    const newRow = completionBody.indexOf('v_new_row :=');
    const createCall = completionBody.indexOf(
      'v_result := public.create_islem_atomik'
    );

    expect(statusGuard).toBeGreaterThan(-1);
    expect(notCompletable).toBeGreaterThan(statusGuard);
    expect(statusGuard).toBeLessThan(newRow);
    expect(statusGuard).toBeLessThan(createCall);
  });

  it('exact mevcut source kaydını idempotent döndürür; farklı id/işletmeyi conflict sayar', () => {
    const existingProbe = completionBody.indexOf(
      'SELECT i.*',
      completionBody.indexOf('FOR UPDATE;')
    );
    const createCall = completionBody.indexOf(
      'v_result := public.create_islem_atomik'
    );
    const postCreateLookup = completionBody.lastIndexOf(
      'SELECT i.*',
      completionBody.indexOf('IF NOT FOUND', createCall)
    );
    const preCreateBlock = completionBody.slice(
      existingProbe,
      postCreateLookup
    );
    const postCreateBlock = completionBody.slice(postCreateLookup);

    expect(preCreateBlock).toMatch(
      /WHERE i\.source_ileri_id = p_ileri_id\s+LIMIT 1\s+FOR SHARE;/
    );
    expect(preCreateBlock).toMatch(
      /v_existing\.id IS DISTINCT FROM p_ileri_id[\s\S]*?v_existing\.isletme_id IS DISTINCT FROM p_isletme_id/
    );
    expect(preCreateBlock).toContain(
      "RAISE EXCEPTION 'SCHEDULED_SOURCE_CONFLICT'"
    );
    expect(preCreateBlock).toMatch(
      /IF v_has_existing\s+AND v_scheduled\.status IS DISTINCT FROM 'completed' THEN[\s\S]*?SCHEDULED_STATUS_CONFLICT/
    );
    expect(preCreateBlock).not.toContain(
      'UPDATE public.ileri_tarihli_islemler'
    );
    expect(postCreateBlock).toMatch(
      /v_result := pg_catalog\.to_jsonb\(v_existing\);\s+IF v_has_existing THEN\s+RETURN v_result;/
    );
  });

  it('ilk idempotency lookupı ve unique-race lookupını LIMIT 1 FOR SHARE ile kilitler', () => {
    const lockedLookupPattern =
      /SELECT i\.\*\s+INTO v_existing\s+FROM public\.islemler i\s+WHERE i\.source_ileri_id = p_ileri_id\s+LIMIT 1\s+FOR SHARE;/g;
    const lockedLookups = completionBody.match(lockedLookupPattern) ?? [];
    const firstLookup = completionBody.indexOf(lockedLookups[0] ?? '');
    const uniqueHandler = completionBody.indexOf('WHEN unique_violation THEN');
    const secondLookup = completionBody.indexOf(
      lockedLookups[1] ?? '',
      firstLookup + 1
    );

    expect(lockedLookups).toHaveLength(2);
    expect(firstLookup).toBeGreaterThan(-1);
    expect(firstLookup).toBeLessThan(uniqueHandler);
    expect(secondLookup).toBeGreaterThan(uniqueHandler);
  });

  it('idempotent source kaydını tüm finansal niyet alanlarıyla birebir doğrular', () => {
    const createCall = completionBody.indexOf(
      'v_result := public.create_islem_atomik'
    );
    const comparatorStart = completionBody.indexOf(
      'IF NOT FOUND',
      createCall
    );
    const comparatorEnd = completionBody.indexOf(
      'v_result := pg_catalog.to_jsonb(v_existing);',
      comparatorStart
    );
    const exactComparator = completionBody.slice(
      comparatorStart,
      comparatorEnd
    );
    const expectedComparisons = [
      'v_existing.type::text IS DISTINCT FROM v_scheduled.type::text',
      'v_existing.amount::numeric(15,2) IS DISTINCT FROM v_amount',
      'v_existing.description IS DISTINCT FROM v_scheduled.description',
      'v_existing.hesap_id IS DISTINCT FROM v_scheduled.hesap_id',
      'v_existing.hedef_hesap_id IS DISTINCT FROM v_scheduled.hedef_hesap_id',
      'v_existing.kategori_id IS DISTINCT FROM v_scheduled.kategori_id',
      'v_existing.cari_id IS DISTINCT FROM v_scheduled.cari_id',
      'v_existing.personel_id IS DISTINCT FROM v_scheduled.personel_id',
      'v_existing.source_currency::text IS DISTINCT FROM v_source_currency',
      'v_existing.target_currency::text IS DISTINCT FROM v_target_currency',
      'v_existing.photo_path IS NOT NULL',
      'v_existing.date_end IS NOT NULL',
      'v_existing.vade_tarihi IS NOT NULL',
      'v_existing.hedef_islem_id IS NOT NULL',
    ];

    expectedComparisons.forEach((comparison) => {
      expect(exactComparator).toContain(comparison);
    });
    expect(exactComparator).toMatch(
      /v_is_cross[\s\S]*?v_existing\.exchange_rate IS NULL[\s\S]*?v_existing\.exchange_rate <= 0[\s\S]*?numeric\(18,8\)/
    );
    expect(exactComparator).toContain(
      'v_existing.exchange_rate::numeric(18,8) IS DISTINCT FROM v_rate'
    );
    expect(exactComparator).toMatch(
      /NOT v_is_cross[\s\S]*?v_existing\.exchange_rate IS NOT NULL/
    );
  });

  it('istemciden satır/bakiye JSONu almaz; satırı ve operasyonları serverda türetir', () => {
    const paramsEnd = completionBody.indexOf(')\nRETURNS jsonb');
    const params = completionBody.slice(0, paramsEnd);

    expect(params).not.toContain('p_new_row');
    expect(params).not.toContain('p_balance_ops');
    expect(completionBody).toContain("v_ops jsonb := '[]'::jsonb;");
    expect(completionBody).toMatch(
      /v_ops := v_ops \|\| pg_catalog\.jsonb_build_array\([\s\S]*?pg_catalog\.jsonb_build_object\(/
    );
    expect(completionBody).toContain(
      'v_new_row := pg_catalog.jsonb_build_object('
    );
    expect(completionBody).toMatch(
      /v_result := public\.create_islem_atomik\(\s*p_isletme_id,\s*v_new_row,\s*v_ops\s*\);/
    );
  });

  it('tutarı ve kuru kanonik numeric tiplere çevirip NaN/Infinityyi reddeder', () => {
    expect(completionBody).toContain(
      'v_amount := v_scheduled.amount::numeric(15,2);'
    );
    expect(completionBody).toContain(
      'v_rate := p_exchange_rate::numeric(18,8);'
    );
    expect(completionBody).toMatch(
      /v_scheduled\.amount = 'NaN'::numeric[\s\S]*?v_scheduled\.amount = 'Infinity'::numeric[\s\S]*?v_scheduled\.amount = '-Infinity'::numeric/
    );
    expect(completionBody).toMatch(
      /p_exchange_rate = 'NaN'::numeric[\s\S]*?p_exchange_rate = 'Infinity'::numeric[\s\S]*?p_exchange_rate = '-Infinity'::numeric/
    );
    expect(completionBody).toContain(
      'v_converted := pg_catalog.round(v_amount / v_rate, 2);'
    );
    expect(completionBody).toContain(
      'v_converted := pg_catalog.round(v_amount * v_rate, 2);'
    );
  });

  it('kur retryını finansal snapshot tokenı ile TOCTOU değişikliğine karşı korur', () => {
    const tokenStart = completionBody.indexOf(
      'v_completion_token := pg_catalog.md5('
    );
    const changedGuard = completionBody.indexOf(
      'p_expected_token IS DISTINCT FROM v_completion_token',
      tokenStart
    );
    const rateRequired = completionBody.indexOf(
      "RAISE EXCEPTION 'CROSS_CURRENCY_RATE_REQUIRED:%->%:%:%'",
      changedGuard
    );
    const tokenBlock = completionBody.slice(tokenStart, changedGuard);
    const tokenFields = [
      "'type', v_scheduled.type",
      "'amount', v_amount",
      "'description', v_scheduled.description",
      "'scheduled_date', v_scheduled.scheduled_date",
      "'hesap_id', v_scheduled.hesap_id",
      "'hedef_hesap_id', v_scheduled.hedef_hesap_id",
      "'kategori_id', v_scheduled.kategori_id",
      "'cari_id', v_scheduled.cari_id",
      "'personel_id', v_scheduled.personel_id",
      "'source_currency', v_source_currency",
      "'target_currency', v_target_currency",
    ];

    tokenFields.forEach((field) => {
      expect(tokenBlock).toContain(field);
    });
    expect(changedGuard).toBeGreaterThan(tokenStart);
    expect(completionBody.slice(changedGuard, rateRequired)).toContain(
      "RAISE EXCEPTION 'SCHEDULED_COMPLETION_CHANGED'"
    );
    expect(completionBody.slice(rateRequired, rateRequired + 300)).toContain(
      'v_completion_token'
    );
  });

  it('istemcinin yerel tamamlanma tarih+saatini kullanır ve güvenli İstanbul fallbacki sağlar', () => {
    expect(completionBody).toMatch(
      /v_completion_at := COALESCE\(\s*p_completion_at,\s*pg_catalog\.clock_timestamp\(\) AT TIME ZONE 'Europe\/Istanbul'\s*\);/
    );
    expect(completionBody).toContain("'date', v_completion_at");
  });

  it('işletme, işlem-create, modül ve entity kapsamlarını serverda fail-closed doğrular', () => {
    expect(completionBody).toContain(
      'public.user_has_isletme_access(p_isletme_id)'
    );
    expect(completionBody).toMatch(
      /v_permissions->'modules'->>'ileri_tarihli'/
    );
    expect(completionBody).toContain(
      "public.user_can_islem_action(p_isletme_id, 'create', NULL)"
    );
    expect(completionBody).toMatch(
      /v_permissions->'modules'->>v_module/
    );
    expect(completionBody).toMatch(
      /ARRAY\['cariler'\]/
    );
    expect(completionBody).toMatch(
      /ARRAY\['personel'\]/
    );
    expect(completionBody).toMatch(
      /FROM public\.hesaplar h[\s\S]*?h\.isletme_id = p_isletme_id[\s\S]*?FOR KEY SHARE/
    );
    expect(completionBody).toMatch(
      /FROM public\.personel p[\s\S]*?p\.isletme_id = p_isletme_id[\s\S]*?FOR KEY SHARE/
    );
    expect(completionBody).toMatch(
      /FROM public\.kategoriler k[\s\S]*?k\.isletme_id = p_isletme_id/
    );
    expect(completionBody).toContain(
      "RAISE EXCEPTION 'SCHEDULED_ENTITY_SCOPE_MISMATCH'"
    );
    expect(completionBody).toMatch(
      /v_cari_isletme_id IS DISTINCT FROM p_isletme_id[\s\S]*?SCHEDULED_LINKED_CARI_UNSUPPORTED/
    );
  });

  it('işletme sahipliği ve üyelik yetkisi SELECTlerini transaction boyunca FOR SHARE kilitler', () => {
    expect(completionBody).toMatch(
      /SELECT b\.user_id = auth\.uid\(\)[\s\S]*?FROM public\.isletmeler b[\s\S]*?WHERE b\.id = p_isletme_id\s+FOR SHARE;/
    );
    expect(completionBody).toMatch(
      /SELECT iu\.permissions[\s\S]*?FROM public\.isletme_users iu[\s\S]*?iu\.status = 'active'\s+FOR SHARE;/
    );
  });

  it('level, görünürlük, işlem-create ve kaynak modül create kapılarını birlikte uygular', () => {
    expect(completionBody).toMatch(
      /v_level NOT IN \('view', 'add', 'edit_own', 'edit_all'\)/
    );
    expect(completionBody).toMatch(
      /v_permissions->'visibility'->>'can_see_all_users_data'/
    );
    expect(completionBody).toMatch(
      /v_can_see_all[\s\S]*?v_scheduled\.created_by = auth\.uid\(\)/
    );
    expect(completionBody).toMatch(
      /v_can_create_islemler :=[\s\S]*?v_permissions->'modules'->>'islemler'[\s\S]*?v_level IN \('add', 'edit_own', 'edit_all'\)[\s\S]*?v_permissions->'actions'->'islemler'->>'can_create'/
    );
    expect(completionBody).toMatch(
      /v_required_modules := CASE[\s\S]*?ARRAY\['hesaplar'\][\s\S]*?ARRAY\['cariler'\][\s\S]*?ARRAY\['personel'\][\s\S]*?ARRAY\['personel', 'hesaplar'\]/
    );
    expect(completionBody).toMatch(
      /FOREACH v_module IN ARRAY v_required_modules[\s\S]*?v_permissions->'modules'->>v_module[\s\S]*?v_permissions->'actions'->v_module->>'can_create'/
    );
  });

  it('nullable yetki sonuçlarını ve created_by üç-değerli mantığını IS NOT TRUE ile fail-closed tutar', () => {
    const permissionEnd = completionBody.indexOf(
      'SELECT i.*',
      completionBody.indexOf(
        "public.user_can_islem_action(p_isletme_id, 'create', NULL)"
      )
    );
    const permissionBlock = completionBody.slice(0, permissionEnd);

    expect(permissionBlock).toMatch(
      /IF auth\.uid\(\) IS NULL\s+OR public\.user_has_isletme_access\(p_isletme_id\) IS NOT TRUE THEN/
    );
    expect(permissionBlock).toContain(
      'IF v_is_owner IS NOT TRUE THEN'
    );
    expect(permissionBlock).toMatch(
      /IF v_can_update_scheduled IS NOT TRUE\s+OR \(\s*v_can_see_all\s+OR v_scheduled\.created_by = auth\.uid\(\)\s*\) IS NOT TRUE THEN/
    );
    expect(permissionBlock).toContain(
      'IF v_can_create_islemler IS NOT TRUE THEN'
    );
    expect(permissionBlock).toContain(
      'IF v_module_can_create IS NOT TRUE THEN'
    );
    expect(permissionBlock).toMatch(
      /IF public\.user_can_islem_action\(p_isletme_id, 'create', NULL\) IS NOT TRUE THEN/
    );

    expect(permissionBlock).not.toMatch(
      /IF NOT (?:public\.user_has_isletme_access|v_is_owner|v_can_update_scheduled|v_can_create_islemler|v_module_can_create|public\.user_can_islem_action)/
    );
  });

  it('created_by NULL iken edit_own/edit_all ve visibility=false kombinasyonunun görünürlük kontrolünü baypas etmesine izin vermez', () => {
    const updateAssignmentStart = completionBody.indexOf(
      'v_can_update_scheduled :='
    );
    const updateGuardEnd = completionBody.indexOf(
      "RAISE EXCEPTION 'Bu işlemi tamamlamaya yetkiniz yok'",
      updateAssignmentStart
    );
    const updatePermissionBlock = completionBody.slice(
      updateAssignmentStart,
      updateGuardEnd
    );

    expect(updatePermissionBlock).toMatch(
      /v_level = 'edit_all'\s+OR \(\s*v_level = 'edit_own'\s+AND v_scheduled\.created_by = auth\.uid\(\)\s*\)/
    );
    expect(updatePermissionBlock).toMatch(
      /v_can_see_all\s+OR v_scheduled\.created_by = auth\.uid\(\)\s*\) IS NOT TRUE THEN/
    );
    expect(completionBody).toMatch(
      /v_can_see_all := COALESCE\([\s\S]*?can_see_all_users_data[\s\S]*?false\s*\);/
    );
  });

  it('tip-shape sözleşmesini ve transferde aynı hesap kullanım yasağını korur', () => {
    expect(completionBody).toContain(
      "RAISE EXCEPTION 'SCHEDULED_ENTITY_SHAPE_INVALID'"
    );
    expect(completionBody).toMatch(
      /WHEN v_scheduled\.type = 'transfer'[\s\S]*?v_scheduled\.hesap_id = v_scheduled\.hedef_hesap_id[\s\S]*?SCHEDULED_ENTITY_SHAPE_INVALID/
    );
    expect(completionBody).toMatch(
      /WHEN v_scheduled\.type IN \('cari_odeme', 'cari_tahsilat'\)[\s\S]*?v_scheduled\.hedef_hesap_id IS NOT NULL[\s\S]*?v_scheduled\.personel_id IS NOT NULL[\s\S]*?SCHEDULED_ENTITY_SHAPE_INVALID/
    );
    expect(completionBody).toMatch(
      /WHEN v_scheduled\.type IN \('personel_odeme', 'personel_tahsilat'\)[\s\S]*?v_scheduled\.hedef_hesap_id IS NOT NULL[\s\S]*?v_scheduled\.cari_id IS NOT NULL[\s\S]*?SCHEDULED_ENTITY_SHAPE_INVALID/
    );
  });

  it('deterministik id/source üretir ve create sonucunu exact olarak doğrular', () => {
    expect(completionBody).toMatch(
      /v_new_row := pg_catalog\.jsonb_build_object\(\s*'id', p_ileri_id,\s*'isletme_id', p_isletme_id,/
    );
    expect(completionBody).toContain("'source_ileri_id', p_ileri_id");
    expect(completionBody).toMatch(
      /IF NOT v_has_existing THEN\s+BEGIN[\s\S]*?v_result := public\.create_islem_atomik\(\s*p_isletme_id,\s*v_new_row,\s*v_ops\s*\);[\s\S]*?END;\s+END IF;/
    );
    expect(completionBody).toMatch(
      /SELECT i\.\*\s+INTO v_existing\s+FROM public\.islemler i\s+WHERE i\.id = p_ileri_id\s+AND i\.isletme_id = p_isletme_id\s+AND i\.source_ileri_id = p_ileri_id\s+FOR SHARE;\s+IF NOT FOUND/
    );
    expect(completionBody).toContain(
      'v_result := pg_catalog.to_jsonb(v_existing);'
    );
    expect(completionBody).not.toMatch(
      /NULLIF\(v_result->>'(?:id|isletme_id|source_ileri_id)'/
    );
  });

  it('entityleri önce KEY SHARE ile okur, create sonrası NO KEY UPDATE postcondition ile dondurur', () => {
    const createCall = completionBody.indexOf(
      'v_result := public.create_islem_atomik'
    );
    const finalStatusUpdate = completionBody.indexOf(
      'UPDATE public.ileri_tarihli_islemler',
      createCall
    );
    const preCreate = completionBody.slice(0, createCall);
    const postCreate = completionBody.slice(createCall, finalStatusUpdate);

    expect(preCreate.match(/FOR KEY SHARE;/g)).toHaveLength(4);
    expect(postCreate.match(/FOR NO KEY UPDATE;/g)).toHaveLength(5);
    expect(postCreate).toMatch(
      /FROM public\.hesaplar h[\s\S]*?= v_hesap_currency[\s\S]*?FOR NO KEY UPDATE/
    );
    expect(postCreate).toMatch(
      /FROM public\.cariler c[\s\S]*?= v_cari_currency[\s\S]*?FOR NO KEY UPDATE/
    );
    expect(postCreate).toMatch(
      /FROM public\.personel p[\s\S]*?= v_personel_currency[\s\S]*?FOR NO KEY UPDATE/
    );
    expect(postCreate).toMatch(
      /FROM public\.kategoriler k[\s\S]*?FOR NO KEY UPDATE/
    );
    expect(postCreate).toContain(
      "RAISE EXCEPTION 'SCHEDULED_COMPLETION_CHANGED'"
    );
  });

  it('create RPC ve completed status yazımını aynı fonksiyonda, doğru sırada yapar', () => {
    const createCall = completionBody.indexOf(
      'v_result := public.create_islem_atomik'
    );
    const statusUpdate = completionBody.indexOf(
      'UPDATE public.ileri_tarihli_islemler',
      createCall
    );
    const statusConflict = completionBody.indexOf(
      "RAISE EXCEPTION 'SCHEDULED_STATUS_CONFLICT'",
      statusUpdate
    );

    expect(createCall).toBeGreaterThan(-1);
    expect(statusUpdate).toBeGreaterThan(createCall);
    expect(completionBody.slice(statusUpdate, statusConflict)).toMatch(
      /status IN \('pending', 'notified'\)/
    );
    expect(completionBody.slice(statusUpdate, statusConflict)).toContain(
      'GET DIAGNOSTICS v_rowcount = ROW_COUNT;'
    );
    expect(completionBody.slice(statusUpdate, statusConflict)).toContain(
      'IF v_rowcount <> 1 THEN'
    );
    expect(completionBody).not.toMatch(/\b(COMMIT|ROLLBACK)\b/);
  });
});

describe('scheduled completion — trigger, ACL ve additive güvenlik', () => {
  it('completed+source kaydını eski clientın geri açmasına trigger ile izin vermez', () => {
    expect(triggerBody).toMatch(
      /FROM public\.islemler i[\s\S]*?i\.source_ileri_id = OLD\.id/
    );
    expect(triggerBody).toContain(
      "NEW.status IS DISTINCT FROM 'completed'"
    );
    expect(triggerBody).not.toMatch(
      /NEW\.(id|isletme_id|type|amount|description|scheduled_date|hesap_id|hedef_hesap_id|kategori_id|cari_id|personel_id|created_by)\s+IS DISTINCT FROM/
    );
    expect(triggerBody).toContain(
      "RAISE EXCEPTION 'SCHEDULED_ALREADY_COMPLETED'"
    );
    const triggerCreate = migrationSql.slice(
      migrationSql.indexOf(
        'CREATE TRIGGER guard_completed_ileri_tarihli_status'
      )
    );
    expect(triggerCreate).toMatch(
      /CREATE TRIGGER guard_completed_ileri_tarihli_status\s+BEFORE UPDATE OF status\s+ON public\.ileri_tarihli_islemler\s+FOR EACH ROW\s+EXECUTE FUNCTION public\.guard_completed_ileri_tarihli_status\(\);/
    );
    expect(triggerCreate).not.toMatch(
      /BEFORE UPDATE OF\s+status\s*,/
    );
  });

  it('iki SECURITY DEFINER fonksiyonda boş search_path ve dar ACL kullanır', () => {
    expect(triggerBody).toMatch(
      /SECURITY DEFINER\s+SET search_path TO ''/
    );
    expect(migrationSql).toMatch(
      /REVOKE ALL\s+ON FUNCTION public\.complete_ileri_tarihli_islem_atomik\(uuid, uuid, numeric, text, timestamp without time zone\)\s+FROM PUBLIC;/
    );
    expect(migrationSql).toMatch(
      /REVOKE EXECUTE\s+ON FUNCTION public\.complete_ileri_tarihli_islem_atomik\(uuid, uuid, numeric, text, timestamp without time zone\)\s+FROM anon;/
    );
    expect(migrationSql).toMatch(
      /GRANT EXECUTE\s+ON FUNCTION public\.complete_ileri_tarihli_islem_atomik\(uuid, uuid, numeric, text, timestamp without time zone\)\s+TO authenticated;/
    );
    expect(migrationSql).toMatch(
      /REVOKE ALL\s+ON FUNCTION public\.guard_completed_ileri_tarihli_status\(\)\s+FROM PUBLIC, anon, authenticated;/
    );
  });

  it('nested create_islem_atomik motorunun search_path sırasını güvenli şemalara sabitler', () => {
    expect(migrationSql).toMatch(
      /ALTER FUNCTION public\.create_islem_atomik\(uuid, jsonb, jsonb\)\s+SET search_path TO 'pg_catalog', 'public', 'pg_temp';/
    );
  });

  it('veri silme veya tablo/kolon değiştirme yapmaz; status triggerını additive oluşturur', () => {
    expect(migrationSql).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(migrationSql).not.toMatch(/\bALTER\s+TABLE\b/i);
    expect(migrationSql).not.toMatch(/\bDROP\s+TABLE\b/i);
    expect(migrationSql).not.toMatch(/\bDROP\s+COLUMN\b/i);
    expect(migrationSql).not.toMatch(/\bALTER\s+COLUMN\b/i);
    expect(migrationSql).not.toMatch(/\bDROP\s+TRIGGER\b/i);
    expect(migrationSql).toContain(
      'CREATE TRIGGER guard_completed_ileri_tarihli_status'
    );
  });

  it('source_ileri_id partial unique indexi mevcut sözleşmede korur', () => {
    const idempotencyPath = path.join(
      MIGRATIONS_DIR,
      '20260529000000_scheduled_transaction_idempotency.sql'
    );
    const idempotencySql = stripLineComments(
      fs.readFileSync(idempotencyPath, 'utf8')
    );

    expect(idempotencySql).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS islemler_source_ileri_id_key\s+ON islemler \(source_ileri_id\)\s+WHERE source_ileri_id IS NOT NULL;/
    );
  });
});
