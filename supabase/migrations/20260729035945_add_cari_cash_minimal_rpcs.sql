-- =============================================================================
-- Canli migration surumu: 20260729035945
-- S-11 — CARILER-ONLY PAYLASIM ICIN BAKIYESIZ HESAP REFERANSI + DAR NAKIT RPC
-- =============================================================================
-- AMAC
--   * Yalniz Cariler modulu acik bir shared kullanici, tahsilat/odeme ekraninda
--     hesap ADI + para birimi + tipini gorebilsin; hicbir hesap tutari sizmasin.
--   * Yalniz cari_odeme / cari_tahsilat olusturabilsin. Bakiye ops'lari istemciden
--     ALINMAZ; hesap/cari para birimleri DB satirlarindan okunur ve iki delta
--     sunucuda uretilir.
--
-- VERI GUVENLIGI / ADDITIVE SINIR
--   * Yalniz iki YENI fonksiyon eklenir.
--   * Tablo/kolon/politika/trigger degisikligi, migration-time DML ve backfill YOK.
--   * Mevcut islemler, hesaplar, cariler ve kullanici kayitlari degistirilmez.
--   * Mevcut create_islem_atomik / increment_balance imzalari ve govdeleri DEGISEMEZ.
--
-- OLD CLIENT (1.5.x) IMPACT
--   * Eski client bu yeni RPC'leri bilmez ve mevcut yollarini aynen kullanir.
--   * Yeni fonksiyon adlari mevcut fonksiyonlarla cakismadigi icin eski build'de
--     davranis, sonuc sekli ve izin degisikligi yoktur.
--   * Yeni client yalniz Cariler kaynakli dar akista bu RPC'lere opt-in olur.
--
-- MANUAL TEST MATRIX (staging/dev isletmede)
--   1. Owner + cariler edit_all: aktif/arşivsiz, birikim olmayan hesap adlari gelir;
--      response kolonlarinda balance/initial_balance/credit_limit/card bilgisi yoktur.
--   2. Cariler-only shared + add/edit_*: ayni hesap adlarini gorur;
--      hicbir hesap tutari gorunmez; cari_odeme ve
--      cari_tahsilat hesabi/cariyi tam bir kez gunceller.
--   3. Ayni p_islem_id ve ayni payload ikinci kez: ayni projection doner; ikinci
--      bakiye veya tahsis satiri uretilmez.
--   4. Ayni p_islem_id + farkli payload: 42501; bakiye degismez.
--   5. view/suspended/modulu-kapali/cross-tenant UUID: generic 42501.
--   6. pasif/arsivli/birikim hesap; pasif/arsivli cari; yanlis hedef: generic
--      42501. Bu dar akista kategori NULL disinda 22023. Hicbirinde yazma yok.
--   7. Ayni para biriminde kur gonderme; capraz parada kur gondermeme/0/negatif/
--      NaN/sonsuz; 2 ondaliktan fazla tutar: 22023 ve hicbir yazma yok.
--   8. TRY->USD, USD->TRY ve USD->EUR: hesap ve cari deltalari mevcut
--      calculateTargetAmount sozlesmesiyle ayni.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) BAKIYESIZ HESAP REFERANSLARI
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.get_cari_hesap_referanslari(p_isletme_id uuid)
RETURNS TABLE (
  id uuid,
  name text,
  currency text,
  type text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_permissions jsonb;
  v_level text;
  v_can_view boolean := false;
  v_can_create boolean := false;
BEGIN
  IF v_uid IS NULL OR p_isletme_id IS NULL THEN
    RAISE EXCEPTION 'CARI_CASH_OPERATION_NOT_AUTHORIZED'
      USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.isletmeler AS isl
    WHERE isl.id = p_isletme_id
      AND isl.user_id = v_uid
  ) THEN
    v_can_view := true;
    v_can_create := true;
  ELSE
    SELECT iu.permissions
    INTO v_permissions
    FROM public.isletme_users AS iu
    WHERE iu.isletme_id = p_isletme_id
      AND iu.user_id = v_uid
      AND iu.status = 'active';

    v_can_view := COALESCE(
      v_permissions->'modules'->'cariler' = 'true'::pg_catalog.jsonb,
      false
    );
    v_level := v_permissions->>'level';
    v_can_create := CASE
      WHEN v_level IS NOT NULL THEN
        v_level IN ('add', 'edit_own', 'edit_all')
      ELSE COALESCE(
        v_permissions->'actions'->'cariler'->'can_create'
          = 'true'::pg_catalog.jsonb,
        false
      )
    END;
  END IF;

  IF NOT COALESCE(v_can_view, false)
     OR NOT COALESCE(v_can_create, false) THEN
    RAISE EXCEPTION 'CARI_CASH_OPERATION_NOT_AUTHORIZED'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    h.id,
    h.name::text,
    h.currency::text,
    h.type::text
  FROM public.hesaplar AS h
  WHERE h.isletme_id = p_isletme_id
    AND h.is_active IS TRUE
    AND h.is_archived IS FALSE
    AND h.type <> 'birikim'
  ORDER BY
    pg_catalog.lower(h.name::text),
    h.name::text,
    h.id;
