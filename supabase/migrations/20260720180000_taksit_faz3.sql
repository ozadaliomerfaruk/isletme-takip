-- =============================================================================
-- TAKSİT — Faz 3 (plan §2.3, karar #1: 1-işlem + taksitler alt-tablo; karar #2:
-- ortak islem_tahsis + nullable taksit_id → TEK defter, TEK motor)
-- =============================================================================
-- Model: taksitli satış/alış = 1 cari borç işlemi (TOPLAM tutar; gelir/gider
-- raporu satış tarihinde BİR KEZ sayar, computeBalanceOps değişmez) + N taksit
-- satırı (sira, vade, tutar). FIFO motoru artık "borç birimleri" üzerinde çalışır:
-- plansız borç = işlemin kendisi (vade_tarihi'li), planlı borç = taksit satırları.
-- Kalan(taksit) = taksit.tutar − Σ(tahsis WHERE taksit_id=X).
--
-- ADDITIVE + GERİ ALINABİLİR: yeni 2 tablo + FK + fonksiyon değişimleri; hiçbir
-- kullanıcı verisine dokunulmaz. Eski client: taksit RPC'sini bilmez → hiçbir yol
-- değişmez (fifo genişlemesi taksitsiz borçlarda birebir eski davranış — LEFT JOIN
-- boş → birim = işlem).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Tablolar + index + RLS (select-only; yazan tek yol SECURITY DEFINER RPC)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.taksit_planlari (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  isletme_id uuid NOT NULL REFERENCES public.isletmeler(id) ON DELETE CASCADE,
  islem_id uuid NOT NULL UNIQUE REFERENCES public.islemler(id) ON DELETE CASCADE,
  cari_id uuid NOT NULL REFERENCES public.cariler(id) ON DELETE CASCADE,
  taksit_adedi integer NOT NULL CHECK (taksit_adedi BETWEEN 2 AND 48),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.taksitler (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.taksit_planlari(id) ON DELETE CASCADE,
  isletme_id uuid NOT NULL REFERENCES public.isletmeler(id) ON DELETE CASCADE,
  islem_id uuid NOT NULL REFERENCES public.islemler(id) ON DELETE CASCADE,
  sira integer NOT NULL CHECK (sira >= 1),
  vade_tarihi date NOT NULL,
  tutar numeric(15,2) NOT NULL CHECK (tutar > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (plan_id, sira)
);

CREATE INDEX IF NOT EXISTS idx_taksitler_islem ON public.taksitler (islem_id);
CREATE INDEX IF NOT EXISTS idx_taksit_planlari_isletme ON public.taksit_planlari (isletme_id);

-- Tahsis → taksit bütünlüğü (Faz 2'de kolon vardı, FK şimdi — plan §2.2).
DO $$ BEGIN
  ALTER TABLE public.islem_tahsis
    ADD CONSTRAINT islem_tahsis_taksit_fk
    FOREIGN KEY (taksit_id) REFERENCES public.taksitler(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.taksit_planlari ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.taksitler ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "taksit_planlari_select" ON public.taksit_planlari;
CREATE POLICY "taksit_planlari_select" ON public.taksit_planlari
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.isletmeler isl WHERE isl.id = taksit_planlari.isletme_id AND isl.user_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.isletme_users iu
      WHERE iu.isletme_id = taksit_planlari.isletme_id AND iu.user_id = auth.uid()
        AND iu.status = 'active'
        AND COALESCE((iu.permissions->'modules'->>'islemler')::boolean, false)
    )
  );

DROP POLICY IF EXISTS "taksitler_select" ON public.taksitler;
CREATE POLICY "taksitler_select" ON public.taksitler
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.isletmeler isl WHERE isl.id = taksitler.isletme_id AND isl.user_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.isletme_users iu
      WHERE iu.isletme_id = taksitler.isletme_id AND iu.user_id = auth.uid()
        AND iu.status = 'active'
        AND COALESCE((iu.permissions->'modules'->>'islemler')::boolean, false)
    )
  );

-- -----------------------------------------------------------------------------
-- 2) FIFO motoru — BORÇ BİRİMLERİ (plansız=işlem, planlı=taksit satırları).
--    İmza değişiyor (+p_hedef_taksit) → eski 7-arg sürüm DROP edilir (iç fonksiyon,
--    client çağıramaz; DB-içi çağrılar default'la 8-arg'a çözülür).
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.fifo_tahsis_dagit(uuid, uuid, uuid, text, numeric, uuid, uuid);

