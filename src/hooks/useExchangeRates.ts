/**
 * useExchangeRates Hook
 *
 * Supabase'den döviz kurlarını çeker ve TL karşılığı hesaplama fonksiyonları sağlar.
 * Kurlar günde 1 kez Edge Function tarafından güncellenir.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { queryKeys } from '@/lib/queryKeys';
import i18n from '@/i18n';
import type { Currency } from '@/types/database';

interface ExchangeRatesData {
  rates: Record<string, number>; // {"USD": 32.5, "EUR": 35.2, ...} - 1 birim = X TRY
  updated_at: string;
  source: string;
}

/**
 * Döviz kurlarını Supabase'den çeker
 */
export function useExchangeRates() {
  return useQuery({
    queryKey: queryKeys.exchangeRates.all(),
    queryFn: async (): Promise<ExchangeRatesData | null> => {
      const { data, error } = await supabase
        .from('exchange_rates')
        .select('rates, updated_at, source')
        .eq('base_currency', 'TRY')
        .single();

      if (error) {
        // Tablo yoksa veya veri yoksa null dön
        if (error.code === 'PGRST116') {
          return null;
        }
        throw error;
      }

      return data;
    },
    staleTime: 1000 * 60 * 60, // 1 saat cache (kurlar günde 1 kez güncellenir)
    gcTime: 1000 * 60 * 60 * 24, // 24 saat garbage collection
    refetchOnWindowFocus: false,
    retry: 1,
  });
}

/**
 * Belirtilen para birimindeki tutarı TRY'ye çevirir
 *
 * @param amount - Çevrilecek tutar
 * @param currency - Kaynak para birimi
 * @param rates - Kur tablosu (1 birim = X TRY formatında)
 * @returns TRY karşılığı veya null (kur bulunamazsa)
 *
 * @example
 * const tryAmount = convertToTRY(100, 'EUR', { EUR: 35.2 });
 * // Returns: 3520 (100 EUR * 35.2 = 3520 TRY)
 */
export function convertToTRY(
  amount: number,
  currency: Currency | string,
  rates: Record<string, number> | null | undefined
): number | null {
  // TRY zaten TRY, dönüşüm gerekmez
  if (currency === 'TRY') {
    return amount;
  }

  // Kurlar yoksa dönüşüm yapılamaz
  if (!rates) {
    return null;
  }

  // Bu para biriminin kuru var mı?
  const rate = rates[currency];
  if (!rate || rate <= 0) {
    return null;
  }

  // 1 [currency] = rate TRY
  return amount * rate;
}

/**
 * TRY'den belirtilen para birimine çevirir
 *
 * @param tryAmount - TRY cinsinden tutar
 * @param targetCurrency - Hedef para birimi
 * @param rates - Kur tablosu
 * @returns Hedef para birimi cinsinden tutar veya null
 */
export function convertFromTRY(
  tryAmount: number,
  targetCurrency: Currency | string,
  rates: Record<string, number> | null | undefined
): number | null {
  if (targetCurrency === 'TRY') {
    return tryAmount;
  }

  if (!rates) {
    return null;
  }

  const rate = rates[targetCurrency];
  if (!rate || rate <= 0) {
    return null;
  }

  // 1 [currency] = rate TRY → 1 TRY = 1/rate [currency]
  return tryAmount / rate;
}

/**
 * Herhangi bir para biriminden başka bir para birimine çevirir
 *
 * @param amount - Çevrilecek tutar
 * @param fromCurrency - Kaynak para birimi
 * @param toCurrency - Hedef para birimi
 * @param rates - Kur tablosu (1 birim = X TRY formatında)
 * @returns Hedef para birimi cinsinden tutar veya null
 *
 * @example
 * const usdAmount = convertCurrency(100, 'EUR', 'USD', { EUR: 50.21, USD: 43.27 });
 * // Returns: 116.04 (100 EUR → TRY → USD)
 */
export function convertCurrency(
  amount: number,
  fromCurrency: Currency | string,
  toCurrency: Currency | string,
  rates: Record<string, number> | null | undefined
): number | null {
  // Aynı para birimi, dönüşüm gerekmez
  if (fromCurrency === toCurrency) {
    return amount;
  }

  // Kurlar yoksa dönüşüm yapılamaz
  if (!rates) {
    return null;
  }

  // TRY'ye çevir
  const tryAmount = convertToTRY(amount, fromCurrency, rates);
  if (tryAmount === null) {
    return null;
  }

  // TRY'den hedef para birimine çevir
  return convertFromTRY(tryAmount, toCurrency, rates);
}

/**
 * Kur güncelleme zamanını formatlar
 *
 * @param updatedAt - ISO tarih string'i
 * @returns Formatlanmış tarih string'i (örn: "17 Oca 2026, 12:00")
 */
export function formatRateUpdateTime(updatedAt: string): string {
  try {
    const date = new Date(updatedAt);
    return date.toLocaleString(i18n.language === 'tr' ? 'tr-TR' : 'en-US', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return updatedAt;
  }
}

export default useExchangeRates;
