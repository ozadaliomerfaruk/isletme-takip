-- Taksit sayısı üst sınırı 48 → 120 (kullanıcı kararı, 31 Tem 2026).
--
-- Data safety:
--   * hiçbir kullanıcı satırı eklenmez/güncellenmez/silinmez, backfill yok;
--   * yalnız İZİN GENİŞLETME: mevcut tüm satırlar (≤48) yeni CHECK'i zaten
--     sağlar, eski istemcilerin gönderebildiği hiçbir payload reddedilmeye
--     BAŞLAMAZ — davranış değişikliği sadece 49..120 aralığının kabulüdür;
--   * fonksiyon imzası değişmez; gövde cerrahi string-replace + drift-guard
--     ile değiştirilir (canlı tanım beklenenden farklıysa migration DURUR).
--
-- Eski istemci (1.5.6/1.5.7) ne yaşar?
--   Hiçbir şey değişmez: eski istemcilerin taksit UI'ı zaten 2–48 üretir;
--   48'e kadar olan planlar aynen kabul edilmeye devam eder. 120'ye kadar
--   plan yalnız yeni istemci UI'ından gelebilir.

BEGIN;

SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '60s';

-- 1) Tablo CHECK'i: 2..48 → 2..120.
DO $constraint$
DECLARE
  v_def text;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(oid)
  INTO v_def
  FROM pg_catalog.pg_constraint
  WHERE conrelid = 'public.taksit_planlari'::regclass
    AND conname = 'taksit_planlari_taksit_adedi_check';

  IF v_def IS DISTINCT FROM
     'CHECK (((taksit_adedi >= 2) AND (taksit_adedi <= 48)))' THEN
    RAISE EXCEPTION
      'TAKSIT_MAX_120_CONSTRAINT_DRIFT: beklenmeyen tanım: %', v_def;
  END IF;

  ALTER TABLE public.taksit_planlari
    DROP CONSTRAINT taksit_planlari_taksit_adedi_check;
  ALTER TABLE public.taksit_planlari
    ADD CONSTRAINT taksit_planlari_taksit_adedi_check
    CHECK (taksit_adedi >= 2 AND taksit_adedi <= 120);
END;
$constraint$;

-- 2) taksit_plani_olustur: v_count üst sınırı 48 → 120 (drift-guard'lı).
DO $fn$
DECLARE
  v_oid oid;
  v_def text;
  v_target constant text := 'IF v_count < 2 OR v_count > 48 THEN';
  v_replacement constant text := 'IF v_count < 2 OR v_count > 120 THEN';
BEGIN
  SELECT p.oid
  INTO STRICT v_oid
  FROM pg_catalog.pg_proc AS p
  JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'taksit_plani_olustur';

  v_def := pg_catalog.pg_get_functiondef(v_oid);

  IF (pg_catalog.length(v_def)
      - pg_catalog.length(pg_catalog.replace(v_def, v_target, '')))
     / pg_catalog.length(v_target) <> 1 THEN
    RAISE EXCEPTION
      'TAKSIT_MAX_120_FUNCTION_DRIFT: hedef satır tam 1 kez bulunmalıydı';
  END IF;

  EXECUTE pg_catalog.replace(v_def, v_target, v_replacement);
END;
$fn$;

COMMIT;
