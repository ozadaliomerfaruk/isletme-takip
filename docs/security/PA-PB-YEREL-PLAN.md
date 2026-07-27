# P-A / P-B — YEREL UYGULAMA PLANI ve DOSYA LİSTESİ

**Durum:** 🔒 **PLAN — ONAY BEKLİYOR.** Hiçbir dosya yazılmadı, migration
hazırlanmadı, üretime dokunulmadı.
**Tarih:** 26 Temmuz 2026 · **Baz commit:** `5f04873`
**Dayanak:** `docs/security/PAKET-0-1-TASARIM-RAPORU.md` v2.4 *(onaylı)*

---

# P-A — `cleanup_old_islem_audit_log` ACL daraltması

## A.1 Kapsam

**Tek fonksiyon.** `anon`, `PUBLIC` ve `authenticated` çalıştırma yetkisi kaldırılır.

| | |
|---|---|
| **Tam imza** | **`public.cleanup_old_islem_audit_log()`** — parametresiz; migration'da **tam imza kullanılacak**, çıplak ad değil |
| **Canlı gövde md5** | `638fc810853a0acbea7b106407ac1a1b` *(250 karakter)* |
| **Mevcut ACL** | `{=X/postgres, postgres=X, anon=X, authenticated=X, service_role=X}` |
| **Hedef ACL** | `{postgres=X, service_role=X}` — kardeş cron fonksiyonlarıyla **aynı** |
| **`SET search_path`** | ✅ Gövdede zaten var |
| **Gövde değişikliği** | ❌ **YOK** — yalnız `REVOKE`. `CREATE OR REPLACE` **kullanılmayacak** |

### ⚠️ A.1.1 Bu additive bir değişiklik DEĞİLDİR

> P-A, projenin *"additive-only"* varsayılanının **açıkça onaylanmış bir istisnasıdır**:
> **erişim daraltıcı** bir güvenlik değişikliğidir. Mevcut bir yetki (PUBLIC/anon/
> authenticated EXECUTE) **geri alınmaktadır**.
>
> Gerekçe: bu yetki hiçbir meşru çağrı yolu tarafından kullanılmıyor (§A.3), buna
> karşılık **anonim çağrıyla denetim kaydı silme** yüzeyi açıyor. Daraltma bilinçli
> ve gerekçelidir; "sessiz additive değişiklik" olarak sunulmayacaktır.

## A.2 Neden güvenli — deneysel kanıt

| Fonksiyon | ACL | Cron |
|---|---|---|
| `app_events_rollup_and_trim` | `{postgres=X, service_role=X}` | jobid 15 · `postgres` · `SELECT public.f()` |
| `usage_snapshot_al` | `{postgres=X, service_role=X}` | jobid 16 · `postgres` · `SELECT public.f()` |
| **hedef →** `cleanup_old_islem_audit_log` | *(aynısı olacak)* | jobid 8 · `postgres` · `SELECT public.f()` |

İki kardeş fonksiyon **aynı çağrı mekanizmasıyla**, **hedef ACL'le**, üretimde
çalışıyor. `postgres` fonksiyon sahibi olduğu için grant'lardan bağımsız çalışır.

## A.3 Eski istemci davranışı

| Soru | Cevap |
|---|---|
| İstemci çağırıyor mu? | **Hayır** — repo genelinde tek referans: `supabase/migrations/20260627090000_cleanup_old_islem_audit_log.sql` (tanım + cron kaydı). `src/` içinde **hiç yok** |
| **Edge Function çağırıyor mu?** | **Hayır** — `supabase/functions/` içinde **hiç referans yok** *(repo geneli arama, 26 Tem)* |
| Cron çağırıyor mu? | ✅ Evet — jobid 8, `username=postgres`, veritabanı içi doğrudan. Sahip olduğu için grant'lardan bağımsız |
| Eski client ne yaşar? | **Hiçbir şey** — çağırmadığı bir fonksiyonun yetkisi değişiyor |

