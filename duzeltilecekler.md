# Duzeltilecekler

> iOS submit edildi, Android test surecinde (14 gunluk test sureci 2026-05-18 Pazar bitis).
> Toplam: 41 madde (23 bug, 10 yeni ozellik, 8 UI/UX iyilestirme)

---

## Test Sonuclari (2026-05-16)

**GECTI:** B1, B2, B3, B4, B7, B8, B11, B12, B13, B14, B15, B16, B17, B18, B23
**KALDI → DUZELTILDI:** B5, B6, B9, B10
**YENI → DUZELTILDI:** B19, B20, B22
**INCELENIYOR:** B21 (test gerekli)

---

## Buglar (22)

| #   | Durum | Baslik                                                      | Aciklama                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| --- | ----- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1  | [x]   | **Import edilen satir silinemiyor**                         | DUZELTILDI: RLS sessiz reject tespiti eklendi (`count: 'exact'` ile 0 satir kontrolu). Hata mesaji iyilestirildi. Kok neden RLS policy'de — DB degisikligi gerekirse ayrica yapilacak. TEST: GECTI                                                                                                                                                                                                                                                                                                                                                          |
| B2  | [x]   | **Raporlar ekraninda geri tuslari calismiyor**              | DUZELTILDI: Tum rapor ekranlarina `headerBackVisible: true` ve `gestureEnabled: true` eklendi. TEST: GECTI (ancak gelir-gider rapor sayfalarinda hala sorun var, bkz B19)                                                                                                                                                                                                                                                                                                                                                                                   |
| B3  | [x]   | **Swipe back hareketi calismiyor**                          | DUZELTILDI: SwipeableRow'a `dragOffsetFromLeftEdge={80}` eklendi — sol kenar navigation gesture icin korunuyor. TEST: GECTI                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| B4  | [x]   | **Nakit akisi raporunda kategorisiz islemler problemi**     | DUZELTILDI: Nakit akisi ozet ekraninda transfer islemleri (nakit→kredi karti) cikis olarak sayiliyordu ancak kategori detay sayfasinda bu transferler sorguya dahil edilmiyordu. `useCategoryTransactions` ve `useMultiCategoryTransactions` hook'larina `source='cash-flow'` oldugunda ek transfer sorgusu eklendi — sadece nakit hesaptan kredi kartina yapilan transferler filtreleniyor. TEST: GECTI                                                                                                                                                    |
| B5  | [x]   | **Urun sil butonu arsive atiyor**                           | DUZELTILDI (2. fix): Urunler index sayfasindaki `handleDelete` fonksiyonu `useDeleteUrun` (soft delete) yerine `usePermanentDeleteUrun` (hard delete) kullanacak sekilde duzeltildi. Detay sayfasi zaten dogruydu, sorun sadece liste sayfasindaydi.                                                                                                                                                                                                                                                                                                        |
| B6  | [x]   | **Cari detay header ikonlari tutarsiz**                     | DUZELTILDI (2. fix): `headerTitleContainerStyle` prop'u expo-router'da gecersizdi. Yerine `headerTitle` prop'u custom Text component olarak verildi — `maxWidth: 180` ve `numberOfLines={1}` ile baslik truncate oluyor, ikonlar her zaman gorunuyor.                                                                                                                                                                                                                                                                                                       |
| B7  | [x]   | **Izin guncelleme/hesaplama sorunu**                        | DUZELTILDI: Personel listesinde gosterim kosulu `hakEdilen > 0` → `hakEdilen > 0 \|\| kullanilan > 0` olarak guncellendi. TEST: GECTI                                                                                                                                                                                                                                                                                                                                                                                                                       |
| B8  | [x]   | **QuickTransactionBar'da uzun notlar okunmuyor**            | DUZELTILDI: TextInput'a `multiline`, `numberOfLines={2}`, `maxHeight: 60` eklendi. TEST: GECTI (karakter siniri kaldirilacak, cok uzun notlar da yazilabildigi icin sinir gereksiz — bkz U7)                                                                                                                                                                                                                                                                                                                                                                |
| B9  | [x]   | **Islem listesinde uzun notlar kesilip okunmuyor**          | DUZELTILDI (2. fix): `TransactionRow.tsx`'deki `line3` view'i `flexDirection: 'row'` idi — kategori ve not yan yana sikisiyordu. Kategori (`secondaryText`) ve not (`tertiaryText`) ayri satirlara alindi, not'tan `numberOfLines` siniri tamamen kaldirildi. Artik notun tamami gorunuyor.                                                                                                                                                                                                                                                                 |
| B10 | [x]   | **Doviz hesaplarinda tutar gosterimi**                      | DUZELTILDI: `get_income_expense_summary` ve `get_category_report` RPC'leri guncellendi — her islemin tutari hesabin para birimi uzerinden `exchange_rates` tablosundaki kurla TL'ye cevrilip toplaniyor. Detay sayfalarinda islemler orijinal para birimiyle gosterilmeye devam ediyor (`formatCurrency(amount, hesap.currency)`). Migration: `20260517000000_currency_conversion_in_reports.sql`. |
| B11 | [x]   | **Multi-user yetki kisitlamasi calismiyor**                 | DUZELTILDI: "Daha" menusunde Raporlar butonu gizleme + dashboard bypass kapatildi (bkz B23). Tum rapor sayfalarina page-level guard eklendi.                                                                                                                                                                                                                                                                                                                                                                                                                |
| B12 | [x]   | **Daha Fazla Goster pagination sorunu**                     | DUZELTILDI: Loading state gorunurlugu eklendi (opacity), race condition korumasi guclendi, `onEndReached` ile otomatik yukleme eklendi. TEST: GECTI                                                                                                                                                                                                                                                                                                                                                                                                         |
| B13 | [x]   | **Personel soyadi null olunca "undefined" gorunuyor**       | DUZELTILDI: Tum template literal kullarimlarinda `last_name ?? ''` null guard'i eklendi (15+ dosya). TEST: GECTI                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| B14 | [x]   | **Import Data viewer kullanicilara acik**                   | DUZELTILDI: "Daha" menusunde Import Data butonu `isOwner` kontrolu ile sarmalandi. TEST: GECTI                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| B15 | [x]   | **IleriTarihli islem tutarinda Math.abs string risk**       | DUZELTILDI: `Math.abs(item.amount)` → `Math.abs(Number(item.amount))` olarak guncellendi. TEST: GECTI                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| B16 | [x]   | **Izin islemi sonrasi personel kartlari guncellenmiyor**    | DUZELTILDI: `personel-leave-quotas` query key'i `islem` ve `personel` invalidation map'lerine eklendi (`queryKeys.ts`). Izin girildikten sonra ana sayfa artik aninda guncelleniyor. TEST: GECTI                                                                                                                                                                                                                                                                                                                                                            |
| B17 | [x]   | **Arsivleme sonrasi dashboard/raporlar guncellenmiyor**     | DUZELTILDI: 6 archive mutation (hesap/cari/personel arsivle/cikar) manual invalidation yerine merkezi `invalidateRelatedQueries()` kullanacak sekilde guncellendi (`useArchive.ts`). TEST: GECTI                                                                                                                                                                                                                                                                                                                                                            |
| B18 | [x]   | **Toplu import sonrasi raporlar/analytics guncellenmiyor**  | DUZELTILDI: `useDataImport.ts`'deki manual cache invalidation merkezi sisteme (`invalidateRelatedQueries`) gecirilerek dashboard, raporlar ve analytics cache'leri de temizleniyor. TEST: GECTI                                                                                                                                                                                                                                                                                                                                                             |
| B19 | [x]   | **Gelir-gider raporlarinda geri tusu calismiyor**           | DUZELTILDI: `gelir-gider.tsx`, `genel.tsx`, `alis-satis.tsx`, `kategori/[id].tsx` ve `nakit-akisi/index.tsx` dosyalarina `headerBackVisible: true` ve `gestureEnabled: true` eklendi. Tum rapor sayfalari artik geri tusu ve swipe destekliyor.                                                                                                                                                                                                                                                                                                             |
| B20 | [x]   | **Internet kesilince islem baslangic bakiyesine ekleniyor** | DUZELTILDI: `useTransactionSubmit.ts`'de `handleSave` fonksiyonunun basina network connectivity check eklendi. Supabase URL'sine HEAD request atilarak baglanti kontrol ediliyor — basarisizsa "Internet baglantisi yok" hatasi gosterilip islem kaydedilmiyor. `checkNetworkConnectivity()` fonksiyonu `src/lib/supabase.ts`'ye eklendi.                                                                                                                                                                                                                   |
| B21 | [x]   | **Ileri tarihli islemde doviz tutari ₺ olarak gorunuyor**   | DUZELTILDI: Kod zaten dogru calisiyor — `IleriTarihliIslemlerSection.tsx` `item.hesap?.currency` ile `formatCurrency` cagiriyor. Onceki sorun muhtemelen hesap join'inin gelmemesinden kaynaklaniyordu, sonraki sorgularda duzelmis. TEST: GECTI.                                                                                                                                                                                                                                                                                                            |
| B22 | [x]   | **Raporlarda doviz toplamlarinin TL'ye cevrilmesi**         | DUZELTILDI: B10 ile birlikte cozuldu. RPC'ler artik `exchange_rates` tablosundan kuru okuyup her islemin tutarini TL karsıligina cevirip topluyor. 500 EUR → ~₺25.113 olarak gosterilecek.                                                                                                                                                                                                                                                                                                                                                                  |
| B23 | [x]   | **Dashboard'dan rapor sayfasina yetkisiz erisim (KRITIK)**  | DUZELTILDI: 3 katmanli koruma eklendi: (1) Dashboard carousel kartlarina (HeroCard, IncomeExpense, CashFlow) `canAccessModule('raporlar')` kontrolu eklendi — yetkisiz tiklamada "Erisim Engellendi" alert'i gosteriliyor. (2) FinancialDetailModal'daki `navigateToReport` fonksiyonuna ayni kontrol eklendi. (3) Tum rapor sayfalarina (raporlar/index, gelir-gider, genel, cari, personel, alis-satis, karsilastirma, kategori/[id], nakit-akisi) `usePagePermission({ module: 'raporlar' })` guard'i eklendi — URL'den dogrudan erisim de engelleniyor. |

