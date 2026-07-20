import { roundCurrency } from './currency';

/**
 * FIFO tahsis motoru — SAF fonksiyon (Taksit/Vade planı §3).
 *
 * Bir ödeme/tahsilat tutarını, carinin AÇIK vadeli borçlarına "en eski vade önce"
 * kuralıyla dağıtır. Kısmi tahsis desteklenir; opsiyonel hedef borç önceliklidir;
 * artan kısım "avans" (tahsis edilmemiş) olarak döner.
 *
 * KRİTİK İLKELER (plan §3 + §8):
 * - Bu fonksiyon `cariler.balance`'a DOKUNMAZ — yalnız hangi borcun kapandığını işaretler.
 *   Bakiye matematiği (computeBalanceOps) değişmez; tahsis paralel bir görüntü katmanıdır.
 * - HAM (owner-canonical) tutarlarla çalışır — viewer inversiyonu YALNIZ gösterim
 *   katmanındadır, tahsis hesabına asla girmez (plan §3 Fable düzeltmesi).
 * - Çapraz-para tahsis YASAK: ödeme yalnız KENDİ para birimindeki borçlara tahsis
 *   edilir (kur belirsizliği para kaybettirir). Farklı para birimli borçlar atlanır.
 * - Determinizm: vade eşitliğinde sıra girdinin sırasıyla korunur (stable). SQL
 *   tarafı aynı determinizmi ORDER BY vade_tarihi, created_at, id ile sağlar.
 *
 * Invariant'lar (her çıktıda garantili):
 * - Σtahsis ≤ odemeTutari  ve  avans = odemeTutari − Σtahsis ≥ 0
 * - her tahsis.tutar > 0  ve  tahsis.tutar ≤ ilgili borcun kalanı
 * - tüm tutarlar kuruşa yuvarlanır (roundCurrency)
 */

export interface AcikBorc {
  /** Borç işleminin id'si (islemler.id) */
  islemId: string;
  /** Taksit-bazlı tahsiste taksit satırı (plan §2.2, nullable — Faz 3'te dolar) */
  taksitId?: string | null;
  /** Vade tarihi, YYYY-MM-DD (lexicographic sıralama = kronolojik) */
  vadeTarihi: string;
  /** Borcun tahsis edilmemiş kalanı: amount − Σmevcut-tahsis. ≤0 olanlar atlanır. */
  kalan: number;
  /** Borç işleminin para birimi (ör. 'TRY') */
  currency: string;
}

export interface Tahsis {
  islemId: string;
  taksitId: string | null;
  tutar: number;
}

export interface FifoSonuc {
  tahsisler: Tahsis[];
  /** Hiçbir açık borca tahsis edilemeyen kısım (avans / tahsis edilmemiş) */
  avans: number;
}

export interface FifoGirdi {
  /** Açık borçlar — sıra önemli değil, fonksiyon vade artan sıralar (stable) */
  acikBorclar: AcikBorc[];
  /** Ödeme/tahsilat tutarı (HAM, pozitif) */
  odemeTutari: number;
  /** Ödemenin para birimi — yalnız aynı para birimli borçlara tahsis edilir */
  odemeCurrency: string;
  /**
   * Opsiyonel hedef: önce bu borca (kalanına kadar) tahsis edilir, artan FIFO'ya
   * döner (plan §3.1). Taksit hedeflerken taksitId ile eşleşir.
   */
  hedef?: { islemId: string; taksitId?: string | null } | null;
}

function ayniHedef(borc: AcikBorc, hedef: { islemId: string; taksitId?: string | null }): boolean {
  return (
    borc.islemId === hedef.islemId && (borc.taksitId ?? null) === (hedef.taksitId ?? null)
  );
}

export function fifoTahsisEt({ acikBorclar, odemeTutari, odemeCurrency, hedef }: FifoGirdi): FifoSonuc {
  const odeme = roundCurrency(odemeTutari);
  if (!(odeme > 0)) {
    // Geçersiz/negatif tutar: hiçbir şey tahsis etme; avans da üretme (no-op).
    return { tahsisler: [], avans: 0 };
  }

  // Yalnız aynı para birimli + gerçekten açık borçlar; vade artan, eşitlikte stable.
  const uygunlar = acikBorclar
    .map((b) => ({ ...b, kalan: roundCurrency(b.kalan) }))
    .filter((b) => b.kalan > 0 && b.currency === odemeCurrency)
    .sort((a, b) => (a.vadeTarihi < b.vadeTarihi ? -1 : a.vadeTarihi > b.vadeTarihi ? 1 : 0));

  const tahsisler: Tahsis[] = [];
  let kalanOdeme = odeme;

  const tahsisYap = (borc: AcikBorc & { kalan: number }) => {
    if (kalanOdeme <= 0 || borc.kalan <= 0) return;
    const tutar = roundCurrency(Math.min(kalanOdeme, borc.kalan));
    if (tutar <= 0) return;
    tahsisler.push({ islemId: borc.islemId, taksitId: borc.taksitId ?? null, tutar });
    kalanOdeme = roundCurrency(kalanOdeme - tutar);
    borc.kalan = roundCurrency(borc.kalan - tutar);
  };

  // 1) Hedef önceliği (varsa ve uygun listede ise — kapalı/yanlış-para hedef sessizce FIFO'ya düşer)
  if (hedef) {
    const hedefBorc = uygunlar.find((b) => ayniHedef(b, hedef));
    if (hedefBorc) tahsisYap(hedefBorc);
  }

  // 2) Kalan → en eski vadeden sırayla (kısmi destekli)
  for (const borc of uygunlar) {
    if (kalanOdeme <= 0) break;
    tahsisYap(borc);
  }

  // 3) Artan → avans (cari bakiyeyi normal düşürür; tahsis defterine girmez)
  return { tahsisler, avans: kalanOdeme };
}

/** Borcun tahsis-sonrası kalanı: amount − Σtahsis (kuruş-güvenli, negatife inmez). */
export function borcKalan(borcTutari: number, tahsisToplami: number): number {
  return Math.max(0, roundCurrency(roundCurrency(borcTutari) - roundCurrency(tahsisToplami)));
}
