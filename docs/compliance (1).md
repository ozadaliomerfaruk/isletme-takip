# Restoran Hesap Kitap - Yasal Uyumluluk Dokümantasyonu

**Son Güncelleme:** 18 Aralık 2024  
**Versiyon:** 1.1

---

## 📋 Özet

```
┌─────────────────────────────────────────────────────────────────┐
│                    YASAL GEREKSİNİMLER                          │
├─────────────────────────────────────────────────────────────────┤
│  MVP (Türkiye):                                                 │
│  ├── ✅ KVKK Uyumu                                              │
│  ├── ✅ App Store gereksinimleri                                │
│  └── ✅ Play Store gereksinimleri                               │
│                                                                 │
│  v1.2+ (Global):                                                │
│  └── ✅ GDPR Uyumu (AB/UK)                                      │
└─────────────────────────────────────────────────────────────────┘
```

---

## 1. 📱 App Store (iOS) Gereksinimleri

### 1.1 Zorunlu Dokümanlar

| Doküman | Durum | Not |
|---------|-------|-----|
| Gizlilik Politikası | ZORUNLU | Web sitesinde link |
| Kullanım Koşulları | ÖNERİLİR | Opsiyonel ama tavsiye edilir |
| EULA | OPSİYONEL | Apple varsayılanı kullanılabilir |

### 1.2 Gizlilik Politikası İçeriği

```
Gizlilik Politikası İçermeli:
├── Hangi verilerin toplandığı
├── Verilerin nasıl kullanıldığı
├── Üçüncü taraflarla paylaşım
├── Veri saklama süresi
└── Kullanıcı hakları
```

### 1.3 Teknik Gereksinimler

```
ZORUNLU:
├── Hesap silme özelliği (Haziran 2022'den beri)
│   ├── Uygulama içinden hesap silme
│   ├── Web sitesinden hesap silme seçeneği
│   └── Silinen verilerin ne olacağının açıklaması
│
├── App Privacy Labels (App Store Connect'te)
│   ├── Toplanan veri tipleri
│   ├── Tracking yapılıp yapılmadığı
│   └── Üçüncü taraf SDK'ları
│
└── Minimum iOS sürümü: iOS 15+ önerilir

OPSİYONEL (Bizde yok):
└── AppTrackingTransparency (reklam izleme - gerekli değil)
```

### 1.4 App Privacy Labels Checklist

```
TOPLANAN VERİLER:
├── İletişim Bilgileri
│   ├── ✅ E-posta adresi (hesap için)
│   └── ⚠️ Telefon (opsiyonel)
│
├── Kimlik Bilgileri
│   └── ✅ Ad, soyad
│
├── Kullanım Verileri
│   └── ❌ Yok (MVP'de analytics yok)
│
├── Finansal Veriler
│   └── ❌ Kullanıcının ödeme bilgisi tutulmaz
│       (İş verileri kullanıcının kendi restoranına ait)
│
└── Tracking
    └── ❌ Hayır (reklam yok)
```

---

## 2. 🤖 Google Play Store Gereksinimleri

### 2.1 Zorunlu Dokümanlar

| Doküman | Konum | Not |
|---------|-------|-----|
| Gizlilik Politikası | Store listesi + Uygulama içi | Türkçe zorunlu |
| Data Safety Form | Play Console | Aşağıda detaylı |

### 2.2 Data Safety Form

```
Play Console'da Doldurulacak:

1. VERİ TOPLAMA
   ├── E-posta: ✅ Evet (hesap için)
   ├── İsim: ✅ Evet (profil için)
   ├── Telefon: ⚠️ Opsiyonel
   └── Konum: ❌ Hayır

2. VERİ ŞİFRELEME
   └── ✅ Evet (HTTPS + Supabase şifreleme)

3. VERİ PAYLAŞIMI
   └── ❌ Üçüncü taraflarla paylaşılmıyor

4. VERİ SİLME
   └── ✅ Kullanıcı talep edebilir (30 gün içinde)

5. ÇOCUKLARA YÖNELİK
   └── ❌ Hayır (iş uygulaması)
```

### 2.3 Teknik Gereksinimler

