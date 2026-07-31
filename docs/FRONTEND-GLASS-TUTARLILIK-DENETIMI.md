# Front-end / Liquid Glass Tutarlilik Denetimi — 25 Temmuz 2026

8 alan paralel tarandi (mutabakat · raporlar · formlar · urunler · ana sekmeler · detaylar · kose ekranlar · paylasilan bilesenler).
104 ham bulgu → 103 tekil → **95 onayli** (9 yuksek / 36 orta / 50 dusuk), 8 supheci dogrulamada curutuldu.

---

### Ön Bilgi

95 onaylı bulgu, 24 temaya toplandı. Sıralama: kullanıcının doğrudan gördüğü/erişemediği şeyler önce.

Baskın kök neden tek: **overlay cam tab bar (~106px = gerçek safe-area 34 + TAB_BAR_CONTENT_HEIGHT 72) ve home indicator (34px) alt boşluk sözleşmesi**, ekranların yaklaşık üçte birinde ya hiç uygulanmamış, ya yanlış yüzeye uygulanmış. İkinci baskın neden: paylaşılan bileşen mevcutken elle yazılmış kopyalar.

---

## YÜKSEK — Kullanıcı doğrudan görür / içeriğe erişemez

### 1. Taksit Takip'in tek yazma girişi cam tab bar'ın arkasında

**NE** · taksit/index'teki FAB ve FAB menüsü `bottom` değerini `insets.bottom` olmadan veriyor, bu yüzden tamamen tab bar bandının içinde kalıyor.

**NEREDE** · src/app/taksit/index.tsx:364 (fab bottom = spacing['2xl'] = 24) ve :218 (menü bottom = 24+56+12).

**NEDEN ÖNEMLİ** · 56px'lik FAB dipten 24–80px bandında duruyor, bar 106px kaplıyor. "Taksitli satış/alış ekle" butonu ne görünüyor ne basılabiliyor; sayfanın başka yazma girişi yok. Uygulamadaki diğer 9 FAB'ın hepsi insets.bottom kullanıyor, bu tek istisna.

**DÜZELTME** · `useSafeAreaInsets()` ekle, styles.fab'tan `bottom` satırını kaldır, inline ver: FAB `bottom: spacing.lg + insets.bottom`, menü `bottom: spacing.lg + insets.bottom + FAB_SIZE + spacing.md` — src/app/urunler/index.tsx:955 ile birebir aynı kalıp.

---

### 2. Yedi ekranda liste/kaydırma sonu cam tab bar'ın altında kalıyor

**NE** · Alt boşluk sabit `spacing['3xl']` (32px) ya da hiç verilmemiş; gereken ~106px.

**NEREDE** ·
- src/components/mutabakat/ReportStep.tsx:725 + :759 (rapor listesi — yüzlerce satır)
- src/components/mutabakat/SelectStep.tsx:23 + :110 (dosya seçme, tek CTA burada)
- src/app/ayarlar/davet-olustur.tsx:85 + :208 (tek aksiyon "Kod Oluştur")
- src/app/ayarlar/islem-gecmisi.tsx:224 (dikey ScrollView contentContainerStyle almıyor)
- src/app/taksit/[id].tsx:253 + :324 (plan tamamen ödendiğinde footer kaybolunca)
- src/components/dataImport/SkippedTab.tsx:36 + src/components/dataImport/styles.ts:55
- src/components/ocrImport/OcrInvoiceList.tsx:136 (sabit footer, "Hepsini Kaydet" — bu ekrana bugün giriş noktası yok, etkisi latent)

**NEDEN ÖNEMLİ** · Kaydırarak ulaşılamayan içerik ve basılamayan butonlar. Mutabakat raporunun son "Eşleşen/Kilitli kalemler" satırları, davet ekranının tek butonu, işlem geçmişinin en eski kayıtları erişilemez.

**DÜZELTME** · Her dosyada `useContentBottomPadding()` çağır ve alt boşluğu **inline** ver: `contentContainerStyle={[styles.X, { paddingBottom: contentPaddingBottom }]}`. Sabit footer'lı olan OcrInvoiceList'te bunun yerine `useFooterBottomPadding()` + `paddingBottom: spacing.md + footerInset` (kardeşi src/app/foto-import/review.tsx:583 zaten böyle). Mutabakat için ReportStep ve SelectStep'e hook'u bileşen içinde ekle; SkippedTab'a index.tsx'in zaten hesapladığı değeri prop olarak geçir.

---

### 3. Alt boşluk yanlış yüzeye verilmiş: yatay şeritte ~106px hayalet delik

**NE** · `useContentBottomPadding()` sonucu, ekranın TEPESİNDEKİ yatay filtre ScrollView/FlatList'inin contentContainerStyle'ına konmuş.

**NEREDE** · src/app/notlar/index.tsx:348 (yatay filtre FlatList; sarmalayıcı filtersContainer :493-495 flex ile sınırlı değil) · src/app/ayarlar/islem-gecmisi.tsx:206 (chipRow, chipScroll flexGrow:0).

**NEDEN ÖNEMLİ** · Yatay listede paddingBottom içerik yüksekliğini büyütür: chip'lerin altında ~106px'lik boş bir şerit açılıyor, filtre ile liste arasında kocaman bir delik oluşuyor. islem-gecmisi'nde ayrıca asıl dikey liste boşluksuz kalıyor — yani tek hata iki yönlü hasar veriyor. b1ea0d4 numaralı otomatik Screen taşımasının yan hasarı.

**DÜZELTME** · notlar/index.tsx:348'i `contentContainerStyle={styles.filtersList}` haline geri al. islem-gecmisi.tsx:206'daki paddingBottom'ı kaldırıp :224'teki dikey ScrollView'a taşı.

---

### 4. Vade Takibi sayfasının header'ı hiç yok

**NE** · Rota kök Stack'e kayıt edilmediği için global `headerShown: false` geçerli kalıyor; sayfa içi `<Stack.Screen options={{ headerTitle }} />` yalnız metni geçiyor, header'ı açmıyor.

**NEREDE** · src/app/vade/index.tsx:150-152 · src/app/_layout.tsx (grep "vade" → eşleşme yok) · karşılaştırma: _layout.tsx:410-434 taksit kaydı ve oradaki açıklayıcı yorum.

