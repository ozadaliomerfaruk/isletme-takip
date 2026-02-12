# Fotoğrafla Ürün İçe Aktarma (OCR) - Plan

## Kısa Cevap

**Evet, ücretsiz yapılabilir.** Google ML Kit (on-device OCR) ile fotoğraftan metin okuma tamamen ücretsiz ve internet gerektirmez. **Metin okuma kolay kısım, asıl zorluk faturanın yapısını anlamak.** Yarı-otomatik sistem: OCR okur, parser tahmin eder, kullanıcı kontrol edip düzeltir.

---

## OCR Kütüphanesi: `rn-mlkit-ocr`

| Özellik | Detay |
|---------|-------|
| Fiyat | Ücretsiz |
| Çalışma | On-device (internet gereksiz) |
| Türkçe | Latin alfabe - ç, ğ, ı, ö, ş, ü tanır |
| Expo uyumu | Config plugin var, EAS Build ile çalışır |
| New Arch | Uyumlu (`newArchEnabled: true`) |
| Boyut etkisi | ~5MB (sadece Latin model) |
| Sonuç yapısı | Blok > Satır > Eleman + bounding box |

**Kurulum:**
```bash
npx expo install rn-mlkit-ocr expo-build-properties
```

**app.json plugin:**
```json
["rn-mlkit-ocr", { "ocrModels": ["latin"], "ocrUseBundled": true }],
["expo-build-properties", { "ios": { "deploymentTarget": "15.5" } }]
```

**Faz 1 ilk deliverable (go/no-go gate):** Dev client build + fiziksel cihazda 1 fotoğraf → text çıktısı. Bu tutmazsa daha başında pivot.

**Yedek plan:** Kriter: **ücretsiz + on-device text recognition + Expo config plugin ile çalışır**. Spesifik paket ismi Faz 1 go/no-go gate'inde belirlenir (GitHub issues + SDK 54 uyumu taranır). Bare workflow'a geçmeden çözülebilen bir plugin tercih edilir.

---

## Mimari: Yarı-Otomatik Akış

```
┌─────────────┐   ┌─────────┐   ┌──────────┐   ┌──────────────┐   ┌──────────┐
│ 1. FOTOĞRAF │──▶│ 2. KIRP │──▶│ 3. OCR   │──▶│ 4. PARSER    │──▶│ 5. REVIEW│
│ Çek/Seç     │   │ Rotate  │   │ ML Kit   │   │ Normalize    │   │ Kullanıcı│
│             │   │ Crop    │   │ On-device│   │ Score lines  │   │ düzeltir │
└─────────────┘   └─────────┘   └──────────┘   │ Fuzzy match  │   │ onaylar  │
                                                └──────────────┘   └────┬─────┘
                                                                        │
                                                                        ▼
                                                                  ┌──────────┐
                                                                  │ 6. KAYDET│
                                                                  │ Ürün + Hz│
                                                                  └──────────┘
```

### Adım 1: Fotoğraf Çekme
- Mevcut `useIslemPhoto.ts` (kamera + galeri)
- OCR için yüksek çözünürlük: 2048px (normal 1280px)

### Adım 2: Kırp + Döndür (Yeni)
- Termal fişlerde OCR doğruluğunu dramatik artırır
- Basit crop + rotate UI (expo-image-manipulator zaten mevcut)
- Opsiyonel: kullanıcı atlayabilir

