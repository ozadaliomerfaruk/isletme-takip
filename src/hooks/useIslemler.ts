import { useMemo, useRef } from 'react';
import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { fetchAllPages } from '@/lib/supabaseHelpers';
import { logEvent } from '@/lib/appEvents';
import { useAuthContext } from '@/contexts/AuthContext';
import { Islem, IslemInsert, IslemWithRelations, IslemType, UrunHareketTipi } from '@/types/database';
import {
  isIncomeType,
  isExpenseType,
  isIncomeReturnType,
  isExpenseReturnType,
  isLeaveType,
  LEAVE_TYPES,
} from '@/constants/islemTypes';
import { queryKeys, invalidateRelatedQueries } from '@/lib/queryKeys';
import { roundCurrency } from '@/lib/currency';
import { computeBalanceOps } from '@/lib/islemBalanceOps';
import { useSettings } from './useSettings';
import { useExchangeRates, convertCurrency } from './useExchangeRates';
import { usePermissions } from './usePermissions';
import { invertCariTransactionType } from '@/lib/cariTransactionMapper';
import {
  getDateRange,
} from '@/lib/date';
import {
  classifyMutationError,
  MutationRetryPayloadChangedError,
  SharedTransactionMutationUnsupportedError,
  TransactionPermissionError,
  type TransactionPermissionReason,
} from '@/lib/errors';
import { isSameRegularCreate } from '@/lib/mutationIdentity';
import type { InstallmentRpcRow } from '@/lib/installmentDistribution';
import {
  canAccessTransactionSources,
  isProductTransactionType,
  type TransactionSourceModule,
} from '@/lib/transactionSourceModules';
import { supportsSharedProductMutationV3 } from '@/lib/sharedProductMutationTypes';
import {
  type CariIslemCursor,
  type CariIslemListRow,
  parseCariIslemListRows,
} from '@/lib/cariTransactionProjection';
import {
  dedupeHesapIslemRowsById,
  type HesapIslemCursor,
  type HesapIslemListRow,
  parseHesapIslemListRows,
} from '@/lib/hesapTransactionProjection';
import {
  dedupePersonelIslemRowsById,
  type PersonelIslemCursor,
  type PersonelIslemListRow,
  parsePersonelIslemListRows,
} from '@/lib/personelTransactionProjection';
import {
  buildCreateIslemV2Payload,
  parseCreateIslemV2Response,
  type CreateIslemV2CariScope,
  type CreateIslemV2Input,
} from '@/lib/createIslemV2Client';
import { permissionAccessSignature } from '@/lib/permissionCacheGuard';
import { normalizeProductMutationItems } from '@/lib/productMutation';
import {
  buildSharedTransactionMutationPatch,
  parseTransactionMutationContext,
  type TransactionMutationContext,
} from '@/lib/transactionMutationContext';
import {
  dedupeAuthorizedTransactionRowsById,
  parseAuthorizedTransactionRows,
} from '@/lib/authorizedTransactionProjection';
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
const CARI_PROJECTION_ALL_PAGE_SIZE = 100;
const CARI_PROJECTION_MAX_PAGES = 1000;
const PERSONEL_PROJECTION_ALL_PAGE_SIZE = 100;
const PERSONEL_PROJECTION_MAX_PAGES = 1000;

interface AllTransactionsPageParam {
  page: number;
  beforeDate: string | null;
  beforeId: string | null;
}

interface AllTransactionsPage {
  rows: IslemWithRelations[];
  nextPageParam?: AllTransactionsPageParam;
}

export type PersonelTransactionRow =
  | IslemWithRelations
  | PersonelIslemListRow;
export type CariTransactionRow =
  | IslemWithRelations
  | CariIslemListRow;

export interface CariProductMutationItem {
  urun_id: string;
  hareket_tipi: UrunHareketTipi;
  miktar: number;
  birim_fiyat: number;
  kdv_orani: number;
  aciklama: string | null;
}

async function fetchAllCariProjectionPages(
  isletmeId: string,
  cariId: string,
): Promise<CariIslemListRow[]> {
  const rows: CariIslemListRow[] = [];
  const seenIds = new Set<string>();
  let cursor: CariIslemCursor | null = null;

  for (
    let pageIndex = 0;
    pageIndex < CARI_PROJECTION_MAX_PAGES;
    pageIndex += 1
  ) {
    const { data, error } = await supabase.rpc(
      'get_cari_islem_satirlari_v1',
      {
        p_isletme_id: isletmeId,
        p_cari_id: cariId,
        p_limit: CARI_PROJECTION_ALL_PAGE_SIZE,
        p_before_date: cursor?.date ?? null,
        p_before_created_at: cursor?.created_at ?? null,
        p_before_id: cursor?.id ?? null,
      },
    );
    if (error) throw error;

    const page = parseCariIslemListRows(data);
    page.forEach((row) => {
      if (seenIds.has(row.id)) return;
      seenIds.add(row.id);
      rows.push(row);
    });
    if (page.length < CARI_PROJECTION_ALL_PAGE_SIZE) {
      return rows;
    }

    const lastRow = page[page.length - 1];
    const nextCursor: CariIslemCursor = {
      date: lastRow.date,
      created_at: lastRow.created_at,
      id: lastRow.id,
    };
    if (
      cursor
      && cursor.date === nextCursor.date
      && cursor.created_at === nextCursor.created_at
      && cursor.id === nextCursor.id
    ) {
      throw new Error('Cari transaction projection cursor did not advance');
    }
    cursor = nextCursor;
  }

  throw new Error('Cari transaction projection page limit exceeded');
}

async function fetchAllPersonelProjectionPages(
  isletmeId: string,
  personelId: string,
): Promise<PersonelIslemListRow[]> {
  const rows: PersonelIslemListRow[] = [];
  let cursor: PersonelIslemCursor | null = null;

  for (
    let pageIndex = 0;
    pageIndex < PERSONEL_PROJECTION_MAX_PAGES;
    pageIndex += 1
  ) {
    const { data, error } = await supabase.rpc(
      'get_personel_islem_satirlari_v1',
      {
        p_isletme_id: isletmeId,
        p_personel_id: personelId,
        p_limit: PERSONEL_PROJECTION_ALL_PAGE_SIZE,
        p_before_date: cursor?.date ?? null,
        p_before_created_at: cursor?.created_at ?? null,
        p_before_id: cursor?.id ?? null,
      },
    );

    if (error) throw error;
    const page = parsePersonelIslemListRows(data);
    rows.push(...page);

    if (page.length < PERSONEL_PROJECTION_ALL_PAGE_SIZE) {
      return dedupePersonelIslemRowsById(rows);
    }

    const lastRow = page[page.length - 1];
    const nextCursor: PersonelIslemCursor = {
      date: lastRow.date,
      created_at: lastRow.created_at,
      id: lastRow.id,
    };
    if (
      cursor
      && cursor.date === nextCursor.date
      && cursor.created_at === nextCursor.created_at
      && cursor.id === nextCursor.id
    ) {
      throw new Error('Personnel transaction projection cursor did not advance');
    }
    cursor = nextCursor;
  }

  throw new Error('Personnel transaction projection page limit exceeded');
}

function transactionPermissionError(
  action: 'create' | 'update' | 'delete',
  reason: TransactionPermissionReason,
  originalError?: unknown,
): TransactionPermissionError {
  const messageKey =
    action === 'create'
      ? 'transactions:permissions.createDenied'
      : reason === 'ownership'
      ? action === 'update'
        ? 'transactions:permissions.otherUserUpdateDenied'
        : 'transactions:permissions.otherUserDeleteDenied'
      : action === 'update'
        ? 'transactions:permissions.updateDenied'
        : 'transactions:permissions.deleteDenied';

  return new TransactionPermissionError(
    action,
    reason,
    i18n.t(messageKey),
    originalError,
  );
}

