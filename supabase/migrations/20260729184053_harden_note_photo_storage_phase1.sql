-- =============================================================================
-- P0-S6B / FAZ-1: Storage kanonik yol zarfi + not fotografi server kapanisi
-- =============================================================================
-- CANLI: 20260729184053_harden_note_photo_storage_phase1 (29 Temmuz 2026).
-- Bu paket P0-S1 islem-gorunurluk motorundan BAGIMSIZ kalan dar parcadir:
--   * mevcut islem fotografi SELECT/DELETE yetkisini DEGISTIRMEZ;
--   * islem ve not upload'larini kanonik yol + aktif tenant + object owner ile sarar;
--   * islem-photos bucket'inda istemci UPDATE/upsert yolunu kapatir;
--   * not fotografi SELECT'ini P0-S9 not RLS gorunurlugune baglar;
--   * not fotografi DELETE'ini pointer-once / Storage-sonra akisina baglar.
--
-- CANLI SNAPSHOT (29 Temmuz 2026, salt-okunur):
--   PostgreSQL                         : 17.6
--   storage.objects policy count/hash : 5 / a61023ffdcc14266e82bbe68e7e72052
--   bucket                            : private, 512000 byte, image/webp
--   object                            : 286 / 30,982,504 byte
--   object bicimi                     : 275 islem + 11 not + 0 diger
--   object owner_id NULL              : 0
--   pointer                           : 239 islem + 6 not
--   eksik obje / bozuk pointer        : 0 / 0
--   orphan                            : 41
--   notlar policy count/hash          : 6 / 077a903a2d599ae99c8b11a3dc2026ea
--
-- Canli sistem yazmaya devam ettigi icin object/pointer SAYI ve row hash'leri drift
-- guard'da sabitlenmez. Bunun yerine guvenlik icin gerekli monoton invariantlar
-- (kanonik bicim, owner_id, pointer->obje ve pointer tenant/id eslesmesi) kilitlenir.
--
-- VERI GUVENLIGI:
--   Top-level INSERT/UPDATE/DELETE/TRUNCATE/backfill yoktur. 41 orphan nesneye
--   dokunulmaz. Iki partial index, dort internal helper ve dort RESTRICTIVE policy
--   eklenir. Tablo/kolon/imza degismez.
--
-- 1.5.x / ESKI CLIENT:
--   Eski `INSERT row -> upload(upsert:false) -> photo_path UPDATE` akisi korunur.
--   Yeni not `upload -> INSERT(photo_path)` akisi da korunur. Yeni obje upload'i
--   Storage API'de `INSERT ... RETURNING` calistirdigi icin INSERT ve SELECT
--   policy'lerinden birlikte gecer; cleanup kapisi yeni satirin guvenilir owner_id
--   degerini policy satirindan alir. UPDATE policy gerekmez. Not degistirme/silme
--   akislarinda eski
--   ve yeni client once DB pointer'ini/satirini kaldirip sonra Storage DELETE yapar.
--   Peer nota edit_all/delete_all ile DB yazabilen shared kullanici, objeyi kendisi
--   yuklemediyse eski Storage nesnesini silemez; best-effort cleanup reddedilir ve
--   finansal/not kaydi basarili kalirken orphan nesne daha sonra owner temizligine
--   kalabilir. Bu, peer objesini silme yetkisi vermekten daha dar ve guvenlidir.
--   Kanonik olmayan, owner_id'si caller olmayan veya yetkisiz not upload'i artik
--   403 alir. Islem fotografi nihai modül/tip SELECT/DELETE kapisi P0-S1'e kalir.
-- =============================================================================

SET lock_timeout TO '5s';
SET statement_timeout TO '120s';


-- ---------------------------------------------------------------------------
-- Drift guard: politika/bucket/P0-S9 yapisi exact; aktif veri ise invariant bazli.
-- ---------------------------------------------------------------------------
DO $storage_phase1_guard$
DECLARE
  v_objects_oid oid := pg_catalog.to_regclass('storage.objects');
  v_objects_owner text;
  v_objects_rls boolean;
  v_objects_force_rls boolean;
  v_objects_columns_hash text;
  v_storage_policy_count bigint;
  v_storage_policy_hash text;
  v_bucket_public boolean;
  v_bucket_limit bigint;
  v_bucket_mimes text[];
  v_not_policy_count bigint;
  v_not_policy_hash text;
  v_resolver_hash text;
  v_bad_objects bigint;
  v_null_owners bigint;
  v_bad_pointers bigint;
  v_missing_objects bigint;
  v_duplicate_pointers bigint;
