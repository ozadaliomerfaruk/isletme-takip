-- Raporlarda döviz işlemlerini TL'ye çevirerek toplama
-- exchange_rates tablosundaki kurları kullanarak her işlemin tutarını TL karşılığına çevirir
-- Böylece dashboard gelir-gider kartı ve kategori raporları doğru TL toplamı gösterir

-- 1. get_income_expense_summary - Dashboard gelir/gider toplamları
CREATE OR REPLACE FUNCTION get_income_expense_summary(
  p_isletme_id UUID,
  p_start_date TIMESTAMPTZ,
  p_end_date TIMESTAMPTZ
)
RETURNS TABLE(type TEXT, total DECIMAL)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH rates AS (
    SELECT r.rates FROM exchange_rates r WHERE r.base_currency = 'TRY' LIMIT 1
  )
  SELECT i.type::TEXT,
    SUM(
      CASE
        WHEN h.currency IS NULL OR h.currency = 'TRY'
          THEN i.amount
        ELSE
          i.amount * COALESCE((SELECT (rt.rates->>h.currency)::DECIMAL FROM rates rt), 1)
      END
    ) as total
  FROM islemler i
  LEFT JOIN hesaplar h ON i.hesap_id = h.id
  LEFT JOIN hesaplar hh ON i.hedef_hesap_id = hh.id
  WHERE i.isletme_id = p_isletme_id
    AND i.date >= p_start_date
    AND i.date <= p_end_date
    AND (h.id IS NULL OR h.is_active = true)
    AND (hh.id IS NULL OR hh.is_active = true)
  GROUP BY i.type;
END;
$$;

-- 2. get_category_report - Kategori bazlı rapor toplamları
CREATE OR REPLACE FUNCTION get_category_report(
  p_isletme_id UUID,
  p_types TEXT[],
  p_start_date TIMESTAMPTZ,
  p_end_date TIMESTAMPTZ
)
RETURNS TABLE(
  kategori_id UUID,
  kategori_adi TEXT,
  kategori_renk TEXT,
  kategori_icon TEXT,
  parent_id UUID,
  islem_count BIGINT,
  total_amount DECIMAL
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
      h.currency as hesap_currency,
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
        WHEN d.hesap_currency IS NULL OR d.hesap_currency = 'TRY'
          THEN d.dagitilan_tutar
        ELSE
          d.dagitilan_tutar * COALESCE((SELECT (rt.rates->>d.hesap_currency)::DECIMAL FROM rates rt), 1)
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
        WHEN h.currency IS NULL OR h.currency = 'TRY'
          THEN i.amount
        ELSE
          i.amount * COALESCE((SELECT (rt.rates->>h.currency)::DECIMAL FROM rates rt), 1)
      END
    ) as total_amount
  FROM islemler i
  LEFT JOIN kategoriler k ON i.kategori_id = k.id
  LEFT JOIN hesaplar h ON i.hesap_id = h.id
  LEFT JOIN hesaplar hh ON i.hedef_hesap_id = hh.id
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
$$;
