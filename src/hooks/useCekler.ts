import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthContext } from '@/contexts/AuthContext';
import {
  Cek,
  CekInsert,
  CekUpdate,
  CekWithRelations,
  CekDurum,
  IslemInsert,
} from '@/types/database';
import { queryKeys, invalidateRelatedQueries } from '@/lib/queryKeys';
import { formatDateForDB, formatDateTimeWithTzForDB } from '@/lib/date';
import { formatCurrency } from '@/lib/currency';
import {
  scheduleTransactionReminder,
  cancelTransactionReminder,
} from '@/lib/notifications';

// ============================================================================
// QUERY HOOKS
// ============================================================================

/**
 * Tüm bekleyen çekleri getir
 */
export function useBekleyenCekler() {
  const { isletme, isletmeLoading } = useAuthContext();

  const result = useQuery({
    queryKey: queryKeys.cekler.bekleyen(isletme?.id || ''),
    queryFn: async () => {
      if (!isletme) return [];

      const { data, error } = await supabase
        .from('cekler')
        .select(`
          *,
          hesap:hesaplar(*),
          cari:cariler(*),
          kategori:kategoriler(*)
        `)
        .eq('isletme_id', isletme.id)
        .eq('durum', 'beklemede')
        .order('vade_tarihi', { ascending: true });

      if (error) throw error;
      return data as CekWithRelations[];
    },
    enabled: !!isletme,
  });

  return {
    ...result,
    isLoading: result.isLoading || isletmeLoading,
  };
}

/**
 * Tüm çekleri getir (filtreli)
 */
export function useCekler(filters?: {
  hesapId?: string;
  cariId?: string;
  durum?: CekDurum;
}) {
  const { isletme, isletmeLoading } = useAuthContext();

  const result = useQuery({
    queryKey: queryKeys.cekler.list(isletme?.id || ''),
    queryFn: async () => {
      if (!isletme) return [];

      let query = supabase
        .from('cekler')
        .select(`
          *,
          hesap:hesaplar(*),
          cari:cariler(*),
          kategori:kategoriler(*)
        `)
        .eq('isletme_id', isletme.id);

      if (filters?.hesapId) {
        query = query.eq('hesap_id', filters.hesapId);
      }
      if (filters?.cariId) {
        query = query.eq('cari_id', filters.cariId);
      }
      if (filters?.durum) {
        query = query.eq('durum', filters.durum);
      }

      const { data, error } = await query.order('vade_tarihi', { ascending: false });

      if (error) throw error;
      return data as CekWithRelations[];
    },
    enabled: !!isletme,
  });

  return {
    ...result,
    isLoading: result.isLoading || isletmeLoading,
  };
}

/**
 * Tek çek getir
 */
export function useCek(id: string | undefined) {
  const { isletme } = useAuthContext();

  return useQuery({
    queryKey: queryKeys.cekler.detail(id || ''),
    queryFn: async () => {
      if (!id || !isletme) return null;

      const { data, error } = await supabase
        .from('cekler')
        .select(`
          *,
          hesap:hesaplar(*),
          cari:cariler(*),
          kategori:kategoriler(*)
        `)
        .eq('id', id)
        .eq('isletme_id', isletme.id)
        .single();

      if (error) throw error;
      return data as CekWithRelations;
    },
    enabled: !!id && !!isletme,
  });
}

/**
 * Hesaba ait çekler
 */
export function useCeklerByHesap(hesapId: string) {
  const { isletme } = useAuthContext();

  return useQuery({
    queryKey: queryKeys.cekler.byHesap(hesapId, isletme?.id || ''),
    queryFn: async () => {
      if (!isletme || !hesapId) return [];

      const { data, error } = await supabase
        .from('cekler')
        .select(`
          *,
          cari:cariler(*),
          kategori:kategoriler(*)
        `)
        .eq('isletme_id', isletme.id)
        .eq('hesap_id', hesapId)
        .eq('durum', 'beklemede')
        .order('vade_tarihi', { ascending: true });

      if (error) throw error;
      return data as CekWithRelations[];
    },
    enabled: !!isletme && !!hesapId,
  });
}

/**
 * Cariye ait çekler
 */
