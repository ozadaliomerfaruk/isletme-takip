# Restoran Hesap Kitap - Veritabanı Dokümantasyonu

**Son Güncelleme:** 18 Aralık 2024  
**Versiyon:** 1.1

---

## ⚠️ ÖNEMLİ NOTLAR

```
┌─────────────────────────────────────────────────────────────────┐
│  Veritabanı şeması SIFIRDAN tasarlanacaktır.                   │
│                                                                 │
│  Bu doküman:                                                    │
│  ✅ Yeni şema tasarımı için referans                           │
│  ✅ Offline-ready pattern'ler dahil                            │
│  ✅ RLS kuralları şablonları                                   │
│  ✅ RPC fonksiyon standartları                                 │
└─────────────────────────────────────────────────────────────────┘
```

> **Offline Notu:** Schema'daki `sync_status`, `idempotency_key` gibi alanlar v3.0 offline desteğine hazırlık içindir. MVP'de offline desteklenmez, bu alanlar ileride refactor olmaması için şimdiden eklenmektedir.

> **MVP Varsayımı:** MVP'de tek kullanıcı = tek restoran varsayımı geçerlidir. `restaurant_users` tablosu v2.0 çoklu kullanıcı özelliği için hazırlıktır.

---

## 1. Base Schema Pattern

> Her tablo bu alanları içermelidir (Offline-ready için)

```sql
-- ✅ STANDART TABLO YAPISI
CREATE TABLE example_table (
  -- Primary Key
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- İş Alanları (tabloya özel)
  -- ...
  
  -- Timestamps (Client)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Timestamps (Server - trigger ile)
  server_created_at TIMESTAMPTZ,
  server_updated_at TIMESTAMPTZ,
  
  -- Soft Delete
  deleted_at TIMESTAMPTZ,
  
  -- Idempotency (duplicate önleme)
  idempotency_key TEXT UNIQUE,
  
  -- Sync Status (v3.0 offline için hazırlık)
  sync_status TEXT DEFAULT 'synced' CHECK (sync_status IN ('synced', 'pending', 'failed')),
  
  -- İlişkiler
  restaurant_id UUID REFERENCES restaurants(id) NOT NULL,
  created_by UUID REFERENCES auth.users(id)
);

-- Standart Indexler
CREATE INDEX idx_example_deleted ON example_table(deleted_at);
CREATE INDEX idx_example_restaurant ON example_table(restaurant_id);
CREATE INDEX idx_example_created ON example_table(created_at DESC);
```

---

## 2. Server Timestamp Trigger

```sql
-- Her tablo için uygulanacak
CREATE OR REPLACE FUNCTION update_server_timestamps()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.server_created_at = NOW();
  END IF;
  NEW.server_updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger oluşturma (her tablo için)
CREATE TRIGGER set_server_timestamps
  BEFORE INSERT OR UPDATE ON example_table
  FOR EACH ROW
  EXECUTE FUNCTION update_server_timestamps();
```

---

## 3. MVP Tabloları (v1.0)

### 3.1 restaurants

```sql
CREATE TABLE restaurants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  address TEXT,
  phone TEXT,
  tax_number TEXT,
  tax_office TEXT,
  owner_id UUID REFERENCES auth.users(id) NOT NULL,
  settings JSONB DEFAULT '{}',
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  server_created_at TIMESTAMPTZ,
  server_updated_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ
);
```

### 3.2 profiles

```sql
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  first_name TEXT,
  last_name TEXT,
  phone TEXT,
  avatar_url TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  server_created_at TIMESTAMPTZ,
  server_updated_at TIMESTAMPTZ
);
```

### 3.3 kasalar

