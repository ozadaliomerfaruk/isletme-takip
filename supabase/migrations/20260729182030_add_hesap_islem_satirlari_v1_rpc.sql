-- CANLI MIGRATION: 20260729182030_add_hesap_islem_satirlari_v1_rpc
-- 29 Temmuz 2026'da rollback kapilari gectikten sonra canliya uygulandi.
-- =============================================================================
-- P0-S7 ILK DILIM: SHARED HESAP DETAYI ICIN DAR ISLEM SATIRI PROJEKSIYONU
-- =============================================================================
-- AMAC
--   Hesaplar modulu acik shared kullanicinin secili hesap detayinda gorebildigi
--   islem satirlarini, kaynak modul yetkileriyle birlikte ve ham FK/tenant
--   alanlarini aciga cikarmadan vermek.
--
-- KANONIK TIP x MODUL KAPISI
--   * gelir/gider/transfer       -> Hesaplar
--   * cari_*                     -> Hesaplar + Cariler
--   * personel_*                 -> Hesaplar + Personel
--   * bilinmeyen/eslesmeyen tip  -> DENY
--   Esleme internal.islem_tipi_modulu kaynagindan okunur; ikinci bir serbest
--   tip listesi yetkilendirme kaynagi yapilmaz.
--
-- PERFORMANS
--   Kaynak ve hedef hesap bacaklari UNION ALL ile ayri tutulur. Boylece mevcut
--   idx_islemler_hesap_date ve idx_islemler_hedef_hesap_date indeksleri
--   kullanilabilir. Hedef bacak yalniz transferdir; ayni hesaba transfer
--   durumunda kaynak satiri tercih edilerek tekrar engellenir.
--   Canli preflight'ta idx_islemler_hesap(hesap_id),
--   idx_islemler_hesap_date(hesap_id, date DESC) ve partial
--   idx_islemler_hedef_hesap_date(hedef_hesap_id, date DESC) dogrulanmistir.
--   Bu migration yeni indeks eklemez.
--
-- VERI / ESKI CLIENT GUVENLIGI
--   * Yalniz YENI, salt-okunur bir SECURITY DEFINER fonksiyon eklenir.
--   * Tablo, kolon, index, policy, trigger ve mevcut RPC degismez.
--   * Migration-time DML/backfill yoktur.
--   * 1.5.x bu RPC'yi bilmez ve mevcut SELECT/RLS yolunu aynen kullanir.
--     Dolayisiyla eski client'in veri/yazma davranisi bu migrationla degismez.
--   * Mevcut kullanici islemleri okunur; hicbiri silinmez veya yeniden yazilmaz.
-- =============================================================================

