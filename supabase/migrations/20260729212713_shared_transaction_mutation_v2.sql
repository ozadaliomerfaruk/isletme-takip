-- =============================================================================
-- P0-S2B - SHARED CARI/PERSONEL MUTATION CONTEXT + UPDATE/DELETE V2
-- =============================================================================
-- ADDITIVE / VERI KORUYUCU SINIR
--   * Yalniz bir internal guard ve uc yeni public RPC eklenir.
--   * Tablo/kolon/politika/trigger degisikligi, migration-time DML ve backfill YOK.
--   * Mevcut update_islem_atomik/delete_islem_atomik imzalari ve davranisi DEGİSMEZ.
--
-- 1.5.x / ESKI CLIENT ETKISI
--   * SIFIR: eski istemci bu yeni RPC adlarini bilmez ve V1 yollarini aynen kullanir.
--   * Yeni istemci yalniz desteklenen shared Cari/Personel satirlarinda opt-in olur.
--
-- ILK DILIMDE BILINCLI KAPSAM DISI
--   * linked/foreign cari, ileri-tarihli kaynaktan tamamlanan satir, urun hareketli
--     satir ve taksit planli satir fail-closed kalir.
--   * UPDATE mevcut photo_path pointerini DB icinde aynen korur; pointer disariya
--     donmez ve patch allowlist'inde yoktur.
--   * DELETE photo_path doluysa Storage yasam dongusu ayri kapanana kadar reddedilir.
--   * type ve cari/personel/hesap entity baglari ilk dilimde immutable'dir.
--
-- K13 / PERSONEL KAYNAK KURALI
--   * cari_odeme/cari_tahsilat internal.islem_tipi_modulu ile yalniz Cariler ister;
--     hesap referansi aktif+arsivsiz ve bakiye-gizlidir. Birikim hesabi ayrica
--     Birikim gorunurlugu ister.
--   * personel_odeme/personel_tahsilat Personel + Hesaplar ister.
-- =============================================================================

CREATE FUNCTION internal.get_islem_mutation_row_v1(
  p_isletme_id uuid,
  p_islem_id uuid,
  p_action text,
  p_lock boolean
)
RETURNS public.islemler
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.islemler;
  v_modules text[];
  v_module text;
  v_can_view boolean;
  v_can_update_own boolean;
  v_can_update_all boolean;
  v_can_delete_own boolean;
  v_can_delete_all boolean;
  v_account_type text;
  v_can_view_birikim boolean;
