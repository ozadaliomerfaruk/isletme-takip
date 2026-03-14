# IAP Implementasyon Plani - RevenueCat + iOS

## Uygulama Bilgileri
- **Ad**: Isletme Takip
- **Bundle ID**: `com.isletmetakip.app`
- **SKU**: `isletmetakip`
- **Apple ID**: `6756860637`
- **Expo SDK**: 54
- **Mevcut Versiyon**: 1.2.1 (build 31)
- **Platform**: Sadece iOS (Android sonra)

## Ozet
RevenueCat ile iOS IAP entegrasyonu. 3 plan (Free/Pro/Business), aylik/yillik abonelik, 7 gun Pro deneme.

## Fiyatlandirma
| Plan | Aylik | Yillik (2 ay ucretsiz) |
|------|-------|------------------------|
| Free | 0 TL | - |
| Pro | 199 TL | 1.990 TL |
| Business | 399 TL | 3.990 TL |

- 7 gun ucretsiz Pro deneme (yeni kullanicilar, sadece yillik plan)
- Reklam yok (hicbir planda)

---

## Ozellik Matrisi

| Ozellik | Free | Pro | Business |
|---------|------|-----|----------|
| Gelir/gider islemleri | Var | Var | Var |
| Cari hesap | Var | Var | Var |
| Urun/stok | Var | Var | Var |
| Doviz islemleri | Var | Var | Var |
| Gunluk ciro girisi | Var | Var | Var |
| Vadeli/ileri tarihli islem | Var | Var | Var |
| **Raporlar** | **Sadece ozet** | **Tumu** | **Tumu** |
| **Cari paylasma** | **Yok** | **Var** | **Var** |
| **Cari limiti** | **35** | **400** | **1.000** |
| **Urun limiti** | **50** | **300** | **1.500** |
| **Hesap (kasa/banka)** | **5** | **15** | **25** |
| **Personel** | **10** | **200** | **500** |
| Islem limiti | Sinirsiz | Sinirsiz | Sinirsiz |
| Personel izinleri | Yok | Var | Var |
| Fotograf yukleme | Yok | Var (1 GB) | Var (2 GB) |
| Excel export | Yok | Var | Var |
| Bildirim (hatirlatmalar) | Yok | Var | Var |
| Veri import | Yok | Var | Var |
| Toplu islemler (personel/stok) | Yok | Var | Var |
| Multi-user | Yok | Yok | 3 kullanici |
| Yetkilendirme (RBAC) | Yok | Yok | Var |

### Free Planda Olan / Olmayan Ozet
**Free'de ACIK:**
- Tum temel moduller (islem, cari, urun, hesap, personel)
- Doviz islemleri (tum kurlar)
- Gunluk ciro girisi
- Vadeli/ileri tarihli islem olusturma (hatirlatma bildirimi almaz, Pro+ gerekli)
- Ana sayfa ozet kartlari (bugunun gelir/gider, bakiyeler)

**Free'de KAPALI:**
- Detayli raporlar (kategori analizi, nakit akisi, karsilastirma, alis-satis raporu, cari raporu)
- Cari paylasma (ekstre/hesap ozeti paylasma)
- Personel izin takibi
- Fotograf yukleme
- Excel export
- Bildirimler (zamanlanmis islem hatirlatmalari)
- Veri import
- Toplu islemler (personel toplu odeme/gider, stok toplu giris/cikis)

### Plan Degeri Ozeti
- **Pro (199 TL/ay)** = Tek kisilik esnaf/serbest meslek: "Daha fazla kayit, raporlar, export, bildirim, toplu islem istiyorum"
- **Business (399 TL/ay)** = Ekibi olan isletme: "Ekibimle birlikte kullanmam lazim + yetkilendirme"

### Multi-User Kurali
- **Free**: Davet yok, sadece owner
- **Pro**: Davet yok, sadece owner (tek kullanici)
- **Business**: Maksimum 3 davetli kullanici (owner + 3 = toplam 4 kisi)
- Davetli kullanicinin plani = isletme sahibinin plani (Business)
- Paywall'da "3 ekip uyesine kadar" seklinde gosterilecek

