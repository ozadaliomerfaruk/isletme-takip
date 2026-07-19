-- VADE (due date) — Faz 1: islemler'e vade_tarihi kolonu + 3 atomik create/update RPC'sinin
-- kolonu p_new_row jsonb'sinden geçirmesi. Taksit/Vade/FIFO planı Faz 1 (docs/TAKSIT-VADE-FIFO-PLAN.md).
--
-- NEDEN p_new_row jsonb (param DEĞİL): diğer 18 kolonla AYNI yoldan akar → RPC imzası DEĞİŞMEZ,
-- PostgREST overload/çözümleme derdi yok, geri-uyum otomatik. Eski client'lar (build 69 ve öncesi)
-- p_new_row'da vade_tarihi GÖNDERMEZ → jsonb_populate_record NULL üretir → davranış BUGÜNKÜYLE BİREBİR.
-- "1.5.x client'ı ne yaşar?" cevabı: hiçbir şey (kolon NULL kalır).
--
-- ADDITIVE + PARA-KODU GÜVENLİ: kolon nullable, backfill YOK, bakiye matematiği (computeBalanceOps)
-- DEĞİŞMEZ (vade yalnız saklanır; tahsis/gecikme Faz 2). İdempotency (ON CONFLICT) ve izin-gate'ler
-- (20260716030000) AYNEN korunur — RPC gövdeleri güncel canlı sürümler üzerine + tek satır vade.

-- 1) Kolon (nullable) + gelecekteki gecikme sorguları için partial index.
ALTER TABLE public.islemler ADD COLUMN IF NOT EXISTS vade_tarihi date;
CREATE INDEX IF NOT EXISTS idx_islemler_vade
  ON public.islemler (isletme_id, vade_tarihi)
  WHERE vade_tarihi IS NOT NULL;

-- =============================================================================
-- 2) create_islem_atomik — idempotency + izin-gate KORUNUR, INSERT'e vade_tarihi eklenir.
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

-- =============================================================================
-- 3) create_islem_with_urun_atomik — idempotency + izin-gate KORUNUR, INSERT'e vade_tarihi.
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

-- =============================================================================
-- 4) update_islem_atomik — izin-gate KORUNUR, UPDATE SET'e vade_tarihi (düzenlemede
--    vade'yi NULL'a çekmeyi de destekler: mergedRow.vade_tarihi null → SET null).
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
    -- ANAHTAR-VARLIĞI GUARD'I (Fable): p_new_row'da 'vade_tarihi' anahtarı VARSA (açık null
    -- dahil) onu kullan; YOKSA mevcut değeri KORU → anahtarı göndermeyen client vade'yi SESSİZCE
    -- SİLMEZ. (Mevcut update yolu p_new_row'u SELECT * mergedRow'dan kurduğu için anahtarı zaten
    -- taşır; guard ek emniyet: yeni-client'ın vade'yi undefined bırakıp JSON'un anahtarı
    -- düşürmesine + gelecekteki partial-row yollarına karşı.) islemler.vade_tarihi = eski değer.
    vade_tarihi     = CASE WHEN p_new_row ? 'vade_tarihi'
                          THEN r.vade_tarihi
                          ELSE islemler.vade_tarihi END
  WHERE id = p_islem_id AND isletme_id = p_isletme_id;

  SELECT to_jsonb(i) INTO v_result FROM islemler i WHERE i.id = p_islem_id AND i.isletme_id = p_isletme_id;
  RETURN v_result;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.update_islem_atomik(uuid, uuid, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_islem_atomik(uuid, uuid, jsonb, jsonb) TO authenticated;
