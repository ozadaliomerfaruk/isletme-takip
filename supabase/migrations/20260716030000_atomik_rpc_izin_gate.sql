-- GUVENLIK: Atomik/stok SECURITY DEFINER RPC'lerine GRANULER IZIN kontrolu ekle.
--
-- SORUN (bug taramasi #3,#4,#8,#9): create/update/delete_islem_atomik,
-- create_islem_with_urun_atomik, reapply_urun_hareketler_for_islem, set_urun_miktar_hedef,
-- update_urun_miktar SECURITY DEFINER + yalnizca user_has_isletme_access (UYELIK) kontrol
-- ediyordu. SECURITY DEFINER RLS'i BAYPASLAR; dolayisiyla paylasilan bir isletmede KISITLI
-- bir uye (or. yalniz goruntuleme) bu RPC'leri DOGRUDAN cagirip RLS'in engelleyecegi
-- islemleri (baskasinin islemini sil/duzenle, yetkisiz olustur, stok oynat) yapabiliyordu.
-- Bu, atomik-RPC gecisiyle olusan bir gerileme: eski client-yol RLS ile kisitliydi.
--
-- COZUM: Her RPC'ye, ilgili RLS politikasinin AYNISINI (owner OR aktif-uye + izin) yansitan
-- guard eklenir. Kontrol ifadeleri 20260224000002_multi_user_rls_policies.sql ile BIREBIR
-- ayni JSON yollarini kullanir -> davranis RLS ile tutarli.
--
-- MEVCUT KULLANICIYA ETKI YOK:
--   * Owner (tek-kullanicili isletmeler = ezici cogunluk) owner-branch ile HER ZAMAN gecer.
--   * Gerekli izne sahip uyeler gecer (UI zaten bu izinlerle gate'li -> mesru uye etkilenmez).
--   * Yalniz izinsiz DOGRUDAN-RPC cagrisi bloklanir (guvenlik duzeltmesi).
--
-- NOT (bu turda kapsamda DEGIL, ayri residual): increment_balance dogrudan client'tan
-- cagrilabiliyor ve yalniz uyelik-scope'lu (izin degil). Bu ONCEDEN vardi (atomik RPC
-- oncesi tum bakiye yollari onu kullaniyordu) -> ayri, dikkatli bir tasarim gerektirir.
--
-- ADDITIF: yalniz CREATE OR REPLACE (fonksiyon govdesine STRICTER guard). Yeni tablo/kolon yok.

-- =============================================================================
-- 1) YARDIMCI FONKSIYONLAR (owner OR aktif-uye + izin) — RLS ifadeleriyle birebir
-- =============================================================================

