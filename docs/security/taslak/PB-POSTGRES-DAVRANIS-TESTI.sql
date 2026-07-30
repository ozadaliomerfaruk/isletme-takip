-- ============================================================================
-- P-B GERÇEK POSTGRESQL DAVRANIŞ TESTİ — YALNIZ İZOLE TEST/STAGING
-- ============================================================================
-- ÜRETİMDE ÇALIŞTIRMA. Bu dosya geçici UPDATE yapar; transaction sonunda
-- ROLLBACK eder. Ön koşul: P-B migration uygulanmış ayrı bir test veritabanı ve
-- test için ayrılmış AKTİF, owner olmayan bir isletme_users kaydı.
--
-- psql:
--   psql "$TEST_DATABASE_URL" \
--     -v pb_isletme_id='00000000-0000-0000-0000-000000000000' \
--     -v pb_user_id='00000000-0000-0000-0000-000000000000' \
--     -f docs/security/taslak/PB-POSTGRES-DAVRANIS-TESTI.sql
--
-- Kabul: sonda "PB_POSTGRES_BEHAVIOR_OK" tek satırı; hata yok.
-- ============================================================================

\set ON_ERROR_STOP on

\if :{?pb_isletme_id}
\else
  \echo 'pb_isletme_id zorunlu'
  \quit 3
\endif

\if :{?pb_user_id}
\else
  \echo 'pb_user_id zorunlu'
  \quit 3
\endif

BEGIN;

SELECT set_config('pb.isletme_id', :'pb_isletme_id', true);
SELECT set_config('request.jwt.claim.sub', :'pb_user_id', true);
SELECT set_config(
  'request.jwt.claims',
  jsonb_build_object('sub', :'pb_user_id'::text)::text,
  true
);

