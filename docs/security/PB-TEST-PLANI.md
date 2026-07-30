# P-B TEST PLANI — test ortamı adımları ve kabul kriterleri

**Durum:** ✅ 29 Temmuz güvenlik re-auditi, geri alınan üretim ön kontrolü,
bağımsız denetim ve canlı son kontroller tamamlandı.
**Canlı migration:** `20260729064915_pb_internal_yetki_altyapisi`
**Kapsam:** `20260729064915_pb_internal_yetki_altyapisi.sql`

---

# 29 TEMMUZ 2026 — GÜNCEL KAPI

- Resolver artık 14 modülün görünür/derived sözleşmesini, `birikim = hesaplar AND
  birikim`, bilinmeyen level fail-closed ve bağımsız exact global visibility
  semantiğini uygular.
- Permissions boolean'larında yalnız JSON `true` yetki verir; string/number/null/
  object/array deny olur ve text→boolean cast exception'ı yoktur.
- Dört fonksiyon oluşturulduktan sonra final schema-wide ACL sweep çalışır;
  yalnız resolver authenticated'a sweep'ten sonra yeniden grant edilir.
- PG17'de per-schema default REVOKE global PUBLIC EXECUTE defaultunu kaldıramaz.
  Bu yüzden test yalnız mevcut dört resultant ACL'i kanıtlar; gelecekteki her
  `internal` fonksiyon migrationı kendi final sweep'ini yapmak zorundadır.
- `cevrilen_tutar` NaN/Infinity guard'ları same-currency early return'den öncedir.
- Jest sözleşme/parite testleri gerekli ama tek başına yeterli değildir.
- Gerçek motor kapısı üretimde public tablo DML'i yapmayan `BEGIN/ROLLBACK`
  preflight ile tamamlandı; derleme, resultant ACL, owner/aktif üye/cross-tenant,
  tip, kur ve bakiye assertleri geçti.
- `docs/security/taslak/PB-POSTGRES-DAVRANIS-TESTI.sql` bozuk JSON fixture'ı için
  geçici `UPDATE` yaptığı için yalnız izole staging'de kullanılacak ek derinlik
  testidir; üretimde çalıştırılmadı.

# TARİHSEL SONUÇ — ESKİ SQL HASH'İYLE TEST ORTAMI TURU (26 Tem)

> Aşağıdaki 87/87 sonucu 29 Temmuzda değiştirilen SQL'i doğrulamaz; yalnız tarihsel
> kanıttır. Güncel migration için gerçek PostgreSQL turu yeniden çalıştırılmalıdır.

**Ortam:** `scratchpad/pa-pb-izolasyon-harness` · yerel Supabase · **PostgreSQL 17.6**
**Kapsam:** bootstrap + minimal baseline + **P-A** + **P-B** *(4 migration)*

> ⚠️ Bu ortam bir **P-A/P-B izolasyon test harness'idir.** 186 migration zincirinin
> veya herhangi bir yedek/restore sürecinin çalıştığını **kanıtlamaz**.

## Toplam: **87/87 GEÇTİ**

| Grup | Sonuç |
|---|---|
| P-A gerçek davranış (PA-1…PA-5, S-1…S-3) | ✅ **8/8** |
| Data API + N-R erişim modeli | ✅ **8/8** |
| Sekiz resolver profili (R1…R8) | ✅ **9/9** |
| **864 hücre SQL ↔ TS** | ✅ **SAPMA 0** *(tarihsel, 6 modül)* |
| L1–L5 level senaryoları | ✅ **5/5** |
| 16 tip × kur yönleri (32 op) | ✅ **sayısal tam eşitlik, sapma 0** |
| Y1–Y10 yuvarlama/kur | ✅ **10/10** |
| NI1–NI9 NaN/Infinity | ✅ **9/9** |
| ACL/owner/search_path/prosecdef/proacl | ✅ **9/9** |
| P-B fallback provası (FB-0…FB-5) | ✅ **6/6** |

### Öne çıkanlar

