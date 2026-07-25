/**
 * ÇAPRAZ-KUR BACAK ÇÖZÜMÜ — TEK KAYNAK
 *
 * "Bu işlem hangi iki para birimini köprülüyor?" sorusunun tek cevabı.
 *
 * NEDEN AYRI MODÜL — computeBalanceOps() (islemBalanceOps.ts) yalnız BEŞ tipte
 * calculateTargetAmount() çağırıyor: transfer'in hedef bacağı, cari_odeme,
 * cari_tahsilat, personel_odeme, personel_tahsilat. Yani source_currency /
 * target_currency / exchange_rate üçlüsü SADECE bu tiplerde bakiyeyi etkiliyor.
 * Üçlü eksikse calculateTargetAmount iki bacağı da TRY sayıp tutarı 1:1 uyguluyor
 * (islemBalanceOps.ts:45-46 `|| 'TRY'`) → TRY karttan USD tedarikçiye 1.000 TL
 * ödeme, borçtan 1.000 USD düşüyor. Bu, üç ayrı yazma yüzeyinde (QTB, kredi kartı
 * barı, ileri tarihli tamamlama) birbirinden bağımsız çözülmüş olduğu için
 * ikisinde eksikti; artık üçü de bu fonksiyonu kullanıyor.
 *
 * Bu modül SAF: hook/UI/i18n bağımlılığı yok, doğrudan jest'le sınanabilir.
 */

import { Currency, IslemType } from '@/types/database';
import { isCrossCurrency } from '@/constants/currencies';

/** Bir işlemin bakiye etkisinde kur ÇEVİRİSİ uygulanan tipler (computeBalanceOps ile birebir). */
export const CONVERTING_ISLEM_TYPES: readonly IslemType[] = [
  'transfer',
  'cari_odeme',
  'cari_tahsilat',
  'personel_odeme',
  'personel_tahsilat',
] as const;

/** İşlemin bağlı olduğu varlıkların para birimleri (hangisi dolu olduğu tipe göre değişir). */
export interface IslemLegCurrencies {
  hesapCurrency?: string | null;
  hedefHesapCurrency?: string | null;
  cariCurrency?: string | null;
  personelCurrency?: string | null;
}

export interface ResolvedLegs {
  /** Tutarın YAZILDIĞI para birimi (hesap bacağı). */
  sourceCurrency: Currency;
  /** Karşı tarafın para birimi (hedef hesap / cari / personel). */
  targetCurrency: Currency;
  /** İki bacak farklı mı — true ise exchange_rate ZORUNLU. */
  isCross: boolean;
}

/**
 * İşlem tipi + bacak para birimlerinden source/target çiftini çözer.
 *
 * Çeviri uygulanmayan tiplerde (cari_alis, cari_satis, gelir, gider, iadeler,
 * personel_gider, personel_satis) iki bacak da AYNI döner ve isCross=false olur:
 * o tiplerde tutar tek bacakta ham uygulanıyor, kur sorulmamalı.
 */
export function resolveIslemLegs(
  type: IslemType | null | undefined,
  legs: IslemLegCurrencies
): ResolvedLegs {
  const hesap = (legs.hesapCurrency || 'TRY') as Currency;
  const same = (c: Currency): ResolvedLegs => ({
    sourceCurrency: c,
    targetCurrency: c,
    isCross: false,
  });

  if (!type || !CONVERTING_ISLEM_TYPES.includes(type)) {
    // Çeviri yok: cari_alis/cari_satis gibi hesap bacağı OLMAYAN tiplerde tutar
    // karşı tarafın para biriminde okunuyor; kur alanı anlamsız.
    if (type?.startsWith('cari_')) return same((legs.cariCurrency || 'TRY') as Currency);
    if (type?.startsWith('personel_')) return same((legs.personelCurrency || 'TRY') as Currency);
    return same(hesap);
  }

  let target: Currency;
  if (type === 'transfer') {
    target = (legs.hedefHesapCurrency || 'TRY') as Currency;
  } else if (type.startsWith('cari_')) {
    target = (legs.cariCurrency || 'TRY') as Currency;
  } else {
    target = (legs.personelCurrency || 'TRY') as Currency;
  }

  return {
    sourceCurrency: hesap,
    targetCurrency: target,
    isCross: isCrossCurrency(hesap, target),
  };
}

/**
 * İleri tarihli işlem tamamlanırken kur gerekiyor ama elde yok → bu hata atılır.
 *
 * ileri_tarihli_islemler tablosunda kur kolonu YOK (planlama anında saklanamıyor),
 * bu yüzden çapraz-kurlu bir plan tamamlanırken kur TAMAMLAMA ANINDA sorulmalı.
 * Eskiden kur hiç sorulmadığı için calculateTargetAmount ham "Geçersiz döviz kuru"
 * hatası fırlatıyor, işlem hiç tamamlanamıyordu. Tipli hata sayesinde çağıran ekran
 * ExchangeRateBar'ı açıp kuru alıp tekrar deneyebiliyor.
 */
export class CrossCurrencyRateRequiredError extends Error {
  readonly sourceCurrency: Currency;
  readonly targetCurrency: Currency;
  readonly sourceAmount: number;

  constructor(sourceCurrency: Currency, targetCurrency: Currency, sourceAmount: number) {
    super(`CROSS_CURRENCY_RATE_REQUIRED:${sourceCurrency}->${targetCurrency}`);
    this.name = 'CrossCurrencyRateRequiredError';
    this.sourceCurrency = sourceCurrency;
    this.targetCurrency = targetCurrency;
    this.sourceAmount = sourceAmount;
  }
}

export function isCrossCurrencyRateRequiredError(
  err: unknown
): err is CrossCurrencyRateRequiredError {
  return err instanceof CrossCurrencyRateRequiredError;
}
