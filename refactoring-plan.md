# Kapsamlı Refactoring Planı

> Son güncelleme: 2026-05-18
> Durum: Planlama tamamlandı, uygulama beklemede.
> Başlangıç: Faz 3 (Kod Bölme) → data-import/index.tsx

## Context
Uygulama feature-complete durumda (23 bug düzeltildi, 10 özellik eklendi). Ancak hızlı geliştirme sürecinde teknik borç birikti: tutarsız UX pattern'ler, inline query key'ler, büyük dosyalar, eksik güvenlik kontrolleri. Bu plan tüm sayfaları bir arada değerlendirerek sistematik refactoring yapılmasını sağlar.

**Hedef:** Güvenlik açıklarını kapatmak, UX tutarlılığını sağlamak, kod bakımını kolaylaştırmak.
**Kısıt:** Her adım kendi başına çalışır durumda bırakılmalı (incremental delivery).

---

## Audit Özeti

| Metrik | Durum |
|--------|-------|
| Toplam src/ dosyası | 320 TypeScript/TSX |
| >40KB dosyalar | 15 adet (bölme adayı) |
| Detay sayfaları | 14 adet (tutarsız feature coverage) |
| Custom hook'lar | 54 adet (iyi organize) |
| useUndoDelete kullanan | 4 sayfa (40+ olmalı) |
| queryKeys factory kullanan | 22 hook (46+ olmalı) |
| Pull-to-refresh olan | 8 sayfa (14+ olmalı) |
| Permission kontrolü olan | 57 dosya (iyi) |
| İkon kütüphanesi | Tek kaynak: lucide-react-native ✓ |
| Hata yönetimi (toErrorMessage) | 59 dosya (iyi) |
| formatCurrency kullanan | 83 dosya (8 dosyada inline kalmış) |

---

## FAZA 1: Altyapı & Güvenlik (Öncelik: KRİTİK)

> Bu faz diğerlerinden önce yapılmalı — güvenlik açıkları ve veri tutarlılığı sorunları.

### 1.1 Query Key Migration (R1)
**Sorun:** 24 hook dosyasında inline string query key var. Bu, merkezi invalidation sistemini kırar.
**Etki:** Cache tutarsızlığı → kullanıcı eski veri görür.

**Dosyalar:**
- `src/lib/queryKeys.ts` — Yeni entity key'leri ekle
- `src/hooks/useNotlar.ts` — `NOTLAR_QUERY_KEY` → `queryKeys.notlar.*`
- `src/hooks/useCategoryReport.ts` — inline → `queryKeys.categoryReport.*`
- `src/hooks/useExchangeRates.ts` — inline → `queryKeys.exchangeRates.*`
- `src/hooks/usePersonelLeaveQuotas.ts` — inline → `queryKeys.personelLeaveQuotas.*`
- `src/hooks/useProductReport.ts` — inline → `queryKeys.productReport.*`
- `src/hooks/useAnalyticsTrend.ts` — inline → `queryKeys.analytics.*`
- `src/hooks/useAnalyticsSummary.ts` — inline → `queryKeys.analytics.*`
- `src/hooks/useRemainingUsage.ts` — inline → `queryKeys.remainingUsage.*`
- `src/components/import/usePendingFormSave.ts` — inline → `queryKeys.pendingForm.*`
- Diğer 14+ dosya

**Yaklaşım:**
1. `queryKeys.ts`'e yeni entity objeleri ekle (notlar, categoryReport, analytics, exchangeRates vb.)
2. Her entity'yi `invalidationMap`'e ekle (immediate vs deferred stratejisi)
3. Hook'lardaki inline key'leri factory çağrılarıyla değiştir
4. `useInvalidateNotlar` gibi custom invalidator'ları `invalidateRelatedQueries` ile değiştir

**Test:** Her hook için: create → list güncelleniyor mu? delete → list güncelleniyor mu? Başka sayfaya geçip geri gel → stale data yenileniyor mu?

---

