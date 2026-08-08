-- =============================================================================
-- P0-S9: notlar RLS seviye/aksiyon + baglamsal gorunurluk kapanisi
-- =============================================================================
-- Canli migration history: 20260729112129 / harden_notlar_rls_actions_context.
--
-- CANLI SNAPSHOT (29 Temmuz 2026, salt-okunur):
--   public.notlar owner=postgres, RLS=true, FORCE RLS=false
--   column count/hash     : 15 / fe58825fbd779e6db8f1495e00fa04be
--   column-level ACL       : 0
--   constraint count/hash : 7 / 4af65ae3291e5ab8f9fe845a4bb8bf67
--   policy count/hash      : 5 / b18f54ff8dabc0d3dc4e2b59b2a952be
--   non-internal trigger   : 0
--   ACL                    : postgres/anon/authenticated/service_role = ALL
--   internal.etkin_yetki   : f8aebb82851b89301f6679f92a217e96
--
-- CANLI VERI NOTU:
--   56 notun 56'sinda created_by NULL. Bu migration BACKFILL YAPMAZ ve mevcut
--   satirlara yazmaz. Legacy NULL satirlar owner veya can_*_all yetkili kullanici
--   tarafindan yonetilebilir; can_*_own NULL satiri sahiplenemez.
--   Bir cari notunun entity_id referansi ayni tenantta bulunmuyor. Bu satir
--   gizlenmez/degistirilmez; iliski alanlari degismeyen UPDATE'leri de engellenmez.
--
-- OKUMA SOZLESMESI:
--   * atamasiz genel not                -> Notlar can_view
--   * cari/personel atanmis genel not   -> yalniz atama modulu/modulleri
--   * hesap                             -> Hesaplar can_view
--   * cari                              -> Cariler can_view
--   * personel / personel_izin          -> Personel can_view
--   * urun                              -> Urunler can_view
--   * baglamsal not + assigned_to_cari  -> ayrica Cariler can_view
--   * baglamsal not + assigned_to_personel -> ayrica Personel can_view
--   * assigned_to_user doluysa          -> yalniz atanan kullanici
--   * her durumda                       -> can_see_all_users_data veya own
--
-- YAZMA SOZLESMESI:
--   Notlar exact create/update/delete aksiyonu VE butun hedef modullerin can_view
--   yetkisi gerekir. UPDATE hem eski satira USING hem yeni satira WITH CHECK
--   uygular. UPDATE/DELETE mevcut satiri ayrica global/own gorunurluk ve
--   assigned_to_user hedef kitlesiyle sinirlar; edit_all bu siniri baypas etmez.
--   Own/all sahiplik ayrimi internal.etkin_yetki sonucundan gelir.
--
-- ESKI CLIENT:
--   Eski istemci INSERT payload'inda created_by gondermiyor. Additive BEFORE
--   INSERT trigger authenticated cagriyi auth.uid() ile sahipler. Imza/kolon
--   degismez. Eski client izin disi yazmada 401/403 alabilir veya UPDATE/DELETE
--   sifir satir etkileyebilir; veri silinmez. Kimlik alanlarini degistirmeyen
--   mevcut payload'lar ayni sekilde calisir.
--   Add-only roldeki eski INSERT -> upload -> UPDATE(photo_path, updated_at)
--   akisi, ayni migrationdaki dar attach policy + delta trigger ile korunur.
--   Policy yalniz own + NULL photo satirini acar; trigger normal can_update yoksa
--   photo_path/updated_at disinda tek bir kolon farkini dahi 42501 ile reddeder.
--
-- 1.5.x:
--   Cariler acik + Notlar kapali ortak cari notunu okuyabilir; genel Notlar
--   ekranina ait serbest notlari okuyamaz ve not yazamaz. Bu K5 onayli
--   gorunurluk artisi, yazma acisi degildir.
--
-- CLIENT DELTA (bu migration client dosyalarini degistirmez):
--   * create input allowlist'i isletme_id ve created_by alanlarini kabul etmemeli;
--     tenant hook'tan, sahiplik bu trigger'dan gelmeli.
--   * DELETE, silinen id'yi sunucudan dogrulamadan reminder/fotograf temizlememeli.
--   * query key V2 + user + yetki imzali olmali; hassas not cache'i persist:false
--     olmali veya yayin gecisinde cache buster kullanilmali.
--   * coklu entity/assignment baglari OR degil KESISIM olarak suzulmeli;
--     assigned_to_user atamasi yetki vermez, yalniz gorunurlugu daraltir.
--     Mevcut insert/update().select().single() akisi not baska kullaniciya
--     ataninca yeni satir SELECT politikasindan gecemeyecegi icin transaction'i
--     reddeder; atama yazmasi satiri dondurmeyen atomik sonuc/RPC istemelidir.
--   * Yeni client client-generated UUID ile fotografi once yukler ve photo_path'i
--     ayni INSERT'e koyar; kesin INSERT reddinde objeyi temizler. Legacy
--     INSERT -> upload -> UPDATE akisi icin dar policy + delta trigger kalir.
--   * Storage not fotografi politikalari bu tablo RLS paketiyle kapanmaz; ayri
--     storage paketi gerekir.
--
-- VERI GUVENLIGI:
--   Migration calisirken mevcut satirlara dokunan top-level
--   INSERT/UPDATE/DELETE/backfill yoktur. RPC govdelerindeki UPDATE'ler yalniz
--   ilerideki tek-kayit kullanici islemlerinde calisir. Tablo/kolon/constraint/
--   index degismez. Policy/grant, trigger ve dar RPC'ler eklenir; mevcut bozuk
--   iliskiler geriye donuk yazilmaz.
-- =============================================================================

-- Uretim yogunlugunda tablo kilidini uzun sure bekleyip uygulamayi tutmak yerine
-- migration guvenli bicimde fail etsin; drift guard ile daha sonra tekrar edilir.
SET lock_timeout TO '5s';
SET statement_timeout TO '120s';


-- ---------------------------------------------------------------------------
-- Drift guard: yalniz denetlenen canli notlar/policy/resolver snapshotinda ilerle.
-- ---------------------------------------------------------------------------
DO $notlar_guard$
DECLARE
  v_table_oid oid := pg_catalog.to_regclass('public.notlar');
  v_owner text;
  v_rls boolean;
  v_force_rls boolean;
  v_acl text;
  v_column_count bigint;
  v_columns_md5 text;
  v_column_acl_count bigint;
  v_constraint_count bigint;
  v_constraints_md5 text;
  v_policy_count bigint;
  v_policies_md5 text;
  v_trigger_count bigint;
  v_resolver_oid oid := pg_catalog.to_regprocedure(
    'internal.etkin_yetki(uuid,text)'
  );
  v_resolver_owner text;
  v_resolver_secdef boolean;
  v_resolver_volatility "char";
  v_resolver_config text[];
  v_resolver_acl text;
  v_resolver_md5 text;
