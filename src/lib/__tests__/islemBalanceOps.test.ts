import { computeBalanceOps, reverseBalanceOps, BalanceOp } from '../islemBalanceOps';

const H = 'hesap-1';
const H2 = 'hedef-1';
const C = 'cari-1';
const P = 'personel-1';

// Aynı para birimi (TRY→TRY, rate yok) → converted() = amount.
const base = { amount: 100, source_currency: 'TRY', target_currency: 'TRY' as string | null };

function ops(t: Partial<Parameters<typeof computeBalanceOps>[0]>): BalanceOp[] {
  return computeBalanceOps({ ...base, ...t } as Parameters<typeof computeBalanceOps>[0]);
}

describe('computeBalanceOps — tek taraflı tipler', () => {
  it('gelir → hesap +amount', () => {
    expect(ops({ type: 'gelir', hesap_id: H })).toEqual([{ t: 'hesaplar', id: H, d: 100 }]);
  });
  it('gider → hesap -amount', () => {
    expect(ops({ type: 'gider', hesap_id: H })).toEqual([{ t: 'hesaplar', id: H, d: -100 }]);
  });
  it('cari_alis → cari -amount (borcumuz artar)', () => {
    expect(ops({ type: 'cari_alis', cari_id: C })).toEqual([{ t: 'cariler', id: C, d: -100 }]);
  });
  it('cari_satis → cari +amount (alacağımız artar)', () => {
    expect(ops({ type: 'cari_satis', cari_id: C })).toEqual([{ t: 'cariler', id: C, d: 100 }]);
  });
  it('cari_alis_iade → cari +amount (borcumuz azalır)', () => {
    expect(ops({ type: 'cari_alis_iade', cari_id: C })).toEqual([{ t: 'cariler', id: C, d: 100 }]);
  });
  it('cari_satis_iade → cari -amount (alacağımız azalır)', () => {
    expect(ops({ type: 'cari_satis_iade', cari_id: C })).toEqual([{ t: 'cariler', id: C, d: -100 }]);
  });
  it('personel_gider → personel -amount', () => {
    expect(ops({ type: 'personel_gider', personel_id: P })).toEqual([{ t: 'personel', id: P, d: -100 }]);
  });
  it('personel_satis → personel +amount', () => {
    expect(ops({ type: 'personel_satis', personel_id: P })).toEqual([{ t: 'personel', id: P, d: 100 }]);
  });
});

describe('computeBalanceOps — çift taraflı tipler (aynı para birimi)', () => {
  it('transfer → kaynak -amount, hedef +amount', () => {
    expect(ops({ type: 'transfer', hesap_id: H, hedef_hesap_id: H2 })).toEqual([
      { t: 'hesaplar', id: H, d: -100 },
      { t: 'hesaplar', id: H2, d: 100 },
    ]);
  });
  it('cari_odeme → cari +amount, hesap -amount', () => {
    expect(ops({ type: 'cari_odeme', cari_id: C, hesap_id: H })).toEqual([
      { t: 'cariler', id: C, d: 100 },
      { t: 'hesaplar', id: H, d: -100 },
    ]);
  });
  it('cari_tahsilat → cari -amount, hesap +amount', () => {
    expect(ops({ type: 'cari_tahsilat', cari_id: C, hesap_id: H })).toEqual([
      { t: 'cariler', id: C, d: -100 },
      { t: 'hesaplar', id: H, d: 100 },
    ]);
  });
  it('personel_odeme → personel +amount, hesap -amount', () => {
    expect(ops({ type: 'personel_odeme', personel_id: P, hesap_id: H })).toEqual([
      { t: 'personel', id: P, d: 100 },
      { t: 'hesaplar', id: H, d: -100 },
    ]);
  });
  it('personel_tahsilat → personel -amount, hesap +amount', () => {
    expect(ops({ type: 'personel_tahsilat', personel_id: P, hesap_id: H })).toEqual([
      { t: 'personel', id: P, d: -100 },
      { t: 'hesaplar', id: H, d: 100 },
    ]);
  });
});

describe('computeBalanceOps — eksik id / bakiyesiz tip', () => {
  it('id yoksa op üretilmez', () => {
    expect(ops({ type: 'gelir', hesap_id: null })).toEqual([]);
    expect(ops({ type: 'transfer', hesap_id: H, hedef_hesap_id: null })).toEqual([
      { t: 'hesaplar', id: H, d: -100 },
    ]);
  });
  it('bakiye etkilemeyen tip → boş', () => {
    expect(ops({ type: 'personel_izin_hakki', personel_id: P })).toEqual([]);
  });
});

describe('reverseBalanceOps', () => {
  it('her delta negatiflenir (reverse = -apply)', () => {
    const apply = ops({ type: 'cari_tahsilat', cari_id: C, hesap_id: H });
    expect(reverseBalanceOps(apply)).toEqual([
      { t: 'cariler', id: C, d: 100 },
      { t: 'hesaplar', id: H, d: -100 },
    ]);
  });
  it('iki kez reverse = kimlik', () => {
    const apply = ops({ type: 'transfer', hesap_id: H, hedef_hesap_id: H2 });
    expect(reverseBalanceOps(reverseBalanceOps(apply))).toEqual(apply);
  });
});
