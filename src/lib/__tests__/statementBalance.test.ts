import {
  getHesapDebitCredit,
  getCariDebitCredit,
  getPersonelDebitCredit,
  calculateHesapOpeningBalance,
  calculateCariOpeningBalance,
  calculatePersonelOpeningBalance,
} from '../excelExport';
import { IslemWithRelations } from '@/types/database';

// Ekstre (PDF/Excel) borç-alacak yönü + açılış/yürüyen bakiye mantığı.
// 1 Tem'de PDF yürüyen bakiyede gerçek bug çıkmıştı; bu testler o mantığı kilitler.
// Yardımcılar saf ve export'lu; hepsi tek-para-birimi (TRY→TRY) senaryosuyla.

const ISL = 'isletme-1';
const mk = (p: Partial<IslemWithRelations>): IslemWithRelations =>
  ({
    id: 'x',
    isletme_id: ISL,
    amount: 0,
    date: '2025-06-10',
    source_currency: 'TRY',
    target_currency: 'TRY',
    exchange_rate: null,
    hesap_id: null,
    hedef_hesap_id: null,
    cari_id: null,
    personel_id: null,
    ...p,
  } as unknown as IslemWithRelations);

describe('getHesapDebitCredit — hesabı ARTIRAN tipler ALACAK (credit), AZALTAN BORÇ (debit)', () => {
  const H = 'hesap-1';
  it.each([
    ['gelir', 'credit'],
    ['cari_tahsilat', 'credit'],
    ['personel_tahsilat', 'credit'],
    ['cari_satis', 'credit'],
    ['cari_alis_iade', 'credit'],
    ['personel_satis', 'credit'],
    ['gider', 'debit'],
    ['cari_odeme', 'debit'],
    ['personel_odeme', 'debit'],
    ['cari_alis', 'debit'],
    ['cari_satis_iade', 'debit'],
    ['personel_gider', 'debit'],
  ] as const)('%s → %s', (type, side) => {
    const dc = getHesapDebitCredit(mk({ type, amount: 100, hesap_id: H }), H);
    if (side === 'credit') expect(dc).toEqual({ debit: null, credit: 100 });
    else expect(dc).toEqual({ debit: 100, credit: null });
  });

  it('transfer KAYNAK hesapta çıkış (debit)', () => {
    expect(getHesapDebitCredit(mk({ type: 'transfer', amount: 100, hesap_id: H, hedef_hesap_id: 'hesap-2' }), H))
      .toEqual({ debit: 100, credit: null });
  });

  it('transfer HEDEF hesapta giriş (credit), aynı para birimi', () => {
    expect(getHesapDebitCredit(mk({ type: 'transfer', amount: 100, hesap_id: 'hesap-2', hedef_hesap_id: H }), H))
      .toEqual({ debit: null, credit: 100 });
  });
});

describe('getCariDebitCredit — tek eşleme (cari tipinden bağımsız)', () => {
  it.each([
    ['cari_satis', 'debit'],     // alacağımız arttı
    ['cari_alis_iade', 'debit'], // borcumuz azaldı
    ['cari_odeme', 'debit'],     // borcumuzu ödedik
    ['cari_alis', 'credit'],     // borcumuz arttı
    ['cari_satis_iade', 'credit'], // alacağımız azaldı
    ['cari_tahsilat', 'credit'], // alacağımızı tahsil ettik
  ] as const)('%s → %s', (type, side) => {
    const dc = getCariDebitCredit(mk({ type, amount: 100 }), 'musteri');
    if (side === 'debit') expect(dc).toEqual({ debit: 100, credit: null });
    else expect(dc).toEqual({ debit: null, credit: 100 });
  });
});

describe('getPersonelDebitCredit', () => {
  it.each([
    ['personel_gider', 'credit'],   // biz borçlandık
    ['personel_tahsilat', 'credit'],
    ['personel_odeme', 'debit'],    // ödedik
    ['personel_satis', 'debit'],    // personel bize borçlandı
  ] as const)('%s → %s', (type, side) => {
    const dc = getPersonelDebitCredit(mk({ type, amount: 100 }));
    if (side === 'debit') expect(dc).toEqual({ debit: 100, credit: null });
    else expect(dc).toEqual({ debit: null, credit: 100 });
  });
});

describe('calculateHesapOpeningBalance — açılış = (currentBalance − tümEtki) + dönemÖncesiEtki', () => {
  const H = 'hesap-1';
  const all = [
    mk({ type: 'gelir', amount: 500, hesap_id: H, date: '2025-05-01' }), // dönem öncesi, +500
    mk({ type: 'gelir', amount: 300, hesap_id: H, date: '2025-06-10' }), // dönem içi, +300
    mk({ type: 'gider', amount: 200, hesap_id: H, date: '2025-06-15' }), // dönem içi, -200
  ];
  it('doğru açılış bakiyesi türetir', () => {
    // tümEtki = 500+300−200 = 600; initial = 1000−600 = 400; dönemÖncesi(t1) = +500 → açılış 900
    expect(calculateHesapOpeningBalance(all, H, 1000, '2025-06-01')).toBe(900);
  });
  it('kapanış = açılış + dönem içi etki = currentBalance', () => {
    const opening = calculateHesapOpeningBalance(all, H, 1000, '2025-06-01');
    const donemIci = 300 - 200; // credit − debit
    expect(opening + donemIci).toBe(1000);
  });
});

describe('calculateCariOpeningBalance — pozitif bakiye = bize borçlu (debit artırır)', () => {
  const all = [
    mk({ type: 'cari_satis', amount: 500, date: '2025-05-01' }), // öncesi, debit +500
    mk({ type: 'cari_satis', amount: 300, date: '2025-06-10' }), // içi, +300
    mk({ type: 'cari_tahsilat', amount: 200, date: '2025-06-15' }), // içi, credit -200
  ];
  it('doğru açılış (kendi işlemi, inversion yok)', () => {
    // tümEtki = 500+300−200 = 600; initial = 1000−600 = 400; öncesi = +500 → 900
    expect(calculateCariOpeningBalance(all, 'musteri', 1000, '2025-06-01', ISL, false)).toBe(900);
  });
});

describe('calculatePersonelOpeningBalance', () => {
  const all = [
    mk({ type: 'personel_gider', amount: 500, date: '2025-05-01' }), // öncesi, credit (borç arttı) → etki -500
    mk({ type: 'personel_odeme', amount: 200, date: '2025-06-15' }), // içi, debit (ödedik) → +200
  ];
  it('doğru açılış türetir', () => {
    // tümEtki = -500 + 200 = -300; initial = currentBalance(-100) − (-300) = 200; öncesi(t1) = -500 → -300
    expect(calculatePersonelOpeningBalance(all, -100, '2025-06-01')).toBe(-300);
  });
});