-- islemler eylem izni: owner VEYA (aktif uye AND ilgili izin). update/delete icin
-- 'own' kolu p_row_created_by ile (RLS'teki islemler.created_by = auth.uid() esdegeri).
CREATE OR REPLACE FUNCTION public.user_can_islem_action(
  p_isletme_id uuid,
  p_action text,          -- 'create' | 'update' | 'delete'
  p_row_created_by uuid   -- islem.created_by; 'create' icin NULL gecilir
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    EXISTS (SELECT 1 FROM isletmeler WHERE id = p_isletme_id AND user_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM isletme_users iu
      WHERE iu.isletme_id = p_isletme_id AND iu.user_id = auth.uid() AND iu.status = 'active'
      AND CASE p_action
        WHEN 'create' THEN
          COALESCE((iu.permissions->'actions'->'islemler'->>'can_create')::boolean, false)
        WHEN 'update' THEN (
          COALESCE((iu.permissions->'actions'->'islemler'->>'can_update_all')::boolean, false)
          OR (COALESCE((iu.permissions->'actions'->'islemler'->>'can_update_own')::boolean, false)
              AND p_row_created_by = auth.uid())
        )
        WHEN 'delete' THEN (
          COALESCE((iu.permissions->'actions'->'islemler'->>'can_delete_all')::boolean, false)
          OR (COALESCE((iu.permissions->'actions'->'islemler'->>'can_delete_own')::boolean, false)
              AND p_row_created_by = auth.uid())
        )
        ELSE false
      END
    );
$$;

-- modul erisimi: owner VEYA (aktif uye AND permissions.modules.<modul> = true)
CREATE OR REPLACE FUNCTION public.user_has_module_access(
  p_isletme_id uuid,
  p_module text
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    EXISTS (SELECT 1 FROM isletmeler WHERE id = p_isletme_id AND user_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM isletme_users iu
      WHERE iu.isletme_id = p_isletme_id AND iu.user_id = auth.uid() AND iu.status = 'active'
      AND COALESCE((iu.permissions->'modules'->>p_module)::boolean, false)
    );
$$;

REVOKE EXECUTE ON FUNCTION public.user_can_islem_action(uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_can_islem_action(uuid, text, uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.user_has_module_access(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_has_module_access(uuid, text) TO authenticated;

-- =============================================================================
-- 2) create_islem_atomik — islemler.can_create gate
-- =============================================================================
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
  v_result jsonb;
BEGIN
  IF NOT public.user_has_isletme_access(p_isletme_id) THEN
    RAISE EXCEPTION 'Yetkisiz erisim' USING ERRCODE = '42501';
  END IF;
  IF NOT public.user_can_islem_action(p_isletme_id, 'create', NULL) THEN
    RAISE EXCEPTION 'Bu islem icin yetkiniz yok (islem olusturma)' USING ERRCODE = '42501';
  END IF;

  r := jsonb_populate_record(NULL::public.islemler, p_new_row);
  INSERT INTO islemler (
    isletme_id, type, amount, description, date,
    hesap_id, hedef_hesap_id, kategori_id, cari_id, personel_id,
    source_currency, target_currency, exchange_rate, photo_path, date_end, source_ileri_id
  ) VALUES (
    p_isletme_id, r.type, r.amount, r.description, r.date,
    r.hesap_id, r.hedef_hesap_id, r.kategori_id, r.cari_id, r.personel_id,
    r.source_currency, r.target_currency, r.exchange_rate, r.photo_path, r.date_end, r.source_ileri_id
  )
  RETURNING id INTO v_id;

  FOR op IN SELECT * FROM jsonb_array_elements(COALESCE(p_balance_ops, '[]'::jsonb))
  LOOP
    PERFORM public.increment_balance(op->>'t', (op->>'id')::uuid, (op->>'d')::numeric);
  END LOOP;

  SELECT to_jsonb(i) INTO v_result FROM islemler i WHERE i.id = v_id;
  RETURN v_result;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.create_islem_atomik(uuid, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_islem_atomik(uuid, jsonb, jsonb) TO authenticated;

-- =============================================================================
-- 3) update_islem_atomik — islemler.can_update (own/all) gate
-- =============================================================================
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
BEGIN
  IF NOT public.user_has_isletme_access(p_isletme_id) THEN
    RAISE EXCEPTION 'Yetkisiz erisim' USING ERRCODE = '42501';
  END IF;

  SELECT created_by INTO v_created_by
  FROM islemler WHERE id = p_islem_id AND isletme_id = p_isletme_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Islem bulunamadi veya bu isletmeye ait degil (islem_id: %)', p_islem_id;
  END IF;

  IF NOT public.user_can_islem_action(p_isletme_id, 'update', v_created_by) THEN
    RAISE EXCEPTION 'Bu islemi guncelleme yetkiniz yok' USING ERRCODE = '42501';
  END IF;

  -- 1. NET bakiye ops (reverse-old + apply-new)
  FOR op IN SELECT * FROM jsonb_array_elements(COALESCE(p_balance_ops, '[]'::jsonb))
  LOOP
    PERFORM public.increment_balance(op->>'t', (op->>'id')::uuid, (op->>'d')::numeric);
  END LOOP;

  -- 2. Islem satirini guncelle (yalniz uygulamanin degistirdigi kolonlar)
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
    date_end        = r.date_end
  WHERE id = p_islem_id AND isletme_id = p_isletme_id;

  SELECT to_jsonb(i) INTO v_result FROM islemler i WHERE i.id = p_islem_id AND i.isletme_id = p_isletme_id;
  RETURN v_result;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.update_islem_atomik(uuid, uuid, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_islem_atomik(uuid, uuid, jsonb, jsonb) TO authenticated;

-- =============================================================================
-- 4) delete_islem_atomik — islemler.can_delete (own/all) gate.
--    Stok geri-almasi INLINE yapilir (update_urun_miktar yerine) -> silme yetkisi olan
--    ama urunler modulu OLMAYAN uye, urunlu bir islemi yine de tam silebilir (sistem
--    temizligi, urun yonetimi degil). Boylece update_urun_miktar modul-gate'i bu yolu bozmaz.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.delete_islem_atomik(
  p_isletme_id uuid,
  p_islem_id uuid,
  p_balance_ops jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  op jsonb;
  v_h record;
  v_created_by uuid;
BEGIN
  IF NOT public.user_has_isletme_access(p_isletme_id) THEN
    RAISE EXCEPTION 'Yetkisiz erisim' USING ERRCODE = '42501';
  END IF;

  SELECT created_by INTO v_created_by
  FROM islemler WHERE id = p_islem_id AND isletme_id = p_isletme_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Islem bulunamadi veya bu isletmeye ait degil (islem_id: %)', p_islem_id;
  END IF;

  IF NOT public.user_can_islem_action(p_isletme_id, 'delete', v_created_by) THEN
    RAISE EXCEPTION 'Bu islemi silme yetkiniz yok' USING ERRCODE = '42501';
  END IF;

  -- 1. Bakiye geri-alma ops'lari
  FOR op IN SELECT * FROM jsonb_array_elements(COALESCE(p_balance_ops, '[]'::jsonb))
  LOOP
    PERFORM public.increment_balance(op->>'t', (op->>'id')::uuid, (op->>'d')::numeric);
  END LOOP;

  -- 2. Bagli urun hareketlerinin stok etkisini geri al (INLINE; update_urun_miktar ile
  --    ayni matematik: giris'i geri sar = -ABS, cikis'i geri sar = +ABS). Bu bir sistem
  --    temizligidir (silinen islemin yan etkisini geri alir), ayri urun yetkisi gerektirmez.
  FOR v_h IN
    SELECT urun_id, hareket_tipi, miktar
    FROM urun_hareketler
    WHERE islem_id = p_islem_id AND isletme_id = p_isletme_id
  LOOP
    UPDATE urunler
    SET miktar = miktar + CASE
          WHEN v_h.hareket_tipi = 'giris' THEN -ABS(v_h.miktar)
          WHEN v_h.hareket_tipi = 'cikis' THEN  ABS(v_h.miktar)
          ELSE -v_h.miktar
        END,
        updated_at = NOW()
    WHERE id = v_h.urun_id AND isletme_id = p_isletme_id;
  END LOOP;

  -- 3. Urun hareketlerini sil
  DELETE FROM urun_hareketler WHERE islem_id = p_islem_id AND isletme_id = p_isletme_id;

  -- 4. Islemi sil
  DELETE FROM islemler WHERE id = p_islem_id AND isletme_id = p_isletme_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.delete_islem_atomik(uuid, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_islem_atomik(uuid, uuid, jsonb) TO authenticated;

-- =============================================================================
-- 5) create_islem_with_urun_atomik — islemler.can_create + urunler modulu gate
-- =============================================================================
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
  INSERT INTO islemler (
    isletme_id, type, amount, description, date,
    hesap_id, hedef_hesap_id, kategori_id, cari_id, personel_id,
    source_currency, target_currency, exchange_rate, photo_path, date_end, source_ileri_id
  ) VALUES (
    p_isletme_id, r.type, r.amount, r.description, r.date,
    r.hesap_id, r.hedef_hesap_id, r.kategori_id, r.cari_id, r.personel_id,
    r.source_currency, r.target_currency, r.exchange_rate, r.photo_path, r.date_end, r.source_ileri_id
  )
  RETURNING id INTO v_id;

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

  SELECT to_jsonb(i) INTO v_result FROM islemler i WHERE i.id = v_id;
  RETURN v_result;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.create_islem_with_urun_atomik(uuid, jsonb, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_islem_with_urun_atomik(uuid, jsonb, jsonb, jsonb) TO authenticated;

-- =============================================================================
-- 6) reapply_urun_hareketler_for_islem — islemler.can_update (own/all) + urunler modulu
--    (urunlu islem DUZENLEME yolu; ayni guvenlik sinifi).
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
  v_created_by uuid;
BEGIN
  IF NOT user_has_isletme_access(p_isletme_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  SELECT created_by INTO v_created_by
  FROM islemler WHERE id = p_islem_id AND isletme_id = p_isletme_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Islem bulunamadi veya bu isletmeye ait degil (islem_id: %)', p_islem_id;
  END IF;

  IF NOT public.user_can_islem_action(p_isletme_id, 'update', v_created_by) THEN
    RAISE EXCEPTION 'Bu islemi guncelleme yetkiniz yok' USING ERRCODE = '42501';
  END IF;
  IF NOT public.user_has_module_access(p_isletme_id, 'urunler') THEN
    RAISE EXCEPTION 'Urun modulu icin yetkiniz yok' USING ERRCODE = '42501';
  END IF;

  -- 1. Mevcut bagli hareketlerin stok etkisini ters cevir
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

  -- 2. Eski hareket satirlarini sil
  DELETE FROM urun_hareketler
  WHERE islem_id = p_islem_id AND isletme_id = p_isletme_id;

  -- 3. Guncel satirlari yeniden olustur (varsa) ve stogu uygula
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

REVOKE EXECUTE ON FUNCTION public.reapply_urun_hareketler_for_islem(uuid, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reapply_urun_hareketler_for_islem(uuid, uuid, jsonb) TO authenticated;

-- =============================================================================
-- 7) set_urun_miktar_hedef — urunler modulu gate (stok duzeltme; yalniz client-cagirir,
--    ic cagri yok -> guvenle gate'lenir).
-- =============================================================================
CREATE OR REPLACE FUNCTION public.set_urun_miktar_hedef(
  p_isletme_id uuid,
  p_urun_id uuid,
  p_hedef numeric,
  p_created_at timestamptz DEFAULT NULL,
  p_aciklama text DEFAULT NULL
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_mevcut numeric;
  v_delta numeric;
BEGIN
  IF NOT public.user_has_isletme_access(p_isletme_id) THEN
    RAISE EXCEPTION 'Yetkisiz erisim' USING ERRCODE = '42501';
  END IF;
  IF NOT public.user_has_module_access(p_isletme_id, 'urunler') THEN
    RAISE EXCEPTION 'Urun modulu icin yetkiniz yok' USING ERRCODE = '42501';
  END IF;

  IF p_hedef IS NULL OR p_hedef < 0 THEN
    RAISE EXCEPTION 'Gecersiz hedef miktar: %', p_hedef;
  END IF;

  SELECT miktar INTO v_mevcut
  FROM urunler
  WHERE id = p_urun_id AND isletme_id = p_isletme_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Urun bulunamadi veya bu isletmeye ait degil (urun_id: %)', p_urun_id;
  END IF;

  v_delta := p_hedef - v_mevcut;

  IF v_delta = 0 THEN
    RETURN v_mevcut;
  END IF;

  UPDATE urunler SET miktar = p_hedef, updated_at = NOW()
  WHERE id = p_urun_id AND isletme_id = p_isletme_id;

  INSERT INTO urun_hareketler (
    isletme_id, urun_id, islem_id, hareket_tipi, miktar,
    birim_fiyat, kdv_orani, onceki_miktar, yeni_miktar, aciklama, created_at
  ) VALUES (
    p_isletme_id, p_urun_id, NULL, 'duzeltme', v_delta,
    NULL, NULL, v_mevcut, p_hedef, p_aciklama, COALESCE(p_created_at, NOW())
  );

  RETURN p_hedef;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.set_urun_miktar_hedef(uuid, uuid, numeric, timestamptz, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_urun_miktar_hedef(uuid, uuid, numeric, timestamptz, text) TO authenticated;

-- =============================================================================
-- 8) update_urun_miktar — urunler modulu gate (yalniz p_isletme_id verilince).
--    Dogrudan stok giris/cikis/geri-alma yolu. delete_islem_atomik artik stogu INLINE
--    geri aliyor (bu fonksiyonu cagirmiyor); create_islem_with_urun_atomik cagirani zaten
--    urunler-modulu gate'inden gecmis olur -> ic cagri gecer. NULL p_isletme_id (legacy
--    backward-compat) yolu dokunulmadan birakilir (mevcut cagiranlar hep isletme_id gonderir).
-- =============================================================================
CREATE OR REPLACE FUNCTION update_urun_miktar(
  p_urun_id UUID,
  p_miktar_degisim NUMERIC,
  p_isletme_id UUID DEFAULT NULL
) RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_yeni_miktar NUMERIC;
BEGIN
  IF p_isletme_id IS NOT NULL THEN
    IF NOT public.user_has_module_access(p_isletme_id, 'urunler') THEN
      RAISE EXCEPTION 'Urun modulu icin yetkiniz yok' USING ERRCODE = '42501';
    END IF;
    UPDATE urunler
    SET miktar = miktar + p_miktar_degisim,
        updated_at = NOW()
    WHERE id = p_urun_id
      AND isletme_id = p_isletme_id
    RETURNING miktar INTO v_yeni_miktar;
  ELSE
    -- Backward compatibility: isletme_id'siz eski cagrilar (gate uygulanamaz, isletme scope yok)
    UPDATE urunler
    SET miktar = miktar + p_miktar_degisim,
        updated_at = NOW()
    WHERE id = p_urun_id
    RETURNING miktar INTO v_yeni_miktar;
  END IF;

  IF v_yeni_miktar IS NULL THEN
    RAISE EXCEPTION 'update_urun_miktar: urun bulunamadi veya bu isletmeye ait degil (urun_id: %, isletme_id: %)', p_urun_id, p_isletme_id;
  END IF;

  RETURN v_yeni_miktar;
END;
$$;
