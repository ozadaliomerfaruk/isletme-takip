# Restoran Hesap Kitap - MVP Kapsam Dokümanı

**Son Güncelleme:** 18 Aralık 2024  
**Versiyon:** v1.0 MVP (Rev 1.1)

---

## 🎯 MVP Felsefesi

```
┌─────────────────────────────────────────────────────────────────┐
│  MVP = Minimum Viable Product                                   │
│                                                                 │
│  Amaç: En kısa sürede çalışan ürün çıkarmak                    │
│  Hedef: İlk kullanıcı feedback'i almak                         │
│  Kural: Şüphe varsa → MVP'den ÇIKAR                            │
└─────────────────────────────────────────────────────────────────┘
```

---

## ✅ MVP'DE VAR (Hafta 1-6)

### Özellikler

| # | Özellik | Detay | Öncelik |
|---|---------|-------|---------|
| 1 | **Auth** | Email/Password login & register | 🔴 Kritik |
| 2 | **Dashboard** | Basit özet (bakiye, son işlemler) | 🔴 Kritik |
| 3 | **Kasa Yönetimi** | Nakit + Banka + Kredi Kartı kasaları | 🔴 Kritik |
| 4 | **Cari Hesap** | Tedarikçi/Müşteri listesi ve bakiye | 🔴 Kritik |
| 5 | **İşlem Girişi** | Gelir / Gider / Ödeme / Tahsilat | 🔴 Kritik |
| 6 | **Personel** | Liste + maaş bilgisi (basit) | 🟡 Önemli |
| 7 | **Kategoriler** | Gelir/Gider kategorileri | 🟡 Önemli |
| 8 | **Ayarlar** | Profil + Çıkış butonu | 🟢 Olmalı |

### Ekranlar

```
MVP EKRANLARI (8 ekran):
├── 🔐 Auth
│   ├── Login
│   └── Register
│
├── 📊 Ana Ekranlar
│   ├── Dashboard (ana sayfa)
│   ├── Kasalar (liste + detay)
│   ├── Cariler (liste + detay)
│   ├── Personel (liste)
│   └── İşlemler (liste + ekleme)
│
└── ⚙️ Ayarlar
    └── Profil & Çıkış
```

### Veritabanı Tabloları

```sql
-- MVP'DE SADECE BU 7 TABLO
├── restaurants      -- Restoran bilgileri
├── profiles         -- Kullanıcı profilleri
├── kasalar          -- Nakit, Banka, Kredi Kartı
├── cariler          -- Tedarikçi/Müşteri
├── islemler         -- Tüm finansal işlemler
├── kategoriler      -- Gelir/Gider kategorileri
└── personel         -- Çalışan bilgileri
```

### Teknik Özellikler

```
MVP TEKNİK SCOPE:
├── ✅ Supabase Auth (Email/Password)
├── ✅ Supabase Database (PostgreSQL)
├── ✅ Row Level Security (RLS)
├── ✅ React Query (server state: Supabase data, cache, loading/error)
├── ✅ Zustand (UI state + geçici form state)
├── ✅ Zod (form validation)
├── ✅ Error Boundary (basit)
├── ✅ ESLint + Prettier
├── ✅ TypeScript strict mode
└── ✅ Expo Router navigation
```

> **MVP Notu:** React Query MVP'de VAR, ancak advanced cache invalidation ve complex optimistic flows YOK. Basit `invalidateQueries` standardı yeterli.

---

## ❌ MVP'DE YOK (Sonraki versiyonlar)

### v1.1'e Ertelenen (Hafta 7-10)

| Özellik | Sebep |
|---------|-------|
| Google/Apple Auth | Complexity |
| Tekrarlayan Ödemeler | MVP'de gerek yok |
| Çek/Senet Takibi | Advanced feature |
| Kalemli Fatura | Complexity |
| Push Notifications | Backend gerekli |
| Deep Linking | Push notification ile gelecek |

### v1.2'ye Ertelenen (Hafta 11-14)

| Özellik | Sebep |
|---------|-------|
| Taksit Takibi | Çek/Senet'ten sonra |
| Kredi Ödeme Hatırlatıcı | Push notification gerekli |
| Arşiv Sistemi | Veri birikince |
| i18n (Çoklu Dil) | Global launch için |
| CI/CD | Ekip büyüyünce |

