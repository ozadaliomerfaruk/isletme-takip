/**
 * Mutabakat — uygulama adaptörü (modülün RN/uygulama tarafına bağlanan TEK dosyası).
 * islemler satırlarını cari para birimindeki işaretli kalemlere çevirir.
 */

import { calculateTargetAmount, toNumber } from '@/lib/currency';
import { CARI_SIGN } from './engine';
import { epochDayOf, toKurus } from './helpers';
import type { CariIslemTipi, CariType, DefterKalemi } from './types';

/** Motorun ihtiyaç duyduğu asgari işlem alanları (IslemWithRelations uyumlu) */
export interface IslemSatiri {
  id: string;
  type: string;
  amount: number | string;
  date: string;
  description: string | null;
  source_currency?: string | null;
  target_currency?: string | null;
  exchange_rate?: number | string | null;
}

const MUSTERI_TIPLERI = new Set<string>(['cari_satis', 'cari_tahsilat', 'cari_satis_iade']);
const TEDARIKCI_TIPLERI = new Set<string>(['cari_alis', 'cari_odeme', 'cari_alis_iade']);

/**
 * Carinin işlemlerini normalize kalemlere çevirir.
 * Tutar, cari detay ekranındaki getCariDisplayAmount ile aynı mantıkla cari
 * para birimine çevrilir: ödeme/tahsilatta exchange_rate varsa dönüşüm,
 * alış/satışta amount aynen (fatura zaten cari para birimindedir).
 */
export function buildDefterKalemleri(islemler: IslemSatiri[], cariType: CariType): DefterKalemi[] {
  const uyumluTipler = cariType === 'musteri' ? MUSTERI_TIPLERI : TEDARIKCI_TIPLERI;
  const kalemler: DefterKalemi[] = [];

  for (const islem of islemler) {
    const sign = CARI_SIGN[islem.type];
    if (!sign) continue; // cari dışı tip (savunmacı — sorgu zaten cari_id filtreli)

    const amount = toNumber(islem.amount);
    let cariAmount = amount;
    const source = islem.source_currency;
    const target = islem.target_currency;
    const rate = toNumber(islem.exchange_rate);
    if (source && target && source !== target && rate) {
      try {
        cariAmount = calculateTargetAmount(amount, rate, source, target);
      } catch {
        cariAmount = amount;
      }
    }

    const amountKurus = Math.abs(toKurus(cariAmount));
    const date = islem.date.slice(0, 10);
    kalemler.push({
      islemId: islem.id,
      date,
      epochDay: epochDayOf(date),
      description: islem.description ?? '',
      type: islem.type as CariIslemTipi,
      amountKurus,
      signedKurus: sign * amountKurus,
      tipUyumsuz: !uyumluTipler.has(islem.type),
    });
  }

  return kalemler;
}
