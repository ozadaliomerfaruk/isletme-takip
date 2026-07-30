-- =============================================================================
-- MANUEL URUN HAREKETLERI: ATOMIK CREATE / UPDATE / DELETE V2
-- =============================================================================
-- SORUN
--   Eski istemci stok miktarini update_urun_miktar ile degistiriyor, hareket
--   satirini ise ayri bir HTTP istegiyle yaziyordu. Ikinci istek veya telafi
--   istegi kaybolursa urunler.miktar ile urun_hareketler ayrisabiliyordu.
--
-- COZUM
--   Her eylemde urun satiri ve hareket satiri tek PostgreSQL transaction'inda
--   kilitlenir/yazilir. Fonksiyon exception ile biterse iki degisiklik de
--   PostgreSQL tarafindan birlikte geri alinir.
--
-- ADDITIVE / VERI KORUYUCU SINIR
--   * Yalniz uc YENI RPC eklenir.
--   * Tablo, kolon, politika veya trigger degisikligi YOK.
--   * Migration-time INSERT/UPDATE/DELETE, backfill ve mevcut veri yazimi YOK.
--   * Eski RPC imzalari ve eski client davranisi DEGISTIRILMEZ.
--
-- 1.5.x / ESKI CLIENT ETKISI
--   * SIFIR: eski client bu yeni RPC adlarini bilmez; mevcut yollarini kullanir.
--   * Yeni client yalniz manuel urun hareketlerinde V2 RPC'lere opt-in olur.
-- =============================================================================

CREATE FUNCTION public.create_urun_hareket_atomik_v2(
  p_isletme_id uuid,
  p_new_row jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_can_view boolean;
  v_can_create boolean;
  v_urun_id uuid;
  v_islem_id uuid;
  v_hareket_tipi text;
  v_miktar numeric;
  v_birim_fiyat numeric;
  v_kdv_orani integer;
  v_aciklama text;
  v_created_at timestamptz;
  v_onceki_miktar numeric;
  v_delta numeric;
  v_yeni_miktar numeric;
  v_hareket public.urun_hareketler;
BEGIN
  IF auth.uid() IS NULL
     OR p_isletme_id IS NULL
     OR p_new_row IS NULL
     OR pg_catalog.jsonb_typeof(p_new_row) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'URUN_HAREKET_V2_INVALID_INPUT'
      USING ERRCODE = '22023';
  END IF;

  SELECT permission.can_view, permission.can_create
  INTO v_can_view, v_can_create
  FROM internal.etkin_yetki(p_isletme_id, 'urunler') AS permission;

  IF v_can_view IS DISTINCT FROM true
     OR v_can_create IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'URUN_HAREKET_V2_NOT_AUTHORIZED'
      USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.jsonb_object_keys(p_new_row) AS input_key(key_name)
    WHERE input_key.key_name NOT IN (
      'urun_id',
      'islem_id',
      'hareket_tipi',
      'miktar',
      'birim_fiyat',
      'kdv_orani',
      'aciklama',
      'created_at'
    )
  ) THEN
    RAISE EXCEPTION 'URUN_HAREKET_V2_INVALID_INPUT'
      USING ERRCODE = '22023';
  END IF;

  BEGIN
    v_urun_id := NULLIF(p_new_row->>'urun_id', '')::uuid;
    v_islem_id := NULLIF(p_new_row->>'islem_id', '')::uuid;
    v_hareket_tipi := p_new_row->>'hareket_tipi';
    v_miktar := NULLIF(p_new_row->>'miktar', '')::numeric;
    v_birim_fiyat := NULLIF(p_new_row->>'birim_fiyat', '')::numeric;
    v_kdv_orani := CASE
      WHEN p_new_row ? 'kdv_orani'
        THEN NULLIF(p_new_row->>'kdv_orani', '')::integer
      ELSE 0
    END;
    v_aciklama := p_new_row->>'aciklama';
    v_created_at := NULLIF(p_new_row->>'created_at', '')::timestamptz;
  EXCEPTION
    WHEN invalid_text_representation OR numeric_value_out_of_range
      OR datetime_field_overflow THEN
      RAISE EXCEPTION 'URUN_HAREKET_V2_INVALID_INPUT'
        USING ERRCODE = '22023';
  END;

  IF v_urun_id IS NULL
     OR v_hareket_tipi NOT IN ('giris', 'cikis', 'duzeltme')
     OR v_miktar IS NULL THEN
    RAISE EXCEPTION 'URUN_HAREKET_V2_INVALID_INPUT'
      USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(product.miktar, 0)
  INTO v_onceki_miktar
  FROM public.urunler AS product
  WHERE product.id = v_urun_id
    AND product.isletme_id = p_isletme_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'URUN_HAREKET_V2_NOT_AUTHORIZED'
      USING ERRCODE = '42501';
  END IF;

  IF v_islem_id IS NOT NULL THEN
    PERFORM 1
    FROM public.islemler AS transaction_row
    WHERE transaction_row.id = v_islem_id
      AND transaction_row.isletme_id = p_isletme_id
    FOR KEY SHARE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'URUN_HAREKET_V2_NOT_AUTHORIZED'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  v_delta := CASE v_hareket_tipi
    WHEN 'giris' THEN pg_catalog.abs(v_miktar)
    WHEN 'cikis' THEN -pg_catalog.abs(v_miktar)
    ELSE v_miktar
  END;
  v_yeni_miktar := v_onceki_miktar + v_delta;

  UPDATE public.urunler AS product
  SET miktar = v_yeni_miktar,
      updated_at = pg_catalog.clock_timestamp()
  WHERE product.id = v_urun_id
    AND product.isletme_id = p_isletme_id;

  INSERT INTO public.urun_hareketler (
    isletme_id,
    urun_id,
    islem_id,
    hareket_tipi,
    miktar,
    birim_fiyat,
    kdv_orani,
    onceki_miktar,
    yeni_miktar,
    aciklama,
    created_at
  )
  VALUES (
    p_isletme_id,
    v_urun_id,
    v_islem_id,
    v_hareket_tipi,
    v_miktar,
    v_birim_fiyat,
    v_kdv_orani,
    v_onceki_miktar,
    v_yeni_miktar,
    v_aciklama,
    COALESCE(v_created_at, pg_catalog.clock_timestamp())
  )
  RETURNING * INTO v_hareket;

  RETURN pg_catalog.to_jsonb(v_hareket);
