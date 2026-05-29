-- =============================================================================
-- FIX: Ürün (Alış-Satış) raporunda çok-para-birimi dönüşümü (A2)
-- =============================================================================
-- SORUN: get_product_report, urun_hareketler.birim_fiyat tutarlarını hiç kur
-- dönüşümü yapmadan topluyordu.
--
-- DOĞRULAMA (canlı veri): birim_fiyat, ürünün işaretli para biriminde (urunler.currency)
-- DEĞİL, İŞLEMİN para biriminde saklanıyor. Örn: USD olarak işaretli "Buckstar"
-- ürünü, TRY cariye TRY birim fiyatla satılmış (birim_fiyat=1000 TL, satır=islem.amount).
-- Bu yüzden urunler.currency ile çevirmek YANLIŞ olurdu (140.000 TL'yi 6,4M yapardı).
--
-- ÇÖZÜM (en güvenli): yalnızca İŞLEME BAĞLI hareketleri, bağlı işlemin para birimiyle
-- çevir (A1 ile aynı kural: COALESCE(hesap, cari, personel, 'TRY')). Satır değeri zaten
-- islem.amount'a eşit olduğundan bu doğru ve A1 ile tutarlı.
-- İşleme BAĞLI OLMAYAN (toplu giriş/çıkış) hareketlere DOKUNULMAZ (para birimi belirsiz;
-- mevcut davranış korunur) -> sıfır yeni hata riski.
--
-- NOT: Salt-okunur fonksiyon; veri/backfill yok. TRY işlemleri aynen kalır.
-- toplam_miktar (adet) çevrilmez; yalnızca tutar kolonları çevrilir.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_product_report(
  p_isletme_id uuid,
  p_start_date timestamp with time zone,
  p_end_date timestamp with time zone,
  p_islem_types text[]
)
 RETURNS TABLE(urun_id uuid, urun_adi text, urun_birim text, kategori_id uuid, kategori_adi text, toplam_miktar numeric, toplam_tutar numeric, toplam_tutar_kdvsiz numeric, islem_sayisi bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH rates AS (
    SELECT r.rates FROM exchange_rates r WHERE r.base_currency = 'TRY' LIMIT 1
  )
  SELECT
    u.id as urun_id,
    u.ad::TEXT as urun_adi,
    u.birim::TEXT as urun_birim,
    k.id as kategori_id,
    k.name::TEXT as kategori_adi,
    SUM(ABS(uh.miktar)) as toplam_miktar,
    SUM(
      ABS(uh.miktar) * COALESCE(uh.birim_fiyat, 0) * (1 + COALESCE(uh.kdv_orani, 0) / 100.0)
      * CASE
          WHEN i.id IS NULL THEN 1
          WHEN COALESCE(h.currency, c.currency, p.currency, 'TRY') = 'TRY' THEN 1
          ELSE COALESCE((SELECT (rt.rates->>COALESCE(h.currency, c.currency, p.currency))::DECIMAL FROM rates rt), 1)
        END
    ) as toplam_tutar,
    SUM(
      ABS(uh.miktar) * COALESCE(uh.birim_fiyat, 0)
      * CASE
          WHEN i.id IS NULL THEN 1
          WHEN COALESCE(h.currency, c.currency, p.currency, 'TRY') = 'TRY' THEN 1
          ELSE COALESCE((SELECT (rt.rates->>COALESCE(h.currency, c.currency, p.currency))::DECIMAL FROM rates rt), 1)
        END
    ) as toplam_tutar_kdvsiz,
    COUNT(DISTINCT COALESCE(uh.islem_id, uh.id)) as islem_sayisi
  FROM urun_hareketler uh
  INNER JOIN urunler u ON u.id = uh.urun_id
  LEFT JOIN kategoriler k ON u.kategori_id = k.id
  LEFT JOIN islemler i ON i.id = uh.islem_id
  LEFT JOIN hesaplar h ON i.hesap_id = h.id
  LEFT JOIN hesaplar hh ON i.hedef_hesap_id = hh.id
  LEFT JOIN cariler c ON i.cari_id = c.id
  LEFT JOIN personel p ON i.personel_id = p.id
  WHERE uh.isletme_id = p_isletme_id
    AND (
      -- Durum 1: İşleme bağlı kayıtlar
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
  ORDER BY 7 DESC;
END;
$function$;