> **Uygulama öncesi tekrar doğrulanacak** *(salt-okunur)*: `src/` ve
> `supabase/functions/` taraması + canlı `cron.job` kaydı. Plan yazımındaki
> doğrulama tarihlidir, uygulama anında geçerliliği yeniden teyit edilir.

## A.4 Yerel dosyalar

| # | Dosya | Tür | İçerik |
|---|---|---|---|
| 1 | `docs/security/db-snapshots/2026-07-26/cleanup_old_islem_audit_log.live.sql` | **YENİ** | Canlı gövde + md5 + ACL metadata. **Çalıştırılabilir değil** |
| 2 | `supabase/migrations/<ts>_cleanup_audit_log_acl.sql` | **YENİ** | Yalnız `REVOKE EXECUTE ON FUNCTION public.cleanup_old_islem_audit_log() FROM PUBLIC, anon, authenticated;` — **tam imza**, gövdeye dokunmaz |
| 3 | `docs/security/taslak/cleanup_audit_log_acl-FALLBACK.sql` | **YENİ** | Geri alma. ⚠️ Savunmasız hâle **dönmez**: yalnız `authenticated`'ı iade eder, `PUBLIC`/`anon`'u **etmez** |
| 4 | `src/lib/__tests__/cleanupAuditLogAclMigration.test.ts` | **YENİ** | Sözleşme testleri (aşağıda) |

## A.5 Testler *(jest, dosya-içerik sözleşmesi)*

| # | Kilitlenen |
|---|---|
| 1 | Migration **`CREATE OR REPLACE` içermiyor** — gövde değişmiyor |
| 2 | `REVOKE EXECUTE ON FUNCTION public.cleanup_old_islem_audit_log() FROM PUBLIC, anon, authenticated` — **tam imzayla** |
| 3 | Migration **çıplak ad kullanmıyor** (imzasız `cleanup_old_islem_audit_log` referansı yok) |
| 4 | `GRANT ... TO anon` / `TO PUBLIC` **yok** |
| 5 | Snapshot dosyası mevcut ve md5 `638fc810853a0acbea7b106407ac1a1b` yazılı |
| 6 | FALLBACK `PUBLIC`/`anon`'a `GRANT` **içermiyor** |
| 7 | Migration **`DROP` içermiyor** |

## A.6 Üretim öncesi doğrulama *(ayrı onayda)*

1. `node scripts/backup.js`
2. Canlı md5'in hâlâ `638fc810…` olduğu teyidi
3. Test ortamında uygulama → cron manuel tetikleme → başarı
4. Uygulama → jobid 8'in bir sonraki çalışmasının `cron.job_run_details`'te başarılı olduğu teyidi

---

# P-B — Kanonik çözümleyici + bakiye türetme + allowlist

> **P-B mevcut uygulama veri yollarını değiştirmez.** Hiçbir mevcut politika, RPC
> veya tablo davranışı değişmez; okuma/yazma yolları aynen kalır.
>
> ⚠️ **Ama P-B yeni bir güvenlik yüzeyidir:** yeni `SECURITY DEFINER` fonksiyonlar
> ve `USAGE`/`EXECUTE` grant'ları ekleniyor. "Davranış değişikliği yok" ifadesi
> "risk yok" anlamına gelmez — yeni yüzeyin kendi sınırları §B.2 ve §B.7'de kilitlenir.

## B.0 🔒 Ön koşul — `internal` şeması durumu

`CREATE SCHEMA IF NOT EXISTS internal` **kendiliğinden güvenli değildir**:
şema zaten varsa sahibi, ACL'i ve içindeki nesneler bilinmeden **sessizce yeniden
kullanılmış** olur.

### B.0.1 Salt-okunur doğrulama *(26 Tem — yapıldı)*

| Şema | Sonuç |
|---|---|
| `internal` · `private` · `app_private` · `sec` | ❌ **Hiçbiri mevcut değil** (boş sonuç kümesi) |

Sorgu: `pg_namespace` → `nspname`, `nspowner`, `nspacl`, `pg_class`/`pg_proc` sayıları.

### B.0.2 Uygulama anında zorunlu kapı — şema varlığı

