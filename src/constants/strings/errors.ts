/**
 * Hata Mesajları
 * Tüm uygulama genelinde kullanılan hata mesajları
 */

export const ERRORS = {
  // Genel hatalar
  general: {
    generic: 'Bir hata oluştu',
    unknown: 'Bilinmeyen bir hata oluştu',
    tryAgain: 'Lütfen tekrar deneyin',
    somethingWentWrong: 'Bir şeyler yanlış gitti',
    operationFailed: 'İşlem başarısız oldu',
  },

  // Ağ hataları
  network: {
    noConnection: 'İnternet bağlantısı yok',
    connectionError: 'Bağlantı hatası',
    timeout: 'İşlem zaman aşımına uğradı',
    serverError: 'Sunucu hatası',
    serviceUnavailable: 'Servis kullanılamıyor',
  },

  // Auth hataları
  auth: {
    invalidEmail: 'Geçerli bir e-posta adresi girin',
    invalidPassword: 'Şifre en az 6 karakter olmalı',
    passwordMismatch: 'Şifreler eşleşmiyor',
    emailInUse: 'Bu e-posta adresi zaten kayıtlı',
    invalidCredentials: 'E-posta veya şifre hatalı',
    accountNotFound: 'Hesap bulunamadı',
    accountDisabled: 'Hesap devre dışı bırakılmış',
    sessionExpired: 'Oturum süresi doldu',
    loginRequired: 'Lütfen giriş yapın',
    unauthorized: 'Bu işlem için yetkiniz yok',
    weakPassword: 'Şifre çok zayıf',
    tooManyRequests: 'Çok fazla deneme yaptınız. Lütfen biraz bekleyin.',
  },

  // Form doğrulama hataları
  validation: {
    required: 'Bu alan zorunludur',
    requiredField: (field: string) => `${field} zorunludur`,
    minLength: (min: number) => `En az ${min} karakter olmalı`,
    maxLength: (max: number) => `En fazla ${max} karakter olabilir`,
    minValue: (min: number) => `En az ${min} olmalı`,
    maxValue: (max: number) => `En fazla ${max} olabilir`,
    invalidFormat: 'Geçersiz format',
    invalidEmail: 'Geçerli bir e-posta adresi girin',
    invalidPhone: 'Geçerli bir telefon numarası girin',
    invalidNumber: 'Geçerli bir sayı girin',
    invalidDate: 'Geçerli bir tarih girin',
    invalidAmount: 'Geçerli bir tutar girin',
    positiveNumber: 'Pozitif bir sayı girin',
    mustBeGreaterThan: (value: number) => `${value} değerinden büyük olmalı`,
    mustBeLessThan: (value: number) => `${value} değerinden küçük olmalı`,
  },

  // İşlem hataları
  transaction: {
    createFailed: 'İşlem oluşturulamadı',
    updateFailed: 'İşlem güncellenemedi',
    deleteFailed: 'İşlem silinemedi',
    notFound: 'İşlem bulunamadı',
    insufficientBalance: 'Yetersiz bakiye',
    invalidAmount: 'Geçersiz tutar',
    invalidDate: 'Geçersiz tarih',
    futureDate: 'İleri tarihli işlemler bu alandan eklenemez',
    futureDateRequired: 'İleri tarihli işlem için bugünden sonraki bir tarih seçin',
    addFailed: 'İşlem eklenemedi',
  },

  // Hesap hataları
  account: {
    createFailed: 'Hesap oluşturulamadı',
    updateFailed: 'Hesap güncellenemedi',
    deleteFailed: 'Hesap silinemedi',
    notFound: 'Hesap bulunamadı',
    hasTransactions: 'Bu hesaba ait işlemler var. Önce işlemleri silin.',
    duplicateName: 'Bu isimde bir hesap zaten var',
    selectAccount: 'Hesap seçin',
    selectSourceAccount: 'Kaynak hesap seçin',
    selectTargetAccount: 'Hedef hesap seçin',
    sameAccountError: 'Kaynak ve hedef hesap aynı olamaz',
    transferFailed: 'Transfer yapılamadı',
    nameRequired: 'Hesap adı gerekli',
  },

  // Cari hataları
  cari: {
    createFailed: 'Cari oluşturulamadı',
    updateFailed: 'Cari güncellenemedi',
    deleteFailed: 'Cari silinemedi',
    notFound: 'Cari bulunamadı',
    nameRequired: 'Cari adı gerekli',
    hasTransactions: 'Bu cariye ait işlemler var. Önce işlemleri silin.',
    duplicateName: 'Bu isimde bir cari zaten var',
    selectSupplier: 'Tedarikçi seçin',
    selectCustomer: 'Müşteri seçin',
    selectPaymentAccount: 'Ödeme yapılacak hesabı seçin',
    selectCollectionAccount: 'Tahsilat yapılacak hesabı seçin',
  },

  // Personel hataları
  personel: {
    createFailed: 'Personel oluşturulamadı',
    updateFailed: 'Personel güncellenemedi',
    deleteFailed: 'Personel silinemedi',
    notFound: 'Personel bulunamadı',
    firstNameRequired: 'Ad gerekli',
    hasTransactions: 'Bu personele ait işlemler var. Önce işlemleri silin.',
    selectPersonel: 'Personel seçin',
    selectPaymentAccount: 'Ödeme yapılacak hesabı seçin',
  },

  // Kategori hataları
  category: {
    createFailed: 'Kategori oluşturulamadı',
    updateFailed: 'Kategori güncellenemedi',
    deleteFailed: 'Kategori silinemedi',
    notFound: 'Kategori bulunamadı',
    hasTransactions: 'Bu kategoriye ait işlemler var.',
    duplicateName: 'Bu isimde bir kategori zaten var',
  },

  // Dosya hataları
  file: {
    uploadFailed: 'Dosya yüklenemedi',
    downloadFailed: 'Dosya indirilemedi',
    invalidFormat: 'Geçersiz dosya formatı',
    fileTooLarge: 'Dosya çok büyük',
    noFile: 'Dosya seçilmedi',
  },

  // İzin hataları
  permission: {
    denied: 'İzin reddedildi',
    cameraRequired: 'Kamera izni gerekli',
    storageRequired: 'Depolama izni gerekli',
    notificationRequired: 'Bildirim izni gerekli',
  },
} as const;

export type ErrorStrings = typeof ERRORS;