BEGIN
  IF v_table_oid IS NULL THEN
    RAISE EXCEPTION 'P0-S9 drift: public.notlar bulunamadi';
  END IF;

  SELECT
    pg_catalog.pg_get_userbyid(table_row.relowner),
    table_row.relrowsecurity,
    table_row.relforcerowsecurity,
    table_row.relacl::text
  INTO v_owner, v_rls, v_force_rls, v_acl
  FROM pg_catalog.pg_class AS table_row
  WHERE table_row.oid = v_table_oid;

  SELECT
    pg_catalog.count(*),
    pg_catalog.count(*) FILTER (
      WHERE attribute_row.attacl IS NOT NULL
    ),
    pg_catalog.md5(
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
  INTO v_column_count, v_column_acl_count, v_columns_md5
  FROM pg_catalog.pg_attribute AS attribute_row
  LEFT JOIN pg_catalog.pg_attrdef AS default_row
    ON default_row.adrelid = attribute_row.attrelid
   AND default_row.adnum = attribute_row.attnum
  WHERE attribute_row.attrelid = v_table_oid
    AND attribute_row.attnum > 0
    AND NOT attribute_row.attisdropped;

  SELECT
    pg_catalog.count(*),
    pg_catalog.md5(
      COALESCE(
        pg_catalog.string_agg(
          pg_catalog.concat_ws(
            '|',
            constraint_row.conname,
            constraint_row.contype::text,
            pg_catalog.pg_get_constraintdef(constraint_row.oid, true)
          ),
          E'\n'
          ORDER BY constraint_row.conname
        ),
        ''
      )
    )
  INTO v_constraint_count, v_constraints_md5
  FROM pg_catalog.pg_constraint AS constraint_row
  WHERE constraint_row.conrelid = v_table_oid;

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
  INTO v_policy_count, v_policies_md5
  FROM pg_catalog.pg_policies AS policy_row
  WHERE policy_row.schemaname = 'public'
    AND policy_row.tablename = 'notlar';

  SELECT pg_catalog.count(*)
  INTO v_trigger_count
  FROM pg_catalog.pg_trigger AS trigger_row
  WHERE trigger_row.tgrelid = v_table_oid
    AND NOT trigger_row.tgisinternal;

  IF v_resolver_oid IS NULL THEN
    RAISE EXCEPTION
      'P0-S9 drift: internal.etkin_yetki(uuid,text) bulunamadi';
  END IF;

  SELECT
    pg_catalog.pg_get_userbyid(function_row.proowner),
    function_row.prosecdef,
    function_row.provolatile,
    function_row.proconfig,
    function_row.proacl::text,
    pg_catalog.md5(pg_catalog.pg_get_functiondef(function_row.oid))
  INTO
    v_resolver_owner,
    v_resolver_secdef,
    v_resolver_volatility,
    v_resolver_config,
    v_resolver_acl,
    v_resolver_md5
  FROM pg_catalog.pg_proc AS function_row
  WHERE function_row.oid = v_resolver_oid;

  IF v_owner IS DISTINCT FROM 'postgres'
     OR v_rls IS DISTINCT FROM true
     OR v_force_rls IS DISTINCT FROM false
     OR v_acl NOT IN (
       -- Denetlenen canli snapshot.
       '{postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}',
       -- Temiz PostgreSQL 17 replay: onceki migrationlar istemci rolleri icin
       -- yalniz tablo-seviyesi DELETE/TRUNCATE/REFERENCES/TRIGGER izinlerini birakir.
       '{postgres=arwdDxtm/postgres,anon=Dxtm/postgres,authenticated=Dxtm/postgres,service_role=Dxtm/postgres}'
     )
     OR v_column_count IS DISTINCT FROM 15
     OR v_column_acl_count IS DISTINCT FROM 0
     OR v_columns_md5 IS DISTINCT FROM
       'fe58825fbd779e6db8f1495e00fa04be'
     OR v_constraint_count IS DISTINCT FROM 7
     OR v_constraints_md5 IS DISTINCT FROM
       '4af65ae3291e5ab8f9fe845a4bb8bf67'
     OR v_policy_count IS DISTINCT FROM 5
     OR v_policies_md5 IS DISTINCT FROM
       'b18f54ff8dabc0d3dc4e2b59b2a952be'
     OR v_trigger_count IS DISTINCT FROM 0
     OR v_resolver_owner IS DISTINCT FROM 'postgres'
     OR v_resolver_secdef IS DISTINCT FROM true
     OR v_resolver_volatility IS DISTINCT FROM 's'
     OR v_resolver_config IS DISTINCT FROM
       ARRAY['search_path=pg_catalog']::text[]
     OR v_resolver_acl IS DISTINCT FROM
       '{postgres=X/postgres,authenticated=X/postgres}'
     OR v_resolver_md5 NOT IN (
       -- Denetlenen canlı resolver snapshot'i.
       'f8aebb82851b89301f6679f92a217e96',
       -- Temiz PostgreSQL 17 migration replay resolver snapshot'i.
       '14226a59d292a065f601dacde8baec17'
     )
  THEN
    RAISE EXCEPTION
      'P0-S9 drift: notlar snapshot degisti '
      '(owner=%, rls=%, force_rls=%, acl=%, columns=%/%/acl%, constraints=%/%, '
      'policies=%/%, triggers=%, resolver=%/%/%/%/%/%)',
      v_owner,
      v_rls,
      v_force_rls,
      v_acl,
      v_column_count,
      v_columns_md5,
      v_column_acl_count,
      v_constraint_count,
      v_constraints_md5,
      v_policy_count,
      v_policies_md5,
      v_trigger_count,
      v_resolver_owner,
      v_resolver_secdef,
      v_resolver_volatility,
      v_resolver_config,
      v_resolver_acl,
      v_resolver_md5;
  END IF;

  IF pg_catalog.to_regprocedure(
    'public.enforce_notlar_identity_v1()'
  ) IS NOT NULL THEN
    RAISE EXCEPTION
      'P0-S9 drift: enforce_notlar_identity_v1 zaten var';
  END IF;

  IF pg_catalog.to_regprocedure(
       'public.enforce_not_photo_attach_delta_v1()'
     ) IS NOT NULL
     OR pg_catalog.to_regprocedure(
       'public.not_guncelle_v1(uuid,uuid,jsonb)'
     ) IS NOT NULL
  THEN
    RAISE EXCEPTION
      'P0-S9 drift: not photo attach nesneleri zaten var';
  END IF;
END;
$notlar_guard$;


-- ---------------------------------------------------------------------------
-- Eski client uyumlulugu + kimlik/tenant iliski butunlugu.
-- SECURITY DEFINER yalniz ayni-tenant referans VAR/YOK kontrolu icin kullanilir.
-- Butun nesneler tam semali, search_path pg_catalog ve dogrudan EXECUTE kapali.
-- Mevcut bozuk referans, iliski alanlari degismeyen UPDATE'te yeniden dogrulanmaz.
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.enforce_notlar_identity_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_validate_entity boolean := false;
  v_validate_cari_assignment boolean := false;
  v_validate_personel_assignment boolean := false;
  v_validate_user_assignment boolean := false;
  v_validate_photo boolean := false;
BEGIN
  -- SECURITY DEFINER hedef kontrolleri RLS'i bilincli olarak asar. Authenticated
  -- bir cagri once tenant uyeligini kanitlamadan hedef UUID'lerinin varligini
  -- farkli hata cevaplariyla yoklayamasin. auth.uid() NULL olan guvenilir
  -- server/migration baglamlari mevcut davranisini korur.
  IF v_user_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM public.isletmeler AS actor_business_row
       WHERE actor_business_row.id = NEW.isletme_id
         AND actor_business_row.user_id = v_user_id
     )
     AND NOT EXISTS (
       SELECT 1
       FROM public.isletme_users AS actor_member_row
       WHERE actor_member_row.isletme_id = NEW.isletme_id
         AND actor_member_row.user_id = v_user_id
         AND actor_member_row.status = 'active'
     )
  THEN
    RAISE EXCEPTION 'NOTLAR_INVALID_TENANT_CONTEXT'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF v_user_id IS NOT NULL THEN
      NEW.created_by := v_user_id;
    END IF;

    v_validate_entity := true;
    v_validate_cari_assignment := true;
    v_validate_personel_assignment := true;
    v_validate_user_assignment := true;
    v_validate_photo := NEW.photo_path IS NOT NULL;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.isletme_id IS DISTINCT FROM OLD.isletme_id
       OR NEW.created_by IS DISTINCT FROM OLD.created_by
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
    THEN
      RAISE EXCEPTION 'NOTLAR_IMMUTABLE_IDENTITY'
        USING ERRCODE = '42501';
    END IF;

    v_validate_entity :=
      NEW.entity_type IS DISTINCT FROM OLD.entity_type
      OR NEW.entity_id IS DISTINCT FROM OLD.entity_id;
    v_validate_cari_assignment :=
      NEW.assigned_to_cari IS DISTINCT FROM OLD.assigned_to_cari;
    v_validate_personel_assignment :=
      NEW.assigned_to_personel IS DISTINCT FROM OLD.assigned_to_personel;
    v_validate_user_assignment :=
      NEW.assigned_to_user IS DISTINCT FROM OLD.assigned_to_user;
    v_validate_photo :=
      NEW.photo_path IS DISTINCT FROM OLD.photo_path
      AND NEW.photo_path IS NOT NULL;
  END IF;

  IF v_validate_photo
     AND (
       pg_catalog.char_length(NEW.photo_path) > 200
       OR NEW.photo_path !~ (
         '^'
         || NEW.isletme_id::text
         || '/notlar/'
         || NEW.id::text
         || '_[0-9]{10,20}[.]webp$'
       )
       OR NOT EXISTS (
         SELECT 1
         FROM storage.objects AS object_row
         WHERE object_row.bucket_id = 'islem-photos'
           AND object_row.name = NEW.photo_path
           AND (
             v_user_id IS NULL
             OR object_row.owner_id = v_user_id::text
           )
       )
     )
  THEN
    RAISE EXCEPTION 'NOTLAR_INVALID_PHOTO_REFERENCE'
      USING ERRCODE = '23514';
  END IF;

  IF v_validate_entity THEN
    CASE NEW.entity_type
      WHEN 'genel' THEN
        IF NEW.entity_id IS NOT NULL THEN
          RAISE EXCEPTION 'NOTLAR_INVALID_ENTITY_REFERENCE'
            USING ERRCODE = '23514';
        END IF;
      WHEN 'hesap' THEN
        IF NEW.entity_id IS NULL OR NOT EXISTS (
          SELECT 1
          FROM public.hesaplar AS account_row
          WHERE account_row.id = NEW.entity_id
            AND account_row.isletme_id = NEW.isletme_id
        ) THEN
          RAISE EXCEPTION 'NOTLAR_INVALID_ENTITY_REFERENCE'
            USING ERRCODE = '23514';
        END IF;
      WHEN 'cari' THEN
        IF NEW.entity_id IS NULL OR NOT EXISTS (
          SELECT 1
          FROM public.cariler AS cari_row
          WHERE cari_row.id = NEW.entity_id
            AND cari_row.isletme_id = NEW.isletme_id
        ) THEN
          RAISE EXCEPTION 'NOTLAR_INVALID_ENTITY_REFERENCE'
            USING ERRCODE = '23514';
        END IF;
      WHEN 'personel', 'personel_izin' THEN
        IF NEW.entity_id IS NULL OR NOT EXISTS (
          SELECT 1
          FROM public.personel AS employee_row
          WHERE employee_row.id = NEW.entity_id
            AND employee_row.isletme_id = NEW.isletme_id
        ) THEN
          RAISE EXCEPTION 'NOTLAR_INVALID_ENTITY_REFERENCE'
            USING ERRCODE = '23514';
        END IF;
      WHEN 'urun' THEN
        IF NEW.entity_id IS NULL OR NOT EXISTS (
          SELECT 1
          FROM public.urunler AS product_row
          WHERE product_row.id = NEW.entity_id
            AND product_row.isletme_id = NEW.isletme_id
        ) THEN
          RAISE EXCEPTION 'NOTLAR_INVALID_ENTITY_REFERENCE'
            USING ERRCODE = '23514';
        END IF;
      ELSE
        RAISE EXCEPTION 'NOTLAR_INVALID_ENTITY_REFERENCE'
          USING ERRCODE = '23514';
    END CASE;
  END IF;

  IF v_validate_cari_assignment
     AND NEW.assigned_to_cari IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM public.cariler AS assigned_cari_row
       WHERE assigned_cari_row.id = NEW.assigned_to_cari
         AND assigned_cari_row.isletme_id = NEW.isletme_id
     )
  THEN
    RAISE EXCEPTION 'NOTLAR_INVALID_CARI_ASSIGNMENT'
      USING ERRCODE = '23514';
  END IF;

  IF v_validate_personel_assignment
     AND NEW.assigned_to_personel IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM public.personel AS assigned_employee_row
       WHERE assigned_employee_row.id = NEW.assigned_to_personel
         AND assigned_employee_row.isletme_id = NEW.isletme_id
     )
  THEN
    RAISE EXCEPTION 'NOTLAR_INVALID_PERSONEL_ASSIGNMENT'
      USING ERRCODE = '23514';
  END IF;

  IF v_validate_user_assignment
     AND NEW.assigned_to_user IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM public.isletmeler AS business_row
       WHERE business_row.id = NEW.isletme_id
         AND business_row.user_id = NEW.assigned_to_user
     )
     AND NOT EXISTS (
       SELECT 1
       FROM public.isletme_users AS member_row
       WHERE member_row.isletme_id = NEW.isletme_id
         AND member_row.user_id = NEW.assigned_to_user
         AND member_row.status = 'active'
     )
  THEN
    RAISE EXCEPTION 'NOTLAR_INVALID_USER_ASSIGNMENT'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.enforce_notlar_identity_v1()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER trg_notlar_enforce_identity_v1
