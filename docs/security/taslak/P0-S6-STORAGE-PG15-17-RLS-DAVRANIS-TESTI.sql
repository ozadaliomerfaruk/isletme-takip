-- =============================================================================
-- P0-S6B RESTRICTIVE RLS DAVRANIS TESTI -- PostgreSQL 15 ve 17
-- =============================================================================
-- Tamamen izole/sentetik bir tablo kurar; uygulama tablolarina dokunmaz.
-- Kabul: son satir `P0_S6_RESTRICTIVE_RLS_OK|<server version>`.
--
--   psql -v ON_ERROR_STOP=1 -f P0-S6-STORAGE-PG15-17-RLS-DAVRANIS-TESTI.sql
-- =============================================================================

\set ON_ERROR_STOP on

BEGIN;

CREATE ROLE p0s6_actor NOLOGIN;
CREATE SCHEMA p0s6_test;

CREATE TABLE p0s6_test.objects (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  bucket_id text NOT NULL,
  name text NOT NULL,
  owner_id text,
  marker integer NOT NULL DEFAULT 0
);

-- Migrationdaki parser govdesinin izole kopyasi: PG15/17 derleme + davranis.
CREATE FUNCTION p0s6_test.storage_photo_path_parse_v1(p_name text)
RETURNS TABLE (
  isletme_id uuid,
  kayit_turu text,
  kayit_id uuid
)
LANGUAGE sql
IMMUTABLE
STRICT
PARALLEL SAFE
SECURITY INVOKER
SET search_path TO 'pg_catalog'
AS $function$
  WITH parsed AS (
    SELECT pg_catalog.regexp_match(
      p_name,
      '^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/(?:(notlar)/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})|([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}))_[0-9]{10,20}[.]webp$'
    ) AS parts
  )
  SELECT
    (parsed.parts)[1]::uuid,
    CASE
      WHEN (parsed.parts)[2] = 'notlar' THEN 'not'::text
      ELSE 'islem'::text
    END,
    COALESCE((parsed.parts)[3], (parsed.parts)[4])::uuid
  FROM parsed
  WHERE parsed.parts IS NOT NULL
$function$;

ALTER TABLE p0s6_test.objects ENABLE ROW LEVEL SECURITY;
GRANT USAGE ON SCHEMA p0s6_test TO p0s6_actor;
GRANT SELECT, INSERT, UPDATE, DELETE
ON p0s6_test.objects TO p0s6_actor;
GRANT USAGE, SELECT
ON SEQUENCE p0s6_test.objects_id_seq TO p0s6_actor;

-- Mevcut Storage politikalarini temsil eden genis permissive katman.
CREATE POLICY permissive_select_a
ON p0s6_test.objects
AS PERMISSIVE
FOR SELECT
TO p0s6_actor
USING (true);

-- Iki permissive policy OR olur; bu false dal erisimi daraltamaz.
CREATE POLICY permissive_select_b
ON p0s6_test.objects
AS PERMISSIVE
FOR SELECT
TO p0s6_actor
USING (false);

CREATE POLICY permissive_insert
ON p0s6_test.objects
AS PERMISSIVE
FOR INSERT
TO p0s6_actor
WITH CHECK (true);

CREATE POLICY permissive_update
ON p0s6_test.objects
AS PERMISSIVE
FOR UPDATE
TO p0s6_actor
USING (true)
WITH CHECK (true);

CREATE POLICY permissive_delete
ON p0s6_test.objects
AS PERMISSIVE
FOR DELETE
TO p0s6_actor
USING (true);

-- P0-S6B kalibi: diger bucket TRUE, islem-photos UPDATE her zaman false.
CREATE POLICY restrictive_update
ON p0s6_test.objects
AS RESTRICTIVE
FOR UPDATE
TO p0s6_actor
USING (bucket_id <> 'islem-photos')
WITH CHECK (bucket_id <> 'islem-photos');

-- Islem branch true; not branch ayri kapidan gecmek zorunda.
CREATE POLICY restrictive_select
ON p0s6_test.objects
AS RESTRICTIVE
FOR SELECT
TO p0s6_actor
USING (
  bucket_id <> 'islem-photos'
  OR name LIKE 'tx/%'
  OR (
    name LIKE 'not/%'
    AND (
      -- Pointerli + RLS-gorunur not VEYA pointer-gone cleanup principal'i.
      current_setting('p0s6.note_select', true) = 'on'
      OR (
        current_setting('p0s6.note_delete', true) = 'on'
        AND owner_id = current_user
      )
      OR current_setting('p0s6.business_owner', true) = 'on'
    )
  )
);

