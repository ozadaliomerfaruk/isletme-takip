import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthContext } from '@/contexts/AuthContext';
import { Islem, IslemInsert, IslemWithRelations, IslemType } from '@/types/database';

interface IslemFilters {
  type?: IslemType;
  hesapId?: string;
  cariId?: string;
  personelId?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
}

export function useIslemler(filters?: IslemFilters) {
  const { isletme, isletmeLoading } = useAuthContext();

  const result = useQuery({
    queryKey: ['islemler', isletme?.id, filters],
    queryFn: async () => {
      if (!isletme) return [];

      let query = supabase
        .from('islemler')
        .select(`
          *,
          hesap:hesaplar!hesap_id(*),
          hedef_hesap:hesaplar!hedef_hesap_id(*),
          kategori:kategoriler(*),
          cari:cariler(*),
          personel:personel(*)
        `)
        .eq('isletme_id', isletme.id)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false });

      if (filters?.type) {
        query = query.eq('type', filters.type);
      }

      if (filters?.hesapId) {
        query = query.or(`hesap_id.eq.${filters.hesapId},hedef_hesap_id.eq.${filters.hesapId}`);
      }

      if (filters?.cariId) {
        query = query.eq('cari_id', filters.cariId);
      }

      if (filters?.personelId) {
        query = query.eq('personel_id', filters.personelId);
      }

      if (filters?.startDate) {
        query = query.gte('date', filters.startDate);
      }

      if (filters?.endDate) {
        query = query.lte('date', filters.endDate);
      }

      if (filters?.limit) {
        query = query.limit(filters.limit);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data as IslemWithRelations[];
    },
    enabled: !!isletme,
  });

  // isletme henüz yükleniyorsa loading olarak göster
  return {
    ...result,
    isLoading: result.isLoading || isletmeLoading,
  };
}

// Tek işlem getir
export function useIslem(id: string | undefined) {
  const { isletme } = useAuthContext();

  return useQuery({
    queryKey: ['islem', id],
    queryFn: async () => {
      if (!id || !isletme) return null;

      const { data, error } = await supabase
        .from('islemler')
        .select('*')
        .eq('id', id)
        .eq('isletme_id', isletme.id)
        .single();

      if (error) throw error;
      return data as Islem;
    },
    enabled: !!id && !!isletme,
  });
}

