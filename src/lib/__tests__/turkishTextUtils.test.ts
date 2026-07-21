import { upperTr, textIncludes, normalizeTurkish, searchMatchesTr } from '../turkishTextUtils';

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
