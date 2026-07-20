-- =============================================================================
-- WEB-EKSTRE — Faz 4 (plan §2.4, §4; karar #4: Supabase edge function barındırma,
-- token API'si barındırmadan BAĞIMSIZ)
-- =============================================================================
-- Anonim tarayıcı için opak token'lı public cari ekstresi. cari_share_codes
-- desenini (üretim RPC + expiry + rate-limit) örnek alır ama AYRI tablo: bu
-- link app-to-app değil, salt-okuma HTML görüntüsü içindir.
--
-- Güvenlik modeli:
--  * Token: 48-hex opak (gen_random_bytes(24)) — tahmin edilemez.
--  * Cari başına TEK aktif link (yenisi eskiyi otomatik iptal eder) + expiry
--    (varsayılan 30 gün, 1-365 kelepçeli) + elle iptal + saatte 10 üretim limiti.
--  * Edge function service-role ile okur; RLS'te anon'a HİÇBİR satır açık değil.
--  * ADDITIVE + geri alınabilir; kullanıcı verisine dokunmaz (salt yeni tablo).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.cari_ekstre_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL UNIQUE,
  isletme_id uuid NOT NULL REFERENCES public.isletmeler(id) ON DELETE CASCADE,
  cari_id uuid NOT NULL REFERENCES public.cariler(id) ON DELETE CASCADE,
  created_by uuid,
  expires_at timestamptz NOT NULL,
  revoked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cari_ekstre_links_token ON public.cari_ekstre_links (token) WHERE NOT revoked;
CREATE INDEX IF NOT EXISTS idx_cari_ekstre_links_cari ON public.cari_ekstre_links (cari_id);

ALTER TABLE public.cari_ekstre_links ENABLE ROW LEVEL SECURITY;

-- Yalnız işletme sahibi/üyesi kendi linklerini GÖREBİLİR (yönetim UI'ı için).
-- Yazma yolu yok (SECURITY DEFINER RPC); anon hiçbir şey göremez.
DROP POLICY IF EXISTS "cari_ekstre_links_select" ON public.cari_ekstre_links;
CREATE POLICY "cari_ekstre_links_select" ON public.cari_ekstre_links
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.isletmeler isl WHERE isl.id = cari_ekstre_links.isletme_id AND isl.user_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.isletme_users iu
      WHERE iu.isletme_id = cari_ekstre_links.isletme_id AND iu.user_id = auth.uid()
        AND iu.status = 'active'
        AND COALESCE((iu.permissions->'modules'->>'cariler')::boolean, false)
    )
  );

-- -----------------------------------------------------------------------------
-- ekstre_link_olustur — cari başına tek aktif link; saatte 10 üretim limiti.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ekstre_link_olustur(
  p_isletme_id uuid,
  p_cari_id uuid,
  p_gecerlilik_gun integer DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_token text;
  v_expires timestamptz;
  v_rate integer;
  v_gun integer := LEAST(GREATEST(COALESCE(p_gecerlilik_gun, 30), 1), 365);
BEGIN
  IF NOT public.user_has_isletme_access(p_isletme_id) THEN
    RAISE EXCEPTION 'Yetkisiz erisim' USING ERRCODE = '42501';
  END IF;
  -- Cari bu işletmeye ait olmalı (çapraz-kiracı guard).
  IF NOT EXISTS (SELECT 1 FROM cariler c WHERE c.id = p_cari_id AND c.isletme_id = p_isletme_id) THEN
    RAISE EXCEPTION 'Cari bulunamadi veya bu isletmeye ait degil' USING ERRCODE = '42501';
  END IF;

  -- Rate limit: işletme başına saatte 10 üretim (cari_share_codes deseni).
  SELECT COUNT(*) INTO v_rate FROM cari_ekstre_links
  WHERE isletme_id = p_isletme_id AND created_at > now() - interval '1 hour';
  IF v_rate >= 10 THEN
    RAISE EXCEPTION 'Cok fazla link olusturuldu, lutfen daha sonra deneyin' USING ERRCODE = 'P0001';
  END IF;

  -- Cari başına tek aktif link: öncekileri iptal et.
  UPDATE cari_ekstre_links SET revoked = true
  WHERE cari_id = p_cari_id AND isletme_id = p_isletme_id AND NOT revoked;

  v_token := encode(gen_random_bytes(24), 'hex');
  v_expires := now() + make_interval(days => v_gun);

  INSERT INTO cari_ekstre_links (token, isletme_id, cari_id, created_by, expires_at)
  VALUES (v_token, p_isletme_id, p_cari_id, auth.uid(), v_expires);

  RETURN jsonb_build_object('token', v_token, 'expires_at', v_expires);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.ekstre_link_olustur(uuid, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ekstre_link_olustur(uuid, uuid, integer) TO authenticated;

-- -----------------------------------------------------------------------------
-- ekstre_link_iptal — carinin aktif linklerini iptal eder.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ekstre_link_iptal(
  p_isletme_id uuid,
  p_cari_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_adet integer;
BEGIN
  IF NOT public.user_has_isletme_access(p_isletme_id) THEN
    RAISE EXCEPTION 'Yetkisiz erisim' USING ERRCODE = '42501';
  END IF;

  UPDATE cari_ekstre_links SET revoked = true
  WHERE cari_id = p_cari_id AND isletme_id = p_isletme_id AND NOT revoked;
  GET DIAGNOSTICS v_adet = ROW_COUNT;
  RETURN v_adet;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.ekstre_link_iptal(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ekstre_link_iptal(uuid, uuid) TO authenticated;
