-- Raporlama aggregate fonksiyonları
-- Supabase varsayılan max_rows=1000 sınırını aşmak için
-- Client-side pagination yerine server-side aggregation kullanılır

-- 1. Dashboard Gelir/Gider Özeti
-- İşlem tipine göre SUM(amount) döndürür
-- Pasif hesaplardaki işlemler hariç tutulur
CREATE OR REPLACE FUNCTION get_income_expense_summary(
  p_isletme_id UUID,
  p_start_date TIMESTAMPTZ,
  p_end_date TIMESTAMPTZ
)
RETURNS TABLE(type TEXT, total DECIMAL) AS $$
BEGIN
  RETURN QUERY
  SELECT i.type::TEXT, SUM(i.amount) as total
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Kategori Raporu
-- Belirli işlem tipleri için kategori bazlı count ve SUM döndürür
-- Pasif hesaplardaki işlemler hariç tutulur
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
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    k.id as kategori_id,
    k.name::TEXT as kategori_adi,
    k.color::TEXT as kategori_renk,
    k.icon::TEXT as kategori_icon,
    k.parent_id,
    COUNT(i.id) as islem_count,
    SUM(i.amount) as total_amount
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
  GROUP BY k.id, k.name, k.color, k.icon, k.parent_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
