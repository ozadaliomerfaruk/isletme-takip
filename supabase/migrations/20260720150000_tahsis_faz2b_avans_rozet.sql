-- =============================================================================
-- TAHSİS Faz 2b — avans oto-süpürme + cari liste rozeti RPC'si
-- =============================================================================
-- 1) tahsis_avans_supur: bir borç SONRADAN vade kazandığında (veya vadeli borç
--    geriye-tarihli girildiğinde) carinin DEFTER-DÖNEMİ ödemelerinin boşta kalan
--    (avans) kısmı yeni açık borçlara FIFO ile bağlanır.
--    KRİTİK SINIR: yalnız FAZ 2 GO-LIVE (2026-07-20) SONRASI oluşturulmuş ödemeler
--    taranır — legacy ödemeler (defter-öncesi tarih) ASLA otomatik mahsup edilmez;
--    onların "neyi ödediği" bilinemez, yanlış "ödendi" göstermek güven kırar.
--    Bakiyeye dokunmaz; islem_tahsis satırları her zaman silinebilir (geri alınabilir).
-- 2) create/update RPC'lerine süpürme kancası (yalnız vadeli borç doğduğunda).
-- 3) get_cari_vade_rozet: cariler listesi için işletme-geneli tek istekte
--    cari-bazlı gecikmiş kalan/adet (salt-okuma).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.tahsis_avans_supur(
  p_isletme_id uuid,
  p_cari_id uuid
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_o record;
BEGIN
  IF p_cari_id IS NULL THEN RETURN; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_cari_id::text, 42));

  -- Defter-dönemi (Faz 2 go-live sonrası) ödemelerinden boşta kalanı olanlar,
  -- eski ödemeden yeniye. tahsis_odeme_esitle boşta kalanı açık borçlara FIFO dağıtır.
  FOR v_o IN
    SELECT i.id
    FROM islemler i
    WHERE i.isletme_id = p_isletme_id
      AND i.cari_id = p_cari_id
      AND public.tahsis_borc_tipleri(i.type) IS NOT NULL
      AND i.created_at >= TIMESTAMPTZ '2026-07-20 00:00:00+00'  -- defter go-live sınırı
      AND public.tahsis_cari_etki(i.type, i.amount, i.exchange_rate, i.source_currency, i.target_currency)
          > COALESCE((SELECT SUM(t.tutar) FROM islem_tahsis t WHERE t.odeme_islem_id = i.id), 0)
    ORDER BY i.date ASC, i.created_at ASC
  LOOP
    PERFORM public.tahsis_odeme_esitle(p_isletme_id, v_o.id, NULL);
  END LOOP;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.tahsis_avans_supur(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- -----------------------------------------------------------------------------
-- create_islem_atomik: vadeli BORÇ doğduğunda avans süpür (gövde 20260720120000 + blok)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_islem_atomik(
  p_isletme_id uuid,
  p_new_row jsonb,
  p_balance_ops jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  op jsonb;
  r public.islemler;
  v_id uuid;
  v_rowcount integer;
  v_result jsonb;
BEGIN
  IF NOT public.user_has_isletme_access(p_isletme_id) THEN
    RAISE EXCEPTION 'Yetkisiz erisim' USING ERRCODE = '42501';
  END IF;
  IF NOT public.user_can_islem_action(p_isletme_id, 'create', NULL) THEN
    RAISE EXCEPTION 'Bu islem icin yetkiniz yok (islem olusturma)' USING ERRCODE = '42501';
  END IF;

  r := jsonb_populate_record(NULL::public.islemler, p_new_row);
  v_id := COALESCE(NULLIF(p_new_row->>'id', '')::uuid, gen_random_uuid());

  INSERT INTO islemler (
    id, isletme_id, type, amount, description, date,
    hesap_id, hedef_hesap_id, kategori_id, cari_id, personel_id,
    source_currency, target_currency, exchange_rate, photo_path, date_end, source_ileri_id,
    vade_tarihi
  ) VALUES (
    v_id, p_isletme_id, r.type, r.amount, r.description, r.date,
    r.hesap_id, r.hedef_hesap_id, r.kategori_id, r.cari_id, r.personel_id,
    r.source_currency, r.target_currency, r.exchange_rate, r.photo_path, r.date_end, r.source_ileri_id,
    r.vade_tarihi
  )
  ON CONFLICT (id) DO NOTHING;

  GET DIAGNOSTICS v_rowcount = ROW_COUNT;

  IF v_rowcount > 0 THEN
    FOR op IN SELECT * FROM jsonb_array_elements(COALESCE(p_balance_ops, '[]'::jsonb))
    LOOP
      PERFORM public.increment_balance(op->>'t', (op->>'id')::uuid, (op->>'d')::numeric);
    END LOOP;

    -- FAZ 2: ödeme-tipli işlem → oto-FIFO tahsis.
    IF r.cari_id IS NOT NULL AND public.tahsis_borc_tipleri(r.type) IS NOT NULL THEN
      PERFORM public.tahsis_odeme_esitle(p_isletme_id, v_id, NULL);
    END IF;

    -- FAZ 2b: vadeli BORÇ doğdu → defter-dönemi avanslar bu borca (ve diğer açıklara) süpürülür.
    -- (Sıra-bağımsızlık: önce tahsilat sonra vadeli satış girilse de defter aynı sonuca varır.)
    IF r.cari_id IS NOT NULL AND r.vade_tarihi IS NOT NULL AND r.type IN ('cari_satis', 'cari_alis') THEN
      PERFORM public.tahsis_avans_supur(p_isletme_id, r.cari_id);
    END IF;
  END IF;

  SELECT to_jsonb(i) INTO v_result FROM islemler i WHERE i.id = v_id AND i.isletme_id = p_isletme_id;
  IF v_result IS NULL THEN
    RAISE EXCEPTION 'create_islem_atomik: islem bulunamadi (id: %)', v_id;
  END IF;
  RETURN v_result;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.create_islem_atomik(uuid, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_islem_atomik(uuid, jsonb, jsonb) TO authenticated;

-- -----------------------------------------------------------------------------
-- create_islem_with_urun_atomik: aynı süpürme kancası (gövde 20260720120000 + blok)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_islem_with_urun_atomik(
  p_isletme_id uuid,
  p_new_row jsonb,
  p_balance_ops jsonb,
  p_items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  op jsonb;
  it jsonb;
  r public.islemler;
  v_id uuid;
  v_rowcount integer;
  v_degisim numeric;
  v_yeni numeric;
  v_result jsonb;
BEGIN
  IF NOT public.user_has_isletme_access(p_isletme_id) THEN
    RAISE EXCEPTION 'Yetkisiz erisim' USING ERRCODE = '42501';
  END IF;
  IF NOT public.user_can_islem_action(p_isletme_id, 'create', NULL) THEN
    RAISE EXCEPTION 'Bu islem icin yetkiniz yok (islem olusturma)' USING ERRCODE = '42501';
  END IF;
  IF NOT public.user_has_module_access(p_isletme_id, 'urunler') THEN
    RAISE EXCEPTION 'Urun modulu icin yetkiniz yok' USING ERRCODE = '42501';
  END IF;

  r := jsonb_populate_record(NULL::public.islemler, p_new_row);
  v_id := COALESCE(NULLIF(p_new_row->>'id', '')::uuid, gen_random_uuid());

  INSERT INTO islemler (
    id, isletme_id, type, amount, description, date,
    hesap_id, hedef_hesap_id, kategori_id, cari_id, personel_id,
    source_currency, target_currency, exchange_rate, photo_path, date_end, source_ileri_id,
    vade_tarihi
  ) VALUES (
    v_id, p_isletme_id, r.type, r.amount, r.description, r.date,
    r.hesap_id, r.hedef_hesap_id, r.kategori_id, r.cari_id, r.personel_id,
    r.source_currency, r.target_currency, r.exchange_rate, r.photo_path, r.date_end, r.source_ileri_id,
    r.vade_tarihi
  )
  ON CONFLICT (id) DO NOTHING;

  GET DIAGNOSTICS v_rowcount = ROW_COUNT;

  IF v_rowcount > 0 THEN
    FOR op IN SELECT * FROM jsonb_array_elements(COALESCE(p_balance_ops, '[]'::jsonb))
    LOOP
      PERFORM public.increment_balance(op->>'t', (op->>'id')::uuid, (op->>'d')::numeric);
    END LOOP;

    FOR it IN SELECT * FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb))
    LOOP
      v_degisim := CASE it->>'hareket_tipi'
        WHEN 'giris' THEN abs((it->>'miktar')::numeric)
        WHEN 'cikis' THEN -abs((it->>'miktar')::numeric)
        ELSE (it->>'miktar')::numeric
      END;

      v_yeni := public.update_urun_miktar((it->>'urun_id')::uuid, v_degisim, p_isletme_id);

      INSERT INTO urun_hareketler (
        isletme_id, urun_id, islem_id, hareket_tipi, miktar,
        birim_fiyat, kdv_orani, onceki_miktar, yeni_miktar, aciklama, created_at
      ) VALUES (
        p_isletme_id, (it->>'urun_id')::uuid, v_id, it->>'hareket_tipi', (it->>'miktar')::numeric,
        NULLIF(it->>'birim_fiyat','')::numeric, COALESCE((it->>'kdv_orani')::integer, 0),
        v_yeni - v_degisim, v_yeni, it->>'aciklama',
        COALESCE(NULLIF(it->>'created_at','')::timestamptz, now())
      );
    END LOOP;

    IF r.cari_id IS NOT NULL AND public.tahsis_borc_tipleri(r.type) IS NOT NULL THEN
      PERFORM public.tahsis_odeme_esitle(p_isletme_id, v_id, NULL);
    END IF;

    IF r.cari_id IS NOT NULL AND r.vade_tarihi IS NOT NULL AND r.type IN ('cari_satis', 'cari_alis') THEN
      PERFORM public.tahsis_avans_supur(p_isletme_id, r.cari_id);
    END IF;
  END IF;

  SELECT to_jsonb(i) INTO v_result FROM islemler i WHERE i.id = v_id AND i.isletme_id = p_isletme_id;
  IF v_result IS NULL THEN
    RAISE EXCEPTION 'create_islem_with_urun_atomik: islem bulunamadi (id: %)', v_id;
  END IF;
  RETURN v_result;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.create_islem_with_urun_atomik(uuid, jsonb, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_islem_with_urun_atomik(uuid, jsonb, jsonb, jsonb) TO authenticated;

-- -----------------------------------------------------------------------------
-- update_islem_atomik: borç vade KAZANIRSA süpür (gövde 20260720120000 + blok)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_islem_atomik(
  p_isletme_id uuid,
  p_islem_id uuid,
  p_balance_ops jsonb,
  p_new_row jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  op jsonb;
  r public.islemler;
  v_result jsonb;
  v_created_by uuid;
  v_old public.islemler;
  v_new public.islemler;
BEGIN
  IF NOT public.user_has_isletme_access(p_isletme_id) THEN
    RAISE EXCEPTION 'Yetkisiz erisim' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_old
  FROM islemler WHERE id = p_islem_id AND isletme_id = p_isletme_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Islem bulunamadi veya bu isletmeye ait degil (islem_id: %)', p_islem_id;
  END IF;
  v_created_by := v_old.created_by;

  IF NOT public.user_can_islem_action(p_isletme_id, 'update', v_created_by) THEN
    RAISE EXCEPTION 'Bu islemi guncelleme yetkiniz yok' USING ERRCODE = '42501';
  END IF;

  FOR op IN SELECT * FROM jsonb_array_elements(COALESCE(p_balance_ops, '[]'::jsonb))
  LOOP
    PERFORM public.increment_balance(op->>'t', (op->>'id')::uuid, (op->>'d')::numeric);
  END LOOP;

  r := jsonb_populate_record(NULL::public.islemler, p_new_row);
  UPDATE islemler SET
    type            = r.type,
    amount          = r.amount,
    description     = r.description,
    date            = r.date,
    hesap_id        = r.hesap_id,
    hedef_hesap_id  = r.hedef_hesap_id,
    kategori_id     = r.kategori_id,
    cari_id         = r.cari_id,
    personel_id     = r.personel_id,
    source_currency = r.source_currency,
    target_currency = r.target_currency,
    exchange_rate   = r.exchange_rate,
    photo_path      = r.photo_path,
    date_end        = r.date_end,
    vade_tarihi     = CASE WHEN p_new_row ? 'vade_tarihi'
                          THEN r.vade_tarihi
                          ELSE islemler.vade_tarihi END
  WHERE id = p_islem_id AND isletme_id = p_isletme_id;

  SELECT * INTO v_new FROM islemler WHERE id = p_islem_id AND isletme_id = p_isletme_id;

  IF public.tahsis_borc_tipleri(v_old.type) IS NOT NULL
     AND (v_new.type IS DISTINCT FROM v_old.type OR v_new.cari_id IS DISTINCT FROM v_old.cari_id) THEN
    DELETE FROM islem_tahsis WHERE odeme_islem_id = p_islem_id AND isletme_id = p_isletme_id;
  END IF;

  IF v_new.cari_id IS NOT NULL AND public.tahsis_borc_tipleri(v_new.type) IS NOT NULL THEN
    PERFORM public.tahsis_odeme_esitle(p_isletme_id, p_islem_id, NULL);
  END IF;

  IF EXISTS (SELECT 1 FROM islem_tahsis WHERE borc_islem_id = p_islem_id) THEN
    IF v_new.type IS DISTINCT FROM v_old.type
       OR v_new.cari_id IS DISTINCT FROM v_old.cari_id
       OR v_new.vade_tarihi IS NULL THEN
      PERFORM public.tahsis_borc_bosalt_ve_dagit(p_isletme_id, p_islem_id, NULL);
    ELSE
      PERFORM public.tahsis_borc_kirp_ve_dagit(p_isletme_id, p_islem_id);
    END IF;
  END IF;

  -- FAZ 2b: borç ŞİMDİ vadeli hâle geldiyse (vade eklendi / vadeli tipe döndü)
  -- defter-dönemi avansları süpür — kullanıcı "vadesiz satışa sonradan vade
  -- ekledim, önceki ödemem neden bağlanmadı" sürtünmesi kalksın.
  IF v_new.cari_id IS NOT NULL
     AND v_new.vade_tarihi IS NOT NULL
     AND v_new.type IN ('cari_satis', 'cari_alis')
     AND (v_old.vade_tarihi IS NULL
          OR v_old.type NOT IN ('cari_satis', 'cari_alis')
          OR v_new.cari_id IS DISTINCT FROM v_old.cari_id
          OR v_new.amount > v_old.amount) THEN
    PERFORM public.tahsis_avans_supur(p_isletme_id, v_new.cari_id);
  END IF;

  SELECT to_jsonb(i) INTO v_result FROM islemler i WHERE i.id = p_islem_id AND i.isletme_id = p_isletme_id;
  RETURN v_result;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.update_islem_atomik(uuid, uuid, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_islem_atomik(uuid, uuid, jsonb, jsonb) TO authenticated;

-- -----------------------------------------------------------------------------
-- get_cari_vade_rozet — cariler listesi rozetleri (salt-okuma, tek istek).
-- Dönüş: [{cari_id, currency, gecikmis_alacak, gecikmis_borc, gecikmis_adet}]
-- Yalnız kalan>0 ve vade<=bugün olan borçlar; boş liste = rozet yok.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_cari_vade_rozet(p_isletme_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
STABLE
AS $function$
DECLARE
  v_bugun date := (now() AT TIME ZONE 'Europe/Istanbul')::date;
  v_result jsonb;
BEGIN
  IF NOT public.user_has_isletme_access(p_isletme_id) THEN
    RAISE EXCEPTION 'Yetkisiz erisim' USING ERRCODE = '42501';
  END IF;

  WITH acik AS (
    SELECT i.cari_id, i.type,
      round(i.amount - COALESCE((
        SELECT SUM(t.tutar) FROM islem_tahsis t WHERE t.borc_islem_id = i.id
      ), 0), 2) AS kalan
    FROM islemler i
    WHERE i.isletme_id = p_isletme_id
      AND i.vade_tarihi IS NOT NULL
      AND i.vade_tarihi <= v_bugun
      AND i.type IN ('cari_satis', 'cari_alis')
      AND i.cari_id IS NOT NULL
  )
  SELECT COALESCE(jsonb_agg(x), '[]'::jsonb) INTO v_result
  FROM (
    SELECT jsonb_build_object(
      'cari_id', a.cari_id,
      'currency', COALESCE(c.currency, 'TRY'),
      'gecikmis_alacak', COALESCE(SUM(a.kalan) FILTER (WHERE a.type = 'cari_satis'), 0),
      'gecikmis_borc',   COALESCE(SUM(a.kalan) FILTER (WHERE a.type = 'cari_alis'), 0),
      'gecikmis_adet',   COUNT(*)
    ) AS x
    FROM acik a JOIN cariler c ON c.id = a.cari_id
    WHERE a.kalan > 0
    GROUP BY a.cari_id, c.currency
  ) s;

  RETURN v_result;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_cari_vade_rozet(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_cari_vade_rozet(uuid) TO authenticated;
