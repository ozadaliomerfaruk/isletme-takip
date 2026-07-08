-- AYLIK NET-VARLIK TREND: her ay için gelir/gider/net (P&L akışı) döner.
--
-- NEDEN P&L: Net varlık (genel durum = varlıklar + alacaklar − borçlar) YALNIZCA gelir ve
-- giderle değişir; tahsilat/ödeme/transfer net-sıfırdır (parayı kasa↔alacak/borç arası taşır).
-- Kanıt (computeBalanceOps tip-tip): NW_delta(ay) = gelir(ay) − gider(ay). Bu yüzden aylık
-- net varlık, client'ta canlı generalStatus'a demirlenip bu P&L akışıyla geriye yürütülür:
--   NW_ay_sonu(M) = generalStatus − Σ net(M'den SONRAKİ aylar).  (Son ay = generalStatus.)
--
-- ADDITİF + SALT-OKUMA: yeni fonksiyon; mevcut tablolara/fonksiyonlara DOKUNMAZ; çapraz-kiracı
-- guard'lı; yalnız authenticated. Para birimi entity'nin kendi currency'sinden güncel kurla
-- TRY'ye çevrilir (get_income_by_source ile birebir; islemler'de kur kolonu YOK).

CREATE OR REPLACE FUNCTION public.get_networth_pl_trend(
  p_isletme_id uuid,
  p_start_date timestamptz,
  p_end_date   timestamptz
)
RETURNS TABLE(
  ay date,          -- ayın ilk günü (date_trunc month)
  gelir numeric,    -- TRY, iade net'lenmiş
  gider numeric,    -- TRY, iade net'lenmiş
  net numeric       -- gelir − gider
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.user_has_isletme_access(p_isletme_id) THEN
    RETURN; -- yetkisiz: boş sonuç (RAISE değil — varlık sızdırmaz)
  END IF;

  RETURN QUERY
  WITH rates AS (
    SELECT r.rates FROM exchange_rates r WHERE r.base_currency = 'TRY' LIMIT 1
  ),
  tx AS (
    SELECT
      date_trunc('month', i.date)::date AS ay,
      i.type,
      -- Tutar, işlemin bağlı olduğu entity'nin para biriminde tutulur; güncel kurla TRY'ye çevir.
      i.amount * CASE
        WHEN COALESCE(cur.currency, 'TRY') = 'TRY' THEN 1
        ELSE COALESCE((SELECT (rt.rates->>cur.currency)::numeric FROM rates rt), 1)
      END AS try_amount
    FROM islemler i
    LEFT JOIN hesaplar h  ON i.hesap_id = h.id
    LEFT JOIN hesaplar hh ON i.hedef_hesap_id = hh.id
    LEFT JOIN cariler  c  ON i.cari_id = c.id
    LEFT JOIN personel pe ON i.personel_id = pe.id
    CROSS JOIN LATERAL (
      SELECT CASE
        WHEN i.type IN ('gelir', 'gider')                                        THEN COALESCE(h.currency, 'TRY')
        WHEN i.type IN ('cari_satis', 'cari_alis', 'cari_satis_iade', 'cari_alis_iade') THEN COALESCE(c.currency, 'TRY')
        WHEN i.type IN ('personel_satis', 'personel_gider')                      THEN COALESCE(pe.currency, 'TRY')
        ELSE 'TRY'
      END AS currency
    ) cur
    WHERE i.isletme_id = p_isletme_id
      AND i.date >= p_start_date AND i.date <= p_end_date
      -- ÖNEMLİ: Anchor (generalStatus, useFinancialSummary) yalnız AKTİF + ARŞİVSİZ
      -- hesap/cari/personel bakiyelerini içerir. P&L de AYNI entity'leri filtrelemeli;
      -- yoksa sonradan pasifleştirilen/arşivlenen bir cari/personel'in geçmiş P&L'i
      -- anchor'dan düşer ama trendde kalır → geçmiş eğride sahte çukur/tepe oluşur.
      AND (h.id  IS NULL OR (h.is_active = true AND h.is_archived = false))
      AND (hh.id IS NULL OR (hh.is_active = true AND hh.is_archived = false))
      AND (c.id  IS NULL OR (c.is_active = true AND c.is_archived = false))
      AND (pe.id IS NULL OR (pe.is_active = true AND pe.is_archived = false))
      AND i.type IN (
        'gelir', 'cari_satis', 'personel_satis',
        'gider', 'cari_alis', 'personel_gider',
        'cari_satis_iade', 'cari_alis_iade'
      )
  )
  SELECT
    tx.ay,
    COALESCE(SUM(tx.try_amount) FILTER (WHERE tx.type IN ('gelir', 'cari_satis', 'personel_satis')), 0)
      - COALESCE(SUM(tx.try_amount) FILTER (WHERE tx.type = 'cari_satis_iade'), 0) AS gelir,
    COALESCE(SUM(tx.try_amount) FILTER (WHERE tx.type IN ('gider', 'cari_alis', 'personel_gider')), 0)
      - COALESCE(SUM(tx.try_amount) FILTER (WHERE tx.type = 'cari_alis_iade'), 0) AS gider,
    (
      COALESCE(SUM(tx.try_amount) FILTER (WHERE tx.type IN ('gelir', 'cari_satis', 'personel_satis')), 0)
      - COALESCE(SUM(tx.try_amount) FILTER (WHERE tx.type = 'cari_satis_iade'), 0)
    ) - (
      COALESCE(SUM(tx.try_amount) FILTER (WHERE tx.type IN ('gider', 'cari_alis', 'personel_gider')), 0)
      - COALESCE(SUM(tx.try_amount) FILTER (WHERE tx.type = 'cari_alis_iade'), 0)
    ) AS net
  FROM tx
  GROUP BY tx.ay
  ORDER BY tx.ay;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_networth_pl_trend(uuid, timestamptz, timestamptz) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_networth_pl_trend(uuid, timestamptz, timestamptz) FROM anon;
GRANT  EXECUTE ON FUNCTION public.get_networth_pl_trend(uuid, timestamptz, timestamptz) TO authenticated;
