# P-A / P-B — ÜRETİM HAZIRLIK RUNBOOK'U

**Durum:** ✅ P-A `20260729035553` ve P-B `20260729064915` canlı · rollback
preflight, bağımsız denetim ve canlı son kontrol tamamlandı · stage/commit yok
**İlk tarih:** 26 Temmuz 2026 · **Re-audit:** 29 Temmuz 2026

> Kullanıcı 27 Temmuz 2026 tarihli güncel yedeği teyit etti. P-B yalnız yeni
> schema/fonksiyon/ACL ekler; DML, backfill, ALTER TABLE, DROP veya mevcut veri
> yeniden yazımı içermez. Bu nedenle P-B öncesi tekrar yedek istenmez. Bu kapsam
> dışına çıkan yıkıcı bir değişiklik olursa DUR ve yeni yedek/onay kapısı açılır.

---

# 1. KANIT MANİFESTİ (sabitlendi)

## 1.1 Uygulanan ve canlı geçmişle eşleştirilen canonical dosyalar

| Dosya | sha256 |
|---|---|
| `20260729035553_cleanup_audit_log_acl.sql` **(P-A)** | `c5cb48b5b7eb535d2c749b20165dceaa46b6a84169a010b3194a1f3765781e1b` |
| `20260729064915_pb_internal_yetki_altyapisi.sql` **(P-B)** | `57d06efa6dddfae5a69dd6f0dcb350312270cf427d00a479928f837cd1b5772d` |

### 1.1-a Sonraki canlı P-D tüketicileri

| Dosya | sha256 |
|---|---|
| `20260729071904_add_kategori_secim_referanslari_rpc.sql` | `cc4c4a4d7c318b204e9498321ae78c2888162feb1070987387f52d95018bdc14` |
| `20260729073717_restrict_transaction_creator_labels_visibility.sql` | `444228e19ede1a70cba8bed0c01c1311c6e677c351719d8bba92b9c13dedf98a` |

## 1.2 🚫 Üretime **GİRMEYECEK** — ayrı onay hattı

| Dosya | sha256 |
|---|---|
| `20260726120000_undo_import_batch_owner_guard.sql` | `9809ae22f2b0635c8c907c4cb10f0e10ac658611772a6fa5f01e75bcddd5ba93` |

## 1.3 Destek kanıtları

| Dosya | sha256 (16) |
|---|---|
| `src/lib/permissionResolver.reference.ts` | `c301c1e9ba29f15f` |
| `src/lib/__tests__/permissionResolverParity.test.ts` | `8b0f27fbf163b654` |
| `src/lib/__tests__/pbMigrationContract.test.ts` | `1e14f63a589a351f` |
| `docs/security/taslak/PB-POSTGRES-DAVRANIS-TESTI.sql` | `b9a140afd513f973` |
| `src/lib/__tests__/cleanupAuditLogAclMigration.test.ts` | `81b0aaf9079db8ff` |
| `db-snapshots/2026-07-26/isletme-users-permissions.anon.json` | `6a156ef89353ba2c` |
| `db-snapshots/2026-07-26/cleanup_old_islem_audit_log.live.sql` | `f160593482f3f9df` |
| `taslak/PB-FALLBACK.sql` | `a1e9a5fcafa3c19d` |
| `taslak/cleanup_audit_log_acl-FALLBACK.sql` | `32c12767cf0264c7` |

## 1.4 Scratch harness — üretime **girmez**, yalnız kayıt

| Dosya | sha256 (16) |
|---|---|
| `00000000000000_local_test_bootstrap.sql` | `8844ea17e3e0417d` |
| `00000000000001_baseline_minimal.sql` | `6a567e02cccd220c` |

## 1.5 Yerel doğrulama sonucu

Tarihsel izole harness **87/87**, güncel P-B hedef turu **97/97** geçti — ayrıntı
[PB-TEST-PLANI](PB-TEST-PLANI.md). Son birleşik çalışma ağacı doğrulaması
**66/66 suite, 1.037/1.037 test**; TypeScript temiz, ESLint 0 hata/107 uyarı,
iOS Metro 4.085 modüldür.
Canlı gövde referansı: `cleanup_old_islem_audit_log` md5 **`638fc810853a0acbea7b106407ac1a1b`**.

---

# 2. 🔴 UYGULAMA YÖNTEMİ — `db push` GEÇERSİZ *(26 Temmuz envanteriyle revize)*