BEFORE INSERT OR UPDATE ON public.notlar
FOR EACH ROW
EXECUTE FUNCTION public.enforce_notlar_identity_v1();


-- ---------------------------------------------------------------------------
-- Eski owner ALL policy'si permissive OR ile yeni politikalari baypas etmesin.
-- Owner da asagidaki dort policy'den, kanonik resolver'in owner=true sonucuyla gecer.
-- ---------------------------------------------------------------------------
ALTER POLICY "Users can manage notlar"
ON public.notlar
TO authenticated
USING (false)
WITH CHECK (false);


-- ---------------------------------------------------------------------------
-- SELECT: serbest/genel not Notlar'a; baglamsal not kaynak modullere aittir.
-- Atamalar hedef modullerin TAMAMINI ister. assigned_to_user yetki vermez,
-- yalniz zaten izinli gorunurlugu hedef kullaniciya daraltir.
-- ---------------------------------------------------------------------------
ALTER POLICY "Shared select notlar"
ON public.notlar
TO authenticated
USING (
  (
    CASE notlar.entity_type
      WHEN 'genel' THEN
        notlar.assigned_to_cari IS NOT NULL
        OR notlar.assigned_to_personel IS NOT NULL
        OR EXISTS (
          SELECT 1
          FROM internal.etkin_yetki(
            notlar.isletme_id,
            'notlar'
          ) AS note_permission
          WHERE note_permission.can_view IS TRUE
        )
      WHEN 'hesap' THEN EXISTS (
        SELECT 1
        FROM internal.etkin_yetki(
          notlar.isletme_id,
          'hesaplar'
        ) AS account_permission
        WHERE account_permission.can_view IS TRUE
      )
      WHEN 'cari' THEN EXISTS (
        SELECT 1
        FROM internal.etkin_yetki(
          notlar.isletme_id,
          'cariler'
        ) AS cari_permission
        WHERE cari_permission.can_view IS TRUE
      )
      WHEN 'personel' THEN EXISTS (
        SELECT 1
        FROM internal.etkin_yetki(
          notlar.isletme_id,
          'personel'
        ) AS employee_permission
        WHERE employee_permission.can_view IS TRUE
      )
      WHEN 'personel_izin' THEN EXISTS (
        SELECT 1
        FROM internal.etkin_yetki(
          notlar.isletme_id,
          'personel'
        ) AS leave_permission
        WHERE leave_permission.can_view IS TRUE
      )
      WHEN 'urun' THEN EXISTS (
        SELECT 1
        FROM internal.etkin_yetki(
          notlar.isletme_id,
          'urunler'
        ) AS product_permission
        WHERE product_permission.can_view IS TRUE
      )
      ELSE false
    END
  )
  AND (
    notlar.assigned_to_cari IS NULL
    OR EXISTS (
      SELECT 1
      FROM internal.etkin_yetki(
        notlar.isletme_id,
        'cariler'
      ) AS assigned_cari_permission
      WHERE assigned_cari_permission.can_view IS TRUE
    )
  )
  AND (
    notlar.assigned_to_personel IS NULL
    OR EXISTS (
      SELECT 1
      FROM internal.etkin_yetki(
        notlar.isletme_id,
        'personel'
      ) AS assigned_employee_permission
      WHERE assigned_employee_permission.can_view IS TRUE
    )
  )
  AND (
    notlar.assigned_to_user IS NULL
    OR notlar.assigned_to_user = auth.uid()
  )
  AND EXISTS (
    SELECT 1
    FROM internal.etkin_yetki(
      notlar.isletme_id,
      'notlar'
    ) AS visibility_permission
    WHERE visibility_permission.can_see_all_users_data IS TRUE
       OR notlar.created_by = auth.uid()
  )
);


-- ---------------------------------------------------------------------------
-- INSERT: exact Notlar create + kaynak/hedef modullerin can_view kesişimi.
-- BEFORE trigger created_by'ı auth.uid() yapar; WITH CHECK istemci spoof'unu kapatir.
-- ---------------------------------------------------------------------------
ALTER POLICY "Shared insert notlar"
ON public.notlar
TO authenticated
WITH CHECK (
  notlar.created_by = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM internal.etkin_yetki(
      notlar.isletme_id,
      'notlar'
    ) AS action_permission
    WHERE action_permission.can_create IS TRUE
  )
  AND (
    CASE notlar.entity_type
      WHEN 'genel' THEN true
      WHEN 'hesap' THEN EXISTS (
        SELECT 1
        FROM internal.etkin_yetki(
          notlar.isletme_id,
          'hesaplar'
        ) AS account_permission
        WHERE account_permission.can_view IS TRUE
      )
      WHEN 'cari' THEN EXISTS (
        SELECT 1
        FROM internal.etkin_yetki(
          notlar.isletme_id,
          'cariler'
        ) AS cari_permission
        WHERE cari_permission.can_view IS TRUE
      )
      WHEN 'personel' THEN EXISTS (
        SELECT 1
        FROM internal.etkin_yetki(
          notlar.isletme_id,
          'personel'
        ) AS employee_permission
        WHERE employee_permission.can_view IS TRUE
      )
      WHEN 'personel_izin' THEN EXISTS (
        SELECT 1
        FROM internal.etkin_yetki(
          notlar.isletme_id,
          'personel'
        ) AS leave_permission
        WHERE leave_permission.can_view IS TRUE
      )
      WHEN 'urun' THEN EXISTS (
        SELECT 1
        FROM internal.etkin_yetki(
          notlar.isletme_id,
          'urunler'
        ) AS product_permission
        WHERE product_permission.can_view IS TRUE
      )
      ELSE false
    END
  )
  AND (
    notlar.assigned_to_cari IS NULL
    OR EXISTS (
      SELECT 1
      FROM internal.etkin_yetki(
        notlar.isletme_id,
        'cariler'
      ) AS assigned_cari_permission
      WHERE assigned_cari_permission.can_view IS TRUE
    )
  )
  AND (
    notlar.assigned_to_personel IS NULL
    OR EXISTS (
      SELECT 1
      FROM internal.etkin_yetki(
        notlar.isletme_id,
        'personel'
      ) AS assigned_employee_permission
      WHERE assigned_employee_permission.can_view IS TRUE
    )
  )
);


