-- =============================================================================
-- P-B : KANONİK YETKİ ALTYAPISI (private şema)
-- =============================================================================
-- TEK ATOMİK MIGRATION. Dört bileşen tek transaction'da kurulur:
--   ① internal.etkin_yetki        — yetenek vektörü çözümleyicisi
--   ② internal.bakiye_ops         — sunucu-otoriter bakiye türetme
--   ③ internal.islem_tipi_modulu  — tip -> modül allowlist'i (ELSE NULL)
--   ④ testler yereldedir (jest + izole gerçek PostgreSQL davranış turu)
--
-- BU MIGRATION MEVCUT VERİ YOLLARINI DEĞİŞTİRMEZ.
--   Hiçbir politika, mevcut RPC veya tablo davranışı değişmiyor.
--   ⚠️ Ama YENİ BİR GÜVENLİK YÜZEYİDİR: SECURITY DEFINER resolver, helperlar ve
--      USAGE/EXECUTE grant'ları ekleniyor. "Davranış değişikliği yok" ifadesi
--      "risk yok" anlamına GELMEZ.
--
-- ÖN KOŞUL — internal şeması var olmamalı
--   26 Tem kontrolü yalnız tarihsel snapshot'tır. Uygulama anında yeniden ölçülür.
--   Aşağıdaki kapı uygulama anında bunu TEKRAR kontrol eder ve şema varsa
--   HATA VERİP DURUR. Sessiz yeniden kullanım YOK.
--
-- DATA API KAPISI (§B.0.3)
--   `internal` şeması Supabase "Exposed schemas" listesinde OLMAMALIDIR.
--   Bu migration bunu kontrol EDEMEZ — test ortamında, üretim öncesi VE
--   üretim sonrası ayrıca doğrulanacak zorunlu kapıdır.
--
-- GERİ ALMA
--   docs/security/taslak/PB-FALLBACK.sql
--   ⚠️ YALNIZ hiçbir P-C/P-F bağımlılığı kurulmadan önce tek başına kullanılabilir.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- ÖN KOŞUL KAPISI
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'internal') THEN
    RAISE EXCEPTION
      'P-B DURDU: "internal" semasi zaten mevcut. Sessizce yeniden kullanilmayacak. Sahip/ACL/icerik raporlanip ayri karar alinmali.'
      USING ERRCODE = '42P06';
  END IF;
END $$;

CREATE SCHEMA internal;

-- Şema seviyesinde deny-by-default.
REVOKE ALL ON SCHEMA internal FROM PUBLIC;
REVOKE ALL ON SCHEMA internal FROM anon;

-- Politikaların/fonksiyonların şemaya erişebilmesi için MİNİMUM yetki.
-- USAGE tek başına içerideki nesneleri çağırmaya yetmez; EXECUTE ayrıca gerekir
-- ve yalnız ① resolver'a verilir.
GRANT USAGE ON SCHEMA internal TO authenticated;

-- PostgreSQL 17 kısıtı: per-schema ALTER DEFAULT PRIVILEGES REVOKE, global
-- PUBLIC EXECUTE defaultunu kaldıramaz. Global `postgres` default privilege'ına
-- burada dokunulmaz. Her fonksiyon kendi explicit REVOKE'uyla daraltılır ve
-- migration EN SONDA schema-wide ACL sweep yapar.
--
-- GELECEK KURAL: `internal` şemasına fonksiyon ekleyen HER migration, bütün yeni
-- fonksiyonlar oluşturulduktan sonra aynı final sweep'i çalıştırmalı ve yalnız
-- tasarlanmış imzalara gereken explicit GRANT'ları sweep'ten SONRA vermelidir.


