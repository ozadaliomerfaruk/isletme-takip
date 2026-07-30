-- ADDITIVE MIGRATION: PERSONEL ISLEM / IZIN PROJEKSIYONLARI
-- =============================================================================
-- P0-S7 / C3: SHARED PERSONEL ISLEM VE IZIN KOTASI PROJEKSIYONLARI
-- =============================================================================
-- AMAC
--   Personel modulu acik shared kullanicinin personel detayinda gorebildigi
--   islem satirlarini ve personel listesindeki izin kotalarini, temel
--   `islemler select *` yuzeyine cikmadan dar response'larla vermek.
--
-- KANONIK TIP x MODUL KAPISI
--   * personel_gider / personel_satis / izin tipleri -> Personel
--   * personel_odeme / personel_tahsilat             -> Personel + Hesaplar
--   * bilinmeyen veya eslesmeyen tip                 -> DENY
--   Esleme internal.islem_tipi_modulu kaynagindan okunur. Izin kotasi ek
--   olarak yalniz iki exact izin tipini toplar.
--
-- GORUNURLUK
--   * Parent personel ayni tenantta olmali; own/all, arsiv ve pasif kurallari
--     mevcut Shared select personel RLS semantigini korur.
--   * Islem ve izin agregati can_see_all_users_data=false iken yalniz
--     auth.uid() tarafindan olusturulan kaynak satirlardan uretilir.
--   * Hesap adi sadece Hesaplar aciksa ve hesap mevcut
--     arsiv/pasif/birikim gorunurlugunu gecerse minimal referans olarak doner.
--   * Personel-only profilde odeme/tahsilat satirinin TAMAMI gizlenir.
--     Bu nedenle ekstre toplami ile personel.balance uyusmayabilir; bu durum
--     docs/security/YETKI-SOZLESMESI.md tarafindan bilincli kabul edilmistir.
--
-- PERFORMANS
--   Canli salt-okunur preflight'ta idx_islemler_personel(personel_id) ve
--   idx_islemler_personel_date(personel_id, date DESC) dogrulandi.
--   Personel basina canli maksimum 290 satir oldugu icin bu migration yeni
--   indeks eklemez.
--
-- VERI / ESKI CLIENT GUVENLIGI
--   * Yalniz iki YENI, salt-okunur SECURITY DEFINER fonksiyon eklenir.
--   * Tablo, kolon, index, policy, trigger ve mevcut RPC degismez.
--   * Migration-time DML/backfill yoktur; mevcut satir silinmez/yazilmaz.
--   * get_personel_ozet bu dilimin disindadir ve degistirilmez.
--   * 1.5.x bu RPC'leri bilmez; mevcut SELECT/RLS yolunu aynen kullanir.
--     Yeni istemci bu endpoint'lere opt-in olana kadar davranisi degismez.
-- =============================================================================

