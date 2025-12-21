# Restoran Hesap Kitap - Yol Haritası

**Son Güncelleme:** 18 Aralık 2024  
**Versiyon:** 1.1

---

## 📅 Genel Bakış

```
┌─────────────────────────────────────────────────────────────────┐
│                        YOL HARİTASI                             │
├─────────────────────────────────────────────────────────────────┤
│  v1.0 MVP      │ Hafta 1-6   │ Türkiye 🇹🇷                     │
│  v1.1 Core     │ Hafta 7-10  │ + Auth + Notifications          │
│  v1.2 Enhanced │ Hafta 11-14 │ + i18n + CI/CD                  │
│  v2.0 Sales    │ Hafta 15-18 │ + Global 🌍 + Testing           │
│  v2.1 Reports  │ Hafta 19-22 │ + Hammadde + Export             │
│  v2.2 Assets   │ Hafta 23-26 │ + Demirbaş + Rezervasyon        │
│  v3.0 Premium  │ Hafta 27+   │ + Offline + Multi-branch        │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🚀 v1.0 - MVP (Hafta 1-6)

**Hedef:** Çalışan minimum ürün + Store'a submit

### Özellikler
- [ ] Supabase kurulumu
- [ ] Auth (email/password)
- [ ] Temel ekranlar (Dashboard, Kasa, Cari, Personel, İşlemler)
- [ ] Kasa yönetimi (nakit, banka, kredi kartı)
- [ ] Cari hesap (tedarikçi/müşteri)
- [ ] Personel listesi
- [ ] Basit işlem girişi (gelir/gider/ödeme/tahsilat)
- [ ] Kategoriler
- [ ] Store'a submit

### Teknik
- [ ] React Query (server state: Supabase data, cache, loading/error)
- [ ] Zustand (UI state + geçici form state)
- [ ] Zod (validation)
- [ ] Error Boundary (basit)
- [ ] ESLint + Prettier
- [ ] EAS Build

### Yasal (ZORUNLU)
- [ ] Gizlilik Politikası
- [ ] KVKK Aydınlatma Metni
- [ ] Kullanım Koşulları
- [ ] Hesap silme özelliği

### Pazar
```
🇹🇷 Türkiye
├── Dil: Türkçe
├── Para: TRY
└── Yasal: KVKK
```

---

## 🔧 v1.1 - Core Features (Hafta 7-10)

**Hedef:** Temel eksikleri tamamla + Push notifications

### Özellikler
- [ ] Google Auth
- [ ] Apple Auth
- [ ] Tekrarlayan ödemeler
- [ ] Çek/Senet takibi
- [ ] Kalemli fatura
- [ ] Push notifications (temel)
- [ ] Personel izin yönetimi (manuel CRUD)

### Teknik
- [ ] 🆕 **Deep Linking**
  - Push notification → ilgili ekran
  - URL scheme: `restoranhesapkitap://`
  - Universal links (iOS/Android)

---

## 🌍 v1.2 - Enhanced (Hafta 11-14)

**Hedef:** Uluslararası hazırlık + CI/CD

### Özellikler
- [ ] Taksit takibi
- [ ] Kredi ödeme hatırlatıcı (banka kredisi)
- [ ] Arşiv sistemi
- [ ] Swipe actions
- [ ] Arama fonksiyonu

### Teknik
- [ ] 🌍 **i18n (Çoklu Dil)**
  - Kütüphane: react-i18next
  - Diller: Türkçe (varsayılan) + İngilizce
  - Cihaz diline göre otomatik seçim
  - Uygulama içi dil değiştirme
- [ ] 🔧 **CI/CD**
  - GitHub Actions
  - PR'da otomatik lint/type check
  - Main branch → EAS Build tetikle
  - Otomatik versiyon bump

---

## 💰 v2.0 - Multi-user & Satış (Hafta 15-18)

**Hedef:** Çoklu kullanıcı + Ürün satış + Global launch

### Özellikler
- [ ] Kullanıcı yönetimi
- [ ] Rol/yetki sistemi
- [ ] Activity log
- [ ] **🆕 Ürün Satış Takibi**
  - Ürün tanımlama (köfte, pizza, içecek vb.)
  - Günlük satış girişi
  - Satış geçmişi ve analizi
  - En çok satan ürünler raporu
  - İKİ AKIŞ:
    - Cari üzerinden satış → kasayı etkiler
    - Direkt satış ekranı → sadece takip

### Teknik
- [ ] 🧪 **Testing Altyapısı**
  - Jest (unit tests)
  - React Native Testing Library
  - Kritik flowlar için coverage
  - CI'da otomatik test

### Pazar
```
🌍 Global Launch
├── 🇺🇸 ABD
├── 🇬🇧 İngiltere
├── 🇦🇺 Avustralya
├── 🇨🇦 Kanada
└── 🇪🇺 AB (İngilizce)

Yasal: + GDPR uyumu
```

---

## 📊 v2.1 - Reports & Hammadde (Hafta 19-22)

**Hedef:** Detaylı raporlar + Hammadde takibi

