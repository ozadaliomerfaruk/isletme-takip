/**
 * Hesap String'leri
 * Hesap yönetimi için string'ler
 */

export const ACCOUNTS = {
  // Başlıklar
  titles: {
    accounts: 'Hesaplar',
    addAccount: 'Hesap Ekle',
    editAccount: 'Hesap Düzenle',
    accountDetails: 'Hesap Detayı',
    accountTransactions: 'Hesap Hareketleri',
    totalBalance: 'Toplam Bakiye',
  },

  // Hesap tipleri (display)
  // 'diger' ve 'birikim' aynı şeyi gösteriyor - backward compatibility
  types: {
    nakit: 'Nakit',
    banka: 'Banka Hesabı',
    kredi_karti: 'Kredi Kartı',
    birikim: 'Birikim',
    diger: 'Birikim', // eski değer, Birikim olarak göster
  },

  // Hesap tipi açıklamaları
  typeDescriptions: {
    nakit: 'Elde tutulan nakit para',
    banka: 'Banka hesabındaki para',
    kredi_karti: 'Kredi kartı borç takibi',
    birikim: 'Birikim ve yatırım hesapları (altın, döviz vb.)',
    diger: 'Birikim ve yatırım hesapları (altın, döviz vb.)', // eski değer
  },

  // Hesap tipi etiketleri (kısa - seçim kartları için)
  typeLabels: {
    nakit: 'Nakit',
    banka: 'Banka',
    kredi_karti: 'Kredi Kartı',
    birikim: 'Birikim',
    diger: 'Birikim', // eski değer
  },

  // Form etiketleri
  form: {
    name: 'Hesap Adı',
    namePlaceholder: 'Örn: Nakit Kasa, Ziraat Bankası',
    type: 'Hesap Tipi',
    typePlaceholder: 'Hesap tipi seçin',
    balance: 'Başlangıç Bakiyesi',
    balancePlaceholder: 'Başlangıç bakiyesi girin',
    openingBalanceOptional: 'Açılış Bakiyesi (Opsiyonel)',
    description: 'Açıklama',
    descriptionOptional: 'Açıklama (Opsiyonel)',
    descriptionPlaceholder: 'Hesap hakkında not...',
    color: 'Renk',
    icon: 'İkon',
  },

  // Bakiye durumları
  balance: {
    balance: 'Bakiye',
    currentBalance: 'Mevcut Bakiye',
    availableBalance: 'Kullanılabilir Bakiye',
    positiveBalance: 'Alacak',
    negativeBalance: 'Borç',
    creditLimit: 'Kredi Limiti',
    usedCredit: 'Kullanılan Kredi',
    remainingCredit: 'Kalan Limit',
  },

  // İşlemler
  actions: {
    deposit: 'Para Yatır',
    withdraw: 'Para Çek',
    transfer: 'Transfer Yap',
    viewTransactions: 'Hareketleri Gör',
    editAccount: 'Hesabı Düzenle',
    deleteAccount: 'Hesabı Sil',
  },

  // Mesajlar
  messages: {
    createSuccess: 'Hesap oluşturuldu',
    updateSuccess: 'Hesap güncellendi',
    deleteSuccess: 'Hesap silindi',
    deleteConfirm: 'Bu hesabı silmek istediğinize emin misiniz?',
    deleteWarning: 'Bu hesaba ait tüm işlemler de silinecektir.',
    noAccounts: 'Henüz hesap yok',
    addFirstAccount: 'İlk hesabınızı ekleyerek başlayın',
  },

  // Kredi kartı
  creditCard: {
    statement: 'Ekstre',
    dueDate: 'Son Ödeme Tarihi',
    minimumPayment: 'Minimum Ödeme',
    fullPayment: 'Tam Ödeme',
    paymentToCard: 'Kart Ödemesi',
    currentDebt: 'Mevcut Borç',
  },

  // Özet
  summary: {
    totalAssets: 'Toplam Varlıklar',
    totalLiabilities: 'Toplam Borçlar',
    netWorth: 'Net Değer',
    accountCount: (count: number) => `${count} Hesap`,
  },

  // Detay sayfası
  details: {
    hareketler: 'Hareketler',
    initialBalance: 'Başlangıç Bakiyesi',
    accountOpening: 'Hesap açılışı',
    notFoundDescription: 'Bu hesap mevcut değil veya silinmiş olabilir.',
    time: 'Saat:',
  },

  // İşlem etiketleri (hesap detayında kullanılan)
  transactionLabels: {
    gelir: 'Gelir',
    gider: 'Gider',
    transfer: 'Transfer',
    cari_odeme: 'Cari Ödeme',
    cari_tahsilat: 'Cari Tahsilat',
    personel_odeme: 'Personel Ödeme',
    personel_gider: 'Personel Gider',
  },

  // Silme onayları
  deleteConfirm: {
    transactionTitle: 'İşlemi Sil',
    transactionMessage: 'Bu işlemi silmek istediğinizden emin misiniz?',
    accountTitle: 'Hesabı Sil',
    accountMessage: 'Bu hesabı silmek istediğinizden emin misiniz?\n\nDikkat: Bu hesaba ait tüm gelir, gider ve transfer işlemleri de silinecektir. Bu işlem geri alınamaz.',
  },

  // Doğrulama
  validation: {
    nameRequired: 'Hesap adı gerekli',
  },
} as const;

export type AccountStrings = typeof ACCOUNTS;
