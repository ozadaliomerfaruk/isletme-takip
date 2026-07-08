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
    list: (isletmeId: string, filters?: object) =>
      ['islemler', isletmeId, filters] as const,
    detail: (id: string) => ['islem', id] as const,
    byCari: (cariId: string, isletmeId: string) =>
      ['islemler', 'cari', cariId, isletmeId] as const,
    byHesap: (hesapId: string, isletmeId: string) =>
      ['islemler', 'hesap', hesapId, isletmeId] as const,
    byPersonel: (personelId: string, isletmeId: string) =>
      ['islemler', 'personel', personelId, isletmeId] as const,
    allByCari: (cariId: string, isletmeId: string) =>
      ['islemler', 'cari', 'all', cariId, isletmeId] as const,
    allByPersonel: (personelId: string, isletmeId: string) =>
      ['islemler', 'personel', 'all', personelId, isletmeId] as const,
    allLeaveByPersonel: (personelId: string, isletmeId: string) =>
      ['islemler', 'personel', 'all-leave', personelId, isletmeId] as const,
    search: (isletmeId: string, query: string) =>
      ['islemler-search', isletmeId, query] as const,
  },

  // Hesaplar
  hesaplar: {
    all: () => ['hesaplar'] as const,
    list: (isletmeId: string, includePassive?: boolean, includeArchived?: boolean) =>
      ['hesaplar', isletmeId, includePassive, includeArchived] as const,
    detail: (id: string, isletmeId?: string) => ['hesap', id, isletmeId] as const,
    archived: (isletmeId: string) => ['hesaplar', 'archived', isletmeId] as const,
  },

  // Cariler
  cariler: {
    all: () => ['cariler'] as const,
    list: (isletmeId: string, type?: string, includePassive?: boolean, includeArchived?: boolean) =>
      ['cariler', isletmeId, type, includePassive, includeArchived] as const,
    detail: (id: string, isletmeId?: string) => ['cari', id, isletmeId] as const,
    archived: (isletmeId: string, type?: string) => ['cariler', 'archived', isletmeId, type] as const,
  },

  // Personel
  personel: {
    all: () => ['personel'] as const,
    list: (isletmeId: string, includePassive?: boolean, includeArchived?: boolean) =>
      ['personel', isletmeId, includePassive, includeArchived] as const,
    detail: (id: string, isletmeId?: string) => ['personel-detail', id, isletmeId] as const,
    archived: (isletmeId: string) => ['personel', 'archived', isletmeId] as const,
  },

  // Kategoriler
  kategoriler: {
    all: () => ['kategoriler'] as const,
    list: (isletmeId: string, type?: string) => ['kategoriler', isletmeId, type] as const,
    detail: (id: string) => ['kategori', id] as const,
  },

  // Raporlar
  reports: {
    monthSummary: (isletmeId: string, period: string, offset: number, startDate: string, endDate: string) =>
      ['month-summary', isletmeId, period, offset, startDate, endDate] as const,
    allKategoriler: (isletmeId: string, type: string) =>
      ['all-kategoriler', isletmeId, type] as const,
    categoryReport: (isletmeId: string, type: string, source: string, startDate: string, endDate: string) =>
      ['category-report', isletmeId, type, source, startDate, endDate] as const,
    accountReport: (isletmeId: string, type: string, startDate: string, endDate: string) =>
      ['account-report', isletmeId, type, startDate, endDate] as const,
    accountTransactions: (isletmeId: string, hesapId: string, type: string, startDate: string, endDate: string) =>
      ['account-transactions', isletmeId, hesapId, type, startDate, endDate] as const,
    incomeBySource: (isletmeId: string, startDate: string, endDate: string) =>
      ['income-by-source', isletmeId, startDate, endDate] as const,
    networthTrend: (isletmeId: string, monthsBack: number) =>
      ['networth-trend', isletmeId, monthsBack] as const,
    networthOpening: (isletmeId: string, monthsBack: number) =>
      ['networth-opening', isletmeId, monthsBack] as const,
    economicIndicators: (startMonth: string, endMonth: string) =>
      ['economic-indicators', startMonth, endMonth] as const,
    incomeSourceTransactions: (isletmeId: string, kind: string, sourceId: string, startDate: string, endDate: string) =>
      ['income-source-transactions', isletmeId, kind, sourceId, startDate, endDate] as const,
    categoryReportReturns: (isletmeId: string, type: string, startDate: string, endDate: string) =>
      ['category-report-returns', isletmeId, type, startDate, endDate] as const,
    hierarchicalCategoryReport: (isletmeId: string, type: string, source: string, startDate: string, endDate: string) =>
      ['hierarchical-category-report', isletmeId, type, source, startDate, endDate] as const,
    hierarchicalCategoryReportReturns: (isletmeId: string, type: string, startDate: string, endDate: string) =>
      ['hierarchical-category-report-returns', isletmeId, type, startDate, endDate] as const,
    categoryTransactions: (isletmeId: string, kategoriId: string, type: string, source: string, startDate: string, endDate: string, includeReturns = false) =>
      ['category-transactions', isletmeId, kategoriId, type, source, startDate, endDate, includeReturns] as const,
    multiCategoryTransactions: (isletmeId: string, kategoriIds: string, type: string, source: string, startDate: string, endDate: string, includeReturns = false) =>
      ['multi-category-transactions', isletmeId, kategoriIds, type, source, startDate, endDate, includeReturns] as const,
    subCategories: (isletmeId: string, parentKategoriId: string, type: string) =>
      ['sub-categories', isletmeId, parentKategoriId, type] as const,
    subCategoryReportRpc: (isletmeId: string, kategoriIds: string, type: string, source: string, startDate: string, endDate: string) =>
      ['sub-category-report-rpc', isletmeId, kategoriIds, type, source, startDate, endDate] as const,
    subCategoryReportReturns: (isletmeId: string, kategoriIds: string, type: string, startDate: string, endDate: string) =>
      ['sub-category-report-returns', isletmeId, kategoriIds, type, startDate, endDate] as const,
    cashFlowByCategory: (isletmeId: string, startDate: string, endDate: string) =>
      ['cash-flow-by-category', isletmeId, startDate, endDate] as const,
    productReport: (isletmeId: string, direction: string, startDate: string, endDate: string) =>
      ['product-report', isletmeId, direction, startDate, endDate] as const,
    productReportReturns: (isletmeId: string, direction: string, startDate: string, endDate: string) =>
      ['product-report-returns', isletmeId, direction, startDate, endDate] as const,
  },

  // Dashboard
  dashboard: {
    all: () => ['dashboard'] as const,
  },

  // Analytics
  analytics: {
    all: () => ['analytics'] as const,
    periods: (isletmeId: string, period: string, baseCurrency?: string, startDate?: string, endDate?: string) =>
      ['analytics-periods', isletmeId, period, baseCurrency, startDate, endDate] as const,
    trend: (isletmeId: string, period: string, filterType?: string | null, filterId?: string | null, startDate?: string, endDate?: string) =>
      ['analytics-trend', isletmeId, period, filterType, filterId, startDate, endDate] as const,
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

  // Ürünler (Ürün Yönetimi)
  urunler: {
    all: () => ['urunler'] as const,
    list: (isletmeId: string) => ['urunler', isletmeId] as const,
    detail: (id: string) => ['urun', id] as const,
    archived: (isletmeId: string) => ['urunler', 'archived', isletmeId] as const,
  },

  // Urun Hareketler
  urunHareketler: {
    all: () => ['urun-hareketler'] as const,
    byUrun: (urunId: string, isletmeId: string) =>
      ['urun-hareketler', 'urun', urunId, isletmeId] as const,
    byIslem: (islemId: string, isletmeId: string) =>
      ['urun-hareketler', 'islem', islemId, isletmeId] as const,
    aylikOzet: (urunId: string, isletmeId: string) =>
      ['urun-hareketler', 'aylik-ozet', urunId, isletmeId] as const,
    donemOzet: (isletmeId: string, startDate: string, endDate: string) =>
      ['urun-hareketler', 'donem-ozet', isletmeId, startDate, endDate] as const,
    islemlerWithUrun: (stableKey: string, isletmeId: string) =>
      ['urun-hareketler', 'islemler-with-urun', stableKey, isletmeId] as const,
    islemlerWithUrunByCari: (cariId: string, isletmeId: string) =>
      ['urun-hareketler', 'islemler-with-urun-by-cari', cariId, isletmeId] as const,
    kalemlerByIslemler: (stableKey: string, isletmeId: string) =>
      ['urun-hareketler', 'kalemler-by-islemler', stableKey, isletmeId] as const,
  },

  // Ürün Alias'ları
  urunAliases: {
    all: () => ['urun-aliases'] as const,
    list: (isletmeId: string) => ['urun-aliases', isletmeId] as const,
  },

  // Cari Alias'ları
  cariAliases: {
    all: () => ['cari-aliases'] as const,
    list: (isletmeId: string) => ['cari-aliases', isletmeId] as const,
  },

  // İrsaliye Kayıtları
  irsaliyeRecords: {
    all: () => ['irsaliye-records'] as const,
    list: (isletmeId: string, status?: string) => ['irsaliye-records', isletmeId, status] as const,
    byCari: (cariId: string, isletmeId: string) => ['irsaliye-records', 'cari', cariId, isletmeId] as const,
  },

  // Cari Sharing (Cari Paylasim)
  cariSharing: {
    all: () => ['cari-links'] as const,
    list: (isletmeId: string) => ['cari-links', isletmeId] as const,
    status: (isletmeId: string, cariId: string) =>
      ['cari-link-status', isletmeId, cariId] as const,
    linkedCariler: (isletmeId: string) =>
      ['linked-cariler', isletmeId] as const,
  },

  // Multi-User
  multiUser: {
    all: () => ['multi-user'] as const,
    users: (isletmeId: string) => ['isletme-users', isletmeId] as const,
    invites: (isletmeId: string) => ['isletme-invites', isletmeId] as const,
    sharedIsletmeler: (userId: string) => ['shared-isletmeler', userId] as const,
    roleTemplates: () => ['role-templates'] as const,
  },

  // Profiles
  profiles: {
    all: () => ['profiles'] as const,
    detail: (userId: string) => ['profile', userId] as const,
  },

  // Notlar
  notlar: {
    all: () => ['notlar'] as const,
    list: (isletmeId: string, entityType?: string, entityId?: string) =>
      ['notlar', isletmeId, entityType, entityId] as const,
    byEntity: (isletmeId: string, entityType: string, entityId: string) =>
      ['notlar', 'byEntity', isletmeId, entityType, entityId] as const,
  },

  // Arşiv
  archive: {
    all: () => ['archive'] as const,
    counts: (isletmeId: string) => ['archive', 'counts', isletmeId] as const,
  },

  // Döviz Kurları
  exchangeRates: {
    all: () => ['exchange-rates'] as const,
  },

  // Personel İzin Kotaları
  personelLeaveQuotas: {
    all: () => ['personel-leave-quotas'] as const,
    list: (isletmeId: string) => ['personel-leave-quotas', isletmeId] as const,
  },

  // Kalan Kullanım
  remainingUsage: {
    all: () => ['remaining-usage'] as const,
    detail: (userId: string) => ['remaining-usage', userId] as const,
  },

  // Denetim Günlüğü
  auditLog: {
    all: () => ['audit-log'] as const,
    deleted: (isletmeId: string, filters?: object) =>
      ['audit-log', 'deleted', isletmeId, filters] as const,
    edited: (isletmeId: string, filters?: object) =>
      ['audit-log', 'edited', isletmeId, filters] as const,
  },
} as const;

