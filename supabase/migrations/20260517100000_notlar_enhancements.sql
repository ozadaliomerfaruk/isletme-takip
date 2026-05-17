-- Enhance notlar table with completion, reminder, photo, and assignment features
ALTER TABLE notlar
  ADD COLUMN IF NOT EXISTS is_completed BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reminder_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS photo_path TEXT,
  ADD COLUMN IF NOT EXISTS assigned_to_user UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_to_cari UUID REFERENCES cariler(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_to_personel UUID REFERENCES personel(id) ON DELETE SET NULL;

-- Index for reminder queries (only rows with a reminder)
CREATE INDEX IF NOT EXISTS idx_notlar_reminder ON notlar(reminder_date) WHERE reminder_date IS NOT NULL;

-- Index for incomplete notes per isletme
CREATE INDEX IF NOT EXISTS idx_notlar_incomplete ON notlar(isletme_id, is_completed) WHERE is_completed = false;
