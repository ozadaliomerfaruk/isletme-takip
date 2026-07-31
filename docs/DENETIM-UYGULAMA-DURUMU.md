# Denetim uygulama durumu — DEVAM NOKTASI

> Bu dosya, front-end/liquid-glass denetiminin **uygulama** aşamasının nerede kaldığını
> tutar. Oturum değiştiğinde buradan devam edilir. İş bitince silinebilir.

Son güncelleme: 25 Temmuz 2026, ~06:20 · Dal: `feat/liquid-glass`

---

## Neyin peşindeyiz

`docs/FRONTEND-GLASS-TUTARLILIK-DENETIMI.md` = denetim raporu (95 onaylı bulgu, 24 tema).
Kullanıcının talebi: **hepsini tek tek düzelt, hiçbir şeyi bozma, iki kez kontrol et, sonunda commit'le.**
Sabah kullanıcı telefondan **sayfa sayfa** kontrol edecek → sonunda ekran ekran bir kontrol
listesi yazılacak.

## Ham veri (oturumdan bağımsız, repoda)

| Dosya | İçerik |
|---|---|
| `docs/denetim/bulgular.json` | 95 bulgunun tamamı (`id`, `file`, `line`, `severity`, `detail`, `evidence`, `fix`) |
| `docs/denetim/c01.json` … `c10.json` | Küme başına `ownedFiles` + o kümeye düşen bulgular |
| `docs/denetim/kume-haritasi.json` | Özet: hangi küme hangi dosyalara ve hangi bulgu id'lerine sahip |

`id` alanı `bulgular.json` içindeki sıradır; küme dosyalarındaki `id`'ler onunla eşleşir.

## Küme mantığı (neden böyle bölündü)

Kümeler **dosya bazında ayrık** — iki ajanın aynı dosyaya dokunmaması için. Bir düzeltme
küme dışı bir dosya gerektiriyorsa ajan onu SKIPPED bırakır, sonradan elle toplanır.

| Küme | Alan |
|---|---|
| c01 | alt boşluk / yüksek öncelik (taksit, mutabakat, ayarlar, import) |
| c02 | notlar, arşiv, işlemler, daha |
| c03 | vade header, tabBarScroll, tabs layout |
| c04 | raporlar + nakit akışı + widgets |
| c05 | personel formları ve detay |
| c06 | ürünler |
| c07 | cari/hesap detay, kategoriler, detail bileşenleri |
| c08 | ayarlar, kurulum, onboarding |
| c09 | paylaşılan UI bileşenleri |
| c10 | PhotoViewer + foto-import |

## Paralel session meselesi (KAPANDI)

Denetim koşarken **başka bir Claude session'ı** aynı repoda TabHeader cam nav bar pilotunu
yazıyordu. Çakışmayı önlemek için şu 8 dosya kümelerden çıkarıldı ve oradaki **9 bulgu
ertelendi**:

```
src/app/(tabs)/cariler.tsx   src/app/(tabs)/index.tsx   src/app/(tabs)/personel.tsx
src/app/_layout.tsx          src/app/urunler/index.tsx  src/components/ui/TabHeader.tsx
src/components/ui/index.ts   src/lib/tabBarVisibility.ts
```

O session durduruldu ve işi commit'lendi: `3e52090` (TabHeader cam nav bar), `f316210`
(kök rotada çökme), `b349c5a` (swipe-back geri alma), `1543743` (cariler/[id] native
header opak dolgu pilotu — commit'siz kalmıştı, ayrıca alındı).

⚠️ **Ertelenen 9 bulgu körlemesine uygulanmamalı.** TabHeader pilotu bu dosyaları
değiştirdi; satır numaraları kaydı ve bir kısmı artık geçersiz olabilir (ör. cariler.tsx'te
`contentContainerStyle` yeniden yazıldı). Önce yeni koda karşı doğrula.

Ertelenen bulgular (`bulgular.json` içinde `file` alanından bulunur):

1. `(tabs)/index.tsx` — FAB son hesap satırının üstüne biniyor (alt boşluk FAB'ı temizlemiyor)
2. `(tabs)/index.tsx` — header sağ grubunda NotificationBell cam yüzeysiz
3. `(tabs)/cariler.tsx` — GlassIconButton'larda `accessibilityLabel` yok
4. `(tabs)/cariler.tsx` — `listContainer`'daki `paddingBottom` ölü değer
5. `lib/tabBarVisibility.ts` — mutabakat + vade rotalarında tab bar vurgusu "Ana Sayfa"ya atlıyor
6. `urunler/index.tsx` — yükleniyor durumu tam ekran metin (diğer 3 sekmede Skeleton)
7. `urunler/index.tsx` — dönem ok butonlarında `hitSlop` yok
8. `urunler/index.tsx` — Miktar/Tutar geçişi liste ile detayda farklı
9. `components/ui/index.ts` — ölü `SearchInput` barrel'dan açık

---

## DURUM — TAMAMLANDI

- [x] Denetim tamamlandı, rapor commit'li (`c66ade8`)
- [x] Paralel session'ın işi commit'li, hiçbir şey kayıp değil
- [x] Bulgu verisi repoya alındı (`docs/denetim/`)
- [x] **10 kümenin düzeltmeleri** — 84 bulgu; her küme bağımsız bir ajan tarafından
      `git diff` okunarak doğrulandı, regresyon bulunanlar aynı turda onarıldı
- [x] Küme çıktılarının gruplu commit'i (10 commit)
- [x] Dosya kilidi yüzünden atlanan 2 iş (vade header kaydı + personel çift boşluk)
- [x] Ertelenen 9 bulgu (yeni koda karşı yeniden doğrulanarak)
- [x] `npx tsc --noEmit` → 0 hata
- [x] `npx eslint .` → 0 hata (115 uyarı, hepsinin eski olduğu diff'e karşı kanıtlandı)
- [x] `npx jest` → 312/312
- [x] `npx expo export --platform ios` → 4045 modül, temiz
- [x] Sayfa sayfa kontrol listesi → `docs/SABAH-KONTROL-LISTESI.md`

**95/95 bulgu uygulandı.** Kalan tek şey CİHAZDA GÖRSEL DOĞRULAMA — kontrol listesi
tam onun için yazıldı.

Bilinçli olarak yapılmayanlar kontrol listesinin sonunda listeli. Karar bekleyen tek
teknik borç: `Screen.footer` prop'u — sözleşme metni onu 2. yol olarak gösteriyor ama
primitif klavye açıkken hatalı davranıyor; bugün hiçbir ekran kullanmıyor.

## Bu turdan çıkan ders (bir sonraki toplu düzeltme için)

Paralel oturum riski gerçek: bir ajan `contentPaddingBottom` kullanımını yazdı ama
session limitine takılıp hook tanımını ekleyemeden öldü — derlenmez bir dosya bıraktı.
Doğrulama ajanı da aynı limitle ölmüştü, yani hata yakalanmadan geçebilirdi.
**Ders:** her toplu turdan sonra `tsc` ANA OTURUMDA koşturulur; ajanın "FIXED" demesi
kanıt değildir.