type CanCreateModule = (module: string) => boolean;
type CanModifyModule = (module: string, createdBy: string | null) => boolean;
type CanAccessSourceModule = (module: TransactionSourceModule) => boolean;

interface CreatePermissionSnapshot {
  isletmeId: string | null;
  canCreate: CanCreateModule;
  canAccessModule: CanAccessSourceModule;
}

interface ModifyPermissionSnapshot {
  isletmeId: string | null;
  currentUserId: string | null;
  isOwner: boolean;
  canModify: CanModifyModule;
  canAccessModule: CanAccessSourceModule;
}

function assertCanCreateTransaction(
  type: unknown,
  expectedIsletmeId: string,
  snapshot: CreatePermissionSnapshot,
  additionalModules: readonly TransactionSourceModule[] = [],
): void {
  if (
    snapshot.isletmeId !== expectedIsletmeId
    || !snapshot.canCreate('islemler')
    || !canAccessTransactionSources(
      [type],
      snapshot.canAccessModule,
      additionalModules,
    )
  ) {
    throw transactionPermissionError('create', 'permission');
  }
}

function assertCanModifyTransaction(
  action: 'update' | 'delete',
  types: readonly unknown[],
  createdBy: string | null,
  expectedIsletmeId: string,
  snapshot: ModifyPermissionSnapshot,
  additionalModules: readonly TransactionSourceModule[] = [],
  requiredActionModules: readonly TransactionSourceModule[] = [],
): void {
  const canAccessSources = canAccessTransactionSources(
    types,
    snapshot.canAccessModule,
    additionalModules,
  );
  const canModifyRecord =
    snapshot.isletmeId === expectedIsletmeId
    && canAccessSources
    && snapshot.canModify('islemler', createdBy)
    && requiredActionModules.every(
      (module) => snapshot.canModify(module, createdBy),
    );

  if (canModifyRecord) return;

  const canModifyOwnRecord =
    snapshot.isletmeId === expectedIsletmeId
    && canAccessSources
    && !!snapshot.currentUserId
    && snapshot.canModify('islemler', snapshot.currentUserId)
    && requiredActionModules.every(
      (module) => snapshot.canModify(module, snapshot.currentUserId),
    );
  const reason: TransactionPermissionReason =
    canModifyOwnRecord
    && !!createdBy
    && createdBy !== snapshot.currentUserId
      ? 'ownership'
      : 'permission';

  throw transactionPermissionError(action, reason);
}

type TransactionMutationAction = 'update' | 'delete';

async function fetchTransactionMutationContext(
  isletmeId: string,
  islemId: string,
  action: TransactionMutationAction,
): Promise<TransactionMutationContext> {
  const { data, error } = await supabase.rpc(
    'get_islem_mutation_context_v1',
    {
      p_isletme_id: isletmeId,
      p_islem_id: islemId,
      p_action: action,
    },
  );

  if (error) {
    if (classifyMutationError(error) === 'permission') {
      throw transactionPermissionError(action, 'permission', error);
    }
    throw error;
  }

  return parseTransactionMutationContext(data);
}

function mutationContextToIslem(
  context: TransactionMutationContext,
  isletmeId: string,
): Islem {
  return {
    ...context,
    isletme_id: isletmeId,
    photo_path: null,
    source_ileri_id: null,
    updated_by: null,
    created_at: context.date,
    updated_at: context.date,
  };
}