```sql
CREATE TABLE kasalar (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID REFERENCES restaurants(id) NOT NULL,
  
  -- İş Alanları
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('nakit', 'banka', 'kredi_karti', 'birikim')),
  currency TEXT NOT NULL DEFAULT 'TRY' CHECK (currency IN ('TRY', 'USD', 'EUR', 'GBP')),
  balance DECIMAL(15,2) NOT NULL DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  include_in_total BOOLEAN DEFAULT true,
  
  -- Kredi Kartı Özel
  credit_limit DECIMAL(15,2),
  statement_day INTEGER CHECK (statement_day BETWEEN 1 AND 31),
  due_day INTEGER CHECK (due_day BETWEEN 1 AND 31),
  
  -- Standart Alanlar
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  server_created_at TIMESTAMPTZ,
  server_updated_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  idempotency_key TEXT UNIQUE,
  sync_status TEXT DEFAULT 'synced',
  created_by UUID REFERENCES auth.users(id)
);

CREATE INDEX idx_kasalar_restaurant ON kasalar(restaurant_id);
CREATE INDEX idx_kasalar_type ON kasalar(type);
CREATE INDEX idx_kasalar_deleted ON kasalar(deleted_at);
```

### 3.4 cariler

```sql
CREATE TABLE cariler (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID REFERENCES restaurants(id) NOT NULL,
  
  -- İş Alanları
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('tedarikci', 'musteri')),
  phone TEXT,
  email TEXT,
  address TEXT,
  tax_number TEXT,
  tax_office TEXT,
  balance DECIMAL(15,2) NOT NULL DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  include_in_total BOOLEAN DEFAULT true,
  notes TEXT,
  
  -- Standart Alanlar
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  server_created_at TIMESTAMPTZ,
  server_updated_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  idempotency_key TEXT UNIQUE,
  sync_status TEXT DEFAULT 'synced',
  created_by UUID REFERENCES auth.users(id)
);

CREATE INDEX idx_cariler_restaurant ON cariler(restaurant_id);
CREATE INDEX idx_cariler_type ON cariler(type);
CREATE INDEX idx_cariler_deleted ON cariler(deleted_at);
```

### 3.5 kategoriler

```sql
CREATE TABLE kategoriler (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID REFERENCES restaurants(id) NOT NULL,
  
  -- İş Alanları
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('gelir', 'gider')),
  parent_id UUID REFERENCES kategoriler(id),
  icon TEXT,
  color TEXT,
  sort_order INTEGER DEFAULT 0,
  is_default BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  
  -- Standart Alanlar
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  server_created_at TIMESTAMPTZ,
  server_updated_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  idempotency_key TEXT UNIQUE,
  sync_status TEXT DEFAULT 'synced',
  created_by UUID REFERENCES auth.users(id)
);

CREATE INDEX idx_kategoriler_restaurant ON kategoriler(restaurant_id);
CREATE INDEX idx_kategoriler_type ON kategoriler(type);
CREATE INDEX idx_kategoriler_parent ON kategoriler(parent_id);
```

### 3.6 personel

```sql
CREATE TABLE personel (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID REFERENCES restaurants(id) NOT NULL,
  
  -- İş Alanları
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  position TEXT,
  start_date DATE,
  salary DECIMAL(15,2),
  balance DECIMAL(15,2) NOT NULL DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  include_in_total BOOLEAN DEFAULT true,
  notes TEXT,
  
  -- Standart Alanlar
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  server_created_at TIMESTAMPTZ,
  server_updated_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  idempotency_key TEXT UNIQUE,
  sync_status TEXT DEFAULT 'synced',
  created_by UUID REFERENCES auth.users(id)
);

CREATE INDEX idx_personel_restaurant ON personel(restaurant_id);
CREATE INDEX idx_personel_deleted ON personel(deleted_at);
```

### 3.7 islemler

