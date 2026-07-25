# AGENTS.md — defterappv2

> Bu dosya, projede çalışan tüm AI ajanları (ChatGPT/Codex, Claude, vb.) için ortak bağlam ve kurallardır.
> Claude Code'un kalıcı hafızasından damıtılmıştır. Son güncelleme: 2026-07-26.
> Buradaki "durum" bilgileri anlık fotoğraftır — koddan ve git geçmişinden teyit etmeden kesin kabul etme.

## Proje nedir

- **İşletme Takip / Defter uygulaması**: esnaf ve küçük işletmeler için gelir-gider, cari (müşteri/tedarikçi), personel, ürün/stok, vade-taksit takibi.
- **Stack:** React Native + Expo (expo-router, dosya-bazlı routing `src/app/`), TypeScript, Supabase (Postgres + RLS + RPC + Edge Functions), TanStack React Query (disk-persist'li read cache), Reanimated, jest.
- **Üretimde ~650 işletme var.** Store'daki eski sürümler aylarca kullanımda kalır — her değişiklikte "eski client ne yaşar?" sorusu geçerlidir.
- Dil: UI Türkçe (i18n altyapısı var), para birimi çoklu (TRY canonical), tarih/kur TR odaklı.
- Hedef kitle esnaf → **sadelik ilkesi**: kullanılmayan özelliğin kartı/giriş noktası UI'da hiç görünmesin. Görünürlük "bu ay kullanıldı mı" gibi dar pencereye değil, özelliğin hiç kullanılıp kullanılmadığına bağlanır.

## PAZARLIK DIŞI çalışma kuralları

1. **DB değişikliği = eski kullanıcı güvenliği (iki defa düşün):**
   - Yalnız **ADDITIVE** migration (yeni kolon DEFAULT'lu / yeni tablo). Kolon silme, yeniden adlandırma, tip değiştirme **YASAK**.
   - Backfill'den kaçın; anlam client'ta hesaplanabiliyorsa kolonu ilk kullanımda doldur.
   - RPC/view değişikliğinde imza korunur (parametre ekleme yalnız DEFAULT'lu); önce mevcut çıktıyı SQL snapshot'la, sonra diff'le.
   - Migration öncesi tam yedek: `node scripts/backup.js`.
   - "1.5.x kullanan eski client bu migration'dan sonra ne yaşar?" sorusuna **yazılı** cevap ver.
2. **Ajan/otomasyon işi bitince doğrulama ana oturumda:** `tsc` + `eslint` + `jest` + Metro bundle bizzat koşulmadan iş "bitti" ilan edilmez. Ajanın "derledim/test ettim" beyanına güvenilmez.
3. **Denetim/audit bulgusu uygulanmadan önce bulgu-başı KOD teyidi:** bulgular yazıldığı anda bayat olabiliyor. Dosyanın güncel halini açıp iddiayı doğrula. Yeni denetim başlatırken prompt'a baz commit SHA + "güncel koddan birebir alıntı" zorunluluğu koy.
4. **Dış spec'ler DANIŞMAN, kod tabanı HAKEM:** dışarıdan gelen spec/rapor körü körüne uygulanmaz; her madde koda karşı doğrulanır, kodda hazır karşılığı olan yeniden yazılmaz, sapmalar gerekçesiyle delta listesi olarak kullanıcıya bildirilir. Migration istenen yerde önce migration'sız alternatif değerlendirilir.
5. **Performans standing öncelik:** kullanıcının hesabında 4 yıl / binlerce işlem var; hedef "Defter" uygulaması akıcılığı. Her kod değişikliğinde: liste sanallaştırma (FlashList/FlatList config), over-fetch/N+1'den kaçınma, gereksiz re-render (inline obj/fn, memo comparator), animasyonlarda native driver. Mevcut görünümü/davranışı bozmadan.
6. **Git hijyeni:** Aynı repoda birden fazla AI session'ı aynı anda çalışabiliyor. **`git add -A` KULLANMA** — yalnız dokunduğun yolları açıkça stage'le. Kullanıcı istemeden commit/push yapma.
7. Cihazda test edilmemiş UI değişikliği "doğrulandı" sayılmaz — kullanıcı telefonda gezerek onaylar; buna alan bırak.

## Domain kuralları (bilinçli tasarım — "tutarsızlık" diye raporlama)

- **Arşiv vs Pasif (kullanıcı kararı, 25 Tem 2026):**
  - **Arşivlenmiş** kayıt (hesap/cari/personel/ürün): gelir-gider raporlarına **GİRER**, Genel Durum'a **GİRMEZ**.
  - **Pasif** (`is_active=false`): ikisine de **GİRMEZ**.
  - Kod bunu zaten doğru uyguluyor; `useArchive` yalnız `is_archived` yazar.
- **Vade/kalan = SAF FIFO (işlem tarihi):** net borç faturalara dağıtılır; en eski önce kapanır, en yeni fatura kalanı taşır, tavan = faturanın kendi tutarı. `cariler.balance` tek gerçek kaynak. Taksit + vade **TEK motor**: `_vade_birim_mahsuplu` (net-bakiye, `COALESCE(vade, tx_date)` sırası) — `islem_tahsis` defterinden ayrı ikinci motor kurma. Hedefli ödeme = `islemler.hedef_islem_id` **pointer**'ı (yalnız create + cari tahsilat/tedarikçi ödemesi; tutar asla ayrıca saklanmaz — kural `src/lib/hedefTahsis.ts` + jest'lerle kilitli).
- **Negatif stok KASITLI** (engellenmez).
- **İki para birimi kavramı:** ana/gösterim para birimi (useSettings) yalnız sembol+locale değiştirir, tutarı **ÇEVİRMEZ**; gerçek para birimi entity'de (`hesap.currency`, `source_currency`...). RPC'ler TRY-canonical döner, çeviri tüketici hook'larda yapılır (desen: `baseCurrency==='TRY' ? v : convertCurrency(v,'TRY',base,rates) ?? v`). Tek-argümanlı `formatCurrency(x)` yeni kodda şüpheyle karşılanır.

## Bilinen tuzaklar (tekrar düşme)

- **`parseCurrency` 3-ondalık tuzağı:** TR locale'de `"2692.828"` → 2.692.828 (~1000x şişme). `setAmount`/parse öncesi float'ı **`roundCurrency` ile 2 ondalığa indir** (KDV'li ürün toplamları 3 ondalık doğurabilir).
- **React Query disk persist şema kuralları:** sorgular **Map/Set DÖNDÜRMESİN** (JSON persist'te `{}` olur → rehydrate crash); sorgu veri şekli değişirse consumer'a savunmacı guard (`Array.isArray` vb.) şart; gerekirse `CACHE_BUSTER` bump.
- **Cache invalidation + raporlar:** rapor ekranlarında odak-refetch yok → arka planda mounted rapor `deferred` invalidation ile yenilenmez. Rapor query key'leri `invalidationMap`'te **immediate** olmalı.
- **iOS modal-üstü-modal DONMASI:** bir RN Modal içinden ikinci Modal açma uygulamayı dondurur. Desen: inline menü (Pressable backdrop + absolute Animated View, modal DEĞİL) → picker'ı ekran bağlamından aç (ana FAB deseni, `(tabs)/index.tsx`).
- **Arama çubuğu mimarisi:** `FloatingSearchBar` YALNIZ 6 ana liste sekmesinde (cariler, personel, ürünler, notlar, işlemler, arşiv); modal/picker'larda **ModalSearchBar** (üste sabit). Modalda floating = bilinen bug. FloatingSearchBar'ın yarış-korumalarını (liftedRef, frameToken) bozma.
- **Alt boşluk sözleşmesi:** overlay cam tab bar ~106px alt boşluk ister; sözleşme `src/components/ui/Screen.tsx` başındaki açıklamada, tek kaynak `useContentBottomPadding`. Yanlış yüzeye (ör. yatay filtre şeridinin contentContainerStyle'ına) uygulama.
- **Ürün hareketi tarihi:** `created_at` değil `islem.date` join'i kullanılır (liste yanlış tarih bug'ı).
- Miktar gösterimi `formatQuantity` helper'ı ile; Türkçe arama `textIncludes` ile (İ/i duyarlılığı); tarih guard'ı `ensureValidDate` (1970 bug'ı).

## Referans dokümanlar (repo içi — güncel durum için önce bunlara bak)

- `docs/DENETIM-UYGULAMA-DURUMU.md` — front-end/liquid-glass denetiminin uygulama durumu ve devam noktası.
- `docs/RAPOR-DENETIMI.md` — rapor ekranları denetimi (160 bulgu); güncel satırlar TAZELEME-2 tablosunda, gövde "NEREDE"leri eski olabilir.
- `docs/I18N-KUR-UYGULAMA-DURUMU.md` + `docs/I18N-KUR-CIHAZ-TESTI.md` — i18n+kur işi (tamamlandı, cihaz turu yapılmadı).
- `docs/TAKSIT-ODEME-HEDEFLEME-TARTISMA.md` — taksit tek-motor / pointer kararının gerekçesi.
- `docs/UI-UX-PRATIKLIK-ANALIZI.md` — UI/UX iş listesi.
- `docs/AUTH-KAYIT-ASILMASI-BULGULAR.md` — QTB kayıt-asılması İLK teşhisi (TARİHSEL; güncel kök neden ve fix durumu için bu dosyanın "Güncel durum fotoğrafı" bölümüne bak).
- `supabase/migrations/` — şema gerçeği; migration adlandırması `YYYYMMDDHHMMSS_ad`.

## Güncel durum fotoğrafı (2026-07-26 — bayatlayabilir, git log ile teyit et)

- Aktif dal: `feat/liquid-glass`. Ana dal: `master`.
- Taksit+vade tek motor: server PROD'da canlı, client commit'li, **build bekliyor** (EAS kotası).
- QTB kaydet-asılması fix'i: **yerel çalışma ağacında uygulandı, commit'lenmedi** (5 dosya: QuickTransactionBar + useQuickTransactionForm + useTransactionSubmit + useIslemler + useUrunHareketler). Tam doğrulama 26 Tem'de ana oturumda koşuldu: typecheck + eslint (0 hata) + jest (yeşil) + Metro iOS bundle (4049 modül, temiz); telefonda ilk deneme olumlu. Commit kullanıcı onayı bekliyor. Kök neden (üretim incelemesiyle netleşti): Postgres/RPC süreleri normaldi; gecikmenin asıl kaynağı istemcideki yavaş ağ ön kontrolü, gereksiz ardışık RPC çağrıları, mutation retry zinciri ve sunucu yazmayı bitirdiği halde yanıtın kaybolduğu durumların belirsiz ele alınmasıydı.
- Açık işler: kullanıcı cihaz turu (birçok özellik için), ileri-tarihli kur migration onayı, hukuki sayfa deploy.
- JWT expiry 7 gün — auth-hang fix'li build yayılınca 3600'e indirilecek.
