-- =============================================================================
-- FIFO tahsis: VADESİZ borçlar da kuyruğa girer (TBK 101-102 mahsup kuralı)
--
-- Sorun: ödeme dağıtımı yalnız vadeli/taksitli borçları hedefliyordu. Önce doğan
-- vadesiz borç açık kalırken sonra doğan vadeli borç "ödenmiş" görünüyordu —
-- gerçek hayatta (ve TBK mahsup kuralında) ödeme önce MUACCEL (vadesi gelmiş)
-- borca sayılır; vadesiz borç doğduğu an muacceldir.
--
-- Yeni kural:
--   * FIFO adayları = vadeli/taksitli birimler + go-live (2026-07-20) SONRASI
--     oluşturulmuş vadesiz cari_satis/cari_alis işlemleri.
--   * Etkin vade = COALESCE(taksit vadesi, işlem vadesi, işlem günü).
--   * ESKİ KULLANICI GÜVENLİĞİ: go-live öncesi vadesiz işlemler ASLA kuyruğa
--     girmez (defterde tahsis geçmişleri yok; girerlerse yeni ödemeleri yutup
--     vadeli borçları sonsuza dek "gecikmiş" gösterirlerdi). Avans süpürmedeki
--     cutoff ile aynı sınır.
--   * Gecikmiş/yaklaşan ROZETLERİ değişmez: yalnız gerçek vadeli/taksitli
--     birimlerden hesaplanır (vadesiz borç "vadesi geçti" alarmı üretmez).
--
-- Kapsam: fifo_tahsis_dagit (aday+sıralama), create_islem_atomik +
-- create_islem_with_urun_atomik (vadesiz borç da avans süpürtür),
-- update_islem_atomik (vade değişimi = FIFO pozisyon değişimi → yeniden dağıt)
-- + defterdeki ödemelerin kanonik yeniden dağıtımı (replay).
-- "Eski client ne yaşar?": RPC imzaları aynı; dağıtım tamamen sunucuda —
-- eski sürümler davranışı otomatik alır, kırılma yok. balance'a DOKUNULMAZ
-- (tahsis salt görüntü katmanı).
-- =============================================================================

-- 0) Güvenlik yedeği: replay öncesi mevcut tahsis satırları (küçük tablo)
CREATE TABLE IF NOT EXISTS public.islem_tahsis_yedek_20260722 AS
SELECT * FROM public.islem_tahsis;

-- 1) fifo_tahsis_dagit — vadesiz (go-live sonrası) borçlar aday; etkin vade sırası
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
      -- Vadeli/taksitli her zaman; VADESİZ yalnız go-live sonrası (opt-in sınırı)
      AND (tk.id IS NOT NULL
           OR i.vade_tarihi IS NOT NULL
           OR i.created_at >= TIMESTAMPTZ '2026-07-20 00:00:00+00')
      AND i.id <> p_odeme_islem_id
      AND (p_exclude_borc IS NULL OR i.id <> p_exclude_borc)
    ORDER BY
      (i.id = p_hedef_borc AND (p_hedef_taksit IS NULL OR tk.id = p_hedef_taksit)) DESC,
      -- Etkin vade: taksit > işlem vadesi > işlem günü (vadesiz = anında muaccel)
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

