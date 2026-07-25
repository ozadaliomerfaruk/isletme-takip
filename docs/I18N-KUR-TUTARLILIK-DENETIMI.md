# Para birimi/kur ve İngilizce çeviri tutarlılık denetimi — 25 Temmuz 2026

8 kol paralel tarandı (4 i18n + 4 para/kur), şüpheci doğrulamadan geçirildi.
82 ham bulgu → 80 tekil → **73 onaylı** (11 yüksek / 37 orta / 25 düşük); 39 para-kur, 34 çeviri.

Ana oturumun ön kontrolü: tr/en anahtar kümeleri BİREBİR AYNI (0 eksik), interpolasyon
değişkenleri BİREBİR AYNI (0 uyuşmazlık). Yani sözlük YAPISI sağlam; sorunlar kodda ve anlamda.

Ham veri: docs/denetim/i18n-kur-bulgular.json

---

### Özet teşhis

1. Her iki eksende de sorun "bilinmeyen hata" değil, **uygulanmamış kural**: kod tabanı doğru merkezî yardımcıların hepsine sahip (calculateTargetAmount, cleanAmountInput, parseCurrency, formatCurrency'nin ikinci argümanı, getCrossCurrencyDisplay, getLocale, formatQuantity, i18n.t) ama ikincil giriş/gösterim yüzeyleri bunları teker teker atlıyor.
2. En pahalı küme: QuickTransactionBar'da **bilinçli olarak düzeltilmiş** çapraz-kur ve parse korumalarının ikinci nesil yüzeylere (kredi kartı barı, personel toplu ödeme, ileri tarihli tamamlama, Günlük Kasa, bekleyen-işlem formu) kopyalanmamış olması — bunlar DB'ye kalıcı yanlış bakiye/tutar yazıyor.
3. Gösterim tarafında aynı işlem 3-4 ekranda 3-4 farklı para birimi veya tutarla görünüyor; negatif para rakamlarında işaret sessizce kaybolabiliyor.
4. "Döviz kuru bulunamadı" durumu için repoda **beş** farklı politika yan yana yaşıyor (`?? 0`, `?? balance`, `?? v`, hariç-tut+bayrak, atla+warn) — artı SQL tarafında `COALESCE(...,1)`.
5. İngilizce tarafta çökme/eksik-anahtar krizi yok; sorun (a) upperTr'ın dil kontrolsüz olması, (b) motor katmanının (Excel import, ürün açıklaması) sabit Türkçe metin üretmesi, (c) çekirdek kavramlar için tek EN terim sözlüğünün hiç kararlaştırılmamış olması.

**Hiçbir eksen temiz çıkmadı.** 73 onaylı bulgunun 39'u para/kur, 34'ü çeviri ekseninde. Aşağıda içerik gereği 3 çeviri bulgusu (metne gömülü ₺, yüzde biçimi, sayı ayracı) A bölümünde ele alındı.

---

## A. Para birimi ve kur

### HIGH

#### A1. Çapraz-kur YAZMA yolu eksik: ikincil giriş ekranları kur alanlarını hiç doldurmuyor

**NE** — Kredi kartı barı, personel toplu ödeme ve ileri tarihli işlem tamamlaması source_currency / target_currency / exchange_rate yazmadığı için farklı para birimli taraflar arasında tutar 1:1 uygulanıyor; DB bakiyesi kalıcı bozuluyor.

**NEREDE**
- src/components/transaction/CreditCardTransactionBar/index.tsx:415-435, 450-462 (kredi_karti_odeme → cari_odeme/personel_odeme, kredi_karti_ekstre → transfer; dosyada tek satır çapraz-kur kontrolü yok)
- src/app/personel/toplu-odeme.tsx:242-251 (personel_odeme, kur alanı yok; ekran :68 ve :440'ta iki tarafın para biriminin farklı olabildiğini zaten gösteriyor)
- src/hooks/useIleriTarihliIslemler.ts:399-418, 432-434 (medium: exchange_rate OLMAYAN bir kolondan okunuyor → her zaman undefined; para birimleri ise tamamlama anındaki canlı entity'den türetiliyor)
- Kök: src/lib/islemBalanceOps.ts:39-46 (kur/para birimi yoksa ikisini de TRY varsayar → converted() = ham amount)
- Doğru referans: src/components/transaction/QuickTransactionBar/hooks/useTransactionSubmit.ts:412-430 (yorumu birebir bu hatayı anlatıyor), :449-464

**KULLANICI NE GÖRÜR** — TRY karttan USD tedarikçiye 1.000 TL ödeme, tedarikçinin borcundan 1.000 **USD** düşürüyor. TRY hesaptan EUR personele 1.000 girildiğinde personelin 1.000 EUR alacağı kapanıyor. Uyarı yok, kaydın kuru olmadığı için sonradan düzeltmek de mümkün değil. İleri tarihli satırlarda ise "Geçersiz döviz kuru: TRY → USD" ham hatasıyla işlem her denemede tamamlanamıyor.

**DÜZELTME** — Bu üç yüzeye QTB'nin checkCrossCurrency muadilini ekle: taraf para birimleri farklıysa ExchangeRateBar'ı aç ve source/target/exchange_rate yaz. Kısa vadede en azından farklı para birimi durumunda kaydı **engelle ve açık hata göster** (sessiz 1:1 yerine). ileri_tarihli_islemler tablosuna source_currency/target_currency/exchange_rate kolonlarını additive ekleyip planlama anındaki kuru sakla; stripScheduledUnsupportedFields'tan çıkar.

#### A2. Tutar parse'ı merkezî katmanı atlıyor → 3-ondalık ~1000x şişme

**NE** — Üç giriş yüzeyi cleanAmountInput yerine ham `text.replace(/[^0-9,.]/g,'')` kullanıyor (birden çok ayraç + sınırsız ondalık serbest), Excel import ise köşeli-parantez tutarını kendi TR-öncelikli mantığıyla parse ediyor.

**NEREDE**
- src/components/transaction/CreditCardTransactionBar/index.tsx:516-519 → kaydetme :407 roundCurrency(parseCurrency(amount))
- src/components/import/usePendingFormState.ts:326-330 (aynı dosya :91-93'te tuzağı yorumda kabul ediyor)
- src/components/transaction/DailyCashModal.tsx:294-298 → :337 ve :423
- src/lib/excelImport.ts:149 (regex tek ayraç grubu → "1,234.56" hiç eşleşmiyor), :159-166 (virgül gören her sayıyı ondalık sayıyor) → tüketici src/hooks/useDataImport.ts:255-271 (bracketAmount **exchange_rate'i türetiyor**)
- Doğru referans: src/lib/currency.ts:466-477 cleanAmountInput, :64-100 parseCurrency; src/components/transaction/QuickTransactionBar/hooks/useQuickTransactionForm.ts:262-268 (gerekçe yorumuyla düzeltilmiş hâli)

**KULLANICI NE GÖRÜR** — TR locale'de "2692.828" yazılan/yapıştırılan tutar 2.692.828 olarak kaydediliyor; roundCurrency yanlış parse'tan SONRA çalıştığı için hiçbir şey kurtarmıyor. Excel import tarafında EN biçimli "1,234 USD" parantez tutarı 1.234 okunup kaydedilen kur ~1000x sapıyor (medium; tetikleyici dar).

**DÜZELTME** — Üç handleAmountChange'i `setAmount(cleanAmountInput(text))` yap (ExchangeRateBar'ın kur alanı hariç; o 4-6 ondalık ister). excelImport.ts:149 regex'ini `([+-]?[\d.,]+)` yapıp parse'ı parseCurrency'ye devret; NaN'da amount'u null bırak (0'a düşürme) ve satırı atlanan listesine hata sebebiyle yaz.

#### A3. İşlemin para birimi çözümünde cari/personel bacağı yok sayılıyor (server COALESCE zinciri client'a taşınmamış)

**NE** — Client tarafı işlemin para birimini yalnız hesaptan (veya source_currency'den) çözüyor; hesap bacağı OLMAYAN tipler (cari_alis, cari_satis, iadeler, personel_gider, personel_satis) için ya ana para birimi sembolü basılıyor ya da tutar çevrilmeden toplanıyor. Üstelik ilgili select'ler cari/personel currency'sini hiç çekmiyor.

**NEREDE**
- src/lib/currency.ts:683, 700-701 (getCrossCurrencyDisplay → mainCurrency undefined) · kırık tüketiciler: src/app/islemler/index.tsx:117,133,140 ve src/components/reports/EntityTransactionList.tsx:134,167 (Raporlar > Cari/Personel sekmeleri)
- src/app/raporlar/kategori/[id].tsx:219 ve :492 (`islem.hesap?.currency ?? baseCurrency` → convertCurrency no-op, 1.000 USD alış 1.000 TL sayılıyor)
- src/app/arama.tsx:494 (`source_currency || 'TRY'` — ana para birimi USD olsa bile sabit ₺; aynı dosya :500 doğru yapıyor)
- Eksik veri: src/hooks/useIslemler.ts:48-52, 503-506, 905 ve src/hooks/useCategoryReport.ts:696-702, 889-895 (cari/personel select'lerinde currency yok)
- Sunucudaki doğru kural: supabase/migrations/20260529010000_fix_report_currency_resolution.sql:113, 142-146

**KULLANICI NE GÖRÜR** — USD cariye kesilen 1.000 USD'lik fatura İşlemler listesinde ve Raporlar > Cari'de "₺1.000", cari detayında "$1.000". Kategori drill-down'ında üst karttaki RPC toplamı (doğru çevirili) ile alttaki filtreli toplam tutmuyor.

**DÜZELTME** — getCrossCurrencyDisplay'e tip-bazlı entity fallback ekle (cari_* → cari?.currency, personel_* → personel?.currency) ve erken çıkışta onu döndür; select'lere cari(currency) ve personel(currency) ekle; arama.tsx:494 ve kategori/[id].tsx:219/492'yi bu zincire bağla — migration 20260529010000'in COALESCE(hesap, cari, personel, 'TRY') kuralıyla birebir aynı olsun. En temizi: tek bir getIslemCurrency(islem) helper'ı çıkarıp 3 yeri ona bağlamak.

#### A4. Çevrilmemiş ham tutar, hedef para biriminin etiketiyle gösteriliyor

**NE** — İki yüzey ham `islem.amount` (kaynak/hesap para birimi) değerlerini cari/personel para birimi sembolüyle yazıyor; aynı ekranın hemen altındaki liste ise aynı işlemleri getCrossCurrencyDisplay ile ÇEVİRİP gösteriyor.

**NEREDE**
- src/components/reports/EntitySummaryCard.tsx:36,40,44,48,52,56,77,81,85,89,109,112 (hepsi kur'suz reduce) → :172,187,201,210,284 (`entity.currency` ile format) · altında render edilen doğru taraf: src/components/reports/EntityTransactionList.tsx:167 · birlikte basıldığı yerler: src/components/reports/tabs/CariTabContent.tsx:84+101, src/components/reports/tabs/PersonelTabContent.tsx:75+93
- src/components/cariler/CariPreviewModal.tsx:199 (+ :54 select'i kur alanlarını hiç çekmiyor) · doğru muadili: src/app/cariler/[id].tsx:132-156 getCariDisplayAmount/getCariSubAmount

**KULLANICI NE GÖRÜR** — Özet kartı "Toplam Satış: €3.200,00" derken hemen altındaki satırlar "€100,00" gösteriyor (kur katı kadar sapma). Cariye uzun basınca açılan önizlemede "€3.200,00", detay sayfasında aynı kayıt "€100,00".

**DÜZELTME** — EntitySummaryCard'ın reduce'larını getCrossCurrencyDisplay(tx).mainAmount üzerinden yap (listeyle aynı motor). CariPreviewModal:54 select'ine source_currency/target_currency/exchange_rate ekleyip :199'u getCrossCurrencyDisplay'e bağla; eklenemiyorsa tutarı hiç göstermeyip tip+tarih ile yetin.

#### A5. Negatif para rakamlarında işaret sessizce kayboluyor

**NE** — formatCurrency her zaman mutlak değer yazar (currency.ts:232-233); rapor/trend yüzeylerinde bu telafi edilmemiş: pozitifte '+' basılıyor, negatifte hiçbir şey basılmıyor — bazı net/fark kolonlarında hiç işaret yok.

**NEREDE**
- src/components/reports/tabs/GenelTabContent.tsx:97 (asimetrik '+'), :290, :334 (hiç işaret yok)
- src/components/reports/QuickInsights.tsx:39 · src/components/reports/EntitySummaryCard.tsx:272
- Excel çıktısı (metin hücre, ayırt edici tek şey renk): src/lib/reportExcelExport.ts:827, 883, 898
- src/app/raporlar/net-varlik-trend.tsx:24-27 fmtValue (gram dalı işareti KORUR, para dalı kaybeder), :133 delta, :364 Net kolonu — medium
- Hazır çözüm: src/lib/currency.ts:278-281 formatCurrencyWithSign; kalıbı zaten uygulayan yer: src/hooks/useComparisonReport.ts:216-219

**KULLANICI NE GÖRÜR** — −50.000 TL net değer ile +50.000 TL net değer **birebir aynı metin**; tek ayırt edici renk. Excel'de renk fark edilmediğinde zarar/borç rakamı kâr/alacak okunuyor. Net Varlık Trendi'nde düşüş "₺5.000", artış "+₺5.000"; mercek gram'a çevrilince aynı sayı "-100 gr" oluyor.

**DÜZELTME** — Bu 8+ yerde useComparisonReport.ts:219 kalıbını uygula: `v < 0 ? formatCurrencyWithSign(v, ccy) : formatCurrency(v, ccy)`. Excel'de string yerine sayısal değer + `z:` para biçimi yaz. net-varlik-trend'de fmtValue/fmtCompact'ı işaret-koruyan hâle getir ve :133'teki `{up ? '+' : ''}` asimetrisini kaldır.

#### A6. Eski çapraz-kur işlemini düzenlemek tarihsel kuru BUGÜNÜN kuruyla eziyor

**NE** — handleSave, edit modunda da checkCrossCurrency'yi çağırıyor; ExchangeRateBar işlemin kayıtlı kurunu değil bugünün kurunu ön-dolduruyor; onay sonrası update reverse(old)+apply(new) ile bakiyeyi kur farkı kadar kaydırıyor.

**NEREDE** — src/components/transaction/QuickTransactionBar/hooks/useTransactionSubmit.ts:777-780 (edit dalları 800+; checkCrossCurrency:393-445'te isEditMode guard'ı yok), :1143-1170 · src/components/transaction/ExchangeRateBar.tsx:86-131 (prefill yalnız güncel rates'ten; işlemin kuru prop olarak bile gelmiyor) · src/components/transaction/QuickTransactionBar/hooks/useQuickTransactionForm.ts:222-223, 287, 576-578 (edit'te exchange_rate hiç okunmuyor) · src/hooks/useIslemler.ts:691-704

**KULLANICI NE GÖRÜR** — 6 ay önceki bir EUR ödemesinin sadece açıklamasını düzeltmek için kaydete basınca kur barı açılıyor; onaylayınca carinin bakiyesi değişiyor. Barı iptal ederse kayıt hiç yapılmıyor. Hiçbir "eski kur / yeni kur" karşılaştırması gösterilmiyor.

**DÜZELTME** — Edit modunda checkCrossCurrency'yi yalnız tutar/hesap/karşı-taraf değiştiyse tetikle; tetiklenirse ExchangeRateBar'a işlemin MEVCUT exchange_rate'ini prop geçip onu ön-doldur, bugünün kurunu ayrı bir "güncel kur: X" ipucu yap. Kur gerçekten değişecekse eski/yeni kur ve bakiye etkisini açıkça onaylat.

### MEDIUM

#### A7. "Kur bulunamadı" için repoda beş ayrı politika

**NE** — convertCurrency null döndüğünde aynı uygulama içinde beş farklı davranış var: `?? 0` (bakiyeyi sıfır sayar), `?? balance` / `return acc + balance` (1:1 ekler), `?? v` (ham TRY'yi baz para birimi sanır), hariç-tut+bayrak (doğru kabul edilmiş politika), atla+warn. Sunucu tarafında altıncısı: `COALESCE(kur, 1)`.

**NEREDE**
- `?? 0` ve aynı reducer içinde 1:1: src/app/(tabs)/index.tsx:195-203 (gösterim :514, :519) · `~₺0,00` satırları: src/app/(tabs)/index.tsx:563-566, src/app/(tabs)/cariler.tsx:803-806, src/app/(tabs)/personel.tsx:596-599, src/app/hesaplar/[id].tsx:837-839 (low)
- `?? balance` (1:1): src/components/reports/tabs/GenelTabContent.tsx:66-74 (aynı kartta :132 hariç-tut politikasından geliyor, :165-172 uyarı çıkıyor) · src/app/raporlar/genel.tsx:43-51, 94, 100 (Excel'e de gidiyor) · src/hooks/useHesaplar.ts:205-214 useTotalBalance (low: şu an ölü kod, ayrıca pasif/arşivli hesapları da katıyor)
- `?? v` (ham TRY'yi baz para birimi etiketiyle gösterir): src/hooks/useAnalyticsSummary.ts:152-153, useAnalyticsTrend.ts:160, useAccountReport.ts:107-108 ve 273-274, useCategoryReport.ts:222-223, 474-475, 1188-1189, useProductReport.ts:138-141, useNetWorthTrend.ts:130, useIslemler.ts:873-878, useComparisonReport.ts:158-162
- Doğru politika: src/hooks/useFinancialSummary.ts:77-91, 104, 125, 146, 190 (conversionIncomplete) · src/hooks/useCashFlowByCategory.ts:226-233 (atla+warn) · low: bayrak ana sayfada hiç okunmuyor — src/app/(tabs)/index.tsx:218, 434-437 (Raporlar ve Net Varlık Trend gösteriyor: GenelTabContent.tsx:165-172, net-varlik-trend.tsx:171-174; metin hazır: reports.json:101)
- Eksik anahtar mümkün: supabase/functions/fetch-exchange-rates/index.ts:17, 62-76, 133-134 · SQL: supabase/migrations/20260529010000...sql:43-46, 145

**KULLANICI NE GÖRÜR** — Kurlar yüklenemediğinde 1.000 EUR'luk hesap grup toplamına ya 0 ya 1.000 katkı yapıyor; aynı ekranın Genel Durum kartı o bakiyeyi hariç tutup uyarı gösterirken alt toplam onu 1:1 içeriyor. Baz para birimi USD olan kullanıcıda 43.000 TL'lik gelir raporlarda "$43,000.00" (~43x şişik) yazıyor, hiçbir uyarı yok. Sıfır olmayan bakiyenin karşılığı "~₺0,00" görünüyor.

**DÜZELTME** — TEK politika belirle ve her yüzeyde uygula: useFinancialSummary deseni (null → kalemi hariç tut + conversionIncomplete bayrağı + "bazı döviz bakiyeleri çevrilemedi" uyarısı). `?? 0`, `?? balance`, `?? v` ve `return acc + balance` dallarının hepsini kaldır; satır bazında "~₺0,00" yerine satırı hiç render etme. Ana sayfada da conversionIncomplete'i oku ve mevcut t('reports:summary.conversionIncomplete') metnini göster. useTotalBalance'ı ya sil ya politikaya bağla + useHesaplar(false,false) ile çağır.

#### A8. Çoklu-kalem ekranlarında footer toplamı karışık para birimlerini düz topluyor

**NE** — Her satır ayrı bir hesap/personel/ürüne ait olduğu ve tutar o varlığın para biriminde okunduğu hâlde footer toplamı kur çevirmeden toplayıp tek argümanlı formatCurrency ile ana para birimi sembolü basıyor.

**NEREDE**
- src/components/transaction/DailyCashModal.tsx:418-427, 457 (satırlar hesap bazlı, :88-95)
- src/app/personel/toplu-odeme.tsx:188-197, 468 (satır doğru: :440 personel.currency)
- src/app/personel/toplu-gider.tsx:100-109, 348
- src/app/urunler/toplu-giris.tsx:173-175, 442, 448, 471 ve src/app/urunler/toplu-cikis.tsx aynı satırlar (satır/picker doğru: :580 urun.currency; ön-doldurma :123 çevirisiz, input sembolü :405 ana para birimi)
- Doğru desen: src/hooks/useFinancialSummary.ts:82-91 · src/app/(tabs)/index.tsx:196-203 (grup toplamlarında convertCurrency denemesi) · src/app/(tabs)/cariler.tsx:550-562 (byCur deseni)

**KULLANICI NE GÖRÜR** — 100 USD + 100 TRY girip footer'da "₺200,00" görüyor (gerçek ~₺3.400). Ürün ekranlarında picker'da "$10.00" gösterilen fiyat aynen input'a doluyor ve üstüne ₺ sembolü konuyor.

**DÜZELTME** — Ya satır bazında convertCurrency ile baz para birimine çevirip topla (null → kalemi hariç tut + uyarı), ya toplamı para birimi başına ayrı satır olarak göster (byCur deseni), ya da ekranı tek para birimine kilitle. Ürün ekranlarında input sembolünü satırın ürününün currency'sine bağla (:405 ile :580 çelişkisini kapat).

#### A9. formatCurrency'ye ikinci argüman verilmiyor / sabit ₺ varsayımı

**NE** — Bazı gösterim ve **giriş** yüzeyleri para birimini geçmediği için ana para birimi sembolü (veya sabit ₺) basılıyor; tutar çevrilmediği için sayı yanlış etiketli.

**NEREDE**
- src/components/transaction/ProductDetailModal.tsx:15-23 (currency prop'u YOK), :80, :84, :88 — çağıranların hepsi aynı sayfada TransactionRow'a currency geçiyor: src/app/cariler/[id].tsx:1432 (vs :964/:1247), src/app/hesaplar/[id].tsx:1024 (vs :276/:894), src/app/islemler/index.tsx:570 (vs :140), src/components/reports/EntityTransactionList.tsx:212 (vs :167); veri elde: src/hooks/useUrunHareketler.ts:679 · doğru muadil: src/components/transaction/QuickTransactionBar/components/UrunPickerModal.tsx:36,63,668
- src/app/islemler/duzenle/[id].tsx:441 ve :790 (yalnız personel argümansız; aynı dosya :322/:363/:406/:594/:692 doğru; veri: src/hooks/usePersonel.ts:21,104 · doğru muadil: QuickTransactionBar/sections/EntityDisplaySection.tsx:166)
- Sabit ₺ kökü: src/constants/currencies.ts:28-32 (`if (!code) return '₺'` — getCurrentCurrency'e hiç bakmıyor) → src/components/ui/CurrencyInput.tsx:33,38 ve src/components/ui/AmountInput.tsx:25-26,39; currency geçmeyen 4 çağrı: src/app/islemler/gelir.tsx:179-184, src/app/islemler/duzenle/[id].tsx:286-293, src/app/personel/toplu-gider.tsx:328-333, src/app/personel/toplu-odeme.tsx:447-452
- src/components/ui/TransactionRow.tsx:122 (currency undefined ise ana para birimi)

**KULLANICI NE GÖRÜR** — EUR carinin faturasında satırda "× €5,00", kutu ikonuna basınca aynı kalem "× ₺5,00". EUR maaşlı personelin 1.500 EUR borcu düzenleme ekranında "₺1.500" (bir üst satırdaki hesap "€..." gösteriyor). Ana para birimi USD olan kullanıcı tutarı ₺ prefixli bir alana giriyor, alan içi biçimlendirme ise en-US ayraçlarıyla çalışıyor.

**DÜZELTME** — currencies.ts:29'da `'₺'` yerine `getCurrentCurrency().symbol` döndür (formatCurrency'nin varsayılanıyla aynı olsun). ProductDetailModal'a currency prop'u ekleyip 4 çağrı yerinde TransactionRow'a verilen AYNI değeri geçir. duzenle/[id].tsx:441 ve :790'a personel.currency ekle. CurrencyInput placeholder'ını `formatAmountForInput(0,2)` ile locale'den üret ('0,00' sabitini kaldır).

#### A10. Aynı para birimi ekranda iki ayrı ayraçla: formatCurrency'nin iki dalı ve dashboard'un elle ayraç hesabı

**NE** — formatCurrency ikinci argümanla USD/EUR/GBP için koşulsuz `en-US` kullanıyor, argümansız dalda ise ana para biriminin locale'ini (EUR → de-DE) kullanıyor. Dashboard kartları ayraçları elle hesaplıyor ve 'de' locale'ini İngilizce grubuna sokuyor.

**NEREDE**
- src/lib/currency.ts:247-253 (en-US sabiti) vs :262-267 (currencyConfig.locale) · src/hooks/useSettings.ts:27-32 (EUR → de-DE) · src/lib/currency.ts:57-62 getLocaleSeparators (EUR için ondalık virgül — parseCurrency/cleanAmountInput/formatAmountForInput hepsi buna dayanıyor)
- src/components/dashboard/HeroCard.tsx:29-30 (+ :77,:89,:101 formatCurrency), CashFlowCard.tsx:30-31, IncomeExpenseCard.tsx:28-29, FinancialDetailModal.tsx:69-73 (değişken adı **isEnglish** ama içine 'de' konmuş)
- Çakışan örnek aynı ekranda: src/app/(tabs)/index.tsx:561 vs :519
- low: src/lib/currency.ts:346 formatPercentage ve :370-374 formatCurrencyCompact `startsWith('tr')` ile ayraç seçiyor (aynı dosyanın getLocaleSeparators'ıyla çelişiyor)

**KULLANICI NE GÖRÜR** — Ana para birimi EUR olan kullanıcı hesap satırında "€1.234,56", grup toplamında/hero kartında "€1,234.56" görüyor — binlik ve ondalık tam ters. Girdiği "1234,56" doğru okunuyor ama ekran ona noktayı ondalık diye geri yazıyor. Yüzdeler "45.5%", normal tutarlar "1.234,56".

**DÜZELTME** — Para biriminden locale'e TEK eşleme çıkar (TRY:tr-TR, USD:en-US, EUR:de-DE, GBP:en-GB, XAU/XAG:tr-TR) ve formatCurrency'nin İKİ dalı da onu kullansın; 'en-US' sabitini kaldır. 4 dashboard dosyasındaki elle ayraç hesabını silip getLocaleSeparators()'ı geçir. formatPercentage/formatCurrencyCompact'ta `startsWith('tr')` kontrollerini getLocaleSeparators().decimal ile değiştir.

#### A11. Para birimi metne gömülü: "Nominal ₺" sekmesi ana para birimini yalanlıyor

**NE** — Net Varlık Trendi'nin nominal merceği tutarları ANA para biriminde çiziyor ama sekme etiketi sabit "Nominal ₺", açıklaması "TL cinsinden birebir tutar." / "The plain amount in Turkish lira."

**NEREDE** — src/i18n/locales/tr/reports.json:43, 59 ve src/i18n/locales/en/reports.json:43, 59 · src/app/raporlar/net-varlik-trend.tsx:81 (dispCcy = baseCurrency), :62-70 (repricing desteklenmiyorsa TEK sekme bu) · src/hooks/useNetWorthLenses.ts:57-58 (repricing yalnız TRY-base) · src/hooks/useSettings.ts:27-32 (TRY/USD/EUR/GBP)

**KULLANICI NE GÖRÜR** — Ana para birimi USD olan kullanıcı "$214,000.00" tutarlarının üstünde "Nominal ₺" sekmesi ve "Turkish lira" açıklaması görüyor. Reel/USD/EUR/Altın mercekleri yalnız TRY-base'de açıldığı için sorun TAM her zaman görünen sekmede.

**DÜZELTME** — lensNominal'i interpolasyonlu yap ("Nominal {{ccy}}") ve `t(..., { ccy: getCurrencySymbol(baseCurrency) })` ile besle; lensDesc.nominal'i para-birimi-nötr yaz (tr: "Tutarın birebir hâli.", en: "The plain amount in your main currency."). "Reel ₺" TRY-base'e kilitli olduğu için orada ₺ kalabilir.

#### A12. Taksit özetinde tutar tek para birimine filtreli, plan ADEDİ tüm para birimlerini sayıyor

**NE** — Özet kutusunda tutar `p.currency === cur` filtresiyle toplanıyor, yanındaki adet filtresiz.

**NEREDE** — src/app/taksit/index.tsx:77-83 (tutar) vs :88-89 (tahsilAdet/odeAdet) · gösterim :155-169 · karşılaştırma: src/components/cariler/CariMiniDashboard.tsx:166-179 (aynı kural, adet göstermediği için çelişmiyor)

**KULLANICI NE GÖRÜR** — "TAHSİL EDİLECEK ₺10.000 · 5 plan" — oysa 10.000 TL yalnız 3 planı kapsıyor; USD'li 2 planın tutarı hiçbir yerde görünmüyor ve dışarıda kaldığına dair işaret yok.

**DÜZELTME** — tahsilAdet/odeAdet'e de `p.currency === cur` filtresini ekle; birden fazla para birimi varsa kutunun altına "+2 plan diğer para birimlerinde" notu koy.

### LOW

#### A13. calculateTargetAmount'ın yuvarlamasız yerel kopyaları

**NE** — Çapraz-kur dönüşümünün 3 kopyası var; ikisi roundCurrency uygulamıyor ve geçersiz kurda merkezî helper'ın THROW politikası yerine sessizce ham tutara düşüyor.

**NEREDE** — src/lib/excelExport.ts:213-225 (transfer hedef dalı; :246-267 açılış bakiyesi bu yuvarlanmamış etkilerden türetiliyor) · src/app/hesaplar/[id].tsx:149-161 ve :446-464 (iki ayrı yeniden-yazım; :181-198 de buna bağlı) · aynı dosyada doğru kopya: src/lib/excelExport.ts:280-290 · tek kaynak: src/lib/currency.ts:608-644 · yazma yolu politika ayrışması: src/hooks/useImportBalance.ts:46-54 (rate yoksa amount) vs src/lib/islemBalanceOps.ts:39-46 (throw)

**KULLANICI NE GÖRÜR** — Excel hesap ekstresinde dönem toplamı ve kapanış bakiyesi uygulamadaki bakiyeden kuruşlarca sapıyor (mutabakat özelliği olan bir uygulamada görünür tutarsızlık); kur bozuk satırlarda hesap detayı/yürüyen bakiye DB bakiyesiyle ayrışıyor.

**DÜZELTME** — Üç kopyayı da calculateTargetAmount + try/catch ile değiştir (cariler/[id].tsx:132-148 ve personel/[id].tsx:118-129 deseni). useImportBalance ile islemBalanceOps'un eksik-kur politikasını tek kurala bağla.

#### A14. İçe aktarma ekranı sayı biçimleri ve yüzde biçimi merkezî katmanı atlıyor

**NE** — Aynı ekran ailesinde üç biçimlendirme yolu var: locale ARGÜMANSIZ toLocaleString (cihaz locale'i), `i18n.language === 'tr' ? 'tr-TR' : 'en-US'` (dile bakar, para birimine bakmaz), ve kullanılmayan formatNumber/formatCurrency. Ayrıca yüzdeler her yerde TR ön-ekiyle ve zorunlu nokta ondalıkla basılıyor.

**NEREDE**
- Argümansız: src/components/dataImport/steps/StepResult.tsx:102,107,113,119,131,138 · src/components/dataImport/helpers/PhaseItemEnhanced.tsx:43-44
- Dile bakan (TUTAR basanlar dahil): src/components/dataImport/helpers/ResultItem.tsx:10, SkippedTransactionItemSimple.tsx:48, TransactionItem.tsx:45 · src/components/import/SkippedTransactionCard.tsx:75 · steps/Step2Preview.tsx:72, StepImporting.tsx:56 · src/hooks/useDataImport.ts:154
- Yüzde ön-eki (ekran): src/components/ui/CategoryReportCard.tsx:380,494,592 · AccountReportCard.tsx:70 · IncomeSourceCard.tsx:65 · ProductDetailModal.tsx:84 · UrunPickerModal.tsx:540,556,669 · QuickUrunBar.tsx:475 · UrunForm.tsx:172 · OcrReviewItem.tsx:187 · raporlar/alis-satis.tsx:469 · urunler/toplu-cikis.tsx ve toplu-giris.tsx:430,585
- Yüzde ön-eki (DIŞA AKTARMA): src/lib/pageExports.ts:232,239 · src/lib/reportExcelExport.ts:511,704 · src/lib/excelExport.ts:959,1121
- Tek kaynak: src/lib/currency.ts:310-316 formatNumber, :329+ formatQuantity, :57-62 getLocaleSeparators · aynı uygulamada son-ek kullanan yerler: Step2Preview.tsx:178, StepImporting.tsx:52

**KULLANICI NE GÖRÜR** — Cihazı en-US olan Türkçe kullanıcı içe aktarma sonucunda "1,234" görürken hemen yanındaki satır "1.234" gösteriyor; ana para birimi USD olsa bile tutarlar TR ayracıyla basılıyor. Türkçe kullanıcı "%45.0" (beklenen "%45,0"), İngilizce kullanıcı "%45.0" (beklenen "45.0%") görüyor — Excel/PDF çıktısında da aynı.

**DÜZELTME** — Adet/sayaçlarda formatNumber, tutarlarda formatCurrency(amount, currency) kullan; argümansız toLocaleString çağrılarını mutlaka değiştir. currency.ts'e `formatPercent(value, decimals)` ekle (Intl `style:'percent'` işaret konumunu ve ayracı kendisi çözer) ve ~20 çağrı yerini + Excel/PDF üreticilerini ona bağla.

---

## B. İngilizce çeviri

### HIGH

#### B1. upperTr() dil kontrolsüz: İngilizce arayüzün TÜM büyük-harf etiketlerinde Türkçe noktalı İ

**NE** — upperTr her küçük 'i'yi koşulsuz noktalı 'İ'ye çeviriyor; 121 çağrı yerinin neredeyse tamamı doğrudan t() çıktısını sarıyor ve hiçbirinde i18n.language kontrolü yok.

**NEREDE** — Kök: src/lib/turkishTextUtils.ts:45-54 (yorumu amacın yalnız Türkçe olduğunu söylüyor; kardeş normalizeTurkish:38-43 doğru tablo-tabanlı deseni gösteriyor). En geniş yüzeyler: src/components/ui/Input.tsx:125 ve :150 (HER form etiketi), src/components/ui/TabHeader.tsx:131 (HER sayfa başlığı), src/components/ui/Collapsible.tsx:44, AddEntityButton.tsx:37-76, CurrencyPicker.tsx:104,171, CategoryPicker.tsx:298, ui/TransactionRow.tsx:135, ui/CategoryReportCard.tsx:349,430,559 (kullanıcının kendi yazdığı İngilizce kategori adları da bozuluyor), dashboard/IncomeExpenseCard.tsx:44-90, CashFlowCard.tsx:45-91, FinancialDetailModal.tsx:108,142, cariler/CariMiniDashboard.tsx:100-203, export/ExportSheet.tsx:80-87, PdfExportSheet.tsx:73-78, UrunExportSheet.tsx:67-74, reports/ReportPeriodBar.tsx:34-38, PeriodNavigator.tsx:185, QuickTransactionBar/sections/HeaderSection.tsx:216,233, urunlerPage/ProductCategoryFilter.tsx:59, raporlar/index.tsx:51-55, raporlar/gelir-gider.tsx:42-46, raporlar/alis-satis.tsx:48-52, nakit-akisi/index.tsx:36-40, urunler/index.tsx:97-101,633,656,665, urunler/[id].tsx:565,574. Kardeşi: src/components/ui/Avatar.tsx:30 (toLocaleUpperCase('tr-TR') sabit).

**KULLANICI NE GÖRÜR** — Aşağıdaki tabloda "İngilizce arayüzde basılan" kolonu **şu an ekranda görünen** metin. Not: buradaki düzeltme sözlük değil KOD düzeltmesidir; EN değerleri doğrudur.

| Anahtar yolu | Mevcut EN değeri | İngilizce arayüzde basılan (hatalı) |
|---|---|---|
| auth:register.confirmPassword | Confirm Password | CONFİRM PASSWORD |
| auth:forgotPassword.verificationCode | Verification Code | VERİFİCATİON CODE |
| clients:form.noteOptional | Note (Optional) | NOTE (OPTİONAL) |
| accounts:form.descriptionOptional | Description (Optional) | DESCRİPTİON (OPTİONAL) |
| accounts:form.creditLimitOptional | Credit Limit (Optional) | CREDİT LİMİT (OPTİONAL) |
| common:dashboard.netProfitLoss | Net Profit/Loss | NET PROFİT/LOSS |
| common:date.thisWeek / thisMonth / thisYear | This Week / This Month / This Year | THİS WEEK / THİS MONTH / THİS YEAR |
| common:period.allTime | All Time | ALL TİME |
| reports:period.daily · products:period.daily | Daily | DAİLY |
| products:stock.quantity | Quantity | QUANTİTY |
| reports:category.uncategorized | Uncategorized | UNCATEGORİZED |
| transactions:vade.pick | Pick | PİCK |
| transactions:vade.temiz | Nothing overdue | NOTHİNG OVERDUE |

**DÜZELTME** — upperTr'ı dile bağla (tek noktada 121 çağrı yeri düzelir):
`if (!i18n.language?.startsWith('tr')) return text.toUpperCase();` ardından mevcut satır. i18next lib katmanından import edilebiliyor (date.ts örneği). KULLANICI VERİSİ yazma yolunda (src/app/kategoriler/ekle.tsx:70, kategoriler/duzenle/[id].tsx:79) davranış değişmemeli → orayı ayrı bir upperTrData fonksiyonuna taşımak en güvenlisi. Avatar.tsx:30'daki toLocaleUpperCase('tr-TR') de aynı helper'a çevrilmeli.

### MEDIUM

#### B2. Excel içe aktarma motoru sabit Türkçe metin üretiyor; hazır çeviri anahtarları ölü

**NE** — Atlanan satır gerekçeleri ve hata metinleri excelImport.ts/useDataImport.ts içinde sabit Türkçe string olarak üretilip UI'da HAM basılıyor; aynı listenin 12 kardeş satırı i18n'den geliyor. İndirilen "Atlanan İşlemler" Excel'inin 12 başlığı ve sayfa adı da sabit Türkçe.

**NEREDE**
- Üretim: src/lib/excelImport.ts:452,455,460,476,479,484,500,503,508,513 (tarih parser), :793,798,808 (tutar), :836 (entity), :849,854,863,867 (tarih), :884,887 (tip), :1004 (parse hatası) · src/hooks/useDataImport.ts:105,134,139,244,292,306,309,321,377,385,393,396,458,459,693 · src/hooks/useImportEntities.ts:185,245,303,368
- Ham basıldığı yerler: src/components/dataImport/helpers/SkippedTransactionItemSimple.tsx:51-56 · src/components/import/SkippedTransactionCard.tsx:81 · src/components/import/PendingTransactionForm.tsx:155 · src/components/dataImport/steps/StepResult.tsx:238-240 ve Step2Preview.tsx:259-261 (translateError yalnız 'HEADER_NOT_FOUND'u çeviriyor — src/app/ayarlar/data-import/index.tsx:85-90) · DB'ye de yazılıyor: src/app/ayarlar/data-import/index.tsx:381
- Excel başlıkları: src/lib/excelImport.ts:1333-1350, 1391 (fonksiyon translations parametresi hiç almıyor) · çağıran t()'ye sahip: src/app/ayarlar/data-import/index.tsx:495 · ayrıca :1409-1417 gerekçeleri Türkçe prefix'e startsWith ile eşliyor (çeviri gelince kırılır)
- Doğru desen aynı dosyalarda: useDataImport.ts:144,154,170,178,184,195,202,211,217,551,584,618 · src/lib/excelExport.ts:159,663,748 (translations objesi) · src/lib/mutabakat/types.ts:21-23 (motor metin üretmez, yapısal uyarı döndürür)
- Ölü anahtarlar: en/settings.json:494-506 dataImport.skipReasons (12 anahtar; missingEntity ASLA kullanılamıyor çünkü excelImport.ts:836 entityError'ı her zaman set ediyor); skipReasons'da invalidDate/invalidAmount hiç yok

**KULLANICI NE GÖRÜR** — İngilizce arayüzde aynı listede yan yana "Account not found: \"Ziraat\"" (İngilizce) ve "Tutar boş veya bulunamadı" / "Geçersiz tarih" / "Tanınmayan tarih formatı: \"x\"" (Türkçe). İndirdiği Excel tamamen Türkçe başlıklı ("SATIR NO", "ATLANMA NEDENİ", sayfa adı "Atlanan İşlemler").

**DÜZELTME** — Motoru metin üretmekten çıkar: dateError/amountError/entityError'ı `{ code, params }` yapısına çevir (mutabakat motorunun deseni), useDataImport'ta `i18n.t('settings:dataImport.skipReasons.<code>', params)` ile üret, :134/139/144/458/459'daki ham geçişleri kaldır. skipReasons'a eksik anahtarları ekle: invalidDate, invalidAmount, amountEmpty, amountInvalidValue, amountTooSmall, dateMissing, dateExcelInvalid, dateUnrecognized, dateUnexpectedType, typeMissing, invalidMonth, invalidDay, dbError, batchInsertError, silentFailure, unknownError. exportSkippedTransactionsToExcel'e translations parametresi ekle (excelExport.ts deseni) ve :1409-1417 eşlemesini metin yerine koda dayandır. Geriye dönük: DB'de Türkçe yazılı eski skip_reason kayıtları için render'da `t(reason, { defaultValue: reason })` ya da additive skip_reason_code kolonu.

#### B3. Çoğul (plural) varyantları yok: İngilizce'de "1 transactions", "1 Accounts"

**NE** — 43 yerde t(key, { count }) çağrılıyor ama 17 namespace × 2 dilde tek bir _one/_other varyantı yok (yalnız analytics.json doğru yapılmış). Çökme yok; İngilizce tekil durum gramer dışı.

**NEREDE** — Sözlük: src/i18n/locales/en/reports.json:134-140 (counts.*), en/common.json (search.resultCount, archive.messages.itemCount), en/staff.json (messages.personnelCount, leave.remainingDays/dayCount) · doğru referans: src/i18n/locales/en/analytics.json:28-38 (+ src/widgets/finance/FinanceKPIGrid.tsx:154) · en görünür çağrılar: src/components/reports/tabs/GenelTabContent.tsx:184,223,263,307 · src/components/ui/AccountReportCard.tsx:53 · src/components/ui/CategoryReportCard.tsx:365,477,478,535 · src/components/ui/IncomeSourceCard.tsx:48 · src/app/raporlar/alis-satis.tsx:364 · src/app/raporlar/gelir-gider.tsx:301 · src/app/(tabs)/personel.tsx:638,756 · src/app/arama.tsx:907 · src/app/arsiv/index.tsx:524 · src/components/reports/EntityPicker.tsx:188-189

**KULLANICI NE GÖRÜR** — Tek hesabı/tek carisi olan yeni İngilizce kullanıcı Raporlar > Genel'in dört özet kartında birden "1 Accounts", "1 Credit Cards", "1 Contacts", "1 Staff" görüyor; rapor kartlarında "1 transactions", aramada "1 results found", arşivde "1 items in archive", personelde "1 staff members" ve "1 days leave".

**DÜZELTME** — Kod değişikliği gerekmiyor, yalnız sözlük. En görünür 10 anahtarla başla:

| Anahtar yolu | Mevcut EN değeri | Önerilen EN değeri |
|---|---|---|
| reports:counts.transaction | {{count}} transactions | _one: {{count}} transaction · _other: {{count}} transactions |
| reports:counts.account | {{count}} Accounts | _one: {{count}} Account · _other: {{count}} Accounts |
| reports:counts.creditCard | {{count}} Credit Cards | _one: {{count}} Credit Card · _other: {{count}} Credit Cards |
| reports:counts.client | {{count}} Contacts | _one: {{count}} Contact · _other: {{count}} Contacts |
| reports:counts.personnel | {{count}} Staff | _one: {{count}} Staff Member · _other: {{count}} Staff |
| common:search.resultCount | {{count}} results found | _one: {{count}} result found · _other: {{count}} results found |
| common:archive.messages.itemCount | {{count}} items in archive | _one: {{count}} item in archive · _other: {{count}} items in archive |
| staff:messages.personnelCount | {{count}} staff members | _one: {{count}} staff member · _other: {{count}} staff members |
| staff:leave.remainingDays | {{count}} days leave | _one: {{count}} day leave · _other: {{count}} days leave |
| staff:leave.dayCount | (aynı kalıp) | _one/_other çifti |

Anahtar kümesi tr/en birebir kalsın (tr'de iki varyantı aynı metinle ekle). Salt sayı gösteren parantezli anahtarlarda (common:search.showAll, reports:entityTransactions.viewAll, transactions:productItems.more) çoğul gerekmez — istenmiyorsa option adını `num` yapıp i18next'in çoğul aramasını hiç tetiklemeyin.

#### B4. Çekirdek kavramlar için tek EN terim kararlaştırılmamış (aynı kayıt/kart iki-üç isimle)

**NE** — TR'de tek olan kavramlar İngilizce'de birden fazla terime dağılmış; en somut kanıtlar aynı kart/aynı modal içinde yan yana çıkıyor.

**NEREDE** — src/components/reports/tabs/GenelTabContent.tsx:256+262 (tek Card içinde "CLIENT STATUS" + "{{count}} Contacts") · src/components/cariSharing/ShareCodeModal.tsx:92+97 (başlık "Share Contact", etiket "Client") · src/app/hesaplar/[id].tsx:208,213 vs işlem listelerinin transactions:types.* vs src/app/personel/[id].tsx:76 (aynı personel_tahsilat üç ekranda üç isim) · src/components/dashboard/HeroCard.tsx:58 ("Net Worth") vs GenelTabContent.tsx:100 ("Net Value") — aynı manşet sayı · src/app/cariler/[id].tsx:1042+1056 (aynı kartta "Remaining They Owe" ile "Overdue Receivable")

**KULLANICI NE GÖRÜR** — Alt sekme "Contacts" derken rapor kartı "CLIENT STATUS"; aynı tahsilat kaydı Hesap detayında "Staff Collection", İşlemler'de "Staff Payment Received", Personel detayında "Payment Received"; ana sayfada "Net Worth", raporda "Net Value", Excel'de "NET VALUE"; cari özetinde dilbilgisi dışı "Remaining We Owe".

**DÜZELTME** — Terim başına tek karar: cari → **Contact** (alt sekme + tüm ekran başlıkları zaten öyle, müşteri+tedarikçiyi kapsar), tahsilat: isim → **Collection**, fiil → **Collect**, net gösterge → **Net Worth**, bakiye yönü → **Receivable/Payable**.

| Anahtar yolu | Mevcut EN değeri | Önerilen EN değeri |
|---|---|---|
| reports:sections.clientStatus | CLIENT STATUS | CONTACT STATUS |
| common:labels.client | Client | Contact |
| common:setupCard.steps.cari | Add your first client | Add your first contact |
| common:notes.filterClients | Clients | Contacts |
| common:excel.entityCari | CLIENT | CONTACT |
| transactions:form.client | Client | Contact |
| reports:filters.byClient · reports:entityPicker.selectClient | By Client · Select Client | By Contact · Select Contact |
| clients:miniDashboard.genelTitle | Client Status | Contact Status |
| transactions:types.cari_tahsilat | Customer Payment Received | Contact Collection |
| transactions:titles.clientCollection | Client Payment Received | Contact Collection |
| navigation:screens.clientCollection | Payment from Client | Contact Collection |
| accounts:transactionLabels.cariTahsilat | Payment Received | Contact Collection |
| transactions:types.personel_tahsilat | Staff Payment Received | Staff Collection |
| staff:transactionLabels.tahsilat | Payment Received | Collection |
| staff:transactionTypes.collection · staff:actions.getCollection | Payment from Staff · Receive Payment | Staff Collection · Collect Payment |
| clients:actions.collection | Receive Payment | Collect Payment |
| transactions:tabs.tahsilat · tabs.personel_tahsilat | Payment Received | Collection |
| reports:summary.netValue | Net Value | Net Worth |
| reports:summary.netAssets | Net Assets | Net Worth (iki ayrı kalemse: Total Assets) |
| common:genelDurumExcel.netValue | NET VALUE | NET WORTH |
| clients:detayOzet.kalanBorc | Remaining We Owe | Remaining Payable |
| clients:detayOzet.kalanAlacak | Remaining They Owe | Remaining Receivable |

Not: navigation/clients/mutabakat/settings/legal dosyalarında kalan "client" örnekleri de aynı taramayla contact'a çevrilmeli; reports:home.netPosition / summary.netStatus ayrı bir kavramsa (alacak−borç) onu tek ve ayrı bir terime bağla (ör. Net Balance).

#### B5. İngilizce'de uygulama adı üç farklı; Kullanım Koşulları var olmayan bir ürüne atıf yapıyor

**NE** — EN sözlükte üç ad: "Small Business Finance" (mağaza adı/appName/Hakkında), "Simple Business Finance" (Kullanım Koşulları + Gizlilik Politikası metinlerinin tamamı, 8 yer), "İşletme Takip" (İngilizce üretilen Excel/PDF ve mutabakat alt notu).

**NEREDE** — src/i18n/locales/en/legal.json:61,65,69,97,101,105,120 (":101 …belong to Simple Business Finance" — marka/telif maddesi) · src/i18n/locales/en/app.json:2-3 · en/common.json:2 (appName), :430 · en/settings.json:123,126 · en/mutabakat.json:244 · TR tarafı tutarlı: tr/legal.json aynı satırlar "İşletme Takip" · ekranlar erişilebilir: src/app/yasal/*.tsx (giriş: src/app/(tabs)/daha.tsx)

**KULLANICI NE GÖRÜR** — Hukuken bağlayıcı metinde var olmayan bir ürün adı; Hakkında ekranıyla Kullanım Koşulları farklı ad söylüyor; İngilizce çıktı dosyalarının altında Türkçe marka adı.

**DÜZELTME** — Tek İngilizce ürün adına karar ver (mağaza adı "Small Business Finance" mantıklı) ve legal.json'daki 8 örneği değiştir; common.json:430 ile mutabakat.json:244'ü de aynı adla hizala (marka adının değişmez tutulması bilinçli bir istisnaysa bunu belgele — ama Kullanım Koşulları'ndaki "Simple" kesin hata).

#### B6. Ürün birimi ve otomatik açıklama: ham DB kodu + sabit Türkçe "adet"

**NE** — Bir modalda birim ham DB koduyla basılıp fallback'i Türkçe 'adet'; daha ağırı, ürün-cari işleminin otomatik açıklaması sabit Türkçe "adet" ve ham miktar interpolasyonu ile **DB'ye yazılıyor** (sonradan çevrilemez).

**NEREDE** — src/components/transaction/ProductDetailModal.tsx:80 (dosyada useTranslation var ama 'products' namespace'i yok — :24) · src/hooks/useUrunHareketler.ts:1022 ve :1096-1108 · çeviriler hazır: src/i18n/locales/{tr,en}/products.json:21-33 · doğru yapan ~28 yüzey: UrunPickerModal.tsx:286, urunler/[id].tsx:132,496, urunler/index.tsx:215, arsiv/index.tsx:199, QuickUrunBar.tsx:181,371, OcrReviewItem.tsx:125, foto-import/review.tsx:779, ProductRow.tsx:66-70, toplu-giris/cikis.tsx:358,388,576 · formatQuantity'nin gerekçesi (tam bu kalıba karşı yazılmış): src/lib/currency.ts:318-336

**KULLANICI NE GÖRÜR** — İngilizce kullanıcı modalda "3 adet x $10.00" / "5 lt" / "2 parca" görürken aynı ürünü ürün detayında "3 Piece" görüyor. Ürün-cari işlemlerinin açıklaması İşlemler listesinde kalıcı olarak "Cement - 2.5 adet"; ayrıca ham interpolasyon her zaman nokta bastığı için TR kullanıcı 5.977 kg'ı "5977" okuyabiliyor.

**DÜZELTME** — ProductDetailModal:80 → `t('products:units.' + birim)` (namespace listesine 'products' ekle, Türkçe fallback'i kaldır). useUrunHareketler:1022 → `i18n.t('products:stock.autoDescription', { name, qty: formatQuantity(miktar), unit: i18n.t('products:units.' + birim) })`; birimi input'a taşı (çağıran zaten urun nesnesine sahip). :1096'daki toplu listede de formatQuantity kullan.

### LOW

#### B7. Tarih locale'i tek kaynaktan (getLocale) gelmiyor

**NE** — Projede tarih locale'inin tek kaynağı date.ts:25-51 getLocale() (dil + kullanıcının DMY/MDY tercihi). ~11 yerde bu atlanıp satır-içi `i18n.language === 'tr' ? 'tr-TR' : 'en-US'` yazılmış; PDF üreticisinde ise 'tr-TR' sabiti var.

**NEREDE** — src/lib/pdfExport.ts:161-162 (dosyada getLocale importu yok; aynı PDF'in satırları :119,163-164 formatDateShort ile kullanıcı ayarına saygılı; ekran önizlemesi src/components/export/PdfExportSheet.tsx:166-169 getLocale kullanıyor) · src/lib/taksitPlanPdf.ts:86 (`<html lang="tr">` her dilde) · satır-içi ternary: src/app/urunler/[id].tsx:271 · src/app/ayarlar/data-import/index.tsx:225-226 · src/components/dataImport/steps/Step1Select.tsx:160 · src/components/notes/NoteInputModal.tsx:240 · src/hooks/useExchangeRates.ts:165 · doğru kullananlar: PeriodNavigator.tsx:281, useComparisonReport.ts:104,199, useDateFormat.ts:316,330

**KULLANICI NE GÖRÜR** — MDY seçmiş kullanıcı ekstre PDF'inin antetinde "25.07.2026", tablo satırlarında "07/25/2026" görüyor — ve paylaştığı PDF, ekranda gördüğü önizlemeden farklı biçimde. İngilizce + DMY seçmiş kullanıcı ürün hareket satırında "Jul 25", aynı ekranın diğer tarihlerinde "25 Jul" görüyor.

**DÜZELTME** — pdfExport.ts'e `import { getLocale } from './date'` ekleyip 161-162'de 'tr-TR' yerine getLocale() kullan (PdfExportSheet.tsx:167 ile birebir → önizleme = çıktı). Satır-içi ternary'lerin hepsini getLocale() ile değiştir. taksitPlanPdf.ts:86'da lang'i i18n.language'dan bas. Daha temizi: bu iki değeri de options.translations gibi çağırandan al ki lib katmanı locale bilmesin.

#### B8. Sözlükte olmayan iki anahtar

**NE** — Bir anahtar yok ve fallback'i de yok (ham anahtar okunuyor); diğeri sabit İngilizce defaultValue'ya düşüyor (şu an latent).

**NEREDE** — src/app/(tabs)/index.tsx:628 `t('common:search.title')` — tr ve en common.json'ın search bloğunda `title` YOK (mevcut olan: search.search); src/i18n/index.ts:133-147'de parseMissingKeyHandler tanımlı değil, fallbackLng:'en' de aynı şekilde eksik · src/components/ui/SwipeableRow.tsx:90 `t('common:buttons.action', { defaultValue: 'Action' })` — buttons bloğunda `action` yok; onAction geçen tek çağrı (src/app/cariler/[id].tsx:224-225) actionLabel'i de verdiği için bugün görünmüyor

**KULLANICI NE GÖRÜR** — TalkBack/VoiceOver kullanıcısı ana sayfadaki arama butonunu "search.title" olarak duyuyor. SwipeableRow'a actionLabel'siz onAction geçen ilk geliştirici anında Türkçe arayüze "Action" sızdırır.

**DÜZELTME** — index.tsx:628 → `t('common:search.search')` (tr "Ara" / en "Search"). tr+en common.json buttons altına `action` ekle (tr "İşlem", en "Action") ve SwipeableRow.tsx:90'daki defaultValue sabitini kaldır. Regresyonu yakalamak için i18n init'ine `__DEV__` altında parseMissingKeyHandler ekle (uyarı bas, anahtarı döndür).

#### B9. Android bildirim kanalı adları sabit İngilizce

**NE** — setNotificationChannelAsync'e verilen name/description Android sistem ayarlarında kullanıcıya gösterilir ve sabit İngilizce yazılmış; aynı dosyada bildirim gövdeleri doğru şekilde i18n'den geliyor.

**NEREDE** — src/lib/notifications.ts:44-49 ('Default'), :51-57 ('Scheduled Transactions' / 'Reminders for scheduled transactions'); aynı dosyada i18n zaten var: :8 import, :129 locale · doğru yapılan taraf: src/components/notes/AddNoteButton.tsx:69-70, src/hooks/useDetailNoteHandlers.ts:77-78

**KULLANICI NE GÖRÜR** — Türk kullanıcı Ayarlar > Uygulamalar > Bildirimler ekranında İngilizce kanal adı görüyor.

**DÜZELTME** — name/description'ı i18n.t ile ver ve tr/en'e common:notifications.channels.* anahtarlarını ekle. Kanal metadata'sı aynı channelId ile tekrar çağrıldığında yenilenir, yani mevcut kullanıcılarda da düzelir.

#### B10. Sözlük hijyeni: TR para birimi adları diyakritiksiz (EN ekseni değil)

**NE** — tr/accounts.json'daki 6 para birimi adı Türkçe karakterleri kaybetmiş; şu an ÖLÜ anahtarlar (adlar constants/currencies.ts'ten geliyor), ama ileride bu anahtara bağlanan bir ekran bozuk Türkçe basar.

**NEREDE** — src/i18n/locales/tr/accounts.json:151-156 ("Turk Lirasi", "Amerikan Dolari", "Ingiliz Sterlini", "Altin (gram)", "Gumus (gram)") · doğru yazım: src/constants/currencies.ts:17-22 · ölü olduğunun kanıtı: src/components/ui/CurrencyPicker.tsx:51-56 (adı getLocalizedCurrencyName'den alıyor)

**KULLANICI NE GÖRÜR** — Şu an hiçbir şey (anahtarlar kullanılmıyor).

**DÜZELTME** — Ya değerleri diyakritikli yaz ya da bu 6 anahtarı iki dilden de kaldır (tek gerçek kaynak constants/currencies.ts).

#### B11. Kalan terim kaymaları (tek satırlık sözlük düzeltmeleri)

**NE** — Aynı TR değerin iki EN karşılığı olan, canlı olarak render edilen küçük etiketler.

**NEREDE** — src/app/ayarlar/islem-gecmisi.tsx:26 (filterPersonnel) · src/app/ayarlar/hesap-sil.tsx:96 (deleteWarnings.personnel) · src/app/islemler/index.tsx:237 (filters.leaveEntitlement) · src/components/reports/tabs/GenelTabContent.tsx:86 (period.instant) · src/app/(tabs)/personel.tsx:709 (addFirstPersonnel) · src/components/mutabakat/ReportStep.tsx:111-114 ve src/app/mutabakat/[cariId].tsx:193-195 (summary.borc/alacak; kodun yorumu "kendi Excel exportuyla aynı dil" diyor ama export DEBIT/CREDIT basıyor) · cari formu vs İşletme Bilgileri formu vergi alanları

| Anahtar yolu | Mevcut EN değeri | Önerilen EN değeri |
|---|---|---|
| multiUser:auditLog.filterPersonnel | Personnel | Staff |
| settings:account.deleteWarnings.personnel | • All your personnel records | • All your staff records |
| transactions:filters.leaveEntitlement | Leave Earned | Leave Entitlement |
| transactions:tabs.kredi_karti_gider | Spending | Expense |
| reports:period.instant | Instant | Current |
| common:genelDurumExcel.instant | Instant | Current |
| analytics:labels.instant | Instant | Current |
| staff:messages.addFirstPersonnel | Get started by adding your first team member | Start by adding your first staff member |
| clients:form.taxNumber | Tax ID (EIN) | Tax Number |
| clients:form.taxNumberPlaceholder | Enter tax ID or EIN | Enter tax number |
| clients:form.taxOffice | Tax Registration | Tax Office |
| clients:form.taxOfficePlaceholder | State or registration info | Enter tax office |
| mutabakat:summary.borc / alacak | Payable / Receivable | (karar ver: ya bunlar kalır ve common:export.excel.debit/credit → PAYABLE/RECEIVABLE olur, ya bunlar Debit/Credit olur) |

**KULLANICI NE GÖRÜR** — İşlem Geçmişi'nde "Accounts / Clients / Personnel / Products" (her yerde "Staff"); "Leave Earned" filtresini seçince listede "Leave Entitlement" kayıtları; dönem seçicisi bir ekranda "Current", diğerinde "Instant"; personel boş-durumunda uygulamada başka hiç geçmeyen "team member"; carisinde "Tax Registration / State or registration info", kendi işletme bilgisinde "Tax Office".

---

### Tek satırlık işler

1. src/constants/currencies.ts:29 — `if (!code) return '₺'` yerine `getCurrentCurrency().symbol` döndür.
2. src/lib/turkishTextUtils.ts:52 — upperTr'ın başına `if (!i18n.language?.startsWith('tr')) return text.toUpperCase();` ekle (121 çağrı yeri düzelir).
3. src/lib/pdfExport.ts:161-162 — 'tr-TR' yerine getLocale().
4. src/app/(tabs)/index.tsx:628 — `t('common:search.title')` → `t('common:search.search')`.
5. src/app/islemler/duzenle/[id].tsx:441 ve :790 — formatCurrency'ye `personel.currency` ikinci argümanını ekle.
6. src/app/urunler/[id].tsx:271 — satır-içi ternary yerine getLocale().
7. src/app/taksit/index.tsx:88-89 — tahsilAdet/odeAdet'e `p.currency === cur` filtresini ekle.
8. src/components/transaction/CreditCardTransactionBar/index.tsx:516-518, src/components/import/usePendingFormState.ts:327-329, src/components/transaction/DailyCashModal.tsx:295-298 — `setAmount(cleanAmountInput(text))`.
9. src/components/transaction/ProductDetailModal.tsx:80 — birimi `t('products:units.' + birim)` ile bas, 'adet' fallback'ini kaldır ('products' namespace'ini ekle).
10. src/i18n/locales/en/legal.json — 8 adet "Simple Business Finance" → "Small Business Finance".
11. src/i18n/locales/en/multiUser.json filterPersonnel → "Staff"; en/settings.json deleteWarnings.personnel → "• All your staff records"; en/transactions.json filters.leaveEntitlement → "Leave Entitlement", tabs.kredi_karti_gider → "Expense"; reports/common/analytics'te "Instant" → "Current"; en/staff.json addFirstPersonnel → "Start by adding your first staff member".
12. src/i18n/locales/en/clients.json:217-218 — "Remaining We Owe/They Owe" → "Remaining Payable/Receivable".
13. src/i18n/locales/{tr,en}/common.json buttons altına `action` ekle + src/components/ui/SwipeableRow.tsx:90'daki `defaultValue: 'Action'`'ı kaldır.
14. src/i18n/locales/tr/accounts.json:151-156 — para birimi adlarını diyakritikli yaz (ya da anahtarları sil).
15. src/i18n/index.ts init — `__DEV__` altında parseMissingKeyHandler ekle (eksik anahtarlar bir daha sessiz kalmasın).
16. src/app/(tabs)/index.tsx:218 — conversionIncomplete'i destructure edip HeroCard altında t('reports:summary.conversionIncomplete') uyarısını göster.