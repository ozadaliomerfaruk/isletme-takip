-- =============================================================================
-- P-B GERİ ALMA
-- =============================================================================
--
--  ⚠️⚠️  GEÇERLİLİK PENCERESİ — OKUMADAN ÇALIŞTIRMAYIN  ⚠️⚠️
--
--  BU DOSYA YALNIZ, HİÇBİR P-C / P-D / P-F BAĞIMLILIĞI KURULMADAN ÖNCE,
--  TEK BAŞINA KULLANILABİLİR.
--
--  29 TEMMUZ 2026 GÜNCEL DURUMU: BU PENCERE KAPANMIŞTIR.
--  get_kategori_secim_referanslari(uuid,text) ve
--  get_transaction_creator_labels(uuid), internal.etkin_yetki tüketmektedir.
--  Creator RPC ayrıca internal.islem_tipi_modulu(text) tüketmektedir.
--  BU NEDENLE BU DOSYAYI BUGÜNKÜ CANLI SİSTEMDE TEK BAŞINA ÇALIŞTIRMAYIN.
--
--  Bağımlılık kurulduktan sonra (P-C1 restrictive RLS politikaları, P-D public
--  projeksiyon RPC'leri, P-F Storage politikaları veya internal.etkin_yetki
--  çağıran herhangi bir guard'lı RPC),
--  P-B yetkileri TEK BAŞINA GERİ ALINAMAZ.
--
--  NEDEN: authenticated'dan EXECUTE/USAGE çekmek yalnız doğrudan çağrıyı kapatır.
--  postgres-owned SECURITY DEFINER public wrapper'lar internal fonksiyonları
--  definer yetkisiyle çağırmaya DEVAM EDEBİLİR; invoker/RLS yolları ise hata
--  verebilir. Sonuç gerçek bir rollback değil, bazı yolların açık bazı yolların
--  kırık kaldığı doğrulanamaz bir yarım durum olur.
--
--  BAĞIMLILIK KURULDUYSA GERİ ALMA SIRASI TERSİNE İŞLER:
--    1) Önce bağımlı katman geri alınır
--       (bugün önce iki P-D public RPC'sinin doğrulanmış fallback'i YAZILIR ve
--        rollback preflight'tan geçirilir; bu artifact'ler henüz YOKTUR.
--        Sonra P-C1 restrictive politikalar / P-F Storage politikaları kaldırılır.)
--    2) Bağımlılık kalmadığı DOĞRULANIR (salt-okunur):
--         SELECT c.relname, pol.polname
--         FROM pg_policy pol
--         JOIN pg_class c ON c.oid = pol.polrelid
--         WHERE COALESCE(pg_get_expr(pol.polqual, pol.polrelid), '') LIKE '%etkin_yetki%'
--            OR COALESCE(pg_get_expr(pol.polwithcheck, pol.polrelid), '') LIKE '%etkin_yetki%';
--
--         SELECT p.proname FROM pg_proc p
--         JOIN pg_namespace n ON n.oid = p.pronamespace
--         WHERE n.nspname <> 'internal'
--           AND (
--             pg_get_functiondef(p.oid) LIKE '%etkin_yetki%'
--             OR pg_get_functiondef(p.oid) LIKE '%islem_tipi_modulu%'
--           );
--
--       -> İKİSİ DE BOŞ dönmeli. Değilse BU DOSYAYI ÇALIŞTIRMAYIN.
--    3) Ancak o zaman aşağısı uygulanabilir.
--
-- =============================================================================
-- MODEL: BAĞIMLILIKLAR NÖTRLENDİKTEN SONRA DOĞRUDAN YETKİYİ KALDIR
-- =============================================================================
--   Nesneler yerinde kalır. Yalnız yukarıdaki bağımlılık sorguları BOŞ döndükten
--   sonra authenticated doğrudan erişimini kaldırmak onları uygulama açısından
--   etkisiz bırakır. SECURITY DEFINER bağımlısı varken bu varsayım GEÇERSİZDİR.
--
--   ⛔ DROP SCHEMA internal CASCADE  — KESİNLİKLE KULLANILMAZ.
--      CASCADE bağımlı nesneleri sessizce siler; etki alanı önceden görülemez.
-- =============================================================================

BEGIN;

