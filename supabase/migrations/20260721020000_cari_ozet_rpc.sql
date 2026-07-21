-- =============================================================================
-- CARİ ÖZET RPC — cari detay dashboard'u (salt-okunur, ADDITIVE)
-- Tip bazlı ömür-boyu toplamlar: satış/alış/tahsilat/ödeme/iadeler.
-- Ödeme/tahsilat tutarları tahsis_cari_etki ile kur-çevrimli (bakiye matematiğiyle
-- tutarlı); diğer tipler ham tutar (cari para biriminde kayıtlıdır).
-- ESKİ CLIENT: yeni fonksiyonu bilmez → hiçbir yol değişmez, sıfır etki.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.get_cari_ozet(p_isletme_id uuid, p_cari_id uuid)
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
      AND i.cari_id = p_cari_id
      AND i.type IN ('cari_satis','cari_alis','cari_tahsilat','cari_odeme','cari_satis_iade','cari_alis_iade')
    GROUP BY i.type
  ) s;

  RETURN v_result;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_cari_ozet(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_cari_ozet(uuid, uuid) TO authenticated;
