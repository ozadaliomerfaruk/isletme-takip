/**
 * Rapor String'leri
 * Raporlar ve analizler için string'ler
 */

export const REPORTS = {
  // Başlıklar
  titles: {
    reports: 'Raporlar',
    overview: 'Genel Bakış',
    incomeExpense: 'Gelir/Gider',
    cashFlow: 'Nakit Akışı',
    categoryAnalysis: 'Kategori Analizi',
    clientReport: 'Cari Raporu',
    expenseAnalysis: 'Gider Analizi',
    incomeAnalysis: 'Gelir Analizi',
    categoryDetail: 'Kategori Detayı',
    uncategorized: 'Kategorisiz',
  },

  // Tab seçenekleri
  tabs: {
    general: 'Genel',
    expenseAnalysis: 'Gider Analizi',
    incomeAnalysis: 'Gelir Analizi',
  },

  // Özet kartlar
  summary: {
    generalStatus: 'Genel Durum',
    netValue: 'Net Değer',
    netAssets: 'Net Varlık',
    assets: 'Varlıklar',
    liabilities: 'Yükümlülükler',
    receivables: 'Alacaklar',
    payables: 'Borçlar',
    netStatus: 'Net Durum',
    netProfit: 'Net Kar/Zarar',
    income: 'Gelir',
    expense: 'Gider',
    netCashFlow: 'Net Nakit Akışı',
    cashInflow: 'Nakit Giriş',
    cashOutflow: 'Nakit Çıkış',
    netBalance: 'Net Bakiye',
    totalIncome: 'Toplam Gelir',
    totalExpense: 'Toplam Gider',
    totalAmount: 'Toplam Tutar',
    transactionCount: 'İşlem Sayısı',
    totalPersonnelDebt: 'Toplam personel borcu',
  },

  // Bölüm başlıkları
  sections: {
    accountBalances: 'HESAP BAKIYELERI',
    clientStatus: 'CARİ DURUM',
    personnelStatus: 'PERSONEL DURUM',
    categoryDistribution: 'KATEGORİ DAĞILIMI',
    categoryFilter: 'KATEGORİ FİLTRESİ',
    selectedTransactions: 'SEÇİLEN İŞLEMLER',
    transactions: 'İŞLEMLER',
  },

  // Sayıcı metinler
  counts: {
    account: (count: number) => `${count} Hesap`,
    client: (count: number) => `${count} Cari`,
    personnel: (count: number) => `${count} Personel`,
    transaction: (count: number) => `${count} işlem`,
  },

  // Dönem seçici
  period: {
    daily: 'Günlük',
    weekly: 'Haftalık',
    monthly: 'Aylık',
    yearly: 'Yıllık',
    custom: 'Özel',
    instant: 'Anlık',
    total: 'Toplam',
    selectPeriod: 'Dönem Seçin',
    startDate: 'Başlangıç',
    endDate: 'Bitiş',
    startDateTitle: 'Başlangıç Tarihi',
    endDateTitle: 'Bitiş Tarihi',
  },

  // Ay isimleri
  months: [
    'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
    'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
  ],

  // Kategori detay
  categoryDetail: {
    direct: '(doğrudan)',
    selectAll: 'Tümünü Seç',
    selectNone: 'Hiçbirini Seçme',
  },

  // Nakit akışı
  cashFlow: {
    title: 'Nakit Akışı',
    inflow: 'Giriş',
    outflow: 'Çıkış',
    netFlow: 'Net Akış',
    inflowDistribution: 'Nakit Giriş Dağılımı',
    outflowDistribution: 'Nakit Çıkış Dağılımı',
    categoryCount: (count: number) => `${count} Kategori`,
    noInflow: 'Bu dönemde nakit girişi bulunamadı',
    noOutflow: 'Bu dönemde nakit çıkışı bulunamadı',
  },

  // Kategori raporu
  category: {
    title: 'Kategori Bazlı',
    topCategories: 'En Çok Harcanan',
    categoryDistribution: 'Kategori Dağılımı',
    percentage: 'Yüzde',
    amount: 'Tutar',
    transactionCount: 'İşlem Sayısı',
    average: 'Ortalama',
    uncategorized: 'Kategorisiz',
    other: 'Diğer',
  },

  // Cari raporu
  client: {
    title: 'Cari Raporu',
    topCustomers: 'En Çok Satan',
    topSuppliers: 'En Çok Alınan',
    receivablesReport: 'Alacak Raporu',
    payablesReport: 'Borç Raporu',
  },

  // Grafik
  chart: {
    barChart: 'Çubuk Grafik',
    pieChart: 'Pasta Grafik',
    lineChart: 'Çizgi Grafik',
    trend: 'Trend',
    comparison: 'Karşılaştırma',
  },

  // Filtreler
  filters: {
    all: 'Tümü',
    income: 'Gelir',
    expense: 'Gider',
    byCategory: 'Kategoriye Göre',
    byAccount: 'Hesaba Göre',
    byClient: 'Cariye Göre',
  },

  // Dışa aktarma
  export: {
    export: 'Dışa Aktar',
    exportPDF: 'PDF Olarak İndir',
    exportExcel: 'Excel Olarak İndir',
    share: 'Paylaş',
    print: 'Yazdır',
  },

  // Boş durumlar
  empty: {
    noData: 'Bu dönemde veri bulunamadı',
    noTransactions: 'Bu dönemde işlem yok',
    noExpenseTransactions: 'Bu dönemde gider işlemi bulunmuyor',
    noIncomeTransactions: 'Bu dönemde gelir işlemi bulunmuyor',
    noCategoryTransactions: 'Bu kategoride işlem bulunmuyor',
    noUncategorizedTransactions: 'Kategorisiz işlem bulunmuyor',
    noSelectedCategoryTransactions: 'Seçili kategorilerde işlem bulunmuyor',
    selectCategories: 'Lütfen görmek istediğiniz kategorileri seçin',
    selectPeriod: 'Dönem seçerek başlayın',
    dataLoadError: 'Veriler yüklenirken bir hata oluştu',
  },

  // Karşılaştırma
  comparison: {
    vsLastPeriod: 'Önceki döneme göre',
    vsLastMonth: 'Geçen aya göre',
    vsLastYear: 'Geçen yıla göre',
    increase: 'Artış',
    decrease: 'Azalış',
    noChange: 'Değişim yok',
  },
} as const;

export type ReportStrings = typeof REPORTS;
