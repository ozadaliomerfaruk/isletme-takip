# Dilim 1 — Form Sadeleştirme & Hızlı Cari İşlemi Planı

> **Durum:** Tartışma bitti, uygulama BAŞLAMADI. Bu belge okunup onaylanınca implementasyona geçilecek.
> **Tarih:** 13 Temmuz 2026 · **Branch:** `feat/offline-read-cache`
> **Katkı:** Opus + Fable + kullanıcı üçlü tartışması; iddialar Supabase verisi ve kaynak koda karşı doğrulandı.

---

## 0. Neden bu iş? (tek paragraf)

Uygulama kayıt bulmakta zorlanmıyor — **tuttuğu kullanıcıyı kaybediyor.** Veri, tutunmanın tek en güçlü belirleyicisinin **ilk gün girilen cari sayısı** olduğunu gösterdi:

| İlk gün cari | Ertesi gün dönüş | 30+ gün tutunma |
|---|---|---|
| 0 cari | %39,8 | %15,3 |
| 1–2 cari | %24,8 | **%8,1 (en kötü)** |
| 3–5 cari | %55,9 | %30,5 |
| 6+ cari | %80,4 | **%43,8** |

Yani "1-2 cari girip bırakan" en kalabalık ve en kötü kova = **sürtünmeye yenilmiş, niyeti olan kullanıcı.** Bu sprintin işi: **defter tutmayı, uygulamayı "çözmeye" gerek kalmadan mümkün olan en kısa yoldan başlatmak.** Tema tek cümle: **"muhasebeci-eksiksiz" formlardan "esnaf-minimal" formlara.**

Kural (bütün formlara uygulanacak): **Birincil alanlar görünür; %15'in altında kullanılan her alan "Detaylar" akordeonunun altında.**

---

## 1. Kapsam — Dilim 1'de NE var, NE yok

