import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthContext } from '@/contexts/AuthContext';
import { Islem, IslemInsert, IslemWithRelations, IslemType } from '@/types/database';
import { calculateIncomeSummary, isIncomeType, isExpenseType, isIncomeReturnType, isExpenseReturnType } from '@/constants/islemTypes';
import { invalidateRelatedQueries } from '@/lib/queryKeys';
import { toNumber, safeParseAmount, safeParseExchangeRate, calculateTargetAmount } from '@/lib/currency';
import {
  formatDateForDB,
  formatDateLong,
  getDateRange,
  type PeriodType as DatePeriodType,
} from '@/lib/date';

interface IslemFilters {
  type?: IslemType;
  hesapId?: string;
  cariId?: string;
  personelId?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
}

const ISLEMLER_PAGE_SIZE = 50;

export function useIslemler(filters?: IslemFilters) {
  const { isletme, isletmeLoading } = useAuthContext();

  const result = useInfiniteQuery({
    queryKey: ['islemler', isletme?.id, filters],
    queryFn: async ({ pageParam = 0 }) => {
      if (!isletme) return [];

      const from = pageParam * ISLEMLER_PAGE_SIZE;
      const to = from + ISLEMLER_PAGE_SIZE - 1;

      let query = supabase
        .from('islemler')
        .select(`
          *,
          hesap:hesaplar!hesap_id(id,name,currency,type,is_active),
          hedef_hesap:hesaplar!hedef_hesap_id(id,name,currency,type,is_active),
          kategori:kategoriler(id,name),
          cari:cariler(id,name,type),
          personel:personel(id,first_name,last_name),
          creator:profiles!islemler_created_by_profiles_fk(display_name,email)
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
        const startNorm = filters.startDate.includes('T') ? filters.startDate : `${filters.startDate}T00:00:00`;
        query = query.gte('date', startNorm);
      }

      if (filters?.endDate) {
        const endNorm = filters.endDate.includes('T') ? filters.endDate : `${filters.endDate}T23:59:59`;
        query = query.lte('date', endNorm);
      }

      if (filters?.limit) {
        query = query.limit(filters.limit);
      } else {
        query = query.range(from, to);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data as IslemWithRelations[];
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, _allPages, lastPageParam) => {
      if (!lastPage || lastPage.length < ISLEMLER_PAGE_SIZE) return undefined;
      return lastPageParam + 1;
    },
    enabled: !!isletme,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });

  // isletme henüz yükleniyorsa loading olarak göster
  return {
    ...result,
    data: result.data?.pages.flat() ?? [],
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

      // Bakiyeleri güncelle - başarısız olursa işlemi geri al
      try {
        await updateBalances(input);
      } catch (balanceError) {
        // Bakiye güncellemesi başarısız oldu, işlemi sil
        console.error('Bakiye güncelleme hatası, işlem geri alınıyor:', balanceError);

        try {
          await supabase
            .from('islemler')
            .delete()
            .eq('id', data.id)
            .eq('isletme_id', isletme.id);
        } catch (rollbackError) {
          console.error('CRITICAL: İşlem geri alma hatası:', rollbackError);
          // Kritik hata: işlem oluşturuldu ama bakiye güncellenemedi ve geri alınamadı
          throw new Error(
            'Kritik hata: İşlem oluşturuldu ancak bakiye güncellenemedi ve geri alınamadı. ' +
            `Lütfen destek ile iletişime geçin. Detay: ${(rollbackError as Error).message}`
          );
        }

        // Bakiye hatası ile devam et
        throw balanceError;
      }

      return data as Islem;
    },
    onSuccess: (_data, variables) => {
      // Merkezi invalidation helper kullan
      invalidateRelatedQueries(queryClient, 'islem');

      // Baglantili cari varsa karsi tarafa bildirim gonder (fire & forget)
      if (variables.cari_id) {
        supabase.functions
          .invoke('notify-linked-users', {
            body: {
              record: { ..._data, isletme_id: isletme!.id },
              type: 'INSERT',
            },
          })
          .catch((err) => console.warn('[notify-linked-users] Bildirim gonderilemedi:', err));
      }
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
    if (__DEV__) {
      console.error(`Bakiye güncelleme hatası (${tableName}):`, error);
    }
    throw new Error(`Bakiye güncellenemedi: ${error.message}`);
  }
}

// Bakiye güncelleme yardımcı fonksiyonu
async function updateBalances(islem: Omit<IslemInsert, 'isletme_id'>) {
  // Güvenli tutar parse etme - NaN kontrolü
  const amount = safeParseAmount(islem.amount, 'işlem tutarı');

  // Exchange rate güvenli parse etme - 0 ve negatif değer kontrolü
  const exchangeRate = safeParseExchangeRate(islem.exchange_rate);

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
      // Cross-currency transfer: exchange_rate varsa dönüşüm uygula
      if (islem.hesap_id) {
        await safeIncrementBalance('hesaplar', islem.hesap_id, -amount);
      }
      if (islem.hedef_hesap_id) {
        const sourceCurrency = islem.source_currency || 'TRY';
        const targetCurrency = islem.target_currency || 'TRY';

        const targetAmount = calculateTargetAmount(
          amount,
          exchangeRate,
          sourceCurrency,
          targetCurrency
        );

        await safeIncrementBalance('hesaplar', islem.hedef_hesap_id, targetAmount);
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
      // Cross-currency: Hesap farklı para biriminde ise, cari para birimine dönüştür
      {
        const sourceCurrency = islem.source_currency || 'TRY';
        const targetCurrency = islem.target_currency || 'TRY';

        // Cari bakiyesi kendi para birimi cinsinden
        const cariAmount = calculateTargetAmount(amount, exchangeRate, sourceCurrency, targetCurrency);

        if (islem.cari_id) {
          await safeIncrementBalance('cariler', islem.cari_id, cariAmount);
        }
        if (islem.hesap_id) {
          // Hesap bakiyesi kendi para birimi cinsinden
          await safeIncrementBalance('hesaplar', islem.hesap_id, -amount);
        }
      }
      break;

    case 'cari_tahsilat':
      // Müşteriden tahsilat - cari bakiyesi azalır, hesap bakiyesi artar
      // Cross-currency: Hesap farklı para biriminde ise, cari para birimine dönüştür
      {
        const sourceCurrency = islem.source_currency || 'TRY';
        const targetCurrency = islem.target_currency || 'TRY';

        // Cari bakiyesi kendi para birimi cinsinden
        const cariAmount = calculateTargetAmount(amount, exchangeRate, sourceCurrency, targetCurrency);

        if (islem.cari_id) {
          await safeIncrementBalance('cariler', islem.cari_id, -cariAmount);
        }
        if (islem.hesap_id) {
          // Hesap bakiyesi kendi para birimi cinsinden
          await safeIncrementBalance('hesaplar', islem.hesap_id, amount);
        }
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
      // Cross-currency: Hesap farklı para biriminde ise, personel para birimine dönüştür
      {
        const sourceCurrency = islem.source_currency || 'TRY';
        const targetCurrency = islem.target_currency || 'TRY';

        // Personel bakiyesi kendi para birimi cinsinden
        const personelAmount = calculateTargetAmount(amount, exchangeRate, sourceCurrency, targetCurrency);

        if (islem.personel_id) {
          await safeIncrementBalance('personel', islem.personel_id, personelAmount);
        }
        if (islem.hesap_id) {
          await safeIncrementBalance('hesaplar', islem.hesap_id, -amount);
        }
      }
      break;

    case 'cari_alis_iade':
      // Tedarikçiye alış iadesi - cari bakiyesi artar (borcumuz azalır), hesap değişmez
      if (islem.cari_id) {
        await safeIncrementBalance('cariler', islem.cari_id, amount);
      }
      break;

    case 'cari_satis_iade':
      // Müşteriden satış iadesi - cari bakiyesi azalır (alacağımız azalır), hesap değişmez
      if (islem.cari_id) {
        await safeIncrementBalance('cariler', islem.cari_id, -amount);
      }
      break;

    case 'personel_tahsilat':
      // Personelden tahsilat - personel bakiyesi azalır (alacağımız azalır), hesap bakiyesi artar
      // Cross-currency: Hesap farklı para biriminde ise, personel para birimine dönüştür
      {
        const sourceCurrency = islem.source_currency || 'TRY';
        const targetCurrency = islem.target_currency || 'TRY';

        // Personel bakiyesi kendi para birimi cinsinden
        const personelAmount = calculateTargetAmount(amount, exchangeRate, sourceCurrency, targetCurrency);

        if (islem.personel_id) {
          await safeIncrementBalance('personel', islem.personel_id, -personelAmount);
        }
        if (islem.hesap_id) {
          await safeIncrementBalance('hesaplar', islem.hesap_id, amount);
        }
      }
      break;

    case 'personel_satis':
      // Personele satış - personel bakiyesi artar (personelden alacağımız artar), hesap değişmez
      if (islem.personel_id) {
        await safeIncrementBalance('personel', islem.personel_id, amount);
      }
      break;
  }
}

// Cari işlemleri (kategori bilgisi dahil) - infinite scroll
export function useIslemlerByCari(cariId: string) {
  const { isletme } = useAuthContext();

  const result = useInfiniteQuery({
    queryKey: ['islemler', 'cari', cariId, isletme?.id],
    queryFn: async ({ pageParam = 0 }) => {
      if (!isletme || !cariId) return [];

      const from = pageParam * ISLEMLER_PAGE_SIZE;
      const to = from + ISLEMLER_PAGE_SIZE - 1;

      const { data, error } = await supabase
        .from('islemler')
        .select(`
          *,
          kategori:kategoriler(id,name),
          hesap:hesaplar!hesap_id(id,name,currency,type,is_active),
          creator:profiles!islemler_created_by_profiles_fk(display_name,email)
        `)
        .eq('isletme_id', isletme.id)
        .eq('cari_id', cariId)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) throw error;
      return data as IslemWithRelations[];
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, _allPages, lastPageParam) => {
      if (!lastPage || lastPage.length < ISLEMLER_PAGE_SIZE) return undefined;
      return lastPageParam + 1;
    },
    enabled: !!isletme && !!cariId,
  });

  return {
    ...result,
    data: result.data?.pages.flat() ?? [],
  };
}

// Hesap işlemleri (kategori bilgisi dahil) - infinite scroll
export function useIslemlerByHesap(hesapId: string) {
  const { isletme } = useAuthContext();

  const result = useInfiniteQuery({
    queryKey: ['islemler', 'hesap', hesapId, isletme?.id],
    queryFn: async ({ pageParam = 0 }) => {
      if (!isletme || !hesapId) return [];

      const from = pageParam * ISLEMLER_PAGE_SIZE;
      const to = from + ISLEMLER_PAGE_SIZE - 1;

      const { data, error } = await supabase
        .from('islemler')
        .select(`
          *,
          kategori:kategoriler(id,name),
          hesap:hesaplar!islemler_hesap_id_fkey(id,name,currency,type,is_active),
          hedef_hesap:hesaplar!islemler_hedef_hesap_id_fkey(id,name,currency,type,is_active),
          cari:cariler(id,name,type),
          personel:personel(id,first_name,last_name),
          creator:profiles!islemler_created_by_profiles_fk(display_name,email)
        `)
        .eq('isletme_id', isletme.id)
        .or(`hesap_id.eq.${hesapId},hedef_hesap_id.eq.${hesapId}`)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) throw error;
      return data as IslemWithRelations[];
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, _allPages, lastPageParam) => {
      if (!lastPage || lastPage.length < ISLEMLER_PAGE_SIZE) return undefined;
      return lastPageParam + 1;
    },
    enabled: !!isletme && !!hesapId,
  });

  return {
    ...result,
    data: result.data?.pages.flat() ?? [],
  };
}

// Personel işlemleri (kategori bilgisi dahil) - infinite scroll
export function useIslemlerByPersonel(personelId: string) {
  const { isletme } = useAuthContext();

  const result = useInfiniteQuery({
    queryKey: ['islemler', 'personel', personelId, isletme?.id],
    queryFn: async ({ pageParam = 0 }) => {
      if (!isletme || !personelId) return [];

      const from = pageParam * ISLEMLER_PAGE_SIZE;
      const to = from + ISLEMLER_PAGE_SIZE - 1;

      const { data, error } = await supabase
        .from('islemler')
        .select(`
          *,
          kategori:kategoriler(id,name),
          hesap:hesaplar!hesap_id(id,name,currency,type,is_active),
          creator:profiles!islemler_created_by_profiles_fk(display_name,email)
        `)
        .eq('isletme_id', isletme.id)
        .eq('personel_id', personelId)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) throw error;
      return data as IslemWithRelations[];
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, _allPages, lastPageParam) => {
      if (!lastPage || lastPage.length < ISLEMLER_PAGE_SIZE) return undefined;
      return lastPageParam + 1;
    },
    enabled: !!isletme && !!personelId,
  });

  return {
    ...result,
    data: result.data?.pages.flat() ?? [],
  };
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
        if (__DEV__) {
          console.error('Bakiye güncelleme hatası, işlem geri alınıyor:', balanceError);
        }
        try {
          await supabase
            .from('islemler')
            .update(oldIslem)
            .eq('id', id)
            .eq('isletme_id', isletme.id);
        } catch (rollbackError) {
          if (__DEV__) {
            console.error('İşlem geri alma hatası:', rollbackError);
          }
        }
        throw balanceError;
      }

      return data as Islem;
    },
    onSuccess: () => {
      // Merkezi invalidation helper kullan
      invalidateRelatedQueries(queryClient, 'islem');
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

      // Bağlı ürün hareketlerini geri al ve sil
      const { data: urunHareketler } = await supabase
        .from('urun_hareketler')
        .select('*')
        .eq('islem_id', id)
        .eq('isletme_id', isletme.id);

      if (urunHareketler && urunHareketler.length > 0) {
        for (const hareket of urunHareketler) {
          // Stok miktarını geri al
          let miktarDegisim: number;
          if (hareket.hareket_tipi === 'giris') {
            miktarDegisim = -Math.abs(hareket.miktar);
          } else if (hareket.hareket_tipi === 'cikis') {
            miktarDegisim = Math.abs(hareket.miktar);
          } else {
            miktarDegisim = -hareket.miktar;
          }

          await supabase.rpc('update_urun_miktar', {
            p_urun_id: hareket.urun_id,
            p_miktar_degisim: miktarDegisim,
            p_isletme_id: isletme.id,
          });
        }

        // Ürün hareketlerini sil
        await supabase
          .from('urun_hareketler')
          .delete()
          .eq('islem_id', id)
          .eq('isletme_id', isletme.id);
      }

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
          if (__DEV__) {
            console.error('Bakiye geri yükleme hatası:', rollbackError);
          }
        }
        throw error;
      }
    },
    onSuccess: () => {
      // Merkezi invalidation helper kullan
      invalidateRelatedQueries(queryClient, 'islem');
      invalidateRelatedQueries(queryClient, 'urunHareket');
    },
  });
}

// Bakiyeleri geri alma (silme için)
async function reverseBalances(islem: Islem) {
  // Güvenli tutar parse etme - NaN kontrolü
  const amount = safeParseAmount(islem.amount, 'işlem tutarı');

  // Exchange rate güvenli parse etme - 0 ve negatif değer kontrolü
  const exchangeRate = safeParseExchangeRate(islem.exchange_rate);

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
      // Cross-currency transfer geri alma
      if (islem.hesap_id) {
        await safeIncrementBalance('hesaplar', islem.hesap_id, amount);
      }
      if (islem.hedef_hesap_id) {
        const sourceCurrency = islem.source_currency || 'TRY';
        const targetCurrency = islem.target_currency || 'TRY';

        const targetAmount = calculateTargetAmount(
          amount,
          exchangeRate,
          sourceCurrency,
          targetCurrency
        );

        await safeIncrementBalance('hesaplar', islem.hedef_hesap_id, -targetAmount);
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
      // Cross-currency cari_odeme geri alma
      {
        const sourceCurrency = islem.source_currency || 'TRY';
        const targetCurrency = islem.target_currency || 'TRY';
        const cariAmount = calculateTargetAmount(amount, exchangeRate, sourceCurrency, targetCurrency);

        if (islem.cari_id) {
          await safeIncrementBalance('cariler', islem.cari_id, -cariAmount);
        }
        if (islem.hesap_id) {
          await safeIncrementBalance('hesaplar', islem.hesap_id, amount);
        }
      }
      break;

    case 'cari_tahsilat':
      // Cross-currency cari_tahsilat geri alma
      {
        const sourceCurrency = islem.source_currency || 'TRY';
        const targetCurrency = islem.target_currency || 'TRY';
        const cariAmount = calculateTargetAmount(amount, exchangeRate, sourceCurrency, targetCurrency);

        if (islem.cari_id) {
          await safeIncrementBalance('cariler', islem.cari_id, cariAmount);
        }
        if (islem.hesap_id) {
          await safeIncrementBalance('hesaplar', islem.hesap_id, -amount);
        }
      }
      break;

    case 'personel_gider':
      if (islem.personel_id) {
        await safeIncrementBalance('personel', islem.personel_id, amount);
      }
      break;

    case 'personel_odeme':
      // Cross-currency personel_odeme geri alma
      {
        const sourceCurrency = islem.source_currency || 'TRY';
        const targetCurrency = islem.target_currency || 'TRY';
        const personelAmount = calculateTargetAmount(amount, exchangeRate, sourceCurrency, targetCurrency);

        if (islem.personel_id) {
          await safeIncrementBalance('personel', islem.personel_id, -personelAmount);
        }
        if (islem.hesap_id) {
          await safeIncrementBalance('hesaplar', islem.hesap_id, amount);
        }
      }
      break;

    case 'cari_alis_iade':
      // Alış iadesi geri al - cari bakiyesi azalır (borcumuz geri artar)
      if (islem.cari_id) {
        await safeIncrementBalance('cariler', islem.cari_id, -amount);
      }
      break;

    case 'cari_satis_iade':
      // Satış iadesi geri al - cari bakiyesi artar (alacağımız geri artar)
      if (islem.cari_id) {
        await safeIncrementBalance('cariler', islem.cari_id, amount);
      }
      break;

    case 'personel_tahsilat':
      // Cross-currency personel_tahsilat geri alma
      {
        const sourceCurrency = islem.source_currency || 'TRY';
        const targetCurrency = islem.target_currency || 'TRY';
        const personelAmount = calculateTargetAmount(amount, exchangeRate, sourceCurrency, targetCurrency);

        if (islem.personel_id) {
          await safeIncrementBalance('personel', islem.personel_id, personelAmount);
        }
        if (islem.hesap_id) {
          await safeIncrementBalance('hesaplar', islem.hesap_id, -amount);
        }
      }
      break;

    case 'personel_satis':
      // Personele satış geri al - personel bakiyesi azalır (alacağımız azalır)
      if (islem.personel_id) {
        await safeIncrementBalance('personel', islem.personel_id, -amount);
      }
      break;
  }
}

// Dönem tiplerini tanımla
export type PeriodType = 'yearly' | 'monthly' | 'weekly' | 'daily' | 'custom';

// Dönem tarih aralığını hesapla - date.ts'deki getDateRange'e delege eder
export function getPeriodDateRange(
  period: PeriodType,
  offset: number = 0,
  customRange?: { startDate: string; endDate: string }
) {
  return getDateRange(period, offset, customRange);
}

/**
 * Tarih string'ini tam gün formatına normalize eder
 * YYYY-MM-DD -> YYYY-MM-DDTHH:MM:SS formatına çevirir
 */
function normalizeDateRange(start: string, end: string): { startDateTime: string; endDateTime: string } {
  const startDateTime = start.includes('T') ? start : `${start}T00:00:00`;
  const endDateTime = end.includes('T') ? end : `${end}T23:59:59`;
  return { startDateTime, endDateTime };
}

// Gelir/gider özeti (dönem ve offset parametreli)
// Pasif hesaplardaki işlemler hariç tutulur
export function useMonthSummary(
  period: PeriodType = 'monthly',
  offset: number = 0,
  customRange?: { startDate: string; endDate: string }
) {
  const { isletme } = useAuthContext();

  const { startDate, endDate, label } = getPeriodDateRange(period, offset, customRange);

  // Tarih aralığını normalize et (gün sonuna kadar dahil etmek için)
  const { startDateTime, endDateTime } = normalizeDateRange(startDate, endDate);

  const query = useQuery({
    queryKey: ['month-summary', isletme?.id, period, offset, startDate, endDate],
    queryFn: async () => {
      if (!isletme) return { income: 0, expense: 0 };

      // Server-side aggregation: Supabase max_rows sınırından etkilenmez
      // Binlerce satır yerine sadece tip başına 1 satır döner
      const { data, error } = await supabase.rpc('get_income_expense_summary', {
        p_isletme_id: isletme.id,
        p_start_date: startDateTime,
        p_end_date: endDateTime,
      });

      if (error) {
        if (__DEV__) console.error('[useMonthSummary] RPC error:', error.message, (error as any).code);
        throw error;
      }
      if (__DEV__) console.log('[useMonthSummary] RPC result:', data?.length, 'rows');

      // RPC sonuçlarını gelir/gider olarak hesapla
      const result = { income: 0, expense: 0 };
      for (const row of (data || [])) {
        const amount = Number(row.total) || 0;
        if (isIncomeType(row.type as IslemType)) {
          result.income += amount;
        } else if (isIncomeReturnType(row.type as IslemType)) {
          result.income -= amount;
        }
        if (isExpenseType(row.type as IslemType)) {
          result.expense += amount;
        } else if (isExpenseReturnType(row.type as IslemType)) {
          result.expense -= amount;
        }
      }

      return {
        income: Math.round(result.income * 100) / 100,
        expense: Math.round(result.expense * 100) / 100,
      };
    },
    enabled: !!isletme,
  });

  return {
    ...query,
    periodLabel: label,
  };
}

// İşlem notlarında arama (description alanında server-side ilike)
export function useSearchIslemler(searchQuery: string) {
  const { isletme } = useAuthContext();
  const q = searchQuery.trim();

  return useQuery({
    queryKey: ['islemler-search', isletme?.id, q],
    queryFn: async () => {
      if (!isletme || !q) return [];

      // SQL wildcard karakterlerini escape et (%, _, \)
      const sanitized = q.replace(/[\\%_]/g, (ch) => `\\${ch}`);

      const { data, error } = await supabase
        .from('islemler')
        .select(`
          *,
          hesap:hesaplar!hesap_id(id,name,currency,type,is_active),
          hedef_hesap:hesaplar!hedef_hesap_id(id,name,currency,type,is_active),
          kategori:kategoriler(id,name),
          cari:cariler(id,name,type),
          personel:personel(id,first_name,last_name),
          creator:profiles!islemler_created_by_profiles_fk(display_name,email)
        `)
        .eq('isletme_id', isletme.id)
        .ilike('description', `%${sanitized}%`)
        .order('date', { ascending: false })
        .limit(20);

      if (error) throw error;
      return data as IslemWithRelations[];
    },
    enabled: !!isletme && q.length >= 2,
  });
}