| Durum | Aksiyon |
|---|---|
| Şema **yok** | ✅ Devam — `CREATE SCHEMA internal` |
| Şema **var** | 🛑 **DUR.** Sessizce yeniden kullanma. Sahip, ACL ve içerik raporlanır, **ayrı karar** alınır |

> Bu doğrulama **uygulama anında tekrarlanır**; plandaki 26 Tem sonucu tarihlidir.

### 🔒 B.0.3 Zorunlu kapı — `internal`, Data API'de expose EDİLMEMELİ

Resolver'ın tüm güvenlik modeli *(§B.2)* şemanın PostgREST tarafından
**yönlendirilmemesine** dayanır. `authenticated` rolünde `USAGE`+`EXECUTE` **var**
olduğu için, şema yanlışlıkla expose edilirse resolver **doğrudan çağrılabilir hâle gelir**.

**Üç noktada doğrulanır — üçü de zorunlu:**

| # | Ne zaman | Doğrulama |
|---|---|---|
| 1 | **Test ortamında** | `internal`, Data API "Exposed schemas" listesinde **değil** · resolver'a PostgREST'ten `POST /rest/v1/rpc/<ad>` → **404/erişilemez** *(N-R1)* |
| 2 | **Üretim uygulaması ÖNCESİ** | Aynı liste salt-okunur kontrol edilir — `internal` **yoksa** zaten güvenli; **varsa** 🛑 dur |
| 3 | **Üretim uygulaması SONRASI** | Liste **tekrar** kontrol edilir + resolver'a doğrudan çağrı denenir → **erişilemez** olduğu teyit edilir |

> 3. adım atlanamaz: şema oluşturma işleminin exposed listesini etkilemediği
> **gözlemle** doğrulanmalı, varsayılmamalı.
>
> Herhangi bir adımda `internal` listede görülürse: **resolver grant'ı verilmez**,
> verilmişse §B.8.2 fallback'i **derhal** uygulanır *(P-C/P-F bağımlılığı henüz
> kurulmadığı için bu aşamada güvenlidir — §B.8.2-a)*.

## B.1 Bileşenler

| # | Bileşen | Yer |
|---|---|---|
| **①** | Capability-vector resolver | `internal` şeması |
| **②** | Bakiye türetme yardımcısı | `internal` şeması |
| **③** | Tip → modül allowlist'i (`ELSE false`) | `internal` şeması |
| **④** | 864 hücrelik sıfır-delta kabul testi | Yerel harness |
| **⑤** | N-R1…N-R4 erişim modeli testleri | Yerel + test ortamı |

## B.2 ① Resolver — imza ve sınırlar

**Çıktı:** mevcut kullanıcı için modül × yetenek boolean'ları
(`can_view`, `can_create`, `can_update_own`, `can_update_all`, `can_delete_own`,
`can_delete_all`) + `can_see_all_users_data`.

| Sınır | Uygulama |
|---|---|
| Şema | `internal` — **Data API exposed schemas listesinde DEĞİL** |
| Grant | `authenticated`'a **yalnız** `USAGE` (şema) + `EXECUTE` (**tam imzayla**, fonksiyon) |
| Kullanıcı kimliği | **Daima `auth.uid()`** — caller'ın **seçebildiği `user_id` parametresi yok** |
| Bağlam parametreleri | `isletme_id`, modül, aksiyon, kayıt sahibi **alınabilir** → **tenant kapsamında doğrulanır** |
| Çıktı | Ham `permissions` JSON'u **değil**; başka kullanıcının izinleri **yok** |
| Güvenlik | `SECURITY DEFINER` + `SET search_path` + **sabit şema adları** |

### B.2.1 🔒 Grant hijyeni — oluşturma transaction'ı içinde

Postgres'te yeni fonksiyon **varsayılan olarak `PUBLIC`'e `EXECUTE` ile doğar.**
Bu yüzden her yeni fonksiyon için, **oluşturulduğu transaction içinde**:

