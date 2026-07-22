/**
 * Import Duplicate Check
 * Import öncesi duplicate işlem kontrolü
 */

import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuthContext } from '@/contexts/AuthContext';
import { ParsedTransaction } from '@/lib/excelImport';
import { DuplicateInfo } from './useDataImport.types';

/** Açıklamayı karşılaştırma için normalize et (boşluk/büyük-küçük harf farkını yok say). */
function normalizeDesc(desc: string | null | undefined): string {
  return (desc || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Import öncesi duplicate kontrolü
 * Anahtar: tarih + tutar + iç işlem tipi + açıklama.
 * Sadece tarih+tutar kullanmak, aynı gün aynı tutarlı MEŞRU işlemleri yanlışlıkla
 * "duplicate" işaretliyordu; tip+açıklama eklenerek yanlış-pozitifler azaltıldı.
 */
async function checkForDuplicates(
  transactions: ParsedTransaction[],
  isletmeId: string
): Promise<Map<number, DuplicateInfo>> {
  const duplicates = new Map<number, DuplicateInfo>();

  const validTransactions = transactions.filter(tx => tx.dateValid && tx.date);
  if (validTransactions.length === 0) return duplicates;

  const uniqueDates = [...new Set(validTransactions.filter(tx => tx.date).map(tx => tx.date!.split('T')[0]))].sort();

  try {
    const { data: existingIslemler, error } = await supabase
      .from('islemler')
      .select('id, date, amount, type, description')
      .eq('isletme_id', isletmeId)
      .gte('date', uniqueDates[0] + 'T00:00:00')
      .lte('date', uniqueDates[uniqueDates.length - 1] + 'T23:59:59');

    if (error) {
      if (__DEV__) console.error('Duplicate check error:', error);
      return duplicates;
    }

    if (!existingIslemler || existingIslemler.length === 0) return duplicates;

    const existingMap = new Map<string, { id: string; date: string; amount: number }>();
    existingIslemler.forEach(islem => {
      const dateOnly = islem.date.split('T')[0];
      const key = `${dateOnly}|${islem.amount}|${islem.type ?? ''}|${normalizeDesc(islem.description)}`;
      // İlk eşleşmeyi koru (aynı imzadan birden fazla varsa ilkini duplicate referansı yap)
      if (!existingMap.has(key)) {
        existingMap.set(key, { id: islem.id, date: islem.date, amount: islem.amount });
      }
    });

    transactions.forEach((tx, idx) => {
      if (!tx.dateValid || !tx.date) return;
      const dateOnly = tx.date.split('T')[0];
      const key = `${dateOnly}|${tx.amount}|${tx.mappedType ?? ''}|${normalizeDesc(tx.description)}`;
      const existing = existingMap.get(key);
      if (existing) {
        duplicates.set(idx, {
          rowIndex: idx,
          existingId: existing.id,
          existingDate: existing.date,
          existingAmount: existing.amount,
        });
      }
    });
  } catch (err) {
    if (__DEV__) console.error('Duplicate check exception:', err);
  }

  return duplicates;
}

export function useImportDuplicates() {
  const { isletme } = useAuthContext();
  const [duplicates, setDuplicates] = useState<Map<number, DuplicateInfo>>(new Map());

  const runDuplicateCheck = useCallback(async (
    transactions: ParsedTransaction[]
  ): Promise<Map<number, DuplicateInfo>> => {
    if (!isletme) return new Map();
    const result = await checkForDuplicates(transactions, isletme.id);
    setDuplicates(result);
    return result;
  }, [isletme]);

  const resetDuplicates = useCallback(() => {
    setDuplicates(new Map());
  }, []);

  return { duplicates, runDuplicateCheck, resetDuplicates };
}
