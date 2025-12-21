# Restoran Hesap Kitap - Mimari Dokümantasyon

**Son Güncelleme:** 18 Aralık 2024  
**Versiyon:** 1.2

---

## ⚠️ ÖNEMLİ NOT: SIFIRDAN GELİŞTİRME

```
┌─────────────────────────────────────────────────────────────────┐
│  Bu proje ESKİ KOD TABANINDAN İLHAM ALINARAK                   │
│  SIFIRDAN yazılacaktır.                                         │
│                                                                 │
│  ❌ Eski kod kopyalanmayacak                                    │
│  ❌ Eski veritabanı şeması kullanılmayacak                      │
│  ✅ Eski projeden öğrenilen dersler uygulanacak                 │
│  ✅ Mimari kararlar ve UX akışları referans alınacak            │
│  ✅ Supabase altyapısı komple yeniden tasarlanacak              │
│                                                                 │
│  Sebep: Temiz mimari, teknik borç yok, güncel best practices   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 1. TEKNOLOJİ STACK

### 1.1 Frontend

```
FRONTEND
├── Framework: Expo SDK 54+ / React Native 0.81+
├── Language: TypeScript 5.9+
├── Navigation: Expo Router 6+
├── State: Zustand 5+ (UI state + geçici form state)
├── Server State: React Query (TanStack Query v5)
├── İkonlar: Lucide React Native
├── Grafikler: react-native-gifted-charts
├── Forms: React Hook Form + Zod
├── i18n: react-i18next (v1.2+) - Türkçe + İngilizce
└── UI: Custom components
```

### 1.2 Backend

```
BACKEND
├── Database: Supabase PostgreSQL
├── Auth: Supabase Auth
│   ├── MVP: Email/Password
│   └── v1.1+: Google + Apple Sign-In
├── Storage: Cloudflare R2 (v2.0+) ⚠️ Supabase Storage DEĞİL
├── Realtime: Supabase Realtime (opsiyonel)
└── Functions: Supabase Edge Functions (gerekirse)
```

### 1.3 DevOps & Tooling

```
DEV & CI/CD
├── Testing: Jest + React Native Testing Library (v2.0+)
├── CI/CD: GitHub Actions (v1.2+)
├── Crash: Sentry (v3.0+)
├── Analytics: Store analytics (MVP), PostHog (v3.0+)
├── Linting: ESLint + Prettier
└── Build: EAS Build
```

---

## 2. STATE MANAGEMENT KURALLARI

> ⚠️ Bu kurallar **MUTLAKA** takip edilmelidir. Aksi halde kod tabanı karışır.

### 2.1 Zustand Kullanım Alanları

```typescript
// ✅ ZUSTAND İÇİN UYGUN
├── UI State
│   ├── Modal açık/kapalı
│   ├── Sidebar durumu
│   ├── Theme (dark/light)
│   └── Bottom sheet
│
├── Form State (geçici)
│   ├── Draft veriler (henüz kaydedilmemiş)
│   ├── Multi-step form progress
│   └── Unsaved changes flag
│
├── Filtreler & Sıralama
│   ├── Tarih aralığı seçimi
│   ├── Kategori filtreleri
│   ├── Arama query'si
│   └── Sıralama tercihi
│
├── Kullanıcı Tercihleri (lokal)
│   ├── Son görüntülenen ekran
│   ├── Tablo görünüm tercihi
│   └── Collapsed sections
│
└── Navigation State
    ├── Active tab
    └── Navigation history (custom)
```

### 2.2 React Query Kullanım Alanları

```typescript
// ✅ REACT QUERY İÇİN UYGUN
├── Supabase'den Gelen TÜM Veriler
│   ├── Listeler (cariler, işlemler, personel)
│   ├── Detay sayfaları
│   ├── Dashboard verileri
│   └── Raporlar
│
├── Mutations
│   ├── Create operations
│   ├── Update operations
│   ├── Delete operations
│   └── Bulk operations
│
└── Derived/Computed Data
    ├── Aggregations
    ├── Filtered server data
    └── Paginated lists
