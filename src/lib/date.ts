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

// ============================================================================
// SABITLER
// ============================================================================

/**
 * Türkçe ay isimleri (tam)
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
 * Türkçe ay isimleri (kısa - 3 harf)
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
 * Türkçe gün isimleri
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
 * Türkçe gün isimleri (kısa - 3 harf)
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
 * Tarih formatla: "19 Aralık 2024"
 * Kullanım: İşlem detayları, form gösterimleri
 */
export function formatDateLong(date: string | Date): string {
  const d = typeof date === 'string' ? parseDateFromDB(date) : date;
  return `${d.getDate()} ${MONTHS_FULL[d.getMonth()]} ${d.getFullYear()}`;
}

/**
 * Tarih formatla: "19 Ara 2024"
 * Kullanım: Kart başlıkları, özet gösterimleri
 */
export function formatDateMedium(date: string | Date): string {
  const d = typeof date === 'string' ? parseDateFromDB(date) : date;
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;
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
 * Ay ve yıl formatla: "Aralık 2024"
 * Kullanım: Dönem seçiciler, rapor başlıkları
 */
export function formatMonthYear(date: Date): string {
  return `${MONTHS_FULL[date.getMonth()]} ${date.getFullYear()}`;
}

/**
 * Sadece ay formatla: "Aralık"
 */
export function formatMonth(date: Date): string {
  return MONTHS_FULL[date.getMonth()];
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
 * Göreceli tarih formatla: "Bugün", "Dün", "2 gün önce"
 * Kullanım: Bildirimler, son aktiviteler
 */
export function formatRelativeDate(date: string | Date): string {
  const d = typeof date === 'string' ? parseDateFromDB(date) : date;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());

  const diffTime = today.getTime() - target.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Bugün';
  if (diffDays === 1) return 'Dün';
  if (diffDays < 7) return `${diffDays} gün önce`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} hafta önce`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} ay önce`;
  return `${Math.floor(diffDays / 365)} yıl önce`;
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
      if (startDate.getMonth() === endDate.getMonth()) {
        label = `${startDate.getDate()}-${endDate.getDate()} ${MONTHS_FULL[startDate.getMonth()]}`;
      } else {
        label = `${startDate.getDate()} ${MONTHS_SHORT[startDate.getMonth()]} - ${endDate.getDate()} ${MONTHS_SHORT[endDate.getMonth()]}`;
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
      label = 'Tarih Seçin';
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
