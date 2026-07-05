/**
 * Mutabakat rapor v4 — bölünmüş bakiye kolonu, şüpheli dosya tespiti,
 * güven eşiği verdikti ve akıllı ipuçları (regresyon).
 */
import * as XLSX from 'xlsx';
import { parseEkstreFile } from '../parseEkstre';
import { reconcile } from '../engine';
import { generateAsistanOzeti } from '../insights';
import { dosyaDogrula } from '../dogrulama';
import { epochDayOf } from '../helpers';
import type { DefterKalemi, EkstreSatiri, ParsedEkstre } from '../types';

function xlsxBuffer(aoa: (string | number)[][]): ArrayBuffer {
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Ekstre');
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const u8 = out instanceof Uint8Array ? out : new Uint8Array(out as ArrayBuffer);
  // Taze (paylaşımsız) ArrayBuffer döndür — SharedArrayBuffer tip uyuşmazlığından kaçın
  const copy = new Uint8Array(u8.length);
  copy.set(u8);
  return copy.buffer;
}

function kalem(id: string, date: string, amountTL: number, sign: 1 | -1, desc = `islem ${id}`): DefterKalemi {
  return {
    islemId: id,
    date,
    epochDay: epochDayOf(date),
    description: desc,
    type: sign > 0 ? 'cari_satis' : 'cari_alis',
    amountKurus: Math.round(amountTL * 100),
    signedKurus: Math.round(amountTL * 100) * sign,
    tipUyumsuz: false,
  };
}

function satir(
  i: number,
  date: string,
  debitTL: number | null,
  creditTL: number | null,
  balanceTL?: number,
  belgeNo: string | null = null,
): EkstreSatiri {
  return {
    rowIndex: i,
    date,
    epochDay: epochDayOf(date),
    description: 'x',
    belgeNo,
    debitKurus: debitTL ? Math.round(debitTL * 100) : null,
    creditKurus: creditTL ? Math.round(creditTL * 100) : null,
    balanceKurus: balanceTL !== undefined ? Math.round(balanceTL * 100) : null,
    balanceSignResolved: balanceTL !== undefined,
  };
}

function mkEkstre(rows: EkstreSatiri[], devir?: { debitKurus: number; creditKurus: number }, hasBelgeNo = false): ParsedEkstre {
  return {
    rows,
    headerRowIndex: 0,
    onBaslikMetni: '',
    hasBelgeNo,
    hasBalance: rows.some((r) => r.balanceKurus !== null),
    devir: devir ?? null,
    dipToplam: null,
    uyarilar: [],
    skippedDataRows: 0,
  };
}

describe('Hata A — bölünmüş bakiye kolonu (Borç Bak./Alacak Bak.)', () => {
  it('bölünmüş bakiye kolonunu tanır ve işareti çözer', () => {
    const buf = xlsxBuffer([
      ['Tarih', 'Açıklama', 'Borç', 'Alacak', 'Borç Bak.', 'Alacak Bak.'],
      ['', 'Önceki Tarihten Devir', 1000, 0, 1000, ''],
      ['07.01.2025', 'Satış', 500, 0, 1500, ''],
      ['09.01.2025', 'Tahsilat', 0, 300, 1200, ''],
    ]);
    const p = parseEkstreFile(buf);
    expect(p.hasBalance).toBe(true);
    expect(p.rows).toHaveLength(2);
    expect(p.rows.every((r) => r.balanceSignResolved)).toBe(true);
    expect(p.rows[0].balanceKurus).toBe(150000); // 1500 TL (borç bakiye → +)
    expect(p.rows[1].balanceKurus).toBe(120000);
    expect(p.devir).toEqual({ debitKurus: 100000, creditKurus: 0 });
  });

  it('bakiye zinciri kontrolünü AÇAR (fix öncesi null idi)', () => {
    const rows = [
      satir(2, '2025-03-10', 500, 0, 1500),
      satir(3, '2025-03-20', 0, 200, 1300),
    ];
    const ekstre = mkEkstre(rows, { debitKurus: 100000, creditKurus: 0 });
    const kalemler = [kalem('a', '2025-03-10', 500, -1), kalem('b', '2025-03-20', 200, 1)];
    // acilis(ayna) = -1000; kapanış = -1000 + (-500) + 200 = -1300
    const sonuc = reconcile({ ekstre, kalemler, cariBalanceKurus: -130000, bekleyenCekler: [] });
    expect(sonuc.checksum.bakiyeZinciriUyumlu).toBe(true);
    expect(sonuc.durum).toBe('mutabik');
    expect(sonuc.eslesmeler).toHaveLength(2);
  });
});

