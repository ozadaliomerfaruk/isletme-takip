-- =============================================================================
-- Canli migration surumu: 20260729073717
-- S-12b TAKIP: CREATOR LABEL PROJEKSIYONUNDA KAYIT GORUNURLUGUNU KORU
-- =============================================================================
-- CANLI SNAPSHOT (uygulama oncesi)
--   Imza       : get_transaction_creator_labels(uuid)
--   Sonuc      : TABLE(user_id uuid, member_label text)
--   Nitelik    : STABLE + SECURITY DEFINER + sabit search_path
--   ACL        : postgres/service_role/authenticated EXECUTE
--
-- SORUN
--   Ilk additive RPC aktif tenant uyesi olmayi kontrol ediyor, fakat
--   visibility.can_see_all_users_data=false kuralini projeksiyona tasimiyordu.
--   Boylece islem satiri RLS tarafindan gizlense bile RPC diger islem
--   ureticilerinin user_id + member_label degerlerini dondurebilirdi.
--
-- COZUM
--   Ayni imza ve ayni iki kolon korunur. P-B kanonik resolver hem turetilmis
--   `islemler` gorunurlugunu hem de kaynak modul yetkilerini ve global kayit
--   sahipligi bayragini verir. Bir etiket ancak ureticinin EN AZ BIR islemi:
--     * internal.islem_tipi_modulu(type) allowlist'inde biliniyorsa,
--     * gereken kaynak modullerin TAMAMI gorunurse,
--     * can_see_all_users_data veya created_by=auth.uid() kosulu gecerse
--   doner. Boylece yalniz Cariler acik bir ortak Personel/Hesap islemi uretmis
--   kisilerin etiketini alamaz.
--
-- VERI / ESKI CLIENT GUVENLIGI
--   * Tablo, kolon, policy, trigger veya satir degismez; DML/backfill yoktur.
--   * Owner butun mevcut etiketleri aynen alir. can_view +
--     can_see_all_users_data=true kullanici, yetkili oldugu kaynaklardaki mevcut
--     etiketleri aynen alir. Kaynak modulu olmayan kullanicinin artik etiket
--     almamasi bilincli fail-closed daraltmadir.
--   * false kullanici yalniz kendi uyelik etiketini alabilir; istemci zaten
--     kendi olusturdugu satirda creator etiketi cizmez.
--   * 1.5.x bu yeni creator-label RPC'sini bilmez. Yeni RPC'yi kullanan eski
--     build'lerde yalniz yetkisiz peer etiketleri artik donmez.
--   * Mevcut service_role ACL'i CREATE OR REPLACE ile korunur; PUBLIC/anon
--     kapali, authenticated acik kalir.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_transaction_creator_labels(
  p_isletme_id uuid
)
RETURNS TABLE (
  user_id uuid,
  member_label text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog'
AS $function$
  WITH viewer_permission AS MATERIALIZED (
    SELECT
      transaction_permission.can_view,
      transaction_permission.can_see_all_users_data,
      pg_catalog.array_remove(
        ARRAY[
          CASE WHEN (
            SELECT module_permission.can_view
            FROM internal.etkin_yetki(
              p_isletme_id,
              'hesaplar'
            ) AS module_permission
            LIMIT 1
          ) THEN 'hesaplar' END,
          CASE WHEN (
            SELECT module_permission.can_view
            FROM internal.etkin_yetki(
              p_isletme_id,
              'cariler'
            ) AS module_permission
            LIMIT 1
          ) THEN 'cariler' END,
          CASE WHEN (
            SELECT module_permission.can_view
            FROM internal.etkin_yetki(
              p_isletme_id,
              'personel'
            ) AS module_permission
            LIMIT 1
          ) THEN 'personel' END
        ]::text[],
        NULL
      ) AS visible_modules
    FROM internal.etkin_yetki(
      p_isletme_id,
      'islemler'
    ) AS transaction_permission
    LIMIT 1
  )
  SELECT
    target.user_id,
    target.member_label
  FROM public.isletme_users AS target
  CROSS JOIN viewer_permission
  WHERE viewer_permission.can_view
    AND (
      viewer_permission.can_see_all_users_data
      OR target.user_id = auth.uid()
    )
    AND target.isletme_id = p_isletme_id
    AND EXISTS (
      SELECT 1
      FROM public.islemler AS transaction_row
      CROSS JOIN LATERAL (
        SELECT internal.islem_tipi_modulu(
          transaction_row.type
        ) AS required_modules
      ) AS transaction_mapping
      WHERE transaction_row.isletme_id = p_isletme_id
        AND transaction_row.created_by = target.user_id
        AND transaction_mapping.required_modules IS NOT NULL
        AND viewer_permission.visible_modules
          @> transaction_mapping.required_modules
        AND (
          viewer_permission.can_see_all_users_data
          OR transaction_row.created_by = auth.uid()
        )
    )
  ORDER BY target.user_id;
$function$;

REVOKE ALL
ON FUNCTION public.get_transaction_creator_labels(uuid)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE
ON FUNCTION public.get_transaction_creator_labels(uuid)
TO authenticated;

COMMENT ON FUNCTION public.get_transaction_creator_labels(uuid) IS
  'Tenant-scoped transaction creator labels filtered by canonical type/module visibility and record ownership.';
