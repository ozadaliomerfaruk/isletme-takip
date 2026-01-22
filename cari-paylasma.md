# Cari Hesap Paylaşım Özelliği - Detaylı Plan

## Genel Bakış

İki işletme kullanıcısının birbirlerinin cari hesap ekstresini karşılıklı olarak görüntüleyebileceği bir paylaşım sistemi.

### Kullanım Senaryosu
```
Tedarikçi A                           Müşteri B
─────────────                         ─────────
Carilerinde "Müşteri B" var    ◄────► Carilerinde "Tedarikçi A" var
                    │
                    ▼
        Paylaşım kodu ile bağlantı
                    │
                    ▼
Her iki taraf da karşı tarafın tuttuğu cari hesabı (bakiye + işlemler) görebilir
```

---

## Tercihler ve Kararlar

| Karar | Seçim |
|-------|-------|
| Bağlantı tipi | Karşılıklı (her iki taraf görür) |
| Görüntüleme izni | Bakiye + İşlem listesi |
| Kapsam | Sadece cariler (personel hariç) |
| Kod sistemi | Tek kullanımlık, 6 haneli |
| Geçmiş veriler | Tüm geçmiş görünsün |
| Çoklu paylaşım | Hayır, her cari tek kişiyle |
| Güncelleme | Realtime (Supabase realtime) |
| Bildirim | Push notification (native module) |

---

## Veritabanı Tasarımı

### Tablo 1: `cari_share_codes`
Geçici paylaşım kodlarını saklar.

```sql
CREATE TABLE cari_share_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cari_id UUID NOT NULL REFERENCES cariler(id) ON DELETE CASCADE,
  isletme_id UUID NOT NULL REFERENCES isletmeler(id) ON DELETE CASCADE,
  code CHAR(6) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
  used_at TIMESTAMPTZ DEFAULT NULL,
  used_by_isletme_id UUID REFERENCES isletmeler(id) ON DELETE SET NULL,

  CONSTRAINT valid_code CHECK (code ~ '^[A-Z0-9]{6}$')
);

-- Index: Hızlı kod arama (sadece kullanılmamış kodlar)
CREATE INDEX idx_share_codes_code ON cari_share_codes(code) WHERE used_at IS NULL;

-- Index: Cari'ye göre kodları bulma
CREATE INDEX idx_share_codes_cari ON cari_share_codes(cari_id);
```

### Tablo 2: `cari_links`
Kalıcı bağlantıları saklar.

```sql
CREATE TABLE cari_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- A tarafı (kodu oluşturan)
  isletme_a_id UUID NOT NULL REFERENCES isletmeler(id) ON DELETE CASCADE,
  cari_a_id UUID NOT NULL REFERENCES cariler(id) ON DELETE CASCADE,

  -- B tarafı (kodu kabul eden)
  isletme_b_id UUID NOT NULL REFERENCES isletmeler(id) ON DELETE CASCADE,
  cari_b_id UUID NOT NULL REFERENCES cariler(id) ON DELETE CASCADE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Kısıtlamalar
  CONSTRAINT unique_cari_a UNIQUE (cari_a_id),  -- Her cari tek kişiyle paylaşılabilir
  CONSTRAINT unique_cari_b UNIQUE (cari_b_id),  -- Her cari tek kişiyle paylaşılabilir
  CONSTRAINT no_self_link CHECK (isletme_a_id != isletme_b_id)
);

-- Indexler
CREATE INDEX idx_links_isletme_a ON cari_links(isletme_a_id);
CREATE INDEX idx_links_isletme_b ON cari_links(isletme_b_id);
CREATE INDEX idx_links_cari_a ON cari_links(cari_a_id);
CREATE INDEX idx_links_cari_b ON cari_links(cari_b_id);
```

### Tablo 3: `cari_link_notifications` (Opsiyonel)
Bildirim geçmişi için.

```sql
CREATE TABLE cari_link_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  link_id UUID NOT NULL REFERENCES cari_links(id) ON DELETE CASCADE,
  islem_id UUID NOT NULL REFERENCES islemler(id) ON DELETE CASCADE,
  recipient_isletme_id UUID NOT NULL REFERENCES isletmeler(id) ON DELETE CASCADE,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at TIMESTAMPTZ DEFAULT NULL
);
```

---

## RLS Politikaları