BEGIN
  IF pg_catalog.current_setting('server_version_num')::integer < 150000 THEN
    RAISE EXCEPTION 'P0-S6B drift: PostgreSQL 15+ gerekli';
  END IF;

  IF v_objects_oid IS NULL THEN
    RAISE EXCEPTION 'P0-S6B drift: storage.objects bulunamadi';
  END IF;

  SELECT
    pg_catalog.pg_get_userbyid(table_row.relowner),
    table_row.relrowsecurity,
    table_row.relforcerowsecurity
  INTO v_objects_owner, v_objects_rls, v_objects_force_rls
  FROM pg_catalog.pg_class AS table_row
  WHERE table_row.oid = v_objects_oid;

  SELECT pg_catalog.md5(
    COALESCE(
      pg_catalog.string_agg(
        pg_catalog.concat_ws(
          '|',
          attribute_row.attnum::text,
          attribute_row.attname,
          pg_catalog.format_type(
            attribute_row.atttypid,
            attribute_row.atttypmod
          ),
          attribute_row.attnotnull::text,
          COALESCE(
            pg_catalog.pg_get_expr(
              default_row.adbin,
              default_row.adrelid
            ),
            '<NULL>'
          )
        ),
        E'\n'
        ORDER BY attribute_row.attnum
      ),
      ''
    )
  )
  INTO v_objects_columns_hash
  FROM pg_catalog.pg_attribute AS attribute_row
  LEFT JOIN pg_catalog.pg_attrdef AS default_row
    ON default_row.adrelid = attribute_row.attrelid
   AND default_row.adnum = attribute_row.attnum
  WHERE attribute_row.attrelid = v_objects_oid
    AND attribute_row.attnum > 0
    AND NOT attribute_row.attisdropped;

  SELECT
    pg_catalog.count(*),
    pg_catalog.md5(
      COALESCE(
        pg_catalog.string_agg(
          pg_catalog.concat_ws(
            '|',
            policy_row.policyname,
            policy_row.permissive,
            pg_catalog.array_to_string(policy_row.roles, ','),
            policy_row.cmd,
            COALESCE(policy_row.qual, '<NULL>'),
            COALESCE(policy_row.with_check, '<NULL>')
          ),
          E'\n'
          ORDER BY policy_row.policyname
        ),
        ''
      )
    )
  INTO v_storage_policy_count, v_storage_policy_hash
  FROM pg_catalog.pg_policies AS policy_row
  WHERE policy_row.schemaname = 'storage'
    AND policy_row.tablename = 'objects';

  SELECT
    bucket_row.public,
    bucket_row.file_size_limit,
    bucket_row.allowed_mime_types
  INTO v_bucket_public, v_bucket_limit, v_bucket_mimes
  FROM storage.buckets AS bucket_row
  WHERE bucket_row.id = 'islem-photos';

  SELECT
    pg_catalog.count(*),
    pg_catalog.md5(
      COALESCE(
        pg_catalog.string_agg(
          pg_catalog.concat_ws(
            '|',
            policy_row.policyname,
            policy_row.permissive,
            pg_catalog.array_to_string(policy_row.roles, ','),
            policy_row.cmd,
            COALESCE(policy_row.qual, '<NULL>'),
            COALESCE(policy_row.with_check, '<NULL>')
          ),
          E'\n'
          ORDER BY policy_row.policyname
        ),
        ''
      )
    )
  INTO v_not_policy_count, v_not_policy_hash
  FROM pg_catalog.pg_policies AS policy_row
  WHERE policy_row.schemaname = 'public'
    AND policy_row.tablename = 'notlar';

  SELECT pg_catalog.md5(pg_catalog.pg_get_functiondef(function_row.oid))
  INTO v_resolver_hash
  FROM pg_catalog.pg_proc AS function_row
  WHERE function_row.oid = pg_catalog.to_regprocedure(
    'internal.etkin_yetki(uuid,text)'
  );

  IF v_objects_owner IS DISTINCT FROM 'supabase_storage_admin'
     OR v_objects_rls IS DISTINCT FROM true
     OR v_objects_force_rls IS DISTINCT FROM false
     OR v_objects_columns_hash IS DISTINCT FROM
       '943758842eb790fab98ff1186a2a943e'
     OR v_storage_policy_count IS DISTINCT FROM 5
     OR v_storage_policy_hash IS DISTINCT FROM
       'a61023ffdcc14266e82bbe68e7e72052'
     OR v_bucket_public IS DISTINCT FROM false
     OR v_bucket_limit IS DISTINCT FROM 512000
     OR v_bucket_mimes IS DISTINCT FROM ARRAY['image/webp']::text[]
     OR v_not_policy_count IS DISTINCT FROM 6
     OR v_not_policy_hash IS DISTINCT FROM
       '077a903a2d599ae99c8b11a3dc2026ea'
     OR v_resolver_hash IS DISTINCT FROM
       'f8aebb82851b89301f6679f92a217e96'
  THEN
    RAISE EXCEPTION
      'P0-S6B drift: yapisal snapshot degisti '
      '(objects=%/%/%/%, storage policies=%/%, bucket=%/%/%, '
      'not policies=%/%, resolver=%)',
      v_objects_owner,
      v_objects_rls,
      v_objects_force_rls,
      v_objects_columns_hash,
      v_storage_policy_count,
      v_storage_policy_hash,
      v_bucket_public,
      v_bucket_limit,
      v_bucket_mimes,
      v_not_policy_count,
      v_not_policy_hash,
      v_resolver_hash;
  END IF;

  IF pg_catalog.to_regprocedure(
       'internal.storage_photo_path_parse_v1(text)'
     ) IS NOT NULL
     OR pg_catalog.to_regprocedure(
       'internal.storage_photo_insert_allowed_v1(text,text)'
     ) IS NOT NULL
     OR pg_catalog.to_regprocedure(
       'internal.storage_note_photo_select_allowed_v1(text)'
     ) IS NOT NULL
     OR pg_catalog.to_regprocedure(
       'internal.storage_note_photo_delete_allowed_v1(text)'
     ) IS NOT NULL
     OR pg_catalog.to_regprocedure(
       'internal.storage_note_photo_delete_allowed_v1(text,text)'
     ) IS NOT NULL
     OR pg_catalog.to_regclass(
       'public.idx_islemler_photo_path_lookup_v1'
     ) IS NOT NULL
     OR pg_catalog.to_regclass(
       'public.idx_notlar_photo_path_lookup_v1'
     ) IS NOT NULL
  THEN
    RAISE EXCEPTION 'P0-S6B drift: hedef nesnelerden biri zaten var';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_policies AS policy_row
    WHERE policy_row.schemaname = 'storage'
      AND policy_row.tablename = 'objects'
      AND policy_row.policyname IN (
        'islem_photos_canonical_insert_v1',
        'islem_photos_no_client_update_v1',
        'islem_photos_note_select_v1',
        'islem_photos_note_delete_v1'
      )
  ) THEN
    RAISE EXCEPTION 'P0-S6B drift: hedef policy zaten var';
  END IF;

  SELECT
    pg_catalog.count(*) FILTER (
      WHERE object_row.name !~
        '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|notlar/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})_[0-9]{10,20}[.]webp$'
    ),
    pg_catalog.count(*) FILTER (
      WHERE object_row.owner_id IS NULL
    )
  INTO v_bad_objects, v_null_owners
  FROM storage.objects AS object_row
  WHERE object_row.bucket_id = 'islem-photos';

  WITH pointer_row AS (
    SELECT
      'islem'::text AS kayit_turu,
      islem_row.id,
      islem_row.isletme_id,
      islem_row.photo_path
    FROM public.islemler AS islem_row
    WHERE islem_row.photo_path IS NOT NULL

    UNION ALL

    SELECT
      'not'::text,
      note_row.id,
      note_row.isletme_id,
      note_row.photo_path
    FROM public.notlar AS note_row
    WHERE note_row.photo_path IS NOT NULL
  )
  SELECT
    pg_catalog.count(*) FILTER (
      WHERE (
        pointer_row.kayit_turu = 'islem'
        AND pointer_row.photo_path !~ (
          '^'
          || pointer_row.isletme_id::text
          || '/'
          || pointer_row.id::text
          || '_[0-9]{10,20}[.]webp$'
        )
      )
      OR (
        pointer_row.kayit_turu = 'not'
        AND pointer_row.photo_path !~ (
          '^'
          || pointer_row.isletme_id::text
          || '/notlar/'
          || pointer_row.id::text
          || '_[0-9]{10,20}[.]webp$'
        )
      )
    ),
    pg_catalog.count(*) FILTER (
      WHERE NOT EXISTS (
        SELECT 1
        FROM storage.objects AS object_row
        WHERE object_row.bucket_id = 'islem-photos'
          AND object_row.name = pointer_row.photo_path
          AND object_row.owner_id IS NOT NULL
      )
    )
  INTO v_bad_pointers, v_missing_objects
  FROM pointer_row;

  WITH pointer_row AS (
    SELECT islem_row.photo_path
    FROM public.islemler AS islem_row
    WHERE islem_row.photo_path IS NOT NULL
    UNION ALL
    SELECT note_row.photo_path
    FROM public.notlar AS note_row
    WHERE note_row.photo_path IS NOT NULL
  )
  SELECT pg_catalog.count(*)
  INTO v_duplicate_pointers
  FROM (
    SELECT pointer_row.photo_path
    FROM pointer_row
    GROUP BY pointer_row.photo_path
    HAVING pg_catalog.count(*) > 1
  ) AS duplicate_row;

  IF v_bad_objects <> 0
     OR v_null_owners <> 0
     OR v_bad_pointers <> 0
     OR v_missing_objects <> 0
     OR v_duplicate_pointers <> 0
  THEN
    RAISE EXCEPTION
      'P0-S6B drift: veri invarianti bozuk '
      '(bad objects=%, null owners=%, bad pointers=%, missing=%, duplicates=%)',
      v_bad_objects,
      v_null_owners,
      v_bad_pointers,
      v_missing_objects,
      v_duplicate_pointers;
  END IF;
