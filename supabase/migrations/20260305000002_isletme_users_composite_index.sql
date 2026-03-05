-- =============================================================================
-- isletme_users composite index: RLS policy performans iyileştirmesi
-- =============================================================================
-- Tüm shared user RLS policy'leri şu pattern'i kullanıyor:
--   WHERE iu.isletme_id = X AND iu.user_id = auth.uid() AND iu.status = 'active'
-- Mevcut indexler ayrı ayrı (isletme_id), (user_id), (user_id, status)
-- Bu composite index tüm 3 kolonu tek seferde kapsar.
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_isletme_users_lookup
  ON isletme_users(isletme_id, user_id) WHERE status = 'active';
