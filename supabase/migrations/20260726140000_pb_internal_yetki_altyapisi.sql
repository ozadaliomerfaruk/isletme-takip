-- =============================================================================
-- P-B : KANONİK YETKİ ALTYAPISI (private şema)
-- =============================================================================
-- TEK ATOMİK MIGRATION. Dört bileşen tek transaction'da kurulur:
--   ① internal.etkin_yetki        — yetenek vektörü çözümleyicisi
--   ② internal.bakiye_ops         — sunucu-otoriter bakiye türetme
--   ③ internal.islem_tipi_modulu  — tip -> modül allowlist'i (ELSE NULL)
--   ④/⑤ testler yereldedir (jest + test ortamı)
--
-- BU MIGRATION MEVCUT VERİ YOLLARINI DEĞİŞTİRMEZ.
--   Hiçbir politika, mevcut RPC veya tablo davranışı değişmiyor.
--   ⚠️ Ama YENİ BİR GÜVENLİK YÜZEYİDİR: yeni SECURITY DEFINER fonksiyonlar ve
--      USAGE/EXECUTE grant'ları ekleniyor. "Davranış değişikliği yok" ifadesi
--      "risk yok" anlamına GELMEZ.
--
-- ÖN KOŞUL — internal şeması var olmamalı
--   26 Tem salt-okunur doğrulama: internal/private/app_private/sec -> HİÇBİRİ YOK.
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

-- Yeni nesnelerin PUBLIC'e açık doğmasını engelle (bu şemaya özel).
ALTER DEFAULT PRIVILEGES IN SCHEMA internal REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;


-- ===========================================================================
-- ③ internal.islem_tipi_modulu — TİP -> MODÜL ALLOWLIST'İ
-- ===========================================================================
-- islemler.type CHECK'i 16 değere izin veriyor; bu allowlist ONDAN BAĞIMSIZDIR.
-- Matriste olmayan her tip NULL döner -> çağıran taraf 42501 ile reddeder.
-- "default -> no-op" davranışı yetkilendirmede KULLANILMAZ.
--
-- nakit_avans_taksit: CHECK'te var, üretimde 0 satır, özellik EMEKLİ -> NULL (deny).
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

REVOKE EXECUTE ON FUNCTION internal.islem_tipi_modulu(text) FROM PUBLIC, anon;
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
-- SEMANTİK: src/hooks/usePermissions.ts ile BİREBİR (parite testi 864 hücre).
--   • Owner -> hepsi true
--   • level VARSA  -> level'dan türetilir
--   • level YOKSA  -> actions[modul] bayrakları BİREBİR; birbirine yükseltilmez,
--                     modüller arası taşınmaz (COLLAPSE YASAK)
--   • notlar/birikim anahtarı YOKSA -> yalnız GÖRÜNÜRLÜK true; aksiyonlar yine
--     actions'a bağlı (fallback aksiyona UYGULANMAZ)
--   • Diğer modül anahtarı yoksa -> false
--   • Eksik/bozuk -> deny-by-default
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
  v_uid   uuid := auth.uid();
  v_perm  jsonb;
  v_level text;
  v_mod   jsonb;
  v_act   jsonb;
  v_gorunur boolean;
  v_modul_acik boolean;
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

  IF v_perm IS NULL THEN
    RETURN QUERY SELECT false, false, false, false, false, false, false;
    RETURN;
  END IF;

  v_level := v_perm->>'level';
  v_mod   := v_perm->'modules';
  v_act   := v_perm->'actions';

  -- Modül GÖRÜNÜRLÜĞÜ: notlar/birikim anahtarı yoksa true, diğerleri false.
  IF v_mod IS NULL OR NOT (v_mod ? p_modul) THEN
    v_gorunur := (p_modul IN ('notlar', 'birikim'));
    v_modul_acik := false;                       -- fallback AKSİYONA uygulanmaz
  ELSE
    v_gorunur := COALESCE((v_mod->>p_modul)::boolean, false);
    v_modul_acik := v_gorunur;
  END IF;

  -- Modül açıkça açık değilse: görünürlük dışında her şey deny.
  IF NOT v_modul_acik THEN
    RETURN QUERY SELECT
      v_gorunur, false, false, false, false, false,
      COALESCE((v_perm->'visibility'->>'can_see_all_users_data')::boolean, false);
    RETURN;
  END IF;

  -- GÜNCEL FORMAT: level'dan türet.
  IF v_level IS NOT NULL THEN
    -- 🔒 AÇIK ALLOWLIST — FAIL-CLOSED.
    -- Bilinmeyen bir level (yazım hatası, gelecekteki değer, bozuk kayıt)
    -- allowlist DIŞINDA kalır ve TÜM yetenekler deny olur.
    --
    -- İSTEMCİDEN BİLİNÇLİ SAPMA: usePermissions `level !== 'view'` yazdığı için
    -- bilinmeyen bir level'da can_create=TRUE üretiyor (fail-open). Sunucu bunu
    -- ÇOĞALTMAZ. Canlı doğrulama (26 Tem): level değerleri yalnız
    -- NULL(9) / edit_all(9) / edit_own(4) / view(2) -> allowlist dışı KAYIT YOK.
    -- Bu nedenle SIFIR KULLANICI ETKİLİ güvenlik deltasıdır.
    IF v_level NOT IN ('view', 'add', 'edit_own', 'edit_all') THEN
      RETURN QUERY SELECT false, false, false, false, false, false, false;
      RETURN;
    END IF;

    RETURN QUERY SELECT
      v_gorunur,
      (v_level IN ('add', 'edit_own', 'edit_all')),          -- can_create
      (v_level IN ('edit_own', 'edit_all')),                 -- can_update_own
      (v_level = 'edit_all'),                                -- can_update_all
      (v_level IN ('edit_own', 'edit_all')),                 -- can_delete_own
      (v_level = 'edit_all'),                                -- can_delete_all
      COALESCE((v_perm->'visibility'->>'can_see_all_users_data')::boolean, false);
    RETURN;
  END IF;

  -- LEGACY FORMAT: actions[modul] BİREBİR. Collapse YOK.
  RETURN QUERY SELECT
    v_gorunur,
    COALESCE((v_act->p_modul->>'can_create')::boolean, false),
    COALESCE((v_act->p_modul->>'can_update_all')::boolean, false)
      OR COALESCE((v_act->p_modul->>'can_update_own')::boolean, false),
    COALESCE((v_act->p_modul->>'can_update_all')::boolean, false),
    COALESCE((v_act->p_modul->>'can_delete_all')::boolean, false)
      OR COALESCE((v_act->p_modul->>'can_delete_own')::boolean, false),
    COALESCE((v_act->p_modul->>'can_delete_all')::boolean, false),
    COALESCE((v_perm->'visibility'->>'can_see_all_users_data')::boolean, false);
