-- Cari işlem-satırı KALAN'ı: her fatura/borç işleminin (cari_alis/cari_satis) NET-mahsuplu
-- kalanı. _vade_birim_mahsuplu ile AYNI ilke (balance=gerçek kaynak, TBK en-yeni-vadeden
-- geriye) ama VADELİ filtresi YOK — plansız faturalar da dahil. Etkin tarih = COALESCE(vade,
-- işlem günü). Böylece işlem listesinde her faturanın satırında "Kalan: X" gösterilebilir;
-- ödeme satırlarındaki kafa-karıştıran "Mahsup" kalkar. Ödenen/kapanan fatura 0 → hiç yazı.
-- Salt-okunur/STABLE, additive. Vade YÜZEYLERİNE dokunmaz (onlar dated-only kalır).
CREATE OR REPLACE FUNCTION public.get_cari_islem_kalan(p_isletme_id uuid, p_cari_id uuid)
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

  WITH inv AS (
    SELECT
      i.id AS islem_id,
      i.type::text AS type,
      COALESCE(i.vade_tarihi, i.date::date) AS eff_date,
      round(i.amount - COALESCE((
        SELECT SUM(t.tutar) FROM islem_tahsis t WHERE t.borc_islem_id = i.id
      ), 0), 2) AS raw_kalan,
      GREATEST(0, -c.balance) AS net_borc,     -- balance<0 = biz borçluyuz
      GREATEST(0,  c.balance) AS net_alacak    -- balance>0 = onlar bize borçlu
    FROM islemler i
    JOIN cariler c ON c.id = i.cari_id
    WHERE i.isletme_id = p_isletme_id
      AND i.cari_id = p_cari_id
      AND i.type IN ('cari_alis', 'cari_satis')
  ),
  recon AS (
    SELECT inv.*,
      (CASE WHEN type = 'cari_alis' THEN net_borc ELSE net_alacak END) AS net_dir,
      SUM(raw_kalan) OVER (
        PARTITION BY type ORDER BY eff_date DESC, islem_id DESC
      ) AS cum_incl
    FROM inv
  )
  SELECT COALESCE(
    jsonb_object_agg(islem_id::text, net_kalan) FILTER (WHERE net_kalan > 0.009),
    '{}'::jsonb
  ) INTO v_result
  FROM (
    SELECT islem_id,
      GREATEST(0, LEAST(raw_kalan, net_dir - (cum_incl - raw_kalan)))::numeric AS net_kalan
    FROM recon
  ) x;

  RETURN v_result;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_cari_islem_kalan(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_cari_islem_kalan(uuid, uuid) TO authenticated;