CREATE FUNCTION public.get_hesap_islem_satirlari_v1(
  p_isletme_id uuid,
  p_hesap_id uuid,
  p_limit integer DEFAULT 50,
  p_before_date timestamp without time zone DEFAULT NULL,
  p_before_created_at timestamp with time zone DEFAULT NULL,
  p_before_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  type text,
  amount numeric,
  description text,
  "date" timestamp without time zone,
  source_currency text,
  target_currency text,
  exchange_rate numeric,
  vade_tarihi date,
  photo_path text,
  created_by uuid,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  kategori_name text,
  source_account_name text,
  target_account_name text,
  counterparty_kind text,
  counterparty_name text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_can_view_hesaplar boolean := false;
  v_can_view_cariler boolean := false;
  v_can_view_personel boolean := false;
  v_can_view_birikim boolean := false;
  v_can_see_all_users_data boolean := false;
  v_is_owner boolean := false;
  v_can_see_archived boolean := false;
  v_can_see_passive boolean := false;
BEGIN
  IF p_isletme_id IS NULL
     OR p_hesap_id IS NULL
     OR p_limit IS NULL
     OR p_limit < 1
     OR p_limit > 100 THEN
    RAISE EXCEPTION 'ACCOUNT_TRANSACTION_ROWS_INVALID_INPUT'
      USING ERRCODE = '22023';
  END IF;

  IF NOT (
    (
      p_before_date IS NULL
      AND p_before_created_at IS NULL
      AND p_before_id IS NULL
    )
    OR
    (
      p_before_date IS NOT NULL
      AND p_before_created_at IS NOT NULL
      AND p_before_id IS NOT NULL
    )
  ) THEN
    RAISE EXCEPTION 'ACCOUNT_TRANSACTION_ROWS_INVALID_INPUT'
      USING ERRCODE = '22023';
  END IF;

  SELECT
    permission.can_view,
    permission.can_see_all_users_data
  INTO
    v_can_view_hesaplar,
    v_can_see_all_users_data
  FROM internal.etkin_yetki(
    p_isletme_id,
    'hesaplar'
  ) AS permission
  LIMIT 1;

  IF v_uid IS NULL OR v_can_view_hesaplar IS NOT TRUE THEN
    RAISE EXCEPTION 'ACCOUNT_TRANSACTION_ROWS_NOT_AUTHORIZED'
      USING ERRCODE = '42501';
  END IF;

  SELECT permission.can_view
  INTO v_can_view_cariler
  FROM internal.etkin_yetki(
    p_isletme_id,
    'cariler'
  ) AS permission
  LIMIT 1;

  SELECT permission.can_view
  INTO v_can_view_personel
  FROM internal.etkin_yetki(
    p_isletme_id,
    'personel'
  ) AS permission
  LIMIT 1;

  SELECT permission.can_view
  INTO v_can_view_birikim
  FROM internal.etkin_yetki(
    p_isletme_id,
    'birikim'
  ) AS permission
  LIMIT 1;

  SELECT EXISTS (
    SELECT 1
    FROM public.isletmeler AS isletme
    WHERE isletme.id = p_isletme_id
      AND isletme.user_id = v_uid
  )
  INTO v_is_owner;

  IF v_is_owner THEN
    v_can_see_archived := true;
    v_can_see_passive := true;
  ELSE
    -- Resolver arsiv/pasif bayraklarini henuz dondurmedigi icin mevcut hesap
    -- SELECT RLS semantigindeki exact-jsonb gorunurlukleri fail-closed tamamla.
    SELECT
      COALESCE(
        uye.permissions->'visibility'->'can_see_archived'
          = 'true'::pg_catalog.jsonb,
        false
      ),
      COALESCE(
        uye.permissions->'visibility'->'can_see_passive'
          = 'true'::pg_catalog.jsonb,
        false
      )
    INTO
      v_can_see_archived,
      v_can_see_passive
    FROM public.isletme_users AS uye
    WHERE uye.isletme_id = p_isletme_id
      AND uye.user_id = v_uid
      AND uye.status = 'active'
    LIMIT 1;
  END IF;

  -- Yok/cross-tenant/birikim/arsiv/pasif ayrimini disariya sizdirmayan tek hata.
  IF NOT EXISTS (
    SELECT 1
    FROM public.hesaplar AS hesap
    WHERE hesap.id = p_hesap_id
      AND hesap.isletme_id = p_isletme_id
      AND (
        v_is_owner IS TRUE
        OR (
          (
            hesap.type <> 'birikim'
            OR v_can_view_birikim IS TRUE
          )
          AND (
            v_can_see_archived IS TRUE
            OR hesap.is_archived IS FALSE
          )
          AND (
            v_can_see_passive IS TRUE
            OR hesap.is_active IS TRUE
          )
        )
      )
  ) THEN
    RAISE EXCEPTION 'ACCOUNT_TRANSACTION_ROWS_NOT_AUTHORIZED'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH source_rows AS (
    SELECT
      islem.id,
      islem.isletme_id,
      islem.type,
      islem.amount,
      islem.description,
      islem.date::timestamp without time zone AS date,
      islem.source_currency,
      islem.target_currency,
      islem.exchange_rate,
      islem.vade_tarihi,
      islem.photo_path,
      islem.created_by,
      cursor_key.created_at,
      islem.updated_at,
      islem.kategori_id,
      islem.hesap_id,
      islem.hedef_hesap_id,
      islem.cari_id,
      islem.personel_id,
      internal.islem_tipi_modulu(islem.type) AS source_modules,
      'source'::text AS selected_leg
    FROM public.islemler AS islem
    CROSS JOIN LATERAL (
      SELECT COALESCE(
        islem.created_at,
        islem.date::timestamp without time zone
          AT TIME ZONE 'Europe/Istanbul'
      ) AS created_at
    ) AS cursor_key
    WHERE islem.isletme_id = p_isletme_id
      AND islem.hesap_id = p_hesap_id
      AND (
        v_can_see_all_users_data IS TRUE
        OR islem.created_by = v_uid
      )
      AND CASE
        WHEN internal.islem_tipi_modulu(islem.type)
          = ARRAY['hesaplar']::text[]
          THEN true
        WHEN internal.islem_tipi_modulu(islem.type)
          = ARRAY['cariler']::text[]
          THEN v_can_view_cariler IS TRUE
        WHEN internal.islem_tipi_modulu(islem.type)
          = ARRAY['personel']::text[]
          THEN v_can_view_personel IS TRUE
        WHEN internal.islem_tipi_modulu(islem.type)
          = ARRAY['personel', 'hesaplar']::text[]
          THEN v_can_view_personel IS TRUE
        ELSE false
      END
      AND (
        p_before_date IS NULL
        OR ROW(
          islem.date::timestamp without time zone,
          cursor_key.created_at,
          islem.id
        ) < ROW(
          p_before_date,
          p_before_created_at,
          p_before_id
        )
      )
    ORDER BY
      islem.date::timestamp without time zone DESC,
      cursor_key.created_at DESC,
      islem.id DESC
    LIMIT p_limit
  ),
  target_rows AS (
    SELECT
      islem.id,
      islem.isletme_id,
      islem.type,
      islem.amount,
      islem.description,
      islem.date::timestamp without time zone AS date,
      islem.source_currency,
      islem.target_currency,
      islem.exchange_rate,
      islem.vade_tarihi,
      islem.photo_path,
      islem.created_by,
      cursor_key.created_at,
      islem.updated_at,
      islem.kategori_id,
      islem.hesap_id,
      islem.hedef_hesap_id,
      islem.cari_id,
      islem.personel_id,
      internal.islem_tipi_modulu(islem.type) AS source_modules,
      'target'::text AS selected_leg
    FROM public.islemler AS islem
    CROSS JOIN LATERAL (
      SELECT COALESCE(
        islem.created_at,
        islem.date::timestamp without time zone
          AT TIME ZONE 'Europe/Istanbul'
      ) AS created_at
    ) AS cursor_key
    WHERE islem.isletme_id = p_isletme_id
      AND islem.hedef_hesap_id = p_hesap_id
      AND islem.type = 'transfer'
      -- Kaynak ve hedef ayni hesapsa kaynak dal tek satir dondurur.
      AND islem.hesap_id IS DISTINCT FROM p_hesap_id
      AND (
        v_can_see_all_users_data IS TRUE
        OR islem.created_by = v_uid
      )
      AND internal.islem_tipi_modulu(islem.type)
        = ARRAY['hesaplar']::text[]
      AND (
        p_before_date IS NULL
        OR ROW(
          islem.date::timestamp without time zone,
          cursor_key.created_at,
          islem.id
        ) < ROW(
          p_before_date,
          p_before_created_at,
          p_before_id
        )
      )
    ORDER BY
      islem.date::timestamp without time zone DESC,
      cursor_key.created_at DESC,
      islem.id DESC
    LIMIT p_limit
  ),
  candidate AS (
    SELECT
      source_rows.id,
      source_rows.isletme_id,
      source_rows.type,
      source_rows.amount,
      source_rows.description,
      source_rows.date,
      source_rows.source_currency,
      source_rows.target_currency,
      source_rows.exchange_rate,
      source_rows.vade_tarihi,
      source_rows.photo_path,
      source_rows.created_by,
      source_rows.created_at,
      source_rows.updated_at,
      source_rows.kategori_id,
      source_rows.hesap_id,
      source_rows.hedef_hesap_id,
      source_rows.cari_id,
      source_rows.personel_id,
      source_rows.source_modules,
      source_rows.selected_leg
    FROM source_rows
    UNION ALL
    SELECT
      target_rows.id,
      target_rows.isletme_id,
      target_rows.type,
      target_rows.amount,
      target_rows.description,
      target_rows.date,
      target_rows.source_currency,
      target_rows.target_currency,
      target_rows.exchange_rate,
      target_rows.vade_tarihi,
      target_rows.photo_path,
      target_rows.created_by,
      target_rows.created_at,
      target_rows.updated_at,
      target_rows.kategori_id,
      target_rows.hesap_id,
      target_rows.hedef_hesap_id,
      target_rows.cari_id,
      target_rows.personel_id,
      target_rows.source_modules,
      target_rows.selected_leg
    FROM target_rows
  )
  SELECT
    candidate.id,
    candidate.type::text,
    candidate.amount,
    candidate.description,
    candidate.date,
    candidate.source_currency,
    candidate.target_currency,
    candidate.exchange_rate,
    candidate.vade_tarihi,
    CASE
      -- Storage pointeri yalniz bu tenant + bu islem icin uygulamanin
      -- uretebildigi kanonik webp anahtariysa disari cikar. Tarihsel/bozuk veya
      -- baska entity'ye bagli bir pointer signed-url yan yoluna tasinmaz.
      WHEN candidate.photo_path ~ (
        '^'
        || p_isletme_id::text
        || '/'
        || candidate.id::text
        || '_[0-9]{10,20}[.]webp$'
      )
      THEN candidate.photo_path
      ELSE NULL
    END AS photo_path,
    candidate.created_by,
    candidate.created_at,
    candidate.updated_at,
    kategori.name::text AS kategori_name,
    source_account.name::text AS source_account_name,
    target_account.name::text AS target_account_name,
    CASE
      WHEN candidate.type = 'transfer'
           AND candidate.selected_leg = 'target'
        THEN 'source_account'::text
      WHEN candidate.type = 'transfer'
        THEN 'target_account'::text
      WHEN candidate.source_modules = ARRAY['cariler']::text[]
        THEN 'cari'::text
      WHEN candidate.source_modules IN (
        ARRAY['personel']::text[],
        ARRAY['personel', 'hesaplar']::text[]
      )
        THEN 'personel'::text
      ELSE NULL::text
    END AS counterparty_kind,
    CASE
      WHEN candidate.type = 'transfer'
           AND candidate.selected_leg = 'target'
        THEN source_account.name::text
      WHEN candidate.type = 'transfer'
        THEN target_account.name::text
      WHEN candidate.source_modules = ARRAY['cariler']::text[]
        THEN cari.name::text
      WHEN candidate.source_modules IN (
        ARRAY['personel']::text[],
        ARRAY['personel', 'hesaplar']::text[]
      )
        THEN NULLIF(
          pg_catalog.concat_ws(
            ' ',
            personel.first_name,
            personel.last_name
          ),
          ''
        )::text
      ELSE NULL::text
    END AS counterparty_name
  FROM candidate
  LEFT JOIN public.kategoriler AS kategori
    ON kategori.id = candidate.kategori_id
   AND kategori.isletme_id = candidate.isletme_id
  LEFT JOIN public.hesaplar AS source_account
    ON source_account.id = candidate.hesap_id
   AND source_account.isletme_id = candidate.isletme_id
   AND (
     v_is_owner IS TRUE
     OR (
       (
         source_account.type <> 'birikim'
         OR v_can_view_birikim IS TRUE
       )
       AND (
         v_can_see_archived IS TRUE
         OR source_account.is_archived IS FALSE
       )
       AND (
         v_can_see_passive IS TRUE
         OR source_account.is_active IS TRUE
       )
     )
   )
  LEFT JOIN public.hesaplar AS target_account
    ON target_account.id = candidate.hedef_hesap_id
   AND target_account.isletme_id = candidate.isletme_id
   AND (
     v_is_owner IS TRUE
     OR (
       (
         target_account.type <> 'birikim'
         OR v_can_view_birikim IS TRUE
       )
       AND (
         v_can_see_archived IS TRUE
         OR target_account.is_archived IS FALSE
       )
       AND (
         v_can_see_passive IS TRUE
         OR target_account.is_active IS TRUE
       )
     )
   )
  LEFT JOIN public.cariler AS cari
    ON cari.id = candidate.cari_id
   AND cari.isletme_id = candidate.isletme_id
   AND v_can_view_cariler IS TRUE
   AND (
     v_is_owner IS TRUE
     OR (
       (
         v_can_see_all_users_data IS TRUE
         OR cari.created_by = v_uid
       )
       AND (
         v_can_see_archived IS TRUE
         OR cari.is_archived IS FALSE
       )
       AND (
         v_can_see_passive IS TRUE
         OR cari.is_active IS TRUE
       )
     )
   )
  LEFT JOIN public.personel AS personel
    ON personel.id = candidate.personel_id
   AND personel.isletme_id = candidate.isletme_id
   AND v_can_view_personel IS TRUE
   AND (
     v_is_owner IS TRUE
     OR (
       (
         v_can_see_all_users_data IS TRUE
         OR personel.created_by = v_uid
       )
       AND (
         v_can_see_archived IS TRUE
         OR personel.is_archived IS FALSE
       )
       AND (
         v_can_see_passive IS TRUE
         OR personel.is_active IS TRUE
       )
     )
   )
  ORDER BY
    candidate.date DESC,
    candidate.created_at DESC,
    candidate.id DESC
  LIMIT p_limit;
END;
$function$;

ALTER FUNCTION public.get_hesap_islem_satirlari_v1(
  uuid,
  uuid,
  integer,
  timestamp without time zone,
  timestamp with time zone,
  uuid
)
  OWNER TO postgres;

REVOKE ALL
ON FUNCTION public.get_hesap_islem_satirlari_v1(
  uuid,
  uuid,
  integer,
  timestamp without time zone,
  timestamp with time zone,
  uuid
)
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE
ON FUNCTION public.get_hesap_islem_satirlari_v1(
  uuid,
  uuid,
  integer,
  timestamp without time zone,
  timestamp with time zone,
  uuid
)
TO authenticated;

COMMENT ON FUNCTION public.get_hesap_islem_satirlari_v1(
  uuid,
  uuid,
  integer,
  timestamp without time zone,
  timestamp with time zone,
  uuid
) IS
  'Returns a keyset-paginated, source-module-gated minimal transaction projection for one same-tenant account.';
