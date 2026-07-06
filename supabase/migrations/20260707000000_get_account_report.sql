-- Hesap bazlı gelir/gider raporu (get_category_report'un hesaba göre aynası).
-- ADDİTİF: yeni salt-okunur fonksiyon; hiçbir tabloya/mevcut fonksiyona dokunmaz.
-- GÜVENLİK: eski rapor RPC'lerinin aksine çapraz-kiracı guard'ı içerir
--   (çağıran, p_isletme_id'nin SAHİBİ ya da AKTİF üyesi olmalı).
-- Not: yalnız BİR HESABA DÜŞEN işlemler gruplanır (hesaba INNER JOIN); kredili
-- satış (cari_satis, hesabı yok) burada görünmez — hangi hesaba düştüğü söylenemez.
CREATE OR REPLACE FUNCTION public.get_account_report(
  p_isletme_id uuid,
  p_types text[],
  p_start_date timestamptz,
  p_end_date timestamptz
)
RETURNS TABLE(hesap_id uuid, hesap_adi text, hesap_type text, islem_count bigint, total_amount numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM isletmeler i2 WHERE i2.id = p_isletme_id AND i2.user_id = auth.uid()
  ) AND NOT EXISTS (
    SELECT 1 FROM isletme_users iu
    WHERE iu.isletme_id = p_isletme_id AND iu.user_id = auth.uid() AND iu.status = 'active'
  ) THEN
    RETURN; -- yetkisiz: boş sonuç
  END IF;

  RETURN QUERY
  WITH rates AS (
    SELECT r.rates FROM exchange_rates r WHERE r.base_currency = 'TRY' LIMIT 1
  )
  SELECT
    h.id AS hesap_id,
    h.name::text AS hesap_adi,
    h.type::text AS hesap_type,
    COUNT(i.id) AS islem_count,
    SUM(
      CASE
        WHEN COALESCE(h.currency, 'TRY') = 'TRY' THEN i.amount
        ELSE i.amount * COALESCE((SELECT (rt.rates->>h.currency)::DECIMAL FROM rates rt), 1)
      END
    ) AS total_amount
  FROM islemler i
  INNER JOIN hesaplar h ON i.hesap_id = h.id
  LEFT JOIN cariler c ON i.cari_id = c.id
  LEFT JOIN personel p ON i.personel_id = p.id
  WHERE i.isletme_id = p_isletme_id
    AND i.type = ANY(p_types)
    AND i.date >= p_start_date
    AND i.date <= p_end_date
    AND h.is_active = true
    AND (c.id IS NULL OR c.is_active IS NOT FALSE)
    AND (p.id IS NULL OR p.is_active IS NOT FALSE)
  GROUP BY h.id, h.name, h.type;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_account_report(uuid, text[], timestamptz, timestamptz) TO authenticated;
