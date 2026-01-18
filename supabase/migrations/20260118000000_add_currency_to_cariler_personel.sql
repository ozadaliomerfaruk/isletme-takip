-- Migration: Add currency column to cariler and personel tables
-- This allows tracking balances in different currencies (USD, EUR, etc.)

-- Add currency column to cariler table
ALTER TABLE cariler
ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'TRY';

-- Add check constraint for valid currencies
ALTER TABLE cariler
ADD CONSTRAINT cariler_currency_check
CHECK (currency IN ('TRY', 'USD', 'EUR', 'GBP', 'XAU', 'XAG'));

-- Add currency column to personel table
ALTER TABLE personel
ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'TRY';

-- Add check constraint for valid currencies
ALTER TABLE personel
ADD CONSTRAINT personel_currency_check
CHECK (currency IN ('TRY', 'USD', 'EUR', 'GBP', 'XAU', 'XAG'));

-- Add comments for documentation
COMMENT ON COLUMN cariler.currency IS 'Currency for this contact balance (TRY, USD, EUR, GBP, XAU, XAG)';
COMMENT ON COLUMN personel.currency IS 'Currency for this staff member balance (TRY, USD, EUR, GBP, XAU, XAG)';