```
ZORUNLU:
├── Hesap silme özelliği (Mayıs 2024'ten beri)
│   ├── Uygulama içinden hesap silme
│   ├── Web sitesinden alternatif
│   └── Data Safety Form'da beyan
│
├── Target SDK: Android 13+ (API 33)
│
└── 64-bit desteği: ZORUNLU

EAS BUILD İLE EXPO:
└── Tüm bu gereksinimler otomatik karşılanır
```

---

## 3. 🇹🇷 KVKK (Kişisel Verilerin Korunması Kanunu)

### 3.1 Zorunlu Yükümlülükler

#### 3.1.1 Aydınlatma Metni

```
İÇERMESİ GEREKENLER:
├── Veri sorumlusunun kimliği
│   └── Şirket/şahıs adı, adres, iletişim
│
├── Hangi kişisel veriler işleniyor
│   ├── Kimlik: Ad, soyad
│   ├── İletişim: E-posta, telefon
│   └── Hesap: Kullanıcı adı, şifre (hashlenmiş)
│
├── İşleme amaçları
│   ├── Hesap oluşturma ve yönetimi
│   ├── Hizmet sunumu
│   └── Destek hizmetleri
│
├── Verilerin kimlere aktarılabileceği
│   └── Supabase (altyapı sağlayıcı, ABD)
│
├── Veri toplama yöntemi ve hukuki sebebi
│   └── Sözleşmenin ifası (Madde 5/2-c)
│
└── İlgili kişinin hakları
    └── KVKK Madde 11
```

#### 3.1.2 İlgili Kişi Hakları (Madde 11)

```
KULLANICININ HAKLARI:
├── Kişisel verilerin işlenip işlenmediğini öğrenme
├── İşlenmişse buna ilişkin bilgi talep etme
├── İşlenme amacını öğrenme
├── Yurt içi/dışı aktarılan üçüncü kişileri bilme
├── Eksik/yanlış işlenmişse düzeltilmesini isteme
├── Silinmesini/yok edilmesini isteme
└── İtiraz hakkı
```

#### 3.1.3 Açık Rıza Gereken Durumlar

```
AÇIK RIZA GEREKLİ:
├── Pazarlama amaçlı iletişim
├── Üçüncü taraflarla paylaşım (hizmet dışı)
└── Özel nitelikli veriler (sağlık, din vb. - bizde yok)

BİZİM UYGULAMAMIZDA:
└── Sadece pazarlama e-postası için açık rıza gerekli
    (MVP'de pazarlama yok, gerekirse v1.1+)
```

### 3.2 VERBİS Kaydı

```
VERBİS KAYDI ZORUNLU MU?

KRİTERLER:
├── Yıllık ciro 25 milyon TL üzeri → ZORUNLU
├── 50+ çalışan → ZORUNLU
└── Yukarıdakiler yoksa → MUAF

BİZİM DURUM:
└── Başlangıçta MUAF (küçük işletme)
└── Büyüyünce tekrar değerlendirmeli
```

### 3.3 İşlenen Veriler

```
KİŞİSEL VERİLER (KVKK kapsamında):
├── Kimlik: Ad, soyad
├── İletişim: E-posta, telefon (opsiyonel)
├── Hesap: Kullanıcı adı, şifre (hashlenmiş)
└── Cihaz: Device ID (anonim - ileride analytics için)

İŞ VERİLERİ (Kişisel DEĞİL ama gizli):
├── Finansal işlemler
├── Cari hesaplar
├── Personel bilgileri (kullanıcının çalışanları)
└── Kasa bakiyeleri

NOT: İş verileri kullanıcının KENDİ verileridir,
     biz sadece saklama hizmeti veriyoruz.
```

---

## 4. 🇪🇺 GDPR (v1.2+ için - AB/UK pazarları)

### 4.1 GDPR vs KVKK Farkları

| Konu | KVKK | GDPR |
|------|------|------|
| Kapsam | Türkiye | AB + UK |
| Ceza | 2M TL'ye kadar | 20M€ veya cironun %4'ü |
| Veri taşınabilirliği | Var (sınırlı) | Zorunlu |
| DPO gereksinimi | Bazı durumlar | Daha geniş |
| İhlal bildirimi | 72 saat | 72 saat |

### 4.2 Ek Gereksinimler

