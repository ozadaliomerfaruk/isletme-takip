# Net Varlık Trendi — Denetim Raporu ve Yeniden Tasarım Planı

> **Tarih:** 9–10 Temmuz 2026 · **Denetim:** çok-ajanlı kod + finans modeli + üretim verisi (işletme "Dilruba") incelemesi; bulguların büyük kısmı çekişmeli doğrulayıcılarla CONFIRMED, aritmetik üretim SQL'iyle kuruşu kuruşuna kapatıldı.
> **Bu doküman implementasyon içindir:** bölüm 4–6'daki işleri sırayla uygula. Migration'lardan önce MUTLAKA `node scripts/backup.js`.
> **Revizyon (10 Tem):** BUG-1 fix reçetesi düzeltildi — ilk sürümdeki yönsüz `amount × exchange_rate` formülü yanlıştı (implementasyon incelemesinde yakalandı, `currency.ts:604-640`'a karşı doğrulandı); doğru reçete §3'teki yönlü CASE'dir.
> **🏁 PROJE DURUMU (10 Tem 04:30 — TAMAMLANDI):** M1+M2+M3 üretimde canlı (commit e25bcf4/55c937f/c79915e; 6-işletme impersonation + cihaz teyidi; crit-1 rezidüel 0). Semantik kararı: **S1 kesin** (§1 Nihai Karar — Thy=takip defteri/çift-sayım, altın davalı, hediye kartı likit değil); M4 ve bilgi satırı İPTAL; M5 kullanıcı kararıyla yapılmadı (retroaktif yeniden-yazma kabul edildi; ileride istenirse eklenebilir ama o güne kadarki statü tarihçesi kayıp olur). Frontend §5 cilası commit **5ba2aec** (rozetler + kayıt-yok + kur uyarısı + S1 dipnotu; typecheck + 270 test). **Kalan:** branch push + app build + cihazda §5 teyidi.

---

## 0. Arka plan: bu rapor neden yapıldı?

**Olay:** Net Varlık Trendi özelliği geliştirildi ve 1.5.5 build'iyle işletme sahibinin (uygulama geliştiricisinin kendi işletmesi "Dilruba", hesap ozadaliomerfaruk@gmail.com) gerçek verisinde ilk kez kullanıldı. Kullanıcı ekrana bakınca verilere güvenemedi ve derinlemesine denetim istedi.

**Kullanıcının şikayeti (kendi ifadesiyle):** *"2022 yılında ben 14 milyon artıda değildim. Bu kadar artıya girdiğimi hatırlamıyorum. Verileri, matematiksel hesaplamaları, arşivlenmiş hesapları, pasif hesapları vs. doğru kurgulamış mıyız — her şeyi kontrol edin."*

**Ekran görüntüsünde görülen (nominal ₺, "Tümü" penceresi, Haz'23 → Oca'22 aralığına scroll edilmiş):**

| Ay | Net Varlık (ay sonu) | Değişim |
|---|---|---|
| Haz'23 | 12.888.271,10 | +233.193,09 |
| May'23 | 12.655.078,01 | −1.081.395,67 |
| Nis'23 | 13.736.473,68 | +857.442,15 |
| Mar'23 | 12.879.031,53 | −285.349,36 |
| Şub'23 | 13.164.380,89 | −120.881,67 |
| Oca'23 | 13.285.262,56 | −158.361,32 |
| Ara'22 | 13.443.623,88 | −316.272,74 |
| Kas'22 | 13.759.896,62 | −343.227,11 |
| Eki'22 | 14.103.123,73 | +46.304,01 |
| Eyl'22 | 14.056.819,72 | −356.938,95 |
| Ağu'22 | 14.413.758,67 | −138.720,60 |
| Tem'22 | 14.552.479,27 | −45.578,48 |
| Haz'22 | 14.598.057,75 | −24.231,25 |
| May'22 | 14.622.289,00 | +383.412,70 |
| Nis'22 / Mar'22 / Şub'22 | 14.238.876,30 | 0,00 |
| Oca'22 | 14.238.876,30 | — |

**Ekran görüntüsünün kendisinden okunan şüpheli desenler (denetimle hepsi açıklandı):**
- Seviye ~13–14,6M ₺ iken bugünkü Genel Durum ekranı bambaşka bir sayı gösteriyor (gerçekte **−4,39M**, kullanıcı net borçlu) → seviyenin kendisi şüpheliydi.
- Ayların büyük çoğunluğu kırmızı (−25K…−1,08M): sanki işletme 4,5 yıl boyunca sürekli para eritmiş → gerçekte bu düşüşlerin ana kaynağı "bugün pasif olan carilere/personele o ay yapılan ödemelerin gider yazılması" çıktı (§2).
- Şub–Nis'22 üç ay üst üste tam 0,00 değişim → faal bir işletmede imkânsız; kayıt yokluğu çıktı (o aylarda 0–1 işlem var; gerçek veri May'22'de başlıyor).
- Serinin Oca'22'den başlaması → o ayda tek 350 ₺'lik kayıt olduğu için kırpma mantığının seriyi 4 ay erken başlatması.

**Kullanıcının bu denetimden sonra netleşen asıl gereksinimi (kendi ifadesiyle özetle):** *"Her ay sonunda Genel Durum'a bakıyorum; +500 bin, −300 bin gibi her ay değişiyor. Zaman zaman bazı carileri/personeli pasife alıyorum ya da arşivliyorum. Bugün pasif/arşivde olan bir cari, geçmiş ayların genel durumuna dahil edilmeli mi edilmemeli mi — bu net olsun. Finansal matematiğin yanıltmaması çok önemli. Bu rapor bu şekliyle yapılabilir mi?"* → Fizibilite cevabı ve karar §1'de; teknik kök nedenler §2–3'te; yapılacak işler §4–6'da.

---

## 1. Kullanıcının istediği rapor ve fizibilite kararı

**İstek:** "Her ay sonunda Genel Durum ne idiyse onu gören bir trend. Carileri/personeli zaman içinde pasife/arşive atıyorum; bugün pasif olan bir entity geçmiş aylara dahil mi edilmeli, edilmemeli mi? Finansal matematik yanıltmasın."

Üç olası semantik var; fizibilite şu:

| Semantik | Tanım | Mümkün mü? |
|---|---|---|
| **S1 — Bugünkü küme** (mevcut tasarım) | Bugünkü aktif+arşivsiz küme tüm geçmişe uygulanır; son ay = Genel Durum ekranı birebir | ✅ Mevcut, ama **2 bug'lı** (bkz. §3) ve geçmişi yapısal olarak çarpıtıyor: bugün pasif olan cariye 2023'te yapılan ödeme "gider" yazılıyor → kullanıcının gördüğü sürekli −300K'lık aylar ve 2022'de +14,2M hayaleti |
| **S2 — Herkes dahil, as-of bakiye** (ÖNERİLEN) | Her ay sonu için TÜM entity'lerin (pasif/arşiv dahil) o tarihteki bakiyeleri toplanır: `NW(M) = Σ bakiye_e(M)` | ✅ **Tam olarak yapılabilir.** Bakiye geri-sarımı deterministik: `bakiye_e(M) = bugünkü bakiye − Σ ops(tarih > M)`. Ekonomik olarak dürüst tek seri budur |
| **S3 — O tarihteki statüyle** ("Mart 2023'te Thy aktifti, o ay dahil; Eylül 2024'te pasife aldım, sonrası hariç") | Her ayın dahil kümesi o AYDAKİ pasiflik durumuna göre | ❌ **Geçmiş için imkânsız:** `is_active/is_archived` yalnız güncel bayrak, **statü değişiminin tarihi hiçbir yerde tutulmuyor**. ✅ İleriye dönük mümkün: `deactivated_at/archived_at` kolonları eklenirse (M5) bu tarihten sonra S3 hesaplanabilir |

### Karar önerisi (finansal gerekçeyle)

- **Pasif/arşivli entity geçmişe DAHİL EDİLMELİ (S2).** Pasifleştirme bir *görüntüleme tercihi*dir, ekonomik olay değildir: bugün pasif olan tedarikçiye 2023'te olan borcun o gün gerçekti. Bugünkü bayrağı geçmişe uygulamak (S1) tam olarak kullanıcının yaşadığı yanılsamayı üretir — üretim verisinde kanıtlandı (bkz. §2).
- **İstisna — "write-off" niyeti:** kullanıcı pasifleştirmeyi "bu alacak öldü" anlamında kullanıyorsa bu GERÇEK bir ekonomik olaydır; ama tarihi kayıtlı olmadığı için geçmişe işlenemez. M5 (`deactivated_at`) bu yüzden şimdi eklenmeli — ileride "pasife alındığı aydan itibaren düş" seçeneği mümkün olur.
- **UI çözümü:** trend ekranına toggle: **"Tümü (pasifler dahil)"** (default, S2) ↔ **"Yalnız aktifler"** (S1, bug-fix'li). S2 modunda son nokta Genel Durum'dan pasif bakiye stoku kadar farklıdır; ekranda tek satır açıklama göster: *"Genel Durum: −4,39M · pasif/arşivli bakiyeler: +2,96M"*. S1 modunda son ay = Genel Durum birebir kalır.
- **Aylık değişim beklentisi:** kullanıcının "ay sonu +500K / −300K" gözlemine karşılık gelen doğru sayı, S2'nin aylık değişimidir (= o ayın herkes-dahil net'i). Dilruba verisinde S1 penceresi −12,22M "kayıp" gösterirken herkes-dahil gerçek net −2,20M — S2, gerçeğe 5,6 kat daha yakın.

### ⚖️ NİHAİ KARAR (10 Tem, kullanıcı — yukarıdaki S2 önerisini GEÇERSİZ KILAR)
Kullanıcı S1'i seçti: **pasif/arşivliler Genel Durum'a ve trend'e HİÇ dahil edilmez; yalnız aktif hesaplara dokunan nakit bacakları sayılır** (= M2 sonrası deployed davranış, aynen kalır). Gerekçesi güçlü ve S2 önerisinin öngörmediği bir gerçeğe dayanıyor: pasif cariler bu kullanıcıda çoğunlukla **takip/mükerrer defter** — ör. Thy carisi "bize ne kazandırdı" takibi için tutulmuş, cirosu ZATEN nakit/banka hesaplarına gelir yazılmış; Thy bakiyesini dahil etmek **çift sayım** olurdu. Kapanmış-arşivli cari örneği (500K satış + 500K tahsilat): nakit bacağı +500K zaten sayılıyor, cari bakiye 0 — doğru. **Sonuçları:** M4 iptal/ertelendi; bilinen ve kabul edilen sınırlar: (1) hariç entity'yle akışlar nakit-esaslı zamanlamayla görünür (tahsilat/ödeme ayında), (2) yeni bir pasifleştirme geçmiş ayları yeniden yazar → M5 ileriye dönük çözer, (3) gerçek varlık taşıyan pasif hesaplar (altın ~877K) servetten gizli kalır — kullanıcının bilinçli tercihi; bilgi satırıyla görünür kılınacak.

---

## 2. Üretim verisiyle kanıtlanan tablo (Dilruba, 9 Tem 2026)

Ekrandaki seri SQL ile birebir yeniden üretildi. Kapanış:

```
Oca'22 (ekran)  14.238.876,30
= Genel Durum      −4.388.476,79   (bugün; cari borç −5,49M domine ediyor)
+ Σnet geri-ekleme +12.222.620,26  (Şub'22→Tem'26 v2-RPC net'i)
+ Σaçılış          +6.404.732,83   (tamamı Şub'26'ya yazılı)
+ Oca'22 net              +350,00
```

Geri eklenen +18,63M'nin ayrıştırması:

| Bileşen | Tutar | Nitelik |
|---|---|---|
| "Nakit Euro" hayalet açılışı | +7.668.295,60 | **BUG-1** (CONFIRMED) |
| Pasif-entity merceği (S1 semantiği) | +10.026.787 | ~7,31M'si **BUG-2** (CONFIRMED), kalanı S1 tasarımının sonucu |
| Gerçek (herkes-dahil) kayıtlı kayıp | +2.195.834 | Veri gerçeği |
| Gerçek açılışlar | −1.263.563 | Veri gerçeği |

Diğer doğrulanmış veri gerçekleri:
- Kayıtlar fiilen **May'22'de** başlıyor (Oca'22: 1 işlem/350 ₺; Şub–Mar: 0; Nis: 1 işlem — arşivli cariye, P&L'e 0 düşüyor). Ekrandaki düz 14,2M platosu **kayıt yokluğu**.
- Tüm entity'ler **19 Şub 2026** created_at'li (geriye dönük import profili).
- Pasif stokta Genel Durum DIŞI servet: Thy carisi **+2.606.870**, pasif "Altın" hesabı **141,83 XAU ≈ +876.639**, toplam pasif stok ≈ **+2.964.075 ₺**.
- Bug-1 + Bug-2 + açılış-tarihi düzeltilirse Oca'22 ≈ **−3,46M** (kullanıcının sezgisiyle uyumlu, negatif).
- Temiz çıkanlar: hesapsız gelir/gider 0 satır; orphan 1 satır (50 ₺); ileri-tarihli etki 0; gerçek mükerrer şüphesi ≤ ~1,04M (marjinal). Üretim RPC'leri repo ile birebir; `islemler.date` TR-local `timestamp without time zone`, ay atamaları güvenli.
- Walk-back client kodu (`useNetWorthTrend.ts`) **hatasız** (CONFIRMED) — sorunlar beslendiği RPC'lerde ve semantikte.
- ÇÜRÜTÜLEN hipotez: "bugünkü bakiye mutabakat hataları 2022'yi kaydırır" — cebirsel olarak geçmişe etkisi 0 (ödeme eklemek net-sıfır; bakiye düzeltmesi opening'e emilir).

---

## 3. Doğrulanmış bug'lar

### BUG-1 — Açılış RPC'si çapraz-para leglerde ham `amount` kullanıyor (KRİTİK)
- **Dosya:** `supabase/migrations/20260708040000_get_networth_opening_by_month.sql`
- `hesap_delta_target` (satır 56-60): transfer hedef bacağı `SUM(i.amount)` — oysa `computeBalanceOps` (`src/lib/islemBalanceOps.ts:57`) hedefe `converted() = amount × exchange_rate` yazar.
- `cari_delta`'da `cari_odeme THEN i.amount` (satır 66) ve `personel_delta`'da aynı sorun — app tarafı `converted()` işler (`islemBalanceOps.ts:66,77,87`; `cari_tahsilat/personel_tahsilat` de `−converted()`).
- **Kanıtlanmış etki:** 23 Nis 2025 tek transfer (147.000 TL → 3.500 EUR, kur 42) "Nakit Euro"ya +147.000 EUR sayılıyor → türetilmiş açılış −143.500 EUR = **−7.668.295,60 ₺** çöp değer Şub'26'ya → öncesi TÜM aylar +7,67M şişik. Albaraka (+562K sapma) ve Nakit Kasa (+917K) açılışları da bozuk.
- **Fix (DÜZELTİLMİŞ REÇETE — 10 Tem implementasyon incelemesi):** ⚠️ İlk sürümde burada yönsüz `amount × exchange_rate` yazıyordu — **YANLIŞTI** ve uygulansaydı durumu kötüleştirirdi (147.000 TL→EUR, kur 42: doğru değer 147000/42 = 3.500 EUR; yönsüz çarpma 6.174.000 EUR = açılışı ~−329M ₺'ye savururdu). Gerçek semantik `calculateTargetAmount` (`src/lib/currency.ts:604-640`): kur formatı **"1 yabancı = X TRY"** ve dönüşüm YÖNLÜ. SQL'de karşı-taraf (converted) legleri için bunu birebir aynala:

  ```sql
  -- computeBalanceOps.converted() = calculateTargetAmount birebir aynası
  CASE
    WHEN COALESCE(i.source_currency,'TRY') = COALESCE(i.target_currency,'TRY')
      THEN i.amount                                        -- aynı para birimi: dönüşüm yok
    WHEN COALESCE(i.source_currency,'TRY') = 'TRY'
      THEN i.amount / NULLIF(i.exchange_rate, 0)           -- TRY → döviz: BÖL
    ELSE i.amount * i.exchange_rate                        -- döviz → TRY ve döviz→döviz: ÇARP
  END
  ```
  Veri teyidi (10 Tem, üretim): 42 çapraz-para işlemin TAMAMI ya TRY→döviz ya döviz→TRY yönünde — döviz→döviz hiç yok. Yani `ELSE` dalı bugünkü veride ölü koddur ama KALMALI: app'in basitleştirilmiş döviz→döviz davranışıyla (`currency.ts:635-639`, ×rate) birebir aynalama, ileride böyle bir kayıt oluşursa RPC ile app'in yine aynı sonucu üretmesini garantiler.
  Not: app tarafı çapraz-para işlemde geçersiz/eksik kuru INSERT'ten önce reddeder (`calculateTargetAmount` throw, `safeParseExchangeRate` ≤0 throw) → üretimde `exchange_rate NULL/0 + source≠target` satır beklenmez; yine de `NULLIF` koruması NULL üretirse o leg'i `i.amount`'a düşürmek yerine satırı loglayıp ham amount ile geçmek kabul edilebilir (mevcut buggy davranışla aynı, daha kötü değil). Hangi işlemler hangi legde converted: `islemBalanceOps.ts` — transfer HEDEF hesabı, cari_odeme/tahsilat'ın CARİ bacağı, personel_odeme/tahsilat'ın PERSONEL bacağı converted; hesap kendi bacağı her zaman ham `amount`.

### BUG-2 — v2 P&L RPC'sinde eksik simetrik kurallar (KRİTİK)
- **Dosya:** `supabase/migrations/20260709030000_pl_trend_exclude_entity_cash.sql` satır 76-90.
- Var olan kural: `cari_odeme AND h_incl AND c_excl → gider`. **Eksik olanlar** (dahil-küme NW'sini değiştirdiği halde 0 sayılan akışlar):
  - `cari_odeme / personel_odeme AND h_excl AND c_incl/pe_incl → GELİR` (pasif hesaptan aktif cariye ödeme: dahil cari bakiyesi artar)
  - `cari_tahsilat / personel_tahsilat AND h_excl AND c_incl/pe_incl → GİDER` (dahil cariden pasif hesaba tahsilat: dahil alacak düşer)
  - NULL-leg kombinasyonları: `c_excl` tanımı `c.id IS NOT NULL AND pasif` olduğundan `cari_id NULL` akışlar hiçbir kurala düşmüyor; `h_incl AND (c.id IS NULL)` ödeme = nakit dahil-kümeden çıkıyor ama sayılmıyor. Kuralları "akışın dahil-küme etkisi" üzerinden yeniden yaz (her leg için: leg dahil mi? → delta topla), CASE-kombinasyon avlamak yerine.
- **Kanıtlanmış etki:** Dilruba'da 244 işlem, pasif hesaptan aktif cariye **5.709.813,69 ₺** + aktif personele **1.401.910,93 ₺** kaçak → geçmiş ~+7,31M şişik.
- **Ek (aynı migration'da):** çapraz-para dahil↔dahil transfer/ödeme "net-sıfır" sayılıyor; güncel-kur değerlemesinde değil (−amount×kur_src + converted×kur_tgt). Converted legleri BUG-1'deki gibi düzelt; dahil↔dahil çapraz-para farkını o ayın net'ine yaz.

### Tasarım kusurları (bug değil ama düzeltilmeli)
- **T1 — Açılışlar `created_at` ayına gidiyor** (satır 88/99/109): geriye dönük import kullanıcısında −6,4M açılış Şub'26'ya yığılıyor. Fix: `date_trunc('month', LEAST(e.created_at, entity'nin ilk işlem tarihi))`.
- **T2 — Tüm geçmiş bugünkü kurla TRY'ye çevriliyor** + kur yoksa sessiz `COALESCE(...,1)`. S2 RPC'si para-birimi kırılımlı dönmeli; client aylık EVDS kuru uygulasın (tablo `ekonomik_gostergeler` zaten var, `useEconomicIndicators` okuyor).
- **T3 — Negatif birikim asimetrisi:** `useFinancialSummary.ts:109` negatif birikimi Genel Durum'a katmaz, RPC katar. Dilruba'da etkisiz ama 3 kiracıda MATERYAL (yukarıda M2 satırı) → M2'de her iki RPC'ye anchor aynası olarak eklenir. ⚠️ Bilinen kırılganlık artık CANLI: üyelik bakiye işaretine bağlı — birikim hesabı ileride pozitife dönerse o kiracının tüm geçmişi kayar. BACKLOG (ürün kararı): anchor'ın bu kuralının kendisi finansal olarak sorgulanmalı — negatif birikim ekonomik olarak yine borçtur; dışlamak Genel Durum'u iyimser gösterir VE trend üyeliğini istikrarsızlaştırır. Kural değişirse tek karar noktasından (anchor + 2 RPC birlikte) değişmeli.

---

## 4. Migration planı (sıralı; hepsi additive / `CREATE OR REPLACE`, eski client'lara etkisiz*)

> \* Bu iki RPC'yi YALNIZ Net Varlık Trendi ekranı çağırıyor (v1.5.5+ build'ler). İmzalar korunarak REPLACE güvenli; 1.5.3 ve öncesi client'lar bu fonksiyonları hiç çağırmaz. Yine de önce `node scripts/backup.js` + migration sonrası §6 doğrulama sorguları.

| # | İş | İçerik | Etki |
|---|---|---|---|
| **M1** | `get_networth_opening_by_month` v2 | BUG-1 fix: tüm çapraz-para leglere **yönlü converted() formülü** (§3'teki SQL — TRY→döviz BÖL, döviz→TRY ÇARP; yönsüz çarpma KULLANMA) | Hotfix — canlı 1.5.5/1.5.6 ekranı **build'siz** düzelir; Dilruba'da −7,67M hayalet kaybolur |
| **M2** | `get_networth_pl_trend` v3 **+ opening v3 (T3, atomik)** | BUG-2 fix: LEG-ETKİ modeli (tip×kombinasyon kuralı yok) + NULL-leg semantiği + çapraz-para leg düzeltmesi; **T3 (negatif-birikim dışlaması) HER İKİ RPC'ye birden** — tek migration'da, yoksa birikim kiracılarında rezidüel açılır. T3 materyalitesi kanıtlı: 3 kiracıda aktif negatif birikim var (0f05e087 −201.220, fea1e41e −191.127 "Erdem borç", aca33e4d −100); fea1e41e'de T3'süz rezidüel 191.127 kalıyor ve düzeltmenin tamamı NET tarafından geliyor (Erdem borç'un türetilmiş açılışı 0) — simetrik yerleştirmenin gerekliliğinin kanıtı. Tasarım ön-doğrulaması GEÇTİ: GS(−4.295.909,81) = Σopening(234.472,28) + Σnet_v3(−4.530.382,09), rezidüel 0,00. NULL-cari cari_* 4 satır (kiracı-geneli) v3'te sayılmaz = bilinçli düzeltme. | Hotfix — build'siz; geçmişteki ~+7,31M kaçak kapanır |
| **M3** | Açılış ayı | T1: `LEAST(created_at, MIN(islemler.date))` (entity bazında; işlemsiz entity için created_at) | Retro-import kullanıcılarında açılışlar gerçek başlangıca taşınır |
| **M4** ⛔ | **İPTAL/ERTELENDİ (10 Tem kullanıcı kararı — bkz. §1 Nihai Karar; yerine frontend'e "pasif bakiyeler bilgi satırı"). Eski spec ileride istenirse diye duruyor:** `get_networth_asof_monthly(p_isletme_id, p_start, p_end, p_include_passive boolean)` | S2 serisi: her ay-sonu için entity bakiyelerini geri-sararak (`bugünkü balance − Σ ops(date > ay_sonu)`, ops = computeBalanceOps birebir, converted legler DAHİL) **ay × para birimi** toplamları döndür. `p_include_passive=false` → yalnız bugünkü aktif küme (S1 uyumu). SECURITY DEFINER + `user_has_isletme_access` guard + REVOKE anon (mevcut kalıpla aynı) | Yeni default seri; açılışlar doğal olarak "her zaman vardı" olur (ayrı opening RPC'sine gerek kalmaz); FX kırılımı client'ta aylık kurla değerlenebilir |
| **M5** | Statü tarihçesi | `hesaplar/cariler/personel`e `deactivated_at timestamptz NULL`, `archived_at timestamptz NULL` (DEFAULT NULL, backfill YOK); app statü toggle'larında set/clear | İleride S3 ("o tarihte pasif miydi") mümkün olur; write-off semantiği tarihlenebilir. **10 Tem: OPSİYONELE alındı** (kullanıcı S3 istemedikçe şart değil). Fable notu: yine de frontend build'iyle birlikte eklenmesi önerilir — kaydedilmeyen statü tarihi sonradan GERİ GELMEZ; feature store'a çıkmadan eklenirse tüm kullanıcı tabanının statü geçmişi ilk günden birikmeye başlar |

### M2 tasarım notları (v3 yazılmadan önce okunmalı)

1. **Kural-listesi değil, LEG-ETKİ modeli kur.** Her işlem için: `etki = Σ(leg delta × leg'in entity'si dahil mi)` — hesap bacağı ham amount (h dahilse), karşı bacak `_nw_convert`'li converted (cari/personel/hedef dahilse). BUG-2'nin tüm kombinatorik boşluk sınıfı (h_excl∧c_incl, NULL-leg…) bu modelde YAPISAL olarak imkânsızlaşır; NULL-entity'li leg doğal olarak 0 katkı verir (v2'deki "NULL hesaplı gelir sayılır" tuhaflığı da kendiliğinden düzelir — bu davranış değişikliğini kiracı-geneli kontrol et: hesapsız gelir/gider satırı olan başka işletme var mı). gelir/gider kolonlarına bölüştürme: işlem etkisi pozitifse gelir, negatifse gider (net değişmez; kolon dağılımı v2'den farklılaşabilir, ekran net'i kullanıyor — kabul edilebilir, nota yaz).
2. **T3 / negatif birikim:** anchor'da üyelik bakiye İŞARETİNE bağlı (negatif birikim tamamen dışarıda, `useFinancialSummary.ts:109`). v3 anchor'ı BİREBİR aynalamalı (bugünkü işarete göre h_incl/h_excl) — "son ay == Genel Durum" invariantı bunun için var. Bilinen kırılganlık: işaret ileride flip olursa tüm geçmiş kayar; yoruma yaz, Dilruba'da etki 0 ama multi-tenant'ta negatif birikimli işletme var mı diye tek sorgu koş.
3. **Dahil↔dahil çapraz-para netleşmesi:** leg-etki modeli bunu otomatik çözer (−amount×kur_hesap + converted×kur_karşı ≠ 0 farkı o ayın net'ine düşer) — ayrı kural YAZMA, modelin doğal çıktısı olsun.
4. **M2 sonrası kabul:** Dilruba'da pencere-öncesi rezidüel ≈ 0 (Kasa/Albaraka +575K açılışa emildiği için rezidüelde GÖRÜNMEZ — sıfır beklentisi geçerli); son ay == generalStatus; v2-vs-v3 snapshot-diff yine ≥3 işletme + negatif kontrol (tek-para-birimli, hepsi-aktif işletmede v2≈v3 çıkmalı, yalnız v2'nin bug'lı kalemleri kadar fark). ÖN-DOĞRULAMA GEÇTİ (10 Tem): crit-1 rezidüel 0,00 × 6 işletme (3 birikim kiracısı dahil); v2−v3 toplam farkı Dilruba'da +7.599.321,19; apply-sonrası beklenen net_v3 değerleri 6 işletme için kayıtlı.
5. **⚠️ Kabul için EK iki şart (toplam-düzeyi kanıt yetmez):**
   (a) **AYLIK dağılım defteri:** crit-1 yalnız TOPLAMI test eder — akışı yanlış AYA yazan bir hata rezidüel-0'ı yine geçer (trend aylık bir rapor!). Dilruba için v2-vs-v3 AYLIK seri diff'i çıkarılmalı; değişen aylar yalnız beklenen kalemlerle (pasif-hesap→aktif-cari ödemeleri, çapraz-para transferler, NULL-cari 4 satır) açıklanmalı.
   (b) **Fark defteri:** +7.599.321,19 bugünkü veride kalem kalem kapatılmalı: BUG-2 kural-boşluğu bucket'ları + dahil↔dahil çapraz-para net-değerleme + NULL-cari (−50) + T3(Dilruba=0). Denetimdeki +7.310.363 o günkü veriyleydi; bugünkü veriyle yeniden ölçülmeli — kapanmayan artık varsa v3'te istenmeyen davranış değişikliği saklanıyor demektir.
   **✔ HER İKİSİ DE KAPANDI (10 Tem):** (a) aylık v2-vs-v3 defteri çıkarıldı — ay ataması birebir (`date_trunc` aynı), diff'ler beklenen desende (BUG-2 pozitif düzeltmeler, FX-değerleme negatif aylar, 2026-03'te tam −50,00 NULL-cari); (b) 9 kalemlik fark defteri KURUŞ FARKSIZ kapandı (Σ = +7.599.321,19; dominant kalem cari_odeme 5.709.813,69 denetim ölçümüyle birebir). Fable satır-satır SQL incelemesini de tamamladı: 13 tipin leg işaretleri computeBalanceOps'la birebir, leg TRY-değerlemesi ENTITY para birimi kuruyla (anchor paritesi doğru tercih), T3 her iki RPC'de simetrik, NULL/COALESCE/grant/imza temiz — HAKEM ONAYI VERİLDİ. Dipnot: fark defterindeki personel_odeme kalemi (1.748.771) denetimin 9 Tem ölçümünden (1.401.911) büyük; muhtemel neden yeni bucket'ın hesap_id NULL personel_odeme'leri de kapsaması (v3'te doğru davranış) + veri canlılığı — tek sorguyla adı konabilir, bloker değil.

## 5. Frontend işleri (build gerektirir; M1–M3 bunlarsız da değer üretir)

1. ~~Toggle~~ → ~~Bilgi satırı~~ → **Sade dipnot (10 Tem final karar):** pasif stok TUTARI gösterilmez — "+2,96M dahil değil" yazmak "gizli servetin var" izlenimi verirdi, oysa o tutar serbest servet değil (altın tazminat davasıyla yükümlü, Thy çift-sayım/takip defteri, hediye kartı likit değil). Bunun yerine dipnota tek cümle (i18n-only, reports.json): *"Pasif/arşivli kayıtlar ve stok değeri net varlığa dahil değildir."*
2. **Dürüstlük rozetleri:** seyrek-kayıtlı baş ayları soluklaştır (ör. aylık işlem sayısı pencere medyanının %10'u altındaki BAŞTAKİ aylar) + "bu aylarda kayıt az; değerler bugünden geriye hesaplanmıştır" ibaresi. İlk satıra "başlangıç değeri türetilmiştir" notu. Dipnota stok cümlesi: "stok değeri net varlığa dahil değildir; mal alımları gider olarak düşer".
3. **`conversionIncomplete`'i ekrana taşı:** `useNetWorthLenses.ts` return'üne ekle (şu an `useNetWorthTrend.ts:199`'da üretilip yutuluyor), `net-varlik-trend.tsx` uyarı göstersin.
4. **Cache tutarlılığı:** trend RPC verisi ile canlı generalStatus karışımı, refetch penceresi boyunca tüm seriyi paralel kaydırabiliyor (CONFIRMED, `queryKeys.ts:640-645` refetchType:'active'). Çözüm: `isFetching` sırasında tabloda belirgin "güncelleniyor" durumu VEYA trend queryKey'ine bakiye-sürümü (ör. islem mutation sayacı) ekle. M4 as-of RPC'sine geçince anchor bağımlılığı zaten kalkar → sorun kökten çözülür (RPC son ayı da kendisi hesaplar; "son ay == Genel Durum" doğrulaması yalnız S1 modunda gösterilir).
5. **`change === 0` semantiği:** "0,00" yerine o ay hiç işlem yoksa "—/kayıt yok" göster (M4 RPC'si aylık işlem sayısını da dönebilir).

## 6. Kabul kriterleri ve doğrulama sorguları (implementasyon sonrası zorunlu)

Dilruba (isletme_id `7d554694-d608-47b7-8463-28302fe13552`) referans değerleri:

1. **Kimlik korunuyor:** `generalStatus = Σopening + Σops` kuruş farksız kalmalı (şu an: −4.388.476,79 = −6.404.732,83 + 2.016.256,04).
2. **M1 sonrası — DİKKAT, Σopening için tek sayı hedefi KOYMA:** "+1.263.563" (= eski −6,40M + EUR çöpü 7,67M) yalnız Nakit Euro düzeltmesini varsayar; oysa fix Albaraka'nın (türetilmiş +562.535 vs initial_balance 18.082) ve Nakit Kasa'nın (+916.832 vs 0; ör. 70 XAU→TRY bacağı ham 70 yerine ~433K sayılacak) FX-gelen bacaklarını da düzeltir → Σopening +1,26M'den DAHA DÜŞÜK çıkacaktır (muhtemelen ~−0,2M…+1,3M bandı). Doğru kabul kriterleri **entity bazında**: "Nakit Euro" türetilmiş açılışı ≈ 0, "Albaraka" ≈ +18.082 (initial_balance), "Nakit (Kasa)" ≈ 0'a yaklaşmalı; büyük sapması kalan hesap varsa nedeni açıklanabilir olmalı (kaydedilmemiş gerçek akış = meşru). Σopening'in kesin değeri kimlikle (kriter 1) zaten sabitlenir — tanı amaçlı raporla, hedef olarak kullanma.
   **Doğrulama sonucu (10 Tem, M1 öncesi kanıt turu):** yönlü fix entity-bazlı KANITLANDI — Nakit Euro 0,00 ✓, Altın 389,69 = initial ✓, Yapı Kredi ve 12+ hesap resid=0 ✓. İki hesapta fix-BAĞIMSIZ, önceden var olan veri kalıntısı kaldı: **Nakit (Kasa) +379.726,63** (initial 0) ve **Albaraka +195.534,05** (initial 18.082,43) — tüm işlem tipleri modellenmiş, kaynak/hedef legler doğrulanmış; iki eş-olası neden: (a) import metodolojisi — geçmiş-dönem nakit pozisyonunun initial_balance yerine doğrudan balance'a yazılması (bu durumda +575K hata değil, yanlış kolonda duran GERÇEK devir parasıdır ve açılışa emilmesi tam doğrudur); (b) atomik olmayan geçmiş silme/düzenleme — kod tarihçesi bunu somutlar: eski silme akışı bakiye geri-alma + satır silmeyi AYRI adımlarla yapıyordu ve kendi yorumu "bakiye/stok telafisiz DESYNC olabiliyordu" der (`useIslemler.ts:600-603`; sonradan `delete_islem_atomik` RPC'ye geçilmiş) — residual o dönemin yara izi olabilir. Not: app_events İZ TAŞIMAZ — silme hiç loglanmıyor (yalnız `transaction_created` var, `useIslemler.ts:189`), yani residual veriden geri kurulamaz. Ayrım kullanıcı testiyle yapılır: fiziksel kasa sayımı stored balance ile tutuyorsa (a), tutmuyorsa sayım-farkı düzeltme kaydı gerekir (§5/P3). Silinen satır iz bırakmadığı için islemler'den geri kurulamaz; sunucuda audit tablosu yok (islem_kayitlari değil; tek olası iz `app_events`). **Bu kalıntılar M1'i BLOKLAMAZ:** `opening = balance − Σops` tanımı gereği açıklanamayan fark açılışa emilir — stored balance uygulamanın her yerinde gösterilen gerçektir, trend ona mutabık kalmalıdır. Bu iki değer regresyon nöbeti için BEKLENEN değer olarak sabitlendi; kalıcı çözüm kullanıcı tarafında kasa sayımı + sayım-farkı düzeltme kaydıdır (§5/P3 önerisi).
3. **M1+M2 sonrası (S1 modu):** pencere-öncesi rezidüel (`GS − Σv2net − Σopening`) **≈ 0 ± yuvarlama** olmalı (şu an +14.238.526,30). Bu, "invariant ihlali kalmadı" testidir; tip bazında rezidüel dökümü sorgusu denetimde kullanıldı, aynı yaklaşımla sıfırlanmalı.
4. **S1 son ay == Genel Durum** birebir (mevcut invariant, korunmalı).
5. **M4/S2:** son ay == Genel Durum + pasif stok (≈ −4.388.477 + 2.964.075 ≈ **−1.424.402**, o günkü bakiyelerle); Oca'22 S2 değeri negatif bölgede (~−3,5M ± açılış-tarihi etkisi) çıkmalı; aylık değişimlerin toplamı herkes-dahil net ile eşleşmeli (~−2,2M / 4,5 yıl).
6. **Regresyon:** RPC snapshot-diff (önce/sonra aylık çıktı karşılaştırması, en az 3 farklı işletmede — biri çok-para-birimli, biri pasif-yoğun); mevcut 225 test + typecheck; `scripts/backup.js` yedeği migration ÖNCESİ alınmış olmalı.

## 7. Bilinen sınırlar (düzeltme sonrası da geçerli — dipnotta söylenmeli)

- Silinen işlemler/entity'ler geriye dönük bilinemez; seri "bugünkü kayıt setinin" tarihidir.
- Kayıt-öncesi gerçek servet (ör. 2021 sonu) hiçbir modelle bilinemez; ancak kullanıcı tarihli "devir" kaydıyla girilebilir (gelecek iş: açılış bakiyesine opsiyonel tarih alanı).
- Statü değişim tarihçesi M5'ten ÖNCEKİ dönem için yoktur; S3 yalnız M5 sonrası dönem için hesaplanabilir.
- Stok/demirbaş net varlığa dahil değildir (mal alımı = gider); bu bilinçli basitleştirme kullanıcıya açıkça söylenmelidir.
