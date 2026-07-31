import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { logEvent } from '@/lib/appEvents';
import { useAuthContext } from '@/contexts/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import {
  IleriTarihliIslem,
  IleriTarihliIslemInsert,
  IleriTarihliIslemUpdate,
  IleriTarihliIslemWithRelations,
  Islem,
} from '@/types/database';
import { queryKeys, invalidateRelatedQueries } from '@/lib/queryKeys';
import { formatDateForDB, formatDateTimeForDB } from '@/lib/date';
import { parseCrossCurrencyRateRequiredError } from '@/lib/crossCurrency';
import { cancelTransactionReminder } from '@/lib/notifications';
import { isSameScheduledCreate } from '@/lib/mutationIdentity';
import i18n from '@/i18n';

/**
 * Tamamlama girdisi. exchangeRate YALNIZ çapraz-kurlu planlarda gerekir; ilk deneme
 * kursuz yapılır, hook CrossCurrencyRateRequiredError fırlatırsa çağıran ekran kuru
 * sorup aynı id ile tekrar dener.
 */
export interface CompleteIleriTarihliInput {
  id: string;
  exchangeRate?: number | null;
  /** İlk kur isteminde server'ın verdiği snapshot tokenı. */
  expectedToken?: string | null;
}

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
  const { canAccessModule } = usePermissions();
  const canSeeHesaplar = canAccessModule('hesaplar');

  const result = useQuery({
    queryKey: [
      ...queryKeys.ileriTarihliIslemler.byHesap(hesapId, isletme?.id || ''),
      'module-access',
      canSeeHesaplar,
    ] as const,
    queryFn: async () => {
      // Hesap modülü açıksa ilgili hesabın bütün satırları creator'dan bağımsız
      // okunur. Kapalı kaynakların ilişkileri yalnız dar ad/tip alanları taşır;
      // bakiye bu select'e dahil değildir.
      if (!canSeeHesaplar) return [];
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
    enabled: canSeeHesaplar && !!isletme && !!hesapId,
    meta: {
      persist: false,
      query_purpose: 'ileri-tarihli:hesap-module-scoped',
    },
  });

  return {
    ...result,
    data: canSeeHesaplar ? result.data ?? [] : [],
  };
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
  const { canAccessModule } = usePermissions();
  const canSeePersonel = canAccessModule('personel');

  const result = useQuery({
    queryKey: [
      ...queryKeys.ileriTarihliIslemler.byPersonel(
        personelId,
        isletme?.id || '',
      ),
      'module-access',
      canSeePersonel,
    ] as const,
    queryFn: async () => {
      if (!canSeePersonel || !isletme || !personelId) return [];

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
    enabled: canSeePersonel && !!isletme && !!personelId,
    meta: {
      persist: false,
      query_purpose: 'ileri-tarihli:personel-module-scoped',
    },
  });

  return {
    ...result,
    data: canSeePersonel ? result.data ?? [] : [],
  };
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

      if (error) {
        // Aynı client UUID'li ilk insert sunucuda commit olup HTTP cevabı kaybolmuş olabilir.
        // Kör upsert mevcut veriyi ezebilir; yalnız birebir aynı pending/notified satırı başarı say.
        if (error.code === '23505' && input.id) {
          const { data: existing, error: existingError } = await supabase
            .from('ileri_tarihli_islemler')
            .select('*')
            .eq('id', input.id)
            .eq('isletme_id', isletme.id)
            .maybeSingle();

          if (existingError) throw existingError;
          if (
            existing
            && isSameScheduledCreate(
              existing as IleriTarihliIslem,
              input,
              isletme.id,
            )
          ) {
            return existing as IleriTarihliIslem;
          }
        }
        throw error;
      }
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
        .in('status', ['pending', 'notified'])
        .select()
        .maybeSingle();

      if (error) throw error;
      if (!data) throw new Error(i18n.t('common:errors.transactionNotFound'));
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

      const { data, error } = await supabase
        .from('ileri_tarihli_islemler')
        .delete()
        .eq('id', id)
        .eq('isletme_id', isletme.id)
        .in('status', ['pending', 'notified'])
        .select('id')
        .maybeSingle();

      if (error) throw error;
      if (!data) throw new Error(i18n.t('common:errors.transactionNotFound'));

      // Reminder yalnız kaynak satır gerçekten silindikten sonra kaldırılır.
      await cancelTransactionReminder(id);
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
    // Finansal mutation global retry ile körlemesine yeniden çalıştırılmaz. RPC kendi
    // içinde idempotenttir; olası "commit oldu, cevap kayboldu" durumu aşağıdaki tek,
    // salt-okunur source probe ile doğrulanır.
    retry: false,
    mutationFn: async ({
      id,
      exchangeRate,
      expectedToken,
    }: CompleteIleriTarihliInput): Promise<Islem> => {
      if (!isletme) throw new Error(i18n.t('common:errors.businessNotFound'));

      const completionAt = formatDateTimeForDB(new Date());

      // Tek yazma çağrısı: server satırı FOR UPDATE kilitler; güncel kaynaktan işlem
      // ve bakiye bacaklarını türetir; insert+bakiye+tahsis+status'u tek transaction yapar.
      // İstemci p_new_row veya p_balance_ops GÖNDERMEZ.
      const { data: rpcData, error: rpcError } = await supabase.rpc(
        'complete_ileri_tarihli_islem_atomik',
        {
          p_isletme_id: isletme.id,
          p_ileri_id: id,
          p_exchange_rate: exchangeRate ?? null,
          p_expected_token: expectedToken ?? null,
          // Eski istemcinin cihaz-yerel tarih + saat davranışını korur. RPC parametresi
          // timestamp without time zone olduğu için offset DB kolonuna kaydırılmadan,
          // cihazdaki görünen yerel saat bileşenleriyle yazılır.
          p_completion_at: completionAt,
        }
      );

      if (rpcError) {
        const mappedError = mapScheduledCompletionError(rpcError);
        if (mappedError) throw mappedError;

        // Yalnız tanınmayan/transport hatasında bounded probe: RPC sunucuda commit
        // olmuş ama HTTP cevabı kaybolmuşsa exact deterministic source başarıdır.
        const { data: existing, error: sourceProbeError } = await supabase
          .from('islemler')
          .select('*')
          .eq('isletme_id', isletme.id)
          .eq('source_ileri_id', id)
          .maybeSingle();

        if (sourceProbeError) throw rpcError;

        if (existing) {
          const { data: scheduled, error: scheduledProbeError } = await supabase
            .from('ileri_tarihli_islemler')
            .select('*')
            .eq('id', id)
            .eq('isletme_id', isletme.id)
            .maybeSingle();

          if (
            scheduledProbeError
            || !scheduled
            || !isExactScheduledCompletion(
              existing as Islem,
              isletme.id,
              id,
              scheduled as IleriTarihliIslem,
              exchangeRate ?? null,
            )
          ) {
            throw new Error(i18n.t('transactions:scheduled.existingRecordConflict'));
          }
          await cancelTransactionReminder(id);
          return existing as Islem;
        }

        throw rpcError;
      }

      const completedIslem = rpcData as Islem | null;
      if (!completedIslem) {
        throw new Error(i18n.t('common:errors.transactionCreationFailed'));
      }

      if (
        !isExactScheduledCompletion(
          completedIslem,
          isletme.id,
          id,
          undefined,
          exchangeRate ?? null,
        )
      ) {
        throw new Error(i18n.t('transactions:scheduled.existingRecordConflict'));
      }

      // Yerel reminder yalnız dayanıklı, exact finansal kayıt doğrulandıktan sonra
      // iptal edilir. Bildirim API'si kendi hatasını yutar; finansal başarıyı bozmaz.
      await cancelTransactionReminder(id);
      return completedIslem;
    },
    onSuccess: () => {
      // Hem ileri tarihli işlemler hem de normal işlemler invalidate et
      invalidateRelatedQueries(queryClient, 'ileriTarihliIslem');
      invalidateRelatedQueries(queryClient, 'islem');
    },
  });
}