```
GDPR EK GEREKSİNİMLER:
├── Privacy by Design (tasarımda gizlilik)
├── Data Processing Agreement (Supabase ile var)
├── Right to data portability (veri export)
├── Consent management (açık rıza takibi)
└── AB dışına veri aktarımı için SCCs

UYGULAMA İÇİN YAPILACAKLAR:
├── Privacy Policy'ye GDPR bölümü ekle
├── Kullanıcı verilerini export etme özelliği (JSON/CSV)
├── EU/UK App Store için ayrı privacy labels
└── Supabase DPA'sını kontrol et (var)
```

### 4.3 AB Kullanıcıları İçin Ek Haklar

```
GDPR Madde 15-22:
├── Erişim hakkı (verilerin kopyasını alma)
├── Düzeltme hakkı
├── Silme hakkı ("unutulma hakkı")
├── İşleme kısıtlama hakkı
├── Veri taşınabilirliği (JSON/CSV export)
├── İtiraz hakkı
└── Otomatik karar alma/profillemeye itiraz
```

---

## 5. 📝 Hazırlanması Gereken Dokümanlar

### 5.1 MVP Öncesi (ZORUNLU)

| # | Doküman | Dil | Konum |
|---|---------|-----|-------|
| 1 | Gizlilik Politikası | TR | Web + Uygulama |
| 2 | KVKK Aydınlatma Metni | TR | Kayıt ekranı |
| 3 | Kullanım Koşulları | TR | Web + Uygulama |
| 4 | Hesap Silme Prosedürü | TR | Ayarlar + Web form |

### 5.2 Doküman Detayları

#### 5.2.1 Gizlilik Politikası

```
İÇERİK:
├── Veri sorumlusu bilgileri
├── Toplanan veriler ve amaçları
├── Veri saklama süresi
├── Üçüncü taraf paylaşımı (Supabase)
├── Kullanıcı hakları
├── Çerezler (web varsa)
├── Değişiklik bildirimi
└── İletişim bilgileri

KONUM:
├── https://[domain]/gizlilik-politikasi
├── Uygulama > Ayarlar > Yasal > Gizlilik Politikası
└── Store listesinde Privacy Policy URL
```

#### 5.2.2 KVKK Aydınlatma Metni

```
İÇERİK:
├── Veri sorumlusu kimliği
├── İşlenen kişisel veriler
├── İşleme amaçları
├── Hukuki dayanak
├── Aktarım yapılan taraflar
├── Veri toplama yöntemi
├── Saklama süresi
└── İlgili kişi hakları (Madde 11)

GÖSTERME ZAMANI:
├── Kayıt ekranında (register öncesi)
├── "Okudum, kabul ediyorum" checkbox
└── Kabul etmeden kayıt olamaz
```

#### 5.2.3 Kullanım Koşulları

```
İÇERİK:
├── Hizmet kapsamı
├── Kullanım şartları
├── Kullanıcı sorumlulukları
├── Yasaklı davranışlar
├── Fikri mülkiyet hakları
├── Sorumluluk reddi
├── Hizmet değişikliği/sonlandırma
├── Uygulanacak hukuk
└── Uyuşmazlık çözümü
```

#### 5.2.4 Hesap Silme Prosedürü

```
UYGULAMA İÇİ:
├── Ayarlar > Hesap > Hesabımı Sil
├── Şifre onayı iste
├── "Tüm verileriniz silinecektir" uyarısı
├── 30 gün bekleme süresi (opsiyonel)
└── Onay e-postası gönder

WEB ALTERNATİFİ:
├── https://[domain]/hesap-silme-talebi
├── E-posta + isim ile form
├── 30 gün içinde işlem
└── Onay e-postası
```

#### 5.2.5 Hesap Silme Lifecycle (v1.0 MVP)

