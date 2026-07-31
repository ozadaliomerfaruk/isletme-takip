-- =============================================================================
-- CANLI GÖVDE SNAPSHOT — ÇALIŞTIRILMAZ, REFERANSTIR
--
-- Kaynak : pg_get_functiondef(), proje ulohxpkhesxozwnlnonb (defter-app)
-- Tarih  : 2026-07-26
-- md5    : d276147891f458fd7cc74cc632e1b43c
-- uzunluk: 5083 karakter
-- imza   : p_transaction_ids uuid[]   → RETURNS json
-- config : SECURITY DEFINER, search_path=public
-- EXECUTE: anon, authenticated, public, service_role   ← anon+public AÇIK (P0)
--
-- KULLANIM: migration hazırlanırken gövde BURADAN alınır (repo dosyasından DEĞİL).
-- Uygulama anında md5 yeniden hesaplanıp yukarıdakiyle KARŞILAŞTIRILIR; farklıysa
-- canlı arada değişmiş demektir → durulur, migration yeniden türetilir.
--
-- Doğrulama sorgusu:
--   SELECT md5(pg_get_functiondef(p.oid))
--   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--   WHERE n.nspname='public' AND p.proname='undo_import_batch';
--
-- GERİ ALMA: acil durumda bu dosyanın gövdesi olduğu gibi çalıştırılırsa fonksiyon
-- 26 Tem 2026 hâline döner — AMA O HÂL SAVUNMASIZDIR. Geri alma için bunu değil,
-- docs/security/taslak/undo_import_batch-FALLBACK.sql dosyasını kullan (minimum
-- owner guard + REVOKE korunur).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.undo_import_batch(p_transaction_ids uuid[])
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  deleted_count INT;
BEGIN
  -- 1. Hesap bakiyelerini geri al (aggregate + tek UPDATE)
  -- Kaynak hesap her zaman raw `amount` kullanır
  UPDATE hesaplar h
  SET balance = h.balance + agg.delta, updated_at = NOW()
  FROM (
    SELECT entity_id, SUM(delta) as delta FROM (
      -- Kaynak hesap bakiyesini geri al
      SELECT hesap_id as entity_id,
        CASE
          WHEN type IN ('gelir', 'cari_tahsilat', 'personel_tahsilat') THEN -amount
          WHEN type IN ('gider', 'cari_odeme', 'personel_odeme') THEN amount
          WHEN type = 'transfer' THEN amount
          ELSE 0
        END as delta
      FROM islemler WHERE id = ANY(p_transaction_ids) AND hesap_id IS NOT NULL
      UNION ALL
      -- Hedef hesap (transfer) bakiyesini geri al - CROSS-CURRENCY AWARE
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
      FROM islemler WHERE id = ANY(p_transaction_ids) AND type = 'transfer' AND hedef_hesap_id IS NOT NULL
    ) sub GROUP BY entity_id
  ) agg WHERE h.id = agg.entity_id;

  -- 2. Cari bakiyelerini geri al - CROSS-CURRENCY AWARE
  UPDATE cariler c
  SET balance = c.balance + agg.delta, updated_at = NOW()
  FROM (
    SELECT cari_id as entity_id, SUM(
      CASE
        -- cari_alis/cari_satis: cross-currency yok, raw amount
        WHEN type IN ('cari_satis', 'cari_alis_iade') THEN -amount
        WHEN type IN ('cari_alis', 'cari_satis_iade') THEN amount
        -- cari_odeme: cross-currency olabilir
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
        -- cari_tahsilat: cross-currency olabilir
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
    FROM islemler WHERE id = ANY(p_transaction_ids) AND cari_id IS NOT NULL
    GROUP BY cari_id
  ) agg WHERE c.id = agg.entity_id;

  -- 3. Personel bakiyelerini geri al - CROSS-CURRENCY AWARE
  UPDATE personel p
  SET balance = p.balance + agg.delta, updated_at = NOW()
  FROM (
    SELECT personel_id as entity_id, SUM(
      CASE
        -- personel_gider: cross-currency yok, raw amount
        WHEN type = 'personel_gider' THEN amount
        -- personel_satis: raw amount
        WHEN type = 'personel_satis' THEN -amount
        -- personel_odeme: cross-currency olabilir
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
        -- personel_tahsilat: cross-currency olabilir
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
    FROM islemler WHERE id = ANY(p_transaction_ids) AND personel_id IS NOT NULL
    GROUP BY personel_id
  ) agg WHERE p.id = agg.entity_id;

  -- 4. Islemleri sil
  DELETE FROM islemler WHERE id = ANY(p_transaction_ids);
  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  RETURN json_build_object('deleted_transactions', deleted_count);
END;
$function$