END;
$function$;

REVOKE ALL
ON FUNCTION public.get_cari_hesap_referanslari(uuid)
FROM PUBLIC, anon;

GRANT EXECUTE
ON FUNCTION public.get_cari_hesap_referanslari(uuid)
TO authenticated;

COMMENT ON FUNCTION public.get_cari_hesap_referanslari(uuid) IS
  'Cariler create yetkili kullanici icin bakiye icermeyen aktif hesap referanslari.';


-- ---------------------------------------------------------------------------
-- 2) DAR, SERVER-OTORITER CARI NAKIT ISLEMI
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.create_cari_nakit_islem_atomik(
  p_isletme_id uuid,
  p_islem_id uuid,
  p_type text,
  p_amount numeric,
  p_date timestamp without time zone,
  p_hesap_id uuid,
  p_cari_id uuid,
  p_description text,
  p_kategori_id uuid,
  p_exchange_rate numeric,
  p_hedef_islem_id uuid
)
RETURNS TABLE (
  id uuid,
  type text,
  amount numeric,
  description text,
  "date" timestamp without time zone,
  hesap_id uuid,
  kategori_id uuid,
  cari_id uuid,
  source_currency text,
  target_currency text,
  exchange_rate numeric,
  hedef_islem_id uuid,
  created_at timestamp with time zone,
  created_by uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_permissions jsonb;
  v_level text;
  v_can_view boolean := false;
  v_can_create boolean := false;
  v_source_currency text;
  v_target_currency text;
  v_amount public.islemler.amount%TYPE;
  v_rate public.islemler.exchange_rate%TYPE;
  v_description text;
  v_expected_invoice_type text;
  v_locked_id uuid;
  v_cari_delta numeric;
  v_hesap_delta numeric;
  v_existing public.islemler%ROWTYPE;
  v_inserted_rows integer := 0;
  v_updated_rows integer := 0;
BEGIN
  -- Kimlik + cariler modulunun etkin create yetkisi tek kanonik resolver'dan.
  IF v_uid IS NULL OR p_isletme_id IS NULL THEN
    RAISE EXCEPTION 'CARI_CASH_OPERATION_NOT_AUTHORIZED'
      USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.isletmeler AS isl
    WHERE isl.id = p_isletme_id
      AND isl.user_id = v_uid
  ) THEN
    v_can_view := true;
    v_can_create := true;
  ELSE
    SELECT iu.permissions
    INTO v_permissions
    FROM public.isletme_users AS iu
    WHERE iu.isletme_id = p_isletme_id
      AND iu.user_id = v_uid
      AND iu.status = 'active'
    FOR SHARE;

    v_can_view := COALESCE(
      v_permissions->'modules'->'cariler' = 'true'::pg_catalog.jsonb,
      false
    );
    v_level := v_permissions->>'level';
    v_can_create := CASE
      WHEN v_level IS NOT NULL THEN
        v_level IN ('add', 'edit_own', 'edit_all')
      ELSE COALESCE(
        v_permissions->'actions'->'cariler'->'can_create'
          = 'true'::pg_catalog.jsonb,
        false
      )
    END;
  END IF;

  IF NOT COALESCE(v_can_view, false)
     OR NOT COALESCE(v_can_create, false) THEN
    RAISE EXCEPTION 'CARI_CASH_OPERATION_NOT_AUTHORIZED'
      USING ERRCODE = '42501';
  END IF;

  -- Dar islem/sekil allowlist'i. Numeric NaN ve sonsuz degerleri PostgreSQL
  -- numeric kabul ettigi icin acikca elenir.
  IF p_islem_id IS NULL
     OR p_hesap_id IS NULL
     OR p_cari_id IS NULL
     OR p_date IS NULL
     -- Bu dar Cariler-only yol kategori listesini acmaz. Bilinmeyen bir kategori
     -- UUID'sini SECURITY DEFINER ile kabul etmek yerine kategori her zaman NULL.
     OR p_kategori_id IS NOT NULL
     OR p_type IS NULL
     OR p_type NOT IN ('cari_odeme', 'cari_tahsilat')
     OR p_amount IS NULL
     OR p_amount = 'NaN'::pg_catalog.numeric
     OR p_amount = 'Infinity'::pg_catalog.numeric
     OR p_amount = '-Infinity'::pg_catalog.numeric
     OR p_amount <= 0
     OR p_amount > 9999999999999.99
     OR p_amount <> pg_catalog.round(p_amount, 2) THEN
    RAISE EXCEPTION 'CARI_CASH_OPERATION_INVALID_INPUT'
      USING ERRCODE = '22023';
  END IF;

  v_amount := p_amount;
  v_description := NULLIF(pg_catalog.btrim(p_description), '');

  IF p_exchange_rate IS NOT NULL
     AND (
       p_exchange_rate = 'NaN'::pg_catalog.numeric
       OR p_exchange_rate = 'Infinity'::pg_catalog.numeric
       OR p_exchange_rate = '-Infinity'::pg_catalog.numeric
       OR p_exchange_rate <= 0
       OR p_exchange_rate > 9999999999.99999999
     ) THEN
    RAISE EXCEPTION 'CARI_CASH_OPERATION_INVALID_INPUT'
      USING ERRCODE = '22023';
  END IF;

  -- Once cari, sonra hesap: mevcut computeBalanceOps(cari_*) kilit sirasi korunur;
  -- ikisi de ayni tenant + aktif + arsivsiz olmali.
  -- FOR NO KEY UPDATE, dogrulama ile asagidaki bakiye yazimi arasindaki TOCTOU
  -- penceresini kapatir. Hesap referans RPC'siyle ayni type filtresi kullanilir.
  SELECT c.id, c.currency::text
  INTO v_locked_id, v_target_currency
  FROM public.cariler AS c
  WHERE c.id = p_cari_id
    AND c.isletme_id = p_isletme_id
    AND c.is_active IS TRUE
    AND c.is_archived IS FALSE
  FOR NO KEY UPDATE;

  IF v_locked_id IS NULL THEN
    RAISE EXCEPTION 'CARI_CASH_OPERATION_NOT_AUTHORIZED'
      USING ERRCODE = '42501';
  END IF;

  v_locked_id := NULL;
  SELECT h.id, h.currency::text
  INTO v_locked_id, v_source_currency
  FROM public.hesaplar AS h
  WHERE h.id = p_hesap_id
    AND h.isletme_id = p_isletme_id
    AND h.is_active IS TRUE
    AND h.is_archived IS FALSE
    AND h.type <> 'birikim'
  FOR NO KEY UPDATE;

  IF v_locked_id IS NULL THEN
    RAISE EXCEPTION 'CARI_CASH_OPERATION_NOT_AUTHORIZED'
      USING ERRCODE = '42501';
  END IF;

  -- Para birimi istemciden alinmaz. DB'deki iki entity satiri kanoniktir.
  IF v_source_currency NOT IN ('TRY', 'USD', 'EUR', 'GBP', 'XAU', 'XAG')
     OR v_target_currency NOT IN ('TRY', 'USD', 'EUR', 'GBP', 'XAU', 'XAG') THEN
    RAISE EXCEPTION 'CARI_CASH_OPERATION_INVALID_INPUT'
      USING ERRCODE = '22023';
  END IF;

  IF v_source_currency = v_target_currency THEN
    IF p_exchange_rate IS NOT NULL THEN
      RAISE EXCEPTION 'CARI_CASH_OPERATION_INVALID_INPUT'
        USING ERRCODE = '22023';
    END IF;
    v_rate := NULL;
  ELSE
    IF p_exchange_rate IS NULL THEN
      RAISE EXCEPTION 'CARI_CASH_OPERATION_INVALID_INPUT'
        USING ERRCODE = '22023';
    END IF;
    -- islemler.exchange_rate numeric(18,8) kanonik saklama hassasiyeti.
    v_rate := p_exchange_rate;
    IF v_rate IS NULL OR v_rate <= 0 THEN
      RAISE EXCEPTION 'CARI_CASH_OPERATION_INVALID_INPUT'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  -- Hedef opsiyoneldir; verildiyse ayni tenant + ayni cari + dogru fatura tipi.
  -- Iki yabanci para pointer'i mevcut hedefli-mahsup read motoru tarafindan guvenle
  -- temsil edilemedigi icin sessiz NULL'a dusurmek yerine acikca reddedilir.
  v_expected_invoice_type := CASE
    WHEN p_type = 'cari_tahsilat' THEN 'cari_satis'
    ELSE 'cari_alis'
  END;

  IF p_hedef_islem_id IS NOT NULL THEN
    IF v_source_currency <> v_target_currency
       AND v_source_currency <> 'TRY'
       AND v_target_currency <> 'TRY' THEN
      RAISE EXCEPTION 'CARI_CASH_OPERATION_NOT_AUTHORIZED'
        USING ERRCODE = '42501';
    END IF;

    v_locked_id := NULL;
    SELECT i.id
    INTO v_locked_id
    FROM public.islemler AS i
    WHERE i.id = p_hedef_islem_id
      AND i.isletme_id = p_isletme_id
      AND i.cari_id = p_cari_id
      AND i.type = v_expected_invoice_type
    FOR KEY SHARE;

    IF v_locked_id IS NULL THEN
      RAISE EXCEPTION 'CARI_CASH_OPERATION_NOT_AUTHORIZED'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Mevcut matematikle birebir: ayni para = ham; TRY kaynak = bol; diger kaynak
  -- = carp; sonuc cari bacaginda 2 ondaliga yuvarlanir.
  v_cari_delta := CASE
    WHEN v_source_currency = v_target_currency THEN v_amount
    WHEN v_source_currency = 'TRY'
      THEN pg_catalog.round(v_amount / v_rate, 2)
    ELSE pg_catalog.round(v_amount * v_rate, 2)
  END;
  v_hesap_delta := CASE
    WHEN p_type = 'cari_odeme' THEN -v_amount
    ELSE v_amount
  END;
  IF p_type = 'cari_tahsilat' THEN
    v_cari_delta := -v_cari_delta;
  END IF;

  -- Idempotency on-probe: bu UUID daha once AYNI kullanici ve AYNI finansal
  -- niyetle yazildiysa yalniz guvenli projection'i dondur; hicbir delta/tahsis yok.
  SELECT i.*
  INTO v_existing
  FROM public.islemler AS i
  WHERE i.id = p_islem_id
    AND i.isletme_id = p_isletme_id
  FOR SHARE;

  IF FOUND THEN
    IF v_existing.created_by IS DISTINCT FROM v_uid
       OR v_existing.type IS DISTINCT FROM p_type
       OR v_existing.amount IS DISTINCT FROM v_amount
       OR v_existing.description IS DISTINCT FROM v_description
       OR v_existing.date IS DISTINCT FROM p_date
       OR v_existing.hesap_id IS DISTINCT FROM p_hesap_id
       OR v_existing.hedef_hesap_id IS NOT NULL
       OR v_existing.kategori_id IS NOT NULL
       OR v_existing.cari_id IS DISTINCT FROM p_cari_id
       OR v_existing.personel_id IS NOT NULL
       OR v_existing.source_currency IS DISTINCT FROM v_source_currency
       OR v_existing.target_currency IS DISTINCT FROM v_target_currency
       OR v_existing.exchange_rate IS DISTINCT FROM v_rate
       OR v_existing.photo_path IS NOT NULL
       OR v_existing.date_end IS NOT NULL
       OR v_existing.source_ileri_id IS NOT NULL
       OR v_existing.vade_tarihi IS NOT NULL
       OR v_existing.hedef_islem_id IS DISTINCT FROM p_hedef_islem_id THEN
      RAISE EXCEPTION 'CARI_CASH_OPERATION_NOT_AUTHORIZED'
        USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
    SELECT
      i.id, i.type::text, i.amount, i.description, i.date,
      i.hesap_id, i.kategori_id, i.cari_id,
      i.source_currency, i.target_currency, i.exchange_rate,
      i.hedef_islem_id, i.created_at, i.created_by
    FROM public.islemler AS i
    WHERE i.id = p_islem_id
      AND i.isletme_id = p_isletme_id;
    RETURN;
  END IF;

  INSERT INTO public.islemler (
    id,
    isletme_id,
    type,
    amount,
    description,
    date,
    hesap_id,
    hedef_hesap_id,
    kategori_id,
    cari_id,
    personel_id,
    source_currency,
    target_currency,
    exchange_rate,
    photo_path,
    date_end,
    source_ileri_id,
    vade_tarihi,
    hedef_islem_id,
    created_by
  )
  VALUES (
    p_islem_id,
    p_isletme_id,
    p_type,
    v_amount,
    v_description,
    p_date,
    p_hesap_id,
    NULL,
    NULL,
    p_cari_id,
    NULL,
    v_source_currency,
    v_target_currency,
    v_rate,
    NULL,
    NULL,
    NULL,
    NULL,
    p_hedef_islem_id,
    v_uid
  )
  -- RETURNS TABLE'daki `id` output değişkeniyle kolon adını belirsiz bırakma.
  -- Canlı şemadaki sabit PK constraint adı, aynı UUID idempotency kapısını açıkça seçer.
  ON CONFLICT ON CONSTRAINT islemler_pkey DO NOTHING;

  GET DIAGNOSTICS v_inserted_rows = ROW_COUNT;

  -- Concurrent ayni-UUID yarisi: kazanan satiri commit ettikten sonra ikinci
  -- cagrida INSERT 0 olur. Payload birebir ise no-op return; degilse 42501.
  IF v_inserted_rows = 0 THEN
    SELECT i.*
    INTO v_existing
    FROM public.islemler AS i
    WHERE i.id = p_islem_id
      AND i.isletme_id = p_isletme_id
    FOR SHARE;

    IF NOT FOUND
       OR v_existing.created_by IS DISTINCT FROM v_uid
       OR v_existing.type IS DISTINCT FROM p_type
       OR v_existing.amount IS DISTINCT FROM v_amount
       OR v_existing.description IS DISTINCT FROM v_description
       OR v_existing.date IS DISTINCT FROM p_date
       OR v_existing.hesap_id IS DISTINCT FROM p_hesap_id
       OR v_existing.hedef_hesap_id IS NOT NULL
       OR v_existing.kategori_id IS NOT NULL
       OR v_existing.cari_id IS DISTINCT FROM p_cari_id
       OR v_existing.personel_id IS NOT NULL
       OR v_existing.source_currency IS DISTINCT FROM v_source_currency
       OR v_existing.target_currency IS DISTINCT FROM v_target_currency
       OR v_existing.exchange_rate IS DISTINCT FROM v_rate
       OR v_existing.photo_path IS NOT NULL
       OR v_existing.date_end IS NOT NULL
       OR v_existing.source_ileri_id IS NOT NULL
       OR v_existing.vade_tarihi IS NOT NULL
       OR v_existing.hedef_islem_id IS DISTINCT FROM p_hedef_islem_id THEN
      RAISE EXCEPTION 'CARI_CASH_OPERATION_NOT_AUTHORIZED'
        USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
    SELECT
      i.id, i.type::text, i.amount, i.description, i.date,
      i.hesap_id, i.kategori_id, i.cari_id,
      i.source_currency, i.target_currency, i.exchange_rate,
      i.hedef_islem_id, i.created_at, i.created_by
    FROM public.islemler AS i
    WHERE i.id = p_islem_id
      AND i.isletme_id = p_isletme_id;
    RETURN;
  END IF;

  -- Bakiye ops JSON'u YOK; iki delta sunucuda uretilmistir. Her UPDATE hem id hem
  -- tenant hem de dogrulanan aktif/arsivsiz durumunu tekrar scope eder.
  UPDATE public.cariler AS c
  SET
    balance = c.balance + v_cari_delta,
    updated_at = pg_catalog.now()
  WHERE c.id = p_cari_id
    AND c.isletme_id = p_isletme_id
    AND c.is_active IS TRUE
    AND c.is_archived IS FALSE;

  GET DIAGNOSTICS v_updated_rows = ROW_COUNT;
  IF v_updated_rows <> 1 THEN
    RAISE EXCEPTION 'CARI_CASH_OPERATION_NOT_AUTHORIZED'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.hesaplar AS h
  SET
    balance = h.balance + v_hesap_delta,
    updated_at = pg_catalog.now()
  WHERE h.id = p_hesap_id
    AND h.isletme_id = p_isletme_id
    AND h.is_active IS TRUE
    AND h.is_archived IS FALSE
    AND h.type <> 'birikim';

  GET DIAGNOSTICS v_updated_rows = ROW_COUNT;
  IF v_updated_rows <> 1 THEN
    RAISE EXCEPTION 'CARI_CASH_OPERATION_NOT_AUTHORIZED'
      USING ERRCODE = '42501';
  END IF;

  -- Mevcut TEK FIFO/tahsis motoru: bakiye iki bacakta basariyla yazildiktan
  -- sonra, ayni DB transaction'i icinde hedef onceligi + FIFO dagitimi.
  PERFORM public.tahsis_odeme_esitle(
    p_isletme_id,
    p_islem_id,
    p_hedef_islem_id
  );

  RETURN QUERY
  SELECT
    i.id, i.type::text, i.amount, i.description, i.date,
    i.hesap_id, i.kategori_id, i.cari_id,
    i.source_currency, i.target_currency, i.exchange_rate,
    i.hedef_islem_id, i.created_at, i.created_by
  FROM public.islemler AS i
  WHERE i.id = p_islem_id
    AND i.isletme_id = p_isletme_id;
END;
$function$;

REVOKE ALL
ON FUNCTION public.create_cari_nakit_islem_atomik(
  uuid, uuid, text, numeric, timestamp without time zone,
  uuid, uuid, text, uuid, numeric, uuid
)
FROM PUBLIC, anon;

GRANT EXECUTE
ON FUNCTION public.create_cari_nakit_islem_atomik(
  uuid, uuid, text, numeric, timestamp without time zone,
  uuid, uuid, text, uuid, numeric, uuid
)
TO authenticated;

COMMENT ON FUNCTION public.create_cari_nakit_islem_atomik(
  uuid, uuid, text, numeric, timestamp without time zone,
  uuid, uuid, text, uuid, numeric, uuid
) IS
  'Cariler-only shared akisi icin server-otoriter, idempotent cari odeme/tahsilat RPCsi.';
