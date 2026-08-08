-- =============================================================================
-- URUN ALIS FIYATI DEGISIM RAPORU V2
-- =============================================================================
-- Migration history version: 20260807151236
-- V1 sozlesmesini oldugu gibi korur ve indirim etkisini iki yeni alanla ekler:
--   * indirimli_alim_miktari: referans fiyatin altinda alinan toplam miktar
--   * tahmini_tasarruf: referans fiyatla devam edilseydi fazladan odenecek tutar
--
-- Salt okunur/additive: V1 fonksiyonunu, tablolari ve mevcut verileri degistirmez.
-- =============================================================================

CREATE FUNCTION public.get_product_price_change_report_v2(
  p_isletme_id uuid,
  p_start_date timestamp with time zone,
  p_end_date timestamp with time zone
)
RETURNS TABLE(
  urun_id uuid,
  urun_adi text,
  urun_birim text,
  kategori_id uuid,
  kategori_adi text,
  fiyat_para_birimi text,
  referans_fiyat numeric,
  guncel_fiyat numeric,
  onceki_fiyat numeric,
  son_degisim_tutari numeric,
  son_degisim_yuzdesi numeric,
  donem_degisim_tutari numeric,
  donem_degisim_yuzdesi numeric,
  degisim_sayisi bigint,
  zam_var boolean,
  indirim_var boolean,
  donem_toplam_miktar numeric,
  zamli_alim_miktari numeric,
  tahmini_ek_maliyet numeric,
  ilk_alim_tarihi timestamp with time zone,
  son_alim_tarihi timestamp with time zone,
  son_degisim_tarihi timestamp with time zone,
  son_tedarikci_id uuid,
  son_tedarikci_adi text,
  tedarikci_degisti boolean,
  fiyat_gecmisi jsonb,
  indirimli_alim_miktari numeric,
  tahmini_tasarruf numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog'
AS $function$
  WITH report_rows AS MATERIALIZED (
    SELECT report.*
    FROM public.get_product_price_change_report_v1(
      p_isletme_id,
      p_start_date,
      p_end_date
    ) AS report
  ),
  discount_impact AS MATERIALIZED (
    SELECT
      report.urun_id,
      report.fiyat_para_birimi,
      COALESCE(
        pg_catalog.sum(pg_catalog.abs(movement.miktar)) FILTER (
          WHERE movement.birim_fiyat < report.referans_fiyat
        ),
        0
      )::numeric AS lower_price_quantity,
      COALESCE(
        pg_catalog.sum(
          pg_catalog.abs(movement.miktar)
          * (report.referans_fiyat - movement.birim_fiyat)
        ) FILTER (
          WHERE movement.birim_fiyat < report.referans_fiyat
        ),
        0
      )::numeric AS estimated_savings
    FROM public.urun_hareketler AS movement
    INNER JOIN public.urunler AS product
      ON product.id = movement.urun_id
     AND product.isletme_id = p_isletme_id
    INNER JOIN public.islemler AS transaction_row
      ON transaction_row.id = movement.islem_id
     AND transaction_row.isletme_id = p_isletme_id
    LEFT JOIN public.hesaplar AS account
      ON account.id = transaction_row.hesap_id
     AND account.isletme_id = p_isletme_id
    LEFT JOIN public.hesaplar AS target_account
      ON target_account.id = transaction_row.hedef_hesap_id
     AND target_account.isletme_id = p_isletme_id
    LEFT JOIN public.cariler AS supplier
      ON supplier.id = transaction_row.cari_id
     AND supplier.isletme_id = p_isletme_id
    INNER JOIN report_rows AS report
      ON report.urun_id = product.id
     AND report.fiyat_para_birimi = COALESCE(
       account.currency,
       supplier.currency,
       transaction_row.source_currency,
       'TRY'
     )::text
    WHERE movement.isletme_id = p_isletme_id
      AND product.is_active IS TRUE
      AND transaction_row.type = 'cari_alis'
      AND transaction_row.date::timestamp with time zone >= p_start_date
      AND transaction_row.date::timestamp with time zone <= p_end_date
      AND movement.hareket_tipi = 'giris'
      AND movement.birim_fiyat IS NOT NULL
      AND movement.birim_fiyat > 0
      AND movement.miktar <> 0
      AND (account.id IS NULL OR account.is_active IS TRUE)
      AND (
        target_account.id IS NULL
        OR target_account.is_active IS TRUE
      )
      AND supplier.id IS NOT NULL
      AND supplier.is_active IS TRUE
    GROUP BY report.urun_id, report.fiyat_para_birimi
  )
  SELECT
    report.urun_id,
    report.urun_adi,
    report.urun_birim,
    report.kategori_id,
    report.kategori_adi,
    report.fiyat_para_birimi,
    report.referans_fiyat,
    report.guncel_fiyat,
    report.onceki_fiyat,
    report.son_degisim_tutari,
    report.son_degisim_yuzdesi,
    report.donem_degisim_tutari,
    report.donem_degisim_yuzdesi,
    report.degisim_sayisi,
    report.zam_var,
    report.indirim_var,
    report.donem_toplam_miktar,
    report.zamli_alim_miktari,
    report.tahmini_ek_maliyet,
    report.ilk_alim_tarihi,
    report.son_alim_tarihi,
    report.son_degisim_tarihi,
    report.son_tedarikci_id,
    report.son_tedarikci_adi,
    report.tedarikci_degisti,
    report.fiyat_gecmisi,
    COALESCE(impact.lower_price_quantity, 0) AS indirimli_alim_miktari,
    COALESCE(impact.estimated_savings, 0) AS tahmini_tasarruf
  FROM report_rows AS report
  LEFT JOIN discount_impact AS impact
    ON impact.urun_id = report.urun_id
   AND impact.fiyat_para_birimi = report.fiyat_para_birimi
  ORDER BY
    greatest(
      report.tahmini_ek_maliyet,
      COALESCE(impact.estimated_savings, 0)
    ) DESC,
    report.son_degisim_tarihi DESC,
    report.urun_adi;
$function$;

ALTER FUNCTION public.get_product_price_change_report_v2(
  uuid,
  timestamp with time zone,
  timestamp with time zone
) OWNER TO postgres;

REVOKE ALL
ON FUNCTION public.get_product_price_change_report_v2(
  uuid,
  timestamp with time zone,
  timestamp with time zone
)
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE
ON FUNCTION public.get_product_price_change_report_v2(
  uuid,
  timestamp with time zone,
  timestamp with time zone
)
TO authenticated;

COMMENT ON FUNCTION public.get_product_price_change_report_v2(
  uuid,
  timestamp with time zone,
  timestamp with time zone
) IS
  'V1 fiyat degisimi raporuna referans fiyat altindaki alim miktarini ve tahmini tasarrufu ekler.';
