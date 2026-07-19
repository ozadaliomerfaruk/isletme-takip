# Taksit + Vade + FIFO + Web-Ekstre — Entegrasyon Planı (v1 · 19 Tem 2026 · Opus)

> Esnaf-kullanıcı talebi (rakip referansları: metiscari, HAMZA ZÖNGÜR, EminHesap).
> Bu plan koda karşı **doğrulanarak** yazıldı (şema + 3 keşif ajanı). Fable ile ortak karar için.
> İlke: **app'i boğmadan** (az yeni sayfa) + **eski-kullanıcı güvenli** (additive, opt-in) +
> **para-kodu disiplinli** (atomik RPC, `computeBalanceOps` paritesi) — kayıt-asılması turundaki disiplin.

## 0. Kök tespit (kanıtlı)
- `islemler`'de **vade tarihi / kalan / tahsis YOK** (green-field). `date_end` (text, izin aralığı) ve `source_ileri_id` (scheduled linki) var; vade yok.
- **`cekler.vade_tarihi`** var ama hiç UI yok → yalnız DDL emsali.
- `cariler.balance` **tek numerik** (increment_balance / computeBalanceOps). Cari sign kuralı: `app/cariler/[id].tsx:502-530` (alis −, odeme +, satis +, tahsilat −, iadeler ters). Pozitif = bize borçlu (alacak), negatif = biz borçlu.
- **İleri-tarihli ≠ vade:** `ileri_tarihli_islemler.scheduled_date` = henüz-olmamış planlı işlem; edge function **yalnız hatırlatma** yollar, gerçek kayıt client "Gerçekleştir" ile olur. i18n **zaten "Vade Tarihi/Vadesi Geçmiş"** kelimelerini scheduled için kullanıyor → yeni özellik **YENİ i18n key'leri** almalı. Kullanıcı kararı: **ikisi aynı modalda gösterilmeyecek.**

## 1. Omurga — tek model
**"Vadeli açık borç" + FIFO tahsis defteri.** Her şey bundan türer:
- Borç-doğuran işleme opsiyonel **`vade_tarihi`**.
- Ödeme/tahsilat → carinin açık vadeli borçlarına **FIFO** (en eski vade önce) tahsis; **kısmi** destekli; **işlem-bazlı hedef** de mümkün.
- **Kalan / gecikme / V.G. / agregat özet** ayrı tutulmaz → bu defterden **hesaplanır**.
- **Taksit = bu modelin özel hâli** (bir satış N vadeli parçaya bölünür).

### Kritik güvenlik ilkesi (additive/opt-in)
Bu katman **YALNIZ `vade_tarihi` olan işlemlerde** çalışır. Vadesiz işlemler = **bugünkü davranış birebir**.
`cariler.balance` **tek gerçek kaynak KALIR** — tahsis defteri onu **yeniden hesaplamaz**, PARALEL bir görüntü katmanıdır. Eski veri etkilenmez (**backfill YOK**); merchant vade girerek opt-in eder.