```sql
CREATE TABLE islemler (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID REFERENCES restaurants(id) NOT NULL,
  
  -- İş Alanları
  type TEXT NOT NULL CHECK (type IN (
    'gelir', 'gider', 'odeme', 'tahsilat', 
    'transfer', 'alis', 'satis', 'iade'
  )),
  amount DECIMAL(15,2) NOT NULL,
  date DATE NOT NULL,
  description TEXT,
  
  -- İlişkiler
  kasa_id UUID REFERENCES kasalar(id),
  kasa_hedef_id UUID REFERENCES kasalar(id), -- Transfer için
  cari_id UUID REFERENCES cariler(id),
  personel_id UUID REFERENCES personel(id),
  kategori_id UUID REFERENCES kategoriler(id),
  
  -- Gelecek özellikler için
  demirbas_id UUID, -- REFERENCES demirbaslar(id)
  rezervasyon_id UUID, -- REFERENCES rezervasyonlar(id)
  
  -- Standart Alanlar
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  server_created_at TIMESTAMPTZ,
  server_updated_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  idempotency_key TEXT UNIQUE,
  sync_status TEXT DEFAULT 'synced',
  created_by UUID REFERENCES auth.users(id)
);

CREATE INDEX idx_islemler_restaurant ON islemler(restaurant_id);
CREATE INDEX idx_islemler_type ON islemler(type);
CREATE INDEX idx_islemler_date ON islemler(date DESC);
CREATE INDEX idx_islemler_kasa ON islemler(kasa_id);
CREATE INDEX idx_islemler_cari ON islemler(cari_id);
CREATE INDEX idx_islemler_personel ON islemler(personel_id);
CREATE INDEX idx_islemler_deleted ON islemler(deleted_at);
```

---

## 4. İleri Versiyon Tabloları

### 4.1 tekrarlayan_odemeler (v1.1)

```sql
CREATE TABLE tekrarlayan_odemeler (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID REFERENCES restaurants(id) NOT NULL,
  
  name TEXT NOT NULL,
  amount DECIMAL(15,2) NOT NULL,
  period TEXT NOT NULL CHECK (period IN ('gunluk', 'haftalik', '2haftalik', 'aylik', '3aylik', '6aylik', 'yillik')),
  start_date DATE NOT NULL,
  end_date DATE,
  next_date DATE NOT NULL,
  kasa_id UUID REFERENCES kasalar(id),
  cari_id UUID REFERENCES cariler(id),
  kategori_id UUID REFERENCES kategoriler(id),
  reminder_days INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  notes TEXT,
  
  -- Standart Alanlar
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  server_created_at TIMESTAMPTZ,
  server_updated_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  idempotency_key TEXT UNIQUE,
  sync_status TEXT DEFAULT 'synced',
  created_by UUID REFERENCES auth.users(id)
);
```

### 4.2 cek_senetler (v1.1)

```sql
CREATE TABLE cek_senetler (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID REFERENCES restaurants(id) NOT NULL,
  
  type TEXT NOT NULL CHECK (type IN ('cek', 'senet')),
  direction TEXT NOT NULL CHECK (direction IN ('alacak', 'borc')),
  amount DECIMAL(15,2) NOT NULL,
  issue_date DATE NOT NULL,
  due_date DATE NOT NULL,
  status TEXT DEFAULT 'beklemede' CHECK (status IN ('beklemede', 'tahsil', 'odendi', 'karsiliksiz', 'iptal')),
  bank_name TEXT,
  serial_number TEXT,
  cari_id UUID REFERENCES cariler(id),
  notes TEXT,
  
  -- Standart Alanlar
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  server_created_at TIMESTAMPTZ,
  server_updated_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  idempotency_key TEXT UNIQUE,
  sync_status TEXT DEFAULT 'synced',
  created_by UUID REFERENCES auth.users(id)
);
```

### 4.3 demirbaslar (v2.2)

```sql
CREATE TABLE demirbaslar (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID REFERENCES restaurants(id) NOT NULL,
  
  name TEXT NOT NULL,
  category TEXT,
  brand TEXT,
  model TEXT,
  serial_number TEXT,
  purchase_date DATE,
  purchase_price DECIMAL(15,2),
  warranty_end_date DATE,
  location TEXT,
  is_active BOOLEAN DEFAULT true,
  notes TEXT,
  
  -- Standart Alanlar
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  server_created_at TIMESTAMPTZ,
  server_updated_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  idempotency_key TEXT UNIQUE,
  sync_status TEXT DEFAULT 'synced',
  created_by UUID REFERENCES auth.users(id)
);
```

### 4.4 rezervasyonlar (v2.2)