// ============================================================================
// INVALİDASYON STRATEJİLERİ
// ============================================================================

/**
 * Performans optimizasyonu: İki katmanlı invalidation stratejisi
 *
 * immediate: Aktif ekrandaki veriler - hemen refetch edilir (refetchType: 'active')
 *   Sadece ekranda görünen query'ler yeniden çekilir.
 *
 * deferred: Raporlar, dashboard, analytics - sadece stale olarak işaretlenir (refetchType: 'none')
 *   Kullanıcı o sayfaya gittiğinde staleTime dolmuşsa otomatik refetch olur.
 *   Bu, 660 işlemli bir hesaptan geri dönüldüğünde diğer ekranların
 *   gereksiz yere yeniden yüklenmesini engeller.
 */
interface InvalidationConfig {
  immediate: readonly string[];  // refetchType: 'active'
  deferred: readonly string[];   // refetchType: 'none'
}

const invalidationMap: Record<string, InvalidationConfig> = {
  // İşlem değişikliği - en kapsamlı, tüm finansal verileri etkiler
  islem: {
    immediate: [
      'islemler',
      'islemler-search',
      'islem',
      'hesaplar',
      'hesap',
      'cariler',
      'cari',
      'personel',
      'personel-detail',
      'personel-leave-quotas',
      'month-summary',
      // Raporlar: işlem değişimi tüm kategori/hesap/gelir-kaynak/ürün raporlarını etkiler.
      // raporlar/kategori/[id] VE raporlar/hesap/[id] ekranları QuickTransactionBar'ı gömülü
      // barındırdığı için işlem o ekran MOUNTED iken düzenlenebiliyor; deferred
      // (refetchType:'none') mounted ekranı yenilemediğinden bu rapor key'leri (drill-down
      // işlem listeleri dahil) immediate olmalı (urun/kategori bloklarıyla tutarlı).
      'category-report',
      'account-report',
      'account-transactions',
      'income-by-source',
      'income-source-transactions',
      'networth-trend',
      'networth-opening',
      'hierarchical-category-report',
      'category-report-returns',
      'hierarchical-category-report-returns',
      'category-transactions',
      'multi-category-transactions',
      'sub-category-report-rpc',
      'sub-category-report-returns',
      'cash-flow-by-category',
      'urun-hareketler',
      'product-report',
      'product-report-returns',
    ],
    deferred: [
      'dashboard',
      'analytics-periods',
      'analytics-trend',
    ],
  },

  // İleri tarihli işlem değişikliği
  ileriTarihliIslem: {
    immediate: [
      'ileri-tarihli-islemler',
      'ileri-tarihli-islem',
    ],
    deferred: [],
  },

  // Çek değişikliği
  cek: {
    immediate: [
      'cekler',
      'cek',
      'ileri-tarihli-islemler',
      'cariler',
      'cari',
      'hesaplar',
      'hesap',
    ],
    deferred: [],
  },

  // Hesap değişikliği
  hesap: {
    immediate: [
      'hesaplar',
      'hesap',
      'islemler',
      // Hesap bazlı gelir/gider raporu hesaba göre gruplar → hesap adı/aktiflik değişince
      // AÇIK rapor ekranı anında güncellensin (category-report ile aynı immediate mantığı).
      'account-report',
      'account-transactions',
      'income-by-source',
      'income-source-transactions',
      // Arşivden kalıcı silme sonrası arşiv sayaç rozeti tazelensin (ürün bloğuyla simetrik).
      'archive',
    ],
    deferred: [
      'month-summary',
      'dashboard',
      'analytics-periods',
      'analytics-trend',
    ],
  },

  // Cari değişikliği
  cari: {
    immediate: [
      'cariler',
      'cari',
      'islemler',
      // Arşivden kalıcı silme sonrası arşiv sayaç rozeti tazelensin (ürün bloğuyla simetrik).
      'archive',
    ],
    deferred: [
      'month-summary',
      'dashboard',
      'category-report',
      'account-report',
      'account-transactions',
      'income-by-source',
      'income-source-transactions',
      'category-transactions',
      'cash-flow-by-category',
      'analytics-periods',
      'analytics-trend',
    ],
  },

  // Personel değişikliği
  personel: {
    immediate: [
      'personel',
      'personel-detail',
      'personel-leave-quotas',
      'islemler',
      // Arşivden kalıcı silme sonrası arşiv sayaç rozeti tazelensin (ürün bloğuyla simetrik).
      'archive',
    ],
    deferred: [
      'month-summary',
      'dashboard',
      'category-report',
      'account-report',
      'account-transactions',
      'income-by-source',
      'income-source-transactions',
      'category-transactions',
      'cash-flow-by-category',
      'analytics-periods',
      'analytics-trend',
    ],
  },

  // Kategori değişikliği
  kategori: {
    immediate: [
      'kategoriler',
      'kategori',
      // Kategori lookup map'i (id->ad/renk/parent) ve alt-kategori ağacı: rename/recolor/parent
      // değişiminde rapor & dashboard widget'ları bunlardan okur; mounted iken bayat kalmasın.
      'all-kategoriler',
      'sub-categories',
      // #8: İşlem listeleri kategori adını embedded join ile gömülü tutuyor; kategori
      // yeniden adlandırılınca cari/personel ile tutarlı olması için islemler de yenilenmeli
      // (aksi halde açık liste eski adı navigasyona kadar gösteriyordu).
      'islemler',
      // Aynı "açık ekran eski adı/rengi gösteriyor" sorunu raporlar için de geçerli:
      // mounted rapor ekranları kategori değişiminde anında güncellensin (deferred mounted observer'ı yenilemiyor).
      'category-report',
      'account-report',
      'account-transactions',
      'income-by-source',
      'income-source-transactions',
      'networth-trend',
      'networth-opening',
      'hierarchical-category-report',
      'category-transactions',
      'multi-category-transactions',
      'sub-category-report-rpc',
      'sub-category-report-returns',
      'cash-flow-by-category',
      'product-report',
      'product-report-returns',
    ],
    deferred: [],
  },

  // İşletme değişikliği - her şeyi invalidate et
  isletme: {
    immediate: [
      'islemler',
      'hesaplar',
      'cariler',
      'personel',
      'kategoriler',
      'urunler',
      'urun-hareketler',
    ],
    deferred: [
      'dashboard',
      'month-summary',
      'category-report',
      'account-report',
      'account-transactions',
      'income-by-source',
      'income-source-transactions',
      'category-transactions',
      'cash-flow-by-category',
      'analytics-periods',
      'analytics-trend',
    ],
  },

  // Ürün değişikliği
  urun: {
    immediate: [
      'urunler',
      'urun',
      'urun-hareketler',
      'archive',
      // Raporlar: ürünün kategorisi/adı/fiyatı değişince AÇIK rapor ekranı anında güncellensin.
      // Bunlar rapor ekranlarının fiilen kullandığı query key'ler (bkz. queryKeys.report.*).
      // Eskiden urun invalidation'ında bu key'ler ya hiç yoktu ya da deferred'di (refetchType:'none');
      // raporlarda useFocusEffect/odak-refetch yok ve deferred mounted observer'ı yenilemediği için,
      // kategori raporu açıkken ürünün kategorisini değiştirip dönünce rapor eski kategoride takılı kalıyordu.
      // 'active' (immediate) ile mounted rapor anında yenilenir; rapor kapalıyken refetchType:'active'
      // hiçbir şey çekmez → maliyetsiz. (Aynı mantık kategori bloğundaki 'islemler' #8 notu ile birebir.)
      'category-report',
      'account-report',
      'account-transactions',
      'income-by-source',
      'income-source-transactions',
      'networth-trend',
      'networth-opening',
      'hierarchical-category-report',
      'category-transactions',
      'multi-category-transactions',
      'sub-category-report-rpc',
      'sub-category-report-returns',
      'cash-flow-by-category',
      'product-report',
      'product-report-returns',
    ],
    deferred: [],
  },

  // Urun hareket değişikliği
  urunHareket: {
    immediate: [
      'urun-hareketler',
      'urunler',
      'urun',
      'product-report',
      'product-report-returns',
    ],
    deferred: [],
  },

  // Not değişikliği
  not: {
    immediate: [
      'notlar',
    ],
    deferred: [],
  },

  // Ürün alias değişikliği
  urunAlias: {
    immediate: [
      'urun-aliases',
    ],
    deferred: [],
  },

  // Cari alias değişikliği
  cariAlias: {
    immediate: [
      'cari-aliases',
    ],
    deferred: [],
  },

  // İrsaliye kaydı değişikliği
  irsaliyeRecord: {
    immediate: [
      'irsaliye-records',
    ],
    deferred: [],
  },

  // Cari sharing (paylasim) değişikliği
  cariSharing: {
    immediate: [
      'cari-links',
      'cari-link-status',
      'linked-cariler',
      'cariler',
      'cari',
    ],
    deferred: [],
  },

  // İşletme kullanıcı değişikliği
  isletmeUser: {
    immediate: [
      'isletme-users',
      'isletme-invites',
      'shared-isletmeler',
    ],
    deferred: [
      'profile',
    ],
  },

  // Personel izin kotası değişikliği
  personelLeaveQuota: {
    immediate: [
      'personel-leave-quotas',
      'personel',
      'personel-detail',
    ],
    deferred: [],
  },
} as const;

