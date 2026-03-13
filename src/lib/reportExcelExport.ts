/**
 * Report Excel Export Utility
 * Çeşitli rapor sayfalarındaki verileri Excel formatında export eder
 */

import XLSX from 'xlsx-js-style';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { formatDateShort, formatDateTime } from './date';
import { formatCurrency, toNumber } from './currency';
import { IslemWithRelations } from '@/types/database';
import type { ProductReportItem } from '@/hooks/useProductReport';
import type { CashFlowItem } from '@/hooks/useCashFlowByCategory';

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

// ============================================================================
// SHARED HELPERS
// ============================================================================

function writeHeaderSection(
  ws: XLSX.WorkSheet,
  title: string,
  meta: { period: string; periodLabel: string; startDate: string; endDate: string; createdAt: string; business: string; isletmeName: string },
  maxCol: number
) {
  ws['A1'] = { v: title, s: titleStyle };
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: maxCol } }];
  ws['A3'] = { v: `${meta.period}:`, s: metaLabelStyle };
  ws['B3'] = { v: meta.periodLabel, s: metaValueStyle };
  ws['A4'] = { v: '', s: metaLabelStyle };
  ws['B4'] = { v: `${formatDateShort(meta.startDate)} - ${formatDateShort(meta.endDate)}`, s: metaValueStyle };
  ws['A5'] = { v: `${meta.createdAt}:`, s: metaLabelStyle };
  ws['B5'] = { v: formatDateTime(new Date().toISOString()), s: metaValueStyle };
  ws['A6'] = { v: `${meta.business}:`, s: metaLabelStyle };
  ws['B6'] = { v: meta.isletmeName, s: businessNameStyle };
}

