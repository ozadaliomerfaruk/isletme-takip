/**
 * Mutabakat Asistanı — içgörü üretici. SAF TypeScript (RN importu yok).
 *
 * MutabakatSonucu'ndan esnafın telefonda karşı tarafa okuyacağı türden,
 * insan-dilinde bulgular türetir. Tutarlar kuruş olarak döner; formatlama
 * ve i18n çevirisi UI'da yapılır (kod → mutabakat:insights.{code}).
 *
 * TASARIM İLKESİ (v4): her senaryo için AYRI ve DÜRÜST cümle. Hiçbir kalem
 * eşleşmediyse "denklem tutuyor / dönem uyumlu" DEMEZ — dosyayı sorgulatır.
 * Devir farkı yönü artık tek yerde (openingDiff kartında) anlatılır; asistan
 * özeti yalnız KATMA DEĞER veren bulguları (tek-kalem avı, akıllı ipuçları) söyler.
 */

import { epochDayOf } from './helpers';
import type { CariType, DefterKalemi, MutabakatSonucu } from './types';

export type InsightTone = 'ok' | 'info' | 'warn';

export interface Insight {
  code:
    // Güven eşiği — hiç eşleşme yoksa tek dürüst cümle:
    | 'hic_eslesme'            // {count} — ekstredeki hiçbir hareket eşleşmedi (yanlış/eski dosya?)
    // Manşet — duruma özel TEK cümle:
    | 'fark_devirden'          // {count, amount} — dönem uyumlu, fark tamamen devirden
    | 'fark_borc_lehinize'     // {amount, cari} — borcunuzu daha düşük gösteriyor
    | 'fark_borc_aleyhinize'   // {amount, cari} — borcunuzu daha yüksek gösteriyor
    | 'fark_alacak_lehinize'   // {amount, cari} — alacağınızı daha yüksek gösteriyor
    | 'fark_alacak_aleyhinize' // {amount, cari} — alacağınızı daha düşük gösteriyor
    | 'fark_gorunmeyen_donem'  // {amount} — dönem-içi tutuyor ama fark kapsanmayan eski dönemlerde
    | 'devir_tek_kalem'        // {amount, date, detay} — devir farkı tek kayıtla birebir
    | 'fatura_tamam'           // {count}
    | 'odeme_tamam'            // {count}
    | 'mukerrer_suphe'         // {date, amount}
    | 'kurus_farki'            // {count, amount} — NET toplam
    | 'olasi_ters_taraf'       // {date, amount} — aynı tutar iki tarafta zıt işaretle: yön hatası
    | 'olasi_katsayi'          // {count(=kat 10/100), detay(=belge), amount(=fark)} — fazladan sıfır/virgül
    | 'olasi_yil_hatasi'       // {date, amount} — bir yıl kayık ikiz kayıt
    | 'donem_sonrasi';         // {count}
  tone: InsightTone;
  amountKurus?: number;
  count?: number;
  /** YYYY-MM-DD */
  date?: string;
  /** Serbest ek bilgi (örn. tek-kalem avında kaydın açıklaması, ya da belge no) */
  detay?: string;
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

export interface AsistanOzetiOptions {
  /** Devir farkı tek-kalem avı için carinin TÜM kalemleri */
  kalemler?: DefterKalemi[];
  /** Tutar toleransı (kuruş) — akıllı ipuçları için; varsayılan 100 */
  amountTol?: number;
}

const KATSAYILAR = [10, 100] as const;
const YIL_GUN = 365;

export function generateAsistanOzeti(
  sonuc: MutabakatSonucu,
  cariType: CariType,
  opts?: AsistanOzetiOptions,
): AsistanOzeti {
  const insights: Insight[] = [];
  const mukerrerIslemIds: string[] = [];
  const amountTol = opts?.amountTol ?? 100;

  const mirror = (satir: { debitKurus: number | null; creditKurus: number | null }) =>
    sonuc.yon === 'ayna'
      ? (satir.creditKurus ?? 0) - (satir.debitKurus ?? 0)
      : (satir.debitKurus ?? 0) - (satir.creditKurus ?? 0);

  // ---- GÜVEN EŞİĞİ ----
  // Ekstrenin hiçbir satırı karşılaştırılamadıysa (hepsi Bölge A / sıfır eşleşme),
  // devir/köprü/dönem-sonrası içgörüleri YANILTICI olur (sahte "denklem tutuyor").
  // Tek dürüst cümleyi söyle ve dur — asıl mesajı şüpheli-dosya kartı taşır.
  const eslesenVar = sonuc.eslesmeler.length > 0;
  const karsilastirilanVar =
    eslesenVar ||
    sonuc.bizdeEksik.length > 0 ||
    sonuc.onlardaEksik.length > 0 ||
    sonuc.tutarFarkli.length > 0;
  if (!karsilastirilanVar) {
    insights.push({ code: 'hic_eslesme', tone: 'warn', count: sonuc.bolgeA.length });
    return { insights, koprusu: null, mukerrerIslemIds };
  }

  const fark = sonuc.kapanis.farkKurus;
  const devirFark = sonuc.devir.farkKurus;

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

  const donemIciFarkYok =
    sonuc.bizdeEksik.length === 0 && sonuc.onlardaEksik.length === 0 && sonuc.tutarFarkli.length === 0;

  // ---- Manşet: kapanış farkı, duruma özel cümleyle ----
  // Farkın ≥%90'ı devirden geliyorsa asıl hikaye "dönem uyumlu, sorun geçmişte".
  // Ama bunu ancak GERÇEK eşleşme varsa iddia et (0 eşleşmede "dönem uyumlu" yalan olur).
  const devirBaskin =
    eslesenVar &&
    fark !== null &&
    devirFark !== null &&
    Math.abs(fark) > 100 &&
    Math.abs(devirFark) / Math.abs(fark) >= 0.9 &&
    Math.abs(devirFark) <= Math.abs(fark) * 1.1;

  if (fark !== null && Math.abs(fark) > 100) {
    if (devirBaskin) {
      insights.push({
        code: 'fark_devirden',
        tone: 'info',
        count: sonuc.eslesmeler.length,
        amountKurus: Math.abs(devirFark!),
      });
    } else if (!donemIciFarkYok) {
      // Kişisel cümle: bizim bakiye borç mu alacak mı + fark yönü → 4 net varyant
      const borcMu = sonuc.kapanis.bizimKurus < 0;
      const lehimize = fark > 0;
      insights.push({
        code: borcMu
          ? lehimize ? 'fark_borc_lehinize' : 'fark_borc_aleyhinize'
          : lehimize ? 'fark_alacak_lehinize' : 'fark_alacak_aleyhinize',
        tone: 'warn',
        amountKurus: Math.abs(fark),
      });
    }
  }

  // ---- S4: Görünmeyen (kapsanmayan) dönem ----
  // Dönem-içi kalemleriniz tam tutuyor ama kalan fark devirle de temiz açıklanmıyor →
  // sorun bu ekstrenin kapsamadığı daha eski hareketlerde. (Kullanıcının açık isteği.)
  if (
    donemIciFarkYok &&
    eslesenVar &&
    fark !== null &&
    Math.abs(fark) > 100 &&
    !devirBaskin &&
    sonuc.checksum.farkAciklanabilir !== true
  ) {
    insights.push({ code: 'fark_gorunmeyen_donem', tone: 'warn', amountKurus: Math.abs(fark) });
  }

  // ---- Devir farkı: tek kalem avı (yön/eylem openingDiff kartında) ----
  if (devirFark !== null && Math.abs(devirFark) > 100) {
    let tekKalem: DefterKalemi | null = null;
    if (opts?.kalemler?.length) {
      const hedef = Math.abs(devirFark);
      const startDay = epochDayOf(sonuc.donem.start);
      const oncesi = opts.kalemler.filter((k) => k.amountKurus === hedef && k.epochDay < startDay);
      const hepsi = oncesi.length > 0 ? oncesi : opts.kalemler.filter((k) => k.amountKurus === hedef);
      if (hepsi.length === 1) tekKalem = hepsi[0];
    }
    if (tekKalem) {
      insights.push({
        code: 'devir_tek_kalem',
        tone: 'warn',
        amountKurus: tekKalem.amountKurus,
        date: tekKalem.date,
        detay: tekKalem.description || undefined,
      });
    }
  }

  // ---- Taraf kırılımı: fatura tarafı / ödeme tarafı birebir mi? ----
  const FATURA_TIPLERI = new Set(['cari_satis', 'cari_alis', 'cari_satis_iade', 'cari_alis_iade']);
  const IADE_TIPLERI = new Set(['cari_satis_iade', 'cari_alis_iade']);
  const matchedFatura = sonuc.eslesmeler.filter((e) => FATURA_TIPLERI.has(e.defter.type)).length;
  const matchedOdeme = sonuc.eslesmeler.length - matchedFatura;
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

  // ---- AKILLI İPUCU: ters taraf / yön hatası ----
  // Aynı tutar hem "bizde eksik" hem "onlarda eksik" listesinde ama ZIT işaretle
  // görünüyorsa, muhtemelen bir kayıt ters tarafa işlenmiştir (iade↔satış,
  // ödeme↔tahsilat, borç↔alacak). SMMM'nin en sık gördüğü kayıt hatası.
  const kullanilanTers = new Set<string>();
  let tersSayisi = 0;
  for (const b of sonuc.bizdeEksik) {
    if (tersSayisi >= 2) break;
    const bm = mirror(b.satir);
    if (bm === 0) continue;
    const es = sonuc.onlardaEksik.find(
      (o) =>
        !kullanilanTers.has(o.kalem.islemId) &&
        Math.sign(o.kalem.signedKurus) === -Math.sign(bm) &&
        Math.abs(Math.abs(o.kalem.signedKurus) - Math.abs(bm)) <= amountTol &&
        Math.abs(o.kalem.epochDay - b.satir.epochDay) <= 3,
    );
    if (es) {
      kullanilanTers.add(es.kalem.islemId);
      insights.push({ code: 'olasi_ters_taraf', tone: 'warn', amountKurus: Math.abs(bm), date: b.satir.date });
      tersSayisi++;
    }
  }

  // ---- AKILLI İPUCU: fazladan sıfır / yanlış virgül (10x veya 100x tutar farkı) ----
  // Aynı belge iki tarafta ~10 ya da ~100 kat farklı görünüyorsa muhtemel suçlu
  // fazladan bir sıfır ya da yanlış yere konmuş virgüldür. (Kullanıcının açık isteği.)
  let katsayiIpucuSayisi = 0;
  for (const f of sonuc.tutarFarkli) {
    if (katsayiIpucuSayisi >= 2) break;
    const theirs = Math.abs(mirror(f.ekstre));
    const ours = Math.abs(f.defter.signedKurus);
    const buyuk = Math.max(theirs, ours);
    const kucuk = Math.min(theirs, ours);
    if (kucuk < 100) continue; // 1 TL altı orana güvenme
    const kat = KATSAYILAR.find((k) => Math.abs(buyuk / kucuk - k) <= k * 0.01);
    if (kat) {
      insights.push({
        code: 'olasi_katsayi',
        tone: 'warn',
        count: kat,
        detay: f.ekstre.belgeNo || f.ekstre.description || undefined,
        amountKurus: Math.abs(f.farkKurus),
      });
      katsayiIpucuSayisi++;
    }
  }

  // ---- AKILLI İPUCU: bir yıl kayık tarih ----
  // Ekstrede olup bizde o tarihte görünmeyen bir satırın (bizdeEksik), defterimizde
  // TAM BİR YIL önce/sonra aynı tutarlı bir kaydı varsa yılı yanlış girmiş olabiliriz
  // (4 Oca 2025 yerine 4 Oca 2026). Yanlış-yıllı kayıt çoğu zaman dönem DIŞINDA
  // kaldığından tüm defter kalemlerine (opts.kalemler) karşı aranır.
  let yilIpucuSayisi = 0;
  if (opts?.kalemler?.length) {
    for (const item of sonuc.bizdeEksik) {
      if (yilIpucuSayisi >= 1) break;
      const hedef = Math.abs(mirror(item.satir));
      if (hedef === 0) continue;
      const twin = opts.kalemler.find(
        (k) =>
          Math.abs(k.amountKurus - hedef) <= amountTol &&
          Math.abs(Math.abs(k.epochDay - item.satir.epochDay) - YIL_GUN) <= 3,
      );
      if (twin) {
        insights.push({ code: 'olasi_yil_hatasi', tone: 'warn', date: twin.date, amountKurus: twin.amountKurus });
        yilIpucuSayisi++;
      }
    }
  }

  // ---- Küçük kuruş/yuvarlama farkları ----
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
