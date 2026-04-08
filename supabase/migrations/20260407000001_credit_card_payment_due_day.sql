-- Add payment_due_day column to hesaplar for credit card accounts
-- Stores the day of month (1-31) when credit card payment is due
-- Nullable: existing rows get NULL (no impact on current users)
ALTER TABLE hesaplar ADD COLUMN IF NOT EXISTS payment_due_day INTEGER;

-- Add check constraint for valid day range (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'hesaplar_payment_due_day_check'
  ) THEN
    ALTER TABLE hesaplar ADD CONSTRAINT hesaplar_payment_due_day_check
      CHECK (payment_due_day IS NULL OR (payment_due_day >= 1 AND payment_due_day <= 31));
  END IF;
END $$;
