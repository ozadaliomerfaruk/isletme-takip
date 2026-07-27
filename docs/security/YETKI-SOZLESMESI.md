# YETKİ SÖZLEŞMESİ — v3

**Durum (28 Temmuz 2026):** Ürün kararları onaylandı; istemci savunma katmanı
uygulandı ve yerel kontrollerden geçti. Sunucu güvenlik sınırı henüz tamamlanmadı.
**İlk taslak tarihi:** 26 Temmuz 2026 · **Baz commit:** `5f04873`

> **YAYIN BLOKAJI:** Aşağıdaki istemci değişiklikleri tek başına güvenlik tamamlandı
> anlamına gelmez. RLS/RPC/Storage/Edge ve kolon projeksiyonu paketleri
> uygulanıp negatif test matrisi geçmeden kısıtlı kullanıcı modeli üretime hazır
> sayılamaz. Bu oturumda üretime bağlanılmadı ve migration uygulanmadı.

### Uygulama fotoğrafı — 28 Temmuz 2026

İstemcide tamamlanan savunma-derinliği:

- görünür altı toggle'dan deny-by-default etkin modül türetimi;
- sekme, ana sayfa, Daha, arama, arşiv ve deep-link route kapıları;
- kapalı modülde sorgunun `enabled` ve `queryFn` katmanlarında durması
  (programatik `refetch()` dahil);
- rapor RPC/query ve export çağrılarında doğrudan izin kapısı;
- pasif kayıtların owner/manager dışına kapatılması;
- izin daralınca ilgili bellek ve disk React Query cache'lerinin iptali/silinmesi;
- bağlamsal notların Notlar kapalıyken salt-okunur kalması; not yazma
  mutation'larının seviye, sahiplik, işletme ve hedef-modül kapılarıyla durması;
- Cariler + Ürünler örneğinde hesap bakiyesi/personel/rapor/serbest-not verisinin
  ekranda, aramada veya ürün hareketi ilişkilerinde açılmaması (izinli kayda bağlı
  bağlamsal notlar K5 gereği yalnız-okunur kalır).

Sunucuda tamamlanmadan **güvenli sayılmayacak** kalemler:

- `islemler` için modül × işlem-tipi RLS matrisi ve kolon-projeksiyonlu uçlar;
- bağlamsal not / serbest not ayrımının RLS'te uygulanması;
- rapor RPC'lerinde açık kaynak modüllerinin kesişimi;
- Storage nesnesini bağlı kayıt/modüle bağlayan politikalar;
- SECURITY DEFINER RPC, Edge Function, public ekstre, bildirim ve export negatifleri;
- eski istemcinin izin JSON'unu eksiltmesini önleyen sunucu normalizasyonu/backfill;
- §5 test matrisinin gerçek iki-kiracılı oturumlarla REST/RPC/Storage üzerinde geçmesi.

---

## 0. TEMEL KURAL — DENY BY DEFAULT

> **Kapalı bir modül; UI, deep-link, REST, RPC, export, public link veya dolaylı
> toplam (aggregate) üzerinden HİÇBİR veri sızdırmaz.**

Bundan türeyen dört alt kural:

1. **Bir modülün açılması başka modülü açmaz.** Cariler açmak İşlemler'i, Ürünler açmak
   Personel'i açmaz.
2. **Yetki seviyesi (görebilir/ekleyebilir/düzenleyebilir) yalnız AÇIK modüllerde geçerlidir.**
   Kapalı modülde seviye anlamsızdır.
