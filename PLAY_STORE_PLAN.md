# Google Play Store Yayinlama Plani - Isletme Takip

## Proje Bilgileri
- **Proje:** Isletme Takip (Expo SDK 54, React Native 0.81.5)
- **Paket adi:** `com.isletmetakip.app`
- **Mevcut surum:** 1.2.1
- **iOS durumu:** Internal test asamasinda (build 17), henuz App Store'da yayinlanmadi
- **Android durumu:** Henuz Play Store'da degil

---

## Gemini API Durumu
- `GEMINI_API_KEY` Supabase Dashboard'dan ayarlanmis (edge function secrets)
- Key sadece server-side'da kullaniliyor (`Deno.env.get("GEMINI_API_KEY")` - `supabase/functions/parse-invoice/index.ts:102`)
- Client-side `.env` dosyasina eklemeye **GEREK YOK** - key hicbir zaman client'a gonderilmiyor

---

## Yapilacaklar (Sirasiyla)

### ADIM 1: Google Play Console Hesabi Olustur (Manuel)
- [ ] https://play.google.com/console adresinden gelistirici hesabi ac
- [ ] 25$ tek seferlik kayit ucreti ode
- [ ] Gelistirici profili bilgilerini doldur (ad, adres, iletisim)
- [ ] Uygulama kaydini olustur ("Isletme Takip")

### ADIM 2: Google Android OAuth Client ID Olustur (Manuel)
- [ ] https://console.cloud.google.com adresinde mevcut projeye git
- [ ] Credentials > Create Credentials > OAuth 2.0 Client ID
- [ ] Application type: Android
- [ ] Package name: `com.isletmetakip.app`
- [ ] SHA-1 certificate fingerprint ekle (EAS build'den alinacak)

### ADIM 3: `eas.json` Guncelle (Kod degisikligi - YAPILDI)
- [x] Production Android `buildType`: `"apk"` -> `"aab"`
- [x] Android submit yapilandirmasi ekle

### ADIM 4: `app.json` Android Yapilandirmasini Guncelle (Kod degisikligi - YAPILDI)
- [x] `expo-build-properties` plugin'ine Android SDK ayarlari ekle
- [x] Android `versionCode` ekle
- [x] Android permissions ekle

### ADIM 5: `.env` ve `.env.example` Guncelle (Kod degisikligi - YAPILDI)
- [x] `.env` dosyasina `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID` placeholder ekle
- [x] `.env.example` dosyasina Android client ID ve Gemini notu ekle

### ADIM 6: Google Sign-In Android Client ID Kontrol (Kod degisikligi - YAPILDI)
- [x] Login sayfasindaki Google Sign-In yapilandirmasinin dogru env variable'i okudugunu kontrol et

### ADIM 7: Google Play Service Account JSON Olustur (Manuel)
- [ ] Play Console > Setup > API Access
- [ ] Service Account olustur veya mevcut olani bagla
- [ ] JSON key indir ve proje kokune `google-service-account.json` olarak kaydet
- [ ] `.gitignore`'a `google-service-account.json` eklendi

### ADIM 8: EAS Credentials Ayarla (Terminal)
```bash
npx eas credentials --platform android
```
- [ ] "Generate new keystore" sec (EAS otomatik yonetimi onerilir)

### ADIM 9: Production AAB Derle (Terminal)
```bash
npx eas build --platform android --profile production
```

### ADIM 10: Play Store Listesi Hazirla (Manuel)
- [ ] Uygulama aciklamasi (kisa + uzun, Turkce)
- [ ] Ekran goruntuleri (en az 2 adet, telefon boyutu)
- [ ] Ozellik grafigi (1024x500)
- [ ] Uygulama simgesi (512x512 - mevcut icon.png kullanilabilir)
- [ ] Gizlilik politikasi URL'si host et
- [ ] IARC icerik derecelendirme anketi
- [ ] Data Safety Form doldur
- [ ] Iletisim bilgileri

### ADIM 11: Play Store'a Gonder (Terminal)
```bash
npx eas submit --platform android --latest
```

---

## Degistirilen Dosyalar

| Dosya | Degisiklik |
|-------|-----------|
| `eas.json` | buildType: aab, android submit config eklendi |
| `app.json` | versionCode, android permissions, expo-build-properties android eklendi |
| `.env` | EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID placeholder eklendi |
| `.env.example` | Android client ID placeholder + Gemini notu eklendi |
| `.gitignore` | google-service-account.json eklendi |

## Dogrulama

1. `eas.json` degisikliklerinden sonra: `npx eas build:configure`
2. `app.json` degisikliklerinden sonra: `npx expo config --type public`
3. Production build: `npx eas build --platform android --profile production`
4. Build basarili olursa AAB'yi test cihazinda dene
5. Google Sign-In'in Android'de calistigini dogrula
6. OCR/fatura tarama ozelliginin calistigini dogrula (Gemini edge function)
