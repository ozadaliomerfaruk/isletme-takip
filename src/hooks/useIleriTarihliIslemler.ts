import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthContext } from '@/contexts/AuthContext';
import {
  IleriTarihliIslem,
  IleriTarihliIslemInsert,
  IleriTarihliIslemUpdate,
  IleriTarihliIslemWithRelations,
  IslemInsert,
} from '@/types/database';
import { queryKeys, invalidateRelatedQueries } from '@/lib/queryKeys';
import { formatDateForDB } from '@/lib/date';
import { cancelTransactionReminder } from '@/lib/notifications';

// ============================================================================
// QUERY HOOKS
// ============================================================================

/**
 * Tüm ileri tarihli işlemleri getir (pending olanlar)
 */
export function useIleriTarihliIslemler() {
  const { isletme, isletmeLoading } = useAuthContext();

  const result = useQuery({
    queryKey: queryKeys.ileriTarihliIslemler.pending(isletme?.id || ''),
    queryFn: async () => {
      if (!isletme) return [];

      const { data, error } = await supabase
        .from('ileri_tarihli_islemler')
        .select(`
          *,
          hesap:hesaplar!hesap_id(*),
          hedef_hesap:hesaplar!hedef_hesap_id(*),
          kategori:kategoriler(*),
          cari:cariler(*),
          personel:personel(*)
        `)
        .eq('isletme_id', isletme.id)
        .eq('status', 'pending')
        .order('scheduled_date', { ascending: true });

      if (error) throw error;
      return data as IleriTarihliIslemWithRelations[];
    },
    enabled: !!isletme,
  });

  return {
    ...result,
    isLoading: result.isLoading || isletmeLoading,
  };
}

/**
 * Tek ileri tarihli işlem getir
 */
export function useIleriTarihliIslem(id: string | undefined) {
  const { isletme } = useAuthContext();

  return useQuery({
    queryKey: queryKeys.ileriTarihliIslemler.detail(id || ''),
    queryFn: async () => {
      if (!id || !isletme) return null;

      const { data, error } = await supabase
        .from('ileri_tarihli_islemler')
        .select(`
          *,
          hesap:hesaplar!hesap_id(*),
          hedef_hesap:hesaplar!hedef_hesap_id(*),
          kategori:kategoriler(*),
          cari:cariler(*),
          personel:personel(*)
        `)
        .eq('id', id)
        .eq('isletme_id', isletme.id)
        .single();

      if (error) throw error;
      return data as IleriTarihliIslemWithRelations;
    },
    enabled: !!id && !!isletme,
  });
}

/**
 * Hesaba ait ileri tarihli işlemler
 */
export function useIleriTarihliIslemlerByHesap(hesapId: string) {
  const { isletme } = useAuthContext();

  return useQuery({
    queryKey: queryKeys.ileriTarihliIslemler.byHesap(hesapId, isletme?.id || ''),
    queryFn: async () => {
      if (!isletme || !hesapId) return [];

      const { data, error } = await supabase
        .from('ileri_tarihli_islemler')
        .select(`
          *,
          kategori:kategoriler(*)
        `)
        .eq('isletme_id', isletme.id)
        .eq('status', 'pending')
        .or(`hesap_id.eq.${hesapId},hedef_hesap_id.eq.${hesapId}`)
        .order('scheduled_date', { ascending: true });

      if (error) throw error;
      return data as IleriTarihliIslemWithRelations[];
    },
    enabled: !!isletme && !!hesapId,
  });
}

/**
 * Cariye ait ileri tarihli işlemler
 */
export function useIleriTarihliIslemlerByCari(cariId: string) {
  const { isletme } = useAuthContext();

  return useQuery({
    queryKey: queryKeys.ileriTarihliIslemler.byCari(cariId, isletme?.id || ''),
    queryFn: async () => {
      if (!isletme || !cariId) return [];

      const { data, error } = await supabase
        .from('ileri_tarihli_islemler')
        .select(`
          *,
          kategori:kategoriler(*)
        `)
        .eq('isletme_id', isletme.id)
        .eq('status', 'pending')
        .eq('cari_id', cariId)
        .order('scheduled_date', { ascending: true });

      if (error) throw error;
      return data as IleriTarihliIslemWithRelations[];
    },
    enabled: !!isletme && !!cariId,
  });
}

/**
 * Personele ait ileri tarihli işlemler
 */
