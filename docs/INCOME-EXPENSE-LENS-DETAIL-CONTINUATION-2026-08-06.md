# Gelir-Gider Tarihsel Mercek Detayı — Devam Notu (2026-08-06)

## Son durum — tamamlandı, deploy edilmedi

- Kullanıcı döndükten sonra yarım implementasyon tamamlandı.
- Ana rapordan kategori detayına seçili lens taşınıyor.
- Kategorisiz, alt kategorisiz ve alt kategorili üç detay dalında özetler, alt kategori
  tutarları, seçili toplam ve işlem satırları aynı tarihsel lensi kullanıyor.
- İşlem satırlarında kayıtlı tutar ile kullanılan günlük kur tarihi/değeri; reel görünümde
  işlem ayı ve güncel TÜFE değerleri gösteriliyor.
- Detay Excel özeti seçili lens birimi ve etiketiyle çıkıyor. Ana rapor Excel'i ile hesap
  kırılımı şimdilik nominal kalıyor ve UI bunu açıkça belirtiyor.
- Yeni migration/DDL uygulanmadı; mevcut global günlük ve aylık tablolardan iki toplu
  sorguyla okunuyor, satır başına sorgu yok.
- Canlı kontrol: iki gösterge tablosunda RLS açık, `authenticated` SELECT yetkisi ve SELECT
  policy'si var. Günlük tabloda 2021-08-06–2026-08-06 arasında 1.256 satır mevcut.
- Doğrulama sonuçları:
  - TypeScript: temiz.
  - ESLint: 0 hata; projede bu işten bağımsız mevcut 90 uyarı.
  - Jest: 182 suite, 2.043 test geçti.
  - Metro iOS export: 4.119 modül, temiz.
- Commit, push veya yeni deploy yapılmadı. Telefonda UI turu kullanıcı onayı bekliyor.

## Kullanıcının kesinleştirdiği sözleşme

- Haziran 2024 gibi geçmiş bir gelir-gider raporunda her işlem, kendi işlem gününün
  tarihsel referansıyla ayrı ayrı çevrilecek.
- Hafta sonu/resmî tatilde en fazla 7 gün içindeki önceki resmî iş günü değeri kullanılacak.
- Bu davranış yalnız ana gelir-gider raporunda kalmayacak; kategori detayı, alt kategori
  toplamları, seçili toplam ve işlem satırlarında da aynı mercek kullanılacak.
- Reel görünüm günlük TÜFE üretmeyecek. İşlem gününün bulunduğu ayın yayımlanmış TÜFE'si
  ile en güncel yayımlanmış TÜFE kullanılacak.
- Düzenleme ekranı ve veritabanındaki gerçek işlem tutarı değişmeyecek; tarihsel değerler
  yalnız rapor gösterimi olacak.

## Bu oturumdan önce canlıda tamamlanmış durum

- Additive migration canlı: `20260806124340 add_daily_economic_indicators_and_report_lens`.
- Edge Function v8 ve günlük cron canlı; cron 13:30 UTC / 16:30 TR.
- 5 yıllık backfill 46/46 tamamlandı; günlük tabloda 1.256 satır ve yaklaşık 287 KB var.
- Mantıksal tam yedek doğrulandı:
  `backups/2026-08-06T17-13-06/db-complete` (yaklaşık 102 MB).
- Ana gelir-gider raporundaki USD/EUR/altın/reel lens RPC'si çalışıyor.
- Bu yeni detay çalışması için yeni migration gerekmiyor ve henüz canlıya yeni bir şey
  deploy edilmedi.

## Bu oturumda doğrulanan eksik

- `src/app/raporlar/gelir-gider.tsx` tarihsel lens seçiliyken kategori kartının tıklamasını
  bilerek kapatıyordu.
- `src/app/raporlar/kategori/[id].tsx` lens parametresi almıyor; özet, checkbox, seçili
  toplam ve satırlar nominal/güncel-kur mantığında kalıyordu.
- Sonuç: ana rapor tarihsel olarak doğruydu ama detay sayfası henüz kullanıcı sözleşmesini
  karşılamıyordu.

## Uygulanmaya başlanmış değişiklikler (henüz doğrulanmadı)

- `src/lib/reportLens.ts`
  - Günlük kur ve aylık TÜFE için saf dönüşüm motoru eklendi.
  - Formül ana RPC ile aynı tutuldu:
    `native tutar × işlem-günü kaynak kuru ÷ işlem-günü mercek kuru`.
  - Reel formül: `native tutar × kaynak kuru × güncel TÜFE / işlem ayı TÜFE`.
  - SQL ile aynı para birimi önceliği eklendi: hesap → cari → personel → TRY.
  - 7 günlük önceki iş günü araması ve eksik veri sonucu eklendi.
