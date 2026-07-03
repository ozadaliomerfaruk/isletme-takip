/**
 * Mutabakat Asistanı — içgörü üretici. SAF TypeScript (RN importu yok).
 *
 * MutabakatSonucu'ndan esnafın telefonda karşı tarafa okuyacağı türden,
 * insan-dilinde bulgular türetir. Tutarlar kuruş olarak döner; formatlama
 * ve i18n çevirisi UI'da yapılır (kod → mutabakat:insights.{code}).
 */

import type { CariType, MutabakatSonucu } from './types';

export type InsightTone = 'ok' | 'info' | 'warn';

export interface Insight {
  code:
    | 'fark_aleyhinize'        // {amount} — onların defterinde bakiye aleyhimize
    | 'fark_lehinize'          // {amount} — onların defterinde bakiye lehimize
    | 'devir_lehinize'         // {amount} — geçmiş dönem devrinde lehimize fark
    | 'devir_aleyhinize'       // {amount}
    | 'fatura_tamam'           // {count} — fatura tarafı birebir tutuyor
    | 'odeme_tamam'            // {count} — ödeme/tahsilat tarafı birebir tutuyor
    | 'mukerrer_suphe'         // {date, amount} — defterde çift kayıt şüphesi
    | 'kurus_farki'            // {count, amount} — küçük yuvarlama farklarının NET toplamı
    | 'donem_sonrasi'          // {count} — ekstre bitiminden sonra işlem var
    | 'eski_donem_ekstresi';   // devir farkı için önceki dönem ekstresi istenmeli
  tone: InsightTone;
  amountKurus?: number;
  count?: number;
  /** YYYY-MM-DD */
  date?: string;
}

/** Kapanış farkının kalem kalem dökümü (fark denklemi) */
export interface FarkKoprusu {
  bizdeEksikKurus: number;    // + yönlü katkı: onların ekstresinde olup bizde olmayanlar
  onlardaEksikKurus: number;  // − yönlü katkı: bizde olup onlarda görünmeyenler
  tutarFarkKurus: number;     // belge-no eşleşmelerindeki tutar farkları
  devirFarkKurus: number;     // dönem başı farkı
  /** Devir karşılaştırılamadıysa (ekstrede devir satırı yok) true — 0 "fark yok" demek değildir */
  devirBilinmiyor: boolean;
  yuvarlamaKurus: number;     // tolerans içi eşleşme farkları
  toplamKurus: number;        // = kapanis.farkKurus
  /** Denklemin sağlaması motorda tuttu mu (farkAciklanabilir) */
  dogrulandi: boolean;
}

export interface AsistanOzeti {
  insights: Insight[];
  /** Kapanış farkı hesaplanabildiyse denklem, yoksa null */
  koprusu: FarkKoprusu | null;
  /** "Olası mükerrer" rozetlenecek defter kalemi (islemId) kümesi */
  mukerrerIslemIds: string[];
}

