/**
 * General-purpose error message extraction.
 *
 * Replaces `catch (error: any) { ... error.message }` with
 * `catch (error) { ... toErrorMessage(error) }` across the codebase.
 */

const STABLE_SERVER_ERROR_MESSAGE_KEYS = {
  ACCOUNT_HAS_LINKED_RECORDS: 'common:errors.hasLinkedRecords',
  CUSTOMER_HAS_LINKED_RECORDS: 'common:errors.hasLinkedRecords',
  PERSONNEL_HAS_LINKED_RECORDS: 'common:errors.hasLinkedRecords',
  PRODUCT_HAS_LINKED_TRANSACTIONS: 'common:errors.hasLinkedRecords',
  NOTLAR_DIRECT_ENTITY_DETACH_FORBIDDEN:
    'common:errors.noteContextServerManaged',
} as const;

type StableServerErrorToken = keyof typeof STABLE_SERVER_ERROR_MESSAGE_KEYS;
export type StableServerErrorMessageKey =
  (typeof STABLE_SERVER_ERROR_MESSAGE_KEYS)[StableServerErrorToken];

function rawErrorMessage(error: unknown): string | null {
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  if (
    error !== null
    && typeof error === 'object'
    && 'message' in error
    && typeof (error as { message: unknown }).message === 'string'
  ) {
    return (error as { message: string }).message;
  }
  return null;
}

/**
 * PostgreSQL/RPC katmanından gelen kararlı hata token'larını kullanıcı metni
 * anahtarlarına çevirir. Eşleşme kasıtlı olarak tamdır; bilinmeyen server
 * mesajlarını yorumlayıp asıl teşhis bilgisini gizlemeyiz.
 */
export function getStableServerErrorMessageKey(
  error: unknown,
): StableServerErrorMessageKey | null {
  const token = rawErrorMessage(error)?.trim().toUpperCase();
  if (
    !token
    || !(token in STABLE_SERVER_ERROR_MESSAGE_KEYS)
  ) {
    return null;
  }

  return STABLE_SERVER_ERROR_MESSAGE_KEYS[token as StableServerErrorToken];
}

export function toErrorMessage(error: unknown, fallback?: string): string {
  const stableMessageKey = getStableServerErrorMessageKey(error);
  if (stableMessageKey) return i18n.t(stableMessageKey);

  const message = rawErrorMessage(error);
  if (message !== null) return message;
  return fallback ?? 'An unexpected error occurred';
}

export type MutationErrorKind =
  | 'ownership'
  | 'permission'
  | 'validation'
  | 'network_not_sent'
  | 'network_unknown'
  | 'conflict'
  | 'generic';

export type TransactionMutationAction = 'create' | 'update' | 'delete';
export type TransactionPermissionReason = 'ownership' | 'permission';

export const PRODUCT_ATOMIC_WRITE_UNAVAILABLE =
  'PRODUCT_ATOMIC_WRITE_UNAVAILABLE';
export const MUTATION_RETRY_PAYLOAD_CHANGED =
  'MUTATION_RETRY_PAYLOAD_CHANGED';
export const SHARED_TRANSACTION_MUTATION_UNSUPPORTED =
  'ISLEM_MUTATION_V2_FEATURE_UNSUPPORTED';
export const SHARED_TRANSACTION_LINKED_CARI_UNSUPPORTED =
  'ISLEM_MUTATION_V2_LINKED_CARI_UNSUPPORTED';
const SHARED_TRANSACTION_MUTATION_UNSUPPORTED_CODES = [
  SHARED_TRANSACTION_MUTATION_UNSUPPORTED,
  SHARED_TRANSACTION_LINKED_CARI_UNSUPPORTED,
] as const;

export class ProductAtomicWriteUnavailableError extends Error {
  readonly code = PRODUCT_ATOMIC_WRITE_UNAVAILABLE;

  constructor(readonly originalError?: unknown) {
    super('The atomic product transaction endpoint is unavailable');
    this.name = 'ProductAtomicWriteUnavailableError';
  }
}

export class MutationRetryPayloadChangedError extends Error {
  readonly code = MUTATION_RETRY_PAYLOAD_CHANGED;

  constructor() {
    super('Mutation payload changed while reusing an idempotency key');
    this.name = 'MutationRetryPayloadChangedError';
  }
}

export class SharedTransactionMutationUnsupportedError extends Error {
  readonly code = '0A000';

  constructor() {
    super(SHARED_TRANSACTION_MUTATION_UNSUPPORTED);
    this.name = 'SharedTransactionMutationUnsupportedError';
  }
}

import i18n from '@/i18n';

/**
 * Normal işlem RPC'lerinin yetki reddini kodu kaybetmeden UI katmanına taşır.
 *
 * Düz `Error` kullanılırsa Supabase'in kararlı `42501` kodu kaybolur ve üst katman
 * yetki reddini ağ/genel hatadan ayıramaz. `reason=ownership`, istemcinin
 * `edit_own + created_by` bağlamından kesin olarak bildiği dar durumdur; server'dan
 * tek başına gelen 42501 her zaman güvenli `permission` fallback'inde kalır.
 */