-- ---------------------------------------------------------------------------
-- UPDATE: eski/yeni satirda exact own/all + hedef kesişimi. Mevcut satir
-- ayrica global/own gorunurluk ve assigned_to_user hedef kitlesinden gecmelidir.
-- Yeni assigned_to_user WITH CHECK'te daraltilmaz; yetkili yazar notu baskasina
-- atayabilir ve sonrasinda o satiri gormez.
-- ---------------------------------------------------------------------------
ALTER POLICY "Shared update notlar"
ON public.notlar
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM internal.etkin_yetki(
      notlar.isletme_id,
      'notlar'
    ) AS action_permission
    WHERE action_permission.can_update_all IS TRUE
       OR (
         action_permission.can_update_own IS TRUE
         AND notlar.created_by = auth.uid()
       )
  )
  AND EXISTS (
    SELECT 1
    FROM internal.etkin_yetki(
      notlar.isletme_id,
      'notlar'
    ) AS visibility_permission
    WHERE visibility_permission.can_see_all_users_data IS TRUE
       OR notlar.created_by = auth.uid()
  )
  AND (
    notlar.assigned_to_user IS NULL
    OR notlar.assigned_to_user = auth.uid()
  )
  AND (
    CASE notlar.entity_type
      WHEN 'genel' THEN true
      WHEN 'hesap' THEN EXISTS (
        SELECT 1
        FROM internal.etkin_yetki(
          notlar.isletme_id,
          'hesaplar'
        ) AS account_permission
        WHERE account_permission.can_view IS TRUE
      )
      WHEN 'cari' THEN EXISTS (
        SELECT 1
        FROM internal.etkin_yetki(
          notlar.isletme_id,
          'cariler'
        ) AS cari_permission
        WHERE cari_permission.can_view IS TRUE
      )
      WHEN 'personel' THEN EXISTS (
        SELECT 1
        FROM internal.etkin_yetki(
          notlar.isletme_id,
          'personel'
        ) AS employee_permission
        WHERE employee_permission.can_view IS TRUE
      )
      WHEN 'personel_izin' THEN EXISTS (
        SELECT 1
        FROM internal.etkin_yetki(
          notlar.isletme_id,
          'personel'
        ) AS leave_permission
        WHERE leave_permission.can_view IS TRUE
      )
      WHEN 'urun' THEN EXISTS (
        SELECT 1
        FROM internal.etkin_yetki(
          notlar.isletme_id,
          'urunler'
        ) AS product_permission
        WHERE product_permission.can_view IS TRUE
      )
      ELSE false
    END
  )
  AND (
    notlar.assigned_to_cari IS NULL
    OR EXISTS (
      SELECT 1
      FROM internal.etkin_yetki(
        notlar.isletme_id,
        'cariler'
      ) AS assigned_cari_permission
      WHERE assigned_cari_permission.can_view IS TRUE
    )
  )
  AND (
    notlar.assigned_to_personel IS NULL
    OR EXISTS (
      SELECT 1
      FROM internal.etkin_yetki(
        notlar.isletme_id,
        'personel'
      ) AS assigned_employee_permission
      WHERE assigned_employee_permission.can_view IS TRUE
    )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM internal.etkin_yetki(
      notlar.isletme_id,
      'notlar'
    ) AS action_permission
    WHERE action_permission.can_update_all IS TRUE
       OR (
         action_permission.can_update_own IS TRUE
         AND notlar.created_by = auth.uid()
       )
  )
  AND (
    CASE notlar.entity_type
      WHEN 'genel' THEN true
      WHEN 'hesap' THEN EXISTS (
        SELECT 1
        FROM internal.etkin_yetki(
          notlar.isletme_id,
          'hesaplar'
        ) AS account_permission
        WHERE account_permission.can_view IS TRUE
      )
      WHEN 'cari' THEN EXISTS (
        SELECT 1
        FROM internal.etkin_yetki(
          notlar.isletme_id,
          'cariler'
        ) AS cari_permission
        WHERE cari_permission.can_view IS TRUE
      )
      WHEN 'personel' THEN EXISTS (
        SELECT 1
        FROM internal.etkin_yetki(
          notlar.isletme_id,
          'personel'
        ) AS employee_permission
        WHERE employee_permission.can_view IS TRUE
      )
      WHEN 'personel_izin' THEN EXISTS (
        SELECT 1
        FROM internal.etkin_yetki(
          notlar.isletme_id,
          'personel'
        ) AS leave_permission
        WHERE leave_permission.can_view IS TRUE
      )
      WHEN 'urun' THEN EXISTS (
        SELECT 1
        FROM internal.etkin_yetki(
          notlar.isletme_id,
          'urunler'
        ) AS product_permission
        WHERE product_permission.can_view IS TRUE
      )
      ELSE false
    END
  )
  AND (
    notlar.assigned_to_cari IS NULL
    OR EXISTS (
      SELECT 1
      FROM internal.etkin_yetki(
        notlar.isletme_id,
        'cariler'
      ) AS assigned_cari_permission
      WHERE assigned_cari_permission.can_view IS TRUE
    )
  )
  AND (
    notlar.assigned_to_personel IS NULL
    OR EXISTS (
      SELECT 1
      FROM internal.etkin_yetki(
        notlar.isletme_id,
        'personel'
      ) AS assigned_employee_permission
      WHERE assigned_employee_permission.can_view IS TRUE
    )
  )
);


-- ---------------------------------------------------------------------------
-- DELETE: exact own/all + mevcut hedef kesişimi + global/own gorunurluk +
-- assigned_to_user hedef kitlesi. edit_all gizli satiri REST'ten silemez.
-- ---------------------------------------------------------------------------
ALTER POLICY "Shared delete notlar"
ON public.notlar
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM internal.etkin_yetki(
      notlar.isletme_id,
      'notlar'
    ) AS action_permission
    WHERE action_permission.can_delete_all IS TRUE
       OR (
         action_permission.can_delete_own IS TRUE
         AND notlar.created_by = auth.uid()
       )
  )
  AND EXISTS (
    SELECT 1
    FROM internal.etkin_yetki(
      notlar.isletme_id,
      'notlar'
    ) AS visibility_permission
    WHERE visibility_permission.can_see_all_users_data IS TRUE
       OR notlar.created_by = auth.uid()
  )
  AND (
    notlar.assigned_to_user IS NULL
    OR notlar.assigned_to_user = auth.uid()
  )
  AND (
    CASE notlar.entity_type
      WHEN 'genel' THEN true
      WHEN 'hesap' THEN EXISTS (
        SELECT 1
        FROM internal.etkin_yetki(
          notlar.isletme_id,
          'hesaplar'
        ) AS account_permission
        WHERE account_permission.can_view IS TRUE
      )
      WHEN 'cari' THEN EXISTS (
        SELECT 1
        FROM internal.etkin_yetki(
          notlar.isletme_id,
          'cariler'
        ) AS cari_permission
        WHERE cari_permission.can_view IS TRUE
      )
      WHEN 'personel' THEN EXISTS (
        SELECT 1
        FROM internal.etkin_yetki(
          notlar.isletme_id,
          'personel'
        ) AS employee_permission
        WHERE employee_permission.can_view IS TRUE
      )
      WHEN 'personel_izin' THEN EXISTS (
        SELECT 1
        FROM internal.etkin_yetki(
          notlar.isletme_id,
          'personel'
        ) AS leave_permission
        WHERE leave_permission.can_view IS TRUE
      )
      WHEN 'urun' THEN EXISTS (
        SELECT 1
        FROM internal.etkin_yetki(
          notlar.isletme_id,
          'urunler'
        ) AS product_permission
        WHERE product_permission.can_view IS TRUE
      )
      ELSE false
    END
  )
  AND (
    notlar.assigned_to_cari IS NULL
    OR EXISTS (
      SELECT 1
      FROM internal.etkin_yetki(
        notlar.isletme_id,
        'cariler'
      ) AS assigned_cari_permission
      WHERE assigned_cari_permission.can_view IS TRUE
    )
  )
  AND (
    notlar.assigned_to_personel IS NULL
    OR EXISTS (
      SELECT 1
      FROM internal.etkin_yetki(
        notlar.isletme_id,
        'personel'
      ) AS assigned_employee_permission
      WHERE assigned_employee_permission.can_view IS TRUE
    )
  )
);


