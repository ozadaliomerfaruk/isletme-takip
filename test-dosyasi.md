# DefterApp v2 - Kapsamli Test Kontrol Listesi

> Her maddeyi test ettikten sonra `[ ]` yerine `[x]` yazarak isaretleyin.
> Sorun buldugunuzda yanina not ekleyin: `[x] SORUN: aciklama`

---

## 1. KIMLIK DOGRULAMA (Auth)

### 1.1 Kayit (Register)
- [ ] Yeni hesap olusturma (email + sifre)
- [ ] Sifre gucluluek gostergesi calisiyor mu
- [ ] Zayif sifre reddediliyor mu
- [ ] Gecersiz email formati reddediliyor mu
- [ ] Kayit sonrasi email dogrulama ekranina yonlendirme
- [ ] Mevcut email ile kayit olma denemesi (hata mesaji)

### 1.2 Giris (Login)
- [ ] Email + sifre ile giris
- [ ] Yanlis sifre ile giris denemesi (hata mesaji)
- [ ] Kayitli olmayan email ile giris denemesi
- [ ] Giris sonrasi ana sayfaya yonlendirme

### 1.3 Sifremi Unuttum
- [ ] Sifremi unuttum linki calisiyor
- [ ] Sifre sifirlama emaili geliyor
- [ ] Yeni sifre belirleme ekrani calisiyor

### 1.4 Sifre Degistirme
- [ ] Daha > Isletme Bilgileri > Sifre Degistir
- [ ] Eski sifre dogrulamasi yapiliyor
- [ ] Yeni sifre gucluluek kontrolu
- [ ] Basarili degisiklik sonrasi bildirim

### 1.5 Oturum Yonetimi
- [ ] Cikis yap butonu calisiyor
- [ ] Cikis sonrasi login ekranina donuyor
- [ ] App kapanip acildiginda oturum devam ediyor
- [ ] Token suresi doldugunda yeniden giris isteniyor

---

## 2. ONBOARDING ve ISLETME AYARLARI

### 2.1 Onboarding
- [ ] Ilk giris sonrasi onboarding ekrani gorunuyor
- [ ] Isletme adi girisi
- [ ] Varsayilan hesap olusturma
- [ ] Onboarding tamamlandiktan sonra ana sayfaya gecis

### 2.2 Isletme Bilgileri (/ayarlar/isletme)
- [ ] Isletme adini duzenleme
- [ ] Isletme adini kaydetme
- [ ] Duzenleme sonrasi guncellemenin yansimasi (header, profil karti)

---

## 3. DASHBOARD (Ana Sayfa / Tabs > index)

### 3.1 Hero Card
- [ ] Toplam bakiye dogru gorunuyor
- [ ] Bakiye tum hesaplarin toplamini yansitiyyor
- [ ] Para birimi formatlamasi dogru (TRY/USD/EUR)

### 3.2 Gelir-Gider Karti (IncomeExpenseCard)
- [ ] Aylik gelir dogru
- [ ] Aylik gider dogru
- [ ] Kar/zarar (gelir - gider) dogru
- [ ] Onceki aya gore degisim yuzdeleri

### 3.3 Nakit Akisi Karti (CashFlowCard)
- [ ] Nakit giris toplami dogru
- [ ] Nakit cikis toplami dogru
- [ ] Kategori bazli dagilimlari gosteriyor

### 3.4 Dashboard Carousel
- [ ] Kartlar arasinda swipe calisiyor
- [ ] Sayfa indikatoru dogru gorunuyor

### 3.5 Finansal Detay Modal (FinancialDetailModal)
- [ ] Karta tiklayinca modal aciliyor
- [ ] Detayli gelir/gider dagilimi gorunuyor
- [ ] Modal kapatma calisiyor

### 3.6 Bekleyen Cekler Section (BekleyenCeklerSection)
- [ ] Vadesi yaklasan cekler listesi gorunuyor
- [ ] Cek bilgileri dogru (tutar, vade, cari)
- [ ] Ceke tiklaninca detay sayfasina gidiyor

### 3.7 Ileri Tarihli Islemler Section
- [ ] Yaklasan ileri tarihli islemler gorunuyor
- [ ] Islem bilgileri dogru
- [ ] Isleme tiklaninca detaya gidiyor

### 3.8 Bildirimler (NotificationBell)
- [ ] Bildirim ikonu gorunuyor
- [ ] Yeni bildirim varsa badge sayisi gorunuyor

---

## 4. HESAPLAR (Tabs > index / Hesaplar listesi)

### 4.1 Hesap Listesi
- [ ] Tum hesaplar listeleniyor
- [ ] Her hesabin bakiyesi gorunuyor
- [ ] Hesap rengi/ikonu gorunuyor
- [ ] Para birimi dogru gorunuyor (TRY, USD, EUR)
- [ ] Arsivlenmis hesaplar gizleniyor

### 4.2 Hesap Ekleme (/hesaplar/ekle)
- [ ] Hesap adi girisi
- [ ] Para birimi secimi (TRY/USD/EUR)
- [ ] Hesap turu secimi (nakit/banka/kredi karti)
- [ ] Baslangic bakiyesi girisi
- [ ] Renk secimi (ColorPicker)
- [ ] Ikon secimi (IconPicker)
- [ ] Kaydet butonu calisiyor
- [ ] Yeni hesap listede gorunuyor
- [ ] Bos isim ile kayit engelleniyor

### 4.3 Hesap Detay (/hesaplar/[id])
- [ ] Hesap bilgileri dogru gorunuyor
- [ ] Hesaba ait islemler listeleniyor
- [ ] Islemlerde tarih gruplama calisiyor
- [ ] Islemlerde arama calisiyor
- [ ] Sola kaydir ile islem silme
- [ ] QuickTransactionBar aciliyor (+ butonu)
- [ ] Ileri tarihli islemler section gorunuyor

### 4.4 Hesap Duzenleme (/hesaplar/duzenle/[id])
- [ ] Mevcut bilgiler formda gorunuyor
- [ ] Hesap adini duzenleme
- [ ] Para birimini duzenleme
- [ ] Renk/ikon duzenleme
- [ ] Kaydet sonrasi guncelleme yansimasi

