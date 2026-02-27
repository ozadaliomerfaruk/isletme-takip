/**
 * Report Excel Export Utility
 * Gelir/Gider rapor sayfalarındaki işlemleri Excel formatında export eder
 */

import XLSX from 'xlsx-js-style';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { formatDateShort, formatDateTime } from './date';
import { formatCurrency, toNumber } from './currency';
import { IslemWithRelations } from '@/types/database';

// ============================================================================
// STYLE DEFINITIONS
// ============================================================================

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

const businessNameStyle = {
  font: { bold: true, sz: 11, color: { rgb: '1F4E79' } },
  alignment: { horizontal: 'left' },
};

const headerStyle = {
  font: { bold: true, sz: 11, color: { rgb: 'FFFFFF' } },
  fill: { fgColor: { rgb: '4472C4' } },
  alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
  border: thinBorder,
};

const cellStyle = {
  font: { sz: 10, color: { rgb: '333333' } },
  alignment: { horizontal: 'left', vertical: 'center' },
  border: thinBorder,
};

const currencyCellStyle = {
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

const totalCurrencyStyle = {
  font: { bold: true, sz: 10, color: { rgb: 'FFFFFF' } },
  fill: { fgColor: { rgb: '5B9BD5' } },
  alignment: { horizontal: 'right', vertical: 'center' },
  border: thinBorder,
};

const categoryHeaderStyle = {
  font: { bold: true, sz: 11, color: { rgb: '1F4E79' } },
  fill: { fgColor: { rgb: 'D6E4F0' } },
  alignment: { horizontal: 'left', vertical: 'center' },
  border: thinBorder,
};

const categoryCurrencyStyle = {
  font: { bold: true, sz: 11, color: { rgb: '1F4E79' } },
  fill: { fgColor: { rgb: 'D6E4F0' } },
  alignment: { horizontal: 'right', vertical: 'center' },
  border: thinBorder,
};

// ============================================================================
// TYPES
// ============================================================================

export type ReportType = 'gelir' | 'gider';

export interface ReportExcelTranslations {
  reportTitle: string;
  period: string;
  createdAt: string;
  business: string;
  date: string;
  description: string;
  category: string;
  account: string;
  amount: string;
  total: string;
  transactionCount: string;
  categoryBreakdown: string;
  sheetName: string;
  fileName: string;
  shareDialogTitle: string;
  sharingNotSupported: string;
  transactionTypes: Record<string, string>;
}

export interface ReportExportOptions {
  reportType: ReportType;
  isletmeName: string;
  startDate: string;
  endDate: string;
  periodLabel: string;
  transactions: IslemWithRelations[];
  translations: ReportExcelTranslations;
}

// ============================================================================
// EXCEL GENERATION
// ============================================================================

export async function exportReportToExcel(options: ReportExportOptions): Promise<void> {
  const {
    isletmeName,
    startDate,
    endDate,
    periodLabel,
    transactions,
    translations: t,
  } = options;

  // Sort transactions by date
  const sorted = [...transactions].sort((a, b) => a.date.localeCompare(b.date));

  // Build category summary
  const categoryMap = new Map<string, { name: string; total: number; count: number }>();
  sorted.forEach((islem) => {
    const catName = islem.kategori?.name || '-';
    const catId = islem.kategori?.id || 'none';
    const existing = categoryMap.get(catId);
    const amount = toNumber(islem.amount);
    if (existing) {
      existing.total += amount;
      existing.count += 1;
    } else {
      categoryMap.set(catId, { name: catName, total: amount, count: 1 });
    }
  });

  const categories = Array.from(categoryMap.values()).sort((a, b) => b.total - a.total);
  const grandTotal = sorted.reduce((sum, islem) => sum + toNumber(islem.amount), 0);

  // Create workbook
  const wb = XLSX.utils.book_new();
  const ws: XLSX.WorkSheet = {};
  const cols = ['A', 'B', 'C', 'D', 'E'];

  // ============ HEADER SECTION ============
  // Row 1: Title
  ws['A1'] = { v: t.reportTitle, s: titleStyle };
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 4 } }];

  // Row 3: Period
  ws['A3'] = { v: `${t.period}:`, s: metaLabelStyle };
  ws['B3'] = { v: periodLabel, s: metaValueStyle };

  // Row 4: Date range
  ws['A4'] = { v: '', s: metaLabelStyle };
  ws['B4'] = { v: `${formatDateShort(startDate)} - ${formatDateShort(endDate)}`, s: metaValueStyle };

  // Row 5: Created
  ws['A5'] = { v: `${t.createdAt}:`, s: metaLabelStyle };
  ws['B5'] = { v: formatDateTime(new Date().toISOString()), s: metaValueStyle };

  // Row 6: Business
  ws['A6'] = { v: `${t.business}:`, s: metaLabelStyle };
  ws['B6'] = { v: isletmeName, s: businessNameStyle };

  // ============ CATEGORY BREAKDOWN ============
  // Row 8: Section title
  ws['A8'] = { v: t.categoryBreakdown, s: { ...titleStyle, font: { ...titleStyle.font, sz: 13 } } };

  // Row 9: Category headers
  ws['A9'] = { v: t.category, s: headerStyle };
  ws['B9'] = { v: t.transactionCount, s: headerStyle };
  ws['C9'] = { v: t.amount, s: headerStyle };

  // Category rows
  let rowIdx = 10;
  categories.forEach((cat) => {
    ws[`A${rowIdx}`] = { v: cat.name, s: cellStyle };
    ws[`B${rowIdx}`] = { v: cat.count.toString(), s: { ...cellStyle, alignment: { horizontal: 'center', vertical: 'center' } } };
    ws[`C${rowIdx}`] = { v: formatCurrency(cat.total, 'TRY'), s: currencyCellStyle };
    rowIdx++;
  });

  // Category total row
  ws[`A${rowIdx}`] = { v: t.total, s: totalRowStyle };
  ws[`B${rowIdx}`] = { v: sorted.length.toString(), s: { ...totalCurrencyStyle, alignment: { horizontal: 'center', vertical: 'center' } } };
  ws[`C${rowIdx}`] = { v: formatCurrency(grandTotal, 'TRY'), s: totalCurrencyStyle };
  rowIdx += 2;

  // ============ TRANSACTION LIST ============
  // Headers
  const detailHeaders = [t.date, t.description, t.category, t.account, t.amount];
  detailHeaders.forEach((header, i) => {
    ws[`${cols[i]}${rowIdx}`] = { v: header, s: headerStyle };
  });
  rowIdx++;

  // Transaction rows grouped by category
  const catGroups = new Map<string, IslemWithRelations[]>();
  sorted.forEach((islem) => {
    const catName = islem.kategori?.name || '-';
    const existing = catGroups.get(catName);
    if (existing) {
      existing.push(islem);
    } else {
      catGroups.set(catName, [islem]);
    }
  });

  // Sort category groups by total amount (descending)
  const sortedGroups = Array.from(catGroups.entries()).sort((a, b) => {
    const totalA = a[1].reduce((sum, i) => sum + toNumber(i.amount), 0);
    const totalB = b[1].reduce((sum, i) => sum + toNumber(i.amount), 0);
    return totalB - totalA;
  });

  sortedGroups.forEach(([catName, items]) => {
    // Category group header
    const catTotal = items.reduce((sum, i) => sum + toNumber(i.amount), 0);
    ws[`A${rowIdx}`] = { v: catName, s: categoryHeaderStyle };
    ws[`B${rowIdx}`] = { v: '', s: categoryHeaderStyle };
    ws[`C${rowIdx}`] = { v: '', s: categoryHeaderStyle };
    ws[`D${rowIdx}`] = { v: '', s: categoryHeaderStyle };
    ws[`E${rowIdx}`] = { v: formatCurrency(catTotal, 'TRY'), s: categoryCurrencyStyle };
    rowIdx++;

    // Individual transactions
    items.forEach((islem) => {
      const accountName = islem.hesap?.name || '';
      ws[`A${rowIdx}`] = { v: formatDateShort(islem.date), s: cellStyle };
      ws[`B${rowIdx}`] = { v: islem.description || '', s: cellStyle };
      ws[`C${rowIdx}`] = { v: islem.kategori?.name || '-', s: cellStyle };
      ws[`D${rowIdx}`] = { v: accountName, s: cellStyle };
      ws[`E${rowIdx}`] = { v: formatCurrency(toNumber(islem.amount), 'TRY'), s: currencyCellStyle };
      rowIdx++;
    });
  });

  // Grand total row
  ws[`A${rowIdx}`] = { v: '', s: totalRowStyle };
  ws[`B${rowIdx}`] = { v: '', s: totalRowStyle };
  ws[`C${rowIdx}`] = { v: '', s: totalRowStyle };
  ws[`D${rowIdx}`] = { v: t.total, s: totalRowStyle };
  ws[`E${rowIdx}`] = { v: formatCurrency(grandTotal, 'TRY'), s: totalCurrencyStyle };

  // Set worksheet range
  ws['!ref'] = `A1:E${rowIdx}`;

  // Column widths
  ws['!cols'] = [
    { wch: 12 }, // Date
    { wch: 30 }, // Description
    { wch: 18 }, // Category
    { wch: 18 }, // Account
    { wch: 16 }, // Amount
  ];

  // Row heights
  ws['!rows'] = [{ hpt: 24 }];

  // Add to workbook
  XLSX.utils.book_append_sheet(wb, ws, t.sheetName);

  // Export as base64
  const wbout = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });

  // File name
  const fileName = `${t.fileName}_${startDate}_${endDate}.xlsx`;
  const filePath = `${FileSystem.cacheDirectory}${fileName}`;

  // Write file
  await FileSystem.writeAsStringAsync(filePath, wbout, {
    encoding: FileSystem.EncodingType.Base64,
  });

  // Share
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
