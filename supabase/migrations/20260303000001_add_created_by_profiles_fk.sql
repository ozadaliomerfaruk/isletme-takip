-- =============================================================================
-- Add FK from islemler.created_by -> profiles.id for Supabase join support
-- =============================================================================
-- This allows select queries to join profiles via created_by column
-- e.g. creator:profiles!islemler_created_by_profiles_fk(display_name, email)
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'islemler_created_by_profiles_fk'
    AND table_name = 'islemler'
  ) THEN
    ALTER TABLE islemler
      ADD CONSTRAINT islemler_created_by_profiles_fk
      FOREIGN KEY (created_by) REFERENCES profiles(id);
  END IF;
END $$;