END;
$storage_phase1_guard$;


-- Exact equality lookup, Storage policy basina 68K islemi taramasin.
CREATE INDEX idx_islemler_photo_path_lookup_v1
ON public.islemler (photo_path)
WHERE photo_path IS NOT NULL;

CREATE INDEX idx_notlar_photo_path_lookup_v1
ON public.notlar (photo_path)
WHERE photo_path IS NOT NULL;


-- ---------------------------------------------------------------------------
-- Tek kanonik parser. Caller UID parametre olarak ALINMAZ.
-- ---------------------------------------------------------------------------
CREATE FUNCTION internal.storage_photo_path_parse_v1(p_name text)
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

REVOKE ALL ON FUNCTION internal.storage_photo_path_parse_v1(text)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION internal.storage_photo_path_parse_v1(text)
TO authenticated;


-- INSERT: Storage'in row'a yazdigi owner_id caller ile ayni olmali. Islem
-- branch'i P0-S1 gelene kadar aktif tenant uyeliginde kalir; not branch'i ayrica
-- P0-S9 Notes can_create ister.
CREATE FUNCTION internal.storage_photo_insert_allowed_v1(
  p_name text,
  p_owner_id text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_path record;
BEGIN
  IF v_user_id IS NULL
     OR p_owner_id IS DISTINCT FROM v_user_id::text
  THEN
    RETURN false;
  END IF;

  SELECT *
  INTO v_path
  FROM internal.storage_photo_path_parse_v1(p_name);

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.isletmeler AS business_row
    WHERE business_row.id = v_path.isletme_id
      AND business_row.user_id = v_user_id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.isletme_users AS member_row
    WHERE member_row.isletme_id = v_path.isletme_id
      AND member_row.user_id = v_user_id
      AND member_row.status = 'active'
  ) THEN
    RETURN false;
  END IF;

  IF v_path.kayit_turu = 'not' THEN
    RETURN EXISTS (
      SELECT 1
      FROM internal.etkin_yetki(
        v_path.isletme_id,
        'notlar'
      ) AS permission_row
      WHERE permission_row.can_create IS TRUE
    );
  END IF;

  RETURN v_path.kayit_turu = 'islem';