BEGIN
  IF p_action NOT IN ('update', 'delete')
     OR p_isletme_id IS NULL
     OR p_islem_id IS NULL THEN
    RAISE EXCEPTION 'ISLEM_MUTATION_V2_INVALID_INPUT'
      USING ERRCODE = '22023';
  END IF;

  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'ISLEM_MUTATION_V2_NOT_AUTHORIZED'
      USING ERRCODE = '42501';
  END IF;

  SELECT
    permission.can_view,
    permission.can_update_own,
    permission.can_update_all,
    permission.can_delete_own,
    permission.can_delete_all
  INTO
    v_can_view,
    v_can_update_own,
    v_can_update_all,
    v_can_delete_own,
    v_can_delete_all
  FROM internal.etkin_yetki(p_isletme_id, 'islemler') AS permission;

  IF v_can_view IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'ISLEM_MUTATION_V2_NOT_AUTHORIZED'
      USING ERRCODE = '42501';
  END IF;

  IF p_lock THEN
    SELECT transaction_row.*
    INTO v_row
    FROM public.islemler AS transaction_row
    WHERE transaction_row.id = p_islem_id
      AND transaction_row.isletme_id = p_isletme_id
    FOR UPDATE;
  ELSE
    SELECT transaction_row.*
    INTO v_row
    FROM public.islemler AS transaction_row
    WHERE transaction_row.id = p_islem_id
      AND transaction_row.isletme_id = p_isletme_id;
  END IF;

  IF NOT FOUND THEN
    -- Yok ve cross-tenant ayni generic hata: satir varligi sizmaz.
    RAISE EXCEPTION 'ISLEM_MUTATION_V2_NOT_AUTHORIZED'
      USING ERRCODE = '42501';
  END IF;

  IF p_action = 'update' THEN
    IF NOT (
      v_can_update_all IS TRUE
      OR (
        v_can_update_own IS TRUE
        AND v_row.created_by IS NOT NULL
        AND v_row.created_by = v_uid
      )
    ) THEN
      RAISE EXCEPTION 'ISLEM_MUTATION_V2_NOT_AUTHORIZED'
        USING ERRCODE = '42501';
    END IF;
  ELSE
    IF NOT (
      v_can_delete_all IS TRUE
      OR (
        v_can_delete_own IS TRUE
        AND v_row.created_by IS NOT NULL
        AND v_row.created_by = v_uid
      )
    ) THEN
      RAISE EXCEPTION 'ISLEM_MUTATION_V2_NOT_AUTHORIZED'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF v_row.type::text NOT IN (
    'cari_alis',
    'cari_satis',
    'cari_alis_iade',
    'cari_satis_iade',
    'cari_odeme',
    'cari_tahsilat',
    'personel_gider',
    'personel_satis',
    'personel_odeme',
    'personel_tahsilat',
    'personel_izin_hakki',
    'personel_izin_kullanimi'
  ) THEN
    RAISE EXCEPTION 'ISLEM_MUTATION_V2_FEATURE_UNSUPPORTED'
      USING ERRCODE = '0A000';
  END IF;

  v_modules := internal.islem_tipi_modulu(v_row.type::text);
  IF v_modules IS NULL THEN
    RAISE EXCEPTION 'ISLEM_MUTATION_V2_INVALID_INPUT'
      USING ERRCODE = '22023';
  END IF;

  FOREACH v_module IN ARRAY v_modules
  LOOP
    SELECT permission.can_view
    INTO v_can_view
    FROM internal.etkin_yetki(p_isletme_id, v_module) AS permission;

    IF v_can_view IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'ISLEM_MUTATION_V2_NOT_AUTHORIZED'
        USING ERRCODE = '42501';
    END IF;
  END LOOP;

  -- Exact tip/entity sekli. Type ve entity baglari ilk dilimde immutable.
  IF (CASE v_row.type::text
    WHEN 'cari_alis' THEN
      v_row.cari_id IS NOT NULL AND v_row.hesap_id IS NULL
      AND v_row.hedef_hesap_id IS NULL AND v_row.personel_id IS NULL
    WHEN 'cari_satis' THEN
      v_row.cari_id IS NOT NULL AND v_row.hesap_id IS NULL
      AND v_row.hedef_hesap_id IS NULL AND v_row.personel_id IS NULL
    WHEN 'cari_alis_iade' THEN
      v_row.cari_id IS NOT NULL AND v_row.hesap_id IS NULL
      AND v_row.hedef_hesap_id IS NULL AND v_row.personel_id IS NULL
    WHEN 'cari_satis_iade' THEN
      v_row.cari_id IS NOT NULL AND v_row.hesap_id IS NULL
      AND v_row.hedef_hesap_id IS NULL AND v_row.personel_id IS NULL
    WHEN 'cari_odeme' THEN
      v_row.cari_id IS NOT NULL AND v_row.hesap_id IS NOT NULL
      AND v_row.hedef_hesap_id IS NULL AND v_row.personel_id IS NULL
    WHEN 'cari_tahsilat' THEN
      v_row.cari_id IS NOT NULL AND v_row.hesap_id IS NOT NULL
      AND v_row.hedef_hesap_id IS NULL AND v_row.personel_id IS NULL
    WHEN 'personel_gider' THEN
      v_row.personel_id IS NOT NULL AND v_row.hesap_id IS NULL
      AND v_row.hedef_hesap_id IS NULL AND v_row.cari_id IS NULL
    WHEN 'personel_satis' THEN
      v_row.personel_id IS NOT NULL AND v_row.hesap_id IS NULL
      AND v_row.hedef_hesap_id IS NULL AND v_row.cari_id IS NULL
    WHEN 'personel_izin_hakki' THEN
      v_row.personel_id IS NOT NULL AND v_row.hesap_id IS NULL
      AND v_row.hedef_hesap_id IS NULL AND v_row.cari_id IS NULL
    WHEN 'personel_izin_kullanimi' THEN
      v_row.personel_id IS NOT NULL AND v_row.hesap_id IS NULL
      AND v_row.hedef_hesap_id IS NULL AND v_row.cari_id IS NULL
    WHEN 'personel_odeme' THEN
      v_row.personel_id IS NOT NULL AND v_row.hesap_id IS NOT NULL
      AND v_row.hedef_hesap_id IS NULL AND v_row.cari_id IS NULL
    WHEN 'personel_tahsilat' THEN
      v_row.personel_id IS NOT NULL AND v_row.hesap_id IS NOT NULL
      AND v_row.hedef_hesap_id IS NULL AND v_row.cari_id IS NULL
    ELSE false
  END) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'ISLEM_MUTATION_V2_INVALID_INPUT'
      USING ERRCODE = '22023';
  END IF;

  IF v_row.source_ileri_id IS NOT NULL
     OR EXISTS (
       SELECT 1
       FROM public.urun_hareketler AS movement
       WHERE movement.islem_id = p_islem_id
         AND movement.isletme_id = p_isletme_id
     )
     OR EXISTS (
       SELECT 1
       FROM public.taksit_planlari AS installment_plan
       WHERE installment_plan.islem_id = p_islem_id
         AND installment_plan.isletme_id = p_isletme_id
     ) THEN
    RAISE EXCEPTION 'ISLEM_MUTATION_V2_FEATURE_UNSUPPORTED'
      USING ERRCODE = '0A000';
  END IF;

  IF p_action = 'delete' AND v_row.photo_path IS NOT NULL THEN
    RAISE EXCEPTION 'ISLEM_MUTATION_V2_FEATURE_UNSUPPORTED'
      USING ERRCODE = '0A000';
  END IF;

  -- Deterministik kilit sirasi create_islem_atomik_v2 ile ayni:
  -- cari -> personel -> hesap -> kategori.
  IF v_row.cari_id IS NOT NULL THEN
    PERFORM 1
    FROM public.cariler AS customer
    WHERE customer.id = v_row.cari_id
      AND customer.isletme_id = p_isletme_id
      AND customer.is_active IS TRUE
      AND customer.is_archived IS FALSE
    FOR NO KEY UPDATE;

    IF NOT FOUND THEN
      IF EXISTS (
        SELECT 1
        FROM public.cari_links AS link
        WHERE link.cari_id = v_row.cari_id
          AND link.viewer_isletme_id = p_isletme_id
      ) THEN
        RAISE EXCEPTION 'ISLEM_MUTATION_V2_LINKED_CARI_UNSUPPORTED'
          USING ERRCODE = '0A000';
      END IF;

      RAISE EXCEPTION 'ISLEM_MUTATION_V2_NOT_AUTHORIZED'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF v_row.personel_id IS NOT NULL THEN
    PERFORM 1
    FROM public.personel AS employee
    WHERE employee.id = v_row.personel_id
      AND employee.isletme_id = p_isletme_id
      AND employee.is_active IS TRUE
      AND employee.is_archived IS FALSE
    FOR NO KEY UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'ISLEM_MUTATION_V2_NOT_AUTHORIZED'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF v_row.hesap_id IS NOT NULL THEN
    SELECT account.type::text
    INTO v_account_type
    FROM public.hesaplar AS account
    WHERE account.id = v_row.hesap_id
      AND account.isletme_id = p_isletme_id
      AND account.is_active IS TRUE
      AND account.is_archived IS FALSE
    FOR NO KEY UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'ISLEM_MUTATION_V2_NOT_AUTHORIZED'
        USING ERRCODE = '42501';
    END IF;

    IF v_account_type = 'birikim' THEN
      SELECT permission.can_view
      INTO v_can_view_birikim
      FROM internal.etkin_yetki(p_isletme_id, 'birikim') AS permission;

      IF v_can_view_birikim IS DISTINCT FROM true THEN
        RAISE EXCEPTION 'ISLEM_MUTATION_V2_NOT_AUTHORIZED'
          USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;

  IF v_row.kategori_id IS NOT NULL THEN
    PERFORM 1
    FROM public.kategoriler AS category
    WHERE category.id = v_row.kategori_id
      AND category.isletme_id = p_isletme_id
    FOR SHARE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'ISLEM_MUTATION_V2_NOT_AUTHORIZED'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN v_row;