### 4.5 Hesap Arsivleme
- [ ] Hesap detaydan arsivleme secenegi
- [ ] Arsivleme onay dialogu
- [ ] Arsivlenmis hesap ana listeden kalkiyor
- [ ] Arsiv sayfasinda gorunuyor

### 4.6 Hesap Silme
- [ ] Hesap silme secenegi
- [ ] Onay dialogu cikmasi
- [ ] Islem bagli hesap silinemiyor (uyari)
- [ ] Bos hesap silinebiliyor
- [ ] Silme sonrasi listeden kalkmasi

### 4.7 Kredi Karti Hesabi
- [ ] Kredi karti tipi hesap olusturma
- [ ] Kredi karti ozel alanlari (limit vs.)
- [ ] CreditCardTransactionBar aciliyor
- [ ] Nakit avanslar listesi gorunuyor (/hesaplar/nakit-avanslar/[id])
- [ ] Nakit avans ekleme (NakitAvansSheet)
- [ ] Taksit odeme kaydi

---

## 5. CARILER (Tabs > cariler)

### 5.1 Cari Listesi
- [ ] Tum cariler listeleniyor
- [ ] Tab filtreleme: Tumu / Musteriler / Tedarikciler
- [ ] Arama calisiyor (isme gore)
- [ ] Turkce karakter aramasinda sorun yok (i/I, s/S vs.)
- [ ] Her carinin bakiyesi gorunuyor
- [ ] Borclu/alacakli durumu renk ile gorunuyor
- [ ] Arsivlenmis cariler gizleniyor
- [ ] Bos durum mesaji (cari yoksa)

### 5.2 Cari Ekleme (/cariler/ekle)
- [ ] Cari adi girisi
- [ ] Tur secimi: musteri / tedarikci
- [ ] Para birimi secimi
- [ ] Baslangic bakiye yonu secimi (BalanceDirectionSelector)
- [ ] Baslangic bakiye tutari girisi
- [ ] Kaydet butonu calisiyor
- [ ] Yeni cari listede gorunuyor
- [ ] Bos isim ile kayit engelleniyor

### 5.3 Cari Detay (/cariler/[id])
- [ ] Cari bilgileri gorunuyor (isim, tur, bakiye)
- [ ] Cariye ait islemler listeleniyor
- [ ] Islemlerde tarih gruplama calisiyor
- [ ] Islemlerde arama calisiyor
- [ ] Sola kaydir ile islem silme
- [ ] QuickTransactionBar aciliyor
  - [ ] Musteri: Satis / Tahsilat / Satis Iade islem tipleri
  - [ ] Tedarikci: Alis / Odeme / Alis Iade islem tipleri
- [ ] Ileri tarihli islemler section gorunuyor
- [ ] Cek islemleri (CekKesSheet) calisiyor

### 5.4 Cari Duzenleme (/cariler/duzenle/[id])
- [ ] Mevcut bilgiler formda gorunuyor
- [ ] Cari adini duzenleme
- [ ] Tur degistirme
- [ ] Kaydet sonrasi yansima

### 5.5 Cari Arsivleme ve Silme
- [ ] Arsivleme calisiyor
- [ ] Arsivden geri alma calisiyor
- [ ] Islem bagli cari silinemiyor

### 5.6 Cari Paylasim (Sharing)
- [ ] Paylasim kodu olusturma (ShareCodeModal)
- [ ] Kod kopyalama
- [ ] Baska isletmeden kod ile baglama (AcceptCodeSheet)
- [ ] Bagli cari badge gorunuyor (LinkedCariBadge)
- [ ] Bagli carinin islemleri gorunuyor

---

## 6. PERSONEL (Tabs > personel)

### 6.1 Personel Listesi
- [ ] Tum personeller listeleniyor
- [ ] Arama calisiyor
- [ ] Bakiye gorunuyor
- [ ] Arsivlenmis personel gizleniyor

### 6.2 Personel Ekleme (/personel/ekle)
- [ ] Personel adi girisi
- [ ] Para birimi secimi
- [ ] Baslangic bakiye
- [ ] Kaydet calisiyor

### 6.3 Personel Detay (/personel/[id])
- [ ] Personel bilgileri gorunuyor
- [ ] Islemler listeleniyor
- [ ] QuickTransactionBar aciliyor
  - [ ] Personel Gideri (maas/prim)
  - [ ] Personel Odemesi
  - [ ] Personel Tahsilati
  - [ ] Personel Satisi
- [ ] Izin kotasi karti (LeaveQuotaCard) gorunuyor
  - [ ] Toplam izin hakki
  - [ ] Kullanilan izin
  - [ ] Kalan izin

### 6.4 Personel Izin Takibi
- [ ] Izin hakki ekleme islemi
- [ ] Izin kullanimi kaydi
- [ ] Izin gecmisi gorunuyor (/personel/izin-gecmisi/[id])
- [ ] Izin baslangic/bitis tarihleri dogru
- [ ] Yetersiz izin hakki ile kullanim engeli

### 6.5 Personel Duzenleme (/personel/duzenle/[id])
- [ ] Mevcut bilgiler gorunuyor
- [ ] Duzenleme ve kaydet calisiyor

### 6.6 Personel Arsivleme ve Silme
- [ ] Arsivleme calisiyor
- [ ] Islem bagli personel silinemiyor

### 6.7 Toplu Islemler
- [ ] Toplu gider ekleme (/personel/toplu-gider)
  - [ ] Birden fazla personel secimi
  - [ ] Tutar girisi
  - [ ] Tek seferde kayit
- [ ] Toplu odeme ekleme (/personel/toplu-odeme)
  - [ ] Birden fazla personel secimi
  - [ ] Tutar girisi
  - [ ] Tek seferde kayit

---

## 7. URUNLER (Tabs > urunler)

