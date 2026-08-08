import XLSX from 'xlsx-js-style';
import { formatDateShort, formatDateTime } from './date';
import {
  excelCountCell,
  excelDateCell,
  excelMoneyCell,
  excelPercentCell,
  excelQuantityCell,
  sanitizeExcelSheetName,
  writeAndShareExcelWorkbook,
} from './excelWorkbook';

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
    sharingNotSupported: string;
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
  ws[`B${sumRow + 1}`] = excelQuantityCell(quota.hakEdilen, numberCellStyle);
  ws[`A${sumRow + 2}`] = { v: t.used, s: cellStyle };
  ws[`B${sumRow + 2}`] = excelQuantityCell(quota.kullanilan, numberCellStyle);
  ws[`A${sumRow + 3}`] = { v: t.remaining, s: totalRowStyle };
  ws[`B${sumRow + 3}`] = excelQuantityCell(
    quota.hakEdilen - quota.kullanilan,
    totalNumberStyle,
  );

  // Headers
  const hRow = sumRow + 5;
  const headers = [t.date, t.dateRange, t.type, t.days, t.description];
  headers.forEach((h, i) => {
    ws[XLSX.utils.encode_cell({ r: hRow - 1, c: i })] = { v: h, s: headerStyle };
  });

  // Data
  transactions.forEach((tx, i) => {
    const r = hRow + i;
    ws[XLSX.utils.encode_cell({ r, c: 0 })] = excelDateCell(tx.date, cellStyle);
    ws[XLSX.utils.encode_cell({ r, c: 1 })] = {
      v: tx.date_end ? `${formatDateShort(tx.date)} - ${formatDateShort(tx.date_end)}` : '',
      s: cellStyle,
    };
    ws[XLSX.utils.encode_cell({ r, c: 2 })] = { v: t.typeLabels[tx.type] || tx.type, s: cellStyle };
    ws[XLSX.utils.encode_cell({ r, c: 3 })] = excelQuantityCell(tx.amount, numberCellStyle);
    ws[XLSX.utils.encode_cell({ r, c: 4 })] = { v: tx.description || '', s: cellStyle };
  });

  ws['!ref'] = `A1:E${hRow + transactions.length}`;
  ws['!cols'] = [{ wch: 14 }, { wch: 28 }, { wch: 20 }, { wch: 10 }, { wch: 30 }];

  XLSX.utils.book_append_sheet(wb, ws, sanitizeExcelSheetName(t.sheetName));
  await writeAndShareExcelWorkbook(
    wb,
    `${t.fileName}_${personelName}.xlsx`,
    t.dialogTitle,
    t.sharingNotSupported,
  );
}

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
  /** Doğrudan ana kategoriye bağlı (alt kategorisiz) işlemlerin toplamı. */
  parentAmount: number;
  /** Doğrudan ana kategoriye bağlı işlem sayısı. */
  parentTransactionCount: number;
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
    sharingNotSupported: string;
  };
}

export function buildCategoryDetailRows(
  categoryName: string,
  subCategories: CategoryDetailExportOptions['subCategories'],
  parentAmount: number,
  parentTransactionCount: number,
  totalAmount: number,
) {
  return parentTransactionCount > 0
    ? [
        {
          name: categoryName,
          amount: parentAmount,
          percentage: totalAmount > 0 ? (parentAmount / totalAmount) * 100 : 0,
          transactionCount: parentTransactionCount,
        },
        ...subCategories,
      ]
    : subCategories;
}

export async function exportCategoryDetail(opts: CategoryDetailExportOptions) {
  const {
    categoryName,
    isletmeName,
    startDate,
    endDate,
    subCategories,
    parentAmount,
    parentTransactionCount,
    totalAmount,
    currency = 'TRY',
    t,
  } = opts;
  const wb = XLSX.utils.book_new();
  const ws: XLSX.WorkSheet = {};
  const rows = buildCategoryDetailRows(
    categoryName,
    subCategories,
    parentAmount,
    parentTransactionCount,
    totalAmount,
  );

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

  rows.forEach((sc, i) => {
    const r = hRow + i;
    ws[XLSX.utils.encode_cell({ r, c: 0 })] = { v: sc.name, s: cellStyle };
    ws[XLSX.utils.encode_cell({ r, c: 1 })] = excelMoneyCell(sc.amount, currency, numberCellStyle);
    ws[XLSX.utils.encode_cell({ r, c: 2 })] = excelPercentCell(sc.percentage, numberCellStyle);
    ws[XLSX.utils.encode_cell({ r, c: 3 })] = excelCountCell(sc.transactionCount, numberCellStyle);
  });

  const totalRow = hRow + rows.length;
  ws[XLSX.utils.encode_cell({ r: totalRow, c: 0 })] = { v: t.total, s: totalRowStyle };
  ws[XLSX.utils.encode_cell({ r: totalRow, c: 1 })] = excelMoneyCell(totalAmount, currency, totalNumberStyle);
  ws[XLSX.utils.encode_cell({ r: totalRow, c: 2 })] = excelPercentCell(100, totalNumberStyle);
  const totalTx = rows.reduce((sum, row) => sum + row.transactionCount, 0);
  ws[XLSX.utils.encode_cell({ r: totalRow, c: 3 })] = excelCountCell(totalTx, totalNumberStyle);

  ws['!ref'] = `A1:D${totalRow + 1}`;
  ws['!cols'] = [{ wch: 25 }, { wch: 18 }, { wch: 12 }, { wch: 14 }];

  XLSX.utils.book_append_sheet(wb, ws, sanitizeExcelSheetName(t.sheetName));
  await writeAndShareExcelWorkbook(
    wb,
    `${t.fileName}_${categoryName}_${startDate}_${endDate}.xlsx`,
    t.dialogTitle,
    t.sharingNotSupported,
  );
}