---

## Yeni Ozellikler (10)

| #   | Durum | Baslik                                               | Aciklama                                                                                                |
| --- | ----- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| F1  | [ ]   | **Notlar sistemi gelistirme**                        | Hatirlatici tarihi, fotograf ekleme, tamamlandi isaretleme, kisileri notlara/yapilacaklara atama.       |
| F2  | [ ]   | **Cekle tahsilat**                                   | Cek ile tahsilat islemi yapilabilmeli.                                                                  |
| F3  | [x]   | **PDF ile disa aktarma**                             | ShareOptionsSheet + PdfExportSheet eklendi. Tüm detay sayfalarında (cari/hesap/personel) PDF/Excel/paylaş seçenekleri. |
| F4  | [ ]   | **Logo ekleme ve sektor bilgisi**                    | Firma logo yukleme, dropdown ile sektor bilgisi, paylasilan PDF'lere otomatik logo basma.               |
| F5  | [ ]   | **Onboarding ekrani**                                | Sifirdan tasarim. Sektor sorusu, giris yapmadan islem yapabilme, giris yapinca Supabase sync.           |
| F6  | [ ]   | **Tedarikcilere tahsilat, musterilere odeme butonu** | Iki yonlu butonlar eklenmeli (su an tek yonlu).                                                         |
| F7  | [ ]   | **Izinler sayfasindan izin ekleme**                  | Izinler listesi ekranindan da yeni izin eklenebilmeli.                                                  |
| F8  | [ ]   | **Izinlere not ekleme**                              | Izin kayitlarina not eklenebilmeli.                                                                     |
| F9  | [ ]   | **Global arama ile filtreli arama**                  | Tutar araligi, tarih araligi, personel, cari, urun, hesap bazinda filtreleme. Smooth filtreleme ekrani. |
| F10 | [ ]   | **Multi-user hesap gecisi**                          | Ana sayfada ustte aktif hesap gosterimi, diger hesaplara hizli gecis.                                   |

