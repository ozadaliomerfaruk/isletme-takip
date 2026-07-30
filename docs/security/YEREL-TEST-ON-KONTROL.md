# YEREL TEST ORTAMI — KURULUM ÖN KONTROLÜ

**Durum:** 🔒 **YALNIZ ÖN KONTROL.** Hiçbir şey kurulmadı, hiçbir CLI komutu
çalıştırılmadı, üretime dokunulmadı.
**Tarih:** 26 Temmuz 2026 · **Karar:** Seçenek **A** — Docker Desktop + yerel Supabase

> **29 Temmuz güncellik notu:** Bu dosyanın ortam/envanter sayıları 26 Temmuz
> tarihsel snapshot'ıdır. P-A ve P-B daha sonra ayrı güvenlik hattında canlıya
> alınmış ve canonical dosyaları canlı migration sürümleriyle yeniden adlandırılmıştır.

---

# 1. Docker Desktop ön koşulları

| Koşul | Durum | Not |
|---|---|---|
| Windows 11 Pro, 64-bit, build 26200 | ✅ | Docker Desktop destekliyor |
| RAM | ✅ **31,7 GB** | Gereken ~4 GB |
| C: boş alan | ✅ **130,7 GB** | Gereken ~20 GB |
| `HypervisorPresent` | ✅ True | Bir hipervizör zaten aktif |
| **WSL2** | 🔴 **KURULU DEĞİL** | `wsl.exe` var ama alt sistem yok: *"Linux için Windows Alt Sistemi yüklü değil"* |
| Windows isteğe bağlı özellikler | ⚠️ **Sorgulanamadı** | `Get-WindowsOptionalFeature` yönetici ister |
| Oturum yönetici mi | 🔴 **Hayır** | Kurulum **yükseltme** gerektirecek |

## 1.1 🛑 Kurulum için gerekenler — **ayrı onay bekliyor**

| # | Adım | Gerektirdiği |
|---|---|---|
| 1 | `wsl --install` | **Yönetici** · Windows özellikleri (VirtualMachinePlatform, WSL) · **büyük olasılıkla YENİDEN BAŞLATMA** |
| 2 | Docker Desktop kurulumu | **Yönetici** · kurulum sonrası oturum açma/kapama |
| 3 | Docker Desktop'ın çalışır duruma gelmesi | WSL2 arka ucu |

> **`VirtualizationFirmwareEnabled = False` yanıltıcı olabilir:** bir hipervizör
> zaten çalıştığında (VBS/Bellek Bütünlüğü, Credential Guard) Windows bu alanı
> `False` raporlar. `HypervisorPresent = True` olduğu için sanallaştırmanın BIOS'ta
> **açık olduğu** değerlendirmesi yapılabilir; kesin doğrulama WSL kurulunca netleşir.
>
> **Kurulum yapılmadı.** Yeniden başlatma ve yönetici gerektirdiği için ayrı açık
> onay bekleniyor.

---

# 2. 🔴 GÜVENLİK BULGUSU — repo ÜRETİME LİNKLİ

`supabase/.temp/` içeriği:

| Dosya | İçerik | Risk |
|---|---|---|
| **`project-ref`** | **`ulohxpkhesxozwnlnonb`** | **ÜRETİM ref'i** |
| **`linked-project.json`** | `{"ref":"ulohxpkhesxozwnlnonb","name":"defter-app",…}` | **ÜRETİM projesi** |
| **`pooler-url`** | `postgresql://***@aws-1-eu-central-1.pooler.supabase.com:5432/postgres` | **Üretim bağlantı dizesi + kimlik bilgisi** |
| `postgres-version` | `17.6.1.063` | Üretim sürümü |
| `cli-latest` · `gotrue-version` · `rest-version` · `storage-*` | Sürüm önbelleği | Zararsız |

> **Bu çalışma dizininden `supabase db push` çalıştırmak doğrudan ÜRETİME yazar.**
> Kullanıcının koyduğu *"testi üretime linkli dizinde yürütme"* kuralı bu bulguyla
> tamamen doğrulanmıştır.

## 2.1 Scratch kopyası — taşınacak / taşınmayacak

**Taşınacak:**

```
supabase/migrations/*.sql      (aşağıdaki listeye göre)
supabase/config.toml           (project_id dahil — yerel ad, ref DEĞİL)
supabase/seed.sql              (varsa; gerçek veri İÇERMEMELİ, kontrol edilecek)
```

**🚫 TAŞINMAYACAK:**

```
supabase/.temp/                 ← project-ref, linked-project.json, pooler-url
supabase/functions/             ← gerekmiyor; deploy riski yaratır
.env* / *.key / service_role    ← her türlü kimlik bilgisi
```

Kopya hedefi: **scratchpad** *(proje ağacı dışında)*.

---

# 3. Yerel PostgreSQL sürümü

| Kaynak | Değer |
|---|---|
| `config.toml` → `[db] major_version` | **17** |
| Üretim (`.temp/postgres-version`) | **17.6.1.063** |
| Üretim (canlı sorgu) | PostgreSQL **17.6.1.063** |

✅ **Major sürüm eşleşiyor.** `supabase start` sonrası `select version()` ile
**tekrar doğrulanacak** *(hedef: major 17)*.

---

# 4. ✅ Data API kapısı — yerel config zaten doğru

`config.toml`:

```toml
[api]
schemas = ["public", "graphql_public"]
extra_search_path = ["public", "extensions"]
```

> **`internal` şeması exposed listesinde YOK.** §2.1 kapısının yerel karşılığı
> varsayılan konfigürasyonda **zaten sağlanıyor**. Test sırasında bu satır
> **değiştirilmeyecek** ve uygulama sonrası REST'ten `internal.etkin_yetki`
> çağrısının **erişilemez** olduğu ayrıca kanıtlanacak.

