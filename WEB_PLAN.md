# İşletme Takip - Web Uygulaması Geliştirme Planı

> **Bu dosya nedir?** Mevcut Expo/React Native mobil uygulamanın (İşletme Takip / Defter App) web versiyonunu oluşturmak için kapsamlı bir implementasyon planıdır. Yeni bir Claude session'ında bu dosyayı vererek çalışmaya başlayabilirsiniz.

---

## 🔴 KRİTİK KURALLAR (HER ZAMAN UYMAK ZORUNLU)

1. **`defterappv2/` dizinine HİÇBİR ŞEKİLDE dokunma.** Mevcut iOS (App Store'da yayında) ve Android (teste yakın) uygulamaları KESİNLİKLE bozulmamalı.
2. **Web projesi ayrı bir dizinde olacak:** `c:\Users\ozada\apps\isletmetakip\isletmetakip-web\`
3. **Paylaşılan kod KOPYALANARAK alınacak**, referans veya symlink değil.
4. **Aynı Supabase projesi** kullanılacak (aynı DB, aynı RLS, aynı auth.users).
5. Her faz sonunda `defterappv2/` dizininde `git status` ile değişiklik olmadığını doğrula.

---

## İLERLEME TAKİBİ

| Adım | Durum | Not |
|------|-------|-----|
| Faz 0.1: Next.js projesi oluştur | ⬜ Başlanmadı | `isletmetakip-web/` |
| Faz 0.2: shadcn/ui + paketler kur | ⬜ Başlanmadı | |
| Faz 0.3: Shared kodu kopyala | ⬜ Başlanmadı | 17 dosya + 34 JSON |
| Faz 0.4: Supabase SSR konfigürasyonu | ⬜ Başlanmadı | client + server + middleware |
| Faz 0.5: i18n + tema + providers | ⬜ Başlanmadı | |
| Faz 1.1: Landing page | ⬜ Başlanmadı | |
| Faz 1.2: Auth (email + Google + Apple) | ⬜ Başlanmadı | |
| Faz 1.3: Dashboard layout (sidebar + topbar) | ⬜ Başlanmadı | |
| Faz 2.0: Ortak bileşenler | ⬜ Başlanmadı | DataTable, Form, UndoToast vs |
| Faz 2.1: Dashboard | ⬜ Başlanmadı | KPI + grafikler |
| Faz 2.2: Hesaplar | ⬜ Başlanmadı | |
| Faz 2.3: İşlemler | ⬜ Başlanmadı | EN KARMAŞIK |
| Faz 2.4: Cariler | ⬜ Başlanmadı | |
| Faz 2.5: Personel | ⬜ Başlanmadı | + toplu gider/ödeme |
| Faz 2.6: Kategoriler | ⬜ Başlanmadı | |
| Faz 2.7: Ürünler | ⬜ Başlanmadı | + toplu giriş/çıkış |
| Faz 2.8: Raporlar | ⬜ Başlanmadı | |
| Faz 2.9: Ayarlar | ⬜ Başlanmadı | + multi-user + audit log |
| Faz 2.10: Global arama + Onboarding | ⬜ Başlanmadı | |
| Faz 3: Gelişmiş özellikler | ⬜ Başlanmadı | Çekler, nakit avans, OCR vs |
| Faz 4: Cilalama + Deploy | ⬜ Başlanmadı | Responsive, SEO, Vercel |

> **Durum kodları:** ⬜ Başlanmadı | 🔄 Devam ediyor | ✅ Tamamlandı

---

## PROJE BAĞLAMI

**Ne yapıyoruz?** İşletme Takip (Defter App) mobil uygulamasının web versiyonunu oluşturuyoruz.

**Neden?** Kullanıcılar masaüstünden de erişmek istiyor. Aynı Supabase backend'i paylaşarak mobil ve web'den aynı verilere ulaşılacak.

**Mobil uygulama nerede?**
- Repo: `c:\Users\ozada\apps\isletmetakip\defterappv2\`
- GitHub: `https://github.com/ozadaliomerfaruk/isletme-takip.git`
- Branch: `master`
- Tech: Expo 54 + React Native 0.81.5 + React 19.1

**Web projesi nerede olacak?**
- Dizin: `c:\Users\ozada\apps\isletmetakip\isletmetakip-web\`
- Ayrı git repo olacak

---

## TECH STACK

| Katman | Teknoloji | Not |
|--------|-----------|-----|
| Framework | Next.js 15 (App Router) | Turbopack dev server |
| UI | shadcn/ui + Tailwind CSS 4 | Mobil renk paleti korunacak |
| State | TanStack Query v5 | Mobil ile aynı staleTime/gcTime |
| Tablolar | TanStack Table v8 | Server-side pagination |
| Formlar | react-hook-form + zod | Shared şemalar kopyalanacak |
| Grafikler | recharts | Mobil'deki gifted-charts yerine |
| Auth | Supabase SSR (@supabase/ssr) | Cookie tabanlı session |
| i18n | next-intl | Mobil'deki i18next yerine |
| İkonlar | lucide-react | Mobil ile aynı |
| Excel | xlsx-js-style | Mobil ile aynı |

---

## SUPABASE BACKEND REFERANSı

### Tablolar (27 adet)

| Tablo | Açıklama | Ana Alanlar |
|-------|----------|-------------|
| `isletmeler` | İşletmeler | id, user_id, name, phone, address, tax_number, scheduled_deletion_at |
| `hesaplar` | Hesaplar | id, isletme_id, name, type, currency, balance, initial_balance, credit_limit, is_archived |
| `islemler` | İşlemler (ana) | id, isletme_id, type, amount, description, date, hesap_id, hedef_hesap_id, kategori_id, cari_id, personel_id, exchange_rate, photo_path |
| `kategoriler` | Kategoriler | id, isletme_id, name, type, icon, color, parent_id |
| `cariler` | Müşteri/Tedarikçi | id, isletme_id, name, type, phone, email, balance, currency, is_archived |
| `personel` | Personel | id, isletme_id, first_name, last_name, position, salary, balance, currency, start_date |
| `urunler` | Ürünler | id, isletme_id, name, code, unit, quantity, purchase_price, sale_price, category_id |
| `urun_hareketler` | Stok hareketleri | id, urun_id, hareket_tipi (giris/cikis/duzeltme), miktar, birim_fiyat |
| `cekler` | Çekler | id, isletme_id, amount, vade_tarihi, alici, banka, cek_no, durum |
| `nakit_avanslar` | Nakit avanslar | id, hesap_id, tutar, taksit_sayisi |
| `nakit_avans_taksitler` | Taksitler | id, nakit_avans_id, tutar, odendi |
| `ileri_tarihli_islemler` | Planlı işlemler | id, isletme_id, scheduled_date, status (pending/completed/cancelled) |
| `notlar` | Notlar | id, entity_type, entity_id, content |
| `isletme_users` | Çoklu kullanıcı | id, isletme_id, user_id, role, permissions |
| `isletme_invites` | Davetiyeler | id, isletme_id, invite_code, role |
| `profiles` | Kullanıcı profilleri | id, email, full_name |
| `exchange_rates` | Döviz kurları | id, date, currency, rate |
| `islem_audit_log` | İşlem geçmişi | id, islem_id, action, old_values, new_values |
| `push_tokens` | Bildirim token'ları | id, user_id, token |
| `pending_islemler` | Bekleyen işlemler | |
| `cari_aliases` | Cari takma adları | |
| `cari_links` | Cari paylaşım linkleri | |
| `urun_aliases` | Ürün takma adları | |
| `irsaliye_records` | İrsaliye kayıtları | |
| `role_templates` | Rol şablonları | |
| `app_sessions` | Uygulama oturumları | |

### RPC Fonksiyonları (15 adet)

| Fonksiyon | Açıklama | Çağrıldığı hook |
|-----------|----------|-----------------|
| `increment_balance` | Hesap/cari/personel bakiye güncelle | useIslemler, useCekler |
| `get_income_expense_summary` | Gelir/gider KPI özeti | useAnalyticsSummary |
| `get_category_report` | Kategori bazlı rapor | useCategoryReport |
| `get_product_report` | Ürün bazlı rapor | useProductReport |
| `get_remaining_usage` | OCR kullanım limiti (günlük 20) | useRemainingUsage |
| `create_isletme_invite` | İşletme davet kodu oluştur | useMultiUser |
| `accept_isletme_invite` | Davet kodunu kabul et | useMultiUser |
| `perform_nakit_avans` | Nakit avans oluştur | useNakitAvans |
| `perform_taksit_odeme` | Taksit ödemesi yap | useNakitAvans |
| `delete_nakit_avans_with_reversal` | Nakit avans sil + bakiye geri al | useNakitAvans |
| `generate_cari_share_code` | Cari paylaşım kodu oluştur | useCariSharing |
| `accept_cari_share_code` | Cari paylaşım kodunu kabul et | useCariSharing |
| `remove_cari_link` | Cari paylaşımını kaldır | useCariSharing |
| `update_urun_miktar` | Ürün miktarı güncelle | useIslemler |
| `undo_import_batch` | Import batch'ini geri al | useImportHistory |

### Edge Functions (7 adet)

| Fonksiyon | Tetiklenme | Açıklama |
|-----------|-----------|----------|
| `fetch-exchange-rates` | Günlük cron | USD, EUR, GBP, XAU, XAG kurlarını MetalpriceAPI'den çek |
| `process-scheduled-transactions` | Günlük cron | İleri tarihli işlemleri otomatik oluştur |
| `delete-scheduled-accounts` | Günlük cron | 7 günlük silme süresi geçen hesapları temizle |
| `notify-linked-users` | DB webhook (islemler INSERT) | Paylaşılan cari'ye işlem eklenince push bildirim gönder |
| `parse-invoice` | Manuel çağrı | Fatura fotoğrafını Google Gemini ile parse et (günlük 20 limit) |
| `app-config` | Uygulama açılışı | Remote config (telemetri ayarları) |
| `telemetry-ingest` | Manuel çağrı | Kullanım istatistikleri |

### Storage

- **Bucket:** `islem-photos` — İşlem fiş/fatura fotoğrafları
- **Format:** `{isletmeId}/{islemId}_{timestamp}.webp`
- **Signed URL:** 1 saat geçerlilik

### Tip Tanımları

```
HesapType: 'nakit' | 'banka' | 'kredi_karti' | 'birikim' | 'diger'
CariType: 'musteri' | 'tedarikci'
KategoriType: 'gelir' | 'gider' | 'urun'
Currency: 'TRY' | 'USD' | 'EUR' | 'GBP' | 'XAU' | 'XAG'
IslemType: 24 tip (gelir, gider, transfer, cari_alis, cari_satis, cari_odeme, cari_tahsilat, 
           cari_alis_iade, cari_satis_iade, personel_gider, personel_satis, personel_odeme, 
           personel_tahsilat, nakit_avans_taksit, personel_izin_hakki, personel_izin_kullanimi, 
           cek_odeme, cek_tahsilat, urun_alis, urun_satis, nakit_avans_geri_odeme, ...)
BirimType: 20+ birim (adet, kg, gr, lt, ml, m, m2, m3, ...)
UrunHareketTipi: 'giris' | 'cikis' | 'duzeltme'
KdvOrani: 0 | 1 | 10 | 20
```

---

## MOBİL UYGULAMA DOSYA HARİTASI

> Bu dosyalar web implementasyonu sırasında REFERANS olarak okunacak ama DEĞİŞTİRİLMEYECEK.
> Tüm yollar `c:\Users\ozada\apps\isletmetakip\defterappv2\src\` altındadır.

### Birebir Kopyalanacak Dosyalar (değişiklik gerekmez)

| Dosya | Satır | Açıklama | Bağımlılık |
|-------|-------|----------|------------|
| `types/database.ts` | 884 | Tüm DB tipleri, Insert/Update varyantları | Saf TS |
| `types/multiUser.ts` | - | Çoklu kullanıcı tipleri | Saf TS |
| `types/cariSharing.ts` | - | Cari paylaşım tipleri | Saf TS |
| `types/ocrImport.ts` | - | OCR import tipleri | Saf TS |
| `constants/islemTypes.ts` | - | İşlem tipi sınıflandırma fonksiyonları | Saf TS |
| `constants/currencies.ts` | - | Döviz tanımları | Saf TS |
| `constants/categoryIcons.ts` | - | Kategori ikon string ID'leri | Saf TS |
| `constants/colors.ts` | - | Renk paleti | Saf TS |
| `lib/queryKeys.ts` | 567 | Query key factory + invalidation haritası | @tanstack/react-query |
| `lib/transactionGrouping.ts` | - | İşlem gruplama | Saf TS |
| `lib/transactionColors.ts` | - | İşlem renk kodları | Saf TS |
| `lib/cariTransactionMapper.ts` | - | Cari işlem dönüşümü | Saf TS |
| `lib/fuzzyMatch.ts` | - | Türkçe fuzzy arama | Saf TS |
| `lib/errors.ts` | - | Hata tipleri | Saf TS |
| `lib/schemas/paymentForm.ts` | - | Zod validation şemaları | zod + currency.ts |
| `i18n/locales/tr/*.json` | 17 dosya | Türkçe çeviriler | JSON |
| `i18n/locales/en/*.json` | 17 dosya | İngilizce çeviriler | JSON |

### Kopyalanıp Refactor Edilecek Dosyalar

| Dosya | Sorun | Çözüm |
|-------|-------|-------|
| `lib/currency.ts` | `getCurrentCurrency()` → useSettings hook'a bağımlı | Tüm fonksiyonlara `currency` parametresi ekle. ~%70'i zaten saf |
| `lib/date.ts` | `getCurrentDateFormat()` → useSettings hook'a bağımlı | `getLocale(dateFormat?)` parametresi ekle. ~%95'i zaten saf |
| `types/analytics.ts` | `import React` var | `import type { ComponentType } from 'react'` olarak değiştir |

### Kritik Referans Dosyaları (OKU ama DEĞİŞTİRME)

| Dosya | Satır | Neden Kritik |
|-------|-------|-------------|
| `hooks/useIslemler.ts` | ~800 | **updateBalances/reverseBalances** mantığı (satır 265-435). İşlem CRUD + bakiye güncelleme |
| `hooks/useAuth.ts` | 950 | **fetchOrCreateIsletme** (satır 118-224). Auth state, Apple/Google sign-in, multi-user |
| `hooks/useCariler.ts` | - | Cari CRUD + balance summary query |
| `hooks/useHesaplar.ts` | - | Hesap CRUD + transfer query (bidirectional) |
| `hooks/useKategoriler.ts` | - | buildCategoryTree + flattenCategoryTree |
| `hooks/usePersonel.ts` | - | Personel CRUD + izin takibi |
| `hooks/useMultiUser.ts` | - | Davet sistemi RPC çağrıları, yetki yönetimi |
| `hooks/useSettings.ts` | 257 | getCurrentCurrency/getCurrentDateFormat, AsyncStorage'da saklanır |
| `hooks/useCekler.ts` | - | Çek CRUD + durum geçişleri |
| `hooks/useNakitAvans.ts` | - | Nakit avans + taksit RPC'leri |
| `hooks/useUrunler.ts` | - | Ürün CRUD |
| `hooks/useUrunHareketler.ts` | - | Stok giriş/çıkış/düzeltme |
| `hooks/useDataImport.ts` | - | Excel import parse mantığı |
| `hooks/useAuditLog.ts` | - | Silinen/düzenlenen işlemler query'si |
| `lib/excelImport.ts` | - | Excel parse mantığı (web'de de çalışır) |
| `lib/excelExport.ts` | - | Excel export format mantığı |
| `lib/supabase.ts` | 44 | Mevcut Supabase client konfigürasyonu |

### Tüm Hook Dosyaları (48 adet)

```
useAuth.ts, useSettings.ts, useIsletme.ts, useHesaplar.ts, useCariler.ts,
usePersonel.ts, useKategoriler.ts, useIslemler.ts, useUrunler.ts, useUrunHareketler.ts,
useCekler.ts, useNakitAvans.ts, useIleriTarihliIslemler.ts, useNotlar.ts,
useMultiUser.ts, useCariSharing.ts, usePagePermission.ts, usePermissions.ts,
useAnalyticsSummary.ts, useAnalyticsTrend.ts, useCategoryReport.ts,
useCashFlowByCategory.ts, useFinancialSummary.ts, useProductReport.ts,
useDataImport.ts, useExcelExport.ts, useReportExcelExport.ts, useUrunExcelExport.ts,
useOcrImport.ts, useRemainingUsage.ts, useExchangeRates.ts, useAuditLog.ts,
useDateFormat.ts, useHaptics.ts, useUndoDelete.ts, useReportPeriod.ts,
useReportRouteState.ts, useIsletmePhoto.ts, useCariAliases.ts, useUrunAliases.ts,
useIrsaliyeRecords.ts, usePersonelLeaveQuotas.ts, useImportHistory.ts, ...
```

### i18n Namespace'leri (17 adet)

```
accounts.json, analytics.json, app.json, auth.json, categories.json, 
checks.json, clients.json, common.json, errors.json, legal.json, 
multiUser.json, navigation.json, ocrImport.json, products.json, 
reports.json, settings.json, staff.json, transactions.json
```

---

## ENVIRONMENT VARIABLES

### Mobil (.env.example)
```
EXPO_PUBLIC_SUPABASE_URL=...
EXPO_PUBLIC_SUPABASE_ANON_KEY=...
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=...
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=...
EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=...
```

### Web (.env.local) — aynı Supabase projesi
```
NEXT_PUBLIC_SUPABASE_URL=<EXPO_PUBLIC_SUPABASE_URL ile aynı değer>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<EXPO_PUBLIC_SUPABASE_ANON_KEY ile aynı değer>
NEXT_PUBLIC_GOOGLE_CLIENT_ID=<EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ile aynı değer>
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

> **Değerleri nereden alacaksın?** `defterappv2/.env` dosyasından oku (git'te yok, lokalde var).

---

## FAZ 0: PROJE KURULUMU (3-4 gün)

### 0.1 Proje Oluştur

```bash
cd c:\Users\ozada\apps\isletmetakip\
npx create-next-app@latest isletmetakip-web --typescript --tailwind --app --src-dir --turbopack
cd isletmetakip-web
```

### 0.2 shadcn/ui + Paketler

```bash
npx shadcn@latest init
npx shadcn@latest add button input form table card dialog dropdown-menu sheet tabs badge separator avatar skeleton toast select checkbox radio-group switch label textarea popover calendar command alert-dialog tooltip scroll-area

npm install @supabase/supabase-js @supabase/ssr
npm install @tanstack/react-query @tanstack/react-table
npm install react-hook-form zod @hookform/resolvers
npm install recharts lucide-react next-intl
npm install xlsx xlsx-js-style
```

### 0.3 Dizin Yapısı

```
isletmetakip-web/
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── globals.css
│   │   ├── (public)/              ← Landing + auth sayfaları
│   │   ├── auth/callback/route.ts ← OAuth callback
│   │   └── (dashboard)/           ← Authenticated sayfalar
│   ├── components/
│   │   ├── layout/                ← Sidebar, Topbar
│   │   ├── shared/                ← DataTable, Form bileşenleri
│   │   ├── dashboard/
│   │   ├── hesaplar/
│   │   ├── islemler/
│   │   ├── cariler/
│   │   ├── personel/
│   │   ├── kategoriler/
│   │   ├── urunler/
│   │   ├── raporlar/
│   │   ├── ayarlar/
│   │   ├── cekler/
│   │   └── onboarding/
│   ├── hooks/                     ← Web-spesifik hook'lar
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts          ← createBrowserClient
│   │   │   ├── server.ts          ← createServerClient
│   │   │   └── middleware.ts      ← Auth helper
│   │   ├── currency.ts            ← Refactor edilmiş kopya
│   │   ├── date.ts                ← Refactor edilmiş kopya
│   │   ├── queryKeys.ts           ← Birebir kopya
│   │   └── schemas/
│   ├── types/                     ← Birebir kopya
│   ├── constants/                 ← Birebir kopya
│   ├── i18n/
│   │   ├── index.ts               ← next-intl config
│   │   └── locales/               ← Birebir kopya
│   ├── contexts/
│   │   └── AuthContext.tsx        ← Web-spesifik
│   └── providers/
│       ├── query-provider.tsx
│       ├── auth-provider.tsx
│       └── i18n-provider.tsx
├── middleware.ts                   ← Next.js auth middleware
├── .env.local
└── package.json
```

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
- Her istekte auth token yenile
- `/(dashboard)/*` → giriş yapmamışsa `/giris`'e yönlendir
- `/giris`, `/kayit` → giriş yapmışsa `/(dashboard)`'a yönlendir

### 0.5 TanStack Query Provider

```typescript
// src/providers/query-provider.tsx
'use client'
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,     // 5 dk (mobil ile aynı)
      gcTime: 15 * 60 * 1000,        // 15 dk
      refetchOnWindowFocus: true,
    },
  },
})
```

### 0.6 shadcn/ui Tema

Mobil `colors.ts`'den CSS variables:
```css
:root {
  --primary: 163 74% 21%;         /* #0D5C4D (ana yeşil) */
  --primary-foreground: 0 0% 100%;
  --background: 0 0% 96%;         /* #F5F5F5 */
  --card: 0 0% 100%;
  --destructive: 0 84% 60%;       /* #EF4444 */
  --success: 160 84% 39%;         /* #10B981 */
  --border: 220 13% 91%;          /* #E5E7EB */
}
```

### 0.7 i18n (next-intl)

- 17 namespace JSON dosyası `defterappv2/src/i18n/locales/` altından kopyala
- URL prefix yok (auth arkasında, SEO önemsiz)
- Varsayılan dil: Türkçe
- Cookie ile dil tercihi sakla

### 0.8 Supabase Dashboard Ayarları

1. Authentication > URL Configuration > **Redirect URLs** ekle:
   - `http://localhost:3000/auth/callback`
   - `https://PRODUCTION_DOMAIN/auth/callback`
