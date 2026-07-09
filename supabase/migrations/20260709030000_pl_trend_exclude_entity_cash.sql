-- get_networth_pl_trend v2: DAHİL hesap ↔ HARİÇ (pasif/arşiv) cari/personel/hesap arası
-- NAKİT hareketlerini net-varlık değişimi olarak doğru aya yaz.
--
-- SORUN: Bir cariye/personele ödeme (cari_odeme/personel_odeme) yapıp sonra onu PASİF yaparsan:
-- nakit (aktif hesaptan) gerçekten çıktı → genel duruma dahil; ama cari tarafı (pasif) hariç.
-- Eski RPC cari_odeme/tahsilat/transfer'i hiç saymadığı için bu nakit hiçbir aya düşmüyor,
-- reconstruction ile canlı genel-durum arasında SABİT kayma bırakıyordu (trend'de yanlış baseline).
--
-- ÇÖZÜM: Net-varlık değişimi = SADECE DAHİL edilen (is_active AND NOT is_archived) hesap/cari/
-- personel bakiyelerinin değişimi. Değeri dahil-kümeden çıkaran/sokan nakit hareketleri sayılır:
--   cari_odeme/personel_odeme  (dahil hesap → HARİÇ cari/personel)  = gider (net varlık düşer)
--   cari_tahsilat/personel_tahsilat (HARİÇ cari/personel → dahil hesap) = gelir
--   transfer (dahil hesap → HARİÇ hesap) = gider ; (HARİÇ hesap → dahil hesap) = gelir
-- DAHİL entity'ler arası nakit (ör. aktif cariye ödeme, iki aktif hesap transferi) NET-SIFIR
-- (iki taraf da genel durumda) → sayılmaz. P&L (gelir/gider/cari_alis/satis/iade/personel) davranışı
-- eskisiyle AYNI (yalnız dahil entity'lerde). Yalnız TREND raporu bu fonksiyonu kullanır.

CREATE OR REPLACE FUNCTION public.get_networth_pl_trend(
  p_isletme_id uuid, p_start_date timestamptz, p_end_date timestamptz
)
RETURNS TABLE(ay date, gelir numeric, gider numeric, net numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.user_has_isletme_access(p_isletme_id) THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH rates AS (
    SELECT r.rates FROM exchange_rates r WHERE r.base_currency = 'TRY' LIMIT 1
  ),
  tx AS (
    SELECT
      date_trunc('month', i.date)::date AS ay,
      inc.income_try,
      inc.expense_try
    FROM islemler i
    LEFT JOIN hesaplar h  ON i.hesap_id = h.id
    LEFT JOIN hesaplar hh ON i.hedef_hesap_id = hh.id
    LEFT JOIN cariler  c  ON i.cari_id = c.id
    LEFT JOIN personel pe ON i.personel_id = pe.id
    CROSS JOIN LATERAL (
      SELECT
        (h.id  IS NOT NULL AND h.is_active  AND NOT h.is_archived)  AS h_incl,
        (hh.id IS NOT NULL AND hh.is_active AND NOT hh.is_archived) AS hh_incl,
        (c.id  IS NOT NULL AND c.is_active  AND NOT c.is_archived)  AS c_incl,
        (pe.id IS NOT NULL AND pe.is_active AND NOT pe.is_archived) AS pe_incl,
        (hh.id IS NOT NULL AND (NOT hh.is_active OR hh.is_archived)) AS hh_excl,
        (h.id  IS NOT NULL AND (NOT h.is_active OR h.is_archived))   AS h_excl,
        (c.id  IS NOT NULL AND (NOT c.is_active OR c.is_archived))   AS c_excl,
        (pe.id IS NOT NULL AND (NOT pe.is_active OR pe.is_archived)) AS pe_excl,
        (h.id  IS NULL OR (h.is_active  AND NOT h.is_archived))      AS h_ok,
        (c.id  IS NULL OR (c.is_active  AND NOT c.is_archived))      AS c_ok,
        (pe.id IS NULL OR (pe.is_active AND NOT pe.is_archived))     AS pe_ok
    ) f
    CROSS JOIN LATERAL (
      SELECT CASE
        WHEN i.type IN ('gelir','gider')                                             THEN COALESCE(h.currency,'TRY')
        WHEN i.type IN ('cari_satis','cari_alis','cari_satis_iade','cari_alis_iade') THEN COALESCE(c.currency,'TRY')
        WHEN i.type IN ('personel_satis','personel_gider')                           THEN COALESCE(pe.currency,'TRY')
        WHEN i.type IN ('cari_odeme','cari_tahsilat','personel_odeme','personel_tahsilat') THEN COALESCE(h.currency,'TRY')
        WHEN i.type = 'transfer' THEN COALESCE(CASE WHEN f.h_incl THEN h.currency ELSE hh.currency END,'TRY')
        ELSE 'TRY'
      END AS ccy
    ) curx
    CROSS JOIN LATERAL (
      SELECT i.amount * CASE WHEN curx.ccy = 'TRY' THEN 1
        ELSE COALESCE((SELECT (rt.rates->>curx.ccy)::numeric FROM rates rt), 1) END AS try_amt
    ) amt
    CROSS JOIN LATERAL (
      SELECT
        CASE
          WHEN i.type IN ('gelir','cari_satis','personel_satis') AND f.h_ok AND f.c_ok AND f.pe_ok THEN amt.try_amt
          WHEN i.type = 'cari_satis_iade'   AND f.c_incl                 THEN -amt.try_amt
          WHEN i.type = 'cari_tahsilat'     AND f.h_incl AND f.c_excl    THEN amt.try_amt
          WHEN i.type = 'personel_tahsilat' AND f.h_incl AND f.pe_excl   THEN amt.try_amt
          WHEN i.type = 'transfer'          AND f.hh_incl AND f.h_excl   THEN amt.try_amt
          ELSE 0
        END AS income_try,
        CASE
          WHEN i.type IN ('gider','cari_alis','personel_gider') AND f.h_ok AND f.c_ok AND f.pe_ok THEN amt.try_amt
          WHEN i.type = 'cari_alis_iade'    AND f.c_incl                 THEN -amt.try_amt
          WHEN i.type = 'cari_odeme'        AND f.h_incl AND f.c_excl    THEN amt.try_amt
          WHEN i.type = 'personel_odeme'    AND f.h_incl AND f.pe_excl   THEN amt.try_amt
          WHEN i.type = 'transfer'          AND f.h_incl AND f.hh_excl   THEN amt.try_amt
          ELSE 0
        END AS expense_try
    ) inc
    WHERE i.isletme_id = p_isletme_id
      AND i.date >= p_start_date AND i.date <= p_end_date
      AND i.type IN (
        'gelir','gider','cari_satis','cari_alis','cari_satis_iade','cari_alis_iade',
        'personel_satis','personel_gider',
        'cari_odeme','cari_tahsilat','personel_odeme','personel_tahsilat','transfer'
      )
  )
  SELECT
    tx.ay,
    COALESCE(SUM(tx.income_try), 0)  AS gelir,
    COALESCE(SUM(tx.expense_try), 0) AS gider,
    COALESCE(SUM(tx.income_try), 0) - COALESCE(SUM(tx.expense_try), 0) AS net
  FROM tx
  GROUP BY tx.ay
  ORDER BY tx.ay;
END;
$function$;
