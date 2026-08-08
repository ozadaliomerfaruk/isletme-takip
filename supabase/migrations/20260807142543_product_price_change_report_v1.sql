-- =============================================================================
-- ÜRÜN ALIŞ FİYATI DEĞİŞİM RAPORU V1
-- =============================================================================
-- Amaç:
--   Seçilen dönemde gerçek cari alış satırlarının birim fiyat değişimlerini,
--   dönem başlangıç referansını ve bu referansa göre tahmini ek maliyeti döndürür.
--
-- Sözleşme:
--   * Yalnız işleme bağlı `cari_alis` + `giris` hareketleri kullanılır.
--   * İade, manuel stok hareketi ve düzeltme fiyat sinyali değildir.
--   * Gerçek iş tarihi `islemler.date`'tir; `created_at` kullanılmaz.
--   * KDV hariç `urun_hareketler.birim_fiyat` karşılaştırılır.
--   * Para birimleri karıştırılmaz; aynı ürün farklı para birimindeyse ayrı satırdır.
--   * Referans, dönemden önceki son geçerli alış; yoksa dönemin ilk alışıdır.
--   * Tahmini ek maliyet = Σ miktar × max(fiyat - referans, 0).
--   * Salt okunur/additive: tablo, kolon veya mevcut veri değiştirmez.
-- =============================================================================