export function useIleriTarihliIslemlerByPersonel(personelId: string) {
  const { isletme } = useAuthContext();

  return useQuery({
    queryKey: queryKeys.ileriTarihliIslemler.byPersonel(personelId, isletme?.id || ''),
    queryFn: async () => {
      if (!isletme || !personelId) return [];

      const { data, error } = await supabase
        .from('ileri_tarihli_islemler')
        .select(`
          *,
          kategori:kategoriler(*)
        `)
        .eq('isletme_id', isletme.id)
        .eq('status', 'pending')
        .eq('personel_id', personelId)
        .order('scheduled_date', { ascending: true });

      if (error) throw error;
      return data as IleriTarihliIslemWithRelations[];
    },
    enabled: !!isletme && !!personelId,
  });
}

/**
 * Bekleyen ileri tarihli işlem sayısı
 */
export function usePendingIleriTarihliCount() {
  const { data, isLoading } = useIleriTarihliIslemler();
  return {
    count: data?.length || 0,
    isLoading,
  };
}

/**
 * Bugün yapılacak işlemler (pending veya notified)
 */
export function useTodayIleriTarihliIslemler() {
  const { isletme, isletmeLoading } = useAuthContext();

  const result = useQuery({
    queryKey: queryKeys.ileriTarihliIslemler.today(isletme?.id || ''),
    queryFn: async () => {
      if (!isletme) return [];

      const today = formatDateForDB(new Date());

      const { data, error } = await supabase
        .from('ileri_tarihli_islemler')
        .select(`
          *,
          hesap:hesaplar!hesap_id(*),
          hedef_hesap:hesaplar!hedef_hesap_id(*),
          kategori:kategoriler(*),
          cari:cariler(*),
          personel:personel(*)
        `)
        .eq('isletme_id', isletme.id)
        .eq('scheduled_date', today)
        .in('status', ['pending', 'notified'])
        .order('created_at', { ascending: true });

      if (error) throw error;
      return data as IleriTarihliIslemWithRelations[];
    },
    enabled: !!isletme,
  });

  return {
    ...result,
    isLoading: result.isLoading || isletmeLoading,
  };
}

// ============================================================================
// MUTATION HOOKS
// ============================================================================

/**
 * Yeni ileri tarihli işlem oluştur
 */
export function useCreateIleriTarihliIslem() {
  const queryClient = useQueryClient();
  const { isletme } = useAuthContext();

  return useMutation({
    mutationFn: async (input: Omit<IleriTarihliIslemInsert, 'isletme_id'>) => {
      if (!isletme) throw new Error('İşletme bulunamadı');

      const { data, error } = await supabase
        .from('ileri_tarihli_islemler')
        .insert({
          ...input,
          isletme_id: isletme.id,
          status: 'pending',
        })
        .select()
        .single();

      if (error) throw error;
      return data as IleriTarihliIslem;
    },
    onSuccess: () => {
      invalidateRelatedQueries(queryClient, 'ileriTarihliIslem');
    },
  });
}

/**
 * İleri tarihli işlem güncelle
 */
export function useUpdateIleriTarihliIslem() {
  const queryClient = useQueryClient();
  const { isletme } = useAuthContext();

  return useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: IleriTarihliIslemUpdate;
    }) => {
      if (!isletme) throw new Error('İşletme bulunamadı');

      const { data, error } = await supabase
        .from('ileri_tarihli_islemler')
        .update(updates)
        .eq('id', id)
        .eq('isletme_id', isletme.id)
        .select()
        .single();

      if (error) throw error;
      return data as IleriTarihliIslem;
    },
    onSuccess: () => {
      invalidateRelatedQueries(queryClient, 'ileriTarihliIslem');
    },
  });
}

/**
 * İleri tarihli işlem sil
 */
export function useDeleteIleriTarihliIslem() {
  const queryClient = useQueryClient();
  const { isletme } = useAuthContext();

  return useMutation({
    mutationFn: async (id: string) => {
      if (!isletme) throw new Error('İşletme bulunamadı');

      // Önce hatırlatıcıyı iptal et
      await cancelTransactionReminder(id);

      const { error } = await supabase
        .from('ileri_tarihli_islemler')
        .delete()
        .eq('id', id)
        .eq('isletme_id', isletme.id);

      if (error) throw error;
    },
    onSuccess: () => {
      invalidateRelatedQueries(queryClient, 'ileriTarihliIslem');
    },
  });
}

/**
 * İşlem gerçekleşti - ileri tarihli işlemi gerçek işleme dönüştür
 */
