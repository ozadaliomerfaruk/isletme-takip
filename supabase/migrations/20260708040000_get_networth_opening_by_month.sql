-- NET-VARLIK TRENDİ — AÇILIŞ BAKİYELERİNİ OLUŞTURULDUĞU AYA BAĞLA (created_at).
--
-- SORUN: Açılış bakiyesi bir İŞLEM değil, doğrudan balance'a yazılıyor ve TARİHİ yok.
-- Trend'de "en baştan beri vardı" sayıldığından, bugün eklenen bir cari'nin açılış borcu
-- geçmişe (2 yıl öncesine) düz yansıyordu. ÇÖZÜM (Option A): her entity'nin açılışını,
-- o entity'nin created_at AYINA ata; client walk-back'te "ay M'den SONRA oluşturulan
-- entity'lerin açılışı" M ayından düşülür → o entity yokken açılışı sayılmaz.
--
-- AÇILIŞ TÜRETME: opening_e = balance_e − Σ(entity'nin balance-op'ları). Balance-op'lar
-- computeBalanceOps (src/lib/islemBalanceOps.ts) ile BİREBİR; çapraz-para converted() legleri
-- burada amount ile alınır (aynı-para birimi = kesin; çapraz-para nadir + zaten kur dipnotlu).
-- Sonra entity'nin currency'sinden güncel kurla TRY'ye çevrilir.
--
-- ADDITİF + SALT-OKUMA; çapraz-kiracı guard'lı; yalnız authenticated. Aktif+arşivsiz entity
-- (generalStatus anchor ile aynı küme). Yalnız pencere içinde (created_at >= start) oluşturulan
-- entity'ler döner; pencereden önce oluşanlar zaten tüm aylarda baseline'dır (client düşmez).

CREATE OR REPLACE FUNCTION public.get_networth_opening_by_month(
  p_isletme_id uuid,
  p_start_date timestamptz,
  p_end_date   timestamptz
)
RETURNS TABLE(
  ay date,        -- entity'nin created_at ayı
  opening numeric -- o ay oluşturulan entity'lerin açılış NW katkısı (TRY)
)
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
  -- Hesap balance-op toplamı (hesap kendi para biriminde). transfer kaynağı burada,
  -- transfer hedefi ayrı CTE'de (+amount).
  hesap_delta AS (
    SELECT i.hesap_id AS id, SUM(CASE i.type
        WHEN 'gelir'             THEN i.amount
        WHEN 'gider'             THEN -i.amount
        WHEN 'transfer'          THEN -i.amount
        WHEN 'cari_odeme'        THEN -i.amount
        WHEN 'cari_tahsilat'     THEN i.amount
        WHEN 'personel_odeme'    THEN -i.amount
        WHEN 'personel_tahsilat' THEN i.amount
        ELSE 0 END) AS d
    FROM islemler i
    WHERE i.isletme_id = p_isletme_id AND i.hesap_id IS NOT NULL
    GROUP BY i.hesap_id
  ),
  hesap_delta_target AS (
    SELECT i.hedef_hesap_id AS id, SUM(i.amount) AS d
    FROM islemler i
    WHERE i.isletme_id = p_isletme_id AND i.type = 'transfer' AND i.hedef_hesap_id IS NOT NULL
    GROUP BY i.hedef_hesap_id
  ),
  cari_delta AS (
    SELECT i.cari_id AS id, SUM(CASE i.type
        WHEN 'cari_satis'      THEN i.amount
        WHEN 'cari_alis'       THEN -i.amount
        WHEN 'cari_odeme'      THEN i.amount
        WHEN 'cari_tahsilat'   THEN -i.amount
        WHEN 'cari_alis_iade'  THEN i.amount
        WHEN 'cari_satis_iade' THEN -i.amount
        ELSE 0 END) AS d
    FROM islemler i
    WHERE i.isletme_id = p_isletme_id AND i.cari_id IS NOT NULL
    GROUP BY i.cari_id
  ),
  personel_delta AS (
    SELECT i.personel_id AS id, SUM(CASE i.type
        WHEN 'personel_satis'    THEN i.amount
        WHEN 'personel_gider'    THEN -i.amount
        WHEN 'personel_odeme'    THEN i.amount
        WHEN 'personel_tahsilat' THEN -i.amount
        ELSE 0 END) AS d
    FROM islemler i
    WHERE i.isletme_id = p_isletme_id AND i.personel_id IS NOT NULL
    GROUP BY i.personel_id
  ),
  openings AS (
    -- HESAP açılışları
    SELECT date_trunc('month', h.created_at)::date AS ay,
      (h.balance - COALESCE(hd.d, 0) - COALESCE(hdt.d, 0))
        * CASE WHEN COALESCE(h.currency,'TRY') = 'TRY' THEN 1
               ELSE COALESCE((SELECT (rt.rates->>h.currency)::numeric FROM rates rt), 1) END AS opening_try
    FROM hesaplar h
    LEFT JOIN hesap_delta hd  ON hd.id  = h.id
    LEFT JOIN hesap_delta_target hdt ON hdt.id = h.id
    WHERE h.isletme_id = p_isletme_id AND h.is_active = true AND h.is_archived = false
      AND h.created_at >= p_start_date
    UNION ALL
    -- CARİ açılışları
    SELECT date_trunc('month', c.created_at)::date,
      (c.balance - COALESCE(cd.d, 0))
        * CASE WHEN COALESCE(c.currency,'TRY') = 'TRY' THEN 1
               ELSE COALESCE((SELECT (rt.rates->>c.currency)::numeric FROM rates rt), 1) END
    FROM cariler c
    LEFT JOIN cari_delta cd ON cd.id = c.id
    WHERE c.isletme_id = p_isletme_id AND c.is_active = true AND c.is_archived = false
      AND c.created_at >= p_start_date
    UNION ALL
    -- PERSONEL açılışları
    SELECT date_trunc('month', pe.created_at)::date,
      (pe.balance - COALESCE(pd.d, 0))
        * CASE WHEN COALESCE(pe.currency,'TRY') = 'TRY' THEN 1
               ELSE COALESCE((SELECT (rt.rates->>pe.currency)::numeric FROM rates rt), 1) END
    FROM personel pe
    LEFT JOIN personel_delta pd ON pd.id = pe.id
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