```
LIFECYCLE AKIŞI:

1️⃣ SİLME TALEBİ ALINIR
   ├── Kullanıcı: Ayarlar > Hesap > Hesabımı Sil
   ├── Şifre doğrulama istenir
   ├── Son uyarı gösterilir
   └── Onay e-postası gönderilir

2️⃣ BEKLEME/İPTAL PENCERESİ (30 gün)
   ├── Kullanıcı bu sürede talebini geri alabilir
   ├── Hesap "deaktif" durumuna alınır
   ├── Login engellenebilir veya uyarı gösterilebilir
   └── Veriler henüz silinmez

3️⃣ SÜRE SONUNDA KALICI SİLME
   ├── Profil ve kimlik bilgileri silinir/anonimleştirilir
   ├── Restoran ve iş verileri silinir:
   │   ├── kasalar
   │   ├── cariler
   │   ├── personel
   │   ├── islemler
   │   └── kategoriler
   ├── Auth user kaydı silinir
   └── "Silme tamamlandı" e-postası gönderilir

4️⃣ YEDEKLER (BACKUP) NOTU
   ├── Sistem yedeklerinde veriler kısa süre kalabilir
   ├── Yedekler sadece felaket kurtarma içindir
   └── Yedekten tekil kullanıcı verisi geri getirme desteklenmez (MVP)

TEKNİK UYGULAMA:
├── deleted_at alanı ile soft delete
├── 30 gün sonra scheduled job ile hard delete
└── Veya manuel admin işlemi ile temizlik
```

---

## 6. ⚠️ Kritik Uyarılar

### 6.1 YAPILMAMASI Gerekenler

```
❌ YASAKLAR:
├── Kullanıcı izni olmadan veri toplama
├── Toplanan verileri belirtmeden paylaşma
├── Hesap silme olmadan store'a submit
├── Analytics için rıza almadan tracking
├── Çocuk verilerini ebeveyn izni olmadan işleme
├── Veri ihlalini gizleme
└── Minimum veri ilkesini ihlal etme
```

### 6.2 YAPILMASI Gerekenler

```
✅ ZORUNLU:
├── Kayıt öncesi aydınlatma metni göster
├── Gizlilik politikasını güncel tut
├── Hesap silme işlemini 30 gün içinde tamamla
├── Veri ihlali olursa 72 saat içinde bildir
├── Kullanıcı verilerini şifreli sakla (HTTPS + DB)
├── Minimum veri topla (sadece gerekli olanlar)
├── Erişim kayıtları tut (kim ne zaman erişti)
└── Yılda bir gizlilik politikasını gözden geçir
```

---

## 7. Veri İhlali Prosedürü

```
VERİ İHLALİ OLURSA:

1. TESPİT (0-24 saat)
   ├── İhlalin kapsamını belirle
   ├── Etkilenen kullanıcıları tespit et
   └── Güvenlik açığını kapat

2. BİLDİRİM (24-72 saat)
   ├── KVKK Kurulu'na bildir (72 saat içinde)
   ├── Etkilenen kullanıcılara bildir
   └── Alınan önlemleri açıkla

3. DOKÜMANTASYON
   ├── İhlal raporu hazırla
   ├── Alınan önlemleri belgele
   └── Tekrarını önlemek için aksiyon planı

KVKK BİLDİRİM:
├── Online: https://kvkk.gov.tr/veri-ihlali
├── Süre: 72 saat içinde
└── İçerik: İhlal detayı, etkilenenler, alınan önlemler
```

---

## 8. Checklist

### 8.1 MVP Öncesi Checklist

- [ ] Gizlilik Politikası hazırlandı
- [ ] KVKK Aydınlatma Metni hazırlandı
- [ ] Kullanım Koşulları hazırlandı
- [ ] Web sitesinde dokümanlar yayınlandı
- [ ] Uygulama içi linkler eklendi
- [ ] Kayıt ekranında KVKK onayı var
- [ ] Hesap silme özelliği çalışıyor
- [ ] Hesap silme lifecycle dokümante edildi
- [ ] App Store Privacy Labels dolduruldu
- [ ] Play Store Data Safety Form dolduruldu
- [ ] Store listelerinde Privacy Policy URL var

### 8.2 v1.2+ Checklist (GDPR)

- [ ] Privacy Policy'ye GDPR bölümü eklendi
- [ ] Veri export özelliği eklendi (JSON/CSV)
- [ ] Consent management eklendi
- [ ] EU/UK için ayrı store listesi hazırlandı
- [ ] Supabase DPA kontrol edildi

---

## Changelog

| Tarih | Değişiklik |
|-------|------------|
| 17.12.2024 | İlk versiyon |
| 18.12.2024 | Hesap silme lifecycle bölümü eklendi (5.2.5) |