### cari_share_codes için
```sql
ALTER TABLE cari_share_codes ENABLE ROW LEVEL SECURITY;

-- Kullanıcılar sadece kendi carilerinin kodlarını oluşturabilir
CREATE POLICY "create_own_codes" ON cari_share_codes FOR INSERT
  TO authenticated
  WITH CHECK (
    isletme_id IN (SELECT id FROM isletmeler WHERE user_id = auth.uid())
    AND cari_id IN (SELECT id FROM cariler WHERE isletme_id = cari_share_codes.isletme_id)
  );

-- Kullanıcılar sadece kendi kodlarını görebilir
CREATE POLICY "view_own_codes" ON cari_share_codes FOR SELECT
  TO authenticated
  USING (isletme_id IN (SELECT id FROM isletmeler WHERE user_id = auth.uid()));
```

### cari_links için
```sql
ALTER TABLE cari_links ENABLE ROW LEVEL SECURITY;

-- Kullanıcılar kendilerini ilgilendiren bağlantıları görebilir
CREATE POLICY "view_own_links" ON cari_links FOR SELECT
  TO authenticated
  USING (
    isletme_a_id IN (SELECT id FROM isletmeler WHERE user_id = auth.uid())
    OR isletme_b_id IN (SELECT id FROM isletmeler WHERE user_id = auth.uid())
  );

-- Kullanıcılar kendi bağlantılarını silebilir
CREATE POLICY "delete_own_links" ON cari_links FOR DELETE
  TO authenticated
  USING (
    isletme_a_id IN (SELECT id FROM isletmeler WHERE user_id = auth.uid())
    OR isletme_b_id IN (SELECT id FROM isletmeler WHERE user_id = auth.uid())
  );
```

### cariler ve islemler için Ek Politikalar
```sql
-- Bağlantılı carileri görüntüleme (read-only)
CREATE POLICY "view_linked_cariler" ON cariler FOR SELECT
  TO authenticated
  USING (
    -- Kendi carilerim
    isletme_id IN (SELECT id FROM isletmeler WHERE user_id = auth.uid())
    OR
    -- Bağlantılı cariler
    id IN (
      SELECT cari_a_id FROM cari_links
      WHERE isletme_b_id IN (SELECT id FROM isletmeler WHERE user_id = auth.uid())
      UNION
      SELECT cari_b_id FROM cari_links
      WHERE isletme_a_id IN (SELECT id FROM isletmeler WHERE user_id = auth.uid())
    )
  );

-- Bağlantılı cari işlemlerini görüntüleme (read-only)
CREATE POLICY "view_linked_islemler" ON islemler FOR SELECT
  TO authenticated
  USING (
    -- Kendi işlemlerim
    isletme_id IN (SELECT id FROM isletmeler WHERE user_id = auth.uid())
    OR
    -- Bağlantılı cari işlemleri
    (cari_id IS NOT NULL AND cari_id IN (
      SELECT cari_a_id FROM cari_links
      WHERE isletme_b_id IN (SELECT id FROM isletmeler WHERE user_id = auth.uid())
      UNION
      SELECT cari_b_id FROM cari_links
      WHERE isletme_a_id IN (SELECT id FROM isletmeler WHERE user_id = auth.uid())
    ))
  );
```

---

## RPC Fonksiyonları