### 1.2 increment_balance RPC Güvenliği (S3)
**Sorun:** `SECURITY DEFINER` fonksiyonu RLS'i bypass eder, `row_id`'nin kullanıcının işletmesine ait olduğunu kontrol etmez.
**Etki:** Teorik olarak başka işletmenin bakiyesi değiştirilebilir.

**Dosya:** Yeni migration — `supabase/migrations/20260518020000_fix_increment_balance_isletme_check.sql`

**Değişiklik:**
```sql
CREATE OR REPLACE FUNCTION increment_balance(table_name TEXT, row_id UUID, amount DECIMAL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF table_name NOT IN ('hesaplar', 'cariler', 'personel') THEN
    RAISE EXCEPTION 'increment_balance: yetkisiz tablo "%"', table_name;
  END IF;

  -- İşletme sahipliği kontrolü
  EXECUTE format(
    'UPDATE %I SET balance = balance + $1, updated_at = NOW() WHERE id = $2 AND isletme_id IN (SELECT id FROM isletmeler WHERE user_id = auth.uid() UNION SELECT isletme_id FROM isletme_users WHERE user_id = auth.uid() AND status = ''active'')',
    table_name
  ) USING amount, row_id;
END;
$$;
```

**Test:** Farklı kullanıcının hesap/cari/personel ID'si ile RPC çağrısı → bakiye değişmemeli.

---

### 1.3 Auth Token Güvenliği (S1)
**Sorun:** Supabase session (~3-4KB) AsyncStorage'da plaintext saklanıyor.
**Etki:** Jailbroken/rooted cihazda token çalınabilir.

**Yaklaşım:** Encryption wrapper (expo-secure-store 2KB limitini aşmak için)
- `src/lib/secureStorage.ts` — AES-256 encryption wrapper oluştur
- Key'i SecureStore'da sakla (32 byte, limit dahilinde)
- Encrypted session'ı AsyncStorage'da sakla
- `src/lib/supabase.ts` — `SupabaseStorageAdapter`'ı güncelle

**Gerekli paketler:** `expo-crypto` (zaten mevcut olabilir) veya `react-native-aes-crypto`

**Test:** Login → app kill → restart → session devam ediyor mu? Token AsyncStorage'da encrypt mi?

---

### 1.4 Şifre Politikası (S2)
**Sorun:** Min 6 karakter, OWASP önerisi min 8.

**Dosyalar:**
- `src/app/(auth)/register.tsx` — `password.length < 6` → `< 8`
- `src/components/ui/PasswordStrengthIndicator.tsx` — Score threshold'ları güncelle
- Supabase Dashboard → Auth → Password Min Length: 8

**Test:** 7 karakterli şifre → reddedilmeli. 8+ kabul edilmeli.

---

### 1.5 Storage Policy Multi-User Fix (S4)
**Sorun:** Storage policy sadece owner'ı kontrol ediyor (`isletmeler.user_id`), shared user (`isletme_users`) erişemiyor.

**Dosya:** Yeni migration — storage policy'leri güncelle

```sql
-- SELECT policy: owner OR shared user
CREATE OR REPLACE POLICY "Users can view islem photos" ON storage.objects FOR SELECT
USING (
  bucket_id = 'islem-photos' AND (
    (storage.foldername(name))[1] IN (SELECT id::text FROM isletmeler WHERE user_id = auth.uid())
    OR
    (storage.foldername(name))[1] IN (SELECT isletme_id::text FROM isletme_users WHERE user_id = auth.uid() AND status = 'active')
  )
);
-- Aynı pattern INSERT/UPDATE/DELETE policy'lerine de uygulanacak
```

**Test:** Shared user olarak fotoğraf yükle/görüntüle → çalışmalı.

---

### 1.6 Deep Link Token Handling (S5)
**Sorun:** `refresh_token || ''` ile boş session oluşuyor.

**Dosya:** `src/app/verify.tsx` (line 75)

**Değişiklik:** `refreshToken` yoksa session oluşturma, kullanıcıya hata göster.

---

## FAZA 2: UX Tutarlılık Standardizasyonu

> Tüm sayfalar aynı UX pattern'leri kullanmalı.

