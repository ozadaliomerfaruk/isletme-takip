# UI/UX Guncellemeleri Plani - Defter App

WhatsApp, Twitter/X, Instagram ve Airbnb'den ilham alan kapsamli iyilestirme plani.

**Branch:** `ui-ux-modernization`
**Geri donus:** `master` branch'ine donulerek tum degisiklikler geri alinabilir.

**Animasyon Kurallari (tum plan boyunca gecerli):**
- Kural 1: Ayni ekranda ayni anda max 2 animasyon (ornek: press scale + sayi animasyonu OK, ama press + stagger + counter + fade hep birden HAYIR)
- Kural 2: FlatList scroll sirasinda ASLA animasyon tetikleme. Animasyonlar sadece ilk mount/enter aninda calisir.
- Kural 3: Tum animasyonlar Reanimated worklet'lerde calisir (JS thread bloke edilmez, 60fps garanti)

---

## P0 - EN YUKSEK ONCELIK (Hemen hissedilir fark yaratir)

### 1. Animated Pressable Buttons (Instagram/Airbnb ilham)
**Neden:** Instagram ve Airbnb'de her butona bastiginizda hafif bir scale-down animasyonu olur. TouchableOpacity sadece opacity dusuruyor - bu 2018 tarzinda.

**Dosyalar:**
- `src/components/ui/Button.tsx`
- `src/components/ui/Card.tsx` (onPress olan kartlar)

**Degisiklik:**
- `TouchableOpacity` yerine `Pressable` + `react-native-reanimated` kullan
- Press aninda `scale: 0.97` spring animasyonu (useAnimatedStyle + useSharedValue)
- Release aninda `scale: 1.0` spring-back
- Card bilesenine de ayni animasyonu ekle

**Onemli:** TransactionRow gibi liste satirlarinda scale animasyonu KULLANILMAYACAK. Liste item'larinda sadece opacity degisimi (0.7) yeterli. Scale animasyonu yuzlerce satir iceren listelerde gorsel kaos yaratir ve performans dusurur. Scale sadece Button ve Card icin.

```
Button/Card: onPressIn -> scale 0.97, onPressOut -> scale 1.0
Liste satirlari: sadece activeOpacity={0.7} (mevcut hali korunur)
```

---

### 2. Soft Shadow Sistemi (Airbnb ilham)
**Neden:** Mevcut elevated Card'da `shadowOpacity: 0.25` ve `elevation: 5` var - sert ve eski gorunuyor. Airbnb cok daha yumusak golge kullanir.

**Dosyalar:**
- `src/constants/spacing.ts` (shadow presets ekle)
- `src/components/ui/Card.tsx`
- Dashboard kartlari, summary carousel

**Degisiklik:**
Platform-aware shadow presets:
- iOS: shadowOpacity dusuk + radius yuksek = yumusak golge
- Android: elevation degeri dusuk tutularak ayni etkiye yaklasilir

---

### 3. Transaction Row Modernizasyonu (WhatsApp/Twitter ilham)
**Neden:** Sol accent bar (3px cizgi) gorsel olarak zayif. Kategoriye dayali ikonlar ile islem satiri cok daha taninir ve hizli taranabilir olur.

**Dosyalar:**
- `src/components/ui/TransactionRow.tsx`
- Yeni: `src/components/ui/TransactionIcon.tsx`

**Degisiklik:**
- Sol accent bar -> 40x40 daire ikon
- Daire rengi islem tipine gore (income=yesil, expense=kirmizi, transfer=mavi)
- Metin hiyerarsisi guclendirilecek:
  - 1. satir: Entity/kisi adi (semibold, 15px) + tutar
  - 2. satir: Islem tipi (renkli, kucuk) + tarih
  - 3. satir: Hesap adi (muted, 12px)

---

### 4. Client/Personnel Avatar Sistemi (WhatsApp ilham)
**Neden:** WhatsApp'in en taninir ozelligi. Listeler gorsel olarak monoton.

**Dosyalar:**
- Yeni: `src/components/ui/Avatar.tsx`
- `src/app/(tabs)/cariler.tsx`, `personel.tsx`, detay sayfalari

**Degisiklik:**
- 40px daire, ismin ilk harfi, deterministik renk
- WCAG AA uyumlu kontrast garanti
- Detail sayfalarda 64px buyuk avatar

---

