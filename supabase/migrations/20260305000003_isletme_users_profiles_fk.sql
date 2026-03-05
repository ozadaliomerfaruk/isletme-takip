-- =============================================================================
-- isletme_users → profiles FK: PostgREST join desteği
-- =============================================================================
-- useIsletmeUsers() hook'u .select('*, profile:profiles(*)') kullanıyor.
-- Supabase PostgREST bu join'i çözebilmek için tablolar arası FK gerektirir.
-- isletme_users.user_id şu an sadece auth.users(id)'ye referans veriyor,
-- profiles(id)'ye FK yok → "Could not find a relationship" hatası.
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'isletme_users_user_id_profiles_fk'
      AND table_name = 'isletme_users'
  ) THEN
    ALTER TABLE isletme_users
      ADD CONSTRAINT isletme_users_user_id_profiles_fk
      FOREIGN KEY (user_id) REFERENCES profiles(id);
  END IF;
END $$;
