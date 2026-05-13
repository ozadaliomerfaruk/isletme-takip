# Duzeltilecekler

> iOS submit edildi, Android test surecinde (14 gunluk test sureci 2026-05-18 Pazar bitis).
> Toplam: 34 madde (18 bug, 10 yeni ozellik, 6 UI/UX iyilestirme)

---

## Buglar (18)

| # | Durum | Baslik | Aciklama |
|---|-------|--------|----------|
| B1 | [x] | **Import edilen satir silinemiyor** | DUZELTILDI: RLS sessiz reject tespiti eklendi (`count: 'exact'` ile 0 satir kontrolu). Hata mesaji iyilestirildi. Kok neden RLS policy'de — DB degisikligi gerekirse ayrica yapilacak. |
| B2 | [x] | **Raporlar ekraninda geri tuslari calismiyor** | DUZELTILDI: Tum rapor ekranlarina `headerBackVisible: true` ve `gestureEnabled: true` eklendi. |
| B3 | [x] | **Swipe back hareketi calismiyor** | DUZELTILDI: SwipeableRow'a `dragOffsetFromLeftEdge={80}` eklendi — sol kenar navigation gesture icin korunuyor. |
| B4 | [x] | **Nakit akisi raporunda kategorisiz islemler problemi** | DUZELTILDI: Nakit akisi ozet ekraninda transfer islemleri (nakit→kredi karti) cikis olarak sayiliyordu ancak kategori detay sayfasinda bu transferler sorguya dahil edilmiyordu. `useCategoryTransactions` ve `useMultiCategoryTransactions` hook'larina `source='cash-flow'` oldugunda ek transfer sorgusu eklendi — sadece nakit hesaptan kredi kartina yapilan transferler filtreleniyor. |
| B5 | [x] | **Urun sil butonu arsive atiyor** | DUZELTILDI: `useDeleteUrun()` yerine `usePermanentDeleteUrun()` kullanildi. |
| B6 | [x] | **Cari detay header ikonlari tutarsiz** | DUZELTILDI: Header title'a `maxWidth: '50%'` eklendi — uzun isimler artik ikonlari ekran disina itmiyor. Ikonlar isViewer durumuna gore dogru calisiyor (owner: 4 ikon, viewer: 2 ikon). |
| B7 | [x] | **Izin guncelleme/hesaplama sorunu** | DUZELTILDI: Personel listesinde gosterim kosulu `hakEdilen > 0` → `hakEdilen > 0 \|\| kullanilan > 0` olarak guncellendi. |
| B8 | [x] | **QuickTransactionBar'da uzun notlar okunmuyor** | DUZELTILDI: TextInput'a `multiline`, `numberOfLines={2}`, `maxHeight: 60` eklendi. |
| B9 | [x] | **Islem listesinde uzun notlar kesilip okunmuyor** | DUZELTILDI: TransactionRow ve kategori detayinda `numberOfLines={1}` → `numberOfLines={2}` olarak guncellendi. |
| B10 | [x] | **Doviz gelirleri TL olarak gorunuyor** | DUZELTILDI: `formatCurrency(amount)` → `formatCurrency(amount, item.hesap?.currency)` olarak guncellendi. |
| B11 | [x] | **Multi-user yetki kisitlamasi calismiyor** | DUZELTILDI: "Daha" menusunde Raporlar butonu `canAccessModule('raporlar')` kontrolu ile sarmalandi. |
| B12 | [x] | **Daha Fazla Goster pagination sorunu** | DUZELTILDI: Loading state gorunurlugu eklendi (opacity), race condition korumasi guclendi, `onEndReached` ile otomatik yukleme eklendi. |
| B13 | [x] | **Personel soyadi null olunca "undefined" gorunuyor** | DUZELTILDI: Tum template literal kullarimlarinda `last_name ?? ''` null guard'i eklendi (15+ dosya). |
| B14 | [x] | **Import Data viewer kullanicilara acik** | DUZELTILDI: "Daha" menusunde Import Data butonu `isOwner` kontrolu ile sarmalandi. |
| B15 | [x] | **IleriTarihli islem tutarinda Math.abs string risk** | DUZELTILDI: `Math.abs(item.amount)` → `Math.abs(Number(item.amount))` olarak guncellendi. |
| B16 | [x] | **Izin islemi sonrasi personel kartlari guncellenmiyor** | DUZELTILDI: `personel-leave-quotas` query key'i `islem` ve `personel` invalidation map'lerine eklendi (`queryKeys.ts`). Izin girildikten sonra ana sayfa artik aninda guncelleniyor. |
| B17 | [x] | **Arsivleme sonrasi dashboard/raporlar guncellenmiyor** | DUZELTILDI: 6 archive mutation (hesap/cari/personel arsivle/cikar) manual invalidation yerine merkezi `invalidateRelatedQueries()` kullanacak sekilde guncellendi (`useArchive.ts`). |
| B18 | [x] | **Toplu import sonrasi raporlar/analytics guncellenmiyor** | DUZELTILDI: `useDataImport.ts`'deki manual cache invalidation merkezi sisteme (`invalidateRelatedQueries`) gecirilerek dashboard, raporlar ve analytics cache'leri de temizleniyor. |

