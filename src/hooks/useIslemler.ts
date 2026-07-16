import { useMemo } from 'react';
import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { fetchAllPages } from '@/lib/supabaseHelpers';
import { logEvent } from '@/lib/appEvents';
import { useAuthContext } from '@/contexts/AuthContext';
import { Islem, IslemInsert, IslemWithRelations, IslemType } from '@/types/database';
import { isIncomeType, isExpenseType, isIncomeReturnType, isExpenseReturnType, LEAVE_TYPES } from '@/constants/islemTypes';
import { queryKeys, invalidateRelatedQueries } from '@/lib/queryKeys';
import { roundCurrency } from '@/lib/currency';
import { computeBalanceOps } from '@/lib/islemBalanceOps';
import { useSettings } from './useSettings';
import { useExchangeRates, convertCurrency } from './useExchangeRates';
import { invertCariTransactionType } from '@/lib/cariTransactionMapper';
import {
  getDateRange,
} from '@/lib/date';
import { LinkedRecordsError } from '@/lib/errors';
import i18n from '@/i18n';

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
    queryKey: queryKeys.islemler.list(isletme?.id ?? '', filters),
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
    meta: { query_purpose: 'islemler:list' },
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
    queryKey: queryKeys.islemler.detail(id ?? ''),
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
      if (!isletme) throw new Error(i18n.t('common:errors.businessNotFound'));

      // ─── [GEÇİCİ TEŞHİS — auth/kayıt-hang ölçümü, 13 Tem] ───────────────────
      // Uzun arka plandan sonra kayıt yolunda HANGİ await'in astığını KESİN görmek
      // için her faz'ın süresini ölçüp app_events'e yazıyoruz. Davranış DEĞİŞMEZ:
      // yalnız Date.now() okuması + eşik-üstü ateşle-unut log (yeni ağ çağrısı YOK,
      // mitigasyon YOK → gelen kanıt temiz). try/finally: yavaş-BAŞARILI ve yavaş-sonra-
      // HATA (satır kaydolur ama yanıt timeout) durumlarının İKİSİNİ de yakalar.
      // Teşhis bittiğinde bu blok ve alttaki ölçüm satırları ÇIKARILACAK.
      const __t0 = Date.now();
      const __timing: Record<string, unknown> = { is_cari: !!input.cari_id, type: input.type };
      let __ok = false;
      try {
        // Linked cari kontrolü: B (viewer) işlem oluştururken, cari balance
        // güncellemesi owner (A) perspektifinden yapılmalı
        // DB'ye kaydedilen tip değişmez (viewer perspektifi kalır)
        const __tLink = Date.now();
        const balanceInput = await applyLinkedCariInversion(input, isletme.id);
        __timing.link_ms = Date.now() - __tLink;

        // ATOMİK: insert + bakiye ops'ları TEK transaction'da (create_islem_atomik).
        // Deltalar computeBalanceOps ile hesaplanır — eski updateBalances ile BİREBİR aynı
        // (tek kaynak), yani yeni yol eski yolla AYNI bakiyeleri üretir; fark yalnız artık
        // "ya hepsi ya hiçbiri" olması → ikinci bacak patlarsa sessiz para kaybı YOK.
        const ops = computeBalanceOps(balanceInput);
        const __tRpc = Date.now();
        const { data, error } = await supabase.rpc('create_islem_atomik', {
          p_isletme_id: isletme.id,
          p_new_row: input,
          p_balance_ops: ops,
        });
        __timing.rpc_ms = Date.now() - __tRpc;

        if (error) {
          // Emniyet: RPC dağıtım boşluğu (undefined_function) → ESKİ insert+increment yoluna
          // düş (işlem yine kaydedilir; yalnız o nadir durumda atomik değil). Diğer TÜM
          // hataları yükselt — atomik olduğundan kısmi/yarım state kalmaz.
          if (error.code === '42883' || /create_islem_atomik/.test(error.message ?? '')) {
            const legacy = await createIslemLegacy(isletme.id, input, balanceInput);
            __ok = true;
            return legacy;
          }
          throw error;
        }

        __ok = true;
        return data as Islem;
      } finally {
        // [GEÇİCİ TEŞHİS] Yalnız yavaş kayıtları logla (normal kayıt <1sn → gürültü yok).
        const __totalMs = Date.now() - __t0;
        if (__totalMs > 2000) {
          logEvent('save_timing_debug', { ...__timing, total_ms: __totalMs, ok: __ok });
        }
      }
    },
    onSuccess: (data) => {
      invalidateRelatedQueries(queryClient, 'islem');
      logEvent('transaction_created', {
        type: data?.type,
        has_cari: !!data?.cari_id,
        has_personel: !!data?.personel_id,
        has_kategori: !!data?.kategori_id,
      });
    },
  });
}

