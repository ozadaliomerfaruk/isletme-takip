/**
 * Uygulama yapılandırma sabitleri
 *
 * Magic number'ları merkezi olarak yönetmek için kullanılır.
 * Tüm hardcoded değerler burada tanımlanmalıdır.
 */

export const CONFIG = {
  // Auth & Session
  /** Token yenileme eşiği (saniye) - Token bu kadar saniye kala yenilenecek */
  TOKEN_REFRESH_THRESHOLD: 300, // 5 dakika

  /** Session yenileme aralığı (ms) - Uygulama ön plandayken session kontrolü */
  SESSION_REFRESH_INTERVAL: 2 * 60 * 1000, // 2 dakika

  /** Auth timeout süresi (ms) - Auth başlatma için maksimum bekleme */
  AUTH_TIMEOUT: 30000, // 30 saniye

  // Pagination
  /** Varsayılan sayfa limiti */
  DEFAULT_PAGE_LIMIT: 10,

  /** Kategori raporu limiti */
  CATEGORY_REPORT_LIMIT: 100,

  // Animations
  /** İşlem bar açılma gecikmesi (ms) */
  TRANSACTION_BAR_OPEN_DELAY: 500,

  /** AutoFocus gecikmesi (ms) */
  AUTOFOCUS_DELAY: 300,

  // Cache
  /** Query stale time (ms) - Cache'in taze kabul edilme süresi */
  QUERY_STALE_TIME: 5 * 60 * 1000, // 5 dakika

  /** Query cache time (ms) - Cache'in bellekte tutulma süresi */
  QUERY_CACHE_TIME: 30 * 60 * 1000, // 30 dakika
} as const;

export type ConfigKey = keyof typeof CONFIG;
