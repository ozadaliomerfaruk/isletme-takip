# Cihaz test listesi — para/kur + çeviri denetimi (25 Temmuz 2026)

Kod tarafı bitti, `tsc`/`eslint`/`jest`/Metro temiz. **Hiçbiri cihazda denenmedi.**
Aşağıdaki sıra bilinçli: en tepede DB'ye yanlış yazabilen (geri alınması pahalı) yollar var.

Kısaltmalar: **[P]** = para yazma yolu (bakiyeyi kalıcı etkiler) · **[G]** = yalnız gösterim
· **[EN]** = Ayarlar > Dil = İngilizce ile tekrar edilmeli

---

## A. PARA YAZMA YOLU — önce bunlar (bozulursa bakiye kalıcı yanlış)

### A1. Kredi kartı barı — çapraz-kur **[P]**
Hazırlık: TRY kredi kartı + USD tedarikçi cari + USD (ya da farklı) para birimli bir hesap.

1. Ana sayfa → TRY kredi kartına ⋮ → İşlem → **Ödeme** sekmesi → tedarikçi = USD cari →
   1000 gir → Kaydet.
   - **Beklenen:** kur barı açılır ("1 $ = ? ₺", bugünün kuru ön-dolu).
   - Onayla → cari detayına git: borç **1000 TRY'nin USD karşılığı** kadar azalmış olmalı,
     1000 USD DEĞİL. İşlem satırında alt satırda "₺1.000,00" görünür.
   - *Eski hata: 1000 USD düşüyordu.*
2. Aynı barda **Ekstre** sekmesi → farklı para birimli kaynak hesap seç → kur barı açılmalı.
3. Aynı barda **Harcama** sekmesi (kart TRY, karşı taraf yok) → kur barı AÇILMAMALI.
4. Ödeme sekmesinde AYNI para biriminde cari seç → kur barı AÇILMAMALI (eski davranış).
5. Kur barında ⨯ / arka plana dokun → kayıt YAPILMAMALI, buton tekrar aktif olmalı.
6. **İleri tarihli** aç (çan ikonu) + farklı para birimli taraf → Kaydet →
   "İleri tarihli işlem farklı para birimli hesaplar arasında oluşturulamaz…" uyarısı, kayıt yok.

### A2. Personel toplu ödeme — çapraz-kur engeli **[P]**
1. Personel → ⚡ → Toplu Ödeme. TRY hesap seç. EUR maaşlı bir personele tutar gir → Kaydet.
   - **Beklenen:** "Para birimi uyuşmuyor" + personelin ADI yazılı uyarı, kayıt YOK.
   - *Eski hata: 1.000 TRY girmek personelin 1.000 EUR alacağını kapatıyordu.*
2. Aynı personeli personel detayından TEK TEK öde (⚡ → Ödeme) → kur barı açılmalı, kayıt geçmeli.
3. Footer'a bak: farklı para birimli iki personele tutar girince **iki ayrı satır** (₺… ve €…),
   tek "₺toplam" DEĞİL. Satır giriş alanının öneki personelin sembolü olmalı.

### A3. İleri tarihli çapraz-kur işlemi TAMAMLAMA **[P]**
1. QTB ile aynı para biriminde ileri tarihli bir işlem oluştur (çapraz-kur zaten engelli).
2. Eski verilerde çapraz-kurlu bir ileri tarihli satır varsa: listede ✓ → onayla.
   - **Beklenen:** kur barı açılır, onaydan sonra işlem oluşur.
   - *Eski hata: "Geçersiz döviz kuru: TRY → USD" ham hatası, işlem HİÇ tamamlanamıyordu.*
