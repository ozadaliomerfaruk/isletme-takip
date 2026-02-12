# Restoran Hesap Kitap - Ürün Dokümantasyonu

**Son Güncelleme:** 18 Aralık 2024  
**Versiyon:** 1.1

---

## 1. Proje Genel Bakış

### 1.1 Uygulamanın Amacı
Restoranların günlük finansal işlemlerini takip edebileceği kapsamlı bir mobil muhasebe uygulaması.

### 1.2 Hedef Kitle
- Restoran sahipleri (patron)
- Restoran muhasebecileri
- Satın almacılar
- Kasiyerler

### 1.3 Platform
- iOS + Android (Expo/React Native)
- Planlanan: Web uygulaması (Next.js) - v3.0+

### 1.4 Pazar
- MVP: Türkiye 🇹🇷
- v1.2+: İngilizce pazarlar (ABD, UK, AB)
- v3.0+: Ek diller (Almanca, Arapça vb.)

---

> **Versiyon Notu:** Bölüm 2 (Temel Modüller) MVP kapsamındadır. Bölüm 3 ve sonrası ilgili versiyonlarla etiketlenmiştir.

---

## 2. Temel Modüller (MVP)

### 2.1 Dashboard (Ana Sayfa)

**Slider Panel Yapısı (3 Panel):**

```
PANEL 1 - Genel Durum:
├── Toplam bakiye (tüm kasalar)
├── Bu ay gelir / gider
├── Bekleyen alacaklar
├── Bekleyen borçlar
└── Hızlı işlem butonları

PANEL 2 - Gelir-Gider:
├── Zaman filtresi (günlük/haftalık/aylık/yıllık)
├── Bar chart: Gelir vs Gider
├── Pie chart: Kategori dağılımı
└── Trend line: Zaman bazlı

PANEL 3 - Nakit Akışı:
├── Zaman filtresi
├── Nakit giriş / çıkış
├── Kasa bazlı breakdown
└── Projeksiyon (yaklaşan ödemeler)
```

### 2.2 Kasa Yönetimi

**Kasa Tipleri:**
- 💵 Nakit
- 🏦 Banka
- 💳 Kredi Kartı
- 💰 Birikim [v3.0+]

**Özellikler:**
```
├── Para birimi desteği (TRY, USD, EUR)
├── Kasalar arası transfer
├── Kasa bazlı işlem geçmişi
└── Kredi kartı özel:
    ├── Harcama girişi
    ├── Borç ödeme
    ├── Limit takibi
    └── Ekstre kesim/son ödeme günü
```

### 2.3 Cari Hesap

**Cari Tipleri:**
- 🏭 Tedarikçi (borç veren)
- 👤 Müşteri (alacak veren)

**İşlem Tipleri:**
```
TEDARİKÇİ İÇİN:
├── Alış → Borç artar
├── İade → Borç azalır
├── Ödeme → Borç azalır
└── Kalemli Fatura → Detaylı alış [v1.1+]

MÜŞTERİ İÇİN:
├── Satış → Alacak artar
├── İade → Alacak azalır
├── Tahsilat → Alacak azalır
└── Kalemli Fatura → Detaylı satış [v1.1+]
```

**Özellikler:**
```
├── Bakiye takibi
├── İşlem geçmişi
├── Arşive alma [v1.2+]
├── Filtreleme (tümü/tedarikçi/müşteri)
└── Hesaba dahil etme ayarı
```

### 2.4 Personel

**İşlem Tipleri:**
- 💰 Maaş
- 💵 Avans
- 🎁 Prim
- ⏰ Mesai
- 📋 Tazminat
- 💹 Komisyon
- 💳 Ödeme / Tahsilat

**Özellikler:**
```
├── Bakiye takibi (cari gibi)
├── İzin takibi (yıllık, hastalık, mazeret, ücretsiz) [v1.1+]
├── Hesaba dahil etme ayarı
└── Arşive alma [v1.2+]
```

### 2.5 Kategoriler