export function useCeklerByCari(cariId: string) {
  const { isletme } = useAuthContext();

  return useQuery({
    queryKey: queryKeys.cekler.byCari(cariId, isletme?.id || ''),
    queryFn: async () => {
      if (!isletme || !cariId) return [];

      const { data, error } = await supabase
        .from('cekler')
        .select(`
          *,
          hesap:hesaplar(*),
          kategori:kategoriler(*)
        `)
        .eq('isletme_id', isletme.id)
        .eq('cari_id', cariId)
        .order('vade_tarihi', { ascending: false });

      if (error) throw error;
      return data as CekWithRelations[];
    },
    enabled: !!isletme && !!cariId,
  });
}

/**
 * Bugün vadesi gelen çekler
 */
export function useBugunVadeliCekler() {
  const { isletme, isletmeLoading } = useAuthContext();

  const result = useQuery({
    queryKey: queryKeys.cekler.today(isletme?.id || ''),
    queryFn: async () => {
      if (!isletme) return [];

      const today = formatDateForDB(new Date());

      const { data, error } = await supabase
        .from('cekler')
        .select(`
          *,
          hesap:hesaplar(*),
          cari:cariler(*),
          kategori:kategoriler(*)
        `)
        .eq('isletme_id', isletme.id)
        .eq('durum', 'beklemede')
        .eq('vade_tarihi', today);

      if (error) throw error;
      return data as CekWithRelations[];
    },
    enabled: !!isletme,
  });

  return {
    ...result,
    isLoading: result.isLoading || isletmeLoading,
  };
}

/**
 * Bekleyen çek özeti (toplam tutar, sayı)
 */
export function useCekOzet() {
  const { data, isLoading } = useBekleyenCekler();

  const toplamTutar = data?.reduce((sum, cek) => sum + Number(cek.tutar), 0) || 0;
  const bekleyenSayi = data?.length || 0;

  // Bugün veya geçmiş vadeli çekler
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const vadesiGecmis = data?.filter((cek) => {
    const vade = new Date(cek.vade_tarihi + 'T00:00:00');
    return vade < today;
  }).length || 0;

  const bugunVadeli = data?.filter((cek) => {
    const vade = new Date(cek.vade_tarihi + 'T00:00:00');
    return vade.getTime() === today.getTime();
  }).length || 0;

  return {
    toplamTutar,
    bekleyenSayi,
    vadesiGecmis,
    bugunVadeli,
    isLoading,
  };
}

// ============================================================================
// MUTATION HOOKS
// ============================================================================

/**
 * Çek oluştur (çek kes)
 */
export function useCreateCek() {
  const queryClient = useQueryClient();
  const { isletme } = useAuthContext();

  return useMutation({
    mutationFn: async (
      data: Omit<CekInsert, 'isletme_id'> & {
        scheduleReminder?: boolean;
        reminderDaysBefore?: number;
        reminderTime?: string;
      }
    ) => {
      if (!isletme) throw new Error('İşletme bulunamadı');

      const { scheduleReminder, reminderDaysBefore, reminderTime, ...cekData } = data;

      // 1. Çek oluştur
      const { data: cek, error } = await supabase
        .from('cekler')
        .insert({
          ...cekData,
          isletme_id: isletme.id,
          kesim_tarihi: cekData.kesim_tarihi || formatDateForDB(new Date()),
        })
        .select(`
          *,
          hesap:hesaplar(*),
          cari:cariler(*),
          kategori:kategoriler(*)
        `)
        .single();

      if (error) throw error;

      // 2. Bildirim zamanla (varsayılan: 1 gün önce, saat 09:00)
      if (scheduleReminder !== false) {
        const daysBefore = reminderDaysBefore ?? 1;
        const time = reminderTime ?? '09:00';
        const [hours, minutes] = time.split(':').map(Number);

        const reminderDate = new Date(cek.vade_tarihi + 'T00:00:00');
        reminderDate.setDate(reminderDate.getDate() - daysBefore);
        reminderDate.setHours(hours, minutes, 0, 0);

        // Sadece gelecek tarihler için bildirim zamanla
        if (reminderDate > new Date()) {
          const notificationId = await scheduleTransactionReminder(
            cek.id,
            'Çek Vadesi Yaklaşıyor',
            `${cek.cek_no} numaralı çekin vadesi ${daysBefore === 0 ? 'bugün' : daysBefore === 1 ? 'yarın' : `${daysBefore} gün sonra`}. Tutar: ${formatCurrency(Number(cek.tutar))}`,
            reminderDate,
            {
              type: 'cek',
              transaction_id: cek.id,
              hesap_id: cek.hesap_id,
              cari_id: cek.cari_id,
            }
          );

          if (notificationId) {
            // Bildirim ID'sini kaydet
            await supabase
              .from('cekler')
              .update({ notification_id: notificationId })
              .eq('id', cek.id);
          }
        }
      }

      return cek as CekWithRelations;
    },
    onSuccess: () => {
      invalidateRelatedQueries(queryClient, 'cek');
    },
  });
}

