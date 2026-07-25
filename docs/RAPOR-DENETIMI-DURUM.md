# Rapor Ekranları Denetimi — durum ve kurtarma notu

**Tarih:** 25 Temmuz 2026
**Neden bu dosya var:** denetim arka planda çalışırken oturum kesilebilir; ham veri
kaybolmasın diye sonuçlar diske alındı.

## Nerede kaldık

Tarama ve doğrulama **bitti**, sentez (raporlama) aşaması çalışıyordu.

| | |
|---|---|
| Taranan yüzey | 12 (10 rapor ekranı + 16 rapor bileşeni + 12 hook + 8 export kütüphanesi) |
| Ham bulgu | 184 |
| Şüpheci doğrulamadan geçen | 162 onaylı |
| Çürütülen | 22 |
| Şiddet dağılımı | 20 yüksek · 79 orta · 63 düşük |
| Mercek dağılımı | 68 muhasebe · 48 geliştirici · 46 UI |

**Ham veri:** `docs/RAPOR-DENETIMI-HAM-BULGULAR.json`
(`onayli` ve `curutulen` dizileri; her bulguda id/başlık/dosya/satır/şiddet/mercek/ne/neden/kanıt/öneri)

## ⚠️ Ham veriyle ilgili iki uyarı

1. **15 bulgu doğrulanmadan "onaylı" sayıldı.** 184 bulguya karşılık 169 karar üretildi;
   karar üretilmeyenler çıkarma sırasında onaylı kabul edildi. Bunlar kesin değil,
   uygulamadan önce tek tek kontrol edilmeli.
2. **Satır numaraları kayabilir.** Denetim çalışırken paralel bir oturum aynı ağaçta
   düzenleme yapıyordu (denetim raporu bulgularının uygulanması). Bir bulguyu ele alırken
   dosya:satır referansını önce teyit et.

## Denetimin kapsadığı yüzeyler

| Anahtar | Yüzey |
|---|---|
| `hub` | Raporlar ana sayfası + periyot altyapısı (tarih aralığı matematiği) |
| `genel` | Genel Durum |
| `gelir-gider` | Gelir-Gider |
| `kategori-drill` | Kategori detay drill-down (902 satır, en riskli dosya) |
| `alis-satis` | Alış-Satış |
| `cari-rapor` | Cari raporları |
| `personel-rapor` | Personel raporları |
| `karsilastirma` | Karşılaştırma |
| `net-varlik` | Net Varlık Trend |
| `hesap-rapor` | Hesap bazlı rapor |
| `export` | Excel + PDF dışa aktarma |
| `ui-standart` | Çapraz UI standartları (punto/spacing/renk/cam/picker/animasyon) |

## Kesilirse nasıl devam edilir

Sentez aşaması kaybolursa ham veri elde olduğu için yeniden çalıştırmaya gerek yok —
`RAPOR-DENETIMI-HAM-BULGULAR.json` doğrudan iş listesi olarak kullanılabilir.

Workflow'u devam ettirmek istenirse (yalnız AYNI oturumda geçerli):

```
Workflow({
  scriptPath: "C:\\Users\\ozada\\.claude\\projects\\C--Users-ozada-isletmetakip-defterappv2-src\\5ced7eac-8631-43a3-a00b-162455d10b93\\workflows\\scripts\\rapor-denetimi-wf_dca0edd8-4fb.js",
  resumeFromRunId: "wf_dca0edd8-4fb"
})
```

Ajan çıktılarının tamamı (ham transkriptler dahil):
`C:\Users\ozada\.claude\projects\c--Users-ozada-isletmetakip-defterappv2\5ced7eac-8631-43a3-a00b-162455d10b93\subagents\workflows\wf_dca0edd8-4fb\journal.jsonl`

## Bu denetimden bağımsız, açık duran işler

- `taksit/index` FAB'ı `insets.bottom` kullanmadığı için tamamen cam tab bar'ın arkasında —
  sayfanın tek yazma girişi erişilemez. (Önceki denetim raporunun en yüksek öncelikli bulgusu.)
- Native header opaklığı: 50 yerde `headerStyle: { backgroundColor: colors.surface }`
  iOS 26'nın cam bar'ını eziyor. Cari detayda pilot uygulandı, cihaz turu bekliyor.
