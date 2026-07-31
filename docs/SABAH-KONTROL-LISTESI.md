# Sabah kontrol listesi — 95 bulgunun tamamı uygulandı

Gece boyunca `docs/FRONTEND-GLASS-TUTARLILIK-DENETIMI.md` raporundaki **95 onaylı
bulgunun hepsi** düzeltildi. Aşağıdaki liste, telefonda uygulamayı gezerken sırayla
bakabileceğin şekilde **ekran ekran** dizildi.

## Ne doğrulandı, ne doğrulanmadı

| Kontrol | Sonuç |
|---|---|
| `tsc --noEmit` | 0 hata |
| `eslint .` | 0 hata (115 uyarı — hepsinin eskiden beri var olduğu diff'e karşı kanıtlandı, yeni tek uyarı yok) |
| `jest` | 312/312 geçti |
| Metro bundle (iOS) | 4045 modül, temiz derlendi |
| **Cihazda görsel doğrulama** | **YAPILMADI — bu listenin sebebi o** |

Yani: program derleniyor, testler geçiyor, ama piksellerin doğru yere oturduğunu
yalnız sen görebilirsin.

## Nasıl okunacak

- 🔴 = kullanıcı doğrudan görürdü / içeriğe erişemiyordu (9 tane)
- 🟡 = görünür sürtünme
- ⚪ = tutarlılık / hijyen, gözle zor fark edilir

Bir şey ters görünürse bana "X ekranı bozuk" demen yeter — hangi commit'in hangi
satırı olduğunu bulabiliyorum.

---

# 1. Ana Sayfa

🟡 **Sona kadar kaydır.** Son hesap satırının sağındaki ⋮ butonu ve satıra basınca
açılan "İşlem Yap / İşlemleri Gör" butonları artık FAB'ın altında kalmıyor.
Eskiden daha fazla kaydırma imkânı olmadığı için o satıra erişilemiyordu.

⚪ Header'daki bildirim çanı artık yanındaki cam butonlarla aynı dilde (cam yüzey +
tint). Rozet ve kırmızı nokta dairenin 45° noktasına oturuyor, dışına taşmıyor.

---

# 2. Cariler

⚪ Listeyi sona kaydır — alt boşluk artık tek kaynaktan geliyor (eskiden iki yerde
iki farklı değer vardı, biri ölüydü). Görünüm değişmemeli; değiştiyse söyle.

⚪ Header'daki üç cam buton (paylaşım kodu / Excel / sırala) artık ekran okuyucuya
isimlerini veriyor. Görsel değişiklik yok.

### 2a. Cari detay

🟡 **Başlangıç bakiyesi satırı** artık hesap ve personel detayındakiyle aynı bileşen.
Üç sayfada aynı görünmeli: aynı yükseklik, aynı aksan bar, aynı tutar biçimi.
Eskiden cari'de 44px ikon kutusu + işaretli tutar, diğerlerinde aksan bar vardı.

🟡 **Ürün satırına bas** → açılan ürün detay penceresi artık hesap detayındakiyle
aynı bileşen (kopya kaldırıldı). İçerik ve davranış aynı olmalı.

⚪ Üstteki özet kartı paylaşılan bileşene geçti. **Bağlantılı bir cari aç** — yeşil
"bağlantılı" vurgusu artık gerçekten görünüyor (eskiden ölü koddu).

### 2b. Mutabakat (cari detay menüsünden)

🔴 **En önemli maddelerden biri.** Bir ekstre yükle, raporu sona kaydır. "Eşleşen
kalemler" / "Kilitli kalemler" gruplarının son satırları artık cam tab bar'ın altında
kalmıyor. Eskiden son ~74px erişilemezdi.

🟡 Dosya seçme adımında da aynı düzeltme var — tek CTA orada.

⚪ Ekran artık `Screen` primitifini kullanıyor (alandaki tek ham `View` idi).