-- 2) create_islem_atomik — vadesiz borç da avans süpürtür
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
BEGIN
  IF NOT public.user_has_isletme_access(p_isletme_id) THEN
    RAISE EXCEPTION 'Yetkisiz erisim' USING ERRCODE = '42501';
  END IF;
  IF NOT public.user_can_islem_action(p_isletme_id, 'create', NULL) THEN
    RAISE EXCEPTION 'Bu islem icin yetkiniz yok (islem olusturma)' USING ERRCODE = '42501';
  END IF;

  r := jsonb_populate_record(NULL::public.islemler, p_new_row);
  v_id := COALESCE(NULLIF(p_new_row->>'id', '')::uuid, gen_random_uuid());

  INSERT INTO islemler (
    id, isletme_id, type, amount, description, date,
    hesap_id, hedef_hesap_id, kategori_id, cari_id, personel_id,
    source_currency, target_currency, exchange_rate, photo_path, date_end, source_ileri_id,
    vade_tarihi
  ) VALUES (
    v_id, p_isletme_id, r.type, r.amount, r.description, r.date,
    r.hesap_id, r.hedef_hesap_id, r.kategori_id, r.cari_id, r.personel_id,
    r.source_currency, r.target_currency, r.exchange_rate, r.photo_path, r.date_end, r.source_ileri_id,
    r.vade_tarihi
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

    -- Vadesiz borç da FIFO kuyruğunda artık → vade şartı kaldırıldı
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

-- 3) create_islem_with_urun_atomik — aynı düzeltme
CREATE OR REPLACE FUNCTION public.create_islem_with_urun_atomik(p_isletme_id uuid, p_new_row jsonb, p_balance_ops jsonb, p_items jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  op jsonb;
  it jsonb;
  r public.islemler;
  v_id uuid;
  v_rowcount integer;
  v_degisim numeric;
  v_yeni numeric;
  v_result jsonb;
BEGIN
  IF NOT public.user_has_isletme_access(p_isletme_id) THEN
    RAISE EXCEPTION 'Yetkisiz erisim' USING ERRCODE = '42501';
  END IF;
  IF NOT public.user_can_islem_action(p_isletme_id, 'create', NULL) THEN
    RAISE EXCEPTION 'Bu islem icin yetkiniz yok (islem olusturma)' USING ERRCODE = '42501';
  END IF;
  IF NOT public.user_has_module_access(p_isletme_id, 'urunler') THEN
    RAISE EXCEPTION 'Urun modulu icin yetkiniz yok' USING ERRCODE = '42501';
  END IF;

  r := jsonb_populate_record(NULL::public.islemler, p_new_row);
  v_id := COALESCE(NULLIF(p_new_row->>'id', '')::uuid, gen_random_uuid());

  INSERT INTO islemler (
    id, isletme_id, type, amount, description, date,
    hesap_id, hedef_hesap_id, kategori_id, cari_id, personel_id,
    source_currency, target_currency, exchange_rate, photo_path, date_end, source_ileri_id,
    vade_tarihi
  ) VALUES (
    v_id, p_isletme_id, r.type, r.amount, r.description, r.date,
    r.hesap_id, r.hedef_hesap_id, r.kategori_id, r.cari_id, r.personel_id,
    r.source_currency, r.target_currency, r.exchange_rate, r.photo_path, r.date_end, r.source_ileri_id,
    r.vade_tarihi
  )
  ON CONFLICT (id) DO NOTHING;

  GET DIAGNOSTICS v_rowcount = ROW_COUNT;

  IF v_rowcount > 0 THEN
    FOR op IN SELECT * FROM jsonb_array_elements(COALESCE(p_balance_ops, '[]'::jsonb))
    LOOP
      PERFORM public.increment_balance(op->>'t', (op->>'id')::uuid, (op->>'d')::numeric);
    END LOOP;

    FOR it IN SELECT * FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb))
    LOOP
      v_degisim := CASE it->>'hareket_tipi'
        WHEN 'giris' THEN abs((it->>'miktar')::numeric)
        WHEN 'cikis' THEN -abs((it->>'miktar')::numeric)
        ELSE (it->>'miktar')::numeric
      END;

      v_yeni := public.update_urun_miktar((it->>'urun_id')::uuid, v_degisim, p_isletme_id);

      INSERT INTO urun_hareketler (
        isletme_id, urun_id, islem_id, hareket_tipi, miktar,
        birim_fiyat, kdv_orani, onceki_miktar, yeni_miktar, aciklama, created_at
      ) VALUES (
        p_isletme_id, (it->>'urun_id')::uuid, v_id, it->>'hareket_tipi', (it->>'miktar')::numeric,
        NULLIF(it->>'birim_fiyat','')::numeric, COALESCE((it->>'kdv_orani')::integer, 0),
        v_yeni - v_degisim, v_yeni, it->>'aciklama',
        COALESCE(NULLIF(it->>'created_at','')::timestamptz, now())
      );
    END LOOP;

    IF r.cari_id IS NOT NULL AND public.tahsis_borc_tipleri(r.type) IS NOT NULL THEN
      PERFORM public.tahsis_odeme_esitle(p_isletme_id, v_id, NULL);
    END IF;

    -- Vadesiz borç da FIFO kuyruğunda artık → vade şartı kaldırıldı
    IF r.cari_id IS NOT NULL AND r.type IN ('cari_satis', 'cari_alis') THEN
      PERFORM public.tahsis_avans_supur(p_isletme_id, r.cari_id);
    END IF;
  END IF;

  SELECT to_jsonb(i) INTO v_result FROM islemler i WHERE i.id = v_id AND i.isletme_id = p_isletme_id;
  IF v_result IS NULL THEN
    RAISE EXCEPTION 'create_islem_with_urun_atomik: islem bulunamadi (id: %)', v_id;
  END IF;
  RETURN v_result;
