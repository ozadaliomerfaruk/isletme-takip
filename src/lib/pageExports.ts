import XLSX from 'xlsx-js-style';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { formatDateShort, formatDateTime } from './date';
import { formatCurrency } from './currency';

const thinBorder = {
  top: { style: 'thin', color: { rgb: 'CCCCCC' } },
  bottom: { style: 'thin', color: { rgb: 'CCCCCC' } },
  left: { style: 'thin', color: { rgb: 'CCCCCC' } },
  right: { style: 'thin', color: { rgb: 'CCCCCC' } },
};

const titleStyle = {
  font: { bold: true, sz: 16, color: { rgb: '1F4E79' } },
  alignment: { horizontal: 'left', vertical: 'center' },
};

const metaLabelStyle = {
  font: { bold: true, sz: 11, color: { rgb: '666666' } },
  alignment: { horizontal: 'left' },
};

const metaValueStyle = {
  font: { sz: 11, color: { rgb: '333333' } },
  alignment: { horizontal: 'left' },
};

const headerStyle = {
  font: { bold: true, sz: 11, color: { rgb: 'FFFFFF' } },
  fill: { fgColor: { rgb: '4472C4' } },
  alignment: { horizontal: 'center', vertical: 'center' },
  border: thinBorder,
};

const cellStyle = {
  font: { sz: 10, color: { rgb: '333333' } },
  alignment: { horizontal: 'left', vertical: 'center' },
  border: thinBorder,
};

const numberCellStyle = {
  font: { sz: 10, color: { rgb: '333333' } },
  alignment: { horizontal: 'right', vertical: 'center' },
  border: thinBorder,
};

const totalRowStyle = {
  font: { bold: true, sz: 10, color: { rgb: 'FFFFFF' } },
  fill: { fgColor: { rgb: '5B9BD5' } },
  alignment: { horizontal: 'left', vertical: 'center' },
  border: thinBorder,
};

const totalNumberStyle = {
  font: { bold: true, sz: 10, color: { rgb: 'FFFFFF' } },
  fill: { fgColor: { rgb: '5B9BD5' } },
  alignment: { horizontal: 'right', vertical: 'center' },
  border: thinBorder,
};