### 7.1 Urun Listesi
- [ ] Tum urunler listeleniyor
- [ ] Stok miktari gorunuyor
- [ ] Birim gorunuyor (adet, kg, lt vs.)
- [ ] Kategori bilgisi gorunuyor
- [ ] Arama calisiyor
- [ ] Arsivlenmis urunler gizleniyor

### 7.2 Urun Ekleme (/urunler/ekle)
- [ ] Urun adi girisi
- [ ] Birim secimi (UnitPicker) - adet, kg, lt, metre, kutu vs.
- [ ] Kategori secimi (CategoryPicker)
- [ ] KDV orani girisi
- [ ] Alis fiyati ve satis fiyati
- [ ] Baslangic stok miktari
- [ ] Kaydet calisiyor

### 7.3 Urun Detay (/urunler/[id])
- [ ] Urun bilgileri gorunuyor
- [ ] Stok miktari gorunuyor
- [ ] Urun hareketleri listeleniyor (giris/cikis/duzeltme)
- [ ] Hareket detaylari dogru (tarih, miktar, tur)
- [ ] QuickUrunBar aciliyor
  - [ ] Urun Alimi (stok giris)
  - [ ] Urun Satisi (stok cikis)
  - [ ] Stok Duzeltme
  - [ ] Cari hesaba baglama secenegi
  - [ ] KDV hesaplamasi dogru
- [ ] Aylik stok ozeti gorunuyor

### 7.4 Urun Duzenleme (/urunler/duzenle/[id])
- [ ] Mevcut bilgiler gorunuyor
- [ ] Duzenleme ve kaydet calisiyor

### 7.5 Toplu Islemler
- [ ] Toplu stok giris (/urunler/toplu-giris)
  - [ ] Birden fazla urun secimi
  - [ ] Her urun icin miktar girisi
  - [ ] Tek seferde kayit
- [ ] Toplu stok cikis (/urunler/toplu-cikis)
  - [ ] Birden fazla urun secimi
  - [ ] Miktar girisi
  - [ ] Yetersiz stok uyarisi

### 7.6 Urun Excel Export (UrunExportSheet)
- [ ] Excel export secenegi aciliyor
- [ ] Urun listesi excel olarak indiriliyor
- [ ] Excel dosyasinda tum bilgiler dogru

---

## 8. ISLEM EKLEME (Transaction Bars)

### 8.1 QuickTransactionBar - Genel
- [ ] Tarih secimi (DateTimePickerModal) calisiyor
- [ ] Bugun, dun, onceki gun kisayollari
- [ ] Ileri tarih secimi (ileri tarihli islem olusturur)
- [ ] Tutar girisi (AmountInput / CurrencyInput)
- [ ] Aciklama girisi
- [ ] Hesap secimi (HesapPickerSheet)
- [ ] Kaydet butonu calisiyor
- [ ] Bos tutar ile kayit engelleniyor
- [ ] Basarili kayit sonrasi bar kapaniyor
- [ ] Toast mesaji gorunuyor

### 8.2 Gelir Islemi (/islemler/gelir)
- [ ] Tutar girisi
- [ ] Hesap secimi
- [ ] Kategori secimi
- [ ] Aciklama
- [ ] Tarih secimi
- [ ] Kaydet ve islem listesinde gorunme
- [ ] Hesap bakiyesi artiyor

### 8.3 Gider Islemi (/islemler/gider)
- [ ] Tutar girisi
- [ ] Hesap secimi
- [ ] Kategori secimi
- [ ] Aciklama
- [ ] Tarih secimi
- [ ] Kaydet ve islem listesinde gorunme
- [ ] Hesap bakiyesi azaliyor

### 8.4 Transfer Islemi (/islemler/transfer)
- [ ] Kaynak hesap secimi
- [ ] Hedef hesap secimi
- [ ] Tutar girisi
- [ ] Kaynak ve hedef farkli hesaplar olmali (ayni hesap engeli)
- [ ] Kaynak bakiye azaliyor, hedef bakiye artiyor
- [ ] Farkli doviz transferi - kur girisi (ExchangeRateBar)

### 8.5 Cari Alis (/islemler/cariAlis)
- [ ] Cari secimi (CariPickerSheet - tedarikciler)
- [ ] Tutar, hesap, kategori, aciklama
- [ ] Cari bakiye guncelleniyor (borclu)
- [ ] Urun baglama secenegi

### 8.6 Cari Satis (/islemler/cariSatis)
- [ ] Cari secimi (CariPickerSheet - musteriler)
- [ ] Tutar, hesap, kategori, aciklama
- [ ] Cari bakiye guncelleniyor (alacakli)
- [ ] Urun baglama secenegi

### 8.7 Cari Odeme (/islemler/cariOdeme)
- [ ] Cari secimi (tedarikciler)
- [ ] Tutar, hesap
- [ ] Odeme sonrasi cari bakiyesi azaliyor
- [ ] Odeme hedef secimi (OdemeHedefTypePicker)

### 8.8 Cari Tahsilat (/islemler/cariTahsilat)
- [ ] Cari secimi (musteriler)
- [ ] Tutar, hesap
- [ ] Tahsilat sonrasi cari bakiyesi azaliyor
- [ ] Tahsilat hedef secimi (TahsilatHedefTypePicker)

### 8.9 Personel Gider (/islemler/personelGider)
- [ ] Personel secimi (PersonelPickerSheet)
- [ ] Tutar, hesap, kategori
- [ ] Personel bakiyesi guncelleniyor

### 8.10 Personel Odeme (/islemler/personelOdeme)
- [ ] Personel secimi
- [ ] Tutar, hesap
- [ ] Odeme sonrasi personel bakiyesi

### 8.11 Kredi Karti Islemi (CreditCardTransactionBar)
- [ ] Kredi karti secimi (KrediKartiPickerSheet)
- [ ] Tutar girisi
- [ ] Taksit secenegi
- [ ] Islem kaydediliyor

### 8.12 Fotograf Ekleme (PhotoButton)
- [ ] Kameradan fotograf cekme
- [ ] Galeriden fotograf secme
- [ ] Fotograf isleme baglaniiyor
- [ ] Fotograf goruntuleme (PhotoViewerModal)
- [ ] Fotograf silme

---

