/**
 * Excel Export Utility
 * Hesap, Cari ve Personel ekstrelerini Excel formatında export eder
 * Profesyonel formatlama ve stil desteği ile
 */

import XLSX from 'xlsx-js-style';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { formatDateShort, formatDateTime } from './date';
import { formatCurrency, toNumber } from './currency';
import { IslemWithRelations, Currency } from '@/types/database';

// ============================================================================
// STYLE DEFINITIONS
// ============================================================================

// Ortak border stili
const thinBorder = {
  top: { style: 'thin', color: { rgb: 'CCCCCC' } },
  bottom: { style: 'thin', color: { rgb: 'CCCCCC' } },
  left: { style: 'thin', color: { rgb: 'CCCCCC' } },
  right: { style: 'thin', color: { rgb: 'CCCCCC' } },
};

// Başlık stili (HESAP EKSTRESİ)
const titleStyle = {
  font: { bold: true, sz: 16, color: { rgb: '1F4E79' } },
  alignment: { horizontal: 'left', vertical: 'center' },
};

// Meta bilgi label stili
const metaLabelStyle = {
  font: { bold: true, sz: 11, color: { rgb: '666666' } },
  alignment: { horizontal: 'left' },
};

// Meta bilgi değer stili
const metaValueStyle = {
  font: { sz: 11, color: { rgb: '333333' } },
  alignment: { horizontal: 'left' },
};

// İşletme adı stili (bold)
const businessNameStyle = {
  font: { bold: true, sz: 11, color: { rgb: '1F4E79' } },
  alignment: { horizontal: 'left' },
};

// Tablo başlık stili (gri arkaplan)
const headerStyle = {
  font: { bold: true, sz: 11, color: { rgb: 'FFFFFF' } },
  fill: { fgColor: { rgb: '4472C4' } },
  alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
  border: thinBorder,
};

// Normal hücre stili
const cellStyle = {
  font: { sz: 10, color: { rgb: '333333' } },
  alignment: { horizontal: 'left', vertical: 'center' },
  border: thinBorder,
};

// Para hücre stili (sağa hizalı)
const currencyCellStyle = {
  font: { sz: 10, color: { rgb: '333333' } },
  alignment: { horizontal: 'right', vertical: 'center' },
  border: thinBorder,
};

// Başlangıç/Son bakiye satır stili
const summaryRowStyle = {
  font: { bold: true, sz: 10, color: { rgb: '1F4E79' } },
  fill: { fgColor: { rgb: 'E7E6E6' } },
  alignment: { horizontal: 'left', vertical: 'center' },
  border: thinBorder,
};

// Başlangıç/Son bakiye para stili
const summaryCurrencyStyle = {
  font: { bold: true, sz: 10, color: { rgb: '1F4E79' } },
  fill: { fgColor: { rgb: 'E7E6E6' } },
  alignment: { horizontal: 'right', vertical: 'center' },
  border: thinBorder,
};

// Dönem toplamı satır stili
const totalRowStyle = {
  font: { bold: true, sz: 10, color: { rgb: 'FFFFFF' } },
  fill: { fgColor: { rgb: '5B9BD5' } },
  alignment: { horizontal: 'left', vertical: 'center' },
  border: thinBorder,
};

// Dönem toplamı para stili
const totalCurrencyStyle = {
  font: { bold: true, sz: 10, color: { rgb: 'FFFFFF' } },
  fill: { fgColor: { rgb: '5B9BD5' } },
  alignment: { horizontal: 'right', vertical: 'center' },
  border: thinBorder,
};

// ============================================================================
// TYPES
// ============================================================================

export type EntityType = 'hesap' | 'cari' | 'personel';

export interface ExcelTranslations {
  statement: string;
  accountStatement: string;
  clientStatement: string;
  staffStatement: string;
  account: string;
  client: string;
  staff: string;
  period: string;
  createdAt: string;
  business: string;
  date: string;
  transactionType: string;
  description: string;
  category: string;
  accountColumn: string;
  debit: string;
  credit: string;
  debitBalance: string;
  creditBalance: string;
  openingBalance: string;
  periodTotal: string;
  closingBalance: string;
  sheetName: string;
  // Additional translations
  transactionTypes: Record<string, string>;
  statementFileName: string;
  shareDialogTitle: string;
  sharingNotSupported: string;
}

