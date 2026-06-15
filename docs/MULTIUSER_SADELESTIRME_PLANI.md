# Multi-User İzin Sadeleştirme Planı — 15 Haziran 2026

> **Hedef:** Karmaşık izin modelini (13 modül × 5 aksiyon + visibility + restrictions = 1000+ kombinasyon) referans tasarımdaki sade modele indirmek: **modül aç/kapa + TEK global yetki seviyesi + 3 rol.**
> **Onaylanan çekirdek (kullanıcı):** referansın aynısı; 5-aksiyon ve restrictions kaldırılır. Roller: Yönetici=tam, Operatör=raporlar hariç+kendi, Diğer=boş/özel.
> **Kapsam kolaylığı:** Yalnızca **7 aktif shared user / 5 işletme** → migration küçük + doğrulanabilir.

---

## 1. Yeni veri modeli

```ts
// src/types/multiUser.ts
export type PermissionLevel = 'view' | 'add' | 'edit_own' | 'edit_all';

export interface Permissions {
  modules: Record<ModuleName, boolean>;  // modül aç/kapa (aynı kalır)
  level: PermissionLevel;                 // TEK global seviye (actions'ın yerine)
}
```
**Kaldırılanlar:** `actions` (modül başına 5 boolean), `visibility` (3 flag), `restrictions` (hiç kullanılmıyordu).

**Seviye semantiği (kademeli, tüm açık modüllere geçerli):**
| level | Anlam |
|---|---|
| `view` | Açık modüllerde **tüm** kayıtları görür (kendi/başkası ayrımı YOK — sadeleştirme) |
| `add` | + kayıt **ekler** |
| `edit_own` | + **yalnızca kendi eklediğini** düzenler/siler |
| `edit_all` | + **tüm** kayıtları düzenler/siler |

> **Karar 1:** `can_see_passive`/`can_see_archived` kaldırılıyor (referansta yok; modül açıksa pasif/arşiv de görünür). Onayını istiyorum.