-- ===========================================================================
-- ③ internal.islem_tipi_modulu — TİP -> MODÜL ALLOWLIST'İ
-- ===========================================================================
-- islemler.type CHECK'i 16 değere izin veriyor; bu allowlist ONDAN BAĞIMSIZDIR.
-- Matriste olmayan her tip NULL döner -> çağıran taraf 42501 ile reddeder.
-- "default -> no-op" davranışı yetkilendirmede KULLANILMAZ.
--
-- nakit_avans_taksit: CHECK'te var, güncel istemcide emekli -> NULL (deny).
-- Canlı satır dağılımı uygulama öncesi yeniden ölçülür; bu yorum canlı sayı iddiası değildir.
-- ---------------------------------------------------------------------------
CREATE FUNCTION internal.islem_tipi_modulu(p_type text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path TO 'pg_catalog'
AS $fn$
  SELECT CASE p_type
    WHEN 'gelir'                   THEN ARRAY['hesaplar']
    WHEN 'gider'                   THEN ARRAY['hesaplar']
    WHEN 'transfer'                THEN ARRAY['hesaplar']
    WHEN 'cari_alis'               THEN ARRAY['cariler']
    WHEN 'cari_satis'              THEN ARRAY['cariler']
    WHEN 'cari_alis_iade'          THEN ARRAY['cariler']
    WHEN 'cari_satis_iade'         THEN ARRAY['cariler']
    WHEN 'cari_odeme'              THEN ARRAY['cariler']
    WHEN 'cari_tahsilat'           THEN ARRAY['cariler']
    WHEN 'personel_gider'          THEN ARRAY['personel']
    WHEN 'personel_satis'          THEN ARRAY['personel']
    WHEN 'personel_izin_hakki'     THEN ARRAY['personel']
    WHEN 'personel_izin_kullanimi' THEN ARRAY['personel']
    WHEN 'personel_odeme'          THEN ARRAY['personel','hesaplar']
    WHEN 'personel_tahsilat'       THEN ARRAY['personel','hesaplar']
    ELSE NULL          -- ⬅ DENY. nakit_avans_taksit ve bilinmeyen her tip buraya düşer.
  END;
$fn$;

REVOKE EXECUTE ON FUNCTION internal.islem_tipi_modulu(text)
  FROM PUBLIC, anon, authenticated, service_role;
-- authenticated'a GRANT YOK: yalnız internal fonksiyonlar çağırır.


-- ===========================================================================
-- ① internal.etkin_yetki — YETENEK VEKTÖRÜ ÇÖZÜMLEYİCİSİ
-- ===========================================================================
-- SINIRLAR (docs/security/PAKET-0-1-TASARIM-RAPORU.md §B.5.1):
--   • Caller tarafından SEÇİLEBİLEN user_id parametresi YOK — daima auth.uid().
--   • Bağlam parametreleri (p_isletme_id, p_modul) alınır ve TENANT KAPSAMINDA
--     doğrulanır: kullanıcı o işletmenin sahibi ya da AKTİF üyesi değilse deny.
--   • Ham permissions JSON'u DÖNMEZ; başka kullanıcının izinleri DÖNMEZ.
--     Yalnız mevcut kullanıcı için boolean yetenekler döner.
--   • Genel bir "izin sorgulama RPC'si" DEĞİLDİR.
--
-- SEMANTİK KAYNAĞI:
--   src/lib/permissions.ts::canAccessPermissionModule/deriveEffectiveModules
--   src/hooks/usePermissions.ts::canCreate/canUpdate/canDelete/canSeeRecord
--   İyi-biçimli izin JSON'unda birebir parite; bozuk JSON boolean değerlerinde
--   sunucu bilinçli olarak daha dardır (yalnız JSON true yetki verir).
--   • Owner -> hepsi true
--   • dashboard -> aktif üyede görünür
--   • görünür modüller -> kendi exact-boolean bayrağından okunur
--   • birikim -> hesaplar AND birikim; Hesaplar kapalıyken açılamaz
--   • islemler/ileri_tarihli/arsiv -> hesaplar|cariler|urunler|personel
--   • kategoriler/cekler/ayarlar -> shared kullanıcıda kapalı
--   • level VARSA  -> exact string allowlist'ten türetilir; bilinmeyen tip/değer deny
--   • level YOKSA  -> actions[modul] bayrakları BİREBİR; birbirine yükseltilmez,
--                     modüller arası taşınmaz (COLLAPSE YASAK)
--   • notlar/birikim anahtarı YOKSA -> yalnız GÖRÜNÜRLÜK true; aksiyonlar yine
--     actions'a bağlı (fallback aksiyona UYGULANMAZ); fallback yalnız legacy'de
--   • Diğer modül anahtarı yoksa -> false
--   • Boolean okuma: yalnız jsonb `true` true'dur. "true"/"yes"/1/null/nesne/dizi
--     false'tur ve cast exception'ı üretmez.
--   • visibility.can_see_all_users_data modülden ve level'dan BAĞIMSIZ global
--     bayraktır; yalnız exact jsonb true ise true'dur.
--
-- *_own KAPSAYICIDIR: *_all doğruysa *_own da doğrudur (istemciyle aynı).
-- ---------------------------------------------------------------------------
CREATE FUNCTION internal.etkin_yetki(p_isletme_id uuid, p_modul text)
RETURNS TABLE (
  can_view               boolean,
  can_create             boolean,
  can_update_own         boolean,
  can_update_all         boolean,
  can_delete_own         boolean,
  can_delete_all         boolean,
  can_see_all_users_data boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
-- 🔒 search_path YALNIZ pg_catalog. `public` BİLİNÇLİ OLARAK YOK:
--    gövdedeki her nesne TAM ŞEMALI (public.isletmeler, public.isletme_users,
--    auth.uid()). Böylece SECURITY DEFINER bağlamında şema-gölgeleme (search
--    path hijacking) yüzeyi kalmıyor. jsonb operatörleri (->, ->>, ?) ve
--    COALESCE pg_catalog'dadır.
SET search_path TO 'pg_catalog'
AS $fn$
DECLARE
  v_uid                    uuid := auth.uid();
  v_perm                   jsonb;
  v_level_json             jsonb;
  v_level                  text;
  v_mod                    jsonb;
  v_act                    jsonb;
  v_legacy                 boolean;
  v_gorunur                boolean;
  v_raw_modul_acik         boolean;
  v_hesaplar_acik          boolean;
  v_cariler_acik           boolean;
  v_urunler_acik           boolean;
  v_personel_acik          boolean;
  v_islem_kaynagi_acik     boolean;
  v_can_see_all_users_data boolean;
BEGIN
  -- Kimlik yoksa (anon) hiçbir şey.
  IF v_uid IS NULL OR p_isletme_id IS NULL OR p_modul IS NULL THEN
    RETURN QUERY SELECT false, false, false, false, false, false, false;
    RETURN;
  END IF;

  -- OWNER: bağlam parametresi tenant kapsamında burada doğrulanıyor.
  IF EXISTS (
    SELECT 1 FROM public.isletmeler
    WHERE id = p_isletme_id AND user_id = v_uid
  ) THEN
    RETURN QUERY SELECT true, true, true, true, true, true, true;
    RETURN;
  END IF;

  -- ÜYE: yalnız AKTİF üyelik. Bulunamazsa deny (bağlam doğrulaması).
  SELECT iu.permissions INTO v_perm
  FROM public.isletme_users iu
  WHERE iu.isletme_id = p_isletme_id
    AND iu.user_id = v_uid
    AND iu.status = 'active';

  IF v_perm IS NULL OR jsonb_typeof(v_perm) IS DISTINCT FROM 'object' THEN
    RETURN QUERY SELECT false, false, false, false, false, false, false;
    RETURN;
  END IF;

  v_level_json := v_perm->'level';
  v_mod        := v_perm->'modules';
  v_act        := v_perm->'actions';
  v_legacy     := v_level_json IS NULL OR v_level_json = 'null'::jsonb;

  -- usePermissions.canSeeRecord: global görünürlük modül/level sonucuna bağlı
  -- değildir. Yalnız gerçek JSON boolean true kabul edilir.
  v_can_see_all_users_data := COALESCE(
    v_perm->'visibility'->'can_see_all_users_data' = 'true'::jsonb,
    false
  );

  -- level varsa JSON string ve açık allowlist olmak zorunda. Bilinmeyen level
  -- can_see_all_users_data global bayrağını değiştirmez; diğer altı yetenek deny.
  IF NOT v_legacy THEN
    IF jsonb_typeof(v_level_json) IS DISTINCT FROM 'string' THEN
      RETURN QUERY SELECT
        false, false, false, false, false, false, v_can_see_all_users_data;
      RETURN;
    END IF;

    v_level := v_perm->>'level';
    IF v_level NOT IN ('view', 'add', 'edit_own', 'edit_all') THEN
      RETURN QUERY SELECT
        false, false, false, false, false, false, v_can_see_all_users_data;
      RETURN;
    END IF;
  END IF;

  -- Bütün boolean okumaları exact-jsonb karşılaştırmasıdır. PostgreSQL'in
  -- `"yes"::boolean`, `"on"::boolean`, `"1"::boolean` gibi geniş metin cast'i
  -- yetki çözümünde kullanılmaz; bozuk değer exception değil false üretir.
  v_raw_modul_acik := COALESCE(v_mod->p_modul = 'true'::jsonb, false);
  v_hesaplar_acik  := COALESCE(v_mod->'hesaplar' = 'true'::jsonb, false);
  v_cariler_acik   := COALESCE(v_mod->'cariler' = 'true'::jsonb, false);
  v_urunler_acik   := COALESCE(v_mod->'urunler' = 'true'::jsonb, false);
  v_personel_acik  := COALESCE(v_mod->'personel' = 'true'::jsonb, false);
  v_islem_kaynagi_acik :=
    v_hesaplar_acik OR v_cariler_acik OR v_urunler_acik OR v_personel_acik;

  -- deriveEffectiveModules ile aynı görünür/derived modül sözleşmesi.
  -- Legacy notlar/birikim fallback'i yalnız anahtar gerçekten YOKSA uygulanır.
  -- Eski kayıttaki eksik/null `modules` konteyneri de "anahtar yok" sayılır;
  -- fakat mevcut null/string/number/object/array BAYRAĞI yetki vermez.
  v_gorunur := CASE p_modul
    WHEN 'dashboard' THEN true
    WHEN 'hesaplar'  THEN v_hesaplar_acik
    WHEN 'cariler'   THEN v_cariler_acik
    WHEN 'urunler'   THEN v_urunler_acik
    WHEN 'personel'  THEN v_personel_acik
    WHEN 'raporlar'  THEN COALESCE(v_mod->'raporlar' = 'true'::jsonb, false)
    WHEN 'notlar'    THEN
      COALESCE(v_mod->'notlar' = 'true'::jsonb, false)
      OR (
        v_legacy
        AND (
          v_mod IS NULL
          OR v_mod = 'null'::jsonb
          OR (
            jsonb_typeof(v_mod) = 'object'
            AND NOT (v_mod ? 'notlar')
          )
        )
      )
    WHEN 'birikim'   THEN
      v_hesaplar_acik
      AND (
        COALESCE(v_mod->'birikim' = 'true'::jsonb, false)
        OR (
          v_legacy
          AND (
            v_mod IS NULL
            OR v_mod = 'null'::jsonb
            OR (
              jsonb_typeof(v_mod) = 'object'
              AND NOT (v_mod ? 'birikim')
            )
          )
        )
      )
    WHEN 'islemler'        THEN v_islem_kaynagi_acik
    WHEN 'ileri_tarihli'   THEN v_islem_kaynagi_acik
    WHEN 'arsiv'           THEN v_islem_kaynagi_acik
    WHEN 'kategoriler'     THEN false
    WHEN 'cekler'          THEN false
    WHEN 'ayarlar'         THEN false
    ELSE false
  END;

  -- canCreate/canUpdate/canDelete, etkin görünürlüğe ek olarak ilgili raw modül
  -- bayrağının exact true olmasını ister. Derived/fallback görünürlük tek başına
  -- hiçbir yazma hakkı üretmez.
  IF NOT v_gorunur OR NOT v_raw_modul_acik THEN
    RETURN QUERY SELECT
      v_gorunur, false, false, false, false, false,
      v_can_see_all_users_data;
    RETURN;
  END IF;

  -- GÜNCEL FORMAT: geçerli level'dan türet.
  IF NOT v_legacy THEN
    RETURN QUERY SELECT
      v_gorunur,
      (v_level IN ('add', 'edit_own', 'edit_all')),
      (v_level IN ('edit_own', 'edit_all')),
      (v_level = 'edit_all'),
      (v_level IN ('edit_own', 'edit_all')),
      (v_level = 'edit_all'),
      v_can_see_all_users_data;
    RETURN;
  END IF;

  -- LEGACY FORMAT: actions[modul] exact-jsonb boolean; collapse YOK.
  RETURN QUERY SELECT
    v_gorunur,
    COALESCE(v_act->p_modul->'can_create' = 'true'::jsonb, false),
    COALESCE(v_act->p_modul->'can_update_all' = 'true'::jsonb, false)
      OR COALESCE(v_act->p_modul->'can_update_own' = 'true'::jsonb, false),
    COALESCE(v_act->p_modul->'can_update_all' = 'true'::jsonb, false),
    COALESCE(v_act->p_modul->'can_delete_all' = 'true'::jsonb, false)
      OR COALESCE(v_act->p_modul->'can_delete_own' = 'true'::jsonb, false),
    COALESCE(v_act->p_modul->'can_delete_all' = 'true'::jsonb, false),
    v_can_see_all_users_data;
END;
$fn$;

-- İlk-pass grant hijyeni: yeni fonksiyonun default PUBLIC EXECUTE yetkisini ve
-- API rollerindeki olası grantları kaldır. Resolver'ın tek explicit GRANT'ı,
-- bütün fonksiyonları kapsayan final ACL sweep'ten SONRA migration sonunda verilir.
-- RLS/Storage politikaları bu fonksiyonu authenticated bağlamında çağıracağı
-- için EXECUTE ZORUNLUDUR. Koruma "yetki yok"tan değil, şemanın Data API'de
-- expose EDİLMEMESİNDEN gelir.
REVOKE EXECUTE ON FUNCTION internal.etkin_yetki(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;


-- ===========================================================================
-- ② internal.bakiye_ops — SUNUCU-OTORİTER BAKİYE TÜRETME
-- ===========================================================================
-- Geçerli sonlu numeric girdilerde src/lib/islemBalanceOps.ts computeBalanceOps()
-- ile birebir. NaN kur sunucuda bilinçli fail-closed sertleştirmedir.
-- Çapraz kur: src/lib/currency.ts calculateTargetAmount()
--   • aynı para birimi                -> tutar
--   • kaynak TRY, hedef yabancı       -> tutar / kur
--   • kaynak yabancı, hedef TRY/diğer -> tutar * kur
--   • kur yok/<=0 ve para birimleri farklı -> HATA (istemci de fırlatıyor)
--
-- Bakiye etkilemeyen tipler (personel_izin_*, nakit_avans_taksit) op ÜRETMEZ —
-- istemcideki switch'te de default yok. Bu, YETKİLENDİRME değil MATEMATİK
-- katmanıdır; "no-op" burada meşrudur.
--
-- ⚠️ authenticated'a EXECUTE VERİLMEZ — RLS'ten çağrılması gerekmiyor;
--    yalnız guard'lı RPC'ler kendi SECURITY DEFINER bağlamından çağırır.
-- ---------------------------------------------------------------------------
-- Geçerli sonlu numeric girdilerde calculateTargetAmount() ile BİREBİR:
--   • aynı para birimi  -> tutar AYNEN (yuvarlama YOK, TS erken return ediyor)
--   • kur NULL/<=0      -> HATA
--   • kaynak TRY        -> tutar / kur      ] sonra roundCurrency(result)
--   • kaynak yabancı    -> tutar * kur      ] = round(numeric, 2)
--
-- YUVARLAMA EŞLEŞMESİ: roundCurrency 'e2' string hilesiyle yarıyı SIFIRDAN
-- UZAĞA yuvarlar (1.005 -> 1.01). PostgreSQL'de round(numeric, 2) de yarıyı
-- sıfırdan uzağa yuvarlar. float8 KULLANILMIYOR — numeric zorunlu, aksi hâlde
-- IEEE754 davranışı ayrışır.
CREATE FUNCTION internal.cevrilen_tutar(
  p_amount numeric,
  p_rate numeric,
  p_source text,
  p_target text
)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'pg_catalog'
AS $fn$
BEGIN
  -- Derinlemesine tutar savunması EARLY RETURN'DEN ÖNCE çalışır. Böylece aynı
  -- para biriminde doğrudan çağrı da NaN/sonsuz değeri aynen geri döndüremez.
  IF p_amount IS NULL
     OR p_amount = 'NaN'::numeric
     OR p_amount =  'Infinity'::numeric
     OR p_amount = '-Infinity'::numeric THEN
    RAISE EXCEPTION 'Gecersiz tutar (bos/NaN/sonsuz): %', p_amount
      USING ERRCODE = '22023';
  END IF;

  -- Verilmiş bir kur, para birimleri aynı olsa bile güvenli numeric olmalıdır.
  -- Bu, safeParseExchangeRate(NaN) değerinin bazı client yollarında null'a
  -- düşebilmesine göre BİLİNÇLİ sunucu sertleştirmesidir. NULL kur aynı para
  -- biriminde hâlâ geçerlidir; farklı para biriminde aşağıda reddedilir.
  IF p_rate IS NOT NULL
     AND (
       p_rate = 'NaN'::numeric
       OR p_rate =  'Infinity'::numeric
       OR p_rate = '-Infinity'::numeric
       OR p_rate <= 0
     ) THEN
    RAISE EXCEPTION 'Gecersiz kur: % -> % (kur=%)', p_source, p_target, p_rate
      USING ERRCODE = '22023';
  END IF;

  -- TS: sourceCurrency === targetCurrency -> return amount (YUVARLAMA YOK).
  -- Tutar ve verilmiş kur guard'ları bu erken dönüşten önce tamamlandı.
  IF COALESCE(p_source, 'TRY') = COALESCE(p_target, 'TRY') THEN
    RETURN p_amount;
  END IF;

  -- Farklı para biriminde kur zorunludur.
  IF p_rate IS NULL THEN
    RAISE EXCEPTION 'Gecersiz kur: % -> % (kur=%)', p_source, p_target, p_rate
      USING ERRCODE = '22023';
  END IF;

  -- TS: sourceCurrency === 'TRY' ? amount/rate : amount*rate
  --     (yabancı->yabancı dalı da çarpma; TS'te "basitleştirilmiş" olarak aynı)
  -- TS: return roundCurrency(result)
  IF COALESCE(p_source, 'TRY') = 'TRY' THEN
    RETURN round(p_amount / p_rate, 2);
  END IF;
  RETURN round(p_amount * p_rate, 2);
END;
$fn$;

REVOKE EXECUTE ON FUNCTION internal.cevrilen_tutar(numeric, numeric, text, text)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION internal.bakiye_ops(p_islem jsonb)
RETURNS TABLE (t text, entity_id uuid, d numeric)
LANGUAGE plpgsql
IMMUTABLE
-- search_path YALNIZ pg_catalog; internal.cevrilen_tutar TAM ŞEMALI çağrılıyor.
SET search_path TO 'pg_catalog'
AS $fn$
DECLARE
  v_type    text    := p_islem->>'type';
  v_amount  numeric := (p_islem->>'amount')::numeric;
  v_rate    numeric := NULLIF(p_islem->>'exchange_rate', '')::numeric;
  v_src     text    := COALESCE(p_islem->>'source_currency', 'TRY');
  v_tgt     text    := COALESCE(p_islem->>'target_currency', 'TRY');
  v_hesap   uuid    := NULLIF(p_islem->>'hesap_id', '')::uuid;
  v_hedef   uuid    := NULLIF(p_islem->>'hedef_hesap_id', '')::uuid;
  v_cari    uuid    := NULLIF(p_islem->>'cari_id', '')::uuid;
  v_pers    uuid    := NULLIF(p_islem->>'personel_id', '')::uuid;
  v_conv    numeric;
BEGIN
  -- ⚠️ NaN / ±Infinity REDDİ — TS ile birebir, PostgreSQL'e ÖZEL TEHLİKE.
  --
  -- safeParseAmount (currency.ts:191-197) NaN ve sonsuz değeri FIRLATIR.
  -- PostgreSQL numeric ise ikisini de KABUL EDER ve sessizce yayar:
  --   'NaN'::numeric > 0      -> TRUE   => islemler CHECK (amount > 0) NaN'i GEÇİRİR
  --   'NaN'::numeric <= 0     -> FALSE  => asagidaki kur guard'i tek basina YETMEZ
  --   'NaN'::numeric IS NULL  -> FALSE  => NULL kontrolu YETMEZ
  --   'NaN'::numeric * 5      -> NaN    => bakiye deltasina sessizce sizar
  --   round('NaN'::numeric,2) -> NaN
  -- (PG 17 canli motorda dogrulandi, 26 Tem)
  --
  -- Postgres'te NaN = NaN ve Infinity = Infinity TRUE dondugu icin esitlik
  -- karsilastirmasi guvenli bir tespit yontemidir (IEEE754'ten farkli).
  IF v_amount IS NULL
     OR v_amount = 'NaN'::numeric
     OR v_amount =  'Infinity'::numeric
     OR v_amount = '-Infinity'::numeric THEN
    RAISE EXCEPTION 'bakiye_ops: gecersiz tutar (bos/NaN/sonsuz): %', v_amount
      USING ERRCODE = '22023';
  END IF;

  -- ÜST SEVİYE KUR DOĞRULAMASI — TS ile birebir.
  -- computeBalanceOps (islemBalanceOps.ts:39) safeParseExchangeRate'i switch'ten
  -- ÖNCE, KOŞULSUZ çağırıyor. safeParseExchangeRate:
  --     null/undefined -> null (hata YOK)
  --     NaN            -> null
  --     sonsuz         -> HATA
  --     <= 0           -> HATA   ("must be greater than 0")
  -- Yani 0/negatif kur, para birimleri AYNI olsa bile reddedilir.
  -- (cevrilen_tutar'daki kontrol yalnız çapraz kur dalını korur; bu ondan
  --  bağımsız ve daha geniştir.)
  -- NaN/sonsuz kontrolü <= 0'DAN ÖNCE: 'NaN' <= 0 FALSE dondugu icin
  -- yalnizca <= 0 yazmak NaN'i geciriyordu.
  IF v_rate IS NOT NULL
     AND (v_rate = 'NaN'::numeric
          OR v_rate =  'Infinity'::numeric
          OR v_rate = '-Infinity'::numeric
          OR v_rate <= 0) THEN
    RAISE EXCEPTION 'bakiye_ops: gecersiz kur (NaN/sonsuz/0/negatif): %', v_rate
      USING ERRCODE = '22023';
  END IF;

  -- converted() yalnız gerektiğinde hesaplanır (istemcide de lazy).
  IF v_type IN ('transfer','cari_odeme','cari_tahsilat','personel_odeme','personel_tahsilat') THEN
    v_conv := internal.cevrilen_tutar(v_amount, v_rate, v_src, v_tgt);
  END IF;

  -- push() yalnız id NOT NULL ise satır üretir (istemcideki `if (id)` ile aynı).
  CASE v_type
    WHEN 'gelir' THEN
      RETURN QUERY SELECT 'hesaplar', v_hesap, v_amount WHERE v_hesap IS NOT NULL;
    WHEN 'gider' THEN
      RETURN QUERY SELECT 'hesaplar', v_hesap, -v_amount WHERE v_hesap IS NOT NULL;
    WHEN 'transfer' THEN
      RETURN QUERY SELECT 'hesaplar', v_hesap, -v_amount WHERE v_hesap IS NOT NULL;
      RETURN QUERY SELECT 'hesaplar', v_hedef, v_conv   WHERE v_hedef IS NOT NULL;
    WHEN 'cari_alis' THEN
      RETURN QUERY SELECT 'cariler', v_cari, -v_amount WHERE v_cari IS NOT NULL;
    WHEN 'cari_satis' THEN
      RETURN QUERY SELECT 'cariler', v_cari, v_amount WHERE v_cari IS NOT NULL;
    WHEN 'cari_odeme' THEN
      RETURN QUERY SELECT 'cariler',  v_cari,  v_conv    WHERE v_cari  IS NOT NULL;
      RETURN QUERY SELECT 'hesaplar', v_hesap, -v_amount WHERE v_hesap IS NOT NULL;
    WHEN 'cari_tahsilat' THEN
      RETURN QUERY SELECT 'cariler',  v_cari,  -v_conv  WHERE v_cari  IS NOT NULL;
      RETURN QUERY SELECT 'hesaplar', v_hesap, v_amount WHERE v_hesap IS NOT NULL;
    WHEN 'personel_gider' THEN
      RETURN QUERY SELECT 'personel', v_pers, -v_amount WHERE v_pers IS NOT NULL;
    WHEN 'personel_odeme' THEN
      RETURN QUERY SELECT 'personel', v_pers,  v_conv    WHERE v_pers  IS NOT NULL;
      RETURN QUERY SELECT 'hesaplar', v_hesap, -v_amount WHERE v_hesap IS NOT NULL;
    WHEN 'cari_alis_iade' THEN
      RETURN QUERY SELECT 'cariler', v_cari, v_amount WHERE v_cari IS NOT NULL;
    WHEN 'cari_satis_iade' THEN
      RETURN QUERY SELECT 'cariler', v_cari, -v_amount WHERE v_cari IS NOT NULL;
    WHEN 'personel_tahsilat' THEN
      RETURN QUERY SELECT 'personel', v_pers,  -v_conv  WHERE v_pers  IS NOT NULL;
      RETURN QUERY SELECT 'hesaplar', v_hesap, v_amount WHERE v_hesap IS NOT NULL;
    WHEN 'personel_satis' THEN
      RETURN QUERY SELECT 'personel', v_pers, v_amount WHERE v_pers IS NOT NULL;
    ELSE
      -- personel_izin_hakki / personel_izin_kullanimi / nakit_avans_taksit:
      -- bakiye etkisi YOK. İstemcideki switch'te de karşılığı yok.
      RETURN;
  END CASE;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION internal.bakiye_ops(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
-- authenticated'a GRANT YOK — bilinçli.


-- ===========================================================================
-- FINAL ACL SWEEP — BÜTÜN FONKSİYONLAR OLUŞTUKTAN SONRA
-- ===========================================================================
-- PG17'de CREATE FUNCTION global PUBLIC EXECUTE defaultuyla `proacl = NULL`
-- doğabilir. Per-schema default REVOKE bunu önleyemez. Bu sweep mevcut dört
-- fonksiyonun resultant ACL'ini tek noktada deny-by-default yapar.
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA internal
  FROM PUBLIC, anon, authenticated, service_role;

-- Sweep'ten sonra yalnız resolver authenticated'a açılır; owner yetkisi implicit.
GRANT EXECUTE ON FUNCTION internal.etkin_yetki(uuid, text) TO authenticated;