function mapScheduledCompletionError(error: unknown): Error | null {
  const rateRequired = parseCrossCurrencyRateRequiredError(error);
  if (rateRequired) return rateRequired;

  const code =
    error !== null
      && typeof error === 'object'
      && 'code' in error
      && typeof (error as { code?: unknown }).code === 'string'
      ? (error as { code: string }).code
      : null;
  const message =
    error instanceof Error
      ? error.message
      : error !== null
        && typeof error === 'object'
        && 'message' in error
        && typeof (error as { message?: unknown }).message === 'string'
        ? (error as { message: string }).message
        : '';

  if (message.includes('SCHEDULED_LINKED_CARI_UNSUPPORTED')) {
    return new Error(i18n.t('transactions:scheduled.linkedCariUnsupported'));
  }
  if (code === '23505' || message.includes('SCHEDULED_SOURCE_CONFLICT')) {
    return new Error(i18n.t('transactions:scheduled.existingRecordConflict'));
  }
  if (message.includes('SCHEDULED_NOT_COMPLETABLE')) {
    return new Error(i18n.t('transactions:scheduled.completionInProgress'));
  }
  if (message.includes('SCHEDULED_NOT_FOUND')) {
    return new Error(i18n.t('common:errors.transactionNotFound'));
  }
  if (message.includes('SCHEDULED_STATUS_CONFLICT')) {
    return new Error(i18n.t('transactions:scheduled.completionStateFailed'));
  }
  if (message.includes('SCHEDULED_COMPLETION_CHANGED')) {
    return new Error(i18n.t('transactions:scheduled.completionChanged'));
  }
  if (
    code?.startsWith('22')
    || code === '23502'
    || code === '23503'
    || message.includes('SCHEDULED_ENTITY_SCOPE_MISMATCH')
  ) {
    return new Error(i18n.t('transactions:scheduled.completionDataInvalid'));
  }
  if (code === '42501') {
    return new Error(i18n.t('common:errors.permissionDenied'));
  }

  return null;
}