### 5. Animated Tab Bar Indicator (Twitter/X ilham)
**Neden:** Twitter'da tab degistirdiginde alt cizgi animasyonlu kayar. Mevcut gecis statik.

**Dosyalar:**
- `src/components/ui/TabFilter.tsx`
- `src/app/(tabs)/_layout.tsx`

**Degisiklik:**
- TabFilter: Reanimated ile kayan indicator
- Bottom tab: sadece dot indicator (scale-up YAPILMAYACAK)

---

### 6. Date Section Header Pill Tasarimi (WhatsApp ilham)
**Neden:** Mevcut cizgi-tarih-cizgi formati eski.

**Dosyalar:**
- `src/components/ui/TransactionRow.tsx` (DateSectionHeader)

**Degisiklik:**
- Pill/chip seklinde tarih etiketi
- "Bugun", "Dun" gibi relative tarihler

---

## P1 - YUKSEK ONCELIK

### 7. Floating Action Button (FAB) (Twitter/Instagram ilham)
- Sag alt 56px buton, speed-dial menu (Gelir/Gider/Transfer/Cari)
- Scroll'da gizlen/goster

### 8. Swipe Actions Iyilestirmesi (WhatsApp/iOS Mail ilham)
- Sola: Sil (kirmizi), Saga: Duzenle (mavi)
- UndoSnackbar ile kazara silme korunmasi

### 9. AnimatedNumber (Bankacilik ilham)
- Basit interpolasyon (0.6-0.8sn), slot makinesi DEGIL
- Dashboard bakiyeleri ve hesap detay

### 10. Staggered List Animasyonlari (Twitter ilham)
- Sadece ilk mount, max 6 item, scroll'da ASLA
- FadeInDown + delay stagger

### 11. Pull-to-Refresh Iyilestirmesi
- Primary tintColor + haptic success feedback

### 12. Success Mikro-Animasyonu
- Buton icinde check animasyonu, confetti/modal DEGIL
- Toast animasyonu iyilestirmesi

### 13. Floating Label Input (Material Design ilham)
- Sadece metin alanlari, CurrencyInput/AmountInput HARIC
- Reanimated ile floating label gecisi

---

## P2 - ORTA ONCELIK

### 14. Collapsible Header (Airbnb ilham)
- Prototip + test ile. Kullanici testi sonucuna gore karar
- Pull-to-refresh cakisma riski yonetilmeli

### 15. Improved Empty States
- Animasyonlu giris, tesvik edici metinler, belirgin CTA

### 16. Onboarding Iyilestirmesi
- Parallax, buyuk animasyonlu ikonlar, progress bar

### 17. Daha Sayfasi Yeniden Tasarimi
- Gruplu section'lar, card-based, profil karti

### 18. Arama/Filtre UX Iyilestirmesi
- Animasyonlu cancel butonu, focus/blur gecisleri

### 19. Gradient Dokunuslari
- SADECE hero bakiye kartinda, cok sinirli kullanim

---

## UYGULAMA SIRASI

### Faz 1 - Cekirdek Primitifler
1. Shadow presets (platform-aware)
2. AnimatedPressable wrapper
3. Avatar bileseni
4. TransactionIcon bileseni

### Faz 2 - Dashboard ve Listelerin Kalbi
5. Button AnimatedPressable entegrasyonu
6. Card soft shadow + press animasyonu
7. TransactionRow modernizasyonu
8. Avatar entegrasyonu (Cariler/Personel)
9. TabFilter sliding indicator
10. DateSectionHeader pill
11. Swipe actions (2 yon)
12. FAB

### Faz 3 - Kontrollu Hareket
13. AnimatedNumber
14. Pull-to-refresh
15. Staggered list
16. Success mikro-animasyon

### Faz 4 - Form ve Girdi
17. Floating label Input
18. Search UX

### Faz 5 - Buyuk Ozellikler
19. Collapsible header
20. Daha sayfasi
21. Empty states
22. Onboarding
23. Gradient

---

## GERI DONUS STRATEJISI

Tum degisiklikler `ui-ux-modernization` branch'inde yapiliyor.
- Begenilmezse: `git checkout master` ile aninda geri donulebilir
- Kismen begenilirse: Cherry-pick ile sadece istenen degisiklikler alinabilir
- Her faz sonunda commit atilacak, boylece faz bazinda da geri donulebilir
