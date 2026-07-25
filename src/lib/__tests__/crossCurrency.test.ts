/**
 * Çapraz-kur bacak çözümü — PARA YAZMA YOLU testleri.
 *
 * Neden bu testler var: source_currency/target_currency/exchange_rate üçlüsü eksik
 * yazıldığında calculateTargetAmount iki bacağı da TRY sayıp tutarı 1:1 uyguluyor
 * (islemBalanceOps.ts `|| 'TRY'`). Yani "kur sorulmalı mıydı?" sorusunun cevabı
 * yanlışsa sonuç sessiz ve KALICI bakiye bozulması. Bu yüzden resolveIslemLegs'in
 * tip listesi computeBalanceOps ile birebir kalmalı — aşağıdaki testler o eşleşmeyi
 * kod okumaya bırakmıyor, kilitliyor.
 */

import {
  resolveIslemLegs,
  CONVERTING_ISLEM_TYPES,
  CrossCurrencyRateRequiredError,
  isCrossCurrencyRateRequiredError,
} from '../crossCurrency';
import { computeBalanceOps } from '../islemBalanceOps';
import { IslemType } from '@/types/database';

describe('resolveIslemLegs — çeviri uygulanan tipler', () => {
  it('transfer: kaynak hesap → hedef hesap', () => {
    const legs = resolveIslemLegs('transfer', {
      hesapCurrency: 'TRY',
      hedefHesapCurrency: 'USD',
    });
    expect(legs).toEqual({ sourceCurrency: 'TRY', targetCurrency: 'USD', isCross: true });
  });

  it('cari_odeme: hesap → cari (kredi kartı barının sessiz 1:1 hatası)', () => {
    const legs = resolveIslemLegs('cari_odeme', {
      hesapCurrency: 'TRY',
      cariCurrency: 'USD',
    });
    expect(legs).toEqual({ sourceCurrency: 'TRY', targetCurrency: 'USD', isCross: true });
  });

  it('cari_tahsilat: hesap → cari', () => {
    expect(resolveIslemLegs('cari_tahsilat', { hesapCurrency: 'EUR', cariCurrency: 'EUR' })).toEqual(
      { sourceCurrency: 'EUR', targetCurrency: 'EUR', isCross: false }
    );
  });

  it('personel_odeme: hesap → personel (toplu ödemenin engellediği durum)', () => {
    const legs = resolveIslemLegs('personel_odeme', {
      hesapCurrency: 'TRY',
      personelCurrency: 'EUR',
    });
    expect(legs).toEqual({ sourceCurrency: 'TRY', targetCurrency: 'EUR', isCross: true });
  });

  it('personel_tahsilat: hesap → personel', () => {
    const legs = resolveIslemLegs('personel_tahsilat', {
      hesapCurrency: 'USD',
      personelCurrency: 'TRY',
    });
    expect(legs.isCross).toBe(true);
  });

  it('bacak para birimi yoksa TRY varsayılır (DB varsayılanıyla aynı)', () => {
    expect(resolveIslemLegs('transfer', {})).toEqual({
      sourceCurrency: 'TRY',
      targetCurrency: 'TRY',
      isCross: false,
    });
  });
});

