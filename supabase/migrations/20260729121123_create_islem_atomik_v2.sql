-- =============================================================================
-- P0-S2A - SERVER-OTORITER, YETKI-KONTROLLU ISLEM CREATE MOTORU (V2)
-- =============================================================================
-- Canli migration: 20260729121123_create_islem_atomik_v2
-- ADDITIVE / VERI KORUYUCU SINIR
--   * Yalniz YENI public.create_islem_atomik_v2(uuid,jsonb) fonksiyonu eklenir.
--   * Tablo/kolon/politika/trigger degisikligi, migration-time DML ve backfill YOK.
--   * Mevcut create_islem_atomik, increment_balance, dogrudan INSERT/RLS yollari ve
--     complete_ileri_tarihli_islem_atomik DEGISTIRILMEZ.
--   * Yeni RPC canliya uygulanmadan ve istemci opt-in olmadan KULLANILMAZ.
--
-- 1.5.x / ESKI CLIENT ETKISI
--   * SIFIR: eski istemci bu yeni adi bilmez; mevcut create_islem_atomik yolunu
--     aynen kullanir. Parametre, sonuc, RLS veya tablo semasi degismez.
--   * Ileri tarihli tamamlama bilerek V1 motorunda kalir.
--
-- ILK DILIMDE BILINCLI KAPSAM DISI
--   * photo_path / Storage yasam dongusu, source_ileri_id ve urun/stok alt yazimlari
--     ayri atomik motor ister; non-null deger 0A000 ile INSERT'ten once reddedilir.
--   * Viewer tenant'in yabanci owner carisine bagli legacy cari islemi, ters tip ve
--     owner-bakiye semantigi ayri tasarlanana kadar ISLEM_V2_LINKED_CARI_UNSUPPORTED
--     ile fail-closed kalir. Ayni tenant carileri desteklenir.
--
-- YETKI SOZLESMESI
--   * auth.uid + aktif tenant uyeligi/sahiplik zorunlu.
--   * Mutation aksiyonu internal.etkin_yetki(...,'islemler').can_create exact true.
--   * Tip kaynaklari internal.islem_tipi_modulu allowlist'inden gelir; her kaynak
--     modul icin can_view exact true gerekir. Bilinmeyen tip default yetki ALMAZ.
--   * K13: cari_odeme/cari_tahsilat yalniz ['cariler'] kaynagidir. Cariler-only
--     kullanici birikim olmayan bakiye-gizli hesap referansiyla islem kurabilir;
--     Hesaplar modulu zorunlu degildir. Birikim hesabi ayrica birikim can_view ister.
--
-- IDEMPOTENCY
--   * UUID istemci tarafindan zorunlu verilir.
--   * Ayni creator + ayni kanonik payload guvenli projection'i no-op olarak dondurur.
--   * Baska tenant/creator ayni UUID: 23505.
--   * Ayni creator fakat farkli kanonik payload: 22023.
--
-- MANUEL TEST OZETI (canli uygulama + istemci entegrasyonu AYRI ADIMDIR)
--   1. Owner: gelir/gider/transfer/cari/personel tipleri tek kez bakiye yazar.
--   2. Cariler-only shared: cari_odeme/tahsilat basarili; hesap bakiyesi response'ta
--      yoktur. gelir/gider ve birikim hesapli cari nakit reddedilir.
--   3. Ayni UUID+payload retry: ayni satir, ikinci bakiye/tahsis yok.
--   4. Ayni UUID farkli creator=23505; farkli payload=22023.
--   5. Cross-tenant/pasif/arsivli/yanlis tip entity ve bozuk kur/tutar: yazma yok.
-- =============================================================================

