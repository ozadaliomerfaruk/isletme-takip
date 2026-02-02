-- Mevcut constraint'i kaldır
  ALTER TABLE islemler DROP CONSTRAINT IF EXISTS islemler_type_check;

  -- Yeni constraint'i ekle (nakit_avans_taksit dahil)
  ALTER TABLE islemler ADD CONSTRAINT islemler_type_check CHECK (
    type IN (
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
      'nakit_avans_taksit'
    )
  );