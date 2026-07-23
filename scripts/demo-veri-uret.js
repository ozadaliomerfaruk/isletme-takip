/**
 * Demo/tanıtım verisi üretici — mağaza ekran görüntüleri için.
 *
 * App'in Excel import formatında (excelImport.ts parser'ıyla BİREBİR uyumlu) gerçekçi
 * bir işletme verisi üretir: çoklu hesap (TL + USD + ALTIN), müşteri/tedarikçi cari
 * borç-alacakları, personel maaşları, 7 ay yayılmış gelir-gider → net varlık trendi,
 * kategori raporları, dolu cari listesi hepsi güzel görünür.
 *
 * Kurallar (parser uyumu için):
 *  - Zorunlu kolonlar: TARİH, İŞLEM TİPİ, HESAP, MİKTAR. + AÇIKLAMA/KATEGORİ/PERSONEL/
 *    TEDARİKÇİ/MÜŞTERİ/KARŞI HESAP/BİRİM.
 *  - Tip değerleri TR: GELİR, GİDER, CARİ SATIŞ, CARİ ALIŞ, TAHSİLAT, ÖDEME, TRANSFER,
 *    PERSONEL GİDERİ, PERSONEL ÖDEMESİ, BAŞLANGIÇ BAKİYESİ.
 *  - Çapraz-kur transferi YOK (KARŞI HESAP köşeli-parantez formatı riskli). Döviz/altın
 *    hesapları BAŞLANGIÇ BAKİYESİ ile kurulur; BİRİM: TRY / USD / gram (gram → altın/XAU).
 *  - Aynı-kur transfer serbest (Kasa TRY → Banka TRY), bracket gerekmez.
 *
 * Çalıştır:  node scripts/demo-veri-uret.js
 * Çıktı:     scripts/demo-import.xlsx  (uygulamada Ayarlar → Veri İçe Aktar ile yükle)
 */
const XLSX = require('xlsx');
const path = require('path');

const HEADERS = ['TARİH', 'İŞLEM TİPİ', 'AÇIKLAMA', 'KATEGORİ', 'HESAP', 'PERSONEL', 'TEDARİKÇİ', 'MÜŞTERİ', 'KARŞI HESAP', 'MİKTAR', 'BİRİM'];

// --- Varlıklar ---
const KASA = 'Nakit (Kasa)';
const BANKA = 'Ziraat Bankası';
const KK = 'Garanti Kredi Kartı';
const USD = 'Döviz (USD)';
const ALTIN = 'Altın';

const MUSTERILER = ['Yılmaz Market', 'Demir İnşaat Ltd.', 'Kaya Otomotiv', 'Öztürk Tekstil', 'Güneş Eczanesi'];
const TEDARIKCILER = ['ABC Toptan Gıda', 'Mega Ambalaj San.', 'Anadolu Kırtasiye', 'Deniz Nakliyat'];
const PERSONEL = ['Mehmet Demir', 'Ayşe Kaya', 'Ali Şahin'];

const rows = [];
const two = (n) => String(n).padStart(2, '0');
// TARİH: 'YYYY-MM-DD HH:mm' (parser bu formatı okur)
const d = (y, m, day, hh = 10, mm = 0) => `${y}-${two(m)}-${two(day)} ${two(hh)}:${two(mm)}`;
// row(tarih, tip, {aciklama,kategori,hesap,personel,tedarikci,musteri,karsi,miktar,birim})
function row(tarih, tip, o = {}) {
  rows.push([
    tarih, tip, o.aciklama || '', o.kategori || '', o.hesap || '',
    o.personel || '', o.tedarikci || '', o.musteri || '', o.karsi || '',
    o.miktar != null ? o.miktar : '', o.birim || 'TRY',
  ]);
}

const Y = 2026;

