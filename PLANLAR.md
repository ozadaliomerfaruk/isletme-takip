# PLANLAR — Tek Bakışta Tüm Plan ve Dokümanlar

> **Bu dosya nedir?** Repodaki tüm plan/doküman dosyalarının ana endeksi + silinen planlardan taşınan açık işler.
> 11 Haziran 2026'da yapılan plan denetimiyle oluşturuldu (14 dosya kodla karşılaştırıldı).
> İşi bitmiş/terk edilmiş 8 plan silindi (listesi en altta — içerikleri git geçmişinde durur).

---

## ✅ Aktif Planlar ve Dokümanlar

| Dosya | Ne işe yarıyor | Durum / Not |
|---|---|---|
| [WEB_PLAN.md](WEB_PLAN.md) | Web sürümü (Next.js) implementasyon planı | Aktif. ⚠️ Faz 0.8'e Apple client secret JWT yenileme notu eklendi (10 Haziran) — web auth'tan önce zorunlu |
| [docs/PLAY_STORE_PLAN.md](docs/PLAY_STORE_PLAN.md) | Play Store yayın/kurulum planı | Kod tarafı hazır, store prosedürleri yarım. **Güncellenmeli:** "iOS yayınlanmadı" bilgisi bayat (iOS yayında, v1.4.0). Bu haftaki Play görünürlük/ASO işinin referansı |
| [test-dosyasi.md](test-dosyasi.md) | ~300 senaryoluk manuel test kontrol listesi | Aktif, v1.4.0'da geçerli. Sürüm öncesi regresyon testlerinde kullan |
| [docs/coklu-kullanici.md](docs/coklu-kullanici.md) | Çoklu kullanıcı sisteminin referans dokümanı (v5) | Sistem kodda tam uygulanmış; kalıcı referans |
| [README.txt](README.txt) | Secret/keystore yedekleme ve kurulum rehberi | Güncel; git dışı gizli dosyaların haritası |

## 🤔 Karar Bekleyen Dosyalar

| Dosya | Bekleyen karar |
|---|---|
| [ONBOARDING-PLANI.md](ONBOARDING-PLANI.md) | Eski onboarding planı (anonim giriş omurgalı, 3 Haziran). **KARAR VERİLDİ (11 Haziran): anonim giriş YAPILMAYACAK** — kayıt aşamasında kullanıcılar zaten kaydoluyor, dökülme kayıt sonrasında. Yeni onboarding planı (tek sektör sorusu → otomatik Kasa/Banka → inline cari → kutlama + bildirim izni) yazılınca bu dosya silinecek |
| [hesap.md](hesap.md) | "Hesap" maskotu + onboarding mockup v2 (Mayıs). **Karar: maskot/tasarım dili kullanılacak mı?** Kullanılmayacaksa sil |
| [docs/iap-yapilacaklar.md](docs/iap-yapilacaklar.md) | RevenueCat abonelik planı — hiç uygulanmadı. **Karar: paralı plan (IAP) hâlâ hedef mi?** WEB_PLAN Faz 4.6 (monetizasyon) ile ilişkili; hedefse tut, vazgeçildiyse sil |
| [docs/app-store-marketing-plan.md](docs/app-store-marketing-plan.md) | App Store ASO/pazarlama planı (v1.2.2 dönemi). İçindeki iOS anahtar kelimeleri Play ASO işinde kullanılacak — **ASO işi bitince silinebilir** |

---

## 📋 Açık Backlog
> `duzeltilecekler.md` silinmeden önce (11 Haziran 2026) açık kalan maddeler buraya taşındı.

### Yeni Özellikler

| # | Başlık | Açıklama |
|---|---|---|
| F2 | Çekle tahsilat | Çek ile tahsilat işlemi yapılabilmeli |
| F4 | Logo ekleme ve sektör bilgisi | Firma logo yükleme, dropdown ile sektör bilgisi, paylaşılan PDF'lere otomatik logo basma. *(Sektör kısmı yeni onboarding işiyle birleşiyor)* |
| F5 | Onboarding ekranı | Sıfırdan tasarım. Sektör sorusu, giriş yapmadan işlem yapabilme, giriş yapınca Supabase sync. *(→ 10 Haziran bulgu seti + ONBOARDING-PLANI kararıyla birleşecek)* |
| F6 | Tedarikçilere tahsilat, müşterilere ödeme butonu | İki yönlü butonlar eklenmeli (şu an tek yönlü) |
| F9 | Global arama ile filtreli arama | Tutar aralığı, tarih aralığı, personel, cari, ürün, hesap bazında filtreleme. Smooth filtreleme ekranı |
| F10 | Multi-user hesap geçişi | Ana sayfada üstte aktif hesap gösterimi, diğer hesaplara hızlı geçiş |

### UI/UX

| # | Başlık | Açıklama |
|---|---|---|
| U1 | İşlem hareket satırları kompaktlaştırılmalı | Satırlar çok yer kaplıyor; tarih/kategori/not/tutar göz hemen okuyabilmeli |
| U4 | Kaydolma ekranını baştan tasarla | *(Yeni onboarding işiyle birleşiyor)* |

### Güvenlik (öncelikli olanlar)

| # | Öncelik | Başlık | Açıklama |
|---|---|---|---|
| S1 | Yüksek | Auth token AsyncStorage'da şifresiz | Supabase session token'ları plaintext. `expo-secure-store` yüklü ama 2KB limiti nedeniyle kullanılmıyor. Çözüm: token'ı bölmek (access_token SecureStore'da) veya encryption wrapper. Test: login/logout/session-refresh/app-kill-restore |
| S2 | Yüksek | Şifre politikası zayıf (min 6) | OWASP önerisi min 8. Çözüm: (1) client-side min 8, (2) Supabase Dashboard > Auth > Password Min Length 8, (3) "weak" skorunda submit engelle |
| S6 | Bilgi | JSON.parse validation eksik | `useReportPeriod.ts` ve `DailyCashModal.tsx`'de parse edilen AsyncStorage verisi validation'dan geçmiyor. Zod şema veya type-guard eklenebilir (risk düşük) |

