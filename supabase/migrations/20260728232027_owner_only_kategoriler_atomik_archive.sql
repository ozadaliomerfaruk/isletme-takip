-- S-09: Kategori yonetimi yalnizca isletme sahibine aittir.
--
-- Bu migration yalnizca yeni RLS politikalari ve yeni bir RPC ekler:
--   * tablo/kolon silmez veya yeniden adlandirmaz,
--   * mevcut kategori ya da islem satirlarini degistirmez,
--   * shared kullanicilarin aktif kategori adlarini secicilerde okumasini korur.
--
-- Mevcut legacy shared write politikalari permissive'dir. Onlari DROP etmek yerine
-- owner kosulunu RESTRICTIVE politikalarla AND'liyoruz. Boylece eski owner
-- istemcilerinin dogrudan INSERT/UPDATE akisi calismaya devam ederken, eski shared
-- action JSON alanlari artik kategori yazma yetkisi veremez.

CREATE POLICY "Category writes require owner - insert"
ON public.kategoriler
AS RESTRICTIVE
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.isletmeler i
    WHERE i.id = kategoriler.isletme_id
      AND i.user_id = (SELECT auth.uid())
  )
);

CREATE POLICY "Category writes require owner - update"
ON public.kategoriler
AS RESTRICTIVE
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.isletmeler i
    WHERE i.id = kategoriler.isletme_id
      AND i.user_id = (SELECT auth.uid())
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.isletmeler i
    WHERE i.id = kategoriler.isletme_id
      AND i.user_id = (SELECT auth.uid())
  )
);

CREATE POLICY "Category writes require owner - delete"
ON public.kategoriler
AS RESTRICTIVE
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.isletmeler i
    WHERE i.id = kategoriler.isletme_id
      AND i.user_id = (SELECT auth.uid())
  )
);

-- Mevcut istemci kategori "silme" islemini soft-delete (is_active=false) olarak
-- yapiyor. Baglari dort ayri istekle temizlemek kismi basari riski tasiyordu.
-- Bu fonksiyon ayni davranisi tek Postgres transaction'i icinde gerceklestirir.
CREATE OR REPLACE FUNCTION public.archive_kategori_atomik(
  p_isletme_id uuid,
  p_kategori_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_is_active boolean;
BEGIN
  IF p_isletme_id IS NULL OR p_kategori_id IS NULL THEN
    RAISE EXCEPTION 'CATEGORY_ARGUMENT_REQUIRED'
      USING ERRCODE = '22023';
  END IF;

  IF v_user_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.isletmeler i
    WHERE i.id = p_isletme_id
      AND i.user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'CATEGORY_OWNER_ONLY'
      USING ERRCODE = '42501';
  END IF;

  -- Hedef kategori tenant kapsaminda kilitlenir. Ayni kategori icin iki eszamanli
  -- arsivleme birbirinin kontrolleri ile bag temizligini yaristiramaz.
  SELECT k.is_active
  INTO v_is_active
  FROM public.kategoriler k
  WHERE k.id = p_kategori_id
    AND k.isletme_id = p_isletme_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CATEGORY_NOT_FOUND'
      USING ERRCODE = 'P0002';
  END IF;

  -- Tekrar cagrilabilir: zaten pasif bir kategoriye yeniden dokunulmaz.
  IF v_is_active IS NOT TRUE THEN
    RETURN;
  END IF;

  -- Eski istemci sozlesmesi korunur: herhangi bir gercek islem veya aktif
  -- (pending/notified) ileri tarihli islem bagliysa kategori arsivlenmez.
  IF EXISTS (
    SELECT 1
    FROM public.islemler i
    WHERE i.kategori_id = p_kategori_id
      AND i.isletme_id = p_isletme_id
  ) OR EXISTS (
    SELECT 1
    FROM public.ileri_tarihli_islemler ii
    WHERE ii.kategori_id = p_kategori_id
      AND ii.isletme_id = p_isletme_id
      AND ii.status IN ('pending', 'notified')
  ) THEN
    RAISE EXCEPTION 'CATEGORY_HAS_TRANSACTIONS'
      USING ERRCODE = '23503';
  END IF;

  -- Urunler silinmez; yalniz kategori bagi kaldirilir.
  UPDATE public.urunler u
  SET kategori_id = NULL
  WHERE u.kategori_id = p_kategori_id
    AND u.isletme_id = p_isletme_id;

  -- Alt kategoriler silinmez; ana kategori seviyesine tasinir.
  UPDATE public.kategoriler child
  SET parent_id = NULL
  WHERE child.parent_id = p_kategori_id
    AND child.isletme_id = p_isletme_id;

  -- Rapor eslemeleri silinmez; yalniz pasif hedefe giden baglar temizlenir.
  UPDATE public.kategoriler source
  SET mapped_gelir_kategori_id = NULL
  WHERE source.mapped_gelir_kategori_id = p_kategori_id
    AND source.isletme_id = p_isletme_id;

  UPDATE public.kategoriler source
  SET mapped_gider_kategori_id = NULL
  WHERE source.mapped_gider_kategori_id = p_kategori_id
    AND source.isletme_id = p_isletme_id;

  -- Fiziksel DELETE yoktur. Kategori gecmis kayitlar icin tabloda kalir.
  UPDATE public.kategoriler k
  SET is_active = false
  WHERE k.id = p_kategori_id
    AND k.isletme_id = p_isletme_id
    AND k.is_active IS TRUE;
END;
$function$;

REVOKE ALL
ON FUNCTION public.archive_kategori_atomik(uuid, uuid)
FROM PUBLIC, anon;

GRANT EXECUTE
ON FUNCTION public.archive_kategori_atomik(uuid, uuid)
TO authenticated;

COMMENT ON FUNCTION public.archive_kategori_atomik(uuid, uuid) IS
  'Owner-only atomik kategori soft-archive; islemleri silmez, urun/child/mapping baglarini temizler.';

-- Eski istemci etkisi:
--   * Owner: dogrudan kategori ekleme/duzenleme/soft-delete calismaya devam eder.
--   * Shared: legacy action JSON true olsa bile kategori satiri degismez.
--     INSERT acik RLS hatasi verir; UPDATE/DELETE 0-row donebilir.
--   * Shared SELECT: degismez; aktif kategori ad/renkleri secicilerde gorunur.
--   * Migration uygulandigi anda hicbir mevcut satir degismez.
--
-- Bilinen eski-client siniri:
--   Eski shared build kategori pasiflestirmeden ONCE urunler.kategori_id baglarini
--   ayri bir HTTP istegiyle bosaltiyordu. Urun update yetkisi de varsa o ilk istek
--   tamamlanip kategori UPDATE'i burada reddedilebilir. Yeni client bu zinciri tek
--   RPC'ye tasir; eski binary'nin ayri transaction'larini server geriye donuk
--   olarak tek transaction yapamaz. Bu nedenle yayin/kabul notunda eski build
--   riski acik tutulur.