```

> **MVP Notu:** MVP'de advanced cache invalidation ve complex optimistic flows yok. Basit `invalidateQueries` standardı yeterli.

### 2.3 Mutation Kuralları

```typescript
// ✅ DOĞRU MUTATION PATTERN
const createCari = useMutation({
  mutationFn: (data: CariInput) => supabase.from('cariler').insert(data),
  onMutate: async (newCari) => {
    // 1. Önceki veriyi kaydet (rollback için)
    await queryClient.cancelQueries({ queryKey: ['cariler'] });
    const previous = queryClient.getQueryData(['cariler']);
    
    // 2. Optimistic update
    queryClient.setQueryData(['cariler'], (old) => [...old, { ...newCari, id: 'temp' }]);
    
    return { previous };
  },
  onError: (err, newCari, context) => {
    // 3. Hata durumunda rollback
    queryClient.setQueryData(['cariler'], context.previous);
    toast.error('Cari eklenemedi');
  },
  onSuccess: () => {
    // 4. Başarılı → cache'i güncelle
    queryClient.invalidateQueries({ queryKey: ['cariler'] });
    toast.success('Cari eklendi');
  },
});
```

### 2.4 Cache Stratejisi

```typescript
// Default Query Client Config
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,      // 5 dakika
      cacheTime: 30 * 60 * 1000,     // 30 dakika
      refetchOnWindowFocus: true,
      refetchOnMount: true,
      retry: 2,
    },
  },
});

// Özel durumlar için override
useQuery({
  queryKey: ['dashboard'],
  queryFn: fetchDashboard,
  staleTime: 1 * 60 * 1000,  // Dashboard için 1 dakika (daha güncel)
});
```

### 2.5 Query Key Convention

```typescript
// KEY NAMING PATTERN
['cariler']                           // Tüm cariler listesi
['cariler', id]                       // Tek cari detay
['cariler', { filters }]              // Filtrelenmiş liste
['cariler', 'count']                  // Cari sayısı

['islemler']                          // Tüm işlemler
['islemler', 'cari', cariId]          // Cariye ait işlemler
['islemler', { startDate, endDate }]  // Tarih aralığı

['dashboard']                         // Dashboard verileri
['dashboard', 'summary']              // Özet
['dashboard', 'chart', period]        // Grafik verisi
```

### 2.6 ASLA YAPMA Listesi

```typescript
// ❌ YANLIŞ - Supabase verisini Zustand'da cache'leme
const useStore = create((set) => ({
  cariler: [],  // ❌ YANLIŞ!
  setCariler: (data) => set({ cariler: data }),
}));

// ❌ YANLIŞ - React Query'siz direkt fetch
useEffect(() => {
  const fetchData = async () => {
    const { data } = await supabase.from('cariler').select('*');
    setCariler(data);  // ❌ YANLIŞ!
  };
  fetchData();
}, []);

// ❌ YANLIŞ - Mutation sonrası manuel state güncelleme
const handleSave = async () => {
  await supabase.from('cariler').insert(data);
  setCariler([...cariler, data]);  // ❌ YANLIŞ!
};

// ❌ YANLIŞ - Global state'te form verisi tutma
const useStore = create((set) => ({
  cariForm: { ad: '', telefon: '' },  // ❌ YANLIŞ! (React Hook Form kullan)
}));
```

---

## 3. OFFLINE-READY MİMARİ

> ⚠️ **Offline Notu:** MVP'de offline desteklenmez. Bu pattern'ler v3.0 offline desteğine hazırlık içindir. Schema'daki `sync_status`, `idempotency_key` gibi alanlar ileride refactor olmaması için şimdiden eklenmektedir.

### 3.1 Client-Side UUID Generation

```typescript
// ✅ HER KAYIT CLIENT-SIDE UUID İLE OLUŞTURULUR
import { randomUUID } from 'expo-crypto';