export class TransactionPermissionError extends Error {
  readonly code = '42501';

  constructor(
    readonly action: TransactionMutationAction,
    readonly reason: TransactionPermissionReason,
    message: string,
    readonly originalError?: unknown,
  ) {
    super(message);
    this.name = 'TransactionPermissionError';
  }
}

function stringField(error: unknown, key: string): string | null {
  if (
    error !== null
    && typeof error === 'object'
    && key in error
    && typeof (error as Record<string, unknown>)[key] === 'string'
  ) {
    return (error as Record<string, string>)[key];
  }
  return null;
}

function numericField(error: unknown, key: string): number | null {
  if (error === null || typeof error !== 'object' || !(key in error)) return null;
  const raw = (error as Record<string, unknown>)[key];
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string' && raw.trim() !== '') {
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/**
 * Mutation hatalarını programatik karar için sınıflandırır.
 *
 * Öncelik kararlı SQLSTATE/PostgREST/HTTP kodlarındadır. Mesaj eşleşmeleri yalnız
 * eski hook'ların düz `Error` fırlattığı geçiş dönemi için son savunma katmanıdır.
 */
export function classifyMutationError(error: unknown): MutationErrorKind {
  if (error instanceof TransactionPermissionError) return error.reason;

  const stableMessageKey = getStableServerErrorMessageKey(error);
  if (stableMessageKey === 'common:errors.noteContextServerManaged') {
    return 'permission';
  }
  if (stableMessageKey === 'common:errors.hasLinkedRecords') {
    return 'validation';
  }

  const code = stringField(error, 'code')?.toUpperCase() ?? '';
  const status =
    numericField(error, 'status')
    ?? numericField(error, 'statusCode')
    ?? numericField(error, 'httpStatusCode');
  const name =
    error instanceof Error
      ? error.name
      : stringField(error, 'name') ?? '';
  const message = (rawErrorMessage(error) ?? '').toLocaleLowerCase('tr-TR');

  // Önce kararlı SQLSTATE/PostgREST kodları: HTTP status ve serbest metin,
  // örneğin 23514 validation bilgisini ağ/yetki hatasına çevirmemeli.
  if (code === '42501') {
    return 'permission';
  }

  if (
    code === '23505'
    || code === '40001'
    || code === '40P01'
    || code === MUTATION_RETRY_PAYLOAD_CHANGED
  ) {
    return 'conflict';
  }

  if (
    code.startsWith('22')
    || code === '23502'
    || code === '23503'
    || code === '23514'
    || code === 'PGRST100'
    || code === 'PGRST102'
    || code === 'PGRST105'
  ) {
    return 'validation';
  }

  if (status === 403) return 'permission';
  if (status === 409) return 'conflict';

  // Uygulamanın yerel bağlantı kapısı bu TypeError'ı istek gönderilmeden üretir.
  // Sonuç belirsiz değildir; existence probe ile beş saniye daha bekletme.
  if (message.includes('network request skipped because the device is offline')) {
    return 'network_not_sent';
  }

  if (
    code === 'PGRST000'
    || code === 'PGRST001'
    || code === 'PGRST002'
    || code === 'PGRST003'
    || code === '57014'
    || ['ETIMEDOUT', 'ECONNABORTED', 'ECONNRESET', 'FETCH_ERROR'].includes(code)
    || name === 'AbortError'
    || name === 'TimeoutError'
    || (status !== null && status >= 500)
  ) {
    return 'network_unknown';
  }

  // Geçiş dönemi fallback'i: eski hook'lar SQLSTATE'i kaybedip yalnız yerelleştirilmiş
  // düz Error fırlatabiliyor. Bilinmeyen bir server kodunun mesajını yorumlamayız;
  // yeni kod bunun yerine TransactionPermissionError kullanır.
  if (
    !code
    && /permission denied|row-level security|not authorized|yetkiniz yok|yetkiniz bulunmuyor|yetkisiz/.test(message)
  ) {
    return 'permission';
  }

  if (
    !code
    && /network request failed|failed to fetch|load failed|zaman aşımı|timed out|timeout/.test(message)
  ) {
    return 'network_unknown';
  }

  return 'generic';
}

/**
 * Genel CRUD yüzeylerinde Supabase/RLS yetki reddini kullanıcıya doğru metinle
 * göstermek için küçük ortak guard. Yeni kod SQLSTATE 42501'i korur; geçişteki
 * hook'lar ise hâlâ sabit `PERMISSION_DENIED` Error mesajını kullanabiliyor.
 */
export function isPermissionDeniedError(error: unknown): boolean {
  const code = stringField(error, 'code')?.toUpperCase() ?? '';
  const message = (rawErrorMessage(error) ?? '').trim().toUpperCase();

  if (code === '42501' || code === 'PERMISSION_DENIED') return true;
  if (message === 'PERMISSION_DENIED') return true;

  const kind = classifyMutationError(error);
  return kind === 'permission' || kind === 'ownership';
}

/**
 * İşlem mutation'ı için kullanıcıya gösterilecek i18n anahtarını seçer.
 * `null`, çağıranın mevcut genel fallback'ini kullanması gerektiğini belirtir.
 */
export function getTransactionMutationMessageKey(
  error: unknown,
  action: TransactionMutationAction,
): string | null {
  const code = stringField(error, 'code')?.toUpperCase() ?? '';
  const serverMessage = (rawErrorMessage(error) ?? '').toUpperCase();
  // Mevcut taksit RPC'si henüz kararlı bir token yerine P0001 + bu legacy metni
  // döndürüyor. QTB açılış kontrolü atlanırsa genel hata yerine aynı açıklamayı
  // göster; eşleşmeyi mesajın taksit-planı sözleşmesine özgü tam bölümünde tut.
  if (
    serverMessage.includes(
      'TAKSITLI ISLEMIN TUTARI/TIPI/CARISI DEGISTIRILEMEZ; PLANI SILIP YENIDEN OLUSTURUN',
    )
  ) {
    return 'transactions:taksit.editEngel';
  }
  if (code === PRODUCT_ATOMIC_WRITE_UNAVAILABLE) {
    return 'transactions:messages.productAtomicWriteUnavailable';
  }
  if (code === MUTATION_RETRY_PAYLOAD_CHANGED) {
    return 'transactions:messages.retryPayloadChanged';
  }
  if (
    code === '0A000'
    && SHARED_TRANSACTION_MUTATION_UNSUPPORTED_CODES.some(
      (identifier) => serverMessage.includes(identifier),
    )
  ) {
    return 'transactions:permissions.sharedMutationUnsupported';
  }

  const kind = classifyMutationError(error);

  if (kind === 'ownership') {
    return action === 'delete'
      ? 'transactions:permissions.otherUserDeleteDenied'
      : 'transactions:permissions.otherUserUpdateDenied';
  }

  if (kind === 'permission') {
    if (action === 'create') return 'transactions:permissions.createDenied';
    if (action === 'delete') return 'transactions:permissions.deleteDenied';
    return 'transactions:permissions.updateDenied';
  }

  if (kind === 'network_not_sent') {
    return action === 'delete'
      ? 'transactions:messages.deleteNotSent'
      : 'transactions:messages.saveNotLanded';
  }

  if (kind === 'network_unknown') {
    return action === 'delete'
      ? 'transactions:messages.deleteOutcomeUnknown'
      : 'transactions:messages.saveOutcomeUnknown';
  }

  if (kind === 'conflict') return 'transactions:messages.changeConflict';
  if (kind === 'validation') return 'transactions:messages.invalidMutationData';

  return null;
}

interface TransactionActionDenialOptions {
  createdBy: string | null | undefined;
  currentUserId: string | null | undefined;
  canActOnOwnRecord: boolean;
  canActOnRecord: boolean;
  /** Ham referans doğrulaması tamamlanana kadar editörün owner-only kaldığı yüzey. */
  ownerOnlyRestriction?: boolean;
}

/**
 * Editor açılmadan yapılan istemci preflight'ında doğru ve dürüst mesajı seçer.
 * Sahiplik metni yalnız kullanıcının kendi kaydında aksiyon yetkisi varken başka
 * creator satırında reddedildiği kesin durumda kullanılır.
 */
export function getTransactionActionDeniedMessageKey(
  action: Exclude<TransactionMutationAction, 'create'>,
  {
    createdBy,
    currentUserId,
    canActOnOwnRecord,
    canActOnRecord,
    ownerOnlyRestriction = false,
  }: TransactionActionDenialOptions,
): string {
  if (!canActOnRecord) {
    if (
      canActOnOwnRecord
      && !!createdBy
      && !!currentUserId
      && createdBy !== currentUserId
    ) {
      return action === 'delete'
        ? 'transactions:permissions.otherUserDeleteDenied'
        : 'transactions:permissions.otherUserUpdateDenied';
    }

    return action === 'delete'
      ? 'transactions:permissions.deleteDenied'
      : 'transactions:permissions.updateDenied';
  }

  if (ownerOnlyRestriction) {
    return 'transactions:permissions.ownerOnlyEdit';
  }

  return action === 'delete'
    ? 'transactions:permissions.deleteDenied'
    : 'transactions:permissions.updateDenied';
}

/**
 * Error thrown when trying to delete an entity that has linked records
 * (transactions, scheduled transactions, cheques, etc.).
 * UI components can check `instanceof LinkedRecordsError` to show
 * a "Cannot Delete" title instead of a generic "Error" title.
 */
export class LinkedRecordsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LinkedRecordsError';
  }
}

/**
 * Type guard to check if an error is a LinkedRecordsError.
 */
export function isLinkedRecordsError(error: unknown): error is LinkedRecordsError {
  return error instanceof LinkedRecordsError;
}
