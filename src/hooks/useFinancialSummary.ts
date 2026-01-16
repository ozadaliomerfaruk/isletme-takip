import { useMemo } from 'react';
import { useCariler } from './useCariler';
import { usePersonelList } from './usePersonel';
import { useHesaplar } from './useHesaplar';
import { useSettings } from './useSettings';
import { toNumber } from '@/lib/currency';

export interface FinancialBreakdown {
  cari: number;
  personel: number;
  hesap: number; // Hesaplardan gelen borç (negatif bakiyeler)
  total: number;
}

export interface ReceivablesBreakdown {
  cari: number;
  personel: number;
  total: number;
}

export interface FinancialSummary {
  // Hesaplar (pozitif bakiyeli hesaplar, birikim hesapları hariç)
  accounts: number;

  // Borçlar (biz borçluyuz)
  payables: FinancialBreakdown;

  // Alacaklar (bize borçlular)
  receivables: ReceivablesBreakdown;

  // Net durum (pozitif = net alacaklıyız, negatif = net borçluyuz)
  netPosition: number;

  // Genel Durum = (Hesaplar + Alacaklar) - Borçlar
  generalStatus: number;

  isLoading: boolean;
}

/**
 * Birleşik finansal özet hook'u
 * Tüm borç ve alacakları tek bir yerden yönetir
 *
 * Hesaplar (Accounts):
 * - Pozitif bakiyeli hesaplar (birikim hesapları HARİÇ)
 *
 * Borç kaynakları (Payables):
 * - Cariler (müşteri/tedarikçiye borç - negatif bakiye)
 * - Personel (personele borç - negatif bakiye)
 * - Hesaplar (negatif bakiyeli hesaplar - kredi kartı vs., birikim hariç)
 *
 * Alacak kaynakları (Receivables):
 * - Cariler (müşteri/tedarikçiden alacak - pozitif bakiye)
 * - Personel (personelden alacak/avans - pozitif bakiye)
 *
 * Genel Durum = (Hesaplar + Alacaklar) - Borçlar
 */
export function useFinancialSummary(): FinancialSummary {
  // Pasif öğeleri HARIÇ tut - pasif moda alınan hesaplar hiçbir hesaplamaya dahil edilmemeli
  // Arşivlenmiş öğeleri HARİÇ tut - arşivdeki bakiyeler genel duruma dahil edilmez
  // NOT: İşlem bazlı sorgular (gelir/gider, nakit akışı) arşivlenmiş hesap işlemlerini DAHİL eder
  // includePassive: false - pasif hesaplar hariç
  // includeArchived: false - arşivlenmiş hesaplar hariç
  const { data: hesaplar, isLoading: hesaplarLoading } = useHesaplar(false, false);
  const { data: cariler, isLoading: carilerLoading } = useCariler(undefined, false, false);
  const { data: personelList, isLoading: personelLoading } = usePersonelList(false, false);
  const { currency: baseCurrency } = useSettings();

  const summary = useMemo(() => {
    // Birikim hesaplarını filtrele - hesaplamalara dahil edilmez
    const filteredHesaplar = hesaplar?.filter(h => h.type !== 'birikim') || [];

    // Hesap hesaplaması (hesaplar ve borçlar)
    // Sadece kullanıcının seçtiği ana para birimiyle eşleşen hesaplar toplanır
    // Farklı para birimleri (USD, EUR, XAU vs.) toplanamaz
    const hesapSummary = filteredHesaplar.reduce(
      (acc, hesap) => {
        // Hesabın para birimi (yoksa ana para birimi kabul et)
        const accountCurrency = hesap.currency || baseCurrency;

        // Sadece ana para birimiyle eşleşen hesapları dahil et
        if (accountCurrency !== baseCurrency) {
          return acc; // Farklı para birimlerini atla
        }

        const balance = toNumber(hesap.balance);
        if (balance > 0) {
          // Pozitif bakiye = hesap varlığı
          acc.accounts += balance;
        } else if (balance < 0) {
          // Negatif bakiye = borç (kredi kartı vs.)
          acc.payables += Math.abs(balance);
        }
        return acc;
      },
      { accounts: 0, payables: 0 }
    );

    // Cari hesaplaması
    const cariSummary = cariler?.reduce(
      (acc, cari) => {
        const balance = Number(cari.balance);
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
        const balance = Number(personel.balance);
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

    // Hesaplar (pozitif bakiyeli, birikim hariç)
    const accounts = hesapSummary.accounts;

    // Toplam borçlar
    const payables: FinancialBreakdown = {
      cari: cariSummary.payables,
      personel: personelSummary.payables,
      hesap: hesapSummary.payables,
      total: cariSummary.payables + personelSummary.payables + hesapSummary.payables,
    };

    // Toplam alacaklar
    const receivables: ReceivablesBreakdown = {
      cari: cariSummary.receivables,
      personel: personelSummary.receivables,
      total: cariSummary.receivables + personelSummary.receivables,
    };

    // Net pozisyon (sadece alacak - borç)
    const netPosition = Math.round((receivables.total - payables.total) * 100) / 100;

    // Genel Durum = (Hesaplar + Alacaklar) - Borçlar
    const generalStatus = Math.round(((accounts + receivables.total) - payables.total) * 100) / 100;

    return {
      accounts,
      payables,
      receivables,
      netPosition,
      generalStatus,
    };
  }, [hesaplar, cariler, personelList, baseCurrency]);

  return {
    ...summary,
    isLoading: hesaplarLoading || carilerLoading || personelLoading,
  };
}
