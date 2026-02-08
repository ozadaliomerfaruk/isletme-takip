-- =============================================================================
-- FIX H9: Add SET search_path = public to all SECURITY DEFINER functions
-- =============================================================================
-- All SECURITY DEFINER functions should set search_path to prevent
-- schema injection attacks via manipulated search_path.
-- =============================================================================

-- 1. get_income_expense_summary
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
$$;

-- 2. get_category_report
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
$$;

-- 3. perform_nakit_avans (re-create with search_path)
CREATE OR REPLACE FUNCTION perform_nakit_avans(
  p_isletme_id uuid,
  p_kredi_karti_id uuid,
  p_hedef_hesap_id uuid,
  p_tutar numeric,
  p_geri_odeme_tutari numeric,
  p_kategori_id uuid DEFAULT NULL,
  p_aciklama text DEFAULT NULL,
  p_tarih timestamptz DEFAULT now(),
  p_is_taksitli boolean DEFAULT false,
  p_taksit_sayisi integer DEFAULT 1
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nakit_avans_id uuid;
BEGIN
  -- Validasyonlar
  IF p_tutar <= 0 THEN
    RAISE EXCEPTION 'Tutar 0''dan buyuk olmalidir';
  END IF;

  IF p_geri_odeme_tutari < p_tutar THEN
    RAISE EXCEPTION 'Geri odeme tutari, avans tutarindan kucuk olamaz';
  END IF;

  -- 1. NakitAvans kaydı oluştur
  INSERT INTO nakit_avanslar (
    isletme_id, kredi_karti_id, hedef_hesap_id, tutar,
    geri_odeme_tutari, kategori_id, aciklama, tarih,
    is_taksitli, taksit_sayisi
  ) VALUES (
    p_isletme_id, p_kredi_karti_id, p_hedef_hesap_id, p_tutar,
    p_geri_odeme_tutari, p_kategori_id, p_aciklama, p_tarih,
    p_is_taksitli, p_taksit_sayisi
  ) RETURNING id INTO v_nakit_avans_id;

  -- 2. Hedef hesaba para ekle (nakit çekildi)
  UPDATE hesaplar
  SET balance = balance + p_tutar,
      updated_at = NOW()
  WHERE id = p_hedef_hesap_id;

  -- 3. Kredi kartı borcunu artır (geri ödeme tutarı kadar)
  UPDATE hesaplar
  SET balance = balance + p_geri_odeme_tutari,
      updated_at = NOW()
  WHERE id = p_kredi_karti_id;

  RETURN v_nakit_avans_id;
END;
$$;

-- 4. perform_taksit_odeme (re-create with search_path)
CREATE OR REPLACE FUNCTION perform_taksit_odeme(
  p_taksit_id uuid,
  p_source_hesap_id uuid,
  p_isletme_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_taksit RECORD;
  v_avans RECORD;
BEGIN
  -- 1. Taksiti getir
  SELECT * INTO v_taksit
  FROM nakit_avans_taksitler
  WHERE id = p_taksit_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Taksit bulunamadi';
  END IF;

  IF v_taksit.status = 'paid' THEN
    RAISE EXCEPTION 'Bu taksit zaten odenmis';
  END IF;

  -- 2. Avansı getir (ownership check)
  SELECT * INTO v_avans
  FROM nakit_avanslar
  WHERE id = v_taksit.nakit_avans_id
    AND isletme_id = p_isletme_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Nakit avans bulunamadi veya bu isletmeye ait degil';
  END IF;

  -- 3. Kaynak hesaptan parayı çıkar
  UPDATE hesaplar
  SET balance = balance - v_taksit.tutar,
      updated_at = NOW()
  WHERE id = p_source_hesap_id;

  -- 4. Kredi kartı borcunu azalt
  UPDATE hesaplar
  SET balance = balance - v_taksit.tutar,
      updated_at = NOW()
  WHERE id = v_avans.kredi_karti_id;

  -- 5. Taksiti ödendi olarak işaretle
  UPDATE nakit_avans_taksitler
  SET status = 'paid',
      odeme_tarihi = NOW()
  WHERE id = p_taksit_id;
END;
$$;
