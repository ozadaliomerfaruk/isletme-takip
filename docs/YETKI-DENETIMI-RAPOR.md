# Yetki Sistemi Güvenlik Denetimi — Bulgu Raporu

**Uygulama:** React Native + Expo + Supabase (PostgreSQL) ile yazılmış Türkçe bir
işletme/muhasebe takip uygulaması. Çok kullanıcılı: işletme sahibi, ortaklarını
davet edip modül bazlı yetki veriyor.

**Denetim tarihi:** 26 Temmuz 2026 · **Baz commit:** `16d894f`

**Yöntem:** 9 yüzey paralel tarandı (9 ajan), her bulgu kümesi ayrı bir şüpheci
doğrulayıcıdan geçirildi, sonra ana oturumda örneklem teyidi yapıldı.
54 ham bulgu → **26 onaylı** (13 yüksek / 10 orta / 3 düşük), 28 çürütüldü.

---

## 1. DENETLENEN SENARYO

İşletme sahibinin gerçek ihtiyacı — bir **"satın almacı"** çalışan:

**Yapabilmeli:** carileri ve ürünleri görmek/eklemek, fatura işlemek (cari alış/satış).
**Görmemeli:** raporlar, personel maaşları, hesap bakiyeleri.

---

## 2. YETKİ MODELİ (bulguları anlamak için şart)

İzinler `isletme_users.permissions` adlı bir JSONB kolonunda tutuluyor:

```jsonc
{
  "modules": {            // modül bazlı aç/kapa
    "dashboard": true, "hesaplar": false, "cariler": true, "personel": false,
    "islemler": true, "kategoriler": true, "raporlar": false, "urunler": true,
    "notlar": true, "birikim": true, "arsiv": false, "ayarlar": false,
    "ileri_tarihli": true
  },
  "level": "add",         // TEK global seviye: view | add | edit_own | edit_all
  "actions": { /* modül başına türetilmiş CRUD bayrakları */ },
  "visibility": {
    "can_see_passive": true,
    "can_see_archived": true,
    "can_see_all_users_data": true
  }
}
```

**İki savunma katmanı var:**
1. **İstemci (UI):** `usePermissions()` → `canAccessModule` / `canCreate` / `canUpdate` / `canDelete`
2. **Sunucu (RLS):** her tablonun SELECT/INSERT politikası ilgili `modules.X` bayrağını okuyor

Ayrıca **`SECURITY DEFINER`** işaretli saklı yordamlar (RPC) var — bunlar RLS'i
**baypas ediyor**, kendi içlerinde kontrol yapmazlarsa açık kalıyorlar.

---

## 3. İKİ YAPISAL KÖK NEDEN

Bulguların çoğu bağımsız hata değil; şu iki tasarım kararından türüyor.

### KÖK NEDEN A — Bazı modüller kapatılamıyor (zorla açık)

`src/lib/permissions.ts:32-39`:

```ts
const CORE_MODULES: ModuleName[] = ['islemler', 'kategoriler', 'ileri_tarihli'];

export function buildPermissions(modules, level) {
  const m = { ...modules, dashboard: true };
  CORE_MODULES.forEach((k) => { m[k] = true; });
  ...
}
```

İzin ekranında ne işaretlenirse işaretlensin, kayıt sırasında **`islemler`,
`kategoriler`, `ileri_tarihli` ve `dashboard` zorla `true` yapılıyor.**

Sonuçları:
- `islemler` modülü **hiçbir ortakta kapatılamıyor** → işlem defteri herkese açık
- Sahip izin ekranında "İşlemler" diye bir anahtar **göremiyor** bile
- Senaryodaki "kategoriler kapalı" ayarı **mevcut kodda üretilemiyor**
- Ana Sayfa (`dashboard`) hiçbir ortaktan gizlenemiyor

Bu yüzden aşağıdaki sızıntılar **tek bir personaya özgü değil — kısıtlı yetkiyle
eklenen HER ortağı** etkiliyor.

### KÖK NEDEN B — `islemler` RLS'i işlem TİPİNE bakmıyor

`islemler` tablosunun okuma politikası (`20260224000002_multi_user_rls_policies.sql:47-48`):

```sql
AND COALESCE((iu.permissions->'modules'->>'islemler')::boolean, false)
AND (COALESCE((iu.permissions->'visibility'->>'can_see_all_users_data')::boolean, false)
     OR islemler.created_by = auth.uid())
```

Yalnız `modules.islemler` bayrağına bakıyor; **işlemin tipine bakmıyor.**
Dolayısıyla `personel_gider` (maaş), `personel_odeme`, `transfer` (hesaplar arası),
`gelir`, `gider` — hepsi ortağın cihazına **ham olarak iniyor** (tutar, tarih,
açıklama, `personel_id`, `hesap_id` dahil).

İkinci satır durumu ağırlaştırıyor: `src/lib/permissions.ts:56`

```ts
visibility: { can_see_passive: true, can_see_archived: true, can_see_all_users_data: true }
```

`can_see_all_users_data` **her izin setinde sabit `true`** yazılıyor. Bu `false`
olsaydı ortak yalnız kendi girdiği kayıtları görürdü ve sızıntının büyük kısmı
kendiliğinden kapanırdı.

---

## 4. NELERİN ÇÜRÜDÜĞÜ DE ÖNEMLİ (28 bulgu)

54 ham bulgunun 28'i çürütüldü ve **neredeyse hepsinin sebebi aynı: RLS gerçekten
iş görüyor.** "İzin kontrolü yok", "sayfa koruması yok" diye işaretlenen yerlerde
veri veritabanından zaten boş dönüyor.

Çürüyen tipik örnekler — bunlar **sorun değil**:
- Arşiv menüsü kapısız ama `hesaplar`/`personel` RLS ile boş → ekranda satır yok
- `hesaplar/[id]` ve `personel/[id]` sayfa koruması yok ama veri `null` → "bulunamadı" ekranı
- Cari detayında hesap adı basılıyor ama join `null` dönüyor
- Excel çıktısındaki "Hesap" kolonu boş üretiliyor
- "Personele ata" seçicisi açılıyor ama liste boş
- Ürün kâr/zarar özeti: gösterdiği sayı zaten meşru görülen satırların toplamı

**Bu kod tabanında RLS, UI'dan daha güvenilir bir savunma katmanı.** Bulguları
"izin kontrolü var mı" diye değil, **"veri fiilen ekrana geliyor mu"** diye
değerlendirmek gerekiyor.

---

## 5. ONAYLI BULGULAR (26)

Sıralama: YÜKSEK → ORTA → DÜŞÜK.

---

### GA-01 — Global aramada personel maaş/ödeme işlemleri TUTARIYLA görünüyor (metin bile yazmadan)

**Şiddet:** YUKSEK · **Tür:** UI_SIZINTI

**NE GÖRÜR / NE YAPABİLİR ·** İşlemler bölümünde `personel_gider` (Personel Gideri = maaş) ve `personel_odeme` satırları; her satırda TARİH + (varsa) kategori adı (ör. 'MAAŞ') + alt satırda kısa tip ('Gider'/'Ödeme') + işlem AÇIKLAMASI (uygulamada maaş açıklamalarına personel adı yazılıyor) + sağda KIRMIZI renkte TAM TUTAR (formatCurrency). Personel adı embed'i RLS ile null döndüğü için ad alanı boş kalır ama tutar+açıklama tam görünür.

**NASIL ULAŞIR ·** Ana sekme (index) her personada açık; header'daki arama ikonu (src/app/(tabs)/index.tsx:645) → /arama → sağ üstteki filtre (SlidersHorizontal, arama.tsx:734-741) → 'Tarih Aralığı'ndan başlangıç/bitiş seç (ARAMA KUTUSUNA HİÇBİR ŞEY YAZMADAN) → sorgu `hasAnyFilter` ile tetiklenir (src/hooks/useIslemler.ts:939, 985) ve işletmenin EN SON 50 işlemi listelenir. Alternatif: 'Tutar Aralığı'na min tutar girip yüksek tutarlı (maaş) kayıtları avlamak, ya da personel adını yazıp açıklamada eşleşen maaş kaydını bulmak (ilike description, useIslemler.ts:959-962).

**NEREDE ·** `src/app/arama.tsx:196-204, 334-344, 492-496, 630-634`

**KANIT ·** 1) Sorguda tip filtresi YOK: src/hooks/useIslemler.ts:946-980 — `from('islemler').select('*, personel:personel(...)')` yalnız isletme_id + metin/tutar/tarih filtresi uygular, `personel_*` tiplerini dışlamaz. 2) Bölüm oluşturma tip ayıklaması yapmaz: src/app/arama.tsx:334-344 `islemResults` olduğu gibi 'İşlemler' bölümüne dökülür. 3) Tutar ekrana basılır: src/app/arama.tsx:492-496 `formatCurrency(item.data.amount, ...)`, render src/app/arama.tsx:630-634. 4) RLS DURDURMUYOR: supabase/migrations/20260224000002_multi_user_rls_policies.sql:44-50 — 'Shared select islemler' yalnız `modules.islemler` + `visibility.can_see_all_users_data` şartı arar; işlemin personel_id taşıyıp taşımadığına BAKMAZ. 5) Persona bu iki şartı zorunlu olarak sağlar: src/lib/permissions.ts:32,38-39 `CORE_MODULES` islemler'i HER izinde true yapar; src/lib/permissions.ts:56 `visibility.can_see_all_users_data` HER izinde true yazılır (sahip kapatamaz). 6) Ekranda hiç izin kontrolü yok: src/app/arama.tsx içinde `usePermissions`/`canAccessModule` çağrısı SIFIR.

**ÖNERİ ·** İki katman: (a) İstemci — useFilteredIslemler'e modül-farkındalıklı tip filtresi ekle: `canAccessModule('personel')` false ise `.not('type','in','(personel_gider,personel_odeme,personel_tahsilat,personel_satis,personel_izin_hakki,personel_izin_kullanimi)')` (tipler src/constants/islemTypes.ts:81-83, 69). Aynı şekilde hesaplar kapalıysa transfer/hesap-bağlı satırları kırp. (b) Sunucu — 'Shared select islemler' politikasına `AND (islemler.personel_id IS NULL OR COALESCE((iu.permissions->'modules'->>'personel')::boolean,false))` koşulu ekle; asıl kapanış burada, istemci filtresi tek başına yetmez.

---

### ISL-01 — İşlemler listesi tip-körü: personel maaş/gider ödemeleri tutarıyla birlikte listede görünüyor

**Şiddet:** YUKSEK · **Tür:** UI_SIZINTI

