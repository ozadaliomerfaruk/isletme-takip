-- =============================================================================
-- S-08: get_income_expense_summary rapor yetkisi + kaynak kesişimi
-- Canli migration version: 20260728224922
-- =============================================================================
--
-- CANLI SNAPSHOT (uygulama oncesi):
--   identity : get_income_expense_summary(uuid,timestamptz,timestamptz)
--   result   : TABLE(type text, total numeric)
--   security : SECURITY DEFINER, search_path=public
--   ACL      : authenticated + service_role; anon/PUBLIC kapali
--
-- SORUN:
-- Fonksiyon yalniz aktif isletme uyeligini kontrol ediyordu. Raporlar modulu
-- kapali aktif bir ortak, RPC'yi dogrudan cagirarak gelir/gider toplamlarini
-- okuyabiliyordu. SECURITY DEFINER oldugu icin tablo RLS'i bu agregasyonu
-- sinirlamiyordu.
--
-- COZUM:
-- 1) Mevcut imza ve sonuc tipi korunur.
-- 2) Raporlar modulu kapali ortak icin bos sonuc doner.
-- 3) Raporlar aciksa K1 kaynak-modul kesisimi uygulanir.
-- 4) can_see_all_users_data=false ise yalniz cagiranin kayitlari toplanir.
-- 5) Owner davranisi ve mevcut hesaplama govdesi korunur.
--
-- VERI GUVENLIGI:
-- Yalniz fonksiyon govdesi degisir. Tablo/kolon/satir ekleme, silme, yeniden
-- adlandirma, backfill veya veri guncelleme YOKTUR.
--
-- ESKI CLIENT:
-- Raporlar kapali ortak eski ana sayfada karti cizmeye devam ederse artik
-- 0,00/bos sonuc gorur; finansal toplam sizmaz ve `(data || [])` akisi crash
-- olmaz. Owner ile raporlar + tum kaynak modulleri acik ortaklarda sonuc aynidir.
-- Kismi kaynak yetkisinde yalniz acik kaynaklar toplama girer.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_income_expense_summary(
  p_isletme_id uuid,
  p_start_date timestamp with time zone,
  p_end_date timestamp with time zone
)
RETURNS TABLE(type text, total numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_is_owner boolean := false;
  v_permissions jsonb := '{}'::jsonb;
  v_level text;
  v_can_see_all_users_data boolean := false;
  v_has_hesaplar boolean := false;
  v_has_cariler boolean := false;
  v_has_personel boolean := false;
BEGIN
  -- Capraz-kiraci ve pasif uyelik kapisi.
  IF NOT public.user_has_isletme_access(p_isletme_id) THEN
    RETURN;
  END IF;

  -- Dashboard da bir rapor yuzeyidir; raporlar kapaliysa sonuc sizdirma.
  IF NOT public.user_has_module_access(p_isletme_id, 'raporlar') THEN
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.isletmeler isl
    WHERE isl.id = p_isletme_id
      AND isl.user_id = v_user_id
  )
  INTO v_is_owner;

  IF NOT v_is_owner THEN
    SELECT iu.permissions
    INTO v_permissions
    FROM public.isletme_users iu
    WHERE iu.isletme_id = p_isletme_id
      AND iu.user_id = v_user_id
      AND iu.status = 'active'
    LIMIT 1;

    IF NOT FOUND THEN
      RETURN;
    END IF;

    -- Yeni izin formatinda bozuk/bilinmeyen level istemciyle ayni bicimde
    -- fail-closed kalir. Legacy kayitta level NULL olabilir.
    v_level := v_permissions->>'level';
    IF v_level IS NOT NULL
       AND v_level NOT IN ('view', 'add', 'edit_own', 'edit_all') THEN
      RETURN;
    END IF;
  END IF;

  v_can_see_all_users_data :=
    v_is_owner
    OR COALESCE(
      (v_permissions->'visibility'->>'can_see_all_users_data')::boolean,
      false
    );
  v_has_hesaplar :=
    v_is_owner
    OR COALESCE((v_permissions->'modules'->>'hesaplar')::boolean, false);
  v_has_cariler :=
    v_is_owner
    OR COALESCE((v_permissions->'modules'->>'cariler')::boolean, false);
  v_has_personel :=
    v_is_owner
    OR COALESCE((v_permissions->'modules'->>'personel')::boolean, false);

  RETURN QUERY
  WITH rates AS (
    SELECT r.rates
    FROM public.exchange_rates r
    WHERE r.base_currency = 'TRY'
    LIMIT 1
  )
  SELECT
    i.type::text,
    SUM(
      CASE
        WHEN COALESCE(h.currency, c.currency, p.currency, 'TRY') = 'TRY'
          THEN i.amount
        ELSE
          i.amount * COALESCE(
            (
              SELECT
                (rt.rates->>COALESCE(h.currency, c.currency, p.currency))::decimal
              FROM rates rt
            ),
            1
          )
      END
    ) AS total
  FROM public.islemler i
  LEFT JOIN public.hesaplar h ON i.hesap_id = h.id
  LEFT JOIN public.hesaplar hh ON i.hedef_hesap_id = hh.id
  LEFT JOIN public.cariler c ON i.cari_id = c.id
  LEFT JOIN public.personel p ON i.personel_id = p.id
  WHERE i.isletme_id = p_isletme_id
    AND i.date >= p_start_date
    AND i.date <= p_end_date
    AND (h.id IS NULL OR h.is_active = true)
    AND (hh.id IS NULL OR hh.is_active = true)
    AND (c.id IS NULL OR c.is_active IS NOT FALSE)
    AND (p.id IS NULL OR p.is_active IS NOT FALSE)
    -- K1: Raporlar kapsayici degil, acik kaynak modullerinin kesisimidir.
    AND CASE
      WHEN i.type IN ('gelir', 'gider', 'transfer')
        THEN v_has_hesaplar
      WHEN i.type IN (
        'cari_alis',
        'cari_satis',
        'cari_odeme',
        'cari_tahsilat',
        'cari_alis_iade',
        'cari_satis_iade'
      )
        THEN v_has_cariler
      WHEN i.type IN ('personel_gider', 'personel_satis')
        THEN v_has_personel
      WHEN i.type IN ('personel_odeme', 'personel_tahsilat')
        THEN v_has_personel AND v_has_hesaplar
      WHEN i.type IN ('personel_izin_hakki', 'personel_izin_kullanimi')
        THEN v_has_personel
      ELSE false
    END
    AND (
      v_can_see_all_users_data
      OR i.created_by = v_user_id
    )
  GROUP BY i.type;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_income_expense_summary(
  uuid,
  timestamp with time zone,
  timestamp with time zone
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_income_expense_summary(
  uuid,
  timestamp with time zone,
  timestamp with time zone
) TO authenticated, service_role;
