# 30.07.2026 Yetkilendirme v4 — uygulama ve kabul eki

> Bu ek, aşağıdaki tarihsel yetki notlarıyla çeliştiğinde yetkilidir. Kesin ürün
> sözleşmesi `docs/security/YETKI-SOZLESMESI.md` v4 bölümündedir.

## Hedeflenen sonuç

Özel rolde açık modül artık “bu sayfayı ve içindeki bütün kayıtları okuyabilir”
anlamına gelir. `view/add/edit_own/edit_all` ayrımı okuma kapsamını değil, oluşturma
ve değişiklik kapsamını belirler. Kapalı modülün tam satırını açmak yerine gereken
bağlı adlar ve seçici kayıtları dar, bakiyesiz projeksiyonlardan gelir.

Bu turdaki sunucu paketi mevcut kullanıcı/işlem satırlarını değiştirmez. Tablo veya
kolon silmez, yeniden adlandırmaz, tip değiştirmez, backfill/toplu `UPDATE` yapmaz.
Yeni private/internal tablolar ve yardımcılar ekler; mevcut public fonksiyon
gövdeleri ile policy/trigger'ları v4 sözleşmesine göre günceller. Public RPC
imzaları ve sonuç tipleri korunur. Böylece 60–70 günlük aktif kullanıcının mevcut
verisi yerinde kalır.

## Canlı kapanış kaydı — 30 Temmuz 2026

Yetkilendirme v4 sunucu kapanışı üretime
`20260730080658_permission_contract_v2_server` adıyla uygulandı. Uygulanan yerel
payload, [`20260730153000_permission_contract_v2_server.sql`](../../supabase/migrations/20260730153000_permission_contract_v2_server.sql)
dosyasının aşağıdaki exact sürümüdür:

- SHA-256: `bc151c9946f8f37375b01f25b25ac04728abff0e0bf5be2f3601fe8083f493ac`
- Boyut: `539.440 byte`
- Satır: `18.003`

Canlıya almadan önce aynı exact SQL tek transaction içinde uygulanıp tamamen geri
alındı. Bu prova iki derleme uyumsuzluğunu ve bir policy deparse doğrulama farkını
canlı veriye dokunmadan yakaladı; düzeltmelerden sonra final payload yeniden
`BEGIN/ROLLBACK` provasını geçti. İki bağımsız kod incelemesi exact hash için
`P0=0 / P1=0` ve **uygulanabilir** sonucu verdi.

Canlı uygulama sonrasında:

- migration kaydı, internal context tabloları, 8 koruma trigger'ı, policy
  ifadeleri, public RPC imzaları/sonuç tipleri, `SECURITY DEFINER`, sabit
  `search_path` ve ACL'ler katalogdan doğrulandı;
- yeni internal context tabloları boştu; migration kullanıcı verisine backfill,
  toplu `UPDATE`, `DELETE` veya `TRUNCATE` çalıştırmadı;
- `notlar 54`, `cariler 4.769`, `urunler 994`, `hesaplar 1.439`,
  `islemler 68.637`, `personel 803`, `isletmeler 910`, `kategoriler 12.334`,
  `isletme_users 27`, `urun_hareketler 2.830` ve
  `ileri_tarihli_islemler 59` olarak okundu; uygulama öncesine göre hiçbir
  tabloda satır sayısı azalmadı;
- Supabase Security/Performance Advisor yeniden çalıştırıldı. Yeni atomik RPC'ler,
  istemcinin çağırması gereken kasıtlı `authenticated` girişler olduğu için genel
  `SECURITY DEFINER executable` uyarısına giriyor; fonksiyon içi tenant/rol/
  sahiplik kontrolleri ve dar ACL'ler ayrıca doğrulandı. Advisor yeni bir P0/P1
  yayın engeli göstermedi. Kullanılmayan yeni deneme-sınırı indeksi, henüz trafik
  almamış olmasının doğal sonucudur.

### Ana oturum doğrulaması

| Kontrol | Sonuç |
|---|---|
| TypeScript | Geçti |
| ESLint | `0 hata / 102 uyarı` — uyarılar mevcut teknik borç |
| Jest | `131 suite / 1.773 test` geçti |
| iOS Metro bundle | `4.103 modül`, temiz |
| Final migration sözleşmesi | Exact hash ile geçti |
| Üretim rollback provası | Geçti; sentetik değişikliklerin tamamı geri alındı |
| Üretim post-deploy katalog/veri kontrolü | Geçti |

Bu sonuç otomatik ve sunucu kontrollerinin tamamlandığını gösterir. Görsel davranış,
gerçek klavye/safe-area ve rol geçişleri için aşağıdaki telefon kabul turu yine
kullanıcı cihazında yapılmalıdır.

### Eski davranış / yeni davranış

| Alan | Eskiden | v4 sonrası |
|---|---|---|
| Açık modül okuması | Bazı ekranlarda yalnız kendi satırları veya geçmiş satırlar görünüyordu | Açık modülün bütün aktif kayıtları ve detayları okunur |
| `edit_own` | Başkasının satırı bazen hiç açılamıyor veya eksik sekme gösteriyordu | Satır ve ürün kalemleri okunur; yalnız değişiklik/silme engellenir |
| `edit_all` | Eski/`created_by=NULL` kayıtlar veya ürünlü satırlar düzenlenemeyebiliyordu | İlgili modüller açıksa oluşturan kişiden bağımsız değiştirilebilir |
| Cari-only ödeme/tahsilat | Hesap seçici boş kalabiliyor veya QTB eksik sekme gösteriyordu | Aktif hesap adları seçilir, hesap bakiyesi saklanır |
| Personel-only ödeme/tahsilat | Hesaplar kapalıyken işlem yapılamıyordu | Hesap adı seçilerek işlem yapılır, bakiye saklanır |
| Cari açık / Ürün kapalı | Mevcut ürünlü işlemin kalemleri açılamıyordu | Kalemler salt okunur açılır; ürünlü işlem yazılamaz |
| Ürün-only | Bağlı cari yüzünden hareket akışı karışabiliyordu | Doğrudan stok giriş/çıkış/düzeltme yapılır; Cari bakiyesi değişmez |
| Kategori | Seçici eksik, yönetim özel role sızabiliyordu | İşlem yapan seçer; yönetimi yalnız owner + gerçek manager yapar |
| Raporlar | Dashboard bazen Raporlar kapalıyken görünüyordu; report-only veri eksikti | Dashboard yalnız Raporlar; report-only bütün rapor verisini dar RPC ile görür |
| Bağlamsal rapor | Genel Raporlar kapalıysa modül raporuna da gidilemiyordu | Açık Hesap/Cari/Personel/Ürün kendi raporunu açar |
| Ana Sayfa | İlgisiz rolde boş beyaz ekran açılabiliyordu | Hesap/Birikim/Rapor yoksa ilk açık ana modüle yönlenir |
| Notlar | Notlar kapalıyken detay notu salt-okunur veya tamamen kapalı kalabiliyordu | Erişilebilir detayda not/fotoğraf eklenir; kendi notu değişir/silinir |
| Pasif kayıt ve para birimi | Yönetici de bazı yüzeylere erişebiliyordu | Yalnız işletme sahibi |
| İşlem geçmişi | Bazı ortak rollere giriş noktası kalabiliyordu | Yalnız işletme sahibi |
| Yetki hatası | Genel “İşlem gerçekleştirilemedi” mesajı çıkabiliyordu | Yetki/sahiplik nedeni anlaşılır Türkçe mesajla ayrılır |

## Telefon kabul turu — yetki matrisi

Test için aynı işletmede bir owner ve bir ortak kullanıcı kullan. Her rol değişiminden
sonra ortak kullanıcıda işletmeyi yeniden seç veya ekranı yenile; böylece izin cache'i
de yeni rolle sınanır.

> **Test güvenliği:** Kalıcı silme/arşivden çıkarma ve bakiye/stok etkili senaryolarda
> yalnız bu tur için oluşturduğun deneme kayıtlarını kullan; gerçek müşteri,
> personel, hesap, ürün veya işlemleri kalıcı silme. Reddedilmesi beklenen her
> eylemden sonra satırın hâlâ durduğunu ve ilgili bakiye/stok değerinin değişmediğini
> kontrol et.

### 1. Salt-okur Cari

1. Yalnız Cariler açık, seviye `view` olsun.
2. Cari listesinde owner ve başka kullanıcının bütün aktif carileri görünmeli.
3. Bir cari detayında bütün geçmiş satırlar, bakiye ve ürünlü alış/satışın ürün
   listesi açılmalı.
4. Ekle, düzenle, sil, arşivle ve mutabakattan işlem oluştur eylemleri çalışmamalı.
5. Cari ekstresi görüntülenebilmeli/paylaşılabilmeli.
6. Dashboard ve genel Raporlar görünmemeli; Cari başlığındaki bağlamsal rapor
   açılmalı.
7. Daha menüsünde Taksit Takip ve Vade Takip görünmeli.

### 2. Cari-only işlem yapabilen rol

1. Yalnız Cariler açık, seviye `add` olsun.
2. QTB'de alış, satış, iadeler, ödeme ve tahsilat sekmeleri görünmeli.
3. Kategori seçilebilmeli fakat kategori ekleme/düzenleme düğmesi görünmemeli.
4. Ödeme/tahsilatta hesap adları görünmeli, hiçbir hesap bakiyesi görünmemeli.
5. Ürünler kapalıyken yeni ürünlü alış/satış oluşturulamamalı.
6. Seviyeyi `edit_own` yapınca ortak kullanıcının kendi işlemi değişmeli/silinmeli;
   owner işlemi açılmalı fakat değişmemeli.
7. Seviyeyi `edit_all` yapınca owner ve eski işlemler de değişebilmelidir.
8. Hesaplar modülünü de aç. Aynı hesap seçicide bu kez hesap bakiyeleri görünmeli.

### 3. Personel-only

1. Yalnız Personel açık, önce `view`, sonra `add` ile dene.
2. `view` halinde bütün personel, maaş, izin ve hareketler okunmalı; işlem
   oluşturulamamalı.
3. `add` halinde gider, satış, ödeme, tahsilat, izin hakkı ve izin kullanımı
   sekmeleri görünmeli.
4. Hesap seçicide adlar görünmeli, bakiyeler görünmemeli.
5. Personel bağlamsal raporu açılmalı; Dashboard/genel Raporlar kapalı kalmalı.
6. Hesaplar modülünü de aç. Aynı hesap seçicide bu kez hesap bakiyeleri görünmeli.

### 4. Ürün-only ve Cari + Ürün

1. Yalnız Ürünler `view` iken bütün ürünler ve hareketler okunmalı; bağlı Cari adı
   düz metin görünmeli, Cari detayına gitmemeli.
2. Ürünler `add/edit_own` iken doğrudan stok giriş, çıkış ve düzeltme yap; Cari
   bakiyesi değişmemeli.
3. Ürün ekstresini görüntüle/paylaş. Ürün bağlamsal raporu açılmalı; genel Raporlar
   merkezi kapalı kalmalı.
4. Cariler + Ürünler `add` iken ürünlü alış/satış oluştur.
5. `edit_own` ile kendi ürünlü işlemini, `edit_all` ile owner işlemini düzenle;
   ürün stok miktarı ve Cari bakiyesi yalnız bir kez doğru değişmeli.

### 5. Hesaplar ve çapraz adlar

1. Yalnız Hesaplar açıkken hesap listesi, bakiye ve bütün hesap hareketleri
   görünmeli.
2. Cari/Personel kapalı olsa da ödeme/tahsilat satırında karşı taraf adı düz metin
   görünmeli; kapalı modül detayına gidilmemeli.
3. Hesap raporu açılmalı, genel Raporlar ve Dashboard kapalı kalmalı.
4. Arşivli hesapta `view` veya kapsam dışı `edit_own` kullanıcısına “Arşivden
   çıkar” düğmesi görünmemeli.

### 6. Rapor-only

1. Yalnız Raporlar açık olsun.
2. Ana Sayfa, Dashboard ve Raporlar merkezi görünmeli.
3. Gelir-gider, nakit akışı, kategori, trend, hesap, cari, personel ve ürün
   raporları owner ile aynı işletme toplamlarını göstermeli.
4. Rapor satırlarından herhangi bir kayıt düzenlenememeli; rapor veri uçları kapalı
   modülün telefon/adres gibi geniş alanlarını indirmemeli.

### 7. Notlar

1. Notlar kapalı, yalnız Cariler `view` iken bir cari detayında not ve fotoğraf ekle.
2. Kendi notunu düzenle/sil; başka kullanıcının notunu oku fakat değiştirme.
3. Rolü `edit_all` yapınca başka kullanıcının bağlamsal notunu düzenle/sil.
4. Aynısını Hesap, Personel ve Ürün detaylarında dene.
5. Notlar merkezi kapalı kalmalı.
6. Notlar modülünü açıp serbest not oluştur; notu aynı işletmedeki başka aktif
   üyeye ata. Atanan not yalnız hedef kullanıcının görünür kitlesinde kalmalı.

### 8. Owner/manager özel sınırları

1. Gerçek manager kategori ekleyip düzenleyebilmeli; özel `edit_all` rol
   yapamamalı.
2. Manager ve özel rol pasif Hesap/Cari/Personel/Ürünleri görememeli.
3. Para birimi ve İşlem Geçmişi yalnız owner hesabında görünmeli.

### 9. Arşiv, global arama ve toplu işlemler

1. Cari-only rol Arşiv'de yalnız carileri; Cari + Personel rol yalnız bu iki türü
   görmeli.
2. Global arama ve Tüm İşlemler yalnız açık kaynak modüllerin satırlarını göstermeli.
3. `view` rolünde toplu seçim/arsiv/sil eylemi görünmemeli.
4. `edit_own` rolünde yalnız kendi kayıtları seçilebilmeli; onay sırasında yetki
   tekrar kontrol edilmeli.
5. `edit_all` rolünde kapsam dahilindeki bütün satırlar seçilebilmeli.

### 10. Ana navigasyon

1. Yalnız Cariler açıkken Ana Sayfa sekmesi görünmemeli; uygulama açılışta doğrudan
   Cariler'e gelmeli.
2. Yalnız Birikim açıkken Ana Sayfa görünmeli ve Birikim içeriği açılmalı.
3. Hesaplar, Birikim veya Raporlar'dan herhangi biri açılınca Ana Sayfa geri gelmeli.
4. Hiçbir açık modül kombinasyonunda boş beyaz Ana Sayfa oluşmamalı.

## Telefon kabul turu — yetki dışı düzeltmeler

| Konu | Eskiden | Şimdi nasıl test edilir |
|---|---|---|
| Ağ banner'ı | İnternet varken Supabase health gecikmesi “İnternet bağlantısı yok” diyebiliyordu | LTE/Wi‑Fi'da banner olmamalı. Liste ortasındayken uçak modunu aç/kapat; banner overlay gelmeli, satırlar zıplamamalı. Offline doldurulan form kapanmamalı; bağlantı dönünce tek kayıt oluşmalı |
| Ana Ekle paneli | Gereksiz yükseklik ve hayalet tab-bar payı paneli yukarı taşıyordu | Ana Ekle'yi normal ve büyük yazıyla aç. Üst kenar status bar'a dayanmamalı; İptal sabit, yalnız seçenekler kaydırılabilir olmalı |
| Form–klavye aralığı | Kaydet/İptal ile klavye arasında 72–118 px ölü alan kalabiliyordu | Hesap/Cari/Personel/Ürün/Kategori ekle-düzenle ile İşlem Düzenle'de son alanı aç. Buton–klavye arası yaklaşık 12–16 px olmalı; footer sabit kalmalı |
| Detay sayfası üst taşması | Nested header ve safe-area iki kez/hiç uygulanabildiği için kart status bar/Dynamic Island altına giriyordu | Hesap/Cari/Personel/Ürün detayları, Taksit, Vade, bütün raporlar ve ekle/düzenle sayfalarını dolaş. İlk başlık/kart sistem alanının altında başlamalı |
| Arama dokunma alanı | Yalnız metnin küçük kısmına dokununca klavye açılıyordu | Ana listeler ve bütün picker/modallarda arama çubuğunun ikon, metin yanı ve boş sağ kısmına ayrı ayrı dokun; her nokta input'u odaklamalı |
| Liste kararlılığı | Hızlı kaydırma sonrası yeniden sıralama/refetch satırları kendiliğinden oynatabiliyordu | Cari, Personel ve Ürün listesinde hızlı aşağı kaydır, elini çekip 10 saniye bekle, arka plan→ön plan yap. Dokunmadan görünür satır sırası/konumu değişmemeli |
| Taksit kuruşları | Küsurat yalnız ilk/son satıra yığılıyor ve plan pratik düzeltilemiyordu | `₺64.524,88 / 10` önizlemesini aç. Satırlar tam toplamı vermeli; ilk satırı değiştirince kalan dokuz satır yeniden bölünmeli. Farkı ilk/son taksite al ve eşit dağıt sonuçları toplamı bozmamalı |
| İşlemi yapan adı | E-posta/local-part gibi `dilrubarestaurant` görünebiliyordu | Owner ortak kullanıcıya `Kasiyer Ahmet` görünen adını versin. Eski/yeni işlem satırlarında aynı ad görünmeli; e-posta görünmemeli; iki işletmenin adları karışmamalı |
| Rehberden kişi | Telefon her defasında elle yazılıyordu | Yeni native build'de Cari/Personel ekle-düzenle rehber ikonunu dene. Tek/çok numara, iptal, izin reddi ve mükerrer-numara uyarısında mevcut form verisi kaybolmamalı |

Görsel veya davranışsal bir sapmada ekran adı, rol kombinasyonu ve mümkünse kısa ekran
kaydı not edilmelidir. Kayıt/bakiye/stok değişmişse aynı senaryoyu gerçek veriyle
tekrarlamadan durulmalıdır.

## 1.5.x istemci etkisi

- Mevcut public RPC imzaları kaldırılmaz ve mevcut veri şekli bozulmaz.
- Eski istemci yeni dar hesap/kategori/rapor uçlarını bilmediği için yeni
  kolaylıkları kullanmaz; yetkisiz geniş tablo sorgusu boş sonuç veya yetki hatası
  alır.
- Owner'ın eski oluşturma/düzenleme akışları korunur.
- Açık modülde creator filtresinin kalkması ve Raporlar/Dashboard bağının
  sıkılaşması bilinçli ürün davranışı değişikliğidir.
- Migration mevcut kullanıcı veya işlem verisini silmez/değiştirmez.
- Eski owner istemcisinde normal işlem oluşturma/düzenleme ve manuel, bağlı
  işlemi olmayan ürün silme akışı korunur.
- Eski 1.5.x istemcinin bir işleme bağlı ürünü kalıcı silme denemesi artık
  statement-atomik olarak reddedilir; ürün ve stok hareketi yarım silinmez. Bu
  kayıt güncel istemciden arşivlenmeli veya bağı çözülerek yönetilmelidir.
- Eski istemcinin işlem silme yolu, mevcut owner + aynı işletme stok geri-alma
  davranışını korur. Ancak 1.5.x'in ürün ve işlem silmelerini birden çok HTTP
  isteğine bölen eski mimarisi, istekler arası ağ kopmasına karşı bütünüyle atomik
  hale getirilemez. Güncel istemci kanonik tek-transaction RPC'leri kullanır.

---

# 28.07.2026 Geliştirme Raporu

**Tarih:** 28 Temmuz 2026
**Son uygulama güncellemesi:** 30 Temmuz 2026
**Baz dal / commit:** `feat/liquid-glass` / `f14a49cc5a4f93ecc0ce57c77db7a631184540ed`
**Güncel devam tarihi:** 30 Temmuz 2026

## 30 Temmuz uygulama kaydı — Yetki dışı bug ve tutarlılık turu

Kullanıcı kararıyla yetkilendirme alanı bu turda değiştirilmedi. Ayrıca önceki taramada
“madde 4” olarak kaydedilen nakit akışı özet/detay kredi kartı kapsamı ile tarihsel/aylık
kur saklama çalışması şimdilik ertelendi. Aşağıdaki maddeler güncel koddan yeniden teyit
edilerek uygulandı:

### 1. Doğrudan ürün hareketi artık atomik

**Eskiden:** Manuel ürün giriş/çıkışı oluşturma, düzenleme ve silmede ürün bakiyesi ile
`urun_hareketleri` satırı ayrı istemci yazılarıydı. İkinci istek başarısız olursa
best-effort geri alma deneniyordu; ağ kopması veya eşzamanlı işlemde bakiye ile hareket
satırı ayrışabilirdi.

**Şimdi:** `20260730030523_add_atomic_product_movement_v2` yalnız üç yeni
`SECURITY DEFINER` RPC ekledi:

- `create_urun_hareket_atomik_v2`
- `update_urun_hareket_atomik_v2`
- `delete_urun_hareket_atomik_v2`

Her RPC yetkiyi sunucuda tekrar çözüyor ve hareket+bakiye değişikliğini tek transaction
içinde yapıyor. İstemci yalnız tek RPC çağırıyor; client-side rollback kaldırıldı.
Migration canlıya uygulandı. Tablo/kolon/policy değişmedi; mevcut satırları güncelleyen
backfill, `DELETE`, `DROP` veya veri taşıma yoktur. ACL yalnız `authenticated`, anonim
çalıştırma kapalı ve `search_path` sabittir.

**1.5.x etkisi:** Sıfır. Eski istemci yeni RPC adlarını bilmez; eski fonksiyonlar ve veri
şekilleri korunmuştur.

### 2. Carisiz toplu stokta KDV korunuyor

**Eskiden:** Toplu giriş/çıkışta cari seçilmeden kaydedilen satırın `kdv_orani` alanı
hareket payload'ına eklenmiyordu. Aynı ürün cari ile ve carisiz girildiğinde rapor
hesapları farklılaşabiliyordu.

**Şimdi:** Her iki carisiz toplu akış da satırdaki KDV oranını ürün hareketine yazıyor.
Mevcut hareketlere dokunulmadı.

### 3. Özel rapor tarih aralığı uçtan uca korunuyor

**Eskiden:** `custom` dönem bazı detay yönlendirmelerinde aylığa çevriliyor, etiket aylık
gösteriliyor ve trend grafiği seçili aralık yerine standart dönem dilimlerini
kullanabiliyordu.

**Şimdi:** Detay route'u `custom` değerini koruyor; başlık gerçek başlangıç/bitiş
tarihlerini gösteriyor. Trend seçili aralığı en fazla altı bitişik ve boşluksuz parçaya
bölüyor.

### 4. Eksik kur sessiz kalmıyor

**Eskiden:** Güncel kur tablosunda karşılığı olmayan yabancı para kalemi nakit akışı veya
trend toplamından düşebiliyor, fakat kullanıcı gösterilen toplamın eksik olduğunu
anlamıyordu.

**Şimdi:** Nakit akışı, trend, ana sayfa ve finans detay yüzeyleri eksik dönüşüm varsa
“Bazı döviz tutarları çevrilemedi; gösterilen toplamlar eksik veya yaklaşık olabilir.”
uyarısını gösteriyor. Bu adım tarihsel/aylık kur saklamaz; yalnız mevcut güncel kur
motorunun eksik veri durumunu görünür yapar.

### 5. Raporlar işlemden sonra hemen yenileniyor ve sayfalama kararlı

**Eskiden:** Bazı rapor query key'leri ertelenmiş invalidation grubundaydı; açık rapor
ekranı yeni işlemden sonra eski veriyi tutabiliyordu. Büyük veri sorgularında yalnız
tarihe göre sıralama, aynı tarihli satırların sayfa sınırında atlanması/tekrarlanması
riskini taşıyordu.

**Şimdi:** `analytics-periods` ve `analytics-trend` işlem sonrası immediate invalidation
alıyor. İncelenen nakit akışı, trend ve alış-satış detay sorguları `date + id` ile kararlı
sıralanıyor.

### 6. Excel dışa aktarımları hesaplanabilir ve ekranla tutarlı

**Eskiden:** Bazı tutar, yüzde, adet ve tarih hücreleri biçimlendirilmiş metindi; Excel'de
toplama/sıralama beklenen şekilde çalışmıyordu. Cari/personel işleminin para birimi yalnız
hesap bağından okunabildiği için yanlış sembol çıkabiliyordu. Alış-satış detayında iadeler
yoktu. Ana kategoriye doğrudan bağlı işlemler kategori detay toplamına giriyor, satırlarda
yer almıyordu.

**Şimdi:** Para, yüzde, adet ve işlem tarihi gerçek Excel sayı/tarih hücresidir. Para
birimi `source_currency → hesap → cari → personel` kanonik zincirinden çözülür. Ürün
iadeleri detayda negatif satırdır; kategori/grup netleri güncel kur tablosuyla çevrilir.
Ana kategoriye doğrudan bağlı işlemler ayrı satır olarak dışa aktarılır ve satır toplamı
genel toplamla eşleşir.

### 7. Trend filtresi klavye ve safe-area düzeltmesi

**Eskiden:** Arama klavyesi açıldığında “Temizle/Uygula” footer'ı klavye veya cihazın alt
güvenli alanı arkasında kalabiliyordu.

**Şimdi:** Modal `KeyboardAvoidingView` ile kullanılabilir yüksekliğe uyuyor; footer gerçek
modal safe-area değerini kullanıyor. Listeyi aşağı sürüklemek klavyeyi kapatıyor ve kapatma
ikonunun dokunma hedefi büyütüldü.

### 8. Haftalık raporda ay seçimi kesin hafta hesabı kullanıyor

**Eskiden:** Ayın ilk günü ile bugünün gün farkı 7'ye bölünüp aşağı yuvarlanıyordu.
Haftanın günü, yıl sınırı veya yaz/kış saati farkı komşu haftayı seçtirebiliyordu.

**Şimdi:** Seçilen ayın içinde başlayan ilk Pazartesi ile mevcut haftanın Pazartesi günü
arasındaki takvim haftası farkı hesaplanıyor. Yıl sınırı ve DST farkı sonucu
değiştirmiyor.

### Telefon kabul turu

1. Ürün detayından manuel giriş oluştur, tutarı değiştir ve sil; stok her adımda yalnız
   bir kez değişmeli, hareket satırıyla aynı anda görünmeli/kaybolmalı.
2. Toplu ürün giriş ve çıkışında cari seçmeden KDV'li satır kaydet; ürün hareketi ve
   alış-satış raporundaki KDV'li toplam aynı olmalı.
3. Raporlarda özel bir tarih aralığı seç, ana rapordan kategori/hesap detayına gir;
   başlık ve satırlar aynı aralıkta kalmalı. Trend tüm seçili aralığı kapsamalı.
4. Bir yabancı para kalemi için kur yoksa nakit akışı/trend/ana sayfada eksik veya
   yaklaşık toplam uyarısı görünmeli.
5. Rapor açıkken yeni küçük bir işlem kaydet ve geri dön; manuel yenileme yapmadan rapor
   değişmeli. Aynı gün çok satırlı uzun listede tekrar/eksik satır olmamalı.
6. Gelir-gider, alış-satış, nakit akışı ve kategori detay Excel'lerini indir. Bir tutar
   sütununda Excel `TOPLA` çalışmalı; iade negatif görünmeli; ana+alt kategori satırları
   genel toplamla eşleşmeli.
7. Trend filtresinde aramaya yaz; klavye açıkken iki footer butonu görünür ve basılabilir
   olmalı.
8. Haftalık raporda tarih başlığına basıp birkaç farklı ay/yıl seç; dönem seçilen ayın
   ilk Pazartesi–Pazar haftası olmalı.

**Otomatik doğrulama:** Ana oturumda TypeScript geçti; ESLint 0 hata/104 mevcut uyarı
ile geçti; Jest 115/115 suite ve 1.596/1.596 test geçti; iOS Metro 4.096 modülle temiz
paketlendi. Excel import testlerinin Expo Crypto mock'u için bilinen fallback
`console.error` çıktıları sürmektedir; test başarısızlığı değildir.

## 30 Temmuz cihaz geri bildirimi — Yetki alanı ertelendi

30 Temmuz cihaz turu, aşağıdaki yetki davranışlarının ürün beklentisiyle henüz
eşleşmediğini gösterdi. Kullanıcı kararıyla bu maddeler bu turda kodlanmayacak;
yetkilendirme alanı, yetki dışı saha bugları tamamlandıktan sonra ayrı bir sözleşme
oturumunda topluca ele alınacak. Aşağıdaki kayıt, hemen altındaki mevcut uygulama
notlarını “cihaz kabulü tamamlandı” olarak yorumlamayı engeller:

1. Personel-only kullanıcı, Hesaplar modülü kapalı olsa da ödeme/tahsilat yapabilmeli.
   Hesap seçimi Cari-only akışındaki gibi minimal olmalı: hesap adı/türü/para birimi
   kullanılabilir, bakiye hiçbir response veya UI katmanında görünmemelidir. Mevcut
   “Personel ödeme/tahsilatı için Personel + Hesaplar gerekir” kararı bu yeni ürün
   beklentisiyle değiştirilmek üzere beklemektedir.
2. Cihazda bazı QTB bağlamlarında bütün sekmeler, bazı mevcut-işlem açılışlarında ise
   yalnız ilgili işlemin sekmesi görünmektedir. Özellikle `personel=edit_all` profili
   bir Cari detay satırını açtığında beklenen bütün işlem sekmelerinin tutarlı biçimde
   görünmesi istenmektedir. Bağlam, kaynak modülü ve create/edit aksiyonu birlikte
   yeniden sözleşmelendirilecektir.
3. Cari-only rol, carinin bütün defterini owner görünümüne denk okuyabilmelidir.
   Ürün modülü kapalı olsa bile ürünlü alış/satış satırı ve satıra bağlı ürün listesi
   okunabilmeli; fakat ürünlü işlem değiştirilememelidir.
4. Cari + Ürün modüllerinin ikisi de açık ve ilgili aksiyon seviyesi `edit_all` ise
   başka kullanıcının ürünlü Cari işlemi yalnız ürün listesi modalını açmakla
   kalmamalı, düzenlenebilmelidir. Güncel cihaz davranışı read-only ürün modalında
   kalmaktadır.

**Bu tur sınırı:** Yukarıdaki dört madde için istemci, RPC, RLS veya migration
değişikliği yapılmayacak. Önce S-03/S-04/S-05/S-07 ve yetki dışı bağlı
tutarsızlıkların cihaz kabulü tamamlanacaktır.

## 30 Temmuz devam kaydı — Cari/Personel işlem yetkileri

Cari-only ve Personel-only rollerinin QTB kapsamı işlem türüne göre yeniden kuruldu.
Cari detayında alış, satış, ilgili iade ve ödeme/tahsilat; Personel detayında gider,
satış ve izin işlemleri açılır. Personel ödeme/tahsilatı kaynak hesabı da etkilediği
için Personel + Hesaplar birlikte ister. Cari-only ödeme/tahsilat hesabı seçerken hesap
adını, türünü ve para birimini görür; bakiye hiçbir aşamada dönmez veya gösterilmez.

`edit_all/delete_all` artık Cari, Personel ve Personel İzin Geçmişi yüzeylerinde başka
kullanıcının oluşturduğu desteklenen normal işlemi düzenleyip silebilir.
`edit_own/delete_own` yalnız kendi satırında kalır. İstemci tenant, kayıt sahipliği ve
işlem tipi→kaynak modül kesişimini açılışta ve kaydetme/silme anında tekrar doğrular.
Sunucu tarafında `20260729212713_shared_transaction_mutation_v2` canlıdır: yalnız bir
internal guard ve üç yeni authenticated RPC ekler; bakiye farkını istemciden kabul
etmeyip eski/yeni kanonik satırdan sunucuda üretir. Migration tablo, kolon, policy,
trigger veya mevcut RPC değiştirmez; DML, backfill, `UPDATE`, `DELETE`, `DROP` ve veri
taşıma içermez.

İlk güvenli dilimde type/entity/para birimi bağları immutable kalır. Linked-cari,
ileri-tarihli kaynaktan tamamlanan, ürün hareketli, taksitli ve silinecek fotoğraflı
satırlar shared rolde `0A000` ile fail-closed olur ve kullanıcıya bağlı kayıt nedeniyle
işletme sahibinin işlem yapması gerektiği açıklanır. Shared editte ürün/fotoğraf
kontrolleri gizlenir; fotoğraf yan etkisi submit katmanında da owner-only korunur.
Edit/copy kaydı yüklenemezse boş form bırakılmaz: tek hata gösterilip QTB kapanır.

Üretim öncesinde PostgreSQL 17.6 üzerinde bağımlılık, `islemler.date_end = text`, yeni
imzaların yokluğu ve legacy update/delete MD5 değerleri kontrol edildi. Tam migration
tek transaction içinde çalıştırılıp assertion'lardan sonra rollback edildi; dört yeni
imzanın geri alındığı doğrulandı. Ardından aynı dosya canlıya uygulandı. Post-deploy
kontrolde dört fonksiyonun owner/search_path/SECURITY DEFINER/VOLATILE/ACL sözleşmesi
ve iki 16 alanlı dönüş şekli doğru; anon ve service-role execute kapalı, authenticated
yalnız üç public RPC'de açık; legacy V1 MD5 ve ACL değerleri değişmedi. Hedefli istemci,
yarış, payload, kaynak-modül ve migration paketi 10 suite / 156 test ile yeşildir.
Ana oturumdaki 30 Temmuz birleşik son turunda TypeScript geçti; ESLint 0 hata/104
mevcut uyarı, Jest 106/106 suite ve 1.561/1.561 test geçti; iOS Metro 4.093 modülle
temiz paketlendi.

**1.5.x etkisi:** Sıfır. Eski istemci yeni RPC adlarını bilmez; eski update/delete
fonksiyonları, imzaları ve ACL'leri aynen kalır. Bunun karşılığında legacy V1 yüzeyinin
client tarafından gönderilen bakiye operasyonlarını kabul etmesi uyumluluk nedeniyle
henüz kapatılmamıştır. Bu kalan sınır, yeni sürüm yayılımı + telemetri + minimum sürüm
kararı sonrasındaki ayrı hardening paketidir; bu ilk dilim “legacy yüzey tamamen
kapandı” şeklinde yorumlanmamalıdır.

**Telefon kabulü:**

1. Cari-only `edit_all` ile müşteri ve tedarikçi detayında bütün izinli sekmeleri açıp
   yeni küçük işlemler kaydet; hesap seçicide bakiye görünmemeli.
2. Başka kullanıcının normal cari işleminin yalnız tutar/açıklama/tarih/kategori
   alanlarından birini değiştir ve bakiyenin tek kez doğru güncellendiğini kontrol et.
3. Personel-only rolde gider/satış/izin oluştur; ödeme/tahsilat görünmemeli. Hesaplar
   modülünü de açınca ödeme/tahsilat görünmeli.
4. Başka kullanıcının Personel ve İzin Geçmişi satırını `edit_all` ile düzenle/sil;
   `edit_own` ile aynı deneme anlaşılır yetki mesajıyla reddedilmeli.
5. Ürünlü/taksitli/fotoğraflı özel satır shared rolde genel “işlem gerçekleştirilemedi”
   yerine bağlı kayıt açıklamasıyla güvenli biçimde reddedilmeli.

> Bu bölüm 30 Temmuz itibarıyla aşağıdaki tarihsel “V2 update/delete açık” ve
> “Personel edit owner-only” notlarının güncel karşılığıdır.
**Kapsam:** 28 Temmuz saha geri bildirimleri, güncel istemci kodu, migration zinciri,
izin sözleşmesi ve aynı yüzeylerde yapılan ek tutarlılık taraması
**Çalışma biçimi:** İlk salt-okunur denetim ve planlamanın ardından S-02 kodlandı,
bağımsız denetlendi, otomatik doğrulandı ve veri silmeyen migration canlıya uygulandı.
S-02 cihaz kabulünden sonra S-01 ağ modeli kodlandı, otomatik doğrulandı ve cihazda
kabul edildi. Ardından S-08 dashboard rapor yetkisi istemci + canlı RPC katmanında
uygulandı ve cihazda kabul edildi. S-09 kategori yazma sınırı istemci + canlı RLS/RPC
katmanında uygulandı ve cihazda kabul edildi. Ardından tam işlem kaynağı yetkili ortak
kullanıcıdaki ana ekran/Cari QTB tutarsızlığı istemcide giderildi ve cihazda kabul
edildi. S-10 işlem yetki/hata sözleşmesi istemcide uygulandı ve otomatik doğrulandı.
29 Temmuz'da S-11 Cariler-only bakiyesiz hesap seçimi ile dar tahsilat/ödeme akışı ve
S-12b/S-12c tenant-bazlı creator etiketi + atomik davet etiketi istemci/canlı RPC
katmanında tamamlandı. Aynı gün `cleanup_old_islem_audit_log()` API ACL'i P0-S4
kapsamında daraltıldı. P0-S3 `undo_import_batch` sertleştirmesi
`20260729084545_harden_undo_import_batch_owner_guard` olarak canlıya alındı ve
owner/shared/cross-tenant geri-almalı smoke matrisiyle doğrulandı. P0-S5 Edge worker
kimlik doğrulaması dört Function, Vault/trigger migration'ı ve canlı negatif
canary'lerle tamamlandı. C1 ürün yazma yüzeyleri ile C5/C6/C7/C8/C10 istemci kapıları
ve mutabakatın `view` yazma kapıları yerelde tamamlandı; telefon kabulü bekliyor. C9
minimal cari adı projeksiyonu additive RPC ile canlıya alındı; yeni istemcinin telefon
kabulü bekliyor. C4-A işlem ve doğrudan ürün mutation istemci kapıları yerelde
tamamlandı. P0-S2'nin additive `create_islem_atomik_v2` sunucu create motoru
`20260729121123_create_islem_atomik_v2` ile canlıya alındı. İlk istemci diliminde
yalnız QuickTransactionBar'daki yeni, normal, viewer olmayan `gelir`/`gider`/`transfer`
create akışları V2'ye geçirildi ve yerelde doğrulandı; telefon kabulü bekliyor. Diğer
create akışları, V2 update/delete, telemetri/minimum sürüm ve legacy cutover açıktır.
C12
public ekstre süresiz seçeneği yeni istemciden kaldırıldı. P0-S9 Notlar RLS/aksiyon,
bağlam, sahiplik, kimlik ve güvenli fotoğraf yaşam döngüsü
`20260729112129_harden_notlar_rls_actions_context` ile; P0-S10 public ekstre yaşam
döngüsü ise `20260729112753` phase-1, `cari-ekstre` Edge v6 ve `20260729113246`
phase-2 sırasıyla canlıya alındı. P0-S6A işlem fotoğrafı copy-on-write istemci
akışı yerelde tamamlandı. P0-S6B'nin P0-S1'den bağımsız dar parçası olan kanonik
upload + not fotoğrafı Storage zarfı
`20260729184053_harden_note_photo_storage_phase1` olarak canlıya alındı. Paket
top-level DML/backfill/kolon değişimi yapmadı; 286 Storage nesnesi ve 41 orphan
uygulama sonrasında aynı kaldı, hiçbir mevcut nesne silinmedi. İşlem fotoğrafının
tip/modül bazlı nihai SELECT/DELETE kapanışı P0-S1'e bağlı kalır.
P0-S7'nin ilk dilimi olan shared hesap detayı dar işlem projeksiyonu ve istemci
geçişi yerelde tamamlandı; üretim rollback matrisi geçtikten sonra
`20260729182030_add_hesap_islem_satirlari_v1_rpc` olarak canlıya alındı.
P0-S7'nin personel dilimi de `20260729204756_add_personel_projection_rpcs`
olarak canlıya alındı: shared personel işlem satırları 14 alanlı dar RPC'ye, izin
kotaları üç alanlı aggregate RPC'ye taşındı; yeni istemci geçişi yerelde hazır ve
telefon kabulü bekliyor.
P-B kanonik yetki
altyapısı PostgreSQL 17 default-ACL ön kontrolünde bulunan açık giderildikten,
rollback preflight ve bağımsız denetim temiz geçtikten sonra additive migration
olarak canlıya alındı. Ardından P-D'nin ilk iki dar tüketicisi devreye alındı:
`get_kategori_secim_referanslari` kategori seçiminde yalnız dört güvenli alanı
döndürüyor; `get_transaction_creator_labels` ise etiketi yalnız çağıranın gerçekten
görebildiği işlem kaynağı ve kayıt sahipliği üzerinden çözüyor. Mevcut temel tablo
RLS/SELECT yolları henüz bu projeksiyonlara taşınmadı. S-11, S-12b/S-12c/S-12d ve
P0-S4 paketlerinin cihaz kabulü henüz yapılmadı.
**Canlı sistem:** S-02, S-08 ve S-09 öncesi/sonrası yalnız şema metadatası, UUID
tabanlı yetki fixture'ları, anonim/toplulaştırılmış sonuçlar, satır sayısı ve geri
döndürülemez çıktı parmak izleriyle doğrulandı. Bölüm II'deki diğer canlı katalog
bulguları kendi denetim anının tarihsel fotoğrafıdır. S-11, S-12b/S-12c/S-12d,
P0-S2, P0-S3, P0-S4, P0-S9, P0-S10 ve dar kategori referans ucunun 29 Temmuz canlı
uygulama/geri-almalı smoke kayıtları ilgili maddelerde ayrıca belgelenmiştir.

> **29 Temmuz devam kaydı:** Önceki Supabase araç kotası daha sonra yeniden erişime
> açıldı. P0-S7 tek `REPEATABLE READ` rollback provasında katalog/ACL, 18 kolon,
> dinamik veri-policy-helper-index hash'leri; gerçek Owner, H-only, H+C, H+C+P ve
> all profilleri; 7+7 cursor ile negatif yetki kapıları geçtikten sonra
> `20260729182030_add_hesap_islem_satirlari_v1_rpc` olarak canlıya alındı. Üretimde
> non-vacuous own profili bulunmadığından bu tek kombinasyon gerçek satır üzerinde
> uydurulmadı; izole PostgreSQL fixture'ındaki own/all testi geçerlidir. P0-S6B'de
> önce pointer `NULL` sonrası DELETE'in SELECT görünürlüğü, ardından gerçek Supabase
> Storage `INSERT ... RETURNING` akışında yeni satırı self-query ile göremeyen
> `STABLE` helper blokajı bulundu; iki deneme de tamamen rollback oldu. İkinci açık,
> delete helper'ı `(text,text)` yapıp gerçek policy satırındaki `owner_id`'yi
> geçirmekle, self-query olmadan kapatıldı. PostgreSQL 15.18/17.10 fixture'ı,
> üretim katalog/veri ve gerçek runtime rollback'i ile post-deploy aynı authenticated
> matris geçtikten sonra `20260729184053_harden_note_photo_storage_phase1` canlıya
> alındı.
>
> Aynı devam turunda P0-S2'nin ilk istemci dilimi tamamlandı. Ayrı
> `useCreateIslemV2` hook'u yalnız QuickTransactionBar'daki yeni normal, viewer
> olmayan gelir/gider/transfer kayıtlarında; normal ve çapraz-kur dallarında
> kullanılıyor. Stable client UUID, exact payload allowlist, iki/sekiz ondalık
> normalizasyonu, tek satırlı `RETURNS TABLE` sonucu ve beklenen kimlik doğrulaması
> zorunlu; V2 hatasından sonra olası çift yazımı önlemek için V1 fallback yoktur.
> Sunucunun yazıp HTTP cevabının kaybolduğu kanıtlanırsa işlem tekrarlanmaz; bilinen
> client UUID ile yalnız best-effort fotoğraf eşitlemesi denenir. Viewer/linked-cari
> ile ürün, taksit, ileri tarihli, dönüşüm, minimal-cari ve diğer özel yollar mevcut
> endpoint'lerinde bırakıldı.
>
> P0-S8'in ikinci sunucu dilimi de aynı devam turunda tamamlandı.
> `20260729194510_add_income_source_report_v2_permission_projection` canlıya alındı;
> `get_income_by_source_v2` kaynak modülü + sahiplik filtresini sunucuda uygular,
> eski `get_income_by_source` aynı sekiz kolonlu uyumluluk sarmalayıcısı olarak
> korunur. Yeni istemci yalnız V2'yi kullanır, yetki/işletme/kullanıcı parmak izli
> ve diske yazılmayan cache ile izin daralınca eski toplamı ekranda tutmaz. Doğrudan
> kaynak detay projeksiyonu henüz daraltılmadığı için shared kaynak kartları geçici
> olarak tıklanamaz; owner detay akışı aynen çalışır.
>
> P0-S8'in üçüncü sunucu dilimi olan ürün alış/satış raporu da tamamlandı.
> `20260729201911_add_product_report_v2_permission_projection` canlıya alındı.
> `get_product_report_v2` Raporlar + Ürünler kapısını ve own/all sahiplik süzmesini
> sunucuda uygular; eski `get_product_report` aynı dört parametre ve dokuz kolonla
> V2'ye yönlenen uyumluluk sarmalayıcısıdır. Yeni istemci V2, kullanıcı/yetki
> parmak izli ve diske yazılmayan cache kullanır. Shared kullanıcı için geniş
> detaylı Excel dışa aktarımı dar export projeksiyonu gelene kadar gizlidir.
>
> P0-S7'nin shared personel işlem/izin dilimi de tamamlandı.
> `20260729204756_add_personel_projection_rpcs` iki yeni salt-okunur RPC ekler.
> Personel-only profilde `personel_gider`, `personel_satis` ve iki izin tipi
> görünür; `personel_odeme`/`personel_tahsilat` satırının tamamı için Personel +
> Hesaplar gerekir. Own/all, arşiv/pasif ve tenant sınırı sunucuda uygulanır.
> Shared geçmiş kısmi olabileceği için açılış/yürüyen bakiye, geniş PDF/Excel,
> ileri tarihli bölüm ve ham edit/copy geçici olarak owner-only gizlidir. Personelin
> güncel bakiye kartı Personel sözleşmesi gereği görünmeye devam eder.

> **Ana karar:** Saha ekran görüntülerinin bir kısmı güncel `HEAD`'de zaten düzeltilmiş
> kodla çelişiyor. Önce cihazdaki sürüm/build ile kaynak eşleştirilmeli; mevcut düzeltmeler
> yeniden yazılmamalıdır. Yanlış çevrimdışı tespiti ve ileri tarihli işlemin atomik
> motoru atlaması giderildi. Dashboard rapor kapısı ve kategori owner-only yazma
> sınırı canlıya alındı. İşlem yetki reddi artık genel kayıt hatasına çevrilmeden,
> aksiyon ve sahiplik bağlamına göre açıklanır. Cariler-only minimal hesap referansı,
> dar cari nakit işlemi ve tenant-bazlı creator etiketinin ilk ucu canlı additive
> RPC'lerle uygulanmıştır. `20260729073717` aynı creator RPC imzasını koruyan
> erişim-daraltıcı `CREATE OR REPLACE` adımıdır. Dar kategori seçim projeksiyonunun
> sunucu ucu da canlıdır; picker
> ikon/hiyerarşi kararı, istemci geçişi ve daha sonra temel tablo SELECT'inin
> daraltılması ayrı açık adımlardır.

## Bölüm I — Saha Bulguları ve Birleşik Geliştirme Planı

> **Tarihsel uygulama günlüğü:** Bu bölüm v4 kararı verilmeden önceki ara
> owner-only/manager kararlarını ve o günün açık paketlerini de korur. Kategori
> yönetimi, pasif kayıt, audit ve tamamlanma durumu çelişirse raporun en üstündeki
> v4 canlı kapanış kaydı geçerlidir.

### I.1. Kapsam, yöntem ve durum sözlüğü

Kullanıcının ilettiği on geri bildirim, birbirinden bağımsız on üç uygulanabilir iş
kalemine ayrıldı. Her kalem güncel kaynakta tekrar açıldı; rapordaki alıntılar baz
commit'teki koddan birebirdir. Ek tarama ağ/işlem akışları, UI yerleşimi ve
yetki/paylaşım olmak üzere üç paralel okumayla yapıldı; sonuçlar ana oturumda yeniden
doğrulandı.

Durumlar:

- **Doğrulandı:** Sorunu üretebilen kod yolu güncel kaynakta mevcut.
- **HEAD'de düzeltilmiş:** Saha görüntüsündeki eski davranış güncel kaynakta giderilmiş
  görünüyor; yeni build üzerinde cihaz kabulü bekliyor.
- **Özellik boşluğu:** Mevcut davranış teknik olarak tutarlı fakat istenen kullanım
  akışı henüz yok.
- **Yüksek olasılıklı kök neden:** Statik kod güçlü aday gösteriyor; cihaz logu olmadan
  tek neden diye kapatılmayacak.
- **Sunucu kapısı:** RLS/RPC/projeksiyon değişikliği gerektirir. 27 Temmuz 2026 yedeği
  teyitlidir; yalnız additive ve mevcut veriyi silmeyen/değiştirmeyen migration'lar
  ayrıca yedek istemeden uygulanabilir. `DROP`, kolon/tip değişikliği, veri silme veya
  toplu yeniden yazma gerekirse ayrıca onay + güncel tam yedek kapısı açılır.

### I.2. Yönetici özeti

| ID | Saha konusu | Güncel kod sonucu | Öncelik | Karar |
|---|---|---|---|---|
| S-01 | İnternet varken “İnternet bağlantısı yok” | Kod + otomatik doğrulama + cihaz kabulü tamamlandı | P0/P1 | Kapandı; native binary/OTA kuralını koru |
| S-02 | İleri tarihli işlemde uzun spinner | Kod + canlı additive RPC + cihaz kabulü tamamlandı | **P0** | Kapandı; regresyon matrisini koru |
| S-03 | Ana “Ekle” sheet'i fazla uzun | Küçük ekran/büyük yazı sınırı + kaydırılabilir seçenekler tamamlandı; cihaz kabulü açık | P2 | İçerik-boylu sheet ve sabit İptal davranışını cihazda doğrula |
| S-04 | Form butonu–klavye ölü alanı | İstemci kodu + otomatik doğrulama tamamlandı; cihaz kabulü açık | P1/P2 | Ortak form-footer sözleşmesi uygulandı; cihaz matrisini tamamla |
| S-05 | Detay/rapor/ekleme sayfası status bar'a taşıyor | Nested-layout kök nedeni giderildi; 125 otomatik safe-area sözleşmesi tamamlandı, cihaz kabulü açık | P1 | 7 direct-root + 41 guarded-nested header ve fullscreen istisnalarını koru |
| S-06 | Hızlı scroll sonrası satırların hareket etmesi | İki istemci paketi + otomatik doğrulama tamamlandı; 30 Temmuz cihaz turu olumlu | P1 | Regresyon matrisini koru; tekrar görülürse ekran kaydı al |
| S-07 | Taksitlerde 2–3 kuruş dağılım farkı | İstemci kodu + tam otomatik doğrulama tamamlandı; cihaz kabulü açık | P1 | Integer-kuruş ve düzenlenebilir gerçek önizleme uygulandı |
| S-08 | Raporlar kapalıyken dashboard tutarları | İstemci + canlı RPC + otomatik doğrulama + cihaz kabulü tamamlandı | **P0** | Kapandı; regresyon matrisini koru |
| S-09 | Ortak kullanıcı kategori ekleyip çıkarabiliyor | İstemci + canlı restrictive RLS/atomik RPC + otomatik doğrulama + cihaz kabulü tamamlandı | **P0** | 29 Temmuz owner-only ara paketi kapandı; v4 yönetimi owner + gerçek manager olarak genişletir |
| S-10 | Yetki reddinde “İşlem gerçekleştirilemedi” | Kod + otomatik doğrulama tamamlandı; cihaz kabulü açık | P1 | Merkezi hata sözleşmesi ve yüzey kapıları uygulandı; cihaz matrisini tamamla |
| S-11 | Cariler-only Tahsilat hesap seçicisi boş | Dedicated minimal hesap RPC/hook + dar atomik cari nakit RPC canlı; otomatik doğrulama tamamlandı, cihaz kabulü açık | P1 | Kod/sunucu paketi tamamlandı; bakiyesiz picker ve tahsilat/ödeme cihaz matrisini tamamla |
| S-12 | İşlemi yapan kullanıcı için nickname | S-12a resolver + S-12b tenant RPC + S-12c atomik davet v2 + S-12d kaynak/sahiplik daraltması canlı; otomatik doğrulama tamamlandı, cihaz kabulü açık | P1/P2 | Shared-peer etiket, kaynak görünürlüğü ve yeni davet akışı cihaz matrisini tamamla |
| S-13 | Cari/personeli rehberden seçme | Sistem seçicisi + telefon normalizasyonu + izin-kapsamlı mükerrer uyarısı tamamlandı; yeni binary cihaz kabulü açık | P2 | Rehber ve mükerrer-numara matrisini mağaza build'inde tamamla |

İlk uygulama sırası:

1. S-02 ileri tarihli işlem atomikliği ve tek tahsis motoru.
2. S-01 ağ durumunun doğru modellenmesi; banner reflow ve React Query bağlantısı.
3. S-08/S-09 sunucu yetki sınırları; S-10 anlaşılır hata sözleşmesi.
4. S-11 minimal hesap, S-12 creator label projeksiyonları.
5. S-06 liste stabilitesi ve S-04/S-05 yerleşim matrisi.
6. S-07 taksit önizlemesi.
7. S-13 rehber entegrasyonu ve native release.

---

## I.3. Ağ ve ileri tarihli işlem akışı

### S-01 — İnternet varken “İnternet bağlantısı yok”

**Durum: Kod, otomatik doğrulama ve kullanıcı cihaz kabulü tamamlandı.**

Uygulama bugün cihazın ağ bağlantısını ölçmüyor; Supabase Auth health endpoint'inin
beş saniye içinde cevap verip vermemesini “internet var/yok” olarak yorumluyor:

`src/lib/supabase.ts:99-114`

```ts
const timeout = setTimeout(() => controller.abort(), 5000);
await fetch(`${supabaseUrl}/auth/v1/health`, {
  method: 'GET',
  signal: controller.signal,
  headers: { apikey: supabaseAnonKey },
});
clearTimeout(timeout);
return true;
...
return false;
```

Tek sonuç doğrudan global state'e yazılıyor; histerezis, single-flight veya eski cevap
koruması yok:

`src/hooks/useNetworkStatus.ts:12-21`

```ts
const check = async () => {
  const connected = await checkNetworkConnectivity();
  setIsOffline(!connected);
};

check();
intervalRef.current = setInterval(check, CHECK_INTERVAL);
...
if (state === 'active') check();
```

Bu nedenle cihaz LTE/Wi‑Fi ile internete bağlıyken Supabase DNS/TLS/backend gecikmesi
yanlış kırmızı banner üretebilir. HTTP status kontrol edilmediği için hızlı bir `500`
cevabı da ters yönde “online” kabul edilir. Interval ile foreground kontrolü çakışırsa
daha eski ve yavaş cevap daha yeni başarıyı ezebilir.

**Çözüm tasarımı:**

1. Tek bağlantı modeli oluştur:
   `unknown | connected | disconnected | backend_unreachable`.
2. Cihaz bağlantısının kaynağı `expo-network` listener/state olsun. TanStack Query
   `onlineManager` yalnız bu gerçek cihaz durumuna bağlansın.
3. Supabase health/API başarısızlığı cihazın interneti değil, ayrı
   `backend_unreachable` durumudur. Metin “Sunucuya şu anda ulaşılamıyor. Lütfen tekrar
   deneyin.” olmalı.
4. Eski async cevabın yeniyi ezmesini generation token veya single-flight ile engelle.
5. Backend durumunda tek hatayla kırmızı banner açma; kısa retry ve ardışık başarısızlık
   eşiği kullan. Başarılı gerçek API/mutation sonucu durumu hemen temizleyebilsin.
6. Health çağrısı socket ısıtma/teşhis olabilir; finansal yazma öncesinde blocking
   preflight yapılmamalı.
7. Timer `finally` içinde temizlenmeli ve HTTP status semantiği açıkça işlenmeli.

`src/lib/queryClient.ts:21-28` bugün bağlantı varmış gibi davranıyor:

```ts
refetchOnReconnect: true,
...
networkMode: 'online',
...
mutations: {
  retry: 1,
  networkMode: 'online',
},
```

Ancak `onlineManager` için React Native listener kurulmamış. Sonuç olarak banner
“offline” derken query/mutation katmanı online sayabilir. Ağ store'u iki yüzeyin tek
kaynağı olmalıdır.

**Banner yerleşimi:** Banner navigator'dan önce normal akışta render ediliyor:

`src/app/_layout.tsx:308-314`

```tsx
{isOffline && (
  <View style={[layoutStyles.offlineBanner, { paddingTop: insets.top }]}>
    ...
  </View>
)}
<View style={{ flex: 1 }}>
```

Görünüp kaybolması Stack viewport yüksekliğini değiştirir. Banner absolute overlay
olmalı veya alanı her durumda sabit rezerve edilmelidir. Bu karar S-06'daki liste
kaymasının da ilk A/B testidir.

**Kabul testleri:**

- LTE, Wi‑Fi, uçak modu, captive portal, Wi‑Fi↔LTE handoff.
- Supabase 5xx, DNS hatası ve 5/15 saniyelik timeout.
- Background→foreground ile interval aynı anda çalışırken eski cevap yarışı.
- Banner girip çıkarken açık FlatList'in `contentOffset.y` değeri.
- Offline form submit: form verisi korunur; sonsuz spinner oluşmaz.
- Reconnect: aktif read query'ler yenilenir; finansal mutation kör retry ile iki kez
  yazılmaz.

**Eski client:** Client-only mantık eski sürümü etkilemez. `expo-network` native modül
olduğu için bu değişiklik yalnız yeni binary'ye konmalı; eski binary'ye uyumsuz OTA
gönderilmemelidir.

#### S-01 uygulama kaydı — 29 Temmuz 2026

**DB/migration:** Yok. Kolon, tablo, kullanıcı veya finansal işlem verisi
değiştirilmedi.

İstemci tarafında:

- Expo SDK 54 ile uyumlu `expo-network@8.0.8` eklendi. Cihaz durumu
  `unknown | connected | disconnected`, servis durumu
  `unknown | reachable | unreachable` olarak ayrı tutuluyor; kullanıcıya çıkan birleşik
  durum `unknown | connected | disconnected | backend_unreachable`.
- `undefined/UNKNOWN` başlangıç değeri offline sayılmıyor. Android'de aktif ağ varken
  taşıma tipi `UNKNOWN` kalırsa pozitif `isInternetReachable` sinyali yanlış offline
  sonucunu engelliyor.
- Listener ilk kurulduktan sonra initial state okunuyor. Listener daha yeni sonucu önce
  üretirse geç kalan initial Promise onu ezemiyor; unmount sonrası state yazımı da
  engelleniyor. Eski 30 saniyelik Supabase polling'i kaldırıldı.
- TanStack Query `onlineManager` yalnız cihaz bağlantısına bağlandı. Okumalar offline
  durumda durur ve reconnect'te aktif sorgular yenilenir.
- Supabase health sonucu artık “internet” değildir. Gerçek Supabase HTTP/fetch sonuçları
  ayrı servis durumunu besler; tek geçici hata banner açmaz, ardışık iki hata
  `backend_unreachable` üretir, sonraki gerçek başarı hemen temizler. Eski isteğin geç
  kalan hatası daha yeni başarıyı ezemez.
- Health timer'ı bütün sonuç yollarında `finally` ile temizlenir. `2xx`, `4xx` ve `5xx`
  semantiği ayrıldı: `4xx` servis erişimini kanıtlar, `5xx` servis başarısızlığı sayılır.
- Finansal yazılar için global otomatik retry kapatıldı. Mutation'lar offline kuyruğa
  alınmıyor, AsyncStorage'a dehydrate edilmiyor ve reconnect'te kullanıcıdan habersiz
  oynatılmıyor. Cihaz kesin offline ise Supabase fetch anında reddedilir; form kapanmaz,
  kullanıcı bağlantı geldikten sonra yeniden denemeye kendisi karar verir.
- Kırmızı banner Stack'in normal akışından çıkarılıp absolute overlay yapıldı. Görünüp
  kaybolması navigator/FlatList viewport yüksekliğini artık değiştirmiyor. Cihaz
  kesintisinde Wi‑Fi ikonu ve “İnternet bağlantısı yok”; servis kesintisinde server ikonu
  ve “Sunucuya şu anda ulaşılamıyor. Lütfen tekrar deneyin.” gösteriliyor.

**Otomatik regresyon kapsamı:**

- listener-before-initial yarışı, initial reject ve cleanup;
- `unknown`, connected/disconnected ve çelişkili Android sinyali;
- backend ardışık hata eşiği, başarıyla anında temizleme ve eski cevap koruması;
- health `200/401/503/timeout` sınıflandırması ve timer temizliği;
- query reconnect sözleşmesi, mutation retry/kuyruk/dehydrate kapıları.

**Yeni binary / eski client etkisi:** `expo-network` Expo Go SDK 54'te bulunur; Expo Go
ile cihaz testi yapılabilir. Önceden üretilmiş development/store binary'sinde native
`ExpoNetwork` modülü yoktur ve yeniden build gerekir. Projede EAS Update etkin değildir;
ileride etkinleştirilirse bu kod eski runtime'a OTA olarak gönderilmemelidir. Eski mağaza
client'larının kendi kodu ve verileri değişmez.

**Cihaz kabul testi:**

1. Expo Go'da uygulamayı LTE veya Wi‑Fi ile aç. Eskiden Supabase health beş saniyede
   yanıtlamazsa internet varken kırmızı banner çıkabiliyordu; şimdi normal bağlantıda
   banner görünmemeli.
2. Cari veya Personel listesini ortalara kadar kaydır; görünen ilk satırı aklında tut.
   Uçak modunu aç. “İnternet bağlantısı yok” banner'ı üstten overlay gelmeli; liste
   aşağı itilmemeli ve görünen satır yer değiştirmemeli.
3. Uçak modunu kapat. Banner kaybolmalı, liste yine zıplamamalı ve açık ekrandaki veriler
   bağlantı dönüşünde yenilenmeli.
4. Wi‑Fi açıkken mobil veriye, sonra tekrar Wi‑Fi'ye geç. Geçiş boyunca bağlantı varsa
   yanlış kırmızı banner kalmamalı.
5. Uçak modundayken hızlı işlem barında örnek bir form doldurup Kaydet'e bas. Sonsuz
   spinner veya kapanan/boşalan form olmamalı; hata sonrası girdi korunmalı. Sonra
   bağlantıyı açıp kullanıcı olarak yeniden Kaydet'e bas; tek işlem oluşmalı.
6. Server outage ve geç kalan async cevap senaryoları cihazdan güvenli biçimde üretilemediği
   için otomatik testle kilitlendi; üretim servisi kapatılarak manuel test yapılmamalıdır.

**Cihaz kabulü — 29 Temmuz 2026:** Kullanıcı LTE/Wi‑Fi ve uçak modu geçişlerinde
yanlış banner, liste reflow'u ve kayıt akışı regresyonu görmediğini onayladı. S-01
kapatıldı.

### S-02 — İleri tarihli işlem spinner'ı ve atomik motorun atlanması

**Durum: Kod, canlı migration ve kullanıcı cihaz kabulü tamamlandı.**

UI bütün kartlar için tek mutation'ın global `isPending` değerini kullanıyor:

`src/components/ui/IleriTarihliIslemlerSection.tsx:293-300`

```tsx
<Button
  ...
  onPress={() => handleComplete(item)}
  loading={completeIslem.isPending}
>
```

Tamamlama tek istek değildir. Satır okunuyor, hatırlatıcı iptal ediliyor, status claim
ediliyor, işlem doğrudan insert ediliyor ve bakiye bacakları ayrı RPC'lerle sırayla
yazılıyor:

`src/hooks/useIleriTarihliIslemler.ts:411-429`

```ts
await cancelTransactionReminder(id);
...
const { data: claimed, error: claimError } = await supabase
  .from('ileri_tarihli_islemler')
  .update({ status: 'completed' })
  ...
```

`src/hooks/useIleriTarihliIslemler.ts:465-485`

```ts
const { data: newIslem, error: insertError } = await supabase
  .from('islemler')
  .insert(islemData)
  .select()
  .single();
...
await updateBalancesForIslem(islemData);
```

`src/hooks/useIleriTarihliIslemler.ts:541-550`

```ts
for (const op of ops) {
  await safeIncrementBalance(op.t, op.id, op.d);
  applied.push(op);
}
...
/* best-effort geri alma */
```

Her Supabase fetch'inin 15 saniyelik timeout'u, global mutation retry'si ve
best-effort rollback birlikte uzun spinner ve belirsiz sonuç üretir.

Daha kritik olan, normal create yolunun zaten kullandığı tek transaction motorunun
atlanmasıdır:

`src/hooks/useIslemler.ts:168-178`

```ts
// ATOMİK: insert + bakiye ops'ları TEK transaction'da
const { data, error } = await supabase.rpc('create_islem_atomik', {
  p_isletme_id: isletme.id,
  p_new_row: input,
  p_balance_ops: ops,
});
```

Bu RPC, bakiye yanında tek taksit/vade tahsis motorunu da çalıştırır:

`supabase/migrations/20260724020000_create_islem_hedef_islem.sql:71-83`

```sql
IF v_rowcount > 0 THEN
  ...
  PERFORM public.increment_balance(...);

  IF r.cari_id IS NOT NULL AND public.tahsis_borc_tipleri(r.type) IS NOT NULL THEN
    PERFORM public.tahsis_odeme_esitle(...);
  END IF;

  IF r.cari_id IS NOT NULL AND r.type IN ('cari_satis', 'cari_alis') THEN
    PERFORM public.tahsis_avans_supur(...);
  END IF;
END IF;
```

İleri tarihli cari ödeme/tahsilat/satış/alış doğrudan insert yolunda bu tahsis çağrılarını
atlayabilir. Bu, yalnız UX değil finansal veri bütünlüğü riskidir.

**İlk migration'sız çözüm önerisi:**

1. Çapraz-kur doğrulamasını dayanıklı yazmadan önce yap.
2. `islemler.id` için deterministik UUID kullan ve mevcut `source_ileri_id` unique
   korumasını sürdür.
3. Mevcut `create_islem_atomik` RPC'yi çağır; işlem+bakiye+tahsis tek DB
   transaction'ında tamamlansın.
4. RPC başarısından sonra scheduled satırı `completed` yap.
5. Cevap kaybolursa deterministik ID/source ile existence probe yap; bakiyeyi ikinci kez
   uygulama.
6. Hatırlatıcıyı ancak dayanıklı başarıdan sonra iptal et.
7. Bu kritik mutation'da kör global retry yerine `retry:false` + açık probe kullan.
8. UI pending state'ini `completingId` ile kart bazlı göster; diğer kartların butonu
   spinner'a dönüşmesin.

> **28 Temmuz uygulama teyidi — önemli düzeltme:** Bu önerinin finansal RPC ve
> kart-bazlı spinner bölümleri geçerlidir; ancak 4. adımdaki “RPC'den sonra scheduled
> statüsünü kapat” sırası tek başına üretim-güvenli değildir. Store'da kalan eski
> istemci önce `pending/notified → completed` claim'i yapar ve unique insert hatasında
> statüyü koşulsuz eski değerine döndürür. Yeni istemci önce RPC'yi ve sonra statü
> güncellemesini yaparsa iki sürüm yarışında eski istemci, yeni istemcinin tamamladığı
> satırı yeniden `pending` yapabilir. Tersine, eski sıra korunursa claim ile RPC
> arasındaki process-kill/cevap-kaybı satırı `completed` bırakıp finansal işlemi hiç
> oluşturmadan listeden gizleyebilir. Kaynağı istemcide okuyup daha sonra claim etmek
> de eşzamanlı düzenlemede eski tutarı post etme (TOCTOU) penceresi bırakır.
>
> Bu nedenle migration'sız paket yalnız hazırlık/zarar azaltma fazıdır; S-02'yi
> kapatmaz. Nihai çözüm additive `complete_ileri_tarihli_islem_atomik` RPC'sidir:
>
> 1. Scheduled satırı işletme/id ile bulup `FOR UPDATE` kilitle.
> 2. Hem scheduled-update hem ilgili işlem-create yetkisini sunucuda doğrula.
> 3. İşlem verisini kilitli satırdan sunucuda üret; istemcinin eski snapshot'ını
>    finansal gerçek kabul etme.
> 4. Deterministik işlem ID'si + `source_ileri_id` ile idempotency'yi koru.
> 5. İşlem inserti, tüm bakiye bacakları, tahsis/avans motoru ve scheduled
>    `completed` statüsünü aynı Postgres transaction'ında tamamla.
> 6. Mevcut exact source kaydını güvenli başarı olarak tanı; farklı legacy ID'li
>    belirsiz kayıtta ikinci bakiye etkisi üretmeden açık hata ver.
> 7. Reminder'ı yalnız RPC'nin dayanıklı başarısından sonra istemcide iptal et.
>
> Bu RPC additive olacaktır; mevcut kolon, tablo veya RPC imzası silinmez/değişmez.
> Kullanıcı 27 Temmuz 2026 yedeğini teyit etmiş ve veri/kolon silmeyen migration'lar
> için her adımda yeni yedek gerekmemesi kararını 28 Temmuz'da vermiştir.

`source_ileri_id` için mevcut unique koruma:

`supabase/migrations/20260529000000_scheduled_transaction_idempotency.sql:21-27`

```sql
ALTER TABLE islemler
  ADD COLUMN IF NOT EXISTS source_ileri_id UUID
  REFERENCES ileri_tarihli_islemler(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS islemler_source_ileri_id_key
  ON islemler (source_ileri_id)
  WHERE source_ileri_id IS NOT NULL;
```

**Kabul testleri:**

- Her işlem tipi; özellikle cari satış/alış/tahsilat/ödeme ve çapraz kur.
- İkinci bakiye bacağında timeout, RPC cevabı kaybı, çift dokunma, iki cihaz yarışı.
- Aynı scheduled ID'yi tekrar tamamlama: tek işlem, tek bakiye etkisi, tek tahsis sonucu.
- Başarısız tamamlama: reminder kaybolmamalı, status geriye doğru tutarlı kalmalı.
- `_vade_birim_mahsuplu`, `islem_tahsis` ve cari bakiye sonuçlarının normal create ile
  eşitliği.

**Eski client — düzeltilmiş değerlendirme:** Yalnız mevcut create RPC'yi yeni
istemciden çağırmak eski binary'nin kendi kodunu değiştirmez; fakat iki sürüm aynı
scheduled satırda yarıştığında statü geri-alma sıraları birbirini etkileyebilir. Bu
yüzden “eski istemci etkilenmez” ifadesi tek başına yeterli değildir. Yeni completion
RPC additive olmalı, eski istemcilerin mevcut tablo/RPC sözleşmelerini bozmamalı ve
additive/veri-koruma kapısından geçmelidir. Eski 1.5.x istemci yeni RPC'yi çağırmaz; eski
non-atomic yolu kullanmaya devam eder. Yeni istemciyle tamamlanan satır ise DB
kilidi/idempotency sayesinde eski istemciden ikinci kez finansal etki üretmemelidir.

#### S-02 uygulama kaydı — 28 Temmuz 2026

**Canlı migration:** `20260728220238_complete_ileri_tarihli_islem_atomik`

Migration:

- yeni `complete_ileri_tarihli_islem_atomik(...)` RPC'sini ve yalnız tamamlanmış
  kaydın tekrar `pending/notified` yapılmasını engelleyen dar status trigger'ını ekledi;
- mevcut `create_islem_atomik(uuid,jsonb,jsonb)` imzasını ve gövdesini koruyup yalnız
  güvenli `search_path` sırasını sabitledi;
- kolon, tablo, kullanıcı işlemi veya finansal kayıt silmedi; backfill/toplu veri
  güncellemesi yapmadı;
- uygulama anında kullanıcı satırlarına DML çalıştırmadı. Fonksiyon gövdesindeki status
  güncellemesi yalnız kullanıcı daha sonra bir planı tamamladığında, aynı transaction
  içinde çalışır.

Yeni akışta işletme, scheduled satırı, üyelik ve bağlı varlıklar kilitli/güncel
sunucu verisinden doğrulanır. Tip, kuruş tutarı, bütün entity bacakları, para birimleri,
kur ve kaynak işlem birebir eşleşmeden başarı dönülmez. İşlem inserti, bakiye bacakları,
tahsis/avans motoru ve `completed` statüsü tek PostgreSQL transaction'ındadır. Nullable
`created_by` dahil bütün yetki kapıları `IS NOT TRUE` ile fail-closed'dur.

İstemci tarafında:

- yalnız dokunulan kart spinner gösterir; çift dokunma aynı anda ikinci mutation başlatmaz;
- global mutation retry kapalıdır; cevap kaybında tek ve salt-okunur exact-source probe
  yapılır;
- hatırlatıcı yalnız kalıcı başarı doğrulandıktan sonra silinir;
- çapraz kur istemi plan snapshot token'ı taşır; arada plan değişirse eski kur uygulanmaz;
- işlem tarihi kadar cihazın yerel saati de korunur;
- cari/personel ödeme ve tahsilat satırlarında tutar kaynak hesap para birimiyle gösterilir;
- Execute butonu görünürlük, sahiplik, `islemler` ve tipe bağlı kaynak-modül yetkilerinin
  tamamı varsa görünür.

**Canlı anonim envanter ve veri koruma sonucu:**

| Kontrol | Migration öncesi | Migration sonrası |
|---|---:|---:|
| Bekleyen/bildirilmiş plan | 17 | 17 |
| Tamamlanmış plan | 38 | 38 |
| `source_ileri_id` taşıyan işlem | 12 | 12 |

Tarihsel 38 tamamlanmış planın 26'sında kaynak pointer'ı yoktur; 12'si eski istemcinin
farklı UUID'li kaynak kaydıdır; migration öncesinde deterministik S-02 kaydı yoktu.
Yeni RPC bu tarihsel kayıtları tahmin ederek tekrar yazmaz. Bekleyen 17 planın dördü
eski/eksik entity biçimindedir: bir cari alışta cari, bir gelirde hesap, bir giderde
hesap, bir transferde hesap bacakları eksiktir. Bunlar sessiz yanlış bakiye üretmek
yerine “planı düzenleyin” hatası verir. Bekleyenlerde yabancı bağlı cari ve desteklenmeyen
para birimi bulunmadı.

**Eski 1.5.x etkisi:** Yeni RPC'yi çağırmadığı için eski ekranın normal yolu değişmez ve
mevcut RPC imzaları korunur. Bilinçli tek DB farkı, finansal kaynak oluşmuş tamamlanmış
bir planı eski istemcinin unique-error rollback'iyle yeniden `pending/notified` yapamamasıdır.
Eski istemcinin kendi non-atomic completion yolu değişmez; mümkün olduğunca yeni build
kullanılmalıdır.

**Kalan düşük riskler:** Bir hesap/cari/personel silme ile completion tam aynı anda
çalışırsa veya aynı iki hesap arasında ters yönlü iki transfer aynı anda tamamlanırsa
PostgreSQL deadlock detection işlemlerden birini bütünüyle geri alabilir. Yarım bakiye
kalmaz; kullanıcı yeniden dener. Eski/doğrudan istemci tamamlanmış parent satırı
silebilirse mevcut `ON DELETE SET NULL` sözleşmesi kaynak pointer'ını kaldırabilir.
Yeni istemcinin update/delete hook'ları yalnız `pending/notified` satırlara izin verir.

**Cihaz kabulü:** Kullanıcı 29 Temmuz 2026'da yeni akışı onayladı. Aşağıdaki matris
regresyon kontrol listesi olarak korunur:

1. Ana sayfada geçerli bir ileri tarihli işlemi açıp “Gerçekleşti”ye bas. Eskiden bütün
   kartların butonu spinner olurdu; şimdi yalnız seçilen kart spinner olmalı.
2. İşlem tamamlanınca plan bir kez kaybolmalı, işlem listesinde bir satır oluşmalı ve
   ilgili hesap/cari/personel bakiyesi yalnız bir kez değişmeli.
3. Cari alış/satış/ödeme/tahsilat örneklerinde vade-kalan/tahsis sonucunu aynı işlemi
   normal ekleme barından oluşturduğun sonuçla karşılaştır.
4. Aynı butona hızlıca iki kez bas. Tek işlem ve tek bakiye etkisi oluşmalı.
5. Mümkünse iki cihazda aynı planı aynı anda tamamla. En fazla biri finansal yazım
   üretmeli; yenileme sonrası iki cihaz da tek işlemi görmeli.
6. Farklı para birimli bir planı tamamla. Kur ekranı açılmalı. Kur ekranı açıkken diğer
   cihazda planı düzenlersen onayda “plan değişti” uyarısı gelmeli ve finansal etki
   oluşmamalı.
7. Cari/personel ödeme-tahsilat kartındaki sembol cari/personel değil, seçilen kaynak
   hesabın para birimi olmalı. Tamamlanan işlem saati `00:00` değil gerçek yerel saat
   olarak görünmeli.
8. Ortak kullanıcıda kaynak modülü veya kayıt görünürlüğü kapalıysa Execute butonu
   görünmemeli; doğrudan çağrı denense bile “yetkiniz yok” dönmeli.
9. Tamamlama anında bağlantıyı kısa süre kesip geri aç. Yenileme sonrası duplicate
   oluşmamalı; başarısız yazımda reminder kaybolmamalı.
10. Eksik eski planlardan biri test edilecekse önce Düzenle ile eksik hesap/cari bacağını
    seç; sonra tamamlama yeniden denenmelidir.

---

## I.4. Yerleşim, safe-area ve liste stabilitesi

### S-03 — Ana “Ekle” sheet'inin boyu

**Durum: Küçük ekran/büyük yazı düzeltmesi ve otomatik doğrulama tamamlandı; cihaz
kabulü açık.**

Güncel sheet sabit yükseklik kullanmıyor ve yalnız gerçek modal safe-area kadar boşluk
ekliyor:

`src/components/ui/ActionSheet.tsx:288-295`

```tsx
<Animated.View
  style={[
    styles.sheet,
    { paddingBottom: Math.max(insets.bottom, spacing.lg) },
    sheetAnimatedStyle,
  ]}
>
```

Ortak Modal sarmalayıcısı, iOS native modal içinde görünmeyen tab bar yüksekliğinin
safe-area olarak taşınmasını özellikle sıfırlıyor:

`src/components/ui/Modal.tsx:22-26`

```tsx
<RNModal {...props}>
  <ModalInsets>{children}</ModalInsets>
</RNModal>
```

`src/components/ui/ModalInsets.tsx:22-31`

```tsx
// modalın alt ağacı için SafeAreaInsetsContext'i GERÇEK değerle yeniden sağlanır.
<SafeAreaInsetsContext.Provider value={real}>{children}</SafeAreaInsetsContext.Provider>
```

İlk incelemedeki “sabit height yok” tespiti doğruydu fakat yeterli değildi. Güncel
`ActionSheet` seçenek alanında `maxHeight` ve scroll olmadığı için küçük ekran veya
büyük sistem yazısında doğal içerik yüksekliği yine status bar/notch sınırını
aşabiliyordu.

#### S-03 uygulama kaydı — 30 Temmuz 2026

- Sabit height eklenmedi; sheet kısa içerikte yine yalnız içeriği kadar yükselir.
- `useWindowDimensions()` ile canlı pencere yüksekliği kullanılır. Sheet üst sınırı,
  gerçek modal `insets.top` ve görsel nefes payı düşülerek hesaplanır; rotasyon ve
  farklı ekran boyları statik modül sabitine bağlı kalmaz.
- Yalnız seçenek listesi `ScrollView` içinde küçülüp kayar. Tutma alanı, başlık,
  ayraç ve **İptal** düğmesi sabit kalır.
- Aşağı sürükleyerek kapatma gesture'ı yalnız üst tutma alanından başlatılır; seçenek
  listesinin dikey kaydırması paneli yanlışlıkla kapatmaz.
- Büyük yazı ölçeğinde seçenek etiketi iki, açıklaması üç satıra kadar alan kullanır.
- Ortak `Modal → ModalInsets` zinciri ve iOS modal-üstü-modal yasağı korunur.
- Cihazdaki ikinci görsel kontrolde dört seçenekli ana **Ekle** panelinin normal yazı
  boyutunda hâlâ gereğinden uzun kaldığı görüldü. Kök neden satır aralıkları değil,
  `ActionSheet` bileşenindeki inset hook'unun döndürdüğü modal ağacının dışında
  çalışmasıydı. Bu nedenle `ModalInsets` sağlayıcısı yerleşim hesabını değiştiremiyor,
  ana tab bar'ın 72 puanlık payı İptal düğmesinin altına sızıyordu.
- `useModalSafeAreaInsets()` ile sheet hesabı doğrudan gerçek kök inset'ine bağlandı.
  Hayalet 72 puan kaldırıldı; seçenek satırlarının rahat dokunma aralıkları korunarak
  panelin üst kenarı aşağı indirildi.

**Eski davranış → yeni davranış:** Eskiden kısa içerik normal görünse de küçük
ekran/büyük yazıda seçenekler yukarı taşabiliyor ve kaydırılamıyordu. Şimdi kısa
panel gereksiz uzamaz; uzun panel status bar/notch altında kalır ve yalnız seçenekler
kaydırılır.

**Otomatik doğrulama:** Yeni `actionSheetLayoutContract.test.ts` 5/5 geçti. Son tam
kontrolde TypeScript temiz, ESLint 0 hata (mevcut 104 uyarı), Jest 106 suite / 1562
test ve iOS Metro export temizdir.

**Telefon kabul testi:** Ana sayfa üst **Ekle** panelini normal ve en büyük sistem
yazısıyla aç. iPhone SE boyutu/Android küçük ekran ve home-indicator'lı iPhone'da
panel status bar'a taşmamalı; **İptal** altta sabit kalmalı; seçenek listesi
kaydırılmalı. Liste kaydırılırken panel kapanmamalı, üst tutma çizgisinden aşağı
sürüklenince kapanmalıdır.

**Veri ve eski istemci etkisi:** Migration/veri yazımı yoktur. 1.5.x ve mevcut
kayıtlar etkilenmez; yeni görünüm yalnız yeni istemcidedir.

### S-04 — Buton ile klavye arasındaki ölü alan

**Durum: Bütün ana form ailelerinde istemci düzeltmesi ve 30 Temmuz tam envanter
denetimi tamamlandı; cihaz kabulü açık.**

Ortak hook klavye açıkken tab bar/home-indicator payını sıfırlıyor:

`src/hooks/useFooterBottomPadding.ts:23-35`

```ts
const show = Keyboard.addListener(showEvt, () => setKeyboardVisible(true));
const hide = Keyboard.addListener(hideEvt, () => setKeyboardVisible(false));
...
return keyboardVisible ? 0 : insets.bottom;
```

Hesap formu sabit footer'da bunu kullanıyor:

`src/app/hesaplar/ekle.tsx:209-216`

```tsx
// klavye açıkken tab bar/home indicator klavyenin altında kalır,
// eklenirse footer ile klavye arasında kocaman boşluk açılır.
<View style={[styles.footer, { paddingBottom: spacing.md + footerInset }]}>
```

Ürün ve kategori formlarında butonlar hâlâ ScrollView içindedir:

`src/components/urun/UrunForm.tsx:240-255`

```tsx
{/* Buttons */}
<View style={styles.buttons}>...</View>
</ScrollView>
```

`src/app/kategoriler/ekle.tsx:294-315`

```tsx
{/* Buttons */}
<View style={styles.buttons}>...</View>
</ScrollView>
```

Kategori formunda diğer native-header formlarındaki `keyboardVerticalOffset` da yok:

`src/app/kategoriler/ekle.tsx:105-110`

```tsx
<Screen>
  <KeyboardAvoidingView
    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    style={styles.keyboardView}
  >
```

**Çözüm:**

- Ortak form iskeleti: `KeyboardAvoidingView + ScrollView + KAV içinde sabit footer +
  useFooterBottomPadding`.
- Ürün ve kategori ekle/düzenle bu sözleşmeye taşınmalı.
- Kategori ailesine native header'a göre hesaplanan `keyboardVerticalOffset` eklenmeli.
- Klavye açıkken footer–klavye arası yalnız görsel `spacing.md` (yaklaşık 12–16 px);
  kapalıyken home indicator/tab bar temiz kalmalı.

#### S-04 uygulama kaydı — 29 Temmuz 2026

İlk rapor ürün ve kategori formlarını işaretliyordu. Uygulama öncesi güncel rota
matrisi tekrar tarandığında aynı eski desenin erişilebilir işlem/ayar rotalarında ve
bazı native modal alt ağaçlarında da sürdüğü doğrulandı. Bu nedenle yalnız ekran
görüntüsündeki form değil, aynı kök nedeni taşıyan yüzeyler birlikte kapatıldı.

**Uygulanan istemci sözleşmesi:**

- Ürün ekle/düzenle, kategori ekle/düzenle, gelir ekle, işlem düzenle, işletme
  bilgileri ve davet oluşturma ekranlarında Kaydet/İptal/Oluştur aksiyonları
  `ScrollView` dışına, fakat `KeyboardAvoidingView` içine alındı.
- Bu footer'lar `useFooterBottomPadding` kullanıyor. Klavye açıkken tab bar/home
  indicator payı `0`; görsel aralık yalnız `spacing.md`. Klavye kapalıyken gerçek alt
  güvenli alan korunuyor.
- Ürün toplu giriş/çıkış, foto-import inceleme ve yukarıdaki native-header
  formlarına `insets.top + 44` klavye ofseti eklendi. Foto-import inceleme ekranının
  sabit footer'ı artık `KeyboardAvoidingView` içindedir.
- Hesap silme yıkıcı akışında buton kasıtlı olarak scroll içinde bırakıldı; yalnız
  klavye açıkken hayalet alt payı sıfırlandı ve header ofseti eklendi.
- İşlem düzenleme picker listeleri, şifre değiştirme ve not ekleme modalları
  safe-area değerini artık native `Modal` alt ağacında okuyor. Sayfadan taşınan
  yaklaşık 72 px tab-bar payı modal içine sızmıyor.
- Bakiye düzenleme modalı klavyeye bağlandı; otomatik odaklanan tutar alanı açıldığında
  aksiyonlar klavyenin arkasında kalmıyor.
- Quick Transaction Bar, Daily Cash, kur ve pending işlem yüzeylerinin kendi klavye
  ölçüm motorlarına dokunulmadı.

Başlıca değişen yollar:

- `src/components/urun/UrunForm.tsx`
- `src/app/kategoriler/ekle.tsx`
- `src/app/kategoriler/duzenle/[id].tsx`
- `src/app/islemler/gelir.tsx`
- `src/app/islemler/duzenle/[id].tsx`
- `src/app/urunler/toplu-giris.tsx`
- `src/app/urunler/toplu-cikis.tsx`
- `src/app/foto-import/review.tsx`
- `src/app/ayarlar/isletme.tsx`
- `src/app/ayarlar/davet-olustur.tsx`
- `src/app/ayarlar/hesap-sil.tsx`
- `src/components/auth/ChangePasswordModal.tsx`
- `src/components/notes/NoteInputModal.tsx`
- `src/components/detail/BalanceEditorModal.tsx`

**Eski davranış → yeni davranış:**

- Eski: Kaydet/İptal butonları kaydırılan içeriğin parçasıydı; klavye açılınca
  butonlardan sonra tab bar + safe-area kaynaklı yaklaşık 72–118 px ölü alan
  kalabiliyordu.
- Yeni: Ana form aksiyonları klavyenin hemen üstündeki sabit footer'da kalır; uzun
  form alanları bu footer'ın arkasında kalmadan ayrıca kaydırılır.
- Eski: Bazı modal listeleri sayfa seviyesinde hesaplanan tab-bar payını native
  modalın içine taşıyordu.
- Yeni: Modal inset'i modal sağlayıcısının altında okunur; yalnız gerçek sistem
  güvenli alanı kullanılır.

**Otomatik doğrulama:**

- `src/lib/__tests__/formFooterContract.test.ts`: 22/22 sözleşme testi geçti.
- `npm.cmd run typecheck`: geçti.
- `npm.cmd run lint`: 0 hata, mevcut backlog'da 110 uyarı.
- Jest: 41/41 suite, 701/701 test geçti.
- Metro iOS: 4.071 modül temiz bundle edildi.
- `git diff --check`: geçti.

**Veri ve eski istemci etkisi:** Migration, tablo/kolon/RPC değişikliği ve veri DML'i
yoktur. Mevcut kullanıcı kayıtları ile işlemlerine dokunulmadı. Eski client aynı
yerleşimle çalışmaya devam eder; yeni yerleşim yalnız bu istemci paketini alan
cihazlarda görünür.

**Telefon kabul testi:**

1. Ürün ve Kategori için hem Ekle hem Düzenle ekranını aç; en alttaki metin/tutar
   alanına dokun. Eski sürümdeki geniş boşluk yerine butonlarla klavye arasında
   yaklaşık 12–16 px kalmalı.
2. Klavyeyi kapat. Footer home indicator veya cam tab bar'ın altında kalmamalı.
3. Uzun formu yukarı/aşağı kaydır; son alan footer'ın arkasında saklanmamalı, footer
   sabit kalmalı.
4. Ana Sayfa → gelir ekleme ve herhangi bir işlem → Düzenle ekranında aynı testi yap.
   İşlem düzenleme içindeki hesap/cari/personel picker'larını da aç; listenin altında
   büyük beyaz boşluk olmamalı.
5. Ürünler → Toplu Giriş ve Toplu Çıkışta miktar/fiyat klavyesini aç; alt özet ve
   Kaydet aksiyonu klavyenin arkasında veya gereksiz yüksekte kalmamalı.
6. Fotoğraf içe aktarma incelemesi, Ayarlar → İşletme Bilgileri, Davet Oluştur,
   Hesabı Sil, şifre/not ve bakiye düzenleme modallarını dolaş.
7. En az bir home-indicator'lı iPhone ve bir Android cihazda tekrarla. Her yüzeyde
   klavye açık/kapalı geçişi zıplamadan çalışmalıdır.

#### S-04 yeniden denetim — 30 Temmuz 2026

Raporun tüm güncel form envanteri yeniden tarandı. Hesap, Cari, Personel, Ürün,
Kategori ekle/düzenle; Gelir Ekle, İşlem Düzenle, İşletme, Davet ve foto-import olmak
üzere 14 ana yüzeyde footer `ScrollView` sonrasında fakat `KeyboardAvoidingView`
içinde; `insets.top + 44` iOS ofseti ve `spacing.md + footerInset` alt sözleşmesi
mevcuttur. Ürün toplu giriş/çıkış ile Personel toplu gider/ödeme aynı sabit-footer
desenindedir.

Hesap Silme yıkıcı scroll-içi akış; auth/ilk kurulum bağımsız scroll formları; QTB,
Kredi Kartı, Daily Cash, pending import ve Quick Ürün ise kendi ölçülmüş klavye
motorları nedeniyle bilinçli istisnadır. Native modal yüzeyleri ortak
`Modal → ModalInsets` zincirinden gerçek safe-area alır; wrapper dışından doğrudan
React Native `Modal` import eden uygulama yüzeyi kalmamıştır.

Yeni üretim değişikliği gerekmedi. `formFooterContract.test.ts` 22/22; yetki dışı
birleşik hedef tur 175/175 yeşildir. S-04'te kalan tek adım yukarıdaki gerçek cihaz
matrisidir.

### S-05 — Detay/rapor/ekleme ekranlarının üste taşması

**Durum: Nested-layout kaynaklı üretim hatası düzeltildi; bütün dosya-bazlı route
envanteri 125 otomatik safe-area sözleşmesine alındı, cihaz kabulü açık.**

Kök Stack varsayılanı güvenli olmayan biçimde header'sızdır:

`src/app/_layout.tsx:320-323`

```tsx
<Stack
  screenOptions={{
    headerShown: false,
```

Fakat örneğin cari detay açıkça native header kullanır:

`src/app/_layout.tsx:362-377`

```tsx
<Stack.Screen
  name="cariler/[id]"
  options={{
    presentation: 'card',
    headerShown: true,
    ...
  }}
/>
```

Raporlar da açıkça kayıtlıdır:

`src/app/_layout.tsx:514-525`

```tsx
<Stack.Screen
  name="raporlar/index"
  options={{
    headerShown: true,
    ...
  }}
/>
```

`Screen` native header'lı yüzeye ikinci inset eklememeyi bilinçli sözleşme yapıyor:

`src/components/ui/Screen.tsx:37-50`

```tsx
// Native Stack header'ı OLAN ekranlarda gerekmez
top?: boolean;
...
<View style={[styles.container, top && { paddingTop: insets.top }, style]}>
```

**Karar:** Bütün detaylara körlemesine `<Screen top>` eklenmemeli; çift üst boşluk
üretir. Önce route matrisi gerçek cihazda doğrulanmalı. CI'ye şu statik sözleşme
eklenmeli: her page ya root/nested Stack'te `headerShown:true` olmalı ya da custom
header + açık safe-area kalıbı kullanmalı.

**Ek tutarsızlık:** Cari detay “native glass pilotu” route seviyesindeki
`headerStyle`'ı kaldırıyor, fakat root hâlâ
`headerStyle: { backgroundColor: colors.surface }` miras bırakıyor
(`src/app/_layout.tsx:335` ve `:367-373`). Pilot açık `headerTransparent`/
`headerBlurEffect` ile ölçülmeli veya bütün native header'lar tek stile döndürülmeli.

**Cihaz matrisi:** Cari/Hesap/Personel/Ürün detayları, taksit/vade, bütün rapor
drill-down'ları ve ekle/düzenle ekranları; iPhone Dynamic Island, eski iPhone, Android
cutout, büyük yazı ve banner açık/kapalı.

#### S-05 uygulama kaydı — 29 Temmuz 2026

Güncel kod yeniden tarandı. Kullanıcının ekran görüntüsünü üreten tarihsel mekanizma
doğrulandı; ancak hedef detay, taksit/vade, rapor ve ekle/düzenle rotalarının tamamı
bugünkü kaynakta `headerShown: true` ile kayıtlıdır. Foto-import çocukları da kendi
nested Stack'inde açık native header kullanır. Bu nedenle üretim JSX'ine körlemesine
`<Screen top>` eklenmedi; böyle bir değişiklik düzelmiş rotalarda ikinci üst boşluk
üretirdi.

Yeni `src/lib/__tests__/safeAreaRouteContract.test.ts` şu sözleşmeyi kilitler:

- kök Stack'in `headerShown: false` varsayımı bilinçli ve görünürdür;
- 31 kritik detay/form/rapor rotası açıkça native header kullanır;
- bu 31 sayfa native header üstüne ikinci `<Screen top>` eklemez;
- foto-import `index` ve `review` çocukları nested header altında kalır.

**Eski davranış → yeni davranış:**

- Eski tarihsel hata: rota kaydı unutulursa ilk kart status bar/saat/LTE alanına
  taşabiliyor, başlık ve geri düğmesi görünmüyordu.
- Güncel davranış: tek native başlık/geri düğmesi görünür; içerik header'ın altında
  başlar ve ikinci boş üst bant oluşmaz.
- Yeni koruma: aynı hata kritik rota matrisinde yeniden oluşursa 64 sözleşme testinden
  biri CI/Jest sırasında kırılır.

**Telefon kabul testi:** Cari/Hesap/Personel/Ürün detayları; Taksit, Vade ve taksit
detayı; Raporlar ana sayfası + hesap/kategori drill-down + Genel/Gelir-Gider; ana
ekle/düzenle ekranları sırayla açılmalıdır. Her ekranda tek başlık/geri düğmesi,
status bar altında temiz başlangıç ve fazladan üst bant olmaması beklenir. Dynamic
Island, eski iPhone ve Android cutout ile; kırmızı ağ banner'ı açık/kapalı tekrarlanır.

**Veri etkisi:** Yalnız Jest sözleşmesi eklendi. Migration, uygulama verisi ve üretim
JSX davranışı değiştirilmedi.

#### S-05 tam route envanteri — 30 Temmuz 2026

İlk 31 kritik rota kontrolü bütün `src/app` sayfa envanteriyle karşılaştırıldı. Kalan
17 root-native rota da sözleşmeye alındı: İşlemler/Notlar/Nakit Akışı/Kategoriler ana
yüzeyleri; ayarlar, yasal ve yardım sayfaları; Personel toplu/izin ekranları; Hesap
Silme, Data Import, Mutabakat ve Arşiv bunlara dahildir.

Güncel otomatik sınır:

- 7 doğrudan root-native ve 41 guarded-nested header rotası non-transparent tek
  native header kullanır.
- Davet Oluştur, Paylaşılan İşletmeler ve İşlem Geçmişi page-level native-header
  istisnası olarak ayrıca doğrulanır.
- Header'sız `(auth)` ve onboarding/kurulum yüzeyleri açık `<Screen top>` kullanır.
- `(tabs)` ve Ürünler ana listesi ölçülen `TabHeader` yüksekliğiyle safe-area'yı bir
  kez uygular.
- Foto-import çocukları nested Stack native header'ı altında kalır.
- Native-header sayfalarında ikinci `<Screen top>`, `paddingTop: insets.top`,
  top-edge `SafeAreaView` veya transparent header sözleşme ihlalidir.
- Yeni standalone sayfa bu sınıflardan birine açıkça eklenmezse dosya-bazlı test
  kırılır.

Güncel üretim JSX/layout kodunda kesin bir üst-taşma veya çift inset bulunmadığı için
spekülatif padding eklenmedi. Cari glass pilotu için belirsiz miras yerine mevcut
tek, opaque native-header sözleşmesi korundu.

#### S-05 cihaz bulgusu ve kök neden düzeltmesi — 30 Temmuz 2026

Önceki statik envanter yanlış bir güven üretmişti: yetki/deep-link koruması için
`hesaplar/_layout.tsx`, `cariler/_layout.tsx` gibi klasör layout'ları eklendikten sonra
Expo Router bu klasörlerin altında **yeni bir navigasyon seviyesi** kurar. Bu durumda
kök Stack'teki `hesaplar/[id]` kaydı artık çocuğun header'ını yönetmez; kök yalnız
`hesaplar` layout'unu görür. Sayfa içindeki `<Stack.Screen options={...}>` de en yakın
yerel Stack bulunmadığı için header'ı açamıyordu. Sonuç; başlık/geri düğmesi yok,
ilk özet kartı status bar ve Dynamic Island arkasında.

Uygulanan düzeltme:

- Ortak `GuardedRouteStack` aynı `ModuleRouteGuard`/`OwnerRouteGuard` kapılarını
  değiştirmeden onların içine gerçek bir Expo Router `Stack` yerleştirir.
- Header açık, `headerTransparent: false` ve safe-area'yı native header yönetecek
  şekilde ortak sözleşme tanımlandı.
- Hesap, Cari, Personel, Ürün, Raporlar, Taksit, Vade, Mutabakat, Nakit Akışı,
  Notlar, Arşiv, İşlemler, Kategoriler ve Data Import layout'ları çocuk rotalarını
  `[id]`, `ekle`, `duzenle/[id]` gibi **yerel adlarıyla** kaydeder.
- Özel `TabHeader` kullanan Ürünler ana listesi, çift header oluşmaması için yerel
  Stack'te açıkça `headerShown: false` kalır.
- Sayfalara körlemesine `<Screen top>` eklenmedi; native header altında ikinci üst
  boşluk oluşmaz.
- Mutabakatın Cariler kapısı dahil mevcut fail-closed yetki davranışı ayrı sözleşme
  testiyle korunur.

**Eski davranış → yeni davranış:** Eskiden header kaydı yanlış navigasyon seviyesinde
olduğu için detay kartı saat/LTE/Dynamic Island alanına giriyordu. Şimdi tek native
başlık ve geri düğmesi önce çizilir; özet kartı onun altında başlar.

**Otomatik doğrulama:** `safeAreaRouteContract.test.ts` 125/125; hedef yetki-kapısı
turuyla 130/130. Tam kontrolde TypeScript temiz, ESLint 0 hata (mevcut 104 uyarı),
Jest 106 suite / 1565 test ve iOS Metro 4094 modül temizdir.

**Veri ve eski istemci etkisi:** Migration/veri yazımı yoktur. Mevcut kullanıcı
işlemleri değişmez. 1.5.x eski istemciler aynı davranışı sürdürür; düzeltme yalnız
yeni istemci paketinde görünür.

### S-05B — Arama çubuğunun tam genişlikte dokunma alanı

**Durum: İstemci düzeltmesi ve otomatik sözleşme testi tamamlandı; cihaz kabulü açık.**

Kategori seçici ekranındaki sorun yalnız o modalın yerleşiminden kaynaklanmıyordu.
Arama kapsülünün tamamı görünür bir kontrol olmasına rağmen bazı yüzeylerde yalnız
`TextInput` metin alanı odaklanıyordu. Büyüteç ikonuna, kapsülün sağ/sol iç boşluğuna
veya metnin dışındaki beyaz alana dokunmak klavyeyi açmıyordu.

Uygulanan ortak davranış:

- `ModalSearchBar` kapsülünün tamamı `Pressable` oldu. Böylece Kategori, Hesap, Cari,
  Personel, Ürün, Birim ve İkon seçicileri; rapor filtreleri; toplu ürün işlemleri;
  fotoğraf/veri içe aktarma ve kredi kartı/QTB picker'ları tek ortak düzeltmeden
  yararlanır.
- Altı ana liste yüzeyindeki `FloatingSearchBar` aynı tam-kapsül davranışında tutuldu.
- Ortak bileşeni kullanmayan Genel Arama ekranı ile eski İşlem Düzenle ekranındaki
  Hesap/Cari/Personel aramaları da aynı sözleşmeye geçirildi.
- Temizleme `X` düğmesi kendi olayını durdurur, metni temizler ve odağı korur; kapsül
  tıklamasıyla ikinci bir işlem tetiklenmez.
- Arama, filtreleme, klavye yerleşimi ve veri sorguları değiştirilmedi.

**Eski davranış → yeni davranış:** Eskiden yalnız yazının bulunduğu dar alana
dokunulduğunda yazmaya başlanıyordu. Şimdi büyüteç dahil arama kapsülünün görünen
genişliğinde herhangi bir boş noktaya dokunmak input'u odaklar ve klavyeyi açar.

**Otomatik doğrulama:** Yeni
`src/lib/__tests__/searchBarTapTargetContract.test.ts` 5/5 geçti. TypeScript temiz;
ESLint 0 hata, mevcut backlog 104 uyarıdır. Tam Jest 107 suite / 1570 test; iOS Metro
4094 modül ile temiz paketlendi.

**Telefon kabul testi:**

1. Cariler → herhangi bir işlem akışı → Kategori seçicisini aç.
2. Önce büyüteç ikonuna, sonra placeholder yazısının sağındaki boş beyaz alana dokun.
   Her iki dokunuşta da klavye açılmalı ve yazılan metin kategori listesini süzmeli.
3. Birkaç harf yazıp `X` ile temizle. Metin silinmeli; klavye kapanmamalı ve hemen
   yeniden yazabilmelisin.
4. Aynı kontrolü QTB içindeki Hesap/Cari/Personel/Ürün seçicilerinden birinde ve ana
   Cariler/Personel/Ürünler listesinin alttaki arama kapsülünde tekrarla.
5. Daha → Genel Arama ve mevcut bir işlem → Düzenle → Hesap/Cari/Personel seçicilerinde
   kapsülün kenar ve ikon bölgelerine dokunarak aynı davranışı doğrula.

**Veri ve eski istemci etkisi:** Migration, tablo/kolon/RPC veya veri yazımı yoktur.
Mevcut kayıtlar etkilenmez; 1.5.x eski istemciler eski dokunma alanıyla çalışmayı
sürdürür, iyileştirme yalnız yeni istemci paketindedir.

### S-06 — Hızlı scroll sonrası satırların kendiliğinden hareketi

**Durum: İki istemci paketi ve otomatik doğrulama tamamlandı; 30 Temmuz cihaz turu
olumlu, regresyon izlemi açık.**

1. **Banner reflow:** S-01'deki banner Stack'in üstünde normal akışa girip çıkarak
   viewport'u değiştiriyor. Kullanıcının “dokunmadan hareket” tarifini doğrudan
   üretebilir.
2. **iOS clipping:** Cari ve personel dinamik satırlarda koşulsuz
   `removeClippedSubviews={true}` kullanıyor:

   `src/app/(tabs)/personel.tsx:776-783`

   ```tsx
   windowSize={5}
   removeClippedSubviews={true}
   extraData={{ selectedIds, isSelectMode, sortBy, expandedPersonelId }}
   contentContainerStyle={[..., { paddingTop: headerH, ... }]}
   ```

   Ürün listesi aynı ayarı yalnız Android'de açıyor:

   `src/app/urunler/index.tsx:785-789`

   ```tsx
   windowSize={5}
   removeClippedSubviews={Platform.OS === 'android'}
   ```

3. **Asenkron satır yüksekliği:** Personel ana listeye ek olarak izin kotasını ayrı
   query'den alıyor (`src/app/(tabs)/personel.tsx:107-109`) ve veri gelince yeni meta
   satırı çiziyor:

   `src/app/(tabs)/personel.tsx:645-674`

   ```tsx
   {hasMeta && (
     <View style={styles.personelMeta}>
       ...
       {hasLeave && (...)}
     </View>
   )}
   ```

   Carilerde vade bilgisi de ayrı query'den sonra iki satır ekliyor
   (`src/app/(tabs)/cariler.tsx:844-859`).
4. **Header ve sıralama değişimi:** Ölçülen `headerH`, listede `paddingTop` olarak
   sonradan uygulanıyor; personel sayısı yüklenince subtitle header yüksekliğini
   değiştirebilir. Comparator'larda tie-breaker yok:

   `src/app/(tabs)/personel.tsx:399-402`

   ```ts
   return a.first_name.localeCompare(b.first_name, 'tr');
   ```

   `src/app/(tabs)/cariler.tsx:555-558`

   ```ts
   return a.name.localeCompare(b.name, 'tr');
   ```

   Ürün “en fazla alış/satış” sırası ikinci özet query geldikten sonra baştan
   değişebilir (`src/app/urunler/index.tsx:280-301`).

**İnceleme/düzeltme sırası:**

1. `onMomentumScrollBegin/End`, `contentOffset`, `contentSize`, `headerH`, `isOffline`
   ve ikincil query completion zamanlarını debug build'de tek olay akışına yaz.
2. Banner'ı overlay/sabit alana al ve aynı testi tekrarla.
3. Cari/Personel'de iOS için clipping'i kapatarak A/B yap; `windowSize=5` korunabilir.
4. Header subtitle alanını baştan rezerve et veya momentum sırasında padding farkını
   offset ile kompanse et.
5. İkincil meta satırlarına sabit geometri/skeleton ayır veya snapshot'ı momentum
   bitince uygula.
6. Her comparator'a deterministik tam ad + `id` tie-breaker ekle. Özet bazlı ürün
   sıralamasını veri hazır olmadan değiştirme.
7. Bakiye sırası seçiliyken refetch/mutation sonucu sıralamayı momentum sonuna kadar
   dondur.
8. Bütün listeleri hemen FlashList'e taşımak yerine önce bu nedenleri izole et.

**Kabul testi:** Cold/warm cache, 650+ kayıt, ekran açılır açılmaz hızlı fling, en az
35 saniye bekleme, pull-to-refresh, izin/vade/özet query'si tamamlama, aynı isim/bakiye,
expand/collapse, Wi‑Fi↔LTE ve foreground dönüşü. Ekran kaydı ile log timestamp'leri
eşleştirilmelidir.

#### S-06 güvenli ilk paket — 29 Temmuz 2026

Güncel kod teyidi, ilk rapordaki banner reflow şüphesinin S-01 ile kapanmış olduğunu
gösterdi: ağ banner'ı artık Stack akışının dışında absolute overlay'dir. Cihaz kaydı
olmadan asenkron satır geometrisini tahmin ederek sabitlemek yerine yalnız kesin ve
düşük riskli dört neden ele alındı:

1. Cari üç nokta menüsünün `mergedCariler` oluşturulmadan önce onu okuyabildiği TDZ
   sırası düzeltildi; memo artık birleşik listenin altında ve doğru dependency ile
   çalışır.
2. Cari ve Personel `removeClippedSubviews` ayarı Ürün listesiyle eşitlendi: iOS'ta
   kapalı, yalnız Android'de açıktır. `windowSize=5` korunur.
3. Cari/Personel `extraData` objeleri memoize edildi; her parent render'ında yeni obje
   yüzünden bütün görünür satırlar gereksiz yeniden değerlendirilmiyor.
4. Cari, Personel ve Ürün sıralamaları ortak saf helper'a taşındı. Aynı ad/bakiye/
   alış-satış metriğinde tam ad + `id` tie-breaker kullanılır; refetch'in kaynak satır
   sırası artık görünür sırayı değiştirmez.

Yeni yollar:

- `src/lib/listSorting.ts`
- `src/lib/__tests__/listSorting.test.ts`
- `src/lib/__tests__/listStabilityContract.test.ts`

**Eski davranış → yeni davranış:**

- Eski: aynı ad ve aynı bakiyedeki kayıtlar comparator'dan `0` alıyor, sunucudan geliş
  sırası değişince ekranda yer değiştirebiliyordu.
- Yeni: eşitlikte stabil `id` sırası kullanılır.
- Eski: iOS clipping ile sonradan büyüyen satırların birleşimi görünür satır kaybı/
  sıçramayı artırabiliyordu.
- Yeni: iOS satırları clip etmez; Android performans ayarı korunur.
- Eski: Cari aksiyon menüsü birleşik liste değişkeninin initialization sırasına
  bağlıydı ve menü açılışında TDZ crash riski taşıyordu.
- Yeni: menü yalnız birleşik liste hazırlandıktan sonra hesaplanır.

**Otomatik doğrulama:** Saf sıralama + kaynak sözleşmesi 10/10 test geçti. Paket
geneliyle TypeScript geçti; ESLint 0 hata/109 mevcut uyarı; Jest 44/44 suite,
775/775 test; Metro iOS 4.072 modül; `git diff --check` temizdir.

**Açık kalan kök izolasyonu:** Cari vade metası, Personel izin metası, ölçülen
`headerH` ve Ürün dönem özeti ayrı sorgular tamamlandığında gerçek satır
geometrisi/sırası hâlâ değişebilir. Bunlar spekülasyonla dondurulmadı. Aşağıdaki
telefon turu hangi ikinci paketin gerektiğini ayıracaktır.

**Telefon kabul testi:**

1. Aynı isimli ve aynı bakiyeli birkaç Cari/Personel kaydıyla listeyi yenile; sıra
   değişmemeli.
2. Cari üç nokta menüsünü hem kendi carinde hem bağlantılı caride aç; crash olmamalı
   ve doğru aksiyonlar görünmeli.
3. iPhone'da Cari ve Personel ekranını cold cache ile açıp hemen hızlı fling yap;
   satırlar kaybolmamalı.
4. Kaydırmayı bıraktıktan sonra 35 saniye bekle. Tam bu sırada vade/izin metası
   geldiğinde hareket sürüyorsa ekran kaydı alınmalı; bu ikinci paket için doğrudan
   geometri kanıtıdır.
5. Ürünlerde “En fazla alış/satış” seçip dönemi değiştir. Özet yüklenirken ikinci bir
   sıralama olursa bu da ayrıca kaydedilmelidir.

**Veri ve eski istemci etkisi:** Migration veya veri yazımı yoktur. Liste yalnız yeni
clientta daha deterministik çizilir; kayıtların kendisi, bakiyeleri ve işlemleri
değişmez.

#### S-06 asenkron geometri ikinci paketi — 30 Temmuz 2026

İlk paket sonrasında açık bırakılan dört mekanizma güncel kodda tekrar doğrulandı:
Cari vade rozeti, Personel izin kotası, ölçülen cam-header yüksekliği ve Ürün dönem
özeti kullanıcı derin listede dururken tamamlanabiliyor; önceki kod bu yeni veriyi
hemen render ederek görünür satır yüksekliğini veya ürün sırasını değiştirebiliyordu.

Yeni `useTopAnchoredListSnapshot` sözleşmesi asenkron satır metası ile header
yüksekliğini birlikte yönetir:

- Drag, momentum veya listede tepe eşiğinin altında olmayan bir konum varken gelen
  değerler yalnız bekleyen snapshot'a alınır; görünür listeye uygulanmaz.
- Kullanıcı liste tepesine dönüp kısa süre durduğunda bekleyen meta ve header
  yüksekliği tek güncellemede uygulanır. Her scroll karesinde React state yazılmaz ve
  değişken yükseklikli satırlarla riskli `maintainVisibleContentPosition` kullanılmaz.
- İşletme, kullanıcı veya yetki kapsamı değişirse önceki scope'un metası bir render
  karesi dahi korunmaz; boş/yeni güvenli snapshot'a anında geçilir.
- Personel meta alanının ilk çizimdeki dikey sözleşmesi korunur; pull-to-refresh izin
  kotasını da yeniler.
- Ürün pill'leri ve “En Fazla Alış/Satış” comparator'ı aynı sabit dönem snapshot'ını
  kullanır. Özet hazır değilken metrik sıralama seçilemez; seçili metrikle dönem
  değişiminde alfabetik ara sıra göstermek yerine kısa skeleton çizilir.
- Dönem veya sıralama kullanıcı tarafından değiştirildiğinde liste bilinçli olarak
  animasyonsuz tepeye alınır. Ürün özet query anahtarı işletme + kullanıcı + yetki
  imzasıyla ayrılır ve diske persist edilmez.

**Eski davranış → yeni davranış:**

- Eski: Kullanıcı 30–40 satır aşağıdayken vade/izin/pill verisi gelirse satırlar
  büyüyebilir veya ürünler alfabetik sıradan metrik sıraya kendiliğinden geçebilirdi.
- Yeni: Derin konumdaki görünür satır ve sıra sabit kalır; yeni meta yalnız tepeye
  dönüşte tek seferde görünür.
- Eski: Rol/işletme değişiminde geniş kapsamlı eski ürün özetinin cache'den kısa süre
  görünme riski vardı.
- Yeni: Snapshot ve cache anahtarı tenant, kullanıcı ve yetki imzasıyla ayrıdır;
  önceki kapsamın özeti yeni kapsamda kullanılmaz.

**Otomatik doğrulama:** Hook davranışı, kaynak sözleşmesi, ürün sıralama/pill
birlikteliği ve ilk paket regresyonlarıyla birlikte ana oturumda 5 suite / 23 test
yeşil; telefon uyarısı paketiyle birleşik hedef tur 7 suite / 70 test yeşildir.
İlgili ESLint turu 0 hata / 2 mevcut hook-dependency uyarısı vermiştir.

**Telefon kabul testi:**

1. Cari ve Personel listelerini cold cache ile aç; ekran açılır açılmaz 30–40 satır
   aşağı hızlı fling yap ve en az 35 saniye bekle. Vade/izin bilgisi geldiğinde görünür
   satırlar hareket etmemelidir.
2. Liste tepesine dönüp kısa süre dur. Bekleyen vade/izin bilgisi tek yerleşim
   güncellemesiyle görünmelidir.
3. Ürünlerde “En Fazla Alış” seç, derine kaydır ve refresh/arka plan özetini bekle.
   Derindeyken sıra ve pill'ler değişmemelidir; tepeye dönünce birlikte güncellenmelidir.
4. Metrik sıra seçiliyken dönemi değiştir. Liste tepeye gitmeli; kısa skeleton
   sonrasında doğrudan doğru metrik sıra gelmeli, alfabetik ara sıçrama olmamalıdır.
5. Derin listedeyken işletme veya rol değiştir. Önceki işletme/rolün vade, izin veya
   ürün özeti yeni kapsamda kısa süre dahi görünmemelidir.

**Veri ve eski istemci etkisi:** Migration yoktur; hiçbir cari, personel, ürün,
işlem veya bakiye satırı okunup yeniden yazılmaz. 1.5.x istemci eski liste davranışını
sürdürür; aynı DB şeması ve verilerle uyumludur.

**30 Temmuz cihaz sonucu:** Kullanıcı liste kaymasının düzelmiş göründüğünü bildirdi.
Madde olumlu cihaz kabulüyle kapatıldı; seyrek zamanlama hatası tekrar görülürse aynı
cold-cache/derin-fling koşulunda ekran kaydıyla yeniden açılacaktır.

---

## I.5. Taksitli satış/alış kuruş planı

### S-07 — Belgeyle birebir taksit dağılımı

**Durum: İstemci uygulaması ve tam otomatik doğrulama tamamlandı; cihaz kabulü açık.**

UI yalnız adet ve ilk vadeyi saklıyor; satır bazlı plan yok. Hızlı adetler de yalnız
şunlar:

`src/components/transaction/QuickTransactionBar/QuickTransactionBar.tsx:883-905`

```tsx
{[2, 3, 4, 5, 6, 9, 12].map((n) => (
```

Önizleme tek metin ve küsuratı son taksite atıyor:

`src/components/transaction/QuickTransactionBar/QuickTransactionBar.tsx:906-920`

```ts
const per = roundCurrency(toplam / taksitAdetDraft);
const son = roundCurrency(toplam - per * (taksitAdetDraft - 1));
```

Submit aynı dağılımı yeniden hesaplıyor:

`src/components/transaction/QuickTransactionBar/hooks/useTransactionSubmit.ts:989-1001`

```ts
const taban = roundCurrency(toplam / adet);
const taksitler = Array.from({ length: adet }, (_, i) => ({
  ...
  tutar:
    i === adet - 1
      ? roundCurrency(toplam - roundCurrency(taban * (adet - 1)))
      : taban,
}));
```

Sunucu toplamı doğru biçimde zorunlu tutuyor:

`supabase/migrations/20260720180000_taksit_faz3.sql:314-332`

```sql
-- 2..48 satır ... tutar>0, Σ == amount
...
IF v_toplam <> round(r.amount, 2) THEN
  RAISE EXCEPTION 'Taksit toplami ... esit degil';
END IF;
```

Görseldeki belge dağılımı:

`₺6.452,47 + 9 × ₺6.452,49 = ₺64.524,88`

Mevcut istemci aynı toplamı ilk dokuz satır `₺6.452,49`, son satır `₺6.452,47` olarak
üretir. Sorun toplam kaybı değil, farkın hangi tarih/satırda olduğunun belgeyle
eşleşmemesidir.

**Migration'sız çözüm:**

- Saf bir `installmentDistribution` helper'ı; bütün matematik integer kuruşla.
- Gerçek tablo önizlemesi: sıra, vade, tutar ve satır düzenleme.
- Hızlı aksiyonlar: “Farkı ilk taksite al”, “Farkı son taksite al”, “Eşit dağıt /
  Sıfırla”.
- Kullanıcı bir satırı değiştirince satır kilitlenir:
  `kalan = toplamKurus - kilitliKurusToplami`; kalan, kilitsiz satırlara quotient +
  deterministik remainder ile dağıtılır.
- Birden çok satır kilitlenebilir. Kilitli toplam işlem toplamını aşarsa veya herhangi
  bir satır `< 1 kuruş` olursa Kaydet pasif olur.
- UI'da sürekli `Taksit toplamı / İşlem toplamı / Fark` gösterilir.
- Önizlemedeki dizi aynen submit payload'ı olur; submit yeniden hesaplamaz.
- Yaygın chip'lerin yanına `− / adet / +` stepper veya “Diğer” eklenir; server
  sözleşmesi olan 2–48 desteklenir. Bugün 10 seçeneği yoktur.
- `toplamKurus >= taksitAdedi` client guard'ı eklenir; örneğin `₺0,05 / 12` bugün
  `0,00` satır üretip server'da reddedilebilir.
- FIFO/vade/tahsis motoruna dokunulmaz; yalnız mevcut `p_taksitler` JSON'u üretilir.

**Jest sözleşmesi:**

- `64.524,88 / 10`; ilk satır `6.452,47` yapılınca kalan dokuzun `6.452,49` olması.
- `100 / 3`, `0,30 / 3`, `0,05 / 12`.
- Bir/çok kilitli satır, toplamı aşma, 2 ve 48 sınırları.
- Her durumda `Σ satırKurus === toplamKurus`.
- Önizleme dizisi ile RPC payload'ının birebir eşitliği.
- 31 Ocak→Şubat sonu→31 Mart tarih davranışı.

#### Uygulama kaydı — 29 Temmuz 2026

Migration'sız S-07 paketi uygulandı:

- `src/lib/installmentDistribution.ts` bütün para matematiğini integer kuruşla yapıyor,
  2–48 sınırını ve her satırın en az 1 kuruş olmasını zorluyor.
- `buildInstallmentPlan()` sıra, aylık vade ve tutarı tek committed plan içinde üretiyor.
  `validateInstallmentPlan()` güncel form toplamını, sıra/tarih/tutar/toplam
  invariantlarını kayıttan önce tekrar doğruluyor.
- QTB'deki tek metin önizlemesi, 48 satırı sanallaştırabilen düzenlenebilir tabloya
  dönüştürüldü. `−/+` stepper, `2/3/4/5/6/9/10/12` hızlı seçimleri, satır
  kilitleme/kilit açma ve “farkı ilk/son taksite al / eşit dağıt” aksiyonları eklendi.
- Bir satır değiştirildiğinde o satır sabitleniyor; kalan tutar diğer satırlara
  deterministik biçimde dağıtılıyor. Toplam, işlem toplamı ve fark sürekli gösteriliyor.
- Kod incelemesinde, satır klavyesi açıkken geçici `Fark` sıfır olmadığı için **Uygula**
  düğmesinin yanlışlıkla pasif kalabildiği ve kilit düğmesiyle blur işleminin yarışabildiği
  bulundu. Aktif satır artık saf motorla önceden doğrulanıyor; geçerliyse klavye açıkken
  kalan bütün satırlar ve `Fark` ekranda anında yeni dağılıma geçiyor; doğrudan
  **Uygula** çalışıyor. Kilit/adet/hızlı adet/vade kontrolleri aktif edit bitene kadar
  devre dışı ve `onEndEditing` doğrudan native event metnini commit ediyor.
- İşlem tutarı plan uygulandıktan sonra değişirse committed plan silinip normal satışa
  düşmüyor. Header “Güncelle” uyarısı veriyor ve plan yeniden uygulanana kadar submit
  yazma başlatmıyor.
- Aynı guard işlem tarihi için de geçerli: işlem tarihi ilk taksit vadesini geçerse plan
  stale oluyor, yeniden açılışta ilk vade yeni işlem tarihine göre kuruluyor ve submit
  eski tarih satırlarını RPC'ye gönderemiyor. Tarih karşılaştırması saatten değil takvim
  gününden yapılıyor.
- Eski iç içe taksit `Modal`ı kaldırıldı. Editör ana QTB modalı içinde absolute inline
  overlay; tarih seçici de satır içinde olduğu için iOS modal-üstü-modal donma sınıfı
  oluşturulmuyor.
- Android `adjustResize` penceresinde klavye yüksekliği ikinci kez düşülmüyor; iOS
  keyboard inset'i ve Android küçülmüş window yüksekliği ayrı tek kaynak kullanıyor.
  QTB programatik kapanırsa açık overlay/preview/edit state'i de tamamen sıfırlanıyor.
- `useTransactionSubmit` önizlemeyi yeniden bölmüyor. Aynı `plan.rows` dizisi hem
  idempotency fingerprint'ine hem `p_taksitler` RPC payload'ına gidiyor.

**Eski → yeni:** Eskiden kullanıcı yalnız adet ve ilk vade görür, son kuruş farkının
hangi satıra düştüğünü değiştiremezdi; ayrıca submit planı ikinci kez hesaplardı. Şimdi
her tarih/tutar görünür ve düzenlenebilir, önizlenen dizi kaydın tek gerçek kaynağıdır.

**Cihaz kabul testi:**

1. Yeni alış veya satışta `₺64.524,88` girip `10` taksit seç.
2. İlk satırı `₺6.452,47` yap. Yazarken kalan dokuz satırın her biri hemen
   `₺6.452,49`, fark `₺0,00` görünmeli. Klavyeyi ayrıca kapatmadan doğrudan
   **Uygula**'ya bas; düğme aktif olmalı.
3. “Farkı son taksite al”, “Farkı ilk taksite al” ve “Eşit dağıt” aksiyonlarını sırayla
   dene; toplam hiçbirinde değişmemeli.
4. `₺0,05 / 12` planında Uygula pasif ve en az 1 kuruş açıklaması görünür olmalı;
   `₺0,12 / 12` kabul edilmeli.
5. 48 taksit seçip küçük ekranda listenin kaydığını, satır düzenlerken klavyenin aktif
   satır/özet/butonları erişilemez bırakmadığını kontrol et.
6. Planı uygula, ana işlem tutarını değiştir ve Kaydet'e bas. “Güncelle” uyarısı
   görünmeli; RPC başlamamalı. Planı yeniden açıp uygula, ardından kayıt yapılabilmeli.
7. Planı uygula, sonra işlem tarihini ilk vadeden sonraki bir güne al. “Güncelle”
   görünmeli ve doğrudan Kaydet eski vadeyi yazmamalı; planı açınca ilk vade yeni işlem
   tarihinden önce olmamalı.
8. İlk vadeyi 31 Ocak seçilebilen bir test tarihinde kur; Şubat satırı ay sonu, Mart
   satırı ayın 31'i olmalı.

**Veri ve eski istemci etkisi:** Migration, kolon, RPC imzası veya mevcut veri yazımı
yoktur. 1.5.x istemci eski son-satır-artığı davranışını sürdürür. Yeni client da aynı
mevcut `p_taksitler` JSON sözleşmesini kullanır; FIFO/vade/tahsis motoru değişmedi.

**Eski client:** DB/RPC imzası değişmez. 1.5.x son satır artığı davranışına devam eder;
yeni istemcinin satırları aynı JSON sözleşmesiyle okunur.

---

## I.6. Yetki, paylaşım ve hata sözleşmesi

### S-08 — Raporlar kapalıyken dashboard gelir/gider tutarları

**Durum: İstemci, canlı RPC, otomatik doğrulama ve kullanıcı cihaz kabulü
tamamlandı.**

Güncel istemci rapor iznini hem sorguya hem görünüme geçiriyor:

`src/app/(tabs)/index.tsx:98-102`

```ts
const { canUpdate, canDelete, canAccessModule, isOwner } = usePermissions();
...
const canSeeReports = canAccessModule('raporlar');
```

`src/app/(tabs)/index.tsx:235-252`

```ts
useFinancialSummary(canSeeReports);
useMonthSummary('monthly', 0, undefined, canSeeReports);
...
enabled: canSeeReports,
```

`src/app/(tabs)/index.tsx:465-482`

```tsx
{canSeeReports && (
  <DashboardCarousel ... />
)}
```

Bu nedenle saha görüntüsü güncel HEAD ile aynı değildir; cihaz build'i
eşleştirilmelidir. Ancak bu yalnız UI savunmasıdır. Migration zinciri dashboard
fonksiyonunu özellikle gate dışında bırakıyor:

`supabase/migrations/20260716040000_rapor_rpc_modul_gate.sql:18-22`

```sql
-- Dashboard bu RPC'leri CAGIRMAZ
-- (get_income_expense_summary DASHBOARD tarafindan kullanildigi icin GATE'LENMEDI).
```

Repo zincirindeki ana gövde `SECURITY DEFINER` ve `p_isletme_id` ile agregasyona
giriyor:

`supabase/migrations/20260630000000_exclude_passive_entities_from_reports.sql:47-73`

```sql
LANGUAGE plpgsql
SECURITY DEFINER
...
FROM islemler i
...
WHERE i.isletme_id = p_isletme_id
```

Ancak canlı katalog snapshot'ı, `20260707100000` backfill'inin aktif üyelik/
çapraz-kiracı guard'ını gövdeye eklediğini doğruladı. Dolayısıyla güncel açık
“herhangi bir authenticated kullanıcı başka işletmeyi okuyabilir” değildi; açık,
**aynı işletmenin aktif fakat `raporlar=false` ortağının** agregatı okuyabilmesiydi.
Migration öncesi gerçek aktif fixture bu RPC'den 7 tip grubu döndürdü.

**Uygulanan çözüm:**

1. Mevcut istemci görünürlük kapısı korundu.
2. `useMonthSummary` kendi içinde de `canAccessModule('raporlar')` denetliyor. Yanlış
   çağıran `enabled=true` verse bile RPC çalışmıyor. Yetki daralınca disabled query'nin
   bellekte/diskte tutabildiği eski değer consumer'a dönmüyor.
3. Canlı fonksiyonun imzası, sonuç tipi, `SECURITY DEFINER`, sabit `search_path`, kur
   dönüşümü, tarih ve pasif kayıt filtreleri snapshot'landı.
4. `20260728224922_gate_income_expense_summary_reports` migration'ı mevcut imzayı
   koruyarak işletme üyeliği + `raporlar` görünürlüğü + K1 kaynak-modül kesişimi
   uyguladı.
5. `can_see_all_users_data=false` için yalnız `i.created_by=auth.uid()` satırları
   agregasyona giriyor. `created_by IS NULL` ve başka kullanıcının satırları görünmiyor.
6. Bilinmeyen işlem tipi ve bozuk yeni-format `level` değeri fail-closed. `PUBLIC/anon`
   EXECUTE kapalı; `authenticated/service_role` ACL'si canlı snapshot'la aynı.
7. Yetki daralmasında memory + persisted disk cache temizliği zaten
   `useAuth`/`wipePersistedCache` içinde mevcuttu; yeniden yazılmadı.

#### S-08 uygulama kaydı — 29 Temmuz 2026

**DB/veri güvenliği:** Migration yalnız `CREATE OR REPLACE FUNCTION` ve fonksiyon ACL
komutları içerir. Tablo/kolon ekleme-silme, kolon adı/tipi değiştirme, `INSERT`,
`UPDATE`, `DELETE`, backfill veya kullanıcı finansal kayıtlarına yazma yoktur. 27
Temmuz 2026 doğrulanmış tam yedek teyidi ve kullanıcının veri-silmeyen migration
yetkisi altında uygulandı.

**Canlı sonuçlar:**

- `get_income_expense_summary(uuid,timestamptz,timestamptz)` imzası ve
  `TABLE(type text,total numeric)` sonucu değişmedi.
- Raporlar kapalı aktif fixture: **önce 7 grup, sonra 0 grup**.
- Owner fixture: önce/sonra **7 grup** ve çıktı parmak izi birebir aynı.
- Raporlar + bütün kaynak modülleri açık ortak: owner ile **14/14 grup ve aynı çıktı
  parmak izi**.
- Hesaplar kapalı, Cariler + Personel açık ortak: yalnız izin verilen beş Cari/Personel
  tipi; `gelir/gider/transfer` yok.
- `can_see_all_users_data=false` ve kendine ait işlem bulunmayan aktif ortak: 0 grup.
- Askıya alınmış üye ve başka kiracı kimliği: 0 grup.
- ACL: `PUBLIC=false`, `anon=false`, `authenticated=true`, `service_role=true`.

**Otomatik regresyon kapsamı:**

- Raporlar kapalıyken hook RPC'yi hiç çağırmıyor.
- Raporlar açıkken gelir/gider toplamı aynı şekilde hesaplanıyor.
- Yetki açık→kapalı daralınca cache'deki eski tutar aynı render'da gizleniyor.
- SQL sözleşmesi imza/sonuç şekli, tenant + rapor kapısı, kaynak kesişimi,
  `created_by` görünürlüğü, ACL ve yıkıcı ifade yokluğunu kilitliyor.

**Eski client:** Sunucu `RETURN` ile boş tablo döndürür; imza ve kolon şekli
değişmediği için eski `(data || [])` akışı crash olmaz. Raporlar kapalı eski build
kartı hâlâ çiziyorsa gerçek tutar yerine `₺0,00` gösterebilir. Bu yanıltıcı görünüm
yalnız eski UI'dadır; finansal sızıntı kapanmıştır. Eski build'in daha önce diske
aldığı tutarı DB migration'ı uzaktan silemez; yeni istemci izin daralmasında cache'i
temizler ve hook düzeyinde değeri gizler. Owner ve tam kaynak yetkili ortak sonucu
değişmez; kısmi kaynak yetkisinde daha düşük/boş toplam güvenlik gereğidir.

**Kapsam sınırı:** Bu adım S-08'deki ana sayfa/`useMonthSummary` kaynağını kapatır.
`get_category_report` ve `get_income_by_source` gibi diğer rapor RPC'lerinin bütün
kaynak-modül + görünürlük sözleşmesi ayrıca Bölüm II D10/genel rapor-RPC backlog'u
kapsamındadır; “tüm rapor RPC paketi tamamlandı” sayılmaz.

**Cihaz kabul testi:**

1. Owner hesabında aynı aya bak: Gelir/Gider, Genel Durum ve Nakit Akışı kartları
   eskisiyle aynı tutarları göstermeli.
2. `raporlar=false`, `cariler=true`, `urunler=true` özel role geçip uygulamayı tamamen
   kapat/aç. Ana sayfada Gelir/Gider/Genel Durum/Nakit Akışı carousel'i hiç
   görünmemeli; Cari ve Ürün sekmeleri çalışmalı.
3. Daha menüsünde Raporlar girişi görünmemeli. Bir rapor deep-link'i açılırsa ana
   sayfaya yönlenmeli; tutar bir kare dahi parlamamalı.
4. Ana sayfada pull-to-refresh yap, uygulamayı arka plana alıp geri dön, interneti
   kesip aç. Rapor kartları yeniden belirmemeli.
5. Bu kullanıcı açıkken owner panelinden Raporlar iznini aç; uygulamayı
   arka plan→ön plan yap. Kartlar görünmeli ve yalnız açık kaynak modüllerinin
   toplamını içermeli.
6. Raporlar iznini yeniden kapatıp uygulamaya dön. Eski tutar görünmeden kartlar
   kaybolmalı.

**Cihaz kabulü — 29 Temmuz 2026:** Kullanıcı test turunun ardından devam onayı verdi;
S-08 kapatıldı. Yukarıdaki matris regresyon kontrol listesi olarak korunur.

### S-09 — Ortak kullanıcının kategori ekleyip çıkarması

**Durum: İstemci, canlı restrictive RLS + atomik RPC, otomatik doğrulama ve
gerçek cihaz kabulü tamamlandı.**

Güncel route kapısı:

`src/app/kategoriler/_layout.tsx:1-4`

```tsx
import { OwnerRouteGuard } from '@/components/permissions/ModuleRouteGuard';
...
return <OwnerRouteGuard />;
```

Effective permission shared kullanıcıda kategorileri kapatıyor:

`src/lib/permissions.ts:104-107`

```ts
effective.kategoriler = false;
effective.ayarlar = false;
```

Migration öncesinde server'daki legacy permissive policy JSON aksiyonlarını yazma
otoritesi kabul ediyordu:

`supabase/migrations/20260224000002_multi_user_rls_policies.sql:188-201`

```sql
CREATE POLICY "Shared insert kategoriler" ...
AND COALESCE((iu.permissions->'actions'->'kategoriler'->>'can_create')::boolean, false)
...
CREATE POLICY "Shared update kategoriler" ...
AND (... can_update_all ... OR ... can_update_own ...)
```

Migration öncesi UI silmesi gerçek `DELETE` değil, `UPDATE is_active=false` olduğu
için bu update policy üzerinden çalışıyordu:

`src/hooks/useKategoriler.ts:278-284`

```ts
const { error } = await supabase
  .from('kategoriler')
  .update({ is_active: false })
```

**Uygulanan çözüm:**

1. `20260728232027_owner_only_kategoriler_atomik_archive` migration'ı mevcut
   permissive shared policy'leri silmeden INSERT/UPDATE/DELETE için owner koşullu
   `AS RESTRICTIVE` politikalar ekledi. Böylece legacy action JSON artık kategori
   yazma otoritesi veremez; shared SELECT davranışı değişmez.
2. UPDATE politikası hem eski satırda `USING`, hem yeni satırda `WITH CHECK` ile
   owner ister. Shared kullanıcının ortak olduğu işletmedeki kategoriyi sahip olduğu
   başka işletmeye taşıyarak kuralı aşması engellenir.
3. `useCreateKategori`, `useUpdateKategori` ve `useDeleteKategori` ortak kullanıcıda
   Supabase çağrısı yapmadan `permissionDenied` ile fail-closed olur
   (`src/hooks/useKategoriler.ts:159-236`).
4. Excel/veri içe aktarma kategori yazma ve geri alma girişleri de owner kapısına
   alındı (`useImportEntities`, `useImportHistory`, `useDataImport`); data-import
   route'u `OwnerRouteGuard` kullanır.
5. Eski çok-istekli **Sil** akışı `archive_kategori_atomik(uuid,uuid)` RPC'sine
   taşındı. RPC'nin teknik adındaki `archive`, geçmiş işlemler bozulmasın diye DB
   satırının fiziksel silinmeyip `is_active=false` yapılmasını ifade eder; uygulamada
   kullanıcıya sunulan özellik arşiv değil **Sil**'dir.
   Fonksiyon hedefi kilitler; `islemler.kategori_id` ile doğrudan bağlanan işlem veya
   aktif ileri tarihli işlem bağı varsa hiç dokunmadan reddeder. Aksi halde ürün
   kategori bağını, child parent bağını ve iki rapor eşlemesini temizleyip kategoriyi
   `is_active=false` yapar. Bunların tamamı tek Postgres transaction'ıdır; fiziksel
   `DELETE` yoktur.
6. RPC `SECURITY DEFINER`, boş `search_path`, tam nitelikli tablo adları ve içeride
   owner kontrolü kullanır. `PUBLIC/anon` EXECUTE kapalı, `authenticated` açıktır.

#### S-09 uygulama kaydı — 29 Temmuz 2026

**DB/veri güvenliği:** Migration yalnız üç yeni restrictive policy, bir yeni fonksiyon
ve fonksiyon ACL'si ekler. Tablo/kolon silme veya yeniden adlandırma, kolon tipi
değiştirme, backfill, kategori/ürün/işlem satırlarına migration anında DML ve finansal
işlem silme yoktur. 27 Temmuz 2026 doğrulanmış tam yedek teyidi ve kullanıcının
veri-silmeyen migration yetkisi altında canlıya uygulandı.

**Canlı sonuçlar:**

- Migration kaydı `20260728232027` olarak mevcut; üç restrictive policy doğru
  komut/owner koşullarıyla aktif.
- RPC imzası `archive_kategori_atomik(uuid,uuid) RETURNS void`; `prosecdef=true`,
  `search_path=""`, `PUBLIC=false`, `anon=false`, `authenticated=true`.
- Aktif shared kullanıcı kategori adını okumaya devam etti; kategori ekleme,
  cross-tenant UPDATE ve atomik silme çağrısı engellendi.
- Owner UPDATE başarılı oldu. Owner atomik silme testinde hedef pasifleşti; ürün
  kategorisiz kaldı, child root'a taşındı ve iki mapping bağı temizlendi.
- `islemler.kategori_id` ile doğrudan bağlı kategori `CATEGORY_HAS_TRANSACTIONS` ile
  reddedildi ve bağlantılar değişmedi.
- Canlı matris tek transaction içinde kasıtlı exception ile rollback edildi; sentetik
  kategori ve ürünlerden kalıcı satır kalmadığı ayrıca sayımla doğrulandı.

**Otomatik regresyon kapsamı:**

- Shared create/update/delete hook'ları Supabase'i hiç çağırmıyor.
- Owner silmede tek RPC çağrılıyor; işlem bağlı hata kullanıcı metnine çevriliyor.
- SQL sözleşmesi üç restrictive policy'yi, UPDATE'in eski+yeni owner kontrolünü,
  RPC owner/tenant/lock/işlem guard'larını, ACL/search path'i ve fiziksel `DELETE`
  yokluğunu kilitliyor.
- Hedef S-09 testleri 2 suite/16 test; tam çalışma 35 suite/620 test olarak geçti.

**Eskiden / şimdi:**

- Eskiden güncel UI kategori yönetimini gizlese de eski shared build, legacy action
  JSON ile kategori yazabiliyordu. Owner silme ürün/child/mapping/kategori için
  ayrı istekler çalıştırdığı için ortadaki hata kısmi bağlantı kaybı bırakabiliyordu.
- Şimdi yeni istemci shared kullanıcıyı çağrıdan önce durdurur; canlı DB de tüm
  istemciler için kategori yazmayı owner-only yapar. Yeni istemcide owner **Sil**
  işlemi tek transaction'dır: ya bütün bağlantılar düzenlenir ve kategori listeden
  kaldırılır ya da hiçbir değişiklik olmaz.

**Eski client sınırı:** Eski shared UI yönetim butonunu gösterebilir. INSERT açık
RLS/42501 hatası alır; UPDATE/DELETE bazı PostgREST yollarında 0-row/204 dönebileceği
için her eski build'in anlaşılır hata göstereceği varsayılmaz. Daha önemlisi, eski
binary üründeki `kategori_id` bağını kategori pasifleştirmeden önce ayrı istekte
temizliyordu. Ürün güncelleme yetkisi de varsa ilk istek başarılı, sonraki kategori
UPDATE'i owner-only kuralında başarısız olabilir. Yeni istemci bu zinciri çalıştırmaz;
server eski binary'nin önceden ayrılmış HTTP transaction'larını geriye dönük atomik
yapamaz. Deployment öncesi anonim canlı snapshot'ta bu risk kesişimine girebilecek
18 aktif üyelik ve 340 kategori bağlı ürün satırı vardı; eski mağaza build'iyle
shared kategori silme testi yapılırsa ürün kategorisi ayrıca kontrol edilmelidir.

**Kapsam sınırı / takip işi:** `20260729071904` ile yalnız gerekli
`id/name/type/color` alanlarını döndüren dar server RPC'si canlıdır; shared istemci
henüz base `kategoriler.select('*')` akışını kullanır. S-09 yazma açığı kapanmıştır.
Sıra, picker'ın `icon/parent_id` ihtiyacı için bilinçli görünüm kararı → yeni istemci
geçişi → eski build tabanını minimum sürümle ayırma → base SELECT'i daraltmadır. Ayrıca
aktif kategori seçimiyle eşzamanlı pasifleştirme ve bağı olan kategorinin tip
değişimi için server-side atama/tip guard'ı ayrı takip işidir; mevcut veri bu adımda
yeniden yazılmadı.

**Cihaz kabul testi:**

1. Owner hesabında **Daha → Kategoriler** aç. Benzersiz adlı bir test kategorisi
   ekle; adını/rengini düzenle. Eskisi gibi kaydolmalı.
2. İşleme bağlı olmayan ikinci bir test kategorisi oluştur. Mümkünse bir ürüne bağla,
   alt kategori ve gelir/gider eşlemesi ekle; **Sil**'e bas. Kategori kaybolmalı, ürün
   kategorisiz kalmalı, alt kategori root'a çıkmalı, iki eşleme temizlenmeli.
3. “... silindi” çubuğunda beş saniye dolmadan **Geri Al**'a bas. Gerçek silme
   çağrısı henüz yapılmadığı için hiçbir bağ veya kategori değişmemeli.
4. Bu guard testi için **Ürün kategorisi kullanma**. Yeni bir Gelir/Gider kategorisi
   oluştur; ürün eklemeden normal bir işlem kaydet ve bu kategoriyi doğrudan seç.
   Sonra kategoride **Sil**'e bas, **Geri Al**'a basmadan beş saniye bekle. İlk anda
   kategori Geri Al penceresi nedeniyle geçici gizlenir; sunucu kontrolü çalışınca
   yeniden görünmeli ve “Bu kategoriye ait işlemler var” mesajı çıkmalı. Aynı sonuç
   pending/notified ileri tarihli işlemde de beklenir.
5. Ürün kategorisinin ürünlü işlem geçmişi olması bu guard ile aynı şey değildir:
   ürünlü yeni işlemlerde `islemler.kategori_id` kasıtlı olarak boştur; kategori
   silinebilir ve bağlı ürün kategorisiz kalır. Bu senaryoda işlem uyarısı beklenmez.
6. Shared özel rolle giriş yap. Kategoriler menüsü görünmemeli; `/kategoriler`
   deep-link'i ana sekmelere dönmeli. İşlem/ürün kategori seçicisinde aktif kategori
   adları görünmeli ama **Kategori Ekle** bulunmamalı.
7. Shared kullanıcıyla data-import deep-link'ini aç. İçe aktarma ekranı mount olmadan
   owner guard tarafından geri çevrilmeli.
8. Mümkünse shared kullanıcıda eski mağaza build'ini kullanma. Kullanırsan başarısız
   kategori silme işlemi sonrasında bağlı ürünün kategori alanını özellikle doğrula.

**Cihaz kabulü — 29 Temmuz 2026:** Kullanıcı shared özel rolde kategori yönetim
girişinin hiçbir yerde görünmediğini doğruladı. Owner hesabında normal bir işleme
doğrudan bağlı kategori silinmeye çalışıldığında kategori ilk anda Geri Al süresi
boyunca gizlendi; beş saniye sonunda “Bu kategoriye ait işlemler var” uyarısı geldi
ve kategori silinmedi. S-09 kapatıldı.

### S-10 — Yetki reddinde yanlış/genel hata

**Durum: Kod + otomatik doğrulama tamamlandı; cihaz kabulü açık.**

#### Tarihsel kök neden — baz commit

Server ownership/permission reddini 42501 ile açıkça üretiyor:

`supabase/migrations/20260722020000_tahsis_vadesiz_fifo.sql:276-280`

```sql
IF NOT public.user_can_islem_action(p_isletme_id, 'update', v_created_by) THEN
  RAISE EXCEPTION 'Bu islemi guncelleme yetkiniz yok' USING ERRCODE = '42501';
END IF;
```

Hook bunu genel `permissionDenied` mesajına çeviriyor:

`src/hooks/useIslemler.ts:718-725`

```ts
if (error.code === '42501' || ...) {
  throw new Error(i18n.t('common:errors.permissionDenied'));
}
```

QTB catch ise alttaki hatayı tamamen atıp kullanıcıya tek metin gösteriyor:

`src/components/transaction/QuickTransactionBar/hooks/useTransactionSubmit.ts:1273-1283`

```ts
} catch (error) {
  ...
  Alert.alert(t('common:status.error'), t('transactions:messages.saveFailed'));
}
```

`src/i18n/locales/tr/transactions.json:190`

```json
"saveFailed": "İşlem gerçekleştirilemedi"
```

Bazı rapor satırları yetki kontrolü yapmadan editörü açıyor:

`src/app/raporlar/hesap/[id].tsx:85-90,136`

```tsx
const handleEdit = useCallback((id: string) => {
  setEditTransactionId(id);
  setShowEditBar(true);
}, []);
...
onPress={() => handleEdit(item.id)}
```

Tüm İşlemler listesi de düzenle/sil/kopyala kararını tek `canDelete` bayrağına
bağlamıştı (`src/app/islemler/index.tsx:428-442`). Bu alıntılar güncel davranış
değil; sorunun baz commit'teki kaynağını belgelemek için korunmuştur.

#### Uygulama kaydı — 29 Temmuz 2026

`src/lib/errors.ts` artık mutation hatasını kararlı kod önceliğiyle sınıflandırır:

- `ownership`: istemci `edit_own` + başka `created_by` durumunu kesin biliyor;
- `permission`: `42501` veya kararlı HTTP 403;
- `validation`: veri/foreign-key/check ihlali;
- `network_not_sent`: cihaz çevrimdışı olduğu için istek hiç gönderilmedi;
- `network_unknown`: istek gönderilmiş olabilir fakat cevap doğrulanamadı;
- `conflict` ve `generic`: eşzamanlı değişiklik ve kalan güvenli fallback.

Bilinmeyen bir server kodu, yalnız mesajında “yetkisiz” geçtiği için permission
sayılmaz. SQLSTATE, çelişen HTTP 5xx bilgisinden önce değerlendirilir.
`TransactionPermissionError`, normal işlem update/delete zincirinde `42501` kodunu,
aksiyonu ve istemcinin kesin bildiği sahiplik nedenini üst katmana taşır.

Kullanıcı metinleri aksiyona göre ayrıldı:

- başka kullanıcının kaydı:
  **“Bu işlem başka bir kullanıcı tarafından oluşturulduğu için düzenleyemezsiniz.”**
- güncelleme seviyesi/modülü yetersiz:
  **“Bu işlemi düzenleme yetkiniz yok.”**
- silme seviyesi/modülü yetersiz:
  **“Bu işlemi silme yetkiniz yok.”**
- owner-only geçiş yüzeyi:
  **“Bu işlem şu anda yalnız işletme sahibi tarafından düzenlenebilir.”**

QTB permission/ownership/validation/conflict hatalarında artık gereksiz beş saniyelik
existence probe çalıştırmaz; doğru mesajı hemen gösterir ve formu açık tutar. Sonucu
belirsiz ağ hatasında önce
**“Bağlantı kesildi. İşlemin kaydedilip kaydedilmediğini kontrol ediyoruz.”**
bilgisi gösterilir. İki yazımlı normal↔ileri tarihli dönüşümün ilk yazımı
tamamlandıktan sonra ikinci adım hata verirse, hata türünden bağımsız olarak iki satır
birlikte kontrol edilir; bağlantı mesajı yalnız gerçekten ağ sonucu belirsizse gösterilir.
Sonuç:

- kayıt bulunduysa başarı akışı ve cache invalidation çalışır;
- kayıt yoksa form korunur ve güvenle yeniden deneme söylenir;
- dönüşümde yeni ve eski satır birlikte kaldıysa form kapatılır,
  **“Yeni kayıt oluşturuldu ancak eski kayıt kaldırılamadı…”** uyarısı gösterilir ve
  körlemesine tekrar kaydetmek yerine iki satırın kontrol edilmesi istenir;
- probe da doğrulanamazsa kullanıcıdan tekrar kaydetmeden önce listeyi kontrol etmesi
  istenir.

Cihazın yerel offline kapısında henüz hiçbir yazım tamamlanmamışsa istek hiç
gönderilmediği bilindiği için probe çalışmaz. Dönüşümün ilk yazımı tamamlandıktan sonra
ikinci çağrı offline kapısına takılırsa bu sonuç artık işlem düzeyinde “gönderilmedi”
sayılmaz; iki tablo birlikte kontrol edilir. Normal ve çapraz-kurlu create yolları
isteğin öncesinde client UUID üretir. Yeni ileri tarihli kayıt da client UUID ile
doğrulanabilir. Normal→ileri tarihli ve ileri tarihli→normal dönüşümlerinde yeni satırın
varlığı ile eski satırın yokluğu birlikte doğrulanmadan başarı ilan edilmez. Ürünlü
işlemde atomik RPC bulunamazsa artık ana işlem + ayrı stok hareketi şeklindeki
çok-çağrılı fallback hiç çalıştırılmaz. Bu yol, stok RPC'si commit olduktan sonra cevabın
kaybolması hâlinde aynı stok etkisini ikinci kez uygulayabildiği için fail-closed
kapatılmıştır; kullanıcıya hiçbir kayıt oluşturulmadığını ve daha sonra yeniden
denemesi gerektiğini söyleyen açık mesaj gösterilir.

Sonucu doğrulanamayan create/dönüşümde client UUID artık açık form oturumu boyunca
korunur. Kullanıcı aynı formda yeniden Kaydet'e bassa bile yeni UUID ile ikinci finansal
kayıt üretilemez; form gerçekten kapandığında kimlik temizlenir. UUID ile birlikte ilk
gönderimin canonical payload parmak izi de korunur. Belirsiz denemeden sonra tutar,
ürün/taksit kalemi veya başka bir alan değiştirilirse aynı idempotency anahtarıyla
“başarılı” gösterilmez; kullanıcıdan önce listeyi kontrol edip formu yeniden açması
istenir. Normal/ürünlü/taksitli atomik RPC'nin döndürdüğü mevcut satır da girişin
finansal alanlarıyla birebir karşılaştırılır. İleri tarihli düz insert aynı UUID için
`23505` verirse mevcut satır yalnız tenant, tip, kuruşlu tutar, açıklama, tarih, tüm
referanslar ve `pending/notified` durumu eşitse idempotent başarı sayılır; farklı satır
gerçek conflict olarak kalır. “Önce listeyi kontrol edin” mesajıyla birlikte
normal/ileri tarihli/ürün hareketi cache'leri de invalidation alır.

Hesap/Cari/Personel ve izin geçmişi detayları, hesap/kategori rapor drill-down'ları,
rapor Cari/Personel sekmeleri ve Tüm İşlemler yüzeyi aynı giriş sözleşmesine bağlandı.
Rapor ürün modalı edit yetkisini varsayılan açık değil, **fail-closed** kabul eder.
Edit/delete/copy/tahsil aksiyonları tek birleşik `canDelete` bayrağından ayrıldı.
Personel izin geçmişi yalnız izin tiplerini filtrelediği için rolün `canDelete`
seviyesini güvenle uygular. Hesap/Personel detayındaki shared silme ise işlem
tipi→kaynak modülü sunucu kesişimi tamamlanana kadar owner-only ve fail-closed kalır.
Bağlantılı Cari ekranında karşı işletmenin satırı ürün modalı/uzun basma/swipe üzerinden
düzenleme, kopyalama veya silmeye açılamaz. Link durumu ilk yüklenirken, hata verirken,
offline-paused iken veya yeniden doğrulanırken bütün yazma girişleri kapalıdır; yalnız
mevcut mount içinde başarıyla getirilmiş `idle` sonuç kullanılabilir. `view`→`full`
ayrımı kesin çözülmeden QTB/menu/bakiye editörü, not yazımı, kopyalama veya ileri
tarihli **Tamamla/Düzenle/Sil** aksiyonları açılmaz. İzin daralınca açık
QTB/editör/kur paneli kapanır. Beş saniyelik Geri Al penceresinde bekleyen bir silme
varsa timer iptal edilir, satır geri gelir; stale timer/Alert callback'i ayrıca
mutation başlamadan reddedilir.
Yüklenmiş sayfadaki yetkisiz deep-link sessizce yutulmaz. Hesap fotoğrafı
sil/değiştir callback'i işlem update izni olmadan verilmez; böylece ortak kullanıcı
Storage işlemini yetki kontrolünden önce başlatamaz.

**Güncel dayanıklılık durumu — E-19 / P0-S6A:** Bu ilk S-10 paketinde açık bırakılan
istemci sıralaması daha sonra tamamlandı. Yeni build değişimde yeni benzersiz upload →
DB pointer swap → eski nesneyi best-effort temizleme; kaldırmada önce yetkili DB pointer
clear → Storage cleanup sırasını kullanır. Pointer sonucu ağ yüzünden belirsizse yeni
nesne yanlışlıkla silinmez. Ancak bu istemci düzeltmesi Storage server
yetkilendirmesi değildir. P0-S6B'nin kanonik upload + not fotoğrafı zarfı daha sonra
canlıya alındı; işlem fotoğrafının tip/modül bazlı nihai SELECT/DELETE kapanışı
P0-S1'e, orphan retention ise ayrı pakete bağlı kalır. Envanterdeki 41 orphan nesne
otomatik silinmemiştir.

Silme hata tüketicileri merkezi `delete` mesaj seçicisine geçirildi. Geri Al
penceresinde DB silme sonucu gelmeden “silindi” yerine **“silinecek”** yazılır.
Bağlantı yokken gönderilmeyen silme ile sonucu belirsiz silme birbirinden ayrılır.

**Güvenlik kapsam sınırı:** Geniş mevcut işlem edit/copy formundaki ham hesap referansı
projeksiyonu henüz tamamlanmadığından bu form shared kullanıcı için owner-only ve
fail-closed kalır. S-11'in dedicated minimal create yolu bu formu kullanmaz. Shared
kullanıcı kendi kaydında gerekli aksiyon seviyesine
sahip olsa bile şimdilik owner-only açıklamasını görür; bu, izin matrisinin tam
aktivasyonu değil güvenli geçiş davranışıdır. Hesap/Personel shared silme de
tip→kaynak-modül sunucu kapısı tamamlanana kadar aynı nedenle owner-only kalır. Normal
işlem update/delete RPC'leri
yetki reddinde zaten `42501` üretir. Doğrudan RLS kullanan ileri tarihli update/delete
yolunda görünmeyen satır `İşlem bulunamadı veya erişim yetkiniz yok` güvenli fallback'i
olarak kalır; bu turda yeni RPC/migration açılmadı.

**Veri ve eski istemci etkisi:** Paket yalnız istemci kodudur. Migration, DDL, DML,
backfill veya canlı kullanıcı/işlem verisi yazımı yoktur. Şema ve RPC imzası
değişmediği için eski mağaza istemcisi önceki genel mesaj davranışını sürdürür. Yeni
istemci, canlıda zaten bulunan atomik işlem/ürün RPC'leri beklenmedik biçimde yoksa
non-atomik fallback ile kısmi veri yazmak yerine işlemi hiç başlatmaz. Mevcut kolon,
kullanıcı ve işlem satırları değiştirilmez veya silinmez.

#### S-10 otomatik doğrulaması — 29 Temmuz 2026

| Kontrol | Sonuç |
|---|---|
| TypeScript | `npm.cmd run typecheck` — geçti |
| ESLint | `npm.cmd run lint` — **0 hata**, mevcut kodda 110 uyarı |
| Hedef yetki/hata/idempotency testleri | 6/6 suite, 83/83 test geçti |
| Tam Jest | 40/40 suite, 679/679 test geçti |
| Metro iOS | 4.071 modül sorunsuz bundle edildi |
| Veri/DB etkisi | Migration, DDL, DML, backfill veya canlı veri yazımı yok |
| Eski istemci | Şema/RPC değişmedi; önceki mesaj davranışını sürdürür |

Bu ilk otomatik paket, kendi doğrulama anında fotoğraf Storage/DB işlem sırasını ve
sayfalı listede henüz yüklenmemiş deep-link hedefini çözmüyordu. Fotoğraf sırası daha
sonra P0-S6A istemci paketiyle kapandı; E-20 deep-link sayfalama ve E-21 bağlantılı
Cari mutation-anı server kontrolü açık kalır. P0-S6B kanonik upload + not fotoğrafı
zarfı canlıdır; işlem fotoğrafının P0-S1'e bağlı server sınırı ve orphan cleanup,
P0-S6A'nın tamamlanmış parçası sayılmaz.

**Cihaz kabul testi:**

1. Rolü `edit_own` yap ve Hesaplar/Cariler/Personel gibi test edeceğin kaynakları açık
   bırak. Shared uygulamayı arka plana alıp yeniden aç.
2. Owner'ın oluşturduğu normal bir işlem satırına Hesap, Cari veya Personel detayından
   dokun. Editör açılmamalı; beklemeden tam olarak
   **“Bu işlem başka bir kullanıcı tarafından oluşturulduğu için
   düzenleyemezsiniz.”** görünmeli. Satır/tutar değişmemeli.
3. Shared kullanıcının kendi oluşturduğu satıra dokun. Ham referans güvenlik işi açık
   olduğu için bu turda editör yine açılmamalı ve
   **“Bu işlem şu anda yalnız işletme sahibi tarafından düzenlenebilir.”** görünmeli.
4. Rolü geçici olarak `view` veya `add` seviyesine indir. Bir işlem satırına dokununca
   **“Bu işlemi düzenleme yetkiniz yok.”** görünmeli.
5. Raporlar yetkisini yalnız bu test için açabiliyorsan Hesap/Kategori rapor detayı ile
   Raporlar → Cari/Personel satırına dokun. Aynı ret mesajı görünmeli; ürün detay
   penceresi salt-okunur açılabilse de **Düzenle** düğmesi bulunmamalı.
6. Owner hesabına dön. Normal işlem düzenleme hâlâ açılmalı ve kaydetme çalışmalı.
   Bir satırı silmeye kaydırınca Geri Al metni önce **“… silinecek”** demeli; izinli
   silmede beş saniye sonunda satır kalıcı gitmeli.
7. Bağlantıyı uçak moduyla kapatıp yeni normal işlem kaydetmeyi dene. Beş saniyelik
   gereksiz kontrol beklemeden “işlem kaydedilmedi” mesajı görünmeli ve form
   korunmalı. Bağlantıyı açınca yeniden kaydet.
8. Mümkünse farklı para birimli hesap↔cari ödeme/tahsilatı kaydet. Normal başarı
   davranışı değişmemeli; bağlantı cevabı belirsizleşirse uygulama önce kayıt
   sonucunu kontrol ettiğini söylemeli ve körlemesine ikinci işlem oluşturmamalı.
9. Bağlantılı bir caride link iznini `full` yap. İleri tarihli kartı genişlettiğinde
   **Tamamla/Düzenle/Sil** izinlerin ölçüsünde görünmeli. Açık editör veya kur paneli
   varken diğer cihazdan izni `view` yapıp uygulamayı arka plan→ön plan yap. Açık yüzey
   kapanmalı ve üç aksiyon kaybolmalı; eski Alert düğmesine basmak veri yazmamalı.
10. Aynı `full` bağlantıda viewer işletmesine ait test işlemini silmeye kaydır. Beş
    saniyelik **“… silinecek”** penceresi açıkken izni `view` yapıp uygulamayı yeniden
    öne getir. Satır geri gelmeli ve beş saniye sonunda silinmemeli. Ardından uçak
    modunda arka plan→ön plan yap; cache'te eski `full` sonucu bulunsa bile yazma
    düğmeleri açılmamalı.

---

## I.7. Minimal referanslar ve işlemi yapan kişi etiketi

### S-11 — Cariler-only Tahsilat ekranında hesapların görünmemesi

**Durum: Tam kaynak yetkili shared yeni işlem QTB tutarlılığı cihazda kabul edildi.
Yalnız Cariler modüllü rol için bakiyesiz minimal hesap referansı, dedicated istemci
akışı ve dar atomik cari nakit RPC'si 29 Temmuz'da canlıya uygulandı; otomatik
doğrulama tamamlandı, bu yeni alt paketin cihaz kabulü açıktır.**

Normal hesap hook'u Hesaplar modülü kapalıysa boş döner ve sorguyu açmaz:

`src/hooks/useHesaplar.ts:21-40,61`

```ts
const canSeeHesaplar = canAccessModule('hesaplar');
...
if (!canSeeHesaplar || !isletme) return [];
...
.from('hesaplar')
.select('*')
...
enabled: enabled && canSeeHesaplar && !!isletme,
```

Mevcut picker bakiyeyi zorunlu alan kabul edip gösteriyor:

`src/components/transaction/QuickTransactionBar/components/HesapPickerSheet.tsx:14-18`

```ts
interface Hesap {
  id: string;
  name: string;
  balance: number;
  currency?: string;
}
```

`src/components/transaction/QuickTransactionBar/components/HesapPickerSheet.tsx:149-158`

```tsx
{hesap.name}
...
{formatCurrency(hesap.balance, hesap.currency)}
```

İlk güvenlik sertleştirmesinde Cari ana sayfa geniş QTB'yi yalnız owner'a açıyordu.
Bu kapı, **Hesaplar + Cariler + Ürünler + Personel** modüllerinin dördü de açık olan
shared kullanıcıyı da gereksiz yere kapattığı için saha testinde iki tutarsızlık
üretti: Cari kartında yalnız **Geçmiş İşlemler** görünüyordu; ana sayfa hesap
kartındaki **İşlem Yap** state'i değiştiriyor fakat QTB mount edilmediği için düğme
tepkisiz kalıyordu. Hesap detayındaki koşulsuz QTB ise aynı kullanıcıda çalışıyordu.

#### S-11 ara uygulama kaydı — tam kaynak yetkili shared QTB

`src/lib/permissions.ts` içine `hasFullTransactionSourceAccess` eklendi. Geniş QTB
ancak hesap, cari, ürün ve personel kaynaklarının **tamamı** görülebiliyorsa güvenli
kabul edilir. `usePermissions` iki ayrı yetenek üretir:

- `canUseFullTransactionContext`: dört kaynağı birlikte okumak güvenli;
- `canCreateTransactions`: bu güvenli bağlama ek olarak İşlemler oluşturma seviyesi var.

Ana sayfa hesap düğmesi/global QTB, Cari ve Personel liste QTB'leri ile Cari/Hesap/
Personel ve personel izin geçmişi detaylarındaki **yeni işlem** FAB'ları ikinci kapıya
bağlandı. Ana sayfadaki tepkisiz hesap düğmesi böylece gerçek QTB mount kapısıyla
aynı kararı verir. **Daha → Tüm İşlemler/Taksit** ve bildirim çanı mevcut geniş
okuma sorguları dar projeksiyona geçmediği için owner-only kalır.

Mevcut işlemin edit/copy yükleyicisi ham `hesap_id/hedef_hesap_id` değerlerini forma
taşıdığı için detay ve QTB girişlerinde shared kullanıcıya bu iki akış açılmadı.
Birikim/pasif hesap gibi seçicide görünmeyen bir referansın tekrar forma taşınmasını
önleyecek edit/copy'ye özel server projeksiyonu ve ham hesap referansı yükleme
doğrulaması tamamlanana kadar bu girişler owner-only ve fail-closed kalır.

Sonraki kod teyidinde bir istisna bulundu: bağımsız
`/islemler/duzenle/[id]` deep-link rotası owner guard kullanmıyor ve
`createdBy + usePagePermission` üzerinden shared `edit_own/edit_all` kullanıcısını
geçirebiliyordu. Bu nedenle “mevcut işlem edit/copy bütünüyle owner-only” ifadesi
doğru değildir; detay/QTB girişleri owner-only, standalone edit rotası ise projeksiyon
hazırlanana kadar ayrıca kapatılması gereken bir residual'dır.

**Eski davranış:** Tam kaynak + `edit_all` shared kullanıcı Cari kartında yalnız
**Geçmiş İşlemler** görür; ana sayfa hesabındaki **İşlem Yap** düğmesi tepkisiz,
hesap detayındaki şimşek ise çalışırdı.

**Yeni davranış:** Aynı kullanıcı ana sayfa, Cari/Personel listesi ve ilgili detaylarda
**yeni işlem** girişini tutarlı biçimde görür. `view` seviyesi veya dört kaynaktan biri
kapalı rol create editörünü hiç mount etmez ve ölü düğme göstermez. Mevcut işlem
edit/copy davranışı bu ara pakette genişletilmez. S-10 sonrasında bu owner-only sınıra
dokunulduğunda sessiz/no-op veya genel kayıt hatası yerine açık sahiplik/yetki mesajı
gösterilir.

Bu paket istemci-only'dir: migration, şema/DML, backfill veya kullanıcı/işlem verisi
değişikliği yoktur. Canlı üyelik salt-okunur doğrulamasında hedef rolün dört kaynak
modülü, türetilmiş İşlemler modülü ve `edit_all` aksiyonları açık; Raporlar ve
Kategoriler kapalı bulunmuştur.

#### S-11 ara paket otomatik doğrulaması — 29 Temmuz 2026

| Kontrol | Sonuç |
|---|---|
| TypeScript | `npm.cmd run typecheck` — geçti |
| ESLint | `npm.cmd run lint` — **0 hata**, mevcut kodda 113 uyarı |
| Hedef yetki testleri | 3/3 suite, 30/30 test geçti |
| Tam Jest | 37/37 suite, 634/634 test geçti |
| Metro iOS | 4.070 modül sorunsuz bundle edildi |
| Diff biçim kontrolü | `git diff --check` — geçti |
| Veri/DB etkisi | Migration, DDL, DML, backfill veya canlı veri yazımı yok |
| Eski istemci | Owner-only davranışını sürdürür; şema/yanıt sözleşmesi değişmedi |

**Tam kaynak ara paket cihaz kabul testi:**

1. Shared hesapta uygulamayı bir kez arka plana alıp tekrar aç; böylece güncel rol
   kaydı yenilensin.
2. Ana sayfada normal bir hesabı genişlet. **İşlem Yap** artık görünmeli ve QTB
   açılmalı; kaydetmeden kapat.
3. Cariler sekmesinde normal, bağlantılı olmayan bir cariyi genişlet. **İşlem Yap**
   ve **Geçmiş İşlemler** birlikte görünmeli; ilk düğme QTB'yi açmalı.
4. Aynı carinin detayına gir. Şimşek FAB yeni işlem QTB'sini açmalı. Hesap ve Personel
   detayında da aynı kontrolü yap; Personel → İzin Geçmişi'nde `+` yeni izin formunu
   açmalı.
5. Ana sayfadaki global şimşek menüsü açılmalı. Raporlar ve Kategoriler kapalı olduğu
   için bunların menü/girişleri hâlâ görünmemeli.
6. Negatif test için dört kaynaktan yalnız birini geçici kapat. Uygulamayı
   arka plan→ön plan yapınca geniş QTB girişleri görünmemeli; basınca hiçbir şey
   olmayan düğme de kalmamalı. Sonra rolü eski hâline getir.
7. Shared kullanıcının detay/QTB üzerindeki mevcut işlem **edit/copy** girişleri
   owner-only kalmalıdır. Ayrıca bildiğin bir `/islemler/duzenle/<id>` bağlantısını
   doğrudan açmayı dene; projeksiyon paketi gelene kadar edit formu açılmamalı ve açık
   owner/yetki mesajı görünmelidir.

**Cihaz kabulü — 29 Temmuz 2026:** Kullanıcı tam kaynak yetkili shared hesapta ana
sayfa hesap hızlı işlemi, Cari/Personel liste ve detay yeni işlem girişlerinin
tutarlı çalıştığını; kategori guard testlerinin de bozulmadığını doğruladı. Bu kabul
yalnız tam kaynak shared **yeni işlem** alt paketini kapatır. Bu kabul anında
Cariler-only bakiyesiz minimal hesap seçicisi ile mevcut işlem edit/copy projeksiyonu
açıktı; minimal create alt paketi daha sonra uygulanmış fakat henüz cihazda kabul
edilmemiştir.

#### S-11 ikinci güvenlik teyidi — minimal referans önkoşulu (uygulama öncesi tarihsel kayıt)

Minimal hesap kimliklerini yeni role göstermeden önce sunucu yazma zinciri tekrar
incelendi ve iki kritik önkoşul doğrulandı:

- Güncel `create_islem_atomik`, istemciden gelen `p_balance_ops` listesini hesap
  referansı ile oluşturulan işlem arasındaki bağı server'da yeniden kurmadan
  `increment_balance` yardımcısına geçiriyor. Yalnız foreign key, hesabın aynı
  işletmeye/aktif/doğru türe ait olduğunu kanıtlamıyor.
- Canlı `increment_balance(text, uuid, numeric)` fonksiyonunun `PUBLIC`, `anon` ve
  `authenticated` EXECUTE yetkisi vardı. Fonksiyon aktif işletme üyeliğini kontrol
  etse de hedef modül/aksiyon iznini kontrol etmediğinden, hesap kimliğini bilen
  yalnız-Cariler üyesi gizli hesabın bakiyesini doğrudan değiştirebilirdi.

Bu açık minimal projection tarafından üretilmedi; mevcut `islemler.hesap_id`
referanslarından da hesap kimliği öğrenilebildiği için önceden var olan bağımsız bir
sunucu sınırı problemidir. Ancak hesap referans ucu açığı daha kolay kullanılabilir
hâle getireceğinden genel bakiye yolunu kullanan bir S-11 picker'ın yayınlanmaması
kararlaştırıldı. Nihai paket genel yolu açmak yerine aşağıdaki dedicated dar RPC'yi
kullanır.

Bu tasarım anında hazırlanan ve canlı sürümle eşleştirilerek
`20260729064915_pb_internal_yetki_altyapisi.sql` adını alan migration
yardımcı fonksiyonlar içeriyor fakat canlı migration tarihinde kayıtlı değildi. Nihai
S-11 migration'ı bu dosyaya bağımlı yapılmadı; gerekli tenant/üyelik/modül/kayıt
kontrollerini kendi iki dar fonksiyonunda taşır.

Uygulama öncesi güvenli sıra (1–2 genel backlog olarak kalırken S-11, 3–5'i dedicated
yolla tamamladı):

1. `increment_balance` imzasını koruyup `PUBLIC/anon` EXECUTE'ı kaldır; eski
   authenticated client uyumu için bu aşamada authenticated EXECUTE kalsın ancak
   gövde owner veya hedef tablo modülü + işlem yazma seviyesini fail-closed doğrulasın.
2. Standalone edit deep-link'ini projeksiyon hazır olana kadar owner-only kapat.
3. Yalnız exact `id, name, currency, type` döndüren minimal hesap RPC'sini ekle.
4. Yalnız `cari_odeme/cari_tahsilat` kabul eden, cari ve hesabı aynı tenant/aktif/
   arşivsiz olarak DB'den doğrulayan ve bakiye operasyonunu server'da üreten dar
   atomik create RPC'si ekle. İstemciden gelen genel `p_balance_ops` bu yolda kullanılmaz.
5. Yeni Cariler-only QTB yalnız bu dar okuma/yazma uçlarını kullanır; normal hesap
   cache'i veya genel işlem editörüyle birleştirilmez.

**Yalnız Cariler rolü için uygulama öncesi güvenli çözüm taslağı:**

1. Additive server ucu (`get_hesap_referanslari` gibi) yalnız
   `id, name, currency, type/icon` döndürür. `balance`, opening balance, card limit,
   hareket ve toplamlar hiçbir response/error kanalında bulunmaz.
2. Koşul: aktif üyelik + `cariler` modülü + işlem seviyesi. Yalnız aktif,
   arşivlenmemiş ve işlem için uygun hesaplar.
3. Ayrı `MinimalHesapRef` tipi ve `useCariPaymentAccountRefs`; geniş, disk-persist edilen
   `Hesap[]` cache'i yeniden kullanılmamalı.
4. Picker'ın bakiyesiz modu/dedike bileşeni yalnız hesap adını ve tür/para birimini
   gösterir.
5. Cari tahsilat/ödeme RPC'si gelen hesap ID'sini server'da tekrar doğrular; başka
   işletme/pasif/uygunsuz hesap UUID'sini reddeder ve bakiye operasyonunu istemciden
   kabul etmez.
6. Temel `hesaplar SELECT` RLS'i genişletilmemeli; “picker çalışsın” diye `select=*`
   açmak veri sızıntısıdır.

**Kabul testi:** Cariler-only `view` yazma picker'ı açamaz; `add/edit_*` minimal alan
alır; doğrudan `hesaplar?select=*` bakiye döndürmez; sahte hesap UUID'si reddedilir;
client cache ve hata payload'ında tutar bulunmaz.

**Eski client:** Additive uç eski client'ı etkilemez; eski client picker'ı boş görmeye
devam eder. Temel tablo RLS'i yeni istemci yayılmadan daraltılırsa eski hesap ekranı
bozulabileceği için aşamalı geçiş gerekir.

#### S-11 nihai uygulama kaydı — 29 Temmuz 2026

Uygulama öncesi taslaktaki geniş/genel bakiye yardımcısını shared role açmak yerine iki
yeni ve dar RPC ile ayrık bir akış uygulandı:

- `get_cari_hesap_referanslari(uuid)` yalnız exact
  `{ id, name, currency, type }` döndürür. `balance`, açılış bakiyesi, kart limiti,
  hesap hareketi veya başka finansal alan response DTO'suna ve cache'e alınmaz.
- `useCariPaymentAccountRefs` normal `Hesap[]` sorgusundan ayrıdır ve
  `meta.persist=false` kullanır; işletme bağlamından çıkan minimal referanslar diske
  yazılmaz.
- `create_cari_nakit_islem_atomik` yalnız `cari_tahsilat` ve `cari_odeme` kabul eder.
  Cari/hesap/işletme/üyelik ve para birimini server'da tekrar doğrular; istemciden genel
  bakiye operasyonu kabul etmez. İşlem, hesap/cari bakiyeleri ve varsa hedef tahsis
  pointer'ı tek transaction'da yazılır.
- Minimal QTB müşteri için yalnız **Tahsilat**, tedarikçi için yalnız **Ödeme**
  gösterir. Satış/alış/iade, kategori, ürün, personel, fotoğraf ve ileri tarihli geniş
  işlem yüzeyleri bu dar bağlamda fail-closed kalır.
- Normal owner ve dört tam işlem kaynağı açık shared QTB davranışı değiştirilmedi.

Canlı migration geçmişinde paket `20260729035945_add_cari_cash_minimal_rpcs` olarak
kayıtlıdır. Migration yalnız iki yeni fonksiyon ekledi; tablo/kolon/policy/trigger,
backfill veya migration-time DML yoktur. Mevcut `create_islem_atomik`,
`increment_balance`, işlem, hesap, cari ve kullanıcı satırlarına dokunulmadı.

**Otomatik ve canlı doğrulama:**

| Kontrol | Sonuç |
|---|---|
| SQL sözleşme testleri | 13/13 geçti |
| Bağımsız istemci sözleşme testleri | 4 suite, 43/43 test geçti |
| Üretim öncesi `BEGIN/ROLLBACK` smoke | 14/14 geçti; yeni fonksiyonlar rollback sonrası yoktu |
| Canlı uygulama sonrası salt-okunur/rollback smoke | 14/14 geçti |
| ACL ve fonksiyon sınırı | Exact imza, `SECURITY DEFINER`, boş `search_path`; `authenticated` açık, `anon/PUBLIC` kapalı |
| Pozitif işlem | TRY/TRY ve TRY/USD sentetik tahsilat/ödeme; doğru ve tek hesap/cari deltası |
| Negatif işlem | Cross-tenant/sahte referans, kategori, değişmiş idempotent payload ve yetkisiz rol reddedildi; yazma olmadı |
| Idempotency | Aynı UUID + aynı payload replay no-op; farklı payload `42501` |
| Veri koruma | Bütün sentetik satırlar rollback edildi ve sonrasında bulunmadığı doğrulandı |

**Eski → yeni:** Eskiden yalnız Cariler açık shared kullanıcı **Hesap Seçin**
sheet'inde hesap göremez ve tahsilat/ödeme kaydedemezdi. Yeni istemcide yalnız hesap adı,
türü ve para birimi görünür; tutar/bakiye hiçbir yerde görünmez ve kayıt dedicated dar
RPC ile yapılır.

**1.5.x / eski istemci etkisi:** Eski istemci yeni fonksiyonları çağırmaz; mevcut
ekran, RPC imzası, tablo RLS'i ve boş minimal picker davranışı aynen sürer. Migration
mevcut veriyi silmez, yeniden yazmaz veya dönüştürmez.

**Yeni alt paket cihaz kabul testi:**

1. Rolde yalnız **Cariler** açıkken seviyeyi önce `view` yap. Cari kartı/detayında yeni
   tahsilat/ödeme düğmesi görünmemeli.
2. Seviyeyi `add`, `edit_own` veya `edit_all` yap; uygulamayı arka plan→ön plan yap.
3. Müşteri caride **İşlem Yap** açıldığında yalnız **Tahsilat**, tedarikçide yalnız
   **Ödeme** görünmeli.
4. **Hesap Seçin** sheet'inde aktif hesapların adı, türü ve para birimi görünmeli;
   hiçbir hesap bakiyesi, kart limiti veya `₺0,00` satırı görünmemeli.
5. Küçük bir aynı-para-birimli test işlemi kaydet. Owner hesabında tek işlem oluştuğunu,
   cari ile seçilen hesabın birer kez değiştiğini doğrula.
6. Farklı para birimli küçük bir testte kur ekranının açıldığını ve sonuçların bir kez
   işlendiğini kontrol et. Aynı kaydet düğmesine hızlıca iki kez basıldığında ikinci
   işlem oluşmamalı.
7. Son olarak tam kaynak yetkili owner/shared hesapta normal QTB'nin bütün izinli
   sekmeleri ve mevcut bakiye görünümüyle eskisi gibi çalıştığını doğrula.

### S-12 — İşlem satırında nickname/görünen ad

**Durum: S-12a owner görünümü, S-12b shared-peer tenant projeksiyonu, S-12c atomik
davet etiketi ve S-12d kaynak-modülü/sahiplik daraltması istemci/canlı RPC
katmanında tamamlandı; otomatik ve canlı doğrulama geçti. Cihaz kabulü açıktır.**

Üyelik bazlı `member_label` zaten additive olarak eklenmiş:

`supabase/migrations/20260615000000_add_member_label_to_isletme.sql:1-12`

```sql
-- member_label: İşletme sahibinin paylaşılan kişiye verdiği "görünen ad".
ALTER TABLE isletme_invites ADD COLUMN IF NOT EXISTS member_label TEXT;
ALTER TABLE isletme_users   ADD COLUMN IF NOT EXISTS member_label TEXT;
```

Owner editörü ve mutation da alanı zaten destekliyor:

`src/components/multiUser/UserEditSheet.tsx:130-142`

```tsx
{/* Görünen Ad (owner'ın atadığı tanınır isim) */}
<Input
  value={memberLabel}
  onChangeText={setMemberLabel}
  ...
/>
```

`src/hooks/useMultiUser.ts:220-228`

```ts
if (params.memberLabel !== undefined) {
  updateData.member_label = params.memberLabel;
}
...
.from('isletme_users')
.update(updateData)
```

İşlem query'leri ise global profile e-postasını/adını getiriyor:

`src/hooks/useIslemler.ts:44-54`

```ts
.select(`
  *,
  ...
  creator:profiles!islemler_created_by_profiles_fk(display_name,email)
`)
```

Satır bununla fallback yapıyor:

`src/app/islemler/index.tsx:48-50`

```ts
return islem.creator.display_name || islem.creator.email || null;
```

**Çözüm:**

- `created_by` UUID değişmez; yalnız gösterim etiketi üyelikten çözülür.
- İşlem projeksiyonu yalnız tip×kaynak ve sahiplik filtresinden geçen en az bir
  görünür işlemin `created_by + member_label` etiketini döndürür; permissions JSON
  veya e-posta döndürmez.
- Gösterim sırası:
  `member_label` → güvenli profil display name → “Ortak kullanıcı”.
  E-posta işlem satırında görünmemeli.
- Tek `getTransactionCreatorLabel()` helper'ı ve tek DTO: Tüm İşlemler, hesap, cari,
  personel, ürün, raporlar ve audit yüzeyleri aynı sonucu kullanır.
- Label canlı üyelik etiketi olmalı; owner değiştirdiğinde tarihsel satırlar da yeni
  isimle görünür. Removed üyelik satırları fiziksel silinmemeli.
- İki işletmede aynı kullanıcıya farklı `member_label` testi zorunludur.
- N+1 yapılmamalı; sayfalı işlem projeksiyonunda join/tek RPC ile gelmelidir.

#### Uygulama kaydı — 29 Temmuz 2026 (S-12a)

Mevcut RLS sınırını genişletmeden, owner'ın işlem satırlarında verdiği nickname'i
görmesini sağlayan istemci paketi uygulandı:

- `useTransactionCreatorLabels()` tenant başına
  `get_transaction_creator_labels(uuid)` RPC'sini tek cache'li sorguyla çağırıyor.
  Sonuç yalnız `user_id + member_label` plain object map'ine çevriliyor; satır başına
  sorgu ve `Map/Set` yok.
- Status filtresi bilinçli olarak yok: kaldırılmış/askıya alınmış üyenin tarihsel
  işlemleri owner'ın verdiği etiketi koruyor.
- Tek `getTransactionCreatorLabel()` resolver'ı:
  `member_label.trim()` → `creator.display_name.trim()` → `Ortak kullanıcı`.
  E-posta fallback'i kaldırıldı.
- Resolver tenant eşleşmesini zorunlu tutuyor; linked-cari üzerinden başka işletmeye
  ait işlem aktif işletmenin etiketiyle yanlış adlandırılmıyor. Cari satırındaki
  `otherPartyName || creatorText` önceliği korunuyor.
- Tüm İşlemler, hesap detayı, cari detayı, personel detayı ve ortak rapor
  `EntityTransactionList` yüzeyi aynı resolver'a bağlandı.
- Yeni istemcinin dokuz işlem projection'ı artık creator için yalnız `display_name`
  seçiyor; e-posta response'a alınmıyor. Eski client'ın sorgusu veya DB yetkisi
  değiştirilmedi.

**Eski → yeni:** Eskiden işlem satırı profil adı, hatta e-posta/local-part
(`dilrubarestaurant`) gösterebiliyordu. Şimdi owner'ın üyeye verdiği “Kasiyer Ahmet”
gibi işletmeye özel ad gösteriliyor; label yoksa güvenli profil adı, o da yoksa
“Ortak kullanıcı” yazıyor.

**Cihaz kabul testi:**

1. Owner olarak ortak kullanıcının Görünen Ad alanını `Kasiyer Ahmet` yap.
2. Bu kişinin eski ve yeni işlemlerini Tüm İşlemler, hesap, cari, personel ve
   Raporlar > Cari/Personel işlem listelerinde aç; hepsinde aynı nickname görünmeli.
3. Label'ı değiştir; tarihsel satırlar da yenilenmeli. Başına/sonuna boşluk koyarsan
   ekranda kırpılmış görünmeli.
4. Label'ı boşalt: profil adı; profil adı da boşsa `Ortak kullanıcı` görünmeli.
   E-posta hiçbir işlem satırında görünmemeli.
5. Kendi oluşturduğun işlemde önceki davranış gibi ayrıca creator etiketi çıkmamalı.
6. Linked cari satırında karşı işletme adı nickname tarafından ezilmemeli.
7. Aynı kullanıcı iki işletmede farklı label alıyorsa işletme değiştirince cache'ler
   çapraz karışmamalı.

**S-12b için uygulama öncesi sınır:** Mevcut RLS owner'a bütün üyeleri, shared
kullanıcıya yalnız kendi üyelik satırını gösteriyordu. Bu nedenle temel tablo SELECT'i
genişletilmeden, yalnız `user_id + member_label` döndüren tenant/yetki kontrollü
additive RPC tasarlandı. Aşağıdaki 29 Temmuz kaydı bu açığı kapatır.

**Veri ve eski istemci etkisi:** Migration ve kalıcı veri yazımı yoktur. Mevcut
`member_label` kolonu okunur. Eski client profil/e-posta görünümüne devam eder; yeni
client yalnız kendi sorgusundaki e-posta alanını bıraktı.

**Uygulama öncesi ek tutarsızlık:** Davet oluştururken label davet RPC'sinden sonra
ayrı best-effort UPDATE ile yazılıyordu:

`src/hooks/useMultiUser.ts:70-86`

```ts
const { data, error } = await supabase.rpc('create_isletme_invite', ...);
...
// Best-effort
await supabase.from('isletme_invites').update({ member_label: params.memberLabel })
```

İkinci çağrı kaybolursa davet geçerli, label kayıp olabiliyordu. Mevcut RPC
snapshot'landıktan sonra ayrı atomik owner RPC ile aynı transaction'a alınması
planlandı ve aşağıdaki S-12c kaydıyla uygulandı.

**Eski client:** Additive projection eski client'ı etkilemez. Eski client global
profile/e-posta göstermeye devam eder. Eski creator join'i ancak yeni sürüm yeterince
yayıldıktan sonra daraltılmalıdır.

#### S-12b/S-12c ilk canlı uygulama kaydı — 29 Temmuz 2026

> **Tarihsel gövde:** Bu alt bölüm ilk S-12b/S-12c deployment'ını kaydeder. İlk
> creator RPC gövdesi `search_path=''` kullanıyordu ve kaynak/sahiplik hardening'i
> henüz yoktu. Hemen alttaki S-12d ile güncel canlı fonksiyon
> `search_path=pg_catalog`, tip×kaynak AND ve sahiplik filtrelidir.

- İlk `get_transaction_creator_labels(uuid)` sürümü yalnız işlem oluşturmuş üyelerin
  `user_id + member_label` alanlarını döndürüyordu. Owner veya aynı işletmenin aktif
  shared üyesi çağırabiliyordu; permissions JSON ve e-posta response'a girmiyordu.
  Güncel daha dar davranış S-12d'de tanımlıdır.
- Kaldırılmış/askıdaki üyelerin tarihsel işlem etiketi korunur. Etiket işletme
  bazlıdır; aynı kullanıcı iki işletmede farklı adla çözülebilir.
- Creator-label sorgusu `meta.persist=false` olduğu için bu tenant-bazlı adlar disk
  cache'ine yazılmaz. Ortak resolver ve güvenli fallback sırası korunur.
- `create_isletme_invite_v2(...)` eski davet RPC'sine dokunmadan yeni, sürümlü bir uç
  ekler. Davet kodu ve kırpılmış `member_label` aynı INSERT/transaction içinde yazılır;
  boş değer `NULL`, 100 karakter üstü değer `22001` olur.
- Yeni istemci iki-istekli best-effort UPDATE yerine v2 RPC'yi çağırır.

Canlıya `transaction_creator_labels_rpc` ve
`create_isletme_invite_v2_atomic_label` migration'ları uygulandı. İki fonksiyon da
exact imza, `SECURITY DEFINER`, boş `search_path`, `authenticated` EXECUTE ve kapalı
`anon/PUBLIC` ACL ile doğrulandı.

**Otomatik ve canlı doğrulama:**

| Kontrol | Sonuç |
|---|---|
| Hedef testler | 3 suite, 34/34 test geçti |
| Üretim owner `BEGIN/ROLLBACK` smoke | Creator-label sonuç sayısı eşleşti; boşluklu davet etiketi kırpılarak aynı transaction'da yazıldı |
| Rollback kanıtı | Sentetik davet geri alındı; kalıcı test satırı bırakılmadı |
| İlk deployment sonrası katalog | Exact imza, boş `search_path` ve dar ACL doğrulandı; güncel `pg_catalog` durumu S-12d satırındadır |
| Veri koruma | Migration-time DML/backfill yok; mevcut davet, üyelik, işlem ve profil satırları değişmedi |

**Eski → yeni:** Eskiden shared kullanıcı başka üyelerin işletmeye özel nickname'ini
çözemeyebilir; davet etiketi de davetten sonra yapılan ikinci istek kaybolursa boş
kalabilirdi. Şimdi izinli shared kullanıcı işlem satırında tenant-bazlı etiketi görür
ve yeni davette kod ile görünen ad atomik saklanır.

**1.5.x / eski istemci etkisi:** Eski `create_isletme_invite` imzası ve davranışı
değişmedi; eski istemci onu çağırmaya ve eski creator görünümünü kullanmaya devam eder.
S-12b/S-12c fonksiyonları additive'dir; S-12d aynı creator RPC imzasını koruyan
erişim daraltmasıdır. Kolon silme/yeniden adlandırma, backfill veya mevcut kullanıcı
verisini yeniden yazma yoktur.

**S-12b/S-12c cihaz kabul testi:**

1. Owner olarak ortak kullanıcıya `Kasiyer Ahmet` görünen adını ver; o kişinin eski ve
   yeni işlemlerini owner ile, ardından başka bir aktif shared kullanıcıyla aç. Aynı
   etiket görünmeli; e-posta görünmemeli.
2. Etiketi değiştir; uygulamayı arka plan→ön plan yaptıktan sonra tarihsel satırlar da
   yeni etikete dönmeli. Aynı kişiye ikinci işletmede farklı etiket verildiğinde
   işletme değiştirince adlar karışmamalı.
3. Kaldırılmış/askıya alınmış bir test üyeliğinin eski işleminde tarihsel etiketin
   korunup korunmadığını kontrol et.
4. Yeni davette başına/sonuna boşluk konmuş bir görünen ad gir. Daveti kabul ettikten
   sonra kırpılmış ad işlem satırında görünmeli.
5. Boş görünen adla davet oluştur; fallback profil adı/`Ortak kullanıcı` olmalı.
   100 karakter kabul edilmeli, 101. karakter UI tarafından engellenmeli veya server
   tarafından açık validasyon hatasıyla reddedilmeli.

Bu maddelerde otomatik/canlı doğrulama tamamlanmıştır; yukarıdaki cihaz adımları henüz
kullanıcı tarafından kabul edilmiş sayılmaz.

#### S-12d — Creator-label kaynak ve sahiplik görünürlüğü — 29 Temmuz 2026

S-12b'nin ilk canlı sürümü çağıranın aktif işletme üyesi olmasını denetliyor, fakat
etiketin hangi işlem kaynağından türediğini ve `can_see_all_users_data` sahiplik
eksenini RPC çıktısında ayrıca zorlamıyordu. Güncel canlı veride
`can_see_all_users_data=false` olan tek üyelik için fiilî bir başka-kullanıcı etiketi
dönüşü ölçülmedi; buna rağmen eski fonksiyon gövdesi böyle bir satır oluştuğunda
latent bilgi açığı taşıyordu.

`20260729073717_restrict_transaction_creator_labels_visibility` aynı
`get_transaction_creator_labels(uuid) → TABLE(user_id uuid, member_label text)`
imzasını koruyarak bu sınırı daralttı:

- çağıranın `islemler.can_view` yetkisi zorunludur;
- her işlem tipi `internal.islem_tipi_modulu(type)` ile gerekli kaynak modüllerine
  çevrilir ve bütün modüller AND mantığıyla görünür olmalıdır;
- bilinmeyen veya `NULL` işlem tipi fail-closed elenir;
- owner dışında etiket ancak
  `can_see_all_users_data=true OR transaction.created_by=auth.uid()` koşuluyla
  türetilebilir;
- hedef üyelik aktif olmasa bile yetkili biçimde görülebilen tarihsel işlem etiketi
  korunur;
- permissions JSON, e-posta, işlem tutarı veya başka finansal alan response'a girmez.

**Eski → şimdi:** Eskiden aktif shared kullanıcı, yalnız kapalı Hesaplar/Personel
kaynağında işlem üretmiş bir kişinin `user_id + member_label` bilgisini RPC
payload'ında alabilirdi; sahiplik ekseni de projeksiyonda açıkça uygulanmıyordu.
Şimdi etiket yalnız çağıranın gerçekten görebildiği en az bir işlem satırından
türetilir. Örneğin Cariler-only kullanıcı cari tahsilat/ödeme işlemindeki etiketi
görebilir; yalnız Hesaplar veya Personel kaynağındaki etiketi alamaz. Personel ödemesi
gibi çok kaynaklı tiplerde gereken bütün modüller açık olmalıdır.

**Eski istemci ve veri etkisi:** Kolon, tablo, policy veya veri değişmedi; DML ve
backfill yoktur. 1.5.x bu RPC'yi kullanmaz. RPC'yi kullanan yeni istemcilerde dönüş
şekli aynı kalır; yalnız daha önce yetkisiz alınabilen peer etiketi artık gelmez.
Owner ve kaynak modülleri tam yetkili ortakların görünümü değişmez. Query diske
yazılmaz; izin daralınca cache temizlenir. İzin genişlemesinde en fazla mevcut beş
dakikalık kozmetik etiket gecikmesi olabilir.

**Otomatik ve canlı doğrulama:**

| Kontrol | Sonuç |
|---|---|
| Hedef migration sözleşmesi | 10/10 test geçti |
| Geri-almalı üretim matrisi | Owner, tam yetkili, own-only, Cariler-only, kaynak-modülsüz, bilinmeyen seviye ve cross-tenant vakaları geçti; sentetik değişiklikler rollback edildi |
| Performans | İlk çapraz-join taslağı bırakıldı; scalar resolver + `LIMIT 1` planı yaklaşık `5.59..9.51` maliyete indi ve mevcut indeksleri kullandı |
| Canlı katalog | Exact imza/çıktı, `SECURITY DEFINER`, `search_path=pg_catalog` ve ACL doğrulandı |
| Veri koruma | Migration-time DML/backfill yok; üyelik, işlem ve etiket satırları değişmedi |

**S-12d cihaz kabul testi:**

1. Owner ve bütün kaynak modülleri açık ortak, başka kullanıcının izinli işlemlerinde
   nickname'i eskisi gibi görmeli.
2. `can_see_all_users_data=false` ortak yalnız kendi işlem satırlarını görmeli; kendi
   satırında ayrıca creator adı çıkmamalı.
3. Yalnız Cariler açık ortakta cari tahsilat/ödeme satırındaki nickname görünmeli;
   Hesaplar/Personel/Ürünler kaynaklı satırlar ve bunların creator etiketleri
   görünmemeli.
4. Owner etiketi değiştirdiğinde yetkili biçimde görülen eski satırlar yenilenmeli.
5. Kaldırılmış bir üyenin yetkili biçimde görülen tarihsel işleminde etiket korunmalı.
6. İşletme değiştirildiğinde iki işletmenin nickname'leri birbirine karışmamalı.

Telefon turu görünümü doğrular; RPC payload'ında gizli peer etiketi bulunmadığının
sunucu kanıtı yukarıdaki geri-almalı doğrudan RPC matrisidir.

---

## I.8. Rehberden kişi seçme

### S-13 — Cari/personel telefonunu cihaz rehberinden almak

**Durum: İstemci/native config, gizlilik metinleri ve otomatik doğrulama tamamlandı;
yeni binary ile cihaz kabulü açık. DB şeması değişmedi.**

Cari ve personel formu bugün yalnız manuel input kullanıyor:

`src/app/cariler/ekle.tsx:173-180`

```tsx
<Input
  label={t('clients:form.phoneOptional')}
  keyboardType="phone-pad"
  value={phone}
  onChangeText={setPhone}
/>
```

`src/app/personel/ekle.tsx:153-175`

```tsx
<Input ... value={firstName} ... />
<Input ... value={lastName} ... />
<Input
  label={t('staff:form.phoneOptional')}
  keyboardType="phone-pad"
  value={phone}
  onChangeText={setPhone}
/>
```

`package.json` içinde `expo-contacts`, `app.json` içinde contacts plugin/izin açıklaması
yoktur.

**Önerilen akış:**

1. `npx expo install expo-contacts` ile SDK 54 uyumlu native sürümü çöz.
2. “Rehberden seç” yalnız kullanıcının açık dokunuşuyla sistem kişi seçicisini
   (`presentContactPickerAsync`) açsın; bütün rehber topluca çekilmesin.
3. Seçim iptalinde mevcut alanlar değişmesin. Kişide numara yoksa anlaşılır mesaj ve
   manuel giriş kalsın.
4. Birden fazla telefon varsa küçük seçim sheet'i göster.
5. Cari: ad alanı boşsa kişi adı/şirket adı öner; telefon doldur. Personel:
   first/last name alanlarını mümkünse ayrı doldur.
6. Mevcut dolu alanlar sessizce ezilmesin: “Yalnız numarayı al” / “Ad ve numarayı al”.
7. Sistem picker'ın ilgili platformda ek read izni gerektirdiği durumda izin yalnız
   butona basınca istenir; ret/kalıcı ret manuel akışı bozmaz.
8. Uygulama rehbere yazmıyor; config plugin'in ekleyebileceği gereksiz
   `WRITE_CONTACTS` izni Android `blockedPermissions` ile kapatılmalı.
9. Web/API unavailable durumda buton gizlenir veya manuel fallback'e döner.

**Telefon normalizasyonu:** DB kolonları `VARCHAR(20)`:

`supabase/migrations/20260101100000_cariler_customers_and_suppliers.sql:5-8`

```sql
name VARCHAR(255) NOT NULL,
...
phone VARCHAR(20),
```

`supabase/migrations/20260101110000_business_personnel_table.sql:5-8`

```sql
first_name VARCHAR(100) NOT NULL,
last_name VARCHAR(100) NOT NULL,
phone VARCHAR(20),
```

Formlar bugün yalnız `trim()` yapıyor (`src/app/cariler/ekle.tsx:74-79`,
`src/app/personel/ekle.tsx:108-113`). Rehberdeki formatlı/extension'lı numara genel DB
hatasına dönüşebilir. Manuel ve rehber girişi aynı helper'dan geçmeli:

- `+` ve rakamları güvenli normalize et;
- extension varsa sessizce kesme, kullanıcıya bildir;
- normalize edilmiş uzunluğu doğrula;
- aynı işletmede normalize telefon eşleşirse uyar, fakat kullanıcı kararını engelleme.

**Gizlilik/release:** Mevcut gizlilik metni telefonu yalnız “kullanıcı tarafından
girilen” opsiyonel veri sayıyor ve cihaz erişimlerinde rehber yok
(`docs/privacy-policy.html:153-174`). TR/EN politika ve store beyanları şu anlamla
güncellenmeli: yalnız seçilen kişi işlenir; bütün rehber sunucuya yüklenmez; ad/telefon
ancak kullanıcı Kaydet derse cari/personel verisi olur.

[Expo Contacts](https://docs.expo.dev/versions/v54.0.0/sdk/contacts/) resmi platform
davranışı release sırasında tekrar doğrulanmalıdır.

**Eski client:** DB migration yoktur. Native modül/izin yeni binary gerektirir; eski
binary'ye uyumsuz OTA gönderilmez.

#### S-13 uygulama kaydı — 29 Temmuz 2026

- SDK 54 ile uyumlu `expo-contacts ~15.0.11` eklendi. Dört telefon alanı
  (`Cari ekle/düzenle`, `Personel ekle/düzenle`) ortak
  `DeviceContactPickerButton` bileşenini kullanıyor.
- Uygulama bütün rehberi sorgulamıyor. Yalnız kullanıcının dokunuşuyla
  `presentContactPickerAsync()` açılıyor; seçilen kişinin yalnız ad/şirket/ad-soyad
  parçaları ve telefon numaraları geçici olarak forma aktarılıyor. Contact ID, e-posta,
  fotoğraf veya bütün kişi nesnesi saklanmıyor ve loglanmıyor.
- Android rehber izni yalnız düğmeye basılınca isteniyor. iOS sistem kişi seçicisi için
  ayrıca izin isteği başlatılmıyor. Ret, kalıcı ret, iptal, API unavailable ve numarasız
  kişi durumlarında mevcut form alanları korunuyor; manuel giriş çalışmaya devam ediyor.
- Birden fazla numara varsa sistem seçicisi tamamen kapandıktan sonra, iOS
  modal-üstü-modal yarışına girmeyen kaydırılabilir küçük seçim sheet'i açılıyor.
  Farklı biçimde yazılmış aynı numaralar normalize anahtarıyla tekilleştiriliyor.
- Cari eklemede ad boşsa seçilen kişi adı/şirket adı öneriliyor; dolu ad ezilmiyor.
  Personel eklemede yalnız boş ve sistemden ayrı gelen ad/soyad alanları dolduruluyor.
  Düzenleme ekranlarında rehber seçimi isimleri değiştirmiyor.
- `src/lib/phone.ts` manuel ve rehber girişini aynı kayıt sözleşmesine bağladı:
  baştaki `+` korunuyor, görsel ayraçlar temizleniyor, ülke kodu tahmin edilmiyor,
  dahili/pause sessizce kesilmiyor ve normalize edilmiş değer `VARCHAR(20)` sınırında
  doğrulanıyor. Kullanıcı düzenleme formundaki eski telefonu hiç değiştirmediyse legacy
  biçim aynen korunuyor.
- `app.json` contacts plugin'i, Android `WRITE_CONTACTS` engeli ve iOS PhoneNumber
  privacy bildirimiyle güncellendi. TR/EN iOS kullanım açıklamaları, uygulama içi yasal
  metinler ve iki statik gizlilik politikası seçilen-kişi sınırını açıkça anlatıyor.
- 30 Temmuz'da raporda önerilip ilk pakette eksik kalan mükerrer-numara uyarısı
  tamamlandı. Cari/Personel ekle ve düzenle formları normalize edilmiş telefonu,
  kullanıcının mevcut tenant ve modül yetkileriyle görebildiği cari/personel
  kayıtlarıyla çapraz karşılaştırır. Eşleşen kayıt adları gösterilir; **İptal** hiçbir
  veri yazmaz, **Yine de kaydet** bilinçli olarak kayda devam eder. Düzenlenen kaydın
  kendisi hariç tutulur; telefon hiç değişmediyse legacy değer için gereksiz uyarı
  yeniden açılmaz. Bu bir benzersizlik kısıtı değil, kullanıcıya yardımcı olan
  engellemeyen bir uyarıdır; erişilemeyen kayıtların adı veya varlığı sızdırılmaz.

**Eski → yeni:** Eskiden telefon yalnız manuel yazılıyor, biçimli veya dahili içeren uzun
bir değer genel DB hatasına düşebiliyordu. Şimdi rehber ikonu sistem kişi seçicisini açıyor;
seçim ve manuel giriş aynı anlaşılır kayıt doğrulamasından geçiyor. Eskiden aynı
numara fark edilmeden birden fazla kayda yazılabiliyordu; şimdi görünür bir eşleşme
varsa adlarıyla uyarılıyor, son karar yine kullanıcıya bırakılıyor.

**Cihaz kabul testi — yeni native binary:**

1. Cari ekle → Detaylar → telefon satırındaki rehber ikonuna bas. Android'de ilk
   dokunuşta izin isteği gelmeli; iOS'ta ayrıca uygulama-geneli rehber izin ekranı
   açılmadan sistem kişi seçicisi görünmeli.
2. Tek numaralı kişi seç: telefon dolmalı. Cari adı boşsa ad/şirket önerilmeli; önceden
   dolu ad değişmemeli.
3. Çok numaralı kişi seç: kaydırılabilir numara sheet'i açılmalı ve seçilen numara forma
   gelmeli. Seçiciyi ve sheet'i ayrı ayrı iptal ettiğinde mevcut form değişmemeli.
4. Numarasız kişi, Android izin reddi ve mümkünse kalıcı ret akışlarında anlaşılır mesaj
   görünmeli; numarayı elle yazabilmelisin.
5. Personel eklemede boş ad/soyad ayrı alanlardan dolmalı. Cari/Personel düzenlemede
   rehber seçimi yalnız telefonu değiştirmeli.
6. Eski biçimli bir telefonu değiştirmeden yalnız not/pozisyon kaydet; telefon biçimi
   aynı kalmalı.
7. `+90 (532) 123 45 67` kaydedildiğinde `+905321234567` olmalı.
   `0555 123 45 67 x12` dahili uyarısı vermeli. Normalize 20 karakter kabul, 21 karakter
   reddedilmeli.
8. Web'de rehber ikonu görünmemeli; manuel telefon alanı çalışmalı.
9. Kayıtlı bir numarayı farklı biçimde (`0555 123 45 67` → `0555-123-45-67`) yeni
   Cari/Personel kaydına gir. Uyarıda yalnız görmeye yetkili olduğun eşleşen kayıtlar
   görünmeli; **İptal** kayıt oluşturmamalı, **Yine de kaydet** oluşturmalıdır.
10. Düzenlemede telefonu başka kaydın numarasıyla değiştirince uyarı çıkmalı; telefonu
    değiştirmeden yalnız not/adres/pozisyon güncellenince uyarı çıkmamalıdır.

**Otomatik doğrulama:** Ana oturumda TypeScript geçti; hedef ESLint 0 hata verdi.
Telefon/picker sözleşmeleri ilk turda 2 suite ve 37/37 test olarak geçti. Mükerrer
telefon helper'ı, izin-kapsamlı form tüketimi, iptal/teyit ve unchanged-edit
sözleşmeleri eklendikten sonra ilgili iki suite 47/47; S-06 ile birleşik ana tur
7 suite / 70/70 test geçti. Expo config introspection,
Android final manifestinde `READ_CONTACTS` bulunduğunu ve `WRITE_CONTACTS` kaydının
`tools:node="remove"` ile çıkarıldığını; iOS kullanım açıklamasının çözüldüğünü doğruladı.

**30 Temmuz cihaz sonucu:** İzin-kapsamlı mükerrer telefon uyarısı kullanıcı tarafından
“tamam” olarak kabul edildi. Sistem kişi seçicisinin iOS/Android yeni-native-binary
matrisi bu kabulden ayrıdır ve yukarıdaki adımlarla release öncesi korunur.

**Veri ve eski istemci etkisi:** Migration, DDL, DML veya backfill yoktur. Eski kayıtlar
değişmedi. Eski binary manuel girişe devam eder. `expo-contacts` native modül olduğu için
bu paket eski mağaza binary'sine OTA olarak gönderilmez; yeni binary gerekir.

---

## I.9. Ek genel taramada bulunan tutarsızlıklar

Bu maddeler yukarıdaki saha konularına bağlıdır; ayrı ve kontrolsüz bir “iyileştirme
havuzu” değildir.

| Ek ID | Doğrulanmış tutarsızlık | Bağlı iş | Plan |
|---|---|---|---|
| E-01 | Banner state'i TanStack `onlineManager` ile bağlı değildi | S-01 | Tek connectivity store ile kapandı; cihaz kabulü tamamlandı |
| E-02 | İleri tarihli completion atomik create ve tahsis motorunu atlıyordu | S-02 | Mevcut RPC motoruna taşındı; cihaz kabulü tamamlandı |
| E-03 | Ürün/Kategori ve bağlı form aileleri ortak keyboard-footer sözleşmesinde değildi | S-04 | Ortak iskelet uygulandı; 30 Temmuz tam envanter denetimi temiz |
| E-04 | Cari/Personel iOS clipping ve asenkron vade/izin/header sıçraması | S-06 | İki paketle kapandı; 30 Temmuz cihaz turu olumlu |
| E-05 | Eşit sort ve ürün metrik query sonrası canlı yeniden sıralama | S-06 | Deterministik tie-breaker + top-anchored snapshot; cihaz turu olumlu |
| E-06 | Root header stili ile cari glass pilotu miras açısından çelişiyordu | S-05 | Tek opaque native-header sözleşmesi + bütün route envanteriyle kapandı |
| E-07 | Kategori silme dört bağımsız update + soft-delete idi | S-09 | Yeni istemcide owner RPC ile kapandı; eski binary sınırını izle |
| E-08 | Edit/delete/copy aksiyonları bazı yüzeylerde tek `canDelete` kararına bağlıydı | S-10 | Aksiyon bazlı guard uygulandı; owner-only ham-ref sınırını koru |
| E-09 | `useMonthSummary` hook-içi kapı tamamlandı; diğer rapor uçlarında kaba UI kapısı/direct-RPC delta'sı sürüyor | S-08 / Bölüm II D10 | Rapor RPC'lerini uç bazında çift kapıya tamamla |
| E-10 | Davet nickname'i iki istekte best-effort yazılıyor | S-12 | Atomik davet |
| E-11 | Server 2–48 taksit desteklerken UI 10 dahil birçok adedi seçtirmiyordu | S-07 | 2–48 stepper + 10 dahil hızlı chiplerle kapandı |
| E-12 | Küçük toplam/yüksek adet `0,00` taksit üretebiliyordu | S-07 | Integer-kuruş ve `toplamKurus >= adet` guard'ıyla kapandı |
| E-13 | Telefon alanı 20 karakter, formlar ham metni sınırsız gönderiyordu | S-13 | Merkezi normalize/validate ile kapandı; legacy dokunulmamış değer korunuyor |
| E-14 | Cari action sheet initialization sırası ve dependency'si düzeltildi | S-06 / Liste UX | Regresyon sözleşmesini koru |
| E-15 | Taksit submit önizlemeyi yeniden hesaplıyor ve eski plan toplamını yazma öncesi doğrulamıyordu | S-07 | Exact plan payload + stale/invariant guard sözleşmesiyle kapandı |
| E-16 | ESLint baseline'ı 0 hata fakat 104 mevcut uyarı; kritik hook uyarıları gürültüde kalabilir | Kod kalitesi | Kullanıcı-facing bug kabulünden ayrı, önceliklendirilmiş warning ratchet; yeni paket uyarı eklemez |
| E-17 | Shared kategori seçicileri owner-only yazma kapanmasına rağmen base tabloda `select('*')` kullanıyor | S-09 takip | ✅ Dar server RPC canlı → ⏳ picker görünüm kararı/client geçişi → ⏳ minimum sürüm → ⏳ base SELECT daraltma |
| E-18 | Kategori seçimiyle eşzamanlı pasifleştirme ve bağı olan kategorinin tip değişimi server guard'ına bağlı değil | S-09 takip | Atama/tip tutarlılığını additive RPC guard'ıyla kilitle |
| E-19 | Yeni istemcide copy-on-write sırası tamamlandı; P0-S6B kanonik upload + not fotoğrafı zarfı canlı, işlem fotoğrafı nihai sınırı ve orphan retention açık | P0-S6A istemci hazır / P0-S6B server canlı / P0-S1 bağımlılığı açık | Yeni dosya → DB pointer → eski dosya ve pointer-clear → cleanup korunur; 41 orphan otomatik silinmedi, P0-S1 sonrası işlem fotoğrafı bağlı-kayıt Storage policy'si + ayrı dry-run retention tasarlanır |
| E-20 | Detay deep-link reddi yalnız yüklenmiş işlem sayfasında kesin; Cari sayfalamasında henüz yüklenmemiş eski bir işlem “bulunamadı” ile karışabilir | S-10 takip | ID-bazlı dar lookup + izin sonucu; liste sayfalamasından bağımsız fail-closed deep-link çözümü |
| E-21 | Bağlantılı Cari yazma kapısı istemcide pending/error/offline/downgrade sırasında normal + ileri tarihli yüzeylerde fail-closed yapıldı; ancak mutation anında link `permission`ını yeniden doğrulayan sunucu kapısı yok | S-10 takip / Bölüm II | Cari-link `full` kontrolünü işlem create/update/delete/tamamlama RPC'sinde yeniden doğrula; tip→kaynak-modül kesişimiyle iki kiracılı negatif test |

**E-14 kapanışı — Cari action sheet sıralaması:** İlk raporda
`actionSheetOptions`, `mergedCariler` lexical binding'inden önce hesaplanıyor ve
dependency listesinde birleşik listeyi taşımıyordu. Güncel kodda birleşik liste önce
oluşturulur; action sheet memo'su sonra çalışır ve `mergedCariler` dependency'sini
açıkça taşır. Regresyon sözleşmesi bu initialization sırasını kilitler.

**E-15 kapanışı — taksit stale planı:** İlk rapordaki submit callback'i eski
`taksitPlan` değerini tutabiliyor ve tutarları kaydetme anında yeniden dağıtıyordu.
Güncel S-07 motorunda committed plan güncel tutar/tarih invariantlarıyla doğrulanır;
aynı `plan.rows` referansı fingerprint ve `p_taksitler` payload'ına gider.
`installmentSubmitContract.test.ts` stale-plan reddini ve preview→RPC eşitliğini
kilitler; 30 Temmuz hedef turunda iki taksit suite'i 27/27 yeşildir.

**E-16 yaklaşımı:** 110 uyarı topluca `eslint --fix` ile değiştirilmemeli. Finansal
submit, yetki guard, liste veri kaynağı ve effect/callback stale-closure uyarıları P1
ratchet'e alınmalı; her paket dokunduğu dosyada yeni uyarı sayısını artırmamalı ve ilgili
mevcut uyarıyı kapatmalıdır. Salt kullanılmayan import/estetik uyarılar ayrı mekanik
pakette ele alınabilir.

Bu eklerin dışında Bölüm II'deki mevcut P0 güvenlik bulguları — Edge Function yetki
yükseltme, Storage politikaları, tip/modül kesişimi, rapor ve projection sınırları —
geçerliliğini korur. Yeni saha planı onları silmez veya önceliğini düşürmez.

---

## I.10. Uygulama paketleri ve bağımlılık sırası

### Paket 0 — Release eşleştirme ve ölçüm

**DB yok, migration yok.**

- Ayarlar/Tanılama'da app version, native build, Expo update ID ve mümkünse git short
  SHA göster.
- S-03/S-04/S-05'i bu build'de gerçek cihazda tekrar et.
- Liste stres loglarını yalnız debug/diagnostic flag altında ekle.
- Saha kaydı şablonu: cihaz/OS, app version/build/update ID, işletme büyüklüğü,
  ağ tipi, adımlar ve ekran kaydı zamanı.

Çıkış ölçütü: “eski build mi, güncel kod regresyonu mu?” her görüntü için kesinleşmiş.

### Paket 1 — P0 finansal güvenilirlik ve ağ durumu

**S-01 ve S-02 kod, otomatik doğrulama ve kullanıcı cihaz kabulüyle tamamlandı.**

- [x] İleri tarihli completion → mevcut atomik create/tahsis motoru.
- [x] Kart bazlı pending ve deterministic exact-source probe.
- [x] Connectivity store, `expo-network`, `onlineManager`, backend state ayrımı.
- [x] Banner overlay/sabit geometri.
- [x] Finansal mutation retry/reconnect kuyruğu/dehydrate kapıları.

Çıkış ölçütü: Zayıf ağ/çift denemede tek finansal sonuç; yanlış “internet yok” yok;
liste viewport'u banner nedeniyle değişmiyor.

### Paket 2 — Yetki sunucu sınırları

**Migration ön koşulu:** Additive ve mevcut kullanıcı verisini silmeyen/değiştirmeyen
paketler 27 Temmuz yedeğiyle ilerleyebilir. `DROP`, kolon/tip değişikliği, veri silme
veya toplu backfill gerekirse ayrıca uygulama onayı + yeni tam yedek zorunludur.

- [x] Dashboard `get_income_expense_summary` guard, kaynak modül ve creator görünürlüğü
  kesişimi.
- [ ] Diğer rapor RPC'lerinde kaynak modül/creator görünürlüğü tamamlama:
  `get_income_by_source`/V2 dilimi canlı ve yeni istemci hazır; sıradaki
  `get_product_report` ve kalan rapor/özet uçlarıdır
  (Bölüm II D10 / genel rapor-RPC backlog'u).
- [x] Kategori write owner-only restrictive RLS ve yeni istemcide atomik soft-delete.
- [x] Server: `get_kategori_secim_referanslari` ile aktif kategorileri yalnız
  `id/name/type/color` olarak döndüren P-B korumalı dar uç canlı.
- [ ] Client: shared kategori seçicilerini dar uca taşıma. Mevcut picker `icon` ve
  `parent_id` kullandığı için düz liste/generic ikon kararı verilmeden kör geçiş yok.
- [ ] Minimum güvenli istemci sürümü yayıldıktan sonra shared temel kategori
  `SELECT *` yüzeyini daraltma.
- [x] Minimal hesap referans projeksiyonu + dedicated dar cari nakit RPC.
- [x] İşlem creator label shared-peer projeksiyonu + atomik davet etiketi v2 +
  kaynak-modülü/sahiplik daraltması.
- [x] Ürün hareketinde U açık/C kapalı profil için yalnız `urun_hareket_id` +
  `cari_name` döndüren additive minimal projeksiyon (C9).
- [ ] Kalan mevcut RPC'lerde imza/çıktı snapshot + diff; yeni uçlar additive.
- Bölüm II'deki daha geniş P0 RLS/RPC/Storage/Edge planıyla tek migration serisine
  yerleştir.

Çıkış ölçütü: İki kiracılı negatif test; doğrudan REST/RPC; başarı ve hata payload'ında
kapalı kolon/tutar/e-posta yok.

### Paket 3 — Yetki UX ve istemci fail-closed

**DB'den bağımsız başlanabilir.**

- [x] Merkezi hata sınıflandırma.
- [x] `canUpdate/canDelete/canCreate` ayrımı; shared edit/copy ve tip-modül hazır olmayan
  delete yüzeyleri fail-closed.
- [x] Rapor ve detay satırı giriş kapıları; sayfalı/boş liste deep-link lookup'u E-20
  olarak açık.
- [x] Minimal picker ve creator label DTO tüketicileri.
- [x] Permission daralınca memory/disk cache temizliği.
- [x] Cari-link durumu pending/error/offline/downgrade iken normal ve ileri tarihli
  yazma yüzeyleri ile bekleyen Geri Al silmesini fail-closed kapatma.
- [x] Ürün `view` profilinde liste/satır/detay/FAB/QuickUrunBar yazma yüzeylerini tek
  create kapısına bağlama; izin daralmasında açık yüzeyi kapatma (C1, telefon bekliyor).
- [x] Mutabakat Cariler deep-link guard'ı ve `view` seviyesinde ekleme/bakiye
  düzeltme/QTB kapıları (C5, telefon bekliyor).
- [x] Foto-import provider'ını owner guard'ın arkasında mount etme (C6, telefon
  bekliyor).
- [x] Legacy purchaser'ı izinlerini koruyan düzenlenebilir custom role eşleme ve cache
  fallback'ini açık `level` kayıtlarında deny-by-default yapma (C7/C8, telefon
  bekliyor).
- [x] Cari/personel empty-state CTA'ları ile Daha işletme kartını gerçek yeteneğe göre
  gösterme (C10, telefon bekliyor).
- [x] Hesap/personel ileri tarihli, izin ekleme ve açılış bakiyesi yüzeylerini güncel
  yetenek daralmasında kapatma (C2, telefon bekliyor).
- [x] Cari/personel tam-geçmiş bilinen-ID sorgularını kaynak modülünde fail-closed ve
  shared disk cache dışında tutma (C3 istemci savunması; server projection açık).
- [~] Transaction create/update/delete ve doğrudan ürün mutation hook'ları tip,
  kaynak görünürlüğü, aksiyon, tenant ve satır-sahipliğinde istemcide fail-closed;
  iki-aşamalı stok yolları ile server-authoritative atomik v2 kapanışı açık (C4).
- [x] Public ekstre süre seçiminde yeni istemciden `null/süresiz` kaldırıldı; ortak
  kullanıcı 1/7/30, owner 1/7/30/365 günle sınırlandı; P0-S10 server kapanışı da
  canlıdır (C12).
- [~] Fotoğraf DB/Storage copy-on-write sırası yeni istemcide tamamlandı; P0-S6B
  kanonik upload + not fotoğrafı zarfı canlıdır. 286 nesne ve 41 orphan uygulama
  sonrasında aynı kaldı; işlem fotoğrafının P0-S1'e bağlı nihai server sınırı ile
  ayrı orphan retention cleanup'ı açıktır (E-19, P0-S6A/P0-S6B).
- [ ] Cari-link mutation anı server permission doğrulaması; E-21.

Çıkış ölçütü: Başkasının kaydı, modül reddi, validasyon ve ağ hatası birbirine
karışmıyor.

### Paket 4 — UI geometri ve liste stabilitesi

**Kod ve otomatik doğrulama tamamlandı; S-06 cihaz turu olumlu, S-03/S-04/S-05
görsel kabulü açık.**

- [x] Küçük ekran/büyük yazı için bounded-scroll ActionSheet.
- [x] Bütün ana form ailelerinde klavyeye duyarlı footer sözleşmesi.
- [x] Bütün route/header dosya envanteri ve yeni-route regresyon kapısı.
- [x] iOS clipping, deterministik comparator, asenkron dekorasyon/header snapshot'ı.
- [x] Etkisi kanıtlanmayan toplu FlashList dönüşümü yapılmadı.

Çıkış ölçütü: 650+ kayıt, cold cache ve ağ geçişinde kullanıcı dokunmadan offset
değişmiyor.

### Paket 5 — Taksit planı

**Kod ve otomatik doğrulama tamamlandı; cihaz kabulü açık.**

- [x] Integer-kuruş helper + Jest.
- [x] Düzenlenebilir satır önizlemesi ve kilitli satır yeniden dağıtımı.
- [x] 2–48 stepper, küçük toplam guard.
- [x] Preview payload eşitliği.

Çıkış ölçütü: Belge örneği birebir; her planın toplamı işlem toplamına kuruş düzeyinde
eşit.

### Paket 6 — Rehber ve native release

**Kod, config, gizlilik ve mükerrer telefon uyarısı tamamlandı; mükerrer uyarı cihazda
kabul edildi, sistem picker yeni-binary matrisi açık.**

- [x] `expo-contacts` + `expo-network`.
- [x] İzin/config/privacy/store beyanları.
- [ ] iOS/Android gerçek cihaz kişi seçici release matrisi.
- [x] Manuel giriş ve web fallback.

Çıkış ölçütü: Bütün rehber okunmadan tek kişi seçimi; ret/iptal halinde veri kaybı yok.

---

## I.11. Eski istemci ve migration etki matrisi

| Değişiklik | DB | 1.5.x etkisi |
|---|---|---|
| İleri tarihli completion | Additive yeni RPC + dar status trigger; mevcut create RPC imzası korunup `search_path` sertleştirildi | Eski completion yolu sürer; yalnız kaynak oluşmuş tamamlanmış planı tekrar pending'e açamaz |
| Ağ store/banner/list/form/taksit UI | Yok | Davranışı değişmez |
| `expo-network` / `expo-contacts` | Native binary | Eski binary'ye uyumsuz OTA verilmez |
| Dashboard RPC guard | Mevcut imzayı koruyan server değişikliği | Rapor kapalı eski ortak boş/0 veya yetki hatası görebilir |
| Gelir kaynağı raporu (P0-S8 ikinci dilim) | Additive `get_income_by_source_v2` + aynı imza/8 kolonlu V1 sarmalayıcısı; `20260729194510` canlı. Tablo/kolon/satır DML'i ve backfill yok | 1.5.x V1'i çağırmaya devam eder fakat sunucu artık `Raporlar AND kaynak modülü AND sahiplik` filtresi uygular; kısıtlı ortak kullanıcı daha az/boş sonuç görür. Owner görünümü tenant-tutarlı veride aynı kalır; hatalı çapraz-tenant kaynağa bağlı tek rapor girdisi artık yanlış adla görünmez |
| Ürün alış/satış raporu (P0-S8 üçüncü dilim) | Additive `get_product_report_v2` + aynı 4 parametre/9 kolonlu V1 sarmalayıcısı; `20260729201911` canlı. Tablo/kolon/satır DML'i ve backfill yok | 1.5.x V1'i çağırmayı sürdürür; owner sonucu değişmez. Shared kullanıcı artık `Raporlar AND Ürünler AND own/all` kapsamında daha az/boş sonuç alabilir. Eski binary'nin önceden persist ettiği offline aggregate cache'i sunucudan silinemez; yeni istemci `s6` ve `persist:false` ile onu devralmaz |
| Kategori write owner-only | Additive restrictive RLS + yeni RPC | Eski shared buton görünebilir; INSERT 42501, UPDATE/DELETE 0-row dönebilir. Eski çok-istekli akış ürün bağını önce temizleyebileceğinden ürün kategorisi ayrıca kontrol edilir |
| Minimal hesap referans ucu + dar cari nakit create | Additive iki yeni RPC; `20260729035945_add_cari_cash_minimal_rpcs` canlı | Eski client yeni uçları çağırmaz; mevcut boş picker/genel işlem yolları sürer |
| P0-S2 server-authoritative V2 create | Additive `create_islem_atomik_v2(uuid,jsonb)`; `20260729121123_create_islem_atomik_v2` canlı. İlk yeni-client dilimi yalnız QTB'deki yeni normal, viewer olmayan gelir/gider/transfer create'lerini V2'ye taşır; server/DB için ek migration veya veri yazımı yoktur. Diğer yollar ve legacy uçlar açık kalır | **Sıfır etki:** 1.5.x yeni RPC'yi çağırmaz ve legacy create/bakiye yolunu aynen kullanır |
| Creator `member_label` owner görünümü (S-12a) | Yok; mevcut kolon minimal client sorgusuyla okunur | Eski client eski profile/e-posta yoluna devam eder |
| Creator shared-peer projeksiyonu (S-12b) | Additive `get_transaction_creator_labels`; canlı | Eski client yeni ucu çağırmaz |
| Davet label'ını atomik yapmak (S-12c) | Additive sürümlü `create_isletme_invite_v2`; eski imza korunur; canlı | Eski davet akışı değişmeden çalışmaya devam eder |
| Creator label kaynak/sahiplik daraltması (S-12d) | Mevcut `get_transaction_creator_labels` imzası ve iki kolonlu çıktısı korunarak yalnız yetkili işlem kaynaklarından etiket türetilir; `20260729073717` canlı | 1.5.x RPC'yi çağırmaz. RPC kullanan sürüm çökmez; yalnız yetkisiz peer etiketi artık görünmez |
| Dar kategori seçim referansı | Additive `get_kategori_secim_referanslari(id,name,type,color)`; `20260729071904` canlı. Temel kategori SELECT/RLS değişmedi | 1.5.x yeni ucu çağırmaz; mevcut kategori görünümü aynı kalır. Client geçişi ikon/hiyerarşi kararı sonrası yapılacak |
| `undo_import_batch` owner/tenant/kilit koruması (P0-S3) | İmza ve JSON sonucunu koruyan `CREATE OR REPLACE`; `20260729084545` canlı. Tablo/kolon/backfill yok | Owner'ın normal geri alma akışı sürer; anon/shared/cross-tenant çağrı artık yazmadan reddedilir |
| Notlar aksiyon/bağlam/sahiplik kapanışı (P0-S9) | İmza/kolon silmeyen policy + trigger + dar `not_guncelle_v1`; `20260729112129` canlı. Mevcut 56 satıra DML/backfill yok | Eski INSERT payloadı trigger ile sahiplenir; izin dışı yazma 401/403 veya sıfır satır alır. Add-only eski fotoğraf ekleme akışı dar uyumluluk kapısıyla sürer |
| Public ekstre yaşam döngüsü (P0-S10) | Mevcut create/cancel RPC imzaları korunarak `20260729112753` phase-1, Edge v6 ve `20260729113246` phase-2 canlı | Owner 30 günlük normal akışını sürdürür; NULL/süresiz, ara süre ve shared 365 artık reddedilir. Üreticinin Cariler izni kapanırsa mevcut link bir sonraki açılışta geçersiz olur |
| İşlem fotoğrafı copy-on-write (P0-S6A) | DB migration yok; yalnız yeni istemci yaşam döngüsü | Eski client eski sıralamayı sürdürür. Yeni build yeni obje → DB pointer → eski obje sırasını kullanır; 41 mevcut sahipsiz obje otomatik silinmedi |
| Kanonik upload + not fotoğrafı Storage zarfı (P0-S6B faz-1) | **Canlı.** `20260729184053`; 4 internal helper + 4 restrictive policy + 2 valid/ready partial index. Top-level DML/backfill/kolon değişimi yok; 286 nesne ve 41 orphan aynı, mevcut nesne silinmedi | 1.5.x kanonik `upsert:false` Storage INSERT + SELECT akışını sürdürür; tablo/imza değişmedi. Bozuk/sahte/yetkisiz upload ve Storage UPDATE 403 alır. Peer orphan cleanup reddi DB not işlemini geri çevirmez |
| Shared hesap hareketi projeksiyonu (P0-S7 ilk dilim) | **Sunucu canlı, istemci yerelde hazır.** `20260729182030`; yalnız yeni 18 kolonlu salt-okunur RPC, temel tablo/policy/mevcut RPC/index ve satırlar değişmedi | Migration tek başına 1.5.x'i etkilemez; eski geniş sorgu sürer. Yeni client artık server-first sırası sağlandığı için cihaz testinden sonra yayımlanabilir; shared export/ileri-tarihli geçici owner-only olur |
| Shared personel işlem/izin projeksiyonu (P0-S7 personel dilimi) | **Sunucu canlı, istemci yerelde hazır.** `20260729204756`; yeni 14 kolonlu işlem RPC'si + üç kolonlu izin kotası RPC'si. Tablo/kolon/policy/index/mevcut RPC ve kullanıcı satırı DML'i/backfill yok | Migration tek başına 1.5.x'i etkilemez; eski geniş SELECT/RLS yolu sürer. Yeni client shared personel ekranlarında dar RPC'lere geçer. P-only ödeme/tahsilat satırını artık görmez; geniş export/ileri-tarihli/edit-copy ve eksik geçmişten açılış/yürüyen bakiye geçici owner-only olur |
| Edge worker auth (P0-S5) | Dört Function canlı; `notify_linked_users_worker_auth` additive trigger/Vault migration'ı canlı, tablo/kolon/işlem verisi değişmedi | Cron aynı legacy service-role JWT ile sürer; eski istemcinin bildirim çağrısı zararsız no-op olur, kanonik bildirim DB trigger'ından üretilir |
| Ürün hareketi minimal cari etiketi (C9) | Additive `get_urun_hareket_minimal_cari_labels` RPC canlı; yalnız hareket UUID'si + cari adı | Eski client yeni ucu çağırmaz; davranışı değişmez |
| C1/C5/C6/C7/C8/C10 istemci kapıları | Yok | Eski client kendi eski UI davranışını sürdürür; yalnız yeni build'de görünürlük/cache savunması değişir |
| C4-A işlem/ürün mutation istemci kapıları | Yok; C4-A yeni migration veya mevcut RPC değişikliği yapmaz | Eski client kendi eski yazma akışını sürdürür; güncel tenant/kaynak/aksiyon/sahiplik ve rol-daralma kontrolleri yalnız yeni build'dedir |
| C12 public ekstre süre allowlist'i | Yeni istemci allowlist'i yanında P0-S10 sunucu kapanışı da canlı; mevcut public-link RPC imzaları/sonuçları korundu | Eski UI süresiz isteği gönderebilirse sunucu `22023` ile reddeder; owner 1/7/30/365, shared 1/7/30 çalışır |
| P-B kanonik yetki altyapısı | Additive `internal` şeması + 4 fonksiyon + dar ACL; `20260729064915_pb_internal_yetki_altyapisi` canlı. Tablo/kolon/policy/DML/backfill yok | 1.5.x yeni şema/fonksiyonları çağırmaz. P-D'nin dar kategori ve creator-label tüketicileri canlıdır; diğer P-C/P-D/P-F/P-I yüzeyleri ayrıca sürümlü uygulanacaktır |

Her DB paketi için uygulamadan önce:

1. 27 Temmuz 2026 tam yedeği teyitlidir. Additive, veri silmeyen/yeniden yazmayan paket
   için her adımda yeni yedek istenmez. `DROP`, kolon/tip değişikliği, `DELETE`,
   `TRUNCATE`, toplu backfill/yeniden yazma veya kullanıcı işlemlerini riske atan bir
   değişiklik gerekirse durulur; ayrı onay ve güncel tam yedek istenir.
2. Canlı `pg_get_functiondef`, policy ve çıktı snapshot'ı alınır.
3. Migration yalnız additive/imza koruyan biçimde hazırlanır.
4. “1.5.x ne görür?” testi staging/iki kiracılı matriste gerçekten çalıştırılır.
5. Yeni istemci yayılım planı ve geri dönüş yolu yazılır.

---

## I.12. Zorunlu doğrulama matrisi

### Otomatik

- `tsc --noEmit`
- ESLint, sıfır hata
- Bütün Jest suite'i
- Metro iOS bundle
- Yeni saf testler:
  installment distribution, error classification, permission action matrix,
  connectivity reducer/race, route/header contract.
- SQL sözleşme testleri:
  RPC imzası/çıktı diff, iki kiracı, kaynak modül kesişimi, ownership,
  response kolon whitelist'i, kategori owner-only, minimal hesap sahte UUID.

### Cihaz

- iOS: notch/Dynamic Island ve eski küçük ekran.
- Android: cutout, gesture nav ve düşük/orta seviye fiziksel cihaz.
- LTE/Wi‑Fi/airplane/foreground; en az 35 saniyelik liste stres turu.
- Tüm detay/rapor/ekle/düzenle route matrisi.
- Klavye açık/kapalı, metin ve decimal keypad.
- Taksit 2/10/12/48; belge örneği.
- Rehber izin/picker cancel/çoklu numara/uzun uluslararası numara.
- Owner, Raporlar kapalı ortak, Cariler-only ortak, `view`, `add`, `edit_own`,
  `edit_all` ve iki ayrı işletme.

### “Bitti” tanımı

Bir iş yalnız şu koşulların tamamında kapanır:

- güncel bazda kod alıntısıyla doğrulanmış;
- eski client etkisi yazılmış;
- değişiklik yıkıcıysa yeni yedek/onay kapısı, additive ise veri-koruma kontrolü geçmiş;
- ana oturumda `tsc + eslint + jest + Metro` çalışmış;
- para/yetki değişikliğinde iki kiracılı negatif test geçmiş;
- UI değişikliğinde kullanıcı gerçek cihaz turuyla onaylamış;
- ölçüm/log geçici kodu temizlenmiş veya diagnostic flag altında sınırlandırılmış.

---

## I.13. İlk rapor tesliminden sonra uygulama durumu

İlk rapor teslimi salt-okunur bir başlangıç fotoğrafıydı. Daha sonra S-02 kodlandı,
`20260728220238_complete_ileri_tarihli_islem_atomik` canlıya uygulandı ve kullanıcı
cihaz kabulünü verdi. S-01 istemci paketi kodlandı, doğrulandı ve cihazda kabul edildi.
S-08 kodlandı, `20260728224922_gate_income_expense_summary_reports` canlıya uygulandı
ve cihazda kabul edildi. Son olarak S-09 kodlandı ve
`20260728232027_owner_only_kategoriler_atomik_archive` canlıya uygulandı. Güncel sınır:

- S-01, S-02, S-08 ve S-09 kullanıcı cihaz kabulüyle kapandı.
- S-11'in tam kaynak yetkili shared kullanıcıdaki ölü/tutarsız QTB girişleri istemcide
  giderildi, otomatik doğrulandı ve cihazda kabul edildi. Yalnız Cariler rolünün
  bakiyesiz minimal hesap referansı, dedicated picker/QTB tüketimi ve dar atomik
  tahsilat/ödeme RPC'si de 29 Temmuz'da kodlanıp canlıya uygulandı; bu yeni alt paketin
  cihaz kabulü açıktır. Shared mevcut işlem edit/copy projeksiyonu bu paketin kapsamı
  değildir.
- S-10 merkezi işlem hata/yetki sözleşmesi istemcide kodlandı ve otomatik doğrulandı;
  cihaz kabulü açıktır.
- S-03 küçük ekran/büyük yazıda bounded-scroll ActionSheet ile tamamlandı. S-04
  istemci yerleşim paketi tam form envanterinde yeniden doğrulandı; S-05 mevcut
  safe-area çözümü bütün route hiyerarşisini kapsayan 122 testle kilitlendi. S-06'nın
  deterministik ilk paketine ek olarak Cari vade, Personel izin/header ve Ürün dönem
  özeti derin scroll sırasında bekleten ikinci snapshot paketi kodlandı. S-06'nın
  30 Temmuz cihaz turu olumlu; S-03/S-04/S-05 görsel kabulü açıktır.
- S-07 integer-kuruş motoru, düzenlenebilir gerçek önizleme ve exact RPC payload
  sözleşmesi istemcide uygulandı; S-12a owner nickname tüketimi tek resolver ve
  tenant-cache'li minimal sorguyla uygulandı. İkisinde de otomatik doğrulama tamamlandı,
  cihaz kabulü açıktır.
- S-13 sistem kişi seçicisi, ortak telefon kayıt doğrulaması, izin-kapsamlı ve
  engellemeyen mükerrer-numara uyarısı, native izin/privacy config'i ve TR/EN gizlilik
  açıklamalarıyla uygulandı; otomatik doğrulama tamamlandı. Native modül nedeniyle
  yeni binary cihaz kabulü açıktır. S-12b shared-peer creator projeksiyonu ve S-12c
  atomik davet etiketi v2 canlıya uygulandı; cihaz kabulü açıktır.
- S-02 canlı kontrolleri anonim/toplulaştırılmış sayaçlarla; S-08 kontrolleri UUID
  fixture, satır sayısı, tip allowlist'i ve geri döndürülemez çıktı parmak iziyle;
  S-09 kontrolleri anonim boolean sonuçlar ve rollback edilen sentetik fixture'larla
  sınırlandı. E-posta, finansal tutar veya kullanıcı içeriği rapora alınmadı.
- S-06 için ilk aşamada cihaz kaydı olmadan tek kök neden ilan edilmedi; deterministik sort,
  iOS clipping, kararlı `extraData` ve Cari action-sheet sırası güvenli ilk paket
  olarak uygulandı. Doğrulanmış kalan zamanlama mekanizmaları ikinci pakette
  top-anchored snapshot ile kapatıldı; 30 Temmuz cihaz geri bildirimi olumludur.
- S-03'te ilk “sabit height yok” tespitinin küçük ekran/büyük yazı için yetersiz
  kaldığı görüldü ve seçenek-scroll sınırı eklendi. S-05'te padding yaması yerine
  klasör `_layout` dosyalarının kurduğu nested navigasyon seviyesi düzeltildi; 7
  direct-root + 41 guarded-nested header ve fullscreen istisnaları otomatik envantere
  alındı. S-04'te ürün/kategori/işlem/ayar/modal sapmaları ortak
  klavye-footer sözleşmesindedir ve 30 Temmuz taramasında yeni eksik bulunmamıştır.
- S-01 için `expo-network@8.0.8` kuruldu; S-08 için istemci hook'u ve veri-silmeyen
  fonksiyon migration'ı; S-09 için owner hook/route guard'ları, restrictive policy
  ve atomik kategori silme (DB'de soft-delete) RPC'si eklendi. Commit veya push
  yapılmadı. S-10 ve S-11'in tam-kaynak ara QTB paketi yalnız istemci kodudur.
  S-11 minimal cari nakit alt paketi, S-12b/S-12c yeni additive RPC'leri ve additive
  dar kategori endpoint'i içerir. S-12d aynı creator imzasını koruyan veri-silmeyen
  erişim daraltmasıdır. Bu paketlerde migration-time DML/backfill ve mevcut veri
  değişikliği yoktur. S-13 de
  migration/veri yazımı içermeyen istemci + native config paketidir; eski binary'ye
  OTA verilmez.

Bu bölüm, saha geri bildirimlerini uygulanabilir ve sıralı bir plana dönüştürür.
Aşağıdaki Bölüm II'nin mevcut içeriği korunmuş; geniş yetki/paylaşım denetimi bu plana
temel ve güvenlik backlog'u olarak eklenmiştir.

---

## I.14. Rapor teslim doğrulaması

29 Temmuz'daki C2/C3/C4/C9/C12 istemci savunmaları, P0-S5 Edge Function
sertleştirmesi, P-B kanonik yetki altyapısı, canlı P0-S6B zarfı ve canlı P0-S7
hesap projeksiyonu
sonrasında bütün çalışma ağacı ana oturumda yeniden doğrulandı. Aşağıdaki ilk altı
satır en güncel birleşik turdur; devamındaki hedef testler ve canlı rollback/smoke
kayıtları ilgili paketin daha dar kanıtıdır. Otomatik doğrulama cihaz kabulünün
yerini almaz; P0-S6B'nin tamamlanmış üretim rollback ve post-deploy kanıtı ayrıca
aşağıda kayıtlıdır.

| Kontrol | Sonuç |
|---|---|
| TypeScript | `npm.cmd run typecheck` — geçti |
| ESLint | `npm.cmd run lint` — **0 hata**, mevcut kodda 104 uyarı |
| Jest | **106/106 suite, 1.561/1.561 test geçti** |
| Metro iOS | **4.093 modül** bundle edildi |
| Edge Deno | `_shared/workerAuth_test.ts` **4/4**; dört handler `deno check` geçti |
| Diff biçim kontrolü | `git diff --check` — geçti |
| Hedef S-01 testleri | 4 suite; 19 ağ/backend/query-policy testi yeşil |
| Hedef S-02 testleri | Hook, UI, kur parser'ı ve SQL sözleşmesi yeşil |
| Hedef S-08 testleri | Hook permission/cache + SQL imza/ACL/kesişim; 2 suite, 7 test yeşil |
| Hedef S-09 testleri | Hook owner/fail-closed + restrictive policy/atomik RPC sözleşmesi; 2 suite, 16 test yeşil |
| Hedef S-10 testleri | Hata sınıflandırma, idempotency/payload eşliği, ileri tarihli read-only, geri-al iptali, rapor/detay kapısı ve shared-context sözleşmesi; 6 suite, 83 test yeşil |
| Hedef S-11 testleri | Tam kaynak kapılarına ek olarak minimal hesap istemci sözleşmesi 4 suite/43 test; SQL sözleşmesi 13/13 yeşil |
| S-11 canlı doğrulama | `20260729035945_add_cari_cash_minimal_rpcs`; 14/14 `BEGIN/ROLLBACK` preflight + 14/14 post-deploy smoke yeşil; sentetik veriler rollback |
| Hedef S-03 testleri | Canlı pencere + top safe-area üst sınırı, yalnız seçenek scroll'u, sabit İptal/handle, büyük yazı, gerçek modal inset'i ve tek Modal sözleşmesi; 5/5 test yeşil |
| Hedef S-04 testleri | Form footer/KAV/ofset, modal-içi gerçek inset ve yıkıcı scroll istisnası; 22/22 test yeşil |
| Hedef S-05 testleri | 7 direct-root + 41 guarded-nested; custom Screen/TabHeader, auth/tabs/foto-import sınıfları ve bütün standalone dosya envanteri; 125/125 test yeşil |
| Hedef S-06 testleri | Deterministik sort + clipping/extraData/action-sheet ilk paketi; top-anchored vade/izin/header snapshot'ı ve ürün sıra/pill ikinci paketiyle birleşik ana hedef turda 5 suite/23 test yeşil |
| Hedef S-07 testleri | Integer-kuruş dağıtım, lock/remainder, 2–48, küçük toplam, ay-sonu tarih, preview→RPC aynı dizi ve inline UI sözleşmesi; 27/27 test yeşil |
| Yetki dışı birleşik hedef tur | S-03/S-04/S-05/S-07: 5 suite / 179 test; hedef ESLint 0 hata, TypeScript temiz |
| Hedef S-12a testleri | Tenant/member-label resolver, trim/fallback, e-posta yasağı, iki işletme, linked-cari ve plain-cache sözleşmesi; 16/16 test yeşil |
| Hedef S-12b/S-12c testleri | Creator-label RPC, persist yasağı ve atomik invite v2; 3 suite, 34/34 test yeşil |
| S-12b/S-12c ilk deployment kanıtı | `transaction_creator_labels_rpc` + `create_isletme_invite_v2_atomic_label`; S-12d öncesi dar ACL/boş search path ve rollback edilen owner daveti smoke'u yeşil |
| Hedef S-12d testleri | Creator-label tip×kaynak AND, own-only, bilinmeyen tip, tarihsel etiket, imza/ACL sözleşmesi; 10/10 test yeşil |
| Hedef S-13 testleri | Sistem kişi seçicisi, telefon normalize/legacy koruması ve izin-kapsamlı engellemeyen mükerrer uyarısı; ilgili 2 suite/47 test, S-06 ile birleşik ana hedef tur 7 suite/70 test yeşil |
| S-12d canlı doğrulama | `20260729073717`; owner/tam yetkili/own-only/Cariler-only/kaynaksız/cross-tenant rollback matrisi ve post-deploy katalog/ACL smoke'u yeşil |
| Dar kategori referans ucu | 7/7 sözleşme testi; `20260729071904` canlı, owner/shared/type/anon/cross-tenant rollback preflight ve post-deploy shape/ACL smoke'u yeşil |
| P0-S4 audit cleanup ACL | `cleanup_audit_log_acl`; 10/10 sözleşme testi, gövde/cron değişmeden dar ACL canlı doğrulandı; fonksiyon çağrılmadı ve kayıt silinmedi |
| P0-S5 Edge worker auth | Dört Function `verify_jwt=true`; user/anon negatif, Z raporu `dry_run` ve service-role bildirim dalı pozitif; Vault/trigger yolu canlı |
| C9 minimal ürün-cari etiketi | 7/7 sözleşme testi; canlı `add_urun_minimal_cari_labels_rpc` için rollback preflight ve post-deploy shape/ACL/projeksiyon smoke'u yeşil |
| C4-A istemci mutation kapıları | Tip×kaynak görünürlüğü, I/U aksiyonu, tenant, `created_by` ve rol-daralma kontrolleri; hedef 6 suite/83 test + async ürün yarış turu 4 suite/57 test + async işlem yarış turu 1 suite/7 test yeşil |
| C12 public ekstre süresi | Saf allowlist 3/3; shared 1/7/30, owner 1/7/30/365; `null/süresiz` yeni istemcide reddediliyor |
| P-B kanonik resolver | 3 suite/97 hedef test; 2.016 hücre parite + bozuk JSON/kur/bakiye sözleşmesi yeşil. `20260729064915` canlı: 1 şema, 4 fonksiyon, 0 relation; rollback preflight + bağımsız audit + owner/active-member/cross-tenant post-smoke yeşil; resolver auth açık, anon/service ve yardımcılar kapalı; Data API `internal` profili 406/`PGRST106` |
| P0-S2 V2 create sözleşmesi | `createIslemV2Migration.test.ts` **10/10**; additive-only, exact yetki/kaynak, server-derived bakiye, UUID idempotency, dar output ve auth-only ACL kilitli |
| P0-S2 V2 create canlı doğrulama | `20260729121123_create_islem_atomik_v2`; owner/K13 Cariler-only/retry ve negatif `42501/22023/23505` rollback fixture'ı yeşil. İmza/SECDEF/VOLATILE/boş search path/auth-only ACL ve `718e5875f458a68b91196daa7c5253ab` gövde hash'i doğrulandı |
| P0-S2 ilk istemci dilimi | **8 suite / 72 test** yeşil. Yalnız QTB yeni normal viewer olmayan gelir/gider/transfer opt-in'i, exact payload, zorunlu UUID/tarih, sonlu ve pozitif tutar/kur, iki/sekiz ondalık, tek satır + expected-ID parse, linked/viewer kapısı, özel endpoint ayrımı, V2→V1 fallback yasağı ve landed-probe fotoğraf devamı kilitlendi |
| P0-S2 sonrası tam çalışma ağacı | Son delta sonrasında TypeScript temiz; tam ESLint **0 hata / 104 uyarı**; tam Jest **90 suite / 1.316 test**; Metro iOS **4.089 modül** temiz bundle; `git diff --check` geçti. Bağımsız son inceleme **0 blocker / 0 major** |
| P0-S6A/P0-S6B hedef doğrulama | Storage migration + copy-on-write/not istemci sözleşmeleri rename sonrasında da **4 suite / 31 test** yeşil. Düzeltilmiş policy PostgreSQL **15.18 + 17.10** fixture'ında geçti; bağımsız incelemede blocker/major yok |
| P0-S6B canlı doğrulama | İlk pointer-NULL/DELETE-SELECT ve ikinci `INSERT ... RETURNING`/self-query blocker denemeleri tamamen rollback oldu. Düzeltilmiş paket üretim `REPEATABLE READ` katalog/veri rollback'i ve `P0_S6B_RUNTIME_ROLLBACK_OK` gerçek runtime rollback'ini geçti; `20260729184053` deploy sonrası aynı gerçek authenticated matris ikinci kez yeşil. 286 nesne/41 orphan aynı, mevcut nesne silinmedi |
| P0-S7 hesap projeksiyonu | Ana oturumda **3 suite / 54 test**, typecheck temiz, hedef lint 0 hata/7 mevcut warning; bağımsız freeze-v2 incelemesinde blocker/major yok. Üretim `REPEATABLE READ` rollback matrisi ve post-rollback yokluk kontrolü geçtikten sonra `20260729182030_add_hesap_islem_satirlari_v1_rpc` canlıya alındı; istemci yerelde hazır, telefon kabulü bekliyor |
| P0-S7 personel projeksiyonu | Üretim predeploy `P0_S7_PERSONEL_PREDEPLOY_ROLLBACK_OK|17.6`, post-deploy `P0_S7_PERSONEL_RPC_BEHAVIOR_OK|17.6`, gerçek `authenticated` rol smoke'u ve anon reddi geçti. Exact 14+3 kolon, owner/P-only/P+H/own/all, tenant, cursor, `22023/42501`, kota ve rollback sentinelleri doğrulandı. Hedef personel paketi **4 suite / 64 test** yeşil. Son ana oturum: TypeScript temiz, ESLint **0 hata / 104 uyarı**, tam Jest **99 suite / 1.419 test**, iOS Metro **4.090 modül** |
| P0-S8 ürün raporu | Migration öncesi exact V1 snapshot + rollback davranış matrisi, deploy sonrası `P0_S8_PRODUCT_POST_DEPLOY_OK`; hedef **5 suite / 39 test**. Son ana oturum: TypeScript temiz, ESLint **0 hata / 104 uyarı**, tam Jest **96 suite / 1.368 test**, iOS Metro **4.089 modül** |
| Canlı migration | `20260728220238`, `20260728224922`, `20260728232027`, P-B `20260729064915`, dar kategori `20260729071904`, creator hardening `20260729073717`, P0-S2 `20260729121123`, P0-S7 hesap `20260729182030`, P0-S6B `20260729184053`, P0-S8 gelir kaynağı `20260729194510`, P0-S8 ürün raporu `20260729201911` ve P0-S7 personel `20260729204756` kayıtlı; policy/imza/ACL/search path doğrulandı |
| Veri koruma | S-02: 17 pending, 38 completed, 12 source-link eşit. S-08: veri DML'i yok; owner önce/sonra parmak izi eşit. S-09: migration DML'i yok; sentetik fixture rollback sonrası 0 satır |
| S-08 canlı yetki matrisi | reports-off, partial-source, own-only, suspended ve cross-tenant negatif; owner/tam yetkili pozitif geçti |
| S-09 canlı yetki matrisi | shared SELECT pozitif; shared INSERT/cross-tenant UPDATE/RPC negatif; owner UPDATE/atomik cleanup pozitif; işlem bağlı guard negatif geçti |
| Supabase advisor | S-09 yeni tablo/index eklemedi ve yeni bloklayıcı performans bulgusu üretmedi. RPC'nin authenticated `SECURITY DEFINER` yüzeyi sabit search path + owner/tenant guard + dar ACL ile kasıtlıdır |

Jest çıktısında `excelImport` Crypto mock fallback'i ve bozuk JSON fallback'i için
beklenen `console.error` gürültüsü vardır; suite sonucu yeşildir. Bu teslim S-02 için
kod + additive canlı RPC, S-01 için istemci/native dependency, S-08 için istemci
fail-closed + veri-silmeyen canlı fonksiyon değişikliği ve S-09 için owner-only
istemci/RLS + atomik kategori silme (DB'de soft-delete) RPC'si; S-10 için istemci
hata/yetki sözleşmesi, S-11 için tam kaynak shared create tutarlılığı ile Cariler-only
bakiyesiz/dedicated tahsilat-ödeme akışı, S-04 için
klavyeye duyarlı ortak form-footer/modal inset sözleşmesi, S-05 için route-header
regresyon koruması, S-06 için güvenli liste stabilitesi ilk paketi, S-07 için
integer-kuruş/gerçek önizleme ve S-12 için owner/shared-peer nickname tüketimi ile
atomik davet etiketi v2'yi içerir.
S-01/S-02/S-08/S-09 ile S-11'in tam kaynak shared create alt paketinde cihaz kabulü
tamamlandı. S-04/S-05/S-06/S-07/S-10/S-12, S-11 Cariler-only minimal hesap/dar cari
nakit alt paketi ve shared mevcut işlem edit/copy projeksiyonu cihaz kabulü açısından
açıktır.
Supabase'ın genel advisor backlog'u bu adımda genişletilmedi. İlgili tasarımsal
uyarı açıklaması:
[Authenticated SECURITY DEFINER Function Executable](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).

---

# Bölüm II — Yetki Paylaşımı: Codex Geniş Kapsamlı Denetim Raporu

> **Tarihsel bölüm:** Aşağıdaki “uygulama yapılmadı” ifadesi bu yetki denetiminin ilk
> teslim anına aittir. Sonraki S-02 uygulama ve canlı migration kaydı Bölüm I.3'tedir;
> 29 Temmuz'da P0-S4 `cleanup_old_islem_audit_log()` ACL daraltması da canlıya
> uygulanmıştır. İlgili maddedeki güncel durum kaydı, ilk denetim fotoğrafını geçersiz
> kılar; diğer bulgular kendi tarihsel/güncel notlarıyla değerlendirilmelidir.

**Tarih:** 28 Temmuz 2026
**İncelenen dal / commit:** `feat/liquid-glass` / `f14a49c`
**Ana sözleşme:** `docs/security/YETKI-SOZLESMESI.md` v3
**Denetim türü:** Salt-okunur kod, migration, canlı katalog ve anonimleştirilmiş kullanım analizi
**Uygulama yapıldı mı:** **Hayır.** Bu rapor için uygulama kodu, migration, RLS, Storage, Edge Function veya üretim verisi değiştirilmedi.

---

## 1. Yönetici özeti

### Kısa karar

Yetki paylaşımının istemci tarafında önemli bir savunma katmanı kurulmuş; ana sekmelerin,
çoğu route'un, aramanın, rapor girişlerinin, export butonlarının ve izin daralmasındaki
cache temizliğinin büyük bölümü doğru yönde çalışıyor.

Fakat sistemin tamamı henüz tutarlı ve güvenli değildir. Özellikle:

- `islemler` RLS'i işlem türünü gereken modüllerle kesiştirmiyor;
- bazı `SECURITY DEFINER` RPC'ler üyeliği yetkiye dönüştürüp modül/seviye kontrolünü
  atlayabiliyor;
- Storage politikaları aktif üyeye işletme klasöründeki tüm dosyalarda geniş yetki
  veriyor;
- dört ayrı Edge Function sıradan bir geçerli JWT'yi service-role gücüne
  yükseltebiliyor;
- rapor RPC'lerinde `Raporlar AND kaynak modüller` kuralı eksik;
- `view` seviyesinde açılabilen bazı istemci yazma yüzeyleri ve guard'sız deep-link'ler
  kalmış;
- temel tablo satırı RLS tarafından açıldığında kolonların tamamı okunabildiği için
  kolon projeksiyonu tamamlanmadan yalnız RLS filtresine güvenilemez.

Bu nedenle:

> **Owner-only dahili/TestFlight cihaz testi yapılabilir; fakat kısıtlı ortak kullanıcıların
> gerçek güvenlik doğrulaması veya güvenli çok-kullanıcılı yayın olarak kabul edilemez.**

### Kullanıcının bu denetimde netleştirdiği iki ürün kararı

1. `view` seviyesi açık modülün Excel/PDF çıktısını alabilir; Cariler açıksa 1/7/30
   günlük public ekstre bağlantısı üretip gönderebilir. Bu bir açık değil, bilinçli
   okuma/dağıtım yetkisidir.
2. **Daha → İşlem Geçmişi yalnız owner ve yönetici tarafından görülebilir.**
   Operator, custom ve eski purchaser göremez. Mevcut kod ve canlı RLS bugün yalnız
   owner'a izin veriyor; bu güvenlik sızıntısı değil, yönetici için eksik işlevdir.

### Canlı etki özeti

Kişisel ad, e-posta, işletme adı veya UUID alınmadan yapılan üretim ölçümünde:

| Ölçüm | Sonuç |
|---|---:|
| Uygun aktif ortak üyelik | **19** |
| Farklı ortak kullanıcı | **17** |
| Farklı işletme | **14** |
| Son 30 günde işlem gören işletmelere bağlı üyelik | **16** |
| Son 30 günde bizzat işlem girmiş ortak üyelik | **6** |
| Son 90 günde bizzat işlem girmiş ortak üyelik | **8** |
| Geçerli, süresi dolmamış bekleyen davet | **2** |

Dolayısıyla bu ilk denetim gününde düzeltmeler yalnız “ileride kullanılacak” bir
özelliği değil, ölçülen **19 aktif üyeliğin tamamındaki güven sınırını** etkiliyordu.
29 Temmuz güncel aggregate'ı Bölüm 11'de ayrıca **24 aktif üyelik** olarak kayıtlıdır.

---

## 2. Kaynaklar ve yöntem

### İncelenen yerel kaynaklar

- `docs/security/YETKI-SOZLESMESI.md`
- `docs/YETKI-DENETIMI-SATINALMACI.md`
- `docs/YETKI-DENETIMI-RAPOR.md`
- `src/lib/permissions.ts`
- `src/lib/permissionCacheGuard.ts`
- `src/hooks/usePermissions.ts`
- `src/hooks/useIslemler.ts`
- `src/hooks/useUrunHareketler.ts`
- davet/üye düzenleme ekranları
- hesap, cari, ürün, personel, not, rapor, arama, arşiv ve Daha route'ları
- export ve public ekstre bağlantısı yolları
- `supabase/migrations/`
- `supabase/functions/`

### Canlıda salt-okunur incelenenler

- aktif `isletme_users` izin şekilleri;
- anonimleştirilmiş rol, seviye ve modül kombinasyonu sayıları;
- son işlem ve son giriş zamanlarından yalnız toplu sayılar;
- `pg_policies`, `pg_proc`, `pg_class`, migration geçmişi;
- Security Advisor sonuçları;
- Edge Function dağıtım listesi.

### Bilerek yapılmayanlar

- Kullanıcı/işletme adı, e-posta, telefon, tutar, açıklama veya kayıt içeriği rapora
  alınmadı.
- Başka kullanıcı gibi oturum açılmadı.
- REST/RPC/Storage üzerinde üretime yazma veya negatif saldırı testi yapılmadı.
- İlk salt-okunur denetim sırasında migration uygulanmadı. Sonraki kullanıcı-onaylı
  uygulama adımları ve canlı/yerel ayrımı kendi maddelerinde ayrıca kaydedildi.
- Hazırlanmış migration'lar “canlıdır” diye varsayılmadı; canlı migration geçmişi
  her uygulama adımında ayrıca kontrol edildi.

### Güncel kod kanıt indeksi

Bu satırlar hükmün tamamı değil, bulguların güncel HEAD'deki başlıca dayanaklarıdır:

| Konu | Güncel kanıt |
|---|---|
| Yetki sözleşmesinin kendi yayın blokajı | `docs/security/YETKI-SOZLESMESI.md:3-10,29-37` |
| AND kesişimi ve personel gizliliği | `docs/security/YETKI-SOZLESMESI.md:41-59,176-203` |
| Ürün liste/satır/detay create kapıları (C1 yerel) | `src/app/urunler/index.tsx`, `src/app/urunler/[id].tsx`, `src/components/urunlerPage/ProductRow.tsx`, `productViewWriteSurfaceContract.test.ts` |
| Hesap işlem sorgusu ve işlem aksiyon kapısı | `src/app/hesaplar/[id].tsx:322,329,772` |
| Personel işlem sorgusu ve işlem aksiyon kapısı | `src/app/personel/[id].tsx:234,240,619` |
| Geniş ilişkisel işlem hook'ları | `src/hooks/useIslemler.ts:447,496,542,585,645` |
| Mutabakat Cariler route + `view` write kapıları (C5 yerel) | `src/app/mutabakat/_layout.tsx`, `src/app/mutabakat/[cariId].tsx`, `src/components/mutabakat/ReportStep.tsx`, `src/components/mutabakat/DiffRow.tsx` |
| Foto import owner-before-provider guard'ı (C6 yerel) | `src/app/foto-import/_layout.tsx` |
| “Tüm İşlemler” geçici owner-only kapısı | `src/app/islemler/_layout.tsx:1-9` |
| İşlem Geçmişi istemcide owner-only | `src/app/(tabs)/daha.tsx:351-357`, `src/hooks/useAuditLog.ts:115-138` |
| Legacy purchaser → izinleri korunan custom editör eşlemesi (C7 yerel) | `src/components/multiUser/UserEditSheet.tsx`, `clientRoutePermissionGuards.test.ts` |
| Cache/izin fallback birleştirmesi (C8 yerel) | `src/lib/permissionCacheGuard.ts`, `permissionCacheGuard.test.ts` |
| Public ekstre süre/üretici yaşam döngüsü (C12/P0-S10) | `src/hooks/useEkstreLink.ts`, `src/components/detail/DetailExportSection.tsx`, `supabase/migrations/20260729112753_harden_public_statement_lifecycle.sql`, `supabase/functions/cari-ekstre/index.ts`, `supabase/migrations/20260729113246_finalize_public_statement_service_role_acl.sql` |
| Edge worker auth canlı paketi (P0-S5) | `supabase/functions/_shared/workerAuth.ts`, dört ilgili `index.ts`, `20260729045601_notify_linked_users_worker_auth.sql`, `edgeFunctionWorkerAuthContract.test.ts` |
| Ürün hareketi minimal cari etiketi canlı paketi (C9) | `20260729052402_add_urun_minimal_cari_labels_rpc.sql`, `useUrunHareketler.ts`, `urunler/[id].tsx`, `productMinimalCariLabelContract.test.ts` |
| `undo_import_batch` owner/tenant/kilit koruması; canlı (P0-S3) | `supabase/migrations/20260729084545_harden_undo_import_batch_owner_guard.sql`, `undoImportBatchMigration.test.ts` |
| Server-authoritative additive işlem create; sunucu canlı/ilk istemci dilimi yerelde hazır (P0-S2) | `supabase/migrations/20260729121123_create_islem_atomik_v2.sql`, `src/lib/createIslemV2Client.ts`, `src/hooks/useIslemler.ts`, `src/components/transaction/QuickTransactionBar/QuickTransactionBar.tsx`, `src/components/transaction/QuickTransactionBar/hooks/useTransactionSubmit.ts`, `createIslemV2Migration.test.ts`, `createIslemV2Client.test.ts`, `createIslemV2ClientRouting.test.ts`, `useIslemPermissionRace.test.tsx`, `transactionMutationSourceGate.test.ts` |
| Notlar aksiyon/bağlam/sahiplik kapanışı; canlı (P0-S9) | `supabase/migrations/20260729112129_harden_notlar_rls_actions_context.sql`, `src/hooks/useNotlar.ts`, `notlarRlsPermissionMigration.test.ts`, `notesClientPermissionContract.test.ts` |
| İşlem fotoğrafı copy-on-write; istemci hazır/server açık (P0-S6A) | `src/lib/islemPhotoLifecycle.ts`, `src/lib/__tests__/islemPhotoLifecycle.test.ts`, `src/lib/__tests__/islemPhotoClientContract.test.ts` |
| Kanonik upload + not fotoğrafı Storage zarfı; canlı (P0-S6B) | `supabase/migrations/20260729184053_harden_note_photo_storage_phase1.sql`, `storagePhotoServerPhase1Migration.test.ts`, `docs/security/taslak/P0-S6-STORAGE-PG15-17-RLS-DAVRANIS-TESTI.sql` |
| Shared hesap hareketi dar projeksiyonu; sunucu canlı/istemci yerelde hazır (P0-S7 ilk dilim) | `supabase/migrations/20260729182030_add_hesap_islem_satirlari_v1_rpc.sql`, `src/lib/hesapTransactionProjection.ts`, `src/hooks/useIslemler.ts`, üç `hesapTransactionProjection*` testi |
| Shared personel işlem/izin dar projeksiyonu; sunucu canlı/istemci yerelde hazır (P0-S7 personel dilimi) | `supabase/migrations/20260729204756_add_personel_projection_rpcs.sql`, `src/lib/personelTransactionProjection.ts`, `src/hooks/useIslemler.ts`, `src/hooks/usePersonelLeaveQuotas.ts`, personel detay/izin geçmişi/rapor bileşenleri, üç `personelTransactionProjection*` testi ve `docs/security/taslak/P0-S7-PERSONEL-RPC-DAVRANIS-TESTI.sql` |
| Ürün alış/satış raporu güvenli projeksiyonu; sunucu canlı/istemci hazır (P0-S8 üçüncü dilim) | `supabase/migrations/20260729201911_add_product_report_v2_permission_projection.sql`, `src/hooks/useProductReport.ts`, `src/app/raporlar/alis-satis.tsx`, `src/components/reports/ExploreGrid.tsx`, `productReportV2Migration.test.ts`, `productReportV2ClientContract.test.ts`, `useProductReportPermissions.test.tsx` |
| P0-S4 audit cleanup ACL | `20260729035553_cleanup_audit_log_acl.sql` 29 Temmuz'da canlıya uygulandı; ayrıntı P0-S4 güncel durum kaydında |

---

## 3. Yetki modelinin tek doğruluk kuralı

Altı görünür modül vardır:

| Kısaltma | Modül |
|---|---|
| H | Hesaplar |
| C | Cariler |
| U | Ürünler |
| P | Personel |
| R | Raporlar |
| N | Notlar |

`Birikim`, Hesaplar'ın alt seçeneğidir. Arşiv ve işlem görünümü ayrı kullanıcı
toggle'ı değildir; açık modüllerden türemelidir.

Bir kayıt veya sonuç ancak aşağıdaki dört kapının **tamamı** geçerse görünür olmalıdır:

1. kullanıcı işletmenin aktif üyesidir;
2. kaydın gerektirdiği bütün modüller açıktır;
3. kayıt sahipliği / `can_see_all_users_data` kuralı geçer;
4. arşiv/pasif görünürlük kuralı geçer.

Yazmada bunlara ek olarak global seviye kapısı geçmelidir.

> **Bir modülün açılması başka bir modülü açmaz.** Bir işlem iki modülün verisini
> taşıyorsa OR değil, **AND** uygulanır.

Örnek:

- Hesaplar açık, Personel kapalıysa normal gelir/gider/transfer görünür.
- Aynı hesapta yapılmış bir personel ödemesi **satır olarak tamamen gizlenir**;
  yalnız personel adı değil, tutar/tarih/açıklama da görünmez.
- Personel açık, Hesaplar kapalıysa maaş tahakkuku ve izin görülür; banka/kasa
  ödemesi satırı görünmez.

---

## 4. Roller ve seviyeler

### Mevcut rol preset'leri

| Rol | Bugünkü preset | Beklenen kullanım |
|---|---|---|
| Owner | Her şey | İşletme sahibi; tüm yönetim yüzeyleri |
| Yönetici | Tüm görünür modüller, `edit_all`, pasif kayıtlar | Owner'a yakın günlük yönetim; ancak sahiplik/hesap silme gibi owner-only işler hariç |
| Operatör | Raporlar ve Birikim kapalı; diğerleri açık, `edit_own` | Günlük operasyon |
| Özel | Başlangıçta hiçbir modül, `view` | İşe göre açıkça seçilen modüller |
| Purchaser | Yeni davette kaldırılmış eski rol | `custom + Cariler + Ürünler` olarak normalize edilmesi gereken legacy kayıt |

### Global seviyeler

| Seviye | Okuma | Yeni kayıt | Düzenleme / silme | Export / public ekstre |
|---|---|---|---|---|
| `view` | Açık modüllerde evet | Hayır | Hayır | Evet; public ekstre yalnız Cariler ve 1/7/30 gün |
| `add` | Evet | Evet | Hayır | Evet |
| `edit_own` | Evet | Evet | Yalnız kendi oluşturduğu kayıt | Evet |
| `edit_all` | Evet | Evet | İzinli modüldeki tüm uygun kayıt | Evet |

Tek global seviye bilinçli bir ürün kısıtıdır. Örneğin “Cariler sadece görsün ama
Ürünlere kayıt eklesin” bugün ifade edilemez. Böyle bir ihtiyaç çıkarsa ileride
modül-bazlı seviye gerekir; mevcut denetimde bunu hata saymadım.

---

## 5. Tek modül senaryoları

| Profil | Görmeli | Kesinlikle görmemeli | Bugünkü ana risk |
|---|---|---|---|
| Yalnız H | Hesaplar, bakiye, gelir/gider/transfer | Cari satırları, personel maaş/ödeme, rapor, ürün, serbest not | Tip-körü `islemler` RLS'i personel/cari satırlarını taşıyabilir |
| Yalnız C | Cari liste/detay, altı cari işlem tipi; K13 minimal hesap seçici | Hesap bakiyesi/listesi, personel, rapor, ürün | Minimal referans yerine geniş tablo/RPC erişimi açılma riski |
| Yalnız U | Ürünler, stok, ürün hareketi; bağlı carinin yalnız adı | Cari bakiye/detay, hesap, personel, rapor | Minimal cari adı C9 ile canlı dar RPC'den linksiz gösteriliyor; C1/C9 telefon kabulü bekliyor |
| Yalnız P | Personel, maaş tahakkuku, izin | Hesap bilgisi ve personel ödeme/tahsilat satırları, cari, rapor | İlişkisel sorgular hesap/cari alanı taşıyabilir |
| Yalnız R | Rapor hub'ı; kaynak modül yoksa veri yok | Ham satırlar ve tüm kaynak modül verileri | Bazı RPC'ler yalnız R veya yalnız üyelik kontrol ediyor |
| Yalnız N | Serbest notlar | Yapılandırılmış finansal veri ve kapalı modüle bağlı not | Canlı RLS `view` kullanıcısının doğrudan not yazmasını engellemiyor |
| Hiçbiri | Boş/karşılama dashboard'u | Tüm iş verileri, sekmeler, işlem ekranı | Sunucu tipi/modülü bağlamazsa dolaylı veri hâlâ dönebilir |

---

## 6. İkili kombinasyonların tamamı

Tüm 64 açık/kapalı kombinasyonu ayrı kodlamak yerine aşağıdaki kesişim kuralı
uygulanmalıdır. Bu tablo altı modülün 15 ikili birleşimini kapsar; üçlü ve üstü
kombinasyonlar aynı kuralların birleşimidir.

| Kombinasyon | Doğru davranış | Özellikle gizlenecek |
|---|---|---|
| H + C | Hesap ve cari; cari ödeme/tahsilatta tam hesap seçimi | Personel, ürün ve rapor verisi |
| H + U | Hesap ve ürün; ürün hareketinde izinli hesap bağlantısı | Cari detay/bakiye, personel, rapor |
| H + P | Hesap + personel; personel ödeme/tahsilat satırları görünür | Cari/ürün satırları; R kapalıysa raporlar |
| H + R | Hesap kaynaklı raporlar ve nakit akışı | Personel maaşı, cari/ürün kırılımı |
| H + N | Hesaplar, serbest notlar ve hesap bağlamsal notları | Cari/personel/ürün notları ve verileri |
| C + U | Satın almacı profili; cari ve ürün, hareketten cari navigasyonu | Hesap bakiyesi, personel, rapor, serbest not |
| C + P | Cari ve personel ayrı ayrı; personel ödemesi H yoksa gizli | Hesap ve rapor; cari modülü personel maaşını açmaz |
| C + R | Yalnız cari kaynaklı raporlar | Personel/ürün/hesap kaynaklı toplamlar |
| C + N | Cari + serbest not + cari bağlamsal not | Personel/ürün/hesap notları |
| U + P | Ürün ve personel ayrı; yalnız izinli minimal ilişkiler | Hesap/cari detayları ve rapor |
| U + R | Ürün alış-satış/stok raporları | Personel, cari bakiye ve hesap raporları |
| U + N | Ürün + serbest not + ürün bağlamsal not | Cari/personel/hesap notları |
| P + R | Personel/maaş raporları; hesap gerektiren ödeme satırı H yoksa yok | Hesap, cari, ürün raporları |
| P + N | Personel + serbest not + personel bağlamsal not | Hesap/cari/ürün verileri |
| R + N | Serbest notlar; kaynak modül olmadığı için rapor verisi yok | Tüm ham iş verileri |

### Kullanıcının verdiği somut örneklerin sonucu

#### “Satın almacıya Cariler + Ürünler açtım”

Görür:

- cari ve ürün listeleri;
- cari/ürün detayları;
- ürün hareketleri;
- `view` olsa dahi Excel/PDF ve 1/7/30 günlük cari ekstresi bağlantısı;
- bağlı ürün hareketinde minimal cari adı.

Görmez:

- hesap adları ve bakiyeler;
- personel adı, maaşı, izni ve ödemeleri;
- rapor ekranları ve dashboard finansal rapor kartları;
- serbest notlar;
- başka işlem tipleri.

#### “Hesaplar + Personel açtım”

Görür:

- hesaplar/bakiyeler;
- personel/maaş/izin;
- personel ödeme ve tahsilat satırları, çünkü iki gerekli modül de açıktır.

Görmez:

- cari ve ürün kayıtları;
- Raporlar kapalıysa rapor hub'ı, nakit akışı ve rapor toplamları.

#### “Cariler + Personel açtım, Hesaplar kapalı”

Görür:

- cari ve personel ana verileri;
- maaş tahakkuku/izin;
- K13 kapsamında cari ödeme/tahsilat için yalnız minimal hesap seçiciyi.

Görmez:

- hesap bakiyesi/listesi/ekstresi;
- personel banka/kasa ödeme-tahsilat satırları;
- raporlar.

#### “Personel paylaşmadım”

Hiçbir yüzeyden görünmemesi gerekenler:

- personel adı ve profil bilgisi;
- maaş, prim, avans, tahakkuk;
- ödeme/tahsilat satırı ve toplamı;
- izin günleri;
- rapor agregatındaki personel payı;
- global arama ve bildirim metni;
- fiş/fotoğraf ve not gibi dolaylı içerikler;
- Excel/PDF/public link içeriği.

Bugün bu güvence sunucu seviyesinde sağlanmıyor; `islemler`, rapor RPC'leri,
Storage ve bazı bildirim/Edge yolları kapatılmalıdır.

#### “Raporlar paylaşmadım”

Doğru davranış:

- modül detayındaki operasyonel özet ayrı bir ürün kararıysa kalabilir
  (örneğin hesap bakiyesi veya ürün stok özeti);
- genel gelir/gider, nakit akışı, net varlık, karşılaştırma ve rapor hub'ı görünmez;
- rapor RPC'si, export'u, dashboard kartı veya Z raporu içeriği dönmez.

Bugün istemci girişlerinin çoğu kapalıdır; fakat bazı RPC/Edge yolları bu sınırı
sunucuda zorlamıyor.

---

## 7. İşlem Geçmişi için yeni rol kuralı

### Beklenen

| Rol | Görür mü |
|---|---|
| Owner | Evet |
| Yönetici | Evet |
| Operatör | Hayır |
| Özel rol | Hayır |
| Legacy purchaser | Hayır |

Bu hak modül toggle'ı veya global `level` ile türetilmemelidir; rol tabanlı ayrı bir
yönetim yeteneğidir. Yönetici pasife alınırsa erişim anında kesilmelidir.

### Bugünkü durum

- Daha menüsü `isOwner` ile çiziliyor.
- audit sorguları yalnız `isOwner` olduğunda etkinleşiyor.
- canlı `islem_audit_log` RLS politikasında yalnız owner izi var, manager izi yok.

Sonuç: veri sızıntısı yoktur; **yönetici için istenen işlev eksiktir**.

Gerekli ilerideki değişiklik üç katmanlı olmalıdır:

1. canlı RLS owner veya aktif manager şartını uygular;
2. route ve menü aynı yeteneği kullanır;
3. audit cache'i rol/işletme değişiminde temizlenir.

---

## 8. Doğru veya büyük ölçüde doğru çalışan yerler

- Görünür altı toggle'dan deny-by-default etkin modül türetimi yapılmış.
- Ana sekmeler, Daha menüsünün büyük bölümü, arama ve arşiv açık modüllere göre
  filtreleniyor.
- Hesap, cari, personel, ürün, not ve rapor klasörlerinin çoğunda route guard var.
- Rapor hook/export çağrılarının çoğunda istemci modül kapısı var.
- Pasif kayıt görünürlüğü owner/manager'a daraltılmış.
- İzin daralmasını algılayıp React Query cache temizleyen savunma eklenmiş.
- View seviyesinde Excel/PDF ve Cariler açıksa public ekstre paylaşımı bilinçli
  pozitif senaryo olarak korunmuş.
- Kategori ekranı istemcide owner-only guard altında.
- “Tüm İşlemler” ortak kullanıcılara yanlış veri vermemek için geçici olarak
  owner-only kapatılmış. Güvenli ama sözleşmedeki filtrelenmiş ortak görünüm henüz
  tamamlanmamış.
- Canlıdaki 17 public view'ın 17'sinde de `security_invoker=on`; bu Supabase'in
  önerdiği güvenli view davranışıyla uyumlu.

---

## 9. P0 — çok-kullanıcılı yayını bloke eden bulgular

### P0-S1 — `islemler` RLS işlem türüne kör

Canlı shared SELECT/INSERT/UPDATE/DELETE politikalarında genel `islemler` modülü ve
eski actions izleri var; `personel_*`, `cari_*`, `transfer` gibi türleri gerekli
modüllerle eşleştiren kapı yok. Shared UPDATE politikasında yeni satıra uygulanacak
`WITH CHECK` de yok.

**Etkilenen:** türetilmiş işlem erişimi olan ortak üyeliklerin tamamı.
**Örnek:** Cariler + Ürünler kullanıcısı doğrudan REST/RPC ile bir personel ödeme
satırının tutarını okuyabilir veya izin verdiği başka bir tipe dönüştürmeyi
deneyebilir.
**Aşama:** REST okuma/yazma, RPC, export, cache.
**Durum:** Sunucu kapanışı henüz uygulanmadı. Canlı telemetride 1.5.6 kullanan shared
oturumların hâlâ mevcut temel `islemler` yollarını kullandığı doğrulandığı için geniş
permissive policy'yi restrictive policy ile bir anda değiştirmek ertelendi. Bu karar
bir güvenlik açığını “tamamlandı” saymaz; aktif eski istemciyi boş ekran/403 ile
kırmamak için kontrollü geçiş kapısıdır.

### P0-S2 — V2 create canlı; ilk istemci dilimi yerelde tamamlandı

Legacy `create_islem_atomik`, update/delete ve doğrudan `increment_balance` yolları
üyelik/global action kapısına ve bazı yerlerde istemcinin ürettiği `p_balance_ops`
listesine güvenmeye devam ediyor. Bu tarihsel yüzeyler işlem türü × kaynak modülü
kesişimini ve bakiye etkisinin sunucuda yeniden hesaplanmasını tek başına garanti
etmiyor.

**Durum: SUNUCU CREATE DİLİMİ TAMAMLANDI ve CANLI; İLK İSTEMCİ DİLİMİ YERELDE
TAMAMLANDI ve DOĞRULANDI; TELEFON KABULÜ BEKLİYOR. P0-S2'NİN TAMAMI KAPANMADI.**
`20260729121123_create_islem_atomik_v2` migration'ı yalnız yeni
`public.create_islem_atomik_v2(uuid,jsonb)` fonksiyonunu ekledi. Mevcut
`create_islem_atomik`, `increment_balance`, doğrudan INSERT/RLS politikaları ve ileri
tarihli tamamlamanın V1 çağrısı değiştirilmedi.

Canlı postcondition:

- imza `create_islem_atomik_v2(uuid,jsonb)`;
- `SECURITY DEFINER`, `VOLATILE`, `search_path=''`;
- yalnız `authenticated` EXECUTE; `anon` ve `service_role` kapalı;
- canlı `pg_get_functiondef` gövde hash'i
  `718e5875f458a68b91196daa7c5253ab`;
- `auth.uid()`, sahip/aktif üyelik, exact
  `internal.etkin_yetki(...,'islemler').can_create` ve fail-closed
  tip → kaynak modülü `can_view` kapıları;
- para birimi ve bakiye etkisi kilitli entity satırlarından sunucuda türetilir;
  RPC `p_balance_ops` almaz ve `increment_balance` çağırmaz;
- UUID idempotency aynı creator + aynı kanonik payload'da no-op retry döndürür;
  başka creator/tenant veya farklı payload yazmadan reddedilir;
- işlem insert'i, tenant-scope doğrudan bakiye güncellemeleri ve mevcut tek
  FIFO/tahsis motoru aynı PostgreSQL transaction'ındadır.

K13 bilinçli olarak korunur: `cari_odeme` ve `cari_tahsilat` yalnız Cariler kaynaklıdır.
Cariler-only ortak, bakiye göstermeyen hesap referansıyla birikim olmayan hesabı
kullanabilir; Hesaplar modülü açılmaz ve response hiçbir bakiye alanı döndürmez.
Birikim hesabı ayrıca Birikim görünürlüğü ister. Viewer tenant'ın yabancı owner carisi,
fotoğraf/Storage, `source_ileri_id` ve ürün/stok alt yazımları ilk V2 create diliminde
fail-closed/kapsam dışıdır.

**Uygulanan ilk istemci dilimi:**

- Genel `useCreateIslem` değiştirilmedi; V2 için ayrı `useCreateIslemV2` hook'u eklendi.
- Yalnız QuickTransactionBar'da **brand-new**, normal ve viewer olmayan
  `gelir`, `gider`, `transfer` create'leri V2'ye opt-in olur. Bu sınır hem normal hem
  çapraz-kurlu create dalında aynıdır.
- `id` ile `date` TypeScript sözleşmesinde zorunludur. İstek başlamadan oluşturulan
  stable client UUID aynı form denemesinde korunur; idempotency sunucudaki aynı
  creator + aynı kanonik payload kuralıyla birleşir.
- V2 payload'ı exact allowlist ile kurulur; runtime'dan taşınan ilgisiz/ek alanlar
  gönderilmez. Tutar sonlu, pozitif ve iki ondalığa normalleştirildikten sonra da
  sıfırdan büyük; kur sonlu, pozitif ve sekiz ondalığa normalleştirildikten sonra da
  sıfırdan büyük olmalıdır. Geçersiz değer RPC'den önce fail-closed reddedilir.
- RPC `RETURNS TABLE` sonucu tam bir satır olmalıdır. İstemci boş, çoklu, bozuk veya
  beklenen UUID'den farklı sonucu başarı saymaz. Dar V2 response bakiye içermez;
  bakiye etkisi sunucuda türetilir ve istemci response'tan yeni bakiye uydurmaz.
- V2 çağrısı hata verirse **V1 fallback yapılmaz**. Sunucu yazmayı tamamladıktan sonra
  yanıt kaybolmuş olabileceği için aynı kullanıcı aksiyonunu başka RPC ile tekrar
  yazmak çift işlem/bakiye riski yaratır.
- Yanıt kaybı sonrası kimlik probe'u bilinen client UUID'yi `landed` bulursa finansal
  mutation tekrarlanmaz. Normal ve çapraz-kur dallarında yalnız mevcut best-effort
  fotoğraf eşitlemesi bu kanıtlanmış satır kimliğiyle devam edebilir.
- Viewer/linked-cari, ürünlü işlem, taksit, ileri tarihli, normal↔ileri tarihli
  dönüşüm, Cariler-only minimal nakit RPC'si, cari/personel özel akışları ve diğer
  legacy çağrılar mevcut endpoint'lerinde kaldı. Bu ilk dilim onların davranışını
  değiştirmez.

**Canlı doğrulama:** Migration önce `BEGIN/ROLLBACK` içinde derlendi. Geri alınan
sentetik fixture'da owner create + aynı UUID retry, K13 Cariler-only tahsilat + retry,
Hesaplar kaynaklı gelir reddi, Birikim hesabı reddi, farklı payload `22023`,
`created_by` sahteciliği `22023` ve başka creator aynı UUID `23505` geçti. Migration
sözleşme Jest'i **10/10** geçti. Sentetik işlem, hesap, cari, üyelik ve kullanıcı
satırlarının tamamı rollback edildi.

**İstemci doğrulaması:** V2 client allowlist/parse/routing, permission yarışları,
mutation kaynak kapıları, numeric fail-closed sınırı ve landed-probe fotoğraf devamı
dahil hedefli **8 suite / 72 test** yeşildir. Bağımsız incelemede **0 blocker /
0 major** bulundu; iki minor bulgu numeric sınır ve response-loss fotoğraf devamı
olarak kapatıldı.
Son delta sonrasında ana oturumda TypeScript temiz; tam ESLint **0 hata / 104 uyarı**;
tam Jest **90 suite / 1.316 test**; Metro iOS **4.089 modül** temiz bundle ve
`git diff --check` temiz tamamlandı.

**Eski → şimdi:**

- Eskiden QTB'deki yeni normal gelir/gider/transfer de istemcinin hazırladığı legacy
  `p_balance_ops` ile eski create RPC'sine giderdi.
- Şimdi yeni build'de yalnız tarif edilen üç QTB create tipi V2'ye gider; yetki,
  entity/para birimi ve bakiye etkisi sunucuda yeniden türetilir. Kullanıcı aynı formu
  görür; beklenen fark arka planda tek yazım, dar payload ve sunucu-otoriteli
  bakiyedir.
- Ürün, taksit, ileri tarihli, cari/personel ve diğer özel işlemler eskiden kullandığı
  endpoint'i kullanmaya devam eder. Böylece ilk telefon kabulünde V2 değişikliği ile
  özel akış regresyonları birbirinden ayrılabilir.
- Sonraki adım bu dar dilimi telefonda kabul etmek ve yayılım/telemetriyi izlemektir.
  Diğer create tiplerinin ayrı ayrı taşınması, V2 update/delete, minimum sürüm ve
  legacy `increment_balance`/geniş RLS cutover hâlâ açık iş kalemleridir.

**Telefonda test:**

1. Owner ile QTB'den küçük bir gelir, gider ve iki hesap arasında transfer oluştur.
   Eskiden bu üçü V1/p_balance_ops yolundaydı; şimdi ekranda aynı görünürken V2'ye
   gitmeli. Her satır bir kez oluşmalı, ilgili hesap bakiyeleri kuruşu kuruşuna yalnız
   bir kez değişmelidir.
2. Farklı para birimli iki hesap arasında küçük bir çapraz-kur transferi yap. Kaynak
   ve hedef etkileri ekrandaki tutar/kurla uyuşmalı; ikinci işlem veya ikinci bakiye
   etkisi oluşmamalıdır.
3. Yetkili shared kullanıcıyla izin verilen küçük bir gelir/gider oluştur; sonra
   kaydetmeden hemen önce ilgili izni `view` seviyesine indir veya kaynak modülünü
   kapat. İstek anlaşılır “yetkiniz yok” sonucu vermeli; yeni satır ve hiçbir bakiye
   değişimi olmamalıdır.
4. Zayıf ağda Kaydet'e hızlı iki kez basmayı veya ilk yanıt gecikmişken aynı formdan
   yeniden denemeyi dene. Stable UUID nedeniyle tek satır ve tek bakiye etkisi
   kalmalıdır; hata sonrası görünmez V1 denemesi yapılmamalıdır.
5. Ürünlü işlem, taksitli alış/satış, ileri tarihli işlem, normal↔ileri tarihli
   dönüşüm, Cariler-only tahsilat/ödeme ve personel ödeme/tahsilat için küçük birer
   smoke testi yap. Bunlar V2 ilk dilimine alınmadı; eskisi gibi kendi mevcut
   endpoint'leriyle çalışmalıdır.
6. Fotoğraf ekleyerek normal bir gelir veya gider oluştur. İşlem önce bir kez
   oluşmalı, ardından fotoğraf satırda görünmeli; fotoğraf yüzünden ikinci finansal
   işlem oluşmamalıdır. Ağ yanıtı kaybolup UUID probe'u satırı bulduğunda da yalnız
   fotoğraf devam etmeli, finansal mutation tekrar etmemelidir.
7. Mağazadaki 1.5.x build ile izinli küçük bir normal işlem oluştur. Eski V1 yolu
   aynı şekilde çalışmalı; yeni build'in V2 kullanımı eski cihazı etkilememelidir.

**Veri ve migration etkisi:** İlk istemci dilimi için yeni migration yoktur; kolon,
tablo, policy veya mevcut satır değiştirilmedi. Canlı V2 migration'ı aynen
`20260729121123_create_islem_atomik_v2` olarak kalır.

**1.5.x / eski istemci etkisi:** **Sıfır.** 1.5.x yeni RPC adını bilmez ve legacy
create/bakiye yolunu aynen kullanır. Eski endpoint'ler revoke edilmedi, imzaları ve
mevcut RLS yolları değiştirilmedi. Legacy uçların kapatılması ayrı minimum
sürüm/telemetri kararı, yayılım kanıtı ve yeni cihaz kabulü olmadan yapılmayacaktır.

### P0-S3 — `undo_import_batch` owner/tenant/kilit sertleştirmesi canlı

**Durum: TAMAMLANDI ve CANLI.**
`20260729084545_harden_undo_import_batch_owner_guard` migration'ı canlı geçmiştedir.
Fonksiyonun `undo_import_batch(uuid[]) → json` imzası korunmuştur; owner `postgres`,
`SECURITY DEFINER`, `VOLATILE` ve `search_path=''` durumundadır. Son canlı fonksiyon
tanımı için `pg_get_functiondef` md5'i `09d0aa42428d8fef0c9966dfb1f8a217` olarak
doğrulanmıştır. Bu değer, migration öncesi drift kapısının ayrı
`d276147891f458fd7cc74cc632e1b43c` değerinin “aynı hash'i” değildir: ilki uygulama
sonrası fonksiyon tanımı, ikincisi yalnız eski gövde için preflight beklentisidir.

Canlı paket:

- yalnız işletme owner'ına izin verir; shared, anon ve cross-tenant çağrıyı yazmadan
  reddeder;
- bütün seçilen işlemlerin tek işletmeye ait olmasını doğrular;
- kimlikleri deterministik sırada `FOR UPDATE` kilitler ve kilit sonrası tam listeyi
  yeniden doğrular;
- boş/geçersiz listeyi ve 50.000 üzerindeki batch'i yazmadan reddeder;
- `PUBLIC`, `anon` ve `service_role` doğrudan EXECUTE yüzeyini kapatır; yalnız
  `authenticated` çağrısı fonksiyon içindeki owner kapısından geçebilir;
- tablo/kolon/backfill yapmaz; mevcut geri alma finans matematiği ve başarılı owner JSON
  sonucu korunur.

**Doğrulama:** Yerel sözleşme testi ve atılabilir PostgreSQL matrisi yanında canlı
rollback fixture'ında owner pozitif senaryosu işlem/bakiye eşitliğiyle geçti;
shared, cross-tenant, anon, karma tenant ve 50.001 kimlik negatifleri yazmadan
reddedildi. Fixture rollback'inden önce/sonra izlenen 10 ilişkinin satır sayıları ve
tam satır parmak izleri aynı kaldı; hiçbir gerçek kullanıcı işlemi test için
değiştirilmedi.

**Etkilenen:** tüm işletmeler; yalnız ortak kullanıcı özelliğiyle sınırlı değildir.
**Örnek:** elde edilen işlem kimlikleriyle geri alma çağrısı, işlem silme ve bağlı
bakiye değişimlerine yol açabilir.
**Aşama:** acil bağımsız güvenlik düzeltmesi tamamlandı.

**Eskiden:** Her geçerli API rolü elde ettiği işlem kimlikleriyle ayrıcalıklı geri alma
fonksiyonunu tetikleyebiliyordu; fonksiyon tenant sahibi ve kilit-sonrası tam liste
kontrolünü zorlamıyordu.

**Şimdi:** Yalnız owner, kendi işletmesindeki tam ve değişmemiş işlem kümesini atomik
olarak geri alabilir; anonim/shared/cross-tenant, aşırı büyük ve yarışlı çağrılar
yazmadan reddedilir.

**Telefonda test:** Yalnız test için oluşturulmuş 1–2 satırlık küçük bir importu owner
hesabıyla geri al; satırlar kaldırılmalı ve bağlı bakiyeler import öncesi değere tam
dönmeli. Aynı işletmenin shared hesabında geri alma girişi görünmemeli; deep-link veya
eski UI yoluyla istek oluşursa veri değişmemeli ve yetki mesajı görülmeli. Gerçek
kullanıcı geçmişi ya da büyük bir batch test amacıyla kullanılmamalıdır.

**1.5.x / eski istemci etkisi:** İmza ve başarılı owner JSON çıktısı korunduğu için
normal owner geri alma akışı değişmez. Yalnız daha önce açık olan
anon/shared/cross-tenant çağrılar reddedilir. Migration'ın kendisi veri silmedi veya
yeniden yazmadı; veri silme yalnız owner'ın mevcut “importu geri al” aksiyonunu bilerek
çalıştırmasıyla, fonksiyonun zaten var olan amacı kapsamında gerçekleşir.

### P0-S4 — audit temizleme fonksiyonu ACL daraltması

**Durum: 29 Temmuz 2026'da canlıya uygulandı; otomatik ve canlı doğrulama tamamlandı.
UI davranışı olmadığı için cihaz kabulü değil, sunucu katalog/cron doğrulaması
esastır.**

İlk denetimde `cleanup_old_islem_audit_log()` `SECURITY DEFINER` olduğu hâlde
`PUBLIC`, `anon` ve `authenticated` tarafından çalıştırılabiliyordu. Hazır
`20260729035553_cleanup_audit_log_acl.sql`, canlı migration geçmişine
`cleanup_audit_log_acl` adıyla uygulandı:

- yalnız fonksiyon EXECUTE ACL'i daraltıldı;
- `PUBLIC`, `anon` ve `authenticated` çağrısı kapatıldı;
- `service_role` erişimi ile fonksiyon sahibi `postgres` ve aktif cron işi korundu;
- fonksiyon gövdesi md5'i `638fc810853a0acbea7b106407ac1a1b` olarak önce/sonra aynı
  kaldı;
- migration veya doğrulama sırasında fonksiyon **çağrılmadı**, audit satırı silinmedi;
  tablo/kolon/veri/backfill değişikliği yapılmadı.

**Doğrulama:** 10/10 migration sözleşme testi geçti. Üretim `BEGIN/ROLLBACK`
preflight'ında gövde ve cron değişmeden anon/authenticated/PUBLIC reddi ile
service/postgres devamlılığı doğrulandı; canlı uygulama sonrasında aynı kontroller
tekrar geçti. Job 8 aktif, çağıran `postgres` ve 29 Temmuz 03:15 UTC çalışması
`succeeded` olarak doğrulandı. Supabase advisor artık bu fonksiyonu API rolüne açık
`SECURITY DEFINER` uyarısı olarak raporlamıyor.

**Eski → yeni:** Önceden bir API rolü retention temizliğini doğrudan tetikleyebilirdi.
Şimdi yalnız planlı postgres cron'u ve korunan servis yolu çalıştırabilir.

**1.5.x / eski istemci etkisi:** İstemci kaynaklarında bu fonksiyona çağrı yoktur;
ekran veya kullanıcı akışı değişmez. Mevcut işlem/audit verisi yeniden yazılmadı ya da
silinmedi.

**Cihaz smoke'u:** Uygulamada ayrıca görünecek bir buton veya metin yoktur. Kullanıcı
telefonunda oturum açıp normal bir test işlemi oluşturduğunda ekranlar eskisi gibi
çalışmalıdır; asıl kabul kanıtı server tarafında cron'un aktif kalması ve sonraki
planlı çalışmanın hata üretmemesidir. Bu kayıt cihazda kullanıcı kabulü yapıldı
anlamına gelmez.

### P0-S5 — dört Edge Function kullanıcı JWT'sini service-role worker yetkisine çeviriyor

**Durum: TAMAMLANDI ve CANLI. Dört Function `verify_jwt=true` ile deploy edildi;
`notify_linked_users_worker_auth` migration'ı, Vault service-role anahtarı, dar trigger
payload'ı ve API ACL'i canlı doğrulandı.**

| Function | Risk |
|---|---|
| `delete-scheduled-accounts` | Yalnız aynı proje için gateway'de doğrulanmış `service_role` legacy JWT kabul eder |
| `send-z-report` | Aynı worker guard'ı; canlıda yalnız güvenli `dry_run` pozitif canary çalıştırıldı |
| `process-scheduled-transactions` | Aynı worker guard'ı; kullanıcı/anon JWT gövde okunmadan `401` alır |
| `notify-linked-users` | Privileged yol yalnız service-role; kullanıcı JWT'si finansal payload işlemeksizin `{success:true,sent:0}` döndürür |

**Etkilenen:** giriş yapabilen tüm kullanıcılar; çok-kullanıcılı rol sınırından daha
geniştir.
**Aşama:** Canlı uygulama tamam; planlı cron ve gerçek bağlı-cari bildirimi operasyonel
izleme/cihaz kabulü bekliyor.

Ortak `workerAuth.ts` ve canlı yapılandırmayla:

- `delete-scheduled-accounts`, `process-scheduled-transactions` ve `send-z-report`
  yalnız `POST` + gateway JWT doğrulaması + aynı proje `service_role` claim'i kabul
  ediyor; enjekte edilen legacy service-role JWT'nin tam eşleşme yolu da korunuyor;
- sıradan kullanıcı JWT'si gövde okunmadan ve service-role istemcisi oluşturulmadan
  reddediliyor; servis sırrı yoksa uç fail-closed `503` dönüyor;
- `notify-linked-users` kullanıcı/anon JWT yolunda eski istemciyi kırmadan yan etkisiz
  başarı döndürüyor; privileged service-role yolunda request'ten yalnız `record.id`
  alıp tür/tutar/açıklama/tenant/üreticiyi veritabanından kanonik yeniden okuyor;
- finansal INSERT trigger'ı yalnız `{record:{id}}` gönderiyor, service-role anahtarını
  Vault'tan okuyor ve bildirim hatasını finansal kayda geri yansıtmıyor;
- bildirim yanıtı alıcı veya push sağlayıcı ayrıntısı taşımadan yalnız
  `{ success, sent }` döndürüyor;
- dört uç `OPTIONS` davranışını koruyor ve diğer HTTP yöntemlerini `405` ile reddediyor.

**Doğrulama:** Hedef Jest paketi 17/17, Deno helper 4/4 ve dört handler `deno check`
geçti. Bağımsız inceleme blocker bulmadı. Canlı Function sürümleri sırasıyla
`delete-scheduled-accounts` v23, `process-scheduled-transactions` v12,
`send-z-report` v9 ve `notify-linked-users` v23; dört uçta da `verify_jwt=true`.
Kullanıcı/anon JWT üç global worker'da `401`, bildirim ucunda yan etkisiz `200/sent:0`
aldı. Aynı cron JWT ile Z raporu `dry_run` `200` döndü; service-role ile olmayan kayıt
kimliği `404/sent:0` vererek privileged dalı kanıtladı.

**Eskiden:** Her geçerli kullanıcı JWT'si üç global worker'ı service-role yetkisiyle
çalıştırabiliyor; bildirim ucu istemcinin gönderdiği finansal alanlara güvenebiliyordu.

**Şimdi:** Global worker'lar yalnız gateway'in doğruladığı aynı-proje service-role
çağrısını kabul ediyor. Bildirimin privileged çağrısı Vault anahtarlı DB trigger'ından,
yalnız gerçek kayıt kimliğiyle geliyor; istemcinin finansal alanlarına güvenilmiyor.
Sıradan kullanıcı doğrudan global worker çalıştıramıyor.

**Telefonda test:** Üç cron worker için uygulamada yeni bir buton veya görsel değişiklik
beklenmez; sonraki planlı cron çalışmaları logdan izlenmelidir.
Yeni ve mümkünse eski bir istemciden bağlı cariye küçük bir test işlemi oluştur:
karşı tarafa tek, kanonik tutarlı bildirim gitmeli; işlem kaydı normal oluşmalıdır.
Sahte payload ve kullanıcı-JWT ile worker tetikleme negatifleri telefondan değil
otomatik/server testiyle doğrulanmalıdır.

**1.5.x / eski istemci etkisi:** Cron/worker çağrıları doğru servis-role kimliğiyle
devam eder. Eski istemcinin doğrudan `notify-linked-users` çağrısı hata üretmeden
yan etkisiz olur; gerçek bildirim aynı finansal INSERT'in server trigger'ından üretilir.
Migration tablo/kolon/işlem verisi silmez veya yeniden yazmaz. Legacy service-role JWT
değişirse Vault secret'ı runbook ile bilinçli olarak döndürülmelidir.

### P0-S6 — kanonik upload + not fotoğrafı zarfı canlı; işlem fotoğrafı server sınırı açık

**Durum:** P0-S6A'nın veri kaybını önleyen istemci kısmı yerelde tamamlandı.
P0-S6B'nin P0-S1'den bağımsız dar server fazı da
`20260729184053_harden_note_photo_storage_phase1` olarak **canlıdır**. Bu faz
kanonik upload ve not fotoğrafı SELECT/DELETE sınırını kapattı. Top-level
DML/backfill/kolon değişimi yapmadı. İşlem fotoğrafının tip/modül bazlı nihai
SELECT/DELETE sınırı ise P0-S1 işlem görünürlük motoru olmadan güvenle
tamamlanamayacağı için açık kalır.

Yeni istemci `src/lib/islemPhotoLifecycle.ts` üzerinden:

- değiştirmede **yeni nesne yükle → DB `photo_path` işaretçisini değiştir → eski
  nesneyi best-effort sil** sırasını kullanır;
- pointer kesin reddedilirse yeni yüklenen nesneyi temizler; ağ sonucu belirsizse
  sunucuda bağlanmış olabileceği için onu yanlışlıkla silmez;
- kaldırmada önce DB pointer'ını temizler, yalnız kesin başarıdan sonra Storage
  nesnesini siler;
- silme hedefini tam `<isletme>/<islem>_<10..20 rakam>.webp` biçimi, işletme ve işlem
  kimliğiyle doğrular; not veya başka tenant yollarını silme listesine almaz;
- Storage cleanup hatasını başarılı finansal/DB işlemini geriye çevirmiş gibi göstermez.

**Veri güvenliği:** Canlı uygulama öncesi ve sonrası **286 Storage nesnesi** ile
**41 sahipsiz nesne** aynı kaldı; hiçbir mevcut nesne otomatik silinmedi. Bu sayı
bir “cleanup tamamlandı” sonucu değildir; mevcut nesnelerde toplu DELETE/backfill
yapılmadı. Sahipsiz nesne temizliği, bağlı kayıt ve sahiplik kanıtı olan ayrı bir
dry-run/retention paketi gerektirir.

**Etkilenen:** Aktif ortak üyeliklerin tamamı.
**Örnek:** Personel kapalı bir ortak, işletme klasöründeki personel fişini doğrudan
Storage URL'siyle bugün hâlâ okuyabilir veya silebilir; P0-S6B işlem fotoğrafının
mevcut SELECT/DELETE semantiğini bilinçli olarak değiştirmez.
**Aşama:** İstemci veri-kayıpsızlık kısmı hazır; not fotoğrafı + kanonik upload
server fazı canlıdır. İşlem fotoğrafının tam server görünürlük kapanışı P0-S1
sonrasındadır.

**Eskiden:** Fotoğraf değiştirme/silme akışı DB pointer sonucu kesinleşmeden eski
Storage nesnesini kaldırabildiği için bir sonraki DB/ağ hatası kırık referans veya
geri döndürülemez fotoğraf kaybı bırakabiliyordu.

**Şimdi (yeni istemci):** Pointer önce kesinleştirilir; eski nesne yalnız sonrasında
best-effort temizlenir. Bu, istemci kaynaklı kayıp sırasını düzeltir. P0-S6B server
zarfı kanonik upload ile not fotoğrafı sınırını ayrıca kapatır; işlem fotoğrafının
tip/modül kesişimi yine P0-S1'i bekler.

**Telefonda test:** Fotoğraflı küçük bir test işlemini aç. Yeni fotoğraf seçip kaydet;
yeni fotoğraf görünmeli ve işlem tutarı/bakiyesi değişmemeli. Sonra fotoğrafı kaldır;
işlem satırı kalmalı, fotoğraf açılmamalı. Kayıt sırasında interneti keserek tekrar
dene; eski fotoğraf pointer sonucu kesinleşmeden kaybolmamalı, uygulama finansal
işlemi fotoğraf temizliği yüzünden başarısız göstermemeli. Personel kapalı shared
hesabın doğrudan Storage negatif testi bu adımın kabulü değildir; server kapanışından
sonra ayrıca yapılacaktır.

**1.5.x / eski istemci etkisi:** P0-S6A'nın kendisi DB/policy migration'ı değildir;
eski build'in copy-on-write öncesi sıralama riski sürer. Canlı P0-S6B additive
helper/policy/index paketinde tablo ve fonksiyon imzası değişmedi; kanonik
`upsert:false` legacy Storage INSERT + SELECT akışı çalışır. Bozuk/sahte/yetkisiz
upload ve Storage UPDATE 403 alır. İşlem fotoğrafının daha geniş tip/modül
daraltması P0-S1, yeni istemci yayılımı ve legacy telemetrisi tamamlanmadan
uygulanmayacaktır.

#### P0-S6B canlı — kanonik upload ve not fotoğrafı Storage zarfı

**Eskiden:** `islem-photos` bucket'ında aktif işletme üyeliği geniş ana kapıydı.
Not fotoğrafının gerçekten çağıranın P0-S9 not görünürlüğündeki bir kayda bağlı
olması, upload yolunun `<işletme>/<işlem>_...webp` veya
`<işletme>/notlar/<not>_...webp` biçiminde olması ve Storage satır sahibinin
çağıranla eşleşmesi tek bir restrictive server zarfıyla zorlanmıyordu. Storage
`UPDATE` yolu da istemci tarafından kullanılabilir durumdaydı.

**Şimdi — canlı:**

- yalnız kanonik private WebP anahtarı, aktif tenant ve `owner_id=auth.uid()` ile
  INSERT'e izin veren restrictive zarf eklendi;
- not upload'ı ayrıca exact Notlar `can_create` ister;
- `islem-photos` içindeki istemci `storage.objects UPDATE` yolu kapanır; mevcut
  `upsert:false` INSERT akışları korunur;
- bağlı not fotoğrafı SELECT'i P0-S9 `notlar` RLS görünürlüğünden geçer;
- not fotoğrafı, DB pointer/satır önce kaldırılmadan Storage'dan silinemez;
- pointer kalktıktan sonra cleanup yalnız objeyi yükleyen aktif üye veya işletme
  sahibi tarafından yapılabilir. `edit_all/delete_all` sahibi ortak kullanıcı,
  başka bir üyenin orphan objesini silemez;
- diğer bucket'lar ile işlem fotoğrafının mevcut SELECT/DELETE semantiği bu dar
  fazda değiştirilmez;
- `islemler(photo_path)` ve `notlar(photo_path)` için yalnız eşitlik lookup'ını
  hızlandıran iki additive partial index eklenir;
- 41 mevcut orphan nesne okunur ama silinmez, taşınmaz veya sahipliği değiştirilmez.

İlk üretim denemesi, pointer `NULL` olduktan sonra PostgreSQL DELETE'in ayrıca
SELECT görünürlüğü istemesi nedeniyle cleanup'ın sessizce sıfır satır etkilediğini
yakaladı. Policy, orphan nesneyi yalnız aynı dar cleanup principal'ine SELECT
görünür kılacak şekilde düzeltildi. İkinci denemede gerçek Supabase Storage
`INSERT ... RETURNING` akışı, SELECT restrictive policy'sinin cleanup dalındaki
`STABLE` helper'ın yeni `storage.objects` satırını self-query ile aynı statement
snapshot'ında göremediğini gösterdi. Delete helper
`storage_note_photo_delete_allowed_v1(text,text)` yapıldı; gerçek policy satırının
`owner_id` değeri helper'a doğrudan geçirildi ve Storage self-query kaldırıldı.
Her iki blocker denemesi de COMMIT öncesi tamamen rollback oldu; katalog ve veri
başlangıç durumuna döndü.

**Ana oturum ve üretim doğrulaması:** Storage migration + istemci yaşam döngüsü için
`storagePhotoServerPhase1Migration`, `islemPhotoLifecycle`,
`islemPhotoClientContract` ve `notesClientPermissionContract` paketleri migration
rename sonrasında da **4 suite / 31 test** yeşildir. Düzeltilmiş davranış PostgreSQL
**15.18 + 17.10** fixture'ında geçti; bağımsız incelemede blocker/major bulunmadı.
Üretimde tek `REPEATABLE READ` katalog/veri rollback provası ile gerçek runtime
rollback'i `P0_S6B_RUNTIME_ROLLBACK_OK` sonucunu verdi. Ardından migration canlıya
uygulandı ve aynı gerçek authenticated davranış matrisi post-deploy ikinci kez
geçti.

Canlıya uygulanan exact payload `24,168 byte` ve SHA-256
`0105024CA8F0CAA295852E616661D26EB3EEF8752F62B26282E90AE4C37EC053` değerindedir.
Yeni yerel dosya
`supabase/migrations/20260729184053_harden_note_photo_storage_phase1.sql` içine
uygulama sonrasında yalnız `-- CANLI...` açıklaması eklendiği için yerel dosya
`24,244 byte` ve SHA-256
`756E8AA742EE4EC8C19D7FE417772E7B7CCB51DE7046B810CA571D5556E62F20`
değerindedir; ilk hash canlıya uygulanan payload'ın parmak izidir.

Canlı katalogda dört helper'ın sahibi `postgres`, `search_path` değeri
`pg_catalog`'dur:

| Helper | Nitelik | Canlı fonksiyon hash'i |
|---|---|---|
| `storage_photo_path_parse_v1(text)` | `IMMUTABLE` / `SECURITY INVOKER` | `9b0f71387c98ab645f1a82028fa398da` |
| `storage_photo_insert_allowed_v1(text,text)` | `STABLE` / `SECURITY DEFINER` | `014d16018c3a7a7188d12c0f1dd640f2` |
| `storage_note_photo_select_allowed_v1(text)` | `STABLE` / `SECURITY INVOKER` | `ec63b96c351c7ddb5093cfc6d10ce0af` |
| `storage_note_photo_delete_allowed_v1(text,text)` | `STABLE` / `SECURITY DEFINER` | `a6724a378ce6ced8ed3c302717a6463f` |

Dört helper'da yalnız `authenticated EXECUTE` açıktır; `anon`, `PUBLIC` ve
`service_role` kapalıdır. Dört restrictive policy canlıdır.
`idx_islemler_photo_path_lookup_v1` ve `idx_notlar_photo_path_lookup_v1`
partial index'lerinin ikisi de `valid/ready` durumundadır. Paket top-level
DML/backfill/kolon değişimi yapmadı; canlı uygulama öncesi/sonrası 286 nesne ve
41 orphan aynı kaldı, hiçbir mevcut nesne silinmedi.

**Telefonda nasıl test edilir — canlı migration üzerinde:**

1. Owner ve Notlar `add` yetkili ortak kullanıcı bir notu fotoğrafla ekler; fotoğraf
   görünür ve not kaydı normal oluşur.
2. Yalnız `view` kullanıcısı fotoğraf yükleyemez; yetkili olduğu bağlı notun mevcut
   fotoğrafını görebilir.
3. Başka kullanıcıya atanıp artık görünmeyen notun fotoğrafı da açılmaz.
4. Fotoğraf değiştirildiğinde önce yeni fotoğraf görünür; not metni kaybolmaz.
5. Fotoğraf kaldırma ve not silmede DB işlemi başarılı kalır; cleanup ağ hatası
   finansal/not kaydını geri dönmüş gibi göstermez.
6. Başka bir ortak kullanıcının yüklediği fotoğrafı `edit_all/delete_all` ile
   kaldıran kişi DB kaydını güncelleyebilir; Storage cleanup reddedilirse kayıt
   başarısız olmaz, orphan daha sonra uploader/owner temizliğine kalır.
7. Erişilebilen bir 1.5.x test build'inde kanonik `upsert:false` not fotoğrafı
   yükle; Storage INSERT + ardından SELECT çalışmalı ve fotoğraf görünmelidir.

**1.5.x etkisi:** Migration top-level DML, kolon değişimi veya backfill içermez.
Mevcut tablo/RPC imzaları değişmedi. Eski kanonik `upsert:false` Storage INSERT +
SELECT akışı çalışmaya devam eder. Bozuk veya sahte yol/owner, yetkisiz upload ve
Storage UPDATE artık 403 alır. Peer orphan cleanup reddi eski client'ta fotoğraf
artığı bırakabilir fakat not/işlem verisini silmez. İşlem fotoğrafının nihai
tip/modül SELECT/DELETE kapanışı bu paketin dışında ve P0-S1'e bağlıdır.

### P0-S7 — temel tablo satırı açılınca hassas kolonların tamamı açılıyor

Postgres RLS satır bazlıdır; tek başına `select=*` içindeki kolonları gizlemez.
Hesap/cari/personel/işlem temel tablolarının ortak kullanıcı SELECT politikası satırı
açtığında bakiye, maaş, açıklama gibi kolonların tamamı API yüzeyine çıkabilir.

**Etkilenen:** tüm ortak üyelikler.
**Örnek:** UI yalnız hesap adını gösterse bile doğrudan REST isteği bakiye kolonunu
alabilir.
**Aşama:** Hesap ve personel detay dilimlerinin sunucu RPC'leri canlı, istemci
geçişleri yerelde hazır ve telefon kabulü bekliyor. Cari detayı daha önce dar
projeksiyona taşındı. Ürün hareketi/kalan yüzeyler, linked-cari dalı, dar
ileri-tarihli/export uçları ve temel tablo okuma daraltması hâlâ açıktır; bu nedenle
P0-S7'nin bütünü kapandı denmez.

#### P0-S7 ilk dilim — shared hesap hareketi projeksiyonu, sunucu canlı

**Dosyalar:** `20260729182030_add_hesap_islem_satirlari_v1_rpc.sql`,
`src/lib/hesapTransactionProjection.ts`, `src/hooks/useIslemler.ts`,
`src/app/hesaplar/[id].tsx` ve üç odak sözleşme/parser testi. Migration
**canlıdır**; yeni istemci henüz telefon kabulü/dağıtım aşamasındadır.

**Eskiden:**

- shared hesap detayında istemci `islemler select *` ve geniş relation join'i
  kullanıyordu;
- Hesaplar açık fakat Cariler/Personel kapalı bir kullanıcı, hesap bacağı bulunan
  cari/personel işlem satırını ve ham tenant/entity kolonlarını API yanıtında
  alabiliyordu;
- hesap PDF/Excel dışa aktarma ve ileri tarihli işlemler ayrı geniş sorgularla aynı
  projeksiyon sınırını dolaşabiliyordu;
- aynı tarih/zamanlı owner sayfalarında üçüncü sıralama anahtarı yoktu; hızlı
  pagination sırasında satır atlama/tekrarı riski vardı;
- ham `photo_path`, tenant ve işlem kimliği doğrulanmadan signed URL akışına
  taşınabiliyordu.

**Şimdi — sunucu canlı, yeni istemci yayımlandığında:**

- shared hesap hareketi yalnız additive
  `get_hesap_islem_satirlari_v1(uuid,uuid,integer,timestamp,timestamptz,uuid)`
  RPC'sinden gelir;
- RPC tam 18 dar alan döndürür; `isletme_id`, hesap/cari/personel/kategori FK'leri,
  bakiye ve geniş relation objeleri sonuçta yoktur;
- `gelir/gider/transfer` için Hesaplar; `cari_*` için Hesaplar **AND** Cariler;
  `personel_*` için Hesaplar **AND** Personel gerekir. Bilinmeyen tip fail-closed
  reddedilir;
- own/all, birikim, arşiv ve pasif görünürlükleri kanonik resolver/hesap
  sözleşmesiyle uygulanır;
- hedef hesap bacağı yalnız transferde kabul edilir; transfer olmayan tarihsel
  bozuk `hedef_hesap_id` satırları sonuçtan çıkar;
- `(date, created_at, id)` keyset cursor'ı deterministiktir. Owner'ın legacy
  sorgusunda da `id DESC` üçüncü sıra anahtarı vardır; shared sayfalar ek olarak
  ID ile tekilleştirilir;
- shared query key'i işletme + kullanıcı + izin parmak izi taşır ve diske persist
  edilmez; izin daralınca eski geniş cache gösterilmez;
- shared edit/copy/delete ve ürün alt satırı geniş sorgusu fail-closed kalır;
- dar export RPC'si ve ileri tarihli projeksiyon henüz olmadığı için shared hesap
  PDF/Excel/paylaşım ile ileri tarihli bölümü geçici olarak owner-only gizlenir;
  export hook'ları manuel/yanlış render yolunda da sunucu isteğinden önce reddeder;
- `photo_path` sunucuda exact `<tenant>/<işlem>_<10..20 rakam>.webp` değilse `NULL`
  döner; istemci buton ve viewer öncesinde aynı anahtarı tekrar doğrular;
- parser UUID, timestamp/tarih, desteklenen para birimi, pozitif-sonlu tutar/kur ve
  enumları doğrular; beklenmeyen kolonları DTO'ya taşımaz.

**Canlı ön-snapshot ve uyumluluk taraması:** PostgreSQL 17.6; uygulama öncesinde
hedef RPC yoktu. İkinci canlı kontrol anında 1.443 hesap, 68.773 işlem, 12.260
kategori, 4.781 cari ve 807 personel vardı. Aktif kullanıcı yazımları sürdüğü için
bu sayılar tarihsel fotoğraftır. RPC'ye girebilecek 41.838 hesap bacaklı satırın
tamamında pozitif-sonlu tutar/kur, desteklenen para birimi ve sonlu tarih/timestamp
parser kapıları geçti. Bilinmeyen işlem tipi 0'dı. Transfer olmadığı halde hedef
hesap alanı dolu tarihsel satırlar canlı target-only provasında sonuçtan dışlandı.

**Yerel doğrulama:** Bağımsız ikinci incelemede ilk sürümde bulunan shared export,
shared ileri-tarihli, ham fotoğraf ve sıralama/dedupe yan yolları kapatıldı; freeze
v2 için kalan blocker/major bulunmadı. Ana oturumda
`hesapTransactionProjection`, `hesapTransactionRowsProjectionMigration` ve
`hesapTransactionProjectionClientContract` **3 suite / 54 test** geçti,
`tsc --noEmit` temiz, hedef ESLint 0 hata/hesap detayında önceden var olan
7 warning verdi. Canlıya uygulanan payload SHA-256 değeri
`AAB1EE2831257934BF30F4FA38B348FAF7EAD2A20AB597B722CC2765370EEC00` idi.
Canlı durum yorumuyla yeniden adlandırılmış yerel dosyanın SHA-256 değeri
`24F49708E6629CCB87CCC0044D7A8E6AD5F39FAFDED66B0BE78923BA4FC727DB`;
SQL davranışı değişmedi.

**Canlıya alma sonucu:** `docs/security/taslak/P0-S7-HESAP-RPC-DAVRANIS-TESTI.sql`
PostgreSQL 15/17 davranış fixture'ıdır. Üretimde aynı migration tek
`REPEATABLE READ` transaction içinde önce uygulanıp sonra **ROLLBACK** edildi.
Beş veri tablosunun tam sıralı hash'i, public/Storage policy hash'i, iki helper ve
üç indeks tanımı değişmedi. Exact 18 çıktı kolonu, dört default, `STABLE`,
`SECURITY DEFINER`, `search_path=pg_catalog`, yalnız `authenticated EXECUTE`,
Owner/H-only/H+C/H+C+P/all ordered ID eşitliği, ilk 7 + sonraki 7 cursor,
`22023`/`42501` negatifleri ve target-only non-transfer dışlama kapıları geçti.
Üretimde non-vacuous own profili bulunmadığı için gerçek izin/satır değiştirilmedi;
own filtresi izole fixture'da doğrulanmıştır. Rollback sonrasında RPC/test nesnesi
kalmadığı ayrıca doğrulandı. Ardından migration
`20260729182030_add_hesap_islem_satirlari_v1_rpc` olarak canlıya uygulandı.
Post-deploy katalog hash'i `a191cfcc522ff37790719878e888ac75`; gerçek
`SET LOCAL ROLE authenticated` çağrısı başarılı, anon/service_role kapalıdır.

**Telefonda nasıl test edilir — RPC canlı + yeni build sırasından sonra:**

1. Owner hesabı açar: geçmiş satırlar, bakiye, çalışan hızlı işlem/düzenleme,
   ileri tarihli bölüm ve PDF/Excel eskisi gibi görünür.
2. H-only ortak kullanıcı aynı hesabı açar: gelir/gider/transfer görünür; cari ve
   personel kaynaklı satırlar, paylaş/export ve ileri tarihli bölüm görünmez.
3. H+C kullanıcıda cari satırları görünür, personel satırları görünmez.
4. H+P kullanıcıda personel satırları görünür, cari satırları görünmez.
5. “Yalnız kendi eklediği” seviyesinde yalnız kendi satırları; “tümü” seviyesinde
   yetkili kaynak modüllerindeki tüm satırlar görünür.
6. Ekran açıkken rol/izin daraltılıp geri dönülür: eski geniş satırlar cache'den
   kalmamalı.
7. Liste hızlı kaydırılır: aynı işlem iki kez görünmemeli, satırlar sıçramamalı.
8. Kanonik fotoğraflı işlem açılır; fotoğraf görünür. Bozuk/farklı tenant pointer
   otomatik fixture'da reddedilir ve UI'da fotoğraf butonu açılmaz.

**1.5.x etkisi:** Migration yalnız yeni salt-okunur SECURITY DEFINER RPC ekler;
tablo/kolon/index/policy/trigger/mevcut RPC ve kullanıcı satırlarını değiştirmez,
DML/backfill yoktur. 1.5.x bu RPC'yi çağırmaz ve mevcut geniş SELECT/RLS yolunu
aynen kullanır; dolayısıyla migration tek başına eski client davranışını değiştirmez.
Yeni istemci RPC canlı olmadan yayımlanırsa shared hesap detayı hata alabileceği
için deployment sırası **önce server, sonra client** olmak zorundadır. Temel tablo
SELECT daraltması yalnız minimum sürüm/yayılım kanıtından sonra ayrı fazdır.

#### P0-S7 personel dilimi — shared personel işlem ve izin projeksiyonu, sunucu canlı

**Dosyalar:** `20260729204756_add_personel_projection_rpcs.sql`,
`src/lib/personelTransactionProjection.ts`, `src/hooks/useIslemler.ts`,
`src/hooks/usePersonelLeaveQuotas.ts`, `src/hooks/useIleriTarihliIslemler.ts`,
personel detay/izin geçmişi/rapor ekranları, üç personel projection testi ve
`docs/security/taslak/P0-S7-PERSONEL-RPC-DAVRANIS-TESTI.sql`.

**Eskiden:**

- Shared personel detayı, personel raporu ve izin geçmişi `islemler select *` ile
  tenant/FK, fotoğraf yolu ve geniş relation kolonlarını çekebiliyordu.
- P-only profilde Hesaplar gerektiren `personel_odeme` ve `personel_tahsilat`
  satırları tüm kök işlem alanlarıyla gelebiliyordu.
- İzin kotası bütün personel izin işlemlerini geniş satırlar halinde cihaza getirip
  istemcide topluyordu.
- Own-only veya kaynak modülü kısıtlı kullanıcıda eksik geçmiş, güncel bakiyeden
  çıkarılarak hatalı “açılış bakiyesi” ve yürüyen bakiye üretebiliyordu.
- Personel rapor deep-link'i Raporlar dış guard'ına sahip olsa da Personel guard'ı
  içinde mount olmuyordu; geniş export ve ileri tarihli sorgular ayrı yan yoldu.

**Şimdi — sunucu canlı, yeni istemci yayımlandığında:**

- Shared personel satırları yalnız
  `get_personel_islem_satirlari_v1(uuid,uuid,integer,timestamp,timestamptz,uuid)`
  üzerinden gelir. Exact 14 alan şunlardır: işlem kimliği/tipi/tutarı/açıklaması,
  tarih ve izin bitiş tarihi, kaynak/hedef para birimi ve kur, creator/timestamp'ler,
  kategori adı ve — yalnız Hesaplar görünürse — hesap adı.
- DTO'da `isletme_id`, `personel_id`, hesap/kategori FK'leri, fotoğraf yolu, bakiye,
  maaş, telefon, not veya geniş entity nesnesi yoktur.
- `personel_gider`, `personel_satis`, `personel_izin_hakki` ve
  `personel_izin_kullanimi` için Personel yeterlidir.
  `personel_odeme`/`personel_tahsilat` için Personel **AND** Hesaplar gerekir;
  Hesaplar kapalıysa ad değil satırın tamamı düşer. Bilinmeyen tip fail-closed'dur.
- Parent personel aynı tenant, own/all, arşiv ve pasif kurallarından geçer.
  `(date, created_at, id)` cursor deterministiktir; shared sayfalar ID ile
  tekilleştirilir. Owner eski geniş sorguda kalır fakat üçüncü `id DESC` sırası eklenir.
- `get_personel_izin_kotalari_v1(uuid)` yalnız
  `personel_id/hak_edilen/kullanilan` aggregate'ını, aynı parent ve sahiplik
  filtresinden sonra döndürür. İzin geçmişi bütün keyset sayfalarını dar RPC'den
  tamamlayıp yalnız izin tiplerini kullanır; tek/çok günlü `date_end` korunur.
- Shared query key'leri işletme + kullanıcı + izin parmak izi taşır, diske yazılmaz;
  fetch/refetch/parser hatasında eski veri render edilmez. Creator nickname,
  RPC satırında tenant taşınmadan yalnız oturumdaki güvenilir işletme kimliğiyle
  mevcut label çözücüsüne bağlanır.
- Shared tarihsel küme eksik olabileceği için açılış ve satır-bazlı yürüyen bakiye
  gösterilmez. Personelin **güncel bakiye özeti** Personel sözleşmesine ait olduğu
  için görünmeye devam eder.
- Dar ileri-tarihli ve geniş personel PDF/Excel projeksiyonu henüz olmadığı için
  personel detayındaki bu girişler; ham edit/copy ve geniş share/export geçici
  owner-only'dir. İzin geçmişinin ekrandaki dar satırlardan üretilen özel export'u
  kalır. Personel raporu hookları artık `Raporlar AND Personel` guard'ları içinde mount
  olur.

**Canlı ön kontrol ve veri güvenliği:** Uygulama öncesinde iki hedef RPC yoktu.
Snapshot anında 68.831 işlem, 807 personel, 27 üyelik, 1.446 hesap ve 12.293 kategori
vardı. `idx_islemler_personel` ile `idx_islemler_personel_date` zaten mevcut olduğu
için yeni indeks eklenmedi. Migration yalnız iki yeni `STABLE SECURITY DEFINER`,
`search_path=pg_catalog`, authenticated-only fonksiyon ekledi; tablo/kolon/policy/
trigger/index, mevcut RPC ve kullanıcı satırlarında DDL/DML/backfill yoktur.

**Canlı doğrulama:** Aynı payload önce fonksiyonlar + sentetik davranış fixture'larıyla
tek transaction içinde çalıştırılıp tamamen geri alındı:
`P0_S7_PERSONEL_PREDEPLOY_ROLLBACK_OK|17.6`. Owner, P-off, P-only, P+H, own/all,
başka tenant/yok parent, ilk/sonraki cursor, geçersiz limit/cursor, izin kotası,
authenticated/anon ve exact ACL/metadata kapıları geçti. Rollback sonrasında iki RPC
ve bütün `__P0_S7_ROLLBACK__` sentinelleri sıfırdı; personel/hesap sayaç ve ID hash'leri
değişmedi. Aktif kullanım aynı anda sürdüğü için işlem sayacı post-kontrolde 68.837'ye
yükseldi; migration DML içermediği ve sentineller sıfır olduğu için bu altı satır
gerçek eşzamanlı uygulama trafiğidir, migration yazımı değildir.

Ardından migration `20260729204756_add_personel_projection_rpcs` olarak canlıya
alındı. Post-deploy davranış sonucu `P0_S7_PERSONEL_RPC_BEHAVIOR_OK|17.6`, gerçek
`SET LOCAL ROLE authenticated` sonucu `P0_S7_AUTHENTICATED_ROLE_OK`, anon sonucu
`P0_S7_ANON_ROLE_DENIED_OK` oldu. Fonksiyon katalog hash'i
`4657167921d02d8697d94950d21aa81f`; yerel SQL SHA-256 değeri
`1AF7B74C7D847E62488935D68CA96B3FC377ACB2BAFEDE2C1EFB8A5E796DF252`,
rollback davranış dosyası SHA-256 değeri
`C1EB092732B9B07CD4FDB1E4BC292CA273F5B1C5A69A30B42B6DDD0C9E0FCBAF`'tır.

**Ana oturum teknik doğrulaması:** Son personel istemci entegrasyonundan sonra
TypeScript kontrolü temiz, ESLint **0 hata / 104 mevcut uyarı**, tam Jest
**99/99 suite ve 1.419/1.419 test**, iOS Metro export ise **4.090 modül** ile
temiz tamamlandı. Jest çıktısındaki Crypto/bozuk JSON satırları test edilen fallback
yollarının beklenen konsol gürültüsüdür; test sonucu başarısız değildir.

**Telefonda nasıl test edilir — RPC canlı + yeni build sırasından sonra:**

1. Owner bir personeli açar: bütün geçmiş, açılış/yürüyen bakiye, ileri tarihli bölüm,
   düzenleme/kopyalama ve PDF/Excel eskisi gibi görünür.
2. Yalnız Personel açık shared kullanıcı aynı personeli açar:
   gider/satış/izin satırları görünür; ödeme/tahsilat satırları, hesap adları,
   açılış/yürüyen bakiye, paylaş/export ve ileri tarihli bölüm görünmez. Üstteki güncel
   personel bakiye özeti görünür kalır.
3. Personel + Hesaplar açık profilde ödeme/tahsilat satırları ve yalnız hesap **adı**
   görünür. Hesap bakiyesi veya hesap detayına ait geniş alan çıkmamalıdır.
4. “Yalnız kendi eklediği” seçeneğinde kendi oluşturduğu personel/satırlar/kota;
   “tümü” seçeneğinde yetkili kaynaklardaki bütün satırlar görünmelidir.
5. Raporlar açık, Personel kapalı rolle `/raporlar/personel` deep-link'ini aç:
   personel adı/satırı kısa süre bile parlamadan yetki ekranına dönmelidir. Personel'i
   açınca rapor yüklenmelidir.
6. İzin geçmişinde tek günlük ve çok günlük izinleri kontrol et; tarih aralığı ve toplam
   gün, personel listesindeki kota kartıyla eşleşmelidir. Uzun geçmişte aşağı kaydırınca
   satır eksilmemeli/tekrarlanmamalıdır.
7. Ekran açıkken owner rolü “kendi” ↔ “tümü” veya Personel/Hesaplar açık ↔ kapalı
   değiştirir: önceki satırlar disk cache'ten kalmamalı; daraltmada açık edit/paylaş
   yüzeyi kapanmalı. İşlemi yapan kişi için tanımlı nickname satırda görünmelidir.

**1.5.x etkisi:** Migration yalnız iki yeni salt-okunur RPC ekler; mevcut tablo,
kolon, policy, indeks, RPC imzası veya satır değişmez. 1.5.x bu uçları bilmez ve mevcut
geniş SELECT/RLS yoluna devam eder; migration tek başına eski uygulamayı bozmaz.
Bu nedenle eski binary'deki doğrudan REST kolon riski henüz kapanmış sayılmaz.
Temel `islemler` RLS daraltması, `get_personel_ozet`, linked/future/export yüzeyleri
yalnız desteklenen shared sürümler bu projeksiyona taşındıktan ve minimum-sürüm/yayılım
kanıtı alındıktan sonra ayrı fazda ele alınacaktır.

### P0-S8 — rapor ve özet RPC'leri kaynak modül kesişimini eksik uyguluyor

Bazı rapor RPC'leri yalnız `raporlar` veya yalnız üyelik kontrol ediyor; bazı dashboard
özetlerinde rapor kapısı dahi yok. Gereken kural:

`Raporlar AND raporun her kaynak modülü AND sahiplik filtresi`

**Durum: KISMİ TAMAMLANDI ve CANLI; gelir kaynağı ile ürün alış/satış dilimleri
hazır, telefon kabulü bekliyor.** Dashboard `get_income_expense_summary` kapanışı
daha önce cihazda kabul edilmişti. İkinci dilim olan
`20260729194510_add_income_source_report_v2_permission_projection` canlıdır:

- additive `get_income_by_source_v2(uuid,timestamptz,timestamptz)` eski uçla aynı
  sekiz kolonu döndürür;
- mevcut `get_income_by_source` imzası ve kolon sırası korunmuş, V2'ye yönlenen
  uyumluluk sarmalayıcısı olmuştur;
- sonuç için önce Raporlar, sonra Hesaplar/Cariler/Personel kaynak kapısı uygulanır;
  birikim hesabı ayrıca `Hesaplar AND Birikim` ister;
- `can_see_all_users_data=false` profilinde yalnız çağıranın oluşturduğu işlemler
  sayılır; cari/personel kırılımında kaynak kaydın da aynı kullanıcıya ait olması
  gerekir;
- hesap/cari/personel join'leri işletme kimliğiyle birlikte yapılır; bozuk bir UUID
  başka işletmenin kaynak adını rapora taşıyamaz;
- anonim, pasif üye, Raporlar kapalı, bütün kaynakları kapalı, çapraz-tenant ve
  geçersiz tarih çağrıları boş sonuçla fail-closed olur;
- V1/V2 yalnız `authenticated` rolüne açıktır; owner `postgres`, `STABLE`,
  `SECURITY DEFINER` ve `search_path=pg_catalog` olarak doğrulanmıştır.

Yeni istemci `get_income_by_source_v2` kullanır. Query anahtarına işletme, kullanıcı
ve R/H/B/C/P/tüm-kullanıcı görünürlük parmak izi eklendi; veri diske persist edilmez.
İzin ekran açıkken daraltılırsa önceki geniş toplam anında kaldırılır; refetch hatası
eski finansal sonucu maskelemez. Beklenmeyen `source_kind` ve izinsiz birikim satırı
istemcide de savunmacı olarak atılır. Dar kaynak-hareket projeksiyonu henüz
tamamlanmadığından shared kullanıcı kaynak kartına basarak geniş detay sorgusu
başlatamaz; bu kartlar geçici olarak tıklanamaz. Owner kartları ve detay sayfalaması
eskisi gibi çalışır.

**Eskiden → şimdi:**

- Eskiden Raporlar açık olduğunda kaynak kırılımı kapalı Hesaplar/Cariler/Personel
  modülünden veya başka kullanıcının verisinden toplam taşıyabiliyordu.
- Şimdi yalnız izin verilen kaynak türleri ve sahiplik kapsamı toplam üretir; izin
  değişince eski cache sonucu görünmez.
- Eskiden shared karttan doğrudan geniş detay sorgusuna gidilebiliyordu. Şimdi dar
  detay projeksiyonu gelene kadar shared kart tıklaması kapalı, owner akışı açıktır.

**Veri güvenliği:** Migration tablo/kolon/index/policy/trigger eklemedi veya
değiştirmedi; `INSERT/UPDATE/DELETE/TRUNCATE`, backfill ve kullanıcı satırı yeniden
yazımı yoktur. Canlı ön kontrolde altı çapraz-tenant cari referansı bulundu; bunların
yalnız biri tarih/tip/aktiflik koşullarıyla rapora uygundu ve tek işletmenin sonucunu
etkiliyordu. Hiçbir işlem düzeltilmedi veya silinmedi; yalnız yanlış tenant kaynak adı
rapordan çıkarıldı.

**Doğrulama:** Canlı migration kaydı `20260729194510` ile yerel dosya adı
eşleştirildi. V1/V2 sahiplik, ACL ve fonksiyon ayarları canlı katalogdan doğrulandı.
Gerçek aktif ortak üyelik örneklerinde Raporlar/kaynak/birikim kapıları, own-count,
V1↔V2 exact çıktı, çapraz-tenant ve geçersiz tarih kontrolleri
`REPEATABLE READ` işleminde çalıştırılıp tamamen rollback edildi:
`P0_S8_POST_DEPLOY_BEHAVIOR_ROLLBACK_OK`. Ayrı temiz oturumda anonim çağrı boş döndü.
İstemci permission/cache/drill-down ve migration sözleşme testleri tam Jest paketine
dahildir. Ana oturum doğrulaması: TypeScript temiz; ESLint **0 hata / 104 mevcut
uyarı**; tam Jest **93/93 suite, 1.342/1.342 test**; son hedef tekrar **5/5 suite,
39/39 test**; iOS Metro export **4.089 modül** ile temiz tamamlandı.

**Telefonda nasıl test edilir:**

1. Owner hesabında **Raporlar → Gelir/Gider → Gelir → Hesaba göre** ekranını aç.
   Kaynak adları ve toplamlar önceki doğru owner görünümüyle aynı olmalı; karta
   basınca detay açılmalı.
2. Raporlar + yalnız Hesaplar açık ortak kullanıcıda yalnız hesap kaynakları görünmeli.
   Birikim kapalıysa birikim hesabı görünmemeli.
3. Raporlar + yalnız Cariler açık profilde yalnız cari, yalnız Personel açık profilde
   yalnız personel kaynakları görünmeli.
4. “Yalnız kendi eklediği” profil yalnız kendi işlemlerinden ve kendi oluşturduğu
   cari/personel kaynaklarından toplam görmeli; “tümü” seçilince izinli modüldeki
   tüm kaynaklar görünmeli.
5. Raporlar veya bütün H/C/P kaynakları kapatılınca finansal kaynak sonucu
   görünmemeli. İzni ekran açıkken başka cihazdan daraltıp uygulamaya dönünce eski
   toplam kısa süreliğine dahi kalmamalı.
6. Shared kullanıcıda kaynak kartında detay oku/tıklaması olmamalı; dokunmak geniş
   işlem sorgusu açmamalı. Bu geçici güvenlik davranışıdır. Owner'da tıklama çalışır.
7. Eski bir derin bağlantıda geçersiz kaynak türü verilirse ekran veri sorgulamadan
   güvenli boş/hata durumunda kalmalı.

**1.5.x / eski istemci etkisi:** Eski istemci V2 adını bilmez; fakat mevcut V1 imzası
aynı sekiz kolonla V2 güvenlik motoruna yönlendiği için sunucu kısıtı eski build için
de geçerlidir. Owner'ın tenant-tutarlı sonuçları değişmez. Kısıtlı shared kullanıcı
önceden yetkisiz gördüğü kaynakları artık daha az veya boş görür; bu bilinçli güvenlik
daraltmasıdır. Yukarıdaki tek rapor-uygun çapraz-tenant bozuk referans artık yanlış
kaynak adı üretmez. Hiçbir kullanıcı işlemi veya kolon silinmedi/değiştirilmedi.

#### Ürün alış/satış raporu dilimi — sunucu canlı, istemci hazır

`20260729201911_add_product_report_v2_permission_projection` migration'ı canlıdır.
Additive `get_product_report_v2(uuid,timestamptz,timestamptz,text[])`, eski uçla aynı
dört parametreyi ve aynı dokuz kolonu döndürür. Mevcut `get_product_report` imzası,
kolon sırası ve eski istemci çağrısı korunmuş; V2'ye yönlenen güvenli sarmalayıcı
olmuştur.

Sunucu sözleşmesi:

- sonuç için **Raporlar AND Ürünler** gerekir; Cariler veya Personel'in kapalı olması
  ürün hareketi agregasını yanlışlıkla kapatmaz;
- `can_see_all_users_data=false` olduğunda işleme bağlı harekette kanonik sahip
  `islemler.created_by`, bağımsız toplu giriş/çıkışta `urun_hareketler.created_by`
  üzerinden yalnız çağıranın satırları sayılır;
- ürün, kategori, işlem, hesap, hedef hesap, cari ve personel join'lerinin tamamı
  işletme kimliğiyle sınırlandırılır; bozuk/çapraz-tenant referans fail-closed olur;
- mevcut arşiv/pasif sözleşmesi korunur: arşivli ürün rapora girer, pasif ürün ile
  pasif bağlı hesap/cari/personel girmez;
- yalnız beş alış/satış türü kabul edilir; boş, `NULL`, bilinmeyen tür, ters tarih,
  anonim, pasif üyelik ve çapraz işletme çağrıları boş sonuç üretir;
- V1/V2 yalnız `authenticated` rolüne açıktır; owner `postgres`, fonksiyonlar
  `STABLE`, `SECURITY DEFINER` ve `search_path=pg_catalog` olarak doğrulanmıştır.

Yeni istemci yalnız V2'yi çağırır. Query anahtarında işletme, kullanıcı ve
owner/Raporlar/Ürünler/tüm-kullanıcı görünürlük parmak izi vardır; finansal sonuç
diske yazılmaz. İzin daralması veya refetch hatasında eski geniş toplam ekranda
tutulmaz. Ana sorgu ve iade sorgusu birlikte yenilenir; iade RPC hatası artık sahte
`0` kabul edilmez. Rapor kartı Ürünler kapalıysa hiç görünmez ve doğrudan
`raporlar/alis-satis` bağlantısı içerik sorguları başlamadan Ürünler kapısında
reddedilir. İşlem ayrıntısı içeren geniş Excel export dar bir sunucu projeksiyonuna
taşınana kadar shared kullanıcıda gizli, owner'da açıktır.

**Eskiden → şimdi:**

- Eskiden yalnız işletme üyeliği yeterliydi; Raporlar veya Ürünler kapalı shared
  kullanıcı ürün toplamlarını alabiliyor, “yalnız kendi eklediği” seçimi başka
  kullanıcıların hareketlerini toplamdan çıkarmıyordu.
- Şimdi yalnız Raporlar + Ürünler kesişimi ve seçilen own/all kapsamı agregaya girer.
- Eskiden rapor cache'i kullanıcı/yetki kimliği olmadan diske yazılabiliyor, izin
  daralınca eski toplam kısa süreyle kalabiliyordu. Şimdi yeni cache kullanıcı/yetki
  kapsamlıdır, persist edilmez ve cache şeması `s6` ile ayrılmıştır.
- Eskiden iade isteği hata aldığında sonuç `0` gibi görünebiliyordu. Şimdi ekran gerçek
  hata durumunu taşır; yanlış net toplam göstermez.
- Eskiden shared kullanıcı geniş Excel detay sorgusunu başlatabiliyordu. Şimdi dar
  export projeksiyonu gelene kadar bu ikon yalnız owner'da görünür.

**Veri güvenliği:** Migration tablo, kolon, policy, trigger veya index değiştirmedi;
`INSERT/UPDATE/DELETE/TRUNCATE`, backfill ve kullanıcı satırı yeniden yazımı yoktur.
Canlı ön kontrolde 2.851 ürün hareketi, 1.004 ürün ve bütün tenant pointer
kesişimleri salt-okunur sayıldı. Uygulama hiçbir ürünü, hareketi veya işlemi silmedi
ya da düzeltmedi; yalnız rapor fonksiyonları eklendi/değiştirildi.

**Doğrulama:** Migration öncesi canlı V1 imzası, dokuz kolon, ACL, owner,
`SECURITY DEFINER`, volatility, search path ve
`6139dd322f98a53bfd7e4d009acb7a65` gövde parmak izi yeniden doğrulandı; V2'nin
olmadığı görüldü. Migration DDL'i ve owner/shared/own/all/çapraz-tenant/geçersiz
parametre davranış matrisi önce transaction içinde tamamen rollback edilerek
`P0_S8_PRODUCT_BEHAVIOR_ROLLBACK_OK` verdi. Deploy sonrasında metadata/ACL,
V1↔V2 exact satır eşitliği, gerçek aktif ortak üyeliklerde R+U kapısı, beklenen ürün
ve işlem sayısı, çapraz işletme ve null-auth kontrolleri
`P0_S8_PRODUCT_POST_DEPLOY_OK` verdi. Hedef test **5/5 suite, 39/39 test**; ana
oturumda TypeScript temiz, ESLint **0 hata / 104 mevcut uyarı**, tam Jest
**96/96 suite, 1.368/1.368 test** ve iOS Metro **4.089 modül** ile temizdir.

**Telefonda nasıl test edilir:**

1. Owner hesabında **Raporlar → Alış/Satış** ekranını hem Alış hem Satış sekmesinde
   aç. Ürün sıraları, toplamlar ve iade sonrası net tutar önceki doğru owner
   görünümüyle aynı olmalı; Excel ikonu görünmeli.
2. Shared profilde Raporlar + Ürünler'i aç, Cariler ve Personel'i kapat. Cari alış/
   satışa bağlı ürün hareketleri ile bağımsız toplu ürün giriş/çıkışları yine
   görünmeli; Cariler/Personel'in kapalı olması ürün raporunu boşaltmamalı.
3. Aynı profilde önce yalnız Raporlar'ı, sonra yalnız Ürünler'i açık bırak. Rapor
   kartı görünmemeli; eski bir `raporlar/alis-satis` bağlantısı açılırsa veri bir
   kare dahi parlamadan güvenli ekrana dönmeli.
4. Rolü “yalnız kendi eklediği” yap. Yalnız bu shared kullanıcının işlemlerine bağlı
   hareketler ve kendi bağımsız toplu giriş/çıkışları görünmeli. “Tümünü görür”
   seçilince izinli işletmedeki bütün ürün hareketleri gelmeli.
5. Rapor açıkken başka cihazdan Raporlar, Ürünler veya tüm-kullanıcı görünürlüğünü
   daralt; uygulamaya dönüp yenile. Önceki geniş toplam kısa süreliğine dahi
   kalmamalı.
6. Yalnız iade bulunan bir tarih aralığı seç. İade tutarı net toplamı eksiye
   indirebilmeli. İnterneti keserek yeniden denendiğinde sahte sıfır/net toplam
   yerine hata veya güvenli yükleme durumu görülmeli.
7. Shared kullanıcıda Excel ikonu görünmemeli; owner'a dönünce ikon görünmeli ve
   mevcut owner export akışı çalışmalıdır.

**1.5.x / eski istemci etkisi:** 1.5.x aynı V1 adını, dört parametreyi ve dokuz
kolonu almaya devam eder. Owner'ın tenant-tutarlı sonucu değişmez. Raporlar veya
Ürünler kapalı eski shared kullanıcı boş sonuç; own-only kullanıcı yalnız kendi
satırlarının agregasını alır. Bu bilinçli güvenlik daralmasıdır. Sunucu, eski
binary'nin daha önce cihaz diskine yazdığı geniş offline cache'i uzaktan silemez;
eski build yenileme/logout/cache süresine kadar o eski görüntüyü gösterebilir. Yeni
istemci `s6`, V2, kullanıcı/yetki anahtarı ve `persist:false` ile bu cache'i
devralmaz. Hiçbir kullanıcı işlemi veya kolon silinmedi/değiştirilmedi.

**Bilinen sınır:** Sunucudaki mevcut kur bulunamadığında `1:1` fallback davranışı ve
owner Excel detayının bağımsız toplu hareket/karma para birimi doğruluğu bu exact
dokuz kolonlu yetki paketinin kapsamını aşar; ayrı rapor doğruluğu diliminde
ele alınacaktır. Shared Excel bu nedenle şimdilik kapalıdır.

**Etkilenen:** R açık, bazı kaynak modülleri kapalı **2 aktif üyelik** özellikle
risklidir; R kapalı **5 üyelik** dashboard/Edge özetlerinden etkilenebilir.
**Örnek:** Raporlar açık, Personel kapalı kullanıcı toplam maaş giderini veya personel
kırılımını görmemelidir.
**Aşama:** Dashboard, gelir-kaynağı ve ürün alış/satış aggregate dilimleri
tamamlandı; sırada kalan rapor/özet RPC'leri ve dar rapor detay/export
projeksiyonları vardır.

### P0-S9 — Notlar aksiyon/bağlam/sahiplik sınırı canlı

**Durum: SUNUCU TAMAMLANDI ve CANLI; yeni istemci yerelde hazır, telefon kabulü
bekliyor.** `20260729112129_harden_notlar_rls_actions_context` migration'ı canlıdır;
mutasyon/cache/UI uyarlaması yeni istemci kaynaklarında tamamlanmıştır.

Canlı sözleşme:

- serbest genel not için Notlar; hesap/cari/personel/ürün bağlamlı not için ilgili
  kaynak modül; birden çok bağ varsa hepsi **AND kesişimi** olarak gerekir;
- `assigned_to_user` yetki vermez, yalnız görünürlüğü hedef kullanıcıya daraltır;
- okuma her zaman `can_see_all_users_data` veya own filtresinden; yazma exact
  create/update/delete aksiyonu ile own/all sahiplik seviyesinden geçer;
- UPDATE eski satıra `USING`, yeni satıra `WITH CHECK` uygular; UPDATE/DELETE mevcut
  hedef kullanıcı görünürlüğünü `edit_all` için bile baypas etmez;
- INSERT trigger'ı `created_by` değerini `auth.uid()` ile sahipler ve kimlik/tenant
  referanslarını değiştirilemez/tutarlı tutar;
- görünürlükten çıkan bir satırı güncelleyebilmek için scalar UUID döndüren
  `not_guncelle_v1(uuid,uuid,jsonb)` yalnız allowlist patch'i işler;
- yeni istemci not fotoğrafını client UUID ile önce yükleyip aynı INSERT'te bağlar;
  eski add-only client'ın `INSERT → upload → yalnız photo_path/updated_at UPDATE`
  akışı dar legacy policy + delta trigger ile korunur.

**Veri güvenliği ve hash provenance:** Uygulama öncesindeki **56 notun 56'sı**
`created_by=NULL` idi; backfill yapılmadı ve bu legacy satırlar değiştirilmedi.
Raporun not satırları için kullandığı aynı canonical sorgu/algoritma ile alınan veri
parmak izi uygulama öncesi ve sonrası
`8c0c8d4f8caea430cb971f36c502c29f` kaldı. Bu değer policy katalog hash'i değildir:
eski beş policy'nin ayrı preflight parmak izi
`b18f54ff8dabc0d3dc4e2b59b2a952be` idi ve policy'ler bilinçli olarak değiştirildi.
Mevcut orphan/cross-tenant cari referanslı tek legacy not da otomatik düzeltilmedi veya
silinmedi.

**Doğrulama:** Owner, full/view/add/edit-own/edit-all, K5 bağlamsal okuma,
assigned-away RPC güncellemesi, görünürlük kapalı/pasif/cross-tenant/anon negatifleri,
legacy fotoğraf delta allowlist'i, Storage object owner negatifi ve bozuk JSON patch
tipleri rollback matrisinde sınandı. Migration/top-level doğrulama gerçek kullanıcı
satırına DML uygulamadı.

**Etkilenen:** Notlar açık `view` kullanıcıları ve bütün bağlamsal not akışları.
**Aşama:** Not tablosu RLS/RPC ve yeni istemci kapanışı tamamlandı; not fotoğrafının
kanonik upload + SELECT/DELETE Storage zarfı P0-S6B ile canlıya alındı. İşlem
fotoğrafının nihai tip/modül sınırı P0-S1'e bağlı kalır.

**Eskiden:** Shared not politikası yalnız `modules.notlar` izine bakıyor; level/action,
kaynak bağlamı ve sahiplik ayrımını tam zorlamıyordu. `view` kullanıcı REST ile yazma
deneyebiliyor, cache rol/tenant değişiminde eski notu taşıyabiliyordu.

**Şimdi:** Okuma bağlam ve sahiplik kesişimine, yazma exact aksiyon ile own/all
seviyesine bağlıdır. Not query anahtarları kullanıcı + yetki parmak iziyle ayrılır,
hassas cache persist edilmez ve cache şeması yükseltilmiştir.

**Telefonda test:** Test shared rolünü sırayla:

1. `Notlar=view` yap; serbest notlar okunmalı, ekle/düzenle/sil görünmemeli ve deep-link
   yazması yetki mesajıyla reddedilmeli.
2. Cariler açık, Notlar kapalı yap; cari detayındaki cari notu okunmalı fakat serbest
   Notlar ekranı ve yazma aksiyonları açılmamalı.
3. `Notlar=add` yap; yeni metin ve fotoğraflı not eklenmeli, kendi olmayan not
   düzenlenememeli.
4. `edit_own` ile kendi notunu, `edit_all` ile izinli bağlamdaki peer notunu düzenle;
   başka kullanıcıya atanarak listeden çıkan notta kayıt donmamalı. Migration öncesi
   `created_by=NULL` legacy not `edit_own` için “kendi notu” sayılmamalı; owner veya
   `edit_all` yönetebilmeli.
5. Rolü/Notlar iznini açık ekrandayken kapat; eski notlar yeniden başlatma beklemeden
   ekrandan/cache'ten kaybolmalı.

**1.5.x / eski istemci etkisi:** Kolon/imza silinmedi. Eski INSERT payload'ı
`created_by` göndermese de trigger sahipler; normal izinli akış sürer. İzin dışı eski
yazma artık 401/403 veya sıfır satır görebilir. Add-only eski fotoğraf ekleme akışı
dar uyumluluk kapısıyla çalışır. Cariler açık + Notlar kapalı eski shared kullanıcı
cari notunu okuyabilir, serbest notu okuyamaz/yazamaz. Mevcut 56 legacy satır
backfill edilmedi; NULL sahipli kayıt `edit_own` tarafından sahiplenilemez, owner veya
yetkili `edit_all` tarafından yönetilebilir.

### P0-S10 — public ekstre yaşam döngüsü canlı

**Durum: TAMAMLANDI ve CANLI.** Kesintisiz rollout zorunlu sırayla tamamlandı:

1. `20260729112753_harden_public_statement_lifecycle` phase-1;
2. `cari-ekstre` Edge **v6**, `verify_jwt=false`, dağıtım hash'i `13c287…`;
3. `20260729113246_finalize_public_statement_service_role_acl` phase-2.

`verify_jwt=false` bilinçlidir: public tarayıcı JWT taşımaz; tek yetki kaynağı
48-hex opak ve süreli token'dır. Edge artık link tablosunu doğrudan okumaz,
yalnız `service_role` çağrısına açık `cari_ekstre_token_dogrula_v1(text)` ile tokenı,
süre/iptal durumunu ve **link üreticisinin güncel Cariler yetkisini** her açılışta
yeniden doğrular. Phase-2 sonrasında `service_role` doğrudan tablo SELECT grant'i de
kaldırılmıştır.

Sunucu sözleşmesi:

- shared tam 1/7/30 gün; owner tam 1/7/30/365 gün; NULL/süresiz/ara değer yok;
- aktif link anahtarı işletme + cari + üreticidir; shared yalnız kendi linkini,
  owner tüm üreticilerin linkini görebilir/iptal edebilir;
- üretici başına aktif link yenilenir ve üretici izolasyonu korunur;
- işletme genelinde mevcut 10 link/saat sınırı advisory lock ile yarışa dayanıklıdır;
- create/cancel RPC adları, parametreleri, default 30 ve sonuç şekilleri korunmuştur;
- revoked/süresi dolmuş JSON/HTML ve bakiye hesaplama sözleşmesi Edge v5 ile aynı
  tutulmuştur.

**Veri güvenliği ve hash provenance:** Phase-1/phase-2 mevcut link satırlarında
DML/backfill yapmadı. Canlı preflight'taki üç linkin üçü de 30 günlüktü;
`created_by IS NULL=0`, bozuk token=0 ve aktif duplicate grup=0 sayımları uygulama
sonrasında da değişmedi. Audit aracının provenance değeri
`8edd3ee7ad1f4733d00b0a0f3ec321bb` yalnız kendi bilinmeyen formülüne ait bir tablo
kanıtıdır. Migration'ın ayrı canonical preflight parmak izleri
kolon=`9836499cea373e719c7cb8c8288c8e7f`,
constraint=`a77ab3ae466ec92cb4d53402023c841a`,
policy=`71892c1efea89373200c887b20321904`,
index=`cf71a1041f0bd1ef3f4f05a3b03b550c`,
ACL=`46875263bd6598c4534e2df7d1847a5e` olarak değerlendirilmiştir; bu farklı
algoritma/nesne hash'leri birbirinin eşiti gibi yorumlanmamıştır.

**Eskiden:** Sunucu NULL/süresiz ve ara süreyi kabul edebiliyor; link üreticisinin
Cariler izni sonradan kapansa bile public link yaşamaya devam edebiliyor;
`service_role` link tablosunu doğrudan okuyabiliyordu.

**Şimdi:** Yeni linkler allowlist sürelidir; her public açılış üreticinin güncel
Cariler iznini doğrular; iptal ve görünürlük üretici bazlıdır; Edge'in tabloya doğrudan
SELECT yolu kapalıdır.

**Telefonda test:** Owner cari detayında Paylaş → Ekstre bağlantısında 1 gün, 1 hafta,
1 ay ve 1 yıl görmeli; “Süresiz” görünmemeli. Shared Cariler kullanıcısında yalnız
1/7/30 gün görünmeli. Owner ve shared ayrı link üretip ikisini tarayıcıda açabilmeli;
shared kendi linkini iptal ettiğinde owner'ın linki yaşamaya devam etmeli. Sonra shared
kullanıcının Cariler iznini kapat; onun eski linki bir sonraki açılışta veri
göstermemeli, owner'ın linki etkilenmemeli. Geçerli linkte ekstre tutarı ve işlem
satırları uygulamadaki cariyle eşleşmeli.

**1.5.x / eski istemci etkisi:** Mevcut create/cancel RPC imzaları ve owner'ın normal
30 günlük yolu korunur. Eski UI NULL/süresiz, ara değer veya shared 365 gönderirse
sunucu `22023` ile reddeder; bu bilinçli güvenlik kapanışıdır. Eski mobil client link
tablosunu doğrudan okumadığı için phase-2'den etkilenmez. Yalnız artık Cariler izni
kaldırılan üreticinin mevcut linki public açılışta geçersiz olur.

### P1-S11 — kategori owner-only kararı sunucuda tam uygulanmış değil

İstemci kategori klasörünü owner-only koruyor; fakat canlı shared kategori yazma yolları
eski actions modelinden kalma izinler taşıyor. Doğrudan REST/RPC çağrısında owner-only
kuralı tek sunucu yeteneğine bağlanmış değil.

**Etkilenen:** kategori yazma aksiyonu taşıyan legacy veya geniş ortak izinleri.
**Örnek:** operator UI'da kategori ekranını görmese bile doğrudan kategori ekleme veya
değiştirme isteği deneyebilir.
**Aşama:** REST/RPC yazma; istemci guard'ı tek başına kanıt değildir.

---

## 10. P0/P1 — istemci tutarsızlıkları

### C1 — Ürün `view` yazma yüzeyleri — yerel düzeltme tamam

**Durum: Yerel istemci düzeltmesi tamamlandı; bağımsız kod incelemesi temiz ve hedefli
5/5 sözleşme testi geçti. Telefon kabulü bekliyor.**

**Profil:** U + `view`.
**Eskiden:** Ürün listesinde FAB, boş-durum ekleme, satır “yeni hareket” aksiyonu,
QuickUrunBar ve detay stok giriş/çıkış yolları `view` kullanıcısına açılabiliyordu.

**Şimdi:** Liste, satır ve detay ekranı aynı `canCreate('urunler')` kapısına bağlandı.
`view` seviyesinde ekleme CTA'sı, FAB/menü/backdrop, QuickUrunBar, yeni hareket ve
yönetim menüsü render edilmiyor. Açık modal/bar varken izin daralırsa yüzey kapanıyor;
doğrudan create ve toplu hareket rotaları da create guard taşıyor.

**Telefonda test:** Yalnız Ürünler + `view` özel rolüyle Ürünler listesini ve bir ürün
detayını aç. “İlk ürünü ekle”, FAB, üç nokta/yeni hareket ve stok giriş-çıkış
görünmemeli; geçmiş hareketler okunabilmeli. Rolü `add` yapınca aynı aksiyonlar
görünmeli. QuickUrunBar açıkken rolü tekrar `view`e indir; bar kapanmalı ve kayıt
yapmamalı.

### C2 — Hesap ve personel detay yazma yüzeyleri — istemci sertleştirmesi tamam

**Durum: Güncel kod denetimiyle eski bulgunun büyük bölümü bayat çıktı. Kalan iki
istemci delikleri kapatıldı; 13/13 bağlam sözleşme testi ve TypeScript kontrolü geçti.
Telefon kabulü bekliyor. Yalnız-H/Yalnız-P için pozitif minimal yazma akışı sunucu
projeksiyonu gerektirdiğinden ayrı backlog'tur.**

Normal Hesap/Personel create FAB+QTB, satır edit/copy/delete, ürün modalı/foto aksiyonu,
detail deep-link ve standalone edit route güncel kodda merkezi yetenek veya geçici
owner-only ham kaynak kapısıyla zaten fail-closed'dur. Denetimde kalan gerçek delikler:

- Hesap ve Personel detayındaki `IleriTarihliIslemlerSection` `readOnly` almıyordu;
  shared kullanıcı ham edit/sil/tamamla yüzeyini görebiliyordu.
- Personel izin kota kartındaki “İzin Ekle” `view` seviyesinde de tıklanabiliyor; QTB
  mount edilmese bile açık state izin sonradan genişleyince yeniden belirebiliyordu.
- Açılış bakiyesi modalı açıkken update izni daralırsa modal/native onay callback'i
  güncel yetkiyi yeniden kontrol etmeden kaydetmeye devam edebiliyordu.

**Eskiden:** Shared kullanıcı ileri tarihli satırı düzenleme/silme/tamamlama akışına
girebilir; Personel `view` kullanıcısı izin ekleme düğmesini görebilir; create/edit/copy
state'i rol daralmasından sonra bellekte bekleyebilir; açık bakiye modalı eski yetkiyle
kaydetmeye çalışabilirdi.

**Şimdi:** İki ileri tarihli bölüm shared kullanıcıda `readOnly={!isOwner}`; component
açık editör ve kur panelini daralmada temizliyor. Hesap/Personel create state'i
`canCreateTransactions` kapanınca, edit/copy state'i owner kapısı kapanınca sıfırlanıyor.
İzin Ekle callback'i optional ve yalnız gerçek create yeteneğinde render ediliyor.
Açılış bakiyesi modalı güncel `isBalanceEditable` kapanınca gizleniyor; hesap save'i ve
personelin native onay callback'i latest ref ile yeniden fail-closed kontrol ediyor.

**Telefonda test:** H veya P + `view` shared rolle ilgili detayı aç. İleri tarihli
satırlar okunabilmeli fakat Düzenle/Sil/Tamamla görünmemeli; izin kota kartında “İzin
Ekle”/artı görünmemeli, geçmiş kartı okunabilmeli. Owner hesabında bu aksiyonlar
korunmalı. Owner'da ileri tarihli editör veya kur panelini açıp aynı ekran shared
bağlama/izne daraltıldığında açık yüzey kapanmalı ve izin tekrar verilince kendiliğinden
yeniden açılmamalı. Açılış bakiyesi modalını açıp rolü `view`e düşür; modal kapanmalı,
önceden açık native onayda “Onayla”ya basılsa bile bakiye değişmemeli.

**Bilinçli kısıt:** Geniş QTB dört kaynak modülünü yüklediği için yalnız-H/Yalnız-P
shared kullanıcıya ham edit/copy açılmadı. Bu profillerin pozitif yazma davranışı dar
sunucu projeksiyonu/işleme özel RPC sonrası ayrıca açılmalıdır.

### C3 — İlişkisel işlem sorguları modül kesişimini tam uygulamıyor

**Durum: KISMİ SUNUCU KAPANIŞI CANLI. Cari, hesap ve personel detaylarının dar
projeksiyonları hazır; temel REST/RLS, linked-cari ve kalan yan yüzeyler açıktır.**

Güncel denetim, kapalı hedef tablonun gömülü `hesap/cari/personel` nesnesinin RLS
nedeniyle çoğunlukla `null` olduğunu; asıl sızıntının tip/modül-körü `islemler` SELECT
RLS'i ve `select *` ile dönen kök işlem satırı olduğunu doğruladı. H-only hesap
ekstresine cari/personel işlem satırı; P-only personel ekstresine H gerektiren
ödeme/tahsilat satırı tutar, açıklama, kaynak FK, kur ve fotoğraf yolu gibi alanlarla
gelebilir. Linked-cari görünümünde karşı işletmenin kök işlem kolonları da aynı riskte.

Generic “Tüm İşlemler” ve global arama yeni istemcide owner-only/fail-closed'dur; bu UI
bulgusu bayattır. Doğrudan REST/RLS riski sürer.

**Güncel istemci + sunucu savunması:** `useAllIslemlerByCari`,
`useIslemlerByHesap` ve üç personel okuma hook'u shared kullanıcıda exact-column
RPC'leri tüketir. Kaynak modülü hem `enabled` hem `queryFn`/sunucu resolver içinde
doğrulanır; kullanıcı + izin parmak izi query key'e girer ve shared sonuç
`persist:false` davranışıyla diske yazılmaz. Personel raporu ayrıca Personel route
guard'ı içinde mount olur. Böylece Raporlar açık ama Cariler/Personel kapalı bilinen-ID
deep-link'i sorguyu başlatmaz ve eski cache'i farklı izin anahtarında çizmez.

**Kalan sunucu kapanışı:** Mevcut temel `islemler` RLS'ini hemen daraltmak eski store
client'larında boş liste/403 üretebilir. Cari/hesap/personel bağlamının yeni-client
uçları hazırdır; linked-cari, ürün/kalan işlem yüzeyleri, ileri-tarihli/dar export ve
`get_personel_ozet` gibi doğrudan RPC'ler ayrıca projekte edilmelidir. Desteklenen
shared client'lar taşınıp minimum sürüm planlandıktan sonra temel REST politikası
daraltılmalıdır.

**Telefonda test:** Raporlar açık/Cariler kapalı shared rolle bilinen `cariId` rapor
deep-link'ini; Raporlar açık/Personel kapalı rolle bilinen `personelId` linkini aç.
İlgili tam-geçmiş sorgusu/verisi görünmemeli. Modülü açınca normal rapor yüklenmeli;
tekrar kapatıp uygulamayı yeniden başlatınca disk cache'ten eski satır gelmemeli.

### C4 — Mutation hook'ları kendi içinde fail-closed değil

**Durum: İSTEMCİ C4-A TAMAMLANDI / KRİTİK SERVER KALANI AÇIK. Migration veya canlı
değişiklik yapılmadı; telefon kabulü bekliyor.**

`useUpdateIslem` ve `useDeleteIslem` artık hook içinde tenant satırını okuyup
`created_by` üzerinden `canUpdate/canDelete` fail-closed kontrolü yapıyor; canlı atomik
RPC'ler de sahiplik/aksiyonu server'da tekrar doğruluyor. Raporun bu iki hook için eski
genel iddiası bayattır.

**Eskiden:** Create hook'ları yalnız işletme varlığını kontrol ediyor; kaynak modül ve
güncel işlem aksiyonunu çağırana bırakıyordu. Update yalnız yeni UI kapısına, delete
yalnız işlem sahipliğine güvenebiliyordu. Doğrudan stok mutation'larında hook-içi izin
kontrolü yoktu; ürün detayındaki bütün hareket butonları ürünün `created_by` değerinden
türetiliyordu. Rol/işletme bir ağ `await`i sırasında değişirse eski closure yazmaya
devam edebiliyordu.

**Şimdi:**

- Saf tip allowlist'i; `gelir/gider/transfer → H`, tüm cari tipleri → C,
  personel ödeme/tahsilat → P+H, diğer personel tipleri → P uygular. K13 gereği cari
  ödeme/tahsilatta H aranmaz; bilinmeyen tip fail-closed kalır.
- İşlem aksiyonu yalnız `islemler` yeteneğinden, bağlı kaynaklar yalnız modül
  görünürlüğünden alınır. Böylece yeni global seviyeler kadar legacy per-modül
  izinleri de gereksiz daraltılmaz.
- Create, update ve delete ilk kontrolde ve RPC'den hemen önce güncel tenant/izin
  snapshot'ını tekrar okur. Update eski+yeni tip kaynaklarının birleşimini; delete
  mevcut tipi; ikisi de sunucudan okunan `created_by` değerini kullanır.
- Ürünlü create yalnız desteklenen gelir/gider/cari alış-satış-iade tiplerinde ve U
  görünürlüğüyle açılır.
- Doğrudan ürün create/hedef düzeltme U create; update/delete ise sunucudan yeniden
  okunan hareketin tenantı ve `created_by` değeriyle U update/delete kapısına bağlıdır.
  Cari-linked tekli/toplu akış U create + C görünürlüğü + I create kesişimidir.
- Ürün detayındaki Düzenle/Sil butonu artık ürün sahibine değil her hareketin
  `created_by` değerine bağlıdır. Gecikmeli silmede izin daralırsa mutation reddedilir,
  satır geri gelir ve typed `42501` mesajı gösterilir.

**Otomatik doğrulama:** C4 işlem/ürün kaynak, sahiplik ve yarış paketleri ana oturumda
hedef olarak yeniden çalıştırıldı; 6 suite/83 test, ek async ürün-yarış turu
4 suite/57 test ve async işlem-yarış turu 1 suite/7 test yeşil, TypeScript temiz ve
hedef ESLint 0 hatadır.

**Telefonda test:**

1. Tüm kaynakları açık `edit_own` ortakla kendi işlemini düzenle; çalışmalı. Başka
   kullanıcının işleminde Düzenle/Sil görünmemeli veya açık deep-link typed yetki
   mesajıyla durmalı.
2. Cari ödeme/tahsilat için Cariler açık, Hesaplar kapalı profili dene; K13 minimal
   hesap seçimi eskisi gibi çalışmalı. Personel ödeme/tahsilatta ise P+H birlikte
   olmadan kayıt başlamamalı.
3. QTB açıkken owner başka cihazdan rolü `view`e düşürsün; Kaydet'e basınca işlem
   yazılmamalı ve “Yeni işlem oluşturma yetkiniz yok” mesajı gelmeli.
4. `edit_own` Ürünler kullanıcısında kendi manuel stok hareketinde Düzenle/Sil
   görünmeli, başka kullanıcının hareketinde görünmemeli. Kendi satırında Sil'e basıp
   5 saniyelik bekleme sırasında rolü `view`e düşür; satır geri gelmeli ve yetki
   mesajı çıkmalı.

Kalan doğrulanmış server açıkları:

- Canlı create/update/delete RPC'leri işlem tipi→kaynak modülünü ve client'ın
  gönderdiği bakiye etkisini bütünüyle sunucuda yeniden türetmiyor.
- `update_urun_miktar` / `set_urun_miktar_hedef` server tarafında yalnız Ürünler
  modülüne bakıyor; seviye/aksiyon/sahiplik eksik.
- Canlı `update_urun_miktar` yüzeyinde `p_isletme_id => NULL` dalı tenant ve izin
  çözümlemesini atlayabiliyor; fonksiyon `authenticated` rolüne açık. Bu nedenle yalnız
  istemci butonunu gizlemek server sınırını kapatmıyor.
- Canlı `increment_balance(text, uuid, numeric)` fonksiyonunda `PUBLIC`, `anon` ve
  `authenticated` EXECUTE grant'leri var. Aktif bir üye, bildiği entity UUID'si için
  kaynak modülü/seviye/işlem bağlamı olmadan delta gönderebiliyor.
- Direct stok write'ları REST hareket kaydı + stok RPC olarak iki aşamalı; ikinci adım
  veya rollback ağda kaybolursa stok/hareket ayrışabilir.
- Normal işlem edit RPC'si commit ettikten sonra ürün stok reapply ayrı RPC'dir; reapply
  hatası warning ile yutulup işlem başarılı sayılabilir. Kredi kartı ürün hareketi de
  işlem create'den sonra ayrı yazılır ve hata success/dismiss yoluna düşebilir.

**Güvenli sonraki adım:** Yeni additive atomik ürün create/update/delete ve
işlem+ürün-reapply v2 RPC ailesi; tek server resolver ile tip×modül×seviye×sahiplik;
stok/bakiye etkisinin server'da türetilmesi. Eski RPC'ler store client geçişi
tamamlanmadan revoke/replace edilmemeli. Yalnız client guard eklemek savunma sağlar ama
bu maddeyi güvenlik açısından kapatmaz.

### C5 — Mutabakat deep-link ve `view` yazma kapıları — yerel düzeltme tamam

**Durum: Yerel deep-link ve `view` yazma kapıları tamamlandı; 5/5 mutabakat sözleşme
testi geçti. Telefon kabulü bekliyor.**

**Profil:** Cariler kapalı herhangi bir ortak.
**Eskiden:** Cariler kapalıyken doğrudan rota cari ve geniş cari işlem sorgusunu
başlatabiliyordu. Cariler açık ama seviye `view` iken “Eksikleri ekle”, “Bakiyeyi
Düzelt”, satıra dokunarak ekleme ve QuickTransactionBar yazma akışları görülebiliyordu.

**Şimdi:** `mutabakat/_layout.tsx` Cariler modül guard'ı çocuğu mount etmeden yönlendirir.
`view` kullanıcısı karşılaştırma sonucunu okuyup paylaşabilir; toplu/tekil ekleme,
bakiye düzeltme, dokunma ipucu ve QTB gizli/pasiftir. QTB açıkken izin daralırsa önce
bar kapanır, ardından kuyruk temizlenir; geç kalan başarı yeni yazma akışını açamaz.

**Telefonda test:** Cariler kapalı ortak hesapta `/mutabakat/<cari-id>` deep-link'ini
aç; ekran/sorgu yüklenmeden güvenli rotaya dönmeli. Cariler + `view` hesabında bir
ekstre karşılaştır; rapor ve Paylaş çalışmalı, “Eksikleri ekle”, “Bakiyeyi Düzelt” ve
satır ekleme davranışı olmamalı. `add` seviyesinde bu yazma aksiyonları görünmeli;
QTB açıkken rol `view`e indirilince bar kapanmalı.

### C6 — `foto-import` owner guard'ı — yerel düzeltme tamam

**Durum: Yerel owner guard tamamlandı; telefon kabulü bekliyor.**

**Eskiden:** Shared kullanıcı doğrudan `/foto-import` rotasına gidince owner kontrolü
olmadan OCR provider'ı mount olabilir, ürün/cari/hesap verisi yükleyip mutation
hazırlayabilirdi.

**Şimdi:** `OwnerRouteGuard`, `FotoImportProvider`ın dışına taşındı; owner olmayan
kullanıcıda provider ve çocuk ekranlar hiç mount edilmez.

**Telefonda test:** Herhangi bir shared hesapla doğrudan `/foto-import` aç; güvenli
rotaya dönmeli ve tarama ekranı bir anlığına dahi görünmemeli. Owner hesabında aynı
rota ve fotoğraf inceleme akışı eskisi gibi çalışmalı.

### C7 — eski purchaser düzenleme ekranı — yerel düzeltme tamam

**Durum: Yerel legacy rol normalizasyonu tamamlandı; telefon kabulü bekliyor.**

**Canlı etki:** **1 aktif legacy purchaser üyeliği**.
**Eskiden:** RoleSelector eski `purchaser` rolünü görsel olarak Özel gösterirken form
state'i `purchaser` kalıyor; PermissionEditor açılmıyor ve sahibi gerçek izinleri
düzenleyemiyordu.

**Şimdi:** Düzenleme sheet'i legacy `purchaser` rolünü `custom` state'ine eşliyor,
mevcut permissions JSON'unu aynen koruyor ve PermissionEditor'ı açıyor.

**Telefonda test:** Owner olarak legacy satın almacı üyeliğini düzenle. Rol “Özel” ve
mevcut izinler doğru seçili görünmeli. Hiçbir izni değiştirmeden kaydet; izinler
kendiliğinden genişlememeli/daralmamalı. Sonra tek bir modülü değiştirip tekrar açarak
yalnız o değişikliğin kaldığını doğrula.

### C8 — cache izin normalizasyonu — yerel düzeltme tamam

**Durum: Yerel cache normalizasyonu tamamlandı ve hedefli testlerle kilitlendi; telefon
kabulü bekliyor.**

**Canlı etki:** level alanı eksik **4 aktif üyelik**; ayrıca ileride kısmi JSON yazan
eski client'lar.
**Eskiden:** `permissionCacheGuard.ts`, açık bir `level` alanı varken bile eksik
`notlar`/`birikim` anahtarını legacy `true` sayabiliyor; izin daraltıldığı hâlde disk
cache'i “erişim kaybı yok” sanabiliyordu.

**Şimdi:** Eksik `notlar`/`birikim` yalnız gerçekten `level` alanı olmayan legacy
kayıtta eski uyumluluk gereği açık sayılır. Geçerli veya geçersiz ama açıkça yazılmış
bir `level` varsa eksik modül deny-by-default yorumlanır; bozuk yeni izin cache
temizliğini fail-closed tetikler.

**Telefonda test:** Özel rolde Notlar veya Birikim açıkken ilgili listeyi yükle. Owner
başka cihazdan bu modülü kapatsın; shared uygulamayı öne getir. Eski satırlar kısa
süreliğine geri gelmemeli, menü/liste kaybolmalı. Uygulamayı tamamen kapatıp açınca da
disk cache'ten veri görünmemeli.

### C9 — ürün hareketindeki minimal cari adı fazla gizleniyor

**Durum: TAMAMLANDI ve CANLI. Additive dar RPC canlıya alındı; istemci kodu yerelde
tamamlandı, telefon kabulü bekliyor.**

**Eskiden:** U açık/C kapalı profilinde ürün hareketinin bağlı cari adı tamamen
gizleniyordu. Ana hareket sorgusundan geniş `cariler(id,name,type)` ilişkisini çekmeye
devam etmek ise cari modül sınırını gereksiz yere genişleteceği için güvenli değildi.

**Şimdi:** `get_urun_hareket_minimal_cari_labels(uuid,uuid)` yalnız
`urun_hareket_id + cari_name` döndürüyor. Owner veya aktif ve geçerli Ürünler üyesi
olmak zorunlu; bozuk/string izin değerleri fail-closed, arşiv görünürlüğü mevcut Ürünler
RLS sözleşmesiyle aynı. Cariler kapalıyken ana sorgu cari id/tip/bakiye çekmiyor; dar
etiket sorgusu diske persist edilmiyor ve ad linksiz gösteriliyor. Cariler açıksa eski
tam ilişki ve cari detay bağlantısı korunuyor.

**Canlı doğrulama:** Migration öncesi `BEGIN/ROLLBACK` matrisinde owner, aktif legacy
üye, geçersiz level, bozuk JSON boolean, arşiv açık/kapalı, ilgisiz kullanıcı, anonim
bağlam ve ACL sınandı; rollback sonunda fonksiyon ve test fixture değişikliği kalmadı.
Canlı uygulama sonrası `SECURITY DEFINER`, `STABLE`, boş `search_path`, PUBLIC/anon
revoke, authenticated grant ve tam `TABLE(urun_hareket_id uuid, cari_name text)` çıktı
şekli doğrulandı. Gerçek fixture'da dar çıktı doğrudan join ile aynı 2 satırı verdi.
Hedef sözleşme testi 7/7, bağımsız inceleme ve TypeScript kontrolü temiz geçti.

**Telefonda test:** Ürünler açık, Cariler kapalı özel rolle cari bağlı hareketi bulunan
bir ürün detayını aç. Cari adı sade ve dokunulamaz görünmeli; cari detayına rota,
tip/bakiye/id görünmemeli. Cariler'i açınca mevcut tıklanabilir cari etiketi geri
gelmeli. Arşivleri göremez rol arşivli üründen etiket alamamalı.

**1.5.x / eski istemci etkisi:** Yeni RPC additive'dir; tablo/kolon/veri değişmez.
Eski client bu ucu çağırmadığından eski davranışını sürdürür.

### C10 — empty-state ve yanıltıcı girişler — yerel düzeltme tamam

**Durum: Yerel istemci düzeltmesi tamamlandı; rota/legacy paketindeki 5/5 sözleşme
testiyle doğrulandı. Telefon kabulü bekliyor.**

**Eskiden:** Cari/personel boş-durum ekleme CTA'ları `view` seviyesinde görünebilir;
Daha'daki işletme profil kartı shared kullanıcıya tıklanabilir ve owner-gated hedefe
gidecekmiş gibi chevron gösterebilirdi.

**Şimdi:** Cari/personel açıklama ve ekleme CTA'ları kendi create yeteneğine bağlıdır.
Shared kullanıcı işletme profilini yalnız bilgi kartı olarak görür; kart dokunulamaz ve
chevron yoktur. Owner görünümü ve ayarlar navigasyonu korunur.

**Telefonda test:** Veri olmayan bir test işletmesinde Cari ve Personel modüllerini
`view` seviyesinde aç; “ilk ... ekle” açıklaması/butonu görünmemeli. Daha sekmesindeki
işletme kartına dokun; shared hesapta hiçbir yere gitmemeli ve chevron olmamalı.
Owner hesabında kart hâlâ İşletme Ayarları'na açılmalı.

### C11 — “Tüm İşlemler” fail-closed ama eksik

`src/app/islemler/_layout.tsx` ortak kullanıcıları geçici olarak tamamen owner-only
tutuyor. Bu veri sızdırmaz; fakat K10'daki “açık modüllere göre filtrelenmiş tüm
işlemler” deneyimi tamamlanmamıştır.

### C12 — public ekstre UI'da süresiz seçenek

**Durum: Yeni istemci sınırı ve P0-S10 sunucu kapanışı tamamlandı/canlı; telefon kabulü
bekliyor.**

**Eskiden:** Owner süre seçiminde `365 gün` yanında `Süresiz` seçeneğini de görüyordu;
hook `null` değerini kabul edip sunucuya iletiyordu.

**Şimdi:** Ortak kullanıcı yalnız 1/7/30 gün, owner 1/7/30/365 gün seçebilir. Saf
`isAllowedPublicStatementDuration` allowlist'i `null`, bozuk tip, ara değer ve 365
günden uzun süreyi fail-closed reddeder. 3/3 hedef istemci testi geçti. Aynı allowlist
artık `20260729112753` ile sunucuda da zorlanır; doğrudan RPC ile NULL/süresiz üretim
kapalıdır. Edge v6 link üreticisinin Cariler iznini her public açılışta yeniden
doğrular ve `20260729113246` sonrasında link tablosunu doğrudan SELECT etmez.

**Telefonda test:** Owner olarak bir cari detayından Paylaş → Ekstre bağlantısı aç.
1 gün, 1 hafta, 1 ay ve 1 yıl görünmeli; “Süresiz” görünmemeli. Shared Cariler
kullanıcısında yalnız 1 gün, 1 hafta ve 1 ay görünmeli. 1 yıllık owner linki
oluşturulup paylaşılabilmeli. Shared linki açtıktan sonra o kullanıcının Cariler iznini
kapat; aynı link tekrar açıldığında ekstre göstermemeli.

**1.5.x / eski istemci etkisi:** Eski owner'ın normal 30 günlük linki çalışır. Eski UI
NULL/süresiz veya shared 365 isteği gönderirse artık sunucu `22023` ile reddeder;
mevcut RPC imzası ve başarılı sonuç şekli korunmuştur.

---

## 11. Üretimde gerçek kullanım ve etki analizi

### Dahil etme ölçütü

Bir üyelik şu koşullarla “uygun aktif” sayıldı:

- `isletme_users.status='active'`;
- iç/test işletmesi değil;
- işletme silinmek üzere değil;
- auth kullanıcısı silinmemiş veya banlı değil.

Bu ölçüm owner hesaplarını değil, paylaşılan üyelikleri sayar.

### Rol ve seviye dağılımı

> **Tarihsel snapshot:** Aşağıdaki rol/modül/kesişim tabloları ilk 28 Temmuz
> denetimindeki 19 uygun aktif üyeliği gösterir; sonradan üyelikler değiştiği için
> bugünkü toplam gibi okunmamalıdır. 29 Temmuz S-12d canlı ön kontrolünde güncel
> aggregate **24 aktif üyelik / 23 `can_see_all_users_data=true` / 1 `false`** olarak
> ölçüldü. Kişisel kimlik veya finansal içerik rapora alınmadı.

| Rol | Aktif üyelik |
|---|---:|
| Yönetici | **10** |
| Özel | **7** |
| Operatör | **1** |
| Legacy purchaser | **1** |

| Seviye | Aktif üyelik |
|---|---:|
| `edit_all` | **9** |
| `edit_own` | **4** |
| `view` | **2** |
| Legacy, `level` eksik | **4** |
| `add` | **0** |

### Etkin modül dağılımı

Legacy `notlar`/`birikim` fallback'i mevcut istemci davranışıyla hesaba katıldı:

| Modül | Açık üyelik |
|---|---:|
| Hesaplar | **17** |
| Birikim | **13** |
| Cariler | **18** |
| Ürünler | **18** |
| Personel | **16** |
| Raporlar | **14** |
| Notlar | **18** |

28 Temmuz tarihsel 19 üyelik snapshot'ının tamamında
`visibility.can_see_all_users_data=true` etkin yorumlanıyordu. 29 Temmuz güncel
aggregate'ında ise 24 aktif üyeliğin biri `false` durumundadır. Bu yüzden sahiplik
kuralı teorik bir kenar durum değil, canlıda korunan gerçek güvenlik eksenidir.

Önemli kesişimler:

| Kesişim | Üyelik |
|---|---:|
| Hesaplar + Personel | **15** |
| Cariler + Personel | **16** |
| Cariler + Ürünler | **18** |
| Personel açık, Raporlar kapalı | **4** |
| Raporlar açık, Personel kapalı | **2** |
| Personel kapalı toplam | **3** |
| Raporlar kapalı toplam | **5** |

### Gerçek modül kombinasyonları ve son 30 gün

| Kombinasyon | Üyelik | Kullanıcı | İşletme | 30g işlem gören işletmeye bağlı üyelik | 30g bizzat işlem giren üyelik |
|---|---:|---:|---:|---:|---:|
| H+C+U+P+R+N | 11 | 9 | 9 | 8 | 1 |
| H+C+U+P+N | 4 | 4 | 3 | 4 | 3 |
| C+U+P+R+N | 1 | 1 | 1 | 1 | 0 |
| C+U+R+N | 1 | 1 | 1 | 1 | 1 |
| H | 1 | 1 | 1 | 1 | 1 |
| H+C+U+R+N | 1 | 1 | 1 | 1 | 0 |

### Aktivite

| Pencere | Ortak kullanıcının bağlı olduğu işlem gören işletme | Bu işletmelere bağlı üyelik | Bizzat işlem giren ortak üyelik |
|---|---:|---:|---:|
| 7 gün | 6 | 9 | 2 |
| 30 gün | 11 | 16 | 6 |
| 90 gün | 13 | 18 | 8 |

Auth `last_sign_in_at` alanında 30 günde 14, 90 günde 19 üyelik görünür; 7 günde 0
görünür. Bu alan mobil oturum yenilemelerini her zaman doğru temsil etmeyebileceği
için tek başına “kullanıcı aktif değil” kanıtı sayılmadı. İşlem hareketi daha güçlü
işletme aktivite göstergesidir.

### Davetler

- pending toplam: 15;
- süresi dolmuş pending: 13;
- geçerli ve uygun işletmeye ait pending: **2**.

### Etki yorumu

- Bu tarihsel analizdeki sunucu sınırı değişiklikleri **19 aktif üyeliği**
  ilgilendiriyordu; 29 Temmuz güncel aggregate **24** aktif üyeliğe çıkmıştır.
- P0 açıklarının bazıları giriş yapabilen tüm kullanıcıları veya tüm işletmeleri
  etkilediği için gerçek etki 19'dan büyüktür.
- Personel kapalı **3 üyelik**, maaş/personel sızıntısı açısından en görünür
  negatif test grubudur.
- Raporlar açık ama Personel kapalı **2 üyelik**, rapor kaynak kesişimi açısından
  doğrudan canlı test grubudur.
- 30 günde bizzat işlem giren **6 üyelik**, yazma politikası geçişinde eski-client
  uyumluluğunun kritik olduğunu gösterir.

---

## 12. Canlı Supabase güvenlik fotoğrafı

### Migration durumu

İlk denetimde canlı geçmişte bulunmayan paketlerden P0-S4
`cleanup_audit_log_acl`, P0-S5 `notify_linked_users_worker_auth` ve C9
`add_urun_minimal_cari_labels_rpc` 29 Temmuz'da canlıya uygulandı. P0-S4 yalnız ACL
daraltır; P0-S5 dar bildirim trigger/Vault auth yolunu kurar; C9 yalnız yeni bir dar
okuma RPC'si ekler. Hiçbiri tablo/kolon/kullanıcı/işlem verisini silmedi veya yeniden
yazmadı.

Aynı gün aşağıdaki P0 paketleri de canlı geçmişe girdi:

| Paket | Canlı migration/deploy | Veri etkisi |
|---|---|---|
| P0-S2 create V2 | `20260729121123_create_islem_atomik_v2` | Yalnız yeni `create_islem_atomik_v2(uuid,jsonb)`; migration-time DML/backfill yok, eski create/increment/RLS yollarına dokunulmadı |
| P0-S3 | `20260729084545_harden_undo_import_batch_owner_guard` | Fonksiyon imzasını koruyan `CREATE OR REPLACE`; migration anında işlem satırı DML'i yok |
| P0-S9 | `20260729112129_harden_notlar_rls_actions_context` | Policy/trigger/dar RPC; mevcut 56 nota DML/backfill yok |
| P0-S10 phase-1 | `20260729112753_harden_public_statement_lifecycle` | İmza-korumalı iki RPC + validator + partial unique index/policy/ACL; mevcut link satırına DML yok |
| P0-S10 Edge | `cari-ekstre` v6, `verify_jwt=false`, deploy hash `13c287…` | Doğrudan tablo SELECT yerine service-role-only validator; DB satırı değiştirmez |
| P0-S10 phase-2 | `20260729113246_finalize_public_statement_service_role_acl` | Yalnız geçici `service_role` tablo SELECT grant'ini kaldırır |
| P0-S7 ilk dilim | `20260729182030_add_hesap_islem_satirlari_v1_rpc` | Yalnız yeni 18 alanlı salt-okunur RPC; tablo/policy/mevcut RPC/index ve kullanıcı işlemlerine DML/backfill yok |
| P0-S6B phase-1 | `20260729184053_harden_note_photo_storage_phase1` | 4 internal helper + 4 restrictive policy + 2 valid/ready partial index; top-level DML/backfill/kolon değişimi yok. 286 nesne/41 orphan aynı, mevcut nesne silinmedi |
| P0-S8 gelir kaynağı | `20260729194510_add_income_source_report_v2_permission_projection` | Yeni V2 + aynı 8 kolonlu V1 sarmalayıcısı; tablo/kolon/satır DML'i ve backfill yok |
| P0-S8 ürün raporu | `20260729201911_add_product_report_v2_permission_projection` | Yeni V2 + aynı 4 parametre/9 kolonlu V1 sarmalayıcısı; tablo/kolon/policy/index ve kullanıcı satırı DML'i/backfill yok |
| P0-S7 personel dilimi | `20260729204756_add_personel_projection_rpcs` | Yeni 14 alanlı personel işlem + üç alanlı izin kotası RPC'si; tablo/kolon/policy/index/mevcut RPC ve kullanıcı satırı DML'i/backfill yok |

P0-S3 rollback smoke'unda yalnız sentetik test satırları kullanılıp transaction geri
alındı. P0-S9 canonical not veri parmak izi
`8c0c8d4f8caea430cb971f36c502c29f` aynı sorgu/algoritma ile uygulama öncesi ve
sonrası değişmedi. P0-S10'un audit provenance değeri ile migration'ın katalog
parmak izleri farklı formül/nesnelere aittir; raporda birbirinin eşiti sayılmamıştır.
P0-S6A için DB migration uygulanmadı ve tespit edilen 41 orphan nesne silinmedi.
P0-S6B'deki pointer-NULL/DELETE-SELECT ve `INSERT ... RETURNING`/self-query
blocker'ları ayrı denemelerde tamamen rollback oldu. Delete helper'ın `(text,text)`
imzası ve gerçek policy satırından `owner_id` aktarımıyla ikinci açık kapatıldı;
üretim `REPEATABLE READ` katalog/veri rollback'i, gerçek runtime rollback'i
`P0_S6B_RUNTIME_ROLLBACK_OK` ve post-deploy aynı authenticated matris geçti.
`20260729184053` olarak uygulanan exact payload `24,168 byte`,
SHA-256 `0105024CA8F0CAA295852E616661D26EB3EEF8752F62B26282E90AE4C37EC053`
değerindedir. P0-S7 ise kota yeniden açıldıktan sonra geri alınan üretim matrisi
ve post-rollback yokluk kontrolünü geçti; `20260729182030` olarak canlı geçmişe
girdi. İki paketin fonksiyon katalog/ACL/hash ve authenticated gerçek çağrı
kontrolleri başarılıdır. Bu uygulamalar mevcut kullanıcı/işlem satırına DML yapmadı.

P0-S7 personel dilimi de aynı veri-koruyucu sırayı izledi. İki RPC önce üretimde
sentetik fixture'larla transaction içinde oluşturulup owner/P-only/P+H/own/all/cursor/
tenant/kota matrisi çalıştırıldı ve tamamen rollback edildi; sentineller sıfır kaldı.
Ardından `20260729204756` canlıya alındı ve aynı davranış matrisi ile gerçek
authenticated/anon rol kontrolleri tekrar geçti. Migration hiçbir tablo veya mevcut
fonksiyonu değiştirmedi; aktif kullanıcı trafiği sürerken oluşan yeni işlemler dışında
uygulama verisine yazmadı.

P0-S2 post-deploy katalog kontrolünde `create_islem_atomik_v2(uuid,jsonb)`
`SECURITY DEFINER`/`VOLATILE`, `search_path=''` ve yalnız `authenticated` EXECUTE
durumundadır; `anon` ile `service_role` kapalıdır. Canlı fonksiyon gövde hash'i
`718e5875f458a68b91196daa7c5253ab` olarak kaydedildi. Owner, K13 Cariler-only,
idempotent retry ve negatif yetki/payload/creator matrisi yalnız sentetik satırlarla
`BEGIN/ROLLBACK` içinde geçti; sözleşme testi 10/10 yeşildir. Bu katalog kaydından
sonraki istemci durumu da ilerlemiştir: yeni çalışma ağacında yalnız QTB'nin yeni
normal, viewer olmayan gelir/gider/transfer create'leri (normal ve çapraz-kur) ayrı
`useCreateIslemV2` hook'u ile V2'ye opt-in olur. Hedefli 8 suite/72 test ve son delta
sonrası tam TypeScript, ESLint, Jest ile Metro turu geçmiştir; telefon kabulü
beklenmektedir. Diğer create akışları, V2 update/delete, telemetri/minimum sürüm ve
legacy cutover açıktır. Bu istemci dilimi yeni migration veya mevcut veri DML'i
üretmemiştir.

P-B kanonik yetki altyapısı `20260729064915_pb_internal_yetki_altyapisi` olarak
canlıdır. Migration yalnız `internal` şeması, dört fonksiyon ve dar ACL ekledi:
**1 şema / 4 fonksiyon / 0 relation**. Tablo, kolon, kullanıcı, finansal işlem,
mevcut policy/RPC, DML veya backfill değiştirmedi. PostgreSQL 17'de per-schema
`ALTER DEFAULT PRIVILEGES ... REVOKE` global `PUBLIC EXECUTE` varsayılanını
kaldırmadığı gerçek rollback probe'unda görüldü; bu yanıltıcı kapı kaldırıldı.
Migration sonundaki schema-wide fonksiyon ACL süpürmesinden sonra yalnız
`internal.etkin_yetki(uuid,text)` `authenticated` rolüne açıldı; anon/service ve
üç yardımcı kapalıdır.

Canlıya geçmeden önce aynı SQL `BEGIN/ROLLBACK` içinde derlendi; tip allowlist'i,
kur/bakiye matematiği, NaN/sonsuz reddi, owner, aktif üye, çapraz tenant ve bilinmeyen
kullanıcı kapıları geçti. Bağımsız denetim **no apply blocker** verdi. Canlı son
kontrolde resolver davranışı tekrar geçti ve `internal` Data API profili
406/`PGRST106` ile dışa kapalı kaldı. Daha sonra P-D'nin iki dar public tüketicisi
canlıya alındı: `20260729071904` kategori seçim referansı için exact dört alanlı yeni
RPC ekledi; `20260729073717` creator-label RPC'sinin imzasını koruyup tip×kaynak AND
ve sahiplik görünürlüğünü uyguladı. Diğer P-C/P-D/P-F/P-I yüzeyleri hâlâ açıktır.

### SECURITY DEFINER envanteri

Canlı public şemada:

| Ölçüm | Sayı |
|---|---:|
| SECURITY DEFINER fonksiyon | 68 |
| anon execute edebiliyor | 25 |
| authenticated execute edebiliyor | 59 |

Bu sayıların tamamı otomatik olarak zafiyet demek değildir; her fonksiyonun gövde
authz'si ayrı incelenmelidir. İlk denetimde audit cleanup da özel olarak teyit
edilmişti; P0-S4 ACL daraltması sonrasında bu fonksiyonun API rolü açıklığı
kapanmıştır.

Security Advisor ayrıca:

- anon tarafından çalıştırılabilen SECURITY DEFINER fonksiyonları;
- authenticated tarafından çalıştırılabilen SECURITY DEFINER fonksiyonları;
- mutable `search_path`;
- RLS açık ama policy olmayan internal tablolar;
- sızmış parola korumasının kapalı olması

konularını raporluyor.

### Olumlu canlı bulgu

Public analitik view'lar: **17/17 `security_invoker=on`**.

---

## 13. RLS ve migration araştırmasından çıkan güvenli tasarım ilkeleri

Supabase/Postgres resmi yönlendirmesiyle uyumlu zorunlu ilkeler:

1. **RLS satır güvenliğidir, kolon güvenliği değildir.** Hassas kolonlar için
   projeksiyonlu view/RPC veya kolon privilege tasarımı gerekir.
2. Public şemadaki tablo/fonksiyonlar Data API yüzeyidir; “UI çağırmıyor” güvenlik
   gerekçesi değildir.
3. `SECURITY DEFINER` fonksiyonda sabit `search_path`, tam nitelikli nesne adları,
   çağıran/tenant/rol/modül/seviye kontrolü ve dar EXECUTE grant zorunludur.
4. Yardımcı SECURITY DEFINER fonksiyonlar anon/authenticated'a doğrudan açık
   bırakılmamalıdır.
5. View'lar ortak kullanıcı verisi gösterecekse `security_invoker=on` olmalıdır.
6. Storage ayrı policy motorudur; DB tablosu RLS'i Storage nesnesini otomatik korumaz.
7. RLS UPDATE için eski satıra `USING`, yeni duruma `WITH CHECK` birlikte
   düşünülmelidir.
8. Mevcut geniş **permissive** politikalar OR ile birleşebilir. Yalnız yeni bir policy
   eklemek eski geniş yolu otomatik kapatmaz; restrictive/permissive birleşimi canlı
   katalog snapshot'ına karşı tasarlanmalıdır.

Resmi referanslar:

- [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Securing your API](https://supabase.com/docs/guides/api/securing-your-api)
- [Database Functions](https://supabase.com/docs/guides/database/functions)
- [Column Level Security](https://supabase.com/docs/guides/database/postgres/column-level-security)
- [Storage Access Control](https://supabase.com/docs/guides/storage/security/access-control)
- [Advisor 0028 — anon SECURITY DEFINER](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable)
- [Advisor 0029 — authenticated SECURITY DEFINER](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)

---

## 14. Önerilen uygulama sırası

Bu bölüm implementasyon değildir; güvenli bağımlılık sırasıdır.

### Paket 0 — acil ayrıcalık kapatma

- [x] `undo_import_batch` owner/tenant guard + ACL —
  `20260729084545_harden_undo_import_batch_owner_guard` canlı ve geri-almalı smoke
  matrisi yeşil;
- [x] audit cleanup yalnız cron/admin — P0-S4 canlı;
- [x] dört ayrıcalıklı Edge Function'da servis-role/legacy kullanıcı sınırı — dört
  Function ve bildirim trigger/Vault migration'ı canlı doğrulandı;
- callable SECURITY DEFINER envanterini fonksiyon-bazlı sınıflandırma.

**Neden önce:** bunlar modül tasarımından bağımsız, daha geniş güvenlik açıklarıdır.

### Paket 1 — tek yetki çözücü ve sunucu normalizasyonu

- [x] P-B resolver canlı katalog snapshot'ına göre doğrulandı ve additive altyapı
  olarak uygulandı; dar kategori ve creator-label P-D tüketicileri bağlandı;
- [ ] Diğer policy/RPC/Storage tüketicilerini sürümlü paketlerle bağlama;
- owner/manager/operator/custom/legacy aynı kanonik sonuca çevrilir;
- eksik `level`, `notlar`, `birikim` için kontrollü geçiş kuralı;
- eski client'ın yeni alanları silmesini engelleyen merge/normalizasyon.

### Paket 2 — additive kolon projeksiyonlu okuma uçları

- [x] shared hesap detayı için tip×kaynak×own/all kapılı 18 alanlı RPC
  `20260729182030` olarak canlı; istemci geçişi yerelde hazır ve telefon kabulü
  bekliyor; export/ileri-tarihli yan yolları geçici owner-only kapalı;
- [x] shared personel detay/izin/rapor okumaları için tip×kaynak×own/all kapılı
  14+3 alanlı RPC paketi `20260729204756` olarak canlı; istemci geçişi yerelde hazır,
  eksik geçmiş bakiyeleri ve geniş export/ileri-tarihli/edit-copy yan yolları geçici
  owner-only;
- [ ] ürün hareketi, linked-cari ve kalan işlem yüzeyleri için izinli kolon view/RPC'leri;
- [x] cari detayında dar işlem satırı projeksiyonu;
- minimal cari ve minimal hesap referansı ayrı tip;
- sahiplik filtresi agregattan önce;
- 1.5.x etkilenmez; yeni çalışma ağacındaki shared hesap detayı dar RPC'ye geçer.

### Paket 3 — yazma sınırı

- [x] not yazmaları modül × bağlam × seviye × sahiplik kapısına ve UPDATE
  `WITH CHECK` sözleşmesine bağlandı (`20260729112129`);
- [x] mevcut uçlara dokunmayan additive V2 transaction create sunucuda canlı;
  `20260729121123_create_islem_atomik_v2` işlem etkisini yeniden hesaplar;
- [x] ilk dar istemci opt-in'i: QTB'deki yeni normal, viewer olmayan
  gelir/gider/transfer create'leri normal ve çapraz-kur dallarında ayrı
  `useCreateIslemV2` ile yerelde V2'ye taşındı; telefon kabulü bekliyor;
- [ ] viewer/linked-cari, ürün, taksit, ileri tarihli, dönüşüm, minimal-cari,
  cari/personel ve kalan create akışlarını kendi sözleşmeleriyle ayrı ayrı
  değerlendirme;
- [ ] kabul edilen yeni istemci yayılımını/telemetrisini izleme;
- [ ] yeni istemci/telemetri geçişinden sonra V2 update/delete;
- [ ] yalnız legacy kullanım yeterince düştükten sonra `increment_balance` doğrudan
  client yüzeyini ve geniş permissive işlem policy'lerini kapatma;
- kategori ve diğer doğrudan REST write yollarını aynı kapıda tutma.

Canlı 1.5.6 shared telemetrisi nedeniyle restrictive cutover bugün uygulanmamıştır.
Additive V2 create eski client davranışını değiştirmeden canlıya alınmış, ilk dar
istemci dilimi de yerelde tamamlanmıştır. Sıradaki güvenli adım bu dilimin telefon
kabulü ve yayılım gözlemidir. Legacy kapama için gerçek eski oturum testleri,
minimum-sürüm ve telemetri/yayılım kanıtı şarttır.

### Paket 4 — Storage ve bildirim sınırı

- [x] P0-S6A yeni istemcide işlem fotoğrafı copy-on-write ve güvenli yol doğrulaması;
- [x] P0-S6B kanonik upload + not fotoğrafı restrictive zarfı
  `20260729184053` olarak canlı; veri silmeyen 4 helper/4 policy/2 partial index
  paketi, 286 nesne ve 41 orphan'a dokunmadı;
- [x] P0-S6B PostgreSQL 15.18/17.10 fixture, bağımsız inceleme, üretim
  `REPEATABLE READ` katalog/veri + gerçek runtime rollback ve post-deploy aynı
  authenticated matris;
- [ ] dosya yolu işletme üyeliği kadar bağlı kayıt/modül/seviye ile eşleşir
  (işlem fotoğrafları için P0-S1 görünürlük kapısı sonrası);
- select/write/delete ayrı kurallar;
- notification payload açık modüllerden türetilir;
- izin daralınca signed URL/cache erişimi kesilir.

Mevcut 41 orphan nesne otomatik silinmemiştir; cleanup ayrı dry-run/retention paketi
olmadan bu pakete dâhil edilmez.

### Paket 5 — rapor/public link/audit history

- rapor RPC'leri `R AND tüm kaynak modüller`;
- [x] public link Cariler + güncel üretici izni + shared 1/7/30 veya owner
  1/7/30/365;
- [x] yeni süresiz bağlantı kaldırıldı; Edge validator ve doğrudan tablo ACL kapanışı
  canlı;
- İşlem Geçmişi owner + manager olarak additive açılır.

### Paket 6 — yeni client geçişi

- istemci projection uçlarına geçirilir;
- P0 istemci guard ve mutation sorunları kapatılır;
- izin daralmasında disk+memory cache temizliği tek normalizasyona bağlanır.

### Paket 7 — minimum sürüm ve temel tablo daraltması

Yeni client yeterince yayıldıktan sonra:

- eski geniş temel tablo SELECT yolları daraltılır;
- legacy izin fallback'i kontrollü biçimde kaldırılır;
- kullanılmayan eski RPC execute hakları kapatılır.

Temel tablo okumasını Paket 2/6'dan önce daraltmak eski sürümlerde boş ekran veya hata
üretir; bu sıra pazarlık dışıdır.

---

## 15. Eski client etkisi

| Değişiklik | Eski client etkisi | Güvenli yaklaşım |
|---|---|---|
| Acil RPC/Edge authz | Yetkisiz çağrı reddedilir; normal owner akışı korunmalı | Önce fonksiyon-bazlı pozitif test |
| Restrictive write | Bazı eski ortak yazmaları 42501 alabilir | Eski rol/level fixture'larıyla test, anlaşılır hata |
| Projection uçları ekleme | Yok | Additive |
| Client'ı projection'a taşıma | Yalnız yeni client | Telemetri ve geri dönüş |
| P0-S2 ilk QTB V2 opt-in'i | Yalnız yeni client'taki yeni normal, viewer olmayan gelir/gider/transfer create'leri V2 kullanır; 1.5.x V1'de kalır | Stable UUID, exact payload, V2→V1 fallback yasağı, telefon kabulü ve telemetri |
| Temel tablo SELECT daraltma | Eski client boş/hata görebilir | Minimum sürümden sonra |
| K9 backfill/normalizasyon | Eski owner yeni alanı düşürebilir | Server-side merge ve ayrı veri-yazma onayı |
| Storage daraltma | Eski client yetkisiz fotoğrafta 403 görür | Önce modül/payload uyumlu client |
| İşlem Geçmişi manager açma | Eski manager menüyü görmez; güvenlik sorunu değil | Additive RLS, yeni client UI |

“1.5.x kullanan eski client ne yaşar?” sorusunun yazılı cevabı her migration paketinde
yeniden verilmelidir.

---

## 16. Zorunlu test matrisi

Her profil aşağıdaki **11 yüzeyde** hem pozitif hem negatif sınanmalıdır:

1. UI görünürlüğü
2. Deep-link
3. REST okuma (`select=*` dahil)
4. REST yazma
5. RPC
6. Storage
7. Edge Function
8. Excel/PDF export
9. Public link
10. Bildirim
11. Bellek + disk cache

### Profil seti

- owner;
- manager;
- operator;
- custom: H, C, U, P, R, N tek tek;
- 15 ikili kombinasyon;
- hiçbiri;
- her kombinasyonda `view`, `add`, `edit_own`, `edit_all`;
- `can_see_all_users_data=false`;
- legacy manager/operator/purchaser ve eksik level;
- pasif üyelik;
- A ve B olmak üzere iki ayrı işletme/kiracı.

### Pazarlık dışı örnek testler

- C+U `view`: export ve 1/7/30 link başarılı; hiçbir yazma yok.
- C+U `view`: hesap bakiyesi, rapor, personel maaşı; REST/RPC/Storage/Edge dahil sıfır.
- H-only: personel ödeme satırı hesap ekstresinde bile sıfır.
- P-only: maaş görünür, hesap ödeme satırı sıfır.
- R+P, H kapalı: hesap kaynaklı tutar sıfır.
- N-only: serbest not görünür; personel notu sıfır.
- `edit_own`: başka kullanıcının kaydı REST/RPC ile de değişmez.
- owner ve manager İşlem Geçmişi görür; operator/custom doğrudan URL ile dahi görmez.
- izin açıkken veri yüklenir, sonra izin kapatılır: yeniden başlatmadan UI, query cache,
  disk cache, export ve signed URL'de veri kalmaz.

Tek bir yüzeyde sızıntı tüm senaryoyu başarısız saymalıdır.

---

## 17. Önceki belgelerin güncellik değerlendirmesi

### `docs/security/YETKI-SOZLESMESI.md`

Bugünkü en güçlü ürün sözleşmesidir ve deny-by-default, AND kesişimi, K13, export/public
link ve 11 yüzey test modelini doğru kurar.

Güncellenmesi gerekenler:

- İşlem Geçmişi owner + manager kararı eklenmeli;
- uygulama fotoğrafındaki “istemci tamamlandı” ifadesi; yerelde kapanan
  C1/C2/C5/C6/C7/C8/C9/C10 istemci tarafı, canlı kapanan C12/P0-S10 ve server
  kapanışı açık C3/C4/C11 ayrımıyla telefon kabul durumu kullanılarak daraltılmalı;
- üretim kullanıcı sayıları canlı ölçümle yenilenmeli;
- P-B altyapısının canlı olduğu; dar kategori ve creator-label P-D tüketicilerinin
  devreye alındığı, diğer P-C/P-D/P-F/P-I yüzeylerinin açık kaldığı yazılmalı.

### `docs/YETKI-DENETIMI-SATINALMACI.md`

Tarihsel kök nedenler hâlâ değerlidir; özellikle tip-körü `islemler` RLS'i bugün de
canlıdır. Ancak eski “CORE_MODULES zorla açık” ve UI bulgularının bir kısmı yeni
istemci savunmalarıyla değişmiştir. Kör uygulanmamalıdır.

### `docs/YETKI-DENETIMI-RAPOR.md`

26 eski bulgunun önemli kısmı bugünkü sözleşmeye dönüşmüştür. Bazı UI bulguları
kapandı; `undo_import_batch` ve public ekstre yaşam döngüsü canlıda kapatıldı.
`increment_balance`, temel işlem tipi-körlüğü ve işlem fotoğrafının P0-S1'e bağlı
nihai Storage sınırı güncel kod/canlı katalogda açık kalır. P0-S6A istemci fotoğraf
yaşam döngüsünü, canlı P0-S6B ise kanonik upload + not fotoğrafı zarfını
tamamlamıştır.

Bu rapor söz konusu iki tarihsel belgeyi silmez; “hangi bulgu hâlâ canlı?” ayrımını
güncel commit ve canlı katalog üzerinden yapar.

---

## 18. Nihai sınıflandırma — 29 Temmuz tarihsel fotoğraf

> Bu bölüm, v4 final sunucu kapanışından önceki denetim sonucudur. Açık/kapalı paket,
> owner/manager ve yayın kararı için raporun en üstündeki 30 Temmuz canlı kapanış
> kaydı yetkilidir.

| Alan | Durum |
|---|---|
| Ürün kararları / sözleşme | Büyük ölçüde net |
| İstemci navigation ve görünürlük | C1/C2/C5/C6/C9/C10/C12 yerelde kapandı; C9 sunucu ucu ve P0-S10 public-link sınırı canlı; kategori dar server ucu canlı fakat picker geçişi açık. C3'ün cari, hesap ve personel sunucu/istemci dilimleri hazır; hesap/personel cihaz kabulü bekliyor. Linked-cari/kalan yüzeyler ve C11 açık |
| İstemci mutation fail-closed | C4-A transaction create/update/delete ve direct ürün preflight'ları yerelde kapalı. Server-authoritative additive V2 create canlı; ilk istemci dilimi QTB'deki yeni normal, viewer olmayan gelir/gider/transfer için yerelde tamamlandı ve telefon kabulü bekliyor. Diğer create akışları, iki-aşamalı stok/reapply ve V2 update/delete açık |
| İşlem türü/modül kesişimi | P-B resolver, creator-label projeksiyonu ve server-authoritative V2 create canlı; ilk dar QTB opt-in'i yerelde hazır. Temel işlem okuma/yazma RLS'i ile legacy update/delete/increment yüzeyi eksik. 1.5.6 shared telemetrisi nedeniyle restrictive cutover ertelendi; sıradaki güvenli iş telefon kabulü + yayılım/telemetri, ardından kalan create akışlarının ayrı geçişidir |
| Rapor kaynak kesişimi | Kısmi: dashboard guard cihazda kabul edildi; gelir-kaynağı `20260729194510` ve ürün alış/satış `20260729201911` V2 + V1 güvenli sarmalayıcıları canlı, yeni istemci tüketimleri yerelde hazır. Kalan rapor/özet uçları ile dar detay/export projeksiyonları açık |
| Kolon projeksiyonu | Minimal hesap, ürün-cari, kategori seçimi ve creator-label uçları canlı; cari işlem detayı dar uçta. Shared hesap 18 alanlı, personel işlem/izin 14+3 alanlı sunucu projeksiyonları canlı; client geçişleri telefon kabulü bekliyor. Ürün hareketi/linked-cari/kalan temel SELECT ve dar export/ileri-tarihli yüzeyleri eksik |
| Storage yetkilendirmesi | P0-S6A istemci copy-on-write hazır. P0-S6B kanonik upload + not fotoğrafı zarfı `20260729184053` ile canlı; iki blocker tamamen rollback edildi, düzeltilmiş üretim/runtime rollback ve post-deploy authenticated matris geçti. İşlem fotoğrafının nihai tip/modül sınırı P0-S1'e bağlı. 286 nesne/41 orphan aynı, mevcut nesne silinmedi |
| Edge Function authz | P0-S5 dört Function + trigger/Vault yolu canlı; cron/gerçek bildirim operasyonel smoke'u bekliyor |
| Public ekstre yaşam döngüsü | Tamamlandı/canlı: shared 1/7/30, owner 1/7/30/365; creator güncel Cariler kontrolü; Edge v6 validator; direct service-role tablo SELECT kapalı |
| İşlem Geçmişi owner+manager | Manager için eksik |
| Legacy izin normalizasyonu | C7/C8 istemci tarafı yerelde, P-B read resolver altyapısı canlı; yazma/merge normalizasyonu ve telefon geçişi bekliyor |
| Gerçek iki-kiracılı test | P-B resolver owner/aktif üye/cross-tenant canlı smoke'u, P0-S2 owner/K13/negatif rollback fixture'ı, P0-S8 gelir-kaynağı/ürün raporu ve P0-S7 personel owner/P-only/P+H/own/all/cross-tenant post-deploy matrisleri geçti; gerçek cihazlı tam uygulama yüzey matrisi yapılmadı |
| Üretim migration'ları | S-11, S-12b/S-12c/S-12d, P0-S2 create V2, P0-S3, P0-S4, P0-S5, P0-S6B phase-1, P0-S7 hesap + personel dilimleri, P0-S8 gelir-kaynağı + ürün raporu dilimleri, P0-S9, P0-S10 phase-1/phase-2, C9, P-B ve dar kategori referansı canlı. P0-S2 ilk istemci dilimi, P0-S7 personel istemcisi ve P0-S8 yeni istemci tüketimleri yerelde hazır; P0-S1, P0-S2 kalan create akışları/update/delete/telemetri/minimum-sürüm/legacy cutover, P0-S7 kalan SELECT/export/ileri-tarihli yüzeyleri ve kalan P0-S8 rapor uçları açık |

### Son karar — tarihsel

> **Yetki paylaşımı bugün “UI'da çoğunlukla doğru görünen”, fakat bütün sunucu
> sınırlarında aynı sözleşmeyi zorlamayan bir durumdadır.**

Personel kapalıysa maaşın, Raporlar kapalıysa raporun hiçbir yüzeyden çıkmaması
garantisi henüz verilemez. Bu garanti ancak RLS + RPC + projection + Storage + Edge +
export/public link + notification + cache testleri birlikte geçtiğinde verilebilir.

Bu rapor tek başına implementasyon onayı değildir. Kullanıcı 28 Temmuz'da adımların
sırayla uygulanmasını ve veri/kolon silmeyen additive migration'ların 27 Temmuz
yedeğiyle ilerlemesini onaylamıştır. Her paket yine güncel kod/canlı katalog teyidi,
eski-client etki açıklaması ve veri-koruma kontrolüyle ele alınır; yıkıcı değişiklik
ayrıca yeni onay + güncel tam yedek gerektirir.