## 2.1 Salt-okunur üretim envanterinin çürüttüğü varsayım

Bu bölüm önceden *"undo dosyasını taşı, uygulanmamış liste 2'ye insin"* diyordu.
**26 Temmuz 2026 salt-okunur üretim envanteri bunu geçersiz kıldı:**

| Ölçüm | Değer |
|---|---|
| Üretimde uygulanmış migration | **177** |
| Repo'da olup **uygulanmamış** | **77** |
| Üretimde olup repo'da dosyası yok | **69** |

> **`supabase db push` üretimde 77 migration çalıştırmayı dener** — yalnız P-A ve
> P-B'yi değil. Ölçülen migration drift'i nedeniyle çoğu hata verir veya
> zaten uygulanmış DDL'i tekrar çalıştırır.
>
> **`db push` bu projede P-A/P-B için KULLANILMAZ.**

## 2.2 Yerine — ayrı ve temiz deployment çalışma alanı

> **Son dakika dosya taşıma tek güvence olamaz.**

| # | Kural |
|---|---|
| 1 | Üretim uygulaması **ayrı, temiz bir deployment çalışma alanından** yapılır — üretime linkli geliştirme reposundan **değil** |
| 2 | O alanda **yalnız** hash'i doğrulanmış P-A ve P-B dosyaları bulunur |
| 3 | Bekleyen `undo_import_batch` **çalıştırılabilir hiçbir klasörde bulunmaz** |
| 4 | Uygulama **tek tek**, dosya bazında yapılır *(toplu push yok)* |
| 5 | Her dosya uygulanmadan önce sha256'sı §1.1 ile karşılaştırılır |

## 2.3 Kapı — uygulama öncesi zorunlu doğrulama

| # | Kontrol | Beklenen |
|---|---|---|
| 1 | Deployment alanındaki `.sql` dosyaları | **tam olarak 2** |
| 2 | `20260729035553` sha256 | `c5cb48b5b7eb535d…` |
| 3 | `20260729064915` sha256 | `57d06efa6dddfae5…` |
| 4 | Alanda `owner_guard` içeren dosya | **yok** |
| 5 | Alanda `.temp` / `project-ref` / pooler URL / anahtar | **yok** |
| 6 | Uygulama yöntemi | **tek tek**, `db push` **değil** |

> **Herhangi biri sağlanmazsa: DUR.**

## 2.5 🔒 DEĞİŞMEZ KURAL — yeni drift oluşturulmayacak

> P-A/P-B **tek tek uygulansa bile** yeni repo–üretim drift'i **oluşturulmayacak.**
> Bu kural pazarlık dışıdır; sağlanamıyorsa **P-A/P-B UYGULANMAZ.**

| # | Kural | Doğrulama |
|---|---|---|
| **D1** | Üretimde oluşan **kesin migration version/name**, SQL içeriği ve hash **repoda birebir karşılık bulacak** | Uygulama sonrası `schema_migrations` kaydı ↔ repo dosya adı + sha256 karşılaştırması |
| **D2** | Uygulama sonrası, **üretim geçmişinde olup repoda olmayan yeni kayıt sayısı ARTMAYACAK** | Öncesi **69** → sonrası **69** *(değişmemeli)* |
| **D3** | Ham `execute_sql` ile **migration geçmişi dışında DDL uygulanmayacak** | Yalnız migration mekanizması kullanılır; ad-hoc DDL yasak |
| **D4** | Uygulama aracı **server-generated timestamp** üretiyorsa, oluşan **kesin version salt-okunur doğrulanacak** ve **aynı canonical dosya repoda korunacak** | Uygulama sonrası `schema_migrations`'tan version okunur; repo dosyası gerekirse o version'a **yeniden adlandırılır** — içerik **değişmez**, hash korunur |

### 2.5.1 Neden kritik

Salt-okunur üretim envanteri ölçtü: üretimde **69** kayıt repo karşılığı olmadan duruyor, repoda **77**
dosya uygulanmamış. Bu drift'in kaynağı tam olarak D1–D4'ün ihlali:
`apply_migration` server-side timestamp üretti, repo dosyası el ile başka bir
timestamp'le yazıldı, ikisi hiç eşleşmedi.

