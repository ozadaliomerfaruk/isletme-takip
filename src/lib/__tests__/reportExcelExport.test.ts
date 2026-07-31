/**
 * Rapor Excel'i ile EKRANIN aynı sayıyı vermesini kilitler.
 *
 * Denetimin 2. kök nedeni "aynı sayı iki motordan" idi: ekran RPC'den (çevrilmiş +
 * iadesi düşülmüş), Excel ise istemcideki ham `islemler` sorgusundan (çevrilmemiş +
 * brüt) besleniyordu. Bu testler o iki kuralı Excel tarafında kilitler.
 */

import { hesaplaKategoriVeToplam } from '../reportExcelExport';
import type { IslemWithRelations } from '@/types/database';

// 1 USD = 34 TRY (createConversionSum'ın beklediği "TRY bazlı" kur tablosu)
const RATES = { USD: 34, EUR: 36, TRY: 1 };

function islem(over: Partial<IslemWithRelations>): IslemWithRelations {
  return {
    id: Math.random().toString(36).slice(2),
    type: 'gider',
    amount: 0,
    date: '2026-07-01',
    isletme_id: 'x',
    ...over,
  } as IslemWithRelations;
}

describe('Excel kategori/toplam motoru', () => {
  it('yabancı parayı ÇEVİREREK toplar (eskiden ham topluyordu)', () => {
    const r = hesaplaKategoriVeToplam(
      [
        islem({ amount: 1000, hesap: { currency: 'TRY' } } as Partial<IslemWithRelations>),
        islem({ amount: 1000, hesap: { currency: 'USD' } } as Partial<IslemWithRelations>),
      ],
      'TRY',
      RATES
    );
    // 1000 TL + (1000 USD × 34) = 35.000 — eski davranış 2.000 idi
    expect(r.grandTotal).toBe(35000);
    expect(r.convertedCount).toBe(1);
    expect(r.excludedCount).toBe(0);
  });

  it('hesap bacağı OLMAYAN tipte para birimini cari/personelden çözer', () => {
    const r = hesaplaKategoriVeToplam(
      [
        // cari_alis'in hesap bacağı yok → eskiden ana para birimi sayılıp 1.000 TL toplanıyordu
        islem({ type: 'cari_alis', amount: 1000, cari: { currency: 'USD' } } as Partial<IslemWithRelations>),
      ],
      'TRY',
      RATES
    );
    expect(r.grandTotal).toBe(34000);
  });

  it('source_currency hesabın önüne geçer (çapraz-kur kaydı)', () => {
    const r = hesaplaKategoriVeToplam(
      [
        islem({
          amount: 100,
          source_currency: 'EUR',
          hesap: { currency: 'TRY' },
        } as Partial<IslemWithRelations>),
      ],
      'TRY',
      RATES
    );
    expect(r.grandTotal).toBe(3600);
  });

  it('İADE toplamdan DÜŞÜLÜR (eskiden brüt çıkıyordu)', () => {
    const r = hesaplaKategoriVeToplam(
      [
        islem({ type: 'cari_alis', amount: 1000, hesap: { currency: 'TRY' } } as Partial<IslemWithRelations>),
        islem({ type: 'cari_alis_iade', amount: 300, hesap: { currency: 'TRY' } } as Partial<IslemWithRelations>),
      ],
      'TRY',
      RATES
    );
    expect(r.grandTotal).toBe(700);
  });

  it('kategori satırı da net ve çevrilmiş — kırılım toplamı genel toplama eşit', () => {
    const kat = { id: 'k1', name: 'KİRA' };
    const r = hesaplaKategoriVeToplam(
      [
        islem({ type: 'cari_alis', amount: 1000, kategori: kat, hesap: { currency: 'USD' } } as Partial<IslemWithRelations>),
        islem({ type: 'cari_alis_iade', amount: 100, kategori: kat, hesap: { currency: 'USD' } } as Partial<IslemWithRelations>),
      ],
      'TRY',
      RATES
    );
    const kirilimToplami = r.categories.reduce((s, c) => s + c.total, 0);
    expect(kirilimToplami).toBeCloseTo(r.grandTotal, 6);
    expect(r.grandTotal).toBe(900 * 34);
  });

  it('kuru bulunamayan kalem toplama KATILMAZ ve sayılır (sessiz 1:1 yok)', () => {
    const r = hesaplaKategoriVeToplam(
      [
        islem({ amount: 1000, hesap: { currency: 'TRY' } } as Partial<IslemWithRelations>),
        islem({ amount: 500, hesap: { currency: 'GBP' } } as Partial<IslemWithRelations>),
      ],
      'TRY',
      RATES
    );
    expect(r.grandTotal).toBe(1000);
    expect(r.excludedCount).toBe(1);
  });

  it('tek para birimli TRY dönemde davranış değişmez (regresyon koruması)', () => {
    const r = hesaplaKategoriVeToplam(
      [
        islem({ amount: 1000, hesap: { currency: 'TRY' } } as Partial<IslemWithRelations>),
        islem({ amount: 250, hesap: { currency: 'TRY' } } as Partial<IslemWithRelations>),
      ],
      'TRY',
      RATES
    );
    expect(r.grandTotal).toBe(1250);
    expect(r.convertedCount).toBe(0);
    expect(r.excludedCount).toBe(0);
  });
});
