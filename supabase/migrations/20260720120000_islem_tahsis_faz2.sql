-- =============================================================================
-- TAHSİS DEFTERİ — Faz 2 (docs/TAKSIT-VADE-FIFO-PLAN.md §2.2, §3, §4, §6.2)
-- =============================================================================
-- Bir ödeme/tahsilat/iade tutarını carinin AÇIK vadeli borçlarına FIFO (en eski
-- vade önce) tahsis eden PARALEL görüntü katmanı. KİLİT İLKELER:
--
--  * `cariler.balance` TEK GERÇEK KAYNAK KALIR — bu defter bakiyeyi yeniden
--    HESAPLAMAZ, hiçbir increment_balance çağrısına dokunmaz (plan §1).
--  * ADDITIVE + OPT-IN: yalnız vade_tarihi'li borçlarda çalışır. Vadesiz işlem =
--    bugünkü davranış birebir. Backfill YOK. "1.5.x client'ı ne yaşar?" → hiçbir
--    şey: eski client'ın create/update/delete çağrıları aynı imzalarla çalışır;
--    vade göndermediği için tahsis defteri hiç devreye girmez (borç open-set'i
--    vade_tarihi IS NOT NULL ile sınırlı).
--  * HAM (owner-canonical) tutarlar: viewer inversiyonu YALNIZ gösterim (plan §3).
--  * Kur: cari tarafı tutar = alis/satis/iadelerde HAM amount, odeme/tahsilatta
--    calculateTargetAmount aynası (kaynak TRY → böl, değilse çarp) — üretimdeki
--    undo_import_batch (20260219000001) ile birebir aynı formül.
--  * Determinizm: ORDER BY vade_tarihi, created_at, id (TS aynası: fifoTahsis.ts).
--  * Eşzamanlılık: cari-bazlı pg_advisory_xact_lock → iki eşzamanlı ödeme aynı
--    borca çifte tahsis edemez.
--  * Bütünlük: çapraz-tablo invariant'lar CHECK ile değil RPC guard'ı ile (plan
--    §2.2). Client islem_tahsis'e YAZAMAZ (RLS'te write policy yok; yazan tek
--    yol SECURITY DEFINER atomik RPC'ler).
--
-- Kapsam (plan §6.2 zorunlu maddeleri dahil):
--  1) islem_tahsis tablosu (+ index + RLS select-only)
--  2) FIFO motoru (SQL) + cari-etki/borç-tip yardımcıları (iç fonksiyonlar)
--  3) create_islem_atomik / create_islem_with_urun_atomik → ödeme-tipli işlemde
--     oto-FIFO (idempotency korunur: yalnız v_rowcount>0 dalında)
--  4) update_islem_atomik → tahsis-farkındalık (tip/cari/vade/tutar değişimleri)
--  5) delete_islem_atomik → ödeme silme=tahsis sil; borç silme=boşalt+yeniden dağıt
--  6) retahsis_odeme RPC (baştan — plan karar #3) + get_vade_ozet (dashboard)
--
-- İade notu (plan genişletmesi): cari_satis_iade satış borçlarını, cari_alis_iade
-- alış borçlarını tahsilat/ödeme gibi FIFO kapatır — aksi hâlde iade edilmiş borç
-- defterde sonsuza dek "açık" görünürdü (bakiye zaten netlenmişken).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Tablo + index + RLS
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.islem_tahsis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  isletme_id uuid NOT NULL REFERENCES public.isletmeler(id) ON DELETE CASCADE,
  cari_id uuid NOT NULL REFERENCES public.cariler(id) ON DELETE CASCADE,
  borc_islem_id uuid NOT NULL REFERENCES public.islemler(id) ON DELETE CASCADE,
  odeme_islem_id uuid NOT NULL REFERENCES public.islemler(id) ON DELETE CASCADE,
  -- Faz 3'te taksitler(id) FK'sı eklenecek (tablo henüz yok) — plan §2.2 tek-defter.
  taksit_id uuid,
  tutar numeric(15,2) NOT NULL CHECK (tutar > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_islem_tahsis_borc  ON public.islem_tahsis (borc_islem_id);
CREATE INDEX IF NOT EXISTS idx_islem_tahsis_odeme ON public.islem_tahsis (odeme_islem_id);
CREATE INDEX IF NOT EXISTS idx_islem_tahsis_cari  ON public.islem_tahsis (isletme_id, cari_id);

ALTER TABLE public.islem_tahsis ENABLE ROW LEVEL SECURITY;

-- SELECT: owner VEYA islemler modüllü aktif üye. WRITE policy YOK (bilinçli):
-- tek yazma yolu SECURITY DEFINER RPC'ler → invariant'lar tek noktada korunur.
DROP POLICY IF EXISTS "islem_tahsis_select" ON public.islem_tahsis;
CREATE POLICY "islem_tahsis_select" ON public.islem_tahsis
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.isletmeler isl
      WHERE isl.id = islem_tahsis.isletme_id AND isl.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.isletme_users iu
      WHERE iu.isletme_id = islem_tahsis.isletme_id
        AND iu.user_id = auth.uid()
        AND iu.status = 'active'
        AND COALESCE((iu.permissions->'modules'->>'islemler')::boolean, false)
    )
  );

