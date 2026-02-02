 -- Eski constraint'i sil
  ALTER TABLE islemler DROP CONSTRAINT islemler_type_check;

  -- Yeni constraint'i ekle (personel_satis dahil)
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
      'nakit_avans_taksit'
    ])
  );