### Kod Kalitesi / Bilinen Riskler

| # | Başlık | Açıklama |
|---|---|---|
| CR5 | Nakit avans silmede kaynak hesap restore eksik | `perform_taksit_odeme` işlem kaydı oluşturmuyor; `delete_nakit_avans_with_reversal` fuzzy match ile arıyor → `v_islem IS NULL` olursa kaynak hesaba para geri eklenmez. Çözüm: `perform_taksit_odeme`'ye işlem kaydı veya taksit tablosuna `source_hesap_id` FK |
| CR8 | Notlar RLS modül kontrolü eksik (multi-user) | Shared user tüm notları okuyup yazabiliyor; UI engelliyor ama doğrudan API ile erişilebilir. Defense-in-depth için entity_type→modül mapping'i RLS'e eklenebilir |
| CR10 | Import partial batch slice hatası | `useDataImport.ts:324` — RLS rejected row ortadan düşerse yanlış işlemler için bakiye güncellenir |
| CR11 | useUpdateIslem non-atomic balance | `useIslemler.ts:659-684` — client-side 3 adımlı bakiye güncelleme; network hatası ortasında kalırsa tutarsızlık. İdeal çözüm: tek RPC |
| CR12 | Undo import ürün stoku geri almaz | `useImportHistory.ts:361-373` — undo işlemleri siler ama urun_hareketler ve stok miktarları kalır |
| CR13 | Import hash device-local | `useImportHistory.ts:242-266` — AsyncStorage'da; ikinci cihazdan aynı dosya → duplike işlemler |
| CR14 | signInWithApple race condition | `useAuth.ts:690-742` — manuel fetchOrCreateIsletme + onAuthStateChange aynı anda; dedup ref çoğunlukla yakalar ama garantili değil |

**Teorik / şimdilik bekleyebilir:** CR15 `undo_import_batch` ownership yok · CR16 `perform_taksit_odeme` hesap ownership yok · CR17 `id!` non-null assertion detay sayfalarda · CR18 verify.tsx recovery flag timing · CR19 ileri_tarihli modül permission gap

### Multi-User Yetki Sistemi Sadeleştirme (planlanan)

Mevcut sistem aşırı detaylı (13 modül × 5 aksiyon + visibility = 1000+ kombinasyon). Hedef: 3 rol (Yönetici/Operatör/Diğer) + modül başına aç/kapa + 4 kademeli genel yetki seviyesi (görebilir → ekleyebilir → kendi kayıtlarını düzenler → tümünü düzenler).

- [ ] Permissions type'ını sadeleştir (actions objesi yerine tek `permissionLevel` enum)
- [ ] PermissionEditor UI'ını tek ekranlık toggle listesine dönüştür
- [ ] RoleSelector'ı 3 role indir
- [ ] RLS policy'leri yeni yapıya migrate et
- [ ] Mevcut kullanıcıların permission'larını yeni formata çeviren migration

---

## ⏰ Operasyonel Hatırlatmalar

- **Apple client secret JWT — 19 Haziran 2026 22:15 UTC'de doluyor.** Mobil native Apple girişi ETKİLENMEZ (doğrulandı, 10 Haziran). Web sürümünden önce yenilenmesi ZORUNLU — adımlar [WEB_PLAN.md](WEB_PLAN.md) Faz 0.8'de (Team ID: 43WRJ4G6TP, Key ID: J2D248YY2D). Yenileme sonrası her 6 ayda bir rotasyon.
- **Play Console kontrolü:** Uygulama production track'te mi, Türkiye ülke listesinde mi? (1 aydır görüntülenme sıfır — keşif tıkalı.)
- **Yeni onboarding planı yazılacak:** 10 Haziran bulgu seti (tek sektör sorusu → otomatik Kasa/Banka → inline cari → kutlama + bildirim izni pre-prompt'u) + anonim giriş kararı → ONBOARDING-PLANI.md'nin yerini alacak.
- **`push_tokens.locale` bug'ı:** `notify-linked-users` edge function'ı olmayan kolonu sorguluyor — yeni push işlerine başlamadan migration ile kapat.

---

## 🗑️ Silinen Planlar (11 Haziran 2026 — git geçmişinde mevcut)

| Dosya | Neden silindi |
|---|---|
| `duzeltilecekler.md` | v1.4.0 düzeltmeleri yayında; açık maddeler yukarıdaki backlog'a taşındı |
| `refactoring-plan.md` | Refactorlar uygulandı; "bekliyor" denilen 2 migration'ın canlıda olduğu doğrulandı (`20260518020000`, `20260518030000`) |
| `claude-plans/fatura-ocr-gemini-plani.md` | OCR Gemini'ye taşındı, üretimde |
| `claude-plans/morphing-card-plani.md` | Hiç uygulanmadı, vazgeçildi |
| `.claude/plans/shimmering-seeking-clover.md` | Morphing card planının kopyası |
| `.claude/plans/streamed-weaving-sparrow.md` | OCR planının kopyası |
| `docs/TEST_PLANI_bug_duzeltmeleri.md` | 13 düzeltmenin hepsi v1.4.0'da yayında |
| `docs/TEST_PLANI_muhasebe_duzeltmeleri.md` | 8 düzeltmenin hepsi v1.4.0'da yayında |

> Son güncelleme: 2026-06-11