⚪ **Tab bar vurgusu:** Mutabakat açıkken alttaki vurgu artık "Cariler"de kalıyor,
"Ana Sayfa"ya atlamıyor.

### 2c. Vade Takibi (Cariler mini-dashboard'undan)

🔴 **Sayfanın başlığı ve geri butonu artık var.** Eskiden hiç header çizilmiyordu:
başlıksız açılıyor, yalnız kenardan swipe ile çıkılıyordu ve Satış/Alış sekme şeridi
status bar'ın altına giriyordu.

⚪ Tab bar vurgusu burada da "Cariler"de kalıyor.

---

# 3. Personel

⚪ Header cam butonlarına erişilebilirlik etiketi eklendi (görsel değişiklik yok).

### 3a. Personel detay

🟡 **Yetkisi olmayan bir üyeyle gir** (personel modülünde güncelleme yetkisi yok).
Başlangıç bakiyesi satırındaki kalem ikonu artık görünmüyor ve düzenleme penceresi
açılamıyor. Eskiden yetki kontrolü yoktu.

⚪ Liste alt boşluğu çift verilmişti, ilki ölüydü — teke indirildi. Görünüm aynı kalmalı.

### 3b. İzin geçmişi

🟡 **Çift başlık gitti.** Eskiden native header + sayfa içi başlık birlikte, iki geri
butonuyla görünüyordu. Şimdi tek başlık ve o başlık **hangi personel** olduğunu yazıyor.

🟡 **Sağ alttaki FAB artık cam.** Eskiden 8px arayla bir cam (not) bir opak (izin)
buton yan yana duruyordu.

### 3c. Personel ekle

🟡 Çift başlık gitti (native header + sayfa içi "Personel Ekle").

🟡 **Para birimi seçimi** artık cari ve hesap ekle formlarındaki `CurrencyPicker` ile
aynı. Eskiden elle yazılmış yatay kart şeridiydi.

🟡 **Tarih seçiciyi aç** → "Tamam" butonu artık home indicator bandının üstünde,
altına girmiyor.

### 3d. Toplu gider · Toplu ödeme

🔴 **Bir tutar alanına dokun, klavye açılsın.** Alttaki özet + Kaydet butonu artık
klavyenin üstünde duruyor. Eskiden ~90px klavyenin arkasında kalıyordu, klavyeyi
kapatmadan kaydedemiyordun.

🟡 Toplu ödemede **hesap seçici** alt sayfasını aç — altındaki ~72px hayalet boşluk
gitti.

⚪ Footer zemini artık diğer form footer'larıyla aynı.

---

# 4. Ürünler

🟡 **Sekmeye geç ve yüklenme anını yakala.** Artık başlık, Excel/sırala cam butonları
ve arama çubuğu ekranda kalıyor; yalnız liste alanı iskelete dönüyor. Eskiden tüm
ekran "Yükleniyor…" metnine dönüp veri gelince chrome bir anda geri geliyordu.

⚪ Dönem oklarının dokunma alanı büyütüldü (buton 34px, hedef 44px).

⚪ Liste alt boşluğu tek kaynağa bağlandı.

### 4a. Ürün detay

🟡 **Sağ üstteki butonlara bas** — dokunma alanları büyütüldü (eskiden 22–24px'lik
çıplak ikonlardı, ıskalanıyordu).

🟡 **⋮ menüsüne bas** → artık alttan sheet değil, diğer üç detay sayfasındaki gibi
sağ-üst dropdown.

⚪ **Miktar/Tutar geçişi** artık liste sayfasındakiyle birebir aynı: aynı punto, aynı
kalınlık, büyük harf. Eskiden 14pt/600 vs 12pt/700 idi (yorumu "aynı görünüm" diyordu).

⚪ Aylık özet pill'lerindeki renkler palete bağlandı (iki farklı açık-kırmızı yan yana
gelmiyor artık).

### 4b. Toplu giriş · Toplu çıkış

