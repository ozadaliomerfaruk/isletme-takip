import { upperTr, textIncludes, normalizeTurkish } from '../turkishTextUtils';

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