### 1. Paylaşım Kodu Oluşturma
```sql
CREATE OR REPLACE FUNCTION generate_cari_share_code(
  p_cari_id UUID,
  p_isletme_id UUID
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_code TEXT;
  v_attempts INTEGER := 0;
  v_rate_limit INTEGER;
  v_existing_link UUID;
BEGIN
  -- Sahiplik kontrolü
  IF NOT EXISTS (
    SELECT 1 FROM cariler c
    JOIN isletmeler i ON c.isletme_id = i.id
    WHERE c.id = p_cari_id
      AND i.id = p_isletme_id
      AND i.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Cari bulunamadı veya erişim yetkiniz yok';
  END IF;

  -- Zaten bağlantılı mı kontrol et
  SELECT id INTO v_existing_link
  FROM cari_links
  WHERE cari_a_id = p_cari_id OR cari_b_id = p_cari_id;

  IF v_existing_link IS NOT NULL THEN
    RAISE EXCEPTION 'Bu cari zaten paylaşılmış. Önce mevcut bağlantıyı kaldırın.';
  END IF;

  -- Rate limit: saatte 5 kod
  SELECT COUNT(*) INTO v_rate_limit
  FROM cari_share_codes
  WHERE isletme_id = p_isletme_id
    AND created_at > NOW() - INTERVAL '1 hour';

  IF v_rate_limit >= 5 THEN
    RAISE EXCEPTION 'Çok fazla paylaşım kodu oluşturdunuz. Lütfen daha sonra tekrar deneyin.';
  END IF;

  -- Mevcut kullanılmamış kodları iptal et
  UPDATE cari_share_codes
  SET expires_at = NOW()
  WHERE cari_id = p_cari_id
    AND used_at IS NULL
    AND expires_at > NOW();

  -- Benzersiz 6 haneli kod oluştur (0/O, 1/I/L hariç)
  LOOP
    v_code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    v_code := translate(v_code, '0O1IL', 'XYZAB');

    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM cari_share_codes
      WHERE code = v_code AND expires_at > NOW() AND used_at IS NULL
    );

    v_attempts := v_attempts + 1;
    IF v_attempts >= 10 THEN
      RAISE EXCEPTION 'Kod oluşturulamadı. Lütfen tekrar deneyin.';
    END IF;
  END LOOP;

  -- Yeni kod ekle
  INSERT INTO cari_share_codes (cari_id, isletme_id, code)
  VALUES (p_cari_id, p_isletme_id, v_code);

  RETURN v_code;
END;
$$;
```

### 2. Paylaşım Kodunu Kabul Etme
```sql
CREATE OR REPLACE FUNCTION accept_cari_share_code(
  p_code TEXT,
  p_my_cari_id UUID,
  p_my_isletme_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_share_code RECORD;
  v_link_id UUID;
  v_existing_link UUID;
BEGIN
  -- Sahiplik kontrolü
  IF NOT EXISTS (
    SELECT 1 FROM cariler c
    JOIN isletmeler i ON c.isletme_id = i.id
    WHERE c.id = p_my_cari_id
      AND i.id = p_my_isletme_id
      AND i.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Cari bulunamadı veya erişim yetkiniz yok';
  END IF;

  -- Benim carim zaten bağlantılı mı?
  SELECT id INTO v_existing_link
  FROM cari_links
  WHERE cari_a_id = p_my_cari_id OR cari_b_id = p_my_cari_id;

  IF v_existing_link IS NOT NULL THEN
    RAISE EXCEPTION 'Bu cari zaten başka biriyle bağlantılı.';
  END IF;

  -- Kodu bul ve kilitle
  SELECT * INTO v_share_code
  FROM cari_share_codes
  WHERE code = upper(p_code)
    AND used_at IS NULL
    AND expires_at > NOW()
  FOR UPDATE;

  IF v_share_code IS NULL THEN
    RAISE EXCEPTION 'Geçersiz veya süresi dolmuş paylaşım kodu';
  END IF;

  -- Kendi kendine bağlantı kontrolü
  IF v_share_code.isletme_id = p_my_isletme_id THEN
    RAISE EXCEPTION 'Kendi carinizle bağlantı kuramazsınız';
  END IF;

  -- Kodu kullanıldı olarak işaretle
  UPDATE cari_share_codes
  SET used_at = NOW(),
      used_by_isletme_id = p_my_isletme_id
  WHERE id = v_share_code.id;

  -- Karşılıklı bağlantı oluştur
  INSERT INTO cari_links (
    isletme_a_id, cari_a_id,
    isletme_b_id, cari_b_id
  ) VALUES (
    v_share_code.isletme_id, v_share_code.cari_id,
    p_my_isletme_id, p_my_cari_id
  )
  RETURNING id INTO v_link_id;

  RETURN v_share_code.cari_id;
END;
$$;
```

### 3. Bağlantıyı Kaldırma
```sql
CREATE OR REPLACE FUNCTION remove_cari_link(
  p_link_id UUID,
  p_isletme_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Sahiplik kontrolü
  IF NOT EXISTS (
    SELECT 1 FROM cari_links cl
    JOIN isletmeler i ON (cl.isletme_a_id = i.id OR cl.isletme_b_id = i.id)
    WHERE cl.id = p_link_id
      AND i.id = p_isletme_id
      AND i.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Bağlantı bulunamadı veya erişim yetkiniz yok';
  END IF;

  -- Bağlantıyı sil (CASCADE ile bildirimler de silinir)
  DELETE FROM cari_links WHERE id = p_link_id;

  RETURN TRUE;
END;
$$;
```