🟡 **Ürün seçici modalini aç** → arama alanı artık `ModalSearchBar` (üste sabit, cam,
temizleme X'li). Eskiden elle yazılmış köşeli bir kutuydu.

🟡 Aynı modalde son satır artık home indicator'ın altında kalmıyor.

---

# 5. İşlemler

🟡 **Bir işlem sil, geri-al penceresi açıkken bak.** UndoSnackbar artık arama
çubuğunu örtmüyor — arama yukarı kayıyor. Eskiden snackbar pill'in 56px'inin ~44'ünü
kapatıyordu, "arama kayboldu" gibi görünüyordu.

🟡 Gelir ekle ve işlem düzenle ekranlarında çift başlık gitti. (İşlem düzenlemede
eskiden sayfa "Gelir Düzenle", header "İşlem Düzenle" yazıyordu — iki farklı metin
üst üste.)

---

# 6. Notlar

🔴 **En görünür düzeltme.** Üstteki yatay filtre chip'lerinin hemen altındaki ~106px'lik
boş şerit gitti. Alt boşluk yanlışlıkla yatay listeye verilmişti; yatay listede
`paddingBottom` içerik yüksekliğini büyütüyor.

🟡 Listeyi sona kaydır — son not artık yüzen arama çubuğunun altında kalmıyor.

---

# 7. Arşiv

⚪ Listenin dibindeki çift sayılan boşluk (~190px) düzeltildi. Sona kaydırdığında
gereksiz boşluk olmamalı.

---

# 8. Taksit Takip

🔴 **En yüksek öncelikli bulgu buydu.** Sağ alttaki FAB artık görünüyor ve basılıyor.
Eskiden `insets.bottom` verilmediği için tamamen cam tab bar'ın arkasındaydı —
sayfanın **tek yazma girişi** erişilemez durumdaydı. FAB menüsü de aynı şekilde.

🟡 **Tamamen ödenmiş bir plan aç** → footer kaybolduğunda listenin son satırı artık
tab bar'ın altında kalmıyor.

⚪ Header'daki paylaş butonu diğer detay ekranlarıyla aynı boyut/renk/hitSlop'ta.

---

# 9. Raporlar

⚪ 11 rapor ekranından ölü stiller temizlendi (görsel değişiklik olmamalı).

🟡 **Genel rapor** ve **Nakit Akışı**'ndaki paylaş butonu artık ortak
`ReportExportButton` — erişilebilirlik etiketi de geldi.

⚪ Gelir-Gider ile Alış-Satış'ta katlanır grup başlıkları artık aynı görünüyor (biri
zeminli kart, öteki çıplak satırdı).

### 9a. Kategori detayı (donut lejandından)

🔴 **Raporlar ana sayfasındaki donut grafiğin lejandından bir GİDER kategorisine bas.**
Açılan sayfa artık gider işlemlerini gösteriyor. Eskiden `type` parametresi
geçirilmediği için sayfa gelir tiplerine düşüyordu → toplam 0,00 / 0 işlem / boş liste,
ama başlık kırmızı kaldığı için "gider raporu boş" gibi görünüyordu.

🟡 Paylaş butonunun dokunma alanı büyütüldü.

⚪ Üç listenin hepsinde aşağı-çekip-yenile var artık (eskiden yalnız birinde vardı).

### 9b. Hesap raporu

⚪ Aşağı çekince yenileme çemberi artık Android'de renkli (gri kalıyordu). Aynı düzeltme
Net Varlık Trend'de de var.

### 9c. Nakit Akışı

🟡 **Dönem etiketine bas** → takvim seçici açılıyor. Eskiden düz yazıydı, 8 ay geri
gitmek için oka 8 kez basmak gerekiyordu; artık komşu raporlardaki `PeriodNavigator`.

🟡 **Aşağı çek** → yenileme çalışıyor (eskiden hiçbir şey olmuyordu).