async function writeAndShare(wb: XLSX.WorkBook, fileName: string, shareDialogTitle: string, sharingNotSupported: string) {
  const wbout = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
  const filePath = `${FileSystem.cacheDirectory}${fileName}`;
  await FileSystem.writeAsStringAsync(filePath, wbout, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const isAvailable = await Sharing.isAvailableAsync();
  if (isAvailable) {
    await Sharing.shareAsync(filePath, {
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      dialogTitle: shareDialogTitle,
      UTI: 'com.microsoft.excel.xlsx',
    });
  } else {
    throw new Error(sharingNotSupported);
  }
}

// ============================================================================
// PRODUCT (ALIŞ-SATIŞ) EXPORT
// ============================================================================

export interface ProductExcelTranslations {
  reportTitle: string;
  period: string;
  createdAt: string;
  business: string;
  productName: string;
  unit: string;
  quantity: string;
  category: string;
  amount: string;
  percentage: string;
  total: string;
  transactionCount: string;
  productBreakdown: string;
  purchases: string;
  sales: string;
  returns: string;
  net: string;
  sheetName: string;
  fileName: string;
  shareDialogTitle: string;
  sharingNotSupported: string;
}

export interface ProductExportOptions {
  isletmeName: string;
  startDate: string;
  endDate: string;
  periodLabel: string;
  purchaseItems: ProductReportItem[];
  purchaseTotal: number;
  purchaseReturnTotal: number;
  purchaseNet: number;
  saleItems: ProductReportItem[];
  saleTotal: number;
  saleReturnTotal: number;
  saleNet: number;
  translations: ProductExcelTranslations;
}

export async function exportProductReportToExcel(options: ProductExportOptions): Promise<void> {
  const {
    isletmeName, startDate, endDate, periodLabel,
    purchaseItems, purchaseTotal, purchaseReturnTotal, purchaseNet,
    saleItems, saleTotal, saleReturnTotal, saleNet,
    translations: t,
  } = options;

  const wb = XLSX.utils.book_new();
  const ws: XLSX.WorkSheet = {};
  const cols = ['A', 'B', 'C', 'D', 'E', 'F'];

  writeHeaderSection(ws, t.reportTitle, {
    period: t.period, periodLabel, startDate, endDate,
    createdAt: t.createdAt, business: t.business, isletmeName,
  }, 5);

  let rowIdx = 8;

  // Helper to write a product section
  const writeSection = (
    sectionTitle: string,
    items: ProductReportItem[],
    total: number,
    returnTotal: number,
    net: number,
  ) => {
    // Section title
    ws[`A${rowIdx}`] = { v: sectionTitle, s: { ...titleStyle, font: { ...titleStyle.font, sz: 13 } } };
    rowIdx++;

    // Summary: Total / Returns / Net
    ws[`A${rowIdx}`] = { v: t.total, s: metaLabelStyle };
    ws[`B${rowIdx}`] = { v: formatCurrency(total), s: metaValueStyle };
    ws[`C${rowIdx}`] = { v: t.returns, s: metaLabelStyle };
    ws[`D${rowIdx}`] = { v: formatCurrency(returnTotal), s: metaValueStyle };
    ws[`E${rowIdx}`] = { v: t.net, s: metaLabelStyle };
    ws[`F${rowIdx}`] = { v: formatCurrency(net), s: { ...businessNameStyle } };
    rowIdx += 2;

    // Headers
    const headers = [t.productName, t.unit, t.quantity, t.category, t.amount, t.percentage];
    headers.forEach((header, i) => {
      ws[`${cols[i]}${rowIdx}`] = { v: header, s: headerStyle };
    });
    rowIdx++;

    // Data rows
    items.forEach((item) => {
      ws[`A${rowIdx}`] = { v: item.urunAdi, s: cellStyle };
      ws[`B${rowIdx}`] = { v: item.urunBirim, s: { ...cellStyle, alignment: { horizontal: 'center', vertical: 'center' } } };
      ws[`C${rowIdx}`] = { v: item.toplamMiktar.toString(), s: { ...cellStyle, alignment: { horizontal: 'center', vertical: 'center' } } };
      ws[`D${rowIdx}`] = { v: item.kategoriAdi || '-', s: cellStyle };
      ws[`E${rowIdx}`] = { v: formatCurrency(item.toplamTutar), s: currencyCellStyle };
      ws[`F${rowIdx}`] = { v: `%${item.percentage}`, s: { ...cellStyle, alignment: { horizontal: 'center', vertical: 'center' } } };
      rowIdx++;
    });

    // Total row
    ws[`A${rowIdx}`] = { v: t.total, s: totalRowStyle };
    ws[`B${rowIdx}`] = { v: '', s: totalRowStyle };
    ws[`C${rowIdx}`] = { v: '', s: totalRowStyle };
    ws[`D${rowIdx}`] = { v: '', s: totalRowStyle };
    ws[`E${rowIdx}`] = { v: formatCurrency(total), s: totalCurrencyStyle };
    ws[`F${rowIdx}`] = { v: '', s: totalRowStyle };
    rowIdx += 2;
  };

  writeSection(t.purchases, purchaseItems, purchaseTotal, purchaseReturnTotal, purchaseNet);
  writeSection(t.sales, saleItems, saleTotal, saleReturnTotal, saleNet);

  ws['!ref'] = `A1:F${rowIdx}`;
  ws['!cols'] = [
    { wch: 24 }, // Product name
    { wch: 10 }, // Unit
    { wch: 10 }, // Quantity
    { wch: 18 }, // Category
    { wch: 16 }, // Amount
    { wch: 10 }, // Percentage
  ];
  ws['!rows'] = [{ hpt: 24 }];

  XLSX.utils.book_append_sheet(wb, ws, t.sheetName);

  const fileName = `${t.fileName}_${startDate}_${endDate}.xlsx`;
  await writeAndShare(wb, fileName, t.shareDialogTitle, t.sharingNotSupported);
}

// ============================================================================
// CASH FLOW (NAKİT AKIŞI) EXPORT
// ============================================================================

export interface CashFlowExcelTranslations {
  reportTitle: string;
  period: string;
  createdAt: string;
  business: string;
  category: string;
  amount: string;
  percentage: string;
  transactionCount: string;
  total: string;
  inflow: string;
  outflow: string;
  netCashFlow: string;
  sheetName: string;
  fileName: string;
  shareDialogTitle: string;
  sharingNotSupported: string;
}

export interface CashFlowExportOptions {
  isletmeName: string;
  startDate: string;
  endDate: string;
  periodLabel: string;
  inflowItems: CashFlowItem[];
  outflowItems: CashFlowItem[];
  totalInflow: number;
  totalOutflow: number;
  netCashFlow: number;
  translations: CashFlowExcelTranslations;
}

export async function exportCashFlowToExcel(options: CashFlowExportOptions): Promise<void> {
  const {
    isletmeName, startDate, endDate, periodLabel,
    inflowItems, outflowItems,
    totalInflow, totalOutflow, netCashFlow,
    translations: t,
  } = options;

  const wb = XLSX.utils.book_new();
  const ws: XLSX.WorkSheet = {};

  writeHeaderSection(ws, t.reportTitle, {
    period: t.period, periodLabel, startDate, endDate,
    createdAt: t.createdAt, business: t.business, isletmeName,
  }, 3);

  let rowIdx = 8;

  // Summary
  const summaryHeaderBg = '2E75B6';
  ws[`A${rowIdx}`] = { v: t.inflow, s: { ...metaLabelStyle, font: { bold: true, sz: 11, color: { rgb: '22C55E' } } } };
  ws[`B${rowIdx}`] = { v: formatCurrency(totalInflow), s: { ...metaValueStyle, font: { bold: true, sz: 11, color: { rgb: '22C55E' } } } };
  ws[`C${rowIdx}`] = { v: t.outflow, s: { ...metaLabelStyle, font: { bold: true, sz: 11, color: { rgb: 'EF4444' } } } };
  ws[`D${rowIdx}`] = { v: formatCurrency(totalOutflow), s: { ...metaValueStyle, font: { bold: true, sz: 11, color: { rgb: 'EF4444' } } } };
  rowIdx++;
  ws[`A${rowIdx}`] = { v: t.netCashFlow, s: metaLabelStyle };
  ws[`B${rowIdx}`] = { v: formatCurrency(netCashFlow), s: { ...businessNameStyle, font: { bold: true, sz: 12, color: { rgb: netCashFlow >= 0 ? '22C55E' : 'EF4444' } } } };
  rowIdx += 2;

  // Helper to write a flow section
  const writeFlowSection = (sectionTitle: string, items: CashFlowItem[], total: number) => {
    ws[`A${rowIdx}`] = { v: sectionTitle, s: { ...titleStyle, font: { ...titleStyle.font, sz: 13 } } };
    rowIdx++;

    // Headers
    ws[`A${rowIdx}`] = { v: t.category, s: headerStyle };
    ws[`B${rowIdx}`] = { v: t.transactionCount, s: headerStyle };
    ws[`C${rowIdx}`] = { v: t.amount, s: headerStyle };
    ws[`D${rowIdx}`] = { v: t.percentage, s: headerStyle };
    rowIdx++;

    items.forEach((item) => {
      ws[`A${rowIdx}`] = { v: item.kategori?.name || '-', s: cellStyle };
      ws[`B${rowIdx}`] = { v: item.count.toString(), s: { ...cellStyle, alignment: { horizontal: 'center', vertical: 'center' } } };
      ws[`C${rowIdx}`] = { v: formatCurrency(item.total), s: currencyCellStyle };
      ws[`D${rowIdx}`] = { v: `%${Math.round(item.percentage)}`, s: { ...cellStyle, alignment: { horizontal: 'center', vertical: 'center' } } };
      rowIdx++;
    });

    // Total row
    ws[`A${rowIdx}`] = { v: t.total, s: totalRowStyle };
    ws[`B${rowIdx}`] = { v: '', s: totalRowStyle };
    ws[`C${rowIdx}`] = { v: formatCurrency(total), s: totalCurrencyStyle };
    ws[`D${rowIdx}`] = { v: '', s: totalRowStyle };
    rowIdx += 2;
  };

  writeFlowSection(t.inflow, inflowItems, totalInflow);
  writeFlowSection(t.outflow, outflowItems, totalOutflow);

  ws['!ref'] = `A1:D${rowIdx}`;
  ws['!cols'] = [
    { wch: 24 }, // Category
    { wch: 10 }, // Count
    { wch: 18 }, // Amount
    { wch: 10 }, // Percentage
  ];
  ws['!rows'] = [{ hpt: 24 }];

  XLSX.utils.book_append_sheet(wb, ws, t.sheetName);

  const fileName = `${t.fileName}_${startDate}_${endDate}.xlsx`;
  await writeAndShare(wb, fileName, t.shareDialogTitle, t.sharingNotSupported);
}

// ============================================================================
// GENEL DURUM (FINANCIAL SNAPSHOT) EXPORT
// ============================================================================

export interface GenelDurumExcelTranslations {
  reportTitle: string;
  createdAt: string;
  business: string;
  generalStatus: string;
  netValue: string;
  accounts: string;
  receivables: string;
  payables: string;
  accountBalances: string;
  accountName: string;
  balance: string;
  total: string;
  creditCardBalances: string;
  clientStatus: string;
  personnelStatus: string;
  personnelReceivables: string;
  personnelDebt: string;
  netStatus: string;
  instant: string;
  sheetName: string;
  fileName: string;
  shareDialogTitle: string;
  sharingNotSupported: string;
}

export interface GenelDurumAccountItem {
  name: string;
  balance: number;
  currency?: string;
  convertedBalance?: number;
}

export interface GenelDurumExportOptions {
  isletmeName: string;
  baseCurrency: string;
  netValue: number;
  totalAccounts: number;
  totalReceivables: number;
  totalPayables: number;
  normalHesaplar: GenelDurumAccountItem[];
  normalHesaplarToplam: number;
  krediKartiHesaplar: GenelDurumAccountItem[];
  krediKartiToplam: number;
  cariReceivables: number;
  cariPayables: number;
  personelReceivables: number;
  personelDebt: number;
  translations: GenelDurumExcelTranslations;
}

export async function exportGenelDurumToExcel(options: GenelDurumExportOptions): Promise<void> {
  const {
    isletmeName, baseCurrency,
    netValue, totalAccounts, totalReceivables, totalPayables,
    normalHesaplar, normalHesaplarToplam,
    krediKartiHesaplar, krediKartiToplam,
    cariReceivables, cariPayables,
    personelReceivables, personelDebt,
    translations: t,
  } = options;

  const wb = XLSX.utils.book_new();
  const ws: XLSX.WorkSheet = {};

  // Title
  ws['A1'] = { v: t.reportTitle, s: titleStyle };
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 2 } }];

  // Meta
  ws['A3'] = { v: `${t.createdAt}:`, s: metaLabelStyle };
  ws['B3'] = { v: formatDateTime(new Date().toISOString()), s: metaValueStyle };
  ws['A4'] = { v: `${t.business}:`, s: metaLabelStyle };
  ws['B4'] = { v: isletmeName, s: businessNameStyle };
  ws['A5'] = { v: '', s: metaLabelStyle };
  ws['B5'] = { v: t.instant, s: { ...metaValueStyle, font: { sz: 11, color: { rgb: '4472C4' }, italic: true } } };

  let rowIdx = 7;

  // ---- Genel Durum Summary ----
  ws[`A${rowIdx}`] = { v: t.generalStatus, s: { ...titleStyle, font: { ...titleStyle.font, sz: 13 } } };
  rowIdx++;

  ws[`A${rowIdx}`] = { v: t.netValue, s: headerStyle };
  ws[`B${rowIdx}`] = { v: t.accounts, s: headerStyle };
  ws[`C${rowIdx}`] = { v: t.receivables, s: headerStyle };
  ws[`D${rowIdx}`] = { v: t.payables, s: headerStyle };
  rowIdx++;

  ws[`A${rowIdx}`] = { v: formatCurrency(netValue, baseCurrency), s: { ...currencyCellStyle, font: { bold: true, sz: 11, color: { rgb: netValue >= 0 ? '22C55E' : 'EF4444' } } } };
  ws[`B${rowIdx}`] = { v: formatCurrency(totalAccounts, baseCurrency), s: currencyCellStyle };
  ws[`C${rowIdx}`] = { v: formatCurrency(totalReceivables, baseCurrency), s: currencyCellStyle };
  ws[`D${rowIdx}`] = { v: formatCurrency(totalPayables, baseCurrency), s: currencyCellStyle };
  rowIdx += 2;

  // ---- Account Balances ----
  ws[`A${rowIdx}`] = { v: t.accountBalances, s: { ...titleStyle, font: { ...titleStyle.font, sz: 13 } } };
  rowIdx++;

  ws[`A${rowIdx}`] = { v: t.accountName, s: headerStyle };
  ws[`B${rowIdx}`] = { v: t.balance, s: headerStyle };
  rowIdx++;

  normalHesaplar.forEach((h) => {
    ws[`A${rowIdx}`] = { v: h.name, s: cellStyle };
    ws[`B${rowIdx}`] = { v: formatCurrency(h.balance, h.currency || baseCurrency), s: currencyCellStyle };
    rowIdx++;
  });

  ws[`A${rowIdx}`] = { v: t.total, s: totalRowStyle };
  ws[`B${rowIdx}`] = { v: formatCurrency(normalHesaplarToplam, baseCurrency), s: totalCurrencyStyle };
  rowIdx += 2;

  // ---- Credit Card Balances ----
  if (krediKartiHesaplar.length > 0) {
    ws[`A${rowIdx}`] = { v: t.creditCardBalances, s: { ...titleStyle, font: { ...titleStyle.font, sz: 13 } } };
    rowIdx++;

    ws[`A${rowIdx}`] = { v: t.accountName, s: headerStyle };
    ws[`B${rowIdx}`] = { v: t.balance, s: headerStyle };
    rowIdx++;

    krediKartiHesaplar.forEach((h) => {
      ws[`A${rowIdx}`] = { v: h.name, s: cellStyle };
      ws[`B${rowIdx}`] = { v: formatCurrency(Math.abs(h.balance), h.currency || baseCurrency), s: currencyCellStyle };
      rowIdx++;
    });

    ws[`A${rowIdx}`] = { v: t.total, s: totalRowStyle };
    ws[`B${rowIdx}`] = { v: formatCurrency(Math.abs(krediKartiToplam), baseCurrency), s: totalCurrencyStyle };
    rowIdx += 2;
  }

  // ---- Cari Status ----
  ws[`A${rowIdx}`] = { v: t.clientStatus, s: { ...titleStyle, font: { ...titleStyle.font, sz: 13 } } };
  rowIdx++;

  ws[`A${rowIdx}`] = { v: t.receivables, s: headerStyle };
  ws[`B${rowIdx}`] = { v: t.payables, s: headerStyle };
  ws[`C${rowIdx}`] = { v: t.netStatus, s: headerStyle };
  rowIdx++;

  ws[`A${rowIdx}`] = { v: formatCurrency(cariReceivables, baseCurrency), s: { ...currencyCellStyle, font: { sz: 10, color: { rgb: '22C55E' } } } };
  ws[`B${rowIdx}`] = { v: formatCurrency(cariPayables, baseCurrency), s: { ...currencyCellStyle, font: { sz: 10, color: { rgb: 'EF4444' } } } };
  const cariNet = cariReceivables - cariPayables;
  ws[`C${rowIdx}`] = { v: formatCurrency(cariNet, baseCurrency), s: { ...currencyCellStyle, font: { bold: true, sz: 10, color: { rgb: cariNet >= 0 ? '22C55E' : 'EF4444' } } } };
  rowIdx += 2;

  // ---- Personnel Status ----
  ws[`A${rowIdx}`] = { v: t.personnelStatus, s: { ...titleStyle, font: { ...titleStyle.font, sz: 13 } } };
  rowIdx++;

  ws[`A${rowIdx}`] = { v: t.personnelReceivables, s: headerStyle };
  ws[`B${rowIdx}`] = { v: t.personnelDebt, s: headerStyle };
  ws[`C${rowIdx}`] = { v: t.netStatus, s: headerStyle };
  rowIdx++;

  ws[`A${rowIdx}`] = { v: formatCurrency(personelReceivables, baseCurrency), s: { ...currencyCellStyle, font: { sz: 10, color: { rgb: '22C55E' } } } };
  ws[`B${rowIdx}`] = { v: formatCurrency(personelDebt, baseCurrency), s: { ...currencyCellStyle, font: { sz: 10, color: { rgb: 'EF4444' } } } };
  const personelNet = personelReceivables - personelDebt;
  ws[`C${rowIdx}`] = { v: formatCurrency(personelNet, baseCurrency), s: { ...currencyCellStyle, font: { bold: true, sz: 10, color: { rgb: personelNet >= 0 ? '22C55E' : 'EF4444' } } } };

  ws['!ref'] = `A1:D${rowIdx}`;
  ws['!cols'] = [
    { wch: 24 }, // Label/Account name
    { wch: 18 }, // Balance/Value
    { wch: 18 }, // Col C
    { wch: 18 }, // Col D
  ];
  ws['!rows'] = [{ hpt: 24 }];

  XLSX.utils.book_append_sheet(wb, ws, t.sheetName);

  const fileName = `${t.fileName}_${new Date().toISOString().slice(0, 10)}.xlsx`;
  await writeAndShare(wb, fileName, t.shareDialogTitle, t.sharingNotSupported);
}