export function useCreateIslem() {
  const queryClient = useQueryClient();
  const { isletme } = useAuthContext();

  return useMutation({
    mutationFn: async (input: Omit<IslemInsert, 'isletme_id'>) => {
      if (!isletme) throw new Error('İşletme bulunamadı');

      const { data, error } = await supabase
        .from('islemler')
        .insert({ ...input, isletme_id: isletme.id })
        .select()
        .single();

      if (error) throw error;

      // Bakiyeleri güncelle
      await updateBalances(input);

      return data as Islem;
    },
    onSuccess: () => {
      // Tüm ilgili verileri yenile
      queryClient.invalidateQueries({ queryKey: ['islemler'] });
      queryClient.invalidateQueries({ queryKey: ['hesaplar'] });
      queryClient.invalidateQueries({ queryKey: ['hesap'] });
      queryClient.invalidateQueries({ queryKey: ['cariler'] });
      queryClient.invalidateQueries({ queryKey: ['cari'] });
      queryClient.invalidateQueries({ queryKey: ['personel'] });
      queryClient.invalidateQueries({ queryKey: ['personel-detail'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['month-summary'] });
    },
  });
}

// RPC çağrısı için helper fonksiyon - hata kontrolü ile
async function safeIncrementBalance(tableName: string, rowId: string, amount: number) {
  const { error } = await supabase.rpc('increment_balance', {
    table_name: tableName,
    row_id: rowId,
    amount: amount,
  });

  if (error) {
    console.error(`Bakiye güncelleme hatası (${tableName}):`, error);
    throw new Error(`Bakiye güncellenemedi: ${error.message}`);
  }
}

// Bakiye güncelleme yardımcı fonksiyonu
async function updateBalances(islem: Omit<IslemInsert, 'isletme_id'>) {
  const amount = Number(islem.amount);

  switch (islem.type) {
    case 'gelir':
      // Hesap bakiyesini artır
      if (islem.hesap_id) {
        await safeIncrementBalance('hesaplar', islem.hesap_id, amount);
      }
      break;

    case 'gider':
      // Hesap bakiyesini azalt
      if (islem.hesap_id) {
        await safeIncrementBalance('hesaplar', islem.hesap_id, -amount);
      }
      break;

    case 'transfer':
      // Kaynak hesaptan düş, hedef hesaba ekle
      if (islem.hesap_id) {
        await safeIncrementBalance('hesaplar', islem.hesap_id, -amount);
      }
      if (islem.hedef_hesap_id) {
        await safeIncrementBalance('hesaplar', islem.hedef_hesap_id, amount);
      }
      break;

    case 'cari_alis':
      // Tedarikçiden alış - cari bakiyesi azalır (borcumuz artar)
      if (islem.cari_id) {
        await safeIncrementBalance('cariler', islem.cari_id, -amount);
      }
      break;

    case 'cari_satis':
      // Müşteriye satış - cari bakiyesi artar (alacağımız artar)
      if (islem.cari_id) {
        await safeIncrementBalance('cariler', islem.cari_id, amount);
      }
      break;

    case 'cari_odeme':
      // Tedarikçiye ödeme - cari bakiyesi artar, hesap bakiyesi azalır
      if (islem.cari_id) {
        await safeIncrementBalance('cariler', islem.cari_id, amount);
      }
      if (islem.hesap_id) {
        await safeIncrementBalance('hesaplar', islem.hesap_id, -amount);
      }
      break;

    case 'cari_tahsilat':
      // Müşteriden tahsilat - cari bakiyesi azalır, hesap bakiyesi artar
      if (islem.cari_id) {
        await safeIncrementBalance('cariler', islem.cari_id, -amount);
      }
      if (islem.hesap_id) {
        await safeIncrementBalance('hesaplar', islem.hesap_id, amount);
      }
      break;

    case 'personel_gider':
      // Personel gideri - personel bakiyesi azalır (borcumuz artar), hesap değişmez
      if (islem.personel_id) {
        await safeIncrementBalance('personel', islem.personel_id, -amount);
      }
      break;

    case 'personel_odeme':
      // Personel borcunu ödeme - personel bakiyesi artar, hesap azalır
      if (islem.personel_id) {
        await safeIncrementBalance('personel', islem.personel_id, amount);
      }
      if (islem.hesap_id) {
        await safeIncrementBalance('hesaplar', islem.hesap_id, -amount);
      }
      break;
  }
}

// Cari işlemleri
export function useIslemlerByCari(cariId: string) {
  const { isletme } = useAuthContext();

  return useQuery({
    queryKey: ['islemler', 'cari', cariId, isletme?.id],
    queryFn: async () => {
      if (!isletme || !cariId) return [];

      const { data, error } = await supabase
        .from('islemler')
        .select('*')
        .eq('isletme_id', isletme.id)
        .eq('cari_id', cariId)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as Islem[];
    },
    enabled: !!isletme && !!cariId,
  });
}

// Hesap işlemleri
export function useIslemlerByHesap(hesapId: string) {
  const { isletme } = useAuthContext();

  return useQuery({
    queryKey: ['islemler', 'hesap', hesapId, isletme?.id],
    queryFn: async () => {
      if (!isletme || !hesapId) return [];

      const { data, error } = await supabase
        .from('islemler')
        .select('*')
        .eq('isletme_id', isletme.id)
        .or(`hesap_id.eq.${hesapId},hedef_hesap_id.eq.${hesapId}`)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as Islem[];
    },
    enabled: !!isletme && !!hesapId,
  });
}

// Personel işlemleri
export function useIslemlerByPersonel(personelId: string) {
  const { isletme } = useAuthContext();

  return useQuery({
    queryKey: ['islemler', 'personel', personelId, isletme?.id],
    queryFn: async () => {
      if (!isletme || !personelId) return [];

      const { data, error } = await supabase
        .from('islemler')
        .select('*')
        .eq('isletme_id', isletme.id)
        .eq('personel_id', personelId)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as Islem[];
    },
    enabled: !!isletme && !!personelId,
  });
}

// İşlem güncelleme - transaction güvenliği ile
export function useUpdateIslem() {
  const queryClient = useQueryClient();
  const { isletme } = useAuthContext();

  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Omit<IslemInsert, 'isletme_id'>> }) => {
      if (!isletme) throw new Error('İşletme bulunamadı');

      // Önce mevcut işlemi al
      const { data: oldIslem, error: fetchError } = await supabase
        .from('islemler')
        .select('*')
        .eq('id', id)
        .eq('isletme_id', isletme.id)
        .single();

      if (fetchError) throw fetchError;
      if (!oldIslem) throw new Error('İşlem bulunamadı veya erişim yetkiniz yok');

      // 1. Önce işlemi güncelle
      const { data, error } = await supabase
        .from('islemler')
        .update(updates)
        .eq('id', id)
        .eq('isletme_id', isletme.id)
        .select()
        .single();

      if (error) throw error;

      // 2. Güncelleme başarılı olduysa bakiyeleri güncelle
      try {
        // Eski bakiyeleri geri al
        await reverseBalances(oldIslem);
        // Yeni bakiyeleri uygula
        await updateBalances({ ...oldIslem, ...updates });
      } catch (balanceError) {
        // Bakiye güncellemesi başarısız olursa işlemi geri al
        console.error('Bakiye güncelleme hatası, işlem geri alınıyor:', balanceError);
        try {
          await supabase
            .from('islemler')
            .update(oldIslem)
            .eq('id', id)
            .eq('isletme_id', isletme.id);
        } catch (rollbackError) {
          console.error('İşlem geri alma hatası:', rollbackError);
        }
        throw balanceError;
      }

      return data as Islem;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['islemler'] });
      queryClient.invalidateQueries({ queryKey: ['islem'] });
      queryClient.invalidateQueries({ queryKey: ['hesaplar'] });
      queryClient.invalidateQueries({ queryKey: ['hesap'] });
      queryClient.invalidateQueries({ queryKey: ['cariler'] });
      queryClient.invalidateQueries({ queryKey: ['cari'] });
      queryClient.invalidateQueries({ queryKey: ['personel'] });
      queryClient.invalidateQueries({ queryKey: ['personel-detail'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['month-summary'] });
    },
  });
}