**NEDEN ÖNEMLİ** · Sayfa başlıksız ve geri butonsuz açılıyor (yalnız kenar-swipe ile çıkılıyor) ve `<Screen>` `top` prop'suz olduğu için Satış/Alış sekme şeridi status bar'ın altına giriyor. Bu tam olarak taksit sayfaları için bir kez yaşanıp _layout'a yorumla belgelenmiş hata; vade atlanmış. Sayfa Cariler mini-dashboard'undan erişilebiliyor.

**DÜZELTME** · _layout.tsx'e taksit/index kaydının eşini ekle: `<Stack.Screen name="vade/index" options={{ presentation:'card', headerShown:true, headerStyle:{backgroundColor:colors.surface}, headerTintColor:colors.text, headerShadowVisible:false, fullScreenGestureEnabled:false }} />`.

---

### 5. Donut lejandından açılan kategori raporu her zaman boş

**NE** · Lejand navigasyonu `type` parametresini geçirmiyor; hedef sayfa parametreyi `type!` diye kullanıp undefined'da INCOME_TYPES'a düşüyor.

**NEREDE** · src/widgets/finance/CategoryDonutWidget.tsx:86-90 (ikinci argüman yok) → src/app/raporlar/index.tsx:64-75 (handleNavigate params listesinde type yok) → src/app/raporlar/kategori/[id].tsx:86-92, :110, :119 · src/hooks/useCategoryReport.ts:31.

**NEDEN ÖNEMLİ** · Donut varsayılanı 'gider'. Kullanıcı bir GİDER kategorisine basıyor, açılan sayfa GELİR işlemlerini sorguluyor → toplam 0,00 / 0 işlem / boş liste. Başlık rengi de kırmızı kaldığı için sayfa "gider raporu" gibi görünüp boş duruyor. Doğru yapan iki çağıran var (gelir-gider.tsx:88-96, nakit-akisi/index.tsx:103-112), donut atlanmış.

**DÜZELTME** · `onNavigate(\`/raporlar/kategori/${kategoriId}\`, { type: selectedType })` yap; handleNavigate ikinci argümanı zaten `...params` ile yayıyor, başka değişiklik gerekmiyor.

---

### 6. Toplu personel formlarında Kaydet butonu klavyenin altında kalıyor

**NE** · Sabit footer KeyboardAvoidingView'ün içinde ama `keyboardVerticalOffset` verilmemiş; native header yüksekliği kadar eksik padding hesaplanıyor.

