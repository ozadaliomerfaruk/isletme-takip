# Fatura OCR: ML Kit → Gemini Flash 2.0 Vision Geçişi

## Sorun
On-device ML Kit OCR Türkçe faturalarda kullanılamaz seviyede kötü sonuç veriyor.

## Çözüm
Fatura fotoğrafını Supabase Edge Function üzerinden **Gemini 2.0 Flash** Vision API'ye gönderip yapılandırılmış JSON döndürtmek. OCR + regex parser → tek AI çağrısı.

## Maliyet
- Gemini Flash: ~$0.0004/fatura
- 600 fatura/ay: ~$0.25 (Google AI Studio free tier ile muhtemelen $0)

## Adımlar

### 1. Supabase Edge Function oluştur
**Yeni dosya:** `supabase/functions/parse-invoice/index.ts`
- Base64 fotoğraf alır
- Gemini 2.0 Flash API'ye gönderir (vision + JSON mode)
- Türkçe fatura parse promptu ile yapılandırılmış JSON döndürür
- Secret: `GEMINI_API_KEY` (Supabase Dashboard'dan eklenir)

### 2. `src/lib/ocrEngine.ts` güncelle
- ML Kit çağrısını kaldır
- Yerine `supabase.functions.invoke('parse-invoice', { body: { image: base64 } })` koy
- Dönen JSON'ı `OcrParsedInvoice` tipine map'le

### 3. `src/hooks/useOcrImport.ts` güncelle
- `recognizeText()` + `parseInvoice()` → tek `recognizeInvoice()` çağrısı
- Fuzzy match (ürün + cari eşleştirme) client-side kalacak (mevcut kod)
- Image → base64 dönüşümü ekle (expo-file-system ile)

### 4. rn-mlkit-ocr kaldır
- `app.json` plugins'ten rn-mlkit-ocr çıkar
- `package.json`'dan kaldır
- `expo-build-properties` iOS deploymentTarget artık gerekmeyebilir (kontrol et)

### 5. İnternet yoksa uyarı
- Edge function çağrısı öncesi network check
- Hata durumunda toast mesajı

## Değişecek Dosyalar
| Dosya | İşlem |
|-------|-------|
| `supabase/functions/parse-invoice/index.ts` | YENİ |
| `src/lib/ocrEngine.ts` | Gemini çağrısına geçiş |
| `src/hooks/useOcrImport.ts` | Pipeline güncelleme |
| `src/lib/invoiceParser.ts` | SİL (artık gereksiz) |
| `src/lib/turkishTextUtils.ts` | Sadece detectUnit/detectKdvRate kalır |
| `app.json` | rn-mlkit-ocr plugin kaldır |
| `package.json` | rn-mlkit-ocr kaldır |

## Doğrulama
1. `supabase functions deploy parse-invoice`
2. Curl ile test (base64 fatura gönder, JSON doğrula)
3. `tsc --noEmit` → 0 hata
4. Gerçek fatura fotoğrafları ile uygulama testi
5. EAS build + TestFlight
