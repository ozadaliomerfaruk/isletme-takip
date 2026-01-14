import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import i18n from 'i18next';
import { supabase } from '@/lib/supabase';
import { useAuthContext } from '@/contexts/AuthContext';
import { Islem, IslemInsert, IslemWithRelations, IslemType } from '@/types/database';
import { calculateIncomeSummary } from '@/constants/islemTypes';
import { invalidateRelatedQueries } from '@/lib/queryKeys';
import { toNumber, safeParseAmount, safeParseExchangeRate, calculateTargetAmount } from '@/lib/currency';
import {
  formatDateForDB,
  type PeriodType as DatePeriodType,
} from '@/lib/date';

// Get translated months array
function getMonths(): string[] {
  const months = i18n.t('date.months', { ns: 'common', returnObjects: true });
  if (Array.isArray(months) && months.every((m) => typeof m === 'string')) {
    return months as string[];
  }
  return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
}

function getMonthsShort(): string[] {
  const months = i18n.t('date.monthsShort', { ns: 'common', returnObjects: true });
  if (Array.isArray(months) && months.every((m) => typeof m === 'string')) {
    return months as string[];
  }
  return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
}

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

      // Bakiyeleri güncelle - başarısız olursa işlemi geri al
      try {
        await updateBalances(input);
      } catch (balanceError) {
        // Bakiye güncellemesi başarısız oldu, işlemi sil
        if (__DEV__) {
          console.error('Bakiye güncelleme hatası, işlem geri alınıyor:', balanceError);
        }

        try {
          await supabase
            .from('islemler')
            .delete()
            .eq('id', data.id)
            .eq('isletme_id', isletme.id);
        } catch (rollbackError) {
          if (__DEV__) {
            console.error('İşlem geri alma hatası:', rollbackError);
          }
          // Kritik hata: işlem oluşturuldu ama bakiye güncellenemedi ve geri alınamadı
          throw new Error('Kritik hata: İşlem oluşturuldu ancak bakiye güncellenemedi. Lütfen destek ile iletişime geçin.');
        }

        // Bakiye hatası ile devam et
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
      // Cross-currency: Hesap farklı para biriminde ise, cari'ye TRY cinsinden ekle
      {
        const sourceCurrency = islem.source_currency || 'TRY';

        // Cari bakiyesi her zaman TRY cinsinden
        const cariAmount = calculateTargetAmount(amount, exchangeRate, sourceCurrency, 'TRY');

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
      // Cross-currency: Hesap farklı para biriminde ise, cari'den TRY cinsinden düş
      {
        const sourceCurrency = islem.source_currency || 'TRY';

        // Cari bakiyesi her zaman TRY cinsinden
        const cariAmount = calculateTargetAmount(amount, exchangeRate, sourceCurrency, 'TRY');

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
      // Cross-currency: Hesap farklı para biriminde ise, personel'e TRY cinsinden ekle
      {
        const sourceCurrency = islem.source_currency || 'TRY';

        // Personel bakiyesi her zaman TRY cinsinden
        const personelAmount = calculateTargetAmount(amount, exchangeRate, sourceCurrency, 'TRY');

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
      // Cross-currency: Hesap farklı para biriminde ise, personel'den TRY cinsinden düş
      {
        const sourceCurrency = islem.source_currency || 'TRY';

        // Personel bakiyesi her zaman TRY cinsinden
        const personelAmount = calculateTargetAmount(amount, exchangeRate, sourceCurrency, 'TRY');

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

// Cari işlemleri (kategori bilgisi dahil)
export function useIslemlerByCari(cariId: string) {
  const { isletme } = useAuthContext();

  return useQuery({
    queryKey: ['islemler', 'cari', cariId, isletme?.id],
    queryFn: async () => {
      if (!isletme || !cariId) return [];

      const { data, error } = await supabase
        .from('islemler')
        .select(`
          *,
          kategori:kategoriler(*)
        `)
        .eq('isletme_id', isletme.id)
        .eq('cari_id', cariId)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as IslemWithRelations[];
    },
    enabled: !!isletme && !!cariId,
  });
}

// Hesap işlemleri (kategori bilgisi dahil)
export function useIslemlerByHesap(hesapId: string) {
  const { isletme } = useAuthContext();

  return useQuery({
    queryKey: ['islemler', 'hesap', hesapId, isletme?.id],
    queryFn: async () => {
      if (!isletme || !hesapId) return [];

      const { data, error } = await supabase
        .from('islemler')
        .select(`
          *,
          kategori:kategoriler(*),
          hesap:hesaplar!islemler_hesap_id_fkey(*),
          hedef_hesap:hesaplar!islemler_hedef_hesap_id_fkey(*),
          cari:cariler(*),
          personel:personel(*)
        `)
        .eq('isletme_id', isletme.id)
        .or(`hesap_id.eq.${hesapId},hedef_hesap_id.eq.${hesapId}`)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as IslemWithRelations[];
    },
    enabled: !!isletme && !!hesapId,
  });
}

// Personel işlemleri (kategori bilgisi dahil)
export function useIslemlerByPersonel(personelId: string) {
  const { isletme } = useAuthContext();

  return useQuery({
    queryKey: ['islemler', 'personel', personelId, isletme?.id],
    queryFn: async () => {
      if (!isletme || !personelId) return [];

      const { data, error } = await supabase
        .from('islemler')
        .select(`
          *,
          kategori:kategoriler(*)
        `)
        .eq('isletme_id', isletme.id)
        .eq('personel_id', personelId)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as IslemWithRelations[];
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
        const cariAmount = calculateTargetAmount(amount, exchangeRate, sourceCurrency, 'TRY');

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
        const cariAmount = calculateTargetAmount(amount, exchangeRate, sourceCurrency, 'TRY');

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
        const personelAmount = calculateTargetAmount(amount, exchangeRate, sourceCurrency, 'TRY');

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
        const personelAmount = calculateTargetAmount(amount, exchangeRate, sourceCurrency, 'TRY');

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

// Tarihi yerel timezone'a göre formatla (YYYY-MM-DD)
export function formatDateLocal(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Tarihi kullanıcı dostu formata çevir
export function formatDateLabel(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  const months = getMonths();
  return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

// Dönem tarih aralığını hesapla (offset destekli)
export function getPeriodDateRange(
  period: PeriodType,
  offset: number = 0,
  customRange?: { startDate: string; endDate: string }
): {
  startDate: string;
  endDate: string;
  label: string;
} {
  const now = new Date();
  const months = getMonths();
  const monthsShort = getMonthsShort();
  let startDate: Date;
  let endDate: Date;
  let label: string;

  switch (period) {
    case 'yearly':
      // Yıl hesapla (offset: -1 = geçen yıl, 0 = bu yıl, 1 = gelecek yıl)
      const targetYear = now.getFullYear() + offset;
      startDate = new Date(targetYear, 0, 1);
      endDate = new Date(targetYear, 11, 31);
      label = targetYear.toString();
      break;
    case 'monthly':
      // Ay hesapla (offset: -1 = geçen ay, 0 = bu ay, 1 = gelecek ay)
      const targetMonth = new Date(now.getFullYear(), now.getMonth() + offset, 1);
      startDate = new Date(targetMonth.getFullYear(), targetMonth.getMonth(), 1);
      endDate = new Date(targetMonth.getFullYear(), targetMonth.getMonth() + 1, 0);
      label = `${months[targetMonth.getMonth()]} ${targetMonth.getFullYear()}`;
      break;
    case 'weekly':
      // Hafta hesapla (offset: -1 = geçen hafta, 0 = bu hafta, 1 = gelecek hafta)
      const dayOfWeek = now.getDay();
      const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const thisMonday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + mondayOffset);
      startDate = new Date(thisMonday);
      startDate.setDate(thisMonday.getDate() + (offset * 7));
      endDate = new Date(startDate);
      endDate.setDate(startDate.getDate() + 6);
      // Hafta etiketi: "23-29 Aralık" veya "28 Ara - 3 Oca" (aylar farklıysa)
      if (startDate.getMonth() === endDate.getMonth()) {
        label = `${startDate.getDate()}-${endDate.getDate()} ${months[startDate.getMonth()]}`;
      } else {
        label = `${startDate.getDate()} ${monthsShort[startDate.getMonth()]} - ${endDate.getDate()} ${monthsShort[endDate.getMonth()]}`;
      }
      break;
    case 'daily':
      // Gün hesapla (offset: -1 = dün, 0 = bugün, 1 = yarın)
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
      endDate = new Date(startDate);
      label = `${startDate.getDate()} ${months[startDate.getMonth()]} ${startDate.getFullYear()}`;
      break;
    case 'custom':
      // Özel tarih aralığı
      if (customRange) {
        return {
          startDate: customRange.startDate,
          endDate: customRange.endDate,
          label: `${formatDateLabel(customRange.startDate)} - ${formatDateLabel(customRange.endDate)}`,
        };
      }
      // Varsayılan olarak bu ayı göster
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      label = i18n.t('date.selectDate', { ns: 'common' }) || 'Select Date';
      break;
  }

  return {
    startDate: formatDateLocal(startDate),
    endDate: formatDateLocal(endDate),
    label,
  };
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

      // Hesap bilgisi ile birlikte çek (pasif filtresi için)
      const { data, error } = await supabase
        .from('islemler')
        .select(`
          type, 
          amount,
          hesap:hesaplar!hesap_id(is_active),
          hedef_hesap:hesaplar!hedef_hesap_id(is_active)
        `)
        .eq('isletme_id', isletme.id)
        .gte('date', startDateTime)
        .lte('date', endDateTime);

      if (error) throw error;

      // Pasif hesaplardaki işlemleri filtrele
      const activeTransactions = (data || []).filter((item: any) => {
        const hesapActive = item.hesap ? (Array.isArray(item.hesap) ? item.hesap[0]?.is_active : item.hesap.is_active) : true;
        const hedefHesapActive = item.hedef_hesap ? (Array.isArray(item.hedef_hesap) ? item.hedef_hesap[0]?.is_active : item.hedef_hesap.is_active) : true;
        // Hesap yoksa (null) aktif kabul et, varsa is_active kontrol et
        return hesapActive !== false && hedefHesapActive !== false;
      });

      // Merkezi hesaplama fonksiyonunu kullan
      return calculateIncomeSummary(activeTransactions as { type: IslemType; amount: number }[]);
    },
    enabled: !!isletme,
  });

  return {
    ...query,
    periodLabel: label,
  };
}
