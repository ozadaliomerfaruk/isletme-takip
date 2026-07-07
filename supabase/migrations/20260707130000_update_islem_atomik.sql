-- ATOMIKLIK: bir islemin GUNCELLENMESINDE net bakiye degisimi + islem satiri
-- guncelleme TEK transaction'da yapilsin (delete_islem_atomik'in guncelleme esi).
--
-- SORUN: useUpdateIslem eskiden: (1) islem satirini update -> (2) reverseBalances(old)
-- -> (3) updateBalances(new) ayri agri cagrilariyla. Kismi hatada (ornek: 2. increment
-- patlar) satir YENI degerde kalir ama bakiye ESKI'ye gore yarim -> kasa/cari desync.
-- Best-effort telafi (satiri oldIslem'e geri yaz) vardi ama o da atomik/garanti degildi.
--
-- COZUM: update_islem_atomik tek plpgsql fonksiyonu (=tek transaction). Guard + NET
-- bakiye ops (app'te reverse(old)+apply(new) olarak hesaplanip birlestirilir; cross-
-- currency + linked-cari inversiyon dahil computeBalanceOps'tan gelir) + islem satirini
-- guncelle. Bakiye mevcut increment_balance (tenant-scope'lu) ile islenir -> davranis
-- birebir. Herhangi bir adim patlarsa hepsi geri sarilir. Guncel satir jsonb doner.
--
-- Satir guncelleme: p_new_row = {...oldIslem, ...updates} TAM satir; jsonb_populate_record
-- ile islemler kaydina donusturulup YALNIZ uygulamanin degistirdigi 14 kolon set edilir
-- (id/isletme_id/created_at/created_by/updated_by/source_ileri_id KORUNUR).
--
-- ADDITIF: yeni fonksiyon; eski client cagirmaz -> etkilenmez.

CREATE OR REPLACE FUNCTION public.update_islem_atomik(
  p_isletme_id uuid,
  p_islem_id uuid,
  p_balance_ops jsonb,  -- NET ops: reverse(old) ++ apply(new). [{"t","id","d"}, ...]
  p_new_row jsonb       -- {...oldIslem, ...updates} tam satir
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
BEGIN
  IF NOT public.user_has_isletme_access(p_isletme_id) THEN
    RAISE EXCEPTION 'Yetkisiz erisim' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM islemler WHERE id = p_islem_id AND isletme_id = p_isletme_id) THEN
    RAISE EXCEPTION 'Islem bulunamadi veya bu isletmeye ait degil (islem_id: %)', p_islem_id;
  END IF;

  -- 1. NET bakiye ops (reverse-old + apply-new); increment_balance tenant-scope'lu
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

REVOKE EXECUTE ON FUNCTION public.update_islem_atomik(uuid, uuid, jsonb, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_islem_atomik(uuid, uuid, jsonb, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.update_islem_atomik(uuid, uuid, jsonb, jsonb) TO authenticated;
