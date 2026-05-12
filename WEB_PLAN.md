# İşletme Takip - Web Uygulaması Geliştirme Planı

## Context

Mevcut Expo/React Native mobil uygulama (iOS yayında, Android teste yakın) için tam kapsamlı bir web versiyonu oluşturulacak. Aynı Supabase backend kullanılacak.

**EN ÖNEMLİ KISITLAMA: Mevcut iOS ve Android uygulamaları KESİNLİKLE bozulmamalı.** Bu nedenle mobil uygulama (`defterappv2/`) hiçbir şekilde taşınmayacak veya değiştirilmeyecek. Monorepo ayrı bir dizinde kurulacak, shared kod KOPYALANARAK oluşturulacak. Mobil uygulama ileride hazır olunduğunda monorepo'ya taşınabilir ama bu planın kapsamı dışında.

**Tech stack:** Next.js 15 (App Router) + TypeScript + Tailwind CSS + shadcn/ui + Supabase SSR + TanStack Query + TanStack Table + recharts + react-hook-form + zod + next-intl

---

## Faz 0: Proje Kurulumu (3-4 gün)

### 0.1 Yeni Proje Dizini Oluştur

`c:\Users\ozada\apps\isletmetakip\` altında yeni dizin:

```
isletmetakip-web/
├── src/
│   ├── app/                    ← Next.js App Router
│   ├── components/             ← UI bileşenleri
│   ├── hooks/                  ← Web-spesifik hook'lar
│   ├── lib/                    ← Utility'ler ve Supabase client
│   │   ├── supabase/
│   │   │   ├── client.ts       ← Browser Supabase client (@supabase/ssr)
│   │   │   ├── server.ts       ← Server Component Supabase client
│   │   │   └── middleware.ts   ← Auth middleware helper
│   │   ├── currency.ts         ← defterappv2'den kopyalanıp refactor edilecek
│   │   ├── date.ts             ← defterappv2'den kopyalanıp refactor edilecek
│   │   ├── queryKeys.ts        ← defterappv2'den birebir kopyalanacak
│   │   ├── transactionGrouping.ts
│   │   ├── transactionColors.ts
│   │   ├── cariTransactionMapper.ts
│   │   ├── fuzzyMatch.ts
│   │   ├── errors.ts
│   │   └── schemas/
│   │       └── paymentForm.ts  ← defterappv2'den birebir kopyalanacak
│   ├── types/                  ← defterappv2'den birebir kopyalanacak
│   │   ├── database.ts
│   │   ├── multiUser.ts
│   │   ├── analytics.ts
│   │   ├── cariSharing.ts
│   │   └── ocrImport.ts
│   ├── constants/              ← defterappv2'den birebir kopyalanacak
│   │   ├── islemTypes.ts
│   │   ├── currencies.ts
│   │   ├── categoryIcons.ts
│   │   └── colors.ts
│   ├── i18n/                   ← defterappv2'den kopyalanacak
│   │   ├── index.ts            ← next-intl için yeniden yazılacak
│   │   └── locales/
│   │       ├── tr/             ← 17 namespace JSON (birebir kopya)
│   │       └── en/             ← 17 namespace JSON (birebir kopya)
│   ├── contexts/
│   │   └── AuthContext.tsx     ← Web-spesifik yeniden yazılacak
│   └── providers/
│       ├── query-provider.tsx
│       ├── auth-provider.tsx
│       └── i18n-provider.tsx
├── public/
├── middleware.ts               ← Next.js auth middleware
├── next.config.ts
├── tailwind.config.ts
├── components.json             ← shadcn/ui config
├── tsconfig.json
├── package.json
├── .env.local                  ← Supabase credentials
└── .gitignore
```

**NOT:** `defterappv2/` dizinine HİÇBİR ŞEKİLDE dokunulmayacak. Tüm paylaşılan kod kopyalanarak web projesine alınacak.

### 0.2 Adım Adım Proje Oluşturma

```
Adım 1: Next.js projesi oluştur
  cd c:\Users\ozada\apps\isletmetakip\
  npx create-next-app@latest isletmetakip-web --typescript --tailwind --app --src-dir --turbopack

Adım 2: shadcn/ui kur
  cd isletmetakip-web
  npx shadcn@latest init
  npx shadcn@latest add button input form table card dialog dropdown-menu
    sheet tabs badge separator avatar skeleton toast select
    checkbox radio-group switch label textarea popover calendar
    command alert-dialog tooltip scroll-area

Adım 3: Temel paketleri kur
  npm install @supabase/supabase-js @supabase/ssr
  npm install @tanstack/react-query @tanstack/react-table
  npm install react-hook-form zod @hookform/resolvers
  npm install recharts lucide-react next-intl
  npm install xlsx xlsx-js-style

Adım 4: Git repo başlat
  git init
  git add .
  git commit -m "chore: initial Next.js project setup"
