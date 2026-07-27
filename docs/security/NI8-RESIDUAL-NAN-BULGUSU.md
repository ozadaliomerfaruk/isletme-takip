# NI8 — RESIDUAL GÜVENLİK BULGUSU: `islemler.amount` CHECK'i NaN'ı geçiriyor

**Durum:** 🟠 **AÇIK RESIDUAL** · düzeltme migration'ı **hazırlanmadı** · tarama **yapılmadı**
**Tarih:** 26 Temmuz 2026
**Kaynak:** P-B izolasyon harness testi NI8 *(yerel PostgreSQL 17.6)*

---

# 1. Bulgu

```sql
CONSTRAINT islemler_amount_check CHECK (amount > (0)::numeric)
```

PostgreSQL'de **`'NaN'::numeric > 0` TRUE döner** — `numeric` tipinde NaN, tüm
sayılardan **büyük** kabul edilir. Dolayısıyla bu CHECK **NaN'ı engellemiyor.**

## 1.1 Yerel kanıt *(harness, NI8)*

| Test | Sonuç |
|---|---|
| `INSERT INTO islemler (amount) VALUES ('NaN')` | ✅ **KABUL EDİLDİ** |
| `'Infinity'::numeric(15,2)` cast | ❌ typmod **reddediyor** *(NI9)* |

Yani **`NaN` yazılabiliyor**, `Infinity` typmod tarafından engelleniyor.

## 1.2 Motor davranışı *(canlı PG 17'de saf ifadeyle doğrulandı)*

| İfade | Sonuç |
|---|---|
| `'NaN'::numeric > 0` | **TRUE** |
| `'NaN'::numeric <= 0` | FALSE |
| `'NaN'::numeric IS NULL` | FALSE |
| `'NaN'::numeric * 5` | **NaN** |
| `round('NaN'::numeric, 2)` | **NaN** |
| `'NaN' = 'NaN'` | TRUE *(tespit için güvenli)* |

## 1.3 `exchange_rate`

`exchange_rate numeric(18,8)` — **hiç CHECK yok.** NaN kabul edilir.

---

# 2. Etki

| Alan | Durum |
|---|---|
| Bir NaN tutar yazılırsa | Bakiye matematiğine **sessizce yayılır** (`NaN * x = NaN`) |
| Yuvarlama temizler mi | ❌ Hayır |
| `IS NULL` guard'ı yakalar mı | ❌ Hayır |
| `internal.bakiye_ops` *(P-B)* | ✅ **Kendi guard'ıyla reddediyor** |
| İstemci `safeParseAmount` | ✅ Fırlatıyor |
| **Tablo seviyesi** | 🔴 **Açık** — doğrudan REST/SQL ile yazılabilir |

> P-B bu açığı **kendi yolunda** kapatıyor; ama `islemler` tablosuna **başka yollardan**
> yazan her akış (doğrudan REST INSERT, diğer RPC'ler) hâlâ NaN yazabilir.

---

# 3. Şu ana kadar bilinen üretim durumu

26 Tem salt-okunur tarama *(67.548 işlem)*:

| Kontrol | Sonuç |
|---|---|
| `amount = 'NaN'` | **0** |
| `amount = ±'Infinity'` | **0** |
| `exchange_rate = 'NaN'` | **0** |
| `exchange_rate = ±'Infinity'` | **0** |
| `exchange_rate <= 0` | **0** |

> **Üretimde bugün kirli kayıt yok.** Bu, açığın kapalı olduğu anlamına **gelmez** —
> yalnız henüz sömürülmediğini/oluşmadığını gösterir.

---

# 4. Yapılacak — **onay bekliyor**

## 4.1 Aşama 1: Genişletilmiş **salt-okunur** tarama

> 🔒 **Ayrı onay gerekiyor** *(runbook G-4)*. Yalnız `SELECT` — hiçbir yazma yok.

Kapsam: `islemler` **+** bakiye/tutar tutan diğer tablolar.

| Tablo | Kolon |
|---|---|
| `islemler` | `amount`, `exchange_rate` |
| `hesaplar` · `cariler` · `personel` | `balance` |
| `ileri_tarihli_islemler` | tutar/kur kolonları |
| `taksitler` · `taksit_planlari` | tutar kolonları |
| `islem_tahsis` | tutar kolonları |
| `nakit_avanslar` · `cekler` | tutar kolonları |

Her biri için: `= 'NaN'` · `= 'Infinity'` · `= '-Infinity'` sayımı.

**Çıktı:** tablo × kolon × sayım raporu. Kirli kayıt bulunursa → **ayrı bulgu**,
temizlik planı ayrıca tasarlanır *(veri değişikliği ayrı onay)*.

## 4.2 Aşama 2: Düzeltme tasarımı — **henüz yapılmadı**

Olası yönler *(karar verilmedi, kod yazılmadı)*:

| # | Yaklaşım | Not |
|---|---|---|
| 1 | CHECK'i güçlendir: `amount > 0 AND amount = amount` *(NaN ≠ kendisi mantığı Postgres'te geçerli değil — `NaN = NaN` TRUE)* → doğrusu: `amount > 0 AND amount <> 'NaN'::numeric` | ⚠️ Mevcut CHECK'i değiştirmek = tarihsel constraint'e dokunmak; `islemler_type_check` zaten 6 kez ALTER edilmiş |
| 2 | `exchange_rate` için **yeni** CHECK ekle | Additive |
| 3 | Yalnız yazma yollarında guard *(P-C paketleri)* | Tablo seviyesi açık kalır |
| 4 | Üçünün karması | — |

> Eski satırlar CHECK'i ihlal ediyorsa `ALTER TABLE … ADD CONSTRAINT` **başarısız olur** —
> bu yüzden Aşama 1 taraması **ön koşuldur**.

---

# 5. Öncelik

| Soru | Cevap |
|---|---|
| P-A/P-B'yi bloke eder mi | ❌ **Hayır** — P-B kendi guard'ını taşıyor |
| P-C1/C2/C3 öncesi çözülmeli mi | ✅ **Evet** — o paketler yazma yollarını yeniden yazıyor, doğru yer orası |
| Aciliyet | 🟠 Orta — üretimde kirli kayıt yok, ama açık duruyor |

---

# 6. Bu belgede yapılmayanlar

- Tarama **çalıştırılmadı** *(ayrı onay bekliyor)*
- Düzeltme migration'ı **hazırlanmadı**
- Mevcut CHECK'e **dokunulmadı**
- Üretime **dokunulmadı** · stage/commit **yok**
