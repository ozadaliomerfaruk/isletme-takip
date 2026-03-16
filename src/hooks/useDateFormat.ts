/**
 * useDateFormat Hook
 *
 * Provides localized date formatting functions using i18n translations.
 * This hook wraps the core date utilities from lib/date.ts with translations.
 */

import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { parseDateFromDB, formatDateForDB, isSameYear, formatTime } from '@/lib/date';
import { getCurrentDateFormat } from '@/hooks/useSettings';
import useSettings from '@/hooks/useSettings';

/**
 * Map i18n language code to locale string for native date APIs
 * Takes into account the user's date format preference (DMY vs MDY)
 */
function getLocaleFromLanguage(language: string): string {
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

/**
 * Hook for localized date formatting
 */
export function useDateFormat() {
  const { t, i18n } = useTranslation('common');
  // Subscribe to settings changes so we re-render when date format changes
  const { dateFormat } = useSettings();

  // Get locale for native date APIs (toLocaleDateString, DateTimePicker, etc.)
  // dateFormat dependency ensures locale recalculates when format changes
  const locale = getLocaleFromLanguage(i18n.language);

  // Get month arrays from translations
  const months = t('date.months', { returnObjects: true }) as string[];
  const monthsShort = t('date.monthsShort', { returnObjects: true }) as string[];
  const days = t('date.days', { returnObjects: true }) as string[];
  const daysShort = t('date.daysShort', { returnObjects: true }) as string[];

  /**
   * Format date as "19 December 2024" or "December 19, 2024" based on date format setting
   */
  const formatDateLong = useCallback(
    (date: string | Date): string => {
      const d = typeof date === 'string' ? parseDateFromDB(date) : date;
      const dateFormatConfig = getCurrentDateFormat();
      if (dateFormatConfig.code === 'MDY') {
        return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
      }
      return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [months, dateFormat]
  );

  /**
   * Format date as "19 Dec 2024" or "Dec 19, 2024" based on date format setting
   */
  const formatDateMedium = useCallback(
    (date: string | Date): string => {
      const d = typeof date === 'string' ? parseDateFromDB(date) : date;
      const dateFormatConfig = getCurrentDateFormat();
      if (dateFormatConfig.code === 'MDY') {
        return `${monthsShort[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
      }
      return `${d.getDate()} ${monthsShort[d.getMonth()]} ${d.getFullYear()}`;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [monthsShort, dateFormat]
  );

  /**
   * Format month and year as "December 2024" (localized)
   */
  const formatMonthYear = useCallback(
    (date: Date): string => {
      return `${months[date.getMonth()]} ${date.getFullYear()}`;
    },
    [months]
  );

  /**
   * Format just the month name (localized)
   */
  const formatMonth = useCallback(
    (date: Date): string => {
      return months[date.getMonth()];
    },
    [months]
  );

  /**
   * Format relative date: "Today", "Yesterday", "3 days ago" (localized)
   */
  const formatRelativeDate = useCallback(
    (date: string | Date): string => {
      const d = typeof date === 'string' ? parseDateFromDB(date) : date;
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());

      const diffTime = today.getTime() - target.getTime();
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays === 0) return t('date.today');
      if (diffDays === 1) return t('date.yesterday');
      if (diffDays < 7)
        return t('date.relative.daysAgo', { count: diffDays });
      if (diffDays < 30)
        return t('date.relative.weeksAgo', { count: Math.floor(diffDays / 7) });
      if (diffDays < 365)
        return t('date.relative.monthsAgo', { count: Math.floor(diffDays / 30) });
      return t('date.relative.yearsAgo', { count: Math.floor(diffDays / 365) });
    },
    [t]
  );

  /**
   * Smart date format:
   * - Same year: "19 Dec 14:30" or "Dec 19 14:30" (no year, with time)
   * - Different year: "19 Dec 2025 14:30" or "Dec 19, 2025 14:30" (with year and time)
   */
  const formatDateSmart = useCallback(
    (date: string | Date): string => {
      const d = typeof date === 'string' ? parseDateFromDB(date) : date;
      const day = d.getDate();
      const month = monthsShort[d.getMonth()];
      const time = formatTime(d);
      const dateFormatConfig = getCurrentDateFormat();
      const isMDY = dateFormatConfig.code === 'MDY';

      if (isSameYear(d)) {
        return isMDY ? `${month} ${day} ${time}` : `${day} ${month} ${time}`;
      } else {
        return isMDY
          ? `${month} ${day}, ${d.getFullYear()} ${time}`
          : `${day} ${month} ${d.getFullYear()} ${time}`;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [monthsShort, dateFormat]
  );

  /**
   * Get date range with localized label
   */
  const getDateRangeLabel = useCallback(
    (
      period: 'yearly' | 'monthly' | 'weekly' | 'daily' | 'custom',
      offset: number = 0,
      customRange?: { startDate: string; endDate: string }
    ): { startDate: string; endDate: string; label: string } => {
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
          const thisMonday = new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate() + mondayOffset
          );
          startDate = new Date(thisMonday);
          startDate.setDate(thisMonday.getDate() + offset * 7);
          endDate = new Date(startDate);
          endDate.setDate(startDate.getDate() + 6);

          // Week label
          if (startDate.getMonth() === endDate.getMonth()) {
            label = `${startDate.getDate()}-${endDate.getDate()} ${months[startDate.getMonth()]}`;
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
          // Default: this month
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
          label = t('date.selectDate');
          break;
        }
      }

      return {
        startDate: formatDateForDB(startDate),
        endDate: formatDateForDB(endDate),
        label,
      };
    },
    [months, monthsShort, formatDateLong, formatDateMedium, formatMonthYear, t]
  );

  /**
   * Format date as "19/12/2024" or "12/19/2024" based on user's date format setting
   * Reactive version of lib/date.ts formatDateShort
   */
  const formatDateShort = useCallback(
    (date: string | Date): string => {
      const d = typeof date === 'string' ? parseDateFromDB(date) : date;
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      const dateFormatConfig = getCurrentDateFormat();

      if (dateFormatConfig.code === 'MDY') {
        return `${month}/${day}/${year}`;
      }
      return `${day}/${month}/${year}`;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dateFormat]
  );

  /**
   * Format date and time as "19/12/2024 14:30" or "12/19/2024 14:30"
   * Reactive version of lib/date.ts formatDateTime
   */
  const formatDateTime = useCallback(
    (date: string | Date): string => {
      const d = typeof date === 'string' ? new Date(date) : date;
      const dateStr = formatDateShort(d);
      const hours = String(d.getHours()).padStart(2, '0');
      const minutes = String(d.getMinutes()).padStart(2, '0');
      return `${dateStr} ${hours}:${minutes}`;
    },
    [formatDateShort]
  );

  /**
   * Format date label from date string (for transactions)
   */
  const formatDateLabel = useCallback(
    (dateStr: string): string => {
      const date = new Date(dateStr + 'T00:00:00');
      const dateFormatConfig = getCurrentDateFormat();
      if (dateFormatConfig.code === 'MDY') {
        return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
      }
      return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [months, dateFormat]
  );

  /**
   * Format date for display using native locale (e.g., "31.12.2024" or "12/31/2024")
   */
  const formatDateNative = useCallback(
    (date: Date, options?: Intl.DateTimeFormatOptions): string => {
      const defaultOptions: Intl.DateTimeFormatOptions = {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      };
      return date.toLocaleDateString(locale, options || defaultOptions);
    },
    [locale]
  );

  /**
   * Format time for display using native locale (e.g., "14:30" or "2:30 PM")
   */
  const formatTimeNative = useCallback(
    (date: Date, options?: Intl.DateTimeFormatOptions): string => {
      const defaultOptions: Intl.DateTimeFormatOptions = {
        hour: '2-digit',
        minute: '2-digit',
      };
      return date.toLocaleTimeString(locale, options || defaultOptions);
    },
    [locale]
  );

  return {
    // Locale for native APIs (DateTimePicker, toLocaleDateString, etc.)
    locale,
    // Arrays for direct access if needed
    months,
    monthsShort,
    days,
    daysShort,
    // Formatting functions
    formatDateLong,
    formatDateMedium,
    formatMonthYear,
    formatMonth,
    formatRelativeDate,
    formatDateShort,
    formatDateTime,
    formatDateSmart,
    formatDateLabel,
    getDateRangeLabel,
    formatDateNative,
    formatTimeNative,
    // Translations
    t,
  };
}

export default useDateFormat;
