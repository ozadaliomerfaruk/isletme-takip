-- Personel Tablosu
CREATE TABLE personel (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  isletme_id UUID REFERENCES isletmeler(id) ON DELETE CASCADE NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  phone VARCHAR(20),
  position VARCHAR(100),
  salary DECIMAL(15,2),
  balance DECIMAL(15,2) DEFAULT 0,
  start_date DATE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index
CREATE INDEX idx_personel_isletme ON personel(isletme_id);
