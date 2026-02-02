 -- Mevcut constraint'i kaldır
  ALTER TABLE islemler DROP CONSTRAINT IF EXISTS islemler_type_check;

  -- Yeni constraint ekle (iade tipleriyle birlikte)
  ALTER TABLE islemler ADD CONSTRAINT islemler_type_check
  CHECK (type::text = ANY (ARRAY[
    'gelir'::character varying,
    'gider'::character varying,
    'transfer'::character varying,
    'cari_alis'::character varying,
    'cari_satis'::character varying,
    'cari_odeme'::character varying,
    'cari_tahsilat'::character varying,
    'cari_alis_iade'::character varying,
    'cari_satis_iade'::character varying,
    'personel_gider'::character varying,
    'personel_odeme'::character varying
  ]));