3. Kur barını iptal et → satır **pending** kalmalı (completed'a kaymamalı) ve
   **hatırlatıcı silinmemeli** (bildirim vaktinde gelmeye devam etmeli).

### A4. Eski çapraz-kur işlemini düzenleme — tarihsel kur **[P]**
1. Kuru kayıtlı, eski tarihli bir çapraz-kur ödemesi/tahsilatı aç (QTB düzenleme).
2. YALNIZ açıklamayı değiştir → Kaydet.
   - **Beklenen:** kur barı AÇILMAZ, cari/hesap bakiyesi DEĞİŞMEZ.
   - *Eski hata: bar açılıyor, bugünün kuruyla doluyor, onaylayınca bakiye kayıyordu.*
3. Aynı işlemde **tutarı** değiştir → kur barı açılır ama alan **işlemin kayıtlı kuruyla**
   dolu gelir; altında "Güncel kur: X (dokunarak kullan)" ipucu görünür.
4. İpucuna dokun → alan bugünün kuruna geçmeli (bilinçli değişim mümkün kalıyor).
5. Kopyala (copy) ile aynı işlemi kopyala → kur barı **bugünün** kuruyla dolmalı (yeni kayıt).

### A5. Excel içe aktarma — tutar ayrıştırması **[P]**
1. Metin biçimli tutar hücresi ("1.234,56") içeren dosya → satır **atlanmamalı**, 1234,56 okunmalı.
   - *Eski hata: `Number("1.234,56")` NaN → satır "Geçersiz tutar değeri" ile atlanıyordu.*
2. İngiliz biçimli köşeli parantez ("Vadesiz USD [1,234.56 USD]") → çapraz-kur tespit edilmeli
   (transfer/entity bacağında kur yazılmalı). *Eski hata: parantez hiç eşleşmiyordu → 1:1.*
3. İçe aktarma sonucunda oluşan çapraz-kurlu bir işlemi **silmeyi/düzenlemeyi** dene →
   çalışmalı. *Eski hata: kur olmadan para birimi yazılan satır "Geçersiz döviz kuru" ile
   silinemez/düzenlenemez hâle geliyordu.*

### A6. Ürün toplu giriş/çıkış + cari — karışık para birimi **[P]**
1. Ürünler → Toplu Giriş → cari bağlantısını AÇ → biri USD biri TRY iki ürün seç → Kaydet.
   - **Beklenen:** "Para birimi uyuşmuyor" uyarısı (para birimleri listeli), kayıt YOK.
2. Cari bağlantısı KAPALI aynı senaryo → kayıt geçmeli (her satır ayrı stok hareketi).
3. Satır giriş alanının öneki ürünün para birimi olmalı; satır ara toplamı da öyle.

---

## B. GÖSTERİM — sayı/etiket tutarlılığı

### B1. "~₺0,00" satırları bitti **[G]**
Kurları indirmemiş/çevrilemeyen bir hesap-cari-personel durumunda (uçak modunda ilk açılış
en kolay yol) şu dört yerde **karşılık satırı HİÇ çizilmemeli** (eskiden "~₺0,00"):
ana sayfa hesap satırı · Cariler listesi · Personel listesi · Hesap detay kartı üst satırı.

### B2. "Bazı döviz bakiyeleri çevrilemedi" uyarısı **[G]**
Aynı durumda uyarı satırı şu ekranlarda görünmeli: **ana sayfa** (carousel altı — YENİ),
Raporlar > Genel, Gelir-Gider (YENİ), Alış-Satış (YENİ), kategori drill-down (YENİ),
Net Varlık Trendi.

### B3. Rapor toplamları çelişmiyor **[G]**
Farklı para birimli hesapları olan işletmede Raporlar > Genel:
- Üst karttaki "Genel Durum" ile alttaki "Hesap Bakiyeleri" toplamı **aynı politikadan** gelmeli
  (kur yoksa ikisi de hariç tutar). *Eski hata: üst kart hariç tutup uyarırken alt toplam 1:1 içeriyordu.*
- Excel'e aktar → Excel'deki toplam ekrandakiyle **aynı** olmalı.

### B4. İşaret kaybı bitti **[G]**
- Raporlar > Genel: net değer NEGATİF iken "**-**₺…" görünmeli (eskiden işaretsizdi).
- Cari/personel raporu: "Dönem bakiye değişimi" negatifken "-" görünmeli.
- Net Varlık Trendi: düşen ay "**-**₺…"; mercek **Gram Altın**'a çevrilince aynı satır "-… gr".
- Excel (Genel Durum): net değer / cari net / personel net hücreleri negatifte işaretli.

### B5. Cari özet kartı ile alt liste artık aynı **[G]**
Çapraz-kurlu ödeme/tahsilatı olan bir cariyi Raporlar > Cari'de aç: üstteki
"Toplam Satış / Alış / Ödeme / Tahsilat" ile hemen altındaki satırların toplamı tutmalı.
*Eski hata: kart "€3.200,00" derken satırlar "€100,00" gösteriyordu.*

### B6. Cari önizleme (uzun bas) **[G]**
Cariler listesinde çapraz-kurlu işlemi olan cariye **uzun bas** → önizlemedeki son işlem
tutarı, cari detayındaki aynı kayıtla **birebir aynı** olmalı.

### B7. İşlem para birimi — hesap bacağı olmayan tipler **[G]**
USD cariye kesilmiş bir **fatura** (cari_alis / cari_satis) için:
- İşlemler listesi → "**$**1.000" (eskiden "₺1.000")
- Raporlar > Cari → aynı
- Cari detayı → aynı (bu zaten doğruydu, artık üçü tutuyor)
- Kategori drill-down toplamı üst karttaki RPC toplamıyla tutmalı.

### B8. Ürün kutusu ikonu **[G]**
EUR carinin ürünlü faturasında satırda "× €5,00" görünüyorsa, kutu ikonuna basınca açılan
modalda da "× €5,00" olmalı (eskiden "× ₺5,00").

### B9. Günlük Ciro **[G]**
İki farklı para birimli hesaba tutar gir:
- Her satırda hesabın **sembolü** görünmeli.
- Başlıktaki toplam **iki ayrı satır** olmalı (eskiden tek "₺toplam" — 100 USD + 100 TRY = ₺200).

### B10. Ana para birimi EUR ile ayraç birliği **[G] [EN]**
Ayarlar → Para Birimi = **EUR** yap:
- Hesap satırı, grup toplamı, hero kart, Raporlar — **hepsi** "€1.234,56" olmalı
  (nokta binlik + virgül ondalık). *Eski hata: kart "€1,234.56", satır "€1.234,56".*
- Yüzdeler "%45,5" (TR) / "45.5 %" (de-DE biçimi) — İngilizce arayüzde "45.5%".
- Tutar girişine "1234,56" yaz → doğru okunmalı ve ekrana virgülle geri yazılmalı.
- Bitirince para birimini geri al.

### B11. Net Varlık Trendi sekme etiketi **[G]**
Ana para birimi TRY dışında (ör. USD) iken Net Varlık Trendi'ni aç → sekme "**Nominal $**"
olmalı, "Nominal ₺" DEĞİL; açıklamada "Turkish lira" geçmemeli.

### B12. Excel hesap ekstresi kuruş uyumu **[G]**
Çapraz-kurlu transferi olan bir hesabın ekstresini Excel'e aktar → "Dönem toplamı" ve
"Kapanış bakiyesi" uygulamadaki bakiyeyle **kuruşu kuruşuna** aynı olmalı.

---

## C. İNGİLİZCE ARAYÜZ **[EN]** — Ayarlar > Dil = English

### C1. Noktalı İ bitti
Şu etiketlerde noktalı İ **görünmemeli**: form etiketleri ("Note (Optional)", "Credit Limit
(Optional)"), sayfa başlıkları, dönem seçicileri ("This Week", "Daily", "All Time"),
"Net Profit/Loss", "Quantity", "Uncategorized", "Nothing overdue".

### C2. Tek terim
- Alt sekme "Contacts" ↔ Raporlar > Genel kartı "**CONTACT STATUS**" (eskiden "CLIENT STATUS").
- Aynı `personel_tahsilat` kaydı üç ekranda aynı adla: Hesap detayı / İşlemler / Personel detayı
  → "**Staff Collection**" (eskiden üç farklı ad).
- Ana sayfa manşeti ↔ Raporlar ↔ Excel: hepsi "**Net Worth**".
- Cari özetinde "Remaining Payable / Remaining Receivable".

### C3. Çoğullar
Tek hesabı/tek carisi olan işletmede Raporlar > Genel: "1 **Account**", "1 **Credit Card**",
"1 **Contact**", "1 **Staff Member**" (eskiden hepsi çoğuldu). Arama "1 result found",
Arşiv "1 item in archive", Personel "1 staff member" / "1 day leave".

### C4. Excel içe aktarma — atlanan satırlar
Kasıtlı bozuk bir dosya aktar (boş tutar + bozuk tarih):
- Atlanan satır gerekçelerinin **hepsi İngilizce** olmalı. *Eski hata: "Account not found: X"
  ile "Tutar boş veya bulunamadı" aynı listede yan yanaydı.*
- "Atlananları indir" → Excel başlıkları ve sayfa adı **İngilizce** ("ROW NO", "SKIP REASON",
  sayfa "Skipped Transactions"). *Eskiden tamamen Türkçeydi.*
- Sonuç ekranındaki gerekçe grupları doğru gruplanmalı (ör. "Account not found" tek satırda).

### C5. Ürün açıklaması
İngilizce arayüzde QuickUrunBar ile cari bağlı bir ürün hareketi kaydet → İşlemler
listesindeki otomatik açıklama "**Cement - 2.5 Piece**" gibi İngilizce olmalı
("… 2.5 adet" DEĞİL). Miktar ayracı locale'e uygun olmalı.

### C6. Yüzde konumu
İngilizce arayüzde rapor kartlarındaki oranlar "**45.5%**" (sonda), Türkçe'de "**%45,5**" (başta).
KDV rozetleri de aynı kuralda.

### C7. Android bildirim kanalı (yalnız Android)
Ayarlar > Uygulamalar > İşletme Takip > Bildirimler → kanal adları uygulama dilinde
("Genel" / "İleri Tarihli İşlemler" — eskiden İngilizceydi). Uygulamayı bir kez açıp kapatmak
metadata'yı yeniler.

---

## D. Regresyon (bozulmadığından emin olunacaklar)

1. **QTB normal kayıt** (gelir/gider/transfer/ödeme/tahsilat) — TRY tek para birimiyle;
   kur barı çıkmamalı, tutarlar doğru.
2. **Tutar alanı 10x/100x kontrolü:** 150,50'lik bir işlemi düzenlemeye aç → tutar alanına
   dokun → değer "150,50" kalmalı ("1505" OLMAMALI). Ürün seçip toplam alana dolduğunda da
   aynı (489,65 → "48965" olmamalı).
3. **Taksitli işlem** oluştur/gör — özet kutusunda tutar ve **plan adedi** aynı para
   birimini saymalı.
4. **Mutabakat** akışı (Excel/CSV karşılaştırma) — tutar ayrıştırması değişti, bir dosyayla dene.
5. **Ekstre PDF/Excel paylaşımı** (cari + hesap + personel) — açılıyor, sayılar ekranla aynı.
6. **Ürün detayı / stok hareketleri** — miktar ve birim etiketleri doğru.
7. Ana sayfa → Raporlar → geri: **tab bar** ve alt boşluklar bozulmamış olmalı
   (paralel oturumun tab-bar commit'i de bu build'de).

---

## Not: uygulanmayanlar
- `ileri_tarihli_islemler`'e kur kolonu eklenmedi (migration; onay bekliyor). Kur tamamlama
  anında soruluyor — akış çalışıyor.
- `docs/*-en.html` hukuki sayfalarındaki ad düzeltmesi **deploy edilmedi**.
Ayrıntı: `docs/I18N-KUR-UYGULAMA-DURUMU.md`

---

## E. 25 Temmuz ikinci turu — denetim kapanışı sonrası eklenenler

Bu maddeler i18n/kur denetiminden SONRA, aynı gün kapatılan üç iş listesinden geliyor
(front-end ertelenenleri, muhasebe denetimi, taksit son parça).

### E1. Miktar / Tutar geçişi — tek bileşen **[G]**
Ürünler listesi ve ürün detayındaki Miktar/Tutar geçişi artık aynı bileşen:
- İki ekranda **birebir aynı** görünmeli (punto, dolgu, BÜYÜK harf).
- Dokunma hedefi büyüdü (hitSlop): butonun kenarına yakın dokunuş da çalışmalı.
- Ekran okuyucu butonu "seçili/seçili değil" olarak duyurmalı.

### E2. Personel listesi alt boşluğu **[G]**
Personel sekmesinde sona kadar kaydır → son satırın ⋮ ve açılan aksiyonları cam tab
bar'ın ve arama pill'inin altında kalmamalı (cariler/ürünler ile aynı davranış).

### E3. PDF ekstre başlığı **[G]**
Geçmiş bir dönem seçip ekstre PDF'i al → başlıkta **"Dönem Sonu Bakiye"** yazmalı
("Son Bakiye" değil). Değer tablodaki kapanış satırıyla aynı olmalı.

### E4. Net Varlık Trendi dipnotu **[G]**
Trend sayfasının altındaki dipnot artık aylık **DEĞİŞİMİN** de arşivli/pasif kayıtları
dışladığını ve Gelir-Gider raporundan farklı çıkabileceğini söylüyor. Metni bir oku —
arşivli carisi olan bir işletmede iki rakamın farkı artık açıklanmış olmalı.

### E5. "Bugünkü kurla çevrildi" notu **[G]**
Yabancı para birimli kalem içeren bir kategoriyi drill-down'da aç → toplamın altında
"Yabancı para tutarlar BUGÜNKÜ kurla çevrildi…" notu çıkmalı.
**TRY-only kullanıcıda bu not HİÇ görünmemeli** (gürültü kontrolü).

### E6. Fatura-hedefli ödeme/tahsilat **[P]**
1. Cari detayında vadeli bir faturayı **swipe** → "Tahsil Et / Öde" → QTB açılır,
   tutar ön-dolu. Kaydet → ödeme **o faturadan** kapanmalı (öndeki başka borca kaymamalı).
2. Taksitli bir faturada aynı jest → ön-dolu tutar **sıradaki açık taksitin kalanı**
   olmalı (işlemin tamamı değil).
3. Kaydedilen bu ödemeyi **düzenle** (tutarı değiştir) → hedefleme kaybolmamalı,
   ödeme yine aynı faturadan düşmeye devam etmeli.
   *(3. madde jest ile kilitli ama cihazda da bir kez görülmeli.)*