**NE GÖRÜR / NE YAPABİLİR ·** Persona (personel=false, hesaplar=false) İşlemler sekmesini açtığında işletmenin TÜM işlem tipleri tek akışta listelenir: 'PERSONEL GİDERİ' (=maaş/prim gideri), 'PERSONEL ÖDEMESİ', 'TRANSFER', 'GELİR', 'GİDER'. Her satırda tür etiketi + kategori + serbest not + TUTAR basılır. Yani maaş ödemelerinin tutarları ve tarihleri, bir arada aylık personel gider toplamı çıkarılabilecek şekilde görünür.

**NASIL ULAŞIR ·** Uygulamayı aç → İşlemler listesi (Defter) → sayfa açılır açılmaz tüm işlem tipleri karışık akışta gelir; aşağı kaydır / 'Daha Fazla Göster' ile tüm geçmiş sayfalanabilir.

**NEREDE ·** `src/hooks/useIslemler.ts:44-58 · src/app/islemler/index.tsx:247-279 · src/components/ui/TransactionRow.tsx:276-278`

**KANIT ·** useIslemler.ts:44-58 sorgusu YALNIZCA `.eq('isletme_id', isletme.id)` uygular; hiçbir `type` kısıtı yoktur (filters?.type opsiyoneldir ve index.tsx:189 `useIslemler()` parametresiz çağırır). index.tsx:252 `let matchesFilter = filter === 'all';` — varsayılan filtre 'all' olduğu için istemcide de eleme yoktur. TransactionRow.tsx:276-278 `{prefix}{formattedAmount}` tutarı koşulsuz basar; index.tsx:130-148'de TransactionRow'a `amount`, `typeLabel=t('transactions:types.'+islem.type)` ve `tertiaryText=islem.description` koşulsuz geçilir. i18n karşılığı: src/i18n/locales/tr/transactions.json:17 'personel_gider': 'Personel Gideri'. Dosyada tek bir `canAccessModule('personel')`/`canAccessModule('hesaplar')` çağrısı yoktur (src/app/islemler/index.tsx içinde usePermissions'tan yalnız `canDelete` alınır — index.tsx:169).

**ÖNERİ ·** İşlem listesini izne göre tip-filtreli çek: `canAccessModule('personel')` false ise `useIslemler`'e PERSONEL_ISLEM_TYPES + LEAVE_TYPES hariç tutan bir `.not('type','in',...)` kısıtı, `canAccessModule('hesaplar')` false ise 'transfer' hariç tutma ekle. Kalıcı çözüm ISL-02'deki RLS tarafında (istemci filtresi tek başına yeterli değil).

---

### ISL-02 — RLS kök nedeni: islemler SELECT politikası yalnız modules.islemler'e bakıyor ve 'islemler' modülü her özel rolde ZORLA açık

**Şiddet:** YUKSEK · **Tür:** SORGU_INIYOR

**NE GÖRÜR / NE YAPABİLİR ·** Persona'nın cihazına, personel_gider / personel_odeme / personel_izin_* / transfer / gelir / gider dahil işletmedeki HER işlem satırı ham olarak iner (amount, date, description, personel_id, hesap_id, hedef_hesap_id kolonları dahil). UI'da bir gizleme yapılsa bile veri cihazdadır. Dahası: sahip 'Özel Rol' ekranında 'İşlemler' diye bir kapatma anahtarı GÖREMEZ — modül her koşulda true'ya zorlanır, yani bu erişim izin ekranından kapatılamaz.

**NASIL ULAŞIR ·** Sahip → Ayarlar → Kullanıcılar → Özel Rol ver (hesaplar/personel/raporlar kapalı) → davetli giriş yapar → İşlemler listesi tüm satırlarla dolar. İzin ekranında 'İşlemler' toggle'ı yoktur, kapatılamaz.

**NEREDE ·** `supabase/migrations/20260224000002_multi_user_rls_policies.sql:43-50 · src/lib/permissions.ts:32,39 · src/components/multiUser/PermissionEditor.tsx:27-55`

**KANIT ·** 20260224000002_multi_user_rls_policies.sql:44-50 — `CREATE POLICY "Shared select islemler" ... AND COALESCE((iu.permissions->'modules'->>'islemler')::boolean, false) AND (can_see_all_users_data OR islemler.created_by = auth.uid())`; işlem TİPİNE dair hiçbir koşul yok (karşılaştır: aynı dosyada hesaplar:76-84 ve personel:145-154 politikaları kendi modül flag'leriyle korunur). permissions.ts:32 `const CORE_MODULES: ModuleName[] = ['islemler','kategoriler','ileri_tarihli'];` ve :39 `CORE_MODULES.forEach((k) => { m[k] = true; });` → buildPermissions HER çağrıda islemler=true yazar; permissions.ts:56 `visibility: { ... can_see_all_users_data: true }` da RLS'in ikinci kolunu tamamen açar. PermissionEditor.tsx:27-55 MODULE_GROUPS listesinde 'islemler' yoktur (yorum satırı :15-16 ve :62-63 bunu 'çekirdek modül, gösterilmez' diye açıkça belirtir).

**ÖNERİ ·** islemler SELECT politikasına tip-kapısı ekle (additif, owner politikası dokunulmadan): `AND (islemler.type NOT LIKE 'personel\_%' OR COALESCE((iu.permissions->'modules'->>'personel')::boolean,false)) AND (islemler.type <> 'transfer' OR COALESCE((iu.permissions->'modules'->>'hesaplar')::boolean,false))`. Aynı desen 20260615020000_rls_4b_birikim_hesaplar.sql'de birikim için zaten kullanılmış — birebir örnek alınabilir.

---

### GLB-01 — Bildirim çanı: personel ödemesi ve hesap işlemlerinin TUTARI + açıklaması ana ekranda görünüyor

**Şiddet:** YUKSEK · **Tür:** UI_SIZINTI

**NE GÖRÜR / NE YAPABİLİR ·** Satın almacı ana ekranın sağ üstündeki çana basınca İŞLETMENİN TÜM bekleyen ileri-tarihli işlemlerini görür — personel ödemeleri ve hesaplar arası transferler dahil. RLS join'leri boşalttığı için isim (personel adı / hesap adı) GELMEZ, ama satırda şunlar görünür: işlem tipi etiketi ("Personel Ödemesi", "Transfer", "Gider"), serbest metin AÇIKLAMA (pratikte "Temmuz maaşı Ahmet" gibi), kategori adı, TUTAR ve vade tarihi. Ayrıca çanın üstündeki rozet bu kalemlerin sayısını, "!" göstergesi de vadesi gelmiş olanları ele veriyor. Yani "maaş görmemeli / hesaplardaki parayı görmemeli" kuralı fiilen deliniyor: -₺45.000 PERSONEL ÖDEMESİ satırı ekranda.

**NASIL ULAŞIR ·** Uygulamayı aç → Ana sekme (Ev) her zaman görünür (PersistentTabBar.tsx:28'de home sekmesinin `module` alanı YOK, ayrıca permissions.ts:38 dashboard'u zorla true yapıyor) → sağ üstteki çan ikonuna bas → açılan liste.

**NEREDE ·** `src/components/ui/NotificationBell.tsx:51, :211-229, :278-316 (özellikle :299, :304, :310) · src/hooks/useIleriTarihliIslemler.ts:41-73 · src/app/(tabs)/index.tsx:648`

**KANIT ·** NotificationBell.tsx:51 `useIleriTarihliIslemler()` KOŞULSUZ çağrılıyor, dosyada `usePermissions` importu bile yok. useIleriTarihliIslemler.ts:49-61 sorgusu yalnız `.eq('isletme_id', ...)` + status filtresi uyguluyor, modül filtresi yok. Render: :299 `{entityText || typeLabel}` (isim yoksa "Personel Ödemesi" yazar), :304 `islem.description ... + kategori`, :309-311 `{prefix}{formatCurrency(Math.abs(islem.amount), islem.hesap?.currency)}`. Sunucu bunu DURDURMUYOR: supabase/migrations/20260615050000_rls_24_ileri_tarihli_visibility.sql:14-21 politikası `modules->>'ileri_tarihli'` true ise satırı veriyor ve src/lib/permissions.ts:32+39 bu bayrağı HER özel rolde zorla true yapıyor; ayrıca permissions.ts:56 `can_see_all_users_data: true` → sahibin oluşturduğu kayıtlar da geliyor. Yalnızca embed'ler kesiliyor (personel RLS: 20260224000002_multi_user_rls_policies.sql:146-154, hesaplar RLS: 20260615020000_rls_4b_birikim_hesaplar.sql:22-36) — tutar ise ileri_tarihli satırının kendi kolonu, RLS'ten geçiyor.

**ÖNERİ ·** NotificationBell'de listeyi modüle göre SÜZ: `hesap_id`/`hedef_hesap_id` olan kalemler `canAccessModule('hesaplar')`, `personel_id` olanlar `canAccessModule('personel')` gerektirsin; hiçbiri kalmıyorsa çanı (rozet dahil) hiç çizme. Kalıcı çözüm sunucuda: `Shared select ileri_tarihli` politikasına satırın işaret ettiği modülün iznini de ekle (personel_id IS NULL OR modules->>'personel', hesap_id IS NULL OR modules->>'hesaplar').

---

### GLB-04 — KÖK NEDEN: özel rolde 'ileri_tarihli' modülü zorla açık ve izin editöründe kapatma anahtarı yok

**Şiddet:** YUKSEK · **Tür:** DOLAYLI

**NE GÖRÜR / NE YAPABİLİR ·** İşletme sahibi satın almacı için "Özel Rol"de Hesaplar ve Personel anahtarlarını KAPATSA bile, kaydedilen izin JSON'ında `ileri_tarihli: true` (ve `dashboard: true`) yazılıyor. Sahip bunu ekranda göremiyor çünkü editörde böyle bir satır yok. Sonuç: ileri-tarihli tablosunun RLS kapısı açık kalıyor ve GLB-01'deki personel/hesap kalemleri sunucudan geliyor — yani "UI süzer" varsayımının altındaki tek savunma hattı da yok.

**NASIL ULAŞIR ·** Ayarlar → Davet Oluştur / Kullanıcı Düzenle → "Özel Rol" → yalnız Cariler + Ürünler açık bırakılır, seviye "Ekleyebilir" → kaydet. Oluşan permissions.modules içinde islemler/kategoriler/ileri_tarihli/dashboard otomatik true olur.

**NEREDE ·** `src/lib/permissions.ts:32, :38-39 · src/components/multiUser/PermissionEditor.tsx:28-55, :71`

**KANIT ·** permissions.ts:32 `const CORE_MODULES: ModuleName[] = ['islemler', 'kategoriler', 'ileri_tarihli'];` ve :38-39 `const m = { ...modules, dashboard: true }; CORE_MODULES.forEach((k) => { m[k] = true; });`. PermissionEditor.tsx:28-55 MODULE_GROUPS listesinde ileri_tarihli YOK (yalnız hesaplar/birikim/cariler/urunler/personel/raporlar/notlar), :71 her toggle değişiminde `buildPermissions(next, level)` çağırıyor → bayrak her kayıtta yeniden true yazılıyor. Bu bayrak doğrudan 20260615050000_rls_24_ileri_tarihli_visibility.sql:19'daki `COALESCE((iu.permissions->'modules'->>'ileri_tarihli')::boolean, false)` koşulunu geçiriyor.

**ÖNERİ ·** İki seçenekten biri: (a) ileri_tarihli'yi CORE_MODULES'tan çıkarıp editöre görünür bir anahtar olarak ekle; (b) çekirdek kalsın ama ileri_tarihli RLS politikası satırın işaret ettiği modülü de sorsun (personel_id/hesap_id bazlı), böylece "çekirdek" olması personel-maaş satırını görmeyi getirmesin. (b) mevcut kullanıcıların akışını bozmadığı için tercih edilir.

---

### AS-01 — Gelir/Gider kartı işletmenin tüm aylık kâr/zararını (personel maaş gideri dahil) raporlar-kapalı kullanıcıya basıyor

**Şiddet:** YUKSEK · **Tür:** UI_SIZINTI

**NE GÖRÜR / NE YAPABİLİR ·** Ana Sayfa karuselinin 2. kartında büyük punto NET KÂR/ZARAR rakamı, altında GELİR ve GİDER tutarları — bulunduğu ayın TÜM işletme toplamı. GİDER içinde 'gider' (hesaptan doğrudan çıkan gider) ve 'personel_gider' (personel maaş/prim gideri) var; GELİR içinde 'gelir' (hesaba doğrudan gelen gelir) ve 'personel_satis' var. Yani persona hem hesap hareketlerinin hem personel maaş giderinin aylık büyüklüğünü tek bakışta okuyor. Bu tam olarak 'Raporlar (hiçbiri)' yasağının içeriği.

**NASIL ULAŞIR ·** Uygulamayı aç → Ana Sayfa zaten açılışta gelir → üstteki kart karuselinde bir kez sağa kaydır → 'GELİR/GİDER' kartı. Hiçbir izin uyarısı çıkmaz; kart koşulsuz render ediliyor. (Karta BASINCA raporlar guard'ı devreye giriyor ama rakamlar zaten kartın üstünde yazılı.)

**NEREDE ·** `src/app/(tabs)/index.tsx:225 (+250-251, 449-450)`

**KANIT ·** index.tsx:225 `const { data: monthSummary, refetch: refetchSummary } = useMonthSummary('monthly', 0);` — koşulsuz. index.tsx:250-251 `const totalIncome = monthSummary?.income ?? 0; const totalExpense = monthSummary?.expense ?? 0;`. index.tsx:449-450 `income={totalIncome} expense={totalExpense}` → DashboardCarousel.tsx:92-99 → IncomeExpenseCard.tsx:57-67 (netProfit) ve :86,:98 `formatCurrency(income)`/`formatCurrency(expense)`. Kartın etrafında canAccessModule YOK; guard yalnız onIncomeExpensePress içinde (index.tsx:452-455). Veri kaynağı: useIslemler.ts:830 `supabase.rpc('get_income_expense_summary', ...)`. Bu RPC SECURITY DEFINER, RLS'i BAYPAS ediyor ve modül kapısı YOK — supabase/migrations/20260726000000_rapor_rpc_erisim_guard.sql:60-61 `-- GUVENLIK: yalniz kendi isletmesinin verisi. MODUL KAPISI BILEREK YOK` + tek guard `IF NOT public.user_has_isletme_access(p_isletme_id) THEN RETURN; END IF;`. user_has_isletme_access (20260224000000_multi_user_tables.sql:91-93) aktif ÜYE için true döner → persona tam sonucu alır. Kardeş RPC'lerin hepsine kapı eklenmiş (20260716040000:35,99,147,209 ve 20260726000000:111,250), yalnız bu biri bilerek dışarıda bırakılmış; migration'ın kendi notu bunu yazıyor (satır 36-44: 'Modul kapisi eklenseydi ... Ana Sayfa'da aylik ozeti 0,00 gorurdu ... AYRI bir urun karari olarak degerlendirilmelidir'). Gider bileşimi: src/constants/islemTypes.ts:25 `EXPENSE_TYPES = ['gider','cari_alis','personel_gider']`, :15 `INCOME_TYPES = ['gelir','cari_satis','personel_satis']`.

**ÖNERİ ·** İki katmanı birden kapat: (1) index.tsx'te IncomeExpenseCard'ı (ve altındaki useMonthSummary çağrısını `enabled: canAccessModule('raporlar')` ile) raporlar iznine bağla — kartı karuselden çıkar, CARD_COUNT'u dinamikleştir (DashboardCarousel.tsx:33 sabit 3). (2) get_income_expense_summary'ye `IF NOT public.user_has_module_access(p_isletme_id,'raporlar') THEN RETURN; END IF;` ekle. Sunucu kapısı tek başına yetmez çünkü kart o zaman ₺0,00 gösterip yanıltır; UI kapısı tek başına yetmez çünkü RPC doğrudan PostgREST ile çağrılabilir. Ana sayfada ciro göstermek isteniyorsa yalnız cari_satis/cari_alis kırılımı dönen ayrı bir RPC yazılmalı.

---

### DB-01 — get_income_expense_summary'de 'raporlar' modül kapısı BİLEREK yok — işletmenin aylık gelir/gider toplamı satın almacının Ana Sayfa'sında görünüyor

**Şiddet:** YUKSEK · **Tür:** UI_SIZINTI

**NE GÖRÜR / NE YAPABİLİR ·** Ana Sayfa'daki DashboardCarousel'in Gelir/Gider kartında işletmenin O AYKİ TOPLAM GELİRİ ve TOPLAM GİDERİ rakam olarak görünür. Bu, 'raporlar' modülü kapalı olmasına rağmen tam bir rapor sayısıdır. Ayrıca RPC'nin ham dönüşü tip kırılımlıdır (gelir, gider, cari_odeme, personel_odeme, personel_gider, transfer...) — yani cihaza inen JSON'da PERSONEL ÖDEMELERİ (maaş) toplamı da ayrı satır olarak yer alır; hook bunu toplasa da veri cihazdadır ve doğrudan API çağrısıyla kırılım halinde okunabilir.

**NASIL ULAŞIR ·** Uygulamayı aç → Ana Sayfa (hiçbir gezinme gerekmez, kart ilk ekranda). Kırılım için: aynı JWT ile POST /rest/v1/rpc/get_income_expense_summary {p_isletme_id, p_start_date, p_end_date}.

**NEREDE ·** `supabase/migrations/20260726000000_rapor_rpc_erisim_guard.sql:60-61 (guard); src/hooks/useIslemler.ts:830 (çağrı); src/app/(tabs)/index.tsx:225,449-450 (render)`

**KANIT ·** 20260726000000:60-61 → '-- GUVENLIK: yalniz kendi isletmesinin verisi. MODUL KAPISI BILEREK YOK — bkz. baslik notu.' / 'IF NOT public.user_has_isletme_access(p_isletme_id) THEN RETURN; END IF;' — tek kontrol ÜYELİK. Aynı dosyanın başlık notu 20260726000000:36-44 bunu açıkça yazıyor: 'get_income_expense_summary'ye modul kapisi EKLENMEDI... Modul kapisi eklenseydi, raporlar modulu olmayan bir uye Ana Sayfa'da aylik ozeti 0,00 gorurdu.' Karşılaştırma: kardeş RPC'lerde kapı VAR → get_category_report 20260726000000:111, get_product_report 20260726000000:250, get_income_by_source 20260716040000:35, get_account_report 20260716040000:99, get_networth_* 20260716040000:147,209. Client tarafında çağrı koşulsuz: src/hooks/useIslemler.ts:830 'supabase.rpc("get_income_expense_summary"...)', src/app/(tabs)/index.tsx:225 'const { data: monthSummary } = useMonthSummary("monthly", 0);' ve 449-450 'income={totalIncome} expense={totalExpense}' — bu propların etrafında canAccessModule kontrolü YOK (kontrol yalnız onHeroPress/onIncomeExpensePress içinde, yani sadece TIKLAMAYI engelliyor, sayıyı değil).

**ÖNERİ ·** İki seçenek: (a) RPC'ye 'raporlar' modül kapısını ekle VE Ana Sayfa çağrısını da gate'le (useMonthSummary'ye enabled: canAccessModule('raporlar')), kart 'raporlar' yoksa hiç render edilmesin (sadelik ilkesi); (b) RPC'yi ikiye ayır: gate'siz get_dashboard_ozet yalnız net tek sayı döndürsün ve tip kırılımını asla dışa vermesin, kırılımlı sürüm gate'li kalsın. Mevcut hâlde 'raporları göremesin' talebi DB'de karşılanmıyor.

---

### DB-02 — undo_import_batch: SECURITY DEFINER, HİÇBİR erişim kontrolü yok — keyfi işlemleri siler ve hesap/cari/personel bakiyelerini değiştirir

**Şiddet:** YUKSEK · **Tür:** YAZMA

**NE GÖRÜR / NE YAPABİLİR ·** Satın almacı, göremediği hesapların (modules.hesaplar=false) ve göremediği personelin (modules.personel=false) bakiyelerini keyfi miktarda değiştirebilir ve işletmenin herhangi bir işlemini kalıcı olarak silebilir. Fonksiyonda auth.uid() hiç geçmiyor → kontrol yalnızca 'bu UUID'ler var mı' düzeyinde; işletme sınırı bile yok (cross-tenant).

**NASIL ULAŞIR ·** islemler tablosu RLS'i satın almacıya AÇIK (modules.islemler=true) → işlem listesinden/API'den gerçek islem UUID'leri toplanır. Sonra kendi JWT'siyle POST /rest/v1/rpc/undo_import_batch {p_transaction_ids: [...]}. Uygulama ekranı gerekmiyor.

**NEREDE ·** `supabase/migrations/20260219000001_undo_import_batch_cross_currency.sql:10-138`

**KANIT ·** 20260219000001:10-19 'CREATE OR REPLACE FUNCTION undo_import_batch(p_transaction_ids UUID[]) ... SECURITY DEFINER SET search_path = public AS $$ DECLARE deleted_count INT; BEGIN' — hemen ardından :20 'UPDATE hesaplar h SET balance = h.balance + agg.delta' gelir; araya HİÇBİR guard satırı girmez (kardeş RPC'lerdeki 'IF NOT public.user_has_isletme_access(...) THEN RAISE EXCEPTION' kalıbı yok). :51 'UPDATE cariler c SET balance = ...', :95-130 'UPDATE personel p SET balance = ...', :132 'DELETE FROM islemler WHERE id = ANY(p_transaction_ids);'. Yetki: dosyada REVOKE/GRANT satırı YOK ve repoda blanket revoke da yok (grep 'ALL FUNCTIONS|DEFAULT PRIVILEGES' → 0 sonuç) → Postgres varsayılanı gereği EXECUTE PUBLIC'te, yani authenticated çağırabilir. Client çağıranı src/hooks/useImportHistory.ts:361 (yalnız içe-aktarma geri alma ekranı) — ama RPC ekrandan bağımsız erişilebilir.

**ÖNERİ ·** Fonksiyonun başına iki guard: (1) p_transaction_ids'in TEK bir isletme_id'ye ait olduğunu doğrula ve o id'yi türet; (2) 'IF NOT public.user_can_islem_action(v_isletme_id, ''delete'', NULL) THEN RAISE EXCEPTION ... 42501' + üyelik kontrolü. Ardından 'REVOKE EXECUTE ... FROM PUBLIC, anon; GRANT ... TO authenticated;' — 20260716030000 dosyasındaki kalıbın aynısı. Bu, o migration'ın kapattığı sınıfın atlanmış bir üyesi.

---

### DB-03 — perform_nakit_avans: SECURITY DEFINER, hiçbir çağıran doğrulaması yok — keyfi hesap id'sine doğrudan bakiye yazar

**Şiddet:** YUKSEK · **Tür:** YAZMA

**NE GÖRÜR / NE YAPABİLİR ·** Satın almacı, 'hesaplar' modülü kapalı olmasına rağmen istediği hesabın bakiyesini istediği kadar artırabilir (iki ayrı UPDATE hesaplar). Fonksiyon p_isletme_id'yi doğrudan çağırandan alıp nakit_avanslar'a INSERT eder ve p_hedef_hesap_id / p_kredi_karti_id için isletme_id eşleşmesini bile kontrol etmez → cross-tenant yazma.

**NASIL ULAŞIR ·** hesap UUID'leri islemler satırlarındaki hesap_id / hedef_hesap_id alanlarından toplanır (islemler modülü açık). Sonra POST /rest/v1/rpc/perform_nakit_avans {p_isletme_id, p_kredi_karti_id, p_hedef_hesap_id, p_tutar, p_geri_odeme_tutari}. Uygulamada bu özelliğin UI'ı YOK (nakit avans kaldırıldı) ama RPC canlı.

**NEREDE ·** `supabase/migrations/20260208000003_fix_security_definer_search_path.sql:79-133 (gövde; UPDATE hesaplar :120 ve :126); yetki: supabase/migrations/20260114100000_perform_nakit_avans_rpc.sql:186`

**KANIT ·** 20260208000003:94-101 'BEGIN -- Validasyonlar / IF p_tutar <= 0 THEN RAISE EXCEPTION ...' — tek doğrulama tutar işareti; auth.uid() ya da user_has_isletme_access fonksiyonun HİÇBİR yerinde geçmiyor. :118-125 'UPDATE hesaplar SET balance = balance + p_tutar ... WHERE id = p_hedef_hesap_id;' (WHERE'de isletme_id yok), :126-131 'UPDATE hesaplar SET balance = balance + p_geri_odeme_tutari ... WHERE id = p_kredi_karti_id;'. Yetki hâlâ açık: 20260114100000:186 'GRANT EXECUTE ON FUNCTION perform_nakit_avans TO authenticated;' ve sonraki CREATE OR REPLACE grant'ı korur. Client'ta çağıran YOK (grep 'perform_nakit_avans' src/ → 0 sonuç) → ölü ama canlı saldırı yüzeyi.

**ÖNERİ ·** Özellik kaldırıldıysa fonksiyonu DROP et (nakit_avanslar/nakit_avans_taksitler tabloları kalabilir). Bırakılacaksa başına 'IF NOT public.user_has_isletme_access(p_isletme_id) THEN RAISE EXCEPTION ... 42501; END IF;' + 'IF NOT public.user_has_module_access(p_isletme_id, ''hesaplar'') THEN ...' ekle, iki UPDATE'in WHERE'ine 'AND isletme_id = p_isletme_id' koy, sonra 'REVOKE EXECUTE ... FROM PUBLIC, anon'.

---

### DB-04 — increment_balance: yalnız ÜYELİK kontrolü — modül/aksiyon izni yok; kapalı 'hesaplar' ve 'personel' bakiyeleri doğrudan yazılabiliyor

**Şiddet:** YUKSEK · **Tür:** YAZMA

**NE GÖRÜR / NE YAPABİLİR ·** Satın almacı, göremediği bir hesabın veya personelin bakiyesini istediği delta ile değiştirebilir. Guard yalnızca 'bu satır, benim üyesi olduğum bir işletmeye mi ait' diye sorar; permissions.modules.hesaplar / permissions.modules.personel'e ve actions.*.can_update'e HİÇ bakmaz.

**NASIL ULAŞIR ·** hesap_id / personel_id islemler satırlarından toplanır (islemler modülü açık, üstelik src/lib/permissions.ts:56 can_see_all_users_data'yı her zaman true yazdığı için TÜM işlemler görünür). Sonra POST /rest/v1/rpc/increment_balance {table_name:'hesaplar', row_id:<uuid>, amount:<delta>}.

**NEREDE ·** `supabase/migrations/20260518020000_fix_increment_balance_isletme_check.sql:10-36`

**KANIT ·** 20260518020000:21-34 — tek kontrol tablo allowlist'i ('IF table_name NOT IN (''hesaplar'', ''cariler'', ''personel'')') ve UPDATE'in WHERE'i: 'AND isletme_id IN (SELECT id FROM isletmeler WHERE user_id = auth.uid() UNION SELECT isletme_id FROM isletme_users WHERE user_id = auth.uid() AND status = ''active'')' → SADECE aktif üyelik. Bu, repo tarafından zaten yazılı bir açık: 20260716030000_atomik_rpc_izin_gate.sql:20-22 'NOT (bu turda kapsamda DEGIL, ayri residual): increment_balance dogrudan client'tan cagrilabiliyor ve yalniz uyelik-scope'lu (izin degil).' Dosyada REVOKE yok → EXECUTE PUBLIC'te. Client'ta doğrudan çağrılıyor: src/hooks/useImportBalance.ts:16, src/hooks/useIslemler.ts:363, src/hooks/useIleriTarihliIslemler.ts:514, src/hooks/usePendingIslemler.ts:49, src/hooks/useDataImport.ts:616,649.

**ÖNERİ ·** increment_balance'a tablo-başına modül+aksiyon kapısı ekle: table_name → modül eşlemesi ('hesaplar'→hesaplar, 'cariler'→cariler, 'personel'→personel) ve 'IF NOT public.user_has_module_access(v_isletme_id, v_modul) THEN RAISE EXCEPTION'. isletme_id'yi parametre olarak alıp doğrulamak, mevcut IN-listesinden daha net olur. Ardından REVOKE ... FROM PUBLIC, anon. DİKKAT: 6 client çağrı yeri var, önce onların hepsinin izinli akışta olduğu doğrulanmalı.

---

### DB-05 — get_personel_ozet: 'personel' modül kapısı yok — personel_id islemler'den toplanıp maaş/ödeme toplamları okunabiliyor

**Şiddet:** YUKSEK · **Tür:** DOLAYLI

**NE GÖRÜR / NE YAPABİLİR ·** Verilen bir personel_id için ömür-boyu tip bazlı PARA toplamları: personel_odeme (o kişiye ödenen toplam = maaş), personel_gider, personel_satis, personel_tahsilat — her biri toplam + adet. Yani 'personel ve maaşları görmemeli' kuralı RLS ile korunurken (personel tablosu SELECT'i modül kapılı) bu RPC aynı parayı arka kapıdan veriyor. Ad-soyad gelmez, tutar gelir.

**NASIL ULAŞIR ·** islemler tablosu satın almacıya açık ve satırlarda personel_id kolonu var → uygulamanın İşlemler listesinden veya GET /rest/v1/islemler?select=personel_id,amount,type ile personel UUID'leri toplanır. Sonra POST /rest/v1/rpc/get_personel_ozet {p_isletme_id, p_personel_id} her UUID için çağrılır.

**NEREDE ·** `supabase/migrations/20260721030000_personel_urun_ozet_rpc.sql:9-46 (guard :19-21)`

**KANIT ·** 20260721030000:19-21 'IF NOT public.user_has_isletme_access(p_isletme_id) THEN RAISE EXCEPTION ''Yetkisiz erisim'' USING ERRCODE = ''42501''; END IF;' — user_has_module_access çağrısı YOK (aynı dosyada get_urun_ozet için de yok, :61-63). Gövde :34-38 'FROM islemler i WHERE i.isletme_id = p_isletme_id AND i.personel_id = p_personel_id AND i.type IN (''personel_gider'',''personel_odeme'',''personel_satis'',''personel_tahsilat'')' → SECURITY DEFINER (:12) olduğu için personel tablosunun RLS'i devreye girmez. Zincirin ilk halkası: islemler SELECT politikası 20260224000002:44-50 modules.islemler + can_see_all_users_data ister; src/lib/permissions.ts:56 buildPermissions HER izin setine 'visibility: { can_see_passive: true, can_see_archived: true, can_see_all_users_data: true }' yazar → satın almacı TÜM işlemleri görür. user_has_module_access mevcut ve hazır: 20260716030000:67-84.

**ÖNERİ ·** 20260716040000 kalıbını uygula: üyelik guard'ının hemen ardına 'IF NOT public.user_has_module_access(p_isletme_id, ''personel'') THEN RAISE EXCEPTION ... 42501; END IF;' ekle (get_urun_ozet için de ''urunler''). Tek çağıran zaten personel detay ekranı (src/hooks/usePersonel.ts:76) ve o ekran UI'da personel modülüyle gate'li → meşru kullanıcı etkilenmez.

---

### TB-01 — Ana Sayfa sekmesi hiçbir modüle bağlı değil; üzerindeki Gelir/Gider kartı RLS'i baypas eden, modül kapısı OLMAYAN bir RPC'den besleniyor

**Şiddet:** YUKSEK · **Tür:** UI_SIZINTI

**NE GÖRÜR / NE YAPABİLİR ·** Ana Sayfa carousel'inin 2. kartında, hiçbir yere dokunmadan: NET KÂR/ZARAR, GELİR ve GİDER — işletmenin bu ayki TÜM gelir/gider toplamı. İçine personel maaş giderleri ve tüm hesap hareketleri dahil. Bu tam olarak sahibin 'Raporlar (hiçbiri)' dediği sayı.

**NASIL ULAŞIR ·** Uygulama açılır → varsayılan sekme Ana Sayfa → carousel'de sağa bir kaydırma (Gelir/Gider kartı). Hiçbir menü, buton ya da izin adımı yok.

**NEREDE ·** `src/components/ui/PersistentTabBar.tsx:28 · src/app/(tabs)/index.tsx:225 · src/components/dashboard/IncomeExpenseCard.tsx:86,98 · supabase/migrations/20260726000000_rapor_rpc_erisim_guard.sql:49-61`

**KANIT ·** TABS dizisinde ana sayfa girdisi `{ key: 'home', route: '/(tabs)', icon: Home, labelKey: 'tabs.home' }` — `module` alanı YOK; filtre satırı `TABS.filter((tab) => !tab.module || canAccessModule(tab.module))` (PersistentTabBar.tsx:137) modülsüz sekmeyi her zaman geçirir. (tabs)/index.tsx:225 `const { data: monthSummary } = useMonthSummary('monthly', 0);` — KOŞULSUZ; canAccessModule('raporlar') yalnızca kartın onPress'inde (satır 443/452/462), sayıların RENDER'ında değil. Bu hook useIslemler.ts:830 `supabase.rpc('get_income_expense_summary', ...)` çağırır. RPC `SECURITY DEFINER` ve gövdesindeki tek kontrol `IF NOT public.user_has_isletme_access(p_isletme_id) THEN RETURN; END IF;` (migration satır 61) — modül kapısı yok; migration'ın kendi başlık notu bunu yazıyor (satır 36-45: "get_income_expense_summary'ye modul kapisi EKLENMEDI ... ANA SAYFA'daki aylik ozeti besliyor"). SECURITY DEFINER olduğu için islemler RLS'i (can_see_all_users_data dahil) de baypas edilir.

**ÖNERİ ·** İki uçtan biri kapatılmalı: (a) useMonthSummary çağrısını `enabled: canAccessModule('raporlar')` ile koşullandır ve DashboardCarousel'de Gelir/Gider + Nakit Akışı kartlarını raporlar kapalıyken HİÇ render etme (sadelik ilkesi: kullanılmayan/yasak kartın yeri boş kalsın), (b) aynı anda get_income_expense_summary'ye 'raporlar' modül kapısını ekle (migration'ın 'ayrı ürün kararı' dediği karar budur). Yalnız (b) yapılırsa kart 0,00 gösterir — yalnız (a) yapılırsa RPC hâlâ guard'sız kalır; ikisi birlikte yapılmalı.

---

### TB-02 — Daha → Tüm İşlemler: personel maaş işlemleri tutarı ve açıklamasıyla listeleniyor, üstelik hazır 'Personel' filtre çipiyle süzülebiliyor

**Şiddet:** YUKSEK · **Tür:** DOLAYLI

**NE GÖRÜR / NE YAPABİLİR ·** Tüm işlemler listesinde 'Personel Gideri / Personel Maaşı' tipli satırlar: TUTAR, tarih ve işlemin AÇIKLAMASI (ör. 'Ahmet Ağustos maaşı'). Personel adı ayrı alanda boş gelir (RLS embed'i null'lar) ama açıklama metni islemler satırının kendi kolonu olduğu için aynen görünür. 'Personel' filtre çipiyle liste yalnız maaş satırlarına indirgenebilir. Aynı şekilde tüm nakit/banka hareketlerinin tutarları da listelenir.

**NASIL ULAŞIR ·** Alt bar → Daha → 'Tüm İşlemler' → üstteki filtre çiplerinden 'Personel' (ya da hiç filtre koymadan aşağı kaydırmak yeterli).

**NEREDE ·** `src/app/(tabs)/daha.tsx:257-261 · src/app/islemler/index.tsx:241,261-263,114,130-147 · src/hooks/useIslemler.ts:44-57 · supabase/migrations/20260224000002_multi_user_rls_policies.sql:43-51`

**KANIT ·** Menü satırının izin koşulu yok: daha.tsx:257-261 `<MenuItem ... onPress={() => router.push('/islemler')} />`. islemler/index.tsx'te sayfa koruması (usePagePermission) hiç yok ve filtre çipleri statik: satır 241 `{ key: 'personel', label: t('transactions:filters.personnel'), ... }`, süzme satır 261 `if (filter === 'personel') matchesFilter = islem.type.startsWith('personel_')`. Satır render'ı: satır 114 `const noteText = islem.description || null;` → satır 130-147 `<TransactionRow amount={xc.mainAmount} typeLabel={...} tertiaryText={noteText} />` (TransactionRow.tsx:276 tutarı basar). Veri yolu: useIslemler.ts:44-57 select'inde `personel:personel(...)` ve `hesap:hesaplar!hesap_id(...)` EMBED olduğu için RLS onları null'lar; ANA satır ise islemler RLS politikasından geçer ve o politika yalnız `iu.permissions->'modules'->>'islemler'` bakar (migration satır 47), hesaplar/personel modülüne BAKMAZ.

**ÖNERİ ·** Bu, sahibin verdiği izin kümesindeki en büyük gerçek delik: 'islemler' modülü açık olduğu sürece maaş satırları iner. Üç seçenek: (1) islemler SELECT politikasına satır-tipi kapısı ekle — `personel` modülü yoksa `type NOT LIKE 'personel_%'`, `hesaplar` modülü yoksa hesap-bağlı tipler hariç (additive policy güncellemesi, eski kullanıcıyı etkilemez çünkü modül yoksa zaten fail-closed); (2) en azından istemcide 'Personel' filtre çipini ve personel_* satırlarını canAccessModule('personel') ile gizle (yalnız kozmetik, veri yine iner); (3) sahibe 'satın almacı' için ayrı bir izin sunumu yaz (işlem modülü = yalnız kendi girdiği + cari tipleri). Kalıcı çözüm (1).

---

### GA-02 — Personel izin (gün) kayıtları global aramada listeleniyor

**Şiddet:** ORTA · **Tür:** DOLAYLI

**NE GÖRÜR / NE YAPABİLİR ·** İşlemler bölümünde `personel_izin_hakki` / `personel_izin_kullanimi` satırları; tutar yerine `staff:leave.dayCount` ile 'X gün' yazısı + işlem açıklaması. Yani personel modülü kapalı olmasına rağmen personelin izin hakkı/kullanımı ve gün sayısı satır satır görülebiliyor.

**NASIL ULAŞIR ·** GA-01 ile aynı yol: /arama → filtre → tarih aralığı (veya açıklamada geçen bir kelime) → İşlemler bölümü. İzin kayıtları da `islemler` tablosunda olduğu için aynı 50'lik listeye girer.

**NEREDE ·** `src/app/arama.tsx:486-491`

**KANIT ·** src/app/arama.tsx:486-491 `if (isLeaveType(item.data.type)) return { text: t('staff:leave.dayCount', { count: item.data.amount }) ... }` — izin tipleri özel olarak RENDER EDİLİYOR, yani bu ekranda görünmeleri bekleniyor. Tip listesi: src/constants/islemTypes.ts:69 `LEAVE_TYPES = ['personel_izin_hakki','personel_izin_kullanimi']`. Sorguda dışlama yok (src/hooks/useIslemler.ts:946-980) ve RLS de dışlamıyor (supabase/migrations/20260224000002_multi_user_rls_policies.sql:44-50).

**ÖNERİ ·** GA-01 ile aynı tip filtresi bunu da kapatır (LEAVE_TYPES dahil edilmeli). Ayrıca izin satırının render dalı (arama.tsx:486-491) personel modülü kapalıyken hiç çalışmamalı.

---

### QTB-02 — İşlem tipi sekmeleri ve ödeme/tahsilat hedef seçenekleri modüle göre HİÇ filtrelenmiyor — kapalı modüllerin akışları görünür kalıyor

**Şiddet:** ORTA · **Tür:** NAVIGASYON

**NE GÖRÜR / NE YAPABİLİR ·** Satın almacı QTB'de Transfer, Ödeme, Tahsilat sekmelerini (hepsi hesaplar modülü akışı) görür ve dokunabilir. Ödeme'ye basınca açılan hedef listesinde 'Personel Ödemesi' (personel modülü) ve 'Kredi Kartı Ödemesi' (hesaplar modülü) seçeneklerini görür; Tahsilat'ta 'Personel Tahsilatı' seçeneğini görür. Cari sayfasından girdiğinde tedarikçi sekme seti ['alis','satis','odeme','alis_iade'] olduğu için 'Ödeme' sekmesi de görünür. Seçenekler yasak VERİ göstermez (arkasındaki seçiciler RLS yüzünden boş gelir) ama kapalı modüllerin varlığını ve girişini açık bırakır; her biri çıkmaz bir ekranla biter.

**NASIL ULAŞIR ·** İşlemler → FAB → QTB alt sekme şeridi (Gelir·Gider·Transfer·Ödeme·Tahsilat) · Ödeme → hedef tipi alt sayfası · Tahsilat → hedef tipi alt sayfası · Cari detay → İşlem ekle → tedarikçi sekmeleri.

**NEREDE ·** `src/components/transaction/TransactionTypeTabs.tsx:75-96,114-142; src/components/transaction/QuickTransactionBar/components/OdemeHedefTypePicker.tsx:18-42; src/components/transaction/QuickTransactionBar/components/TahsilatHedefTypePicker.tsx:18-42`

**KANIT ·** TransactionTypeTabs.tsx:114-142 `visibleTabs` yalnız `mode`'a (normal/tedarikci/musteri/personel/kredi_karti) bakar, izinlere bakmaz; NORMAL_TABS (satır 75) = ['gelir','gider','transfer','odeme','tahsilat'], TEDARIKCI_TABS (satır 78) 'odeme' içerir. OdemeHedefTypePicker.tsx:18-42 sabit OPTIONS dizisi: tedarikci + staff + kredi_karti; koşul yok. TahsilatHedefTypePicker.tsx:18-42: musteri + tedarikci + personel; koşul yok. QuickTransactionBar.tsx:1027-1040 bu iki picker'ı koşulsuz mount eder.

**ÖNERİ ·** TransactionTypeTabs'e izin farkındalığı ekle (transfer/odeme/tahsilat sekmelerini `canAccessModule('hesaplar')`, personel sekmelerini `canAccessModule('personel')` ile filtrele) ve iki hedef-tipi picker'ının OPTIONS listesini aynı bayraklarla süz. Böylece hesap/personel modülü kapalı kullanıcı hiç çıkmaz akışa girmez.

---

### ISL-03 — Filtre çipleri izinsiz: 'Personel', 'İzin Hak Edişi', 'İzin Kullanımı' ve 'Transfer' çipleri koşulsuz gösteriliyor

**Şiddet:** ORTA · **Tür:** NAVIGASYON

**NE GÖRÜR / NE YAPABİLİR ·** Persona, listenin üstündeki çip şeridinde 'Personel' çipine tek dokunuşla maaş/prim/personel ödemelerini İZOLE EDEBİLİR — yani yasak veriyi karışık akıştan ayıklamak için ekranda hazır bir araç vardır. Aynı şekilde 'Transfer' çipi hesaplar arası para hareketlerini, 'İzin Hak Edişi'/'İzin Kullanımı' çipleri personel izin kayıtlarını izole eder.

**NASIL ULAŞIR ·** İşlemler listesi → üstteki yatay çip şeridi → 'Personel' çipine bas → ekranda yalnızca personel işlemleri (maaş ödemeleri) kalır.

**NEREDE ·** `src/app/islemler/index.tsx:235-244 (özellikle 241, 242, 243, 239) · index.tsx:261-263`

**KANIT ·** index.tsx:235-244 `filterChips` useMemo'su yalnızca `[t]` bağımlılığıyla kurulur; hiçbir çip `canAccessModule(...)` ile koşullanmamıştır (dosyada canAccessModule hiç import edilmez — index.tsx:169 sadece `const { canDelete } = usePermissions();`). Çip anahtarları index.tsx:261-263'te doğrudan tipe çevrilir: `if (filter === 'personel') matchesFilter = islem.type.startsWith('personel_') && !isLeaveType(islem.type);`, `izin_hakki`/`izin_kullanimi` de aynı şekilde. Karşılaştırma noktası: aynı kod tabanında koşullu gösterim deseni mevcut — src/components/ui/PersistentTabBar.tsx:137 `TABS.filter((tab) => !tab.module || canAccessModule(tab.module))`.

**ÖNERİ ·** filterChips useMemo'sunu izne bağla: personel/izin_hakki/izin_kullanimi çiplerini `canAccessModule('personel')`, transfer çipini `canAccessModule('hesaplar')` ile filtrele (bağımlılık dizisine canAccessModule ekle). Not: bu tek başına ISL-01/ISL-02'yi kapatmaz, yalnız hazır ayıklama aracını kaldırır.

---

### ISL-04 — Personel izin kayıtları gün cinsinden ekrana basılıyor (personel modülü kapalıyken)

**Şiddet:** ORTA · **Tür:** DOLAYLI

**NE GÖRÜR / NE YAPABİLİR ·** Persona, 'İZİN HAK EDİŞİ' / 'İZİN KULLANIMI' satırlarını ve bunların gün sayısını (ör. '5 gün') görür. Bu, personel modülüne ait bir insan-kaynakları verisidir; persona'nın personel modülü kapalıdır. Tarih + gün sayısı birleşince kimin ne zaman izne çıktığı (satırın notundan ad geçiyorsa) izlenebilir hale gelir.

**NASIL ULAŞIR ·** İşlemler listesi → 'İzin Kullanımı' çipi (ya da hiç filtre uygulamadan akışta) → satırlarda tutar yerine 'N gün' yazar.

**NEREDE ·** `src/components/ui/TransactionRow.tsx:119-122 · src/app/islemler/index.tsx:242-243, 261-263`

**KANIT ·** TransactionRow.tsx:119-122 `const isLeave = isLeaveType(type); const formattedAmount = isLeave ? `${Math.abs(numAmount)} ${t('staff:leave.days')}` : formatCurrency(...)` — izin satırı özel olarak GÜN biçiminde render edilmek üzere desteklenir, hiçbir izin kontrolü yoktur. index.tsx:242-243 bu tipler için ayrı filtre çipleri tanımlar; index.tsx:533-538'deki yorum bu listede izin satırlarının bilinçli olarak beklendiğini de doğrular ('izin_hakki/izin_kullanimi gibi seyrek filtrede...'). LEAVE_TYPES tanımı src/constants/islemTypes.ts:69.

**ÖNERİ ·** ISL-02'deki RLS tip-kapısı `personel\_%` desenini kullanırsa izin tipleri de otomatik kapanır (personel_izin_hakki/personel_izin_kullanimi bu desene uyar). İstemci tarafında ayrıca izin satırlarını `canAccessModule('personel')` false iken filteredIslemler'den ele.

---

### ISL-05 — Serbest açıklama (description) hiçbir kısıt olmadan basılıyor — RLS ile gizlenen personel/hesap adının yedek sızıntı kanalı

**Şiddet:** ORTA · **Tür:** DOLAYLI

**NE GÖRÜR / NE YAPABİLİR ·** Personel maaş satırının serbest metin notu satırda aynen görünür. İlişkili tablo adları (personel adı, hesap adı) RLS ile boşaltılsa bile (bkz. ISL-06), aynı bilgi çoğu kayıtta description alanında saklandığı için maaş tutarı ile kişi eşleşebilir. Kodda bu alan için hiçbir izin/temizleme kontrolü yoktur.

**NASIL ULAŞIR ·** İşlemler listesi → 'PERSONEL GİDERİ' satırı → tür/kategori satırının altındaki not satırı.

**NEREDE ·** `src/app/islemler/index.tsx:114,138 · src/components/ui/TransactionRow.tsx:235-239`

**KANIT ·** index.tsx:114 `const noteText = islem.description || null;` → index.tsx:138 `tertiaryText={noteText}` → TransactionRow.tsx:235-239 `{tertiaryText ? (<Text style={styles.noteText}>{tertiaryText}</Text>) : null}`. Not: numberOfLines sınırı bile yoktur, metin tam basılır. Ayrıca index.tsx:271 description üzerinde serbest arama yapılabilir (`searchMatchesTr(islem.description, debouncedSearch)`) → persona bir personelin adını arama kutusuna yazıp o kişinin işlemlerini tarayabilir. Bu bulgu veri-bağımlıdır (notun içeriğine bağlı), kod tarafında hiçbir engel bulunmadığı KESİNDİR.

**ÖNERİ ·** Asıl çözüm ISL-02 (satır hiç inmesin). Satır inmeye devam edecekse, izinsiz tipler için description/arama alanını da kapat — yalnız hesap/personel embed'ini RLS'e bırakmak yeterli değil.

---

### DB-06 — islemler RLS'i işlem TİPİNE bakmıyor — personel maaş ödemesi satırları (tutar+tarih+açıklama) satın almacıya iniyor

**Şiddet:** ORTA · **Tür:** DOLAYLI

**NE GÖRÜR / NE YAPABİLİR ·** 'personel_odeme', 'personel_gider', 'personel_satis', 'personel_tahsilat' tipli işlem satırlarının tamamı: amount, date, description, personel_id, hesap_id. Yani her maaş ödemesinin TUTARI ve TARİHİ görünür. Personel ADI görünmez (personel tablosu SELECT'i modül kapılı, 20260224000002:146-154 doğru kurulmuş) ama description serbest metin olduğu için pratikte ad oraya yazılmış olabilir. Aynı şekilde hesap_id görünür, hesap ADI ve BAKİYESİ görünmez.

**NASIL ULAŞIR ·** İşlemler sekmesi (modül açık) — filtresiz liste bu satırları içerir. Ya da GET /rest/v1/islemler?isletme_id=eq.<id>&type=eq.personel_odeme

**NEREDE ·** `supabase/migrations/20260224000002_multi_user_rls_policies.sql:43-50; src/lib/permissions.ts:56`

**KANIT ·** 20260224000002:44-50 'CREATE POLICY "Shared select islemler" ... USING (EXISTS (SELECT 1 FROM isletme_users iu WHERE iu.isletme_id = islemler.isletme_id AND iu.user_id = auth.uid() AND iu.status = ''active'' AND COALESCE((iu.permissions->''modules''->>''islemler'')::boolean, false) AND (COALESCE((iu.permissions->''visibility''->>''can_see_all_users_data'')::boolean, false) OR islemler.created_by = auth.uid())))' — koşullarda i.type üzerine HİÇBİR kısıt yok, personel/hesap modül bayrağına çapraz bakış yok. İkinci halka: src/lib/permissions.ts:56 can_see_all_users_data'yı sabit true yazdığı için 'yalnız kendi girdiği işlemler' daralması da yok. Karşıt kanıt (tasarımın bilinçli olduğunu gösteren): hesaplar/personel tablolarının kendi SELECT politikaları modül kapılı — 20260615020000:22-30 ve 20260224000002:146-154.

**ÖNERİ ·** Bu bir ürün kararı: fatura işleyecek kişi işlem listesini görmek zorunda. En az iki seçenek var — (a) islemler SELECT politikasına çapraz kapı ekle: 'AND (islemler.personel_id IS NULL OR COALESCE((iu.permissions->''modules''->>''personel'')::boolean, false))' (RLS'te en temiz ve sunucu-tarafı), (b) yalnız istemcide personel tipli işlemleri filtrele (UI-only, baypas edilebilir). (a) önerilir; eski kullanıcı etkisi: personel modülü açık olan tüm mevcut üyeler etkilenmez, yalnız personel-kapalı üyeler personel işlemlerini kaybeder — ki istenen budur.

---

### DB-08 — perform_taksit_odeme ve delete_nakit_avans_with_reversal: çağıran doğrulaması yok, p_isletme_id parametreden geliyor — hesap bakiyesi yazarlar

**Şiddet:** ORTA · **Tür:** YAZMA

**NE GÖRÜR / NE YAPABİLİR ·** Her iki fonksiyon da 'bu kayıt p_isletme_id'ye ait mi' diye sorar ama 'çağıran o işletmenin üyesi mi' diye SORMAZ — auth.uid() geçmiyor. perform_taksit_odeme ayrıca p_source_hesap_id'yi hiç doğrulamadan bakiyesinden düşer. Satın almacı için sonuç: göremediği hesapların bakiyesini eksiltebilmek.

**NASIL ULAŞIR ·** POST /rest/v1/rpc/perform_taksit_odeme {p_taksit_id, p_source_hesap_id, p_isletme_id}. UYARI — pratikte sömürülebilirlik nakit_avans_taksitler tablosunda status<>'paid' satır bulunmasına bağlıdır; nakit avans özelliği üründen kaldırıldığı için canlıda satır olmayabilir. Bu yüzden 'orta' verdim, 'yüksek' değil.

**NEREDE ·** `supabase/migrations/20260208000003_fix_security_definer_search_path.sql:136-193 (perform_taksit_odeme; UPDATE hesaplar :174 ve :180); supabase/migrations/20260208000000_fix_delete_nakit_avans_schema.sql:12-35 (delete_nakit_avans_with_reversal)`

**KANIT ·** 20260208000003:149-171 — fonksiyon 'SELECT * INTO v_taksit FROM nakit_avans_taksitler WHERE id = p_taksit_id;' ile başlar (erişim kontrolü yok), ardından ':167 SELECT * INTO v_avans FROM nakit_avanslar WHERE id = v_taksit.nakit_avans_id AND isletme_id = p_isletme_id;' — bu satır KAYDI doğrular, ÇAĞIRANI değil. Sonra :174-178 'UPDATE hesaplar SET balance = balance - v_taksit.tutar ... WHERE id = p_source_hesap_id;' (WHERE'de isletme_id yok). delete_nakit_avans_with_reversal'da aynı desen: 20260208000000:28-35 'WHERE id = p_avans_id AND isletme_id = p_isletme_id ... RAISE EXCEPTION ''Nakit avans bulunamadı veya bu işletmeye ait değil'''. Yetki: 20260114100000:187 'GRANT EXECUTE ON FUNCTION perform_taksit_odeme TO authenticated;', 20260114110000:100 delete için aynısı. Client çağıranı YOK (grep src/ → 0).

**ÖNERİ ·** Nakit avans özelliği kaldırıldığına göre en temiz çözüm üç fonksiyonu da (perform_nakit_avans, perform_taksit_odeme, delete_nakit_avans_with_reversal) DROP etmek. Tutulacaksa her birinin başına 'IF NOT public.user_has_isletme_access(p_isletme_id) THEN RAISE EXCEPTION ... 42501; END IF;' + hesap UPDATE'lerinin WHERE'ine 'AND isletme_id = p_isletme_id'.

---

### DB-09 — update_urun_miktar'ın NULL p_isletme_id kolu hiçbir kontrol yapmıyor — keyfi ürün stoğu (başka işletmeninki dahil) yazılabiliyor

**Şiddet:** ORTA · **Tür:** YAZMA

**NE GÖRÜR / NE YAPABİLİR ·** p_isletme_id gönderilmezse fonksiyon ne modül kapısına ne de işletme kapsamına bakar; verilen urun_id'nin miktarını değiştirir. Satın almacı için 'urunler' modülü zaten açık olduğundan kendi işletmesi bakımından yeni bir ayrıcalık değil — ama işletme sınırı da olmadığı için BAŞKA bir işletmenin ürün stoğu yazılabilir. Bu yüzden persona kapsamı dışında ama gerçek bir açık.

**NASIL ULAŞIR ·** POST /rest/v1/rpc/update_urun_miktar {p_urun_id:<uuid>, p_miktar_degisim:<sayı>} — p_isletme_id parametresi hiç gönderilmez (DEFAULT NULL).

**NEREDE ·** `supabase/migrations/20260716030000_atomik_rpc_izin_gate.sql:563-572`

**KANIT ·** 20260716030000:552-562 gate'li kol: 'IF p_isletme_id IS NOT NULL THEN IF NOT public.user_has_module_access(p_isletme_id, ''urunler'') THEN RAISE EXCEPTION ...; END IF; UPDATE urunler ... WHERE id = p_urun_id AND isletme_id = p_isletme_id'. :563-572 gate'siz kol: 'ELSE -- Backward compatibility: isletme_id''siz eski cagrilar (gate uygulanamaz, isletme scope yok) / UPDATE urunler SET miktar = miktar + p_miktar_degisim, updated_at = NOW() WHERE id = p_urun_id'. Dosya sonunda (tail) bu fonksiyon için REVOKE satırı YOK — kardeşlerinde var (:465 reapply..., :534 set_urun_miktar_hedef).

**ÖNERİ ·** NULL kolunu kaldır: p_isletme_id'yi zorunlu yap ('IF p_isletme_id IS NULL THEN RAISE EXCEPTION ''isletme_id zorunlu'' USING ERRCODE = ''42501''; END IF;'). Repoda geriye-uyum kolunun hâlâ kullanıldığına dair kanıt yok — 20260716030000:539-543 yorumu bile 'mevcut cagiranlar hep isletme_id gonderir' diyor. Ayrıca 'REVOKE EXECUTE ... FROM PUBLIC, anon; GRANT ... TO authenticated;' ekle.

---

### CU-02 — Cari ekstresini süresiz PUBLIC web linki olarak dışarı çıkarmak hiçbir izne bağlı değil

**Şiddet:** ORTA · **Tür:** YAZMA

**NE GÖRÜR / NE YAPABİLİR ·** Persona cari detayında Paylaş (⇪) → 'Ekstre linki' → süre seçimi ('1 gün … 1 yıl / Süresiz') yapıp carinin TÜM hareket geçmişini + bakiyesini token'lı public bir URL'ye dönüştürebiliyor ve WhatsApp/mail ile dışarı gönderebiliyor. Bu bir YAZMA işlemi (cari_ekstre_links kaydı üretiyor, önceki linki iptal ediyor) ama personanın level='add' olması, hatta level='view' olması bile yolu kapatmıyor.

**NASIL ULAŞIR ·** Cariler → cari → sağ üst Paylaş ikonu → 'Ekstre linki' → 'Süresiz' → native paylaşım sayfası açılır, link panoya/WhatsApp'a gider.

**NEREDE ·** `src/app/cariler/[id].tsx:1398-1411 (DetailExportSection koşulsuz mount) · src/components/detail/DetailExportSection.tsx:87 (onEkstreLinkPress) · src/components/detail/DetailExportSection.tsx:54-64 + 66-76 (süre seçenekleri, 'süresiz' dahil) · supabase/migrations/20260720210000_web_ekstre_faz4.sql:50-72, 95-96`

**KANIT ·** DetailExportSection.tsx içinde tek bir usePermissions/canAccessModule/canCreate çağrısı yok; `onEkstreLinkPress` yalnız `entityType === 'cari'` koşuluna bağlı (satır 87). Sunucuda ekstre_link_olustur SECURITY DEFINER ve tek guard'ı `IF NOT public.user_has_isletme_access(p_isletme_id)` (migration satır 66-68) — modules/level'a hiç bakmıyor; GRANT EXECUTE ... TO authenticated (satır 96). Edge fonksiyonu cari+islemler alanlarını service-role ile okuyor (supabase/functions/cari-ekstre/index.ts:171-176), yani üretilen sayfa RLS'ten bağımsız çalışıyor.

**ÖNERİ ·** UI'da 'Ekstre linki' girişini en az `permissionLevel !== 'view'` + `canAccessModule('cariler')` ile gizle; asıl düzeltme sunucuda: ekstre_link_olustur içine `user_has_module_access(p_isletme_id,'cariler')` ve (tercihen) `actions.cariler.can_update_*` benzeri bir yetki şartı ekle. 'Süresiz' seçeneğini owner'a özel yap.

---

### TB-03 — Ana Sayfa'daki Nakit Akışı kartı, raporlar kapalı kullanıcıya toplam para giriş/çıkış ve net akışı gösteriyor

**Şiddet:** ORTA · **Tür:** UI_SIZINTI

**NE GÖRÜR / NE YAPABİLİR ·** Ana Sayfa carousel'inin 3. kartında bu ayki TOPLAM GİRİŞ, TOPLAM ÇIKIŞ ve NET NAKİT AKIŞI tutarları. Bakiye değil ama 'hesaplardaki paranın' aylık hareketi — sahibin gizlemek istediği bilgi ailesinden.

**NASIL ULAŞIR ·** Ana Sayfa → carousel'de iki kaydırma (Nakit Akışı kartı). Karta dokunuş engelli ama sayılar kartın yüzünde.

**NEREDE ·** `src/app/(tabs)/index.tsx:228-235,458-467 · src/components/dashboard/CashFlowCard.tsx:87,99 · src/hooks/useCashFlowByCategory.ts:144`

**KANIT ·** (tabs)/index.tsx:228-235 `useCashFlowByCategory({ startDate, endDate })` KOŞULSUZ çağrılıyor; 458-460 `totalInflow`/`totalOutflow`/`netCashFlow` doğrudan karta veriliyor; canAccessModule('raporlar') kontrolü YALNIZ onCashFlowPress içinde (satır 461-467) — yani dokunuşu kesiyor, gösterimi değil. CashFlowCard.tsx:87 `{formatCurrency(totalInflow)}` ve :99 `{formatCurrency(totalOutflow)}`. Kaynak useCashFlowByCategory.ts:144 `.from('islemler')` — islemler RLS'i bu kullanıcıya izin verdiği için sayı gerçek ve dolu gelir.

**ÖNERİ ·** TB-01 ile aynı düzeltme: raporlar modülü kapalıyken DashboardCarousel'de Gelir/Gider ve Nakit Akışı kartlarını hiç üretme (renderItem'da index filtresi + carousel uzunluğunu 1'e indir), hook'ları da `enabled` ile kapat — hem sızıntı hem gereksiz sorgu kapanır.

---

### FAB-02 — Ana sayfa FAB'ındaki 'Günlük Nakit Girişi' satırı hesaplar izni kapalıyken de görünüyor ve /hesaplar/ekle'ye giriş sunuyor

**Şiddet:** DUSUK · **Tür:** NAVIGASYON

**NE GÖRÜR / NE YAPABİLİR ·** Persona ana sayfadaki yeşil FAB'a basınca menüde 'Günlük Nakit Girişi' satırını görür (hesaplar modülü KAPALI olmasına rağmen). Basınca açılan modalda hesap listesi RLS nedeniyle BOŞ döner, bu yüzden 'Henüz hesap yok / İlk hesabını ekle' boş-durumu + 'HESAP EKLE' butonu çıkar. Butona basınca /hesaplar/ekle açılır, sayfa guard'ı 'İzin yok' alert'i verip geri atar. Yani hiçbir hesap adı/bakiyesi SIZMAZ; sızan şey yalnızca yasak modüle giden bir çıkmaz yol ve yanıltıcı 'hesap yok' mesajı (aslında hesap var, kullanıcı göremiyor).

**NASIL ULAŞIR ·** Ana sayfa → sağ-alt yeşil FAB → 'Günlük Nakit Girişi' → (boş durum) → 'HESAP EKLE'

**NEREDE ·** `src/app/(tabs)/index.tsx:690-695 · src/components/transaction/DailyCashModal.tsx:507-526`

**KANIT ·** FAB menü satırı hiçbir izin kontrolü taşımıyor: `{ label: t('transactions:dailyCash.enterButton'), ..., onPress: () => handleFabMenuOption(() => setDailyCashModalVisible(true)) }` (src/app/(tabs)/index.tsx:691-694) — dizide canAccessModule/canCreate çağrısı yok. Modal koşulsuz mount ediliyor (src/app/(tabs)/index.tsx:745-748) ve içeride `const { data: hesaplar } = useHesaplar()` (DailyCashModal.tsx:89) izin bakmadan çalışıyor; useHesaplar'da da izin gate'i yok (src/hooks/useHesaplar.ts:9-47, `enabled: !!isletme`). Veriyi durduran tek katman RLS: `AND COALESCE((iu.permissions->'modules'->>'hesaplar')::boolean, false)` (supabase/migrations/20260615020000_rls_4b_birikim_hesaplar.sql:29) → 0 satır. Boş-durum butonu ise izinsiz push yapıyor: `onPress={() => { handleDismiss(); router.push('/hesaplar/ekle'); }}` (DailyCashModal.tsx:516-521). Son savunma sayfada: `usePagePermission({ module: 'hesaplar', action: 'create' })` (src/app/hesaplar/ekle.tsx:32).

**ÖNERİ ·** İki satırlık düzeltme: (1) src/app/(tabs)/index.tsx'te FAB menü dizisini AddEntityButton deseniyle filtrele — 'Günlük Nakit Girişi' satırını `canAccessModule('hesaplar') && {...}` ile sar; (2) DailyCashModal boş-durumundaki 'HESAP EKLE' butonunu `canCreate('hesaplar')` ile sar ve izin yoksa 'Henüz hesap yok' yerine erişim-yok metni göster (yanıltıcı 'hesap yok' iddiasını kaldır).

---

### AS-04 — Kapalı 'hesaplar' modülü Ana Sayfa'da başlık + 'Hesap Ekle' boş-durum düğmesiyle reklam ediliyor

**Şiddet:** DUSUK · **Tür:** NAVIGASYON

**NE GÖRÜR / NE YAPABİLİR ·** Ana Sayfa'nın altında 'HESAPLAR' başlığı ve altında cüzdan ikonlu boş-durum: 'Henüz hesap yok / İlk hesabınızı ekleyin' + yeşil 'Hesap Ekle' düğmesi. Düğmeye basınca /hesaplar/ekle açılır, hemen ardından 'İzin yok' uyarısı çıkıp geri atılır. Veri sızmaz, kayıt da yazılamaz; ama kullanıcıya var olmayan bir yetki gösterilip hata ile karşılanır ve işletmede hesap modülünün var olduğu ifşa olur.

**NASIL ULAŞIR ·** Ana Sayfa → aşağı kaydır → HESAPLAR bölümü → 'Hesap Ekle'.

**NEREDE ·** `src/app/(tabs)/index.tsx:501-508`

**KANIT ·** index.tsx:493-496 bölüm başlığı koşulsuz render ediliyor; :501-508 `) : !hesaplar || hesaplar.length === 0 ? (<EmptyState ... actionLabel={t('accounts:titles.addAccount')} onAction={() => router.push('/hesaplar/ekle')} />` — canAccessModule('hesaplar') / canCreate('hesaplar') kontrolü yok. Hedef sayfa kendini koruyor: src/app/hesaplar/ekle.tsx:32 `usePagePermission({ module: 'hesaplar', action: 'create' })` → src/hooks/usePagePermission.ts:54-64 Alert + router.back()/replace. Yazma da kapalı: RLS INSERT `actions.hesaplar.can_create` istiyor (20260615020000:40-50) ve src/lib/permissions.ts:41-50 kapalı modüller için actions girdisini HİÇ yazmıyor (`if (!m[mod]) return;`).

**ÖNERİ ·** index.tsx:493'teki `<View style={styles.section}>` bloğunu `{canAccessModule('hesaplar') && ( ... )}` ile sar. Aynı bölümdeki grup toplamları/satırları da bu blokta olduğu için tek sarma yeterli. (Karşılaştırma için doğru desen aynı ekranda zaten var: AddEntityButton.tsx:36 `canCreate('hesaplar') && {...}`.)

---

### AS-05 — FAB menüsündeki 'Günlük Kasa' girişi hesaplar iznine bağlanmamış, boş modal açıyor

**Şiddet:** DUSUK · **Tür:** NAVIGASYON

**NE GÖRÜR / NE YAPABİLİR ·** Sağ alttaki + düğmesine basınca çıkan menüde 'Günlük Kasa Gir' satırı görünür. Basınca modal açılır ve 'Henüz hesap yok' mesajı gösterilir — kullanılamaz bir akış. Bakiye/veri sızmaz (RLS hesaplar tablosunu boş döndürüyor), yalnız ölü bir giriş noktası.

**NASIL ULAŞIR ·** Ana Sayfa → sağ alt + (FAB) → 'Günlük Kasa Gir'.

**NEREDE ·** `src/app/(tabs)/index.tsx:691-696`

**KANIT ·** index.tsx:691-696 FAB menü öğesi `onPress: () => handleFabMenuOption(() => setDailyCashModalVisible(true))` — izin filtresi yok (aynı menüdeki müşteri/tedarikçi satırları da filtresiz ama onlar personanın açık modülleri). DailyCashModal.tsx:89 `const { data: hesaplar, isLoading: hesaplarLoading } = useHesaplar();` ve :507-511 `filteredHesaplar.length === 0 ? ... t('accounts:messages.noAccounts')`. FAB menü dizisi index.tsx:672-697 arasında sabit; hiçbir elemanda canAccessModule/canCreate yok.

**ÖNERİ ·** FAB menü dizisini izinle filtrele: 'Günlük Kasa' satırını `canAccessModule('hesaplar')`, cari satırlarını `canAccessModule('cariler')` koşuluna bağla ve `.filter(Boolean)` uygula — AddEntityButton.tsx:35-61'deki mevcut kalıbın aynısı. Menüde hiç satır kalmıyorsa FAB'ı hiç gösterme.

---


## 6. DIŞ DEĞERLENDİRİCİYE SORULAR

Bu rapor ikinci bir görüş için hazırlandı. Karar verilmesi gereken noktalar:

### S1 — `can_see_all_users_data` varsayılanı
Şu an her izin setinde sabit `true`. `false` yapmak sızıntının büyük kısmını tek
satırda kapatır (ortak yalnız kendi girdiğini görür). **Bedeli:** mevcut ortaklar
birbirlerinin kayıtlarını artık göremez — çok kullanıcılı bir defterde bu iş akışını
bozabilir. Ayarlanabilir yapmak mı, varsayılanı çevirmek mi, dokunmamak mı?

### S2 — `islemler` RLS'ine tip kapısı
Önerilen (ek, mevcut sahip politikasına dokunmadan):
```sql
AND (islemler.type NOT LIKE 'personel\_%'
     OR COALESCE((iu.permissions->'modules'->>'personel')::boolean, false))
AND (islemler.type <> 'transfer'
     OR COALESCE((iu.permissions->'modules'->>'hesaplar')::boolean, false))
```
**Bedeli:** personel modülü kapalı mevcut ortaklar maaş kayıtlarını artık göremez.
Doğru olan bu ama görünür bir davranış değişikliği. Kademeli geçiş mümkün mü?

### S3 — `CORE_MODULES` zorlaması
`islemler` ve `kategoriler` neden kapatılamaz yapılmış? Sadelik gerekçesi yorumda
yazılı ("Özel rol de işlem/kategori akışını kullanabilsin"). Ama bu, kısıtlı ortak
kurmayı imkânsız hale getiriyor. Alternatif: `islemler`'i kapatılabilir yapmak yerine
tip bazlı görünürlük (S2) yeterli mi?

### S4 — Ana Sayfa kartları
Gelir/Gider ve Nakit Akışı kartları `dashboard` modülüne bağlı ama o da zorla açık.
Kartları `raporlar` iznine bağlamak doğru mu, yoksa Ana Sayfa'ya ayrı bir
"özet görebilir" yetkisi mi gerekir?

### S5 — Süresiz public ekstre linki (CU-02)
`level: 'view'` bir ortak bile carinin tüm ekstresini kimlik doğrulaması olmayan,
100 yıl geçerli bir URL'ye çıkarabiliyor. Link, ortak işletmeden çıkarılsa bile
yaşamaya devam ediyor. Minimum düzeltme ne olmalı — link üretimini `level`e bağlamak,
süresiz seçeneğini kaldırmak, yoksa iptal/listeleme arayüzü mü eklemek?

### S6 — Guard'sız `SECURITY DEFINER` yordamlar
`undo_import_batch` (SİLME yapıyor, hiçbir kontrol yok), `perform_nakit_avans`,
`get_personel_ozet`, `get_urun_ozet`, `update_urun_miktar`'ın NULL kolu.
Hepsine tek tip guard mı eklenmeli, yoksa kullanılmayanlar (nakit avans özelliği
kaldırılmış ama fonksiyon duruyor) düşürülmeli mi?

---

## 7. KISITLAR

- **Hiçbir kod değiştirilmedi.** Bu tur yalnız bulgu.
- **Mevcut kullanıcıları etkilememek öncelik.** Sahip temkinli davranmak istiyor;
  önerilen her değişikliğin "mevcut aktif ortaklar ne yaşar" cevabı yazılı olmalı.
- **Veritabanında silme yok.** Migration'lar yalnız ekleme/kısıtlama yapabilir.
- Denetim `16d894f` commit'ine göre; satır numaraları sonraki değişikliklerde kayabilir.

## 8. DOĞRU ÇALIŞAN YERLER (referans olsun diye)

- **+EKLE butonu** — `AddEntityButton` her satırı `canCreate(modül)` ile ayrı süzüyor;
  hiç create izni yoksa buton tamamen gizleniyor. Doğru desen bu.
- **Yazma tarafı** — kapalı modülde INSERT engelleniyor; `buildPermissions` kapalı
  modüle `actions` girdisi hiç yazmıyor, RLS de onu arıyor.
- **Atomik RPC'ler** — `update_islem_atomik` gibi yazma yordamları
  `user_can_islem_action` ile kapı tutuyor (`20260716030000`).
- **Rapor RPC'lerinin çoğu** — `get_account_report`, `get_income_by_source`,
  `get_networth_*` modül kapısı almış (`20260716040000`).
- **Sayfa koruması olan ekranlar** — `usePagePermission` kullanan ekranlar deep-link'te
  "izin yok" verip geri atıyor.
