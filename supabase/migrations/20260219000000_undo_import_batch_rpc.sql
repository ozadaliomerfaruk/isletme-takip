-- =============================================================================
-- RPC: undo_import_batch - Toplu import geri alma (performans optimizasyonu)
-- =============================================================================
-- Mevcut undoLastImport() her islem icin ayri RPC yapiyordu (~7000+ network istegi).
-- Bu fonksiyon tum bakiye geri alma + silme islemini sunucu tarafinda
-- tek bir atomik transaction icinde yapar (1 network istegi).
-- =============================================================================

CREATE OR REPLACE FUNCTION undo_import_batch(p_transaction_ids UUID[])
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count INT;
BEGIN
  -- 1. Hesap bakiyelerini geri al (aggregate + tek UPDATE)
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
      -- Hedef hesap (transfer) bakiyesini geri al
      SELECT hedef_hesap_id as entity_id, -amount as delta
      FROM islemler WHERE id = ANY(p_transaction_ids) AND type = 'transfer' AND hedef_hesap_id IS NOT NULL
    ) sub GROUP BY entity_id
  ) agg WHERE h.id = agg.entity_id;

  -- 2. Cari bakiyelerini geri al
  UPDATE cariler c
  SET balance = c.balance + agg.delta, updated_at = NOW()
  FROM (
    SELECT cari_id as entity_id, SUM(
      CASE
        WHEN type IN ('cari_satis', 'cari_odeme', 'cari_alis_iade') THEN -amount
        WHEN type IN ('cari_alis', 'cari_tahsilat', 'cari_satis_iade') THEN amount
        ELSE 0
      END
    ) as delta
    FROM islemler WHERE id = ANY(p_transaction_ids) AND cari_id IS NOT NULL
    GROUP BY cari_id
  ) agg WHERE c.id = agg.entity_id;

  -- 3. Personel bakiyelerini geri al
  UPDATE personel p
  SET balance = p.balance + agg.delta, updated_at = NOW()
  FROM (
    SELECT personel_id as entity_id, SUM(
      CASE
        WHEN type IN ('personel_odeme', 'personel_satis') THEN -amount
        WHEN type IN ('personel_gider', 'personel_tahsilat') THEN amount
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
$$;