async function writeAndShare(wb: XLSX.WorkBook, fileName: string, dialogTitle: string) {
  const wbout = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
  const safeName = fileName.replace(/\s+/g, '_');
  const filePath = `${FileSystem.cacheDirectory}${safeName}`;
  await FileSystem.writeAsStringAsync(filePath, wbout, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const isAvailable = await Sharing.isAvailableAsync();
  if (isAvailable) {
    await Sharing.shareAsync(filePath, {
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      dialogTitle,
      UTI: 'com.microsoft.excel.xlsx',
    });
  }
}

// ============================================================================
// LEAVE HISTORY EXPORT
// ============================================================================

export interface LeaveHistoryExportOptions {
  personelName: string;
  isletmeName: string;
  transactions: Array<{
    date: string;
    type: string;
    amount: number;
    description?: string | null;
    date_end?: string | null;
  }>;
  quota: { hakEdilen: number; kullanilan: number };
  t: {
    title: string;
    business: string;
    staff: string;
    createdAt: string;
    date: string;
    dateRange: string;
    type: string;
    days: string;
    description: string;
    entitled: string;
    used: string;
    remaining: string;
    summary: string;
    sheetName: string;
    fileName: string;
    dialogTitle: string;
    typeLabels: Record<string, string>;
  };
}

export async function exportLeaveHistory(opts: LeaveHistoryExportOptions) {
  const { personelName, isletmeName, transactions, quota, t } = opts;
  const wb = XLSX.utils.book_new();
  const ws: XLSX.WorkSheet = {};

  // Title
  ws['A1'] = { v: t.title, s: titleStyle };
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 4 } }];

  // Meta
  ws['A3'] = { v: `${t.staff}:`, s: metaLabelStyle };
  ws['B3'] = { v: personelName, s: metaValueStyle };
  ws['A4'] = { v: `${t.business}:`, s: metaLabelStyle };
  ws['B4'] = { v: isletmeName, s: metaValueStyle };
  ws['A5'] = { v: `${t.createdAt}:`, s: metaLabelStyle };
  ws['B5'] = { v: formatDateTime(new Date().toISOString()), s: metaValueStyle };

  // Summary
  const sumRow = 7;
  ws[`A${sumRow}`] = { v: t.summary, s: { ...headerStyle, alignment: { horizontal: 'left' } } };
  ws[`B${sumRow}`] = { v: '', s: headerStyle };
  ws[`C${sumRow}`] = { v: '', s: headerStyle };
  ws[`D${sumRow}`] = { v: '', s: headerStyle };
  ws[`E${sumRow}`] = { v: '', s: headerStyle };
  ws[`A${sumRow + 1}`] = { v: t.entitled, s: cellStyle };
  ws[`B${sumRow + 1}`] = { v: quota.hakEdilen, s: numberCellStyle };
  ws[`A${sumRow + 2}`] = { v: t.used, s: cellStyle };
  ws[`B${sumRow + 2}`] = { v: quota.kullanilan, s: numberCellStyle };
  ws[`A${sumRow + 3}`] = { v: t.remaining, s: totalRowStyle };
  ws[`B${sumRow + 3}`] = { v: quota.hakEdilen - quota.kullanilan, s: totalNumberStyle };

  // Headers
  const hRow = sumRow + 5;
  const headers = [t.date, t.dateRange, t.type, t.days, t.description];
  headers.forEach((h, i) => {
    ws[XLSX.utils.encode_cell({ r: hRow - 1, c: i })] = { v: h, s: headerStyle };
  });

  // Data
  transactions.forEach((tx, i) => {
    const r = hRow + i;
    ws[XLSX.utils.encode_cell({ r, c: 0 })] = { v: formatDateShort(tx.date), s: cellStyle };
    ws[XLSX.utils.encode_cell({ r, c: 1 })] = {
      v: tx.date_end ? `${formatDateShort(tx.date)} - ${formatDateShort(tx.date_end)}` : '',
      s: cellStyle,
    };
    ws[XLSX.utils.encode_cell({ r, c: 2 })] = { v: t.typeLabels[tx.type] || tx.type, s: cellStyle };
    ws[XLSX.utils.encode_cell({ r, c: 3 })] = { v: tx.amount, s: numberCellStyle };
    ws[XLSX.utils.encode_cell({ r, c: 4 })] = { v: tx.description || '', s: cellStyle };
  });

  ws['!ref'] = `A1:E${hRow + transactions.length}`;
  ws['!cols'] = [{ wch: 14 }, { wch: 28 }, { wch: 20 }, { wch: 10 }, { wch: 30 }];

  XLSX.utils.book_append_sheet(wb, ws, t.sheetName);
  await writeAndShare(wb, `${t.fileName}_${personelName}.xlsx`, t.dialogTitle);
}

// ============================================================================
// NAKIT AVANS EXPORT
// ============================================================================

export interface NakitAvansExportOptions {
  hesapName: string;
  isletmeName: string;
  avanslar: Array<{
    tutar: number;
    geri_odeme_tutari: number;
    tarih: string;
    status: string;
    aciklama?: string | null;
    hedef_hesap?: { name: string } | null;
    is_taksitli: boolean;
    taksit_sayisi?: number | null;
    taksitler?: Array<{
      sira_no: number;
      tutar: number;
      odeme_tarihi: string;
      status: string;
    }> | null;
  }>;
  /** Hesabın para birimi (nakit avanslar tek hesaba aittir) */
  currency?: string;
  t: {
    title: string;
    business: string;
    creditCard: string;
    createdAt: string;
    amount: string;
    repayment: string;
    targetAccount: string;
    date: string;
    status: string;
    installments: string;
    description: string;
    active: string;
    completed: string;
    total: string;
    sheetName: string;
    fileName: string;
    dialogTitle: string;
    installmentDetail: string;
    no: string;
    paymentDate: string;
    paid: string;
    pending: string;
    overdue: string;
  };
}