/**
 * Çek güncelle
 */
export function useUpdateCek() {
  const queryClient = useQueryClient();
  const { isletme } = useAuthContext();

  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: CekUpdate }) => {
      if (!isletme) throw new Error('İşletme bulunamadı');

      const { data, error } = await supabase
        .from('cekler')
        .update(updates)
        .eq('id', id)
        .eq('isletme_id', isletme.id)
        .select()
        .single();

      if (error) throw error;
      return data as Cek;
    },
    onSuccess: () => {
      invalidateRelatedQueries(queryClient, 'cek');
    },
  });
}

/**
 * Çek öde (beklemede → odendi)
 */
export function useCompleteCek() {
  const queryClient = useQueryClient();
  const { isletme } = useAuthContext();

  return useMutation({
    mutationFn: async (id: string) => {
      if (!isletme) throw new Error('İşletme bulunamadı');

      // 0. Hatırlatıcıyı iptal et
      await cancelTransactionReminder(id);

      // 1. Çeki al
      const { data: cek, error: fetchError } = await supabase
        .from('cekler')
        .select('*')
        .eq('id', id)
        .eq('isletme_id', isletme.id)
        .single();

      if (fetchError) throw fetchError;
      if (!cek) throw new Error('Çek bulunamadı');
      if (cek.durum !== 'beklemede') throw new Error('Bu çek zaten işlem görmüş');

      // 2. cari_odeme işlemi oluştur (yerel saat ile timezone bilgisi dahil)
      const now = new Date();
      const localISO = formatDateTimeWithTzForDB(now);
      const todayDate = formatDateForDB(now);
      const islemData: IslemInsert = {
        isletme_id: isletme.id,
        type: 'cari_odeme',
        amount: cek.tutar,
        hesap_id: cek.hesap_id,
        cari_id: cek.cari_id,
        kategori_id: cek.kategori_id,
        date: localISO, // Yerel saat ile tam timestamp
        description: `Çek ödemesi: ${cek.cek_no}`,
      };

      const { data: newIslem, error: insertError } = await supabase
        .from('islemler')
        .insert(islemData)
        .select()
        .single();

      if (insertError) throw insertError;

      // 3. Bakiyeleri güncelle (atomic-like yaklaşım)
      // cari_odeme: hesap -tutar, cari +tutar
      let hesapBalanceUpdated = false;
      let cariBalanceUpdated = false;

      try {
        await safeIncrementBalance('hesaplar', cek.hesap_id, -Number(cek.tutar));
        hesapBalanceUpdated = true;

        await safeIncrementBalance('cariler', cek.cari_id, Number(cek.tutar));
        cariBalanceUpdated = true;
      } catch (balanceError) {
        // Cari bakiyesi güncellendiyse geri al
        if (cariBalanceUpdated) {
          try {
            await safeIncrementBalance('cariler', cek.cari_id, -Number(cek.tutar));
          } catch (rollbackError) {
            console.error('CRITICAL: Cari bakiye rollback başarısız:', rollbackError);
          }
        }
        // Hesap bakiyesi güncellendiyse geri al
        if (hesapBalanceUpdated) {
          try {
            await safeIncrementBalance('hesaplar', cek.hesap_id, Number(cek.tutar));
          } catch (rollbackError) {
            console.error('CRITICAL: Hesap bakiye rollback başarısız:', rollbackError);
          }
        }
        // İşlemi sil
        try {
          await supabase.from('islemler').delete().eq('id', newIslem.id);
        } catch (deleteError) {
          console.error('CRITICAL: İşlem silme başarısız:', deleteError);
        }
        throw balanceError;
      }

      // 4. Çeki güncelle
      const { error: updateError } = await supabase
        .from('cekler')
        .update({
          durum: 'odendi',
          odeme_tarihi: todayDate,
          islem_id: newIslem.id,
        })
        .eq('id', id)
        .eq('isletme_id', isletme.id);

      if (updateError) {
        // Rollback: işlemi sil ve bakiyeleri geri al
        try {
          const { error: deleteError } = await supabase.from('islemler').delete().eq('id', newIslem.id);
          if (deleteError) {
            if (__DEV__) {
              console.error('CRITICAL: Rollback işlem silme başarısız:', deleteError);
            }
          }
          await safeIncrementBalance('hesaplar', cek.hesap_id, Number(cek.tutar));
          await safeIncrementBalance('cariler', cek.cari_id, -Number(cek.tutar));
        } catch (rollbackError) {
          if (__DEV__) {
            console.error('CRITICAL: Rollback tamamen başarısız, veri tutarsız olabilir:', rollbackError);
          }
        }
        throw updateError;
      }

      return newIslem;
    },
    onSuccess: () => {
      invalidateRelatedQueries(queryClient, 'cek');
      invalidateRelatedQueries(queryClient, 'islem');
    },
  });
}

