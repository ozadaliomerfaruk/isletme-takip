-- =============================================================================
-- FIX: Pasif (is_active=false) cari / personel / urun kayitlarini RAPORLARDAN disla
-- =============================================================================
-- SORUN: Raporlama RPC'leri yalnizca PASIF HESAP islemlerini disliyordu
--   ( (h.id IS NULL OR h.is_active=true) ve (hh.id IS NULL OR hh.is_active=true) ).
-- Ancak cari_alis / cari_satis / personel_gider / personel_satis (ve iadeleri)
-- islemleri hesap_id TASIMAZ (hesap_id=NULL). Bu yuzden "h.id IS NULL" kosulu
-- bu islemler icin DAIMA TRUE doner ve hesap-aktiflik filtresinden GECERLER.
-- cariler/personel/urunler icin AKTIFLIK filtresi OLMADIGINDAN, pasife alinmis
-- bir cari/personel/urunun islemleri gelir-gider, kategori, urun ve bakiye-aktivite
-- raporlarinda toplanmaya devam ediyordu. Oysa bakiye-bazli "Genel Durum"
-- (useFinancialSummary) pasif kayitlari zaten haric tutuyor -> ayni ekranda tutarsizlik.
--
-- COZUM: Mevcut hesap guard'ina paralel olarak cari (c), personel (p) ve urun (u)
-- icin de aktiflik filtresi ekle. Boylece pasif kayitlar TUM raporlardan tutarli
-- sekilde dislanir ve bakiye-bazli ozetlerle hizalanir.
--
-- VERI GUVENLIGI (onemli):
--   * Bu migration YALNIZCA salt-okunur fonksiyon govdelerini degistirir.
--     Hicbir tabloya/satira/bakiyeye DOKUNMAZ; backfill/silme YOKTUR.
--   * Filtre "IS NOT FALSE" kullanir ("= true" DEGIL): is_active kolonlari
--     NOT NULL degildir (BOOLEAN DEFAULT TRUE). "IS NOT FALSE" yalnizca ACIKCA
--     pasif (is_active=false) kayitlari disar; is_active=true VEYA is_active=NULL
--     kayitlar raporlarda KALIR. Bu, eski/eksik veride aktif bir kaydin yanlislikla
--     gizlenmesini engeller (sifir veri kaybi riski).
--   * Bir kayit tekrar aktif yapilirsa (is_active=true) islemleri raporlara
--     aninda geri doner; veri kaybolmaz, yalnizca toplamlardan haric tutulur.
--   * Pasif kayitlarin GECMIS islemleri de raporlardan dusecegi icin gecmis
--     donem gelir-gider/alis-satis toplamlari geriye donuk degisebilir (beklenen
--     ve onaylanan davranis).
--
-- KAPSAM: get_income_expense_summary, get_category_report, get_product_report,
--         get_balance_activity_report.
-- NOT (urun): Bir islemde hem aktif hem pasif urun satiri varsa, pasif satir
--   get_category_report Part 1 dagitiminda haric tutulur; islem tutarinin tamami
--   aktif urun(ler)e dagitilir (islem dusurulmez, toplam korunur). Yalnizca tamamen
--   pasif urunlerden olusan islemler kategori raporundan tamamen dislanir.
-- =============================================================================