---

## Yeni Ozellikler (10)

| # | Durum | Baslik | Aciklama |
|---|-------|--------|----------|
| F1 | [ ] | **Notlar sistemi gelistirme** | Hatirlatici tarihi, fotograf ekleme, tamamlandi isaretleme, kisileri notlara/yapilacaklara atama. |
| F2 | [ ] | **Cekle tahsilat** | Cek ile tahsilat islemi yapilabilmeli. |
| F3 | [ ] | **PDF ile disa aktarma** | Mevcut paylasim seceneklerine PDF export eklenmeli. |
| F4 | [ ] | **Logo ekleme ve sektor bilgisi** | Firma logo yukleme, dropdown ile sektor bilgisi, paylasilan PDF'lere otomatik logo basma. |
| F5 | [ ] | **Onboarding ekrani** | Sifirdan tasarim. Sektor sorusu, giris yapmadan islem yapabilme, giris yapinca Supabase sync. |
| F6 | [ ] | **Tedarikcilere tahsilat, musterilere odeme butonu** | Iki yonlu butonlar eklenmeli (su an tek yonlu). |
| F7 | [ ] | **Izinler sayfasindan izin ekleme** | Izinler listesi ekranindan da yeni izin eklenebilmeli. |
| F8 | [ ] | **Izinlere not ekleme** | Izin kayitlarina not eklenebilmeli. |
| F9 | [ ] | **Global arama ile filtreli arama** | Tutar araligi, tarih araligi, personel, cari, urun, hesap bazinda filtreleme. Smooth filtreleme ekrani. |
| F10 | [ ] | **Multi-user hesap gecisi** | Ana sayfada ustte aktif hesap gosterimi, diger hesaplara hizli gecis. |

---

## UI/UX Iyilestirmeleri (6)

| # | Durum | Baslik | Aciklama |
|---|-------|--------|----------|
| U1 | [ ] | **Islem hareket satirlari kompaktlastirilmali** | Satirlar cok yer kapliyor, yazilar bold yapilmali, bosluklar azaltilmali. Tarih/kategori/not/tutar goz hemen okuyabilmeli. |
| U2 | [ ] | **Cek Kes butonunu tasi** | Cari detayda ustteki buyuk buton kaldirilip sag alttaki FAB alanina (not ikonu yanina) kucuk ikon olarak tasinmali. |
| U3 | [ ] | **Review us butonu** | App Store/Play Store yorum tesvik butonu eklenmeli. |
| U4 | [ ] | **Kaydolma ekranini bastan tasarla** | Signup ekrani yeniden tasarlanacak. |
| U5 | [ ] | **Kredi karti son gun gostergesi** | Son odeme gunu bugun/yarinsa parantez icinde "(bugun)"/"(yarin)" eklenmeli. |
| U6 | [ ] | **Internet yok uyarisi** | Baglanti yokken acik uyari gosterilmeli, bos ekran yerine. |

---

> Son guncelleme: 2026-05-14
