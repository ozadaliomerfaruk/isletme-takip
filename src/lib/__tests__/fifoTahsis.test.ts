import { fifoTahsisEt, borcKalan, AcikBorc } from '../fifoTahsis';
import { roundCurrency } from '../currency';

const borc = (
  islemId: string,
  vadeTarihi: string,
  kalan: number,
  currency = 'TRY',
  taksitId: string | null = null,
): AcikBorc => ({ islemId, vadeTarihi, kalan, currency, taksitId });

// Kuruş-doğru toplam: her adım roundCurrency'li — ham float reduce IEEE artığı biriktirir
// (30×33.33 → +4e-13), o artık motorun değil toplamanın hatasıdır.
const toplam = (r: { tahsisler: { tutar: number }[] }) =>
  r.tahsisler.reduce((s, t) => roundCurrency(s + t.tutar), 0);

describe('fifoTahsisEt — temel FIFO', () => {
  it('en eski vadeden başlayarak sırayla doldurur', () => {
    const r = fifoTahsisEt({
      acikBorclar: [
        borc('b-yeni', '2026-08-01', 500),
        borc('b-eski', '2026-07-01', 300),
        borc('b-orta', '2026-07-15', 200),
      ],
      odemeTutari: 600,
      odemeCurrency: 'TRY',
    });
    expect(r.tahsisler).toEqual([
      { islemId: 'b-eski', taksitId: null, tutar: 300 },
      { islemId: 'b-orta', taksitId: null, tutar: 200 },
      { islemId: 'b-yeni', taksitId: null, tutar: 100 },
    ]);
    expect(r.avans).toBe(0);
  });

  it('kısmi tahsiste borç kapanmaz, ödeme biter', () => {
    const r = fifoTahsisEt({
      acikBorclar: [borc('b1', '2026-07-01', 1000)],
      odemeTutari: 250,
      odemeCurrency: 'TRY',
    });
    expect(r.tahsisler).toEqual([{ islemId: 'b1', taksitId: null, tutar: 250 }]);
    expect(borcKalan(1000, 250)).toBe(750);
  });

  it('borçlar bitince artan avansa döner', () => {
    const r = fifoTahsisEt({
      acikBorclar: [borc('b1', '2026-07-01', 100), borc('b2', '2026-07-02', 50)],
      odemeTutari: 400,
      odemeCurrency: 'TRY',
    });
    expect(toplam(r)).toBe(150);
    expect(r.avans).toBe(250);
  });

  it('açık borç yoksa tamamı avans', () => {
    const r = fifoTahsisEt({ acikBorclar: [], odemeTutari: 100, odemeCurrency: 'TRY' });
    expect(r.tahsisler).toEqual([]);
    expect(r.avans).toBe(100);
  });

  it('aynı vadede girdi sırası korunur (stable)', () => {
    const r = fifoTahsisEt({
      acikBorclar: [borc('once', '2026-07-01', 100), borc('sonra', '2026-07-01', 100)],
      odemeTutari: 150,
      odemeCurrency: 'TRY',
    });
    expect(r.tahsisler.map((t) => t.islemId)).toEqual(['once', 'sonra']);
  });
});

describe('fifoTahsisEt — hedef override (plan §3.1)', () => {
  it('hedef borca önce tahsis eder, artan FIFO ile devam eder', () => {
    const r = fifoTahsisEt({
      acikBorclar: [
        borc('b-eski', '2026-07-01', 300),
        borc('b-hedef', '2026-08-01', 200),
      ],
      odemeTutari: 400,
      odemeCurrency: 'TRY',
      hedef: { islemId: 'b-hedef' },
    });
    expect(r.tahsisler).toEqual([
      { islemId: 'b-hedef', taksitId: null, tutar: 200 },
      { islemId: 'b-eski', taksitId: null, tutar: 200 },
    ]);
  });

  it('hedef listede yoksa (kapalı/yanlış id) sessizce salt-FIFO davranır', () => {
    const r = fifoTahsisEt({
      acikBorclar: [borc('b1', '2026-07-01', 100)],
      odemeTutari: 100,
      odemeCurrency: 'TRY',
      hedef: { islemId: 'yok-boyle-borc' },
    });
    expect(r.tahsisler).toEqual([{ islemId: 'b1', taksitId: null, tutar: 100 }]);
  });

  it('taksit hedefi taksitId ile eşleşir; aynı işlemin diğer taksiti hedef sayılmaz', () => {
    const r = fifoTahsisEt({
      acikBorclar: [
        borc('plan-islem', '2026-07-01', 100, 'TRY', 'taksit-1'),
        borc('plan-islem', '2026-08-01', 100, 'TRY', 'taksit-2'),
      ],
      odemeTutari: 100,
      odemeCurrency: 'TRY',
      hedef: { islemId: 'plan-islem', taksitId: 'taksit-2' },
    });
    expect(r.tahsisler).toEqual([{ islemId: 'plan-islem', taksitId: 'taksit-2', tutar: 100 }]);
  });
});

