# Mutabakat Asistanı — Pencere Modeli, Sınır Kontrolü ve Dosya Doğrulama

**Spec v1 · 05.07.2026 · İşletme Takip**

Bu doküman Claude Code'a doğrudan verilmek üzere yazılmıştır. Mutabakat Asistanı'na iki yeni yetenek ekler:

1. **Pencere modeli + sınır kontrolü** — kullanıcı programı yeni kullanmaya başlamışsa (başlangıç bakiyesi girmiş, öncesinde işlem yok) ekstredeki eski kalemleri eklemeye çalışmadan, sınır tarihindeki bakiyeleri karşılaştırır. Uyuşmazlıkta tek tuşla "devir düzeltme kaydı" önerir.
2. **Dosya doğrulama** — yanlış carinin ekstresi yüklendiğinde eşleşme oranı, isim ve parmak izi sinyalleriyle yakalar; riskli durumlarda toplu eklemeyi kilitler.

**Temel ilke:** Başlangıç bakiyesi, öncesindeki tüm işlemlerin netini içeren kapalı bir kutudur. İçi asla açılmaz (eski kalemler tek tek eklenmez), yalnızca toplamı mutabık kılınır. Uyuşmazlık düzeltme kaydıyla kapatılır, açılış rakamına dokunulmaz.

**Mevcut davranışı bozmamak esastır** — bkz. Kabul Senaryosu 3 (regresyon).

Tablo/kolon adları öneridir; mevcut şemaya (`islemler`, `isletmeler`, cari tablosu) uyarlanmalıdır.

---

## 0. Sabitler (config)

| Sabit | Varsayılan | Açıklama |
|---|---|---|
| `MATERIALITY_TL` | 1,00 | Bu tutarın altındaki fark "yuvarlama" sayılır (ileride kullanıcı ayarı olabilir) |
| `MIN_ITEMS_FOR_RATIO` | 10 | Eşleşme oranı alarmının aktifleşmesi için pencere içinde **her iki tarafta** asgari kalem sayısı |
| `RATIO_GREEN` | 0,70 | Oran ≥ bu değer → yeşil |
| `RATIO_RED` | 0,30 | Oran < bu değer → kırmızı blok |
| `NAME_SCAN_ROWS` | 10 | İsim taraması için ekstrenin başından okunacak satır sayısı |
| `YAKIN_TARIH_GUN` | mevcut değer | Fuzzy tarih toleransı — mevcut eşleştirme davranışı korunur |

---

## 1. Terimler ve işaret kuralı

### 1.1 Normalizasyon (işaret hatası ana bug kaynağıdır — birebir uygulanmalı)

Her iki taraf tek bir işaretli sayıya indirgenir. Mevcut rapor konvansiyonu korunur: **negatif = biz borçluyuz** ("Bizde: −₺53.826,11" gösterimindeki gibi).

```
norm_biz(t)    = borç_bakiye(t) − alacak_bakiye(t)        // bizim defterimiz
norm_ekstre(t) = alacak_bak(t) − borç_bak(t)              // karşı tarafın defteri (ayna kuralı)

fark = norm_ekstre − norm_biz
fark > 0  →  LEHİMİZE   (karşı taraf borcumuzu daha düşük / alacağımızı daha yüksek gösteriyor)
fark < 0  →  ALEYHİMİZE
```

Doğrulama örneği (mevcut gerçek vaka): norm_biz = −61.813,39, norm_ekstre = −52.999,16 → fark = **+8.814,23 lehimize** — mevcut raporla birebir aynı olmalı.

### 1.2 Pencere modeli

```
              T = sınır tarihi                      ekstre bitişi
ekstre başı ──┬───────────────────────────────────────┬──────────► zaman
              │                                       │
   BÖLGE A    │              BÖLGE B                  │   BÖLGE C
 ekstrede var,│  iki tarafta da kayıt olabilir        │ bizde var,
 bizde yok →  │  → kalem kalem eşleştirme             │ ekstrede yok →
 KİLİTLİ      │    (mevcut davranış)                  │ karşılaştırma dışı
              │                                       │ (mevcut "28 işlem" notu)
```

