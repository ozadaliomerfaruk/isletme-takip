/**
 * Merkezi Query Key ve Invalidation Yönetimi
 *
 * Bu dosya React Query cache key'lerinin tek kaynağıdır.
 * Yeni query eklendiğinde veya invalidation gerektiğinde sadece burası güncellenmelidir.
 *
 * KULLANIM KURALLARI:
 * - Hiçbir yerde string olarak query key tanımlama: ['islemler'] yerine queryKeys.islemler.all()
 * - Invalidation için her zaman invalidateRelatedQueries() kullan
 * - Yeni entity eklerken buraya da ekle
 */

import { QueryClient } from '@tanstack/react-query';

// ============================================================================
// QUERY KEY FABRİKALARI
// ============================================================================

/**
 * Tüm query key'leri merkezi olarak tanımlar
 * Factory pattern kullanarak tip güvenliği sağlar
 */
export const queryKeys = {
  // İşlemler
  islemler: {
    all: () => ['islemler'] as const,
    list: (isletmeId: string, filters?: Record<string, unknown>) =>
      ['islemler', isletmeId, filters] as const,
    detail: (id: string) => ['islem', id] as const,
    byCari: (cariId: string, isletmeId: string) =>
      ['islemler', 'cari', cariId, isletmeId] as const,
    byHesap: (hesapId: string, isletmeId: string) =>
      ['islemler', 'hesap', hesapId, isletmeId] as const,
    byPersonel: (personelId: string, isletmeId: string) =>
      ['islemler', 'personel', personelId, isletmeId] as const,
  },

  // Hesaplar
  hesaplar: {
    all: () => ['hesaplar'] as const,
    list: (isletmeId: string) => ['hesaplar', isletmeId] as const,
    detail: (id: string) => ['hesap', id] as const,
  },

  // Cariler
  cariler: {
    all: () => ['cariler'] as const,
    list: (isletmeId: string, type?: string) => ['cariler', isletmeId, type] as const,
    detail: (id: string) => ['cari', id] as const,
  },

  // Personel
  personel: {
    all: () => ['personel'] as const,
    list: (isletmeId: string) => ['personel', isletmeId] as const,
    detail: (id: string) => ['personel-detail', id] as const,
  },

  // Kategoriler
  kategoriler: {
    all: () => ['kategoriler'] as const,
    list: (isletmeId: string) => ['kategoriler', isletmeId] as const,
    detail: (id: string) => ['kategori', id] as const,
  },

  // Raporlar
  reports: {
    monthSummary: (isletmeId: string, period: string, offset: number, startDate: string, endDate: string) =>
      ['month-summary', isletmeId, period, offset, startDate, endDate] as const,
    categoryReport: (isletmeId: string, type: string, startDate: string, endDate: string) =>
      ['category-report', isletmeId, type, startDate, endDate] as const,
    categoryTransactions: (isletmeId: string, kategoriId: string, type: string, startDate: string, endDate: string) =>
      ['category-transactions', isletmeId, kategoriId, type, startDate, endDate] as const,
  },

  // Dashboard
  dashboard: {
    all: () => ['dashboard'] as const,
  },

  // İleri Tarihli İşlemler
  ileriTarihliIslemler: {
    all: () => ['ileri-tarihli-islemler'] as const,
    list: (isletmeId: string) => ['ileri-tarihli-islemler', isletmeId] as const,
    detail: (id: string) => ['ileri-tarihli-islem', id] as const,
    byHesap: (hesapId: string, isletmeId: string) =>
      ['ileri-tarihli-islemler', 'hesap', hesapId, isletmeId] as const,
    byCari: (cariId: string, isletmeId: string) =>
      ['ileri-tarihli-islemler', 'cari', cariId, isletmeId] as const,
    byPersonel: (personelId: string, isletmeId: string) =>
      ['ileri-tarihli-islemler', 'personel', personelId, isletmeId] as const,
    pending: (isletmeId: string) =>
      ['ileri-tarihli-islemler', 'pending', isletmeId] as const,
    today: (isletmeId: string) =>
      ['ileri-tarihli-islemler', 'today', isletmeId] as const,
  },

  // Çekler
  cekler: {
    all: () => ['cekler'] as const,
    list: (isletmeId: string) => ['cekler', isletmeId] as const,
    detail: (id: string) => ['cek', id] as const,
    byHesap: (hesapId: string, isletmeId: string) =>
      ['cekler', 'hesap', hesapId, isletmeId] as const,
    byCari: (cariId: string, isletmeId: string) =>
      ['cekler', 'cari', cariId, isletmeId] as const,
    bekleyen: (isletmeId: string) =>
      ['cekler', 'bekleyen', isletmeId] as const,
    today: (isletmeId: string) =>
      ['cekler', 'today', isletmeId] as const,
  },
} as const;

