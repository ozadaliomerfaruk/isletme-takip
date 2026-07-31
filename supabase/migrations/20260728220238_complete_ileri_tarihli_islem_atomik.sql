-- =============================================================================
-- S-02 — İleri tarihli işlemi tek PostgreSQL transaction'ında tamamlama
-- Canlı migration sürümü: 20260728220238
-- =============================================================================
-- ADDITIVE / VERİ KORUYUCU:
--   * Kolon, tablo veya kullanıcı işlemi SİLMEZ / yeniden yazmaz.
--   * Mevcut RPC imzalarını değiştirmez; yalnız yeni bir RPC ve durum-koruma
--     trigger'ı ekler.
--   * Yeni istemci: scheduled satır kilidi + server-derived işlem/bakiye +
--     create_islem_atomik + completed status aynı transaction.
--   * Eski istemci: eski yolunu kullanmaya devam eder. Yeni yol bir işlemi
--     tamamladıktan sonra eski istemcinin hata-rollback'i satırı yeniden
--     pending/notified yapamaz.
--
-- Neden ayrı RPC:
--   Client-side claim -> insert -> N bakiye çağrısı akışı process-kill, cevap
--   kaybı ve iki cihaz yarışında yarım durum bırakabiliyordu. Ayrıca istemcinin
--   önce okuduğu scheduled snapshot, eşzamanlı düzenleme sonrası bayat kalabiliyordu.
--   Bu fonksiyon kaynağı FOR UPDATE ile kilitler ve finansal satırı kilitli
--   server kaydından üretir.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.complete_ileri_tarihli_islem_atomik(
  p_isletme_id uuid,
  p_ileri_id uuid,
  p_exchange_rate numeric DEFAULT NULL,
  p_expected_token text DEFAULT NULL,
  p_completion_at timestamp without time zone DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_scheduled public.ileri_tarihli_islemler%ROWTYPE;
  v_existing public.islemler%ROWTYPE;
  v_result jsonb;
  v_new_row jsonb;
  v_ops jsonb := '[]'::jsonb;

  v_hesap_currency text := 'TRY';
  v_hedef_currency text := 'TRY';
  v_cari_currency text := 'TRY';
  v_personel_currency text := 'TRY';
  v_source_currency text := 'TRY';
  v_target_currency text := 'TRY';
  v_is_cross boolean := false;
  v_amount numeric(15,2);
  v_rate numeric(18,8);
  v_converted numeric;
  v_completion_token text;
  v_completion_at timestamp without time zone;

  v_cari_isletme_id uuid;
  v_is_owner boolean := false;
  v_has_existing boolean := false;
  v_permissions jsonb;
  v_level text;
  v_can_see_all boolean := false;
  v_can_update_scheduled boolean := false;
  v_can_create_islemler boolean := false;
  v_required_modules text[];
  v_module text;
  v_module_can_create boolean;
  v_rowcount integer;
BEGIN
  IF auth.uid() IS NULL
     OR public.user_has_isletme_access(p_isletme_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'Bu işlem için yetkiniz yok'
      USING ERRCODE = '42501';
  END IF;

  -- İşletme/membership yetkisi tamamlamanın sonuna kadar sabit kalsın. Aksi halde
  -- owner aynı anda üyeliği daraltırken nested bakiye bacakları 0-row kalabilirdi.
  -- Parent önce kilitlenir; işletme silmenin FK cascade parent->child sırasıyla aynı
  -- sıra kullanılarak child->parent deadlock döngüsü önlenir.
  SELECT b.user_id = auth.uid()
  INTO v_is_owner
  FROM public.isletmeler b
  WHERE b.id = p_isletme_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'İşletme bulunamadı'
      USING ERRCODE = 'P0002';
  END IF;

  -- Kaynak satır aynı işleme yarışan tüm yeni istemcileri serileştirir.
  SELECT it.*
  INTO v_scheduled
  FROM public.ileri_tarihli_islemler it
  WHERE it.id = p_ileri_id
    AND it.isletme_id = p_isletme_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SCHEDULED_NOT_FOUND'
      USING ERRCODE = 'P0002';
  END IF;

  -- Tip -> kaynak modül allowlist'i. Bilinmeyen tip fail-closed; ödeme/tahsilatta
  -- hesap yalnız para bacağıdır, cari işlemler için ayrıca Hesaplar modülü aranmaz.
  v_required_modules := CASE
    WHEN v_scheduled.type IN ('gelir', 'gider', 'transfer')
      THEN ARRAY['hesaplar']
    WHEN v_scheduled.type IN (
      'cari_alis',
      'cari_satis',
      'cari_odeme',
      'cari_tahsilat',
      'cari_alis_iade',
      'cari_satis_iade'
    )
      THEN ARRAY['cariler']
    WHEN v_scheduled.type IN (
      'personel_gider',
      'personel_satis',
      'personel_izin_hakki',
      'personel_izin_kullanimi'
    )
      THEN ARRAY['personel']
    WHEN v_scheduled.type IN ('personel_odeme', 'personel_tahsilat')
      THEN ARRAY['personel', 'hesaplar']
    ELSE NULL
  END;

  IF v_required_modules IS NULL THEN
    RAISE EXCEPTION 'SCHEDULED_UNSUPPORTED_TYPE'
      USING ERRCODE = '22023';
  END IF;

  -- Owner dışındaki kullanıcıda istemcinin sade level modeli ile legacy actions
  -- fallback'ini aynı sırada çöz. SECURITY DEFINER RLS'i baypas ettiği için hem
  -- görünürlük hem satır-sahipliği hem de kaynak modül create yeteneği burada kesişir.
  IF v_is_owner IS NOT TRUE THEN
    SELECT iu.permissions
    INTO v_permissions
    FROM public.isletme_users iu
    WHERE iu.isletme_id = p_isletme_id
      AND iu.user_id = auth.uid()
      AND iu.status = 'active'
    FOR SHARE;

    IF NOT FOUND OR v_permissions IS NULL THEN
      RAISE EXCEPTION 'Bu işlem için yetkiniz yok'
        USING ERRCODE = '42501';
    END IF;

    v_level := v_permissions->>'level';
    IF v_level IS NOT NULL
       AND v_level NOT IN ('view', 'add', 'edit_own', 'edit_all') THEN
      RAISE EXCEPTION 'Bu işlem için yetkiniz yok'
        USING ERRCODE = '42501';
    END IF;

    v_can_see_all := COALESCE(
      (v_permissions->'visibility'->>'can_see_all_users_data')::boolean,
      false
    );

    v_can_update_scheduled :=
      COALESCE(
        (v_permissions->'modules'->>'ileri_tarihli')::boolean,
        false
      )
      AND CASE
        WHEN v_level IS NOT NULL THEN
          v_level = 'edit_all'
          OR (
            v_level = 'edit_own'
            AND v_scheduled.created_by = auth.uid()
          )
        ELSE
          COALESCE(
            (v_permissions->'actions'->'ileri_tarihli'->>'can_update_all')::boolean,
            false
          )
          OR (
            COALESCE(
              (v_permissions->'actions'->'ileri_tarihli'->>'can_update_own')::boolean,
              false
            )
            AND v_scheduled.created_by = auth.uid()
          )
      END;

    IF v_can_update_scheduled IS NOT TRUE
       OR (
         v_can_see_all
         OR v_scheduled.created_by = auth.uid()
       ) IS NOT TRUE THEN
      RAISE EXCEPTION 'Bu işlemi tamamlamaya yetkiniz yok'
        USING ERRCODE = '42501';
    END IF;

    v_can_create_islemler :=
      COALESCE(
        (v_permissions->'modules'->>'islemler')::boolean,
        false
      )
      AND CASE
        WHEN v_level IS NOT NULL THEN
          v_level IN ('add', 'edit_own', 'edit_all')
        ELSE
          COALESCE(
            (v_permissions->'actions'->'islemler'->>'can_create')::boolean,
            false
          )
      END;

    IF v_can_create_islemler IS NOT TRUE THEN
      RAISE EXCEPTION 'Bu işlem için işlem oluşturma yetkiniz yok'
        USING ERRCODE = '42501';
    END IF;

    FOREACH v_module IN ARRAY v_required_modules
    LOOP
      v_module_can_create :=
        COALESCE(
          (v_permissions->'modules'->>v_module)::boolean,
          false
        )
        AND CASE
          WHEN v_level IS NOT NULL THEN
            v_level IN ('add', 'edit_own', 'edit_all')
          ELSE
            COALESCE(
              (v_permissions->'actions'->v_module->>'can_create')::boolean,
              false
            )
        END;

      IF v_module_can_create IS NOT TRUE THEN
        RAISE EXCEPTION 'Bu işlem için % modülünde ekleme yetkiniz yok', v_module
          USING ERRCODE = '42501';
      END IF;
    END LOOP;
  END IF;

  -- Nested atomik motorun mevcut, legacy grant kapısı da savunma katmanı olarak
  -- korunur. Yeni sade rol kayıtlarında transition actions alanı halen türetilir.
  IF public.user_can_islem_action(p_isletme_id, 'create', NULL) IS NOT TRUE THEN
    RAISE EXCEPTION 'Bu işlem için yetkiniz yok (işlem oluşturma)'
      USING ERRCODE = '42501';
  END IF;

  -- Cevabı kaybolmuş önceki YENİ istemci çağrısı: yalnız tam deterministik
  -- kayıt idempotent başarıdır. Eski istemcinin farklı UUID'li kaydı belirsiz
  -- bakiye zinciri taşıyabileceğinden ikinci finansal etki üretilmez.
  SELECT i.*
  INTO v_existing
  FROM public.islemler i
  WHERE i.source_ileri_id = p_ileri_id
  LIMIT 1
  FOR SHARE;

  v_has_existing := FOUND;

  IF v_has_existing THEN
    IF v_existing.id IS DISTINCT FROM p_ileri_id
       OR v_existing.isletme_id IS DISTINCT FROM p_isletme_id THEN
      RAISE EXCEPTION 'SCHEDULED_SOURCE_CONFLICT'
        USING ERRCODE = '23505';
    END IF;
  END IF;

  -- completed + source yok, eski sürümlerdeki claim ile finansal yazma arasındaki
  -- belirsiz pencere olabilir. Canlıda source kolonu öncesinden kalan tarihsel
  -- completed satırlar da bulunduğu için burada ASLA tahmini insert yapılmaz.
  IF NOT v_has_existing
     AND v_scheduled.status NOT IN ('pending', 'notified') THEN
    RAISE EXCEPTION 'SCHEDULED_NOT_COMPLETABLE'
      USING ERRCODE = '55000';
  END IF;

  -- Atomik RPC commit ettiyse işlem satırı ve completed durumu aynı transaction'da
  -- kalıcılaşır. Deterministik source varken parent hâlâ pending/notified ise bu,
  -- pre-seed/manuel/yarım legacy durumudur; başarı sayıp parent'ı ileri taşımayız.
  IF v_has_existing
     AND v_scheduled.status IS DISTINCT FROM 'completed' THEN
    RAISE EXCEPTION 'SCHEDULED_STATUS_CONFLICT'
      USING ERRCODE = '55000';
  END IF;

  -- Tip başına zorunlu entity sözleşmesi. Eksik bacakla satır ekleyip bakiyeyi
  -- sessizce no-op bırakmak finansal olarak kabul edilmez.
  CASE
    WHEN v_scheduled.type IN ('gelir', 'gider') THEN
      IF v_scheduled.hesap_id IS NULL THEN
        RAISE EXCEPTION 'SCHEDULED_REQUIRED_ENTITY_MISSING'
          USING ERRCODE = '23502';
      END IF;
      IF v_scheduled.hedef_hesap_id IS NOT NULL
         OR v_scheduled.cari_id IS NOT NULL
         OR v_scheduled.personel_id IS NOT NULL THEN
        RAISE EXCEPTION 'SCHEDULED_ENTITY_SHAPE_INVALID'
          USING ERRCODE = '22023';
      END IF;
    WHEN v_scheduled.type = 'transfer' THEN
      IF v_scheduled.hesap_id IS NULL
         OR v_scheduled.hedef_hesap_id IS NULL THEN
        RAISE EXCEPTION 'SCHEDULED_REQUIRED_ENTITY_MISSING'
          USING ERRCODE = '23502';
      END IF;
      IF v_scheduled.hesap_id = v_scheduled.hedef_hesap_id
         OR v_scheduled.cari_id IS NOT NULL
         OR v_scheduled.personel_id IS NOT NULL THEN
        RAISE EXCEPTION 'SCHEDULED_ENTITY_SHAPE_INVALID'
          USING ERRCODE = '22023';
      END IF;
    WHEN v_scheduled.type IN (
      'cari_alis',
      'cari_satis',
      'cari_alis_iade',
      'cari_satis_iade'
    ) THEN
      IF v_scheduled.cari_id IS NULL THEN
        RAISE EXCEPTION 'SCHEDULED_REQUIRED_ENTITY_MISSING'
          USING ERRCODE = '23502';
      END IF;
      IF v_scheduled.hesap_id IS NOT NULL
         OR v_scheduled.hedef_hesap_id IS NOT NULL
         OR v_scheduled.personel_id IS NOT NULL THEN
        RAISE EXCEPTION 'SCHEDULED_ENTITY_SHAPE_INVALID'
          USING ERRCODE = '22023';
      END IF;
    WHEN v_scheduled.type IN ('cari_odeme', 'cari_tahsilat') THEN
      IF v_scheduled.cari_id IS NULL
         OR v_scheduled.hesap_id IS NULL THEN
        RAISE EXCEPTION 'SCHEDULED_REQUIRED_ENTITY_MISSING'
          USING ERRCODE = '23502';
      END IF;
      IF v_scheduled.hedef_hesap_id IS NOT NULL
         OR v_scheduled.personel_id IS NOT NULL THEN
        RAISE EXCEPTION 'SCHEDULED_ENTITY_SHAPE_INVALID'
          USING ERRCODE = '22023';
      END IF;
    WHEN v_scheduled.type IN (
      'personel_gider',
      'personel_satis',
      'personel_izin_hakki',
      'personel_izin_kullanimi'
    ) THEN
      IF v_scheduled.personel_id IS NULL THEN
        RAISE EXCEPTION 'SCHEDULED_REQUIRED_ENTITY_MISSING'
          USING ERRCODE = '23502';
      END IF;
      IF v_scheduled.hesap_id IS NOT NULL
         OR v_scheduled.hedef_hesap_id IS NOT NULL
         OR v_scheduled.cari_id IS NOT NULL THEN
        RAISE EXCEPTION 'SCHEDULED_ENTITY_SHAPE_INVALID'
          USING ERRCODE = '22023';
      END IF;
    WHEN v_scheduled.type IN ('personel_odeme', 'personel_tahsilat') THEN
      IF v_scheduled.personel_id IS NULL
         OR v_scheduled.hesap_id IS NULL THEN
        RAISE EXCEPTION 'SCHEDULED_REQUIRED_ENTITY_MISSING'
          USING ERRCODE = '23502';
      END IF;
      IF v_scheduled.hedef_hesap_id IS NOT NULL
         OR v_scheduled.cari_id IS NOT NULL THEN
        RAISE EXCEPTION 'SCHEDULED_ENTITY_SHAPE_INVALID'
          USING ERRCODE = '22023';
      END IF;
    ELSE
      RAISE EXCEPTION 'SCHEDULED_UNSUPPORTED_TYPE'
        USING ERRCODE = '22023';
  END CASE;

  IF v_scheduled.amount IS NULL
     OR v_scheduled.amount = 'NaN'::numeric
     OR v_scheduled.amount = 'Infinity'::numeric
     OR v_scheduled.amount = '-Infinity'::numeric
     OR v_scheduled.amount <= 0 THEN
    RAISE EXCEPTION 'SCHEDULED_INVALID_AMOUNT'
      USING ERRCODE = '22023';
  END IF;

  -- Scheduled.amount tarihsel olarak çıplak DECIMAL; islemler.amount numeric(15,2).
  -- Bakiye ile işlem satırının kuruşta ayrışmaması için ÖNCE hedef tipe kanonikleştir.
  v_amount := v_scheduled.amount::numeric(15,2);
  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'SCHEDULED_INVALID_AMOUNT'
      USING ERRCODE = '22023';
  END IF;

  IF p_exchange_rate IS NOT NULL
     AND (
       p_exchange_rate = 'NaN'::numeric
       OR p_exchange_rate = 'Infinity'::numeric
       OR p_exchange_rate = '-Infinity'::numeric
       OR p_exchange_rate <= 0
     ) THEN
    RAISE EXCEPTION 'SCHEDULED_INVALID_EXCHANGE_RATE'
      USING ERRCODE = '22023';
  END IF;

  IF p_exchange_rate IS NOT NULL THEN
    v_rate := p_exchange_rate::numeric(18,8);
    IF v_rate <= 0 THEN
      RAISE EXCEPTION 'SCHEDULED_INVALID_EXCHANGE_RATE'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  -- Para birimleri yalnız kilitli scheduled satırın bağlı entity'lerinden çözülür.
  -- KEY SHARE silmeyi engeller fakat balance NO KEY UPDATE ile uyumludur; böylece
  -- iki completion SHARE->UPDATE lock upgrade deadlock'ına girmez. Currency yarışına
  -- karşı create sonrasında ayrıca postcondition kontrolü yapılır.
  IF v_scheduled.hesap_id IS NOT NULL THEN
    SELECT COALESCE(
      NULLIF(pg_catalog.upper(pg_catalog.btrim(h.currency::text)), ''),
      'TRY'
    )
    INTO v_hesap_currency
    FROM public.hesaplar h
    WHERE h.id = v_scheduled.hesap_id
      AND h.isletme_id = p_isletme_id
    FOR KEY SHARE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'SCHEDULED_ENTITY_SCOPE_MISMATCH'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF v_scheduled.hedef_hesap_id IS NOT NULL THEN
    SELECT COALESCE(
      NULLIF(pg_catalog.upper(pg_catalog.btrim(h.currency::text)), ''),
      'TRY'
    )
    INTO v_hedef_currency
    FROM public.hesaplar h
    WHERE h.id = v_scheduled.hedef_hesap_id
      AND h.isletme_id = p_isletme_id
    FOR KEY SHARE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'SCHEDULED_ENTITY_SCOPE_MISMATCH'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF v_scheduled.cari_id IS NOT NULL THEN
    SELECT
      c.isletme_id,
      COALESCE(
        NULLIF(pg_catalog.upper(pg_catalog.btrim(c.currency::text)), ''),
        'TRY'
      )
    INTO
      v_cari_isletme_id,
      v_cari_currency
    FROM public.cariler c
    WHERE c.id = v_scheduled.cari_id
    FOR KEY SHARE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'SCHEDULED_ENTITY_SCOPE_MISMATCH'
        USING ERRCODE = '42501';
    END IF;

    -- Mevcut increment_balance yabancı owner carisinde 0 satır güncelleyip başarı
    -- dönebiliyor. Canlı pending/notified envanterinde böyle kayıt yok; yanlış
    -- cross-tenant bakiye yazmaktansa bu ilk pakette güvenli biçimde fail-closed.
    IF v_cari_isletme_id IS DISTINCT FROM p_isletme_id THEN
      RAISE EXCEPTION 'SCHEDULED_LINKED_CARI_UNSUPPORTED'
        USING ERRCODE = '0A000';
    END IF;
  END IF;

  IF v_scheduled.personel_id IS NOT NULL THEN
    SELECT COALESCE(
      NULLIF(pg_catalog.upper(pg_catalog.btrim(p.currency::text)), ''),
      'TRY'
    )
    INTO v_personel_currency
    FROM public.personel p
    WHERE p.id = v_scheduled.personel_id
      AND p.isletme_id = p_isletme_id
    FOR KEY SHARE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'SCHEDULED_ENTITY_SCOPE_MISMATCH'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF v_scheduled.kategori_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM public.kategoriler k
       WHERE k.id = v_scheduled.kategori_id
         AND k.isletme_id = p_isletme_id
     ) THEN
    RAISE EXCEPTION 'SCHEDULED_ENTITY_SCOPE_MISMATCH'
      USING ERRCODE = '42501';
  END IF;

  IF v_hesap_currency NOT IN ('TRY', 'USD', 'EUR', 'GBP', 'XAU', 'XAG')
     OR v_hedef_currency NOT IN ('TRY', 'USD', 'EUR', 'GBP', 'XAU', 'XAG')
     OR v_cari_currency NOT IN ('TRY', 'USD', 'EUR', 'GBP', 'XAU', 'XAG')
     OR v_personel_currency NOT IN ('TRY', 'USD', 'EUR', 'GBP', 'XAU', 'XAG') THEN
    RAISE EXCEPTION 'SCHEDULED_UNSUPPORTED_CURRENCY'
      USING ERRCODE = '22023';
  END IF;

  -- resolveIslemLegs + calculateTargetAmount server aynası.
  IF v_scheduled.type IN (
    'transfer',
    'cari_odeme',
    'cari_tahsilat',
    'personel_odeme',
    'personel_tahsilat'
  ) THEN
    v_source_currency := v_hesap_currency;
    v_target_currency := CASE
      WHEN v_scheduled.type = 'transfer' THEN v_hedef_currency
      WHEN v_scheduled.type LIKE 'cari_%' THEN v_cari_currency
      ELSE v_personel_currency
    END;
  ELSIF v_scheduled.type LIKE 'cari_%' THEN
    v_source_currency := v_cari_currency;
    v_target_currency := v_cari_currency;
  ELSIF v_scheduled.type LIKE 'personel_%' THEN
    v_source_currency := v_personel_currency;
    v_target_currency := v_personel_currency;
  ELSE
    v_source_currency := v_hesap_currency;
    v_target_currency := v_hesap_currency;
  END IF;

  v_is_cross := v_source_currency IS DISTINCT FROM v_target_currency;

  -- İlk kur istemi ile kullanıcının kur onayı arasında plan başka cihazda
  -- değişebilir. updated_at otomatik olmadığı için güvenilir revision değildir;
  -- finansal niyetin tamamından deterministik token üretip retry'da eşleştir.
  v_completion_token := pg_catalog.md5(
    pg_catalog.jsonb_build_object(
      'type', v_scheduled.type,
      'amount', v_amount,
      'description', v_scheduled.description,
      'scheduled_date', v_scheduled.scheduled_date,
      'hesap_id', v_scheduled.hesap_id,
      'hedef_hesap_id', v_scheduled.hedef_hesap_id,
      'kategori_id', v_scheduled.kategori_id,
      'cari_id', v_scheduled.cari_id,
      'personel_id', v_scheduled.personel_id,
      'source_currency', v_source_currency,
      'target_currency', v_target_currency
    )::text
  );

  IF NOT v_has_existing
     AND p_exchange_rate IS NOT NULL
     AND p_expected_token IS DISTINCT FROM v_completion_token THEN
    RAISE EXCEPTION 'SCHEDULED_COMPLETION_CHANGED'
      USING ERRCODE = '55000';
  END IF;

  IF v_is_cross AND v_rate IS NULL AND v_has_existing THEN
    IF v_existing.exchange_rate IS NULL
       OR v_existing.exchange_rate = 'NaN'::numeric
       OR v_existing.exchange_rate = 'Infinity'::numeric
       OR v_existing.exchange_rate = '-Infinity'::numeric
       OR v_existing.exchange_rate <= 0 THEN
      RAISE EXCEPTION 'SCHEDULED_SOURCE_CONFLICT'
        USING ERRCODE = '23505';
    END IF;
    v_rate := v_existing.exchange_rate::numeric(18,8);
  END IF;

  IF v_is_cross AND v_rate IS NULL THEN
    RAISE EXCEPTION 'CROSS_CURRENCY_RATE_REQUIRED:%->%:%:%',
      v_source_currency,
      v_target_currency,
      v_amount,
      v_completion_token
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT v_is_cross THEN
    v_converted := v_amount;
  ELSIF v_source_currency = 'TRY' THEN
    v_converted := pg_catalog.round(v_amount / v_rate, 2);
  ELSE
    v_converted := pg_catalog.round(v_amount * v_rate, 2);
  END IF;

  v_completion_at := COALESCE(
    p_completion_at,
    pg_catalog.clock_timestamp() AT TIME ZONE 'Europe/Istanbul'
  );

  -- computeBalanceOps server aynası. Foreign linked cari yukarıda fail-closed
  -- durdurulduğu için buradaki her bakiye bacağı aynı işletmeye aittir.
  CASE v_scheduled.type
    WHEN 'gelir' THEN
      IF v_scheduled.hesap_id IS NOT NULL THEN
        v_ops := v_ops || pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_object(
            't', 'hesaplar', 'id', v_scheduled.hesap_id, 'd', v_amount
          )
        );
      END IF;
    WHEN 'gider' THEN
      IF v_scheduled.hesap_id IS NOT NULL THEN
        v_ops := v_ops || pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_object(
            't', 'hesaplar', 'id', v_scheduled.hesap_id, 'd', -v_amount
          )
        );
      END IF;
    WHEN 'transfer' THEN
      IF v_scheduled.hesap_id IS NOT NULL THEN
        v_ops := v_ops || pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_object(
            't', 'hesaplar', 'id', v_scheduled.hesap_id, 'd', -v_amount
          )
        );
      END IF;
      IF v_scheduled.hedef_hesap_id IS NOT NULL THEN
        v_ops := v_ops || pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_object(
            't', 'hesaplar', 'id', v_scheduled.hedef_hesap_id, 'd', v_converted
          )
        );
      END IF;
    WHEN 'cari_alis' THEN
      v_ops := v_ops || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          't', 'cariler', 'id', v_scheduled.cari_id, 'd', -v_amount
        )
      );
    WHEN 'cari_satis' THEN
      v_ops := v_ops || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          't', 'cariler', 'id', v_scheduled.cari_id, 'd', v_amount
        )
      );
    WHEN 'cari_odeme' THEN
      -- Canonical computeBalanceOps sırası: cari -> hesap.
      v_ops := v_ops || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          't', 'cariler', 'id', v_scheduled.cari_id, 'd', v_converted
        )
      );
      IF v_scheduled.hesap_id IS NOT NULL THEN
        v_ops := v_ops || pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_object(
            't', 'hesaplar', 'id', v_scheduled.hesap_id, 'd', -v_amount
          )
        );
      END IF;
    WHEN 'cari_tahsilat' THEN
      -- Canonical computeBalanceOps sırası: cari -> hesap.
      v_ops := v_ops || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          't', 'cariler', 'id', v_scheduled.cari_id, 'd', -v_converted
        )
      );
      IF v_scheduled.hesap_id IS NOT NULL THEN
        v_ops := v_ops || pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_object(
            't', 'hesaplar', 'id', v_scheduled.hesap_id, 'd', v_amount
          )
        );
      END IF;
    WHEN 'personel_gider' THEN
      IF v_scheduled.personel_id IS NOT NULL THEN
        v_ops := v_ops || pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_object(
            't', 'personel', 'id', v_scheduled.personel_id, 'd', -v_amount
          )
        );
      END IF;
    WHEN 'personel_odeme' THEN
      IF v_scheduled.personel_id IS NOT NULL THEN
        v_ops := v_ops || pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_object(
            't', 'personel', 'id', v_scheduled.personel_id, 'd', v_converted
          )
        );
      END IF;
      IF v_scheduled.hesap_id IS NOT NULL THEN
        v_ops := v_ops || pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_object(
            't', 'hesaplar', 'id', v_scheduled.hesap_id, 'd', -v_amount
          )
        );
      END IF;
    WHEN 'cari_alis_iade' THEN
      v_ops := v_ops || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          't', 'cariler', 'id', v_scheduled.cari_id, 'd', v_amount
        )
      );
    WHEN 'cari_satis_iade' THEN
      v_ops := v_ops || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          't', 'cariler', 'id', v_scheduled.cari_id, 'd', -v_amount
        )
      );
    WHEN 'personel_tahsilat' THEN
      IF v_scheduled.personel_id IS NOT NULL THEN
        v_ops := v_ops || pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_object(
            't', 'personel', 'id', v_scheduled.personel_id, 'd', -v_converted
          )
        );
      END IF;
      IF v_scheduled.hesap_id IS NOT NULL THEN
        v_ops := v_ops || pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_object(
            't', 'hesaplar', 'id', v_scheduled.hesap_id, 'd', v_amount
          )
        );
      END IF;
    WHEN 'personel_satis' THEN
      IF v_scheduled.personel_id IS NOT NULL THEN
        v_ops := v_ops || pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_object(
            't', 'personel', 'id', v_scheduled.personel_id, 'd', v_amount
          )
        );
      END IF;
    ELSE
      -- personel izin tipleri bakiye üretmez; mevcut computeBalanceOps ile aynı.
      NULL;
  END CASE;

  v_new_row := pg_catalog.jsonb_build_object(
    'id', p_ileri_id,
    'isletme_id', p_isletme_id,
    'type', v_scheduled.type,
    'amount', v_amount,
    'description', v_scheduled.description,
    'date', v_completion_at,
    'hesap_id', v_scheduled.hesap_id,
    'hedef_hesap_id', v_scheduled.hedef_hesap_id,
    'kategori_id', v_scheduled.kategori_id,
    'cari_id', v_scheduled.cari_id,
    'personel_id', v_scheduled.personel_id,
    'source_currency', v_source_currency,
    'target_currency', v_target_currency,
    'exchange_rate', CASE WHEN v_is_cross THEN v_rate ELSE NULL END,
    'source_ileri_id', p_ileri_id
  );

  IF NOT v_has_existing THEN
    BEGIN
      -- Insert + yerel entity bakiyeleri + tahsis/avans mevcut tek motor üzerinden.
      v_result := public.create_islem_atomik(
        p_isletme_id,
        v_new_row,
        v_ops
      );
    EXCEPTION
      WHEN unique_violation THEN
        SELECT i.*
        INTO v_existing
        FROM public.islemler i
        WHERE i.source_ileri_id = p_ileri_id
        LIMIT 1
        FOR SHARE;

        IF FOUND
           AND (
             v_existing.id <> p_ileri_id
             OR v_existing.isletme_id <> p_isletme_id
           ) THEN
          RAISE EXCEPTION 'SCHEDULED_SOURCE_CONFLICT'
            USING ERRCODE = '23505';
        END IF;
        RAISE;
    END;
  END IF;

  -- Hem idempotent pre-read hem de nested motor sonucu yalnız DB'deki gerçek satırla
  -- doğrulanır. Böylece ON CONFLICT veya gelecekteki constraint driftinde yalnız
  -- id/isletme/source üçlüsüne güvenilip eksik finansal sözleşme kabul edilmez.
  SELECT i.*
  INTO v_existing
  FROM public.islemler i
  WHERE i.id = p_ileri_id
    AND i.isletme_id = p_isletme_id
    AND i.source_ileri_id = p_ileri_id
  FOR SHARE;

  IF NOT FOUND
     OR v_existing.type::text IS DISTINCT FROM v_scheduled.type::text
     OR v_existing.amount::numeric(15,2) IS DISTINCT FROM v_amount
     OR v_existing.description IS DISTINCT FROM v_scheduled.description
     OR v_existing.hesap_id IS DISTINCT FROM v_scheduled.hesap_id
     OR v_existing.hedef_hesap_id IS DISTINCT FROM v_scheduled.hedef_hesap_id
     OR v_existing.kategori_id IS DISTINCT FROM v_scheduled.kategori_id
     OR v_existing.cari_id IS DISTINCT FROM v_scheduled.cari_id
     OR v_existing.personel_id IS DISTINCT FROM v_scheduled.personel_id
     OR v_existing.source_currency::text IS DISTINCT FROM v_source_currency
     OR v_existing.target_currency::text IS DISTINCT FROM v_target_currency
     OR v_existing.photo_path IS NOT NULL
     OR v_existing.date_end IS NOT NULL
     OR v_existing.vade_tarihi IS NOT NULL
     OR v_existing.hedef_islem_id IS NOT NULL
     OR (
       v_is_cross
       AND (
         v_existing.exchange_rate IS NULL
         OR v_existing.exchange_rate = 'NaN'::numeric
         OR v_existing.exchange_rate = 'Infinity'::numeric
         OR v_existing.exchange_rate = '-Infinity'::numeric
         OR v_existing.exchange_rate <= 0
         OR v_existing.exchange_rate
           IS DISTINCT FROM v_existing.exchange_rate::numeric(18,8)
         OR v_existing.exchange_rate::numeric(18,8) IS DISTINCT FROM v_rate
       )
     )
     OR (
       NOT v_is_cross
       AND v_existing.exchange_rate IS NOT NULL
     ) THEN
    RAISE EXCEPTION 'SCHEDULED_SOURCE_CONFLICT'
      USING ERRCODE = '23505';
  END IF;

  v_result := pg_catalog.to_jsonb(v_existing);

  IF v_has_existing THEN
    RETURN v_result;
  END IF;

  -- KEY SHARE ile ilk okuma balance UPDATE'leriyle deadlock üretmez. Nested motor
  -- yazdıktan sonra güncel scope/currency'yi NO KEY UPDATE ile yeniden doğrula ve
  -- commit'e kadar dondur. Arada entity düzenlendiyse aşağıdaki exception bu RPC'nin
  -- insert+bakiye+tahsis etkilerinin tamamını rollback eder.
  IF v_scheduled.hesap_id IS NOT NULL THEN
    PERFORM 1
    FROM public.hesaplar h
    WHERE h.id = v_scheduled.hesap_id
      AND h.isletme_id = p_isletme_id
      AND COALESCE(
        NULLIF(pg_catalog.upper(pg_catalog.btrim(h.currency::text)), ''),
        'TRY'
      ) = v_hesap_currency
    FOR NO KEY UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'SCHEDULED_COMPLETION_CHANGED'
        USING ERRCODE = '55000';
    END IF;
  END IF;

  IF v_scheduled.hedef_hesap_id IS NOT NULL THEN
    PERFORM 1
    FROM public.hesaplar h
    WHERE h.id = v_scheduled.hedef_hesap_id
      AND h.isletme_id = p_isletme_id
      AND COALESCE(
        NULLIF(pg_catalog.upper(pg_catalog.btrim(h.currency::text)), ''),
        'TRY'
      ) = v_hedef_currency
    FOR NO KEY UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'SCHEDULED_COMPLETION_CHANGED'
        USING ERRCODE = '55000';
    END IF;
  END IF;

  IF v_scheduled.cari_id IS NOT NULL THEN
    PERFORM 1
    FROM public.cariler c
    WHERE c.id = v_scheduled.cari_id
      AND c.isletme_id = p_isletme_id
      AND COALESCE(
        NULLIF(pg_catalog.upper(pg_catalog.btrim(c.currency::text)), ''),
        'TRY'
      ) = v_cari_currency
    FOR NO KEY UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'SCHEDULED_COMPLETION_CHANGED'
        USING ERRCODE = '55000';
    END IF;
  END IF;

  IF v_scheduled.personel_id IS NOT NULL THEN
    PERFORM 1
    FROM public.personel p
    WHERE p.id = v_scheduled.personel_id
      AND p.isletme_id = p_isletme_id
      AND COALESCE(
        NULLIF(pg_catalog.upper(pg_catalog.btrim(p.currency::text)), ''),
        'TRY'
      ) = v_personel_currency
    FOR NO KEY UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'SCHEDULED_COMPLETION_CHANGED'
        USING ERRCODE = '55000';
    END IF;
  END IF;

  IF v_scheduled.kategori_id IS NOT NULL THEN
    PERFORM 1
    FROM public.kategoriler k
    WHERE k.id = v_scheduled.kategori_id
      AND k.isletme_id = p_isletme_id
    FOR NO KEY UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'SCHEDULED_COMPLETION_CHANGED'
        USING ERRCODE = '55000';
    END IF;
  END IF;

  UPDATE public.ileri_tarihli_islemler
  SET status = 'completed',
      updated_at = pg_catalog.now()
  WHERE id = p_ileri_id
    AND isletme_id = p_isletme_id
    AND status IN ('pending', 'notified');

  GET DIAGNOSTICS v_rowcount = ROW_COUNT;
  IF v_rowcount <> 1 THEN
    RAISE EXCEPTION 'SCHEDULED_STATUS_CONFLICT'
      USING ERRCODE = '55000';
  END IF;

  RETURN v_result;
