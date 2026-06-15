# Multi-User Güvenlik Denetimi — 15 Haziran 2026

> **Kim hazırladı:** Otonom senior denetim (33-ajan workflow + canlı RLS/grant doğrulaması).
> **Durum:** Salt-okunur denetim tamamlandı. **Üretime hiçbir değişiklik UYGULANMADI** (gerekçe §0).
> **Sonraki adım:** Bu raporu incele, aşağıdaki hazır SQL'leri **Dashboard → SQL Editor**'da gözden geçirip uygula. Sırayla: §1 (en kritik) → §2 → §3.
> **Yedek:** Bugünkü tam yedek `backups/2026-06-15/` — her şey geri alınabilir.

---

## §0 — Neden hiçbir şey otomatik uygulanmadı?

Sen "acil olanları düzelt" dedin ama "onay veremeyebilirim, uyuyacağım" da dedin. Bulguların **acil olanları** SECURITY DEFINER fonksiyon + RLS değişiklikleri; bunları gözetimsiz uygulamak yanlış olursa **tüm kullanıcılarda** nakit avans / rapor / stok / erişimi kırar. Ayrıca "güvenli görünen" bir düzeltme (detay hook'larına `isletme_id` eklemek) aslında **linked-cari (cari_links) çapraz-işletme erişimini kırardı** — bu yüzden onu da uygulamadım. Karar: **her fix'i dry-run mantığıyla hazırla, uygulamayı sana bırak.** Açıklar zaten aylardır var; birkaç saat beklemek, gece yarısı gözetimsiz bir kırılmadan iyidir.

---

## §1 — 🔴 KRİTİK: SECURITY DEFINER fonksiyonlar çağıran yetkisini kontrol etmiyor (ÇAPRAZ-KİRACI)

**Bu, multi-user'dan daha geniş bir açık — tüm kiracıları (tenant) etkiler.**

7 fonksiyon `SECURITY DEFINER` (RLS'i bypass eder), `isletme_id`'yi parametre alır ve **çağıranın o işletmeye üye olup olmadığını HİÇ kontrol etmez.** Üstelik hepsi hem `authenticated` hem **`anon`** rolüne `EXECUTE`-grant'lı.

| Fonksiyon | Tip | Risk |
|---|---|---|
| `get_income_expense_summary(p_isletme_id,...)` | okuma | Başka işletmenin gelir/gider özetini çek |
| `get_category_report(p_isletme_id,...)` | okuma | Başka işletmenin kategori raporunu çek |
| `get_product_report(p_isletme_id,...)` | okuma | Başka işletmenin ürün raporunu çek |
| `delete_nakit_avans_with_reversal(p_avans_id, p_isletme_id)` | **SİLME** | Başka işletmenin nakit avansını sil + bakiye ters çevir |
| `perform_nakit_avans(p_isletme_id,...)` | **YAZMA** | Başka işletmede nakit avans oluştur |
| `perform_taksit_odeme(p_taksit_id, p_source_hesap_id, p_isletme_id)` | **YAZMA** | Başka işletmede taksit ödemesi yap |
| `update_urun_miktar(p_urun_id, p_miktar_degisim, p_isletme_id)` | **YAZMA** | Başka işletmenin stok miktarını değiştir |

**İstismar:** Bir shared user (hatta sadece anon key'i olan biri) kendi/bilinen bir `isletme_id` ile bu RPC'leri doğrudan çağırır. Rapor modülü KAPALI bir davetli bile tüm finansalı görebilir; nakit_avans izni olmayan biri avans silebilir. UUID tahmini zor olduğundan rastgele saldırı düşük olasılıklı, ama **shared user kendi işletme_id'sini bildiği için doğrudan istismar edilebilir.**

### Fix 1a — ANINDA güvenli azaltma (anon erişimini kes — düşük risk)
Bu fonksiyonların hiçbiri giriş-öncesi (anon) çağrılmaz; anon grant'ı gereksiz. Kesmek güvenlik yüzeyini "anon key'i olan herkes" → "giriş yapmış kullanıcı"a indirir. **Fonksiyon gövdesine dokunmaz = sıfır kırılma riski.**

```sql
REVOKE EXECUTE ON FUNCTION
  public.get_income_expense_summary(uuid, timestamptz, timestamptz),
  public.get_category_report(uuid, text[], timestamptz, timestamptz),
  public.get_product_report(uuid, timestamptz, timestamptz, text[]),
  public.delete_nakit_avans_with_reversal(uuid, uuid),
  public.perform_nakit_avans(uuid, uuid, uuid, numeric, numeric, uuid, text, timestamptz, boolean, integer),
  public.perform_taksit_odeme(uuid, uuid, uuid),
  public.update_urun_miktar(uuid, numeric, uuid)
FROM anon;
```
> ⚠️ **Önce grant yapısını kontrol et:** Grant `PUBLIC`'e verilmişse `REVOKE ... FROM anon` işe yaramaz (anon, PUBLIC üzerinden hâlâ erişir). O durumda: `REVOKE EXECUTE ... FROM PUBLIC;` sonra `GRANT EXECUTE ... TO authenticated;`. Kontrol: `SELECT proacl FROM pg_proc WHERE proname='get_income_expense_summary';` (acl'de `=X/` PUBLIC demektir, `anon=X/` doğrudan demektir).
> Uygulamadan sonra anlık doğrula: app (giriş yapmış kullanıcı = authenticated) raporları/avansı normal kullanmaya devam etmeli.

### Fix 1b — TAM fix (gövdeye çağıran kontrolü ekle — incele + dikkatli uygula)
Her fonksiyonun başına çağıran-üyelik kontrolü. Mevcut `user_has_isletme_access(uuid)` yardımcı fonksiyonu zaten var ve doğru çalışıyor (owner + aktif shared member → true). **CREATE OR REPLACE ile tüm gövdeyi yeniden yazmak gerektiğinden, her fonksiyonun mevcut tanımını `pg_get_functiondef`'ten al, sadece şu bloğu en başa ekle:**

```sql
-- Her SECURITY DEFINER fonksiyonun gövdesinin BAŞINA:
IF NOT public.user_has_isletme_access(p_isletme_id) THEN
  RAISE EXCEPTION 'Yetkisiz erisim' USING ERRCODE = '42501';
END IF;
```
- Raporlar (okuma) için bu yeterli.
- **Mutasyonlarda EK kontrol:** silme/ödeme fonksiyonlarında `p_avans_id`/`p_taksit_id`/`p_urun_id`'nin gerçekten `p_isletme_id`'ye ait olduğunu da doğrula (saldırgan doğru isletme_id + başka işletmenin avans_id'sini geçemesin). Ör. `delete_nakit_avans_with_reversal`: `IF NOT EXISTS(SELECT 1 FROM nakit_avanslar WHERE id=p_avans_id AND isletme_id=p_isletme_id) THEN RAISE EXCEPTION ...`.
- (İdeal) modül/aksiyon iznini de kontrol et (raporlar için `permissions.modules.raporlar`, nakit avans için ilgili aksiyon) — ama önce üyelik kontrolü çapraz-kiracı açığını kapatır.

> ⚠️ Bunları **tek tek, dikkatli**, önce 1 fonksiyonda dry-run (BEGIN/ROLLBACK + test çağrısı) ile uygula. Yanlış gövde = o özellik herkeste kırılır.

---

## §2 — 🔴 KRİTİK/YÜKSEK: Multi-user RLS açıkları (görmemeli ama görüyor/düzeltiyor)

### 2.1 — CRITICAL: `notlar` RLS izin kontrolü YOK (5+ ajan doğruladı)
`notlar` tablosu multi-user RLS deseninden (20260224) SONRA (20260407) eklendiği için **hiç modül/aksiyon kontrolü almamış.** Mevcut shared policy'ler yalnızca `isletme_users` üyeliği + (yaz/sil için) `created_by` kontrol ediyor:
- **Shared select notlar:** sadece aktif üyelik → **herhangi bir davetli (dashboard-only bile) TÜM notları okur.**
- **Shared insert notlar:** sadece aktif üyelik → izinsiz not oluşturur.
- Diğer tüm tablolar (islemler, hesaplar, cariler...) `AND COALESCE((iu.permissions->'modules'->>'X')::boolean, false)` deseni kullanıyor; notlar kullanmıyor.

**Tasarım kararı gerekiyor (bu yüzden hazır-uygula değil):** Notlar polimorfik (`entity_type`: hesap/cari/personel/urun/genel). İki seçenek:
- **(A) entity_type → modül eşlemesi** (CR8 önerisi, en doğru): bir 'cari' notu için `cariler` izni gerek. Mevcut kullanıcıları KIRMAZ (zaten entity'nin modül iznine sahipler). 'genel' notlar için karar gerek (tüm aktif üyelere açık mı, yoksa bir modüle mi bağlı).
- **(B) 'notlar' ayrı modül:** `ModuleName`'e 'notlar' ekle + tüm policy'lere modül kontrolü. **DİKKAT:** mevcut shared user'ların `permissions.modules.notlar` alanı yok → COALESCE false → **mevcut meşru kullanıcılar not erişimini kaybeder.** Bu yüzden ek bir "mevcut kullanıcılara notlar=true ver" migration'ı gerekir.

**Önerilen (A) için fix SQL iskeleti** (incele, 'genel' kararını ver, sonra uygula):
```sql
-- entity_type -> modül eşlemesi: not, ilgili entity'nin modül iznini gerektirir
DROP POLICY IF EXISTS "Shared select notlar" ON notlar;
CREATE POLICY "Shared select notlar" ON notlar FOR SELECT USING (
  EXISTS (SELECT 1 FROM isletme_users iu
    WHERE iu.isletme_id = notlar.isletme_id AND iu.user_id = auth.uid() AND iu.status='active'
      AND COALESCE((iu.permissions->'modules'->> CASE notlar.entity_type
            WHEN 'cari' THEN 'cariler' WHEN 'hesap' THEN 'hesaplar'
            WHEN 'personel' THEN 'personel' WHEN 'urun' THEN 'urunler'
            ELSE 'dashboard' END)::boolean, false)));
-- INSERT/UPDATE/DELETE için de aynı CASE eşlemesi + (yaz/sil) created_by/aksiyon kontrolü eklenmeli.
```
Ayrıca: `src/types/multiUser.ts` ModuleName'e 'notlar' EKLENMELİ değil — yukarıdaki (A) yaklaşımı entity modülünü kullandığı için gerekmez; ama PermissionEditor'da not erişimini yönetmek istersen (B) gerekir. **Bu senin ürün kararın.**

### 2.2 — HIGH: `isletme_users` SELECT herkesin `permissions`'ını sızdırıyor
"View isletme users" policy'si `user_has_isletme_access(isletme_id)` kullanıyor → **isletmedeki herhangi bir aktif üye, TÜM üyelerin `permissions` JSONB'sini (can_update_all, can_delete_all, can_see_all_users_data dahil) okur.** Kullanıcı-yönetimi ekranı `useRequireOwner` ile korunuyor ama RLS bunu zorlamıyor (doğrudan API ile okunur).

**Fix (incele — başka bir özellik shared user'a diğer üyeleri göstermiyorsa güvenli):**
```sql
DROP POLICY IF EXISTS "View isletme users" ON isletme_users;
CREATE POLICY "View isletme users" ON isletme_users FOR SELECT USING (
  user_id = auth.uid()                                              -- kendi satirin
  OR isletme_id IN (SELECT id FROM isletmeler WHERE user_id = auth.uid())  -- veya owner'sin
);
```
> ⚠️ Uygulamadan önce: shared user'a "ekip listesi" gösteren bir özellik var mı kontrol et (varsa o kırılır). useRequireOwner zaten owner-only olduğu için muhtemelen güvenli.

### 2.3 — HIGH: `restrictions` HİÇ zorlanmıyor (ne RLS'te ne client'ta)
`permissions.restrictions` (cari_types, islem_types, max_transaction_amount) tip ve rol şablonlarında var ama **hiçbir yerde uygulanmıyor.** Operator/purchaser rolüne atanan kısıtlamalar etkisiz; davetli izin verilmeyen işlem/cari türü oluşturabilir, max tutar aşabilir.
**Fix:** Önce **client-side** doğrulama ekle (useIslemler/useCariler insert öncesi `usePermissions().restrictions` kontrolü) — hızlı + UX iyi. Tam güvenlik için RLS WITH CHECK'e restriction kontrolü (JSONB parse, karmaşık). Karar: restrictions kullanılacaksa zorla, kullanılmayacaksa tipten/şablonlardan kaldır (sadeleştirme).

### 2.4 — HIGH (latent): `ileri_tarihli_islemler` SELECT görünürlük kontrolü eksik
"Shared select ileri_tarihli" modül kontrolü yapıyor AMA islemler'deki `can_see_all_users_data` görünürlük kontrolünü **atlıyor.** Yani ileri_tarihli modülü olan + `can_see_all_users_data=false` bir davetli, BAŞKA kullanıcıların ileri tarihli işlemlerini görür. **Şu an tüm rol şablonları ileri_tarihli'yi `can_see_all_users_data=true` ile veriyor, bu yüzden mevcut kullanıcı etkilenmiyor (latent).** Yine de açığı kapat (islemler desenini birebir kopyala):
```sql
DROP POLICY IF EXISTS "Shared select ileri_tarihli" ON ileri_tarihli_islemler;
CREATE POLICY "Shared select ileri_tarihli" ON ileri_tarihli_islemler FOR SELECT USING (
  EXISTS (SELECT 1 FROM isletme_users iu
    WHERE iu.isletme_id = ileri_tarihli_islemler.isletme_id AND iu.user_id = auth.uid() AND iu.status='active'
      AND COALESCE((iu.permissions->'modules'->>'ileri_tarihli')::boolean, false)
      AND (COALESCE((iu.permissions->'visibility'->>'can_see_all_users_data')::boolean, false)
           OR ileri_tarihli_islemler.created_by = auth.uid())));
```
> Mevcut kullanıcıların hepsi `can_see_all_users_data=true` olduğundan bu değişiklik **kimseyi etkilemez** ama latent açığı kapatır → en güvenli RLS fix'i.

---

## §3 — 🟡 FONKSİYON BOŞLUKLARI (davetli görmemeli DEĞİL, AKSİNE erişemiyor)

Bu tablolar multi-user RLS migration'ından (20260224) önce/sonra eklendiği için **shared user policy'si almamış** → yetkisi olan davetli bile kullanamıyor (güvenlik açığı değil, eksik özellik). **Karar: shared user'lar bu özelliklere erişmeli mi?** Evetse her birine `nakit_avanslar`/`islemler` desenindeki shared policy'leri ekle:

| Tablo | Etki | Not |
|---|---|---|
| `nakit_avans_taksitler` | Davetli taksit planı göremez/yönetemez | `created_by` kolonu da yok → eklenmeli veya parent üzerinden izin |
| `irsaliye_records` | Davetli foto-import/irsaliye kullanamaz | — |
| `cari_aliases`, `urun_aliases` | Davetli için OCR import eşleştirme kırılır | cariler/urunler iznine bağla |

> Hepsi RLS tarafından doğru ENGELLENİYOR (sızıntı yok) — sorun sadece yetkili davetlinin erişememesi. Multi-user'ı tam kullanan müşterin yoksa düşük öncelik.

---

## §4 — 🟢 DESEN / SADELEŞTİRME

- **İzin modeli hâlâ karmaşık:** `actions` objesi modül başına 5 boolean (can_create/update_own/update_all/delete_own/delete_all) + visibility + restrictions = teorik 1000+ kombinasyon. PLANLAR.md'deki "3 rol + modül başına aç/kapa + 4 kademeli seviye" sadeleştirmesi **henüz yapılmamış.** Roller hâlâ manager/operator/purchaser/custom. Sadeleştirme gerçek bir iyileştirme olur ama büyük iş (ayrı plan).
- **detay hook'larında (`useCari`/`usePersonel`/`useUrun`) `isletme_id` filtresi yok:** denetim "tutarsız" dedi AMA bu muhtemelen **KASITLI** — linked-cari (cari_links) çapraz-işletme erişimi için. **DOKUNMA** (filtre eklemek linked cariyi kırar).
- `notlar` modülü `ModuleName` tipinde yok (§2.1 ile ilgili).

---

## §5 — ✅ YANLIŞ POZİTİFLER (denetim flagledi, gerçek değil — boşuna uğraşma)

- **"isletmeler.scheduled_deletion_at kolonu yok":** YANLIŞ. Kolon VAR — bugün bizzat kullandım (silme cron'u + 27 satır döndü). Hesap silme çalışıyor.
- **Storage linked-cari foto bypass:** RLS owner kontrolü shared user'ı zaten engelliyor (çapraz erişim yok).
- **pending_islemler shared policy yok:** KASITLI tasarım — import owner-only (UI `isOwner` gate + RLS owner-only). Doğru.
- **isletme_invites shared deny yok:** implicit-deny doğru çalışıyor (owner-only PERMISSIVE yeterli).
- **profiles çapraz-işletme:** shared user başka owner profili göremez; owner↔owner cari_links görünürlüğü KASITLI (FK join düzeltmesi).

---

## §6 — Önerilen uygulama sırası

1. **§1 Fix 1a (REVOKE anon)** — en güvenli, anında uygula, anlık doğrula. Çapraz-kiracı yüzeyini daraltır.
2. **§1 Fix 1b (çağıran kontrolü)** — fonksiyon fonksiyon, dry-run ile. Çapraz-kiracıyı tam kapatır. **En kritik iş.**
3. **§2.4 (ileri_tarihli)** — kimseyi etkilemez, açığı kapatır. Düşük risk.
4. **§2.2 (isletme_users)** — ekip-listesi özelliği yoksa uygula.
5. **§2.1 (notlar)** — tasarım kararı ver ((A) önerilir), sonra uygula.
6. **§2.3 (restrictions)** — kullanılacaksa zorla, kullanılmayacaksa kaldır.
7. **§3 (fonksiyon boşlukları)** — multi-user'ı tam kullanan müşteri varsa.

Her DB değişikliğinden önce: dry-run (BEGIN/ROLLBACK + test). Yedek `backups/2026-06-15/` hazır.