```
KATEGORİ YAPISI:
├── Gelir Kategorileri
│   ├── Satış Gelirleri
│   ├── Diğer Gelirler
│   └── [Özel kategoriler]
│
└── Gider Kategorileri
    ├── Hammadde Giderleri
    ├── Personel Giderleri
    ├── Kira & Faturalar
    ├── Ekipman Giderleri
    └── [Özel kategoriler]

Özellikler:
├── Hiyerarşik yapı (ana/alt kategori)
├── Varsayılan kategoriler
├── Özel kategori ekleme
└── Düzenleme/silme
```

### 2.6 İşlemler Listesi

```
├── Tüm işlemleri görüntüleme
├── Tarih filtreleme
├── İşlem tipi filtreleme
├── Kategori filtreleme
├── Kasa filtreleme
└── Arama [v1.2+]
```

---

## 3. Gelişmiş Modüller (v1.1+)

### 3.1 Tekrarlayan Ödemeler

```
Periyot Seçenekleri:
├── Günlük
├── Haftalık
├── 2 Haftalık
├── Aylık
├── 3 Aylık
├── 6 Aylık
└── Yıllık

Özellikler:
├── Başlangıç/bitiş tarihi
├── Hatırlatıcı (X gün önce)
├── Otomatik işlem oluşturma
└── Aktif/Pasif durumu
```

### 3.2 Çek/Senet Takibi

```
├── Çek / Senet ayrımı
├── Alacak / Borç yönü
├── Vade tarihi
├── Durum: Beklemede → Tahsil/Ödendi → Karşılıksız/İptal
└── Cari bağlantısı
```

### 3.3 Taksit Takibi (v1.2+)

```
├── Taksitli işlem oluşturma
├── Taksit ödemesi kaydetme
├── Kalan taksit/tutar takibi
├── Kredi kartı bağlantısı
└── Banka kredisi desteği
```

### 3.4 Kredi Ödeme Hatırlatıcı (v1.2+)

```
Kredi Tanımlama:
├── Kredi adı (İşyeri Kredisi vb.)
├── Banka adı
├── Toplam tutar
├── Taksit sayısı
├── Aylık taksit
├── İlk ödeme tarihi
└── Faiz oranı (opsiyonel)

Hatırlatıcılar:
├── X gün önce push bildirim
├── Ödeme günü bildirim
├── Gecikme uyarısı
└── E-posta (opsiyonel)

Takip:
├── Ödenen/Kalan taksit
├── Kalan borç
├── Ödeme geçmişi
└── Tamamlanma yüzdesi
```

---

## 4. Yeni Özellikler (v2.0+)

### 4.1 🛒 Ürün Satış Takibi (v2.0)

**Amaç:** Lokantada satılan ürünlerin takibi ve analizi

**⚠️ İKİ FARKLI AKIŞ:**

```
AKIŞ 1: Cari Üzerinden Satış (Kasayı ETKİLER ✅)
─────────────────────────────────────────────────
Cariler → Müşteri Seç → Satış → Ürün Seç
  │
  ├── Cari bakiyesi güncellenir
  ├── Gelir/Ciro kaydedilir
  ├── Kasa etkilenir (tahsilat yapılırsa)
  └── Ürün Satış Takibi'ne otomatik yansır

AKIŞ 2: Direkt Ürün Satış Ekranı (Kasayı ETKİLEMEZ ❌)
─────────────────────────────────────────────────────
Ürün Satış → Ürün Seç → Adet Gir → Kaydet
  │
  ├── Sadece takip amaçlı kayıt
  ├── Gelir/gider ETKİLENMEZ
  ├── Kasa ETKİLENMEZ
  └── Raporlarda "Satılan Ürünler" olarak görünür
```

**Kullanım Senaryoları:**
- **Akış 1:** Veresiye müşteriye satış yaptın, hem borç hem ürün kaydı
- **Akış 2:** Günlük kaç porsiyon köfte sattığını takip (kasa zaten girili)

**Özellikler:**
```
Ürün Tanımlama:
├── Ürün adı (Köfte, Pizza, Ayran vb.)
├── Kategori (Ana Yemek, Tatlı, İçecek vb.)
├── Satış fiyatı
├── Birim (porsiyon, adet, bardak)
└── Aktif/Pasif

Raporlar:
├── Günlük/Haftalık/Aylık satış özeti
├── En çok satan ürünler
├── Kategori bazlı dağılım
├── Ürün bazlı gelir analizi
└── Cari vs Direkt ayrımı
```