-- ---------------------------------------------------------------------------
-- Add-only eski client fotograf uyumlulugu.
-- RLS policy OLD/NEW delta karsilastiramaz. Bu trigger, normal update yetkisi
-- olmayan aktorun legacy attach policy'sini baska kolon yazmak icin OR kapisi
-- olarak kullanmasini engeller.
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.enforce_not_photo_attach_delta_v1()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_can_create boolean := false;
  v_has_normal_update boolean := false;
  v_source_allowed boolean := false;
  v_cari_target_allowed boolean := false;
  v_personel_target_allowed boolean := false;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT
    permission_row.can_create IS TRUE,
    permission_row.can_update_all IS TRUE
      OR (
        permission_row.can_update_own IS TRUE
        AND OLD.created_by = v_user_id
      )
  INTO v_can_create, v_has_normal_update
  FROM internal.etkin_yetki(
    OLD.isletme_id,
    'notlar'
  ) AS permission_row;

  -- Normal update yetkilisinin mevcut Shared update notlar davranisini degistirme.
  IF COALESCE(v_has_normal_update, false) THEN
    RETURN NEW;
  END IF;

  CASE OLD.entity_type
    WHEN 'genel' THEN
      v_source_allowed := true;
    WHEN 'hesap' THEN
      SELECT EXISTS (
        SELECT 1
        FROM internal.etkin_yetki(
          OLD.isletme_id,
          'hesaplar'
        ) AS source_permission
        WHERE source_permission.can_view IS TRUE
      ) INTO v_source_allowed;
    WHEN 'cari' THEN
      SELECT EXISTS (
        SELECT 1
        FROM internal.etkin_yetki(
          OLD.isletme_id,
          'cariler'
        ) AS source_permission
        WHERE source_permission.can_view IS TRUE
      ) INTO v_source_allowed;
    WHEN 'personel', 'personel_izin' THEN
      SELECT EXISTS (
        SELECT 1
        FROM internal.etkin_yetki(
          OLD.isletme_id,
          'personel'
        ) AS source_permission
        WHERE source_permission.can_view IS TRUE
      ) INTO v_source_allowed;
    WHEN 'urun' THEN
      SELECT EXISTS (
        SELECT 1
        FROM internal.etkin_yetki(
          OLD.isletme_id,
          'urunler'
        ) AS source_permission
        WHERE source_permission.can_view IS TRUE
      ) INTO v_source_allowed;
    ELSE
      v_source_allowed := false;
  END CASE;

  v_cari_target_allowed := OLD.assigned_to_cari IS NULL OR EXISTS (
    SELECT 1
    FROM internal.etkin_yetki(
      OLD.isletme_id,
      'cariler'
    ) AS target_permission
    WHERE target_permission.can_view IS TRUE
  );
  v_personel_target_allowed :=
    OLD.assigned_to_personel IS NULL OR EXISTS (
      SELECT 1
      FROM internal.etkin_yetki(
        OLD.isletme_id,
        'personel'
      ) AS target_permission
      WHERE target_permission.can_view IS TRUE
    );

  IF NOT COALESCE(v_can_create, false)
     OR OLD.created_by IS DISTINCT FROM v_user_id
     OR OLD.photo_path IS NOT NULL
     OR NEW.photo_path IS NULL
     OR pg_catalog.char_length(NEW.photo_path) > 200
     OR NEW.photo_path !~ (
       '^'
       || OLD.isletme_id::text
       || '/notlar/'
       || OLD.id::text
       || '_[0-9]{10,20}[.]webp$'
     )
     OR NOT COALESCE(v_source_allowed, false)
     OR NOT COALESCE(v_cari_target_allowed, false)
     OR NOT COALESCE(v_personel_target_allowed, false)
     -- Yalniz photo_path ve updated_at degisebilir.
     OR NEW.id IS DISTINCT FROM OLD.id
     OR NEW.isletme_id IS DISTINCT FROM OLD.isletme_id
     OR NEW.entity_type IS DISTINCT FROM OLD.entity_type
     OR NEW.entity_id IS DISTINCT FROM OLD.entity_id
     OR NEW.content IS DISTINCT FROM OLD.content
     OR NEW.is_completed IS DISTINCT FROM OLD.is_completed
     OR NEW.completed_at IS DISTINCT FROM OLD.completed_at
     OR NEW.reminder_date IS DISTINCT FROM OLD.reminder_date
     OR NEW.assigned_to_user IS DISTINCT FROM OLD.assigned_to_user
     OR NEW.assigned_to_cari IS DISTINCT FROM OLD.assigned_to_cari
     OR NEW.assigned_to_personel IS DISTINCT FROM OLD.assigned_to_personel
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
  THEN
    RAISE EXCEPTION 'NOT_PHOTO_ATTACH_NOT_AUTHORIZED'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.enforce_not_photo_attach_delta_v1()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER trg_notlar_enforce_photo_attach_delta_v1
BEFORE UPDATE ON public.notlar
FOR EACH ROW
EXECUTE FUNCTION public.enforce_not_photo_attach_delta_v1();

CREATE POLICY "Shared attach own not photo"
ON public.notlar
FOR UPDATE
TO authenticated
USING (
  notlar.created_by = auth.uid()
  AND notlar.photo_path IS NULL
  AND (
    notlar.assigned_to_user IS NULL
    OR notlar.assigned_to_user = auth.uid()
  )
  AND EXISTS (
    SELECT 1
    FROM internal.etkin_yetki(
      notlar.isletme_id,
      'notlar'
    ) AS action_permission
    WHERE action_permission.can_create IS TRUE
  )
  AND (
    CASE notlar.entity_type
      WHEN 'genel' THEN true
      WHEN 'hesap' THEN EXISTS (
        SELECT 1
        FROM internal.etkin_yetki(
          notlar.isletme_id,
          'hesaplar'
        ) AS source_permission
        WHERE source_permission.can_view IS TRUE
      )
      WHEN 'cari' THEN EXISTS (
        SELECT 1
        FROM internal.etkin_yetki(
          notlar.isletme_id,
          'cariler'
        ) AS source_permission
        WHERE source_permission.can_view IS TRUE
      )
      WHEN 'personel' THEN EXISTS (
        SELECT 1
        FROM internal.etkin_yetki(
          notlar.isletme_id,
          'personel'
        ) AS source_permission
        WHERE source_permission.can_view IS TRUE
      )
      WHEN 'personel_izin' THEN EXISTS (
        SELECT 1
        FROM internal.etkin_yetki(
          notlar.isletme_id,
          'personel'
        ) AS source_permission
        WHERE source_permission.can_view IS TRUE
      )
      WHEN 'urun' THEN EXISTS (
        SELECT 1
        FROM internal.etkin_yetki(
          notlar.isletme_id,
          'urunler'
        ) AS source_permission
        WHERE source_permission.can_view IS TRUE
      )
      ELSE false
    END
  )
  AND (
    notlar.assigned_to_cari IS NULL
    OR EXISTS (
      SELECT 1
      FROM internal.etkin_yetki(
        notlar.isletme_id,
        'cariler'
      ) AS target_permission
      WHERE target_permission.can_view IS TRUE
    )
  )
  AND (
    notlar.assigned_to_personel IS NULL
    OR EXISTS (
      SELECT 1
      FROM internal.etkin_yetki(
        notlar.isletme_id,
        'personel'
      ) AS target_permission
      WHERE target_permission.can_view IS TRUE
    )
  )
)
WITH CHECK (
  notlar.created_by = auth.uid()
  AND notlar.photo_path IS NOT NULL
  AND pg_catalog.char_length(notlar.photo_path) <= 200
  AND notlar.photo_path ~ (
    '^'
    || notlar.isletme_id::text
    || '/notlar/'
    || notlar.id::text
    || '_[0-9]{10,20}[.]webp$'
  )
  AND EXISTS (
    SELECT 1
    FROM internal.etkin_yetki(
      notlar.isletme_id,
      'notlar'
    ) AS action_permission
    WHERE action_permission.can_create IS TRUE
  )
  AND (
    CASE notlar.entity_type
      WHEN 'genel' THEN true
      WHEN 'hesap' THEN EXISTS (
        SELECT 1
        FROM internal.etkin_yetki(
          notlar.isletme_id,
          'hesaplar'
        ) AS source_permission
        WHERE source_permission.can_view IS TRUE
      )
      WHEN 'cari' THEN EXISTS (
        SELECT 1
        FROM internal.etkin_yetki(
          notlar.isletme_id,
          'cariler'
        ) AS source_permission
        WHERE source_permission.can_view IS TRUE
      )
      WHEN 'personel' THEN EXISTS (
        SELECT 1
        FROM internal.etkin_yetki(
          notlar.isletme_id,
          'personel'
        ) AS source_permission
        WHERE source_permission.can_view IS TRUE
      )
      WHEN 'personel_izin' THEN EXISTS (
        SELECT 1
        FROM internal.etkin_yetki(
          notlar.isletme_id,
          'personel'
        ) AS source_permission
        WHERE source_permission.can_view IS TRUE
      )
      WHEN 'urun' THEN EXISTS (
        SELECT 1
        FROM internal.etkin_yetki(
          notlar.isletme_id,
          'urunler'
        ) AS source_permission
        WHERE source_permission.can_view IS TRUE
      )
      ELSE false
    END
  )
  AND (
    notlar.assigned_to_cari IS NULL
    OR EXISTS (
      SELECT 1
      FROM internal.etkin_yetki(
        notlar.isletme_id,
        'cariler'
      ) AS target_permission
      WHERE target_permission.can_view IS TRUE
    )
  )
  AND (
    notlar.assigned_to_personel IS NULL
    OR EXISTS (
      SELECT 1
      FROM internal.etkin_yetki(
        notlar.isletme_id,
        'personel'
      ) AS target_permission
      WHERE target_permission.can_view IS TRUE
    )
  )
);


