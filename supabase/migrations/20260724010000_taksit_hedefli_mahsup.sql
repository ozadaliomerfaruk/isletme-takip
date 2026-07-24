-- =============================================================================
-- TAKSİT AŞAMA 2 — FATURA-HEDEFLİ MAHSUP (iki-aşama, pointer-tabanlı)
-- =============================================================================
-- İLKE: niyeti sakla (islemler.hedef_islem_id), TUTARI asla. Tutar hep bakiyeden
-- türer; pointer yalnız okuma-anı mahsup SIRASINI etkiler → Σ = |bakiye| korunur.
--
-- İKİ-AŞAMA (_vade_birim_mahsuplu):
--   1) targeted(I)  = o faturaya hedefli ödemelerin CARİ-PARA (bakiye-etki) tutarı toplamı
--                     — çapraz-kurda çevrilmiş (calculateTargetAmount = balance ile aynı).
--   2) absorbed(I)  = LEAST(fatura_toplam, targeted)  (taşan → FIFO havuzu)
--   3) tr(u)        = absorbed'i fatura İÇİNDE vade ASC doldur (erken taksit önce kapanır)
--   4) cap(u)       = birim(u) − tr(u)
--   5) real_kalan   = kalan net'i cap'ler üzerinden COALESCE(vade,tx_date) DESC FIFO
--
-- Σ ispatı: Σcap = G − Σabsorbed ; net_dir = G − P ; Σabsorbed ≤ Σtargeted ≤ P (çevrim
-- bakiyeyle aynı) → net_dir ≤ Σcap → FIFO tam net_dir korur → Σ real_kalan = |bakiye|.
--
-- Salt-okunur/STABLE. Yayılım otomatik: get_cari_islem_kalan/get_taksit_plan_listesi/
-- get_cari_taksit_kalan hepsi bunu SUM/filter eder.
-- =============================================================================

DROP FUNCTION IF EXISTS public._vade_birim_mahsuplu(uuid, uuid);

CREATE FUNCTION public._vade_birim_mahsuplu(p_isletme_id uuid, p_cari_id uuid DEFAULT NULL)
RETURNS TABLE (
  cari_id uuid, islem_id uuid, taksit_id uuid, type text, description text,
  cari_name text, currency text, taksit_sira integer, taksit_toplam integer,
  vade date, real_kalan numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH pay_target AS (
    -- Hedefli ödeme/tahsilatların faturaya sayılacak CARİ-PARA tutarı (çapraz-kurda çevrilmiş).
    SELECT p.hedef_islem_id AS islem_id,
      SUM(
        CASE
          WHEN p.source_currency IS NULL OR p.target_currency IS NULL
               OR p.source_currency = p.target_currency OR COALESCE(p.exchange_rate,0) <= 0
            THEN p.amount
          WHEN p.source_currency = 'TRY' THEN p.amount / p.exchange_rate   -- TRY→yabancı
          WHEN p.target_currency = 'TRY' THEN p.amount * p.exchange_rate   -- yabancı→TRY
          ELSE p.amount * p.exchange_rate                                  -- iki-yabancı (nadir; kaynak→TRY)
        END
      ) AS targeted
    FROM islemler p
    WHERE p.isletme_id = p_isletme_id
      AND p.hedef_islem_id IS NOT NULL
      AND p.type IN ('cari_odeme', 'cari_tahsilat')
      AND (p_cari_id IS NULL OR p.cari_id = p_cari_id)
    GROUP BY p.hedef_islem_id
  ),
  birim AS (
    SELECT
      i.cari_id, i.id AS islem_id, tk.id AS taksit_id, i.type::text AS type,
      i.description, c.name AS cari_name, COALESCE(c.currency, 'TRY') AS currency,
      tk.sira AS taksit_sira,
      CASE WHEN tk.id IS NOT NULL
        THEN (SELECT COUNT(*)::integer FROM taksitler t2 WHERE t2.islem_id = i.id)
        ELSE NULL END AS taksit_toplam,
      COALESCE(tk.vade_tarihi, i.vade_tarihi) AS vade,
      i.date AS tx_date, i.created_at,
      COALESCE(tk.tutar, i.amount) AS birim_tutar,
      i.amount AS inv_total,                                  -- fatura toplam (taksit için Σtaksit = amount)
      COALESCE((SELECT targeted FROM pay_target pt WHERE pt.islem_id = i.id), 0) AS targeted,
      GREATEST(0, -c.balance) AS net_borc,
      GREATEST(0,  c.balance) AS net_alacak
    FROM islemler i
    JOIN cariler c ON c.id = i.cari_id
    LEFT JOIN taksitler tk ON tk.islem_id = i.id AND tk.isletme_id = i.isletme_id
    WHERE i.isletme_id = p_isletme_id
      AND i.cari_id IS NOT NULL
      AND i.type IN ('cari_satis', 'cari_alis')
      AND (p_cari_id IS NULL OR i.cari_id = p_cari_id)
  ),
  tr_cte AS (
    SELECT b.*,
      LEAST(b.inv_total, b.targeted) AS absorbed_inv,
      -- Fatura İÇİNDE vade ASC birikimli tutar → hedefli emme erken-vadeliden dolar.
      SUM(b.birim_tutar) OVER (
        PARTITION BY b.islem_id ORDER BY b.vade ASC NULLS LAST, b.taksit_id ASC
      ) AS cum_asc
    FROM birim b
  ),
  capped AS (
    SELECT t.*,
      -- Bu birime düşen hedefli emme + hedefli-sonrası kapasite.
      GREATEST(0, LEAST(t.birim_tutar, t.absorbed_inv - (t.cum_asc - t.birim_tutar))) AS tr
    FROM tr_cte t
  ),
  recon AS (
    SELECT c.*,
      (c.birim_tutar - c.tr) AS cap,
      (CASE WHEN c.type = 'cari_alis' THEN c.net_borc ELSE c.net_alacak END) AS net_dir,
      -- Kalan net'i cap'ler üzerinden en-erken-vade önce kapanacak şekilde FIFO.
      SUM(c.birim_tutar - c.tr) OVER (
        PARTITION BY c.cari_id, c.type
        ORDER BY COALESCE(c.vade, c.tx_date) DESC NULLS LAST,
                 c.tx_date DESC, c.created_at DESC, c.islem_id DESC, c.taksit_id DESC
      ) AS cum_cap
    FROM capped c
  )
  SELECT
    cari_id, islem_id, taksit_id, type, description, cari_name, currency,
    taksit_sira, taksit_toplam, vade,
    GREATEST(0, LEAST(cap, net_dir - (cum_cap - cap)))::numeric AS real_kalan
  FROM recon;
$function$;

REVOKE EXECUTE ON FUNCTION public._vade_birim_mahsuplu(uuid, uuid) FROM PUBLIC, anon, authenticated;