END;
$function$;

REVOKE ALL ON FUNCTION internal.storage_photo_insert_allowed_v1(text,text)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION internal.storage_photo_insert_allowed_v1(text,text)
TO authenticated;


-- SELECT: SECURITY INVOKER bilincli. public.notlar sorgusu P0-S9 RLS'ini caller
-- kimligiyle calistirir; burada ikinci bir gorunurluk motoru kopyalanmaz.
CREATE FUNCTION internal.storage_note_photo_select_allowed_v1(p_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'pg_catalog'
AS $function$
  SELECT
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.notlar AS note_row
      WHERE note_row.photo_path = p_name
    )
$function$;

REVOKE ALL ON FUNCTION internal.storage_note_photo_select_allowed_v1(text)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION internal.storage_note_photo_select_allowed_v1(text)
TO authenticated;


-- DELETE: uygulama once pointer'i/satiri kaldirir. Halen herhangi bir nota bagli
-- obje asla silinmez. Unlinked cleanup'i yalniz object uploader'i veya isletme
-- sahibi yapabilir. Shared update_all/delete_all, baska uyenin orphan objesini
-- silme yetkisi vermez. p_object_owner_id yalniz storage.objects policy'sinin
-- degerlendirdigi mevcut satirin owner_id kolonundan verilir; helper ayni
-- storage.objects satirini STABLE snapshot icinden tekrar sorgulamaz. Bu,
-- Storage API'nin INSERT ... RETURNING komutunda yeni satirin SELECT policy'sinden
-- de gecebilmesini saglar. SECURITY DEFINER yalniz global pointer VAR/YOK kontrolu
-- icindir; auth.uid() fonksiyonun icinden alinir.
CREATE FUNCTION internal.storage_note_photo_delete_allowed_v1(
  p_name text,
  p_object_owner_id text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_path record;
  v_is_business_owner boolean := false;
BEGIN
  IF v_user_id IS NULL OR p_object_owner_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT *
  INTO v_path
  FROM internal.storage_photo_path_parse_v1(p_name);

  IF NOT FOUND OR v_path.kayit_turu <> 'not' THEN
    RETURN false;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.isletmeler AS business_row
    WHERE business_row.id = v_path.isletme_id
      AND business_row.user_id = v_user_id
  )
  INTO v_is_business_owner;

  IF v_is_business_owner IS NOT TRUE
  AND NOT EXISTS (
    SELECT 1
    FROM public.isletme_users AS member_row
    WHERE member_row.isletme_id = v_path.isletme_id
      AND member_row.user_id = v_user_id
      AND member_row.status = 'active'
  ) THEN
    RETURN false;
  END IF;

  -- RLS bypass burada gizli/atanmis bir nota bagli objenin "orphan" sanilmasini
  -- engeller. Fonksiyon pointer varsa yalniz false dondurur; satir verisi sizmaz.
  IF EXISTS (
    SELECT 1
    FROM public.notlar AS note_row
    WHERE note_row.photo_path = p_name
  ) THEN
    RETURN false;
  END IF;

  IF p_object_owner_id = v_user_id::text THEN
    RETURN true;
  END IF;

  RETURN v_is_business_owner IS TRUE;