// Cari işlem tipi mi kontrol et
function isCariType(type: string): boolean {
  return type.startsWith('cari_');
}

// Linked cari bilgisini getir - viewer mı ve type mismatch var mı?
async function getLinkedCariInfo(cariId: string, currentIsletmeId: string): Promise<{ shouldInvert: boolean } | null> {
  // Önce carinin hangi isletmeye ait olduğunu öğren
  const { data: cari, error: cariError } = await supabase
    .from('cariler')
    .select('isletme_id, type')
    .eq('id', cariId)
    .single();

  if (cariError || !cari) return null;

  // Kendi carisi ise inversiyona gerek yok
  if (cari.isletme_id === currentIsletmeId) return null;

  // Linked cari - viewer tarafından oluşturuluyor
  // cari_links'ten viewer_type bilgisini al
  const { data: link, error: linkError } = await supabase
    .from('cari_links')
    .select('viewer_type')
    .eq('cari_id', cariId)
    .eq('viewer_isletme_id', currentIsletmeId)
    .single();

  if (linkError || !link) return null;

  // Type mismatch varsa invert gerekli
  const shouldInvert = cari.type !== link.viewer_type;
  return { shouldInvert };
}

// İşlem verisini linked cari inversiyonu ile dönüştür (bakiye hesaplamaları için)
// DB'deki tip değişmez, sadece balance update fonksiyonlarına geçilen tip invert edilir
async function applyLinkedCariInversion<T extends { cari_id?: string | null; type: string }>(
  input: T,
  currentIsletmeId: string,
): Promise<T> {
  if (!input.cari_id || !isCariType(input.type)) return input;

  const linkInfo = await getLinkedCariInfo(input.cari_id, currentIsletmeId);
  if (!linkInfo?.shouldInvert) return input;

  return { ...input, type: invertCariTransactionType(input.type as IslemType) as string };
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

// Bakiye güncelleme (APPLY): işlemin bakiye etkisini uygular.
// Matematik computeBalanceOps'ta (tek kaynak, birim-testli); burası yalnız executor.
// Kısmi başarı korumalı: bir bacak (ör. iki-bacaklı transfer'in 2.'si) patlarsa, o ana
// kadar uygulanan bacaklar GERİ ALINIR — yoksa satır silinse bile bakiye orphan kalırdı.
async function updateBalances(islem: Omit<IslemInsert, 'isletme_id'>) {
  const ops = computeBalanceOps(islem);
  const applied: typeof ops = [];
  try {
    for (const op of ops) {
      await safeIncrementBalance(op.t, op.id, op.d);
      applied.push(op);
    }
  } catch (err) {
    // Uygulanan bacakları ters sırada geri al; geri alma da patlarsa yut (üst katman
    // islem satırını siler + kullanıcıya kritik hata mesajı verir).
    for (const op of applied.reverse()) {
      try {
        await safeIncrementBalance(op.t, op.id, -op.d);
      } catch {
        /* best-effort geri alma */
      }
    }
    throw err;
  }
}

// Eski (NON-ATOMIK) create yolu — YALNIZ create_islem_atomik RPC'si bulunamazsa fallback.
// insert + ayrı increment_balance'lar; ikinci bacak patlarsa satırı geri sil (mevcut davranış).
// Not: atomik RPC yoluyla çağrıldığında bu hiç çalışmaz; sadece dağıtım boşluğuna karşı emniyet.
async function createIslemLegacy(
  isletmeId: string,
  input: Omit<IslemInsert, 'isletme_id'>,
  balanceInput: Omit<IslemInsert, 'isletme_id'>,
): Promise<Islem> {
  const { data, error } = await supabase
    .from('islemler')
    .insert({ ...input, isletme_id: isletmeId })
    .select()
    .single();
  if (error) throw error;

  try {
    await updateBalances(balanceInput);
  } catch (balanceError) {
    try {
      await supabase.from('islemler').delete().eq('id', data.id).eq('isletme_id', isletmeId);
    } catch (rollbackError) {
      throw new Error(
        'Kritik hata: İşlem oluşturuldu ancak bakiye güncellenemedi ve geri alınamadı. ' +
        `Lütfen destek ile iletişime geçin. Detay: ${(rollbackError as Error).message}`
      );
    }
    throw balanceError;
  }
  return data as Islem;
}

// Cari işlemleri (kategori bilgisi dahil) - infinite scroll
// asViewer=true: bağlantılı cari'yi GÖRÜNTÜLEYEN işletme için. Kendi isletme_id filtresi
// UYGULANMAZ; bunun yerine RLS (view_linked_islemler) erişimi yalnız bağlı cari'nin
// işlemleriyle sınırlar → sahibin işlemleri güvenle görünür, başka veri sızmaz.
// asViewer=false (varsayılan): sahip/normal akış — davranış birebir aynı.
export function useIslemlerByCari(cariId: string, asViewer = false) {
  const { isletme } = useAuthContext();

  const result = useInfiniteQuery({
    queryKey: [...queryKeys.islemler.byCari(cariId, isletme?.id ?? ''), asViewer ? 'viewer' : 'owner'],
    queryFn: async ({ pageParam = 0 }) => {
      if (!isletme || !cariId) return [];

      const from = pageParam * ISLEMLER_PAGE_SIZE;
      const to = from + ISLEMLER_PAGE_SIZE - 1;

      let query = supabase
        .from('islemler')
        .select(`
          *,
          kategori:kategoriler(id,name),
          hesap:hesaplar!hesap_id(id,name,currency,type,is_active),
          creator:profiles!islemler_created_by_profiles_fk(display_name,email)
        `)
        .eq('cari_id', cariId);

      // Sahip/normal akışta kendi işletmesiyle sınırla. Viewer'da atlanır (RLS scope eder).
      if (!asViewer) {
        query = query.eq('isletme_id', isletme.id);
      }

      const { data, error } = await query
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
    queryKey: queryKeys.islemler.byHesap(hesapId, isletme?.id ?? ''),
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
    queryKey: queryKeys.islemler.byPersonel(personelId, isletme?.id ?? ''),
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

// Personel işlemleri - rapor için tüm işlemler (pagination yok)
export function useAllIslemlerByPersonel(personelId: string) {
  const { isletme } = useAuthContext();

  return useQuery({
    queryKey: queryKeys.islemler.allByPersonel(personelId, isletme?.id ?? ''),
    queryFn: async () => {
      if (!isletme || !personelId) return [];

      const data = await fetchAllPages<IslemWithRelations>(() => supabase
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
      );
      return data;
    },
    enabled: !!isletme && !!personelId,
  });
}

// Personel İZİN işlemleri - izin geçmişi için (type-filtreli, pagination yok).
// Sadece izin satırları çekilir (düşük egress); tüm izin geçmişi eksiksiz gelir.
export function useAllLeaveByPersonel(personelId: string) {
  const { isletme } = useAuthContext();

  return useQuery({
    queryKey: queryKeys.islemler.allLeaveByPersonel(personelId, isletme?.id ?? ''),
    queryFn: async () => {
      if (!isletme || !personelId) return [];

      const data = await fetchAllPages<IslemWithRelations>(() => supabase
        .from('islemler')
        .select(`
          *,
          kategori:kategoriler(id,name),
          hesap:hesaplar!hesap_id(id,name,currency,type,is_active),
          creator:profiles!islemler_created_by_profiles_fk(display_name,email)
        `)
        .eq('isletme_id', isletme.id)
        .eq('personel_id', personelId)
        .in('type', LEAVE_TYPES)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false })
      );
      return data;
    },
    enabled: !!isletme && !!personelId,
  });
}

// Cari işlemleri - rapor için tüm işlemler (pagination yok)
// enabled=false: mutabakat raporu snapshot alındıktan sonra kuyruktan eklenen her
// işlemin invalidation'ı tüm geçmişi yeniden indirmesin diye kapatılabilir.
export function useAllIslemlerByCari(cariId: string, enabled: boolean = true) {
  const { isletme } = useAuthContext();

  return useQuery({
    queryKey: queryKeys.islemler.allByCari(cariId, isletme?.id ?? ''),
    queryFn: async () => {
      if (!isletme || !cariId) return [];

      const data = await fetchAllPages<IslemWithRelations>(() => supabase
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
      );
      return data;
    },
    enabled: !!isletme && !!cariId && enabled,
  });
}

// İşlem güncelleme - transaction güvenliği ile
export function useUpdateIslem() {
  const queryClient = useQueryClient();
  const { isletme } = useAuthContext();

  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Omit<IslemInsert, 'isletme_id'>> }) => {
      if (!isletme) throw new Error(i18n.t('common:errors.businessNotFound'));

      // Önce mevcut işlemi al
      const { data: oldIslem, error: fetchError } = await supabase
        .from('islemler')
        .select('*')
        .eq('id', id)
        .eq('isletme_id', isletme.id)
        .single();

      if (fetchError) throw fetchError;
      if (!oldIslem) throw new Error(i18n.t('common:errors.transactionNotFound'));

      // ATOMİK GÜNCELLEME: net bakiye değişimi + islem satırı güncelleme TEK
      // transaction'da (update_islem_atomik RPC). Eski akış satır update + reverse(old)
      // + apply(new)'i ayrı çağrılarla yapıyordu; kısmi hatada satır YENİ ama bakiye
      // ESKİ'ye göre yarım kalıp kasa/cari sessizce DESYNC olabiliyordu.
      //
      // Bakiye NET ops = reverse(old) ++ apply(new). Bakiye hesabı linked-cari
      // inversiyonlu perspektiften (computeBalanceOps); satır ise NON-inverted
      // gerçek değerlerle ({...oldIslem, ...updates}) saklanır — eski davranışla aynı.
      const oldBalanceIslem = await applyLinkedCariInversion(oldIslem, isletme.id);
      const mergedRow = { ...oldIslem, ...updates };
      const newBalanceInput = await applyLinkedCariInversion(mergedRow, isletme.id);
      const netOps = [
        ...computeBalanceOps(oldBalanceIslem).map((op) => ({ t: op.t, id: op.id, d: -op.d })), // reverse old
        ...computeBalanceOps(newBalanceInput).map((op) => ({ t: op.t, id: op.id, d: op.d })), //  apply new
      ];

      const { data, error } = await supabase.rpc('update_islem_atomik', {
        p_isletme_id: isletme.id,
        p_islem_id: id,
        p_balance_ops: netOps,
        p_new_row: mergedRow,
      });

      if (error) {
        if (
          error.code === '42501' ||
          error.message?.includes('policy') ||
          error.message?.includes('Yetkisiz')
        ) {
          throw new Error(i18n.t('common:errors.permissionDenied'));
        }
        throw error;
      }

      return data as Islem;
    },
    onSuccess: () => {
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
      if (!isletme) throw new Error(i18n.t('common:errors.businessNotFound'));

      // Önce işlemi al (bakiye geri almak için) - ownership kontrolü ile
      const { data: islem, error: fetchError } = await supabase
        .from('islemler')
        .select('*')
        .eq('id', id)
        .eq('isletme_id', isletme.id)
        .single();

      if (fetchError) throw fetchError;
      if (!islem) throw new Error(i18n.t('common:errors.transactionNotFound'));

      // Linked cari inversiyonu: viewer perspektifinden owner perspektifine çevir
      const balanceIslem = await applyLinkedCariInversion(islem, isletme.id);

      // ATOMİK SİLME: bakiye geri-alma + stok geri-alma + urun_hareketler sil + islem
      // sil — hepsi TEK transaction'da (delete_islem_atomik RPC). Eski akış bunları
      // ayrı ağ çağrılarıyla yapıyordu; kısmi hatada (2. increment patlar / islem
      // silme RLS'e sessiz takılır) bakiye/stok telafisiz DESYNC olabiliyordu. Artık
      // herhangi bir adım hata verirse tüm değişiklikler geri sarılır.
      // Bakiye delta'ları app'te hesaplanır (computeBalanceOps → cross-currency dahil),
      // reverse (negatif) edilip RPC'ye verilir; RPC mevcut increment_balance +
      // update_urun_miktar'ı aynı transaction içinde çağırır (davranış birebir aynı).
      const reverseOps = computeBalanceOps(balanceIslem).map((op) => ({ t: op.t, id: op.id, d: -op.d }));

      const { error: delError } = await supabase.rpc('delete_islem_atomik', {
        p_isletme_id: isletme.id,
        p_islem_id: id,
        p_balance_ops: reverseOps,
      });

      if (delError) {
        // RLS/guard hatası ise daha açıklayıcı mesaj
        if (
          delError.code === '42501' ||
          delError.message?.includes('policy') ||
          delError.message?.includes('Yetkisiz')
        ) {
          throw new Error(i18n.t('common:errors.permissionDenied'));
        }
        throw delError;
      }
    },
    onSuccess: () => {
      // Merkezi invalidation helper kullan
      invalidateRelatedQueries(queryClient, 'islem');
      invalidateRelatedQueries(queryClient, 'urunHareket');
    },
  });
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
  const { currency: baseCurrency } = useSettings();
  const { data: exchangeRatesData } = useExchangeRates();
  const rates = exchangeRatesData?.rates;

  const { startDate, endDate, label } = getPeriodDateRange(period, offset, customRange);

  // Tarih aralığını normalize et (gün sonuna kadar dahil etmek için)
  const { startDateTime, endDateTime } = normalizeDateRange(startDate, endDate);

  const query = useQuery({
    queryKey: queryKeys.reports.monthSummary(isletme?.id ?? '', period, offset, startDate, endDate),
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
        if (__DEV__) console.error('[useMonthSummary] RPC error:', error.message, (error as unknown as { code: string }).code);
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
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });

  // RPC sonucu TRY cinsindendir; ana para birimine çevir (dashboard'ın geri kalanıyla tutarlı).
  // Kur yoksa TRY değeri korunur (sessiz 1:1 yerine mevcut değeri gösterir).
  const convertedData = useMemo(() => {
    const raw = query.data;
    if (!raw) return raw;
    if (baseCurrency === 'TRY') return raw;
    const income = convertCurrency(raw.income, 'TRY', baseCurrency, rates);
    const expense = convertCurrency(raw.expense, 'TRY', baseCurrency, rates);
    return {
      income: income === null ? raw.income : roundCurrency(income),
      expense: expense === null ? raw.expense : roundCurrency(expense),
    };
  }, [query.data, baseCurrency, rates]);

  return {
    ...query,
    data: convertedData,
    periodLabel: label,
  };
}