-- 1) Dashboard gelir/gider + Karsilastirma raporu kaynagi
CREATE OR REPLACE FUNCTION public.get_income_expense_summary(
  p_isletme_id uuid,
  p_start_date timestamp with time zone,
  p_end_date timestamp with time zone
)
 RETURNS TABLE(type text, total numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH rates AS (
    SELECT r.rates FROM exchange_rates r WHERE r.base_currency = 'TRY' LIMIT 1
  )
  SELECT i.type::TEXT,
    SUM(
      CASE
        WHEN COALESCE(h.currency, c.currency, p.currency, 'TRY') = 'TRY'
          THEN i.amount
        ELSE
          i.amount * COALESCE(
            (SELECT (rt.rates->>COALESCE(h.currency, c.currency, p.currency))::DECIMAL FROM rates rt),
            1
          )
      END
    ) as total
  FROM islemler i
  LEFT JOIN hesaplar h ON i.hesap_id = h.id
  LEFT JOIN hesaplar hh ON i.hedef_hesap_id = hh.id
  LEFT JOIN cariler c ON i.cari_id = c.id
  LEFT JOIN personel p ON i.personel_id = p.id
  WHERE i.isletme_id = p_isletme_id
    AND i.date >= p_start_date
    AND i.date <= p_end_date
    AND (h.id IS NULL OR h.is_active = true)
    AND (hh.id IS NULL OR hh.is_active = true)
    -- YENI: pasif cari/personel islemlerini disla (NULL-guvenli: yalniz is_active=false dislanir)
    AND (c.id IS NULL OR c.is_active IS NOT FALSE)
    AND (p.id IS NULL OR p.is_active IS NOT FALSE)
  GROUP BY i.type;
END;
$function$;


-- 2) Gelir-Gider kategori dagilimi raporu kaynagi
CREATE OR REPLACE FUNCTION public.get_category_report(
  p_isletme_id uuid,
  p_types text[],
  p_start_date timestamp with time zone,
  p_end_date timestamp with time zone
)
 RETURNS TABLE(kategori_id uuid, kategori_adi text, kategori_renk text, kategori_icon text, parent_id uuid, islem_count bigint, total_amount numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_is_expense BOOLEAN;
BEGIN
  -- p_types içinde gider tipi olup olmadığını belirle
  v_is_expense := (p_types && ARRAY['gider', 'cari_alis', 'personel_gider', 'cari_alis_iade']::TEXT[]);

  RETURN QUERY

  WITH rates AS (
    SELECT r.rates FROM exchange_rates r WHERE r.base_currency = 'TRY' LIMIT 1
  ),
  -- Part 1: İşlemler WITH ürün hareketleri → eşlenmiş kategori bazlı kırılım
  urun_islem_tutar AS (
    SELECT
      uh.islem_id,
      CASE
        WHEN v_is_expense THEN COALESCE(k_urun.mapped_gider_kategori_id, u.kategori_id)
        ELSE COALESCE(k_urun.mapped_gelir_kategori_id, u.kategori_id)
      END as resolved_kategori_id,
      ABS(uh.miktar) * COALESCE(uh.birim_fiyat, 0) * (1 + COALESCE(uh.kdv_orani, 0) / 100.0) as hareket_tutar
    FROM urun_hareketler uh
    INNER JOIN urunler u ON u.id = uh.urun_id
    LEFT JOIN kategoriler k_urun ON u.kategori_id = k_urun.id
    WHERE uh.isletme_id = p_isletme_id
      -- YENI: pasif urun hareketlerini disla (mixed islemde tutar aktif urunlere dagitilir)
      AND u.is_active IS NOT FALSE
  ),
  islem_toplam AS (
    SELECT uit.islem_id, SUM(uit.hareket_tutar) as toplam_hareket_tutar
    FROM urun_islem_tutar uit
    GROUP BY uit.islem_id
  ),
  dagitim AS (
    SELECT
      uit.islem_id,
      uit.resolved_kategori_id,
      uit.hareket_tutar,
      it.toplam_hareket_tutar,
      i.amount as islem_amount,
      -- DÜZELTME: hesap yoksa cari/personel para birimine düş
      COALESCE(h.currency, c.currency, p.currency, 'TRY') as txn_currency,
      CASE
        WHEN it.toplam_hareket_tutar > 0
          THEN (uit.hareket_tutar / it.toplam_hareket_tutar) * i.amount
        ELSE i.amount
      END as dagitilan_tutar
    FROM urun_islem_tutar uit
    INNER JOIN islem_toplam it ON it.islem_id = uit.islem_id
    INNER JOIN islemler i ON i.id = uit.islem_id
    LEFT JOIN hesaplar h ON i.hesap_id = h.id
    LEFT JOIN hesaplar hh ON i.hedef_hesap_id = hh.id
    LEFT JOIN cariler c ON i.cari_id = c.id
    LEFT JOIN personel p ON i.personel_id = p.id
    WHERE i.isletme_id = p_isletme_id
      AND i.type = ANY(p_types)
      AND i.date >= p_start_date
      AND i.date <= p_end_date
      AND (h.id IS NULL OR h.is_active = true)
      AND (hh.id IS NULL OR hh.is_active = true)
      -- YENI: pasif cari/personel islemlerini disla (NULL-guvenli)
      AND (c.id IS NULL OR c.is_active IS NOT FALSE)
      AND (p.id IS NULL OR p.is_active IS NOT FALSE)
  )
  SELECT
    d.resolved_kategori_id as kategori_id,
    k.name::TEXT as kategori_adi,
    k.color::TEXT as kategori_renk,
    k.icon::TEXT as kategori_icon,
    k.parent_id,
    COUNT(DISTINCT d.islem_id) as islem_count,
    SUM(
      CASE
        WHEN d.txn_currency = 'TRY'
          THEN d.dagitilan_tutar
        ELSE
          d.dagitilan_tutar * COALESCE((SELECT (rt.rates->>d.txn_currency)::DECIMAL FROM rates rt), 1)
      END
    ) as total_amount
  FROM dagitim d
  LEFT JOIN kategoriler k ON d.resolved_kategori_id = k.id
  GROUP BY d.resolved_kategori_id, k.name, k.color, k.icon, k.parent_id

  UNION ALL

  -- Part 2: İşlemler WITHOUT ürün hareketleri → islemler.kategori_id kullan
  SELECT
    k.id as kategori_id,
    k.name::TEXT as kategori_adi,
    k.color::TEXT as kategori_renk,
    k.icon::TEXT as kategori_icon,
    k.parent_id,
    COUNT(i.id) as islem_count,
    SUM(
      CASE
        WHEN COALESCE(h.currency, c.currency, p.currency, 'TRY') = 'TRY'
          THEN i.amount
        ELSE
          i.amount * COALESCE(
            (SELECT (rt.rates->>COALESCE(h.currency, c.currency, p.currency))::DECIMAL FROM rates rt),
            1
          )
      END
    ) as total_amount
  FROM islemler i
  LEFT JOIN kategoriler k ON i.kategori_id = k.id
  LEFT JOIN hesaplar h ON i.hesap_id = h.id
  LEFT JOIN hesaplar hh ON i.hedef_hesap_id = hh.id
  LEFT JOIN cariler c ON i.cari_id = c.id
  LEFT JOIN personel p ON i.personel_id = p.id
  WHERE i.isletme_id = p_isletme_id
    AND i.type = ANY(p_types)
    AND i.date >= p_start_date
    AND i.date <= p_end_date
    AND (h.id IS NULL OR h.is_active = true)
    AND (hh.id IS NULL OR hh.is_active = true)
    -- YENI: pasif cari/personel islemlerini disla (NULL-guvenli)
    AND (c.id IS NULL OR c.is_active IS NOT FALSE)
    AND (p.id IS NULL OR p.is_active IS NOT FALSE)
    AND NOT EXISTS (
      SELECT 1 FROM urun_hareketler uh2
      WHERE uh2.islem_id = i.id AND uh2.isletme_id = p_isletme_id
    )
  GROUP BY k.id, k.name, k.color, k.icon, k.parent_id;

END;
$function$;


-- 3) Alis-Satis (urun) raporu kaynagi
CREATE OR REPLACE FUNCTION public.get_product_report(
  p_isletme_id uuid,
  p_start_date timestamp with time zone,
  p_end_date timestamp with time zone,
  p_islem_types text[]
)
 RETURNS TABLE(urun_id uuid, urun_adi text, urun_birim text, kategori_id uuid, kategori_adi text, toplam_miktar numeric, toplam_tutar numeric, toplam_tutar_kdvsiz numeric, islem_sayisi bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH rates AS (
    SELECT r.rates FROM exchange_rates r WHERE r.base_currency = 'TRY' LIMIT 1
  )
  SELECT
    u.id as urun_id,
    u.ad::TEXT as urun_adi,
    u.birim::TEXT as urun_birim,
    k.id as kategori_id,
    k.name::TEXT as kategori_adi,
    SUM(ABS(uh.miktar)) as toplam_miktar,
    SUM(
      ABS(uh.miktar) * COALESCE(uh.birim_fiyat, 0) * (1 + COALESCE(uh.kdv_orani, 0) / 100.0)
      * CASE
          WHEN i.id IS NULL THEN 1
          WHEN COALESCE(h.currency, c.currency, p.currency, 'TRY') = 'TRY' THEN 1
          ELSE COALESCE((SELECT (rt.rates->>COALESCE(h.currency, c.currency, p.currency))::DECIMAL FROM rates rt), 1)
        END
    ) as toplam_tutar,
    SUM(
      ABS(uh.miktar) * COALESCE(uh.birim_fiyat, 0)
      * CASE
          WHEN i.id IS NULL THEN 1
          WHEN COALESCE(h.currency, c.currency, p.currency, 'TRY') = 'TRY' THEN 1
          ELSE COALESCE((SELECT (rt.rates->>COALESCE(h.currency, c.currency, p.currency))::DECIMAL FROM rates rt), 1)
        END
    ) as toplam_tutar_kdvsiz,
    COUNT(DISTINCT COALESCE(uh.islem_id, uh.id)) as islem_sayisi
  FROM urun_hareketler uh
  INNER JOIN urunler u ON u.id = uh.urun_id
  LEFT JOIN kategoriler k ON u.kategori_id = k.id
  LEFT JOIN islemler i ON i.id = uh.islem_id
  LEFT JOIN hesaplar h ON i.hesap_id = h.id
  LEFT JOIN hesaplar hh ON i.hedef_hesap_id = hh.id
  LEFT JOIN cariler c ON i.cari_id = c.id
  LEFT JOIN personel p ON i.personel_id = p.id
  WHERE uh.isletme_id = p_isletme_id
    -- YENI: pasif urunu raporun tamamindan disla (Durum 1 + Durum 2)
    AND u.is_active IS NOT FALSE
    AND (
      -- Durum 1: İşleme bağlı kayıtlar
      (i.id IS NOT NULL
        AND i.type = ANY(p_islem_types)
        AND i.date >= p_start_date
        AND i.date <= p_end_date
        AND (h.id IS NULL OR h.is_active = true)
        AND (hh.id IS NULL OR hh.is_active = true)
        -- YENI: pasif cari/personel islemlerini disla (NULL-guvenli)
        AND (c.id IS NULL OR c.is_active IS NOT FALSE)
        AND (p.id IS NULL OR p.is_active IS NOT FALSE)
      )
      OR
      -- Durum 2: İşleme bağlı OLMAYAN kayıtlar (toplu giriş/çıkış)
      (i.id IS NULL
        AND uh.created_at >= p_start_date
        AND uh.created_at <= p_end_date
        AND (
          ('cari_alis' = ANY(p_islem_types) AND uh.hareket_tipi = 'giris')
          OR
          (('cari_satis' = ANY(p_islem_types) OR 'personel_satis' = ANY(p_islem_types)) AND uh.hareket_tipi = 'cikis')
        )
      )
    )
  GROUP BY u.id, u.ad, u.birim, k.id, k.name
  ORDER BY 7 DESC;
END;
$function$;


-- 4) Bakiye-aktivite raporu (alacak/borc + son islem tarihi) - bakiye-bazli, Genel Durum ile hizalanir
CREATE OR REPLACE FUNCTION public.get_balance_activity_report(p_isletme_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSON;
BEGIN
  -- Verify caller has access (owner OR active member)
  IF NOT user_has_isletme_access(p_isletme_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  SELECT json_build_object(
    'items', COALESCE((
      SELECT json_agg(row_to_json(t) ORDER BY ABS(t.balance) DESC)
      FROM (
        SELECT
          c.id,
          c.name,
          c.type,
          c.balance::float,
          c.currency,
          c.color,
          max_tx.last_date::text AS last_transaction_date,
          CASE
            WHEN max_tx.last_date IS NOT NULL THEN
              EXTRACT(DAY FROM NOW() - max_tx.last_date)::int
            ELSE NULL
          END AS days_since_last_tx
        FROM cariler c
        LEFT JOIN (
          SELECT cari_id, MAX(date) AS last_date
          FROM islemler
          WHERE isletme_id = p_isletme_id
          GROUP BY cari_id
        ) max_tx ON max_tx.cari_id = c.id
        WHERE c.isletme_id = p_isletme_id
          AND c.is_archived = false
          -- YENI: pasif carileri disla (Genel Durum bakiye ozetiyle hizali)
          AND c.is_active IS NOT FALSE
          AND c.balance != 0
      ) t
    ), '[]'::json),
    'summary', COALESCE((
      SELECT json_build_object(
        'total_receivables', COALESCE(SUM(CASE WHEN c.balance > 0 THEN c.balance ELSE 0 END), 0)::float,
        'total_payables', COALESCE(SUM(CASE WHEN c.balance < 0 THEN ABS(c.balance) ELSE 0 END), 0)::float,
        'receivable_count', COUNT(CASE WHEN c.balance > 0 THEN 1 END)::int,
        'payable_count', COUNT(CASE WHEN c.balance < 0 THEN 1 END)::int
      )
      FROM cariler c
      WHERE c.isletme_id = p_isletme_id
        AND c.is_archived = false
        -- YENI: pasif carileri disla (Genel Durum bakiye ozetiyle hizali)
        AND c.is_active IS NOT FALSE
        AND c.balance != 0
    ), json_build_object(
      'total_receivables', 0::float,
      'total_payables', 0::float,
      'receivable_count', 0::int,
      'payable_count', 0::int
    ))
  ) INTO result;

  RETURN result;
END;
$$;