END;
$function$;

CREATE FUNCTION public.update_urun_hareket_atomik_v2(
  p_isletme_id uuid,
  p_hareket_id uuid,
  p_patch jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_can_view boolean;
  v_can_update_own boolean;
  v_can_update_all boolean;
  v_hareket public.urun_hareketler;
  v_hareket_tipi text;
  v_miktar numeric;
  v_birim_fiyat numeric;
  v_created_at timestamptz;
  v_urun_miktar numeric;
  v_eski_delta numeric;
  v_yeni_delta numeric;
  v_net_delta numeric;
BEGIN
  IF v_uid IS NULL
     OR p_isletme_id IS NULL
     OR p_hareket_id IS NULL
     OR p_patch IS NULL
     OR pg_catalog.jsonb_typeof(p_patch) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'URUN_HAREKET_V2_INVALID_INPUT'
      USING ERRCODE = '22023';
  END IF;

  SELECT
    permission.can_view,
    permission.can_update_own,
    permission.can_update_all
  INTO
    v_can_view,
    v_can_update_own,
    v_can_update_all
  FROM internal.etkin_yetki(p_isletme_id, 'urunler') AS permission;

  IF v_can_view IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'URUN_HAREKET_V2_NOT_AUTHORIZED'
      USING ERRCODE = '42501';
  END IF;

  SELECT movement.*
  INTO v_hareket
  FROM public.urun_hareketler AS movement
  WHERE movement.id = p_hareket_id
    AND movement.isletme_id = p_isletme_id
  FOR UPDATE;

  IF NOT FOUND
     OR NOT (
       v_can_update_all IS TRUE
       OR (
         v_can_update_own IS TRUE
         AND v_hareket.created_by IS NOT NULL
         AND v_hareket.created_by = v_uid
       )
     ) THEN
    RAISE EXCEPTION 'URUN_HAREKET_V2_NOT_AUTHORIZED'
      USING ERRCODE = '42501';
  END IF;

  IF v_hareket.islem_id IS NOT NULL THEN
    RAISE EXCEPTION 'URUN_HAREKET_V2_LINKED_MOVEMENT'
      USING ERRCODE = '0A000';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.jsonb_object_keys(p_patch) AS patch_key(key_name)
    WHERE patch_key.key_name NOT IN (
      'hareket_tipi',
      'miktar',
      'birim_fiyat',
      'created_at'
    )
  ) THEN
    RAISE EXCEPTION 'URUN_HAREKET_V2_INVALID_INPUT'
      USING ERRCODE = '22023';
  END IF;

  BEGIN
    v_hareket_tipi := p_patch->>'hareket_tipi';
    v_miktar := NULLIF(p_patch->>'miktar', '')::numeric;
    v_birim_fiyat := NULLIF(p_patch->>'birim_fiyat', '')::numeric;
    v_created_at := CASE
      WHEN p_patch ? 'created_at'
        THEN NULLIF(p_patch->>'created_at', '')::timestamptz
      ELSE v_hareket.created_at
    END;
  EXCEPTION
    WHEN invalid_text_representation OR numeric_value_out_of_range
      OR datetime_field_overflow THEN
      RAISE EXCEPTION 'URUN_HAREKET_V2_INVALID_INPUT'
        USING ERRCODE = '22023';
  END;

  IF v_hareket_tipi NOT IN ('giris', 'cikis', 'duzeltme')
     OR v_miktar IS NULL
     OR v_created_at IS NULL THEN
    RAISE EXCEPTION 'URUN_HAREKET_V2_INVALID_INPUT'
      USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(product.miktar, 0)
  INTO v_urun_miktar
  FROM public.urunler AS product
  WHERE product.id = v_hareket.urun_id
    AND product.isletme_id = p_isletme_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'URUN_HAREKET_V2_NOT_AUTHORIZED'
      USING ERRCODE = '42501';
  END IF;

  v_eski_delta := CASE v_hareket.hareket_tipi
    WHEN 'giris' THEN pg_catalog.abs(v_hareket.miktar)
    WHEN 'cikis' THEN -pg_catalog.abs(v_hareket.miktar)
    ELSE v_hareket.miktar
  END;
  v_yeni_delta := CASE v_hareket_tipi
    WHEN 'giris' THEN pg_catalog.abs(v_miktar)
    WHEN 'cikis' THEN -pg_catalog.abs(v_miktar)
    ELSE v_miktar
  END;
  v_net_delta := -v_eski_delta + v_yeni_delta;
  v_urun_miktar := v_urun_miktar + v_net_delta;

  UPDATE public.urunler AS product
  SET miktar = v_urun_miktar,
      updated_at = pg_catalog.clock_timestamp()
  WHERE product.id = v_hareket.urun_id
    AND product.isletme_id = p_isletme_id;

  UPDATE public.urun_hareketler AS movement
  SET hareket_tipi = v_hareket_tipi,
      miktar = v_miktar,
      birim_fiyat = v_birim_fiyat,
      yeni_miktar = v_urun_miktar,
      created_at = v_created_at
  WHERE movement.id = p_hareket_id
    AND movement.isletme_id = p_isletme_id
  RETURNING movement.* INTO v_hareket;

  RETURN pg_catalog.to_jsonb(v_hareket);