CREATE OR REPLACE FUNCTION public.fifo_tahsis_dagit(
  p_isletme_id uuid,
  p_cari_id uuid,
  p_odeme_islem_id uuid,
  p_odeme_type text,
  p_tutar numeric,
  p_hedef_borc uuid DEFAULT NULL,
  p_exclude_borc uuid DEFAULT NULL,
  p_hedef_taksit uuid DEFAULT NULL
) RETURNS numeric
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
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

  -- Birimler: LEFT JOIN taksitler → planlı borçta N taksit satırı (işlem-bütünü
  -- ASLA ayrıca gelmez: tk varsa her satır tk'lıdır), plansızda tek satır (tk NULL,
  -- vade_tarihi şart). Para birimi filtresi yok — cari_id-scoping (Faz 2 notu).
  FOR v_borc IN
    SELECT i.id AS islem_id, tk.id AS taksit_id,
           round(COALESCE(tk.tutar, i.amount), 2) AS birim_tutar
    FROM islemler i
    LEFT JOIN taksitler tk ON tk.islem_id = i.id AND tk.isletme_id = i.isletme_id
    WHERE i.isletme_id = p_isletme_id
      AND i.cari_id = p_cari_id
      AND i.type = ANY (v_borc_tipleri)
      AND (tk.id IS NOT NULL OR i.vade_tarihi IS NOT NULL)
      AND i.id <> p_odeme_islem_id
      AND (p_exclude_borc IS NULL OR i.id <> p_exclude_borc)
    ORDER BY
      (i.id = p_hedef_borc AND (p_hedef_taksit IS NULL OR tk.id = p_hedef_taksit)) DESC,
      COALESCE(tk.vade_tarihi, i.vade_tarihi) ASC,
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

