-- =============================================================================
-- ACİL GERİ ALMA (FALLBACK) — undo_import_batch
--
-- NE ZAMAN: 20260726120000 uygulandıktan sonra MEŞRU sahibin geri alma akışı
-- bozulursa (ör. eklenen doğrulamalardan biri beklenmedik bir veri şeklinde
-- yanlış tetikleniyorsa) ve kök neden hemen bulunamıyorsa.
--
-- ⚠️ BU DOSYA 26 TEM ÖNCESİ SAVUNMASIZ HÂLE DÖNMEZ. Bilinçli olarak:
--    • owner kontrolü KORUNUR
--    • tenant kapsamı KORUNUR
--    • REVOKE (anon/PUBLIC) KORUNUR
-- Yalnızca "aşırı katı olabilecek" doğrulamalar gevşetilir:
--    • yinelenen kimlik reddi        → kaldırıldı (sessizce tekilleştirilir)
--    • "hepsi bulunmalı" şartı       → kaldırıldı (bulunanlar işlenir)
--    • maksimum batch tavanı         → kaldırıldı
--    • FOR UPDATE kilidi             → korunur (ucuz, yan etkisiz)
--
-- Yani fallback, güvenlik açığını yeniden açmadan işlevi geri getirir.
-- Kök neden bulunduktan sonra tam sürüme dönülür.
--
-- KULLANIM: bu dosyayı olduğu gibi çalıştır. Ayrı migration dosyası olarak
-- kaydetmek gerekmez; acil müdahaledir, sonrasında düzeltilmiş bir migration
-- ileri yönlü olarak yazılır.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.undo_import_batch(p_transaction_ids uuid[])
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  deleted_count INT;
  v_isletme_id  uuid;
  v_tenant_cnt  INT;
BEGIN
  -- Minimum guard seti — bunlar ASLA kaldırılmaz.
  IF p_transaction_ids IS NULL OR cardinality(p_transaction_ids) = 0 THEN
    RAISE EXCEPTION 'undo_import_batch: islem listesi bos' USING ERRCODE = '22023';
  END IF;

  SELECT count(DISTINCT i.isletme_id) INTO v_tenant_cnt
    FROM islemler i WHERE i.id = ANY(p_transaction_ids);

  IF v_tenant_cnt <> 1 THEN
    RAISE EXCEPTION 'undo_import_batch: islemler tek isletmeye ait olmali'
      USING ERRCODE = '42501';
  END IF;

  SELECT i.isletme_id INTO v_isletme_id
    FROM islemler i WHERE i.id = ANY(p_transaction_ids) LIMIT 1;

  IF NOT EXISTS (SELECT 1 FROM isletmeler WHERE id = v_isletme_id AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'undo_import_batch: bu islemi yalnizca isletme sahibi yapabilir'
      USING ERRCODE = '42501';
  END IF;

  PERFORM 1 FROM islemler
   WHERE id = ANY(p_transaction_ids) AND isletme_id = v_isletme_id FOR UPDATE;

  -- Bakiye geri alma — tam sürümle AYNI, tenant kapsamlı.
  UPDATE hesaplar h
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
      FROM islemler
      WHERE id = ANY(p_transaction_ids) AND isletme_id = v_isletme_id AND hesap_id IS NOT NULL
      UNION ALL
      SELECT hedef_hesap_id as entity_id,
        -(CASE
          WHEN source_currency IS NOT NULL AND target_currency IS NOT NULL
               AND source_currency <> target_currency
               AND exchange_rate IS NOT NULL AND exchange_rate > 0 THEN
            CASE WHEN source_currency = 'TRY' THEN amount / exchange_rate
                 ELSE amount * exchange_rate END
          ELSE amount
        END) as delta
      FROM islemler
      WHERE id = ANY(p_transaction_ids) AND isletme_id = v_isletme_id
        AND type = 'transfer' AND hedef_hesap_id IS NOT NULL
    ) sub GROUP BY entity_id
  ) agg WHERE h.id = agg.entity_id AND h.isletme_id = v_isletme_id;

  UPDATE cariler c
  SET balance = c.balance + agg.delta, updated_at = NOW()
  FROM (
    SELECT cari_id as entity_id, SUM(
      CASE
        WHEN type IN ('cari_satis', 'cari_alis_iade') THEN -amount
        WHEN type IN ('cari_alis', 'cari_satis_iade') THEN amount
        WHEN type = 'cari_odeme' THEN
          -(CASE WHEN source_currency IS NOT NULL AND target_currency IS NOT NULL
                      AND source_currency <> target_currency
                      AND exchange_rate IS NOT NULL AND exchange_rate > 0
                 THEN CASE WHEN source_currency = 'TRY' THEN amount / exchange_rate
                           ELSE amount * exchange_rate END
                 ELSE amount END)
        WHEN type = 'cari_tahsilat' THEN
          (CASE WHEN source_currency IS NOT NULL AND target_currency IS NOT NULL
                     AND source_currency <> target_currency
                     AND exchange_rate IS NOT NULL AND exchange_rate > 0
                THEN CASE WHEN source_currency = 'TRY' THEN amount / exchange_rate
                          ELSE amount * exchange_rate END
                ELSE amount END)
        ELSE 0
      END
    ) as delta
    FROM islemler
    WHERE id = ANY(p_transaction_ids) AND isletme_id = v_isletme_id AND cari_id IS NOT NULL
    GROUP BY cari_id
  ) agg WHERE c.id = agg.entity_id AND c.isletme_id = v_isletme_id;

  UPDATE personel p
  SET balance = p.balance + agg.delta, updated_at = NOW()
  FROM (
    SELECT personel_id as entity_id, SUM(
      CASE
        WHEN type = 'personel_gider' THEN amount
        WHEN type = 'personel_satis' THEN -amount
        WHEN type = 'personel_odeme' THEN
          -(CASE WHEN source_currency IS NOT NULL AND target_currency IS NOT NULL
                      AND source_currency <> target_currency
                      AND exchange_rate IS NOT NULL AND exchange_rate > 0
                 THEN CASE WHEN source_currency = 'TRY' THEN amount / exchange_rate
                           ELSE amount * exchange_rate END
                 ELSE amount END)
        WHEN type = 'personel_tahsilat' THEN
          (CASE WHEN source_currency IS NOT NULL AND target_currency IS NOT NULL
                     AND source_currency <> target_currency
                     AND exchange_rate IS NOT NULL AND exchange_rate > 0
                THEN CASE WHEN source_currency = 'TRY' THEN amount / exchange_rate
                          ELSE amount * exchange_rate END
                ELSE amount END)
        ELSE 0
      END
    ) as delta
    FROM islemler
    WHERE id = ANY(p_transaction_ids) AND isletme_id = v_isletme_id AND personel_id IS NOT NULL
    GROUP BY personel_id
  ) agg WHERE p.id = agg.entity_id AND p.isletme_id = v_isletme_id;

  DELETE FROM islemler
   WHERE id = ANY(p_transaction_ids) AND isletme_id = v_isletme_id;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  RETURN json_build_object('deleted_transactions', deleted_count);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.undo_import_batch(uuid[]) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.undo_import_batch(uuid[]) TO authenticated;