-- ---------------------------------------------------------------------------
-- Tam not duzenleme RPC'si.
--
-- PostgreSQL UPDATE'te yeni satiri da SELECT RLS hedef kapisindan gecirdigi icin
-- bir notu baska aktif kullaniciya atayan yetkili yazar direct REST UPDATE'te
-- 42501 alir. Bu dar SECURITY DEFINER uc:
--   * eski satirda exact own/all + gorunurluk + current target + context,
--   * yeni patch'te allowlist + ayni-tenant hedef + context,
--   * photo degisiminde tenant/not-id path
-- kontrollerini kendi icinde yapar ve yalniz uuid dondurur.
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.not_guncelle_v1(
  p_isletme_id uuid,
  p_not_id uuid,
  p_patch jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_permission record;
  v_note public.notlar%ROWTYPE;
  v_content text;
  v_is_completed boolean;
  v_completed_at timestamptz;
  v_reminder_date timestamptz;
  v_photo_path text;
  v_assigned_to_user uuid;
  v_assigned_to_cari uuid;
  v_assigned_to_personel uuid;
  v_source_allowed boolean := false;
  v_old_cari_target_allowed boolean := false;
  v_old_personel_target_allowed boolean := false;
  v_new_cari_target_allowed boolean := false;
  v_new_personel_target_allowed boolean := false;
  v_updated_id uuid;
BEGIN
  IF v_user_id IS NULL
     OR p_isletme_id IS NULL
     OR p_not_id IS NULL
     OR p_patch IS NULL
     OR pg_catalog.jsonb_typeof(p_patch) IS DISTINCT FROM 'object'
     OR p_patch = '{}'::jsonb
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.jsonb_object_keys(p_patch) AS key_row(key_name)
       WHERE key_row.key_name <> ALL (
         ARRAY[
           'content',
           'is_completed',
           'completed_at',
           'reminder_date',
           'photo_path',
           'assigned_to_user',
           'assigned_to_cari',
           'assigned_to_personel'
         ]::text[]
       )
     )
  THEN
    RAISE EXCEPTION 'NOT_UPDATE_INVALID_PATCH'
      USING ERRCODE = '22023';
  END IF;

  -- JSON null yalniz nullable alanlarda kabul edilir. PostgreSQL'in gevsek
  -- text->boolean cast'i ("yes", "on" vb.) veya nesne/dizi stringlestirmesi
  -- API sozlesmesini genisletmesin.
  IF (
       p_patch ? 'content'
       AND pg_catalog.jsonb_typeof(p_patch -> 'content')
         IS DISTINCT FROM 'string'
     )
     OR (
       p_patch ? 'is_completed'
       AND pg_catalog.jsonb_typeof(p_patch -> 'is_completed')
         IS DISTINCT FROM 'boolean'
     )
     OR (
       p_patch ? 'completed_at'
       AND pg_catalog.jsonb_typeof(p_patch -> 'completed_at')
         NOT IN ('string', 'null')
     )
     OR (
       p_patch ? 'reminder_date'
       AND pg_catalog.jsonb_typeof(p_patch -> 'reminder_date')
         NOT IN ('string', 'null')
     )
     OR (
       p_patch ? 'photo_path'
       AND pg_catalog.jsonb_typeof(p_patch -> 'photo_path')
         NOT IN ('string', 'null')
     )
     OR (
       p_patch ? 'assigned_to_user'
       AND pg_catalog.jsonb_typeof(p_patch -> 'assigned_to_user')
         NOT IN ('string', 'null')
     )
     OR (
       p_patch ? 'assigned_to_cari'
       AND pg_catalog.jsonb_typeof(p_patch -> 'assigned_to_cari')
         NOT IN ('string', 'null')
     )
     OR (
       p_patch ? 'assigned_to_personel'
       AND pg_catalog.jsonb_typeof(p_patch -> 'assigned_to_personel')
         NOT IN ('string', 'null')
     )
  THEN
    RAISE EXCEPTION 'NOT_UPDATE_INVALID_PATCH'
      USING ERRCODE = '22023';
  END IF;

  SELECT permission_row.*
  INTO v_permission
  FROM internal.etkin_yetki(
    p_isletme_id,
    'notlar'
  ) AS permission_row;

  -- Row lookup'tan once update kabiliyeti: cross-tenant UUID existence oracle yok.
  IF NOT FOUND
     OR NOT (
       v_permission.can_update_all IS TRUE
       OR v_permission.can_update_own IS TRUE
     )
  THEN
    RAISE EXCEPTION 'NOT_UPDATE_NOT_AUTHORIZED'
      USING ERRCODE = '42501';
  END IF;

  SELECT note_row.*
  INTO v_note
  FROM public.notlar AS note_row
  WHERE note_row.id = p_not_id
    AND note_row.isletme_id = p_isletme_id
  FOR UPDATE;

  IF NOT FOUND
     OR NOT (
       v_permission.can_update_all IS TRUE
       OR (
         v_permission.can_update_own IS TRUE
         AND v_note.created_by = v_user_id
       )
     )
     OR NOT (
       v_permission.can_see_all_users_data IS TRUE
       OR v_note.created_by = v_user_id
     )
     OR NOT (
       v_note.assigned_to_user IS NULL
       OR v_note.assigned_to_user = v_user_id
     )
  THEN
    RAISE EXCEPTION 'NOT_UPDATE_NOT_AUTHORIZED'
      USING ERRCODE = '42501';
  END IF;

  CASE v_note.entity_type
    WHEN 'genel' THEN
      v_source_allowed := true;
    WHEN 'hesap' THEN
      SELECT EXISTS (
        SELECT 1
        FROM internal.etkin_yetki(
          p_isletme_id,
          'hesaplar'
        ) AS source_permission
        WHERE source_permission.can_view IS TRUE
      ) INTO v_source_allowed;
    WHEN 'cari' THEN
      SELECT EXISTS (
        SELECT 1
        FROM internal.etkin_yetki(
          p_isletme_id,
          'cariler'
        ) AS source_permission
        WHERE source_permission.can_view IS TRUE
      ) INTO v_source_allowed;
    WHEN 'personel', 'personel_izin' THEN
      SELECT EXISTS (
        SELECT 1
        FROM internal.etkin_yetki(
          p_isletme_id,
          'personel'
        ) AS source_permission
        WHERE source_permission.can_view IS TRUE
      ) INTO v_source_allowed;
    WHEN 'urun' THEN
      SELECT EXISTS (
        SELECT 1
        FROM internal.etkin_yetki(
          p_isletme_id,
          'urunler'
        ) AS source_permission
        WHERE source_permission.can_view IS TRUE
      ) INTO v_source_allowed;
    ELSE
      v_source_allowed := false;
  END CASE;

  v_old_cari_target_allowed := v_note.assigned_to_cari IS NULL OR EXISTS (
    SELECT 1
    FROM internal.etkin_yetki(
      p_isletme_id,
      'cariler'
    ) AS target_permission
    WHERE target_permission.can_view IS TRUE
  );
  v_old_personel_target_allowed :=
    v_note.assigned_to_personel IS NULL OR EXISTS (
      SELECT 1
      FROM internal.etkin_yetki(
        p_isletme_id,
        'personel'
      ) AS target_permission
      WHERE target_permission.can_view IS TRUE
    );

  IF NOT COALESCE(v_source_allowed, false)
     OR NOT COALESCE(v_old_cari_target_allowed, false)
     OR NOT COALESCE(v_old_personel_target_allowed, false)
  THEN
    RAISE EXCEPTION 'NOT_UPDATE_NOT_AUTHORIZED'
      USING ERRCODE = '42501';
  END IF;

  BEGIN
    v_content := CASE
      WHEN p_patch ? 'content' THEN p_patch ->> 'content'
      ELSE v_note.content
    END;
    v_is_completed := CASE
      WHEN p_patch ? 'is_completed'
        THEN (p_patch ->> 'is_completed')::boolean
      ELSE v_note.is_completed
    END;
    v_completed_at := CASE
      WHEN p_patch ? 'completed_at'
        THEN (p_patch ->> 'completed_at')::timestamptz
      ELSE v_note.completed_at
    END;
    v_reminder_date := CASE
      WHEN p_patch ? 'reminder_date'
        THEN (p_patch ->> 'reminder_date')::timestamptz
      ELSE v_note.reminder_date
    END;
    v_photo_path := CASE
      WHEN p_patch ? 'photo_path' THEN p_patch ->> 'photo_path'
      ELSE v_note.photo_path
    END;
    v_assigned_to_user := CASE
      WHEN p_patch ? 'assigned_to_user'
        THEN (p_patch ->> 'assigned_to_user')::uuid
      ELSE v_note.assigned_to_user
    END;
    v_assigned_to_cari := CASE
      WHEN p_patch ? 'assigned_to_cari'
        THEN (p_patch ->> 'assigned_to_cari')::uuid
      ELSE v_note.assigned_to_cari
    END;
    v_assigned_to_personel := CASE
      WHEN p_patch ? 'assigned_to_personel'
        THEN (p_patch ->> 'assigned_to_personel')::uuid
      ELSE v_note.assigned_to_personel
    END;
  EXCEPTION
    WHEN invalid_text_representation
      OR invalid_datetime_format
      OR datetime_field_overflow
    THEN
      RAISE EXCEPTION 'NOT_UPDATE_INVALID_PATCH'
        USING ERRCODE = '22023';
  END;

  IF v_content IS NULL
     OR v_is_completed IS NULL
  THEN
    RAISE EXCEPTION 'NOT_UPDATE_INVALID_PATCH'
      USING ERRCODE = '22023';
  END IF;

  IF v_photo_path IS DISTINCT FROM v_note.photo_path
     AND v_photo_path IS NOT NULL
     AND (
       pg_catalog.char_length(v_photo_path) > 200
       OR v_photo_path !~ (
         '^'
         || p_isletme_id::text
         || '/notlar/'
         || p_not_id::text
         || '_[0-9]{10,20}[.]webp$'
       )
       OR NOT EXISTS (
         SELECT 1
         FROM storage.objects AS object_row
         WHERE object_row.bucket_id = 'islem-photos'
           AND object_row.name = v_photo_path
           AND object_row.owner_id = v_user_id::text
       )
     )
  THEN
    RAISE EXCEPTION 'NOT_UPDATE_INVALID_PHOTO_REFERENCE'
      USING ERRCODE = '23514';
  END IF;

  -- Yalniz degisen referanslarda same-tenant existence dogrula; mevcut legacy
  -- bozuk referansi iliskisiz metin duzenlemesinde geriye donuk yazmayiz.
  IF v_assigned_to_user IS DISTINCT FROM v_note.assigned_to_user
     AND v_assigned_to_user IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM public.isletmeler AS business_row
       WHERE business_row.id = p_isletme_id
         AND business_row.user_id = v_assigned_to_user
     )
     AND NOT EXISTS (
       SELECT 1
       FROM public.isletme_users AS member_row
       WHERE member_row.isletme_id = p_isletme_id
         AND member_row.user_id = v_assigned_to_user
         AND member_row.status = 'active'
     )
  THEN
    RAISE EXCEPTION 'NOT_UPDATE_INVALID_USER_ASSIGNMENT'
      USING ERRCODE = '23514';
  END IF;

  IF v_assigned_to_cari IS DISTINCT FROM v_note.assigned_to_cari
     AND v_assigned_to_cari IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM public.cariler AS cari_row
       WHERE cari_row.id = v_assigned_to_cari
         AND cari_row.isletme_id = p_isletme_id
     )
  THEN
    RAISE EXCEPTION 'NOT_UPDATE_INVALID_CARI_ASSIGNMENT'
      USING ERRCODE = '23514';
  END IF;

  IF v_assigned_to_personel IS DISTINCT FROM v_note.assigned_to_personel
     AND v_assigned_to_personel IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM public.personel AS employee_row
       WHERE employee_row.id = v_assigned_to_personel
         AND employee_row.isletme_id = p_isletme_id
     )
  THEN
    RAISE EXCEPTION 'NOT_UPDATE_INVALID_PERSONEL_ASSIGNMENT'
      USING ERRCODE = '23514';
  END IF;

  v_new_cari_target_allowed := v_assigned_to_cari IS NULL OR EXISTS (
    SELECT 1
    FROM internal.etkin_yetki(
      p_isletme_id,
      'cariler'
    ) AS target_permission
    WHERE target_permission.can_view IS TRUE
  );
  v_new_personel_target_allowed :=
    v_assigned_to_personel IS NULL OR EXISTS (
      SELECT 1
      FROM internal.etkin_yetki(
        p_isletme_id,
        'personel'
      ) AS target_permission
      WHERE target_permission.can_view IS TRUE
    );

  IF NOT COALESCE(v_new_cari_target_allowed, false)
     OR NOT COALESCE(v_new_personel_target_allowed, false)
  THEN
    RAISE EXCEPTION 'NOT_UPDATE_NOT_AUTHORIZED'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.notlar AS note_row
  SET
    content = v_content,
    is_completed = v_is_completed,
    completed_at = v_completed_at,
    reminder_date = v_reminder_date,
    photo_path = v_photo_path,
    assigned_to_user = v_assigned_to_user,
    assigned_to_cari = v_assigned_to_cari,
    assigned_to_personel = v_assigned_to_personel,
    updated_at = pg_catalog.clock_timestamp()
  WHERE note_row.id = p_not_id
    AND note_row.isletme_id = p_isletme_id
  RETURNING note_row.id INTO v_updated_id;

  IF v_updated_id IS DISTINCT FROM p_not_id THEN
    RAISE EXCEPTION 'NOT_UPDATE_NOT_AUTHORIZED'
      USING ERRCODE = '42501';
  END IF;

  RETURN v_updated_id;
