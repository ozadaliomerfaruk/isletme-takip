-- CANLI MIGRATION: 20260729081914_add_cari_islem_satirlari_v1_rpc
-- =============================================================================
-- U-4 ILK DILIM: CARI DETAYI ICIN DAR ISLEM SATIRI PROJEKSIYONU
-- =============================================================================
-- AMAC
--   Cariler modulu acik bir kullaniciya, yalniz secilen carinin ve Cariler
--   tip-eslemesine sahip islem satirlarini dar bir response ile vermek.
--
-- CIKTI SINIRI
--   * Hesap/kategori kimlikleri, bakiyeler, cari iletisim alanlari ve ham
--     permissions response'a alinmaz.
--   * Hesap adi yalniz cari_odeme/cari_tahsilat satirlarinda doner.
--   * photo_path yalniz mevcut detay fotografi akisini koruyan DB isaretcisidir;
--     Storage nesnesine erisim ayri P-F/Storage policy sinirinda kalir.
--
-- VERI / ESKI CLIENT GUVENLIGI
--   * Yalniz YENI, salt-okunur bir fonksiyon eklenir.
--   * Tablo, kolon, index, policy, trigger, mevcut RPC veya satir degismez.
--   * Migration-time DML/backfill yoktur.
--   * 1.5.x bu yeni RPC'yi bilmez; mevcut SELECT/RLS yolunu aynen kullanir.
--     Yeni istemci bu endpoint'e opt-in olana kadar gorunur davranis degismez.
--   * Ilk sema migrationinda islemler.date DATE, canli semada timestamp without
--     time zone'dur. Acik cast iki sema durumunda da ayni timestamp sozlesmesini
--     verir; mevcut satirlari yeniden yazmaz.
-- =============================================================================

CREATE FUNCTION public.get_cari_islem_satirlari_v1(
  p_isletme_id uuid,
  p_cari_id uuid,
  p_limit integer DEFAULT 50,
  p_before_date timestamp without time zone DEFAULT NULL,
  p_before_created_at timestamp with time zone DEFAULT NULL,
  p_before_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  isletme_id uuid,
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
  hesap_name text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_can_view boolean := false;
  v_can_see_all_users_data boolean := false;
  v_is_owner boolean := false;
  v_can_see_archived boolean := false;
  v_can_see_passive boolean := false;
BEGIN
  IF p_isletme_id IS NULL
     OR p_cari_id IS NULL
     OR p_limit IS NULL
     OR p_limit < 1
     OR p_limit > 100 THEN
    RAISE EXCEPTION 'CARI_TRANSACTION_ROWS_INVALID_INPUT'
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
    RAISE EXCEPTION 'CARI_TRANSACTION_ROWS_INVALID_INPUT'
      USING ERRCODE = '22023';
  END IF;

  SELECT
    permission.can_view,
    permission.can_see_all_users_data
  INTO
    v_can_view,
    v_can_see_all_users_data
  FROM internal.etkin_yetki(
    p_isletme_id,
    'cariler'
  ) AS permission
  LIMIT 1;

  IF v_uid IS NULL OR v_can_view IS NOT TRUE THEN
    RAISE EXCEPTION 'CARI_TRANSACTION_ROWS_NOT_AUTHORIZED'
      USING ERRCODE = '42501';
  END IF;

  -- internal.etkin_yetki sahiplik filtresini dondurur; mevcut imzasi henuz
  -- arsiv/pasif gorunurluklerini dondurmez. Parent cari kontrolu, mevcut
  -- "Shared select cariler" RLS'iyle birebir kalmak icin bu iki exact-jsonb
  -- bayragi yalniz aktif uyelikten fail-closed tamamlar. Aksiyon/level burada
  -- tekrar yorumlanmaz.
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

  -- Ayni generic hata; yok, cross-tenant, baskasina ait, arsivli veya pasif
  -- cari durumlarini birbirinden ayirt ettirmez.
  IF NOT EXISTS (
    SELECT 1
    FROM public.cariler AS cari
    WHERE cari.id = p_cari_id
      AND cari.isletme_id = p_isletme_id
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
  ) THEN
    RAISE EXCEPTION 'CARI_TRANSACTION_ROWS_NOT_AUTHORIZED'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    islem.id,
    islem.isletme_id,
    islem.type::text,
    islem.amount,
    islem.description,
    islem.date::timestamp without time zone,
    islem.source_currency,
    islem.target_currency,
    islem.exchange_rate,
    islem.vade_tarihi,
    islem.photo_path,
    islem.created_by,
    cursor_key.created_at,
    islem.updated_at,
    kategori.name::text AS kategori_name,
    CASE
      WHEN islem.type IN ('cari_odeme', 'cari_tahsilat')
        THEN hesap.name::text
      ELSE NULL::text
    END AS hesap_name
  FROM public.islemler AS islem
  LEFT JOIN public.kategoriler AS kategori
    ON kategori.id = islem.kategori_id
   AND kategori.isletme_id = islem.isletme_id
  LEFT JOIN public.hesaplar AS hesap
    ON hesap.id = islem.hesap_id
   AND hesap.isletme_id = islem.isletme_id
   AND islem.type IN ('cari_odeme', 'cari_tahsilat')
  -- created_at kolonunun sema kontrati nullable. Canlida bugun NULL satir yok;
  -- yine de gelecekte tek bir NULL cursor'un sayfalamayi durdurmamasi icin hem
  -- cikti hem keyset ayni non-null, deterministik fallback'i kullanir.
  CROSS JOIN LATERAL (
    SELECT COALESCE(
      islem.created_at,
      islem.date::timestamp without time zone AT TIME ZONE 'Europe/Istanbul'
    ) AS created_at
  ) AS cursor_key
  WHERE islem.isletme_id = p_isletme_id
    AND islem.cari_id = p_cari_id
    AND internal.islem_tipi_modulu(islem.type)
      = ARRAY['cariler']::text[]
    AND (
      v_can_see_all_users_data IS TRUE
      OR islem.created_by = v_uid
    )
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
  LIMIT p_limit;
END;
$function$;

ALTER FUNCTION public.get_cari_islem_satirlari_v1(
  uuid,
  uuid,
  integer,
  timestamp without time zone,
  timestamp with time zone,
  uuid
)
  OWNER TO postgres;

REVOKE ALL
ON FUNCTION public.get_cari_islem_satirlari_v1(
  uuid,
  uuid,
  integer,
  timestamp without time zone,
  timestamp with time zone,
  uuid
)
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE
ON FUNCTION public.get_cari_islem_satirlari_v1(
  uuid,
  uuid,
  integer,
  timestamp without time zone,
  timestamp with time zone,
  uuid
)
TO authenticated;

COMMENT ON FUNCTION public.get_cari_islem_satirlari_v1(
  uuid,
  uuid,
  integer,
  timestamp without time zone,
  timestamp with time zone,
  uuid
) IS
  'Returns a keyset-paginated, ownership-filtered minimal transaction projection for one same-tenant cari.';