export function useIslemler(filters?: IslemFilters, enabled: boolean = true) {
  const {
    isletme,
    isletmeLoading,
    user,
    currentPermissions,
  } = useAuthContext();
  const { isOwner } = usePermissions();
  const permissionFingerprint = permissionAccessSignature(currentPermissions);
  const pageSize = Math.max(
    1,
    Math.min(filters?.limit ?? ISLEMLER_PAGE_SIZE, ISLEMLER_PAGE_SIZE),
  );

  const result = useInfiniteQuery({
    queryKey: [
      ...queryKeys.islemler.list(isletme?.id ?? '', filters),
      isOwner ? 'owner' : 'authorized-v1',
      isOwner ? '' : user?.id ?? '',
      isOwner ? '' : permissionFingerprint,
    ],
    queryFn: async ({ pageParam }): Promise<AllTransactionsPage> => {
      if (!isletme) return { rows: [] };

      if (!isOwner) {
        const { data, error } = await supabase.rpc(
          'get_yetkili_islem_satirlari_v1',
          {
            p_isletme_id: isletme.id,
            p_limit: pageSize,
            p_before_date: pageParam.beforeDate,
            p_before_id: pageParam.beforeId,
          },
        );

        if (error) throw error;
        const rawRows = parseAuthorizedTransactionRows(data, isletme.id);
        const rows = rawRows.filter((row) => {
          if (filters?.type && row.type !== filters.type) return false;
          if (
            filters?.hesapId
            && row.hesap_id !== filters.hesapId
            && row.hedef_hesap_id !== filters.hesapId
          ) {
            return false;
          }
          if (filters?.cariId && row.cari_id !== filters.cariId) return false;
          if (
            filters?.personelId
            && row.personel_id !== filters.personelId
          ) {
            return false;
          }
          if (filters?.startDate && row.date < filters.startDate) return false;
          if (filters?.endDate) {
            const end = filters.endDate.includes('T')
              ? filters.endDate
              : `${filters.endDate}T23:59:59`;
            if (row.date > end) return false;
          }
          return true;
        });
        const last = rawRows.at(-1);
        return {
          rows,
          nextPageParam:
            !filters?.limit && rawRows.length === pageSize && last
              ? {
                  page: pageParam.page + 1,
                  beforeDate: last.date,
                  beforeId: last.id,
                }
              : undefined,
        };
      }

      const from = pageParam.page * pageSize;
      const to = from + pageSize - 1;

      let query = supabase
        .from('islemler')
        .select(`
          *,
          hesap:hesaplar!hesap_id(id,name,currency,type,is_active),
          hedef_hesap:hesaplar!hedef_hesap_id(id,name,currency,type,is_active),
          kategori:kategoriler(id,name),
          cari:cariler(id,name,type,currency),
          personel:personel(id,first_name,last_name,currency),
          creator:profiles!islemler_created_by_profiles_fk(display_name)
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
      const rows = data as IslemWithRelations[];
      return {
        rows,
        nextPageParam:
          !filters?.limit && rows.length === pageSize
            ? {
                page: pageParam.page + 1,
                beforeDate: null,
                beforeId: null,
              }
            : undefined,
      };
    },
    initialPageParam: {
      page: 0,
      beforeDate: null,
      beforeId: null,
    } as AllTransactionsPageParam,
    getNextPageParam: (lastPage) => lastPage.nextPageParam,
    enabled: enabled && !!isletme,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    meta: {
      persist: isOwner,
      query_purpose: isOwner
        ? 'islemler:list'
        : 'islemler:authorized-list-v1',
    },
  });

  // isletme henüz yükleniyorsa loading olarak göster
  return {
    ...result,
    data: dedupeAuthorizedTransactionRowsById(
      result.data?.pages.flatMap((page) => page.rows) ?? [],
    ),
    isLoading: enabled && (result.isLoading || isletmeLoading),
  };
}

// Tek işlem getir
export function useIslem(id: string | undefined) {
  const {
    isletme,
    user,
    currentPermissions,
  } = useAuthContext();
  const { isOwner } = usePermissions();
  const permissionFingerprint = permissionAccessSignature(currentPermissions);

  return useQuery({
    queryKey: [
      ...queryKeys.islemler.detail(id ?? ''),
      isletme?.id ?? '',
      isOwner ? 'owner' : 'mutation-context-v1',
      isOwner ? '' : user?.id ?? '',
      isOwner ? '' : permissionFingerprint,
    ],
    queryFn: async () => {
      if (!id || !isletme) return null;

      if (!isOwner) {
        const context = await fetchTransactionMutationContext(
          isletme.id,
          id,
          'update',
        );
        return mutationContextToIslem(context, isletme.id);
      }

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
    retry: isOwner ? undefined : false,
    meta: {
      persist: isOwner,
      query_purpose: isOwner
        ? 'islemler:detail'
        : 'islemler:mutation-context',
    },
  });
}

interface UseCreateIslemOptions {
  /**
   * Toplu akışlar tekil başarı yan etkilerini erteleyip bütün seri sonunda bir
   * kez invalidation/telemetri çalıştırır. Varsayılan davranış değişmez.
   */
  deferSuccessEffects?: boolean;
}

export function useCreateIslem(options: UseCreateIslemOptions = {}) {
  const queryClient = useQueryClient();
  const { isletme } = useAuthContext();
  const { canCreate, canAccessModule } = usePermissions();
  const latestCreatePermissionRef = useRef<CreatePermissionSnapshot>({
    isletmeId: isletme?.id ?? null,
    canCreate,
    canAccessModule,
  });
  latestCreatePermissionRef.current = {
    isletmeId: isletme?.id ?? null,
    canCreate,
    canAccessModule,
  };

  return useMutation({
    // Finansal mutation zincirini baştan otomatik tekrarlama. QTB create yolu client UUID ile
    // sessiz-başarı probe'u yapar; diğer çağıranlarda server UUID üretildiği için kör retry
    // "sunucuda commit + cevap kaybı" durumunda mükerrer işlem/bakiye riski taşır.
    retry: false,
    mutationFn: async (input: Omit<IslemInsert, 'isletme_id'>) => {
      if (!isletme) throw new Error(i18n.t('common:errors.businessNotFound'));

      assertCanCreateTransaction(
        input.type,
        isletme.id,
        latestCreatePermissionRef.current,
      );

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
        assertCanCreateTransaction(
          input.type,
          isletme.id,
          latestCreatePermissionRef.current,
        );
        const { data, error } = await supabase.rpc('create_islem_atomik', {
          p_isletme_id: isletme.id,
          p_new_row: input,
          p_balance_ops: ops,
        });
        __timing.rpc_ms = Date.now() - __tRpc;

        if (error) throw error;

        const created = data as Islem;
        if (input.id && !isSameRegularCreate(created, input, isletme.id)) {
          throw new MutationRetryPayloadChangedError();
        }

        __ok = true;
        return created;
      } finally {
        // [GEÇİCİ TEŞHİS] Yalnız yavaş kayıtları logla (normal kayıt <1sn → gürültü yok).
        const __totalMs = Date.now() - __t0;
        // QTB/auth-hang teşhisi yayında çözüldü → prod telemetri yazma; dev'de tut.
        if (__DEV__ && __totalMs > 2000) {
          logEvent('save_timing_debug', { ...__timing, total_ms: __totalMs, ok: __ok });
        }
      }
    },
    onSuccess: (data) => {
      if (options.deferSuccessEffects) return;
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

// Ürünlü CREATE'i TEK atomik RPC'de yap (islem + bakiye + N ürün stok/hareket).
// create_islem_with_urun_atomik zaten prod'da CANLI (QuickUrunBar/toplu-giriş-çıkış kullanıyor);
// QTB alış/satış yolu buraya bağlanınca ürünlü kayıt 2+3N round-trip'ten ~1'e iner → zayıf
// ağda ölü-soket/timeout istiflenmesi ciddi azalır (asıl "kaydet asılması" fix'i). Bakiye ops'u
// useCreateIslem ile AYNI kaynaktan (applyLinkedCariInversion + computeBalanceOps) hesaplanır →
// parite tam. Atomik olduğundan istemci tarafı manuel rollback GEREKMEZ (RPC patlarsa hiçbir
// bacak commit olmaz). p_new_row.id istemciden gelirse idempotent (retry çift kayıt yazmaz).
/**
 * P0-S2 first client slice. This hook is intentionally separate from the legacy
 * create hook so only explicitly migrated, client-UUID-backed normal flows opt in.
 */
export function useCreateIslemV2() {
  const queryClient = useQueryClient();
  const { isletme } = useAuthContext();
  const { canCreate, canAccessModule } = usePermissions();
  const latestCreatePermissionRef = useRef<CreatePermissionSnapshot>({
    isletmeId: isletme?.id ?? null,
    canCreate,
    canAccessModule,
  });
  latestCreatePermissionRef.current = {
    isletmeId: isletme?.id ?? null,
    canCreate,
    canAccessModule,
  };

  return useMutation({
    retry: false,
    mutationFn: async (input: CreateIslemV2Input) => {
      if (!isletme) throw new Error(i18n.t('common:errors.businessNotFound'));
      assertCanCreateTransaction(
        input.type,
        isletme.id,
        latestCreatePermissionRef.current,
      );

      let cariScope: CreateIslemV2CariScope = 'not_applicable';
      if (input.cari_id && isCariType(String(input.type))) {
        const linkInfo = await getLinkedCariInfo(input.cari_id, isletme.id);
        cariScope = !linkInfo
          ? 'unknown'
          : linkInfo.isLinked
            ? 'linked'
            : 'same_tenant';
      }

      const payload = buildCreateIslemV2Payload(input, cariScope);
      if (!payload) {
        const unsupported = new Error('ISLEM_V2_CLIENT_UNSUPPORTED') as Error & {
          code: string;
        };
        unsupported.code = '0A000';
        throw unsupported;
      }

      // Permission may narrow while the same-tenant cari probe is awaiting.
      assertCanCreateTransaction(
        input.type,
        isletme.id,
        latestCreatePermissionRef.current,
      );
      const { data, error } = await supabase.rpc('create_islem_atomik_v2', {
        p_isletme_id: isletme.id,
        p_new_row: payload,
      });

      // Never fall back to V1 after a V2 error. A lost HTTP response may hide a
      // committed V2 write; a fallback would create a second financial transaction.
      if (error) {
        if (classifyMutationError(error) === 'permission') {
          throw transactionPermissionError('create', 'permission', error);
        }
        throw error;
      }

      return parseCreateIslemV2Response(data, isletme.id, String(input.id));
    },
    onSuccess: (data) => {
      invalidateRelatedQueries(queryClient, 'islem');
      logEvent('transaction_created', {
        type: data.type,
        has_cari: !!data.cari_id,
        has_personel: !!data.personel_id,
        has_kategori: !!data.kategori_id,
        write_engine: 'v2',
      });
    },
  });
}

export interface CreateIslemWithUrunItem {
  urun_id: string;
  hareket_tipi: UrunHareketTipi;
  miktar: number;
  birim_fiyat: number;
  kdv_orani: number;
  aciklama?: string | null;
}

export function useCreateIslemWithUrun() {
  const queryClient = useQueryClient();
  const { isletme } = useAuthContext();
  const { canCreate, canAccessModule } = usePermissions();
  const latestCreatePermissionRef = useRef<CreatePermissionSnapshot>({
    isletmeId: isletme?.id ?? null,
    canCreate,
    canAccessModule,
  });
  latestCreatePermissionRef.current = {
    isletmeId: isletme?.id ?? null,
    canCreate,
    canAccessModule,
  };

  return useMutation({
    // Atomik RPC olsa da HTTP cevabı kaybolduğunda mutation'ı körlemesine baştan koşturma;
    // çağıran aynı client id ile kontrollü fallback/probe kararını verir.
    retry: false,
    mutationFn: async ({ input, items }: { input: Omit<IslemInsert, 'isletme_id'>; items: CreateIslemWithUrunItem[] }) => {
      if (!isletme) throw new Error(i18n.t('common:errors.businessNotFound'));
      if (!isProductTransactionType(input.type)) {
        throw transactionPermissionError('create', 'permission');
      }
      assertCanCreateTransaction(
        input.type,
        isletme.id,
        latestCreatePermissionRef.current,
        ['urunler'],
      );

      // Linked-cari inversiyonu + bakiye deltaları: useCreateIslem ile BİREBİR aynı yol.
      const balanceInput = await applyLinkedCariInversion(input, isletme.id);
      const ops = computeBalanceOps(balanceInput);

      assertCanCreateTransaction(
        input.type,
        isletme.id,
        latestCreatePermissionRef.current,
        ['urunler'],
      );
      const { data, error } = await supabase.rpc('create_islem_with_urun_atomik', {
        p_isletme_id: isletme.id,
        p_new_row: input,
        p_balance_ops: ops,
        p_items: normalizeProductMutationItems(items),
      });

      // 42883 (fonksiyon yok) dahil TÜM hatalar yükseltilir. Çağıran fail-closed davranır;
      // ürün/stok etkisini ayrı isteklerle taklit eden non-atomik fallback veri güvenli değildir.
      if (error) throw error;

      const created = data as Islem;
      if (input.id && !isSameRegularCreate(created, input, isletme.id)) {
        throw new MutationRetryPayloadChangedError();
      }

      return created;
    },
    onSuccess: (data) => {
      invalidateRelatedQueries(queryClient, 'islem');
      invalidateRelatedQueries(queryClient, 'urunHareket');
      logEvent('transaction_created', {
        type: data?.type,
        has_cari: !!data?.cari_id,
        has_personel: !!data?.personel_id,
        has_kategori: !!data?.kategori_id,
      });
    },
  });
}

// Faz 3: taksitli satış/alış — 1 işlem + N taksit satırı TEK atomik RPC'de
// (taksit_plani_olustur). Bakiye matematiği useCreateIslem ile BİREBİR aynı
// (computeBalanceOps; satış BİR KEZ satış tarihinde — taksit yalnız tahsilat beklentisi).
// p_new_row.id client'tan gelir → idempotent (retry çift plan yazmaz).
export type TaksitSatiri = InstallmentRpcRow;

export function useCreateIslemTaksitli() {
  const queryClient = useQueryClient();
  const { isletme } = useAuthContext();
  const { canCreate, canAccessModule } = usePermissions();
  const latestCreatePermissionRef = useRef<CreatePermissionSnapshot>({
    isletmeId: isletme?.id ?? null,
    canCreate,
    canAccessModule,
  });
  latestCreatePermissionRef.current = {
    isletmeId: isletme?.id ?? null,
    canCreate,
    canAccessModule,
  };

  return useMutation({
    // Taksit planı finansal write'tır; belirsiz ağ hatasında otomatik tam-zincir retry yapma.
    retry: false,
    mutationFn: async ({ input, taksitler }: { input: Omit<IslemInsert, 'isletme_id'>; taksitler: TaksitSatiri[] }) => {
      if (!isletme) throw new Error(i18n.t('common:errors.businessNotFound'));
      assertCanCreateTransaction(
        input.type,
        isletme.id,
        latestCreatePermissionRef.current,
      );

      const balanceInput = await applyLinkedCariInversion(input, isletme.id);
      const ops = computeBalanceOps(balanceInput);

      assertCanCreateTransaction(
        input.type,
        isletme.id,
        latestCreatePermissionRef.current,
      );
      const { data, error } = await supabase.rpc('taksit_plani_olustur', {
        p_isletme_id: isletme.id,
        p_new_row: input,
        p_balance_ops: ops,
        p_taksitler: taksitler,
      });

      // Yeni özellik: dağıtım-boşluğu fallback'i YOK (eski yol taksit bilmez) —
      // hata olduğu gibi yükselir, atomik olduğundan kısmi state kalmaz.
      if (error) throw error;
      const created = data as Islem;
      if (input.id && !isSameRegularCreate(created, input, isletme.id)) {
        throw new MutationRetryPayloadChangedError();
      }
      return created;
    },
    onSuccess: (data, variables) => {
      invalidateRelatedQueries(queryClient, 'islem');
      logEvent('transaction_created', {
        type: data?.type,
        has_cari: !!data?.cari_id,
        taksitli: true,
        taksit_sayisi: variables.taksitler?.length,
      });
    },
  });
}

// Cari işlem tipi mi kontrol et
function isCariType(type: string): boolean {
  return type.startsWith('cari_');
}

interface LinkedCariInfo {
  isLinked: boolean;
  shouldInvert: boolean;
}

// Linked cari bilgisini getir - viewer mı ve type mismatch var mı?
async function getLinkedCariInfo(
  cariId: string,
  currentIsletmeId: string,
): Promise<LinkedCariInfo | null> {
  // Önce carinin hangi isletmeye ait olduğunu öğren
  const { data: cari, error: cariError } = await supabase
    .from('cariler')
    .select('isletme_id, type')
    .eq('id', cariId)
    .single();

  if (cariError || !cari) return null;

  // Kendi carisi ise inversiyona gerek yok
  if (cari.isletme_id === currentIsletmeId) {
    return { isLinked: false, shouldInvert: false };
  }

  // Linked cari - viewer tarafından oluşturuluyor
  // cari_links'ten viewer_type bilgisini al
  const { data: link, error: linkError } = await supabase
    .from('cari_links')
    .select('viewer_type')
    .eq('cari_id', cariId)
    .eq('viewer_isletme_id', currentIsletmeId)
    .single();

  if (linkError || !link) {
    // The cari row already proves this is a foreign-tenant/viewer path. Keep the
    // V2 route closed even if the secondary link lookup cannot resolve inversion.
    return { isLinked: true, shouldInvert: false };
  }

  // Type mismatch varsa invert gerekli
  const shouldInvert = cari.type !== link.viewer_type;
  return { isLinked: true, shouldInvert };
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

// Cari işlemleri (kategori bilgisi dahil) - infinite scroll
// asViewer=true: bağlantılı cari'yi GÖRÜNTÜLEYEN işletme için. Kendi isletme_id filtresi
// UYGULANMAZ; bunun yerine RLS (view_linked_islemler) erişimi yalnız bağlı cari'nin
// işlemleriyle sınırlar → sahibin işlemleri güvenle görünür, başka veri sızmaz.
// asViewer=false (varsayılan): sahip/normal akış — davranış birebir aynı.
export function useIslemlerByCari(cariId: string, asViewer = false) {
  const { isletme, user } = useAuthContext();
  const {
    canAccessModule,
    canSeeAllUsersData,
    isOwner,
  } = usePermissions();
  const canSeeCariler = canAccessModule('cariler');
  const isSharedNonViewer = !isOwner && !asViewer;
  const useSharedProjection = isSharedNonViewer && canSeeCariler;
  const queryKey = isSharedNonViewer
    ? queryKeys.islemler.cariProjection(
      isletme?.id ?? '',
      cariId,
      user?.id ?? '',
      canSeeAllUsersData,
    )
    : [
      ...queryKeys.islemler.byCari(cariId, isletme?.id ?? ''),
      asViewer ? 'viewer' : 'owner',
    ] as const;

  const result = useInfiniteQuery({
    queryKey,
    queryFn: async ({
      pageParam = 0 as number | CariIslemCursor,
    }): Promise<CariIslemListRow[]> => {
      if (!isletme || !cariId) return [];

      if (useSharedProjection) {
        const cursor =
          typeof pageParam === 'number' ? null : pageParam;
        const { data, error } = await supabase.rpc(
          'get_cari_islem_satirlari_v1',
          {
            p_isletme_id: isletme.id,
            p_cari_id: cariId,
            p_limit: ISLEMLER_PAGE_SIZE,
            p_before_date: cursor?.date ?? null,
            p_before_created_at: cursor?.created_at ?? null,
            p_before_id: cursor?.id ?? null,
          },
        );

        if (error) throw error;
        return parseCariIslemListRows(data);
      }

      // Cariler modulu kapali shared kullanici disabled sorgunun queryFn'ini
      // manuel tetiklese bile eski genis SELECT yoluna dusmez.
      if (isSharedNonViewer) return [];

      const pageIndex = typeof pageParam === 'number' ? pageParam : 0;
      const from = pageIndex * ISLEMLER_PAGE_SIZE;
      const to = from + ISLEMLER_PAGE_SIZE - 1;

      let query = supabase
        .from('islemler')
        .select(`
          *,
          kategori:kategoriler(id,name),
          hesap:hesaplar!hesap_id(id,name,currency,type,is_active),
          creator:profiles!islemler_created_by_profiles_fk(display_name)
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
      return parseCariIslemListRows(data);
    },
    initialPageParam: 0 as number | CariIslemCursor,
    getNextPageParam: (lastPage, _allPages, lastPageParam) => {
      if (!lastPage || lastPage.length < ISLEMLER_PAGE_SIZE) return undefined;
      if (useSharedProjection) {
        const lastRow = lastPage[lastPage.length - 1];
        return {
          date: lastRow.date,
          created_at: lastRow.created_at,
          id: lastRow.id,
        } satisfies CariIslemCursor;
      }
      return typeof lastPageParam === 'number' ? lastPageParam + 1 : 1;
    },
    enabled:
      !!isletme
      && !!cariId
      && (
        !isSharedNonViewer
        || (canSeeCariler && !!user?.id)
      ),
    meta: isSharedNonViewer
      ? {
        persist: false,
        query_purpose: 'islemler:cari-projection-v1',
      }
      : undefined,
  });

  return {
    ...result,
    data:
      !isSharedNonViewer || canSeeCariler
        ? result.data?.pages.flat() ?? []
        : [],
  };
}

// Hesap işlemleri (kategori bilgisi dahil) - infinite scroll
export function useIslemlerByHesap(hesapId: string) {
  const {
    isletme,
    user,
    currentPermissions,
  } = useAuthContext();
  const {
    canAccessModule,
    isOwner,
  } = usePermissions();
  const canSeeHesaplar = canAccessModule('hesaplar');
  const isShared = !isOwner;
  const useSharedProjection = isShared && canSeeHesaplar;
  const permissionFingerprint = permissionAccessSignature(
    currentPermissions,
  );
  const queryKey = isShared
    ? queryKeys.islemler.hesapProjection(
      isletme?.id ?? '',
      hesapId,
      user?.id ?? '',
      permissionFingerprint,
    )
    : queryKeys.islemler.byHesap(hesapId, isletme?.id ?? '');

  const result = useInfiniteQuery({
    queryKey,
    queryFn: async ({
      pageParam = 0 as number | HesapIslemCursor,
    }): Promise<Array<IslemWithRelations | HesapIslemListRow>> => {
      if (!isletme || !hesapId) return [];

      if (useSharedProjection) {
        const cursor =
          typeof pageParam === 'number' ? null : pageParam;
        const { data, error } = await supabase.rpc(
          'get_hesap_islem_satirlari_v1',
          {
            p_isletme_id: isletme.id,
            p_hesap_id: hesapId,
            p_limit: ISLEMLER_PAGE_SIZE,
            p_before_date: cursor?.date ?? null,
            p_before_created_at: cursor?.created_at ?? null,
            p_before_id: cursor?.id ?? null,
          },
        );

        if (error) throw error;
        return parseHesapIslemListRows(data);
      }

      // Hesaplar modulu kapali shared kullanici disabled sorguyu manuel
      // tetiklese bile owner'in genis SELECT yoluna dusemez.
      if (isShared) return [];

      const pageIndex = typeof pageParam === 'number' ? pageParam : 0;
      const from = pageIndex * ISLEMLER_PAGE_SIZE;
      const to = from + ISLEMLER_PAGE_SIZE - 1;

      const { data, error } = await supabase
        .from('islemler')
        .select(`
          *,
          kategori:kategoriler(id,name),
          hesap:hesaplar!islemler_hesap_id_fkey(id,name,currency,type,is_active),
          hedef_hesap:hesaplar!islemler_hedef_hesap_id_fkey(id,name,currency,type,is_active),
          cari:cariler(id,name,type,currency),
          personel:personel(id,first_name,last_name,currency),
          creator:profiles!islemler_created_by_profiles_fk(display_name)
        `)
        .eq('isletme_id', isletme.id)
        .or(`hesap_id.eq.${hesapId},hedef_hesap_id.eq.${hesapId}`)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(from, to);

      if (error) throw error;
      return data as IslemWithRelations[];
    },
    initialPageParam: 0 as number | HesapIslemCursor,
    getNextPageParam: (lastPage, _allPages, lastPageParam) => {
      if (!lastPage || lastPage.length < ISLEMLER_PAGE_SIZE) return undefined;
      if (useSharedProjection) {
        const lastRow = lastPage[lastPage.length - 1];
        return {
          date: lastRow.date,
          created_at: lastRow.created_at,
          id: lastRow.id,
        } satisfies HesapIslemCursor;
      }
      return typeof lastPageParam === 'number' ? lastPageParam + 1 : 1;
    },
    enabled:
      !!isletme
      && !!hesapId
      && (
        !isShared
        || (canSeeHesaplar && !!user?.id)
      ),
    meta: isShared
      ? {
        persist: false,
        query_purpose: 'islemler:hesap-projection-v1',
      }
      : undefined,
  });

  const mergedRows = useMemo(() => {
    const rows = result.data?.pages.flat() ?? [];
    if (!useSharedProjection) return rows;

    // Keyset cursor normalde tekrar uretmez; yine de refetch/page yarisi veya
    // server retry ayni ID'yi iki sayfaya tasirsa UI'da cift satir olusturma.
    return dedupeHesapIslemRowsById(rows);
  }, [result.data, useSharedProjection]);

  return {
    ...result,
    data:
      !isShared || canSeeHesaplar
        ? mergedRows
        : [],
  };
}

// Personel işlemleri (kategori bilgisi dahil) - infinite scroll
export function useIslemlerByPersonel(personelId: string) {
  const {
    isletme,
    user,
    currentPermissions,
  } = useAuthContext();
  const {
    canAccessModule,
    isOwner,
  } = usePermissions();
  const canSeePersonel = canAccessModule('personel');
  const isShared = !isOwner;
  const useSharedProjection = isShared && canSeePersonel;
  const permissionFingerprint = permissionAccessSignature(
    currentPermissions,
  );
  const queryKey = isShared
    ? queryKeys.islemler.personelProjection(
      isletme?.id ?? '',
      personelId,
      user?.id ?? '',
      permissionFingerprint,
      'paged',
    )
    : queryKeys.islemler.byPersonel(personelId, isletme?.id ?? '');

  const result = useInfiniteQuery({
    queryKey,
    queryFn: async ({
      pageParam = 0 as number | PersonelIslemCursor,
    }): Promise<PersonelTransactionRow[]> => {
      if (!isletme || !personelId) return [];

      if (useSharedProjection) {
        const cursor =
          typeof pageParam === 'number' ? null : pageParam;
        const { data, error } = await supabase.rpc(
          'get_personel_islem_satirlari_v1',
          {
            p_isletme_id: isletme.id,
            p_personel_id: personelId,
            p_limit: ISLEMLER_PAGE_SIZE,
            p_before_date: cursor?.date ?? null,
            p_before_created_at: cursor?.created_at ?? null,
            p_before_id: cursor?.id ?? null,
          },
        );

        if (error) throw error;
        return parsePersonelIslemListRows(data);
      }

      // Personel modulu kapali shared kullanici disabled sorguyu manuel
      // tetiklese bile owner'in genis SELECT yoluna dusemez.
      if (isShared) return [];

      const pageIndex = typeof pageParam === 'number' ? pageParam : 0;
      const from = pageIndex * ISLEMLER_PAGE_SIZE;
      const to = from + ISLEMLER_PAGE_SIZE - 1;

      const { data, error } = await supabase
        .from('islemler')
        .select(`
          *,
          kategori:kategoriler(id,name),
          hesap:hesaplar!hesap_id(id,name,currency,type,is_active),
          creator:profiles!islemler_created_by_profiles_fk(display_name)
        `)
        .eq('isletme_id', isletme.id)
        .eq('personel_id', personelId)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(from, to);

      if (error) throw error;
      return data as IslemWithRelations[];
    },
    initialPageParam: 0 as number | PersonelIslemCursor,
    getNextPageParam: (lastPage, _allPages, lastPageParam) => {
      if (!lastPage || lastPage.length < ISLEMLER_PAGE_SIZE) return undefined;
      if (useSharedProjection) {
        const lastRow = lastPage[lastPage.length - 1];
        return {
          date: lastRow.date,
          created_at: lastRow.created_at,
          id: lastRow.id,
        } satisfies PersonelIslemCursor;
      }
      return typeof lastPageParam === 'number' ? lastPageParam + 1 : 1;
    },
    enabled:
      !!isletme
      && !!personelId
      && (
        !isShared
        || (canSeePersonel && !!user?.id)
      ),
    meta: isShared
      ? {
        persist: false,
        query_purpose: 'islemler:personel-projection-v1',
      }
      : undefined,
  });

  const mergedRows = useMemo(() => {
    const rows = result.data?.pages.flat() ?? [];
    if (!useSharedProjection) return rows;
    return dedupePersonelIslemRowsById(rows);
  }, [result.data, useSharedProjection]);
  const hasUnsafeQueryState = result.isError || result.isRefetchError;

  return {
    ...result,
    data:
      (
        !isShared
        || canSeePersonel
      )
      && !hasUnsafeQueryState
        ? mergedRows
        : [],
  };
}

// Personel işlemleri - rapor için tüm işlemler (pagination yok)
export function useAllIslemlerByPersonel(
  personelId: string,
  allowReportAccess: boolean = false,
) {
  const {
    isletme,
    user,
    currentPermissions,
  } = useAuthContext();
  const { canAccessModule, isOwner } = usePermissions();
  const canSeePersonel = canAccessModule('personel');
  const canReadPersonel =
    canSeePersonel
    || (allowReportAccess && canAccessModule('raporlar'));
  const isShared = !isOwner;
  const permissionFingerprint = permissionAccessSignature(
    currentPermissions,
  );
  const queryKey = isShared
    ? queryKeys.islemler.personelProjection(
      isletme?.id ?? '',
      personelId,
      user?.id ?? '',
      permissionFingerprint,
      'all',
    )
    : queryKeys.islemler.allByPersonel(
      personelId,
      isletme?.id ?? '',
    );

  const result = useQuery({
    queryKey,
    queryFn: async (): Promise<PersonelTransactionRow[]> => {
      if (!canReadPersonel || !isletme || !personelId) return [];

      if (isShared) {
        return fetchAllPersonelProjectionPages(
          isletme.id,
          personelId,
        );
      }

      const data = await fetchAllPages<IslemWithRelations>(() => supabase
        .from('islemler')
        .select(`
          *,
          kategori:kategoriler(id,name),
          hesap:hesaplar!hesap_id(id,name,currency,type,is_active),
          creator:profiles!islemler_created_by_profiles_fk(display_name)
        `)
        .eq('isletme_id', isletme.id)
        .eq('personel_id', personelId)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
      );
      return data;
    },
    enabled:
      canReadPersonel
      && !!isletme
      && !!personelId
      && (!isShared || !!user?.id),
    meta: isShared
      ? {
        persist: false,
        query_purpose: 'islemler:personel-projection-v1-all',
      }
      : {
        persist: true,
        query_purpose: 'islemler:all-by-personel',
      },
  });

  const hasUnsafeQueryState = result.isError || result.isRefetchError;
  return {
    ...result,
    data:
      canReadPersonel && !hasUnsafeQueryState
        ? result.data ?? []
        : [],
  };
}

// Personel İZİN işlemleri - izin geçmişi için (type-filtreli, pagination yok).
// Sadece izin satırları çekilir (düşük egress); tüm izin geçmişi eksiksiz gelir.
export function useAllLeaveByPersonel(personelId: string) {
  const {
    isletme,
    user,
    currentPermissions,
  } = useAuthContext();
  const { canAccessModule, isOwner } = usePermissions();
  const canSeePersonel = canAccessModule('personel');
  const isShared = !isOwner;
  const permissionFingerprint = permissionAccessSignature(
    currentPermissions,
  );
  const queryKey = isShared
    ? queryKeys.islemler.personelProjection(
      isletme?.id ?? '',
      personelId,
      user?.id ?? '',
      permissionFingerprint,
      'leave',
    )
    : queryKeys.islemler.allLeaveByPersonel(
      personelId,
      isletme?.id ?? '',
    );

  const result = useQuery({
    queryKey,
    queryFn: async (): Promise<PersonelTransactionRow[]> => {
      if (!canSeePersonel || !isletme || !personelId) return [];

      if (isShared) {
        const rows = await fetchAllPersonelProjectionPages(
          isletme.id,
          personelId,
        );
        return rows.filter((row) => isLeaveType(row.type));
      }

      const data = await fetchAllPages<IslemWithRelations>(() => supabase
        .from('islemler')
        .select(`
          *,
          kategori:kategoriler(id,name),
          hesap:hesaplar!hesap_id(id,name,currency,type,is_active),
          creator:profiles!islemler_created_by_profiles_fk(display_name)
        `)
        .eq('isletme_id', isletme.id)
        .eq('personel_id', personelId)
        .in('type', LEAVE_TYPES)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
      );
      return data;
    },
    enabled:
      canSeePersonel
      && !!isletme
      && !!personelId
      && (!isShared || !!user?.id),
    meta: isShared
      ? {
        persist: false,
        query_purpose: 'islemler:personel-projection-v1-leave',
      }
      : {
        persist: true,
        query_purpose: 'islemler:all-leave-by-personel',
      },
  });

  const hasUnsafeQueryState = result.isError || result.isRefetchError;
  return {
    ...result,
    data:
      canSeePersonel && !hasUnsafeQueryState
        ? result.data ?? []
        : [],
  };
}

// Cari işlemleri - rapor için tüm işlemler (pagination yok)
// enabled=false: mutabakat raporu snapshot alındıktan sonra kuyruktan eklenen her
// işlemin invalidation'ı tüm geçmişi yeniden indirmesin diye kapatılabilir.
export function useAllIslemlerByCari(
  cariId: string,
  enabled: boolean = true,
  allowReportAccess: boolean = false,
) {
  const { isletme, user } = useAuthContext();
  const {
    canAccessModule,
    canSeeAllUsersData,
    isOwner,
  } = usePermissions();
  const canSeeCariler = canAccessModule('cariler');
  const canReadCariler =
    canSeeCariler
    || (allowReportAccess && canAccessModule('raporlar'));
  const isShared = !isOwner;
  const queryKey = isShared
    ? [
        ...queryKeys.islemler.cariProjection(
          isletme?.id ?? '',
          cariId,
          user?.id ?? '',
          canSeeAllUsersData,
        ),
        'all',
        'report-access',
        allowReportAccess,
      ] as const
    : [
        ...queryKeys.islemler.allByCari(
          cariId,
          isletme?.id ?? '',
        ),
        'owner',
      ] as const;

  const result = useQuery({
    queryKey,
    queryFn: async (): Promise<CariTransactionRow[]> => {
      if (!canReadCariler || !isletme || !cariId) return [];

      if (isShared) {
        return fetchAllCariProjectionPages(isletme.id, cariId);
      }

      const data = await fetchAllPages<IslemWithRelations>(() => supabase
        .from('islemler')
        .select(`
          *,
          kategori:kategoriler(id,name),
          hesap:hesaplar!hesap_id(id,name,currency,type,is_active),
          creator:profiles!islemler_created_by_profiles_fk(display_name)
        `)
        .eq('isletme_id', isletme.id)
        .eq('cari_id', cariId)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false })
      );
      return data;
    },
    enabled:
      canReadCariler
      && !!isletme
      && !!cariId
      && enabled
      && (!isShared || !!user?.id),
    meta: isShared
      ? {
          persist: false,
          query_purpose: 'islemler:cari-projection-v1-all',
        }
      : {
          persist: true,
          query_purpose: 'islemler:all-by-cari',
        },
  });

  const hasUnsafeQueryState = result.isError || result.isRefetchError;
  return {
    ...result,
    data:
      canReadCariler && !hasUnsafeQueryState
        ? result.data ?? []
        : [],
  };
}

