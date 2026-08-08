import {
  excelCountCell,
  excelDateCell,
  excelMoneyCell,
  excelPercentCell,
  excelQuantityCell,
  sanitizeExcelFileName,
  sanitizeExcelSheetName,
} from '../excelWorkbook';

describe('ortak Excel workbook sözleşmesi', () => {
  it('hesaplanabilir değerleri metin yerine gerçek Excel sayısı olarak üretir', () => {
    expect(excelMoneyCell(1234.56, 'TRY', {})).toMatchObject({ v: 1234.56, t: 'n' });
    expect(excelPercentCell(20, {})).toMatchObject({ v: 0.2, t: 'n', z: '0.00%' });
    expect(excelCountCell(7, {})).toMatchObject({ v: 7, t: 'n', z: '0' });
    expect(excelQuantityCell(-2.5, {})).toMatchObject({ v: -2.5, t: 'n', z: '0.###' });
  });

  it('tarih-only değerini saat diliminde gün kaydırmadan gerçek tarih hücresine çevirir', () => {
    const cell = excelDateCell('2026-08-03', {});
    expect(cell.t).toBe('d');
    expect(cell.v).toBeInstanceOf(Date);
    const date = cell.v as Date;
    expect([date.getFullYear(), date.getMonth() + 1, date.getDate()]).toEqual([2026, 8, 3]);
  });

  it('geçersiz tarihi bugüne çevirmek yerine ham değer olarak korur', () => {
    expect(excelDateCell('2026-02-31', {})).toMatchObject({ v: '2026-02-31', t: 's' });
    expect(excelDateCell('bozuk-tarih', {})).toMatchObject({ v: 'bozuk-tarih', t: 's' });
  });

  it('dosya ve sayfa adlarını Excel/dosya sistemi sınırlarına uygun hale getirir', () => {
    expect(sanitizeExcelFileName('Cari:/Ayşe?.xlsx.xlsx')).toBe('Cari_Ayşe.xlsx');
    const sheetName = sanitizeExcelSheetName("Çok/Uzun:Bir*Sayfa?[Adı] ve devamı");
    expect(sheetName).not.toMatch(/[:\\/?*[\]]/);
    expect(sheetName.length).toBeLessThanOrEqual(31);
  });
});