export interface ExportOptions {
  entityType: EntityType;
  entityId: string;
  entityName: string;
  entityCurrency?: Currency | string;
  isletmeName: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  transactions: IslemWithRelations[];
  allTransactions: IslemWithRelations[]; // Tüm işlemler (başlangıç bakiyesi hesabı için)
  currentBalance: number;
  cariType?: 'musteri' | 'tedarikci'; // Cari için
  translations: ExcelTranslations; // Lokalizasyon için
}

export interface TransactionRow {
  date: string;
  type: string;
  description: string;
  category: string;
  account: string;
  debit: number | null; // Borç
  credit: number | null; // Alacak
  debitBalance: number | null; // Borç Bakiye
  creditBalance: number | null; // Alacak Bakiye
}

// ============================================================================
// HESAP EKSTRESİ
// ============================================================================

/**
 * Hesap için borç/alacak belirleme
 * Borç = Hesaptan çıkan para (gider, ödeme, transfer out)
 * Alacak = Hesaba giren para (gelir, tahsilat, transfer in)
 */
function getHesapDebitCredit(
  islem: IslemWithRelations,
  hesapId: string
): { debit: number | null; credit: number | null } {
  const amount = toNumber(islem.amount);

  switch (islem.type) {
    case 'gelir':
    case 'cari_tahsilat':
    case 'personel_tahsilat':
      return { debit: null, credit: amount };

    case 'gider':
    case 'cari_odeme':
    case 'personel_odeme':
      return { debit: amount, credit: null };

    case 'transfer':
      // Kaynak hesap mı hedef hesap mı?
      if (islem.hesap_id === hesapId) {
        return { debit: amount, credit: null }; // Çıkış
      } else {
        // Hedef hesap - exchange rate varsa dönüştürülmüş tutar
        const exchangeRate = islem.exchange_rate ? toNumber(islem.exchange_rate) : null;
        const sourceCurrency = islem.source_currency || 'TRY';
        const targetCurrency = islem.target_currency || 'TRY';

        let targetAmount = amount;
        if (exchangeRate && exchangeRate > 0 && sourceCurrency !== targetCurrency) {
          if (sourceCurrency === 'TRY') {
            targetAmount = amount / exchangeRate;
          } else {
            targetAmount = amount * exchangeRate;
          }
        }
        return { debit: null, credit: targetAmount }; // Giriş
      }

    default:
      return { debit: null, credit: null };
  }
}

/**
 * Hesap için başlangıç bakiyesi hesapla
 * Seçilen tarih aralığından önceki tüm işlemlerin etkisini hesapla
 */
function calculateHesapOpeningBalance(
  allTransactions: IslemWithRelations[],
  hesapId: string,
  currentBalance: number,
  startDate: string
): number {
  // Tüm işlemlerin toplam etkisini hesapla
  let totalEffect = 0;

  allTransactions.forEach((islem) => {
    const { debit, credit } = getHesapDebitCredit(islem, hesapId);
    if (credit) totalEffect += credit;
    if (debit) totalEffect -= debit;
  });

  // initial_balance = current_balance - total_effect
  const initialBalance = currentBalance - totalEffect;

  // Şimdi startDate'den önceki işlemlerin etkisini hesapla
  const transactionsBeforeStart = allTransactions.filter(
    (t) => t.date < startDate
  );

  let effectBeforeStart = 0;
  transactionsBeforeStart.forEach((islem) => {
    const { debit, credit } = getHesapDebitCredit(islem, hesapId);
    if (credit) effectBeforeStart += credit;
    if (debit) effectBeforeStart -= debit;
  });

  return initialBalance + effectBeforeStart;
}

// ============================================================================
// CARİ EKSTRESİ
// ============================================================================