// İşlem güncelleme - transaction güvenliği ile
export function useUpdateIslem() {
  const queryClient = useQueryClient();
  const { isletme, user } = useAuthContext();
  const { canUpdate, canAccessModule, isOwner } = usePermissions();
  const latestUpdatePermissionRef = useRef<ModifyPermissionSnapshot>({
    isletmeId: isletme?.id ?? null,
    currentUserId: user?.id ?? null,
    isOwner,
    canModify: canUpdate,
    canAccessModule,
  });
  latestUpdatePermissionRef.current = {
    isletmeId: isletme?.id ?? null,
    currentUserId: user?.id ?? null,
    isOwner,
    canModify: canUpdate,
    canAccessModule,
  };

  return useMutation({
    // SELECT(old) + linked-cari kontrolleri + atomik RPC'nin tamamını ağ hatasında baştan
    // koşturmak 15 sn timeout turlarını katlıyor. Retry kararı üst akışta doğrulanarak verilmeli.
    retry: false,
    mutationFn: async ({
      id,
      updates,
      productItems,
    }: {
      id: string;
      updates: Partial<Omit<IslemInsert, 'isletme_id'>>;
      /**
       * Yalnız Cari+Ürün shared V3. Boş dizi mevcut kalemlerin tamamını kaldırır;
       * undefined non-product V2 yoludur.
       */
      productItems?: CariProductMutationItem[];
    }) => {
      if (!isletme) throw new Error(i18n.t('common:errors.businessNotFound'));

      const useServerDerivedMutation =
        !latestUpdatePermissionRef.current.isOwner
        || productItems !== undefined;
      if (useServerDerivedMutation) {
        const context = await fetchTransactionMutationContext(
          isletme.id,
          id,
          'update',
        );
        const permissionSnapshot = latestUpdatePermissionRef.current;
        const updatedType = updates.type ?? context.type;
        const oldTypeSupportsProductV3 =
          supportsSharedProductMutationV3(context.type);
        const updatedTypeSupportsProductV3 =
          supportsSharedProductMutationV3(updatedType);
        const removesAllProductItems =
          productItems !== undefined && productItems.length === 0;
        if (
          productItems !== undefined
          && (
            (
              !oldTypeSupportsProductV3
              && !updatedTypeSupportsProductV3
            )
            || (
              !updatedTypeSupportsProductV3
              && !removesAllProductItems
            )
          )
        ) {
          throw new SharedTransactionMutationUnsupportedError();
        }
        assertCanModifyTransaction(
          'update',
          [context.type, updatedType],
          context.created_by,
          isletme.id,
          permissionSnapshot,
          productItems !== undefined ? ['urunler'] : [],
          productItems !== undefined ? ['urunler'] : [],
        );

        const patch = buildSharedTransactionMutationPatch(context, updates);
        const { data, error } = productItems !== undefined
          ? await supabase.rpc(
              'update_cari_urunlu_islem_atomik_v3',
              {
                p_isletme_id: isletme.id,
                p_islem_id: id,
                p_patch: patch,
                p_items: normalizeProductMutationItems(productItems),
              },
            )
          : await supabase.rpc(
              'update_islem_atomik_v2',
              {
                p_isletme_id: isletme.id,
                p_islem_id: id,
                p_patch: patch,
              },
            );

        if (error) {
          if (classifyMutationError(error) === 'permission') {
            throw transactionPermissionError('update', 'permission', error);
          }
          throw error;
        }

        return mutationContextToIslem(
          parseTransactionMutationContext(data),
          isletme.id,
        );
      }

      // Önce mevcut işlemi al
      const { data: oldIslem, error: fetchError } = await supabase
        .from('islemler')
        .select('*')
        .eq('id', id)
        .eq('isletme_id', isletme.id)
        .single();

      if (fetchError?.code === 'PGRST116') {
        throw new Error(i18n.t('common:errors.transactionNotFound'));
      }
      if (fetchError) throw fetchError;
      if (!oldIslem) throw new Error(i18n.t('common:errors.transactionNotFound'));

      const createdBy = oldIslem.created_by ?? null;
      const updatedType = updates.type ?? oldIslem.type;
      const transactionTypes = [oldIslem.type, updatedType] as const;
      assertCanModifyTransaction(
        'update',
        transactionTypes,
        createdBy,
        isletme.id,
        latestUpdatePermissionRef.current,
      );

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

      assertCanModifyTransaction(
        'update',
        transactionTypes,
        createdBy,
        isletme.id,
        latestUpdatePermissionRef.current,
      );
      const { data, error } = await supabase.rpc('update_islem_atomik', {
        p_isletme_id: isletme.id,
        p_islem_id: id,
        p_balance_ops: netOps,
        p_new_row: mergedRow,
      });

      if (error) {
        if (classifyMutationError(error) === 'permission') {
          // RPC'nin 42501'i sahiplik ile genel yetki reddini tek başına ayıramaz.
          // Yerel preflight sahiplik durumunu yukarıda typed error'a çevirdi; burada
          // TOCTOU/rol değişimi için güvenli genel permission fallback'i kullanılır.
          throw transactionPermissionError('update', 'permission', error);
        }
        throw error;
      }

      return data as Islem;
    },
    onSuccess: (_data, variables) => {
      invalidateRelatedQueries(queryClient, 'islem');
      if (variables.productItems !== undefined) {
        invalidateRelatedQueries(queryClient, 'urunHareket');
      }
    },
  });
}

