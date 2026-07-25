// upperTr artık dile duyarlı → testte dili değiştirebilmek için i18next mock'lanır
jest.mock('i18next', () => ({ language: 'tr' }));

import i18n from 'i18next';
import { upperTr, upperTrData, textIncludes, normalizeTurkish, searchMatchesTr } from '../turkishTextUtils';

function setLanguage(lang: string) {
  (i18n as unknown as { language: string }).language = lang;
}

// Her test Türkçe arayüzden başlar; dil-duyarlılık testleri kendi dilini kurar
beforeEach(() => setLanguage('tr'));

describe('upperTr — Türkçe-doğru büyük harf', () => {
  it('küçük i → İ (noktalı), ı → I (noktasız)', () => {
    expect(upperTr('Cari')).toBe('CARİ');
    expect(upperTr('Nakit')).toBe('NAKİT');
    expect(upperTr('Gelir')).toBe('GELİR');
    expect(upperTr('Gider')).toBe('GİDER');
    expect(upperTr('Giriş')).toBe('GİRİŞ');
    expect(upperTr('Varlıklar')).toBe('VARLIKLAR'); // ı → I
    expect(upperTr('Çıkış')).toBe('ÇIKIŞ');
  });

  it('diğer Türkçe harfleri de doğru büyütür (ç/ş/ğ/ö/ü)', () => {
    expect(upperTr('Müşteri')).toBe('MÜŞTERİ');
    expect(upperTr('Tedarikçi')).toBe('TEDARİKÇİ');
    expect(upperTr('Değer')).toBe('DEĞER');
    expect(upperTr('Öde')).toBe('ÖDE');
  });

  it('zaten büyük / karışık girişte İ-noktasını korur (idempotent)', () => {
    expect(upperTr('GELİR')).toBe('GELİR');
    expect(upperTr(upperTr('Cari Adı'))).toBe('CARİ ADI');
    expect(upperTr('Not (Opsiyonel)')).toBe('NOT (OPSİYONEL)');
  });

  it('boş metin sorun çıkarmaz', () => {
    expect(upperTr('')).toBe('');
  });
});

describe('upperTr — dil duyarlılığı (t() çıkışını sarıyor)', () => {
  it('dil "en" iken standart büyütme: noktalı İ ÜRETMEZ', () => {
    setLanguage('en');
    expect(upperTr('Note (Optional)')).toBe('NOTE (OPTIONAL)');
    expect(upperTr('Daily')).toBe('DAILY');
    expect(upperTr('Quantity')).toBe('QUANTITY');
    expect(upperTr('Confirm Password')).toBe('CONFIRM PASSWORD');
  });

  it('dil "tr" iken Türkçe kural sürer', () => {
    setLanguage('tr');
    expect(upperTr('istanbul')).toBe('İSTANBUL');
    expect(upperTr('ISPARTA')).toBe('ISPARTA'); // noktasız I korunur
    expect(upperTr('ısırgan')).toBe('ISIRGAN'); // ı → I
  });

  it('bölgesel kod "tr-TR" de Türkçe sayılır', () => {
    setLanguage('tr-TR');
    expect(upperTr('istanbul')).toBe('İSTANBUL');
  });
});

// REGRESYON KALKANI: upperTrData ASLA dile duyarlı yapılmamalı — yapılırsa aynı
// kategori adı iki dilde iki farklı string olur ve kayıt ikilenir (kategoriler/ekle).
describe('upperTrData — dilden BAĞIMSIZ olmalı (kategori ikilenmesi regresyonu)', () => {
  it('hem tr hem en dilinde aynı sonucu verir', () => {
    setLanguage('tr');
    expect(upperTrData('istanbul')).toBe('İSTANBUL');
    setLanguage('en');
    expect(upperTrData('istanbul')).toBe('İSTANBUL');
  });

  it('noktasız ı → I kuralı dilden bağımsız', () => {
    setLanguage('en');
    expect(upperTrData('ısırgan')).toBe('ISIRGAN');
    expect(upperTrData('Müşteri')).toBe('MÜŞTERİ');
  });
});

// Var olan yardımcıların hâlâ çalıştığına dair sağlık kontrolü (regresyon kalkanı)
describe('turkishTextUtils — mevcut yardımcılar', () => {
  it('textIncludes Türkçe-katlamalı arar', () => {
    expect(textIncludes('DİĞER', 'dig')).toBe(true);
    expect(textIncludes('Ahmet', 'zzz')).toBe(false);
    expect(textIncludes('herhangi', '')).toBe(true); // boş sorgu = filtre yok
  });

  it('normalizeTurkish aksanı katlar', () => {
    expect(normalizeTurkish('DOMATES SALÇASI')).toBe('domates salcasi');
  });
});

describe('searchMatchesTr — çok-kelimeli, sıra-bağımsız arama', () => {
  it('yazımı süren son token substring eşleşir (textIncludes davranışı)', () => {
    expect(searchMatchesTr('Ser Gıda', 'ser')).toBe(true);
    expect(searchMatchesTr('Serdar Gıda', 'ser')).toBe(true);
    expect(searchMatchesTr('DİĞER', 'dig')).toBe(true);
  });

  it('sondaki boşluk = kelime bitti → tam kelime eşleşmesi', () => {
    expect(searchMatchesTr('Ser Gıda', 'ser ')).toBe(true);
    expect(searchMatchesTr('Serdar Gıda', 'ser ')).toBe(false); // asıl istek
    expect(searchMatchesTr('Serdar Gıda', 'serdar ')).toBe(true);
  });

  it('kelime sırası önemsiz (her token bir yerde eşleşmeli)', () => {
    expect(searchMatchesTr('Serdar Gıda', 'gıda serdar')).toBe(true); // asıl istek
    expect(searchMatchesTr('Serdar Gıda', 'serdar gıda')).toBe(true);
    expect(searchMatchesTr('Ser Gıda', 'gıda serdar')).toBe(false);
  });

  it('ara token tam kelime, son token prefix: "ser g" Serdar\'ı elemeli', () => {
    expect(searchMatchesTr('Ser Gıda', 'ser g')).toBe(true);
    expect(searchMatchesTr('Serdar Gıda', 'ser g')).toBe(false);
    expect(searchMatchesTr('Serdar Gıda', 'serdar g')).toBe(true);
  });

  it('Türkçe katlama korunur', () => {
    expect(searchMatchesTr('Serdar GIDA', 'gıda ')).toBe(true);
    expect(searchMatchesTr('Serdar Gıda', 'GIDA SERDAR')).toBe(true);
  });

  it('boş/whitespace sorgu her zaman eşleşir', () => {
    expect(searchMatchesTr('herhangi', '')).toBe(true);
    expect(searchMatchesTr('herhangi', '   ')).toBe(true);
    expect(searchMatchesTr(null, 'x')).toBe(false);
  });
});