- `T (sınır tarihi) = max(kullanıcı_başlangıç_tarihi, ekstre_dönem_başı)`
- **Bölge A** yalnızca ekstre, kullanıcı başlangıcından öncesini kapsıyorsa oluşur.
- **Bölge B** kalemleri: `tarih ≥ T` olanlar. Kesim kuralı: sınır bakiyeleri `tarih < T` toplamıyla hesaplanır (gün başı kesimi). Tek istisna için bkz. 3.3.
- **Bölge C**: mevcut sağ kenar davranışı aynen korunur.

---

## 2. Sınır kontrolü (başlangıç bakiyesi / devir — tek mekanizma)

Mevcut "Devir" karşılaştırması bu mekanizmanın özel halidir; tek fonksiyona birleştirilir, UI etiketi duruma göre değişir.

### 2.1 İki senaryo

| | Koşul | Sınır T | Bölge A | UI etiketi |
|---|---|---|---|---|
| **Durum 1** | `ekstre_dönem_başı < kullanıcı_başlangıç` | kullanıcı başlangıç tarihi | var | **"Başlangıç bakiyesi kontrolü"** |
| **Durum 2** | `ekstre_dönem_başı ≥ kullanıcı_başlangıç` | ekstre dönem başı | yok | **"Devir kontrolü"** (mevcut davranış) |

### 2.2 Sınır bakiyelerinin hesabı

```
biz_sınır    = norm(açılış bakiyesi) + Σ norm_biz(işlem)      için tarih < T
                                     + Σ norm_biz(işlem)      için tarih = T ve is_mutabakat_duzeltmesi = true   // bkz. 3.3

ekstre_sınır = norm(ekstre devir satırı) + Σ norm_ekstre(kalem) için tarih < T
```

**Ekstrede devir satırı yoksa:** yürüyen bakiye kolonundan türet → `devir = ilk satırın bakiyesi − ilk satırın net hareketi`. Yürüyen bakiye kolonu da yoksa sınır kontrolü **YAPILAMADI** durumuna düşer (asla devir = 0 varsayılmaz).

### 2.3 Durumlar

`sınır_farkı = ekstre_sınır − biz_sınır`

| Durum | Koşul | Raporda gösterim |
|---|---|---|
| **UYUMLU** | `\|sınır_farkı\| = 0` | Kontroller satırı ✓ |
| **YUVARLAMA** | `0 < \|sınır_farkı\| ≤ MATERIALITY_TL` | ✓ + not; fark köprüsünde "yuvarlama" kalemi |
| **FARKLI** | `\|sınır_farkı\| > MATERIALITY_TL` | ✗ + özet bulgusu + iki aksiyon (bkz. 2.4) |
| **YAPILAMADI** | T'ye kadar veri türetilemiyor (2.2'deki koşullar) veya `kullanıcı_başlangıç_tarihi` null | — + tek cümlelik neden. **Raporda çıplak "—" yasak:** her kontrol satırı ✓ / ✗ / nedenli metin taşır. |

### 2.4 FARKLI durumunda aksiyonlar (raporun "Şimdi ne yapmalı" bölümüne)

1. **Kaynağı bul:** "Farkın kaynağını biliyorsanız (unutulan ödeme, mükerrer fatura, işlenmemiş iade) ilgili kaydı ekleyin." → normal işlem ekleme akışına yönlendirir.
2. **Devir düzeltme kaydı oluştur** (tek tuş) → Bölüm 3.

İkisi de sunulur; sıralama hep bu (önce araştır, sonra kabul et).

---

## 3. Devir düzeltme kaydı

### 3.1 Kayıt özellikleri

- **Yeni işlem niteliği:** `is_mutabakat_duzeltmesi = true` + `mutabakat_id` (hangi mutabakattan doğduğu). Mevcut Alış/Ödeme tipleri **kullanılmaz** — mümkünse ayrı işlem tipi (`Bakiye Düzeltme`), enum'a dokunmak risksizse; değilse mevcut tip + bayrakla ayrıştır.
- **Analitik hariç tutma:** Bu kayıtlar cari bakiyeye **dahil**, gelir-gider / kategori / KDV / alış-satış raporlarından **hariç**. (Raporlama katmanında `is_mutabakat_duzeltmesi = false` filtresi.)
- **Tutar ve yön:** `|sınır_farkı|`; yön, `biz_sınır`ı `ekstre_sınır`a eşitleyecek şekilde otomatik belirlenir.
- **Tarih:** T (sınır tarihi).
- **Açıklama (otomatik):** `Açılış bakiyesi düzeltmesi — {cari} mutabakatı ({dosya_adı}, {rapor_tarihi})`
- **Geri alma:** Normal kayıt gibi silinebilir; silinince raporun "Yeniden hesapla" akışı fark durumunu geri getirir.