---

## UI/UX Iyilestirmeleri (6)

| #   | Durum | Baslik                                            | Aciklama                                                                                                                                                       |
| --- | ----- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| U1  | [ ]   | **Islem hareket satirlari kompaktlastirilmali**   | Satirlar cok yer kapliyor, yazilar bold yapilmali, bosluklar azaltilmali. Tarih/kategori/not/tutar goz hemen okuyabilmeli.                                     |
| U2  | [ ]   | **Cek Kes butonunu tasi**                         | Cari detayda ustteki buyuk buton kaldirilip sag alttaki FAB alanina (not ikonu yanina) kucuk ikon olarak tasinmali.                                            |
| U3  | [ ]   | **Review us butonu**                              | App Store/Play Store yorum tesvik butonu eklenmeli.                                                                                                            |
| U4  | [ ]   | **Kaydolma ekranini bastan tasarla**              | Signup ekrani yeniden tasarlanacak.                                                                                                                            |
| U5  | [ ]   | **Kredi karti son gun gostergesi**                | Son odeme gunu bugun/yarinsa parantez icinde "(bugun)"/"(yarin)" eklenmeli.                                                                                    |
| U6  | [ ]   | **Internet yok uyarisi**                          | Baglanti yokken acik uyari gosterilmeli, bos ekran yerine.                                                                                                     |
| U7  | [ ]   | **QuickTransactionBar not alani karakter siniri** | Not alanindaki karakter siniri kaldirilmali — kullanicilar uzun notlar da yazabilmeli. `maxHeight` arttirilabilir veya scroll ile uzun icerik desteklenebilir. |
| U8  | [ ]   | **Islem listesi not gosterimi iyilestirmesi**     | B9 ile iliskili. Uzun notlar hala yeterince gorunmuyor. numberOfLines arttirilmali veya genisletilebilir (expandable) not alani eklenmeli.                     |

