import { useMemo } from 'react';
import { useCariler } from './useCariler';
import { usePersonelList } from './usePersonel';
import { toNumber } from '@/lib/currency';

export interface FinancialBreakdown {
  cari: number;
  personel: number;
  // İleride eklenebilecek alanlar:
  // demirbasKredi?: number;
  // stokBorcu?: number;
  total: number;
}

export interface FinancialSummary {
  // Borçlar (biz borçluyuz)
  payables: FinancialBreakdown;

  // Alacaklar (bize borçlular)
  receivables: FinancialBreakdown;

  // Net durum (pozitif = net alacaklıyız, negatif = net borçluyuz)
  netPosition: number;

  isLoading: boolean;
}

/**
 * Birleşik finansal özet hook'u
 * Tüm borç ve alacakları tek bir yerden yönetir
 *
 * Borç kaynakları:
 * - Cariler (tedarikçilere borç - negatif bakiye)
 * - Personel (personele borç - negatif bakiye)
 *
 * Alacak kaynakları:
 * - Cariler (müşterilerden alacak - pozitif bakiye)
 * - Personel (personelden alacak/avans - pozitif bakiye)
 */
export function useFinancialSummary(): FinancialSummary {
  const { data: cariler, isLoading: carilerLoading } = useCariler();
  const { data: personelList, isLoading: personelLoading } = usePersonelList();

  const summary = useMemo(() => {
    // Cari hesaplaması
    const cariSummary = cariler?.reduce(
      (acc, cari) => {
        const balance = toNumber(cari.balance);
        if (balance > 0) {
          // Pozitif bakiye = müşteriden alacak
          acc.receivables += balance;
        } else if (balance < 0) {
          // Negatif bakiye = tedarikçiye borç
          acc.payables += Math.abs(balance);
        }
        return acc;
      },
      { receivables: 0, payables: 0 }
    ) ?? { receivables: 0, payables: 0 };

    // Personel hesaplaması
    const personelSummary = personelList?.reduce(
      (acc, personel) => {
        const balance = toNumber(personel.balance);
        if (balance > 0) {
          // Pozitif bakiye = personelden alacak (avans vs.)
          acc.receivables += balance;
        } else if (balance < 0) {
          // Negatif bakiye = personele borç
          acc.payables += Math.abs(balance);
        }
        return acc;
      },
      { receivables: 0, payables: 0 }
    ) ?? { receivables: 0, payables: 0 };

    // Toplam borçlar
    const payables: FinancialBreakdown = {
      cari: cariSummary.payables,
      personel: personelSummary.payables,
      total: cariSummary.payables + personelSummary.payables,
    };

    // Toplam alacaklar
    const receivables: FinancialBreakdown = {
      cari: cariSummary.receivables,
      personel: personelSummary.receivables,
      total: cariSummary.receivables + personelSummary.receivables,
    };

    // Net pozisyon
    const netPosition = receivables.total - payables.total;

    return {
      payables,
      receivables,
      netPosition,
    };
  }, [cariler, personelList]);

  return {
    ...summary,
    isLoading: carilerLoading || personelLoading,
  };
}
