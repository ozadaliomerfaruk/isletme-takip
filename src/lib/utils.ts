/**
 * Genel Yardımcı Fonksiyonlar
 *
 * Bu dosya para/tarih işlemleri dışındaki genel utility fonksiyonları içerir.
 * Para işlemleri için: @/lib/currency
 * Tarih işlemleri için: @/lib/date
 */

/**
 * Telefon numarası formatla
 * @example formatPhone('5551234567') // "(555) 123 45 67"
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
 * @example getInitials('Ahmet Yılmaz') // "AY"
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
 * @example generateId() // "a1b2c3d4-e5f6-4789-0abc-def123456789"
 */
export const generateId = (): string => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};