- `src/hooks/useHistoricalReportLens.ts` (yeni)
  - Satır başına sorgu yapmadan günlük ve aylık göstergeleri iki toplu sorguda çekiyor.
  - Query sonuçları disk persist dışında tutuluyor.
- `src/lib/queryKeys.ts`
  - Günlük/aylık lens sorgu key'leri eklendi.
  - Alt kategori RPC key'lerine lens eklendi.
- `src/hooks/useCategoryReport.ts`
  - `useSubCategoryReport` tarihsel lens RPC'sine geçirilmeye başlandı.
  - Normal ve iade aggregate'leri lens ile ayrı çağrılıyor; tarihsel sonuç yeniden bugünkü
    kura çevrilmiyor.
- `src/app/raporlar/gelir-gider.tsx`
  - Kategori detay rotasına `lens` parametresi eklendi.
  - Tarihsel lenslerde kategori tıklaması açıldı.
- `src/app/raporlar/kategori/[id].tsx`
  - Lens parametresi okunuyor ve TRY bazında doğrulanıyor.
  - Toplamlar ve işlem satırları tarihsel dönüşüm motoruna bağlanmaya başlandı.
  - Satır altına kayıtlı tutar, kullanılan kur günü/değeri veya TÜFE değerleri eklenmeye
    başlandı.
  - Alt kategori Excel özeti seçili lens birimiyle export edilmeye başlandı.
- `src/components/ui/TransactionRow.tsx`
  - Altın gramı ve özel lens metni için opsiyonel `amountText` eklendi.
- TR/EN `reports.json`
  - Detay tutarlılığı, kayıtlı tutar, kur/TÜFE ve eksik referans metinleri eklendi.
- Testler
  - `src/lib/__tests__/reportLensConversion.test.ts` eklendi.
  - `incomeExpenseReportLensContract.test.ts` yeni detay sözleşmesine göre güncellendi.
  - `categoryReportV2ClientContract.test.ts` query key beklentileri güncellenmeye başlandı.

## Kritik durum: çalışma henüz bitmiş sayılmaz

- Yukarıdaki son kod değişikliklerinden sonra TypeScript/Jest henüz çalıştırılmadı.
- Olası tip/sözdizimi sorunları ve eksik test beklentileri olabilir.
- `categoryReportV2ClientContract.test.ts` içindeki iki beklenen diziye `nominal` eklendi;
  doğru satırlara yerleştiği test çalıştırılarak kontrol edilmeli.
- Detay sayfasındaki bütün `formatCurrency` noktalarının doğru lens formatına geçtiği tekrar
  taranmalı.
- Kategorisiz, alt kategorisiz ve alt kategorili üç ayrı render dalında yükleme/hata/eksik
  kur uyarıları kontrol edilmeli.
- `useSubCategoryReport` dönüş tipleri TypeScript ile doğrulanmalı.
- `TransactionRow` memo comparator değişikliği regresyon açısından test edilmeli.

## Dönünce izlenecek sıra

1. `git diff` ile yalnız bu işte dokunulan parçaları yeniden oku; kullanıcıya ait diğer
   dirty-worktree değişikliklerine dokunma.
2. Önce hedefli typecheck/Jest çalıştır:
   - `reportLensConversion.test.ts`
   - `incomeExpenseReportLensContract.test.ts`
   - `categoryReportV2ClientContract.test.ts`
3. Çıkan tip ve sözleşme hatalarını düzelt.
4. Detay ekranının üç render dalını koddan tekrar denetle; bütün tutarlar aynı lens olmalı.
5. Tam doğrulama: TypeScript + ESLint + tüm Jest + Metro bundle.
6. Deploy/commit/push yapma; kullanıcı istemedi. UI cihaz testi kullanıcıya bırakılmalı.

## Eski istemci güvenliği

- Bu detay işi istemci tarafı ve mevcut additive RPC/tablo okumalarıyla yapılıyor.
- Yeni DROP/UPDATE/backfill veya mevcut RPC imza değişikliği yok.
- 1.5.x eski client mevcut nominal rapor davranışına devam eder; bu yarım çalışma canlıya
  deploy edilmediği için şu anda eski/yeni client üzerinde yeni bir etkisi yok.

