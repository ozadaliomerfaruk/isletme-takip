# Defteri App - Kodlama Standartları

Bu döküman, uygulama genelinde tutarlılığı sağlamak için takip edilmesi gereken standartları tanımlar.

## İçindekiler

1. [Tarih İşlemleri](#1-tarih-i̇şlemleri)
2. [Para/Tutar İşlemleri](#2-paratutar-i̇şlemleri)
3. [Query Yönetimi](#3-query-yönetimi)
4. [İkon Kullanımı](#4-i̇kon-kullanımı)
5. [Form Validasyonu](#5-form-validasyonu)
6. [Component Yapısı](#6-component-yapısı)
7. [Hata Yönetimi](#7-hata-yönetimi)
8. [Type Safety](#8-type-safety)
9. [Performance Patterns](#9-performance-patterns)
10. [Constants Yönetimi](#10-constants-yönetimi)
11. [Accessibility](#11-accessibility)
12. [Error Boundary](#12-error-boundary)

---

## 1. Tarih İşlemleri

### Kaynak Dosya
`src/lib/date.ts`

### Kurallar

❌ **YAPMA:**
```typescript
// Doğrudan Date API kullanma
new Date().toISOString().split('T')[0]
date.toLocaleDateString('tr-TR')

// ⚠️ KRİTİK: toISOString() KULLANMA - UTC'ye çevirir!
const timestamp = new Date().toISOString(); // YANLIŞ - 3 saat kayar!

// Hardcoded ay isimleri tanımlama
const months = ['Ocak', 'Şubat', ...];
```

✅ **YAP:**
```typescript
import { formatDateForDB, formatDateTimeForDB, formatDateLong, MONTHS_FULL } from '@/lib';

// Veritabanı için sadece tarih (YYYY-MM-DD)
formatDateForDB(new Date()); // "2024-12-31"

// Veritabanı için tarih + saat (TIMEZONE DAHİL)
formatDateTimeForDB(new Date()); // "2024-12-31T14:30:00+03:00"

// Görüntüleme için tarih
formatDateLong(islem.date);   // "31 Aralık 2024"
formatDateMedium(islem.date); // "31 Ara 2024"
formatDateShort(islem.date);  // "31.12.2024"

// Tarih aralığı hesaplama
const { startDate, endDate, label } = getDateRange('monthly', 0);
const { startDate, endDate } = getMonthRange(selectedMonth);
```

### 🌍 Global Timezone Desteği

Bu uygulama dünyanın her yerinden kullanılabilir. Tarih/saat kaydetirken **mutlaka** kullanıcının timezone'u dahil edilmelidir:

```typescript
// ✅ DOĞRU - Kullanıcının cihaz timezone'unu otomatik ekler
formatDateTimeForDB(new Date())
// İstanbul'da: "2024-12-31T14:30:00+03:00"
// New York'ta: "2024-12-31T06:30:00-05:00"
// Tokyo'da:    "2024-12-31T23:30:00+09:00"

// ❌ YANLIŞ - UTC'ye çevirir, timezone kaybeder
new Date().toISOString() // "2024-12-31T11:30:00.000Z" - Her yerde UTC!
```

### Mevcut Fonksiyonlar

| Fonksiyon | Çıktı | Kullanım |
|-----------|-------|----------|
| `formatDateForDB(date)` | `2024-12-31` | Sadece tarih (saat yok) |
| `formatDateTimeForDB(date)` | `2024-12-31T14:30:00+03:00` | **Tarih + saat + timezone** |
| `formatDateLong(date)` | `31 Aralık 2024` | Detay sayfaları |
| `formatDateMedium(date)` | `31 Ara 2024` | Kart başlıkları |
| `formatDateShort(date)` | `31.12.2024` | Tablolar, listeler |
| `formatMonthYear(date)` | `Aralık 2024` | Dönem seçiciler |
| `formatDateTime(date)` | `31.12.2024 14:30` | Loglar |
| `formatRelativeDate(date)` | `Bugün`, `Dün`, `2 gün önce` | Bildirimler |
| `getDateRange(period, offset)` | `{ startDate, endDate, label }` | Rapor filtreleri |
| `getMonthRange(date)` | `{ startDate, endDate, label }` | Ay bazlı raporlar |

---

## 2. Para/Tutar İşlemleri

### Kaynak Dosya
`src/lib/currency.ts`

### Kurallar

❌ **YAPMA:**
```typescript
// Doğrudan parse
parseFloat(amount.replace(',', '.'))
Number(balance)

// Manuel formatlama
`₺${amount.toFixed(2)}`
```

✅ **YAP:**
```typescript
import { parseCurrency, formatCurrency, toNumber, isValidAmount } from '@/lib';

// Kullanıcı girişini parse et
const amount = parseCurrency(inputValue); // "1.234,56" → 1234.56

// Veritabanı değerini number'a çevir
const balance = toNumber(cari.balance); // null-safe

// Görüntüleme
formatCurrency(1234.56);         // "₺1.234,56"
formatCurrencyWithSign(1234.56); // "+₺1.234,56"
formatPercentage(45.5);          // "45,5%"

// Validasyon
if (!isValidAmount(inputValue)) {
  setError('Geçerli bir tutar girin');
}
```

### Bakiye Gösterimi

```typescript
import { getBalanceInfo, toNumber } from '@/lib';

const balance = toNumber(cari.balance);
const { label, colorType } = getBalanceInfo(balance, 'musteri');

// label: "Alacak" veya "Borç"
// colorType: "success" veya "error"
```

---

## 3. Query Yönetimi

### Kaynak Dosya
`src/lib/queryKeys.ts`

### Kurallar

❌ **YAPMA:**
```typescript
// Manuel invalidation listesi
onSuccess: () => {
  queryClient.invalidateQueries({ queryKey: ['islemler'] });
  queryClient.invalidateQueries({ queryKey: ['hesaplar'] });
  queryClient.invalidateQueries({ queryKey: ['cariler'] });
  // ... 10 satır daha
}
```

✅ **YAP:**
```typescript
import { invalidateRelatedQueries } from '@/lib';

// Tek satırda tüm ilgili query'leri invalidate et
onSuccess: () => {
  invalidateRelatedQueries(queryClient, 'islem');
}
```

### Entity Tipleri

| Entity | Invalidate Edilen Query'ler |
|--------|----------------------------|
| `islem` | islemler, hesaplar, cariler, personel, dashboard, month-summary, category-report |
| `hesap` | hesaplar, islemler, month-summary, dashboard |
| `cari` | cariler, islemler, month-summary, dashboard, category-report |
| `personel` | personel, islemler, month-summary, dashboard, category-report |
| `kategori` | kategoriler, category-report |
| `nakitAvans` | nakit-avanslar, nakit-avans, hesaplar, hesap, month-summary, dashboard, islemler |

### Query Key Factory Pattern

Yeni entity eklerken `queryKeys.ts` dosyasına ekleme yapın:

```typescript
// src/lib/queryKeys.ts
export const queryKeys = {
  // Mevcut key'ler...

  yeniEntity: {
    all: () => ['yeni-entity'] as const,
    detail: (id: string) => ['yeni-entity', id] as const,
    byParent: (parentId: string, isletmeId: string) =>
      ['yeni-entity', 'parent', parentId, isletmeId] as const,
  },
};

// invalidationMap'e de ekleyin
export const invalidationMap: Record<string, string[]> = {
  // ...
  yeniEntity: ['yeni-entity', 'ilgili-query-1', 'ilgili-query-2'],
};
```

---

## 4. İkon Kullanımı

### Kaynak Dosya
`src/lib/icons.tsx`

### Kurallar

❌ **YAPMA:**
```typescript
// Her component'ta aynı switch statement
const getHesapIcon = (type) => {
  switch (type) {
    case 'nakit': return <Wallet />;
    // ...
  }
};
```

✅ **YAP:**
```typescript
import { getHesapIconConfig, getIslemIconConfig } from '@/lib';

// Hesap ikonu
const { icon, color, backgroundColor } = getHesapIconConfig(hesap.type);

// İşlem ikonu
const { icon, backgroundColor } = getIslemIconConfig(islem.type);

// İşlem tutar rengi
const amountColor = getIslemAmountColor(islem.type); // 'success' | 'error' | ...
const prefix = getIslemAmountPrefix(islem.type);     // '+' | '-' | ''
```

---

## 5. Form Validasyonu

### Kaynak Dosya
`src/lib/validation.ts`

### Kurallar

❌ **YAPMA:**
```typescript
// Her formda ayrı validasyon fonksiyonu
const validate = () => {
  const newErrors = {};
  if (!name.trim()) newErrors.name = 'Ad zorunludur';
  // ...
};
```

✅ **YAP:**
```typescript
import { required, validAmount, validateFields } from '@/lib';

// Tek alan validasyonu
const result = required(name, 'Ad');
if (!result.isValid) {
  setError(result.error);
}

// Çoklu alan validasyonu
const errors = validateFields({
  name: { value: name, validators: [(v) => required(v, 'Ad')] },
  amount: { value: amount, validators: [validAmount] },
});

if (Object.keys(errors).length > 0) {
  setErrors(errors);
  return;
}
```

### Hazır Validatörler

| Fonksiyon | Kullanım |
|-----------|----------|
| `required(value, fieldName)` | Zorunlu alan |
| `minLength(value, min, fieldName)` | Minimum uzunluk |
| `validAmount(value)` | Geçerli tutar (> 0) |
| `validBalance(value)` | Geçerli bakiye (≥ 0 veya < 0) |
| `validEmail(value)` | E-posta formatı |
| `validPhone(value)` | Telefon formatı |
| `requiredSelection(value, fieldName)` | Dropdown seçimi |

---

## 6. Component Yapısı

### Import Sırası

```typescript
// 1. React ve React Native
import { useState, useEffect, useMemo } from 'react';
import { View, StyleSheet } from 'react-native';

// 2. Expo ve üçüncü parti
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

// 3. İkonlar
import { Wallet, Plus } from 'lucide-react-native';

// 4. Dahili componentler ve UI
import { Text, Card, Button } from '@/components/ui';

// 5. Constants
import { colors } from '@/constants/colors';
import { spacing } from '@/constants/spacing';

// 6. Utility fonksiyonları
import { formatCurrency, formatDateShort } from '@/lib';

// 7. Hooks
import { useIslemler } from '@/hooks/useIslemler';

// 8. Types
import { IslemType } from '@/types/database';
```

### Loading State

```typescript
// Her zaman isletmeLoading'i kontrol et
const { data, isLoading } = useIslemler();

// Loading gösterimi
if (isLoading) {
  return (
    <View style={styles.loadingContainer}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}
```

### Empty State

```typescript
import { EmptyState } from '@/components/ui';

{items.length === 0 ? (
  <EmptyState
    icon={<Receipt size={48} color={colors.textMuted} />}
    title="İşlem bulunamadı"
    description="Henüz işlem eklenmemiş"
    actionLabel="İşlem Ekle"
    onAction={() => router.push('/islemler/ekle')}
  />
) : (
  // Liste render
)}
```

---

## 7. Hata Yönetimi

### Form Submit

```typescript
const handleSubmit = async () => {
  if (!validate()) return;

  try {
    await mutation.mutateAsync(data);
    Alert.alert('Başarılı', 'İşlem kaydedildi', [
      { text: 'Tamam', onPress: () => router.back() },
    ]);
  } catch (error: any) {
    Alert.alert('Hata', error.message || 'İşlem eklenemedi');
  }
};
```

### Button Loading State

```typescript
<Button
  variant="primary"
  size="lg"
  loading={mutation.isPending}  // Her zaman loading state göster
  onPress={handleSubmit}
>
  Kaydet
</Button>
```

---

## Dosya Yapısı

```
src/
├── lib/
│   ├── index.ts          # Merkezi export
│   ├── date.ts           # Tarih işlemleri
│   ├── currency.ts       # Para işlemleri
│   ├── queryKeys.ts      # Query key ve invalidation
│   ├── icons.tsx         # İkon yardımcıları
│   ├── validation.ts     # Form validasyonu
│   ├── supabase.ts       # Supabase client
│   ├── supabaseErrors.ts # Supabase error handling
│   ├── queryClient.ts    # React Query client
│   └── utils.ts          # Diğer yardımcılar
├── constants/
│   ├── colors.ts         # Renk paleti
│   ├── spacing.ts        # Spacing değerleri
│   ├── config.ts         # Uygulama config (magic numbers)
│   └── islemTypes.ts     # İşlem tip tanımları
├── components/
│   ├── ErrorBoundary.tsx # Global error boundary
│   └── ui/
│       ├── index.ts      # UI component export
│       ├── Text.tsx      # Typography
│       ├── Card.tsx      # Kart component
│       ├── Button.tsx    # Button component (accessibility)
│       └── ...
└── hooks/
    ├── useIslemler.ts    # İşlem CRUD
    ├── useCariler.ts     # Cari CRUD
    ├── useHesaplar.ts    # Hesap CRUD
    ├── useNakitAvans.ts  # Nakit Avans CRUD
    └── ...
```

---

## 8. Type Safety

### Kurallar

❌ **YAPMA:**
```typescript
// Type assertion kullanma
router.push('/ayarlar/hesap-sil' as any);

// Null/undefined kontrolü yapmadan erişim
return islem.personel.first_name;

// Any type kullanma
const data: any = response.data;
```

✅ **YAP:**
```typescript
// Object syntax ile route push
router.push({ pathname: '/ayarlar/hesap-sil' });

// Optional chaining ve nullish coalescing
return `${islem.personel?.first_name ?? ''} ${islem.personel?.last_name ?? ''}`.trim();

// Doğru typing
const data: IslemWithRelations = response.data;
```

### `as any` Yasak

`as any` kullanımı kod kalitesini düşürür ve bug'lara yol açar. Alternatifler:

1. **Type Guard Kullan:**
```typescript
function isIslem(data: unknown): data is Islem {
  return typeof data === 'object' && data !== null && 'id' in data;
}
```

2. **Proper Typing:**
```typescript
// router.push için object syntax
router.push({ pathname: '/sayfa', params: { id: '123' } });
```

3. **Generic Type:**
```typescript
const data = await fetchData<IslemListResponse>();
```

---

## 9. Performance Patterns

### useMemo/useCallback Kullanım Kuralları

**useMemo zorunlu durumlar:**
- Hesaplama yoğun işlemler (map, filter, reduce, sort)
- Derived state hesaplamaları
- Component prop olarak geçirilen objeler

```typescript
// Zorunlu: Hesaplama yoğun
const calculations = useMemo(() => {
  const total = items.reduce((sum, item) => sum + item.amount, 0);
  const average = total / items.length;
  return { total, average };
}, [items]);

// Zorunlu: Child component'a geçirilen referans
const sortedItems = useMemo(
  () => [...items].sort((a, b) => b.date.localeCompare(a.date)),
  [items]
);
```

**useCallback zorunlu durumlar:**
- Scroll handler'ları
- Child component'lara geçirilen callback'ler
- useEffect dependency'leri

```typescript
// Zorunlu: Scroll handler
const handleScroll = useCallback((event) => {
  const offsetX = event.nativeEvent.contentOffset.x;
  // ...
}, [dependency]);

// Zorunlu: Child'a geçirilen callback
const handleItemPress = useCallback((id: string) => {
  router.push({ pathname: '/item', params: { id } });
}, [router]);
```

### Gereksiz State'den Kaçının

❌ **YAPMA:**
```typescript
const [displayValue, setDisplayValue] = useState('');

useEffect(() => {
  setDisplayValue(formatCurrency(value));
}, [value]);
```

✅ **YAP:**
```typescript
// Derived state - useState gereksiz
const displayValue = formatCurrency(value);
```

### Rollback Pattern (Çoklu DB İşlemlerinde)

Birden fazla veritabanı işlemi yapılırken başarısızlık durumunda geri alma:

```typescript
const handleComplexOperation = async () => {
  let step1Completed = false;
  let step2Completed = false;

  try {
    // Step 1
    await updateFirstTable();
    step1Completed = true;

    // Step 2
    await updateSecondTable();
    step2Completed = true;

    // Step 3
    await updateThirdTable();
  } catch (error) {
    // Rollback in reverse order
    if (step2Completed) {
      await rollbackSecondTable();
    }
    if (step1Completed) {
      await rollbackFirstTable();
    }
    throw error;
  }
};
```

---

## 10. Constants Yönetimi

### Kaynak Dosya
`src/constants/config.ts`

### Kurallar

❌ **YAPMA:**
```typescript
// Hardcoded magic numbers
setTimeout(() => {}, 300);
const pageSize = 10;
if (remainingTime < 300) { refreshToken(); }
```

✅ **YAP:**
```typescript
import { CONFIG } from '@/constants/config';

// Merkezi config kullan
setTimeout(() => {}, CONFIG.AUTOFOCUS_DELAY);
const pageSize = CONFIG.DEFAULT_PAGE_LIMIT;
if (remainingTime < CONFIG.TOKEN_REFRESH_THRESHOLD) { refreshToken(); }
```

### Mevcut CONFIG Değerleri

```typescript
export const CONFIG = {
  // Auth & Session
  TOKEN_REFRESH_THRESHOLD: 300,        // 5 dakika (saniye)
  SESSION_REFRESH_INTERVAL: 120000,    // 2 dakika (ms)
  AUTH_TIMEOUT: 30000,                 // 30 saniye (ms)

  // Pagination
  DEFAULT_PAGE_LIMIT: 10,
  CATEGORY_REPORT_LIMIT: 100,

  // Animations
  TRANSACTION_BAR_OPEN_DELAY: 500,     // ms
  AUTOFOCUS_DELAY: 300,                // ms

  // Cache
  QUERY_STALE_TIME: 300000,            // 5 dakika (ms)
  QUERY_CACHE_TIME: 1800000,           // 30 dakika (ms)
} as const;
```

### Yeni Değer Ekleme

```typescript
// 1. config.ts'e ekle
export const CONFIG = {
  // ...
  YENI_DEGER: 1000,
} as const;

// 2. Type güvenliği için ConfigKey type'ı kullanılabilir
export type ConfigKey = keyof typeof CONFIG;
```

---

## 11. Accessibility

### Button Component

Button component'leri accessibility prop'ları destekler:

```typescript
<Button
  variant="primary"
  onPress={handleSubmit}
  accessibilityLabel="Kaydet butonu"
  accessibilityHint="Formu kaydeder ve geri döner"
>
  Kaydet
</Button>
```

**Otomatik Label:** Children string ise otomatik olarak accessibilityLabel olarak kullanılır:

```typescript
// Bu ikisi eşdeğerdir:
<Button>Kaydet</Button>
<Button accessibilityLabel="Kaydet">Kaydet</Button>
```

### Accessibility State

Button component'i otomatik olarak state bilgisini sağlar:

```typescript
// Otomatik accessibilityState
<Button loading={true} disabled={false}>
  {/* accessibilityState={{ disabled: true, busy: true }} */}
</Button>
```

### TouchableOpacity'lerde

```typescript
<TouchableOpacity
  accessibilityRole="button"
  accessibilityLabel="İşlem detayına git"
  accessibilityHint="İşlem detay sayfasını açar"
>
  {/* content */}
</TouchableOpacity>
```

---

## 12. Error Boundary

### Kaynak Dosya
`src/components/ErrorBoundary.tsx`

### Kullanım

Root seviyesinde ErrorBoundary kullanın:

```typescript
// App veya Layout component'inde
import { ErrorBoundary } from '@/components/ErrorBoundary';

export default function RootLayout() {
  return (
    <ErrorBoundary>
      <Stack>
        {/* screens */}
      </Stack>
    </ErrorBoundary>
  );
}
```

### Özel Fallback

```typescript
<ErrorBoundary
  fallback={<CustomErrorScreen />}
  onError={(error, errorInfo) => {
    // Hata raporlama servisi (Sentry, etc.)
    reportError(error, errorInfo);
  }}
>
  {/* content */}
</ErrorBoundary>
```

### Supabase Error Handling

```typescript
import {
  isNoRowsError,
  isForeignKeyError,
  getErrorMessage,
} from '@/lib/supabaseErrors';

try {
  const { data, error } = await supabase.from('table').select().single();

  if (error) {
    if (isNoRowsError(error)) {
      return null; // Normal durum - kayıt yok
    }
    if (isForeignKeyError(error)) {
      Alert.alert('Hata', 'Bu kayıt başka kayıtlarla ilişkili');
      return;
    }
    throw error;
  }
} catch (error) {
  Alert.alert('Hata', getErrorMessage(error));
}
```

---

## Checklist: Güncellenmiş

### Yeni Özellik Eklerken

- [ ] Tarih işlemleri için `@/lib/date` fonksiyonlarını kullandım
- [ ] Para formatlaması için `@/lib/currency` fonksiyonlarını kullandım
- [ ] Query invalidation için `invalidateRelatedQueries` kullandım
- [ ] İkon ve renkler için `@/lib/icons` fonksiyonlarını kullandım
- [ ] Form validasyonu için `@/lib/validation` fonksiyonlarını kullandım
- [ ] Loading state gösterdim
- [ ] Empty state gösterdim
- [ ] Button'a loading prop ekledim
- [ ] Hata mesajlarını Alert.alert ile gösterdim
- [ ] **`as any` kullanmadım**
- [ ] **Optional chaining kullandım (null safety)**
- [ ] **Magic number'ları CONFIG'e taşıdım**
- [ ] **useMemo/useCallback gerekli yerlerde kullandım**
- [ ] **Accessibility label'ları ekledim**
- [ ] **Yeni query key'ler için queryKeys.ts'e factory ekledim**