// İşlem notlarında arama (description alanında server-side ilike)
export function useSearchIslemler(searchQuery: string) {
  const { isletme } = useAuthContext();
  const q = searchQuery.trim();

  return useQuery({
    queryKey: queryKeys.islemler.search(isletme?.id ?? '', q),
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

interface IslemFilterSearchParams {
  searchQuery?: string;
  minAmount?: number | null;
  maxAmount?: number | null;
  dateFrom?: string | null;
  dateTo?: string | null;
}

export function useFilteredIslemler(params: IslemFilterSearchParams) {
  const { isletme } = useAuthContext();
  const q = params.searchQuery?.trim() || '';
  const hasTextQuery = q.length >= 2;
  const hasAmountFilter = params.minAmount != null || params.maxAmount != null;
  const hasDateFilter = !!params.dateFrom || !!params.dateTo;
  const hasAnyFilter = hasTextQuery || hasAmountFilter || hasDateFilter;

  return useQuery({
    queryKey: ['islemler', 'filtered', isletme?.id ?? '', q, params.minAmount, params.maxAmount, params.dateFrom, params.dateTo],
    queryFn: async () => {
      if (!isletme) return [];

      let queryBuilder = supabase
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
        .eq('isletme_id', isletme.id);

      if (hasTextQuery) {
        const sanitized = q.replace(/[\\%_]/g, (ch) => `\\${ch}`);
        queryBuilder = queryBuilder.ilike('description', `%${sanitized}%`);
      }

      if (params.minAmount != null) {
        queryBuilder = queryBuilder.gte('amount', params.minAmount);
      }
      if (params.maxAmount != null) {
        queryBuilder = queryBuilder.lte('amount', params.maxAmount);
      }

      if (params.dateFrom) {
        queryBuilder = queryBuilder.gte('date', params.dateFrom);
      }
      if (params.dateTo) {
        queryBuilder = queryBuilder.lte('date', `${params.dateTo}T23:59:59`);
      }

      const { data, error } = await queryBuilder
        .order('date', { ascending: false })
        .limit(50);

      if (error) throw error;
      return data as IslemWithRelations[];
    },
    enabled: !!isletme && hasAnyFilter,
  });
}
