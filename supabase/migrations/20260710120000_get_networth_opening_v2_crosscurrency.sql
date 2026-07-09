-- NET-VARLIK TRENDİ — AÇILIŞ RPC v2: ÇAPRAZ-PARA (BUG-1) DÜZELTMESİ
--
-- BUG-1 (KRİTİK, CONFIRMED — Dilruba üretim verisiyle kuruşu kuruşuna doğrulandı):
--   Açılış türetme: opening_e = balance_e − Σ(entity balance-op'ları). computeBalanceOps
--   (src/lib/islemBalanceOps.ts) KARŞI tarafa converted() = calculateTargetAmount(...) yazar,
--   ama v1 RPC çapraz-para KARŞI leglerinde ham i.amount kullanıyordu. Sonuç: 23 Nis 2025
--   147.000 TL → EUR (kur 42) transferi "Nakit Euro"ya +147.000 EUR sayılıp türetilmiş açılış
--   −143.500 EUR = −7.668.295,60 ₺ çöp üretti; 6 adet TRY→XAU altın transferi ve tüm döviz→TRY
--   transferleri de bozuktu.
--
-- FİX: KARŞI leg (transfer hedefi, cari_odeme/tahsilat'ın CARİ bacağı, personel_odeme/tahsilat'ın
--   PERSONEL bacağı) artık calculateTargetAmount'ı BİREBİR aynalayan _nw_convert ile dönüştürülür.
--   HESAP kendi para biriminde ham amount (source leg) DEĞİŞMEDEN kalır (v1'de zaten doğruydu).
--
-- DİKKAT — YÖN: kur formatı "1 yabancı = X TRY" (exchange_rate). Dönüşüm YÖNLÜ:
--   aynı para = amount ; TRY→döviz = amount / rate ; döviz→TRY & döviz→döviz = amount × rate.
--   (Eski denetim planındaki yönsüz "amount × rate" reçetesi YANLIŞTI — 147k→EUR'yu 3.500 yerine
--    6.174.000 EUR yapıp açılışı ~−329M ₺'ye savururdu. Bu fix currency.ts:626-640'ı aynalar.)
--
-- GEÇERSİZ-KUR DEFANSI: çapraz-para bir kayıtta kur NULL/≤0 ise (app tarafı calculateTargetAmount
--   bunu THROW eder → normalde böyle kayıt oluşmaz) _nw_convert NULL döndürür ve çağrı yerindeki
--   COALESCE(..., i.amount) ham amount'a düşer — NULL delta'nın SUM'ı bozup o entity'nin TÜM
--   açılışını sessizce yanlışlamasını engeller. Kiracı-GENELİ guard bu satırların 0 olduğunu doğrular.
--
-- DOĞRULAMA (Dilruba, salt-okuma): türetilmiş açılış = initial_balance testinde hesapların 18/20'si
--   KURUŞU KURUŞUNA oturdu (Nakit Euro −143.500→0, Altın →389,69 XAU). Kasa/Albaraka'da kalan
--   +575.260,68 BUG-1'den BAĞIMSIZ, önceden var olan mutabakat açığıdır (balance ≠ initial+Σops;
--   eski non-atomik silme akışının izi — useIslemler.ts:600-603) — açılışa emilir (doğru davranış:
--   stored balance uygulamanın her yerinde gösterilen gerçektir, trend ona mutabık kalır).
--
-- ADDITİF + SALT-OKUMA; imza korunur (eski client'lara etkisiz — bu RPC'yi yalnız Net Varlık
-- Trendi ekranı çağırır). Migration öncesi `node scripts/backup.js` (alındı).

-- ORTAK DÖNÜŞÜM HELPER'ı: app'teki calculateTargetAmount(amount, rate, src, tgt) gövdesinin
-- SQL aynası. M2 (pl_trend v3) ve M4 (as-of) de bunu kullanır → app/RPC paritesi tek kaynaktan,
-- asla ayrışmaz. Saf/IMMUTABLE (tablo görmez). Geçersiz kurda (NULL/≤0) NULL döner; çağrı yeri
-- COALESCE(..., ham amount) ile yakalar (aynı-para birimi kaydı kur gerektirmez, ilk kolda döner).
CREATE OR REPLACE FUNCTION public._nw_convert(
  p_amount numeric, p_rate numeric, p_src text, p_tgt text
) RETURNS numeric
LANGUAGE sql IMMUTABLE
AS $function$
  SELECT CASE
    WHEN COALESCE(p_src,'TRY') = COALESCE(p_tgt,'TRY') THEN p_amount             -- dönüşüm yok (kur gerekmez)
    WHEN p_rate IS NULL OR p_rate <= 0                 THEN NULL                 -- geçersiz kur → NULL (çağrı yeri COALESCE'ler)
    WHEN COALESCE(p_src,'TRY') = 'TRY'                 THEN round(p_amount / p_rate, 2)  -- TRY→döviz: böl
    ELSE                                                    round(p_amount * p_rate, 2)  -- döviz→TRY & döviz→döviz: çarp
  END
$function$;
REVOKE EXECUTE ON FUNCTION public._nw_convert(numeric, numeric, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public._nw_convert(numeric, numeric, text, text) FROM anon;
GRANT  EXECUTE ON FUNCTION public._nw_convert(numeric, numeric, text, text) TO authenticated;


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
  -- Hesap balance-op toplamı (hesap KENDİ para biriminde → ham amount, DÜZELTME GEREKMEZ).
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
  -- BUG-1 FİX: transfer hedefi KARŞI taraftır → converted (v1: ham SUM(i.amount) idi).
  hesap_delta_target AS (
    SELECT i.hedef_hesap_id AS id,
      SUM(COALESCE(public._nw_convert(i.amount, i.exchange_rate, i.source_currency, i.target_currency), i.amount)) AS d
    FROM islemler i
    WHERE i.isletme_id = p_isletme_id AND i.type = 'transfer' AND i.hedef_hesap_id IS NOT NULL
    GROUP BY i.hedef_hesap_id
  ),
  cari_delta AS (
    SELECT i.cari_id AS id, SUM(CASE i.type
        WHEN 'cari_satis'      THEN i.amount
        WHEN 'cari_alis'       THEN -i.amount
        -- BUG-1 FİX: cari bacağı KARŞI taraftır → converted (v1: ham i.amount idi).
        WHEN 'cari_odeme'      THEN  COALESCE(public._nw_convert(i.amount, i.exchange_rate, i.source_currency, i.target_currency), i.amount)
        WHEN 'cari_tahsilat'   THEN -COALESCE(public._nw_convert(i.amount, i.exchange_rate, i.source_currency, i.target_currency), i.amount)
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
        -- BUG-1 FİX: personel bacağı KARŞI taraftır → converted (v1: ham i.amount idi).
        WHEN 'personel_odeme'    THEN  COALESCE(public._nw_convert(i.amount, i.exchange_rate, i.source_currency, i.target_currency), i.amount)
        WHEN 'personel_tahsilat' THEN -COALESCE(public._nw_convert(i.amount, i.exchange_rate, i.source_currency, i.target_currency), i.amount)
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