**NEREDE** · src/app/personel/toplu-gider.tsx:212-215 (footer :337, insets yok) · src/app/personel/toplu-odeme.tsx:250-253 (footer :401, insets satır 30'da hazır) · ayrıca kaydırılamayan varyant: src/app/ayarlar/hesap-sil.tsx:64 (KAV içinde ScrollView yerine düz View, :149-152).

**NEDEN ÖNEMLİ** · Satır içi CurrencyInput'a dokununca klavye açılıyor, footer'daki özet + Kaydet ~90px klavyenin arkasında kalıyor; kullanıcı klavyeyi kapatmadan kaydedemiyor. hesap-sil'de işletme adı yazmak zorunlu olduğu için klavye mutlaka açılıyor ve kaydırma imkânı olmadığından "Hesabı Sil" butonu ekrandan çıkıyor. Aynı desendeki altı form (cariler/hesaplar/personel ekle-düzenle) doğru offset'i veriyor.

**DÜZELTME** · İki toplu ekranda KAV'e `keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + 44 : 0}` ekle (src/app/personel/ekle.tsx:100 ile birebir). hesap-sil'de content View'ini ScrollView'a çevir: `contentContainerStyle={[styles.content, { paddingBottom: contentPaddingBottom }]}` + `keyboardShouldPersistTaps="handled"` (aynı klasördeki ayarlar/isletme.tsx:201-210 kalıbı).

---

### 7. Cam butonların atasına opacity animasyonu — ALTIN KURAL ihlali

**NE** · PhotoViewerModal'ın header'ı ve alt aksiyon çubuğu `opacity: backdropOpacity.value` ile animasyonlanıyor; iki Animated.View'ün doğrudan çocukları GlassSurface.

**NEREDE** · src/components/transaction/PhotoViewerModal.tsx:335-337 (uiAnimatedStyle), :355 ve :411 (uygulandığı Animated.View'ler), :357/:371/:413/:431 (GlassSurface çocukları), :237-242 (backdropOpacity 1→0.3), :346 (`animationType="fade"`).

**NEDEN ÖNEMLİ** · Ata alpha<1 olunca offscreen render pass devreye giriyor ve cam arkasını örnekleyemiyor. Kullanıcı fotoğrafı kapatmak için aşağı sürüklerken kapat/paylaş yuvarlaklarının ve Değiştir/Sil butonlarının yüzeyi kayboluyor, ikonlar havada asılı kalıyor. Modal'ın fade açılış/kapanışında da tetikleniyor. Bu modal dört detay sayfasında da kullanılıyor (cari/hesap/personel foto + not fotoğrafı).

**DÜZELTME** · uiAnimatedStyle'ı cam yüzeylerin atasından kaldır; gizleme isteniyorsa header/footer'a translateY uygula (src/components/ui/UndoSnackbar.tsx:75-89 aynı problemi bu şekilde çözüp yorumla belgelemiş) ya da opacity'yi camın İÇİNDEKİ TouchableOpacity/ikon katmanına indir; Modal için `animationType="none"` + kendi transform geçişin.

---

## ORTA — Görünür sürtünme, iş kaybı yok

### 8. Yüzen kontroller birbirini örtüyor

**NE** · Aynı taban çizgisine oturan iki yüzen kontrol dikeyde çakışıyor.

**NEREDE** · src/app/islemler/index.tsx:544 (FloatingSearchBar) + :605 (UndoSnackbar) · aynı çift src/app/urunler/index.tsx:811 + :979 · ölçüler: UndoSnackbar.tsx:88 (bottom = insets.bottom + 12, zIndex 999) vs FloatingSearchBar.tsx:135 (bottom = insets.bottom + 16, yükseklik 56) · ayrıca src/app/(tabs)/index.tsx:395 (ScrollView paddingBottom yalnız insets.bottom) + :692 (GlassFab).

**NEDEN ÖNEMLİ** · İşlem silindikten sonra geri-al penceresi boyunca snackbar arama pill'inin 56px'inin ~44'ünü kapatıyor; kullanıcı "arama kayboldu" yaşıyor. Ana sayfada ise sona kaydırıldığında FAB, son hesap satırının ⋮ butonunu ve satır açılınca beliren "İşlem Yap"/"İşlemleri Gör" butonlarını örtüyor — daha fazla kaydırma imkânı olmadığı için o satıra erişilemiyor.

**DÜZELTME** · İki listede `<FloatingSearchBar bottomOffset={undoSnackbar.visible ? spacing.lg + 48 + spacing.sm : spacing.lg} />` (prop zaten var, hiçbir çağıran kullanmıyor). Ana sayfada :395'i `paddingBottom: useContentBottomPadding({ extra: FAB_SIZE + spacing.lg })` yap — personel ve ürünler sekmeleri zaten FLOATING_SEARCH_CLEARANCE ile FAB zarfını temizliyor.

---

### 9. Modal/alt sayfalar home indicator'ı temizlemiyor (7 yüzey + 1 ters hata)

**NE** · Alta yaslı sheet'lerin alt boşluğu sabit 16–24px; gerçek safe-area 34px.

**NEREDE** ·
- src/components/ui/DateTimePicker.tsx:268 (15+ formda kullanılan primitif)
- src/components/notes/NoteInputModal.tsx:496 (Kaydet/İptal)
- src/app/personel/ekle.tsx:506 ve src/app/personel/duzenle/[id].tsx:504 (tarih seçici "Tamam")
- src/app/ayarlar/isletme.tsx:533-539 (şifre + sektör sheet'leri, ayrıca borderRadius 20 hardcoded)
- src/app/urunler/toplu-giris.tsx:559 + :918 ve src/app/urunler/toplu-cikis.tsx (aynı satırlar)
- src/components/ui/ReminderSettings.tsx:289
- **Ters yön:** src/app/personel/toplu-odeme.tsx:30 + :434 — insets modal DIŞINDA (override'lı bağlamda) okunup içeri taşınıyor → sabit yükseklikli sheet'in altında ~72px hayalet boşluk.

**NEDEN ÖNEMLİ** · Buton ve son liste satırları sistemin yukarı-kaydır jest şeridine giriyor; dokunuş yerine "ana ekrana dön" tetiklenebiliyor. DateTimePicker'da spinner'ın kendisi sürüklenebilir olduğu için çakışma en belirgin orada.

**DÜZELTME** · Her sheet'te `useSafeAreaInsets()` çağır ve `paddingBottom: Math.max(insets.bottom, spacing.lg)` (veya kardeşlerdeki gibi `insets.bottom + spacing.md`) uygula — ui/Modal içeriği ModalInsets ile sardığı için modal İÇİNDE okunan inset gerçek (bar'sız) değeri döner, hayalet boşluk riski yok. toplu-odeme'de ise ters yönü düzelt: sheet gövdesini Modal'ın içinde render edilen bir bileşene taşı ve inset'i orada oku, ya da RealInsetsContext'i tüketen bir `useRealInsets()` hook'u ekleyip tüm sheet'lerde onu kullan.

---

### 10. Çift başlık: native header + sayfa içi başlık

**NE** · _layout aynı rotaya native header veriyor, sayfa da kendi başlığını çiziyor.

**NEREDE** · src/app/personel/ekle.tsx:108-111 (aynı i18n anahtarı, _layout.tsx:457-467) · src/app/islemler/gelir.tsx:148 (_layout.tsx:469-479) · src/app/islemler/duzenle/[id].tsx:262 (sayfa "Gelir Düzenle" vs header "İşlem Düzenle" — iki farklı başlık üst üste) · src/app/personel/izin-gecmisi/[id].tsx:436-451 (BackButton + başlık + paylaş; _layout.tsx:803-814) · ters yön: src/app/ayarlar/davet-olustur.tsx:65-79 (kardeşleri Stack.Screen ile native başlığı geri açarken bu ekran elle çiziyor).

**NEDEN ÖNEMLİ** · Kullanıcı "Personel Ekle" / "Gelir Ekle" / "İzin Geçmişi" yazısını iki kez, izin geçmişinde iki geri butonuyla birlikte görüyor. Cari ve hesap ekle formlarında bu temizlik bilinçli yapılıp yorumla belgelenmiş (cariler/ekle.tsx:117, hesaplar/ekle.tsx:120-121), bu ekranlar atlanmış.

**DÜZELTME** · personel/ekle ve islemler/gelir'de sayfa içi h2'yi sil (gelir.tsx'te Bell butonu kalsın, headerRow `justifyContent:'flex-end'`), boşluğu `scrollContent.paddingTop: spacing.md` ile ver. izin-gecmisi'nde sayfa içi header bloğunu kaldırıp kardeş detay sayfalarının desenine geç: `<Stack.Screen options={{ headerBackVisible:false, headerLeft: () => <BackButton size={28} />, headerRight: ... }} />`. davet-olustur'u da paylasilan-isletmeler.tsx:116-124 kalıbına çevir.

---

### 11. Nakit Akışı, rapor alanının paylaşılan bileşenlerini hiç kullanmıyor (5 bulgu)

**NE** · Dokuz ekranlı rapor alanının tek istisnası; dönem gezgini, hata dalı, yenileme ve tarih seçici hepsi elle yazılmış.

**NEREDE** · src/app/nakit-akisi/index.tsx:174-191 (elle yazılmış dateNav, etiket düz Text — tıklanamıyor) · :319 ve :359 (DateTimePicker min>max koruması yok) · :139 (RefreshControl yok) · :253-279 (error dalı yok) · :390 (oklar 34px, hitSlop yok).

**NEDEN ÖNEMLİ** · (a) 8 ay geri gitmek için oka 8 kez basmak gerekiyor, komşu raporda tek dokunuş; (b) gelecek tarihli startDate ile native UIDatePicker min>max çökmesi — CustomDateRangePicker.tsx:35-41 bu çökmeyi zaten yorumla belgeleyip kırpıyor, ulaşım yolu PeriodNavigator sınırsız offset → raporlar/index params → useReportRouteState; (c) sorgu patlayınca "Bu dönemde giriş yok" yazıyor, kullanıcı verisinin sıfır olduğunu sanıyor ve tekrar deneme yolu yok; (d) aşağı çekince hiçbir şey olmuyor.

**DÜZELTME** · dateNav bloğunu (174-191) `<PeriodNavigator ... />` ile, elle yazılmış iOS/Android picker bloklarını (155-172 + 283-362) `<CustomDateRangePicker ... />` ile değiştir; ScrollView'a `usePullToRefresh(cashFlow.refetch)` + RefreshControl, skeleton dalından önce `cashFlow.error ? <Text color="error">dataLoadError</Text> + <Button variant="ghost" onPress={refetch}>retry</Button>` dalını ekle. Bu tek hamle beş bulgunun beşini de kapatıyor ve showStartPicker/showEndPicker state'leri ile pickerModal*/dateNav stillerini de siliyor.

---

### 12. Paylaşılan bileşen dururken elle yazılmış kopya (10 yüzey)

**NE** · Aynı işi yapan bir ui/paylaşılan bileşen mevcutken ekran kendi versiyonunu çiziyor; ikisi görsel olarak ayrışmış.

**NEREDE** ·
- src/app/personel/ekle.tsx:113-146 — yatay Card şeridi yerine CurrencyPicker (cariler/ekle.tsx:146-148, hesaplar/ekle.tsx:152)
- src/app/urunler/toplu-giris.tsx:541-556 + toplu-cikis.tsx:541-556 — elle TextInput yerine ModalSearchBar
- src/app/foto-import/review.tsx:714/:772/:845 — üç picker'da aynı kopya
- src/app/urunler/[id].tsx:661-712 — elle alt-sheet yerine DetailActionMenu (diğer üç detay sayfası kullanıyor)
- src/app/cariler/[id].tsx:1445-1485 — elle satır yerine OpeningBalanceRow (hesaplar/[id].tsx:890, personel/[id].tsx:764)
- src/app/cariler/[id].tsx:291-449 — dosya içinde ikinci ProductDetailModal tanımı (paylaşılanı hesaplar/[id].tsx kullanıyor)
- src/app/cariler/[id].tsx:1174 — DetailSummaryCard'ın elle kopyası
- src/app/ayarlar/isletme.tsx:350-401 — ChangePasswordModal yerine kendi modalı
- src/app/raporlar/genel.tsx:121-134 + src/app/nakit-akisi/index.tsx:122-135 — ReportExportButton yerine kopya JSX
- src/app/ayarlar/isletme.tsx:18-31 ile src/app/kurulum.tsx:38-51 — SECTORS dizisi birebir iki kopya

**NEDEN ÖNEMLİ** · Bugün çoğu benzer görünüyor ama ayrışmalar zaten başlamış: aynı ⋮ aksiyonu üründe alttan sheet, diğer üçünde sağ-üst dropdown; başlangıç bakiyesi cari'de 44px ikon kutusu + işaretli tutar, hesap/personel'de aksan bar + mutlak değer; ürün seçici arama alanı bir yerde cam pill 17pt, diğerinde 12px köşeli 15pt ve temizleme X'i yok. Kopyalarda a11y etiketleri de kayıp. En ağırı isletme.tsx'teki şifre modalı: PasswordStrengthIndicator ve `weak` kapısı yok, yani kullanıcı sıfırlama akışından koyamadığı zayıf şifreyi Ayarlar'dan koyabiliyor (ChangePasswordModal.tsx:52-54 ve register.tsx:63-65 kapıyı uyguluyor).

**DÜZELTME** · Her yüzeyde elle yazılmış blok + ona ait StyleSheet anahtarlarını silip paylaşılan bileşeni çağır. cariler/[id]'deki OpeningBalanceRow geçişinde "boş+düzenlenebilir → Ekle CTA" davranışı korunacaksa bileşene opsiyonel `emptyCta` prop'u ekle; DetailSummaryCard'a `topStrip` prop'u (zaten var) ile bağlantılı şeridi geçir. SECTORS'ı src/constants/sectors.ts'e taşı. isletme.tsx'te en azından PasswordStrengthIndicator + weak-gate'i ekle, tercihen ChangePasswordModal'a geç.

---

### 13. Dokunma hedefi 44px eşiğinin altında (11 yüzey)

**NE** · Header ve satır içi butonlarda ne yeterli padding ne hitSlop var; kod tabanında HIT_SLOP sabiti mevcut ve başka yerlerde kullanılıyor.

**NEREDE** · src/app/urunler/[id].tsx:451-462 (22px ve 24px — tamamen çıplak) · src/app/raporlar/kategori/[id].tsx:703 (34px, a11y etiketi de yok) · src/app/kategoriler/index.tsx:255-273 (34px, düzenle/sil 4px arayla, biri yıkıcı) · src/app/ayarlar/paylasilan-isletmeler.tsx:237/:313/:322 (23–32px, ikisi yıkıcı) · src/app/nakit-akisi/index.tsx:175-189 (34px) · src/app/urunler/index.tsx:612/:624 (34px) · src/components/ui/IconPicker.tsx:322, ParentCategoryPicker.tsx:152, UnitPicker.tsx:209 (32px kapatma X'i) · src/app/onboarding.tsx:182 (~31px "Atla") · src/components/ui/NotificationBell.tsx:203 (36px, hitSlop yok).

**NEDEN ÖNEMLİ** · Iskalanan dokunuşlar; en riskli olanları yıkıcı aksiyonların yanında (düzenle yerine sil, işletmeden ayrıl). IconPicker/ParentCategoryPicker'da bu X modalın TEK çıkışı (backdrop kapanmıyor, bkz. tema 21) — kullanıcı kilitlenmiş hissediyor.

**DÜZELTME** · Çoğunda tek satır: `hitSlop={HIT_SLOP.md}` (veya oklarda `HIT_SLOP.sm`). İki istisna: kategoriler/index'te aradaki boşluk 4px olduğu için hitSlop komşu hedefle çakışır — orada `actionButton` padding'ini spacing.md'ye çıkar; paylasilan-isletmeler'de leaveButton'ı 32→40px yap. urunler/[id]'de ayrıca `style={styles.headerBtn}` + `headerRightContainer` stillerini kardeş detay sayfalarından kopyala, `gap: 12` ham sayısını `gap: spacing.xs, marginRight: spacing.sm` yap. kategori/[id]'de bloğu doğrudan paylaşılan `<ReportExportButton />` ile değiştir (hitSlop + a11y hazır gelir).

---

### 14. Cam dili istisnaları: header'daki tek yüzeysiz kontrol ve tek opak FAB

**NE** · Cam gruplara ait olması gereken iki kontrol eski/ham görünümde kalmış.

**NEREDE** · src/components/ui/NotificationBell.tsx:203-207 + :320-326 (TabHeader'ın GlassContainer'ı içinde, GlassIconButton ile AddEntityButton arasında ham TouchableOpacity — cam yok, tint yok, hitSlop yok, a11y yok) · src/app/personel/izin-gecmisi/[id].tsx:525-534 + :701-713 (elle yazılmış opak 56px FAB, hemen üstündeki AddNoteButton ise GlassFab).

**NEDEN ÖNEMLİ** · Ana sayfa header'ının sağ grubu "cam daire · çıplak ikon · yeşil pill" diye üçe ayrışıyor; GlassIconButton'ın var oluş nedeni (yan yana yardımcı aksiyonlar tek kapsüle erisin) tam ortasından deliniyor. İzin geçmişinde 8px arayla bir cam bir opak iki yüzen buton yan yana duruyor — AddNoteButton'ın kendi yorumunun "düzeltildi" dediği durum. Ayrıca dikey aralık burada spacing.sm=8, diğer detay sayfalarında 70; `bottom: insets.bottom + 16` de ham sayı.

**DÜZELTME** · Çan tetikleyicisini GlassIconButton'a sar (rozet/urgentDot absolute konumlu olduğu için children olarak içeride kalabilir) — düzeltme bileşen tarafında yapılmalı, çağrı yerinde değil. İzin geçmişinde styles.fab'ı silip `<GlassFab style={[styles.fab, { bottom: spacing.lg + insets.bottom }]} renderIcon={...} />` kullan ve AddNoteButton'ı diğer sayfalardaki gibi `bottom: spacing.lg + insets.bottom + 70` ile ayrı konumlandır (fabContainer kalksın).

---

### 15. Dil/Para birimi modallarında kartın üstüne basmak modalı kapatıyor

**NE** · modalContent düz bir View ve backdrop TouchableOpacity'sinin doğrudan çocuğu; dokunuş ebeveyne bubble ediyor.

**NEREDE** · src/app/(tabs)/daha.tsx:483 (dil) ve :526 (para birimi); overlay :625-631 tüm ekranı kaplıyor.

**NEDEN ÖNEMLİ** · Kullanıcı dil seçmek için modalın başlığına, seçenekler arasındaki boşluğa veya dolguya dokunduğunda modal seçim yapılmadan kapanıyor.

**DÜZELTME** · İki `<View style={styles.modalContent}>` satırına `onStartShouldSetResponder={() => true}` ekle (src/app/arama.tsx:877 ile birebir) ya da backdrop'u src/components/transaction/ProductDetailModal.tsx:40-43'teki gibi kardeş absolute katmana çıkar.

---

### 16. Ürünler sekmesinde yükleme sırasında tüm chrome kayboluyor

**NE** · isLoading iken erken return ile ekranın tamamı ortalanmış "Yükleniyor…" metniyle değiştiriliyor.

**NEREDE** · src/app/urunler/index.tsx:756-764 (TabHeader :768 ve FloatingSearchBar :811 hiç render edilmiyor) · karşılaştırma: cariler.tsx:888/:939, personel.tsx:692, (tabs)/index.tsx:486.

**NEDEN ÖNEMLİ** · Başlık, Excel/sırala/+EKLE cam butonları ve arama çubuğu kaybolup veri gelince bir anda geri geliyor — sekmeler arasında gezerken ürünlerde chrome sıçraması. Diğer üç ana sekmenin hiçbiri erken dönmüyor.

**DÜZELTME** · Erken return'ü kaldır: `data={isLoading ? [] : listData}` + listHeaderComponent sonuna `{isLoading && <SkeletonAccountList count={5} />}` (bileşen '@/components/ui'den export'lu).

---

### 17. Personel başlangıç bakiyesi yetki kontrolü olmadan düzenlenebilir

**NE** · OpeningBalanceRow'a `editable` koşulsuz true veriliyor.

**NEREDE** · src/app/personel/[id].tsx:784-791 · karşılaştırma: hesaplar/[id].tsx:525-526 (`canUpdate('hesaplar', ...)`), cariler/[id].tsx:614 (`!isViewer`).

**NEDEN ÖNEMLİ** · 'personel' modülünde güncelleme yetkisi olmayan üye kalem ikonunu görüyor ve BalanceEditorModal'ı açabiliyor. Sayfa `canUpdate`'i zaten import edip menüde kullanıyor (:240, :856) — veri elinin altında. Ayrıca aynı kontrolün disabled görselini üç sayfada üç farklı kural belirliyor.

**DÜZELTME** · `const isBalanceEditable = canUpdate('personel', personel?.created_by ?? null);` türet ve `editable={isBalanceEditable} onEdit={isBalanceEditable ? handleOpenEditBalance : undefined}` geç (bileşen canEdit=false'ta kalemi gizleyip TouchableOpacity'yi View'e düşürüyor).

---

### 18. Not listesi yüzen arama çubuğu payını kaybetti

**NE** · contentContainerStyle dizisinde sondaki `contentPaddingBottom`, bir öncekindeki `insets.bottom + FLOATING_SEARCH_CLEARANCE`'ı eziyor; hook `search` seçeneği olmadan çağrıldığı için 80px'lik pay yok oldu.

**NEREDE** · src/app/notlar/index.tsx:393 + :86 (FloatingSearchBar :414'te gerçekten var).

**NEDEN ÖNEMLİ** · Listenin son notu yüzen arama pill'inin altında kalıyor. Arama çubuğu olan diğer dört liste payı koruyor (arsiv:542, cariler:958, urunler:797, personel:746).

**DÜZELTME** · :86'yı `useContentBottomPadding({ search: true })` yap, :393'ü tek boşluğa sadeleştir: `[styles.listContent, { paddingBottom: contentPaddingBottom }]` (insets ve FLOATING_SEARCH_CLEARANCE import'ları da düşer).

---

## DÜŞÜK — Tutarlılık, ölü kod, latent tuzaklar

### 19. Ölü stiller ve üstü örtülen alt boşluk değerleri (tuzak)

**NE** · Alt boşluk iki yerde tanımlı ve StyleSheet'teki hiç uygulanmıyor; ayrıca Screen geçişinden kalan kullanılmayan `container` stilleri.

**NEREDE** · src/app/(tabs)/cariler.tsx:1185 vs :958 · src/app/(tabs)/personel.tsx:992 vs :754 · src/components/urunlerPage/styles.ts:16 vs src/app/urunler/index.tsx:797 · src/app/hesaplar/[id].tsx:958, cariler/[id].tsx:1547, personel/[id].tsx:846 (dizide çift paddingBottom, ilki ölü) · `styles.container` 0 referanslı 11 rapor dosyası: raporlar/index.tsx:182, genel.tsx:163, cari.tsx:56, personel.tsx:56, karsilastirma.tsx:77, gelir-gider.tsx:382, alis-satis.tsx:496, net-varlik-trend.tsx:396, kategori/[id].tsx:747, hesap/[id].tsx:273, nakit-akisi/index.tsx:368 · ek ölü anahtarlar: gelir-gider.tsx:435-450 ve alis-satis.tsx:509-524 (dateNav/navBtn/dateLabel), alis-satis.tsx:646 (productMeta), personel/toplu-gider.tsx:29 (kullanılmayan windowHeight) · src/app/arsiv/index.tsx:522 (ListFooter'da footerInset çift sayımı, ~190px boşluk + useMemo dep dizisinde footerInset yok).

**NEDEN ÖNEMLİ** · Bugün zararsız ama okuyan kişi "alt boşluk 32+72 mi insets+72 mi" diye iki cevap görüyor; yalnız StyleSheet'i düzelten kişi sessizce etkisiz kalır, inline'ı kaldıran kişi tab bar yüksekliğini kaybeder. src/app/islemler/index.tsx:635-640 bu tuzağı yaşamış ve yorumla açıkça yasaklamış.

**DÜZELTME** · StyleSheet'lerden `paddingBottom` satırlarını sil, inline değeri `useContentBottomPadding({ search: true })` ile tek kaynağa bağla; ölü `container` ve dateNav/productMeta anahtarlarını sil (zemin rengi Screen'den geliyor); arsiv'de ListFooter'dan footerInset'i çıkar (`paddingBottom: spacing.xl` yeterli).

---

### 20. Palet ve tipografi baypası

**NE** · Ham hex renkler ve ham react-native Text, sabitler mevcutken.

**NEREDE** · Renk: src/app/urunler/[id].tsx:907-939 ('#FEF2F2' vs errorLight '#FEE2E2', '#ECFDF5' vs successLight '#D1FAE5', '#A16207' vs warningDark '#854D0E'; aynı dosya :245-252'de palet sabitleri kullanıyor) · src/components/urunlerPage/ProductRow.tsx:278/:289 (aynı hex'ler ikinci kopya) · src/components/ui/OptionRow.tsx:105-166 (tüm palet dışarıda; #86868B üzeri #F5F5F7 ≈ 3.1:1 kontrast, WCAG AA altı — bileşen ölü) · src/app/foto-import/review.tsx:1121 ve :1196 (colors.warning metni warningLight zemininde, ~1.8:1 — colors.ts:30-37 bu tuzağı yorumla yasaklayıp warningDark'ı tanımlıyor) · src/app/personel/toplu-gider.tsx:556-604 + toplu-odeme.tsx:737-785 (birebir kopya picker stilleri, '#FFFFFF' ve ham 16/20/18/12/24).
Tipografi: src/widgets/finance/FinanceKPIGrid.tsx:9, CategoryDonutWidget.tsx:9, TrendChartWidget.tsx:11 · src/components/urun/QuickUrunBar/QuickUrunBar.tsx:3 (21 kullanım) · src/components/ui/GlassFab.tsx:116.

**NEDEN ÖNEMLİ** · Aynı ekranda iki farklı açık-kırmızı ve iki farklı açık-yeşil yan yana geliyor; palet değişirse bu yüzeyler geride kalıyor. Foto-import banner'ları sarı-üstüne-sarı olduğu için okunmuyor (o ekrana bugün giriş noktası yok, latent). Widget'larda tipografi ölçeği elle yazıldığı için raporlar ana sayfasında KPI metinleri ile hemen altındaki QuickInsights/ExploreGrid metinleri farklı kaynaklardan besleniyor.

**DÜZELTME** · Hex'leri palet karşılıklarına çevir (warning metinleri → colors.warningDark, pill zeminleri → errorLight/successLight veya colors.ts'e semantik ad ekle); Text import'larını '@/components/ui'a çevirip sabit fontSize'ları variant'a taşı; toplu-gider/toplu-odeme picker stillerini ortak bir DateTimeSheet'e çıkar (ui/DateTimePicker kullanılabiliyorsa iki kopya da silinir).

---

### 21. Ölü ve tuzak bileşenler (barrel'dan erişilebilir)

**NE** · Hiçbir ekranda render edilmeyen ama '@/components/ui'dan export edilen bileşenler.

**NEREDE** · src/components/ui/index.ts:13 `SearchInput` (üçüncü bir arama varyantı — cam değil; kural iki yüzeyli: FloatingSearchBar + ModalSearchBar) · src/components/ui/index.ts:19 `AccountReportCard` (eski "kutu" dilinde; kardeşleri IncomeSourceCard/CategoryReportCard yapışık satır diline geçmiş) · src/components/ui/OptionRow.tsx (tek referansı index.ts:31) · src/app/(tabs)/_layout.tsx:10-75 (native bar `display:'none'` olduğu halde HapticTabButton, TabIcon, tabBarLabelStyle/IconStyle duruyor — "sekme görünümü burada ayarlanır" izlenimi veriyor) · src/components/ui/ActionSheet.tsx:277 + BottomSheet.tsx:301 (ui/Modal zaten ModalInsets ile sarıyor, elle sarma iç içe ikinci provider bırakıyor) · src/components/ui/Screen.tsx:52 (footer prop'u koşulsuz `insets.bottom` uyguluyor; useFooterBottomPadding.ts:8-17 tam bunun klavye açıkken ~118px boşluk açtığını "cihazda görüldü" notuyla belgeliyor — bugün hiçbir ekran footer prop'unu kullanmıyor).

**NEDEN ÖNEMLİ** · Oto-tamamlamada doğru bileşenlerin yanında çıkıyorlar; bir sonraki ekran yanlış varyantı seçtiğinde arama dili / kart dili / alt boşluk kırılıyor. Screen footer özellikle kötü: sözleşmenin kendisi 2. yol olarak onu gösteriyor ama primitif o yolda hatalı.

**DÜZELTME** · SearchInput, AccountReportCard, OptionRow'u sil (veya barrel'dan çıkarıp "kullanmayın" notu düş); (tabs)/_layout'ta yalnız `tabBarStyle: display:'none'`, `headerShown`, `freezeOnBlur` ve `href` izin kapısını bırak; ActionSheet/BottomSheet'ten iç ModalInsets çiftini kaldır; Screen.tsx:52'yi `useFooterBottomPadding()` ile besle ya da footer prop'unu tamamen kaldırıp sözleşme metnini düzelt.

---

### 22. tabBarScroll ve tab vurgusu yan etkileri

**NE** · (a) `resetTabBarCollapse` yalnız aktif sekme değişince çalışıyor; (b) `lastY` reset'te 0'a çekiliyor; (c) mutabakat ve vade rotaları getActiveTab'da kayıtlı değil.

**NEREDE** · src/lib/tabBarScroll.ts:16, :36-45, :57-62 · src/components/ui/PersistentTabBar.tsx:166-168 · src/lib/tabBarVisibility.ts:55-58.

**NEDEN ÖNEMLİ** · Ana sayfadan /islemler, /arama veya /hesaplar/[id]'ye gidilince aktif sekme hâlâ 'home' olduğu için efekt tetiklenmiyor; bar daralmış kalıyor ve o ekranlarda onScroll bağlı olmadığı için geri açılamıyor. freezeOnBlur ile scroll konumu korunduğundan kaydırılmış bir sekmeye dönüp yukarı kaydırınca ilk olayda dy = y − 0 pozitif çıkıp bar bir kare daralıyor (titreme). Ayrıca Cariler sekmesinden Mutabakat/Vade açılınca vurgu Ana Sayfa'ya atlıyor.

**DÜZELTME** · Effect'i `activeTab` yerine tam rotaya (`segments.join('/')`) bağla; `lastY`'yi -1 ("ölçülmedi") ile sıfırlayıp ilk onScroll'da yalnız değeri kur, yön kararı verme; tabBarVisibility.ts'e `if (first === 'mutabakat') return 'cariler';` ve `if (first === 'vade') return 'cariler';` ekle.

---

### 23. Yükleniyor ve yenileme dili tutarsız

**NE** · Aynı akıştaki ekranlar bekleme/yenileme durumunu farklı gösteriyor.

**NEREDE** · Yükleniyor üç dilde: düz metin (cariler/duzenle/[id].tsx:92, hesaplar/duzenle:106, personel/duzenle:100, kategoriler/duzenle:102), spinner+metin (islemler/duzenle/[id].tsx:216), yalnız spinner (urunler/duzenle/[id].tsx:71); hiç yok: personel/toplu-gider.tsx:50 ve toplu-odeme.tsx:55 (isLoading alınıp hiç kullanılmıyor) · rapor alanında ActivityIndicator vs Skeleton: raporlar/kategori/[id].tsx:504 ve :593 vs hesap/[id].tsx:230 · RefreshControl: kategori/[id].tsx'te üç FlatList'ten yalnız :727'de var (:522 ve :627'de yok); hesap/[id].tsx:249 ve net-varlik-trend.tsx:146 Android `colors` prop'unu vermiyor (spinner gri kalıyor) · kategoriler/duzenle/[id].tsx:32+102 (isLoading destructure edilmediği için silinmiş/geçersiz id sonsuza dek "Yükleniyor" gösteriyor).

**NEDEN ÖNEMLİ** · Aynı jest (aşağı çek) aynı ekranda kategoriye göre çalışıp çalışmıyor; iki drill-down arasında gidip gelirken sayfa "yeniden yükleniyormuş" gibi zıplıyor.

**DÜZELTME** · Tek yükleniyor kalıbı seç (islemler/duzenle'deki spinner+metin en zengini) ve altı düzenleme ekranında uygula; rapor alanında Skeleton'a hizala; eksik `refreshControl` ve `colors={[colors.primary]}` proplarını ekle; kategoriler/duzenle'de `isLoading` destructure edip `!kategori` için ayrı "bulunamadı" + Geri dalı ekle.

---

### 24. Küçük görsel dil farkları

**NE** · Aynı kontrolün iki yerde farklı ölçü/renk/zemin taşıması.

**NEREDE** · src/app/taksit/[id].tsx:229 (header paylaş: inline hitSlop + 20px + primary; kardeşleri HIT_SLOP.md + 22px + colors.text) · src/app/raporlar/gelir-gider.tsx:416 vs alis-satis.tsx:586 (katlanır grup başlığı: biri zeminli kart, öteki çıplak satır) · src/app/urunler/index.tsx:989 vs urunler/[id].tsx:890 (Miktar/Tutar toggle — yorumu "aynı görünüm" diyor ama 12pt/700/upperTr vs 14pt/600) · src/app/cariler/duzenle/[id].tsx:281 (32) vs cariler/ekle.tsx:241 (12) vs kategoriler/ekle.tsx:329 (20) — form üst boşluğu üç değerde · src/app/personel/toplu-gider.tsx:511 + toplu-odeme.tsx:639 (footer surface + 1px; kardeşleri background + hairline) · src/components/urun/UrunForm.tsx:111 (keyboardVerticalOffset sabit 100; altı form insets.top + 44 türetiyor) · src/components/ui/NotificationBell.tsx:385 (dropdown paddingTop sabit `spacing.xl + 44` "safe area"; gerçek insets.top 20–59) · src/app/mutabakat/[cariId].tsx:475 ve src/app/verify.tsx:98 (Screen primitifi yerine ham View) · src/components/ui/IconPicker.tsx:318 ve ParentCategoryPicker.tsx:148 (backdrop'a dokunmak kapatmıyor; UnitPicker/CurrencyPicker/CategoryPicker kapatıyor) · src/app/kurulum-tamam.tsx:59 (kurulum akışındaki tek kaydırılamayan ekran; SE sınıfında "Şimdi değil" kırpılabilir) · src/app/(tabs)/cariler.tsx:920/:924/:928, personel.tsx:721/:724, urunler/index.tsx:773/:778 (GlassIconButton accessibilityLabel'sız — 7 çağrıdan yalnız ana sayfadaki veriyor).

**NEDEN ÖNEMLİ** · Tek başına hiçbiri iş kaybettirmiyor, ama toplamı "ekranlar farklı ellerden çıkmış" hissi veriyor; picker'larda öğrenilen jestin başka picker'da işlememesi ve ekran okuyucuda isimsiz butonlar somut sürtünme.

**DÜZELTME** · Her birini kardeşinin değerine hizala (hitSlop/ikon boyutu/renk, footer zemini, form paddingTop'u tek değere sabitle, offset'i insets'ten türet, dropdown'a `insets.top + spacing.md` ver); IconPicker ve ParentCategoryPicker overlay'ini UnitPicker'ın iki katlı TouchableWithoutFeedback kalıbına çevir; mutabakat/[cariId] ve verify'ı `<Screen>`/`<Screen top>` ile sar; kurulum-tamam'ı ScrollView'a çevir (`flexGrow: 1, justifyContent: 'center'`); altı GlassIconButton çağrısına mevcut i18n anahtarlarından etiket geç. gelir-gider/alis-satis grup başlığını tek bir CollapsibleGroupHeader'a, iki Miktar/Tutar toggle'ını tek bir OzetModeToggle'a çıkar.

---

## Tek dosyada toplanan hızlı işler (15 dakikadan kısa)

| # | Dosya:satır | İş |
|---|---|---|
| 1 | src/app/taksit/index.tsx:364, :218 | insets.bottom ekle — **yüksek etkili, tek dosya** |
| 2 | src/app/notlar/index.tsx:348 | paddingBottom'ı yatay FlatList'ten kaldır |
| 3 | src/app/notlar/index.tsx:86 | hook'u `{ search: true }` ile çağır, :393'ü sadeleştir |
| 4 | src/app/ayarlar/islem-gecmisi.tsx:206 → :224 | paddingBottom'ı dikey ScrollView'a taşı |
| 5 | src/app/ayarlar/davet-olustur.tsx:85 | contentPaddingBottom ekle, :123 marginBottom hack'ini sil |
| 6 | src/widgets/finance/CategoryDonutWidget.tsx:88 | onNavigate'e `{ type: selectedType }` ekle — boş rapor bug'ı |
| 7 | src/app/personel/toplu-gider.tsx:212 ve toplu-odeme.tsx:250 | keyboardVerticalOffset ekle (insets toplu-odeme'de :30'da hazır) |
| 8 | src/lib/tabBarVisibility.ts:55 | mutabakat + vade için 2 satır |
| 9 | src/app/personel/ekle.tsx:108-111 | çift başlık h2'sini sil |
| 10 | src/app/islemler/gelir.tsx:148 | çift başlık h2'sini sil (Bell kalsın) |
| 11 | src/app/(tabs)/daha.tsx:483, :526 | `onStartShouldSetResponder={() => true}` |
| 12 | src/components/mutabakat/ReportStep.tsx:725 ve SelectStep.tsx:23 | useContentBottomPadding + inline paddingBottom |
| 13 | src/app/taksit/[id].tsx:253 | aynı hook + inline paddingBottom |
| 14 | src/components/ui/DateTimePicker.tsx:268, ReminderSettings.tsx:289 | insets.bottom ekle (primitif — geniş etki) |
| 15 | src/app/personel/[id].tsx:789 | `editable` için canUpdate kontrolü türet |
| 16 | src/app/raporlar/kategori/[id].tsx:522, :627 | refreshControl prop'unu kopyala |
| 17 | src/app/raporlar/hesap/[id].tsx:249 ve net-varlik-trend.tsx:146 | `colors={[colors.primary]}` ekle |
| 18 | src/app/urunler/[id].tsx:451-462 | headerBtn stili + HIT_SLOP.md |
| 19 | src/app/urunler/index.tsx:612, :624 · nakit-akisi/index.tsx:175-189 | `hitSlop={HIT_SLOP.sm}` |
| 20 | src/components/ui/IconPicker.tsx:322, ParentCategoryPicker.tsx:152, UnitPicker.tsx:209 | `hitSlop={HIT_SLOP.md}` |
| 21 | src/app/onboarding.tsx:182 | hitSlop veya padding spacing.md |
| 22 | src/app/urunler/[id].tsx:907-939 · foto-import/review.tsx:1121, :1196 | hex'leri palet sabitlerine çevir |
| 23 | src/app/hesaplar/[id].tsx:958, cariler/[id].tsx:1547, personel/[id].tsx:846 | çift paddingBottom'ın ilkini sil |
| 24 | src/components/ui/index.ts:13, :19 | SearchInput + AccountReportCard export'larını sil |
| 25 | src/components/ui/ActionSheet.tsx:277, BottomSheet.tsx:301 | iç ModalInsets sarmasını kaldır |
| 26 | src/app/personel/toplu-gider.tsx:29 | kullanılmayan windowHeight'ı sil |
| 27 | src/app/taksit/[id].tsx:229 | hitSlop → HIT_SLOP.md, size 22, colors.text |
| 28 | src/app/urunler/index.tsx:756-764 | erken return'ü kaldır, skeleton'a çevir |

Kalan işler tek dosyada bitmiyor: vade header kaydı (_layout), nakit-akışı bileşen geçişi, PhotoViewerModal animasyon yeniden tasarımı, 10 yüzeydeki kopya→paylaşılan bileşen geçişleri ve Screen.footer sözleşme kararı.