describe('fifoTahsisEt — para birimi disiplini', () => {
  it('farklı para birimli borçlara ASLA tahsis etmez (çapraz-para yasak)', () => {
    const r = fifoTahsisEt({
      acikBorclar: [
        borc('b-usd', '2026-07-01', 100, 'USD'),
        borc('b-try', '2026-08-01', 100, 'TRY'),
      ],
      odemeTutari: 150,
      odemeCurrency: 'TRY',
    });
    expect(r.tahsisler).toEqual([{ islemId: 'b-try', taksitId: null, tutar: 100 }]);
    expect(r.avans).toBe(50);
  });
});

describe('fifoTahsisEt — kuruş ve sınır durumları', () => {
  it('float artıkları kuruşa yuvarlanır (0.1+0.2 sınıfı)', () => {
    const r = fifoTahsisEt({
      acikBorclar: [borc('b1', '2026-07-01', 0.3)],
      odemeTutari: 0.1 + 0.2, // 0.30000000000000004
      odemeCurrency: 'TRY',
    });
    expect(r.tahsisler).toEqual([{ islemId: 'b1', taksitId: null, tutar: 0.3 }]);
    expect(r.avans).toBe(0);
  });

  it('binlerce kuruşlu kısmi zincirde Σtahsis ≤ ödeme invariantı korunur', () => {
    const borclar = Array.from({ length: 50 }, (_, i) =>
      borc(`b${i}`, `2026-07-${String((i % 28) + 1).padStart(2, '0')}`, 33.33),
    );
    const r = fifoTahsisEt({ acikBorclar: borclar, odemeTutari: 1000.01, odemeCurrency: 'TRY' });
    expect(toplam(r)).toBeLessThanOrEqual(1000.01);
    expect(r.avans).toBeGreaterThanOrEqual(0);
    expect(toplam(r) + r.avans).toBeCloseTo(1000.01, 2);
    r.tahsisler.forEach((t) => expect(t.tutar).toBeGreaterThan(0));
  });

  it('sıfır/negatif ödeme no-op (avans da üretmez)', () => {
    expect(fifoTahsisEt({ acikBorclar: [borc('b1', '2026-07-01', 100)], odemeTutari: 0, odemeCurrency: 'TRY' }))
      .toEqual({ tahsisler: [], avans: 0 });
    expect(fifoTahsisEt({ acikBorclar: [borc('b1', '2026-07-01', 100)], odemeTutari: -5, odemeCurrency: 'TRY' }))
      .toEqual({ tahsisler: [], avans: 0 });
  });

  it('kalan ≤ 0 borçlar (zaten kapalı) atlanır', () => {
    const r = fifoTahsisEt({
      acikBorclar: [borc('kapali', '2026-07-01', 0), borc('acik', '2026-08-01', 100)],
      odemeTutari: 50,
      odemeCurrency: 'TRY',
    });
    expect(r.tahsisler).toEqual([{ islemId: 'acik', taksitId: null, tutar: 50 }]);
  });

  it('girdi dizisini mutasyona uğratmaz (saf fonksiyon)', () => {
    const girdi = [borc('b1', '2026-07-01', 100)];
    fifoTahsisEt({ acikBorclar: girdi, odemeTutari: 60, odemeCurrency: 'TRY' });
    expect(girdi[0].kalan).toBe(100);
  });
});

describe('borcKalan', () => {
  it('negatife inmez ve kuruşa yuvarlar', () => {
    expect(borcKalan(100, 100.004)).toBe(0);
    expect(borcKalan(100, 30.555)).toBe(69.44); // 30.555→30.56 (banker değil, yarım-yukarı)
    expect(borcKalan(50, 80)).toBe(0);
  });
});
