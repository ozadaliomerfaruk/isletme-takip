# Test Planı — Bug Düzeltmeleri (2026-06-01)

Bu plan, son turda düzeltilen **13 bug**ı kapsar:
- **Bug A:** PDF export 1970 tarih + diğer datepicker'lara yapışma
- **Bug B:** QuickTransactionBar yavaş internette çift/üç kayıt
- **#1–#11:** Kapsamlı bug-avı bulguları (OCR import, toplu ödeme, cache, listeler vb.)

> Muhasebe/rapor düzeltmelerinin (A1–D döviz, iade, nakit avans vb.) testleri ayrı dosyadadır:
> [TEST_PLANI_muhasebe_duzeltmeleri.md](TEST_PLANI_muhasebe_duzeltmeleri.md)

## Ön hazırlık
- [ ] **Yeni bir APP BUILD al** — bu düzeltmelerin TAMAMI istemci tarafıdır; build sonrası cihaza gelir.
      (Canlı DB'ye dokunulmadı; mevcut veri etkilenmez.)
- [ ] Test için ayrı/test işletmesi kullan; gerçek müşteri verisinde test etme.
- [ ] Mümkünse **yavaş ağ** simülasyonu hazırla (geliştirici menüsü / cihaz ağ kısma) — çift-kayıt
      ve idempotency testleri için kritik.
- [ ] En az: 2-3 personel (bazıları borçlu), 2-3 cari (1 tedarikçi), birkaç ürün, 1-2 hesap.

---

## Bug A — PDF export 1970 tarih + datepicker'a yapışma
**Ne değişti:** `formatDateForDB`/`formatDateTimeForDB` artık geçersiz tarihte `NaN` üretmiyor;
`useReportPeriod` kalıcılaşmış `1970-01-01`/`NaN` değerini kendini-onararak düzeltiyor; PDF export
datepicker'ı `ensureValidDate` kullanıyor.

### Test A.1 — PDF export özel tarih
1. [ ] Bir hesap/cari/personel detayına gir → PDF/dışa aktar → filtre → **"Özel"** dönem seç.
2. [ ] Başlangıç ve bitiş tarihine bak.
   - **Beklenen:** Bugünün/seçilen tarihin doğru görünmesi; **1970 YOK**.
3. [ ] Tarih seçicilerden tarih seç, PDF oluştur.
   - **Beklenen:** PDF'te dönem tarihleri doğru; 1970 yok.

### Test A.2 — Yapışma (en kritik)
1. [ ] PDF export'ta özel tarih seç, kapat.
2. [ ] Başka bir ekrandaki herhangi bir datepicker'ı aç (işlem düzenle, rapor dönemi vb.).
   - **Beklenen:** Tarih **bugün/doğru** görünüyor; 1970'e sabitlenmiş DEĞİL.
3. [ ] Raporlar → dönem seçici → "Özel" → tarihlere bak.
   - **Beklenen:** Geçerli tarihler; 1970 yok.

### Test A.3 — Zaten etkilenmiş kullanıcı (self-heal)
1. [ ] (Eğer elinde 1970'e yapışmış bir cihaz/hesap varsa) build'i güncelle, uygulamayı aç.
2. [ ] Raporlar → dönem seçici.
   - **Beklenen:** İlk açılışta otomatik düzelir (kalıcı bozuk değer güvenli tarihle değişir).

### Test A.4 — Regresyon
1. [ ] Normal işlem oluştururken tarih seç, kaydet.
   - **Beklenen:** Seçilen tarih doğru kaydediliyor (eskisi gibi).

---

## Bug B — QuickTransactionBar çift/üç kayıt (yavaş internet)
**Ne değişti:** `handleSave`'e ilk await'ten ÖNCE senkron `submitInFlightRef` kilidi eklendi.

### Test B.1 — Yavaş ağda hızlı çift dokunma ⭐
1. [ ] Ağı yavaşlat.
2. [ ] Hızlı işlem çubuğunda gelir/gider tutarı gir, **Kaydet'e hızlıca 2-3 kez** dokun.
   - **Beklenen:** **YALNIZCA 1 işlem** kaydedilir. (Eskiden 2-3 kayıt oluyordu.)
3. [ ] İşlem listesi + hesap bakiyesini kontrol et.
   - **Beklenen:** Tek işlem, bakiye tek kez etkilenmiş.

### Test B.2 — Picker'lı akış (regresyon)
1. [ ] Kategori/hesap/cari seçtirilen bir işlemde Kaydet'e bas → picker açılır → seçim yap → tekrar Kaydet.
   - **Beklenen:** Picker'dan dönünce kayıt normal çalışıyor (kilit takılı kalmıyor).
2. [ ] Çapraz-kur (farklı para birimli) işlemde kur çubuğu açılıp onaylama akışı.
   - **Beklenen:** Normal kaydediliyor; çift kayıt yok.

---

## #1 — Toplu personel ödemesinde çift ödeme koruması ⭐
**Ne değişti:** `Promise.allSettled` + başarılı ödenenleri seçimden/tutardan çıkarma + kısmi hata bildirimi.

### Test #1.1 — Normal toplu ödeme
1. [ ] Personel → Toplu Ödeme → birkaç personel seç, tutar gir, hesap+kategori seç → Kaydet.
   - **Beklenen:** Başarı mesajı; her personele 1 ödeme; hesap bakiyesi doğru.

### Test #1.2 — Kısmi hata + tekrar deneme (en kritik)
1. [ ] Yavaş/kesintili ağda 3-4 personel seçip Kaydet.
2. [ ] Ortada bir hata oluşursa (ya da ağı kayıt sırasında kes):
   - **Beklenen:** "X kaydedildi, Y başarısız" uyarısı; ekran KAPANMAZ.
   - **Beklenen:** **Başarılı ödenen personel artık seçili DEĞİL** (tutarı da temizlenmiş).
3. [ ] Tekrar Kaydet'e bas.
   - **Beklenen:** Yalnızca başarısız (hâlâ seçili) personel için ödeme gider → **çift ödeme YOK**.
4. [ ] Tüm personellerin bakiyesini kontrol et.
   - **Beklenen:** Her personele tam olarak 1 ödeme; hesaptan tek kez düşülmüş.

> **Not:** Bu istemci-tarafı koruma; tam atomik garanti için sunucu-tarafı idempotency anahtarı ayrıca
> planlanabilir. Ama bu test çift ödemenin pratikte engellendiğini doğrular.

---

## #2 — Mükerrer faturada "İptal" → hayalet başarı düzeltmesi
**Ne değişti:** İptal yolu artık `cancelled` sentinel'i dönüyor; başarı gösterilmiyor, ekran kapanmıyor.

### Test #2.1
1. [ ] Foto-import ile bir fatura tara; fatura numarası **zaten kayıtlı** olan bir fatura kullan
      (ya da aynı faturayı 2 kez kaydetmeyi dene).
2. [ ] AL/SAT'a bas → "mükerrer fatura" uyarısı çıkar → **"İptal"e** dokun.
   - **Beklenen:** Başarı mesajı GÖSTERİLMEZ; ekran kapanmaz; review ekranında kalır.
   - **Beklenen:** İşlem listesi/ürün hareketlerinde yeni kayıt YOK.
3. [ ] Aynı faturada tekrar AL/SAT → uyarıda **"Kaydet"** seç.
   - **Beklenen:** Bu sefer gerçekten kaydedilir, başarı gösterilir.

---

## #3 — Hızlı AL/SAT → OCR faturası çift kaydı koruması ⭐
**Ne değişti:** `handleSaveWithDirection`'a senkron in-flight kilidi.

### Test #3.1 — Çift dokunma
1. [ ] Foto-import faturası review ekranında, **AL'a hızlıca 2-3 kez** dokun (yavaş ağda).
   - **Beklenen:** Tek kayıt; çift stok/çift cari borç YOK.
2. [ ] AL'a bas, hemen ardından SAT'a bas (hızlı).
   - **Beklenen:** Yalnızca ilk aksiyon işlenir; iki kayıt oluşmaz.

### Test #3.2 — Yeni ürün modalı (regresyon)
1. [ ] Yeni (eşleşmemiş) ürün içeren faturada AL'a bas → yeni ürün onay modalı açılır → onayla.
   - **Beklenen:** Kayıt normal tamamlanır (kilit modal sırasında takılı kalmıyor).

---

## #4 — Kalem çıkarıldığında stok/cari borç uyumu
**Ne değişti:** `stock_and_cari` modunda kalem çıkarılınca cari borç artık kaydedilen kalemlerin
toplamıyla yazılıyor (faturanın tam grandTotal'ı değil).

### Test #4.1 ⭐
1. [ ] 3 kalemli bir faturayı foto-import ile tara, **stok + cari** modunda.
2. [ ] Review'da **1 kalemi çıkar/sil** (toplamı ELLE düzenleme).
3. [ ] AL ile kaydet.
   - **Beklenen:** Stok yalnızca **2 kalem** girer.
   - **Beklenen:** Cari borç da **2 kalemin toplamı** kadar (3 kalemlik tam tutar DEĞİL).
   - **Beklenen:** Stok ile cari bakiye birbiriyle tutarlı.

### Test #4.2 — Elle toplam düzenleme (regresyon)
1. [ ] Faturada toplamı ELLE düzenle, kaydet.
   - **Beklenen:** Senin girdiğin tutar kullanılır (otomatik hesap onu ezmez).

### Test #4.3 — Kalem çıkarmadan (regresyon)
1. [ ] Tüm kalemleri olan faturayı kaydet.
   - **Beklenen:** Faturanın grandTotal'ı (KDV dahil) kullanılır (eskisi gibi).

---

## #5 — Çok-sayfa birleştirmede yanlış tedarikçi koruması
**Ne değişti:** Fuzzy ad eşleşmesi min 5 karakter + ≥%60 oran şartına bağlandı.

### Test #5.1
1. [ ] Aynı anda **farklı tedarikçilere** ait, **aynı tarihli**, fatura no'su OCR'da okunamayan
      iki fatura tara (örn. "Anadolu Gıda" ve "Anadolu Gıda San. Tic." gibi benzer adlılar).
   - **Beklenen:** İki ayrı fatura olarak kalırlar; sessizce TEK faturaya birleşmezler.
2. [ ] **Gerçekten aynı** çok-sayfalı bir faturanın sayfalarını tara (aynı fatura no/ETTN).
   - **Beklenen:** Doğru şekilde tek faturaya birleşir (regresyon yok).

---

## #6 — useUndoDelete unmount'ta hata yutma düzeltmesi
**Ne değişti:** Unmount commit yolu artık hatayı `onError` ile yüzeye çıkarıyor (sessiz yutma yok).

### Test #6.1
1. [ ] Bir not/öğe **sil** (geri-al snackbar'ı çıkar) → 5sn dolmadan **hemen başka sekmeye geç**.
   - **Beklenen:** Silme başarılıysa öğe gerçekten silinir.
2. [ ] (Zorlamak için) Ağı kesip aynısını dene.
   - **Beklenen:** Silme başarısız olursa hata bir şekilde yüzeye çıkar (toast/log); kullanıcı
     "silindi" sanıp da öğenin başka ekranda durması durumu en azından sessiz kalmaz.
3. [ ] Geri-al (Undo) butonuna basma akışı (regresyon).
   - **Beklenen:** Öğe geri gelir.

---

## #7 — Pending→işlem bakiyesinde kısmi-hata geri alma
**Ne değişti:** Bakiye operasyonları tek tek uygulanıyor; ortada hata olursa yalnızca uygulanan
bacaklar geri alınıyor (kör tam-reverse yok).

### Test #7.1
1. [ ] Bekleyen (pending) bir işlemi gerçek işleme dönüştür — özellikle **çift bacaklı** bir tip
      (cari_odeme/cari_tahsilat/personel_odeme: hem cari/personel hem hesap bakiyesi değişir).
   - **Beklenen:** Başarılıysa her iki bakiye de doğru güncellenir.
2. [ ] (Zorlamak için) Dönüşüm sırasında ağı kesip dene.
   - **Beklenen:** İşlem yarım kalmaz; bakiye **ya tümü uygulanır ya hiçbiri** — kısmi/yanlış
     bakiye bırakmaz. (Hata mesajı görünür, pending kayıt durur.)
3. [ ] İlgili cari + hesap bakiyelerini dönüşüm öncesi/sonrası karşılaştır.
   - **Beklenen:** Başarısız denemeden sonra bakiyeler değişmemiş (başlangıçtaki gibi).

---

## #8 — Kategori yeniden adlandırma işlem listesinde anında yansıma
**Ne değişti:** Kategori invalidation'ı artık `islemler`'i de yeniliyor.

### Test #8.1
1. [ ] Bir kategoriye ait işlemleri olan bir liste aç (işlem listesi).
2. [ ] Kategoriyi **yeniden adlandır** (Kategoriler → düzenle).
3. [ ] İşlem listesine dön.
   - **Beklenen:** İşlemlerde **yeni kategori adı** görünüyor (navigasyon/refresh beklemeden).

---

## #9 — Mükerrer fatura kontrolünde LIKE escape
**Ne değişti:** Fatura no'daki `%`, `_`, `\` artık escape ediliyor.

### Test #9.1
1. [ ] Fatura numarasında `_` veya `%` içeren bir fatura tara (örn. "FT_2026/01").
2. [ ] Aynı numaralı ikinci bir faturayı kaydetmeyi dene.
   - **Beklenen:** Mükerrer doğru tespit edilir (joker karakterler yanlış eşleşmeye yol açmaz).
3. [ ] Kısa numaralı (örn. "12") bir fatura.
   - **Beklenen:** Alakasız "Fatura: 1234" gibi kayıtlarla **sahte mükerrer uyarısı** çıkmaz
     (artık daha doğru eşleşme).

---

## #10 — Global arama debounce tutarlılığı (kozmetik)
**Ne değişti:** Yerel varlık filtresi + vurgu da `debouncedQuery` kullanıyor.

### Test #10.1
1. [ ] Global aramada bir kelime yaz (örn. "ahmet"), yazarken sonuç sayacına/vurguya bak.
   - **Beklenen:** Sayaç rozeti ile listelenen satırlar ve vurgulanan metin **tutarlı**
     (300ms boyunca işlemler/varlıklar birbiriyle çelişmiyor).
2. [ ] Hızlı yazıp silme.
   - **Beklenen:** Sonuçlar tutarlı şekilde güncelleniyor; çökme/yanlış sayaç yok.

---

## #11 — "Tümünü seç" üyelik kontrolü + bayat seçim budama
**Ne değişti:** Cariler/Personel "Tümünü seç" durumu sayı yerine üyelikle belirleniyor;
filtre/arama değişince görünmeyen seçimler budanıyor.

### Test #11.1 — Cariler
1. [ ] Cariler sekmesinde çoklu seçim moduna gir, birkaç cari seç.
2. [ ] Aramayı **daralt** (görünür listeyi değiştir).
   - **Beklenen:** "Tümünü seç / Tümünü kaldır" etiketi görünür listeyle **tutarlı**.
   - **Beklenen:** Artık görünmeyen carilerin seçimi **otomatik budanır** (hayalet seçim kalmaz).
3. [ ] Görünür tüm carileri seç → etiket "Tümünü kaldır" olmalı; birini bırak → "Tümünü seç" olmalı.
4. [ ] Bir filtre/arama altında **Arşivle/Sil** yap.
   - **Beklenen:** Yalnızca gerçekten seçili olanlar etkilenir (yanlış kayıt etkilenmez).

### Test #11.2 — Personel
1. [ ] Yukarıdaki adımların aynısını Personel sekmesinde tekrarla.
   - **Beklenen:** Aynı tutarlı davranış.

---

## Genel regresyon (kritik yollar)
- [ ] Yeni gelir/gider/transfer/cari/personel işlemi → bakiyeler doğru.
- [ ] Foto-import: normal (mükerrer olmayan) fatura → tek kayıt, stok+cari doğru.
- [ ] Toplu personel ödeme (hatasız) → her personele 1 ödeme.
- [ ] Not/öğe silme + geri alma → doğru çalışıyor.
- [ ] Global arama → sonuçlar doğru, çökme yok.
- [ ] Çoklu seçim + arşivle/sil → doğru öğeler etkileniyor.

## Kabul kriteri
- Yukarıdaki tüm "Beklenen"ler sağlanıyor.
- **Çift kayıt / çift ödeme hiçbir senaryoda oluşmuyor** (B.1, #1.2, #3.1).
- **Hayalet başarı yok** (#2.1).
- **Stok ile cari bakiye tutarlı** (#4.1).
- **1970 tarih hiçbir yerde görünmüyor** (A.1–A.3).
- Regresyon yok: mevcut akışlar eskisi gibi çalışıyor.

## Geri dönüş (sorun çıkarsa)
- Tüm bu düzeltmeler **salt istemci** — sorun çıkarsa ilgili commit geri alınıp yeni build alınabilir.
- Commit referansları:
  - 1970 + çift kayıt: `64cab68`, `b57e5df`, `35aaa9b`, `61dac99`
  - OCR grubu: `a1bef39`
  - Para/cache grubu: `aa7aaaf`
  - Kozmetik grubu: `9e1e586`
- DB tarafında bu turda değişiklik YOK (canlı veri etkilenmedi).
