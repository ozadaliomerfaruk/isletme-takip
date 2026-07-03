/**
 * Mutabakat karşılaştırma motoru — SAF TypeScript (RN importu yok).
 *
 * Muhasebe kuralları:
 * - İşaret tablosu updateBalances (useIslemler.ts) kanonik formülüyle birebirdir
 *   ve cari.type'a BAKMAZ (bakiye motoru da bakmıyor; tip-uyumsuz kayıtlar
 *   dışlanırsa zincir cari.balance ile tutmaz).
 * - Ayna kuralı: karşı ekstresinde onların ALACAK'ı = bizim BORÇ'umuz (+).
 * - Verdikt asimetriktir: yanlış "Mutabıkız" > yanlış "Değiliz". Devir/kapanış
 *   doğrulanamadıysa, checksum false ise ya da satır atlandıysa asla 'mutabik' denmez.
 */

import type {
  BekleyenCek,
  BizdeEksikSatir,
  DefterKalemi,
  EkstreSatiri,
  Eslesme,
  MutabakatSonucu,
  MutabakatUyari,
  OnlardaEksikKalem,
  ParsedEkstre,
  ReconcileInput,
  Rozet,
  TutarFarki,
} from './types';
import { descriptionIncludes, isUsableBelgeNo } from './helpers';

/** Kanonik işaretli etki tablosu (bizim ekstre BORÇ tarafı = +) */
export const CARI_SIGN: Record<string, 1 | -1> = {
  cari_satis: 1,
  cari_odeme: 1,
  cari_alis_iade: 1,
  cari_alis: -1,
  cari_tahsilat: -1,
  cari_satis_iade: -1,
};

const DEFAULT_DATE_TOL = 3;
const DEFAULT_AMOUNT_TOL = 100; // 1 TL

/** KDV/stopaj oran ipuçları (olası-eşleşme rozeti; otomatik eşleştirme YAPILMAZ) */
const ORAN_IPUCLARI = [1.2, 1.18, 1.1, 1.08, 1.01];
const ACIKLAMA_IPUCU_RE = /(KURFARKI|VADEFARKI|FIYATFARKI)/;

type Yon = 'ayna' | 'aynasiz';

/** Ekstre satırının bizim perspektifimize çevrilmiş işaretli tutarı */
function mirrorSigned(row: EkstreSatiri, yon: Yon): number {
  const debit = row.debitKurus ?? 0;
  const credit = row.creditKurus ?? 0;
  return yon === 'ayna' ? credit - debit : debit - credit;
}

function devirSigned(devir: { debitKurus: number; creditKurus: number }, yon: Yon): number {
  return yon === 'ayna' ? devir.creditKurus - devir.debitKurus : devir.debitKurus - devir.creditKurus;
}

interface OrientedResult {
  yon: Yon;
  eslesmeler: Eslesme[];
  tutarFarkli: TutarFarki[];
  bizdeEksikRows: EkstreSatiri[];
  onlardaEksikKalemler: DefterKalemi[];
  devirBizim: number;
  devirOnlarAyna: number | null;
  kapanisBizim: number;
  kapanisOnlarAyna: number | null;
  donemSonrasiKalemSayisi: number;
  yuvarlamaFarkiKurus: number;
  bakiyeZinciriUyumlu: boolean | null;
  /** Eşleşme oranı: eşleşen / min(aday satır, aday kalem); veri azsa null */
  eslesmeOrani: number | null;
}

