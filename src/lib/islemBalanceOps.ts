import { IslemType } from '@/types/database';
import { safeParseAmount, safeParseExchangeRate, calculateTargetAmount } from '@/lib/currency';

export type BalanceTable = 'hesaplar' | 'cariler' | 'personel';

/** Tek bir bakiye değişimi: `<tablo>.balance += d` (id o tablonun satır id'si). */
export interface BalanceOp {
  t: BalanceTable;
  id: string;
  d: number;
}

/** updateBalances/reverseBalances'in ihtiyaç duyduğu ortak işlem alanları. */
export interface BalanceIslemInput {
  type?: IslemType | null;
  amount: number | string;
  exchange_rate?: number | string | null;
  source_currency?: string | null;
  target_currency?: string | null;
  hesap_id?: string | null;
  hedef_hesap_id?: string | null;
  cari_id?: string | null;
  personel_id?: string | null;
}

/**
 * Bir işlemin bakiyelere UYGULANACAK (apply) etkisini {tablo,id,delta} listesi olarak
 * döndürür — SAF fonksiyon (yan etkisiz, test edilebilir).
 *
 * Geri alma (reverse) = her delta'nın negatifi (bkz. reverseBalanceOps). Bu, eski
 * updateBalances (apply) ve reverseBalances (= -apply) switch mantığının TEK KAYNAĞIdır;
 * hem app-side executor (safeIncrementBalance döngüsü) hem atomik silme RPC'si aynı
 * deltaları kullanır → ikisi asla ayrışmaz. Çapraz-para matematiği eskisiyle birebir
 * (calculateTargetAmount) — hesap kendi para biriminde, cari/personel/hedef karşı
 * para biriminde işler.
 */
export function computeBalanceOps(islem: BalanceIslemInput): BalanceOp[] {
  const amount = safeParseAmount(islem.amount, 'işlem tutarı');
  const exchangeRate = safeParseExchangeRate(islem.exchange_rate);
  const ops: BalanceOp[] = [];
  const push = (t: BalanceTable, id: string | null | undefined, d: number) => {
    if (id) ops.push({ t, id, d });
  };
  // Karşı-para tutarı (hesap≠karşı taraf para birimi ise dönüştürülmüş)
  const converted = () =>
    calculateTargetAmount(amount, exchangeRate, islem.source_currency || 'TRY', islem.target_currency || 'TRY');

  switch (islem.type) {
    case 'gelir':
      push('hesaplar', islem.hesap_id, amount);
      break;
    case 'gider':
      push('hesaplar', islem.hesap_id, -amount);
      break;
    case 'transfer':
      push('hesaplar', islem.hesap_id, -amount);
      push('hesaplar', islem.hedef_hesap_id, converted());
      break;
    case 'cari_alis':
      push('cariler', islem.cari_id, -amount);
      break;
    case 'cari_satis':
      push('cariler', islem.cari_id, amount);
      break;
    case 'cari_odeme':
      push('cariler', islem.cari_id, converted());
      push('hesaplar', islem.hesap_id, -amount);
      break;
    case 'cari_tahsilat':
      push('cariler', islem.cari_id, -converted());
      push('hesaplar', islem.hesap_id, amount);
      break;
    case 'personel_gider':
      push('personel', islem.personel_id, -amount);
      break;
    case 'personel_odeme':
      push('personel', islem.personel_id, converted());
      push('hesaplar', islem.hesap_id, -amount);
      break;
    case 'cari_alis_iade':
      push('cariler', islem.cari_id, amount);
      break;
    case 'cari_satis_iade':
      push('cariler', islem.cari_id, -amount);
      break;
    case 'personel_tahsilat':
      push('personel', islem.personel_id, -converted());
      push('hesaplar', islem.hesap_id, amount);
      break;
    case 'personel_satis':
      push('personel', islem.personel_id, amount);
      break;
    // cari_odeme/tahsilat vb. dışında bakiye etkilemeyen tipler (transfer haric)
    // için op üretilmez (eski switch'te default yok = no-op).
  }
  return ops;
}

/** Bir işlemin bakiye etkisini GERİ ALAN ops (silme/düzeltme için): her delta negatiflenir. */
export function reverseBalanceOps(ops: BalanceOp[]): BalanceOp[] {
  return ops.map((o) => ({ ...o, d: -o.d }));
}
