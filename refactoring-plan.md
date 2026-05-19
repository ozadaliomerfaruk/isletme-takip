# Kapsamli Refactoring Plani

> Son guncelleme: 2026-05-18 (v4 — tamamlandi)
> Durum: %100 tamamlandi. Tum fazlar bitti.
> Type check: PASS (npx tsc --noEmit temiz)
> ESLint: PASS (0 error, 181 warning — flat config)

---

## TAMAMLANAN ISLER

### Faz 1: Altyapi & Guvenlik

| # | Is | Durum | Dogrulama |
|---|-----|-------|-----------|
| 1.1 | Query Key Migration | TAMAM | src/ genelinde sifir inline query key. Tum hook'lar `queryKeys.*` factory kullaniyor. |
| 1.2 | increment_balance RPC Guvenligi | TAMAM | `supabase/migrations/20260518020000_fix_increment_balance_isletme_check.sql` — isletme_id ownership check + multi-user support. Migration uygulama bekliyor. |
| 1.4 | Storage Policy Multi-User Fix | TAMAM | `supabase/migrations/20260518030000_fix_storage_policy_multi_user.sql` — 4 CRUD policy icin isletme_users UNION eklendi. Migration uygulama bekliyor. |
| 1.3 | Auth Token Sifreleme | KALDIRILDI | Supabase JWT'ler kisa omurlu ve server-side dogrulanir, backend RLS verileri korur. Client-side encryption gereksiz karmasiklik. |
| 1.5 | Deep Link Token Handling | TAMAM | `src/app/verify.tsx:63` — `if (accessToken && refreshToken)` kontrolu eklendi. |

**Yapilan detaylar (1.1):**
- `queryKeys.ts`: 19 entity (islemler, hesaplar, cariler, personel, kategoriler, reports, analytics, urunler, urunHareketler, notlar, archive, exchangeRates, personelLeaveQuotas, remainingUsage, auditLog, cariSharing, multiUser, profiles, ileriTarihliIslemler)
- `invalidationMap`: 18 entity type (islem, ileriTarihliIslem, cek, nakitAvans, hesap, cari, personel, kategori, isletme, urun, urunHareket, not, urunAlias, cariAlias, irsaliyeRecord, cariSharing, isletmeUser, personelLeaveQuota)
- Migrated 20+ hook dosyasi + 2 page dosyasi

### Faz 2: UX Tutarlilik

| # | Is | Durum | Dogrulama |
|---|-----|-------|-----------|
| 2.1 | BackButton Bileseni | TAMAM | `src/components/ui/BackButton.tsx` olusturuldu (icon, style props destegi). 11 sayfa migrate edildi: paylasilan-isletmeler, kullanici-yonetimi, davet-olustur, islem-gecmisi, cariler/[id], hesaplar/[id], personel/[id], arama, izin-gecmisi/[id], foto-import (2 kullanim). |
| 2.2 | useUndoDelete | TAMAM | notlar, kategoriler, urunler/index, urunler/[id] (hareketler), nakit-avanslar/[id], + onceki 4 detay sayfasi. Toplam 10 sayfa. |
| 2.3 | Pull-to-refresh | TAMAM | usePullToRefresh hook + 16 sayfa: dashboard, cariler tab/detay, personel tab/detay, hesaplar/[id], urunler/index/[id], notlar, kategoriler, arsiv, izin-gecmisi, nakit-avanslar, raporlar (genel, gelir-gider, alis-satis). |
| 2.5 | Permission Check | TAMAM | `urunler/[id].tsx` — `usePagePermission({ module: 'urunler' })` eklendi. |

### Faz 3: Kod Bolme

