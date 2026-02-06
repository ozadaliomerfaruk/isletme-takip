const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

// Dosya yolu - OneDrive path
const filePath = path.join(
  'C:', 'Users', 'ozada', 'OneDrive', 'One Drive', 'OneDrive', 'Masaüstü', 'import_sablonu.xlsx'
);

// İşlem tipi mapping (excelImport.ts'den)
const TRANSACTION_TYPE_MAP = {
  'ÖDEME': 'cari_odeme',
  'ODEME': 'cari_odeme',
  'TAHSILAT': 'cari_tahsilat',
  'TAHSİLAT': 'cari_tahsilat',
  'PAYMENT': 'cari_odeme',
  'COLLECTION': 'cari_tahsilat',
  'SATIŞ': 'gelir',
  'SATIS': 'gelir',
  'GİDER': 'gider',
  'GIDER': 'gider',
  'GELİR': 'gelir',
  'GELIR': 'gelir',
  'INCOME': 'gelir',
  'EXPENSE': 'gider',
  'TRANSFER': 'transfer',
  'PERSONEL GİDERİ': 'personel_gider',
  'PERSONEL GIDERI': 'personel_gider',
  'PERSONEL GİDERI': 'personel_gider',
  'PERSONEL GIDERİ': 'personel_gider',
  'PERSONEL ÖDEMESİ': 'personel_odeme',
  'PERSONEL ÖDEMESI': 'personel_odeme',
  'PERSONEL ODEMESİ': 'personel_odeme',
  'PERSONEL ODEMESI': 'personel_odeme',
  'PERSONEL TAHSİLATI': 'personel_tahsilat',
  'PERSONEL TAHSILATI': 'personel_tahsilat',
  'STAFF EXPENSE': 'personel_gider',
  'STAFF PAYMENT': 'personel_odeme',
  'STAFF COLLECTION': 'personel_tahsilat',
  'CARİ ALIŞ': 'cari_alis',
  'CARI ALIŞ': 'cari_alis',
  'CARİ ALIS': 'cari_alis',
  'CARI ALIS': 'cari_alis',
  'CARİ SATIŞ': 'cari_satis',
  'CARI SATIŞ': 'cari_satis',
  'CARİ SATIS': 'cari_satis',
  'CARI SATIS': 'cari_satis',
  'PURCHASE': 'cari_alis',
  'SALE': 'cari_satis',
  'CARİ ALIŞ İADE': 'cari_alis_iade',
  'CARİ SATIŞ İADE': 'cari_satis_iade',
  'PURCHASE RETURN': 'cari_alis_iade',
  'SALE RETURN': 'cari_satis_iade',
  'BAŞLANGIÇ BAKİYESİ': 'baslangic_bakiyesi',
  'BAŞLANGIÇ': 'baslangic_bakiyesi',
  'OPENING BALANCE': 'baslangic_bakiyesi',
  'INITIAL BALANCE': 'baslangic_bakiyesi',
};

function mapTransactionType(type) {
  if (!type) return 'unknown';
  const normalized = type.toUpperCase().trim();
  return TRANSACTION_TYPE_MAP[normalized] || 'unknown';
}