### Özellikler
- [ ] Detaylı raporlar
- [ ] Grafikler/chartlar
- [ ] PDF export
- [ ] Excel export
- [ ] **🆕 Hammadde Alım Geçmişi**
  - Hammadde tanımlama (et, sebze, baharat vb.)
  - Alış kaydı (cariden alınca opsiyonel bağlantı)
  - Alım geçmişi görüntüleme
  - Fiyat değişim takibi
  - Tedarikçi bazlı rapor
  - ⚠️ **STOK TAKİBİ DEĞİL!**
    - ❌ Stok miktarı tutulmaz
    - ❌ Minimum stok uyarısı yok
    - ❌ Otomatik stok düşme yok

---

## 🏢 v2.2 - Demirbaş & Rezervasyon (Hafta 23-26)

**Hedef:** Demirbaş yönetimi + Organizasyon takibi

### Özellikler
- [ ] **🆕 Demirbaş Takibi**
  - Demirbaş tanımlama (buzdolabı, fırın, masa vb.)
  - Alım tarihi ve fiyatı
  - Bakım/onarım harcamaları bağlama
  - Demirbaş bazlı maliyet raporu
  - Garanti takibi
  - ⚠️ Amortisman takibi YOK

- [ ] **🆕 Grup Rezervasyon Sistemi**
  - Müşteri bilgileri
  - Tarih/saat/kişi sayısı
  - Organizasyon tipi (düğün, nişan, doğum günü vb.)
  - Menü ve fiyat bilgisi
  - Takvim görünümü
  - Kapora takibi
  - Ara ödeme + kalan tutar
  - Hatırlatıcı bildirimleri
  - ⚠️ Çakışma kontrolü: Engellemez, sadece UYARI

---

## ⭐ v3.0 - Premium (Hafta 27+)

**Hedef:** Enterprise özellikler + Monetization

### Özellikler
- [ ] Birikim hesabı (döviz/altın)
- [ ] Çoklu şube
- [ ] Excel import
- [ ] Abonelik sistemi
- [ ] Web uygulaması

### Teknik
- [ ] 📴 **Offline Support**
  - WatermelonDB veya MMKV
  - Lokal cache + sync
  - Conflict resolution
- [ ] 🐛 **Sentry** (1000+ kullanıcıda)
  - Crash reporting
  - Source maps
  - Error alerts
- [ ] 📊 **PostHog Analytics**
  - Kullanım analizi
  - Feature flags
  - A/B testing

### Pazar (Opsiyonel)
```
🌍 Ek Pazarlar
├── 🇩🇪 Almanya (Almanca)
├── 🇸🇦 Arap ülkeleri (Arapça)
├── 🇫🇷 Fransa (Fransızca)
└── 🇪🇸 İspanya/Latin Amerika (İspanyolca)
```

---

## 🌍 Uluslararası Pazar Stratejisi

### Faz 1 - MVP (Türkiye)
```
├── Dil: Türkçe
├── Para birimi: TRY
├── Store: Türkiye App Store & Play Store
└── Yasal: KVKK uyumlu
```

### Faz 2 - v1.2/v2.0 (İngilizce Pazarlar)
```
├── Diller: Türkçe + İngilizce
├── Para birimleri: TRY, USD, EUR, GBP
├── Hedef ülkeler:
│   ├── 🇺🇸 ABD (en büyük pazar)
│   ├── 🇬🇧 İngiltere
│   ├── 🇦🇺 Avustralya
│   ├── 🇨🇦 Kanada
│   └── 🇪🇺 AB ülkeleri
├── Store: Global App Store & Play Store
└── Yasal: GDPR uyumlu
```

### Faz 3 - v3.0+ (Ek Pazarlar)
```
├── 🇩🇪 Almanya (Almanca)
├── 🇸🇦 Arap ülkeleri (Arapça)
├── 🇫🇷 Fransa (Fransızca)
└── 🇪🇸 İspanya/Latin Amerika (İspanyolca)
```

---

## 📋 Lokalizasyon Gereksinimleri

### Dil
```
├── Tüm UI metinleri
├── Hata mesajları
├── Bildirimler
├── Store açıklamaları (ASO)
└── Yasal dokümanlar
```

### Para Birimi
```
├── Dinamik currency formatter
├── Kullanıcı tercihine göre
└── Döviz kuru (opsiyonel)
```

### Tarih/Saat
```
├── Bölgesel format (DD/MM/YYYY vs MM/DD/YYYY)
├── Timezone desteği
└── Haftanın ilk günü (Pazartesi vs Pazar)
```

### Sayılar
```
├── Ondalık ayracı (virgül vs nokta)
└── Binlik ayracı (nokta vs virgül)
```

---

## 🔧 Teknik Altyapı Timeline

```
MVP (Hafta 1-6):
├── React Query (server state)
├── Zustand (UI state)
├── Zod
├── Supabase
├── Error Boundary
├── ESLint + Prettier
└── EAS Build (manuel)

v1.1 (Hafta 7-10):
└── + Deep Linking

v1.2 (Hafta 11-14):
├── + i18n (react-i18next)
└── + CI/CD (GitHub Actions)

v2.0 (Hafta 15-18):
└── + Testing (Jest)

v3.0 (Hafta 27+):
├── + Offline Support
├── + Sentry
└── + PostHog
```

---

## Changelog

| Tarih | Değişiklik |
|-------|------------|
| 17.12.2024 | İlk versiyon |
| 18.12.2024 | React Query MVP'ye taşındı, v1.1'den kaldırıldı |
