ALTER TABLE islemler DROP CONSTRAINT islemler_type_check;

ALTER TABLE islemler ADD CONSTRAINT islemler_type_check 
CHECK (type IN ('gelir', 'gider', 'transfer', 'cari_alis', 'cari_satis', 'cari_odeme', 'cari_tahsilat', 'personel_maas', 'personel_avans', 'personel_odeme', 'personel_gider'));