export function useCompleteIleriTarihliIslem() {
  const queryClient = useQueryClient();
  const { isletme } = useAuthContext();

  return useMutation({
    mutationFn: async (id: string) => {
      if (!isletme) throw new Error('İşletme bulunamadı');

      // 0. Hatırlatıcıyı iptal et (varsa)
      await cancelTransactionReminder(id);

      // 1. İleri tarihli işlemi al
      const { data: ileriIslem, error: fetchError } = await supabase
        .from('ileri_tarihli_islemler')
        .select('*')
        .eq('id', id)
        .eq('isletme_id', isletme.id)
        .single();

      if (fetchError) throw fetchError;
      if (!ileriIslem) throw new Error('İşlem bulunamadı');

      // 2. Gerçek işlem olarak oluştur
      const islemData: IslemInsert = {
        isletme_id: isletme.id,
        type: ileriIslem.type,
        amount: ileriIslem.amount,
        description: ileriIslem.description,
        date: formatDateForDB(new Date()), // Bugünün tarihi
        hesap_id: ileriIslem.hesap_id,
        hedef_hesap_id: ileriIslem.hedef_hesap_id,
        kategori_id: ileriIslem.kategori_id,
        cari_id: ileriIslem.cari_id,
        personel_id: ileriIslem.personel_id,
      };

      const { data: newIslem, error: insertError } = await supabase
        .from('islemler')
        .insert(islemData)
        .select()
        .single();

      if (insertError) throw insertError;

      // 3. Bakiyeleri güncelle
      try {
        await updateBalancesForIslem(islemData);
      } catch (balanceError) {
        // Rollback: oluşturulan işlemi sil
        await supabase.from('islemler').delete().eq('id', newIslem.id);
        throw balanceError;
      }

      // 4. İleri tarihli işlemi completed olarak işaretle
      const { error: updateError } = await supabase
        .from('ileri_tarihli_islemler')
        .update({ status: 'completed' })
        .eq('id', id)
        .eq('isletme_id', isletme.id);

      if (updateError) {
        // Rollback: oluşturulan işlemi sil
        await supabase.from('islemler').delete().eq('id', newIslem.id);
        await reverseBalancesForIslem(islemData);
        throw updateError;
      }

      return newIslem;
    },
    onSuccess: () => {
      // Hem ileri tarihli işlemler hem de normal işlemler invalidate et
      invalidateRelatedQueries(queryClient, 'ileriTarihliIslem');
      invalidateRelatedQueries(queryClient, 'islem');
    },
  });
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

async function safeIncrementBalance(tableName: string, rowId: string, amount: number) {
  const { error } = await supabase.rpc('increment_balance', {
    table_name: tableName,
    row_id: rowId,
    amount: amount,
  });

  if (error) {
    if (__DEV__) {
      console.error(`Bakiye güncelleme hatası (${tableName}):`, error);
    }
    throw new Error(`Bakiye güncellenemedi: ${error.message}`);
  }
}

async function updateBalancesForIslem(islem: IslemInsert) {
  const amount = Number(islem.amount);

  switch (islem.type) {
    case 'gelir':
      if (islem.hesap_id) {
        await safeIncrementBalance('hesaplar', islem.hesap_id, amount);
      }
      break;

    case 'gider':
      if (islem.hesap_id) {
        await safeIncrementBalance('hesaplar', islem.hesap_id, -amount);
      }
      break;

    case 'transfer':
      if (islem.hesap_id) {
        await safeIncrementBalance('hesaplar', islem.hesap_id, -amount);
      }
      if (islem.hedef_hesap_id) {
        await safeIncrementBalance('hesaplar', islem.hedef_hesap_id, amount);
      }
      break;

    case 'cari_alis':
      if (islem.cari_id) {
        await safeIncrementBalance('cariler', islem.cari_id, -amount);
      }
      break;

    case 'cari_satis':
      if (islem.cari_id) {
        await safeIncrementBalance('cariler', islem.cari_id, amount);
      }
      break;

    case 'cari_odeme':
      if (islem.cari_id) {
        await safeIncrementBalance('cariler', islem.cari_id, amount);
      }
      if (islem.hesap_id) {
        await safeIncrementBalance('hesaplar', islem.hesap_id, -amount);
      }
      break;

    case 'cari_tahsilat':
      if (islem.cari_id) {
        await safeIncrementBalance('cariler', islem.cari_id, -amount);
      }
      if (islem.hesap_id) {
        await safeIncrementBalance('hesaplar', islem.hesap_id, amount);
      }
      break;

    case 'personel_gider':
      if (islem.personel_id) {
        await safeIncrementBalance('personel', islem.personel_id, -amount);
      }
      break;

    case 'personel_odeme':
      if (islem.personel_id) {
        await safeIncrementBalance('personel', islem.personel_id, amount);
      }
      if (islem.hesap_id) {
        await safeIncrementBalance('hesaplar', islem.hesap_id, -amount);
      }
      break;

    case 'cari_alis_iade':
      if (islem.cari_id) {
        await safeIncrementBalance('cariler', islem.cari_id, amount);
      }
      break;

    case 'cari_satis_iade':
      if (islem.cari_id) {
        await safeIncrementBalance('cariler', islem.cari_id, -amount);
      }
      break;

    case 'personel_tahsilat':
      if (islem.personel_id) {
        await safeIncrementBalance('personel', islem.personel_id, -amount);
      }
      if (islem.hesap_id) {
        await safeIncrementBalance('hesaplar', islem.hesap_id, amount);
      }
      break;

    case 'personel_satis':
      if (islem.personel_id) {
        await safeIncrementBalance('personel', islem.personel_id, amount);
      }
      break;

    case 'nakit_avans_taksit':
      if (islem.hesap_id) {
        await safeIncrementBalance('hesaplar', islem.hesap_id, -amount);
      }
      break;
  }
}

async function reverseBalancesForIslem(islem: IslemInsert) {
  const amount = Number(islem.amount);

  switch (islem.type) {
    case 'gelir':
      if (islem.hesap_id) {
        await safeIncrementBalance('hesaplar', islem.hesap_id, -amount);
      }
      break;

    case 'gider':
      if (islem.hesap_id) {
        await safeIncrementBalance('hesaplar', islem.hesap_id, amount);
      }
      break;

    case 'transfer':
      if (islem.hesap_id) {
        await safeIncrementBalance('hesaplar', islem.hesap_id, amount);
      }
      if (islem.hedef_hesap_id) {
        await safeIncrementBalance('hesaplar', islem.hedef_hesap_id, -amount);
      }
      break;

    case 'cari_alis':
      if (islem.cari_id) {
        await safeIncrementBalance('cariler', islem.cari_id, amount);
      }
      break;

    case 'cari_satis':
      if (islem.cari_id) {
        await safeIncrementBalance('cariler', islem.cari_id, -amount);
      }
      break;

    case 'cari_odeme':
      if (islem.cari_id) {
        await safeIncrementBalance('cariler', islem.cari_id, -amount);
      }
      if (islem.hesap_id) {
        await safeIncrementBalance('hesaplar', islem.hesap_id, amount);
      }
      break;

    case 'cari_tahsilat':
      if (islem.cari_id) {
        await safeIncrementBalance('cariler', islem.cari_id, amount);
      }
      if (islem.hesap_id) {
        await safeIncrementBalance('hesaplar', islem.hesap_id, -amount);
      }
      break;

    case 'personel_gider':
      if (islem.personel_id) {
        await safeIncrementBalance('personel', islem.personel_id, amount);
      }
      break;

    case 'personel_odeme':
      if (islem.personel_id) {
        await safeIncrementBalance('personel', islem.personel_id, -amount);
      }
      if (islem.hesap_id) {
        await safeIncrementBalance('hesaplar', islem.hesap_id, amount);
      }
      break;

    case 'cari_alis_iade':
      if (islem.cari_id) {
        await safeIncrementBalance('cariler', islem.cari_id, -amount);
      }
      break;

    case 'cari_satis_iade':
      if (islem.cari_id) {
        await safeIncrementBalance('cariler', islem.cari_id, amount);
      }
      break;

    case 'personel_tahsilat':
      if (islem.personel_id) {
        await safeIncrementBalance('personel', islem.personel_id, amount);
      }
      if (islem.hesap_id) {
        await safeIncrementBalance('hesaplar', islem.hesap_id, -amount);
      }
      break;

    case 'personel_satis':
      if (islem.personel_id) {
        await safeIncrementBalance('personel', islem.personel_id, -amount);
      }
      break;

    case 'nakit_avans_taksit':
      if (islem.hesap_id) {
        await safeIncrementBalance('hesaplar', islem.hesap_id, amount);
      }
      break;
  }
}