```

### 0.3 Shared Kodu Kopyala (defterappv2 → isletmetakip-web)

**Birebir kopyalanacak dosyalar (değişiklik gerekmez):**

| Kaynak (defterappv2/src/) | Hedef (isletmetakip-web/src/) | Bağımlılık durumu |
|---|---|---|
| `types/database.ts` | `types/database.ts` | Saf TS, bağımlılık yok |
| `types/multiUser.ts` | `types/multiUser.ts` | Saf TS |
| `types/cariSharing.ts` | `types/cariSharing.ts` | Saf TS |
| `types/ocrImport.ts` | `types/ocrImport.ts` | Saf TS |
| `constants/islemTypes.ts` | `constants/islemTypes.ts` | Saf TS |
| `constants/currencies.ts` | `constants/currencies.ts` | Saf TS |
| `constants/categoryIcons.ts` | `constants/categoryIcons.ts` | Saf TS (icon string ID'leri) |
| `constants/colors.ts` | `constants/colors.ts` | Saf TS |
| `lib/queryKeys.ts` | `lib/queryKeys.ts` | Sadece @tanstack/react-query |
| `lib/transactionGrouping.ts` | `lib/transactionGrouping.ts` | Saf TS |
| `lib/transactionColors.ts` | `lib/transactionColors.ts` | Saf TS |
| `lib/cariTransactionMapper.ts` | `lib/cariTransactionMapper.ts` | Saf TS |
| `lib/fuzzyMatch.ts` | `lib/fuzzyMatch.ts` | Saf TS |
| `lib/errors.ts` | `lib/errors.ts` | Saf TS |
| `lib/schemas/paymentForm.ts` | `lib/schemas/paymentForm.ts` | zod + currency.ts |
| `i18n/locales/tr/*.json` (17 dosya) | `i18n/locales/tr/*.json` | JSON |
| `i18n/locales/en/*.json` (17 dosya) | `i18n/locales/en/*.json` | JSON |

**Kopyalanıp refactor edilecek dosyalar:**

| Kaynak | Sorun | Çözüm |
|---|---|---|
| `lib/currency.ts` (91 dosya import ediyor) | `useSettings` hook'undan `getCurrentCurrency()` kullanıyor | Hook bağımlılığını kaldır, tüm fonksiyonlara `currency` parametresi ekle. ~%70'i zaten saf fonksiyon |
| `lib/date.ts` (51 dosya import ediyor) | `useSettings` hook'undan `getCurrentDateFormat()` kullanıyor | Hook bağımlılığını kaldır, `getLocale()` fonksiyonuna parametre ekle. ~%95'i zaten saf fonksiyon |
| `types/analytics.ts` | `React` import'u var (sadece `ComponentType` için) | `React` import'unu `import type { ComponentType } from 'react'` olarak değiştir |

**Yeniden yazılacak dosyalar (web-spesifik):**

| Dosya | Neden |
|---|---|
| `lib/supabase/client.ts` | `@supabase/ssr` + `createBrowserClient` kullanacak (cookie tabanlı) |
| `lib/supabase/server.ts` | `createServerClient` + `cookies()` from `next/headers` |
| `lib/supabase/middleware.ts` | Auth token refresh on every request |
| `hooks/useAuth.ts` | Expo/RN spesifik kod yok, OAuth redirect flow, cookie session |
| `contexts/AuthContext.tsx` | Aynı interface ama web implementation |
| `i18n/index.ts` | `next-intl` konfigürasyonu (`expo-localization` yerine) |
| Tüm `hooks/*.ts` | Supabase SSR client ile yeniden yazılacak (query mantığı aynı) |
| Tüm `components/*` | React Native → React/shadcn tamamen yeniden |

### 0.4 Supabase SSR Konfigürasyonu

**Browser client** (`src/lib/supabase/client.ts`):
```typescript
import { createBrowserClient } from '@supabase/ssr'
export const createClient = () =>
  createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
```

**Server client** (`src/lib/supabase/server.ts`):
```typescript
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
// Cookie tabanlı session yönetimi
```

**Middleware** (`middleware.ts`):
- Her istekte auth token'ı yenile
- `/(dashboard)/*` route'larını koru → giriş yapmamış kullanıcıyı `/giris`'e yönlendir
- Giriş yapmış kullanıcıyı `/giris`'ten `/(dashboard)`'a yönlendir

### 0.5 Environment Variables

`.env.local` dosyası:
```
NEXT_PUBLIC_SUPABASE_URL=<mevcut EXPO_PUBLIC_SUPABASE_URL ile aynı>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<mevcut EXPO_PUBLIC_SUPABASE_ANON_KEY ile aynı>
NEXT_PUBLIC_GOOGLE_CLIENT_ID=<mevcut EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ile aynı>
NEXT_PUBLIC_SITE_URL=http://localhost:3000  (prod'da domain)
```

### 0.6 Supabase Dashboard Ayarları (Web için)

Supabase Dashboard > Authentication > URL Configuration:
1. **Site URL:** Production domain ekle (ör: `https://isletmetakip.com`)
2. **Redirect URLs:** Ekle: `http://localhost:3000/auth/callback`, `https://isletmetakip.com/auth/callback`

Supabase Dashboard > Authentication > Providers:
1. **Google:** Web Client ID zaten var (`EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`), redirect URI olarak web domain'i ekle

### 0.7 TanStack Query Provider

```typescript
// src/providers/query-provider.tsx
'use client'
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,     // 5 dk (mobil ile aynı)
      gcTime: 15 * 60 * 1000,        // 15 dk
      refetchOnWindowFocus: true,     // Web: tab'a dönünce refetch
    },
  },
})
```

### 0.8 shadcn/ui Tema (Mevcut Renk Paleti)

Mobil uygulamadaki `colors.ts`'den CSS variables'a dönüşüm:
```css
:root {
  --primary: 163 74% 21%;         /* #0D5C4D (ana yeşil) */
  --primary-foreground: 0 0% 100%;
  --background: 0 0% 96%;         /* #F5F5F5 */
  --card: 0 0% 100%;
  --destructive: 0 84% 60%;       /* #EF4444 (kırmızı) */
  --success: 160 84% 39%;         /* #10B981 (yeşil) */
  --border: 220 13% 91%;          /* #E5E7EB */
}
```

### 0.9 i18n Konfigürasyonu (next-intl)

- 17 namespace JSON dosyası `packages/shared-i18n`'den kopyalanacak
- `next-intl` middleware ile dil algılama (cookie → Accept-Language header)
- URL prefix kullanılmayacak (uygulama auth arkasında, SEO önemsiz)
- Varsayılan dil: Türkçe

### 0.10 Doğrulama

```
✓ `npm run dev` çalışıyor mu? (localhost:3000)
✓ shadcn/ui component'leri render oluyor mu?
✓ Supabase client bağlantısı çalışıyor mu? (basit bir query test)
✓ i18n çevirileri yükleniyor mu?
✓ defterappv2/ dizininde HİÇBİR değişiklik yok mu? (git status ile kontrol)
```

---

## Faz 1: Auth + Layout + Landing Page (5-7 gün)

### 1.1 Route Yapısı

```
src/app/
├── layout.tsx                      ← Root layout (providers, metadata, font)
├── globals.css                     ← Tailwind + shadcn tema CSS
├── (public)/                       ← Public layout grubu
│   ├── layout.tsx                  ← Navbar (logo + Giriş/Kayıt butonları) + Footer
│   ├── page.tsx                    ← Landing page (ana sayfa)
│   ├── giris/page.tsx              ← Login formu (email + Google)
│   ├── kayit/page.tsx              ← Register formu (email + isletme adı)
│   ├── sifremi-unuttum/page.tsx    ← Şifre sıfırlama email gönder
│   ├── gizlilik-politikasi/page.tsx
│   ├── kullanim-kosullari/page.tsx
│   └── kvkk/page.tsx
├── auth/
│   └── callback/route.ts          ← OAuth callback handler (Google redirect)
└── (dashboard)/                    ← Authenticated layout grubu
    ├── layout.tsx                  ← Sidebar + Topbar
    └── ...modüller
