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
import { formatCurrency } from '@/lib/currency';
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

// ============================================================================
// "KUR BULUNAMADI" — TEK POLİTİKA
// ============================================================================

/**
 * Çapraz-para toplama akümülatörü. convertCurrency null döndüğünde kalem
 * HARİÇ TUTULUR ve `conversionIncomplete` bayrağı kalkar.
 *
 * NEDEN TEK POLİTİKA — repoda aynı durum için beş ayrı davranış yaşıyordu:
 *   `?? 0`        → bakiyeyi sıfır sayar (1.000 EUR'luk hesap toplama 0 katkı yapar)
 *   `?? balance`  → 1:1 ekler (aynı ekranın üst kartı hariç tutup uyarırken alt toplam içerir)
 *   `?? v`        → ham TRY'yi baz para birimi sanır (baz USD iken 43.000 TL → "$43,000", ~43x)
 *   hariç-tut+bayrak → DOĞRU kabul edilen politika (useFinancialSummary)
 *   atla+warn     → doğru ama sessiz
 * Üçü de SESSİZCE yanlış sayı üretiyordu. Doğru olan hariç tutup bunu söylemek:
 * eksik veriyle üretilmiş bir toplam, yanlış bir toplamdan iyidir — yeter ki eksik
 * olduğu görünsün. Bu yüzden akümülatör toplamı ve bayrağı BİRLİKTE döndürüyor;
 * çağıranın bayrağı yok sayması mümkün ama artık bilinçli bir tercih olur.
 *
 * @example
 * const sum = createConversionSum(baseCurrency, rates);
 * hesaplar.forEach(h => sum.add(toNumber(h.balance), h.currency));
 * // sum.total, sum.conversionIncomplete
 */
export interface ConversionSum {
  /** Kalemi ekle. sign=-1 iade/gider gibi yönü ters kalemler için. */
  add(amount: number, fromCurrency: Currency | string | null | undefined, sign?: number): void;
  /** Çevrilebilen kalemlerin toplamı (hedef para biriminde). */
  readonly total: number;
  /** Kur bulunamadığı için hariç tutulan kalem sayısı. */
  readonly excludedCount: number;
  /** excludedCount > 0 → "bazı döviz bakiyeleri çevrilemedi" uyarısı gösterilmeli. */
  readonly conversionIncomplete: boolean;
  /**
   * Gerçekten ÇEVRİLEN (para birimi farklı olduğu için kur uygulanan) kalem sayısı.
   *
   * Neden gerekli — `exchange_rates` tablosu TEK satır tutuyor, yani TARİHSEL kur yok:
   * geçmiş bir dönemin yabancı-para kalemi BUGÜNKÜ kurla çevriliyor. Kaydın kendi
   * kuru varsa (çapraz-kur işlemi) o kur saklıdır ama dönem raporu bu çeviriyi
   * kalemin para biriminden ANA para birimine yapıyor ve orada güncel kuru kullanıyor
   * → aynı rapordaki iki sayı farklı kurlarla üretilmiş olabiliyor. Tarihsel kur
   * saklanmadan bu düzeltilemez; en azından çeviri OLDUĞUNU söyleyebiliriz.
   * TRY-only kullanıcıda 0 kalır → not hiç gösterilmez (gürültü yok).
   */
  readonly convertedCount: number;
}

export function createConversionSum(
  toCurrency: Currency | string,
  rates: Record<string, number> | null | undefined
): ConversionSum {
  let total = 0;
  let excludedCount = 0;
  let convertedCount = 0;

  return {
    add(amount, fromCurrency, sign = 1) {
      if (!isFinite(amount)) return;
      const from = fromCurrency || 'TRY';
      const converted = convertCurrency(amount, from, toCurrency, rates);
      if (converted === null) {
        excludedCount++;
        return;
      }
      if (from !== toCurrency) convertedCount++;
      total += sign * converted;
    },
    get total() {
      return total;
    },
    get excludedCount() {
      return excludedCount;
    },
    get conversionIncomplete() {
      return excludedCount > 0;
    },
    get convertedCount() {
      return convertedCount;
    },
  };
}

/**
 * RPC toplamlarını (sunucu her zaman TRY döndürür) ana para birimine çeviren dönüştürücü.
 *
 * Kalem bazlı toplamada (createConversionSum) doğru politika "hariç tut"tu; TEK bir rapor
 * toplamında hariç tutmak sayıyı sıfırlamak demek olurdu. Burada politika: çevrilebiliyorsa
 * çevir, çevrilemiyorsa HAM TRY değeri koru ama `conversionIncomplete` bayrağını kaldır —
 * çağıran ekran uyarıyı göstersin. Eskiden bayrak hiç yoktu: ana para birimi USD olan
 * kullanıcı 43.000 TL'lik geliri raporda "$43,000.00" (~43x şişik) görüyor, hiçbir uyarı
 * çıkmıyordu. Bayrağı okumanın ikinci yolu isLoading'e katmaktır (kurlar henüz yüklenmediyse
 * rapor "hazır değil" sayılır) — geçici durumda yanlış sayı hiç görünmez.
 */
export interface RpcTotalConverter {
  /** TRY tutarını ana para birimine çevir (baz TRY ise no-op). */
  conv(value: number): number;
  /** En az bir çevirme başarısız oldu → uyarı gösterilmeli. */
  readonly conversionIncomplete: boolean;
}

export function createRpcTotalConverter(
  baseCurrency: Currency | string,
  rates: Record<string, number> | null | undefined
): RpcTotalConverter {
  let incomplete = false;
  return {
    conv(value: number) {
      if (baseCurrency === 'TRY') return value;
      const converted = convertCurrency(value, 'TRY', baseCurrency, rates);
      if (converted === null) {
        incomplete = true;
        return value;
      }
      return converted;
    },
    get conversionIncomplete() {
      return incomplete;
    },
  };
}

/**
 * "≈ ₺1.234,56" karşılık ipucu metni — çevrilemiyorsa **null**.
 *
 * Çağıran null'da satırı HİÇ render etmemeli. Eski kalıp `?? 0` idi: kuru bulunamayan
 * 1.000 EUR'luk bakiyenin karşılığı "~₺0,00" yazıyordu, yani sıfır olmayan bir bakiye
 * ekranda sıfır görünüyordu (dört yüzeyde: ana sayfa hesap satırı, cariler, personel,
 * hesap detay kartı).
 */
export function formatConvertedHint(
  amount: number,
  fromCurrency: Currency | string | null | undefined,
  toCurrency: Currency | string,
  rates: Record<string, number> | null | undefined,
  prefix = '~'
): string | null {
  if (!fromCurrency || fromCurrency === toCurrency) return null;
  const converted = convertCurrency(amount, fromCurrency, toCurrency, rates);
  if (converted === null) return null;
  return `${prefix}${formatCurrency(converted, toCurrency)}`;
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
