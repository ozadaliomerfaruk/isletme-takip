-- Migration: pending_islemler table
-- Purpose: Store skipped transactions from import for later manual correction

CREATE TABLE IF NOT EXISTS pending_islemler (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  isletme_id uuid NOT NULL REFERENCES isletmeler(id) ON DELETE CASCADE,
  import_batch_id uuid NOT NULL,           -- Import session identifier
  row_number int NOT NULL,                 -- Excel row number
  skip_reason text NOT NULL,               -- Why it was skipped

  -- Original parsed data from Excel
  raw_data jsonb NOT NULL,
  -- {
  --   date, type, mappedType, description, category,
  --   account, personel, tedarikci, musteri, karsiHesap,
  --   amount, isExpense, rowNumber
  -- }

  -- User corrections (draft saved as they edit)
  corrections jsonb DEFAULT '{}',
  -- {
  --   hesap_id, cari_id, personel_id, kategori_id,
  --   karsi_hesap_id, type, amount, description, date
  -- }

  status text NOT NULL DEFAULT 'pending',  -- pending | saved | dismissed

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE pending_islemler ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only access pending transactions for their own business
CREATE POLICY "Users can manage own pending transactions"
  ON pending_islemler FOR ALL
  USING (isletme_id IN (
    SELECT id FROM isletmeler WHERE user_id = auth.uid()
  ));

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_pending_islemler_isletme ON pending_islemler(isletme_id);
CREATE INDEX IF NOT EXISTS idx_pending_islemler_status ON pending_islemler(status);
CREATE INDEX IF NOT EXISTS idx_pending_islemler_batch ON pending_islemler(import_batch_id);
CREATE INDEX IF NOT EXISTS idx_pending_islemler_created ON pending_islemler(created_at DESC);

-- Updated at trigger
CREATE OR REPLACE FUNCTION update_pending_islemler_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER pending_islemler_updated_at
  BEFORE UPDATE ON pending_islemler
  FOR EACH ROW
  EXECUTE FUNCTION update_pending_islemler_updated_at();

-- Comment for documentation
COMMENT ON TABLE pending_islemler IS 'Stores skipped transactions from Excel import for manual correction';
COMMENT ON COLUMN pending_islemler.raw_data IS 'Original parsed transaction data from Excel file';
COMMENT ON COLUMN pending_islemler.corrections IS 'User corrections as they fill in missing fields';
COMMENT ON COLUMN pending_islemler.status IS 'pending: awaiting correction, saved: successfully saved to islemler, dismissed: user chose to skip';