END;
$function$;

REVOKE ALL ON FUNCTION internal.storage_note_photo_delete_allowed_v1(text,text)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION internal.storage_note_photo_delete_allowed_v1(text,text)
TO authenticated;


-- ---------------------------------------------------------------------------
-- RESTRICTIVE = mevcut/future permissive politikalar OR olsa da bu zarflar AND.
-- Diger bucket'larda ilk dal TRUE: bu paket onlari etkilemez.
-- ---------------------------------------------------------------------------
CREATE POLICY "islem_photos_canonical_insert_v1"
ON storage.objects
AS RESTRICTIVE
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id <> 'islem-photos'
  OR internal.storage_photo_insert_allowed_v1(name, owner_id)
);

CREATE POLICY "islem_photos_no_client_update_v1"
ON storage.objects
AS RESTRICTIVE
FOR UPDATE
TO authenticated
USING (
  bucket_id <> 'islem-photos'
)
WITH CHECK (
  bucket_id <> 'islem-photos'
);

CREATE POLICY "islem_photos_note_select_v1"
ON storage.objects
AS RESTRICTIVE
FOR SELECT
TO authenticated
USING (
  bucket_id <> 'islem-photos'
  OR EXISTS (
    SELECT 1
    FROM internal.storage_photo_path_parse_v1(name) AS path_row
    WHERE path_row.kayit_turu = 'islem'
       OR (
         path_row.kayit_turu = 'not'
         AND (
           -- Pointer varken exact P0-S9 gorunurlugu; pointer kaldirildiktan
           -- sonra DELETE'in PostgreSQL SELECT-gorunurluk onkosulunu yalniz
           -- ayni dar cleanup principal'i (uploader/isletme owner) tamamlar.
           internal.storage_note_photo_select_allowed_v1(name)
           OR internal.storage_note_photo_delete_allowed_v1(name, owner_id)
         )
       )
  )
);