### Adım 3: OCR
- `rn-mlkit-ocr` ile on-device metin çıkarma
- Yapılandırılmış sonuç: bloklar, satırlar, elemanlar + bounding box
- ~1-3 saniye (mid-range Android'de daha uzun olabilir)
- **Performans notu:** Processing overlay + InteractionManager ile UI thread kilidi önlenir

### Adım 4: Parser (Detay aşağıda)

### Adım 5: Kullanıcı Kontrol Ekranı (ZORUNLU)
- Üstte: tedarikçi bilgisi (cari eşleşme)
- Ortada: ürün listesi (düzenlenebilir kartlar)
  - Her kart: ürün adı, miktar, birim, birim fiyat, KDV
  - Eşleşme durumu: ✅ Eşleşti (>=0.85) / ⚠️ Öneri (0.6-0.85) / 🆕 Yeni ürün (<0.6)
  - Mevcut ürünlerden seçim (autocomplete)
- Altta: **toplam tutarlılık kontrolü** — "OCR toplamı: ₺1.234,50 / Girilen toplam: ₺..." uyumsuzluk varsa uyarı
- Kullanıcı satır ekle/sil/düzenle
- **Yeni ürün güvenlik:** "Yeni ürün oluştur" default KAPALI. Sadece eşleştirme öner. Yeni ürünler ayrı onay modal'ı ile oluşturulur.

### Adım 6: Kaydetme
- "Sadece Ürün Oluştur" veya "Ürün + Hareket" seçimi
- Mevcut `useCreateUrun()` ve `useCreateUrunHareket()` kullanılır
- Cari eşleşme/oluşturma
- `toplu-giris.tsx` save pattern'i takip edilir
- **Idempotency:** Her import oturumuna `importSessionId` (uuid) üretilir. Kaydet butonuna basıldığında local state'te `isSaved` flag set edilir. "Geri" yapıp tekrar "Kaydet"e basarsa aynı ürünler iki kez oluşturulmaz. Minimum: double-submit guard (buton disable + state flag). İleri seviye: oluşturulan ürün/hareket ID'lerini session metadata'ya kaydet.

---

## Parser Detayı: Satır Scoring Sistemi

Sadece regex match/no-match yerine **her satıra puan veren bir scoring sistemi**.

### Aşama 1: OCR Çıktısını Normalize Et
```
1. Türkçe karakter normalize (ç→c, ğ→g, ı→i vb. - karşılaştırma için)
2. Sayı normalize: "1.234,56" → 1234.56
3. Whitespace/currency/decimal normalize
4. Satır birleştirme heuristiği:
   - Fiyat içermeyen satır + sonraki satır fiyat içeriyorsa → birleştir
   - OCR sık sık ürün adını ve fiyatı ayrı satırlara böler
```

### Aşama 2: Satır Scoring
Her satıra puan ver:
```
+3: İçinde birim var (AD, KG, LT, PKT, KOLİ vb.)
+2: Sayı formatı var (1.234,56 veya 12,50)
+2: KDV ifadesi var (%1, %10, %20)
+1: Birden fazla sayısal değer var (miktar + fiyat)
-5: "TOPLAM", "ARA TOPLAM", "GENEL TOPLAM" içeriyor (footer)
-5: "FATURA", "VKN", "V.D.", "TARİH" içeriyor (header)
-3: Çok kısa satır (<5 karakter, sayı hariç)
```

Eşik üzeri puanlı satırlar → ürün satırı olarak al.

### Aşama 3: Ürün Satırı Parsing
```
ÜRÜN SATIRI PATTERN:
[ürün adı] [miktar] [birim] [birim fiyat] [KDV %] [toplam]

Türk sayı formatı: "1.234,56"
Birimler: AD, KG, LT, PKT, KOLİ, M, M2, GR, TON, ÇİFT
KDV: %1, %10, %20
```

### Aşama 4: Başlık Bilgileri
```
"FATURA", "e-Fatura", "İRSALİYE", "FİŞ" → belge tipi
"V.D.", "Vergi Dairesi" → vergi dairesi
"VKN:", "TCKN:" → vergi/TC no
Şirket adı → genellikle üstte, büyük font (ilk blok)
```

---

## Ürün Eşleştirme: Token Bazlı + Levenshtein

Sadece Levenshtein yetmez. Türk faturalarında aynı ürün çok farklı yazılır:
- "DOMATES SALÇASI 5KG"
- "SALÇA DOMATES 5000 GR"
- "DOM.SALÇA 5K"

### Eşleştirme Algoritması:
```
1. Birim/miktar tokenlarını ayır: "5KG", "5000GR" → ayrı tut
2. Kalan kelimeleri Türkçe normalize et (lowercase + ç→c, ğ→g, ı→i)
3. Token bazlı benzerlik (Jaccard): kelime kümelerinin kesişimi / birleşimi
4. Levenshtein: karakter bazlı düzeltme mesafesi
5. Kombine skor: 0.6 * Jaccard + 0.4 * Levenshtein
6. Kategori bazlı daraltma (varsa): aynı kategorideki ürünlerle önce eşleştir
```

### Eşleşme Eşikleri:
| Skor | Davranış | UX |
|------|----------|-----|
| >= 0.85 | Otomatik seç | ✅ yeşil badge |
| 0.60 - 0.85 | Öneri (kullanıcı onaylar) | ⚠️ sarı badge |
| < 0.60 | Yeni ürün öner | 🆕 mavi badge |

---

## Tipler

```typescript
// src/types/ocrImport.ts

export interface OcrParsedInvoice {
  documentType: 'fatura' | 'irsaliye' | 'fis' | 'unknown';
  supplierName: string | null;
  supplierTaxNumber: string | null;
  supplierMatchCariId: string | null;  // Mevcut cari eşleşmesi
  invoiceDate: string | null;
  invoiceNumber: string | null;
  currency: Currency | null;            // Fişte döviz varsa
  items: OcrParsedItem[];
  subtotal: number | null;
  vatTotal: number | null;
  grandTotal: number | null;
  rawText: string;                      // Debug için tam OCR çıktısı
}

export interface OcrParsedItem {
  name: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  vatRate: number | null;
  totalPrice: number;
  confidence: number;                   // 0-1: satır scoring'den türetilen "bu satır ürün satırı olma güveni"
  matchedUrunId: string | null;
  matchScore: number;                   // 0-1: "mevcut ürünle eşleşme güveni" (ayrı metrik)
  isNew: boolean;
  rawLine: string;                      // Hangi OCR satırından geldi
  source: 'ocr' | 'userEdited';        // Kullanıcı düzenledi mi
}
```

---

## Dosya Yapısı

### Yeni dosyalar:
```
src/lib/ocrEngine.ts              -- OCR soyutlama katmanı (rn-mlkit-ocr wrapper)
src/lib/invoiceParser.ts          -- Türk faturası parser (satır scoring)
src/lib/fuzzyMatch.ts             -- Token bazlı + Levenshtein eşleştirme
src/lib/turkishTextUtils.ts       -- TR karakter/sayı normalizasyonu + satır birleştirme
src/types/ocrImport.ts            -- OCR import tipleri
src/hooks/useOcrImport.ts         -- Ana orchestration hook
src/app/urunler/foto-import.tsx   -- Fotoğraf import sayfası (tüm adımlar)
src/components/ocrImport/
  OcrReviewItem.tsx               -- Düzenlenebilir ürün kartı
  OcrCaptureStep.tsx              -- Fotoğraf çekme + kırp/döndür
  OcrProcessingOverlay.tsx        -- "İşleniyor..." overlay
  OcrNewProductModal.tsx          -- Yeni ürün onay modal'ı
  index.ts
src/i18n/locales/tr/ocrImport.json
src/i18n/locales/en/ocrImport.json
```

### Değiştirilecek mevcut dosyalar:
```
app.json                          -- rn-mlkit-ocr + expo-build-properties plugin
package.json                      -- yeni bağımlılıklar
src/app/urunler/index.tsx         -- FAB menüye "Fotoğrafla Alım" eklenir
src/app/_layout.tsx               -- foto-import route
src/i18n/locales/tr/products.json -- yeni menü metni
src/i18n/locales/en/products.json -- yeni menü metni
```

---

## Uygulama Sırası

### Faz 1: OCR Entegrasyonu (GO/NO-GO GATE)
- `rn-mlkit-ocr` kur + config plugin ekle
- `ocrEngine.ts` soyutlama katmanı yaz
- `eas build --profile development` ile dev client rebuild
- **Fiziksel cihazda 1 Türkçe fatura fotoğrafı → text çıktısı testi**
- Build başarısız veya OCR sonucu kötüyse → **pivot**: alternatif paket araştır

### Faz 2: Parser ve Eşleştirme
- `turkishTextUtils.ts` — sayı/karakter normalizasyonu + satır birleştirme heuristiği
  - **`parseTrNumber(input: string): number | null`** — tek kaynak Türk sayı parser'ı. Tüm formatları kapsar: `1.234,56` / `1,234.56` / `1234,56` / `₺1.234,56`. Parser'ın her yerinde sadece bu kullanılır.
- `invoiceParser.ts` — satır scoring sistemi + ürün satırı parsing
- `fuzzyMatch.ts` — token bazlı + Levenshtein (Jaccard 0.6 + Levenshtein 0.4)
- Örnek fatura fixtures'ları oluştur ve test et (detay aşağıda)

**Faz 2 Başarı Metrikleri (Geçme kriteri):**
| Metrik | Hedef |
|--------|-------|
| 3 örnek dokümanda ürün satırı yakalama oranı | >= %70 |
| Yakalanan satırlarda fiyat parse doğruluğu | >= %90 |
| Grand total tutarlılığı (varsa) | ±%1 tolerans |

Bu metrikler "parser yeterli mi?" tartışmasını bitirir.

**Fixture Veri Seti:**
```
src/lib/__fixtures__/ocrSamples/
  pos_1.txt              -- POS fiş OCR çıktısı
  efatura_1.txt          -- e-Fatura OCR çıktısı
  kagit_1.txt            -- Kağıt fatura OCR çıktısı
  pos_1.expected.json    -- Beklenen parse sonucu (items + totals)
  efatura_1.expected.json
  kagit_1.expected.json
```
Her parser değişikliğinde bu fixture'lara karşı regresyon testi yapılır.

### Faz 3: UI
- `foto-import.tsx` — fotoğraf çekme + kırp/döndür + işleme + review (tek sayfa, step bazlı)
- `OcrReviewItem.tsx` — düzenlenebilir ürün kartı (rawLine gösterebilir)
- `OcrNewProductModal.tsx` — yeni ürün ayrı onay
- Toplam tutarlılık kontrolü (OCR toplam vs girilen toplam uyarısı)
- FAB menüye "Fotoğrafla Alım" butonu
- **Performans:** InteractionManager + ProcessingOverlay ile UI thread korunur

### Faz 4: Import Mantığı
- `useOcrImport.ts` — orchestration hook
- Mevcut `useCreateUrun`, `useCreateUrunHareket` entegrasyonu
- Cari eşleştirme/oluşturma (supplierMatchCariId)
- Progress tracking (`useDataImport.ts` pattern'i)
- "Sadece Ürün" / "Ürün + Hareket" seçimi

### Faz 5: i18n + Polish
- TR/EN çeviriler
- Hata durumları (OCR başarısız, boş sonuç, düşük kalite fotoğraf)
- "Manuel Giriş" fallback (toplu-giris'e yönlendir)
- Fotoğraf kalitesi ipuçları ("Net çekin", "Flash kullanın" vb.)

---

## Riskler

| Risk | Etki | Çözüm |
|------|------|-------|
| `rn-mlkit-ocr` SDK 54 build hatası | Yüksek | Faz 1 go/no-go gate. Alternatif paket veya bare plugin |
| Termal fişlerde düşük OCR doğruluğu | Orta | Kırp/döndür adımı + flash önerisi + kalite uyarısı |
| Parser farklı formatlarda başarısız | Yüksek | Scoring sistemi regex'ten daha esnek. Review zorunlu |
| Mid-range Android'de yavaş OCR | Orta | InteractionManager + processing overlay |
| iOS Simulator'da ML Kit çalışmaz | Düşük | Fiziksel cihazda test |
| Yanlış ürün oluşturma | Orta | "Yeni ürün" default kapalı, ayrı onay modal'ı |

---

## Doğrulama

1. `eas build --profile development` başarılı
2. Fiziksel cihazda Türkçe fatura fotoğrafı → OCR text çıktısı
3. 3 farklı fatura formatında parser testi (e-fatura, el yazısı fatura, POS fişi)
4. Fuzzy matching: bilinen ürünlerle eşleştirme doğruluğu
5. Toplam tutarlılık: OCR toplam vs kullanıcı girişi uyumu
6. Tam akış: fotoğraf → kırp → OCR → review → kaydet → ürün listesinde doğrula
7. `npx tsc --noEmit` tip kontrolü
8. Manuel giriş fallback (OCR başarısız senaryo)
9. Yeni ürün onay akışı (default kapalı, modal ile onay)