### v2.0+'ya Ertelenen (Hafta 15+)

| Özellik | Sebep |
|---------|-------|
| Ürün Satış Takibi | Major feature |
| Hammadde Alım Geçmişi | Major feature |
| Demirbaş Takibi | Major feature |
| Grup Rezervasyon | Major feature |
| Çoklu Kullanıcı | Backend complexity |
| Rol/Yetki Sistemi | Çoklu kullanıcı ile |
| Testing (Jest) | Ekip büyüyünce |
| Fotoğraf Yükleme | Storage stratejisi |

### v3.0+'ya Ertelenen (Hafta 27+)

| Özellik | Sebep |
|---------|-------|
| Offline Support | Major architecture |
| Çoklu Şube | Enterprise feature |
| Web Uygulaması | Ayrı proje |
| Excel Import | Nice to have |
| Abonelik Sistemi | Monetization |
| Sentry | 1000+ kullanıcıda |
| PostHog Analytics | 1000+ kullanıcıda |

---

## 📋 MVP Checklist

### Başlamadan Önce

- [ ] Supabase projesi oluştur
- [ ] Expo projesi oluştur
- [ ] Git repo oluştur
- [ ] Gizlilik Politikası hazırla
- [ ] KVKK Aydınlatma Metni hazırla
- [ ] Kullanım Koşulları hazırla

### Backend (Hafta 1)

- [ ] Veritabanı şeması oluştur
- [ ] RLS policies yaz
- [ ] Auth ayarları
- [ ] Temel RPC functions
- [ ] Test verileri

### Frontend (Hafta 2-4)

- [ ] Proje yapısı kur
- [ ] React Query + Zustand setup
- [ ] Auth ekranları
- [ ] Dashboard
- [ ] Kasa modülü
- [ ] Cari modülü
- [ ] Personel modülü
- [ ] İşlem modülü
- [ ] Ayarlar

### Test & Polish (Hafta 5-6)

- [ ] Manuel test
- [ ] Bug fix
- [ ] Performance check
- [ ] Store hazırlığı (screenshots, description)
- [ ] EAS Build test
- [ ] TestFlight / Internal testing

---

## 🚫 MVP Anti-Patterns

```
❌ YAPMA:
├── "Şunu da ekleyelim" → Scope creep
├── "Mükemmel olsun" → Perfectionism
├── "İleride lazım olur" → Over-engineering
├── "Kullanıcılar ister" → Assumption
└── "Rakiplerde var" → Feature envy

✅ YAP:
├── Minimum ile başla
├── Hızlı çıkar
├── Feedback al
├── İtere et
└── Data-driven karar ver
```

---

## ⏱️ MVP Timeline

```
HAFTA 1:
├── Gün 1-2: Supabase setup + Schema
├── Gün 3-4: RLS + Auth
└── Gün 5: Test data + API test

HAFTA 2:
├── Gün 1-2: Proje setup + Auth UI
├── Gün 3-4: Dashboard
└── Gün 5: Kasa modülü başla

HAFTA 3:
├── Gün 1-2: Kasa tamamla
├── Gün 3-4: Cari modülü
└── Gün 5: Buffer

HAFTA 4:
├── Gün 1-2: Personel
├── Gün 3-4: İşlemler
└── Gün 5: Ayarlar + Navigation polish

HAFTA 5:
├── Gün 1-3: Bug fix + Test
├── Gün 4-5: Store prep

HAFTA 6:
├── Gün 1-2: Final test
├── Gün 3: TestFlight submit
├── Gün 4: Play Store internal
└── Gün 5: Buffer / Fix
```

---

## 🎯 MVP Success Metrics

```
BAŞARI KRİTERLERİ:
├── Crash-free rate > 99%
├── 10 beta kullanıcı feedback
├── Core flow çalışıyor (işlem girişi)
├── 5 saniyede açılıyor
└── Yasal dokümanlar tamam
```

---

## Changelog

| Tarih | Değişiklik |
|-------|------------|
| 17.12.2024 | İlk versiyon |
| 18.12.2024 | React Query MVP'ye eklendi, v1.1'den kaldırıldı |