2. Authentication > Providers > **Google**: Web redirect URI ekle
3. Authentication > Providers > **Apple**: Web Services ID + domain doğrulama ekle

---

## FAZ 1: AUTH + LAYOUT + LANDING PAGE (5-7 gün)

### 1.1 Route Yapısı

```
src/app/
├── (public)/
│   ├── layout.tsx                  ← Navbar + Footer
│   ├── page.tsx                    ← Landing page
│   ├── giris/page.tsx              ← Login
│   ├── kayit/page.tsx              ← Register
│   ├── sifremi-unuttum/page.tsx
│   ├── gizlilik-politikasi/page.tsx
│   ├── kullanim-kosullari/page.tsx
│   └── kvkk/page.tsx
├── auth/callback/route.ts          ← OAuth callback (Google + Apple)
└── (dashboard)/
    ├── layout.tsx                  ← Sidebar + Topbar
    └── ...
```

### 1.2 Auth Implementasyonu

**Login:** Email/şifre + Google + Apple Sign-In
**Register:** Email + şifre + işletme adı
**OAuth callback:** `code` → `exchangeCodeForSession()` → dashboard'a yönlendir

**Google Sign-In (Web):**
- `supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: '/auth/callback' } })`

**Apple Sign-In (Web):**
- `supabase.auth.signInWithOAuth({ provider: 'apple', options: { redirectTo: '/auth/callback' } })`
- Apple Developer'da Web Services ID gerekli
- Domain doğrulama gerekli (verification file hosting)