```sql
CREATE TABLE rezervasyonlar (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID REFERENCES restaurants(id) NOT NULL,
  
  customer_name TEXT NOT NULL,
  customer_phone TEXT,
  customer_email TEXT,
  event_type TEXT NOT NULL, -- dugun, nisan, dogum_gunu, kurumsal
  event_date DATE NOT NULL,
  event_time TIME,
  guest_count INTEGER,
  venue TEXT,
  menu_details JSONB,
  price_per_person DECIMAL(15,2),
  total_price DECIMAL(15,2),
  deposit_amount DECIMAL(15,2) DEFAULT 0,
  deposit_date DATE,
  paid_amount DECIMAL(15,2) DEFAULT 0,
  status TEXT DEFAULT 'beklemede' CHECK (status IN ('beklemede', 'onaylandi', 'iptal', 'tamamlandi')),
  notes TEXT,
  
  -- Standart Alanlar
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  server_created_at TIMESTAMPTZ,
  server_updated_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  idempotency_key TEXT UNIQUE,
  sync_status TEXT DEFAULT 'synced',
  created_by UUID REFERENCES auth.users(id)
);

CREATE INDEX idx_rezervasyonlar_date ON rezervasyonlar(event_date);
CREATE INDEX idx_rezervasyonlar_status ON rezervasyonlar(status);
```

---

## 5. RLS (Row Level Security) Policies

### 5.1 Standart RLS Pattern

```sql
-- 1. RLS'i aktif et
ALTER TABLE kasalar ENABLE ROW LEVEL SECURITY;

-- 2. Select policy
CREATE POLICY "Users can view own restaurant kasalar"
  ON kasalar FOR SELECT
  USING (
    restaurant_id IN (
      SELECT restaurant_id FROM restaurant_users
      WHERE user_id = auth.uid()
    )
  );

-- 3. Insert policy
CREATE POLICY "Users can insert to own restaurant"
  ON kasalar FOR INSERT
  WITH CHECK (
    restaurant_id IN (
      SELECT restaurant_id FROM restaurant_users
      WHERE user_id = auth.uid()
    )
  );

-- 4. Update policy
CREATE POLICY "Users can update own restaurant kasalar"
  ON kasalar FOR UPDATE
  USING (
    restaurant_id IN (
      SELECT restaurant_id FROM restaurant_users
      WHERE user_id = auth.uid()
    )
  );

-- 5. Delete policy (soft delete kullanıyoruz ama yine de)
CREATE POLICY "Users can delete own restaurant kasalar"
  ON kasalar FOR DELETE
  USING (
    restaurant_id IN (
      SELECT restaurant_id FROM restaurant_users
      WHERE user_id = auth.uid()
    )
  );
```

### 5.2 restaurant_users Tablosu

```sql
CREATE TABLE restaurant_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID REFERENCES restaurants(id) NOT NULL,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
  permissions JSONB DEFAULT '{}',
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE(restaurant_id, user_id)
);

-- restaurant_users için RLS
ALTER TABLE restaurant_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own memberships"
  ON restaurant_users FOR SELECT
  USING (user_id = auth.uid());
```

---

## 6. Bakiye Stratejisi (Stored Balance)

> ⚠️ **KRİTİK:** Bu sistem **stored balance** (saklanan bakiye) kullanır.

### 6.1 Nedir?

```
STORED BALANCE:
├── kasalar.balance      → Kasa bakiyesi SAKLANIR
├── cariler.balance      → Cari bakiyesi SAKLANIR
├── personel.balance     → Personel bakiyesi SAKLANIR
│
└── Bu alanlar `islemler` tablosundan HER SEFERINDE hesaplanmaz.
    Sadece RPC/DB fonksiyonları üzerinden güncellenir.
```

### 6.2 Neden Stored Balance?

| Stored Balance ✅ | Derived Balance ❌ |
|-------------------|-------------------|
| Hızlı okuma (O(1)) | Her sorguda hesaplama |
| Dashboard anında yüklenir | Yoğun aggregate |
| Offline-ready | İşlem geçmişi bağımlı |