/**
 * Cari için borç/alacak belirleme
 * Tedarikçi: Alış = Borç (bize borçlu oldular), Ödeme = Alacak (ödedik)
 * Müşteri: Satış = Alacak (bize borçlu), Tahsilat = Borç (ödediler)
 */
function getCariDebitCredit(
  islem: IslemWithRelations,
  cariType: 'musteri' | 'tedarikci'
): { debit: number | null; credit: number | null } {
  const amount = toNumber(islem.amount);

  if (cariType === 'tedarikci') {
    switch (islem.type) {
      case 'cari_alis':
        return { debit: amount, credit: null }; // Borcumuz arttı
      case 'cari_odeme':
        return { debit: null, credit: amount }; // Borcumuzu ödedik
      case 'cari_alis_iade':
        return { debit: null, credit: amount }; // Borcumuz azaldı
      default:
        return { debit: null, credit: null };
    }
  } else {
    // Müşteri
    switch (islem.type) {
      case 'cari_satis':
        return { debit: null, credit: amount }; // Alacağımız arttı
      case 'cari_tahsilat':
        return { debit: amount, credit: null }; // Alacağımızı tahsil ettik
      case 'cari_satis_iade':
        return { debit: amount, credit: null }; // Alacağımız azaldı
      default:
        return { debit: null, credit: null };
    }
  }
}

/**
 * Cari için başlangıç bakiyesi hesapla
 */
function calculateCariOpeningBalance(
  allTransactions: IslemWithRelations[],
  cariType: 'musteri' | 'tedarikci',
  currentBalance: number,
  startDate: string
): number {
  let totalEffect = 0;

  allTransactions.forEach((islem) => {
    const { debit, credit } = getCariDebitCredit(islem, cariType);
    if (cariType === 'tedarikci') {
      // Tedarikçi: borç arttırır (negatif), alacak azaltır (pozitif)
      if (debit) totalEffect -= debit;
      if (credit) totalEffect += credit;
    } else {
      // Müşteri: alacak arttırır (pozitif), borç azaltır (negatif)
      if (credit) totalEffect += credit;
      if (debit) totalEffect -= debit;
    }
  });

  const initialBalance = currentBalance - totalEffect;

  const transactionsBeforeStart = allTransactions.filter(
    (t) => t.date < startDate
  );

  let effectBeforeStart = 0;
  transactionsBeforeStart.forEach((islem) => {
    const { debit, credit } = getCariDebitCredit(islem, cariType);
    if (cariType === 'tedarikci') {
      if (debit) effectBeforeStart -= debit;
      if (credit) effectBeforeStart += credit;
    } else {
      if (credit) effectBeforeStart += credit;
      if (debit) effectBeforeStart -= debit;
    }
  });

  return initialBalance + effectBeforeStart;
}

// ============================================================================
// PERSONEL EKSTRESİ
// ============================================================================

/**
 * Personel için borç/alacak belirleme
 * Gider = Alacak (biz borçlandık), Ödeme = Borç (ödedik)
 */
function getPersonelDebitCredit(
  islem: IslemWithRelations
): { debit: number | null; credit: number | null } {
  const amount = toNumber(islem.amount);

  switch (islem.type) {
    case 'personel_gider':
      return { debit: null, credit: amount }; // Biz borçlandık
    case 'personel_odeme':
      return { debit: amount, credit: null }; // Ödedik
    case 'personel_tahsilat':
      return { debit: null, credit: amount }; // Personelden alacak (avans geri ödeme)
    default:
      return { debit: null, credit: null };
  }
}

/**
 * Personel için başlangıç bakiyesi hesapla
 */