// İşlem silme - önce bakiyeleri geri al, sonra sil (transaction güvenliği)
export function useDeleteIslem() {
  const queryClient = useQueryClient();
  const { isletme } = useAuthContext();

  return useMutation({
    mutationFn: async (id: string) => {
      if (!isletme) throw new Error('İşletme bulunamadı');

      // Önce işlemi al (bakiye geri almak için) - ownership kontrolü ile
      const { data: islem, error: fetchError } = await supabase
        .from('islemler')
        .select('*')
        .eq('id', id)
        .eq('isletme_id', isletme.id)
        .single();

      if (fetchError) throw fetchError;
      if (!islem) throw new Error('İşlem bulunamadı veya erişim yetkiniz yok');

      // Önce bakiyeleri geri al (silme başarısız olursa geri alınabilir)
      await reverseBalances(islem);

      // Sonra işlemi sil - ownership kontrolü ile
      const { error } = await supabase
        .from('islemler')
        .delete()
        .eq('id', id)
        .eq('isletme_id', isletme.id);

      if (error) {
        // Silme başarısız olursa bakiyeleri geri yükle
        try {
          await updateBalances(islem);
        } catch (rollbackError) {
          console.error('Bakiye geri yükleme hatası:', rollbackError);
        }
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['islemler'] });
      queryClient.invalidateQueries({ queryKey: ['hesaplar'] });
      queryClient.invalidateQueries({ queryKey: ['hesap'] });
      queryClient.invalidateQueries({ queryKey: ['cariler'] });
      queryClient.invalidateQueries({ queryKey: ['cari'] });
      queryClient.invalidateQueries({ queryKey: ['personel'] });
      queryClient.invalidateQueries({ queryKey: ['personel-detail'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['month-summary'] });
    },
  });
}

// Bakiyeleri geri alma (silme için)
async function reverseBalances(islem: Islem) {
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
  }
}

// Gelir/gider özeti (dönem parametreli)
export function useMonthSummary(period: 'month' | 'all' = 'month') {
  const { isletme } = useAuthContext();

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];

  return useQuery({
    queryKey: ['month-summary', isletme?.id, period, startOfMonth],
    queryFn: async () => {
      if (!isletme) return { income: 0, expense: 0 };

      let query = supabase
        .from('islemler')
        .select('type, amount')
        .eq('isletme_id', isletme.id);

      // Sadece "month" seçiliyse tarih filtresi uygula
      if (period === 'month') {
        query = query.gte('date', startOfMonth).lte('date', endOfMonth);
      }

      const { data, error } = await query;

      if (error) throw error;

      const summary = data.reduce(
        (acc, islem) => {
          const amount = Number(islem.amount);
          // Gelir: gelir işlemi, müşteriden tahsilat, müşteriye satış
          if (islem.type === 'gelir' || islem.type === 'cari_tahsilat' || islem.type === 'cari_satis') {
            acc.income += amount;
          }
          // Gider: gider işlemi, tedarikçiye ödeme, tedarikçiden alış, personel gideri, personel ödemesi
          else if (
            islem.type === 'gider' ||
            islem.type === 'cari_odeme' ||
            islem.type === 'cari_alis' ||
            islem.type === 'personel_gider' ||
            islem.type === 'personel_odeme'
          ) {
            acc.expense += amount;
          }
          return acc;
        },
        { income: 0, expense: 0 }
      );

      return summary;
    },
    enabled: !!isletme,
  });
}