### 6.3 Güncelleme Kuralları

```
BALANCE GÜNCELLEME:
├── SADECE RPC fonksiyonları ile yapılır
│   ├── update_kasa_balance()
│   ├── update_cari_balance()
│   └── update_personel_balance()
│
├── Direct UPDATE YASAK
│   ❌ UPDATE kasalar SET balance = 1000
│
└── İşlem silme = Balance REVERSE
    └── soft_delete_islem() fonksiyonu balance'ı geri alır
```

### 6.4 Tutarlılık Kontrolü (Reconciliation)

> İleride (v2.0+) eklenebilecek rapor:

```sql
-- Stored balance ile hesaplanan balance karşılaştırması
SELECT 
  k.id,
  k.name,
  k.balance as stored_balance,
  COALESCE(SUM(
    CASE 
      WHEN i.type IN ('gelir', 'tahsilat') THEN i.amount
      WHEN i.type IN ('gider', 'odeme', 'transfer') THEN -i.amount
      ELSE 0
    END
  ), 0) as calculated_balance,
  k.balance - COALESCE(SUM(...), 0) as difference
FROM kasalar k
LEFT JOIN islemler i ON i.kasa_id = k.id AND i.deleted_at IS NULL
GROUP BY k.id;
```

---

## 7. RPC Functions (Atomic Operations)

### 7.1 create_islem_atomic

```sql
CREATE OR REPLACE FUNCTION create_islem_atomic(
  p_restaurant_id UUID,
  p_type TEXT,
  p_amount DECIMAL,
  p_date DATE,
  p_description TEXT DEFAULT NULL,
  p_kasa_id UUID DEFAULT NULL,
  p_kasa_hedef_id UUID DEFAULT NULL,
  p_cari_id UUID DEFAULT NULL,
  p_personel_id UUID DEFAULT NULL,
  p_kategori_id UUID DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_islem_id UUID;
  v_user_id UUID;
BEGIN
  -- Get current user
  v_user_id := auth.uid();
  
  -- Check idempotency
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_islem_id
    FROM islemler
    WHERE idempotency_key = p_idempotency_key;
    
    IF v_islem_id IS NOT NULL THEN
      RETURN v_islem_id; -- Already exists, return existing ID
    END IF;
  END IF;
  
  -- Create islem
  INSERT INTO islemler (
    restaurant_id, type, amount, date, description,
    kasa_id, kasa_hedef_id, cari_id, personel_id, kategori_id,
    idempotency_key, created_by
  ) VALUES (
    p_restaurant_id, p_type, p_amount, p_date, p_description,
    p_kasa_id, p_kasa_hedef_id, p_cari_id, p_personel_id, p_kategori_id,
    p_idempotency_key, v_user_id
  )
  RETURNING id INTO v_islem_id;
  
  -- Update kasa balance
  IF p_kasa_id IS NOT NULL THEN
    PERFORM update_kasa_balance(p_kasa_id, p_type, p_amount);
  END IF;
  
  -- Update cari balance
  IF p_cari_id IS NOT NULL THEN
    PERFORM update_cari_balance(p_cari_id, p_type, p_amount);
  END IF;
  
  -- Update personel balance
  IF p_personel_id IS NOT NULL THEN
    PERFORM update_personel_balance(p_personel_id, p_type, p_amount);
  END IF;
  
  -- Handle transfer
  IF p_type = 'transfer' AND p_kasa_hedef_id IS NOT NULL THEN
    UPDATE kasalar SET balance = balance + p_amount WHERE id = p_kasa_hedef_id;
  END IF;
  
  RETURN v_islem_id;
END;
$$;
```

### 7.2 update_kasa_balance

```sql
CREATE OR REPLACE FUNCTION update_kasa_balance(
  p_kasa_id UUID,
  p_type TEXT,
  p_amount DECIMAL
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE kasalar
  SET balance = balance + CASE
    WHEN p_type IN ('gelir', 'tahsilat') THEN p_amount
    WHEN p_type IN ('gider', 'odeme', 'transfer') THEN -p_amount
    ELSE 0
  END,
  updated_at = NOW()
  WHERE id = p_kasa_id;
END;
$$;
```

