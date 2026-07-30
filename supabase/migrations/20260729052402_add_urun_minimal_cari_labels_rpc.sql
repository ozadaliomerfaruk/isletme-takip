-- Canli migration surumu: 20260729052402
-- C9: Ürün modülü açık, Cariler modülü kapalı ortak kullanıcı ürün
-- hareketinde yalnız bağlı cari adını görebilsin.
--
-- Additive only: tablo/kolon/veri değişmez. Mevcut istemciler etkilenmez.

CREATE FUNCTION public.get_urun_hareket_minimal_cari_labels(
  p_isletme_id uuid,
  p_urun_id uuid
)
RETURNS TABLE (
  urun_hareket_id uuid,
  cari_name text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_is_owner boolean := false;
  v_can_see_archived boolean := false;
  v_member_permissions jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'Bu işlemi yapmaya yetkiniz yok.';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.isletmeler AS b
    WHERE b.id = p_isletme_id
      AND b.user_id = auth.uid()
  )
  INTO v_is_owner;

  IF NOT v_is_owner THEN
    SELECT iu.permissions
    INTO v_member_permissions
    FROM public.isletme_users AS iu
    WHERE iu.isletme_id = p_isletme_id
      AND iu.user_id = auth.uid()
      AND iu.status = 'active'
    LIMIT 1;

    IF v_member_permissions IS NULL
       OR NOT COALESCE(
         v_member_permissions->'modules'->'urunler'
           = 'true'::pg_catalog.jsonb,
         false
       )
       OR NOT (
         v_member_permissions->>'level' IS NULL
         OR v_member_permissions->>'level' IN (
           'view',
           'add',
           'edit_own',
           'edit_all'
         )
       ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '42501',
        MESSAGE = 'Bu işlemi yapmaya yetkiniz yok.';
    END IF;

    v_can_see_archived := COALESCE(
      v_member_permissions->'visibility'->'can_see_archived'
        = 'true'::pg_catalog.jsonb,
      false
    );
  END IF;

  RETURN QUERY
  SELECT
    uh.id AS urun_hareket_id,
    c.name::text AS cari_name
  FROM public.urun_hareketler AS uh
  JOIN public.urunler AS u
    ON u.id = uh.urun_id
   AND u.isletme_id = p_isletme_id
  JOIN public.islemler AS i
    ON i.id = uh.islem_id
   AND i.isletme_id = p_isletme_id
  JOIN public.cariler AS c
    ON c.id = i.cari_id
   AND c.isletme_id = p_isletme_id
  WHERE uh.isletme_id = p_isletme_id
    AND uh.urun_id = p_urun_id
    AND (
      v_is_owner
      OR v_can_see_archived
      OR u.is_archived IS FALSE
    )
  ORDER BY uh.created_at DESC, uh.id;
END;
$function$;

ALTER FUNCTION public.get_urun_hareket_minimal_cari_labels(uuid, uuid)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_urun_hareket_minimal_cari_labels(uuid, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_urun_hareket_minimal_cari_labels(uuid, uuid)
  TO authenticated;

COMMENT ON FUNCTION public.get_urun_hareket_minimal_cari_labels(uuid, uuid) IS
  'Returns only product-movement id and linked cari display name for authenticated users with Ürünler module access and matching archive visibility.';
