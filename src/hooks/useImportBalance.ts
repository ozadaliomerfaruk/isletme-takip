/**
 * Import Balance Helpers
 * Import edilen işlemler için bakiye hesaplama ve güncelleme fonksiyonları
 */

import { supabase } from '@/lib/supabase';
import { IslemInsert } from '@/types/database';
import { calculateTargetAmount, safeParseExchangeRate } from '@/lib/currency';

/**
 * Atomik bakiye güncelleme RPC çağrısı (network hatalarında retry destekli)
 */
export async function safeIncrementBalance(tableName: string, rowId: string, amount: number, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const { error } = await supabase.rpc('increment_balance', {
        table_name: tableName,
        row_id: rowId,
        amount: amount,
      });
      if (error) {
        throw new Error(`${error.message || error.code || JSON.stringify(error)}`);
      }
      return;
    } catch (err) {
      const isNetworkError = err instanceof TypeError && err.message === 'Network request failed';
      const isRetryable = isNetworkError || (err instanceof Error && err.message.includes('Network'));

      if (isRetryable && attempt < retries) {
        const delay = 500 * Math.pow(2, attempt - 1);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      if (__DEV__) {
        console.error(`safeIncrementBalance hatası (attempt ${attempt}/${retries}): ${tableName}/${rowId} amount=${amount} → ${err instanceof Error ? err.message : String(err)}`);
      }
      throw new Error(`increment_balance(${tableName}, ${rowId}, ${amount}): ${err instanceof Error ? err.message : 'unknown error'}`);
    }
  }
}

/**
 * Cross-currency işlemlerde entity tarafının tutarını hesapla.
 */
function getEntityAmount(islem: IslemInsert): number {
  const rate = safeParseExchangeRate(islem.exchange_rate);
  const src = islem.source_currency || 'TRY';
  const tgt = islem.target_currency || 'TRY';
  if (rate && src !== tgt) {
    return calculateTargetAmount(islem.amount, rate, src, tgt);
  }
  return islem.amount;
}

/**
 * Bir işlemin bakiye değişikliklerini hesapla (RPC çağrısı yapmadan)
 * Import sırasında aggregate bakiye güncellemesi için kullanılır
 */
export function calculateBalanceChanges(islem: IslemInsert): Map<string, number> {
  const changes = new Map<string, number>();
  const amount = islem.amount;

  const addChange = (tableName: string, rowId: string, delta: number) => {
    const key = `${tableName}/${rowId}`;
    changes.set(key, (changes.get(key) || 0) + delta);
  };

  switch (islem.type) {
    case 'gelir':
      if (islem.hesap_id) addChange('hesaplar', islem.hesap_id, amount);
      break;
    case 'gider':
      if (islem.hesap_id) addChange('hesaplar', islem.hesap_id, -amount);
      break;
    case 'transfer': {
      const tgtAmt = getEntityAmount(islem);
      if (islem.hesap_id) addChange('hesaplar', islem.hesap_id, -amount);
      if (islem.hedef_hesap_id) addChange('hesaplar', islem.hedef_hesap_id, tgtAmt);
      break;
    }
    case 'cari_alis':
      if (islem.cari_id) addChange('cariler', islem.cari_id, -amount);
      break;
    case 'cari_satis':
      if (islem.cari_id) addChange('cariler', islem.cari_id, amount);
      break;
    case 'cari_odeme': {
      const eAmt = getEntityAmount(islem);
      if (islem.cari_id) addChange('cariler', islem.cari_id, eAmt);
      if (islem.hesap_id) addChange('hesaplar', islem.hesap_id, -amount);
      break;
    }
    case 'cari_tahsilat': {
      const eAmt = getEntityAmount(islem);
      if (islem.cari_id) addChange('cariler', islem.cari_id, -eAmt);
      if (islem.hesap_id) addChange('hesaplar', islem.hesap_id, amount);
      break;
    }
    case 'personel_gider':
      if (islem.personel_id) addChange('personel', islem.personel_id, -amount);
      break;
    case 'personel_odeme': {
      const eAmt = getEntityAmount(islem);
      if (islem.personel_id) addChange('personel', islem.personel_id, eAmt);
      if (islem.hesap_id) addChange('hesaplar', islem.hesap_id, -amount);
      break;
    }
    case 'personel_tahsilat': {
      const eAmt = getEntityAmount(islem);
      if (islem.personel_id) addChange('personel', islem.personel_id, -eAmt);
      if (islem.hesap_id) addChange('hesaplar', islem.hesap_id, amount);
      break;
    }
    case 'cari_alis_iade':
    case 'cari_satis_iade':
    case 'nakit_avans_taksit':
    default:
      break;
  }

  return changes;
}
