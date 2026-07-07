-- GUVENLIK: rapor RPC'lerine capraz-kiraci guard'i geri ekle + guard drift'ini kapat.
--
-- SORUN (CANLI ACIK): get_category_report / get_income_expense_summary /
-- get_product_report fonksiyonlari SECURITY DEFINER (RLS bypass) + authenticated'a
-- grant'li, ancak govdelerinde cagiran-uyelik kontrolu YOKTU; yalniz p_isletme_id
-- ile filtreliyorlardi. Giris yapmis HERHANGI bir kullanici, baska bir isletmenin
-- id'sini vererek o isletmenin tum gelir/gider/kategori/urun finansallarini
-- okuyabiliyordu. (15 Haz'da eklenen guard, 20260630000000 migration'indaki
-- CREATE OR REPLACE ile sessizce silinmisti.)
--
-- COZUM: Uc rapor fonksiyonunun govde basina, get_account_report (20260707000000)
-- ile ayni desende public.user_has_isletme_access(p_isletme_id) guard'i eklenir
-- (yetkisizde bos sonuc -> RETURN). Guard, fonksiyonun CANLI tanimindan
-- (pg_get_functiondef) turetilip ILK 'BEGIN'in ardina enjekte edilir -> govde
-- BIREBIR korunur (elle transkripsiyon YOK), islem idempotenttir (guard varsa atlar)
-- ve db reset'e dayaniklidir (reset'te guard'siz dogan fonksiyona guard'i ekler).
--
-- ESKI CLIENT ETKISI: YOK. Yayinlanan tum client'lar bu RPC'leri KENDI isletme_id'si
-- (sahip / aktif uye) ile cagirir -> guard'i gecer, sonuc DEGISMEZ. Yalniz baska
-- isletmenin id'siyle yapilan (mesru olmayan) cagri bos doner. Salt-okuma; hicbir
-- tablo/veri degismez -> veri kaybi/goc riski yok.
--
-- AYRICA (drift): update_urun_miktar guard'i canli DB'de vardi ama repo
-- migration'larinda yoktu -> guncel (guard'li) tanimi asagida BIREBIR backfill
-- edilir ki ileride bir CREATE OR REPLACE / db reset guard'i sessizce silmesin.
-- (nakit_avans RPC'leri atil ozellik + ayrica DROP edilecegi icin dahil EDILMEDI;
-- canlida guard'lidirlar.)

-- ============================================================================
-- 1-3) Rapor RPC'leri: guard'i CANLI tanimdan enjekte et (transcription-safe)
-- ============================================================================
DO $mig$
DECLARE
  r record;
  v_def text;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('get_category_report', 'get_income_expense_summary', 'get_product_report')
  LOOP
    v_def := pg_get_functiondef(r.oid);

    -- Idempotent: guard zaten varsa (yeniden calisma / reset sonrasi) dokunma
    CONTINUE WHEN position('user_has_isletme_access' IN v_def) > 0;

    -- Govdedeki ILK 'BEGIN' (plpgsql blok acilisi) hemen ardina guard ekle.
    -- Bu 3 fonksiyonda 'BEGIN'den once govdede baska 'BEGIN' kelimesi yok.
    v_def := regexp_replace(
      v_def,
      '\mBEGIN\M',
      E'BEGIN\n  -- GUVENLIK: capraz-kiraci guard (backfill 20260707100000)\n  IF NOT public.user_has_isletme_access(p_isletme_id) THEN RETURN; END IF;',
      ''  -- flags bos = yalniz ILK eslesme
    );

    EXECUTE v_def;
    RAISE NOTICE 'capraz-kiraci guard eklendi: %', r.proname;
  END LOOP;
END
$mig$;

-- ============================================================================
-- 4) update_urun_miktar  (DRIFT BACKFILL - canli guard'li tanim BIREBIR; prod'da no-op)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.update_urun_miktar(p_urun_id uuid, p_miktar_degisim numeric, p_isletme_id uuid DEFAULT NULL::uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  DECLARE
    v_yeni_miktar NUMERIC;
  BEGIN
    -- GUVENLIK: cagiran, urunun ait oldugu isletmenin sahibi/aktif uyesi mi?
    IF NOT public.user_has_isletme_access((SELECT isletme_id FROM urunler WHERE id = p_urun_id)) THEN
      RAISE EXCEPTION 'Yetkisiz erisim' USING ERRCODE = '42501';
    END IF;

    IF p_isletme_id IS NOT NULL THEN
      UPDATE urunler
      SET miktar = miktar + p_miktar_degisim,
          updated_at = NOW()
      WHERE id = p_urun_id
        AND isletme_id = p_isletme_id
      RETURNING miktar INTO v_yeni_miktar;
    ELSE
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
  $function$;
