# PAKET 0/1 — TASARIM RAPORU (v2.4)

**Durum:** TASARIM · kod yazılmadı, migration yok, üretim değiştirilmedi
**Tarih:** 26 Temmuz 2026 · **Baz commit:** `5f04873`
**Dayanak:** `docs/security/YETKI-SOZLESMESI.md` v3 + ürün sahibi kararları (26 Tem)

**Yöntem:** güncel repo kodu **+** canlı katalogdan salt-okunur envanter
(`pg_policy`, `pg_proc`, `proacl`, `isletme_users.permissions`, `islemler` CHECK, `cron.job`).

---

## ÖZET

| # | Konu | Durum |
|---|---|---|
| 0 | **Yetenek vektörü çözümleyicisi yok** | 🔴 **P0** · legacy'yi tek seviyeye collapse etmek **yetki ARTIRIR** |
| 1 | **Yazma yüzeyi tip/modül kör — beş RPC'nin ÇOK ötesinde** | 🔴 **P0** · doğrudan REST **+** 29 SECDEF yazma RPC'si · **0/29'unda modül kapısı yok** |
| 2 | Bakiye bütünlüğü — istemci deltası | 🔴 **P0** · 5 RPC · server-authoritative, doğrudan G-2 |
| 3 | `increment_balance` doğrudan `authenticated` | 🟠 5 çağrı alanı |
| 4 | `cleanup_old_islem_audit_log` anon | 🔴 **P0** · ✅ cron doğrulandı |
| 5 | Storage modül kontrolü yok | 🟠 Kayıt bağı + C3-b · C3-c yalnız dry-run |
| 6 | `p_items` / `p_taksitler` | 🟡 Residual |

### ⚠️ v2.1/v2.2'de yaptığım iki hatanın düzeltmesi

