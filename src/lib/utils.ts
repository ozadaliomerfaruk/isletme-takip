/**
 * Genel Yardımcı Fonksiyonlar
 *
 * Bu dosya para/tarih işlemleri dışındaki genel utility fonksiyonları içerir.
 * Para işlemleri için: @/lib/currency
 * Tarih işlemleri için: @/lib/date
 */

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