try {
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  console.log('=== DETAYLI ANALİZ ===\n');

  // Header indices
  const headers = data[0];
  const dateIdx = 0;
  const typeIdx = 1;
  const descIdx = 2;
  const categoryIdx = 3;
  const hesapIdx = 4;
  const personelIdx = 5;
  const tedarikciIdx = 6;
  const musteriIdx = 7;
  const karsiHesapIdx = 8;
  const amountIdx = 9;
  const currencyIdx = 10;

  // Sorun kategorileri
  const issues = {
    baslangicBakiyesi: [],
    unknownType: [],
    noHesap: [],
    noHesapPersonelGider: [],
    noHesapOdeme: [],
    noHesapTahsilat: [],
    noHesapTransfer: [],
    noHesapGelirGider: [],
    zeroAmount: [],
    invalidDate: [],
    noPersonel: [],
    noTedarikciMusteri: [],
    noKarsiHesap: [],
  };

  let expectedTransactions = 0;
  let baslangicBakiyesiCount = 0;

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const rowNum = i + 1;

    const date = row[dateIdx];
    const type = String(row[typeIdx] || '').trim();
    const hesap = String(row[hesapIdx] || '').trim();
    const personel = String(row[personelIdx] || '').trim();
    const tedarikci = String(row[tedarikciIdx] || '').trim();
    const musteri = String(row[musteriIdx] || '').trim();
    const karsiHesap = String(row[karsiHesapIdx] || '').trim();
    const amountRaw = row[amountIdx];

    const mappedType = mapTransactionType(type);

    // Tutar hesapla
    const amount = typeof amountRaw === 'number' ? Math.abs(amountRaw) : Math.abs(parseFloat(String(amountRaw).replace(/[^\d.-]/g, '')) || 0);
    const roundedAmount = Math.round(amount * 100) / 100;

    // Başlangıç bakiyesi
    if (mappedType === 'baslangic_bakiyesi') {
      baslangicBakiyesiCount++;
      issues.baslangicBakiyesi.push({ rowNum, type, hesap, personel, tedarikci, musteri, amount: roundedAmount });
      continue; // Bu işlem olarak sayılmıyor
    }

    expectedTransactions++;

    // Bilinmeyen tip
    if (mappedType === 'unknown') {
      issues.unknownType.push({ rowNum, type });
      continue;
    }

    // Tutar kontrolü
    if (roundedAmount <= 0) {
      issues.zeroAmount.push({ rowNum, type, amountRaw, roundedAmount });
      continue;
    }

    // Tarih kontrolü (Excel serial number)
    if (!date || (typeof date !== 'number' && isNaN(Date.parse(date)))) {
      issues.invalidDate.push({ rowNum, type, date });
      continue;
    }

    // HESAP kontrolü - işlem tipine göre
    if (!hesap) {
      // PERSONEL GİDERİ - hesap olmadan da olabilir mi?
      if (mappedType === 'personel_gider') {
        issues.noHesapPersonelGider.push({ rowNum, type, personel });
      }
      // ÖDEME - tedarikçiye ödeme, hesap gerekli
      else if (mappedType === 'cari_odeme') {
        issues.noHesapOdeme.push({ rowNum, type, tedarikci, musteri });
      }
      // TAHSİLAT - müşteriden tahsilat, hesap gerekli
      else if (mappedType === 'cari_tahsilat') {
        issues.noHesapTahsilat.push({ rowNum, type, tedarikci, musteri });
      }
      // TRANSFER - hesap gerekli
      else if (mappedType === 'transfer') {
        issues.noHesapTransfer.push({ rowNum, type, karsiHesap });
      }
      // GELİR/GİDER - hesap gerekli
      else if (mappedType === 'gelir' || mappedType === 'gider') {
        issues.noHesapGelirGider.push({ rowNum, type, tedarikci, musteri });
      }
      // cari_alis/cari_satis için hesap zorunlu değil
      else if (mappedType !== 'cari_alis' && mappedType !== 'cari_satis') {
        issues.noHesap.push({ rowNum, type, mappedType });
      }
    }

    // PERSONEL işlemleri için personel kontrolü
    if (['personel_gider', 'personel_odeme', 'personel_tahsilat'].includes(mappedType) && !personel) {
      issues.noPersonel.push({ rowNum, type });
    }

    // ÖDEME/TAHSİLAT için tedarikçi/müşteri kontrolü
    if (mappedType === 'cari_odeme' && !tedarikci && !musteri) {
      issues.noTedarikciMusteri.push({ rowNum, type, mappedType: 'cari_odeme' });
    }
    if (mappedType === 'cari_tahsilat' && !tedarikci && !musteri) {
      issues.noTedarikciMusteri.push({ rowNum, type, mappedType: 'cari_tahsilat' });
    }

    // TRANSFER için karşı hesap kontrolü
    if (mappedType === 'transfer' && !karsiHesap) {
      issues.noKarsiHesap.push({ rowNum, type, hesap });
    }
  }

  console.log('=== BAŞLANGIÇ BAKİYESİ ===');
  console.log('Toplam:', baslangicBakiyesiCount);
  console.log('(Bu satırlar işlem olarak değil, entity bakiyesi olarak işleniyor)');
  console.log('');

  console.log('=== HESAP EKSİK OLAN İŞLEMLER ===');
  console.log('PERSONEL GİDERİ (hesap yok):', issues.noHesapPersonelGider.length);
  if (issues.noHesapPersonelGider.length > 0) {
    console.log('  Örnekler:', issues.noHesapPersonelGider.slice(0, 5).map(i => `Satır ${i.rowNum}: ${i.personel}`).join(', '));
  }
  console.log('ÖDEME (hesap yok):', issues.noHesapOdeme.length);
  if (issues.noHesapOdeme.length > 0) {
    console.log('  Örnekler:', issues.noHesapOdeme.slice(0, 5).map(i => `Satır ${i.rowNum}`).join(', '));
  }
  console.log('TAHSİLAT (hesap yok):', issues.noHesapTahsilat.length);
  console.log('TRANSFER (hesap yok):', issues.noHesapTransfer.length);
  console.log('GELİR/GİDER (hesap yok):', issues.noHesapGelirGider.length);
  if (issues.noHesapGelirGider.length > 0) {
    console.log('  Örnekler:', issues.noHesapGelirGider.slice(0, 10).map(i => `Satır ${i.rowNum}: ${i.type}`).join(', '));
  }
  console.log('');

  console.log('=== DİĞER SORUNLAR ===');
  console.log('Bilinmeyen tip:', issues.unknownType.length);
  if (issues.unknownType.length > 0) {
    console.log('  Örnekler:', issues.unknownType.slice(0, 10).map(i => `"${i.type}"`).join(', '));
  }
  console.log('Sıfır/geçersiz tutar:', issues.zeroAmount.length);
  console.log('Geçersiz tarih:', issues.invalidDate.length);
  console.log('Personel eksik (personel işlemi):', issues.noPersonel.length);
  console.log('Tedarikçi/Müşteri eksik (ödeme/tahsilat):', issues.noTedarikciMusteri.length);
  console.log('Karşı hesap eksik (transfer):', issues.noKarsiHesap.length);
  console.log('');

  // Toplam potansiyel sorunlar
  const totalPotentialSkipped =
    issues.noHesapPersonelGider.length + // PERSONEL GİDERİ hesap yok
    issues.noHesapOdeme.length +         // ÖDEME hesap yok
    issues.noHesapTahsilat.length +      // TAHSİLAT hesap yok
    issues.noHesapTransfer.length +      // TRANSFER hesap yok
    issues.noHesapGelirGider.length;     // GELİR/GİDER hesap yok

  console.log('=== HESAPLAMA ===');
  console.log('Toplam veri satırı:', data.length - 1);
  console.log('Başlangıç bakiyesi:', baslangicBakiyesiCount);
  console.log('İşlem olarak beklenen:', expectedTransactions);
  console.log('HESAP eksik olan satırlar:', totalPotentialSkipped);
  console.log('Hesap eksik çıkarılınca:', expectedTransactions - totalPotentialSkipped);
  console.log('');
  console.log('Uygulamada yansıyan:', 1695);
  console.log('FARK:', (expectedTransactions - totalPotentialSkipped) - 1695);

  // HESAP eksik GİDER satırlarını listele
  console.log('');
  console.log('=== HESAP EKSİK GİDER SATIRLARI (ilk 30) ===');
  const giderNoHesap = issues.noHesapGelirGider.filter(i => i.type === 'GIDER' || i.type === 'GİDER');
  giderNoHesap.slice(0, 30).forEach(item => {
    const row = data[item.rowNum - 1];
    console.log(`Satır ${item.rowNum}: Tip=${item.type}, Tedarikçi="${row[tedarikciIdx]}", Müşteri="${row[musteriIdx]}", Tutar=${row[amountIdx]}`);
  });

} catch (err) {
  console.error('Hata:', err.message);
  console.error(err.stack);
}
