-- CREATE atomikligi: islem INSERT + bakiye ops'lari TEK transaction'da uygula.
--
-- SORUN: useCreateIslem onceden satiri insert edip ardindan N ayri increment_balance
-- cagiriyordu (NON-ATOMIC). Iki-bacakli tiplerde (transfer, cari/personel odeme/tahsilat)
-- ikinci bacak patlarsa birincisi zaten commit'liydi; rollback yalniz islem satirini
-- siliyor, uygulanan bakiyeyi GERI ALMIYORDU -> zayif agda sessiz para kaybi/desync.
--
-- COZUM: update_islem_atomik / delete_islem_atomik ile AYNI desen. Istemci bakiye
-- deltalarini computeBalanceOps (tek kaynak, birim-testli) ile hesaplar ve p_balance_ops
-- olarak gonderir; bu RPC hem insert'i hem ops'lari tek transaction'da uygular ->
-- ya hepsi ya hicbiri. Bakiye MATEMATIGI SQL'e tasinmaz (istemci hesaplar) -> mevcut
-- davranistan ayrilma riski SIFIR.
--
-- ADDITIVE + GERIYE UYUMLU: yeni fonksiyon. Eski uygulama istemcileri eski insert+increment
-- yolunu kullanmaya devam eder; hicbir sekilde etkilenmez. Yalniz yeni build bu RPC'yi cagirir.

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

  -- p_new_row'dan yalniz yazilabilir kolonlari al; isletme_id ZORLA (istemciye guvenme),
  -- id/created_at/updated_at DEFAULT'a, created_by/updated_by audit TRIGGER'ina birak.
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

  -- Bakiye ops'lari (increment_balance kendi isletme_id + tablo-whitelist guard'ina sahip).
  FOR op IN SELECT * FROM jsonb_array_elements(COALESCE(p_balance_ops, '[]'::jsonb))
  LOOP
    PERFORM public.increment_balance(op->>'t', (op->>'id')::uuid, (op->>'d')::numeric);
  END LOOP;

  SELECT to_jsonb(i) INTO v_result FROM islemler i WHERE i.id = v_id;
  RETURN v_result;
END;
$function$;

-- Yalniz kimlik dogrulanmis kullanicilar cagirabilir (guard zaten yetkisizi reddeder;
-- yine de anon'a para-mutasyon fonksiyonu acmayalim).
-- update_islem_atomik / delete_islem_atomik ile AYNI postur: yalniz authenticated.
-- (Supabase yeni fonksiyonlara varsayilan anon EXECUTE verir; para-mutasyonunda kaldir.)
REVOKE ALL ON FUNCTION public.create_islem_atomik(uuid, jsonb, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_islem_atomik(uuid, jsonb, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_islem_atomik(uuid, jsonb, jsonb) TO authenticated;