CREATE FUNCTION public.get_personel_islem_satirlari_v1(
  p_isletme_id uuid,
  p_personel_id uuid,
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
  date_end text,
  source_currency text,
  target_currency text,
  exchange_rate numeric,
  created_by uuid,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  kategori_name text,
  hesap_name text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_can_view_personel boolean := false;
  v_can_view_hesaplar boolean := false;
  v_can_view_birikim boolean := false;
  v_can_see_all_users_data boolean := false;
  v_is_owner boolean := false;
  v_can_see_archived boolean := false;
  v_can_see_passive boolean := false;
BEGIN
  IF p_isletme_id IS NULL
     OR p_personel_id IS NULL
     OR p_limit IS NULL
     OR p_limit < 1
     OR p_limit > 100 THEN
    RAISE EXCEPTION 'PERSONEL_TRANSACTION_ROWS_INVALID_INPUT'
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
    RAISE EXCEPTION 'PERSONEL_TRANSACTION_ROWS_INVALID_INPUT'
      USING ERRCODE = '22023';
  END IF;

  SELECT
    permission.can_view,
    permission.can_see_all_users_data
  INTO
    v_can_view_personel,
    v_can_see_all_users_data
  FROM internal.etkin_yetki(
    p_isletme_id,
    'personel'
  ) AS permission
  LIMIT 1;

  IF v_uid IS NULL OR v_can_view_personel IS NOT TRUE THEN
    RAISE EXCEPTION 'PERSONEL_TRANSACTION_ROWS_NOT_AUTHORIZED'
      USING ERRCODE = '42501';
  END IF;

  SELECT permission.can_view
  INTO v_can_view_hesaplar
  FROM internal.etkin_yetki(
    p_isletme_id,
    'hesaplar'
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
    -- internal.etkin_yetki mevcut imzasinda arsiv/pasif bayraklarini
    -- dondurmedigi icin Shared select personel/hesaplar semantigindeki exact
    -- JSONB bayraklari fail-closed tamamlanir. Aksiyon/level yorumlanmaz.
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

  -- Yok/cross-tenant/baskasina ait/arsivli/pasif ayrimini sizdirmayan tek hata.
  IF NOT EXISTS (
    SELECT 1
    FROM public.personel AS personel
    WHERE personel.id = p_personel_id
      AND personel.isletme_id = p_isletme_id
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
  ) THEN
    RAISE EXCEPTION 'PERSONEL_TRANSACTION_ROWS_NOT_AUTHORIZED'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH candidate AS (
    SELECT
      islem.id,
      islem.isletme_id,
      islem.type,
      islem.amount,
      islem.description,
      islem.date::timestamp without time zone AS date,
      islem.date_end,
      islem.source_currency,
      islem.target_currency,
      islem.exchange_rate,
      islem.created_by,
      cursor_key.created_at,
      islem.updated_at,
      islem.kategori_id,
      islem.hesap_id,
      mapping.source_modules
    FROM public.islemler AS islem
    CROSS JOIN LATERAL (
      SELECT COALESCE(
        islem.created_at,
        islem.date::timestamp without time zone
          AT TIME ZONE 'Europe/Istanbul'
      ) AS created_at
    ) AS cursor_key
    CROSS JOIN LATERAL (
      SELECT internal.islem_tipi_modulu(islem.type) AS source_modules
    ) AS mapping
    WHERE islem.isletme_id = p_isletme_id
      AND islem.personel_id = p_personel_id
      AND (
        v_can_see_all_users_data IS TRUE
        OR islem.created_by = v_uid
      )
      AND CASE
        WHEN mapping.source_modules = ARRAY['personel']::text[]
          THEN true
        WHEN mapping.source_modules
          = ARRAY['personel', 'hesaplar']::text[]
          THEN v_can_view_hesaplar IS TRUE
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
  )
  SELECT
    candidate.id,
    candidate.type::text,
    candidate.amount,
    candidate.description,
    candidate.date,
    candidate.date_end,
    candidate.source_currency,
    candidate.target_currency,
    candidate.exchange_rate,
    candidate.created_by,
    candidate.created_at,
    candidate.updated_at,
    kategori.name::text AS kategori_name,
    hesap.name::text AS hesap_name
  FROM candidate
  LEFT JOIN public.kategoriler AS kategori
    ON kategori.id = candidate.kategori_id
   AND kategori.isletme_id = candidate.isletme_id
  LEFT JOIN public.hesaplar AS hesap
    ON hesap.id = candidate.hesap_id
   AND hesap.isletme_id = candidate.isletme_id
   AND candidate.source_modules
     = ARRAY['personel', 'hesaplar']::text[]
   AND v_can_view_hesaplar IS TRUE
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
  ORDER BY
    candidate.date DESC,
    candidate.created_at DESC,
    candidate.id DESC
  LIMIT p_limit;
END;
$function$;

ALTER FUNCTION public.get_personel_islem_satirlari_v1(
  uuid,
  uuid,
  integer,
  timestamp without time zone,
  timestamp with time zone,
  uuid
)
  OWNER TO postgres;

REVOKE ALL
ON FUNCTION public.get_personel_islem_satirlari_v1(
  uuid,
  uuid,
  integer,
  timestamp without time zone,
  timestamp with time zone,
  uuid
)
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE
ON FUNCTION public.get_personel_islem_satirlari_v1(
  uuid,
  uuid,
  integer,
  timestamp without time zone,
  timestamp with time zone,
  uuid
)
TO authenticated;

COMMENT ON FUNCTION public.get_personel_islem_satirlari_v1(
  uuid,
  uuid,
  integer,
  timestamp without time zone,
  timestamp with time zone,
  uuid
) IS
  'Returns a keyset-paginated, source-module-gated minimal transaction projection for one visible same-tenant personel.';


CREATE FUNCTION public.get_personel_izin_kotalari_v1(
  p_isletme_id uuid
)
RETURNS TABLE (
  personel_id uuid,
  hak_edilen numeric,
  kullanilan numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_can_view_personel boolean := false;
  v_can_see_all_users_data boolean := false;
  v_is_owner boolean := false;
  v_can_see_archived boolean := false;
  v_can_see_passive boolean := false;
BEGIN
  IF p_isletme_id IS NULL THEN
    RAISE EXCEPTION 'PERSONEL_LEAVE_QUOTAS_INVALID_INPUT'
      USING ERRCODE = '22023';
  END IF;

  SELECT
    permission.can_view,
    permission.can_see_all_users_data
  INTO
    v_can_view_personel,
    v_can_see_all_users_data
  FROM internal.etkin_yetki(
    p_isletme_id,
    'personel'
  ) AS permission
  LIMIT 1;

  IF v_uid IS NULL OR v_can_view_personel IS NOT TRUE THEN
    RAISE EXCEPTION 'PERSONEL_LEAVE_QUOTAS_NOT_AUTHORIZED'
      USING ERRCODE = '42501';
  END IF;

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

  RETURN QUERY
  SELECT
    personel.id AS personel_id,
    COALESCE(
      SUM(islem.amount) FILTER (
        WHERE islem.type = 'personel_izin_hakki'
      ),
      0::numeric
    ) AS hak_edilen,
    COALESCE(
      SUM(islem.amount) FILTER (
        WHERE islem.type = 'personel_izin_kullanimi'
      ),
      0::numeric
    ) AS kullanilan
  FROM public.personel AS personel
  JOIN public.islemler AS islem
    ON islem.personel_id = personel.id
   AND islem.isletme_id = personel.isletme_id
   AND islem.type IN (
     'personel_izin_hakki',
     'personel_izin_kullanimi'
   )
   AND internal.islem_tipi_modulu(islem.type)
     = ARRAY['personel']::text[]
   AND (
     v_can_see_all_users_data IS TRUE
     OR islem.created_by = v_uid
   )
  WHERE personel.isletme_id = p_isletme_id
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
  GROUP BY personel.id
  ORDER BY personel.id;
END;
$function$;

ALTER FUNCTION public.get_personel_izin_kotalari_v1(uuid)
  OWNER TO postgres;

REVOKE ALL
ON FUNCTION public.get_personel_izin_kotalari_v1(uuid)
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE
ON FUNCTION public.get_personel_izin_kotalari_v1(uuid)
TO authenticated;

COMMENT ON FUNCTION public.get_personel_izin_kotalari_v1(uuid) IS
  'Returns ownership-filtered leave entitlement and usage totals for visible same-tenant personel.';