END;
$fn$;

-- Grant hijyeni: PUBLIC'e açık doğmasın; yalnız authenticated, TAM İMZAYLA.
-- RLS/Storage politikaları bu fonksiyonu authenticated bağlamında çağıracağı
-- için EXECUTE ZORUNLUDUR. Koruma "yetki yok"tan değil, şemanın Data API'de
-- expose EDİLMEMESİNDEN gelir.
REVOKE EXECUTE ON FUNCTION internal.etkin_yetki(uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION internal.etkin_yetki(uuid, text) TO authenticated;


-- ===========================================================================
-- ② internal.bakiye_ops — SUNUCU-OTORİTER BAKİYE TÜRETME
-- ===========================================================================
-- src/lib/islemBalanceOps.ts computeBalanceOps() ile BİREBİR.
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
-- calculateTargetAmount() ile BİREBİR:
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
  -- TS: sourceCurrency === targetCurrency -> return amount (YUVARLAMA YOK)
  IF COALESCE(p_source, 'TRY') = COALESCE(p_target, 'TRY') THEN
    RETURN p_amount;
  END IF;

  -- TS: if (!exchangeRate || exchangeRate <= 0) throw
  -- NaN/sonsuz ayrıca: PostgreSQL'de 'NaN' <= 0 FALSE'tur (bkz. bakiye_ops notu).
  -- Bu fonksiyon bagimsiz cagrilabildigi icin savunma burada da TEKRARLANIR.
  IF p_rate IS NULL
     OR p_rate = 'NaN'::numeric
     OR p_rate =  'Infinity'::numeric
     OR p_rate = '-Infinity'::numeric
     OR p_rate <= 0 THEN
    RAISE EXCEPTION 'Gecersiz kur: % -> % (kur=%)', p_source, p_target, p_rate
      USING ERRCODE = '22023';
  END IF;

  -- Tutar tarafi da NaN/sonsuz olmamali (cagiran zaten eliyor; derinlemesine savunma).
  IF p_amount = 'NaN'::numeric
     OR p_amount =  'Infinity'::numeric
     OR p_amount = '-Infinity'::numeric THEN
    RAISE EXCEPTION 'Gecersiz tutar (NaN/sonsuz): %', p_amount
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

REVOKE EXECUTE ON FUNCTION internal.cevrilen_tutar(numeric, numeric, text, text) FROM PUBLIC, anon;

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

REVOKE EXECUTE ON FUNCTION internal.bakiye_ops(jsonb) FROM PUBLIC, anon;
-- authenticated'a GRANT YOK — bilinçli.