END;
$function$;

ALTER FUNCTION internal.get_islem_mutation_row_v1(uuid, uuid, text, boolean)
  OWNER TO postgres;

REVOKE ALL
ON FUNCTION internal.get_islem_mutation_row_v1(uuid, uuid, text, boolean)
FROM PUBLIC, anon, authenticated, service_role;


CREATE FUNCTION public.get_islem_mutation_context_v1(
  p_isletme_id uuid,
  p_islem_id uuid,
  p_action text DEFAULT 'update'
)
RETURNS TABLE (
  id uuid,
  type text,
  amount numeric,
  description text,
  date timestamp without time zone,
  hesap_id uuid,
  hedef_hesap_id uuid,
  kategori_id uuid,
  cari_id uuid,
  personel_id uuid,
  source_currency text,
  target_currency text,
  exchange_rate numeric,
  date_end text,
  vade_tarihi date,
  created_by uuid
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_row public.islemler;
BEGIN
  v_row := internal.get_islem_mutation_row_v1(
    p_isletme_id,
    p_islem_id,
    p_action,
    false
  );

  RETURN QUERY
  SELECT
    v_row.id,
    v_row.type::text,
    v_row.amount,
    v_row.description,
    v_row.date,
    v_row.hesap_id,
    v_row.hedef_hesap_id,
    v_row.kategori_id,
    v_row.cari_id,
    v_row.personel_id,
    v_row.source_currency::text,
    v_row.target_currency::text,
    v_row.exchange_rate,
    v_row.date_end,
    v_row.vade_tarihi,
    v_row.created_by;
END;
$function$;

ALTER FUNCTION public.get_islem_mutation_context_v1(uuid, uuid, text)
  OWNER TO postgres;

REVOKE ALL
ON FUNCTION public.get_islem_mutation_context_v1(uuid, uuid, text)
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE
ON FUNCTION public.get_islem_mutation_context_v1(uuid, uuid, text)
TO authenticated;


CREATE FUNCTION public.update_islem_atomik_v2(
  p_isletme_id uuid,
  p_islem_id uuid,
  p_patch jsonb
)
RETURNS TABLE (
  id uuid,
  type text,
  amount numeric,
  description text,
  date timestamp without time zone,
  hesap_id uuid,
  hedef_hesap_id uuid,
  kategori_id uuid,
  cari_id uuid,
  personel_id uuid,
  source_currency text,
  target_currency text,
  exchange_rate numeric,
  date_end text,
  vade_tarihi date,
  created_by uuid
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_old public.islemler;
  v_new public.islemler;
  v_updated public.islemler;
  v_amount_input numeric;
  v_rate_input numeric;
  v_category_id uuid;
  v_date_end_value date;
  v_expected_category_type text;
  v_source_currency text;
  v_target_currency text;
  v_old_canonical jsonb;
  v_new_canonical jsonb;
  v_balance_ops jsonb;
BEGIN
  v_old := internal.get_islem_mutation_row_v1(
    p_isletme_id,
    p_islem_id,
    'update',
    true
  );

  IF p_patch IS NULL
     OR pg_catalog.jsonb_typeof(p_patch) IS DISTINCT FROM 'object'
     OR p_patch = '{}'::jsonb
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.jsonb_object_keys(p_patch) AS patch_key(key_name)
       WHERE patch_key.key_name NOT IN (
         'amount',
         'description',
         'date',
         'kategori_id',
         'date_end',
         'vade_tarihi',
         'exchange_rate'
       )
     )
     OR (
       p_patch ? 'amount'
       AND pg_catalog.jsonb_typeof(p_patch->'amount') IS DISTINCT FROM 'number'
     )
     OR (
       p_patch ? 'description'
       AND pg_catalog.jsonb_typeof(p_patch->'description') NOT IN ('string', 'null')
     )
     OR (
       p_patch ? 'date'
       AND pg_catalog.jsonb_typeof(p_patch->'date') IS DISTINCT FROM 'string'
     )
     OR (
       p_patch ? 'kategori_id'
       AND pg_catalog.jsonb_typeof(p_patch->'kategori_id') NOT IN ('string', 'null')
     )
     OR (
       p_patch ? 'date_end'
       AND pg_catalog.jsonb_typeof(p_patch->'date_end') NOT IN ('string', 'null')
     )
     OR (
       p_patch ? 'vade_tarihi'
       AND pg_catalog.jsonb_typeof(p_patch->'vade_tarihi') NOT IN ('string', 'null')
     )
     OR (
       p_patch ? 'exchange_rate'
       AND pg_catalog.jsonb_typeof(p_patch->'exchange_rate') NOT IN ('number', 'null')
     )
     OR (
       p_patch ? 'date'
       AND p_patch->>'date' !~
         '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]{1,6})?([+-][0-9]{2}:[0-9]{2}|Z)?$'
     )
     OR (
       p_patch->>'date_end' IS NOT NULL
       AND p_patch->>'date_end' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
     )
     OR (
       p_patch->>'vade_tarihi' IS NOT NULL
       AND p_patch->>'vade_tarihi' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
     ) THEN
    RAISE EXCEPTION 'ISLEM_MUTATION_V2_INVALID_INPUT'
      USING ERRCODE = '22023';
  END IF;

  BEGIN
    v_amount_input := CASE
      WHEN p_patch ? 'amount' THEN (p_patch->>'amount')::numeric
      ELSE v_old.amount
    END;
    v_rate_input := CASE
      WHEN p_patch ? 'exchange_rate'
        AND pg_catalog.jsonb_typeof(p_patch->'exchange_rate') = 'number'
        THEN (p_patch->>'exchange_rate')::numeric
      WHEN p_patch ? 'exchange_rate' THEN NULL
      ELSE v_old.exchange_rate
    END;
    v_category_id := CASE
      WHEN p_patch ? 'kategori_id'
        AND pg_catalog.jsonb_typeof(p_patch->'kategori_id') = 'string'
        THEN (p_patch->>'kategori_id')::uuid
      WHEN p_patch ? 'kategori_id' THEN NULL
      ELSE v_old.kategori_id
    END;

    v_new := pg_catalog.jsonb_populate_record(v_old, p_patch);
  EXCEPTION
    WHEN invalid_text_representation
      OR invalid_datetime_format
      OR datetime_field_overflow
      OR numeric_value_out_of_range THEN
      RAISE EXCEPTION 'ISLEM_MUTATION_V2_INVALID_INPUT'
        USING ERRCODE = '22023';
  END;

  IF v_amount_input IS NULL
     OR v_amount_input = 'NaN'::numeric
     OR v_amount_input = 'Infinity'::numeric
     OR v_amount_input = '-Infinity'::numeric
     OR v_amount_input <= 0
     OR v_amount_input > 9999999999999.99
     OR v_amount_input IS DISTINCT FROM pg_catalog.round(v_amount_input, 2)
     OR (
       v_rate_input IS NOT NULL
       AND (
         v_rate_input = 'NaN'::numeric
         OR v_rate_input = 'Infinity'::numeric
         OR v_rate_input = '-Infinity'::numeric
         OR v_rate_input <= 0
         OR v_rate_input > 9999999999.99999999
         OR v_rate_input IS DISTINCT FROM pg_catalog.round(v_rate_input, 8)
       )
     ) THEN
    RAISE EXCEPTION 'ISLEM_MUTATION_V2_INVALID_INPUT'
      USING ERRCODE = '22023';
  END IF;

  v_new.amount := v_amount_input;
  v_new.exchange_rate := v_rate_input;
  v_new.kategori_id := v_category_id;

  IF p_patch ? 'description' THEN
    v_new.description := NULLIF(
      pg_catalog.btrim(v_new.description),
      ''
    );
  END IF;

  IF v_new.date_end IS NOT NULL
     AND v_new.date_end !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
    RAISE EXCEPTION 'ISLEM_MUTATION_V2_INVALID_INPUT'
      USING ERRCODE = '22023';
  END IF;

  BEGIN
    v_date_end_value := CASE
      WHEN v_new.date_end IS NULL THEN NULL
      ELSE v_new.date_end::date
    END;
  EXCEPTION
    WHEN invalid_datetime_format OR datetime_field_overflow THEN
      RAISE EXCEPTION 'ISLEM_MUTATION_V2_INVALID_INPUT'
        USING ERRCODE = '22023';
  END;

  IF (
       v_new.date_end IS NOT NULL
       AND v_new.type::text <> 'personel_izin_kullanimi'
     )
     OR (
       v_date_end_value IS NOT NULL
       AND v_date_end_value < v_new.date::date
     )
     OR (
       v_new.vade_tarihi IS NOT NULL
       AND v_new.type::text NOT IN ('cari_alis', 'cari_satis')
     ) THEN
    RAISE EXCEPTION 'ISLEM_MUTATION_V2_INVALID_INPUT'
      USING ERRCODE = '22023';
  END IF;

  v_expected_category_type := CASE
    WHEN v_new.type::text IN (
      'cari_tahsilat',
      'cari_satis',
      'cari_satis_iade',
      'personel_tahsilat',
      'personel_satis'
    ) THEN 'gelir'
    WHEN v_new.type::text IN (
      'cari_odeme',
      'cari_alis',
      'cari_alis_iade',
      'personel_odeme',
      'personel_gider'
    ) THEN 'gider'
    ELSE NULL
  END;

  IF p_patch ? 'kategori_id' AND v_new.kategori_id IS NOT NULL THEN
    IF v_expected_category_type IS NULL THEN
      RAISE EXCEPTION 'ISLEM_MUTATION_V2_INVALID_INPUT'
        USING ERRCODE = '22023';
    END IF;

    PERFORM 1
    FROM public.kategoriler AS category
    WHERE category.id = v_new.kategori_id
      AND category.isletme_id = p_isletme_id
      AND category.is_active IS TRUE
      AND category.type::text = v_expected_category_type
    FOR SHARE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'ISLEM_MUTATION_V2_NOT_AUTHORIZED'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  v_source_currency := COALESCE(
    NULLIF(
      pg_catalog.upper(pg_catalog.btrim(v_new.source_currency::text)),
      ''
    ),
    'TRY'
  );
  v_target_currency := COALESCE(
    NULLIF(
      pg_catalog.upper(pg_catalog.btrim(v_new.target_currency::text)),
      ''
    ),
    'TRY'
  );

  IF v_source_currency NOT IN ('TRY', 'USD', 'EUR', 'GBP', 'XAU', 'XAG')
     OR v_target_currency NOT IN ('TRY', 'USD', 'EUR', 'GBP', 'XAU', 'XAG')
     OR (
       v_source_currency = v_target_currency
       AND v_new.exchange_rate IS NOT NULL
     )
     OR (
       v_source_currency <> v_target_currency
       AND v_new.exchange_rate IS NULL
     ) THEN
    RAISE EXCEPTION 'ISLEM_MUTATION_V2_INVALID_INPUT'
      USING ERRCODE = '22023';
  END IF;

  -- photo_path, source_ileri_id, hedef_islem_id, type ve entity baglari p_patch
  -- allowlist'inde degildir; v_old uzerine merge ile pointer/baglar aynen korunur.
  v_old_canonical := pg_catalog.jsonb_build_object(
    'type', v_old.type::text,
    'amount', v_old.amount,
    'exchange_rate', v_old.exchange_rate,
    'source_currency', v_old.source_currency,
    'target_currency', v_old.target_currency,
    'hesap_id', v_old.hesap_id,
    'hedef_hesap_id', v_old.hedef_hesap_id,
    'cari_id', v_old.cari_id,
    'personel_id', v_old.personel_id
  );
  v_new_canonical := pg_catalog.jsonb_build_object(
    'type', v_new.type::text,
    'amount', v_new.amount,
    'exchange_rate', v_new.exchange_rate,
    'source_currency', v_new.source_currency,
    'target_currency', v_new.target_currency,
    'hesap_id', v_new.hesap_id,
    'hedef_hesap_id', v_new.hedef_hesap_id,
    'cari_id', v_new.cari_id,
    'personel_id', v_new.personel_id
  );

  SELECT COALESCE(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        't', aggregated.t,
        'id', aggregated.entity_id,
        'd', aggregated.d
      )
      ORDER BY aggregated.t, aggregated.entity_id
    ),
    '[]'::jsonb
  )
  INTO v_balance_ops
  FROM (
    SELECT
      operation.t,
      operation.entity_id,
      pg_catalog.sum(operation.d) AS d
    FROM (
      SELECT
        old_operation.t,
        old_operation.entity_id,
        -old_operation.d AS d
      FROM internal.bakiye_ops(v_old_canonical) AS old_operation
      UNION ALL
      SELECT
        new_operation.t,
        new_operation.entity_id,
        new_operation.d
      FROM internal.bakiye_ops(v_new_canonical) AS new_operation
    ) AS operation
    WHERE operation.entity_id IS NOT NULL
    GROUP BY operation.t, operation.entity_id
    HAVING pg_catalog.sum(operation.d) <> 0
  ) AS aggregated;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.jsonb_array_elements(v_balance_ops) AS balance_operation(value)
    WHERE (balance_operation.value->>'t') NOT IN (
      'hesaplar',
      'cariler',
      'personel'
    )
       OR balance_operation.value->>'d' IS NULL
       OR (balance_operation.value->>'d')::numeric = 'NaN'::numeric
       OR (balance_operation.value->>'d')::numeric = 'Infinity'::numeric
       OR (balance_operation.value->>'d')::numeric = '-Infinity'::numeric
       OR pg_catalog.abs((balance_operation.value->>'d')::numeric)
          > 9999999999999.99
  ) THEN
    RAISE EXCEPTION 'ISLEM_MUTATION_V2_BALANCE_OUT_OF_RANGE'
      USING ERRCODE = '22003';
  END IF;

  -- Legacy motor yalniz server-derived canonical row/ops ile icten kullanilir.
  -- FIFO/tahsis davranisi ve tek PostgreSQL transaction korunur.
  PERFORM public.update_islem_atomik(
    p_isletme_id,
    p_islem_id,
    v_balance_ops,
    pg_catalog.to_jsonb(v_new)
  );

  SELECT transaction_row.*
  INTO v_updated
  FROM public.islemler AS transaction_row
  WHERE transaction_row.id = p_islem_id
    AND transaction_row.isletme_id = p_isletme_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ISLEM_MUTATION_V2_NOT_AUTHORIZED'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    v_updated.id,
    v_updated.type::text,
    v_updated.amount,
    v_updated.description,
    v_updated.date,
    v_updated.hesap_id,
    v_updated.hedef_hesap_id,
    v_updated.kategori_id,
    v_updated.cari_id,
    v_updated.personel_id,
    v_updated.source_currency::text,
    v_updated.target_currency::text,
    v_updated.exchange_rate,
    v_updated.date_end,
    v_updated.vade_tarihi,
    v_updated.created_by;