**Auth hook** — Mobil `useAuth.ts`'den (950 satır) web versiyonu:

Korunacak mantık:
- `fetchOrCreateIsletme`: Race condition korumalı (pendingRequests Map + lock)
- `signIn/signUp/signOut`
- `deleteAccount/cancelAccountDeletion` (7 gün bekleme)
- `switchToSharedIsletme/switchToOwnIsletme`
- `refreshPermissions`

Kaldırılacak/değiştirilecek:
- `AppState` listener → `document.visibilitychange`
- `expo-apple-authentication` → Supabase OAuth redirect
- `@react-native-google-signin/google-signin` → Supabase OAuth redirect
- AsyncStorage → cookie tabanlı (@supabase/ssr otomatik)
- Token refresh timer → middleware otomatik

**AuthContext interface:**
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
  signIn, signUp, signOut, signInWithGoogle, signInWithApple
  deleteAccount, cancelAccountDeletion, changePassword
  switchToSharedIsletme, switchToOwnIsletme
  refreshPermissions, refreshIsletme
}
```

### 1.3 Dashboard Layout

**Sidebar:** Logo + 9 navigasyon linki (Dashboard, Hesaplar, İşlemler, Cariler, Personel, Kategoriler, Ürünler, Raporlar, Ayarlar)
- Desktop: 256px sabit
- Tablet: 64px icon-only, hover ile genişle
- Mobil: Sheet/Drawer

**Topbar:** Hamburger (mobil) + breadcrumb (desktop) | Dil (TR/EN) + kullanıcı menü

---

## FAZ 2: CORE MODÜLLER (25-30 gün)

### Ortak Pattern'ler

**Data Table** (`src/components/ui/data-table.tsx`):
- TanStack Table v8 + server-side pagination (Supabase `.range()`)
- Kolon sıralama, arama (`.ilike()`), filtre chips
- Satır aksiyon menüsü (düzenle, sil)
- Sayfa başına 25 satır

**Hook pattern'i:**
```
useXxx(filters?) → useQuery ile liste
useXxxById(id)   → useQuery ile tekil
useCreateXxx()   → useMutation + cache invalidation
useUpdateXxx()   → useMutation + cache invalidation
useDeleteXxx()   → useMutation + ilişkili kayıt kontrolü
```

**Soft Delete / Undo:**
- Silmede 5 sn "Geri Al" toast
- 5 sn sonra kalıcı sil
- shadcn/ui toast ile

### 2.0 Ortak Bileşenler (2 gün)

```
src/components/shared/
├── UndoToast.tsx
├── DeleteConfirmDialog.tsx
├── EntityCombobox.tsx         ← Hesap/Cari/Personel/Kategori arama + seçim
├── AmountInput.tsx            ← Türk formatı: 1.234,56
├── CurrencySelect.tsx         ← TRY, USD, EUR, GBP, XAU, XAG
├── DateRangePicker.tsx
├── ExchangeRateInput.tsx
├── EmptyState.tsx
└── PageHeader.tsx
```

### 2.1 Dashboard (4 gün)

6 KPI kartı: Toplam Bakiye, Gelir, Gider, Net Kar, Alacak, Borç
+ Hesap bakiyeleri özeti + Gelir/gider trend chart (recharts) + Kategori donut chart + Nakit akışı + Son 10 işlem + Hızlı işlem butonları

### 2.2 Hesaplar (3 gün)

CRUD + detay (hesaba ait işlemler tablosu)
Tablo: Ad | Tip | Döviz | Bakiye | Kredi Limiti | Durum

### 2.3 İşlemler (7 gün) — EN KARMAŞIK

19 işlem tipi, her tipin farklı form alanları var.
Bakiye güncelleme: `supabase.rpc('increment_balance')` — oluştur/sil/güncelle'de.

| Tip | Hesap | Hedef Hesap | Kategori | Cari | Personel |
|-----|-------|-------------|----------|------|----------|
| gelir/gider | ✓ | - | ✓ | - | - |
| transfer | ✓ | ✓ | - | - | - |
| cari_alis/satis | - | - | ✓ | ✓ | - |
| cari_odeme/tahsilat | ✓ | - | - | ✓ | - |
| personel_gider/odeme | ✓/- | - | ✓/- | - | ✓ |
| ... | | | | | |

### 2.4 Cariler (3 gün)

CRUD + bakiye özeti + işlemler
Bakiye > 0 = "Size borçlu" (yeşil), < 0 = "Borcunuz var" (kırmızı)

### 2.5 Personel (3 gün)

CRUD + izin takibi + toplu maaş gideri + toplu maaş ödemesi
İzin kartı: hak edilen - kullanılan = kalan

### 2.6 Kategoriler (2 gün)

Ağaç görünümü (parent-child), 3 tip tab: gelir/gider/ürün, icon+renk seçici

### 2.7 Ürünler (3 gün)

CRUD + stok hareketleri (giriş/çıkış/düzeltme) + toplu stok giriş/çıkış

### 2.8 Raporlar (3 gün)

Genel özet, gelir/gider, cari, personel, karşılaştırma + Excel export

### 2.9 Ayarlar (3 gün)

İşletme bilgileri, dil/döviz/tarih formatı, kullanıcı yönetimi (davet + yetki grid), paylaşılan işletmeler, audit log, hesap silme, şifre değiştirme

### 2.10 Global Arama + Onboarding (1 gün)

Ctrl+K command palette + ilk girişte hoşgeldin dialogu

---

## FAZ 3: GELİŞMİŞ ÖZELLİKLER (15-20 gün)

- **Çekler** (3 gün): Liste + oluştur + durum değiştir (beklemede→ödendi/iptal)
- **Nakit Avans** (2 gün): Taksit planı + ödeme takibi
- **İleri Tarihli İşlemler** (2 gün): Planlanmış işlemler (edge function zaten var)
- **Excel Import** (3 gün): Drag & drop + kolon eşleme + önizleme + batch import
- **OCR Import** (3 gün): Fotoğraf yükle → parse-invoice edge function → işlem oluştur
- **Fiş Fotoğrafı** (2 gün): İşlem formuna drag & drop + Supabase Storage upload
- **Arşiv** (1 gün): Arşivlenmiş kayıtları görüntüle/geri yükle
- **Notlar** (1 gün): Entity'ye bağlı not sistemi

---

## FAZ 4: CİLALAMA + DEPLOYMENT (10-15 gün)

- **Responsive** (3 gün): Sidebar collapse, tablo scroll, form layout
- **Loading/Error** (2 gün): Skeleton loader, error boundary, boş durum ekranları
- **Performance** (2 gün): Bundle analizi, prefetching, image optimization
- **SEO** (2 gün): Landing page meta, Open Graph, sitemap, structured data
- **Vercel Deploy** (3 gün): GitHub → Vercel, env vars, domain, SSL
- **Realtime** (opsiyonel, 2 gün): İşlem değişikliklerini canlı dinle

---

## MOBİL → WEB UI DÖNÜŞÜM KURALLARI

| Mobil | Web |
|-------|-----|
| BottomSheet / ActionSheet | shadcn/ui Sheet veya Dialog |
| Swipeable Row (kaydır sil) | Satır aksiyon menüsü (DropdownMenu) |
| Pull-to-refresh | refetchOnWindowFocus + refetch butonu |
| FAB (yüzen buton) | Sayfa başlığındaki "Yeni Ekle" butonu |
| Haptics (titreşim) | Yok |
| Push notifications | Browser Notification API (sonraya) |
| AsyncStorage | localStorage |
| expo-image-picker | `<input type="file">` + drag & drop |
| Tab navigation (alt bar) | Sidebar (sol panel) |
| Stack navigation (geri ok) | Breadcrumb + browser back |
| Platform.OS kontrolü | Yok (sadece web) |

---

## MİMARİ KARARLAR VE GEREKÇELERİ

**Neden monorepo değil, ayrı proje?**
Mobil uygulama iOS'ta yayında ve Android teste yakın. Monorepo'ya taşıma riski çok yüksek — bir hata iOS/Android uygulamalarını bozabilir. Ayrı proje ile risk sıfır. İleride her ikisi de stabil olduğunda opsiyonel olarak monorepo'ya geçilebilir.

**Neden kod kopyalama?**
Symlink veya workspace reference kullanmak, mobil projenin build pipeline'ını etkileyebilir. Kopyalama en güvenli yol. Kopya dosyalar saf TypeScript olduğu için senkronizasyon sorunu minimal.

**Neden @supabase/ssr?**
Next.js App Router'da server component'ler ve middleware'de auth token yönetimi için gerekli. Cookie tabanlı session, mobil'deki AsyncStorage yerine geçer.

**Neden next-intl (i18next yerine)?**
Next.js App Router ile native entegrasyon, server component desteği, cookie tabanlı dil algılama.

---

## DOĞRULAMA KURALLARI

Her faz sonunda:
1. `defterappv2/` dizininde `git status` → HİÇBİR değişiklik yok
2. Web'de `npm run build` başarılı
3. Web'de `npm run dev` → localhost:3000 çalışıyor
4. Mobil'de oluşturulan veri web'de görünüyor
5. Web'de oluşturulan veri mobil'de görünüyor
6. Auth: mobil kullanıcı web'den giriş yapabiliyor

---

## TAHMİNİ SÜRE

| Faz | Süre |
|-----|------|
| Faz 0: Proje Kurulumu | 3-4 gün |
| Faz 1: Auth + Layout + Landing | 5-7 gün |
| Faz 2: Core Modüller | 25-30 gün |
| Faz 3: Gelişmiş Özellikler | 15-20 gün |
| Faz 4: Cilalama + Deploy | 10-15 gün |
| **Toplam** | **58-76 iş günü (~12-15 hafta)** |