**Dilim 1 (bu belge — etkinin ~%80'i, en çok dokunulan iki yüzey):**
1. **Cari ekleme/düzenleme formu** sadeleştirme
2. **İşlem formu (QuickTransactionBar)** sadeleştirme — foto + ileri-tarih akordeona
3. **#5 — Cari satırına basınca hızlı işlem sheet'i** ("peek + aksiyon")
4. **#4 — Kategori otomatik-doldurmayı geri al** (chip kalır, hesap prefill kalır)

**Dilim 2 (sonraki tur — mekanik tekrar):** Ürün / personel / hesap formları · #7 global yeşil "+" butonu · #1 etiket rename (etiket bulununca).

**Bu sprintin KAPSAMI DIŞI (ayrı masa):**
- ❌ Özellik öldürme (ileri-tarihli işlemler, foto/OCR) — nakit-avans disipliniyle ayrıca konuşulacak; şimdi sadece *görünürlük* değişiyor, kod kalıyor.
- ❌ Rehber-import onboarding adımı — retention'ın asıl kaldıracı ama ayrı iş kalemi.
- ❌ Yükümlülük-temelli push (GUC/cron) — ayrı backend turu.
- ❌ Döviz alanı — **zaten doğru yapılmış** (aşağıda açıklandı), dokunulmuyor.

---

## 2. Değişmez guardrail'ler (uygulama + review checklist'i)

Bu üç kural her formda **zorunlu**, aksi hâlde sadeleştirme veri-silme bug'ına döner:

1. **Düzenleme modunda akordeon otomatik açılır.** Eski kayıtta adres/not/foto gibi gizlenen bir alan doluysa, akordeon kapalı gelirse kullanıcı "verim silindi" sanır ya da görmeden üstüne yazar. **Dolu gizli alan varsa akordeon açık başlar.**
2. **Gizlenen alan submit'te `undefined` gider, `''` değil.** Boş string göndermek, eski kaydın dolu alanını sessizce siler. DB'ye dokunmuyoruz — forma da "boş yaz" dedirtmiyoruz.
3. **DB kolonu asla düşmez.** Sadece formdaki *görünürlük* değişir. Vergi no / son-4-hane gibi %0 alanlar bile kolon olarak durur (eski veri + eski client güvenliği).

---

## 3. Bölüm bölüm: kullanıcı ne görecek?

### 3.1 — Cari Ekleme Formu (`src/app/cariler/ekle.tsx` + düzenle)

**Veri (4.171 cari):** vergi no %0,0 · e-posta %0,7 · adres %7,2 · telefon %7,3 (kullananın %65'i sistematik) · not %6,9 · **açılış bakiyesi ≠ 0 → %60+** · tip müşteri/tedarikçi %61/39.

**Kod notu (önemli):** Ekleme formunda şu an ayrı bir "Vergi No" input'u **yok**; VKN yalnızca kart-tarama prefill'iyle nota yazılıyor (`ekle.tsx:54`). "Vergi no" alanı asıl **düzenleme** formunda olabilir — orada da kaldırılacak, ekleme formunda zaten yok.

#### ÖNCE (kullanıcı bugün ne görüyor)
Cari ekle'ye basınca **tek uzun kolon**, sırayla:
```
[Cari Tipi: Tedarikçi | Müşteri]
[Para Birimi: ₺ TRY  $ USD  € EUR ...]   ← yatay şerit, hep görünür
İsim
Telefon (opsiyonel)
E-posta (opsiyonel)
Adres (opsiyonel, 2 satır)
Açılış bakiyesi (opsiyonel)
  └ Bakiye yönü (bakiye girilince çıkar)
Not (opsiyonel, 3 satır)
[Vazgeç] [Kaydet]
```
Kullanıcı, 15 saniyelik bir işi yaparken 6 opsiyonel alanın arasından geçmek zorunda; %93'ü bunları boş bırakıyor ama hepsi görünüyor → "bu uygulama karmaşık" hissi.

#### SONRA (hedef)
```
[Cari Tipi: Tedarikçi | Müşteri]      ← kalır (tek dokunuş, %100 kullanılıyor)
[Para Birimi: ₺ TRY  $ USD  € EUR ...] ← DOKUNULMUYOR, olduğu gibi kalır
İsim
Açılış bakiyesi   ← YILDIZ alan, büyütülür/vurgulanır (tutunmanın çekirdeği)
  └ Bakiye yönü (bakiye girilince çıkar)
Telefon (opsiyonel)                   ← görünür kalır (import + WhatsApp döngüsü anahtarı)

▸ Detaylar (dokununca açılır)         ← AKORDEON, default KAPALI
     E-posta
     Adres
     Not
[Vazgeç] [Kaydet]
```
- **Yıldız:** Açılış bakiyesi görsel olarak öne çıkarılır (etiket + belki "Şu an sana borçlu mu, sen mi borçlusun?" mikro-yardım). Gömmüyoruz — tam tersi, formun yıldızı yapıyoruz.
- **Telefon** görünür-opsiyonel kalıyor: rehber-import gelince zaten dolu gelecek, ve "ekstreyi WhatsApp'tan yolla" döngüsünün anahtarı.
- **Detaylar akordeonu**: guardrail #1 gereği, düzenlemede bu alanlardan biri doluysa açık açılır.

**Kullanıcı etkisi:** Yeni cari ekleme, 6 opsiyonel alanlı tek kolondan → 3 görünür alana (İsim + Tip + Bakiye, + opsiyonel telefon) iniyor. "15 saniyede cari" hedefi.

---

### 3.2 — İşlem Formu / QuickTransactionBar (`src/components/transaction/QuickTransactionBar/`)

**Veri (63.380 işlem):** açıklama %28,2 (gerçek, kalır) · **foto %0,3** · **ileri/tekrarlı tarih %0,2** · döviz %0,1 (aşağıya bak) · **cari-bağlı %42,9** (işlemlerin neredeyse yarısı bir cariye yazılıyor — bu formun neden kritik olduğunun kanıtı).

**Bu form 63K kez açılıyor (cari formu 4K) — en çok tekrarlanan eylem, en büyük kaldıraç burada.**

#### Döviz — DOKUNULMUYOR (Fable'ın kod düzeltmesi)
Döviz "ölü alan" değil. `ExchangeRateBar` formda duran bir alan **değil**; yalnızca kaydet anında çapraz-para durumu tespit edilince beliriyor (`useTransactionSubmit.ts:369-420`). %0,1 = "çapraz-para işlem nadir" demek, "kimse istemiyor" değil (kullanıcının kendi Dilruba işletmesinde Dolar Nakit + Nakit Euro var). **Bu bileşen aslında akordeon kuralının şablonu:** gerekmedikçe görünmez, gerektiğinde kendiliğinden gelir. Aynen kalıyor.

#### Gerçek temizlik hedefi: iki giriş sık-yoldan çıkıyor
- **Foto girişi** (%0,3): Kaldırılmıyor — **akordeon/ikincil aksiyona** iniyor. ~190 kayıt var ve rafta bekleyen OCR/foto-import altyapısına bağlanacak; bilinçli atıl. Sık-yolda görünmez olur.
- **İleri-tarih görünürlüğü** (%0,2): Bu bir form alanı değil, ayrı bir alt-sistemin (`ileri_tarihli_islemler` tablosu + `process-scheduled-transactions` cron'u) kapısı. Girişi **akordeona** taşınır. Özelliğin kendisi öldürülmüyor — o ayrı bir karar (nakit-avans emsali: önce "üretimde 0 kayıt" doğrula, sonra sil).

#### ÖNCE / SONRA (kullanıcı)
- **ÖNCE:** Hızlı işlem çubuğunda tutar/tip/kategori/tarih ile birlikte foto ekle ve ileri-tarih kontrolleri de sık-yolda görünür/erişilir.
- **SONRA:** Sık-yol = **tutar + alış/satış + kategori chip + tarih (bugün).** Foto ve ileri-tarih "▸ Diğer / Detaylar" altında; ihtiyacı olan (nadir) kullanıcı bir dokunuşla açar.

---

### 3.3 — #5 Cari satırına basınca hızlı işlem ("peek + aksiyon" sheet)

Bu, tutunma tezinin ekrandaki kalbi. Amaç: cari takibine başlamak için uygulamayı çözmeye gerek kalmasın.

#### ÖNCE (kod: `(tabs)/cariler.tsx`, `ExpandableCard`)
Cari listesinde bir satıra basınca **satır aşağı doğru genişliyor** (ExpandableCard) ve içinde iki buton çıkıyor:
- **"İşlem Yap"** → `QuickTransactionBar`'ı cari-önseçili açar (`setSelectedCari + setQuickBarVisible`)
- **"Hareketleri Gör"** → `cariler/[id]` detayına gider

Yani bir işlem girmek için: **satıra bas (genişlet) → "İşlem Yap"a bas** = 2 dokunuş + genişleme animasyonu. Ve `ExpandableCard`, büyük veride cari detayında yaşadığımız yavaşlık riskini taşıyan bileşen.

#### SONRA (hedef: bottom-sheet, inline-expand DEĞİL)
Satıra bas → **alttan yumuşak bir sheet açılır** (mevcut QuickTransactionBar'ın cari-önseçili hâli — zaten var olan yol). Ama sheet iki niyeti birden karşılar:

```
┌─────────────────────────────────────┐
│  Ahmet Toptan            [Hareketleri Gör] │  ← başlık + ikincil aksiyon
│  Sana borçlu: 12.500 ₺                │  ← PEEK: bakiye + son hareket
│  Son: 2 gün önce, 3.000 ₺ satış       │
│ ─────────────────────────────────────│
│  [ Alış | Satış ]                     │  ← AKSİYON: bir kaydırma ötede
│  Tutar: [_______]                     │
│  Kategori: (chip'ler)                 │
│  Tarih: Bugün                         │
│              [ Kaydet ]               │
└─────────────────────────────────────┘
```

**Neden peek + aksiyon?** Cari satırına basınca niyet belirsiz: "yeni işlem gir" mi, "ne borçlu diye bak" mı? İki-seçenekli menü tam da bu yüzden vardı. **Tutunan power-user'ın günlük en sık eylemi muhtemelen "bak"** (kim ne borçlu kontrolü). Row-tap'i doğrudan boş bir tutar klavyesine bağlarsak onu rahatsız ederiz. Çözüm: sheet'in üstü anında bakiye/son-hareketi gösterir (bak-niyeti doyar), altı işlem girişidir (yaz-niyeti bir kaydırma ötede). "Hareketleri Gör" köşede tam ekstreye kapı olarak kalır.

**Dokunuş:** işlem girmek 2 → 1; bakiye görmek 2 → 1 (üstelik ekran değiştirmeden).

**Açık karar (cihazda test):** Hangi niyetin baskın olduğunu evented veri söylemiyor (o eski menü tap'leri kaydedilmiyor). İlk prototip bu "peek+aksiyon" formuyla yapılır, cihazda hissedilerek son hâli verilir.

---

### 3.4 — #4 Kategori otomatik-doldurmayı geri al

**Sorun:** Son UI/UX turunda eklenen "son kullanılan kategori otomatik dolar" davranışı, kullanıcının **fark etmeden yanlış kategoriyle kaydetmesine** yol açıyor (kullanıcının cihaz geri bildirimi + review'da "mis-tag riski" olarak işaretlenmişti). Veri destekliyor: işlemlerin yalnız %55'i kategorili — sabit bir "son kategori" dayatmak değişken bir alana yanlış varsayılan koyuyor.

**Değişiklik:**
- ❌ Kategori **otomatik-doldurma kalkar.**
- ✅ "Son 3 kategori" **chip satırı kalır** (görünür öneri — dokununca seçilir, dayatmaz).
- ✅ **Hesap prefill'i KALIR.** Neden: hesap stabil ve az sayıda, seçim kutusunda görünür, yanlışsa bariz. (Kategori görünmez tuzak, hesap görünür seçim.)

**Kullanıcı etkisi:** Hızlı bar açılınca kategori artık kendiliğinden dolu gelmez; onun yerine son 3 kategori chip olarak durur, kullanıcı bilerek seçer. Yanlış-kategori sessiz kaydı biter.

---

## 4. Açık kararlar (implementasyondan önce netleştirilecek)

1. ~~Cari formunda para birimi~~ → **KARAR VERİLDİ: dokunulmuyor, olduğu gibi kalır** (yalnız oluştururken görünüyor, sorun değil).
2. **#5 row-tap davranışı**: peek+aksiyon sheet cihazda test edilip son hâli verilecek (yukarıda).
3. **Düzenleme formundaki "Vergi No"**: ekleme formunda yok; düzenlemede varsa oradan da kaldırılır (kod teyidi implementasyon başında).

**Düzen:** Kodu Opus (bu sekme) yazar, Fable ikinci göz olarak arada inceler. Dosyaya tek sekme dokunur.

---

## 5. Doğrulama planı (her madde için)

- `npm run typecheck` + mevcut test seti (≥285 test) yeşil.
- **Guardrail testleri:** (a) dolu gizli alanlı eski cari düzenle → akordeon açık gelmeli; (b) sadeleştirilmiş formla kaydet → eski dolu alan `''` ile ezilmemeli (undefined kontrolü).
- **Çekişmeli review** (Fable): mis-tag reverti, sheet peek doğruluğu, undefined-vs-empty, ExpandableCard→sheet geçişinde perf.
- **Cihaz turu:** cari ekle (15 sn hedefi), cari satırı → sheet (peek + tek-dokunuş işlem), kategori chip'i (autofill yok).

---

## 6. Bu, dünkü büyüme analizinin neresinde?

Aynı huninin farklı noktaları, çelişmiyor — birleşiyor:
- **Dilim 1 (bu belge)** = "mevcut kullanıcı carisini 15 saniyede işlesin" bacağı.
- **Rehber-import onboarding** = "yeni kullanıcı defterini 2 dakikada yüklesin" bacağı (retention'ın asıl iğnesi — ayrı iş, ertelenmemeli).
- **Yükümlülük-push** = "ertesi gün geri gelsin" bacağı (ayrı backend turu).

Dilim 1 ucuz, düşük riskli ve import'un ön-koşulu (import review ekranı da bu ince formu kullanır) — ama tek başına churn'ü çözmez, üç bacak birlikte çözer.

---

## 7. Güncelleme — review sonrası (13 Tem)

**İlerleme:**
- ✅ **Madde 1 (#4 kategori autofill reverti)** — commit `c02eee4`, typecheck + 285/285 test, Fable review APPROVED. Cihaz testi kullanıcıda.

**Fable review bulguları (#5 sheet'e implementasyon şartı olarak eklendi):**
1. **İzin gate'i:** view-only linkli cari (`cariler.tsx:655` mevcut BUG-7 gate'i) satıra basınca sheet **peek-only** açılmalı, işlem formu render edilmemeli.
2. **Peek lazy-load:** peek MVP'si **yalnız bakiye** (listede zaten var, sıfır sorgu); "son hareket" istenirse sonra ayrı lazy sorgu — liste sorgusuna asla eklenmez (400-carili liste perf'i).
3. **Persist zinciri:** chip kaynağı = kayıt mekanizması; revert'te kayıt tarafı sökülmemeli. *(Madde 1'de korundu, teyitli.)*
4. **ExpandableCard envanteri:** expand içinde yalnız İşlem Yap / Hareketleri Gör var; arşiv/düzenle/sil ⋮ menüsü header'da ayrı (`cariler.tsx:640`), expand kaldırılınca kaybolmaz. Düşük risk.

**Para birimi:** KARAR KESİN — dokunulmuyor, olduğu gibi görünür kalır. (Adaptif görünürlük reddedildi: görünürlük zaten korununca gereksiz. Ayrı backlog notu: FX cari para birimi oluşturmadan sonra düzeltilemiyor + İngilizce default USD → latent bug, Dilim 1 dışı.)

**Sekme koordinasyonu (Madde 3 şartı):** İşlem formu (Madde 3) `useTransactionSubmit.ts`'e dokunacak; o dosyada şu an başka bir sekmenin commit'lenmemiş auth-hang teşhis kodu var. **Madde 3'e başlamadan önce o sekme işini commit'lemeli veya stash'lemeli.** Madde 2 (cari formu) bu dosyalara değmiyor, paralel güvenli.
