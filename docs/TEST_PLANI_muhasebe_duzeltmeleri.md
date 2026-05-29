# Test Planı — Muhasebe/Rapor Düzeltmeleri (2026-05-29)

Bu plan, yapılan 8 düzeltmeyi (A1, A2, A3, A4, A5, B, C, D) doğrulamak içindir.
A6 ertelendi (test gerekmez).

## Ön hazırlık
- [ ] **Yeni bir APP BUILD al** (istemci değişiklikleri A3/A4/A5/B/C/D ancak build sonrası cihaza gelir).
      DB değişiklikleri (A1/A2/D-RPC) zaten canlıda.
- [ ] Test için **çok para birimli bir test işletmesi** hazırla: en az 1 TRY hesabı, 1 USD hesabı,
      1 USD cari (müşteri), 1 USD cari (tedarikçi), 1 USD personel, birkaç TRY karşılığı.
- [ ] Mümkünse **ayrı bir test hesabı** kullan; gerçek müşteri verisinde test etme.
- [ ] Kurların yüklü olduğundan emin ol (Ayarlar/Raporlar açıldığında kur uyarısı çıkmamalı).

---

## A1 — Gelir/Gider & Kategori raporu döviz dönüşümü
**Ne değişti:** Hesabı olmayan cari/personel işlemleri (cari_alis, cari_satis, personel_gider,
personel_satis ve iadeleri) artık cari/personel'in kendi para biriminden TRY'ye çevriliyor.

### Test A1.1 — USD'li müşteri satışı gelire doğru yansıyor
1. [ ] USD bir müşteriye **1.000 USD**'lik bir **satış (cari_satis)** gir (ürünsüz).
2. [ ] Dashboard → Gelir kartına bak.
   - **Beklenen:** Gelir ≈ 1.000 × güncel USD kuru (örn. ~45.900 TL), **1.000 TL DEĞİL**.
3. [ ] Raporlar → Gelir/Gider → bu satışın kategorisine bak.
   - **Beklenen:** Kategori tutarı da TL karşılığı (çevrilmiş).

### Test A1.2 — USD'li tedarikçi alışı gidere doğru yansıyor
1. [ ] USD tedarikçiden **1.000 USD**'lik **alış (cari_alis)** gir.
2. [ ] Dashboard → Gider kartı + Raporlar → Gider kategorisi.
   - **Beklenen:** ~45.900 TL (çevrilmiş), 1.000 TL değil.

### Test A1.3 — TRY işlemler DEĞİŞMEDİ (regresyon)
1. [ ] Sadece TRY hesap/cari ile birkaç gelir/gider gir.
2. [ ] Dashboard ve kategori raporundaki rakamları **eskisiyle karşılaştır**.
   - **Beklenen:** Tamamen aynı; hiçbir değişiklik yok.

### Test A1.4 — Bilanço ↔ P&L mutabakatı
1. [ ] Çok para birimli işletmede Dashboard'da Genel Durum (alacak/borç) ile Gelir/Gider'e bak.
   - **Beklenen:** Artık ikisi de aynı kur mantığını kullanıyor; mantıksız uçurum yok.

---

## A2 — Ürün (Alış-Satış) raporu döviz
**Ne değişti:** Ürün raporunda yalnızca **işleme bağlı** hareketler, işlemin para biriminden çevriliyor.
İşleme bağlı olmayan toplu giriş/çıkışlar dokunulmadı (TRY sayılır).

### Test A2.1 — USD cariye bağlı ürünlü satış
1. [ ] USD bir cariye **ürünlü** bir satış yap (örn. 10 adet × 50 USD).
2. [ ] Raporlar → Ürün (Alış-Satış) raporu → bu ürüne bak.
   - **Beklenen:** Tutar TL karşılığı (çevrilmiş). Miktar (adet) DEĞİŞMEZ — sadece tutar çevrilir.

### Test A2.2 — TRY ürünlü işlem (regresyon)
1. [ ] TRY cariye ürünlü satış yap.
   - **Beklenen:** Ürün raporu tutarı eskisiyle aynı.