export type EntityType = keyof typeof invalidationMap;

/**
 * Belirli bir entity değiştiğinde ilgili tüm query'leri invalidate et
 *
 * İki katmanlı strateji:
 * - immediate: Aktif ekrandaki query'ler hemen refetch edilir
 * - deferred: Rapor/dashboard query'leri sadece stale olarak işaretlenir
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
  const config = invalidationMap[entityType];

  // Immediate: Aktif ekrandaki veriler hemen refetch edilir
  config.immediate.forEach((key) => {
    queryClient.invalidateQueries({
      queryKey: [key],
      refetchType: 'active',
    });
  });

  // Deferred: Raporlar ve dashboard sadece stale olarak işaretlenir
  // Kullanıcı o sayfaya gittiğinde otomatik refetch olur
  config.deferred.forEach((key) => {
    queryClient.invalidateQueries({
      queryKey: [key],
      refetchType: 'none',
    });
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

  /**
   * Ürün mutation'ları için
   */
  onUrunMutation: () => invalidateRelatedQueries(queryClient, 'urun'),

  /**
   * Not mutation'ları için
   */
  onNotMutation: () => invalidateRelatedQueries(queryClient, 'not'),

  /**
   * Personel izin kotası mutation'ları için
   */
  onPersonelLeaveQuotaMutation: () => invalidateRelatedQueries(queryClient, 'personelLeaveQuota'),

  /**
   * Urun hareket mutation'ları için
   */
  onUrunHareketMutation: () => invalidateRelatedQueries(queryClient, 'urunHareket'),

  /**
   * Cari sharing mutation'ları için
   */
  onCariSharingMutation: () => invalidateRelatedQueries(queryClient, 'cariSharing'),

  /**
   * İşletme kullanıcı mutation'ları için
   */
  onIsletmeUserMutation: () => invalidateRelatedQueries(queryClient, 'isletmeUser'),
});