function reconcileOriented(
  ekstre: ParsedEkstre,
  kalemler: DefterKalemi[],
  cariBalanceKurus: number,
  yon: Yon,
  dateTol: number,
  amountTol: number,
): OrientedResult {
  const rows = ekstre.rows;
  const startDay = Math.min(...rows.map((r) => r.epochDay));
  const endDay = Math.max(...rows.map((r) => r.epochDay));

  const allSigned = kalemler.reduce((sum, k) => sum + k.signedKurus, 0);
  const allTimeOpening = cariBalanceKurus - allSigned;

  const preKalemler: DefterKalemi[] = [];
  const inKalemler: DefterKalemi[] = [];
  const postKalemler: DefterKalemi[] = [];
  // Aday penceresi dönemden ±dateTol gün geniştir: dönem sınırındaki kayıt
  // farkları (onlar 30/6'da biz 2/7'de) eşleşebilsin diye.
  const adaylar: DefterKalemi[] = [];
  for (const k of kalemler) {
    if (k.epochDay < startDay) preKalemler.push(k);
    else if (k.epochDay > endDay) postKalemler.push(k);
    else inKalemler.push(k);
    if (k.epochDay >= startDay - dateTol && k.epochDay <= endDay + dateTol) adaylar.push(k);
  }

  // Kovalar: işaretli kuruş → tarih sıralı kalemler
  const buckets = new Map<number, DefterKalemi[]>();
  for (const k of adaylar) {
    const bucket = buckets.get(k.signedKurus);
    if (bucket) bucket.push(k);
    else buckets.set(k.signedKurus, [k]);
  }
  for (const bucket of buckets.values()) {
    bucket.sort((a, b) => a.epochDay - b.epochDay || a.islemId.localeCompare(b.islemId));
  }

  const matchedKalem = new Set<DefterKalemi>();
  const matchedRow = new Set<EkstreSatiri>();
  const eslesmeler: Eslesme[] = [];

  // Aşama 1+2: önce aynı gün (dd=0, 'exact'), sonra artan gün farkı.
  // Her gün-farkı turunda tutar araması |delta| artan sırayla komşu kovaları
  // da tarar (kuruş toleransı — tam-anahtar Map toleransı yutmasın diye).
  for (let dd = 0; dd <= dateTol; dd++) {
    for (const row of rows) {
      if (matchedRow.has(row)) continue;
      const target = mirrorSigned(row, yon);
      if (target === 0) continue;
      let found: DefterKalemi | null = null;
      let foundDelta = 0;
      for (let ad = 0; ad <= amountTol && !found; ad++) {
        for (const delta of ad === 0 ? [0] : [-ad, ad]) {
          const bucket = buckets.get(target - delta);
          if (!bucket) continue;
          for (const kalem of bucket) {
            if (matchedKalem.has(kalem)) continue;
            if (Math.abs(kalem.epochDay - row.epochDay) === dd) {
              found = kalem;
              foundDelta = delta;
              break;
            }
          }
          if (found) break;
        }
      }
      if (found) {
        matchedKalem.add(found);
        matchedRow.add(row);
        eslesmeler.push({
          ekstre: row,
          defter: found,
          asama: dd === 0 ? 'exact' : 'yakin_tarih',
          gunFarki: found.epochDay - row.epochDay,
          kurusFarki: target - found.signedKurus,
        });
      }
    }
  }

  // Aşama 3: belge no ile tutar-farklı eşleşme (grup c) — yalnız dönem-içi kalemler
  const tutarFarkli: TutarFarki[] = [];
  if (ekstre.hasBelgeNo) {
    for (const row of rows) {
      if (matchedRow.has(row)) continue;
      if (!isUsableBelgeNo(row.belgeNo)) continue;
      const target = mirrorSigned(row, yon);
      if (target === 0) continue;
      const kalem = inKalemler.find(
        (k) =>
          !matchedKalem.has(k) &&
          Math.sign(k.signedKurus) === Math.sign(target) &&
          descriptionIncludes(k.description, row.belgeNo!),
      );
      if (kalem) {
        matchedKalem.add(kalem);
        matchedRow.add(row);
        tutarFarkli.push({ ekstre: row, defter: kalem, farkKurus: target - kalem.signedKurus });
      }
    }
  }

  const bizdeEksikRows = rows.filter((r) => !matchedRow.has(r) && mirrorSigned(r, yon) !== 0);
  const onlardaEksikKalemler = inKalemler.filter((k) => !matchedKalem.has(k));

  // Devir: dönem-öncesi eşleşen kalem devirden düşülür (döneme taşınmıştır)
  const preSigned = preKalemler.reduce((sum, k) => sum + k.signedKurus, 0);
  const preMatchedSigned = preKalemler.reduce(
    (sum, k) => sum + (matchedKalem.has(k) ? k.signedKurus : 0),
    0,
  );
  const devirBizim = allTimeOpening + preSigned - preMatchedSigned;

  const inSigned = inKalemler.reduce((sum, k) => sum + k.signedKurus, 0);
  const postMatchedSigned = postKalemler.reduce(
    (sum, k) => sum + (matchedKalem.has(k) ? k.signedKurus : 0),
    0,
  );
  const kapanisBizim = devirBizim + preMatchedSigned + inSigned + postMatchedSigned;

  const devirOnlarAyna = ekstre.devir ? devirSigned(ekstre.devir, yon) : null;

  // Bakiye zinciri: balance[i] ≈ balance[i-1] + c·(debit−credit); c ∈ {+1,−1}
  // otomatik tespit. Zincir doğrulanırsa son bakiye kapanış aynası olarak kullanılabilir.
  let bakiyeZinciriUyumlu: boolean | null = null;
  let zincirKonvansiyon: 1 | -1 | null = null;
  const balanceRows = rows.filter((r) => r.balanceKurus !== null);
  if (balanceRows.length >= 2) {
    for (const c of [1, -1] as const) {
      let ok = true;
      for (let i = 1; i < balanceRows.length; i++) {
        const prev = balanceRows[i - 1];
        const cur = balanceRows[i];
        // Aynı bakiye-koluna sahip ardışık satırlar arasındaki TÜM veri satırlarının
        // net etkisi zincire dahil olmalı; basitleştirme: rows sıralı geldiğinden
        // aradaki satırlar bakiyesizse etkilerini topla.
        const iPrev = rows.indexOf(prev);
        const iCur = rows.indexOf(cur);
        let net = 0;
        for (let j = iPrev + 1; j <= iCur; j++) {
          net += (rows[j].debitKurus ?? 0) - (rows[j].creditKurus ?? 0);
        }
        if (Math.abs(cur.balanceKurus! - prev.balanceKurus! - c * net) > 1) {
          ok = false;
          break;
        }
      }
      if (ok) {
        zincirKonvansiyon = c;
        break;
      }
    }
    bakiyeZinciriUyumlu = zincirKonvansiyon !== null;
  }

  // Kapanış aynası: öncelik devir satırı; yoksa zincir-doğrulanmış son bakiye.
  let kapanisOnlarAyna: number | null = null;
  if (devirOnlarAyna !== null) {
    const rowsSigned = rows.reduce((sum, r) => sum + mirrorSigned(r, yon), 0);
    kapanisOnlarAyna = devirOnlarAyna + rowsSigned;
  } else if (zincirKonvansiyon !== null && balanceRows.length > 0) {
    // c=+1 → bakiye onların borç-pozitif konvansiyonunda; ayna = −bakiye
    const last = balanceRows[balanceRows.length - 1];
    const theirDebitPositive = zincirKonvansiyon * last.balanceKurus!;
    kapanisOnlarAyna = yon === 'ayna' ? -theirDebitPositive : theirDebitPositive;
  }

  const yuvarlamaFarkiKurus = eslesmeler.reduce((sum, e) => sum + e.kurusFarki, 0);

  const adayN = Math.min(rows.length, adaylar.length);
  const eslesmeOrani = rows.length >= 4 && adaylar.length >= 4 ? eslesmeler.length / adayN : null;

  return {
    yon,
    eslesmeler,
    tutarFarkli,
    bizdeEksikRows,
    onlardaEksikKalemler,
    devirBizim,
    devirOnlarAyna,
    kapanisBizim,
    kapanisOnlarAyna,
    donemSonrasiKalemSayisi: postKalemler.filter((k) => !matchedKalem.has(k)).length,
    yuvarlamaFarkiKurus,
    bakiyeZinciriUyumlu,
    eslesmeOrani,
  };
}