| # | Is | Durum | Dogrulama |
|---|-----|-------|-----------|
| 3.1 | data-import/index.tsx | TAMAM | 2899 → 654 satir. 18 alt dosya cikarildi (types, styles, 7 helper, 4 step, modal, tab). |
| 3.3 | CreditCardTransactionBar | TAMAM | 1397 → 756 satir. styles.ts, CreditCardDatePicker, CreditCardPickerSheets cikarildi. |
| 3.2 | Detay sayfasi ortak bilesenler | TAMAM | `BalanceEditorModal.tsx`, `DetailExportSection.tsx`, `DetailActionMenu.tsx` cikarildi. `useDetailNoteHandlers` hook olusturuldu. BackButton entegre edildi. cariler 1624→1268, hesaplar 1367→1140, personel 1346→1013 (toplam -916 satir). |
| 3.4 | urunler/index.tsx | TAMAM | 1525 → 773 satir. `ProductRow.tsx` + `ProductPeriodPickers.tsx` cikarildi. Unused imports temizlendi. |

### Faz 4: Kucuk Temizlikler

| # | Is | Durum | Dogrulama |
|---|-----|-------|-----------|
| 4.1 | tsconfig path alias | TAMAM | 5 redundant alias silindi. Sadece `@/*` kaldi. |
| 4.2 | Gereksiz `import React` | TAMAM | 3 dosyadan silindi. Kalan 4 dosya `React.` namespace kullaniyor (gecerli). |
| 4.3 | Console.log yapilandirmasi | TAMAM | `babel.config.js` — `exclude: ['error', 'warn']` eklendi. |

---

## TAMAMLANAN ISLER (DEVAM)

### Faz 2.4: Export/Share Paritesi — TAMAM

| Sayfa | Eklenen |
|-------|---------|
| `personel/izin-gecmisi/[id].tsx` | Excel export (izin islemleri + kota ozeti) |
| `raporlar/kategori/[id].tsx` | Excel export (alt kategori dagilimi) |
| `hesaplar/nakit-avanslar/[id].tsx` | Excel export (nakit avans listesi + taksitler) |

**Yeni dosya:** `src/lib/pageExports.ts` — `exportLeaveHistory`, `exportNakitAvanslar`, `exportCategoryDetail`

### Faz 3.4: urunler/index.tsx Bolme — TAMAM
**1525 → 773 satir (%49 azalma).** Cikarilan bilesenler:
- `src/components/urunlerPage/ProductRow.tsx` — Genisleyebilir urun satiri
- `src/components/urunlerPage/ProductPeriodPickers.tsx` — Tum period picker modal'lari (yil, ay+yil, gun, custom tarih)
- `src/components/urunlerPage/styles.ts` — Tum stiller

### Faz 4.5: `as any` Azaltma — TAMAM
**21 → 12 (%43 azalma).** Duzeltilen dosyalar:
- `lib/pdfExport.ts` — `invertCariTransactionType` cast kaldirildi (1)
- `lib/excelExport.ts` — `invertCariTransactionType` cast kaldirildi (3)
- `hooks/useCategoryReport.ts` — `error.code` dogru tiplendi (2)
- `components/reports/TrendFilterModal.tsx` — redundant `as any` cast kaldirildi (1)
- `app/personel/[id].tsx` — `quickBarDefaultType` `TransactionType` olarak tiplendi (1)

**Kalan 12:** 11 expo-router typed route cast + 1 XLSX library return type. Bunlar yapisal, route type generation olmadan duzeltilemez.

---

## SON TAMAMLANAN ISLER

### 2.1 BackButton — Tum Migrasyonlar TAMAM
BackButton component'e `icon` ve `style` props eklendi. 7 ek sayfa migrate edildi:
- `cariler/[id].tsx`, `hesaplar/[id].tsx`, `personel/[id].tsx` — headerLeft
- `arama.tsx` — ArrowLeft icon ile
- `personel/izin-gecmisi/[id].tsx` — ArrowLeft icon ile
- `foto-import/index.tsx` — 2 farkli kullanim (capture + list back)
Toplam: 11 sayfa BackButton kullaniyor.