**ModuleName (yeni):** `notlar` EKLENİR (denetim §2.1'i çözer). Toggle olarak gösterilecek modüller (öneri):
`hesaplar, cariler, urunler, personel, islemler, kategoriler, raporlar, cekler, nakit_avans, ileri_tarihli, notlar`
- `dashboard` → herkese açık (toggle yok), `ayarlar` → owner-only (toggle yok), `arsiv` → modüle bağlı (ayrı toggle yok).
> **Karar 2:** Bu modül listesi + referanstaki gibi gruplama (Hesaplar grubu: hesaplar/cariler/urunler/personel; sonra raporlar/notlar/cekler/...) uygun mu?

---

## 2. Roller (3 hazır + Diğer=özel)

| Rol | modules | level |
|---|---|---|
| **Yönetici** | hepsi açık (ayarlar hariç) | `edit_all` |
| **Operatör** | raporlar KAPALI, gerisi açık (öneri) | `edit_own` |
| **Diğer** | hepsi kapalı (elle seçilir) | `view` |

`role_templates` tablosu: manager→Yönetici, operator→Operatör, custom→Diğer; **purchaser kaldırılır** (kullanılmıyorsa). `default_permissions` yeni formata güncellenir.
> **Karar 3:** Operatör'ün varsayılan açık modülleri tam olarak hangileri? (öneri: raporlar hariç hepsi)

---

## 3. Mevcut 7 kullanıcının migration'ı (KİMSE ERİŞİM KAYBETMEZ)

Her `isletme_users.permissions` (ve `isletme_invites.permissions`) için:
- `modules`: **olduğu gibi korunur.**
- `level`: eski `actions`'tan **en yüksek** seviye türetilir (erişim azalmasın):
  ```
  herhangi modülde can_update_all|can_delete_all  → 'edit_all'
  yoksa can_update_own|can_delete_own             → 'edit_own'
  yoksa can_create                                → 'add'
  yoksa                                            → 'view'
  ```
- `notlar` modülü: mevcut kullanıcıya **varsayılan** ver (öneri: cariler/islemler erişimi varsa notlar=true; yoksa false).
- `actions`/`visibility`/`restrictions`: **geçiş için KORUNUR** (eski app sürümü okumaya devam etsin), yeni alanlar eklenir. Tüm kullanıcılar yeni sürüme geçince temizlik migration'ı ile silinir.

Örnek mevcut kullanıcı (canlıdan): tüm modüllerde can_update_all=true → **level='edit_all'**, modules korunur. Doğrulama: 7 kullanıcının önce/sonra etkin erişimi karşılaştırılır.

---

## 4. RLS yeniden yazımı (denetim §2'yi de çözer)

Her veri tablosunun (islemler, hesaplar, cariler, personel, kategoriler, urunler, urun_hareketler, cekler, ileri_tarihli, nakit_avanslar+taksitler, **notlar**) shared policy'leri yeni + SADE yapıya geçer:

```sql
-- SELECT: modül açıksa tüm kayıtlar
EXISTS(iu ... status='active' AND COALESCE((permissions->'modules'->>'TABLO')::bool,false))
-- INSERT: + level add/edit_own/edit_all
... AND (permissions->>'level') IN ('add','edit_own','edit_all')
-- UPDATE/DELETE: + edit_all VEYA (edit_own AND created_by=auth.uid())
... AND ((permissions->>'level')='edit_all'
         OR ((permissions->>'level')='edit_own' AND TABLO.created_by=auth.uid()))
```
**Geçiş güvenliği:** Policy'ler `level` YOKSA eski `actions`'a düşer (COALESCE fallback) — eski-format kullanıcı kalırsa kırılmaz.
**Bonus:** Bu yeniden yazım denetim §2.1 (notlar modül kontrolü), §2.3 (restrictions), §2.4 (ileri_tarihli visibility) maddelerini **otomatik kapatır.**

> ⚠️ Bu, RLS'in en geniş değişikliği. Her tablo için dry-run (BEGIN/ROLLBACK + test) şart. 7 kullanıcı olduğu için her senaryo gerçek hesapla doğrulanabilir.

---

## 5. İstemci değişiklikleri (özet — tam liste keşifte)

- **`usePermissions.ts`:** `canCreate/canUpdate/canDelete/canAccessModule` → yeni `level`+`modules` okur. (own/all için `level==='edit_all'` veya `edit_own && createdBy===user.id`.)
- **`PermissionGate.tsx`, `usePagePermission.ts`:** aynı yeni mantık.
- **`PermissionEditor.tsx`:** referans layout'a redesign → modül toggle listesi + altta TEK seviye seçici (Görebilir/Ekleyebilir/Düzenle-sil(kendi/tümü)).
- **`davet-olustur.tsx`, `UserEditSheet.tsx`, `RoleSelector.tsx`:** 3 rol sekmesi + yeni editor.
- **`_layout.tsx`, `index.tsx` vb.:** `canAccessModule` çağrıları aynı kalır (imza değişmez).
- **i18n** (tr/en multiUser.json): yeni stringler (seviye adları), eski aksiyon stringleri kaldırılır.

---

## 6. Aşamalı uygulama sırası (önerilen)

| Faz | İş | Risk | Doğrulama |
|---|---|---|---|
| **0** | Tip + usePermissions + PermissionGate yeni modele (geriye uyumlu: `level` yoksa eski actions'tan türet) | düşük | tsc + jest |
| **1** | UI redesign: PermissionEditor + davet + UserEditSheet (referans layout) | düşük (sadece UI) | app testi |
| **2** | role_templates güncelle (3 rol, yeni format) | düşük | DB |
| **3** | **Migration:** 7 kullanıcı + invites → yeni format (eski alanlar korunur) | orta | 7 kullanıcı önce/sonra erişim karşılaştırması |
| **4** | **RLS yeniden yaz** (yeni `level`+`modules`, eski fallback) — tablo tablo, dry-run | **yüksek** | her tablo block+legit test |
| **5** | Yeni app sürümü yayını | — | — |
| **6** | (Tüm kullanıcılar geçince) temizlik: eski `actions`/`visibility`/`restrictions` sil + RLS fallback kaldır | düşük | — |

> Faz 0-2 app kodu (sürümle gider, anında kırmaz). Faz 3-4 canlı DB (dikkatli, dry-run). Faz 4 öncesi tam yedek alınır.

---

## 7. Riskler + güvenlik ağı
- **En büyük risk:** Faz 4 RLS. Azaltma: geriye-uyumlu fallback + tablo-tablo dry-run + 7 gerçek kullanıcıyla test + tam yedek.
- **Eski app sürümü:** Geçiş döneminde eski alanlar korunduğu için eski-sürüm kullanıcılar kırılmaz.
- **notlar varsayılanı:** migration'da makul default; yanlışsa kullanıcı bazında düzeltilebilir (7 kişi).

---

## 8. Açık kararlar (senin onayın)
1. `can_see_passive`/`can_see_archived` kaldırılsın mı? (öneri: evet)
2. Modül listesi + gruplama (§1) uygun mu?
3. Operatör varsayılan modülleri (§2)?
4. purchaser rolü kaldırılsın mı? (kullanılmıyorsa evet)
5. notlar migration varsayılanı (cariler/islemler varsa true)?

Kararları ver → Faz 0'dan başlayıp her fazı tsc/jest + (DB fazlarında) dry-run ve gerçek-kullanıcı testiyle, sana göstererek ilerleyelim.