/**
 * Çek iptal et (beklemede → iptal)
 */
export function useCancelCek() {
  const queryClient = useQueryClient();
  const { isletme } = useAuthContext();

  return useMutation({
    mutationFn: async (id: string) => {
      if (!isletme) throw new Error('İşletme bulunamadı');

      // 0. Hatırlatıcıyı iptal et
      await cancelTransactionReminder(id);

      // 1. Çekin mevcut durumunu kontrol et
      const { data: cek, error: fetchError } = await supabase
        .from('cekler')
        .select('durum')
        .eq('id', id)
        .eq('isletme_id', isletme.id)
        .single();

      if (fetchError) throw fetchError;
      if (!cek) throw new Error('Çek bulunamadı');
      if (cek.durum !== 'beklemede') throw new Error('Sadece bekleyen çekler iptal edilebilir');

      // 2. Çeki iptal et
      const { error } = await supabase
        .from('cekler')
        .update({ durum: 'iptal' })
        .eq('id', id)
        .eq('isletme_id', isletme.id);

      if (error) throw error;
    },
    onSuccess: () => {
      invalidateRelatedQueries(queryClient, 'cek');
    },
  });
}

/**
 * Çek sil (sadece beklemede durumundakiler)
 */
export function useDeleteCek() {
  const queryClient = useQueryClient();
  const { isletme } = useAuthContext();

  return useMutation({
    mutationFn: async (id: string) => {
      if (!isletme) throw new Error('İşletme bulunamadı');

      // 0. Hatırlatıcıyı iptal et
      await cancelTransactionReminder(id);

      // 1. Çekin mevcut durumunu kontrol et
      const { data: cek, error: fetchError } = await supabase
        .from('cekler')
        .select('durum')
        .eq('id', id)
        .eq('isletme_id', isletme.id)
        .single();

      if (fetchError) throw fetchError;
      if (!cek) throw new Error('Çek bulunamadı');
      if (cek.durum !== 'beklemede') throw new Error('Sadece bekleyen çekler silinebilir');

      // 2. Çeki sil
      const { error } = await supabase
        .from('cekler')
        .delete()
        .eq('id', id)
        .eq('isletme_id', isletme.id);

      if (error) throw error;
    },
    onSuccess: () => {
      invalidateRelatedQueries(queryClient, 'cek');
    },
  });
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

async function safeIncrementBalance(tableName: string, rowId: string, amount: number) {
  // Direkt manuel güncelleme (RPC güvenilir olmayabilir)
  // 1. Mevcut bakiyeyi al
  const { data: currentData, error: fetchError } = await supabase
    .from(tableName)
    .select('balance')
    .eq('id', rowId)
    .single();

  if (fetchError) {
    if (__DEV__) {
      console.error(`Bakiye okuma hatası (${tableName}):`, fetchError);
    }
    throw new Error(`Bakiye okunamadı: ${fetchError.message}`);
  }

  const currentBalance = Number(currentData?.balance ?? 0);
  const newBalance = currentBalance + amount;

  // 2. Yeni bakiyeyi güncelle
  const { error: updateError } = await supabase
    .from(tableName)
    .update({ balance: newBalance })
    .eq('id', rowId);

  if (updateError) {
    if (__DEV__) {
      console.error(`Bakiye güncelleme hatası (${tableName}):`, updateError);
    }
    throw new Error(`Bakiye güncellenemedi: ${updateError.message}`);
  }

  if (__DEV__) {
    console.log(`Bakiye güncellendi (${tableName}): ${currentBalance} -> ${newBalance}`);
  }
}
