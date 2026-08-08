import * as XLSX from 'xlsx';
import type { IslemWithRelations, UrunHareket } from '@/types/database';
import type { ProductPriceChangeItem } from '@/hooks/useProductPriceChangeReport';

jest.mock('../excelWorkbook', () => ({
  ...jest.requireActual('../excelWorkbook'),
  writeAndShareExcelWorkbook: jest.fn().mockResolvedValue('cache://mock.xlsx'),
}));

import { writeAndShareExcelWorkbook } from '../excelWorkbook';

import {
  exportToExcel,
  exportUrunHareketlerToExcel,
  exportUrunListesiToExcel,
  type ExcelTranslations,
  type UrunExcelTranslations,
  type UrunListeExcelTranslations,
} from '../excelExport';
import {
  exportComparisonReportToExcel,
  exportNetWorthTrendToExcel,
  exportProductPriceChangeReportToExcel,
  type ProductPriceChangeExcelTranslations,
} from '../reportExcelExport';

const mockWriteAndShareExcelWorkbook = writeAndShareExcelWorkbook as jest.MockedFunction<
  typeof writeAndShareExcelWorkbook
>;

function readLastWorkbook(): XLSX.WorkBook {
  const calls = mockWriteAndShareExcelWorkbook.mock.calls;
  const capturedWorkbook = calls[calls.length - 1]?.[0] as XLSX.WorkBook;
  expect(capturedWorkbook).toBeDefined();
  const base64 = XLSX.write(capturedWorkbook, { type: 'base64', bookType: 'xlsx' });
  return XLSX.read(base64, { type: 'base64', cellDates: true });
}

function firstSheet(workbook: XLSX.WorkBook): XLSX.WorkSheet {
  return workbook.Sheets[workbook.SheetNames[0]];
}

const statementTranslations: ExcelTranslations = {
  statement: 'Ekstresi',
  accountStatement: 'Hesap Ekstresi',
  clientStatement: 'Cari Ekstresi',
  staffStatement: 'Personel Ekstresi',
  account: 'Hesap',
  client: 'Cari',
  staff: 'Personel',
  period: 'Dönem',
  createdAt: 'Oluşturulma',
  business: 'İşletme',
  date: 'Tarih',
  transactionType: 'İşlem Tipi',
  description: 'Açıklama',
  category: 'Kategori',
  accountColumn: 'Hesap',
  cariPersonelColumn: 'Cari / Personel',
  debit: 'Borç',
  credit: 'Alacak',
  debitBalance: 'Borç Bakiye',
  creditBalance: 'Alacak Bakiye',
  openingBalance: 'Başlangıç Bakiyesi',
  periodTotal: 'Dönem Toplamı',
  closingBalance: 'Son Bakiye',
  sheetName: 'Ekstre',
  transactionTypes: { gider: 'Gider' },
  statementFileName: 'Ekstre',
  shareDialogTitle: 'Excel Olarak Paylaş',
  sharingNotSupported: 'Desteklenmiyor',
};

const movementTranslations: UrunExcelTranslations = {
  productMovements: 'Ürün Hareketleri',
  product: 'Ürün',
  period: 'Dönem',
  createdAt: 'Oluşturulma',
  business: 'İşletme',
  date: 'Tarih',
  movementType: 'Hareket',
  client: 'Cari',
  quantity: 'Miktar',
  unit: 'Birim',
  unitPrice: 'Birim Fiyat',
  subtotal: 'Ara Toplam',
  vatRate: 'KDV',
  vatAmount: 'KDV Tutarı',
  total: 'Toplam',
  description: 'Açıklama',
  totalIn: 'Toplam Giriş',
  totalOut: 'Toplam Çıkış',
  totalAdjustment: 'Toplam Düzeltme',
  netChange: 'Net Değişim',
  periodSummary: 'Dönem Özeti',
  sheetName: 'Ürün/Hareketleri',
  fileName: 'Hareketler',
  shareDialogTitle: 'Excel Olarak Paylaş',
  sharingNotSupported: 'Desteklenmiyor',
  movementTypes: { giris: 'Giriş' },
};

