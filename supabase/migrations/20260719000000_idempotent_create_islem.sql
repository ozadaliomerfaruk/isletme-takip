-- IDEMPOTENT CREATE: create_islem_atomik + create_islem_with_urun_atomik'e client-uretimi
-- id ile idempotent davranis ekle. Zayif agda kayit yolu 15sn timeout'a takilip React Query
-- retry'a girince (VEYA istek sunucuda basarili olup yaniti timeout'a ugrayinca) AYNI kayit
-- ikinci kez gonderilebiliyordu -> MUKERRER islem + CIFT bakiye/stok riski. Cozum: istemci
-- kaydin id'sini uretip p_new_row.id olarak gonderir; RPC ayni id ikinci kez gelirse
-- INSERT'i ON CONFLICT DO NOTHING ile atlar ve bakiye/urun ops'larini TEKRAR UYGULAMAZ,
-- var olan satiri geri dondurur -> retry guvenli (tam-olarak-bir-kez).
--
-- GERIYE UYUMLU / ADDITIVE (yeni tablo/kolon YOK, yalniz CREATE OR REPLACE govde):
--   * Mevcut client'lar (build 68 ve oncesi) p_new_row'da id GONDERMEZ -> v_id =
--     gen_random_uuid() ile uretilir, ON CONFLICT hicbir zaman tetiklenmez, v_rowcount=1
--     -> bakiye/urun ops'lari HER ZAMAN uygulanir = BUGUNKU DAVRANISLA BIREBIR AYNI.
--   * Yeni client (build 69+) id gonderir -> idempotency devreye girer.
--   * Tum izin-gate'ler (20260716030000) AYNEN korunur.
-- Bakiye/stok MATEMATIGI degismez (istemci computeBalanceOps ile hesaplar) -> parite tam.

-- =============================================================================
-- 1) create_islem_atomik — idempotent (islemler.can_create gate korunur)
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
  -- Idempotency anahtari: istemci id verdiyse onu kullan (retry ayni id ile gelir), yoksa uret.
  v_id := COALESCE(NULLIF(p_new_row->>'id', '')::uuid, gen_random_uuid());

  INSERT INTO islemler (
    id, isletme_id, type, amount, description, date,
    hesap_id, hedef_hesap_id, kategori_id, cari_id, personel_id,
    source_currency, target_currency, exchange_rate, photo_path, date_end, source_ileri_id
  ) VALUES (
    v_id, p_isletme_id, r.type, r.amount, r.description, r.date,
    r.hesap_id, r.hedef_hesap_id, r.kategori_id, r.cari_id, r.personel_id,
    r.source_currency, r.target_currency, r.exchange_rate, r.photo_path, r.date_end, r.source_ileri_id
  )
  ON CONFLICT (id) DO NOTHING;

  GET DIAGNOSTICS v_rowcount = ROW_COUNT;

  -- Bakiye ops'lari YALNIZ satir GERCEKTEN insert edildiyse uygulanir. Retry'da (id zaten
  -- vardi -> v_rowcount=0) TEKRAR UYGULANMAZ -> cift bakiye yok.
  IF v_rowcount > 0 THEN
    FOR op IN SELECT * FROM jsonb_array_elements(COALESCE(p_balance_ops, '[]'::jsonb))
    LOOP
      PERFORM public.increment_balance(op->>'t', (op->>'id')::uuid, (op->>'d')::numeric);
    END LOOP;
  END IF;

  -- Var olan (yeni ya da onceki denemeden) satiri dondur. isletme_id ile guard: farkli
  -- kiracinin id'siyle cakisma (astronomik) durumunda veri sizmaz (NULL'a duser -> RAISE).
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
-- 2) create_islem_with_urun_atomik — idempotent (islemler.can_create + urunler modulu korunur)
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
    source_currency, target_currency, exchange_rate, photo_path, date_end, source_ileri_id
  ) VALUES (
    v_id, p_isletme_id, r.type, r.amount, r.description, r.date,
    r.hesap_id, r.hedef_hesap_id, r.kategori_id, r.cari_id, r.personel_id,
    r.source_currency, r.target_currency, r.exchange_rate, r.photo_path, r.date_end, r.source_ileri_id
  )
  ON CONFLICT (id) DO NOTHING;

  GET DIAGNOSTICS v_rowcount = ROW_COUNT;

  -- Bakiye VE urun ops'lari YALNIZ gercek insert'te. Retry (v_rowcount=0) hicbir sey
  -- tekrar uygulamaz -> ne cift bakiye ne cift stok/hareket.
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
