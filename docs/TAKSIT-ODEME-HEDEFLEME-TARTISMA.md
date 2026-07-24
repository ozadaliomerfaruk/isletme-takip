# Taksit Ödeme & Hedefleme — 3'lü Tartışma Dokümanı

> **Amaç:** Kullanıcı (ürün sahibi/esnaf) + Opus + Fable birlikte tartışsın. Fable'ın
> bağlamı yok → burada her şey sıfırdan anlatılıyor. Sonunda Fable'a açık sorular var.
> Karar verilmedi; bu bir **tasarım tartışması**, onay bekliyor.

---

## 0) Sistem — 30 saniyelik bağlam

- Uygulama: "İşletme Takip" — React Native + Supabase (Postgres), Türk esnafı için cari/kasa defteri.
- **`cariler.balance` = TEK GERÇEK KAYNAK.** Her işlem (`islemler`) bu bakiyeyi imzalı hareket ettirir (kaynak: `src/lib/islemBalanceOps.ts::computeBalanceOps`).
- Cari işareti: **bakiye > 0 = onlar bize borçlu (alacak)**, **< 0 = biz borçluyuz (borç)**.
- **Taksit:** bir alış/satış (bir `islemler` satırı) N adet dated taksite (`taksitler`) bölünür. Vade = her taksitin `vade_tarihi`.
- **Vade/kalan modeli (SAF FIFO, 23 Tem):** net borç faturalara **işlem tarihi**ne göre dağıtılır — en yeni fatura dolu kalanı taşır, ödeme geldikçe en eski fatura önce kapanır. Tavan = faturanın kendi tutarı.

---

## 1) Somut sorun: aynı taksit iki ekranda FARKLI görünüyor

Bugün taksitin "kalan / ödendi / gecikti" durumu **iki ayrı, uzlaşmayan motordan** hesaplanıyor:

