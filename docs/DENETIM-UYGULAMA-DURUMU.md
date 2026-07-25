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

## DURUM

- [x] Denetim tamamlandı, rapor commit'li (`c66ade8`)
- [x] Paralel session'ın işi commit'li, hiçbir şey kayıp değil
- [x] Bulgu verisi repoya alındı (`docs/denetim/`)
- [ ] **10 kümenin düzeltmeleri** — `apply-frontend-audit-fixes` workflow'u koşuyor
      (düzelt → bağımsız doğrula → gerekirse onar). 86 bulgu hedefte.
- [ ] Küme çıktılarının gruplu commit'i
- [ ] Ertelenen 9 bulgu (yeni koda karşı yeniden doğrulanarak)
- [ ] `npx tsc --noEmit`
- [ ] `npx eslint .`
- [ ] `npx jest`
- [ ] `npx expo export --platform ios` (gerçek Metro bundle derlemesi)
- [ ] Çıkan hataların düzeltilmesi
- [ ] Sayfa sayfa kontrol listesi (`docs/SABAH-KONTROL-LISTESI.md`)

## Yeni oturumda nereden devam edilir

1. `git log --oneline -15` ve `git status` ile nerede kalındığını gör.
2. Yukarıdaki DURUM listesinde ilk işaretsiz maddeden devam et.
3. Küme düzeltmeleri yarım kaldıysa: `docs/denetim/cNN.json` dosyasındaki bulguları
   tek tek koda karşı doğrula — hangisinin uygulandığı `git diff`/`git log -p` ile görülür.
4. **Commit disiplini:** iş bitmeden de commit at. `git add -A` yerine dokunduğun yolları
   açıkça stage'le; aynı repoda başka bir session çalışıyor olabilir.