CREATE POLICY restrictive_delete
ON p0s6_test.objects
AS RESTRICTIVE
FOR DELETE
TO p0s6_actor
USING (
  bucket_id <> 'islem-photos'
  OR name LIKE 'tx/%'
  OR (
    name LIKE 'not/%'
    AND (
      (
        current_setting('p0s6.note_delete', true) = 'on'
        AND owner_id = current_user
      )
      OR current_setting('p0s6.business_owner', true) = 'on'
    )
  )
);

CREATE POLICY restrictive_insert
ON p0s6_test.objects
AS RESTRICTIVE
FOR INSERT
TO p0s6_actor
WITH CHECK (
  bucket_id <> 'islem-photos'
  OR (
    owner_id = current_user
    AND name ~ '^(tx|not)/[0-9]+[.]webp$'
  )
);

INSERT INTO p0s6_test.objects (bucket_id, name, owner_id)
VALUES
  ('islem-photos', 'tx/1.webp', 'p0s6_actor'),
  ('islem-photos', 'not/2.webp', 'p0s6_actor'),
  ('islem-photos', 'not/peer.webp', 'peer_actor'),
  ('other-bucket', 'anything', 'someone');

DO $assert_parser$
DECLARE
  v_row record;
  v_count integer;
BEGIN
  SELECT * INTO STRICT v_row
  FROM p0s6_test.storage_photo_path_parse_v1(
    '11111111-1111-1111-1111-111111111111/'
    || '22222222-2222-2222-2222-222222222222_1722250000000.webp'
  );
  IF v_row.isletme_id <> '11111111-1111-1111-1111-111111111111'::uuid
     OR v_row.kayit_turu <> 'islem'
     OR v_row.kayit_id <> '22222222-2222-2222-2222-222222222222'::uuid
  THEN
    RAISE EXCEPTION 'islem parser sonucu yanlis: %', v_row;
  END IF;

  SELECT * INTO STRICT v_row
  FROM p0s6_test.storage_photo_path_parse_v1(
    '11111111-1111-1111-1111-111111111111/notlar/'
    || '33333333-3333-3333-3333-333333333333_1722250000000.webp'
  );
  IF v_row.kayit_turu <> 'not'
     OR v_row.kayit_id <> '33333333-3333-3333-3333-333333333333'::uuid
  THEN
    RAISE EXCEPTION 'not parser sonucu yanlis: %', v_row;
  END IF;

  SELECT count(*) INTO v_count
  FROM p0s6_test.storage_photo_path_parse_v1(
    '11111111-1111-1111-1111-111111111111/notlar/traversal.webp'
  );
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'malformed parser yolu kabul edildi';
  END IF;
END;
$assert_parser$;

SET LOCAL ROLE p0s6_actor;
SELECT set_config('p0s6.note_select', 'off', true);
SELECT set_config('p0s6.note_delete', 'off', true);
SELECT set_config('p0s6.business_owner', 'off', true);
SELECT set_config('p0s6.note_update_all', 'off', true);

DO $assert_initial$
DECLARE
  v_count integer;
  v_rows integer;
  v_returned_id integer;
BEGIN
  SELECT count(*) INTO v_count FROM p0s6_test.objects;
  IF v_count <> 2 THEN
    RAISE EXCEPTION
      'RESTRICTIVE SELECT AND basarisiz; beklenen 2, bulunan %',
      v_count;
  END IF;

  UPDATE p0s6_test.objects
  SET marker = marker + 1
  WHERE bucket_id = 'islem-photos';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN
    RAISE EXCEPTION
      'islem-photos RESTRICTIVE UPDATE deny basarisiz: %',
      v_rows;
  END IF;

  UPDATE p0s6_test.objects
  SET marker = marker + 1
  WHERE bucket_id = 'other-bucket';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION
      'diger bucket UPDATE etkilenmemeli; bulunan %',
      v_rows;
  END IF;

  INSERT INTO p0s6_test.objects (bucket_id, name, owner_id)
  VALUES ('islem-photos', 'tx/3.webp', current_user)
  RETURNING id INTO v_returned_id;

  IF v_returned_id IS NULL THEN
    RAISE EXCEPTION 'islem INSERT RETURNING satiri gorunmedi';
  END IF;

  -- Supabase Storage upload INSERT ... RETURNING calistirir. Pointer henuz yokken
  -- (yeni upload-first akis) ve not satiri var/photo_path NULL iken (legacy akis)
  -- restrictive SELECT, yeni storage satirinin owner_id kolonunu kullanarak ayni
  -- komutta satiri gorebilmelidir. Iki akisin Storage policy durumu aynidir.
  PERFORM set_config('p0s6.note_delete', 'on', true);

  INSERT INTO p0s6_test.objects (bucket_id, name, owner_id)
  VALUES ('islem-photos', 'not/5.webp', current_user)
  RETURNING id INTO v_returned_id;

  IF v_returned_id IS NULL THEN
    RAISE EXCEPTION 'upload-first not INSERT RETURNING satiri gorunmedi';
  END IF;

  INSERT INTO p0s6_test.objects (bucket_id, name, owner_id)
  VALUES ('islem-photos', 'not/6.webp', current_user)
  RETURNING id INTO v_returned_id;

  IF v_returned_id IS NULL THEN
    RAISE EXCEPTION 'legacy NULL-pointer not INSERT RETURNING satiri gorunmedi';
  END IF;

  PERFORM set_config('p0s6.note_delete', 'off', true);

  INSERT INTO p0s6_test.objects (bucket_id, name, owner_id)
  VALUES ('other-bucket', 'malformed-is-irrelevant', 'someone');

  BEGIN
    INSERT INTO p0s6_test.objects (bucket_id, name, owner_id)
    VALUES ('islem-photos', 'tx/4.webp', 'someone')
    RETURNING id INTO v_returned_id;
    RAISE EXCEPTION 'owner mismatch INSERT kabul edildi';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;

  BEGIN
    INSERT INTO p0s6_test.objects (bucket_id, name, owner_id)
    VALUES ('islem-photos', 'malformed', current_user)
    RETURNING id INTO v_returned_id;
    RAISE EXCEPTION 'malformed INSERT kabul edildi';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;
