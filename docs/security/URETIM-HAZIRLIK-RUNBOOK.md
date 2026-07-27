# P-A / P-B — ÜRETİM HAZIRLIK RUNBOOK'U

**Durum:** 🔒 **HAZIRLIK** · üretime uygulanmadı · SQL çalıştırılmadı · stage/commit yok
**Tarih:** 26 Temmuz 2026 · **Baz commit:** `5f04873`

> 🛑 **ÖN KOŞUL:** P-A veya P-B üretime uygulanmadan önce kullanıcı, kendi
> yönettiği güncel ve doğrulanmış tam yedeğin bulunduğunu açıkça teyit eder.
> Yedek/restore sürecinin hazırlanması ve işletilmesi bu runbook'un kapsamı dışıdır.

---

# 1. KANIT MANİFESTİ (sabitlendi)

## 1.1 Üretime uygulanacak — **yalnız bu iki dosya**

| Dosya | sha256 |
|---|---|
| `20260726130000_cleanup_audit_log_acl.sql` **(P-A)** | `c5cb48b5b7eb535d2c749b20165dceaa46b6a84169a010b3194a1f3765781e1b` |
| `20260726140000_pb_internal_yetki_altyapisi.sql` **(P-B)** | `6818bc98197906b916ade2ae0dfab12ed0dbba280b6fd4be1b4a3ae131c6d85e` |

## 1.2 🚫 Üretime **GİRMEYECEK** — ayrı onay hattı

| Dosya | sha256 |
|---|---|
| `20260726120000_undo_import_batch_owner_guard.sql` | `9809ae22f2b0635c8c907c4cb10f0e10ac658611772a6fa5f01e75bcddd5ba93` |

## 1.3 Destek kanıtları

| Dosya | sha256 (16) |
|---|---|
| `src/lib/permissionResolver.reference.ts` | `162c74e0d7f58bd8` |
| `src/lib/__tests__/permissionResolverParity.test.ts` | `5e33cdc2064e2e48` |
| `src/lib/__tests__/pbMigrationContract.test.ts` | `68ed87567d41a2a0` |
| `src/lib/__tests__/cleanupAuditLogAclMigration.test.ts` | `81b0aaf9079db8ff` |
| `db-snapshots/2026-07-26/isletme-users-permissions.anon.json` | `6a156ef89353ba2c` |
| `db-snapshots/2026-07-26/cleanup_old_islem_audit_log.live.sql` | `f160593482f3f9df` |
| `taslak/PB-FALLBACK.sql` | `a39e31925d7aa844` |
| `taslak/cleanup_audit_log_acl-FALLBACK.sql` | `32c12767cf0264c7` |

## 1.4 Scratch harness — üretime **girmez**, yalnız kayıt

| Dosya | sha256 (16) |
|---|---|
| `00000000000000_local_test_bootstrap.sql` | `8844ea17e3e0417d` |
| `00000000000001_baseline_minimal.sql` | `6a567e02cccd220c` |

## 1.5 Yerel doğrulama sonucu

**87/87 GEÇTİ** — ayrıntı [PB-TEST-PLANI](PB-TEST-PLANI.md).
Yerel jest: **478/478** · tsc temiz · eslint temiz.
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
| 2 | `20260726130000` sha256 | `c5cb48b5b7eb535d…` |
| 3 | `20260726140000` sha256 | `6818bc98197906b9…` |
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
> **"doğrulandı" sayılmaz.**

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
| **B4** | Canlı izin paritesi **yeniden** | 24 üyelik × 6 modül × 6 yetenek → **sıfır sapma** | Sapma varsa DUR |
| **B5** | `level` dağılımı | Allowlist dışı değer **yok** | Varsa DUR — fail-closed deltası artık sıfır-etkili değil |
| **B6** | `islemler` NaN/Inf/≤0 taraması | **0** | >0 ise DUR — NI8 residual'ı önce ele alınır |
| **B7** | `isletme_users` / `isletmeler` / `islemler` şekilleri | Baseline snapshot'ıyla aynı | Farklıysa DUR — drift |
| **B8** | §2.3 kapıları | ✅ | Değilse DUR |
| **B9** | Kullanıcının yönettiği güncel tam yedek | **açık teyit** | Teyit yoksa DUR |

> **B4 kritik:** Plandaki 24 üyelik 26 Tem anlık görüntüsüdür. Aradaki üyelik/izin
> değişiklikleri pariteyi bozabilir. **Uygulama gününde tekrar alınır.**

## 4.2 Uygulama

Tek atomik migration. İçindeki ön koşul kapısı şema varsa `42P06` ile **kendisi durur**.

## 4.3 Uygulama SONRASI doğrulama *(salt-okunur)*

| # | Kontrol | Beklenen |
|---|---|---|
| **B-V1** | `internal` şema ACL | `{postgres=UC, authenticated=U}` · `anon` USAGE **yok** |
| **B-V2** | 4 fonksiyon mevcut | `etkin_yetki` · `bakiye_ops` · `cevrilen_tutar` · `islem_tipi_modulu` |
| **B-V3** | `etkin_yetki` ACL | `{postgres=X, authenticated=X}` · `prosecdef=true` |
| **B-V4** | Diğer 3 fonksiyon ACL | `{postgres=X}` — **authenticated grant YOK** |
| **B-V5** | `proconfig` | 4/4 → `{search_path=pg_catalog}` |
| **B-V6** | PUBLIC EXECUTE | **hiçbirinde yok** |
| **B-V7** | **Data API exposed schemas TEKRAR** | `internal` **hâlâ listede yok** |
| **B-V8** | REST'ten doğrudan çağrı | `POST /rest/v1/rpc/etkin_yetki` → **404** · `Content-Profile: internal` → **406** |
| **B-V9** | Mevcut akışlar | QTB kayıt · cari ödeme · rapor açılışı **bozulmamış** |

> **B-V7 ve B-V8 atlanamaz** — şema oluşturmanın exposed listesini etkilemediği
> **gözlemle** doğrulanmalı, varsayılmamalı.

## 4.4 Geri alma

`docs/security/taslak/PB-FALLBACK.sql` — `REVOKE EXECUTE` + `REVOKE USAGE`.
Nesneler **yerinde kalır**, `DROP` yok, `CASCADE` yok.

> ⚠️ **Yalnız P-C/P-F bağımlılığı kurulmadan önce tek başına kullanılabilir.**
> Yerel provada doğrulandı (FB-0…FB-5, 6/6).

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
| **G-1** | Üretimden **salt-okunur** ön kontrol envanteri (A1–A10, B1–B9) | 🔒 onay bekliyor |
| **G-2** | **P-A** üretim uygulaması | 🔒 onay + kullanıcı yönetimindeki güncel tam yedek teyidi bekliyor |
| **G-3** | **P-B** üretim uygulaması | 🔒 G-2'den **bağımsız** onay + güncel tam yedek teyidi bekliyor |
| **G-4** | NI8 salt-okunur NaN/Inf taraması | 🔒 onay bekliyor |
| **G-5** | `undo_import_batch` üretim uygulaması | 🔒 **ayrı hat**, bu runbook kapsamı dışı |

## 7.1 🔒 G-2 / G-3 ön koşulu — kullanıcı yönetimindeki tam yedek

Yedek alma, restore provası ve dış konumda saklama kullanıcı tarafından yönetilir.
Ajan, üretim uygulamasına geçmeden önce yalnız güncel tam yedeğin bulunduğuna dair
açık kullanıcı teyidini arar; yedek altyapısını kendiliğinden yeniden başlatmaz.