describe('resolveIslemLegs — çeviri UYGULANMAYAN tipler kur sormaz', () => {
  // cari_alis/cari_satis'te hesap bacağı YOK: tutar carinin para biriminde okunuyor,
  // computeBalanceOps ham amount'u uyguluyor. Bu tiplerde kur barı açmak kullanıcıya
  // anlamsız bir soru sormak (ve gereksiz bir kur yazmak) olurdu.
  it('cari_alis: tek bacak = cari para birimi, isCross false', () => {
    expect(resolveIslemLegs('cari_alis', { hesapCurrency: 'TRY', cariCurrency: 'USD' })).toEqual({
      sourceCurrency: 'USD',
      targetCurrency: 'USD',
      isCross: false,
    });
  });

  it('cari_satis / iadeler de aynı', () => {
    for (const type of ['cari_satis', 'cari_alis_iade', 'cari_satis_iade'] as IslemType[]) {
      expect(resolveIslemLegs(type, { hesapCurrency: 'TRY', cariCurrency: 'EUR' }).isCross).toBe(
        false
      );
    }
  });

  it('personel_gider / personel_satis: personel para birimi, isCross false', () => {
    for (const type of ['personel_gider', 'personel_satis'] as IslemType[]) {
      expect(
        resolveIslemLegs(type, { hesapCurrency: 'TRY', personelCurrency: 'GBP' })
      ).toEqual({ sourceCurrency: 'GBP', targetCurrency: 'GBP', isCross: false });
    }
  });

  it('gelir / gider: yalnız hesap bacağı', () => {
    for (const type of ['gelir', 'gider'] as IslemType[]) {
      expect(resolveIslemLegs(type, { hesapCurrency: 'USD' })).toEqual({
        sourceCurrency: 'USD',
        targetCurrency: 'USD',
        isCross: false,
      });
    }
  });

  it('tip yoksa çökmez', () => {
    expect(resolveIslemLegs(null, { hesapCurrency: 'USD' }).isCross).toBe(false);
    expect(resolveIslemLegs(undefined, {}).sourceCurrency).toBe('TRY');
  });
});

describe('CONVERTING_ISLEM_TYPES ↔ computeBalanceOps eşleşmesi', () => {
  // TEK GERÇEK KAYNAK KİLİDİ: bir tip computeBalanceOps'ta kur çeviriyorsa (yani
  // kursuz çağrıda THROW ediyorsa) CONVERTING_ISLEM_TYPES'ta OLMAK ZORUNDA. Aksi
  // halde yazma yüzeyi kur sormaz, bakiye 1:1 bozulur. Ters yönü de doğruluyoruz:
  // listede olup çevirmeyen bir tip gereksiz kur barı açar.
  const ALL_TYPES: IslemType[] = [
    'gelir',
    'gider',
    'transfer',
    'cari_alis',
    'cari_satis',
    'cari_odeme',
    'cari_tahsilat',
    'cari_alis_iade',
    'cari_satis_iade',
    'personel_gider',
    'personel_satis',
    'personel_odeme',
    'personel_tahsilat',
  ];

  /** Kursuz + farklı para birimleriyle çağırınca throw ediyorsa o tip çeviri yapıyor. */
  const convertsCurrency = (type: IslemType): boolean => {
    try {
      computeBalanceOps({
        type,
        amount: 100,
        exchange_rate: null,
        source_currency: 'TRY',
        target_currency: 'USD',
        hesap_id: 'h1',
        hedef_hesap_id: 'h2',
        cari_id: 'c1',
        personel_id: 'p1',
      });
      return false;
    } catch {
      return true;
    }
  };

  it.each(ALL_TYPES)('%s: liste ile bakiye motoru aynı şeyi söylüyor', (type) => {
    expect(CONVERTING_ISLEM_TYPES.includes(type)).toBe(convertsCurrency(type));
  });

  it('liste tam olarak beş tip (yeni tip eklenirse bu test uyandırır)', () => {
    expect([...CONVERTING_ISLEM_TYPES].sort()).toEqual([
      'cari_odeme',
      'cari_tahsilat',
      'personel_odeme',
      'personel_tahsilat',
      'transfer',
    ]);
  });
});

describe('CrossCurrencyRateRequiredError', () => {
  it('taraf bilgisini taşır (çağıran ekran ExchangeRateBar açabilsin)', () => {
    const err = new CrossCurrencyRateRequiredError('TRY', 'USD', 1500);
    expect(err.sourceCurrency).toBe('TRY');
    expect(err.targetCurrency).toBe('USD');
    expect(err.sourceAmount).toBe(1500);
    expect(isCrossCurrencyRateRequiredError(err)).toBe(true);
  });

  it('başka hatalarla karışmaz', () => {
    expect(isCrossCurrencyRateRequiredError(new Error('boom'))).toBe(false);
    expect(isCrossCurrencyRateRequiredError(null)).toBe(false);
    expect(isCrossCurrencyRateRequiredError('CROSS_CURRENCY_RATE_REQUIRED')).toBe(false);
  });
});