---

### 4.2 📦 Hammadde Alım Geçmişi (v2.1)

**Amaç:** Tedarikçilerden alınan hammaddelerin geçmişini tutmak

**⚠️ ÖNEMLİ: Bu bir ÜRÜN TAKİP SİSTEMİ DEĞİLDİR!**

```
❌ Ürün miktarı TUTULMAZ
❌ Minimum ürün uyarısı YOK
❌ Ürün sayımı YOK
❌ Otomatik ürün düşme YOK

✅ Sadece "Ne zaman, hangi üründen, ne kadar aldım?" kaydı
✅ Tedarikçi bazlı alım geçmişi
✅ Fiyat değişim takibi
```

**⚠️ İKİ FARKLI AKIŞ:**

```
AKIŞ 1: Cari Üzerinden Alış (Kasayı ETKİLER ✅)
─────────────────────────────────────────────────
Cariler → Tedarikçi Seç → Kalemli Fatura → Hammadde Seç (opsiyonel)
  │
  ├── Cari bakiyesi güncellenir (borç artar)
  ├── Gider kaydedilir
  ├── Kasa etkilenir (ödeme yapılırsa)
  └── Hammadde geçmişine otomatik yansır

AKIŞ 2: Direkt Hammadde Ekranı (Kasayı ETKİLEMEZ ❌)
───────────────────────────────────────────────────
Hammaddeler → Hammadde Seç → Alım Ekle
  │
  ├── Sadece kayıt amaçlı
  ├── Gelir/gider ETKİLENMEZ
  ├── Kasa ETKİLENMEZ
  └── "Şu tarihte şu kadar aldım" notu
```

**Kullanım Senaryoları:**
- **Akış 1:** Metro'dan 50kg et aldın, fatura kestin
- **Akış 2:** Geçmişte ne zaman et aldığını görmek istiyorsun

**Özellikler:**
```
Hammadde Tanımlama:
├── Hammadde adı (Kıyma, Domates vb.)
├── Kategori (Et, Sebze, Kuru Gıda vb.)
├── Birim (kg, adet, litre)
└── Varsayılan tedarikçi

Raporlar:
├── Hammadde bazlı alım geçmişi
├── Tedarikçi bazlı alım raporu
├── Fiyat değişim grafiği
├── En çok alınan hammaddeler
└── Dönemsel karşılaştırma
```

---

### 4.3 🪑 Demirbaş Takibi (v2.2)

**Amaç:** Ekipman ve demirbaş harcamalarının takibi

**⚠️ NOT: Amortisman takibi YOK**

**Özellikler:**
```
Demirbaş Tanımlama:
├── Demirbaş adı (Buzdolabı, Pizza Fırını vb.)
├── Kategori (Mutfak, Mobilya, Elektronik)
├── Marka/Model
├── Alım tarihi ve fiyatı
├── Garanti bitiş tarihi
├── Konum/Şube
└── Seri numarası

Harcama Bağlama:
├── Gider girerken → "Demirbaşa bağla" checkbox
├── Demirbaş seçimi
├── Harcama tipi (Bakım, Onarım, Yedek Parça)
└── Otomatik maliyet hesaplama

Raporlar:
├── Demirbaş listesi (toplam değer)
├── Demirbaş bazlı harcama geçmişi
├── Toplam maliyet (alım + bakım)
├── Garanti yaklaşanlar
└── En çok masraf çıkanlar
```

**Örnek Akış:**
```
1. Patron gider giriyor: "Buzdolabı Tamiri - 2500 TL"
2. Kategori: Ekipman Giderleri
3. "Demirbaşa Bağla" → Sanayi Tipi Buzdolabı seç
4. Kaydet → Demirbaşın toplam maliyeti güncellenir
5. Rapor: "Bu buzdolabı 15.000 TL'ye mal oldu"
```

---

### 4.4 📅 Grup Rezervasyon Sistemi (v2.2)