```

### 1.2 Landing Page Detayı

`src/app/(public)/page.tsx`:
- **Hero section:** Başlık, alt başlık, "Ücretsiz Başla" + "Giriş Yap" butonları
- **Özellikler grid:** 6-8 özellik kartı (icon + başlık + açıklama)
  - Gelir/Gider Takibi, Cari Yönetimi, Personel Takibi, Stok Yönetimi, Raporlar, Çoklu Döviz
- **Mobil uygulama bölümü:** App Store + Play Store badge'leri, telefon mockup
- **Footer:** Yasal linkler (Gizlilik, Kullanım Koşulları, KVKK), iletişim

### 1.3 Auth Implementasyonu

**Login sayfası** (`src/app/(public)/giris/page.tsx`):
- Email + şifre formu (react-hook-form + zod validation)
- "Google ile Giriş Yap" butonu
- "Şifremi Unuttum" linki
- "Hesabın yok mu? Kayıt ol" linki
- Apple Sign-In YOK (web'de zor, sonraya bırakıldı)

**Register sayfası** (`src/app/(public)/kayit/page.tsx`):
- Email + şifre + işletme adı formu
- Minimum şifre: 6 karakter (Supabase config ile uyumlu)
- Kayıt sonrası otomatik login + işletme oluşturma

**OAuth callback** (`src/app/auth/callback/route.ts`):
- Google OAuth redirect'ten dönen `code` parametresini al
- `supabase.auth.exchangeCodeForSession(code)` çağır
- Başarılıysa `/(dashboard)`'a yönlendir

**Auth hook** (`src/hooks/useAuth.ts`):
Mobil `useAuth.ts`'den (950 satır) web versiyonu yazılacak. Korunacak mantık:
- `fetchOrCreateIsletme`: Race condition korumalı (pendingRequests Map + lock)
  - Kullanıcıya ait isletme var mı kontrol → yoksa upsert ile oluştur
  - Duplicate key hatası → mevcut kaydı fetch et
- `signIn/signUp/signOut`: Supabase auth metodları (aynı)
- `signInWithGoogle`: `signInWithOAuth({ provider: 'google' })` redirect flow (mobil'de IdToken, web'de redirect)
- `deleteAccount/cancelAccountDeletion`: `scheduled_deletion_at` 7 gün (aynı mantık)
- `switchToSharedIsletme/switchToOwnIsletme`: Multi-user business switching (aynı mantık)
- `refreshPermissions`: `isletme_users` tablosundan yetki güncelle

Kaldırılacak mobil-spesifik kod:
- `AppState` listener (arka plandan dönüş) → `document.visibilitychange` event ile değiştirilecek
- `expo-apple-authentication` → web'de yok
- `@react-native-google-signin/google-signin` → OAuth redirect ile değiştirilecek
- AsyncStorage referansları → cookie tabanlı (otomatik, @supabase/ssr hallediyor)
- 2 dakikalık token refresh timer → `@supabase/ssr` middleware otomatik hallediyor

**AuthContext** (`src/contexts/AuthContext.tsx`):
Aynı interface, farklı implementation:
```typescript
interface AuthContextType {
  session: Session | null
  user: User | null
  isletme: Isletme | null
  loading: boolean
  initialized: boolean
  isletmeLoading: boolean
  ownIsletme: Isletme | null
  isOwner: boolean
  isSharedMode: boolean
  currentPermissions: Permissions | null
  currentUserRole: UserRole | 'owner' | null
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string, isletmeName: string) => Promise<void>
  signOut: () => Promise<void>
  signInWithGoogle: () => Promise<void>
  deleteAccount: () => Promise<void>
  cancelAccountDeletion: () => Promise<void>
  changePassword: (newPassword: string) => Promise<void>
  switchToSharedIsletme: (isletme, permissions, role) => void
  switchToOwnIsletme: () => void
  refreshPermissions: () => Promise<void>
  refreshIsletme: () => Promise<void>
}
```

### 1.4 Dashboard Layout

**Sidebar** (`src/components/layout/Sidebar.tsx`):
- Logo + işletme adı (üstte)
- Navigasyon linkleri (icon + text):
  - Dashboard (LayoutDashboard icon)
  - Hesaplar (Wallet)
  - İşlemler (ArrowLeftRight)
  - Cariler (Users)
  - Personel (UserCheck)
  - Kategoriler (FolderTree)
  - Ürünler (Package)
  - Raporlar (BarChart3)
  - Ayarlar (Settings)
- Aktif sayfa highlight
- Responsive: desktop'ta 256px sabit, tablet'te collapsible (icon-only), mobilde sheet/drawer

**Topbar** (`src/components/layout/Topbar.tsx`):
- Sol: Hamburger menü butonu (mobil), breadcrumb (desktop)
- Sağ: Dil değiştirme (TR/EN dropdown), kullanıcı avatar + dropdown menü
  - Dropdown: İşletme adı, Paylaşılan İşletmeler (varsa), Profil, Çıkış

### 1.5 Doğrulama

```
✓ Landing page render oluyor mu?
✓ Email/şifre ile kayıt + giriş yapılabiliyor mu?
✓ Google OAuth redirect flow çalışıyor mu?
✓ Giriş sonrası /(dashboard) layout görünüyor mu?
✓ Sidebar navigasyonu çalışıyor mu?
✓ MOBİL'de kayıtlı kullanıcı web'den giriş yapabiliyor mu? (aynı Supabase)
✓ Protected route'lar: giriş yapmamış kullanıcı /giris'e yönlendiriliyor mu?
✓ Çıkış yapınca session temizleniyor mu?
✓ defterappv2/ dizininde HİÇBİR değişiklik yok mu?
```

---

## Faz 2: Tüm Core Modüller - Temel CRUD (20-25 gün)

### Ortak Pattern (Her modülde tekrar eden yapı)

**Data Table component'i** (`src/components/ui/data-table.tsx`):
- @tanstack/react-table v8 ile server-side pagination
- Supabase `.range(from, to)` ile sayfalama, `.order()` ile sıralama
- Kolon başlığına tıklayarak sıralama
- Arama çubuğu (`.ilike()` ile server-side search)
- Filtre chips (aktif filtreleri göster/kaldır)
- Satır başına aksiyon menüsü (düzenle, sil)
- Boş durum: "Henüz kayıt yok" mesajı + CTA butonu
- Sayfa başına 25 satır (mobil'de 50, web'de tablo olduğu için 25 yeterli)

**Form pattern'i**:
- `react-hook-form` + `@hookform/resolvers/zod`
- Shared Zod şemaları (`src/lib/schemas/`) kullanılacak
- shadcn/ui Form component'leri (FormField, FormItem, FormLabel, FormMessage)
- Async entity seçicileri (ComboBox ile hesap/cari/personel/kategori seçimi)
- Form submit → Supabase mutation → cache invalidation → redirect

**Hook pattern'i** (her modül için):
- `useXxx(filters?)` → `useQuery` ile liste
- `useXxxById(id)` → `useQuery` ile tekil kayıt
- `useCreateXxx()` → `useMutation` ile oluşturma
- `useUpdateXxx()` → `useMutation` ile güncelleme
- `useDeleteXxx()` → `useMutation` ile silme + ilişkili kayıt kontrolü
- Tüm hook'lar `src/lib/queryKeys.ts`'deki key'leri kullanacak
- Mutation sonrası `invalidateRelatedQueries()` ile cache temizle

### 2.0 Ortak Bileşenler (Her modülde kullanılan) (2 gün)

**Yazılacak dosyalar:**
```
src/components/shared/
├── UndoToast.tsx                   ← 5 saniyelik geri al bildirimi (silme işlemlerinde)
├── DeleteConfirmDialog.tsx         ← Silme onay dialogu (ilişkili kayıt uyarısıyla)
├── EntityCombobox.tsx              ← Hesap/Cari/Personel/Kategori arama + seçim
├── AmountInput.tsx                 ← Para tutarı girişi (Türk formatı: 1.234,56)
├── CurrencySelect.tsx              ← Döviz seçici (TRY, USD, EUR, GBP, XAU, XAG)
├── DateRangePicker.tsx             ← Tarih aralığı seçici
├── ExchangeRateInput.tsx           ← Döviz kuru girişi
├── EmptyState.tsx                  ← Boş liste durumu (ikon + mesaj + CTA)
└── PageHeader.tsx                  ← Sayfa başlığı + breadcrumb + aksiyon butonları
```

**Soft Delete / Undo pattern** (mobil'deki `useUndoDelete` mantığı):
- `src/hooks/useUndoDelete.ts` → Silme isteğinde 5 sn bekle, "Geri Al" toast göster
- 5 sn içinde geri alınmazsa kalıcı sil
- Component unmount olursa otomatik commit et
- Web'de shadcn/ui toast ile uygulanacak (mobil'de Snackbar)

### 2.1 Dashboard (4 gün)

**Route:** `src/app/(dashboard)/page.tsx`

**Yazılacak dosyalar:**
```
src/hooks/useDashboard.ts          ← KPI ve trend verileri (useMonthSummary, useAnalyticsTrend mantığı)
src/components/dashboard/
├── KpiCard.tsx                     ← Tek bir KPI kartı (değer + delta + trend icon)
├── KpiGrid.tsx                     ← 6 KPI kartı grid'i (3x2 desktop, responsive)
├── AccountsSummary.tsx             ← Hesaplar gruplanmış özet (nakit, banka, kredi kartı, birikim, diğer)
├── AccountBalanceRow.tsx           ← Tekil hesap bakiye satırı (ana + yabancı döviz)
├── IncomeExpenseChart.tsx          ← recharts BarChart (6 dönemlik gelir/gider trendi)
├── TrendFilterPanel.tsx            ← Trend chart filtresi (hesap, cari, kategori, personel)
├── CategoryDonutChart.tsx          ← recharts PieChart (kategori dağılımı, top 4 + diğer)
├── CashFlowSummary.tsx             ← Nakit akışı özet kartı (giren/çıkan/net)
├── RecentTransactions.tsx          ← Son 10 işlem listesi
├── QuickActions.tsx                ← Hızlı işlem butonları (Gelir, Gider, Transfer)
├── PeriodSelector.tsx              ← Dönem seçici (günlük/haftalık/aylık/yıllık)
├── SharedIsletmeBanner.tsx         ← Paylaşılan işletme modunda uyarı banner'ı
└── DeletionWarningBanner.tsx       ← Hesap silme countdown banner'ı (7 gün)
```

**Dashboard bölümleri (mobil'deki 6 carousel view'dan uyarlanmış):**
1. **KPI Grid:** Gelir, Gider, Net Kar + delta yüzdeleri (önceki döneme kıyasla)
2. **Hesap Bakiyeleri:** Tipe göre gruplanmış hesap listesi (nakit/banka/kredi kartı)
3. **Alacak/Borç Özeti:** Toplam müşteri alacak + tedarikçi borç
4. **Gelir/Gider Trend:** 6 dönemlik bar chart (filtrelenebilir)
5. **Kategori Dağılımı:** Donut chart (gelir/gider toggle, top 4 kategori + diğer)
6. **Nakit Akışı:** Giren/çıkan/net nakit akışı kartı

**KPI kartları (6 adet):**
1. Toplam Bakiye (tüm hesapların toplamı)
2. Bu Ay Gelir (yeşil, yukarı ok, delta %)
3. Bu Ay Gider (kırmızı, aşağı ok, delta %)
4. Net Kar/Zarar (gelir - gider)
5. Toplam Alacak (cari bakiyeler > 0)
6. Toplam Borç (cari bakiyeler < 0)

**Supabase query'leri:**
- KPI: `supabase.rpc('get_income_expense_summary', { p_isletme_id, p_start_date, p_end_date })`
- Hesap bakiyeleri: `supabase.from('hesaplar').select('balance, currency, type, name, is_active').eq('isletme_id', id)`
- Cari bakiyeleri: `supabase.from('cariler').select('balance, type').eq('isletme_id', id)`
- Son işlemler: `supabase.from('islemler').select('*, hesap:hesaplar(name), kategori:kategoriler(name)').order('date', { ascending: false }).limit(10)`

### 2.2 Hesaplar / Accounts (3 gün)

**Route'lar:**
```
src/app/(dashboard)/hesaplar/
├── page.tsx                        ← Liste
├── ekle/page.tsx                   ← Yeni hesap
└── [id]/
    ├── page.tsx                    ← Detay + işlemler
    └── duzenle/page.tsx            ← Düzenle
