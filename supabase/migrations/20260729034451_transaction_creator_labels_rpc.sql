-- =============================================================================
-- Canli migration surumu: 20260729034451
-- S-12b: İşlem oluşturan ortak kullanıcıların tenant-bazlı görünen adları
-- =============================================================================
-- Yalnız additive, salt-okunur bir RPC ekler:
--   * mevcut tablo/veri/policy/grant davranışını değiştirmez;
--   * yalnız user_id + member_label döndürür;
--   * owner veya aynı işletmedeki aktif ortak kullanıcı çağırabilir;
--   * yalnız gerçekten işlem oluşturmuş üyeleri döndürür;
--   * hedef üyelikte status filtresi yoktur; kaldırılmış/askıdaki üyelerin
--     tarihsel işlem etiketleri korunur.
--
-- Eski client etkisi: Yok. Eski istemciler mevcut tablo sorgularını ve RLS
-- davranışını kullanmaya devam eder.
-- =============================================================================

CREATE FUNCTION public.get_transaction_creator_labels(p_isletme_id uuid)
RETURNS TABLE (
  user_id uuid,
  member_label text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT
    target.user_id,
    target.member_label
  FROM public.isletme_users AS target
  WHERE target.isletme_id = p_isletme_id
    AND EXISTS (
      SELECT 1
      FROM public.islemler AS transaction_row
      WHERE transaction_row.isletme_id = p_isletme_id
        AND transaction_row.created_by = target.user_id
    )
    AND (
      EXISTS (
        SELECT 1
        FROM public.isletmeler AS business
        WHERE business.id = p_isletme_id
          AND business.user_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1
        FROM public.isletme_users AS viewer
        WHERE viewer.isletme_id = p_isletme_id
          AND viewer.user_id = auth.uid()
          AND viewer.status = 'active'
      )
    )
  ORDER BY target.user_id;
$function$;

REVOKE ALL ON FUNCTION public.get_transaction_creator_labels(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_transaction_creator_labels(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.get_transaction_creator_labels(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_transaction_creator_labels(uuid) TO authenticated;