END;
$function$;

CREATE FUNCTION public.delete_urun_hareket_atomik_v2(
  p_isletme_id uuid,
  p_hareket_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_can_view boolean;
  v_can_delete_own boolean;
  v_can_delete_all boolean;
  v_hareket public.urun_hareketler;
  v_urun_miktar numeric;
  v_delta numeric;
BEGIN
  IF v_uid IS NULL
     OR p_isletme_id IS NULL
     OR p_hareket_id IS NULL THEN
    RAISE EXCEPTION 'URUN_HAREKET_V2_INVALID_INPUT'
      USING ERRCODE = '22023';
  END IF;

  SELECT
    permission.can_view,
    permission.can_delete_own,
    permission.can_delete_all
  INTO
    v_can_view,
    v_can_delete_own,
    v_can_delete_all
  FROM internal.etkin_yetki(p_isletme_id, 'urunler') AS permission;

  IF v_can_view IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'URUN_HAREKET_V2_NOT_AUTHORIZED'
      USING ERRCODE = '42501';
  END IF;

  SELECT movement.*
  INTO v_hareket
  FROM public.urun_hareketler AS movement
  WHERE movement.id = p_hareket_id
    AND movement.isletme_id = p_isletme_id
  FOR UPDATE;

  IF NOT FOUND
     OR NOT (
       v_can_delete_all IS TRUE
       OR (
         v_can_delete_own IS TRUE
         AND v_hareket.created_by IS NOT NULL
         AND v_hareket.created_by = v_uid
       )
     ) THEN
    RAISE EXCEPTION 'URUN_HAREKET_V2_NOT_AUTHORIZED'
      USING ERRCODE = '42501';
  END IF;

  IF v_hareket.islem_id IS NOT NULL THEN
    RAISE EXCEPTION 'URUN_HAREKET_V2_LINKED_MOVEMENT'
      USING ERRCODE = '0A000';
  END IF;

  SELECT COALESCE(product.miktar, 0)
  INTO v_urun_miktar
  FROM public.urunler AS product
  WHERE product.id = v_hareket.urun_id
    AND product.isletme_id = p_isletme_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'URUN_HAREKET_V2_NOT_AUTHORIZED'
      USING ERRCODE = '42501';
  END IF;

  v_delta := CASE v_hareket.hareket_tipi
    WHEN 'giris' THEN -pg_catalog.abs(v_hareket.miktar)
    WHEN 'cikis' THEN pg_catalog.abs(v_hareket.miktar)
    ELSE -v_hareket.miktar
  END;

  UPDATE public.urunler AS product
  SET miktar = v_urun_miktar + v_delta,
      updated_at = pg_catalog.clock_timestamp()
  WHERE product.id = v_hareket.urun_id
    AND product.isletme_id = p_isletme_id;

  DELETE FROM public.urun_hareketler AS movement
  WHERE movement.id = p_hareket_id
    AND movement.isletme_id = p_isletme_id;

  RETURN true;
END;
$function$;

ALTER FUNCTION public.create_urun_hareket_atomik_v2(uuid, jsonb)
  OWNER TO postgres;
ALTER FUNCTION public.update_urun_hareket_atomik_v2(uuid, uuid, jsonb)
  OWNER TO postgres;
ALTER FUNCTION public.delete_urun_hareket_atomik_v2(uuid, uuid)
  OWNER TO postgres;

REVOKE ALL
ON FUNCTION public.create_urun_hareket_atomik_v2(uuid, jsonb)
FROM PUBLIC, anon;
REVOKE ALL
ON FUNCTION public.update_urun_hareket_atomik_v2(uuid, uuid, jsonb)
FROM PUBLIC, anon;
REVOKE ALL
ON FUNCTION public.delete_urun_hareket_atomik_v2(uuid, uuid)
FROM PUBLIC, anon;

GRANT EXECUTE
ON FUNCTION public.create_urun_hareket_atomik_v2(uuid, jsonb)
TO authenticated;
GRANT EXECUTE
ON FUNCTION public.update_urun_hareket_atomik_v2(uuid, uuid, jsonb)
TO authenticated;
GRANT EXECUTE
ON FUNCTION public.delete_urun_hareket_atomik_v2(uuid, uuid)
TO authenticated;

COMMENT ON FUNCTION public.create_urun_hareket_atomik_v2(uuid, jsonb) IS
  'Creates a stock movement and applies its stock delta in one transaction.';
COMMENT ON FUNCTION public.update_urun_hareket_atomik_v2(uuid, uuid, jsonb) IS
  'Updates an unlinked stock movement and reapplies its net stock delta atomically.';
COMMENT ON FUNCTION public.delete_urun_hareket_atomik_v2(uuid, uuid) IS
  'Deletes an unlinked stock movement and reverses its stock delta atomically.';