### 4. Bağlantılı Cari Bilgisi Getirme
```sql
CREATE OR REPLACE FUNCTION get_linked_cari_info(
  p_cari_id UUID,
  p_viewer_isletme_id UUID
)
RETURNS TABLE (
  cari_id UUID,
  cari_name TEXT,
  cari_balance NUMERIC,
  cari_currency TEXT,
  cari_type TEXT,
  owner_isletme_name TEXT,
  link_id UUID,
  is_owner BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.name,
    c.balance,
    c.currency,
    c.type,
    i.name AS owner_isletme_name,
    cl.id AS link_id,
    (c.isletme_id = p_viewer_isletme_id) AS is_owner
  FROM cariler c
  JOIN isletmeler i ON c.isletme_id = i.id
  LEFT JOIN cari_links cl ON (
    (cl.cari_a_id = c.id OR cl.cari_b_id = c.id)
  )
  WHERE c.id = p_cari_id
    AND EXISTS (
      SELECT 1 FROM isletmeler vi
      WHERE vi.id = p_viewer_isletme_id
        AND vi.user_id = auth.uid()
    )
    AND (
      c.isletme_id = p_viewer_isletme_id
      OR (cl.isletme_a_id = p_viewer_isletme_id OR cl.isletme_b_id = p_viewer_isletme_id)
    );
END;
$$;
```

---

## Realtime Subscriptions

### Supabase Realtime Konfigürasyonu
```sql
-- cari_links tablosunda değişiklikleri dinle
ALTER PUBLICATION supabase_realtime ADD TABLE cari_links;

-- islemler tablosunda cari işlemlerini dinle (zaten var ise)
-- ALTER PUBLICATION supabase_realtime ADD TABLE islemler;
```

### React Native Tarafında
```typescript
// Bağlantılı cari işlemlerini dinle
useEffect(() => {
  const subscription = supabase
    .channel('linked-cari-transactions')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'islemler',
        filter: `cari_id=in.(${linkedCariIds.join(',')})`,
      },
      (payload) => {
        // Push notification gönder
        sendPushNotification(payload.new);
        // Query'yi invalidate et
        queryClient.invalidateQueries(['linked-cari-islemler']);
      }
    )
    .subscribe();

  return () => subscription.unsubscribe();
}, [linkedCariIds]);
```

---

## Push Notification Sistemi

### Expo Notifications ile Entegrasyon
```typescript
// Cari link oluşturulduğunda push token'ı kaydet
interface UserPushToken {
  isletme_id: string;
  expo_push_token: string;
  device_id: string;
}

// Yeni işlem bildirimi
async function notifyLinkedUser(islem: Islem, linkedIsletmeId: string) {
  const { data: tokens } = await supabase
    .from('user_push_tokens')
    .select('expo_push_token')
    .eq('isletme_id', linkedIsletmeId);

  if (!tokens?.length) return;

  const message = {
    to: tokens.map(t => t.expo_push_token),
    title: 'Yeni İşlem',
    body: `${islem.type} - ${formatCurrency(islem.amount)}`,
    data: { islem_id: islem.id, cari_id: islem.cari_id },
  };

  await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(message),
  });
}
```

### Edge Function ile Server-Side Bildirim
```typescript
// supabase/functions/notify-linked-users/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

serve(async (req) => {
  const { record, type } = await req.json();

  if (type !== 'INSERT' || !record.cari_id) return new Response('ok');

  // Bağlantılı kullanıcıyı bul
  const { data: link } = await supabase
    .from('cari_links')
    .select('*')
    .or(`cari_a_id.eq.${record.cari_id},cari_b_id.eq.${record.cari_id}`)
    .single();

  if (!link) return new Response('no link');

  // Karşı tarafın isletme_id'sini bul
  const recipientIsletmeId = link.cari_a_id === record.cari_id
    ? link.isletme_b_id
    : link.isletme_a_id;

  // Push notification gönder
  await sendPushNotification(recipientIsletmeId, record);

  return new Response('sent');
});
```

### Database Trigger (Opsiyonel)
```sql
-- İşlem eklendiğinde Edge Function'ı tetikle
CREATE OR REPLACE FUNCTION trigger_linked_notification()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.cari_id IS NOT NULL THEN
    PERFORM net.http_post(
      url := 'https://your-project.supabase.co/functions/v1/notify-linked-users',
      body := jsonb_build_object('record', NEW, 'type', TG_OP)
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_islem_insert_notify
  AFTER INSERT ON islemler
  FOR EACH ROW
  EXECUTE FUNCTION trigger_linked_notification();
```

