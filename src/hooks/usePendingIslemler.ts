/**
 * usePendingIslemler Hook
 *
 * CRUD operations for pending (skipped) transactions from import
 * These are transactions that couldn't be auto-imported and need manual correction
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthContext } from '@/contexts/AuthContext';
import { invalidateRelatedQueries } from '@/lib/queryKeys';
import { toNumber, safeParseExchangeRate, calculateTargetAmount } from '@/lib/currency';
import type {
  PendingIslem,
  PendingIslemInsert,
  PendingIslemUpdate,
  PendingIslemCorrections,
  IslemInsert,
  IslemType,
} from '@/types/database';

/**
 * Geçerli IslemType değerleri
 * Import sırasında gelen mappedType değerinin doğrulanması için kullanılır
 */
const VALID_ISLEM_TYPES: IslemType[] = [
  'gelir',
  'gider',
  'transfer',
  'cari_alis',
  'cari_satis',
  'cari_odeme',
  'cari_tahsilat',
  'cari_alis_iade',
  'cari_satis_iade',
  'personel_gider',
  'personel_odeme',
  'personel_tahsilat',
  'personel_satis',
];

/**
 * Güvenli bakiye artırma/azaltma
 * initial_balance DEĞİŞTİRMEZ - sadece mevcut bakiyeyi günceller
 */
async function safeIncrementBalance(tableName: string, rowId: string, amount: number) {
  if (!rowId || isNaN(amount)) return;

  const { error } = await supabase.rpc('increment_balance', {
    table_name: tableName,
    row_id: rowId,
    amount: amount,
  });

  if (error) {
    console.error('safeIncrementBalance hatası:', { tableName, rowId, amount, error });
    throw error;
  }
}

type BalanceOp = { table: 'hesaplar' | 'cariler' | 'personel'; id: string; delta: number };

/**
 * İşlem tipine göre uygulanacak bakiye operasyonlarını (saf, async olmayan) üret.
 * Böylece operasyonlar tek tek uygulanıp, kısmi hata durumunda yalnızca UYGULANANLAR
 * geri alınabilir (#7). initial_balance ASLA değişmez.
 */
function buildBalanceOps(islem: Omit<IslemInsert, 'isletme_id'>): BalanceOp[] {
  const amount = toNumber(islem.amount);
  if (amount === 0) return [];

  const exchangeRate = safeParseExchangeRate(islem.exchange_rate);
  const sourceCurrency = islem.source_currency || 'TRY';
  const targetCurrency = islem.target_currency || 'TRY';
  const ops: BalanceOp[] = [];

  switch (islem.type) {
    case 'gelir':
      if (islem.hesap_id) ops.push({ table: 'hesaplar', id: islem.hesap_id, delta: amount });
      break;
    case 'gider':
      if (islem.hesap_id) ops.push({ table: 'hesaplar', id: islem.hesap_id, delta: -amount });
      break;
    case 'transfer':
      if (islem.hesap_id) ops.push({ table: 'hesaplar', id: islem.hesap_id, delta: -amount });
      if (islem.hedef_hesap_id) {
        const targetAmount = calculateTargetAmount(amount, exchangeRate, sourceCurrency, targetCurrency);
        ops.push({ table: 'hesaplar', id: islem.hedef_hesap_id, delta: targetAmount });
      }
      break;
    case 'cari_alis':
      if (islem.cari_id) ops.push({ table: 'cariler', id: islem.cari_id, delta: -amount });
      break;
    case 'cari_satis':
      if (islem.cari_id) ops.push({ table: 'cariler', id: islem.cari_id, delta: amount });
      break;
    case 'cari_odeme': {
      const cariAmount = calculateTargetAmount(amount, exchangeRate, sourceCurrency, targetCurrency);
      if (islem.cari_id) ops.push({ table: 'cariler', id: islem.cari_id, delta: cariAmount });
      if (islem.hesap_id) ops.push({ table: 'hesaplar', id: islem.hesap_id, delta: -amount });
      break;
    }
    case 'cari_tahsilat': {
      const cariAmount = calculateTargetAmount(amount, exchangeRate, sourceCurrency, targetCurrency);
      if (islem.cari_id) ops.push({ table: 'cariler', id: islem.cari_id, delta: -cariAmount });
      if (islem.hesap_id) ops.push({ table: 'hesaplar', id: islem.hesap_id, delta: amount });
      break;
    }
    case 'cari_alis_iade':
      if (islem.cari_id) ops.push({ table: 'cariler', id: islem.cari_id, delta: amount });
      break;
    case 'cari_satis_iade':
      if (islem.cari_id) ops.push({ table: 'cariler', id: islem.cari_id, delta: -amount });
      break;
    case 'personel_gider':
      if (islem.personel_id) ops.push({ table: 'personel', id: islem.personel_id, delta: -amount });
      break;
    case 'personel_odeme': {
      const personelAmount = calculateTargetAmount(amount, exchangeRate, sourceCurrency, targetCurrency);
      if (islem.personel_id) ops.push({ table: 'personel', id: islem.personel_id, delta: personelAmount });
      if (islem.hesap_id) ops.push({ table: 'hesaplar', id: islem.hesap_id, delta: -amount });
      break;
    }
    case 'personel_tahsilat': {
      const personelAmount = calculateTargetAmount(amount, exchangeRate, sourceCurrency, targetCurrency);
      if (islem.personel_id) ops.push({ table: 'personel', id: islem.personel_id, delta: -personelAmount });
      if (islem.hesap_id) ops.push({ table: 'hesaplar', id: islem.hesap_id, delta: amount });
      break;
    }
    case 'personel_satis':
      if (islem.personel_id) ops.push({ table: 'personel', id: islem.personel_id, delta: amount });
      break;
  }
  return ops;
}