**Amaç:** Düğün, nişan, doğum günü organizasyonlarının takibi

**Özellikler:**
```
Rezervasyon Bilgileri:
├── Müşteri adı/telefon
├── Organizasyon tipi (Düğün, Nişan, Doğum Günü, Kurumsal)
├── Tarih ve saat
├── Kişi sayısı
├── Salon/Mekan seçimi
├── Menü detayı
├── Kişi başı / Paket fiyat
├── Toplam tutar
└── Notlar

Ödeme Takibi:
├── Kapora tutarı ve tarihi
├── Ara ödemeler
├── Kalan tutar
└── Ödeme yöntemi

Takvim Görünümü:
├── Aylık takvim
├── Dolu/Boş günler
├── Rezervasyon detayı (tıklayınca)
└── ⚠️ Çakışma UYARISI (engellemez!)

Hatırlatıcılar:
├── 1 hafta önce → Hazırlık
├── 1 gün önce → Son kontrol
├── Kapora tarihi yaklaşınca
└── Eksik ödeme uyarısı
```

**Takvim Çakışma Akışı:**
```
1. Patron 15 Ocak'a rezervasyon ekliyor
2. Sistem: "15 Ocak'ta başka etkinlik var mı?"
3. Varsa → ⚠️ "Dikkat: 'Mehmet Bey Nişan' etkinliği var"
4. Patron isterse yine de kaydeder (engellenmez)
5. Takvimde o gün çift işaretli görünür
```

---

## 5. Çoklu Kullanıcı (v2.0+)

### 5.1 Rol Sistemi

```
ROLLER:
├── Admin (Tam yetki)
├── Muhasebeci (Finansal işlemler)
├── Satın Almacı (Tedarikçi + Alış)
└── Kasiyer (Sadece kasa işlemleri)

YETKİ SEVİYELERİ:
├── readonly → Sadece görüntüleme
├── own → Kendi işlemlerini yönetme
└── full → Tam yetki
```

### 5.2 Modül Bazlı Yetkilendirme

```
Her rol için ayrı ayrı:
├── Dashboard: ✅/❌
├── Cariler: readonly/own/full
├── Personel: readonly/own/full
├── Kasalar: readonly/own/full
├── İşlemler: readonly/own/full
├── Raporlar: ✅/❌
├── Ayarlar: ✅/❌
└── Kullanıcı Yönetimi: ✅/❌
```

---

## 6. Raporlar (v2.1+)

### 6.1 Rapor Tipleri

```
FİNANSAL RAPORLAR:
├── Gelir-Gider Özeti
├── Nakit Akışı
├── Kar/Zarar Raporu
├── Kategori Bazlı Analiz
└── Kasa Hareketleri

CARİ RAPORLAR:
├── Alacak Yaşlandırma
├── Borç Yaşlandırma
├── Cari Ekstre
└── Tedarikçi Bazlı Alımlar

PERSONEL RAPORLAR:
├── Maaş Özeti
├── İzin Durumu
└── Personel Maliyetleri

SATIŞ RAPORLAR (v2.0+):
├── Ürün Satış Analizi
├── En Çok Satanlar
└── Dönemsel Karşılaştırma
```

### 6.2 Export Seçenekleri

```
├── PDF (tüm raporlar)
├── Excel (detaylı veriler)
└── Paylaşım (WhatsApp, E-posta)
```

---

## 7. Ayarlar

### 7.1 Profil
- Ad/Soyad
- E-posta
- Şifre değiştirme
- Profil fotoğrafı (v2.0+)

### 7.2 Restoran Bilgileri
- Restoran adı
- Adres
- Telefon
- Vergi bilgileri

### 7.3 Uygulama Ayarları
- Dil seçimi (v1.2+)
- Para birimi
- Tarih formatı
- Bildirim tercihleri

### 7.4 Hesap
- Hesap silme
- Veri export
- Gizlilik ayarları

---

## Changelog

| Tarih | Değişiklik |
|-------|------------|
| 17.12.2024 | İlk versiyon |
| 18.12.2024 | Versiyon notları eklendi, MVP ve ileri versiyon ayrımı netleştirildi |