> **P-A/P-B bu hatayı tekrarlamayacak.** Uygulama öncesi ve sonrası
> "repoda olmayan üretim kaydı" sayısı **ölçülür ve karşılaştırılır**.

### 2.5.2 Uygulama sonrası zorunlu drift kontrolü

| # | Kontrol | Beklenen |
|---|---|---|
| 1 | Yeni `schema_migrations` kayıt sayısı | **+1** *(P-A için)* / **+1** *(P-B için)* |
| 2 | Oluşan version | Repo dosya adındaki version ile **aynı** — değilse D4 uygulanır |
| 3 | Repoda karşılığı olmayan üretim kaydı | **69** *(artmamış)* |
| 4 | Uygulanan SQL'in hash'i | §1.1'deki sha256 ile **aynı** |
| **5** | 🔴 **İÇERİK HASH EŞLEŞMESİ** — üretimde oluşan **yeni version/name** ile **repo canonical dosyasının SQL içerik hash'i** | **BİREBİR AYNI** |

### 2.5.3 🔒 D5 — içerik hash eşleşmesi *(ek kabul kriteri)*

> *"Repoda olmayan üretim kaydı sayısı artmadı"* **tek başına yeterli DEĞİLDİR.**

| Şart | |
|---|---|
| Üretimde oluşan **kesin version/name** tespit edilir | `schema_migrations` salt-okunur okuma |
| O version'a karşılık gelen **repo canonical dosyası** belirlenir | §1.1 manifesti |
| İkisinin **SQL içerik hash'i** karşılaştırılır | sha256 |
| Sonuç | **Birebir eşleşmeli** |

**Neden:** kayıt sayısı sabit kalsa bile, üretime **farklı içerikli** bir SQL
uygulanmış olabilir *(ör. elle düzenlenmiş, kısmen uygulanmış veya araç tarafından
dönüştürülmüş)*. Sayı kontrolü bunu yakalamaz; **içerik hash'i yakalar.**

> 🛑 **Bu kanıt sağlanmadan sonraki pakete GEÇİLMEZ.**
> P-A doğrulanmadan P-B'ye, P-B doğrulanmadan P-C'ye geçilmez.

**Uygulanabilirlik notu:** üretim `schema_migrations` tablosunda SQL gövdesi
saklanıyorsa hash doğrudan karşılaştırılır. Saklanmıyorsa, uygulanan nesnenin
**canlı tanımı** *(`pg_get_functiondef` / `proacl` / policy tanımı)* okunur ve
repo dosyasının **beklenen sonucuyla** karşılaştırılır — P-A için bu zaten
A-V1…A-V5, P-B için B-V1…B-V6 kapılarıdır.

> **3. madde artarsa veya 5. madde eşleşmezse: drift oluşmuştur → geri alma
> değerlendirilir ve neden araştırılmadan ikinci pakete geçilmez.**

### 2.5.4 29 Temmuz uygulama kaydı

| Paket | Canlı version/name | Canonical repo dosyası | Sonuç |
|---|---|---|---|
| P-A | `20260729035553_cleanup_audit_log_acl` | `20260729035553_cleanup_audit_log_acl.sql` | Eşleşti |
| P-B | `20260729064915_pb_internal_yetki_altyapisi` | `20260729064915_pb_internal_yetki_altyapisi.sql` | Eşleşti; SQL hash `57d06efa…` |
| P-D kategori | `20260729071904_add_kategori_secim_referanslari_rpc` | `20260729071904_add_kategori_secim_referanslari_rpc.sql` | Eşleşti; SQL hash `cc4c4a4d…` |
| P-D creator | `20260729073717_restrict_transaction_creator_labels_visibility` | `20260729073717_restrict_transaction_creator_labels_visibility.sql` | Eşleşti; SQL hash `444228e1…` |

Sunucu tarafından üretilen kesin sürümler salt-okunur katalogdan alındı; canonical
dosyalar içerik değiştirilmeden bu sürümlerle yeniden adlandırıldı.

## 2.4 `undo_import_batch`'in geleceği

Ayrı onay geldiğinde, dosya **olduğu gibi** uygulanmaz. Timestamp'i geçmişte
kaldığı için **güncel yeni timestamp'li bir migration olarak yeniden hazırlanması**
değerlendirilir. Bu ayrı hat kendi runbook'unu gerektirir.

---

# 3. P-A — `cleanup_old_islem_audit_log` ACL daraltması

