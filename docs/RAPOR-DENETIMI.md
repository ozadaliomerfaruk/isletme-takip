# Rapor Ekranları Denetimi — Bulgu Raporu

## Yönetici Özeti

Rapor bölümünün hesaplama çekirdeği (RPC'ler) büyük ölçüde doğru; sapmaların neredeyse tamamı **çıkış katmanında** (ekran satırı, Excel, PDF) ve **dönem seçim katmanında**. Üç kök neden 160 bulgunun çoğunu üretiyor: (1) merkezî yardımcıların atlanması — `getIslemCurrency`, `formatCurrencyWithSign`, `createConversionSum`, `fetchAllPages`, `upperTr` varken yerel kestirmeler yazılmış; (2) **aynı sayının iki farklı motordan üretilmesi** — üst özet sunucu RPC'sinden, drill-down ve Excel istemcideki ham `islemler` sorgusundan gelince üç yüzey birbirini tutmuyor; (3) hataların ve "kur bulunamadı" bayrağının sessizce yutulup `0` / "veri yok" olarak gösterilmesi. En acil iki şey: yabancı para kullanan işletmede **satır ve Excel'in yanlış para birimi sembolüyle basılması**, ve drill-down sorgularının **1000 satırda sessizce kırpılması** (gerçek veri kaybı, projenin açık "binlerce işlem" hedefinde kesinleşiyor). Yüksek şiddetli 9 bulgunun 7'si yabancı para veya Excel yüzeyinde toplanıyor — tek bir çalışma paketiyle kapanabilir.

---

# YÜKSEK

**1. Hesap bacağı olmayan işlemlerde para birimi ANA para birimine düşüyor (ekran + Excel, 5 yüzey)**

NE · `cari_alis / cari_satis / personel_gider / personel_satis` (ve iadeleri) hesap_id TAŞIMAZ ve çapraz-kur yoksa `source_currency` de null'dur. Bu yüzeyler para birimini `islem.hesap?.currency` üzerinden çözüyor → `undefined` → `formatCurrency` ana para biriminin sembolünü basıyor. Merkezî `getIslemCurrency` (source_currency → hesap → cari → personel zinciri) kullanılmıyor; rapor sorguları cari/personel `currency` alanını select'e bile koymuyor.

NEREDE ·
- `src/app/raporlar/kategori/[id].tsx:313, 336` — aynı dosyanın toplamı (:227 `getIslemCurrency`) doğru, satır yanlış
- `src/components/reports/EntityTransactionList.tsx:140-173` + `src/hooks/useIslemler.ts:646-651` (cari join'inde `currency` yok)
- `src/hooks/useIslemler.ts:584-596` (`useAllIslemlerByPersonel` personel join'i yok) — tüketici `EntityTransactionList.tsx:173`
- `src/lib/reportExcelExport.ts:147-155, 302, 587`
- `src/lib/reportExcelExport.ts:570, 593` (alış-satış detayı; çağıran `src/app/raporlar/alis-satis.tsx:196-213`)

NEDEN ÖNEMLİ · USD carili 1.000'lik fatura satırda "₺1.000,00" görünüyor; 20 piksel yukarıdaki `EntitySummaryCard` aynı kalemi `$1.000,00`, kategori drill-down toplamı ise ~₺34.000 olarak sayıyor. Aynı sayı aynı ekranda iki farklı para birimi etiketiyle. `CariPreviewModal.tsx:54-57` yorumu bu hatayı zaten anlatıyor ve orada elle düzeltilmiş — rapor yüzeyi dışarıda kalmış.

ÖNERİ · Satır ve Excel para birimi çözümünü `getIslemCurrency(islem)`'e çevir; `useAllIslemlerByCari`/`useAllIslemlerByPersonel` select'lerine `cari:cariler(...,currency)` / `personel:personel(...,currency)` ekle.

---

**2. Excel toplamları yabancı parayı ÇEVİRMEDEN topluyor, ekran çeviriyor**

NE · Excel kategori ara toplamı ve genel toplam ham `islem.amount` değerlerini para birimine bakmadan topluyor ve sonucu tek sembolle yazıyor. Ekrandaki aynı rakam RPC'de TRY'ye, sonra `createRpcTotalConverter` ile ana para birimine çevriliyor.

NEREDE · `src/lib/reportExcelExport.ts:188-197, 239, 246, 278, 284, 313` (`grandTotal = sorted.reduce((sum, islem) => sum + toNumber(islem.amount), 0)`) · alış-satış detayında aynısı `:563, 593` · karşılık `src/hooks/useCategoryReport.ts:265`

NEDEN ÖNEMLİ · 1.000 USD + 1.000 TL alış Excel'de "₺2.000,00", ekranda ~₺41.000. Dosya muhasebeciye gidiyor ve hangisinin doğru olduğu anlaşılmıyor.

ÖNERİ · Excel toplamlarını `createConversionSum(baseCurrency, rates)` + `getIslemCurrency(islem)` ile hesapla (`kategori/[id].tsx:220-236`'daki `filteredSum` kalıbı), çevrilemeyen kalemi hariç tutup dosyaya uyarı satırı yaz.

---

**3. Excel/PDF ekranın motorunu kullanmıyor: iadeler düşülmüyor, kategori kırılımı farklı, detay ile özet çatışıyor**

NE · Export yalnız `INCOME_TYPES`/`EXPENSE_TYPES` çekiyor (iade tipleri yok) ve kategoriyi `islem.kategori_id`'den kuruyor. Ekranın kaynağı `get_category_report` ise (a) toplamı `totalAmount − returnTotal` ile netliyor, (b) ürünlü işlemleri ÜRÜNÜN eşlenmiş kategorisine oransal DAĞITIYOR, (c) alt kategorileri üste topluyor. Alış-satış Excel'inde ise aynı dosyada iki "Toplam" var: üst blok çevrilmiş/net, alt detay bloğu ham ve iadesiz; detay sorgusu ürün hareketi olmayan işlemleri ve pasif ürünleri de içeriyor.

NEREDE ·
- `src/hooks/useReportExcelExport.ts:78, 98-121` (iade tipi yok, kırılım seçimi yok sayılıyor)
- `src/lib/reportExcelExport.ts:182-196, 258-274` (`catName = islem.kategori?.name`)
- `src/lib/reportExcelExport.ts:499-529` (özet, çevrilmiş) ↔ `:570-599` (detay, ham)
- `src/app/raporlar/alis-satis.tsx:161-194` (detay sorgusunda ürün/pasif filtresi yok)
- Karşılık: `src/hooks/useCategoryReport.ts:346` ve migration `20260630000000` `get_category_report` Part 1

NEDEN ÖNEMLİ · İadesi olan her dönemde Excel'in "TOPLAM" hücresi ekrandan iade tutarı kadar YÜKSEK çıkıyor; kategori satırları ekrandaki kartlarla ne isim ne tutar olarak tutuyor. Tek dosyanın içinde bile iki toplam çelişiyor.

ÖNERİ · Export'u ekranın kullandığı RPC'lerden besle (`get_category_report` + iade sorgusu; hesap kırılımında `get_income_by_source`); kırılım seçimi export'a da geçsin.

---

**4. Drill-down sorguları sayfalanmıyor: 1000 satırda sessiz kırpma**

NE · İki drill-down yolu da ham `supabase.from(...).select(...)` kullanıyor; `fetchAllPages` yok, `urun_hareketler` tarafında tarih filtresi de yok. PostgREST varsayılan tavanı 1000 (`src/lib/supabaseHelpers.ts:4-8`).

NEREDE · `src/hooks/useCategoryReport.ts:934-939` (ve `750-757`, `791-796`, `922-927`) — aynı fonksiyonun `:897` satırındaki yorum "fetchAllPages ile 1000 satır limitini aş" diyor · `src/hooks/useAccountReport.ts:358-383` (ve ölü ikizi `172-197`) · doğru desen: `useCategoryReport.ts:906-916`

NEDEN ÖNEMLİ · (a) İşlemlerin bir kısmı listede HİÇ görünmüyor; (b) kırpılan kalemler `categoryAmountMap`'e girmediği için kalan satırların `_categoryAmount`'u eksik hesaplanıyor; (c) hesap/kaynak detayında toplam ekrandan değil inen satırlardan hesaplandığı için kullanıcının az önce tıkladığı karttan sessizce küçük çıkıyor. Yıllık dönem seçeneği mevcut olduğundan tetiklenmesi kolay.

ÖNERİ · Dört sorguyu `fetchAllPages` ile sar ve `urun_hareketler` tarafında `islem_id`'yi dönemdeki işlemlerle sınırla.

---

**5. Nakit akışı drill-down'ı kredi kartı giderlerini özete katıyor, tıklanan kart katmıyor**

NE · Nakit Akışı ekranında çıkış kategorisine basılınca açılan drill-down'un "Toplam Tutar" kartı `get_category_report(CASH_OUTFLOW_TYPES)` ile hesaplanıyor; bu RPC'de **hesap tipi filtresi yok**. Üst ekran ise kredi kartı hesabından yapılan giderleri `outflowByCategory`'ye hiç koymuyor, ayrı "Kredi Kartı Harcamaları" kovasına yazıyor.

NEREDE · `src/app/raporlar/kategori/[id].tsx:117-121` + `src/hooks/useCashFlowByCategory.ts:291-327` (`:293` kredi kartı dalı, `:311` nakit dalı) · migration `20260630000000` `get_category_report` Part 2 (yalnız `h.is_active = true`)

NEDEN ÖNEMLİ · Kredi kartı kullanan her işletmede kullanıcı "₺40.000" yazan karta basıp içeride "₺65.000" görüyor. Drill-down kendi içinde tutarlı (listesi de KK giderlerini içeriyor), sapan taraf üst ekranla ilişki — bu kod tabanında daha önce yaşanmış tutarsızlık sınıfının en büyük örneği.

ÖNERİ · `source='cash-flow'` drill-down'unda özet kartı da `useCashFlowByCategory` kaleminden beslensin ya da RPC'ye `p_hesap_types` parametresi eklensin.

---

# ORTA

**6. formatCurrency mutlak değer basıyor: negatif tutarlar POZİTİF görünüyor (7 yüzey)**

NE · `formatCurrency` ilk satırında `const abs = Math.abs(amount)` yapıyor (`src/lib/currency.ts:260`); işaretli varyantlar (`formatCurrencyWithSign`, `signedCurrencyText`) mevcut ama bu yüzeylerde kullanılmıyor. Etkilenen değerler gerçekten negatif olabiliyor: iade satışı aşınca kategori/kaynak/dönem toplamı, net nakit akışı, kapanış bakiyesi, kredi kartı fazla ödemesi.

NEREDE ·
- `src/app/raporlar/gelir-gider.tsx:217, 245` · `src/components/ui/CategoryReportCard.tsx:376` · `src/components/ui/IncomeSourceCard.tsx:56` (kaynak: `useCategoryReport.ts:239, 340`)
- `src/app/raporlar/hesap/[id].tsx:97-104, 202-205` (renk de değere değil rapor tipine bağlı)
- `src/components/reports/tabs/KarsilastirmaTabContent.tsx:104, 112` — aynı dosyada `:16` `formatNet` var, yalnız net sütununa uygulanmış; PDF ise `useComparisonReport.ts:218-219` ile işaretli basıyor → ekran ile PDF ayrışıyor
- `src/lib/reportExcelExport.ts:694` (netCashFlow) — aynı dosyada `:20-22` `signedCurrencyText` helper'ı var ve `:836`'da kullanılıyor
- `src/app/raporlar/net-varlik-trend.tsx:35-37, 288` (Y ekseni; `currency.ts:429` fallback dalı işareti düşürüyor)
- `src/lib/pdfExport.ts:246, 290` (antet/altbilgi bakiyesi; tablo kolonları doğru)
- `src/components/reports/tabs/GenelTabContent.tsx:238, 249, 252` (kredi kartında sabit `error` rengi)

NEDEN ÖNEMLİ · −5.000 TL'lik net iade ekranda yeşil "₺5.000,00 gelir" olarak okunuyor; aynı satırda net sütunu −5.000 yazdığı için tablo kendi kendisiyle çelişiyor. Net varlığı −9.999 ile 0 arasında olan işletmede grafiğin TÜM Y ekseni eksisiz çıkıyor.

ÖNERİ · Bu yedi yüzeyde tutar<0 iken `formatCurrencyWithSign` / `signedCurrencyText` kullan ve renk semantiğini değere bağla.

---

**7. "Özel" aralık detaylara ve trende taşınmıyor; trend sessizce son 6 döneme düşüyor**

NE · `widgetPeriod = period === 'custom' ? 'monthly' : period` zorlaması navigasyona da yansıyor: hedef sayfalara `period:'monthly'` gidiyor, `useReportRouteState` ise `startDate/endDate`'i YALNIZ `period==='custom'` iken devreye alıyor. Aynı zorlama trendi de bozuyor: trend, offset'i `-50..50` aralığında string eşleyerek geri buluyor; custom başlangıç ayın 1'i değilse eşleşme olmuyor ve `currentOffset` 0'da kalıyor.

NEREDE · `src/app/raporlar/index.tsx:64-87` + `src/hooks/useReportPeriod.ts:171` + `src/hooks/useReportRouteState.ts:25-63` · `src/hooks/useAnalyticsTrend.ts:110-138` (`:113-121` eşleme döngüsü, `:129-138` dönem türetme) · doğru karşı örnek: `src/app/raporlar/kategori/[id].tsx:87-93` (donut drill-down'ı doğru çalışıyor)

NEDEN ÖNEMLİ · 1–15 Ocak seçip "Cari Rapor" kartına dokunan kullanıcı Temmuz 2026 dönemine düşüyor (detay sayfası kendi etiketini doğru bassa da bağlam kayboluyor; `karsilastirma`'da ÖZEL sekmesi hiç yok). Grafiklerde ise üst çubuk "Özel: 03.02–19.02" derken grafik son 6 ayı çiziyor; günlük dönemde 50 günden eskiye gidilince de aynı sessiz düşüş oluyor.

ÖNERİ · Navigasyonda özel dönemde `period:'custom'` gönder (widgetPeriod yalnız widget'lara verilsin); trende dönem+offset'i doğrudan geçir, eşleşme yoksa aralıktan 6 kova türet veya "özel aralıkta trend gösterilemiyor" bilgisi ver.

---

**8. Drill-down istemci motoru, RPC'nin kurallarını uygulamıyor (5 ayrı kural)**

NE · Aynı sayının sunucu tarafındaki tanımı ile istemci drill-down'ındaki tanımı ayrışıyor:
- Pasif ürün: RPC `AND u.is_active IS NOT FALSE` uyguluyor, istemci join'inde filtre yok.
- Kategori payı: RPC `(hareket_tutar / toplam_hareket_tutar) * i.amount` ile pro-rata dağıtıyor, istemci ham kalem toplamı (`miktar*birim_fiyat*(1+kdv)`) kullanıyor.
- Kategorisiz dalda ürün payı hiç hesaplanmıyor → faturanın TAMAMI kategorisize yazılıyor.
- Kategorisiz drill-down'da pasif hesap/cari/personel filtresi (`rowHasPassiveEntity`) uygulanmıyor.
- Nakit akışında kredi kartı ödeme transferleri listeye giriyor, özet karta girmiyor (`CASH_OUTFLOW_TYPES`'ta `transfer` yok).

NEREDE · `src/hooks/useCategoryReport.ts:934-939, 945-949` (pasif ürün + pro-rata) · `:758-768, 790-803` (kategorisiz ürün payı) · `:840-857` vs `:1011-1013` (pasif entity filtresi; `:96-99` yorumu bunu zaten bug diye anlatıyor) · `:967-994` (liste) vs `:1057` (özet) + `src/constants/islemTypes.ts:54`

NEDEN ÖNEMLİ · Beşinin de sonucu aynı: tıklanan kart ile içerideki liste/toplam tutmuyor. İskonto veya elle düzeltilmiş fatura tutarında pro-rata farkı doğrudan para hatası; pasif ürün sızıntısı bu kod tabanında daha önce yaşanmış hatanın ürün tarafındaki hâli.

ÖNERİ · İstemci sorgularına RPC ile aynı filtreleri koy (`is_active`, `rowHasPassiveEntity`), kategori payını `(eşleşen_kalem/tüm_kalem)*islem.amount` ile ölçekle, kategorisiz dalda da payı hesapla, özet ile listeyi tek kaynaktan besle.

---

**9. Geçmiş dönem BUGÜNKÜ kurla çevriliyor; kur bulunamazsa sunucu 1:1 sayıyor ve kimse bilmiyor**

NE · `get_income_expense_summary`, `get_networth_pl_trend` ve `get_networth_opening_by_month` tek satırlık `exchange_rates`'ten GÜNCEL kuru okuyor; kur yoksa `COALESCE(..., 1)` ile yabancı para tutarı 1:1 TRY sayılıyor. İstemcinin `conversionIncomplete`'i yalnız TRY→ana para birimi adımını kapsadığı için bu kayıp hiç görünmüyor. Hesap/kaynak detayında da "≈" satırı bir tahmin olduğunu söylemiyor; net varlık dipnotu ise "her ay o ayki kur" izlenimi bırakıyor.

NEREDE · `src/hooks/useAnalyticsSummary.ts:87-98, 104-118` + migration `20260630000000_exclude_passive_entities_from_reports.sql:59-66` · `src/hooks/useNetWorthTrend.ts:21, 129-146` + migration `20260710140000_networth_v3_pltrend_bug2_and_t3.sql:179-184` · `src/app/raporlar/hesap/[id].tsx:106-109, 206-210` (kardeş ekranda not var: `raporlar/kategori/[id].tsx:495-501`)

NEDEN ÖNEMLİ · Kur satırı eksikse 1.000 USD'lik satış 1.000 TL olarak toplanıyor — ne RPC ne istemci bunu bildiriyor. Ayrıca geçmiş ve bugün aynı kurla çevrildiği için delta/%değişim kurdan kaynaklı sahte hareket gösteriyor; USD/EUR/altın merceğinde hiç hareket etmemiş bir kasa geçmişte şişmiş görünüyor.

ÖNERİ · RPC'de 1:1 fallback yerine çevrilemeyen kalemi ayrı say ve döndür (istemci uyarı göstersin); `summary.currentRateNote` notunu hesap detayına ekle; `footnoteFx`'i "gösterge o ayın değeri, döviz BAKİYELERİ bugünkü kurla çevrilir" diye ayrıştır.

---

**10. `conversionIncomplete` bayrağı 7 yerde üretilip hiçbirinde gösterilmiyor**

NE · Hooklar bayrağı hesaplıyor ama ya tipe konmamış (TS'te okunamıyor), ya dönüşten düşürülmüş, ya da erken-çıkış dalında hiç üretilmemiş. Tüketiciler `ConversionIncompleteWarning`'i bu bayrağa hiç bağlamamış; Excel'e de taşınmıyor.

NEREDE · `src/hooks/useAnalyticsSummary.ts:213-214` (tip: `src/types/analytics.ts:65-88`) · `src/hooks/useAnalyticsTrend.ts:147, 191, 221, 296` vs `:303-308` · `src/hooks/useCategoryReport.ts:1258` (arayüz `1027-1036`) · `src/hooks/useAccountReport.ts:225-233, 331` · `src/hooks/useProductReport.ts:149-158` (erken çıkışta yok, dolu dalda `:190` var) · `src/hooks/useComparisonReport.ts:158-163` (helper hiç kullanılmamış) · Excel: `src/app/raporlar/genel.tsx:45-52, 83-107` ve `src/hooks/useReportExcelExport.ts:112-121`

NEDEN ÖNEMLİ · Ana para birimi TRY dışı olan kullanıcıda kur bulunamazsa `createRpcTotalConverter` HAM TRY değeri koruyor ve ekran bunu "$43.000,00" diye basıyor — bu deseni "bug" ilan edip uyarı standardını kuran yorumların (`useCategoryReport.ts:224-225`, `useExchangeRates.ts:243-248`) vaat ettiği güvence pratikte hiçbir rapor yüzeyinde gerçekleşmiyor. Tetik dar (baz≠TRY + kur yok) ama sinyal sıfır.

ÖNERİ · Bayrağı ilgili tiplere ve hook dönüşlerine ekle, mevcut `ConversionIncompleteWarning`'i beş ekrana bağla, export options'a da taşıyıp dosyanın meta bloğuna bir satır yaz.

---

**11. Hata yutulup YANLIŞ SAYI üretiliyor (iade ve alt sorgular)**

NE · İki yerde `catch` hatayı yutup nötr değer döndürüyor, React Query sorguyu BAŞARILI sayıyor: iade RPC'si `return 0` / `return []` yapıyor; ürün/mapping alt sorgularında `error` hiç destructure edilmiyor.

NEREDE · `src/hooks/useProductReport.ts:127-131` (ana sorgu aynı durumda `:93` `throw error` yapıyor — politika tutarsız) · `src/hooks/useCategoryReport.ts:211-215, 386` (`combinedError` iade sorgusunu içermiyor) · `src/hooks/useCategoryReport.ts:886-893, 922-931, 934-941, 750-757, 791-796`

NEDEN ÖNEMLİ · İade sorgusu düşerse `returnTotal=0` → `netAmount = totalAmount`; kullanıcı iadesi düşülmemiş rakamı "net" diye görüyor ve tek işaret olan "İade" satırı da kayboluyor. `hasProducts` düşerse ürünlü işlemler "ürünsüz" sayılıp tam tutarıyla listeye giriyor. Yanlış tutar cache'e yazılıyor, ekranda hiçbir uyarı yok.

ÖNERİ · Bu çağrılarda `if (error) throw error` uygula ve hatayı ekranın mevcut hata/tekrar-dene bloğuna OR'la.

---

**12. Kategori detay Excel'i: TOPLAM listelenen satırlardan büyük, üstelik "%100" yazıyor**

NE · Export'a yalnız `subCategories` satır olarak veriliyor; TOPLAM ise ana kategorinin doğrudan işlemlerini de içeren `subCategoryReport.totalAmount`. İşlem sayısı toplamı yalnız alt kategorilerden, yüzde ise sabit `formatPercent(100)`. Kullanıcının checkbox seçimi de yok sayılıyor.

NEREDE · `src/app/raporlar/kategori/[id].tsx:246-286` (`:250-255` yalnız children, `:263` totalAmount) + `src/lib/pageExports.ts:228-241` (`:238`, `:239`) · ekranda ayrı satır olarak gösteriliyor: `kategori/[id].tsx:454-461`

NEDEN ÖNEMLİ · `parentCount > 0` olan her kategoride dosyadaki satırlar toplamı TOPLAM'ı tutturmuyor, tutar ile adet farklı kümelerden geliyor ve toplam satırı %100 iddia ederken yüzdeler %100'e ulaşmıyor.

ÖNERİ · `parentCount > 0` ise "&lt;Kategori&gt; (doğrudan)" satırını da yaz (ekrandaki checkbox kümesiyle birebir aynı kümeyi dışa aktar) ve toplam yüzdesini satırlardan üret.

---

**13. Excel'de para/tarih/adet hücreleri METİN**

NE · Tutarlar `formatCurrency(...)` çıktısı ("₺1.234,56"), tarihler `formatDateShort(...)` çıktısı, sayaçlar `.toString()` olarak yazılıyor. Aynı kod tabanında doğru desen mevcut: `excelExport.ts:854-859` `moneyCell` ve `:1224-1228` `moneyNumberCell` gerçek sayı + `z` biçim kodu yazıyor. Miktar da `formatQuantity` yerine ham `.toString()` ile basılıyor.

NEREDE · `src/lib/reportExcelExport.ts:239, 245, 246, 297, 302, 313` · `:517` (miktar; ekran karşılığı `alis-satis.tsx:463`) · `src/lib/pageExports.ts:231`

NEDEN ÖNEMLİ · Muhasebeciye giden dosyada SUM/sıralama/pivot çalışmıyor; MDY locale'li Excel'de "24/07/2026" metni hatalı okunuyor; negatiflerin Excel biçimi devreye girmiyor (dosyanın kendi `:15-19` yorumunun kabul ettiği durum). Miktarda "5,977 kg" → "5.977" Türkçe okumada bin katına dönüşüyor.

ÖNERİ · Tutar `{v: sayı, t:'n', z:'"₺"#,##0.00'}`, tarih `{v: Date, t:'d', z:'dd/mm/yyyy'}`, adet `{v: sayı, t:'n'}`; miktarda `formatQuantity` (bu dosyaya import edilmesi gerekiyor).

---

**14. Arşivli/pasif cari ve personelin raporuna hiç erişilemiyor**

NE · Rapor picker'ları listeyi varsayılan argümanlarla çekiyor (`includePassive=false, includeArchived=false`); deep-link ile gelen id bu listede bulunamayınca seçili kayıt null kalıyor ve ekran "bir cari/personel seçin" boş kartına düşüyor. Detay sayfalarındaki "Rapor" butonu ise koşulsuz gösteriliyor.

NEREDE · `src/components/reports/tabs/CariTabContent.tsx:29, 55, 81` + `src/hooks/useCariler.ts:11, 26-33` · `src/components/reports/tabs/PersonelTabContent.tsx:27, 34, 72` + `src/hooks/usePersonel.ts:11, 26, 32` · giriş yolları: `src/app/cariler/[id].tsx:598-614`, `src/app/personel/[id].tsx:457-473`, `src/app/arsiv/index.tsx:320`

NEDEN ÖNEMLİ · Buton sessiz no-op. Geçmiş dönem raporu tam da arşivlenmiş cari ve işten ayrılmış personel için gerekiyor; kullanıcı picker'da da bulamadığı için hiç ulaşamıyor.

ÖNERİ · Rapor picker'ında `useCariler(undefined, true, true)` / `usePersonelList(true, true)` kullan (arşivli/pasif rozetiyle) veya deep-link id'sini `useCari(id)`/`usePersonel(id)` ile ayrıca çöz.

---

**15. Bağlantılı (paylaşılan) cari raporda 0 işlem gösteriyor, bakiye dolu**

NE · Picker linked carileri listeliyor, ama işlemleri çeken `useAllIslemlerByCari` koşulsuz `.eq('isletme_id', isletme.id)` uyguluyor; linked cari sahibin işletmesine ait olduğu için viewer'da sorgu boş dönüyor. Kardeş hook `useIslemlerByCari` bunun için `asViewer` bayrağı taşıyor.

NEREDE · `src/components/reports/tabs/CariTabContent.tsx:53` + `src/hooks/useIslemler.ts:636-660` (`:652` filtre) ↔ `src/hooks/useIslemler.ts:438, 460-462` · RLS zaten sınırlıyor: `supabase/migrations/20260213000001_cari_sharing_v2.sql:168`

NEDEN ÖNEMLİ · Özet kartı gerçek bir bakiye gösterirken hemen altında "Bu dönemde işlem yok" ve "Dönem Bakiye Değişimi +₺0,00" yazıyor — rapor kendi içinde çelişiyor. Aynı kullanıcı aynı işlemleri cari detay sayfasında görebiliyor.

ÖNERİ · `useAllIslemlerByCari`'ye `asViewer` parametresi ekle, `useCariLinkStatus` ile geç ve query key'e 'viewer' ekle.

---

**16. Alış-Satış'ta başlık NET, kırılım BRÜT — toplamlar tutmuyor**

NE · Sekmelerde `netAmount` (= totalAmount − returnTotal) gösteriliyor; kategori başlıkları, ürün kartları ve yüzde barları `totalAmount` (iadesiz brüt) üzerinden. Ürün kırılımında iade hiç yok: tamamı iade edilen ürün listede hâlâ tam tutarla ve tam payla duruyor.

NEREDE · `src/app/raporlar/alis-satis.tsx:311, 339` (net) vs `:94, 407, 471, 479` (brüt) · `src/hooks/useProductReport.ts:187` · iade ailesinin brütten düşmesi gerektiği `src/lib/urunHareket.ts:61`'de yazılı · sekme etiketi "Net" demiyor (i18n'de `purchaseSales.net` anahtarı hazır ama kullanılmıyor)

NEDEN ÖNEMLİ · Kullanıcı üstteki rakamı listeyle topladığında tutturamıyor. (Hafifletici: iade tutarı `:354-358`'de ayrı satırda görünüyor.)

ÖNERİ · Ya sekmede brüt gösterip "Net"i ayrı bas, ya da RPC'ye iade tiplerini ekleyip kırılımı da netle.

---

**17. `personel_satis` bakiye değişimine giriyor ama kartta hiç gösterilmiyor**

NE · Personel dalında `satislar` hesaplanıp `balanceChange`'e ekleniyor, fakat `secondary: null` verildiği için kalem ekranda render edilmiyor (secondary bloğu yalnız cari'de basılıyor).

NEREDE · `src/components/reports/EntitySummaryCard.tsx:99-113` (`:105` balanceChange, `:109` `secondary: null`, `:188` render koşulu)

NEDEN ÖNEMLİ · Kullanıcı Gider/Ödeme/Tahsilat üç kalemini görüyor; "Dönem bakiye değişimi" bu üçüyle uzlaşmıyor. Personele satış yapan işletmede toplam ile kırılım arasında açıklanamayan fark oluşuyor.

ÖNERİ · Personel dalında `secondary`'yi doldur ("Personele Satış") veya ayrı bir alt-metrik satırı ekle.

---

**18. Haftalık dönemde ay seçmek ÖNCEKİ aya götürüyor**

NE · `goToWeekOfMonth`, hedef ayın 1'i ile BUGÜN arasındaki gün farkını 7'ye bölüyor; haftalık aralık ise "bu haftanın pazartesisi + offset*7" üzerinden kuruluyor. Bugün pazartesi değilse referanslar kayıyor.

NEREDE · `src/components/reports/PeriodNavigator.tsx:137-144` (`:141-142`)

NEDEN ÖNEMLİ · Node ile doğrulandı (bugün 25.07.2026): "Oca 2026" → 22–28 Aralık 2025; "May 2026" → 20–26 Nisan; "Tem 2026" → 22–28 Haziran. Kullanıcı ay seçiciyle istediği döneme ulaşamıyor, oklarla tek tek gitmek zorunda kalıyor.

ÖNERİ · Offset'i `floor((hedefAyınİlkGününüİçerenPazartesi − buPazartesi)/7)` ile hesapla.

---

**19. Pull-to-refresh tutarsız: bir yanda eksik tazeliyor, bir yanda her şeyi tazeliyor**

NE · İki karşıt sapma: (a) refresh ekranın bazı sorgularını kapsamıyor — hesaplar/kur yenileniyor ama cari/personel yenilenmiyor; `refetch` yalnız ana sorguyu tazeliyor, iade ve kategori sorguları bayat kalıyor; net varlık serisi demir aldığı Genel Durum'u tazelemiyor. (b) Dört rapor sayfası filtresiz `queryClient.invalidateQueries()` çağırıyor.

NEREDE · `src/app/raporlar/genel.tsx:33-38` (cari `staleTime` 10 dk: `useCariler.ts:45`) · `src/hooks/useCategoryReport.ts:392` + `gelir-gider.tsx:77-85` · `src/hooks/useNetWorthTrend.ts:209-211` + `useFinancialSummary.ts:194-197` (refetch hiç dönmüyor) · filtresiz invalidate: `raporlar/cari.tsx:23-30`, `raporlar/personel.tsx:23-30`, `raporlar/karsilastirma.tsx:31`, `raporlar/kategori/[id].tsx:133-140` · paylaşılan hook: `src/hooks/usePullToRefresh.ts:5-17`

NEDEN ÖNEMLİ · (a)'da kullanıcı "yeniledim ama değişmedi" yaşıyor; net varlıkta yeni P&L toplamları eski demir noktasıyla birleşince penceredeki HER ayın net varlığı kayıyor. (b)'de tek bir çekme cache'teki tüm aktif sorguları tetikliyor.

ÖNERİ · Her sayfada `usePullToRefresh(...refetchFns)` kullan; `useFinancialSummary`'ye refetch ekleyip net varlık zincirine kat; filtresiz invalidate'leri queryKey ile daralt.

---

**20. Rapor yüzeyi tüm geçmişi indirip istemcide filtreliyor; liste sanallaştırılmamış**

NE · `useAllIslemlerByPersonel`/`ByCari` bir dönem raporu için entity'nin BÜTÜN geçmişini (kategori+hesap+creator join'leriyle) indiriyor, dönem filtresi istemcide `substring(0,10)` ile yapılıyor. Liste `maxItems={0}` ile tümü `.map` edilerek düz `ScrollView` içine basılıyor. Ürün rozeti sorgusu tüm id'leri tek `.in()` filtresine koyuyor (chunk yorumu var, kod yok). PDF önizleme her dönem değişiminde biri filtresiz iki tam `fetchAllPages` çalıştırıyor.

NEREDE · `src/hooks/useIslemler.ts:576-601` + `PersonelTabContent.tsx:41-59, 93-97` (hafif alternatif hazır: `useIslemler.ts:605-631` `useAllLeaveByPersonel`) · `EntityTransactionList.tsx:78, 83, 134` + `src/hooks/useUrunHareketler.ts:521, 529-534` · `src/hooks/usePdfExport.ts:134-137` + `PdfExportSheet.tsx:112-116, 326` · `raporlar/personel.tsx:35` (ScrollView)

NEDEN ÖNEMLİ · 4 yıllık yoğun bir cari için "Tüm Zamanlar" seçilince binlerce satır iki kez iniyor ve binlerce View kuruluyor; `.in()` URL'i şişip 414 riski doğuyor (hata durumunda ürün rozetleri sessizce kayboluyor). Performans bu projede açık öncelik.

ÖNERİ · Para satırlarını sunucuda tarih aralığıyla filtrele, izin devri için `useAllLeaveByPersonel` kullan; id'leri 100'lük parçalara böl; PDF önizlemesini FlatList'e alıp açılış bakiyesini tek toplam sorgusuyla çek.

---

**21. PDF karşılaştırma çıktısı günlük modda hangi aya ait olduğunu yazmıyor**

NE · Günlük kova etiketi yalnız gün + kısa gün adı ("1 Sal"); PDF meta satırındaki `rangeLabel` de bu etiketlerden kuruluyor. Ekrandaki `monthLabel` ("Haziran 2026 günleri") PDF'e hiç aktarılmıyor.

NEREDE · `src/hooks/useComparisonReport.ts:104, 190-192, 246` → `src/lib/comparisonPdf.ts:104`

NEDEN ÖNEMLİ · Paylaşılan/arşivlenen PDF "Dönem: 1 Sal - 30 Çar" diyor; iki farklı ayın çıktısı birbirinden ayırt edilemiyor.

ÖNERİ · PDF `rangeLabel`'ını ekrandaki başlıkla aynı kaynaktan üret.

---

**22. Türkçe büyük harf kuralı 6 yerde delinmiş (GELIR / GIDER / LIRAYLA)**

NE · `upperTr` yerine düz `.toUpperCase()` veya `textTransform:'uppercase'` kullanılmış; ikisi de I/İ kuralını uygulamıyor.

NEREDE · `src/app/raporlar/gelir-gider.tsx:207, 235` (aynı dosya `:44-47`'de `upperTr` kullanıyor) ve `:398-402` `sectionHeaderText` · `src/components/reports/tabs/KarsilastirmaTabContent.tsx:206` (sütun başlıkları; `:249, 256` yalnız tutarlılık) · `src/app/raporlar/net-varlik-trend.tsx:416` + `:200-203` ("bugünkü lirayla" → "LIRAYLA") · doğru kullanım: `ReportPeriodBar.tsx:34`, `PeriodNavigator.tsx:185`

NEDEN ÖNEMLİ · Uygulamanın en çok girilen rapor ekranının en büyük iki etiketi Türkçe yanlış yazılıyor ve aynı sayfa kendi içinde iki farklı büyük-harf dili kullanıyor.

ÖNERİ · Metinleri `upperTr(t(...))` ile üret, `textTransform`'ları kaldır.

---

**23. Paylaşılan bileşen varken elle kopya (bu kod tabanının bilinen kötü alışkanlığı)**

NE · Aynı görsel/işlev için ortak bileşen mevcutken yerel kopyalar yazılmış; kopyalar çoktan ayrışmış.

NEREDE ·
- İki-sekmeli tutar özeti ~110 satır kopya: `gelir-gider.tsx:192-248 + 403-449` ↔ `alis-satis.tsx:286-342 + 497-543` (biri `.toUpperCase()`, diğeri hazır büyük harfli metin) ↔ `nakit-akisi/index.tsx:311-328`
- İşlem satırı: `raporlar/hesap/[id].tsx:136-176, 296-318` elle; kardeş `raporlar/kategori/[id].tsx:320-339` `TransactionRow` kullanıyor
- Birincil buton: `PeriodNavigator.tsx:344-349, 478-490` elle; `CustomDateRangePicker.tsx:93-95` paylaşılan `Button`
- İkon/renk haritası: `raporlar/hesap/[id].tsx:37-45` ↔ `components/ui/IncomeSourceCard.tsx:12-20` (7 satır birebir, ham hex)
- Kart tıklanabilirliği: `GenelTabContent.tsx:268, 312` `TouchableOpacity`+`Card`; `Card.tsx:31-37` zaten `onPress` alıyor
- Alt sayfa yüzeyi 4 kopya, yükseklikleri bile ayrışmış: `PeriodNavigator.tsx:398-404` / `CustomDateRangePicker.tsx:163-169` / `TrendFilterModal.tsx:330-335` / `EntityPicker.tsx:250-255`

NEDEN ÖNEMLİ · Paylaşılan bileşene giden düzeltmeler (para birimi çözümü, ondalık, basma geri bildirimi) kopyalara ulaşmıyor; `CollapsibleGroupHeader` tam bu sebeple ortaklaştırılmışken bu bloklar dışarıda kalmış.

ÖNERİ · `components/reports` altına `ReportSummaryTabs` çıkar; hesap detayını `TransactionRow`'a çevir; `Button`'a geç; ikon haritasını tek modüle taşı. (Not: `Card` bugün `accessibilityRole/Label` prop'u kabul etmiyor — `CardProps`, `Card.tsx:6-12` — önce genişletilmeli.)

---

**24. Modallarda Android geri tuşu ölü, X butonlarında hitSlop yok**

NE · Yıl seçici, ay+yıl seçici, iOS gün seçici ve özel tarih modali `onRequestClose` almıyor. 24px'lik X ikonları çıplak `TouchableOpacity` içinde, `HIT_SLOP` verilmemiş.

NEREDE · `PeriodNavigator.tsx:204, 246, 316` + `CustomDateRangePicker.tsx:59` (onRequestClose) · `PeriodNavigator.tsx:215-217, 257-259, 327-329`, `EntityPicker.tsx:161-163`, `TrendFilterModal.tsx:255-257` (hitSlop) · doğru örnekler: `EntityPicker.tsx:144-149`, `CustomDateRangePicker.tsx:66`, `PeriodNavigator.tsx:172/198` (aynı dosyada çelişki) · sabit: `constants/spacing.ts:87-91`

NEDEN ÖNEMLİ · Kullanıcı yıl seçiciyi geri tuşuyla kapatamıyor; X'e iska dokunuş oluyor. Kod tabanı kendi içinde tutarsız.

ÖNERİ · Dört modale `onRequestClose`, beş X butonuna `hitSlop={HIT_SLOP.md}` ekle.

---

# DÜŞÜK

**25. Dönem hesabının kenar durumları (5 bulgu)**

NE · (a) Global özel tarihler `new Date()` ile saat bileşeni taşıyor; `previousDateRange` 1 ms geri gidince aynı takvim gününde kalıyor ve önceki dönem, mevcut dönemin ilk gününü de kapsıyor. (b) Varsayılan başlangıç `d.setMonth(d.getMonth()-1)` ile ay taşması yapıyor (31 Mart → 3 Mart). (c) Offset mutlak değil göreli kalıcılaştırılıyor. (d) İleri oku ve yıl listesi geleceğe sınırsız, tarih seçici ise `maximumDate` ile geleceği kapatıyor; yıl listesi sabit 10 yıllık pencere olduğu için 6+ yıllık geçmişe tek dokunuşla gidilemiyor. (e) Özel aralık butonları tarihi `formatDateForDB` ile ham `YYYY-MM-DD` basıyor.

NEREDE · `src/hooks/useReportPeriod.ts:29-30, 191-200` · `:29` (`lib/date.ts:540-550` `addMonths` bu iş için yazılmış, kullanılmıyor) · `:50-52, 178-182` · `src/components/reports/PeriodNavigator.tsx:195-201, 220, 147, 311, 340, 56-60` · `src/components/reports/CustomDateRangePicker.tsx:48, 53`

NEDEN ÖNEMLİ · (a) KPI değişim yüzdesinin tabanını bir gün şişiriyor; kısa aralıkta delta'yı sürekli 0 yapıyor. (b) "1 ay" varsayılanı 28 güne düşüyor ve rapor bu bozuk aralıkla hesaplanıyor. (d) Günlük modda offset>0 iken picker `value`'su `maximumDate`'i aşıp etiketle takvim ayrışıyor. (e) Uygulamanın DMY/MDY ayarı yok sayılıyor.

ÖNERİ · Özel tarihleri gün başına normalize et; varsayılanı `addMonths(new Date(), -1)` ile üret; açılışta offset'i 0'a döndür; ileri oku ve yıl listesini içinde bulunulan dönemle sınırlayıp listeyi aktif yıla göre kaydır; buton metinlerinde `useDateFormat.formatDateShort` kullan.

---

**26. Üst özet ile kırılım arasındaki küçük tanım farkları (5 bulgu)**

NE · Aynı ekranda aynı isimli iki sayı farklı kümelerden geliyor: hero "Hesaplar" yalnız pozitif bakiyeler, alt kart net toplam; `accountCount` yalnız ana para birimi + bakiyesi ≠0 hesapları sayıyor (kredi kartı dahil), üstündeki toplam ise çevrilmiş pozitifler; kredi kartı satırları sabit `error` renginde; kartların toplamı başlıktaki net toplama eşit değil (yalnız-iade kategorisi ve kategorisiz iade kartlara yansımıyor); Hızlı Özetler'in 4 kartından 3'ü dönem seçiminden etkilenmiyor ve "anlık" işareti yok.

NEREDE · `GenelTabContent.tsx:142` vs `197-199` + `useFinancialSummary.ts:106-112` · `useAnalyticsSummary.ts:179-183` + `FinanceKPIGrid.tsx:154` · `GenelTabContent.tsx:238, 249, 252` (`app/(tabs)/index.tsx:573-575` işaretli basıyor) · `useCategoryReport.ts:330-343, 365-372` · `QuickInsights.tsx:27-28, 41, 58, 64` (`FinanceKPIGrid` `isInstant` ile bunu işaretliyor, burada işaret yok)

NEDEN ÖNEMLİ · Tek başına her biri dar bir kenar durum, ama hepsi aynı sınıfa ait: kullanıcı hangi sayının doğru olduğunu bilemiyor.

ÖNERİ · Alt kart toplamlarını üst kartla aynı tanımdan türet; adet açıklamasını toplamla aynı kuraldan üret; kredi kartında negatif bakiyeyi borç, pozitifi "fazla ödeme" olarak sun; yalnız-iade kategorileri için negatif kart üret; anlık kartlara "anlık" etiketi ekle.

---

**27. Hata "veri yok" gibi gösteriliyor (6 yüzey)**

NE · Hooklar `isError/error` döndürmüyor veya tüketici okumuyor; `= []` ve `?? 0` varsayılanları hatayı boş veriye çeviriyor.

NEREDE · `useAnalyticsSummary.ts:156-159, 212` ve `useAnalyticsTrend.ts:303-308` · `useNetWorthLenses.ts:180-189` (kaynak `useNetWorthTrend.ts:217`; hata olunca kırpma `:189` seriyi tek aya indiriyor) · `raporlar/kategori/[id].tsx:105-112, 173-177` · `CariTabContent.tsx:29-30, 53` · `PersonelTabContent.tsx:27, 32` · `usePdfExport.ts:184-189` → `PdfExportSheet.tsx:375-379` · `raporlar/karsilastirma.tsx:45` (PDF butonu `error` iken hâlâ basılabilir)

NEDEN ÖNEMLİ · Muhasebe yüzeyinde "hata" ile "hareket yok" aynı görünüyor; kullanıcı borcu/alacağı olmadığı sonucunu çıkarabilir. Disk-persist cache çoğu vakada bayat veriyi gösterse de ilk açılışta boş ekran çıkıyor.

ÖNERİ · Hookların dönüşüne `isError/error` ekle; boş-durum yerine hata kartı + "Tekrar dene" göster; karşılaştırma PDF butonunun `disabled` koşuluna ve `exportPdf` guard'ına `|| !!error` ekle.

---

**28. Yükleme sırasında özet kartı tüm metrikleri 0,00 gösteriyor**

NE · İşlem listesi skeleton'a alınmış, `EntitySummaryCard` alınmamış; o sırada `transactions=[]` ile besleniyor.

NEREDE · `CariTabContent.tsx:83-99` · `PersonelTabContent.tsx:74-98`

NEDEN ÖNEMLİ · Kart bir an "Alışlar ₺0,00 / Dönem Bakiye Değişimi +₺0,00" derken altındaki "Güncel Bakiye" doğru geliyor — kart kendi içinde çelişik görünüyor, sonra zıplıyor.

ÖNERİ · Kartı da aynı loading gate'ine al.

---

**29. İşlem sayacı mükerrer sayıyor (2 yüzey)**

NE · Kategori özetinde RPC'nin kategori başına `COUNT(DISTINCT islem_id)` değerleri düz toplanıyor; ürün raporunda `islem_sayisi` ürün başına distinct olarak dönüp toplanıyor.

NEREDE · `useCategoryReport.ts:1203-1217` + migration `20260630000000:167` · `useProductReport.ts:175` + migration `:266, 302` (gösterim `alis-satis.tsx:368`)

NEDEN ÖNEMLİ · 3 kalemli tek fatura 3 işlem sayılıyor; özetteki adet listedeki satır sayısından fazla çıkıyor. Tutarlar doğru kalıyor.

ÖNERİ · Adedi listedeki benzersiz işlem sayısından (veya ayrı bir DISTINCT sorgudan) üret.

---

**30. Toplu stok girişinde `kdv_orani` yazılmıyor (yazma yolu)**

NE · Cari bağlantısı olmayan toplu stok girişinde `createUrunHareket` çağrısına `kdv_orani` verilmiyor; DB'ye NULL yazılıyor, rapor `COALESCE(uh.kdv_orani, 0)` ile 0 sayıyor.

NEREDE · `src/app/urunler/toplu-giris.tsx:244-253` (cari'li dal `:226` veriyor) · `src/hooks/useUrunHareketler.ts:452` alanı bekliyor · okuma: migration `20260630000000:251`

NEDEN ÖNEMLİ · Tek bir "ALIŞLAR" rakamı içinde KDV-dahil ve KDV-hariç satırlar toplanıyor; ekranın satır toplamı (KDV dahil) footer/DB/rapor ile ayrışıyor.

ÖNERİ · Cari-siz dalda da `kdv_orani: row.kdvOrani` gönder (geçmiş NULL kayıtlara dokunmadan).

---

**31. Ölü kod ve ölü i18n anahtarları**

NE · Hiç çağrılmayan bileşen/hook/prop/dal ve kullanılmayan çeviri anahtarları.

NEREDE ·
- `components/ui/CategoryReportCard.tsx:404-618` `HierarchicalCategoryReportCard` (tek referans barrel export `components/ui/index.ts:20`); `:578` i18n dışı `{child.count} işlem`
- `src/hooks/useAccountReport.ts:57-197` `useAccountReport`/`useAccountTransactions` (~140 satır, `get_account_report` RPC'siyle birlikte) — dosya başlığı artık ekranda karşılığı olmayan davranışı anlatıyor
- `EntityPicker.tsx:21, 29` ölü `isLoading` prop'u (liste yüklenirken "Personel/Cari bulunamadı" yazıyor)
- `EntityTransactionList.tsx:60, 79, 156, 209` çift çeviri + `maxItems=0` iken hep true olan `hasMore`
- `KarsilastirmaTabContent.tsx:61` erişilemeyen `ActivityIndicator` (erken dönüş `:25-33`)
- `raporlar/kategori/[id].tsx:4, 5, 86, 798-801` kullanılmayan `ScrollView`/`router` + ezilen `paddingBottom`
- `alis-satis.tsx:83, 95-96` hiç okunmayan `totalAmountKdvsiz`/`totalQuantity` (ikincisi kg+adet karıştırıyor)
- `raporlar/genel.tsx:143-148` + `GenelTabContent.tsx:27` gereksiz `useReportRouteState` ve prop geçişi (`useReportRouteState.ts:73-81` URL'e dönem parametresi yazıyor)
- `src/lib/pdfExport.ts:49` ölü `page` çeviri anahtarı
- `i18n/locales/tr/reports.json:50, 52, 54` (`range6`, `range24`, `sinceLabel`) · `reports:comparison` altında 10 kullanılmayan anahtar (`vsLastPeriod`, `increase`, `decrease`, …)
- Yanıltıcı yorumlar: `KarsilastirmaTabContent.tsx:48` ve `comparisonPdf.ts:31` "en yeni üstte" diyor, `useComparisonReport.ts:182-183` takvim modlarında tersini yapıyor
- `useCategoryReport.ts:879, 1114, 1148` memo çıktısını yerinde `sort()` ediyor

ÖNERİ · Sil; korunacaksa `:578`'i `t('reports:counts.transaction')` ile değiştir, `sort()`'u `[...dizi].sort()` yap, yorumları düzelt.

---

**32. Hardcoded punto/ölçü değerleri (constants dışı)**

NE · `constants/spacing.ts`'te `spacing`, `fontSize` (10/12/14/16/18/20/24/28/32), `fontWeight` ve `borderRadius` (sm4/md8/lg12/xl16/2xl20/full) tanımlıyken düz sayılar yazılmış.

NEREDE · `ExploreGrid.tsx:80` · `GenelTabContent.tsx:403-427, 453-466` · `gelir-gider.tsx:427, 430, 439, 442` · `alis-satis.tsx:513-548` · `net-varlik-trend.tsx:265, 303, 417, 430, 445-447, 472-478` · `EntityPicker.tsx:227, 236, 252-254` · `EntitySummaryCard.tsx:361, 402` · `TrendFilterModal.tsx:20 (ölü borderRadius import), 332, 366, 383` · `PeriodNavigator.tsx:400, 418, 461, 479-489` · `ReportExportButton.tsx:23` (`padding: 6`) · `QuickInsights.tsx:150`

NEDEN ÖNEMLİ · Aynı yüzeyde 4 farklı "küçük metin" puntosu oluşuyor; tema/ölçek değişikliği bu ekranları atlıyor.

ÖNERİ · Ölçekte karşılığı OLAN değerleri sabite bağla (10→`fontSize.xs`, 14→`md`, 16→`lg`, 8→`borderRadius.md`, 12→`lg`, 20→`2xl`, 999→`full`, '600'/'700'→`fontWeight`). **Kapsam notu:** 11, 30, 36, 15, 13 ve ikon kutusu/grafik ölçüleri (40, 190, 160/68) için ölçekte karşılık YOK — bunlar ya yeni sabit gerektirir ya yerinde kalır; `FinanceKPIGrid.tsx:184-185` yorumu bu politikayı zaten yazıyor.

---

**33. Boş durum dili üç parçalı; veri yokken 50/50 bar çiziliyor**

NE · Rapor yüzeyinde üç ayrı boş-durum kalıbı var (düz View+Text / Card+Text / Card+48px ikon+Text); `components/ui/EmptyState.tsx` hiçbir rapor dosyasında import edilmiyor. Ayrıca `totalAll === 0` iken ilerleme çubuğu `positivePercent = 50` ile yarı yeşil/yarı kırmızı doluyor ve boş hesap listesi yalnız başlıkla kalıyor.

NEREDE · `gelir-gider.tsx:292-297, 346-353` · `alis-satis.tsx:389-396` · `hesap/[id].tsx:251-255` · `kategori/[id].tsx:506-514` · `EntityTransactionList.tsx:121-129` · `CariTabContent.tsx:110-118` · `PersonelTabContent.tsx:102-110` · `GenelTabContent.tsx:61, 190-221`

ÖNERİ · `totalAll === 0`'da çubuğu gizle ve hesap listesi boşken kısa bir boş-durum satırı göster. **Not:** `EmptyState.tsx:51-56` tam ekran liste boşluğu için tasarlanmış (`flex:1`, 80px ikon) — rapor içi satırlara takılmadan önce kompakt varyant gerekiyor.

---

**34. Yüzde ve bar görselleri sayıyı yalanlıyor**

NE · Bar genişliği yalnız üstten kırpılıyor (`Math.min(pct,100)`), negatif kalemde `width:'-12%'` üretiliyor; ürün raporunda yüzde `Math.round` ile tam sayıya inip "%0" yazarken bar `Math.max(pct,2)` ile görünür çiziliyor ve yüzdeler 100'e toplanmıyor.

NEREDE · `CategoryReportCard.tsx:394, 508, 605` + `IncomeSourceCard.tsx:74` (negatif kaynak `useCategoryReport.ts:340`) · `alis-satis.tsx:473, 479` + `useProductReport.ts:179`

ÖNERİ · Genişliği `Math.max(0, Math.min(pct,100))` ile kelepçele; yüzdeyi yuvarlamadan sakla, `formatPercent(pct, 1)` ile bas, bar tabanını 0'a indir.

---

**35. Rengi olmayan kategorinin rengi liste sırasına bağlı**

NE · Renk `DEFAULT_COLORS[index % ...]` ile sıradan türetiliyor; sıralama tutara göre olduğu için dönem değişince aynı kategori farklı renkte çiziliyor.

NEREDE · `CategoryReportCard.tsx:343, 424, 557` + `useCategoryReport.ts:362`

NEDEN ÖNEMLİ · Yalnız içe aktarılmış (color NULL) kategorileri etkiler; aylar arası karşılaştırmada renk kodu güven vermiyor.

ÖNERİ · Varsayılan rengi kategori id'sinden deterministik türet (hash % palet uzunluğu).

---

**36. PDF ve dosya paylaşımındaki ikincil eksikler**

NE · (a) `fmt` null ile 0'ı aynı sayıp boş string döndürüyor — bakiye 0 iken kolon boş kalırken antet "₺0,00" yazıyor, belge kendi içinde çelişiyor. (b) PDF'te özet satır sırası ekranın tersi (TOPLAM→ORTALAMA vs ORTALAMA→TOPLAM). (c) "Tüm Zamanlar" 2020-01-01'de sabit kesiliyor (açılış bakiyesi taşındığı için aritmetik bozulmuyor, satırlar eksik). (d) Paylaşım desteklenmiyorsa fonksiyon sessizce başarıyla dönüyor. (e) Kategori/izin export'unda gerçek hata mesajı yutuluyor.

NEREDE · `src/lib/pdfExport.ts:142-145, 195-196, 246, 271-272` · `src/lib/comparisonPdf.ts:120-131` ↔ `KarsilastirmaTabContent.tsx:128, 151` · `PdfExportSheet.tsx:91-93` (`date.ts:614-618` 1900+ destekliyor) · `src/lib/pageExports.ts:62-77` (kardeş `reportExcelExport.ts:395-397` throw ediyor) · `raporlar/kategori/[id].tsx:281-283` ve `personel/izin-gecmisi/[id].tsx:172-174` (doğru desen `nakit-akisi/index.tsx:93-95` `toErrorMessage`)

ÖNERİ · null için boş / 0 için `formatCurrency(0,…)`; PDF'te ortalama satırını üste al; allTime'da tarih filtresini kaldır (`buildQuery` `withDateFilter=false` destekliyor); `else` dalında `sharingNotSupported` throw et; `catch (error)` ile `toErrorMessage(error)` göster.

---

**37. Eksik özellik olarak duran boşluklar**

NE · (a) Cari raporunda açılış/kapanış devri yok; "Mevcut Bakiye" her dönemde bugünün bakiyesi (veri elde: tüm geçmiş zaten iniyor, `PersonelTabContent.tsx:50-59`'daki `leaveCarryOver` deseni para tarafında yok). (b) Rapor satırlarında FIFO kalan/vade/ödendi damgası yok; detay sayfasında var. (c) `EntityPicker`'daki "Tümü ({{count}} Cari)" seçeneği rapor üretmiyor, yalnız seçimi siliyor. (d) Kategorisiz listede ürün kalemi önizlemesi hiç görünmüyor (id listesi yanlış kaynaktan). (e) Rapordaki "İzin Kalan" dönem-sonu, personel sayfasındaki aynı etiket yaşam-boyu. (f) Karşılaştırma raporunda hiçbir dönem-üstü-döneme değişim metriği yok.

NEREDE · `EntitySummaryCard.tsx:130, 274-305` · `EntityTransactionList.tsx:134-206` (karşılık `cariler/[id].tsx:96-99, 719-721`) · `EntityPicker.tsx:174-193` + `CariTabContent.tsx:81` · `raporlar/kategori/[id].tsx:180-181, 314, 555` · `EntitySummaryCard.tsx:117-127, 251-260` vs `usePersonelLeaveQuotas.ts:26-53` · `i18n/locales/tr/reports.json` comparison bloğu

ÖNERİ · Açılış/kapanış devrini `leaveCarryOver` deseniyle ekle; `useCariIslemKalan`'ı rapora bağla; "Tümü" satırını rapor bağlamında gizle; `islemIdList`'i `isUncategorized ? uncategorizedIslemler : filteredIslemler` üzerinden kur; izin etiketini "Dönem sonu kalan" diye nitele.

---

**38. Küçük performans/hijyen kalıntıları**

NE · Gider sekmesinde bile koşulsuz çekilen gelir-kaynak RPC'si; memoize edilmemiş `uncategorizedSum`; render gövdesinde tanımlı `Checkbox` (her render'da remount); toggle başına tekrarlanan `setLayoutAnimationEnabledExperimental` ve aynı bileşenin iki ekranda farklı katlanma davranışı; UTC gününden üretilen `todayStr`; `previousDateRange`'i içermeyen query key; `calculateIncomeSummary` yerine elle kopyalanmış gelir/gider sınıflandırması; net varlık serisinin `change===0` üzerinden kırpılması (gelir=gider olan ilk ay gizleniyor); "son 120 ayda" diyen içgörü cümlesi; raporlar ana ekranında iki kez eklenen alt boşluk; `report_viewed` olayının hesap detayında hiç loglanmaması; hiç kullanılmayan `type` parametresi.

NEREDE · `gelir-gider.tsx:63-66` (+`useAccountReport.ts:273`) · `raporlar/kategori/[id].tsx:517-526` (kardeşi `:220` memo'lu) · `raporlar/kategori/[id].tsx:379-407` · `alis-satis.tsx:109-113` (`gelir-gider.tsx:69-75` animasyonsuz) · `useAnalyticsTrend.ts:142, 188, 269` (`lib/date.ts:117-120`) · `useAnalyticsSummary.ts:61, 71-83` · `useAnalyticsSummary.ts:104-118` + `useAnalyticsTrend.ts:170-179` (bugün davranış farkı yok, ileriye dönük risk) · `useNetWorthTrend.ts:188-192` (doğru bayrak `:178` `empty`) · `net-varlik-trend.tsx:52, 248` · `raporlar/index.tsx:131, 175, 204-206` · `raporlar/hesap/[id].tsx:52-56` (karşılık `gelir-gider.tsx:31`) · `raporlar/hesap/[id].tsx:70, 73, 134, 166, 253`

ÖNERİ · Sırasıyla: hook'a `enabled: showAccounts`; `useMemo`; `Checkbox`'ı modül seviyesine + `memo`; katlama animasyonunu `CollapsibleGroupHeader`'a taşı; `formatDateForDB(new Date())`; `previousDateRange`'i key'e ekle; `calculateIncomeSummary`'yi iki yerde de çağır; kırpmayı `empty` üzerinden yap; içgörüde gerçek pencereyi geçir; `bottomSpacer`'ı kaldır; `logEvent('report_viewed', …)` ekle; `type` parametresini ya kaldır ya hook'a geçir.

---

**39. TrendFilterModal (kapsam notu: bu bileşen Net Varlık Trend raporunda değil, `TrendChartWidget.tsx:259` dashboard'unda kullanılıyor)**

NE · Sheet ekranın altına yapışık, footer'da "Uygula/Temizle" var, üstte arama input'u açılıyor; dosyada hiçbir klavye yönetimi ve `useSafeAreaInsets` yok.

NEREDE · `src/components/reports/TrendFilterModal.tsx:273-317, 328, 389-395` · karşılaştırma: `components/ui/BottomSheet.tsx:44-46`, `components/ui/ActionSheet.tsx:293`

NEDEN ÖNEMLİ · Klavye açıkken footer kapanabiliyor (kullanıcı `returnKeyType='search'` ile kurtulabiliyor); çentikli cihazlarda butonlar home indicator şeridine oturuyor.

ÖNERİ · Footer'a klavye yüksekliği + `paddingBottom: Math.max(insets.bottom, spacing.lg)` ekle.

---

# ÖNCE ŞUNU YAP

1. **`getIslemCurrency`'yi beş yüzeye uygula** ve `useAllIslemlerByCari` / `useAllIslemlerByPersonel` select'lerine `cari(currency)` / `personel(currency)` ekle — yabancı para kullanan işletmede ekran ve Excel şu an yanlış sembol basıyor (YÜKSEK-1).
2. **İki drill-down sorgusunu `fetchAllPages` ile sar** (`useCategoryReport.ts:934-939` + `useAccountReport.ts:358-383` ve kardeşleri) — 1000 satırda sessiz veri kaybı (YÜKSEK-4).
3. **Excel'i ekranın RPC'lerinden besle**: çeviri (`createConversionSum`), iade netleme ve ürün-kategori dağıtımı — dosya bugün ekrandan farklı rakam veriyor (YÜKSEK-2, YÜKSEK-3).
4. **İşaretli para biçimini yedi yüzeye uygula** (`formatCurrencyWithSign` / `signedCurrencyText`) — negatif tutarlar pozitif ve yeşil görünüyor (ORTA-6). Aynı pakette nakit akışı drill-down özetini üst ekranla aynı motora bağla (YÜKSEK-5).
5. **Dönem katmanını düzelt**: navigasyonda özel dönemde `period:'custom'` gönder, trend offset'ini string eşleme yerine doğrudan geçir, haftalık ay seçici offset'ini pazartesi referansına çevir (ORTA-7, ORTA-18).