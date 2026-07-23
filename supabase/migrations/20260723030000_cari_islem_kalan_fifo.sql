-- get_cari_islem_kalan DÜZELTME: işlem-satırı KALAN'ı artık SAF FIFO (işlem tarihine göre,
-- eski→yeni ödenir). Önceki sürüm vade+UUID sırasıyla ve ham-FIFO-defteri kalanıyla
-- dağıtıyordu → aynı günkü faturalarda rastgele/kısmi anlamsız değerler (kullanıcı bulgusu:
-- 3.650 kalan yok, 32k → 19.150, 35k → 26.500 hayalet artış).
--
-- YENİ MODEL (kullanıcının zihinsel modeli): net borç, faturalara İŞLEM TARİHİ DESC ile
-- dağıtılır — en YENİ faturalar dolu kalanı taşır, net tükenince en ESKİ faturalar 0'a düşer
-- (ödeme eski→yeni mahsup). Tavan = faturanın KENDİ tutarı (islem_tahsis'e bakmaz → temiz,
-- öngörülebilir; tek "kısmi" satır sınır faturasıdır). Ödeme yapılınca net azalır → en eski
-- açık fatura kapanır. Salt-okunur/STABLE. Vade yüzeyleri (dated-only) ayrı kalır.
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
      i.amount,
      i.date AS tx_date,
      i.created_at,
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
      -- İşlem tarihi DESC: en YENİ fatura ilk (dolu kalanı taşır); en eski en sonda (net
      -- tükenince 0). created_at + islem_id ikincil anahtar → aynı-an faturalarda kararlı.
      SUM(amount) OVER (
        PARTITION BY type ORDER BY tx_date DESC, created_at DESC, islem_id DESC
      ) AS cum_incl
    FROM inv
  )
  SELECT COALESCE(
    jsonb_object_agg(islem_id::text, net_kalan) FILTER (WHERE net_kalan > 0.009),
    '{}'::jsonb
  ) INTO v_result
  FROM (
    SELECT islem_id,
      GREATEST(0, LEAST(amount, net_dir - (cum_incl - amount)))::numeric AS net_kalan
    FROM recon
  ) x;

  RETURN v_result;
END;
$function$;
