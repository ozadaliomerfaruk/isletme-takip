-- =============================================================================
-- RAPOR RPC'LERINE ERISIM GUARD'I  (denetim ONCE-0)
--
-- SORUN: Bu uc fonksiyon SECURITY DEFINER (yani RLS'i baypas ediyor) ama hicbir
-- erisim kontrolu yapmiyordu; p_isletme_id TAMAMEN cagirandan geliyor. Yani
-- kimliği dogrulanmis herhangi bir kullanici BASKA bir isletmenin id'sini
-- gecerek o isletmenin gelir/gider/kategori/urun toplamlarini okuyabilirdi.
-- Ayrica anon rolunden EXECUTE yetkisi hic geri alinmamisti.
--
-- 20260716030000 (izin-gate) ve 20260716040000 (rapor RPC modul kapisi) bu
-- sinifi kapatmisti ama bu UC fonksiyon o turlarin listesine girmemis.
--
-- BU MIGRATION VERI DEGISTIRMEZ. Yalnizca fonksiyon govdelerinin basina
-- kontrol satiri ekler ve EXECUTE yetkisini authenticated'a daraltir.
-- Fonksiyon govdeleri 20260630000000'dan BIREBIR kopyalanmistir (uretici
-- script ile, elle degil) — tek fark eklenen guard satirlaridir.
--
-- -----------------------------------------------------------------------------
-- ESKI CLIENT NE YASAR? (repo kurali geregi yazili cevap)
--
-- 1) Kendi isletmesine bakan mesru kullanici: DEGISIKLIK YOK.
--    user_has_isletme_access owner icin de aktif uye icin de true doner.
--
-- 2) Baska isletmenin id'siyle cagiran: artik BOS sonuc doner (hata degil).
--    Zaten olmamasi gereken davranisti; sizinti kapaniyor.
--
-- 3) anon (giris yapmamis) cagiran: EXECUTE yetkisi kalkiyor.
--    Kod tabaninda anon ya da edge-function cagirisi YOKTUR (tarandi:
--    supabase/functions/ altinda bu uc isim hic gecmiyor) → kirilma beklenmiyor.
--
-- 4) MODUL KAPISI ASIMETRIK — BILEREK:
--    get_category_report ve get_product_report'a 'raporlar' modul kapisi
--    EKLENDI; cunku bu ikisinin TUM cagiranlari zaten raporlar/ altinda ve
--    istemci tarafinda canAccessModule('raporlar') ile korunuyor.
--
--    get_income_expense_summary'ye modul kapisi EKLENMEDI. Sebep: bu RPC'yi
--    useMonthSummary de cagiriyor ve o, ANA SAYFA'daki aylik gelir/gider
--    ozetini besliyor (src/app/(tabs)/index.tsx:225) — orada cagri KOSULSUZ,
--    raporlar kapisi yalnizca /raporlar'a GIDISI engelliyor (:443).
--    Modul kapisi eklenseydi, 'raporlar' modulu olmayan bir uye Ana Sayfa'da
--    aylik ozeti 0,00 gorurdu. Bu bir gerileme olurdu; guvenlik acigini
--    kapatan sey zaten user_has_isletme_access'tir.
--    Modul kapisinin bu RPC'ye de eklenmesi AYRI bir urun karari olarak
--    degerlendirilmelidir (o zaman Ana Sayfa cagrisi da gate'lenmeli).
--
-- GERI ALMA: dosyanin sonundaki blok yorumda hazir.
-- =============================================================================

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
  -- GUVENLIK: yalniz kendi isletmesinin verisi. MODUL KAPISI BILEREK YOK — bkz. baslik notu.
  IF NOT public.user_has_isletme_access(p_isletme_id) THEN RETURN; END IF;
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
  -- GUVENLIK: erisim + raporlar modulu (tum cagiranlar zaten raporlar kapisinin arkasinda).
  IF NOT public.user_has_isletme_access(p_isletme_id) THEN RETURN; END IF;
  IF NOT public.user_has_module_access(p_isletme_id, 'raporlar') THEN RETURN; END IF;
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
  -- GUVENLIK: erisim + raporlar modulu (tek cagiran: raporlar/alis-satis).
  IF NOT public.user_has_isletme_access(p_isletme_id) THEN RETURN; END IF;
  IF NOT public.user_has_module_access(p_isletme_id, 'raporlar') THEN RETURN; END IF;
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

-- =============================================================================
-- EXECUTE yetkisi: anon'dan al, authenticated'a ver (kalip: 20260716040000)
-- =============================================================================
REVOKE EXECUTE ON FUNCTION public.get_income_expense_summary(uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_income_expense_summary(uuid, timestamptz, timestamptz) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_category_report(uuid, text[], timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_category_report(uuid, text[], timestamptz, timestamptz) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_product_report(uuid, timestamptz, timestamptz, text[]) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_product_report(uuid, timestamptz, timestamptz, text[]) TO authenticated;

-- =============================================================================
-- GERI ALMA (acil durumda calistir — yalnizca yetkiyi geri acar, guard'lar kalir)
-- =============================================================================
-- GRANT EXECUTE ON FUNCTION public.get_income_expense_summary(uuid, timestamptz, timestamptz) TO anon;
-- GRANT EXECUTE ON FUNCTION public.get_category_report(uuid, text[], timestamptz, timestamptz) TO anon;
-- GRANT EXECUTE ON FUNCTION public.get_product_report(uuid, timestamptz, timestamptz, text[]) TO anon;
--
-- Guard'lari da geri almak gerekirse: 20260630000000 dosyasindaki ilgili
-- CREATE OR REPLACE bloklarini oldugu gibi yeniden calistirmak yeterlidir.