function calculatePersonelOpeningBalance(
  allTransactions: IslemWithRelations[],
  currentBalance: number,
  startDate: string
): number {
  let totalEffect = 0;

  allTransactions.forEach((islem) => {
    const { debit, credit } = getPersonelDebitCredit(islem);
    if (credit) totalEffect -= credit; // Borç arttı
    if (debit) totalEffect += debit; // Ödedik
  });

  const initialBalance = currentBalance - totalEffect;

  const transactionsBeforeStart = allTransactions.filter(
    (t) => t.date < startDate
  );

  let effectBeforeStart = 0;
  transactionsBeforeStart.forEach((islem) => {
    const { debit, credit } = getPersonelDebitCredit(islem);
    if (credit) effectBeforeStart -= credit;
    if (debit) effectBeforeStart += debit;
  });

  return initialBalance + effectBeforeStart;
}

// ============================================================================
// EXCEL OLUŞTURMA
// ============================================================================

/**
 * Ana export fonksiyonu
 */
export async function exportToExcel(options: ExportOptions): Promise<void> {
  const {
    entityType,
    entityId,
    entityName,
    entityCurrency,
    isletmeName,
    startDate,
    endDate,
    transactions,
    allTransactions,
    currentBalance,
    cariType,
    translations: t,
  } = options;

  // Başlangıç bakiyesi hesapla
  let openingBalance: number;
  switch (entityType) {
    case 'hesap':
      openingBalance = calculateHesapOpeningBalance(
        allTransactions,
        entityId,
        currentBalance,
        startDate
      );
      break;
    case 'cari':
      openingBalance = calculateCariOpeningBalance(
        allTransactions,
        cariType || 'tedarikci',
        currentBalance,
        startDate
      );
      break;
    case 'personel':
      openingBalance = calculatePersonelOpeningBalance(
        allTransactions,
        currentBalance,
        startDate
      );
      break;
    default:
      openingBalance = 0;
  }

  // İşlemleri tarih sırasına göre sırala (eskiden yeniye)
  const sortedTransactions = [...transactions].sort((a, b) =>
    a.date.localeCompare(b.date)
  );

  // Excel satırlarını oluştur
  const rows: TransactionRow[] = [];
  let runningBalance = openingBalance;

  // Hesap adını al (işlem için)
  const getAccountName = (islem: IslemWithRelations): string => {
    if (islem.hesap?.name) return islem.hesap.name;
    if (islem.hedef_hesap?.name) return islem.hedef_hesap.name;
    return '';
  };

  sortedTransactions.forEach((islem) => {
    let debit: number | null = null;
    let credit: number | null = null;

    switch (entityType) {
      case 'hesap':
        ({ debit, credit } = getHesapDebitCredit(islem, entityId));
        break;
      case 'cari':
        ({ debit, credit } = getCariDebitCredit(islem, cariType || 'tedarikci'));
        break;
      case 'personel':
        ({ debit, credit } = getPersonelDebitCredit(islem));
        break;
    }

    // Running balance güncelle
    if (credit) runningBalance += credit;
    if (debit) runningBalance -= debit;

    // Borç/Alacak bakiye hesapla
    const debitBalance = runningBalance < 0 ? Math.abs(runningBalance) : null;
    const creditBalance = runningBalance >= 0 ? runningBalance : null;

    rows.push({
      date: formatDateShort(islem.date),
      type: t.transactionTypes[islem.type] || islem.type,
      description: islem.description || '',
      category: islem.kategori?.name || '',
      account: getAccountName(islem),
      debit,
      credit,
      debitBalance,
      creditBalance,
    });
  });

  // Toplamları hesapla
  const totalDebit = rows.reduce((sum, r) => sum + (r.debit || 0), 0);
  const totalCredit = rows.reduce((sum, r) => sum + (r.credit || 0), 0);
  const closingBalance = runningBalance;
  const closingDebitBalance = closingBalance < 0 ? Math.abs(closingBalance) : null;
  const closingCreditBalance = closingBalance >= 0 ? closingBalance : null;

  // Excel verisi oluştur
  const currency = entityCurrency || 'TRY';
  const formatAmount = (val: number | null) =>
    val !== null ? formatCurrency(val, currency) : '';

  // Başlangıç bakiyesi için borç/alacak bakiye
  const openingDebitBalance = openingBalance < 0 ? Math.abs(openingBalance) : null;
  const openingCreditBalance = openingBalance >= 0 ? openingBalance : null;

  // Entity tipi label ve başlık
  let entityTypeLabel: string;
  let statementTitle: string;
  switch (entityType) {
    case 'hesap':
      entityTypeLabel = t.account;
      statementTitle = t.accountStatement;
      break;
    case 'cari':
      entityTypeLabel = t.client;
      statementTitle = t.clientStatement;
      break;
    case 'personel':
      entityTypeLabel = t.staff;
      statementTitle = t.staffStatement;
      break;
    default:
      entityTypeLabel = t.account;
      statementTitle = t.accountStatement;
  }

  // Workbook ve worksheet oluştur
  const wb = XLSX.utils.book_new();
  const ws: XLSX.WorkSheet = {};

  // Satır sayacı
  let rowIdx = 0;

  // ============ BAŞLIK BÖLÜMÜ ============
  // Row 0: Başlık
  ws['A1'] = { v: statementTitle, s: titleStyle };
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 8 } }]; // A1:I1 birleştir
  rowIdx++;

  // Row 1: Boş satır
  rowIdx++;

  // Row 2: Entity adı
  ws['A3'] = { v: `${entityTypeLabel}:`, s: metaLabelStyle };
  ws['B3'] = { v: entityName, s: businessNameStyle };
  rowIdx++;

  // Row 3: Dönem
  ws['A4'] = { v: `${t.period}:`, s: metaLabelStyle };
  ws['B4'] = { v: `${formatDateShort(startDate)} - ${formatDateShort(endDate)}`, s: metaValueStyle };
  rowIdx++;

  // Row 4: Oluşturulma tarihi
  ws['A5'] = { v: `${t.createdAt}:`, s: metaLabelStyle };
  ws['B5'] = { v: formatDateTime(new Date().toISOString()), s: metaValueStyle };
  rowIdx++;

  // Row 5: İşletme
  ws['A6'] = { v: `${t.business}:`, s: metaLabelStyle };
  ws['B6'] = { v: isletmeName, s: businessNameStyle };
  rowIdx++;

  // Row 6: Boş satır
  rowIdx++;

  // ============ TABLO BAŞLIKLARI ============
  const headerRow = 8;
  const headers = [t.date, t.transactionType, t.description, t.category, t.accountColumn, t.debit, t.credit, t.debitBalance, t.creditBalance];
  const cols = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'];

  headers.forEach((header, i) => {
    ws[`${cols[i]}${headerRow}`] = { v: header, s: headerStyle };
  });

  // ============ BAŞLANGIÇ BAKİYESİ ============
  const openingRow = 9;
  ws[`A${openingRow}`] = { v: '', s: summaryRowStyle };
  ws[`B${openingRow}`] = { v: '', s: summaryRowStyle };
  ws[`C${openingRow}`] = { v: t.openingBalance, s: summaryRowStyle };
  ws[`D${openingRow}`] = { v: '', s: summaryRowStyle };
  ws[`E${openingRow}`] = { v: '', s: summaryRowStyle };
  ws[`F${openingRow}`] = { v: '', s: summaryCurrencyStyle };
  ws[`G${openingRow}`] = { v: '', s: summaryCurrencyStyle };
  ws[`H${openingRow}`] = { v: formatAmount(openingDebitBalance), s: summaryCurrencyStyle };
  ws[`I${openingRow}`] = { v: formatAmount(openingCreditBalance), s: summaryCurrencyStyle };

  // ============ İŞLEMLER ============
  const dataRowStart = 10;
  rows.forEach((r, i) => {
    const rowNum = dataRowStart + i;
    ws[`A${rowNum}`] = { v: r.date, s: cellStyle };
    ws[`B${rowNum}`] = { v: r.type, s: cellStyle };
    ws[`C${rowNum}`] = { v: r.description, s: cellStyle };
    ws[`D${rowNum}`] = { v: r.category, s: cellStyle };
    ws[`E${rowNum}`] = { v: r.account, s: cellStyle };
    ws[`F${rowNum}`] = { v: formatAmount(r.debit), s: currencyCellStyle };
    ws[`G${rowNum}`] = { v: formatAmount(r.credit), s: currencyCellStyle };
    ws[`H${rowNum}`] = { v: formatAmount(r.debitBalance), s: currencyCellStyle };
    ws[`I${rowNum}`] = { v: formatAmount(r.creditBalance), s: currencyCellStyle };
  });

  // ============ DÖNEM TOPLAMI ============
  const totalRow = dataRowStart + rows.length;
  ws[`A${totalRow}`] = { v: '', s: totalRowStyle };
  ws[`B${totalRow}`] = { v: '', s: totalRowStyle };
  ws[`C${totalRow}`] = { v: t.periodTotal, s: totalRowStyle };
  ws[`D${totalRow}`] = { v: '', s: totalRowStyle };
  ws[`E${totalRow}`] = { v: '', s: totalRowStyle };
  ws[`F${totalRow}`] = { v: formatAmount(totalDebit), s: totalCurrencyStyle };
  ws[`G${totalRow}`] = { v: formatAmount(totalCredit), s: totalCurrencyStyle };
  ws[`H${totalRow}`] = { v: '', s: totalCurrencyStyle };
  ws[`I${totalRow}`] = { v: '', s: totalCurrencyStyle };

  // ============ SON BAKİYE ============
  const closingRow = totalRow + 1;
  ws[`A${closingRow}`] = { v: '', s: summaryRowStyle };
  ws[`B${closingRow}`] = { v: '', s: summaryRowStyle };
  ws[`C${closingRow}`] = { v: t.closingBalance, s: summaryRowStyle };
  ws[`D${closingRow}`] = { v: '', s: summaryRowStyle };
  ws[`E${closingRow}`] = { v: '', s: summaryRowStyle };
  ws[`F${closingRow}`] = { v: '', s: summaryCurrencyStyle };
  ws[`G${closingRow}`] = { v: '', s: summaryCurrencyStyle };
  ws[`H${closingRow}`] = { v: formatAmount(closingDebitBalance), s: summaryCurrencyStyle };
  ws[`I${closingRow}`] = { v: formatAmount(closingCreditBalance), s: summaryCurrencyStyle };

  // Worksheet aralığını ayarla
  ws['!ref'] = `A1:I${closingRow}`;

  // Sütun genişliklerini ayarla
  ws['!cols'] = [
    { wch: 12 }, // Tarih
    { wch: 18 }, // İşlem Tipi
    { wch: 30 }, // Açıklama
    { wch: 15 }, // Kategori
    { wch: 15 }, // Hesap
    { wch: 14 }, // Borç
    { wch: 14 }, // Alacak
    { wch: 14 }, // Borç Bakiye
    { wch: 14 }, // Alacak Bakiye
  ];

  // Satır yüksekliklerini ayarla
  ws['!rows'] = [
    { hpt: 24 }, // Başlık satırı
  ];

  // Worksheet'i workbook'a ekle
  XLSX.utils.book_append_sheet(wb, ws, t.sheetName);

  // Base64 olarak export et
  const wbout = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });

  // Dosya adı oluştur
  const safeEntityName = entityName.replace(/[^a-zA-Z0-9ğüşıöçĞÜŞİÖÇ\s]/g, '').trim();
  const fileName = `${safeEntityName}_${t.statementFileName}_${startDate}_${endDate}.xlsx`;
  const filePath = `${FileSystem.cacheDirectory}${fileName}`;

  // Dosyayı yaz
  await FileSystem.writeAsStringAsync(filePath, wbout, {
    encoding: FileSystem.EncodingType.Base64,
  });

  // Paylaş
  const isAvailable = await Sharing.isAvailableAsync();
  if (isAvailable) {
    await Sharing.shareAsync(filePath, {
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      dialogTitle: t.shareDialogTitle,
      UTI: 'com.microsoft.excel.xlsx',
    });
  } else {
    throw new Error(t.sharingNotSupported);
  }
}
