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
  // Hesap varlıkları (pozitif bakiyeli hesaplar)
  assets: number;

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
 * Varlıklar (Assets):
 * - Hesaplar (pozitif bakiyeli hesaplar)
 *
 * Borç kaynakları (Payables):
 * - Cariler (tedarikçilere borç - negatif bakiye)
 * - Personel (personele borç - negatif bakiye)
 * - Hesaplar (negatif bakiyeli hesaplar - kredi kartı vs.)
 *
 * Alacak kaynakları (Receivables):
 * - Cariler (müşterilerden alacak - pozitif bakiye)
 * - Personel (personelden alacak/avans - pozitif bakiye)
 *
 * Genel Durum = (Varlıklar + Alacaklar) - Borçlar
 */
export function useFinancialSummary(): FinancialSummary {
  const { data: hesaplar, isLoading: hesaplarLoading } = useHesaplar();
  const { data: cariler, isLoading: carilerLoading } = useCariler();
  const { data: personelList, isLoading: personelLoading } = usePersonelList();
  const { currency: baseCurrency } = useSettings();

  const summary = useMemo(() => {
    // Hesap hesaplaması (varlıklar ve borçlar)
    // Sadece kullanıcının seçtiği ana para birimiyle eşleşen hesaplar toplanır
    // Farklı para birimleri (USD, EUR, XAU vs.) toplanamaz
    const hesapSummary = hesaplar?.reduce(
      (acc, hesap) => {
        // Hesabın para birimi (yoksa ana para birimi kabul et)
        const accountCurrency = hesap.currency || baseCurrency;

        // Sadece ana para birimiyle eşleşen hesapları dahil et
        if (accountCurrency !== baseCurrency) {
          return acc; // Farklı para birimlerini atla
        }

        const balance = toNumber(hesap.balance);
        if (balance > 0) {
          // Pozitif bakiye = varlık
          acc.assets += balance;
        } else if (balance < 0) {
          // Negatif bakiye = borç (kredi kartı vs.)
          acc.payables += Math.abs(balance);
        }
        return acc;
      },
      { assets: 0, payables: 0 }
    ) ?? { assets: 0, payables: 0 };

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

    // Varlıklar
    const assets = hesapSummary.assets;

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
    const netPosition = receivables.total - payables.total;

    // Genel Durum = (Hesaplar + Alacaklar) - Borçlar
    const generalStatus = (assets + receivables.total) - payables.total;

    return {
      assets,
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