### Test A2.3 — Toplu giriş/çıkış (cari'siz) değişmedi
1. [ ] Ürün detayından doğrudan (cari'siz) toplu giriş yap.
   - **Beklenen:** Ürün raporundaki tutarı ham değer (çevrilmemiş) — mevcut davranış korunur.

---

## A3 — Trend grafiği (filtreli) döviz tutarlılığı
**Ne değişti:** Trend grafiğine bir filtre (hesap/cari/kategori/personel) uygulandığında da
artık kur dönüşümü yapılıyor (önceden filtresiz çeviriyor, filtreli çevirmiyordu).

### Test A3.1 — Filtreli vs filtresiz tutarlılık
1. [ ] Analytics/Trend ekranını aç (çok para birimli işletmede).
2. [ ] Filtresiz trend değerlerini not al.
3. [ ] USD bir hesaba/cariye göre **filtre uygula**.
   - **Beklenen:** Filtreli değerler de TL'ye çevrilmiş; ham USD rakamları TL gibi GÖSTERİLMİYOR.
   - **Beklenen:** Aynı dönem için filtreli ve filtresiz değerler tutarlı (çelişmiyor).

---

## A4 — Nakit Akışı raporu döviz
**Ne değişti:** Nakit akışı, her tutarı ilgili hesabın para biriminden TL'ye çeviriyor.

### Test A4.1 — USD hesap nakit akışı
1. [ ] USD bir hesaba gelir + o hesaptan gider gir.
2. [ ] Raporlar → Nakit Akışı.
   - **Beklenen:** Giriş/çıkış/net TL karşılığı; farklı para birimleri TL'de toplanıyor (anlamsız karışım yok).

### Test A4.2 — Sadece TRY (regresyon)
1. [ ] Sadece TRY hesaplarla nakit akışına bak.
   - **Beklenen:** Eskisiyle aynı.

---

## A5 — Kur bulunamadığında Genel Durum
**Ne değişti:** Kur yoksa yabancı bakiye sessizce 1:1 eklenmiyor; hariç tutuluyor + uyarı bayrağı.
(Not: kurlar normalde her gün güncellendiğinden bu durum nadirdir.)

### Test A5.1 — Normal durum (kur var)
1. [ ] Kurlar yüklüyken Dashboard → Genel Durum.
   - **Beklenen:** Eskisiyle aynı; tüm bakiyeler çevrilmiş.
   - **Not:** "Kur eksik" senaryosunu zorlamak zor; normal davranışın bozulmadığını doğrulamak yeterli.

---

## B (#2) — Nakit avans taksiti artık gider değil
**Ne değişti:** `nakit_avans_taksit`, P&L giderinden çıkarıldı; nakit akışında kalmaya devam ediyor.

### Test B.1 — Avans geri ödemesi gideri şişirmiyor
1. [ ] Bir kredi kartı nakit avansı çek, sonra bir **taksit geri ödemesi** yap.
2. [ ] Dashboard → Gider kartı + Net Kâr.
   - **Beklenen:** Geri ödeme **gider olarak görünmüyor**, net kârı düşürmüyor.
3. [ ] Raporlar → Gider kategorileri.
   - **Beklenen:** Avans taksiti gider kategorisinde yok.

### Test B.2 — Nakit akışında hâlâ görünüyor
1. [ ] Raporlar → Nakit Akışı.
   - **Beklenen:** Avans taksiti **nakit çıkışı** olarak görünüyor (kayıp değil).
2. [ ] Hesap ekstresi/işlem listesi.
   - **Beklenen:** İşlem normal görünüyor; bakiyeler doğru.

---

## C (#5, #9) — Kategori raporu iade satırı + net yüzde
**Ne değişti:** Gelir/Gider kategori raporunda iadeler ayrı "İadeler" satırı olarak gösteriliyor;
yüzdeler iade-sonrası (net) toplama göre hesaplanıyor.

### Test C.1 — İade satırı ve mutabakat
1. [ ] Bir dönem içinde hem normal alış hem de bir **alış iadesi (cari_alis_iade)** olsun.
2. [ ] Raporlar → Gider sekmesi.
   - **Beklenen:** Kategori kartlarının altında **"İadeler  -X TL"** satırı görünüyor.
   - **Beklenen:** Σ(kategori kartları) − İadeler = üstteki **Toplam Gider** (başlık) ile tutuyor.
3. [ ] Aynısını **satış iadesi (cari_satis_iade)** ile Gelir sekmesinde test et.

### Test C.2 — Yüzdeler net toplama göre
1. [ ] İade olan bir dönemde kategori kartlarının **yüzdelerine** bak.
   - **Beklenen:** Yüzdeler, gösterilen (iade sonrası) toplama göre; toplamları ~%100 mantıklı.

### Test C.3 — İade yoksa (regresyon)
1. [ ] İadesi olmayan bir dönem seç.
   - **Beklenen:** "İadeler" satırı görünmüyor; rapor eskisi gibi.

---

## D (#6) — Ürünlü işlem düzenlemede stok güncelleniyor (ATOMİK)
**Ne değişti:** Cari'li ürünlü bir alış/satış düzenlenince stok da güncelleniyor (önceden sadece
bakiye güncelleniyordu). Tek transaction'da atomik.

