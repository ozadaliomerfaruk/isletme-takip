-- Migration: Convert birim_type from enum to text
-- Date: 2026-02-03
-- Reason: Allow flexible unit types without requiring migrations for new units

-- Step 1: Alter the column from enum to text
ALTER TABLE urunler
ALTER COLUMN birim TYPE text USING birim::text;

-- Step 2: Drop the old enum type
DROP TYPE IF EXISTS birim_type;

-- Note: Unit validation is now handled in the frontend application
-- Valid units are defined in src/types/database.ts as BirimType
