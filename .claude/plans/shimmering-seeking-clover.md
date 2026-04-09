# Morphing Card — ActionSheet'i Kart İçine Taşı

## Konsept
"..." butonuna basınca ActionSheet modal açmak yerine, kart genişleyerek aksiyonları (Düzenle, Arşivle, Sil) inline gösterir. Modal yok, kart kendisi dönüşür.

## Mevcut Yapı
- ExpandableCard chevron'a basınca genişliyor → "İşlem Yap" + "Hareketleri Gör" butonları
- "..." butonu ayrıca ActionSheet modal açıyor → "Düzenle" + "Arşivle" + "Sil"
- Bu pattern 3 sayfada aynı: `index.tsx` (hesaplar), `cariler.tsx`, `personel.tsx`

## Yeni Tasarım
ExpandableCard genişlediğinde **iki satır** gösterir:
1. **Üst satır (primary):** İşlem Yap + Hareketleri Gör (mevcut)
2. **Alt satır (secondary):** Düzenle + Arşivle + Sil (küçük, ikon-only veya compact butonlar)

"..." butonu kaldırılır. Tüm aksiyonlar kart expand'ında görünür.

## Dosya Değişiklikleri

### 1. `src/app/(tabs)/index.tsx` (Hesaplar)
- "..." MoreVertical butonunu kaldır (line 703-713)
- ActionSheet state ve options'ı kaldır (`actionSheetVisible`, `actionSheetHesap`, `hesapActionSheetOptions`)
- ActionSheet render'ını kaldır (line 876-886)
- ExpandableCard children'a secondary action row ekle:
```tsx
<View style={styles.actionButtons}>
  {/* Primary row — mevcut */}
  <Button variant="primary" size="sm" icon={<Zap />}>İşlem Yap</Button>
  <Button variant="outline" size="sm" icon={<History />}>Hareketleri Gör</Button>
</View>
<View style={styles.secondaryActions}>
  <TouchableOpacity onPress={edit}><Edit3 /><Text>Düzenle</Text></TouchableOpacity>
  <TouchableOpacity onPress={archive}><Archive /><Text>Arşivle</Text></TouchableOpacity>
  <TouchableOpacity onPress={delete}><Trash2 /><Text>Sil</Text></TouchableOpacity>
</View>
```

### 2. `src/app/(tabs)/cariler.tsx`
- Aynı pattern: "..." MoreVertical butonunu kaldır
- ActionSheet state kaldır
- ExpandableCard children'a secondary action row ekle (Düzenle, Arşivle, Sil)
- Sort ActionSheet kalabilir (farklı amaç, kart bazlı değil)

### 3. `src/app/(tabs)/personel.tsx`
- Aynı pattern uygula

### 4. `src/components/ui/ActionSheet.tsx` — KALSIN
- Hala arsiv, urunler, ReviewContext'te kullanılıyor
- Blur + Reanimated versiyonu kalır

## Değişmeyen Dosyalar
- `src/app/arsiv/index.tsx` — ActionSheet kullanmaya devam
- `src/app/urunler/index.tsx` — ActionSheet kullanmaya devam
- `src/contexts/ReviewContext.tsx` — ActionSheet kullanmaya devam
- `src/components/ui/ActionSheet.tsx` — korunur

## Doğrulama
- `npx tsc --noEmit` — tip hatası yok
- `npx eslint src/` — lint hatası yok
- Cihazda test: hesap kartına tıkla → genişlesin → Düzenle/Arşivle/Sil görünsün