const createIslem = async (data: IslemInput) => {
  const id = randomUUID();  // Server'a gitmeden ÖNCE ID belli
  
  return supabase.from('islemler').insert({
    id,  // Client-generated UUID
    ...data,
    created_at: new Date().toISOString(),
  });
};

// Neden önemli?
// 1. Optimistic update için ID lazım
// 2. Offline queue için ID lazım
// 3. Idempotency için ID lazım
```

### 3.2 Idempotency Key Pattern

```typescript
// ✅ DUPLICATE İŞLEMLERİ ENGELLER
const createIdempotencyKey = (action: string) => {
  const visitorId = getDeviceId();  // expo-device
  const timestamp = Date.now();
  return `${visitorId}-${timestamp}-${action}`;
};

const createIslem = async (data: IslemInput) => {
  const idempotencyKey = createIdempotencyKey('create-islem');
  
  return supabase.from('islemler').insert({
    id: randomUUID(),
    idempotency_key: idempotencyKey,  // Unique constraint
    ...data,
  });
};

// Network retry'larda aynı key ile gelirse → duplicate engellenir
```

### 3.3 Timestamp Pattern

```typescript
// ✅ HER TABLODA ZORUNLU ALANLAR
interface BaseEntity {
  id: string;                    // Client-generated UUID
  created_at: string;            // Client timestamp (ISO string)
  updated_at: string;            // Client timestamp (ISO string)
  server_created_at?: string;    // Server timestamp (trigger ile)
  server_updated_at?: string;    // Server timestamp (trigger ile)
}

// Supabase trigger (her tablo için)
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
```

### 3.4 Soft Delete Pattern

```typescript
// ✅ FİZİKSEL SİLME YOK
interface SoftDeletable {
  deleted_at: string | null;  // null = aktif, timestamp = silindi
}

// Silme işlemi
const deleteIslem = async (id: string) => {
  return supabase
    .from('islemler')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id);
};

// Listeleme (deleted olmayanlar)
const { data } = await supabase
  .from('islemler')
  .select('*')
  .is('deleted_at', null);
```

---

## 4. STORAGE STRATEJİSİ (v2.0+)

> ⚠️ Supabase Storage **KULLANILMAYACAK**. Cloudflare R2 tercih edilecek.

### 4.1 Neden R2?

| Özellik | Supabase Storage | Cloudflare R2 |
|---------|------------------|---------------|
| Egress | Ücretli | Ücretsiz |
| Global CDN | Sınırlı | Evet |
| Fiyat | ~$0.021/GB | ~$0.015/GB |
| S3 API | Evet | Evet |

### 4.2 Upload Flow

```typescript
// 1. Client → Backend: Upload isteği
// 2. Backend → R2: Presigned URL oluştur
// 3. Client → R2: Direkt upload (presigned URL ile)
// 4. Client → Backend: Upload tamamlandı bilgisi

