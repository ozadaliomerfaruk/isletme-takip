import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuthContext } from '@/contexts/AuthContext';
import { invalidateRelatedQueries, queryKeys } from '@/lib/queryKeys';
import { supabase } from '@/lib/supabase';
import type { QuickTransactionMinimalAccountScope } from '@/lib/quickTransactionCreateScope';
import type { Currency, HesapType } from '@/types/database';
import { usePermissions } from './usePermissions';

const CURRENCIES = new Set<Currency>(['TRY', 'USD', 'EUR', 'GBP', 'XAU', 'XAG']);
const ACCOUNT_TYPES = new Set<HesapType>([
  'nakit',
  'banka',
  'kredi_karti',
  'birikim',
  'diger',
]);

/**
 * Cari/Personel paylasim akisinin gorebilecegi dar hesap DTO'su.
 *
 * Bu tipe bakiye/limit/kart bilgisi BILEREK eklenmez. RPC yanitini bu dort alana
 * yeniden map ederek beklenmeyen bir server alani React Query cache'ine de sizdirilmaz.
 */
export interface TransactionAccountRef {
  id: string;
  name: string;
  currency: Currency;
  type: HesapType;
}

/** @deprecated TransactionAccountRef kullanın. */
export type CariPaymentAccountRef = TransactionAccountRef;

function parseAccountRefs(value: unknown): TransactionAccountRef[] {
  if (!Array.isArray(value)) {
    throw new Error('Invalid transaction account reference response');
  }

  return value.map((row) => {
    if (
      !row
      || typeof row !== 'object'
      || typeof (row as Record<string, unknown>).id !== 'string'
      || typeof (row as Record<string, unknown>).name !== 'string'
      || typeof (row as Record<string, unknown>).currency !== 'string'
      || typeof (row as Record<string, unknown>).type !== 'string'
      || !CURRENCIES.has((row as Record<string, unknown>).currency as Currency)
      || !ACCOUNT_TYPES.has((row as Record<string, unknown>).type as HesapType)
      || (row as Record<string, unknown>).type === 'birikim'
    ) {
      throw new Error('Invalid transaction account reference row');
    }

    return {
      id: (row as Record<string, string>).id,
      name: (row as Record<string, string>).name,
      currency: (row as Record<string, string>).currency as Currency,
      type: (row as Record<string, string>).type as HesapType,
    };
  });
}

/**
 * Yalniz shared + Hesaplar kapali + ilgili Cari/Personel modulu acik baglamda calisir.
 * Bu sorgu sadece ad/tur/para birimi referansidir; asil create/update yetkisini
 * mutation RPC'si islem tipi ve kayit kapsamiyla yeniden dogrular.
 */
export function useTransactionAccountRefs(
  scope: QuickTransactionMinimalAccountScope,
  enabled = true,
) {
  const { isletme, isOwner, isSharedMode } = useAuthContext();
  const { canAccessModule } = usePermissions();
  const parentModule = scope === 'cari' ? 'cariler' : 'personel';
  const allowed =
    enabled
    && isSharedMode
    && !isOwner
    && canAccessModule(parentModule)
    && !canAccessModule('hesaplar')
    && !!isletme?.id;

  return useQuery({
    queryKey: queryKeys.hesaplar.transactionReferences(
      isletme?.id ?? '',
      scope,
    ),
    enabled: allowed,
    queryFn: async (): Promise<TransactionAccountRef[]> => {
      if (!allowed || !isletme?.id) {
        throw new Error('Transaction account references are not authorized');
      }

      const { data, error } = await supabase.rpc('get_islem_hesap_referanslari_v2', {
        p_isletme_id: isletme.id,
        p_scope: scope,
      });
      if (error) throw error;
      return parseAccountRefs(data);
    },
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    // Hesap adlari dahi paylasilan isletme baglamindan cikinca diskte kalmasin.
    meta: {
      persist: false,
      query_purpose: `hesaplar:${scope}-transaction-references`,
    },
  });
}

/**
 * Eski Cariler-only tüketicileri ortak RPC'ye taşırken dış API'yi korur.
 */
export function useCariPaymentAccountRefs(enabled = true) {
  return useTransactionAccountRefs('cari', enabled);
}

export interface CreateCariCashTransactionInput {
  islemId: string;
  type: 'cari_odeme' | 'cari_tahsilat';
  amount: number;
  date: string;
  hesapId: string;
  cariId: string;
  description: string | null;
  exchangeRate: number | null;
  hedefIslemId: string | null;
}

/**
 * Client-balance-op almayan dedicated S-11 RPC mutation'i.
 * UUID ve payload fingerprint'i QTB tarafinda, ag isteginden once sabitlenir.
 */
export function useCreateCariCashTransaction() {
  const queryClient = useQueryClient();
  const { isletme } = useAuthContext();

  return useMutation({
    retry: false,
    mutationFn: async (input: CreateCariCashTransactionInput) => {
      if (!isletme?.id) {
        throw new Error('Business not found');
      }

      const { data, error } = await supabase.rpc('create_cari_nakit_islem_atomik', {
        p_isletme_id: isletme.id,
        p_islem_id: input.islemId,
        p_type: input.type,
        p_amount: input.amount,
        p_date: input.date,
        p_hesap_id: input.hesapId,
        p_cari_id: input.cariId,
        p_description: input.description,
        p_kategori_id: null,
        p_exchange_rate: input.exchangeRate,
        p_hedef_islem_id: input.hedefIslemId,
      });
      if (error) throw error;

      const row = Array.isArray(data) ? data[0] : data;
      const returnedId =
        row && typeof row === 'object'
          ? (row as { id?: unknown }).id
          : undefined;
      if (typeof returnedId !== 'string') {
        throw new Error('Invalid cari cash transaction response');
      }
      return { id: returnedId };
    },
    onSuccess: () => {
      // RPC islem + hesap + cari bakiyesini ve FIFO tahsisini tek transaction'da yazar.
      invalidateRelatedQueries(queryClient, 'islem');
      invalidateRelatedQueries(queryClient, 'hesap');
      invalidateRelatedQueries(queryClient, 'cari');
    },
  });
}