**Data API kapısı — en güçlü kanıt:** `Content-Profile: internal` ile şema zorlaması
bile reddedildi → `PGRST106 "Only the following schemas are exposed: public, graphql_public"`.
Normal RPC çağrısı `404 PGRST202` *(public'te aranıyor)*.

**864 hücre:** beklenen değerler `src/lib/permissionResolver.reference.ts`'in
**derlenmiş gerçek modülünden** üretildi *(yeniden yazılmış kopyadan değil)*, SQL çıktısıyla
hücre hücre karşılaştırıldı → **sıfır sapma**.

**P-A:** `postgres` (cron) ✅ çalışıyor · `anon` **42501** · `authenticated` **42501** ·
`service_role` ✅ korunuyor · cron komutu ✅ çalışıyor. ACL `{postgres=X, service_role=X}`.

**Fallback:** `authenticated` erişimi kapandı, **4 nesne ve şema yerinde kaldı** (DROP yok),
`postgres` hâlâ çağırabiliyor. En sona bırakıldı.

### Tarihsel sapmalar

| Sapma | Doğrulama |
|---|---|
| Bilinmeyen `level` | 29 Temmuz güncel client ve SQL artık ikisi de fail-closed |
| `NaN` kur + aynı para birimi → SQL hata, TS geçer | Üretimde **67.548 işlemde 0** NaN/Inf/≤0 |
| `pg_net` yerel **0.20.3** ↔ üretim **0.19.5** | P-A/P-B **aktif HTTP kullanmıyor** → bu turu bloke etmez. **Storage/webhook paketlerinde yeniden değerlendirilmeli** |

### Yöntem notu — dürüstlük kaydı

| Karşılaştırma | Referans |
|---|---|
| 864 hücre resolver | ✅ **Derlenmiş gerçek TS modülü** |
| Bakiye ops / Y / NI | ⚠️ **TS kaynağından ELLE türetilmiş** beklenen değerler — `islemBalanceOps.ts` path-alias + i18n zinciri nedeniyle bağımsız derlenemedi |

### NI8 — ayrı bulgu doğrulandı

`INSERT INTO islemler (amount) VALUES ('NaN')` → **kabul edildi.**
`CHECK (amount > 0)` NaN'ı geçiriyor (`'NaN' > 0` = TRUE). `internal.bakiye_ops` bunu
kendi guard'ıyla reddediyor, ama **tablo seviyesinde açık duruyor** → ayrı residual bulgu.
*(`'Infinity'::numeric(15,2)` typmod tarafından reddediliyor — NI9 ✅)*

### 🛑 Bu sonuç üretim onayı DEĞİLDİR

P-A kendi ayrı onay hattındadır. P-B additive/no-DML'dir; kullanıcı 27 Temmuz
yedeğini teyit ettiğinden tekrar yedek kapısı yoktur. P-B, P-A'dan bağımsızdır.

---

## 0. TARİHSEL BLOKAJ (26 Temmuz) — izole test ortamı yoktu

İzole test ortamı onayı verildi, fakat **çalıştırılacak ortam mevcut değil.**
Kanıt *(26 Tem)*:

| Kontrol | Sonuç |
|---|---|
| Supabase projeleri | **Tek proje:** `ulohxpkhesxozwnlnonb` · host `db.ulohxpkhesxozwnlnonb.supabase.co` · ad **`defter-app`** = **ÜRETİM** |
| Test/staging projesi | **YOK** |
| Supabase CLI | ✅ v2.109.1 |
| Docker / Podman | ❌ **Kurulu değil** → `supabase start` **çalışamaz** |
| Yerel PostgreSQL (`psql`) | ❌ **Yok** |
| Supabase branch listesi | ❌ Hata döndü — branching kullanılamıyor |

> **26 Temmuz tarihsel sonucu:** *"hedef project ref/host'un üretimden farklı olduğunu
> açıkça göster."* Farklı bir ref **yok**. Bu migration'ı `ulohxpkhesxozwnlnonb`
> üzerinde çalıştırmak **üretimde çalıştırmak** demekti; o tarihte onaylı değildi ve
> yapılmadı.

### 0.1 Seçenekler *(karar ürün sahibinin)*

| # | Seçenek | Kapsayabildiği | Maliyet / engel |
|---|---|---|---|
| **A** | **Docker Desktop kur → `supabase start`** | §2'nin **tamamı** *(PostgREST + anon/authenticated rolleri + auth.uid() dahil)* — advisor hariç | Kurulum + Docker çalışır durumda olmalı · **ücretsiz, tamamen yerel** |
| **B** | **Ayrı Supabase projesi** *(test)* | §2'nin tamamı **+ advisor** | Yeni proje oluşturma · ücret/kota · ayrı onay gerekir |
| **C** | **Supabase branch** | §2'nin tamamı + advisor | Şu an **kullanılamıyor** (liste hatası) · ücretli |
| **D** | Yalın PostgreSQL 17 | §2.2 · §2.4-b · §2.4-c · §2.5 · Y1-Y10 · NI1-NI10 · ACL/prosecdef/proacl | ❌ §2.1 (Data API) · ❌ §2.3 N-R1 · roller elle kurulmalı → **kısmi kapsam** |

> **Önerim: A.** Ücretsiz, tamamen yerel, üretime hiç dokunmuyor ve advisor dışında
> test planının tamamını karşılıyor. Advisor kontrolleri üretim uygulaması sırasında
> ayrıca çalıştırılabilir *(salt-okunur)*.

**29 Temmuz sonucu:** Kullanıcının additive/veri-silmeyen migration yetkisi ve
27 Temmuz yedek teyidi kapsamında önce üretimde tamamen geri alınan, public veri
DML'i içermeyen preflight çalıştırıldı; bağımsız denetimden sonra migration canlıya
alındı. İzole DML'li adversarial script staging kalemi olarak açık bırakıldı.

---

## 1. Yerelde tamamlanan *(jest, Postgres gerektirmez)*

| Süit | Test | Sonuç |
|---|---|---|
| `permissionResolverParity` | **2016 hücre** · gerçek `usePermissions` karşılaştırması · S1…S17 | ✅ 29/29 |
| `pbMigrationContract` | Exact JSONB · bütün modüller · final ACL sweep · guard sırası · gerçek-PG script sözleşmesi | ✅ 51/51 |
| `cleanupAuditLogAclMigration` | P-A sözleşmesi | ✅ 10/10 |

**29 Temmuz hedef turu:** PB iki süit + `islemBalanceOps` = **97/97** ·
tsc temiz · hedef eslint temiz.

> 🛑 **BUNLAR DOSYA-İÇERİK SÖZLEŞMESİ TESTLERİDİR — SQL'İN ÇALIŞMA SONUCUNU
> KANITLAMAZLAR.**
>
> Jest tek başına kabul edilmedi. Gerçek PostgreSQL derleme/ACL/davranış preflight'ı,
> bağımsız audit ve canlı son kontrol birlikte tamamlandı.

---

## 2. Test ortamı — zorunlu adımlar

### 2.1 🔒 Kapı: `internal` Data API'de expose EDİLMEMELİ *(§B.0.3)*

Üç noktada, üçü de zorunlu:

| # | Ne zaman | Doğrulama | Beklenen |
|---|---|---|---|
| 1 | Uygulama **öncesi** | Supabase → Settings → API → "Exposed schemas" | `internal` **listede yok** |
| 2 | Uygulama **sonrası** | Aynı liste **tekrar** | `internal` **hâlâ listede yok** |
| 3 | Uygulama **sonrası** | `POST /rest/v1/rpc/etkin_yetki` *(authenticated JWT ile)* | **404 / erişilemez** |

> 3. adım atlanamaz: şema oluşturmanın exposed listesini etkilemediği
> **gözlemle** doğrulanmalı, varsayılmamalı.

### 2.2 Ön koşul kapısı

| Senaryo | Beklenen |
|---|---|
| Temiz veritabanına uygulama | ✅ Başarılı |
| **İkinci kez** uygulama *(şema mevcut)* | 🛑 `42P06` — *"internal semasi zaten mevcut"* · sessiz yeniden kullanım **yok** |

### 2.3 Erişim modeli — N-R testleri

| # | Test | Beklenen |
|---|---|---|
| **N-R1** | `authenticated` → Data API'den `internal.etkin_yetki` | **Erişilemez** |
| **N-R2** | Caller `user_id` parametresi geçirmeye çalışır | **İmza yok** — fonksiyon `(uuid, text)` |
| **N-R2b** | Bağlam parametresine **başka tenant'ın** `isletme_id`'si | Tüm yetenekler **false** |
| **N-R3** | Ham `permissions` / başkasının izni döner mi | **Dönmez** — 7 boolean |
| **N-R4** | `authenticated` → `internal.bakiye_ops` | **permission denied** *(grant yok)* |
| **N-R5** | `anon` → `internal.etkin_yetki` | **permission denied** *(REVOKE)* |
| **N-R6** | `anon` → şema `USAGE` | **permission denied** |

### 2.4 Resolver semantiği — canlı veriyle

> ⚠️ Test ortamına **üretim izin verisi kopyalanmayacak.** Fixture'daki
> anonimleştirilmiş 24 profil test ortamında **sentetik üyelik** olarak kurulur.

| # | Profil | Beklenen |
|---|---|---|
| R1 | Owner | 14 modülde tüm yetenekler `true` |
| R2 | `uye-01` *(legacy, cariler c/uo/ua)* | `cariler`: create ✅ update_all ✅ delete ❌ · `personel`: hepsi ❌ |
| R3 | `uye-03` *(legacy, tüm actions false)* | Modüller görünür, **hiçbir yazma yok** |
| R4 | `uye-08` *(`csaud=false`)* | `can_see_all_users_data` = **false** |
| R5 | `uye-22` *(`level=view`)* | Tüm modüllerde yalnız `can_view` |
| R6 | `uye-24` *(`status=removed`)* | **Hepsi false** |
| R7 | Legacy, `modules.notlar` **yok** | `can_view('notlar')` ✅ · `can_create('notlar')` ❌ |
| R8 | Legacy, `modules.birikim` **yok** + `actions.hesaplar.can_create=true` | Birikim tipi filtresi geçer, hesap create ✅ |

**Kabul:** her satır, `permissionResolver.reference.ts` çıktısıyla **birebir**.

### 2.4-b 🔬 Resolver SQL çıktısı ↔ TS referansı — **doğrudan SQL karşılaştırması**

> Jest'teki 2016 hücre ve gerçek hook karşılaştırması SQL'i çalıştırmaz. Burada
> **gerçek SQL çıktısı** TS referansıyla karşılaştırılır.

| Adım | İçerik |
|---|---|
| 1 | Fixture'daki 24 profil test ortamında **sentetik üyelik** olarak kurulur |
| 2 | Her profil için, o kullanıcının JWT'siyle `internal.etkin_yetki(isletme_id, modul)` **14 modül** için çağrılır |
| 3 | Çıktı, `permissionResolver.reference.ts` çıktısıyla **hücre hücre** karşılaştırılır |
| 4 | Karşılaştırma **makine tarafından** yapılır (elle göz kontrolü değil); sapma listesi dosyaya yazılır |

**Kabul:** 2016 hücrede **sıfır sapma**.
**Tek beklenen istisna yok** — allowlist dışı `level` fixture'da bulunmuyor
(§2.3-b ile ayrıca test edilir).

### 2.4-c Bilinmeyen `level` — fail-closed *(G7)*

| # | Girdi | Beklenen |
|---|---|---|
| L1 | `level='süper'` | **Tüm yetenekler false** *(`can_view` dahil)* |
| L2 | `level=''` | **Tüm yetenekler false** |
| L3 | `level='View'` *(büyük harf)* | **Tüm yetenekler false** — eşleşme birebir |
| L4 | `level='add'` | create ✅ · update/delete ❌ |
| L5 | `level=null` + legacy actions | Legacy yol çalışır |

### 2.5 Bakiye türetme — `computeBalanceOps` paritesi

**16 CHECK tipi × {aynı para birimi, çapraz kur}** matrisi.

| Boyut | Değerler |
|---|---|
| Tip | 13 bakiye etkileyen + `personel_izin_hakki` · `personel_izin_kullanimi` · `nakit_avans_taksit` *(op üretmemeli)* |
| Para birimi | `TRY→TRY` · `TRY→USD` · `USD→TRY` · `USD→EUR` |
| Kur | geçerli · `NULL` · `0` · negatif |
| Varlık | dolu · `NULL` *(op üretilmemeli)* |

**Kabul:**
- Her hücrede `internal.bakiye_ops` çıktısı `computeBalanceOps` ile **birebir**
- **Kuruş farkı kabul edilmez** — `numeric` karşılaştırması tam eşitlik
- `personel_izin_*` ve `nakit_avans_taksit` → **sıfır satır**

#### 2.5-a 🔬 Yuvarlama ve kur semantiği — zorunlu vakalar

TS ile SQL arasında **daha önce ayrışmıştı**; bu vakalar eşitlemeyi kanıtlar:

| # | Vaka | TS davranışı | Beklenen SQL |
|---|---|---|---|
| **Y1** | `1.005` yuvarlama | `roundCurrency` `'e2'` hilesiyle **1.01** *(yarı sıfırdan uzağa)* | `round(numeric,2)` = **1.01** |
| **Y2** | `-1.005` | İşaret ayrılıp mutlak değer yuvarlanır → **-1.01** | `round(numeric,2)` = **-1.01** |
| **Y3** | Bölme sonucu: `100 TRY → USD`, kur `3` | `roundCurrency(33.333…)` = **33.33** | **33.33** *(ham 33.3333… DEĞİL)* |
| **Y4** | **Aynı para birimi**, ondalıklı tutar `10.005` | TS **erken return**, yuvarlama **YOK** → `10.005` | **10.005** *(yuvarlanmamalı)* |
| **Y5** | Kur `0`, para birimleri **AYNI** | `safeParseExchangeRate` switch'ten önce **fırlatır** | **HATA** *(22023)* |
| **Y6** | Kur **negatif**, para birimleri **AYNI** | Aynı — **fırlatır** | **HATA** |
| **Y7** | Kur `0`, para birimleri **FARKLI** | Fırlatır | **HATA** |
| **Y8** | Kur `NULL`, para birimleri **AYNI** | `safeParseExchangeRate(null)` → `null`, hata yok | **Başarılı**, dönüşüm yok |
| **Y9** | Kur `NULL`, para birimleri **FARKLI** | `calculateTargetAmount` fırlatır | **HATA** |
| **Y10** | `float8` sızıntısı | — | Hesabın **hiçbir adımında** float8'e düşülmediği doğrulanır |

> **Y4 ve Y5/Y6 kritik:** ikisi de v1 SQL'de yanlıştı. Y4'te SQL yuvarlıyordu,
> Y5/Y6'da SQL kuru yalnız çapraz kurda kontrol ediyordu. Düzeltildi; bu vakalar
> regresyon kilididir.

#### 2.5-b 🔴 NaN / ±Infinity — PostgreSQL'e özel tehlike

**Canlı PG 17 motorunda doğrulandı (26 Tem, saf ifade — tabloya dokunulmadı):**

| İfade | Sonuç | Anlamı |
|---|---|---|
| `'NaN'::numeric > 0` | **TRUE** | `islemler CHECK (amount > 0)` NaN'ı **geçiriyor** |
| `'NaN'::numeric <= 0` | **FALSE** | yalnız `<= 0` yazan kur guard'ı NaN'ı **geçiriyordu** |
| `'NaN'::numeric IS NULL` | **FALSE** | `IS NULL` kontrolü **yetmiyor** |
| `'NaN'::numeric * 5` | **NaN** | bakiye deltasına **sessizce sızıyor** |
| `round('NaN'::numeric, 2)` | **NaN** | yuvarlama temizlemiyor |
| `'NaN' = 'NaN'` · `'Inf' = 'Inf'` | **TRUE** | eşitlik **güvenli tespit yöntemi** (IEEE754'ten farklı) |

**Kolon tanımları:** `amount numeric(15,2) NOT NULL CHECK (amount > 0)` ·
`exchange_rate numeric(18,8)` **CHECK YOK**.

> **Sonuç:** `safeParseAmount`/`safeParseExchangeRate` NaN ve sonsuzu **fırlatırken**,
> SQL tarafı onları **kabul edip yayıyordu**. Guard'lar eklendi *(tutar + kur, ayrıca
> `cevrilen_tutar`'da derinlemesine tekrar)*.

| # | Vaka | Beklenen |
|---|---|---|
| **NI1** | `amount = 'NaN'` | **HATA** *(22023)* — `CHECK (amount>0)` geçirse bile |
| **NI2** | `amount = 'Infinity'` | **HATA** |
| **NI3** | `amount = '-Infinity'` | **HATA** |
| **NI4** | `exchange_rate = 'NaN'`, para birimleri **AYNI** | **HATA** — `<=0` guard'ı yakalamaz |
| **NI5** | `exchange_rate = 'NaN'`, para birimleri **FARKLI** | **HATA** |
| **NI6** | `exchange_rate = 'Infinity'` | **HATA** |
| **NI7** | `internal.cevrilen_tutar` **doğrudan** NaN tutar/kur ile | **HATA** *(derinlemesine savunma)* |
| **NI8** | `INSERT INTO islemler (amount) VALUES ('NaN')` | Kolon **kabul ediyor mu** belgelenir — ediyorsa **`islemler.amount` CHECK'i ayrı bulgu** olarak kaydedilir |
| **NI9** | `'Infinity'::numeric(15,2)` cast | Typmod reddediyor mu belgelenir |
| **NI10** | TS `safeParseAmount('NaN')` / `safeParseExchangeRate('NaN')` | TS fırlatıyor / null — **SQL ile aynı sonuç** kanıtlanır |

> **NI8 bir üretim bulgusu adayıdır:** `CHECK (amount > 0)` NaN'ı geçirdiğine göre
> `islemler` tablosuna NaN tutar yazılabiliyor olabilir. Test ortamında kanıtlanırsa
> **ayrı residual bulgu** olarak raporlanacak *(P-B kapsamı değil)*.

### 2.6 Tip allowlist'i

| Girdi | Beklenen |
|---|---|
| 15 üretim tipi | Doğru modül dizisi |
| `nakit_avans_taksit` | **NULL** *(deny)* |
| `uydurma_tip` | **NULL** *(deny)* |
| `NULL` / `''` | **NULL** *(deny)* |

---

## 3. Üretim öncesi — salt-okunur tekrar

| # | Kontrol | Neden |
|---|---|---|
| 1 | `internal` şeması **hâlâ yok** | Plandaki 26 Tem sonucu tarihli |
| 2 | Exposed schemas listesi | §2.1 kapısı |
| 3 | **24 üyelik karşılaştırması yeniden** | Aradaki değişiklikler (yeni üye, izin güncellemesi) sonucu değiştirebilir |
| 4 | `node scripts/backup.js` | Tam yedek |

---

## 4. Uygulama sonrası

| # | Kontrol |
|---|---|
| 1 | §2.1 adım 2 ve 3 *(exposed schemas + doğrudan çağrı)* |
| 2 | `internal` nesnelerinin ACL'i: resolver `{authenticated=X}`, diğer üçü **grant'sız** |
| 3 | Mevcut uygulama akışları **bozulmadı** — QTB kayıt, cari ödeme, rapor açılışı |

> **Uygulama sonrası hiçbir ACL/politika P-C'ye kadar resolver'ı KULLANMAZ.**
> P-B tek başına duran altyapıdır.

---

## 5. Kabul kapısı

```
97/97 hedef yerel jest  ✅  (tamamlandı — AMA TEK BAŞINA YETMEZ)
        +
§2.1  üç noktalı Data API kapısı
        +
§2.2  ön koşul kapısı (ikinci uygulama 42P06 ile durur)
        +
§2.3  N-R1…N-R6 erişim modeli
        +
§2.4-b GERÇEK SQL çıktısı ↔ TS referansı — 2016 hücre, sıfır sapma
        +
§2.4-c bilinmeyen level L1…L5 — fail-closed
        +
§2.5  16 tip × 4 kur matrisi — kuruş farkı yok
        +
§2.5-a Y1…Y10 yuvarlama/kur semantiği
        ↓
   ancak o zaman ÜRETİM ONAYI istenir
        ↓
   ancak ondan sonra P-C1 / P-C2 / P-C3'e geçilir
```

**Herhangi bir sapma → paket bloke.**

> 🛑 **Gerçek PostgreSQL/Supabase ortamında çalıştırılmadan üretim onayı
> istenmeyecektir.** Bu kural pazarlık dışıdır: jest testleri dosya içeriğini
> doğrular, SQL'in davranışını değil.

## 6. P-A ve P-B — üretimde **AYRI** *(ürün sahibi kararı)*

> Önceki taslakta "birlikte uygulama" öneriliyordu — **geri alındı.**
>
> **Gerekçe:** iki ayrı migration **tek transaction değildir**. P-A başarılı olup
> P-B hata verirse üretim **yarım paket** durumunda kalır. Tek yedek avantajı bu
> bağımsız riskleri birleştirmeye değmez.

| Paket | Üretim rollout'u |
|---|---|
| **P-A** | **Kendi** snapshot/hash · **kendi** yedeği · **kendi** onayı · uygulama sonrası **cron doğrulaması** (jobid 8, sonraki çalışma `cron.job_run_details`'te başarılı) |
| **P-B** | **Ancak** test ortamı raporu temiz geldikten sonra · **ayrı** yedek · **ayrı açık üretim onayı** |

**Test ortamında** ikisi aynı turda prova edilebilir — orada yarım-paket riski yok.