export async function exportNakitAvanslar(opts: NakitAvansExportOptions) {
  const { hesapName, isletmeName, avanslar, currency = 'TRY', t } = opts;
  const wb = XLSX.utils.book_new();
  const ws: XLSX.WorkSheet = {};

  ws['A1'] = { v: t.title, s: titleStyle };
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 5 } }];

  ws['A3'] = { v: `${t.creditCard}:`, s: metaLabelStyle };
  ws['B3'] = { v: hesapName, s: metaValueStyle };
  ws['A4'] = { v: `${t.business}:`, s: metaLabelStyle };
  ws['B4'] = { v: isletmeName, s: metaValueStyle };
  ws['A5'] = { v: `${t.createdAt}:`, s: metaLabelStyle };
  ws['B5'] = { v: formatDateTime(new Date().toISOString()), s: metaValueStyle };

  const headers = [t.date, t.amount, t.repayment, t.targetAccount, t.status, t.installments, t.description];
  const hRow = 7;
  headers.forEach((h, i) => {
    ws[XLSX.utils.encode_cell({ r: hRow - 1, c: i })] = { v: h, s: headerStyle };
  });

  let row = hRow;
  const statusLabel = (s: string) => s === 'active' ? t.active : s === 'completed' ? t.completed : s;

  avanslar.forEach((a) => {
    ws[XLSX.utils.encode_cell({ r: row, c: 0 })] = { v: formatDateShort(a.tarih), s: cellStyle };
    ws[XLSX.utils.encode_cell({ r: row, c: 1 })] = { v: formatCurrency(a.tutar, currency), s: numberCellStyle };
    ws[XLSX.utils.encode_cell({ r: row, c: 2 })] = { v: formatCurrency(a.geri_odeme_tutari, currency), s: numberCellStyle };
    ws[XLSX.utils.encode_cell({ r: row, c: 3 })] = { v: a.hedef_hesap?.name || '-', s: cellStyle };
    ws[XLSX.utils.encode_cell({ r: row, c: 4 })] = { v: statusLabel(a.status), s: cellStyle };
    ws[XLSX.utils.encode_cell({ r: row, c: 5 })] = { v: a.is_taksitli ? `${a.taksit_sayisi || 0}` : '1', s: numberCellStyle };
    ws[XLSX.utils.encode_cell({ r: row, c: 6 })] = { v: a.aciklama || '', s: cellStyle };
    row++;
  });

  // Total row
  const totalTutar = avanslar.reduce((s, a) => s + a.tutar, 0);
  const totalGeri = avanslar.reduce((s, a) => s + a.geri_odeme_tutari, 0);
  ws[XLSX.utils.encode_cell({ r: row, c: 0 })] = { v: t.total, s: totalRowStyle };
  ws[XLSX.utils.encode_cell({ r: row, c: 1 })] = { v: formatCurrency(totalTutar, currency), s: totalNumberStyle };
  ws[XLSX.utils.encode_cell({ r: row, c: 2 })] = { v: formatCurrency(totalGeri, currency), s: totalNumberStyle };
  for (let c = 3; c <= 6; c++) ws[XLSX.utils.encode_cell({ r: row, c })] = { v: '', s: totalRowStyle };
  row++;

  // Installment detail sheet
  const taksitliAvanslar = avanslar.filter(a => a.is_taksitli && a.taksitler && a.taksitler.length > 0);
  if (taksitliAvanslar.length > 0) {
    row += 2;
    ws[XLSX.utils.encode_cell({ r: row, c: 0 })] = { v: t.installmentDetail, s: titleStyle };
    row += 2;

    const tHeaders = [t.amount, t.no, t.paymentDate, `${t.installments} ${t.amount}`, t.status];
    tHeaders.forEach((h, i) => {
      ws[XLSX.utils.encode_cell({ r: row, c: i })] = { v: h, s: headerStyle };
    });
    row++;

    const taksitStatus = (s: string) => s === 'paid' ? t.paid : s === 'overdue' ? t.overdue : t.pending;

    taksitliAvanslar.forEach((a) => {
      a.taksitler!.sort((x, y) => x.sira_no - y.sira_no).forEach((tk) => {
        ws[XLSX.utils.encode_cell({ r: row, c: 0 })] = { v: formatCurrency(a.tutar, currency), s: cellStyle };
        ws[XLSX.utils.encode_cell({ r: row, c: 1 })] = { v: `${tk.sira_no}/${a.taksit_sayisi}`, s: cellStyle };
        ws[XLSX.utils.encode_cell({ r: row, c: 2 })] = { v: formatDateShort(tk.odeme_tarihi), s: cellStyle };
        ws[XLSX.utils.encode_cell({ r: row, c: 3 })] = { v: formatCurrency(tk.tutar, currency), s: numberCellStyle };
        ws[XLSX.utils.encode_cell({ r: row, c: 4 })] = { v: taksitStatus(tk.status), s: cellStyle };
        row++;
      });
    });
  }

  ws['!ref'] = `A1:G${row}`;
  ws['!cols'] = [{ wch: 14 }, { wch: 16 }, { wch: 16 }, { wch: 20 }, { wch: 14 }, { wch: 10 }, { wch: 25 }];

  XLSX.utils.book_append_sheet(wb, ws, t.sheetName);
  await writeAndShare(wb, `${t.fileName}_${hesapName}.xlsx`, t.dialogTitle);
}

