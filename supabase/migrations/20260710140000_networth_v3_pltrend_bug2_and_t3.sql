-- NET-VARLIK TRENDİ — v3: BUG-2 (leg-etki modeli) + T3 (birikim anchor-simetrisi)
--
-- BUG-2 (KRİTİK, CONFIRMED): get_networth_pl_trend v2 (pl_trend_exclude_entity_cash) yalnız
--   "DAHİL hesap ↔ HARİÇ cari/personel" yönündeki nakit hareketini sayıyordu; TERS yön
--   ("HARİÇ hesaptan DAHİL cariye ödeme = dahil cari bakiyesi artar = GELİR" vb.) hiçbir CASE'e
--   düşmüyordu → geçmiş ~+7,31M şişik (Dilruba). Kök neden: tip×kombinasyon kural listesi eksik
--   simetrik kurallara açık.
--
-- ÇÖZÜM — LEG-ETKİ MODELİ: "eksik simetrik kural" hata sınıfını YAPISAL olarak imkânsız kılar.
--   Her işlem, bakiye-op'larına (computeBalanceOps ile BİREBİR) açılır; her leg, entity'sinin
--   DAHİL olup olmamasıyla çarpılır; DAHİL leglerin TRY-değerli deltaları toplanır:
--     net_delta(işlem) = Σ_{dahil leg} (leg_delta_entity_ccy × güncel_kur(entity_ccy))
--   HESAP bacağı entity kendi para biriminde ham amount; KARŞI bacak (cari/personel/hedef hesap)
--   _nw_convert (M1 helper) ile hedef para birimine çevrilir → sonra kendi kuruyla TRY'ye.
--   gelir = Σ max(net_delta,0), gider = Σ max(−net_delta,0), net = Σ net_delta.
--   Sonuç: (a) tüm BUG-2 yönleri otomatik doğru, (b) DAHİL↔DAHİL çapraz-para FX farkı doğal çıktı
--   (iki leg iki kurla → fark net'e yazılır), (c) DAHİL↔DAHİL aynı-para nakit net-sıfır (double-count yok).
--
-- T3 (birikim anchor-simetrisi): useFinancialSummary.ts generalStatus'ta `type='birikim' AND
--   balance<0` hesabı HARİÇ sayar (ne varlık ne borç → 0 katkı). v2/v1 RPC dahil ederdi → asimetri.
--   FİX: hem açılış hem net RPC'de negatif birikim hesabını DAHİL kümeden çıkar (h_incl / hh_incl).
--   3 kiracıda materyal (0f05e087/−201.220, fea1e41e/−191.127, aca33e4d/−100); Dilruba'da NO-OP.
--   Her iki RPC birlikte değişmeli (leg-parite): Σopening + Σnet = generalStatus özdeşliği korunur.
--
-- DAVRANIŞ DEĞİŞİKLİĞİ (bilinçli, doğru): NULL-entity legleri artık sayılmaz. v2, NULL-hesap gelir
--   veya NULL-cari cari_satis'i "hayalet gelir" sayardı (h_ok = h.id IS NULL OR ...). Leg modelinde
--   entity yoksa dahil-bakiye değişmez → 0. Kiracı-geneli: gelir/gider NULL-hesap 0, cari_* NULL-cari 4.
--
-- DOĞRULAMA (üretim, salt-okuma): Dilruba generalStatus = Σopening(M1) + Σnet_v3, crit-1 rezidüel 0,00.
--   fea1e41e T3 farkı tam +191.127 (Erdem borç). ADDITİF; imzalar korunur; yalnız Net Varlık Trendi çağırır.

-- ============================================================================
-- 1) AÇILIŞ RPC: M1 (BUG-1 çapraz-para) + T3 (negatif birikim hariç)
-- ============================================================================
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
        WHEN 'personel_odeme'    THEN  COALESCE(public._nw_convert(i.amount, i.exchange_rate, i.source_currency, i.target_currency), i.amount)
        WHEN 'personel_tahsilat' THEN -COALESCE(public._nw_convert(i.amount, i.exchange_rate, i.source_currency, i.target_currency), i.amount)
        ELSE 0 END) AS d
    FROM islemler i
    WHERE i.isletme_id = p_isletme_id AND i.personel_id IS NOT NULL
    GROUP BY i.personel_id
  ),
  openings AS (
    -- HESAP açılışları — T3: negatif birikim hariç (anchor ile simetri)
    SELECT date_trunc('month', h.created_at)::date AS ay,
      (h.balance - COALESCE(hd.d, 0) - COALESCE(hdt.d, 0))
        * CASE WHEN COALESCE(h.currency,'TRY') = 'TRY' THEN 1
               ELSE COALESCE((SELECT (rt.rates->>h.currency)::numeric FROM rates rt), 1) END AS opening_try
    FROM hesaplar h
    LEFT JOIN hesap_delta hd  ON hd.id  = h.id
    LEFT JOIN hesap_delta_target hdt ON hdt.id = h.id
    WHERE h.isletme_id = p_isletme_id AND h.is_active = true AND h.is_archived = false
      AND NOT (h.type = 'birikim' AND h.balance < 0)
      AND h.created_at >= p_start_date
    UNION ALL
    SELECT date_trunc('month', c.created_at)::date,
      (c.balance - COALESCE(cd.d, 0))
        * CASE WHEN COALESCE(c.currency,'TRY') = 'TRY' THEN 1
               ELSE COALESCE((SELECT (rt.rates->>c.currency)::numeric FROM rates rt), 1) END
    FROM cariler c
    LEFT JOIN cari_delta cd ON cd.id = c.id
    WHERE c.isletme_id = p_isletme_id AND c.is_active = true AND c.is_archived = false
      AND c.created_at >= p_start_date
    UNION ALL
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


-- ============================================================================
-- 2) P&L TREND RPC v3: LEG-ETKİ MODELİ (BUG-2 fix) + T3
-- ============================================================================
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
  WITH rt AS (
    SELECT r.rates FROM exchange_rates r WHERE r.base_currency = 'TRY' LIMIT 1
  ),
  tx AS (
    SELECT
      date_trunc('month', i.date)::date AS ay,
      GREATEST(nd.net_delta, 0)  AS income_try,
      GREATEST(-nd.net_delta, 0) AS expense_try
    FROM islemler i
    LEFT JOIN hesaplar h  ON i.hesap_id = h.id
    LEFT JOIN hesaplar hh ON i.hedef_hesap_id = hh.id
    LEFT JOIN cariler  c  ON i.cari_id = c.id
    LEFT JOIN personel pe ON i.personel_id = pe.id
    -- DAHİL bayrakları (aktif + arşivsiz; hesapta T3: negatif birikim hariç)
    CROSS JOIN LATERAL (SELECT
      (h.id  IS NOT NULL AND h.is_active  AND NOT h.is_archived  AND NOT (h.type  = 'birikim' AND h.balance  < 0)) AS h_incl,
      (hh.id IS NOT NULL AND hh.is_active AND NOT hh.is_archived AND NOT (hh.type = 'birikim' AND hh.balance < 0)) AS hh_incl,
      (c.id  IS NOT NULL AND c.is_active  AND NOT c.is_archived)  AS c_incl,
      (pe.id IS NOT NULL AND pe.is_active AND NOT pe.is_archived) AS pe_incl
    ) f
    -- Her entity para biriminin GÜNCEL TRY kuru
    CROSS JOIN LATERAL (SELECT
      CASE WHEN COALESCE(h.currency,'TRY')  = 'TRY' THEN 1 ELSE COALESCE((SELECT (rt.rates->>h.currency)::numeric  FROM rt), 1) END AS rate_h,
      CASE WHEN COALESCE(hh.currency,'TRY') = 'TRY' THEN 1 ELSE COALESCE((SELECT (rt.rates->>hh.currency)::numeric FROM rt), 1) END AS rate_hh,
      CASE WHEN COALESCE(c.currency,'TRY')  = 'TRY' THEN 1 ELSE COALESCE((SELECT (rt.rates->>c.currency)::numeric  FROM rt), 1) END AS rate_c,
      CASE WHEN COALESCE(pe.currency,'TRY') = 'TRY' THEN 1 ELSE COALESCE((SELECT (rt.rates->>pe.currency)::numeric FROM rt), 1) END AS rate_pe
    ) rr
    -- KARŞI bacak dönüştürülmüş tutarı (hedef para biriminde) — M1 helper ile birebir
    CROSS JOIN LATERAL (SELECT
      COALESCE(public._nw_convert(i.amount, i.exchange_rate, i.source_currency, i.target_currency), i.amount) AS conv
    ) cv
    -- İşlemin DAHİL kümeye net TRY etkisi = Σ dahil leglerin TRY-değerli deltası
    CROSS JOIN LATERAL (SELECT
      CASE i.type
        WHEN 'gelir'             THEN CASE WHEN f.h_incl  THEN  i.amount * rr.rate_h  ELSE 0 END
        WHEN 'gider'             THEN CASE WHEN f.h_incl  THEN -i.amount * rr.rate_h  ELSE 0 END
        WHEN 'cari_satis'        THEN CASE WHEN f.c_incl  THEN  i.amount * rr.rate_c  ELSE 0 END
        WHEN 'cari_alis'         THEN CASE WHEN f.c_incl  THEN -i.amount * rr.rate_c  ELSE 0 END
        WHEN 'cari_satis_iade'   THEN CASE WHEN f.c_incl  THEN -i.amount * rr.rate_c  ELSE 0 END
        WHEN 'cari_alis_iade'    THEN CASE WHEN f.c_incl  THEN  i.amount * rr.rate_c  ELSE 0 END
        WHEN 'personel_satis'    THEN CASE WHEN f.pe_incl THEN  i.amount * rr.rate_pe ELSE 0 END
        WHEN 'personel_gider'    THEN CASE WHEN f.pe_incl THEN -i.amount * rr.rate_pe ELSE 0 END
        WHEN 'cari_odeme'        THEN (CASE WHEN f.h_incl THEN -i.amount * rr.rate_h ELSE 0 END)
                                    + (CASE WHEN f.c_incl THEN  cv.conv * rr.rate_c ELSE 0 END)
        WHEN 'cari_tahsilat'     THEN (CASE WHEN f.h_incl THEN  i.amount * rr.rate_h ELSE 0 END)
                                    + (CASE WHEN f.c_incl THEN -cv.conv * rr.rate_c ELSE 0 END)
        WHEN 'personel_odeme'    THEN (CASE WHEN f.h_incl THEN -i.amount * rr.rate_h ELSE 0 END)
                                    + (CASE WHEN f.pe_incl THEN cv.conv * rr.rate_pe ELSE 0 END)
        WHEN 'personel_tahsilat' THEN (CASE WHEN f.h_incl THEN  i.amount * rr.rate_h ELSE 0 END)
                                    + (CASE WHEN f.pe_incl THEN -cv.conv * rr.rate_pe ELSE 0 END)
        WHEN 'transfer'          THEN (CASE WHEN f.h_incl  THEN -i.amount * rr.rate_h  ELSE 0 END)
                                    + (CASE WHEN f.hh_incl THEN  cv.conv * rr.rate_hh ELSE 0 END)
        ELSE 0
      END AS net_delta
    ) nd
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

REVOKE EXECUTE ON FUNCTION public.get_networth_pl_trend(uuid, timestamptz, timestamptz) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_networth_pl_trend(uuid, timestamptz, timestamptz) FROM anon;
GRANT  EXECUTE ON FUNCTION public.get_networth_pl_trend(uuid, timestamptz, timestamptz) TO authenticated;