3. **UI'da gizlemek yeterli DEĞİLDİR.** Güvenlik sınırı **sunucu katmanlarının tamamıdır**:
   **RLS + RPC guard'ları + Storage politikaları + Edge Function kontrolleri.**
   *(v2 düzeltmesi: v1'de "tek gerçek savunma katmanı veritabanıdır" yazıyordu — yanlış.
   Storage kendi politika motorunu kullanıyor ve service-role ile çalışan Edge
   Function'lar RLS'i **hiç görmüyor**; ikisi de veritabanı RLS'inin dışında.)*
   İstemci yalnız savunma derinliğidir, sınır değildir.
4. **Eski client aynı sunucu kurallarına tabidir.** Mağazadaki eski sürüm, yeni kısıtı
   baypas edemez.

---

## 1. GÖRÜNÜR TOGGLE'LAR (izin ekranında gösterilen)

`PermissionEditor` şu anda **altı** toggle gösteriyor:
Hesaplar (+Birikim alt seçeneği) · Cariler · Ürünler/Stok · Personel · Raporlar · Notlar

`ALL_MODULES` içinde ayrıca `arsiv` var ama editörde gösterilmiyor — **K8 ile çözüldü:**
arsiv ayrı toggle olmayacak, açık modüllerin arşivinden türeyecek (bkz. §3.5).

### 1.0 `view` seviyesi ve okuma verisinin dağıtımı

`view`, açık modüldeki kayıtları yalnız ekranda okumakla sınırlı değildir:

- Açık modülün mevcut Excel/PDF dışa aktarımı kullanılabilir.
- **Cariler** açıksa public cari ekstresi bağlantısı oluşturulabilir ve iptal edilebilir.
- Ortak kullanıcı public bağlantıyı yalnız **1 / 7 / 30 gün** için oluşturabilir.
- Bu dağıtım yetkileri **ekleme, düzenleme veya silme yetkisi vermez**.
- Export ve public link yalnız kullanıcının zaten görmeye yetkili olduğu satır/alanlardan
  beslenir; kapalı modül sorgusu/RPC'si başlamadan reddedilir.

`generate_cari_share_code` gibi başka işletmeye kalıcı ilişki kuran meta-paylaşım
RPC'leri bu sınıfa girmez; public cari ekstresi salt-okunur ve süreli bir dağıtım
yüzeyidir.

---

### 1.1 CARİLER

| | |
|---|---|
| **Açıkken görülebilecek ekranlar** | `(tabs)/cariler` · `cariler/[id]` · `cariler/ekle` · `cariler/duzenle/[id]` · `mutabakat/[cariId]` *(bkz. istisna)* |
| **Tablolar / alanlar** | `cariler` (tümü) · `cari_links` (paylaşım rozeti) · `islemler` **yalnız o carinin satırları** (`cari_id = <o cari>`) |
| **Görülebilecek işlem tipleri** | **Altı tipin hepsi Cariler ile görünür** *(v3/K13)*: `cari_alis` · `cari_satis` · `cari_alis_iade` · `cari_satis_iade` · `cari_odeme` · `cari_tahsilat`. Son ikisinde Hesaplar kapalıysa hesap bilgisi **minimal** (yalnız ad).<br>**Nerede görünür — K10:** hem **cari detayında** hem **Tüm İşlemler ekranında** (orada yalnız bu tipler süzülü olarak). *(v1'de "yalnız cari detayı bağlamında" yazıyordu; K10 sonraki karardır ve onu geçersiz kılar.)* |
| **RPC'ler** | `get_cari_ozet` · `get_cari_islem_kalan` · `get_cari_vade_detay` · `get_cari_vade_rozet` · `get_cari_taksit_kalan` · `create_islem_atomik` / `update_islem_atomik` / `delete_islem_atomik` *(yalnız cari tipleri, seviye izin veriyorsa)* · `generate_cari_share_code` / `accept_cari_share_code` / `remove_cari_link` |
| **Export / paylaşım** | Cari listesi Excel/PDF · cari ekstresi PDF/Excel · **public web linki de dahil (K7)**. Bunların tamamı `view` seviyesinde kullanılabilir; süre ve iptal kuralları **K12**'de (ortak en fazla 30 gün, süresiz seçenek yok). |
| **Çapraz-modül istisnaları** | ① İşlem satırında **hesap adı GÖRÜNMEZ** (Hesaplar kapalıysa). ② **K13 (v3) — ÇÖZÜLDÜ:** Hesaplar kapalıyken de cari ödeme/tahsilat **girilebilir**. Seviye `add` veya üstüyse QTB **minimal hesap seçici** açar (yalnız id/ad/para birimi, aktif+arşivlenmemiş; birikim hariç). Bakiye dönmez, genel hesap yetkisi açılmaz. *(v2'de "bu tipler kullanılamaz" yazıyordu — o kısıt kaldırıldı.)* ③ Mutabakat yalnız cari işlemleri okur → Cariler'e bağlıdır. ④ **K3:** cari borç/alacak özeti görünür, ama ⋮ menüsünde **Rapor girişi çizilmez**. ⑤ **K5:** o cariye bağlı **notlar görünür** (Notlar modülü kapalı olsa bile); genel Notlar ekranına giriş **yoktur**. |
| **KAPALIYKEN kesinlikle görünmeyecek** | Cari adı, bakiyesi, telefon/adres · cari işlemleri · cari vade/taksit rozetleri · cari ekstresi · Cariler sekmesi · cari mini-dashboard · global aramada cari sonucu · ürün hareketinde cari adı *(bkz. Ürünler istisnası)* |
| **Seviyeler** | **Görebilir:** liste + detay + ekstre görüntüleme + Excel/PDF dışa aktarım + public ekstre bağlantısı. **Ekleyebilir:** + cari ekleme, cari işlemi girme. **Düzenleyebilir/Silebilir:** + düzenle/sil (`edit_own` yalnız kendi eklediği). |
| **Eski client** | Cariler kapalı bir kullanıcıda eski client cari listesini boş görür (RLS zaten `modules.cariler` istiyor). Yeni kısıt: cari-dışı işlem tipleri de listeden düşecek → eski client'ta boş liste, crash değil (`Array.isArray` guard'ları mevcut). |

---

### 1.2 ÜRÜNLER / STOK

| | |
|---|---|
| **Açıkken görülebilecek ekranlar** | `urunler` · `urunler/[id]` (+ ekle/düzenle alt yolları) |
| **Tablolar / alanlar** | `urunler` (tümü) · `urun_hareketler` (tümü) · `islemler` **yalnız ürün hareketi olan satırlar**, ve o satırlardan yalnız ürün bağlamı için gereken alanlar |
| **Görülebilecek işlem tipleri** | Ürün hareketi bağlı olanlar: `cari_alis` · `cari_satis` · iadeleri · stok giriş/çıkış |
| **RPC'ler** | `get_urun_ozet` · `update_urun_miktar` · `set_urun_miktar_hedef` · `reapply_urun_hareketler_for_islem` · `create_islem_with_urun_atomik` *(seviye izin veriyorsa)* |
| **Export / paylaşım** | Ürün listesi Excel/PDF · ürün hareket dökümü |
| **Çapraz-modül istisnaları** | ✅ **KULLANICI KARARI:** ürün hareketine bağlı cari için **minimal cari bilgisi** (yalnız **ad**) görülebilir — "kime sattık" sorusu ürün detayından cevaplanabilmeli. **Bu Cari modülünü AÇMAZ:** cari bakiyesi, telefonu, diğer işlemleri, ekstresi görünmez; cari detayına **navigasyon yoktur**. ② Personel kapalıysa ürün hareketindeki **personel rozeti görünmez**. ③ Hesaplar kapalıysa **hesap rozeti görünmez**. ④ **K4:** ürün özet kartları (kâr/ciro) görünür; genel rapor ekranlarına **giriş noktası çizilmez**. ⑤ **K5:** o ürüne bağlı notlar görünür; genel Notlar ekranına giriş yoktur. |
| **KAPALIYKEN kesinlikle görünmeyecek** | Ürün adı/stok/fiyat · ürün hareketleri · Ürünler sekmesi · ürün kâr/ciro özetleri · alış-satış raporu · global aramada ürün sonucu · `get_urun_ozet` sonucu |
| **Seviyeler** | **Görebilir:** liste + detay + hareketler. **Ekleyebilir:** + ürün ekleme, stok girişi. **Düzenleyebilir/Silebilir:** + düzenle/sil. |
| **Eski client** | Ürünler kapalıyken liste zaten boş (RLS `modules.urunler`). Yeni kısıt: ürün detayındaki personel/hesap rozetleri düşecek → boş rozet, crash değil. |

---

### 1.3 NOTLAR

> **K5 — NOT GÖRÜNÜRLÜĞÜ İKİ EKSENLİDİR.** Bu modül yalnız **ikinci** ekseni yönetir.
>
> | Eksen | Neye bağlı | Örnek |
> |---|---|---|
> | **Bağlamsal not** | Bağlı olduğu kaydın modülüne | Cariler açık → o carinin notu cari detayında **görünür** (Notlar kapalı olsa bile) |
> | **Genel Notlar ekranı** | `notlar` modülüne | Notlar kapalı → `notlar` sekmesi/ekranı **yok**, hiçbir nota toplu erişim yok |
>
> **UYGULAMA BİÇİMİ — v2'de DÜZELTİLDİ.** v1'de `notlar.cari_id` / `notlar.urun_id`
> yazmıştım; **böyle kolonlar YOK** (canlı şemadan doğrulandı). Gerçek kolonlar:
>
> | Kolon | Anlamı |
> |---|---|
> | `entity_type` (NOT NULL) | notun bağlandığı varlık türü |
> | `entity_id` | o varlığın kimliği (boş olabilir → serbest not) |
> | `assigned_to_cari` | sonradan bir cariye **atanmış** not |
> | `assigned_to_personel` | sonradan bir personele **atanmış** not |
> | `assigned_to_user` | bir kullanıcıya atanmış not |
>
> **Bağlamsal sayılma kuralı:** bir not, `entity_type`/`entity_id` **ya da**
> `assigned_to_cari` / `assigned_to_personel` üzerinden bir varlığa bağlıysa
> bağlamsaldır ve o varlığın modülüyle okunur. Hiçbirine bağlı değilse **serbest
> nottur** ve yalnız `notlar` modülüyle okunur.
>
> ⚠️ `assigned_to_*` **sonradan** atanabiliyor (`useNotlar.ts:81`) — yani serbest bir
> not sonradan bağlamsal hâle gelebilir. Görünürlük **anlık duruma** göre hesaplanır.
>
> ### K5-M — BAĞLAMSAL NOTTA YAZMA KURALI *(v2'de eklendi)*
>
> **Notlar modülü kapalıyken bağlamsal not YALNIZ OKUNUR.** Ekleme, düzenleme ve
> silme `notlar` modülü ister.
>
> **Gerekçe:** aksi hâlde Cariler açmak, dolaylı olarak **not yazma yetkisi** de
> açardı. Bir modülün açılması başka modülün yazma hakkını açmamalıdır (Temel Kural 1).
>
> | Notlar | Cariler | Cari detayındaki not |
> |---|---|---|
> | kapalı | açık | **okur**, yazamaz/silemez |
> | açık | açık | okur + yazar + siler *(seviyeye göre)* |
> | açık | kapalı | cari notunu görmez *(cari yetkisi yok)*; serbest notları görür |

| | |
|---|---|
| **Açıkken görülebilecek ekranlar** | `notlar` (genel liste + ekleme/düzenleme modalı) |
| **Tablolar / alanlar** | `notlar` — **tümü DEĞİL** *(v2 düzeltmesi)*. Görülebilen küme: **serbest notlar** (hiçbir varlığa bağlı olmayanlar) **+** kullanıcının **açık modüllerine** bağlı notlar. Kapalı bir modüle bağlı not **hiç görünmez** — yalnız varlık adı değil, **notun tamamı** (içerik, fotoğraf, hatırlatma dahil). |
| **Görülebilecek işlem tipleri** | **HİÇBİRİ.** ⚠️ Ama "not finansal veri içermez" **garantisi verilemez** *(v2)*: not metni serbesttir, kullanıcı içine maaş/borç/hesap bilgisi yazabilir ve fotoğraf ekleyebilir. Doğru ifade: **Notlar modülü yapılandırılmış finansal tablo/RPC verisi AÇMAZ; ama not metni ve ekleri hassas bilgi içerebilir.** |
| **RPC'ler** | **HİÇBİRİ** (notlar düz tablo erişimi) |
| **Export / paylaşım** | **YOK** (bugün de yok) |
| **Çapraz-modül istisnaları** | ① **K5:** cariye/ürüne bağlı not, o modülün yetkisiyle görünür — Notlar modülü **gerekmez** (yalnız okuma; bkz. K5-M). ② Not bir **personele** atanabiliyor; Personel kapalıysa "Personele ata" seçeneği **hiç görünmez** (bugün boş liste açılıyor). ③ Cariler kapalı + Notlar açık → serbest notlar görünür; **cariye bağlı not hiç görünmez** *(v1'de "cari adı görünmez" yazıyordu — yanlıştı, notun tamamı gizlenir)*. ④ **`assigned_to_user`** *(v2, formül netleştirildi)*: **atama modül kapısını ASLA baypas etmez.** Yalnız **zaten yetkili** kullanıcılar arasında hedef kitleyi **daraltır**. Formül: `görünür ⟺ (modül/bağlam izni var) AND (atama yoksa VEYA atanan kişi benim)`. Yani Personel kapalı bir ortağa personel notu atansa bile **görmez**; atama ona yetki vermez. ⑤ **Yazma reddi** *(v2)*: kapalı bir modüle bağlı not **oluşturma/güncelleme** girişimi REST/RPC katmanında **reddedilir** — istemcide seçici gizlemek yeterli değildir. |
| **KAPALIYKEN kesinlikle görünmeyecek** | **Genel Notlar ekranı ve sekmesi** · serbest (bağlamsız) notlar · hatırlatmalar · not fotoğraflarına toplu erişim. *(Açık bir modüle bağlı notlar bu kısıttan muaftır — K5.)* |
| **Seviyeler** | **Görebilir:** notları okur. **Ekleyebilir:** + not ekler. **Düzenleyebilir/Silebilir:** + düzenler/siler. |
| **Eski client** | **K9 uygulanır:** önce mevcut kayıtlara `notlar: true` açıkça yazılır (kimse erişim kaybetmez), sonra `DEFAULT_TRUE_MODULES` boşaltılır → bayrak yoksa kapalı. ⚠️ **"Eski client hissetmez" GARANTİSİ YOKTUR** *(v2 düzeltmesi — R5 ile çelişiyordu)*: eski owner istemcisi izin JSON'unu yeniden kaydederken yeni alanları **düşürebilir** ve kullanıcı sessizce fallback'e döner. Sunucuda merge/normalizasyon şart. |

---

### 1.4 HESAPLAR (+ Birikim alt seçeneği)

| | |
|---|---|
| **Açıkken görülebilecek ekranlar** | Ana Sayfa hesap bölümü · `hesaplar/[id]` · `hesaplar/ekle` · `hesaplar/duzenle/[id]` · Günlük Kasa modalı |
| **Tablolar / alanlar** | `hesaplar` (tümü; `birikim` alt seçeneği kapalıysa `type='birikim'` satırları hariç) · `islemler` **yalnız hesap bacağı olanlar** |
| **Görülebilecek işlem tipleri** | `gelir` · `gider` · `transfer` — **Hesaplar tek başına yeter**.<br>`cari_odeme` · `cari_tahsilat` → **yalnız Cariler de açıksa**.<br>`personel_odeme` · `personel_tahsilat` → **yalnız Personel de açıksa**.<br>⚠️ **v2 DÜZELTMESİ:** v1'de bu iki çift koşulsuz "görünür" yazıyordu; §2.1'in VE kuralıyla çelişiyordu. **Personel kapalıysa hesap detayında da o satır HİÇ görünmez** — yalnız adı gizlenmez, **satırın tamamı** gizlenir (tutar/tarih/açıklama dahil). |
| **RPC'ler** | `get_account_report` *(Raporlar da açıksa)* · `increment_balance` *(yalnız izin verilen tablo+tenant)* |
| **Export / paylaşım** | Hesap ekstresi PDF/Excel |
| **Çapraz-modül istisnaları** | ① **Karşı taraf modülü kapalıysa SATIRIN TAMAMI gizlenir** — yalnız ad değil, tutar ve tarih de. *(v2 düzeltmesi: v1'de "ad gizlenir, tutar/tarih kalır" yazıyordu; §2.1'in VE kuralıyla ve hemen üstteki satırla çelişiyordu.)* Yani Personel kapalıysa hesap ekstresinde personel ödemesi **hiç yer almaz**; Cariler kapalıysa cari tahsilatı **hiç yer almaz**. **Sonuç kabul ediliyor:** hesap ekstresinin toplamı, o hesabın gerçek bakiye hareketinden **eksik** görünebilir. ② **K2:** hesap **bakiyeleri** Raporlar kapalıyken de görünür — bakiye hesap verisidir. ③ Nakit akışı **Raporlar'a** aittir: Hesaplar açık + Raporlar kapalı → **nakit akışı kartı ve ekranı görünmez**, ama hesap listesi ve bakiyeler görünür. |
| **KAPALIYKEN kesinlikle görünmeyecek** | Hesap adı · **bakiye** · transferler · günlük kasa · Ana Sayfa hesap bölümü ve boş-durum düğmesi · hesap seçicileri (QTB dahil) · global aramada hesap sonucu |
| **Seviyeler** | **Görebilir:** hesap listesi + bakiye + hareketler. **Ekleyebilir:** + hesap ekleme, hesap hareketi girme. **Düzenleyebilir/Silebilir:** + düzenle/sil. |
| **Eski client** | Hesaplar kapalıyken RLS zaten boş döndürüyor. Yeni kısıt: `transfer` tipi işlemler listeden düşecek. |

---

### 1.5 PERSONEL

| | |
|---|---|
| **Açıkken görülebilecek ekranlar** | `(tabs)/personel` · `personel/[id]` · `personel/ekle` · `personel/duzenle/[id]` · `personel/izin-gecmisi/[id]` · `personel/toplu-odeme` · `personel/toplu-gider` |
| **Tablolar / alanlar** | `personel` (tümü) · `personel_izin_*` · `islemler` **yalnız `personel_id` dolu satırlar** |
| **Görülebilecek işlem tipleri** | `personel_gider` · `personel_satis` · `personel_izin_hakki` · `personel_izin_kullanimi` — **Personel tek başına yeter**.<br>`personel_odeme` · `personel_tahsilat` → **yalnız Hesaplar da açıksa** *(v2 düzeltmesi: v1'de bu ikisi Personel tek başınayken de görünür sayılıyordu, §2.1'in VE kuralıyla çelişiyordu)*. |
| **RPC'ler** | `get_personel_ozet` |
| **Export / paylaşım** | Personel listesi Excel/PDF · personel ekstresi |
| **Çapraz-modül istisnaları** | ① **Hesaplar kapalıysa `personel_odeme`/`personel_tahsilat` SATIRLARI HİÇ GÖRÜNMEZ** — yalnız hesap adı gizlenmez, satırın tamamı gizlenir *(v2 düzeltmesi)*. **Sonuç kabul ediliyor:** personel ekstresi yalnız tahakkukları (`personel_gider`) gösterir, ödemeleri göstermez; bakiye ile ekstre toplamı **tutmayabilir**. Personel modülünün tam işlevi için **Hesaplar da açık olmalıdır**. ② Not atama: Notlar açık + Personel kapalıysa "Personele ata" **hiç görünmez**. |
| **KAPALIYKEN kesinlikle görünmeyecek** | **Personel adı · maaş · ödeme · tahsilat · izin (gün) kayıtları** · `personel_*` işlem satırları (tutar/tarih/açıklama dahil) · Personel sekmesi · toplu ödeme/gider ekranları · `get_personel_ozet` sonucu · global aramada personel sonucu · ürün hareketinde personel rozeti · **her türlü personel toplamı** |
| **Seviyeler** | **Görebilir:** liste + detay + maaş geçmişi. **Ekleyebilir:** + personel ekleme, maaş/ödeme girme. **Düzenleyebilir/Silebilir:** + düzenle/sil. |
| **Eski client** | ⚠️ **EN RİSKLİ KALEM.** Canlıda personel kapalı + işlemler açık **5 aktif üyelik** var; **2'si fiilen personel satırı görüyor** ve ikisi de **legacy izin formatında** (`level` alanı yok). Kısıt gelince bu iki üyelik veri kaybı yaşayacak — doğru olan bu, ama görünür bir değişiklik. |

---

### 1.6 RAPORLAR

| | |
|---|---|
| **Açıkken görülebilecek ekranlar** | `raporlar` (hub) · `raporlar/genel` · `gelir-gider` · `alis-satis` · `cari` · `personel` · `karsilastirma` · `net-varlik-trend` · `hesap/[id]` · `kategori/[id]` · `nakit-akisi` · Ana Sayfa rapor kartları |
| **Tablolar / alanlar** | Doğrudan tablo erişimi **yok**; yalnız RPC sonuçları |
| **Görülebilecek işlem tipleri** | **K1 — KESİŞİM:** yalnız kullanıcının AÇIK modüllerine ait tipler. Personel kapalı → `personel_*` rapora girmez; Hesaplar kapalı → `gelir`/`gider`/`transfer` girmez. |
| **RPC'ler** | `get_income_expense_summary` · `get_category_report` · `get_product_report` · `get_account_report` · `get_income_by_source` · `get_networth_opening_by_month` · `get_networth_pl_trend` |
| **Export / paylaşım** | Rapor Excel/PDF |
| **Çapraz-modül istisnaları** | **Raporlar KAPSAYICI değil, KESİŞİMDİR:** rapor yalnız kullanıcının açık modüllerinden beslenir. Personel kapalıysa personel gideri rapora **girmez** (K1). **Ek şart:** Raporlar açık olsa bile toplamlar yalnız açık kaynak modüllerin kesişiminden hesaplanır. |
| **KAPALIYKEN kesinlikle görünmeyecek** | Gelir/gider toplamı · kâr-zarar · nakit akışı · kategori dağılımı · net varlık trendi · **Ana Sayfa'daki Gelir/Gider ve Nakit Akışı kartları** · rapor RPC sonuçları · rapor Excel/PDF |
| **Seviyeler** | Raporlar salt-okunurdur; **Ekleyebilir/Düzenleyebilir seviyelerinin etkisi YOKTUR**. |
| **Eski client** | Rapor RPC'lerine modül kapısı eklenince eski client boş/0 sonuç alır. ⚠️ Ana Sayfa kartı gizlenmezse **`0,00` gösterip yanıltır** — istemci ve sunucu **birlikte** kapatılmalı. |

---

## 2. GÖRÜNMEYEN İÇ YETENEKLER

Bugün `buildPermissions` şunları **her izin setinde zorla `true`** yapıyor:

```
CORE_MODULES = ['islemler', 'kategoriler', 'ileri_tarihli'];   +   dashboard: true
```

**Sözleşme bunu reddediyor.** Bu dördü "herkese açık modül" değil, **görünür toggle'lardan
türetilen yetenekler** olacak:

### 2.1 `islemler` → TÜREVİ

Bağımsız bir yetki **değildir**. Ama görünürlük **yalnız tipe bakarak** kurulamaz —
v1'deki tek boyutlu tablo iç çelişkiliydi. İki boyut gerekiyor:

**Boyut 1 — İşlemin BACAKLARI.** Bir işlem birden fazla varlığa dokunabilir
(`cari_odeme` hem cariye hem hesaba). **Kural: bir satırı görmek için o satırın
DOKUNDUĞU her varlığın modülü açık olmalıdır (VE mantığı).**

| İşlem tipi | Dokunduğu varlıklar | Görünürlük şartı |
|---|---|---|
| `cari_alis` · `cari_satis` · `cari_alis_iade` · `cari_satis_iade` | cari | Cariler |
| `cari_odeme` · `cari_tahsilat` | cari **+** hesap | **Cariler** *(tek başına yeter — **K13**)*.<br>Hesaplar kapalıysa satırdaki hesap bilgisi **minimal projeksiyon** (yalnız ad); bakiye asla.<br>⚠️ Ters yön geçerli değil: **Hesaplar tek başına bu tipleri GÖSTERMEZ** — işlem Cariler'e aittir. |
| `personel_gider` · `personel_satis` | personel | Personel |
| `personel_odeme` · `personel_tahsilat` | personel **+** hesap | Personel **VE** Hesaplar |
| `personel_izin_hakki` · `personel_izin_kullanimi` | personel | Personel |
| `gelir` · `gider` | hesap | Hesaplar |
| `transfer` | hesap **+** hedef hesap | Hesaplar |

> ⚠️ **v1 HATASI DÜZELTİLDİ.** v1'de Hesaplar bölümü `personel_odeme`/`personel_tahsilat`
> satırlarını "görünür" sayıyordu ama Personel bölümü aynı satırların hiçbir yerde
> görünmemesini istiyordu. VE mantığı bu çelişkiyi kaldırıyor: **Personel kapalıysa
> hesap detayında da o satır görünmez** — tutar, tarih, açıklama dahil.

**Boyut 2 — ÜRÜN BAĞLAMI (v1'de eksikti).** Bir işlemin `urun_hareketler` kaydı varsa,
o işlem **ürün bağlamından da** okunabilir:

| Durum | Sonuç |
|---|---|
| Ürünler açık, Cariler kapalı, işlemin ürün hareketi **var** | Ürün detayında satır görünür; **cari adı** minimal olarak görünür *(§1.2 istisnası)*; cari detayına navigasyon yok |
| Ürünler açık, Cariler kapalı, işlemin ürün hareketi **yok** | Satır **hiç görünmez** |
| Ürünler kapalı | Ürün bağlamı yok; yalnız Boyut 1 geçerli |

**Birleşik kural:**
> Bir işlem satırı, **(Boyut 1'in tamamı sağlanıyorsa)** VEYA **(ürün hareketi var ve
> Ürünler açıksa, yalnız ürün bağlamında)** görünür.

**Bağlam farkı önemlidir:** aynı satır, okunduğu ekrana göre farklı alanlar gösterir.
Bu bir UI tercihi değil, **§2.5'teki kolon projeksiyonu kuralının** gereğidir.

**"Tüm İşlemler" ekranı (`islemler`) — K10:** ekran **kalır**, ama **yalnız izin verilen
tiplerin** işlemlerini gösterir (yukarıdaki tablo). Filtre çipleri de aynı süzgeçten geçer:
Personel kapalıysa "Personel", "İzin Hak Edişi", "İzin Kullanımı" çipleri **hiç çizilmez**;
Hesaplar kapalıysa "Transfer" çipi çizilmez.

Hiçbir tipe izin yoksa ekran **boş durum** gösterir; giriş noktası (Daha → Tüm İşlemler)
sadelik ilkesi gereği **hiç çizilmez**.

### 2.2 `kategoriler` → TÜREVİ

Kategori **adı ve rengi** finansal veri değildir; işlem satırını okuyabilen kategori
etiketini de görebilir.

**K11 — Kategori YÖNETİMİ owner-only:**
- `kategoriler` ekranı, ekleme/düzenleme/silme yalnız **işletme sahibinde**.
- Ortakta Daha → Kategoriler girişi **hiç çizilmez**; deep-link "izin yok" ile geri atar.
- Kategori **etiketi** (ad + renk) işlem satırında görünmeye devam eder — okuma yasağı yok.
- İşlem girerken kategori **seçebilmek** için ekran gerekmez; seçici okuma yeter.
- **Kategori bazlı TOPLAMLAR** (kategori raporu) → Raporlar'a aittir, kategoriler'e değil.

### 2.3 `ileri_tarihli` → TÜREVİ

**Kullanıcı kuralı:** ileri tarihli bir kayıt, **temel işleminin ait olduğu modül açıksa**
görünür. Bağımsız yetki değildir.

- Bildirim çanı (her sayfada) yalnız **izin verilen** ileri tarihli kayıtları listeler.
- Personel kapalıysa ileri tarihli personel ödemesi çanda **görünmez**.
- Hiç izin verilen kayıt yoksa **çan hiç görünmez** (sadelik ilkesi).

### 2.4 `dashboard` → TÜREVİ

Ana Sayfa **her zaman açılabilir** (uygulamanın girişi), ama **içeriği modüllere göre kurulur**:

| Ana Sayfa bileşeni | Görünürlük şartı |
|---|---|
| Hesaplar bölümü + **bakiyeler** | **Hesaplar açık** *(K2 — Raporlar gerekmez)* |
| Gelir/Gider kartı (aylık kâr-zarar) | **Raporlar açık** |
| Nakit Akışı kartı | **Raporlar açık** |
| Genel Durum / net varlık | **Raporlar açık** — birden çok modülün toplamı, tanımı gereği rapordur |
| Cari mini-dashboard (borç/alacak özeti) | **Cariler açık** *(K3 — Raporlar gerekmez)* |
| FAB menüsü satırları | Her satır kendi modülüne bağlı |
| Bildirim çanı | En az bir izin verilen ileri tarihli kayıt varsa *(§2.3)* |

**K2/K3 ile Genel Durum arasındaki sınır:** tek bir modülün kendi özeti (hesap bakiyesi,
cari borç/alacak) o modüle aittir. **Birden çok modülü birleştiren** toplam (Genel Durum,
net varlık, gelir-gider) rapordur ve `raporlar` ister.

Hiçbir modülü olmayan kullanıcı Ana Sayfa'yı açar ama **boş/karşılama ekranı** görür.

---

### 2.5 MİMARİ KISIT — RLS SATIR AÇAR, KOLON GİZLEMEZ *(v2'de eklendi)*

> **RLS bir satırı ya tamamen açar ya tamamen kapatır. Satırın bazı kolonlarını
> gizleyemez.**

Bu, sözleşmedeki birçok "şu alan görünsün, bu görünmesin" kuralını doğrudan etkiliyor:

| Sözleşmedeki kural | Yalnız RLS ile yapılabilir mi |
|---|---|
| Ürün detayında **yalnız cari adı** görünsün, bakiyesi görünmesin | ❌ Cari satırı açılırsa REST ile tüm kolonlar istenebilir |
| İşlem satırında hesap adı gizlensin, tutar kalsın | ❌ Aynı sorun |
| Hesap ekstresinde personel adı gizlensin | ❌ Aynı sorun |

**Sonuç — iki katmanlı çözüm gerekiyor:**

1. **Temel tablolara doğrudan REST erişimi**, paylaşılan kullanıcılar için **kısıtlanır**
   (RLS satırı hiç açmaz).
2. Gereken bağlamsal veri, **kolon-projeksiyonlu view ya da RPC** üzerinden verilir
   (ör. "ürün hareketi + cari adı" döndüren, cari bakiyesini **hiç seçmeyen** bir uç).

**Neden kritik:** UI'da alan gizlemek REST sızıntısını durdurmaz. Kullanıcı uygulamayı
baypas edip `GET /rest/v1/cariler?select=*` çağırabilir. Sözleşmenin 3. Temel Kuralı
ancak bu mimariyle gerçekten sağlanır.

⚠️ **Bu, işin boyutunu büyütüyor:** yalnız RLS filtresi yazmak yetmez; bağlamsal veriyi
taşıyan yeni uçlar tasarlanmalı. Kod aşamasına geçmeden bu kabul edilmeli.

#### 2.5-a — YENİ UÇLAR MEVCUT KISITLARI KORUMAK ZORUNDA *(v2, kritik)*

Yeni projeksiyon uçları **yalnız modül/bağlam iznini** kontrol ederse, bugün var olan
bir kısıtı **sessizce kaldırırlar**. Zorunlu formül:

```
GÖRÜNÜR  ⟺  (modül/bağlam izni)
             AND  (can_see_all_users_data = true  OR  created_by = auth.uid())
```

**Neden zorunlu — canlı veri (26 Tem, salt-okunur):**

| Ölçüm | Değer |
|---|---|
| Aktif üyelik | 23 |
| `can_see_all_users_data = false` olan | **1** |
| Alanı hiç olmayan | 0 |
| Legacy (`level` alanı yok) | **8** |

O **bir** kullanıcı bugün yalnız **kendi girdiği** kayıtları görüyor. Yeni uç bu koşulu
taşımazsa, güvenlik iyileştirmesi diye yapılan iş onun erişimini **artırır**.

> **KURAL:** her yeni view/RPC, mevcut RLS'in kısıtlarını **en az onun kadar dar**
> uygulamak zorundadır. Yeni altyapı hiçbir kullanıcının erişimini **artıramaz**.
>
> **TEK İSTİSNA SINIFI** *(v3)*: sözleşmede **açıkça onaylanmış** ve **delta tablosuna
> yazılmış** ürün kararları. Bugün bunlar **üç tane**: **D24** (bağlamsal not),
> **D30** (ürün detayında minimal cari adı), **D31** (minimal hesap referansı / K13).
>
> Bu üçünün dışında erişim artışı **yasaktır** — "iyileştirme sırasında oldu",
> "zaten görebiliyordu", "pratikte fark etmez" gibi gerekçeler kabul edilmez.
> Yeni bir genişleme gerekiyorsa **önce sözleşmeye karar olarak yazılır**, sonra
> uygulanır.
>
> Tasarım raporunda **her uç için** şu iki soru ayrı ayrı cevaplanacak:
> ① Bu uç hangi kısıtları taşıyor? ② Taşımadığı bir kısıt varsa, hangi onaylı
> delta maddesine dayanıyor?

#### 2.5-b — ÜRETİME ÇIKIŞ SIRASI ≠ GELİŞTİRME SIRASI *(v2)*

Kod paketleri 1→5 sırayla **hazırlanabilir**, ama **yayına** aynı sırayla çıkamaz.
Temel tablo RLS'i daraltılmadan **önce** şunlar canlıda olmalı:

| # | Adım | Neden önce |
|---|---|---|
| 1 | Yeni projeksiyon uçları **additive** olarak eklenir | Eski client bozulmaz; yeni uçlar boşta bekler |
| 2 | Yeni client bu uçlara geçirilir ve **yayınlanır** | *(v2: "kullanıcıların çoğu geçmeli" ifadesi KALDIRILDI — güvenlik kapısı olamaz; bkz. aşağıdaki zorunlu koşul)* |
| 3 | Yetki daralmasında **cache temizliği** yayınlanır (D28) | Yoksa sunucu kısıtı ekranda görünmez |
| 4 | Eski client davranışı + **minimum sürüm stratejisi** doğrulanır | Mağazadaki eski sürüm aylarca kullanımda |
| 5 | **Ancak bundan sonra** temel tablo erişimi kapatılır | Erken kapatma → eski client'ta boş ekran/hata |

⚠️ 5. adım atlanır ya da öne alınırsa, güncellemeyi almamış kullanıcılar
**boş ekran veya hata** yaşar. Bu, veri sızıntısından farklı ama gerçek bir zarardır.

##### 5. adımın ZORUNLU KOŞULU *(v2 — "çoğunluk" yeterli değildir)*

> **"Kullanıcıların çoğu yeni sürüme geçti" bir güvenlik kapısı DEĞİLDİR.**
> Desteklenen **tek bir eski istemci** bile geniş temel tablo erişimini kullanmaya
> devam eder — ve sızıntı tam olarak oradan sürer.

Temel tablo RLS'i ancak şu **iki koşuldan biri** sağlandığında daraltılabilir:

| Yol | Koşul |
|---|---|
| **A** | Desteklenen **TÜM** shared-mode istemcileri güvenli uçlara geçmiş olmalı (yalnız çoğunluk değil — **hepsi**) |
| **B** | Eski sürümlerin **shared-mode kullanımı** minimum-sürüm kapısıyla engellenmiş olmalı (zorunlu güncelleme) |

**Not:** B yolu yalnız **paylaşılan işletme** kullanımını kapatmalıdır; tek kullanıcılı
(owner-only) eski istemciler çalışmaya devam edebilir — onlarda çok kullanıcılı sızıntı
yüzeyi zaten yok. Bu ayrım, zorunlu güncellemenin etkisini en aza indirir.

Hangi yolun seçileceği **tasarım raporunda** karara bağlanacak; ikisi de ürün kararı
gerektirir (B yolu kullanıcıyı güncellemeye zorlar).

---

### 2.6 KAPSAM DIŞI KALMIŞ YÜZEYLER *(v2'de eklendi)*

v1 yalnız UI/REST/RPC/export/public-link'i sayıyordu. Eksik olanlar:

#### Storage (`islem-photos`) — AKTİF SIZINTI

Canlı politika **yalnız aktif üyelik** kontrol ediyor, **modül kontrolü yok**
(`20260518030000_fix_storage_policy_multi_user.sql`): aktif her ortak, işletme
klasöründeki **tüm dosyaları görebiliyor, yükleyebiliyor, güncelleyebiliyor ve
silebiliyor**.

Bu klasör hem **işlem fişleri** hem **not fotoğrafları** için kullanılıyor. Yani:
- Yalnız Notlar verilen biri → **işlem fişlerini** açabilir
- Yalnız Cariler verilen biri → **personel/hesap fotoğraflarını** açabilir

**Sözleşme kuralı:** dosya erişimi, dosyanın bağlı olduğu kaydın modülüne bağlanmalı.
Klasör yapısı bugün buna izin vermiyorsa (yalnız `isletme_id` ile ayrılmışsa) yol
yapısı ya da bir erişim aracı gerekir. **Ayrı iş paketi.**

#### Edge Functions

`cari-ekstre` service-role ile okuyor → **RLS'i hiç görmüyor**. Diğerleri
(`send-z-report`, `notify-linked-users`, `process-scheduled-transactions`,
`parse-invoice`…) ayrıca denetlenmeli. Sözleşme kuralı: her edge function, çağıranın
yetkisini **kendi içinde** doğrulamalı.

#### Kalıcı cihaz önbelleği

React Query verileri **24 saate kadar şifresiz `AsyncStorage`'da** tutuluyor
(`queryClient.ts:33`). Uygulama öne gelince izinler yenileniyor ama **izin daraldığında
cache temizlenmiyor** (`useAuth.ts:559`).

> **SÖZLEŞME GARANTİSİ:** üyelik kaldırıldığında veya izinler daraldığında, ilgili
> işletmenin **bellek ve disk cache'i temizlenmeden** uygulama içerik render etmez.

#### Bildirimler

Push ve yerel bildirimler kapalı modüle ait veri taşımamalı (ör. Personel kapalı bir
ortağa maaş hatırlatması gitmemeli).

#### Dürüstlük sınırı — geri alınamayanlar

> Daha önce üretilmiş **PDF/Excel dosyaları**, alınmış **ekran görüntüleri** ve
> geçerliliği süren **signed URL**'ler geri alınamaz. Yetki daraltmak geçmişe
> yürümez. Bu, sözleşmenin bilinçli sınırıdır.

---

## 3. KARARLAR (ürün sahibi — 26 Tem 2026)

Onbir sorunun tamamı cevaplandı. Bunlar **karardır**, tartışmaya kapalıdır.

| # | Karar | Sonucu |
|---|---|---|
| **K1** | **KESİŞİM.** Rapor yalnız açık modüllerden beslenir. | Personel kapalıysa maaş gideri gelir-gider raporuna **girmez**. ⚠️ Ortağın gördüğü rapor toplamı sahibin gördüğünden **farklı çıkar** — bilinçli kabul. |
| **K2** | **Hesap bakiyeleri, Raporlar kapalıyken de görünür.** | Bakiye "hesap verisi"dir, rapor değil. Ana Sayfa hesap bölümü + bakiyeler `hesaplar`'a bağlı, `raporlar`'a değil. |
| **K3** | **Cari borç/alacak özeti görünür.** Cari ekstresi paylaşılabilir. **Ama cariden raporlara navigasyon YOK.** | Cari detayındaki "ne kadar borcumuz var" görünür; ⋮ menüsündeki **Rapor girişi hiç çizilmez** (bugün çiziliyor, tıklayınca hata veriyor). |
| **K4** | **Ürün detayındaki özet kartları görünür.** Genel raporlara navigasyon YOK. | Ürün kâr/ciro kartı `urunler`'e bağlı. Raporlar ekranlarına giriş noktası çizilmez. |
| **K5** | **Cariye bağlı not görünür; "genel notlar" sayfasına giriş YOK.** | ⚠️ **YENİ YETENEK:** not görünürlüğü ikiye ayrılıyor — *bağlamsal not* (cari/ürün detayında, o kaydın notu) ve *genel notlar ekranı* (`notlar` modülü). Cariler açık + Notlar kapalı → cari detayında not görünür, Notlar sekmesi görünmez. |
| **K6** | **Arşiv = izin verilen modüllerin arşivi.** **PASİF kayıtları yalnız owner ve yönetici görür — KURAL.** | Arşiv ekranı yalnız açık modüllerin arşivlenmiş kayıtlarını listeler. Pasif (`is_active=false`) kayıtlar owner + `manager` rolü dışında **hiç kimseye** görünmez. |
| **K7** | **Cariler açıksa `view` seviyesi dahil ekstre paylaşılabilir.** | Public link üretimi genel yazma seviyesine değil `cariler` modülüne bağlanır (owner-only değildir). Excel/PDF ve public link salt-okunur dağıtım yüzeyidir; işletme verisine create/update/delete hakkı vermez. ⚠️ **Kalan risk aşağıda — R1.** |
| **K8** | **Arşiv, modül bazlı süzülür.** | Yalnız personel açıksa yalnız personel arşivi; yalnız cari açıksa yalnız cari arşivi; yalnız hesaplar açıksa yalnız hesap arşivi. K6'nın uygulama biçimi. |
| **K9** | **Karar bana bırakıldı → deny-by-default'a geçilir, ama mevcut ortaklar kırılmadan.** | Ayrıntı ve gerekçe aşağıda — **K9 açılımı**. |
| **K10** | **"Tüm İşlemler" ekranı kalır, yalnız izin verilen tiplerin işlemlerini gösterir.** | Taslaktaki **(b)** seçeneği. Ekran silinmiyor; içeriği §2.1'deki tip→modül tablosuna göre süzülüyor. |
| **K11** | **Kategori yönetimi owner-only.** | `kategoriler` ekranı ve düzenlemesi yalnız işletme sahibinde. Kategori **adı/rengi** işlem satırında görünmeye devam eder (etiket, yönetim değil). |

### K9 açılımı — `notlar` / `birikim` varsayılanı

**Sorun:** bugün bayrak yoksa **açık** sayılıyor (`DEFAULT_TRUE_MODULES`). Deny-by-default
ile çelişiyor. Ama varsayılanı doğrudan `false` yapmak, bayrağı olmayan **eski izin
kayıtlarındaki ortakların** notlarını/birikimini bir anda kapatır.

**Kararım — ikisini birden sağlayan yol:**

1. **Önce** tek seferlik bir izin-kaydı güncellemesi: bugün fallback'e dayanarak erişimi
   olan kayıtlara `notlar: true` / `birikim: true` **açıkça yazılır**. Mevcut kimse
   erişim kaybetmez.
2. **Sonra** `DEFAULT_TRUE_MODULES` boşaltılır → bayrak yoksa **kapalı**.
3. Böylece: eski ortaklar aynen devam eder, **yeni** izin kayıtları deny-by-default olur.

**Neden bu daha güvenli:** fallback'i olduğu gibi bırakmak, ileride eklenecek her yeni
modülün "bayrak yoksa açık" tuzağına düşme riskini sürdürür. Fallback'i boşaltmak o
sınıfı tamamen kapatır.

⚠️ **Onay gerektirir:** 1. adım `isletme_users.permissions` JSONB alanını günceller.
Kullanıcı verisi (işlem/cari/personel) **değil**, izin kaydıdır — ama yine de veri
yazmadır ve ayrı "uygula" onayı ister. Kaç kaydı etkilediği uygulama öncesi
salt-okunur sorguyla raporlanır.

### Kararlardan doğan KALAN RİSKLER

| # | Risk | Açıklama |
|---|---|---|
| **R1** | **ÇÖZÜLDÜ → K12** | Aşağıda. |
| **R2** | **K1 kesişimi rapor tutarsızlığı yaratır** | Aynı dönemin raporu sahipte ve ortakta farklı toplam gösterir. Bu **doğru davranış** ama kullanıcı desteğinde kafa karıştırabilir — rapor başlığına "yetkinize göre süzülmüştür" notu düşülmesi önerilir. |
| **R3** | **K5 yeni bir görünürlük ekseni açıyor** | "Bağlamsal not" ile "genel notlar" ayrımı bugün kodda **yok**; `notlar` tablosu tek. Ayrım **`entity_type`/`entity_id` ve `assigned_to_cari`/`assigned_to_personel`** üzerinden kurulacak *(v2: v1'de var olmayan `cari_id`/`urun_id` yazıyordu)* — RLS'te ek koşul demek. `assigned_to_*` sonradan atanabildiği için görünürlük **dinamiktir**. |
| **R4** | **K6'daki "yönetici" rolü** | `manager` rol şablonu var ama pasif-görme yetkisi bugün role değil, `visibility.can_see_passive` alanına bağlı ve o **her sette `true`**. K6 uygulanırken bu alan role bağlanacak. |
| **R5** | **K9'da eski client alanı SİLEBİLİR** *(v2)* | Backfill sonrası **eski owner istemcisi** izin JSON'unu yeniden kaydederken yeni `notlar`/`birikim` alanlarını düşürebilir → kullanıcı sessizce fallback'e geri döner. Sunucuda merge/normalizasyon ya da uyumluluk yolu gerekir. Backfill koşulları: yalnız **anahtarı eksik** kayıtlar güncellenir, açıkça `false` olanlara **dokunulmaz**, önce etkilenen satır sayısı salt-okunur raporlanır. |
| **R6** | **Kolon projeksiyonu işi büyütüyor** *(v2)* | §2.5 gereği yalnız RLS filtresi yazmak yetmiyor; bağlamsal veri için yeni uçlar tasarlanmalı. İş paketleri buna göre boyutlandırılmalı. |

### K12 — PUBLIC EKSTRE LİNKİ *(R1'in kararı, v2)*

| Kural | Değer |
|---|---|
| **Ortak** (Cariler açık) | 1 / 7 / 30 gün — **en fazla 30** |
| **Owner** | 1 / 7 / 30 / 365 gün — **en fazla 365** |
| **"Süresiz" seçeneği** | **HİÇ OLMAYACAK** (bugünkü `now() + 100 years` kaldırılır) |
| **Görme/iptal** | Ortak yalnız **kendi** ürettiği linkleri; owner **tümünü** |
| **Otomatik geçersizlik** | Üyelik kaldırılırsa **veya** Cariler yetkisi kapanırsa, o ortağın linkleri geçersiz |
| **Her açılışta doğrulama** | Yalnız `revoked`/`expires_at` değil, **oluşturanın güncel yetkisi** de kontrol edilir |
| **Mevcut 100 yıllık linkler** | Onaysız **dokunulmaz**; önce salt-okunur envanteri çıkarılır |

### K13 — CARİ ÖDEME/TAHSİLAT, HESAPLAR KAPALIYKEN DE YAPILABİLİR *(v3)*

> **Cari bağlamındaki ödeme/tahsilat CARİLER'e ait bir işlemdir.** Hesap burada
> **sınırlı bir referanstır**, ayrı bir yetki alanı değil.

Bu karar §2.1'in VE kuralını `cari_odeme`/`cari_tahsilat` için **değiştirir** ve
§1.1'de not edilen kullanılabilirlik sorununu (*"Hesaplar kapalıyken cari ödemesi
girilemez"*) çözer.

#### Şart

| | |
|---|---|
| **Kim** | Cariler **açık** ve seviye **`add` veya üstü** |
| **Ne yapabilir** | QTB'den `cari_odeme` / `cari_tahsilat` girer |
| **Hesaplar kapalıysa** | **Minimal hesap seçici** açılır |
| **Hesaplar + Cariler açıksa** | Mevcut **tam** hesap görünürlüğü geçerli |

#### Minimal hesap seçicinin döndürdüğü alanlar

| Döner | Dönmez |
|---|---|
| `id` | **`balance` (bakiye)** |
| `name` (ad) | hareketler / ekstre |
| `currency` (para birimi) | günlük kasa |
| *(gerekirse)* `type` / ikon | nakit akışı |
| | rapor verisi |
| | **diğer tüm hesap alanları** |

**Seçilebilirlik kısıtı:** yalnız **aktif** ve **arşivlenmemiş** hesaplar listelenir.
**Birikim** hesabı yalnız **Hesaplar + Birikim** açıkken seçilebilir — Cariler-only
kullanıcı birikim hesabını **göremez ve seçemez**.

#### Yazma sınırı — genel hesap yetkisi AÇILMAZ

- İşlem, bakiyeyi **yalnız** tenant/hesap doğrulaması yapan **atomik cari RPC** üzerinden etkiler.
- **`increment_balance` — ayrım net olsun** *(v3)*:
  - ❌ **Doğrudan istemci/REST/RPC çağrısı kapatılır.**
  - ✅ **Güvenli cari ödeme/tahsilat RPC'sinin kendi sunucu-içi atomik güncellemesi
    BOZULMAZ.** Kapatılan şey fonksiyonun kendisi değil, **istemcinin ona doğrudan
    erişimi**dir.
- **Cevap kanalının TAMAMI bakiye sızdırmaz** *(v3)*:
  - Başarılı cevap bakiye **döndürmez**.
  - **Hata kanalı da döndürmez**: hata mesajı, `detail`, `hint` ya da durum metni
    **güncel / kalan / yetersiz bakiye** değerini **içeremez**.
    *(Ör. "Yetersiz bakiye: 1.250,00 ₺" yasaktır; "Yetersiz bakiye" serbesttir.)*
  - ⚠️ **AÇIK RİSK — sınırlı bilgi ifşası:** "Yetersiz bakiye" kesin tutarı vermese de,
    farklı tutarlarla tekrarlanan denemeler **bakiye aralığını sezdirebilir** (ikili
    arama). Ürün kararı değişmiyor; **tasarım raporunda** değerlendirilecek ve gerekirse
    ortak kullanıcıya daha genel hata, deneme sınırı ya da başka bir güvenli davranış
    **önerilecek** — karar yine ürün sahibinin.
- Kullanıcı hesap **oluşturamaz, düzenleyemez, silemez**; hesap listesi/detayı **göremez**.

#### Düzenleme ve silme — atomiklik şartı *(v3)*

Cariler-only kullanıcı, seviyesi izin veriyorsa (`edit_own` / `edit_all`) kendi girdiği
ödeme/tahsilatı düzenleyebilir ya da silebilir. Bu yollarda:

| Şart | Açıklama |
|---|---|
| **Eski etki geri alınır** | Önceki hesabın bakiye etkisi **atomik** olarak geri alınır |
| **Yeni etki uygulanır** | Yeni hesap/tutar etkisi **aynı işlem içinde** uygulanır |
| **Yarım işlem YOK** | Herhangi bir adım başarısızsa **tamamı** geri alınır |
| **Bakiye dönmez** | Bu yollar da ne başarı ne hata kanalında bakiye döndürür |
| **Hesap değişimi** | Kullanıcı ödemeyi **başka bir hesaba** taşıyabilir; her iki hesap da minimal seçici kurallarına (aktif, arşivsiz, yetkili) uymalı |

⚠️ **Tasarım raporunda `create` / `update` / `delete` akışları AYRI AYRI incelenecek** —
üçü farklı atomiklik ve doğrulama gereksinimi taşıyor.

#### Görüntüleme yetkisi (`view`) — mevcut satırlar *(v3)*

Ekleme yetkisi **olmayan** ama Cariler'i görebilen kullanıcı:

- Mevcut ödeme/tahsilat satırlarını **görür**
- O satırlarda **minimal hesap adını** görür
- **Yeni işlem oluşturamaz**; seçici hiç açılmaz

> Bu, hesap **bakiyesini** ya da **Hesaplar modülünü** açmaz. Yalnız zaten görünen
> satırın hangi hesaba ait olduğunu okuyabilir.

#### Seviye etkisi

| Seviye | Yapabildiği |
|---|---|
| `view` | **Oluşturamaz** — seçici hiç açılmaz |
| `add` | Oluşturur |
| `edit_own` | + yalnız **kendi** girdiğini düzenler/siler |
| `edit_all` | + tümünü düzenler/siler |

#### Görünürlüğe etkisi *(§2.1 güncellemesi)*

| Kullanıcı | `cari_odeme` / `cari_tahsilat` satırını görür mü |
|---|---|
| **Cariler açık**, Hesaplar kapalı | ✅ **Görür** *(K13 ile değişti; eskiden görmüyordu)* — ama satırdaki hesap bilgisi **minimal projeksiyonla** (yalnız ad) gelir, bakiye **asla** |
| Cariler + Hesaplar açık | ✅ Görür, tam hesap bilgisiyle |
| **Hesaplar açık, Cariler kapalı** | ❌ **Görmez** — işlem Cariler'e aittir. *(Bu taraf DEĞİŞMEDİ; hesap ekstresinin toplamı eksik görünebilir — §1.4'teki kabul edilen sonuç geçerli.)* |

**Tutarlılık gerekçesi:** kullanıcı seçicide hesabın **adını** zaten görüyor; girdiği
işlemin satırında aynı adı görmesi yeni bilgi açmaz. Bakiye ise hiçbir yolla dönmez.

---

### K12-b — ÜRETİCİ BAZLI LİNK YÖNETİMİ *(v2)*

Bugün **cari başına tek aktif link** var ve yeni link üretmek eskisini iptal ediyor.
Bu, ortaklar arasında bir soru doğuruyor: ortak link üretirken **owner'ın linkini
iptal edebilir mi?**

**Karar:** hayır — **üretici + cari başına bir aktif link.**

| Kim | Görebildiği / iptal edebildiği |
|---|---|
| **Ortak** | Yalnız **kendi** ürettiği linkler (`created_by = auth.uid()`) |
| **Owner** | **Tümü** — kendi ve ortakların linkleri |

Ortağın yeni link üretmesi **yalnız kendi** önceki linkini iptal eder; owner'ın ya da
başka bir ortağın linki etkilenmez.

**Uygulanabilir:** `cari_ekstre_links` tablosunda `created_by` kolonu **var**
(canlı şemadan doğrulandı) — ek kolon gerekmiyor.

---

### K12-a — LİNK CANLIDIR *(karar verildi)*

**Link, ömrü boyunca CANLI ekstre gösterir.** Paylaşımdan sonra eklenen işlemler de
görünür. Bugünkü davranış korunuyor — dondurulmuş anlık görüntü **istenmiyor**.

**Kabul edilen sonuç:** bir kez paylaşılan link, süresi dolana kadar **yeni veriyi de
açar**. Cariye bir kez ekstre linki gönderdikten sonra o cariyle yapılan her yeni işlem,
aynı linkten görülebilir.

Bu, K12'nin süre kısıtlarını **daha da önemli** kılıyor:

| | Süre | Bu sürede görülebilecek |
|---|---|---|
| Ortak | en fazla **30 gün** | 30 güne kadar biriken **yeni** işlemler |
| Owner | en fazla **365 gün** | 1 yıla kadar biriken **yeni** işlemler |

⚠️ **Uygulama notu:** "süresiz" seçeneğinin kaldırılması (K12) bu kararla birlikte
zorunluluk hâline geliyor — canlı + süresiz bir link, cari hesabına **kalıcı okuma
erişimi** demek olurdu.

**Karşı tedbir (K12'de zaten var):** her açılışta oluşturanın **güncel** yetkisi
doğrulanır. Ortak işletmeden çıkarılırsa ya da Cariler yetkisi kapanırsa, link
süresi dolmamış olsa bile **anında geçersizleşir**.

---

## 3.5 ARŞİV VE PASİF KAYITLAR (K6 + K8)

Bu iki kavram **birbirinden ayrıdır** ve farklı kurallara tabidir.

### Arşivlenmiş kayıtlar (`is_archived = true`)

**Kural:** arşiv, **izin verilen modüllerin arşividir.** Ayrı bir yetki değildir.

| Kullanıcının açık modülleri | Arşiv ekranında gördüğü |
|---|---|
| Yalnız Cariler | Yalnız arşivlenmiş **cariler** |
| Yalnız Personel | Yalnız arşivlenmiş **personel** |
| Yalnız Hesaplar | Yalnız arşivlenmiş **hesaplar** |
| Yalnız Ürünler | Yalnız arşivlenmiş **ürünler** |
| Cariler + Ürünler | İkisinin arşivi; personel/hesap arşivi **yok** |
| Hiçbiri | Arşiv girişi **hiç çizilmez** |

Mevcut domain kuralı korunur: **arşivli kayıt gelir-gider raporlarına GİRER, Genel
Durum'a GİRMEZ** *(bkz. `AGENTS.md` — kullanıcı kararı, 25 Tem)*. K1 kesişimiyle
birleşince: arşivli **personel** kaydı, personel modülü kapalı bir ortağın raporuna
girmez.

### Pasif kayıtlar (`is_active = false`) — YENİ KURAL

> **Pasif kayıtları YALNIZ işletme sahibi ve `manager` (yönetici) rolü görür.**
> Diğer hiçbir rol, modülü açık olsa bile, pasif kayıtları görmez.

Bu, modül yetkisinden **bağımsız ve daha kısıtlayıcı** bir eksendir:

| Rol | Cariler açık | Pasif cariyi görür mü |
|---|---|---|
| Owner | ✅ | ✅ |
| `manager` | ✅ | ✅ |
| `operator` / `custom` / diğer | ✅ | ❌ |

**Uygulama notu:** bugün bu `visibility.can_see_passive` alanına bağlı ve o alan
`buildPermissions` tarafından **her sette `true`** yazılıyor. Kural uygulanırken alan
role bağlanacak *(bkz. R4)*.

---

## 4. DELTA — bugün ne oluyor / sözleşme ne diyor

| # | Konu | BUGÜN | SÖZLEŞME | Etkilenen |
|---|---|---|---|---|
| D1 | `islemler` modülü | Her özel rolde **zorla açık**, toggle yok | Tipe göre türetilir | **Tüm kısıtlı ortaklar** |
| D2 | `kategoriler` | Zorla açık | Türetilir / S11 | Tüm kısıtlı ortaklar |
| D3 | `ileri_tarihli` | Zorla açık | Temel işlemin modülüne bağlı | Tüm kısıtlı ortaklar |
| D4 | `dashboard` | Zorla açık, içerik kapısız | Açık ama içerik modüle bağlı | Tüm kısıtlı ortaklar |
| D5 | `islemler` RLS | Yalnız `modules.islemler`'e bakar, **tipe bakmaz** | Tip kapısı eklenir | **2 aktif üyelik fiilen** |
| D6 | `can_see_all_users_data` | **Yeni** izin setleri `true` yazıyor; canlıda **1 aktif legacy kayıt `false`** *(v2: v1'de "her sette true" yazıyordu — yanlış)* | Alan **değiştirilmiyor**; ama yeni view/RPC'ler bu kısıtı **korumak zorunda** (§2.5-a). **Agregatlar dahil:** kaynak satırlar `SUM` **öncesinde** bu kuralla süzülür, yoksa toplam üzerinden sızar | O 1 kullanıcı — erişimi **artmayacak** |
| D7 | Ana Sayfa Gelir/Gider kartı | Kapısız | Raporlar'a bağlı | Raporlar kapalı ortaklar |
| D8 | Ana Sayfa Nakit Akışı kartı | Kapısız | Raporlar'a bağlı | Raporlar kapalı ortaklar |
| D9 | `get_income_expense_summary` | Modül kapısı yok | `raporlar` kapısı | Raporlar kapalı ortaklar |
| D10 | `get_category_report` / `get_product_report` | Modül kapısı yok (canlı) | İlgili modül kapısı | — |
| D11 | `get_personel_ozet` | Modül kapısı yok | `personel` kapısı | — |
| D12 | `get_urun_ozet` | Modül kapısı yok | `urunler` kapısı | — |
| D13 | Bildirim çanı | Tüm ileri tarihli kayıtlar | Yalnız izin verilenler | Tüm kısıtlı ortaklar |
| D14 | Global arama | Tüm tablolarda arar | Yalnız açık modüllerde | Tüm kısıtlı ortaklar |
| D15 | Ekstre public linki | Her üye üretebilir, süresiz, canlı | **K7 + K12 + K12-a + K12-b:** `cariler`'e bağlı · ortak ≤30g / owner ≤365g · süresiz YOK · canlı kalır · üretici-bazlı yönetim | — |
| D16 | Daha→Arşiv | Kapısız, her şeyi gösterir | **K8:** yalnız açık modüllerin arşivi; hiçbiri yoksa giriş çizilmez | Tüm kısıtlı ortaklar |
| D17 | QTB işlem tipi sekmeleri | Filtresiz | Açık modüllere göre süzülür | Tüm kısıtlı ortaklar |
| D18 | FAB menüleri | Filtresiz | Her satır modülüne bağlı | Tüm kısıtlı ortaklar |
| D19 | `notlar`/`birikim` varsayılanı | Bayrak yoksa **açık** | **K9:** önce açıkça `true` yazılır, sonra fallback boşaltılır | Mevcut ortaklar *(kırılma yok)* |
| D20 | Ürün detayında personel/hesap rozeti | Koşulsuz çizilir | İlgili modüle bağlı | — |
| D21 | **Pasif kayıt görünürlüğü** | `can_see_passive` her sette `true` → **herkes görür** | **K6:** yalnız owner + `manager` | **Tüm ortaklar** |
| D22 | **Kategori yönetimi** | Zorla açık, herkes girebilir | **K11:** owner-only | Tüm ortaklar |
| D23 | **Cari/ürün detayındaki Rapor girişi** | Çizilir, tıklayınca hata verir | **K3/K4:** hiç çizilmez | Raporlar kapalı ortaklar |
| D24 | **Bağlamsal not** | `notlar` modülüne bağlı | **K5:** bağlı olduğu kaydın modülüne bağlı | Notlar kapalı ortaklar *(erişim ARTAR)* |
| D25 | **Rapor kapsamı** | Tüm işletme verisi | **K1:** açık modüllerin kesişimi | Raporlar açık + bazı modülleri kapalı ortaklar |
| D26 | **"Tüm İşlemler" filtre çipleri** | Personel/İzin/Transfer çipleri koşulsuz | **K10:** modüle göre çizilir | Tüm kısıtlı ortaklar |

| D27 | **Storage (`islem-photos`)** | Aktif her ortak **tüm** dosyaları görür/siler; modül kontrolü yok | Dosya, bağlı olduğu kaydın modülüne bağlanır | **Tüm ortaklar** |
| D28 | **Cache temizliği** | İzin daralınca disk/bellek cache temizlenmiyor (24s) | Daralmada temizlenmeden render yok | Tüm ortaklar |
| D29 | **Temel tablolara REST erişimi** | Satır açıksa tüm kolonlar okunabiliyor | Kolon-projeksiyonlu uçlar; temel tabloya doğrudan erişim kısıtlı *(§2.5)* | Tüm ortaklar |
| D30 | **Ürün detayında minimal cari adı** | Cariler kapalı ortak ürün hareketindeki cari adını göremiyor | Ürün hareketine bağlı carinin yalnız adı görünür; cari detayına geçiş ve diğer cari alanları kapalı kalır | Ürünler açık, Cariler kapalı ortaklar |
| D31 | **Cari ödeme/tahsilat + minimal hesap referansı** *(K13)* | Cariler-only kullanıcı bu tipleri **göremiyor** ve hesap seçici **açamıyor** | Görebilir + girebilir; hesabın **yalnız** id/ad/para birimi/tür/ikon'unu görür | Cariler açık, Hesaplar kapalı ortaklar |

> ### ⚠️ ERİŞİMİ ARTIRAN DELTALAR — **ÜÇ TANE** *(v3 düzeltmesi)*
>
> v1'de "tek", v2'de "iki" yazmıştım; K13 ile **üç** oldu:
>
> | # | Ne artıyor | Neden yeni erişim |
> |---|---|---|
> | **D24** | Bağlamsal not görünürlüğü | Notlar kapalı ortak, açık modüldeki kayıtların notlarını görmeye başlar |
> | **D30** | Ürün detayında **minimal cari adı** | Cariler kapalı ortak bugün cari adını **görmüyor** (RLS döndürmüyor); §1.2 istisnası bunu **açıyor** |
> | **D31** | **Cari ödeme/tahsilat + minimal hesap referansı** *(K13)* | Cariler-only ortak bugün bu satırları görmüyor ve hesap seçemiyor; K13 ikisini de **açıyor** |
>
> Toplam **31 delta**; 28'i kısıtlayıcı, **3'ü genişletici**. Üçü de bilinçli ürün
> kararıdır ve §2.5-a'nın izin verdiği **tek** istisna sınıfıdır.

#### D31 ayrıntısı — minimal hesap referansı ve `can_see_all_users_data` *(v3)*

**Ürün kararı:** Cariler açık **ve** ekleme yetkisi olan kullanıcı, ödeme/tahsilat
yapabilmek için işletmenin **uygun aktif hesaplarının** yalnız şu alanlarını görür:
`id` · `ad` · `para birimi` · *(gerekirse)* `tür`/`ikon`.

| Kural | Değer |
|---|---|
| **`created_by`'ye bağlı mı** | **HAYIR.** Bu referans görünürlüğü hesabın kimin oluşturduğuna bakmaz — `can_see_all_users_data=false` olan kullanıcı da **tüm uygun aktif hesapları** seçicide görür. |
| Görünmeyen hesaplar | **pasif** · **arşivli** · **yetkisiz birikim** (Hesaplar+Birikim açık değilse) |
| Hiçbir şekilde dönmeyen alanlar | **bakiye** · toplam · hareket · ekstre · günlük kasa · diğer tüm hesap alanları |

> **Neden `created_by`'den muaf:** `can_see_all_users_data`, **kayıt sahipliği**
> eksenidir — "başkasının girdiği işlemi görme". Hesap **seçici** ise bir işlem kaydı
> değil, **referans listesidir**; ödeme yapabilmek için işletmenin hesabını seçmek
> zorunludur. O eksene bağlansaydı, kullanıcı yalnız kendi oluşturduğu hesaplara ödeme
> yapabilirdi — çoğu ortakta bu **sıfır hesap** demek olurdu.
>
> ⚠️ Bu, §2.5-a'nın **açıkça onaylanmış istisnasıdır**; kapsamı yalnız yukarıdaki **beş**
> (`id` · `ad` · `para birimi` · `tür` · `ikon`)
> alandır. Aynı muafiyet `islemler` satırlarına **uygulanmaz** — orada
> `can_see_all_users_data` kuralı tam olarak geçerlidir.

---

## 5. TEST MATRİSİ

Her satır için **on yüzey** ayrı test edilir *(v2'de altıdan çıkarıldı)*:

| # | Yüzey | Soru |
|---|---|---|
| 1 | **UI** | Ekranda görünüyor mu |
| 2 | **Deep-link** | Doğrudan rotaya gidilebiliyor mu |
| 3 | **REST** | PostgREST ile tablo okunabiliyor mu — **`select=*` dahil** |
| 4 | **RPC** | Fonksiyon çağrılabiliyor mu |
| 5 | **Storage** | `islem-photos` dosyaları indirilebiliyor mu |
| 6 | **Edge Function** | `cari-ekstre` vb. neyi döndürüyor |
| 7 | **Export** | Excel/PDF içinde sızıyor mu |
| 8 | **Public link** | Paylaşılan URL neyi açıyor |
| 9 | **Bildirim** | Push/yerel bildirim kapalı modül verisi taşıyor mu |
| 10 | **Cache** | İzin daraldıktan sonra eski veri ekranda/diskte kalıyor mu |

### 5.1 Tekli roller

| # | Rol | Görmeli | **Görmemeli (negatif test)** |
|---|---|---|---|
| T1 | **Yalnız Cariler** | Cari listesi/detayı, **altı cari tipinin hepsi** *(K13)*, **Tüm İşlemler — yalnız cari tipleri** *(K10)*, **QTB'de minimal hesap seçici** *(K13, seviye ≥ add)* | Hesap **bakiyesi** · hesap listesi/detayı · günlük kasa · **birikim hesabı** · arşivli/pasif hesap · maaş · rapor · nakit akışı · ürün · serbest not · cari-dışı tipler |
| T2 | **Yalnız Ürünler** | Ürün listesi/detayı, ürün hareketleri, **minimal cari adı**, Tüm İşlemler — yalnız ürün hareketi olan satırlar | Cari bakiyesi/ekstresi/detayı · maaş · hesap · rapor · serbest not · ürün hareketi **olmayan** işlemler |
| T3 | **Yalnız Notlar** | Yalnız serbest notlar | **Hiçbir yapılandırılmış finansal veri** · Ana Sayfa kartları · Tüm İşlemler girişi *(hiç tip yok → çizilmez)* · çan · kategori · **işlem fişi fotoğrafları (Storage)** |
| T4 | **Yalnız Hesaplar** | Hesap listesi/bakiye/hareketler, transferler | Cari detayı · maaş · rapor · nakit akışı · ürün · not |
| T5 | **Yalnız Personel** | Personel listesi/detayı, maaş, izin | Cari · hesap adı · rapor · ürün · not |
| T6 | **Yalnız Raporlar** | S1'e göre (kaynak modül kapalıysa boş) | Ham işlem satırları · cari/personel/hesap detayları |

### 5.2 İkili kombinasyonlar

| # | Kombinasyon | Özellikle sınanacak |
|---|---|---|
| T7 | Cariler + Hesaplar | `cari_odeme`/`cari_tahsilat` **tam** hesap bilgisiyle görünür; seçici **tam** hesap listesi açar; **birikim** yalnız Birikim alt seçeneği de açıksa listelenir *(K13)* |
| **T7-a** | **Yalnız Cariler — K13 ödeme akışı** *(v3)* | Seçici **yalnız** id/ad/para birimi/tür döndürüyor mu · REST'te `hesaplar?select=*` **boş/hata** mı · seçicide **birikim, pasif, arşivli** hesap **yok** mu · başarılı RPC cevabı **bakiye döndürmüyor** mu · **HATA KANALI** (mesaj/`detail`/`hint`) bakiye **değeri içermiyor** mu — "Yetersiz bakiye" ✅ / "Yetersiz bakiye: 1.250,00 ₺" ❌ · `increment_balance` **doğrudan** çağrısı reddediliyor mu · girilen işlem satırında hesap **adı** var ama **bakiye yok** mu |
| **T7-b** | **Yalnız Cariler + seviye `view`** *(v3)* | Ödeme/tahsilat **hiç oluşturulamıyor** mu (seçici açılmıyor, RPC 42501) · **ama mevcut satırlarda minimal hesap adı görünüyor** mu · cari Excel/PDF dışa aktarımı çalışıyor mu · 1/7/30 günlük public ekstre linki oluşturulup iptal edilebiliyor mu · 365 gün ve süresiz seçenek ortak kullanıcıda reddediliyor mu |
| **T7-d** | **Yalnız Cariler — düzenle/sil atomikliği** *(v3)* | `edit_own` kullanıcı kendi ödemesini **başka hesaba taşıyınca**: eski hesabın etkisi geri alındı mı · yeni hesaba uygulandı mı · **yarım işlem kalmadı** mı · hedef hesap seçici kurallarına uyuyor mu (aktif/arşivsiz/yetkili) · bu yollar da **bakiye döndürmüyor** mu · `edit_own` kullanıcı **başkasının** ödemesini düzenleyemiyor/silemiyor mu |
| **T7-c** | **Yalnız Hesaplar** *(K13 ters yön)* | `cari_odeme`/`cari_tahsilat` satırları **görünmüyor** mu — hesap ekstresinde de yok; toplamın eksik görünmesi **beklenen** |
| T8 | Cariler + Ürünler | Ürün detayında cari adı **ve** cari detayına navigasyon — ikincisi de açık olmalı |
| T9 | Cariler + Raporlar | S3: cari toplamları raporda; personel gideri **yok** |
| T10 | Ürünler + Raporlar | S4: alış-satış raporu; personel/hesap kırılımı **yok** |
| T11 | Personel + Raporlar | Maaş raporda; cari/ürün kırılımı **yok** |
| T12 | Hesaplar + Raporlar | Nakit akışı görünür; maaş **yok** |
| T13 | Notlar + Cariler | S5: notta cari adı |
| T14 | Notlar + Personel | "Personele ata" görünür olmalı |
| T15 | **Hiçbiri** (tüm toggle kapalı) | Ana Sayfa boş karşılama · hiçbir sekme · hiçbir veri |

### 5.3 Seviye testleri

Her tekli rol için üç seviye ayrı sınanır:

| Seviye | Beklenen |
|---|---|
| **Görebilir** (`view`) | Okur; açık modülün Excel/PDF dışa aktarımını kullanır; Cariler açıksa süreli public ekstre linki paylaşır. +EKLE butonu **hiç görünmez**; create/update/delete RPC'leri **42501** döner |
| **Ekleyebilir** (`add`) | + ekler; düzenle/sil **reddedilir**; satıra dokunma düzenleme formu **açmamalı** |
| **Düzenleyebilir/Silebilir** (`edit_own` / `edit_all`) | `edit_own` yalnız kendi eklediği kaydı düzenler/siler |

### 5.4 Negatif test yöntemi — **ON BİR YÜZEYİN TAMAMI**

v1'de üç adım yazıyordu; sonraki denetimler okuma ve yazma REST yüzeylerinin ayrı
kanıtlanması gerektiğini gösterdi.
**Bir negatif test, ilgili tüm yüzeylerde geçmeden başarılı sayılmaz:**

| # | Adım | Geçme ölçütü |
|---|---|---|
| 1 | UI | Ekranda yok |
| 2 | Deep-link | Rotaya gidilince "izin yok" + geri atma |
| 3 | REST okuma | `select=*` dahil boş/hata |
| 4 | **REST yazma** | Doğrudan POST/PATCH/DELETE, `view` ve kapalı modülde RLS tarafından reddediliyor |
| 5 | RPC | Fonksiyon boş/42501 |
| 6 | **Storage** | Dosya indirilemiyor |
| 7 | **Edge Function** | Uç kapalı modül verisi döndürmüyor |
| 8 | Export | Kapalı modül Excel/PDF içinde yok; açık modül + `view` olumlu kontrolü geçiyor |
| 9 | Public link | Kapalı Cariler'de üretim/iptal reddediliyor; açık Cariler + `view` olumlu kontrolü geçiyor |
| 10 | **Bildirim** | Push/yerel bildirim veri taşımıyor |
| 11 | **Cache** | İzin daraldıktan sonra ekranda/diskte kalmıyor |

**Muafiyet kuralı:** bir yüzey o senaryo için **anlamsızsa** (ör. Notlar'da Storage
yoksa) test raporunda **"uygulanamaz" diye açıkça işaretlenir** — sessizce atlanmaz.

Bir senaryonun **tek bir yüzeyde** bile sızdırması, o senaryoyu **başarısız** yapar.
Sözleşmenin 3. Temel Kuralı budur: UI'da gizlemek kanıt değildir.

---

## 6. UYGULAMA SINIRI

- İstemci savunma-derinliği uygulanmaktadır; bu tek başına RLS/RPC/Storage
  sunucu sınırlarının tamamlandığı anlamına gelmez.
- Hazırlanan migration ve kanıt dosyaları **üretime uygulanmadı**.
- `undo_import_batch` owner guard bağımsız P0'dır ve kendi test + onay hattını izler.
- Cihaz turu yapılmadan UI davranışı tamamlanmış sayılmaz.

## 7. DURUM VE SONRAKİ ADIM

### Karar durumu — AÇIK SORU KALMADI

| Karar | Konu | Durum |
|---|---|---|
| K1 | Rapor kapsamı = kesişim | ✅ |
| K2 | Hesap bakiyesi Raporlar'sız görünür | ✅ |
| K3 | Cari borç/alacak özeti görünür, rapora navigasyon yok | ✅ |
| K4 | Ürün özet kartları görünür, rapora navigasyon yok | ✅ |
| K5 | Bağlamsal not / genel notlar ayrımı | ✅ |
| K5-M | Bağlamsal not **yalnız okunur** (Notlar kapalıysa) | ✅ |
| K6 | Pasif kayıtlar yalnız owner + yönetici | ✅ |
| K7 | Cariler açıksa ekstre paylaşılabilir | ✅ |
| K8 | Arşiv = açık modüllerin arşivi | ✅ |
| K9 | Deny-by-default'a geçiş, kırılmadan | ✅ |
| K10 | Tüm İşlemler kalır, tipleri süzülür | ✅ |
| K11 | Kategori yönetimi owner-only | ✅ |
| K12 | Ekstre linki: ortak 30g / owner 365g, süresiz yok | ✅ |
| K12-a | Link **canlı** | ✅ |
| K12-b | **Üretici + cari başına bir aktif link**; ortak kendininkini, owner tümünü yönetir | ✅ |
| **K13** | **Cari ödeme/tahsilat, Hesaplar kapalıyken de yapılabilir** (minimal hesap seçici) | ✅ *(v3)* |

**Toplam 16 karar.** *(11 soru → K5-M, K12-a, K12-b alt kararları → v3'te K13.)*

**Sözleşme onaylandı; paketler kontrollü olarak uygulanıyor.**

### Onaydan sonra

1. Delta tablosu (**31 madde**) iş paketlerine bölünür.
2. Paketleme **riske göre** değil, **bağımlılığa göre** olmalı — çünkü §2.5 (kolon
   projeksiyonu) diğer birçok maddenin **önkoşuludur**. Sıra kabaca:

   | Sıra | Paket | Neden bu sırada |
   |---|---|---|
   | 1 | **Kolon projeksiyonu altyapısı** (§2.5; D29-D31) | Diğer maddelerin çoğu buna dayanıyor; yalnız RLS filtresi yazmak sahte güven verir |
   | 2 | **Storage yetkilendirmesi** (D27) | Aktif sızıntı, diğerlerinden bağımsız kapatılabilir |
   | 3 | **`islemler` görünürlük matrisi** (§2.1, D5) | En çok kullanıcıyı etkileyen; 1'e bağımlı |
   | 4 | **Çekirdek modül zorlamasının kaldırılması** (D1-D4) | 3'ten sonra anlamlı |
   | 5 | **Cache temizliği garantisi** (D28) | 3-4 canlıya çıkmadan **önce** olmalı, yoksa eski veri ekranda kalır |
   | 6 | Dashboard/rapor kapıları (D7-D12, D25) | Bağımsız |
   | 7 | Ekstre linki (K12, D15) | Bağımsız |
   | 8 | Pasif/arşiv kuralı (D21, D16) | Bağımsız |
   | 9 | Kategori owner-only (D22) · UI temizlikleri (D17, D18, D23, D26) | Düşük risk, sona |
   | 10 | K9 backfill (D19) | **Ayrı veri-yazma onayı** ister |

3. Her paket: değişiklik → test matrisinin ilgili satırları (**on bir yüzey**) → kullanıcı onayı.

### İşin boyutu — dürüst beyan

Bu, başlangıçta düşünülenden **büyük** bir iş. Sebebi üç madde:

- **§2.5** — yalnız RLS yazmak yetmiyor, yeni veri uçları tasarlanmalı
- **D27** — Storage ayrı bir yetkilendirme katmanı istiyor
- **D28** — cache temizliği olmadan sunucu kısıtı ekranda görünmeyebilir

Bu üçü kapanmadan yalnız RLS tip filtresi yazmak **sahte bir güven duygusu** üretir.