## 2026-08-06 — Sticky mercek, karşılaştırma ve ileri tarih düzeltmesi

- Ortak `IncomeExpenseLensPicker` eklendi. Kontrol rapor kayarken sağ üstte sabit kalıyor;
  seçenekler native-driver animasyonuyla yukarıdan aşağı açılan tek panelde gösteriliyor.
- Picker ana gelir-gider, kategori detayının üç render dalı ve karşılaştırma ekranına
  bağlandı. TRY dışındaki ana gösterim para birimlerinde tarihsel mercek yine kapalı.
- Karşılaştırma ekranı seçili merceği satırlar, toplam, ortalama, drill-down rotası, PDF ve
  Excel'e taşıyor. Günlük görünümde 31×4 çağrı üretmemek için bütün kovaları tek istekte
  döndüren `get_income_expense_comparison_lens_v1` RPC'si eklendi.
- İleri tarihli işlem kendi rapor tarihinde kalıyor; yalnız kur/TÜFE referans günü Türkiye
  bugünüyle sınırlandırılıyor. Örneğin 31.08.2026 tarihli işlem 06.08.2026'da bakıldığında
  06.08 veya o güne kadar mevcut son resmî günlük referansı kullanıyor. Reel TRY geleceğin
  yayımlanmamış TÜFE'sini aramıyor; güncel yayımlanmış TÜFE kullanıldığı için TRY tutar
  bugünün alım gücünde 1× kalıyor.
- Additive migration canlıya uygulandı:
  `20260806174821 fix_future_report_lens_and_add_comparison_lens`.
- Canlı öncesi örnek snapshot: 7 günden ileri tarihli gider içeren örnekte
  `missing_rate_count=1`, `conversion_incomplete=true`, toplam `1256.5754...`.
- Canlı sonrası aynı sözleşme: `missing_rate_count=0`, `conversion_incomplete=false`,
  toplam `1317.8263...`; daha önce dışlanan ileri tarihli tutar son resmî kurla dahil oldu.
- Yeni batch RPC iki kova döndürdü, eksik referans üretmedi. Anon EXECUTE kapalı,
  authenticated açık; çapraz işletme çağrısı ve 40'tan fazla kova boş sonuçla fail-closed.
- Advisor: yeni fonksiyonda performans bulgusu yok. `SECURITY DEFINER + authenticated`
  uyarısı beklenen API tasarımıdır; fonksiyon tenant/yetki kontrolünü içeriyor, `search_path`
  `pg_catalog`, PUBLIC/anon/service_role EXECUTE revoke durumda.
- Tam doğrulama tamamlandı: TypeScript temiz; ESLint 0 hata (projeden gelen 90 mevcut
  uyarı); Jest 182 suite / 2.047 test yeşil; iOS Metro 4.120 modülle temiz export aldı.
  Commit/push/client deploy yapılmadı; cihaz UI turu kullanıcı onayı bekliyor.

### 1.5.x eski client etkisi

- Mevcut `get_category_report_lens_v1` imzası ve JSON şekli değişmedi; yalnız ileri tarihli
  referans hatası düzeldi.
- Yeni karşılaştırma RPC'sini eski client çağırmaz. Tablo/kolon/veri değişmedi; DROP,
  DELETE, UPDATE, TRUNCATE veya backfill yok. Eski client nominal rapor davranışına devam eder.

## 2026-08-06 — XAG kaynak kuru ve ana rapor tarihsel Excel özeti

- `20260806184140_add_historical_xag_source_rates` migration'ının ve XAG destekli
  `sync-ekonomik-gostergeler-evds` Edge Function sürümünün canlı olduğu doğrulandı.
- Canlıdaki tek XAG kaynak para birimli işlem 23.07.2026 tarihli. Aynı günün tarihsel
  gram gümüş/TL referansı mevcut; 7 günlük pencere içinde eksik XAG kaynaklı işlem sayısı 0.
- Güvenlik advisor'ındaki iki tarihsel lens RPC uyarısı beklenen API tasarımıdır:
  fonksiyonlar `SECURITY DEFINER` olsa da `auth.uid()` + işletme/rapor yetkisi denetimi yapar;
  PUBLIC/anon erişimi kapalı, yalnız authenticated çağırabilir. İlgili yeni performans
  advisor bulgusu yoktur.
- Ana gelir-gider raporunda USD/EUR/altın/reel seçiliyken Excel butonu artık kaybolmaz.
  Dosya, ekrandaki tarihsel aggregate kategori satırlarını doğrudan kullanır; ürün dağıtımı,
  iade netlemesi ve tarihsel referanslar ikinci kez istemcide hesaplanmaz.