### 7.3 update_cari_balance

```sql
CREATE OR REPLACE FUNCTION update_cari_balance(
  p_cari_id UUID,
  p_type TEXT,
  p_amount DECIMAL
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE cariler
  SET balance = balance + CASE
    -- Tedarikçi için: Alış → borç artar (+), Ödeme → borç azalır (-)
    -- Müşteri için: Satış → alacak artar (+), Tahsilat → alacak azalır (-)
    WHEN p_type IN ('alis', 'satis') THEN p_amount
    WHEN p_type IN ('odeme', 'tahsilat', 'iade') THEN -p_amount
    ELSE 0
  END,
  updated_at = NOW()
  WHERE id = p_cari_id;
END;
$$;
```

### 7.4 update_personel_balance

```sql
CREATE OR REPLACE FUNCTION update_personel_balance(
  p_personel_id UUID,
  p_type TEXT,
  p_amount DECIMAL
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE personel
  SET balance = balance + CASE
    -- Avans, prim vb. → personele borçlanıyoruz (+)
    -- Maaş ödeme → borcumuzu ödüyoruz (-)
    WHEN p_type IN ('avans', 'prim', 'mesai', 'tazminat', 'komisyon') THEN p_amount
    WHEN p_type IN ('maas', 'odeme') THEN -p_amount
    ELSE 0
  END,
  updated_at = NOW()
  WHERE id = p_personel_id;
END;
$$;
```

### 7.5 soft_delete_islem

```sql
CREATE OR REPLACE FUNCTION soft_delete_islem(p_islem_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_islem RECORD;
BEGIN
  -- Get islem details
  SELECT * INTO v_islem FROM islemler WHERE id = p_islem_id;
  
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;
  
  -- Reverse kasa balance
  IF v_islem.kasa_id IS NOT NULL THEN
    PERFORM update_kasa_balance(
      v_islem.kasa_id,
      CASE 
        WHEN v_islem.type IN ('gelir', 'tahsilat') THEN 'gider'
        ELSE 'gelir'
      END,
      v_islem.amount
    );
  END IF;
  
  -- Reverse cari balance
  IF v_islem.cari_id IS NOT NULL THEN
    PERFORM update_cari_balance(
      v_islem.cari_id,
      CASE 
        WHEN v_islem.type IN ('alis', 'satis') THEN 'iade'
        ELSE v_islem.type
      END,
      v_islem.amount
    );
  END IF;
  
  -- Reverse personel balance
  IF v_islem.personel_id IS NOT NULL THEN
    PERFORM update_personel_balance(
      v_islem.personel_id,
      CASE 
        WHEN v_islem.type IN ('avans', 'prim') THEN 'odeme'
        ELSE 'avans'
      END,
      v_islem.amount
    );
  END IF;
  
  -- Soft delete
  UPDATE islemler
  SET deleted_at = NOW(), updated_at = NOW()
  WHERE id = p_islem_id;
  
  RETURN TRUE;
END;
$$;
```

---

## 8. Tablo İlişkileri (ERD)

```
┌─────────────────┐
│   restaurants   │
└────────┬────────┘
         │
    ┌────┴────┬─────────────┬──────────────┬──────────────┐
    │         │             │              │              │
    ▼         ▼             ▼              ▼              ▼
┌────────┐ ┌────────┐ ┌──────────┐ ┌──────────┐ ┌─────────────┐
│kasalar │ │cariler │ │ personel │ │kategoriler│ │  islemler   │
└────────┘ └────────┘ └──────────┘ └──────────┘ └──────┬──────┘
    ▲          ▲           ▲            ▲              │
    │          │           │            │              │
    └──────────┴───────────┴────────────┴──────────────┘
                    (foreign keys)
```

---

## Changelog

| Tarih | Değişiklik |
|-------|------------|
| 17.12.2024 | İlk versiyon |
| 18.12.2024 | Bakiye stratejisi bölümü eklendi, offline notu eklendi, MVP varsayımı notu eklendi |
