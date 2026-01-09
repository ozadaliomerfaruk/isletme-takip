import { CURRENCY_SYMBOL } from '@/constants';
import { getLocale } from '@/lib/date';

/**
 * Türkçe para formatından sayıya dönüştür
 * "1.234,56" → 1234.56
 * "1234,56" → 1234.56
 * "1234.56" → 1234.56
 */
export const parseCurrency = (value: string): number => {
  if (!value || value.trim() === '') return NaN;

  // Boşlukları temizle
  let cleaned = value.trim();

  // Hem nokta hem virgül varsa, Türkçe format (1.234,56)
  if (cleaned.includes('.') && cleaned.includes(',')) {
    // Binlik ayracı olan noktaları kaldır, ondalık virgülü noktaya çevir
    cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (cleaned.includes(',')) {
    // Sadece virgül var - ondalık ayracı olarak kullan
    cleaned = cleaned.replace(',', '.');
  }
  // Sadece nokta varsa olduğu gibi bırak (İngilizce format)

  const result = parseFloat(cleaned);
  return result;
};

/**
 * Tutar validation - geçerli bir sayı mı ve 0'dan büyük mü kontrol et
 */
export const isValidAmount = (value: string): boolean => {
  const amount = parseCurrency(value);
  return !isNaN(amount) && amount > 0;
};

/**
 * Tarihi timezone-safe şekilde YYYY-MM-DD formatına çevir
 */
export const formatDateForDB = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Para formatla (₺1.234,56 şeklinde)
 */
export const formatCurrency = (amount: number): string => {
  return `${CURRENCY_SYMBOL}${new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(amount))}`;
};

/**
 * Para formatla (işaret ile birlikte)
 */
export const formatCurrencyWithSign = (amount: number): string => {
  const sign = amount >= 0 ? '+' : '-';
  return `${sign}${formatCurrency(amount)}`;
};

/**
 * Tarih formatla (19 Ara 2024 şeklinde)
 */
export const formatDate = (date: string | Date): string => {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat(getLocale(), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(d);
};

/**
 * Tarih formatla (kısa - 19.12.2024)
 */
export const formatDateShort = (date: string | Date): string => {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat(getLocale(), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d);
};

/**
 * Telefon numarası formatla
 */
export const formatPhone = (phone: string): string => {
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)} ${cleaned.slice(6, 8)} ${cleaned.slice(8)}`;
  }
  return phone;
};

/**
 * İsmin baş harflerini al
 */
export const getInitials = (name: string): string => {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
};

/**
 * UUID oluştur (crypto API kullanarak)
 */
export const generateId = (): string => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};