END;
$function$;

ALTER FUNCTION public.update_islem_atomik_v2(uuid, uuid, jsonb)
  OWNER TO postgres;

REVOKE ALL
ON FUNCTION public.update_islem_atomik_v2(uuid, uuid, jsonb)
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE
ON FUNCTION public.update_islem_atomik_v2(uuid, uuid, jsonb)
TO authenticated;


CREATE FUNCTION public.delete_islem_atomik_v2(
  p_isletme_id uuid,
  p_islem_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_old public.islemler;
  v_old_canonical jsonb;
  v_balance_ops jsonb;
BEGIN
  v_old := internal.get_islem_mutation_row_v1(
    p_isletme_id,
    p_islem_id,
    'delete',
    true
  );

  v_old_canonical := pg_catalog.jsonb_build_object(
    'type', v_old.type::text,
    'amount', v_old.amount,
    'exchange_rate', v_old.exchange_rate,
    'source_currency', v_old.source_currency,
    'target_currency', v_old.target_currency,
    'hesap_id', v_old.hesap_id,
    'hedef_hesap_id', v_old.hedef_hesap_id,
    'cari_id', v_old.cari_id,
    'personel_id', v_old.personel_id
  );

  SELECT COALESCE(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        't', aggregated.t,
        'id', aggregated.entity_id,
        'd', aggregated.d
      )
      ORDER BY aggregated.t, aggregated.entity_id
    ),
    '[]'::jsonb
  )
  INTO v_balance_ops
  FROM (
    SELECT
      operation.t,
      operation.entity_id,
      pg_catalog.sum(operation.d) AS d
    FROM (
      SELECT
        old_operation.t,
        old_operation.entity_id,
        -old_operation.d AS d
      FROM internal.bakiye_ops(v_old_canonical) AS old_operation
    ) AS operation
    WHERE operation.entity_id IS NOT NULL
    GROUP BY operation.t, operation.entity_id
    HAVING pg_catalog.sum(operation.d) <> 0
  ) AS aggregated;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.jsonb_array_elements(v_balance_ops) AS balance_operation(value)
    WHERE (balance_operation.value->>'t') NOT IN (
      'hesaplar',
      'cariler',
      'personel'
    )
       OR balance_operation.value->>'d' IS NULL
       OR (balance_operation.value->>'d')::numeric = 'NaN'::numeric
       OR (balance_operation.value->>'d')::numeric = 'Infinity'::numeric
       OR (balance_operation.value->>'d')::numeric = '-Infinity'::numeric
       OR pg_catalog.abs((balance_operation.value->>'d')::numeric)
          > 9999999999999.99
  ) THEN
    RAISE EXCEPTION 'ISLEM_MUTATION_V2_BALANCE_OUT_OF_RANGE'
      USING ERRCODE = '22003';
  END IF;

  -- Legacy motor yalniz server-derived reverse ops ile icten kullanilir.
  PERFORM public.delete_islem_atomik(
    p_isletme_id,
    p_islem_id,
    v_balance_ops
  );

  RETURN p_islem_id;
END;
$function$;

ALTER FUNCTION public.delete_islem_atomik_v2(uuid, uuid)
  OWNER TO postgres;

REVOKE ALL
ON FUNCTION public.delete_islem_atomik_v2(uuid, uuid)
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE
ON FUNCTION public.delete_islem_atomik_v2(uuid, uuid)
TO authenticated;


COMMENT ON FUNCTION internal.get_islem_mutation_row_v1(uuid, uuid, text, boolean) IS
  'Private shared Cari/Personel mutation guard; exact action/source/entity/special-flow checks.';
COMMENT ON FUNCTION public.get_islem_mutation_context_v1(uuid, uuid, text) IS
  'Narrow balance-free shared mutation context; photo/storage/audit/tenant pointers are never returned.';
COMMENT ON FUNCTION public.update_islem_atomik_v2(uuid, uuid, jsonb) IS
  'P0-S2B additive shared Cari/Personel update; exact patch allowlist and server-derived balance ops.';
COMMENT ON FUNCTION public.delete_islem_atomik_v2(uuid, uuid) IS
  'P0-S2B additive shared Cari/Personel delete; server-derived reverse ops and fail-closed special flows.';
