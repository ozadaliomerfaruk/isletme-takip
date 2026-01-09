/**
 * Navigasyon String'leri
 * Tab isimleri, sayfa başlıkları ve menü öğeleri
 */

export const NAVIGATION = {
  // Tab bar
  tabs: {
    home: 'Ana Sayfa',
    clients: 'Cariler',
    personnel: 'Personel',
    more: 'Daha',
  },

  // Sayfa başlıkları
  screens: {
    // Ana sayfalar
    home: 'Ana Sayfa',
    dashboard: 'Özet',

    // İşlem sayfaları
    addIncome: 'Gelir Ekle',
    addExpense: 'Gider Ekle',
    transfer: 'Transfer',
    editTransaction: 'İşlem Düzenle',
    transactionDetails: 'İşlem Detayı',
    allTransactions: 'Tüm İşlemler',

    // Hesap sayfaları
    accounts: 'Hesaplar',
    addAccount: 'Hesap Ekle',
    editAccount: 'Hesap Düzenle',
    accountDetails: 'Hesap Detayı',
    accountTransactions: 'Hesap Hareketleri',

    // Cari sayfaları
    clients: 'Cariler',
    addClient: 'Cari Ekle',
    editClient: 'Cari Düzenle',
    clientDetails: 'Cari Detayı',
    clientTransactions: 'Cari Hareketleri',
    clientPayment: 'Cari Ödeme',
    clientCollection: 'Cari Tahsilat',
    clientPurchase: 'Tedarikçiden Alış',
    clientSale: 'Müşteriye Satış',

    // Personel sayfaları
    personnel: 'Personel',
    addPersonnel: 'Personel Ekle',
    editPersonnel: 'Personel Düzenle',
    personnelDetails: 'Personel Detayı',
    personnelTransactions: 'Personel Hareketleri',
    personnelPayment: 'Personel Ödeme',
    personnelExpense: 'Personel Gideri',

    // Kategori sayfaları
    categories: 'Kategoriler',
    addCategory: 'Kategori Ekle',
    editCategory: 'Kategori Düzenle',

    // Rapor sayfaları
    reports: 'Raporlar',
    cashFlow: 'Nakit Akışı',
    incomeExpenseReport: 'Gelir/Gider Raporu',
    categoryReport: 'Kategori Raporu',
    clientReport: 'Cari Raporu',

    // Ayar sayfaları
    settings: 'Ayarlar',
    profile: 'Profil',
    businessInfo: 'İşletme Bilgileri',
    notifications: 'Bildirimler',
    reminders: 'Hatırlatıcılar',
    security: 'Güvenlik',
    about: 'Hakkında',

    // Yasal sayfalar
    privacyPolicy: 'Gizlilik Politikası',
    termsOfService: 'Kullanım Koşulları',
    kvkk: 'KVKK',

    // Auth sayfaları
    login: 'Giriş Yap',
    register: 'Kayıt Ol',
    forgotPassword: 'Şifremi Unuttum',
    resetPassword: 'Şifre Sıfırla',
    onboarding: 'Hoş Geldiniz',
  },

  // Menü öğeleri
  menu: {
    allTransactions: 'Tüm İşlemler',
    reports: 'Raporlar',
    businessInfo: 'İşletme Bilgileri',
    categories: 'Kategoriler',
    accounts: 'Hesaplar',
    reminders: 'Hatırlatıcılar',
    privacyPolicy: 'Gizlilik Politikası',
    termsOfService: 'Kullanım Koşulları',
    kvkk: 'KVKK',
    logout: 'Çıkış Yap',
    deleteAccount: 'Hesabı Sil',
  },

  // Geri butonu
  back: {
    back: 'Geri',
    goBack: 'Geri Dön',
  },

  // Sekmeler
  tabFilters: {
    all: 'Tümü',
    income: 'Gelir',
    expense: 'Gider',
    transfer: 'Transfer',
    client: 'Cari',
    personnel: 'Personel',
  },
} as const;

export type NavigationStrings = typeof NAVIGATION;