```
CREATE FUNCTION internal.<ad>(<tam imza>) ...
REVOKE EXECUTE ON FUNCTION internal.<ad>(<tam imza>) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION internal.<ad>(<tam imza>) TO authenticated;   -- yalnız resolver
```

| Nesne | `PUBLIC`/`anon` | `authenticated` |
|---|---|---|
| Şema `internal` | `REVOKE ALL` | **yalnız `USAGE`** |
| ① Resolver | `REVOKE EXECUTE` | ✅ `EXECUTE` *(tam imza)* |
| ② Bakiye türetme | `REVOKE EXECUTE` | ❌ **grant YOK** |
| ③ Allowlist | `REVOKE EXECUTE` | ❌ **grant YOK** *(resolver içinden çağrılır)* |

> Grant/revoke, `CREATE` ile **aynı transaction'da**. Fonksiyonun `PUBLIC`'e açık
> kaldığı **hiçbir an olmayacak**.

**Semantik kuralları:**

| Girdi | Kural |
|---|---|
| Owner | Tüm yetenekler `true` |
| `level` **var** | Yeteneklere türetilir (`view`/`add`/`edit_own`/`edit_all`) |
| `level` **yok** (legacy) | `actions[module]` bayrakları **birebir** — yükseltilmez, modüller arası taşınmaz |
| `modules.notlar` / `modules.birikim` **yok** | **Görünürlük** → `true` · **aksiyon** → yine `actions[module].can_*` ister |
| Diğer modül anahtarı yok | `false` |
| Eksik/bozuk | 🔒 deny-by-default |

## B.3 ② Bakiye türetme — kapsam

