-- =============================================================================
-- ACIL ILERI-DUZELTME (FAIL-CLOSED FALLBACK) - undo_import_batch
--
-- Bu dosya eski, savunmasiz fonksiyona geri DONMEZ. Kanonik migration'in tum
-- guvenlik sozlesmesini korur; yalnizca meşru owner importu 50.000 satir
-- tavanina takilirsa tavani 100.000'e yukseltir.
--
-- KORUNAN GUVENLIK SOZLESMESI:
--   * yalniz isletme sahibi (owner)
--   * UUID var/yok bilgisini sizdirmayan ayni generic 42501
--   * owner satirinda FOR UPDATE; ardindan deterministik islem kilidi
--   * NULL/bos/yinelenen UUID reddi
--   * istenen UUID'lerin TAMAMI ayni tenant'ta bulunmadan hicbir yazma yok
--   * butun okuma/yazmalar tenant kapsamli
--   * SECURITY DEFINER + bos search_path + owner postgres
--   * EXECUTE yalniz postgres ve authenticated; PUBLIC/anon/service_role kapali
--
-- KULLANIM ONCESI ZORUNLU ADIMLAR:
--   1. Bu dosya YALNIZ kanonik migration canlida uygulandiktan sonra kullanilir.
--   2. Asagidaki beklenen md5, 29 Temmuz canli post-smoke'ta alindi:
--
--        SELECT pg_catalog.md5(pg_catalog.pg_get_functiondef(
--          pg_catalog.to_regprocedure('public.undo_import_batch(uuid[])')
--        ));
--
--      beklenen = 09d0aa42428d8fef0c9966dfb1f8a217
--   3. Katalog guard'i hash/owner/imza/ACL/security ayarlarindan biri farkliysa
--      fonksiyonun ustune yazmadan DURUR.
--   4. Uygulamadan sonra bu acil mudahaleyi yeni, ileri yonlu bir migration'a
--      kaydet. Bu dosyayi kalici bir "rollback" olarak kullanma.
--
-- Bu dosya islem satirlarini kendi basina silmez. Fonksiyon cagrildiginda,
-- kanonik davranis geregi, yalniz owner'in eksiksiz ve ayni tenant'a ait UUID
-- listesi geri alinir.
-- =============================================================================

BEGIN;

DO $fallback_guard$
DECLARE
  v_expected_hash CONSTANT text := '09d0aa42428d8fef0c9966dfb1f8a217';
  v_live_hash text;
  v_live_owner text;
  v_live_result text;
  v_live_acl text;
  v_live_security_definer boolean;
  v_live_volatility "char";
  v_live_config text[];
BEGIN
  -- Hatali/eksik hash ile ASLA sessizce overwrite etme.
  IF v_expected_hash !~ '^[0-9a-f]{32}$' THEN
    RAISE EXCEPTION
      'undo_import_batch fallback: beklenen kanonik md5 gecersiz'
      USING ERRCODE = '55000';
  END IF;

  SELECT
    pg_catalog.md5(pg_catalog.pg_get_functiondef(p.oid)),
    pg_catalog.pg_get_userbyid(p.proowner),
    pg_catalog.pg_get_function_result(p.oid),
    p.proacl::text,
    p.prosecdef,
    p.provolatile,
    p.proconfig
    INTO
      v_live_hash,
      v_live_owner,
      v_live_result,
      v_live_acl,
      v_live_security_definer,
      v_live_volatility,
      v_live_config
    FROM pg_catalog.pg_proc AS p
   WHERE p.oid = pg_catalog.to_regprocedure(
     'public.undo_import_batch(uuid[])'
   );

  IF v_live_hash IS DISTINCT FROM v_expected_hash
     OR v_live_owner IS DISTINCT FROM 'postgres'
     OR v_live_result IS DISTINCT FROM 'json'
     OR v_live_acl IS DISTINCT FROM
       '{postgres=X/postgres,authenticated=X/postgres}'
     OR v_live_security_definer IS DISTINCT FROM true
     OR v_live_volatility IS DISTINCT FROM 'v'
     OR v_live_config IS DISTINCT FROM ARRAY['search_path=""']::text[] THEN
    RAISE EXCEPTION
      'undo_import_batch fallback: beklenmeyen canli katalog durumu (beklenen hash %, bulunan %)',
      v_expected_hash,
      COALESCE(v_live_hash, '<fonksiyon yok>')
      USING ERRCODE = '55000';
  END IF;
END;
$fallback_guard$;

CREATE OR REPLACE FUNCTION public.undo_import_batch(p_transaction_ids uuid[])
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  deleted_count   INT;
  v_isletme_id    uuid;
  v_input_count   INT;
  v_distinct_in   INT;
  v_locked_count  INT;
  -- Kanonik 50.000 tavanindan fallback'in tek bilincli farki.
  c_max_batch CONSTANT INT := 100000;