## 9. ISLEM YONETIMI

### 9.1 Tum Islemler Listesi (/islemler/index)
- [ ] Tum islemler listeleniyor
- [ ] Tarih gruplama (bugun, dun, onceki gunler)
- [ ] Islem tipi filtreleme (FilterChips)
  - [ ] Tumu
  - [ ] Gelir
  - [ ] Gider
  - [ ] Transfer
  - [ ] Cari
  - [ ] Personel
  - [ ] Ileri Tarihli
- [ ] Arama calisiyor (aciklama, tutar, entity)
- [ ] Sonsuz kaydirma (pagination/infinite scroll)

### 9.2 Islem Silme
- [ ] Sola kaydir (SwipeableRow) ile silme
- [ ] Onay dialogu
- [ ] Silme sonrasi bakiyeler geri donuyor
- [ ] Undo secenegi (UndoSnackbar) calisiyor
- [ ] Geri alma sonrasi bakiyeler tekrar guncelleniyor

### 9.3 Islem Duzenleme (/islemler/duzenle/[id])
- [ ] Mevcut islem bilgileri formda gorunuyor
- [ ] Tutar duzenleme
- [ ] Tarih duzenleme
- [ ] Aciklama duzenleme
- [ ] Kategori degistirme
- [ ] Kaydet sonrasi guncelleme yansimasi
- [ ] Bakiyeler dogru guncelleniyor

### 9.4 Ileri Tarihli Islem Duzenleme (/islemler/ileri-tarihli/duzenle/[id])
- [ ] Mevcut bilgiler gorunuyor
- [ ] Tarih duzenleme
- [ ] Tutar duzenleme
- [ ] Kaydet calisiyor

### 9.5 Gunluk Kasa Modal (DailyCashModal)
- [ ] Gunluk kasa ozeti gorunuyor
- [ ] Gelir/gider toplamlar dogru
- [ ] Hesap bazli dagiliim

---

## 10. ILERI TARIHLI ISLEMLER

- [ ] Ileri tarih secildiginde otomatik ileri tarihli islem olarak kaydediliyor
- [ ] Ileri tarihli islemler listesi gorunuyor
- [ ] Bekleyen durum badge
- [ ] Vade tarihi geldikten sonra islem otomatik gerceklesiyor (edge function: process-scheduled-transactions)
- [ ] Gerceklesen islem normal islem listesinde gorunuyor
- [ ] Ileri tarihli islem silme
- [ ] Ileri tarihli islem duzenleme

---

## 11. CEKLER (Cek Islemleri)

### 11.1 Cek Kaydi
- [ ] Cari detay sayfasindan cek kesme (CekKesSheet)
- [ ] Cek tutari girisi
- [ ] Vade tarihi secimi
- [ ] Cek numarasi
- [ ] Hesap secimi
- [ ] Kaydet calisiyor

### 11.2 Cek Listesi ve Durumu
- [ ] Bekleyen cekler listesi (Dashboard)
- [ ] Cek durumu badge (CekStatusBadge): bekleyen/tahsil edildi/iade
- [ ] Vadesi gecen cekler uyarisi

### 11.3 Cek Tahsilati
- [ ] Vadesi gelen ceki tahsil etme
- [ ] Tahsilat sonrasi hesap bakiyesi guncelleniyor
- [ ] Cek durumu "tahsil edildi" oluyor

---

## 12. DOVIZ ISLEMLERI

### 12.1 Doviz Kurları
- [ ] Guncel kur bilgisi geliyor (edge function: fetch-exchange-rates)
- [ ] USD, EUR, GBP kurlari gorunuyor
- [ ] Kur guncelleme butonu calisiyor

### 12.2 Farkli Doviz Islemleri
- [ ] USD hesaba USD islem ekleme
- [ ] EUR hesaba EUR islem ekleme
- [ ] Farkli doviz transferi (ExchangeRateBar ile kur girisi)
- [ ] Kur carpimi dogru hesaplaniyor
- [ ] Dashboard'da doviz bakiyeleri dogru toplaniiyor
- [ ] Cari/Personel farkli doviz bakiyeleri

---

## 13. KATEGORILER (/kategoriler)

### 13.1 Kategori Listesi
- [ ] Gelir kategorileri listeleniyor
- [ ] Gider kategorileri listeleniyor
- [ ] Urun kategorileri listeleniyor
- [ ] Ust kategori iliskisi gorunuyor (ParentCategoryPicker)

### 13.2 Kategori Ekleme (/kategoriler/ekle)
- [ ] Kategori adi girisi
- [ ] Tur secimi: gelir / gider / urun
- [ ] Ust kategori secimi (opsiyonel)
- [ ] Renk secimi
- [ ] Ikon secimi
- [ ] Kaydet calisiyor

### 13.3 Kategori Duzenleme (/kategoriler/duzenle/[id])
- [ ] Mevcut bilgiler gorunuyor
- [ ] Duzenleme ve kaydet calisiyor

### 13.4 Kategori Silme
- [ ] Islem bagli kategori silinemiyor
- [ ] Bos kategori silinebiliyor

---

## 14. RAPORLAR (/raporlar)

### 14.1 Rapor Anasayfasi (/raporlar/index)
- [ ] Rapor kartlari gorunuyor
- [ ] Her rapora tiklaninca ilgili sayfaya gidiyor

### 14.2 Genel Rapor (/raporlar/genel)
- [ ] Donem secimi calisiyor (aylik/yillik/ozel)
- [ ] Gelir/gider ozeti dogru
- [ ] Kar/zarar bilgisi dogru
- [ ] Grafik gorunuyor
- [ ] Onceki donemle karsilastirma

### 14.3 Gelir-Gider Raporu (/raporlar/gelir-gider)
- [ ] Donem secimi
- [ ] Gelir detay listesi
- [ ] Gider detay listesi
- [ ] Kategori bazli dagiliim
- [ ] Grafik gorunuyor

### 14.4 Cari Raporu (/raporlar/cari)
- [ ] Cari bazli borc/alacak ozeti
- [ ] Cari secimi (EntityPicker)
- [ ] Secilen carinin islem gecmisi (EntityTransactionList)
- [ ] Toplam borc/alacak dogru

