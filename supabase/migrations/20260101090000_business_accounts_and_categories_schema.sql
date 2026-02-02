-- İşletme Tablosu
CREATE TABLE isletmeler (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(20),
  address TEXT,
  tax_number VARCHAR(20),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Hesaplar (Kasalar) Tablosu
CREATE TABLE hesaplar (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  isletme_id UUID REFERENCES isletmeler(id) ON DELETE CASCADE NOT NULL,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(20) NOT NULL CHECK (type IN ('nakit', 'banka', 'kredi_karti', 'diger')),
  balance DECIMAL(15,2) DEFAULT 0,
  description TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Kategoriler Tablosu
CREATE TABLE kategoriler (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  isletme_id UUID REFERENCES isletmeler(id) ON DELETE CASCADE NOT NULL,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(10) NOT NULL CHECK (type IN ('gelir', 'gider')),
  icon VARCHAR(50),
  color VARCHAR(7),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexler
CREATE INDEX idx_hesaplar_isletme ON hesaplar(isletme_id);
CREATE INDEX idx_kategoriler_isletme ON kategoriler(isletme_id);