🟡 **Özel tarih aralığı seç, başlangıcı bitişten sonraya al** → artık çökmüyor.
iOS'ta native tarih seçicide min>max belgelenmiş bir çökme yoluydu.

🟡 Sorgu hata verirse artık "Bu dönemde giriş yok" yerine hata mesajı + tekrar dene
butonu görünüyor. (Eskiden verinin sıfır olduğunu sanıyordun.)

⚪ Dönem oklarının dokunma alanı büyütüldü.

---

# 10. Daha sekmesi ve Ayarlar

🟡 **Dil** ve **Para Birimi** modallarını aç, kartın başlığına veya seçenekler
arasındaki boşluğa bas. Modal artık kapanmıyor. Eskiden seçim yapılmadan kapanıyordu.

### 10a. İşletme ayarları

🟡 **Şifre değiştir** → artık şifre gücü göstergesi var ve zayıf şifre kabul edilmiyor.
Bu bir güvenlik boşluğuydu: sıfırlama akışında koyamadığın zayıf şifreyi Ayarlar'dan
koyabiliyordun.

🟡 Şifre ve sektör alt sayfaları artık home indicator'ı temizliyor.

⚪ Sektör listesi tek kaynağa taşındı (`src/constants/sectors.ts`) — kurulum ekranıyla
birebir kopyaydı. **Kurulumdaki sektör listesiyle Ayarlar'dakinin aynı olduğunu
doğrula.**

### 10b. Davet oluştur

🔴 Alt boşluk hiç yoktu — tek aksiyon olan "Kod Oluştur" butonu tab bar'ın altında
kalıyordu. Artık erişilebilir.

🟡 Kardeş üç ekranın aksine kendi başlığını çiziyordu; native başlığa geçti. Alt başlık
metni korundu.

### 10c. İşlem geçmişi

🔴 Aynı hata iki yönlü hasar veriyordu: alt boşluk yatay chip şeridine verilmişti →
chip'lerin altında ~106px delik, dikey liste ise boşluksuz → en eski kayıtlar tab
bar'ın altında. İkisi de düzeltildi.

### 10d. Paylaşılan işletmeler

