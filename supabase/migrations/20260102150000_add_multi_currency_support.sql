 -- Migration: Add multi-currency support
  ALTER TABLE hesaplar
  ADD COLUMN currency TEXT NOT NULL DEFAULT 'TRY';

  ALTER TABLE islemler
  ADD COLUMN source_currency TEXT DEFAULT NULL,
  ADD COLUMN target_currency TEXT DEFAULT NULL,
  ADD COLUMN exchange_rate DECIMAL(18,8) DEFAULT NULL;