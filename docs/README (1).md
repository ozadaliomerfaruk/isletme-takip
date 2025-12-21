# Restoran Hesap Kitap - Proje Dokümantasyonu

**Son Güncelleme:** 18 Aralık 2024

---

## 📁 Doküman Yapısı

```
/docs
├── README.md              # Bu dosya
├── architecture.md        # Mimari + stack + kararlar + state rules
├── product.md             # Özellikler + kullanıcı akışları
├── roadmap.md             # v1.0 → v3.0 timeline
├── database.md            # Şema + RPC + RLS kuralları
├── compliance.md          # KVKK / GDPR / Store gereksinimleri
└── mvp-scope.md           # MVP'de ne VAR / ne YOK
```

---

## ⭐ Mühendislik Standartları (Herkes Okumalı)

Bu 3 standart `architecture.md` içinde ve **tüm ekip tarafından bilinmeli:**

| Standart | Bölüm | Özet |
|----------|-------|------|
| **Error & Observability** | 8 | Log seviyeleri, crash reporting, error boundary |
| **Migration & Versioning** | 9 | DB migration, RPC versioning, rollback |
| **Permission Tek Kaynak** | 10 | RLS/RPC yetki kontrolü, UI sadece UX |

Her standardın sonunda **ASLA YAPMA** listesi var - bunlar tartışmasız kurallar.

---

## 📖 Doküman Açıklamaları

### 🏗️ architecture.md
**Ne zaman oku:** Teknik karar alırken, yeni geliştirici onboarding

İçerik:
- Technology stack ve versiyon bilgileri
- **State Management Kuralları** (Zustand vs React Query)
- **Offline-Ready Mimari** pattern'leri
- Storage stratejisi (Cloudflare R2)
- Proje yapısı
- Kütüphane kararları ve nedenleri
- **⭐ Error & Observability Standardı** (Bölüm 8)
- **⭐ Migration & Versioning Standardı** (Bölüm 9)
- **⭐ Permission Tek Kaynak Kuralı** (Bölüm 10)

### 📦 product.md
**Ne zaman oku:** Özellik geliştirirken, kullanıcı akışını anlamak için

İçerik:
- Tüm modüllerin detaylı açıklaması
- Kullanıcı akışları (iki akışlı sistemler dahil)
- Özellik detayları ve kullanım senaryoları
- Çoklu kullanıcı ve rol sistemi

### 🗓️ roadmap.md
**Ne zaman oku:** Planlama yaparken, öncelikleri belirlerken

İçerik:
- v1.0 → v3.0 detaylı timeline
- Her versiyonun özellikleri ve teknik eklentileri
- Uluslararası pazar stratejisi
- Lokalizasyon gereksinimleri

### 🗄️ database.md
**Ne zaman oku:** Tablo oluştururken, RPC yazarken

İçerik:
- Base schema pattern (offline-ready)
- Tüm tabloların şeması
- **Bakiye Stratejisi** (stored balance)
- RLS policy şablonları
- RPC fonksiyon örnekleri
- Tablo ilişkileri (ERD)

### ⚖️ compliance.md
**Ne zaman oku:** Store'a submit öncesi, yasal doküman hazırlarken

İçerik:
- KVKK gereksinimleri ve checklist
- GDPR gereksinimleri (v1.2+)
- App Store / Play Store gereksinimleri
- Hazırlanacak dokümanlar listesi
- **Hesap Silme Lifecycle**
- Veri ihlali prosedürü

### ✅ mvp-scope.md
**Ne zaman oku:** MVP geliştirirken, scope tartışmalarında

İçerik:
- MVP'de ne VAR (net liste)
- MVP'de ne YOK (ertelenen özellikler)
- MVP checklist ve timeline
- Anti-pattern'ler

---

## 🔄 Doküman Güncelleme Kuralları

1. **Her özellik değişikliğinde** ilgili dokümanı güncelle
2. **Changelog'a** tarih ve değişikliği ekle
3. **Birbiriyle çelişen** bilgi olmamasına dikkat et
4. **Tek dosyayı şişirme** - gerekirse yeni doküman oluştur

---

## 🚀 Hızlı Başlangıç

### Yeni Geliştirici için:
1. `mvp-scope.md` - Ne yapıyoruz?
2. `architecture.md` - Nasıl yapıyoruz?
3. `database.md` - Veri nasıl?

### Özellik Eklerken:
1. `product.md` - Akış nasıl olmalı?
2. `database.md` - Hangi tablolar?
3. `roadmap.md` - Hangi versiyonda?

### Store'a Submit Öncesi:
1. `compliance.md` - Checklist tamam mı?
2. `mvp-scope.md` - Scope doğru mu?

---

## 📝 Changelog

| Tarih | Değişiklik |
|-------|------------|
| 17.12.2024 | İlk versiyon - 6 doküman oluşturuldu |
| 18.12.2024 | React Query MVP'ye alındı, bakiye stratejisi eklendi, hesap silme lifecycle eklendi, dokümanlar arası tutarlılık düzeltmeleri |
