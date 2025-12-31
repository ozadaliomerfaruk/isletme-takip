/**
 * Merkezi İşlem Tipi Tanımları
 *
 * Bu dosya tüm gelir/gider hesaplamalarının tek kaynağıdır.
 * Yeni işlem tipleri eklendiğinde sadece burası güncellenmelidir.
 */

import { IslemType } from '@/types/database';

/**
 * Gelir olarak sayılan işlem tipleri
 * - gelir: Hesaba doğrudan gelen gelir
 * - cari_satis: Müşteriye yapılan satış
 */
export const INCOME_TYPES: IslemType[] = ['gelir', 'cari_satis'];

/**
 * Gider olarak sayılan işlem tipleri
 * - gider: Hesaptan doğrudan çıkan gider
 * - cari_alis: Tedarikçiden yapılan alış
 * - personel_gider: Personel maaş/prim gideri
 */
export const EXPENSE_TYPES: IslemType[] = ['gider', 'cari_alis', 'personel_gider'];

/**
 * Ödeme işlemleri (gelir/gider DEĞİL - sadece para transferi)
 * - cari_odeme: Tedarikçiye borç ödeme
 * - cari_tahsilat: Müşteriden alacak tahsilatı
 * - personel_odeme: Personele borç ödeme
 */
export const PAYMENT_TYPES: IslemType[] = ['cari_odeme', 'cari_tahsilat', 'personel_odeme'];

/**
 * Transfer işlemleri (hesaplar arası)
 */
export const TRANSFER_TYPES: IslemType[] = ['transfer'];

/**
 * Verilen işlem tipinin gelir mi olduğunu kontrol eder
 */
export function isIncomeType(type: IslemType): boolean {
  return INCOME_TYPES.includes(type);
}

/**
 * Verilen işlem tipinin gider mi olduğunu kontrol eder
 */
export function isExpenseType(type: IslemType): boolean {
  return EXPENSE_TYPES.includes(type);
}

/**
 * Verilen işlem tipinin ödeme mi olduğunu kontrol eder
 */
export function isPaymentType(type: IslemType): boolean {
  return PAYMENT_TYPES.includes(type);
}

/**
 * İşlem listesinden gelir/gider özeti hesaplar
 */
export function calculateIncomeSummary<T extends { type: IslemType; amount: number | string }>(
  islemler: T[]
): { income: number; expense: number } {
  return islemler.reduce(
    (acc, islem) => {
      const amount = Number(islem.amount);
      if (isIncomeType(islem.type)) {
        acc.income += amount;
      } else if (isExpenseType(islem.type)) {
        acc.expense += amount;
      }
      return acc;
    },
    { income: 0, expense: 0 }
  );
}

/**
 * İşlem tipi etiketleri (Türkçe)
 */
export const ISLEM_TYPE_LABELS: Record<IslemType, string> = {
  gelir: 'Gelir',
  gider: 'Gider',
  transfer: 'Transfer',
  cari_alis: 'Tedarikçiden Alış',
  cari_satis: 'Müşteriye Satış',
  cari_odeme: 'Tedarikçiye Ödeme',
  cari_tahsilat: 'Müşteriden Tahsilat',
  personel_gider: 'Personel Gideri',
  personel_odeme: 'Personel Ödemesi',
};

/**
 * İşlem tipinin etiketini döndürür
 */
export function getIslemTypeLabel(type: IslemType): string {
  return ISLEM_TYPE_LABELS[type] || type;
}