/**
 * İşlem tipine göre bakiyeleri güncelle.
 * #7: Operasyonlar tek tek uygulanır; ortada bir operasyon hata verirse YALNIZCA o ana
 * kadar UYGULANANLAR ters delta ile geri alınır (kör tam-reverse over-reverse yapardı).
 * Böylece kısmi başarı kalıcı yanlış bakiye bırakmaz; fonksiyon ya tümünü uygular ya hiçbirini.
 * NOT: initial_balance ASLA güncellenmez - sadece mevcut balance değişir.
 */
async function updateBalancesForPendingTransaction(islem: Omit<IslemInsert, 'isletme_id'>): Promise<void> {
  const ops = buildBalanceOps(islem);
  const applied: BalanceOp[] = [];
  try {
    for (const op of ops) {
      await safeIncrementBalance(op.table, op.id, op.delta);
      applied.push(op);
    }
  } catch (err) {
    // Uygulanan bacakları ters çevirerek geri al (yalnızca gerçekten uygulananlar)
    for (let i = applied.length - 1; i >= 0; i--) {
      const op = applied[i];
      try {
        await safeIncrementBalance(op.table, op.id, -op.delta);
      } catch (reverseError) {
        console.error('CRITICAL: kısmi bakiye geri alma başarısız:', op, reverseError);
      }
    }
    throw err;
  }
}

/**
 * Bakiye güncellemelerini geri al (rollback)
 * updateBalancesForPendingTransaction'ın tersi
 */
async function reverseBalancesForPendingTransaction(islem: Omit<IslemInsert, 'isletme_id'>): Promise<void> {
  const amount = toNumber(islem.amount);
  if (amount === 0) return;

  // Reverse by negating: call update with negated amounts
  const negatedIslem = { ...islem, amount: -amount };
  await updateBalancesForPendingTransaction(negatedIslem);
}

// Query key factory
const pendingIslemlerKeys = {
  all: ['pending-islemler'] as const,
  lists: () => [...pendingIslemlerKeys.all, 'list'] as const,
  list: (isletmeId: string, status?: string) =>
    [...pendingIslemlerKeys.lists(), isletmeId, status] as const,
  count: (isletmeId: string) =>
    [...pendingIslemlerKeys.all, 'count', isletmeId] as const,
  detail: (id: string) => [...pendingIslemlerKeys.all, 'detail', id] as const,
};

/**
 * Fetch all pending transactions
 */
export function usePendingIslemler(status?: 'pending' | 'saved' | 'dismissed') {
  const { isletme } = useAuthContext();

  return useQuery({
    queryKey: pendingIslemlerKeys.list(isletme?.id || '', status),
    queryFn: async () => {
      if (!isletme) return [];

      let query = supabase
        .from('pending_islemler')
        .select('*')
        .eq('isletme_id', isletme.id)
        .order('row_number', { ascending: true });

      if (status) {
        query = query.eq('status', status);
      } else {
        // Default: only show pending ones
        query = query.eq('status', 'pending');
      }

      const { data, error } = await query;
      if (error) throw error;

      return data as PendingIslem[];
    },
    enabled: !!isletme,
  });
}

/**
 * Get count of pending transactions
 */
export function usePendingIslemlerCount() {
  const { isletme } = useAuthContext();

  return useQuery({
    queryKey: pendingIslemlerKeys.count(isletme?.id || ''),
    queryFn: async () => {
      if (!isletme) return 0;

      const { count, error } = await supabase
        .from('pending_islemler')
        .select('*', { count: 'exact', head: true })
        .eq('isletme_id', isletme.id)
        .eq('status', 'pending');

      if (error) throw error;

      return count || 0;
    },
    enabled: !!isletme,
  });
}

/**
 * Batch insert pending transactions (called after import)
 */