CREATE POLICY "islem_photos_note_delete_v1"
ON storage.objects
AS RESTRICTIVE
FOR DELETE
TO authenticated
USING (
  bucket_id <> 'islem-photos'
  OR EXISTS (
    SELECT 1
    FROM internal.storage_photo_path_parse_v1(name) AS path_row
    WHERE path_row.kayit_turu = 'islem'
       OR (
         path_row.kayit_turu = 'not'
         AND internal.storage_note_photo_delete_allowed_v1(name, owner_id)
       )
  )
);


-- ---------------------------------------------------------------------------
-- Resultant nesne/ACL/policy postcondition.
-- ---------------------------------------------------------------------------
DO $storage_phase1_postcondition$
DECLARE
  v_policy_count bigint;
  v_index_count bigint;
BEGIN
  SELECT pg_catalog.count(*)
  INTO v_policy_count
  FROM pg_catalog.pg_policies AS policy_row
  WHERE policy_row.schemaname = 'storage'
    AND policy_row.tablename = 'objects'
    AND policy_row.policyname IN (
      'islem_photos_canonical_insert_v1',
      'islem_photos_no_client_update_v1',
      'islem_photos_note_select_v1',
      'islem_photos_note_delete_v1'
    )
    AND policy_row.permissive = 'RESTRICTIVE'
    AND policy_row.roles = ARRAY['authenticated']::name[];

  SELECT pg_catalog.count(*)
  INTO v_index_count
  FROM pg_catalog.pg_indexes AS index_row
  WHERE index_row.schemaname = 'public'
    AND (
      (
        index_row.tablename = 'islemler'
        AND index_row.indexname = 'idx_islemler_photo_path_lookup_v1'
        AND index_row.indexdef LIKE
          '%USING btree (photo_path) WHERE (photo_path IS NOT NULL)'
      )
      OR (
        index_row.tablename = 'notlar'
        AND index_row.indexname = 'idx_notlar_photo_path_lookup_v1'
        AND index_row.indexdef LIKE
          '%USING btree (photo_path) WHERE (photo_path IS NOT NULL)'
      )
    );

  IF v_policy_count <> 4
     OR v_index_count <> 2
     OR NOT pg_catalog.has_function_privilege(
       'authenticated',
       'internal.storage_photo_path_parse_v1(text)',
       'EXECUTE'
     )
     OR NOT pg_catalog.has_function_privilege(
       'authenticated',
       'internal.storage_photo_insert_allowed_v1(text,text)',
       'EXECUTE'
     )
     OR NOT pg_catalog.has_function_privilege(
       'authenticated',
       'internal.storage_note_photo_select_allowed_v1(text)',
       'EXECUTE'
     )
     OR NOT pg_catalog.has_function_privilege(
       'authenticated',
       'internal.storage_note_photo_delete_allowed_v1(text,text)',
       'EXECUTE'
     )
     OR pg_catalog.has_function_privilege(
       'anon',
       'internal.storage_photo_path_parse_v1(text)',
       'EXECUTE'
     )
     OR pg_catalog.has_function_privilege(
       'anon',
       'internal.storage_photo_insert_allowed_v1(text,text)',
       'EXECUTE'
     )
     OR pg_catalog.has_function_privilege(
       'service_role',
       'internal.storage_note_photo_select_allowed_v1(text)',
       'EXECUTE'
     )
     OR pg_catalog.has_function_privilege(
       'service_role',
       'internal.storage_note_photo_delete_allowed_v1(text,text)',
       'EXECUTE'
     )
  THEN
    RAISE EXCEPTION
      'P0-S6B postcondition basarisiz (policies=%, indexes=%)',
      v_policy_count,
      v_index_count;
  END IF;
END;
$storage_phase1_postcondition$;

COMMENT ON FUNCTION internal.storage_photo_path_parse_v1(text) IS
  'P0-S6B internal canonical islem/not photo path parser; no caller uid parameter.';
COMMENT ON FUNCTION internal.storage_photo_insert_allowed_v1(text,text) IS
  'P0-S6B canonical Storage INSERT envelope; auth.uid is resolved internally.';
COMMENT ON FUNCTION internal.storage_note_photo_select_allowed_v1(text) IS
  'P0-S6B note photo SELECT gate; exact P0-S9 notlar RLS runs as caller.';
COMMENT ON FUNCTION internal.storage_note_photo_delete_allowed_v1(text,text) IS
  'P0-S6B unlinked note photo cleanup gate; policy supplies current storage.objects.owner_id, linked pointers always deny, only object uploader or business owner may clean.';