const uploadImage = async (file: File) => {
  // 1. Presigned URL al
  const { data: presignedUrl } = await supabase.functions.invoke('get-upload-url', {
    body: { fileName: file.name, fileType: file.type }
  });
  
  // 2. Direkt R2'ye yükle
  await fetch(presignedUrl.uploadUrl, {
    method: 'PUT',
    body: file,
    headers: { 'Content-Type': file.type }
  });
  
  // 3. URL'i kaydet
  return presignedUrl.publicUrl;
};
```

### 4.3 Dosya Yapısı

```
r2-bucket/
├── restaurants/
│   └── {restaurant_id}/
│       ├── profile/
│       │   └── logo.jpg
│       ├── receipts/
│       │   └── {islem_id}/
│       │       └── receipt.jpg
│       └── documents/
│           └── {doc_id}.pdf
```

---

## 5. PROJE YAPISI

```
src/
├── app/                    # Expo Router screens
│   ├── (auth)/            # Auth screens (login, register)
│   ├── (tabs)/            # Tab navigation
│   │   ├── index.tsx      # Dashboard
│   │   ├── kasalar/
│   │   ├── cariler/
│   │   ├── personel/
│   │   ├── islemler/
│   │   └── ayarlar/
│   ├── _layout.tsx
│   └── +not-found.tsx
│
├── components/
│   ├── ui/                # Base UI components
│   │   ├── Button.tsx
│   │   ├── Input.tsx
│   │   ├── Card.tsx
│   │   └── ...
│   ├── forms/             # Form components
│   ├── lists/             # List components
│   └── charts/            # Chart components
│
├── hooks/
│   ├── queries/           # React Query hooks
│   │   ├── useCariler.ts
│   │   ├── useKasalar.ts
│   │   └── useIslemler.ts
│   ├── mutations/         # Mutation hooks
│   └── useAuth.ts
│
├── stores/                # Zustand stores
│   ├── useUIStore.ts
│   └── useFilterStore.ts
│
├── lib/
│   ├── supabase.ts        # Supabase client
│   ├── queryClient.ts     # React Query client
│   └── utils.ts
│
├── types/
│   ├── database.ts        # Supabase generated types
│   └── index.ts
│
└── constants/
    ├── colors.ts
    └── config.ts
```

---

## 6. KÜTÜPHANE KARARLARI

### 6.1 İkonlar: Lucide

**Neden Lucide?**
- Tutarlı tasarım dili
- Tree-shakeable (sadece kullanılanlar bundle'a girer)
- React Native desteği iyi
- Sürekli güncellenen

```typescript
// Kullanım
import { Plus, Trash, Edit } from 'lucide-react-native';

<Plus size={24} color="#000" />
```

### 6.2 Grafikler: react-native-gifted-charts

**Neden gifted-charts?**
- Pure JS (native bağımlılık yok)
- Animasyonlu
- Customization iyi
- Aktif geliştirme

```typescript
import { BarChart, PieChart, LineChart } from 'react-native-gifted-charts';
```

### 6.3 Form: React Hook Form + Zod

**Neden bu kombinasyon?**
- Performanslı (uncontrolled)
- Type-safe validation
- Supabase types ile entegre

```typescript
const schema = z.object({
  name: z.string().min(1, 'İsim gerekli'),
  amount: z.number().positive('Tutar pozitif olmalı'),
});

const { control, handleSubmit } = useForm({
  resolver: zodResolver(schema),
});
```

---

## 7. ULUSLARARASI HAZIRLIK (v1.2+)

### 7.1 i18n Yapısı

```
src/
└── locales/
    ├── tr/
    │   ├── common.json
    │   ├── dashboard.json
    │   └── errors.json
    └── en/
        ├── common.json
        ├── dashboard.json
        └── errors.json
```

### 7.2 Para Birimi & Sayı Formatı

```typescript
// Currency formatter
const formatCurrency = (amount: number, currency: string) => {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
  }).format(amount);
};

// Sonuç: ₺1.234,56 (TR) veya $1,234.56 (US)
```

---

## 8. ERROR & OBSERVABILITY STANDARDI

> Amaç: Production'da hata tespiti, kullanıcıyı rahatsız etmeden çözüm, ve güvenilir monitoring.

### 8.1 Hata Kategorileri

| Kategori | Örnek | Kullanıcıya Göster? | Loglama |
|----------|-------|---------------------|---------|
| Validation | Boş form alanı | ✅ Form altında | ❌ |
| Network | Timeout, offline | ✅ Toast | ⚠️ (sadece pattern) |
| Permission | 403, unauthorized | ✅ Toast | ✅ |
| Business Logic | Yetersiz bakiye | ✅ Modal | ✅ |
| System | Beklenmeyen crash | ❌ "Bir hata oluştu" | ✅ (critical) |

### 8.2 Log Seviyeleri

```typescript
// Log seviyeleri ve kullanım kuralları
enum LogLevel {
  DEBUG = 'debug',   // Sadece development
  INFO = 'info',     // Normal flow (başarılı işlem)
  WARN = 'warn',     // Potansiyel sorun (retry oldu)
  ERROR = 'error',   // İşlem başarısız
  CRITICAL = 'critical', // Sistem seviyesi (crash)
}