END;
$function$;

ALTER FUNCTION public.not_guncelle_v1(uuid, uuid, jsonb)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION public.not_guncelle_v1(uuid, uuid, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.not_guncelle_v1(uuid, uuid, jsonb)
  TO authenticated;


-- ---------------------------------------------------------------------------
-- Data API grant katmani: anon tamamen kapali; authenticated yalniz CRUD.
-- service_role mevcut bakim kabiliyetlerini korur.
-- ---------------------------------------------------------------------------
REVOKE ALL ON TABLE public.notlar FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.notlar TO authenticated;


-- ---------------------------------------------------------------------------
-- Postcondition: policy komut/rol sekli, trigger, fonksiyon ve grantlar kilitli.
-- ---------------------------------------------------------------------------
DO $notlar_postcondition$
DECLARE
  v_table_oid oid := pg_catalog.to_regclass('public.notlar');
  v_function_oid oid := pg_catalog.to_regprocedure(
    'public.enforce_notlar_identity_v1()'
  );
  v_authenticated_oid oid := (
    SELECT role_row.oid
    FROM pg_catalog.pg_roles AS role_row
    WHERE role_row.rolname = 'authenticated'
  );
  v_policy_count bigint;
  v_bad_policy_count bigint;
  v_trigger_count bigint;
  v_function_owner text;
  v_function_result text;
  v_function_secdef boolean;
  v_function_config text[];
  v_public_function_execute boolean;
  v_public_table_privilege boolean;
  v_column_acl_count bigint;
BEGIN
  IF v_table_oid IS NULL
     OR v_function_oid IS NULL
     OR v_authenticated_oid IS NULL
  THEN
    RAISE EXCEPTION 'P0-S9 postcondition: zorunlu nesne/rol bulunamadi';
  END IF;

  SELECT pg_catalog.count(*)
  INTO v_policy_count
  FROM pg_catalog.pg_policy AS policy_row
  WHERE policy_row.polrelid = v_table_oid;

  SELECT pg_catalog.count(*)
  INTO v_bad_policy_count
  FROM pg_catalog.pg_policy AS policy_row
  WHERE policy_row.polrelid = v_table_oid
    AND (
      policy_row.polroles IS DISTINCT FROM
        ARRAY[v_authenticated_oid]::oid[]
      OR (
        policy_row.polname = 'Users can manage notlar'
        AND (
          pg_catalog.pg_get_expr(
            policy_row.polqual,
            policy_row.polrelid
          ) IS DISTINCT FROM 'false'
          OR pg_catalog.pg_get_expr(
            policy_row.polwithcheck,
            policy_row.polrelid
          ) IS DISTINCT FROM 'false'
        )
      )
      OR (
        policy_row.polname <> 'Users can manage notlar'
        AND (
          COALESCE(
            pg_catalog.pg_get_expr(
              policy_row.polqual,
              policy_row.polrelid
            ),
            ''
          )
          || COALESCE(
            pg_catalog.pg_get_expr(
              policy_row.polwithcheck,
              policy_row.polrelid
            ),
            ''
          )
        ) NOT LIKE '%internal.etkin_yetki%'
      )
    );

  IF v_policy_count IS DISTINCT FROM 6
     OR v_bad_policy_count IS DISTINCT FROM 0
     OR NOT EXISTS (
       SELECT 1
       FROM pg_catalog.pg_policy AS policy_row
       WHERE policy_row.polrelid = v_table_oid
         AND policy_row.polname = 'Shared select notlar'
         AND policy_row.polcmd = 'r'
         AND policy_row.polqual IS NOT NULL
         AND policy_row.polwithcheck IS NULL
     )
     OR NOT EXISTS (
       SELECT 1
       FROM pg_catalog.pg_policy AS policy_row
       WHERE policy_row.polrelid = v_table_oid
         AND policy_row.polname = 'Shared attach own not photo'
         AND policy_row.polcmd = 'w'
         AND policy_row.polqual IS NOT NULL
         AND policy_row.polwithcheck IS NOT NULL
     )
     OR NOT EXISTS (
       SELECT 1
       FROM pg_catalog.pg_policy AS policy_row
       WHERE policy_row.polrelid = v_table_oid
         AND policy_row.polname = 'Shared insert notlar'
         AND policy_row.polcmd = 'a'
         AND policy_row.polqual IS NULL
         AND policy_row.polwithcheck IS NOT NULL
     )
     OR NOT EXISTS (
       SELECT 1
       FROM pg_catalog.pg_policy AS policy_row
       WHERE policy_row.polrelid = v_table_oid
         AND policy_row.polname = 'Shared update notlar'
         AND policy_row.polcmd = 'w'
         AND policy_row.polqual IS NOT NULL
         AND policy_row.polwithcheck IS NOT NULL
     )
     OR NOT EXISTS (
       SELECT 1
       FROM pg_catalog.pg_policy AS policy_row
       WHERE policy_row.polrelid = v_table_oid
         AND policy_row.polname = 'Shared delete notlar'
         AND policy_row.polcmd = 'd'
         AND policy_row.polqual IS NOT NULL
         AND policy_row.polwithcheck IS NULL
     )
  THEN
    RAISE EXCEPTION
      'P0-S9 postcondition: policy sozlesmesi saglanmadi '
      '(count=%, bad=%)',
      v_policy_count,
      v_bad_policy_count;
  END IF;

  SELECT pg_catalog.count(*)
  INTO v_trigger_count
  FROM pg_catalog.pg_trigger AS trigger_row
  WHERE trigger_row.tgrelid = v_table_oid
    AND NOT trigger_row.tgisinternal
    AND trigger_row.tgname = 'trg_notlar_enforce_identity_v1'
    AND trigger_row.tgenabled = 'O'
    AND trigger_row.tgfoid = v_function_oid;

  SELECT
    pg_catalog.pg_get_userbyid(function_row.proowner),
    pg_catalog.pg_get_function_result(function_row.oid),
    function_row.prosecdef,
    function_row.proconfig,
    EXISTS (
      SELECT 1
      FROM pg_catalog.aclexplode(
        COALESCE(
          function_row.proacl,
          pg_catalog.acldefault('f', function_row.proowner)
        )
      ) AS privilege_row
      WHERE privilege_row.grantee = 0
        AND privilege_row.privilege_type = 'EXECUTE'
    )
  INTO
    v_function_owner,
    v_function_result,
    v_function_secdef,
    v_function_config,
    v_public_function_execute
  FROM pg_catalog.pg_proc AS function_row
  WHERE function_row.oid = v_function_oid;

  IF v_trigger_count IS DISTINCT FROM 1
     OR v_function_owner IS DISTINCT FROM 'postgres'
     OR v_function_result IS DISTINCT FROM 'trigger'
     OR v_function_secdef IS DISTINCT FROM true
     OR v_function_config IS DISTINCT FROM
       ARRAY['search_path=pg_catalog']::text[]
     OR v_public_function_execute IS DISTINCT FROM false
     OR pg_catalog.has_function_privilege(
       'anon',
       v_function_oid,
       'EXECUTE'
     )
     OR pg_catalog.has_function_privilege(
       'authenticated',
       v_function_oid,
       'EXECUTE'
     )
     OR pg_catalog.has_function_privilege(
       'service_role',
       v_function_oid,
       'EXECUTE'
     )
  THEN
    RAISE EXCEPTION
      'P0-S9 postcondition: trigger/function sozlesmesi saglanmadi';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class AS table_row
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(
        table_row.relacl,
        pg_catalog.acldefault('r', table_row.relowner)
      )
    ) AS privilege_row
    WHERE table_row.oid = v_table_oid
      AND privilege_row.grantee = 0
      AND privilege_row.privilege_type IN (
        'SELECT',
        'INSERT',
        'UPDATE',
        'DELETE'
      )
  )
  INTO v_public_table_privilege;

  SELECT pg_catalog.count(*)
  INTO v_column_acl_count
  FROM pg_catalog.pg_attribute AS attribute_row
  WHERE attribute_row.attrelid = v_table_oid
    AND attribute_row.attnum > 0
    AND NOT attribute_row.attisdropped
    AND attribute_row.attacl IS NOT NULL;

  IF v_public_table_privilege IS DISTINCT FROM false
     OR v_column_acl_count IS DISTINCT FROM 0
     OR pg_catalog.has_table_privilege('anon', v_table_oid, 'SELECT')
     OR pg_catalog.has_table_privilege('anon', v_table_oid, 'INSERT')
     OR pg_catalog.has_table_privilege('anon', v_table_oid, 'UPDATE')
     OR pg_catalog.has_table_privilege('anon', v_table_oid, 'DELETE')
     OR pg_catalog.has_table_privilege('authenticated', v_table_oid, 'TRUNCATE')
     OR pg_catalog.has_table_privilege('authenticated', v_table_oid, 'REFERENCES')
     OR pg_catalog.has_table_privilege('authenticated', v_table_oid, 'TRIGGER')
     OR NOT pg_catalog.has_table_privilege(
       'authenticated',
       v_table_oid,
       'SELECT'
     )
     OR NOT pg_catalog.has_table_privilege(
       'authenticated',
       v_table_oid,
       'INSERT'
     )
     OR NOT pg_catalog.has_table_privilege(
       'authenticated',
       v_table_oid,
       'UPDATE'
     )
     OR NOT pg_catalog.has_table_privilege(
       'authenticated',
       v_table_oid,
       'DELETE'
     )
  THEN
    RAISE EXCEPTION
      'P0-S9 postcondition: tablo grant sozlesmesi saglanmadi';
  END IF;