// === AÇILIŞ BAKİYELERİ (2026-01-02) ===
row(d(Y, 1, 2, 9, 0), 'BAŞLANGIÇ BAKİYESİ', { aciklama: 'Kasa açılış', hesap: KASA, miktar: 28500 });
row(d(Y, 1, 2, 9, 0), 'BAŞLANGIÇ BAKİYESİ', { aciklama: 'Banka açılış', hesap: BANKA, miktar: 92000 });
row(d(Y, 1, 2, 9, 0), 'BAŞLANGIÇ BAKİYESİ', { aciklama: 'Döviz mevduatı', hesap: USD, miktar: 4200, birim: 'USD' });
row(d(Y, 1, 2, 9, 0), 'BAŞLANGIÇ BAKİYESİ', { aciklama: 'Altın birikimi', hesap: ALTIN, miktar: 65, birim: 'gram' });
// Cari açılışları (bazıları bize borçlu = alacak, bazılarına borçluyuz)
row(d(Y, 1, 2, 9, 0), 'BAŞLANGIÇ BAKİYESİ', { aciklama: 'Devir bakiye', musteri: MUSTERILER[0], miktar: 14200 });
row(d(Y, 1, 2, 9, 0), 'BAŞLANGIÇ BAKİYESİ', { aciklama: 'Devir bakiye', musteri: MUSTERILER[1], miktar: 8600 });
row(d(Y, 1, 2, 9, 0), 'BAŞLANGIÇ BAKİYESİ', { aciklama: 'Devir bakiye', tedarikci: TEDARIKCILER[0], miktar: 16500 });
row(d(Y, 1, 2, 9, 0), 'BAŞLANGIÇ BAKİYESİ', { aciklama: 'Devir bakiye', tedarikci: TEDARIKCILER[1], miktar: 5400 });

// === AYLIK DÖNGÜ (Ocak–Temmuz 2026) ===
// Hafif aya-göre varyasyon (index tabanlı, deterministik). Gelir > gider → net varlık artan trend.
const AYLAR = [1, 2, 3, 4, 5, 6, 7];
AYLAR.forEach((m, i) => {
  const v = i * 1000; // aylık kümülatif artış ipucu

  // Nakit satışlar (kasaya)
  row(d(Y, m, 4, 11, 15), 'GELİR', { aciklama: 'Perakende satış', kategori: 'SATIŞ', hesap: KASA, miktar: 18500 + v });
  row(d(Y, m, 18, 16, 40), 'GELİR', { aciklama: 'Perakende satış', kategori: 'SATIŞ', hesap: KASA, miktar: 15200 + v });
  // Kartlı / banka satışları
  row(d(Y, m, 9, 13, 0), 'GELİR', { aciklama: 'POS tahsilatlı satış', kategori: 'SATIŞ', hesap: BANKA, miktar: 34000 + 2 * v });
  row(d(Y, m, 24, 12, 30), 'GELİR', { aciklama: 'Havale ile satış', kategori: 'SATIŞ', hesap: BANKA, miktar: 26500 + v });

  // Cari satış (müşteriye vadeli → alacak büyür)
  const mus = MUSTERILER[i % MUSTERILER.length];
  row(d(Y, m, 6, 10, 0), 'CARİ SATIŞ', { aciklama: 'Vadeli mal satışı', kategori: 'SATIŞ', musteri: mus, miktar: 12800 + v });
  // Tahsilat (müşteriden → alacak azalır, kasaya girer)
  const mus2 = MUSTERILER[(i + 1) % MUSTERILER.length];
  row(d(Y, m, 20, 15, 0), 'TAHSİLAT', { aciklama: 'Müşteri tahsilatı', hesap: BANKA, musteri: mus2, miktar: 9500 });

  // Cari alış (tedarikçiden vadeli → borç büyür)
  const ted = TEDARIKCILER[i % TEDARIKCILER.length];
  row(d(Y, m, 5, 9, 30), 'CARİ ALIŞ', { aciklama: 'Mal alımı', kategori: 'ALIŞ', tedarikci: ted, miktar: 17400 + v });
  // Ödeme (tedarikçiye → borç azalır)
  const ted2 = TEDARIKCILER[(i + 2) % TEDARIKCILER.length];
  row(d(Y, m, 22, 14, 0), 'ÖDEME', { aciklama: 'Tedarikçi ödemesi', hesap: BANKA, tedarikci: ted2, miktar: 13200 });

  // Giderler
  row(d(Y, m, 3, 10, 0), 'GİDER', { aciklama: 'Dükkan kirası', kategori: 'KİRA', hesap: BANKA, miktar: 14000 });
  row(d(Y, m, 12, 11, 0), 'GİDER', { aciklama: 'Elektrik/su/doğalgaz', kategori: 'FATURA', hesap: BANKA, miktar: 3600 + (i % 3) * 400 });
  row(d(Y, m, 15, 17, 30), 'GİDER', { aciklama: 'Yakıt/ulaşım', kategori: 'ULAŞIM', hesap: KK, miktar: 2200 });
  row(d(Y, m, 26, 13, 0), 'GİDER', { aciklama: 'Ofis/temizlik malzemesi', kategori: 'OFİS', hesap: KK, miktar: 1450 });

  // Personel: maaş tahakkuku (gider) + ödeme
  PERSONEL.forEach((p, pi) => {
    const maas = 22000 + pi * 2500;
    row(d(Y, m, 28, 9, 0), 'PERSONEL GİDERİ', { aciklama: 'Maaş tahakkuku', kategori: 'MAAŞ', personel: p, miktar: maas });
    row(d(Y, m, 28, 16, 0), 'PERSONEL ÖDEMESİ', { aciklama: 'Maaş ödemesi', hesap: BANKA, personel: p, miktar: maas });
  });
});

