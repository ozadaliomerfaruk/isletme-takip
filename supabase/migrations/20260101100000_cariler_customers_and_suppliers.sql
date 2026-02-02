-- Cariler Tablosu
CREATE TABLE cariler (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  isletme_id UUID REFERENCES isletmeler(id) ON DELETE CASCADE NOT NULL,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(20) NOT NULL CHECK (type IN ('musteri', 'tedarikci')),
  phone VARCHAR(20),
  email VARCHAR(255),
  address TEXT,
  tax_number VARCHAR(20),
  balance DECIMAL(15,2) DEFAULT 0,
  notes TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index
CREATE INDEX idx_cariler_isletme ON cariler(isletme_id);
CREATE INDEX idx_cariler_type ON cariler(isletme_id, type);