const productListTranslations: UrunListeExcelTranslations = {
  title: 'Ürün/Listesi',
  columns: {
    name: 'Ad',
    code: 'Kod',
    category: 'Kategori',
    unit: 'Birim',
    stock: 'Stok',
    purchasePrice: 'Alış',
    salePrice: 'Satış',
    vatRate: 'KDV',
  },
  fileName: 'Ürün/Listesi:2026',
  isletmeName: 'Demo İşletme',
  businessLabel: 'İşletme',
  createdAt: 'Oluşturulma',
  recordCount: 'Kayıt Sayısı',
  filter: 'Filtre',
  snapshotNote: 'Anlık görüntüdür.',
  generatedByApp: 'Uygulama ile oluşturulmuştur.',
  shareDialogTitle: 'Excel Olarak Paylaş',
  sharingNotSupported: 'Desteklenmiyor',
  noDataError: 'Veri yok',
};

const productPriceChangeTranslations: ProductPriceChangeExcelTranslations = {
  reportTitle: 'Urun Fiyat Degisimleri',
  period: 'Donem',
  createdAt: 'Olusturulma',
  business: 'Isletme',
  productName: 'Urun',
  unit: 'Birim',
  currency: 'Para Birimi',
  referencePrice: 'Referans',
  previousPrice: 'Onceki',
  currentPrice: 'Guncel',
  periodChange: 'Fark',
  periodChangePercent: 'Oran',
  higherPriceQuantity: 'Zamli Miktar',
  lowerPriceQuantity: 'Indirimli Miktar',
  extraCost: 'Ek Maliyet',
  extraCostBase: 'Ana Para Ek Maliyet',
  estimatedSavings: 'Indirim Kazanci',
  estimatedSavingsBase: 'Ana Para Kazanc',
  changeCount: 'Gecis',
  lastChangeDate: 'Son Degisim',
  supplier: 'Tedarikci',
  supplierChanged: 'Tedarikci Degisti',
  brand: 'Marka',
  brandChanged: 'Marka Degisti',
  yes: 'Evet',
  no: 'Hayir',
  total: 'Toplam',
  sheetName: 'Fiyat/Degisimleri',
  fileName: 'Fiyat_Degisimleri',
  shareDialogTitle: 'Paylas',
  sharingNotSupported: 'Desteklenmiyor',
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('oluşturulan Excel dosyalarının hücre sözleşmesi', () => {
  it('ekstrede işlem tarihi, tutarlar ve bakiyeleri gerçek Excel türleriyle yazar', async () => {
    const transaction = {
      id: 'tx-1',
      isletme_id: 'isletme-1',
      type: 'gider',
      amount: 123.45,
      date: '2026-08-02',
      hesap_id: 'hesap-1',
      description: 'Kira',
    } as unknown as IslemWithRelations;

    await exportToExcel({
      entityType: 'hesap',
      entityId: 'hesap-1',
      entityName: 'Kasa:/Döviz?',
      entityCurrency: 'TRY',
      isletmeName: 'Demo İşletme',
      startDate: '2026-08-01',
      endDate: '2026-08-31',
      transactions: [transaction],
      allTransactions: [transaction],
      currentBalance: 876.55,
      translations: statementTranslations,
    });

    const ws = firstSheet(readLastWorkbook());
    expect(ws.A10.t).toBe('d');
    expect(ws.A10.v).toBeInstanceOf(Date);
    expect(ws.G10).toMatchObject({ t: 'n', v: 123.45 });
    expect(ws.J9).toMatchObject({ t: 'n', v: 1000 });
    expect(ws.J12).toMatchObject({ t: 'n', v: 876.55 });

    expect(mockWriteAndShareExcelWorkbook.mock.calls[0][1]).toBe(
      'Kasa:/Döviz?_Ekstre_2026-08-01_2026-08-31.xlsx',
    );
  });

  it('ürün hareketlerinde tarih, miktar, fiyat ve KDV hücrelerini hesaplanabilir bırakır', async () => {
    const movement = {
      id: 'hareket-1',
      isletme_id: 'isletme-1',
      urun_id: 'urun-1',
      hareket_tipi: 'giris',
      miktar: 2,
      birim_fiyat: 50.25,
      kdv_orani: 20,
      created_at: '2026-08-03T12:30:00+03:00',
      aciklama: 'İlk giriş',
    } as unknown as UrunHareket;

    await exportUrunHareketlerToExcel({
      productName: 'Çay',
      productUnit: 'adet',
      productCurrency: 'TRY',
      isletmeName: 'Demo İşletme',
      startDate: '2026-08-01',
      endDate: '2026-08-31',
      hareketler: [movement],
      translations: movementTranslations,
    });

    const ws = firstSheet(readLastWorkbook());
    expect(ws.A9.t).toBe('d');
    expect(ws.D9).toMatchObject({ t: 'n', v: 2 });
    expect(ws.F9).toMatchObject({ t: 'n', v: 50.25 });
    expect(ws.G9).toMatchObject({ t: 'n', v: 100.5 });
    expect(ws.H9).toMatchObject({ t: 'n', v: 0.2 });
    expect(ws.J9).toMatchObject({ t: 'n', v: 120.6 });
  });

  it('ürün listesini filtre bilgisi ve sayısal stok/fiyat/KDV hücreleriyle üretir', async () => {
    await exportUrunListesiToExcel({
      filterText: 'Aktif · Arama: çay',
      urunler: [{
        ad: 'Çay',
        kod: 'CAY-1',
        kategori: 'İçecek',
        birim: 'adet',
        miktar: 12.5,
        alis_fiyati: 50,
        satis_fiyati: 75,
        kdv_orani: 10,
        currency: 'TRY',
      }],
      translations: productListTranslations,
    });

    const workbook = readLastWorkbook();
    const ws = firstSheet(workbook);
    expect(workbook.SheetNames[0]).toBe('Ürün_Listesi');
    expect(ws.B5).toMatchObject({ t: 'n', v: 1 });
    expect(ws.B6.v).toBe('Aktif · Arama: çay');
    expect(ws.E10).toMatchObject({ t: 'n', v: 12.5 });
    expect(ws.F10).toMatchObject({ t: 'n', v: 50 });
    expect(ws.G10).toMatchObject({ t: 'n', v: 75 });
    expect(ws.H10).toMatchObject({ t: 'n', v: 0.1 });
    expect(ws['!autofilter']).toEqual({ ref: 'A9:H10' });
  });

  it('karşılaştırma raporundaki toplamları gerçek para hücreleri olarak yazar', async () => {
    await exportComparisonReportToExcel({
      isletmeName: 'Demo İşletme',
      rangeLabel: 'Son 3 Ay',
      currency: 'TRY',
      rows: [{ label: 'Haziran', income: 1000, expense: 400, net: 600 }],
      totals: { income: 1000, expense: 400, net: 600 },
      averages: { income: 1000, expense: 400, net: 600 },
      translations: {
        reportTitle: 'Karşılaştırma',
        period: 'Dönem',
        createdAt: 'Oluşturulma',
        business: 'İşletme',
        income: 'Gelir',
        expense: 'Gider',
        net: 'Net',
        total: 'Toplam',
        average: 'Ortalama',
        sheetName: 'Karşılaştırma',
        fileName: 'Karşılaştırma',
        shareDialogTitle: 'Paylaş',
        sharingNotSupported: 'Desteklenmiyor',
      },
    });

    const ws = firstSheet(readLastWorkbook());
    expect(ws.B8).toMatchObject({ t: 'n', v: 1000 });
    expect(ws.C8).toMatchObject({ t: 'n', v: 400 });
    expect(ws.D8).toMatchObject({ t: 'n', v: 600 });
    expect(ws.B9).toMatchObject({ t: 'n', v: 1000 });
  });

  it('urun fiyat degisimi raporunda para, yuzde, miktar ve tarihi hesaplanabilir yazar', async () => {
    const item: ProductPriceChangeItem = {
      urunId: '30000000-0000-4000-8000-000000000001',
      urunAdi: 'Un',
      urunBirim: 'kg',
      kategoriId: null,
      kategoriAdi: null,
      priceCurrency: 'USD',
      referencePrice: 100,
      previousPrice: 120,
      currentPrice: 130,
      lastChangeAmount: 10,
      lastChangePercent: 8.3333,
      periodChangeAmount: 30,
      periodChangePercent: 30,
      changeCount: 2,
      hadIncrease: true,
      hadDecrease: false,
      periodQuantity: 60,
      higherPriceQuantity: 50,
      lowerPriceQuantity: 5,
      extraCost: 1300,
      extraCostBase: 52000,
      estimatedSavings: 20,
      estimatedSavingsBase: 800,
      firstPurchaseDate: '2026-07-01T00:00:00.000Z',
      lastPurchaseDate: '2026-07-20T00:00:00.000Z',
      lastChangeDate: '2026-07-20T00:00:00.000Z',
      latestSupplierId: null,
      latestSupplierName: 'ABC Toptan',
      supplierChanged: true,
      latestBrandName: 'Marka A',
      brandChanged: true,
      priceHistory: [],
    };

    await exportProductPriceChangeReportToExcel({
      isletmeName: 'Demo Isletme',
      startDate: '2026-07-01',
      endDate: '2026-07-31',
      periodLabel: 'Temmuz 2026',
      items: [item],
      baseCurrency: 'TRY',
      translations: productPriceChangeTranslations,
    });

    const workbook = readLastWorkbook();
    const ws = firstSheet(workbook);
    expect(workbook.SheetNames[0]).toBe('Fiyat_Degisimleri');
    expect(ws.D9).toMatchObject({ t: 'n', v: 100 });
    expect(ws.F9).toMatchObject({ t: 'n', v: 130 });
    expect(ws.G9).toMatchObject({ t: 'n', v: 30 });
    expect(ws.H9).toMatchObject({ t: 'n', v: 0.3 });
    expect(ws.I9).toMatchObject({ t: 'n', v: 50 });
    expect(ws.J9).toMatchObject({ t: 'n', v: 5 });
    expect(ws.K9).toMatchObject({ t: 'n', v: 1300 });
    expect(ws.L9).toMatchObject({ t: 'n', v: 52000 });
    expect(ws.M9).toMatchObject({ t: 'n', v: 20 });
    expect(ws.N9).toMatchObject({ t: 'n', v: 800 });
    expect(ws.P9.t).toBe('d');
    expect(ws.S9).toMatchObject({ t: 's', v: 'Marka A' });
    expect(ws.T9).toMatchObject({ t: 's', v: 'Evet' });
    expect(ws.L10).toMatchObject({ t: 'n', v: 52000 });
    expect(ws.N10).toMatchObject({ t: 'n', v: 800 });
    expect(ws['!autofilter']).toEqual({ ref: 'A8:T9' });
  });

  it('net varlık trendinde ayı tarih, değer/değişim/kuru sayı olarak yazar', async () => {
    await exportNetWorthTrendToExcel({
      isletmeName: 'Demo İşletme',
      rangeLabel: 'Son 12 Ay',
      lensLabel: 'USD',
      lensDescription: 'Aylık kurla dolar karşılığı.',
      currency: 'USD',
      rows: [{
        month: '2026-07',
        value: 2500,
        change: -100,
        rate: 40.25,
        isCurrent: true,
        empty: false,
        sparse: true,
      }],
      footnote: 'Hesaplama açıklaması.',
      translations: {
        reportTitle: 'Net Varlık Trendi',
        range: 'Dönem',
        lens: 'Görünüm',
        createdAt: 'Oluşturulma',
        business: 'İşletme',
        month: 'Ay',
        value: 'Net Varlık',
        change: 'Değişim',
        rate: 'Kur',
        status: 'Durum',
        current: 'Güncel',
        derived: 'Türetilmiş',
        noRecord: 'Kayıt yok',
        sheetName: 'Net/Varlık',
        fileName: 'Net/Varlık',
        shareDialogTitle: 'Paylaş',
        sharingNotSupported: 'Desteklenmiyor',
      },
    });

    const ws = firstSheet(readLastWorkbook());
    expect(ws.A10.t).toBe('d');
    expect(ws.B10).toMatchObject({ t: 'n', v: 2500 });
    expect(ws.C10).toMatchObject({ t: 'n', v: -100 });
    expect(ws.D10).toMatchObject({ t: 'n', v: 40.25 });
    expect(ws.E10.v).toBe('Güncel · Türetilmiş');
  });
});
