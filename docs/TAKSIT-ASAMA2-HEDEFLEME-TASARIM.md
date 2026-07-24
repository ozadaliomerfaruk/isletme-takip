# Taksit Aşama 2 — Hedefleme Tasarımı (kod öncesi, 3'lü review)

> Aşama 1 (tek motor, net-bakiye + vade sırası) PROD'da. Bu doküman Aşama 2'yi
> (fatura-hedefli ödeme) **kod yazmadan** tasarlar. Fable disiplini: tasarım → salt-okunur
> doğrulama → kod → koordineli apply. Onay bekliyor.

## 1) İlke: NİYETİ sakla, TUTARI asla

- `islemler.hedef_islem_id` (nullable, kolon PROD'da/atıl). Bir ödeme/tahsilat işlemi,
  yalnız **fatura satırından "öde/tahsil et"** jestinden doğduysa bu pointer'ı alır
  (= hedeflenen faturanın `islem_id`'si). Genel ödeme (satıra basmadan) → pointer NULL → bugünkü FIFO.
- **Hiçbir tutar saklanmaz.** Tutar her zaman `cariler.balance`'tan türer. Pointer yalnız
  okuma-anı mahsup SIRASINI etkiler → aritmetiğe dokunmaz → sapma imkansız.

## 2) İki-aşama okuma-anı mahsup (`_vade_birim_mahsuplu` içinde)

Yön başına (borç/alacak ayrı), birim = plansız fatura (1 birim) veya taksit (N birim):

```
1. targeted(I)   = Σ (o faturaya hedefli ödemelerin cari-para tutarı)     -- pay_target CTE
2. absorbed(I)   = LEAST(fatura_toplam(I), targeted(I))                    -- taşan → havuza
3. tr(u)         = absorbed(I)'yi fatura İÇİNDE vade ASC doldur            -- erken taksit önce kapanır
                   = GREATEST(0, LEAST(birim(u), absorbed − Σbirim_önce_asc))
4. cap(u)        = birim(u) − tr(u)                                        -- hedefli-sonrası kapasite
5. real_kalan(u) = GREATEST(0, LEAST(cap(u),                              -- kalan net'i cap'ler üzerinden FIFO
                     net_dir − (Σcap_önce_DESC)))                          -- COALESCE(vade,tx_date) DESC
```

**Σ ispatı (sapma yok):** `Σcap = G − Σabsorbed`; `net_dir = G − P ≤ G − Σabsorbed = Σcap`
(çünkü `absorbed ≤ P`). FIFO tam `net_dir` kadarını korur → `Σ real_kalan = net_dir = |bakiye|`.
**Her hedefleme senaryosunda toplam = bakiye, inşa gereği.**

## 3) Köşe taşları (hepsi saklı-tutarsız → Σ korunur)

| # | Durum | Ne olur | Σ |
|---|---|---|---|
| a | Aynı faturaya çoklu hedefli ödeme | `targeted(I)=Σ` toplanır; `absorbed=LEAST(fatura,Σ)` | ✓ |
| b | Kısmi hedefli (< fatura) | `absorbed<fatura`; `tr` erken-vadeliden; kalan cap FIFO havuzunda yarışır | ✓ |
| c | Hedefledin, sonra faturayı DÜŞÜRDÜN | `fatura_toplam` küçülür → `absorbed=LEAST(yeni,targeted)`; taşan otomatik havuza | ✓ |
| d | Hedef fatura SİLİNDİ | FK `ON DELETE SET NULL` → pointer NULL → ödeme havuza (FIFO) | ✓ |
| e | Çapraz-kur hedefli ödeme | `targeted(I)` = **çevrilmiş** (cari-para) tutar — bakiyeyle aynı `converted()`; pointer aritmetiğe dokunmaz | ✓ |

Hiçbirinde saklı sayı yok → hepsinde `Σ real_kalan = |bakiye|` bozulmaz.

## 4) Yayılım
`get_cari_islem_kalan` (=Σbirim) ve `get_taksit_plan_listesi`, `get_cari_taksit_kalan`
zaten `_vade_birim_mahsuplu`'dan türüyor → **motor değişince hepsi otomatik hedef-farkındalı.** Tek yer.

## 5) Jest (client)
- Cari detay satır-swipe "Tahsil Et/Öde" + taksit/fatura detay "öde" → oluşan ödeme işlemine
  `hedef_islem_id = o faturanın islem_id`'si set edilir (create_islem_atomik'e parametre veya
  create sonrası UPDATE). Genel QTB ödemesi pointer'sız (bugünkü davranış).
- `useRetahsisOdeme` + `retahsis_odeme` RPC **emekli** (artık okunmayan deftere yazıyordu).
- (Kullanıcının UX fikri: cari detayda Sekme 2 "Taksitler" → faturaya gir → öde. Jest aynı pointer'ı set eder.)

## 6) Doğrulama kapısı (apply'dan ÖNCE, salt-okunur PROD)
1. **Σ testi:** yeni iki-aşama mantığı her caride `Σ real_kalan = |bakiye|` (0 sapma) — hedefli + hedefsiz karışık.
2. **Kabul senaryosu (Aaaaa):** 300 ödemeye `hedef_islem_id = 600'lük taksit faturası` simüle et →
   beklenen: **taksit#1 (erken vade) = 0 (ödendi), taksit#2 = 300 (Kalan)** ; yani "1/2 · Kalan 300",
   öndeki vadesiz 500'e rağmen. Salt-okunur simülasyonla göster.
3. Temiz gelince → semantik/doğruluk onayı → **migration + client (jest) BİRLİKTE** apply.