**Nitelik:** ⚠️ **Additive DEĞİL** — açıkça onaylanmış **erişim daraltıcı** güvenlik istisnası.

## 3.1 Uygulama ÖNCESİ kapılar *(hepsi salt-okunur)*

| # | Kontrol | Beklenen | DUR koşulu |
|---|---|---|---|
| **A1** | Canlı gövde md5 | `638fc810853a0acbea7b106407ac1a1b` | **Farklıysa DUR** — gövde ayrışmış |
| **A2** | Fonksiyon sahibi | `postgres` | Farklıysa DUR |
| **A3** | Mevcut ACL | `{=X/postgres, postgres=X, anon=X, authenticated=X, service_role=X}` | Beklenenden farklıysa DUR — başkası değiştirmiş |
| **A4** | `prosecdef` | `true` | Farklıysa DUR |
| **A5** | `proconfig` | `search_path=public` içeriyor | Yoksa DUR |
| **A6** | Cron kaydı | `cleanup-old-islem-audit-log` · `username=postgres` · `active=true` · komut `SELECT public.cleanup_old_islem_audit_log();` | Farklıysa DUR |
| **A7** | Kardeş cron ACL'leri | `app_events_rollup_and_trim` ve `usage_snapshot_al` → `{postgres=X, service_role=X}` | Farklıysa DUR — emsal geçersiz |
| **A8** | Çağıran taraması | `src/` ve `supabase/functions/` içinde referans **yok** | Varsa DUR |
| **A9** | §2.3 kapıları | ✅ | Değilse DUR |
| **A10** | Kullanıcının yönettiği güncel tam yedek | **açık teyit** | Teyit yoksa DUR |

## 3.2 Uygulama

Tek `REVOKE`. Gövdeye dokunulmaz (`CREATE OR REPLACE` yok, `DROP` yok, `CASCADE` yok).

## 3.3 Uygulama SONRASI doğrulama *(salt-okunur)*

| # | Kontrol | Beklenen |
|---|---|---|
| **A-V1** | ACL | `{postgres=X, service_role=X}` |
| **A-V2** | `has_function_privilege('anon', …)` | `false` |
| **A-V3** | `has_function_privilege('authenticated', …)` | `false` |
| **A-V4** | `has_function_privilege('service_role', …)` | `true` |
| **A-V5** | Gövde md5 | **`638fc810…` DEĞİŞMEMİŞ** |
| **A-V6** | Cron job | hâlâ `active=true`, `username=postgres` |
| **A-V7** | Bir sonraki cron çalışması | `cron.job_run_details` → **`succeeded`** |

> **A-V7 zorunlu.** Cron günlük `03:15`'te çalışıyor; sonucu görülene kadar P-A
> **"doğrulandı" sayılmaz.** 29 Temmuz 03:15 UTC çalışması `succeeded`; job 8
> `active=true`, çağıran `postgres` olarak salt-okunur doğrulandı.

## 3.4 Geri alma

`docs/security/taslak/cleanup_audit_log_acl-FALLBACK.sql` — yalnız `authenticated`
iade eder; **`PUBLIC`/`anon` iade EDİLMEZ**. Kullanmadan önce gerçek çağıran tespit edilir.

---

# 4. P-B — `internal` yetki altyapısı

**Nitelik:** Mevcut veri yollarını değiştirmez; **yeni güvenlik yüzeyi** ekler.

> **P-A'dan BAĞIMSIZ uygulanır.** İkisi tek transaction değildir; birleştirilmez.

## 4.1 Uygulama ÖNCESİ kapılar *(hepsi salt-okunur)*

| # | Kontrol | Beklenen | DUR koşulu |
|---|---|---|---|
| **B1** | `internal` şeması | **YOK** | Varsa **DUR** — sahip/ACL/içerik raporlanır, ayrı karar |
| **B2** | `private` · `app_private` · `sec` şemaları | YOK | Varsa incele |
| **B3** | **Data API exposed schemas** | `public, graphql_public` — **`internal` YOK** | Değişmişse DUR |
| **B4** | Canlı izin paritesi **yeniden** | 24 üyelik × **14 modül** × 6 yetenek → **2016 hücre, sıfır sapma** | Sapma varsa DUR |
| **B5** | `level` + permissions JSON tip taraması | level allowlist dışı yok; modules/actions/visibility boolean alanlarında boolean dışı değer yok | Varsa DUR — exact-jsonb deny etkisi ayrı değerlendirilir |
| **B6** | `islemler` NaN/Inf/≤0 taraması | **0** | >0 ise DUR — NI8 residual'ı önce ele alınır |
| **B7** | `isletme_users` / `isletmeler` / `islemler` şekilleri | Baseline snapshot'ıyla aynı | Farklıysa DUR — drift |
| **B8** | §2.3 kapıları | ✅ | Değilse DUR |
| **B9** | Veri güvenliği | 27 Temmuz yedeği teyitli; migration DML/backfill/ALTER TABLE/DROP içermiyor | SQL kapsamı değişirse DUR |