// İşlem silme - önce bakiyeleri geri al, sonra sil (transaction güvenliği)
export function useDeleteIslem() {
  const queryClient = useQueryClient();
  const { isletme, user } = useAuthContext();
  const { canDelete, canAccessModule, isOwner } = usePermissions();
  const latestDeletePermissionRef = useRef<ModifyPermissionSnapshot>({
    isletmeId: isletme?.id ?? null,
    currentUserId: user?.id ?? null,
    isOwner,
    canModify: canDelete,
    canAccessModule,
  });
  latestDeletePermissionRef.current = {
    isletmeId: isletme?.id ?? null,
    currentUserId: user?.id ?? null,
    isOwner,
    canModify: canDelete,
    canAccessModule,
  };

  return useMutation({
    // Silme cevabı kaybolduktan sonra ikinci deneme "kayıt bulunamadı" üretir; kör retry yerine
    // çağıranın güncel durumu doğrulaması gerekir.
    retry: false,
    mutationFn: async (
      input: string | {
        id: string;
        useCariProductV3?: boolean;
      },
    ) => {
      const id = typeof input === 'string' ? input : input.id;
      const useCariProductV3 =
        typeof input === 'string' ? false : input.useCariProductV3 === true;
      if (!isletme) throw new Error(i18n.t('common:errors.businessNotFound'));

      const useSharedMutation = !latestDeletePermissionRef.current.isOwner;
      if (useSharedMutation) {
        const context = await fetchTransactionMutationContext(
          isletme.id,
          id,
          'delete',
        );
        const permissionSnapshot = latestDeletePermissionRef.current;
        assertCanModifyTransaction(
          'delete',
          [context.type],
          context.created_by,
          isletme.id,
          permissionSnapshot,
          useCariProductV3 ? ['urunler'] : [],
          useCariProductV3 ? ['urunler'] : [],
        );

        if (
          useCariProductV3
          && !supportsSharedProductMutationV3(context.type)
        ) {
          throw new SharedTransactionMutationUnsupportedError();
        }

        const { error } = useCariProductV3
          ? await supabase.rpc(
              'delete_cari_urunlu_islem_atomik_v3',
              {
                p_isletme_id: isletme.id,
                p_islem_id: id,
              },
            )
          : await supabase.rpc(
              'delete_islem_atomik_v2',
              {
                p_isletme_id: isletme.id,
                p_islem_id: id,
              },
            );

        if (error) {
          if (classifyMutationError(error) === 'permission') {
            throw transactionPermissionError('delete', 'permission', error);
          }
          throw error;
        }
        return;
      }

      // Önce işlemi al (bakiye geri almak için) - ownership kontrolü ile
      const { data: islem, error: fetchError } = await supabase
        .from('islemler')
        .select('*')
        .eq('id', id)
        .eq('isletme_id', isletme.id)
        .single();

      if (fetchError?.code === 'PGRST116') {
        throw new Error(i18n.t('common:errors.transactionNotFound'));
      }
      if (fetchError) throw fetchError;
      if (!islem) throw new Error(i18n.t('common:errors.transactionNotFound'));

      const createdBy = islem.created_by ?? null;
      const transactionTypes = [islem.type] as const;
      assertCanModifyTransaction(
        'delete',
        transactionTypes,
        createdBy,
        isletme.id,
        latestDeletePermissionRef.current,
      );

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

      assertCanModifyTransaction(
        'delete',
        transactionTypes,
        createdBy,
        isletme.id,
        latestDeletePermissionRef.current,
      );
      const { error: delError } = await supabase.rpc('delete_islem_atomik', {
        p_isletme_id: isletme.id,
        p_islem_id: id,
        p_balance_ops: reverseOps,
      });

      if (delError) {
        if (classifyMutationError(delError) === 'permission') {
          throw transactionPermissionError('delete', 'permission', delError);
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
  customRange?: { startDate: string; endDate: string },
  enabled: boolean = true,
) {
  const { isletme } = useAuthContext();
  const { canAccessModule } = usePermissions();
  const reportsEnabled = enabled && canAccessModule('raporlar');
  const { currency: baseCurrency } = useSettings();
  const { data: exchangeRatesData } = useExchangeRates();
  const rates = exchangeRatesData?.rates;

  const { startDate, endDate, label } = getPeriodDateRange(period, offset, customRange);

  // Tarih aralığını normalize et (gün sonuna kadar dahil etmek için)
  const { startDateTime, endDateTime } = normalizeDateRange(startDate, endDate);

  const query = useQuery({
    queryKey: queryKeys.reports.monthSummary(isletme?.id ?? '', period, offset, startDate, endDate),
    queryFn: async () => {
      if (!reportsEnabled || !isletme) return { income: 0, expense: 0 };

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
    enabled: reportsEnabled && !!isletme,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });

  // RPC sonucu TRY cinsindendir; ana para birimine çevir (dashboard'ın geri kalanıyla tutarlı).
  // Kur yoksa TRY değeri korunur (sessiz 1:1 yerine mevcut değeri gösterir).
  const convertedData = useMemo(() => {
    // Yetki sonradan daraltılırsa disabled query eski memory/disk verisini
    // tutabilir. Kartın gizlenmesine güvenmeden cached özeti de fail-closed yap.
    if (!reportsEnabled) return undefined;
    const raw = query.data;
    if (!raw) return raw;
    if (baseCurrency === 'TRY') return raw;
    const income = convertCurrency(raw.income, 'TRY', baseCurrency, rates);
    const expense = convertCurrency(raw.expense, 'TRY', baseCurrency, rates);
    return {
      income: income === null ? raw.income : roundCurrency(income),
      expense: expense === null ? raw.expense : roundCurrency(expense),
    };
  }, [reportsEnabled, query.data, baseCurrency, rates]);

  return {
    ...query,
    data: convertedData,
    periodLabel: label,
  };
}

// İşlem notlarında arama (description alanında server-side ilike)
export function useSearchIslemler(searchQuery: string) {
  return useFilteredIslemler({
    searchQuery,
    enabled: true,
  });
}

interface IslemFilterSearchParams {
  searchQuery?: string;
  minAmount?: number | null;
  maxAmount?: number | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  enabled?: boolean;
}

export function useFilteredIslemler(params: IslemFilterSearchParams) {
  const {
    isletme,
    user,
    currentPermissions,
  } = useAuthContext();
  const { canAccessModule } = usePermissions();
  const canSearchTransactions = canAccessModule('islemler');
  const permissionFingerprint = permissionAccessSignature(
    currentPermissions,
  );
  const q = params.searchQuery?.trim() || '';
  const hasTextQuery = q.length >= 2;
  const hasAmountFilter = params.minAmount != null || params.maxAmount != null;
  const hasDateFilter = !!params.dateFrom || !!params.dateTo;
  const hasAnyFilter = hasTextQuery || hasAmountFilter || hasDateFilter;

  const result = useQuery({
    queryKey: [
      'islemler',
      'authorized-search-v1',
      isletme?.id ?? '',
      user?.id ?? '',
      permissionFingerprint,
      q,
      params.minAmount,
      params.maxAmount,
      params.dateFrom,
      params.dateTo,
    ],
    queryFn: async (): Promise<IslemWithRelations[]> => {
      if (!canSearchTransactions || !isletme || !user?.id) return [];

      const { data, error } = await supabase.rpc(
        'search_yetkili_islem_satirlari_v1',
        {
          p_isletme_id: isletme.id,
          p_search_query: hasTextQuery ? q : null,
          p_min_amount: params.minAmount ?? null,
          p_max_amount: params.maxAmount ?? null,
          p_date_from: params.dateFrom ?? null,
          p_date_to: params.dateTo ?? null,
          p_limit: 50,
        },
      );

      if (error) throw error;
      return parseAuthorizedTransactionRows(data ?? [], isletme.id);
    },
    enabled:
      (params.enabled ?? true)
      && canSearchTransactions
      && !!isletme
      && !!user?.id
      && hasAnyFilter,
    meta: {
      persist: false,
      query_purpose: 'islemler:authorized-search-v1',
    },
  });

  const hasUnsafeQueryState = result.isError || result.isRefetchError;
  return {
    ...result,
    data:
      canSearchTransactions && !hasUnsafeQueryState
        ? result.data ?? []
        : [],
  };
}
