# QTB "Kaydet Asılması" — Danışman Bulgu Raporu v2.2 (19 Tem 2026, Fable)

> Amaç: Opus bu raporu **doğruladı** (19 Tem); Fable karşı-kontrolü tamam. v2.2, Opus'un
> kabul edilen 4 düzeltmesini ve yeni P0'ı (birleşik RPC bağlama) içerir. Teşhis nihai.
>
> **Opus doğrulamasından kabul edilen düzeltmeler (Fable koddan/veriden teyit etti):**
> 1. Refresh retry penceresi 90 sn DEĞİL **~30 sn** (`AUTO_REFRESH_TICK_DURATION_MS`;
>    kilit-tutma en-kötüsü ~2×15 sn deneme ≈ 30 sn). 90 sn yalnız refresh-kararı eşiği.
> 2. Ürün başına 1 değil **3 istek** (miktar SELECT + `update_urun_miktar` RPC + hareket
>    INSERT; [useUrunHareketler.ts:400-470](../src/hooks/useUrunHareketler.ts#L400-L470))
>    → 3 ürünlü alış ≈ **~12 round-trip**; 146 sn'yi asıl bu açıklıyor (o kayıtta
>    `save_timing_debug` yok → süre create RPC'sinde değil, downstream ürün fazında).
> 3. "28 Haz sıçraması" pencere-kenarı artefaktıydı — rotasyon ≥21 Haz'dan beri
>    ~170-390/gün (istemci kaynaklı; eski filo 17-18 Tem'de hâlâ 161/107 üretiyor).
> 4. 146 sn'lik kayıt owner değil, sahadaki bir kullanıcı (yasin.store, alis).
>
> **YENİ P0 (Opus'un bulgusu, Fable teyitli):** `create_islem_with_urun_atomik` RPC'si
> 16 Tem'den beri PROD'da CANLI (migration 20260716020000 + izin-gate 20260716030000)
> ve QuickUrunBar/toplu-giriş/çıkış zaten kullanıyor
> ([useUrunHareketler.ts:1015](../src/hooks/useUrunHareketler.ts#L1015), :1101) —
> ama **QTB'nin ürünlü create dalı hâlâ eski 2+3N-çağrılı yolda**. QTB'yi bu RPC'ye
> bağlamak zinciri 1 round-trip'e indirir; migration gerekmez. Ana fix budur.

## 0. Kesinleşen zemin (EAS + git + probe zaman çizgisiyle kanıtlı)

| Build | Tarih | Commit | İçerik | Durum |
|---|---|---|---|---|
| iOS 66 | 14 Tem 03:16 TR | `db98fb7` | auth fix #1+#2 var; **#3 foreground-refresh yara bandı İÇİNDE**; atomik create YOK | 14-16 Tem arası sahada |
| iOS 67 | 15 Tem | `71e4f87` | — | İPTAL edildi |
| iOS 68 | 16 Tem 15:34 TR | **`4c72c4e` = branch HEAD** | **TÜM auth fix'leri + atomik create + tüm 15-16 Tem işi** | **TestFlight'ta (kullanıcının cihazı) + probe verisine göre saha da buna geçmiş** |

Kanıt zinciri:
- `save_submit_debug` probu YALNIZ 9f3d9f4 sonrası kodda var → sahada **ilk event 16 Tem
  19:56** (build 68'in dağıtıldığı akşam), 17-18 Tem'de gerçek esnaf hesaplarından akıyor.
  ⇒ 17-18 Tem'deki asılmalar (146 sn dahil) **build 68 = tüm-fix'li kod** üzerinde.
- ⇒ **Kullanıcı haklı: Expo Go ile TestFlight 68 birebir aynı kod (`4c72c4e`).** Asılma
  fix'li kodda sürüyor → neden **kod değil, ortam + veri/durum**:

| | Expo Go testi (sorunsuz) | TestFlight 68 (asılıyor) |
|---|---|---|
| Kod | `4c72c4e` | `4c72c4e` (aynı) |
| Hesap | deneme8 (neredeyse boş defter) | ozadaliomerfaruk (yıllarca gerçek veri; ürünlü işlemler) |
| Süreç | taze başlatılmış dev süreci (ceset soket yok) | günlerdir yaşayan süreç; her uyanışta bayat soket havuzu |
| Ağ | ev/ofis Wi-Fi (uzun NAT ömrü) | saha: hücresel/CGNAT veya dükkân Wi-Fi — idle akışlar 30-180 sn'de sessizce ölür |

## 1. Nihai teşhis — ölü idle soketler + 15 sn timeout istiflenmesi + uzun çağrı zinciri + geri bildirimsiz sonsuz spinner

QTB'de 3-5 dk form doldurulurken **hiç ağ trafiği olmaz** (7 günlük JWT ile refresh de yok →
tam sessizlik). Bu pencerede NAT/LB, iOS'un havuzdaki keep-alive soketlerini FIN'siz öldürür.
KAYDET'e basılınca:

1. `checkNetworkConnectivity` **taze bağlantı** açıp 2-5 sn'de başarır (probe:
   `save_netcheck_debug` 2,4-2,5 sn) → "online" der, geçer.
2. Asıl kayıt istekleri **havuzdaki ceset soketlere binebilir** ve zincir uzundur:
   cari işlemlerinde `applyLinkedCariInversion`'ın cariler SELECT'i
   ([useIslemler.ts:217-258](../src/hooks/useIslemler.ts#L217-L258)) → `create_islem_atomik`
   RPC → (varsa) foto upload → (ürünlü işlemde) **her ürün için 3 istek** (miktar SELECT +
   `update_urun_miktar` + hareket INSERT;
   [useTransactionSubmit.ts:275-295](../src/components/transaction/QuickTransactionBar/hooks/useTransactionSubmit.ts#L275-L295)
   → [useUrunHareketler.ts:400-470](../src/hooks/useUrunHareketler.ts#L400-L470)) —
   3 ürünlü alışta zincir ~12 round-trip.
   Her çağrı 15 sn'de abort olur ([supabase.ts:38-48](../src/lib/supabase.ts#L38-L48));
   link-SELECT hatası **sessizce yutulur** (`getLinkedCariInfo` → null); RPC hatasında React
   Query `retry: 1` zinciri baştan koşturur ([queryClient.ts:26-29](../src/lib/queryClient.ts#L26-L29)).
   Havuzda birden çok ölü soket varsa retry de cesede biner → 15 sn'lik turlar istiflenir:
   sade işlemde 30-60 sn, **ürünlü/fotolu işlemde 146 sn'ye kadar gözlendi** (18 Tem,
   type=alis). Kullanıcının şikayetindeki "ürünlü alış/satış" tam bu uzun zincir.
3. Spinner'ın **toplam süre sınırı ve geri bildirimi yok**; `submitInFlightRef` yeni
   denemeyi de eler → kullanıcı gözünde "takıldı".

### Semptomların tek tek açıklaması

- **"3-5 dk açık kalınca"** → idle-soket ölüm penceresi (hücresel CGNAT'ta 30-180 sn tipik).
  Tetik zaman değil, **trafiksizlik**. Expo testinde de 15 dk idle vardı ama taze süreç +
  Wi-Fi NAT'ı + boş hesap → soketler sağ kaldı / zincir kısa.
- **"X'e basınca kaydediyor"** → X KAYDETMEZ; kayıt **KAYDET'e basıldığı anda yola çıkmıştır**.
  X yalnız paneli kapatır ([QuickTransactionBar.tsx:237-242](../src/components/transaction/QuickTransactionBar/QuickTransactionBar.tsx#L237-L242));
  asılı `handleSave` promise'i arkada koşmaya devam eder, retry taze/dirilen sokete binince
  tamamlanır; success haptic + toast global olduğundan panel kapalıyken ateşlenir
  ([useTransactionSubmit.ts:882-905](../src/components/transaction/QuickTransactionBar/hooks/useTransactionSubmit.ts#L882-L905)).
  Cari ekstresinde kaydın görünmesi bu **gecikmiş tamamlanmadır** — X'siz beklense de aynı
  kayıt inecekti (filo problarında X'siz 37-146 sn'de tamamlanan kayıtlar var).
- **"Swipe-up yapınca kaydediyor"** → gerçek mekanizma: iOS background geçişinde soket
  havuzunu tazeler/keser, in-flight işe ~30 sn yürütme tanır, `stopAutoRefresh` yeni iş
  bindirmez → tıkanan istek taze soketle iner.

### Auth kilidi: bugünkü şikayetin birincili DEĞİL, ama gerçek bir bağlam

- Her REST çağrısı token için `getSession()` → `_acquireLock(-1)`; kilit beklemesi
  SINIRSIZ (15 sn fetch timeout kilidi kapsamaz). Token geçerliyken kilit ~ms tutulur →
  68'de normal akışta sorun değil. Refresh atılan anlarda ise ölü sokette auth-js'in
  **~30 sn'lik** retry penceresi boyunca kilit tutulur (auth-js 2.89 doğrulandı: tick 30 sn /
  `_acquireLock(0)`; `_refreshAccessToken` 200ms·2ⁿ backoff, retry sınırı
  `AUTO_REFRESH_TICK_DURATION_MS`=30 sn → en-kötü ~2×15 sn deneme; `getSession` süresi
  dolmuşsa kilit İÇİNDE refresh eder; `EXPIRY_MARGIN_MS=90 sn` yalnız karar eşiğidir).
- **16 Tem sabahı fırtınasının açıklaması (artık çözüldü):** kullanıcının cihazında o sabah
  **build 66 vardı** (68 15:34'te çıktı) ve 66'da #3 yara bandı duruyor → cihaz test turundaki
  her foreground'da (≥1 dk throttle) koşulsuz `refreshSession` → **60-75 sn'de bir rotasyon,
  25 dk** (oturum `f3887baa…`, 08:54-09:19 UTC) ve hemen ardından 09:20'de
  `insert_ms=22.528`'lik kayıt (kilit beklemesi). 68'e geçince rotasyonlar durdu (son:
  16 Tem 12:06; 17-19 Tem aktif kullanımda sıfır rotasyon → 7 günlük token teyidi).
  ⇒ Bugünkü şikayette auth fırtınası YOK; ama eski build'lerde (1.5.2-1.5.5 + 66) bu
  mekanizma sahada hâlâ yaşıyor.

## 2. Kanıt dosyası

- **Filo probları** (`app_events`, 7 gün, hepsi iOS v1.5.6): `submit_ms` 146.099 (18 Tem,
  alis) / 37.313 / 14.476 / 10.598 / 9.902 / 2-4 sn ×10+ — `save_submit_debug` olduğu için
  hepsi **build 68**. İki küme: foreground+0-21 sn (soket uyanması) ve fg+3-5 dk (idle ölümü);
  146 sn'lik kaydın başlangıcı fg+32 sn. `save_netcheck_debug` 2,4-2,5 sn aynı anlarda →
  ağ yolu gerçekten bozuktu.
- **Build 66 dönemi probu**: `save_timing_debug` 16 Tem 09:20 (fırtına bitimi):
  `total=22.696, insert_ms=22.528, link_ms=0, balance_ms=168, ok=true` → asılma fazlar-arası
  = kilit/token beklemesi.
- **Kullanıcı cihazı (68)**: 17 Tem 20:49-20:59 art arda 2,5-10,6 sn kayıtlar, hepsi
  fg+2,8-21 sn → soket-uyanma deseni tüm-fix'li build'de sürüyor.
- **Rotasyon hacmi**: ≥21 Haz'dan beri ~170-390/gün (daha eski görünen düşük uçlar sorgu
  penceresi kenarı artefaktıydı) — foreground yara bandını taşıyan filo; istemci kaynaklı.
  17-18 Tem'de hâlâ 161/107 → eski build'ler sahada; 68+ yayıldıkça düşecek.
- **JWT expiry fiilen UZUN (7 gün ayarıyla tutarlı)**: kullanıcının 16 Tem 12:06 token'ı
  17-19 Tem aktif kullanımda hiç rotasyon üretmedi. (Dashboard'dan kesin teyit önerilir.)
- **Auth sunucusu temiz**: 36× başarılı token grant, 0 hata/429 → sorun istemci tarafı.
- **Mükerrer kayıt**: 7 günde aynı (işletme,tip,tutar,tarih,cari,açıklama) ≤120 sn çifti
  **0** — retry şu ana dek dup üretmemiş; risk tasarımsal olarak duruyor (P1a bunu kapatır).

## 3. Kök neden sıralaması (nihai)

1. **Birincil:** idle-ölü soketler + faz başına 15 sn timeout + RQ retry'ın zinciri baştan
   koşturması + **toplam süre sınırı/geri bildirim yokluğu**. Tamamlanma X/background anına
   denk gelince yanlış nedensellik algısı ("X kaydetti") doğuyor.
2. **Uzunluk çarpanı:** çağrı sayısı — ürünlü işlemde ürün başına ayrı RPC + foto upload;
   (66 ve öncesinde ayrıca legacy çok-çağrılı create). 146 sn'lik uçlar böyle oluşuyor.
3. **Eski filo (1.5.2-1.5.5 + 66):** her foreground'da koşulsuz `refreshSession` ölü sokette
   ~30 sn kilit tutup o andaki kayıtları kuyruğa alıyor (16-Tem fırtına kanıtı). 68'de yok.
4. **Latent mayın:** `checkAndRefreshToken` 2-dk interval'ı ([useAuth.ts:599-611](../src/hooks/useAuth.ts#L599-L611)) —
   bugün 7g token'la sessiz; JWT 3600'e inince her saatin son 5 dk'sında 2 dk'da bir
   `refreshSession` atacak (supabase-js tick'iyle gereksiz çift mekanizma; bayat-`expires_at`
   durumlarında fırtına motoru).
5. **Sessiz doğruluk riski:** `getLinkedCariInfo` ağ hatasını yutuyor → tam bu bozuk-ağ
   senaryosunda linked-cari işleminde inversiyon atlanıp **yanlış yönde bakiye** yazılabilir.

## 4. Önerilen aksiyonlar (öncelik sırası Opus doğrulaması sonrası güncellendi)

- **P0 — QTB ürünlü create'i `create_islem_with_urun_atomik`'e bağla (ANA FİX, Opus bulgusu).**
  RPC prod'da canlı ve QuickUrunBar/toplu ekranlarda kanıtlı; QTB'ye bağlanınca ürünlü
  kayıt 2+3N round-trip'ten ~1'e iner, manuel rollback bloğu
  ([useTransactionSubmit.ts:859-877](../src/components/transaction/QuickTransactionBar/hooks/useTransactionSubmit.ts#L859-L877))
  tamamen kalkar. Foto upload RPC dışında kalır (bugünkü gibi sonrasında).
  **Parite kontrol listesi (implementasyonda doğrulanacak):**
  (i) balance ops aynı kaynaktan: `computeBalanceOps(applyLinkedCariInversion(input))`;
  (ii) cari'siz tipler (gelir/gider/kredi_karti_gider + ürün) RPC'de sorunsuz mu
  (p_new_row.cari_id null); (iii) son-fiyat güncelleme semantiği eski 3-çağrılı yolla
  birebir mi (iade tipleri dahil — `getUrunHareketTipi` eşlemesi); (iv) ürünlü CREATE'te
  `kategori_id=null` kuralı korunuyor; (v) izin-gate hatası (42501/Yetkisiz) mevcut
  permissionDenied mesajına eşlensin; (vi) RPC-yok (42883) için mevcut yola fallback
  (create_islem_atomik deseniyle aynı sigorta); (vii) scheduled+ürün engeli aynen kalır.
- **P1 — Kayıt yoluna dayanıklılık paketi (P0'ın tamamlayıcısı):**
  a) **Client-üretimi UUID** (`p_new_row.id`) + idempotent davranış (aynı id → mevcut satırı
     dön) — **her iki create RPC'sinde** (`create_islem_atomik` VE
     `create_islem_with_urun_atomik`); migration additive, eski client etkilenmez.
  b) Kayıt zincirine **toplam süre sınırı** (~25-30 sn): aşılırsa spinner bırakılır;
     client-id ile `islemler`'den kontrol → kaydolmuşsa "kaydedildi" akışı, olmamışsa form
     korunarak "tekrar deneyin" toast'ı. (a'sız yapılırsa mükerrer üretir — birlikte şart.)
  c) Önerilir: save-path denemelerine daha kısa timeout (~8 sn) + idempotans sayesinde
     retry 2 → ölü soket turları hızlı devrilir. Ürün hareketleri zaten islem'den sonra
     koşuyor; başarısızlıkta mevcut rollback korunmalı.
- **P2 — `getLinkedCariInfo`/`applyLinkedCariInversion` hata yutma (dar kapsam, dikkatli fix):**
  etki alanı yalnız linked/viewer cari + tip uyumsuzluğu (kendi carisinde inversiyon zaten
  yok → yutulan hata sonucu DEĞİŞTİRMEZ). Naif "her hatada throw" ölü-sokette kaydı
  büsbütün bloke eder — doğrusu: PGRST116/"satır yok" → link yok say, devam; ağ hatası →
  P1b bütçesiyle koordineli kısa retry, sonra hatayı yüzeye çıkar.
- **P3 — `checkAndRefreshToken` interval'ını kaldır** (tek `refreshSession` çağıranı bu;
  tick + getSession-içi refresh yeterli ve kilit-dostu). JWT süresi düşürülmeden ÖNCE şart.
- **P4 — UX:** X zorunluluğu kalksın — backdrop klavye açıkken de tek adımda kapatsın
  (bugün two-step: [QuickTransactionBar.tsx:254-265](../src/components/transaction/QuickTransactionBar/QuickTransactionBar.tsx#L254-L265))
  ve/veya swipe-down-to-dismiss. Kayıt in-flight iken kapatma zaten arkada tamamlanıyor —
  bu davranış görünür kılınabilir ("kaydetmeye devam ediyor…" mini durum + tamamlanınca toast).
- **P5 — Teşhisi kilitleyen cihaz deneyi (fix'ten ÖNCE önerilir):** telefon **hücresel
  veride**, QTB 4-5 dk boş bekletilip kaydet → asılma bekleniyor; taze açılmış uygulamada
  anında kaydet → sorunsuz bekleniyor. Wi-Fi'da aynı senaryo daha zor tetiklenmeli.
- **P6 — Config:** JWT expiry 7 gün KALSIN; P1+P3 sahaya yayılıp doğrulanınca 3600'e
  indirilsin (personel erişim-iptali gerekçesi geçerli).
- **P7 — Build 69:** P1-P4 sonrası alınır; problar ([auth-debug], save_*_debug) doğrulama
  bitene kadar KALIR. Eski filodaki (66 ve öncesi) foreground-refresh asılmaları ancak
  kullanıcılar 68+'a güncelledikçe söner — App Store'da hangi build'in canlı olduğu
  (66 mı 68 mi) App Store Connect'ten teyit edilmeli.

## 5. Opus için "DOKUNMA" listesi

1. `lock: processLock` ([supabase.ts:63](../src/lib/supabase.ts#L63)) — kalkarsa eski deadlock döner.
2. `onAuthStateChange` içindeki `setTimeout(0)` erteleme ([useAuth.ts:479-518](../src/hooks/useAuth.ts#L479-L518)) — kilit altında await = re-entrant deadlock.
3. `TOKEN_REFRESHED` erken `return` ([useAuth.ts:443-446](../src/hooks/useAuth.ts#L443-L446)).
4. `startAutoRefresh/stopAutoRefresh` AppState wiring'i ([supabase.ts:82-95](../src/lib/supabase.ts#L82-L95)).
5. `fetchWithTimeout` — kaldırılmasın; P1 üstüne katman ekler.

## 6. Yeniden-üretme sorguları / komutları

```sql
-- Yavaş kayıt probları (7 gün)
select e.event_name, e.app_version, e.platform, e.created_at, u.email, e.meta
from app_events e left join auth.users u on u.id = e.user_id
where e.event_name in ('save_submit_debug','save_timing_debug','save_netcheck_debug')
  and e.created_at > now() - interval '7 days' order by e.created_at desc;

-- Oturum bazlı rotasyon kadansı (fırtına avı)
with rt as (select session_id, created_at,
  lag(created_at) over (partition by session_id order by created_at) as prev
  from auth.refresh_tokens where created_at > now() - interval '3 days')
select session_id, count(*),
  round(avg(extract(epoch from (created_at-prev)))::numeric) as avg_gap_s,
  round(min(extract(epoch from (created_at-prev)))::numeric) as min_gap_s
from rt group by 1 order by max(created_at) desc;

-- Günlük rotasyon hacmi (28 Haz sıçraması = istemci yara bandı rollout'u)
select date_trunc('day', created_at)::date, count(*) from auth.refresh_tokens
where created_at > now() - interval '21 days' group by 1 order by 1;

-- Mükerrer kayıt taraması
select a.type, a.amount, a.created_at, b.created_at
from islemler a join islemler b on a.isletme_id=b.isletme_id and a.type=b.type
 and a.amount=b.amount and a.date=b.date
 and coalesce(a.cari_id::text,'-')=coalesce(b.cari_id::text,'-')
 and coalesce(a.description,'-')=coalesce(b.description,'-') and a.id<b.id
 and b.created_at - a.created_at between interval '1 second' and interval '120 seconds'
where a.created_at > now() - interval '7 days';
```

```
# EAS build kimlikleri (ground truth)
npx eas-cli build:list --platform ios --limit 3 --non-interactive --json
# 66=db98fb7 (14 Tem, #3 yara bandı içinde) · 67=iptal · 68=4c72c4e=HEAD (16 Tem, TestFlight)
```