⚪ Satır aksiyonlarının dokunma alanları büyütüldü (23–32px'ti, ikisi yıkıcı).

### 10e. Hesap sil

🟡 **İşletme adını yazmaya başla, klavye açılsın.** Ekran artık kaydırılabiliyor,
"Hesabı Sil" butonu klavyenin altında kaybolmuyor. Eskiden `KeyboardAvoidingView`
içinde düz `View` vardı, buton ekrandan çıkıyordu.

### 10f. Veri içe aktar

🟡 "Atlananlar" sekmesinin alt boşluğu artık diğer sekmeyle aynı mantıkta.

---

# 11. Kategoriler

⚪ Satırdaki düzenle/sil butonlarının dokunma alanı büyütüldü. Bunlar 4px arayla
duruyor ve biri yıkıcı olduğu için `hitSlop` yerine padding büyütüldü — **yanlışlıkla
sil'e basmadığını doğrula.**

⚪ **Bir kategoriyi sil, sonra o kategorinin düzenleme sayfasına deep-link ile git**
(ya da silinmiş bir id ile). Artık sonsuza dek "Yükleniyor" yazmıyor, "bulunamadı" +
geri butonu gösteriyor.

---

# 12. Formlar (ekle / düzenle)

⚪ Düzenleme ekranlarının ilk alanı artık ekleme ekranlarıyla aynı yükseklikten
başlıyor (32px vs 12px farkı vardı).

⚪ Yükleniyor durumu tek dile getirildi (üç farklı varyant vardı: düz yazı / spinner+yazı
/ yalnız spinner).

⚪ Tarih seçici alt sayfası (15+ formda kullanılan ortak bileşen) artık home
indicator'ı temizliyor. **Herhangi bir formda tarih seç ve "Tamam" butonunun jest
şeridine girmediğini doğrula.**

---

# 13. Kurulum akışı

🟡 **Kurulum 2/3 (tabela adı)** — klavye açıkken "Devam" butonu artık klavyenin
üstünde. Bu ekranda `KeyboardAvoidingView` hiç yoktu.

🟡 **Kurulumda cari veya hesap ekle, kaydet.** Artık rehberli oluşturma listesine
dönüyor. Eskiden detay sayfasına gidiyor, kurulum kapısı devreye girip seni sektör
seçme ekranına geri atıyordu.

⚪ **Kurulum 3/3** artık kaydırılabiliyor — küçük ekranda "Şimdi değil" çıkışı
kırpılmıyor.

⚪ Onboarding "Atla" butonunun dokunma alanı büyütüldü (~31px'ti).

⚪ E-posta doğrulama ekranı `Screen` primitifine geçti (ikizi zaten kullanıyordu).

---

# 14. Fotoğraf görüntüleyici

🔴 **Bir işleme fotoğraf ekle, aç, kapatmak için aşağı sürükle.** Kapat/paylaş
yuvarlaklarının ve Değiştir/Sil butonlarının **cam yüzeyi artık kaybolmuyor.**

Sebep: bu iki grubun atasına `opacity` animasyonu uygulanıyordu. Cam gerçek bir
`UIVisualEffectView`; kendisinde ya da herhangi bir atasında alpha < 1 olunca sistem
onu offscreen render pass'e alıyor, cam arkasını örnekleyemiyor ve malzeme çöküyor —
ikonlar havada asılı kalıyordu. Geçiş `transform`'a çevrildi.

Bu modal cari, hesap, personel ve not fotoğraflarında da kullanılıyor — dördünde de
kontrol et.

---

# 15. Foto-import (giriş noktası yok, latent)

⚪ Uyarı banner'larındaki sarı-üstüne-sarı okunmaz metin palete bağlandı. Üç picker
`ModalSearchBar`'a geçti. Fatura listesinin alt aksiyon çubuğu tab bar'ı temizliyor.
Bu ekrana bugün UI'dan giriş yok, o yüzden yalnız kod düzeyinde düzeltildi.

---

# Geride bilinçli olarak bırakılanlar

Bunlar denetimde tartışıldı ve **kasıtlı olarak yapılmadı** — bozuk değiller:

- ActionSheet / BottomSheet gövdelerinin cama çevrilmesi
- Kartların ve liste satırlarının cama çevrilmesi
- QTB (hızlı işlem çubuğu) cam dönüşümü
- TabFilter seçili göstergesi
- Form footer'ları + "içerik yapışkan başlığın altından aksın" pilotu (TabHeader cam
  nav bar işi bunun ilk adımıydı, paralel oturumda yapıldı)
- `Screen.footer` prop'u: sözleşme metni onu 2. yol olarak gösteriyor ama primitif o
  yolda klavye açıkken hatalı davranıyor. Bugün hiçbir ekran kullanmıyor. Karar
  gerekiyor: ya `useFooterBottomPadding()` ile beslenecek ya prop kaldırılacak.

# Commit haritası

| Commit | İçerik |
|---|---|
| `fix(denetim c01)` … `c10` | 10 küme, 84 bulgu — her küme bağımsız bir ajan tarafından `git diff` okunarak doğrulandı, regresyon bulunanlar aynı turda onarıldı |
| `fix(denetim): vade header kaydı + personel detay çift alt boşluk` | Küme turunda dosya kilidi yüzünden atlanan 2 iş |
| `fix(denetim c11)` | TabHeader cam pilotu yüzünden ertelenen 9 bulgu, yeni koda karşı yeniden doğrulanarak |

Bulgu ham verisi `docs/denetim/` altında: `bulgular.json` (95 bulgu, kanıt + önerilen
düzeltme), `c01..c11.json` (küme dağılımı), `uygulama-sonuclari.json` (hangi bulgu
FIXED/SKIPPED ve neden).