`computeBalanceOps` ([islemBalanceOps.ts:37](src/lib/islemBalanceOps.ts#L37))
mantığının SQL karşılığı. **`authenticated`'a `EXECUTE` verilmez** (RLS'ten
çağrılması gerekmiyor).

Kapsam: 16 CHECK tipi · çapraz kur (`calculateTargetAmount`) · `roundCurrency` ·
`hesaplar`/`cariler`/`personel` · çok bacaklı tipler.

## B.4 ③ Allowlist

`§B.2.4` matrisi, **`ELSE false` / `RAISE 42501`** ile biter.
`nakit_avans_taksit` → **deny** (emekli özellik).

## B.5 ④ Sıfır-delta kabul testi — yöntem

| Adım | İçerik |
|---|---|
| Girdi | 24 üyeliğin `permissions` JSON'u — **salt-okunur**, üretim değiştirilmez |
| Referans | `usePermissions` semantiği, TS'ten birebir port |
| Karşılaştırma | 24 × 6 modül × 6 yetenek = **864 hücre** |
| Kabul | 🔒 **İSTİSNASIZ SIFIR SAPMA** |
| Bloke | **Herhangi** bir sapma paketi durdurur |

### 🔒 B.5.0 D-N1 bu karşılaştırmanın istisnası DEĞİLDİR

> Önceki taslakta D-N1 *"tek onaylı istisna"* diye yazılmıştı — **kaldırıldı.**

| Konu | Yeri |
|---|---|
| **Resolver paritesi** | P-B · `usePermissions` ile **birebir** · **istisnasız sıfır sapma** |
| **D-N1 (`notlar` aksiyon kapısı)** | **P-C1** · resolver'ın değil **sunucu politikasının** deltası · **ayrı test** (N-L7 / N-L7b) |

Resolver, `notlar` için `usePermissions`'ın döndürdüğü yetenekleri **aynen** üretir.
D-N1, o yeteneklerin `notlar` **RLS politikalarında kullanılmaya başlanmasıdır** —
resolver semantiği değil, politika değişikliği. Bu yüzden P-B kabulünde yeri yoktur.

### ⚠️ B.5.1 Bu test neyi KANITLAMAZ

> 864 hücre, **bugünkü 24 üyeliğin anlık görüntüsüdür.** Üretimde bulunmayan izin
> biçimlerini kanıtlamaz. Tek başına yeterli kabul edilmez.

**Zorunlu ek: sentetik sınır ve asimetri testleri.** Üretimde örneği olmayan
kombinasyonlar elle kurulur:

| # | Sentetik vaka |
|---|---|
| S1 | `can_delete_all=true`, `can_create=false` → create **red** |
| S2 | `can_create=true`, update/delete `false` → yalnız create |
| S3 | `can_update_own=true`, `can_update_all=false` → yalnız kendi kaydı |
| S4 | Modül A'da aksiyon açık, B'de kapalı → **taşınmaz** |
| S5 | `level` **ve** `actions` **birlikte** mevcut → `level` esas alınır |
| S6 | `level` bilinmeyen değer (`'süper'`) → 🔒 **deny** |
| S7 | `actions` var, `modules` **yok** → deny *(notlar/birikim hariç: görünürlük true, aksiyon yine ister)* |
| S8 | `permissions` boş nesne `{}` → 🔒 **deny** |
| S9 | `modules.notlar=true`, `actions.notlar` **yok** → okuma ✅ / yazma ❌ *(D-N1)* |
| S10 | `can_see_all_users_data` **yok** → deny *(false varsayılır)* |
| S11 | `status='removed'` üyelik → **tüm yetenekler false** |
| S12 | Aynı kullanıcı **iki farklı işletmede** farklı izinlerle → tenant'lar **karışmaz** |

### B.5.2 Uygulama anında tekrar

> Canlı üyelik karşılaştırması **uygulama öncesi salt-okunur olarak yeniden
> çalıştırılır.** Plandaki 24 üyelik 26 Tem anlık görüntüsüdür; aradaki değişiklikler
> (yeni üye, izin güncellemesi) sonucu değiştirebilir.

### B.5.3 🔒 Fixture gizliliği

> **Üretim izin fixture'ında kimlik veya gereksiz hassas metadata repoya girmez.**

| Alan | Repoya girer mi |
|---|---|
| `permissions` JSON yapısı *(modül/aksiyon bayrakları)* | ✅ Evet — testin konusu |
| `status` | ✅ Evet |
| `user_id` · `isletme_id` | ❌ **Hayır** — sıra numarasıyla değiştirilir (`uye-01`, `isl-A`) |
| E-posta · ad · telefon · davet metadata | ❌ **Hayır** |
| `created_at` · `updated_at` | ❌ **Hayır** — gereksiz |

Fixture üretimi, alanları **allowlist** ile seçer (blocklist değil): listede
olmayan her alan **düşer**.

## B.6 ⑤ Erişim modeli testleri

| # | Test | Ortam |
|---|---|---|
| N-R1 | `authenticated` resolver'ı Data API'den çağıramaz | Test ortamı |
| N-R2 | Başka `user_id` verilerek yetki sorgulanamaz | Test ortamı |
| N-R3 | Ham `permissions` / başkasının izni dönmez | Test ortamı |
| N-R4 | Bakiye yardımcısı `authenticated`'dan çağrılamaz | Test ortamı |
| P13 | Meşru REST yazma, policy içinde resolver çalışır — `permission denied for function` **yok** | Test ortamı *(P-C1 ile birlikte)* |
| P14 | RLS **ve** Storage policy içinden çağrı çalışır | Test ortamı *(P-C1/P-F ile)* |

## B.7 Yerel dosyalar

### B.7.1 Atomiklik — **tek migration**

> P-B'nin dört SQL adımı (şema · resolver · türetme · allowlist) **tek atomik
> migration** olarak uygulanır. Gerekçe: aralarında yarım uygulanma durumunda
> `internal` şeması eksik grant'larla veya yarım nesne kümesiyle kalabilir.

| # | Dosya | Tür | İçerik |
|---|---|---|---|
| 1 | `supabase/migrations/<ts>_pb_internal_yetki_altyapisi.sql` | **YENİ** | **Tek atomik migration:** ön koşul kontrolü *(§B.0.2)* → şema → ① resolver → ② türetme → ③ allowlist → **her nesne için `REVOKE`/`GRANT` aynı transaction'da** |
| 2 | `docs/security/taslak/PB-FALLBACK.sql` | **YENİ** | Geri alma — **§B.8.2 modeli** *(DROP yok)* |
| 3 | `src/lib/permissionResolver.reference.ts` | **YENİ** | `usePermissions` semantiğinin **saf** portu — kabul testinin referansı |
| 4 | `src/lib/__tests__/permissionResolverParity.test.ts` | **YENİ** | ④ 864 hücre paritesi + **S1…S12 sentetik vakalar** |
| 5 | `src/lib/__tests__/pbMigrationContract.test.ts` | **YENİ** | Migration sözleşmeleri: grant sınırları · `search_path` · `ELSE false` · **`DROP`/`CASCADE` içermez** |
| 6 | `docs/security/db-snapshots/2026-07-26/isletme-users-permissions.anon.json` | **YENİ** | **Anonimleştirilmiş** izin fixture'ı *(§B.5.3 allowlist'iyle)* |
| 7 | `docs/security/PB-TEST-PLANI.md` | **YENİ** | Test ortamı adımları, kabul kriterleri, yarım-uygulanma toparlama yolu |