### 2.1 BackButton Bileşeni Oluştur
**Sorun:** 53+ dosyada farklı back button implementasyonları. Bazıları ArrowLeft, bazıları ChevronLeft, bazıları router.back() çağırıyor bazıları canGoBack() kontrolü yapıyor.

**Yeni dosya:** `src/components/ui/BackButton.tsx`

```typescript
interface BackButtonProps {
  onPress?: () => void;
  fallbackRoute?: string;  // default: '/(tabs)'
}
```

**Pattern:** `router.canGoBack() ? router.back() : router.replace(fallbackRoute)`
**İkon:** `ChevronLeft` (size 28, standardize)

**Etkilenen dosyalar:** Tüm `[id].tsx`, `ekle.tsx`, `duzenle/` sayfaları (53+ dosya)
**Strateji:** Yeni component'i oluştur → yeni sayfalarda kullan → zamanla mevcut sayfaları da geçir.

---

### 2.2 useUndoDelete Standardizasyonu
**Sorun:** 4 sayfa useUndoDelete kullanıyor, 40+ sayfa hâlâ Alert.alert ile direkt siliyor.

**useUndoDelete Interface:**
```typescript
interface UseUndoDeleteOptions<T> {
  onCommitDelete: (id: string) => Promise<void>;
  onError?: (error: unknown) => void;
}
// Returns: { pendingDeleteIds, requestDelete, undoDelete, dismissDelete, snackbar }
```

**Öncelikli sayfalar:**
- `src/app/islemler/index.tsx` — işlem silme
- `src/app/notlar/index.tsx` — not silme
- `src/app/kategoriler/index.tsx` — kategori silme
- `src/app/urunler/index.tsx` — ürün silme
- `src/app/urunler/[id].tsx` — ürün detay silme
- `src/app/hesaplar/nakit-avanslar/[id].tsx` — nakit avans silme

**Pattern:** Her liste sayfasında:
1. `useUndoDelete` hook'u ekle
2. `pendingDeleteIds` ile data filtreleme (silinen öğeyi hemen gizle)
3. `<UndoSnackbar>` render (sayfanın altında)
4. Alert.alert → `requestDelete(id, item, description)` çağrısı

**Test:** Sil → 5 sn undo fırsatı → undo'ya bas → öğe geri geldi mi?

---

### 2.3 Pull-to-Refresh Standardizasyonu
**Sorun:** 8 sayfa var, 14+ sayfada eksik.

**Eksik sayfalar:**
- `src/app/urunler/[id].tsx`
- `src/app/notlar/index.tsx`
- `src/app/kategoriler/index.tsx`
- `src/app/personel/izin-gecmisi/[id].tsx`
- `src/app/hesaplar/nakit-avanslar/[id].tsx`
- `src/app/raporlar/` (tüm rapor sayfaları)
- `src/app/arsiv/index.tsx`

**Pattern:**
```typescript
const [isRefreshing, setIsRefreshing] = useState(false);
const handleRefresh = useCallback(async () => {
  setIsRefreshing(true);
  try { await Promise.all([refetch1(), refetch2()]); }
  finally { setIsRefreshing(false); }
}, [refetch1, refetch2]);

// FlatList props:
refreshing={isRefreshing} onRefresh={handleRefresh}
```

**Custom hook opsiyonu:** `usePullToRefresh(...refetchFns)` → `{ refreshing, onRefresh }` döner.

---

### 2.4 Export/Share Paritesi
**Sorun:** Cariler/Hesaplar/Personel'de tam export var, diğerlerinde yok.

**Eksik sayfalar:**
| Sayfa | Eksik | Karmaşıklık |
|-------|-------|-------------|
| `personel/izin-gecmisi/[id].tsx` | PDF/Excel export | Düşük (pattern hazır) |
| `urunler/[id].tsx` | Share (sadece export var) | Düşük (ShareOptionsSheet ekle) |
| `raporlar/kategori/[id].tsx` | PDF/Excel export | Orta |
| `hesaplar/nakit-avanslar/[id].tsx` | PDF/Excel export | Orta |

