-- =============================================================================
-- FIX: delete_nakit_avans_with_reversal - Schema Mismatch
-- =============================================================================
-- BUG: Mevcut fonksiyon nakit_avans_taksitler tablosunda var olmayan
-- 'odendi' ve 'source_hesap_id' kolonlarına referans veriyor.
-- Gerçek schema: status TEXT ('pending','paid','overdue'), source_hesap_id YOK.
--
-- FIX: odendi = true → status = 'paid'
--      source_hesap_id kaldırıldı (islemler tablosundan kaynak hesap bulunur)
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
  v_islem RECORD;
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
  -- FIX: status = 'paid' kullan (odendi = true yerine)
  FOR v_taksit IN
    SELECT * FROM nakit_avans_taksitler
    WHERE nakit_avans_id = p_avans_id
      AND status = 'paid'
  LOOP
    -- FIX: source_hesap_id taksitler tablosunda yok
    -- İlgili ödeme işleminden kaynak hesabı bul
    SELECT * INTO v_islem
    FROM islemler
    WHERE isletme_id = p_isletme_id
      AND type = 'nakit_avans_taksit'
      AND amount = v_taksit.tutar
      AND hesap_id = v_avans.kredi_karti_id
    ORDER BY date DESC
    LIMIT 1;

    -- Eğer kaynak hesap bilgisi olan işlem bulunduysa, kaynak hesaba parayı geri ekle
    IF v_islem IS NOT NULL AND v_islem.hedef_hesap_id IS NOT NULL THEN
      UPDATE hesaplar
      SET balance = balance + v_taksit.tutar,
          updated_at = NOW()
      WHERE id = v_islem.hedef_hesap_id;
    END IF;

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

COMMENT ON FUNCTION delete_nakit_avans_with_reversal(UUID, UUID) IS
  'Nakit avans silinirken tüm bakiye değişikliklerini atomik olarak geri alır (schema fix: status/source_hesap_id)';