### 14.5 Personel Raporu (/raporlar/personel)
- [ ] Personel bazli maas/odeme ozeti
- [ ] Personel secimi
- [ ] Secilen personelin islem gecmisi
- [ ] Toplam gider/odeme dogru

### 14.6 Kategori Raporu (/raporlar/kategori/[id])
- [ ] Secilen kategorinin islemleri
- [ ] Toplam tutar
- [ ] Donem bazli filtreleme
- [ ] Urun bazli detay (eger urun kategorisi ise)

### 14.7 Alis-Satis Raporu (/raporlar/alis-satis)
- [ ] Alis toplami dogru
- [ ] Satis toplami dogru
- [ ] Kar hesaplamasi dogru
- [ ] Urun bazli ayrinttilar

### 14.8 Karsilastirma Raporu (/raporlar/karsilastirma)
- [ ] Iki farkli donem secimi
- [ ] Gelir/gider karsilastirmasi
- [ ] Degisim yuzdeleri dogru
- [ ] Grafik gorunuyor (KarsilastirmaTabContent)

### 14.9 Nakit Akisi (/nakit-akisi/index)
- [ ] Nakit giris/cikis ozeti
- [ ] Hesap bazli dagiliim
- [ ] Donem secimi
- [ ] Kategori bazli dagiliim

### 14.10 Rapor Filtreleme (TrendFilterModal)
- [ ] Donem secimi: Bu ay / Gecen ay / Son 3 ay / Son 6 ay / Bu yil / Ozel
- [ ] Ozel tarih araligi secimi
- [ ] Filtre uygulandiktan sonra veriler guncelleniyor

### 14.11 Hizli Bilgiler (QuickInsights)
- [ ] Ozet bilgiler gorunuyor
- [ ] Trend gostergeleri (TrendIndicator)

---

## 15. EXCEL EXPORT

### 15.1 Islem Excel Export (ExportSheet)
- [ ] Hesap detay sayfasindan export aciliyor
- [ ] Cari detay sayfasindan export aciliyor
- [ ] Personel detay sayfasindan export aciliyor
- [ ] Donem secimi (filtre)
- [ ] Excel dosyasi olusturuluyor
- [ ] Dosya paylasim secenegi calisiyor
- [ ] Excel iceriginde: tarih, aciklama, tutar, tur, kategori, hesap bilgileri dogru

### 15.2 Rapor Excel Export (useReportExcelExport)
- [ ] Genel rapor excel export
- [ ] Gelir-Gider rapor excel export
- [ ] Cari rapor excel export
- [ ] Personel rapor excel export
- [ ] Alis-Satis rapor excel export

### 15.3 Urun Excel Export (UrunExportSheet)
- [ ] Urun listesi export
- [ ] Stok bilgileri dogru
- [ ] Urun hareketleri export

---

## 16. DATA IMPORT (/ayarlar/data-import)

### 16.1 Excel Import
- [ ] Excel dosyasi yukleme
- [ ] Dosya formati dogrulama
- [ ] Sutun eslestirme ekrani
- [ ] Onizleme ekrani (PendingTransactionForm)
- [ ] Cakisan islem tespiti (useImportDuplicates)
- [ ] Atlanan islemler gosterimi (SkippedTransactionCard)
- [ ] Entity eslestirme (EntityPickerModal)
- [ ] Import islemi basarili
- [ ] Import geri alma (undo batch import)

### 16.2 Import Gecmisi
- [ ] Onceki importlar listeleniyor (useImportHistory)
- [ ] Her importin detaylari gorunuyor

### 16.3 Foto Import (/foto-import)
- [ ] Fatura fotogurafı cekme (OcrCaptureStep)
- [ ] OCR isleme (parse-invoice edge function)
- [ ] Taninan verileri inceleme (review.tsx)
- [ ] Urun eslestirme
- [ ] Yeni urun olusturma (OcrNewProductModal)
- [ ] Toplu islem olusturma

---

## 17. COKLU KULLANICI (Multi-User)

### 17.1 Davet Olusturma (/ayarlar/davet-olustur)
- [ ] Email adresi girisi
- [ ] Rol secimi (RoleSelector): admin / member
- [ ] Izin ayarlari (PermissionEditor)
- [ ] Davet gonderme
- [ ] Mevcut kullaniciya yeniden davet engeli

### 17.2 Kullanici Yonetimi (/ayarlar/kullanici-yonetimi)
- [ ] Mevcut kullanicilar listeleniyor
- [ ] Bekleyen davetler listeleniyor
- [ ] Kullanici duzenleme (UserEditSheet)
  - [ ] Rol degistirme
  - [ ] Izin duzenleme
- [ ] Kullanici cikarma
- [ ] Davet iptal etme
- [ ] Sadece owner gorebiliyor (izin kontrolu)

### 17.3 Izin Sistemi
- [ ] Owner: tam yetki
- [ ] Admin: hesap silme haric tam yetki
- [ ] Member: sadece okuma + izin verilen islemler
- [ ] PermissionGate componenti calisiyor
- [ ] Yetkisiz islemlerde uyari mesaji
- [ ] Tab gorunurlugu izinlere gore (usePermissions)
  - [ ] Cariler tabi gorunurlugu
  - [ ] Personel tabi gorunurlugu
  - [ ] Urunler tabi gorunurlugu

### 17.4 Paylasilan Isletmeler (/ayarlar/paylasilan-isletmeler)
- [ ] Davet alinan isletmeler listesi
- [ ] Isletme degistirme
- [ ] Degistirme sonrasi tum veriler guncelleniyor

### 17.5 Islem Gecmisi (/ayarlar/islem-gecmisi)
- [ ] Audit log kayitlari gorunuyor
- [ ] Kim, ne zaman, ne yapti bilgisi
- [ ] Filtreleme (kullaniciya gore)
- [ ] Sadece owner gorebiliyor

### 17.6 SharedIsletmeBanner
- [ ] Paylasilan isletmedeyken banner gorunuyor
- [ ] Banner'da isletme adi ve rol bilgisi