BEGIN
  -- Butun guard'lar ilk yazmadan once calisir.
  IF p_transaction_ids IS NULL OR cardinality(p_transaction_ids) = 0 THEN
    RAISE EXCEPTION 'undo_import_batch: islem listesi bos'
      USING ERRCODE = '22023';
  END IF;

  v_input_count := cardinality(p_transaction_ids);

  IF v_input_count > c_max_batch THEN
    RAISE EXCEPTION 'undo_import_batch: cok fazla islem (% adet, tavan %)',
      v_input_count, c_max_batch USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM unnest(p_transaction_ids) AS x WHERE x IS NULL
  ) THEN
    RAISE EXCEPTION 'undo_import_batch: listede NULL kimlik var'
      USING ERRCODE = '22023';
  END IF;

  SELECT count(DISTINCT x)
    INTO v_distinct_in
    FROM unnest(p_transaction_ids) AS x;

  IF v_distinct_in <> v_input_count THEN
    RAISE EXCEPTION 'undo_import_batch: listede yinelenen kimlik var'
      USING ERRCODE = '22023';
  END IF;

  -- Ilk UUID yoksa ve varsa fakat cagiran owner degilse ayni generic hata.
  SELECT i.isletme_id
    INTO v_isletme_id
    FROM public.islemler AS i
   WHERE i.id = p_transaction_ids[1];

  IF v_isletme_id IS NULL THEN
    RAISE EXCEPTION 'undo_import_batch: bu islem icin yetkiniz yok'
      USING ERRCODE = '42501';
  END IF;

  -- Owner kontrolu ile yazma arasinda sahiplik transferini engelle.
  PERFORM isletme.id
    FROM public.isletmeler AS isletme
   WHERE isletme.id = v_isletme_id
     AND isletme.user_id = auth.uid()
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'undo_import_batch: bu islem icin yetkiniz yok'
      USING ERRCODE = '42501';
  END IF;

  -- Hedef satirlari sabit UUID sirasi ile kilitle; eksik/cross-tenant listede
  -- bulunanlari kismen isleme alma.
  PERFORM i.id
    FROM public.islemler AS i
   WHERE i.id = ANY(p_transaction_ids)
     AND i.isletme_id = v_isletme_id
   ORDER BY i.id
   FOR UPDATE;
  GET DIAGNOSTICS v_locked_count = ROW_COUNT;

  IF v_locked_count <> v_input_count THEN
    RAISE EXCEPTION
      'undo_import_batch: islem listesi gecersiz veya farkli isletmeye ait (istenen %, kilitlenen %)',
      v_input_count, v_locked_count USING ERRCODE = '22023';
  END IF;

  -- Bakiye matematigi kanonik fonksiyonla birebir aynidir.
  UPDATE public.hesaplar h
  SET balance = h.balance + agg.delta, updated_at = NOW()
  FROM (
    SELECT entity_id, SUM(delta) as delta FROM (
      SELECT hesap_id as entity_id,
        CASE
          WHEN type IN ('gelir', 'cari_tahsilat', 'personel_tahsilat') THEN -amount
          WHEN type IN ('gider', 'cari_odeme', 'personel_odeme') THEN amount
          WHEN type = 'transfer' THEN amount
          ELSE 0
        END as delta
      FROM public.islemler
      WHERE id = ANY(p_transaction_ids)
        AND isletme_id = v_isletme_id
        AND hesap_id IS NOT NULL
      UNION ALL
      SELECT hedef_hesap_id as entity_id,
        -(CASE
          WHEN source_currency IS NOT NULL AND target_currency IS NOT NULL
               AND source_currency <> target_currency
               AND exchange_rate IS NOT NULL AND exchange_rate > 0 THEN
            CASE
              WHEN source_currency = 'TRY' THEN amount / exchange_rate
              ELSE amount * exchange_rate
            END
          ELSE amount
        END) as delta
      FROM public.islemler
      WHERE id = ANY(p_transaction_ids)
        AND isletme_id = v_isletme_id
        AND type = 'transfer'
        AND hedef_hesap_id IS NOT NULL
    ) sub GROUP BY entity_id
  ) agg
  WHERE h.id = agg.entity_id
    AND h.isletme_id = v_isletme_id;

  UPDATE public.cariler c
  SET balance = c.balance + agg.delta, updated_at = NOW()
  FROM (
    SELECT cari_id as entity_id, SUM(
      CASE
        WHEN type IN ('cari_satis', 'cari_alis_iade') THEN -amount
        WHEN type IN ('cari_alis', 'cari_satis_iade') THEN amount
        WHEN type = 'cari_odeme' THEN
          -(CASE
            WHEN source_currency IS NOT NULL AND target_currency IS NOT NULL
                 AND source_currency <> target_currency
                 AND exchange_rate IS NOT NULL AND exchange_rate > 0 THEN
              CASE
                WHEN source_currency = 'TRY' THEN amount / exchange_rate
                ELSE amount * exchange_rate
              END
            ELSE amount
          END)
        WHEN type = 'cari_tahsilat' THEN
          (CASE
            WHEN source_currency IS NOT NULL AND target_currency IS NOT NULL
                 AND source_currency <> target_currency
                 AND exchange_rate IS NOT NULL AND exchange_rate > 0 THEN
              CASE
                WHEN source_currency = 'TRY' THEN amount / exchange_rate
                ELSE amount * exchange_rate
              END
            ELSE amount
          END)
        ELSE 0
      END
    ) as delta
    FROM public.islemler
    WHERE id = ANY(p_transaction_ids)
      AND isletme_id = v_isletme_id
      AND cari_id IS NOT NULL
    GROUP BY cari_id
  ) agg
  WHERE c.id = agg.entity_id
    AND c.isletme_id = v_isletme_id;

  UPDATE public.personel p
  SET balance = p.balance + agg.delta, updated_at = NOW()
  FROM (
    SELECT personel_id as entity_id, SUM(
      CASE
        WHEN type = 'personel_gider' THEN amount
        WHEN type = 'personel_satis' THEN -amount
        WHEN type = 'personel_odeme' THEN
          -(CASE
            WHEN source_currency IS NOT NULL AND target_currency IS NOT NULL
                 AND source_currency <> target_currency
                 AND exchange_rate IS NOT NULL AND exchange_rate > 0 THEN
              CASE
                WHEN source_currency = 'TRY' THEN amount / exchange_rate
                ELSE amount * exchange_rate
              END
            ELSE amount
          END)
        WHEN type = 'personel_tahsilat' THEN
          (CASE
            WHEN source_currency IS NOT NULL AND target_currency IS NOT NULL
                 AND source_currency <> target_currency
                 AND exchange_rate IS NOT NULL AND exchange_rate > 0 THEN
              CASE
                WHEN source_currency = 'TRY' THEN amount / exchange_rate
                ELSE amount * exchange_rate
              END
            ELSE amount
          END)
        ELSE 0
      END
    ) as delta
    FROM public.islemler
    WHERE id = ANY(p_transaction_ids)
      AND isletme_id = v_isletme_id
      AND personel_id IS NOT NULL
    GROUP BY personel_id
  ) agg
  WHERE p.id = agg.entity_id
    AND p.isletme_id = v_isletme_id;

  DELETE FROM public.islemler
   WHERE id = ANY(p_transaction_ids)
     AND isletme_id = v_isletme_id;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  RETURN json_build_object('deleted_transactions', deleted_count);
