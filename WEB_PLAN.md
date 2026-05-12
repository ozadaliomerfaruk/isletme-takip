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
| Faz 4.1-4.3: Responsive + Loading + Performance | ⬜ Başlanmadı | Core Web Vitals 95+ |
| Faz 4.4: SEO + GEO | ⬜ Başlanmadı | llms.txt, structured data, sitemap |
| Faz 4.5: Güvenlik + Bot Koruması | ⬜ Başlanmadı | CSP, rate limit, Turnstile, honeypot |
| Faz 4.6: Monetizasyon Altyapısı | ⬜ Başlanmadı | Plan tanımları, feature gating |
| Faz 4.7-4.9: Deploy + Realtime + Final | ⬜ Başlanmadı | Vercel, Upstash, Cloudflare |

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
NEXT_PUBLIC_TURNSTILE_SITE_KEY=<Cloudflare Turnstile site key>
TURNSTILE_SECRET_KEY=<Cloudflare Turnstile secret key — server-only>
UPSTASH_REDIS_REST_URL=<Upstash Redis REST URL — rate limiting>
UPSTASH_REDIS_REST_TOKEN=<Upstash Redis REST token — rate limiting>
```

> **Değerleri nereden alacaksın?** Supabase key'leri: `defterappv2/.env` dosyasından oku (git'te yok, lokalde var). Turnstile: Cloudflare Dashboard → Turnstile. Upstash: Upstash Console → Redis.

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
npm install @upstash/ratelimit @upstash/redis
npm install @marsidev/react-turnstile
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
│   │   ├── schemas/
│   │   ├── security/
│   │   │   ├── rateLimiter.ts     ← Upstash rate limiting
│   │   │   ├── sanitize.ts        ← Input sanitization
│   │   │   └── turnstile.ts       ← Turnstile server-side verify
│   │   └── subscription/
│   │       ├── plans.ts           ← Plan tanımları (free/pro/business)
│   │       ├── features.ts        ← Feature gating
│   │       └── checkAccess.ts     ← Erişim kontrol fonksiyonu
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

## FAZ 2: TÜM CORE MODÜLLER - TEMEL CRUD (25-30 gün)

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
- Her satır için toplam hesabı (miktar x birim fiyat + KDV)
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
- shadcn/ui Command component'i (Ctrl+K kısayolu)

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

## FAZ 3: GELİŞMİŞ ÖZELLİKLER (15-20 gün)

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

### 3.7 Arşiv / Archive (1 gün)

**Route:** `src/app/(dashboard)/arsiv/page.tsx`

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

## FAZ 4: CİLALAMA + DEPLOYMENT (10-15 gün)

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
- **Image optimization:** `next/image` ile lazy loading (WebP/AVIF otomatik)
- **Prefetching:** Sidebar linkleri için `<Link prefetch>`
- **Query prefetching:** Dashboard'da diğer modüllerin ilk sayfasını prefetch
- **Bundle analizi:** `@next/bundle-analyzer` ile büyük paketleri tespit
- **Font optimizasyonu:** `next/font` ile Google Fonts (layout shift önleme)
- **Critical CSS:** Tailwind ile otomatik tree-shaking, kullanılmayan CSS yok
- **Edge Runtime:** Landing page ve auth callback route'ları Edge Runtime'da çalıştır (daha düşük latency)
- **Caching stratejisi:**
  - Static pages (landing, yasal sayfalar): ISR ile `revalidate: 3600` (1 saat)
  - Dashboard: client-side only (no SSR), TanStack Query cache
  - API route'lar: `Cache-Control: private, no-store` (kullanıcıya özel veri)
- **Core Web Vitals hedefleri:** LCP < 2.5s, FID < 100ms, CLS < 0.1
- **Lighthouse skoru hedefi:** 95+ (Performance, Accessibility, Best Practices, SEO)

### 4.4 SEO + GEO (Arama Motoru + AI Arama Optimizasyonu) (3 gün)

**Klasik SEO (Google, Bing, Yandex):**

Landing page ve public sayfalar için tam SEO desteği:

```
src/app/(public)/
├── layout.tsx                      ← Root metadata: title template, description, openGraph
├── page.tsx                        ← Landing page (h1, semantic HTML, structured data)
├── sitemap.ts                      ← Dynamic sitemap generation (next/sitemap)
├── robots.ts                       ← Dynamic robots.txt (next/robots)
├── opengraph-image.tsx             ← OG image generation (next/og, @vercel/og)
└── manifest.ts                     ← Web app manifest (PWA-ready)
```

- **Metadata API:** Her public sayfa için `generateMetadata()` ile dinamik title, description, canonical URL
- **Open Graph + Twitter Cards:** Sosyal medya paylaşımında zengin önizleme (resim, başlık, açıklama)
- **Structured Data (JSON-LD):**
  - `SoftwareApplication` schema (landing page): uygulama adı, kategori, rating, fiyat (Free)
  - `Organization` schema: işletme bilgileri
  - `FAQPage` schema: SSS sayfası (ileride eklenebilir)
  - `BreadcrumbList` schema: navigasyon breadcrumb'ları
- **Semantic HTML:** `<main>`, `<article>`, `<section>`, `<nav>`, `<header>`, `<footer>` tag'leri
- **Heading hiyerarşisi:** Her sayfada tek `<h1>`, düzgün `<h2>`→`<h3>` sıralaması
- **`robots.txt`:** `/(dashboard)/*` route'ları `Disallow` (uygulama içi sayfalar indexlenmemeli)
- **`sitemap.xml`:** Public sayfaları otomatik listele, lastmod ile güncelleme tarihi
- **Canonical URL'ler:** Duplicate content önleme
- **Hreflang tag'leri:** TR/EN dil alternatifleri (ileride farklı dil URL'leri eklenirse)
- **Image alt text'leri:** Tüm landing page görselleri için açıklayıcı alt text
- **Page speed:** Lighthouse SEO skoru 100 hedefi

**GEO — Generative Engine Optimization (AI Arama Motorları: ChatGPT, Gemini, Perplexity, Copilot):**

AI arama motorlarının siteyi doğru anlayıp önerme yapabilmesi için:

- **`llms.txt`** dosyası (`public/llms.txt`): Site hakkında AI'lar için özet bilgi
  ```
  # İşletme Takip (Defter App)
  > Küçük işletmeler için gelir/gider takibi, cari yönetimi, personel takibi, stok yönetimi ve raporlama uygulaması.
  
  ## Özellikler
  - Gelir/Gider Takibi (19 işlem tipi)
  - Cari Yönetimi (müşteri/tedarikçi)
  - Personel Yönetimi (maaş, izin, avans)
  - Stok/Ürün Yönetimi
  - Çoklu Döviz Desteği (TRY, USD, EUR, GBP, XAU, XAG)
  - Raporlar ve Analizler
  - Çoklu Kullanıcı ve Yetki Yönetimi
  - Fatura/Fiş OCR Tarama
  - iOS, Android ve Web desteği
  
  ## Linkler
  - Web: [site URL]
  - iOS: [App Store link]
  - Android: [Play Store link]
  ```
- **`llms-full.txt`** (`public/llms-full.txt`): Detaylı özellik açıklamaları, kullanım senaryoları, SSS
- **Açık, net, yapılandırılmış içerik:** AI'ların doğru parse edebilmesi için bullet list, tablo, heading kullanımı
- **Schema.org markup zenginleştirme:** AI'lar structured data'yı tercih ediyor
- **Doğrulanabilir iddialar:** "10.000+ kullanıcı" gibi iddialarda kaynak belirt
- **E-E-A-T sinyalleri:** Uzmanlık, deneyim, otorite göstergeleri (About Us, iletişim bilgileri, sosyal medya linkleri)
- **Kaynak olarak atıflanabilir içerik:** Blog/rehber sayfaları (ileride — "İşletme defteri nasıl tutulur?" gibi)

**Dashboard route'ları:** `noindex, nofollow` + `X-Robots-Tag` header (kesinlikle indexlenmemeli)

### 4.5 Güvenlik ve Bot Koruması (3 gün)

**Bu bölüm kritiktir — web uygulaması internete açık olduğu için mobil'de olmayan saldırı vektörleri mevcuttur.**

```
src/lib/security/
├── rateLimiter.ts                  ← Rate limiting yardımcı fonksiyonları
├── sanitize.ts                     ← Input sanitization
└── csrf.ts                         ← CSRF token yönetimi (gerekirse)

src/middleware.ts                   ← Güvenlik header'ları + rate limit + auth
```

**4.5.1 HTTP Güvenlik Header'ları (middleware.ts'e eklenecek)**

```typescript
// Her response'a eklenecek header'lar:
const securityHeaders = {
  // XSS koruması
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  
  // Content Security Policy
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",  // Next.js ihtiyacı, prod'da sıkılaştır
    "style-src 'self' 'unsafe-inline'",                  // Tailwind inline styles
    "img-src 'self' data: blob: https://*.supabase.co",  // Supabase storage görselleri
    "font-src 'self'",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co", // Supabase API + Realtime
    "frame-ancestors 'none'",                             // Clickjacking koruması
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; '),
  
  // HTTPS zorunluluğu
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
  
  // Permission Policy (gereksiz API'lara erişimi kapat)
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  
  // Dashboard sayfaları için ek header
  'X-Robots-Tag': 'noindex, nofollow',  // Sadece dashboard route'larına
}
```

**4.5.2 Rate Limiting (Bot + Brute Force Koruması)**

```
npm install @upstash/ratelimit @upstash/redis
```

Upstash Redis ile serverless-uyumlu rate limiting:

| Endpoint / Aksiyon | Limit | Pencere | Strateji |
|---------------------|-------|---------|----------|
| `/api/auth/login` (email/şifre) | 5 deneme | 15 dakika | IP bazlı, sliding window |
| `/api/auth/register` | 3 kayıt | 1 saat | IP bazlı |
| `/api/auth/forgot-password` | 3 istek | 1 saat | IP bazlı |
| `/auth/callback` (OAuth) | 10 istek | 5 dakika | IP bazlı |
| Genel API istekleri (dashboard) | 100 istek | 1 dakika | User ID bazlı |
| Dosya upload (fotoğraf/Excel) | 10 upload | 10 dakika | User ID bazlı |
| OCR parse isteği | 20 istek | 24 saat | User ID bazlı (mevcut limit) |

Rate limit aşıldığında: `429 Too Many Requests` + `Retry-After` header

**4.5.3 Bot Koruması**

- **Cloudflare Turnstile (CAPTCHA alternatifi):** Ücretsiz, privacy-friendly
  - Kayıt formunda Turnstile widget
  - Şifre sıfırlama formunda Turnstile widget
  - Login'de opsiyonel (3 başarısız denemeden sonra aktif)
  ```
  npm install @marsidev/react-turnstile
  ```
  - Turnstile site key: `.env.local`'e `NEXT_PUBLIC_TURNSTILE_SITE_KEY`
  - Turnstile secret key: `.env.local`'e `TURNSTILE_SECRET_KEY`
  - Server-side doğrulama: `POST https://challenges.cloudflare.com/turnstile/v0/siteverify`

- **Honeypot alanları:** Formlar'da gizli input (bot'lar doldurur, gerçek kullanıcılar görmez)
  ```html
  <input type="text" name="website" style="display:none" tabIndex={-1} autoComplete="off" />
  ```
  Bu alan doluysa → bot olarak işaretle, isteği sessizce reddet (200 döndür ama işleme)

- **User-Agent analizi:** Bilinen bot UA'larını middleware'de engelle (SEO bot'ları hariç)

**4.5.4 CSRF Koruması**

- Next.js App Router + Server Actions: CSRF otomatik korumalı (SameSite cookie)
- Supabase client: cookie tabanlı auth, `@supabase/ssr` SameSite=Lax cookie kullanır
- Ek önlem: state-changing isteklerde `Origin` header kontrolü middleware'de

**4.5.5 XSS (Cross-Site Scripting) Koruması**

- React varsayılan olarak JSX'te string'leri escape eder (XSS'e karşı güçlü)
- **ASLA `dangerouslySetInnerHTML` kullanma** (plan genelinde yasak)
- Kullanıcı input'ları (cari adı, işlem açıklaması, not): display'de otomatik escape (React)
- URL parametreleri: `encodeURIComponent()` ile encode et
- Supabase query parametreleri: parameterized query (RPC + .eq/.ilike) — SQL injection riski yok

**4.5.6 Authentication Güvenliği**

- **Supabase Auth:** bcrypt ile şifre hash'leme (server-side, otomatik)
- **Minimum şifre:** 6 karakter (Supabase config)
- **Session yönetimi:** HttpOnly, Secure, SameSite=Lax cookie (client JS erişemez)
- **Token refresh:** `@supabase/ssr` middleware her istekte otomatik refresh
- **Brute force:** Rate limiting (yukarıda) + Turnstile (3 başarısız sonrası)
- **Account enumeration koruması:** "Email veya şifre hatalı" (hangisinin yanlış olduğunu söyleme)
- **Scheduled deletion:** 7 gün bekleme süresi (yanlışlıkla silmeyi önle)
- **OAuth state parametresi:** CSRF koruması (Supabase otomatik hallediyor)

**4.5.7 Data Güvenliği**

- **RLS (Row Level Security):** Tüm tablolarda aktif (Supabase'de zaten var)
  - Her kullanıcı sadece kendi isletme_id'sine ait veriyi görebilir
  - Web'de ek RLS gerekmez — aynı policy'ler geçerli
- **Server-side validation:** Tüm form verilerini server'da tekrar doğrula (client validation bypass edilebilir)
  - Zod schema'ları hem client hem server'da kullanılacak
- **File upload güvenliği:**
  - Dosya tipi kontrolü (MIME type + extension): sadece JPEG, PNG, WebP, PDF, XLSX, CSV
  - Dosya boyut limiti: resim max 10MB, Excel max 50MB
  - Supabase Storage policy: authenticated users only, isletme_id bazlı path
  - Dosya adı sanitization: UUID ile yeniden adlandır (path traversal önleme)
- **Sensitive data exposure önleme:**
  - `.env.local` dosyası `.gitignore`'da
  - Server-only env vars: `TURNSTILE_SECRET_KEY` (NEXT_PUBLIC_ prefix'i yok)
  - Client'a gönderilen response'lardan gereksiz alan çıkar (password hash, internal ID gibi)
- **SQL Injection:** Supabase client parameterized query kullanıyor, risk yok
  - RPC çağrılarında parametreler type-safe (TypeScript + Supabase types)

**4.5.8 Dependency Güvenliği**

- **npm audit:** Her deployment öncesi `npm audit` çalıştır
- **Dependabot / Renovate:** GitHub'da otomatik güvenlik güncellemesi PR'ları
- **Lock dosyası:** `package-lock.json` commit'le (supply chain attack önleme)
- **Kritik paketler:** Sadece güvenilir, aktif bakılan paketler kullan (shadcn/ui, @supabase/ssr, TanStack, vb.)

**4.5.9 Logging ve Monitoring**

- **Auth olayları:** Başarısız login, kayıt, şifre sıfırlama denemeleri logla
- **Rate limit ihlalleri:** Hangi IP/user, hangi endpoint, kaç deneme
- **Vercel Analytics:** Core Web Vitals + hata izleme (ücretsiz tier)
- **Supabase logs:** Auth ve database logları Supabase Dashboard'dan izlenebilir
- **Şüpheli aktivite:** Aynı IP'den çok fazla kayıt, farklı hesaplara login denemesi → log + alert

**4.5.10 Ek Güvenlik Önlemleri**

- **Vercel Firewall:** DDoS koruması (otomatik, ücretsiz tier'da da var)
- **Edge Middleware:** Güvenlik header'ları ve rate limit kontrolü edge'de (düşük latency)
- **Cookie güvenliği:** `Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/`
- **Error handling:** Hata mesajlarında stack trace veya internal bilgi gösterme
  - Production'da genel hata mesajı: "Bir hata oluştu. Lütfen tekrar deneyin."
  - Detaylı hata sadece server log'larında
- **Environment isolation:** Development, staging, production ortamları için farklı Supabase projeleri (opsiyonel, ileride)

### 4.6 Monetizasyon Altyapısı (Gelecek için hazırlık) (2 gün)

**Şu an ücretsiz olacak ama ileride ücretli plan eklenebilmesi için altyapı hazırlığı:**

```
src/lib/subscription/
├── plans.ts                        ← Plan tanımları (free, pro, business)
├── features.ts                     ← Özellik gating mantığı
└── checkAccess.ts                  ← Kullanıcının plan'ına göre erişim kontrolü

src/hooks/useSubscription.ts        ← Kullanıcının aktif planını sorgula
src/components/shared/PaywallGate.tsx ← "Bu özellik Pro planında" overlay
src/components/shared/UpgradePrompt.tsx ← Plan yükseltme CTA
```

**Veritabanı hazırlığı (Supabase migration - ileride):**
```sql
-- subscriptions tablosu (ileride eklenecek)
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  isletme_id UUID REFERENCES isletmeler NOT NULL,
  plan TEXT NOT NULL DEFAULT 'free',  -- 'free' | 'pro' | 'business'
  status TEXT NOT NULL DEFAULT 'active', -- 'active' | 'cancelled' | 'past_due'
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

**Olası plan yapısı (henüz kesinleşmemiş, altyapı hazırlığı):**

| Özellik | Free | Pro | Business |
|---------|------|-----|----------|
| Hesap sayısı | 3 | Sınırsız | Sınırsız |
| Cari sayısı | 10 | Sınırsız | Sınırsız |
| Personel sayısı | 3 | Sınırsız | Sınırsız |
| İşlem sayısı/ay | 100 | Sınırsız | Sınırsız |
| OCR tarama/gün | 5 | 50 | 200 |
| Paylaşılan kullanıcı | 1 | 5 | 20 |
| Raporlar | Temel | Detaylı | Detaylı + Export |
| Excel import/export | ✗ | ✓ | ✓ |
| Çek yönetimi | ✗ | ✓ | ✓ |
| API erişimi | ✗ | ✗ | ✓ |

**Ödeme altyapısı (ileride — Faz 5):**
- **Stripe veya Iyzico:** Türkiye'de ödeme almak için Iyzico daha uygun (TL + Türk kartları)
- **Webhook endpoint:** `/api/webhooks/payment` → subscription durumu güncelle
- **Stripe Checkout veya Iyzico Checkout:** Hosted payment page (PCI compliance sorunu yok)
- **Faturalandırma:** e-Fatura entegrasyonu (ileride, Paraşüt veya Logo)

**Şimdilik yapılacak:**
1. `plans.ts` dosyasında plan tanımları ve limit değerleri (kolay değiştirilebilir)
2. `useSubscription` hook'u: şimdilik herkes "free" döndürür (DB tablosu yokken)
3. `checkAccess(feature, userPlan)` fonksiyonu: feature gating logic
4. `PaywallGate` component'i: limit aşıldığında "Pro'ya yükselt" mesajı (şimdilik sadece UI, ödeme yok)
5. Entity oluşturma sırasında limit kontrolü: "Free planda max 3 hesap" (ileride aktifleştirilecek, şimdilik disabled)

### 4.7 Deployment (3 gün)

**Vercel deployment:**
1. GitHub repo'yu Vercel'e bağla
2. Environment variables ekle:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_GOOGLE_CLIENT_ID`
   - `NEXT_PUBLIC_SITE_URL` (production domain)
   - `NEXT_PUBLIC_TURNSTILE_SITE_KEY`
   - `TURNSTILE_SECRET_KEY` (server-only, NEXT_PUBLIC_ yok)
   - `UPSTASH_REDIS_REST_URL` (rate limiting için)
   - `UPSTASH_REDIS_REST_TOKEN` (rate limiting için)
3. Domain bağla (isletmetakip.com veya seçilen domain)
4. Production deploy
5. Vercel Firewall ayarlarını kontrol et (DDoS koruması aktif mi?)

**Supabase güncellemeleri:**
1. Site URL'i production domain ile güncelle
2. Redirect URL'leri ekle: `https://domain.com/auth/callback`
3. Google OAuth redirect URI güncelle
4. Apple Sign-In: Services ID redirect URI güncelle

**DNS ayarları:**
1. Domain sağlayıcıda Vercel DNS'e yönlendir
2. SSL otomatik (Vercel hallediyor)
3. HSTS preload list'e başvur (opsiyonel, uzun vadeli)

**Cloudflare Turnstile kurulumu:**
1. Cloudflare Dashboard → Turnstile → Site ekle
2. Domain'i ekle, widget mode: "Managed"
3. Site key ve secret key'i Vercel env'e ekle

**Upstash Redis kurulumu:**
1. Upstash Console → Redis database oluştur (region: Frankfurt — Türkiye'ye yakın)
2. REST URL ve token'ı Vercel env'e ekle

### 4.8 Supabase Realtime (opsiyonel, 2 gün)

- İşlem tablosundaki değişiklikleri dinle
- Başka kullanıcı (veya mobil app) işlem eklediğinde otomatik refetch
- `supabase.channel('islemler').on('postgres_changes', { event: '*', schema: 'public', table: 'islemler' }, () => queryClient.invalidateQueries(...))`

### 4.9 Final Doğrulama

```
✓ Responsive: mobil, tablet, desktop'ta düzgün görünüyor mu?
✓ Loading: skeleton'lar ve error state'ler çalışıyor mu?
✓ SEO: landing page Google'da düzgün indexleniyor mu? (Lighthouse SEO 100)
✓ GEO: llms.txt erişilebilir mi? Structured data doğru mu?
✓ Performance: Lighthouse skoru 95+ mı? Core Web Vitals geçiyor mu?
✓ Deploy: production URL çalışıyor mu?
✓ SSL: HTTPS aktif mi? HSTS header var mı?
✓ Auth: production'da login/register çalışıyor mu?
✓ Güvenlik header'ları: CSP, X-Frame-Options, HSTS doğru mu?
✓ Rate limiting: brute force login denemesi engelleniyor mu?
✓ Turnstile: kayıt ve şifre sıfırlama formlarında çalışıyor mu?
✓ Bot koruması: honeypot alanları aktif mi?
✓ File upload: sadece izin verilen dosya tipleri kabul ediliyor mu?
✓ XSS: kullanıcı input'ları düzgün escape ediliyor mu?
✓ Mobil uygulama hala sorunsuz çalışıyor mu?
✓ Aynı kullanıcı hem mobil hem web'den giriş yapabiliyor mu?
✓ defterappv2/ dizininde HİÇBİR değişiklik yok mu?
✓ npm audit: kritik güvenlik açığı yok mu?
```

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
| Faz 4: Cilalama + Güvenlik + SEO/GEO + Deploy | 15-20 gün |
| **Toplam** | **63-81 iş günü (~13-16 hafta)** |
