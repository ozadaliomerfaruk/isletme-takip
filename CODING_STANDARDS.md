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

// Hardcoded ay isimleri tanımlama
const months = ['Ocak', 'Şubat', ...];
```

✅ **YAP:**
```typescript
import { formatDateForDB, formatDateLong, MONTHS_FULL } from '@/lib';

// Veritabanı için tarih
formatDateForDB(new Date()); // "2024-12-31"

// Görüntüleme için tarih
formatDateLong(islem.date);   // "31 Aralık 2024"
formatDateMedium(islem.date); // "31 Ara 2024"
formatDateShort(islem.date);  // "31.12.2024"

// Tarih aralığı hesaplama
const { startDate, endDate, label } = getDateRange('monthly', 0);
const { startDate, endDate } = getMonthRange(selectedMonth);
```

### Mevcut Fonksiyonlar

| Fonksiyon | Çıktı | Kullanım |
|-----------|-------|----------|
| `formatDateForDB(date)` | `2024-12-31` | Veritabanı kayıt |
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

## Checklist: Yeni Özellik Eklerken

- [ ] Tarih işlemleri için `@/lib/date` fonksiyonlarını kullandım
- [ ] Para formatlaması için `@/lib/currency` fonksiyonlarını kullandım
- [ ] Query invalidation için `invalidateRelatedQueries` kullandım
- [ ] İkon ve renkler için `@/lib/icons` fonksiyonlarını kullandım
- [ ] Form validasyonu için `@/lib/validation` fonksiyonlarını kullandım
- [ ] Loading state gösterdim
- [ ] Empty state gösterdim
- [ ] Button'a loading prop ekledim
- [ ] Hata mesajlarını Alert.alert ile gösterdim

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
│   ├── queryClient.ts    # React Query client
│   └── utils.ts          # Diğer yardımcılar
├── constants/
│   ├── colors.ts         # Renk paleti
│   ├── spacing.ts        # Spacing değerleri
│   └── islemTypes.ts     # İşlem tip tanımları
├── components/ui/
│   ├── index.ts          # UI component export
│   ├── Text.tsx          # Typography
│   ├── Card.tsx          # Kart component
│   ├── Button.tsx        # Button component
│   └── ...
└── hooks/
    ├── useIslemler.ts    # İşlem CRUD
    ├── useCariler.ts     # Cari CRUD
    ├── useHesaplar.ts    # Hesap CRUD
    └── ...
```
