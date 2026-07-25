# Para/kur + İngilizce çeviri denetimi — UYGULAMA DURUMU (25 Temmuz 2026)

Kaynak rapor: `docs/I18N-KUR-TUTARLILIK-DENETIMI.md` (73 onaylı bulgu · 39 para-kur / 34 çeviri)

**Durum: 73/73 bulgu kapatıldı.** İki madde bilinçli olarak KISMİ bırakıldı (aşağıda "Açık
kalanlar"). Kod tarafında yapılmayan hiçbir bulgu yok.

## Commit'ler (kronolojik)

| Commit | Kapsam |
|---|---|
| `8ae5a53` | A2 — tutar girişi merkezî parse + **tohum 10x/100x şişmesi (canlı hata)** |
| `f303bca` | A9 kısmi — sabit ₺, personel para birimi, ürün birimi, A12 taksit adedi |
| `d93ea85` | B7 — tarih locale'i tek kaynağa (getLocale) |
| `8741c44` | B3 çoğullar, B8 eksik anahtarlar, B11 terim düzeltmeleri, B5 ürün adı, B10 diyakritik |
| `df48ee7` | B1 — upperTr dile duyarlı + `upperTrData` ayrımı |
| `f678829` | **A1 — çapraz-kur YAZMA yolu** (kredi kartı barı, personel toplu ödeme, ileri tarihli tamamlama) |
| `e7d47df` | A2b — Excel tutar ayrıştırması · A6 — düzenlemede tarihsel kur korunuyor |
| `efb51ba` | A3 — `getIslemCurrency` zinciri · A7 — **beş politika → bir politika** |
| `007f39a` | A4 çevrilmemiş tutar · A5 kayıp işaret · A8 karışık-para toplamlar · A9 kalan · A10 locale birliği |
| `e6819bc` | A11 "Nominal ₺" · A13 kopyalanmış kur matematiği · A14 yüzde/sayı biçimleri |
| `459cb7a` | B2 import motoru `{code, params}` · B4 tek terim sözlüğü · B6 ürün açıklaması · B9 bildirim kanalları |

`9a80f41` bu işin parçası DEĞİL: paralel oturumun tab-bar çalışması (kaybolmaması için ayrı commit'lendi).

## Doğrulama (ANA oturumda koşturuldu — ajan beyanı kanıt değil)

| Kontrol | Sonuç |
|---|---|
| `tsc --noEmit` | **0 hata** |
| `eslint src/` | **0 hata**, 115 uyarı (baseline 115 — yeni uyarı yok) |
| `jest` | **373/373** (denetim öncesi 312 → +61 test) |
| `expo export --platform ios` | temiz bundle, 13.6 MB |
| tr/en anahtar kümeleri | 18 namespace'in hepsinde **birebir aynı** (programatik) |
| tr/en interpolasyon değişkenleri | **birebir aynı** (programatik) |

## Yeni merkezî yardımcılar (bir daha dağılmasın diye)

| Yardımcı | Dosya | Neyi tekilleştirdi |
|---|---|---|
| `resolveIslemLegs` + `CONVERTING_ISLEM_TYPES` | `lib/crossCurrency.ts` | "bu işlem hangi iki para birimini köprülüyor" — 3 yazma yüzeyi |
| `CrossCurrencyRateRequiredError` | `lib/crossCurrency.ts` | tamamlama anında kur isteme sözleşmesi |
| `getIslemCurrency` | `lib/currency.ts` | sunucudaki `COALESCE(hesap, cari, personel, 'TRY')` zinciri |
| `getCurrencyLocale` + `getLocaleSeparators(code?)` | `lib/currency.ts` | para birimi → sayı locale'i (tek eşleme) |
| `formatPercent` | `lib/currency.ts` | yüzde işaret KONUMU + ayraç (22 çağrı yeri) |
| `formatCount` | `lib/currency.ts` | adet/sayaç biçimi (11 çağrı yeri) |
| `createConversionSum` | `hooks/useExchangeRates.ts` | kalem toplamada "kur yok → hariç tut + bayrak" |
| `createRpcTotalConverter` | `hooks/useExchangeRates.ts` | RPC toplamlarında tek dönüştürücü + bayrak |
| `formatConvertedHint` | `hooks/useExchangeRates.ts` | "≈ ₺X" ipucu — çevrilemezse **null** (satır çizilmez) |
| `ConversionIncompleteWarning` | `components/reports/` | bayrağın TEK görsel dili |
| `SkipReason {code, params}` | `lib/excelImport.ts` | import motoru metin üretmiyor |

## Açık kalanlar (bilinçli — kod tarafı bitti)

### 1. İleri tarihli işlemde kur SAKLAMA (A1'in migration bacağı)
`ileri_tarihli_islemler` tablosunda kur kolonu yok. **Yapılan:** kur tamamlama anında
soruluyor (`CrossCurrencyRateRequiredError` → ExchangeRateBar), kredi kartı barında ileri
tarihli + çapraz-kur baştan engelleniyor. **Yapılmayan:** planlama anındaki kuru saklamak.

Bu bir migration gerektiriyor ve proje kuralı gereği (additive kolon · öncesinde
`node scripts/backup.js` · "eski client ne yaşar?" yazılı cevabı) kullanıcı onayı olmadan
uygulanmaz. Ayrıca migration TEK BAŞINA yetmez: eski client'lar yeni kolonları yazmayacağı
için tamamlama anında kur isteme fallback'i her hâlükârda gerekli — o fallback ZATEN yazıldı.
Yani migration bir iyileştirme, eksik değil.

### 2. Yayınlanmış hukuki sayfalar (B5)
`docs/*-en.html` içindeki 21 "Simple Business Finance" → "Small Business Finance" değişikliği
yapıldı ama **deploy edilmedi**: mağazaya linkli sayfalar. Ad teyidi + yayın kullanıcıda.

`src/i18n/locales/en/legal.json` BİLEREK dokunulmadı (B4 terim taramasında da hariç
tutuldu): yayınlanmış sözleşme dili, ürün terminolojisiyle birlikte değiştirilmez.

### 3. Import motorunun rollback/diagnostik metinleri (B2 kapsam kararı)
`useDataImport`'taki `errors.push('Bakiye rollback başarısız...')` gibi ~6 metin Türkçe
kaldı. Bunlar nadir, hata-ayıklama amaçlı ve kullanıcı destek talebine kopyalıyor —
çevirmek kök nedeni gizler. Kullanıcıya normal akışta gösterilen TÜM gerekçeler i18n'de.

### 4. `upperTr` ile gösterilen kullanıcı verisi (denetim sonrası çıkan 3. kategori)
Kategori/ürün/cari adları gösterimde `upperTr` (dile duyarlı) ile büyütülüyor, `upperTrData`
ile değil. **Bu bilinçli:** verinin dili bilinemez, arayüz dili en iyi vekil. `upperTrData`
gösterime uygulanırsa İngilizce veri bozulur ("incoming" → "İNCOMİNG"). Karar
`lib/turkishTextUtils.ts` içinde belgelendi.

## Cihazda test edilecekler

`docs/I18N-KUR-CIHAZ-TESTI.md`