// ============================================================================
// ROZETLER (yalnız bilgi — hiçbir kalemi gruptan çıkarmaz, eşleştirmez)
// ============================================================================

function rozetle(
  res: OrientedResult,
  bekleyenCekler: BekleyenCek[],
  amountTol: number,
): { bizdeEksik: BizdeEksikSatir[]; onlardaEksik: OnlardaEksikKalem[] } {
  const bizdeEksik: BizdeEksikSatir[] = res.bizdeEksikRows.map((satir) => ({ satir, rozetler: [] }));
  const onlardaEksik: OnlardaEksikKalem[] = res.onlardaEksikKalemler.map((kalem) => ({
    kalem,
    rozetler: [],
  }));

  for (const item of bizdeEksik) {
    const row = item.satir;

    // Bekleyen çek: verdiğimiz çek onların defterinde ALACAK'tır ve teslim
    // (kesim) gününde işlenir — pencere [kesim−7, vade+7]. Yalnız ayna yönünde
    // anlamlı (aynasiz ekstre bizim perspektifimiz olduğundan çek zaten bizde olurdu).
    if (res.yon === 'ayna' && row.creditKurus) {
      const cek = bekleyenCekler.find(
        (c) =>
          Math.abs(c.tutarKurus - row.creditKurus!) <= amountTol &&
          row.epochDay >= c.kesimEpochDay - 7 &&
          row.epochDay <= c.vadeEpochDay + 7,
      );
      if (cek) item.rozetler.push({ tur: 'bekleyen_cek', detay: cek.cekNo });
    }

    // Açıklama ipucu (kur/vade/fiyat farkı faturaları)
    const normalized = row.description
      .toUpperCase()
      .replace(/İ/g, 'I')
      .replace(/[^A-Z]/g, '');
    const ipucu = normalized.match(ACIKLAMA_IPUCU_RE);
    if (ipucu) item.rozetler.push({ tur: 'aciklama_ipucu', detay: ipucu[1] });
  }

  // Olası KDV farkı: karşılıklı eşleşmemiş a↔b kalemleri, aynı yön, ±3 gün,
  // tutar oranı bilinen KDV katsayılarından birine ±%0,5 yakın.
  const mirrorOf = (item: BizdeEksikSatir) =>
    res.yon === 'ayna'
      ? (item.satir.creditKurus ?? 0) - (item.satir.debitKurus ?? 0)
      : (item.satir.debitKurus ?? 0) - (item.satir.creditKurus ?? 0);

  for (const a of bizdeEksik) {
    const am = mirrorOf(a);
    for (const b of onlardaEksik) {
      const bs = b.kalem.signedKurus;
      if (Math.sign(am) !== Math.sign(bs)) continue;
      if (Math.abs(a.satir.epochDay - b.kalem.epochDay) > 3) continue;
      const ratio = Math.abs(am) / Math.abs(bs);
      const hit = ORAN_IPUCLARI.find(
        (r) => Math.abs(ratio - r) <= 0.005 || Math.abs(1 / ratio - r) <= 0.005,
      );
      if (hit) {
        const detay = hit.toFixed(2);
        a.rozetler.push({ tur: 'olasi_kdv', detay });
        b.rozetler.push({ tur: 'olasi_kdv', detay });
      }
    }
  }

  // Olası parçalı ödeme: bir taraftaki kalem, diğer taraftaki aynı yönlü ±7 günlük
  // 2-3 kalemin toplamına eşitse rozetle (iki yönde de denenir).
  const aVals = bizdeEksik.map((a) => ({ item: a, v: mirrorOf(a), day: a.satir.epochDay }));
  const bVals = onlardaEksik.map((b) => ({ item: b, v: b.kalem.signedKurus, day: b.kalem.epochDay }));
  markParcali(aVals, bVals, amountTol);
  markParcali(bVals, aVals, amountTol);

  return { bizdeEksik, onlardaEksik };
}

