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
 * - personel_satis: Personele yapılan satış
 */
export const INCOME_TYPES: IslemType[] = ['gelir', 'cari_satis', 'personel_satis'];

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
export const PAYMENT_TYPES: IslemType[] = ['cari_odeme', 'cari_tahsilat', 'personel_odeme', 'personel_tahsilat'];

/**
 * Transfer işlemleri (hesaplar arası)
 */
export const TRANSFER_TYPES: IslemType[] = ['transfer'];

/**
 * Nakit girişi yapan işlem tipleri (hesaba para GİREN)
 * - gelir: Doğrudan gelir
 * - cari_tahsilat: Müşteriden tahsilat
 * - personel_tahsilat: Personelden tahsilat
 */
export const CASH_INFLOW_TYPES: IslemType[] = ['gelir', 'cari_tahsilat', 'personel_tahsilat'];

/**
 * Nakit çıkışı yapan işlem tipleri (hesaptan para ÇIKAN)
 * - gider: Doğrudan gider
 * - cari_odeme: Tedarikçiye ödeme
 * - personel_gider: Personel gideri
 * - personel_odeme: Personele ödeme
 */
export const CASH_OUTFLOW_TYPES: IslemType[] = ['gider', 'cari_odeme', 'personel_gider', 'personel_odeme'];

/**
 * İade işlemleri (gelir/gideri AZALTIR)
 * - cari_alis_iade: Tedarikçiye iade → gideri azaltır
 * - cari_satis_iade: Müşteriden iade → geliri azaltır
 */
export const INCOME_RETURN_TYPES: IslemType[] = ['cari_satis_iade'];
export const EXPENSE_RETURN_TYPES: IslemType[] = ['cari_alis_iade'];

/**
 * İzin işlemleri (gelir/gider DEĞİL - gün bazlı izin takibi)
 * - personel_izin_hakki: İzin hak edişi (kota artışı)
 * - personel_izin_kullanimi: İzin kullanımı
 */
export const LEAVE_TYPES: IslemType[] = ['personel_izin_hakki', 'personel_izin_kullanimi'];

/**
 * Verilen işlem tipinin izin mi olduğunu kontrol eder
 */
export function isLeaveType(type: IslemType): boolean {
  return LEAVE_TYPES.includes(type);
}

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
 * Verilen işlem tipinin gelir iadesi mi olduğunu kontrol eder
 */
export function isIncomeReturnType(type: IslemType): boolean {
  return INCOME_RETURN_TYPES.includes(type);
}

/**
 * Verilen işlem tipinin gider iadesi mi olduğunu kontrol eder
 */
export function isExpenseReturnType(type: IslemType): boolean {
  return EXPENSE_RETURN_TYPES.includes(type);
}

/**
 * İşlem listesinden gelir/gider özeti hesaplar
 * İadeler ilgili kategoriden düşülür:
 * - cari_satis_iade → gelirden düşülür
 * - cari_alis_iade → giderden düşülür
 *
 * NOT: Floating-point precision için sonuçlar 2 ondalık basamağa yuvarlanır
 */
export function calculateIncomeSummary<T extends { type: IslemType; amount: number | string }>(
  islemler: T[]
): { income: number; expense: number } {
  const result = islemler.reduce(
    (acc, islem) => {
      // İzin işlemleri gün bazlıdır, parasal hesaplamaya dahil edilmez
      if (isLeaveType(islem.type)) return acc;

      // Güvenli number dönüşümü - NaN için 0 döner
      const rawAmount = islem.amount;
      const amount = typeof rawAmount === 'number'
        ? (isNaN(rawAmount) ? 0 : rawAmount)
        : (isNaN(parseFloat(String(rawAmount))) ? 0 : parseFloat(String(rawAmount)));

      // Gelir hesaplama
      if (isIncomeType(islem.type)) {
        acc.income += amount;
      } else if (isIncomeReturnType(islem.type)) {
        acc.income -= amount; // Satış iadesi geliri düşürür
      }

      // Gider hesaplama
      if (isExpenseType(islem.type)) {
        acc.expense += amount;
      } else if (isExpenseReturnType(islem.type)) {
        acc.expense -= amount; // Alış iadesi gideri düşürür
      }

      return acc;
    },
    { income: 0, expense: 0 }
  );

  // Floating-point precision fix: 2 ondalık basamağa yuvarla
  return {
    income: Math.round(result.income * 100) / 100,
    expense: Math.round(result.expense * 100) / 100,
  };
}

/**
 * İşlem tipi etiketleri (Türkçe)
 * @deprecated Çeviriler için t('transactions:types.${type}') kullanın
 */
export const ISLEM_TYPE_LABELS: Record<IslemType, string> = {
  gelir: 'Gelir',
  gider: 'Gider',
  transfer: 'Transfer',
  cari_alis: 'Tedarikçiden Alış',
  cari_satis: 'Müşteriye Satış',
  cari_odeme: 'Tedarikçiye Ödeme',
  cari_tahsilat: 'Müşteriden Tahsilat',
  cari_alis_iade: 'Alış İade',
  cari_satis_iade: 'Satış İade',
  personel_gider: 'Personel Gideri',
  personel_odeme: 'Personel Ödemesi',
  personel_tahsilat: 'Personelden Tahsilat',
  personel_satis: 'Personele Satış',
  nakit_avans_taksit: 'Nakit Avans Taksit',
  personel_izin_hakki: 'İzin Hak Edişi',
  personel_izin_kullanimi: 'İzin Kullanımı',
};

/**
 * İşlem tipinin etiketini döndürür
 * @deprecated Çeviriler için t('transactions:types.${type}') kullanın
 */
export function getIslemTypeLabel(type: IslemType): string {
  return ISLEM_TYPE_LABELS[type] || type;
}