```

**Yazılacak dosyalar:**
```
src/hooks/useHesaplar.ts            ← CRUD hook'ları
src/components/hesaplar/
├── HesaplarTable.tsx               ← Data table
├── HesapForm.tsx                   ← Oluştur/düzenle formu
├── HesapDetail.tsx                 ← Detay kartı (bakiye, tip, bilgiler)
├── HesapTypeFilter.tsx             ← Tip filtresi (nakit/banka/kredi_karti/birikim/diger)
└── HesapTransactions.tsx           ← Bu hesaba ait işlemler tablosu
```

**Tablo kolonları:** Ad | Tip | Döviz | Bakiye | Kredi Limiti | Durum | Aksiyonlar
**Form alanları:** Ad, Tip (select), Döviz (select), Başlangıç Bakiyesi, Kredi Limiti (sadece kredi_karti), Kart Son 4 Hane (opsiyonel), Ödeme Günü (opsiyonel)

**Supabase query:** `supabase.from('hesaplar').select('*').eq('isletme_id', id).eq('is_archived', false).order('name')`

### 2.3 İşlemler / Transactions (7 gün) - EN KARMAŞIK

**Route'lar:**
```
src/app/(dashboard)/islemler/
├── page.tsx                        ← Liste + filtreler
├── ekle/page.tsx                   ← Birleşik işlem formu
└── [id]/duzenle/page.tsx           ← Düzenle
```

**Yazılacak dosyalar:**
```
src/hooks/useIslemler.ts            ← CRUD + bakiye güncelleme mantığı
src/components/islemler/
├── IslemlerTable.tsx               ← Data table (infinite scroll değil, pagination)
├── IslemFilterPanel.tsx            ← Filtre paneli (tarih, tip, hesap, cari, personel, kategori)
├── IslemForm.tsx                   ← Birleşik form (tip seçimine göre dinamik alanlar)
├── IslemTypeSelector.tsx           ← İşlem tipi seçici (gruplu: Gelir, Gider, Ödeme, Transfer)
├── IslemTypeBadge.tsx              ← İşlem tipi badge (renk kodlu)
├── AmountInput.tsx                 ← Para tutarı girişi (Türk formatı: 1.234,56)
├── EntityCombobox.tsx              ← Hesap/Cari/Personel/Kategori seçici (arama + oluştur)
├── ExchangeRateInput.tsx           ← Döviz kuru girişi (çapraz döviz işlemleri için)
└── PhotoUpload.tsx                 ← Fiş/fatura fotoğrafı yükleme (drag & drop)
```

**19 işlem tipi ve form alanları:**

| Tip | Hesap | Hedef Hesap | Kategori | Cari | Personel | Döviz Kuru |
|-----|-------|-------------|----------|------|----------|------------|
| gelir | ✓ | - | ✓ | - | - | - |
| gider | ✓ | - | ✓ | - | - | - |
| transfer | ✓ | ✓ | - | - | - | farklıysa ✓ |
| cari_alis | - | - | ✓ | ✓ | - | - |
| cari_satis | - | - | ✓ | ✓ | - | - |
| cari_odeme | ✓ | - | - | ✓ | - | farklıysa ✓ |
| cari_tahsilat | ✓ | - | - | ✓ | - | farklıysa ✓ |
| cari_alis_iade | - | - | ✓ | ✓ | - | - |
| cari_satis_iade | - | - | ✓ | ✓ | - | - |
| personel_gider | - | - | ✓ | - | ✓ | - |
| personel_satis | - | - | ✓ | - | ✓ | - |
| personel_odeme | ✓ | - | - | - | ✓ | farklıysa ✓ |
| personel_tahsilat | ✓ | - | - | - | ✓ | farklıysa ✓ |
| nakit_avans_taksit | ✓ | - | - | - | - | - |
| personel_izin_hakki | - | - | - | - | ✓ | - |
| personel_izin_kullanimi | - | - | - | - | ✓ | - |

**Bakiye güncelleme mantığı** (mobil `useIslemler.ts` satır 265-435'ten):
- İşlem oluşturulunca: `supabase.rpc('increment_balance', { table_name, row_id, amount })` çağrılır
- İşlem silinince: ters yönde `increment_balance` çağrılır (reverseBalances)
- İşlem güncellenince: önce eski bakiyeyi geri al, sonra yeni bakiyeyi uygula
- Bu RPC fonksiyonu zaten Supabase'de var, web'den aynı şekilde çağrılır

**Supabase query:** `supabase.from('islemler').select('*, hesap:hesaplar(name, currency), hedef_hesap:hesaplar!hedef_hesap_id(name, currency), kategori:kategoriler(name, icon, color), cari:cariler(name), personel:personel(first_name, last_name)').eq('isletme_id', id).range(from, to).order('date', { ascending: false })`

### 2.4 Cariler / Customers & Suppliers (3 gün)

**Route'lar:**
```
src/app/(dashboard)/cariler/
├── page.tsx
├── ekle/page.tsx
└── [id]/
    ├── page.tsx                    ← Detay + bakiye özeti + işlemler
    └── duzenle/page.tsx
```

**Yazılacak dosyalar:**
```
src/hooks/useCariler.ts
src/components/cariler/
├── CarilerTable.tsx
├── CariForm.tsx
├── CariDetail.tsx                  ← Bakiye kartı + iletişim bilgileri
├── CariTypeFilter.tsx              ← müşteri / tedarikçi filtresi
├── CariBalanceSummary.tsx          ← Toplam alacak/borç özet kartı
└── CariTransactions.tsx            ← Bu cariye ait işlemler tablosu
```

**Tablo kolonları:** Ad | Tip (müşteri/tedarikçi) | Döviz | Bakiye | Telefon | Durum | Aksiyonlar
**Form alanları:** Ad, Tip (select), Telefon, Email, Adres, Vergi No, Döviz (select), Not

**Detay sayfasında bakiye bilgisi:**
- Bakiye > 0 → "Bu cari size X TL borçlu" (yeşil)
- Bakiye < 0 → "Bu cariye X TL borcunuz var" (kırmızı)
- `getBalanceInfo()` fonksiyonu (shared-logic'ten) kullanılacak

### 2.5 Personel / Staff (3 gün)

**Route'lar:**
```
src/app/(dashboard)/personel/
├── page.tsx
├── ekle/page.tsx
└── [id]/
    ├── page.tsx                    ← Detay + izin + işlemler
    └── duzenle/page.tsx