**Hazır bileşenler (sadece wiring gerekli):**
- `ShareOptionsSheet` — visible, onDismiss, entityType, onPdfPress, onExcelPress
- `PdfExportSheet` — visible, entityType, entityId, entityName, entityCurrency, currentBalance
- `ExportSheet` — visible, entityType, entityId, entityName, entityCurrency, currentBalance

---

### 2.5 Permission Check Eksikleri
**Sorun:** Bazı sayfalar permission kontrolü yapmıyor.

**Eksik sayfalar:**
- `src/app/urunler/[id].tsx` — `usePagePermission({ module: 'urunler' })` ekle
- `src/app/notlar/index.tsx` — notlar için ayrı modül yok, genel kontrol ekle

---

## FAZA 3: Kod Bölme (Code Splitting) — İLK BAŞLANACAK

> Büyük dosyaları yönetilebilir parçalara ayır. HMR hızı, code review kolaylığı, IDE performansı.

### 3.1 data-import/index.tsx Bölme (2899 → ~200 satır) ⭐ İLK HEDEF

#### Mevcut Yapı
Tek monolitik dosya: 2899 satır, 8 inline helper bileşen, 5 step UI render, 640 satır stil.

**Ana bileşen satır dağılımı:**
| Bölüm | Satırlar | Açıklama |
|--------|----------|----------|
| State tanımları | 89-127 | 30+ useState hook |
| Template download | 144-255 | handleDownloadTemplate |
| File selection | 258-316 | handleSelectFile |
| Parsing | 318-365 | proceedWithParsing |
| Mapping handlers | 367-433 | toggle hesap/cari/kategori |
| Import execution | 435-543 | handleStartImport, proceedWithImport |
| Pending management | 545-604 | fix/skip/deleteAll |
| Undo logic | 607-687 | handleUndoLastImport |
| Export skipped | 713-749 | handleExportSkipped |
| Selectors (useMemo) | 751-799 | filtered lists |
| Modal render | 802-1009 | 6 modal tipi |
| Tabs render | 1011-1102 | import vs skipped |
| Step 1 UI | 1115-1263 | Dosya seçimi |
| Step 2 UI | 1266-1519 | Önizleme |
| Step 4 UI | 1522-1608 | İlerleme |
| Step 5 UI | 1611-1831 | Sonuçlar |
| Helper components | 1857-2253 | 8 inline component |
| StyleSheet | 2259-2899 | 640 satır stil |

#### Hedef Dosya Yapısı
```
src/app/ayarlar/data-import/
├── index.tsx                          (~200 satır — orchestrator only)
├── styles.ts                          (~640 satır — tüm stiller)
├── types.ts                           (~20 satır — Step, ModalType, TabType)
├── components/
│   ├── DataImportModal.tsx            (~210 satır — 6 modal tipi render)
│   ├── SkippedTab.tsx                 (~90 satır — tabs + pending list)
│   ├── steps/
│   │   ├── Step1Select.tsx            (~150 satır — dosya seçimi + template)
│   │   ├── Step2Preview.tsx           (~255 satır — önizleme + validation)
│   │   ├── Step4Importing.tsx         (~90 satır — progress bar + phases)
│   │   └── Step5Result.tsx            (~220 satır — sonuçlar + errors)
│   └── helpers/
│       ├── PhaseItemEnhanced.tsx      (~45 satır)
│       ├── ResultItem.tsx             (~15 satır)
│       ├── TransactionItem.tsx        (~45 satır)
│       ├── SkippedTransactionItemSimple.tsx (~55 satır)
│       ├── AccountItem.tsx            (~70 satır)
│       ├── ClientPersonelItem.tsx     (~95 satır)
│       └── CategoryItem.tsx           (~50 satır)
└── utils/
    ├── importExecution.ts             (~110 satır — handleStartImport, proceedWithImport)
    ├── mappingHandlers.ts             (~70 satır — toggle hesap/cari/kategori tipi)
    ├── pendingHandlers.ts             (~60 satır — fix/skip/deleteAll pending)
    ├── undoLogic.ts                   (~80 satır — undo last import)
    ├── selectors.ts                   (~50 satır — filtered/counted memos)
    └── exportSkipped.ts               (~40 satır — export to Excel)
```

