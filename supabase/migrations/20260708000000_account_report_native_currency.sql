-- get_account_report: hesabin KENDİ para biriminde (native) toplam + para birimi dondur.
--
-- SORUN: Eski RPC her tutari TRY'ye cevirip yalniz total_amount (TRY) donuyordu; doviz
-- hesabinda (ornek USD) kullaniciya TL gosteriliyordu. Kullanici hesabin kendi para
-- biriminde (USD) gormek istiyor, altinda ana para birimi (TL) opsiyonel.
--
-- COZUM: RETURNS TABLE'a hesap_currency + total_native (SUM(i.amount), donusumsuz)
-- eklenir. total_amount TRY-donusumlu kalir (hesaplar-arasi kiyaslama/yuzde/siralama
-- icin; farkli para birimleri ortak baza cevrilmeden kiyaslanamaz). Frontend native'i
-- birincil, TRY(base)'i ikincil gosterir.
--
-- RETURNS TABLE degistigi icin CREATE OR REPLACE yetmez -> DROP + CREATE. Guard
-- (capraz-kiraci) ve grant (yalniz authenticated; anon/PUBLIC revoke) korunur.
-- Account report ozelligi HENUZ hicbir yayinlanan build'de yok (yalniz feat branch)
-- -> canli client cagirmiyor, signature degisikligi guvenli. Salt-okuma; veri degismez.

DROP FUNCTION IF EXISTS public.get_account_report(uuid, text[], timestamptz, timestamptz);

CREATE OR REPLACE FUNCTION public.get_account_report(
  p_isletme_id uuid,
  p_types text[],
  p_start_date timestamptz,
  p_end_date timestamptz
)
RETURNS TABLE(
  hesap_id uuid,
  hesap_adi text,
  hesap_type text,
  hesap_currency text,
  islem_count bigint,
  total_amount numeric,   -- TRY'ye cevrilmis (kiyaslama/yuzde icin)
  total_native numeric    -- hesabin kendi para biriminde (donusumsuz)
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Capraz-kiraci guard: cagiran, p_isletme_id'nin SAHIBI ya da AKTIF uyesi olmali.
  IF NOT EXISTS (
    SELECT 1 FROM isletmeler i2 WHERE i2.id = p_isletme_id AND i2.user_id = auth.uid()
  ) AND NOT EXISTS (
    SELECT 1 FROM isletme_users iu
    WHERE iu.isletme_id = p_isletme_id AND iu.user_id = auth.uid() AND iu.status = 'active'
  ) THEN
    RETURN; -- yetkisiz: bos sonuc
  END IF;

  RETURN QUERY
  WITH rates AS (
    SELECT r.rates FROM exchange_rates r WHERE r.base_currency = 'TRY' LIMIT 1
  )
  SELECT
    h.id AS hesap_id,
    h.name::text AS hesap_adi,
    h.type::text AS hesap_type,
    COALESCE(h.currency, 'TRY')::text AS hesap_currency,
    COUNT(i.id) AS islem_count,
    SUM(
      CASE
        WHEN COALESCE(h.currency, 'TRY') = 'TRY' THEN i.amount
        ELSE i.amount * COALESCE((SELECT (rt.rates->>h.currency)::DECIMAL FROM rates rt), 1)
      END
    ) AS total_amount,
    SUM(i.amount) AS total_native
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
  GROUP BY h.id, h.name, h.type, h.currency;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_account_report(uuid, text[], timestamptz, timestamptz) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_account_report(uuid, text[], timestamptz, timestamptz) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_account_report(uuid, text[], timestamptz, timestamptz) TO authenticated;