```

**Yazılacak dosyalar:**
```
src/hooks/usePersonel.ts
src/components/personel/
├── PersonelTable.tsx
├── PersonelForm.tsx
├── PersonelDetail.tsx              ← Bilgi kartı + bakiye + izin durumu
├── PersonelLeaveCard.tsx           ← İzin hakkı vs kullanılan izin kartı
└── PersonelTransactions.tsx
```

**Tablo kolonları:** Ad Soyad | Pozisyon | Maaş | Bakiye | Döviz | Durum | Başlangıç | Aksiyonlar
**İzin kartı:** Toplam hak (personel_izin_hakki işlemleri) - Kullanılan (personel_izin_kullanimi işlemleri) = Kalan

**Ek route'lar:**
```
src/app/(dashboard)/personel/
├── toplu-gider/page.tsx            ← Toplu maaş gideri (batch salary expense)
├── toplu-odeme/page.tsx            ← Toplu maaş ödemesi (batch salary payment)
└── [id]/izin-gecmisi/page.tsx      ← Personel izin geçmişi detayı
```

**Toplu maaş gideri** (mobil `toplu-gider.tsx`'den):
- Tarih (varsayılan: ayın son günü 23:59), kategori (gider tipi), açıklama
- Tüm personel listesi checkbox'larla (tümünü seç/kaldır)
- Her personel için tutar inputu (maaş otomatik doldurulur)
- Özet: seçilen kişi sayısı + toplam tutar
- Her personel için `personel_gider` işlemi oluşturur

**Toplu maaş ödemesi** (mobil `toplu-odeme.tsx`'den):
- Hesap seçici (kredi kartı hariç), tarih
- "Maaşları Doldur" butonu: bakiyesi < 0 olan personeli otomatik seç
- Her personel için tutar inputu
- Her personel için `personel_odeme` işlemi oluşturur (hesap bakiyesi güncellenir)

**İzin geçmişi** (mobil `izin-gecmisi/[id].tsx`'den):
- Özet kartı: hak edilen / kullanılan / kalan gün (renk kodlu)
- İzin işlemleri listesi: tip (hak/kullanım), tarih, tarih aralığı (varsa), gün sayısı

### 2.6 Kategoriler / Categories (2 gün)

**Route:** `src/app/(dashboard)/kategoriler/page.tsx`

**Yazılacak dosyalar:**
```
src/hooks/useKategoriler.ts
src/components/kategoriler/
├── KategoriTree.tsx                ← Ağaç görünümü (parent → children indented)
├── KategoriForm.tsx                ← Modal form (ad, tip, parent, icon, renk)
├── KategoriTypeTab.tsx             ← Tip tabları: gelir / gider / ürün
└── IconColorPicker.tsx             ← Icon + renk seçici (categoryIcons.ts'den)
```

**Ağaç yapısı:** `buildCategoryTree()` fonksiyonu (mobil'den kopyalanacak, `useKategoriler.ts`'de)
- Parent kategori satırı (bold, icon)
  - Alt kategori 1 (indented)
  - Alt kategori 2 (indented)

### 2.7 Ürünler / Products (3 gün)

**Route'lar:**
```
src/app/(dashboard)/urunler/
├── page.tsx
├── ekle/page.tsx
└── [id]/
    ├── page.tsx                    ← Detay + stok hareketleri
    └── duzenle/page.tsx
```

**Yazılacak dosyalar:**
```
src/hooks/useUrunler.ts
src/hooks/useUrunHareketler.ts
src/components/urunler/
├── UrunlerTable.tsx
├── UrunForm.tsx
├── UrunDetail.tsx                  ← Ürün bilgi + stok durumu kartı
├── StokHareketTable.tsx            ← Giriş/çıkış/düzeltme hareketleri
└── StokHareketForm.tsx             ← Stok hareketi ekleme (tip + miktar + birim fiyat)
```

**Tablo kolonları:** Ad | Kod | Birim | Miktar | Alış Fiyatı | Satış Fiyatı | Kategori | Durum | Aksiyonlar
**Stok hareket tipleri:** giriş (yeşil +), çıkış (kırmızı -), düzeltme (mavi ~)

**Ek route'lar:**
```
src/app/(dashboard)/urunler/
├── toplu-giris/page.tsx            ← Toplu stok girişi (batch stock in)
└── toplu-cikis/page.tsx            ← Toplu stok çıkışı (batch stock out)
```

**Toplu stok girişi** (mobil `toplu-giris.tsx`'den):
- Tarih seçici, opsiyonel cari bağlama
- Dinamik satır ekleme: ürün seçici + miktar + birim fiyat + KDV oranı (cari varsa)
- Her satır için toplam hesabı (miktar × birim fiyat + KDV)
- Alt toplam: ürün adedi + genel toplam tutar
- Her ürün için `urun_hareket` (tip: "giris") oluşturur
- Cari bağlıysa `createBulkUrunHareketWithCari` kullanılır

**Toplu stok çıkışı** (mobil `toplu-cikis.tsx`'den):
- Aynı yapı ama hareket_tipi: "cikis"
- Stok miktarı kontrolü (çıkış > mevcut stok uyarısı)

### 2.8 Raporlar / Reports (3 gün)

**Route'lar:**
```
src/app/(dashboard)/raporlar/
├── page.tsx                        ← Rapor hub (6 kart)
├── genel/page.tsx                  ← Genel finansal özet
├── gelir-gider/page.tsx            ← Gelir/gider detay (kategori bazlı)
├── cari/page.tsx                   ← Cari bakiye raporu
├── personel/page.tsx               ← Personel maaş/ödeme raporu
└── karsilastirma/page.tsx          ← Dönem karşılaştırma
```

**Yazılacak dosyalar:**
```
src/hooks/useReports.ts             ← Rapor query'leri (useCategoryReport, useFinancialSummary mantığı)
src/components/raporlar/
├── ReportHub.tsx                   ← 6 rapor kartı grid'i
├── PeriodSelector.tsx              ← Ay/yıl seçici
├── FinancialSummaryTable.tsx       ← Gelir/gider özet tablosu
├── CategoryBreakdownChart.tsx      ← recharts BarChart (kategori bazlı)
├── CariBalanceReport.tsx           ← Tüm carilerin bakiye tablosu
├── PersonelReport.tsx              ← Personel maaş/ödeme tablosu
├── ComparisonChart.tsx             ← İki dönem karşılaştırma (recharts)
└── ExcelExportButton.tsx           ← xlsx-js-style ile Excel export
```

### 2.9 Ayarlar / Settings (3 gün)

**Route'lar:**
```
src/app/(dashboard)/ayarlar/
├── page.tsx                        ← Ayarlar hub
├── isletme/page.tsx                ← İşletme bilgileri düzenle
├── kullanici-yonetimi/page.tsx     ← Multi-user yönetimi
├── paylasilan-isletmeler/page.tsx  ← Paylaşılan işletmeler (davet kodu gir, işletme değiştir)
├── islem-gecmisi/page.tsx          ← Audit log (silinen + düzenlenen işlemler)
├── hesap-sil/page.tsx              ← Hesap silme (7 gün geri sayım)
└── data-import/page.tsx            ← Excel import (Faz 3'te detaylanacak)
```

**Yazılacak dosyalar:**
```
src/hooks/useSettings.ts            ← Dil/döviz/tarih formatı tercihleri (localStorage)
src/hooks/useMultiUser.ts           ← Multi-user CRUD (davet, yetki, rol)
src/hooks/useAuditLog.ts            ← Silinen/düzenlenen işlemler query'si
src/components/ayarlar/
├── IsletmeForm.tsx                 ← Ad, telefon, adres, vergi no
├── SettingsHub.tsx                 ← Ayar kategorileri kartları
├── LanguageSelector.tsx            ← TR/EN dil değiştirici
├── CurrencyFormatSelector.tsx      ← Varsayılan döviz + tarih formatı
├── DateFormatSelector.tsx          ← DMY/MDY tarih formatı (örnek gösterimli)
├── UserManagement.tsx              ← Kullanıcı listesi tablosu
├── InviteUserDialog.tsx            ← Davet gönder (email + rol + yetkiler)
├── PermissionEditor.tsx            ← Modül bazlı yetki düzenleme grid'i
├── SharedBusinesses.tsx            ← Paylaşılan işletme listesi + davet kodu girişi
├── AuditLogTable.tsx               ← İşlem geçmişi (silinen/düzenlenen, 2 tab)
├── AccountDeletion.tsx             ← Hesap silme + iptal + geri sayım
└── ChangePasswordDialog.tsx        ← Şifre değiştirme modal'ı
```

**Paylaşılan işletmeler** (mobil `paylasilan-isletmeler.tsx`'den):
- Davet kodu giriş alanı + "Kabul Et" butonu
- Paylaşılan işletme listesi: işletme adı, rol, "Geç" butonu, "Ayrıl" butonu
- İşletme değiştirme: yetkileri fetch et → context'i güncelle → dashboard'a yönlendir

**Audit log** (mobil `islem-gecmisi.tsx`'den):
- 2 tab: Silinen işlemler (çöp kutusu icon) + Düzenlenen işlemler (kalem icon)
- Her satır: açıklama, tutar, yapan kişi (email/ad), tarih
- Düzenlemeler: eski tutar → yeni tutar ok işaretiyle

**Hesap silme** (mobil `hesap-sil.tsx`'den):
- 7 günlük bekleme süresi (scheduled_deletion_at)
- Geri sayım göstergesi
- "İptal Et" butonu (cancelAccountDeletion)

**Multi-user yetki grid'i:**
| Modül | Görüntüle | Oluştur | Kendi Düzenle | Tümünü Düzenle | Kendi Sil | Tümünü Sil |
|-------|-----------|---------|---------------|----------------|-----------|------------|
| Dashboard | ✓ | - | - | - | - | - |
| Hesaplar | ✓/✗ | ✓/✗ | ✓/✗ | ✓/✗ | ✓/✗ | ✓/✗ |
| Cariler | ✓/✗ | ✓/✗ | ✓/✗ | ✓/✗ | ✓/✗ | ✓/✗ |
| Personel | ✓/✗ | ✓/✗ | ✓/✗ | ✓/✗ | ✓/✗ | ✓/✗ |
| İşlemler | ✓/✗ | ✓/✗ | ✓/✗ | ✓/✗ | ✓/✗ | ✓/✗ |
| Kategoriler | ✓/✗ | ✓/✗ | ✓/✗ | ✓/✗ | ✓/✗ | ✓/✗ |
| Raporlar | ✓/✗ | - | - | - | - | - |
| Çekler | ✓/✗ | ✓/✗ | ✓/✗ | ✓/✗ | ✓/✗ | ✓/✗ |
| Ürünler | ✓/✗ | ✓/✗ | ✓/✗ | ✓/✗ | ✓/✗ | ✓/✗ |

### 2.10 Global Arama + Onboarding (1 gün)

**Global Arama** (mobil `arama.tsx`'den):
```
src/app/(dashboard)/arama/page.tsx
src/components/shared/GlobalSearch.tsx    ← Topbar'a entegre Command palette (Ctrl+K)
```
- 6 entity tipi: hesaplar, müşteri cariler, tedarikçi cariler, personel, ürünler, işlemler
- 300ms debounce ile arama
- Türkçe metin normalizasyonu (fuzzyMatch.ts)
- İşlemler için server-side search (useSearchIslemler)
- Sonuçlarda bakiye/fiyat bilgisi + arşiv badge'i
- shadcn/ui Command component'i (⌘K / Ctrl+K kısayolu)

**Onboarding** (mobil `onboarding.tsx`'den):
```
src/components/onboarding/OnboardingDialog.tsx
```
- İlk girişte gösterilen hoşgeldin dialogu
- 5 adımlı carousel: Hesaplar, Cariler, Personel, Analiz, Pro özellikler
- "Atla" butonu
- Tamamlanma durumu localStorage'da saklanır
- Web'de tam ekran carousel yerine modal/dialog olarak uygulanacak

### 2.11 Doğrulama (Tüm Faz 2)

```
✓ Her modül için: liste, detay, oluştur, düzenle, sil çalışıyor mu?
✓ Data table: sıralama, filtreleme, sayfalama düzgün mü?
✓ Formlar: validation hataları gösteriliyor mu? Başarılı submit sonrası redirect var mı?
✓ MOBİL'de oluşturulan veri web'de görünüyor mu?
✓ WEB'de oluşturulan veri mobil'de görünüyor mu?
✓ Bakiye güncellemeleri doğru mu? (işlem ekle → hesap/cari/personel bakiyesi değişti mi?)
✓ İşlem silince bakiye geri alınıyor mu?
✓ Multi-user: yetki kısıtlamaları çalışıyor mu?
✓ Excel export düzgün dosya üretiyor mu?
✓ defterappv2/ dizininde HİÇBİR değişiklik yok mu?
```

---

## Faz 3: Gelişmiş Özellikler (15-20 gün)

### 3.1 Çekler / Checks (3 gün)

**Route'lar:**
```
src/app/(dashboard)/cekler/
├── page.tsx                        ← Liste (bekleyen + ödenen + iptal)
└── ekle/page.tsx                   ← Çek kes formu
```

**Yazılacak dosyalar:**
```
src/hooks/useCekler.ts              ← Mobil useCekler.ts mantığı
src/components/cekler/
├── CeklerTable.tsx                 ← Data table (durum badge'li)
├── CekForm.tsx                     ← Çek bilgileri formu
├── CekStatusBadge.tsx              ← beklemede (sarı) / ödendi (yeşil) / iptal (kırmızı)
└── CekStatusDialog.tsx             ← Durum değiştir onay dialogu
```

**Çek alanları:** Tutar, vade tarihi, alıcı, banka, çek no, açıklama, durum
**Durum geçişleri:** beklemede → ödendi | beklemede → iptal

### 3.2 Nakit Avans / Cash Advance (2 gün)

**Route:** `src/app/(dashboard)/hesaplar/nakit-avanslar/[id]/page.tsx`

**Yazılacak dosyalar:**
```
src/hooks/useNakitAvans.ts
src/components/nakitAvans/
├── NakitAvansList.tsx              ← Hesaba bağlı nakit avans listesi
├── NakitAvansForm.tsx              ← Yeni nakit avans (tutar, taksit sayısı)
└── TaksitTable.tsx                 ← Taksit planı tablosu (ödenen/kalan)
```

### 3.3 İleri Tarihli İşlemler / Scheduled Transactions (2 gün)

**Route:** `src/app/(dashboard)/ileri-tarihli/page.tsx`

**Yazılacak dosyalar:**
```
src/hooks/useIleriTarihliIslemler.ts
src/components/ileriTarihli/
├── IleriTarihliTable.tsx           ← Planlanmış işlemler tablosu
├── IleriTarihliForm.tsx            ← İşlem planlama formu
└── StatusBadge.tsx                 ← pending/completed/cancelled
```

**Durum:** pending (tarih gelmemiş), completed (otomatik oluşturulmuş), cancelled (iptal)
**Edge function:** `process-scheduled-transactions` zaten günlük çalışıyor, web'den ek bir şey gerekmez

### 3.4 Excel Import (3 gün)

**Route:** `src/app/(dashboard)/ayarlar/data-import/page.tsx`

**Yazılacak dosyalar:**
```
src/hooks/useDataImport.ts          ← Mobil useDataImport.ts mantığı kopyalanacak
src/components/import/
├── FileUploadZone.tsx              ← Drag & drop Excel/CSV yükleme
├── ColumnMappingStep.tsx           ← Excel kolonlarını uygulama alanlarına eşle
├── EntityMatchingStep.tsx          ← Hesap/cari/kategori eşleştirme
├── PreviewStep.tsx                 ← Import edilecek verilerin önizlemesi
├── ImportProgressBar.tsx           ← Batch import ilerleme çubuğu
└── ImportResultSummary.tsx         ← Başarılı/başarısız/atlanan sayıları
```

**Kaynak:** `defterappv2/src/lib/excelImport.ts` mantığı kopyalanacak (xlsx kütüphanesi web'de de çalışır)
**Akış:** Dosya yükle → Kolon eşle → Entity eşleştir → Önizle → Import et

### 3.5 OCR Import (3 gün)

**Route:** `src/app/(dashboard)/foto-import/page.tsx`

**Yazılacak dosyalar:**
```
src/hooks/useOcrImport.ts
src/components/ocrImport/
├── ImageUploadZone.tsx             ← Drag & drop fotoğraf yükleme
├── OcrResultReview.tsx             ← Taranmış fatura bilgileri düzenleme
└── OcrImportForm.tsx               ← Çıkarılan verileri işleme dönüştür
```

**Akış:** Fotoğraf yükle → Supabase Storage'a kaydet → `parse-invoice` edge function çağır → Sonuçları göster → Kullanıcı onaylasın → İşlem oluştur

### 3.6 Fiş Fotoğrafı / Receipt Photo (2 gün)

**İşlem formuna ekleme:**
```
src/components/islemler/PhotoUpload.tsx   ← HTML file input + drag & drop
src/components/islemler/PhotoViewer.tsx   ← Yüklenen fotoğrafı görüntüle (lightbox)
```

**Akış:** Dosya seç/sürükle → Supabase Storage `islem-photos` bucket'ına upload → `photo_path` alanını kaydet
**Web kamera:** İleride `navigator.mediaDevices.getUserMedia()` ile eklenebilir, şimdilik sadece dosya seçici

### 3.7 Arşiv / Archive (1 gün)

**Route:** `src/app/(dashboard)/arsiv/page.tsx`

**İçerik:**
- Arşivlenmiş hesaplar, cariler, personel tablosu
- "Arşivden Çıkar" butonu (is_archived = false yap)
- Filtre: entity tipine göre (hesap/cari/personel)

### 3.8 Notlar / Notes (1 gün)

**Bileşen:** `src/components/notes/NotesSection.tsx`
- Her entity detay sayfasına eklenecek (cari, personel, hesap, ürün)
- Not listesi + "Not Ekle" butonu
- `supabase.from('notlar').select('*').eq('entity_type', type).eq('entity_id', id)`

### 3.9 Doğrulama (Faz 3)

```
✓ Çek oluştur → durum değiştir → liste güncellendi mi?
✓ Nakit avans taksit planı doğru hesaplanıyor mu?
✓ İleri tarihli işlem oluştur → tarih gelince otomatik işlem oluşuyor mu?
✓ Excel import: test dosyası ile import başarılı mı?
✓ OCR: fatura fotoğrafı yükle → parse sonuçları mantıklı mı?
✓ Fiş fotoğrafı: upload → görüntüleme çalışıyor mu?
✓ Arşiv: arşivle → arşivden çıkar döngüsü çalışıyor mu?
✓ Notlar: entity'ye not ekle/sil/güncelle çalışıyor mu?
✓ TÜM bu özellikler mobil'deki verilerle uyumlu mu?
✓ defterappv2/ dizininde HİÇBİR değişiklik yok mu?
```

---

## Faz 4: Cilalama + Deployment (10-15 gün)

### 4.1 Responsive Tasarım (3 gün)

- **Sidebar:** Desktop (256px sabit) → Tablet (64px icon-only, hover ile genişle) → Mobil (Sheet/Drawer)
- **Data table'lar:** Dar ekranda yatay scroll veya card view'a geç
- **Formlar:** Tek kolon layout (mobil) → İki kolon (desktop)
- **Dashboard:** KPI grid 3x2 → 2x3 → 1x6 (ekran daralınca)
- Tailwind breakpoint'leri: `sm:640px`, `md:768px`, `lg:1024px`, `xl:1280px`

### 4.2 Loading & Error States (2 gün)

- **Skeleton loader'lar:** Her tablo ve kart için shimmer efektli skeleton
- **Error boundary:** Sayfa bazlı error boundary (`error.tsx` dosyaları)
- **Boş durumlar:** Her liste için "Henüz X eklenmemiş" + CTA butonu illüstrasyonu
- **Toast bildirimleri:** Başarılı CRUD işlemleri için toast (shadcn/ui toast)
- **Loading overlay:** Form submit sırasında buton disabled + spinner

### 4.3 Performance (2 gün)

- **Route-based code splitting:** Next.js App Router otomatik yapıyor
- **Image optimization:** `next/image` ile lazy loading
- **Prefetching:** Sidebar linkleri için `<Link prefetch>` 
- **Query prefetching:** Dashboard'da diğer modüllerin ilk sayfasını prefetch
- **Bundle analizi:** `@next/bundle-analyzer` ile büyük paketleri tespit

### 4.4 SEO (Landing Page için) (2 gün)

- `generateMetadata()` ile sayfa başlıkları ve açıklamaları
- Open Graph meta tag'leri (sosyal medya paylaşımı)
- `robots.txt` ve `sitemap.xml`
- Structured data (JSON-LD: SoftwareApplication schema)
- `/(dashboard)` route'ları `noindex` (uygulama içi, SEO gereksiz)

### 4.5 Deployment (3 gün)

**Vercel deployment:**
1. GitHub repo'yu Vercel'e bağla
2. Environment variables ekle (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, vb.)
3. Domain bağla (isletmetakip.com veya seçilen domain)
4. Production deploy

**Supabase güncellemeleri:**
1. Site URL'i production domain ile güncelle
2. Redirect URL'leri ekle: `https://domain.com/auth/callback`
3. Google OAuth redirect URI güncelle

**DNS ayarları:**
1. Domain sağlayıcıda Vercel DNS'e yönlendir
2. SSL otomatik (Vercel hallediyor)

### 4.6 Supabase Realtime (opsiyonel, 2 gün)

- İşlem tablosundaki değişiklikleri dinle
- Başka kullanıcı (veya mobil app) işlem eklediğinde otomatik refetch
- `supabase.channel('islemler').on('postgres_changes', { event: '*', schema: 'public', table: 'islemler' }, () => queryClient.invalidateQueries(...))`

### 4.7 Final Doğrulama

```
✓ Responsive: mobil, tablet, desktop'ta düzgün görünüyor mu?
✓ Loading: skeleton'lar ve error state'ler çalışıyor mu?
✓ SEO: landing page Google'da düzgün indexleniyor mu?
✓ Performance: Lighthouse skoru 90+ mı?
✓ Deploy: production URL çalışıyor mu?
✓ SSL: HTTPS aktif mi?
✓ Auth: production'da login/register çalışıyor mu?
✓ Mobil uygulama hala sorunsuz çalışıyor mu?
✓ Aynı kullanıcı hem mobil hem web'den giriş yapabiliyor mu?
✓ defterappv2/ dizininde HİÇBİR değişiklik yok mu?
```

---

## Paylaşılan Kod Stratejisi (Detaylı)

### Birebir kopyalanacak dosyalar (17 dosya + 34 JSON)

| Kaynak (defterappv2/src/) | Import sayısı | Bağımlılık |
|---|---|---|
| `types/database.ts` | 117 dosya | Saf TS, bağımlılık yok |
| `types/multiUser.ts` | - | Saf TS |
| `types/cariSharing.ts` | - | Saf TS |
| `types/ocrImport.ts` | - | Saf TS |
| `constants/islemTypes.ts` | 15 dosya | Saf TS |
| `constants/currencies.ts` | 16 dosya | Saf TS |
| `constants/categoryIcons.ts` | - | Saf TS (icon string ID'leri) |
| `constants/colors.ts` | - | Saf TS |
| `lib/queryKeys.ts` | 20 dosya | @tanstack/react-query |
| `lib/transactionGrouping.ts` | - | Saf TS |
| `lib/transactionColors.ts` | - | Saf TS |
| `lib/cariTransactionMapper.ts` | - | Saf TS |
| `lib/fuzzyMatch.ts` | - | Saf TS |
| `lib/errors.ts` | - | Saf TS |
| `lib/schemas/paymentForm.ts` | - | zod + currency.ts |
| `i18n/locales/tr/*.json` | - | 17 JSON dosyası |
| `i18n/locales/en/*.json` | - | 17 JSON dosyası |

### Kopyalanıp refactor edilecek dosyalar (3 dosya)

| Dosya | Sorun | Değişiklik |
|---|---|---|
| `lib/currency.ts` (91 import) | `getCurrentCurrency()` → useSettings hook'a bağımlı | `formatCurrency(amount, currency)` şeklinde parametre ekle. ~%70'i zaten saf |
| `lib/date.ts` (51 import) | `getCurrentDateFormat()` → useSettings hook'a bağımlı | `getLocale(dateFormat?)` şeklinde parametre ekle. ~%95'i zaten saf |
| `types/analytics.ts` | `import React` (sadece ComponentType için) | `import type { ComponentType } from 'react'` olarak değiştir |

### Web'de yeniden yazılacak (referans alınarak)

| Dosya | Referans | Neden yeniden |
|---|---|---|
| `hooks/useAuth.ts` (950 satır) | defterappv2 useAuth.ts | Expo/RN spesifik: AppState, expo-apple-auth, google-signin, AsyncStorage |
| `hooks/useIslemler.ts` | defterappv2 useIslemler.ts | Supabase SSR client + bakiye mantığı aynı ama hook yapısı farklı |
| `hooks/useHesaplar.ts` | defterappv2 useHesaplar.ts | Query mantığı aynı, client farklı |
| `hooks/useCariler.ts` | defterappv2 useCariler.ts | Query mantığı aynı, client farklı |
| `hooks/usePersonel.ts` | defterappv2 usePersonel.ts | Query mantığı aynı, client farklı |
| `hooks/useKategoriler.ts` | defterappv2 useKategoriler.ts | Query mantığı aynı + buildCategoryTree |
| `hooks/useUrunler.ts` | defterappv2 useUrunler.ts | Query mantığı aynı, client farklı |
| `contexts/AuthContext.tsx` | defterappv2 AuthContext.tsx | Aynı interface, farklı implementation |
| `lib/supabase/*` | defterappv2 supabase.ts | @supabase/ssr cookie tabanlı (yeni) |
| Tüm `components/*` | defterappv2 components/ | React Native → React/shadcn tamamen yeniden |

---

## Kritik Referans Dosyalar (defterappv2/src/)

Implementasyon sırasında bu dosyalar okunacak ama DEĞİŞTİRİLMEYECEK:

| # | Dosya | Neden Kritik |
|---|---|---|
| 1 | `types/database.ts` | Tüm tablo tipleri, Insert/Update varyantları |
| 2 | `hooks/useIslemler.ts` | updateBalances/reverseBalances mantığı (satır 265-435) |
| 3 | `hooks/useAuth.ts` | fetchOrCreateIsletme mantığı (satır 118-224), auth state interface |
| 4 | `hooks/useCariler.ts` | Cari CRUD + balance summary query |
| 5 | `hooks/useHesaplar.ts` | Hesap CRUD + transfer query (bidirectional) |
| 6 | `hooks/useKategoriler.ts` | buildCategoryTree + flattenCategoryTree |
| 7 | `hooks/useMultiUser.ts` | Davet sistemi RPC çağrıları |
| 8 | `hooks/useSettings.ts` | getCurrentCurrency/getCurrentDateFormat (refactor referansı) |
| 9 | `lib/currency.ts` | formatCurrency, parseCurrency, getBalanceInfo |
| 10 | `lib/queryKeys.ts` | Query key factory + invalidation map |
| 11 | `lib/schemas/paymentForm.ts` | Tüm form validation şemaları |
| 12 | `constants/islemTypes.ts` | İşlem tipi sınıflandırma fonksiyonları |
| 13 | `lib/excelImport.ts` | Excel import parse mantığı |
| 14 | `lib/excelExport.ts` | Excel export format mantığı |

---

## Genel Doğrulama Kuralı

**Her faz sonunda ve her önemli değişiklikten sonra:**
1. `defterappv2/` dizininde `git status` çalıştır → HİÇBİR değişiklik olmamalı
2. Mobil uygulama ayrı dizinde, bağımsız, dokunulmamış durumda kalmalı
3. Web projesinde `npm run build` başarılı olmalı
4. Web projesinde `npm run dev` ile localhost:3000 çalışmalı

---

## Tahmini Süre

| Faz | Süre | Detay |
|---|---|---|
| Faz 0: Proje Kurulumu | 3-4 gün | Next.js + shared kod kopyalama + Supabase SSR |
| Faz 1: Auth + Layout + Landing | 5-7 gün | Login/Register, OAuth, Sidebar, Landing page |
| Faz 2: Core Modüller (CRUD) | 25-30 gün | Ortak bileşenler + Dashboard + 8 modül + Arama + Onboarding + Toplu işlemler |
| Faz 3: Gelişmiş Özellikler | 15-20 gün | Çekler, Nakit Avans, İleri Tarihli, Excel/OCR Import, Fotoğraf, Arşiv, Notlar |
| Faz 4: Cilalama + Deploy | 10-15 gün | Responsive, Loading states, SEO, Performance, Vercel deploy |
| **Toplam** | **58-76 iş günü (~12-15 hafta)** | Claude Code büyük kısmını yapacak |

---

## Mobil → Web UI Dönüşüm Kuralları

| Mobil Pattern | Web Karşılığı |
|---|---|
| BottomSheet / ActionSheet | shadcn/ui Sheet (side panel) veya Dialog |
| Swipeable Row (kaydırarak sil) | Satır sonu aksiyon menüsü (DropdownMenu) |
| Pull-to-refresh | Refetch butonu veya otomatik (refetchOnWindowFocus) |
| FAB (Floating Action Button) | Sayfa başlığındaki "Yeni Ekle" butonu |
| Haptics (titreşim) | Yok (web'de karşılığı yok) |
| Push notifications (Expo) | Browser Notification API (izin gerekli) veya sonraya bırak |
| AsyncStorage | localStorage |
| expo-image-picker (kamera) | `<input type="file">` + drag & drop |
| Tab navigation (alt bar) | Sidebar navigation (sol panel) |
| Stack navigation (geri ok) | Breadcrumb + browser back button |
| Animated collapsible header | Sabit topbar (scroll ile gizleme gereksiz) |
| Platform.OS kontrolü | Yok (sadece web) |

## Bildirimler / Notifications Stratejisi

**Mobil'de mevcut:**
- Push notifications (Expo Notifications)
- Local scheduled notifications (hatırlatıcılar)
- Notification channels (Android)
- Push token Supabase'de saklanır

**Web'de yaklaşım (Faz 4'te):**
- Browser Notification API ile bildirim gösterme (kullanıcı izni gerekli)
- `notify-linked-users` edge function zaten var, web push token desteği eklenebilir
- İlk aşamada bildirim yok, in-app toast ile yetinilecek
- İleride: Service Worker + Web Push API entegrasyonu

## Döviz Kurları / Exchange Rates

**Mobil'de mevcut:** `useExchangeRates` hook → `exchange_rates` tablosundan günlük kurlar
**Web'de:** Aynı hook yeniden yazılacak, aynı tablo kullanılacak
- `fetch-exchange-rates` edge function zaten günlük çalışıyor (cron)
- Dashboard'da veya transfer formunda döviz kuru gösterimi
- Hesap bakiyelerinin TRY karşılığı hesaplanması

## OCR Kullanım Limiti

**Mobil'de mevcut:** `useRemainingUsage` hook → günlük 20 OCR limiti
**Web'de:** Aynı RPC fonksiyonu (`get_remaining_usage`) kullanılacak
- OCR import sayfasında kalan kullanım hakkı gösterilecek
- Limit dolunca uyarı mesajı

---

## Monorepo'ya Geçiş (İleride - Bu Planın Kapsamı DIŞINDA)

Hem web hem mobil stabil olduktan sonra:
1. Yeni repo: `isletmetakip-monorepo` (Turborepo)
2. `apps/mobile/` ← defterappv2'yi taşı
3. `apps/web/` ← isletmetakip-web'i taşı
4. `packages/shared-*` ← kopyalanan ortak kodu extract et
5. Her iki app'in import'larını workspace paketlerine çevir

Bu adım opsiyonel ve ancak her iki uygulama da production'da stabil çalıştıktan sonra yapılacak.
