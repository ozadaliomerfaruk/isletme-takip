-- get_income_by_source: müşteri satışlarından İADEYİ (cari_satis_iade) düş → NET.
--
-- İade aslında gelir değil, satışın ters kaydı → o müşterinin gelirinden düşülmeli.
-- cari dalı artık cari_satis (+) ile cari_satis_iade (−) toplar. hesap (gelir) ve
-- personel (personel_satis) tarafında gelir iadesi tipi yok → değişmez.
-- CREATE OR REPLACE (aynı signature); guard + authenticated-only korunur.

CREATE OR REPLACE FUNCTION public.get_income_by_source(
  p_isletme_id uuid,
  p_start_date timestamptz,
  p_end_date timestamptz
)
RETURNS TABLE(
  source_kind text, source_type text, source_id uuid, source_name text,
  source_currency text, islem_count bigint, total_amount numeric, total_native numeric
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.user_has_isletme_access(p_isletme_id) THEN RETURN; END IF;

  RETURN QUERY
  WITH rates AS (SELECT r.rates FROM exchange_rates r WHERE r.base_currency = 'TRY' LIMIT 1),
  hesap_gelir AS (
    SELECT 'hesap'::text, h.type::text, h.id, h.name::text, COALESCE(h.currency,'TRY')::text,
      COUNT(i.id),
      SUM(CASE WHEN COALESCE(h.currency,'TRY')='TRY' THEN i.amount ELSE i.amount * COALESCE((SELECT (rt.rates->>h.currency)::DECIMAL FROM rates rt),1) END),
      SUM(i.amount)
    FROM islemler i INNER JOIN hesaplar h ON i.hesap_id = h.id
    WHERE i.isletme_id = p_isletme_id AND i.type = 'gelir'
      AND i.date >= p_start_date AND i.date <= p_end_date AND h.is_active = true
    GROUP BY h.id, h.type, h.name, h.currency
  ),
  cari_gelir AS (
    SELECT 'cari'::text, 'cari'::text, c.id, c.name::text, COALESCE(c.currency,'TRY')::text,
      COUNT(i.id),
      SUM((CASE WHEN COALESCE(c.currency,'TRY')='TRY' THEN i.amount ELSE i.amount * COALESCE((SELECT (rt.rates->>c.currency)::DECIMAL FROM rates rt),1) END)
          * CASE WHEN i.type='cari_satis_iade' THEN -1 ELSE 1 END),
      SUM(i.amount * CASE WHEN i.type='cari_satis_iade' THEN -1 ELSE 1 END)
    FROM islemler i INNER JOIN cariler c ON i.cari_id = c.id
    WHERE i.isletme_id = p_isletme_id AND i.type IN ('cari_satis','cari_satis_iade')
      AND i.date >= p_start_date AND i.date <= p_end_date AND c.is_active IS NOT FALSE
    GROUP BY c.id, c.name, c.currency
  ),
  personel_gelir AS (
    SELECT 'personel'::text, 'personel'::text, p.id,
      TRIM(BOTH ' ' FROM COALESCE(p.first_name,'') || ' ' || COALESCE(p.last_name,''))::text,
      COALESCE(p.currency,'TRY')::text, COUNT(i.id),
      SUM(CASE WHEN COALESCE(p.currency,'TRY')='TRY' THEN i.amount ELSE i.amount * COALESCE((SELECT (rt.rates->>p.currency)::DECIMAL FROM rates rt),1) END),
      SUM(i.amount)
    FROM islemler i INNER JOIN personel p ON i.personel_id = p.id
    WHERE i.isletme_id = p_isletme_id AND i.type = 'personel_satis'
      AND i.date >= p_start_date AND i.date <= p_end_date AND p.is_active IS NOT FALSE
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
