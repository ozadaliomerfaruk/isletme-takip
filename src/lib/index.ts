/**
 * Merkezi Utility Export
 *
 * Tüm utility fonksiyonları buradan export edilir.
 * Component'lar sadece bu dosyadan import yapmalıdır.
 *
 * @example
 * import { formatCurrency, formatDateLong, getHesapIcon } from '@/lib';
 */

// ============================================================================
// TARİH İŞLEMLERİ
// ============================================================================

export {
  // Sabitler
  MONTHS_FULL,
  MONTHS_SHORT,
  DAYS_FULL,
  DAYS_SHORT,
  // Database format
  formatDateForDB,
  parseDateFromDB,
  // Görüntüleme formatları
  formatDateLong,
  formatDateMedium,
  formatDateShort,
  formatMonthYear,
  formatMonth,
  formatDateTime,
  formatRelativeDate,
  // Tarih aralığı hesaplamaları
  getDateRange,
  getMonthRange,
  getYearRange,
  // Yardımcı fonksiyonlar
  today,
  isSameDay,
  isToday,
  compareDates,
  isDateInRange,
  // Tipler
  type PeriodType,
  type DateRange,
} from './date';

// ============================================================================
// PARA İŞLEMLERİ
// ============================================================================

export {
  // Parse fonksiyonları
  parseCurrency,
  toNumber,
  // Format fonksiyonları
  formatCurrency,
  formatCurrencyWithSign,
  formatNumber,
  formatPercentage,
  formatCurrencyCompact,
  // Validasyon
  isValidAmount,
  isValidBalance,
  // Bakiye hesaplamaları
  getBalanceInfo,
  calculateBalanceSummary,
} from './currency';

// ============================================================================
// QUERY YÖNETİMİ
// ============================================================================

export {
  queryKeys,
  invalidateRelatedQueries,
  clearAllQueries,
  invalidateEntityQueries,
  createInvalidators,
  type EntityType,
} from './queryKeys';

// ============================================================================
// İKON YÖNETİMİ
// ============================================================================

export {
  // Hesap ikonları
  getHesapIconConfig,
  getHesapIcon,
  // İşlem ikonları
  getIslemIconConfig,
  getIslemIcon,
  getIslemAmountColor,
  getIslemAmountPrefix,
  // Trend ikonları
  getTrendIcon,
  // Cari ikonları
  getCariIconConfig,
  // Personel ikonları
  getPersonelIconConfig,
  // Tipler
  type IconConfig,
  type AmountColorType,
} from './icons';

// ============================================================================
// VALİDASYON
// ============================================================================

export {
  // Temel validatörler
  required,
  minLength,
  maxLength,
  // Para validatörleri
  validAmount,
  validBalance,
  minAmount,
  // Seçim validatörleri
  requiredSelection,
  // İletişim validatörleri
  validEmail,
  validPhone,
  // Yardımcı fonksiyonlar
  validate,
  validateFields,
  // Hazır şemalar
  cariValidators,
  personelValidators,
  hesapValidators,
  kategoriValidators,
  islemValidators,
  // Tipler
  type ValidationResult,
  type Validator,
} from './validation';

// ============================================================================
// MEVCUT EXPORTS (Geriye Uyumluluk)
// ============================================================================

export * from './supabase';
export * from './queryClient';
export * from './utils';
