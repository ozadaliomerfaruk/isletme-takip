-- ATOMIKLIK: bir islemin silinmesinde bakiye geri-alma + stok geri-alma +
-- urun_hareketler silme + islem silme TEK transaction'da yapilsin.
--
-- SORUN: useDeleteIslem eskiden bunlari ayri ayri ag cagrilariyla yapiyordu:
--   reverseBalances (N adet increment_balance) -> stok geri-al (N adet
--   update_urun_miktar) -> urun_hareketler sil -> islem sil. Kismi hatada
--   (2. increment patlar; ya da islem silme RLS'e sessiz takilir count=0)
--   bakiye/stok telafisiz DESYNC olabiliyordu (kasa ile cari tutmaz).
--
-- COZUM: delete_islem_atomik tek plpgsql fonksiyonu (=tek transaction). Herhangi
-- bir adim hata verirse HEPSI geri sarilir. Bakiye delta'lari CAGIRAN app'te
-- hesaplanir (computeBalanceOps -> cross-currency dahil) ve reverse (negatif)
-- edilmis olarak p_balance_ops ile gelir; fonksiyon mevcut increment_balance +
-- update_urun_miktar'i AYNI transaction icinde cagirir -> bakiye/stok davranisi
-- eskisiyle BIREBIR ayni, sadece atomik. Capraz-kiraci guard'i icerir.
--
-- ADDITIF: yeni fonksiyon; hicbir tabloya/mevcut fonksiyona dokunmaz. Yayinlanan
-- (eski) client'lar bunu cagirmaz -> etkilenmez. Yeni build cagirir.

CREATE OR REPLACE FUNCTION public.delete_islem_atomik(
  p_isletme_id uuid,
  p_islem_id uuid,
  p_balance_ops jsonb  -- [{"t":"hesaplar|cariler|personel","id":"<uuid>","d": <numeric>}, ...] (REVERSE delta'lar)
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  op jsonb;
  v_h record;
BEGIN
  -- GUVENLIK: cagiran bu isletmenin sahibi/aktif uyesi mi?
  IF NOT public.user_has_isletme_access(p_isletme_id) THEN
    RAISE EXCEPTION 'Yetkisiz erisim' USING ERRCODE = '42501';
  END IF;

  -- Islem bu isletmeye ait mi? (degilse RLS-sessiz-reject yerine acik hata)
  IF NOT EXISTS (SELECT 1 FROM islemler WHERE id = p_islem_id AND isletme_id = p_isletme_id) THEN
    RAISE EXCEPTION 'Islem bulunamadi veya bu isletmeye ait degil (islem_id: %)', p_islem_id;
  END IF;

  -- 1. Bakiye geri-alma ops'lari (mevcut increment_balance; tablo-whitelist + tenant-scope'lu)
  FOR op IN SELECT * FROM jsonb_array_elements(COALESCE(p_balance_ops, '[]'::jsonb))
  LOOP
    PERFORM public.increment_balance(op->>'t', (op->>'id')::uuid, (op->>'d')::numeric);
  END LOOP;

  -- 2. Bagli urun hareketlerini geri al (stok) - mevcut update_urun_miktar ile birebir
  FOR v_h IN
    SELECT urun_id, hareket_tipi, miktar
    FROM urun_hareketler
    WHERE islem_id = p_islem_id AND isletme_id = p_isletme_id
  LOOP
    PERFORM public.update_urun_miktar(
      v_h.urun_id,
      CASE
        WHEN v_h.hareket_tipi = 'giris' THEN -ABS(v_h.miktar)
        WHEN v_h.hareket_tipi = 'cikis' THEN  ABS(v_h.miktar)
        ELSE -v_h.miktar   -- duzeltme
      END,
      p_isletme_id
    );
  END LOOP;

  -- 3. Urun hareketlerini sil
  DELETE FROM urun_hareketler WHERE islem_id = p_islem_id AND isletme_id = p_isletme_id;

  -- 4. Islemi sil
  DELETE FROM islemler WHERE id = p_islem_id AND isletme_id = p_isletme_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.delete_islem_atomik(uuid, uuid, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.delete_islem_atomik(uuid, uuid, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.delete_islem_atomik(uuid, uuid, jsonb) TO authenticated;