### Test D.1 — Miktar düzenleme stoğu günceller ⭐ (ana senaryo)
1. [ ] Bir ürünün başlangıç stoğunu not al (örn. 100 adet).
2. [ ] USD veya TRY cariye **ürünlü alış** yap: 10 adet giriş → stok 110 olmalı.
3. [ ] İşlemi **düzenle**: miktarı 10 → **15** yap, kaydet.
   - **Beklenen:** Stok artık **115** (önce 110'dan eski +10 geri alınıp 100'e döner, sonra +15 → 115).
   - **ESKİ HATALI DAVRANIŞ:** stok 110'da kalırdı. Artık 115 olmalı.
4. [ ] Cari bakiyesinin de doğru güncellendiğini kontrol et.

### Test D.2 — Fiyat düzenleme
1. [ ] Ürünlü bir satışta **birim fiyatı** değiştir, kaydet.
   - **Beklenen:** Cari bakiyesi + ürün raporu tutarı yeni fiyata göre; stok adedi doğru.

### Test D.3 — Ürün satırı silme/ekleme
1. [ ] Ürünlü işlemi düzenleyip bir **ürünü çıkar** (veya yeni ürün ekle), kaydet.
   - **Beklenen:** Çıkarılan ürünün stoğu eski hâle döner; eklenenin stoğu güncellenir.

### Test D.4 — Atomiklik / yarım kalma yok
1. [ ] Birkaç ürünlü bir işlemi düzenle.
   - **Beklenen:** Ya hepsi güncellenir ya hiçbiri; "yarım" stok durumu oluşmaz.
2. [ ] (İsteğe bağlı, zorsa atla) Düzenleme sırasında interneti kes → tekrar dene.
   - **Beklenen:** Hata mesajı; stok bozulmadan kalır; tekrar denenince doğru sonuç.

### Test D.5 — Silme hâlâ doğru (regresyon)
1. [ ] Ürünlü bir işlemi **sil**.
   - **Beklenen:** Stok eski hâline döner, bakiye geri alınır (eskiden de çalışıyordu).

### Test D.6 — Ürünsüz işlem düzenleme (regresyon)
1. [ ] Ürünsüz bir gelir/gider/transfer düzenle.
   - **Beklenen:** Eskisi gibi çalışıyor; hata yok.

---

## Genel regresyon (kritik para yolları)
- [ ] Yeni gelir/gider/transfer oluştur → bakiyeler doğru.
- [ ] Yeni cari alış/satış/tahsilat/ödeme → cari + hesap bakiyeleri doğru.
- [ ] Yeni ürünlü alış/satış → stok + bakiye + ürün raporu doğru.
- [ ] Excel/PDF dışa aktarımı → açılıyor, rakamlar ekranla tutarlı.
- [ ] İleri tarihli işlem oluştur + tamamla → tek kayıt, bakiye bir kez uygulanıyor (çift değil).
- [ ] Çoklu kullanıcı: paylaşımlı işletmede işlemler görünüyor, bakiyeler doğru.

## Kabul kriteri
- Yukarıdaki "Beklenen"lerin tümü sağlanıyor.
- Çok para birimli işletmede Dashboard, kategori raporu, ürün raporu, nakit akışı **birbiriyle tutarlı**.
- Sadece-TRY işletmelerde **hiçbir sayı değişmemiş** (regresyon yok).
- Ürünlü işlem düzenlemede stok artık **doğru güncelleniyor**.

## Geri dönüş (sorun çıkarsa)
- DB tarafı: `_backup` şemasında 28 tablonun tam kopyası mevcut (2026-05-29). Gerekirse geri yüklenir.
- RPC'ler: eski tanımlara `CREATE OR REPLACE` ile dönülebilir (migration geçmişinde).
- İstemci: ilgili commit'ler geri alınıp yeni build alınabilir.