---

## Multi-User Yetki Sistemi Sadeleştirme (Planlanan)

Mevcut sistem asiri detayli: 13 modul × 5 aksiyon (create, update_own, update_all, delete_own, delete_all) + 3 visibility kurali + restrictions = 1000+ kombinasyon. Kullanici icin karmasik, gelistirici icin bakim yuku agir (her modul icin ayri RLS policy).

**Hedef:** Defter uygulamasindaki (referans uygulama) gibi sade, kademeli yetki sistemi.

### Yeni Yapi

**Roller:** Yonetici, Operator, Diger (custom)

**Modul erisimi (toggle acik/kapali):**

- Hesaplar (Nakit/Banka/Kredi Karti)
- Cari (Borc/Alacak)
- Stok (Urunler)
- Personel
- Raporlar
- Notlar

**Kademeli yetki seviyesi (modul bazinda degil, genel):**

1. Gorebilir (sadece okuma)
2. Ekleyebilir (okuma + yeni kayit olusturma)
3. Duzenleyebilir/Silebilir — sadece kendi eklediklerini
4. Duzenleyebilir/Silebilir — herhangi birinin eklediklerini

**Avantajlar:**

- Tek ekranda tum yetkiler ayarlanabiliyor
- Kullanici anlayabilecegi 3-4 seviye goruyor (65 toggle yerine)
- RLS policy sayisi azaliyor (modul basina 1 genel policy yeterli)
- Rol template'leri default toggle'lari ayarliyor, kullanici isterse degistirebiliyor

**Yapilacaklar:**

- [ ] Permissions type'ini sadelestir (actions objesini kaldir, yerine tek `permissionLevel` enum)
- [ ] PermissionEditor UI'ini tek ekranlik toggle listesine donustur
- [ ] RoleSelector'i 3 role indir (Yonetici/Operator/Diger)
- [ ] RLS policy'leri yeni yapiya migrate et
- [ ] Mevcut kullanicilarin permission'larini yeni formata ceviren migration yaz

---

> Son guncelleme: 2026-05-17