**Değiştirilmeyen:** `src/hooks/usePermissions.ts` — P-B'de **dokunulmuyor**.

### B.7.2 Yarım uygulanma senaryosu

Tek transaction kullanıldığı için Postgres **kısmi uygulama bırakmaz**; yine de
migration aracı düzeyinde yarım kalma ihtimaline karşı toparlama yolu:

| Belirti | Toparlama |
|---|---|
| Şema var, fonksiyonların bir kısmı yok | Migration **yeniden çalıştırılır** — §B.0.2 kapısı "şema var" diye durduracağı için **önce durum raporlanır**, sonra elle karar |
| Fonksiyon var, grant'lar eksik | Yalnız `REVOKE`/`GRANT` bloğu tekrar uygulanır — **idempotent** |
| Belirsiz durum | 🛑 **Dur.** Salt-okunur envanter (§B.0.1 sorgusu + `pg_proc` + `proacl`) çıkarılır, ayrı karar alınır |

## B.8 Eski istemci davranışı ve geri alma

| Soru | Cevap |
|---|---|
| Eski client ne yaşar? | **Hiçbir şey.** Mevcut uygulama veri yolları değişmiyor; hiçbir politika veya mevcut RPC'ye dokunulmuyor |
| Yeni şema eski client'ı etkiler mi? | Hayır — `internal` Data API'de expose edilmiyor |

### B.8.1 🛑 `DROP SCHEMA ... CASCADE` YASAK

> **`DROP SCHEMA internal CASCADE` plandan ve tüm fallback dosyalarından çıkarıldı.**
> `CASCADE` **hiçbir koşulda kullanılmayacak** — bağımlı nesneleri sessizce siler
> ve etki alanı önceden görülemez.

### B.8.2 Geri alma modeli — **yetkiyi kaldır, nesneyi bırak**

| Adım | İçerik |
|---|---|
| 1 | `REVOKE EXECUTE ON FUNCTION internal.<resolver>(<tam imza>) FROM authenticated;` |
| 2 | `REVOKE USAGE ON SCHEMA internal FROM authenticated;` |
| 3 | Nesneler **yerinde kalır** — erişilemez oldukları için **etkisizdir** |

Bu, geri almayı **tersine çevrilebilir ve dar** tutar: hiçbir şey silinmez,
yalnız erişim kapanır.

### 🔒 B.8.2-a Fallback'in geçerlilik penceresi

> **P-B fallback'i YALNIZ hiçbir P-C/P-F bağımlılığı kurulmadan önce, tek başına
> kullanılabilir.**

| Durum | Fallback kullanılabilir mi |
|---|---|
| P-B uygulandı, **P-C1/C2/C3 ve P-F henüz yok** | ✅ **Evet** — resolver'ı kimse çağırmıyor, yetkiyi kaldırmak güvenli |
| **Herhangi biri** resolver'a bağlandı *(restrictive RLS politikası, Storage politikası, guard'lı RPC)* | 🛑 **HAYIR** — P-B yetkileri **tek başına geri alınamaz** |

