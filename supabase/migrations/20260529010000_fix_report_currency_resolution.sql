-- =============================================================================
-- FIX: Raporlarda çok-para-birimi dönüşümü (gelir/gider + kategori)
-- =============================================================================
-- SORUN: get_income_expense_summary ve get_category_report, işlem tutarını yalnızca
-- HESAP (hesaplar.currency) para birimi üzerinden TRY'ye çeviriyordu. Ancak
-- cari_alis / cari_satis / personel_gider / personel_satis (ve iadeleri) işlemleri
-- hesap_id TAŞIMAZ ve tutarları ilgili cari/personel'in KENDİ para biriminde
-- saklanır. hesap_id NULL olduğunda h.currency NULL olur ve tutar TRY sanılarak
-- çevrilmeden toplanır -> USD/EUR/altın cinsi cari/personel işlemleri raporlarda
-- ciddi şekilde yanlış (ör. 1.000 USD alış 1.000 TL sayılır; bilanço ile P&L tutmaz).
--
-- ÇÖZÜM: İşlemin para birimini tek bir kuralla çöz:
--   txn_currency = COALESCE(hesap.currency, cari.currency, personel.currency, 'TRY')
-- (Tutar hangi bakiye bacağında tutuluyorsa o para biriminde: hesap varsa hesap,
--  yoksa cari/personel.) Bu, halihazırda doğru çalışan hesap-bazlı işlemleri
--  DEĞİŞTİRMEZ; yalnızca hesabı olmayan cari/personel işlemlerini düzeltir.
--
-- NOT: Bu yalnızca SALT-OKUNUR fonksiyon gövdesini değiştirir. Hiçbir tabloya/
-- satıra dokunmaz; backfill yoktur. Sadece-TRY işletmeler için çıktı aynı kalır.
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
    AND NOT EXISTS (
      SELECT 1 FROM urun_hareketler uh2
      WHERE uh2.islem_id = i.id AND uh2.isletme_id = p_isletme_id
    )
  GROUP BY k.id, k.name, k.color, k.icon, k.parent_id;

END;
$function$;