// ❌ YANLIŞ - Her şeyi loglama
console.log('Cari listesi yüklendi'); // Gereksiz

// ✅ DOĞRU - Anlamlı loglama
logger.info('islem_created', { islemId, type, amount });
logger.error('islem_failed', { error, context });
```

### 8.3 Error Boundary Stratejisi

```
BOUNDARY HİYERARŞİSİ:
├── Root Error Boundary (App seviyesi)
│   └── "Bir sorun oluştu" + "Yeniden Başlat" butonu
│
├── Screen Error Boundary (Her ekran)
│   └── "Ekran yüklenemedi" + "Tekrar Dene"
│
└── Component Error Boundary (Kritik widgetlar)
    └── Fallback UI (empty state)

HATADA YAPILACAK:
├── Kullanıcıya anlaşılır mesaj
├── Sentry'ye otomatik rapor (prod)
└── Otomatik hata raporu (prod'da)
```

### 8.4 Network/Backend Hataları

```typescript
// ❌ YANLIŞ - Teknik mesaj gösterme
toast.error(error.message); // "relation 'kasalar' does not exist"

// ✅ DOĞRU - İnsan-dostu mesaj
const errorMessages = {
  ERR_PERMISSION_DENIED: 'Bu işlem için yetkiniz yok',
  ERR_NETWORK_OFFLINE: 'İnternet bağlantınızı kontrol edin',
  ERR_CONFLICT_RETRY: 'İşlem çakışması, lütfen tekrar deneyin',
};
toast.error(errorMessages[error.code] || 'Bir hata oluştu');
```

**Retry Kuralları:**
- Offline → Otomatik retry değil, kullanıcı aksiyonu
- 429 / Rate limit → Exponential backoff + üst limit

### 8.5 Crash Reporting (Sentry)

> ⚠️ MVP'den itibaren açık olmalı (sadece prod)

**Minimum Konfigürasyon:**
```typescript
Sentry.init({
  dsn: '...',
  environment: 'production',
  release: `${appVersion}+${buildNumber}`,
  // PII değil, sadece profile_id
  beforeSend: (event) => {
    event.user = { id: profileId };
    return event;
  },
});
```

**Alert Eşikleri:**
| Metrik | Eşik | Aksiyon |
|--------|------|---------|
| Crash-free sessions | < %99.5 | ⚠️ Uyarı |
| Aynı hata 24 saatte | > 20 kez | ⚠️ Uyarı |
| İşlem oluştur error rate | > %1 | 🔴 Kritik |

### 8.6 Error ASLA YAPMA Listesi

```
❌ `console.log` ile prod debug yapma
❌ Error'ı yutma (`catch {}`) yasak
❌ Kullanıcıya raw SQL/RPC error basma
❌ Permission/401/403 hatalarını "genel hata" gibi raporlama
❌ PII içeren veriyi log'a yazma
```

---

## 9. MIGRATION & VERSIONING STANDARDI

> Amaç: Production'da veri kaybı ve "eski client bozuldu" vakalarını sıfıra yaklaştırmak.

### 9.1 Migration Dosya Adı Formatı

```
Format: YYYYMMDDHHMM__short_slug.sql

Örnekler:
├── 202512171130__add_islemler_demirbas_id.sql
├── 202512171145__create_rezervasyonlar_table.sql
└── 202512180900__add_hammadde_alimlari_index.sql
```

**Kurallar:**
- Migration geriye dönük okunabilir olmalı
- Aynı gün çok migration → dakika hassasiyeti yeterli
- Destructive migration → `-- DESTRUCTIVE` etiketi zorunlu

### 9.2 Deployment Sırası (Altın Kural)

```
1️⃣ DB Migration (backward-compatible)
      ↓
2️⃣ RPC/Edge Functions (eski client'ı kırmayacak)
      ↓
3️⃣ Client Release
      ↓
4️⃣ Cleanup Migration (eski alanları kaldır)
```

### 9.3 Backward-Compatible Değişiklikler

| Güvenli ✅ | Breaking ❌ |
|-----------|-------------|
| Yeni kolon (nullable/default) | Kolon rename/remove |
| Yeni tablo | Kolon type değişimi |
| Yeni index | RPC parametre değişimi |
| Yeni RPC | Zorunlu parametre eklemek |
| | RLS politika değişimi |

**Breaking Değişiklik Gerekiyorsa:**

```
EXPAND → MIGRATE → CONTRACT

1. EXPAND: Yeni alan/endpoint ekle (eski de çalışır)
2. MIGRATE: Client yeniye geçsin (1-2 release)
3. CONTRACT: Eskiyi kaldır (cleanup migration)
```

### 9.4 Rollback Stratejisi

**A) Şema Rollback:**
- DROP TABLE/COLUMN dikkatli yapılır
- Destructive migration ayrı onay gerektirir
- `-- DESTRUCTIVE` etiketi olmadan merge edilmez

**B) Data Rollback:**
- Finansal tablolar → "delete değil reverse entry"
- Soft delete + audit log ile geri dönüş
- Hard delete sadece 30+ gün sonra (KVKK uyumu)

### 9.5 RPC Versioning

```sql
-- ❌ YANLIŞ: Mevcut RPC'yi değiştirme
CREATE OR REPLACE FUNCTION create_islem_atomic(
  p_new_required_param TEXT  -- Breaking!
)

-- ✅ DOĞRU: Yeni versiyon oluştur
CREATE FUNCTION create_islem_atomic_v2(
  p_new_param TEXT DEFAULT NULL
)
```

**Kurallar:**
- Eski client minimum 1-2 release döngüsü desteklenir
- Deprecation notu: `roadmap.md` + `architecture.md`
- Eski RPC kaldırılmadan önce usage monitoring

### 9.6 Client ↔ Backend Uyum

```typescript
// Client her request'te version gönderir
headers: {
  'X-App-Version': '1.2.0',
  'X-Build-Number': '42',
}

// Backend kritik breaking'de kontrol edebilir
if (appVersion < MIN_SUPPORTED_VERSION) {
  return { error: 'FORCE_UPDATE_REQUIRED' };
}
```

### 9.7 Migration ASLA YAPMA Listesi

```
❌ Production DB'yi manuel değiştirip migration yazmamak
❌ RPC parametrelerini değiştirmek (yeni versiyon aç)
❌ Client yayınlamadan destructive migration atmak
❌ Migration'ı test etmeden prod'a almak
❌ Rollback planı olmadan deploy etmek
```

---

## 10. PERMISSION TEK KAYNAK KURALI

> Amaç: Güvenlik açığı olmadan, multi-user büyürken kaos yaşamamak.

### 10.1 Altın Kural

```
┌─────────────────────────────────────────────────────────────────┐
│  YETKİ KONTROLÜNÜN KAYNAĞI BACKEND'DİR.                        │
│  UI sadece "görsel kolaylık" sağlar, güvenlik SAĞLAMAZ.        │
│                                                                 │
│  UI'da buton gizlemek = UX iyileştirme                         │
│  Yetki kontrolü = RLS / RPC / Edge Functions                   │
└─────────────────────────────────────────────────────────────────┘
```

### 10.2 Yetki Kontrol Katmanları

```
KATMAN 1: RLS (Row Level Security)
├── Her tabloda restaurant_id izolasyonu
├── Kullanıcının restaurant üyeliği kontrolü
└── Minimum güvenlik duvarı (her zaman aktif)

KATMAN 2: RPC / Edge Functions
├── Mutasyonlar (create/update/delete/transfer)
├── İş kuralı + transaction + permission check
├── Idempotency burada uygulanır
└── Activity log burada yazılır

KATMAN 3: UI (Permission Gates)
├── Sadece göster/gizle
├── Akış yönlendirme
├── "Yapamazsın" mesajını düzgün gösterme
└── ⚠️ Asla tek başına güvenlik DEĞİL
```

### 10.3 RLS mi RPC mi?

| Durum | Kullan | Neden |
|-------|--------|-------|
| Basit okuma | RLS + direct select | Performans |
| Kritik yazma | RPC | Transaction + iş kuralı |
| Bakiye etkileyen | RPC | Atomicity şart |
| Audit gereken | RPC | Activity log zorunlu |

### 10.4 Yetki Modeli

```typescript
// Roller
type Role = 'owner' | 'admin' | 'accountant' | 'cashier' | 'purchasing';

// İzin Seviyeleri
type PermissionLevel = 'none' | 'read_only' | 'own' | 'full';

// Modül bazlı izinler
interface Permissions {
  dashboard: PermissionLevel;
  kasalar: PermissionLevel;
  cariler: PermissionLevel;
  personel: PermissionLevel;
  islemler: PermissionLevel;
  raporlar: PermissionLevel;
  ayarlar: PermissionLevel;
}
```

### 10.5 RPC Permission Check Pattern

```sql
CREATE FUNCTION create_islem_atomic(...)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- 1. User restaurant üyesi mi?
  IF NOT is_restaurant_member(auth.uid(), p_restaurant_id) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: Not a member';
  END IF;
  
  -- 2. Role/permission izin veriyor mu?
  IF NOT has_permission(auth.uid(), p_restaurant_id, 'islemler', 'full') THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: Insufficient permissions';
  END IF;
  
  -- 3. İşlemi yap
  INSERT INTO islemler (...) VALUES (...);
  
  -- 4. Activity log yaz
  INSERT INTO activity_log (...) VALUES (...);
  
  RETURN v_islem_id;
END;
$$;
```

### 10.6 UI Permission Gates

```typescript
// ✅ DOĞRU - Backend sonucu nihai
const { mutate, error } = useMutation({
  mutationFn: createIslem,
  onError: (error) => {
    if (error.code === 'PERMISSION_DENIED') {
      toast.error('Bu işlem için yetkiniz yok');
      // Optimistic update yapıldıysa ROLLBACK
      queryClient.invalidateQueries(['islemler']);
    }
  },
});

// UI sadece UX için kontrol eder
const canCreateIslem = userPermissions.islemler !== 'read_only';

return (
  <Button 
    onPress={mutate} 
    disabled={!canCreateIslem}
  >
    İşlem Ekle
  </Button>
);
```

### 10.7 Permission ASLA YAPMA Listesi

```
❌ Sadece UI'da buton gizleyerek yetki güvenliği sanmak
❌ Client tarafında role string'ine güvenmek
❌ Direct update/delete ile bakiye etkileyen tabloları yazmak
❌ Activity log yazmadan kritik mutasyon yapmak
❌ RLS olmadan tablo oluşturmak
❌ Permission kontrolü olmadan RPC yazmak
```

---

## Changelog

| Tarih | Versiyon | Değişiklik |
|-------|----------|------------|
| 17.12.2024 | 1.0 | İlk versiyon |
| 17.12.2024 | 1.1 | Error & Observability, Migration, Permission bölümleri eklendi |
| 18.12.2024 | 1.2 | React Query MVP'ye alındı, Auth versiyonlaması netleştirildi, Offline notu eklendi |
