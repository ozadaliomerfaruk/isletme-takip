import XLSX from 'xlsx-js-style';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

import { getCurrencySymbol } from '@/constants/currencies';

export const EXCEL_MIME_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export const EXCEL_UTI = 'com.microsoft.excel.xlsx';

function currencyNumberFormat(currency: string): string {
  const symbol = getCurrencySymbol(currency).replace(/"/g, '""');
  return `"${symbol}"#,##0.00`;
}

/** Excel'de formül, toplam, sıralama ve grafik çalıştırılabilen gerçek para hücresi. */
export function excelMoneyCell(
  amount: number,
  currency: string,
  style: object,
) {
  return {
    v: amount,
    t: 'n' as const,
    z: currencyNumberFormat(currency),
    s: style,
  };
}

/** Null değerleri boş, dolu değerleri gerçek Excel sayısı olarak yazar. */
export function excelOptionalMoneyCell(
  amount: number | null | undefined,
  currency: string,
  style: object,
) {
  return amount === null || amount === undefined
    ? { v: '', s: style }
    : excelMoneyCell(amount, currency, style);
}

export function excelPercentCell(percentage: number, style: object) {
  return {
    v: percentage / 100,
    t: 'n' as const,
    z: '0.00%',
    s: style,
  };
}

export function excelCountCell(value: number, style: object) {
  return { v: value, t: 'n' as const, z: '0', s: style };
}

export function excelQuantityCell(value: number, style: object) {
  return { v: value, t: 'n' as const, z: '0.###', s: style };
}

function parseExcelDate(value: string | Date): Date | null {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? new Date(value.getTime()) : null;
  }

  const source = value.trim();
  if (!source) return null;

  // Tarih-only değerini UTC'ye kaydırmadan yerel takvim günü olarak kur.
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(source);
  if (dateOnly) {
    const year = Number(dateOnly[1]);
    const month = Number(dateOnly[2]);
    const day = Number(dateOnly[3]);
    const parsed = new Date(year, month - 1, day);
    return parsed.getFullYear() === year
      && parsed.getMonth() === month - 1
      && parsed.getDate() === day
      ? parsed
      : null;
  }

  // Postgres'in boşluklu timestamp ve mikrosaniye biçimlerini Hermes/JSC için normalize et.
  let normalized = source;
  if (/^\d{4}-\d{2}-\d{2} \d/.test(normalized)) {
    normalized = normalized.replace(' ', 'T');
  }
  normalized = normalized.replace(/(\.\d{3})\d+/, '$1');
  const parsed = new Date(normalized);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function replaceControlCharacters(value: string): string {
  return Array.from(value, (character) => (
    character.charCodeAt(0) <= 0x1f ? '_' : character
  )).join('');
}

/** Geçerli tarihleri gerçek Excel tarihi, bozuk girdileri dürüstçe ham metin olarak yazar. */
export function excelDateCell(
  value: string | Date,
  style: object,
  numberFormat = 'yyyy-mm-dd',
) {
  const date = parseExcelDate(value);
  if (!date) return { v: value instanceof Date ? '' : value, t: 's' as const, s: style };
  return {
    v: date,
    t: 'd' as const,
    z: numberFormat,
    s: style,
  };
}

/** Dosya sistemlerinde yasak karakterleri temizler ve tek bir .xlsx uzantısı üretir. */
export function sanitizeExcelFileName(fileName: string, fallback = 'export'): string {
  const withoutExtension = fileName.replace(/(?:\.xlsx)+$/i, '');
  const safeBase = replaceControlCharacters(withoutExtension
    .normalize('NFC')
    .replace(/[<>:"/\\|?*]/g, '_'))
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[\s._]+|[\s._]+$/g, '')
    .slice(0, 120);
  return `${safeBase || fallback}.xlsx`;
}

/** Excel'in 31 karakter ve : \\ / ? * [ ] kısıtlarına uygun sayfa adı. */
export function sanitizeExcelSheetName(sheetName: string, fallback = 'Sheet1'): string {
  const safe = replaceControlCharacters(sheetName
    .normalize('NFC')
    .replace(/[:\\/?*[\]]/g, '_'))
    .replace(/_+/g, '_')
    .replace(/^['\s]+|['\s]+$/g, '')
    .slice(0, 31);
  return safe || fallback;
}

export async function writeAndShareExcelWorkbook(
  workbook: XLSX.WorkBook,
  fileName: string,
  dialogTitle: string,
  sharingNotSupported: string,
): Promise<string> {
  const workbookBase64 = XLSX.write(workbook, { type: 'base64', bookType: 'xlsx' });
  const safeFileName = sanitizeExcelFileName(fileName);
  const filePath = `${FileSystem.cacheDirectory}${safeFileName}`;

  await FileSystem.writeAsStringAsync(filePath, workbookBase64, {
    encoding: FileSystem.EncodingType.Base64,
  });

  if (!(await Sharing.isAvailableAsync())) {
    throw new Error(sharingNotSupported);
  }

  await Sharing.shareAsync(filePath, {
    mimeType: EXCEL_MIME_TYPE,
    dialogTitle,
    UTI: EXCEL_UTI,
  });
  return filePath;
}