export function useCreatePendingIslemler() {
  const { isletme } = useAuthContext();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (items: Omit<PendingIslemInsert, 'isletme_id'>[]) => {
      if (!isletme) throw new Error('No isletme');

      const toInsert = items.map((item) => ({
        ...item,
        isletme_id: isletme.id,
      }));

      const { data, error } = await supabase
        .from('pending_islemler')
        .insert(toInsert)
        .select();

      if (error) throw error;

      return data as PendingIslem[];
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: pendingIslemlerKeys.all,
      });
    },
  });
}

/**
 * Update a pending transaction (save user corrections)
 */
export function useUpdatePendingIslem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: PendingIslemUpdate;
    }) => {
      const { data, error } = await supabase
        .from('pending_islemler')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      return data as PendingIslem;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: pendingIslemlerKeys.all,
      });
    },
  });
}

/**
 * Dismiss a pending transaction (user chose to skip it)
 */
export function useDismissPendingIslem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('pending_islemler')
        .update({ status: 'dismissed' })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: pendingIslemlerKeys.all,
      });
    },
  });
}

/**
 * Delete a pending transaction permanently
 */
export function useDeletePendingIslem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('pending_islemler')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: pendingIslemlerKeys.all,
      });
    },
  });
}

/**
 * Delete all pending transactions for current business
 */
export function useDeleteAllPendingIslemler() {
  const { isletme } = useAuthContext();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (!isletme) throw new Error('No isletme');

      const { error } = await supabase
        .from('pending_islemler')
        .delete()
        .eq('isletme_id', isletme.id)
        .eq('status', 'pending');

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: pendingIslemlerKeys.all,
      });
    },
  });
}

/**
 * Save a pending transaction as a real transaction
 * This creates the islem record, updates balances, and deletes the pending record
 * NOT: initial_balance ASLA güncellenmez - sadece mevcut balance değişir
 */
export function useSavePendingAsIslem() {
  const { isletme } = useAuthContext();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      pendingId,
      islemData,
    }: {
      pendingId: string;
      islemData: Omit<IslemInsert, 'isletme_id'>;
    }) => {
      if (!isletme) throw new Error('No isletme');

      // Insert the real transaction
      const { data: islem, error: islemError } = await supabase
        .from('islemler')
        .insert({
          ...islemData,
          isletme_id: isletme.id,
        })
        .select()
        .single();

      if (islemError) throw islemError;

      // Update balances (sadece mevcut bakiye, initial_balance DEĞİL)
      try {
        await updateBalancesForPendingTransaction(islemData);
      } catch (balanceError) {
        // Bakiye güncelleme hatası - işlemi geri al
        console.error('Bakiye güncelleme hatası:', balanceError);
        await supabase.from('islemler').delete().eq('id', islem.id);
        throw balanceError;
      }

      // Delete the pending record (or mark as saved)
      const { error: deleteError } = await supabase
        .from('pending_islemler')
        .delete()
        .eq('id', pendingId);

      if (deleteError) {
        // If delete fails, rollback both balance changes and the islem record
        try {
          await reverseBalancesForPendingTransaction(islemData);
        } catch (reverseError) {
          console.error('CRITICAL: Bakiye rollback başarısız:', reverseError);
        }
        await supabase.from('islemler').delete().eq('id', islem.id);
        throw deleteError;
      }

      return islem;
    },
    onSuccess: () => {
      // Invalidate all related queries
      queryClient.invalidateQueries({
        queryKey: pendingIslemlerKeys.all,
      });
      // Invalidate related entity queries
      invalidateRelatedQueries(queryClient, 'islem');
      invalidateRelatedQueries(queryClient, 'hesap');
      invalidateRelatedQueries(queryClient, 'cari');
      invalidateRelatedQueries(queryClient, 'personel');
    },
  });
}

/**
 * Build IslemInsert from PendingIslem + corrections
 */
export function buildIslemFromPending(
  pending: PendingIslem,
  corrections: PendingIslemCorrections
): Omit<IslemInsert, 'isletme_id'> {
  const raw = pending.raw_data ?? {} as Record<string, any>;
  const merged = { ...corrections };

  // raw.mappedType'ı güvenli şekilde IslemType'a çevir
  const rawType = raw.mappedType;
  const validatedType: IslemType = merged.type 
    || (VALID_ISLEM_TYPES.includes(rawType as IslemType) ? rawType as IslemType : 'gider');

  return {
    type: validatedType,
    amount: merged.amount ?? raw.amount,
    description: merged.description ?? raw.description,
    date: merged.date ?? raw.date,
    hesap_id: merged.hesap_id ?? null,
    hedef_hesap_id: merged.hedef_hesap_id ?? null,
    kategori_id: merged.kategori_id ?? null,
    cari_id: merged.cari_id ?? null,
    personel_id: merged.personel_id ?? null,
  };
}

export { pendingIslemlerKeys };