describe('Hata B — yanlış cari ekstresi (hepsi Bölge A)', () => {
  const rows = Array.from({ length: 8 }, (_, i) => satir(i + 2, `2025-0${(i % 8) + 1}-10`, 500 + i, 0));
  const ekstre = mkEkstre(rows, { debitKurus: 100000, creditKurus: 0 });
  // Kayıtlarımız ekstrenin bittiği tarihten (2025-08-10) SONRA
  const kalemler = [kalem('y1', '2026-06-01', 1000, 1), kalem('y2', '2026-06-15', 500, -1)];
  const sonuc = reconcile({ ekstre, kalemler, cariBalanceKurus: 50000, bekleyenCekler: [] });

  it('tüm ekstre Bölge A, sıfır eşleşme', () => {
    expect(sonuc.bolgeA).toHaveLength(8);
    expect(sonuc.eslesmeler).toHaveLength(0);
    expect(sonuc.bizdeEksik).toHaveLength(0);
    expect(sonuc.onlardaEksik).toHaveLength(0);
  });

  it('sahte "kaynağı belli / mutabık" verdikti VERMEZ', () => {
    expect(sonuc.durum).not.toBe('fark_aciklandi');
    expect(sonuc.durum).not.toBe('mutabik');
    expect(sonuc.durum).toBe('bakiye_teyitsiz');
  });

  it('asistan özeti tek dürüst cümle verir (hic_eslesme)', () => {
    const ozet = generateAsistanOzeti(sonuc, 'musteri', { kalemler });
    expect(ozet.insights.map((i) => i.code)).toEqual(['hic_eslesme']);
    expect(ozet.koprusu).toBeNull();
  });

  it('dosya doğrulama KESİN şüphe (kirmizi blok) verir', () => {
    const dog = dosyaDogrula({
      sonuc,
      antetMetni: 'BASKA FIRMA A.S.',
      adlar: ['Hedef Cari Ltd', 'Bizim Isletme'],
      kayitAraligi: { start: '2026-06-01', end: '2026-06-15' },
    });
    expect(dog.seviye).toBe('kirmizi');
    expect(dog.tamDisinda).toBe(true);
    expect(dog.toplamEkstreSatir).toBe(8);
    expect(dog.kayitBaslangic).toBe('2026-06-01');
  });
});

describe('Güven eşiği — belge-no eşleşmeleri de sayılır (inceleme bulgusu)', () => {
  it('her belgesi belge-no ile eşleşen ama tutarı sistematik farklı cari "bakiye_teyitsiz" GÖRÜNMEZ', () => {
    // Sistematik tutar farkı (net↔brüt): tam/yakın-tarih eşleşmez, belge-no ile eşleşir
    const rows = [
      satir(2, '2025-02-10', 1200, 0, undefined, 'FAT100'),
      satir(3, '2025-02-20', 1200, 0, undefined, 'FAT200'),
    ];
    const ekstre = mkEkstre(rows, { debitKurus: 0, creditKurus: 0 }, true);
    const kalemler = [
      kalem('k1', '2025-02-10', 1000, -1, 'FAT100 alis'),
      kalem('k2', '2025-02-20', 1000, -1, 'FAT200 alis'),
    ];
    // devirBizim=0 için cariBalance = tüm signed toplamı = -2000
    const sonuc = reconcile({ ekstre, kalemler, cariBalanceKurus: -200000, bekleyenCekler: [] });
    expect(sonuc.eslesmeler).toHaveLength(0);
    expect(sonuc.tutarFarkli).toHaveLength(2);
    // Bug: eslesmeGuveni yalnız eslesmeler'e bakınca 'bakiye_teyitsiz' oluyordu.
    expect(sonuc.durum).not.toBe('bakiye_teyitsiz');
    expect(sonuc.durum).toBe('fark_aciklandi');
    const ozet = generateAsistanOzeti(sonuc, 'tedarikci', { kalemler });
    expect(ozet.insights.map((i) => i.code)).not.toContain('hic_eslesme');
  });
});

