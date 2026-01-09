/**
 * Authentication String'leri
 * Giriş, kayıt ve şifre işlemleri için string'ler
 */

export const AUTH = {
  // Giriş sayfası
  login: {
    title: 'Giriş Yap',
    subtitle: 'Hesabınıza giriş yapın',
    email: 'E-posta',
    emailPlaceholder: 'E-posta adresinizi girin',
    password: 'Şifre',
    passwordPlaceholder: 'Şifrenizi girin',
    loginButton: 'Giriş Yap',
    forgotPassword: 'Şifremi Unuttum',
    noAccount: 'Hesabınız yok mu?',
    register: 'Kayıt Ol',
    orContinueWith: 'veya şununla devam et',
    rememberMe: 'Beni Hatırla',
  },

  // Kayıt sayfası
  register: {
    title: 'Kayıt Ol',
    subtitle: 'Yeni hesap oluşturun',
    fullName: 'Ad Soyad',
    fullNamePlaceholder: 'Adınızı ve soyadınızı girin',
    businessName: 'İşletme Adı',
    businessNamePlaceholder: 'İşletme adını girin',
    email: 'E-posta',
    emailPlaceholder: 'E-posta adresinizi girin',
    password: 'Şifre',
    passwordPlaceholder: 'Şifre oluşturun',
    confirmPassword: 'Şifre Tekrar',
    confirmPasswordPlaceholder: 'Şifrenizi tekrar girin',
    registerButton: 'Kayıt Ol',
    hasAccount: 'Zaten hesabınız var mı?',
    login: 'Giriş Yap',
    agreeToTerms: 'Kayıt olarak',
    termsOfService: 'Kullanım Koşulları',
    and: 've',
    privacyPolicy: 'Gizlilik Politikası',
    acceptTerms: "'nı kabul ediyorum",
  },

  // Şifremi unuttum
  forgotPassword: {
    title: 'Şifremi Unuttum',
    subtitle: 'E-posta adresinizi girin, size şifre sıfırlama bağlantısı gönderelim',
    email: 'E-posta',
    emailPlaceholder: 'E-posta adresinizi girin',
    sendButton: 'Sıfırlama Bağlantısı Gönder',
    backToLogin: 'Giriş sayfasına dön',
    emailSent: 'Şifre sıfırlama bağlantısı e-posta adresinize gönderildi',
    checkEmail: 'E-posta kutunuzu kontrol edin',
  },

  // Şifre sıfırlama
  resetPassword: {
    title: 'Şifre Sıfırla',
    subtitle: 'Yeni şifrenizi belirleyin',
    newPassword: 'Yeni Şifre',
    newPasswordPlaceholder: 'Yeni şifrenizi girin',
    confirmPassword: 'Şifre Tekrar',
    confirmPasswordPlaceholder: 'Yeni şifrenizi tekrar girin',
    resetButton: 'Şifreyi Sıfırla',
    success: 'Şifreniz başarıyla değiştirildi',
  },

  // Çıkış
  logout: {
    title: 'Çıkış Yap',
    message: 'Çıkış yapmak istediğinize emin misiniz?',
    confirm: 'Çıkış Yap',
    cancel: 'İptal',
    success: 'Başarıyla çıkış yapıldı',
  },

  // Hesap silme
  deleteAccount: {
    title: 'Hesabı Sil',
    subtitle: 'Hesabınızı silmek istediğinize emin misiniz?',
    warning: 'Bu işlem geri alınamaz. Tüm verileriniz kalıcı olarak silinecektir.',
    confirmText: 'Silmek için "SİL" yazın',
    deleteButton: 'Hesabı Sil',
    cancel: 'İptal',
    scheduled: 'Hesabınız 7 gün içinde silinecek',
    cancelDeletion: 'Silme talebini iptal et',
  },

  // Onboarding
  onboarding: {
    welcome: 'Hoş Geldiniz',
    slide1Title: 'Gelir ve Giderlerinizi Takip Edin',
    slide1Description: 'İşletmenizin tüm finansal hareketlerini kolayca kaydedin ve takip edin.',
    slide2Title: 'Carilerinizi Yönetin',
    slide2Description: 'Müşteri ve tedarikçi bilgilerinizi, alacak ve borçlarınızı bir arada tutun.',
    slide3Title: 'Detaylı Raporlar Alın',
    slide3Description: 'Anlık ve dönemsel raporlarla işletmenizin finansal durumunu görün.',
    getStarted: 'Başlayın',
    skip: 'Atla',
    next: 'İleri',
    prev: 'Geri',
  },

  // Mesajlar
  messages: {
    welcomeBack: 'Tekrar hoş geldiniz',
    accountCreated: 'Hesabınız başarıyla oluşturuldu',
    loginSuccess: 'Giriş başarılı',
    logoutSuccess: 'Çıkış yapıldı',
  },
} as const;

export type AuthStrings = typeof AUTH;