### 3.2 Detay Sayfalari — Tam Ortak Bilesenler TAMAM
Yeni bilesenler:
- `src/components/detail/DetailActionMenu.tsx` — Konfigurasyonlu overflow menu
- `src/hooks/useDetailNoteHandlers.ts` — 6 not hook'u + 4 handler tek hook'ta

Sonuclar:
| Sayfa | Onceki | Sonraki | Azalma |
|-------|--------|---------|--------|
| cariler/[id].tsx | 1624 | 1268 | -356 |
| hesaplar/[id].tsx | 1367 | 1140 | -227 |
| personel/[id].tsx | 1346 | 1013 | -333 |
| **Toplam** | **4337** | **3421** | **-916** |

### 4.4 ESLint 8→9 Upgrade — TAMAM
- `eslint.config.mjs` flat config olusturuldu (tseslint.config pattern)
- `typescript-eslint` v8 unified paketi (ayri parser/plugin yerine)
- `.eslintrc.js` silindi
- 0 error, 181 warning (tumu onceden mevcut)

---

## UYGULANMAYI BEKLEYEN MIGRATION'LAR

Bu migration'lar yazildi ama henuz Supabase'e uygulanamiyor (production'da test gerekli):

1. `supabase/migrations/20260518020000_fix_increment_balance_isletme_check.sql`
   - increment_balance RPC'ye isletme ownership kontrolu ekler
   - **Kritik:** Uygulama oncesi mevcut RPC'nin davranisini dogrula

2. `supabase/migrations/20260518030000_fix_storage_policy_multi_user.sql`
   - islem-photos bucket policy'lerine shared user (isletme_users) erisimi ekler
   - **Kritik:** Mevcut policy'leri DROP eder, yenilerini olusturur

---

## OZET TABLO

| Faz | Is | Durum |
|-----|-----|-------|
| 1.1 | Query Key Migration | TAMAM |
| 1.2 | increment_balance RPC | TAMAM (migration bekliyor) |
| 1.3 | Auth Token Sifreleme | KALDIRILDI (gereksiz) |
| 1.4 | Storage Policy Fix | TAMAM (migration bekliyor) |
| 1.5 | Deep Link Fix | TAMAM |
| 2.1 | BackButton | TAMAM (11 sayfa) |
| 2.2 | useUndoDelete | TAMAM (10 sayfa) |
| 2.3 | Pull-to-refresh | TAMAM (16 sayfa) |
| 2.4 | Export/Share Paritesi | TAMAM (3 sayfa + pageExports.ts) |
| 2.5 | Permission Check | TAMAM |
| 3.1 | data-import bolme | TAMAM |
| 3.2 | Detay ortak bilesenler | TAMAM (-916 satir) |
| 3.3 | CreditCardTxBar bolme | TAMAM |
| 3.4 | urunler/index bolme | TAMAM (1525→773 satir) |
| 4.1 | tsconfig temizlik | TAMAM |
| 4.2 | React import temizlik | TAMAM |
| 4.3 | Console.log config | TAMAM |
| 4.4 | ESLint upgrade | TAMAM (flat config) |
| 4.5 | as any azaltma | TAMAM (21→12, kalan yapisal) |

**Genel ilerleme: %100 tamamlandi**
**Tum fazlar bitti. Plan tamamlandi.**

Toplam etki:
- 19 entity query key factory'ye migrate edildi
- 2 guvenlik migration'i yazildi (uygulama bekliyor)
- 11 sayfa BackButton'a migrate edildi
- 10 sayfa useUndoDelete'e migrate edildi
- 16 sayfa pull-to-refresh eklendi
- 3 sayfa export paritesi saglandi
- data-import: 2899→654 satir
- CreditCardTxBar: 1397→756 satir
- urunler/index: 1525→773 satir
- detay sayfalari: 4337→3421 satir (-916)
- ESLint 8→9 flat config
- as any: 21→12 (kalan yapisal)
- tsconfig, React import, console.log temizlikleri
