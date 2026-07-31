-- =============================================================================
-- Canli migration surumu: 20260729034501
-- S-12c: Davet nickname'ini davet kaydıyla aynı transaction'da oluştur.
--
-- Bu migration yalnız yeni, açıkça sürümlenmiş bir RPC ekler:
--   * Eski create_isletme_invite(uuid,text,text,jsonb,text) fonksiyonuna ve
--     davranışına dokunmaz; eski istemciler aynı uçla çalışmaya devam eder.
--   * Yeni istemci invite + member_label değerini tek INSERT ile atomik yazar.
--   * Migration çalışırken kullanıcı verisine DML/backfill uygulanmaz.
--
-- OLD CLIENT (1.5.x) IMPACT:
--   Eski istemci mevcut 5 parametreli RPC'yi çağırmaya devam eder. Davet oluşturma
--   davranışı değişmez; eski iki-istekli label akışı varsa eskisi gibi çalışır.
--
-- MANUAL TEST MATRIX (migration uygulandığı ortamda):
--   1. Owner + "  Kasiyer Ahmet  " => kod döner, satır label'ı "Kasiyer Ahmet".
--   2. Owner + boş/yalnız boşluk => kod döner, satır label'ı NULL.
--   3. Owner olmayan kullanıcı => davet satırı oluşmaz, owner hatası döner.
--   4. 101 karakter label => davet satırı oluşmaz, 22001 hatası döner.
--   5. Saatte 10 pending davet => 11. çağrı mevcut rate-limit hatasını döndürür.
-- =============================================================================

CREATE FUNCTION public.create_isletme_invite_v2(
  p_isletme_id uuid,
  p_role text,
  p_role_label text DEFAULT NULL,
  p_permissions jsonb DEFAULT NULL,
  p_invited_email text DEFAULT NULL,
  p_member_label text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_code text;
  v_default_permissions jsonb;
  v_member_label text := NULLIF(pg_catalog.btrim(p_member_label), '');
BEGIN
  -- Mevcut create_isletme_invite ile birebir owner kapısı.
  IF NOT EXISTS (
    SELECT 1
    FROM public.isletmeler AS i
    WHERE i.id = p_isletme_id
      AND i.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Sadece işletme sahibi davet oluşturabilir';
  END IF;

  -- Mevcut davranış: işletme başına son bir saatte en fazla 10 pending davet.
  IF (
    SELECT pg_catalog.count(*)
    FROM public.isletme_invites AS invite
    WHERE invite.isletme_id = p_isletme_id
      AND invite.created_at > pg_catalog.now() - INTERVAL '1 hour'
      AND invite.status = 'pending'
  ) >= 10 THEN
    RAISE EXCEPTION 'Çok fazla davet oluşturdunuz. Lütfen 1 saat sonra tekrar deneyin.';
  END IF;

  -- Mevcut rol şablonu/default izin davranışı korunur.
  IF p_permissions IS NULL AND p_role != 'custom' THEN
    SELECT template.default_permissions
    INTO v_default_permissions
    FROM public.role_templates AS template
    WHERE template.name = p_role;

    p_permissions := COALESCE(v_default_permissions, '{}'::jsonb);
  END IF;

  -- Kolon TEXT/nullable kalır; yalnız yeni API girdisi ekranda makul bir üst sınıra
  -- bağlanır. Boş veya yalnız boşluk içeren değer NULL olarak saklanır.
  IF pg_catalog.char_length(v_member_label) > 100 THEN
    RAISE EXCEPTION 'Görünen ad en fazla 100 karakter olabilir'
      USING ERRCODE = '22001';
  END IF;

  -- Mevcut 6 karakter kod üretimi ve pending uniqueness davranışı korunur.
  LOOP
    v_code := pg_catalog.upper(
      pg_catalog.substr(
        pg_catalog.md5(
          pg_catalog.random()::text
          || pg_catalog.clock_timestamp()::text
        ),
        1,
        6
      )
    );
    v_code := pg_catalog.translate(v_code, '0O1IL', 'XYZAB');

    EXIT WHEN NOT EXISTS (
      SELECT 1
      FROM public.isletme_invites AS invite
      WHERE invite.invite_code = v_code
        AND invite.status = 'pending'
    );
  END LOOP;

  -- Kod ve görünen ad aynı INSERT/transaction içinde kalıcılaşır.
  INSERT INTO public.isletme_invites (
    isletme_id, invited_by, invite_code, invited_email,
    role, role_label, permissions, member_label
  ) VALUES (
    p_isletme_id, auth.uid(), v_code, p_invited_email,
    p_role, p_role_label, COALESCE(p_permissions, '{}'::jsonb), v_member_label
  );

  RETURN v_code;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.create_isletme_invite_v2(
  uuid, text, text, jsonb, text, text
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.create_isletme_invite_v2(
  uuid, text, text, jsonb, text, text
) TO authenticated;