CREATE FUNCTION public.get_product_price_change_report_v1(
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
  fiyat_gecmisi jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_reports_can_view boolean := false;
  v_products_can_view boolean := false;
BEGIN
  IF p_isletme_id IS NULL
     OR p_start_date IS NULL
     OR p_end_date IS NULL
     OR p_start_date > p_end_date
  THEN
    RETURN;
  END IF;

  SELECT permission.can_view
  INTO v_reports_can_view
  FROM internal.etkin_yetki_v2(p_isletme_id, 'raporlar') AS permission
  LIMIT 1;

  SELECT permission.can_view
  INTO v_products_can_view
  FROM internal.etkin_yetki_v2(p_isletme_id, 'urunler') AS permission
  LIMIT 1;

  -- Mevcut ürün raporu ile aynı dar erişim yüzeyi: iki modülden biri yeterli.
  -- internal.etkin_yetki_v2 işletme üyeliğini ve aktif kullanıcıyı fail-closed doğrular.
  IF v_user_id IS NULL
     OR (
       v_reports_can_view IS NOT TRUE
       AND v_products_can_view IS NOT TRUE
     )
  THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH all_purchases AS MATERIALIZED (
    SELECT
      movement.id AS movement_id,
      transaction_row.id AS transaction_id,
      -- `islemler.date` DATE tipindedir; RPC sozlesmesi istemcideki diger raporlarla
      -- ayni ISO/timestamptz yuzeyini kullandigi icin gunu acikca timestamptz'e cevir.
      transaction_row.date::timestamp with time zone AS transaction_date,
      product.id AS product_id,
      product.ad::text AS product_name,
      product.birim::text AS product_unit,
      category.id AS category_id,
      category.name::text AS category_name,
      COALESCE(
        account.currency,
        supplier.currency,
        transaction_row.source_currency,
        'TRY'
      )::text AS price_currency,
      movement.birim_fiyat::numeric AS unit_price,
      pg_catalog.abs(movement.miktar)::numeric AS quantity,
      supplier.id AS supplier_id,
      supplier.name::text AS supplier_name
    FROM public.urun_hareketler AS movement
    INNER JOIN public.urunler AS product
      ON product.id = movement.urun_id
     AND product.isletme_id = p_isletme_id
    INNER JOIN public.islemler AS transaction_row
      ON transaction_row.id = movement.islem_id
     AND transaction_row.isletme_id = p_isletme_id
    LEFT JOIN public.kategoriler AS category
      ON category.id = product.kategori_id
     AND category.isletme_id = p_isletme_id
    LEFT JOIN public.hesaplar AS account
      ON account.id = transaction_row.hesap_id
     AND account.isletme_id = p_isletme_id
    LEFT JOIN public.hesaplar AS target_account
      ON target_account.id = transaction_row.hedef_hesap_id
     AND target_account.isletme_id = p_isletme_id
    LEFT JOIN public.cariler AS supplier
      ON supplier.id = transaction_row.cari_id
     AND supplier.isletme_id = p_isletme_id
    WHERE movement.isletme_id = p_isletme_id
      AND product.is_active IS TRUE
      AND transaction_row.type = 'cari_alis'
      AND transaction_row.date <= p_end_date
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
  ),
  period_purchases AS MATERIALIZED (
    SELECT purchase.*
    FROM all_purchases AS purchase
    WHERE purchase.transaction_date >= p_start_date
      AND purchase.transaction_date <= p_end_date
  ),
  period_keys AS MATERIALIZED (
    SELECT DISTINCT
      purchase.product_id,
      purchase.price_currency
    FROM period_purchases AS purchase
  ),
  baseline_candidates AS (
    SELECT
      purchase.*,
      pg_catalog.row_number() OVER (
        PARTITION BY purchase.product_id, purchase.price_currency
        ORDER BY
          purchase.transaction_date DESC,
          purchase.transaction_id DESC,
          purchase.movement_id DESC
      ) AS baseline_rank
    FROM all_purchases AS purchase
    INNER JOIN period_keys AS period_key
      ON period_key.product_id = purchase.product_id
     AND period_key.price_currency = purchase.price_currency
    WHERE purchase.transaction_date < p_start_date
  ),
  timeline AS (
    SELECT
      candidate.*,
      false AS is_in_period,
      true AS is_baseline
    FROM baseline_candidates AS candidate
    WHERE candidate.baseline_rank = 1

    UNION ALL

    SELECT
      purchase.*,
      NULL::bigint AS baseline_rank,
      true AS is_in_period,
      false AS is_baseline
    FROM period_purchases AS purchase
  ),
  sequenced AS (
    SELECT
      timeline_row.*,
      pg_catalog.row_number() OVER (
        PARTITION BY timeline_row.product_id, timeline_row.price_currency
        ORDER BY
          timeline_row.transaction_date,
          timeline_row.transaction_id,
          timeline_row.movement_id
      ) AS sequence_number,
      pg_catalog.lag(timeline_row.unit_price) OVER (
        PARTITION BY timeline_row.product_id, timeline_row.price_currency
        ORDER BY
          timeline_row.transaction_date,
          timeline_row.transaction_id,
          timeline_row.movement_id
      ) AS previous_price,
      pg_catalog.first_value(timeline_row.unit_price) OVER (
        PARTITION BY timeline_row.product_id, timeline_row.price_currency
        ORDER BY
          timeline_row.transaction_date,
          timeline_row.transaction_id,
          timeline_row.movement_id
      ) AS reference_price
    FROM timeline AS timeline_row
  ),
  summarized AS (
    SELECT
      row_data.product_id,
      pg_catalog.max(row_data.product_name) AS product_name,
      pg_catalog.max(row_data.product_unit) AS product_unit,
      (
        pg_catalog.array_agg(row_data.category_id)
        FILTER (WHERE row_data.category_id IS NOT NULL)
      )[1] AS category_id,
      (
        pg_catalog.array_agg(row_data.category_name)
        FILTER (WHERE row_data.category_name IS NOT NULL)
      )[1] AS category_name,
      row_data.price_currency,
      pg_catalog.min(row_data.reference_price) AS reference_price,
      (
        pg_catalog.array_agg(
          row_data.unit_price
          ORDER BY
            row_data.transaction_date DESC,
            row_data.transaction_id DESC,
            row_data.movement_id DESC
        ) FILTER (WHERE row_data.is_in_period)
      )[1] AS current_price,
      (
        pg_catalog.array_agg(
          row_data.previous_price
          ORDER BY
            row_data.transaction_date DESC,
            row_data.transaction_id DESC,
            row_data.movement_id DESC
        ) FILTER (
          WHERE row_data.is_in_period
            AND row_data.previous_price IS NOT NULL
            AND row_data.previous_price <> row_data.unit_price
        )
      )[1] AS previous_distinct_price,
      pg_catalog.count(*) FILTER (
        WHERE row_data.is_in_period
          AND row_data.previous_price IS NOT NULL
          AND row_data.previous_price <> row_data.unit_price
      ) AS change_count,
      COALESCE(
        pg_catalog.bool_or(
          row_data.is_in_period
          AND row_data.previous_price IS NOT NULL
          AND row_data.unit_price > row_data.previous_price
        ),
        false
      ) AS has_increase,
      COALESCE(
        pg_catalog.bool_or(
          row_data.is_in_period
          AND row_data.previous_price IS NOT NULL
          AND row_data.unit_price < row_data.previous_price
        ),
        false
      ) AS has_decrease,
      COALESCE(
        pg_catalog.sum(row_data.quantity) FILTER (WHERE row_data.is_in_period),
        0
      ) AS period_quantity,
      COALESCE(
        pg_catalog.sum(row_data.quantity) FILTER (
          WHERE row_data.is_in_period
            AND row_data.unit_price > row_data.reference_price
        ),
        0
      ) AS higher_price_quantity,
      COALESCE(
        pg_catalog.sum(
          row_data.quantity
          * greatest(
              row_data.unit_price - row_data.reference_price,
              0
            )
        ) FILTER (WHERE row_data.is_in_period),
        0
      ) AS extra_cost,
      pg_catalog.min(row_data.transaction_date) FILTER (
        WHERE row_data.is_in_period
      ) AS first_purchase_date,
      pg_catalog.max(row_data.transaction_date) FILTER (
        WHERE row_data.is_in_period
      ) AS last_purchase_date,
      (
        pg_catalog.array_agg(
          row_data.transaction_date
          ORDER BY
            row_data.transaction_date DESC,
            row_data.transaction_id DESC,
            row_data.movement_id DESC
        ) FILTER (
          WHERE row_data.is_in_period
            AND row_data.previous_price IS NOT NULL
            AND row_data.previous_price <> row_data.unit_price
        )
      )[1] AS last_change_date,
      (
        pg_catalog.array_agg(
          row_data.supplier_id
          ORDER BY
            row_data.transaction_date DESC,
            row_data.transaction_id DESC,
            row_data.movement_id DESC
        ) FILTER (WHERE row_data.is_in_period)
      )[1] AS latest_supplier_id,
      (
        pg_catalog.array_agg(
          row_data.supplier_name
          ORDER BY
            row_data.transaction_date DESC,
            row_data.transaction_id DESC,
            row_data.movement_id DESC
        ) FILTER (WHERE row_data.is_in_period)
      )[1] AS latest_supplier_name,
      -- Dönem öncesindeki referans alışın tedarikçisi de kıyasa dahildir.
      -- Böylece dönem içindeki ilk fiyat geçişi tedarikçi değişimiyle birlikteyse
      -- tek dönem içi tedarikçi olsa dahi sinyal kaybolmaz.
      pg_catalog.count(DISTINCT row_data.supplier_id) > 1 AS supplier_changed,
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'date', row_data.transaction_date,
          'price', row_data.unit_price,
          'quantity', row_data.quantity,
          'supplierId', row_data.supplier_id,
          'supplierName', row_data.supplier_name,
          'kind', CASE
            WHEN row_data.is_baseline THEN 'baseline'
            WHEN row_data.sequence_number = 1 THEN 'initial'
            ELSE 'change'
          END,
          'changeAmount', CASE
            WHEN row_data.previous_price IS NULL THEN NULL
            ELSE row_data.unit_price - row_data.previous_price
          END,
          'changePercent', CASE
            WHEN row_data.previous_price IS NULL
              OR row_data.previous_price = 0 THEN NULL
            ELSE (
              (row_data.unit_price - row_data.previous_price)
              / row_data.previous_price
            ) * 100
          END
        )
        ORDER BY
          row_data.transaction_date,
          row_data.transaction_id,
          row_data.movement_id
      ) FILTER (
        WHERE row_data.is_baseline
           OR row_data.sequence_number = 1
           OR (
             row_data.is_in_period
             AND row_data.previous_price IS NOT NULL
             AND row_data.previous_price <> row_data.unit_price
           )
      ) AS price_history
    FROM sequenced AS row_data
    GROUP BY row_data.product_id, row_data.price_currency
  )
  SELECT
    summary.product_id AS urun_id,
    summary.product_name AS urun_adi,
    summary.product_unit AS urun_birim,
    summary.category_id AS kategori_id,
    summary.category_name AS kategori_adi,
    summary.price_currency AS fiyat_para_birimi,
    summary.reference_price AS referans_fiyat,
    summary.current_price AS guncel_fiyat,
    summary.previous_distinct_price AS onceki_fiyat,
    summary.current_price - summary.previous_distinct_price
      AS son_degisim_tutari,
    CASE
      WHEN summary.previous_distinct_price = 0 THEN NULL
      ELSE (
        (summary.current_price - summary.previous_distinct_price)
        / summary.previous_distinct_price
      ) * 100
    END AS son_degisim_yuzdesi,
    summary.current_price - summary.reference_price
      AS donem_degisim_tutari,
    CASE
      WHEN summary.reference_price = 0 THEN NULL
      ELSE (
        (summary.current_price - summary.reference_price)
        / summary.reference_price
      ) * 100
    END AS donem_degisim_yuzdesi,
    summary.change_count AS degisim_sayisi,
    summary.has_increase AS zam_var,
    summary.has_decrease AS indirim_var,
    summary.period_quantity AS donem_toplam_miktar,
    summary.higher_price_quantity AS zamli_alim_miktari,
    summary.extra_cost AS tahmini_ek_maliyet,
    summary.first_purchase_date AS ilk_alim_tarihi,
    summary.last_purchase_date AS son_alim_tarihi,
    summary.last_change_date AS son_degisim_tarihi,
    summary.latest_supplier_id AS son_tedarikci_id,
    summary.latest_supplier_name AS son_tedarikci_adi,
    summary.supplier_changed AS tedarikci_degisti,
    COALESCE(summary.price_history, '[]'::jsonb) AS fiyat_gecmisi
  FROM summarized AS summary
  WHERE summary.change_count > 0
  ORDER BY
    summary.extra_cost DESC,
    summary.last_change_date DESC,
    summary.product_name;
END;
$function$;

ALTER FUNCTION public.get_product_price_change_report_v1(
  uuid,
  timestamp with time zone,
  timestamp with time zone
) OWNER TO postgres;

REVOKE ALL
ON FUNCTION public.get_product_price_change_report_v1(
  uuid,
  timestamp with time zone,
  timestamp with time zone
)
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE
ON FUNCTION public.get_product_price_change_report_v1(
  uuid,
  timestamp with time zone,
  timestamp with time zone
)
TO authenticated;

COMMENT ON FUNCTION public.get_product_price_change_report_v1(
  uuid,
  timestamp with time zone,
  timestamp with time zone
) IS
  'Dönem içindeki cari alış birim fiyatı geçişlerini ve referans fiyata göre tahmini ek maliyeti döndürür.';
