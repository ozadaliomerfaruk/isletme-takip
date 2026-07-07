-- GELİR KAYNAK RAPORU: geliri KAYNAĞINA göre grupla — hesaba düşen gelir (gelir) +
-- kredili müşteri satışları (cari_satis) + personel satışları (personel_satis).
--
-- NEDEN: get_account_report yalnız BİR HESABA DÜŞEN geliri (gelir tipi) gösterir;
-- hesabı olmayan cari_satis / personel_satis DIŞLANIR → gelir EKSİK görünür. Bu RPC
-- üç kaynağı birleştirir:
--   - hesap  : type='gelir', hesaba göre (banka/nakit/kredi kartı...)
--   - cari   : type='cari_satis', müşteriye göre
--   - personel: type='personel_satis', personele göre
-- (Tipler ayrık → çift sayım YOK.) Her kaynak KENDİ para biriminde native toplam +
-- TRY'ye çevrilmiş toplam (yüzde/sıralama/kıyaslama için) döner.
--
-- ADDITIF: yeni salt-okuma fonksiyon; çapraz-kiracı guard'lı; yalnız authenticated.

CREATE OR REPLACE FUNCTION public.get_income_by_source(
  p_isletme_id uuid,
  p_start_date timestamptz,
  p_end_date timestamptz
)
RETURNS TABLE(
  source_kind text,      -- 'hesap' | 'cari' | 'personel'
  source_type text,      -- hesap.type (banka/nakit/...) ya da 'cari' / 'personel'
  source_id uuid,
  source_name text,
  source_currency text,
  islem_count bigint,
  total_amount numeric,  -- TRY'ye çevrilmiş
  total_native numeric   -- kaynağın kendi para biriminde
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.user_has_isletme_access(p_isletme_id) THEN
    RETURN; -- yetkisiz: boş sonuç
  END IF;

  RETURN QUERY
  WITH rates AS (
    SELECT r.rates FROM exchange_rates r WHERE r.base_currency = 'TRY' LIMIT 1
  ),
  -- 1) Hesaba düşen gelir (type='gelir')
  hesap_gelir AS (
    SELECT
      'hesap'::text AS source_kind,
      h.type::text AS source_type,
      h.id AS source_id,
      h.name::text AS source_name,
      COALESCE(h.currency, 'TRY')::text AS source_currency,
      COUNT(i.id) AS islem_count,
      SUM(CASE WHEN COALESCE(h.currency,'TRY')='TRY' THEN i.amount
               ELSE i.amount * COALESCE((SELECT (rt.rates->>h.currency)::DECIMAL FROM rates rt),1) END) AS total_amount,
      SUM(i.amount) AS total_native
    FROM islemler i
    INNER JOIN hesaplar h ON i.hesap_id = h.id
    WHERE i.isletme_id = p_isletme_id
      AND i.type = 'gelir'
      AND i.date >= p_start_date AND i.date <= p_end_date
      AND h.is_active = true
    GROUP BY h.id, h.type, h.name, h.currency
  ),
  -- 2) Müşteri (kredili) satışları (type='cari_satis')
  cari_gelir AS (
    SELECT
      'cari'::text AS source_kind,
      'cari'::text AS source_type,
      c.id AS source_id,
      c.name::text AS source_name,
      COALESCE(c.currency, 'TRY')::text AS source_currency,
      COUNT(i.id) AS islem_count,
      SUM(CASE WHEN COALESCE(c.currency,'TRY')='TRY' THEN i.amount
               ELSE i.amount * COALESCE((SELECT (rt.rates->>c.currency)::DECIMAL FROM rates rt),1) END) AS total_amount,
      SUM(i.amount) AS total_native
    FROM islemler i
    INNER JOIN cariler c ON i.cari_id = c.id
    WHERE i.isletme_id = p_isletme_id
      AND i.type = 'cari_satis'
      AND i.date >= p_start_date AND i.date <= p_end_date
      AND c.is_active IS NOT FALSE
    GROUP BY c.id, c.name, c.currency
  ),
  -- 3) Personel satışları (type='personel_satis')
  personel_gelir AS (
    SELECT
      'personel'::text AS source_kind,
      'personel'::text AS source_type,
      p.id AS source_id,
      TRIM(BOTH ' ' FROM COALESCE(p.first_name,'') || ' ' || COALESCE(p.last_name,''))::text AS source_name,
      COALESCE(p.currency, 'TRY')::text AS source_currency,
      COUNT(i.id) AS islem_count,
      SUM(CASE WHEN COALESCE(p.currency,'TRY')='TRY' THEN i.amount
               ELSE i.amount * COALESCE((SELECT (rt.rates->>p.currency)::DECIMAL FROM rates rt),1) END) AS total_amount,
      SUM(i.amount) AS total_native
    FROM islemler i
    INNER JOIN personel p ON i.personel_id = p.id
    WHERE i.isletme_id = p_isletme_id
      AND i.type = 'personel_satis'
      AND i.date >= p_start_date AND i.date <= p_end_date
      AND p.is_active IS NOT FALSE
    GROUP BY p.id, p.first_name, p.last_name, p.currency
  )
  SELECT * FROM hesap_gelir
  UNION ALL SELECT * FROM cari_gelir
  UNION ALL SELECT * FROM personel_gelir;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_income_by_source(uuid, timestamptz, timestamptz) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_income_by_source(uuid, timestamptz, timestamptz) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_income_by_source(uuid, timestamptz, timestamptz) TO authenticated;