---

## TypeScript Tipleri

```typescript
// src/types/cariSharing.ts

export interface CariShareCode {
  id: string;
  cari_id: string;
  isletme_id: string;
  code: string;
  created_at: string;
  expires_at: string;
  used_at: string | null;
  used_by_isletme_id: string | null;
}

export interface CariLink {
  id: string;
  isletme_a_id: string;
  cari_a_id: string;
  isletme_b_id: string;
  cari_b_id: string;
  created_at: string;
}

export interface CariLinkWithDetails extends CariLink {
  cari_a?: Pick<Cari, 'id' | 'name' | 'balance' | 'currency' | 'type'>;
  cari_b?: Pick<Cari, 'id' | 'name' | 'balance' | 'currency' | 'type'>;
  isletme_a?: Pick<Isletme, 'id' | 'name'>;
  isletme_b?: Pick<Isletme, 'id' | 'name'>;
}

export interface LinkedCariView {
  cari_id: string;
  cari_name: string;
  cari_balance: number;
  cari_currency: string;
  cari_type: CariType;
  owner_isletme_name: string;
  link_id: string;
  is_owner: boolean;
}
```

---

## React Query Hooks

```typescript
// src/hooks/useCariSharing.ts

// Paylaşım kodu oluştur
export function useGenerateShareCode() {
  const { isletme } = useAuthContext();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (cariId: string) => {
      const { data, error } = await supabase.rpc('generate_cari_share_code', {
        p_cari_id: cariId,
        p_isletme_id: isletme!.id,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cari-share-codes'] });
    },
  });
}

// Paylaşım kodunu kabul et
export function useAcceptShareCode() {
  const { isletme } = useAuthContext();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ code, myCariId }: { code: string; myCariId: string }) => {
      const { data, error } = await supabase.rpc('accept_cari_share_code', {
        p_code: code,
        p_my_cari_id: myCariId,
        p_my_isletme_id: isletme!.id,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cari-links'] });
      queryClient.invalidateQueries({ queryKey: ['cariler'] });
    },
  });
}

// Tüm bağlantıları getir
export function useCariLinks() {
  const { isletme } = useAuthContext();

  return useQuery({
    queryKey: ['cari-links', isletme?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cari_links')
        .select(`
          *,
          cari_a:cariler!cari_a_id(id, name, balance, currency, type),
          cari_b:cariler!cari_b_id(id, name, balance, currency, type),
          isletme_a:isletmeler!isletme_a_id(id, name),
          isletme_b:isletmeler!isletme_b_id(id, name)
        `)
        .or(`isletme_a_id.eq.${isletme!.id},isletme_b_id.eq.${isletme!.id}`);

      if (error) throw error;
      return data as CariLinkWithDetails[];
    },
    enabled: !!isletme,
  });
}

// Bağlantıyı kaldır
export function useRemoveCariLink() {
  const { isletme } = useAuthContext();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (linkId: string) => {
      const { error } = await supabase.rpc('remove_cari_link', {
        p_link_id: linkId,
        p_isletme_id: isletme!.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cari-links'] });
      queryClient.invalidateQueries({ queryKey: ['cariler'] });
    },
  });
}

// Belirli bir cari için bağlantı durumu
export function useCariLinkStatus(cariId: string | undefined) {
  const { isletme } = useAuthContext();

  return useQuery({
    queryKey: ['cari-link-status', cariId, isletme?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cari_links')
        .select('*, isletme_a:isletmeler!isletme_a_id(name), isletme_b:isletmeler!isletme_b_id(name)')
        .or(`cari_a_id.eq.${cariId},cari_b_id.eq.${cariId}`)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    enabled: !!cariId && !!isletme,
  });
}
```

---

## UI Bileşenleri

### 1. Cariler Listesinde Paylaşım İkonu
```
┌─────────────────────────────────────┐
│  Müşteri A                    ₺500  │
│  Tedarikçi B           🔗    ₺-200  │  ← Bağlantılı cari ikonu
│  Müşteri C                    ₺150  │
└─────────────────────────────────────┘
```

**Dosya:** `src/components/cariler/CariListItem.tsx`
- Bağlantılı carilerde 🔗 veya link ikonu göster
- İkona tıklayınca bağlantı detayları göster

