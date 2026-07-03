# Onboarding Yeniden Tasarımı — Kayıtsız İlk Giriş Planı

> **Durum:** Onaylandı, uygulama bekliyor
> **Oluşturma:** 2026-06-03
> **Sahip:** Ömer Faruk Özadalı
> **Not** Burada eksikler var. bazı düzenlemeleri güncelledim kendi kafamda planı körü körüne uygulamamalıyız

## 1. Problem

Yaşlı bir esnaf uygulamayı kurdu ama **e-posta girişi + parola seçimi** zor geldiği için kullanmadı.
Mevcut kayıt akışı ([src/app/(auth)/register.tsx](<src/app/(auth)/register.tsx>)) değer görülmeden gelen bir duvar:
işletme adı + e-posta + parola + parola tekrarı + e-posta OTP doğrulaması. Esnaf tam burada bırakıyor.

## 2. Çözüm — Özet

Tek yeni davranış: **kayıt olmadan ilk giriş** (Supabase anonim oturum).
Kullanıcı önce uygulamayı kullanır, değeri görür, sonra (opsiyonel) kaydolup verisini korur.

**Karar netliği:**

- Kayıt yöntemleri **aynen kalır**: Google / Apple / e-posta. **Telefon/SMS YOK** (SMS ücretli olduğu için eklenmiyor).
- Sektör bilgisi **sadece saklanır** (otomatik kategori/hesap üretimi yok).
- İşletme adı **otomatik oluşmaz** → kullanıcı sektör + tabela adı girer.
- Kaydolma hatırlatması: **ilk işlemden sonra tek seferlik tam ekran**, sonrasında küçük kalıcı rozet.
- Tanıtım karuseli **kalır** (tasarımı ayrıca yenilenecek — ayrı iş).

### Neden anonim hesap, "gerçek yerel depolama" değil?