describe('Akıllı ipuçları', () => {
  it('10 kat tutar farkını yakalar (olasi_katsayi)', () => {
    const rows = [satir(2, '2025-05-10', 5000, 0, undefined, 'FAT123')];
    const ekstre = mkEkstre(rows, undefined, true);
    const kalemler = [kalem('k1', '2025-05-10', 500, -1, 'FAT123 alis')];
    const sonuc = reconcile({ ekstre, kalemler, cariBalanceKurus: -50000, bekleyenCekler: [] });
    expect(sonuc.tutarFarkli).toHaveLength(1);
    const ozet = generateAsistanOzeti(sonuc, 'tedarikci', { kalemler });
    const katsayi = ozet.insights.find((i) => i.code === 'olasi_katsayi');
    expect(katsayi).toBeDefined();
    expect(katsayi?.count).toBe(10);
  });

  it('ters taraf / yön hatasını yakalar (olasi_ters_taraf)', () => {
    // Ekstre bir satışı borç yazmış (mirror −5000); biz aynı işlemi TERS tarafa
    // +5000 olarak işlemişiz → aynı tutar iki listede zıt işaretle
    const rows = [satir(2, '2025-03-10', 5000, 0)];
    const ekstre = mkEkstre(rows, { debitKurus: 0, creditKurus: 0 });
    const kalemler = [kalem('ters', '2025-03-10', 5000, 1, 'yanlış tarafa işlenmiş')];
    const sonuc = reconcile({ ekstre, kalemler, cariBalanceKurus: 500000, bekleyenCekler: [] });
    expect(sonuc.bizdeEksik).toHaveLength(1);
    expect(sonuc.onlardaEksik).toHaveLength(1);
    const ozet = generateAsistanOzeti(sonuc, 'musteri', { kalemler });
    expect(ozet.insights.map((i) => i.code)).toContain('olasi_ters_taraf');
  });

  it('bir yıl kayık tarihi yakalar (olasi_yil_hatasi)', () => {
    const rows = [
      satir(2, '2025-01-01', 999, 0), // anchor (eşleşir → Bölge B kesinleşir)
      satir(3, '2025-01-04', 800, 0), // bizdeEksik (yanlış-yıl ikizinin ekstre tarafı)
    ];
    const ekstre = mkEkstre(rows);
    const kalemler = [
      kalem('anchor', '2025-01-01', 999, -1),
      kalem('yanlisYil', '2026-01-04', 800, -1), // 4 Oca 2025 yerine 2026 girilmiş
    ];
    const sonuc = reconcile({ ekstre, kalemler, cariBalanceKurus: -179900, bekleyenCekler: [] });
    expect(sonuc.bizdeEksik.some((i) => i.satir.epochDay === epochDayOf('2025-01-04'))).toBe(true);
    const ozet = generateAsistanOzeti(sonuc, 'tedarikci', { kalemler });
    const yil = ozet.insights.find((i) => i.code === 'olasi_yil_hatasi');
    expect(yil).toBeDefined();
    expect(yil?.date).toBe('2026-01-04');
  });
});