END;
$assert_initial$;

-- Not kapisi acilinca ayni permissive policy ile satir gorunur olur.
SELECT set_config('p0s6.note_select', 'on', true);

DO $assert_note_select$
DECLARE
  v_count integer;
  v_rows integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM p0s6_test.objects
  WHERE name = 'not/2.webp';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'not SELECT pozitif kontrolu basarisiz';
  END IF;

  DELETE FROM p0s6_test.objects WHERE name = 'not/2.webp';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'not DELETE kapisi kapaliyken silindi';
  END IF;

  DELETE FROM p0s6_test.objects WHERE name = 'tx/1.webp';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'islem DELETE branch true kalmadi';
  END IF;

  DELETE FROM p0s6_test.objects WHERE bucket_id = 'other-bucket';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 2 THEN
    RAISE EXCEPTION 'diger bucket DELETE etkilenmemeli; bulunan %', v_rows;
  END IF;
END;
$assert_note_select$;

-- Pointer kaldirildi: SELECT RLS, DELETE'i yalniz ayni cleanup principal'i icin
-- gorunur yapmali. update_all/edit_all peer obje sahipligini genisletmez.
SELECT set_config('p0s6.note_select', 'off', true);
SELECT set_config('p0s6.note_delete', 'on', true);
SELECT set_config('p0s6.note_update_all', 'on', true);

DO $assert_orphan_cleanup$
DECLARE
  v_count integer;
  v_rows integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM p0s6_test.objects
  WHERE name = 'not/2.webp';
  IF v_count <> 1 THEN
    RAISE EXCEPTION
      'uploader orphan SELECT cleanup dali acilmadi';
  END IF;

  SELECT count(*) INTO v_count
  FROM p0s6_test.objects
  WHERE name = 'not/peer.webp';
  IF v_count <> 0 THEN
    RAISE EXCEPTION
      'edit_all peer orphan SELECT sizdirdi';
  END IF;

  DELETE FROM p0s6_test.objects
  WHERE name = 'not/peer.webp';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN
    RAISE EXCEPTION
      'edit_all peer orphan DELETE kabul edildi';
  END IF;

  DELETE FROM p0s6_test.objects
  WHERE name = 'not/2.webp';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION
      'uploader orphan DELETE SELECT onkosulunden gecmedi';
  END IF;
END;
$assert_orphan_cleanup$;

-- Isletme sahibi, peer uploader'in pointer-gone objesini temizleyebilir.
SELECT set_config('p0s6.business_owner', 'on', true);

DO $assert_business_owner_cleanup$
DECLARE
  v_count integer;
  v_rows integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM p0s6_test.objects
  WHERE name = 'not/peer.webp';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'isletme owner orphan SELECT dali acilmadi';
  END IF;

  DELETE FROM p0s6_test.objects
  WHERE name = 'not/peer.webp';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'isletme owner orphan DELETE basarisiz';
  END IF;
END;
$assert_business_owner_cleanup$;

SELECT
  'P0_S6_RESTRICTIVE_RLS_OK|' || current_setting('server_version')
  AS result;

ROLLBACK;