#### State Paylaşım Stratejisi
Ana state `index.tsx`'de kalır, step bileşenlerine props olarak geçilir:
```typescript
// Shared types between all steps
interface DataImportState {
  step: Step;
  preview: ImportPreview | null;
  accountMappings: Record<string, AccountMapping>;
  categoryMappings: Record<string, CategoryTypeMapping>;
  fileName: string;
  fileHash: string;
  isDryRun: boolean;
  validation: ValidationResult | null;
  activeModal: ModalType;
  searchQuery: string;
  activeTab: TabType;
}
```

Her step bileşeni sadece kendi ihtiyaç duyduğu props'ları alır.
Utils fonksiyonları pure function olarak çıkarılır (state setter'ları parametre olarak alır).

#### Build Sırası (data-import bölme)
1. `types.ts` oluştur — Step, ModalType, TabType type'ları taşı
2. `styles.ts` oluştur — StyleSheet taşı (en güvenli, sıfır risk)
3. `components/helpers/` — 7 helper bileşeni taşı (React.memo ile wrap et)
4. `utils/` — 6 utility fonksiyonu taşı (pure functions)
5. `components/steps/` — 4 step bileşeni taşı (en büyük kazanım)
6. `components/DataImportModal.tsx` — Modal render taşı
7. `components/SkippedTab.tsx` — Tab render taşı
8. `index.tsx` refactor — sadece orchestration kalsın (~200 satır)

**Her adım sonrası:** `npx tsc --noEmit` + ilgili sayfayı test et.

---

### 3.2 Detay Sayfaları Ortak Bileşenler

**Gözlem:** `cariler/[id]` (1624), `hesaplar/[id]` (1277), `personel/[id]` (1346) hepsi aynı yapı:
- Header (özet kartı + bakiye)
- Action buttons (düzenle, sil, arşivle, export)
- Transaction list (date-grouped, swipeable, with notes merged)
- Notes integration (NoteRow + NoteInputModal)
- Balance editor modal
- QuickTransactionBar (edit/copy/create)
- Export modals (ShareOptions + PdfExport + ExcelExport)

**Çıkarılacak ortak bileşenler:**
```
src/components/detail/
├── DetailPageHeader.tsx        — Entity-agnostic başlık + bakiye
├── DetailBalanceEditor.tsx     — Bakiye düzenleme modalı
├── DetailTransactionList.tsx   — Grouped transaction rendering
├── DetailActionMenu.tsx        — Overflow menu (düzenle/sil/arşivle/export)
├── DetailExportSection.tsx     — ShareOptions + PdfExport + ExcelExport wiring
└── DetailNoteSection.tsx       — Note rendering + edit modal
```

**Strateji:** Önce shared bileşenleri oluştur → sonra her detay sayfasını bunları kullanacak şekilde refactor et.

---

### 3.3 CreditCardTransactionBar Bölme (1397 → ~500 satır)

```
src/components/transaction/CreditCardTransactionBar/
├── index.tsx                    — Main component + form logic (~500 satır)
├── CreditCardFormFields.tsx     — Input alanları (~300 satır)
├── CreditCardPickerSheets.tsx   — Account/Supplier/Personnel picker'lar (~300 satır)
└── CreditCardDatePicker.tsx     — DateTime seçim modalı (~200 satır)
```

---

### 3.4 urunler/index.tsx Bölme (1525 → ~600 satır)

```
src/app/urunler/
├── index.tsx                — Main list page + state (~600 satır)
├── components/
│   ├── ProductRow.tsx       — Expandable product row (~200 satır)
│   ├── ProductModals.tsx    — Detail/Price/Restore modals (~400 satır)
│   └── ProductFilters.tsx   — Period selector + sort (~200 satır)
```

---

## FAZA 4: Küçük Temizlikler (R3-R7)

### 4.1 tsconfig.json Path Alias Temizliği (R3)
- Redundant alias'ları sil (`@/components/*`, `@/hooks/*` vb.)
- Sıfır risk, `@/*` zaten tümünü kapsıyor.

### 4.2 Gereksiz `import React` Temizliği (R4)
- 7 dosyadan `import React from 'react'` sil.
- React 17+ JSX transform ile gereksiz.

### 4.3 Console.log Yapılandırması (R7)
- `babel.config.js` → `transform-remove-console` config'ine `exclude: ['error', 'warn']` ekle.
- Production'da hata izleme korunsun.

### 4.4 ESLint Upgrade (R5) — Ayrı PR
- eslint 8 → 9 (flat config)
- `@typescript-eslint/v7` → `v8`
- `eslint-plugin-react-hooks@4.6` → `5.x`
- `npx @eslint/migrate-config .eslintrc.js` ile otomatik dönüşüm

### 4.5 `as any` Azaltma (R6) — Faz 3 ile birlikte
- Büyük dosyalar bölünürken `as any` kullanımları da düzeltilir.
- En yoğun: `urunler/index.tsx` (6 adet), `excelImport.ts` (1), `useCategoryReport.ts` (2)

---

## Build Sırası (Kullanıcı Tercihi: Faz 3 Önce)

| Sıra | Faz | İş | Risk | Tahmini Süre |
|------|-----|------|------|--------------|
| **1** | **3.1** | **data-import bölme** | **Orta** | **2-3 saat** |
| 2 | 3.2 | Detay sayfaları ortak bileşen | Orta | 3-4 saat |
| 3 | 3.3 | CreditCardTxBar bölme | Orta | 1-2 saat |
| 4 | 3.4 | urunler/index bölme | Orta | 1-2 saat |
| 5 | 1.2 | increment_balance fix | Düşük | 15 dk |
| 6 | 1.4 | Şifre politikası | Düşük | 15 dk |
| 7 | 1.6 | Deep link fix | Düşük | 10 dk |
| 8 | 1.5 | Storage policy fix | Düşük | 20 dk |
| 9 | 1.1 | Query key migration | Orta | 2-3 saat |
| 10 | 1.3 | Auth token encryption | Yüksek | 1-2 saat |
| 11 | 2.1 | BackButton component | Düşük | 30 dk |
| 12 | 2.2 | useUndoDelete yaygınlaştır | Düşük | 1 saat |
| 13 | 2.3 | Pull-to-refresh | Düşük | 45 dk |
| 14 | 2.4 | Export/Share paritesi | Düşük | 1 saat |
| 15 | 2.5 | Permission eksikleri | Düşük | 20 dk |
| 16 | 4.x | Küçük temizlikler | Düşük | 1 saat |

---

## Doğrulama (Her Adım Sonrası)

1. `npx tsc --noEmit` — Type check geçmeli
2. `npx expo start` — App çalışmalı (metro bundler hata vermemeli)
3. İlgili sayfayı test et (golden path + edge case)
4. Regression: Dashboard, raporlar, diğer detay sayfaları hâlâ çalışıyor mu?

---

## Kritik Dosyalar (Referans)

| Dosya | Rol |
|-------|-----|
| `src/lib/queryKeys.ts` | Merkezi query key factory + invalidation map |
| `src/hooks/useUndoDelete.ts` | Undo-delete hook (5sn timeout, pendingDeleteIds) |
| `src/components/export/ShareOptionsSheet.tsx` | Share UI bileşeni |
| `src/components/export/PdfExportSheet.tsx` | PDF export bileşeni |
| `src/components/export/ExportSheet.tsx` | Excel export bileşeni |
| `src/hooks/usePagePermission.ts` | Sayfa-level yetki kontrolü |
| `src/hooks/usePermissions.ts` | canUpdate/canDelete helpers |
| `src/lib/supabase.ts` | Auth storage adapter (S1 için) |
| `src/app/verify.tsx` | Deep link token handling (S5 için) |
| `supabase/migrations/20260208000001_fix_increment_balance_injection.sql` | Mevcut RPC (S3 için) |
| `src/lib/excelImport.ts` | Import parsing (data-import bağımlılığı) |
| `src/hooks/useDataImport.ts` | Import hook (data-import bağımlılığı) |
| `src/hooks/useImportHistory.ts` | Import history (data-import bağımlılığı) |
