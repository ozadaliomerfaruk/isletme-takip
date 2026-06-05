import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { logEvent } from '@/lib/appEvents';
import { useAuthContext } from '@/contexts/AuthContext';
import {
  IleriTarihliIslem,
  IleriTarihliIslemInsert,
  IleriTarihliIslemUpdate,
  IleriTarihliIslemWithRelations,
  IslemInsert,
} from '@/types/database';
import { queryKeys, invalidateRelatedQueries } from '@/lib/queryKeys';
import { formatDateForDB, formatDateTimeForDB } from '@/lib/date';
import { safeParseAmount, safeParseExchangeRate, calculateTargetAmount } from '@/lib/currency';
import { cancelTransactionReminder } from '@/lib/notifications';
import i18n from '@/i18n';

// ============================================================================
// QUERY HOOKS
// ============================================================================

/**
 * Tüm ileri tarihli işlemleri getir (henüz tamamlanmamış olanlar: pending + notified).
 * 'notified' = hatırlatma bildirimi gönderilmiş ama kullanıcı henüz tamamlamamış.
 * Bunları da listeye dahil ediyoruz ki bildirim sonrası (özellikle vadesi geçmiş)
 * işlemler sessizce kaybolmasın; aksi halde kullanıcı onları bir daha göremezdi.
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
          hesap:hesaplar!hesap_id(id,name,currency,type,is_active),
          hedef_hesap:hesaplar!hedef_hesap_id(id,name,currency,type,is_active),
          kategori:kategoriler(id,name),
          cari:cariler(id,name,currency),
          personel:personel(id,first_name,last_name,currency)
        `)
        .eq('isletme_id', isletme.id)
        .in('status', ['pending', 'notified'])
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
          hesap:hesaplar!hesap_id(id,name,currency,type,is_active),
          hedef_hesap:hesaplar!hedef_hesap_id(id,name,currency,type,is_active),
          kategori:kategoriler(id,name),
          cari:cariler(id,name,currency),
          personel:personel(id,first_name,last_name,currency)
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
          hesap:hesaplar!hesap_id(id,name,currency,type,is_active),
          hedef_hesap:hesaplar!hedef_hesap_id(id,name,currency,type,is_active),
          kategori:kategoriler(id,name),
          cari:cariler(id,name,currency),
          personel:personel(id,first_name,last_name,currency)
        `)
        .eq('isletme_id', isletme.id)
        .in('status', ['pending', 'notified'])
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
          hesap:hesaplar!hesap_id(id,name,currency,type,is_active),
          hedef_hesap:hesaplar!hedef_hesap_id(id,name,currency,type,is_active),
          kategori:kategoriler(id,name),
          cari:cariler(id,name,currency),
          personel:personel(id,first_name,last_name,currency)
        `)
        .eq('isletme_id', isletme.id)
        .in('status', ['pending', 'notified'])
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
          hesap:hesaplar!hesap_id(id,name,currency,type,is_active),
          hedef_hesap:hesaplar!hedef_hesap_id(id,name,currency,type,is_active),
          kategori:kategoriler(id,name),
          cari:cariler(id,name,currency),
          personel:personel(id,first_name,last_name,currency)
        `)
        .eq('isletme_id', isletme.id)
        .in('status', ['pending', 'notified'])
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
          hesap:hesaplar!hesap_id(id,name,currency,type,is_active),
          hedef_hesap:hesaplar!hedef_hesap_id(id,name,currency,type,is_active),
          kategori:kategoriler(id,name),
          cari:cariler(id,name,currency),
          personel:personel(id,first_name,last_name,currency)
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
      if (!isletme) throw new Error(i18n.t('common:errors.businessNotFound'));

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
    onSuccess: (data) => {
      invalidateRelatedQueries(queryClient, 'ileriTarihliIslem');
      logEvent('scheduled_transaction_created', {
        type: data?.type,
        has_cari: !!data?.cari_id,
        has_personel: !!data?.personel_id,
        has_kategori: !!data?.kategori_id,
      });
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
      if (!isletme) throw new Error(i18n.t('common:errors.businessNotFound'));

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
      if (!isletme) throw new Error(i18n.t('common:errors.businessNotFound'));

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
    mutationFn: async (id: string): Promise<IslemInsert | null> => {
      if (!isletme) throw new Error(i18n.t('common:errors.businessNotFound'));

      // 0. Hatırlatıcıyı iptal et (varsa)
      await cancelTransactionReminder(id);

      // 1. İleri tarihli işlemi al (relations ile birlikte - para birimi belirlemek için)
      const { data: ileriIslem, error: fetchError } = await supabase
        .from('ileri_tarihli_islemler')
        .select(`
          *,
          hesap:hesaplar!hesap_id(currency),
          hedef_hesap:hesaplar!hedef_hesap_id(currency),
          cari:cariler!cari_id(currency),
          personel:personel!personel_id(currency)
        `)
        .eq('id', id)
        .eq('isletme_id', isletme.id)
        .single();

      if (fetchError) throw fetchError;
      if (!ileriIslem) throw new Error(i18n.t('common:errors.transactionNotFound'));

      // 1b. ATOMİK "CLAIM": satırı yalnızca hâlâ tamamlanmamışken (pending/notified)
      // 'completed' yap. Bu koşullu UPDATE Postgres'te atomiktir; aynı satır için
      // yarışan iki tetikleme (çift dokunma, iki cihaz, çevrimdışı retry) olursa
      // SADECE biri satırı kaplar (claimed.length === 1), diğeri 0 satır günceller
      // ve aşağıdaki insert/bakiye adımlarına HİÇ ulaşamaz. Böylece çift kayıt ve
      // çift sayılan bakiye engellenir.
      const previousStatus = ileriIslem.status;
      const { data: claimed, error: claimError } = await supabase
        .from('ileri_tarihli_islemler')
        .update({ status: 'completed' })
        .eq('id', id)
        .eq('isletme_id', isletme.id)
        .in('status', ['pending', 'notified'])
        .select('id');

      if (claimError) throw claimError;
      if (!claimed || claimed.length === 0) {
        // Satır başka bir aksiyon tarafından zaten tamamlanmış (veya silinmiş).
        // Kullanıcı açısından işlem zaten kaydedilmiş demektir -> sessiz başarı.
        return null;
      }

      // 2. Para birimlerini belirle (cross-currency desteği)
      const hesapCurrency = ileriIslem.hesap?.currency || 'TRY';
      const hedefHesapCurrency = ileriIslem.hedef_hesap?.currency || 'TRY';
      const cariCurrency = ileriIslem.cari?.currency || 'TRY';
      const personelCurrency = ileriIslem.personel?.currency || 'TRY';

      // Source/target currency belirleme (işlem tipine göre)
      let sourceCurrency = hesapCurrency;
      let targetCurrency = hesapCurrency;

      if (ileriIslem.type === 'transfer') {
        sourceCurrency = hesapCurrency;
        targetCurrency = hedefHesapCurrency;
      } else if (ileriIslem.type.startsWith('cari_')) {
        sourceCurrency = hesapCurrency;
        targetCurrency = cariCurrency;
      } else if (ileriIslem.type.startsWith('personel_')) {
        sourceCurrency = hesapCurrency;
        targetCurrency = personelCurrency;
      }

      // 3. Gerçek işlem olarak oluştur
      const islemData: IslemInsert = {
        isletme_id: isletme.id,
        type: ileriIslem.type,
        amount: ileriIslem.amount,
        description: ileriIslem.description,
        date: formatDateTimeForDB(new Date()), // Bugünün tarihi + saat (timezone dahil)
        hesap_id: ileriIslem.hesap_id,
        hedef_hesap_id: ileriIslem.hedef_hesap_id,
        kategori_id: ileriIslem.kategori_id,
        cari_id: ileriIslem.cari_id,
        personel_id: ileriIslem.personel_id,
        source_currency: sourceCurrency,
        target_currency: targetCurrency,
        exchange_rate: ileriIslem.exchange_rate,
        // Çift kayıt koruması: bu islem'i kaynak ileri tarihli satıra bağla.
        // DB'deki partial UNIQUE index, aynı kaynaktan ikinci bir islem
        // oluşturulmasını imkânsız kılar.
        source_ileri_id: id,
      };

      const { data: newIslem, error: insertError } = await supabase
        .from('islemler')
        .insert(islemData)
        .select()
        .single();

      if (insertError) {
        // Rollback: claim'i geri al (satırı eski durumuna döndür) ki kullanıcı
        // tekrar deneyebilsin. (UNIQUE ihlali = zaten kaydedilmiş demektir.)
        await supabase
          .from('ileri_tarihli_islemler')
          .update({ status: previousStatus })
          .eq('id', id)
          .eq('isletme_id', isletme.id);
        throw insertError;
      }
      if (!newIslem) throw new Error(i18n.t('common:errors.transactionCreationFailed'));

      // 4. Bakiyeleri güncelle
      try {
        await updateBalancesForIslem(islemData);
      } catch (balanceError) {
        // Rollback: oluşturulan işlemi sil ve claim'i geri al
        await supabase.from('islemler').delete().eq('id', newIslem.id);
        await supabase
          .from('ileri_tarihli_islemler')
          .update({ status: previousStatus })
          .eq('id', id)
          .eq('isletme_id', isletme.id);
        throw balanceError;
      }

      // Not: Satır 1b'de atomik olarak 'completed' yapıldığı için ayrı bir
      // status güncelleme adımına gerek yoktur.
      return islemData;
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
    throw new Error(i18n.t('common:errors.balanceUpdateFailed', { message: error.message }));
  }
}

async function updateBalancesForIslem(islem: IslemInsert) {
  const amount = safeParseAmount(islem.amount, 'işlem tutarı');
  const exchangeRate = safeParseExchangeRate(islem.exchange_rate);
  const sourceCurrency = islem.source_currency || 'TRY';
  const targetCurrency = islem.target_currency || 'TRY';

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
      {
        if (islem.hesap_id) {
          await safeIncrementBalance('hesaplar', islem.hesap_id, -amount);
        }
        if (islem.hedef_hesap_id) {
          const targetAmount = calculateTargetAmount(amount, exchangeRate, sourceCurrency, targetCurrency);
          await safeIncrementBalance('hesaplar', islem.hedef_hesap_id, targetAmount);
        }
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
      {
        const cariAmount = calculateTargetAmount(amount, exchangeRate, sourceCurrency, targetCurrency);
        if (islem.cari_id) {
          await safeIncrementBalance('cariler', islem.cari_id, cariAmount);
        }
        if (islem.hesap_id) {
          await safeIncrementBalance('hesaplar', islem.hesap_id, -amount);
        }
      }
      break;

    case 'cari_tahsilat':
      {
        const cariAmount = calculateTargetAmount(amount, exchangeRate, sourceCurrency, targetCurrency);
        if (islem.cari_id) {
          await safeIncrementBalance('cariler', islem.cari_id, -cariAmount);
        }
        if (islem.hesap_id) {
          await safeIncrementBalance('hesaplar', islem.hesap_id, amount);
        }
      }
      break;

    case 'personel_gider':
      if (islem.personel_id) {
        await safeIncrementBalance('personel', islem.personel_id, -amount);
      }
      break;

    case 'personel_odeme':
      {
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
      {
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

// Not: reverseBalancesForIslem kaldırıldı — eski tamamlama akışında, son status
// güncellemesi başarısız olursa bakiyeleri geri almak için kullanılıyordu. Yeni
// akışta status atomik "claim" ile en başta ayarlandığından (1b), bakiyeler
// uygulandıktan SONRA başarısız olabilecek bir adım kalmadı; bu yüzden gerek yok.