// Birkaç renk katan ek hareket
row(d(Y, 3, 10, 12, 0), 'TRANSFER', { aciklama: 'Kasadan bankaya', hesap: KASA, karsi: BANKA, miktar: 15000 });
row(d(Y, 5, 14, 11, 0), 'GELİR', { aciklama: 'Altın birikime ekleme', hesap: ALTIN, miktar: 10, birim: 'gram' });
row(d(Y, 6, 8, 15, 0), 'CARİ SATIŞ', { aciklama: 'Toptan sipariş', kategori: 'SATIŞ', musteri: MUSTERILER[3], miktar: 42000 });
row(d(Y, 7, 3, 10, 0), 'TAHSİLAT', { aciklama: 'Kısmi tahsilat', hesap: KASA, musteri: MUSTERILER[0], miktar: 20000 });
row(d(Y, 7, 4, 11, 0), 'PERSONEL ÖDEMESİ', { aciklama: 'Avans', hesap: KASA, personel: PERSONEL[1], miktar: 3000 });

// === Excel yaz ===
const warn = '⚠️ DEMO/TANITIM verisidir — gerçek işletme verisi değildir. Test hesabına içe aktarıp ekran görüntüsü almak için.';
const aoa = [
  [warn, '', '', '', '', '', '', '', '', '', ''],
  HEADERS,
  ...rows,
];
const ws = XLSX.utils.aoa_to_sheet(aoa);
ws['!cols'] = [{ wch: 18 }, { wch: 16 }, { wch: 26 }, { wch: 12 }, { wch: 18 }, { wch: 16 }, { wch: 18 }, { wch: 16 }, { wch: 18 }, { wch: 12 }, { wch: 8 }];
ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 10 } }];
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, 'İşlemler');
const out = path.join(__dirname, 'demo-import.xlsx');
XLSX.writeFile(wb, out);
console.log(`✓ ${rows.length} işlem üretildi → ${out}`);
console.log(`  Hesaplar: ${KASA}, ${BANKA}, ${KK}, ${USD}, ${ALTIN}`);
console.log(`  Müşteri: ${MUSTERILER.length}, Tedarikçi: ${TEDARIKCILER.length}, Personel: ${PERSONEL.length}`);