---

## 18. ARSIV (/arsiv)

- [ ] Arsiv sayfasi aciliyor
- [ ] Arsivlenmis hesaplar gorunuyor
- [ ] Arsivlenmis cariler gorunuyor
- [ ] Arsivlenmis personeller gorunuyor
- [ ] Arsivlenmis urunler gorunuyor
- [ ] Arsivden geri alma calisiyor
- [ ] Geri alinan kayit ana listede gorunuyor
- [ ] ArchivedBanner arsivlenmis detay sayfalarinda gorunuyor

---

## 19. ARAMA (/arama)

- [ ] Global arama sayfasi aciliyor
- [ ] Islem aramaasi calisiyor
- [ ] Cari aramaasi calisiyor
- [ ] Personel aramaasi calisiyor
- [ ] Hesap aramaasi calisiyor
- [ ] Urun aramaasi calisiyor
- [ ] Turkce karakter destegi (fuzzyMatch)
- [ ] Sonuca tiklaninca ilgili sayfaya gidiyor

---

## 20. TERCIHLER (Daha > Ayarlar)

### 20.1 Dil Secimi
- [ ] Turkce secimi
- [ ] English secimi
- [ ] Dil degisikliginden sonra tum metinler guncelleniyor
- [ ] Dil secimi kaliici (app restart sonrasi da gecerli)

### 20.2 Para Birimi Secimi
- [ ] TRY secimi
- [ ] USD secimi
- [ ] EUR secimi
- [ ] GBP secimi
- [ ] Secim sonrasi tum tutarlar dogru formatlaniiyor
- [ ] Secim kaliici

### 20.3 Tarih Formati Secimi
- [ ] Farkli tarih formatlari arasinda gecis
- [ ] Ornek tarih gosterimi dogru
- [ ] Tum sayfalarda tarih formati uygulaniiyor

---

## 21. HESAP SILME (/ayarlar/hesap-sil)

- [ ] Hesap silme sayfasi aciliyor
- [ ] Uyari mesajlari gorunuyor (tum veriler silinecek)
- [ ] Onay islemleri (email/sifre dogrulama)
- [ ] Silme sonrasi hesap tamamen kaldiriliyor
- [ ] Edge function: delete-scheduled-accounts calisiyor (zamanlanmis silme)

---

## 22. YASAL SAYFALAR

- [ ] Kullanim Kosullari sayfasi aciliyor (/yasal/kullanim-kosullari)
- [ ] Gizlilik Politikasi sayfasi aciliyor (/yasal/gizlilik-politikasi)
- [ ] KVKK sayfasi aciliyor (/yasal/kvkk)
- [ ] Sayfalar yukleniyor ve icerik gorunuyor

---

## 23. BILDIRIMLER ve HATIRLATMALAR

### 23.1 Hatirlatma Ayarlari (ReminderSettings)
- [ ] Hatirlatma acma/kapama
- [ ] Hatirlatma saati secimi
- [ ] Push notification izni isteme
- [ ] Bildirimler geliyor

### 23.2 Bagli Kullanici Bildirimleri
- [ ] Cari paylasimda bildirim (edge function: notify-linked-users)
- [ ] Islem eklendiginde bildirim

---

## 24. CACHE ve PERFORMANS

### 24.1 React Query Cache
- [ ] Islem ekleme sonrasi ilgili listeler guncelleniyor
- [ ] Islem silme sonrasi ilgili listeler guncelleniyor
- [ ] Hesap degisikligi sonrasi dashboard guncelleniyor
- [ ] Cari islem sonrasi cari bakiye guncelleniyor
- [ ] Personel islem sonrasi personel bakiye guncelleniyor
- [ ] Urun hareket sonrasi stok guncelleniyor
- [ ] Sayfa degistirme sonrasi stale veri yenileniiyor
- [ ] Pull-to-refresh calisiyor (listelerde asagi cek)

### 24.2 Performans
- [ ] Uzun listeler smooth kaydiriliyor (FlatList virtualization)
- [ ] Buyuk veri setlerinde (100+ islem) yavaslama yok
- [ ] Animasyonlar akici (AnimatedListItem, AnimatedNumber, AnimatedPressable)
- [ ] Skeleton loader'lar yukleme sirasinda gorunuyor

---

## 25. UI/UX GENEL KONTROLLER

### 25.1 Modaller ve Sheet'ler
- [ ] BottomSheet aciliyor ve kapaniyor (swipe down)
- [ ] ActionSheet secenekleri gorunuyor
- [ ] DateTimePickerModal tarih secimi calisiyor
- [ ] HesapPickerSheet hesap secimi calisiyor
- [ ] CariPickerSheet cari secimi calisiyor
- [ ] PersonelPickerSheet personel secimi calisiyor
- [ ] KrediKartiPickerSheet kredi karti secimi calisiyor
- [ ] UrunPickerModal urun secimi calisiyor
- [ ] EntityPickerModal entity secimi calisiyor

### 25.2 Genel UI
- [ ] Tum sayfalarda header dogru gorunuyor
- [ ] Geri butonu calisiyor
- [ ] Tab bar dogru gorunuyor
- [ ] Tab bar'da aktif tab vurgulaniyor
- [ ] Haptic feedback calisiyor (tab degistirme)
- [ ] Toast mesajlari dogru gorunuyor ve kayboluyor
- [ ] EmptyState mesajlari bos sayfalarda gorunuyor
- [ ] Skeleton loaderlar yukleme sirasinda gorunuyor
- [ ] Klavye acildiginda inputlar gorunur kaliyor
- [ ] SwipeableRow (saga/sola kaydir) duzgun calisiyor

### 25.3 Responsive Tasarim
- [ ] Kucuk ekranda (iPhone SE) sayfa tasmiyor
- [ ] Buyuk ekranda (iPad / tablet) duzgun gorunuyor
- [ ] Landscape modda ciddi sorun yok

---

## 26. BACKEND - EDGE FUNCTIONS

