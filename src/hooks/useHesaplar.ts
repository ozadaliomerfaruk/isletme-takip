import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthContext } from '@/contexts/AuthContext';
import { Hesap, HesapInsert, HesapUpdate } from '@/types/database';
import { invalidateRelatedQueries } from '@/lib/queryKeys';
import { toNumber } from '@/lib/currency';
import { useSettings } from './useSettings';
import { useExchangeRates, convertCurrency } from './useExchangeRates';
import i18n from '@/i18n';

export function useHesaplar(includePassive: boolean = false, includeArchived: boolean = false) {
  const { isletme, isletmeLoading } = useAuthContext();

  const query = useQuery({
    queryKey: ['hesaplar', isletme?.id, includePassive, includeArchived],
    queryFn: async () => {
      if (!isletme) return [];

      let queryBuilder = supabase
        .from('hesaplar')
        .select('*')
        .eq('isletme_id', isletme.id)
        .order('created_at', { ascending: true });

      // Arşivlenmiş hesapları dahil et veya hariç tut
      if (!includeArchived) {
        queryBuilder = queryBuilder.eq('is_archived', false);
      }

      // Sadece aktif hesapları getir (varsayılan davranış)
      if (!includePassive) {
        queryBuilder = queryBuilder.eq('is_active', true);
      }

      const { data, error } = await queryBuilder;

      if (error) throw error;
      return data as Hesap[];
    },
    enabled: !!isletme,
    staleTime: 10 * 60 * 1000, // 10 dk - mutation'lar zaten invalidate eder
    gcTime: 30 * 60 * 1000,    // 30 dk cache
  });

  // isletme henüz yükleniyorsa loading olarak göster
  return {
    ...query,
    isLoading: query.isLoading || isletmeLoading,
  };
}

export function useHesap(id: string | undefined) {
  const { isletme } = useAuthContext();

  return useQuery({
    queryKey: ['hesap', id, isletme?.id],
    queryFn: async () => {
      if (!id) return null;

      const { data, error } = await supabase
        .from('hesaplar')
        .select('*')
        .eq('id', id)
        .eq('isletme_id', isletme!.id)
        .single();

      if (error) throw error;
      return data as Hesap;
    },
    enabled: !!id && !!isletme,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

export function useCreateHesap() {
  const queryClient = useQueryClient();
  const { isletme } = useAuthContext();

  return useMutation({
    mutationFn: async (input: Omit<HesapInsert, 'isletme_id'>) => {
      if (!isletme) throw new Error(i18n.t('common:errors.businessNotFound'));

      const { data, error } = await supabase
        .from('hesaplar')
        .insert({ ...input, isletme_id: isletme.id })
        .select()
        .single();

      if (error) throw error;
      return data as Hesap;
    },
    onSuccess: () => {
      // Merkezi invalidation helper kullan
      invalidateRelatedQueries(queryClient, 'hesap');
    },
  });
}

export function useUpdateHesap() {
  const queryClient = useQueryClient();
  const { isletme } = useAuthContext();

  return useMutation({
    mutationFn: async ({ id, ...input }: HesapUpdate & { id: string }) => {
      if (!isletme) throw new Error(i18n.t('common:errors.businessNotFound'));

      const { data, error } = await supabase
        .from('hesaplar')
        .update(input)
        .eq('id', id)
        .eq('isletme_id', isletme.id)
        .select()
        .single();

      if (error) throw error;
      return data as Hesap;
    },
    onSuccess: () => {
      // Merkezi invalidation helper kullan
      invalidateRelatedQueries(queryClient, 'hesap');
    },
  });
}

export function useDeleteHesap() {
  const queryClient = useQueryClient();
  const { isletme } = useAuthContext();

  return useMutation({
    mutationFn: async (id: string) => {
      if (!isletme) throw new Error(i18n.t('common:errors.businessNotFound'));

      // Önce hesabın bu işletmeye ait olduğunu doğrula
      const { data: hesap, error: checkError } = await supabase
        .from('hesaplar')
        .select('id')
        .eq('id', id)
        .eq('isletme_id', isletme.id)
        .single();

      if (checkError || !hesap) {
        throw new Error(i18n.t('common:errors.accountNotFound'));
      }

      // İşlem varsa silmeyi engelle - bakiye bozulmasını önle
      const { count: islemCount } = await supabase
        .from('islemler')
        .select('id', { count: 'exact', head: true })
        .eq('isletme_id', isletme.id)
        .or(`hesap_id.eq.${id},hedef_hesap_id.eq.${id}`);

      if (islemCount && islemCount > 0) {
        throw new Error(i18n.t('errors:accounts.hasTransactions'));
      }

      // İleri tarihli işlem varsa silmeyi engelle
      const { count: ileriCount } = await supabase
        .from('ileri_tarihli_islemler')
        .select('id', { count: 'exact', head: true })
        .eq('isletme_id', isletme.id)
        .or(`hesap_id.eq.${id},hedef_hesap_id.eq.${id}`);

      if (ileriCount && ileriCount > 0) {
        throw new Error(i18n.t('errors:accounts.hasFutureTransactions'));
      }

      // İşlem yoksa güvenle sil
      const { error } = await supabase
        .from('hesaplar')
        .delete()
        .eq('id', id)
        .eq('isletme_id', isletme.id);

      if (error) throw error;
    },
    onSuccess: () => {
      // Merkezi invalidation helper kullan
      invalidateRelatedQueries(queryClient, 'hesap');
    },
  });
}

// Toplam bakiye hesapla (döviz çevrimi ile ana para birimine dönüştür)
export function useTotalBalance() {
  const { data: hesaplar } = useHesaplar();
  const { currency: baseCurrency } = useSettings();
  const { data: exchangeRatesData } = useExchangeRates();
  const exchangeRates = exchangeRatesData?.rates;

  const total = hesaplar?.reduce((acc, h) => {
    const accountCurrency = h.currency || baseCurrency;
    const balance = toNumber(h.balance);
    if (accountCurrency === baseCurrency) {
      return acc + balance;
    }
    // Döviz kuru ile çevir, bulunamazsa orijinal bakiyeyi kullan
    const converted = convertCurrency(balance, accountCurrency, baseCurrency, exchangeRates);
    return acc + (converted ?? balance);
  }, 0) ?? 0;

  return total;
}
