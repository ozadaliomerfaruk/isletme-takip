import { useMemo } from 'react';
import { useCariler } from './useCariler';
import { usePersonelList } from './usePersonel';
import { useHesaplar } from './useHesaplar';
import { useSettings } from './useSettings';
import { useExchangeRates, convertCurrency } from './useExchangeRates';
import { toNumber, roundCurrency } from '@/lib/currency';

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
  // Varlıklar (pozitif bakiyeli tüm hesaplar, birikim dahil)
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
 * Varlıklar (Assets/Accounts):
 * - Pozitif bakiyeli tüm hesaplar (birikim DAHİL)
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
 * Genel Durum = (Varlıklar + Alacaklar) - Borçlar
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
  const { data: exchangeRatesData, isLoading: exchangeRatesLoading } = useExchangeRates();
  const exchangeRates = exchangeRatesData?.rates;

  const summary = useMemo(() => {
    // Hesap hesaplaması (hesaplar ve borçlar)
    // Tüm para birimlerini ana para birimine çevirip topla
    // Birikim hesapları sadece pozitif bakiyelerde varlık olarak sayılır
    const hesapSummary = (hesaplar || []).reduce(
      (acc, hesap) => {
        // Hesabın para birimi (yoksa ana para birimi kabul et)
        const accountCurrency = hesap.currency || baseCurrency;
        const balance = toNumber(hesap.balance);

        // Para birimini ana para birimine çevir
        let convertedBalance: number;
        if (accountCurrency === baseCurrency) {
          convertedBalance = balance;
        } else {
          // Döviz kuru ile çevir, bulunamazsa orijinal bakiyeyi kullan
          const converted = convertCurrency(balance, accountCurrency, baseCurrency, exchangeRates);
          // Fallback: Döviz kuru yoksa orijinal bakiyeyi kullan (veri kaybı olmasın)
          convertedBalance = converted ?? balance;
        }

        if (convertedBalance > 0) {
          // Pozitif bakiye = hesap varlığı (birikim dahil)
          acc.accounts += convertedBalance;
        } else if (convertedBalance < 0 && hesap.type !== 'birikim') {
          // Negatif bakiye = borç (kredi kartı vs.) - birikim hariç
          acc.payables += Math.abs(convertedBalance);
        }
        return acc;
      },
      { accounts: 0, payables: 0 }
    );

    // Cari hesaplaması (döviz kurlarıyla ana para birimine çevir)
    const cariSummary = cariler?.reduce(
      (acc, cari) => {
        const cariCurrency = cari.currency || baseCurrency;
        const balance = toNumber(cari.balance);

        let convertedBalance: number;
        if (cariCurrency === baseCurrency) {
          convertedBalance = balance;
        } else {
          const converted = convertCurrency(balance, cariCurrency, baseCurrency, exchangeRates);
          convertedBalance = converted ?? balance;
        }

        if (convertedBalance > 0) {
          // Pozitif bakiye = müşteriden alacak
          acc.receivables += convertedBalance;
        } else if (convertedBalance < 0) {
          // Negatif bakiye = tedarikçiye borç
          acc.payables += Math.abs(convertedBalance);
        }
        return acc;
      },
      { receivables: 0, payables: 0 }
    ) ?? { receivables: 0, payables: 0 };

    // Personel hesaplaması (döviz kurlarıyla ana para birimine çevir)
    const personelSummary = personelList?.reduce(
      (acc, personel) => {
        const personelCurrency = personel.currency || baseCurrency;
        const balance = toNumber(personel.balance);

        let convertedBalance: number;
        if (personelCurrency === baseCurrency) {
          convertedBalance = balance;
        } else {
          const converted = convertCurrency(balance, personelCurrency, baseCurrency, exchangeRates);
          convertedBalance = converted ?? balance;
        }

        if (convertedBalance > 0) {
          // Pozitif bakiye = personelden alacak (avans vs.)
          acc.receivables += convertedBalance;
        } else if (convertedBalance < 0) {
          // Negatif bakiye = personele borç
          acc.payables += Math.abs(convertedBalance);
        }
        return acc;
      },
      { receivables: 0, payables: 0 }
    ) ?? { receivables: 0, payables: 0 };

    // Varlıklar (pozitif bakiyeli tüm hesaplar, birikim dahil)
    const accounts = hesapSummary.accounts;

    // Toplam borçlar (sadece kendi cariler — paylaşılan cariler dahil DEĞİL)
    const payables: FinancialBreakdown = {
      cari: cariSummary.payables,
      personel: personelSummary.payables,
      hesap: hesapSummary.payables,
      total: cariSummary.payables + personelSummary.payables + hesapSummary.payables,
    };

    // Toplam alacaklar (sadece kendi cariler — paylaşılan cariler dahil DEĞİL)
    const receivables: ReceivablesBreakdown = {
      cari: cariSummary.receivables,
      personel: personelSummary.receivables,
      total: cariSummary.receivables + personelSummary.receivables,
    };

    // Net pozisyon (sadece alacak - borç)
    const netPosition = roundCurrency(receivables.total - payables.total);

    // Genel Durum = (Hesaplar + Alacaklar) - Borçlar
    const generalStatus = roundCurrency((accounts + receivables.total) - payables.total);

    return {
      accounts,
      payables,
      receivables,
      netPosition,
      generalStatus,
    };
  }, [hesaplar, cariler, personelList, baseCurrency, exchangeRates]);

  return {
    ...summary,
    isLoading: hesaplarLoading || carilerLoading || personelLoading || exchangeRatesLoading,
  };
}