Uygulamanın tüm veri katmanı react-query + doğrudan Supabase sorgularına dayalı (~50 hook, ilişkisel join'ler),
yerel DB yok. "Veriyi fiziksel olarak telefonda tut" demek tüm hook'ları yeniden yazmak + senkron motoru = **haftalar**.
Anonim oturum ise **veri katmanına hiç dokunmadan** aynı deneyimi verir (her şey `user.id`'ye bağlı, değişmez).
İnternet bağımlılığı bugünküyle aynı kalır (esnafın derdi offline değil, giriş duvarıydı).

## 3. Kullanıcı Yolculuğu (Yeni)

1. **İlk açılış** → arka planda sessizce `signInAnonymously()` → giriş ekranı görünmez.
2. **Tanıtım karuseli** (mevcut 5 slayt; tasarım yenilemesi ayrı iş).
3. **"İşletmeni tanıyalım" mini formu:**
   - _Sektör_ — büyük butonlu hazır liste (Market/Bakkal, Kafe/Restoran, Kuaför/Berber, Tekstil/Giyim, Oto, Eczane … + "Diğer").
   - _Tabela adı_ — tek metin alanı.
   - Kaydet → işletme oluşur (`name` = tabela adı, `sector` = seçilen sektör).
4. **Ana ekran** — esnaf hemen işlem girer.
5. **İlk işlemden sonra** → tek seferlik tam ekran nazik hatırlatma:
   _"Verileriniz şu an sadece bu telefonda. Google / Apple / e-posta ile kaydolun, kaybolmasın."_
6. Sonrasında küçük, kalıcı "verilerini koru" rozeti kalır (istediğinde dokunur).
7. **Mevcut kullanıcı / yeni cihaz:** rozetteki "Zaten hesabım var" → mevcut [login](<src/app/(auth)/login.tsx>) ekranı.

## 4. Teknik Kapsam (Yapılacaklar)

### Backend / Config

- [ ] Supabase Auth → **Anonymous sign-ins** aç.
- [ ] **CAPTCHA / Cloudflare Turnstile** aç (anonim giriş istismara açık, Supabase zorunlu kılıyor).
- [ ] Migration: `isletmeler` tablosuna `sector text` kolonu ekle.
- [ ] Tipleri güncelle: `Isletme`, `IsletmeInsert`, `IsletmeUpdate` ([src/types/database.ts:65-92](src/types/database.ts#L65)).
- [ ] İşletme düzenleme ekranına sektör alanını ekle ([src/app/ayarlar/](src/app/ayarlar/)).
- [ ] Stale (telefonu/kimliği bağlanmamış, terk edilmiş) anonim hesapları temizleyen SQL cron job.

### Auth Akışı

- [ ] `signInAnonymous()` fonksiyonu + `isAnonymous` flag ([src/hooks/useAuth.ts](src/hooks/useAuth.ts), [src/contexts/AuthContext.tsx](src/contexts/AuthContext.tsx)).
- [ ] Anonim kullanıcıda **otomatik işletme oluşturmayı kapat** (mini form oluştursun).
- [ ] "My Business" / "{user}'s Business" otomatik isim fallback'ini kaldır ([src/hooks/useAuth.ts:171](src/hooks/useAuth.ts#L171)).

### Ekranlar / UI

- [ ] [src/app/\_layout.tsx](src/app/_layout.tsx) yönlendirmesi: oturum yoksa `/login`'e atmak yerine anonim giriş başlat.
- [ ] Yeni **"İşletmeni tanıyalım" mini form** ekranı (sektör + tabela adı).
- [ ] **İlk-işlem-sonrası tam ekran hatırlatma** (AsyncStorage flag ile tek seferlik).
- [ ] Kalıcı **"verilerini koru" rozeti** (anonimken görünür) + "Kaydol & koru" ekranı (mevcut Google/Apple/e-posta butonları).

## 5. Tek Gerçek Risk + Güvenlik Ağı

**Anonim hesabı mevcut Google/Apple girişine BAĞLAMAK.**
Şu an `signInWithIdToken` ([src/hooks/useAuth.ts:707,749](src/hooks/useAuth.ts#L707)) yeni bir oturum açıyor —
anonim hesaba bağlamıyor. Bağlanmazsa anonim veri sahipsiz kalır.

- **E-posta:** `updateUser({ email, password })` → anonim hesabı yerinde kalıcıya çevirir, **veri korunur.** Kolay/güvenli.
- **Google / Apple (native):** native id_token'ı mevcut anonim oturuma bağlamak küçük bir **teknik doğrulama (spike)** gerektiriyor.
- **Güvenlik ağı:** Native bağlama sorun çıkarırsa, kayıt anında veriyi anonim `user_id`'den yeni hesaba taşıyan
  bir **sunucu-tarafı RPC** (security definer): `isletmeler` + ilişkili kayıtların ownership'ini yeni kullanıcıya re-point eder.
- **İlk uygulama adımı bu spike olmalı** — tüm akışın güvenliği buna bağlı.

## 6. Bekleyen Bağımlılıklar / Ayrı İşler

- [ ] ⚠️ **Apple Sign-In JWT (client secret) yenilemesi** — Supabase Apple provider'ındaki client secret JWT'si
      (Apple .p8 anahtarıyla üretilen, max 6 ay geçerli) süresi doluyor. **~15 gün kaldığı tahmin ediliyor (≈ 18 Haziran 2026 — kesin tarih DOĞRULANMALI).**
      Dolarsa Apple ile giriş kırılır (bu plandaki kayıt yöntemlerinden biri).
      _Yenileme:_ Apple Developer (Team ID, Key ID, Service/Client ID, .p8) ile yeni JWT üret → Supabase Auth → Apple provider'a gir.
      **Karar:** Onboarding işinden SONRA kontrol edilecek (kullanıcı talebi).
- [ ] **Tanıtım karuseli tasarım yenilemesi** ([src/app/onboarding.tsx](src/app/onboarding.tsx)) — ayrı tasarım işi, auth akışını bloklamaz.

## 7. Efor Tahmini

| İş                                      | Süre           |
| --------------------------------------- | -------------- |
| Bağlama spike'ı (anonim → Google/Apple) | önce, kritik   |
| Auth akışı + anonim giriş               | ~1 gün         |
| Mini form + sektör migration            | ~0.5–1 gün     |
| İlk-işlem hatırlatma + rozet            | ~0.5 gün       |
| Toplam (auth)                           | **~2.5–3 gün** |
| Karusel tasarım yenileme                | ayrı           |

## 8. Açık Kalan Kararlar

- Sektör listesinin nihai içeriği (esnaf segmentlerine göre).
- Tam ekran hatırlatmanın görsel tasarımı (karusel yenilemesiyle birlikte ele alınabilir).

---

_Bu plan, kod tabanı incelemesi ve düşük-friction onboarding araştırması sonrası oluşturuldu. Kararlar kullanıcıyla netleştirildi._