> **B4 kritik:** Plandaki 24 üyelik 26 Tem anlık görüntüsüdür. Aradaki üyelik/izin
> değişiklikleri pariteyi bozabilir. **Uygulama gününde tekrar alınır.**

## 4.2 Uygulama

Tek atomik migration. İçindeki ön koşul kapısı şema varsa `42P06` ile **kendisi durur**.

## 4.3 Uygulama SONRASI doğrulama *(salt-okunur)*

| # | Kontrol | Beklenen |
|---|---|---|
| **B-V1** | `internal` şema ACL | `{postgres=UC, authenticated=U}` · `anon` USAGE **yok** |
| **B-V2** | 4 fonksiyon mevcut | `etkin_yetki` · `bakiye_ops` · `cevrilen_tutar` · `islem_tipi_modulu` |
| **B-V3** | `etkin_yetki` resultant ACL (`aclexplode`) | owner + `authenticated=EXECUTE`; PUBLIC/anon/service_role explicit grant **yok** · `prosecdef=true` |
| **B-V4** | Diğer 3 fonksiyon resultant ACL (`aclexplode`) | yalnız owner · PUBLIC/anon/authenticated/service_role EXECUTE **yok** |
| **B-V5** | `proconfig` | 4/4 → `{search_path=pg_catalog}` |
| **B-V6** | PUBLIC EXECUTE | **hiçbirinde yok** |
| **B-V7** | **Data API exposed schemas TEKRAR** | `internal` **hâlâ listede yok** |
| **B-V8** | REST'ten doğrudan çağrı | `POST /rest/v1/rpc/etkin_yetki` → **404** · `Content-Profile: internal` → **406** |
| **B-V9** | Mevcut akışlar | QTB kayıt · cari ödeme · rapor açılışı **bozulmamış** |
| **B-V10** | Gerçek PostgreSQL turu | Üretimde public DML yapmayan `BEGIN/ROLLBACK` preflight geçti; DML'li `PB-POSTGRES-DAVRANIS-TESTI.sql` yalnız izole staging için saklandı |

> **B-V7 ve B-V8 atlanamaz** — şema oluşturmanın exposed listesini etkilemediği
> **gözlemle** doğrulanmalı, varsayılmamalı.
>
> **PG17 ACL notu:** per-schema `ALTER DEFAULT PRIVILEGES ... REVOKE`, global
> PUBLIC EXECUTE defaultunu kaldıramaz. B-V3/B-V4 yalnız bu migrationın mevcut
> dört fonksiyonunun **final sweep sonrası resultant ACL** sonucudur. Gelecekte
> `internal` fonksiyonu ekleyen her migration kendi final schema sweep'ini yapar;
> yeni fonksiyonun otomatik kapalı doğduğu asla varsayılmaz.

### 4.3.1 Eski client etkisi

P-B mevcut tablo/policy/RPC veya veriyi değiştirmediği için 1.5.x istemciler
migration sonrasında aynı akışları kullanır; yeni `internal` nesnelerini çağırmaz.
Bu P-B uygulama anı değerlendirmesidir. 29 Temmuz'da iki public P-D tüketicisi
resolver'a bağlandı: `get_kategori_secim_referanslari` additive olduğu için 1.5.x
tarafından çağrılmaz; `get_transaction_creator_labels` aynı imza/çıktıyla yalnız
yetkisiz etiketleri daralttığı için 1.5.x'i etkilemez ve RPC'yi kullanan yeni
istemciyi kırmaz.

## 4.4 Geri alma

`docs/security/taslak/PB-FALLBACK.sql` — `REVOKE EXECUTE` + `REVOKE USAGE`.
Nesneler **yerinde kalır**, `DROP` yok, `CASCADE` yok.