### Fotograf Storage Stratejisi
- Yukleme sirasinda sikistirma: max 1200x1200px, JPEG 75% quality (~150-300KB/foto)
- **Kota isletme bazli** (ekip ortak havuz, owner'in plani gecerli)
- **Pro**: 1 GB storage limiti (~3.000-6.000 foto)
- **Business**: 2 GB storage limiti (~6.000-13.000 foto)
- **Kota kontrolu**: `SUM(size_bytes) FROM photo_assets WHERE isletme_id = X AND deleted_at IS NULL` (P2'de counter cache)
- **Abonelik bitince**: `subscription_expired_at = NOW()`, `scheduled_delete_at = NOW() + 90 gun` set edilir
- **90 gun sonra**: Cron job `scheduled_delete_at <= NOW()` olanlari storage'dan siler, `deleted_at = NOW()` set eder (row silinmez, debug icin kalir)
- **Re-subscribe**: `subscription_expired_at = NULL, scheduled_delete_at = NULL` (henuz silinmemisse, deleted_at NULL olanlar kurtarilir)
- Silme oncesi in-app banner ile uyari gosterilir (email ilk versiyonda yok)

### Downgrade Senaryolari
- **Business -> Pro/Free** (3 davetli varken): Tum davetliler pasife alinir (Pro'da multi-user yok). Pasife alinan kullanicilar foto dahil tum isletme verisine erisimi kaybeder.
- **Pro/Business -> Free** (limit ustunde kayit varken): Mevcut kayitlar **korunur**, yeni ekleme engellenir. Kullanici silene veya yukseltene kadar limit altina inemez.
- **Genel kural**: Hicbir veri silinmez, sadece yeni ekleme + ozellik erisimi kapanir

### Server-Side Enforcement
- Limitler SADECE UI'da degil, server tarafinda da kontrol edilecek
- Her entity icin ayri `create_*` RPC:
  - `create_cari(p_isletme_id, ...)` - limit kontrolu icinde
  - `create_urun(p_isletme_id, ...)` - limit kontrolu icinde
  - `create_personel(p_isletme_id, ...)` - limit kontrolu icinde
  - `create_hesap(p_isletme_id, ...)` - limit kontrolu icinde
- Bu RPC'ler icinde `check_record_limit()` cagrilir, sonra INSERT yapilir
- Mevcut direkt insert'ler zamanla bu RPC'lere tasinir
- **Import/bulk operations**: Edge function/RPC icinde ayni limit kontrolu
- **Eski surum uygulamada UI gating olmasa bile** backend limiti devreye girer

### Onemli Farklar
- Tum moduller (personel, urun, cari, hesap) Free'de **ACIK** ama **LIMITLI**
- Gating: **limit bazli** (kayit sayisi) + **ozellik bazli** (acik/kapali)
- Islem limiti: Tum planlarda **SINIRSIZ** (kullanici verisini biriktirir, uygulamaya baglanir)
- Raporlar: Free'de sadece ana sayfa ozet kartlari, detayli raporlar Pro+
- Toplu islemler (personel + stok): Pro+ (onceden sadece Business idi)
- Multi-user: Sadece Business (3 davetli, toplam 4 kisi)
- RBAC: Sadece Business
- Fotograf yukleme Pro+ (storage limitli, 90 gun sonra silme)
- Server-side enforcement: tum limitler backend'de de kontrol edilir

---

## Faz 1: Tip Tanimlari ve Sabitler

### `src/types/subscription.ts` (YENI)
```typescript
export type PlanTier = 'free' | 'pro' | 'business';
export type SubscriptionStatus = 'active' | 'trialing' | 'expired' | 'grace_period' | 'cancelled';
export type BillingPeriod = 'monthly' | 'yearly';

// Ozellik bazli gating (acik/kapali)
export type FeatureId =
  | 'detailed_reports'       // Pro+ (detayli raporlar)
  | 'cari_sharing'           // Pro+ (cari paylasma)
  | 'personnel_leaves'       // Pro+ (personel izinleri)
  | 'photo_upload'           // Pro+
  | 'excel_export'           // Pro+
  | 'notifications'          // Pro+
  | 'data_import'            // Pro+
  | 'bulk_operations'        // Pro+ (toplu personel odeme/gider + stok giris/cikis)
  | 'multi_user'             // Business only (3 davetli)
  | 'rbac';                  // Business (yetkilendirme sistemi)

// Kayit limiti bazli gating
export type LimitId =
  | 'cariler'                // 35 / 400 / 1000
  | 'urunler'                // 50 / 300 / 1500
  | 'hesaplar'               // 5 / 15 / 25
  | 'personel';              // 10 / 200 / 500

export interface SubscriptionState {
  plan: PlanTier;
  status: SubscriptionStatus;
  isActive: boolean;
  isTrial: boolean;
  expiresAt: string | null;
  billingPeriod: BillingPeriod | null;
  loading: boolean;
}
```

### `src/constants/plans.ts` (YENI)
```typescript
// Ozellik erisim: hangi plan gerekli
export const FEATURE_REQUIREMENTS: Record<FeatureId, PlanTier> = {
  detailed_reports: 'pro',
  cari_sharing: 'pro',
  personnel_leaves: 'pro',
  photo_upload: 'pro',
  excel_export: 'pro',
  notifications: 'pro',
  data_import: 'pro',
  bulk_operations: 'pro',
  multi_user: 'business',       // Sadece Business: 3 davetli
  rbac: 'business',
};

// Kayit limitleri (islem limiti yok - tum planlarda sinirsiz)
export const PLAN_LIMITS: Record<PlanTier, Record<LimitId, number>> = {
  free:     { cariler: 35,   urunler: 50,   hesaplar: 5,  personel: 10  },
  pro:      { cariler: 400,  urunler: 300,  hesaplar: 15, personel: 200 },
  business: { cariler: 1000, urunler: 1500, hesaplar: 25, personel: 500 },
};

// Davet limiti (owner haric) - sadece Business
export const INVITE_LIMITS: Record<PlanTier, number> = { free: 0, pro: 0, business: 3 };

export const PLAN_HIERARCHY: Record<PlanTier, number> = { free: 0, pro: 1, business: 2 };

// Foto storage limiti (byte)
export const STORAGE_LIMIT: Record<PlanTier, number> = {
  free: 0,
  pro: 1 * 1024 * 1024 * 1024,     // 1 GB
  business: 2 * 1024 * 1024 * 1024, // 2 GB
};

export const INACTIVE_PHOTO_CLEANUP_DAYS = 90;
export const CLEANUP_WARNING_DAYS = 30;
```

---

## Faz 2: Veritabani Migration

### `supabase/migrations/YYYYMMDD_user_subscriptions.sql` (YENI)
```sql
-- 1. Abonelik tablosu
CREATE TABLE user_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  revenuecat_app_user_id TEXT NOT NULL,
  plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'business')),
  status TEXT NOT NULL DEFAULT 'expired',
  product_id TEXT,
  billing_period TEXT CHECK (billing_period IN ('monthly', 'yearly')),
  is_trial BOOLEAN NOT NULL DEFAULT FALSE,
  trial_end_at TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  revenuecat_event_type TEXT,
  last_event_id TEXT,                    -- webhook idempotency icin
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_user_subscription UNIQUE (user_id)
);

-- updated_at otomatik guncelleme trigger'i
CREATE OR REPLACE FUNCTION update_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trg_user_subscriptions_updated_at BEFORE UPDATE ON user_subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE user_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own subscription" ON user_subscriptions
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- 2. Webhook event log (idempotency + debugging)
CREATE TABLE revenuecat_events (
  id TEXT PRIMARY KEY,                   -- RevenueCat event ID veya sha256 hash
  event_type TEXT NOT NULL,
  app_user_id TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,  -- debugging/reporting icin
  product_id TEXT,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Foto asset takibi (storage kota kontrolu - isletme bazli)
CREATE TABLE photo_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,  -- nullable: uploader silinse foto kalir
  isletme_id UUID NOT NULL REFERENCES isletmeler(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  size_bytes BIGINT NOT NULL,
  subscription_expired_at TIMESTAMPTZ,   -- abonelik bittigi an (90 gun sayaci baslangici)
  scheduled_delete_at TIMESTAMPTZ,       -- subscription_expired_at + 90 gun
  deleted_at TIMESTAMPTZ,                -- gercekten silindigi an
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_photo_assets_isletme ON photo_assets(isletme_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_photo_assets_cleanup ON photo_assets(scheduled_delete_at)
  WHERE scheduled_delete_at IS NOT NULL AND deleted_at IS NULL;

-- NOT: Foto kota kontrolu SUM(size_bytes) ile yapilir (ilk versiyon).
-- P2'de performans icin isletmeler.photo_bytes_used counter cache eklenebilir.

ALTER TABLE photo_assets ENABLE ROW LEVEL SECURITY;
-- Sadece SELECT policy: INSERT/DELETE edge function (service_role) ile yapilir
CREATE POLICY "Isletme users can read photos" ON photo_assets
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM isletmeler WHERE id = photo_assets.isletme_id AND user_id = auth.uid())
    OR
    EXISTS (SELECT 1 FROM isletme_users WHERE isletme_id = photo_assets.isletme_id
            AND user_id = auth.uid() AND status = 'active')
  );
-- INSERT/UPDATE/DELETE: Policy yok = client yapamaz. Edge function service_role kullanir.

-- 5. Helper fonksiyonlar (tum SECURITY DEFINER'larda search_path sabitlenir)
CREATE OR REPLACE FUNCTION get_user_plan(p_user_id UUID)
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT plan FROM user_subscriptions
     WHERE user_id = p_user_id
       AND status IN ('active', 'trialing', 'grace_period')
     LIMIT 1),
    'free'
  );
$$;

CREATE OR REPLACE FUNCTION get_isletme_owner_plan(p_isletme_id UUID)
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT get_user_plan(user_id) FROM isletmeler WHERE id = p_isletme_id;
$$;

-- 6. Kayit limiti kontrol fonksiyonu (whitelist + advisory lock)
-- NOT: Islem limiti kaldirildi - tum planlarda sinirsiz
CREATE OR REPLACE FUNCTION check_record_limit(
  p_isletme_id UUID, p_limit_id TEXT
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_plan TEXT; v_count INT; v_limit INT;
BEGIN
  -- Race condition onleme: ayni isletmede ayni anda iki create yarismasin
  PERFORM pg_advisory_xact_lock(hashtext(p_isletme_id::text || ':' || p_limit_id));
  SELECT get_isletme_owner_plan(p_isletme_id) INTO v_plan;
  -- Limit belirleme (plans.ts ile senkron tutulmali)
  v_limit := CASE p_limit_id
    WHEN 'cariler'   THEN CASE v_plan WHEN 'pro' THEN 400 WHEN 'business' THEN 1000 ELSE 35 END
    WHEN 'urunler'   THEN CASE v_plan WHEN 'pro' THEN 300 WHEN 'business' THEN 1500 ELSE 50 END
    WHEN 'hesaplar'  THEN CASE v_plan WHEN 'pro' THEN 15  WHEN 'business' THEN 25   ELSE 5  END
    WHEN 'personel'  THEN CASE v_plan WHEN 'pro' THEN 200 WHEN 'business' THEN 500  ELSE 10 END
    ELSE RAISE EXCEPTION 'Gecersiz limit_id: %', p_limit_id; END CASE;
  -- Whitelist count (dynamic SQL yerine explicit branch)
  IF p_limit_id = 'cariler' THEN
    SELECT COUNT(*) INTO v_count FROM cariler WHERE isletme_id = p_isletme_id;
  ELSIF p_limit_id = 'urunler' THEN
    SELECT COUNT(*) INTO v_count FROM urunler WHERE isletme_id = p_isletme_id;
  ELSIF p_limit_id = 'hesaplar' THEN
    SELECT COUNT(*) INTO v_count FROM hesaplar WHERE isletme_id = p_isletme_id;
  ELSIF p_limit_id = 'personel' THEN
    SELECT COUNT(*) INTO v_count FROM personel WHERE isletme_id = p_isletme_id;
  END IF;
  IF v_count >= v_limit THEN
    RAISE EXCEPTION 'Kayit limitine ulastiniz (% icin maksimum: %)', p_limit_id, v_limit;
  END IF;
END;
$$;
```

### Davet limiti: `create_isletme_invite` RPC guncelleme
Mevcut dosya: `supabase/migrations/20260224000003_multi_user_rpc_audit_log.sql` (satir 8-66)
Yeni migration ile CREATE OR REPLACE:
- Owner kontrolunden sonra (satir 27), plan kontrolu ekle:
```sql
-- Plan bazli davet limiti
DECLARE v_plan TEXT; v_active_count INT; v_max_invite INT;
v_plan := get_user_plan(auth.uid());
SELECT COUNT(*) INTO v_active_count FROM isletme_users
  WHERE isletme_id = p_isletme_id AND status = 'active';
v_max_invite := CASE v_plan WHEN 'business' THEN 3 ELSE 0 END;
IF v_plan != 'business' THEN RAISE EXCEPTION 'Davet olusturmak icin Business plan gerekli'; END IF;
IF v_active_count >= v_max_invite THEN RAISE EXCEPTION 'Davet limitine ulastiniz (maks: %)', v_max_invite; END IF;
```

---

## Faz 3: RevenueCat SDK

### Paket: `npx expo install react-native-purchases`
> Yeni EAS build gerekli. Expo Go calismaz.

### `src/lib/revenuecat.ts` (YENI)
- `configureRevenueCat(appUserId?)` - SDK baslatma
- `loginRevenueCat(appUserId)` - Supabase user ID ile eslestirme
- `logoutRevenueCat()` - cikista temizleme
- `getPlanFromCustomerInfo(info): PlanTier` - entitlement'lardan plan cikarma
- API key: `EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY` env'den

### RevenueCat Entitlements
- `pro` entitlement -> Pro plan
- `business` entitlement -> Business plan
- Entitlement yoksa -> Free

### Product ID'ler (Apple)
- `isletmetakip_pro_monthly` (199 TL)
- `isletmetakip_pro_yearly` (1.990 TL, 7 gun trial)
- `isletmetakip_business_monthly` (399 TL)
- `isletmetakip_business_yearly` (3.990 TL)

---

## Faz 4: Webhook Edge Function

### `supabase/functions/revenuecat-webhook/index.ts` (YENI)
- RevenueCat eventlerini isler: INITIAL_PURCHASE, RENEWAL, CANCELLATION, EXPIRATION, BILLING_ISSUE
- `user_subscriptions` tablosunu UPSERT ile gunceller
- Auth: `Authorization: Bearer <REVENUECAT_WEBHOOK_SECRET>` header kontrolu
- service_role admin client (RLS bypass)
- **Idempotency**: RevenueCat payload'dan `event.id` (veya yoksa `sha256(event_type + app_user_id + product_id + event_timestamp_ms)`) kullanarak `revenuecat_events` tablosuna yaz. INSERT ON CONFLICT DO NOTHING ile duplicate atla.
- Event'ten plan cikartma: product_id'den veya entitlement'lardan
- **Downgrade handling**: Business'tan dusurulunce (business->pro/free):
  - Tum davetli kullanicilari pasife al (isletme_users.status = 'suspended')
  - Log olustur

---

## Faz 5: Hook + Context

### `src/hooks/useSubscription.ts` (YENI)
Ikili kaynak stratejisi:
1. **RevenueCat SDK** (birincil) - gercek zamanli client-side durum
2. **Supabase user_subscriptions** (fallback) - cevrimdisi/hata durumu

Fonksiyonlar:
- `purchase(pkg)` - satin alma islemi
- `restore()` - satin alimlari geri yukleme
- `getOfferings()` - plan listesi (App Store'dan gercek fiyatlar)
- `refresh()` - durumu yenileme
- RevenueCat `addCustomerInfoUpdateListener` ile gercek zamanli guncelleme
- `AppState` listener ile foreground'da otomatik yenileme

### `src/contexts/SubscriptionContext.tsx` (YENI)
- AuthContext pattern'ini takip eder
- `_layout.tsx`'de provider chain: `AuthProvider` > `SubscriptionProvider` > `ToastProvider`
- **Owner**: RevenueCat SDK'dan plan oku (birincil), Supabase fallback
- **Davetli kullanici**: `get_isletme_owner_plan(isletme_id)` RPC ile owner'in planini al
- **Cache**: Son bilinen plan AsyncStorage'da cache'lenir, foreground'da refresh edilir
- **Owner plan degisince**: Davetli bir sonraki foreground'da veya refresh'te yeni plani gorur

### `src/hooks/useFeatureAccess.ts` (YENI)
```typescript
// Ozellik bazli kontrol
canAccess(featureId: FeatureId): boolean
getRequiredPlan(featureId: FeatureId): PlanTier

// Limit bazli kontrol
getLimit(limitId: LimitId): number
isAtLimit(limitId: LimitId, currentCount: number): boolean
getRemainingCount(limitId: LimitId, currentCount: number): number

// Davet limiti
getInviteLimit(): number
canInvite(currentActiveUsers: number): boolean

// Kisa yollar
isPro, isBusiness, isFree
```

### Kayit Sayisi Hook'lari (her entity icin)
Mevcut pattern: `src/hooks/usePendingIslemler.ts:231-253` (`usePendingIslemlerCount`)
```typescript
// Supabase count pattern:
.select('*', { count: 'exact', head: true })
```
Yeni hook'lar (mevcut hook dosyalarina eklenecek):
- `useCarilerCount()` -> `src/hooks/useCariler.ts`
- `useHesaplarCount()` -> `src/hooks/useHesaplar.ts`
- `usePersonelCount()` -> `src/hooks/usePersonel.ts`
- `useUrunlerCount()` -> `src/hooks/useUrunler.ts`

---

## Faz 6: UI Bilesenleri

### `src/components/subscription/SubscriptionGate.tsx` (YENI)
Ozellik bazli gating (acik/kapali):
```tsx
<SubscriptionGate feature="excel_export">
  <ExportButton />
</SubscriptionGate>
```
Pattern: Mevcut `PermissionGate` (`src/components/PermissionGate.tsx`) gibi.

### `src/components/subscription/LimitGate.tsx` (YENI)
Limit bazli gating (kayit sayisi):
```tsx
<LimitGate limitId="cariler" currentCount={cariler.length}>
  <AddCariButton />
</LimitGate>
```
- Limite yaklasildiginda uyari gosterir (ornek: "32/35 cari kullandiniz")
- Limit doluysa "Pro'ya yukselt" butonu gosterir

### `src/components/subscription/UpgradePrompt.tsx` (YENI)
BottomSheet modal:
- Kilitli ozellige tiklandiginda veya limite ulasildiginda gosterilir
- Hangi plan gerektigini gosterir
- "Plani Yukselt" butonu -> paywall sayfasina yonlendirir
- "Daha Sonra" dismiss butonu

### `src/app/ayarlar/abonelik.tsx` (YENI) - Paywall
- Plan karsilastirma tablosu (Free vs Pro vs Business)
- Ozellikler + limitler karsilastirmasi
- Aylik/Yillik toggle
- App Store'dan gercek fiyatlar (getOfferings)
- **Trial eligibility**: RevenueCat SDK'dan `checkTrialOrIntroEligibility` ile kontrol. Eligible ise "7 gun ucretsiz dene" goster, degilse gosterme.
- **Trial copy**: Yillik seciliyken "7 gun ucretsiz deneyin", aylik seciliyken "Deneme yalnizca yillik planda" veya trial badge gizlenir.
- "Abone Ol" butonlari
- "Satin Alimlari Geri Yukle" linki
- **Apple zorunlu metinler**:
  - "Odeme Apple ID hesabinizdan alinir"
  - "Abonelik otomatik yenilenir, donem sonundan en az 24 saat once iptal edebilirsiniz"
  - Kullanim kosullari linki
  - Gizlilik politikasi linki
- **"Abonelikleri Yonet"** linki -> `Linking.openURL('https://apps.apple.com/account/subscriptions')` (iOS sistem sayfasi)

### `src/components/subscription/PlanBadge.tsx` (YENI)
- Kucuk pill badge: "Free" / "Pro" / "Business"
- Trial gostergesi: "Deneme: 5 gun kaldi"
- daha.tsx profil kartinda kullanilir

---

## Faz 7: Feature Gating - Kesin Dosya Konumlari

### Ozellik Bazli (acik/kapali)
| Ozellik | FeatureId | Dosya | Detay |
|---------|-----------|-------|-------|
| Detayli raporlar | `detailed_reports` | `src/app/raporlar/*.tsx` | Rapor sayfalarinda gate (ozet haric) |
| Cari paylasma | `cari_sharing` | Cari detay sayfasi | Paylasma butonu |
| Personel izinleri | `personnel_leaves` | `src/app/personel/[id].tsx` | Izin bolumu |
| Fotograf yukleme | `photo_upload` | `src/hooks/useIslemPhoto.ts` | usePhotoField hook'unda gate |
| Excel export | `excel_export` | `src/components/export/ExportSheet.tsx` | handleExport |
| Excel export (rapor) | `excel_export` | `src/app/raporlar/gelir.tsx`, `gider.tsx` | handleExport |
| Veri import | `data_import` | `src/app/ayarlar/data-import/index.tsx` | Sayfa girisinde gate |
| Multi-user | `multi_user` | `src/app/(tabs)/daha.tsx` | Coklu Kullanici bolumu |
| Bildirimler | `notifications` | Bildirim ayarlari | Zamanlanmis islem hatirlatmalari |
| Toplu personel odeme | `bulk_operations` | `src/app/personel/toplu-odeme.tsx` | Sayfa girisinde gate |
| Toplu personel gider | `bulk_operations` | `src/app/personel/toplu-gider.tsx` | Sayfa girisinde gate |
| Toplu stok giris | `bulk_operations` | `src/app/urunler/toplu-giris.tsx` | Sayfa girisinde gate |
| Toplu stok cikis | `bulk_operations` | `src/app/urunler/toplu-cikis.tsx` | Sayfa girisinde gate |
| Toplu islemler FAB | `bulk_operations` | `src/app/(tabs)/personel.tsx` | FAB menu |
| RBAC | `rbac` | RoleSelector, PermissionEditor | Davet olustururken |

### Limit Bazli (kayit sayisi)
| Entity | LimitId | Dosya | Detay |
|--------|---------|-------|-------|
| Cariler | `cariler` | `src/app/(tabs)/cariler.tsx` | Add butonu |
| Hesaplar | `hesaplar` | `src/app/(tabs)/index.tsx` | Hesap ekleme butonu |
| Personel | `personel` | `src/app/(tabs)/personel.tsx` | Add butonu |
| Urunler | `urunler` | `src/app/urunler/index.tsx` | Urun ekleme butonu |

Her ekleme noktasinda:
1. `use[Entity]Count()` hook ile mevcut kayit sayisini al
2. `isAtLimit(limitId, count)` ile kontrol et
3. Limitte ise `UpgradePrompt` goster
4. Limite yakinsa (%80+) uyari banner'i goster

---

## Faz 8: Mevcut Dosya Degisiklikleri

| Dosya | Degisiklik |
|-------|-----------|
| `src/app/_layout.tsx` | SubscriptionProvider ekleme (AuthProvider'dan sonra) + `ayarlar/abonelik` Stack.Screen |
| `src/app/(tabs)/daha.tsx` | Abonelik menu item (Crown ikonu) + PlanBadge profil kartinda + "Abonelikleri Yonet" linki |
| `src/hooks/useAuth.ts` | signOut'a `logoutRevenueCat()` ekleme |
| `src/lib/queryKeys.ts` | `subscription` + `*Count` query key'leri ekleme |
| `create_isletme_invite` RPC | Plan kontrolu + davet limiti (sadece Business: max 3) |
| `.env.example` | `EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY` ekleme |
| `app.json` | `react-native-purchases` plugin ekleme (expo config plugin) |

---

## Faz 9: i18n
- `src/i18n/locales/tr/subscription.json` (YENI)
- `src/i18n/locales/en/subscription.json` (YENI)
- Plan isimleri, limit mesajlari, upgrade prompt'lari, paywall metinleri, badge etiketleri

---

## Implementasyon Sirasi
1. Tipler + sabitler (`subscription.ts`, `plans.ts`)
2. DB migration (`user_subscriptions` tablosu + helper fonksiyonlar)
3. RevenueCat SDK kurulumu (`npx expo install react-native-purchases`) + `revenuecat.ts`
4. Webhook edge function (`revenuecat-webhook`)
5. `useSubscription` hook + `SubscriptionContext`
6. Kayit sayisi hook'lari (`useCarilerCount`, `useHesaplarCount`, vb.)
7. `useFeatureAccess` hook (ozellik + limit kontrolleri)
8. i18n dosyalari
9. UI bilesenleri (`SubscriptionGate`, `LimitGate`, `UpgradePrompt`, `PlanBadge`)
10. Paywall sayfasi (`ayarlar/abonelik.tsx`)
11. `_layout.tsx` entegrasyonu (provider + route)
12. `daha.tsx` abonelik bolumu + PlanBadge
13. Ozellik gating (raporlar, cari paylasma, personel izinleri, photo, export, import, notifications, toplu islemler)
14. Limit gating (cari, urun, hesap, personel ekleme formlari)
15. Multi-user davet limiti (RPC update + frontend kontrol)
16. `useAuth.ts` logout entegrasyonu
17. `queryKeys.ts` + `.env.example` + `app.json` guncelleme

---

## Harici Kurulum (Kod Oncesi - Manuel Yapilacak)

### 1. RevenueCat Dashboard Kurulumu
1. https://app.revenuecat.com adresinde hesap olustur
2. Yeni proje olustur: "Isletme Takip"
3. iOS uygulamasi ekle:
   - Bundle ID: `com.isletmetakip.app`
   - App Store Connect Shared Secret ekle (asagida)
4. **Entitlements** olustur:
   - `pro` (identifier: `pro`)
   - `business` (identifier: `business`)
5. **Products** ekle (App Store Connect'teki product ID'ler ile esle):
   - `isletmetakip_pro_monthly` -> `pro` entitlement
   - `isletmetakip_pro_yearly` -> `pro` entitlement
   - `isletmetakip_business_monthly` -> `business` entitlement
   - `isletmetakip_business_yearly` -> `business` entitlement
6. **Offerings** olustur:
   - Default offering: 4 package (pro_monthly, pro_yearly, business_monthly, business_yearly)
7. **Webhook** ayarla:
   - URL: `https://<supabase-ref>.supabase.co/functions/v1/revenuecat-webhook`
   - Authorization header: `Bearer <REVENUECAT_WEBHOOK_SECRET>`
8. **API Keys** sekmesinden Apple API key'i kopyala -> `EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY`

### 2. App Store Connect Kurulumu
1. App Store Connect > "Isletme Takip" (Apple ID: 6756860637) > Subscriptions
2. **Subscription Group** olustur: "Isletme Takip Plans"
3. 4 subscription product olustur:
   - `isletmetakip_pro_monthly`: Aylik Pro - 199 TL
   - `isletmetakip_pro_yearly`: Yillik Pro - 1.990 TL, **7 gun ucretsiz deneme** (Introductory Offer)
   - `isletmetakip_business_monthly`: Aylik Business - 399 TL
   - `isletmetakip_business_yearly`: Yillik Business - 3.990 TL
4. Her urun icin:
   - Localization ekle (TR + EN)
   - Review screenshot ekle
5. **App-Specific Shared Secret** olustur:
   - App Store Connect > App > General > App-Specific Shared Secret
   - Bu secret'i RevenueCat dashboard'a gir
6. **Sandbox Test Account** olustur (test icin):
   - Users and Access > Sandbox > Testers > yeni tester ekle

### 3. Supabase Secrets
```bash
supabase secrets set REVENUECAT_WEBHOOK_SECRET=<guclu-rastgele-secret>
```

### 4. Yerel .env
```
EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY=appl_xxxxxxxxxxxx
```

---

## Dogrulama
1. `npx expo install react-native-purchases` + yeni EAS build (`eas build --platform ios`)
2. `supabase db push` ile migration deploy
3. `supabase functions deploy revenuecat-webhook` ile webhook deploy
4. **Free limit testi**: Free kullanici -> 35 cari ekleyince UpgradePrompt gosterilmeli
5. **Limit yaklasmasi**: 28+ cari'de uyari banner'i gosterilmeli (%80)
6. **Rapor gating testi**: Free kullanici -> detayli rapor sayfasina girince paywall yonlendirmesi
7. **Pro satin alma**: Sandbox'ta Pro al -> limitler genisler, raporlar/export/photo/toplu islem acilir
8. **Business satin alma**: Sandbox'ta Business al -> multi-user + RBAC acilir
9. **Davet testi**: Free/Pro -> davet butonu yok/devre disi, Business -> max 3
10. **Davetli plani**: Business owner davet ederse, davetli Business ozelliklerinden faydalanmali
11. **Logout/login**: Abonelik durumu korunmali (RevenueCat SDK cache + Supabase fallback)
12. **Restore purchases**: Cihaz degistirince veya reinstall'da calisir
13. **Webhook testi**: RevenueCat'ten event gonder -> `user_subscriptions` tablosu guncellenmeli
14. **Grace period**: Odeme basarisiz olursa RevenueCat `BILLING_ISSUE` event'i gelir -> status='grace_period' olarak isaretlenir, erisim devam eder. UI'da "Odeme problemi var" banner'i gosterilir. Sure hardcode edilmez, RevenueCat status'une guvenilir.
15. **Expiration**: Abonelik bitince Free'ye dusme, mevcut veriler korunmali
16. **Downgrade testi**: Business->Pro: davetliler pasife dusmeli. Pro->Free: mevcut kayitlar kalir, yeni ekleme engellenir.
17. **Foto silme testi**: Abonelik bitince 90 gun sonra fotolar silinmeli (cron job)

### Performans Notu
- Entity count (`count: 'exact'`): Kucuk/orta olcekte sorun degil
- Foto kota (`SUM(size_bytes)`): Kucuk/orta olcekte sorun degil
- P2'de buyuk olcek icin: `isletme_stats` counter cache tablosu + `photo_bytes_used` counter
