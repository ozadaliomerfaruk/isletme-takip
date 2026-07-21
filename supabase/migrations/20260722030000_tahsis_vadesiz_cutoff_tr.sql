-- Düzeltme: 20260722020000'deki vadesiz-borç go-live sınırı UTC gece yarısıydı;
-- TR saatiyle 20 Tem 00:00–03:00 arasında girilen vadesiz işlemler (UTC'de hâlâ
-- 19 Tem) kuyruğun dışında kalıyordu. Sınır TR gece yarısına alındı (+03).
-- Ödeme tarafındaki avans-süpürme cutoff'una DOKUNULMADI (defter üyeliği aynı).
CREATE OR REPLACE FUNCTION public.fifo_tahsis_dagit(
  p_isletme_id uuid, p_cari_id uuid, p_odeme_islem_id uuid, p_odeme_type text,
  p_tutar numeric, p_hedef_borc uuid DEFAULT NULL::uuid,
  p_exclude_borc uuid DEFAULT NULL::uuid, p_hedef_taksit uuid DEFAULT NULL::uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_borc_tipleri text[];
  v_kalan_odeme numeric := round(COALESCE(p_tutar, 0), 2);
  v_borc record;
  v_borc_kalan numeric;
  v_pay numeric;
BEGIN
  v_borc_tipleri := public.tahsis_borc_tipleri(p_odeme_type);
  IF v_kalan_odeme <= 0 OR p_cari_id IS NULL OR v_borc_tipleri IS NULL THEN
    RETURN GREATEST(v_kalan_odeme, 0);
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_cari_id::text, 42));

  FOR v_borc IN
    SELECT i.id AS islem_id, tk.id AS taksit_id,
           round(COALESCE(tk.tutar, i.amount), 2) AS birim_tutar
    FROM islemler i
    LEFT JOIN taksitler tk ON tk.islem_id = i.id AND tk.isletme_id = i.isletme_id
    WHERE i.isletme_id = p_isletme_id
      AND i.cari_id = p_cari_id
      AND i.type = ANY (v_borc_tipleri)
      -- Vadeli/taksitli her zaman; VADESİZ yalnız go-live sonrası (TR gece yarısı)
      AND (tk.id IS NOT NULL
           OR i.vade_tarihi IS NOT NULL
           OR i.created_at >= TIMESTAMPTZ '2026-07-20 00:00:00+03')
      AND i.id <> p_odeme_islem_id
      AND (p_exclude_borc IS NULL OR i.id <> p_exclude_borc)
    ORDER BY
      (i.id = p_hedef_borc AND (p_hedef_taksit IS NULL OR tk.id = p_hedef_taksit)) DESC,
      COALESCE(tk.vade_tarihi, i.vade_tarihi, i.date::date) ASC,
      i.created_at ASC, i.id ASC, tk.sira ASC NULLS FIRST
  LOOP
    EXIT WHEN v_kalan_odeme <= 0;

    SELECT round(v_borc.birim_tutar - COALESCE(SUM(t.tutar), 0), 2) INTO v_borc_kalan
    FROM islem_tahsis t
    WHERE t.borc_islem_id = v_borc.islem_id
      AND t.taksit_id IS NOT DISTINCT FROM v_borc.taksit_id;

    CONTINUE WHEN v_borc_kalan <= 0;

    v_pay := LEAST(v_kalan_odeme, v_borc_kalan);
    INSERT INTO islem_tahsis (isletme_id, cari_id, borc_islem_id, odeme_islem_id, taksit_id, tutar)
    VALUES (p_isletme_id, p_cari_id, v_borc.islem_id, p_odeme_islem_id, v_borc.taksit_id, v_pay);

    v_kalan_odeme := round(v_kalan_odeme - v_pay, 2);
  END LOOP;

  RETURN v_kalan_odeme;
END;
$function$;

-- Replay tekrar: yeni sınırla kanonik dağılım (balance'a dokunulmaz)
DO $$
DECLARE
  v_o record;
BEGIN
  CREATE TEMP TABLE _tahsis_replay2 ON COMMIT DROP AS
  SELECT i.id, i.isletme_id, i.date, i.created_at
  FROM islemler i
  WHERE i.cari_id IS NOT NULL
    AND public.tahsis_borc_tipleri(i.type) IS NOT NULL
    AND (i.created_at >= TIMESTAMPTZ '2026-07-20 00:00:00+00'
         OR EXISTS (SELECT 1 FROM islem_tahsis t WHERE t.odeme_islem_id = i.id));

  DELETE FROM islem_tahsis t USING _tahsis_replay2 r WHERE t.odeme_islem_id = r.id;

  FOR v_o IN SELECT * FROM _tahsis_replay2 ORDER BY isletme_id, date ASC, created_at ASC LOOP
    PERFORM public.tahsis_odeme_esitle(v_o.isletme_id, v_o.id, NULL);
  END LOOP;
END $$;