### 26.1 fetch-exchange-rates
- [ ] Doviz kurlari basarili donuyor
- [ ] Kur verisi guncel
- [ ] Hata durumunda uygun response

### 26.2 process-scheduled-transactions
- [ ] Vadesi gelen ileri tarihli islemler gerceklestiriliyor
- [ ] Bakiyeler dogru guncelleniyor
- [ ] Cek vadeleri isleniiyor

### 26.3 parse-invoice (OCR)
- [ ] Fatura gorseli isleniyor
- [ ] Urun bilgileri taniiniyor
- [ ] JSON formati dogru donuyor

### 26.4 delete-scheduled-accounts
- [ ] Zamanlanmis hesap silme calisiyor
- [ ] Silme sonrasi tum veriler temizleniyor

### 26.5 notify-linked-users
- [ ] Bagli kullanicilara bildirim gidiyor
- [ ] Bildirim icerigi dogru

---

## 27. BACKEND - RPC FUNCTIONS (Supabase)

### 27.1 increment_balance
- [ ] Hesap bakiyesi dogru artiriliyor/azaltiliyor
- [ ] Cari bakiyesi dogru artiriliyor/azaltiliyor
- [ ] Personel bakiyesi dogru artiriliyor/azaltiliyor
- [ ] Atomik islem garantisi (partial failure yok)

### 27.2 perform_nakit_avans
- [ ] Nakit avans islemi olusturuluyor
- [ ] Taksitler olusturuluyor
- [ ] Bakiyeler dogru guncelleniyor

### 27.3 delete_nakit_avans
- [ ] Nakit avans siliniyor
- [ ] Taksitler siliniyor
- [ ] Bakiyeler geri donuyor

### 27.4 Reporting RPCs
- [ ] get_month_summary dogru veri donuyor
- [ ] get_category_report dogru veri donuyor
- [ ] get_cash_flow_by_category dogru veri donuyor
- [ ] get_balance_activity dogru veri donuyor
- [ ] get_product_report dogru veri donuyor

### 27.5 undo_import_batch
- [ ] Import geri alma calisiyor
- [ ] Bakiyeler geri donuyor
- [ ] Cross-currency durumlarda dogru calisiyor

---

## 28. GUVENLIK ve RLS (Row Level Security)

- [ ] Kullanici sadece kendi isletmesinin verilerini goruyor
- [ ] Baska isletmenin verilerine URL ile erisim engeli
- [ ] Multi-user: member sadece izinli verileri goruyor
- [ ] Multi-user: admin silme islemi kisitli
- [ ] Owner degistirilemez/silinemez
- [ ] API rate limiting calisiyor (cok fazla istek engeli)
- [ ] Islem photo'lari sadece ilgili isletme tarafindan goruntuleniyor

---

## 29. HATA DURUMLARI

- [ ] Internet baglantisi kesildiginde uyari mesaji
- [ ] Sunucu hatalarinda kullaniciya mesaj
- [ ] Form validasyon hatalari gorunuyor
- [ ] Yetersiz bakiye uyarisi (negatif bakiye durumu)
- [ ] Cakisan islem engeli (ayni anda iki kayit)
- [ ] Fotograf yukleme hatasi durumunda mesaj

---

## 30. SPESIFIK SENARYO TESTLERI

### 30.1 Karmasik Islem Senaryosu
- [ ] Gelir ekle > Dashboard guncellendi > Rapor dogru > Hesap bakiye dogru
- [ ] Cari alis + odeme > Cari bakiye dogru > Hesap bakiye dogru
- [ ] Personel maas + odeme > Personel bakiye dogru
- [ ] Transfer (ayni doviz) > Her iki hesap bakiyesi dogru
- [ ] Transfer (farkli doviz) > Kur ile dogru hesaplama
- [ ] Urun alis + satis > Stok dogru > Cari bakiye dogru

### 30.2 Silme ve Geri Alma
- [ ] Islem sil > Bakiye geri dondu > Undo > Bakiye tekrar guncellendi
- [ ] Cari sil > Iliskili islemler ne oldu?
- [ ] Hesap sil > Iliskili islemler engeli

### 30.3 Multi-User Senaryosu
- [ ] Owner islem ekler > Member gorur
- [ ] Member (yetkili) islem ekler > Audit log'da gorunur
- [ ] Member (yetkisiz) islem eklemeye calisir > Engellenir
- [ ] Admin kullanici cikarir > Cikarilan kullanici erisemez
- [ ] Isletme degistir > Veriler degisir > Eski isletme verileri gizlenir

### 30.4 Doviz Senaryosu
- [ ] TRY hesaptan USD hesaba transfer (kur girisi gerekir)
- [ ] USD cariye USD islem ekleme
- [ ] Dashboard'da mixed currency toplamlari
- [ ] Excel export'ta doviz bilgileri dogru

---

## NOTLAR
- Test sirasinda bulunan her sorun icin ilgili maddenin yanina `SORUN:` notu ekleyin
- Kritik sorunlari en ust siraya alin ve oncelikle cozun
- OCR (Foto Import) ve Nakit Avans UI'dan kaldirilmisti - backend'de hala mevcut
- Test siralamasi: Once temel islemler (auth, hesap, islem) sonra detaylar (raporlar, export, multi-user)

---

## 31. DUZELTILMIS BUGLAR - TEKRAR KONTROL LISTESI

> Asagidaki maddeler ilk test turundan sonra bulunan ve duzeltilen buglardir.
> Her birini tekrar test ederek duzeltmenin dogru calistigindan emin olun.

### 31.1 Auth Duzeltmeleri

- [ ] **Sifre Degistirme** - Ayarlar > Isletme Bilgileri > Sifre Degistir
  - [ ] Spinner sonsuz donmuyar, islem tamamlaniyor
  - [ ] Ayni sifreyi girince anlamli hata mesaji cikiyor
  - [ ] X butonu ile modal kapatilabiliyor
  - [ ] Yeni sifre basariyla degisince bildirim geliyor