DO $test$
DECLARE
  v_isletme uuid := current_setting('pb.isletme_id')::uuid;
  v_uid uuid := auth.uid();
  v_bad jsonb;
  v_result record;
  v_count integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'TEST KURULUMU: auth.uid() NULL';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.isletme_users iu
    WHERE iu.isletme_id = v_isletme
      AND iu.user_id = v_uid
      AND iu.status = 'active'
  ) THEN
    RAISE EXCEPTION 'TEST KURULUMU: aktif test üyeliği bulunamadı';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.isletmeler i
    WHERE i.id = v_isletme AND i.user_id = v_uid
  ) THEN
    RAISE EXCEPTION 'TEST KURULUMU: test kullanıcısı owner olmamalı';
  END IF;

  -- PostgreSQL text->boolean parserının kabul ettiği/adversarial JSON değerleri
  -- resolverda asla true olmamalı ve hiçbir değer cast exception'ı üretmemeli.
  FOR v_bad IN
    SELECT value
    FROM jsonb_array_elements(
      '[null,"true","yes","on","1",1,{},[]]'::jsonb
    )
  LOOP
    UPDATE public.isletme_users
    SET permissions = jsonb_build_object(
      'modules', jsonb_build_object('cariler', v_bad),
      'actions', jsonb_build_object(
        'cariler', jsonb_build_object(
          'can_create', v_bad,
          'can_update_own', v_bad,
          'can_update_all', v_bad,
          'can_delete_own', v_bad,
          'can_delete_all', v_bad
        )
      ),
      'visibility', jsonb_build_object('can_see_all_users_data', v_bad)
    )
    WHERE isletme_id = v_isletme AND user_id = v_uid;

    SELECT * INTO v_result
    FROM internal.etkin_yetki(v_isletme, 'cariler');

    IF v_result.can_view
       OR v_result.can_create
       OR v_result.can_update_own
       OR v_result.can_update_all
       OR v_result.can_delete_own
       OR v_result.can_delete_all
       OR v_result.can_see_all_users_data THEN
      RAISE EXCEPTION 'exact-jsonb ihlali; bozuk değer yetki verdi: %', v_bad;
    END IF;
  END LOOP;

  -- Gerçek JSON boolean true pozitif kontrolü.
  UPDATE public.isletme_users
  SET permissions = '{
    "level":"edit_all",
    "modules":{"cariler":true},
    "visibility":{"can_see_all_users_data":true}
  }'::jsonb
  WHERE isletme_id = v_isletme AND user_id = v_uid;

  SELECT * INTO v_result
  FROM internal.etkin_yetki(v_isletme, 'cariler');
  IF NOT (
    v_result.can_view
    AND v_result.can_create
    AND v_result.can_update_own
    AND v_result.can_update_all
    AND v_result.can_delete_own
    AND v_result.can_delete_all
    AND v_result.can_see_all_users_data
  ) THEN
    RAISE EXCEPTION 'pozitif exact-true kontrolü başarısız';
  END IF;

  -- Derived görünürlük raw modül flag'i olmadan yazma üretmez.
  SELECT * INTO v_result
  FROM internal.etkin_yetki(v_isletme, 'islemler');
  IF NOT v_result.can_view
     OR v_result.can_create
     OR v_result.can_update_own
     OR v_result.can_delete_own THEN
    RAISE EXCEPTION 'derived görünürlük/raw action kapısı başarısız';
  END IF;

  -- Birikim = hesaplar AND birikim.
  UPDATE public.isletme_users
  SET permissions = '{"level":"view","modules":{"birikim":true}}'::jsonb
  WHERE isletme_id = v_isletme AND user_id = v_uid;
  SELECT * INTO v_result
  FROM internal.etkin_yetki(v_isletme, 'birikim');
  IF v_result.can_view THEN
    RAISE EXCEPTION 'birikim Hesaplar kapalıyken görünür oldu';
  END IF;

  -- Legacy modules=null: dashboard/notlar görünür; birikim Hesaplar yüzünden kapalı.
  UPDATE public.isletme_users
  SET permissions = '{"modules":null,"actions":null}'::jsonb
  WHERE isletme_id = v_isletme AND user_id = v_uid;
  SELECT * INTO v_result FROM internal.etkin_yetki(v_isletme, 'notlar');
  IF NOT v_result.can_view OR v_result.can_create THEN
    RAISE EXCEPTION 'legacy modules=null notlar fallback başarısız';
  END IF;
  SELECT * INTO v_result FROM internal.etkin_yetki(v_isletme, 'birikim');
  IF v_result.can_view THEN
    RAISE EXCEPTION 'legacy modules=null birikim AND kapısı başarısız';
  END IF;

  -- Bilinmeyen level altı modül yeteneğini kapatır; global exact visibility kalır.
  UPDATE public.isletme_users
  SET permissions = '{
    "level":"gelecek-seviye",
    "modules":{"cariler":true},
    "visibility":{"can_see_all_users_data":true}
  }'::jsonb
  WHERE isletme_id = v_isletme AND user_id = v_uid;
  SELECT * INTO v_result FROM internal.etkin_yetki(v_isletme, 'cariler');
  IF v_result.can_view
     OR v_result.can_create
     OR v_result.can_update_own
     OR v_result.can_update_all
     OR v_result.can_delete_own
     OR v_result.can_delete_all
     OR NOT v_result.can_see_all_users_data THEN
    RAISE EXCEPTION 'unknown-level/global-visibility sözleşmesi başarısız';
  END IF;

  -- Direct helper: same-currency early return NaN/Infinity guardlarını aşamaz.
  BEGIN
    PERFORM internal.cevrilen_tutar('NaN'::numeric, NULL, 'TRY', 'TRY');
    RAISE EXCEPTION 'NaN tutar aynı para biriminde kabul edildi';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    NULL;
  END;

  BEGIN
    PERFORM internal.cevrilen_tutar(
      1::numeric,
      'NaN'::numeric,
      'TRY',
      'TRY'
    );
    RAISE EXCEPTION 'NaN kur aynı para biriminde kabul edildi';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    NULL;
  END;

  -- Resultant ACL yalnız mevcut dört fonksiyon için sınanır. PostgreSQL global
  -- PUBLIC defaultu nedeniyle gelecekteki fonksiyonların otomatik kapalı doğduğu
  -- varsayılmaz; onları ekleyen migration ayrıca final ACL sweep yapmalıdır.
  SELECT count(*) INTO v_count
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'internal'
    AND p.proname IN (
      'etkin_yetki',
      'islem_tipi_modulu',
      'cevrilen_tutar',
      'bakiye_ops'
    );
  IF v_count <> 4 THEN
    RAISE EXCEPTION 'internal fonksiyon sayısı beklenen 4, bulunan %', v_count;
  END IF;

  -- Resolverda authenticated EXECUTE tam bir kez bulunmalı.
  SELECT count(*) INTO v_count
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  CROSS JOIN LATERAL aclexplode(
    COALESCE(p.proacl, acldefault('f', p.proowner))
  ) acl
  WHERE n.nspname = 'internal'
    AND p.proname = 'etkin_yetki'
    AND acl.grantee = 'authenticated'::regrole::oid
    AND acl.privilege_type = 'EXECUTE';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'resolver authenticated ACL beklenen 1, bulunan %', v_count;
  END IF;

  -- Dört fonksiyonun hiçbirinde PUBLIC/anon/service_role; helperlarda ayrıca
  -- authenticated EXECUTE bulunmamalı.
  SELECT count(*) INTO v_count
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  CROSS JOIN LATERAL aclexplode(
    COALESCE(p.proacl, acldefault('f', p.proowner))
  ) acl
  WHERE n.nspname = 'internal'
    AND p.proname IN (
      'etkin_yetki',
      'islem_tipi_modulu',
      'cevrilen_tutar',
      'bakiye_ops'
    )
    AND acl.grantee IN (
      0::oid,
      'anon'::regrole::oid,
      'authenticated'::regrole::oid,
      'service_role'::regrole::oid
    )
    AND acl.privilege_type = 'EXECUTE'
    AND NOT (
      p.proname = 'etkin_yetki'
      AND acl.grantee = 'authenticated'::regrole::oid
    );
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'mevcut dört fonksiyonda beklenmeyen API-role EXECUTE: %', v_count;
  END IF;
END;
$test$;

SELECT 'PB_POSTGRES_BEHAVIOR_OK' AS result;

ROLLBACK;