### 3.2 Onay diyaloğu (kayıt oluşturulmadan önce zorunlu)

Başlık, gövde ve butonlar için Bölüm 8'deki metinler kullanılır. Diyalog tutarı, yönü, tarihi ve bakiyeye etkisini açıkça gösterir.

### 3.3 Kesim istisnası

Düzeltme kaydı T tarihlidir ama sınır bakiyesine dahil edilmelidir (yoksa fark hiç kapanmaz). Kural: **sınır bakiyesi hesabında T günü yalnızca `is_mutabakat_duzeltmesi = true` kayıtlar dahil edilir** (2.2'deki formülde tanımlı). T günündeki normal işlemler Bölge B'de kalır.

### 3.4 Kayıt sonrası

Rapor otomatik yeniden hesaplanır; başarı mesajı + "Kaydı görüntüle" linki. Fark köprüsünde devir satırı düşer/sıfırlanır, sonuç durumu güncellenir (🟠 → 🟢 beklenir).

---

## 4. Bölge A kilidi

Ekstrede olup tarihi `kullanıcı_başlangıç_tarihi`nden **önce** olan kalemler:

1. Eşleştirmeye **girmez** (fark hesabına dahil edilmez — zaten açılış bakiyesinin içindedirler).
2. Listede **gri + kilit ikonu** ile gösterilir; ayrı bir "Başlangıç öncesi ({n} kalem)" grubunda toplanır.
3. Dokununca alt sayfa/tooltip: kilit açıklama metni (Bölüm 8).
4. **Tek tuşla ekle ve toplu ekle bu kalemlerde her koşulda devre dışıdır.** İstisna yok.

---

## 5. Dosya doğrulama

Parse tamamlandıktan sonra, tam rapor üretilmeden önce çalışır. Sonuç, rapor başında küçük bir **"Dosya doğrulama"** kartı olarak gösterilir.

### 5.1 Sinyaller

| # | Sinyal | Yöntem | Ağırlık |
|---|---|---|---|
| 1 | **Kalem eşleşme oranı** (birincil) | `oran = eşleşen_ekstre_kalemi / Bölge_B_ekstre_kalemi`. Yalnızca `min(Bölge_B_biz, Bölge_B_ekstre) ≥ MIN_ITEMS_FOR_RATIO` ise **aktif**; değilse "yeterli kayıt yok — atlandı". | Belirleyici |
| 2 | **Cari adı eşleşmesi** | İlk `NAME_SCAN_ROWS` satırdaki metin hücreleri + dosya adı taranır. Normalizasyon: küçük harf, Türkçe karakter sadeleştirme, `ltd, şti, a.ş, san, tic, ve` vb. eklerin temizliği. Seçili cari adı + (varsa) takma adlarla token örtüşmesi. **Kritik ek kontrol:** metin, kullanıcının **başka bir carisiyle** daha güçlü eşleşiyorsa bu güçlü negatif sinyaldir. | Destek / negatifte güçlü |
| 3 | **Dönem örtüşmesi** | Ekstre dönemi ile kullanıcının bu carideki kayıt aralığının kesişimi. Sıfır örtüşme → uyarı. | Destek |
| 4 | **Mükerrer dosya parmak izi** | Dosyanın SHA-256'sı + `(devir, kapanış, satır_sayısı, dönem)` demeti `mutabakat_yuklemeleri` tablosunda aranır. Aynı parmak izi daha önce **farklı** cariye yüklendiyse uyarı; aynı cariye ise bilgi notu. | Destek |

### 5.2 Karar mantığı

```
KIRMIZI  ⇐  (oran aktif VE oran < RATIO_RED)
            VEYA (isim, başka bir cariyle net eşleşiyor)
            VEYA (parmak izi başka bir cariye kayıtlı VE kullanıcı düzeltmedi)

SARI     ⇐  (oran aktif VE RATIO_RED ≤ oran < RATIO_GREEN)
            VEYA (oran pasif VE isim bulunamadı VE dönem örtüşmesi zayıf)

YEŞİL    ⇐  diğer tüm durumlar
```

### 5.3 Duruma göre davranış

| Durum | Akış | Toplu ekleme | Tekil ekleme |
|---|---|---|---|
| **YEŞİL** | Normal devam | Açık (onay diyaloğu: "{n} kayıt, toplam {tutar}") | Açık |
| **SARI** | Devam + raporda kalıcı sarı bant | Açık, onay diyaloğunda ek uyarı satırı | Açık |
| **KIRMIZI** | **Tam ekran blok**: [Doğru dosyayı seç] (birincil) / [Yine de devam et]. Devam edilirse raporda kalıcı kırmızı bant | **Kapalı** | Açık, kalem başına ek onayla |

**Yeni kullanıcı istisnası:** Bölge B'de yeterli kayıt yoksa oran alarmı pasiftir — yeni kullanıcıya asla salt orandan dolayı kırmızı gösterilmez. İsim/parmak izi sinyalleri çalışmaya devam eder.

### 5.4 Doğrulama kartı (UI)

Üç satır, her biri ✓ / — (nedenli) / ✗:

```
Dosya doğrulama
✓ Cari adı: dosyada "ÇAMLICA TAVUKÇULUK" bulundu
✓ Dönem: 07.01.2025 – 28.04.2026 · kayıtlarınızla örtüşüyor
✓ Kalem eşleşmesi: %99 (138/139)
```

---

## 6. Rapor entegrasyonu

- **Kontroller tablosuna** iki yeni satır: "Dosya doğrulama" ve "Başlangıç bakiyesi kontrolü / Devir kontrolü" (etiket 2.1'e göre). Her satır ✓ / ✗ / nedenli metin — çıplak "—" hiçbir yerde kalmaz (mevcut "Dip toplam kontrolü: —" satırı da nedenli metne çevrilir: *"Karşı taraf ekstresinde toplam satırı bulunmadığı için yapılamadı"*).
- **Asistan Özeti**ne durum bazlı bulgular (metinler Bölüm 8'de).
- **"Şimdi ne yapmalı"** listesine yeni aksiyonlar: devir düzeltme kaydı oluştur (tek tuş), doğru dosyayı seç, önceki dönem ekstresi iste (mevcut).
- **Fark köprüsüne** gerektiğinde "Açılış farkı (düzeltme bekliyor)" satırı; düzeltme kaydı oluşunca köprü yeniden kurulur.

---

## 7. Veri modeli değişiklikleri (Supabase)

```sql
-- Cari tablosu (mevcut ada uyarla)
alter table cariler
  add column if not exists baslangic_bakiye_tarihi date;
-- Backfill: mevcut cariler için ilk işlem tarihinden 1 gün öncesi;
-- hiç işlemi olmayan carilerde null bırak (sınır kontrolü YAPILAMADI'ya düşer).

-- İşlemler
alter table islemler
  add column if not exists is_mutabakat_duzeltmesi boolean not null default false,
  add column if not exists mutabakat_id uuid;

-- Yükleme parmak izi + mutabakat geçmişi
create table if not exists mutabakat_yuklemeleri (
  id uuid primary key default gen_random_uuid(),
  isletme_id uuid not null,
  cari_id uuid not null,
  dosya_adi text,
  dosya_sha256 text not null,
  devir_net numeric,
  kapanis_net numeric,
  satir_sayisi int,
  donem_bas date,
  donem_bit date,
  eslesme_orani numeric,
  sonuc text,                       -- yesil / sari / kirmizi / iptal
  created_at timestamptz default now()
);
create index if not exists idx_mut_yukleme_fp
  on mutabakat_yuklemeleri (isletme_id, dosya_sha256);
```

- Yeni tabloya **mevcut RLS deseni** uygulanır — initplan optimizasyonlu `(select auth.uid())` kalıbıyla, diğer 103 policy'yle tutarlı.
- Gelir-gider / kategori / KDV sorgularına `and is_mutabakat_duzeltmesi = false` filtresi eklenir (tek merkezi yerden geçiyorsa oraya).

---

## 8. Mikro-metinler (TR)

Yer tutucular: `{cari}` `{tutar}` `{fark}` `{tarih}` `{dosya}` `{oran}` `{n}` `{n_eslesen}` `{n_ekstre}` `{diger_cari}`. Tutar biçimi: `12.345,67 TL`, eksi işareti yerine **borç/alacak dili**.

| Anahtar | Metin |
|---|---|
| `sinir.uyumlu` | Başlangıç bakiyesi kontrolü ✓ — Sizin açılışınız: {tutar} · Karşı tarafın {tarih} tarihli bakiyesi: {tutar} |
| `sinir.yuvarlama` | Başlangıç bakiyesi kontrolü ✓ — {fark} yuvarlama farkıyla uyumlu |
| `sinir.farkli.kontrol` | Başlangıç bakiyesi kontrolü ✗ — aranızda {fark} fark var |
| `sinir.farkli.ozet` | Başlangıç bakiyeniz karşı taraftan {fark} farklı — karşı taraf borcunuzu daha {düşük/yüksek} gösteriyor. Kaynağını biliyorsanız (unutulan ödeme, mükerrer fatura, işlenmemiş iade) ilgili kaydı ekleyin; karşı tarafın rakamını kabul ediyorsanız tek tuşla devir düzeltme kaydı oluşturun. |
| `sinir.yapilamadi.ekstre` | Başlangıç bakiyesi kontrolü — Ekstre {tarih} öncesini kapsamadığı için doğrulanamadı. Karşı taraftan bu tarihi de kapsayan ekstre isteyin. |
| `sinir.yapilamadi.devirsiz` | Devir kontrolü — Ekstrede devir satırı ve yürüyen bakiye bulunmadığı için yapılamadı. |
| `duzeltme.dialog.baslik` | Devir düzeltme kaydı |
| `duzeltme.dialog.govde` | {tarih} tarihine {tutar} tutarında {borç/alacak} kaydı eklenecek. Açılış bakiyeniz değişmez; cari bakiyeniz karşı tarafla eşitlenir. Bu kayıt gelir-gider raporlarınıza yansımaz.\n\nAçıklama: "Açılış bakiyesi düzeltmesi — {cari} mutabakatı ({dosya})" |
| `duzeltme.dialog.butonlar` | [Vazgeç] · [Kaydı oluştur] |
| `duzeltme.basari` | Düzeltme kaydı oluşturuldu · [Kaydı görüntüle] — rapor yeniden hesaplanıyor |
| `kilit.tooltip` | Bu işlem {tarih} tarihli başlangıç bakiyenizin kapsamında — eklerseniz bakiyeniz iki kez etkilenir. Bakiyeler uyuşmuyorsa devir düzeltme kaydı kullanın. |
| `kilit.grup.baslik` | Başlangıç öncesi ({n} kalem) 🔒 |
| `dogrulama.kart.baslik` | Dosya doğrulama |
| `dogrulama.isim.ok` | Cari adı: dosyada "{bulunan}" bulundu |
| `dogrulama.isim.yok` | Cari adı: dosyada cari adına rastlanmadı |
| `dogrulama.isim.baska` | Dikkat: dosya "{diger_cari}" ile eşleşiyor |
| `dogrulama.oran.ok` | Kalem eşleşmesi: %{oran} ({n_eslesen}/{n_ekstre}) |
| `dogrulama.oran.pasif` | Kalem eşleşmesi: yeterli kayıt yok — atlandı |
| `dogrulama.kirmizi.baslik` | Bu dosya {cari} carisine ait olmayabilir |
| `dogrulama.kirmizi.govde` | {n_ekstre} kalemden yalnızca {n_eslesen} tanesi kayıtlarınızla eşleşti (%{oran}). Yanlış dosya seçmiş olabilirsiniz. |
| `dogrulama.kirmizi.butonlar` | [Doğru dosyayı seç] · [Yine de devam et] |
| `dogrulama.kirmizi.bant` | ⚠️ Düşük eşleşme oranıyla devam ediyorsunuz — toplu ekleme kapalı. |
| `dogrulama.sari.bant` | Eşleşme oranı beklenenden düşük (%{oran}). Dosyanın {cari} carisine ait olduğundan emin olun. |
| `dogrulama.mukerrer` | Bu dosyayı daha önce {diger_cari} için yüklemiştiniz ({tarih}). Doğru cariyi seçtiğinizden emin misiniz? [Cariyi değiştir] · [Devam et] |
| `toplu.onay` | {n} kayıt, toplam {tutar} defterinize eklenecek. Başlangıç öncesi kalemler dahil edilmedi. [Vazgeç] · [Ekle] |
| `toplu.onay.sari.ek` | ⚠️ Bu dosyanın eşleşme oranı düşüktü — eklemeden önce kalemleri kontrol edin. |

---

## 9. Kabul senaryoları

1. **Yeni kullanıcı, uyumlu:** Açılış 10.000 TL borç ({tarih}); ekstre sınır bakiyesi de aynı → sınır kontrolü ✓, Bölge A kalemleri kilitli grupta listelenir, rapor mevcut akışla devam eder.
2. **Yeni kullanıcı, farklı:** Ekstre sınırı 12.450 TL → FARKLI; özet bulgusu + iki aksiyon görünür. Düzeltme kaydı oluşturulunca rapor yeniden hesaplanır, sınır ✓ olur, sonuç durumu iyileşir. Kayıt silinince fark geri gelir.
3. **Regresyon:** Ekstre kullanıcı başlangıcından sonra başlıyor (mevcut Çamlıca vakası) → etiket "Devir kontrolü", tüm mevcut sayılar (devir 53.826,11 / 45.010,98, köprü 8.815,13 − 0,90 = 8.814,23) birebir aynı üretilir.
4. **Veri yetersiz:** Ekstre başlangıcı kapsamıyor + devir satırı yok + yürüyen bakiye yok → YAPILAMADI, nedenli metin; asla devir=0 varsayılmaz.
5. **Yanlış dosya:** Bölge B'de 120 ekstre kalemi, 4 eşleşme → kırmızı blok. "Yine de devam" sonrası kalıcı bant + toplu ekleme kapalı + tekil ekleme kalem başı onaylı.
6. **Yeni kullanıcı + yanlış dosya:** Bölge B'de 0 kullanıcı kaydı → oran pasif, kırmızı oran alarmı YOK; dosya başlığındaki unvan başka bir cariyle eşleşiyorsa isim sinyali kırmızı/sarı üretir.
7. **Mükerrer dosya:** Aynı SHA-256 daha önce Serdar Gıda'ya yüklenmiş, şimdi Çamlıca'ya seçildi → mükerrer uyarısı.
8. **Sarı bant:** Oran %55 → akış devam, sarı bant görünür, toplu ekleme onayında ek uyarı satırı.
9. **Analitik izolasyonu:** Düzeltme kaydı cari bakiyede görünür; gelir-gider, kategori ve KDV raporlarında görünmez.
10. **Kilit:** Bölge A kalemine dokununca açıklama çıkar; toplu ekleme sayacına dahil edilmez; hiçbir yoldan eklenemez.

---

## 10. Kapsam dışı (bu spec'te yapılmayacaklar)

- Çoklu döviz: ekstre satırında TRY dışı döviz görülürse uyarı verip kullanıcıya devam/iptal sorulur; kur çevrimi yapılmaz.
- Önceki dönem ekstresinin otomatik birleştirilmesi (ayrı mutabakat olarak istenir — mevcut tavsiye metni korunur).
- PDF/OCR ekstre okuma.
- Karşı tarafı uygulamaya davet akışı.

## 11. Önerilen uygulama sırası

- **Faz 1 (çekirdek doğruluk):** Bölüm 7 veri modeli → sınır kontrolü (2) → Bölge A kilidi (4) → devir düzeltme kaydı (3). Kabul: senaryolar 1–4, 9, 10.
- **Faz 2:** Dosya doğrulama kartı + oran/isim/dönem sinyalleri + kırmızı/sarı davranışları (5). Kabul: 5, 6, 8.
- **Faz 3:** Parmak izi/mükerrer (senaryo 7), ölçek sinyali (opsiyonel), `MATERIALITY_TL` kullanıcı ayarı.