**Neden:** `authenticated`'dan `EXECUTE`/`USAGE` çekilirse, resolver'ı çağıran her
RLS politikası ve RPC **`permission denied for function`** ile patlar. Sonuç:
kullanıcıların meşru yazma/okuma işlemleri **toptan durur** — geri alma, düzeltmekten
daha büyük bir kesinti yaratır.

**Bağımlılık kurulduktan sonra geri alma sırası tersine işler:**

```
1) Önce bağımlı katman geri alınır   (P-C1 restrictive politikalar / P-F Storage politikaları kaldırılır)
2) Bağımlılık kalmadığı DOĞRULANIR   (pg_depend + politika taraması, salt-okunur)
3) Ancak o zaman P-B fallback'i uygulanabilir
```

> Her P-C/P-F paketi, **kendi fallback'ini** taşır ve P-B'den **önce** geri alınır.
> P-B fallback dosyasının başına bu uyarı **görünür biçimde** yazılacak.

### B.8.3 Silme gerekirse — koşullu ve ayrı onayda

`DROP` yalnız şu üç şart birlikte sağlanırsa düşünülür:

| # | Şart |
|---|---|
| 1 | **Tam isimli** yeni nesneler — `DROP FUNCTION internal.<ad>(<tam imza>)`. Şema `DROP`'u değil, nesne `DROP`'u |
| 2 | **Bağımlılık kontrolü** — `pg_depend` salt-okunur taraması; hiçbir politika/fonksiyon bağlı olmamalı |
| 3 | **Ayrı açık onay** — bu planın onayı `DROP` onayı **değildir** |

`CASCADE` **kullanılmaz** — bağımlılık çıkarsa `DROP` durur ve raporlanır.

## B.9 Sıra ve kapı

```
P-A  (bağımsız, tek fonksiyon)
P-B  ①②③ oluştur → ④ parite testi → ⑤ erişim testleri
      └── ④ SIFIR SAPMA vermeden P-C1/C2/C3'e geçilmez
```

---

# ORTAK — üretim öncesi zorunlu şartlar

| # | Şart | P-A | P-B |
|---|---|---|---|
| 1 | Canlı gövde snapshot + md5 | ✅ `638fc810…` | Yeni nesne — n/a |
| 2 | `SET search_path` | ✅ mevcut | ✅ yazılacak |
| 3 | Tam yedek (`node scripts/backup.js`) | ✅ | ✅ |
| 4 | Eski-client davranışı yazılı | ✅ §A.3 | ✅ §B.8 |
| 5 | Test ortamı doğrulaması | ✅ §A.6 | ✅ §B.6 |
| 6 | Geri alma dosyası | ✅ | ✅ §B.8.2 *(DROP yok)* |
| 7 | **Tam imza kullanımı** | ✅ §A.1 | ✅ §B.2.1 |
| 8 | **`CASCADE` yasağı** | ✅ *(DROP yok)* | ✅ §B.8.1 |
| 9 | Uygulama anında **salt-okunur ön kontrol** | ✅ §A.3 *(çağrı taraması + cron)* | ✅ §B.0.2 *(şema) + §B.5.2 (üyelik)* |
| 10 | **Ayrı "uygula" onayı** | 🔒 **bekliyor** | 🔒 **bekliyor** |

## Değişim niteliği

| Paket | Nitelik |
|---|---|
| **P-A** | ⚠️ **Additive DEĞİL** — açıkça onaylanmış **erişim daraltıcı** güvenlik istisnası (§A.1.1) |
| **P-B** | Mevcut veri yollarını değiştirmez; **yeni güvenlik yüzeyi** ekler (§B başlığı) |

---

# BU PLANDA YAPILMAYANLAR

- Hiçbir dosya **yazılmadı** — yukarıdaki liste **öneri**dir
- Migration hazırlanmadı · Supabase'e yazılmadı · ACL/RLS değişmedi
- Veri değiştirilmedi · stage/commit yok
- `undo_import_batch` bağımsız onay hattında
- **Uygulama için ayrı onay gerekir**
