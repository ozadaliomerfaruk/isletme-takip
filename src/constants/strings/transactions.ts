/**
 * İşlem String'leri
 * Gelir, gider, transfer ve tüm işlem tipleri için string'ler
 *
 * @deprecated Bu dosya i18n geçişi için kullanılmamaktadır.
 * Çeviriler için src/i18n/locales/{lang}/transactions.json dosyalarını kullanın.
 */

import { IslemType, HesapType, CariType } from '@/types/database';

export const TRANSACTIONS = {
  // İşlem tipi etiketleri
  types: {
    gelir: 'Gelir',
    gider: 'Gider',
    transfer: 'Transfer',
    cari_alis: 'Tedarikçiden Alış',
    cari_satis: 'Müşteriye Satış',
    cari_odeme: 'Tedarikçiye Ödeme',
    cari_tahsilat: 'Müşteriden Tahsilat',
    cari_alis_iade: 'Alış İade',
    cari_satis_iade: 'Satış İade',
    personel_gider: 'Personel Gideri',
    personel_odeme: 'Personel Ödemesi',
    personel_tahsilat: 'Personelden Tahsilat',
    kredi_karti_harcama: 'Kredi Kartı Harcaması',
  } as Record<IslemType, string>,

  // Hesap tipleri
  accountTypes: {
    nakit: 'Nakit',
    banka: 'Banka Hesabı',
    kredi_karti: 'Kredi Kartı',
    diger: 'Diğer',
  } as Record<HesapType, string>,

  // Cari tipleri
  clientTypes: {
    tedarikci: 'Tedarikçi',
    musteri: 'Müşteri',
  } as Record<CariType, string>,

  // Form etiketleri
  form: {
    amount: 'Tutar',
    amountPlaceholder: 'Tutar girin',
    date: 'Tarih',
    dateTime: 'Tarih ve Saat',
    transactionDate: 'İşlem Tarihi',
    category: 'Kategori',
    categoryPlaceholder: 'Kategori seç',
    account: 'Hesap',
    accountPlaceholder: 'Hesap seç',
    sourceAccount: 'Kaynak Hesap',
    targetAccount: 'Hedef Hesap',
    description: 'Açıklama',
    descriptionPlaceholder: 'Açıklama ekle (isteğe bağlı)',
    note: 'Not',
    notePlaceholder: 'Not ekle...',
    client: 'Cari',
    clientPlaceholder: 'Cari seç',
    personnel: 'Personel',
    personnelPlaceholder: 'Personel seç',
    recurring: 'Tekrarlayan',
    futureDate: 'İleri Tarihli',
    schedule: 'Planla',
  },

  // Başlıklar
  titles: {
    addIncome: 'Gelir Ekle',
    addExpense: 'Gider Ekle',
    addTransfer: 'Transfer Yap',
    transferBetweenAccounts: 'Hesaplar Arası Transfer',
    doTransfer: 'Transfer Yap',
    editTransaction: 'İşlem Düzenle',
    transactionDetails: 'İşlem Detayı',
    allTransactions: 'Tüm İşlemler',
    recentTransactions: 'Son İşlemler',

    // Cari işlemler
    clientPayment: 'Cari Ödeme',
    clientCollection: 'Cari Tahsilat',
    clientPurchase: 'Tedarikçiden Alış',
    clientSale: 'Müşteriye Satış',
    clientReturn: 'İade',

    // Personel işlemler
    personnelExpense: 'Personel Gideri',
    personnelPayment: 'Personel Ödemesi',
    personnelCollection: 'Personelden Tahsilat',
  },

  // Mesajlar
  messages: {
    createSuccess: 'İşlem kaydedildi',
    updateSuccess: 'İşlem güncellendi',
    deleteSuccess: 'İşlem silindi',
    deleteConfirm: 'Bu işlemi silmek istediğinize emin misiniz?',
    noTransactions: 'Henüz işlem yok',
    noTransactionsInPeriod: 'Bu dönemde işlem bulunamadı',
    saveSuccess: 'İşleminiz başarıyla kaydedildi',
    saveFailed: 'İşlem gerçekleştirilemedi',
    deleteFailed: 'İşlem silinemedi',
    scheduledCreated: 'İleri tarihli işlem oluşturuldu',
    incomeAdded: 'Gelir eklendi',
    expenseAdded: 'Gider eklendi',
    transferCompleted: 'Transfer tamamlandı',
  },

  // Bildirimler
  notifications: {
    reminderTitle: 'Yaklaşan İşlem Hatırlatması',
    scheduledReminder: 'Planlı işlem hatırlatması',
  },

  // Filtreler
  filters: {
    all: 'Tümü',
    income: 'Gelir',
    expense: 'Gider',
    transfer: 'Transfer',
    client: 'Cari',
    personnel: 'Personel',
    byDate: 'Tarihe Göre',
    byAmount: 'Tutara Göre',
    byCategory: 'Kategoriye Göre',
  },

  // Özet
  summary: {
    totalIncome: 'Toplam Gelir',
    totalExpense: 'Toplam Gider',
    netProfit: 'Net Kar',
    netLoss: 'Net Zarar',
    balance: 'Bakiye',
    transactionCount: 'İşlem Sayısı',
  },

  // İleri tarihli işlemler
  future: {
    title: 'İleri Tarihli İşlemler',
    scheduled: 'Planlanmış',
    pending: 'Bekleyen',
    dueDate: 'Vade Tarihi',
    daysRemaining: (days: number) => `${days} gün kaldı`,
    overdue: 'Vadesi Geçmiş',
    process: 'İşle',
    cancel: 'İptal Et',
  },

  // Planlı (ileri tarihli) işlemler - UI için
  scheduled: {
    title: 'İleri Tarihli İşlemler',
    overdue: 'Gecikmiş',
    dueToday: 'Bugün',
    execute: 'Gerçekleştir',
    executed: 'Gerçekleşti',
    delete: 'İşlemi Sil',
    deleteConfirm: 'Bu ileri tarihli işlemi silmek istediğinize emin misiniz?',
    executeConfirm: (amount: string, type: string) => `${amount} tutarındaki ${type} işlemi gerçekleştirmek istiyor musunuz?`,
    comingSoon: 'Bu özellik yakında eklenecek',
  },
} as const;

// Helper fonksiyonlar
export function getIslemTypeLabel(type: IslemType): string {
  return TRANSACTIONS.types[type] || type;
}

export function getHesapTypeLabel(type: HesapType): string {
  return TRANSACTIONS.accountTypes[type] || type;
}

export function getCariTypeLabel(type: CariType): string {
  return TRANSACTIONS.clientTypes[type] || type;
}

export type TransactionStrings = typeof TRANSACTIONS;