export function generateAsistanOzeti(sonuc: MutabakatSonucu, cariType: CariType): AsistanOzeti {
  const insights: Insight[] = [];

  const mirror = (satir: { debitKurus: number | null; creditKurus: number | null }) =>
    sonuc.yon === 'ayna'
      ? (satir.creditKurus ?? 0) - (satir.debitKurus ?? 0)
      : (satir.debitKurus ?? 0) - (satir.creditKurus ?? 0);

  // ---- Kapanış farkı yönü (leh/aleyh dili) ----
  // kapanis.farkKurus = onlarınAyna − bizim (bizim perspektif, pozitif = alacağımız).
  // fark < 0 → onların defteri alacağımızı daha DÜŞÜK / borcumuzu daha YÜKSEK
  // gösteriyor → ALEYHİMİZE. fark > 0 → LEHİMİZE.
  const fark = sonuc.kapanis.farkKurus;
  if (fark !== null && Math.abs(fark) > 100) {
    insights.push({
      code: fark < 0 ? 'fark_aleyhinize' : 'fark_lehinize',
      tone: 'warn',
      amountKurus: Math.abs(fark),
    });
  }

  // ---- Fark köprüsü (denklem) ----
  let koprusu: FarkKoprusu | null = null;
  if (fark !== null) {
    koprusu = {
      bizdeEksikKurus: sonuc.bizdeEksik.reduce((s, i) => s + mirror(i.satir), 0),
      onlardaEksikKurus: sonuc.onlardaEksik.reduce((s, i) => s + i.kalem.signedKurus, 0),
      tutarFarkKurus: sonuc.tutarFarkli.reduce((s, i) => s + i.farkKurus, 0),
      devirFarkKurus: sonuc.devir.farkKurus ?? 0,
      devirBilinmiyor: sonuc.devir.farkKurus === null,
      yuvarlamaKurus: sonuc.yuvarlamaFarkiKurus,
      toplamKurus: fark,
      dogrulandi: sonuc.checksum.farkAciklanabilir === true,
    };
  }

  // ---- Devir farkı yönü ----
  const devirFark = sonuc.devir.farkKurus;
  if (devirFark !== null && Math.abs(devirFark) > 100) {
    // devirFark = onlarınAyna − bizim: pozitif → onların devri bize daha çok alacak
    // yazıyor → LEHİMİZE (kendimizi fazla borçlu/eksik alacaklı taşımışız).
    insights.push({
      code: devirFark > 0 ? 'devir_lehinize' : 'devir_aleyhinize',
      tone: 'warn',
      amountKurus: Math.abs(devirFark),
    });
    insights.push({ code: 'eski_donem_ekstresi', tone: 'info' });
  }

  // ---- Taraf kırılımı: fatura tarafı / ödeme tarafı birebir mi? ----
  // Defter kalemleri TİPLE sınıflanır: iadeler de FATURA tarafıdır (işaretleri
  // ödeme yönünde olduğundan işaret-bazlı sınıflama iadeleri yanlış tarafa sayar
  // ve "fatura tarafı birebir ✓" güvencesi iadeli ihtilafta yanıltırdı).
  const FATURA_TIPLERI = new Set(['cari_satis', 'cari_alis', 'cari_satis_iade', 'cari_alis_iade']);
  const IADE_TIPLERI = new Set(['cari_satis_iade', 'cari_alis_iade']);
  const matchedFatura = sonuc.eslesmeler.filter((e) => FATURA_TIPLERI.has(e.defter.type)).length;
  const matchedOdeme = sonuc.eslesmeler.length - matchedFatura;
  // Ekstre satırlarının tipi bilinemez → işaret sezgisi: fatura yönü müşteri +, tedarikçi −
  const faturaSign = cariType === 'musteri' ? 1 : -1;
  const bizdeEksikFatura = sonuc.bizdeEksik.filter((i) => Math.sign(mirror(i.satir)) === faturaSign).length;
  const bizdeEksikOdeme = sonuc.bizdeEksik.length - bizdeEksikFatura;
  const faturaDiff =
    bizdeEksikFatura +
    sonuc.onlardaEksik.filter((i) => FATURA_TIPLERI.has(i.kalem.type)).length +
    sonuc.tutarFarkli.filter((i) => FATURA_TIPLERI.has(i.defter.type)).length;
  const odemeDiff =
    bizdeEksikOdeme +
    sonuc.onlardaEksik.filter((i) => !FATURA_TIPLERI.has(i.kalem.type)).length +
    sonuc.tutarFarkli.filter((i) => !FATURA_TIPLERI.has(i.defter.type)).length;
  // Eşleşmemiş defter İADESİ varken iki taraf güvencesi de verilmez: ekstre
  // satırlarında tip bilinmediğinden iade, işaret sezgisiyle ödeme sanılabilir.
  const eslesememisIadeVar =
    sonuc.onlardaEksik.some((i) => IADE_TIPLERI.has(i.kalem.type)) ||
    sonuc.tutarFarkli.some((i) => IADE_TIPLERI.has(i.defter.type));
  const herhangiFarkVar = faturaDiff + odemeDiff > 0;
  if (herhangiFarkVar && !eslesememisIadeVar) {
    if (faturaDiff === 0 && matchedFatura > 0) {
      insights.push({ code: 'fatura_tamam', tone: 'ok', count: matchedFatura });
    }
    if (odemeDiff === 0 && matchedOdeme > 0) {
      insights.push({ code: 'odeme_tamam', tone: 'ok', count: matchedOdeme });
    }
  }

  // ---- Mükerrer kayıt şüphesi ----
  // Onlarda görünmeyen (grup b) bir kalemin, EŞLEŞMİŞ bir ikizi varsa
  // (aynı tutar, ±1 gün) defterde çift girilmiş olabilir: ekstrede 1, bizde 2.
  // Her eşleşme en fazla BİR grup-b kalemine ikizlik eder (3 özdeş kayıt →
  // 1 şüphe; aksi halde aynı ikiz üzerinden ikisi de rozetlenirdi).
  const mukerrerIslemIds: string[] = [];
  const kullanilanIkizler = new Set<string>();
  for (const b of sonuc.onlardaEksik) {
    const twin = sonuc.eslesmeler.find(
      (e) =>
        !kullanilanIkizler.has(e.defter.islemId) &&
        e.defter.signedKurus === b.kalem.signedKurus &&
        Math.abs(e.defter.epochDay - b.kalem.epochDay) <= 1,
    );
    if (twin) {
      kullanilanIkizler.add(twin.defter.islemId);
      mukerrerIslemIds.push(b.kalem.islemId);
      if (mukerrerIslemIds.length <= 3) {
        insights.push({
          code: 'mukerrer_suphe',
          tone: 'warn',
          amountKurus: b.kalem.amountKurus,
          date: b.kalem.date,
        });
      }
    }
  }

  // ---- Küçük kuruş/yuvarlama farkları ----
  // Tavsiye "tek düzeltme kaydıyla kapat" olduğundan tutar İŞARETLİ NET'tir
  // (brüt mutlak toplam yanlış düzeltme kaydı yazdırırdı).
  const kucukFarklar = sonuc.tutarFarkli.filter((f) => Math.abs(f.farkKurus) < 100);
  const kucukNet = sonuc.yuvarlamaFarkiKurus + kucukFarklar.reduce((s, f) => s + f.farkKurus, 0);
  const kucukSayi = kucukFarklar.length + sonuc.eslesmeler.filter((e) => e.kurusFarki !== 0).length;
  if (kucukSayi > 0 && kucukNet !== 0) {
    insights.push({ code: 'kurus_farki', tone: 'info', count: kucukSayi, amountKurus: Math.abs(kucukNet) });
  }

  // ---- Dönem sonrası işlemler ----
  if (sonuc.donemSonrasiKalemSayisi > 0) {
    insights.push({ code: 'donem_sonrasi', tone: 'info', count: sonuc.donemSonrasiKalemSayisi });
  }

  return { insights, koprusu, mukerrerIslemIds };
}
