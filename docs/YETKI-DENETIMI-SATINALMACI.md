# Yetki Denetimi — "Satın Almacı" senaryosu

**Tarih:** 26 Temmuz 2026 · **Baz commit:** `16d894f`

**Senaryo:** Cariler + Ürünler + Fatura işleme AÇIK; Raporlar, Personel maaşları,
Hesap bakiyeleri KAPALI olmalı.

**Sonuç:** 9 yüzey tarandı → 63 ham bulgu → **39 onaylı** (13 yüksek / 14 orta /
12 düşük), 15 çürütüldü, 9 yüzey temiz çıktı.

> ### ⚠️ DOĞRULAMA EKSİK — 39'un 17'si şüpheci turdan GEÇMEDİ
>
> Denetim sırasında oturum limiti doldu ve **3 ajan öldü**: `cari-urun-detay` ve
> `navigasyon` yüzeylerinin **doğrulayıcıları**, bir de sentez ajanı (raporu bu yüzden
> elle yazdım). Karar üretilmeyen bulgular çıkarma sırasında otomatik "onaylı" sayıldı.
>
> **Gerçek durum: 22 doğrulanmış · 17 doğrulanmamış** (2'si YÜKSEK).
>
> Doğrulanmamış 17'nin tamamı şu iki yüzeyden: cari/ürün detay ekranları ve
> navigasyon (Daha menüsü, sekmeler, rota koruması).
>
> **Ana oturumda elle teyit edilenler** (bunlar sağlam):
> - Ana Sayfa Gelir/Gider kartı koşulsuz — `index.tsx:225` okundu, doğru ✓
> - `Daha → Arşiv` izne bağlı değil — `daha.tsx:317` `router.push('/arsiv')`, kontrol yok ✓
> - Arşiv ekranında sayfa koruması yok — `arsiv/index.tsx` içinde `usePagePermission` **0 kez** ✓
>
> Kalan 14 doğrulanmamış bulgu (çoğu düşük şiddet) **uygulamadan önce tek tek
> kodda teyit edilmeli.** Bu, [[denetim-bulgusu-once-kod-teyidi]] kuralının aynısı.

**Kısa cevap: HAYIR, şu anki modelle satın almacı görmemesi gerekeni görür.**
Ama tek tek yamalanacak 39 ayrı hata değil — altta **iki kök neden** var.

---

## KÖK NEDEN 1 — `islemler` modülü özel rolde zorla açık, RLS işlem TİPİNE bakmıyor

`islemler` tablosunun okuma politikası yalnız `modules.islemler` bayrağına bakıyor;
işlemin TİPİNE bakmıyor. Ve `islemler` modülü her özel rolde açık geliyor — sahip
izin ekranında "İşlemler" diye bir kapatma anahtarı **göremiyor** bile.

Sonuç: personelin maaş ödemesi, hesaplar arası transfer, hesaba giren/çıkan para —
**hepsi ham olarak satın almacının cihazına iniyor** (tutar, tarih, açıklama,
personel_id, hesap_id dahil). Arayüzde gizlense bile veri orada.

Bu tek kök neden şu dört yüzeyde birden yüzeye çıkıyor:

| Nerede görür | Ne görür |
|---|---|
| **Daha → Tüm İşlemler** | Personel maaş ödemeleri tutarıyla listede; üstelik hazır **"Personel" filtre çipi** var |
| **Global arama** | Hiçbir şey yazmadan personel maaş/ödeme işlemleri tutarıyla listeleniyor |
| **Bildirim çanı** (her sayfada) | İleri tarihli personel ödemeleri ve hesap işlemleri tutar + açıklamayla |
| **İşlem satırı** | Personel izin kayıtları gün cinsinden basılıyor |

**Çözüm:** `islemler` okuma politikasına **tip kapısı** eklenmeli (ek olarak, mevcut
sahip politikasına dokunmadan): `personel_*` tipleri `modules.personel` isterse,
`transfer` tipi `modules.hesaplar` isterse — o zaman RLS veriyi cihaza hiç göndermez.
Ayrıca izin ekranına "İşlemler" anahtarı eklenmeli.

---

## KÖK NEDEN 2 — Ana Sayfa hiçbir modüle bağlı değil

Ana Sayfa sekmesi izinden bağımsız açılıyor ve üstündeki **Gelir/Gider kartı**
bulunduğu ayın **net kâr/zararını** büyük puntoyla basıyor. O rakamın içinde
`personel_gider` (maaş/prim) ve `gider` (hesaptan çıkan para) var.

Yani satın almacı uygulamayı açar açmaz, bir kez sağa kaydırınca işletmenin aylık
kârını ve gider büyüklüğünü okuyor. Kartın **etrafında izin kontrolü yok**; kontrol
yalnız karta **basınca** devreye giriyor — ama rakamlar zaten kartın üstünde yazılı.

⚠️ **Bu benim ÖNCE-0 migration'ımda bilerek açık bıraktığım yer.** `get_income_expense_summary`'ye
"raporlar" kapısı eklemedim, çünkü eklersem raporlar yetkisi olmayan ortak Ana Sayfa'da
özeti `0,00` görecekti. Doğru çözüm iki katmanı **birlikte** kapatmak:
kartı `raporlar` iznine bağla **ve** RPC'ye kapıyı ekle. Tek başına hiçbiri yetmiyor —
sadece RPC kapatılırsa kart `0,00` gösterip yanıltır, sadece kart gizlenirse RPC
doğrudan çağrılabilir.

Aynı sayfada ayrıca: **Nakit Akışı kartı** toplam para giriş/çıkışını gösteriyor.

---

## ⚠️ KAPSAM DIŞI ÇIKAN AYRI SORUN — yetkisiz SİLME fonksiyonu

Denetim sırasında rapor RPC'leriyle ilgisi olmayan bir şey çıktı ve **daha ciddi**,
çünkü okuma değil **yazma/silme**:

`undo_import_batch` — `SECURITY DEFINER`, **hiçbir erişim kontrolü yok** (dosyada
`auth.uid()`, `isletme_users`, `user_has_*` geçişi **sıfır** — teyit edildi), `REVOKE`
de almamış. İşlem kimliği dizisi alıp o işlemleri **siliyor** ve hesap/cari/personel
bakiyelerini geri alıyor.

Yani yalnızca görme yetkisi olan bir ortak bile, elindeki işlem kimlikleriyle
kayıt silebilir ve bakiye bozabilir. Uygulama bunu `useImportHistory.ts:361`'den
çağırıyor, yani canlı.

`perform_nakit_avans` de aynı durumda (kontrol yok, REVOKE yok) — özelliği
uygulamadan kaldırılmış ama fonksiyon veritabanında duruyor.

> Not: `increment_balance` ilk taramada "kontrolsüz" işaretlenmişti, **yanlış** —
> kontrol `EXECUTE format()` string'inin içinde olduğu için aramada görünmüyor.
> Üyelik kontrolü var (modül izni yok, ama üyelik var).

---

## +EKLE butonu — sorduğun soru

**Bu kısım DOĞRU çalışıyor.** `AddEntityButton` dört satırın her birini
`canCreate(modül)` ile ayrı ayrı süzüyor; hiç create izni yoksa buton tamamen
gizleniyor. Satın almacı yalnız **Cari** ve **Ürün** satırlarını görür — istediğin gibi.

Ama **FAB menüleri** (sağ alttaki yuvarlak +) aynı özeni göstermiyor: Ana Sayfa'daki
FAB'da **"Günlük Nakit Girişi"** satırı hesaplar izni kapalıyken de görünüyor.
Basınca boş bir modal açılıyor ve "Hesap Ekle" düğmesi çıkıyor; ona basınca
"izin yok" uyarısıyla geri atılıyor. Veri sızmıyor, ama çıkmaz bir yol.

---

## QTB (fatura işleme) — kullanılabilirlik uyarısı

İşlem tipi sekmeleri ve ödeme/tahsilat hedef seçenekleri **modüle göre hiç
filtrelenmiyor**. Satın almacı QTB'de "Personel Ödemesi" veya "Transfer" sekmesini
görüyor. Seçerse listeler RLS yüzünden boş gelir — yani veri sızmaz, ama kafa karıştırır.

---

## Güvenli çıkan yerler

- **+EKLE butonu** — modül bazlı doğru süzülüyor
- **Sayfa koruması olan ekranlar** — `hesaplar/ekle`, `urunler/[id]` gibi ekranlarda
  `usePagePermission` var, deep-link'te "izin yok" verip geri atıyor
- **Yazma tarafı RLS** — kapalı modülde INSERT engelleniyor
  (`lib/permissions.ts` kapalı modüle actions girdisi hiç yazmıyor)
- **Rapor RPC'lerinin ikisi** — kategori ve ürün raporlarına modül kapısı eklendi
  (`20260726000000`, henüz uygulanmadı)

---

## Önerilen yetki ayarı (satın almacı)

| Modül | Ayar | Not |
|---|---|---|
| cariler | ✅ açık | |
| urunler | ✅ açık | |
| islemler | ✅ açık | **zorunlu** — fatura işlemek için; ama tip kapısı gelene kadar maaş kayıtları da görünür |
| hesaplar | ❌ kapalı | |
| personel | ❌ kapalı | |
| raporlar | ❌ kapalı | |
| kategoriler | ❌ kapalı | fatura girerken kategori seçmesi gerekiyorsa açık olmalı — test et |
| arsiv | ❌ kapalı | |
| ayarlar | ❌ kapalı | |
| notlar / birikim | — | flag yoksa **varsayılan AÇIK**; kapatmak için açıkça `false` yaz |
| **level** | `add` | ekleyebilir, düzenleyemez/silemez |

---

## Riskli değişiklikler (mevcut kullanıcıları etkileyebilir)

| Değişiklik | Risk |
|---|---|
| `islemler` RLS'ine tip kapısı | **Yüksek.** Şu an personel modülü kapalı olan mevcut ortaklar maaş kayıtlarını görüyor olabilir; kapı gelince göremeyecekler. Doğru olan bu ama görünür bir değişiklik |
| Ana Sayfa Gelir/Gider kartını gizlemek | **Orta.** Raporlar yetkisi olmayan ortağın ana sayfasında bir kart kaybolur |
| `undo_import_batch`'e guard | **Düşük.** Meşru kullanıcı etkilenmez; yalnız yetkisiz çağrı engellenir |
| İzin ekranına "İşlemler" anahtarı | **Düşük.** Yeni anahtar varsayılan açık gelirse mevcut kimse etkilenmez |
