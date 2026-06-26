-- =============================================================================
-- İşlem audit log çift kaydını düzelt
-- =============================================================================
-- islemler tablosunda audit loglaması ÜÇ trigger ile yapılıyordu:
--   - audit_islemler_changes  AFTER DELETE OR UPDATE -> log_islem_changes()
--       (tek fonksiyonda hem DELETE hem UPDATE loglar; performed_by için
--        COALESCE(auth.uid(), updated_by) ile daha sağlam)
--   - trg_islem_audit_delete  BEFORE DELETE -> log_islem_delete()
--   - trg_islem_audit_update  BEFORE UPDATE -> log_islem_update()
--
-- Sonuç: her DELETE/UPDATE İKİ kez loglanıyordu (log_islem_changes + ayrık olan).
-- Daha sağlam ve tek başına yeterli olan log_islem_changes'i (audit_islemler_changes)
-- KORUYUP, fazlalık trigger ve fonksiyonları düşürüyoruz. Mevcut yinelenen satırlar
-- silinmez (uygulama sorgusunda zaten tekilleştiriliyor); yalnızca BUNDAN SONRA
-- her olay tek kez loglanır.
-- =============================================================================

DROP TRIGGER IF EXISTS trg_islem_audit_delete ON public.islemler;
DROP TRIGGER IF EXISTS trg_islem_audit_update ON public.islemler;

DROP FUNCTION IF EXISTS public.log_islem_delete();
DROP FUNCTION IF EXISTS public.log_islem_update();
