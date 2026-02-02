-- =============================================================================
-- Nakit Avans Silme RPC (Atomik Balance Reversal)
-- =============================================================================
-- Bu fonksiyon nakit avans silinirken tüm bakiye değişikliklerini geri alır:
-- 1. Kredi kartı bakiyesinden avans tutarını düşer (tutar kadar azalt)
-- 2. Hedef hesap bakiyesinden avans tutarını düşer (tutar kadar azalt)
-- 3. Ödenen taksitler için kaynak hesap bakiyesini geri yükler
-- 4. Kredi kartı bakiyesinden ödenen taksit tutarlarını geri ekler
-- 5. İlgili islemler tablosundaki kayıtları siler
-- 6. Taksitleri siler
-- 7. Avansı siler
--
-- NOT: Tüm işlemler tek transaction içinde yapılır (atomik)
-- =============================================================================

CREATE OR REPLACE FUNCTION delete_nakit_avans_with_reversal(
  p_avans_id UUID,
  p_isletme_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_avans RECORD;
  v_taksit RECORD;
  v_total_paid NUMERIC := 0;
BEGIN
  -- 1. Avansı getir ve doğrula
  SELECT * INTO v_avans
  FROM nakit_avanslar
  WHERE id = p_avans_id
    AND isletme_id = p_isletme_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Nakit avans bulunamadı veya bu işletmeye ait değil';
  END IF;

  -- 2. Ödenen taksitleri bul ve bakiyelerini geri al
  FOR v_taksit IN
    SELECT * FROM nakit_avans_taksitler
    WHERE nakit_avans_id = p_avans_id
      AND odendi = true
      AND source_hesap_id IS NOT NULL
  LOOP
    -- Kaynak hesaba parayı geri ekle (taksit ödendiğinde çekilmişti)
    UPDATE hesaplar
    SET balance = balance + v_taksit.tutar,
        updated_at = NOW()
    WHERE id = v_taksit.source_hesap_id;

    -- Kredi kartından ödenen tutarı geri çıkar (taksit ödendiğinde eklenmişti)
    UPDATE hesaplar
    SET balance = balance - v_taksit.tutar,
        updated_at = NOW()
    WHERE id = v_avans.kredi_karti_id;

    v_total_paid := v_total_paid + v_taksit.tutar;
  END LOOP;

  -- 3. Avans oluşturulurken yapılan bakiye değişikliklerini geri al
  -- Kredi kartı bakiyesinden avans geri ödeme tutarını çıkar (avans alınırken eklenmişti)
  UPDATE hesaplar
  SET balance = balance - v_avans.geri_odeme_tutari,
      updated_at = NOW()
  WHERE id = v_avans.kredi_karti_id;

  -- Hedef hesaptan avans tutarını çıkar (avans alınırken eklenmişti)
  IF v_avans.hedef_hesap_id IS NOT NULL THEN
    UPDATE hesaplar
    SET balance = balance - v_avans.tutar,
        updated_at = NOW()
    WHERE id = v_avans.hedef_hesap_id;
  END IF;

  -- 4. İlgili işlem kayıtlarını sil (kredi kartı ekstresindeki nakit_avans_taksit işlemleri)
  DELETE FROM islemler
  WHERE isletme_id = p_isletme_id
    AND type = 'nakit_avans_taksit'
    AND hesap_id = v_avans.kredi_karti_id
    AND date >= v_avans.tarih::date;

  -- 5. Taksitleri sil
  DELETE FROM nakit_avans_taksitler
  WHERE nakit_avans_id = p_avans_id;

  -- 6. Avansı sil
  DELETE FROM nakit_avanslar
  WHERE id = p_avans_id
    AND isletme_id = p_isletme_id;
END;
$$;

-- Fonksiyon için yorum ekle
COMMENT ON FUNCTION delete_nakit_avans_with_reversal(UUID, UUID) IS 
  'Nakit avans silinirken tüm bakiye değişikliklerini atomik olarak geri alır';

-- Grant execute permission
GRANT EXECUTE ON FUNCTION delete_nakit_avans_with_reversal(UUID, UUID) TO authenticated;
