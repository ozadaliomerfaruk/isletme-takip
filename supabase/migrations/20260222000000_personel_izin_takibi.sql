-- Personel izin takibi: islemler type constraint'ine 2 yeni type ekle
-- personel_izin_hakki: izin hak edişi (amount = gün sayısı)
-- personel_izin_kullanimi: izin kullanımı (amount = gün sayısı)
--
-- GÜVENLİ MİGRASYON: Sadece yeni değerler eklenir.
-- Mevcut veriler etkilenmez çünkü tüm eski type'lar korunur.
-- Constraint DROP + ADD atomik bir transaction içinde çalışır.

BEGIN;

-- Mevcut constraint'i kaldır (yoksa hata vermez)
ALTER TABLE islemler DROP CONSTRAINT IF EXISTS islemler_type_check;

-- Yeni constraint: tüm mevcut type'lar + 2 yeni izin type'ı
ALTER TABLE islemler ADD CONSTRAINT islemler_type_check CHECK (
  type = ANY (ARRAY[
    'gelir',
    'gider',
    'transfer',
    'cari_alis',
    'cari_satis',
    'cari_odeme',
    'cari_tahsilat',
    'cari_alis_iade',
    'cari_satis_iade',
    'personel_gider',
    'personel_odeme',
    'personel_tahsilat',
    'personel_satis',
    'nakit_avans_taksit',
    'personel_izin_hakki',
    'personel_izin_kullanimi'
  ])
);

COMMIT;
