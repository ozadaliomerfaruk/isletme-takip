-- Fix: ekstre_link_olustur "function gen_random_bytes(integer) does not exist"
-- pgcrypto 'extensions' şemasında kurulu; fonksiyon SET search_path='public' ile
-- tanımlı olduğundan çıplak gen_random_bytes çözümlenemiyordu (cihaz bulgusu).
-- Çözüm: şema-nitelikli çağrı (search_path'e şema eklemekten daha güvenli).
CREATE OR REPLACE FUNCTION public.ekstre_link_olustur(p_isletme_id uuid, p_cari_id uuid, p_gecerlilik_gun integer DEFAULT 30)
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
  IF NOT EXISTS (SELECT 1 FROM cariler c WHERE c.id = p_cari_id AND c.isletme_id = p_isletme_id) THEN
    RAISE EXCEPTION 'Cari bulunamadi veya bu isletmeye ait degil' USING ERRCODE = '42501';
  END IF;

  SELECT COUNT(*) INTO v_rate FROM cari_ekstre_links
  WHERE isletme_id = p_isletme_id AND created_at > now() - interval '1 hour';
  IF v_rate >= 10 THEN
    RAISE EXCEPTION 'Cok fazla link olusturuldu, lutfen daha sonra deneyin' USING ERRCODE = 'P0001';
  END IF;

  UPDATE cari_ekstre_links SET revoked = true
  WHERE cari_id = p_cari_id AND isletme_id = p_isletme_id AND NOT revoked;

  v_token := encode(extensions.gen_random_bytes(24), 'hex');
  v_expires := now() + make_interval(days => v_gun);

  INSERT INTO cari_ekstre_links (token, isletme_id, cari_id, created_by, expires_at)
  VALUES (v_token, p_isletme_id, p_cari_id, auth.uid(), v_expires);

  RETURN jsonb_build_object('token', v_token, 'expires_at', v_expires);
END;
$function$;
