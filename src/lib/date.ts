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
import { getCurrentDateFormat } from '@/hooks/useSettings';

// ============================================================================
// LOCALE YARDIMCI FONKSİYONLARI
// ============================================================================

/**
 * i18n dil kodunu native API'ler için locale string'e dönüştür
 * Kullanım: toLocaleDateString, Intl.NumberFormat, DateTimePicker vb.
 * Tarih formatı tercihine göre (DMY/MDY) uygun locale döndürür
 */
export function getLocale(): string {
  const language = i18n.language;
  const dateFormat = getCurrentDateFormat().code;

  // Tarih formatına göre locale seç
  if (dateFormat === 'DMY') {
    // DMY formatı için locale'ler
    const dmyLocales: Record<string, string> = {
      tr: 'tr-TR',
      en: 'en-GB', // İngiliz formatı (DMY)
      de: 'de-DE',
      fr: 'fr-FR',
      es: 'es-ES',
    };
    return dmyLocales[language] || 'en-GB';
  } else {
    // MDY formatı için locale'ler
    const mdyLocales: Record<string, string> = {
      tr: 'tr-TR', // Türkçe'de MDY kullanılmaz ama seçilirse
      en: 'en-US', // Amerikan formatı (MDY)
      de: 'de-DE',
      fr: 'fr-FR',
      es: 'es-ES',
    };
    return mdyLocales[language] || 'en-US';
  }
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
  // Geçersiz/epoch/aşırı tarih korumasi: aksi halde getFullYear()=NaN -> "NaN-NaN-NaN"
  // string'i üretilir, kalıcı duruma (AsyncStorage) veya DB'ye sızar ve geri okununca
  // 1970/Invalid Date olarak görünür ("yapışan 1970" hatasının kökü).
  const safe = ensureValidDate(date);
  const year = safe.getFullYear();
  const month = String(safe.getMonth() + 1).padStart(2, '0');
  const day = String(safe.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Tarih ve saati veritabanı formatına çevir (timezone bilgisi dahil)
 * ISO 8601 formatı: YYYY-MM-DDTHH:MM:SS+HH:MM
 *
 * ÖNEMLİ: Bu fonksiyon kullanıcının cihaz timezone'unu otomatik olarak ekler.
 * Böylece İstanbul'daki kullanıcı 14:30'da işlem yaparsa "+03:00",
 * New York'taki kullanıcı aynı anda işlem yaparsa "-05:00" eklenir.
 * Supabase timestamptz sütunları için doğru davranışı sağlar.
 *
 * @example
 * // İstanbul'da (UTC+3):
 * formatDateTimeForDB(new Date()) // "2024-12-31T14:30:00+03:00"
 *
 * // New York'ta (UTC-5):
 * formatDateTimeForDB(new Date()) // "2024-12-31T06:30:00-05:00"
 */
export function formatDateTimeForDB(date: Date): string {
  // Geçersiz tarih korumasi (formatDateForDB ile aynı gerekçe): NaN sızıntısını önle
  const safe = ensureValidDate(date);
  const year = safe.getFullYear();
  const month = String(safe.getMonth() + 1).padStart(2, '0');
  const day = String(safe.getDate()).padStart(2, '0');
  const hours = String(safe.getHours()).padStart(2, '0');
  const minutes = String(safe.getMinutes()).padStart(2, '0');
  const seconds = String(safe.getSeconds()).padStart(2, '0');

  // Timezone offset (dakika cinsinden, örn: UTC+3 = -180, UTC-5 = 300)
  const tzOffset = safe.getTimezoneOffset();
  const tzSign = tzOffset <= 0 ? '+' : '-';
  const tzHours = String(Math.floor(Math.abs(tzOffset) / 60)).padStart(2, '0');
  const tzMins = String(Math.abs(tzOffset) % 60).padStart(2, '0');

  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}${tzSign}${tzHours}:${tzMins}`;
}

/**
 * Veritabanı tarih string'ini Date objesine çevir
 * Timezone-safe: Gün kayması olmaz
 * ISO timestamp formatını da destekler (created_at gibi alanlar için)
 * Geçersiz veya boş string için bugünü döndürür
 *
 * @example
 * parseDateFromDB("2024-12-31") // Date object at local midnight
 * parseDateFromDB("2024-12-31T14:30:00.000Z") // ISO timestamp
 * parseDateFromDB("") // Bugün (fallback)
 */
export function parseDateFromDB(dateStr: string): Date {
  // Boş string kontrolü
  if (!dateStr || dateStr.trim() === '') {
    return new Date();
  }

  // 1970-bug ailesine karşı normalizasyon (Hermes/JSC Date.parse kaprisleri):
  // 1) "YYYY-MM-DD HH:mm:ss" (boşluklu — ::text cast/eski kayıtlardan gelebilir)
  //    Hermes'te Invalid Date olur → new Date(NaN) zinciri 01.01.1970 gösterir.
  // 2) 3+ haneli kesirli saniye (Postgres mikrosaniye) bazı motorlarda Invalid.
  let s = dateStr.trim();
  if (/^\d{4}-\d{2}-\d{2} \d/.test(s)) {
    s = s.replace(' ', 'T');
  }
  s = s.replace(/(\.\d{3})\d+/, '$1');

  let result: Date;

  // ISO timestamp formatı ise (T içeriyorsa) direkt parse et
  if (s.includes('T')) {
    result = new Date(s);
  } else {
    // YYYY-MM-DD formatı için 'T00:00:00' ekleyerek yerel timezone'da parse et
    result = new Date(s + 'T00:00:00');
  }

  // Invalid Date kontrolü
  if (isNaN(result.getTime())) {
    return new Date();
  }

  // 1970 veya çok eski/gelecek tarihler kontrolü
  const year = result.getFullYear();
  if (year < 1900 || year > 2100) {
    return new Date();
  }

  return result;
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
 * Tarih formatla: "19/12/2024" veya "12/19/2024"
 * Kullanıcının seçtiği tarih formatına göre (DMY veya MDY)
 * Kullanım: Tablo hücreleri, kompakt gösterimler
 */
export function formatDateShort(date: string | Date): string {
  const d = typeof date === 'string' ? parseDateFromDB(date) : date;
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  const dateFormatConfig = getCurrentDateFormat();

  if (dateFormatConfig.code === 'MDY') {
    return `${month}/${day}/${year}`;
  }
  return `${day}/${month}/${year}`;
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
 * Tarih ve saat formatla: "19/12/2024 14:30" veya "12/19/2024 14:30"
 * Kullanıcının seçtiği tarih formatına göre
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

  // Saat bileşenlerini normalize et (gün başlangıcı/sonu)
  // Böylece aynı gündeki farklı saatler doğru karşılaştırılır
  const dDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const startDateOnly = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const endDateOnly = new Date(end.getFullYear(), end.getMonth(), end.getDate());

  return dDate >= startDateOnly && dDate <= endDateOnly;
}

/**
 * Tarihe belirli sayıda ay ekle
 * @param date - Başlangıç tarihi
 * @param months - Eklenecek ay sayısı (negatif olabilir)
 * @returns Yeni tarih
 */
export function addMonths(date: Date | string, months: number): Date {
  const d = typeof date === 'string' ? parseDateFromDB(date) : new Date(date);
  const result = new Date(d);
  const originalDay = result.getDate();
  result.setMonth(result.getMonth() + months);
  // Clamp day to last day of target month (e.g. Jan 31 + 1mo → Feb 28, not Mar 3)
  if (result.getDate() !== originalDay) {
    result.setDate(0); // Go to last day of previous month
  }
  return result;
}

/**
 * Tarihe belirli sayıda gün ekle
 * @param date - Başlangıç tarihi
 * @param days - Eklenecek gün sayısı (negatif olabilir)
 * @returns Yeni tarih
 */
export function addDays(date: Date | string, days: number): Date {
  const d = typeof date === 'string' ? parseDateFromDB(date) : new Date(date);
  const result = new Date(d);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Önceki dönem için tarih aralığı hesapla
 * Analytics karşılaştırmaları için kullanılır
 *
 * @param period - Dönem tipi ('weekly' | 'monthly' | 'yearly')
 * @returns Önceki dönemin tarih aralığı
 *
 * @example
 * getPreviousDateRange('monthly') // Geçen ayın tarih aralığı
 */
export function getPreviousDateRange(
  period: 'weekly' | 'monthly' | 'yearly'
): { startDate: string; endDate: string } {
  const range = getDateRange(period, -1);
  return {
    startDate: range.startDate,
    endDate: range.endDate,
  };
}

/**
 * Tarih objesinin geçerli olup olmadığını kontrol et
 * Geçersiz tarihler (Invalid Date, 1970 öncesi) için bugünü döndür
 * DateTimePicker gibi bileşenlerde güvenli kullanım için
 *
 * @example
 * ensureValidDate(new Date()) // Bugün
 * ensureValidDate(new Date('invalid')) // Bugün (fallback)
 * ensureValidDate(new Date(0)) // Bugün (1970 epoch - fallback)
 */
export function ensureValidDate(date: Date | null | undefined): Date {
  // null veya undefined kontrolü
  if (!date) {
    return new Date();
  }

  // Invalid Date kontrolü
  if (isNaN(date.getTime())) {
    return new Date();
  }

  // Unix epoch sentinel'i (new Date(0) / new Date(null)) = 1970 "yapışan tarih"
  // hatasının kaynağı. Bu tam-epoch değeri geçerli bir kullanıcı tarihi değildir;
  // bugüne düşür. (Not: 1900 floor'u KORUNUYOR ki 'Tüm Zamanlar' raporundaki eski
  // yıllar — ör. 1926 — bozulmasın; yalnızca tam epoch elenir.)
  if (date.getTime() === 0) {
    return new Date();
  }

  // 1900 öncesi veya çok ileri tarihler kontrolü (hatalı parse genellikle)
  const year = date.getFullYear();
  if (year < 1900 || year > 2100) {
    return new Date();
  }

  return date;
}