function isExactScheduledCompletion(
  islem: Islem,
  isletmeId: string,
  scheduledId: string,
  scheduled?: IleriTarihliIslem,
  expectedExchangeRate: number | null = null,
): boolean {
  const withTargetPointer = islem as Islem & {
    hedef_islem_id?: string | null;
  };
  const hasTargetPointerField = Object.prototype.hasOwnProperty.call(
    withTargetPointer,
    'hedef_islem_id',
  );
  const actualRate = islem.exchange_rate;
  const hasKnownCurrencies =
    typeof islem.source_currency === 'string'
    && typeof islem.target_currency === 'string';
  const isCrossCurrency =
    hasKnownCurrencies
    && islem.source_currency !== islem.target_currency;
  const rateMatches =
    expectedExchangeRate === null
      ? isCrossCurrency
        ? actualRate !== null
          && Number.isFinite(Number(actualRate))
          && Number(actualRate) > 0
        : hasKnownCurrencies && actualRate === null
      : actualRate !== null
        && Number.isFinite(Number(actualRate))
        && Math.round(Number(actualRate) * 100_000_000)
          === Math.round(expectedExchangeRate * 100_000_000);

  const identityAndFinancialNullsMatch =
    islem.id === scheduledId &&
    islem.isletme_id === isletmeId &&
    islem.source_ileri_id === scheduledId &&
    islem.photo_path === null &&
    islem.date_end === null &&
    islem.vade_tarihi === null &&
    hasTargetPointerField &&
    withTargetPointer.hedef_islem_id === null &&
    rateMatches;

  if (!identityAndFinancialNullsMatch) return false;
  if (!scheduled) return true;

  return (
    scheduled.id === scheduledId &&
    scheduled.isletme_id === isletmeId &&
    scheduled.status === 'completed' &&
    islem.type === scheduled.type &&
    Math.round(Number(islem.amount) * 100)
      === Math.round(Number(scheduled.amount) * 100) &&
    (islem.description ?? null) === (scheduled.description ?? null) &&
    islem.hesap_id === scheduled.hesap_id &&
    islem.hedef_hesap_id === scheduled.hedef_hesap_id &&
    islem.kategori_id === scheduled.kategori_id &&
    islem.cari_id === scheduled.cari_id &&
    islem.personel_id === scheduled.personel_id
  );
}