## 2. Veri modeli (migration'lar — hepsi additive)
1. **`islemler.vade_tarihi date NULL`** — borç-doğuran tiplerde ödeme vadesi. NULL = vadesiz. Partial index `WHERE vade_tarihi IS NOT NULL`. create/update_islem_atomik'e kolon (trivial).
2. **`islem_tahsis`** `(id, isletme_id, borc_islem_id, odeme_islem_id, tutar, taksit_id NULL, created_at)` — bir ödeme `tutar` kadar bir borca tahsis (1 ödeme → N borç). **`taksit_id` nullable** (Fable): doluysa tahsis o taksite işaret eder (taksit-bazlı FIFO), boşsa işlem-bazlı — **tek defter, tek motor**. **Kalan(borç)=amount − Σtahsis**; **Kalan(taksit)=taksit.tutar − Σ(tahsis WHERE taksit_id=X)**; açık=kalan>0; gecikme=açık ∧ vade<bugün. Invariant: Σtahsis(ödeme) ≤ ödeme.amount, kalan ≥ 0. **balance'a dokunmaz.** Bütünlük (taksit_id, borc_islem_id planına ait olmalı) **CHECK ile DEĞİL trigger/RPC guard ile** (PG CHECK çapraz-tablo alt-sorgu yapamaz — Opus düzeltmesi).
3. **`taksit_planlari` + `taksitler`** `[KİLİTLENDİ]` — taksitli satış/alış = **1 cari borç işlemi (toplam)** + `taksitler(plan_id, sira, vade, tutar)`. **Belirleyici gerekçe (Fable, muhasebe):** N ayrı işlem, satışı taksit vadelerine dağıtır → `get_income_expense_summary` `date`'e göre topladığından gelir/gider raporu bozulur (satış BİR KEZ, satış tarihinde olmuştur; vade yalnız tahsilat beklentisi). 1-işlem modeli mevcut rapor/bakiye matematiğini (tek `computeBalanceOps`) HİÇ değiştirmez + N-kaydı senkron tutma yükü yok. Cari listede 1 işlem; taksit detayında N satır.
4. **`cari_ekstre_links`** `(token opak, cari_id, isletme_id, date_range, expires_at, revoked)` — `cari_share_codes` desenini (üretim RPC + expiry + rate-limit) örnek al; ama ANONİM tarayıcı için **ayrı tablo** (`cari_links.cari_id` UNIQUE + app-to-app'e özgü).

## 3. FIFO algoritması (saf fonksiyon, birim-testli)
Girdi: açık vadeli borçlar (vade artan) + ödeme tutarı (+ opsiyonel hedef borç).
1. Hedef verilmişse önce ona tahsis (kalanına kadar).
2. Artan → **en eski vadeden** sırayla doldur (kısmi olabilir).
3. Fazla → "avans / tahsis edilmemiş" (cari bakiyeyi normal düşürür).
4. Kısmi tahsiste borç **KAPANMAZ**; kalan gösterilir; **gecikme kalan için sürer**.
- İki yön simetrik (müşteri tahsilat / tedarikçi ödeme).
- **Viewer/inversiyon (Fable düzeltmesi — ÖNEMLİ):** tahsis DB'de **HAM tutarlar + owner-canonical tip** üzerinden yapılır; inversiyon **YALNIZ gösterim katmanıdır**. Viewer'a göre değişen değerlerle tahsis hesaplamak, aynı defterin iki kullanıcıda farklı görünmesi riskini doğurur → YASAK. (Önceki v1'deki "inverted değerler üzerinden" ifadesi hatalıydı, düzeltildi.)
- **`computeBalanceOps` paritesi:** tahsis bakiye matematiğini DEĞİŞTİRMEZ; yalnız hangi borcun kapandığını işaretler.

## 4. Backend RPC'ler (SECURITY DEFINER + izin-gate `20260716030000` deseni, atomik)
- create/update_islem_atomik → `vade_tarihi` kolonu (additive).
- **`tahsilat_ekle_fifo(p_isletme, p_cari, p_tutar, p_hesap, p_hedef_borc?)`** — ödeme islem'i + FIFO tahsis + bakiye TEK transaction.
- **`odeme_ekle_fifo(...)`** — simetrik.
- `taksit_plani_olustur(...)` / `taksit_tahsilat_ekle(...)`.
- `ekstre_link_olustur / iptal` + **public edge function** (`verify_jwt=false`, service-role client, `pdfExport.ts` `generatePdfHtml`'i sunucuda kullan). `config.toml` `static_files` HTML bundle destekliyor.
- Hepsi para-kodu → atomik + reconciliation guard + idempotency (kayıt-asılması turu deseni).

## 5. Frontend (mevcut ekranları zenginleştir; grounded dosyalar)
| Yüzey | Dosya | Değişiklik |
|---|---|---|
| **QTB — vade girişi** | `QuickTransactionBar/hooks/useTransactionSubmit.ts` + `sections/HeaderSection.tsx` | Opsiyonel **Vade** kontrolü. `date` + `🔔 scheduled` + **yeni Vade** net ayrı. YENİ i18n. |
| **Cari detay** | `app/cariler/[id].tsx` → `components/ui/TransactionRow.tsx` | İşlem başına **Kalan + gecikme rozeti** (opsiyonel props + memo comparator; stil `IleriTarihliIslemlerSection`); header'da **V.G. özet**; **swipe onAction slotu BOŞ** → "Tahsil et/Öde" FIFO hızlı aksiyon. Viewer-güvenli. |
| **Cari liste** | `app/(tabs)/cariler.tsx` | Kart üstünde gecikme rozeti (`renderCariItem` balance bloğu). |
| **Dashboard** | `components/dashboard/DashboardCarousel.tsx` | **4. kart** `DueSummaryCard` (agregat V.G.) — YENİ hook (scheduled'dan türetME). |
| **İleri-tarihli modalı** | `components/ui/NotificationBell.tsx` | **DOKUNULMAZ** (ayrı kavram — kullanıcı kararı). |
| **Taksit (YENİ 2 sayfa)** | `app/taksit/*` (yeni) | Taksit Takip listesi (Satış/Alış toplam + sekmeler) → Taksit detay (satır + FIFO tahsilat). |
| **Web-ekstre** | `components/export/ShareOptionsSheet.tsx` + backend | "Ekstre Linki" seçeneği + token; `generatePdfHtml` sunucuda. |

## 6. Fazlar (her biri shippable + cihaz-test edilebilir)
1. **Temel (düşük risk, para-kodu YOK):** `vade_tarihi` kolonu + QTB vade girişi + cari detay/liste'de **vade+gecikme GÖSTERİMİ** (tahsis yok). Değer: gecikme görünürlüğü hemen gelir.
2. **Tahsis çekirdeği (para-kodu — EN KRİTİK):** `islem_tahsis` + FIFO tahsilat/ödeme RPC + Kalan + swipe + V.G. özet + dashboard kartı. En dikkatli faz (atomik + reconciliation). **Faz 2 kapsamına ZORUNLU (Fable boşluk-1 + Opus genişletmesi):**
   - **Silme/düzenleme × tahsis** — `create/update/delete_islem_atomik` tahsis-farkında olmalı, aynı transaction'da:
     - **Ödeme silme** → tahsisleri sil (borçlar yeniden açılır, kalan artar).
     - **Borç silme** → o borca ait tahsisleri boşalt → serbest kalan ödeme tutarı **yeniden FIFO** dağıtılır ya da avansa döner (Opus eki: yalnız "tahsis sil" yetmez, ödeme tekrar dağıtılmalı).
     - **Borç tutarı ↓** (Σtahsis'in altına) → kalan≥0 için tahsis **kırp + yeniden dağıt**; **ödeme tutarı ↓** → fazla tahsisi kırp.
   - **Retahsis** (bir tahsisı silip yeniden dağıtma) yeteneği **baştan** (oto-FIFO güvenli çünkü balance'a dokunmaz; yanlış tahsis para kaybettirmez, düzeltilebilir olmalı). Aksi halde ilk silmede defter tutarsızlaşır.
3. **Taksit:** plan/taksitler + liste/detay (FIFO'yu yeniden kullanır).
4. **Web-ekstre:** token + edge function + HTML (ayrı track; 1-3'e paralel gidebilir).

## 7. Kararlar — KİLİTLENDİ (Opus + Fable mutabık, 19 Tem)
1. **Taksit modeli:** ✅ **1-işlem + `taksitler` alt-tablo** (§2.3 muhasebe gerekçesi belirleyici).
2. **Tahsis hedefi:** ✅ **Ortak `islem_tahsis` + nullable `taksit_id`** (ayrı defter YOK → motor/invariant ikilenmez). Bütünlük trigger/RPC guard'ı (CHECK değil).
3. **Varsayılan tahsis:** ✅ **Oto-FIFO + opsiyonel hedef override**; **retahsis Faz 2'de baştan** (balance'a dokunmadığı için güvenli/düzeltilebilir).
4. **Web-ekstre barındırma:** ✅ **Supabase edge function**; token API'si (`cari_ekstre_links`) **barındırmadan bağımsız** → ileride Next.js gelirse aynı token tüketilir, çöp yok.
5. **Çevresel (risk%/limit/kara liste/cari kodu):** ✅ **ERTELE** (tahsis defteri cihazda kanıtlanana dek anlamsız).

_v1→v2: §2.2 `taksit_id`+trigger-guard · §2.3 taksit kilitlendi (muhasebe) · §3+§8 viewer/inversiyon düzeltmesi (ham DB, owner-canonical) · §6 Faz 2'ye silme/düzenleme×tahsis + retahsis · §7 kararlar kilitlendi._

## 8. Riskler / guard'lar
- **Para-kodu:** atomik RPC + `computeBalanceOps` paritesi + reconciliation invariant (Σtahsis≤ödeme, kalan≥0, balance değişmez) + idempotency.
- **Eski-kullanıcı:** vade nullable + opt-in + vadesiz=bugünkü davranış + **backfill YOK**.
- **Terminoloji:** YENİ i18n key'leri (scheduled "vade" çakışması).
- **Viewer/inversiyon** tutarlılığı: tahsis **ham DB + owner-canonical tip** üzerinden (inversiyon YALNIZ gösterim). Aynı defter iki kullanıcıda AYNI görünmeli.
- **Boğmama:** net **2 yeni sayfa** (taksit), gerisi mevcut ekranlarda, çevresel ertelendi.