END;
$function$;

ALTER FUNCTION public.undo_import_batch(uuid[]) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.undo_import_batch(uuid[])
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.undo_import_batch(uuid[]) TO authenticated;

-- Atomic postcondition: ACL/security ayari beklenenden farkliysa COMMIT etme.
DO $post_guard$
DECLARE
  v_owner text;
  v_result text;
  v_acl text;
  v_security_definer boolean;
  v_volatility "char";
  v_config text[];
BEGIN
  SELECT
    pg_catalog.pg_get_userbyid(p.proowner),
    pg_catalog.pg_get_function_result(p.oid),
    p.proacl::text,
    p.prosecdef,
    p.provolatile,
    p.proconfig
    INTO
      v_owner,
      v_result,
      v_acl,
      v_security_definer,
      v_volatility,
      v_config
    FROM pg_catalog.pg_proc AS p
   WHERE p.oid = pg_catalog.to_regprocedure(
     'public.undo_import_batch(uuid[])'
   );

  IF v_owner IS DISTINCT FROM 'postgres'
     OR v_result IS DISTINCT FROM 'json'
     OR v_acl IS DISTINCT FROM
       '{postgres=X/postgres,authenticated=X/postgres}'
     OR v_security_definer IS DISTINCT FROM true
     OR v_volatility IS DISTINCT FROM 'v'
     OR v_config IS DISTINCT FROM ARRAY['search_path=""']::text[] THEN
    RAISE EXCEPTION
      'undo_import_batch fallback: uygulama sonrasi katalog dogrulamasi basarisiz'
      USING ERRCODE = '55000';
  END IF;
END;
$post_guard$;

COMMIT;

-- ESKI CLIENT (1.5.x) ETKISI:
--   * imza/donus/bakiye matematigi degismez.
--   * owner'in <= 50.000 satirlik geri almasi kanonik surumle aynidir.
--   * 50.001-100.000 satirlik meşru owner geri almasi artik calisir.
--   * owner olmayan, anon, eksik/cross-tenant/yinelenen liste yine reddedilir.
--   * Bu script calistirildigi anda hicbir kullanici satirini degistirmez; yalniz
--     fonksiyon tanimi ve EXECUTE ACL'i atomik olarak guncellenir.
