-- Migration: perform_nakit_avans RPC
-- Purpose: Atomik nakit avans işlemi - tüm bakiye güncellemeleri tek transaction'da

-- Nakit avans oluşturma RPC'si
-- Tek transaction içinde:
-- 1. NakitAvans kaydı oluştur
-- 2. Hedef hesaba para ekle
-- 3. Kredi kartı borcunu artır
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
AS $$
DECLARE
  v_nakit_avans_id uuid;
BEGIN
  -- Validasyonlar
  IF p_tutar <= 0 THEN
    RAISE EXCEPTION 'Tutar 0''dan büyük olmalıdır';
  END IF;

  IF p_geri_odeme_tutari <= 0 THEN
    RAISE EXCEPTION 'Geri ödeme tutarı 0''dan büyük olmalıdır';
  END IF;

  -- Hesapların aynı işletmeye ait olduğunu kontrol et
  IF NOT EXISTS (
    SELECT 1 FROM hesaplar 
    WHERE id = p_kredi_karti_id 
      AND isletme_id = p_isletme_id 
      AND type = 'kredi_karti'
  ) THEN
    RAISE EXCEPTION 'Geçersiz kredi kartı hesabı';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM hesaplar 
    WHERE id = p_hedef_hesap_id 
      AND isletme_id = p_isletme_id
  ) THEN
    RAISE EXCEPTION 'Geçersiz hedef hesap';
  END IF;

  -- 1. Hedef hesaba para ekle (nakit avans tutarı kadar)
  UPDATE hesaplar 
  SET balance = balance + p_tutar,
      updated_at = now()
  WHERE id = p_hedef_hesap_id 
    AND isletme_id = p_isletme_id;

  -- 2. Kredi kartı borcunu artır (geri ödeme tutarı kadar - negatif bakiye)
  UPDATE hesaplar 
  SET balance = balance - p_geri_odeme_tutari,
      updated_at = now()
  WHERE id = p_kredi_karti_id 
    AND isletme_id = p_isletme_id;

  -- 3. NakitAvans kaydı oluştur
  INSERT INTO nakit_avanslar (
    isletme_id,
    kredi_karti_id,
    hedef_hesap_id,
    tutar,
    geri_odeme_tutari,
    kategori_id,
    aciklama,
    tarih,
    is_taksitli,
    taksit_sayisi,
    status
  ) VALUES (
    p_isletme_id,
    p_kredi_karti_id,
    p_hedef_hesap_id,
    p_tutar,
    p_geri_odeme_tutari,
    p_kategori_id,
    p_aciklama,
    p_tarih,
    p_is_taksitli,
    p_taksit_sayisi,
    'active'
  )
  RETURNING id INTO v_nakit_avans_id;

  -- Hepsi başarılı - transaction otomatik commit olur
  RETURN v_nakit_avans_id;
END;
$$;

-- Taksit ödeme RPC'si
-- Tek transaction içinde:
-- 1. Taksiti ödenmiş olarak işaretle
-- 2. Kaynak hesaptan para çıkar
-- 3. Kredi kartı borcunu azalt
-- 4. Tüm taksitler ödendiyse avansı tamamla
CREATE OR REPLACE FUNCTION perform_taksit_odeme(
  p_taksit_id uuid,
  p_source_hesap_id uuid,
  p_isletme_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_taksit RECORD;
  v_avans RECORD;
  v_remaining_count integer;
BEGIN
  -- 1. Taksit ve avans bilgisini al (kilit ile)
  SELECT t.*, a.kredi_karti_id, a.id as avans_id
  INTO v_taksit
  FROM nakit_avans_taksitler t
  JOIN nakit_avanslar a ON t.nakit_avans_id = a.id
  WHERE t.id = p_taksit_id
    AND a.isletme_id = p_isletme_id
  FOR UPDATE;

  IF v_taksit IS NULL THEN
    RAISE EXCEPTION 'Taksit bulunamadı veya erişim yetkiniz yok';
  END IF;

  IF v_taksit.status = 'paid' THEN
    RAISE EXCEPTION 'Bu taksit zaten ödenmiş';
  END IF;

  -- Kaynak hesabın aynı işletmeye ait olduğunu kontrol et
  IF NOT EXISTS (
    SELECT 1 FROM hesaplar 
    WHERE id = p_source_hesap_id 
      AND isletme_id = p_isletme_id
  ) THEN
    RAISE EXCEPTION 'Geçersiz kaynak hesap';
  END IF;

  -- 2. Taksiti ödenmiş olarak işaretle
  UPDATE nakit_avans_taksitler
  SET status = 'paid',
      odenen_tarih = now(),
      updated_at = now()
  WHERE id = p_taksit_id;

  -- 3. Kaynak hesaptan para çıkar
  UPDATE hesaplar
  SET balance = balance - v_taksit.tutar,
      updated_at = now()
  WHERE id = p_source_hesap_id
    AND isletme_id = p_isletme_id;

  -- 4. Kredi kartı borcunu azalt (bakiyeyi artır)
  UPDATE hesaplar
  SET balance = balance + v_taksit.tutar,
      updated_at = now()
  WHERE id = v_taksit.kredi_karti_id
    AND isletme_id = p_isletme_id;

  -- 5. Kalan ödenmemiş taksit sayısını kontrol et
  SELECT COUNT(*) INTO v_remaining_count
  FROM nakit_avans_taksitler
  WHERE nakit_avans_id = v_taksit.avans_id
    AND status != 'paid';

  -- 6. Tüm taksitler ödendiyse avansı tamamla
  IF v_remaining_count = 0 THEN
    UPDATE nakit_avanslar
    SET status = 'completed',
        updated_at = now()
    WHERE id = v_taksit.avans_id;
  END IF;
END;
$$;

-- Yetkilendirme
GRANT EXECUTE ON FUNCTION perform_nakit_avans TO authenticated;
GRANT EXECUTE ON FUNCTION perform_taksit_odeme TO authenticated;

-- Dokümantasyon
COMMENT ON FUNCTION perform_nakit_avans IS 'Atomik nakit avans oluşturma - tüm bakiye güncellemeleri tek transaction içinde yapılır';
COMMENT ON FUNCTION perform_taksit_odeme IS 'Atomik taksit ödeme - kaynak hesap, kredi kartı ve taksit durumu tek transaction içinde güncellenir';