CREATE FUNCTION public.create_islem_atomik_v2(
  p_isletme_id uuid,
  p_new_row jsonb
)
RETURNS TABLE (
  id uuid,
  type text,
  amount numeric,
  description text,
  "date" timestamp without time zone,
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
  hedef_islem_id uuid,
  created_at timestamp with time zone,
  created_by uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_owner_id uuid;
  v_id uuid;
  v_type text;
  v_amount_input numeric;
  v_amount public.islemler.amount%TYPE;
  v_description text;
  v_date_text text;
  v_date public.islemler.date%TYPE;
  v_hesap_id uuid;
  v_hedef_hesap_id uuid;
  v_kategori_id uuid;
  v_cari_id uuid;
  v_personel_id uuid;
  v_source_assertion text;
  v_target_assertion text;
  v_rate_input numeric;
  v_rate public.islemler.exchange_rate%TYPE;
  v_photo_path text;
  v_date_end text;
  v_source_ileri_id uuid;
  v_vade_tarihi date;
  v_hedef_islem_id uuid;
  v_modules text[];
  v_module text;
  v_can boolean;
  v_expected_category_type text;
  v_expected_invoice_type text;
  v_cari_currency text;
  v_personel_currency text;
  v_hesap_currency text;
  v_hedef_hesap_currency text;
  v_source_currency text;
  v_target_currency text;
  v_account_ids uuid[];
  v_account record;
  v_account_count integer := 0;
  v_expected_account_count integer := 0;
  v_requires_birikim boolean := false;
  v_existing public.islemler%ROWTYPE;
  v_inserted_rows integer := 0;
  v_updated_rows integer := 0;
  v_canonical jsonb;
  v_op record;
  v_op_count integer := 0;
  v_expected_op_count integer := 0;
  v_cari_delta numeric;
  v_personel_delta numeric;
  v_hesap_delta numeric;
  v_hedef_hesap_delta numeric;
  v_cari_balance numeric;
  v_personel_balance numeric;
  v_hesap_balance numeric;
  v_hedef_hesap_balance numeric;
BEGIN
  -- Tenant satiri her cagrida ilk kilittir. Uye ise aktif uyelik ikinci kilittir.
  IF v_uid IS NULL OR p_isletme_id IS NULL THEN
    RAISE EXCEPTION 'ISLEM_V2_NOT_AUTHORIZED'
      USING ERRCODE = '42501';
  END IF;

  SELECT isl.user_id
  INTO v_owner_id
  FROM public.isletmeler AS isl
  WHERE isl.id = p_isletme_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ISLEM_V2_NOT_AUTHORIZED'
      USING ERRCODE = '42501';
  END IF;

  IF v_owner_id IS DISTINCT FROM v_uid THEN
    PERFORM 1
    FROM public.isletme_users AS iu
    WHERE iu.isletme_id = p_isletme_id
      AND iu.user_id = v_uid
      AND iu.status = 'active'
    FOR SHARE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'ISLEM_V2_NOT_AUTHORIZED'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- JSON allowlist: tenant/audit/bakiye/created_at gibi server-owned alanlar
  -- payload'a sizamaz. photo/source_ileri yalniz explicit null uyumlulugu icindir.
  IF p_new_row IS NULL
     OR pg_catalog.jsonb_typeof(p_new_row) IS DISTINCT FROM 'object'
     OR NOT (p_new_row ?& ARRAY['id', 'type', 'amount', 'date'])
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.jsonb_object_keys(p_new_row) AS payload_key(key_name)
       WHERE payload_key.key_name NOT IN (
         'id', 'type', 'amount', 'description', 'date',
         'hesap_id', 'hedef_hesap_id', 'kategori_id', 'cari_id', 'personel_id',
         'source_currency', 'target_currency', 'exchange_rate',
         'photo_path', 'date_end', 'source_ileri_id',
         'vade_tarihi', 'hedef_islem_id'
       )
     )
     OR pg_catalog.jsonb_typeof(p_new_row->'id') IS DISTINCT FROM 'string'
     OR pg_catalog.jsonb_typeof(p_new_row->'type') IS DISTINCT FROM 'string'
     OR pg_catalog.jsonb_typeof(p_new_row->'amount') IS DISTINCT FROM 'number'
     OR pg_catalog.jsonb_typeof(p_new_row->'date') IS DISTINCT FROM 'string'
     OR (
       p_new_row ? 'description'
       AND pg_catalog.jsonb_typeof(p_new_row->'description') NOT IN ('string', 'null')
     )
     OR (
       p_new_row ? 'exchange_rate'
       AND pg_catalog.jsonb_typeof(p_new_row->'exchange_rate') NOT IN ('number', 'null')
     )
     OR (
       p_new_row ? 'source_currency'
       AND pg_catalog.jsonb_typeof(p_new_row->'source_currency') NOT IN ('string', 'null')
     )
     OR (
       p_new_row ? 'target_currency'
       AND pg_catalog.jsonb_typeof(p_new_row->'target_currency') NOT IN ('string', 'null')
     )
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.unnest(ARRAY[
         'hesap_id', 'hedef_hesap_id', 'kategori_id', 'cari_id', 'personel_id',
         'source_ileri_id', 'hedef_islem_id'
       ]) AS optional_uuid(key_name)
       WHERE p_new_row ? optional_uuid.key_name
         AND pg_catalog.jsonb_typeof(p_new_row->optional_uuid.key_name)
           NOT IN ('string', 'null')
     )
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.unnest(ARRAY[
         'photo_path', 'date_end', 'vade_tarihi'
       ]) AS optional_text(key_name)
       WHERE p_new_row ? optional_text.key_name
         AND pg_catalog.jsonb_typeof(p_new_row->optional_text.key_name)
           NOT IN ('string', 'null')
     ) THEN
    RAISE EXCEPTION 'ISLEM_V2_INVALID_INPUT'
      USING ERRCODE = '22023';
  END IF;

  v_date_text := p_new_row->>'date';
  IF v_date_text !~
       '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]{1,6})?([+-][0-9]{2}:[0-9]{2}|Z)?$'
     OR (
       p_new_row->>'date_end' IS NOT NULL
       AND p_new_row->>'date_end' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
     )
     OR (
       p_new_row->>'vade_tarihi' IS NOT NULL
       AND p_new_row->>'vade_tarihi' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
     ) THEN
    RAISE EXCEPTION 'ISLEM_V2_INVALID_INPUT'
      USING ERRCODE = '22023';
  END IF;

  BEGIN
    v_id := (p_new_row->>'id')::uuid;
    v_type := p_new_row->>'type';
    v_amount_input := (p_new_row->>'amount')::numeric;
    v_description := NULLIF(pg_catalog.btrim(p_new_row->>'description'), '');
    v_date := v_date_text::timestamp without time zone;
    v_hesap_id := CASE
      WHEN pg_catalog.jsonb_typeof(p_new_row->'hesap_id') = 'string'
        THEN (p_new_row->>'hesap_id')::uuid
      ELSE NULL
    END;
    v_hedef_hesap_id := CASE
      WHEN pg_catalog.jsonb_typeof(p_new_row->'hedef_hesap_id') = 'string'
        THEN (p_new_row->>'hedef_hesap_id')::uuid
      ELSE NULL
    END;
    v_kategori_id := CASE
      WHEN pg_catalog.jsonb_typeof(p_new_row->'kategori_id') = 'string'
        THEN (p_new_row->>'kategori_id')::uuid
      ELSE NULL
    END;
    v_cari_id := CASE
      WHEN pg_catalog.jsonb_typeof(p_new_row->'cari_id') = 'string'
        THEN (p_new_row->>'cari_id')::uuid
      ELSE NULL
    END;
    v_personel_id := CASE
      WHEN pg_catalog.jsonb_typeof(p_new_row->'personel_id') = 'string'
        THEN (p_new_row->>'personel_id')::uuid
      ELSE NULL
    END;
    v_rate_input := CASE
      WHEN pg_catalog.jsonb_typeof(p_new_row->'exchange_rate') = 'number'
        THEN (p_new_row->>'exchange_rate')::numeric
      ELSE NULL
    END;
    v_photo_path := CASE
      WHEN pg_catalog.jsonb_typeof(p_new_row->'photo_path') = 'string'
        THEN p_new_row->>'photo_path'
      ELSE NULL
    END;
    v_date_end := CASE
      WHEN pg_catalog.jsonb_typeof(p_new_row->'date_end') = 'string'
        THEN (p_new_row->>'date_end')::date::text
      ELSE NULL
    END;
    v_source_ileri_id := CASE
      WHEN pg_catalog.jsonb_typeof(p_new_row->'source_ileri_id') = 'string'
        THEN (p_new_row->>'source_ileri_id')::uuid
      ELSE NULL
    END;
    v_vade_tarihi := CASE
      WHEN pg_catalog.jsonb_typeof(p_new_row->'vade_tarihi') = 'string'
        THEN (p_new_row->>'vade_tarihi')::date
      ELSE NULL
    END;
    v_hedef_islem_id := CASE
      WHEN pg_catalog.jsonb_typeof(p_new_row->'hedef_islem_id') = 'string'
        THEN (p_new_row->>'hedef_islem_id')::uuid
      ELSE NULL
    END;
  EXCEPTION
    WHEN invalid_text_representation
      OR invalid_datetime_format
      OR datetime_field_overflow
      OR numeric_value_out_of_range THEN
      RAISE EXCEPTION 'ISLEM_V2_INVALID_INPUT'
        USING ERRCODE = '22023';
  END;

  IF v_id IS NULL
     OR v_type IS NULL
     OR v_amount_input IS NULL
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
    RAISE EXCEPTION 'ISLEM_V2_INVALID_INPUT'
      USING ERRCODE = '22023';
  END IF;

  v_amount := v_amount_input;
  v_rate := v_rate_input;
  v_source_assertion := NULLIF(
    pg_catalog.upper(pg_catalog.btrim(p_new_row->>'source_currency')),
    ''
  );
  v_target_assertion := NULLIF(
    pg_catalog.upper(pg_catalog.btrim(p_new_row->>'target_currency')),
    ''
  );

  IF (v_source_assertion IS NULL) IS DISTINCT FROM
       (v_target_assertion IS NULL)
     OR (
       v_source_assertion IS NOT NULL
       AND (
         v_source_assertion NOT IN ('TRY', 'USD', 'EUR', 'GBP', 'XAU', 'XAG')
         OR v_target_assertion NOT IN ('TRY', 'USD', 'EUR', 'GBP', 'XAU', 'XAG')
       )
     ) THEN
    RAISE EXCEPTION 'ISLEM_V2_INVALID_INPUT'
      USING ERRCODE = '22023';
  END IF;

  -- Exact islem create + fail-closed tip -> kaynak modulu gorunurlugu.
  SELECT permission.can_create
  INTO v_can
  FROM internal.etkin_yetki(p_isletme_id, 'islemler') AS permission;

  IF v_can IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'ISLEM_V2_NOT_AUTHORIZED'
      USING ERRCODE = '42501';
  END IF;

  v_modules := internal.islem_tipi_modulu(v_type);
  IF v_modules IS NULL THEN
    RAISE EXCEPTION 'ISLEM_V2_INVALID_INPUT'
      USING ERRCODE = '22023';
  END IF;

  FOREACH v_module IN ARRAY v_modules
  LOOP
    SELECT permission.can_view
    INTO v_can
    FROM internal.etkin_yetki(p_isletme_id, v_module) AS permission;

    IF v_can IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'ISLEM_V2_NOT_AUTHORIZED'
        USING ERRCODE = '42501';
    END IF;
  END LOOP;

  -- Tip/entity sekli exact. Fazladan entity UUID'si kabul edilmez.
  IF (CASE v_type
    WHEN 'gelir' THEN
      v_hesap_id IS NOT NULL AND v_hedef_hesap_id IS NULL
      AND v_cari_id IS NULL AND v_personel_id IS NULL
    WHEN 'gider' THEN
      v_hesap_id IS NOT NULL AND v_hedef_hesap_id IS NULL
      AND v_cari_id IS NULL AND v_personel_id IS NULL
    WHEN 'transfer' THEN
      v_hesap_id IS NOT NULL AND v_hedef_hesap_id IS NOT NULL
      AND v_hesap_id IS DISTINCT FROM v_hedef_hesap_id
      AND v_cari_id IS NULL AND v_personel_id IS NULL
    WHEN 'cari_alis' THEN
      v_cari_id IS NOT NULL AND v_hesap_id IS NULL
      AND v_hedef_hesap_id IS NULL AND v_personel_id IS NULL
    WHEN 'cari_satis' THEN
      v_cari_id IS NOT NULL AND v_hesap_id IS NULL
      AND v_hedef_hesap_id IS NULL AND v_personel_id IS NULL
    WHEN 'cari_alis_iade' THEN
      v_cari_id IS NOT NULL AND v_hesap_id IS NULL
      AND v_hedef_hesap_id IS NULL AND v_personel_id IS NULL
    WHEN 'cari_satis_iade' THEN
      v_cari_id IS NOT NULL AND v_hesap_id IS NULL
      AND v_hedef_hesap_id IS NULL AND v_personel_id IS NULL
    WHEN 'cari_odeme' THEN
      v_cari_id IS NOT NULL AND v_hesap_id IS NOT NULL
      AND v_hedef_hesap_id IS NULL AND v_personel_id IS NULL
    WHEN 'cari_tahsilat' THEN
      v_cari_id IS NOT NULL AND v_hesap_id IS NOT NULL
      AND v_hedef_hesap_id IS NULL AND v_personel_id IS NULL
    WHEN 'personel_gider' THEN
      v_personel_id IS NOT NULL AND v_hesap_id IS NULL
      AND v_hedef_hesap_id IS NULL AND v_cari_id IS NULL
    WHEN 'personel_satis' THEN
      v_personel_id IS NOT NULL AND v_hesap_id IS NULL
      AND v_hedef_hesap_id IS NULL AND v_cari_id IS NULL
    WHEN 'personel_izin_hakki' THEN
      v_personel_id IS NOT NULL AND v_hesap_id IS NULL
      AND v_hedef_hesap_id IS NULL AND v_cari_id IS NULL
    WHEN 'personel_izin_kullanimi' THEN
      v_personel_id IS NOT NULL AND v_hesap_id IS NULL
      AND v_hedef_hesap_id IS NULL AND v_cari_id IS NULL
    WHEN 'personel_odeme' THEN
      v_personel_id IS NOT NULL AND v_hesap_id IS NOT NULL
      AND v_hedef_hesap_id IS NULL AND v_cari_id IS NULL
    WHEN 'personel_tahsilat' THEN
      v_personel_id IS NOT NULL AND v_hesap_id IS NOT NULL
      AND v_hedef_hesap_id IS NULL AND v_cari_id IS NULL
    ELSE false
  END) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'ISLEM_V2_INVALID_INPUT'
      USING ERRCODE = '22023';
  END IF;

  IF v_photo_path IS NOT NULL OR v_source_ileri_id IS NOT NULL THEN
    RAISE EXCEPTION 'ISLEM_V2_FEATURE_UNSUPPORTED'
      USING ERRCODE = '0A000';
  END IF;

  IF (v_date_end IS NOT NULL AND v_type <> 'personel_izin_kullanimi')
     OR (
       v_date_end IS NOT NULL
       AND v_date_end::date < v_date::date
     )
     OR (
       v_vade_tarihi IS NOT NULL
       AND v_type NOT IN ('cari_alis', 'cari_satis')
     )
     OR (
       v_hedef_islem_id IS NOT NULL
       AND v_type NOT IN ('cari_odeme', 'cari_tahsilat')
     ) THEN
    RAISE EXCEPTION 'ISLEM_V2_INVALID_INPUT'
      USING ERRCODE = '22023';
  END IF;

  -- Idempotency pre-probe entity sonradan arsivlense bile ayni retry'i no-op tutar.
  SELECT existing_row.*
  INTO v_existing
  FROM public.islemler AS existing_row
  WHERE existing_row.id = v_id
  FOR SHARE;

  IF FOUND THEN
    IF v_existing.isletme_id IS DISTINCT FROM p_isletme_id
       OR v_existing.created_by IS DISTINCT FROM v_uid THEN
      RAISE EXCEPTION 'ISLEM_V2_IDEMPOTENCY_CONFLICT'
        USING ERRCODE = '23505';
    END IF;

    v_source_currency := pg_catalog.upper(
      pg_catalog.btrim(v_existing.source_currency)
    );
    v_target_currency := pg_catalog.upper(
      pg_catalog.btrim(v_existing.target_currency)
    );

    IF v_source_currency IS NULL
       OR v_target_currency IS NULL
       OR v_source_currency NOT IN ('TRY', 'USD', 'EUR', 'GBP', 'XAU', 'XAG')
       OR v_target_currency NOT IN ('TRY', 'USD', 'EUR', 'GBP', 'XAU', 'XAG')
       OR (
         v_source_assertion IS NOT NULL
         AND (
           v_source_assertion IS DISTINCT FROM v_source_currency
           OR v_target_assertion IS DISTINCT FROM v_target_currency
         )
       )
       OR (
         v_source_currency = v_target_currency
         AND v_rate IS NOT NULL
       )
       OR (
         v_source_currency <> v_target_currency
         AND v_rate IS NULL
       )
       OR v_existing.type::text IS DISTINCT FROM v_type
       OR v_existing.amount IS DISTINCT FROM v_amount
       OR v_existing.description IS DISTINCT FROM v_description
       OR v_existing.date IS DISTINCT FROM v_date
       OR v_existing.hesap_id IS DISTINCT FROM v_hesap_id
       OR v_existing.hedef_hesap_id IS DISTINCT FROM v_hedef_hesap_id
       OR v_existing.kategori_id IS DISTINCT FROM v_kategori_id
       OR v_existing.cari_id IS DISTINCT FROM v_cari_id
       OR v_existing.personel_id IS DISTINCT FROM v_personel_id
       OR v_existing.source_currency IS DISTINCT FROM v_source_currency
       OR v_existing.target_currency IS DISTINCT FROM v_target_currency
       OR v_existing.exchange_rate IS DISTINCT FROM v_rate
       OR v_existing.photo_path IS NOT NULL
       OR v_existing.date_end IS DISTINCT FROM v_date_end
       OR v_existing.source_ileri_id IS NOT NULL
       OR v_existing.vade_tarihi IS DISTINCT FROM v_vade_tarihi
       OR v_existing.hedef_islem_id IS DISTINCT FROM v_hedef_islem_id THEN
      RAISE EXCEPTION 'ISLEM_V2_IDEMPOTENCY_PAYLOAD_MISMATCH'
        USING ERRCODE = '22023';
    END IF;

    RETURN QUERY
    SELECT
      result_row.id,
      result_row.type::text,
      result_row.amount,
      result_row.description,
      result_row.date,
      result_row.hesap_id,
      result_row.hedef_hesap_id,
      result_row.kategori_id,
      result_row.cari_id,
      result_row.personel_id,
      result_row.source_currency,
      result_row.target_currency,
      result_row.exchange_rate,
      result_row.date_end,
      result_row.vade_tarihi,
      result_row.hedef_islem_id,
      result_row.created_at,
      result_row.created_by
    FROM public.islemler AS result_row
    WHERE result_row.id = v_id
      AND result_row.isletme_id = p_isletme_id;
    RETURN;
  END IF;

  -- Deterministik entity kilit sirasi: cari -> personel -> hesap UUID sirasi
  -- -> kategori -> hedef fatura. Her satir ayni tenant, aktif ve arsivsizdir.
  IF v_cari_id IS NOT NULL THEN
    SELECT
      COALESCE(
        NULLIF(pg_catalog.upper(pg_catalog.btrim(c.currency::text)), ''),
        'TRY'
      ),
      c.balance
    INTO v_cari_currency, v_cari_balance
    FROM public.cariler AS c
    WHERE c.id = v_cari_id
      AND c.isletme_id = p_isletme_id
      AND c.is_active IS TRUE
      AND c.is_archived IS FALSE
    FOR NO KEY UPDATE;

    IF NOT FOUND THEN
      IF EXISTS (
        SELECT 1
        FROM public.cari_links AS link
        WHERE link.cari_id = v_cari_id
          AND link.viewer_isletme_id = p_isletme_id
      ) THEN
        RAISE EXCEPTION 'ISLEM_V2_LINKED_CARI_UNSUPPORTED'
          USING ERRCODE = '0A000';
      END IF;

      RAISE EXCEPTION 'ISLEM_V2_NOT_AUTHORIZED'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF v_personel_id IS NOT NULL THEN
    SELECT
      COALESCE(
        NULLIF(pg_catalog.upper(pg_catalog.btrim(p.currency::text)), ''),
        'TRY'
      ),
      p.balance
    INTO v_personel_currency, v_personel_balance
    FROM public.personel AS p
    WHERE p.id = v_personel_id
      AND p.isletme_id = p_isletme_id
      AND p.is_active IS TRUE
      AND p.is_archived IS FALSE
    FOR NO KEY UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'ISLEM_V2_NOT_AUTHORIZED'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  v_account_ids := pg_catalog.array_remove(
    ARRAY[v_hesap_id, v_hedef_hesap_id],
    NULL
  );
  v_expected_account_count := pg_catalog.cardinality(v_account_ids);

  FOR v_account IN
    SELECT
      h.id,
      h.type::text AS account_type,
      COALESCE(
        NULLIF(pg_catalog.upper(pg_catalog.btrim(h.currency::text)), ''),
        'TRY'
      ) AS account_currency,
      h.balance
    FROM public.hesaplar AS h
    WHERE h.id = ANY(v_account_ids)
      AND h.isletme_id = p_isletme_id
      AND h.is_active IS TRUE
      AND h.is_archived IS FALSE
    ORDER BY h.id
    FOR NO KEY UPDATE
  LOOP
    v_account_count := v_account_count + 1;
    v_requires_birikim :=
      v_requires_birikim OR v_account.account_type = 'birikim';

    IF v_account.id = v_hesap_id THEN
      v_hesap_currency := v_account.account_currency;
      v_hesap_balance := v_account.balance;
    ELSIF v_account.id = v_hedef_hesap_id THEN
      v_hedef_hesap_currency := v_account.account_currency;
      v_hedef_hesap_balance := v_account.balance;
    END IF;
  END LOOP;

  IF v_account_count <> v_expected_account_count THEN
    RAISE EXCEPTION 'ISLEM_V2_NOT_AUTHORIZED'
      USING ERRCODE = '42501';
  END IF;

  IF v_requires_birikim THEN
    SELECT permission.can_view
    INTO v_can
    FROM internal.etkin_yetki(p_isletme_id, 'birikim') AS permission;

    IF v_can IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'ISLEM_V2_NOT_AUTHORIZED'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  v_expected_category_type := CASE
    WHEN v_type IN (
      'gelir', 'cari_tahsilat', 'cari_satis', 'cari_satis_iade',
      'personel_tahsilat', 'personel_satis'
    ) THEN 'gelir'
    WHEN v_type IN (
      'gider', 'transfer', 'cari_odeme', 'cari_alis', 'cari_alis_iade',
      'personel_odeme', 'personel_gider'
    ) THEN 'gider'
    ELSE NULL
  END;

  IF v_kategori_id IS NOT NULL THEN
    IF v_expected_category_type IS NULL THEN
      RAISE EXCEPTION 'ISLEM_V2_INVALID_INPUT'
        USING ERRCODE = '22023';
    END IF;

    PERFORM 1
    FROM public.kategoriler AS k
    WHERE k.id = v_kategori_id
      AND k.isletme_id = p_isletme_id
      AND k.is_active IS TRUE
      AND k.type::text = v_expected_category_type
    FOR NO KEY UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'ISLEM_V2_NOT_AUTHORIZED'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF v_hedef_islem_id IS NOT NULL THEN
    v_expected_invoice_type := CASE
      WHEN v_type = 'cari_tahsilat' THEN 'cari_satis'
      ELSE 'cari_alis'
    END;

    PERFORM 1
    FROM public.islemler AS invoice
    WHERE invoice.id = v_hedef_islem_id
      AND invoice.isletme_id = p_isletme_id
      AND invoice.cari_id = v_cari_id
      AND invoice.type::text = v_expected_invoice_type
    FOR NO KEY UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'ISLEM_V2_NOT_AUTHORIZED'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Para birimleri yalniz kilitli DB entity satirlarindan turetilir.
  IF v_type IN (
    'transfer', 'cari_odeme', 'cari_tahsilat',
    'personel_odeme', 'personel_tahsilat'
  ) THEN
    v_source_currency := v_hesap_currency;
    v_target_currency := CASE
      WHEN v_type = 'transfer' THEN v_hedef_hesap_currency
      WHEN v_type LIKE 'cari_%' THEN v_cari_currency
      ELSE v_personel_currency
    END;
  ELSIF v_type LIKE 'cari_%' THEN
    v_source_currency := v_cari_currency;
    v_target_currency := v_cari_currency;
  ELSIF v_type LIKE 'personel_%' THEN
    v_source_currency := v_personel_currency;
    v_target_currency := v_personel_currency;
  ELSE
    v_source_currency := v_hesap_currency;
    v_target_currency := v_hesap_currency;
  END IF;

  IF v_source_currency IS NULL
     OR v_target_currency IS NULL
     OR v_source_currency NOT IN ('TRY', 'USD', 'EUR', 'GBP', 'XAU', 'XAG')
     OR v_target_currency NOT IN ('TRY', 'USD', 'EUR', 'GBP', 'XAU', 'XAG')
     OR (
       v_source_assertion IS NOT NULL
       AND (
         v_source_assertion IS DISTINCT FROM v_source_currency
         OR v_target_assertion IS DISTINCT FROM v_target_currency
       )
     )
     OR (
       v_source_currency = v_target_currency
       AND v_rate IS NOT NULL
     )
     OR (
       v_source_currency <> v_target_currency
       AND v_rate IS NULL
     ) THEN
    RAISE EXCEPTION 'ISLEM_V2_INVALID_INPUT'
      USING ERRCODE = '22023';
  END IF;

  -- Hedef pointer kontrolu, DB'den turetilmis para birimlerinden sonra yapilir.
  IF v_hedef_islem_id IS NOT NULL
     AND v_source_currency <> v_target_currency
     AND v_source_currency <> 'TRY'
     AND v_target_currency <> 'TRY' THEN
    RAISE EXCEPTION 'ISLEM_V2_INVALID_INPUT'
      USING ERRCODE = '22023';
  END IF;

  v_canonical := pg_catalog.jsonb_build_object(
    'type', v_type,
    'amount', v_amount,
    'exchange_rate', v_rate,
    'source_currency', v_source_currency,
    'target_currency', v_target_currency,
    'hesap_id', v_hesap_id,
    'hedef_hesap_id', v_hedef_hesap_id,
    'cari_id', v_cari_id,
    'personel_id', v_personel_id
  );

  -- Bakiye ops istemciden alinmaz: tek server helper'i kanonik payload'dan turetir.
  FOR v_op IN
    SELECT derived.t, derived.entity_id, derived.d
    FROM internal.bakiye_ops(v_canonical) AS derived
  LOOP
    v_op_count := v_op_count + 1;
    IF v_op.d IS NULL
       OR v_op.d = 'NaN'::numeric
       OR v_op.d = 'Infinity'::numeric
       OR v_op.d = '-Infinity'::numeric
       OR pg_catalog.abs(v_op.d) > 9999999999999.99 THEN
      RAISE EXCEPTION 'ISLEM_V2_BALANCE_OUT_OF_RANGE'
        USING ERRCODE = '22003';
    END IF;

    CASE v_op.t
      WHEN 'cariler' THEN
        IF v_op.entity_id IS DISTINCT FROM v_cari_id
           OR v_cari_delta IS NOT NULL THEN
          RAISE EXCEPTION 'ISLEM_V2_BALANCE_CONTRACT_DRIFT'
            USING ERRCODE = '55000';
        END IF;
        v_cari_delta := v_op.d;
      WHEN 'personel' THEN
        IF v_op.entity_id IS DISTINCT FROM v_personel_id
           OR v_personel_delta IS NOT NULL THEN
          RAISE EXCEPTION 'ISLEM_V2_BALANCE_CONTRACT_DRIFT'
            USING ERRCODE = '55000';
        END IF;
        v_personel_delta := v_op.d;
      WHEN 'hesaplar' THEN
        IF v_op.entity_id = v_hesap_id AND v_hesap_delta IS NULL THEN
          v_hesap_delta := v_op.d;
        ELSIF v_op.entity_id = v_hedef_hesap_id
              AND v_hedef_hesap_delta IS NULL THEN
          v_hedef_hesap_delta := v_op.d;
        ELSE
          RAISE EXCEPTION 'ISLEM_V2_BALANCE_CONTRACT_DRIFT'
            USING ERRCODE = '55000';
        END IF;
      ELSE
        RAISE EXCEPTION 'ISLEM_V2_BALANCE_CONTRACT_DRIFT'
          USING ERRCODE = '55000';
    END CASE;
  END LOOP;

  v_expected_op_count := CASE v_type
    WHEN 'transfer' THEN 2
    WHEN 'cari_odeme' THEN 2
    WHEN 'cari_tahsilat' THEN 2
    WHEN 'personel_odeme' THEN 2
    WHEN 'personel_tahsilat' THEN 2
    WHEN 'personel_izin_hakki' THEN 0
    WHEN 'personel_izin_kullanimi' THEN 0
    ELSE 1
  END;

  IF v_op_count <> v_expected_op_count
     OR (
       v_cari_delta IS NOT NULL
       AND v_cari_balance IS NOT NULL
       AND pg_catalog.abs(v_cari_balance + v_cari_delta)
         > 9999999999999.99
     )
     OR (
       v_personel_delta IS NOT NULL
       AND v_personel_balance IS NOT NULL
       AND pg_catalog.abs(v_personel_balance + v_personel_delta)
         > 9999999999999.99
     )
     OR (
       v_hesap_delta IS NOT NULL
       AND v_hesap_balance IS NOT NULL
       AND pg_catalog.abs(v_hesap_balance + v_hesap_delta)
         > 9999999999999.99
     )
     OR (
       v_hedef_hesap_delta IS NOT NULL
       AND v_hedef_hesap_balance IS NOT NULL
       AND pg_catalog.abs(v_hedef_hesap_balance + v_hedef_hesap_delta)
         > 9999999999999.99
     ) THEN
    RAISE EXCEPTION 'ISLEM_V2_BALANCE_OUT_OF_RANGE'
      USING ERRCODE = '22003';
  END IF;

  INSERT INTO public.islemler (
    id,
    isletme_id,
    type,
    amount,
    description,
    date,
    hesap_id,
    hedef_hesap_id,
    kategori_id,
    cari_id,
    personel_id,
    source_currency,
    target_currency,
    exchange_rate,
    photo_path,
    date_end,
    source_ileri_id,
    vade_tarihi,
    hedef_islem_id,
    created_by
  )
  VALUES (
    v_id,
    p_isletme_id,
    v_type,
    v_amount,
    v_description,
    v_date,
    v_hesap_id,
    v_hedef_hesap_id,
    v_kategori_id,
    v_cari_id,
    v_personel_id,
    v_source_currency,
    v_target_currency,
    v_rate,
    NULL,
    v_date_end,
    NULL,
    v_vade_tarihi,
    v_hedef_islem_id,
    v_uid
  )
  ON CONFLICT ON CONSTRAINT islemler_pkey DO NOTHING;

  GET DIAGNOSTICS v_inserted_rows = ROW_COUNT;

  -- Concurrent same-UUID yarisi: yalniz exact creator+kanonik payload no-op.
  IF v_inserted_rows = 0 THEN
    SELECT existing_row.*
    INTO v_existing
    FROM public.islemler AS existing_row
    WHERE existing_row.id = v_id
    FOR SHARE;

    IF NOT FOUND
       OR v_existing.isletme_id IS DISTINCT FROM p_isletme_id
       OR v_existing.created_by IS DISTINCT FROM v_uid THEN
      RAISE EXCEPTION 'ISLEM_V2_IDEMPOTENCY_CONFLICT'
        USING ERRCODE = '23505';
    END IF;

    IF v_existing.type::text IS DISTINCT FROM v_type
       OR v_existing.amount IS DISTINCT FROM v_amount
       OR v_existing.description IS DISTINCT FROM v_description
       OR v_existing.date IS DISTINCT FROM v_date
       OR v_existing.hesap_id IS DISTINCT FROM v_hesap_id
       OR v_existing.hedef_hesap_id IS DISTINCT FROM v_hedef_hesap_id
       OR v_existing.kategori_id IS DISTINCT FROM v_kategori_id
       OR v_existing.cari_id IS DISTINCT FROM v_cari_id
       OR v_existing.personel_id IS DISTINCT FROM v_personel_id
       OR v_existing.source_currency IS DISTINCT FROM v_source_currency
       OR v_existing.target_currency IS DISTINCT FROM v_target_currency
       OR v_existing.exchange_rate IS DISTINCT FROM v_rate
       OR v_existing.photo_path IS NOT NULL
       OR v_existing.date_end IS DISTINCT FROM v_date_end
       OR v_existing.source_ileri_id IS NOT NULL
       OR v_existing.vade_tarihi IS DISTINCT FROM v_vade_tarihi
       OR v_existing.hedef_islem_id IS DISTINCT FROM v_hedef_islem_id THEN
      RAISE EXCEPTION 'ISLEM_V2_IDEMPOTENCY_PAYLOAD_MISMATCH'
        USING ERRCODE = '22023';
    END IF;

    RETURN QUERY
    SELECT
      result_row.id,
      result_row.type::text,
      result_row.amount,
      result_row.description,
      result_row.date,
      result_row.hesap_id,
      result_row.hedef_hesap_id,
      result_row.kategori_id,
      result_row.cari_id,
      result_row.personel_id,
      result_row.source_currency,
      result_row.target_currency,
      result_row.exchange_rate,
      result_row.date_end,
      result_row.vade_tarihi,
      result_row.hedef_islem_id,
      result_row.created_at,
      result_row.created_by
    FROM public.islemler AS result_row
    WHERE result_row.id = v_id
      AND result_row.isletme_id = p_isletme_id;
    RETURN;
  END IF;

  -- Direct, tenant-scoped writes. increment_balance ve client balance ops YOK.
  IF v_cari_delta IS NOT NULL THEN
    UPDATE public.cariler AS c
    SET
      balance = c.balance + v_cari_delta,
      updated_at = pg_catalog.now()
    WHERE c.id = v_cari_id
      AND c.isletme_id = p_isletme_id
      AND c.is_active IS TRUE
      AND c.is_archived IS FALSE;

    GET DIAGNOSTICS v_updated_rows = ROW_COUNT;
    IF v_updated_rows <> 1 THEN
      RAISE EXCEPTION 'ISLEM_V2_ENTITY_CHANGED'
        USING ERRCODE = '55000';
    END IF;
  END IF;

  IF v_personel_delta IS NOT NULL THEN
    UPDATE public.personel AS p
    SET
      balance = p.balance + v_personel_delta,
      updated_at = pg_catalog.now()
    WHERE p.id = v_personel_id
      AND p.isletme_id = p_isletme_id
      AND p.is_active IS TRUE
      AND p.is_archived IS FALSE;

    GET DIAGNOSTICS v_updated_rows = ROW_COUNT;
    IF v_updated_rows <> 1 THEN
      RAISE EXCEPTION 'ISLEM_V2_ENTITY_CHANGED'
        USING ERRCODE = '55000';
    END IF;
  END IF;

  IF v_hedef_hesap_delta IS NOT NULL THEN
    UPDATE public.hesaplar AS h
    SET
      balance = CASE h.id
        WHEN v_hesap_id THEN h.balance + v_hesap_delta
        WHEN v_hedef_hesap_id THEN h.balance + v_hedef_hesap_delta
        ELSE h.balance
      END,
      updated_at = pg_catalog.now()
    WHERE h.id IN (v_hesap_id, v_hedef_hesap_id)
      AND h.isletme_id = p_isletme_id
      AND h.is_active IS TRUE
      AND h.is_archived IS FALSE;

    GET DIAGNOSTICS v_updated_rows = ROW_COUNT;
    IF v_updated_rows <> 2 THEN
      RAISE EXCEPTION 'ISLEM_V2_ENTITY_CHANGED'
        USING ERRCODE = '55000';
    END IF;
  ELSIF v_hesap_delta IS NOT NULL THEN
    UPDATE public.hesaplar AS h
    SET
      balance = h.balance + v_hesap_delta,
      updated_at = pg_catalog.now()
    WHERE h.id = v_hesap_id
      AND h.isletme_id = p_isletme_id
      AND h.is_active IS TRUE
      AND h.is_archived IS FALSE;

    GET DIAGNOSTICS v_updated_rows = ROW_COUNT;
    IF v_updated_rows <> 1 THEN
      RAISE EXCEPTION 'ISLEM_V2_ENTITY_CHANGED'
        USING ERRCODE = '55000';
    END IF;
  END IF;

  -- Mevcut TEK FIFO/tahsis motoru. Ikinci tahsis defteri kurulmaz.
  IF v_cari_id IS NOT NULL
     AND public.tahsis_borc_tipleri(v_type) IS NOT NULL THEN
    PERFORM public.tahsis_odeme_esitle(
      p_isletme_id,
      v_id,
      v_hedef_islem_id
    );
  END IF;

  IF v_cari_id IS NOT NULL
     AND v_type IN ('cari_satis', 'cari_alis') THEN
    PERFORM public.tahsis_avans_supur(p_isletme_id, v_cari_id);
  END IF;

  -- Bakiye, entity adi, izin JSON'u veya tenant metadata'si donmez.
  RETURN QUERY
  SELECT
    result_row.id,
    result_row.type::text,
    result_row.amount,
    result_row.description,
    result_row.date,
    result_row.hesap_id,
    result_row.hedef_hesap_id,
    result_row.kategori_id,
    result_row.cari_id,
    result_row.personel_id,
    result_row.source_currency,
    result_row.target_currency,
    result_row.exchange_rate,
    result_row.date_end,
    result_row.vade_tarihi,
    result_row.hedef_islem_id,
    result_row.created_at,
    result_row.created_by
  FROM public.islemler AS result_row
  WHERE result_row.id = v_id
    AND result_row.isletme_id = p_isletme_id;
END;
$function$;

ALTER FUNCTION public.create_islem_atomik_v2(uuid, jsonb)
  OWNER TO postgres;

REVOKE ALL
ON FUNCTION public.create_islem_atomik_v2(uuid, jsonb)
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE
ON FUNCTION public.create_islem_atomik_v2(uuid, jsonb)
TO authenticated;

COMMENT ON FUNCTION public.create_islem_atomik_v2(uuid, jsonb) IS
  'P0-S2A: server-derived balances, exact permission gates and UUID idempotency; first slice excludes linked-viewer cari, Storage, scheduled and product subwrites.';
