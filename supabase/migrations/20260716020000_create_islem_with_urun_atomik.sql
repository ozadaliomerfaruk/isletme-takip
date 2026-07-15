-- Cari-baglantili URUN'lu islem create'i TEK transaction'da: islem + bakiye ops + N urun
-- kalemi (stok guncelle + hareket yaz). create_islem_atomik'in urunlu kardesi.
--
-- SORUN: useCreateUrunHareketWithCari / useCreateBulkUrunHareketWithCari 4+ adimi
-- (islem insert -> cari increment -> her urun: stok RPC + hareket insert) ayri ayri
-- yapiyordu; ortada patlarsa "best-effort" rollback catch'i YUTULUYORDU -> kismi stok/bakiye.
--
-- COZUM: hepsi tek transaction. Bakiye deltalari (p_balance_ops) ve tutar istemcide
-- (computeBalanceOps + KDV) hesaplanir -> matematik SQL'e tasinmaz, mevcut davranistan
-- ayrilma riski minimum. Stok icin mevcut update_urun_miktar RPC'si (ayni mantik) kullanilir.
--
-- ADDITIVE: yeni fonksiyon; hicbir mevcut istemci cagirmaz.

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

  -- 1) islem insert (create_islem_atomik ile AYNI kolonlar; isletme_id zorlanir)
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

  -- 2) bakiye ops (cari/hesap/personel)
  FOR op IN SELECT * FROM jsonb_array_elements(COALESCE(p_balance_ops, '[]'::jsonb))
  LOOP
    PERFORM public.increment_balance(op->>'t', (op->>'id')::uuid, (op->>'d')::numeric);
  END LOOP;

  -- 3) urun kalemleri: her biri stok guncelle (mevcut RPC) + hareket yaz
  FOR it IN SELECT * FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb))
  LOOP
    v_degisim := CASE it->>'hareket_tipi'
      WHEN 'giris' THEN abs((it->>'miktar')::numeric)
      WHEN 'cikis' THEN -abs((it->>'miktar')::numeric)
      ELSE (it->>'miktar')::numeric   -- duzeltme: ham
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

-- update/delete/create_islem_atomik ile ayni postur: yalniz authenticated.
REVOKE ALL ON FUNCTION public.create_islem_with_urun_atomik(uuid, jsonb, jsonb, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_islem_with_urun_atomik(uuid, jsonb, jsonb, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_islem_with_urun_atomik(uuid, jsonb, jsonb, jsonb) TO authenticated;