END;
$function$;

-- 4) update_islem_atomik — vade değişimi = FIFO pozisyon değişimi → boşalt+dağıt;
--    vadesiz borçta işlem günü değişimi de pozisyonu değiştirir; süpürme vade şartsız
CREATE OR REPLACE FUNCTION public.update_islem_atomik(p_isletme_id uuid, p_islem_id uuid, p_balance_ops jsonb, p_new_row jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  op jsonb;
  r public.islemler;
  v_result jsonb;
  v_created_by uuid;
  v_old public.islemler;
  v_new public.islemler;
  v_planli boolean;
BEGIN
  IF NOT public.user_has_isletme_access(p_isletme_id) THEN
    RAISE EXCEPTION 'Yetkisiz erisim' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_old
  FROM islemler WHERE id = p_islem_id AND isletme_id = p_isletme_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Islem bulunamadi veya bu isletmeye ait degil (islem_id: %)', p_islem_id;
  END IF;
  v_created_by := v_old.created_by;

  IF NOT public.user_can_islem_action(p_isletme_id, 'update', v_created_by) THEN
    RAISE EXCEPTION 'Bu islemi guncelleme yetkiniz yok' USING ERRCODE = '42501';
  END IF;

  SELECT EXISTS (SELECT 1 FROM taksit_planlari tp WHERE tp.islem_id = p_islem_id) INTO v_planli;
  IF v_planli THEN
    r := jsonb_populate_record(NULL::public.islemler, p_new_row);
    IF r.amount IS DISTINCT FROM v_old.amount
       OR r.type IS DISTINCT FROM v_old.type
       OR r.cari_id IS DISTINCT FROM v_old.cari_id THEN
      RAISE EXCEPTION 'Taksitli islemin tutari/tipi/carisi degistirilemez; plani silip yeniden olusturun'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  FOR op IN SELECT * FROM jsonb_array_elements(COALESCE(p_balance_ops, '[]'::jsonb))
  LOOP
    PERFORM public.increment_balance(op->>'t', (op->>'id')::uuid, (op->>'d')::numeric);
  END LOOP;

  r := jsonb_populate_record(NULL::public.islemler, p_new_row);
  UPDATE islemler SET
    type            = r.type,
    amount          = r.amount,
    description     = r.description,
    date            = r.date,
    hesap_id        = r.hesap_id,
    hedef_hesap_id  = r.hedef_hesap_id,
    kategori_id     = r.kategori_id,
    cari_id         = r.cari_id,
    personel_id     = r.personel_id,
    source_currency = r.source_currency,
    target_currency = r.target_currency,
    exchange_rate   = r.exchange_rate,
    photo_path      = r.photo_path,
    date_end        = r.date_end,
    vade_tarihi     = CASE WHEN v_planli THEN islemler.vade_tarihi
                           WHEN p_new_row ? 'vade_tarihi' THEN r.vade_tarihi
                           ELSE islemler.vade_tarihi END
  WHERE id = p_islem_id AND isletme_id = p_isletme_id;

  SELECT * INTO v_new FROM islemler WHERE id = p_islem_id AND isletme_id = p_isletme_id;

  IF public.tahsis_borc_tipleri(v_old.type) IS NOT NULL
     AND (v_new.type IS DISTINCT FROM v_old.type OR v_new.cari_id IS DISTINCT FROM v_old.cari_id) THEN
    DELETE FROM islem_tahsis WHERE odeme_islem_id = p_islem_id AND isletme_id = p_isletme_id;
  END IF;

  IF v_new.cari_id IS NOT NULL AND public.tahsis_borc_tipleri(v_new.type) IS NOT NULL THEN
    PERFORM public.tahsis_odeme_esitle(p_isletme_id, p_islem_id, NULL);
  END IF;

  IF NOT v_planli AND EXISTS (SELECT 1 FROM islem_tahsis WHERE borc_islem_id = p_islem_id) THEN
    IF v_new.type IS DISTINCT FROM v_old.type
       OR v_new.cari_id IS DISTINCT FROM v_old.cari_id
       -- Vade değişti (eklendi/silindi/kaydı) → FIFO pozisyonu değişti
       OR v_new.vade_tarihi IS DISTINCT FROM v_old.vade_tarihi
       -- Vadesiz borçta etkin vade = işlem günü → gün değişimi de pozisyon değişimi
       OR (v_new.vade_tarihi IS NULL AND v_new.date IS DISTINCT FROM v_old.date) THEN
      PERFORM public.tahsis_borc_bosalt_ve_dagit(p_isletme_id, p_islem_id, NULL);
    ELSE
      PERFORM public.tahsis_borc_kirp_ve_dagit(p_isletme_id, p_islem_id);
    END IF;
  END IF;

  IF v_new.cari_id IS NOT NULL
     AND v_new.type IN ('cari_satis', 'cari_alis')
     AND (v_old.type NOT IN ('cari_satis', 'cari_alis')
          OR v_new.cari_id IS DISTINCT FROM v_old.cari_id
          OR v_new.amount > v_old.amount
          OR v_new.vade_tarihi IS DISTINCT FROM v_old.vade_tarihi) THEN
    PERFORM public.tahsis_avans_supur(p_isletme_id, v_new.cari_id);
  END IF;

  SELECT to_jsonb(i) INTO v_result FROM islemler i WHERE i.id = p_islem_id AND i.isletme_id = p_isletme_id;
  RETURN v_result;
END;
$function$;

-- 5) Kanonik yeniden dağıtım (replay): defterdeki tüm ödemeler yeni kurala göre
--    tarih sırasıyla baştan dağıtılır. balance'a dokunulmaz (tahsis salt görüntü).
--    Hedefli tahsislerin hedef bilgisi saklanmadığından FIFO'ya normalize olur
--    (TBK kuralına uygun; özellik 2 günlük, etki minimal).
DO $$
DECLARE
  v_o record;
BEGIN
  CREATE TEMP TABLE _tahsis_replay ON COMMIT DROP AS
  SELECT i.id, i.isletme_id, i.date, i.created_at
  FROM islemler i
  WHERE i.cari_id IS NOT NULL
    AND public.tahsis_borc_tipleri(i.type) IS NOT NULL
    AND (i.created_at >= TIMESTAMPTZ '2026-07-20 00:00:00+00'
         OR EXISTS (SELECT 1 FROM islem_tahsis t WHERE t.odeme_islem_id = i.id));

  DELETE FROM islem_tahsis t USING _tahsis_replay r WHERE t.odeme_islem_id = r.id;

  FOR v_o IN SELECT * FROM _tahsis_replay ORDER BY isletme_id, date ASC, created_at ASC LOOP
    PERFORM public.tahsis_odeme_esitle(v_o.isletme_id, v_o.id, NULL);
  END LOOP;
END $$;
