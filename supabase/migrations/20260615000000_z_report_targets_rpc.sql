-- =============================================================================
-- get_z_report_targets — Akşam "Z raporu" push'u için gün sonu hedef listesi
--
-- Her aktif işletme için p_date gününün gelir/gider/net'ini ve "bugün işlem
-- sayısı"nı döndürür; ayrıca "son 14 günde aktif mi" bayrağını (uzun süredir
-- pasif işletmeleri hatırlatmayla rahatsız etmemek için edge function kullanır).
--
-- Gelir/gider sınıflandırması uygulamadaki src/constants/islemTypes.ts ile BİREBİR:
--   gelir  = (gelir, cari_satis, personel_satis) - (cari_satis_iade)
--   gider  = (gider, cari_alis, personel_gider)  - (cari_alis_iade)
-- Para birimi get_income_expense_summary ile aynı kuralla TRY'ye çevrilir:
--   txn_currency = COALESCE(hesap.currency, cari.currency, personel.currency, 'TRY')
-- Pasif hesaplardaki işlemler hariç (rapor mantığıyla tutarlı).
--
-- SALT-OKUNUR: hiçbir tabloya/satıra dokunmaz. Yalnızca okuma + toplama yapar.
-- =============================================================================
-- The hosted migration registry records this version as z_report_targets_rpc.
-- The repository previously also contained an invalid second file with the
-- same version for member_label. Keep those additive statements under the
-- canonical recorded version so clean replays match the hosted schema.
ALTER TABLE public.isletme_invites
  ADD COLUMN IF NOT EXISTS member_label text;
ALTER TABLE public.isletme_users
  ADD COLUMN IF NOT EXISTS member_label text;

CREATE OR REPLACE FUNCTION public.accept_isletme_invite(p_code text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_invite record;
BEGIN
  SELECT * INTO v_invite
  FROM isletme_invites
  WHERE invite_code = upper(p_code)
    AND status = 'pending'
    AND expires_at > now()
  FOR UPDATE;

  IF v_invite IS NULL THEN
    RAISE EXCEPTION 'Geçersiz veya süresi dolmuş davet kodu';
  END IF;

  IF EXISTS (
    SELECT 1 FROM isletme_users
    WHERE isletme_id = v_invite.isletme_id
      AND user_id = auth.uid()
      AND status IN ('active', 'suspended')
  ) THEN
    RAISE EXCEPTION 'Bu işletmeye zaten erişiminiz var';
  END IF;

  IF EXISTS (
    SELECT 1 FROM isletmeler
    WHERE id = v_invite.isletme_id
      AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Kendi işletmenize davet kabul edemezsiniz';
  END IF;

  UPDATE isletme_invites
  SET status = 'accepted',
      accepted_at = now(),
      accepted_by = auth.uid()
  WHERE id = v_invite.id;

  INSERT INTO isletme_users (
    isletme_id, user_id, invite_id,
    role, role_label, permissions, status, member_label
  ) VALUES (
    v_invite.isletme_id, auth.uid(), v_invite.id,
    v_invite.role, v_invite.role_label, v_invite.permissions, 'active',
    v_invite.member_label
  )
  ON CONFLICT (isletme_id, user_id) DO UPDATE SET
    invite_id = EXCLUDED.invite_id,
    role = EXCLUDED.role,
    role_label = EXCLUDED.role_label,
    permissions = EXCLUDED.permissions,
    status = 'active',
    member_label = EXCLUDED.member_label,
    updated_at = now();

  RETURN v_invite.isletme_id;
END;
$function$;

-- This column existed in hosted production before it was referenced here, but
-- its original schema migration was missing from the repository. Restore the
-- additive prerequisite so a clean migration replay has the same shape.
ALTER TABLE public.isletmeler
  ADD COLUMN IF NOT EXISTS scheduled_deletion_at timestamptz;

CREATE OR REPLACE FUNCTION public.get_z_report_targets(p_date date)
RETURNS TABLE(
  isletme_id uuid,
  user_id uuid,
  isletme_adi text,
  gelir numeric,
  gider numeric,
  islem_sayisi bigint,
  aktif_son14 boolean
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH rates AS (
    SELECT r.rates FROM exchange_rates r WHERE r.base_currency = 'TRY' LIMIT 1
  ),
  converted AS (
    SELECT
      i.isletme_id,
      i.type,
      i.amount * CASE
        WHEN COALESCE(h.currency, c.currency, p.currency, 'TRY') = 'TRY' THEN 1
        ELSE COALESCE(
          (SELECT (rt.rates->>COALESCE(h.currency, c.currency, p.currency))::numeric FROM rates rt),
          1
        )
      END AS try_amount
    FROM islemler i
    LEFT JOIN hesaplar h ON i.hesap_id = h.id
    LEFT JOIN cariler c ON i.cari_id = c.id
    LEFT JOIN personel p ON i.personel_id = p.id
    -- islemler.date = "timestamp without time zone" ve TR yerel duvar-saatini tutar.
    -- p_date (TR günü) için [gün başı, ertesi gün başı) aralığı: idx_islemler_date'i
    -- kullanır ve get_income_expense_summary'nin aralık yaklaşımıyla tutarlıdır.
    WHERE i.date >= p_date::timestamp
      AND i.date <  (p_date + 1)::timestamp
      AND (h.id IS NULL OR h.is_active = true)
  ),
  gunluk AS (
    SELECT
      cv.isletme_id,
      ROUND(
        COALESCE(SUM(cv.try_amount) FILTER (WHERE cv.type IN ('gelir','cari_satis','personel_satis')), 0)
        - COALESCE(SUM(cv.try_amount) FILTER (WHERE cv.type = 'cari_satis_iade'), 0)
      , 2) AS gelir,
      ROUND(
        COALESCE(SUM(cv.try_amount) FILTER (WHERE cv.type IN ('gider','cari_alis','personel_gider')), 0)
        - COALESCE(SUM(cv.try_amount) FILTER (WHERE cv.type = 'cari_alis_iade'), 0)
      , 2) AS gider,
      COUNT(*) AS islem_sayisi
    FROM converted cv
    GROUP BY cv.isletme_id
  ),
  son14 AS (
    SELECT DISTINCT s.isletme_id
    FROM islemler s
    WHERE s.date >= (p_date - 14)::timestamp
      AND s.date <  (p_date + 1)::timestamp
  )
  SELECT
    iz.id AS isletme_id,
    iz.user_id,
    iz.name AS isletme_adi,
    COALESCE(g.gelir, 0) AS gelir,
    COALESCE(g.gider, 0) AS gider,
    COALESCE(g.islem_sayisi, 0) AS islem_sayisi,
    (s.isletme_id IS NOT NULL) AS aktif_son14
  FROM isletmeler iz
  LEFT JOIN gunluk g ON g.isletme_id = iz.id
  LEFT JOIN son14 s ON s.isletme_id = iz.id
  WHERE iz.is_internal = false
    AND iz.scheduled_deletion_at IS NULL;
$function$;
