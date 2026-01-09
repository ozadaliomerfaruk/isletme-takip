/**
 * Genel UI String'leri
 * Tüm uygulama genelinde kullanılan ortak string'ler
 */

export const COMMON = {
  // Butonlar
  buttons: {
    save: 'Kaydet',
    cancel: 'İptal',
    delete: 'Sil',
    edit: 'Düzenle',
    add: 'Ekle',
    close: 'Kapat',
    back: 'Geri',
    next: 'İleri',
    done: 'Tamam',
    yes: 'Evet',
    no: 'Hayır',
    confirm: 'Onayla',
    ok: 'Tamam',
    create: 'Oluştur',
    update: 'Güncelle',
    send: 'Gönder',
    apply: 'Uygula',
    clear: 'Temizle',
    reset: 'Sıfırla',
    refresh: 'Yenile',
    retry: 'Tekrar Dene',
    continue: 'Devam',
    skip: 'Atla',
    finish: 'Bitir',
    select: 'Seç',
    selectAll: 'Tümünü Seç',
    deselectAll: 'Seçimi Kaldır',
    viewAll: 'Tümünü Gör',
    seeMore: 'Daha Fazla',
    showMore: 'Daha Fazla Göster',
    showLess: 'Daha Az Göster',
  },

  // Durum mesajları
  status: {
    loading: 'Yükleniyor...',
    saving: 'Kaydediliyor...',
    deleting: 'Siliniyor...',
    updating: 'Güncelleniyor...',
    processing: 'İşleniyor...',
    success: 'Başarılı',
    error: 'Hata',
    warning: 'Uyarı',
    info: 'Bilgi',
  },

  // Boş durum mesajları
  empty: {
    noData: 'Veri bulunamadı',
    noResults: 'Sonuç bulunamadı',
    noItems: 'Henüz kayıt yok',
    noTransactions: 'Henüz işlem yok',
  },

  // Arama
  search: {
    search: 'Ara',
    searchPlaceholder: 'Ara...',
    noResults: 'Sonuç bulunamadı',
    clearSearch: 'Aramayı Temizle',
  },

  // Seçim
  select: {
    selectCategory: 'Kategori seç',
    selectAccount: 'Hesap seç',
    selectDate: 'Tarih seç',
    selectPerson: 'Kişi seç',
    selectType: 'Tip seç',
    selectAll: 'Tümünü Seç',
    noneSelected: 'Seçilmedi',
  },

  // Onay dialogları
  confirm: {
    deleteTitle: 'Silme Onayı',
    deleteMessage: (item: string) => `"${item}" silinecek. Bu işlem geri alınamaz.`,
    deleteGeneric: 'Bu öğeyi silmek istediğinize emin misiniz?',
    unsavedChanges: 'Kaydedilmemiş değişiklikler var. Çıkmak istediğinize emin misiniz?',
    logout: 'Çıkış yapmak istediğinize emin misiniz?',
  },

  // Tarih/Zaman
  date: {
    today: 'Bugün',
    yesterday: 'Dün',
    tomorrow: 'Yarın',
    thisWeek: 'Bu Hafta',
    thisMonth: 'Bu Ay',
    thisYear: 'Bu Yıl',
    lastWeek: 'Geçen Hafta',
    lastMonth: 'Geçen Ay',
    lastYear: 'Geçen Yıl',
    startDate: 'Başlangıç Tarihi',
    endDate: 'Bitiş Tarihi',
    dateRange: 'Tarih Aralığı',
    date: 'Tarih',
    time: 'Saat',
    selectDate: 'Tarih Seç',
    selectTime: 'Saat Seç',
    months: [
      'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
      'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
    ] as const,
  },

  // Para
  currency: {
    amount: 'Tutar',
    balance: 'Bakiye',
    total: 'Toplam',
    subtotal: 'Ara Toplam',
    tax: 'Vergi',
    discount: 'İndirim',
    price: 'Fiyat',
    cost: 'Maliyet',
    profit: 'Kar',
    loss: 'Zarar',
  },

  // Genel etiketler
  labels: {
    name: 'Ad',
    title: 'Başlık',
    description: 'Açıklama',
    note: 'Not',
    notes: 'Notlar',
    type: 'Tip',
    category: 'Kategori',
    date: 'Tarih',
    time: 'Saat',
    status: 'Durum',
    details: 'Detaylar',
    summary: 'Özet',
    all: 'Tümü',
    none: 'Hiçbiri',
    other: 'Diğer',
    optional: 'İsteğe Bağlı',
    required: 'Zorunlu',
    phone: 'Telefon',
    email: 'E-posta',
    address: 'Adres',
    select: 'Seç',
  },

  // Form placeholder'ları
  placeholders: {
    enterName: 'Ad girin',
    enterAmount: 'Tutar girin',
    enterDescription: 'Açıklama girin',
    enterNote: 'Not ekle...',
    enterPhone: 'Telefon girin',
    enterEmail: 'E-posta girin',
    enterAddress: 'Adres girin',
  },

  // Sıralama
  sort: {
    sortBy: 'Sırala',
    newest: 'En Yeni',
    oldest: 'En Eski',
    highest: 'En Yüksek',
    lowest: 'En Düşük',
    nameAZ: 'A-Z',
    nameZA: 'Z-A',
  },

  // Filtre
  filter: {
    filter: 'Filtrele',
    filterBy: 'Filtrele',
    clearFilters: 'Filtreleri Temizle',
    noFilters: 'Filtre yok',
  },

  // Dönem
  period: {
    daily: 'Günlük',
    weekly: 'Haftalık',
    monthly: 'Aylık',
    yearly: 'Yıllık',
    custom: 'Özel',
    allTime: 'Tüm Zamanlar',
  },
} as const;

export type CommonStrings = typeof COMMON;