interface ParcaliAday {
  item: { rozetler: Rozet[] };
  v: number;
  day: number;
}

/** target listesindeki her kalem için source'ta 2-3'lü toplam araması */
function markParcali(targets: ParcaliAday[], sources: ParcaliAday[], amountTol: number): void {
  for (const t of targets) {
    if (t.v === 0) continue;
    const cands = sources
      .filter((s) => Math.sign(s.v) === Math.sign(t.v) && Math.abs(s.day - t.day) <= 7)
      .slice(0, 12);
    let hit = false;
    for (let i = 0; i < cands.length && !hit; i++) {
      for (let j = i + 1; j < cands.length && !hit; j++) {
        if (Math.abs(cands[i].v + cands[j].v - t.v) <= amountTol) hit = true;
        else {
          for (let k = j + 1; k < cands.length && !hit; k++) {
            if (Math.abs(cands[i].v + cands[j].v + cands[k].v - t.v) <= amountTol) hit = true;
          }
        }
      }
    }
    if (hit && !t.item.rozetler.some((r) => r.tur === 'olasi_parcali')) {
      t.item.rozetler.push({ tur: 'olasi_parcali' });
    }
  }
}

// ============================================================================
// PUBLIC API
// ============================================================================

export function reconcile(input: ReconcileInput): MutabakatSonucu {
  const { ekstre, kalemler, cariBalanceKurus, bekleyenCekler } = input;
  const dateTol = input.options?.dateToleranceDays ?? DEFAULT_DATE_TOL;
  const amountTol = input.options?.amountToleranceKurus ?? DEFAULT_AMOUNT_TOL;

  const uyarilar: MutabakatUyari[] = [...ekstre.uyarilar];

  // Yön güvenlik ağı: ayna yönü çok az eşleşiyorsa ekstre bizim perspektifimizden
  // düzenlenmiş olabilir — aynasız yön belirgin daha iyiyse onu kullan.
  let res = reconcileOriented(ekstre, kalemler, cariBalanceKurus, 'ayna', dateTol, amountTol);
  if (res.eslesmeOrani !== null && res.eslesmeOrani < 0.2) {
    const alt = reconcileOriented(ekstre, kalemler, cariBalanceKurus, 'aynasiz', dateTol, amountTol);
    if (
      alt.eslesmeOrani !== null &&
      alt.eslesmeOrani >= 0.5 &&
      alt.eslesmeler.length >= 2 * Math.max(1, res.eslesmeler.length)
    ) {
      res = alt;
      uyarilar.push({ code: 'aynasiz_yon' });
    } else {
      uyarilar.push({ code: 'dusuk_eslesme' });
    }
  }

  const { bizdeEksik, onlardaEksik } = rozetle(res, bekleyenCekler, amountTol);

  const tipUyumsuzCount = kalemler.filter((k) => k.tipUyumsuz).length;
  if (tipUyumsuzCount > 0) {
    uyarilar.push({ code: 'tip_uyumsuz_islemler', params: { count: tipUyumsuzCount } });
  }
  if (!ekstre.devir) uyarilar.push({ code: 'devir_satiri_yok' });
  if (res.donemSonrasiKalemSayisi > 0) {
    uyarilar.push({ code: 'donem_sonrasi_islemler', params: { count: res.donemSonrasiKalemSayisi } });
  }

  // Checksum: dip toplam
  let dipToplamUyumlu: boolean | null = null;
  if (ekstre.dipToplam) {
    const sumDebit = ekstre.rows.reduce((sum, r) => sum + (r.debitKurus ?? 0), 0);
    const sumCredit = ekstre.rows.reduce((sum, r) => sum + (r.creditKurus ?? 0), 0);
    // Dip toplam devri de içerebilir — iki varyanttan biri tutuyorsa uyumlu say
    const dDebit = ekstre.devir?.debitKurus ?? 0;
    const dCredit = ekstre.devir?.creditKurus ?? 0;
    dipToplamUyumlu =
      (Math.abs(sumDebit - ekstre.dipToplam.debitKurus) <= 1 &&
        Math.abs(sumCredit - ekstre.dipToplam.creditKurus) <= 1) ||
      (Math.abs(sumDebit + dDebit - ekstre.dipToplam.debitKurus) <= 1 &&
        Math.abs(sumCredit + dCredit - ekstre.dipToplam.creditKurus) <= 1);
  }

  // Motor öz-doğrulaması: kapanış farkı, listelenen farkların toplamıyla açıklanabilmeli
  let farkAciklanabilir: boolean | null = null;
  if (res.kapanisOnlarAyna !== null && res.devirOnlarAyna !== null) {
    const lhs = res.kapanisOnlarAyna - res.kapanisBizim;
    const rhs =
      (res.devirOnlarAyna - res.devirBizim) +
      res.yuvarlamaFarkiKurus +
      res.tutarFarkli.reduce((sum, f) => sum + f.farkKurus, 0) +
      bizdeEksik.reduce(
        (sum, i) =>
          sum +
          (res.yon === 'ayna'
            ? (i.satir.creditKurus ?? 0) - (i.satir.debitKurus ?? 0)
            : (i.satir.debitKurus ?? 0) - (i.satir.creditKurus ?? 0)),
        0,
      ) -
      onlardaEksik.reduce((sum, i) => sum + i.kalem.signedKurus, 0);
    farkAciklanabilir = Math.abs(lhs - rhs) <= 2;
    if (!farkAciklanabilir) uyarilar.push({ code: 'fark_aciklanamiyor' });
  }

  if (dipToplamUyumlu === false || res.bakiyeZinciriUyumlu === false) {
    uyarilar.push({ code: 'ekstre_ici_tutarsiz' });
  }
  if (ekstre.hasBalance && res.bakiyeZinciriUyumlu === null) {
    uyarilar.push({ code: 'bakiye_isareti_cozulemedi' });
  }

  const devirFark = res.devirOnlarAyna !== null ? res.devirOnlarAyna - res.devirBizim : null;
  const devirUyumlu = devirFark !== null ? Math.abs(devirFark) <= amountTol : null;
  const kapanisFark = res.kapanisOnlarAyna !== null ? res.kapanisOnlarAyna - res.kapanisBizim : null;

  // Verdikt (asimetrik):
  const farkVar = bizdeEksik.length > 0 || onlardaEksik.length > 0 || res.tutarFarkli.length > 0;
  const devirSorun = devirUyumlu === false;
  const kapanisSorun = kapanisFark !== null && Math.abs(kapanisFark) > amountTol;
  const yonSorunu = uyarilar.some((u) => u.code === 'aynasiz_yon' || u.code === 'dusuk_eslesme');
  const checksumSorunu =
    dipToplamUyumlu === false || res.bakiyeZinciriUyumlu === false || farkAciklanabilir === false;

  let durum: MutabakatSonucu['durum'];
  if (farkVar || devirSorun || kapanisSorun) {
    durum = 'mutabik_degil';
  } else if (
    devirUyumlu === true &&
    kapanisFark !== null &&
    !checksumSorunu &&
    ekstre.skippedDataRows === 0 &&
    !yonSorunu
  ) {
    durum = 'mutabik';
  } else {
    durum = 'bakiye_teyitsiz';
  }

  const exact = res.eslesmeler.filter((e) => e.asama === 'exact').length;

  const startDay = Math.min(...ekstre.rows.map((r) => r.epochDay));
  const endDay = Math.max(...ekstre.rows.map((r) => r.epochDay));
  const start = ekstre.rows.find((r) => r.epochDay === startDay)!.date;
  const end = ekstre.rows.find((r) => r.epochDay === endDay)!.date;

  return {
    durum,
    yon: res.yon,
    donem: { start, end },
    devir: {
      bizimKurus: res.devirBizim,
      onlarinAynaKurus: res.devirOnlarAyna,
      farkKurus: devirFark,
      uyumlu: devirUyumlu,
    },
    kapanis: {
      bizimKurus: res.kapanisBizim,
      onlarinAynaKurus: res.kapanisOnlarAyna,
      farkKurus: kapanisFark,
    },
    eslesmeler: res.eslesmeler,
    asamaKirilimi: { exact, yakinTarih: res.eslesmeler.length - exact },
    yuvarlamaFarkiKurus: res.yuvarlamaFarkiKurus,
    bizdeEksik,
    onlardaEksik,
    tutarFarkli: res.tutarFarkli,
    donemSonrasiKalemSayisi: res.donemSonrasiKalemSayisi,
    checksum: {
      dipToplamUyumlu,
      bakiyeZinciriUyumlu: res.bakiyeZinciriUyumlu,
      farkAciklanabilir,
    },
    uyarilar,
  };
}