| Hata | Gerçek |
|---|---|
| *"`create_islem_with_urun_atomik` ve `reapply_urun_hareketler_for_islem`: Erişim + Modül + Aksiyon guard'ı"* | ❌ **Modül guard'ı YOK.** Canlı gövdelerde `'modules'` kelimesi **hiç geçmiyor**. Yalnız erişim + `user_can_islem_action`. **`authenticated`'a açık 29 SECDEF yazma fonksiyonunun 0'ında modül kapısı var.** |
| *"Legacy `can_delete_all` → `edit_all`" eşlemesi* | ❌ **Yetki artırır.** [usePermissions.ts:19](src/hooks/usePermissions.ts#L19) bunu **açıkça yasaklıyor**: *"eski per-modül aksiyonlar global seviyeye COLLAPSE EDİLMEZ"* |
| *"`notlar`/`birikim` okuma ve yazma fallback'i ikisi de missing→true"* | ❌ Fallback **yalnız modül görünürlüğünde**. `canCreate/canUpdate/canDelete` içinde `if (!p?.modules?.[module]) return false` — `undefined` **falsy**, fallback hiç devreye girmez (§A.3.2) |
| *"Resolver'a API rollerinde `EXECUTE` verilmez"* | ❌ **Çelişkiliydi** — restrictive RLS ve Storage policy'yi `authenticated` çalıştırıyor. Sekiz sınırlı EXECUTE modeli §B.5.1'de |

---

# A. ENVANTER (canlı, 26 Tem)

## A.1 🔴 `islemler` RLS politikaları — yazma tarafı kör

**7 politika, hepsi `PERMISSIVE`** (yani **OR**'lanıyor — yeni bir permissive politika
eklemek erişimi yalnız **genişletir**).

| Politika | Komut | Modül? | Tip? | Notlar |
|---|---|---|---|---|
| `Users can manage islemler` | ALL | — | — | Owner — sorun yok |
| **`Shared insert islemler`** | **INSERT** | ❌ **YOK** | ❌ **YOK** | `WITH CHECK` yalnız `actions.islemler.can_create` |
| **`Shared update islemler`** | **UPDATE** | ❌ **YOK** | ❌ **YOK** | `USING` = `can_update_all` OR (`can_update_own` AND `created_by`) · **`WITH CHECK` NULL** |
| **`Shared delete islemler`** | **DELETE** | ❌ **YOK** | ❌ **YOK** | `can_delete_all` OR (`can_delete_own` AND `created_by`) |
| `Shared select islemler` | SELECT | `modules.islemler` *(zorla-true çekirdek)* | ❌ | + `can_see_all_users_data` OR `created_by` |
| **`manage_linked_islemler`** | **ALL** | ❌ **YOK** | ❌ **YOK** | ⚠️ **Ayrı yazma yolu** — `cari_links.permission='full'` üzerinden; üyelik izin sistemini **tamamen baypas eder** |
| `view_linked_islemler` | SELECT | ❌ | ❌ | `cari_links` üzerinden okuma |

> **Sonuç:** Cariler-only bir kullanıcı beş atomik RPC'ye hiç dokunmadan
> `POST /rest/v1/islemler` ile `type='gelir'` veya `'personel_odeme'` yazabilir.
> **Beş RPC'ye tip kapısı eklemek bunu engellemez.**
>
> `Shared update islemler`'de **`WITH CHECK` yok** → Postgres `USING` ifadesini
> kullanır; o da tipe bakmadığı için **tip serbestçe değiştirilebilir**.

## A.2 🔴 SECURITY DEFINER yazma RPC'leri — 29 adet, **0'ında modül kapısı**

`authenticated`'a açık, gövdesinde `INSERT/UPDATE/DELETE` olan SECDEF fonksiyonlar.
SECDEF **RLS'i baypas eder** → guard gövdede olmak zorunda.

| Guard durumu | Fonksiyonlar |
|---|---|
| **Erişim + `user_can_islem_action`** *(modül yok)* | `create_islem_atomik` · `create_islem_with_urun_atomik` · `update_islem_atomik` · `delete_islem_atomik` · `taksit_plani_olustur` · `reapply_urun_hareketler_for_islem` · `retahsis_odeme` |
| **Yalnız erişim** *(aksiyon ve modül yok)* | `perform_nakit_avans` · `perform_taksit_odeme` · `delete_nakit_avans_with_reversal` · `set_urun_miktar_hedef` · `ekstre_link_olustur` · `ekstre_link_iptal` |
| **Hiçbiri** | `update_urun_miktar` · `increment_balance` · `undo_import_batch` *(ayrı hat)* |
| **Üyelik/davet akışları** *(kendi mantıkları var)* | `accept_cari_share_code` · `accept_isletme_invite` · `cancel_isletme_invite` · `create_isletme_invite` · `generate_cari_share_code` · `leave_isletme` · `remove_cari_link` · `remove_isletme_user` · `update_isletme_user` |
| **Bakım/trigger** | `cleanup_old_islem_audit_log` · `handle_new_user` · `log_islem_changes` · `record_api_usage` |

> **`'modules'` kelimesi 29 gövdenin hiçbirinde geçmiyor.**
>
> Özellikle: `nakit_avans_taksit` tipini genel atomik RPC'de reddetmek,
> **`perform_nakit_avans` / `delete_nakit_avans_with_reversal`** yollarını kapatmaz —
> onlar ayrı fonksiyonlar ve **aksiyon guard'ı bile yok**.

## A.3 ⚠️ İzin şekilleri — legacy dağılımı ve fallback bağımlılığı

| `level` | Durum | Adet | `actions.islemler.can_create` | `modules.cariler` | `can_see_all_users_data=false` |
|---|---|---:|---:|---:|---:|
| **yok** *(legacy)* | **active** | **8** | 7 | 8 | **1** |
| yok | removed | 1 | 1 | 1 | 0 |
| `edit_all` | active | 9 | 9 | 8 | 0 |
| `edit_own` | active | 4 | 4 | 4 | 0 |
| `view` | active | 2 | **0** | 2 | 0 |

**24 üyelik · 23 aktif · `permissions` hiç NULL değil.**

### A.3.1 🔴 `notlar` / `birikim` anahtar dağılımı — missing→true bağımlılığı

| Anahtar | Aktif üyelikte **var** | **YOK** | Açıkça `false` |
|---|---:|---:|---:|
| `modules.notlar` | 15 | **8** | 1 |
| `modules.birikim` | 15 | **8** | **6** |

### A.3.2 ⚠️ Fallback **yalnız modül görünürlüğünde** — aksiyonda değil

[usePermissions.ts](src/hooks/usePermissions.ts) iki farklı davranış uyguluyor:

```ts
// canAccessModule — fallback UYGULANIR
const v = currentPermissions?.modules?.[module];
if (v === undefined) return DEFAULT_TRUE_MODULES.includes(module);   // → true

// canCreate / canUpdate / canDelete — fallback UYGULANMAZ
if (!p?.modules?.[module as ModuleName]) return false;   // undefined → FALSE
if (p.level) return p.level !== 'view';
return p.actions?.[module]?.can_create ?? false;         // legacy, birebir
```

> **v2.3'teki *"okuma ve yazma fallback'i ikisi de missing→true"* ifadesi yanlıştı.**
> Anahtarı eksik legacy kullanıcı **notu görür**, ama `canCreate('notlar')`
> **false** döner — `undefined` falsy olduğu için fallback hiç devreye girmez.

### A.3.3 🔴 Sunucu ile istemci ayrışıyor — `notlar` yazma yolunda **aksiyon kapısı YOK**

Canlı `notlar` politikaları:

| Politika | Komut | Kontrol |
|---|---|---|
| `Shared insert notlar` | INSERT | `COALESCE(modules->>'notlar', true)` — **başka hiçbir şey** |
| `Shared update notlar` | UPDATE | modül *(missing→true)* **AND** `created_by = auth.uid()` |
| `Shared delete notlar` | DELETE | modül *(missing→true)* **AND** `created_by = auth.uid()` |
| `Shared select notlar` | SELECT | modül *(missing→true)* |

**Hiçbirinde `actions.notlar.*` veya `level` kontrolü yok.**

> Yani `notlar` modülü açık (veya anahtarı eksik) her aktif üye, **hiçbir yazma
> aksiyonu olmasa bile** REST üzerinden not oluşturabiliyor. İstemci UI'da gizliyor
> (`canCreate` false), sunucu izin veriyor. Bu **istemci semantiği değil, mevcut
> sunucu açığıdır**; resolver bunu **aynen çoğaltmayacak**.

**Karşılaştırma — `hesaplar` doğru yapıyor:**

```sql
-- Shared insert hesaplar
COALESCE(actions->'hesaplar'->>'can_create', false)              -- aksiyon ZORUNLU
AND (type <> 'birikim' OR COALESCE(modules->>'birikim', true))   -- birikim: TİP FİLTRESİ
```

Birikim fallback'i bir **tip filtresi**; aksiyon kapısı ayrıca ve `false` varsayılanıyla
uygulanıyor. Hedef model budur.

> **8 aktif üyelik modül görünürlüğü fallback'ine bağlı** — bu korunacak.
> **Aksiyon kapısı ise korunmayacak**: §B.1.4-a'daki delta olarak ayrıca onaya sunulur.

## A.4 İşlem tipleri

`islemler.type` = `varchar NOT NULL` **+ CHECK ile 16 değer**. Üretimde 15 tip kullanılıyor;
**`nakit_avans_taksit`** CHECK'te **var**, üretimde **0 satır**, özellik **emekli**,
yetki matrisinde **yok** → `default → no-op` davranışının gerçek hedefi.

**Eski veri tutarsızlıkları (~15 satır):** `gelir`'de `hedef_hesap_id` dolu (5) ·
`gelir`'de `cari_id` dolu (1) · `cari_satis`'ta `cari_id` NULL (4) · `cari_odeme` (3) ·
`cari_tahsilat`'ta `hesap_id`/`cari_id` NULL (1/1) · `personel_odeme`'de `personel_id` NULL (1).

## A.5 `anon` çalıştırılabilen 25 fonksiyon — risk sınıfları

| Sınıf | Gerçek çağıran | Aksiyon |
|---|---|---|
| **S1 — Bakım/cron** — yalnız **`cleanup_old_islem_audit_log`** | ✅ **`cron.job` · `username=postgres` · veritabanı içi doğrudan**, HTTP/service_role değil | **P0 · güvenle daraltılabilir** — §A.5.1 |
| **S2 — Trigger** (4) | Trigger motoru | Matris sonrası |
| **S3 — Kota** (3) | İstemci + Edge | ⚠️ `auth.uid()` yok, `p_user_id` parametreyle |
| **S4 — Yardımcı** (5) | Fonksiyon içinden | RPC yüzeyi olmamalı |
| **S5 — İstemci RPC** (10) | İstemci | `auth.uid()` var → anon'da etkisiz |
| **S6/S7** | `undo_import_batch` *(ayrı hat)* · `increment_balance` | §B.7 |

Tamamı `=X/postgres` (**PUBLIC**) **artı** açık `anon` grant'ı → `REVOKE FROM PUBLIC, anon`
**ikisi birden** gerekli.

### A.5.1 ✅ P-A için kanıtlanmış emsal — kardeş cron fonksiyonları zaten kilitli

Üç cron fonksiyonunun ACL'i karşılaştırıldığında:

| Fonksiyon | Canlı ACL | Cron çağrısı |
|---|---|---|
| `app_events_rollup_and_trim` | `{postgres=X, service_role=X}` — **PUBLIC/anon/authenticated YOK** | jobid 15, `postgres`, `SELECT public.f()` |
| `usage_snapshot_al` | `{postgres=X, service_role=X}` — **PUBLIC/anon/authenticated YOK** | jobid 16, `postgres`, `SELECT public.f()` |
| **`cleanup_old_islem_audit_log`** | `{=X, postgres=X, anon=X, authenticated=X, service_role=X}` | jobid 8, `postgres`, `SELECT public.f()` |

> **Aynı çağrı mekanizmasını kullanan iki kardeş fonksiyon, hedef ACL'le
> üretimde sorunsuz çalışıyor.** Bu, P-A'nın cron'u bozmayacağının deneysel kanıtı —
> tek başına teorik akıl yürütme değil.
>
> P-A böylece **tek fonksiyonluk** bir düzeltmeye iniyor: `cleanup_old_islem_audit_log`
> ACL'ini kardeşlerininkiyle **aynı hâle** getirmek.

## A.6 Storage

| Yükleyici | Yol |
|---|---|
| İşlem fotoğrafı | `{isletmeId}/{islemId}_{timestamp}.webp` ([useIslemPhoto.ts:127](src/hooks/useIslemPhoto.ts#L127)) |
| Not fotoğrafı | `{isletmeId}/notlar/{noteId}_{timestamp}.webp` ([useNotePhoto.ts:24](src/hooks/useNotePhoto.ts#L24)) |

5 politika; dördü yalnız *"klasör = owner ya da aktif üye olunan işletme"*.
**Modül · aksiyon · `created_by` · pasif/arşiv · kayıt sahipliği — hiçbiri yok.**
Üç yükleme akışının **ikisi önce upload ediyor**; hata yolu
`catch { /* ignore photo error */ }` → **kalıcı yetim dosya**.

---

# B. PAKET 0

## B.1 🔴 P0-R — YETENEK VEKTÖRÜ ÇÖZÜMLEYİCİSİ

> **Karar:** legacy `actions` **tek `etkin_seviye`ye collapse EDİLMEZ.**

### B.1.1 Neden collapse yasak

[usePermissions.ts:11-20](src/hooks/usePermissions.ts#L11-L20) sözleşmeyi açıkça yazıyor:

> *"`level` YOKSA (eski-format kullanıcı): eski per-modül `actions` mantığı kullanılır.
> Böylece geçiş döneminde eski-format kullanıcılar AYNEN çalışır ve yetkileri ARTMAZ
> (eski per-modül aksiyonlar global seviyeye **COLLAPSE EDİLMEZ**)."*

v2.2'deki eşleme (`can_delete_all → edit_all`) bu kuralı ihlal ediyordu:
`can_delete_all=true, can_create=false` olan legacy kullanıcı `edit_all` sayılıp
**ödeme oluşturabilir** hâle gelirdi — **yetki artışı**.

Ayrıca kod **per-modül**: `p.actions?.[module]?.can_create`. Collapse hem **aksiyon**
hem **modül** boyutunu düzleştiriyordu — iki ayrı hata.

### B.1.2 Çözümleyicinin çıktısı: modül × aksiyon vektörü

Tek `etkin_seviye` yerine, **her modül için** yetenek vektörü:

| Yetenek |
|---|
| `can_view` |
| `can_create` |
| `can_update_own` |
| `can_update_all` |
| `can_delete_own` |
| `can_delete_all` |
| `can_see_all_users_data` *(üyelik düzeyinde)* |

### B.1.3 Türetme kuralları

| Girdi | Kural |
|---|---|
| **Owner** (`isletmeler.user_id = auth.uid()`) | Tüm yetenekler `true`, diğer alanlara bakılmaz |
| **`level` VARSA** | Yetenekler `level`'dan türetilir: `view` → yalnız `can_view` · `add` → `+can_create` · `edit_own` → `+can_update_own, can_delete_own` · `edit_all` → `+can_update_all, can_delete_all` |
| **`level` YOKSA (legacy)** | `actions[module]` içindeki **her bayrak BİREBİR korunur** — birbirine **yükseltilmez**, modüller arası **taşınmaz** |
| **Eksik/bozuk değer** | 🔒 **deny-by-default** |

> `etkin_seviye` istenirse **UI etiketi** olarak üretilebilir; **güvenlik kararı vermez.**

### B.1.4 Modül görünürlüğü ≠ aksiyon yeteneği

Fallback **yalnız modül görünürlüğüne** uygulanır. Yazma her zaman ayrı aksiyon ister:

```
YAZABİLİR =  (modül/bağlam açık)
         AND (actions[module].can_*  VEYA  güncel level'dan türetilen can_*)
```

| Boyut | `notlar` · `birikim` | Diğer modüller |
|---|---|---|
| **Modül görünürlüğü** (okuma, tip filtresi) | anahtar yoksa → **`true`** *(8 aktif üyelik buna bağlı)* | anahtar yoksa → `false` |
| **Aksiyon yeteneği** (create/update/delete) | `actions[module].can_*` **birebir**, yoksa → **`false`** | Aynı |

**Somut sonuçlar:**

| Vaka | Sonuç |
|---|---|
| `notlar` anahtarı eksik legacy kullanıcı → **not okuma** | ✅ Görür — fallback |
| Aynı kullanıcı, `actions.notlar.can_create` yok → **not oluşturma** | ❌ **Reddedilir** — fallback aksiyona uygulanmaz |
| `birikim` anahtarı eksik → **birikim tipi filtresi** | ✅ Geçer — fallback |
| Aynı kullanıcı, `actions.hesaplar.can_create=true` → **birikim hesabı oluşturma** | ✅ Mümkün — mevcut `hesaplar` politikası zaten böyle |
| Aynı kullanıcı, `actions.hesaplar.can_create=false` → hesap oluşturma | ❌ **Reddedilir** |

### B.1.4-a ⚠️ Onay gerektiren erişim deltası — `notlar` aksiyon kapısı

§A.3.3'te ölçüldü: canlı `notlar` politikalarında **hiç aksiyon kontrolü yok**.
Resolver bunu çoğaltmayacağı için, `notlar` yazma yoluna aksiyon kapısı eklemek
**mevcut sunucu davranışını daraltır**.

> Bu **"sıfır delta" değildir** — bilinçli bir **erişim daraltması**dır.

### ✅ KARAR: D-N1 *(ürün sahibi, 26 Tem)*

> **Not oluşturma / düzenleme / silme, modül görünürlüğüne EK OLARAK ilgili aksiyon
> yetkisini de zorunlu tutar.**

| | |
|---|---|
| **Gerekçe** | Mevcut istemci davranışıyla **uyumlu** (`canCreate('notlar')` zaten `false` döndürüyor) ve **doğrudan REST açığını kapatır** |
| **Beklenen kullanıcı etkisi** | **Yok** — UI bu yolu zaten göstermiyor; açık yalnız doğrudan REST çağrısıyla sömürülebiliyordu |
| **Uygulanacak yer** | `notlar` INSERT/UPDATE/DELETE politikaları — resolver'ın aksiyon vektörü üzerinden |
| **Delta kaydı** | Sıfır-delta kabul testinin (§B.1.6) **bilinen ve onaylı istisnası** |
| **Test** | **N-L7** — modül görünür, `can_create` yok → **reddedilir** |

### B.1.4-b Backfill ve fallback ömrü

> K9 backfill'i yapılmadan resolver bu iki anahtarı `false` kabul ederek
> **modül görünürlüğünü** değiştirmez. Fallback'ler resolver içinde **ayrı ayrı
> belgelenmiş sabitler** olarak durur; K9 uygulanınca **tek yerden** kalkar.

### B.1.5 İşlem yazma yollarında kapsam ayrımı

| Kontrol | Kaynak |
|---|---|
| **Aksiyon kapsamı** | `actions['islemler']` / `level` → `can_create` · `can_update_*` · `can_delete_*` |
| **Bağlı varlık kapısı** | İşlem **tipinin** modül kapısı (§B.2.4) — `cariler` · `personel` · `hesaplar` · `urunler` |

İkisi **AND**'lenir. Aksiyon `islemler` üzerinden, modül **tipten** gelir.

### B.1.6 🔬 Kabul testi — sıfır delta

> **24 üyeliğin resolver çıktısı, mevcut `usePermissions` semantiğiyle
> modül × aksiyon bazında salt-okunur karşılaştırılır.**
> **Onaylı deltalar dışında erişim artışı veya azalışı SIFIR olmalı.**

Karşılaştırma matrisi: 24 üyelik × 6 modül × 6 yetenek = **864 hücre**.

§B.1.4 ayrımı doğru uygulandığında bu karşılaştırma **sıfır sapma** vermelidir —
`usePermissions` zaten modül görünürlüğü ile aksiyonu ayırıyor.

> **Tek bilinen istisna:** §B.1.4-a'daki `notlar` aksiyon kapısı (**D-N1, onaylı**).
> O, istemciyle değil **sunucuyla** arasındaki bir deltadır; `usePermissions`
> karşılaştırmasında görünmez. Onaylı istisna olarak kaydedilir.

Gerekçesiz tek bir sapma paketi **bloke eder**.

### B.1.7 Backfill yasağı

> P0 sırasında `isletme_users.permissions` **değiştirilmez**. K9 veri yazımı
> **ayrı onayda** kalır. Legacy uyumluluğu **yalnız okuma tarafı normalizasyonuyla**.

Çözümleyici **private şemada** (ör. `internal`); **Data API'de expose edilmez**.
`authenticated` rolüne yalnız RLS/Storage politikalarının çalışması için gereken
**minimum `USAGE` + `EXECUTE`** verilir — ayrıntı §B.5.1.

## B.2 🔴 P0-0 — YAZMA YÜZEYİNİN TAMAMI

> **Beş RPC'yi düzeltmek P0-0'ı kapatmaz.** Doğrudan REST ve 29 SECDEF yazma
> RPC'si açık kalır.

### B.2.1 Tam yazma yüzeyi matrisi

| # | Yüzey | Bugünkü durum | Paket |
|---|---|---|---|
| **1** | **Doğrudan REST** `INSERT/UPDATE/DELETE /rest/v1/islemler` | 🔴 Modül **yok**, tip **yok**; UPDATE'te `WITH CHECK` **yok** | **P-C1** |
| **2** | **Beş `p_balance_ops` RPC'si** | 🔴 Erişim + aksiyon var; modül **yok**, tip **yok**, delta doğrulanmıyor | **P-C2** |
| **3** | **Diğer 24 SECDEF yazma RPC'si** | 🔴 Modül **0/29**; bazılarında aksiyon guard'ı da yok (`perform_nakit_avans`, `update_urun_miktar`, …) | **P-C3** |
| **4** | **`manage_linked_islemler`** (`cari_links.permission='full'`) | 🔴 ALL komutu · üyelik izin sistemini **baypas eder** | **P-C1** |
| **5** | **Edge / service-role** (`cari-ekstre` vb.) | RLS'i hiç görmez | **P-C3** |
| **6** | **Cron / sistem** | `postgres` rolü, veritabanı içi | **İstisna** — §B.2.5 |

### B.2.2 Doğrudan REST — `AS RESTRICTIVE` politikalar

Mevcut politikaların **hepsi `PERMISSIVE`** (OR'lanır) → yeni permissive politika
eklemek erişimi yalnız **genişletir**. Doğru araç **`AS RESTRICTIVE`** (AND'lenir):

| Komut | Restrictive politika içeriği |
|---|---|
| **INSERT** | `WITH CHECK`: **yeni tip** yetkili **AND** bağlı varlıklar (`cari_id`/`personel_id`/`hesap_id`/`hedef_hesap_id`/`urun_id`) aynı işletme ve ilgili bağlamda kullanılabilir |
| **UPDATE** | `USING`: **eski tip** yetkili · `WITH CHECK`: **yeni tip** ve yeni varlıklar yetkili |
| **DELETE** | `USING`: **mevcut tip** yetkili **AND** sahiplik aksiyonu (`can_delete_all` veya `can_delete_own` + `created_by`) |

Hepsi **kanonik resolver'ı** çağırır (§B.1). Mevcut permissive politikalar
**kaldırılmaz** — restrictive olanlar üzerine **additive** biner.

> **Okuma RLS daraltması bu pakette DEĞİL** — P-I'de, minimum-sürüm kapısından sonra.

### B.2.3 SECDEF RPC'ler — guard gövdede

SECDEF **RLS'i baypas ettiği için** restrictive politikalar bu fonksiyonlara
**uygulanmaz**. Aynı kontroller **gövdelerinde ayrıca** taşınmalı:
erişim **+** aksiyon **+** **modül/tip kapısı** **+** varlık doğrulaması.

### B.2.4 Tip → modül matrisi

> **Kaynak: onaylı ürün sözleşmesi** (`YETKI-SOZLESMESI.md` v3 §1 + §2.1).
> Canlı doluluk oranları alan kullanımını **doğrulayan kanıttır** — kuralın kaynağı değil.
> Matris sözleşmeyle **birebir eşleşir**.

| Tip | Gereken modül(ler) | Hesaba dokunur |
|---|---|---|
| `gelir` · `gider` | **Hesaplar** | ✅ |
| `transfer` | **Hesaplar** (iki hesap) | ✅ ×2 |
| `cari_alis` · `cari_satis` · `cari_alis_iade` · `cari_satis_iade` | **Cariler** | ❌ |
| `cari_odeme` · `cari_tahsilat` | **Cariler** *(K13: Hesaplar kapalı olabilir)* | ✅ |
| `personel_gider` · `personel_satis` · `personel_izin_hakki` · `personel_izin_kullanimi` | **Personel** | ❌ |
| `personel_odeme` · `personel_tahsilat` | **Personel + Hesaplar birleşik kuralı** | ✅ |
| **`nakit_avans_taksit`** | **YOK — emekli özellik → deny** | — |

**Bilinmeyen tip:** yetkilendirme allowlist'i CHECK'ten **bağımsızdır** ve
**`ELSE false` / `RAISE 42501`** ile biter. *"default → no-op"* yetkilendirmede kullanılmaz.
**Yeni tip eklenirse** hem server allowlist'i hem test matrisi güncellenmeden kullanılamaz.

### B.2.5 Sistem yolları — dar istisna

> Yalnız **açıkça tanımlanmış** sistem yolları istisnadır (cron `postgres`,
> belirlenmiş Edge fonksiyonları). **Kullanıcı JWT yolu olarak kullanılamaz.**
> Her istisna adıyla listelenir; listede olmayan yol istisna değildir.

### B.2.6 🔒 P0-0 kapanma kriteri

P0-0 **ancak** şu negatif testlerin **tamamı** geçtiğinde kapalı sayılır:

| # | Test |
|---|---|
| 1 | Cariler-only kullanıcı **doğrudan REST** ile `gelir` / `personel_odeme` **oluşturamaz** |
| 2 | **REST UPDATE** ile izin verilmeyen tipe **geçemez** |
| 3 | **REST DELETE** ile kapalı modül kaydını **silemez** |
| 4 | Aynı saldırılar **beş atomik RPC'de** reddedilir |
| 5 | **Diğer SECDEF yazma RPC'leri** kapalı modül üzerinden **çağrılamaz** |
| 6 | **Owner ve meşru legacy kullanıcı akışları çalışmaya devam eder** |

## B.3 🔴 P0-1 — İstemci deltası

### B.3.1 `p_balance_ops` alan beş RPC

`create_islem_atomik` · `create_islem_with_urun_atomik` · `update_islem_atomik` ·
`delete_islem_atomik` · `taksit_plani_olustur`
— hepsi SECDEF, `anon` ❌, `authenticated` ✅. Canlıda `increment_balance` çağıran
**başka fonksiyon yok**.

### B.3.2 Server-authoritative türetme

| Akış | Sunucunun türettiği |
|---|---|
| **create** | Yeni işlem satırından apply |
| **update** | **DB'deki eski satırdan** reverse **+ doğrulanmış yeni satırdan** apply |
| **delete** | **DB'deki mevcut satırdan** reverse |

İmza ve `p_balance_ops` eski client uyumu için **korunur**; uygulanacak değer **sunucununki**.

**Geçiş: doğrudan G-2.** G-1 penceresi yok. Gözlem isteniyorsa sunucu **kendi deltasını
uyguladıktan sonra** uyuşmazlığı **yalnız telemetriye** yazar → **P0 kapalı kalır**.

**Kapsam:** 16 CHECK tipi (matriste olmayan → deny) · çapraz kur
(`calculateTargetAmount`) · `roundCurrency` (kuruş farkı kabul edilmez) ·
`hesaplar`/`cariler`/`personel` · çok bacaklı tipler.
**Kabul kapısı:** her tip × {aynı para birimi, çapraz kur} → `computeBalanceOps`
([islemBalanceOps.ts:37](src/lib/islemBalanceOps.ts#L37)) ile **birebir**.

## B.4 Legacy tutarsız satırların update kuralı

| # | Kural |
|---|---|
| **1** | **Finansal etkisi olmayan alanlar** (açıklama, fotoğraf, not) **düzenlenebilir** |
| **2** | **Mevcut geçersiz alan yalnız aynı değerde korunabilir**; **yeni geçersizlik oluşturulamaz** |
| **3** | **Tip, tutar, kur, para birimleri veya bakiye etkileyen varlık ID'leri** değişecekse → yeni satır **bütünüyle geçerli** olmalı ya da **önce eksik bağ onarılmalı** |
| **4** | Mevcut bozuk satırlar **otomatik değiştirilmez / backfill edilmez** |
| **5** | **delete**, DB'deki mevcut satırdan türetilen **gerçek etkiyi** geri alır, **ayrıca kayıt onarımı yapmaz** |

## B.5 Projeksiyon uçları — tamamı RPC

View'da `EXECUTE` yoktur (`SELECT` grant'ı + farklı semantik) → hepsi açık imzalı
guard'lı RPC: `SECURITY DEFINER` + `SET search_path` + `REVOKE FROM PUBLIC, anon` +
`GRANT TO authenticated`.

| # | Uç | Sözleşme | Döndüreceği |
|---|---|---|---|
| **U-1** | Minimal hesap seçici | K13 / D31 | `id` · `ad` · `para birimi` · `tür` · `ikon` |
| **U-2** | Ürün hareketinde minimal cari | §1.2 / D30 | `ad` |
| **U-3** | Bağlamsal not okuma | K5 / D24 | not alanları; bağlı varlığın **adı** dışında bilgi yok |
| **U-4** | İşlem satırı — bağlam projeksiyonlu | §2.1 | tip/tutar/tarih/açıklama + izinli bağlam alanları |

**Guard:** `(modül/bağlam izni) AND (can_see_all_users_data OR created_by = auth.uid())`
— değerlerin tamamı **resolver'dan**, ham JSON okuması yok.
**Tek istisna U-1:** `can_see_all_users_data` uygulanmaz (D31).

**U-1:** `get_odeme_hesap_secenekleri(p_isletme_id uuid) RETURNS TABLE(id, ad, para_birimi, tur, ikon)`
· guard: erişim **AND** `modules.cariler` **AND** `can_create` *(vektörden — ham `level` değil)*
· filtre: `is_active AND NOT is_archived AND (type <> 'birikim' OR (modules.hesaplar AND modules.birikim))`
· `balance` **dönmez**.

### B.5.1 🔑 Resolver'ın EXECUTE modeli

> **v2.3 çelişkisi düzeltildi.** Önceki metin *"API rollerine `EXECUTE` verilmez"*
> derken P-C1 restrictive RLS ve P-F Storage politikalarının **aynı resolver'ı**
> çağırmasını planlıyordu. RLS ifadesini `authenticated` kullanıcı çalıştırdığı için
> çağrı yetkisi teknik olarak **verilmek zorunda**.
>
> **Doğru ifade:** çözümleyici **Data API'de expose edilmez**; `authenticated` rolüne
> yalnız RLS/Storage politikalarının çalışması için gereken **minimum `USAGE` + `EXECUTE`**
> verilir. Koruma "hiç yetki yok"tan değil, **şemanın expose edilmemesinden** ve
> aşağıdaki sınırlardan gelir.

**Güvenli model:**

| # | Kural |
|---|---|
| 1 | Resolver **exposed olmayan private şemada** (ör. `internal`) |
| 2 | Şema, Supabase **Data API "exposed schemas"** listesinde **değil** → PostgREST hiç yönlendirmez |
| 3 | Yalnız **policy çalışması için gereken minimum** `USAGE` (şema) + `EXECUTE` (fonksiyon) `authenticated`'a verilir |
| 4 | Fonksiyon **caller tarafından seçilebilen `user_id` parametresi kabul etmez** — kullanıcı kimliği **daima `auth.uid()`**. `isletme_id`, modül, aksiyon, kayıt sahibi gibi **bağlam parametreleri alabilir**; bunlar **tenant kapsamında doğrulanır** |
| 4-a | Çıktı **ham `permissions` JSON'u değildir** ve **başka kullanıcının izinlerini içermez** — yalnız **mevcut kullanıcı için** gereken boolean/yetenek sonucu üretilir |
| 5 | `SECURITY DEFINER` + `SET search_path` + **sabit şema adları** |
| 6 | **Başka kullanıcının izinlerini döndüren genel bir RPC'ye dönüşmez** — bağlam parametreleri yalnız *"bu kullanıcı, bu tenant'ta, bu modül/aksiyon için yetkili mi?"* sorusunu daraltır |
| 7 | PostgREST'ten **doğrudan çağrılamadığı test edilir** |
| 8 | Restrictive RLS ve Storage policy **içinden başarıyla çağrıldığı test edilir** |

Policy-safe bir wrapper kullanılacaksa **aynı sekiz sınır** geçerlidir.

**Bakiye türetme yardımcısı** aynı private şemada durur; onun RLS'ten çağrılması
gerekmediği için `authenticated`'a `EXECUTE` **verilmez** — yalnız guard'lı RPC'ler
kendi `SECURITY DEFINER` bağlamından çağırır.

## B.6 Yetkili hesap kümesi — tipe göre

| İşlem tipi | Yetkili hesap kümesi |
|---|---|
| `cari_odeme` · `cari_tahsilat` | **Cariler + yazma yeteneği** · aktif/arşivsiz uygun hesap *(K13)* |
| `gelir` · `gider` · `transfer` | **Hesaplar** |
| `personel_odeme` · `personel_tahsilat` | **Personel–Hesaplar birleşik kuralı** |
| Birikim hesabı hedefleniyorsa | **Hesaplar + Birikim** |
| Hesaba dokunmayan tipler | Hesap alanı **dolu gelmemeli** |

## B.7 `increment_balance` — kademeli emeklilik

| # | Dosya | Satır | Yerine geçecek |
|---|---|---|---|
| 1 | [useDataImport.ts](src/hooks/useDataImport.ts#L616) | 616, 649 | `import_set_opening_balance` (owner-only) |
| 2 | [useImportBalance.ts](src/hooks/useImportBalance.ts#L16) | 16 | 1'e sarılır |
| 3 | [useIleriTarihliIslemler.ts](src/hooks/useIleriTarihliIslemler.ts#L514) | 514 | `ileri_tarihli_gerceklestir` |
| 4 | [usePendingIslemler.ts](src/hooks/usePendingIslemler.ts#L49) | 49 | `pending_islem_onayla` |
| 5 | [useIslemler.ts](src/hooks/useIslemler.ts#L372) | 372 | **Yalnız legacy fallback** — telemetriyle doğrulanıp ilk kaldırılacak |

## B.8 🟡 Residual — `p_items` / `p_taksitler`

`p_items` (`create_islem_with_urun_atomik`): ürün aynı işletme mi · yetkili mi ·
satır toplamı işlem tutarıyla uyumlu mu · miktar/fiyat işareti.
`p_taksitler` (`taksit_plani_olustur`): taksit toplamı ana tutara eşit mi ·
tarih sırası/aralığı · cari/personel yetkili mi. **P0'ı geciktirmez** → P-J.

## B.10 ✅ `permissions.restrictions` — legacy/emekli metadata *(G6 kararı)*

### B.10.1 Bulgu

`permissions` içinde tasarımda yer almayan bir üst anahtar:

| İçerik | Üyelik |
|---|---|
| `{"islem_types": ["gelir","gider","cari_satis","cari_tahsilat"]}` | 3 aktif |
| `{"cari_types":["tedarikci"], "islem_types":["cari_alis","cari_odeme","cari_alis_iade"]}` | 1 aktif (+1 removed) |
| `{}` veya `NULL` | 19 |

**Hiçbir yerde uygulanmıyor** — canlı fonksiyon ve politika taraması `restrictions`
için **boş** döndü; `src/` içindeki tek referans [multiUser.ts:36](src/types/multiUser.ts#L36)
*"restrictions kaldırılacak"* yorumu. Yani 4 aktif üyelik kendini kısıtlı sanıyor, değil.

### B.10.2 Karar

> **Legacy/emekli metadata olarak kalır.** Resolver'da ve P-C1 yetkilendirmesinde
> **uygulanmaz**.

| Kural | |
|---|---|
| Mevcut JSON kayıtları | **Silinmez, backfill edilmez** |
| Yetkinin kaynağı | Onaylanan **modül × aksiyon × işlem-tipi/modül** sözleşmesi |
| Gizli `restrictions` alanı | Erişimi **ne genişletir ne daraltır** |
| İleride işlem-tipi kısıtı istenirse | **UI'da görülebilen, sahibin yönetebildiği ayrı bir özellik** olarak tasarlanır — gizli JSON alanı olarak değil |

Referans port ([permissionResolver.reference.ts](src/lib/permissionResolver.reference.ts))
bu kapsam-dışılığı dosya başında açıkça belirtir.

## B.11 ✅ Bilinmeyen `level` — fail-closed *(G7 kararı)*

### B.11.1 İstemcideki fail-open davranış

[usePermissions.ts:35](src/hooks/usePermissions.ts#L35):

```ts
if (p.level) return p.level !== 'view';   // ← bilinmeyen level → can_create = TRUE
```

Yazım hatası, gelecekteki bir değer veya bozuk kayıt **yazma yetkisi açar**.

### B.11.2 Karar: sunucu açık allowlist kullanır

> Bilinmeyen `level` **allowlist dışında kalır ve TÜM yetenekler deny olur**
> (`can_view` dahil). Sunucu istemcinin fail-open davranışını **çoğaltmaz**.

```sql
IF v_level NOT IN ('view', 'add', 'edit_own', 'edit_all') THEN
  RETURN QUERY SELECT false, false, false, false, false, false, false;
  RETURN;
END IF;
```

`can_create` de pozitif allowlist'ten türer: `v_level IN ('add','edit_own','edit_all')`
— `<> 'view'` **kullanılmaz**.

### B.11.3 Sıfır kullanıcı etkisi — canlı doğrulama (26 Tem)

| `level` | Adet | Aktif | Allowlist içinde |
|---|---:|---:|---|
| `NULL` *(legacy)* | 9 | 8 | ✅ |
| `edit_all` | 9 | 9 | ✅ |
| `edit_own` | 4 | 4 | ✅ |
| `view` | 2 | 2 | ✅ |

**Allowlist dışı kayıt YOK.** Bu nedenle daraltma **sıfır kullanıcı etkili**
güvenlik deltasıdır.

> **Parite testine etkisi:** gerçek fixture üzerinden 864 hücre **sıfır sapma**
> vermeye devam eder (allowlist dışı veri yok). Sapma yalnız **sentetik S6**
> vakasında görülür ve test bunu **beklenen ve onaylı** olarak kilitler.
> Uygulama öncesi bu dağılım **salt-okunur tekrar** doğrulanacak.

---

# C. PAKET 1 — STORAGE

**Yetki kararı kayıt bağından** (yol yalnız ucuz ön-filtre):

```
YETKİLİ ⟺ EXISTS (izin verilen bir kayıt r
                  WHERE r.photo_path = storage.objects.name
                    AND kullanıcı r için yetkili)      ← resolver
```

| Komut | Kural |
|---|---|
| **SELECT** | Kayıt bağı + modül + (`can_see_all_users_data` OR `created_by`) + pasif/arşiv |
| **INSERT** | Modül + `can_create` *(vektörden)* + hedef klasör = kullanıcının işletmesi |
| **UPDATE** | SELECT koşulu + `can_update_own/all` + kayıt sahipliği |
| **DELETE** | UPDATE + `can_delete_own/all` |

**C3-b geçici kaçış kolu:**
```
owner = auth.uid()
AND NOT EXISTS (hiçbir islemler/notlar kaydı bu dosyaya bağlı değil)
```
⚠️ İkinci koşul zorunlu — yoksa dosya sonradan kapalı modüle bağlandığında yükleyen
görmeye devam eder, modül izolasyonu delinir.

**C3-c yalnız dry-run.** Otomatik fiziksel silme **onaylı değil**. Silme yapılırsa:
doğrudan SQL ile `storage.objects` satırı **silinmez** (satır gider, gerçek dosya
bucket'ta kalır → görünmez ama ücretlendirilir) — **Storage API** üzerinden ·
yedek · bekleme süresi · **ayrı açık silme onayı**.

---

# D. ÇAPRAZ KESEN

**Cache (D28):** `gcTime` 24 saat ([queryClient.ts:18](src/lib/queryClient.ts#L18));
izin daralınca temizlenmiyor. Tetikleyici: **yetenek vektöründe** herhangi bir
`true→false`. Kapsam: o işletmenin tüm query key'leri. **Önce temizle, sonra render.**
`AsyncStorage` persist kaydı da silinir.

**Bildirimler:** `notify_linked_users_on_islem_insert` ve `send-z-report` kapalı
modül verisi taşımamalı.

**Rollout (B altyapısı):** additive güvenli uçlar → yeni client → **sürüm dağılımı
ölçümü** → temel RLS **okuma** daraltması + **minimum-sürüm kapısı** *(yalnız shared-mode)*.

---

# E. BAKİYE YETERLİLİK KONTROLÜ — E-a

`insufficientBalance` çeviri anahtarı var, **kullanan kod yok**; ödeme yolunda
bakiye kontrolü yok → ikili arama kanalı **fiilen yok**.

> **E-a:** kontrol **eklenmesin**. Eklenirse `hesaplar` yetkisi olmayana **sebep
> veya bakiye belirtilmesin**.

**Ayrı ürün kararı:** *"Mevcut negatif hesap bakiyesi davranışı korunur."*
*"Negatif stok kasıtlı"* kararı bunu **kanıtlamaz** — E-a'nın gerekçesi değil.

---

# F. TEST SENARYOLARI

## F.1 Pozitif

| # | Senaryo | Beklenen |
|---|---|---|
| P1 | Cariler + `can_create`, Hesaplar kapalı → seçicideki uygun aktif hesaba cari tahsilatı | ✅ K13 |
| P2 | Cariler + Hesaplar açık | Tam liste; birikim yalnız Birikim de açıksa |
| P3 | `can_update_own` kendi ödemesini başka uygun hesaba taşır | Sunucu türevli reverse+apply, tek transaction |
| P4 | Owner import geri alır | Başarılı *(ayrı hat)* |
| P5 | Ürünler açık, Cariler kapalı → ürün detayı | Cari **adı** görünür, bakiye yok |
| P6 | Sunucu türevi = `computeBalanceOps` — 15 tip × {aynı kur, çapraz kur} | **Birebir** |
| P7 | Kendi yüklediği, **henüz bağsız** fotoğrafı görüntüleme | Başarılı *(C3-b)* |
| P8 | Legacy kullanıcı (`level` yok, `can_create=true`) → cari ödemesi | ✅ **Başarılı** *(8 aktif üyelik)* |
| P9 | Legacy bozuk satırda **yalnız açıklama** değişikliği | ✅ Başarılı — kural 1 |
| **P10-a** | **`modules.notlar` YOK** → not **okuma** | ✅ **Başarılı** — modül fallback'i *(8 üyelik)* |
| **P11-a** | **`modules.birikim` YOK** → birikim tipi **filtresi** | ✅ **Geçer** — tip filtresi fallback'i |
| **P11-b** | `modules.birikim` YOK **+** `actions.hesaplar.can_create=true` → **birikim hesabı oluşturma** | ✅ **Mümkün** — mevcut `hesaplar` politikası zaten böyle |
| **P12** | **Owner ve meşru legacy akışları** — P0-0 sonrası uçtan uca | ✅ **Bozulmadan çalışır** |
| **P13** | **Doğrudan REST INSERT/UPDATE/DELETE** — meşru kullanıcı, policy içinde resolver çalışır | ✅ Başarılı — **`permission denied for function` hatasına DÜŞMEZ** |
| **P14** | Restrictive RLS **ve** Storage policy içinden resolver çağrısı | ✅ Her ikisinde de çalışır |
| **P15** | **linked-cari** yolu (`cari_links`) kendi tanımlı bağlamında | ✅ Doğru sonuç |

## F.2 Negatif — legacy asimetri

| # | Senaryo | Beklenen |
|---|---|---|
| **N-L1** | `can_delete_all=true`, `can_create=false` → **create** | 🔴 **Reddedilir** — collapse olsaydı geçerdi |
| **N-L2** | `can_create=true`, update/delete `false` → **yalnız create** | Create ✅ · update/delete **reddedilir** |
| **N-L3** | `can_update_own=true` → **başkasının** kaydı | **Reddedilir** — yalnız kendi kaydı |
| **N-L4** | Bir modülde aksiyon açık, diğerinde kapalı | **Birbirine taşınmaz** |
| **N-L5** | `can_see_all_users_data=false` legacy → başkasının kaydı | **Görünmez** *(1 gerçek vaka)* |
| **N-L6** | Legacy `view` kullanıcı (`can_create=false`, `level` yok) → ödeme | **Reddedilir** |
| **N-L7** | **`modules.notlar` YOK** *(fallback ile görüyor)* **+** `actions.notlar.can_create` yok → **not oluşturma** | 🔴 **Reddedilir** — **D-N1 onaylı daraltması** *(bugün GEÇİYOR)* |
| **N-L7b** | `modules.notlar = true` **+** aksiyon yok → REST'ten **not oluşturma/düzenleme/silme** | 🔴 **Reddedilir** — D-N1; sunucuda bugün **hiç aksiyon kontrolü yok** |
| **N-L8** | `modules.birikim` YOK **+** `actions.hesaplar.can_create=false` → hesap oluşturma | **Reddedilir** |

## F.2-b Negatif — resolver erişim modeli

| # | Senaryo | Beklenen |
|---|---|---|
| **N-R1** | `authenticated` kullanıcı resolver'ı **Data API / RPC üzerinden doğrudan** çağırır | **Erişilemez** — şema exposed listesinde değil |
| **N-R2** | Kullanıcı **başka bir `user_id`** vererek yetki sorgular | **İmkânsız** — fonksiyon **caller tarafından seçilebilen `user_id`** kabul etmiyor; kimlik daima `auth.uid()`. *(Bağlam parametreleri — `isletme_id`, modül, aksiyon, kayıt sahibi — kabul edilebilir ve tenant kapsamında doğrulanır)* |
| **N-R2b** | Kullanıcı **bağlam parametresine** başka tenant'ın `isletme_id`'sini verir | **Reddedilir** — bağlam parametreleri tenant kapsamında doğrulanır |
| **N-R3** | Resolver, başka kullanıcının izin nesnesini döndürür | **Döndürmez** — genel izin-sorgulama RPC'sine dönüşmemeli |
| **N-R4** | Private şemadaki **bakiye türetme yardımcısı** `authenticated`'dan çağrılır | **Reddedilir** — ona `EXECUTE` verilmiyor |

## F.3 Negatif — yazma yüzeyi (P0-0 kapanma kriteri)

| # | Senaryo | Beklenen |
|---|---|---|
| **N-W1** | Cariler-only → **`POST /rest/v1/islemler`** `type='gelir'` | 🔴 **Reddedilir** *(bugün GEÇİYOR)* |
| **N-W2** | Cariler-only → **REST** `type='personel_odeme'` | 🔴 **Reddedilir** *(bugün GEÇİYOR)* |
| **N-W3** | **REST UPDATE** ile `cari_odeme` → `gider` | 🔴 **Reddedilir** *(bugün GEÇİYOR — `WITH CHECK` yok)* |
| **N-W4** | **REST DELETE** ile kapalı modül kaydı | 🔴 **Reddedilir** |
| **N-W5** | Aynı saldırılar **beş atomik RPC'de** | **Reddedilir** |
| **N-W6** | **`perform_nakit_avans`** kapalı modül üzerinden | **Reddedilir** *(bugün aksiyon guard'ı bile yok)* |
| **N-W7** | **`update_urun_miktar`** — erişim/aksiyon guard'ı yok | **Reddedilir** |
| **N-W8** | **`manage_linked_islemler`** yolu (`cari_links.permission='full'`) | Tanımlı sınırlar içinde kalır |
| **N-W9** | `type='nakit_avans_taksit'` — CHECK'i geçer, matriste yok | **42501** |
| **N-W10** | `type='uydurma_tip'` | **Reddedilir** — CHECK *(bütünlük)* |

## F.4 Negatif — diğer

| # | Senaryo | Beklenen |
|---|---|---|
| N1 | Bağlam dışı hesap: pasif / arşivli / birikim / seçici dışı | **Reddedilir** |
| N2 | Sahte ID / şişirilmiş delta — beş RPC'nin her biri | Sunucu türevi uygulanır |
| N3 | Başka işletmenin `cari_id`/`personel_id`/`urun_id`'si | **Reddedilir** |
| N4 | Cariler-only → `hesaplar?select=*` | **Boş/hata** |
| N5 | Cariler-only → U-1 cevabı | Yalnız 5 alan; `balance` yok |
| N6 | Notlar-only → başkasının işlem fotoğrafı | **Reddedilir** |
| N7 | C3-b delinmesi: bağsız dosya → kapalı modül kaydına bağlanır | Yükleyen **artık göremez** |
| N8 | Personel kapalı → hesap ekstresinde maaş satırı | **Hiç yok** |
| N9 | İzin daraltıldıktan sonra | Eski veri ekranda/diskte **yok** |
| N10 | `anon` → S1..S5 | **Reddedilir** *(matris sonrası)* |
| N11 | Ekstre linki, üretici yetkisi kapandıktan sonra | **Geçersiz** |
| N12 | Legacy bozuk satırda tutar/tip/hesap değişikliği, bağ onarılmadan | **Reddedilir** — kural 3 |
| N13 | Geçerli satırın zorunlu `cari_id`/`personel_id`/`hesap_id`'si NULL'a çekilir | **Reddedilir** — kural 2 |

---

# G. AÇIK KARARLAR

| # | Karar | Durum |
|---|---|---|
| **G1** | Storage | ✅ Kayıt bağı + C3-b geçici · C3-c yalnız dry-run · *(açık: bekleme süresi)* |
| **G2** | Bakiye yeterlilik | ✅ **E-a** · negatif bakiye ayrı ürün kararı |
| **G2b** | Bakiye operasyonları | ✅ **Server-authoritative · doğrudan G-2** |
| **G3** | Rollout | ✅ **B altyapısı** · *(açık: minimum sürüm eşiği)* |
| **G5** | **`notlar` aksiyon kapısı** (§B.1.4-a) | ✅ **D-N1 KARARLAŞTI** — not oluşturma/düzenleme/silme, modül görünürlüğüne **ek olarak** ilgili aksiyon yetkisini zorunlu tutar. **Bilinçli erişim daraltması** |
| **G6** | **`permissions.restrictions`** — `islem_types`/`cari_types`, 4 aktif üyelikte dolu, **hiçbir yerde uygulanmıyor** | ✅ **KARARLAŞTI: legacy/emekli metadata.** Ayrıntı §B.10 |
| **G7** | **Bilinmeyen `level` değeri** — `usePermissions` fail-**open** (`level !== 'view'` → create true) | ✅ **KARARLAŞTI: sunucu fail-CLOSED.** Açık allowlist; canlıda allowlist dışı kayıt **yok** → **sıfır kullanıcı etkili** güvenlik deltası. Ayrıntı §B.11 |

---

# H. UYGULAMA PAKETLERİ

| Paket | İçerik | Bağımlılık | Risk |
|---|---|---|---|
| **P-A** | `cleanup_old_islem_audit_log` ACL — dar ve ayrı | ✅ Cron doğrulandı | Düşük |
| **P-B** | **① Capability-vector resolver** (private şema · **§B.5.1 sekiz sınırlı EXECUTE modeli** · modül görünürlüğü ≠ aksiyon ayrımı) · ② bakiye türetme *(EXECUTE verilmez)* · ③ tip/modül allowlist'i (`ELSE false`) · ④ **§B.1.6 sıfır-delta kabul testi** · ⑤ **N-R1…N-R4 erişim modeli testleri** | — | Orta |
| **P-C1** | **Doğrudan REST yazma kapıları** — `AS RESTRICTIVE` INSERT/UPDATE/DELETE + `manage_linked_islemler` sınırlandırması + **`notlar` aksiyon kapısı (D-N1)** | P-B | **Yüksek** |
| **P-C2** | **Beş server-authoritative RPC** — delta + tip/modül + varlık + legacy update kuralları | P-B | **Yüksek** |
| **P-C3** | **Diğer SECDEF/domain yazma yolları** (24 fonksiyon) + Edge/service-role | P-B | **Yüksek** |
| **P-D** | U-1…U-4 projeksiyon RPC'leri | P-B | Düşük (additive) |
| **P-E** | `increment_balance` domain RPC'leri (5 alan) | P-B | Orta |
| **P-F** | Storage politikaları + C3-b | P-B | Orta — ayrı kontrollü hat |
| **P-G** | Call-site matrisi → S2/S4/S5 ACL | Matris | Düşük |
| **P-H** | Cache temizliği (D28) | — | Düşük |
| **P-J** | `p_items` / `p_taksitler` bütünlüğü | P-C2 | Orta |
| **P-I** | **Okuma** RLS izolasyonu + minimum sürüm kapısı | P-C*, P-D, client dağıtımı | **Yüksek** — en son |

### Sıra

```
P-A  ──►  P-B  ──┬──►  P-C1   (REST yazma kapıları)      ┐
                 ├──►  P-C2   (beş RPC)                   ├─ P0-0 + P0-1 hattı
                 ├──►  P-C3   (diğer SECDEF yolları)      ┘
                 ├──►  P-D ‖ P-E ‖ P-F
                 └──►  P-J  (P-C2 sonrası)

P-H  (bağımsız)        P-G  (matris tamamlanınca)

                                     ──►  P-I  (okuma RLS + sürüm kapısı, EN SON)
```

> **P0-0 üç paketin (P-C1 + P-C2 + P-C3) tamamı bitmeden kapalı sayılmaz** —
> §B.2.6 kriteri. Üçü paralel yürütülebilir, hepsi P-B'ye bağlıdır.

---

# I. HER ÜRETİM PAKETİ İÇİN ZORUNLU ŞARTLAR

| # | Şart |
|---|---|
| 1 | **Canlı gövde snapshot'ı + md5 hash** — repo gövdesinden değil, **canlıdan** |
| 2 | **`SET search_path`** — her `SECURITY DEFINER` fonksiyonda |
| 3 | **Tam yedek** — `node scripts/backup.js`, migration öncesi |
| 4 | **Eski-client davranışı** — "eski client ne yaşar?" yazılı cevaplanır |
| 5 | **Test ortamı doğrulaması** — üretim öncesi |
| 6 | **Geri alma dosyası** — savunmasız hâle **dönmeyen** fallback |
| 7 | **Ayrı "uygula" onayı** — paket bazında |

---

# J. BU TURDA YAPILMAYANLAR

- Kod yazılmadı · migration hazırlanmadı · Supabase'e **yazılmadı** · ACL/RLS değiştirilmedi
- İzin kayıtlarına **backfill yapılmadı** (K9 ayrı onayda)
- Dosya silinmedi · veri değiştirilmedi · stage/commit/push yok
- Canlıya yalnız **salt-okunur** sorgular çalıştırıldı
- `undo_import_batch` bağımsız hatta; ayrı üretim onayı bekliyor
- Bu rapor **tasarım ve plandır**; uygulama için paket bazında ayrı onay gerekir
