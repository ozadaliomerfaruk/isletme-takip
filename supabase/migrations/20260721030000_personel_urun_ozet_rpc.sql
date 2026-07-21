-- =============================================================================
-- PERSONEL + ÜRÜN ÖZET RPC'leri — detay dashboard kartları (salt-okunur, ADDITIVE)
-- get_cari_ozet (20260721020000) deseninin personel ve ürün karşılıkları.
-- ESKİ CLIENT: yeni fonksiyonları bilmez → hiçbir yol değişmez, sıfır etki.
-- =============================================================================

-- Personel: tip bazlı ömür-boyu PARA toplamları (izin türleri gün sayısı tuttuğu
-- için bilinçli HARİÇ). Kur çevrimi tahsis_cari_etki (personel tiplerinde ham).
CREATE OR REPLACE FUNCTION public.get_personel_ozet(p_isletme_id uuid, p_personel_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
STABLE
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT public.user_has_isletme_access(p_isletme_id) THEN
    RAISE EXCEPTION 'Yetkisiz erisim' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(
    jsonb_object_agg(s.type, jsonb_build_object('toplam', s.toplam, 'adet', s.adet)),
    '{}'::jsonb
  )
  INTO v_result
  FROM (
    SELECT i.type,
           round(SUM(public.tahsis_cari_etki(
             i.type, i.amount, i.exchange_rate, i.source_currency, i.target_currency
           )), 2) AS toplam,
           COUNT(*) AS adet
    FROM islemler i
    WHERE i.isletme_id = p_isletme_id
      AND i.personel_id = p_personel_id
      AND i.type IN ('personel_gider','personel_odeme','personel_satis','personel_tahsilat')
    GROUP BY i.type
  ) s;

  RETURN v_result;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_personel_ozet(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_personel_ozet(uuid, uuid) TO authenticated;

-- Ürün: hareketler (hareket_tipi × işlem tipi) kırılımında miktar + KDV-hariç
-- tutar toplamları. Aile netleştirmesi (alış−alış iadesi vb) CLIENT'ta
-- urunHareketYon helper'ı ile yapılır — TS'teki kurallar tek kaynak kalır.
CREATE OR REPLACE FUNCTION public.get_urun_ozet(p_isletme_id uuid, p_urun_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
STABLE
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT public.user_has_isletme_access(p_isletme_id) THEN
    RAISE EXCEPTION 'Yetkisiz erisim' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(jsonb_agg(s), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT uh.hareket_tipi,
           i.type AS islem_type,
           round(SUM(uh.miktar)::numeric, 3) AS miktar,
           round(SUM(uh.miktar * COALESCE(uh.birim_fiyat, 0)), 2) AS tutar
    FROM urun_hareketler uh
    LEFT JOIN islemler i ON i.id = uh.islem_id
    WHERE uh.isletme_id = p_isletme_id
      AND uh.urun_id = p_urun_id
    GROUP BY uh.hareket_tipi, i.type
  ) s;

  RETURN v_result;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_urun_ozet(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_urun_ozet(uuid, uuid) TO authenticated;