END;
$function$;

REVOKE ALL
ON FUNCTION public.complete_ileri_tarihli_islem_atomik(uuid, uuid, numeric, text, timestamp without time zone)
FROM PUBLIC;
REVOKE EXECUTE
ON FUNCTION public.complete_ileri_tarihli_islem_atomik(uuid, uuid, numeric, text, timestamp without time zone)
FROM anon;
GRANT EXECUTE
ON FUNCTION public.complete_ileri_tarihli_islem_atomik(uuid, uuid, numeric, text, timestamp without time zone)
TO authenticated;

-- Nested motorun imzası/gövdesi değişmez. public şeması canlıda PUBLIC/anon/
-- authenticated için CREATE'e kapalı olsa da pg_temp'in implicit öne geçmesini
-- engellemek için güvenilir şemaları açık sıraya koy.
ALTER FUNCTION public.create_islem_atomik(uuid, jsonb, jsonb)
  SET search_path TO 'pg_catalog', 'public', 'pg_temp';


-- =============================================================================
-- Eski istemci rollback koruması
-- =============================================================================
-- Eski binary önce status='completed' claim eder. Yeni RPC aynı kaynağı bitirdiyse,
-- eski binary'nin unique hatasından sonra status'u pending/notified'a geri çekmesine
-- izin verilmez. Yalnız status alanı korunur: hesap/cari/personel/kategori ve kullanıcı
-- FK'lerinin ON DELETE SET NULL güncellemelerini engelleyip ana silmeyi bozmamak gerekir.
-- Finansal yazım güvenliği RPC'nin kilitli server snapshot'ı ve kaynak işlemdeki exact
-- sözleşmeyle sağlanır. Trigger kullanıcı satırı veya finansal kayıt silmez.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.guard_completed_ileri_tarihli_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF EXISTS (
       SELECT 1
       FROM public.islemler i
       WHERE i.source_ileri_id = OLD.id
     )
     AND NEW.status IS DISTINCT FROM 'completed' THEN
    RAISE EXCEPTION 'SCHEDULED_ALREADY_COMPLETED'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL
ON FUNCTION public.guard_completed_ileri_tarihli_status()
FROM PUBLIC, anon, authenticated;

CREATE TRIGGER guard_completed_ileri_tarihli_status
BEFORE UPDATE OF status
ON public.ileri_tarihli_islemler
FOR EACH ROW
EXECUTE FUNCTION public.guard_completed_ileri_tarihli_status();