- [ ] **Sifre Sifirlama (Deep Link)** - Sifremi Unuttum akisi
  - [ ] Sifremi unuttum > email gonder > emaildeki linke tikla
  - [ ] Uygulama aciliyor ve yeni sifre formu gorunuyor (direkt ana sayfaya gitmemeli)
  - [ ] Yeni sifre girip kaydedince basariyla degisiyor
  - [ ] Formu kapatinca normal sekilde devam edebiliyorum

### 31.2 Hesaplar Duzeltmeleri

- [ ] **Arsivlenmis Hesapta Islem Engeli**
  - [ ] Bir hesabi arsivle
  - [ ] Arsiv sayfasindan o hesabi ac
  - [ ] Islem ekleme butonlari devre disi (tiklanamaz) olmali
  - [ ] Arsivden cikar tikla > Otomatik arsiv listesine geri donmeli

### 31.3 Cariler Duzeltmeleri

- [ ] **Cari Silme - Bagli Kayit Kontrolu**
  - [ ] Islemi olan bir cariyi silmeye calis > "Bagli islemleri silmeniz gerekiyor" hatasi almali
  - [ ] Ceki olan bir cariyi silmeye calis > "Bagli cekleri silmeniz gerekiyor" hatasi almali
  - [ ] Hicbir islemi/ceki olmayan bir cariyi sil > Normal silinmeli

- [ ] **CekKesSheet Para Birimi Filtreleme**
  - [ ] USD para birimli cariye cek kes > Sadece USD banka hesaplari gorunmeli
  - [ ] Para birimi sembolü $ gosterilmeli (₺ degil)
  - [ ] TRY cariye cek kes > TRY hesaplar ve ₺ sembolü gorunmeli
  - [ ] Cari degistirince hesap listesi otomatik filtrelenmeli

### 31.4 Personel Duzeltmeleri

- [ ] **Personel Silme - Bagli Kayit Kontrolu**
  - [ ] Islemi olan bir personeli silmeye calis > Hata almali
  - [ ] Islemi olmayan personeli sil > Normal silinmeli

- [ ] **Negatif Izin Bakiyesi**
  - [ ] Bir personele hak ettigi izinden fazla izin kullanimi gir
  - [ ] Kalan gun negatif gorunmeli (orn: -3 gun)
  - [ ] Progress bar kirmizi olmali

- [ ] **Personel Satisi - Acilis Bakiyesi**
  - [ ] Bir personele satis islemi yap
  - [ ] Personelin acilis bakiyesi (duzenle sayfasindan kontrol et) degismemis olmali
  - [ ] Sadece islem listesinde yeni kayit gorunmeli

### 31.5 Urunler Duzeltmeleri

- [ ] **Aylik Ozet - Duzeltme Cipi (Sari)**
  - [ ] Bir urune stok duzeltme hareketi ekle
  - [ ] Urun detay > Aylik Ozet bolumu
  - [ ] Yesil (+alis), kirmizi (-satis) ve sari (duzeltme) ayri cipler gorunmeli
  - [ ] Duzeltme yoksa sari cip gorunmemeli

- [ ] **Toplu Stok Giris/Cikis - Toplam Font Boyutu**
  - [ ] Toplu stok giris sayfasina git
  - [ ] "Toplam" etiketi okunabilir buyuklukte olmali (eskisinden buyuk)
  - [ ] Toplu stok cikis sayfasinda da ayni sekilde

### 31.6 Islem Ekleme (QuickTransactionBar) Duzeltmeleri

- [ ] **DateTimePicker 1970 Bugu**
  - [ ] Herhangi bir islem eklerken tarih seciciye tikla
  - [ ] Bugunun tarihi gelmeli, 01.01.1970 degil
  - [ ] Personel izin eklerken tarih seciciye tikla > 1970 degil bugunku tarih gelmeli

- [ ] **Islem Sonrasi Toast Mesaji**
  - [ ] Gelir islemi kaydet > "Isleminiz basariyla kaydedildi" toast mesaji gorunmeli
  - [ ] Gider islemi kaydet > Ayni toast mesaji
  - [ ] Islem duzenle ve kaydet > "Islem guncellendi" toast mesaji

- [ ] **Kategori Secici Otomatik Acilma**
  - [ ] Cari alis islemi baslat
  - [ ] Bir urun sec (UrunPickerModal'dan)
  - [ ] Kategori secici otomatik acilMAMALI
  - [ ] Sadece kategori alanina tiklaninca acilmali

- [ ] **Hesap On Secimi Kaldirildi + A-Z Siralama**
  - [ ] Cari odeme islemi baslat > Hesap alani bos olmali (otomatik secili olmamali)
  - [ ] Cari tahsilat islemi baslat > Hesap alani bos olmali
  - [ ] Personel odeme sayfasi > Hesap alani bos olmali
  - [ ] Hesap seciciye tikla > Hesaplar A-Z sirali gorunmeli

### 31.7 Dashboard Duzeltmeleri

- [ ] **FinancialDetailModal Animasyon**
  - [ ] Dashboard'da finansal ozet kartina tikla
  - [ ] Modal acilirken animasyon akici olmali (takilma/kasma azalmis olmali)
  - [ ] Icerik yuklenene kadar kisa bir loading gosterilmeli
  - [ ] Donem degistirme (aylik/haftalik vs.) duzgun calismali

### 31.8 Dashboard vs Raporlar Tutarsizligi (INCELEME GEREKTIRIYOR)

- [ ] **Dashboard ve Raporlar farkli toplam gosteriyor**
  - NOT: Bu bir kod bugu degil, farkli veri kaynaklari kullaniliyor
  - Dashboard: `get_income_expense_summary` RPC (tum islem tiplerini grupluyor)
  - Raporlar: `get_category_report` RPC (iade islemlerini ayri hesapliyor + urun dagitim mantigi farkli)
  - [ ] Dashboard gelir toplami not et: ___________
  - [ ] Raporlar > Gelir-Gider > ayni donem gelir toplami not et: ___________
  - [ ] Fark varsa: iade islemleri (cari_alis_iade / cari_satis_iade) olup olmadigini kontrol et
  - [ ] Pasif/arsivlenmis hesap uzerinde islem olup olmadigini kontrol et
