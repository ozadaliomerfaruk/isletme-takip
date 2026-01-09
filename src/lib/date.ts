/**
 * Merkezi Tarih Yönetimi
 *
 * Bu dosya uygulamadaki tüm tarih işlemlerinin tek kaynağıdır.
 * Yeni tarih formatı veya işlemi eklendiğinde sadece burası güncellenmelidir.
 *
 * KULLANIM KURALLARI:
 * - Hiçbir component'ta doğrudan new Date().toISOString() kullanma
 * - Hiçbir yerde hardcoded ay isimleri tanımlama
 * - Tüm tarih formatlamaları bu dosyadan yapılmalı
 */

import i18n from 'i18next';

// ============================================================================
// LOCALE YARDIMCI FONKSİYONLARI
// ============================================================================

/**
 * i18n dil kodunu native API'ler için locale string'e dönüştür
 * Kullanım: toLocaleDateString, Intl.NumberFormat, DateTimePicker vb.
 */
export function getLocale(): string {
  const localeMap: Record<string, string> = {
    tr: 'tr-TR',
    en: 'en-US',
    de: 'de-DE',
    fr: 'fr-FR',
    es: 'es-ES',
  };
  return localeMap[i18n.language] || 'en-US';
}

// ============================================================================
// ÇEVIRI YARDIMCI FONKSİYONLARI
// ============================================================================

/**
 * Çevirilmiş ay isimlerini al (tam)
 */
function getMonths(): string[] {
  const months = i18n.t('date.months', { ns: 'common', returnObjects: true });
  if (Array.isArray(months) && months.every((m) => typeof m === 'string')) {
    return months as string[];
  }
  return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
}

/**
 * Çevirilmiş ay isimlerini al (kısa)
 */
function getMonthsShort(): string[] {
  const months = i18n.t('date.monthsShort', { ns: 'common', returnObjects: true });
  if (Array.isArray(months) && months.every((m) => typeof m === 'string')) {
    return months as string[];
  }
  return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
}

/**
 * Çevirilmiş gün isimlerini al (tam)
 */
function getDays(): string[] {
  const days = i18n.t('date.days', { ns: 'common', returnObjects: true });
  if (Array.isArray(days) && days.every((d) => typeof d === 'string')) {
    return days as string[];
  }
  return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
}

/**
 * Çevirilmiş gün isimlerini al (kısa)
 */
function getDaysShort(): string[] {
  const days = i18n.t('date.daysShort', { ns: 'common', returnObjects: true });
  if (Array.isArray(days) && days.every((d) => typeof d === 'string')) {
    return days as string[];
  }
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
}

// ============================================================================
// SABITLER (Deprecated - geriye uyumluluk için)
// ============================================================================

/**
 * @deprecated Çeviriler için useDateFormat hook'unu kullanın
 */
export const MONTHS_FULL = [
  'Ocak',
  'Şubat',
  'Mart',
  'Nisan',
  'Mayıs',
  'Haziran',
  'Temmuz',
  'Ağustos',
  'Eylül',
  'Ekim',
  'Kasım',
  'Aralık',
] as const;

/**
 * @deprecated Çeviriler için useDateFormat hook'unu kullanın
 */
export const MONTHS_SHORT = [
  'Oca',
  'Şub',
  'Mar',
  'Nis',
  'May',
  'Haz',
  'Tem',
  'Ağu',
  'Eyl',
  'Eki',
  'Kas',
  'Ara',
] as const;

/**
 * @deprecated Çeviriler için useDateFormat hook'unu kullanın
 */
export const DAYS_FULL = [
  'Pazar',
  'Pazartesi',
  'Salı',
  'Çarşamba',
  'Perşembe',
  'Cuma',
  'Cumartesi',
] as const;

/**
 * @deprecated Çeviriler için useDateFormat hook'unu kullanın
 */
export const DAYS_SHORT = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'] as const;

// ============================================================================
// DATABASE FORMAT (YYYY-MM-DD)
// ============================================================================

/**
 * Tarihi veritabanı formatına çevir (YYYY-MM-DD)
 * Timezone-safe: Yerel tarihi korur
 *
 * @example
 * formatDateForDB(new Date()) // "2024-12-31"
 */