> ⚠️ **Artık tek başına kullanılamaz.** P-D bağımlılıkları
> `get_kategori_secim_referanslari` ve `get_transaction_creator_labels` canlıdır.
> Bu iki fonksiyon için doğrulanmış bağımsız fallback artifact'i henüz yoktur; bunlar
> yazılıp rollback preflight'tan geçmeden P-B fallback **BLOKEDIR**. Ardından
> `pg_depend`, `pg_policy` ve fonksiyon/view/trigger tanımları yeniden
> denetlenmelidir. Bağımlılar sıfırlanmadan P-B fallback uygulanmaz. Fallback dosyası
> ayrıca canlı bağımlılık bulursa executable guard ile kendi transaction'ını durdurur.

---

# 5. ÜRETİM SONRASI SMOKE — **yalnız salt-okunur**

| # | Kontrol | Yöntem |
|---|---|---|
| **S1** | P-A ACL hedefte | `pg_proc.proacl` okuma |
| **S2** | P-B nesneleri ve ACL'leri | `pg_proc` / `pg_namespace` okuma |
| **S3** | Data API exposed schemas | Ayar okuma + REST 404/406 |
| **S4** | Cron sağlığı | `cron.job` + `cron.job_run_details` okuma |
| **S5** | Uygulama hata oranı | `app_events` okuma — 42501 artışı var mı |
| **S6** | Mevcut RPC'ler çalışıyor | Uygulamadan **normal kullanım** *(yazma testi yapılmaz)* |
| **S7** | Dar kategori P-D ucu | Exact `id/name/type/color`; owner/shared/type allowlist pozitif, anon/cross-tenant negatif |
| **S8** | Creator-label P-D hardening | Exact imza, `pg_catalog`; owner/own-only/Cariler-only/kaynaksız/cross-tenant matrisi |

> **Hiçbir smoke adımı üretimde INSERT/UPDATE/DELETE/DDL çalıştırmaz.**

## 5.1 DURMA kriterleri — biri bile olursa **derhal geri al**

| # | Belirti |
|---|---|
| D1 | Cron çalışması `failed` |
| D2 | Kullanıcılarda beklenmedik `42501` artışı |
| D3 | `internal` Data API'de görünür hâle gelmiş |
| D4 | P-A gövde md5 değişmiş |
| D5 | Herhangi bir finansal akışta hata |
| D6 | Beklenmedik bir çağıranın P-A fonksiyonuna eriştiği tespiti |

---

# 6. RESIDUAL — NI8

`islemler.amount` `CHECK (amount > 0)` **NaN'ı geçiriyor** (`'NaN' > 0` = TRUE).
Ayrı iş kalemi: [NI8-RESIDUAL-NAN-BULGUSU.md](NI8-RESIDUAL-NAN-BULGUSU.md).
**Bu turda düzeltme migration'ı hazırlanmadı.**

---

# 7. ONAY KAPILARI — her biri AYRI

| # | İşlem | Durum |
|---|---|---|
| **G-1** | Üretimden **salt-okunur** ön kontrol envanteri (A1–A10, B1–B9) | ✅ tamamlandı |
| **G-2** | **P-A** üretim uygulaması | ✅ `20260729035553` canlı |
| **G-3** | **P-B** üretim uygulaması | ✅ `20260729064915` canlı; rollback preflight + audit + post-smoke geçti |
| **G-4** | NI8 salt-okunur NaN/Inf taraması | ✅ ölçülen 67.548 işlemde NaN/Inf/≤0 bulunmadı; tablo-level NaN residual'ı ayrı açık |
| **G-5** | `undo_import_batch` üretim uygulaması | 🔒 **ayrı hat**, bu runbook kapsamı dışı |
| **G-6** | P-D dar kategori + creator tüketicileri | ✅ canlı; bağımsız fallback artifact'leri henüz yok, bu yüzden P-B fallback bloklu |

## 7.1 🔒 G-2 / G-3 ön koşulu — kullanıcı yönetimindeki tam yedek

Yedek alma, restore provası ve dış konumda saklama kullanıcı tarafından yönetilir.
Ajan, üretim uygulamasına geçmeden önce yalnız güncel tam yedeğin bulunduğuna dair
açık kullanıcı teyidini arar; yedek altyapısını kendiliğinden yeniden başlatmaz.
