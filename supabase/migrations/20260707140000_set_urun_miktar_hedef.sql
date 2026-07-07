-- DOGRULUK: stok DUZELTME (mutlak hedef) delta'sini BAYAT CACHE yerine DB gercek
-- degerinden hesapla.
--
-- SORUN: QuickUrunBar duzeltme sekmesinde kullanici MUTLAK hedef girer; app
-- delta = hedef - urun.miktar (React Query CACHE) hesaplayip update_urun_miktar'a
-- delta gonderiyordu. Cache bayatsa (baska cihaz/linkli es arada stok degistirmisse)
-- sonuc = gercek_stok + delta != istenen hedef -> stok sessizce yanlisa kayar.
--
-- COZUM: set_urun_miktar_hedef RPC guncel miktari FOR UPDATE ile KILITLEYIP okur,
-- delta'yi DB'de hesaplar, miktari hedefe set eder ve 'duzeltme' hareketini ayni
-- transaction'da yazar. Cache'ten bagimsiz, atomik ve yaris-guvenli. delta=0 ise
-- (hedef zaten guncel) hicbir sey yazmaz.
--
-- ADDITIF: yeni fonksiyon; eski client cagirmaz -> etkilenmez.

CREATE OR REPLACE FUNCTION public.set_urun_miktar_hedef(
  p_isletme_id uuid,
  p_urun_id uuid,
  p_hedef numeric,
  p_created_at timestamptz DEFAULT NULL,
  p_aciklama text DEFAULT NULL
)
RETURNS numeric  -- yeni miktar (uygulandiginda = p_hedef)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_mevcut numeric;
  v_delta numeric;
BEGIN
  IF NOT public.user_has_isletme_access(p_isletme_id) THEN
    RAISE EXCEPTION 'Yetkisiz erisim' USING ERRCODE = '42501';
  END IF;

  IF p_hedef IS NULL OR p_hedef < 0 THEN
    RAISE EXCEPTION 'Gecersiz hedef miktar: %', p_hedef;
  END IF;

  -- Guncel miktari KILITLE (cache degil, DB gercegi)
  SELECT miktar INTO v_mevcut
  FROM urunler
  WHERE id = p_urun_id AND isletme_id = p_isletme_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Urun bulunamadi veya bu isletmeye ait degil (urun_id: %)', p_urun_id;
  END IF;

  v_delta := p_hedef - v_mevcut;

  IF v_delta = 0 THEN
    RETURN v_mevcut;  -- degisiklik yok -> hareket olusturma
  END IF;

  UPDATE urunler SET miktar = p_hedef, updated_at = NOW()
  WHERE id = p_urun_id AND isletme_id = p_isletme_id;

  INSERT INTO urun_hareketler (
    isletme_id, urun_id, islem_id, hareket_tipi, miktar,
    birim_fiyat, kdv_orani, onceki_miktar, yeni_miktar, aciklama, created_at
  ) VALUES (
    p_isletme_id, p_urun_id, NULL, 'duzeltme', v_delta,
    NULL, NULL, v_mevcut, p_hedef, p_aciklama, COALESCE(p_created_at, NOW())
  );

  RETURN p_hedef;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.set_urun_miktar_hedef(uuid, uuid, numeric, timestamptz, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_urun_miktar_hedef(uuid, uuid, numeric, timestamptz, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_urun_miktar_hedef(uuid, uuid, numeric, timestamptz, text) TO authenticated;