END;
$notlar_postcondition$;


-- Dar legacy fotograf policy/trigger'inin ACL ve sekil postcondition'i.
DO $not_photo_attach_postcondition$
DECLARE
  v_table_oid oid := pg_catalog.to_regclass('public.notlar');
  v_delta_function_oid oid := pg_catalog.to_regprocedure(
    'public.enforce_not_photo_attach_delta_v1()'
  );
  v_authenticated_oid oid := (
    SELECT role_row.oid
    FROM pg_catalog.pg_roles AS role_row
    WHERE role_row.rolname = 'authenticated'
  );
  v_policy_count bigint;
  v_trigger_count bigint;
  v_delta_result text;
  v_delta_secdef boolean;
  v_delta_config text[];
BEGIN
  IF v_table_oid IS NULL
     OR v_delta_function_oid IS NULL
     OR v_authenticated_oid IS NULL
  THEN
    RAISE EXCEPTION 'P0-S9 photo postcondition: zorunlu nesne bulunamadi';
  END IF;

  SELECT pg_catalog.count(*)
  INTO v_policy_count
  FROM pg_catalog.pg_policy AS policy_row
  WHERE policy_row.polrelid = v_table_oid
    AND policy_row.polname = 'Shared attach own not photo'
    AND policy_row.polcmd = 'w'
    AND policy_row.polroles =
      ARRAY[v_authenticated_oid]::oid[]
    AND policy_row.polqual IS NOT NULL
    AND policy_row.polwithcheck IS NOT NULL
    AND pg_catalog.pg_get_expr(
      policy_row.polqual,
      policy_row.polrelid
    ) LIKE '%created_by = auth.uid()%'
    AND pg_catalog.pg_get_expr(
      policy_row.polqual,
      policy_row.polrelid
    ) LIKE '%photo_path IS NULL%'
    AND pg_catalog.pg_get_expr(
      policy_row.polwithcheck,
      policy_row.polrelid
    ) LIKE '%[0-9]{10,20}[.]webp$%';

  SELECT pg_catalog.count(*)
  INTO v_trigger_count
  FROM pg_catalog.pg_trigger AS trigger_row
  WHERE trigger_row.tgrelid = v_table_oid
    AND NOT trigger_row.tgisinternal
    AND trigger_row.tgname =
      'trg_notlar_enforce_photo_attach_delta_v1'
    AND trigger_row.tgfoid = v_delta_function_oid
    AND trigger_row.tgenabled = 'O';

  SELECT
    pg_catalog.pg_get_function_result(function_row.oid),
    function_row.prosecdef,
    function_row.proconfig
  INTO v_delta_result, v_delta_secdef, v_delta_config
  FROM pg_catalog.pg_proc AS function_row
  WHERE function_row.oid = v_delta_function_oid;

  IF v_policy_count IS DISTINCT FROM 1
     OR v_trigger_count IS DISTINCT FROM 1
     OR v_delta_result IS DISTINCT FROM 'trigger'
     OR v_delta_secdef IS DISTINCT FROM false
     OR v_delta_config IS DISTINCT FROM
       ARRAY['search_path=pg_catalog']::text[]
     OR pg_catalog.has_function_privilege(
       'anon',
       v_delta_function_oid,
       'EXECUTE'
     )
     OR pg_catalog.has_function_privilege(
       'authenticated',
       v_delta_function_oid,
       'EXECUTE'
     )
     OR pg_catalog.has_function_privilege(
       'service_role',
       v_delta_function_oid,
       'EXECUTE'
     )
  THEN
    RAISE EXCEPTION
      'P0-S9 photo postcondition: policy/trigger sozlesmesi saglanmadi '
      '(policy=%, trigger=%)',
      v_policy_count,
      v_trigger_count;
  END IF;
END;
$not_photo_attach_postcondition$;


DO $not_update_rpc_postcondition$
DECLARE
  v_function_oid oid := pg_catalog.to_regprocedure(
    'public.not_guncelle_v1(uuid,uuid,jsonb)'
  );
  v_owner text;
  v_result text;
  v_secdef boolean;
  v_volatility "char";
  v_config text[];
BEGIN
  IF v_function_oid IS NULL THEN
    RAISE EXCEPTION 'P0-S9 update RPC postcondition: function bulunamadi';
  END IF;

  SELECT
    pg_catalog.pg_get_userbyid(function_row.proowner),
    pg_catalog.pg_get_function_result(function_row.oid),
    function_row.prosecdef,
    function_row.provolatile,
    function_row.proconfig
  INTO v_owner, v_result, v_secdef, v_volatility, v_config
  FROM pg_catalog.pg_proc AS function_row
  WHERE function_row.oid = v_function_oid;

  IF v_owner IS DISTINCT FROM 'postgres'
     OR v_result IS DISTINCT FROM 'uuid'
     OR v_secdef IS DISTINCT FROM true
     OR v_volatility IS DISTINCT FROM 'v'
     OR v_config IS DISTINCT FROM
       ARRAY['search_path=pg_catalog']::text[]
     OR pg_catalog.has_function_privilege(
       'anon',
       v_function_oid,
       'EXECUTE'
     )
     OR NOT pg_catalog.has_function_privilege(
       'authenticated',
       v_function_oid,
       'EXECUTE'
     )
     OR pg_catalog.has_function_privilege(
       'service_role',
       v_function_oid,
       'EXECUTE'
     )
  THEN
    RAISE EXCEPTION
      'P0-S9 update RPC postcondition: function/ACL sozlesmesi saglanmadi';
  END IF;
END;
$not_update_rpc_postcondition$;

RESET statement_timeout;
RESET lock_timeout;
