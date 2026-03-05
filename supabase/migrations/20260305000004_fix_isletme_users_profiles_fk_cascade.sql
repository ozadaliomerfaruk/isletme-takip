-- =============================================================================
-- isletme_users → profiles FK: ON DELETE CASCADE ekle
-- =============================================================================
-- Önceki migration (20260305000003) FK'yı ON DELETE CASCADE olmadan ekledi.
-- auth.users direkt silindiğinde sıra sorunu olabilir:
--   auth.users DELETE → profiles CASCADE sil → isletme_users hala referans veriyor → HATA
-- ON DELETE CASCADE ile isletme_users satırı da otomatik silinir.
-- =============================================================================

ALTER TABLE isletme_users
  DROP CONSTRAINT IF EXISTS isletme_users_user_id_profiles_fk;

ALTER TABLE isletme_users
  ADD CONSTRAINT isletme_users_user_id_profiles_fk
  FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