export function formatDateForDB(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Tarih ve saati veritabanı formatına çevir (YYYY-MM-DDTHH:MM:SS)
 * Timezone-safe: Yerel tarihi ve saati korur
 *
 * @example
 * formatDateTimeForDB(new Date()) // "2024-12-31T14:30:00"
 */
export function formatDateTimeForDB(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
}

/**
 * Veritabanı tarih string'ini Date objesine çevir
 * Timezone-safe: Gün kayması olmaz
 * ISO timestamp formatını da destekler (created_at gibi alanlar için)
 *
 * @example
 * parseDateFromDB("2024-12-31") // Date object at local midnight
 * parseDateFromDB("2024-12-31T14:30:00.000Z") // ISO timestamp
 */
export function parseDateFromDB(dateStr: string): Date {
  // ISO timestamp formatı ise (T içeriyorsa) direkt parse et
  if (dateStr.includes('T')) {
    return new Date(dateStr);
  }
  // YYYY-MM-DD formatı için 'T00:00:00' ekleyerek yerel timezone'da parse et
  return new Date(dateStr + 'T00:00:00');
}

// ============================================================================
// GÖRÜNTÜLEME FORMATLARI
// ============================================================================

/**
 * Tarih formatla: "19 Aralık 2024" / "19 December 2024"
 * Kullanım: İşlem detayları, form gösterimleri
 */
export function formatDateLong(date: string | Date): string {
  const d = typeof date === 'string' ? parseDateFromDB(date) : date;
  const months = getMonths();
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

/**
 * Tarih formatla: "19 Ara 2024" / "19 Dec 2024"
 * Kullanım: Kart başlıkları, özet gösterimleri
 */
export function formatDateMedium(date: string | Date): string {
  const d = typeof date === 'string' ? parseDateFromDB(date) : date;
  const months = getMonthsShort();
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

/**
 * Tarih formatla: "19.12.2024"
 * Kullanım: Tablo hücreleri, kompakt gösterimler
 */
export function formatDateShort(date: string | Date): string {
  const d = typeof date === 'string' ? parseDateFromDB(date) : date;
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${day}.${month}.${d.getFullYear()}`;
}

/**
 * Ay ve yıl formatla: "Aralık 2024" / "December 2024"
 * Kullanım: Dönem seçiciler, rapor başlıkları
 */
export function formatMonthYear(date: Date): string {
  const months = getMonths();
  return `${months[date.getMonth()]} ${date.getFullYear()}`;
}

/**
 * Sadece ay formatla: "Aralık" / "December"
 */
export function formatMonth(date: Date): string {
  const months = getMonths();
  return months[date.getMonth()];
}

/**
 * Tarih ve saat formatla: "19.12.2024 14:30"
 * Kullanım: İşlem logları, detaylı gösterimler
 */
export function formatDateTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const dateStr = formatDateShort(d);
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${dateStr} ${hours}:${minutes}`;
}

/**
 * Göreceli tarih formatla: "Bugün"/"Today", "Dün"/"Yesterday", "2 gün önce"/"2 days ago"
 * Kullanım: Bildirimler, son aktiviteler
 */
export function formatRelativeDate(date: string | Date): string {
  const d = typeof date === 'string' ? parseDateFromDB(date) : date;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());

  const diffTime = today.getTime() - target.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return i18n.t('date.relative.today', { ns: 'common' }) || 'Today';
  if (diffDays === 1) return i18n.t('date.relative.yesterday', { ns: 'common' }) || 'Yesterday';
  if (diffDays < 7) return i18n.t('date.relative.daysAgo', { ns: 'common', count: diffDays }) || `${diffDays} days ago`;
  if (diffDays < 30) return i18n.t('date.relative.weeksAgo', { ns: 'common', count: Math.floor(diffDays / 7) }) || `${Math.floor(diffDays / 7)} weeks ago`;
  if (diffDays < 365) return i18n.t('date.relative.monthsAgo', { ns: 'common', count: Math.floor(diffDays / 30) }) || `${Math.floor(diffDays / 30)} months ago`;
  return i18n.t('date.relative.yearsAgo', { ns: 'common', count: Math.floor(diffDays / 365) }) || `${Math.floor(diffDays / 365)} years ago`;
}

// ============================================================================
// TARİH ARALIĞI HESAPLAMALARI
// ============================================================================

export type PeriodType = 'yearly' | 'monthly' | 'weekly' | 'daily' | 'custom';

export interface DateRange {
  startDate: string; // YYYY-MM-DD format
  endDate: string; // YYYY-MM-DD format
  label: string; // Görüntülenecek etiket
}

/**
 * Dönem için tarih aralığı hesapla
 *
 * @param period - Dönem tipi
 * @param offset - Dönem kaydırma (0 = şu an, -1 = önceki, 1 = sonraki)
 * @param customRange - Özel tarih aralığı (sadece period='custom' için)
 *
 * @example
 * getDateRange('monthly', 0)  // Bu ay
 * getDateRange('monthly', -1) // Geçen ay
 * getDateRange('weekly', 1)   // Gelecek hafta
 */
export function getDateRange(
  period: PeriodType,
  offset: number = 0,
  customRange?: { startDate: string; endDate: string }
): DateRange {
  const now = new Date();
  let startDate: Date;
  let endDate: Date;
  let label: string;

  switch (period) {
    case 'yearly': {
      const targetYear = now.getFullYear() + offset;
      startDate = new Date(targetYear, 0, 1);
      endDate = new Date(targetYear, 11, 31);
      label = targetYear.toString();
      break;
    }

    case 'monthly': {
      const targetMonth = new Date(now.getFullYear(), now.getMonth() + offset, 1);
      startDate = new Date(targetMonth.getFullYear(), targetMonth.getMonth(), 1);
      endDate = new Date(targetMonth.getFullYear(), targetMonth.getMonth() + 1, 0);
      label = formatMonthYear(targetMonth);
      break;
    }

    case 'weekly': {
      const dayOfWeek = now.getDay();
      const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const thisMonday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + mondayOffset);
      startDate = new Date(thisMonday);
      startDate.setDate(thisMonday.getDate() + offset * 7);
      endDate = new Date(startDate);
      endDate.setDate(startDate.getDate() + 6);

      // Hafta etiketi
      const monthsFull = getMonths();
      const monthsShort = getMonthsShort();
      if (startDate.getMonth() === endDate.getMonth()) {
        label = `${startDate.getDate()}-${endDate.getDate()} ${monthsFull[startDate.getMonth()]}`;
      } else {
        label = `${startDate.getDate()} ${monthsShort[startDate.getMonth()]} - ${endDate.getDate()} ${monthsShort[endDate.getMonth()]}`;
      }
      break;
    }

    case 'daily': {
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
      endDate = new Date(startDate);
      label = formatDateLong(startDate);
      break;
    }

    case 'custom': {
      if (customRange) {
        const start = parseDateFromDB(customRange.startDate);
        const end = parseDateFromDB(customRange.endDate);
        return {
          startDate: customRange.startDate,
          endDate: customRange.endDate,
          label: `${formatDateMedium(start)} - ${formatDateMedium(end)}`,
        };
      }
      // Varsayılan: bu ay
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      label = i18n.t('date.selectDate', { ns: 'common' }) || 'Select Date';
      break;
    }
  }

  return {
    startDate: formatDateForDB(startDate),
    endDate: formatDateForDB(endDate),
    label,
  };
}

/**
 * Ayın ilk ve son gününü hesapla
 */
export function getMonthRange(date: Date): DateRange {
  const startDate = new Date(date.getFullYear(), date.getMonth(), 1);
  const endDate = new Date(date.getFullYear(), date.getMonth() + 1, 0);

  return {
    startDate: formatDateForDB(startDate),
    endDate: formatDateForDB(endDate),
    label: formatMonthYear(date),
  };
}

/**
 * Yılın ilk ve son gününü hesapla
 */
export function getYearRange(year: number): DateRange {
  return {
    startDate: `${year}-01-01`,
    endDate: `${year}-12-31`,
    label: year.toString(),
  };
}

// ============================================================================
// YARDIMCI FONKSİYONLAR
// ============================================================================

/**
 * Bugünün tarihini YYYY-MM-DD formatında döndür
 */
export function today(): string {
  return formatDateForDB(new Date());
}

/**
 * İki tarih aynı gün mü kontrol et
 */
export function isSameDay(date1: Date | string, date2: Date | string): boolean {
  const d1 = typeof date1 === 'string' ? parseDateFromDB(date1) : date1;
  const d2 = typeof date2 === 'string' ? parseDateFromDB(date2) : date2;

  return (
    d1.getDate() === d2.getDate() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getFullYear() === d2.getFullYear()
  );
}

/**
 * Tarih bugün mü kontrol et
 */
export function isToday(date: Date | string): boolean {
  return isSameDay(date, new Date());
}

/**
 * Tarih bu yıl içinde mi kontrol et
 */
export function isSameYear(date: Date | string): boolean {
  const d = typeof date === 'string' ? parseDateFromDB(date) : date;
  return d.getFullYear() === new Date().getFullYear();
}

/**
 * Saat formatla: "14:30"
 */
export function formatTime(date: string | Date): string {
  const d = typeof date === 'string' ? parseDateFromDB(date) : date;
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

/**
 * Akıllı tarih formatı:
 * - Aynı yıl: "19 Ara 14:30" / "19 Dec 14:30" (yıl yok, saat var)
 * - Farklı yıl: "19 Ara 2025" / "19 Dec 2025" (yıl var, saat yok)
 */
export function formatDateSmart(date: string | Date): string {
  const d = typeof date === 'string' ? parseDateFromDB(date) : date;
  const day = d.getDate();
  const months = getMonthsShort();
  const month = months[d.getMonth()];

  if (isSameYear(d)) {
    // Aynı yıl: gün ay saat
    const time = formatTime(d);
    return `${day} ${month} ${time}`;
  } else {
    // Farklı yıl: gün ay yıl
    return `${day} ${month} ${d.getFullYear()}`;
  }
}

/**
 * Tarihi karşılaştır (sıralama için)
 * Negatif: date1 < date2
 * Pozitif: date1 > date2
 * Sıfır: eşit
 */
export function compareDates(date1: Date | string, date2: Date | string): number {
  const d1 = typeof date1 === 'string' ? parseDateFromDB(date1) : date1;
  const d2 = typeof date2 === 'string' ? parseDateFromDB(date2) : date2;
  return d1.getTime() - d2.getTime();
}

/**
 * Tarih belirli aralıkta mı kontrol et
 */
export function isDateInRange(
  date: Date | string,
  startDate: Date | string,
  endDate: Date | string
): boolean {
  const d = typeof date === 'string' ? parseDateFromDB(date) : date;
  const start = typeof startDate === 'string' ? parseDateFromDB(startDate) : startDate;
  const end = typeof endDate === 'string' ? parseDateFromDB(endDate) : endDate;

  return d >= start && d <= end;
}