### 2. Paylaşım Kodu Oluşturma Modalı
```
┌─────────────────────────────────────┐
│           Cari Paylaş              │
├─────────────────────────────────────┤
│                                     │
│         [  A B C 1 2 3  ]          │
│                                     │
│   Bu kod 24 saat geçerlidir.       │
│                                     │
│   [  Kopyala  ]  [  Paylaş  ]      │
│                                     │
│   Kodu karşı tarafla paylaşın.     │
│   Onlar da kendi carilerini        │
│   seçerek bağlantı kurabilir.      │
│                                     │
└─────────────────────────────────────┘
```

**Dosya:** `src/components/cariSharing/ShareCodeModal.tsx`

### 3. Kod Kabul Etme Bottom Sheet
```
┌─────────────────────────────────────┐
│        Paylaşım Kodu Gir           │
├─────────────────────────────────────┤
│                                     │
│  [ A ] [ B ] [ C ] [ 1 ] [ 2 ] [ 3 ]│
│                                     │
│  Bağlanacak Carinizi Seçin:        │
│  ┌───────────────────────────────┐ │
│  │ ▼ Tedarikçi A                 │ │
│  └───────────────────────────────┘ │
│                                     │
│         [  Bağlantı Kur  ]         │
│                                     │
└─────────────────────────────────────┘
```

**Dosya:** `src/components/cariSharing/AcceptCodeSheet.tsx`

### 4. Bağlantılı Cari Badge'i
```
┌─────────────────────────────────────┐
│  🔗 Bağlantılı Cari                │
│  Sahibi: ABC İşletmesi             │
│  ⚠️ Sadece Görüntüleme              │
└─────────────────────────────────────┘
```

**Dosya:** `src/components/cariSharing/LinkedCariBadge.tsx`
- Cari detay sayfasının üstünde gösterilir
- Bağlantılı cari görüntülenirken

### 5. Bağlantılar Listesi Bölümü
```
┌─────────────────────────────────────┐
│  Bağlantılı Hesaplar               │
├─────────────────────────────────────┤
│  🔗 Müşteri B                      │
│     XYZ İşletmesi ile bağlantılı   │
│     [ Bağlantıyı Kaldır ]          │
├─────────────────────────────────────┤
│  [ + Yeni Bağlantı Kur ]           │
└─────────────────────────────────────┘
```

**Dosya:** `src/components/cariSharing/CariLinksSection.tsx`
- Cari detay sayfasının altında
- Veya Ayarlar > Bağlantılar sayfasında

---

## Değiştirilecek Dosyalar

| Dosya | Değişiklik |
|-------|------------|
| `src/app/cariler/index.tsx` | Liste itemlarına bağlantı ikonu ekle |
| `src/app/cariler/[id].tsx` | Read-only mod, paylaş butonu, bağlantı bilgisi |
| `src/components/cariler/CariListItem.tsx` | Bağlantı ikonu |
| `src/types/database.ts` | CariShareCode, CariLink tipleri |
| `src/lib/queryKeys.ts` | cariSharing query keys |
| `src/constants/strings/cariler.ts` | Türkçe çeviri stringleri |

## Oluşturulacak Dosyalar

| Dosya | Açıklama |
|-------|----------|
| `supabase/migrations/YYYYMMDD_cari_sharing.sql` | Veritabanı migration |
| `supabase/functions/notify-linked-users/index.ts` | Edge function |
| `src/hooks/useCariSharing.ts` | React Query hooks |
| `src/types/cariSharing.ts` | TypeScript tipleri |
| `src/components/cariSharing/ShareCodeModal.tsx` | Kod oluşturma modalı |
| `src/components/cariSharing/AcceptCodeSheet.tsx` | Kod kabul sheet |
| `src/components/cariSharing/LinkedCariBadge.tsx` | Bağlantı badge'i |
| `src/components/cariSharing/CariLinksSection.tsx` | Bağlantılar listesi |
| `src/app/ayarlar/baglantilar.tsx` | Bağlantılar yönetim sayfası |

---

## Türkçe Çeviri Stringleri

