# Canlı DB Snapshot — SECURITY DEFINER fonksiyonlar + ACL

**Tarih:** 26 Temmuz 2026 · **Proje:** `defter-app` (`ulohxpkhesxozwnlnonb`)
**Yöntem:** salt-okunur `pg_proc` / `has_function_privilege` sorguları.
**Bu dosya ÇALIŞTIRILMAZ.** Repo–üretim drift'inin kanıtı ve sonraki
migration'ların türetileceği referanstır.

---

## Neden alındı

`20260726000000` numaralı güvenlik migration'ı repo dosyalarından üretilmiş ve
uygulanmak üzereydi. Uygulanmadan önce canlı katalog sorgulandı ve **repo ile
üretimin altı fonksiyonda ayrıştığı** görüldü. Migration geri çekildi
(`UYGULAMA_...sql.bak`), çünkü canlı gövdeleri bayat repo gövdeleriyle ezecekti.

**Ders:** güvenlik denetimi üç kaynağı birden okumalı — istemci kodu, migration
geçmişi, **canlı katalog**. Üçü ayrışıyorsa ilk bulgu "drift"tir.

---

## Durum tablosu

| Fonksiyon | SecDef | `user_has_isletme_access` | modül kapısı | `auth.uid()` | anon EXEC | auth EXEC |
|---|---|---|---|---|---|---|
| `undo_import_batch` | ✓ | ❌ | ❌ | ❌ | **✅ AÇIK** | ✓ |
| `increment_balance` | ✓ | ❌ *(bkz. not)* | ❌ | ✅ | **✅ AÇIK** | ✓ |
| `perform_nakit_avans` | ✓ | ✅ | ❌ | ❌ | ❌ | ✓ |
| `perform_taksit_odeme` | ✓ | ✅ | ❌ | ❌ | ❌ | ✓ |
| `delete_nakit_avans_with_reversal` | ✓ | ✅ | ❌ | ❌ | ❌ | ✓ |
| `update_urun_miktar` | ✓ | ❌ | ✅ *(bkz. not)* | ❌ | ❌ | ✓ |
| `get_personel_ozet` | ✓ | ✅ | ❌ | ❌ | ❌ | ✓ |
| `get_urun_ozet` | ✓ | ✅ | ❌ | ❌ | ❌ | ✓ |
| `get_income_expense_summary` | ✓ | ✅ | ❌ | ❌ | ❌ | ✓ |
| `get_category_report` | ✓ | ✅ | ❌ | — | — | — |
| `get_product_report` | ✓ | ✅ | ❌ | — | — | — |
| `ekstre_link_olustur` | ✓ | ✅ | ❌ | ✅ | ❌ | ✓ |

### Notlar (tablo tek başına yanıltıcı — bunlar şart)

**`increment_balance`** — sütun "❌" diyor çünkü `user_has_isletme_access`
yardımcısını ÇAĞIRMIYOR. Ama **tenant kontrolü var**: `EXECUTE format()` ile
kurulan UPDATE'in WHERE'inde çağıranın owner ya da aktif üye olduğu işletmeler
süzülüyor. Eksik olan: modül yetkisi, aksiyon yetkisi, ve gereksiz anon EXECUTE.
Anon çağrıda `auth.uid()` NULL olduğu için pratikte satır güncellenmez.
→ `undo_import_batch` ile **aynı aciliyet sınıfında değil**.

**`update_urun_miktar`** — iki kollu:
- `p_isletme_id` DOLU → üyelik + `urunler` modül kapısı **var**
- `p_isletme_id` NULL → **hiçbir tenant/yetki kontrolü yok**
Yani fonksiyon guard'sız değil; **geriye-uyumluluk kolu** guard'sız.

**Nakit-avans ailesi** — üyelik guard'ı var (repoda YOK, drift). Ama hesap
UUID'lerinin aynı işletmeye ait olduğu her UPDATE'te doğrulanmıyor → cross-tenant
yazma teorik olarak hâlâ mümkün. "Çözülmüş" değiller; yalnız denetim raporundaki
"hiç çağıran kontrolü yok" ifadesi canlı için bayat. Canlıda nakit-avans kaydı
yok ve istemcide çağıran kalmamış → **latent yüzey**.

**3 rapor RPC'si** — üçünde de canlı gövdede şu iz var:
`-- GUVENLIK: capraz-kiraci guard (backfill 20260707100000)`.
Yani denetimin "guard'sız" bulgusu **üretim için geçersiz**; açık repoda.
Eksik olan yalnız `raporlar` modül kapısı.

---

## Drift özeti — repo ile üretim nerede ayrışıyor

| Fonksiyon | Üretimde var, repoda yok |
|---|---|
| `get_income_expense_summary` | erişim guard'ı (backfill 20260707100000) |
| `get_category_report` | erişim guard'ı (aynı backfill) |
| `get_product_report` | erişim guard'ı (aynı backfill) |
| `perform_nakit_avans` | erişim guard'ı |
| `perform_taksit_odeme` | erişim guard'ı |
| `delete_nakit_avans_with_reversal` | erişim guard'ı |
| `update_urun_miktar` | `urunler` modül kapısı |

**Uzlaştırma nasıl YAPILMAMALI** (dış değerlendirici notu, katılıyorum):
- Eski migration dosyalarını değiştirerek ❌
- `db pull` / `db push` ile toptan ❌
- Altı fonksiyonu tek migration'da `CREATE OR REPLACE` ederek ❌
- Canlıdaki her şeyi doğrulamadan doğru sayarak ❌ *(manuel/geçici müdahale olabilir)*

Doğrusu: fonksiyon fonksiyon, davranış doğrulandıktan sonra, **ileri yönlü yeni
migration'larla**. Eski dosyalara dokunulmaz.

---

## `undo_import_batch` — canlı gövde analizi

Tam gövde bu klasördeki `undo_import_batch.live.sql` dosyasında (çalıştırılmaz).

**Yaptığı:** verilen UUID dizisi için hesap/cari/personel bakiyelerini geri alır,
sonra `DELETE FROM islemler WHERE id = ANY(p_transaction_ids)`.

**Eksik olan her şey:**
- `auth.uid()` hiç geçmiyor
- üyelik/işletme kontrolü yok
- `isletme_id` hiçbir sorguda kullanılmıyor → **UUID'ler farklı işletmelerden olabilir**
- silme yetkisi (`level`) sorulmuyor
- `anon` EXECUTE açık

**Şema kısıtı — dikkat:** `islemler` tablosunda `import_batch_id` benzeri bir kolon
**YOK** ve `%import%`/`%batch%` adlı hiçbir tablo yok (sorgulandı, boş döndü).
Yani "bu UUID'ler gerçekten aynı import batch'ine mi ait" kontrolü **mevcut şemayla
sunucuda uygulanamaz**; batch bilgisi istemcide tutuluyor (`useImportHistory`).
Bu şartı istiyorsak önce additive bir kolon gerekir — ayrı iş.