- Tarihsel referans eksikse eksik toplam export edilmez. Altın Excel hücreleri metin değil,
  hesaplanabilir gram sayısıdır. Nominal görünüm mevcut ayrıntılı işlem Excel'ini korur;
  tarihsel görünüm şimdilik ekranla birebir kategori özeti üretir.
- Bu Excel iyileştirmesi istemci tarafıdır; yeni migration, DROP/UPDATE/backfill yoktur.
  1.5.x istemciler mevcut nominal davranışla devam eder.

## 2026-08-07 — Tarihsel gelir kaynağı kırılımı ve kaynak detayları

- Gelir ekranındaki `Kategori / Hesap` seçimi artık Nominal dışındaki Reel TL, USD, EUR ve
  gram altın merceklerinde de kullanılabiliyor. Mercek değişince seçim zorla kategoriye dönmüyor.
- Yeni additive `get_income_by_source_lens_v1` RPC'si eklendi ve canlıya
  `20260806212550_add_historical_income_source_lens` olarak uygulandı. Mevcut
  `get_income_by_source_v2` tanımı ve imzası değiştirilmedi; canlı definition hash'i uygulama
  öncesi ve sonrası `077729467c32236a0311d418417994a9` kaldı.
- RPC, kaynak native tutarını işlem gününün kaynak para kuru ile TRY'ye, ardından aynı günün
  mercek kuruna çeviriyor. Reel görünümde güncel yayımlanmış TÜFE / işlem ayı TÜFE oranını
  kullanıyor. İleri tarih referansı Türkiye bugünüyle sınırlı; hafta sonu/tatilde en fazla yedi
  gün önceki resmî değer aranıyor. Cari satış iadeleri eksi işaretle netleniyor.
- Ana kaynak kartları, grup toplamları, gelir üst toplamı ve tarihsel Excel özeti artık seçili
  merceğin biriminde. Hesap kırılımından alınan Excel'de ilk kolon `Hesap`; ekrandaki kaynak
  satırları ve toplamı doğrudan kullanılıyor.
- Kaynak kartına girilen detay sayfasına mercek rotayla taşınıyor ve sayfada değiştirilebiliyor.
  Özet toplam ile her işlem satırı aynı tarihsel motoru kullanıyor; satırın sağ altında yalnız
  `USD/EUR/XAU ... TL` referansı veya `TÜFE ...` bilgisi gösteriliyor. Eksik referanslı satır
  toplama alınmıyor ve eksik işlem sayısı açık uyarıyla veriliyor.
- Canlı 2024 Haziran örneğinde dört mercekte kaynak toplamı ile kategori gelir net toplamı
  arasındaki fark ayrı ayrı tam `0.0000000000`; kaynak tarafında eksik referans sayısı 0.
- Canlıdaki en yoğun işletmenin beş yıllık USD kaynak raporu `EXPLAIN ANALYZE` ile yaklaşık
  96 ms sürdü; yeni indeks gerekmedi. Yeni fonksiyon PUBLIC/anon/service_role'a kapalı, yalnız
  authenticated rolüne açık; `search_path=pg_catalog`. Performance advisor yeni bulgu vermedi.
  Security advisor'ın SECURITY DEFINER + authenticated uyarısı, tenant ve kaynak-modül yetki
  kontrollerini fonksiyon içinde yapan mevcut rapor RPC mimarisinin beklenen uyarısıdır.
- Tam doğrulama tamamlandı: TypeScript temiz; ESLint 0 hata (projeden gelen 90 mevcut uyarı);
  Jest 184 suite / 2.058 test yeşil; iOS Metro 4.120 modülle temiz export aldı.
- Commit/push/client deploy yapılmadı. Sticky kontrol ve kaynak detay satırlarının gerçek cihaz
  görünümü kullanıcı turuyla onaylanmalı.

### 1.5.x eski client etkisi

- Eski client yeni RPC'yi çağırmaz ve canlıda değişmeden duran nominal
  `get_income_by_source_v2` üzerinden aynı sekiz kolonu almaya devam eder.
- Migration yalnız yeni fonksiyon/ACL/comment oluşturur; tablo/kolon eklemez, kullanıcı verisine
  yazmaz, DROP/DELETE/UPDATE/TRUNCATE/backfill içermez. Bu nedenle eski sürümün nominal gelir
  kaynağı raporu aynı kalır.