REVOKE EXECUTE ON FUNCTION public.fifo_tahsis_dagit(uuid, uuid, uuid, text, numeric, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 3) update_islem_atomik — taksitli işlem guard'ı (gövde 20260720150000 + guard).
--    Taksitli işlemin tutar/tip/cari'si serbest düzenlenemez: taksit satırları ve
--    tahsisler tutarla senkron kalamaz → açık hata, sessiz bozulmadan iyidir.
--    (Tarih/açıklama/kategori/foto düzenlemeleri serbest.)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_islem_atomik(
  p_isletme_id uuid,
  p_islem_id uuid,
  p_balance_ops jsonb,
  p_new_row jsonb
)
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

  -- FAZ 3 GUARD: taksitli işlemde tutar/tip/cari/vade değişikliği engellenir.
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
    -- Taksitli işlemde vade_tarihi görüntü amaçlı (ilk taksit vadesi) — korunur.
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

  -- Taksitli borçta tutar/tip/cari sabit (yukarıdaki guard) → boşalt/kırp yalnız
  -- plansız borçlar için anlamlı; planlıda no-op koşulları zaten sağlanır.
  IF NOT v_planli AND EXISTS (SELECT 1 FROM islem_tahsis WHERE borc_islem_id = p_islem_id) THEN
    IF v_new.type IS DISTINCT FROM v_old.type
       OR v_new.cari_id IS DISTINCT FROM v_old.cari_id
       OR v_new.vade_tarihi IS NULL THEN
      PERFORM public.tahsis_borc_bosalt_ve_dagit(p_isletme_id, p_islem_id, NULL);
    ELSE
      PERFORM public.tahsis_borc_kirp_ve_dagit(p_isletme_id, p_islem_id);
    END IF;
  END IF;

  IF v_new.cari_id IS NOT NULL
     AND v_new.vade_tarihi IS NOT NULL
     AND v_new.type IN ('cari_satis', 'cari_alis')
     AND (v_old.vade_tarihi IS NULL
          OR v_old.type NOT IN ('cari_satis', 'cari_alis')
          OR v_new.cari_id IS DISTINCT FROM v_old.cari_id
          OR v_new.amount > v_old.amount) THEN
    PERFORM public.tahsis_avans_supur(p_isletme_id, v_new.cari_id);
  END IF;

  SELECT to_jsonb(i) INTO v_result FROM islemler i WHERE i.id = p_islem_id AND i.isletme_id = p_isletme_id;
  RETURN v_result;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.update_islem_atomik(uuid, uuid, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_islem_atomik(uuid, uuid, jsonb, jsonb) TO authenticated;

-- -----------------------------------------------------------------------------
-- 4) taksit_plani_olustur — taksitli satış/alış: işlem + plan + taksitler + bakiye
--    TEK transaction (client-facing; create_islem_atomik ile aynı gate+idempotency).
--    p_taksitler: [{sira, vade_tarihi, tutar}] — Σtutar == amount (kuruş) doğrulanır.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.taksit_plani_olustur(
  p_isletme_id uuid,
  p_new_row jsonb,
  p_balance_ops jsonb,
  p_taksitler jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  op jsonb;
  tk jsonb;
  r public.islemler;
  v_id uuid;
  v_rowcount integer;
  v_result jsonb;
  v_plan_id uuid;
  v_adet integer;
  v_toplam numeric := 0;
  v_min_vade date := NULL;
  v_sira integer := 0;
BEGIN
  IF NOT public.user_has_isletme_access(p_isletme_id) THEN
    RAISE EXCEPTION 'Yetkisiz erisim' USING ERRCODE = '42501';
  END IF;
  IF NOT public.user_can_islem_action(p_isletme_id, 'create', NULL) THEN
    RAISE EXCEPTION 'Bu islem icin yetkiniz yok (islem olusturma)' USING ERRCODE = '42501';
  END IF;

  r := jsonb_populate_record(NULL::public.islemler, p_new_row);
  IF r.type NOT IN ('cari_satis', 'cari_alis') OR r.cari_id IS NULL THEN
    RAISE EXCEPTION 'Taksit yalniz cari satis/alis islemlerinde gecerli';
  END IF;

  -- Taksit doğrulama: 2..48 satır, sira 1..N ardışık, tutar>0, Σ == amount (kuruş).
  v_adet := COALESCE(jsonb_array_length(p_taksitler), 0);
  IF v_adet < 2 OR v_adet > 48 THEN
    RAISE EXCEPTION 'Taksit adedi 2-48 arasi olmali (gelen: %)', v_adet;
  END IF;
  FOR tk IN SELECT * FROM jsonb_array_elements(p_taksitler)
  LOOP
    v_sira := v_sira + 1;
    IF COALESCE((tk->>'sira')::integer, -1) <> v_sira THEN
      RAISE EXCEPTION 'Taksit sira serisi bozuk (beklenen %, gelen %)', v_sira, tk->>'sira';
    END IF;
    IF COALESCE((tk->>'tutar')::numeric, 0) <= 0 OR NULLIF(tk->>'vade_tarihi','') IS NULL THEN
      RAISE EXCEPTION 'Taksit satiri gecersiz (sira %)', v_sira;
    END IF;
    v_toplam := round(v_toplam + (tk->>'tutar')::numeric, 2);
    v_min_vade := LEAST(COALESCE(v_min_vade, (tk->>'vade_tarihi')::date), (tk->>'vade_tarihi')::date);
  END LOOP;
  IF v_toplam <> round(r.amount, 2) THEN
    RAISE EXCEPTION 'Taksit toplami (%) islem tutarina (%) esit degil', v_toplam, round(r.amount, 2);
  END IF;

  v_id := COALESCE(NULLIF(p_new_row->>'id', '')::uuid, gen_random_uuid());

  -- İşlem satırı: vade_tarihi = İLK taksit vadesi (liste görünümü için; motor
  -- taksit birimleriyle çalışır, işlem-bütünü asla ayrıca borç sayılmaz).
  INSERT INTO islemler (
    id, isletme_id, type, amount, description, date,
    hesap_id, hedef_hesap_id, kategori_id, cari_id, personel_id,
    source_currency, target_currency, exchange_rate, photo_path, date_end, source_ileri_id,
    vade_tarihi
  ) VALUES (
    v_id, p_isletme_id, r.type, r.amount, r.description, r.date,
    r.hesap_id, r.hedef_hesap_id, r.kategori_id, r.cari_id, r.personel_id,
    r.source_currency, r.target_currency, r.exchange_rate, r.photo_path, r.date_end, r.source_ileri_id,
    v_min_vade
  )
  ON CONFLICT (id) DO NOTHING;

  GET DIAGNOSTICS v_rowcount = ROW_COUNT;

  IF v_rowcount > 0 THEN
    FOR op IN SELECT * FROM jsonb_array_elements(COALESCE(p_balance_ops, '[]'::jsonb))
    LOOP
      PERFORM public.increment_balance(op->>'t', (op->>'id')::uuid, (op->>'d')::numeric);
    END LOOP;

    INSERT INTO taksit_planlari (isletme_id, islem_id, cari_id, taksit_adedi)
    VALUES (p_isletme_id, v_id, r.cari_id, v_adet)
    RETURNING id INTO v_plan_id;

    FOR tk IN SELECT * FROM jsonb_array_elements(p_taksitler)
    LOOP
      INSERT INTO taksitler (plan_id, isletme_id, islem_id, sira, vade_tarihi, tutar)
      VALUES (v_plan_id, p_isletme_id, v_id, (tk->>'sira')::integer,
              (tk->>'vade_tarihi')::date, round((tk->>'tutar')::numeric, 2));
    END LOOP;

    -- Vadeli borç doğdu → defter-dönemi avanslar taksitlere FIFO bağlanır.
    PERFORM public.tahsis_avans_supur(p_isletme_id, r.cari_id);
  END IF;

  SELECT to_jsonb(i) INTO v_result FROM islemler i WHERE i.id = v_id AND i.isletme_id = p_isletme_id;
  IF v_result IS NULL THEN
    RAISE EXCEPTION 'taksit_plani_olustur: islem bulunamadi (id: %)', v_id;
  END IF;
  RETURN v_result;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.taksit_plani_olustur(uuid, jsonb, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.taksit_plani_olustur(uuid, jsonb, jsonb, jsonb) TO authenticated;

-- -----------------------------------------------------------------------------
-- 5) get_taksit_plan_listesi — Taksit Takip sayfası (salt-okuma, tek istek).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_taksit_plan_listesi(p_isletme_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
STABLE
AS $function$
DECLARE
  v_bugun date := (now() AT TIME ZONE 'Europe/Istanbul')::date;
  v_result jsonb;
BEGIN
  IF NOT public.user_has_isletme_access(p_isletme_id) THEN
    RAISE EXCEPTION 'Yetkisiz erisim' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(jsonb_agg(x ORDER BY (x->>'sonraki_vade') ASC NULLS LAST), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT jsonb_build_object(
      'plan_id', tp.id,
      'islem_id', tp.islem_id,
      'cari_id', tp.cari_id,
      'cari_name', c.name,
      'currency', COALESCE(c.currency, 'TRY'),
      'type', i.type,
      'islem_date', i.date,
      'toplam', round(i.amount, 2),
      'taksit_adedi', tp.taksit_adedi,
      'odenen', COALESCE((SELECT round(SUM(t.tutar), 2) FROM islem_tahsis t WHERE t.borc_islem_id = tp.islem_id), 0),
      'odenen_taksit_adedi', (
        SELECT COUNT(*) FROM taksitler tk
        WHERE tk.plan_id = tp.id
          AND round(tk.tutar - COALESCE((SELECT SUM(t2.tutar) FROM islem_tahsis t2
                WHERE t2.borc_islem_id = tp.islem_id AND t2.taksit_id = tk.id), 0), 2) <= 0
      ),
      'sonraki_vade', (
        SELECT MIN(tk.vade_tarihi) FROM taksitler tk
        WHERE tk.plan_id = tp.id
          AND round(tk.tutar - COALESCE((SELECT SUM(t2.tutar) FROM islem_tahsis t2
                WHERE t2.borc_islem_id = tp.islem_id AND t2.taksit_id = tk.id), 0), 2) > 0
      ),
      'gecikmis_adet', (
        SELECT COUNT(*) FROM taksitler tk
        WHERE tk.plan_id = tp.id AND tk.vade_tarihi <= v_bugun
          AND round(tk.tutar - COALESCE((SELECT SUM(t2.tutar) FROM islem_tahsis t2
                WHERE t2.borc_islem_id = tp.islem_id AND t2.taksit_id = tk.id), 0), 2) > 0
      )
    ) AS x
    FROM taksit_planlari tp
    JOIN islemler i ON i.id = tp.islem_id
    JOIN cariler c ON c.id = tp.cari_id
    WHERE tp.isletme_id = p_isletme_id
  ) s;

  RETURN v_result;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_taksit_plan_listesi(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_taksit_plan_listesi(uuid) TO authenticated;

-- -----------------------------------------------------------------------------
-- 6) get_vade_ozet + get_cari_vade_rozet — taksit-birim-farkındalı yeniden tanım
--    (taksitli borçta gecikmiş = yalnız vadesi geçen AÇIK taksitlerin kalanı;
--    işlem-bütünü ilk-vade üzerinden kaba sayılmaz).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_vade_ozet(p_isletme_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
STABLE
AS $function$
DECLARE
  v_bugun date := (now() AT TIME ZONE 'Europe/Istanbul')::date;
  v_result jsonb;
BEGIN
  IF NOT public.user_has_isletme_access(p_isletme_id) THEN
    RAISE EXCEPTION 'Yetkisiz erisim' USING ERRCODE = '42501';
  END IF;

  WITH birim AS (
    SELECT
      i.type,
      COALESCE(tk.vade_tarihi, i.vade_tarihi) AS vade,
      COALESCE(c.currency, 'TRY') AS currency,
      round(COALESCE(tk.tutar, i.amount) - COALESCE((
        SELECT SUM(t.tutar) FROM islem_tahsis t
        WHERE t.borc_islem_id = i.id AND t.taksit_id IS NOT DISTINCT FROM tk.id
      ), 0), 2) AS kalan
    FROM islemler i
    JOIN cariler c ON c.id = i.cari_id
    LEFT JOIN taksitler tk ON tk.islem_id = i.id AND tk.isletme_id = i.isletme_id
    WHERE i.isletme_id = p_isletme_id
      AND (tk.id IS NOT NULL OR i.vade_tarihi IS NOT NULL)
      AND i.type IN ('cari_satis', 'cari_alis')
  )
  SELECT COALESCE(jsonb_agg(x ORDER BY x->>'currency'), '[]'::jsonb) INTO v_result
  FROM (
    SELECT jsonb_build_object(
      'currency', currency,
      'gecikmis_alacak',      SUM(kalan) FILTER (WHERE type = 'cari_satis' AND vade <= v_bugun),
      'gecikmis_alacak_adet', COUNT(*)   FILTER (WHERE type = 'cari_satis' AND vade <= v_bugun),
      'gecikmis_borc',        SUM(kalan) FILTER (WHERE type = 'cari_alis'  AND vade <= v_bugun),
      'gecikmis_borc_adet',   COUNT(*)   FILTER (WHERE type = 'cari_alis'  AND vade <= v_bugun),
      'yaklasan_alacak',      SUM(kalan) FILTER (WHERE type = 'cari_satis' AND vade >  v_bugun AND vade <= v_bugun + 7),
      'yaklasan_borc',        SUM(kalan) FILTER (WHERE type = 'cari_alis'  AND vade >  v_bugun AND vade <= v_bugun + 7)
    ) AS x
    FROM birim
    WHERE kalan > 0
    GROUP BY currency
  ) s;

  RETURN v_result;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_vade_ozet(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_vade_ozet(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_cari_vade_rozet(p_isletme_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
STABLE
AS $function$
DECLARE
  v_bugun date := (now() AT TIME ZONE 'Europe/Istanbul')::date;
  v_result jsonb;
BEGIN
  IF NOT public.user_has_isletme_access(p_isletme_id) THEN
    RAISE EXCEPTION 'Yetkisiz erisim' USING ERRCODE = '42501';
  END IF;

  WITH birim AS (
    SELECT i.cari_id, i.type,
      round(COALESCE(tk.tutar, i.amount) - COALESCE((
        SELECT SUM(t.tutar) FROM islem_tahsis t
        WHERE t.borc_islem_id = i.id AND t.taksit_id IS NOT DISTINCT FROM tk.id
      ), 0), 2) AS kalan
    FROM islemler i
    LEFT JOIN taksitler tk ON tk.islem_id = i.id AND tk.isletme_id = i.isletme_id
    WHERE i.isletme_id = p_isletme_id
      AND (tk.id IS NOT NULL OR i.vade_tarihi IS NOT NULL)
      AND COALESCE(tk.vade_tarihi, i.vade_tarihi) <= v_bugun
      AND i.type IN ('cari_satis', 'cari_alis')
      AND i.cari_id IS NOT NULL
  )
  SELECT COALESCE(jsonb_agg(x), '[]'::jsonb) INTO v_result
  FROM (
    SELECT jsonb_build_object(
      'cari_id', b.cari_id,
      'currency', COALESCE(c.currency, 'TRY'),
      'gecikmis_alacak', COALESCE(SUM(b.kalan) FILTER (WHERE b.type = 'cari_satis'), 0),
      'gecikmis_borc',   COALESCE(SUM(b.kalan) FILTER (WHERE b.type = 'cari_alis'), 0),
      'gecikmis_adet',   COUNT(*)
    ) AS x
    FROM birim b JOIN cariler c ON c.id = b.cari_id
    WHERE b.kalan > 0
    GROUP BY b.cari_id, c.currency
  ) s;

  RETURN v_result;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_cari_vade_rozet(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_cari_vade_rozet(uuid) TO authenticated;