// ============================================================================
// INVALİDASYON STRATEJİLERİ
// ============================================================================

/**
 * Hangi entity değiştiğinde hangi query'lerin invalidate edileceğini tanımlar
 */
const invalidationMap = {
  // İşlem değişikliği - en kapsamlı, tüm finansal verileri etkiler
  islem: [
    'islemler',
    'islem',
    'hesaplar',
    'hesap',
    'cariler',
    'cari',
    'personel',
    'personel-detail',
    'dashboard',
    'month-summary',
    'category-report',
    'category-transactions',
  ],

  // İleri tarihli işlem değişikliği
  ileriTarihliIslem: [
    'ileri-tarihli-islemler',
    'ileri-tarihli-islem',
  ],

  // Çek değişikliği
  cek: [
    'cekler',
    'cek',
    'ileri-tarihli-islemler', // Çekler ileri tarihli işlemlerle birlikte gösteriliyor
  ],

  // Hesap değişikliği
  hesap: [
    'hesaplar',
    'hesap',
    'islemler',
    'month-summary',
    'dashboard',
  ],

  // Cari değişikliği
  cari: [
    'cariler',
    'cari',
    'islemler',
    'month-summary',
    'dashboard',
    'category-report',
    'category-transactions',
  ],

  // Personel değişikliği
  personel: [
    'personel',
    'personel-detail',
    'islemler',
    'month-summary',
    'dashboard',
    'category-report',
    'category-transactions',
  ],

  // Kategori değişikliği
  kategori: [
    'kategoriler',
    'kategori',
    'category-report',
    'category-transactions',
  ],

  // İşletme değişikliği - her şeyi invalidate et
  isletme: [
    'islemler',
    'hesaplar',
    'cariler',
    'personel',
    'kategoriler',
    'dashboard',
    'month-summary',
    'category-report',
    'category-transactions',
  ],
} as const;

export type EntityType = keyof typeof invalidationMap;

/**
 * Belirli bir entity değiştiğinde ilgili tüm query'leri invalidate et
 *
 * @example
 * // İşlem oluşturulduktan sonra
 * invalidateRelatedQueries(queryClient, 'islem');
 *
 * // Cari güncellendikten sonra
 * invalidateRelatedQueries(queryClient, 'cari');
 */
export function invalidateRelatedQueries(
  queryClient: QueryClient,
  entityType: EntityType
): void {
  const keysToInvalidate = invalidationMap[entityType];

  keysToInvalidate.forEach((key) => {
    queryClient.invalidateQueries({ queryKey: [key] });
  });
}

/**
 * Tüm query cache'ini temizle (logout, hesap değişikliği için)
 */
export function clearAllQueries(queryClient: QueryClient): void {
  queryClient.clear();
}

/**
 * Belirli bir entity'nin tüm query'lerini invalidate et
 *
 * @example
 * invalidateEntityQueries(queryClient, 'islemler');
 */
export function invalidateEntityQueries(
  queryClient: QueryClient,
  entityKey: string
): void {
  queryClient.invalidateQueries({ queryKey: [entityKey] });
}

// ============================================================================
// HOOK YARDIMCILARI
// ============================================================================

/**
 * Mutation onSuccess callback'leri için hazır invalidation fonksiyonları
 */
export const createInvalidators = (queryClient: QueryClient) => ({
  /**
   * İşlem mutation'ları için (create, update, delete)
   */
  onIslemMutation: () => invalidateRelatedQueries(queryClient, 'islem'),

  /**
   * Hesap mutation'ları için
   */
  onHesapMutation: () => invalidateRelatedQueries(queryClient, 'hesap'),

  /**
   * Cari mutation'ları için
   */
  onCariMutation: () => invalidateRelatedQueries(queryClient, 'cari'),

  /**
   * Personel mutation'ları için
   */
  onPersonelMutation: () => invalidateRelatedQueries(queryClient, 'personel'),

  /**
   * Kategori mutation'ları için
   */
  onKategoriMutation: () => invalidateRelatedQueries(queryClient, 'kategori'),

  /**
   * İleri tarihli işlem mutation'ları için
   */
  onIleriTarihliIslemMutation: () => invalidateRelatedQueries(queryClient, 'ileriTarihliIslem'),

  /**
   * Çek mutation'ları için
   */
  onCekMutation: () => invalidateRelatedQueries(queryClient, 'cek'),
});