⚠️ `extra_search_path` `public` içeriyor — bu **PostgREST istekleri** içindir,
fonksiyonların `SET search_path`'ini etkilemez. Resolver'ın kendi `pg_catalog`
kısıtı geçerli kalır.

---

# 5. ⚠️ `supabase start` TÜM migration'ları çalıştırır

**186 `.sql` dosyası** — tam liste:
`scratchpad/migration-listesi.txt` *(T = tracked, U = untracked)*

| Grup | Adet |
|---|---|
| Git'te tracked | **183** |
| **Untracked** | **3** |

## 5.1 26 Temmuz tarihsel “untracked üçlü” snapshot'ı

| # | Dosya | Durum |
|---|---|---|
| 184 | **`20260726120000_undo_import_batch_owner_guard.sql`** | ⚠️ **AYRI ONAY HATTINDA** — P-A/P-B kapsamında değil |
| 185 | `20260729035553_cleanup_audit_log_acl.sql` | P-A — 29 Temmuz'da canlı |
| 186 | `20260729064915_pb_internal_yetki_altyapisi.sql` | P-B — 29 Temmuz'da canlı |

> **`undo_import_batch` migration'ı `supabase start` ile yerelde de çalışır.**
> Yerel ortamda bu zararsızdır (izole), ama **sessizce olmamalı.** İki seçenek:
>
> | Seçenek | Sonuç |
> |---|---|
> | **Dahil et** | Yerel baseline üretime daha yakın olur; `undo_import_batch` de prova edilmiş olur. **Üretim onayı vermez** |
> | **Scratch kopyasından çıkar** | Yalnız P-A/P-B izole test edilir; ayrı hat tamamen ayrı kalır |
>
> **Önerim: dahil et** — yerel çalıştırma üretim onayı anlamına gelmiyor ve
> baseline'ı gerçeğe yaklaştırıyor. **Karar ürün sahibinin.**

## 5.2 Nötrleştirilmiş migration — durum

`docs/security/unsafe-migrations/20260726000000_rapor_rpc_erisim_guard.UYGULAMA-YASAK.sql.txt`
`migrations/` **dışında** ve uzantısı `.txt` → `supabase start` onu **çalıştırmaz**. ✅

---

# 6. ⚠️ Repo–üretim drift'i — "zincir geçti" ≠ eşdeğerlik

Migration zincirinin yerelde hatasız çalışması **üretim eşdeğerliği kanıtı değildir.**
Bu projede repo ile üretim gövdeleri daha önce **ayrıştı** *(ÖNCE-0 olayı)*.

## 6.1 P-B'nin bağımlı olduğu şekiller — karşılaştırma listesi

Yerel baseline kurulduktan sonra, **salt-okunur** snapshot'larla üretime karşılaştırılacak:

| # | Nesne | Karşılaştırılacak |
|---|---|---|
| 1 | `isletme_users` | Kolonlar · `permissions` JSONB · `status` değerleri |
| 2 | `isletmeler` | `id` · `user_id` |
| 3 | `islemler` | `type` CHECK **16 değer** · `amount numeric(15,2) CHECK (>0)` · `exchange_rate numeric(18,8)` **CHECK yok** |
| 4 | `auth.uid()` | Mevcut ve aynı imzada |
| 5 | `hesaplar` / `cariler` / `personel` | `balance` kolonu tipi |
| 6 | `usePermissions` bağımlılıkları | `permissions->modules/actions/visibility/level` anahtar kümesi |

**Sapma çıkarsa:** yerel test sonucu **üretim için geçersiz** sayılır; sapma
raporlanır ve önce kapatılır.

> P-B yalnız `internal` şemasında nesne oluşturduğu ve **hiçbir mevcut nesneyi
> değiştirmediği** için drift riski düşüktür — ama resolver `isletme_users` ve
> `isletmeler` **okuduğu** için bu ikisinin şekli kritiktir.

---

# 7. CLI kuralları — çalıştırma sırasında uygulanacak

| Kural | Uygulama |
|---|---|
| Her komut öncesi `--help` ile yerel bayrak doğrulaması | ✅ zorunlu |
| Mümkün olan her yerde açık `--local` | ✅ zorunlu |
| `db push` · `migration up` *(remote)* · `link` · `deploy` | 🚫 **YASAK** |
| Üretim ref'ini (`ulohxpkhesxozwnlnonb`) hedefleyen hiçbir komut | 🚫 **YASAK** |
| Çalışma dizini | **Scratch kopyası** — üretime linkli repo **DEĞİL** |
| Gerçek kullanıcı verisi | 🚫 Kopyalanmaz — 24 profil **anonim/sentetik** fixture |

---

# 8. Özet — sıradaki adım

| # | Durum |
|---|---|
| ✅ | Ön kontrol tamamlandı |
| 🔴 | **WSL2 kurulu değil** → yönetici + muhtemel yeniden başlatma |
| 🔴 | Oturum yönetici değil |
| 🔒 | **Docker Desktop kurulmadı — ayrı açık onay bekliyor** |
| ✅ | Migration listesi yazılı çıkarıldı (186 dosya, 3 untracked işaretli) |
| ✅ | Scratch kopyası kapsamı belirlendi (`.temp` hariç) |
| ✅ | Yerel PG major 17 = üretim ✓ |
| ✅ | `internal` yerel exposed-schema listesinde yok ✓ |
| ⏳ | **Karar bekleyen:** `undo_import_batch` migration'ı scratch kopyasına dahil mi *(§5.1)* |

**Hiçbir kurulum yapılmadı · hiçbir CLI komutu çalıştırılmadı · üretime yazılmadı ·
stage/commit yok.**
