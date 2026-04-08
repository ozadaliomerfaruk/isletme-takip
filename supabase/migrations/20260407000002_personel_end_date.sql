-- Add end_date column to personel table for tracking employment end date
-- Nullable: existing rows get NULL (no impact on current users)
ALTER TABLE personel ADD COLUMN IF NOT EXISTS end_date DATE;
