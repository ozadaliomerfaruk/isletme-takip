const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

// Dosya yolu - OneDrive path
const filePath = path.join(
  'C:', 'Users', 'ozada', 'OneDrive', 'One Drive', 'OneDrive', 'Masaüstü', 'import_sablonu.xlsx'
);

console.log('Dosya yolu:', filePath);
console.log('Dosya var mı:', fs.existsSync(filePath));

try {
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  console.log('\n=== EXCEL DOSYA ANALİZİ ===');
  console.log('Sheet adı:', sheetName);
  console.log('Toplam satır (header dahil):', data.length);
  console.log('Veri satırı (header hariç):', data.length - 1);
  console.log('');

  // Header row
  const headers = data[0];
  console.log('Header sütunları (' + headers.length + '):', headers.map((h, i) => i + ':' + h).join(' | '));
  console.log('');

  // İlk 5 veri satırı
  console.log('=== İLK 5 VERİ SATIRI ===');
  for (let i = 1; i <= Math.min(5, data.length - 1); i++) {
    console.log('Satır ' + (i+1) + ':', JSON.stringify(data[i].slice(0, 12)));
  }
  console.log('');

  // Son 5 veri satırı
  console.log('=== SON 5 VERİ SATIRI ===');
  for (let i = Math.max(1, data.length - 5); i < data.length; i++) {
    console.log('Satır ' + (i+1) + ':', JSON.stringify(data[i].slice(0, 12)));
  }
  console.log('');

  // Boş satır analizi - Header'daki sütun indexlerini bul
  const dateColIndex = headers.findIndex(h => h && (h.toUpperCase().includes('TARİH') || h.toUpperCase().includes('TARIH') || h.toUpperCase() === 'DATE'));
  const typeColIndex = headers.findIndex(h => h && (h.toUpperCase().includes('İŞLEM') || h.toUpperCase().includes('ISLEM') || h.toUpperCase() === 'TYPE' || h.toUpperCase().includes('TİP') || h.toUpperCase().includes('TIP')));
  const amountColIndex = headers.findIndex(h => h && (h.toUpperCase().includes('MİKTAR') || h.toUpperCase().includes('MIKTAR') || h.toUpperCase() === 'AMOUNT' || h.toUpperCase().includes('TUTAR')));

  console.log('=== SÜTUN TESPİTİ ===');
  console.log('Tarih sütunu index:', dateColIndex, '(' + headers[dateColIndex] + ')');
  console.log('Tip sütunu index:', typeColIndex, '(' + headers[typeColIndex] + ')');
  console.log('Tutar sütunu index:', amountColIndex, '(' + headers[amountColIndex] + ')');
  console.log('');

  let emptyRows = 0;
  let partialRows = 0;
  let validRows = 0;
  let noDateRows = [];
  let noTypeRows = [];
  let noAmountRows = [];
  let zeroAmountRows = [];
  let negativeAmountRows = [];
  let verySmallAmountRows = [];

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const date = dateColIndex >= 0 ? row[dateColIndex] : row[0];
    const type = typeColIndex >= 0 ? row[typeColIndex] : row[1];
    const amountRaw = amountColIndex >= 0 ? row[amountColIndex] : row[9];

    // Tamamen boş mu?
    const isEmpty = row.every(cell => cell === '' || cell === null || cell === undefined);
    if (isEmpty) {
      emptyRows++;
      continue;
    }

    // Kritik alanlar eksik mi?
    if (!date || date === '') {
      noDateRows.push(i + 1);
    }
    if (!type || type === '') {
      noTypeRows.push(i + 1);
    }

    // Tutar analizi
    const amount = typeof amountRaw === 'number' ? amountRaw : parseFloat(String(amountRaw).replace(/[^\d.-]/g, ''));
    if (amountRaw === '' || amountRaw === null || amountRaw === undefined || isNaN(amount)) {
      noAmountRows.push(i + 1);
    } else if (amount === 0) {
      zeroAmountRows.push(i + 1);
    } else if (amount < 0) {
      negativeAmountRows.push(i + 1);
    } else if (amount > 0 && amount < 0.01) {
      verySmallAmountRows.push({ row: i + 1, amount });
    }

    // Tarih veya tip eksikse partial
    if (!date || !type) {
      partialRows++;
    } else {
      validRows++;
    }
  }

  console.log('=== SATIR ANALİZİ ===');
  console.log('Tamamen boş satırlar:', emptyRows);
  console.log('Kısmi (tarih/tip eksik) satırlar:', partialRows);
  console.log('Geçerli görünen satırlar:', validRows);
  console.log('BEKLENEN İŞLEM SAYISI:', validRows);
  console.log('');

  console.log('=== EKSİK/SORUNLU VERİ ANALİZİ ===');
  if (noDateRows.length > 0) {
    console.log('Tarih eksik satırlar (' + noDateRows.length + '):', noDateRows.slice(0, 30).join(', ') + (noDateRows.length > 30 ? '...' : ''));
  }
  if (noTypeRows.length > 0) {
    console.log('Tip eksik satırlar (' + noTypeRows.length + '):', noTypeRows.slice(0, 30).join(', ') + (noTypeRows.length > 30 ? '...' : ''));
  }
  if (noAmountRows.length > 0) {
    console.log('Tutar eksik satırlar (' + noAmountRows.length + '):', noAmountRows.slice(0, 30).join(', ') + (noAmountRows.length > 30 ? '...' : ''));
  }
  if (zeroAmountRows.length > 0) {
    console.log('Tutar=0 satırlar (' + zeroAmountRows.length + '):', zeroAmountRows.slice(0, 30).join(', ') + (zeroAmountRows.length > 30 ? '...' : ''));
  }
  if (negativeAmountRows.length > 0) {
    console.log('Negatif tutar satırlar (' + negativeAmountRows.length + '):', negativeAmountRows.slice(0, 30).join(', ') + (negativeAmountRows.length > 30 ? '...' : ''));
  }
  if (verySmallAmountRows.length > 0) {
    console.log('Çok küçük tutar (<0.01) satırlar (' + verySmallAmountRows.length + '):', verySmallAmountRows.slice(0, 10).map(r => r.row + '(' + r.amount + ')').join(', '));
  }

  // İşlem tipi dağılımı
  console.log('');
  console.log('=== İŞLEM TİPİ DAĞILIMI ===');
  const typeCount = {};
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const isEmpty = row.every(cell => cell === '' || cell === null || cell === undefined);
    if (isEmpty) continue;

    const type = (typeColIndex >= 0 ? row[typeColIndex] : row[1]) || '(BOŞ)';
    typeCount[type] = (typeCount[type] || 0) + 1;
  }
  Object.entries(typeCount).sort((a, b) => b[1] - a[1]).forEach(([type, count]) => {
    console.log('  ' + type + ': ' + count);
  });

  // TOPLAM
  const totalTyped = Object.values(typeCount).reduce((a, b) => a + b, 0);
  console.log('');
  console.log('İşlem tipi olan satırlar toplamı:', totalTyped);

  // Fark hesapla
  console.log('');
  console.log('=== ÖZET ===');
  console.log('Excel veri satırı:', data.length - 1);
  console.log('Boş satırlar:', emptyRows);
  console.log('Geçerli (tarih+tip var):', validRows);
  console.log('Uygulama yansıyan:', 1695);
  console.log('FARK:', validRows - 1695);

} catch (err) {
  console.error('Hata:', err.message);
  console.error(err.stack);
}
