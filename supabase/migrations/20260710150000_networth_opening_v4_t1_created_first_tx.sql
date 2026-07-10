-- NET-VARLIK TRENDİ — AÇILIŞ RPC v4: T1 (açılış ayı = ilk-hareket ayı)
--
-- T1 (tasarım kusuru, retro-import kullanıcısında görünür): v1-v3'te açılış, entity'nin
--   created_at AYINA atanıyordu. Geriye dönük import'ta TÜM entity'ler aynı gün (Dilruba: 19 Şub
--   2026) oluşturulduğundan tüm açılışlar Şub'26'ya yığılıyor, geçmiş aylar boş görünüyordu.
-- FİX: açılış ayı = date_trunc('month', LEAST(created_at, entity'nin İLK İŞLEM tarihi)). Böylece
--   açılış, entity'nin gerçekten aktif olduğu ilk aya düşer. İşlemsiz entity'de first_tx NULL →
--   LEAST NULL'ı yok sayar → created_at (davranış korunur).
--
-- HESAP first_tx: hesap_id VE hedef_hesap_id (bir hesabın ilk hareketi transfer HEDEFİ olabilir).
--
-- DEĞİŞMEZLER: opening DEĞERLERİ ve Σopening AYNI (yalnız hangi aya düştüğü değişir) → crit-1
--   özdeşliği (Σopening+Σnet=generalStatus) ETKİLENMEZ. BUG-1 (çapraz-para _nw_convert) ve T3
--   (negatif birikim hariç) v3'ten AYNEN korunur. Pencere-öncesi aya düşen açılışları client zaten
--   baseline sayar (useNetWorthTrend.ts:146-149 yalnız pencere aylarını arar) → 12-ay ve Tümü doğru.
--
-- DOĞRULAMA (Dilruba, salt-okuma): Σopening=234.472,28 (sabit); Albaraka açılışı(+213.616)→Oca'22,
--   Kasa(+379.727)→May'22; beklenen Oca'22 trend = 350+213.616 ≈ ₺213.966.
-- ADDITİF; imza korunur; yalnız Net Varlık Trendi çağırır. net RPC (get_networth_pl_trend) değişmez.

CREATE OR REPLACE FUNCTION public.get_networth_opening_by_month(
  p_isletme_id uuid,
  p_start_date timestamptz,
  p_end_date   timestamptz
)
RETURNS TABLE(ay date, opening numeric)
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
  hesap_delta AS (
    SELECT i.hesap_id AS id, SUM(CASE i.type
        WHEN 'gelir' THEN i.amount WHEN 'gider' THEN -i.amount WHEN 'transfer' THEN -i.amount
        WHEN 'cari_odeme' THEN -i.amount WHEN 'cari_tahsilat' THEN i.amount
        WHEN 'personel_odeme' THEN -i.amount WHEN 'personel_tahsilat' THEN i.amount ELSE 0 END) AS d
    FROM islemler i WHERE i.isletme_id = p_isletme_id AND i.hesap_id IS NOT NULL GROUP BY i.hesap_id
  ),
  hesap_delta_target AS (
    SELECT i.hedef_hesap_id AS id,
      SUM(COALESCE(public._nw_convert(i.amount, i.exchange_rate, i.source_currency, i.target_currency), i.amount)) AS d
    FROM islemler i WHERE i.isletme_id = p_isletme_id AND i.type = 'transfer' AND i.hedef_hesap_id IS NOT NULL GROUP BY i.hedef_hesap_id
  ),
  cari_delta AS (
    SELECT i.cari_id AS id, SUM(CASE i.type
        WHEN 'cari_satis' THEN i.amount WHEN 'cari_alis' THEN -i.amount
        WHEN 'cari_odeme' THEN  COALESCE(public._nw_convert(i.amount, i.exchange_rate, i.source_currency, i.target_currency), i.amount)
        WHEN 'cari_tahsilat' THEN -COALESCE(public._nw_convert(i.amount, i.exchange_rate, i.source_currency, i.target_currency), i.amount)
        WHEN 'cari_alis_iade' THEN i.amount WHEN 'cari_satis_iade' THEN -i.amount ELSE 0 END) AS d
    FROM islemler i WHERE i.isletme_id = p_isletme_id AND i.cari_id IS NOT NULL GROUP BY i.cari_id
  ),
  personel_delta AS (
    SELECT i.personel_id AS id, SUM(CASE i.type
        WHEN 'personel_satis' THEN i.amount WHEN 'personel_gider' THEN -i.amount
        WHEN 'personel_odeme' THEN  COALESCE(public._nw_convert(i.amount, i.exchange_rate, i.source_currency, i.target_currency), i.amount)
        WHEN 'personel_tahsilat' THEN -COALESCE(public._nw_convert(i.amount, i.exchange_rate, i.source_currency, i.target_currency), i.amount)
        ELSE 0 END) AS d
    FROM islemler i WHERE i.isletme_id = p_isletme_id AND i.personel_id IS NOT NULL GROUP BY i.personel_id
  ),
  -- T1: entity ilk-hareket ayı. HESAP için hesap_id VE hedef_hesap_id.
  hesap_first AS (
    SELECT id, MIN(dt) AS first_tx FROM (
      SELECT i.hesap_id AS id, i.date AS dt FROM islemler i WHERE i.isletme_id = p_isletme_id AND i.hesap_id IS NOT NULL
      UNION ALL
      SELECT i.hedef_hesap_id, i.date FROM islemler i WHERE i.isletme_id = p_isletme_id AND i.hedef_hesap_id IS NOT NULL
    ) z GROUP BY id
  ),
  cari_first AS (
    SELECT i.cari_id AS id, MIN(i.date) AS first_tx FROM islemler i WHERE i.isletme_id = p_isletme_id AND i.cari_id IS NOT NULL GROUP BY i.cari_id
  ),
  personel_first AS (
    SELECT i.personel_id AS id, MIN(i.date) AS first_tx FROM islemler i WHERE i.isletme_id = p_isletme_id AND i.personel_id IS NOT NULL GROUP BY i.personel_id
  ),
  openings AS (
    -- HESAP açılışları — ay = LEAST(created_at, ilk hareket)
    SELECT date_trunc('month', LEAST(h.created_at, hf.first_tx))::date AS ay,
      (h.balance - COALESCE(hd.d, 0) - COALESCE(hdt.d, 0))
        * CASE WHEN COALESCE(h.currency,'TRY') = 'TRY' THEN 1
               ELSE COALESCE((SELECT (rt.rates->>h.currency)::numeric FROM rates rt), 1) END AS opening_try
    FROM hesaplar h
    LEFT JOIN hesap_delta hd  ON hd.id  = h.id
    LEFT JOIN hesap_delta_target hdt ON hdt.id = h.id
    LEFT JOIN hesap_first hf ON hf.id = h.id
    WHERE h.isletme_id = p_isletme_id AND h.is_active = true AND h.is_archived = false
      AND NOT (h.type = 'birikim' AND h.balance < 0)
      AND h.created_at >= p_start_date
    UNION ALL
    SELECT date_trunc('month', LEAST(c.created_at, cf.first_tx))::date,
      (c.balance - COALESCE(cd.d, 0))
        * CASE WHEN COALESCE(c.currency,'TRY') = 'TRY' THEN 1
               ELSE COALESCE((SELECT (rt.rates->>c.currency)::numeric FROM rates rt), 1) END
    FROM cariler c
    LEFT JOIN cari_delta cd ON cd.id = c.id
    LEFT JOIN cari_first cf ON cf.id = c.id
    WHERE c.isletme_id = p_isletme_id AND c.is_active = true AND c.is_archived = false
      AND c.created_at >= p_start_date
    UNION ALL
    SELECT date_trunc('month', LEAST(pe.created_at, pf.first_tx))::date,
      (pe.balance - COALESCE(pd.d, 0))
        * CASE WHEN COALESCE(pe.currency,'TRY') = 'TRY' THEN 1
               ELSE COALESCE((SELECT (rt.rates->>pe.currency)::numeric FROM rates rt), 1) END
    FROM personel pe
    LEFT JOIN personel_delta pd ON pd.id = pe.id
    LEFT JOIN personel_first pf ON pf.id = pe.id
    WHERE pe.isletme_id = p_isletme_id AND pe.is_active = true AND pe.is_archived = false
      AND pe.created_at >= p_start_date
  )
  SELECT o.ay, SUM(o.opening_try) AS opening
  FROM openings o
  GROUP BY o.ay
  ORDER BY o.ay;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_networth_opening_by_month(uuid, timestamptz, timestamptz) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_networth_opening_by_month(uuid, timestamptz, timestamptz) FROM anon;
GRANT  EXECUTE ON FUNCTION public.get_networth_opening_by_month(uuid, timestamptz, timestamptz) TO authenticated;
