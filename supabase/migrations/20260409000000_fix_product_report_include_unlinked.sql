-- Fix: Cariye bağlı olmayan ürün hareketleri (toplu giriş/çıkış) alış-satış raporunda gözükmüyor
-- Sorun: INNER JOIN islemler, islem_id NULL olan urun_hareketler kayıtlarını filtreliyor
-- Çözüm: LEFT JOIN + hareket_tipi bazlı filtreleme

DROP FUNCTION IF EXISTS get_product_report(UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT[]);

CREATE OR REPLACE FUNCTION get_product_report(
  p_isletme_id UUID,
  p_start_date TIMESTAMPTZ,
  p_end_date TIMESTAMPTZ,
  p_islem_types TEXT[]
)
RETURNS TABLE(
  urun_id UUID,
  urun_adi TEXT,
  urun_birim TEXT,
  kategori_id UUID,
  kategori_adi TEXT,
  toplam_miktar NUMERIC,
  toplam_tutar NUMERIC,
  toplam_tutar_kdvsiz NUMERIC,
  islem_sayisi BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    u.id as urun_id,
    u.ad::TEXT as urun_adi,
    u.birim::TEXT as urun_birim,
    k.id as kategori_id,
    k.name::TEXT as kategori_adi,
    SUM(ABS(uh.miktar)) as toplam_miktar,
    SUM(ABS(uh.miktar) * COALESCE(uh.birim_fiyat, 0) * (1 + COALESCE(uh.kdv_orani, 0) / 100.0)) as toplam_tutar,
    SUM(ABS(uh.miktar) * COALESCE(uh.birim_fiyat, 0)) as toplam_tutar_kdvsiz,
    COUNT(DISTINCT COALESCE(uh.islem_id, uh.id)) as islem_sayisi
  FROM urun_hareketler uh
  INNER JOIN urunler u ON u.id = uh.urun_id
  LEFT JOIN kategoriler k ON u.kategori_id = k.id
  LEFT JOIN islemler i ON i.id = uh.islem_id
  LEFT JOIN hesaplar h ON i.hesap_id = h.id
  LEFT JOIN hesaplar hh ON i.hedef_hesap_id = hh.id
  WHERE uh.isletme_id = p_isletme_id
    AND (
      -- Durum 1: İşleme bağlı kayıtlar (mevcut mantık)
      (i.id IS NOT NULL
        AND i.type = ANY(p_islem_types)
        AND i.date >= p_start_date
        AND i.date <= p_end_date
        AND (h.id IS NULL OR h.is_active = true)
        AND (hh.id IS NULL OR hh.is_active = true)
      )
      OR
      -- Durum 2: İşleme bağlı OLMAYAN kayıtlar (toplu giriş/çıkış)
      (i.id IS NULL
        AND uh.created_at >= p_start_date
        AND uh.created_at <= p_end_date
        AND (
          ('cari_alis' = ANY(p_islem_types) AND uh.hareket_tipi = 'giris')
          OR
          (('cari_satis' = ANY(p_islem_types) OR 'personel_satis' = ANY(p_islem_types)) AND uh.hareket_tipi = 'cikis')
        )
      )
    )
  GROUP BY u.id, u.ad, u.birim, k.id, k.name
  ORDER BY SUM(ABS(uh.miktar) * COALESCE(uh.birim_fiyat, 0) * (1 + COALESCE(uh.kdv_orani, 0) / 100.0)) DESC;
END;
$$;