DO $pb_fallback_dependency_guard$
DECLARE
  v_policy_dependencies bigint;
  v_function_dependencies bigint;
  v_view_dependencies bigint;
  v_catalog_dependencies bigint;
BEGIN
  SELECT count(*)
    INTO v_policy_dependencies
    FROM pg_catalog.pg_policy AS pol
    JOIN pg_catalog.pg_class AS cls
      ON cls.oid = pol.polrelid
   WHERE COALESCE(pg_catalog.pg_get_expr(pol.polqual, pol.polrelid), '')
           ~ 'internal\.(etkin_yetki|islem_tipi_modulu)'
      OR COALESCE(pg_catalog.pg_get_expr(pol.polwithcheck, pol.polrelid), '')
           ~ 'internal\.(etkin_yetki|islem_tipi_modulu)';

  SELECT count(*)
    INTO v_function_dependencies
    FROM pg_catalog.pg_proc AS proc
    JOIN pg_catalog.pg_namespace AS ns
      ON ns.oid = proc.pronamespace
   WHERE ns.nspname <> 'internal'
     AND proc.prokind = 'f'
     AND (
       pg_catalog.pg_get_functiondef(proc.oid)
         ~ 'internal\.(etkin_yetki|islem_tipi_modulu)'
     );

  SELECT count(*)
    INTO v_view_dependencies
    FROM pg_catalog.pg_views AS view_def
   WHERE view_def.schemaname <> 'internal'
     AND view_def.definition
           ~ 'internal\.(etkin_yetki|islem_tipi_modulu)';

  SELECT count(*)
    INTO v_catalog_dependencies
    FROM pg_catalog.pg_depend AS dep
    JOIN pg_catalog.pg_proc AS referenced_proc
      ON referenced_proc.oid = dep.refobjid
    JOIN pg_catalog.pg_namespace AS referenced_ns
      ON referenced_ns.oid = referenced_proc.pronamespace
   WHERE referenced_ns.nspname = 'internal'
     AND referenced_proc.proname IN ('etkin_yetki', 'islem_tipi_modulu')
     AND dep.objid <> referenced_proc.oid;

  IF v_policy_dependencies > 0
     OR v_function_dependencies > 0
     OR v_view_dependencies > 0
     OR v_catalog_dependencies > 0 THEN
    RAISE EXCEPTION
      'P-B fallback blocked: internal resolver dependencies still exist'
      USING
        ERRCODE = '55000',
        DETAIL = pg_catalog.format(
          'policy_dependencies=%s, function_dependencies=%s, view_dependencies=%s, catalog_dependencies=%s',
          v_policy_dependencies,
          v_function_dependencies,
          v_view_dependencies,
          v_catalog_dependencies
        ),
        HINT = 'Write and rollback-test dependent package fallbacks before P-B.';
  END IF;
END
$pb_fallback_dependency_guard$;

REVOKE EXECUTE ON FUNCTION internal.etkin_yetki(uuid, text) FROM authenticated;
REVOKE USAGE   ON SCHEMA   internal                          FROM authenticated;

COMMIT;


-- =============================================================================
-- SİLME GEREKİRSE — KOŞULLU, AYRI ONAYDA
-- =============================================================================
-- Aşağısı BİLİNÇLİ OLARAK YORUMDA. Üç şart BİRLİKTE sağlanmadan açılmaz:
--
--   1) TAM İSİMLİ yeni nesneler silinir — şema DROP'u DEĞİL, nesne DROP'u
--   2) BAĞIMLILIK KONTROLÜ yapılmış olmalı (yukarıdaki iki sorgu + pg_depend)
--   3) AYRI AÇIK ONAY alınmış olmalı — bu dosyanın varlığı onay DEĞİLDİR
--
-- CASCADE hiçbir satırda yoktur ve eklenmeyecektir. Bağımlılık çıkarsa DROP
-- durur ve raporlanır — sessizce zincir silmez.
--
-- DROP FUNCTION internal.bakiye_ops(jsonb);
-- DROP FUNCTION internal.cevrilen_tutar(numeric, numeric, text, text);
-- DROP FUNCTION internal.etkin_yetki(uuid, text);
-- DROP FUNCTION internal.islem_tipi_modulu(text);
-- DROP SCHEMA internal;        -- CASCADE YOK: içi boşalmadıysa hata verir, bu İSTENEN davranıştır
