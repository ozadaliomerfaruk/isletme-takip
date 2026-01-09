/**
 * Kategori String'leri
 * Kategori yönetimi için string'ler
 */

export const CATEGORIES = {
  // Başlıklar
  titles: {
    categories: 'Kategoriler',
    addCategory: 'Kategori Ekle',
    editCategory: 'Kategori Düzenle',
  },

  // Kategori tipleri
  types: {
    gelir: 'Gelir',
    gider: 'Gider',
  },

  // Kategori tipi açıklamaları
  typeLabels: {
    incomeCategory: 'Gelir Kategorisi',
    expenseCategory: 'Gider Kategorisi',
    subCategory: 'Alt Kategori',
  },

  // Form etiketleri
  form: {
    categoryType: 'Kategori Tipi',
    categoryName: 'Kategori Adı',
    categoryNamePlaceholder: 'Örn: Yemek, Ulaşım, Kira...',
    iconAndParent: 'İkon ve Üst Kategori',
    color: 'Renk',
    exampleCategories: 'Örnek Kategoriler',
  },

  // Örnek kategoriler
  examples: {
    income: ['Satış', 'Hizmet', 'Faiz', 'Kira Geliri', 'Diğer Gelir'],
    expense: ['Kira', 'Maaş', 'Fatura', 'Malzeme', 'Ulaşım', 'Yemek', 'Reklam', 'Diğer Gider'],
  },

  // Mesajlar
  messages: {
    createSuccess: 'Kategori eklendi',
    updateSuccess: 'Kategori güncellendi',
    deleteSuccess: 'Kategori silindi',
    noIncomeCategory: 'Gelir kategorisi yok',
    noExpenseCategory: 'Gider kategorisi yok',
    addFirst: 'Yeni kategori ekleyerek başlayın',
    infoText: 'Kategoriler, gelir ve gider işlemlerinizi gruplamak için kullanılır.',
  },

  // Silme onayları
  deleteConfirm: {
    title: 'Kategoriyi Sil',
    messageWithChildren: (name: string) => `"${name}" kategorisi ve tüm alt kategorileri silinecek. Devam etmek istiyor musunuz?`,
    messageSimple: (name: string) => `"${name}" kategorisini silmek istediğinizden emin misiniz?`,
  },

  // Doğrulama
  validation: {
    nameRequired: 'Kategori adı gerekli',
  },
} as const;

export type CategoryStrings = typeof CATEGORIES;