| | **Model A** — `islem_tahsis` defteri | **Model B** — net-bakiye |
|---|---|---|
| Kullanan | **Taksit Takip + Ödeme Planı PDF** | **cari detay + Vade Takip** |
| Kalan | Gerçek tahsis kaydı: `taksit_tutarı − Σ tahsis` | Bakiyeden türetme (defter'e bakmaz) |
| Ödeme neyi kapatır | **en erken VADE** (vade ASC) | **en eski İŞLEM TARİHİ** (tx_date DESC) |

İki motor hem farklı veriden hem farklı sıradan beslendiği için çelişiyorlar.

### Çelişki senaryosu (gerçek sayılarla)
Müşteri Ahmet:
- **Fatura X:** Ocak'ta satış, 5.000, vadesi **Aralık** (işlem eski, vade geç).
- **Plan Y:** Haziran'da satış, 12.000 = 3×4.000, vadeler **Tem / Ağu / Eyl** (işlem yeni, vadeler erken).
- **5.000 tahsilat** geldi → Ahmet net **12.000** borçlu.

| Birim | Model A (Taksit Takip) | Model B (cari kartı / Vade Takip) |
|---|---|---|
| Y-taksit1 (Tem) | **0 — ÖDENDİ ✓** | **4.000 — VADESİ GEÇTİ** |
| X (Aralık) | 5.000 açık | **0 — kapandı** |

**Aynı taksit, iki ekranda zıt gerçek.** Ahmet'e gönderilen Ödeme Planı PDF'i "1. taksit ödendi" derken cari kartı "4.000 vadesi geçti, ara" diyor. Toplam borç (12.000) ikisinde de doğru; sadece **hangi birimin kapandığı** farklı.

---

## 2) Nasıl buraya geldik (dürüst tarihçe)

- Başta tek motor vardı: `islem_tahsis` **tahsis defteri** (Model A). Ödeme geldiğinde `fifo_tahsis_dagit` onu borçlara vade-ASC dağıtıp **kayıt** oluşturuyor. Bu "doğru muhasebe modeli" — hangi ödemenin hangi kalemi kapattığını kaydeder.
- **Problem:** defter **eski veride bakiyeden sapıyordu.** Migration ÖNCESİ ödemelerin tahsis kaydı yok (backfill yapılmadı — "eski kullanıcı güvenliği" ilkesi gereği backfill'den kaçınılıyor). Sonuç: eski borçlar defter'de "hiç ödenmemiş" görünüyordu, bakiye ise "ödenmiş" diyordu. ("35k fatura → 10.000 mü 26.500 mü" hayaleti.)
- **23 Tem kararı (Opus):** Vade yüzeylerini **net-bakiye (Model B)**'ye taşıdım. Model B bakiyeden türediği için **eski veride bile garanti doğru**. Ama Taksit modülünü Model A'da bıraktım → iki motor ayrıştı = §1'deki çelişki.

**Özet:** Model A hedeflemeyi destekler ama eski veride sapar. Model B hep doğru ama **hedeflemeyi ASLA gösteremez** (bakiyeden yeniden hesapladığı için kullanıcının "şunu ödedim" niyetini yok sayar).

---

## 3) Kullanıcının kafasının karışma noktası (ASIL MESELE)

Basit çözüm "her şey net-bakiye, ödeme hep en-erken-vadeliden otomatik kapanır" olacaktı. Kullanıcı bunu başta onayladı ("kim şimdikini ödeyip eskisini bırakır ki"). **Ama sonra gerçek senaryolar geldi:**

Bir tedarikçiden **4 ayrı taksitli fatura** almış. Her ay düzenli ödüyor. Derken:
1. **"Vadesi geçmiş + vadesi gelmiş ikisini beraber öderim"** → otomatik zaten yapar (en-erken iki taksit). ✅
2. **"Önden 2 taksit kapatayım"** → 2 taksitlik tutar öder, sıradaki 2 açık taksit kapanır. ✅
3. **"4 faturadan BİRİNİ (illa en eskisi değil) toplu kapatmak istiyorum"** → otomatik FIFO parayı **en-gecikmişe** gönderir, senin istediğin faturaya değil. **Saf otomatik model bunu YAPAMAZ.** ⚠️

Yani kafa karışıklığı = **"otomatik kolaylık" ile "belirli bir faturayı hedefleme kontrolü" arasındaki gerilim.** İkisi de meşru; esnaf çoğu zaman düz öder ama bazen "şu anlaşmayı kapatayım" der.

**Kritik teknik kısıt:** net-bakiye modeli hedeflemeyi ekrana yansıtamaz (kullanıcı "2. faturayı ödedim" dese bile ekran yine en-erken-vadeliyi kapalı gösterir). Hedeflemenin işe yaraması için gösterimin **tahsis defterini** okuması şart. Ama defter eski veride sapıyor. → İkilem.

---

## 4) Değerlendirilen seçenekler

| Seçenek | Hedefleme? | Bakiye-tutarlı? | Eski veri | Sürtünme | Not |
|---|---|---|---|---|---|
| **A. Her ödemede "nereye sayılsın" seç** | ✅ | defter'e bağlı | sapar | **yüksek** | Kullanıcı bunu **zaten reddetti** (her ödemede fatura seçmek yorucu) |
| **B. Saf net-bakiye (otomatik, hedefsiz)** | ❌ | ✅ garanti | ✅ doğru | sıfır | §3'teki 3. senaryoyu çözemez |
| **C. Saf defter (Model A)** | ✅ | sapabilir | ❌ sapar | düşük | 23 Tem'de bu yüzden kaçıldı |
| **D. MELEZ (öneri)** | ✅ (opsiyonel) | ✅ garanti | ✅ doğru | düşük | Aşağıda |

---

## 5) Opus'un düşündüğü yön: MELEZ motor + iki-sekme UX

### 5a) Melez motor (asıl iş — SQL/veri katmanı)
- `islem_tahsis` defteri **yalnız EXPLICIT (kullanıcının bilerek hedeflediği) tahsisleri** tutar.
- Her okuma-anında per-taksit kalan şöyle hesaplanır:
  ```
  kalan(birim) = birim_tutar
                 − explicit_tahsis(birim)                      -- kullanıcının sabitlediği
                 − fifo_pay(net_borç − Σexplicit, birim)       -- geri kalanı otomatik FIFO
  ```
- **Toplam her zaman = cari bakiyesi** (sabitlenen + FIFO'lanan artık = net). Hiçbir ekran çelişmez.
- **Eski veri sorunu YOK:** eski ödemelerin explicit hedefi yok → onlar tamamen FIFO → bakiyeyle doğru. **Backfill gerekmez.**
- FIFO sırası: `COALESCE(vade, tx_date) DESC` — en erken vadeli birim önce kapanır; **vadesiz** faturalar `tx_date`'e göre (bugünkü davranış korunur).
- Tek motor: cari-satır, Vade Takip, Taksit Takip, PDF → hepsi bundan türer. "Ödendi damgası" da bu melez kalana göre.

### 5b) İki-sekme UX (kullanıcının fikri — niyeti giriş-noktası belirler)
Cari detay sayfasında iki sekme:
- **Sekme 1 — normal işlem listesi (şu anki):** hedef yok → ödeme otomatik en-erken-vadeliden kapatır. Sıralı ödeyen buradan devam eder. **%90 kullanım.**
- **Sekme 2 — "Taksitler":** yalnız taksitli satış/alışlar. Belirli bir faturayı kapatmak isteyen o satışa girer → **detayından ödeme yapar → sadece o faturanın taksitleri kapanır** (explicit tahsis kaydı). Ödeme ana sayfada yine görünür, ama hangi taksitin kapandığı buna göre değişir.

**Zarafeti:** "nerede ödediğin" niyeti belli ediyor. Ayrı "nereye sayılsın" seçici yok, normal akış sürtünmesiz kalıyor; hedefleme sadece **bilerek o sayfaya inince** oluyor.

---

## 6) Açık kararlar (Fable + kullanıcı tartışsın)

1. **Bir faturaya kalanından FAZLA ödenirse?** Öneri: o faturanın kalanında **sınırla + uyar** ("bu faturanın kalanı 5.000"). Alternatif: taşanı otomatiğe savur (kafa karıştırabilir).
2. **Sekme 2 = mevcut Taksit Takip ekranlarının cari'ye özel hâli** mi olsun (az kod), yoksa ayrı mı?
3. **Hedefleme fatura düzeyi mi, taksit düzeyi mi?** Öneri: fatura düzeyi (o satışa gir, öde → içindeki taksitler en-erken-vadeliden kapanır). Taksit-tek-tek seçtirmek muhtemelen gereksiz.

---

## 7) Fable'a açık sorular (eleştir, çürüt, daha iyisini öner)

1. **Melez motor (explicit sabit + FIFO artık) muhasebe açısından doğru mu?** Daha temiz/standart bir model var mı (ör. gerçek "open-item allocation" sistemleri bunu nasıl yapıyor)?
2. **Kenar durumlar:** (a) çapraz-kur hedefli ödeme, (b) hedefli ödemeyi silmek/düzenlemek, (c) başka işlemler sonrası explicit tahsisin net'i AŞMASI (ör. faturaya sabitledin ama sonra o faturayı düzenledin), (d) kısmi hedefli ödeme. Bunlar melezi bozar mı?
3. **`COALESCE(vade, tx_date) DESC` sıralaması** doğru mu? Vadesiz borçları vade-öncelikli bir dünyada nasıl konumlamalı — "hemen muaccel = en erken" mi, tx_date'e göre mi (mevcut)?
4. **İki-sekme UX** deneyimi böler mi, yoksa netleştirir mi? Daha iyi bir giriş-noktası var mı (ör. taksitli fatura satırında doğrudan "bu faturayı öde" swipe/buton, ayrı sekme olmadan)?
5. **Okuma-anında FIFO reconciliation** performans/doğruluk riski taşır mı? (cari başına her okumada iki-aşamalı pencere fonksiyonu.)
6. **Defter'i "yalnız explicit" tutmak** kendi başına yeni bir sapma/karmaşa yaratır mı? (Şu an `fifo_tahsis_dagit` otomatikleri de yazıyor — melezde otomatikleri yazmayı bırakıp okuma-anında mı hesaplamalı, yoksa bir `is_explicit` bayrağı mı?)
7. **Daha basit bir yol var mı** ki hem hedeflemeyi hem bakiye-tutarlılığı verip bu kadar iş çıkarmasın? (Belki hedeflemeden tümüyle vazgeçip §3.3'ü başka türlü çözmek?)

---

## 8) Şu anki eğilim (karar değil)
Opus melez motor + iki-sekme UX'i öneriyor: kullanıcının gerçek ihtiyacını (belirli faturayı kapatma) karşılıyor, bakiyeyle garanti tutarlı, backfill yok, normal akış sürtünmesiz. Maliyeti: saf net-bakiyeden **daha fazla iş** (iki-aşamalı SQL + Sekme 2 UI + hedefli aksiyon). Kullanıcı yönü beğendi; Fable'ın eleştirisi + §6/§7 kararları bekleniyor.