// ============================================================================
// CATEGORY DETAIL EXPORT
// ============================================================================

export interface CategoryDetailExportOptions {
  categoryName: string;
  categoryType: string;
  isletmeName: string;
  startDate: string;
  endDate: string;
  subCategories: Array<{
    name: string;
    amount: number;
    percentage: number;
    transactionCount: number;
  }>;
  totalAmount: number;
  /** Ana/gösterim para birimi (varsayılan TRY) */
  currency?: string;
  t: {
    title: string;
    business: string;
    category: string;
    period: string;
    createdAt: string;
    subCategory: string;
    amount: string;
    percentage: string;
    transactionCount: string;
    total: string;
    sheetName: string;
    fileName: string;
    dialogTitle: string;
  };
}

export async function exportCategoryDetail(opts: CategoryDetailExportOptions) {
  const { categoryName, isletmeName, startDate, endDate, subCategories, totalAmount, currency = 'TRY', t } = opts;
  const wb = XLSX.utils.book_new();
  const ws: XLSX.WorkSheet = {};

  ws['A1'] = { v: t.title, s: titleStyle };
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 3 } }];

  ws['A3'] = { v: `${t.category}:`, s: metaLabelStyle };
  ws['B3'] = { v: categoryName, s: metaValueStyle };
  ws['A4'] = { v: `${t.period}:`, s: metaLabelStyle };
  ws['B4'] = { v: `${formatDateShort(startDate)} - ${formatDateShort(endDate)}`, s: metaValueStyle };
  ws['A5'] = { v: `${t.business}:`, s: metaLabelStyle };
  ws['B5'] = { v: isletmeName, s: metaValueStyle };
  ws['A6'] = { v: `${t.createdAt}:`, s: metaLabelStyle };
  ws['B6'] = { v: formatDateTime(new Date().toISOString()), s: metaValueStyle };

  const headers = [t.subCategory, t.amount, t.percentage, t.transactionCount];
  const hRow = 8;
  headers.forEach((h, i) => {
    ws[XLSX.utils.encode_cell({ r: hRow - 1, c: i })] = { v: h, s: headerStyle };
  });

  subCategories.forEach((sc, i) => {
    const r = hRow + i;
    ws[XLSX.utils.encode_cell({ r, c: 0 })] = { v: sc.name, s: cellStyle };
    ws[XLSX.utils.encode_cell({ r, c: 1 })] = { v: formatCurrency(sc.amount, currency), s: numberCellStyle };
    ws[XLSX.utils.encode_cell({ r, c: 2 })] = { v: `%${sc.percentage}`, s: numberCellStyle };
    ws[XLSX.utils.encode_cell({ r, c: 3 })] = { v: sc.transactionCount, s: numberCellStyle };
  });

  const totalRow = hRow + subCategories.length;
  ws[XLSX.utils.encode_cell({ r: totalRow, c: 0 })] = { v: t.total, s: totalRowStyle };
  ws[XLSX.utils.encode_cell({ r: totalRow, c: 1 })] = { v: formatCurrency(totalAmount, currency), s: totalNumberStyle };
  ws[XLSX.utils.encode_cell({ r: totalRow, c: 2 })] = { v: '%100', s: totalNumberStyle };
  const totalTx = subCategories.reduce((s, sc) => s + sc.transactionCount, 0);
  ws[XLSX.utils.encode_cell({ r: totalRow, c: 3 })] = { v: totalTx, s: totalNumberStyle };

  ws['!ref'] = `A1:D${totalRow + 1}`;
  ws['!cols'] = [{ wch: 25 }, { wch: 18 }, { wch: 12 }, { wch: 14 }];

  XLSX.utils.book_append_sheet(wb, ws, t.sheetName);
  await writeAndShare(wb, `${t.fileName}_${categoryName}.xlsx`, t.dialogTitle);
}
