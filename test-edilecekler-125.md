# Test Listesi — Build 125

## YUKSEK RISK — Mutlaka Test Et

### 1. Cari PDF/Excel Ekstre (BAL3 + BAL5 — muhasebe duzeltmesi)
- [X] Musteri cariden PDF ekstre al → Satis BORC kolonunda, Tahsilat ALACAK kolonunda olmali
- [X] Tedarikci cariden PDF ekstre al → Alis ALACAK kolonunda, Odeme BORC kolonunda olmali
- [X] Tedarikci baslangic bakiyesi dogru mu? (islemi yoksa 0, varsa dogru hesaplanmis)
- [X] Baslangic bakiyesi ve son bakiye dogru kolonda mi? (musteri: BORC, tedarikci: ALACAK)
- [X] Excel ekstre de ayni sekilde dogru mu?

### 2. Personel PDF/Excel Ekstre (BAL4)
- [X] Personel PDF ekstre al → Maas gideri ALACAK, Odeme BORC kolonunda
- [X] Running balance dogru ilerliyor mu? (son bakiye DB'deki bakiyeyle eslesmeli)

### 3. Hesap Bakiye Duzenleme Kaldirildi
- [X] Hesap detay sayfasinda bakiyenin yaninda kalem (duzenle) ikonu OLMAMALI
- [X] Bakiye dogru gorutuyor mu?

### 4. Cari/Personel Baslangic Bakiyesi Kilitleme
- [X] Islemi olan caride baslangic bakiyesi duzenle butonu GIZLI olmali
- [X] Islemi olmayan yeni caride duzenle butonu GORUNUR olmali
- [X] Personel icin ayni test (islem varsa gizli, yoksa gorunur)

### 5. Import Balance (BAL1)
- [ ] Excel'den cari_alis_iade veya personel_satis import et → hesap bakiyesi DEGISMEMELI

### 6. Islem Cift Tiklama (CR2)
- [X] Hizli cift tikla → sadece 1 islem olusmali

### 7. Ileri Tarihli <-> Normal Donusum (CR7)
- [X] Normal islemi ileri tarihliye cevir → eski kayit silinmeli, yeni olusmali
- [X] Ileri tarihli islemi normale cevir → ayni sekilde

### 7b. Ileri Tarihli Doviz Gosterimi (BAL6)
- [X] Doviz cari (orn. USD tedarikci) icin ileri tarihli islem olustur → tutar $ gostermeli, ₺ degil
- [X] Ileri tarihli islem onay dialogunda tutar dogru para birimiyle mi?

---

## ORTA RISK — Tavsiye Edilir

### 8. Duzenle Sayfalari Permission (CR9)
- [ ] Shared user olarak baska birinin islemini duzenlemeye calis → engellenmeli (can_update_own ise)
- [ ] 7 duzenle sayfasi: islem, cari, hesap, personel, kategori, urun, ileri tarihli

### 9. Data Import Bolme (code split)
- [ ] Excel import wizard calisiyor mu? (dosya sec → onizleme → import)
- [ ] Mapping modalleri aciliyor mu?
- [ ] Skipped tab calisiyor mu?

### 10. Urunler Sayfasi Bolme (code split)
- [X] Urun listesi yukleniyor mu?
- [X] Urun detay modal aciliyor mu?
- [X] Fiyat guncelleme calisiyor mu?
- [X] Stok takibi dogru mu?

### 11. Detay Sayfalari (component extraction)
- [X] Cari detay: action menu (duzenle/sil/arsivle/export) calisiyor mu?
- [X] Hesap detay: ayni
- [X] Personel detay: ayni

### 12. Query Key Migration
- [X] Islem olustur → liste guncelleniyor mu?
- [X] Islem sil → liste guncelleniyor mu?
- [X] Arama yap → sonuclar guncel mi? (CR3)

### 13. Arama Sayfasi
- [X] Arama calisiyor mu? Geri butonu calisiyor mu?

---

## DUSUK RISK — Opsiyonel

### 14. Undo Delete (yeni)
- [X] Kategoriler, urunler, notlar sayfalarinda sil → undo snackbar cikiyor mu?

### 15. Pull-to-Refresh (yeni)
- [x] Urun detay, notlar, kategoriler, arsiv, raporlarda asagi cek → yenileniyor mu?

### 16. ESLint/Babel/tsconfig
- [ ] npx tsc --noEmit geciyor (zaten test edildi)

### 17. Save Butonu Reset (CR4)
- [ ] Islem kaydederken hata olusursa → modal kapat/ac → Save butonu aktif mi?