```typescript
// src/constants/strings/cariler.ts - sharing bölümü

sharing: {
  // Başlıklar
  shareTitle: 'Cari Paylaş',
  acceptTitle: 'Paylaşım Kodu Gir',
  linksTitle: 'Bağlantılı Cariler',
  manageLinks: 'Bağlantıları Yönet',

  // Aksiyonlar
  generateCode: 'Paylaşım Kodu Oluştur',
  acceptCode: 'Kodu Kabul Et',
  removeLink: 'Bağlantıyı Kaldır',
  copyCode: 'Kopyala',
  shareCode: 'Paylaş',
  createLink: 'Bağlantı Kur',

  // Etiketler
  codeLabel: 'Paylaşım Kodu',
  selectYourCari: 'Bağlanacak Carinizi Seçin',
  linkedWith: 'ile bağlantılı',
  viewOnly: 'Sadece Görüntüleme',
  ownerLabel: 'Sahibi',
  linkedCari: 'Bağlantılı Cari',

  // Mesajlar
  codeGenerated: 'Paylaşım kodu oluşturuldu',
  codeCopied: 'Kod kopyalandı',
  codeExpiry: 'Bu kod 24 saat geçerlidir',
  linkCreated: 'Bağlantı başarıyla kuruldu',
  linkRemoved: 'Bağlantı kaldırıldı',
  shareInstructions: 'Bu kodu karşı tarafla paylaşın. Onlar da kendi carilerini seçerek bağlantı kurabilir.',
  newTransactionNotification: 'Yeni işlem: {type} - {amount}',

  // Hatalar
  invalidCode: 'Geçersiz veya süresi dolmuş kod',
  alreadyLinked: 'Bu cari zaten paylaşılmış',
  selfLinkError: 'Kendi carinizle bağlantı kuramazsınız',
  rateLimitError: 'Çok fazla kod oluşturdunuz. Lütfen 1 saat sonra tekrar deneyin.',
  cariAlreadyLinked: 'Seçtiğiniz cari zaten başka biriyle bağlantılı',

  // Onaylar
  removeLinkConfirmTitle: 'Bağlantıyı Kaldır',
  removeLinkConfirmMessage: 'Bu bağlantıyı kaldırmak istediğinize emin misiniz? Her iki taraf da karşı tarafın cari bilgilerini göremeyecek.',
  removeLinkConfirmButton: 'Evet, Kaldır',

  // Boş durumlar
  noLinks: 'Henüz bağlantılı cari yok',
  noLinksDescription: 'Bir cari hesabını paylaşarak diğer işletmelerle karşılıklı bakiye takibi yapabilirsiniz.',
},
```

---

## Güvenlik Kontrol Listesi

- [x] Kullanıcılar sadece kendi carilerinin kodlarını oluşturabilir
- [x] Her cari tek kişiyle paylaşılabilir (UNIQUE constraint)
- [x] Rate limiting (5 kod/saat)
- [x] Tek kullanımlık kodlar
- [x] 24 saat kod geçerliliği
- [x] Bağlantılı veriler read-only (RLS ile)
- [x] Her iki taraf bağlantıyı kaldırabilir
- [x] Kendi kendine bağlantı engeli
- [x] SQL injection koruması (parameterized queries)

---

## Test Senaryoları

### Pozitif Testler
- [ ] Müşteri için kod oluşturma
- [ ] Tedarikçi için kod oluşturma
- [ ] Geçerli kod ile bağlantı kurma
- [ ] Bağlantılı cari görüntüleme (bakiye)
- [ ] Bağlantılı cari işlemlerini görüntüleme
- [ ] Bağlantıyı A tarafından kaldırma
- [ ] Bağlantıyı B tarafından kaldırma
- [ ] Realtime güncelleme testi
- [ ] Push notification testi

### Negatif Testler
- [ ] Geçersiz kod reddi
- [ ] Süresi dolmuş kod reddi
- [ ] Kendi kendine bağlantı reddi
- [ ] Zaten bağlantılı cari için kod reddi
- [ ] Rate limit aşımı reddi
- [ ] Bağlantılı cari düzenleme engeli
- [ ] Bağlantılı cari silme engeli
- [ ] Bağlantılı cariye işlem ekleme engeli

---

## Gelecek Geliştirmeler (Opsiyonel)

1. **Birden fazla kişiyle paylaşım** - Şu an tek kişi, ileride genişletilebilir
2. **Kısıtlı paylaşım** - Sadece belirli işlem türlerini göster
3. **Zaman aralığı filtresi** - Son 6 ay gibi
4. **Export özelliği** - PDF/Excel ile ekstra paylaş
5. **Yorum/not sistemi** - Bağlantılı taraflar arası iletişim
6. **Otomatik mutabakat** - Bakiye uyuşmazlığı tespiti
