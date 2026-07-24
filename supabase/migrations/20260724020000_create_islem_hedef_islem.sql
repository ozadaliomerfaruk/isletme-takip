-- =============================================================================
-- TAKSİT AŞAMA 2 — WRITE-PATH: create_islem_atomik'e fatura-hedefli ödeme
-- =============================================================================
-- İmza DEĞİŞMEZ (p_new_row jsonb) → eski client etkilenmez. hedef_islem_id p_new_row'da
-- bir ALAN olarak gelir; RPC doğrular + insert eder. GEÇERSİZSE NULL (güvenli degrade):
--   • yalnız ödeme (cari_odeme/tahsilat) hedefler
--   • hedef fatura AYNI işletme + AYNI cari + type ∈ (cari_alis, cari_satis)
--   • iki-yabancı çapraz-kur (source≠target & ikisi ≠TRY) → hedefleme düşer (FIFO)
-- Gövdenin geri kalanı (idempotency, balance ops, tahsis_odeme_esitle, avans-süpürme)
-- AYNEN korunur — fifo_tahsis_dagit yazımı DURDURULMAZ (avans-süpürme ona bağlı).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.create_islem_atomik(p_isletme_id uuid, p_new_row jsonb, p_balance_ops jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  op jsonb;
  r public.islemler;
  v_id uuid;
  v_rowcount integer;
  v_result jsonb;
  v_hedef uuid;
BEGIN
  IF NOT public.user_has_isletme_access(p_isletme_id) THEN
    RAISE EXCEPTION 'Yetkisiz erisim' USING ERRCODE = '42501';
  END IF;
  IF NOT public.user_can_islem_action(p_isletme_id, 'create', NULL) THEN
    RAISE EXCEPTION 'Bu islem icin yetkiniz yok (islem olusturma)' USING ERRCODE = '42501';
  END IF;

  r := jsonb_populate_record(NULL::public.islemler, p_new_row);
  v_id := COALESCE(NULLIF(p_new_row->>'id', '')::uuid, gen_random_uuid());

  -- HEDEF DOĞRULAMA (fatura-hedefli ödeme). Geçersiz/uyumsuz → v_hedef NULL (degrade;
  -- yok-sayılan pointer saklanmaz). Read-side same-cari savunması ayrıca var (drift için).
  v_hedef := NULL;
  IF r.type IN ('cari_odeme', 'cari_tahsilat')
     AND (p_new_row ->> 'hedef_islem_id') IS NOT NULL
     AND r.cari_id IS NOT NULL
     AND NOT (r.source_currency IS NOT NULL AND r.target_currency IS NOT NULL
              AND r.source_currency <> r.target_currency
              AND r.source_currency <> 'TRY' AND r.target_currency <> 'TRY')
  THEN
    SELECT inv.id INTO v_hedef
    FROM islemler inv
    WHERE inv.id = (p_new_row ->> 'hedef_islem_id')::uuid
      AND inv.isletme_id = p_isletme_id
      AND inv.cari_id = r.cari_id
      AND inv.type IN ('cari_alis', 'cari_satis');
    -- bulunamazsa v_hedef NULL kalır
  END IF;

  INSERT INTO islemler (
    id, isletme_id, type, amount, description, date,
    hesap_id, hedef_hesap_id, kategori_id, cari_id, personel_id,
    source_currency, target_currency, exchange_rate, photo_path, date_end, source_ileri_id,
    vade_tarihi, hedef_islem_id
  ) VALUES (
    v_id, p_isletme_id, r.type, r.amount, r.description, r.date,
    r.hesap_id, r.hedef_hesap_id, r.kategori_id, r.cari_id, r.personel_id,
    r.source_currency, r.target_currency, r.exchange_rate, r.photo_path, r.date_end, r.source_ileri_id,
    r.vade_tarihi, v_hedef
  )
  ON CONFLICT (id) DO NOTHING;

  GET DIAGNOSTICS v_rowcount = ROW_COUNT;

  IF v_rowcount > 0 THEN
    FOR op IN SELECT * FROM jsonb_array_elements(COALESCE(p_balance_ops, '[]'::jsonb))
    LOOP
      PERFORM public.increment_balance(op->>'t', (op->>'id')::uuid, (op->>'d')::numeric);
    END LOOP;

    IF r.cari_id IS NOT NULL AND public.tahsis_borc_tipleri(r.type) IS NOT NULL THEN
      PERFORM public.tahsis_odeme_esitle(p_isletme_id, v_id, NULL);
    END IF;

    IF r.cari_id IS NOT NULL AND r.type IN ('cari_satis', 'cari_alis') THEN
      PERFORM public.tahsis_avans_supur(p_isletme_id, r.cari_id);
    END IF;
  END IF;

  SELECT to_jsonb(i) INTO v_result FROM islemler i WHERE i.id = v_id AND i.isletme_id = p_isletme_id;
  IF v_result IS NULL THEN
    RAISE EXCEPTION 'create_islem_atomik: islem bulunamadi (id: %)', v_id;
  END IF;
  RETURN v_result;
END;
$function$;
