-- GUVENLIK: Rapor/agregat READ RPC'lerine 'raporlar' MODUL gate'i ekle.
--
-- SORUN (izin-sizinti denetimi): get_income_by_source / get_account_report /
-- get_networth_opening_by_month / get_networth_pl_trend SECURITY DEFINER olup RLS'i
-- baypaslar ve YALNIZ uyelik (user_has_isletme_access / owner-OR-member) kontrol ediyordu.
-- Modul bayragina bakmadiklari icin 'raporlar' modulu KAPALI bir uye bunlari dogrudan
-- (PostgREST + kendi JWT'si ile) cagirip kapali-modul verisini okuyabiliyordu:
--   * get_income_by_source: hesap ADI + PERSONEL ADI-SOYADI + ciro (en agir; personel adi
--     aksi halde RLS ile tamamen gizli).
--   * get_account_report: hesap adi/tip/para birimi + ciro.
--   * get_networth_opening/pl_trend: kapali hesap+personel harmanli agregat (buyukluk).
--
-- COZUM: her birine mevcut uyelik guard'inin HEMEN ardina
--   IF NOT public.user_has_module_access(p_isletme_id, 'raporlar') THEN RETURN; END IF;
-- eklenir. (user_has_module_access = 20260716030000; owner OR aktif-uye+modules.raporlar.)
-- Govde AYNEN korunur (canli pg_get_functiondef kaynagindan birebir); yalniz 1 guard satiri.
--
-- MEVCUT KULLANICIYA ETKI YOK: bu RPC'lerin TEK tuketicisi raporlar-gate'li ekranlardir
-- (gelir-gider, hesap/[id], net-varlik-trend). Owner + raporlar-modullu uye gecer; yalniz
-- raporlar KAPALI uyenin dogrudan-RPC cagrisi bos doner. Dashboard bu RPC'leri CAGIRMAZ
-- (get_income_expense_summary DASHBOARD tarafindan kullanildigi icin GATE'LENMEDI).
-- Yetkisizde RETURN (bos tablo) = mevcut membership-red davranisiyla ayni (exception degil).

-- 1) get_income_by_source
CREATE OR REPLACE FUNCTION public.get_income_by_source(
  p_isletme_id uuid,
  p_start_date timestamp with time zone,
  p_end_date timestamp with time zone
)
RETURNS TABLE(source_kind text, source_type text, source_id uuid, source_name text, source_currency text, islem_count bigint, total_amount numeric, total_native numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.user_has_isletme_access(p_isletme_id) THEN RETURN; END IF;
  IF NOT public.user_has_module_access(p_isletme_id, 'raporlar') THEN RETURN; END IF;

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

REVOKE EXECUTE ON FUNCTION public.get_income_by_source(uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_income_by_source(uuid, timestamptz, timestamptz) TO authenticated;

-- 2) get_account_report (guard = inline owner-OR-member EXISTS)
CREATE OR REPLACE FUNCTION public.get_account_report(
  p_isletme_id uuid,
  p_types text[],
  p_start_date timestamp with time zone,
  p_end_date timestamp with time zone
)
RETURNS TABLE(hesap_id uuid, hesap_adi text, hesap_type text, hesap_currency text, islem_count bigint, total_amount numeric, total_native numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM isletmeler i2 WHERE i2.id = p_isletme_id AND i2.user_id = auth.uid()
  ) AND NOT EXISTS (
    SELECT 1 FROM isletme_users iu
    WHERE iu.isletme_id = p_isletme_id AND iu.user_id = auth.uid() AND iu.status = 'active'
  ) THEN
    RETURN;
  END IF;
  IF NOT public.user_has_module_access(p_isletme_id, 'raporlar') THEN RETURN; END IF;

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

REVOKE EXECUTE ON FUNCTION public.get_account_report(uuid, text[], timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_account_report(uuid, text[], timestamptz, timestamptz) TO authenticated;

-- 3) get_networth_opening_by_month
CREATE OR REPLACE FUNCTION public.get_networth_opening_by_month(
  p_isletme_id uuid,
  p_start_date timestamp with time zone,
  p_end_date timestamp with time zone
)
RETURNS TABLE(ay date, opening numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.user_has_isletme_access(p_isletme_id) THEN RETURN; END IF;
  IF NOT public.user_has_module_access(p_isletme_id, 'raporlar') THEN RETURN; END IF;
  RETURN QUERY
  WITH rates AS (SELECT r.rates FROM exchange_rates r WHERE r.base_currency = 'TRY' LIMIT 1),
  hesap_delta AS (
    SELECT i.hesap_id AS id, SUM(CASE i.type WHEN 'gelir' THEN i.amount WHEN 'gider' THEN -i.amount WHEN 'transfer' THEN -i.amount WHEN 'cari_odeme' THEN -i.amount WHEN 'cari_tahsilat' THEN i.amount WHEN 'personel_odeme' THEN -i.amount WHEN 'personel_tahsilat' THEN i.amount ELSE 0 END) AS d
    FROM islemler i WHERE i.isletme_id = p_isletme_id AND i.hesap_id IS NOT NULL GROUP BY i.hesap_id),
  hesap_delta_target AS (
    SELECT i.hedef_hesap_id AS id, SUM(COALESCE(public._nw_convert(i.amount, i.exchange_rate, i.source_currency, i.target_currency), i.amount)) AS d
    FROM islemler i WHERE i.isletme_id = p_isletme_id AND i.type = 'transfer' AND i.hedef_hesap_id IS NOT NULL GROUP BY i.hedef_hesap_id),
  cari_delta AS (
    SELECT i.cari_id AS id, SUM(CASE i.type WHEN 'cari_satis' THEN i.amount WHEN 'cari_alis' THEN -i.amount
        WHEN 'cari_odeme' THEN COALESCE(public._nw_convert(i.amount, i.exchange_rate, i.source_currency, i.target_currency), i.amount)
        WHEN 'cari_tahsilat' THEN -COALESCE(public._nw_convert(i.amount, i.exchange_rate, i.source_currency, i.target_currency), i.amount)
        WHEN 'cari_alis_iade' THEN i.amount WHEN 'cari_satis_iade' THEN -i.amount ELSE 0 END) AS d
    FROM islemler i WHERE i.isletme_id = p_isletme_id AND i.cari_id IS NOT NULL GROUP BY i.cari_id),
  personel_delta AS (
    SELECT i.personel_id AS id, SUM(CASE i.type WHEN 'personel_satis' THEN i.amount WHEN 'personel_gider' THEN -i.amount
        WHEN 'personel_odeme' THEN COALESCE(public._nw_convert(i.amount, i.exchange_rate, i.source_currency, i.target_currency), i.amount)
        WHEN 'personel_tahsilat' THEN -COALESCE(public._nw_convert(i.amount, i.exchange_rate, i.source_currency, i.target_currency), i.amount)
        ELSE 0 END) AS d
    FROM islemler i WHERE i.isletme_id = p_isletme_id AND i.personel_id IS NOT NULL GROUP BY i.personel_id),
  hesap_first AS (
    SELECT id, MIN(dt) AS first_tx FROM (
      SELECT i.hesap_id AS id, i.date AS dt FROM islemler i WHERE i.isletme_id = p_isletme_id AND i.hesap_id IS NOT NULL
      UNION ALL SELECT i.hedef_hesap_id, i.date FROM islemler i WHERE i.isletme_id = p_isletme_id AND i.hedef_hesap_id IS NOT NULL
    ) z GROUP BY id),
  cari_first AS (SELECT i.cari_id AS id, MIN(i.date) AS first_tx FROM islemler i WHERE i.isletme_id = p_isletme_id AND i.cari_id IS NOT NULL GROUP BY i.cari_id),
  personel_first AS (SELECT i.personel_id AS id, MIN(i.date) AS first_tx FROM islemler i WHERE i.isletme_id = p_isletme_id AND i.personel_id IS NOT NULL GROUP BY i.personel_id),
  openings AS (
    SELECT date_trunc('month', LEAST(h.created_at, hf.first_tx))::date AS ay,
      (h.balance - COALESCE(hd.d, 0) - COALESCE(hdt.d, 0)) * CASE WHEN COALESCE(h.currency,'TRY') = 'TRY' THEN 1 ELSE COALESCE((SELECT (rt.rates->>h.currency)::numeric FROM rates rt), 1) END AS opening_try
    FROM hesaplar h LEFT JOIN hesap_delta hd ON hd.id = h.id LEFT JOIN hesap_delta_target hdt ON hdt.id = h.id LEFT JOIN hesap_first hf ON hf.id = h.id
    WHERE h.isletme_id = p_isletme_id AND h.is_active = true AND h.is_archived = false AND NOT (h.type = 'birikim' AND h.balance < 0) AND h.created_at >= p_start_date
    UNION ALL
    SELECT date_trunc('month', LEAST(c.created_at, cf.first_tx))::date,
      (c.balance - COALESCE(cd.d, 0)) * CASE WHEN COALESCE(c.currency,'TRY') = 'TRY' THEN 1 ELSE COALESCE((SELECT (rt.rates->>c.currency)::numeric FROM rates rt), 1) END
    FROM cariler c LEFT JOIN cari_delta cd ON cd.id = c.id LEFT JOIN cari_first cf ON cf.id = c.id
    WHERE c.isletme_id = p_isletme_id AND c.is_active = true AND c.is_archived = false AND c.created_at >= p_start_date
    UNION ALL
    SELECT date_trunc('month', LEAST(pe.created_at, pf.first_tx))::date,
      (pe.balance - COALESCE(pd.d, 0)) * CASE WHEN COALESCE(pe.currency,'TRY') = 'TRY' THEN 1 ELSE COALESCE((SELECT (rt.rates->>pe.currency)::numeric FROM rates rt), 1) END
    FROM personel pe LEFT JOIN personel_delta pd ON pd.id = pe.id LEFT JOIN personel_first pf ON pf.id = pe.id
    WHERE pe.isletme_id = p_isletme_id AND pe.is_active = true AND pe.is_archived = false AND pe.created_at >= p_start_date
  )
  SELECT o.ay, SUM(o.opening_try) AS opening FROM openings o GROUP BY o.ay ORDER BY o.ay;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_networth_opening_by_month(uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_networth_opening_by_month(uuid, timestamptz, timestamptz) TO authenticated;

-- 4) get_networth_pl_trend
CREATE OR REPLACE FUNCTION public.get_networth_pl_trend(
  p_isletme_id uuid,
  p_start_date timestamp with time zone,
  p_end_date timestamp with time zone
)
RETURNS TABLE(ay date, gelir numeric, gider numeric, net numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.user_has_isletme_access(p_isletme_id) THEN RETURN; END IF;
  IF NOT public.user_has_module_access(p_isletme_id, 'raporlar') THEN RETURN; END IF;
  RETURN QUERY
  WITH rt AS (SELECT r.rates FROM exchange_rates r WHERE r.base_currency = 'TRY' LIMIT 1),
  tx AS (
    SELECT date_trunc('month', i.date)::date AS ay, GREATEST(nd.net_delta, 0) AS income_try, GREATEST(-nd.net_delta, 0) AS expense_try
    FROM islemler i
    LEFT JOIN hesaplar h ON i.hesap_id = h.id
    LEFT JOIN hesaplar hh ON i.hedef_hesap_id = hh.id
    LEFT JOIN cariler c ON i.cari_id = c.id
    LEFT JOIN personel pe ON i.personel_id = pe.id
    CROSS JOIN LATERAL (SELECT
      (h.id IS NOT NULL AND h.is_active AND NOT h.is_archived AND NOT (h.type = 'birikim' AND h.balance < 0)) AS h_incl,
      (hh.id IS NOT NULL AND hh.is_active AND NOT hh.is_archived AND NOT (hh.type = 'birikim' AND hh.balance < 0)) AS hh_incl,
      (c.id IS NOT NULL AND c.is_active AND NOT c.is_archived) AS c_incl,
      (pe.id IS NOT NULL AND pe.is_active AND NOT pe.is_archived) AS pe_incl) f
    CROSS JOIN LATERAL (SELECT
      CASE WHEN COALESCE(h.currency,'TRY') = 'TRY' THEN 1 ELSE COALESCE((SELECT (rt.rates->>h.currency)::numeric FROM rt), 1) END AS rate_h,
      CASE WHEN COALESCE(hh.currency,'TRY') = 'TRY' THEN 1 ELSE COALESCE((SELECT (rt.rates->>hh.currency)::numeric FROM rt), 1) END AS rate_hh,
      CASE WHEN COALESCE(c.currency,'TRY') = 'TRY' THEN 1 ELSE COALESCE((SELECT (rt.rates->>c.currency)::numeric FROM rt), 1) END AS rate_c,
      CASE WHEN COALESCE(pe.currency,'TRY') = 'TRY' THEN 1 ELSE COALESCE((SELECT (rt.rates->>pe.currency)::numeric FROM rt), 1) END AS rate_pe) rr
    CROSS JOIN LATERAL (SELECT COALESCE(public._nw_convert(i.amount, i.exchange_rate, i.source_currency, i.target_currency), i.amount) AS conv) cv
    CROSS JOIN LATERAL (SELECT CASE i.type
        WHEN 'gelir' THEN CASE WHEN f.h_incl THEN i.amount * rr.rate_h ELSE 0 END
        WHEN 'gider' THEN CASE WHEN f.h_incl THEN -i.amount * rr.rate_h ELSE 0 END
        WHEN 'cari_satis' THEN CASE WHEN f.c_incl THEN i.amount * rr.rate_c ELSE 0 END
        WHEN 'cari_alis' THEN CASE WHEN f.c_incl THEN -i.amount * rr.rate_c ELSE 0 END
        WHEN 'cari_satis_iade' THEN CASE WHEN f.c_incl THEN -i.amount * rr.rate_c ELSE 0 END
        WHEN 'cari_alis_iade' THEN CASE WHEN f.c_incl THEN i.amount * rr.rate_c ELSE 0 END
        WHEN 'personel_satis' THEN CASE WHEN f.pe_incl THEN i.amount * rr.rate_pe ELSE 0 END
        WHEN 'personel_gider' THEN CASE WHEN f.pe_incl THEN -i.amount * rr.rate_pe ELSE 0 END
        WHEN 'cari_odeme' THEN (CASE WHEN f.h_incl THEN -i.amount * rr.rate_h ELSE 0 END) + (CASE WHEN f.c_incl THEN cv.conv * rr.rate_c ELSE 0 END)
        WHEN 'cari_tahsilat' THEN (CASE WHEN f.h_incl THEN i.amount * rr.rate_h ELSE 0 END) + (CASE WHEN f.c_incl THEN -cv.conv * rr.rate_c ELSE 0 END)
        WHEN 'personel_odeme' THEN (CASE WHEN f.h_incl THEN -i.amount * rr.rate_h ELSE 0 END) + (CASE WHEN f.pe_incl THEN cv.conv * rr.rate_pe ELSE 0 END)
        WHEN 'personel_tahsilat' THEN (CASE WHEN f.h_incl THEN i.amount * rr.rate_h ELSE 0 END) + (CASE WHEN f.pe_incl THEN -cv.conv * rr.rate_pe ELSE 0 END)
        WHEN 'transfer' THEN (CASE WHEN f.h_incl THEN -i.amount * rr.rate_h ELSE 0 END) + (CASE WHEN f.hh_incl THEN cv.conv * rr.rate_hh ELSE 0 END)
        ELSE 0 END AS net_delta) nd
    WHERE i.isletme_id = p_isletme_id AND i.date >= p_start_date AND i.date <= p_end_date
      AND i.type IN ('gelir','gider','cari_satis','cari_alis','cari_satis_iade','cari_alis_iade','personel_satis','personel_gider','cari_odeme','cari_tahsilat','personel_odeme','personel_tahsilat','transfer')
  )
  SELECT tx.ay, COALESCE(SUM(tx.income_try), 0) AS gelir, COALESCE(SUM(tx.expense_try), 0) AS gider,
    COALESCE(SUM(tx.income_try), 0) - COALESCE(SUM(tx.expense_try), 0) AS net
  FROM tx GROUP BY tx.ay ORDER BY tx.ay;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_networth_pl_trend(uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_networth_pl_trend(uuid, timestamptz, timestamptz) TO authenticated;