-- -----------------------------------------------------------------------------
-- 2) Yardımcılar + FIFO motoru (İÇ fonksiyonlar — client'tan çağrılamaz)
-- -----------------------------------------------------------------------------

-- Ödeme-tipli işlemin kapatabileceği borç tipleri (NULL = tahsis-dışı tip).
CREATE OR REPLACE FUNCTION public.tahsis_borc_tipleri(p_odeme_type text)
RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_odeme_type
    WHEN 'cari_tahsilat'   THEN ARRAY['cari_satis']
    WHEN 'cari_satis_iade' THEN ARRAY['cari_satis']
    WHEN 'cari_odeme'      THEN ARRAY['cari_alis']
    WHEN 'cari_alis_iade'  THEN ARRAY['cari_alis']
    ELSE NULL
  END
$$;

-- İşlemin CARİ tarafındaki tutarı (computeBalanceOps aynası — islemBalanceOps.ts):
-- alis/satis/iadeler HAM amount; odeme/tahsilat converted (TRY-referanslı kur).
CREATE OR REPLACE FUNCTION public.tahsis_cari_etki(
  p_type text, p_amount numeric, p_rate numeric, p_src text, p_tgt text
) RETURNS numeric LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_type IN ('cari_odeme', 'cari_tahsilat') THEN
      CASE
        WHEN COALESCE(p_src, 'TRY') = COALESCE(p_tgt, 'TRY') THEN round(p_amount, 2)
        WHEN p_rate IS NULL OR p_rate <= 0                   THEN round(p_amount, 2)
        WHEN COALESCE(p_src, 'TRY') = 'TRY'                  THEN round(p_amount / p_rate, 2)
        ELSE round(p_amount * p_rate, 2)
      END
    ELSE round(p_amount, 2)
  END
$$;

-- FIFO dağıtım çekirdeği: p_tutar'ı carinin açık vadeli borçlarına dağıtır.
-- Dönüş: tahsis EDİLEMEYEN kısım (avans). src/lib/fifoTahsis.ts ile aynı kurallar.
CREATE OR REPLACE FUNCTION public.fifo_tahsis_dagit(
  p_isletme_id uuid,
  p_cari_id uuid,
  p_odeme_islem_id uuid,
  p_odeme_type text,
  p_tutar numeric,
  p_hedef_borc uuid DEFAULT NULL,   -- önce buna tahsis (plan §3.1), artan FIFO
  p_exclude_borc uuid DEFAULT NULL  -- silinmekte olan borç yeniden dolmasın
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

  -- Cari-bazlı serileştirme (aynı transaction içinde reentrant).
  PERFORM pg_advisory_xact_lock(hashtextextended(p_cari_id::text, 42));

  -- Para birimi: AYRI filtre yok — BİLİNÇLİ. cari_id-scoping örtük aynı-para garantisi
  -- verir: cariler.currency tek/sabittir, alis/satis borçları HAM (cari parasında),
  -- odeme/tahsilat cari-etkisi converted (cari parasına). Faz 3'te (taksit/çoklu-para)
  -- bu varsayım değişirse buraya AÇIK currency filtresi eklenmeli (TS aynası
  -- fifoTahsis.ts zaten taşıyor). [İnceleme bulgusu #2 — belgelendi]
  FOR v_borc IN
    SELECT i.id, i.amount
    FROM islemler i
    WHERE i.isletme_id = p_isletme_id
      AND i.cari_id = p_cari_id
      AND i.type = ANY (v_borc_tipleri)
      AND i.vade_tarihi IS NOT NULL         -- OPT-IN sınırı: yalnız vadeli borçlar
      AND i.id <> p_odeme_islem_id
      AND (p_exclude_borc IS NULL OR i.id <> p_exclude_borc)
    ORDER BY (i.id = p_hedef_borc) DESC, i.vade_tarihi ASC, i.created_at ASC, i.id ASC
  LOOP
    EXIT WHEN v_kalan_odeme <= 0;

    SELECT round(v_borc.amount - COALESCE(SUM(t.tutar), 0), 2) INTO v_borc_kalan
    FROM islem_tahsis t WHERE t.borc_islem_id = v_borc.id;

    CONTINUE WHEN v_borc_kalan <= 0;

    v_pay := LEAST(v_kalan_odeme, v_borc_kalan);
    INSERT INTO islem_tahsis (isletme_id, cari_id, borc_islem_id, odeme_islem_id, tutar)
    VALUES (p_isletme_id, p_cari_id, v_borc.id, p_odeme_islem_id, v_pay);

    v_kalan_odeme := round(v_kalan_odeme - v_pay, 2);
  END LOOP;

  RETURN v_kalan_odeme;
END;
$function$;

-- Ödemenin tahsis toplamını cari-etki hedefine EŞİTLER (create + update tek yol):
-- eksikse FIFO ile tamamlar, fazlaysa EN YENİ tahsisten kırpar (eski vadeler korunur).
CREATE OR REPLACE FUNCTION public.tahsis_odeme_esitle(
  p_isletme_id uuid,
  p_odeme_islem_id uuid,
  p_hedef_borc uuid DEFAULT NULL
) RETURNS numeric  -- avans (bilgi amaçlı)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_i islemler%ROWTYPE;
  v_hedef numeric;
  v_mevcut numeric;
  v_fark numeric;
  v_row record;
  v_kes numeric;
BEGIN
  SELECT * INTO v_i FROM islemler WHERE id = p_odeme_islem_id AND isletme_id = p_isletme_id;
  IF NOT FOUND OR v_i.cari_id IS NULL OR public.tahsis_borc_tipleri(v_i.type) IS NULL THEN
    RETURN 0;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_i.cari_id::text, 42));

  v_hedef := public.tahsis_cari_etki(v_i.type, v_i.amount, v_i.exchange_rate,
                                     v_i.source_currency, v_i.target_currency);
  SELECT COALESCE(SUM(tutar), 0) INTO v_mevcut
  FROM islem_tahsis WHERE odeme_islem_id = p_odeme_islem_id;

  v_fark := round(v_hedef - v_mevcut, 2);

  IF v_fark > 0 THEN
    RETURN public.fifo_tahsis_dagit(p_isletme_id, v_i.cari_id, p_odeme_islem_id,
                                    v_i.type, v_fark, p_hedef_borc, NULL);
  ELSIF v_fark < 0 THEN
    v_kes := -v_fark;
    FOR v_row IN
      SELECT id, tutar FROM islem_tahsis
      WHERE odeme_islem_id = p_odeme_islem_id
      ORDER BY created_at DESC, id DESC
    LOOP
      EXIT WHEN v_kes <= 0;
      IF v_row.tutar <= v_kes THEN
        DELETE FROM islem_tahsis WHERE id = v_row.id;
        v_kes := round(v_kes - v_row.tutar, 2);
      ELSE
        UPDATE islem_tahsis SET tutar = round(tutar - v_kes, 2) WHERE id = v_row.id;
        v_kes := 0;
      END IF;
    END LOOP;
  END IF;

  RETURN 0;
END;
$function$;

-- Borcun TÜM tahsislerini boşaltır; serbest kalan ödeme tutarlarını (YALNIZ
-- serbest kalan kısım — plan §6.2, avans süpürme YOK) diğer açık borçlara
-- yeniden FIFO dağıtır. p_exclude_borc: silinmekte olan borç yeniden dolmasın.
CREATE OR REPLACE FUNCTION public.tahsis_borc_bosalt_ve_dagit(
  p_isletme_id uuid,
  p_borc_islem_id uuid,
  p_exclude_borc uuid DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_o record;
  v_cari_id uuid;
BEGIN
  -- Kilidi EN BAŞTA al (okuma+silme fazı dahil) — çifte-tahsis penceresi hiç açılmasın
  -- [inceleme bulgusu #1]. cari_id borç satırından; satır silinmişse tahsislerden.
  SELECT cari_id INTO v_cari_id FROM islemler WHERE id = p_borc_islem_id AND isletme_id = p_isletme_id;
  IF v_cari_id IS NULL THEN
    SELECT cari_id INTO v_cari_id FROM islem_tahsis
    WHERE borc_islem_id = p_borc_islem_id AND isletme_id = p_isletme_id LIMIT 1;
  END IF;
  IF v_cari_id IS NULL THEN RETURN; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_cari_id::text, 42));

  DROP TABLE IF EXISTS _tahsis_freed;
  CREATE TEMP TABLE _tahsis_freed ON COMMIT DROP AS
  SELECT t.odeme_islem_id, round(SUM(t.tutar), 2) AS freed,
         i.type AS odeme_type, i.cari_id, i.date AS odeme_date, i.created_at
  FROM islem_tahsis t
  JOIN islemler i ON i.id = t.odeme_islem_id
  WHERE t.borc_islem_id = p_borc_islem_id AND t.isletme_id = p_isletme_id
  GROUP BY t.odeme_islem_id, i.type, i.cari_id, i.date, i.created_at;

  DELETE FROM islem_tahsis
  WHERE borc_islem_id = p_borc_islem_id AND isletme_id = p_isletme_id;

  -- Eski ödemeden yeniye: serbest kalan tutar diğer açık borçlara FIFO.
  FOR v_o IN SELECT * FROM _tahsis_freed ORDER BY odeme_date ASC, created_at ASC LOOP
    PERFORM public.fifo_tahsis_dagit(p_isletme_id, v_o.cari_id, v_o.odeme_islem_id,
                                     v_o.odeme_type, v_o.freed, NULL, p_exclude_borc);
  END LOOP;

  DROP TABLE IF EXISTS _tahsis_freed;
END;
$function$;

-- Borç tutarı Σtahsis'in ALTINA düştüyse: en yeni tahsisten kırp (kalan ≥ 0
-- invariantı) + serbest kalan ödeme tutarlarını diğer açık borçlara FIFO dağıt.
CREATE OR REPLACE FUNCTION public.tahsis_borc_kirp_ve_dagit(
  p_isletme_id uuid,
  p_borc_islem_id uuid
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_amount numeric;
  v_fazla numeric;
  v_row record;
  v_kes numeric;
  v_o record;
  v_cari_id uuid;
BEGIN
  SELECT round(amount, 2), cari_id INTO v_amount, v_cari_id
  FROM islemler WHERE id = p_borc_islem_id AND isletme_id = p_isletme_id;
  IF NOT FOUND OR v_cari_id IS NULL THEN RETURN; END IF;

  -- Kilidi kırpma fazından ÖNCE al [inceleme bulgusu #1].
  PERFORM pg_advisory_xact_lock(hashtextextended(v_cari_id::text, 42));

  SELECT round(COALESCE(SUM(tutar), 0) - v_amount, 2) INTO v_fazla
  FROM islem_tahsis WHERE borc_islem_id = p_borc_islem_id;
  IF v_fazla <= 0 THEN RETURN; END IF;

  DROP TABLE IF EXISTS _tahsis_freed;
  CREATE TEMP TABLE _tahsis_freed (odeme_islem_id uuid, freed numeric) ON COMMIT DROP;

  FOR v_row IN
    SELECT id, tutar, odeme_islem_id FROM islem_tahsis
    WHERE borc_islem_id = p_borc_islem_id
    ORDER BY created_at DESC, id DESC
  LOOP
    EXIT WHEN v_fazla <= 0;
    v_kes := LEAST(v_row.tutar, v_fazla);
    IF v_kes >= v_row.tutar THEN
      DELETE FROM islem_tahsis WHERE id = v_row.id;
    ELSE
      UPDATE islem_tahsis SET tutar = round(tutar - v_kes, 2) WHERE id = v_row.id;
    END IF;
    INSERT INTO _tahsis_freed VALUES (v_row.odeme_islem_id, v_kes);
    v_fazla := round(v_fazla - v_kes, 2);
  END LOOP;

  FOR v_o IN
    SELECT f.odeme_islem_id, round(SUM(f.freed), 2) AS freed, i.type AS odeme_type, i.cari_id
    FROM _tahsis_freed f JOIN islemler i ON i.id = f.odeme_islem_id
    GROUP BY f.odeme_islem_id, i.type, i.cari_id, i.date, i.created_at
    ORDER BY i.date ASC, i.created_at ASC
  LOOP
    PERFORM public.fifo_tahsis_dagit(p_isletme_id, v_o.cari_id, v_o.odeme_islem_id,
                                     v_o.odeme_type, v_o.freed, NULL, NULL);
  END LOOP;

  DROP TABLE IF EXISTS _tahsis_freed;
END;
$function$;

-- İç fonksiyonlar: client asla doğrudan çağıramaz (anon-REVOKE hijyeni — 14 Tem denetimi).
REVOKE EXECUTE ON FUNCTION public.tahsis_borc_tipleri(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tahsis_cari_etki(text, numeric, numeric, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fifo_tahsis_dagit(uuid, uuid, uuid, text, numeric, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tahsis_odeme_esitle(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tahsis_borc_bosalt_ve_dagit(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tahsis_borc_kirp_ve_dagit(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 3) create_islem_atomik — gövde 20260719120000 ile AYNI + oto-FIFO bloğu.
--    İmza DEĞİŞMEZ; idempotent retry'da (v_rowcount=0) tahsis de tekrarlanmaz.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_islem_atomik(
  p_isletme_id uuid,
  p_new_row jsonb,
  p_balance_ops jsonb
)
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

    -- FAZ 2: ödeme-tipli işlem → carinin açık vadeli borçlarına oto-FIFO tahsis.
    -- Bakiyeye DOKUNMAZ; açık borç yoksa no-op (avans). Borç-tipli işlemde tahsis
    -- YAPILMAZ (geçmiş avanslar retro dağıtılmaz — plan "backfill yok" ilkesi).
    IF r.cari_id IS NOT NULL AND public.tahsis_borc_tipleri(r.type) IS NOT NULL THEN
      PERFORM public.tahsis_odeme_esitle(p_isletme_id, v_id, NULL);
    END IF;
  END IF;

  SELECT to_jsonb(i) INTO v_result FROM islemler i WHERE i.id = v_id AND i.isletme_id = p_isletme_id;
  IF v_result IS NULL THEN
    RAISE EXCEPTION 'create_islem_atomik: islem bulunamadi (id: %)', v_id;
  END IF;
  RETURN v_result;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.create_islem_atomik(uuid, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_islem_atomik(uuid, jsonb, jsonb) TO authenticated;

-- -----------------------------------------------------------------------------
-- 4) create_islem_with_urun_atomik — aynı oto-FIFO bloğu (gövde 20260719120000 + blok).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_islem_with_urun_atomik(
  p_isletme_id uuid,
  p_new_row jsonb,
  p_balance_ops jsonb,
  p_items jsonb
)
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

    -- FAZ 2: oto-FIFO (yukarıdaki create_islem_atomik ile aynı blok).
    IF r.cari_id IS NOT NULL AND public.tahsis_borc_tipleri(r.type) IS NOT NULL THEN
      PERFORM public.tahsis_odeme_esitle(p_isletme_id, v_id, NULL);
    END IF;
  END IF;

  SELECT to_jsonb(i) INTO v_result FROM islemler i WHERE i.id = v_id AND i.isletme_id = p_isletme_id;
  IF v_result IS NULL THEN
    RAISE EXCEPTION 'create_islem_with_urun_atomik: islem bulunamadi (id: %)', v_id;
  END IF;
  RETURN v_result;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.create_islem_with_urun_atomik(uuid, jsonb, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_islem_with_urun_atomik(uuid, jsonb, jsonb, jsonb) TO authenticated;

-- -----------------------------------------------------------------------------
-- 5) update_islem_atomik — gövde 20260719120000 ile AYNI + tahsis-farkındalık.
--    Değişim matrisi (plan §6.2):
--      ödeme: tip/cari değişti → eski tahsisleri sil; yeni hâli ödeme ise eşitle
--             (tutar ↑ = FIFO tamamla, tutar ↓ = en yeni tahsisten kırp)
--      borç:  tip/cari değişti VEYA vade silindi → boşalt + serbest ödemeleri dağıt
--             tutar ↓ (Σtahsis altına) → kırp + serbest ödemeleri dağıt
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
    -- ANAHTAR-VARLIĞI GUARD'I (Fable): p_new_row'da 'vade_tarihi' anahtarı VARSA (açık null
    -- dahil) onu kullan; YOKSA mevcut değeri KORU → anahtarı göndermeyen client vade'yi SESSİZCE
    -- SİLMEZ. (Mevcut update yolu p_new_row'u SELECT * mergedRow'dan kurduğu için anahtarı zaten
    -- taşır; guard ek emniyet: yeni-client'ın vade'yi undefined bırakıp JSON'un anahtarı
    -- düşürmesine + gelecekteki partial-row yollarına karşı.) islemler.vade_tarihi = eski değer.
    vade_tarihi     = CASE WHEN p_new_row ? 'vade_tarihi'
                          THEN r.vade_tarihi
                          ELSE islemler.vade_tarihi END
  WHERE id = p_islem_id AND isletme_id = p_isletme_id;

  SELECT * INTO v_new FROM islemler WHERE id = p_islem_id AND isletme_id = p_isletme_id;

  -- ===== FAZ 2: tahsis-farkındalık (bakiye ops'larından TAMAMEN bağımsız) =====

  -- (a) İşlem ödeme rolündeyse: tip/cari değişimi eski tahsisleri geçersiz kılar.
  IF public.tahsis_borc_tipleri(v_old.type) IS NOT NULL
     AND (v_new.type IS DISTINCT FROM v_old.type OR v_new.cari_id IS DISTINCT FROM v_old.cari_id) THEN
    DELETE FROM islem_tahsis WHERE odeme_islem_id = p_islem_id AND isletme_id = p_isletme_id;
  END IF;

  -- Yeni hâli ödeme-tipli ise tahsis toplamını cari-etkiye eşitle (↑ FIFO, ↓ kırp).
  IF v_new.cari_id IS NOT NULL AND public.tahsis_borc_tipleri(v_new.type) IS NOT NULL THEN
    PERFORM public.tahsis_odeme_esitle(p_isletme_id, p_islem_id, NULL);
  END IF;

  -- (b) İşlem borç rolünde tahsis taşıyorsa:
  IF EXISTS (SELECT 1 FROM islem_tahsis WHERE borc_islem_id = p_islem_id) THEN
    IF v_new.type IS DISTINCT FROM v_old.type
       OR v_new.cari_id IS DISTINCT FROM v_old.cari_id
       OR v_new.vade_tarihi IS NULL THEN
      -- Artık bu defterin borcu değil (tip/cari değişti ya da vade kaldırıldı):
      -- boşalt + serbest kalan ödeme tutarlarını ESKİ carinin açık borçlarına dağıt.
      PERFORM public.tahsis_borc_bosalt_ve_dagit(p_isletme_id, p_islem_id, NULL);
    ELSE
      -- Tutar Σtahsis'in altına düştüyse kırp + serbest kalanı dağıt (değilse no-op).
      PERFORM public.tahsis_borc_kirp_ve_dagit(p_isletme_id, p_islem_id);
    END IF;
  END IF;

  SELECT to_jsonb(i) INTO v_result FROM islemler i WHERE i.id = p_islem_id AND i.isletme_id = p_isletme_id;
  RETURN v_result;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.update_islem_atomik(uuid, uuid, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_islem_atomik(uuid, uuid, jsonb, jsonb) TO authenticated;

-- -----------------------------------------------------------------------------
-- 6) delete_islem_atomik — gövde 20260716030000 ile AYNI + tahsis-farkındalık.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_islem_atomik(
  p_isletme_id uuid,
  p_islem_id uuid,
  p_balance_ops jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  op jsonb;
  v_h record;
  v_created_by uuid;
BEGIN
  IF NOT public.user_has_isletme_access(p_isletme_id) THEN
    RAISE EXCEPTION 'Yetkisiz erisim' USING ERRCODE = '42501';
  END IF;

  SELECT created_by INTO v_created_by
  FROM islemler WHERE id = p_islem_id AND isletme_id = p_isletme_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Islem bulunamadi veya bu isletmeye ait degil (islem_id: %)', p_islem_id;
  END IF;

  IF NOT public.user_can_islem_action(p_isletme_id, 'delete', v_created_by) THEN
    RAISE EXCEPTION 'Bu islemi silme yetkiniz yok' USING ERRCODE = '42501';
  END IF;

  -- 0. FAZ 2 — tahsis-farkındalık (plan §6.2), islemler satırı silinmeden ÖNCE:
  --    a) Ödeme silme → tahsisleri sil (borçların kalanı otomatik yeniden açılır).
  DELETE FROM islem_tahsis WHERE odeme_islem_id = p_islem_id AND isletme_id = p_isletme_id;
  --    b) Borç silme → tahsisleri boşalt + serbest kalan ödeme tutarlarını diğer
  --       açık borçlara yeniden FIFO dağıt (silinmekte olan borç HARİÇ). Tahsis
  --       yoksa her iki adım da no-op — vadesiz/vade-dışı işlemde sıfır etki.
  PERFORM public.tahsis_borc_bosalt_ve_dagit(p_isletme_id, p_islem_id, p_islem_id);

  -- 1. Bakiye geri-alma ops'lari
  FOR op IN SELECT * FROM jsonb_array_elements(COALESCE(p_balance_ops, '[]'::jsonb))
  LOOP
    PERFORM public.increment_balance(op->>'t', (op->>'id')::uuid, (op->>'d')::numeric);
  END LOOP;

  -- 2. Bagli urun hareketlerinin stok etkisini geri al (INLINE; update_urun_miktar ile
  --    ayni matematik: giris'i geri sar = -ABS, cikis'i geri sar = +ABS). Bu bir sistem
  --    temizligidir (silinen islemin yan etkisini geri alir), ayri urun yetkisi gerektirmez.
  FOR v_h IN
    SELECT urun_id, hareket_tipi, miktar
    FROM urun_hareketler
    WHERE islem_id = p_islem_id AND isletme_id = p_isletme_id
  LOOP
    UPDATE urunler
    SET miktar = miktar + CASE
          WHEN v_h.hareket_tipi = 'giris' THEN -ABS(v_h.miktar)
          WHEN v_h.hareket_tipi = 'cikis' THEN  ABS(v_h.miktar)
          ELSE -v_h.miktar
        END,
        updated_at = NOW()
    WHERE id = v_h.urun_id AND isletme_id = p_isletme_id;
  END LOOP;

  -- 3. Urun hareketlerini sil
  DELETE FROM urun_hareketler WHERE islem_id = p_islem_id AND isletme_id = p_isletme_id;

  -- 4. Islemi sil
  DELETE FROM islemler WHERE id = p_islem_id AND isletme_id = p_isletme_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.delete_islem_atomik(uuid, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_islem_atomik(uuid, uuid, jsonb) TO authenticated;

-- -----------------------------------------------------------------------------
-- 7) retahsis_odeme — düzeltme yolu BAŞTAN (plan karar #3): bir ödemenin tüm
--    tahsislerini söker, opsiyonel hedef borca öncelik vererek yeniden FIFO dağıtır.
--    Balance'a dokunmaz → yanlış tahsis para kaybettirmez, her zaman düzeltilebilir.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.retahsis_odeme(
  p_isletme_id uuid,
  p_odeme_islem_id uuid,
  p_hedef_borc uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_i islemler%ROWTYPE;
  v_avans numeric;
  v_adet integer;
BEGIN
  IF NOT public.user_has_isletme_access(p_isletme_id) THEN
    RAISE EXCEPTION 'Yetkisiz erisim' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_i FROM islemler WHERE id = p_odeme_islem_id AND isletme_id = p_isletme_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Islem bulunamadi veya bu isletmeye ait degil (islem_id: %)', p_odeme_islem_id;
  END IF;
  IF NOT public.user_can_islem_action(p_isletme_id, 'update', v_i.created_by) THEN
    RAISE EXCEPTION 'Bu islemi guncelleme yetkiniz yok' USING ERRCODE = '42501';
  END IF;
  IF v_i.cari_id IS NULL OR public.tahsis_borc_tipleri(v_i.type) IS NULL THEN
    RAISE EXCEPTION 'retahsis yalniz cari odeme/tahsilat/iade islemlerinde gecerli (type: %)', v_i.type;
  END IF;
  -- Hedef borç verildiyse aynı işletme + aynı cariye ait olmalı (çapraz-kiracı guard).
  IF p_hedef_borc IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM islemler b
    WHERE b.id = p_hedef_borc AND b.isletme_id = p_isletme_id AND b.cari_id = v_i.cari_id
  ) THEN
    RAISE EXCEPTION 'Hedef borc bulunamadi veya bu cariye ait degil' USING ERRCODE = '42501';
  END IF;

  DELETE FROM islem_tahsis WHERE odeme_islem_id = p_odeme_islem_id AND isletme_id = p_isletme_id;
  v_avans := public.tahsis_odeme_esitle(p_isletme_id, p_odeme_islem_id, p_hedef_borc);

  SELECT COUNT(*) INTO v_adet FROM islem_tahsis WHERE odeme_islem_id = p_odeme_islem_id;
  RETURN jsonb_build_object('tahsis_adet', v_adet, 'avans', v_avans);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.retahsis_odeme(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.retahsis_odeme(uuid, uuid, uuid) TO authenticated;

-- -----------------------------------------------------------------------------
-- 8) get_vade_ozet — dashboard/V.G. özeti (para birimi bazında; karışık toplam YOK —
--    Net Varlık çapraz-para artefakt dersi). Bugün = TR yereli (islemler.date TR-local).
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

  WITH acik AS (
    SELECT
      i.type,
      i.vade_tarihi,
      COALESCE(c.currency, 'TRY') AS currency,
      round(i.amount - COALESCE((
        SELECT SUM(t.tutar) FROM islem_tahsis t WHERE t.borc_islem_id = i.id
      ), 0), 2) AS kalan
    FROM islemler i
    JOIN cariler c ON c.id = i.cari_id
    WHERE i.isletme_id = p_isletme_id
      AND i.vade_tarihi IS NOT NULL
      AND i.type IN ('cari_satis', 'cari_alis')
  )
  SELECT COALESCE(jsonb_agg(x ORDER BY x->>'currency'), '[]'::jsonb) INTO v_result
  FROM (
    SELECT jsonb_build_object(
      'currency', currency,
      -- Gecikmiş = BUGÜN DAHİL (cari detay listesindeki daysUntil<=0 kuralıyla aynı).
      'gecikmis_alacak',      SUM(kalan) FILTER (WHERE type = 'cari_satis' AND vade_tarihi <= v_bugun),
      'gecikmis_alacak_adet', COUNT(*)   FILTER (WHERE type = 'cari_satis' AND vade_tarihi <= v_bugun),
      'gecikmis_borc',        SUM(kalan) FILTER (WHERE type = 'cari_alis'  AND vade_tarihi <= v_bugun),
      'gecikmis_borc_adet',   COUNT(*)   FILTER (WHERE type = 'cari_alis'  AND vade_tarihi <= v_bugun),
      'yaklasan_alacak',      SUM(kalan) FILTER (WHERE type = 'cari_satis' AND vade_tarihi >  v_bugun AND vade_tarihi <= v_bugun + 7),
      'yaklasan_borc',        SUM(kalan) FILTER (WHERE type = 'cari_alis'  AND vade_tarihi >  v_bugun AND vade_tarihi <= v_bugun + 7)
    ) AS x
    FROM acik
    WHERE kalan > 0
    GROUP BY currency
  ) s;

  RETURN v_result;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_vade_ozet(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_vade_ozet(uuid) TO authenticated;
