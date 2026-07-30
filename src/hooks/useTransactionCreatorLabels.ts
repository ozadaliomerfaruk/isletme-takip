import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuthContext } from '@/contexts/AuthContext';
import { queryKeys } from '@/lib/queryKeys';
import { supabase } from '@/lib/supabase';
import {
  getTransactionCreatorLabel,
  type TransactionCreatorLabelMap,
  type TransactionCreatorSource,
} from '@/lib/transactionCreatorLabel';

interface TransactionCreatorLabelRow {
  user_id: string;
  member_label: string | null;
}

const EMPTY_LABELS: TransactionCreatorLabelMap = Object.freeze({});

/**
 * İşletme üye etiketlerini tenant başına tek minimal sorguda getirir.
 *
 * Status filtresi bilinçli olarak yoktur: kaldırılmış/askıya alınmış üyelerin
 * tarihsel işlem satırları owner tarafından verilen etiketi korur. Dar RPC,
 * owner veya işlem kaynağı açık aktif shared kullanıcıya yalnız gerçekten işlem
 * oluşturmuş üyelerin user_id + member_label projeksiyonunu döndürür. Kayıt
 * görünürlüğü dar kullanıcıda yalnız kendi üyelik satırı döner; temel
 * isletme_users RLS'i genişlemez.
 */
export function useTransactionCreatorLabels() {
  const { isletme } = useAuthContext();

  return useQuery({
    queryKey: queryKeys.multiUser.creatorLabels(isletme?.id ?? ''),
    queryFn: async (): Promise<TransactionCreatorLabelMap> => {
      if (!isletme) return EMPTY_LABELS;

      const { data, error } = await supabase.rpc(
        'get_transaction_creator_labels',
        { p_isletme_id: isletme.id },
      );

      if (error) throw error;

      const labels: Record<string, string | null> = {};
      for (const row of (data ?? []) as TransactionCreatorLabelRow[]) {
        if (typeof row.user_id === 'string' && row.user_id.length > 0) {
          labels[row.user_id] =
            typeof row.member_label === 'string' ? row.member_label : null;
        }
      }
      return labels;
    },
    enabled: !!isletme,
    staleTime: 5 * 60 * 1000,
    // Kullanıcı etiketi kişisel veri sayılabilir; küçük sorguyu şifresiz disk
    // cache'ine yazma. Bellek cache'i tenant anahtarlı ve logout'ta temizlenir.
    meta: { persist: false },
  });
}

/** Aynı cache'i kullanan, satır bileşenlerinin paylaşacağı merkezi resolver. */
export function useTransactionCreatorLabelResolver() {
  const { t } = useTranslation('transactions');
  const { isletme, user } = useAuthContext();
  const { data: memberLabels = EMPTY_LABELS } = useTransactionCreatorLabels();

  return useCallback(
    (transaction: TransactionCreatorSource) =>
      getTransactionCreatorLabel(transaction, {
        activeIsletmeId: isletme?.id,
        viewerUserId: user?.id,
        memberLabels,
        fallbackLabel: t('creatorLabel.sharedUser'),
      }),
    [isletme?.id, memberLabels, t, user?.id],
  );
}
