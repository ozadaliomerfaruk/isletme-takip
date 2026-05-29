-- =============================================================================
-- Ürünlü işlem düzenlemesinde stok hareketlerini ATOMİK yeniden uygula (#6/D sertleştirme)
-- =============================================================================
-- İstemci tarafı çözümü (reverse + recreate, ayrı ağ çağrıları) stoğu doğru günceller
-- ama atomik değildi: arada bir hata olursa stok yarım kalabilirdi. Bu fonksiyon tüm
-- işi TEK transaction içinde yapar; herhangi bir adım hata verirse plpgsql tüm
-- değişiklikleri otomatik geri sarar -> stok ASLA tutarsız kalmaz.
--
-- Davranış:
--   1. Yetki kontrolü (sahip veya aktif üye).
--   2. islem'e bağlı mevcut urun_hareketler'in stok etkisini ters çevir + satırları sil.
--   3. p_items (JSON) içindeki güncel satırları yeni hareketler olarak ekle ve stoğu uygula.
--   p_items boş/[] ise yalnızca geri alma yapılır (işlemden ürünler kaldırılmış demektir).
--
-- p_items örnek: '[{"urun_id":"...","hareket_tipi":"cikis","miktar":5,"birim_fiyat":10,
--                   "kdv_orani":20,"aciklama":"..."}]'
--
-- Salt fonksiyon tanımı; tabloya veri yazmaz (çağrılınca iş yapar). Mevcut veriyi bozmaz.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.reapply_urun_hareketler_for_islem(
  p_isletme_id uuid,
  p_islem_id uuid,
  p_items jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r RECORD;
  v_item jsonb;
  v_tip text;
  v_miktar numeric;
  v_degisim numeric;
  v_yeni numeric;
  v_onceki numeric;
BEGIN
  -- Yetki: yalnızca sahip veya aktif üye
  IF NOT user_has_isletme_access(p_isletme_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  -- 1. Mevcut bağlı hareketlerin stok etkisini ters çevir
  FOR r IN
    SELECT urun_id, hareket_tipi, miktar
    FROM urun_hareketler
    WHERE islem_id = p_islem_id AND isletme_id = p_isletme_id
  LOOP
    IF r.hareket_tipi = 'giris' THEN
      v_degisim := -ABS(r.miktar);
    ELSIF r.hareket_tipi = 'cikis' THEN
      v_degisim := ABS(r.miktar);
    ELSE
      v_degisim := -r.miktar;
    END IF;

    UPDATE urunler SET miktar = miktar + v_degisim, updated_at = NOW()
    WHERE id = r.urun_id AND isletme_id = p_isletme_id;
  END LOOP;

  -- 2. Eski hareket satırlarını sil
  DELETE FROM urun_hareketler
  WHERE islem_id = p_islem_id AND isletme_id = p_isletme_id;

  -- 3. Güncel satırları yeniden oluştur (varsa) ve stoğu uygula
  IF p_items IS NOT NULL AND jsonb_typeof(p_items) = 'array' THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
      v_tip := v_item->>'hareket_tipi';
      v_miktar := (v_item->>'miktar')::numeric;

      IF v_tip = 'giris' THEN
        v_degisim := ABS(v_miktar);
      ELSIF v_tip = 'cikis' THEN
        v_degisim := -ABS(v_miktar);
      ELSE
        v_degisim := v_miktar;
      END IF;

      -- Önceki miktarı oku (hareket kaydının onceki_miktar'ı için)
      SELECT miktar INTO v_onceki FROM urunler
      WHERE id = (v_item->>'urun_id')::uuid AND isletme_id = p_isletme_id;

      IF v_onceki IS NULL THEN
        RAISE EXCEPTION 'reapply: urun bulunamadi (urun_id: %)', v_item->>'urun_id';
      END IF;

      UPDATE urunler SET miktar = miktar + v_degisim, updated_at = NOW()
      WHERE id = (v_item->>'urun_id')::uuid AND isletme_id = p_isletme_id
      RETURNING miktar INTO v_yeni;

      INSERT INTO urun_hareketler (
        isletme_id, urun_id, islem_id, hareket_tipi, miktar, birim_fiyat,
        kdv_orani, onceki_miktar, yeni_miktar, aciklama
      ) VALUES (
        p_isletme_id,
        (v_item->>'urun_id')::uuid,
        p_islem_id,
        v_tip,
        v_miktar,
        NULLIF(v_item->>'birim_fiyat','')::numeric,
        COALESCE(NULLIF(v_item->>'kdv_orani','')::integer, 0),
        v_onceki,
        v_yeni,
        NULLIF(v_item->>'aciklama','')
      );
    END LOOP;
  END IF;
END;
$function$;
