-- Fix: personel_izin_hakki ve personel_izin_kullanimi type'larını constraint'e ekle
-- Önceki migration uygulanmış ancak constraint güncellenmemiş olabilir

BEGIN;

-- Mevcut constraint'i kaldır
ALTER TABLE islemler DROP CONSTRAINT IF EXISTS islemler_type_check;

-- Yeni constraint: tüm type'lar dahil
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
