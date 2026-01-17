-- Exchange Rates Table
-- Döviz kurlarını saklamak için tablo
-- ExchangeRate-API'den günde 1 kez güncellenir

CREATE TABLE IF NOT EXISTS exchange_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  base_currency TEXT NOT NULL DEFAULT 'TRY',
  rates JSONB NOT NULL DEFAULT '{}',  -- {"USD": 32.5, "EUR": 35.2, "GBP": 41.1, ...}
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source TEXT NOT NULL DEFAULT 'exchangerate-api',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Başlangıç verisi ekle (boş rates)
INSERT INTO exchange_rates (base_currency, rates, source)
VALUES ('TRY', '{}', 'exchangerate-api')
ON CONFLICT DO NOTHING;

-- RLS: Herkes okuyabilir (authenticated users)
ALTER TABLE exchange_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read exchange rates"
  ON exchange_rates
  FOR SELECT
  TO authenticated
  USING (true);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_exchange_rates_base_currency
  ON exchange_rates(base_currency);

-- Comment
COMMENT ON TABLE exchange_rates IS 'Döviz kurları - ExchangeRate-API''den günlük güncellenir';
COMMENT ON COLUMN exchange_rates.rates IS 'JSON format: {"USD": 32.5, "EUR": 35.2} - 1 birim = X TRY';
